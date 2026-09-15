// ✅ CURRENT: Checks whether a tutors row exists for the given email or phone,
//    BEFORE the login page sends any OTP.
// 📝 NOTE: This exists because Supabase Auth "account existence" and "has a
//    real tutor profile" are two different things. sendEmailOTP/sendPhoneOTP
//    (lib/auth.ts) call signInWithOtp({ shouldCreateUser: false }), which only
//    checks Supabase Auth — but an earlier incomplete signup attempt (OTP sent
//    then abandoned) can leave a Supabase Auth user with NO tutors row behind.
//    Auth then correctly finds "an account" and lets the OTP through, even
//    though the tutor never actually finished creating a real profile — so the
//    login page needs its own check against the tutors table, which is the
//    actual source of truth for "does this person have a Smartclaz account".
// 📝 NOTE: Public route (no session yet — this runs before login). Rate
//    limited per identifier to prevent using it as an email/phone enumeration
//    oracle at scale; a determined attacker can still learn existence one at
//    a time (same as the OTP-send error already does), which is an accepted
//    tradeoff for a login flow — see login/recover for the enumeration-safe
//    account-recovery flow, where this tradeoff is NOT acceptable.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, incrementAttempts } from '@/lib/rateLimit'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function POST(req: NextRequest) {
  let email: string | undefined
  let phone: string | undefined
  try {
    const body = await req.json()
    email = typeof body.email === 'string' ? body.email.trim() : undefined
    phone = typeof body.phone === 'string' ? body.phone.trim() : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!email && !phone) {
    return NextResponse.json({ error: 'email or phone is required' }, { status: 400 })
  }

  const identifier = email ?? phone!
  const { limited, retryAfterSecs } = await checkRateLimit(identifier, 'otp_send')
  if (limited) {
    return NextResponse.json(
      { error: `Too many requests. Please try again in ${Math.ceil(retryAfterSecs / 60)} minute(s).` },
      { status: 429 },
    )
  }
  await incrementAttempts(identifier, 'otp_send')

  const supabase = getServiceSupabase()
  const query = supabase.from('tutors').select('id').limit(1)
  const { data, error } = email
    ? await query.eq('email', email).maybeSingle()
    : await query.eq('phone', phone!).maybeSingle()

  if (error) {
    console.error('[check-account] Failed to query tutors:', error)
    // Fail open on the check itself — worst case, sendEmailOTP/sendPhoneOTP's
    // own shouldCreateUser: false check still catches a genuinely nonexistent
    // account downstream.
    return NextResponse.json({ exists: true })
  }

  return NextResponse.json({ exists: !!data })
}
