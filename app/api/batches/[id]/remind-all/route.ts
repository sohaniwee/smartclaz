import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type RawStudent = {
  id: string
  name: string
  whatsapp: string
  status: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: batch, error: fetchErr } = await supabase
    .from('batches')
    .select('id, name, subject, grade, schedule_day, schedule_time')
    .eq('id', batchId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !batch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: studentsData, error: studentsErr } = await supabase
    .from('students')
    .select('id, name, whatsapp, status')
    .eq('batch_id', batchId)
    .eq('tutor_id', user.id)
    .eq('status', 'active')

  if (studentsErr) {
    return NextResponse.json({ error: studentsErr.message }, { status: 500 })
  }

  const activeStudents = (studentsData ?? []) as RawStudent[]

  // TODO: Send via Twilio when wired
  console.log(`[remind-all] Would send reminder to ${activeStudents.length} students in batch ${batchId}`)

  return NextResponse.json({ success: true, sent_count: activeStudents.length })
}
