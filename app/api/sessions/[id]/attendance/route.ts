import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type AttendanceStatus = 'present' | 'absent' | 'late'
type AttendanceRecord = { student_id: string; status: AttendanceStatus }

const VALID_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late']

// ─── POST /api/sessions/[id]/attendance ──────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  const cookieStore = await cookies()
  const supabase    = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 1. Verify session belongs to this tutor
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('id, student_id, batch_id, session_type')
    .eq('id', sessionId)
    .eq('tutor_id', user.id)
    .single()

  if (sessionErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const typedSession = session as {
    id: string
    student_id: string | null
    batch_id: string | null
    session_type: string | null
  }

  // 2. Build the list of records to upsert
  let records: AttendanceRecord[] = []

  if (Array.isArray(body.records)) {
    // Option B — bulk
    for (const r of body.records as Array<{ student_id?: unknown; status?: unknown }>) {
      if (
        typeof r.student_id !== 'string' ||
        typeof r.status !== 'string' ||
        !VALID_STATUSES.includes(r.status as AttendanceStatus)
      ) {
        return NextResponse.json(
          { error: `Invalid record: ${JSON.stringify(r)}` },
          { status: 400 },
        )
      }
      records.push({ student_id: r.student_id, status: r.status as AttendanceStatus })
    }
    if (records.length === 0) {
      return NextResponse.json({ error: 'records array is empty' }, { status: 400 })
    }
  } else {
    // Option A — individual
    const { student_id, status } = body as { student_id?: unknown; status?: unknown }
    if (typeof student_id !== 'string') {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
    }
    if (typeof status !== 'string' || !VALID_STATUSES.includes(status as AttendanceStatus)) {
      return NextResponse.json(
        { error: 'status must be present | absent | late' },
        { status: 400 },
      )
    }
    records = [{ student_id, status: status as AttendanceStatus }]
  }

  const now = new Date().toISOString()

  // 3. Upsert attendance rows
  const { error: upsertErr } = await supabase
    .from('attendance')
    .upsert(
      records.map(r => ({
        session_id: sessionId,
        student_id: r.student_id,
        tutor_id:   user.id,
        status:     r.status,
        marked_at:  now,
      })),
      { onConflict: 'session_id,student_id' },
    )

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // 4. Check whether all students in this session are now marked
  const { data: allAttendance } = await supabase
    .from('attendance')
    .select('status, student_id')
    .eq('session_id', sessionId)

  const attendanceRows = (allAttendance ?? []) as Array<{ status: string; student_id: string }>
  const allMarked =
    attendanceRows.length > 0 && attendanceRows.every(a => a.status !== 'unknown')

  // For individual sessions: auto-complete when the single student is marked
  // For batch sessions: auto-complete when every enrolled student is marked
  if (allMarked) {
    await supabase
      .from('sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .eq('tutor_id', user.id)
  }

  // 5. At-risk check — fire for any newly absent students
  const absentStudentIds = records.filter(r => r.status === 'absent').map(r => r.student_id)

  for (const studentId of absentStudentIds) {
    // Fetch last 5 attendance records for this student (most recent first)
    const { data: recentRows } = await supabase
      .from('attendance')
      .select('status, marked_at')
      .eq('student_id', studentId)
      .eq('tutor_id', user.id)
      .not('status', 'eq', 'unknown')
      .order('marked_at', { ascending: false })
      .limit(5)

    const recent = (recentRows ?? []) as Array<{ status: string }>

    // Count consecutive absences from the most recent record
    let consecutiveAbsences = 0
    for (const row of recent) {
      if (row.status === 'absent') {
        consecutiveAbsences++
      } else {
        break
      }
    }

    if (consecutiveAbsences >= 3) {
      const { data: studentRow } = await supabase
        .from('students')
        .select('name')
        .eq('id', studentId)
        .single()

      const studentName = (studentRow as { name: string } | null)?.name ?? 'Student'

      try {
        await supabase.from('notifications').insert({
          tutor_id:   user.id,
          type:       'student_at_risk',
          title:      'Student missing classes',
          body:       `${studentName} has missed ${consecutiveAbsences} sessions in a row.`,
          action_url: `/students?id=${studentId}`,
          read:       false,
        })
      } catch {
        // Never let notification inserts break attendance marking
      }
    }
  }

  return NextResponse.json({ success: true, allMarked })
}
