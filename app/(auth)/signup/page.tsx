'use client'

// ✅ CURRENT: Email OTP via Supabase built-in email service.
//    Free — no Resend or Twilio needed in development.
//    Supabase handles sending the 6-digit code to the tutor's email.
// 🚀 BEFORE LAUNCH: Switch to phone OTP via Twilio SMS.
//    Email stays as recovery fallback.
// 📝 NOTE: Supabase email OTP config required:
//    Authentication → Providers → Email → Enable: ON
//    Authentication → URL Configuration → Site URL: http://localhost:3000

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import {
  sendEmailOTP,
  verifyEmailOTP,
  isRateLimited,
  recordAttempt,
  isSignupRateLimited,
  recordSignupAttempt,
  isLockedOut,
  recordWrongAttempt,
  recordSuccessfulVerify,
} from '@/lib/auth'
import { maskEmail } from '@/lib/mask'
import { createClient } from '@/lib/supabase/client'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { findCountry, DEFAULT_COUNTRY } from '@/lib/countries'
import type { Country } from '@/lib/countries'

// ── Step progress indicator ─────────────────────────────────────────────────

function StepProgress({ current }: { current: number }) {
  const steps = ['Profile', 'Classes', 'Payments', 'Preferences']
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const n      = i + 1
        const done   = n < current
        const active = n === current
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done    ? 'bg-[#3b5bdb] text-white'
                : active  ? 'bg-[#3b5bdb] text-white ring-4 ring-[#edf2ff]'
                :           'bg-[#f1f3f5] text-[#adb5bd]'
                }`}
              >
                {done ? '✓' : n}
              </div>
              <span
                className={`text-[0.58rem] font-bold font-mono uppercase tracking-wide ${
                  active || done ? 'text-[#3b5bdb]' : 'text-[#adb5bd]'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 mb-4 ${done ? 'bg-[#3b5bdb]' : 'bg-[#dee2e6]'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Types ───────────────────────────────────────────────────────────────────

type FieldErrors = {
  name?: string
  email?: string
  phone?: string
}

// ── Phone formatting helpers ────────────────────────────────────────────────

// ✅ CURRENT: Country-aware phone validation.
// 📝 NOTE: For LK (+94) exactly 9 digits required after the dial code.
//    For all other countries: at least 7 digits, max = country.maxLength.

/** Strip non-digits. Remove leading 0 (common local format). */
function formatPhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('0') ? digits.slice(1) : digits
}

/** Full international display (e.g. "+94 771234567") */
function displayPhone(dialCode: string, digits: string): string {
  if (!digits) return ''
  return `${dialCode} ${digits}`
}

/**
 * Validate local phone digits against the selected country.
 * Returns an error string or null if valid.
 */
function validatePhone(digits: string, country: Country): string | null {
  if (!digits) return 'Please enter your phone number.'

  if (country.code === 'LK') {
    if (!/^7[0-9]{8}$/.test(digits)) {
      return 'Please enter a valid Sri Lanka mobile number (e.g. 77 123 4567).'
    }
    return null
  }

  // Other countries: at least 7 digits, max = country.maxLength
  if (digits.length < 7 || digits.length > country.maxLength) {
    return `Please enter a valid ${country.name} mobile number.`
  }
  return null
}

// ── Timer helpers ───────────────────────────────────────────────────────────

/** Format seconds as M:SS */
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const OTP_EXPIRY_SECS = 600  // 10 minutes
// NOTE: Set OTP expiry in Supabase dashboard:
// Authentication → Settings → OTP Expiry = 600 (seconds)

// ── Component ───────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter()

  // Form state
  const [step,         setStep        ] = useState<'details' | 'otp'>('details')
  const [name,         setName        ] = useState('')
  const [email,        setEmail       ] = useState('')
  // ✅ CURRENT: phoneDigits = local number without dial code, no leading 0.
  //    phoneCountry = ISO2 country code (e.g. 'LK', 'GB').
  //    Combined into full E.164 format for DB: dialCode + phoneDigits.
  const [phoneDigits,  setPhoneDigits ] = useState('')   // digits only after dial code
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY.code)

  // OTP state
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const otpRefs      = useRef<(HTMLInputElement | null)[]>([])
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined)

  // Loading / error state
  const [loading,     setLoading    ] = useState(false)
  const [error,       setError      ] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // Resend countdown — 30 seconds between resend attempts
  const [resendSecs, setResendSecs] = useState(0)

  // OTP expiry countdown — 10 minutes from when OTP was sent
  const [otpExpirySecs, setOtpExpirySecs] = useState(OTP_EXPIRY_SECS)
  const otpExpiredRef = useRef(false)

  // Lockout countdown
  const [lockoutSecs, setLockoutSecs] = useState(0)

  // CAPTCHA
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  // ── Resend countdown effect ──────────────────────────────────────────
  useEffect(() => {
    if (resendSecs <= 0) return
    const timer = setTimeout(() => setResendSecs(s => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendSecs])

  // ── OTP expiry countdown effect ──────────────────────────────────────
  useEffect(() => {
    if (step !== 'otp') return
    if (otpExpirySecs <= 0) {
      otpExpiredRef.current = true
      return
    }
    const timer = setTimeout(() => setOtpExpirySecs(s => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [step, otpExpirySecs])

  // ── Lockout countdown effect ─────────────────────────────────────────
  useEffect(() => {
    if (lockoutSecs <= 0) return
    const timer = setTimeout(() => setLockoutSecs(s => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [lockoutSecs])

  // ── Sync lockout state when OTP step loads ───────────────────────────
  useEffect(() => {
    if (step !== 'otp') return
    const status = isLockedOut(email.trim())
    if (status.locked) {
      setLockoutSecs(status.remainingSecs)
      setError(`Too many attempts. Try again in ${formatTime(status.remainingSecs)}`)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ─────────────────────────────────────────────────────

  function validateDetails(): FieldErrors {
    const errs: FieldErrors = {}
    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Please enter your full name (at least 2 characters).'
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please enter a valid email address.'
    }
    // ✅ CURRENT: Validate phone against selected country's rules.
    const country = findCountry(phoneCountry)
    const phoneErr = validatePhone(phoneDigits, country)
    if (phoneErr) errs.phone = phoneErr
    return errs
  }

  // ── Send OTP ───────────────────────────────────────────────────────

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()

    const errs = validateDetails()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    // Device-level signup rate limit
    if (isSignupRateLimited()) {
      setError('Too many attempts from your device. Please try again later.')
      return
    }

    // Verify CAPTCHA
    if (!captchaToken) {
      setError('Please complete the security check.')
      return
    }

    try {
      const captchaRes = await fetch('/api/auth/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: captchaToken }),
      })
      const captchaData = await captchaRes.json()
      if (!captchaData.success) {
        setError('Security check failed. Please try again.')
        setCaptchaToken(null)
        return
      }
    } catch {
      setError('Security check failed. Please try again.')
      setCaptchaToken(null)
      return
    }

    if (isRateLimited(email.trim())) {
      // Enumeration-safe: show same message whether limit hit or not for a new account
      setError('Too many requests. Please wait before trying again.')
      return
    }

    setLoading(true)
    setError('')

    // Check if this email already has a tutor account before sending an OTP.
    // Querying the tutors table (public read via anon key) is safe here —
    // we only check existence, never expose private data.
    // This stops existing users from receiving a signup OTP and gives them
    // a clear "account exists, please log in" message instead.
    {
      const supabase = createClient()
      const { data: existingTutor } = await supabase
        .from('tutors')
        .select('id')
        .eq('email', email.trim())
        .maybeSingle()

      if (existingTutor) {
        setLoading(false)
        setError('An account with this email already exists. Please log in instead.')
        setCaptchaToken(null)
        turnstileRef.current?.reset()
        return
      }
    }

    const result = await sendEmailOTP(email.trim())

    if (!result.success) {
      setLoading(false)
      // accountExists covers: Supabase Auth has the email but tutors table didn't
      // (e.g. incomplete previous signup, or Supabase-level conflict).
      if (result.accountExists) {
        setError('An account with this email already exists. Please log in instead.')
      } else {
        setError(result.error)
      }
      setCaptchaToken(null)
      turnstileRef.current?.reset()
      return
    }

    recordAttempt(email.trim())
    recordSignupAttempt()

    // ✅ CURRENT: Persist form data for after OTP verify.
    // Phone stored as full E.164 international format: dialCode + digits.
    const country = findCountry(phoneCountry)
    localStorage.setItem('sc_signup_name',  name.trim())
    localStorage.setItem('sc_signup_email', email.trim())
    localStorage.setItem('sc_signup_phone', `${country.dialCode}${phoneDigits}`)

    // Reset CAPTCHA token — tokens are single-use, already consumed by verify call above.
    // If the user comes back to details step, they must re-verify the CAPTCHA.
    setCaptchaToken(null)
    turnstileRef.current?.reset()

    setLoading(false)
    setResendSecs(30)       // 30-second resend cooldown
    setOtpExpirySecs(OTP_EXPIRY_SECS)
    otpExpiredRef.current = false
    setStep('otp')
    setTimeout(() => otpRefs.current[0]?.focus(), 50)
  }

  // ── Resend ─────────────────────────────────────────────────────────

  async function handleResend() {
    if (resendSecs > 0) return
    if (lockoutSecs > 0) return

    if (isRateLimited(email.trim())) {
      setError('Maximum OTP requests reached. Please try again later.')
      return
    }

    setLoading(true)
    setError('')

    const result = await sendEmailOTP(email.trim())

    if (!result.success) {
      setError(result.error)
    } else {
      recordAttempt(email.trim())
      setResendSecs(30)
      setOtpExpirySecs(OTP_EXPIRY_SECS)
      otpExpiredRef.current = false
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    }

    setLoading(false)
  }

  // ── Verify OTP ─────────────────────────────────────────────────────

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const token = digits.join('')
    if (token.length < 6) return

    // Check OTP expired
    if (otpExpirySecs <= 0) {
      setError('OTP expired — please request a new one.')
      return
    }

    // Check lockout before calling Supabase
    const lockStatus = isLockedOut(email.trim())
    if (lockStatus.locked) {
      setLockoutSecs(lockStatus.remainingSecs)
      setError(`Too many attempts. Try again in ${formatTime(lockStatus.remainingSecs)}`)
      return
    }

    setLoading(true)
    setError('')

    const result = await verifyEmailOTP(email.trim(), token)

    if (!result.success) {
      const record = recordWrongAttempt(email.trim())

      if (record.lockedUntil) {
        const remainSecs = Math.ceil((record.lockedUntil - Date.now()) / 1000)
        setLockoutSecs(remainSecs)
        setError(`Too many attempts. Try again in ${formatTime(remainSecs)}`)
      } else if (record.wrongAttempts === 4) {
        setError('One attempt remaining before your account is temporarily locked.')
      } else {
        setError(result.error)
      }

      setLoading(false)
      return
    }

    recordSuccessfulVerify(email.trim())

    // Upsert tutor row — RLS: auth.uid() = id
    const storedName  = localStorage.getItem('sc_signup_name')  ?? name.trim()
    const storedEmail = localStorage.getItem('sc_signup_email') ?? email.trim()
    const country     = findCountry(phoneCountry)
    const storedPhone = localStorage.getItem('sc_signup_phone') ?? `${country.dialCode}${phoneDigits}`

    const supabase = createClient()
    const { error: upsertErr } = await supabase
      .from('tutors')
      .upsert({
        id:             result.userId,
        name:           storedName,
        email:          storedEmail,
        phone:          storedPhone,
        status:         'incomplete',
        email_verified: true,   // verified via OTP just now
        phone_verified: false,  // set to true once Twilio SMS OTP is wired up
      })

    if (upsertErr) {
      // Handle unique constraint violation gracefully
      // Supabase returns code '23505' for unique violations
      if (upsertErr.code === '23505') {
        // Email or phone already in tutors table.
        // This means the auth user exists but tutors row has a conflict.
        // Don't expose this — redirect to login with a hint.
        setLoading(false)
        localStorage.removeItem('sc_signup_name')
        localStorage.removeItem('sc_signup_email')
        localStorage.removeItem('sc_signup_phone')
        router.push('/login?hint=existing')
        return
      }
      // Non-fatal — tutor can update profile later
      console.error('[signup] tutors upsert error:', upsertErr.message)
    }

    localStorage.removeItem('sc_signup_name')
    localStorage.removeItem('sc_signup_email')
    localStorage.removeItem('sc_signup_phone')

    setLoading(false)
    router.push('/signup/classes')
  }

  // ── OTP input handlers ─────────────────────────────────────────────

  function handleDigitChange(i: number, val: string) {
    if (!/^\d?$/.test(val)) return
    const next = [...digits]
    next[i] = val
    setDigits(next)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
  }

  function handleDigitKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      otpRefs.current[5]?.focus()
    }
  }

  const otpComplete   = digits.every(d => d !== '')
  const otpExpired    = otpExpirySecs <= 0
  const isLocked      = lockoutSecs > 0
  const verifyBlocked = isLocked || otpExpired

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-md lg:max-w-xl">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8" style={{ borderTop: '3px solid #3b5bdb' }}>
        <div className="lg:hidden"><StepProgress current={1} /></div>

        {step === 'details' ? (
          <>
            <div className="mb-7">
              <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
                Create your account
              </h1>
              <p className="text-[#6c757d] text-[0.84rem] leading-relaxed italic border-l-[3px] border-[#748ffc] pl-3">
                Tell us about yourself to get started.
              </p>
              <p className="text-[0.68rem] text-[#adb5bd] mt-2">
                Fields marked <span className="text-[#c92a2a] font-bold">*</span> are required
              </p>
            </div>

            <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
              {/* Full name */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Full name <span className="text-[#c92a2a]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Kamal Perera"
                  value={name}
                  onChange={e => {
                    setName(e.target.value)
                    setFieldErrors(p => ({ ...p, name: undefined }))
                  }}
                  autoFocus
                  className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                    fieldErrors.name
                      ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                      : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{fieldErrors.name}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Email address <span className="text-[#c92a2a]">*</span>
                </label>
                <input
                  type="email"
                  placeholder="kamal@example.com"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value)
                    setFieldErrors(p => ({ ...p, email: undefined }))
                    setError('')
                  }}
                  className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                    fieldErrors.email
                      ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                      : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                  }`}
                />
                {fieldErrors.email && (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{fieldErrors.email}</p>
                )}
              </div>

              {/* Phone — country code dropdown + number input */}
              {/* ✅ CURRENT: CountryDialSelect allows tutors outside Sri Lanka to sign up. */}
              {/* 📝 NOTE: Default is LK (+94). Dropdown uses flag images from flagcdn.com. */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Mobile number <span className="text-[#c92a2a]">*</span>
                </label>
                <div className="flex gap-2">
                  <CountryDialSelect
                    value={phoneCountry}
                    onChange={code => {
                      setPhoneCountry(code)
                      setPhoneDigits('')
                      setFieldErrors(p => ({ ...p, phone: undefined }))
                    }}
                    hasError={!!fieldErrors.phone}
                  />
                  <input
                    type="tel"
                    placeholder={phoneCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                    value={phoneDigits}
                    onChange={e => {
                      setPhoneDigits(formatPhoneDigits(e.target.value))
                      setFieldErrors(p => ({ ...p, phone: undefined }))
                    }}
                    maxLength={findCountry(phoneCountry).maxLength}
                    className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                      fieldErrors.phone
                        ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                        : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                    }`}
                  />
                </div>
                {phoneDigits && !fieldErrors.phone && (
                  <p className="mt-1 text-[#adb5bd] text-xs">
                    Saved as:{' '}
                    <span className="font-medium text-[#6c757d]">
                      {displayPhone(findCountry(phoneCountry).dialCode, phoneDigits)}
                    </span>
                  </p>
                )}
                {fieldErrors.phone && (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{fieldErrors.phone}</p>
                )}
              </div>

              {error && (
                <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                  <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                  {error.includes('already exists') && (
                    <button
                      type="button"
                      onClick={() => router.push('/login')}
                      className="mt-2 text-[#3b5bdb] text-xs font-semibold hover:underline"
                    >
                      Go to login →
                    </button>
                  )}
                </div>
              )}

              {/* Cloudflare Turnstile CAPTCHA */}
              <Turnstile
                ref={turnstileRef}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                onSuccess={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaToken(null)}
                options={{ theme: 'light' }}
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Sending…
                  </span>
                ) : 'Send OTP to email'}
              </button>
            </form>

            <div className="mt-5 rounded-[10px] bg-[#f8f9fa] border border-[#dee2e6] px-4 py-3 space-y-1">
              <p className="text-[0.72rem] text-[#6c757d] leading-relaxed">
                <span className="font-semibold text-[#343a40]">Your email</span> keeps your account safe and is used for verification.
              </p>
              <p className="text-[0.72rem] text-[#6c757d] leading-relaxed">
                <span className="font-semibold text-[#343a40]">Your phone</span> connects your WhatsApp and will be used for SMS login later.
              </p>
            </div>

            <p className="mt-4 text-center text-xs text-[#6c757d]">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  // Clear any partial signup data before navigating to login
                  localStorage.removeItem('sc_signup_name')
                  localStorage.removeItem('sc_signup_email')
                  localStorage.removeItem('sc_signup_phone')
                  router.push('/login')
                }}
                className="text-[#3b5bdb] font-semibold hover:underline"
              >
                Login
              </button>
            </p>
          </>
        ) : (
          <>
            {/* OTP step */}
            <button
              type="button"
              onClick={() => {
                setStep('details')
                setDigits(['', '', '', '', '', ''])
                setError('')
                // Reset CAPTCHA so the user can re-verify before sending a new OTP.
                // Turnstile tokens are single-use — the old token is already consumed.
                setCaptchaToken(null)
                turnstileRef.current?.reset()
              }}
              className="flex items-center gap-1 text-[#6c757d] hover:text-[#1a1a2e] text-sm mb-7 transition-colors"
            >
              ← Back
            </button>

            <div className="mb-7">
              <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
                Check your email
              </h1>
              <p className="text-[#6c757d] text-sm leading-relaxed">
                We sent a 6-digit code to{' '}
                <span className="font-semibold text-[#1a1a2e]">{maskEmail(email)}</span>
              </p>
              <p className="text-[0.7rem] text-[#adb5bd] mt-1">
                {/* TODO BEFORE LAUNCH: Switch email OTP to phone OTP via Twilio SMS.
                    Phone number is already collected and saved.
                    Only the OTP method needs to change.
                    Supabase: Authentication → Providers → Phone → Twilio */}
                Check your spam folder if it doesn&apos;t arrive.
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-5">
              {/* 6 OTP boxes */}
              <div className="flex gap-2 justify-between" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    autoFocus={i === 0}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleDigitKeyDown(i, e)}
                    disabled={verifyBlocked}
                    className={`w-11 h-12 text-center text-lg font-bold text-[#1a1a2e] border rounded-[10px] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      error
                        ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                        : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                    }`}
                  />
                ))}
              </div>

              {/* OTP expiry / lockout status */}
              <div className="text-center">
                {isLocked ? (
                  <p className="text-[#e67700] text-xs font-semibold">
                    Too many attempts. Try again in{' '}
                    <span className="font-bold text-[#c92a2a]">{formatTime(lockoutSecs)}</span>
                  </p>
                ) : otpExpired ? (
                  <p className="text-[#c92a2a] text-xs font-semibold">
                    OTP expired — please request a new one
                  </p>
                ) : (
                  <p className="text-[#adb5bd] text-xs">
                    OTP expires in{' '}
                    <span className={`font-semibold ${otpExpirySecs < 60 ? 'text-[#e67700]' : 'text-[#6c757d]'}`}>
                      {formatTime(otpExpirySecs)}
                    </span>
                  </p>
                )}
              </div>

              {error && !isLocked && (
                <p className="text-[#c92a2a] text-xs text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !otpComplete || verifyBlocked}
                className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Verifying…
                  </span>
                ) : 'Verify & continue →'}
              </button>

              {/* Resend */}
              <p className="text-center text-xs text-[#6c757d]">
                {isLocked ? (
                  <span className="text-[#adb5bd]">Resend unavailable during lockout</span>
                ) : resendSecs > 0 ? (
                  <>Resend in <span className="font-semibold text-[#1a1a2e]">{resendSecs}s</span></>
                ) : (
                  <>
                    Didn&apos;t receive it?{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading || isLocked}
                      className="text-[#3b5bdb] font-semibold hover:underline disabled:opacity-50"
                    >
                      Resend code
                    </button>
                  </>
                )}
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
