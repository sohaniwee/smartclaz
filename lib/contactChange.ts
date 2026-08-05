/**
 * Shared server-side helpers for the dual-channel "Change Email" and
 * "Change Phone" flows (app/api/auth/change-email/* and app/api/auth/change-phone/*).
 *
 * ⚠️ CRITICAL: This module (and every route that uses it) uses SELF-CONTAINED,
 * server-generated 6-digit OTP codes stored in the `contact_change_requests`
 * table. It never calls supabase.auth.signInWithOtp / supabase.auth.verifyOtp
 * (the primitives behind lib/auth.ts's sendEmailOTP/verifyEmailOTP/
 * sendPhoneOTP/verifyPhoneOTP). Those are LOGIN primitives — verifyOtp()
 * switches the browser's active session to whichever Supabase Auth user owns
 * the email/phone being verified, and signInWithOtp(shouldCreateUser: true)
 * silently creates a new ghost auth user for not-yet-registered emails. Using
 * them for a contact-change flow would risk hijacking the tutor's own session
 * mid-flow. Do NOT import those four functions here or in any change-email /
 * change-phone route — see CLAUDE.md task notes for the full writeup.
 *
 * This module is SERVER ONLY — it reads SUPABASE_SERVICE_ROLE_KEY.
 * Never import it in client components.
 */

import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// ── Service-role Supabase client (bypasses RLS) ───────────────────────────────

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Authenticated tutor lookup ────────────────────────────────────────────────

/**
 * Reads the session cookie via the anon/SSR client (same pattern as the
 * existing app/api/auth/change-email/route.ts) and returns the Supabase Auth
 * user, or null if unauthenticated. Never establishes or switches a session —
 * only reads the one already present in cookies.
 */
export async function getAuthedUser(): Promise<{ id: string; email: string | null } | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return { id: user.id, email: user.email ?? null }
}

// ── OTP generation ─────────────────────────────────────────────────────────────

/** Generates a self-contained 6-digit numeric OTP code (never a Supabase Auth OTP). */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// ── IP hashing (matches lib/rateLimit.ts convention) ──────────────────────────

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Extracts the client IP from request headers and SHA-256 hashes it. Never store raw IPs. */
export async function hashedIpFrom(req: NextRequest): Promise<string> {
  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'
  return sha256(rawIp)
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Max wrong OTP attempts before a request must be restarted. */
export const OTP_MAX_ATTEMPTS = 5

/** Sri Lankan mobile number format: +947XXXXXXXX or 07XXXXXXXX */
export const SL_PHONE_REGEX = /^(\+94|0)7[0-9]{8}$/

/** Basic email format check — matches the regex already used across this repo's auth routes. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Normalizes a Sri Lankan phone number to +94 E.164 format. */
export function normalizeSlPhone(phone: string): string {
  const trimmed = phone.trim()
  if (trimmed.startsWith('+94')) return trimmed
  if (trimmed.startsWith('0')) return `+94${trimmed.slice(1)}`
  return trimmed
}

// ── Expiry / attempt-limit check shared by every verify-* route ──────────────

export type OtpStageCheck =
  | { ok: true }
  | { ok: false; status: number; error: string }

/**
 * Shared validation for the verify-old / verify-new steps: confirms the
 * request hasn't expired and hasn't exceeded the max wrong-attempt count.
 * Does NOT compare the OTP itself — callers do that afterwards.
 */
export function checkOtpStage(
  expiresAt: string,
  attempts: number,
): OtpStageCheck {
  if (new Date(expiresAt).getTime() < Date.now()) {
    return { ok: false, status: 400, error: 'This code has expired. Please start again.' }
  }
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: 'Too many incorrect attempts. Please start again.' }
  }
  return { ok: true }
}
