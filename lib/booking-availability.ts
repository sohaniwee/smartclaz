// ✅ CURRENT: Live availability + atomic booking for both individual slots
//    and batches. This is the ONLY place that should read/write booking
//    occupancy — do not duplicate these queries elsewhere.
// 📝 NOTE: These are real-time DB calls, not just config. Availability
//    must reflect who's actually booked right now, not just what the
//    tutor configured in tutors.subjects — that's the whole point of the
//    individual-slot and group/batch booking audits this module fixes.

import { createClient } from '@supabase/supabase-js'
import type { IndividualSlot } from '@/lib/types/subjects'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Listing (read-only) ──────────────────────────────────────────────────────

export async function getAvailableIndividualSlots(
  tutorId: string,
  subject: string,
  grade: string,
  configuredSlots: IndividualSlot[],
): Promise<IndividualSlot[]> {
  if (configuredSlots.length === 0) return []

  const supabase = getServiceSupabase()
  const { data: activeStudents } = await supabase
    .from('students')
    .select('scheduled_day, scheduled_time')
    .eq('tutor_id', tutorId)
    .eq('subject', subject)
    .eq('grade', grade)
    .eq('class_type', 'individual')
    .eq('status', 'active')

  const occupiedKeys = new Set(
    (activeStudents ?? []).map(s => `${s.scheduled_day}|${s.scheduled_time}`),
  )
  return configuredSlots.filter(slot => !occupiedKeys.has(`${slot.day}|${slot.time}`))
}

export interface AvailableBatch {
  id: string
  name: string
  schedule_day: string
  schedule_time: string
  monthly_fee: number
  max_students: number
  current_students_count: number
}

export async function getAvailableBatches(
  tutorId: string,
  subject: string,
  grade: string,
): Promise<AvailableBatch[]> {
  const supabase = getServiceSupabase()
  // batches_with_count (supabase/migrations/010_capacity_waitlist.sql) —
  // reuse the existing view rather than re-deriving enrolled counts here.
  const { data: batches } = await supabase
    .from('batches_with_count')
    .select('id, name, schedule_day, schedule_time, monthly_fee, max_students, current_students_count')
    .eq('tutor_id', tutorId)
    .eq('subject', subject)
    .eq('grade', grade)
    .eq('status', 'active')
    .eq('accepting_new', true)

  // Belt-and-suspenders filter even though accepting_new should already
  // reflect this — the real gate against over-booking is book_batch_slot's
  // transaction (FOR UPDATE + recount), this is just for display accuracy
  // in case accepting_new hasn't caught up yet.
  return ((batches ?? []) as AvailableBatch[]).filter(
    b => b.current_students_count < b.max_students,
  )
}

// Batches for a subject/grade regardless of capacity — used to pick a
// waitlist target when every batch is full (or none exist yet as 'available').
export async function getAnyBatchForWaitlist(
  tutorId: string,
  subject: string,
  grade: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('batches')
    .select('id, name')
    .eq('tutor_id', tutorId)
    .eq('subject', subject)
    .eq('grade', grade)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

// ── Booking (atomic insert via Postgres function + payment record) ─────────

export interface BookingResult {
  success: boolean
  studentId?: string
  reason?: 'slot_taken' | 'batch_full' | 'batch_not_found' | 'error'
}

export async function bookIndividualSlot(params: {
  tutorId: string
  subject: string
  grade: string
  day: string
  time: string
  name: string
  whatsapp: string
  monthlyFee: number
  paymentReference: string
}): Promise<BookingResult> {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase.rpc('book_individual_slot', {
    p_tutor_id: params.tutorId,
    p_subject:  params.subject,
    p_grade:    params.grade,
    p_day:      params.day,
    p_time:     params.time,
    p_student: {
      name: params.name,
      whatsapp: params.whatsapp,
      monthly_fee: params.monthlyFee,
    },
  })

  if (error) {
    console.error('[booking-availability] book_individual_slot RPC error:', error.message)
    return { success: false, reason: 'error' }
  }

  const result = data as { success: boolean; student_id?: string; reason?: string }
  if (!result.success) {
    return { success: false, reason: (result.reason as BookingResult['reason']) ?? 'slot_taken' }
  }

  await insertPaymentRecord(supabase, params.tutorId, result.student_id!, params.monthlyFee, params.paymentReference)

  return { success: true, studentId: result.student_id }
}

export async function bookBatchSlot(params: {
  tutorId: string
  batchId: string
  name: string
  whatsapp: string
  subject: string
  grade: string
  monthlyFee: number
  paymentReference: string
}): Promise<BookingResult> {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase.rpc('book_batch_slot', {
    p_tutor_id: params.tutorId,
    p_batch_id: params.batchId,
    p_student: {
      name: params.name,
      whatsapp: params.whatsapp,
      subject: params.subject,
      grade: params.grade,
      monthly_fee: params.monthlyFee,
    },
  })

  if (error) {
    console.error('[booking-availability] book_batch_slot RPC error:', error.message)
    return { success: false, reason: 'error' }
  }

  const result = data as { success: boolean; student_id?: string; reason?: string }
  if (!result.success) {
    return { success: false, reason: (result.reason as BookingResult['reason']) ?? 'batch_full' }
  }

  await insertPaymentRecord(supabase, params.tutorId, result.student_id!, params.monthlyFee, params.paymentReference)

  return { success: true, studentId: result.student_id }
}

async function insertPaymentRecord(
  supabase: ReturnType<typeof getServiceSupabase>,
  tutorId: string,
  studentId: string,
  amountLkr: number,
  paymentReference: string,
) {
  const { error } = await supabase.from('payments').insert({
    tutor_id: tutorId,
    student_id: studentId,
    amount_lkr: amountLkr,
    payment_type: 'monthly',
    month_year: new Date().toISOString().slice(0, 7),
    status: 'pending',
    due_date: new Date().toISOString().split('T')[0],
    payment_reference: paymentReference,
  })
  if (error) {
    // Non-fatal — the student row (the hard part, capacity-checked) already
    // exists. A missing payment record is recoverable by the tutor manually;
    // losing the booking itself to a payments-table hiccup would not be.
    console.error('[booking-availability] payment record insert failed (student was still created):', error.message)
  }
}
