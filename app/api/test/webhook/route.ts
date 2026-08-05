// ⚠️ DEV ONLY — Remove before launch (pre-launch checklist item 10)
// 🧪 TEST: Open browser and visit:
//    GET /api/test/webhook?msg=Hi+sir
//    GET /api/test/webhook?msg=Kavindu
//    GET /api/test/webhook?msg=1
//    GET /api/test/webhook?msg=AGREE
//    Parameters:
//      msg  = message text (required)
//      from = student WhatsApp number (default +94771234567)
//      to   = tutor WhatsApp number registered in DB (default +94777654321)

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // ── Production guard ─────────────────────────────────────────────────────
  // 📝 NOTE: Hard block in production to prevent accidental exposure.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is not available in production. Delete app/api/test/webhook/route.ts before launch.' },
      { status: 404 },
    )
  }

  const searchParams = req.nextUrl.searchParams

  const msg  = searchParams.get('msg')
  const from = searchParams.get('from') ?? '+94771234567'
  const to   = searchParams.get('to')   ?? '+94777654321'

  if (!msg) {
    return NextResponse.json(
      {
        error:   'Missing ?msg= parameter',
        usage:   '/api/test/webhook?msg=Hello',
        examples: [
          '/api/test/webhook?msg=Hi+sir',
          '/api/test/webhook?msg=Kavindu',
          '/api/test/webhook?msg=1',
          '/api/test/webhook?msg=AGREE',
          '/api/test/webhook?msg=I+paid',
          '/api/test/webhook?msg=Can+I+reschedule%3F',
        ],
      },
      { status: 400 },
    )
  }

  // ── Build FormData exactly as Twilio would POST it ────────────────────────
  // 📝 NOTE: Twilio sends whatsapp: prefix on both From and To fields.
  const twilioPayload = new URLSearchParams({
    From:        `whatsapp:${from}`,
    To:          `whatsapp:${to}`,
    Body:        msg,
    MessageSid:  `SMtest_${Date.now()}`,
    AccountSid:  process.env.TWILIO_ACCOUNT_SID ?? 'ACtest',
    NumMedia:    '0',
  })

  const payload = {
    sent: {
      from:    `whatsapp:${from}`,
      to:      `whatsapp:${to}`,
      body:    msg,
      raw:     twilioPayload.toString(),
    },
    webhookUrl: '/api/whatsapp/webhook',
    timestamp:  new Date().toISOString(),
  }

  // ── POST to the webhook internally ───────────────────────────────────────
  let webhookStatus: number | null = null
  let webhookBody:   string | null = null

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-test-mode':  'true',
      },
      body: twilioPayload.toString(),
    })

    webhookStatus = response.status
    webhookBody   = await response.text()

  } catch (err) {
    return NextResponse.json(
      {
        ...payload,
        webhookError: String(err),
        hint: 'Make sure the dev server is running on the same port.',
      },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ...payload,
    webhookResponse: {
      status: webhookStatus,
      body:   webhookBody,
    },
  })
}
