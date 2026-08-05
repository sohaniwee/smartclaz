import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentMonth = new Date().toISOString().slice(0, 7)

  const [studentsRes, paymentsRes, batchesRes] = await Promise.all([
    supabase.from('students').select('*').eq('tutor_id', user.id).order('created_at', { ascending: false }),
    supabase.from('payments').select('id, student_id, status, amount_lkr, month_year, due_date, paid_at')
      .eq('tutor_id', user.id).eq('month_year', currentMonth),
    supabase.from('batches').select('id, name').eq('tutor_id', user.id),
  ])

  if (studentsRes.error) {
    return NextResponse.json({ error: studentsRes.error.message }, { status: 500 })
  }

  type RawPayment = { id: string; student_id: string; status: string; amount_lkr: number; month_year: string | null; due_date: string | null; paid_at: string | null }

  const payByStudent = new Map<string, RawPayment[]>()
  for (const p of ((paymentsRes.data ?? []) as RawPayment[])) {
    const arr = payByStudent.get(p.student_id) ?? []
    arr.push(p)
    payByStudent.set(p.student_id, arr)
  }

  const batchNameById = new Map<string, string>()
  for (const b of (batchesRes.data ?? [])) {
    batchNameById.set(b.id as string, b.name as string)
  }

  const enriched = (studentsRes.data ?? []).map(s => {
    const currPay = payByStudent.get(s.id as string) ?? []
    let current_payment_status = 'na'
    if (currPay.some(p => p.status === 'paid'))         current_payment_status = 'paid'
    else if (currPay.some(p => p.status === 'overdue')) current_payment_status = 'overdue'
    else if (currPay.some(p => p.status === 'pending')) current_payment_status = 'pending'

    const pending_payment = currPay.find(p => p.status === 'pending') ?? null
    const batchId = s.batch_id as string | undefined

    return {
      ...s,
      batch_name: batchId ? (batchNameById.get(batchId) ?? null) : null,
      current_payment_status,
      pending_payment,
    }
  })

  return NextResponse.json({ students: enriched })
}
