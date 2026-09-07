// ✅ CURRENT: Fallback for step 2 of the phone-change flow — if the tutor
//    can't access their CURRENT WhatsApp number, re-send the
//    identity-confirmation OTP via email instead.
// 📝 NOTE: Direction is reversed vs change-email/fallback (email → phone).
//    Every tutor always has a verified email on file (required at signup), so
//    unlike the email flow there is NO "no fallback available" case here —
//    this route always succeeds once the request is found and still pending.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, getServiceClient, generateOtp } from '@/lib/contactChange'
import { sendOtpEmail } from '@/lib/resend'
import { maskEmail } from '@/lib/mask'

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
    .eq('change_type', 'phone')
    .maybeSingle()

  if (findError || !changeReq || changeReq.status !== 'pending_old_otp') {
    return NextResponse.json({ error: 'This request can no longer use the fallback option.' }, { status: 400 })
  }

  const { data: tutor } = await service
    .from('tutors')
    .select('email')
    .eq('id', authedUser.id)
    .single()

  if (!tutor?.email) {
    // Should never happen — email is required at signup — but never crash.
    return NextResponse.json(
      { error: 'No verified email on file', offerSupportRecovery: true },
      { status: 400 },
    )
  }

  const otp = generateOtp()
  const now = new Date().toISOString()

  const { error: updateErr } = await service
    .from('contact_change_requests')
    .update({
      old_otp_code: otp,
      old_otp_sent_at: now,
      old_otp_attempts: 0,
      used_fallback: true,
      fallback_channel: 'email',
    })
    .eq('id', requestId)

  if (updateErr) {
    console.error('[change-phone/fallback] Failed to save new OTP:', updateErr)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  sendOtpEmail(tutor.email, otp, 'confirming your identity to change your phone number').catch(() => {})

  return NextResponse.json({
    success: true,
    fallbackChannel: 'email',
    maskedEmail: maskEmail(tutor.email),
  })
}
