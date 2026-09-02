/*
 * ============================================
 * SMARTCLAZ AUTH — BEFORE LAUNCH CHECKLIST
 * ============================================
 *
 * □ 1. Switch login to phone OTP (Twilio SMS)
 *      File: lib/auth.ts → sendPhoneOTP()
 *      Supabase: Auth → Providers → Phone → Twilio
 *
 * □ 2. Switch signup confirmation to phone verify
 *      File: app/(auth)/signup/page.tsx
 *      Add phone OTP after email OTP verified
 *
 * □ 3. Wire WhatsApp Business API (Twilio)
 *      File: app/(auth)/signup/preferences/page.tsx
 *      Connect tutor WhatsApp number to bot
 *
 * □ 4. Replace Resend test domain with real domain
 *      File: lib/resend.ts
 *      Add smartclaz.com to Resend → Domains
 *      Update from: 'hello@smartclaz.com'
 *
 * □ 5. Add real Cloudflare Turnstile keys
 *      File: .env.local
 *      dash.cloudflare.com → Turnstile → Add site
 *
 * □ 6. Set Supabase OTP expiry to 600 seconds
 *      Supabase: Auth → Settings → OTP expiry: 600
 *
 * □ 7. Set Supabase Site URL to production URL
 *      Supabase: Auth → URL Config → smartclaz.com
 *
 * □ 8. Remove all console.log with sensitive data
 *      Search codebase for: console.log
 *      Remove all logs in auth flow
 *
 * □ 9. Test full flow on real phone number
 *       Real SMS OTP received and verified
 *
 * □ 10. Test recovery flow
 *        Lost phone → email → update phone
 *
 * □ 11. Test welcome email end-to-end
 *        Complete a real signup flow and confirm:
 *        - Email arrives at the tutor's inbox
 *        - Sender shows 'hello@smartclaz.com' (not onboarding@resend.dev)
 *        - "Go to your dashboard" button link works
 *        - Email renders correctly on mobile
 *        File: lib/resend.ts → sendWelcomeEmail()
 *        Route: app/api/auth/welcome-email/route.ts
 *        Triggered by: app/(auth)/signup/preferences/page.tsx on step 4 complete
 *        ⚠️  onboarding@resend.dev only delivers to the Resend account owner's
 *            email — verify domain before testing with real tutor emails
 *
 * □ 12. Add ANTHROPIC_API_KEY to environment
 *        File: .env.local → ANTHROPIC_API_KEY=
 *        Get from: console.anthropic.com → API Keys
 *        Required for: WhatsApp bot intent classifier (lib/bot/claude-intent.ts)
 *        Without it: bot falls back to simple string matching only
 *        Cost estimate: ~$0.001/message (claude-haiku) ≈ $0.50/month per tutor
 *        ⚠️  Must add BEFORE testing the bot end-to-end
 * ============================================
 */

/**
 * Auth utilities for Smartclaz.
 *
 * ✅ CURRENT: Email OTP via Supabase built-in email service.
 * 🚀 BEFORE LAUNCH: Switch to Phone OTP (SMS via Twilio).
 *    Students and tutors use phone numbers, not email, as their primary identity.
 *    Steps:
 *      1. Supabase: Authentication → Providers → Phone → enable Twilio
 *      2. Enter: Account SID, Auth Token, and Twilio WhatsApp/SMS number
 *      3. In sendEmailOTP(): change to supabase.auth.signInWithOtp({ phone: '+94xxxxxxxxx' })
 *      4. In verifyEmailOTP(): change type: 'sms' and pass phone instead of email
 *      5. Rename both functions to sendPhoneOTP / verifyPhoneOTP for clarity
 *      6. Update all callers in signup/page.tsx and login/page.tsx
 *    📝 NOTE: Phone number is already collected in signup step 1 and saved as +94xxxxxxxxx format.
 */

// Session management: Supabase uses httpOnly cookies automatically via @supabase/ssr.
// Never store auth tokens in localStorage or sessionStorage.
// Tokens are never accessible to JavaScript — XSS-safe by default.

import { createBrowserClient } from '@supabase/ssr'
import { logEvent } from '@/lib/audit'

// ── Dev mode flag ─────────────────────────────────────────────────────────────
export const DEV_MODE = process.env.NODE_ENV === 'development'

// ── Enumeration-safe messaging ────────────────────────────────────────────────
// Enumeration-safe: same response whether email exists or not.
// Never reveal if an account is registered.
export const ENUMERATION_SAFE_MSG =
  "If an account exists with these details, we'll send you instructions shortly."

// ── Supabase client (created lazily inside functions) ───────────────────────

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ── OTP attempt tracking ─────────────────────────────────────────────────────
// Tracks wrong OTP attempts and lockout state per identifier (email).
// Max 5 wrong attempts → 15-minute lockout.
// Also tracks how many OTPs were sent (otpCount) to enforce per-hour limits.

const OTP_ATTEMPTS_KEY = 'sc_otp_attempts_v2'

interface AttemptRecord {
  identifier: string
  wrongAttempts: number
  lockedUntil: number | null  // unix timestamp ms
  windowStart: number          // unix timestamp ms
  otpCount: number             // how many OTPs sent this hour
}

const WRONG_ATTEMPT_LOCK_THRESHOLD = 5
const LOCK_DURATION_MS = 15 * 60 * 1000     // 15 minutes
const OTP_WINDOW_MS    = 60 * 60 * 1000     // 1 hour
const MAX_OTP_PER_HOUR = 5

function getAttemptStore(): AttemptRecord[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(OTP_ATTEMPTS_KEY) ?? '[]') as AttemptRecord[]
  } catch {
    return []
  }
}

function saveAttemptStore(records: AttemptRecord[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(OTP_ATTEMPTS_KEY, JSON.stringify(records))
}

export function getAttemptRecord(identifier: string): AttemptRecord {
  const store = getAttemptStore()
  const now = Date.now()
  const existing = store.find(r => r.identifier === identifier)
  if (!existing) {
    return {
      identifier,
      wrongAttempts: 0,
      lockedUntil: null,
      windowStart: now,
      otpCount: 0,
    }
  }
  // Reset window if more than 1 hour has passed
  if (now - existing.windowStart > OTP_WINDOW_MS) {
    return {
      identifier,
      wrongAttempts: 0,
      lockedUntil: null,
      windowStart: now,
      otpCount: 0,
    }
  }
  // Clear expired lock
  if (existing.lockedUntil && now > existing.lockedUntil) {
    return {
      ...existing,
      wrongAttempts: 0,
      lockedUntil: null,
    }
  }
  return existing
}

function saveAttemptRecord(record: AttemptRecord): void {
  const store = getAttemptStore()
  const idx = store.findIndex(r => r.identifier === record.identifier)
  if (idx === -1) {
    store.push(record)
  } else {
    store[idx] = record
  }
  saveAttemptStore(store)
}

/** Record a wrong OTP attempt and return the updated record. */
export function recordWrongAttempt(identifier: string): AttemptRecord {
  const rec = getAttemptRecord(identifier)
  const next: AttemptRecord = {
    ...rec,
    wrongAttempts: rec.wrongAttempts + 1,
    lockedUntil:
      rec.wrongAttempts + 1 >= WRONG_ATTEMPT_LOCK_THRESHOLD
        ? Date.now() + LOCK_DURATION_MS
        : null,
  }
  saveAttemptRecord(next)
  return next
}

/** Clear wrong-attempt counter after a successful verify. */
export function recordSuccessfulVerify(identifier: string): void {
  const rec = getAttemptRecord(identifier)
  const cleared: AttemptRecord = {
    ...rec,
    wrongAttempts: 0,
    lockedUntil: null,
  }
  saveAttemptRecord(cleared)
}

/** Check whether the identifier is currently locked out. */
export function isLockedOut(identifier: string): { locked: boolean; remainingSecs: number } {
  const rec = getAttemptRecord(identifier)
  if (!rec.lockedUntil) return { locked: false, remainingSecs: 0 }
  const remaining = rec.lockedUntil - Date.now()
  if (remaining <= 0) return { locked: false, remainingSecs: 0 }
  return { locked: true, remainingSecs: Math.ceil(remaining / 1000) }
}

// ── Legacy rate limiting (OTP send rate) ─────────────────────────────────────
// These are kept for backward-compat with existing callers.
// New code should use getAttemptRecord / otpCount instead.

const RATE_LIMIT_KEY = 'sc_otp_attempts'
const MAX_ATTEMPTS   = 3
const WINDOW_MS      = 60 * 60 * 1000   // 1 hour

type LegacyAttemptRecord = { identifier: string; timestamps: number[] }

function getLegacyRateLimitStore(): LegacyAttemptRecord[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) ?? '[]') as LegacyAttemptRecord[]
  } catch {
    return []
  }
}

function saveLegacyRateLimitStore(records: LegacyAttemptRecord[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(records))
}

/** Returns true if this identifier has hit the per-hour OTP send limit. */
export function isRateLimited(identifier: string): boolean {
  // Check new attempt record system first
  const rec = getAttemptRecord(identifier)
  if (rec.otpCount >= MAX_OTP_PER_HOUR) return true

  // Fall back to legacy store
  const now    = Date.now()
  const store  = getLegacyRateLimitStore()
  const record = store.find(r => r.identifier === identifier)
  if (!record) return false
  const recent = record.timestamps.filter(t => now - t < WINDOW_MS)
  return recent.length >= MAX_ATTEMPTS
}

/** Records one OTP send attempt for the given identifier. */
export function recordAttempt(identifier: string): void {
  const now   = Date.now()
  const store = getLegacyRateLimitStore()
  const idx   = store.findIndex(r => r.identifier === identifier)

  if (idx === -1) {
    store.push({ identifier, timestamps: [now] })
  } else {
    const recent = store[idx].timestamps.filter(t => now - t < WINDOW_MS)
    store[idx].timestamps = [...recent, now]
  }
  saveLegacyRateLimitStore(store)

  // Also increment otpCount in the new attempt record
  const rec = getAttemptRecord(identifier)
  const updated: AttemptRecord = {
    ...rec,
    otpCount: rec.otpCount + 1,
  }
  saveAttemptRecord(updated)
}

// ── Signup device rate limiting ────────────────────────────────────────────────
// Client-side device fingerprint rate limit (backup measure).
// TODO BEFORE LAUNCH: Implement server-side IP rate limiting.
// Create API route: app/api/auth/check-rate-limit/route.ts
// Read IP from: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
// Store hashed IP (SHA-256) in rate_limits table
// Max 5 signup attempts per IP per hour
// The rate_limits table SQL is in the DB migration notes in lib/db-migrations.ts

const SIGNUP_RATE_KEY  = 'sc_signup_rate'
const MAX_SIGNUP_PER_HOUR = 5

interface SignupRateRecord {
  timestamps: number[]
}

export function isSignupRateLimited(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(SIGNUP_RATE_KEY)
    if (!raw) return false
    const rec: SignupRateRecord = JSON.parse(raw)
    const now = Date.now()
    const recent = rec.timestamps.filter(t => now - t < OTP_WINDOW_MS)
    return recent.length >= MAX_SIGNUP_PER_HOUR
  } catch {
    return false
  }
}

export function recordSignupAttempt(): void {
  if (typeof window === 'undefined') return
  try {
    const now = Date.now()
    const raw = localStorage.getItem(SIGNUP_RATE_KEY)
    const rec: SignupRateRecord = raw ? JSON.parse(raw) : { timestamps: [] }
    const recent = rec.timestamps.filter(t => now - t < OTP_WINDOW_MS)
    recent.push(now)
    localStorage.setItem(SIGNUP_RATE_KEY, JSON.stringify({ timestamps: recent }))
  } catch {
    // non-fatal
  }
}

// ── Result types ─────────────────────────────────────────────────────────────

export type OtpResult =
  | { success: true; message?: string }
  | { success: false; error: string; accountExists?: boolean }

export type VerifyResult =
  | { success: true; userId: string }
  | { success: false; error: string }

// ── sendPhoneOTP ─────────────────────────────────────────────────────────────

/**
 * Send a phone OTP via Supabase + Twilio SMS.
 * Primary login method for tutors.
 *
 * Prerequisites (Supabase dashboard):
 *   Authentication → Providers → Phone → Enable
 *   Enter: Twilio Account SID, Auth Token, Message Service SID
 *
 * @param phone - Full E.164 format, e.g. "+94771234567"
 */
export async function sendPhoneOTP(phone: string): Promise<OtpResult> {
  const rec = getAttemptRecord(phone)
  if (rec.otpCount >= MAX_OTP_PER_HOUR) {
    const windowResetMins = Math.ceil(
      (OTP_WINDOW_MS - (Date.now() - rec.windowStart)) / 60000,
    )
    return {
      success: false,
      error: `Maximum OTP requests reached. Please try again in ${windowResetMins} minute${windowResetMins !== 1 ? 's' : ''}.`,
    }
  }

  try {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },   // login only — user must exist
    })

    if (error) {
      if (error.message.toLowerCase().includes('rate')) {
        return { success: false, error: 'Too many OTP requests. Please wait before trying again.' }
      }
      // "Invalid phone number", "phone not enabled", etc.
      logEvent(null, 'otp_failed')
      return { success: false, error: 'Could not send SMS. Please check your number or use email login.' }
    }

    logEvent(null, 'otp_sent')
    return { success: true }
  } catch {
    return { success: false, error: 'Network error. Please check your connection and try again.' }
  }
}

// ── verifyPhoneOTP ────────────────────────────────────────────────────────────

/**
 * Verify a 6-digit SMS OTP and establish a Supabase session.
 *
 * @param phone - Full E.164 format, e.g. "+94771234567"
 * @param token - The 6-digit code the user entered
 */
export async function verifyPhoneOTP(phone: string, token: string): Promise<VerifyResult> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })

    if (error) {
      logEvent(null, 'otp_failed')
      if (
        error.message.toLowerCase().includes('invalid') ||
        error.message.toLowerCase().includes('expired')
      ) {
        return { success: false, error: 'Invalid or expired code — please try again.' }
      }
      return { success: false, error: 'Verification failed. Please request a new code.' }
    }

    if (!data.user) {
      logEvent(null, 'otp_failed')
      return { success: false, error: 'Verification failed. Please try again.' }
    }

    logEvent(data.user.id, 'otp_verified')
    return { success: true, userId: data.user.id }
  } catch {
    return { success: false, error: 'Network error. Please check your connection and try again.' }
  }
}

// ── sendEmailOTP ─────────────────────────────────────────────────────────────

// ✅ CURRENT: Email OTP via Supabase built-in email service.
// 📝 NOTE: Supabase email OTP is free — no SMTP or Twilio needed in development.
//    Supabase sends the 6-digit code directly from noreply@mail.app.supabase.io
//    Check spam folder if email doesn't arrive within 60 seconds.
// 🚀 BEFORE LAUNCH: Switch to phone OTP via Twilio SMS (see checklist item 1).
//    Keep this function as email fallback / recovery path.

/**
 * Send an email OTP via Supabase built-in email service.
 * No SMTP or Twilio needed in development.
 *
 * Supabase signInWithOtp is enumeration-safe by design — it does not reveal if the email exists.
 *
 * NOTE: Set OTP expiry in Supabase dashboard:
 * Authentication → Settings → OTP Expiry = 600 (10 minutes)
 *
 * 🚀 BEFORE LAUNCH — Replace with phone OTP: supabase.auth.signInWithOtp({ phone: tutorPhone })
 * See the file-level comment at the top of this file for full migration steps.
 */
export async function sendEmailOTP(email: string): Promise<OtpResult> {
  // Check per-hour OTP send limit before hitting Supabase
  const rec = getAttemptRecord(email)
  if (rec.otpCount >= MAX_OTP_PER_HOUR) {
    const windowResetMins = Math.ceil(
      (OTP_WINDOW_MS - (Date.now() - rec.windowStart)) / 60000,
    )
    return {
      success: false,
      error: `Maximum OTP requests reached. Please try again in ${windowResetMins} minute${windowResetMins !== 1 ? 's' : ''}.`,
    }
  }

  try {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined,
        // ✅ emailRedirectTo: undefined forces a 6-digit OTP code
        // instead of a clickable magic link email
        // 📝 NOTE: Without this, Supabase may send a magic link
        // depending on your email template configuration
      },
    })

    if (error) {
      if (error.message.toLowerCase().includes('rate')) {
        return {
          success: false,
          error: 'Too many OTP requests. Please wait before trying again.',
        }
      }

      // Any other Supabase error during signup OTP means the account already
      // exists in Supabase Auth (e.g. "User already registered", email provider
      // errors for confirmed users, etc.). Signal this explicitly so the UI
      // can show a clear "account exists — please log in" message.
      logEvent(null, 'otp_failed')
      return {
        success: false,
        error: 'An account with this email already exists.',
        accountExists: true,
      }
    }

    logEvent(null, 'otp_sent')
    return { success: true }
  } catch {
    return { success: false, error: 'Network error. Please check your connection and try again.' }
  }
}

// ── verifyEmailOTP ────────────────────────────────────────────────────────────

/**
 * Verify a 6-digit email OTP and establish a Supabase session.
 *
 * Supabase handles OTP hashing internally.
 * We never touch the raw OTP — only pass
 * user input directly to supabase.auth.verifyOtp().
 * Never log, store, or echo the token parameter.
 */
export async function verifyEmailOTP(email: string, token: string): Promise<VerifyResult> {
  // token is passed straight to Supabase — never logged
  // 📝 NOTE: type: 'email' works for both new signups and returning users.
  //    Using type: 'signup' fails for existing Supabase auth accounts because
  //    Supabase sends a 'magiclink' token type when the user already exists.
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      logEvent(null, 'otp_failed')
      if (
        error.message.toLowerCase().includes('invalid') ||
        error.message.toLowerCase().includes('expired')
      ) {
        return { success: false, error: 'Invalid or expired code — please try again.' }
      }
      return { success: false, error: 'Verification failed. Please request a new code.' }
    }

    if (!data.user) {
      logEvent(null, 'otp_failed')
      return { success: false, error: 'Verification failed. Please try again.' }
    }

    logEvent(data.user.id, 'otp_verified')
    return { success: true, userId: data.user.id }
  } catch {
    return { success: false, error: 'Network error. Please check your connection and try again.' }
  }
}

// ── signOut ───────────────────────────────────────────────────────────────────

/**
 * Sign the tutor out of ALL sessions and return to the landing page.
 * scope: 'global' invalidates all active sessions across devices.
 * Note: Supabase stores session in httpOnly cookies automatically.
 * Never store session token in localStorage or sessionStorage.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.auth.signOut({ scope: 'global' }) // invalidates ALL sessions
    logEvent(null, 'logout')
  } finally {
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }
}

// ── updateLastActive ──────────────────────────────────────────────────────────

/**
 * Update the tutor's last_active_at timestamp.
 * ✅ CURRENT: Called on dashboard page visits to track last activity time.
 * 📝 NOTE: Fire and forget — do not await. Requires last_active_at column in tutors table.
 *    SQL: ALTER TABLE tutors ADD COLUMN last_active_at timestamptz;
 *
 * Usage in dashboard layout or page:
 *   useEffect(() => { updateLastActive() }, [])
 */
export async function updateLastActive(): Promise<void> {
  try {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('tutors')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', user.id)
  } catch {
    // ✅ CURRENT: Fire and forget — never let activity tracking break the UI.
  }
}
