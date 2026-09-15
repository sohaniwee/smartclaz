import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendWaitlistOffer } from '@/lib/twilio'

function formatTime(t: string): string {
  if (!t) return t
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let waitlistId: string
  try {
    const body = await req.json() as { waitlistId: string }
    waitlistId = body.waitlistId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!waitlistId) {
    return NextResponse.json({ error: 'waitlistId required' }, { status: 400 })
  }

  const { data: entry, error: fetchErr } = await supabase
    .from('waitlist')
    .select('*, batches(id, name, subject, grade, schedule_day, schedule_time, monthly_fee, max_students)')
    .eq('id', waitlistId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !entry) {
    return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 })
  }

  if (entry.status !== 'waiting') {
    return NextResponse.json({ error: 'Entry is not in waiting status' }, { status: 400 })
  }

  const batch = entry.batches as { id: string; name: string; subject: string; grade: string; schedule_day: string; schedule_time: string; monthly_fee: number; max_students: number }

  const { count: enrolled } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', entry.batch_id)
    .eq('status', 'active')

  if ((enrolled ?? 0) >= batch.max_students) {
    return NextResponse.json({ error: 'Batch is still full' }, { status: 409 })
  }

  const { error: offerUpdateErr } = await supabase.from('waitlist').update({
    status: 'offered',
    notified_at: new Date().toISOString(),
  }).eq('id', waitlistId).eq('tutor_id', user.id)

  if (offerUpdateErr) {
    console.error('[waitlist/offer] Failed to mark entry offered:', offerUpdateErr)
    return NextResponse.json({ error: 'Failed to make offer' }, { status: 500 })
  }

  const { error: conversationErr } = await supabase.from('conversations').upsert({
    tutor_id: user.id,
    student_whatsapp: entry.student_whatsapp,
    status: 'bot',
    context: {
      step: 'awaiting_waitlist_confirm',
      waitlistId: entry.id,
      batchId: entry.batch_id,
      batchName: batch.name,
      batchFee: batch.monthly_fee,
      offerExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    },
    last_message_at: new Date().toISOString(),
  }, { onConflict: 'tutor_id,student_whatsapp' })

  if (conversationErr) {
    console.error('[waitlist/offer] Failed to seed bot conversation context — student reply to this offer will not be understood:', conversationErr)
  }

  const offerMessage =
    `Hi ${entry.student_name}! 🎉\n\n` +
    `Great news! A spot has opened in:\n` +
    `📚 ${batch.name}\n` +
    `📅 ${batch.schedule_day} ${formatTime(batch.schedule_time)}\n` +
    `💰 LKR ${batch.monthly_fee.toLocaleString()}/month\n\n` +
    `Would you like to join?\n` +
    `Reply *YES* to confirm 🙏\n\n` +
    `This offer expires in 48 hours.`

  try {
    await sendWaitlistOffer(entry.student_whatsapp, user.id, offerMessage)
  } catch (sendErr) {
    // Non-fatal to the API response — the offer is already recorded and the
    // conversation context seeded, so the student can still reply if they
    // happen to message in, but log loudly since this is the one message
    // that actually tells them a spot opened up.
    console.error('[waitlist/offer] Failed to send offer WhatsApp message:', sendErr)
  }

  console.log(`[waitlist/offer] Entry ${waitlistId} marked offered — student: ${entry.student_whatsapp}`)

  return NextResponse.json({ success: true, offerMessage })
}
