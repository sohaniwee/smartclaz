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
  sendOverduePaymentReminder,
  sendZoomLink,
} from '@/lib/twilio'
import { createBatchZoomMeeting } from '@/lib/zoom'
import { generateBatchSessions } from '@/lib/sessions/generate-batch-sessions'
import { generateIndividualSessions } from '@/lib/sessions/generate-individual-sessions'
import { computeOverdueStatus, computeEscalationStatus } from '@/lib/payment-status'

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
    reminder24h:            0,
    reminder1h:             0,
    tutorNotified:          0,
    paymentReminders3Day:   0,
    paymentRemindersDue:    0,
    paymentsNewlyOverdue:   0,
    overdueRemindersSent:   0,
    tutorSummariesSent:     0,
    escalationPingsSent:    0,
    studentsBlocked:        0, // always 0 — blocking is manual-only, cron never sets this
    batchLinksRefreshed:    0,
    errors:                 [] as string[],
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

        // Mark reminder as sent — checked so a silent failure here doesn't
        // cause the same reminder to be resent every 15 minutes forever.
        const { error: flagErr24h } = await supabase
          .from('sessions')
          .update({ reminder_24h_sent: true })
          .eq('id', session.id)
        if (flagErr24h) throw flagErr24h

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

        const { error: flagErr1h } = await supabase
          .from('sessions')
          .update({ reminder_1h_sent: true })
          .eq('id', session.id)
        if (flagErr1h) throw flagErr1h

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

        const { error: flagErr30min } = await supabase
          .from('sessions')
          .update({ tutor_notified_30min: true })
          .eq('id', session.id)
        if (flagErr30min) throw flagErr30min

        results.tutorNotified++
      } catch (err) {
        results.errors.push(`30min notice session ${session.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    results.errors.push(`30min batch error: ${String(err)}`)
  }

  // ── 4+5. Payment reminders — 3-day / due-date / overdue stages ────────────
  // ✅ CURRENT: "Is this payment overdue" is NEVER read from a stored/frozen
  //    due_date column. It's computed live, every run, from computeOverdueStatus()
  //    using the tutor's CURRENT monthly_due_date + grace_period_days settings —
  //    the same function Dashboard, Students, Payments and Batches all use, so
  //    they can never disagree with each other.
  // 📝 NOTE: Blocking a student is ALWAYS a manual tutor action (via the
  //    [Block student] button on Dashboard/Payments) — this cron NEVER sets
  //    students.status='blocked', regardless of the tutor's notify preference.
  // 📝 NOTE: auto_notify_overdue=true → message students directly at all 3
  //    stages. auto_notify_overdue=false → only the tutor is notified, via a
  //    single batched WhatsApp summary per run, and the tutor sends reminders
  //    manually from the Payments/Dashboard [Send reminder] buttons.
  try {
    type TutorRow = {
      id: string
      monthly_due_date: number | null
      grace_period_days: number | null
      whatsapp_number: string | null
      phone: string | null
      payment_instructions: string | null
      auto_notify_overdue: boolean | null
      block_reminder_enabled: boolean | null
      block_reminder_days: number | null
    }

    const { data: tutors, error: tutorsErr } = await supabase
      .from('tutors')
      .select('id, monthly_due_date, grace_period_days, whatsapp_number, phone, payment_instructions, auto_notify_overdue, block_reminder_enabled, block_reminder_days')

    if (tutorsErr) throw tutorsErr

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const tutor of (tutors ?? []) as TutorRow[]) {
      try {
        const monthlyDueDate      = tutor.monthly_due_date  ?? 28
        const gracePeriodDays     = tutor.grace_period_days ?? 3
        const tutorPhone          = tutor.whatsapp_number ?? tutor.phone ?? ''
        const autoNotify          = tutor.auto_notify_overdue ?? true
        const blockReminderEnabled = tutor.block_reminder_enabled ?? true
        const blockReminderDays    = tutor.block_reminder_days ?? null

        type StudentRel = { id: string; name: string; whatsapp: string; parent_whatsapp: string | null }

        type RawPending = {
          id: string
          amount_lkr: number
          month_year: string | null
          status: string
          is_trial_payment: boolean | null
          reminder_3day_sent: boolean | null
          reminder_due_sent: boolean | null
          reminder_overdue_sent: boolean | null
          tutor_notified_3day: boolean | null
          tutor_notified_due: boolean | null
          escalation_notified: boolean | null
          students: StudentRel | StudentRel[] | null
        }

        const { data: pendingPayments, error: paymentsErr } = await supabase
          .from('payments')
          .select('id, amount_lkr, month_year, status, is_trial_payment, reminder_3day_sent, reminder_due_sent, reminder_overdue_sent, tutor_notified_3day, tutor_notified_due, escalation_notified, students(id, name, whatsapp, parent_whatsapp)')
          .eq('tutor_id', tutor.id)
          .in('status', ['pending', 'overdue'])

        if (paymentsErr) throw paymentsErr

        const threeDayReminders: RawPending[] = []
        const dueDateReminders:  RawPending[] = []
        const newlyOverdue:      RawPending[] = []
        // One-time escalation ping — distinct from the regular batched
        // summary below. Fires exactly once per payment (escalation_notified
        // flips to true immediately), regardless of how many times this
        // cron runs afterward. Independent of autoNotify: that setting only
        // controls messages to STUDENTS, this is always tutor-facing.
        const newlyEscalated: Array<RawPending & { studentName: string; daysOverdue: number }> = []

        for (const raw of (pendingPayments ?? []) as unknown as RawPending[]) {
          const student = Array.isArray(raw.students) ? raw.students[0] : raw.students
          if (!student || raw.is_trial_payment || !raw.month_year) continue

          const { isOverdue, daysOverdue, dueDate } = computeOverdueStatus(
            monthlyDueDate, gracePeriodDays, raw.month_year, raw.status,
          )

          const { isEscalated } = computeEscalationStatus(daysOverdue, blockReminderEnabled, blockReminderDays)
          if (isEscalated && !raw.escalation_notified) {
            try {
              const { error: escalationFlagErr } = await supabase.from('payments')
                .update({ escalation_notified: true })
                .eq('id', raw.id)
              if (escalationFlagErr) throw escalationFlagErr
              newlyEscalated.push({ ...raw, studentName: student.name, daysOverdue })
            } catch (err) {
              results.errors.push(`escalation flag ${raw.id}: ${String(err)}`)
            }
          }

          const recipientPhone = student.whatsapp ?? student.parent_whatsapp
          const threeDaysBefore = new Date(dueDate)
          threeDaysBefore.setDate(dueDate.getDate() - 3)

          // ── 3-day-before stage ──
          if (
            today.toDateString() === threeDaysBefore.toDateString() &&
            !raw.reminder_3day_sent &&
            !raw.tutor_notified_3day
          ) {
            try {
              if (autoNotify && recipientPhone) {
                await sendPaymentReminder(
                  recipientPhone, tutorPhone, student.name, raw.amount_lkr,
                  formatDueDate(dueDate.toISOString().split('T')[0]),
                  tutor.payment_instructions ?? 'Contact tutor for payment details.',
                  tutor.id,
                )
                results.paymentReminders3Day++
              } else if (!autoNotify) {
                threeDayReminders.push(raw)
              }
              const { error: flagErr3day } = await supabase.from('payments')
                .update(autoNotify ? { reminder_3day_sent: true } : { tutor_notified_3day: true })
                .eq('id', raw.id)
              if (flagErr3day) throw flagErr3day
            } catch (err) {
              results.errors.push(`3day reminder ${raw.id}: ${String(err)}`)
            }
          }

          // ── due-date stage ──
          if (
            today.toDateString() === dueDate.toDateString() &&
            !raw.reminder_due_sent &&
            !raw.tutor_notified_due
          ) {
            try {
              if (autoNotify && recipientPhone) {
                await sendPaymentReminder(
                  recipientPhone, tutorPhone, student.name, raw.amount_lkr,
                  formatDueDate(dueDate.toISOString().split('T')[0]),
                  tutor.payment_instructions ?? 'Contact tutor for payment details.',
                  tutor.id,
                )
                results.paymentRemindersDue++
              } else if (!autoNotify) {
                dueDateReminders.push(raw)
              }
              const { error: flagErrDue } = await supabase.from('payments')
                .update(autoNotify ? { reminder_due_sent: true } : { tutor_notified_due: true })
                .eq('id', raw.id)
              if (flagErrDue) throw flagErrDue
            } catch (err) {
              results.errors.push(`due-date reminder ${raw.id}: ${String(err)}`)
            }
          }

          // ── overdue stage ──
          // Always label the payment 'overdue' once grace has elapsed —
          // internal status flag only, never blocks anyone.
          if (isOverdue && raw.status !== 'overdue') {
            try {
              // Checked, and the message is only sent after this succeeds:
              // unlike the 3-day/due-date stages, there's no separate
              // "already notified" flag for the overdue stage — the status
              // flip itself is what stops this from firing again next run.
              // If the message were sent unconditionally on a silent write
              // failure, the student would get the same overdue notice
              // every 15 minutes until the write eventually succeeds.
              const { error: overdueFlagErr } = await supabase.from('payments')
                .update({ status: 'overdue' })
                .eq('id', raw.id)
              if (overdueFlagErr) throw overdueFlagErr

              if (autoNotify && recipientPhone) {
                await sendOverduePaymentReminder(
                  recipientPhone, tutorPhone, student.name, raw.amount_lkr, daysOverdue,
                  tutor.payment_instructions ?? 'Contact tutor for payment details.',
                  tutor.id,
                )
                results.overdueRemindersSent++
              }

              newlyOverdue.push(raw)
              results.paymentsNewlyOverdue++

              // ⚠️ NEVER runs, on purpose:
              // await supabase.from('students').update({ status: 'blocked' })
              // Blocking is ALWAYS a manual tutor click via the
              // Payments/Dashboard [Block student] button — never automatic,
              // regardless of this tutor's notify preference.
            } catch (err) {
              results.errors.push(`overdue label ${raw.id}: ${String(err)}`)
            }
          }
        }

        // ── One-time escalation pings ──
        // Sent as their own distinct WhatsApp message — different tone,
        // different purpose — even if it lands in the same cron run as the
        // regular batched summary below.
        for (const escalated of newlyEscalated) {
          try {
            await sendTutorWhatsApp(
              tutorPhone,
              'Payment needs a decision',
              `🚨 ${escalated.studentName} just crossed your ${blockReminderDays}-day flag for overdue payments.\n\n` +
                `LKR ${escalated.amount_lkr.toLocaleString()} · ${escalated.daysOverdue} days overdue\n\n` +
                `Might be time to decide — remind, mark paid, or block access:\n` +
                `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://smartclaz.com'}/payments`,
              undefined,
              tutor.id,
            )

            await supabase.from('notifications').insert({
              tutor_id:   tutor.id,
              type:       'payment_escalation',
              title:      `${escalated.studentName} needs a decision`,
              body:       `${escalated.daysOverdue} days overdue — past your ${blockReminderDays}-day flag`,
              action_url: '/payments',
              read:       false,
            })

            results.escalationPingsSent++
          } catch (err) {
            results.errors.push(`escalation ping ${escalated.id}: ${String(err)}`)
          }
        }

        // ── Batched tutor notification ──
        const parts: string[] = []

        if (!autoNotify) {
          if (threeDayReminders.length > 0) {
            parts.push(`${threeDayReminders.length} payment${threeDayReminders.length > 1 ? 's' : ''} due in 3 days`)
          }
          if (dueDateReminders.length > 0) {
            parts.push(`${dueDateReminders.length} payment${dueDateReminders.length > 1 ? 's' : ''} due today`)
          }
        }

        // Exclude anything that already got its own escalation ping above —
        // the escalation ping takes priority as the stronger signal, so the
        // same payment shouldn't also show up in the regular summary.
        const newlyOverdueForSummary = newlyOverdue.filter(
          p => !newlyEscalated.some(e => e.id === p.id),
        )

        if (newlyOverdueForSummary.length > 0) {
          const names = newlyOverdueForSummary
            .map(p => (Array.isArray(p.students) ? p.students[0] : p.students)?.name)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ')
          const extra = newlyOverdueForSummary.length > 3 ? ` and ${newlyOverdueForSummary.length - 3} more` : ''

          parts.push(
            autoNotify
              ? `${newlyOverdueForSummary.length} student${newlyOverdueForSummary.length > 1 ? 's' : ''} now overdue — reminder sent automatically (${names}${extra})`
              : `${newlyOverdueForSummary.length} student${newlyOverdueForSummary.length > 1 ? 's are' : ' is'} now overdue: ${names}${extra}`,
          )
        }

        if (parts.length > 0 && tutorPhone) {
          await sendTutorWhatsApp(
            tutorPhone,
            'Payment update',
            parts.map(p => `• ${p}`).join('\n') +
              (!autoNotify ? `\n\nReview and send reminders:\n${process.env.NEXT_PUBLIC_APP_URL ?? 'https://smartclaz.com'}/payments` : ''),
            undefined,
            tutor.id,
          )
          results.tutorSummariesSent++

          await supabase.from('notifications').insert({
            tutor_id:   tutor.id,
            type:       'payment_reminder_summary',
            title:      'Payment reminders update',
            body:       parts.join(' · '),
            action_url: '/payments',
            read:       false,
          })
        }
      } catch (err) {
        results.errors.push(`payment reminders for tutor ${tutor.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    results.errors.push(`payment reminders batch error: ${String(err)}`)
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

        const { error: zoomSaveErr } = await supabase.from('batches').update({
          current_zoom_link:       zoom.joinUrl,
          current_zoom_meeting_id: zoom.meetingId,
          zoom_link_generated_at:  now.toISOString(),
        }).eq('id', batch.id)

        if (zoomSaveErr) {
          // Non-fatal to the loop (other batches still get refreshed), but
          // worth surfacing: a new Zoom meeting was created (real API cost)
          // and never saved — next run will detect zoom_link_generated_at
          // as stale and generate yet another one.
          results.errors.push(`batch zoom save [${batch.name}]: ${String(zoomSaveErr)}`)
          continue
        }

        // Log the meeting ID, not the full join URL — the URL is effectively
        // a bearer credential for the meeting and shouldn't land in logs.
        console.log(`🔄 Batch refreshed: ${batch.name} → meeting ${zoom.meetingId}`)

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
      try {
        await generateIndividualSessions(tutor.id, supabase)
      } catch (e) {
        console.error(`[reminders] individual session generation error for tutor ${tutor.id}:`, e)
      }
    }
  } catch (e) {
    console.error('[reminders] batch session generation error:', e)
  }

  // ── Response ──────────────────────────────────────────────────────────────
  // 📝 NOTE: Always returns 200 — cron infra must not retry on error.
  console.log('[reminders] Run complete:', results)

  return NextResponse.json({
    success:               true,
    reminder24h:           results.reminder24h,
    reminder1h:            results.reminder1h,
    tutorNotified:         results.tutorNotified,
    paymentReminders3Day:  results.paymentReminders3Day,
    paymentRemindersDue:   results.paymentRemindersDue,
    paymentsNewlyOverdue:  results.paymentsNewlyOverdue,
    overdueRemindersSent:  results.overdueRemindersSent,
    tutorSummariesSent:    results.tutorSummariesSent,
    escalationPingsSent:   results.escalationPingsSent,
    studentsBlocked:       results.studentsBlocked, // always 0 — blocking is manual-only
    batchLinksRefreshed:   results.batchLinksRefreshed,
    errors:                results.errors,
    timestamp:             new Date().toISOString(),
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
