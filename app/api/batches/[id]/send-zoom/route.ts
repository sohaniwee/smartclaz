import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type RawStudent = {
  id: string
  name: string
  whatsapp: string
  status: string
  monthly_fee: number
}

type RawPayment = {
  student_id: string
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
    .select('id, name, current_zoom_link')
    .eq('id', batchId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !batch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const batchRow = batch as { id: string; name: string; current_zoom_link: string | null }

  if (!batchRow.current_zoom_link) {
    return NextResponse.json({ error: 'No Zoom link generated for this batch yet' }, { status: 400 })
  }

  const currentMonth = new Date().toISOString().slice(0, 7)

  const [studentsRes, paymentsRes] = await Promise.all([
    supabase.from('students').select('id, name, whatsapp, status, monthly_fee')
      .eq('batch_id', batchId)
      .eq('tutor_id', user.id)
      .eq('status', 'active'),
    supabase.from('payments').select('student_id, status')
      .eq('tutor_id', user.id)
      .eq('month_year', currentMonth),
  ])

  if (studentsRes.error) {
    return NextResponse.json({ error: studentsRes.error.message }, { status: 500 })
  }

  const paidStudentIds = new Set<string>()
  for (const p of ((paymentsRes.data ?? []) as RawPayment[])) {
    if (p.status === 'paid') paidStudentIds.add(p.student_id)
  }

  const activeStudents = (studentsRes.data ?? []) as RawStudent[]
  const paidStudents = activeStudents.filter(s => paidStudentIds.has(s.id))

  // TODO: Send via Twilio when wired
  console.log(`[send-zoom] Would send to ${paidStudents.length} students`)

  return NextResponse.json({ success: true, sent_count: paidStudents.length })
}
