// ✅ CURRENT: Call GET /api/reminders/send manually to trigger reminders.
// 🚀 BEFORE LAUNCH: Set up scheduled function:
//    Netlify: add to netlify.toml:
//      [[plugins]]
//      package = "@netlify/plugin-nextjs"
//      [functions]
//        schedule = "*/15 * * * *"
//    Or Supabase Edge Functions with pg_cron:
//      SELECT cron.schedule('send-reminders', '*/15 * * * *', 'SELECT net.http_post(...)');
// 📝 NOTE: Always returns 200 — cron jobs must NOT retry on error.
//    Errors are logged to console but never thrown (would cause retries).
// 🧪 TEST: GET http://localhost:3000/api/reminders/send
//    Check server console for what would be sent (test mode logs, no real WA).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendReminder24hr,
  sendReminder1hr,
  sendTutorWhatsApp,
  sendPaymentReminder,
  sendZoomLink,
} from '@/lib/twilio'
import { createBatchZoomMeeting } from '@/lib/zoom'
import { generateBatchSessions } from '@/lib/sessions/generate-batch-sessions'

// ── Service role Supabase client ─────────────────────────────────────────────
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Time window helpers ───────────────────────────────────────────────────────

function nowPlus(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

function nowPlusMins(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000)
}

function formatSessionTime(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleString('en-LK', {
    timeZone:     'Asia/Colombo',
    weekday:      'long',
    year:         'numeric',
    month:        'long',
    day:          'numeric',
    hour:         '2-digit',
    minute:       '2-digit',
  })
}

function formatDueDate(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString('en-LK', {
    timeZone: 'Asia/Colombo',
    year:     'numeric',
    month:    'long',
    day:      'numeric',
  })
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ─────────────────────────────────────────────────────────────
  // Authorization — CRON_SECRET required in production
  // ✅ CURRENT: Dev mode skips secret check for easy local testing.
  // 🚀 BEFORE LAUNCH:
  //    1. Generate: openssl rand -hex 32
  //    2. Add CRON_SECRET=<value> to Netlify env vars
  //    3. Call this endpoint with: Authorization: Bearer <CRON_SECRET>
  // 📝 NOTE: Without this, anyone can trigger mass WhatsApp sends to all students.
  // ─────────────────────────────────────────────────────────────
  const isDev = process.env.NODE_ENV === 'development'
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')

  if (!isDev) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error('❌ Unauthorized reminder call')
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }

  const supabase = getServiceSupabase()
  const results = {
    reminder24h:        0,
    reminder1h:         0,
    tutorNotified:      0,
    paymentReminders:   0,
    studentsBlocked:    0,
    batchLinksRefreshed: 0,
    errors:             [] as string[],
  }

  // ── 0. Expire stale contact-change requests (email/phone change flows) ────
  // ✅ CURRENT: Fire-and-forget — must never block or fail the main reminder
  //    logic below. Any pending_old_otp / pending_new_otp request whose
  //    30-minute window (contact_change_requests.expires_at) has passed is
  //    flipped to 'expired' so a stale OTP can never be verified late.
  supabase
    .from('contact_change_requests')
    .update({ status: 'expired' })
    .in('status', ['pending_old_otp', 'pending_new_otp'])
    .lt('expires_at', new Date().toISOString())
    .then(undefined, () => {
      console.error('[reminders] contact_change_requests expiry error')
    })

  // ── 1. 24-hour session reminders ──────────────────────────────────────────
  // Sessions scheduled 24–25 hours from now, not yet reminded, paid, scheduled.
  try {
    const window24hStart = nowPlus(24).toISOString()
    const window24hEnd   = nowPlus(25).toISOString()

    const { data: sessions24h, error } = await supabase
      .from('sessions')
      .select('id, scheduled_at, zoom_link, students(id, name, whatsapp), tutors(id, name, whatsapp_number, phone)')
      .gte('scheduled_at', window24hStart)
      .lte('scheduled_at', window24hEnd)
      .eq('status', 'scheduled')
      .eq('payment_status', 'paid')
      .is('reminder_24h_sent', false)

    if (error) throw error

    for (const session of sessions24h ?? []) {
      try {
        const student = Array.isArray(session.students) ? session.students[0] : session.students
        const tutor   = Array.isArray(session.tutors)   ? session.tutors[0]   : session.tutors
        if (!student?.whatsapp || !session.zoom_link) continue

        await sendReminder24hr(
          student.whatsapp,
          tutor?.whatsapp_number ?? tutor?.phone ?? '',
          student.name,
          formatSessionTime(session.scheduled_at),
          session.zoom_link,
          tutor?.id,
        )

        // Mark reminder as sent
        await supabase
          .from('sessions')
          .update({ reminder_24h_sent: true })
          .eq('id', session.id)

        results.reminder24h++
      } catch (err) {
        results.errors.push(`24h reminder session ${session.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    results.errors.push(`24h batch error: ${String(err)}`)
  }

  // ── 2. 1-hour session reminders ───────────────────────────────────────────
  // Sessions scheduled 60–75 minutes from now, not yet reminded, paid, scheduled.
  try {
    const window1hStart = nowPlusMins(60).toISOString()
    const window1hEnd   = nowPlusMins(75).toISOString()

    const { data: sessions1h, error } = await supabase
      .from('sessions')
      .select('id, scheduled_at, zoom_link, students(id, name, whatsapp), tutors(id, name, whatsapp_number, phone)')
      .gte('scheduled_at', window1hStart)
      .lte('scheduled_at', window1hEnd)
      .eq('status', 'scheduled')
      .eq('payment_status', 'paid')
      .is('reminder_1h_sent', false)

    if (error) throw error

    for (const session of sessions1h ?? []) {
      try {
        const student = Array.isArray(session.students) ? session.students[0] : session.students
        const tutor   = Array.isArray(session.tutors)   ? session.tutors[0]   : session.tutors
        if (!student?.whatsapp || !session.zoom_link) continue

        await sendReminder1hr(
          student.whatsapp,
          tutor?.whatsapp_number ?? tutor?.phone ?? '',
          student.name,
          formatSessionTime(session.scheduled_at),
          session.zoom_link,
          tutor?.id,
        )

        await supabase
          .from('sessions')
          .update({ reminder_1h_sent: true })
          .eq('id', session.id)

        results.reminder1h++
      } catch (err) {
        results.errors.push(`1h reminder session ${session.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    results.errors.push(`1h batch error: ${String(err)}`)
  }

  // ── 3. Tutor 30-minute notice ─────────────────────────────────────────────
  // Sessions starting in 30–45 minutes, tutor not yet notified.
  try {
    const window30Start = nowPlusMins(30).toISOString()
    const window30End   = nowPlusMins(45).toISOString()

    const { data: sessions30, error } = await supabase
      .from('sessions')
      .select('id, scheduled_at, session_type, students(id, name), batches(name), tutors(id, name, whatsapp_number, phone)')
      .gte('scheduled_at', window30Start)
      .lte('scheduled_at', window30End)
      .eq('status', 'scheduled')
      .is('tutor_notified_30min', false)

    if (error) throw error

    for (const session of sessions30 ?? []) {
      try {
        const tutor   = Array.isArray(session.tutors)   ? session.tutors[0]   : session.tutors
        const student = Array.isArray(session.students) ? session.students[0] : session.students
        const batch   = Array.isArray(session.batches)  ? session.batches[0]  : session.batches
        if (!tutor?.whatsapp_number && !tutor?.phone) continue

        const who = session.session_type === 'batch'
          ? `Batch: ${batch?.name ?? 'Unknown batch'}`
          : `Student: ${student?.name ?? 'Unknown student'}`

        await sendTutorWhatsApp(
          tutor.whatsapp_number ?? tutor.phone,
          'Class in 30 minutes',
          `${who}\nTime: ${formatSessionTime(session.scheduled_at)}`,
          undefined,
          tutor.id,
        )

        await supabase
          .from('sessions')
          .update({ tutor_notified_30min: true })
          .eq('id', session.id)

        results.tutorNotified++
      } catch (err) {
        results.errors.push(`30min notice session ${session.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    results.errors.push(`30min batch error: ${String(err)}`)
  }

  // ── 4. Payment reminders (3 days before due) ──────────────────────────────
  // Payments due within 3 days, still pending, reminder not yet sent.
  try {
    const now         = new Date()
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    const { data: pendingPayments, error } = await supabase
      .from('payments')
      .select('id, amount_lkr, due_date, students(id, name, whatsapp, parent_whatsapp), tutors(id, name, whatsapp_number, phone, payment_instructions)')
      .lte('due_date', threeDaysOut.toISOString().split('T')[0])
      .gte('due_date', now.toISOString().split('T')[0])
      .eq('status', 'pending')
      .is('reminder_3day_sent', false)

    if (error) throw error

    for (const payment of pendingPayments ?? []) {
      try {
        const student = Array.isArray(payment.students) ? payment.students[0] : payment.students
        const tutor   = Array.isArray(payment.tutors)   ? payment.tutors[0]   : payment.tutors
        if (!student) continue

        // Send to student directly, or parent if student has no number
        const recipientPhone = student.whatsapp ?? student.parent_whatsapp
        if (!recipientPhone) continue

        await sendPaymentReminder(
          recipientPhone,
          tutor?.whatsapp_number ?? tutor?.phone ?? '',
          student.name,
          payment.amount_lkr,
          formatDueDate(payment.due_date),
          tutor?.payment_instructions ?? 'Contact tutor for payment details.',
          tutor?.id,
        )

        await supabase
          .from('payments')
          .update({ reminder_3day_sent: true })
          .eq('id', payment.id)

        results.paymentReminders++
      } catch (err) {
        results.errors.push(`payment reminder ${payment.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    results.errors.push(`payment reminder batch error: ${String(err)}`)
  }

  // ── 5. Block overdue students ─────────────────────────────────────────────
  // Payments past due_date + grace_period_days → set student.status='blocked'.
  try {
    const now = new Date()

    // Fetch overdue payments with tutor grace period
    const { data: overduePayments, error } = await supabase
      .from('payments')
      .select('id, due_date, student_id, students(id, status, name, whatsapp), tutors(id, name, whatsapp_number, phone, grace_period_days)')
      .eq('status', 'pending')

    if (error) throw error

    for (const payment of overduePayments ?? []) {
      try {
        const tutor   = Array.isArray(payment.tutors)   ? payment.tutors[0]   : payment.tutors
        const student = Array.isArray(payment.students) ? payment.students[0] : payment.students
        if (!student || student.status === 'blocked') continue

        const graceDays = tutor?.grace_period_days ?? 3
        const dueDate   = new Date(payment.due_date)
        const blockDate = new Date(dueDate.getTime() + graceDays * 24 * 60 * 60 * 1000)

        if (now > blockDate) {
          // Block student
          await supabase
            .from('students')
            .update({ status: 'blocked' })
            .eq('id', payment.student_id)

          // Update payment status
          await supabase
            .from('payments')
            .update({ status: 'overdue' })
            .eq('id', payment.id)

          // Notify tutor
          if (tutor?.whatsapp_number ?? tutor?.phone) {
            await sendTutorWhatsApp(
              tutor.whatsapp_number ?? tutor.phone,
              'Student blocked — overdue payment',
              `*${student.name}* has been automatically blocked.\n` +
              `Fee was due on ${formatDueDate(payment.due_date)} (grace period: ${graceDays} days).\n` +
              `No Zoom links will be sent until payment is verified.`,
              `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://smartclaz.com'}/payments`,
              tutor.id,
            )
          }

          results.studentsBlocked++
        }
      } catch (err) {
        results.errors.push(`block student payment ${payment.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    results.errors.push(`block overdue batch error: ${String(err)}`)
  }

  // ─────────────────────────────────────────────────────────
  // Release expired unpaid slot reservations (2hr hold)
  // ✅ CURRENT: Slots held 2 hours. Released automatically by this cron.
  // 📝 NOTE: Prevents one student blocking a slot indefinitely without paying.
  // 🚀 BEFORE LAUNCH: Make hold time configurable per tutor in settings.
  // ─────────────────────────────────────────────────────────
  {
    const SLOT_HOLD_HOURS = 2
    const slotNow = new Date()
    const holdExpiry = new Date(slotNow.getTime() - SLOT_HOLD_HOURS * 60 * 60 * 1000)

    const { data: expiredSlots } = await supabase
      .from('sessions')
      .select('*, students(*), tutors(*)')
      .eq('payment_status', 'pending')
      .lt('created_at', holdExpiry.toISOString())
      .eq('status', 'scheduled')

    for (const session of expiredSlots || []) {
      try {
        await supabase.from('sessions')
          .update({ status: 'cancelled' })
          .eq('id', session.id)

        const student = Array.isArray(session.students) ? session.students[0] : session.students
        const tutor   = Array.isArray(session.tutors)   ? session.tutors[0]   : session.tutors
        if (student?.whatsapp && (tutor?.whatsapp_number ?? tutor?.phone)) {
          await sendTutorWhatsApp(
            student.whatsapp,
            tutor?.whatsapp_number ?? tutor?.phone ?? '',
            `Hi ${student.name ?? 'there'} 👋\n\nYour slot reservation has expired.\n\nTo secure your spot please complete payment. Reply to book again 🙏`,
            undefined,
            tutor?.id,
          )
        }
        console.log(`⏰ Slot released: ${student?.name ?? session.id}`)
      } catch (e) {
        console.error('Slot release error:', e)
        results.errors.push(`slot release [${session.id}]: ${String(e)}`)
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Weekly batch Zoom link refresh — Sundays only
  // ─────────────────────────────────────────────────────────
  // ✅ CURRENT: isSunday guard prevents refresh running every 15 minutes.
  // 🚀 BEFORE LAUNCH: Dedicated Sunday 6am scheduled function:
  //    netlify.toml: [functions."batch-refresh"] schedule = "0 6 * * 0"
  // 📝 NOTE: Unpaid students are automatically excluded — they never receive the link.
  //    Students with status='blocked' (overdue) are also excluded.

  const now = new Date()
  const isSunday = now.getDay() === 0

  if (isSunday) {
    const { data: activeBatches } = await supabase
      .from('batches')
      .select('*, tutors(*)')
      .eq('status', 'active')

    for (const batch of activeBatches || []) {
      try {
        const todayStart = new Date(now)
        todayStart.setHours(0, 0, 0, 0)

        const alreadyRefreshed =
          batch.zoom_link_generated_at &&
          new Date(batch.zoom_link_generated_at) >= todayStart

        if (alreadyRefreshed) {
          console.log(`⏭️  Already refreshed today: ${batch.name}`)
          continue
        }

        const zoom = await createBatchZoomMeeting(
          batch.name,
          batch.schedule_day_number ?? 1,
          batch.schedule_time ?? '08:00',
          batch.tutors?.session_duration_mins ?? 60,
        )

        await supabase.from('batches').update({
          current_zoom_link:       zoom.joinUrl,
          current_zoom_meeting_id: zoom.meetingId,
          zoom_link_generated_at:  now.toISOString(),
        }).eq('id', batch.id)

        console.log(`🔄 Batch refreshed: ${batch.name} → ${zoom.joinUrl}`)

        const { data: batchStudents } = await supabase
          .from('students')
          .select('*')
          .eq('batch_id', batch.id)
          .eq('status', 'active')
          .eq('class_type', 'group')

        let notifiedCount = 0
        for (const student of batchStudents || []) {
          const { data: paidPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('student_id', student.id)
            .eq('status', 'paid')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!paidPayment) continue

          await sendZoomLink(
            student.whatsapp,
            batch.tutors?.whatsapp_number ?? batch.tutors?.phone,
            zoom.joinUrl,
            `${batch.schedule_day} at ${batch.schedule_time}`,
            student.name,
          )
          notifiedCount++
        }

        console.log(`✅ "${batch.name}": ${notifiedCount} students notified`)
        results.batchLinksRefreshed++

      } catch (e) {
        console.error(`Batch refresh error [${batch.name}]:`, e)
        results.errors.push(`batch refresh [${batch.name}]: ${String(e)}`)
      }
    }
  } else {
    console.log(`📅 Not Sunday (day ${now.getDay()}) — skipping batch refresh`)
  }

  // ── Waitlist offer expiry ─────────────────────────────────────────────────
  try {
    await expireStaleWaitlistOffers(supabase)
  } catch (e) {
    console.error('[reminders] waitlist expiry error:', e)
  }

  // ── Batch session generation ───────────────────────────────────────────────
  try {
    const { data: tutors } = await supabase
      .from('tutors')
      .select('id')

    for (const tutor of (tutors ?? []) as Array<{ id: string }>) {
      try {
        await generateBatchSessions(tutor.id, supabase)
      } catch (e) {
        console.error(`[reminders] batch session generation error for tutor ${tutor.id}:`, e)
      }
    }
  } catch (e) {
    console.error('[reminders] batch session generation error:', e)
  }

  // ── Response ──────────────────────────────────────────────────────────────
  // 📝 NOTE: Always returns 200 — cron infra must not retry on error.
  console.log('[reminders] Run complete:', results)

  return NextResponse.json({
    success:             true,
    reminder24h:         results.reminder24h,
    reminder1h:          results.reminder1h,
    tutorNotified:       results.tutorNotified,
    paymentReminders:    results.paymentReminders,
    studentsBlocked:     results.studentsBlocked,
    batchLinksRefreshed: results.batchLinksRefreshed,
    errors:              results.errors,
    timestamp:           new Date().toISOString(),
  })
}

async function expireStaleWaitlistOffers(supabase: ReturnType<typeof getServiceSupabase>) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: stale } = await supabase
    .from('waitlist')
    .select('id, student_name, tutor_id')
    .eq('status', 'offered')
    .lt('notified_at', cutoff)

  if (!stale || stale.length === 0) return

  const ids = (stale as Array<{ id: string; student_name: string }>).map(e => e.id)
  await supabase.from('waitlist')
    .update({ status: 'waiting', notified_at: null })
    .in('id', ids)

  console.log(`[reminders] Expired ${ids.length} stale waitlist offers`)
}
