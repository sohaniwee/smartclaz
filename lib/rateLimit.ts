/**
 * Server-side rate limiting using Supabase rate_limits table.
 * ✅ CURRENT: IP-based rate limiting with SHA-256 hashing before storage.
 * 🚀 BEFORE LAUNCH: Ensure rate_limits table is created via migration (see lib/db-migrations.ts).
 * 📝 NOTE: This module is SERVER ONLY — uses SUPABASE_SERVICE_ROLE_KEY.
 *    Never import this in client components or pages rendered on the client.
 *
 * Rate limits enforced:
 *   signup:         5 attempts per IP per hour
 *   otp_send:       5 attempts per identifier (email/phone) per hour
 *   login:          10 attempts per IP per hour
 *   contact_change: 5 change requests per tutor per day
 *
 * Usage in API routes:
 *   const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0'
 *   const { limited, retryAfterSecs } = await checkRateLimit(ip, 'signup')
 *   if (limited) return Response.json({ error: 'Too many requests' }, { status: 429 })
 *   await incrementAttempts(ip, 'signup')
 */

import { createClient } from '@supabase/supabase-js'

// ── Service role client (server only) ─────────────────────────────────────────
// ✅ CURRENT: Creates a Supabase admin client using the service role key.
// 📝 NOTE: SUPABASE_SERVICE_ROLE_KEY must be set in .env.local — never expose to browser.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ── Action limits ──────────────────────────────────────────────────────────────
const LIMITS: Record<string, { max: number; windowSecs: number }> = {
  signup:            { max: 5,  windowSecs: 3600 },  // 5 signups per IP per hour
  otp_send:          { max: 5,  windowSecs: 3600 },  // 5 OTPs per identifier per hour
  login:             { max: 10, windowSecs: 3600 },  // 10 login attempts per IP per hour
  // ✅ CURRENT: Max 3 recovery requests per IP (or email) per hour.
  // 📝 NOTE: Used in /api/auth/support-recovery — checked by both IP hash and email hash.
  recovery_request:  { max: 3,  windowSecs: 3600 },  // 3 recovery requests per identifier per hour
  // ✅ CURRENT: Max 5 change-email / change-phone requests per tutor per day.
  // 📝 NOTE: Used in app/api/auth/change-email/start and app/api/auth/change-phone/start,
  //    keyed by tutor.id (not IP) — one tutor abusing their own flow shouldn't
  //    lock out other tutors sharing an IP (e.g. same office/school).
  contact_change:    { max: 5,  windowSecs: 86400 }, // 5 contact-change requests per tutor per day
}

// ── Hash identifier ────────────────────────────────────────────────────────────
// ✅ CURRENT: SHA-256 hash of the identifier before storing in DB.
// 📝 NOTE: We never store raw IPs or emails — only their SHA-256 hex digest.
async function hashIdentifier(identifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(identifier)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── checkRateLimit ─────────────────────────────────────────────────────────────

/**
 * Check whether the given identifier has exceeded the rate limit for the action.
 *
 * @param identifier - IP address, email/phone, or tutor id to rate limit
 * @param action     - One of 'signup' | 'otp_send' | 'login' | 'recovery_request' | 'contact_change'
 * @returns { limited: boolean; retryAfterSecs: number }
 */
export async function checkRateLimit(
  identifier: string,
  action: 'signup' | 'otp_send' | 'login' | 'recovery_request' | 'contact_change',
): Promise<{ limited: boolean; retryAfterSecs: number }> {
  try {
    const limit = LIMITS[action]
    const hashed = await hashIdentifier(identifier)
    const supabase = getServiceClient()

    const windowStart = new Date(Date.now() - limit.windowSecs * 1000).toISOString()

    const { data, error } = await supabase
      .from('rate_limits')
      .select('attempts, window_start')
      .eq('identifier_hash', hashed)
      .eq('action', action)
      .single()

    if (error || !data) {
      // No record — not rate limited
      return { limited: false, retryAfterSecs: 0 }
    }

    // Reset if window has expired
    if (data.window_start < windowStart) {
      return { limited: false, retryAfterSecs: 0 }
    }

    if (data.attempts >= limit.max) {
      const windowStartMs = new Date(data.window_start).getTime()
      const windowEndMs = windowStartMs + limit.windowSecs * 1000
      const retryAfterSecs = Math.max(0, Math.ceil((windowEndMs - Date.now()) / 1000))
      return { limited: true, retryAfterSecs }
    }

    return { limited: false, retryAfterSecs: 0 }
  } catch {
    // ✅ CURRENT: Fail open on DB errors — never block users due to rate limit table issues.
    // 🚀 BEFORE LAUNCH: Add monitoring alert when this catch fires repeatedly.
    return { limited: false, retryAfterSecs: 0 }
  }
}

// ── incrementAttempts ─────────────────────────────────────────────────────────

/**
 * Increment the attempt count for a given identifier + action.
 * Call this AFTER checkRateLimit passes (i.e., when allowing the action through).
 * Fire and forget — never await from critical path.
 *
 * @param identifier - IP address, email/phone, or tutor id
 * @param action     - One of 'signup' | 'otp_send' | 'login' | 'recovery_request' | 'contact_change'
 */
export async function incrementAttempts(
  identifier: string,
  action: 'signup' | 'otp_send' | 'login' | 'recovery_request' | 'contact_change',
): Promise<void> {
  try {
    const limit = LIMITS[action]
    const hashed = await hashIdentifier(identifier)
    const supabase = getServiceClient()
    const now = new Date().toISOString()
    const windowStart = new Date(Date.now() - limit.windowSecs * 1000).toISOString()

    // Check if existing record is within current window
    const { data: existing } = await supabase
      .from('rate_limits')
      .select('id, attempts, window_start')
      .eq('identifier_hash', hashed)
      .eq('action', action)
      .single()

    if (!existing || existing.window_start < windowStart) {
      // Insert fresh record or upsert with reset window
      await supabase
        .from('rate_limits')
        .upsert({
          identifier_hash: hashed,
          action,
          attempts:        1,
          window_start:    now,
          updated_at:      now,
        }, { onConflict: 'identifier_hash,action' })
    } else {
      // Increment existing record
      await supabase
        .from('rate_limits')
        .update({
          attempts:   existing.attempts + 1,
          updated_at: now,
        })
        .eq('identifier_hash', hashed)
        .eq('action', action)
    }
  } catch {
    // ✅ CURRENT: Fire and forget — never let rate limit tracking break the main flow.
  }
}
