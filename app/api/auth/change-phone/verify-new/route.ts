// ✅ CURRENT: Step 3 (final) of the dual-channel phone-change flow.
//    Verifies the OTP sent to the NEW WhatsApp number, then commits the
//    change: tutors.whatsapp_number / phone_verified updated via service-role
//    client. Notifies BOTH the old and new WhatsApp number, PLUS always sends
//    an email backup notification (so the owner is alerted even if an
//    attacker also controls the WhatsApp number by this point).
// 📝 NOTE: For a first-time phone add (old_value === ''), there is no old
//    number to notify — only the new number + email backup are sent.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, getServiceClient, checkOtpStage } from '@/lib/contactChange'
import { sendPhoneChangedEmail } from '@/lib/resend'
import { sendTutorWhatsApp } from '@/lib/twilio'
import { maskPhone } from '@/lib/mask'
import { logEvent } from '@/lib/audit'

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
    .eq('status', 'pending_new_otp')
    .maybeSingle()

  if (findError || !changeReq) {
    return NextResponse.json({ error: 'Request not found. Please start again.' }, { status: 404 })
  }

  const stage = checkOtpStage(changeReq.expires_at, changeReq.new_otp_attempts)
  if (!stage.ok) {
    if (stage.status === 400) {
      await service.from('contact_change_requests').update({ status: 'expired' }).eq('id', requestId)
    }
    return NextResponse.json({ error: stage.error }, { status: stage.status })
  }

  if (otp !== changeReq.new_otp_code) {
    await service
      .from('contact_change_requests')
      .update({ new_otp_attempts: changeReq.new_otp_attempts + 1 })
      .eq('id', requestId)
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
  }

  // ── Match — commit the phone change ─────────────────────────────────────────
  const now = new Date().toISOString()

  const { error: updateError } = await service
    .from('tutors')
    .update({ whatsapp_number: changeReq.new_value, phone_verified: true })
    .eq('id', authedUser.id)

  if (updateError) {
    return NextResponse.json({ error: 'Could not update phone number. Please try again.' }, { status: 500 })
  }

  await service
    .from('contact_change_requests')
    .update({ status: 'completed', new_otp_verified_at: now, completed_at: now })
    .eq('id', requestId)

  // ── Notify BOTH old and new numbers via WhatsApp — "wasn't you?" wording ───
  const hadOldNumber = !!changeReq.old_value

  if (hadOldNumber) {
    sendTutorWhatsApp(
      changeReq.old_value,
      'Phone number changed',
      `Your Smartclaz WhatsApp number was just changed to ${maskPhone(changeReq.new_value)}. If this wasn't you, contact security@smartclaz.com immediately.`,
      undefined,
      authedUser.id,
    ).catch(() => {})
  }

  sendTutorWhatsApp(
    changeReq.new_value,
    'This number is now linked to Smartclaz',
    `Your Smartclaz account is now linked to this WhatsApp number. If this wasn't you, contact security@smartclaz.com immediately.`,
    undefined,
    authedUser.id,
  ).catch(() => {})

  // ── Always send an email backup notification (existing sender, reused) ─────
  const { data: tutor } = await service
    .from('tutors')
    .select('email')
    .eq('id', authedUser.id)
    .single()

  if (tutor?.email) {
    sendPhoneChangedEmail(tutor.email, changeReq.old_value || 'none on file', changeReq.new_value).catch(() => {})
  }

  logEvent(authedUser.id, 'phone_changed', {
    old_phone: hadOldNumber ? maskPhone(changeReq.old_value) : 'none on file',
    new_phone: maskPhone(changeReq.new_value),
    used_fallback: changeReq.used_fallback,
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
