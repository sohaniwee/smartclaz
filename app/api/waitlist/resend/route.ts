import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

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

  if (entry.status !== 'offered') {
    return NextResponse.json({ error: 'Entry is not in offered status' }, { status: 400 })
  }

  const { error: resendUpdateErr } = await supabase.from('waitlist').update({
    notified_at: new Date().toISOString(),
  }).eq('id', waitlistId).eq('tutor_id', user.id)

  if (resendUpdateErr) {
    console.error('[waitlist/resend] Failed to update notified_at:', resendUpdateErr)
    return NextResponse.json({ error: 'Failed to resend offer' }, { status: 500 })
  }

  const batch = entry.batches as { id: string; name: string; subject: string; grade: string; schedule_day: string; schedule_time: string; monthly_fee: number; max_students: number }

  const offerMessage =
    `Hi ${entry.student_name}! 🎉\n\n` +
    `Great news! A spot has opened in:\n` +
    `📚 ${batch.name}\n` +
    `📅 ${batch.schedule_day} ${formatTime(batch.schedule_time)}\n` +
    `💰 LKR ${batch.monthly_fee.toLocaleString()}/month\n\n` +
    `Would you like to join?\n` +
    `Reply *YES* to confirm 🙏\n\n` +
    `This offer expires in 48 hours.`

  // TODO: await sendWhatsApp(entry.student_whatsapp, offerMessage)

  console.log(`[waitlist/resend] Entry ${waitlistId} offer resent — student: ${entry.student_whatsapp}`)

  return NextResponse.json({ success: true, offerMessage })
}
