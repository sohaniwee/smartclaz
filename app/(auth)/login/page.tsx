'use client'

// ✅ CURRENT: Phone OTP (SMS via Twilio) as primary login method.
//    Email OTP available as fallback via "Use email instead" link.
// 🚀 BEFORE LAUNCH: Ensure Supabase → Auth → Providers → Phone is enabled with Twilio.

import { useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Turnstile } from '@marsidev/react-turnstile'
import {
  sendEmailOTP,
  verifyEmailOTP,
  sendPhoneOTP,
  verifyPhoneOTP,
  isRateLimited,
  recordAttempt,
  isLockedOut,
  recordWrongAttempt,
  recordSuccessfulVerify,
} from '@/lib/auth'
import { maskEmail } from '@/lib/mask'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { findCountry, DEFAULT_COUNTRY } from '@/lib/countries'

// ── Phone helpers ─────────────────────────────────────────────────────────────

function formatPhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('0') ? digits.slice(1) : digits
}

function maskPhone(dialCode: string, digits: string): string {
  if (!digits || digits.length < 4) return `${dialCode} ••••••••`
  const visible = digits.slice(-4)
  const masked = '•'.repeat(Math.max(0, digits.length - 4))
  return `${dialCode} ${masked}${visible}`
}

// ── Inner component ──────────────────────────────────────────────────────────

function LoginInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') || '/dashboard'
  const hint         = searchParams.get('hint')
  const reason       = searchParams.get('reason')

  // 'phone' is the primary method; 'email' is fallback
  const [method,  setMethod ] = useState<'phone' | 'email'>('phone')
  const [step,    setStep   ] = useState<'input' | 'otp'>('input')

  // Phone fields
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY.code)
  const [phoneDigits,  setPhoneDigits ] = useState('')
  const [phoneError,   setPhoneError  ] = useState('')

  // Email fields
  const [email,      setEmail     ] = useState('')
  const [emailError, setEmailError] = useState('')

  // OTP fields
  const [digits,  setDigits ] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState('')

  // Resend countdown — 30 seconds
  const [resendSecs, setResendSecs] = useState(0)

  // OTP expiry countdown — 10 minutes
  const [otpExpirySecs, setOtpExpirySecs] = useState(600)

  // Lockout countdown
  const [lockoutSecs, setLockoutSecs] = useState(0)

  // CAPTCHA after 3 failed OTP attempts
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [captchaToken,   setCaptchaToken  ] = useState<string | null>(null)

  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Derive the identifier used for rate-limiting and masking
  const country    = findCountry(phoneCountry)
  const fullPhone  = `${country.dialCode}${phoneDigits}`
  const identifier = method === 'phone' ? fullPhone : email.trim()

  useEffect(() => {
    if (resendSecs <= 0) return
    const t = setTimeout(() => setResendSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendSecs])

  useEffect(() => {
    if (step !== 'otp') return
    if (otpExpirySecs <= 0) return
    const t = setTimeout(() => setOtpExpirySecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [step, otpExpirySecs])

  useEffect(() => {
    if (lockoutSecs <= 0) return
    const t = setTimeout(() => setLockoutSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [lockoutSecs])

  // After lockout expires, clear boxes and prompt fresh OTP
  useEffect(() => {
    if (lockoutSecs !== 1) return
    setDigits(['', '', '', '', '', ''])
    setError('')
    setFailedAttempts(0)
    setCaptchaToken(null)
  }, [lockoutSecs])

  // Sync lockout when OTP step loads
  useEffect(() => {
    if (step !== 'otp') return
    const status = isLockedOut(identifier)
    if (status.locked) setLockoutSecs(status.remainingSecs)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ── Validation ────────────────────────────────────────────────────────

  function validateInput(): boolean {
    if (method === 'phone') {
      if (!phoneDigits) { setPhoneError('Please enter your mobile number.'); return false }
      if (country.code === 'LK' && !/^7[0-9]{8}$/.test(phoneDigits)) {
        setPhoneError('Please enter a valid Sri Lanka mobile number (e.g. 77 123 4567).')
        return false
      }
      if (country.code !== 'LK' && (phoneDigits.length < 7 || phoneDigits.length > country.maxLength)) {
        setPhoneError(`Please enter a valid ${country.name} mobile number.`)
        return false
      }
      setPhoneError('')
      return true
    } else {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setEmailError('Please enter a valid email address.')
        return false
      }
      setEmailError('')
      return true
    }
  }

  // ── Send OTP ──────────────────────────────────────────────────────────

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!validateInput()) return

    if (isRateLimited(identifier)) {
      if (method === 'phone') setPhoneError('Too many requests. Please wait before trying again.')
      else setEmailError('Too many requests. Please wait before trying again.')
      return
    }

    setLoading(true)
    setError('')

    // Check the actual tutors table first, not just Supabase Auth existence.
    // An earlier abandoned signup attempt can leave a Supabase Auth user with
    // no tutors row behind — sendEmailOTP/sendPhoneOTP's shouldCreateUser:false
    // check alone would find that leftover Auth user and let the OTP through,
    // even though there's no real account to log into.
    try {
      const checkRes = await fetch('/api/auth/check-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'phone' ? { phone: fullPhone } : { email: email.trim() }),
      })
      const checkData = await checkRes.json()
      if (checkRes.ok && checkData.exists === false) {
        setLoading(false)
        setError(`No account found with this ${method === 'phone' ? 'phone number' : 'email'}. Please sign up first.`)
        return
      }
      if (!checkRes.ok && checkRes.status === 429) {
        setLoading(false)
        setError(checkData.error ?? 'Too many requests. Please wait before trying again.')
        return
      }
      // Any other check failure (network error, 5xx) — fail open and let
      // sendEmailOTP/sendPhoneOTP's own existence check catch it downstream.
    } catch {
      // Network error reaching check-account — fail open, same reasoning.
    }

    const result = method === 'phone'
      ? await sendPhoneOTP(fullPhone)
      : await sendEmailOTP(email.trim(), false)

    if (!result.success) {
      setLoading(false)
      setError(result.error)
      return
    }

    recordAttempt(identifier)
    setLoading(false)
    setResendSecs(30)
    setOtpExpirySecs(600)
    setStep('otp')
    setTimeout(() => otpRefs.current[0]?.focus(), 50)
  }

  // ── Resend ────────────────────────────────────────────────────────────

  async function handleResend() {
    if (resendSecs > 0 || lockoutSecs > 0) return

    if (isRateLimited(identifier)) {
      setError('Too many requests. Please wait before trying again.')
      return
    }

    setLoading(true)
    setError('')

    const result = method === 'phone'
      ? await sendPhoneOTP(fullPhone)
      : await sendEmailOTP(email.trim(), false)

    if (!result.success) {
      setError(result.error)
    } else {
      recordAttempt(identifier)
      setResendSecs(30)
      setOtpExpirySecs(600)
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    }

    setLoading(false)
  }

  // ── Verify OTP ────────────────────────────────────────────────────────

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const otp = digits.join('')
    if (otp.length < 6) return

    if (otpExpirySecs <= 0) {
      setError('OTP expired — please request a new one.')
      return
    }

    const lockStatus = isLockedOut(identifier)
    if (lockStatus.locked) {
      setLockoutSecs(lockStatus.remainingSecs)
      setError(`Too many attempts. Try again in ${formatTime(lockStatus.remainingSecs)}`)
      return
    }

    setLoading(true)
    setError('')

    const result = method === 'phone'
      ? await verifyPhoneOTP(fullPhone, otp)
      : await verifyEmailOTP(email.trim(), otp)

    if (!result.success) {
      const record = recordWrongAttempt(identifier)
      const newFailed = failedAttempts + 1
      setFailedAttempts(newFailed)
      if (newFailed >= 3) setCaptchaToken(null)

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

    recordSuccessfulVerify(identifier)
    setLoading(false)
    router.push(next)
  }

  // ── OTP input handlers ────────────────────────────────────────────────

  function handleDigitChange(i: number, val: string) {
    if (!/^\d?$/.test(val)) return
    const updated = [...digits]
    updated[i] = val
    setDigits(updated)
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

  function handleBack() {
    setStep('input')
    setDigits(['', '', '', '', '', ''])
    setError('')
    setPhoneError('')
    setEmailError('')
    setFailedAttempts(0)
    setCaptchaToken(null)
  }

  function handleSwitchMethod(m: 'phone' | 'email') {
    setMethod(m)
    setStep('input')
    setError('')
    setPhoneError('')
    setEmailError('')
    setPhoneDigits('')
    setEmail('')
    setDigits(['', '', '', '', '', ''])
    setFailedAttempts(0)
    setCaptchaToken(null)
  }

  const otpComplete   = digits.every(d => d !== '')
  const otpExpired    = otpExpirySecs <= 0
  const isLocked      = lockoutSecs > 0
  const captchaNeeded = failedAttempts >= 3 && !captchaToken
  const verifyBlocked = isLocked || otpExpired

  // ── Masked display for OTP step header ────────────────────────────────

  const maskedIdentifier = method === 'phone'
    ? maskPhone(country.dialCode, phoneDigits)
    : maskEmail(email)

  const otpDestination = method === 'phone' ? 'SMS' : 'email'

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-sm">
      <div
        className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8"
        style={{ borderTop: '3px solid #3b5bdb' }}
      >

        {step === 'input' ? (
          <>
            <div className="mb-7">
              <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
                Welcome back
              </h1>
              <p className="text-[#6c757d] text-sm leading-relaxed">
                Sign in to your Smartclaz account.
              </p>
            </div>

            {/* Existing account hint */}
            {hint === 'existing' && (
              <div className="mb-5 bg-[#edf2ff] border border-[#dbe4ff] rounded-[10px] px-4 py-3">
                <p className="text-[#3b5bdb] text-xs font-semibold">
                  Looks like you already have an account. Sign in below.
                </p>
              </div>
            )}

            {/* Suspended account warning */}
            {reason === 'suspended' && (
              <div className="mb-5 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                <p className="text-[#c92a2a] text-xs font-semibold">
                  Your account has been suspended. Please contact{' '}
                  <a href="mailto:support@smartclaz.com" className="underline">support@smartclaz.com</a>.
                </p>
              </div>
            )}

            <form onSubmit={handleSendOtp} className="space-y-4" noValidate>

              {method === 'phone' ? (
                /* ── Phone method ─────────────────────────────────── */
                <div>
                  <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                    Mobile number
                  </label>
                  <div className="flex gap-2">
                    <CountryDialSelect
                      value={phoneCountry}
                      onChange={code => {
                        setPhoneCountry(code)
                        setPhoneDigits('')
                        setPhoneError('')
                      }}
                      hasError={!!phoneError}
                    />
                    <input
                      type="tel"
                      placeholder={phoneCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                      value={phoneDigits}
                      onChange={e => {
                        setPhoneDigits(formatPhoneDigits(e.target.value))
                        setPhoneError('')
                        setError('')
                      }}
                      autoFocus
                      maxLength={findCountry(phoneCountry).maxLength}
                      className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                        phoneError
                          ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                          : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                      }`}
                    />
                  </div>
                  {phoneError && <p className="mt-1.5 text-[#c92a2a] text-xs">{phoneError}</p>}
                </div>
              ) : (
                /* ── Email method ─────────────────────────────────── */
                <div>
                  <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    placeholder="kamal@example.com"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value)
                      setEmailError('')
                      setError('')
                    }}
                    autoFocus
                    className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                      emailError
                        ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                        : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                    }`}
                  />
                  {emailError && <p className="mt-1.5 text-[#c92a2a] text-xs">{emailError}</p>}
                </div>
              )}

              {error && (
                <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                  <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Sending…
                  </span>
                ) : method === 'phone' ? 'Send SMS code' : 'Send verification code'}
              </button>
            </form>

            {/* Method toggle */}
            <div className="mt-5 text-center">
              {method === 'phone' ? (
                <button
                  type="button"
                  onClick={() => handleSwitchMethod('email')}
                  className="text-[#3b5bdb] text-xs font-semibold hover:underline"
                >
                  Use email instead
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSwitchMethod('phone')}
                  className="text-[#3b5bdb] text-xs font-semibold hover:underline"
                >
                  Use mobile number instead
                </button>
              )}
            </div>

            <p className="mt-5 text-center text-xs text-[#6c757d]">
              New here?{' '}
              <Link href="/signup" className="text-[#3b5bdb] font-semibold hover:underline">
                Start your free trial
              </Link>
            </p>

            <div className="mt-5 pt-5 border-t border-[#f1f3f5]">
              <p className="text-center text-xs text-[#adb5bd]">
                Having trouble?{' '}
                <a
                  href="mailto:support@smartclaz.com"
                  className="text-[#3b5bdb] font-semibold hover:underline"
                >
                  support@smartclaz.com
                </a>
              </p>
            </div>
          </>
        ) : (
          /* ── OTP step ─────────────────────────────────────────────── */
          <>
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1 text-[#6c757d] hover:text-[#1a1a2e] text-sm mb-7 transition-colors"
            >
              &larr; Back
            </button>

            <div className="mb-7">
              <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
                {method === 'phone' ? 'Check your SMS' : 'Check your email'}
              </h1>
              <p className="text-[#6c757d] text-sm leading-relaxed">
                We sent a 6-digit code via {otpDestination} to{' '}
                <span className="font-semibold text-[#1a1a2e]">{maskedIdentifier}</span>
              </p>
              {method === 'email' && (
                <p className="text-[0.7rem] text-[#adb5bd] mt-1">
                  Check your spam folder if it doesn&apos;t arrive.
                </p>
              )}
            </div>

            <form onSubmit={handleVerify} className="space-y-5">
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
                  <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3 text-left">
                    <p className="text-[#c92a2a] text-xs font-semibold">
                      Too many attempts. Your code has been invalidated.
                    </p>
                    <p className="text-[#c92a2a] text-xs mt-1">
                      Request a new code after{' '}
                      <span className="font-bold">{formatTime(lockoutSecs)}</span>
                    </p>
                  </div>
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

              {/* CAPTCHA after 3 failed OTP attempts */}
              {failedAttempts >= 3 && !isLocked && (
                <div className="mt-2">
                  <p className="text-[0.72rem] text-[#e67700] font-semibold mb-2">
                    Please complete the security check to continue.
                  </p>
                  <Turnstile
                    siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => setCaptchaToken(null)}
                    options={{ theme: 'light' }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !otpComplete || verifyBlocked || captchaNeeded}
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
                ) : 'Sign in'}
              </button>

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

// ── Page export (Suspense boundary required for useSearchParams) ──────────────

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm flex items-center justify-center py-20">
        <svg className="animate-spin w-6 h-6 text-[#3b5bdb]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    }>
      <LoginInner />
    </Suspense>
  )
}
