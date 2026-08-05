// ✅ CURRENT: Public POST — no auth required. Accepts account recovery submissions.
//    Rate limited by both IP hash and new_email hash (max 3 per hour each).
//    Inserts into support_requests table (all new columns) via service role.
//    Fires structured support alert to support@smartclaz.com and confirmation to new_email.
// 🚀 BEFORE LAUNCH: Assign recovery requests to a support queue / admin dashboard.
// 📝 NOTE: All IP addresses are SHA-256 hashed before storage — raw IPs never persisted.
//    Enumeration safety: never reveal whether old_email/old_phone matches any account.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, incrementAttempts } from '@/lib/rateLimit'
import { logEvent } from '@/lib/audit'
import { sendRecoveryRequestConfirmation } from '@/lib/resend'

// ── Types ─────────────────────────────────────────────────────────────────────

type RequestBody = {
  full_name:     string
  old_email?:    string
  old_phone?:    string
  new_email:     string
  new_phone:     string
  proof_details: string  // JSON string
}

type ProofDetails = {
  join_month:    string | null
  join_year:     string | null
  subjects:      string | null
  student_count: number | null
  other_details: string | null
}

// ── Internal: SHA-256 hash a string ──────────────────────────────────────────

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Internal: fire-and-forget structured support alert ────────────────────────

async function notifySupport(payload: {
  fullName:     string
  oldEmail:     string
  oldPhone:     string
  newEmail:     string
  newPhone:     string
  proof:        ProofDetails
  submittedAt:  string
  requestId:    string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const joinDate = [payload.proof.join_month, payload.proof.join_year].filter(Boolean).join(' ') || 'Not provided'

  const text = [
    `Full name: ${payload.fullName}`,
    '',
    'Account details (what they cannot access):',
    `  Old email: ${payload.oldEmail || 'not provided'}`,
    `  Old phone: ${payload.oldPhone || 'not provided'}`,
    '',
    'New contact details:',
    `  New email: ${payload.newEmail}`,
    `  New phone: ${payload.newPhone}`,
    '',
    'Identity verification:',
    `  Approximate join date: ${joinDate}`,
    `  Subjects taught: ${payload.proof.subjects || 'not provided'}`,
    `  Student count: ${payload.proof.student_count ?? 'not provided'}`,
    `  Other details: ${payload.proof.other_details || 'not provided'}`,
    '',
    `Submitted: ${payload.submittedAt}`,
    `Request ID: ${payload.requestId}`,
    '',
    'To resolve: Update tutors table in Supabase with new email/phone,',
    'then notify tutor at new_email.',
  ].join('\n')

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <body style="margin:0;padding:40px 0;background:#f6f8fc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table width="580" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #dee2e6;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(150deg,#6f8bff 0%,#3b5bdb 100%);padding:20px 32px;">
            <p style="margin:0;color:#fff;font-weight:800;font-size:16px;">Account Recovery Request — ${payload.fullName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">

            <!-- Identity row -->
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#3b5bdb;text-transform:uppercase;letter-spacing:0.08em;">Submitted by</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
              <tr><td style="font-size:13px;color:#1a1a2e;padding-bottom:8px;"><strong>Full name:</strong> ${payload.fullName}</td></tr>
            </table>

            <!-- Old contact -->
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#3b5bdb;text-transform:uppercase;letter-spacing:0.08em;">Account details (cannot access)</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
              <tr><td style="font-size:13px;color:#1a1a2e;padding-bottom:8px;"><strong>Old email:</strong> ${payload.oldEmail || '<span style="color:#adb5bd">not provided</span>'}</td></tr>
              <tr><td style="font-size:13px;color:#1a1a2e;"><strong>Old phone:</strong> ${payload.oldPhone || '<span style="color:#adb5bd">not provided</span>'}</td></tr>
            </table>

            <!-- New contact -->
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#3b5bdb;text-transform:uppercase;letter-spacing:0.08em;">New contact details</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
              <tr><td style="font-size:13px;color:#1a1a2e;padding-bottom:8px;"><strong>New email:</strong> ${payload.newEmail}</td></tr>
              <tr><td style="font-size:13px;color:#1a1a2e;"><strong>New phone:</strong> ${payload.newPhone}</td></tr>
            </table>

            <!-- Proof details -->
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#3b5bdb;text-transform:uppercase;letter-spacing:0.08em;">Identity verification</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
              <tr><td style="font-size:13px;color:#1a1a2e;padding-bottom:8px;"><strong>Approx. join date:</strong> ${joinDate}</td></tr>
              <tr><td style="font-size:13px;color:#1a1a2e;padding-bottom:8px;"><strong>Subjects taught:</strong> ${payload.proof.subjects || '<span style="color:#adb5bd">not provided</span>'}</td></tr>
              <tr><td style="font-size:13px;color:#1a1a2e;padding-bottom:8px;"><strong>Student count:</strong> ${payload.proof.student_count ?? '<span style="color:#adb5bd">not provided</span>'}</td></tr>
              <tr><td style="font-size:13px;color:#1a1a2e;"><strong>Other details:</strong> ${payload.proof.other_details || '<span style="color:#adb5bd">not provided</span>'}</td></tr>
            </table>

            <!-- Meta -->
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#edf2ff;border:1px solid #dbe4ff;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
              <tr><td style="font-size:12px;color:#1a1a2e;padding-bottom:6px;"><strong>Submitted:</strong> ${payload.submittedAt}</td></tr>
              <tr><td style="font-size:12px;color:#6c757d;font-family:monospace;"><strong>Request ID:</strong> ${payload.requestId}</td></tr>
            </table>

            <!-- Action note -->
            <div style="background:#fff9db;border:1px solid #ffec99;border-radius:10px;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#e67700;font-weight:700;">To resolve:</p>
              <p style="margin:6px 0 0;font-size:13px;color:#1a1a2e;line-height:1.6;">
                Update the <code style="background:#f1f3f5;padding:2px 5px;border-radius:4px;">tutors</code> table in Supabase with the new email and phone,
                then notify the tutor at <strong>${payload.newEmail}</strong>.
              </p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #f1f3f5;">
            <p style="margin:0;font-size:11px;color:#adb5bd;text-align:center;">Smartclaz &middot; support@smartclaz.com</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Smartclaz <onboarding@resend.dev>',
        to:      ['support@smartclaz.com'],
        subject: `Account Recovery Request — ${payload.fullName}`,
        html,
        text,
      }),
    })
  } catch {
    // ✅ CURRENT: Fire and forget — never let email failures block the response.
  }
}

// ── POST /api/auth/support-recovery ──────────────────────────────────────────
// Body: { full_name, old_email?, old_phone?, new_email, new_phone, proof_details }
// Public — no auth required.

export async function POST(req: NextRequest): Promise<NextResponse> {

  // ── 1. Parse and validate body ────────────────────────────────────────────
  let body: RequestBody

  try {
    const raw = await req.json()
    body = {
      full_name:     (raw.full_name     ?? '').trim(),
      old_email:     (raw.old_email     ?? '').trim().toLowerCase() || undefined,
      old_phone:     (raw.old_phone     ?? '').trim()               || undefined,
      new_email:     (raw.new_email     ?? '').trim().toLowerCase(),
      new_phone:     (raw.new_phone     ?? '').trim(),
      proof_details: (raw.proof_details ?? '{}'),
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!body.full_name || body.full_name.length < 2) {
    return NextResponse.json({ error: 'Full name is required (min 2 characters).' }, { status: 400 })
  }
  if (!body.new_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.new_email)) {
    return NextResponse.json({ error: 'A valid new email address is required.' }, { status: 400 })
  }
  if (!body.new_phone) {
    return NextResponse.json({ error: 'A new phone number is required.' }, { status: 400 })
  }

  // Parse proof_details — never reject on malformed JSON, just default to empty.
  let proof: ProofDetails = {
    join_month:    null,
    join_year:     null,
    subjects:      null,
    student_count: null,
    other_details: null,
  }
  try {
    const parsed = JSON.parse(body.proof_details)
    proof = {
      join_month:    parsed.join_month    ?? null,
      join_year:     parsed.join_year     ?? null,
      subjects:      parsed.subjects      ?? null,
      student_count: parsed.student_count ?? null,
      other_details: parsed.other_details ?? null,
    }
  } catch {
    // ✅ CURRENT: Malformed proof JSON — continue with empty proof, do not reject.
  }

  // ── 2. Extract and hash IP ────────────────────────────────────────────────
  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'

  const hashedIp    = await sha256(rawIp)
  const hashedEmail = await sha256(body.new_email)

  // ── 3. Rate limit checks — IP AND new_email (both must pass) ─────────────
  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(rawIp,          'recovery_request'),
    checkRateLimit(body.new_email, 'recovery_request'),
  ])

  if (ipCheck.limited || emailCheck.limited) {
    const retryAfterSecs = Math.max(ipCheck.retryAfterSecs, emailCheck.retryAfterSecs)

    logEvent(null, 'recovery_rate_limited', {
      ip_hash:    hashedIp,
      email_hash: hashedEmail,
    }).catch(() => {})

    return NextResponse.json(
      {
        error: 'Too many recovery attempts. Please try again later.',
        retryAfterSecs,
        retryAfterMins: Math.ceil(retryAfterSecs / 60),
      },
      { status: 429 },
    )
  }

  // ── 4. Increment attempt counters (fire and forget) ───────────────────────
  incrementAttempts(rawIp,          'recovery_request').catch(() => {})
  incrementAttempts(body.new_email, 'recovery_request').catch(() => {})

  // ── 5. Insert into support_requests via service role ─────────────────────
  // 📝 NOTE: Service role bypasses RLS — anon/authenticated roles cannot access this table.
  let requestId = crypto.randomUUID()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceKey) {
    const adminClient = createClient(supabaseUrl, serviceKey)

    // 🚀 BEFORE LAUNCH: Add Sentry / monitoring for persistent insert failures.
    const { data: inserted } = await adminClient
      .from('support_requests')
      .insert({
        full_name:       body.full_name,
        old_email:       body.old_email  || null,
        old_phone:       body.old_phone  || null,
        new_email:       body.new_email,
        new_phone:       body.new_phone,
        proof_details:   body.proof_details,
        ip_address:      hashedIp,
        status:          'pending',
      })
      .select('id')
      .single()

    if (inserted?.id) {
      requestId = inserted.id
    }
  }

  // ── 6. Audit log ──────────────────────────────────────────────────────────
  logEvent(null, 'support_recovery_requested', {
    ip_hash:    hashedIp,
    email_hash: hashedEmail,
    entity:     'support_request',
    request_id: requestId,
  }).catch(() => {})

  // ── 7. Send emails (fire and forget) ─────────────────────────────────────
  const submittedAt = new Date().toLocaleDateString('en-LK', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // Confirmation sent to new_email — NOT old_email (tutor may not have access to it).
  // 📝 NOTE: sendRecoveryRequestConfirmation already uses new_email address in its body.
  sendRecoveryRequestConfirmation(body.new_email).catch(() => {})

  // Structured alert to support team
  notifySupport({
    fullName:    body.full_name,
    oldEmail:    body.old_email  || '',
    oldPhone:    body.old_phone  || '',
    newEmail:    body.new_email,
    newPhone:    body.new_phone,
    proof,
    submittedAt,
    requestId,
  }).catch(() => {})

  // ── 8. Return success ─────────────────────────────────────────────────────
  return NextResponse.json({ ok: true })
}
