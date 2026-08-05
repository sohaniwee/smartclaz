import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type RawSession = {
  id: string
  tutor_id: string
  student_id: string | null
  batch_id: string | null
  session_type: string | null
  duration_mins: number
  zoom_link: string | null
  payment_status: string | null
}

// ─── POST /api/sessions/[id]/reschedule ──────────────────────────────────────

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

  let body: { new_date: string; new_time: string; notify_student?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { new_date, new_time, notify_student = false } = body

  if (!new_date || !new_time) {
    return NextResponse.json({ error: 'new_date and new_time are required' }, { status: 400 })
  }

  // 1. Load original session — verify tutor ownership
  const { data: original, error: sessionErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, batch_id, session_type, duration_mins, zoom_link, payment_status')
    .eq('id', sessionId)
    .eq('tutor_id', user.id)
    .single()

  if (sessionErr || !original) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const orig = original as RawSession
  const newScheduledAt = `${new_date}T${new_time}:00`

  // 2. Mark original session as rescheduled
  await supabase
    .from('sessions')
    .update({
      status:           'rescheduled',
      cancelled_reason: `Rescheduled to ${new_date} ${new_time}`,
    })
    .eq('id', sessionId)
    .eq('tutor_id', user.id)

  // 3. Create new session with same fields but updated scheduled_at
  const { data: newSession, error: newErr } = await supabase
    .from('sessions')
    .insert({
      tutor_id:       user.id,
      student_id:     orig.student_id,
      batch_id:       orig.batch_id,
      session_type:   orig.session_type,
      scheduled_at:   newScheduledAt,
      duration_mins:  orig.duration_mins,
      status:         'scheduled',
      payment_status: orig.payment_status ?? 'pending',
      zoom_link:      null, // fresh link will be generated before the session
    })
    .select()
    .single()

  if (newErr || !newSession) {
    // Attempt to roll back the status change so data stays consistent
    await supabase
      .from('sessions')
      .update({ status: 'scheduled', cancelled_reason: null })
      .eq('id', sessionId)

    return NextResponse.json(
      { error: newErr?.message ?? 'Failed to create rescheduled session' },
      { status: 500 },
    )
  }

  const createdSession = newSession as { id: string }

  // 4. Link original → new session
  await supabase
    .from('sessions')
    .update({ rescheduled_to: createdSession.id })
    .eq('id', sessionId)

  // 5. For batch sessions: create attendance records for active batch students
  if (orig.batch_id) {
    const { data: batchStudents } = await supabase
      .from('students')
      .select('id')
      .eq('batch_id', orig.batch_id)
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

  // 6. Notify student — stub for Phase 3 Twilio integration
  if (notify_student && orig.student_id) {
    const { data: studentRow } = await supabase
      .from('students')
      .select('name, whatsapp')
      .eq('id', orig.student_id)
      .single()

    if (studentRow) {
      const s = studentRow as { name: string; whatsapp: string }
      console.log(
        `[WhatsApp stub] Reschedule notification for ${s.whatsapp}: ` +
        `Hi ${s.name}, your class has been rescheduled to ${new_date} at ${new_time}.`,
      )
    }
  }

  // Fetch the updated original session to return
  const { data: updatedOriginal } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  return NextResponse.json({
    original:    updatedOriginal,
    new_session: newSession,
  })
}
