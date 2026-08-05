// ✅ CURRENT: Shared helper for sending batch Zoom links to paid students.
//    Used by: app/api/zoom/refresh-batch, app/api/zoom/send-batch,
//             app/api/reminders/send (Sunday batch cron).
// 📝 NOTE: Only students with status='active' AND a paid payment for the current
//    month receive the link. Blocked / inactive students are silently skipped.
// 🧪 TEST: Call sendLinkToPaidStudents with a known batchId — check console for
//    "WhatsApp OUT [TEST MODE]" logs per paid student.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendZoomLink } from '@/lib/twilio'

// ── Day name → Zoom weeklyDay number (1=Sunday … 7=Saturday) ─────────────────
const DAY_NUMBER: Record<string, number> = {
  Sunday:    1,
  Monday:    2,
  Tuesday:   3,
  Wednesday: 4,
  Thursday:  5,
  Friday:    6,
  Saturday:  7,
}

export function dayNameToNumber(dayName: string): number {
  return DAY_NUMBER[dayName] ?? 1  // default Sunday if unknown
}

// ── sendLinkToPaidStudents ────────────────────────────────────────────────────
/**
 * Send a Zoom link to every active student in a batch who has a paid payment
 * for the current calendar month.
 *
 * @param batchId   The batch's UUID
 * @param zoomLink  The join URL to send
 * @param tutorId   The tutor's UUID (used for message cost tracking)
 * @param supabase  Service-role Supabase client (bypasses RLS)
 * @returns         Number of students the link was sent to
 */
export async function sendLinkToPaidStudents(
  batchId:  string,
  zoomLink: string,
  tutorId:  string,
  supabase: SupabaseClient,
): Promise<number> {
  const monthYear = new Date().toISOString().slice(0, 7)  // "YYYY-MM"

  // ── Fetch batch + tutor contact details ──────────────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id, name, schedule_day, schedule_time, tutors(id, whatsapp_number, phone)')
    .eq('id', batchId)
    .single()

  if (batchError || !batch) {
    console.error(`[zoom-helpers] Batch ${batchId} not found:`, batchError)
    return 0
  }

  const tutorRow = Array.isArray(batch.tutors) ? batch.tutors[0] : batch.tutors
  const tutorPhone = tutorRow?.whatsapp_number ?? tutorRow?.phone ?? ''

  // Human-readable session time shown in the WhatsApp message
  const sessionTime = batch.schedule_day && batch.schedule_time
    ? `${batch.schedule_day}s at ${batch.schedule_time}`
    : 'your scheduled class time'

  // ── Fetch active students in this batch ───────────────────────────────────
  // Accept both 'batch' and 'group' class_type values — the codebase has used
  // both over time; this ensures neither is silently excluded.
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, name, whatsapp')
    .eq('tutor_id', tutorId)
    .eq('batch_id', batchId)
    .eq('status', 'active')
    .in('class_type', ['batch', 'group'])

  if (studentsError || !students || students.length === 0) {
    console.log(`[zoom-helpers] No active students for batch ${batchId}`)
    return 0
  }

  let sentCount = 0

  for (const student of students) {
    if (!student.whatsapp) continue

    // ── Check paid payment this month ───────────────────────────────────
    const { data: paidPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('student_id', student.id)
      .eq('month_year', monthYear)
      .eq('status', 'paid')
      .limit(1)
      .maybeSingle()

    if (!paidPayment) {
      // Student has not paid this month — skip silently
      console.log(`[zoom-helpers] Skipping ${student.name} — no paid payment for ${monthYear}`)
      continue
    }

    // ── Send Zoom link via WhatsApp ──────────────────────────────────────
    try {
      await sendZoomLink(
        student.whatsapp,
        tutorPhone,
        zoomLink,
        sessionTime,
        student.name,
        tutorId,
      )
      sentCount++
    } catch (err) {
      console.error(`[zoom-helpers] WhatsApp send failed for ${student.name}:`, err)
      // Non-fatal — continue to next student
    }

    // 300ms delay between sends to avoid Twilio rate limits
    if (sentCount < students.length) {
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }

  console.log(`[zoom-helpers] Sent Zoom link to ${sentCount}/${students.length} students in batch ${batchId}`)
  return sentCount
}
