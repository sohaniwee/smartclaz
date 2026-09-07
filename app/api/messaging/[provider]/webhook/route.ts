import { NextRequest, NextResponse } from 'next/server'
import { processWebhook } from '@/lib/bot/process-webhook'

// ── Dynamic webhook endpoint ───────────────────────────────────────────────
//
// URL pattern:  /api/messaging/{provider}/webhook
//
// Currently registered:
//   /api/messaging/twilio-whatsapp/webhook   ← register this URL in Twilio Console
//
// Adding a new provider:
//   1. Implement MessagingProvider in lib/providers/messaging.ts
//   2. Register the provider's webhook URL to /api/messaging/{your-id}/webhook
//   No changes needed here.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  return processWebhook(req, provider)
}

// Twilio verifies the endpoint with a GET before activating the webhook
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  return NextResponse.json({ status: 'ok', provider })
}
