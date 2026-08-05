// ✅ CURRENT: Step 1 of the dual-channel email-change flow.
//    Sends a self-contained 6-digit OTP to the tutor's CURRENT email to confirm
//    identity before anything changes. Never touches Supabase Auth sessions —
//    see lib/contactChange.ts file header for why that matters.
// 📝 NOTE: Also used as the "resend" action — the UI simply calls /start again.

import { NextRequest, NextResponse } from 'next/server'
import {
  getAuthedUser,
  getServiceClient,
  generateOtp,
  hashedIpFrom,
  EMAIL_REGEX,
} from '@/lib/contactChange'
import { checkRateLimit, incrementAttempts } from '@/lib/rateLimit'
import { sendOtpEmail } from '@/lib/resend'
import { maskEmail } from '@/lib/mask'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Auth required ────────────────────────────────────────────────────────
  const authedUser = await getAuthedUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  }

  // ── 2. Parse + validate body ────────────────────────────────────────────────
  let newEmail: string
  try {
    const body = await req.json()
    newEmail = String(body.newEmail ?? '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: tutor, error: tutorError } = await service
    .from('tutors')
    .select('id, email, whatsapp_number')
    .eq('id', authedUser.id)
    .single()

  if (tutorError || !tutor) {
    return NextResponse.json({ error: 'Could not load your profile. Please try again.' }, { status: 400 })
  }

  if (newEmail === (tutor.email ?? '').toLowerCase()) {
    return NextResponse.json({ error: 'New email must be different from your current email.' }, { status: 400 })
  }

  // ── 3. Enumeration-safe: reject if another tutor already uses this email ────
  const { data: existing } = await service
    .from('tutors')
    .select('id')
    .eq('email', newEmail)
    .neq('id', authedUser.id)
    .maybeSingle()

  if (existing) {
    // Generic error — never reveal that the email is registered to someone else.
    return NextResponse.json({ error: 'This email address cannot be used. Please try a different one.' }, { status: 400 })
  }

  // ── 4. Rate limit — 5 change requests per tutor per day ─────────────────────
  const { limited, retryAfterSecs } = await checkRateLimit(authedUser.id, 'contact_change')
  if (limited) {
    return NextResponse.json(
      { error: 'Too many change requests. Please try again later.', retryAfterSecs },
      { status: 429 },
    )
  }
  await incrementAttempts(authedUser.id, 'contact_change')

  // ── 5. Cancel any previous pending request for this tutor + change_type ─────
  await service
    .from('contact_change_requests')
    .update({ status: 'cancelled' })
    .eq('tutor_id', authedUser.id)
    .eq('change_type', 'email')
    .in('status', ['pending_old_otp', 'pending_new_otp'])

  // ── 6. Create the new request row ────────────────────────────────────────────
  const otp = generateOtp()
  const now = new Date().toISOString()
  const ipHash = await hashedIpFrom(req)
  const userAgent = req.headers.get('user-agent') ?? null

  const { data: inserted, error: insertError } = await service
    .from('contact_change_requests')
    .insert({
      tutor_id: authedUser.id,
      change_type: 'email',
      old_value: tutor.email,
      new_value: newEmail,
      status: 'pending_old_otp',
      old_otp_code: otp,
      old_otp_sent_at: now,
      ip_address: ipHash,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: 'Could not start email change. Please try again.' }, { status: 500 })
  }

  // ── 7. Send OTP to the CURRENT email ────────────────────────────────────────
  sendOtpEmail(tutor.email, otp, 'confirming your identity to change your email').catch(() => {})

  return NextResponse.json({
    success: true,
    requestId: inserted.id,
    maskedOldEmail: maskEmail(tutor.email),
    maskedNewEmail: maskEmail(newEmail),
    canFallbackToPhone: !!tutor.whatsapp_number,
  })
}
