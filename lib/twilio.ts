// ✅ CURRENT: Test mode — logs to console, saves to message_logs, does NOT send real WhatsApp.
// 🚀 BEFORE LAUNCH:
//    1. npm install twilio
//    2. Set WHATSAPP_TEST_MODE=false in .env.local
//    3. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM to .env.local
//    4. Uncomment Twilio client code blocks marked 🚀
// 📝 NOTE: Test mode is active when WHATSAPP_TEST_MODE=true OR NODE_ENV=development
// 🧪 TEST: Call sendWhatsApp('+94771234567', '+94777654321', 'Hello') — check console + message_logs table

import { createClient } from '@supabase/supabase-js'

// ── Supabase service-role client for server-side message_logs inserts ─────────
// 📝 NOTE: Uses service role key (bypasses RLS) — only used in API routes, never in browser.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Test mode detection ───────────────────────────────────────────────────────
function isTestMode(): boolean {
  return (
    process.env.WHATSAPP_TEST_MODE === 'true' ||
    process.env.NODE_ENV === 'development'
  )
}

// ── Message cap limits per plan ───────────────────────────────────────────────
// 📝 NOTE: Caps match pricing tiers in CLAUDE.md — Unlimited = 0 means no cap.
const PLAN_CAPS: Record<string, number> = {
  starter:   500,
  growth:    1500,
  pro:       5000,
  unlimited: 0,
}

// ── Log outbound message to message_logs ─────────────────────────────────────
async function logOutboundMessage(tutorId: string | null, costUsd: number) {
  try {
    const supabase = getServiceSupabase()
    const monthYear = new Date().toISOString().slice(0, 7) // "YYYY-MM"

    await supabase.from('message_logs').insert({
      tutor_id:   tutorId ?? null,
      direction:  'outbound',
      cost_usd:   costUsd,
      month_year: monthYear,
      created_at: new Date().toISOString(),
    })

    // ── Usage cap check ───────────────────────────────────────────────────
    // 📝 NOTE: Only checks cap if tutorId is known.
    if (tutorId) {
      const { data: tutor } = await supabase
        .from('tutors')
        .select('plan, message_count')
        .eq('id', tutorId)
        .single()

      if (tutor) {
        const cap = PLAN_CAPS[tutor.plan ?? 'starter'] ?? 500

        // Increment message_count on tutor row
        await supabase
          .from('tutors')
          .update({ message_count: (tutor.message_count ?? 0) + 1 })
          .eq('id', tutorId)

        // Alert at 80% of cap (not Unlimited)
        if (cap > 0) {
          const newCount = (tutor.message_count ?? 0) + 1
          if (newCount >= Math.floor(cap * 0.8) && newCount < cap) {
            console.warn(
              `[twilio] ⚠️  Tutor ${tutorId} at ${newCount}/${cap} messages (80% cap reached)`,
            )
            // 🚀 BEFORE LAUNCH: sendTutorWhatsApp(tutor.whatsapp_number, 'Usage warning', ...)
          }
        }
      }
    }
  } catch (err) {
    // 📝 NOTE: Log errors but do not throw — message_logs failure must never break sends.
    console.error('[twilio] Failed to log message:', err)
  }
}

// ── Core send function ────────────────────────────────────────────────────────

export async function sendWhatsApp(
  to: string,
  from: string,
  message: string,
  tutorId?: string,
): Promise<{ sid: string; test: boolean }> {
  const testMode = isTestMode()

  if (testMode) {
    // ✅ CURRENT: Test mode log
    console.log('─────────────────────────────────────────────')
    console.log('📱 WhatsApp OUT [TEST MODE]')
    console.log(`   To:   ${to}`)
    console.log(`   From: ${from}`)
    console.log(`   Body: ${message}`)
    console.log('─────────────────────────────────────────────')

    await logOutboundMessage(tutorId ?? null, 0)
    return { sid: `test_${Date.now()}`, test: true }
  }

  // 🚀 BEFORE LAUNCH: Uncomment Twilio real send below
  // ─────────────────────────────────────────────────────────────────────────
  // const twilio = require('twilio')
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  // const msg = await client.messages.create({
  //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
  //   to:   `whatsapp:${to}`,
  //   body: message,
  // })
  // const costUsd = parseFloat(msg.price ?? '0') * -1  // Twilio price is negative
  // await logOutboundMessage(tutorId ?? null, costUsd)
  // return { sid: msg.sid, test: false }
  // ─────────────────────────────────────────────────────────────────────────

  // Fallback: should never reach here in production if 🚀 block is uncommented
  throw new Error('WHATSAPP_TEST_MODE is false but Twilio client is not configured. See lib/twilio.ts 🚀 block.')
}

// ── Specialised message senders ───────────────────────────────────────────────
// 📝 NOTE: All senders default from to TWILIO_WHATSAPP_FROM env var.

// Twilio's public WhatsApp sandbox number — used only as a fallback default
// when TWILIO_WHATSAPP_FROM isn't configured. Exported so other call sites
// (e.g. payments/verify) don't duplicate this literal.
export const DEFAULT_WHATSAPP_FROM = '+14155238886'
const FROM = () => process.env.TWILIO_WHATSAPP_FROM ?? DEFAULT_WHATSAPP_FROM

/**
 * Send a Zoom link to a student after payment is verified.
 * Only called when student.status='active' AND payment='paid'.
 */
export async function sendZoomLink(
  studentPhone: string,
  tutorPhone: string,
  zoomLink: string,
  sessionTime: string,
  studentName: string,
  tutorId?: string,
): Promise<void> {
  const message =
    `Hi *${studentName}*! 🎉\n\n` +
    `Your class is confirmed.\n\n` +
    `📅 Time: ${sessionTime}\n` +
    `🔗 Join here: ${zoomLink}\n\n` +
    `Please join on time. The link is valid for this session only.\n\n` +
    `— ${tutorPhone}`

  await sendWhatsApp(studentPhone, FROM(), message, tutorId)
}

/**
 * Send 24-hour reminder to student.
 * Includes Zoom link so student has it ready.
 */
export async function sendReminder24hr(
  studentPhone: string,
  tutorPhone: string,
  studentName: string,
  sessionTime: string,
  zoomLink: string,
  tutorId?: string,
): Promise<void> {
  const message =
    `Hi *${studentName}*! 👋\n\n` +
    `Reminder: Your class is *tomorrow*.\n\n` +
    `📅 Time: ${sessionTime}\n` +
    `🔗 Zoom link: ${zoomLink}\n\n` +
    `See you then! — ${tutorPhone}`

  await sendWhatsApp(studentPhone, FROM(), message, tutorId)
}

/**
 * Send 1-hour reminder to student.
 */
export async function sendReminder1hr(
  studentPhone: string,
  tutorPhone: string,
  studentName: string,
  sessionTime: string,
  zoomLink: string,
  tutorId?: string,
): Promise<void> {
  const message =
    `Hi *${studentName}*! ⏰\n\n` +
    `Your class starts in *1 hour*.\n\n` +
    `📅 Time: ${sessionTime}\n` +
    `🔗 Zoom link: ${zoomLink}\n\n` +
    `Get ready! — ${tutorPhone}`

  await sendWhatsApp(studentPhone, FROM(), message, tutorId)
}

/**
 * Send payment reminder to student (or parent).
 * Called 3 days before due date, on due date, and overdue.
 */
export async function sendPaymentReminder(
  studentPhone: string,
  tutorPhone: string,
  studentName: string,
  amountLkr: number,
  dueDate: string,
  paymentInstructions: string,
  tutorId?: string,
): Promise<void> {
  const message =
    `Hi *${studentName}*! 💳\n\n` +
    `Friendly reminder: Your monthly fee of *LKR ${amountLkr.toLocaleString()}* is due by *${dueDate}*.\n\n` +
    `Payment details:\n${paymentInstructions}\n\n` +
    `Please pay and send a screenshot here to confirm. Thank you! 🙏\n\n` +
    `— ${tutorPhone}`

  await sendWhatsApp(studentPhone, FROM(), message, tutorId)
}

/**
 * Send an overdue-payment notice to student (or parent).
 * Called once a payment crosses the tutor's due-date + grace-period window.
 * Distinct from sendPaymentReminder (3-day / due-date stages) so the tone
 * can reflect that grace has already elapsed.
 */
export async function sendOverduePaymentReminder(
  studentPhone: string,
  tutorPhone: string,
  studentName: string,
  amountLkr: number,
  daysOverdue: number,
  paymentInstructions: string,
  tutorId?: string,
): Promise<void> {
  const message =
    `Hi *${studentName}*! ⚠️\n\n` +
    `Your monthly fee of *LKR ${amountLkr.toLocaleString()}* is now *${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue*.\n\n` +
    `Payment details:\n${paymentInstructions}\n\n` +
    `Please pay as soon as possible and send a screenshot here to confirm. Thank you! 🙏\n\n` +
    `— ${tutorPhone}`

  await sendWhatsApp(studentPhone, FROM(), message, tutorId)
}

/**
 * Send a notification message to the tutor (not the student).
 * Used for: new bookings, payment receipts, bot-stuck alerts, etc.
 */
export async function sendTutorWhatsApp(
  tutorPhone: string,
  title: string,
  body: string,
  link?: string,
  tutorId?: string,
): Promise<void> {
  const message =
    `*${title}*\n\n${body}` +
    (link ? `\n\n🔗 ${link}` : '')

  await sendWhatsApp(tutorPhone, FROM(), message, tutorId)
}
