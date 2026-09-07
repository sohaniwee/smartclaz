import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type SessionRow = {
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
}

// ─── PATCH /api/sessions/[id] ────────────────────────────────────────────────

export async function PATCH(
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

  // Load the existing session to get student_id / batch_id for side-effects
  const { data: existing, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, student_id, batch_id, session_type, payment_status')
    .eq('id', sessionId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const session = existing as SessionRow

  // Build the session update payload from allowed fields only
  const ALLOWED_SESSION_FIELDS = [
    'scheduled_at',
    'duration_mins',
    'status',
    'notes',
    'zoom_link',
    'payment_status',
    'cancelled_reason',
  ] as const

  const updateFields: Record<string, unknown> = {}
  for (const key of ALLOWED_SESSION_FIELDS) {
    if (body[key] !== undefined) updateFields[key] = body[key]
  }

  // Handle attendance_status side-effect (individual sessions only)
  const attendanceStatus = body.attendance_status as string | undefined
  if (
    attendanceStatus &&
    ['present', 'absent', 'late'].includes(attendanceStatus) &&
    session.student_id
  ) {
    await supabase
      .from('attendance')
      .upsert(
        {
          session_id: sessionId,
          student_id: session.student_id,
          tutor_id:   user.id,
          status:     attendanceStatus,
          marked_at:  new Date().toISOString(),
        },
        { onConflict: 'session_id,student_id' },
      )
  }

  // Handle payment_status side-effect — update existing payment row for this month
  const incomingPaymentStatus = body.payment_status as string | undefined
  if (incomingPaymentStatus && session.student_id) {
    const now           = new Date()
    const currentMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Only update if the row already exists — never create one here
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('tutor_id', user.id)
      .eq('student_id', session.student_id)
      .eq('month_year', currentMonth)
      .maybeSingle()

    if (existingPayment) {
      await supabase
        .from('payments')
        .update({ status: incomingPaymentStatus })
        .eq('id', existingPayment.id)
    }
  }

  // Require at least one session field to update
  if (Object.keys(updateFields).length === 0 && !attendanceStatus) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  if (Object.keys(updateFields).length === 0) {
    // Only attendance was written — return current session
    const { data: current } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    return NextResponse.json({ session: current })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('sessions')
    .update(updateFields)
    .eq('id', sessionId)
    .eq('tutor_id', user.id)
    .select()
    .single()

  if (updateErr || !updated) {
    console.error('[sessions] Failed to update session:', updateErr)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }

  return NextResponse.json({ session: updated })
}

// ─── DELETE /api/sessions/[id] ───────────────────────────────────────────────
// Soft delete: set status = 'cancelled'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  const cookieStore = await cookies()
  const supabase    = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ status: 'cancelled' })
    .eq('id', sessionId)
    .eq('tutor_id', user.id)

  if (updateErr) {
    console.error('[sessions] Failed to cancel session:', updateErr)
    return NextResponse.json({ error: 'Failed to cancel session' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
