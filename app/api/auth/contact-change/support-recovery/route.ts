// ✅ CURRENT: Authenticated "both channels lost mid-change" recovery route.
//    Different from the existing PUBLIC app/api/auth/support-recovery route:
//    that one is for tutors who are fully logged out and can't access
//    anything. This route is for a tutor who IS authenticated (has a valid
//    session) but can't complete OTP verification of their old contact
//    channel mid-change — a lighter-weight case since we already trust the
//    session. Do not touch the existing public route.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, getServiceClient } from '@/lib/contactChange'
import { logEvent } from '@/lib/audit'

type ChangeType = 'email' | 'phone'

// ── Internal: fire-and-forget internal support alert email ───────────────────
// Mirrors the existing notifySupport() pattern in
// app/api/auth/support-recovery/route.ts — kept intentionally simple per the task spec.
async function notifySupportTeam(payload: {
  tutorId: string
  tutorName: string
  tutorEmail: string
  changeType: ChangeType
  reason: string
  submittedContact: string
  submittedAt: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const text = [
    `Tutor: ${payload.tutorName} (${payload.tutorEmail})`,
    `Tutor ID: ${payload.tutorId}`,
    '',
    `Change type: ${payload.changeType}`,
    `Reason given: ${payload.reason}`,
    `Submitted contact to switch to: ${payload.submittedContact}`,
    '',
    `Submitted: ${payload.submittedAt}`,
    '',
    'This tutor is still logged in but could not complete OTP verification',
    'mid-change (both channels effectively inaccessible for this request).',
    'Review in the tutors table / support_requests table and follow up directly.',
  ].join('\n')

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Smartclaz <onboarding@resend.dev>',
        to: ['support@smartclaz.com'],
        subject: `Contact-change recovery needed — ${payload.tutorName}`,
        text,
      }),
    })
  } catch {
    // ✅ Fire and forget — never let email failures block the response.
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Auth required (session-based, not public) ───────────────────────────
  const authedUser = await getAuthedUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  }

  // ── 2. Parse + validate body ────────────────────────────────────────────────
  let changeType: ChangeType
  let reason: string
  let submittedContact: string
  try {
    const body = await req.json()
    changeType = body.changeType === 'phone' ? 'phone' : body.changeType === 'email' ? 'email' : ('' as ChangeType)
    reason = String(body.reason ?? '').trim()
    submittedContact = String(body.submittedContact ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (changeType !== 'email' && changeType !== 'phone') {
    return NextResponse.json({ error: 'changeType must be "email" or "phone".' }, { status: 400 })
  }
  if (!reason) {
    return NextResponse.json({ error: 'Please describe what happened.' }, { status: 400 })
  }
  if (!submittedContact) {
    return NextResponse.json({ error: 'Please provide the contact detail you want us to use.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: tutor } = await service
    .from('tutors')
    .select('name, email, whatsapp_number')
    .eq('id', authedUser.id)
    .single()

  // ── 3. Insert into support_requests ─────────────────────────────────────────
  await service
    .from('support_requests')
    .insert({
      full_name: tutor?.name ?? 'Unknown tutor',
      email: tutor?.email ?? authedUser.email ?? '',
      phone: tutor?.whatsapp_number ?? null,
      proof_details: reason,
      tutor_id: authedUser.id,
      change_type: changeType,
      new_email: changeType === 'email' ? submittedContact : null,
      new_phone: changeType === 'phone' ? submittedContact : null,
      status: 'pending',
    })

  // ── 4. Mark any pending contact_change_requests row as support_review ───────
  await service
    .from('contact_change_requests')
    .update({ status: 'support_review' })
    .eq('tutor_id', authedUser.id)
    .eq('change_type', changeType)
    .in('status', ['pending_old_otp', 'pending_new_otp'])

  // ── 5. Internal alert email (fire and forget) ───────────────────────────────
  const submittedAt = new Date().toLocaleDateString('en-LK', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  notifySupportTeam({
    tutorId: authedUser.id,
    tutorName: tutor?.name ?? 'Unknown tutor',
    tutorEmail: tutor?.email ?? authedUser.email ?? '',
    changeType,
    reason,
    submittedContact,
    submittedAt,
  }).catch(() => {})

  // ── 6. Audit log ─────────────────────────────────────────────────────────────
  logEvent(authedUser.id, 'support_recovery_requested', { change_type: changeType }).catch(() => {})

  return NextResponse.json({
    success: true,
    message: 'Our team will review your request within 24 hours and reach out.',
  })
}
