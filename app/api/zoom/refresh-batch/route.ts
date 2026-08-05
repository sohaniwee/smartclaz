// ✅ CURRENT: Creates a new Zoom meeting for a batch and notifies paid students.
//    Tutor dashboard "Refresh Zoom Link" button calls this endpoint.
// 🚀 BEFORE LAUNCH: Only call this if tutor suspects link was shared with
//    unauthorised attendees (joined > enrolled alert). Sunday cron handles
//    regular weekly refresh automatically.
// 📝 NOTE: Old Zoom meeting is NOT deleted — it expires naturally.
//    Paid students are re-sent the new link immediately.
// 🧪 TEST: POST /api/zoom/refresh-batch { batchId: "uuid" }

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createBatchZoomMeeting } from '@/lib/zoom'
import { sendLinkToPaidStudents, dayNameToNumber } from '@/lib/zoom-helpers'

// ── Service role client ───────────────────────────────────────────────────────
function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── POST /api/zoom/refresh-batch ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
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

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let batchId: string
  try {
    const body = await req.json()
    batchId = body.batchId
    if (!batchId) throw new Error('missing batchId')
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected { batchId: string }' },
      { status: 400 },
    )
  }

  const supabase = getServiceSupabase()

  // ── 3. Fetch batch — verify tutor owns it ─────────────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id, name, subject, grade, schedule_day, schedule_day_number, schedule_time, session_duration_mins, status')
    .eq('id', batchId)
    .eq('tutor_id', tutorId)
    .single()

  if (batchError || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  if (batch.status !== 'active') {
    return NextResponse.json({ error: 'Cannot refresh Zoom link for an inactive batch' }, { status: 400 })
  }

  // ── 4. Create new Zoom meeting ────────────────────────────────────────────
  // Derive weeklyDay from schedule_day_number column, or fall back to parsing
  // the schedule_day text value.
  const weeklyDay =
    batch.schedule_day_number ??
    dayNameToNumber(batch.schedule_day ?? 'Sunday')

  let zoom: { meetingId: string; joinUrl: string }

  try {
    zoom = await createBatchZoomMeeting(
      batch.name,
      weeklyDay,
      batch.schedule_time ?? '08:00',
      batch.session_duration_mins ?? 60,
    )
  } catch (err) {
    console.error('[zoom/refresh-batch] Zoom meeting creation failed:', err)
    return NextResponse.json(
      { error: 'Failed to create Zoom meeting', detail: String(err) },
      { status: 500 },
    )
  }

  const now = new Date().toISOString()

  // ── 5. Update batches table ───────────────────────────────────────────────
  const { error: updateBatchError } = await supabase
    .from('batches')
    .update({
      current_zoom_link:       zoom.joinUrl,
      current_zoom_meeting_id: zoom.meetingId,
      zoom_meeting_id:         zoom.meetingId,   // spec alias
      zoom_link_generated_at:  now,
    })
    .eq('id', batchId)

  if (updateBatchError) {
    console.error('[zoom/refresh-batch] Failed to update batch:', updateBatchError)
    return NextResponse.json({ error: 'Failed to save Zoom link to batch' }, { status: 500 })
  }

  // ── 6. Update upcoming sessions for this batch ────────────────────────────
  // Stamp the new link on all future scheduled sessions so reminders send
  // the correct URL.
  await supabase
    .from('sessions')
    .update({
      zoom_link:       zoom.joinUrl,
      zoom_meeting_id: zoom.meetingId,
    })
    .eq('batch_id', batchId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)

  // ── 7. Send link to paid students this month ──────────────────────────────
  const sentTo = await sendLinkToPaidStudents(batchId, zoom.joinUrl, tutorId, supabase)

  console.log(`[zoom/refresh-batch] Batch "${batch.name}" refreshed → ${zoom.joinUrl} (${sentTo} students notified)`)

  return NextResponse.json({
    success: true,
    joinUrl: zoom.joinUrl,
    sentTo,
  })
}
