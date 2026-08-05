/**
 * Transactional email via Resend API.
 * ✅ CURRENT: Using Resend test domain (onboarding@resend.dev).
 * 🚀 BEFORE LAUNCH: Add verified smartclaz.com domain in Resend dashboard.
 *    Update FROM address from 'onboarding@resend.dev' → 'hello@smartclaz.com'
 *    Steps: resend.com → Domains → Add Domain → smartclaz.com → verify DNS
 * 📝 NOTE: Add RESEND_API_KEY=re_xxx to .env.local
 *    Get key from: resend.com → API Keys
 *
 * IMPORTANT: This module is SERVER ONLY.
 *   Never import in client components — RESEND_API_KEY must never reach the browser.
 *   Call from: API routes, Server Actions, or server components only.
 *
 * All functions are fire-and-forget.
 * They catch all errors silently and NEVER block or throw.
 * If email fails, the main flow continues unaffected.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const RESEND_API_URL = 'https://api.resend.com/emails'

// ✅ CURRENT: Using Resend test sender (works without domain verification)
// 🚀 BEFORE LAUNCH: Change to 'hello@smartclaz.com' after domain is verified in Resend
const FROM_ADDRESS = 'onboarding@resend.dev'
const FROM_NAME    = 'Smartclaz'

// ── Internal send helper ───────────────────────────────────────────────────────

async function sendEmail(payload: {
  to:      string
  subject: string
  html:    string
  text?:   string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  // ✅ CURRENT: Skip silently if RESEND_API_KEY not configured (dev without key)
  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[resend] RESEND_API_KEY not set — skipping email send')
    }
    return
  }

  try {
    await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_ADDRESS}>`,
        to:      [payload.to],
        subject: payload.subject,
        html:    payload.html,
        text:    payload.text,
      }),
    })
  } catch {
    // ✅ CURRENT: Silently ignore — email is never load-bearing.
    // 🚀 BEFORE LAUNCH: Add error monitoring (e.g. Sentry) to catch persistent failures.
  }
}

// ── sendWelcomeEmail ───────────────────────────────────────────────────────────

/**
 * Send a welcome email after Step 3 (settings) is completed.
 * Triggered once when the tutor's status is set to 'active'.
 * Fire and forget — never await on the critical path.
 *
 * @param name  - Tutor's full name (e.g. "Kamal Perera")
 * @param email - Tutor's email address
 *
 * 🚀 BEFORE LAUNCH — Test this fully before going live:
 *    □ Complete a real signup and confirm email arrives in inbox (not spam)
 *    □ Verify sender shows 'hello@smartclaz.com' (add domain in Resend → Domains first)
 *    □ Check "Go to your dashboard" button links to the correct production URL
 *    □ Test on mobile — email must render correctly on small screens
 *    □ onboarding@resend.dev (current test sender) ONLY delivers to the Resend
 *      account owner's email — it will silently drop all other addresses
 *    □ Ensure RESEND_API_KEY is set in .env.local — missing key = silent skip
 *    See also: checklist item 11 in lib/auth.ts
 */
export async function sendWelcomeEmail(name: string, email: string): Promise<void> {
  // Derive first name for a personal greeting
  const firstName = name.split(' ')[0] ?? name

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Smartclaz</title>
    </head>
    <body style="margin:0;padding:0;background:#f6f8fc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fc;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:18px;border:1px solid #dee2e6;overflow:hidden;">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(150deg,#6f8bff 0%,#3b5bdb 52%,#2f49b8 100%);padding:32px 40px 28px;">
                  <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.03em;">
                    Smartclaz
                  </h1>
                  <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">
                    Less admin. More teaching.
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a1a2e;letter-spacing:-0.02em;">
                    You're all set, ${firstName}!
                  </p>
                  <p style="margin:0 0 28px;font-size:14px;color:#6c757d;line-height:1.6;">
                    Welcome to Smartclaz. Your tutor profile is live and ready for students.
                  </p>

                  <!-- Checklist -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:#f8f9ff;border:1px solid #dbe4ff;border-radius:14px;padding:20px 24px;">
                        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#3b5bdb;text-transform:uppercase;letter-spacing:0.1em;">
                          Your setup is complete
                        </p>
                        ${[
                          'Your profile is live',
                          'Your subjects and fees are configured',
                          'Your availability is set',
                          'Students can message you as always',
                        ].map(item => `
                        <p style="margin:0 0 10px;font-size:14px;color:#1a1a2e;display:flex;align-items:center;">
                          <span style="color:#2f9e44;font-weight:700;margin-right:10px;">✓</span>
                          ${item}
                        </p>`).join('')}
                      </td>
                    </tr>
                  </table>

                  <!-- CTA -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                    <tr>
                      <td align="center">
                        <a
                          href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://smartclaz.com'}/dashboard"
                          style="display:inline-block;background:#3b5bdb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:-0.01em;"
                        >
                          Go to your dashboard
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:28px 0 0;font-size:13px;color:#6c757d;line-height:1.7;border-top:1px solid #f1f3f5;padding-top:24px;">
                    Need help? Reply to this email or reach us at
                    <a href="mailto:support@smartclaz.com" style="color:#3b5bdb;text-decoration:none;">support@smartclaz.com</a>
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#f8f9fa;padding:20px 40px;border-top:1px solid #f1f3f5;">
                  <p style="margin:0;font-size:12px;color:#adb5bd;text-align:center;">
                    The Smartclaz Team &nbsp;&middot;&nbsp;
                    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://smartclaz.com'}" style="color:#adb5bd;text-decoration:none;">smartclaz.com</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  const text = [
    `You're all set, ${firstName}!`,
    '',
    'Welcome to Smartclaz. Your tutor profile is live.',
    '',
    'Your setup is complete:',
    '✓ Your profile is live',
    '✓ Your subjects and fees are configured',
    '✓ Your availability is set',
    '✓ Students can message you as always',
    '',
    `Go to your dashboard: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://smartclaz.com'}/dashboard`,
    '',
    '— The Smartclaz Team',
  ].join('\n')

  await sendEmail({
    to:      email,
    subject: `Welcome to Smartclaz, ${firstName}!`,
    html,
    text,
  })
}

// ── sendSecurityAlert ──────────────────────────────────────────────────────────

/**
 * Send a generic security alert email to the tutor.
 * Used for suspicious activity, login from new device, etc.
 * Fire and forget — never await on the critical path.
 *
 * @param email   - Tutor's email address
 * @param message - Plain-text description of the security event
 */
export async function sendSecurityAlert(email: string, message: string): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <body style="margin:0;padding:40px 0;background:#f6f8fc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table width="560" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #ffc9c9;overflow:hidden;">
        <tr>
          <td style="background:#c92a2a;padding:20px 32px;">
            <p style="margin:0;color:#fff;font-weight:800;font-size:16px;">Smartclaz Security Alert</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">${message}</p>
            <p style="margin:0;font-size:13px;color:#6c757d;line-height:1.6;">
              If this wasn't you, contact us immediately at
              <a href="mailto:security@smartclaz.com" style="color:#c92a2a;text-decoration:none;">security@smartclaz.com</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #f1f3f5;">
            <p style="margin:0;font-size:11px;color:#adb5bd;text-align:center;">Smartclaz &middot; security@smartclaz.com</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  await sendEmail({
    to:      email,
    subject: 'Smartclaz Security Alert',
    html,
    text:    `Smartclaz Security Alert\n\n${message}\n\nIf this wasn't you, contact security@smartclaz.com immediately.`,
  })
}

// ── sendRecoveryRequestConfirmation ───────────────────────────────────────────

/**
 * Send a confirmation email to the address submitted in a support recovery request.
 * Lets the owner know a request was filed — and reassures them if it was them.
 * Fire and forget — never await on the critical path.
 *
 * @param email - The email address submitted in the recovery form
 */
export async function sendRecoveryRequestConfirmation(email: string): Promise<void> {
  const submittedAt = new Date().toLocaleDateString('en-LK', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <body style="margin:0;padding:40px 0;background:#f6f8fc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table width="560" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #dee2e6;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(150deg,#6f8bff 0%,#3b5bdb 100%);padding:20px 32px;">
            <p style="margin:0;color:#fff;font-weight:800;font-size:16px;">Smartclaz — Recovery Request Received</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">
              We received an account recovery request for this email address on <strong>${submittedAt}</strong>.
            </p>
            <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">
              Our team will verify your identity and contact you within 24 hours.
            </p>
            <p style="margin:0 0 16px;font-size:14px;color:#6c757d;line-height:1.6;">
              If this wasn&apos;t you, you can safely ignore this message. No changes have been made to your account.
            </p>
            <p style="margin:0;font-size:13px;color:#6c757d;line-height:1.6;">
              For urgent help contact
              <a href="mailto:support@smartclaz.com" style="color:#3b5bdb;text-decoration:none;">support@smartclaz.com</a>
            </p>
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

  await sendEmail({
    to:      email,
    subject: 'We received your Smartclaz recovery request',
    html,
    text: [
      'We received an account recovery request for this email address.',
      '',
      `Submitted: ${submittedAt}`,
      '',
      'Our team will verify your identity and contact you within 24 hours.',
      '',
      "If this wasn't you, you can safely ignore this message. No changes have been made to your account.",
      '',
      'For urgent help: support@smartclaz.com',
      '',
      '— The Smartclaz Team',
    ].join('\n'),
  })
}

// ── sendOtpEmail ───────────────────────────────────────────────────────────────

/**
 * Send a self-contained 6-digit OTP code by email.
 * Used ONLY by the dual-channel change-email / change-phone flows
 * (app/api/auth/change-email/* and app/api/auth/change-phone/*).
 *
 * ⚠️ This is NOT a Supabase Auth OTP. The code is generated and verified
 * entirely server-side against the `contact_change_requests` table — it
 * never calls supabase.auth.signInWithOtp / verifyOtp, so sending or
 * verifying this code never changes the tutor's active session.
 * Fire and forget — never await on the critical path.
 *
 * @param email   - Address to deliver the code to (may be the tutor's
 *                  current OR new email depending on which step of the flow)
 * @param otp     - 6-digit numeric code, generated by the caller
 * @param context - Short human-readable purpose shown in the email body,
 *                  e.g. "confirming your identity to change your email"
 */
export async function sendOtpEmail(email: string, otp: string, context: string): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <body style="margin:0;padding:40px 0;background:#f6f8fc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table width="480" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #dee2e6;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(150deg,#6f8bff 0%,#3b5bdb 100%);padding:20px 32px;">
            <p style="margin:0;color:#fff;font-weight:800;font-size:16px;">Smartclaz Verification Code</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 20px;font-size:14px;color:#1a1a2e;line-height:1.6;">
              Use this code for ${context}:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf2ff;border:1px solid #dbe4ff;border-radius:10px;padding:18px;margin-bottom:20px;">
              <tr>
                <td align="center" style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;letter-spacing:0.2em;color:#3b5bdb;">
                  ${otp}
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px;font-size:13px;color:#6c757d;line-height:1.6;">
              This code expires in 30 minutes. Never share this code with anyone — Smartclaz staff will never ask you for it.
            </p>
            <p style="margin:0;font-size:13px;color:#6c757d;line-height:1.6;">
              If you didn't request this, contact us immediately at
              <a href="mailto:security@smartclaz.com" style="color:#3b5bdb;text-decoration:none;">security@smartclaz.com</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #f1f3f5;">
            <p style="margin:0;font-size:11px;color:#adb5bd;text-align:center;">Smartclaz &middot; security@smartclaz.com</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  await sendEmail({
    to:      email,
    subject: `${otp} is your Smartclaz verification code`,
    html,
    text: [
      `Your Smartclaz verification code is: ${otp}`,
      '',
      `Use this code for ${context}.`,
      '',
      'This code expires in 30 minutes. Never share this code with anyone.',
      '',
      "If you didn't request this, contact security@smartclaz.com immediately.",
    ].join('\n'),
  })
}

// ── sendWhatsAppSecurityAlert (stub) ──────────────────────────────────────────

// 📝 NOTE: WhatsApp security notifications (for email/phone changes) go here.
// ✅ CURRENT: WhatsApp notifications not yet wired — Twilio not configured.
// 🚀 BEFORE LAUNCH: When Twilio is ready, implement sendWhatsAppAlert(phone, message):
//    Send to tutor's whatsapp_number when email or phone changes.
//    Message: "Your Smartclaz email address was just changed. If this wasn't you reply HELP immediately."
//    Use Twilio WhatsApp API: POST to https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages

/**
 * Send a WhatsApp security notification to the tutor's WhatsApp number.
 * ✅ CURRENT: No-op stub — Twilio is not yet configured.
 * 🚀 BEFORE LAUNCH: Implement with Twilio WhatsApp API.
 *
 * @param phone   - Tutor's WhatsApp number (e.g. +94771234567)
 * @param message - Plain-text message body
 */
export async function sendWhatsAppSecurityAlert(phone: string, message: string): Promise<void> {
  // 🚀 BEFORE LAUNCH: Implement with Twilio
  // const accountSid = process.env.TWILIO_ACCOUNT_SID
  // const authToken  = process.env.TWILIO_AUTH_TOKEN
  // const from       = process.env.TWILIO_WHATSAPP_FROM  // e.g. 'whatsapp:+14155238886'
  // await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
  //   method: 'POST',
  //   headers: { 'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`) },
  //   body: new URLSearchParams({ From: from, To: `whatsapp:${phone}`, Body: message }),
  // })

  // ✅ CURRENT: No-op — logs in development only
  if (process.env.NODE_ENV === 'development') {
    console.log(`[whatsapp-stub] Would send to ${phone}: ${message}`)
  }
}

// ── sendPhoneChangedEmail ──────────────────────────────────────────────────────

/**
 * Notify the tutor when their phone number is changed.
 * Sent to the tutor's email on file so they can detect unauthorized changes.
 * Fire and forget — never await on the critical path.
 *
 * @param email    - Tutor's email address (used to send the alert)
 * @param oldPhone - Previous phone number (will be masked in email)
 * @param newPhone - New phone number (will be masked in email)
 */
export async function sendPhoneChangedEmail(
  email: string,
  oldPhone: string,
  newPhone: string,
): Promise<void> {
  // ✅ CURRENT: Mask phone numbers before including in email body.
  // Show only first 4 and last 2 digits — never the full number.
  function maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 6) return '***'
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)}*** **${digits.slice(-2)}`
  }

  const maskedOld = maskPhone(oldPhone)
  const maskedNew = maskPhone(newPhone)
  const changeDate = new Date().toLocaleDateString('en-LK', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <body style="margin:0;padding:40px 0;background:#f6f8fc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table width="560" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #dee2e6;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(150deg,#6f8bff 0%,#3b5bdb 100%);padding:20px 32px;">
            <p style="margin:0;color:#fff;font-weight:800;font-size:16px;">Smartclaz — Phone Number Changed</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">
              Your Smartclaz phone number was changed on <strong>${changeDate}</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:10px;padding:16px 20px;margin-bottom:20px;width:100%;">
              <tr>
                <td style="font-size:13px;color:#6c757d;padding-bottom:8px;">
                  <strong style="color:#343a40;">Previous number:</strong> ${maskedOld}
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#6c757d;">
                  <strong style="color:#343a40;">New number:</strong> ${maskedNew}
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#6c757d;line-height:1.6;">
              If you did not make this change, contact us immediately at
              <a href="mailto:security@smartclaz.com" style="color:#c92a2a;text-decoration:none;">security@smartclaz.com</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #f1f3f5;">
            <p style="margin:0;font-size:11px;color:#adb5bd;text-align:center;">Smartclaz &middot; security@smartclaz.com</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  await sendEmail({
    to:      email,
    subject: 'Your Smartclaz phone number was changed',
    html,
    text: [
      'Your Smartclaz phone number was changed.',
      '',
      `Date: ${changeDate}`,
      `Previous number: ${maskedOld}`,
      `New number: ${maskedNew}`,
      '',
      "If this wasn't you, contact security@smartclaz.com immediately.",
    ].join('\n'),
  })
}
