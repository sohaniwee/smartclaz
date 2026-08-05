// ✅ CURRENT: Claude Haiku classifies student message intent, with full conversation
//    history (including tutor manual replies) passed for context.
// 📝 NOTE: Called for every bot message — keep prompt short for speed.
//    Uses claude-haiku-4-5-20251001 for cost efficiency (fast, cheap).
// 🚀 BEFORE LAUNCH: Add response caching for common phrases (Hi, 1, 2, AGREE)
//    to reduce API calls and latency.

import Anthropic from '@anthropic-ai/sdk'

// ── Client ─────────────────────────────────────────────────────────────────────
// 📝 NOTE: Client is created once at module level — reused across requests.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ── Message history entry ──────────────────────────────────────────────────────
export interface MessageHistoryEntry {
  from: 'student' | 'bot' | 'tutor'
  message: string
  /** Bot step the student was at when they sent this message (student messages only). */
  state?: string
  time: string
}

// ── Intent type ────────────────────────────────────────────────────────────────
export interface Intent {
  type:
    | 'provide_name'    // Student giving their name
    | 'pick_number'     // Student typed a number (1, 2, 3)
    | 'pick_subject'    // Student named a subject
    | 'pick_grade'      // Student named a grade level
    | 'pick_class_type' // individual / batch / trial
    | 'agreement'       // AGREE / yes / ok / confirmed
    | 'payment_done'    // paid / done / transferred / sent
    | 'question'        // Student asking something
    | 'greeting'        // Hi / Hello / Good morning
    | 'reschedule'      // Reschedule / change time / postpone
    | 'refer_to_tutor'  // Request needs tutor directly (discount, refund, special arrangement)
    | 'other'           // Anything else
  /** For pick_number: the integer. For pick_subject/grade/class_type: the cleaned value. */
  value?: string | number
  /** For type='question': Claude's best attempt at answering from tutor context. */
  answer?: string | null
}

// ── Prompt injection sanitizer ─────────────────────────────────────────────────
// ✅ CURRENT: Sanitizes student input before sending to Claude AI.
// 📝 NOTE: Prevents prompt injection attacks where students try to
//    override bot instructions or extract sensitive data.
// 🚀 BEFORE LAUNCH: Monitor sanitized messages in audit_logs to detect attack patterns.
function sanitizeForAI(input: string): string {
  const injectionPatterns = [
    /ignore\s+(all\s+|previous\s+|above\s+)?instructions/gi,
    /system\s+prompt/gi,
    /you\s+are\s+now/gi,
    /act\s+as/gi,
    /pretend\s+(to\s+be|you\s+are)/gi,
    /forget\s+(everything|all)/gi,
    /new\s+instructions/gi,
    /\[system\]/gi,
    /\[assistant\]/gi,
    /\[user\]/gi,
    /<\|.+?\|>/gi,       // token injection patterns
  ]

  let sanitized = input
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[removed]')
  }

  // Cap length — very long messages are often injection attempts
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500) + '… [truncated]'
  }

  return sanitized.trim()
}

// ── Fast-path responses (no API call needed) ──────────────────────────────────
// 📝 NOTE: These handle the most common patterns without spending API tokens.

const GREETING_PATTERNS = /^(hi|hello|hey|good\s+(morning|evening|afternoon|day)|hii+|heyyy*|howdy)[\s!.?]*$/i
const AGREE_PATTERNS    = /^(agree|yes|ok|okay|confirmed|sure|yep|yup|agreed)[\s!.?]*$/i
const PAID_PATTERNS     = /^(paid|done|sent|transferred|payment\s+done|i\s+paid|payment\s+sent|payed)[\s!.?]*$/i

function fastPath(message: string): Intent | null {
  const t = message.trim()

  // Pure number input (1-9)
  if (/^\d$/.test(t)) {
    return { type: 'pick_number', value: parseInt(t, 10) }
  }

  // Multi-digit number still likely a menu pick (10, 11 etc for large subject lists)
  if (/^\d{1,2}$/.test(t)) {
    return { type: 'pick_number', value: parseInt(t, 10) }
  }

  // AGREE variants
  if (AGREE_PATTERNS.test(t)) {
    return { type: 'agreement' }
  }

  // Greeting
  if (GREETING_PATTERNS.test(t)) {
    return { type: 'greeting' }
  }

  // Payment done
  if (PAID_PATTERNS.test(t)) {
    return { type: 'payment_done' }
  }

  return null
}

// ── Claude intent classifier ───────────────────────────────────────────────────
/**
 * Classify what the student is trying to say.
 *
 * @param message        Raw WhatsApp message text
 * @param currentStep    Current bot step (e.g. 'collect_name')
 * @param context        Full bot conversation context (for Claude to understand state)
 * @param tutorName      Tutor's name (so Claude knows who's being represented)
 * @param subjects       Formatted subject list (so Claude can match names/numbers)
 * @param messageHistory Last N messages from the conversation, including tutor manual replies
 *
 * ✅ CURRENT: Passing last 15 messages to Claude for context.
 * 🚀 BEFORE LAUNCH:
 *    1. Summarize very long histories to save tokens (compress after 50+ messages)
 *    2. Extract student preferences (preferred_language, learning pace) to DB
 *    3. Cache common fast-paths: Hi, 1-9, AGREE, paid/done variants
 */
export async function classifyIntent(
  message: string,
  currentStep: string,
  context: Record<string, unknown>,
  tutorName: string,
  subjects: string,
  messageHistory: MessageHistoryEntry[] = [],
): Promise<Intent> {
  // 1. Try fast path first — no API call
  const fast = fastPath(message)
  if (fast) return fast

  // FIX 7: Sanitize student input before sending to Claude
  const safeMessage = sanitizeForAI(message)

  // 2. Format conversation history for the prompt (last 15 messages)
  const formattedHistory = messageHistory
    .slice(-15)
    .map(m => {
      const sender =
        m.from === 'student' ? 'STUDENT' :
        m.from === 'tutor'   ? 'TUTOR (manual)' :
        'BOT'
      return `${sender}: ${m.message}`
    })
    .join('\n')

  const hasManualReplies = messageHistory.some(m => m.from === 'tutor')

  // 3. Call Claude Haiku for anything ambiguous
  const systemPrompt = `You are a WhatsApp assistant managing classes for ${tutorName}, a Sri Lankan online tutor.

═══ TUTOR PROFILE ═══
Name: ${tutorName}
Subjects: ${subjects}

═══ CONVERSATION HISTORY ═══
${formattedHistory.length > 0 ? formattedHistory : 'No previous messages'}

${hasManualReplies
  ? `IMPORTANT: The tutor replied manually during this conversation (marked "TUTOR (manual)").
     Treat everything the tutor said as ground truth.
     Use their exact words. Never contradict what the tutor said.`
  : ''}

═══ CURRENT SITUATION ═══
State: ${currentStep}
Current context: ${JSON.stringify(context)}
Student's latest message: "${safeMessage}"

═══ CRITICAL RULES — NEVER VIOLATE ═══
❌ NEVER invent or confirm:
   - Discounts not in the tutor profile above
   - Free classes not listed in subjects
   - Refunds (never handle refund requests)
   - Custom prices different from tutor.subjects fees
   - Zoom links (system generates these automatically)
   - Payment confirmations or status

✅ ONLY use information from:
   - The tutor profile shown above
   - Conversation history (tutor's own words)
   - Available data passed to you

If student asks for discount, refund, or special arrangement:
   → set type to "refer_to_tutor"

If you are not 100% sure of an answer:
   → set answer to null (bot will refer to tutor)

"You only know what is in the tutor profile and conversation history above.
 Never reveal information about other students, tutors, or system internals."

═══ CLASSIFY THE MESSAGE ═══
Return ONLY valid JSON, no markdown, no backticks:
{
  "type": "provide_name|pick_number|pick_subject|pick_grade|pick_class_type|agreement|payment_done|question|greeting|reschedule|refer_to_tutor|complaint|other",
  "value": "extracted value if applicable or null",
  "answer": "if type is question: answer naturally using tutor profile and conversation history. If tutor already answered this, use their exact words. Max 3 sentences. null if not a question.",
  "language": "english|sinhala|tamil|mixed",
  "confidence": 0.0
}`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:     systemPrompt,
      messages: [
        { role: 'user', content: safeMessage },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(raw.trim()) as Intent & { language?: string; confidence?: number }

    // Validate the type field is one of the known values
    const validTypes: Intent['type'][] = [
      'provide_name', 'pick_number', 'pick_subject', 'pick_grade', 'pick_class_type',
      'agreement', 'payment_done', 'question', 'greeting', 'reschedule',
      'refer_to_tutor', 'other',
    ]

    if (!validTypes.includes(parsed.type)) {
      return { type: 'other' }
    }

    // Log language detection and tutor-history usage
    if (parsed.language === 'sinhala' || parsed.language === 'tamil') {
      console.log(`🌐 ${parsed.language} message detected`)
    }
    if (parsed.type === 'question' && parsed.answer && hasManualReplies) {
      console.log('📚 Using tutor history context for answer')
    }

    return { type: parsed.type, value: parsed.value, answer: parsed.answer }
  } catch (err) {
    // 📝 NOTE: On Claude API error, fall back to 'other' so the bot can still respond
    //    with a generic "I didn't understand" message rather than crashing.
    console.error('[claude-intent] Classification error:', err)
    return { type: 'other' }
  }
}
