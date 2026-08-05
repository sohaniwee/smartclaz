import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// ─── Types ───────────────────────────────────────────────────────────────────

type RawSession = {
  id: string
  tutor_id: string
  student_id: string | null
  batch_id: string | null
  session_type: string | null
  scheduled_at: string
  duration_mins: number
  status: string
  payment_status: string | null
  zoom_link: string | null
  notes: string | null
  cancelled_reason: string | null
  rescheduled_to: string | null
  created_at: string
}

type AttendanceRecord = {
  id: string
  session_id: string
  student_id: string
  tutor_id: string
  status: string
  marked_at: string | null
  notes: string | null
  created_at: string
}

type RawStudent = {
  id: string
  name: string
  whatsapp: string
  subject: string
  grade: string
  class_type: string
  batch_id: string | null
  monthly_fee: number
  status: string
}

type RawBatch = {
  id: string
  name: string
  subject: string
  grade: string
  schedule_day: string
  schedule_time: string
  monthly_fee: number
  max_students: number
  zoom_meeting_id: string | null
  status: string
}

type RawPayment = {
  id: string
  student_id: string
  session_id: string | null
  status: string
  amount_lkr: number
  month_year: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentMonthYear(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function weekBounds(now: Date): { start: string; end: string } {
  const day = now.getDay() // 0 Sun … 6 Sat
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday.toISOString(), end: sunday.toISOString() }
}

function monthBounds(now: Date): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

function todayDateString(now: Date): string {
  return now.toISOString().slice(0, 10) // YYYY-MM-DD
}

// ─── GET /api/sessions ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase    = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const uid = user.id
  const now = new Date()
  const { searchParams } = new URL(req.url)

  const defaults = weekBounds(now)
  const start    = searchParams.get('start') ?? defaults.start
  const end      = searchParams.get('end')   ?? defaults.end
  const month    = searchParams.get('month') ?? currentMonthYear(now)

  // Derive month window for the stats query
  const [monthYear, monthNum] = [parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)) - 1]
  const monthStart = new Date(monthYear, monthNum, 1).toISOString()
  const monthEnd   = new Date(monthYear, monthNum + 1, 0, 23, 59, 59, 999).toISOString()

  // Flat parallel queries — no nested FK joins
  const [sessionsRes, monthSessionsRes, attendanceRes, paymentsRes, studentsRes, batchesRes] =
    await Promise.all([
      supabase
        .from('sessions')
        .select('*')
        .eq('tutor_id', uid)
        .gte('scheduled_at', start)
        .lte('scheduled_at', end)
        .order('scheduled_at', { ascending: true }),

      supabase
        .from('sessions')
        .select('id, status, scheduled_at')
        .eq('tutor_id', uid)
        .gte('scheduled_at', monthStart)
        .lte('scheduled_at', monthEnd),

      supabase
        .from('attendance')
        .select('*')
        .eq('tutor_id', uid),

      supabase
        .from('payments')
        .select('id, student_id, session_id, status, amount_lkr, month_year')
        .eq('tutor_id', uid),

      supabase
        .from('students')
        .select('id, name, whatsapp, subject, grade, class_type, batch_id, monthly_fee, status')
        .eq('tutor_id', uid),

      supabase
        .from('batches')
        .select('id, name, subject, grade, schedule_day, schedule_time, monthly_fee, max_students, zoom_meeting_id, status')
        .eq('tutor_id', uid),
    ])

  if (sessionsRes.error) {
    return NextResponse.json({ error: sessionsRes.error.message }, { status: 500 })
  }

  // Build lookup maps
  const studentsMap = new Map((studentsRes.data ?? []).map((s: RawStudent) => [s.id, s]))
  const batchesMap  = new Map((batchesRes.data ?? []).map((b: RawBatch) => [b.id, b]))

  const attendanceBySession = new Map<string, AttendanceRecord[]>()
  for (const a of (attendanceRes.data ?? []) as AttendanceRecord[]) {
    const arr = attendanceBySession.get(a.session_id) ?? []
    arr.push(a)
    attendanceBySession.set(a.session_id, arr)
  }

  const paymentBySession = new Map<string, RawPayment>()
  const paymentByStudent = new Map<string, RawPayment[]>()
  for (const p of (paymentsRes.data ?? []) as RawPayment[]) {
    if (p.session_id) paymentBySession.set(p.session_id, p)
    const arr = paymentByStudent.get(p.student_id) ?? []
    arr.push(p)
    paymentByStudent.set(p.student_id, arr)
  }

  // Enrich sessions in the requested window
  const sessions = (sessionsRes.data ?? []) as RawSession[]
  const todayStr = todayDateString(now)

  const enrichedSessions = sessions.map(session => {
    const attendance   = attendanceBySession.get(session.id) ?? []
    const student      = session.student_id ? (studentsMap.get(session.student_id) ?? null) : null
    const batch        = session.batch_id   ? (batchesMap.get(session.batch_id)    ?? null) : null
    const display_name = student?.name ?? batch?.name ?? 'Unknown'

    // Payment: prefer session-level, fall back to current-month student payment
    let payment: RawPayment | null = paymentBySession.get(session.id) ?? null
    if (!payment && session.student_id) {
      const monthlyPayments = paymentByStudent.get(session.student_id) ?? []
      payment = monthlyPayments.find(p => p.month_year === currentMonthYear(now)) ?? null
    }

    return {
      ...session,
      student,
      batch,
      attendance,
      payment,
      display_name,
    }
  })

  // Stats — derived from month sessions
  const monthSessions = (monthSessionsRes.data ?? []) as Array<{
    id: string
    status: string
    scheduled_at: string
  }>

  const todayCount     = monthSessions.filter(s => s.scheduled_at.slice(0, 10) === todayStr).length
  const thisMonthCount = monthSessions.length
  const completedCount = monthSessions.filter(s => s.status === 'completed').length
  const cancelledCount = monthSessions.filter(s => s.status === 'cancelled').length

  // Attendance rate: % of 'present' across all attendance rows for completed sessions this month
  const completedIds = new Set(
    monthSessions.filter(s => s.status === 'completed').map(s => s.id),
  )
  let totalMarked = 0
  let totalPresent = 0
  for (const [sessionId, records] of attendanceBySession) {
    if (!completedIds.has(sessionId)) continue
    for (const r of records) {
      if (r.status !== 'unknown') {
        totalMarked++
        if (r.status === 'present' || r.status === 'late') totalPresent++
      }
    }
  }
  const attendanceRate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 0

  return NextResponse.json({
    sessions: enrichedSessions,
    stats: {
      today:          todayCount,
      thisMonth:      thisMonthCount,
      completed:      completedCount,
      cancelled:      cancelledCount,
      attendanceRate,
    },
  })
}

// ─── POST /api/sessions ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

  const { student_id, batch_id, scheduled_at, session_type } = body

  if (!student_id && !batch_id) {
    return NextResponse.json({ error: 'Either student_id or batch_id is required' }, { status: 400 })
  }
  if (!scheduled_at) {
    return NextResponse.json({ error: 'scheduled_at is required' }, { status: 400 })
  }

  // Derive session_type if not provided
  const resolvedType =
    (session_type as string | undefined) ??
    (batch_id ? 'batch' : 'individual')

  const { data: session, error: insertErr } = await supabase
    .from('sessions')
    .insert({
      tutor_id:       user.id,
      student_id:     (student_id as string) ?? null,
      batch_id:       (batch_id as string) ?? null,
      session_type:   resolvedType,
      scheduled_at:   scheduled_at as string,
      duration_mins:  (body.duration_mins as number) ?? 60,
      status:         'scheduled',
      payment_status: (body.payment_status as string) ?? 'pending',
      zoom_link:      (body.zoom_link as string) ?? null,
      notes:          (body.notes as string) ?? null,
    })
    .select()
    .single()

  if (insertErr || !session) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  const createdSession = session as { id: string }

  // For batch sessions: create attendance records for all active students in that batch
  if (batch_id) {
    const { data: batchStudents } = await supabase
      .from('students')
      .select('id')
      .eq('batch_id', batch_id as string)
      .eq('status', 'active')

    if (batchStudents && batchStudents.length > 0) {
      await supabase
        .from('attendance')
        .upsert(
          batchStudents.map(s => ({
            session_id: createdSession.id,
            student_id: s.id,
            tutor_id:   user.id,
            status:     'unknown',
          })),
          { onConflict: 'session_id,student_id', ignoreDuplicates: true },
        )
    }
  }

  return NextResponse.json({ session }, { status: 201 })
}
