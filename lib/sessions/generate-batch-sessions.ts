import type { SupabaseClient } from '@supabase/supabase-js'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function generateBatchSessions(tutorId: string, supabase: SupabaseClient) {
  const [batchesRes, batchStudentsRes] = await Promise.all([
    supabase
      .from('batches')
      .select('*')
      .eq('tutor_id', tutorId)
      .eq('status', 'active'),
    supabase
      .from('students')
      .select('id, batch_id, status')
      .eq('tutor_id', tutorId)
      .eq('class_type', 'group')
      .eq('status', 'active'),
  ])

  const studentsByBatch = new Map<string, string[]>()
  for (const s of (batchStudentsRes.data ?? []) as Array<{ id: string; batch_id: string | null; status: string }>) {
    if (!s.batch_id) continue
    const arr = studentsByBatch.get(s.batch_id) ?? []
    arr.push(s.id)
    studentsByBatch.set(s.batch_id, arr)
  }

  const today = new Date()

  for (const batch of (batchesRes.data ?? []) as Array<{
    id: string
    schedule_day: string | null
    schedule_time: string | null
    session_duration_mins: number | null
    current_zoom_link: string | null
  }>) {
    if (!batch.schedule_day || !batch.schedule_time) continue

    const targetDay = DAYS.indexOf(batch.schedule_day)
    if (targetDay < 0) continue

    for (let week = 0; week < 4; week++) {
      const date = new Date(today)
      const currentDay = date.getDay()
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0) daysUntil += 7
      date.setDate(date.getDate() + daysUntil + week * 7)

      const [hours, minutes] = (batch.schedule_time as string).split(':').map(Number)
      date.setHours(hours, minutes, 0, 0)

      const { data: session } = await supabase
        .from('sessions')
        .upsert(
          {
            tutor_id: tutorId,
            student_id: null,
            batch_id: batch.id,
            scheduled_at: date.toISOString(),
            duration_mins: batch.session_duration_mins ?? 60,
            status: 'scheduled',
            zoom_link: batch.current_zoom_link ?? null,
          },
          { onConflict: 'tutor_id,batch_id,scheduled_at', ignoreDuplicates: true },
        )
        .select()
        .single()

      if (!session) continue

      const activeStudentIds = studentsByBatch.get(batch.id) ?? []
      if (activeStudentIds.length > 0) {
        await supabase
          .from('attendance')
          .upsert(
            activeStudentIds.map(id => ({
              session_id: (session as { id: string }).id,
              student_id: id,
              tutor_id: tutorId,
              status: 'unknown',
            })),
            { onConflict: 'session_id,student_id', ignoreDuplicates: true },
          )
      }
    }
  }
}
