import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type RawStudent = {
  id: string
  name: string
  monthly_fee: number
}

type RawPayment = {
  id: string
  student_id: string
  status: string
}

type RawBatch = {
  id: string
  name: string
  monthly_fee: number
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

  const { data: batchData, error: fetchErr } = await supabase
    .from('batches')
    .select('id, name, monthly_fee')
    .eq('id', batchId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !batchData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const batch = batchData as RawBatch
  const currentMonth = new Date().toISOString().slice(0, 7)

  const { data: studentsData, error: studentsErr } = await supabase
    .from('students')
    .select('id, name, monthly_fee')
    .eq('batch_id', batchId)
    .eq('tutor_id', user.id)
    .eq('status', 'active')

  if (studentsErr) {
    return NextResponse.json({ error: studentsErr.message }, { status: 500 })
  }

  const activeStudents = (studentsData ?? []) as RawStudent[]

  if (activeStudents.length === 0) {
    return NextResponse.json({ success: true, marked_count: 0 })
  }

  const studentIds = activeStudents.map(s => s.id)

  const { data: existingPayments, error: paymentsErr } = await supabase
    .from('payments')
    .select('id, student_id, status')
    .eq('tutor_id', user.id)
    .eq('month_year', currentMonth)
    .in('student_id', studentIds)

  if (paymentsErr) {
    return NextResponse.json({ error: paymentsErr.message }, { status: 500 })
  }

  const payments = (existingPayments ?? []) as RawPayment[]
  const paymentByStudent = new Map<string, RawPayment>()
  for (const p of payments) {
    paymentByStudent.set(p.student_id, p)
  }

  const pendingStudentIds = payments.filter(p => p.status === 'pending').map(p => p.student_id)
  const studentsWithRecord = new Set(payments.map(p => p.student_id))
  const studentsWithoutPayment = activeStudents.filter(s => !studentsWithRecord.has(s.id))

  if (pendingStudentIds.length > 0) {
    await supabase.from('payments')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .in('student_id', pendingStudentIds)
      .eq('tutor_id', user.id)
      .eq('month_year', currentMonth)
      .eq('status', 'pending')
  }

  if (studentsWithoutPayment.length > 0) {
    await supabase.from('payments').insert(
      studentsWithoutPayment.map(s => ({
        tutor_id: user.id,
        student_id: s.id,
        amount_lkr: s.monthly_fee > 0 ? s.monthly_fee : batch.monthly_fee,
        payment_type: 'monthly',
        month_year: currentMonth,
        method: 'cash',
        status: 'paid',
        paid_at: new Date().toISOString(),
        due_date: new Date().toISOString().split('T')[0],
        verified_by: 'tutor',
      })),
    )
  }

  const marked_count = pendingStudentIds.length + studentsWithoutPayment.length

  return NextResponse.json({ success: true, marked_count })
}
