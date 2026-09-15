import type { SupabaseClient } from '@supabase/supabase-js'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Mirrors generate-batch-sessions.ts's shape, but per-student instead of
// per-batch — an individual student's recurring weekly slot (scheduled_day/
// scheduled_time on the students row, set at booking time by
// book_individual_slot()) has no equivalent of the batches table to drive
// generation from, so this reads directly off the student row instead.
export async function generateIndividualSessions(tutorId: string, supabase: SupabaseClient) {
  const { data: students } = await supabase
    .from('students')
    .select('id, scheduled_day, scheduled_time, monthly_fee')
    .eq('tutor_id', tutorId)
    .eq('class_type', 'individual')
    .eq('status', 'active')

  const today = new Date()

  for (const student of (students ?? []) as Array<{
    id: string
    scheduled_day: string | null
    scheduled_time: string | null
  }>) {
    if (!student.scheduled_day || !student.scheduled_time) continue

    const targetDay = DAYS.indexOf(student.scheduled_day)
    if (targetDay < 0) continue

    for (let week = 0; week < 4; week++) {
      const date = new Date(today)
      const currentDay = date.getDay()
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0) daysUntil += 7
      date.setDate(date.getDate() + daysUntil + week * 7)

      const [hours, minutes] = (student.scheduled_time as string).split(':').map(Number)
      date.setHours(hours, minutes, 0, 0)

      const { error } = await supabase
        .from('sessions')
        .upsert(
          {
            tutor_id: tutorId,
            student_id: student.id,
            batch_id: null,
            session_type: 'individual',
            scheduled_at: date.toISOString(),
            status: 'scheduled',
          },
          { onConflict: 'student_id,scheduled_at', ignoreDuplicates: true },
        )

      if (error) {
        console.error(`[generateIndividualSessions] Failed to upsert session for student ${student.id}:`, error.message)
      }
    }
  }
}
