import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Twilio signs each webhook request with an HMAC-SHA1 of the full request URL
// plus every POST param (sorted by key, concatenated as key+value with no
// delimiter), keyed with the account's auth token, base64-encoded. This is
// the same algorithm as the `twilio` npm package's `validateRequest()` — kept
// dependency-free here since Node's built-in `crypto` covers it directly.
// See: https://www.twilio.com/docs/usage/security#validating-requests
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: URLSearchParams,
): boolean {
  const sortedKeys = Array.from(new Set(params.keys())).sort()
  let data = url
  for (const key of sortedKeys) {
    for (const value of params.getAll(key)) {
      data += key + value
    }
  }
  const expected = crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64')

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}

// ════════════════════════════════════════════════════════════════════════════
// MESSAGING PROVIDER INTERFACE
//
// WhatsApp (via Twilio) is the only channel in use. To add another provider:
//   1. Implement MessagingProvider below
//   2. Add an entry to PROVIDERS at the bottom
//   3. Point the platform's webhook to /api/messaging/{id}/webhook
//   4. Add env vars — no other files need to change
// ════════════════════════════════════════════════════════════════════════════

export interface IncomingMessage {
  /** Normalised sender ID — the student's WhatsApp phone number. */
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
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.error('[twilio-whatsapp] TWILIO_AUTH_TOKEN not set — rejecting webhook (cannot verify signature)')
      return false
    }
    const signature = req.headers.get('x-twilio-signature') ?? ''
    if (!signature) return false

    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${req.nextUrl.pathname}${req.nextUrl.search}`
    const params = new URLSearchParams(rawBody)
    return validateTwilioSignature(authToken, signature, url, params)
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

// ── Registry ──────────────────────────────────────────────────────────────────
// Only WhatsApp (via Twilio) is in use — no other channel is planned.

const PROVIDERS: Record<string, MessagingProvider> = {
  [twilioWhatsApp.id]: twilioWhatsApp,
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
