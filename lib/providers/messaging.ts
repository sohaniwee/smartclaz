import { NextRequest, NextResponse } from 'next/server'

// ════════════════════════════════════════════════════════════════════════════
// MESSAGING PROVIDER INTERFACE
//
// To add a new provider (Telegram, SMS, Line, Viber, …):
//   1. Implement MessagingProvider below
//   2. Add an entry to PROVIDERS at the bottom
//   3. Point the platform's webhook to /api/messaging/{id}/webhook
//   4. Add env vars — no other files need to change
// ════════════════════════════════════════════════════════════════════════════

export interface IncomingMessage {
  /** Normalised sender ID — phone number, Telegram user ID, etc. */
  from: string
  /** Normalised channel ID the tutor uses — their number / bot chat ID. */
  to: string
  /** Plain text body of the message. */
  text: string
}

export interface MessagingProvider {
  readonly id: string
  readonly name: string
  /**
   * 'sync'  — reply is returned in the HTTP response body (e.g. TwiML).
   * 'async' — reply is sent via a separate API call; HTTP response is just an ACK.
   */
  readonly responseMode: 'sync' | 'async'

  /**
   * Verify the incoming webhook request (signature, secret token, etc.).
   * rawBody is the pre-read request body string — avoids consuming the stream twice.
   * Return false to reject the request with 401.
   */
  verifyWebhook(req: NextRequest, rawBody: string): Promise<boolean>

  /**
   * Parse the raw request body into a normalised IncomingMessage.
   * Called only after verifyWebhook passes.
   */
  parseRawBody(rawBody: string): IncomingMessage

  /**
   * Send a message to a recipient via this provider's API.
   * Used for async providers and for mid-flow tutor notifications.
   */
  send(to: string, text: string): Promise<void>

  /**
   * Build the HTTP response that goes back to the provider's webhook infra.
   * Pass null when there is nothing to reply (human mode, errors, async sends).
   */
  buildResponse(reply: string | null): NextResponse
}

// ── Twilio WhatsApp ──────────────────────────────────────────────────────────
// Webhook URL to register in Twilio Console:
//   https://your-app.com/api/messaging/twilio-whatsapp/webhook
//
// Env vars needed:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

const twilioWhatsApp: MessagingProvider = {
  id:           'twilio-whatsapp',
  name:         'WhatsApp (via Twilio)',
  responseMode: 'sync',

  async verifyWebhook(req, rawBody) {
    // TODO: validate Twilio request signature
    // const sig = req.headers.get('x-twilio-signature') ?? ''
    // const url = `${process.env.NEXT_PUBLIC_APP_URL}${req.nextUrl.pathname}`
    // const params = Object.fromEntries(new URLSearchParams(rawBody))
    // return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, sig, url, params)
    void req; void rawBody
    return true
  },

  parseRawBody(rawBody) {
    const p = new URLSearchParams(rawBody)
    return {
      from: (p.get('From') ?? '').replace('whatsapp:', ''),
      to:   (p.get('To')   ?? '').replace('whatsapp:', ''),
      text: (p.get('Body') ?? '').trim(),
    }
  },

  async send(to, text) {
    // TODO:
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    // await client.messages.create({
    //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
    //   to:   `whatsapp:${to}`,
    //   body: text,
    // })
    console.log(`[twilio-whatsapp → ${to}]`, text)
  },

  buildResponse(reply) {
    if (!reply) return new NextResponse('', { status: 204 })
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`
    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } })
  },
}

// ── Telegram ─────────────────────────────────────────────────────────────────
// Register webhook with:
//   POST https://api.telegram.org/bot{TOKEN}/setWebhook
//   url: https://your-app.com/api/messaging/telegram/webhook
//   secret_token: process.env.TELEGRAM_WEBHOOK_SECRET
//
// Env vars needed:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET

const telegram: MessagingProvider = {
  id:           'telegram',
  name:         'Telegram',
  responseMode: 'async', // reply sent via Bot API, not in the HTTP response

  async verifyWebhook(req, _rawBody) {
    // TODO:
    // const token = req.headers.get('x-telegram-bot-api-secret-token')
    // return token === process.env.TELEGRAM_WEBHOOK_SECRET
    void req
    return true
  },

  parseRawBody(rawBody) {
    const body = JSON.parse(rawBody) as {
      message?: { from: { id: number }; chat: { id: number }; text?: string }
    }
    const msg = body.message
    return {
      from: String(msg?.from?.id ?? ''),
      to:   String(msg?.chat?.id ?? ''),
      text: (msg?.text ?? '').trim(),
    }
  },

  async send(to, text) {
    // TODO:
    // await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    //   method:  'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body:    JSON.stringify({ chat_id: to, text, parse_mode: 'Markdown' }),
    // })
    console.log(`[telegram → ${to}]`, text)
  },

  buildResponse(_reply) {
    // Telegram only needs a 200 ACK; the actual reply is sent via send() above
    return NextResponse.json({ ok: true })
  },
}

// ── Registry ──────────────────────────────────────────────────────────────────

const PROVIDERS: Record<string, MessagingProvider> = {
  [twilioWhatsApp.id]: twilioWhatsApp,
  [telegram.id]:       telegram,
  // Add new providers here ↓
}

export function getMessagingProvider(id: string): MessagingProvider {
  const p = PROVIDERS[id]
  if (!p) throw new Error(
    `Unknown messaging provider "${id}". Available: ${Object.keys(PROVIDERS).join(', ')}`
  )
  return p
}

/** All registered provider IDs — useful for admin UI or validation. */
export const messagingProviderIds = Object.keys(PROVIDERS)
