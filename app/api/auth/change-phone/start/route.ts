// ✅ CURRENT: Step 1 of the dual-channel phone-change flow.
//    Sends a self-contained 6-digit OTP to the tutor's CURRENT WhatsApp number
//    to confirm identity before anything changes. Mirrors change-email/start
//    with WhatsApp as the primary channel and email as the fallback.
// 📝 NOTE: If the tutor has no phone on file yet (whatsapp_number is null —
//    adding a phone for the first time, not changing one), the old-OTP step
//    is skipped entirely: status goes straight to 'pending_new_otp' and the
//    new-number OTP is sent immediately. skippedOldVerification tells the UI
//    to jump straight to the verify-new step.

import { NextRequest, NextResponse } from 'next/server'
import {
  getAuthedUser,
  getServiceClient,
  generateOtp,
  hashedIpFrom,
  SL_PHONE_REGEX,
  normalizeSlPhone,
} from '@/lib/contactChange'
import { checkRateLimit, incrementAttempts } from '@/lib/rateLimit'
import { sendTutorWhatsApp } from '@/lib/twilio'
import { maskPhone } from '@/lib/mask'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Auth required ────────────────────────────────────────────────────────
  const authedUser = await getAuthedUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  }

  // ── 2. Parse + validate body ────────────────────────────────────────────────
  let rawNewPhone: string
  try {
    const body = await req.json()
    rawNewPhone = String(body.newPhone ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!rawNewPhone || !SL_PHONE_REGEX.test(rawNewPhone)) {
    return NextResponse.json({ error: 'Please enter a valid Sri Lankan mobile number.' }, { status: 400 })
  }

  const newPhone = normalizeSlPhone(rawNewPhone)

  const service = getServiceClient()

  const { data: tutor, error: tutorError } = await service
    .from('tutors')
    .select('id, email, whatsapp_number')
    .eq('id', authedUser.id)
    .single()

  if (tutorError || !tutor) {
    return NextResponse.json({ error: 'Could not load your profile. Please try again.' }, { status: 400 })
  }

  if (tutor.whatsapp_number && newPhone === tutor.whatsapp_number) {
    return NextResponse.json({ error: 'New number must be different from your current number.' }, { status: 400 })
  }

  // ── 3. Enumeration-safe: reject if another tutor already uses this number ───
  const { data: existing } = await service
    .from('tutors')
    .select('id')
    .eq('whatsapp_number', newPhone)
    .neq('id', authedUser.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This phone number cannot be used. Please try a different one.' }, { status: 400 })
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
    .eq('change_type', 'phone')
    .in('status', ['pending_old_otp', 'pending_new_otp'])

  const now = new Date().toISOString()
  const ipHash = await hashedIpFrom(req)
  const userAgent = req.headers.get('user-agent') ?? null

  // ── 6a. First-time phone (no whatsapp_number on file) — skip old-OTP step ───
  if (!tutor.whatsapp_number) {
    const newOtp = generateOtp()

    const { data: inserted, error: insertError } = await service
      .from('contact_change_requests')
      .insert({
        tutor_id: authedUser.id,
        change_type: 'phone',
        old_value: '',
        new_value: newPhone,
        status: 'pending_new_otp',
        new_otp_code: newOtp,
        new_otp_sent_at: now,
        ip_address: ipHash,
        user_agent: userAgent,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      return NextResponse.json({ error: 'Could not start phone change. Please try again.' }, { status: 500 })
    }

    sendTutorWhatsApp(
      newPhone,
      'Your verification code',
      `Your Smartclaz verification code is *${newOtp}*.\n\nUse this to confirm your new WhatsApp number. It expires in 30 minutes.`,
      undefined,
      authedUser.id,
    ).catch(() => {})

    return NextResponse.json({
      success: true,
      requestId: inserted.id,
      skippedOldVerification: true,
      maskedNewPhone: maskPhone(newPhone),
    })
  }

  // ── 6b. Normal change — verify OLD number first ─────────────────────────────
  const otp = generateOtp()

  const { data: inserted, error: insertError } = await service
    .from('contact_change_requests')
    .insert({
      tutor_id: authedUser.id,
      change_type: 'phone',
      old_value: tutor.whatsapp_number,
      new_value: newPhone,
      status: 'pending_old_otp',
      old_otp_code: otp,
      old_otp_sent_at: now,
      ip_address: ipHash,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: 'Could not start phone change. Please try again.' }, { status: 500 })
  }

  sendTutorWhatsApp(
    tutor.whatsapp_number,
    'Your verification code',
    `Your Smartclaz verification code is *${otp}*.\n\nUse this to confirm your identity to change your phone number. It expires in 30 minutes.`,
    undefined,
    authedUser.id,
  ).catch(() => {})

  return NextResponse.json({
    success: true,
    requestId: inserted.id,
    maskedOldPhone: maskPhone(tutor.whatsapp_number),
    maskedNewPhone: maskPhone(newPhone),
    canFallbackToEmail: true,
  })
}
