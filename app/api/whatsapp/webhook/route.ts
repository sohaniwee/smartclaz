/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         WHATSAPP BOT — BEFORE LAUNCH CHECKLIST                          ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                          ║
 * ║  1. Sign up for Twilio (free $15 credit)                                ║
 * ║     → twilio.com                                                         ║
 * ║                                                                          ║
 * ║  2. Get WhatsApp Business API approval                                   ║
 * ║     → Twilio Console → Messaging → WhatsApp Senders                     ║
 * ║     → Allow 1-2 weeks for Meta approval                                  ║
 * ║                                                                          ║
 * ║  3. Add Twilio credentials to .env.local:                                ║
 * ║     TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxx                                 ║
 * ║     TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx                                   ║
 * ║     TWILIO_WHATSAPP_FROM=+14155238886  (your approved sender number)     ║
 * ║                                                                          ║
 * ║  4. Set WHATSAPP_TEST_MODE=false in .env.local                           ║
 * ║                                                                          ║
 * ║  5. Set webhook URL in Twilio Console:                                   ║
 * ║     https://smartclaz.com/api/whatsapp/webhook  (POST)                  ║
 * ║                                                                          ║
 * ║  6. Uncomment Twilio signature validation                                ║
 * ║     → lib/providers/messaging.ts → verifyWebhook()                      ║
 * ║     npm install twilio                                                   ║
 * ║                                                                          ║
 * ║  7. Set up Zoom credentials:                                             ║
 * ║     → marketplace.zoom.us → Build App → Server-to-Server OAuth           ║
 * ║     → Scopes: meeting:write:admin, meeting:read:admin                    ║
 * ║     → ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in .env.local ║
 * ║                                                                          ║
 * ║  8. Set up reminder cron job:                                            ║
 * ║     → Netlify scheduled function every 15 minutes                        ║
 * ║     → Target: /api/reminders/send                                        ║
 * ║                                                                          ║
 * ║  9. Test full flow with real WhatsApp number                             ║
 * ║     → Send "Hi" to your Twilio sandbox number                            ║
 * ║     → Verify conversation saves to Supabase conversations table          ║
 * ║     → Verify tutor gets notified on booking                              ║
 * ║                                                                          ║
 * ║  10. Delete app/api/test/webhook/route.ts                                ║
 * ║                                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/*
 * WEBHOOK SECURITY CHECKLIST:
 * ✅ FIX 1: Twilio signature validation (uncomment before launch)
 * ✅ FIX 8: Per-phone rate limiting (30 msgs/hr) — in process-webhook.ts
 * ✅ FIX 11: Per-tutor message cap — in process-webhook.ts
 * ✅ FIX 13: Blocked student check — in process-webhook.ts
 * ✅ FIX 7: Prompt injection sanitized — in claude-intent.ts
 * ✅ FIX 6: AI hallucination prevention — in claude-intent.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { processWebhook } from '@/lib/bot/process-webhook'

// Legacy endpoint — Twilio is already configured to POST here.
//
// The canonical URL going forward is:
//   /api/messaging/twilio-whatsapp/webhook
//
// Both routes call the same processWebhook() with provider 'twilio-whatsapp',
// so you can migrate Twilio to the new URL at any time without changing logic.

export async function POST(req: NextRequest) {
  return processWebhook(req, 'twilio-whatsapp')
}

export async function GET() {
  return NextResponse.json({ status: 'ok', provider: 'twilio-whatsapp' })
}
