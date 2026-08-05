// ✅ CURRENT: Step 2 of the dual-channel phone-change flow.
//    Verifies the OTP sent to the tutor's CURRENT WhatsApp number, then
//    immediately issues a fresh OTP to the NEW number via WhatsApp.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, getServiceClient, generateOtp, checkOtpStage } from '@/lib/contactChange'
import { sendTutorWhatsApp } from '@/lib/twilio'
import { maskPhone } from '@/lib/mask'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authedUser = await getAuthedUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  }

  let requestId: string
  let otp: string
  try {
    const body = await req.json()
    requestId = String(body.requestId ?? '')
    otp = String(body.otp ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!requestId || !otp) {
    return NextResponse.json({ error: 'Missing request ID or code.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: changeReq, error: findError } = await service
    .from('contact_change_requests')
    .select('*')
    .eq('id', requestId)
    .eq('tutor_id', authedUser.id)
    .eq('change_type', 'phone')
    .eq('status', 'pending_old_otp')
    .maybeSingle()

  if (findError || !changeReq) {
    return NextResponse.json({ error: 'Request not found. Please start again.' }, { status: 404 })
  }

  const stage = checkOtpStage(changeReq.expires_at, changeReq.old_otp_attempts)
  if (!stage.ok) {
    if (stage.status === 400) {
      await service.from('contact_change_requests').update({ status: 'expired' }).eq('id', requestId)
    }
    return NextResponse.json({ error: stage.error }, { status: stage.status })
  }

  if (otp !== changeReq.old_otp_code) {
    await service
      .from('contact_change_requests')
      .update({ old_otp_attempts: changeReq.old_otp_attempts + 1 })
      .eq('id', requestId)
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
  }

  // ── Match — issue a fresh OTP for the NEW number ────────────────────────────
  const newOtp = generateOtp()
  const now = new Date().toISOString()

  await service
    .from('contact_change_requests')
    .update({
      old_otp_verified_at: now,
      status: 'pending_new_otp',
      new_otp_code: newOtp,
      new_otp_sent_at: now,
      new_otp_attempts: 0,
    })
    .eq('id', requestId)

  sendTutorWhatsApp(
    changeReq.new_value,
    'Your verification code',
    `Your Smartclaz verification code is *${newOtp}*.\n\nUse this to confirm your new WhatsApp number. It expires in 30 minutes.`,
    undefined,
    authedUser.id,
  ).catch(() => {})

  return NextResponse.json({
    success: true,
    maskedNewPhone: maskPhone(changeReq.new_value),
  })
}
