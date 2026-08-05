// ✅ CURRENT: Step 3 (final) of the dual-channel email-change flow.
//    Verifies the OTP sent to the NEW email, then commits the change:
//      - tutors.email / email_verified updated via service-role client
//      - supabase.auth.admin.updateUserById() keeps the Auth login email in
//        sync — this is safe: admin.updateUserById does NOT touch the
//        current session, unlike the client-side verifyOtp() bug this whole
//        flow was built to avoid (see lib/contactChange.ts header).
//    Notifies BOTH the old and new email (and WhatsApp, if verified) so the
//    real owner is alerted even if an attacker completed the change.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, getServiceClient, checkOtpStage } from '@/lib/contactChange'
import { sendSecurityAlert } from '@/lib/resend'
import { sendTutorWhatsApp } from '@/lib/twilio'
import { maskEmail } from '@/lib/mask'
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
    .eq('change_type', 'email')
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

  // ── Match — commit the email change ─────────────────────────────────────────
  const now = new Date().toISOString()

  const { error: updateError } = await service
    .from('tutors')
    .update({ email: changeReq.new_value, email_verified: true })
    .eq('id', authedUser.id)

  if (updateError) {
    return NextResponse.json({ error: 'Could not update email. Please try again.' }, { status: 500 })
  }

  // Keep Supabase Auth's login email in sync. admin.updateUserById() never
  // touches the currently-active session — it is purely a server-side admin
  // write, unlike client-side verifyOtp() which would hijack the session.
  await service.auth.admin.updateUserById(authedUser.id, { email: changeReq.new_value }).catch(() => {})

  await service
    .from('contact_change_requests')
    .update({ status: 'completed', new_otp_verified_at: now, completed_at: now })
    .eq('id', requestId)

  // ── Notify BOTH channels — "wasn't you?" security alerts ────────────────────
  const changeDate = new Date().toLocaleDateString('en-LK', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  sendSecurityAlert(
    changeReq.old_value,
    `Your Smartclaz email address was changed on ${changeDate}.\n\nOld email: ${maskEmail(changeReq.old_value)}\nNew email: ${maskEmail(changeReq.new_value)}\n\nIf this wasn't you, contact us immediately.`,
  ).catch(() => {})

  sendSecurityAlert(
    changeReq.new_value,
    `Your Smartclaz email address was changed on ${changeDate} and this address is now your login email.\n\nIf this wasn't you, contact us immediately.`,
  ).catch(() => {})

  const { data: tutor } = await service
    .from('tutors')
    .select('whatsapp_number')
    .eq('id', authedUser.id)
    .single()

  if (tutor?.whatsapp_number) {
    sendTutorWhatsApp(
      tutor.whatsapp_number,
      'Email address changed',
      `Your Smartclaz email was just changed to ${maskEmail(changeReq.new_value)}. If this wasn't you, contact security@smartclaz.com immediately.`,
      undefined,
      authedUser.id,
    ).catch(() => {})
  }

  logEvent(authedUser.id, 'email_changed', {
    old_email: maskEmail(changeReq.old_value),
    new_email: maskEmail(changeReq.new_value),
    used_fallback: changeReq.used_fallback,
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
