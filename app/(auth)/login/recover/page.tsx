'use client'

// Account recovery page.
// Uses sendEmailOTP (same as login/signup) — enumeration-safe response always.
// Shows: "If we have an account for that email, we'll send sign-in instructions."
//
// TODO BEFORE LAUNCH: Add phone recovery option
// TODO BEFORE LAUNCH: Add "I changed my phone number" flow
// TODO BEFORE LAUNCH: Send security notification email on phone number change

import { useState } from 'react'
import Link from 'next/link'
import { sendEmailOTP, isRateLimited, recordAttempt, ENUMERATION_SAFE_MSG } from '@/lib/auth'

export default function RecoverPage() {
  const [email,    setEmail   ] = useState('')
  const [loading,  setLoading ] = useState(false)
  const [sent,     setSent    ] = useState(false)
  const [error,    setError   ] = useState('')
  const [emailErr, setEmailErr] = useState('')

  function validateEmail(): boolean {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailErr('Please enter a valid email address.')
      return false
    }
    setEmailErr('')
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateEmail()) return

    if (isRateLimited(email.trim())) {
      // Still show success-like message — enumeration-safe
      setSent(true)
      return
    }

    setLoading(true)
    setError('')

    // sendEmailOTP is enumeration-safe — same success response whether account exists or not
    const result = await sendEmailOTP(email.trim())

    if (!result.success) {
      // Only surface rate-limit errors; everything else shows the safe message
      if (result.error.toLowerCase().includes('maximum') || result.error.toLowerCase().includes('too many')) {
        setError(result.error)
      } else {
        // Enumeration-safe: treat all other errors as success
        setSent(true)
        recordAttempt(email.trim())
        setLoading(false)
        return
      }
    } else {
      recordAttempt(email.trim())
      setSent(true)
    }

    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8" style={{ borderTop: '3px solid #3b5bdb' }}>

        <div className="mb-7">
          <Link
            href="/login"
            className="flex items-center gap-1 text-[#6c757d] hover:text-[#1a1a2e] text-sm mb-5 transition-colors"
          >
            ← Back to sign in
          </Link>
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            Recover your account
          </h1>
          <p className="text-[#6c757d] text-sm leading-relaxed">
            Enter your email address to receive a sign-in link.
          </p>
        </div>

        {sent ? (
          <div className="bg-[#edf2ff] border border-[#dbe4ff] rounded-[12px] px-4 py-4 text-center">
            <p className="text-[#3b5bdb] text-sm font-semibold mb-1">
              Check your email
            </p>
            <p className="text-[#6c757d] text-xs leading-relaxed">
              {ENUMERATION_SAFE_MSG}
            </p>
            <p className="text-[#adb5bd] text-xs mt-3">
              Check your spam folder if it doesn&apos;t arrive within a few minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
                  setEmailErr('')
                  setError('')
                }}
                required
                autoFocus
                className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                  emailErr
                    ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                    : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                }`}
              />
              {emailErr && (
                <p className="mt-1.5 text-[#c92a2a] text-xs">{emailErr}</p>
              )}
            </div>

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
              ) : 'Send recovery link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
