// ✅ CURRENT: individual/trial → fresh Zoom link. batch/group → shared weekly link.
// 🚀 BEFORE LAUNCH: Wire real Twilio send (WHATSAPP_TEST_MODE=false).
// 📝 NOTE: In test mode all Zoom links and WhatsApp sends are logged to console only.
//    Zoom failure is NON-FATAL — payment is still verified and the tutor can
//    manually share the link from the dashboard. Student receives "link coming
//    shortly" message in that case.
// 🧪 TEST: POST /api/payments/verify { paymentId: "uuid", method: "bank" } — check console

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createZoomMeeting, createBatchZoomMeeting } from '@/lib/zoom'
import { sendZoomLink } from '@/lib/twilio'

// ── Service role client (bypasses RLS for cross-table writes) ─────────────────
// 📝 NOTE: Only used server-side. Never exposed to the browser.
function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── getZoomLinkForStudent ─────────────────────────────────────────────────────
// ✅ CURRENT: Individual/trial → fresh Zoom per payment.
//             Group/batch → shared batch link reused within same week.
// 📝 NOTE: Group students share ONE Zoom link per week. Fresh link every Sunday 6am.
//    Mid-week new student payment gets this week's existing link.
// 🚀 BEFORE LAUNCH: Enable Zoom waiting room on batch meetings for security.
//    Set waiting_room: true in createBatchZoomMeeting() settings.
async function getZoomLinkForStudent(
  student: any,
  tutor: any,
  supabase: any,
): Promise<{ joinUrl: string; meetingId: string }> {
  // Accept both 'batch' (correct per schema) and 'group' (legacy value) so that
  // existing students stored with either value receive the shared batch link.
  const isGroupClass = (student.class_type === 'batch' || student.class_type === 'group') && student.batch_id

  if (!isGroupClass) {
    // ── Individual or trial: create a fresh Zoom meeting every time ───────────
    console.log(`🎥 Creating individual Zoom meeting for ${student.name}`)

    // Find the next scheduled session to set an accurate start time
    const { data: nextSession } = await supabase
      .from('sessions')
      .select('scheduled_at, duration_mins')
      .eq('student_id', student.id)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const startTime = nextSession?.scheduled_at
      ? new Date(nextSession.scheduled_at)
      : new Date()

    const durationMins = nextSession?.duration_mins ?? 60

    const topic = `${student.subject} · ${student.name}`
    const zoom = await createZoomMeeting(topic, startTime, durationMins)

    return { joinUrl: zoom.joinUrl, meetingId: zoom.meetingId }
  }

  // ── Group / batch: reuse this week's link, or create a fresh one ──────────
  const batch = student.batches

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const linkIsRecent =
    batch?.current_zoom_link &&
    batch?.zoom_link_generated_at &&
    new Date(batch.zoom_link_generated_at) >= sevenDaysAgo

  if (linkIsRecent) {
    console.log(`📱 Reusing batch Zoom link for ${batch.name}`)
    return {
      joinUrl:   batch.current_zoom_link,
      meetingId: batch.current_zoom_meeting_id ?? '',
    }
  }

  // No valid link this week — generate a new one
  console.log(`🎥 Creating new batch Zoom meeting for ${batch.name}`)

  const zoom = await createBatchZoomMeeting(
    batch.name,
    batch.schedule_day_number ?? 1,
    batch.schedule_time ?? '08:00',
    60,
  )

  await supabase
    .from('batches')
    .update({
      current_zoom_link:       zoom.joinUrl,
      current_zoom_meeting_id: zoom.meetingId,
      zoom_link_generated_at:  new Date().toISOString(),
    })
    .eq('id', batch.id)

  return { joinUrl: zoom.joinUrl, meetingId: zoom.meetingId }
}

// ── POST /api/payments/verify ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Auth: require a logged-in tutor session ────────────────────────────
  const cookieStore = await cookies()
  const supabaseAuth = createClient(cookieStore)

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const tutorId = user.id

  // ── 2. Parse request body ─────────────────────────────────────────────────
  let paymentId: string
  let method: string | undefined
  try {
    const body = await req.json()
    paymentId = body.paymentId
    method = body.method  // 'bank' | 'ezCash' | 'cash' | 'payhere' — optional
    if (!paymentId) throw new Error('missing paymentId')
  } catch {
    return NextResponse.json({ error: 'Invalid request body. Expected { paymentId: string, method?: string }' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  // ── 3. Fetch payment with related student, batch, and tutor data ──────────
  // 📝 NOTE: tutor_id filter ensures tutors can only verify their own payments (RLS equivalent).
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('*, students(*, batches(*)), tutors(*)')
    .eq('id', paymentId)
    .eq('tutor_id', tutorId)
    .single()

  if (paymentError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // ── 4. Guard: already paid ────────────────────────────────────────────────
  if (payment.status === 'paid') {
    return NextResponse.json({ error: 'Payment is already marked as paid' }, { status: 400 })
  }

  const student = Array.isArray(payment.students) ? payment.students[0] : payment.students
  const tutor   = Array.isArray(payment.tutors)   ? payment.tutors[0]   : payment.tutors

  if (!student) {
    return NextResponse.json({ error: 'Student record not found for this payment' }, { status: 400 })
  }

  // ── 5. Mark payment as paid ───────────────────────────────────────────────
  // 'method' maps to the payments.method column (bank | ezCash | cash | payhere).
  const paymentUpdate: Record<string, string> = {
    status:      'paid',
    paid_at:     new Date().toISOString(),
    verified_by: 'tutor',
  }
  if (method) {
    paymentUpdate.method = method
  }

  const { error: updateError } = await supabase
    .from('payments')
    .update(paymentUpdate)
    .eq('id', paymentId)

  if (updateError) {
    console.error('[payments/verify] Failed to update payment status:', updateError)
    return NextResponse.json({ error: 'Failed to update payment status' }, { status: 500 })
  }

  // ── 6. Get the correct Zoom link for this student (NON-FATAL) ────────────
  // Payment is already verified above. Zoom failure must NOT undo that.
  // If Zoom is unavailable, student receives a "link coming shortly" message
  // and the tutor can manually share the link from the dashboard.
  let joinUrl: string | null = null
  let meetingId: string | null = null
  let zoomSent = false

  try {
    const zoom = await getZoomLinkForStudent(student, tutor, supabase)
    joinUrl   = zoom.joinUrl
    meetingId = zoom.meetingId
  } catch (err) {
    console.error('[payments/verify] Zoom link creation failed (non-fatal, payment still verified):', err)
  }

  // ── 7. Find next scheduled session → update its Zoom link ─────────────────
  // 📝 NOTE: For batch students this stamps the shared link on their next session row.
  const { data: nextSession } = await supabase
    .from('sessions')
    .select('id, scheduled_at')
    .eq('student_id', student.id)
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (nextSession && joinUrl && meetingId) {
    await supabase
      .from('sessions')
      .update({
        zoom_link:       joinUrl,
        zoom_meeting_id: meetingId,
      })
      .eq('id', nextSession.id)
  }

  // ── 8. Format session time for the WhatsApp message ───────────────────────
  const sessionTime = nextSession
    ? new Date(nextSession.scheduled_at).toLocaleString('en-LK', {
        weekday: 'long',
        month:   'short',
        day:     'numeric',
        hour:    '2-digit',
        minute:  '2-digit',
      })
    : 'Your upcoming session'

  // ── 9. Send WhatsApp to student ───────────────────────────────────────────
  // 📝 NOTE: sendZoomLink is a no-op (console log only) while WHATSAPP_TEST_MODE=true.
  //    WhatsApp failure is also non-fatal — tutor can share the link manually.
  try {
    if (joinUrl) {
      // Zoom link available — send it directly
      await sendZoomLink(
        student.whatsapp,
        tutor?.whatsapp_number ?? tutor?.phone ?? '',
        joinUrl,
        sessionTime,
        student.name,
        tutorId,
      )
      zoomSent = true
    } else {
      // Zoom link not yet available — send a holding message
      const { sendWhatsApp } = await import('@/lib/twilio')
      const FROM = process.env.TWILIO_WHATSAPP_FROM ?? '+14155238886'
      await sendWhatsApp(
        student.whatsapp,
        FROM,
        `Hi *${student.name}*! Your payment has been confirmed. Your Zoom link is coming shortly — we'll send it to you soon. Thank you!`,
        tutorId,
      )
      zoomSent = true
    }
  } catch (err) {
    console.error('[payments/verify] WhatsApp send failed (payment still verified):', err)
  }

  console.log(`[payments/verify] Payment ${paymentId} verified for ${student.name} — Zoom: ${joinUrl ?? 'pending'}`)

  return NextResponse.json({ success: true, zoomLink: joinUrl, zoomSent })
}
