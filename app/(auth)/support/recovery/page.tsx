'use client'

// ✅ CURRENT: Support-assisted recovery for tutors who lost access to both email and phone.
// 📝 NOTE: Support team manually verifies identity using audit_logs and tutors table.
//    See Recovery C in auth flowchart for full admin process.
// 🚀 BEFORE LAUNCH: Add admin dashboard to manage support_requests instead of manual Supabase access.

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, LifeBuoy } from 'lucide-react'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { findCountry, DEFAULT_COUNTRY } from '@/lib/countries'
import { maskEmail } from '@/lib/mask'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip non-digits, remove leading zero (local format). */
function formatPhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('0') ? digits.slice(1) : digits
}

/** Build full international number from dial code + local digits. */
function buildFullPhone(countryCode: string, digits: string): string {
  if (!digits) return ''
  const country = findCountry(countryCode)
  return `${country.dialCode}${digits}`
}

/** Validate local digits for a country. Returns error string or null. */
function validatePhoneDigits(digits: string, countryCode: string): string | null {
  if (!digits) return null // optional fields
  const country = findCountry(countryCode)
  if (countryCode === 'LK') {
    if (!/^7[0-9]{8}$/.test(digits)) {
      return 'Enter a valid Sri Lanka mobile number (e.g. 77 123 4567).'
    }
    return null
  }
  if (digits.length < 7 || digits.length > country.maxLength) {
    return `Enter a valid ${country.name} mobile number.`
  }
  return null
}

// ── Months / Years ────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 2023 }, (_, i) => String(CURRENT_YEAR - i))

// ── Shared input className ─────────────────────────────────────────────────────

function inputCls(hasError: boolean): string {
  return `w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
    hasError
      ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
      : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
  }`
}

const selectCls = inputCls(false)

// ── RecoveryPage ───────────────────────────────────────────────────────────────

export default function RecoveryPage() {
  // ── Form fields ──────────────────────────────────────────────────────────────
  const [oldEmail,         setOldEmail        ] = useState('')
  const [oldPhoneDigits,   setOldPhoneDigits  ] = useState('')
  const [oldPhoneCountry,  setOldPhoneCountry ] = useState(DEFAULT_COUNTRY.code)

  const [newEmail,         setNewEmail        ] = useState('')
  const [newPhoneDigits,   setNewPhoneDigits  ] = useState('')
  const [newPhoneCountry,  setNewPhoneCountry ] = useState(DEFAULT_COUNTRY.code)

  const [fullName,         setFullName        ] = useState('')
  const [joinMonth,        setJoinMonth       ] = useState('')
  const [joinYear,         setJoinYear        ] = useState('')
  const [subjects,         setSubjects        ] = useState('')
  const [studentCount,     setStudentCount    ] = useState('')
  const [otherDetails,     setOtherDetails    ] = useState('')

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [loading,      setLoading     ] = useState(false)
  const [submitted,    setSubmitted   ] = useState(false)
  const [error,        setError       ] = useState('')
  const [fieldErrors,  setFieldErrors ] = useState<Record<string, string>>({})
  const [rateLimited,  setRateLimited ] = useState(false)
  const [retryMins,    setRetryMins   ] = useState(0)

  // Track new email for success state masking
  const [submittedNewEmail, setSubmittedNewEmail] = useState('')

  // ── Validation ────────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Record<string, string> = {}

    if (!fullName.trim() || fullName.trim().length < 2) {
      errs.fullName = 'Please enter your full name (min 2 characters).'
    }

    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      errs.newEmail = 'Please enter a valid email address.'
    }

    if (!newPhoneDigits.trim()) {
      errs.newPhone = 'Please enter your new phone number.'
    } else {
      const phoneErr = validatePhoneDigits(newPhoneDigits, newPhoneCountry)
      if (phoneErr) errs.newPhone = phoneErr
    }

    // Optional old phone — only validate if filled
    if (oldPhoneDigits.trim()) {
      const oldPhoneErr = validatePhoneDigits(oldPhoneDigits, oldPhoneCountry)
      if (oldPhoneErr) errs.oldPhone = oldPhoneErr
    }

    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!validate()) return

    setLoading(true)
    setError('')
    setRateLimited(false)

    const proofDetails = JSON.stringify({
      join_month:    joinMonth    || null,
      join_year:     joinYear     || null,
      subjects:      subjects     || null,
      student_count: studentCount ? Number(studentCount) : null,
      other_details: otherDetails || null,
    })

    const trimmedNewEmail = newEmail.trim().toLowerCase()

    try {
      const res = await fetch('/api/auth/support-recovery', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          full_name:    fullName.trim(),
          old_email:    oldEmail.trim()   || undefined,
          old_phone:    oldPhoneDigits.trim() ? buildFullPhone(oldPhoneCountry, oldPhoneDigits) : undefined,
          new_email:    trimmedNewEmail,
          new_phone:    buildFullPhone(newPhoneCountry, newPhoneDigits),
          proof_details: proofDetails,
        }),
      })

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        const secs = data.retryAfterSecs ?? 3600
        setRetryMins(Math.ceil(secs / 60))
        setRateLimited(true)
        setLoading(false)
        return
      }

      if (!res.ok) {
        setError('Something went wrong. Please try again or email support@smartclaz.com')
        setLoading(false)
        return
      }

      setSubmittedNewEmail(trimmedNewEmail)
      setLoading(false)
      setSubmitted(true)
    } catch {
      setError('Network error — please check your connection and try again.')
      setLoading(false)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="w-full max-w-lg">
        <div
          className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8"
          style={{ borderTop: '3px solid #3b5bdb' }}
        >
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center mx-auto mb-4">
              <span className="text-[#2f9e44] text-xl font-bold">✓</span>
            </div>
            <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] mb-2">Request received</h2>
            <p className="text-[#6c757d] text-sm leading-relaxed mb-4">
              We&apos;ll verify your identity and contact you at{' '}
              <span className="font-semibold text-[#1a1a2e]">{maskEmail(submittedNewEmail)}</span>{' '}
              within 24 hours.
            </p>
            <div className="bg-[#fff9db] border border-[#ffec99] rounded-[10px] px-4 py-3 text-left">
              <p className="text-[#e67700] text-xs font-semibold">
                Please do not submit multiple requests — this may delay your recovery.
              </p>
            </div>
            <Link
              href="/login"
              className="mt-5 inline-block text-[#3b5bdb] text-sm font-semibold hover:underline"
            >
              ← Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg">
      <div
        className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8"
        style={{ borderTop: '3px solid #3b5bdb' }}
      >
        {/* Back link */}
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-[#6c757d] hover:text-[#1a1a2e] text-sm mb-7 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to login
        </Link>

        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div
            className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: '#edf2ff' }}
          >
            <LifeBuoy size={17} className="text-[#3b5bdb]" />
          </div>
          <div>
            <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1">
              Account recovery
            </h1>
            <p className="text-[#6c757d] text-sm leading-relaxed">
              Having trouble accessing your account?
            </p>
          </div>
        </div>

        {/* Rate limit error */}
        {rateLimited && (
          <div className="mb-5 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
            <p className="text-[#c92a2a] text-xs font-semibold">
              Too many requests. Please try again in {retryMins} minutes or email{' '}
              <a href="mailto:support@smartclaz.com" className="underline">
                support@smartclaz.com
              </a>{' '}
              directly.
            </p>
          </div>
        )}

        {/* Global error */}
        {error && (
          <div className="mb-5 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
            <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Section 1: Account details you can't access ─────────────────── */}
          <p className="text-[0.72rem] font-bold text-[#3b5bdb] uppercase tracking-[0.08em] mb-3">
            Account details you can&apos;t access
          </p>

          <div className="space-y-4">
            {/* Old email */}
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Old email address{' '}
                <span className="text-[#adb5bd] font-normal">(optional)</span>
              </label>
              <input
                type="email"
                placeholder="email@example.com"
                value={oldEmail}
                onChange={e => setOldEmail(e.target.value)}
                className={inputCls(false)}
              />
              <p className="mt-1 text-[#adb5bd] text-xs">
                The email you used to sign up (if you remember it)
              </p>
            </div>

            {/* Old phone */}
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Old phone number{' '}
                <span className="text-[#adb5bd] font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                <CountryDialSelect
                  value={oldPhoneCountry}
                  onChange={code => {
                    setOldPhoneCountry(code)
                    setOldPhoneDigits('')
                    setFieldErrors(p => ({ ...p, oldPhone: undefined as unknown as string }))
                  }}
                  hasError={!!fieldErrors.oldPhone}
                />
                <input
                  type="tel"
                  placeholder={oldPhoneCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                  value={oldPhoneDigits}
                  onChange={e => {
                    setOldPhoneDigits(formatPhoneDigits(e.target.value))
                    setFieldErrors(p => ({ ...p, oldPhone: undefined as unknown as string }))
                  }}
                  maxLength={findCountry(oldPhoneCountry).maxLength}
                  className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                    fieldErrors.oldPhone
                      ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                      : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                  }`}
                />
              </div>
              {fieldErrors.oldPhone ? (
                <p className="mt-1.5 text-[#c92a2a] text-xs">{fieldErrors.oldPhone}</p>
              ) : (
                <p className="mt-1 text-[#adb5bd] text-xs">
                  Your previous login phone number (if you remember it)
                </p>
              )}
            </div>
          </div>

          {/* ── Section 2: Your new contact details ─────────────────────────── */}
          <div className="border-t border-[#f1f3f5] pt-6 mt-6">
            <p className="text-[0.72rem] font-bold text-[#3b5bdb] uppercase tracking-[0.08em] mb-3">
              Your new contact details
            </p>

            <div className="space-y-4">
              {/* New email */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  New email address <span className="text-[#c92a2a]">*</span>
                </label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={e => {
                    setNewEmail(e.target.value)
                    setFieldErrors(p => ({ ...p, newEmail: undefined as unknown as string }))
                  }}
                  className={inputCls(!!fieldErrors.newEmail)}
                />
                {fieldErrors.newEmail ? (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{fieldErrors.newEmail}</p>
                ) : (
                  <p className="mt-1 text-[#adb5bd] text-xs">
                    We&apos;ll send confirmation and updates here
                  </p>
                )}
              </div>

              {/* New phone */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  New phone number <span className="text-[#c92a2a]">*</span>
                </label>
                <div className="flex gap-2">
                  <CountryDialSelect
                    value={newPhoneCountry}
                    onChange={code => {
                      setNewPhoneCountry(code)
                      setNewPhoneDigits('')
                      setFieldErrors(p => ({ ...p, newPhone: undefined as unknown as string }))
                    }}
                    hasError={!!fieldErrors.newPhone}
                  />
                  <input
                    type="tel"
                    placeholder={newPhoneCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                    value={newPhoneDigits}
                    onChange={e => {
                      setNewPhoneDigits(formatPhoneDigits(e.target.value))
                      setFieldErrors(p => ({ ...p, newPhone: undefined as unknown as string }))
                    }}
                    maxLength={findCountry(newPhoneCountry).maxLength}
                    className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                      fieldErrors.newPhone
                        ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                        : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                    }`}
                  />
                </div>
                {fieldErrors.newPhone ? (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{fieldErrors.newPhone}</p>
                ) : (
                  <p className="mt-1 text-[#adb5bd] text-xs">
                    For your future login once recovered
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 3: Help us verify your identity ──────────────────────── */}
          <div className="border-t border-[#f1f3f5] pt-6 mt-6">
            <p className="text-[0.72rem] font-bold text-[#3b5bdb] uppercase tracking-[0.08em] mb-3">
              Help us verify your identity
            </p>

            <div className="space-y-4">
              {/* Full name */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Full name <span className="text-[#c92a2a]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Kamal Perera"
                  value={fullName}
                  onChange={e => {
                    setFullName(e.target.value)
                    setFieldErrors(p => ({ ...p, fullName: undefined as unknown as string }))
                  }}
                  autoFocus
                  className={inputCls(!!fieldErrors.fullName)}
                />
                {fieldErrors.fullName && (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{fieldErrors.fullName}</p>
                )}
              </div>

              {/* Approximate join date */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Approximately when did you join Smartclaz?{' '}
                  <span className="text-[#adb5bd] font-normal">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={joinMonth}
                    onChange={e => setJoinMonth(e.target.value)}
                    className={`w-36 ${selectCls}`}
                  >
                    <option value="">Month</option>
                    {MONTHS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={joinYear}
                    onChange={e => setJoinYear(e.target.value)}
                    className={`flex-1 ${selectCls}`}
                  >
                    <option value="">Year</option>
                    {YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-[#adb5bd] text-xs">Approximate is fine</p>
              </div>

              {/* Subjects */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  What subjects do you teach?{' '}
                  <span className="text-[#adb5bd] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mathematics, Physics, A/L Chemistry"
                  value={subjects}
                  onChange={e => setSubjects(e.target.value)}
                  className={inputCls(false)}
                />
                <p className="mt-1 text-[#adb5bd] text-xs">Helps us find your account</p>
              </div>

              {/* Student count */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Approximately how many students do you have?{' '}
                  <span className="text-[#adb5bd] font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  placeholder="e.g. 15"
                  value={studentCount}
                  onChange={e => setStudentCount(e.target.value)}
                  className={inputCls(false)}
                />
              </div>

              {/* Other details */}
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Any other details to help us verify{' '}
                  <span className="text-[#adb5bd] font-normal">(optional)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Student names, payment references, when you last logged in, your WhatsApp number used for the bot..."
                  value={otherDetails}
                  onChange={e => setOtherDetails(e.target.value)}
                  className={`w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] resize-none`}
                />
                <p className="mt-1 text-[#adb5bd] text-xs">
                  The more detail you provide, the faster we can verify you
                </p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="mt-6">
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
              ) : 'Send recovery request'}
            </button>
          </div>

        </form>

        {/* Footer note */}
        <p className="mt-5 text-center text-xs text-[#adb5bd]">
          Urgent?{' '}
          <a
            href="mailto:support@smartclaz.com"
            className="text-[#3b5bdb] font-semibold hover:underline"
          >
            Email us directly
          </a>
        </p>
      </div>
    </div>
  )
}
