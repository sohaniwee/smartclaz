import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { computeOverdueStatus } from '@/lib/payment-status'

type RawBatch = {
  id: string
  tutor_id: string
  name: string
  subject: string
  grade: string
  schedule_day: string
  schedule_time: string
  session_duration_mins: number | null
  monthly_fee: number
  max_students: number
  accepting_new: boolean | null
  current_zoom_link: string | null
  zoom_link_generated_at: string | null
  zoom_meeting_id: string | null
  status: string
  created_at: string
}

type RawStudent = {
  id: string
  name: string
  whatsapp: string
  status: string
  monthly_fee: number
  batch_id: string | null
}

type RawPayment = {
  id: string
  student_id: string
  status: string
  amount_lkr: number
  month_year: string | null
  is_trial_payment: boolean | null
}

type RawWaitlist = {
  id: string
  tutor_id: string
  batch_id: string | null
  student_name: string
  student_whatsapp: string
  subject: string
  grade: string
  status: string
  notified_at: string | null
  created_at: string
}

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentMonth = new Date().toISOString().slice(0, 7)

  const [batchesRes, studentsRes, paymentsRes, waitlistRes, tutorRes] = await Promise.all([
    supabase.from('batches').select('*').eq('tutor_id', user.id).order('created_at', { ascending: true }),
    supabase.from('students').select('id, name, whatsapp, status, monthly_fee, batch_id').eq('tutor_id', user.id).eq('class_type', 'group'),
    supabase.from('payments').select('id, student_id, status, amount_lkr, month_year, is_trial_payment').eq('tutor_id', user.id).eq('month_year', currentMonth),
    supabase.from('waitlist').select('*').eq('tutor_id', user.id).eq('status', 'waiting').order('created_at'),
    supabase.from('tutors').select('monthly_due_date, grace_period_days').eq('id', user.id).single(),
  ])

  if (batchesRes.error) {
    console.error('[batches] Failed to load batches:', batchesRes.error)
    return NextResponse.json({ error: 'Failed to load batches' }, { status: 500 })
  }

  // Live-computed, not read from a stored due_date column — same
  // computeOverdueStatus() helper used by Dashboard, Students and Payments.
  const monthlyDueDate  = (tutorRes.data?.monthly_due_date as number | null)  ?? 28
  const gracePeriodDays = (tutorRes.data?.grace_period_days as number | null) ?? 3

  const payByStudent = new Map<string, RawPayment[]>()
  for (const p of ((paymentsRes.data ?? []) as RawPayment[])) {
    const arr = payByStudent.get(p.student_id) ?? []
    arr.push(p)
    payByStudent.set(p.student_id, arr)
  }

  const studentsByBatch = new Map<string, RawStudent[]>()
  for (const s of ((studentsRes.data ?? []) as RawStudent[])) {
    if (!s.batch_id) continue
    const arr = studentsByBatch.get(s.batch_id) ?? []
    arr.push(s)
    studentsByBatch.set(s.batch_id, arr)
  }

  const batches = ((batchesRes.data ?? []) as RawBatch[]).map(batch => {
    const batchStudents = studentsByBatch.get(batch.id) ?? []
    const activeStudents = batchStudents.filter(s => s.status === 'active')

    let paid_count = 0
    let pending_count = 0
    let overdue_count = 0
    let collected_lkr = 0
    let pending_lkr = 0
    let overdue_lkr = 0

    const studentsWithPayment = activeStudents.map(s => {
      const studentPayments = payByStudent.get(s.id) ?? []
      let payment_status: 'paid' | 'pending' | 'overdue' | 'na' = 'na'

      if (studentPayments.some(p => p.status === 'paid')) {
        payment_status = 'paid'
        paid_count++
        collected_lkr += s.monthly_fee
      } else {
        // Either a pending/overdue row exists, or there's no row yet this
        // month (treated as pending for the overdue check below) — either
        // way, live-compute against the tutor's CURRENT settings rather
        // than trusting a stored status/due_date.
        const nonTrial = studentPayments.find(p => !p.is_trial_payment)
        const { isOverdue } = computeOverdueStatus(
          monthlyDueDate, gracePeriodDays, currentMonth, nonTrial?.status ?? 'pending',
        )

        if (isOverdue) {
          payment_status = 'overdue'
          overdue_count++
          overdue_lkr += s.monthly_fee
        } else {
          payment_status = 'pending'
          pending_count++
          pending_lkr += s.monthly_fee
        }
      }

      return {
        id: s.id,
        name: s.name,
        whatsapp: s.whatsapp,
        status: s.status,
        monthly_fee: s.monthly_fee,
        payment_status,
      }
    })

    return {
      ...batch,
      enrolled_count: activeStudents.length,
      students: studentsWithPayment,
      paid_count,
      pending_count,
      overdue_count,
      collected_lkr,
      overdue_lkr,
      pending_lkr,
    }
  })

  return NextResponse.json({ batches, waitlist: (waitlistRes.data ?? []) as RawWaitlist[] })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

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

  const { name, subject, grade, schedule_day, schedule_time, monthly_fee, max_students } = body

  if (!name || !subject || !grade || !schedule_day || !schedule_time || monthly_fee === undefined || max_students === undefined) {
    return NextResponse.json({ error: 'name, subject, grade, schedule_day, schedule_time, monthly_fee and max_students are required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('batches')
    .select('id')
    .eq('tutor_id', user.id)
    .eq('name', name as string)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A batch with this name already exists' }, { status: 409 })
  }

  const { data: conflicting } = await supabase
    .from('batches')
    .select('id, name')
    .eq('tutor_id', user.id)
    .eq('schedule_day', schedule_day as string)
    .eq('schedule_time', schedule_time as string)
    .eq('status', 'active')
    .maybeSingle()

  if (conflicting) {
    return NextResponse.json(
      { error: 'Time conflict with existing batch', conflicting_batch: (conflicting as { id: string; name: string }).name },
      { status: 409 },
    )
  }

  const { data: batch, error: insertErr } = await supabase
    .from('batches')
    .insert({
      tutor_id: user.id,
      name: name as string,
      subject: subject as string,
      grade: grade as string,
      schedule_day: schedule_day as string,
      schedule_time: schedule_time as string,
      session_duration_mins: body.session_duration_mins ?? null,
      monthly_fee: monthly_fee as number,
      max_students: max_students as number,
      accepting_new: body.accepting_new ?? true,
      status: 'active',
    })
    .select()
    .single()

  if (insertErr || !batch) {
    console.error('[batches] Failed to create batch:', insertErr)
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 })
  }

  try {
    await supabase.from('audit_logs').insert({
      tutor_id: user.id,
      action: 'batch_created',
      entity: 'batches',
      entity_id: (batch as RawBatch).id,
      new_value: { batch_name: (batch as RawBatch).name },
      status: 'success',
    })
  } catch {
    // Never let audit failures break the main flow
  }

  return NextResponse.json({ batch }, { status: 201 })
}
