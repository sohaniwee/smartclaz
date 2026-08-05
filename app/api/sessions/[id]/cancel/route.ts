import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// ─── POST /api/sessions/[id]/cancel ──────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  const cookieStore = await cookies()
  const supabase    = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { reason?: string; notify_student?: boolean }
  try {
    body = await req.json()
  } catch {
    // Body is optional for cancel
    body = {}
  }

  const { reason, notify_student = false } = body

  // 1. Load session and verify tutor ownership
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, batch_id, scheduled_at')
    .eq('id', sessionId)
    .eq('tutor_id', user.id)
    .single()

  if (sessionErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const typedSession = session as {
    id: string
    tutor_id: string
    student_id: string | null
    batch_id: string | null
    scheduled_at: string
  }

  // 2. Mark session as cancelled
  const { data: updated, error: updateErr } = await supabase
    .from('sessions')
    .update({
      status:           'cancelled',
      cancelled_reason: reason ?? null,
    })
    .eq('id', sessionId)
    .eq('tutor_id', user.id)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 3. Notify student — stub for Phase 3 Twilio integration
  if (notify_student) {
    if (typedSession.student_id) {
      try {
        const { data: studentRow } = await supabase
          .from('students')
          .select('name, whatsapp, subject, grade')
          .eq('id', typedSession.student_id)
          .single()

        if (studentRow) {
          const s = studentRow as {
            name: string
            whatsapp: string
            subject: string
            grade: string
          }
          const sessionDate = new Date(typedSession.scheduled_at).toLocaleDateString('en-LK', {
            weekday: 'long',
            day:     'numeric',
            month:   'long',
          })
          const msg =
            `Hi ${s.name}! Your ${s.grade} ${s.subject} class on ${sessionDate} has been cancelled.` +
            (reason ? ` Reason: ${reason}` : '') +
            ' Sir will be in touch about rescheduling.'
          console.log('[WhatsApp stub] Cancel notification for', s.whatsapp, ':', msg)
        }
      } catch {
        // Notification failure must never break the cancel response
      }
    } else if (typedSession.batch_id) {
      console.log('[WhatsApp stub] Cancel notification for batch', typedSession.batch_id)
    }
  }

  return NextResponse.json({ session: updated })
}
