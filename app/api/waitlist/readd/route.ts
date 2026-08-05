import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

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
    .select('student_name, student_whatsapp, subject, grade, batch_id, status')
    .eq('id', waitlistId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !entry) {
    return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 })
  }

  const typedEntry = entry as { student_name: string; student_whatsapp: string; subject: string; grade: string; batch_id: string; status: string }

  if (typedEntry.status !== 'expired') {
    return NextResponse.json({ error: 'Entry is not in expired status' }, { status: 400 })
  }

  const { error: insertErr } = await supabase.from('waitlist').insert({
    tutor_id: user.id,
    student_name: typedEntry.student_name,
    student_whatsapp: typedEntry.student_whatsapp,
    subject: typedEntry.subject,
    grade: typedEntry.grade,
    batch_id: typedEntry.batch_id,
    status: 'waiting',
  })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  console.log(`[waitlist/readd] New waiting entry created from expired entry ${waitlistId}`)

  return NextResponse.json({ success: true })
}
