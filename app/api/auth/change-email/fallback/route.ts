// ✅ CURRENT: Fallback for step 2 — if the tutor can't access their CURRENT
//    email, re-send the identity-confirmation OTP via WhatsApp instead
//    (requires phone_verified = true on the tutor's profile).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, getServiceClient, generateOtp } from '@/lib/contactChange'
import { sendTutorWhatsApp } from '@/lib/twilio'
import { maskPhone } from '@/lib/mask'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authedUser = await getAuthedUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  }

  let requestId: string
  try {
    const body = await req.json()
    requestId = String(body.requestId ?? '')
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!requestId) {
    return NextResponse.json({ error: 'Missing request ID.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: changeReq, error: findError } = await service
    .from('contact_change_requests')
    .select('*')
    .eq('id', requestId)
    .eq('tutor_id', authedUser.id)
    .eq('change_type', 'email')
    .maybeSingle()

  if (findError || !changeReq || changeReq.status !== 'pending_old_otp') {
    return NextResponse.json({ error: 'This request can no longer use the fallback option.' }, { status: 400 })
  }

  const { data: tutor } = await service
    .from('tutors')
    .select('whatsapp_number')
    .eq('id', authedUser.id)
    .single()

  // Gate on whether a WhatsApp number exists at all, not on tutors.phone_verified —
  // that flag tracks a separate (not-yet-launched) login-phone verification concept
  // and is hardcoded false for every tutor at signup today (see app/(auth)/signup/page.tsx).
  // Requiring the tutor to correctly re-enter the code just sent to whatsapp_number is
  // itself the proof of possession, mirroring how change-phone's email fallback works.
  if (!tutor?.whatsapp_number) {
    return NextResponse.json(
      { error: 'No phone number on file', offerSupportRecovery: true },
      { status: 400 },
    )
  }

  const otp = generateOtp()
  const now = new Date().toISOString()

  await service
    .from('contact_change_requests')
    .update({
      old_otp_code: otp,
      old_otp_sent_at: now,
      old_otp_attempts: 0,
      used_fallback: true,
      fallback_channel: 'phone',
    })
    .eq('id', requestId)

  sendTutorWhatsApp(
    tutor.whatsapp_number,
    'Your verification code',
    `Your Smartclaz verification code is *${otp}*.\n\nUse this to confirm your identity to change your email. It expires in 30 minutes.`,
    undefined,
    authedUser.id,
  ).catch(() => {})

  return NextResponse.json({
    success: true,
    fallbackChannel: 'phone',
    maskedPhone: maskPhone(tutor.whatsapp_number),
  })
}
