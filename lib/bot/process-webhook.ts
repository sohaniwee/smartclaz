import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { handleBotMessage } from '@/lib/bot/handler'
import type { BotContext, TutorData } from '@/lib/bot/handler'
import type { MessageHistoryEntry } from '@/lib/bot/claude-intent'
import { sendTutorWhatsApp, sendZoomLink } from '@/lib/twilio'
import { createZoomMeeting } from '@/lib/zoom'

// ── Supabase service-role client ───────────────────────────────────────────
// 📝 NOTE: Service role bypasses RLS — ONLY used server-side in API routes.
//    Never expose this client to the browser.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── getTutorByChannel ──────────────────────────────────────────────────────
// ✅ CURRENT: Queries tutors table by whatsapp_number (for Twilio) or telegram_chat_id.
// 📝 NOTE: Only returns tutors with status='active' — blocked/suspended tutors get 404.

async function getTutorByChannel(
  channelId: string,
  providerId: string,
): Promise<TutorData | null> {
  const supabase = getServiceSupabase()

  // 📝 NOTE: channelId for WhatsApp is the tutor's registered number (the "To" field from Twilio).
  //    For Telegram it would be the bot's chat ID. Extend here when adding new providers.
  const col = providerId === 'telegram' ? 'telegram_chat_id' : 'whatsapp_number'

  const { data, error } = await supabase
    .from('tutors')
    .select('id, name, phone, whatsapp_number, subjects, payment_instructions, reschedule_policy, noshow_policy')
    .eq(col, channelId)
    .maybeSingle()

  if (error) {
    console.error('[db] getTutorByChannel error:', error.message)
    return null
  }

  if (!data) {
    console.log('[db] getTutorByChannel: no tutor found for', channelId, 'via', providerId)
    return null
  }

  return {
    id:                   data.id,
    name:                 data.name,
    phone:                data.phone,
    whatsapp_number:      data.whatsapp_number,
    subjects:             data.subjects ?? [],
    payment_instructions: data.payment_instructions ?? 'Contact tutor for payment details.',
  }
}

// ── Conversation shape ──────────────────────────────────────────────────────
// 📝 NOTE: messages is stored as MessageHistoryEntry[] so that process-webhook,
//    handler.ts, and claude-intent.ts all use the same shape:
//    { from: 'student'|'bot'|'tutor', message: string, state?: string, time: string }
//    The 'tutor' variant is written when the tutor replies via the dashboard chat page.

interface ConversationRow {
  id:       string
  status:   'bot' | 'human' | 'resolved'
  context:  BotContext
  messages: MessageHistoryEntry[]
}

// ── getConversation ─────────────────────────────────────────────────────────
// ✅ CURRENT: Finds existing conversation OR creates a new one.
// 📝 NOTE: New conversations start at step='greeting' with status='bot'.

async function getConversation(
  tutorId: string,
  studentChannelId: string,
): Promise<ConversationRow> {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, status, context, messages')
    .eq('tutor_id', tutorId)
    .eq('student_whatsapp', studentChannelId)
    .maybeSingle()

  if (error) {
    console.error('[db] getConversation select error:', error.message)
  }

  if (data) {
    return {
      id:       data.id,
      status:   data.status   ?? 'bot',
      context:  data.context  ?? { step: 'greeting' },
      messages: (data.messages ?? []) as MessageHistoryEntry[],
    }
  }

  // Create new conversation record
  const { data: created, error: insertErr } = await supabase
    .from('conversations')
    .insert({
      tutor_id:         tutorId,
      student_whatsapp: studentChannelId,
      status:           'bot',
      context:          { step: 'greeting' },
      messages:         [],
      last_message_at:  new Date().toISOString(),
      created_at:       new Date().toISOString(),
    })
    .select('id, status, context, messages')
    .single()

  if (insertErr) {
    console.error('[db] getConversation insert error:', insertErr.message)
    // Return in-memory fallback so the bot can still respond
    return {
      id:       '',
      status:   'bot',
      context:  { step: 'greeting' },
      messages: [],
    }
  }

  return {
    id:       created.id,
    status:   created.status   ?? 'bot',
    context:  created.context  ?? { step: 'greeting' },
    messages: (created.messages ?? []) as MessageHistoryEntry[],
  }
}

// ── saveContext ─────────────────────────────────────────────────────────────
// ✅ CURRENT: Persists updated bot context + appends message history.
//    Messages are stored as MessageHistoryEntry[] so claude-intent.ts can use them directly.

async function saveContext(
  conversationId: string,
  context: BotContext,
  studentMessage?: string,
  botReply?: string,
  currentStep?: string,
) {
  if (!conversationId) return  // In-memory fallback — no DB row to update

  const supabase = getServiceSupabase()

  // Read current messages so we can append
  const { data: existing } = await supabase
    .from('conversations')
    .select('messages')
    .eq('id', conversationId)
    .single()

  const messages: MessageHistoryEntry[] = (existing?.messages ?? []) as MessageHistoryEntry[]

  // Append student message and bot reply using MessageHistoryEntry shape
  if (studentMessage) {
    messages.push({
      from:    'student',
      message: studentMessage,
      state:   currentStep,
      time:    new Date().toISOString(),
    })
  }
  if (botReply) {
    messages.push({
      from:    'bot',
      message: botReply,
      time:    new Date().toISOString(),
    })
  }

  // ✅ CURRENT: Message history capped at 100 entries per conversation.
  // 🚀 BEFORE LAUNCH — Data retention policy:
  //    conversations.messages: clear after 1 year (keep conversation record)
  //    message_logs: retain 2 years (cost tracking)
  //    audit_logs: retain 3 years (security investigations)
  //    payments: retain 7 years (financial/tax records)
  //    student records: keep while active + 1 year after last class
  //    Add scheduled cleanup job and /privacy page before WhatsApp Business approval.
  const trimmed = messages.slice(-100)

  const { error } = await supabase
    .from('conversations')
    .update({
      context:         context,
      messages:        trimmed,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  if (error) {
    console.error('[db] saveContext error:', error.message)
  }
}

// ── saveConsent ─────────────────────────────────────────────────────────────
// ✅ CURRENT: Stamps consent_given=true with timestamp on the student row.

async function saveConsent(tutorId: string, studentChannelId: string) {
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('students')
    .update({
      consent_given: true,
      consent_at:    new Date().toISOString(),
    })
    .eq('tutor_id', tutorId)
    .eq('whatsapp', studentChannelId)

  if (error) {
    // 📝 NOTE: Student row may not exist yet (created during bot flow).
    //    This is non-fatal — log and continue.
    console.error('[db] saveConsent error:', error.message)
  }
}

// ── checkReturningStudent ───────────────────────────────────────────────────
// ✅ CURRENT: Checks students table for existing phone before starting onboarding.
// 📝 NOTE: Prevents duplicate records for the same student.
//    If returning on new phone — notifies tutor to verify before confirming.

async function checkReturningStudent(
  studentPhone: string,
  tutorId: string,
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<{ isReturning: boolean; student: Record<string, unknown> | null }> {
  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('tutor_id', tutorId)
    .eq('whatsapp', studentPhone)
    .maybeSingle()
  return { isReturning: !!data, student: data as Record<string, unknown> | null }
}

// ── notifyTutor ─────────────────────────────────────────────────────────────
// ✅ CURRENT: Sends WhatsApp to tutor via lib/twilio.ts.
// 🚀 BEFORE LAUNCH: Also send web push notification in parallel.

async function notifyTutor(tutorId: string, message: string) {
  const supabase = getServiceSupabase()

  const { data: tutor } = await supabase
    .from('tutors')
    .select('whatsapp_number, phone, name')
    .eq('id', tutorId)
    .single()

  if (!tutor) {
    console.warn('[notify] Tutor not found for ID:', tutorId)
    return
  }

  const tutorPhone = tutor.whatsapp_number ?? tutor.phone
  if (!tutorPhone) {
    console.warn('[notify] Tutor has no phone/whatsapp_number:', tutorId)
    return
  }

  const chatLink = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://smartclaz.com'}/chats`

  try {
    // ✅ CURRENT: WhatsApp notification
    await sendTutorWhatsApp(
      tutorPhone,
      'Smartclaz Alert',
      message,
      chatLink,
      tutorId,
    )
  } catch (err) {
    console.error('[notify] sendTutorWhatsApp error:', err)
  }

  // 🚀 BEFORE LAUNCH: Uncomment web push notification below
  // try {
  //   await sendWebPush(tutorId, 'Smartclaz', message)
  // } catch (err) {
  //   console.error('[notify] sendWebPush error:', err)
  // }
}

// ── Per-phone rate limiting ─────────────────────────────────────────────────
// ✅ CURRENT: 30 messages per phone per hour.
// 📝 NOTE: Prevents a student from flooding the bot and consuming tutor's message cap.
// 🚀 BEFORE LAUNCH: Make limit configurable. Consider lower limit for unknown numbers.
const MESSAGE_RATE_LIMIT = 30
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

async function isPhoneRateLimited(
  phone: string,
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabase
    .from('message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('student_phone', phone)
    .gte('created_at', windowStart)
  return (count ?? 0) >= MESSAGE_RATE_LIMIT
}

// ── Per-tutor message cap ───────────────────────────────────────────────────
const MESSAGE_CAPS: Record<string, number> = {
  trial:     500,
  starter:   500,
  growth:    1500,
  pro:       5000,
  unlimited: Infinity,
}

// ✅ CURRENT: Enforces monthly message caps per tutor plan.
//    Warns at 80%. Stops bot at 100%.
// 📝 NOTE: In test mode (cost_usd=0) messages are still counted toward the cap.
// 🚀 BEFORE LAUNCH: Show cap usage on tutor dashboard settings page.
async function checkTutorMessageCap(
  tutor: { id: string; plan?: string; whatsapp_number?: string; phone?: string; name?: string },
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<{ allowed: boolean; used: number; cap: number }> {
  const monthYear = new Date().toISOString().slice(0, 7)
  const { count } = await supabase
    .from('message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tutor_id', tutor.id)
    .eq('month_year', monthYear)

  const used = count ?? 0
  const cap = MESSAGE_CAPS[tutor.plan ?? 'starter'] ?? 500

  // Warn at 80%
  if (used >= cap * 0.8 && used < cap) {
    sendTutorWhatsApp(
      tutor.whatsapp_number ?? tutor.phone ?? '',
      '⚠️ Message limit warning',
      `You've used ${used}/${cap} messages this month (${Math.round(used / cap * 100)}%). Consider upgrading your plan.`,
      undefined,
      tutor.id,
    ).catch(() => {})
  }

  return { allowed: used < cap, used, cap }
}

// ── Core processor ─────────────────────────────────────────────────────────
//
// Called by both the dynamic /api/messaging/[provider]/webhook route and the
// legacy /api/whatsapp/webhook route.  Adding a new provider requires only
// registering it in lib/providers/messaging.ts — this function doesn't change.

export async function processWebhook(
  req: NextRequest,
  providerId: string,
): Promise<NextResponse> {
  try {
    const messaging = getMessagingProvider(providerId)

    // 1. Read body once — providers that verify signatures need the raw string.
    const rawBody = await req.text()

    // ─────────────────────────────────────────────────────────────
    // Twilio Signature Validation
    // ✅ CURRENT: Skipped when WHATSAPP_TEST_MODE=true (dev only).
    // 🚀 BEFORE LAUNCH: Set WHATSAPP_TEST_MODE=false.
    //    Twilio signs every request with TWILIO_AUTH_TOKEN.
    //    Unsigned requests are rejected with 403.
    // 📝 NOTE: Without this, anyone can POST fake student messages
    //    → fake bookings → Zoom links sent → tutor revenue manipulated.
    // ─────────────────────────────────────────────────────────────
    const isTestMode = process.env.WHATSAPP_TEST_MODE === 'true'

    if (!isTestMode) {
      // 🚀 BEFORE LAUNCH: Uncomment this block after installing twilio: npm install twilio
      //
      // import twilio from 'twilio'
      // const signature = req.headers.get('X-Twilio-Signature') || ''
      // const url = process.env.NEXT_PUBLIC_APP_URL + '/api/whatsapp/webhook'
      // const params = Object.fromEntries(body)
      // const valid = twilio.validateRequest(
      //   process.env.TWILIO_AUTH_TOKEN!,
      //   signature, url, params
      // )
      // if (!valid) {
      //   return new NextResponse('Forbidden', { status: 403 })
      // }

      // 2. Verify webhook authenticity via provider-level check.
      // 🚀 BEFORE LAUNCH: Uncomment Twilio signature validation in lib/providers/messaging.ts
      if (!await messaging.verifyWebhook(req, rawBody)) {
        return new NextResponse('Unauthorized', { status: 401 })
      }
    } else {
      console.log('⚠️  Signature validation skipped — WHATSAPP_TEST_MODE=true')
    }

    // 3. Parse into a normalised IncomingMessage.
    const incoming = messaging.parseRawBody(rawBody)
    if (!incoming.text) return messaging.buildResponse(null)

    // 4. Look up the tutor this webhook is for.
    const tutor = await getTutorByChannel(incoming.to, providerId)
    if (!tutor) {
      console.warn('[webhook] No tutor found for channel:', incoming.to)
      return new NextResponse('Tutor not found', { status: 404 })
    }

    // 4a. FIX 8: Per-phone rate limiting
    {
      const supabase = getServiceSupabase()
      if (await isPhoneRateLimited(incoming.from, supabase)) {
        console.log(`⚠️  Rate limited: ${incoming.from}`)

        // ✅ CURRENT: Rate limit hit → hand to tutor (not silent block).
        // 📝 NOTE: High message frequency may mean student is confused, urgent,
        //    or sharing a phone. Better to connect with tutor than block silently.
        // 🧪 TEST: Send 31 messages quickly → bot pauses + tutor notified

        // 1. Tell student politely
        await messaging.send(
          incoming.from,
          `Let me connect you with ${tutor.name} directly 🙏\n\nSir will reply to you shortly.`,
        )

        // 2. Pause bot — set conversation to human mode
        const rateLimitConversation = await getConversation(tutor.id, incoming.from)
        if (rateLimitConversation.id) {
          await supabase
            .from('conversations')
            .update({ status: 'human' })
            .eq('id', rateLimitConversation.id)
        }

        // 3. Notify tutor via WhatsApp
        await notifyTutor(
          tutor.id,
          `⚠️ Student ${incoming.from} hit message rate limit — may need help. Conversation handed to you.`,
        )

        return messaging.buildResponse(null)
      }
    }

    // 4b. FIX 11: Per-tutor message cap
    {
      const supabase = getServiceSupabase()
      const capCheck = await checkTutorMessageCap(tutor, supabase)
      if (!capCheck.allowed) {
        console.log(`🚫 Tutor ${tutor.id} hit message cap (${capCheck.used}/${capCheck.cap})`)
        await messaging.send(
          incoming.from,
          `Sorry, we're unable to process your message right now. Please contact ${tutor.name} directly 🙏`,
        )
        return messaging.buildResponse(null)
      }
    }

    // 5. Get or create the conversation record.
    const conversation = await getConversation(tutor.id, incoming.from)

    // 5a. Returning student detection — enrich context so handler can greet them correctly.
    if (conversation.context.step === 'greeting' || conversation.context.step === 'collect_name') {
      const supabase = getServiceSupabase()
      const { isReturning, student } = await checkReturningStudent(incoming.from, tutor.id, supabase)
      if (isReturning && student) {
        conversation.context = {
          ...conversation.context,
          isReturning:          true,
          existingStudentName:  String((student as Record<string, unknown>).name ?? ''),
          existingStudentId:    String((student as Record<string, unknown>).id ?? ''),
        }
      }
    }

    // 6. Human-mode: tutor has taken over — forward message and stay silent.
    if (conversation.status === 'human') {
      // Save message to history so tutor can see it in the dashboard.
      // from: 'student' so Claude has full context when bot mode resumes.
      // 📝 NOTE: Tutor manual replies (from: 'tutor') are added when the tutor
      //    sends from the dashboard chat page (built separately).
      //    For now, only student messages during human mode are captured here.
      // 🚀 BEFORE LAUNCH: Wire dashboard chat reply to store { from: 'tutor', message, time }
      //    in conversations.messages so Claude has full context.
      await saveContext(
        conversation.id,
        conversation.context,
        incoming.text,
        undefined,
        conversation.context.step,
      )

      await notifyTutor(
        tutor.id,
        `💬 Message from ${incoming.from}:\n"${incoming.text}"`,
      )
      return messaging.buildResponse(null)
    }

    // ─────────────────────────────────────────────────────────────
    // FIX 13: Blocked student check
    // ✅ CURRENT: Blocked students get one polite response, then silence.
    // 📝 NOTE: Blocking does NOT delete student record or payment history.
    //    Tutor can unblock from dashboard anytime.
    // 🧪 TEST: Set students.blocked_at = now() in Supabase, send a message.
    // ─────────────────────────────────────────────────────────────
    {
      const supabase = getServiceSupabase()
      const { data: blockedCheck } = await supabase
        .from('students')
        .select('blocked_at')
        .eq('tutor_id', tutor.id)
        .eq('whatsapp', incoming.from)
        .not('blocked_at', 'is', null)
        .maybeSingle()

      if (blockedCheck?.blocked_at) {
        const alreadyNotified = conversation.context?.['block_notified']
        if (!alreadyNotified) {
          await messaging.send(
            incoming.from,
            `Please contact ${tutor.name} directly for assistance 🙏`,
          )
          if (conversation.id) {
            await saveContext(conversation.id, {
              ...conversation.context,
              block_notified: true,
            } as BotContext)
          }
        }
        return messaging.buildResponse(null)
      }
    }

    // 7. Bot-mode: run the provider-agnostic state machine.
    const { reply, nextContext, sideEffects } = await handleBotMessage(
      incoming.text,
      conversation.context,
      tutor,
      (conversation.messages ?? []) as MessageHistoryEntry[],
      incoming.from,
    )

    // 8. Persist updated conversation context + message history.
    await saveContext(
      conversation.id,
      nextContext,
      incoming.text,
      reply,
      conversation.context.step,
    )

    // 9. Execute declared side effects.

    if (sideEffects?.recordConsent) {
      await saveConsent(tutor.id, incoming.from)
    }

    if (sideEffects?.notifyTutor) {
      await notifyTutor(tutor.id, sideEffects.notifyTutor)
    }

    if (sideEffects?.sendMeetingLink) {
      try {
        // 1. Create Zoom meeting
        const zoomMeeting = await createZoomMeeting(
          `${sideEffects.sendMeetingLink.subject} · ${sideEffects.sendMeetingLink.grade} — ${tutor.name}`,
          new Date(),   // 📝 NOTE: TODO resolve actual session time from sessions table
          60,
        )

        // 2. Save zoom_link and zoom_meeting_id to sessions table.
        // Always filter by student_id to avoid race conditions when multiple
        // students are in onboarding simultaneously.
        const supabase = getServiceSupabase()
        const { data: student } = await supabase
          .from('students')
          .select('id')
          .eq('tutor_id', tutor.id)
          .eq('whatsapp', incoming.from)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!student?.id) {
          console.warn('[webhook] sendMeetingLink: student not found for', incoming.from)
        }

        // Build the session query — require student_id filter to be safe.
        // If student record is missing, skip session update (non-fatal).
        const { data: session } = student?.id
          ? await supabase
              .from('sessions')
              .select('id, scheduled_at')
              .eq('tutor_id', tutor.id)
              .eq('student_id', student.id)
              .eq('status', 'scheduled')
              .gte('scheduled_at', new Date().toISOString())
              .order('scheduled_at', { ascending: true })
              .limit(1)
              .maybeSingle()
          : { data: null }

        if (session?.id) {
          await supabase
            .from('sessions')
            .update({
              zoom_link:       zoomMeeting.joinUrl,
              zoom_meeting_id: zoomMeeting.meetingId,
            })
            .eq('id', session.id)
        }

        // 3. Send Zoom link to student
        await sendZoomLink(
          sideEffects.sendMeetingLink.studentChannelId,
          tutor.whatsapp_number ?? tutor.phone ?? '',
          zoomMeeting.joinUrl,
          'Your upcoming class',  // 📝 NOTE: TODO resolve actual session time
          tutor.name,
          tutor.id,
        )
      } catch (zoomErr) {
        console.error('[webhook] sendMeetingLink error:', zoomErr)
        // Non-fatal — bot reply still goes through
      }
    }

    // Handle trial student creation
    if (sideEffects?.createTrialStudent) {
      try {
        const supabase = getServiceSupabase()
        const { createTrialStudent: trial } = sideEffects

        // Check if student record already exists
        const { data: existingStudent } = await supabase
          .from('students')
          .select('id, trial_status')
          .eq('tutor_id', tutor.id)
          .eq('whatsapp', incoming.from)
          .maybeSingle()

        if (!existingStudent) {
          const { data: newStudent } = await supabase
            .from('students')
            .insert({
              tutor_id:       tutor.id,
              name:           nextContext.student_name ?? 'Unknown',
              whatsapp:       incoming.from,
              subject:        trial.subject,
              grade:          trial.grade,
              class_type:     'trial',
              monthly_fee:    trial.monthlyFee,
              trial_fee_paid: 0,
              trial_status:   'scheduled',
              status:         'pending',
              consent_given:  false,
              created_at:     new Date().toISOString(),
            })
            .select('id')
            .single()

          // For paid trial: create pending payment record
          if (trial.trialType === 'paid' && newStudent?.id) {
            await supabase.from('payments').insert({
              tutor_id:         tutor.id,
              student_id:       newStudent.id,
              amount_lkr:       trial.trialFee,
              full_fee:         trial.trialFee,
              payment_type:     'per_session',
              is_trial_payment: true,
              trial_deduction:  0,
              status:           'pending',
              month_year:       new Date().toISOString().slice(0, 7),
              created_at:       new Date().toISOString(),
            })
          }
        }
      } catch (err) {
        console.error('[webhook] createTrialStudent error:', err)
      }
    }

    // Handle trial payment reference save
    if (sideEffects?.saveTrialPaymentRef) {
      try {
        const supabase = getServiceSupabase()
        const { reference } = sideEffects.saveTrialPaymentRef

        // Update student's trial status to 'completed' (payment given, awaiting verification)
        const { data: student } = await supabase
          .from('students')
          .update({ trial_status: 'completed' })
          .eq('tutor_id', tutor.id)
          .eq('whatsapp', incoming.from)
          .eq('trial_status', 'scheduled')
          .select('id')
          .single()

        // Save reference to pending trial payment
        if (student?.id) {
          await supabase
            .from('payments')
            .update({ payment_reference: reference })
            .eq('tutor_id', tutor.id)
            .eq('student_id', student.id)
            .eq('is_trial_payment', true)
            .eq('status', 'pending')
        }
      } catch (err) {
        console.error('[webhook] saveTrialPaymentRef error:', err)
      }
    }

    // Handle savePaymentRef: persist reference for regular (non-trial) pending payment
    if (sideEffects?.savePaymentRef) {
      try {
        const supabase = getServiceSupabase()
        const { reference, studentWhatsapp } = sideEffects.savePaymentRef

        // Look up the student record
        const { data: studentRec } = await supabase
          .from('students')
          .select('id')
          .eq('tutor_id', tutor.id)
          .eq('whatsapp', studentWhatsapp)
          .maybeSingle()

        if (studentRec?.id) {
          // Update the most recent pending payment for this student
          const { data: payment } = await supabase
            .from('payments')
            .select('id')
            .eq('tutor_id', tutor.id)
            .eq('student_id', studentRec.id)
            .eq('status', 'pending')
            .eq('is_trial_payment', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (payment?.id) {
            await supabase
              .from('payments')
              .update({ payment_reference: reference })
              .eq('id', payment.id)
          }
        }
      } catch (err) {
        console.error('[webhook] savePaymentRef error:', err)
      }
    }

    // Handle waitlistJoin side effect
    if (sideEffects?.waitlistJoin) {
      try {
        const supabase = getServiceSupabase()
        const wj = sideEffects.waitlistJoin
        const { count: position } = await supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .eq('batch_id', wj.batchId)
          .eq('status', 'waiting')

        await supabase.from('waitlist').insert({
          tutor_id: tutor.id,
          student_name: wj.studentName,
          student_whatsapp: wj.studentWhatsapp,
          subject: wj.subject,
          grade: wj.grade,
          batch_id: wj.batchId,
          status: 'waiting',
        })
        console.log(`[bot] ${wj.studentName} added to waitlist for ${wj.batchName} at position ${(position ?? 0) + 1}`)
      } catch (err) {
        console.error('[webhook] waitlistJoin error:', err)
      }
    }

    // Handle waitlistDecline side effect
    if (sideEffects?.waitlistDecline) {
      try {
        const supabase = getServiceSupabase()
        await supabase.from('waitlist')
          .update({ status: 'expired' })
          .eq('id', sideEffects.waitlistDecline.waitlistId)
      } catch (err) {
        console.error('[webhook] waitlistDecline error:', err)
      }
    }

    // Handle waitlistConfirm side effect
    if (sideEffects?.waitlistConfirm) {
      try {
        const supabase = getServiceSupabase()
        const wc = sideEffects.waitlistConfirm

        await supabase.from('waitlist').update({ status: 'enrolled' }).eq('id', wc.waitlistId)

        const { data: newStudent } = await supabase.from('students').insert({
          tutor_id: tutor.id,
          name: wc.studentName,
          whatsapp: wc.studentWhatsapp,
          subject: nextContext.chosen_subject ?? '',
          grade: nextContext.chosen_grade ?? '',
          class_type: 'group',
          batch_id: wc.batchId,
          monthly_fee: wc.batchFee,
          status: 'active',
          consent_given: true,
          consent_at: new Date().toISOString(),
        }).select().single()

        if (newStudent) {
          await supabase.from('payments').insert({
            tutor_id: tutor.id,
            student_id: (newStudent as { id: string }).id,
            amount_lkr: wc.batchFee,
            payment_type: 'monthly',
            month_year: new Date().toISOString().slice(0, 7),
            status: 'pending',
            due_date: new Date().toISOString().split('T')[0],
          })
        }

        const { count: enrolled } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('batch_id', wc.batchId)
          .eq('status', 'active')
        const { data: batch } = await supabase
          .from('batches')
          .select('max_students')
          .eq('id', wc.batchId)
          .single()
        if (batch && (enrolled ?? 0) >= (batch as { max_students: number }).max_students) {
          await supabase.from('batches').update({ accepting_new: false }).eq('id', wc.batchId)
        }

        console.log(`[bot] ${wc.studentName} enrolled from waitlist into batch ${wc.batchName}`)
      } catch (err) {
        console.error('[webhook] waitlistConfirm error:', err)
      }
    }

    // 10. For async providers (Telegram) send the reply via their API.
    if (messaging.responseMode === 'async') {
      await messaging.send(incoming.from, reply)
    }

    // 11. Return the provider-appropriate HTTP response.
    return messaging.buildResponse(messaging.responseMode === 'sync' ? reply : null)

  } catch (err) {
    console.error(`[webhook:${providerId}]`, err)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
