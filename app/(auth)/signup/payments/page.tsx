'use client'

// Step 3 of 4 — payment setup: instructions for students, monthly due date, grace period
// Saves to tutors.payment_instructions, tutors.monthly_due_date, tutors.grace_period_days
// Redirects to /signup/preferences on success

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, CalendarDays, ShieldAlert, Bell } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const DUE_DATES = ['5', '10', '15', '20', '25', '28']

type GracePeriod = '3' | '5' | '7'

const GRACE_OPTIONS: { value: GracePeriod; label: string; sublabel: string }[] = [
  { value: '3', label: '3 days', sublabel: 'Quick — good for strict payment discipline' },
  {
    value: '5',
    label: '5 days (Recommended)',
    sublabel: 'Balanced — allows for bank transfer delays',
  },
  { value: '7', label: '7 days', sublabel: 'Lenient — better for long-term students' },
]

const MAX_INSTRUCTIONS = 500

// ── StepProgress ──────────────────────────────────────────────────────────────

function StepProgress({ current }: { current: number }) {
  const steps = ['Profile', 'Classes', 'Payments', 'Preferences']
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done
                    ? 'bg-[#3b5bdb] text-white'
                    : active
                    ? 'bg-[#3b5bdb] text-white ring-4 ring-[#edf2ff]'
                    : 'bg-[#f1f3f5] text-[#adb5bd]'
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

// ── Skeleton loader ───────────────────────────────────────────────────────────

const SkeletonLoader = () => (
  <div className="w-full max-w-lg lg:max-w-2xl">
    <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="w-7 h-7 rounded-full bg-[#f1f3f5] animate-pulse flex-shrink-0" />
            {i < 4 && <div className="flex-1 h-px mx-2 bg-[#dee2e6]" />}
          </div>
        ))}
      </div>
      <div className="h-7 bg-[#f1f3f5] rounded-[8px] w-1/2 mb-2 animate-pulse" />
      <div className="h-4 bg-[#f1f3f5] rounded-[8px] w-3/4 mb-8 animate-pulse" />
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-[#f1f3f5] rounded-[14px] h-28 mb-4 animate-pulse" />
      ))}
      <div className="h-10 bg-[#f1f3f5] rounded-[10px] animate-pulse mt-6" />
    </div>
  </div>
)

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PaymentsSetupPage() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [dueDate, setDueDate] = useState('5')
  const [gracePeriod, setGracePeriod] = useState<GracePeriod>('5')
  // Default Yes — safer default, less manual work for most tutors
  const [autoNotify, setAutoNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')

  // ── Auth check + load saved data ──────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/signup')
        return
      }
      setUserId(user.id)

      const { data } = await supabase
        .from('tutors')
        .select('payment_instructions, monthly_due_date, grace_period_days, auto_notify_overdue')
        .eq('id', user.id)
        .single()

      if (data) {
        if (data.payment_instructions) setPaymentInstructions(data.payment_instructions)
        if (data.monthly_due_date) setDueDate(String(data.monthly_due_date))
        if (data.grace_period_days) setGracePeriod(String(data.grace_period_days) as GracePeriod)
        if (typeof data.auto_notify_overdue === 'boolean') setAutoNotify(data.auto_notify_overdue)
      }

      setAuthChecked(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!authChecked) return <SkeletonLoader />

  // ── Submit ────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setFieldError('')

    if (!paymentInstructions.trim()) {
      setFieldError('Payment instructions are required')
      return
    }
    if (paymentInstructions.length > MAX_INSTRUCTIONS) {
      setFieldError(`Keep it under ${MAX_INSTRUCTIONS} characters`)
      return
    }

    if (!userId) { router.replace('/signup'); return }

    setSaving(true)

    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('tutors')
      .update({
        payment_instructions: paymentInstructions.trim(),
        monthly_due_date: parseInt(dueDate),
        grace_period_days: parseInt(gracePeriod),
        auto_notify_overdue: autoNotify,
      })
      .eq('id', userId)

    setSaving(false)

    if (updateErr) {
      setError('Could not save. Please try again.')
      return
    }

    router.push('/signup/preferences')
  }

  const charsLeft = MAX_INSTRUCTIONS - paymentInstructions.length
  const instructionsHasError = !!fieldError

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg lg:max-w-2xl pb-10">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
        <div className="lg:hidden"><StepProgress current={3} /></div>

        <div className="mb-7">
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            Payment Setup
          </h1>
          <p className="text-[#6c757d] text-[0.84rem] leading-relaxed italic border-l-[3px] border-[#748ffc] pl-3">
            Tell students how to pay you, and set your monthly billing rules.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>

          {/* ── Section 1: Payment Instructions ── */}
          <div className="border border-[#dee2e6] rounded-[18px] p-5 space-y-3 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText size={15} className="text-white" />
              </div>
              <div>
                <h2 className="text-[0.84rem] font-bold text-[#1a1a2e] tracking-[-0.01em]">
                  Payment Instructions
                </h2>
                <p className="text-[#6c757d] text-xs mt-0.5 leading-relaxed">
                  How should students pay you? This message is sent to every new student after they enroll.
                </p>
              </div>
            </div>

            <div>
              <textarea
                rows={6}
                placeholder={`Bank Transfer: Commercial Bank\nAccount No: 1234567890\nAccount Name: Your Name\n\neZCash: 0771234567\n(Please send a screenshot as proof)`}
                value={paymentInstructions}
                onChange={e => {
                  setPaymentInstructions(e.target.value)
                  if (fieldError) setFieldError('')
                }}
                style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: '0.8rem' }}
                className={`w-full rounded-[10px] px-3 py-[9px] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none leading-relaxed ${
                  instructionsHasError
                    ? 'border border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                    : 'border border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                }`}
              />

              <div className="flex items-start justify-between mt-1.5 gap-3">
                {fieldError ? (
                  <p className="text-[#c92a2a] text-xs flex-1">{fieldError}</p>
                ) : (
                  <p className="text-[#adb5bd] text-xs flex-1">
                    Include your bank details, eZCash number, or cash instructions.
                  </p>
                )}
                <span
                  className={`text-xs font-semibold flex-shrink-0 tabular-nums ${
                    charsLeft < 0
                      ? 'text-[#c92a2a]'
                      : charsLeft < 50
                      ? 'text-[#e67700]'
                      : 'text-[#adb5bd]'
                  }`}
                >
                  {paymentInstructions.length}/{MAX_INSTRUCTIONS}
                </span>
              </div>
            </div>
          </div>

          {/* ── Section 2: Monthly Due Date ── */}
          <div className="border border-[#dee2e6] rounded-[18px] p-5 space-y-3 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 mt-0.5">
                <CalendarDays size={15} className="text-white" />
              </div>
              <div>
                <h2 className="text-[0.84rem] font-bold text-[#1a1a2e] tracking-[-0.01em]">
                  Monthly Payment Due Date
                </h2>
                <p className="text-[#6c757d] text-xs mt-0.5 leading-relaxed">
                  Reminders are sent 3 days before, on the day, and 3 and 7 days after.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {DUE_DATES.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDueDate(d)}
                  className={`px-4 py-2 rounded-full text-sm font-bold border transition-all duration-150 ${
                    dueDate === d
                      ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.25)]'
                      : 'bg-white text-[#343a40] border-[#ced4da] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                  }`}
                >
                  {d}<span className="text-[0.7em]">{ordinalSuffix(d)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Section 3: Grace Period ── */}
          <div className="border border-[#dee2e6] rounded-[18px] p-5 space-y-3 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldAlert size={15} className="text-white" />
              </div>
              <div>
                <h2 className="text-[0.84rem] font-bold text-[#1a1a2e] tracking-[-0.01em]">
                  Grace Period Before Access is Blocked
                </h2>
                <p className="text-[#6c757d] text-xs mt-0.5 leading-relaxed">
                  After this many days overdue, the application stops sending Zoom links to the student.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {GRACE_OPTIONS.map(opt => {
                const isSelected = gracePeriod === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGracePeriod(opt.value)}
                    className={`w-full text-left rounded-[12px] border px-4 py-3 transition-all duration-150 ${
                      isSelected
                        ? 'border-[#3b5bdb] bg-[#edf2ff] shadow-[0_0_0_1px_#3b5bdb]'
                        : 'border-[#dee2e6] bg-white hover:border-[#3b5bdb] hover:bg-[#f8f9ff]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Radio indicator */}
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                          isSelected ? 'border-[#3b5bdb]' : 'border-[#ced4da]'
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full bg-[#3b5bdb]" />
                        )}
                      </div>
                      <div>
                        <p
                          className={`text-sm font-semibold leading-none mb-0.5 ${
                            isSelected ? 'text-[#3b5bdb]' : 'text-[#1a1a2e]'
                          }`}
                        >
                          {opt.label}
                        </p>
                        <p className="text-[#6c757d] text-xs">{opt.sublabel}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Section 4: Payment Reminders (auto-notify consent) ── */}
          <div className="border border-[#dee2e6] rounded-[18px] p-5 space-y-3 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bell size={15} className="text-white" />
              </div>
              <div>
                <h2 className="text-[0.84rem] font-bold text-[#1a1a2e] tracking-[-0.01em]">
                  Payment Reminders
                </h2>
                <p className="text-[#6c757d] text-xs mt-0.5 leading-relaxed">
                  Automatically remind students when payment is due or overdue?
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAutoNotify(true)}
                className={`w-full text-left rounded-[12px] border px-4 py-3 transition-all duration-150 ${
                  autoNotify
                    ? 'border-[#3b5bdb] bg-[#edf2ff] shadow-[0_0_0_1px_#3b5bdb]'
                    : 'border-[#dee2e6] bg-white hover:border-[#3b5bdb] hover:bg-[#f8f9ff]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    autoNotify ? 'border-[#3b5bdb]' : 'border-[#ced4da]'
                  }`}>
                    {autoNotify && <div className="w-2 h-2 rounded-full bg-[#3b5bdb]" />}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold leading-none mb-0.5 ${autoNotify ? 'text-[#3b5bdb]' : 'text-[#1a1a2e]'}`}>
                      Yes, send automatically (Recommended)
                    </p>
                    <p className="text-[#6c757d] text-xs">
                      We&apos;ll message students for you at 3 days before, on the due date, and if payment is overdue.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAutoNotify(false)}
                className={`w-full text-left rounded-[12px] border px-4 py-3 transition-all duration-150 ${
                  !autoNotify
                    ? 'border-[#3b5bdb] bg-[#edf2ff] shadow-[0_0_0_1px_#3b5bdb]'
                    : 'border-[#dee2e6] bg-white hover:border-[#3b5bdb] hover:bg-[#f8f9ff]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    !autoNotify ? 'border-[#3b5bdb]' : 'border-[#ced4da]'
                  }`}>
                    {!autoNotify && <div className="w-2 h-2 rounded-full bg-[#3b5bdb]" />}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold leading-none mb-0.5 ${!autoNotify ? 'text-[#3b5bdb]' : 'text-[#1a1a2e]'}`}>
                      No, just notify me
                    </p>
                    <p className="text-[#6c757d] text-xs">
                      I&apos;ll review and decide when to send each reminder myself.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* ── General error ── */}
          {error && (
            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
              <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => router.push('/signup/classes')}
              className="flex-1 border border-[#dee2e6] text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-150"
            >
              &larr; Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Saving…
                </span>
              ) : (
                'Continue →'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Ordinal helper ────────────────────────────────────────────────────────────

function ordinalSuffix(n: string): string {
  const num = parseInt(n)
  if (num === 1 || num === 21) return 'st'
  if (num === 2 || num === 22) return 'nd'
  if (num === 3 || num === 23) return 'rd'
  return 'th'
}
