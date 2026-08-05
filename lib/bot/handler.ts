/*
 * BOT SAFETY RULES:
 * ✅ FIX 6: Never invents prices/discounts — CRITICAL RULES in claude-intent.ts
 * ✅ FIX 7: Prompt injection sanitized before Claude — in claude-intent.ts
 * ✅ FIX 2: Returning student detected — in process-webhook.ts
 * ✅ FIX 3: Payment reference requested and stored
 * ✅ FIX 4: 2hr slot hold (was 24hr) + 1 active reservation per student
 */

import type { SubjectEntry } from '@/lib/types/subjects'
import { formatSubjectsForWhatsApp, formatFeeForConfirmation } from '@/lib/types/subjects'
import { classifyIntent } from '@/lib/bot/claude-intent'
import type { MessageHistoryEntry } from '@/lib/bot/claude-intent'

// ── Types ──────────────────────────────────────────────────────────────────

export type BotStep =
  | 'greeting'
  | 'collect_name'
  | 'collect_subject'
  | 'collect_grade'
  | 'collect_class_type'
  | 'await_consent'
  | 'awaiting_payment'
  | 'awaiting_payment_reference'
  | 'awaiting_trial_payment'       // paid trial — waiting for student payment
  | 'trial_pending_verification'   // payment ref given, waiting tutor to verify
  | 'existing_student'
  | 'awaiting_waitlist'            // student asked to join waitlist, awaiting YES/NO
  | 'awaiting_waitlist_confirm'    // offer was sent, awaiting YES/NO to confirm spot

export interface BotContext {
  step: BotStep
  student_name?: string
  chosen_subject?: string
  chosen_grade?: string
  chosen_class_type?: 'individual' | 'batch' | 'trial'
  /** ✅ CURRENT: Counts consecutive failed matches in the current step.
   *  When attempts >= 3, bot declares notifyTutor side effect. */
  attempts?: number
  // Trial fields
  trial_type?: 'none' | 'free' | 'paid'
  trial_fee?: number
  monthly_fee?: number
  trial_payment_reference?: string
  // Waitlist fields
  waitlistId?: string
  targetBatchId?: string
  targetBatchName?: string
  targetBatchFee?: number
  offerExpiresAt?: string
  [key: string]: unknown  // Index signature for Record<string, unknown> compatibility
}

/** Data the bot needs about the tutor — provider-agnostic. */
export interface TutorData {
  id: string
  name: string
  phone?: string
  whatsapp_number?: string
  subjects: SubjectEntry[]
  payment_instructions: string
}

/**
 * Actions the webhook processor should run after sending the bot reply.
 * Keeping side-effects out of the handler keeps it a pure function
 * that is easy to test and independent of any provider.
 */
export interface BotSideEffects {
  /** Send a notification to the tutor (push + messaging). */
  notifyTutor?: string
  /** Student just consented — persist to DB. */
  recordConsent?: true
  /**
   * Generate a class link and send it to the student.
   * The webhook processor picks the right VideoProvider and MessagingProvider.
   */
  sendMeetingLink?: {
    studentChannelId: string
    subject: string
    grade: string
    classType: 'individual' | 'batch' | 'trial'
  }
  // Trial side effects:
  createTrialStudent?: {
    trialType: 'free' | 'paid'
    trialFee: number
    monthlyFee: number
    subject: string
    grade: string
  }
  saveTrialPaymentRef?: {
    reference: string
  }
  /** Save payment reference for a regular (non-trial) pending payment. */
  savePaymentRef?: {
    reference: string
    studentWhatsapp: string
  }
  // Waitlist side effects:
  waitlistJoin?: {
    studentName: string
    studentWhatsapp: string
    subject: string
    grade: string
    batchId: string
    batchName: string
  }
  waitlistConfirm?: {
    waitlistId: string
    batchId: string
    studentName: string
    studentWhatsapp: string
    batchName: string
    batchFee: number
  }
  waitlistDecline?: {
    waitlistId: string
  }
}

export interface BotResult {
  reply: string
  nextContext: BotContext
  sideEffects?: BotSideEffects
}

// ── Stuck detection ────────────────────────────────────────────────────────
// 📝 NOTE: If a student fails to progress 3 times in a row, the bot pauses
//    and notifies the tutor to step in manually.
const MAX_ATTEMPTS = 3

function incrementAttempts(context: BotContext): BotContext {
  return { ...context, attempts: (context.attempts ?? 0) + 1 }
}

function resetAttempts(context: BotContext): BotContext {
  return { ...context, attempts: 0 }
}

function isStuck(context: BotContext): boolean {
  return (context.attempts ?? 0) >= MAX_ATTEMPTS
}

/**
 * Smarter stuck detection that uses message history.
 * Checks whether the last 3 student messages were all in the same step,
 * without a recent tutor manual reply that would reset the situation.
 *
 * ✅ CURRENT: 3 same-state student messages triggers stuck.
 * 📝 NOTE: Tutor recent reply resets stuck detection to avoid false positives.
 * 🚀 BEFORE LAUNCH: Make stuck_threshold configurable per tutor in tutors.settings.
 */
export function isConversationStuck(
  context: BotContext,
  messageHistory: MessageHistoryEntry[],
): boolean {
  // Only look at STUDENT messages — ignore bot and tutor replies
  const recentStudentMsgs = messageHistory
    .filter(m => m.from === 'student')
    .slice(-3)

  if (recentStudentMsgs.length < 3) return false

  // All 3 recent student messages in the same state = stuck
  const allSameState = recentStudentMsgs
    .every(m => m.state === (context.step ?? (context as Record<string, unknown>).state))

  // If tutor recently replied (last 5 messages), don't trigger stuck
  // — give bot a chance to continue after manual handover
  const tutorRecentlyReplied = messageHistory
    .slice(-5)
    .some(m => m.from === 'tutor')

  if (tutorRecentlyReplied) return false

  return allSameState
}

function stuckResponse(context: BotContext, tutorName: string): BotResult {
  return {
    reply:
      `Sorry for the confusion! 🙏 *${tutorName}* will personally reply shortly.`,
    nextContext: { ...context, step: 'existing_student', attempts: 0 },
    sideEffects: {
      notifyTutor:
        `🔄 Bot stuck — step: *${context.step}*, ` +
        `student: *${context.student_name ?? '?'}* — please take over.`,
    },
  }
}

// ── Reply builders ─────────────────────────────────────────────────────────

function subjectListReply(tutorName: string, subjects: SubjectEntry[]): string {
  return (
    `Hello! 👋 I'm the assistant for *${tutorName}*.\n\n` +
    `We offer:\n\n${formatSubjectsForWhatsApp(subjects)}\n\n` +
    `Please reply with the *number* or *subject name* you're interested in.`
  )
}

function gradeListReply(subject: string, subjects: SubjectEntry[]): string {
  const entry = subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase())
  if (!entry) return `Sorry, I couldn't find *${subject}*. Please choose from the list.`
  const lines = entry.grades.map((g, i) => `${i + 1}. ${g.grade}`).join('\n')
  return `Great choice! For *${subject}* we teach:\n\n${lines}\n\nWhich grade level are you in? Reply with the number or grade name.`
}

function classTypeReply(subject: string, grade: string, subjects: SubjectEntry[]): string {
  const entry = subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase())
  const gc    = entry?.grades.find(g => g.grade.toLowerCase() === grade.toLowerCase())
  if (!gc) return `Sorry, we don't offer *${subject}* at *${grade}*. Please choose from the list.`

  // Support both v1 flat schema (group_fee, trial_type, trial_fee) and
  // v2 nested schema (has_group, batches[], individual_trial_type, individual_trial_fee)
  const raw = gc as unknown as Record<string, unknown>
  const hasGroup = gc.has_group && (gc.batches?.length ?? 0) > 0
    || (typeof raw.group_fee === 'number' && raw.group_fee > 0)
  const trialType = gc.individual_trial_type
    ?? (raw.trial_type as 'none' | 'free' | 'paid' | undefined)
    ?? 'none'
  const trialFeeAmt = gc.individual_trial_fee
    ?? (typeof raw.trial_fee === 'number' ? raw.trial_fee : 0)

  const options: string[] = []
  let idx = 1
  if (gc.individual_fee) {
    options.push(`${idx++}. *Individual* — ${formatFeeForConfirmation(subjects, subject, grade, 'individual')}`)
  }
  if (hasGroup) {
    options.push(`${idx++}. *Group* — ${formatFeeForConfirmation(subjects, subject, grade, 'batch')}`)
  }

  // Only offer trial if trial_type is not 'none'
  const hasTrial = trialType === 'free' || trialType === 'paid'
  if (hasTrial) {
    const trialDesc = trialType === 'free'
      ? 'Free — no payment needed!'
      : `LKR ${trialFeeAmt.toLocaleString()} (one time)`
    const trialNote = trialType === 'paid'
      ? '\n   Deducted from first month if you join!'
      : '\n   No commitment — try before joining!'
    options.push(`${idx}. *Trial class* — ${trialDesc}${trialNote}`)
  }

  return (
    `For *${subject} (${grade})*, available class types:\n\n` +
    `${options.join('\n')}\n\n` +
    `Please reply with the number or type name.`
  )
}

// ── State machine ──────────────────────────────────────────────────────────
//
// Pure function — no I/O, no provider imports except claude-intent.
// Side effects are declared in BotResult.sideEffects and executed by
// the caller (process-webhook.ts) using the appropriate providers.

export async function handleBotMessage(
  text: string,
  context: BotContext,
  tutor: TutorData,
  messageHistory: MessageHistoryEntry[] = [],
  from = '',
): Promise<BotResult> {
  const t = text.trim()
  const ctx = context
  const { subjects } = tutor

  // Build subjects string for Claude context
  const subjectsStr = subjects.map((s, i) => `${i + 1}. ${s.subject}`).join(', ')

  switch (context.step) {

    // ── greeting / collect_name ───────────────────────────────────────────
    case 'greeting':
    case 'collect_name': {
      // FIX 2: Returning student — greet them by name with action menu
      if (context['isReturning'] && context['existingStudentName']) {
        return {
          reply:
            `Welcome back ${context['existingStudentName']}! 👋\n\n` +
            `How can I help you today?\n\n` +
            `1️⃣ Book a new class\n` +
            `2️⃣ Reschedule a class\n` +
            `3️⃣ Ask a question`,
          nextContext: {
            ...context,
            step: 'existing_student',
            student_name: String(context['existingStudentName']),
          },
        }
      }

      if (!t) {
        return {
          reply: `Hi! 👋 I'm the assistant for *${tutor.name}*. What's your name?`,
          nextContext: resetAttempts({ ...context, step: 'collect_name' }),
        }
      }

      // Use Claude to determine if this is a name vs random text
      const intent = await classifyIntent(t, 'collect_name', context as Record<string, unknown>, tutor.name, subjectsStr, messageHistory)

      if (intent.type === 'greeting') {
        return {
          reply: `Hi! 👋 I'm the assistant for *${tutor.name}*. What's your name?`,
          nextContext: resetAttempts({ ...context, step: 'collect_name' }),
        }
      }

      if (intent.type === 'provide_name' && intent.value) {
        const name = String(intent.value)
        return {
          reply: subjectListReply(tutor.name, subjects),
          nextContext: resetAttempts({ ...context, step: 'collect_subject', student_name: name }),
        }
      }

      // Treat anything as a name (lenient — students often just type their name)
      if (t.length >= 2 && t.length <= 50) {
        return {
          reply: subjectListReply(tutor.name, subjects),
          nextContext: resetAttempts({ ...context, step: 'collect_subject', student_name: t }),
        }
      }

      // Too short or suspicious
      const next = incrementAttempts(context)
      if (isStuck(next)) return stuckResponse(next, tutor.name)
      return {
        reply: `Sorry, I didn't catch your name. What should I call you? 😊`,
        nextContext: { ...next, step: 'collect_name' },
      }
    }

    // ── collect_subject ───────────────────────────────────────────────────
    case 'collect_subject': {
      const intent = await classifyIntent(t, 'collect_subject', context as Record<string, unknown>, tutor.name, subjectsStr, messageHistory)

      let match: SubjectEntry | undefined

      // Pick by number (e.g. "1", "2")
      if (intent.type === 'pick_number' && typeof intent.value === 'number') {
        match = subjects[intent.value - 1]
      }

      // Pick by name (exact or Claude-extracted)
      if (!match && (intent.type === 'pick_subject' || intent.type === 'other')) {
        const val = intent.type === 'pick_subject' && intent.value ? String(intent.value) : t
        match = subjects.find(s => s.subject.toLowerCase() === val.toLowerCase())
      }

      // Fuzzy fallback — partial match
      if (!match) {
        match = subjects.find(s => s.subject.toLowerCase().includes(t.toLowerCase()))
      }

      if (!match) {
        const next = incrementAttempts(context)
        if (isStuck(next)) return stuckResponse(next, tutor.name)
        return {
          reply: `Sorry, I didn't recognise that subject.\n\n${subjectListReply(tutor.name, subjects)}`,
          nextContext: next,
        }
      }

      return {
        reply: gradeListReply(match.subject, subjects),
        nextContext: resetAttempts({ ...context, step: 'collect_grade', chosen_subject: match.subject }),
      }
    }

    // ── collect_grade ─────────────────────────────────────────────────────
    case 'collect_grade': {
      const entry = subjects.find(s => s.subject.toLowerCase() === context.chosen_subject!.toLowerCase())
      const grades = entry?.grades ?? []
      const gradeNames = grades.map(g => g.grade).join(', ')

      const intent = await classifyIntent(t, 'collect_grade', context as Record<string, unknown>, tutor.name, gradeNames, messageHistory)

      let grade: (typeof grades)[number] | undefined

      // Pick by number
      if (intent.type === 'pick_number' && typeof intent.value === 'number') {
        grade = grades[intent.value - 1]
      }

      // Pick by grade name
      if (!grade && (intent.type === 'pick_grade' || intent.type === 'other')) {
        const val = intent.type === 'pick_grade' && intent.value ? String(intent.value) : t
        grade = grades.find(g => g.grade.toLowerCase() === val.toLowerCase())
      }

      // Fuzzy fallback
      if (!grade) {
        grade = grades.find(g => g.grade.toLowerCase().includes(t.toLowerCase()))
      }

      if (!grade) {
        const next = incrementAttempts(context)
        if (isStuck(next)) return stuckResponse(next, tutor.name)
        return {
          reply: gradeListReply(context.chosen_subject!, subjects),
          nextContext: next,
        }
      }

      // grade IS the GradeConfig object — store trial info for use in trial states
      const gc = grade
      return {
        reply: classTypeReply(context.chosen_subject!, grade.grade, subjects),
        nextContext: resetAttempts({
          ...context,
          step:         'collect_class_type',
          chosen_grade: grade.grade,
          // Store grade config so trial states can reference fees without re-lookup
          trial_type:   gc.individual_trial_type ?? (gc as unknown as Record<string, unknown>).trial_type as string ?? 'none',
          trial_fee:    gc.individual_trial_fee ?? (gc as unknown as Record<string, unknown>).trial_fee as number ?? 0,
          monthly_fee:  gc.individual_fee ?? 0,
        }),
      }
    }

    // ── collect_class_type ────────────────────────────────────────────────
    case 'collect_class_type': {
      const intent = await classifyIntent(t, 'collect_class_type', context as Record<string, unknown>, tutor.name, subjectsStr, messageHistory)

      let classType: BotContext['chosen_class_type']

      // Number pick: 1=individual, 2=batch, 3=trial
      if (intent.type === 'pick_number' && typeof intent.value === 'number') {
        if (intent.value === 1) classType = 'individual'
        else if (intent.value === 2) classType = 'batch'
        else if (intent.value === 3) classType = 'trial'
      }

      // Named pick from Claude
      if (!classType && intent.type === 'pick_class_type' && intent.value) {
        classType = intent.value as BotContext['chosen_class_type']
      }

      // Fallback string matching
      if (!classType) {
        const lower = t.toLowerCase()
        if (lower.includes('individual'))                        classType = 'individual'
        else if (lower.includes('batch') || lower.includes('group')) classType = 'batch'
        else if (lower.includes('trial'))                        classType = 'trial'
      }

      if (!classType) {
        const next = incrementAttempts(context)
        if (isStuck(next)) return stuckResponse(next, tutor.name)
        return {
          reply: `Please reply with *1* (Individual), *2* (Batch), or *3* (Trial).`,
          nextContext: next,
        }
      }

      // ── Trial class path ─────────────────────────────────────────────────
      if (classType === 'trial') {
        const trialType = context.trial_type as 'none' | 'free' | 'paid' | undefined

        // Trial not offered for this grade
        if (!trialType || trialType === 'none') {
          return {
            reply:
              `Sorry, trial classes are not available for *${context.chosen_subject} (${context.chosen_grade})*.\n\n` +
              `Please choose: *1* (Individual) or *2* (Group), or contact sir for more info.`,
            nextContext: incrementAttempts(context),
          }
        }

        // Free trial
        if (trialType === 'free') {
          return {
            reply:
              `Trial class booked!\n\n` +
              `Subject: *${context.chosen_grade} ${context.chosen_subject}*\n` +
              `Cost: FREE — no payment needed\n\n` +
              `Please share your full name if not already given, and sir will be in touch to confirm your trial class date and time.`,
            nextContext: resetAttempts({ ...context, step: 'existing_student', chosen_class_type: 'trial' }),
            sideEffects: {
              createTrialStudent: {
                trialType:   'free',
                trialFee:    0,
                monthlyFee:  context.monthly_fee as number ?? 0,
                subject:     context.chosen_subject!,
                grade:       context.chosen_grade!,
              },
              notifyTutor:
                `New *free trial* student!\n` +
                `*${context.student_name ?? 'Unknown'}* · ${context.chosen_grade} ${context.chosen_subject}\n` +
                `Please schedule their trial class and confirm.`,
            },
          }
        }

        // Paid trial
        if (trialType === 'paid') {
          const trialFee    = context.trial_fee as number ?? 0
          const monthlyFee  = context.monthly_fee as number ?? 0
          return {
            reply:
              `Subject: *${context.chosen_grade} ${context.chosen_subject}* — Trial Class\n\n` +
              `Trial fee: *LKR ${trialFee.toLocaleString()}*\n` +
              `This will be deducted from your first month if you join!\n\n` +
              `Monthly fee:      LKR ${monthlyFee.toLocaleString()}\n` +
              `Trial deduction: -LKR ${trialFee.toLocaleString()}\n` +
              `First month:      LKR ${(monthlyFee - trialFee).toLocaleString()}\n\n` +
              `Please pay *LKR ${trialFee.toLocaleString()}* to confirm your trial class:\n\n` +
              `Reply with your payment reference when done.`,
            nextContext: resetAttempts({ ...context, step: 'awaiting_trial_payment', chosen_class_type: 'trial' }),
            sideEffects: {
              createTrialStudent: {
                trialType:   'paid',
                trialFee,
                monthlyFee,
                subject:     context.chosen_subject!,
                grade:       context.chosen_grade!,
              },
              notifyTutor:
                `New *paid trial* student!\n` +
                `*${context.student_name ?? 'Unknown'}* · ${context.chosen_grade} ${context.chosen_subject}\n` +
                `Trial fee: LKR ${trialFee.toLocaleString()} — awaiting payment`,
            },
          }
        }
      }

      // ── Regular class path (individual / batch) ──────────────────────────
      const fee = formatFeeForConfirmation(subjects, context.chosen_subject!, context.chosen_grade!, classType)
      return {
        reply:
          `Perfect!\n\nBooking summary:\n` +
          `• Subject: *${context.chosen_subject}*\n` +
          `• Grade: *${context.chosen_grade}*\n` +
          `• Class type: *${classType[0].toUpperCase() + classType.slice(1)}*\n` +
          `• Fee: *${fee}*\n\n` +
          `Class rules:\n` +
          `1. Attend on time — class starts without waiting\n` +
          `2. Monthly fees due by the 5th\n` +
          `3. Reschedule requests require 24 hours notice\n` +
          `4. Maintain discipline and respect during class\n\n` +
          `Reply *AGREE* to confirm you have read and accept these rules.`,
        nextContext: resetAttempts({ ...context, step: 'await_consent', chosen_class_type: classType }),
      }
    }

    // ── await_consent ─────────────────────────────────────────────────────
    case 'await_consent': {
      const intent = await classifyIntent(t, 'await_consent', context as Record<string, unknown>, tutor.name, subjectsStr, messageHistory)

      if (intent.type !== 'agreement' && t.toUpperCase() !== 'AGREE') {
        const next = incrementAttempts(context)
        if (isStuck(next)) return stuckResponse(next, tutor.name)
        return {
          reply: `Please reply *AGREE* to confirm you have read and accept the class rules.`,
          nextContext: next,
        }
      }

      return {
        reply:
          `✅ Booking confirmed!\n\nPayment details:\n\n` +
          `${tutor.payment_instructions}\n\n` +
          `Please make your payment and send a screenshot here. ` +
          `Your class link will be sent once payment is verified by the tutor.`,
        nextContext: resetAttempts({ ...context, step: 'awaiting_payment' }),
        sideEffects: {
          recordConsent: true,
          notifyTutor:
            `🎉 New booking from *${context.student_name}*\n` +
            `${context.chosen_subject} · ${context.chosen_grade} · ${context.chosen_class_type}`,
        },
      }
    }

    // ── awaiting_trial_payment ────────────────────────────────────────────
    case 'awaiting_trial_payment': {
      // Any non-empty message is treated as payment reference
      const reference = t.trim().slice(0, 80)
      if (!reference) {
        return {
          reply: `Please send your payment reference number or screenshot to confirm your trial class.`,
          nextContext: { ...context },
        }
      }
      return {
        reply:
          `Thank you! Reference noted:\n\n` +
          `*${reference}*\n\n` +
          `Sir will verify your payment and confirm your trial class soon.\n\n` +
          `We'll message you with the class details!`,
        nextContext: resetAttempts({ ...context, step: 'trial_pending_verification', trial_payment_reference: reference }),
        sideEffects: {
          saveTrialPaymentRef: { reference },
          notifyTutor:
            `*Trial payment reference* received!\n` +
            `*${context.student_name ?? 'Student'}* · ${context.chosen_grade} ${context.chosen_subject}\n` +
            `Trial fee: LKR ${(context.trial_fee as number ?? 0).toLocaleString()}\n` +
            `Ref: *${reference}*\n\n` +
            `Please verify and confirm their trial class.`,
        },
      }
    }

    // ── trial_pending_verification ────────────────────────────────────────
    case 'trial_pending_verification': {
      // Student messages while waiting for verification
      return {
        reply:
          `Your trial payment is being verified by sir.\n\n` +
          `We'll send you the class details very soon! Please be patient.`,
        nextContext: { ...context },
      }
    }

    // ── awaiting_payment ──────────────────────────────────────────────────
    case 'awaiting_payment': {
      const lower = t.toLowerCase()
      const paymentDone =
        lower.includes('paid') || lower.includes('done') ||
        lower.includes('transfer') || lower.includes('sent') ||
        lower.includes('payment')

      if (!paymentDone) {
        // Also check Claude intent for edge cases
        const intent = await classifyIntent(t, 'awaiting_payment', context as Record<string, unknown>, tutor.name, subjectsStr, messageHistory)

        if (intent.type === 'question' && intent.answer) {
          return {
            reply: intent.answer,
            nextContext: { ...context },
          }
        }

        return {
          reply: `No problem! Please complete payment and let us know when done 🙏\nYour slot is held for 2 hours. ⏰`,
          nextContext: { ...context },
        }
      }

      // FIX 3: Try to extract reference number from message
      const refMatch = t.match(/\b([A-Z0-9]{6,20})\b/i)
      const reference = refMatch ? refMatch[1] : null

      if (reference) {
        return {
          reply:
            `Thank you! Reference *${reference}* noted 🙏\n\n` +
            `${tutor.name} will verify shortly and send your class link.`,
          nextContext: { ...context, step: 'existing_student', paymentReference: reference },
          sideEffects: {
            savePaymentRef: { reference, studentWhatsapp: from },
            notifyTutor:
              `💰 Payment received from *${context.student_name ?? 'student'}*\n` +
              `Ref: *${reference}*\nPlease verify and mark as paid.`,
          },
        }
      }

      // No reference found — ask for it
      return {
        reply:
          `Thank you! 🙏\n\nCould you share the payment reference number or last 4 digits of the transfer?\n\nThis helps ${tutor.name} verify quickly ✅`,
        nextContext: { ...context, step: 'awaiting_payment_reference' },
      }
    }

    // ── awaiting_payment_reference ────────────────────────────────────────
    case 'awaiting_payment_reference': {
      // Any response treated as the reference
      const reference = t.trim().slice(0, 50)
      return {
        reply:
          `Got it! Reference *${reference}* noted 🙏\n\n` +
          `${tutor.name} will verify shortly and send your class link.`,
        nextContext: { ...context, step: 'existing_student', paymentReference: reference },
        sideEffects: {
          savePaymentRef: { reference, studentWhatsapp: from },
          notifyTutor:
            `💰 Payment from *${context.student_name ?? 'student'}*\n` +
            `Ref: *${reference}*\nPlease verify and mark as paid.`,
        },
      }
    }

    // ── existing_student ──────────────────────────────────────────────────
    case 'existing_student': {
      const intent = await classifyIntent(t, 'existing_student', context as Record<string, unknown>, tutor.name, subjectsStr, messageHistory)

      // FIX 6: Refer to tutor for anything bot should not handle (discounts, refunds, etc.)
      if (intent.type === 'refer_to_tutor') {
        return {
          reply: `For that request, please contact ${tutor.name} directly 🙏\nYou can message anytime and ${tutor.name} will get back to you.`,
          nextContext: { ...context },
        }
      }

      if (intent.type === 'reschedule') {
        return {
          reply:
            `I've forwarded your reschedule request to *${tutor.name}*. 🙏\n\n` +
            `They will confirm the new time shortly.`,
          nextContext: { ...context },
          sideEffects: {
            notifyTutor: `📅 *${context.student_name ?? 'A student'}* wants to reschedule. Message: "${t}"`,
          },
        }
      }

      if (intent.type === 'payment_done') {
        return {
          reply:
            `Thank you! 🙏 *${tutor.name}* will verify your payment and send the class link.`,
          nextContext: { ...context },
          sideEffects: {
            notifyTutor: `💰 *${context.student_name ?? 'A student'}* says they have paid. Message: "${t}"`,
          },
        }
      }

      if (intent.type === 'question' && intent.answer) {
        return {
          reply: intent.answer,
          nextContext: { ...context },
        }
      }

      // Default: pass to tutor
      return {
        reply: `One moment please — *${tutor.name}* will reply shortly. 🙏`,
        nextContext: { ...context },
        sideEffects: {
          notifyTutor: `💬 *${context.student_name ?? 'A student'}* sent: "${t}"`,
        },
      }
    }

    // ── awaiting_waitlist ─────────────────────────────────────────────────
    case 'awaiting_waitlist': {
      const isYes = /\byes\b/i.test(t) || t.trim() === '1'
      if (isYes) {
        return {
          reply:
            `✅ You've been added to the waitlist for ${ctx.targetBatchName}!\n\n` +
            `Sir will message you when a spot opens 🙏\n\n` +
            `We'll reach out to this number.`,
          nextContext: { ...ctx, step: 'greeting' as BotStep, waitlistId: undefined, targetBatchId: undefined, targetBatchName: undefined, targetBatchFee: undefined, offerExpiresAt: undefined },
          sideEffects: {
            waitlistJoin: {
              studentName: ctx.student_name ?? 'Student',
              studentWhatsapp: from,
              subject: ctx.chosen_subject ?? '',
              grade: ctx.chosen_grade ?? '',
              batchId: ctx.targetBatchId ?? '',
              batchName: ctx.targetBatchName ?? '',
            },
          },
        }
      }
      return {
        reply: `No problem! Feel free to message again anytime 🙏`,
        nextContext: { ...ctx, step: 'greeting' as BotStep },
        sideEffects: {},
      }
    }

    // ── awaiting_waitlist_confirm ─────────────────────────────────────────
    case 'awaiting_waitlist_confirm': {
      const isYes = /\byes\b/i.test(t) || t.trim() === '1'
      if (isYes) {
        if (ctx.offerExpiresAt && new Date() > new Date(ctx.offerExpiresAt as string)) {
          return {
            reply: `Sorry, this offer has expired. Please message again and we'll check availability 🙏`,
            nextContext: { ...ctx, step: 'greeting' as BotStep },
            sideEffects: { waitlistDecline: { waitlistId: ctx.waitlistId as string } },
          }
        }
        return {
          reply:
            `🎉 Great! We're enrolling you in ${ctx.targetBatchName ?? 'the batch'}.\n\n` +
            `To confirm your spot, please make your first payment:\n\n` +
            `💰 LKR ${(ctx.targetBatchFee as number ?? 0).toLocaleString()}/month\n\n` +
            `Reply with your payment reference when done 🙏`,
          nextContext: { ...ctx, step: 'awaiting_payment' as BotStep, fromWaitlist: true },
          sideEffects: {
            waitlistConfirm: {
              waitlistId: ctx.waitlistId as string,
              batchId: ctx.targetBatchId as string,
              studentName: ctx.student_name ?? 'Student',
              studentWhatsapp: from,
              batchName: ctx.targetBatchName as string,
              batchFee: ctx.targetBatchFee as number,
            },
          },
        }
      }
      return {
        reply: `No problem! 🙏 If you change your mind, feel free to message again.`,
        nextContext: { ...ctx, step: 'greeting' as BotStep },
        sideEffects: { waitlistDecline: { waitlistId: ctx.waitlistId as string } },
      }
    }

    // ── default (unknown step) ────────────────────────────────────────────
    default: {
      return {
        reply: `One moment please — *${tutor.name}* will reply shortly. 🙏`,
        nextContext: { ...context },
        sideEffects: {
          notifyTutor: `🤖 Bot stuck — step: ${context.step}, student: *${context.student_name ?? '?'}*, msg: "${t}"`,
        },
      }
    }
  }
}
