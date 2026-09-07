'use client'

// ✅ CURRENT: Settings page — all sections: Profile, Subjects & Fees, Availability,
//    Session Settings, Policies, Payment Instructions, Monthly Fee Settings,
//    Notification Preferences, and Security (dual-channel email + phone change with fallback recovery).
// 🚀 BEFORE LAUNCH: Wire Twilio WhatsApp Business API for WhatsApp number connection.
// 📝 NOTE: Email change verifies the OLD email first (with WhatsApp fallback if inaccessible),
//    then the NEW email. Phone change mirrors this with email as the fallback channel.
//    Both flows call app/api/auth/change-email/* and app/api/auth/change-phone/* — never
//    Supabase's login-OTP helpers (sendEmailOTP/verifyEmailOTP), which can hijack the active session.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X,
  ChevronRight,
  User,
  BookOpen,
  FileText,
  AlertTriangle,
  Bell,
  CreditCard,
  Plus,
  Pencil,
  Check,
  Trash2,
  MessageCircle,
  RotateCcw,
  UserX,
  UserPlus,
  AlertCircle,
  Headphones,
  BarChart3,
  SlidersHorizontal,
  Clock,
  Calendar,
} from 'lucide-react'
import { maskEmail, maskPhone } from '@/lib/mask'
import StepBadge from '@/components/StepBadge'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { COUNTRIES as COUNTRIES_LIST, DEFAULT_COUNTRY, findCountry, validatePhone } from '@/lib/countries'
import type { SubjectEntry, GradeConfig, BatchConfig, TrialType } from '@/lib/types/subjects'
import { TIME_OPTIONS, TimeSelect } from '@/components/ui/DateTimeInput'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SUBJECTS = [
  'Mathematics', 'Science', 'English', 'Sinhala', 'Tamil',
  'ICT / Information Technology', 'Business Studies', 'History', 'Commerce',
  'Combined Mathematics', 'Chemistry', 'Physics', 'Biology',
  'Accounting', 'Economics', 'Others',
]
const GRADES   = ['A/L', 'O/L', 'Grade 11', 'Grade 10', 'Grade 9', 'Grade 8', 'Grade 7', 'Grade 6', 'Grade 5']

const NAV_ITEMS = [
  { id: 'profile',      label: 'Profile',         icon: User              },
  { id: 'subjects',     label: 'Subjects & Fees',  icon: BookOpen          },
  { id: 'payments',     label: 'Payments',         icon: CreditCard        },
  { id: 'preferences',  label: 'Preferences',      icon: SlidersHorizontal },
]

const NOTIF_EVENTS: { key: string; icon: React.ElementType; label: string; desc: string }[] = [
  { key: 'new_enquiry',      icon: UserPlus,      label: 'New student enquiry',      desc: 'When a student books via WhatsApp'              },
  { key: 'payment_received', icon: CreditCard,    label: 'Payment received',          desc: 'When a student confirms payment'                },
  { key: 'class_reminder',   icon: Clock,         label: 'Class in 30 minutes',       desc: 'Your own reminder before each session'          },
  { key: 'no_show',          icon: AlertCircle,   label: 'Student no-show detected',  desc: 'When a student misses a class'                  },
  { key: 'bot_needs_help',   icon: Headphones,    label: 'Needs your attention',      desc: 'When a conversation needs manual handling'      },
  { key: 'weekly_summary',   icon: BarChart3,     label: 'Weekly summary',            desc: 'Monday morning income and attendance report'    },
  { key: 'cap_warning',      icon: AlertTriangle, label: 'Message cap at 80%',        desc: 'Before hitting your plan\'s WhatsApp limit'    },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type Section           = typeof NAV_ITEMS[number]['id']

// Email change: 1) enter new email  2) verify OLD email (with WhatsApp fallback / support recovery)
//               3) verify NEW email  4) success
type EmailModalStep    =
  | 'enter-new'
  | 'verify-old'
  | 'identity-confirmed'
  | 'support-recovery'
  | 'support-recovery-done'
  | 'verify-new'
  | 'success'

// Phone change mirrors email change, with email as the fallback channel. If the tutor has
// no phone on file yet, 'verify-old' is skipped entirely (server signals this via
// skippedOldVerification) and the flow jumps straight from 'enter-new' to 'verify-new'.
type PhoneModalStep    = 'enter-new' | 'verify-old' | 'identity-confirmed' | 'verify-new' | 'success'

type NotifChannel      = 'app' | 'whatsapp' | 'both'
type NotifPrefs        = Record<string, NotifChannel>
type RescheduleOption  = 'none' | 'auto_24h' | 'auto_48h' | 'custom'
type NoshowOption      = 'forfeit' | 'reschedule' | 'custom'

// Subjects edit draft types
type TrialTypeDraft = 'none' | 'free' | 'paid'

type BatchDraft = {
  id?: string
  draftId: string  // client-only stable key
  name: string
  day: string
  time: string
  duration_mins: number
  monthly_fee: string
  max_students: string
  accepting_new: boolean
  trial_type: TrialTypeDraft
  trial_fee: string
}

type SlotDraft = { day: string; time: string }

type GradeDraft = {
  grade: string
  has_individual: boolean
  individual_fee: string
  individual_duration_mins: number
  individual_slots: SlotDraft[]
  taking_new_individual: boolean
  individual_trial_type: TrialTypeDraft
  individual_trial_fee: string
  has_group: boolean
  batches: BatchDraft[]
}

type SubjectEditDraft = {
  subjectName: string
  grades: GradeDraft[]
}

type TutorRow = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  whatsapp_number: string | null
  subjects: SubjectEntry[] | null
  reschedule_policy: string | null
  noshow_policy: string | null
  monthly_due_date: number | null
  grace_period_days: number | null
  payment_instructions: string | null
  notification_prefs: { events?: NotifPrefs } | null
  auto_notify_overdue: boolean | null
  manual_mode_hint_seen: boolean | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────


function makeNotifPrefs(saved?: NotifPrefs): NotifPrefs {
  const base = Object.fromEntries(NOTIF_EVENTS.map(e => [e.key, 'both' as NotifChannel]))
  if (!saved) return base
  return { ...base, ...saved }
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionCard({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
  action,
}: {
  id: string
  icon: React.ElementType
  title: string
  subtitle: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      id={id}
      className="bg-white border border-[#dee2e6] rounded-[18px] p-6 mb-4"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center justify-between gap-2.5 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-[#edf2ff] flex items-center justify-center flex-shrink-0">
            <Icon size={17} className="text-[#3b5bdb]" />
          </div>
          <div>
            <h2 className="text-[0.88rem] font-bold text-[#1a1a2e] tracking-[-0.01em]">{title}</h2>
            <p className="text-[#6c757d] text-[0.72rem]">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[#343a40] text-[0.78rem] font-semibold mb-1.5">{children}</label>
  )
}

function InlineInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  hasError,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  hasError?: boolean
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border-[1.5px] rounded-[10px] px-3 py-[9px] text-[0.82rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
        hasError
          ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
          : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
      } ${className}`}
    />
  )
}

function SaveButton({
  loading,
  saved,
  onClick,
}: {
  loading: boolean
  saved: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex items-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm px-5 py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0"
      style={{ boxShadow: '0 4px 14px rgba(59,91,219,0.3)' }}
    >
      {loading ? (
        <>
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Saving…
        </>
      ) : saved ? (
        <>
          <Check size={14} />
          Saved
        </>
      ) : (
        'Save changes'
      )}
    </button>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-[42px] h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        checked ? 'bg-[#3b5bdb]' : 'bg-[#ced4da]'
      }`}
    >
      <span
        className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
          checked ? 'translate-x-[21px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  labelMap,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labelMap?: Record<string, string>
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
            value === opt
              ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.2)]'
              : 'bg-white text-[#6c757d] border-[#ced4da] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
          }`}
        >
          {labelMap ? (labelMap[opt] ?? opt) : opt}
        </button>
      ))}
    </div>
  )
}

function RadioCard({
  label,
  desc,
  selected,
  onClick,
  recommended,
}: {
  label: string
  desc: string
  selected: boolean
  onClick: () => void
  recommended?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-[10px] border-[1.5px] transition-all duration-150 ${
        selected
          ? 'border-[#3b5bdb] bg-[#edf2ff]'
          : 'border-[#dee2e6] bg-white hover:border-[#748ffc] hover:bg-[#f8f9ff]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
            selected ? 'border-[#3b5bdb]' : 'border-[#ced4da]'
          }`}
        >
          {selected && <div className="w-2 h-2 rounded-full bg-[#3b5bdb]" />}
        </div>
        <div>
          <span className="text-sm font-semibold text-[#1a1a2e]">{label}</span>
          {recommended && (
            <span className="ml-2 text-[0.6rem] font-bold text-[#3b5bdb] bg-[#dbe4ff] px-1.5 py-0.5 rounded-full">
              Recommended
            </span>
          )}
          <p className="text-xs text-[#6c757d] mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
    </button>
  )
}

function SavedToast({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[#2f9e44] text-xs font-semibold animate-in fade-in">
      <span className="w-4 h-4 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center flex-shrink-0">
        <Check size={10} strokeWidth={3} />
      </span>
      Saved
    </span>
  )
}

// ── OTP box component ─────────────────────────────────────────────────────────

function OtpBoxes({
  digits,
  onChange,
  onKeyDown,
  onPaste,
  refs,
  hasError,
  disabled,
}: {
  digits: string[]
  onChange: (i: number, val: string) => void
  onKeyDown: (i: number, e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  hasError: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2 justify-between" onPaste={onPaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          autoFocus={i === 0}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(-1)
            onChange(i, v)
          }}
          onKeyDown={e => onKeyDown(i, e)}
          disabled={disabled}
          className={`w-11 h-12 text-center text-lg font-bold text-[#1a1a2e] border rounded-[10px] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            hasError
              ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
              : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
          }`}
        />
      ))}
    </div>
  )
}

// ── Shared helpers for the email/phone change flows ───────────────────────────

const EMPTY_OTP = ['', '', '', '', '', '']

type AuthApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> }

/** POSTs JSON to one of the app/api/auth/change-* routes. Same-origin fetch — cookies included automatically. */
async function postAuth<T>(url: string, body: unknown): Promise<AuthApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}) as Record<string, unknown>)
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (json as { error?: string }).error ?? 'Something went wrong. Please try again.',
        extra: json as Record<string, unknown>,
      }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, status: 0, error: 'Network error. Please check your connection and try again.' }
  }
}

/** Wrong-OTP attempt copy — 5 attempts allowed, warning shown on the 4th. */
function attemptErrorMessage(next: number): { message: string; locked: boolean } {
  if (next >= 5) return { message: 'Too many attempts. Please request a new code.', locked: true }
  if (next === 4) return { message: 'One attempt remaining before you are locked out.', locked: false }
  return { message: 'Invalid code — please try again.', locked: false }
}

// ── Email change modal ────────────────────────────────────────────────────────
//
// Flow: enter new email → verify OLD email OTP (WhatsApp fallback, then support
// recovery if no fallback channel exists) → verify NEW email OTP → success.
// Never calls sendEmailOTP/verifyEmailOTP (Supabase login-OTP helpers) — those
// can silently switch the browser's active session to a different account.

function EmailChangeModal({
  currentEmail,
  onClose,
  onSuccess,
}: {
  currentEmail: string
  onClose: () => void
  onSuccess: (newEmail: string) => void
}) {
  const [step, setStep] = useState<EmailModalStep>('enter-new')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — new email address
  const [newEmail, setNewEmail] = useState('')
  const [newEmailError, setNewEmailError] = useState('')

  // Shared request state, populated by /start
  const [requestId, setRequestId] = useState('')
  const [maskedOldEmail, setMaskedOldEmail] = useState('')
  const [maskedNewEmail, setMaskedNewEmail] = useState('')
  const [canFallbackToPhone, setCanFallbackToPhone] = useState(false)
  const [fallbackNote, setFallbackNote] = useState('')

  // Step 2 — verify OLD email OTP
  const [digitsOld, setDigitsOld] = useState(EMPTY_OTP)
  const refsOld = useRef<(HTMLInputElement | null)[]>([])
  const [resendOldSecs, setResendOldSecs] = useState(0)
  const [attemptsOld, setAttemptsOld] = useState(0)

  // Support recovery — shown only if fallback reports no channel left at all
  const [supportReason, setSupportReason] = useState('')
  const [supportContact, setSupportContact] = useState('')
  const [supportError, setSupportError] = useState('')

  // Step 3 — verify NEW email OTP
  const [digitsNew, setDigitsNew] = useState(EMPTY_OTP)
  const refsNew = useRef<(HTMLInputElement | null)[]>([])
  const [attemptsNew, setAttemptsNew] = useState(0)

  useEffect(() => {
    if (resendOldSecs <= 0) return
    const t = setTimeout(() => setResendOldSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendOldSecs])

  async function handleSendNew(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newEmail.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setNewEmailError('Please enter a valid email address.')
      return
    }
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setNewEmailError('New email must be different from your current email.')
      return
    }
    setNewEmailError('')
    setLoading(true)
    setError('')
    const result = await postAuth<{
      requestId: string
      maskedOldEmail: string
      maskedNewEmail: string
      canFallbackToPhone: boolean
    }>('/api/auth/change-email/start', { newEmail: trimmed })
    setLoading(false)
    if (!result.ok) { setError(result.error); return }
    setRequestId(result.data.requestId)
    setMaskedOldEmail(result.data.maskedOldEmail)
    setMaskedNewEmail(result.data.maskedNewEmail)
    setCanFallbackToPhone(!!result.data.canFallbackToPhone)
    setFallbackNote('')
    setDigitsOld(EMPTY_OTP)
    setAttemptsOld(0)
    setResendOldSecs(30)
    setStep('verify-old')
    setTimeout(() => refsOld.current[0]?.focus(), 50)
  }

  async function handleResendOld() {
    if (resendOldSecs > 0) return
    setLoading(true)
    setError('')
    // No dedicated resend endpoint — /start re-issues a fresh OTP to the old email.
    const result = await postAuth<{
      requestId: string
      maskedOldEmail: string
      maskedNewEmail: string
      canFallbackToPhone: boolean
    }>('/api/auth/change-email/start', { newEmail: newEmail.trim() })
    setLoading(false)
    if (!result.ok) { setError(result.error); return }
    setRequestId(result.data.requestId)
    setMaskedOldEmail(result.data.maskedOldEmail)
    setFallbackNote('')
    setResendOldSecs(30)
    setDigitsOld(EMPTY_OTP)
    setTimeout(() => refsOld.current[0]?.focus(), 50)
  }

  async function handleVerifyOld(e: React.FormEvent) {
    e.preventDefault()
    const otp = digitsOld.join('')
    if (otp.length < 6) return
    setLoading(true)
    setError('')
    const result = await postAuth<{ maskedNewEmail: string }>('/api/auth/change-email/verify-old', { requestId, otp })
    if (!result.ok) {
      setLoading(false)
      if (result.status === 429) { setError(result.error); return }
      const next = attemptsOld + 1
      setAttemptsOld(next)
      const { message, locked } = attemptErrorMessage(next)
      setError(message)
      if (locked) setDigitsOld(EMPTY_OTP)
      return
    }
    setLoading(false)
    setMaskedNewEmail(result.data.maskedNewEmail)
    setDigitsNew(EMPTY_OTP)
    setAttemptsNew(0)
    setError('')
    setStep('identity-confirmed')
    setTimeout(() => {
      setStep('verify-new')
      setTimeout(() => refsNew.current[0]?.focus(), 50)
    }, 900)
  }

  async function handleFallback() {
    setLoading(true)
    setError('')
    const result = await postAuth<{ fallbackChannel: 'phone'; maskedPhone: string }>('/api/auth/change-email/fallback', { requestId })
    setLoading(false)
    if (!result.ok) {
      if (result.extra?.offerSupportRecovery) { setStep('support-recovery'); return }
      setError(result.error)
      return
    }
    setFallbackNote(`Code sent to ${result.data.maskedPhone} instead`)
    setDigitsOld(EMPTY_OTP)
    setError('')
    setResendOldSecs(30)
    setTimeout(() => refsOld.current[0]?.focus(), 50)
  }

  async function handleSupportSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supportReason.trim() || !supportContact.trim()) {
      setSupportError('Please fill in both fields.')
      return
    }
    setSupportError('')
    setLoading(true)
    const result = await postAuth<{ message: string }>('/api/auth/contact-change/support-recovery', {
      changeType: 'email',
      reason: supportReason.trim(),
      submittedContact: supportContact.trim(),
    })
    setLoading(false)
    if (!result.ok) { setSupportError(result.error); return }
    setStep('support-recovery-done')
  }

  async function handleVerifyNew(e: React.FormEvent) {
    e.preventDefault()
    const otp = digitsNew.join('')
    if (otp.length < 6) return
    setLoading(true)
    setError('')
    const result = await postAuth<Record<string, never>>('/api/auth/change-email/verify-new', { requestId, otp })
    if (!result.ok) {
      setLoading(false)
      if (result.status === 429) { setError(result.error); return }
      const next = attemptsNew + 1
      setAttemptsNew(next)
      const { message, locked } = attemptErrorMessage(next)
      setError(message)
      if (locked) setDigitsNew(EMPTY_OTP)
      return
    }
    setLoading(false)
    setStep('success')
  }

  function handleDone() {
    onSuccess(newEmail.trim())
    onClose()
  }

  // OTP digit handlers — inlined (not passed through a helper) so refs are only
  // ever dereferenced inside these event-handler closures, never during render.
  function onOldDigitChange(i: number, val: string) {
    const updated = [...digitsOld]
    updated[i] = val
    setDigitsOld(updated)
    if (val && i < 5) refsOld.current[i + 1]?.focus()
  }
  function onOldDigitKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digitsOld[i] && i > 0) refsOld.current[i - 1]?.focus()
  }
  function onOldDigitPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigitsOld(pasted.split(''))
      refsOld.current[5]?.focus()
    }
  }
  function onNewDigitChange(i: number, val: string) {
    const updated = [...digitsNew]
    updated[i] = val
    setDigitsNew(updated)
    if (val && i < 5) refsNew.current[i + 1]?.focus()
  }
  function onNewDigitKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digitsNew[i] && i > 0) refsNew.current[i - 1]?.focus()
  }
  function onNewDigitPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigitsNew(pasted.split(''))
      refsNew.current[5]?.focus()
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        style={{ backdropFilter: 'blur(6px)' }}
        onClick={step === 'success' ? onClose : undefined}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 md:inset-0 md:flex md:items-center md:justify-center">
        <div
          className="bg-white w-full md:max-w-md md:rounded-[18px] relative"
          style={{ borderRadius: '20px 20px 0 0' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-[38px] h-1 rounded-full bg-[#ced4da]" />
          </div>
          <div className="px-6 pb-8 pt-4 md:pt-6">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 md:top-5 md:right-5 text-[#adb5bd] hover:text-[#6c757d] transition-colors"
            >
              <X size={18} />
            </button>

            {step === 'enter-new' && (
              <>
                <div className="mb-6">
                  <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-1">
                    Change email address
                  </h2>
                  <p className="text-[#6c757d] text-sm leading-relaxed">
                    Enter the new email address you&apos;d like to use to log in.
                  </p>
                </div>
                <div className="mb-4 bg-[#edf2ff] border border-[#dbe4ff] rounded-[10px] px-4 py-3">
                  <p className="text-[#3b5bdb] text-xs font-semibold leading-relaxed">
                    💡 First we&apos;ll verify it&apos;s really you — a code will go to your current email. Then we&apos;ll confirm the new one.
                  </p>
                </div>
                {error && (
                  <div className="mb-4 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                  </div>
                )}
                <form onSubmit={handleSendNew} className="space-y-4" noValidate>
                  {currentEmail && (
                    <div>
                      <label className="block text-[#343a40] text-xs font-semibold mb-1.5">Current email</label>
                      <div className="w-full border-[1.5px] border-[#dee2e6] bg-[#f8f9fa] rounded-[10px] px-3 py-[9px] text-sm text-[#6c757d]">
                        {maskEmail(currentEmail)}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-[#343a40] text-xs font-semibold mb-1.5">New email address</label>
                    <input
                      type="email"
                      placeholder="newemail@example.com"
                      value={newEmail}
                      onChange={e => { setNewEmail(e.target.value); setNewEmailError(''); setError('') }}
                      autoFocus
                      className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                        newEmailError
                          ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                          : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                      }`}
                    />
                    {newEmailError && <p className="mt-1.5 text-[#c92a2a] text-xs">{newEmailError}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !newEmail.trim()}
                    className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                  >
                    {loading ? 'Sending…' : 'Send verification code'}
                  </button>
                </form>
              </>
            )}

            {step === 'verify-old' && (
              <>
                <StepBadge step={1} label="Verify it's you" />
                <div className="mb-6">
                  <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-1">
                    Confirm it&apos;s really you
                  </h2>
                  <p className="text-[#6c757d] text-sm leading-relaxed">
                    We sent a 6-digit code to your current email:
                  </p>
                </div>
                {error && (
                  <div className="mb-4 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                  </div>
                )}
                <form onSubmit={handleVerifyOld} className="space-y-4">
                  <p className="text-xs text-[#6c757d]">
                    Code sent to{' '}
                    <span className="font-semibold text-[#1a1a2e]">{maskedOldEmail}</span>
                  </p>
                  {fallbackNote && (
                    <p className="text-xs text-[#3b5bdb] font-medium">{fallbackNote}</p>
                  )}
                  <OtpBoxes
                    digits={digitsOld}
                    onChange={onOldDigitChange}
                    onKeyDown={onOldDigitKeyDown}
                    onPaste={onOldDigitPaste}
                    refs={refsOld}
                    hasError={!!error}
                  />
                  <button
                    type="submit"
                    disabled={loading || digitsOld.some(d => !d)}
                    className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                  >
                    {loading ? 'Verifying…' : 'Continue'}
                  </button>
                  <p className="text-center text-xs text-[#6c757d]">
                    This confirms your identity before we let you change anything.
                  </p>
                  <p className="text-center text-xs text-[#6c757d]">
                    {resendOldSecs > 0 ? (
                      <>Resend in <span className="font-semibold text-[#1a1a2e]">{resendOldSecs}s</span></>
                    ) : (
                      <>
                        Didn&apos;t receive it?{' '}
                        <button
                          type="button"
                          onClick={handleResendOld}
                          disabled={loading}
                          className="text-[#3b5bdb] font-semibold hover:underline disabled:opacity-50"
                        >
                          Resend code
                        </button>
                      </>
                    )}
                  </p>
                  {canFallbackToPhone && !fallbackNote && (
                    <p className="text-center text-xs">
                      <button
                        type="button"
                        onClick={handleFallback}
                        disabled={loading}
                        className="text-[#6c757d] font-medium hover:text-[#3b5bdb] hover:underline disabled:opacity-50"
                      >
                        Can&apos;t access this email?
                      </button>
                    </p>
                  )}
                </form>
              </>
            )}

            {step === 'identity-confirmed' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f9e44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-2">
                  Identity confirmed ✅
                </h2>
                <p className="text-[#6c757d] text-sm leading-relaxed">
                  Sending code to your new email...
                </p>
              </div>
            )}

            {step === 'support-recovery' && (
              <>
                <div className="mb-6">
                  <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-1">
                    Let our team help
                  </h2>
                  <p className="text-[#6c757d] text-sm leading-relaxed">
                    We couldn&apos;t find another way to verify it&apos;s you. Tell us a bit more and our team will
                    help you regain access securely.
                  </p>
                </div>
                {supportError && (
                  <div className="mb-4 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-xs font-semibold">{supportError}</p>
                  </div>
                )}
                <form onSubmit={handleSupportSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[#343a40] text-xs font-semibold mb-1.5">What happened?</label>
                    <textarea
                      value={supportReason}
                      onChange={e => { setSupportReason(e.target.value); setSupportError('') }}
                      rows={3}
                      placeholder="e.g. I no longer have access to my old email and my phone number isn't verified."
                      className="w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#343a40] text-xs font-semibold mb-1.5">Best way to reach you</label>
                    <input
                      type="text"
                      value={supportContact}
                      onChange={e => { setSupportContact(e.target.value); setSupportError('') }}
                      placeholder="Alternate email or phone number"
                      className="w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                  >
                    {loading ? 'Submitting…' : 'Submit request'}
                  </button>
                </form>
              </>
            )}

            {step === 'support-recovery-done' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-[#edf2ff] border border-[#dbe4ff] flex items-center justify-center mx-auto mb-4">
                  <Headphones size={24} className="text-[#3b5bdb]" />
                </div>
                <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-2">
                  Request received
                </h2>
                <p className="text-[#6c757d] text-sm mb-6 leading-relaxed">
                  Our team will review your request within 24 hours and reach out using the details you provided.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                >
                  Done
                </button>
              </div>
            )}

            {step === 'verify-new' && (
              <>
                <StepBadge step={2} label="Confirm new email" />
                <div className="mb-6">
                  <p className="text-[0.7rem] text-[#2f9e44] font-semibold mb-1">✅ Identity confirmed</p>
                  <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-1">
                    Confirm your new email works
                  </h2>
                  <p className="text-[#6c757d] text-sm leading-relaxed">
                    Enter the code sent to{' '}
                    <span className="font-semibold text-[#1a1a2e]">{maskedNewEmail}</span>
                  </p>
                  <p className="text-[#6c757d] text-xs leading-relaxed mt-2">
                    This makes sure we&apos;re not pointing your account at a typo or someone else&apos;s inbox.
                  </p>
                </div>
                {error && (
                  <div className="mb-4 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                  </div>
                )}
                <form onSubmit={handleVerifyNew} className="space-y-4">
                  <OtpBoxes
                    digits={digitsNew}
                    onChange={onNewDigitChange}
                    onKeyDown={onNewDigitKeyDown}
                    onPaste={onNewDigitPaste}
                    refs={refsNew}
                    hasError={!!error}
                  />
                  <button
                    type="submit"
                    disabled={loading || digitsNew.some(d => !d)}
                    className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                  >
                    {loading ? 'Confirming…' : 'Confirm & save'}
                  </button>
                </form>
              </>
            )}

            {step === 'success' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f9e44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-2">
                  Email updated!
                </h2>
                <p className="text-[#6c757d] text-sm mb-6 leading-relaxed">
                  Both your old and new email have been notified of this change, just in case.
                </p>
                <button
                  type="button"
                  onClick={handleDone}
                  className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Phone change modal ─────────────────────────────────────────────────────────
//
// Mirrors EmailChangeModal, with the fallback channel reversed (email instead of
// WhatsApp). If the tutor has no phone on file at all, /start returns
// skippedOldVerification:true and the flow jumps straight to 'verify-new'
// (there's nothing to verify against, so no "old number" OTP step exists).

function PhoneChangeModal({
  currentPhone,
  currentCountry,
  onClose,
  onSuccess,
}: {
  currentPhone: string
  currentCountry: string
  onClose: () => void
  onSuccess: (newPhone: string) => void
}) {
  const isAdding = !currentPhone

  const [step, setStep] = useState<PhoneModalStep>('enter-new')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — new phone number
  const [newCountry, setNewCountry] = useState(currentCountry || DEFAULT_COUNTRY.code)
  const [newNumber, setNewNumber] = useState('')
  const [newNumberError, setNewNumberError] = useState('')
  const [fullNewPhone, setFullNewPhone] = useState('')

  // Shared request state, populated by /start
  const [requestId, setRequestId] = useState('')
  const [maskedOldPhone, setMaskedOldPhone] = useState('')
  const [maskedNewPhone, setMaskedNewPhone] = useState('')
  const [canFallbackToEmail, setCanFallbackToEmail] = useState(false)
  const [fallbackNote, setFallbackNote] = useState('')

  // Step 2 — verify OLD number OTP (skipped entirely when isAdding)
  const [digitsOld, setDigitsOld] = useState(EMPTY_OTP)
  const refsOld = useRef<(HTMLInputElement | null)[]>([])
  const [resendOldSecs, setResendOldSecs] = useState(0)
  const [attemptsOld, setAttemptsOld] = useState(0)

  // Step 3 — verify NEW number OTP
  const [digitsNew, setDigitsNew] = useState(EMPTY_OTP)
  const refsNew = useRef<(HTMLInputElement | null)[]>([])
  const [attemptsNew, setAttemptsNew] = useState(0)

  useEffect(() => {
    if (resendOldSecs <= 0) return
    const t = setTimeout(() => setResendOldSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendOldSecs])

  async function handleSendNew(e: React.FormEvent) {
    e.preventDefault()
    const country = findCountry(newCountry)
    const validationError = validatePhone(newNumber, country)
    if (validationError) { setNewNumberError(validationError); return }
    if (country.code !== 'LK') {
      // WhatsApp verification (OTP delivery + change-phone API) only supports
      // Sri Lankan numbers right now — reject other countries inline here
      // instead of letting the request round-trip to a generic server error.
      setNewNumberError('Please enter a Sri Lankan mobile number.')
      return
    }
    const full = `${country.dialCode}${newNumber}`
    if (currentPhone && full === currentPhone) {
      setNewNumberError('New number must be different from your current number.')
      return
    }
    setNewNumberError('')
    setLoading(true)
    setError('')
    const result = await postAuth<{
      requestId: string
      maskedOldPhone?: string
      maskedNewPhone: string
      canFallbackToEmail?: boolean
      skippedOldVerification?: boolean
    }>('/api/auth/change-phone/start', { newPhone: full })
    setLoading(false)
    if (!result.ok) { setError(result.error); return }
    setFullNewPhone(full)
    setRequestId(result.data.requestId)
    setMaskedNewPhone(result.data.maskedNewPhone)
    setFallbackNote('')
    if (result.data.skippedOldVerification) {
      setDigitsNew(EMPTY_OTP)
      setAttemptsNew(0)
      setStep('verify-new')
      setTimeout(() => refsNew.current[0]?.focus(), 50)
    } else {
      setMaskedOldPhone(result.data.maskedOldPhone ?? '')
      setCanFallbackToEmail(!!result.data.canFallbackToEmail)
      setDigitsOld(EMPTY_OTP)
      setAttemptsOld(0)
      setResendOldSecs(30)
      setStep('verify-old')
      setTimeout(() => refsOld.current[0]?.focus(), 50)
    }
  }

  async function handleResendOld() {
    if (resendOldSecs > 0) return
    setLoading(true)
    setError('')
    // No dedicated resend endpoint — /start re-issues a fresh OTP to the old number.
    const result = await postAuth<{
      requestId: string
      maskedOldPhone?: string
      maskedNewPhone: string
      canFallbackToEmail?: boolean
      skippedOldVerification?: boolean
    }>('/api/auth/change-phone/start', { newPhone: fullNewPhone })
    setLoading(false)
    if (!result.ok) { setError(result.error); return }
    setRequestId(result.data.requestId)
    setFallbackNote('')
    setResendOldSecs(30)
    setDigitsOld(EMPTY_OTP)
    setTimeout(() => refsOld.current[0]?.focus(), 50)
  }

  async function handleVerifyOld(e: React.FormEvent) {
    e.preventDefault()
    const otp = digitsOld.join('')
    if (otp.length < 6) return
    setLoading(true)
    setError('')
    const result = await postAuth<{ maskedNewPhone: string }>('/api/auth/change-phone/verify-old', { requestId, otp })
    if (!result.ok) {
      setLoading(false)
      if (result.status === 429) { setError(result.error); return }
      const next = attemptsOld + 1
      setAttemptsOld(next)
      const { message, locked } = attemptErrorMessage(next)
      setError(message)
      if (locked) setDigitsOld(EMPTY_OTP)
      return
    }
    setLoading(false)
    setMaskedNewPhone(result.data.maskedNewPhone)
    setDigitsNew(EMPTY_OTP)
    setAttemptsNew(0)
    setError('')
    setStep('identity-confirmed')
    setTimeout(() => {
      setStep('verify-new')
      setTimeout(() => refsNew.current[0]?.focus(), 50)
    }, 900)
  }

  async function handleFallback() {
    setLoading(true)
    setError('')
    const result = await postAuth<{ fallbackChannel: 'email'; maskedEmail: string }>('/api/auth/change-phone/fallback', { requestId })
    setLoading(false)
    if (!result.ok) { setError(result.error); return }
    setFallbackNote(`Code sent to ${result.data.maskedEmail} instead`)
    setDigitsOld(EMPTY_OTP)
    setError('')
    setResendOldSecs(30)
    setTimeout(() => refsOld.current[0]?.focus(), 50)
  }

  async function handleVerifyNew(e: React.FormEvent) {
    e.preventDefault()
    const otp = digitsNew.join('')
    if (otp.length < 6) return
    setLoading(true)
    setError('')
    const result = await postAuth<Record<string, never>>('/api/auth/change-phone/verify-new', { requestId, otp })
    if (!result.ok) {
      setLoading(false)
      if (result.status === 429) { setError(result.error); return }
      const next = attemptsNew + 1
      setAttemptsNew(next)
      const { message, locked } = attemptErrorMessage(next)
      setError(message)
      if (locked) setDigitsNew(EMPTY_OTP)
      return
    }
    setLoading(false)
    setStep('success')
  }

  function handleDone() {
    onSuccess(fullNewPhone)
    onClose()
  }

  // OTP digit handlers — inlined (not passed through a helper) so refs are only
  // ever dereferenced inside these event-handler closures, never during render.
  function onOldDigitChange(i: number, val: string) {
    const updated = [...digitsOld]
    updated[i] = val
    setDigitsOld(updated)
    if (val && i < 5) refsOld.current[i + 1]?.focus()
  }
  function onOldDigitKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digitsOld[i] && i > 0) refsOld.current[i - 1]?.focus()
  }
  function onOldDigitPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigitsOld(pasted.split(''))
      refsOld.current[5]?.focus()
    }
  }
  function onNewDigitChange(i: number, val: string) {
    const updated = [...digitsNew]
    updated[i] = val
    setDigitsNew(updated)
    if (val && i < 5) refsNew.current[i + 1]?.focus()
  }
  function onNewDigitKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digitsNew[i] && i > 0) refsNew.current[i - 1]?.focus()
  }
  function onNewDigitPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigitsNew(pasted.split(''))
      refsNew.current[5]?.focus()
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        style={{ backdropFilter: 'blur(6px)' }}
        onClick={step === 'success' ? onClose : undefined}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 md:inset-0 md:flex md:items-center md:justify-center">
        <div
          className="bg-white w-full md:max-w-md md:rounded-[18px] relative"
          style={{ borderRadius: '20px 20px 0 0' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-[38px] h-1 rounded-full bg-[#ced4da]" />
          </div>
          <div className="px-6 pb-8 pt-4 md:pt-6">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 md:top-5 md:right-5 text-[#adb5bd] hover:text-[#6c757d] transition-colors"
            >
              <X size={18} />
            </button>

            {step === 'enter-new' && (
              <>
                <div className="mb-6">
                  <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-1">
                    {isAdding ? 'Add phone number' : 'Change phone number'}
                  </h2>
                  <p className="text-[#6c757d] text-sm leading-relaxed">
                    {isAdding
                      ? 'Add a WhatsApp number so you can always recover access to your account.'
                      : "Enter your new WhatsApp number. We'll verify it's really you first."}
                  </p>
                </div>
                {!isAdding && (
                  <div className="mb-4 bg-[#edf2ff] border border-[#dbe4ff] rounded-[10px] px-4 py-3">
                    <p className="text-[#3b5bdb] text-xs font-semibold leading-relaxed">
                      💡 First we&apos;ll verify it&apos;s really you — a code will go to your current WhatsApp number. Then we&apos;ll confirm the new one.
                    </p>
                  </div>
                )}
                {error && (
                  <div className="mb-4 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                  </div>
                )}
                <form onSubmit={handleSendNew} className="space-y-4" noValidate>
                  {!isAdding && (
                    <div>
                      <label className="block text-[#343a40] text-xs font-semibold mb-1.5">Current number</label>
                      <div className="w-full border-[1.5px] border-[#dee2e6] bg-[#f8f9fa] rounded-[10px] px-3 py-[9px] text-sm text-[#6c757d]">
                        {maskPhone(currentPhone)}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-[#343a40] text-xs font-semibold mb-1.5">New mobile number</label>
                    <div className="flex gap-2">
                      <CountryDialSelect
                        value={newCountry}
                        onChange={code => { setNewCountry(code); setNewNumber(''); setNewNumberError('') }}
                        hasError={!!newNumberError}
                      />
                      <input
                        type="tel"
                        placeholder={newCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                        value={newNumber}
                        onChange={e => { setNewNumber(e.target.value.replace(/\D/g, '')); setNewNumberError(''); setError('') }}
                        autoFocus
                        className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                          newNumberError
                            ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                            : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                        }`}
                      />
                    </div>
                    {newNumberError && <p className="mt-1.5 text-[#c92a2a] text-xs">{newNumberError}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !newNumber.trim()}
                    className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                  >
                    {loading ? 'Sending…' : 'Send verification code'}
                  </button>
                </form>
              </>
            )}

            {step === 'verify-old' && (
              <>
                <StepBadge step={1} label="Verify it's you" />
                <div className="mb-6">
                  <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-1">
                    Confirm it&apos;s really you
                  </h2>
                  <p className="text-[#6c757d] text-sm leading-relaxed">
                    We sent a 6-digit code via WhatsApp to your current number:
                  </p>
                </div>
                {error && (
                  <div className="mb-4 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                  </div>
                )}
                <form onSubmit={handleVerifyOld} className="space-y-4">
                  <p className="text-xs text-[#6c757d]">
                    Code sent to{' '}
                    <span className="font-semibold text-[#1a1a2e]">{maskedOldPhone}</span>
                  </p>
                  {fallbackNote && (
                    <p className="text-xs text-[#3b5bdb] font-medium">{fallbackNote}</p>
                  )}
                  <OtpBoxes
                    digits={digitsOld}
                    onChange={onOldDigitChange}
                    onKeyDown={onOldDigitKeyDown}
                    onPaste={onOldDigitPaste}
                    refs={refsOld}
                    hasError={!!error}
                  />
                  <button
                    type="submit"
                    disabled={loading || digitsOld.some(d => !d)}
                    className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                  >
                    {loading ? 'Verifying…' : 'Continue'}
                  </button>
                  <p className="text-center text-xs text-[#6c757d]">
                    This confirms your identity before we let you change anything.
                  </p>
                  <p className="text-center text-xs text-[#6c757d]">
                    {resendOldSecs > 0 ? (
                      <>Resend in <span className="font-semibold text-[#1a1a2e]">{resendOldSecs}s</span></>
                    ) : (
                      <>
                        Didn&apos;t receive it?{' '}
                        <button
                          type="button"
                          onClick={handleResendOld}
                          disabled={loading}
                          className="text-[#3b5bdb] font-semibold hover:underline disabled:opacity-50"
                        >
                          Resend code
                        </button>
                      </>
                    )}
                  </p>
                  {canFallbackToEmail && !fallbackNote && (
                    <p className="text-center text-xs">
                      <button
                        type="button"
                        onClick={handleFallback}
                        disabled={loading}
                        className="text-[#6c757d] font-medium hover:text-[#3b5bdb] hover:underline disabled:opacity-50"
                      >
                        Can&apos;t access this WhatsApp number?
                      </button>
                    </p>
                  )}
                </form>
              </>
            )}

            {step === 'identity-confirmed' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f9e44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-2">
                  Identity confirmed ✅
                </h2>
                <p className="text-[#6c757d] text-sm leading-relaxed">
                  Sending code to your new number...
                </p>
              </div>
            )}

            {step === 'verify-new' && (
              <>
                <StepBadge step={2} label="Confirm new number" />
                <div className="mb-6">
                  {!isAdding && (
                    <p className="text-[0.7rem] text-[#2f9e44] font-semibold mb-1">✅ Identity confirmed</p>
                  )}
                  <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-1">
                    Confirm your new number works
                  </h2>
                  <p className="text-[#6c757d] text-sm leading-relaxed">
                    Enter the code sent via WhatsApp to{' '}
                    <span className="font-semibold text-[#1a1a2e]">{maskedNewPhone}</span>
                  </p>
                  <p className="text-[#6c757d] text-xs leading-relaxed mt-2">
                    This makes sure the number is correct and reachable on WhatsApp.
                  </p>
                </div>
                {error && (
                  <div className="mb-4 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-xs font-semibold">{error}</p>
                  </div>
                )}
                <form onSubmit={handleVerifyNew} className="space-y-4">
                  <OtpBoxes
                    digits={digitsNew}
                    onChange={onNewDigitChange}
                    onKeyDown={onNewDigitKeyDown}
                    onPaste={onNewDigitPaste}
                    refs={refsNew}
                    hasError={!!error}
                  />
                  <button
                    type="submit"
                    disabled={loading || digitsNew.some(d => !d)}
                    className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                  >
                    {loading ? 'Confirming…' : 'Confirm & save'}
                  </button>
                </form>
              </>
            )}

            {step === 'success' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f9e44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="text-[1.1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] mb-2">
                  {isAdding ? 'Phone number added!' : 'Phone number updated!'}
                </h2>
                <p className="text-[#6c757d] text-sm mb-6 leading-relaxed">
                  {isAdding
                    ? 'A confirmation was sent to your email.'
                    : 'Both your old and new number have been notified via WhatsApp, and a copy was sent to your email too.'}
                </p>
                <button
                  type="button"
                  onClick={handleDone}
                  className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="bg-white border border-[#dee2e6] rounded-[18px] p-6 mb-4 animate-pulse"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-[38px] h-[38px] rounded-[10px] bg-[#f1f3f5]" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 bg-[#f1f3f5] rounded-full" />
          <div className="h-2.5 w-48 bg-[#f1f3f5] rounded-full" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-10 bg-[#f1f3f5] rounded-[10px]" />
        <div className="h-10 bg-[#f1f3f5] rounded-[10px]" />
      </div>
    </div>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('profile')
  const [tutor, setTutor] = useState<TutorRow | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [currentEmail, setCurrentEmail] = useState('')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)

  // ── Profile state ───────────────────────────────────────────────────────
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileCountry, setProfileCountry] = useState(DEFAULT_COUNTRY.code)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profilePhoneError, setProfilePhoneError] = useState('')

  // ── Subjects state ──────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState<SubjectEntry[]>([])
  const [editingSubjectIdx, setEditingSubjectIdx] = useState<number | null>(null)
  const [addingSubject, setAddingSubject] = useState(false)
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [subjectsSaved, setSubjectsSaved] = useState(false)
  const [subjectsError, setSubjectsError] = useState('')
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null)

  // Draft for new subject being added
  const [newSubjectName, setNewSubjectName] = useState('')
  const [customSubjectName, setCustomSubjectName] = useState('')
  const [customGradeInput, setCustomGradeInput] = useState('')
  const [newSubjectGrades, setNewSubjectGrades] = useState<GradeDraft[]>([])

  // Inline edit drafts per subject index
  const [editDraft, setEditDraft] = useState<SubjectEditDraft>({ subjectName: '', grades: [] })


  // ── Payments state ──────────────────────────────────────────────────────
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [monthlyDueDate, setMonthlyDueDate] = useState<'5' | '10' | '15' | '20' | '25' | '28'>('5')
  const [gracePeriod, setGracePeriod] = useState<'3' | '5' | '7'>('5')
  const [autoNotify, setAutoNotify] = useState(true)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsSaved, setPaymentsSaved] = useState(false)
  const [paymentsError, setPaymentsError] = useState('')

  // ── Preferences state ───────────────────────────────────────────────────
  const [waNumber, setWaNumber] = useState('')
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY.code)
  const [waPhoneError, setWaPhoneError] = useState('')
  const [rescheduleOpt, setRescheduleOpt] = useState<RescheduleOption>('auto_24h')
  const [rescheduleCustom, setRescheduleCustom] = useState('')
  const [noshowOpt, setNoshowOpt] = useState<NoshowOption>('forfeit')
  const [noshowCustom, setNoshowCustom] = useState('')
  const [prefsLoading, setPrefsLoading] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [prefsError, setPrefsError] = useState('')

  // ── Impact warning state ────────────────────────────────────────────────
  const [batchOrphanWarning, setBatchOrphanWarning] = useState<{
    batchNames: string[]
    studentCount: number
    resolve: (proceed: boolean) => void
  } | null>(null)

  const [feeSyncOffer, setFeeSyncOffer] = useState<{
    updates: { id: string; name: string; newFee: number }[]
    subject: string
  } | null>(null)
  const [feeSyncing, setFeeSyncing] = useState(false)


  // ── Section edit-mode state ─────────────────────────────────────────────
  const [profileEditing,  setProfileEditing ] = useState(false)
  const [paymentsEditing, setPaymentsEditing] = useState(false)
  const [prefsEditing,    setPrefsEditing   ] = useState(false)

  // ── Notification prefs state (part of Preferences) ─────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(makeNotifPrefs())

  // ── Load tutor data on mount ────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentEmail(user.email ?? '')

      const { data } = await supabase
        .from('tutors')
        .select('id, name, phone, email, whatsapp_number, subjects, reschedule_policy, noshow_policy, monthly_due_date, grace_period_days, payment_instructions, notification_prefs, auto_notify_overdue, manual_mode_hint_seen')
        .eq('id', user.id)
        .single()

      if (!data) { setDataLoading(false); return }

      const row = data as TutorRow
      setTutor(row)

      // Profile
      setProfileName(row.name ?? '')
      if (row.phone) {
        // Strip dial code to get local number
        const country = COUNTRIES_LIST.find(c => row.phone!.startsWith(c.dialCode))
        if (country) {
          setProfileCountry(country.code)
          setProfilePhone(row.phone.slice(country.dialCode.length))
        } else {
          setProfilePhone(row.phone)
        }
      }

      // Subjects — merge tutors.subjects JSONB with batches table so batches
      // created via the Batches page are reflected here too
      const { data: dbBatches } = await supabase
        .from('batches')
        .select('id, name, subject, grade, schedule_day, schedule_time, session_duration_mins, monthly_fee, max_students, accepting_new')
        .eq('tutor_id', user.id)
        .eq('status', 'active')

      type DbBatch = { id: string; name: string; subject: string; grade: string; schedule_day: string; schedule_time: string; session_duration_mins: number | null; monthly_fee: number; max_students: number; accepting_new: boolean | null }

      const baseSubjects: SubjectEntry[] = row.subjects ?? []

      const mergedSubjects: SubjectEntry[] = baseSubjects.map(subjectEntry => ({
        ...subjectEntry,
        grades: subjectEntry.grades.map((gradeEntry: GradeConfig) => {
          const dbForGrade = ((dbBatches ?? []) as DbBatch[]).filter(
            b => b.subject === subjectEntry.subject && b.grade === gradeEntry.grade,
          )
          const existingIds   = new Set((gradeEntry.batches ?? []).map(b => b.id).filter(Boolean))
          const existingNames = new Set((gradeEntry.batches ?? []).map(b => b.name.trim().toLowerCase()))
          const newBatches: BatchConfig[] = dbForGrade
            .filter(b => !existingIds.has(b.id) && !existingNames.has(b.name.trim().toLowerCase()))
            .map(b => ({
              id: b.id,
              name: b.name,
              day: b.schedule_day,
              time: b.schedule_time,
              duration_mins: b.session_duration_mins ?? 60,
              monthly_fee: b.monthly_fee,
              max_students: b.max_students,
              accepting_new: b.accepting_new ?? true,
              trial_type: 'none' as TrialType,
              trial_fee: 0,
            }))
          if (newBatches.length === 0) return gradeEntry
          return { ...gradeEntry, has_group: true, batches: [...(gradeEntry.batches ?? []), ...newBatches] }
        }),
      }))

      setSubjects(mergedSubjects)

      // Payments
      setPaymentInstructions(row.payment_instructions ?? '')
      if (row.monthly_due_date) {
        const validDates = ['5', '10', '15', '20', '25', '28'] as const
        const asStr = String(row.monthly_due_date) as (typeof validDates)[number]
        setMonthlyDueDate(validDates.includes(asStr) ? asStr : '5')
      }
      setGracePeriod((String(row.grace_period_days ?? 5) as '3' | '5' | '7'))
      setAutoNotify(row.auto_notify_overdue ?? true)

      // Preferences — WhatsApp number
      if (row.whatsapp_number) {
        const raw = String(row.whatsapp_number).replace(/^\+/, '')
        const country = COUNTRIES_LIST.find(c => ('+' + raw).startsWith(c.dialCode))
        if (country) {
          setWaCountry(country.code)
          setWaNumber(raw.slice(country.dialCode.replace('+', '').length))
        } else {
          setWaNumber(raw)
        }
      }

      // Preferences — Reschedule policy
      if (row.reschedule_policy) {
        const p = row.reschedule_policy
        if (p === 'none' || p === 'auto_24h' || p === 'auto_48h') {
          setRescheduleOpt(p)
        } else {
          setRescheduleOpt('custom')
          setRescheduleCustom(p)
        }
      }

      // Preferences — No-show policy
      if (row.noshow_policy) {
        const p = row.noshow_policy
        if (p === 'forfeit' || p === 'reschedule') {
          setNoshowOpt(p as NoshowOption)
        } else {
          setNoshowOpt('custom')
          setNoshowCustom(p)
        }
      }

      // Preferences — Notifications
      const prefs = row.notification_prefs ?? {}
      setNotifPrefs(makeNotifPrefs(prefs.events))

      setDataLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers to flash "saved" briefly ───────────────────────────────────

  function flashSaved(setter: React.Dispatch<React.SetStateAction<boolean>>) {
    setter(true)
    setTimeout(() => setter(false), 2500)
  }

  // ── Email / phone change modal success handlers ─────────────────────────
  // The change was already verified + persisted server-side by the time these
  // fire (Done button in each modal's success step) — just sync local state
  // so the Profile section reflects the new value immediately.

  function handleEmailChanged(newEmail: string) {
    setCurrentEmail(newEmail)
    setTutor(prev => prev ? { ...prev, email: newEmail } : prev)
    flashSaved(setProfileSaved)
  }

  function handlePhoneChanged(fullPhone: string) {
    const country = COUNTRIES_LIST.find(c => fullPhone.startsWith(c.dialCode))
    if (country) {
      setProfileCountry(country.code)
      setProfilePhone(fullPhone.slice(country.dialCode.length))
    } else {
      setProfilePhone(fullPhone)
      setProfileCountry(DEFAULT_COUNTRY.code)
    }
    setTutor(prev => prev ? { ...prev, phone: fullPhone } : prev)
    flashSaved(setProfileSaved)
  }

  // ── Supabase update helper ──────────────────────────────────────────────

  async function updateTutor(fields: Partial<Record<string, unknown>>): Promise<boolean> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { error } = await supabase.from('tutors').update(fields).eq('id', user.id)
    return !error
  }

  // ── Profile save ────────────────────────────────────────────────────────

  async function handleSaveProfile() {
    setProfileError('')
    setProfilePhoneError('')
    if (!profileName.trim()) { setProfileError('Full name is required.'); return }
    if (profilePhone) {
      const err = validatePhone(profilePhone, findCountry(profileCountry))
      if (err) { setProfilePhoneError(err); return }
    }
    setProfileLoading(true)
    const country = findCountry(profileCountry)
    const fullPhone = profilePhone ? `${country.dialCode}${profilePhone}` : null
    const ok = await updateTutor({ name: profileName.trim(), phone: fullPhone })
    setProfileLoading(false)
    if (!ok) { setProfileError('Could not save. Please try again.'); return }
    setTutor(prev => prev ? { ...prev, name: profileName.trim(), phone: fullPhone } : prev)
    setProfileEditing(false)
    flashSaved(setProfileSaved)
  }

  function cancelProfileEdit() {
    setProfileName(tutor?.name ?? '')
    setProfileError('')
    setProfilePhoneError('')
    if (tutor?.phone) {
      const country = COUNTRIES_LIST.find(c => tutor.phone!.startsWith(c.dialCode))
      if (country) { setProfileCountry(country.code); setProfilePhone(tutor.phone.slice(country.dialCode.length)) }
      else { setProfilePhone(tutor.phone); setProfileCountry(DEFAULT_COUNTRY.code) }
    } else { setProfilePhone(''); setProfileCountry(DEFAULT_COUNTRY.code) }
    setProfileEditing(false)
  }

  // ── Subjects save ───────────────────────────────────────────────────────

  async function handleSaveSubjects() {
    if (subjects.length === 0) { setSubjectsError('Add at least one subject.'); return }
    setSubjectsError('')
    setSubjectsLoading(true)
    const ok = await updateTutor({ subjects })
    setSubjectsLoading(false)
    if (!ok) { setSubjectsError('Could not save. Please try again.'); return }
    flashSaved(setSubjectsSaved)
  }

  function removeSubject(idx: number) {
    setSubjects(prev => prev.filter((_, i) => i !== idx))
    setConfirmRemoveIdx(null)
  }

  function makeDefaultBatchDraft(): BatchDraft {
    return {
      draftId: crypto.randomUUID(),
      name: '',
      day: 'Saturday',
      time: '09:00',
      duration_mins: 60,
      monthly_fee: '',
      max_students: '',
      accepting_new: true,
      trial_type: 'none',
      trial_fee: '',
    }
  }

  function makeDefaultGradeDraft(grade: string): GradeDraft {
    return {
      grade,
      has_individual: false,
      individual_fee: '',
      individual_duration_mins: 60,
      individual_slots: [],
      taking_new_individual: true,
      individual_trial_type: 'none',
      individual_trial_fee: '',
      has_group: false,
      batches: [],
    }
  }

  function startEditSubject(idx: number) {
    const s = subjects[idx]
    setEditDraft({
      subjectName: s.subject,
      grades: s.grades.map(g => ({
        grade: g.grade,
        has_individual: g.has_individual,
        individual_fee: g.individual_fee > 0 ? String(g.individual_fee) : '',
        individual_duration_mins: g.individual_duration_mins || 60,
        individual_slots: (g.individual_slots || []).map(sl => ({ day: sl.day, time: sl.time })),
        taking_new_individual: g.taking_new_individual ?? true,
        individual_trial_type: g.individual_trial_type ?? 'none',
        individual_trial_fee: g.individual_trial_fee > 0 ? String(g.individual_trial_fee) : '',
        has_group: g.has_group,
        batches: (g.batches || []).map(b => ({
          id: b.id,
          draftId: crypto.randomUUID(),
          name: b.name || '',
          day: b.day || 'Saturday',
          time: b.time || '09:00',
          duration_mins: b.duration_mins || 60,
          monthly_fee: b.monthly_fee > 0 ? String(b.monthly_fee) : '',
          max_students: b.max_students > 0 ? String(b.max_students) : '',
          accepting_new: b.accepting_new ?? true,
          trial_type: b.trial_type || 'none',
          trial_fee: b.trial_fee > 0 ? String(b.trial_fee) : '',
        })),
      })),
    })
    setEditingSubjectIdx(idx)
  }

  async function saveEditSubject(idx: number) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const subjectEntry = subjects[idx]

    // ── 1. Detect batches being removed and warn if students enrolled ────
    const existingBatchIds = subjectEntry.grades
      .flatMap(g => g.batches ?? [])
      .filter(b => b.id)
      .map(b => b.id as string)

    const remainingBatchIds = new Set(
      editDraft.grades.flatMap(g => g.batches).filter(b => b.id).map(b => b.id as string)
    )

    const removedBatchIds = existingBatchIds.filter(id => !remainingBatchIds.has(id))

    if (removedBatchIds.length > 0) {
      const { count } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .in('batch_id', removedBatchIds)
        .eq('status', 'active')

      if ((count ?? 0) > 0) {
        const removedNames = subjectEntry.grades
          .flatMap(g => g.batches ?? [])
          .filter(b => b.id && removedBatchIds.includes(b.id as string))
          .map(b => b.name)

        const proceed = await new Promise<boolean>(resolve => {
          setBatchOrphanWarning({ batchNames: removedNames, studentCount: count!, resolve })
        })
        setBatchOrphanWarning(null)
        if (!proceed) return
      }
    }

    // ── 2. Build updated grades ──────────────────────────────────────────
    const updatedGrades = editDraft.grades.map((g) => ({
      grade: g.grade,
      has_individual: g.has_individual,
      individual_fee: g.has_individual ? (parseInt(g.individual_fee) || 0) : 0,
      individual_duration_mins: g.individual_duration_mins,
      individual_slots: g.individual_slots || [],
      taking_new_individual: g.taking_new_individual,
      individual_trial_type: g.has_individual ? g.individual_trial_type : 'none' as const,
      individual_trial_fee: g.has_individual && g.individual_trial_type === 'paid' ? (parseInt(g.individual_trial_fee) || 0) : 0,
      has_group: g.has_group,
      batches: g.has_group ? g.batches.map(b => ({
        ...(b.id ? { id: b.id } : {}),
        name: b.name.trim(),
        day: b.day,
        time: b.time,
        duration_mins: b.duration_mins,
        monthly_fee: parseInt(b.monthly_fee) || 0,
        max_students: parseInt(b.max_students) || 0,
        accepting_new: b.accepting_new,
        trial_type: b.trial_type,
        trial_fee: b.trial_type === 'paid' ? (parseInt(b.trial_fee) || 0) : 0,
      })) : [],
    }))

    const resolvedSubjectName = editDraft.subjectName.trim() || subjectEntry.subject
    const newSubjects = subjects.map((s, i) =>
      i === idx ? { ...s, subject: resolvedSubjectName, grades: updatedGrades } : s
    )

    // ── 3. Save to DB ────────────────────────────────────────────────────
    const { error: tutorUpdateErr } = await supabase.from('tutors').update({ subjects: newSubjects }).eq('id', user.id)
    if (tutorUpdateErr) {
      console.error('[settings] Failed to save subjects:', tutorUpdateErr)
      setSubjectsError('Could not save. Please try again.')
      return
    }

    // Sync batches table: delete then re-insert for this subject.
    // ── If the delete succeeds but the re-insert then fails, the tutor
    //    would otherwise lose every batch for this subject with no
    //    indication — so both steps are checked, and on failure we leave
    //    `subjects` (already saved above) as the source of truth and
    //    surface the error rather than silently updating local state as
    //    if the batches table were also in sync.
    const batchRows: Record<string, unknown>[] = []
    for (const g of updatedGrades) {
      if (g.has_group && g.batches.length > 0) {
        for (const b of g.batches) {
          batchRows.push({
            tutor_id: user.id,
            name: b.name,
            subject: subjectEntry.subject,
            grade: g.grade,
            schedule_day: b.day,
            schedule_time: b.time,
            session_duration_mins: b.duration_mins,
            max_students: b.max_students,
            monthly_fee: b.monthly_fee,
            accepting_new: b.accepting_new,
            status: 'active',
          })
        }
      }
    }

    const { error: deleteErr } = await supabase.from('batches')
      .delete()
      .eq('tutor_id', user.id)
      .eq('subject', subjectEntry.subject)

    if (deleteErr) {
      console.error('[settings] Failed to sync batches (delete step):', deleteErr)
      setSubjectsError('Subject saved, but batches could not be updated. Please check your batches and try again.')
      return
    }

    if (batchRows.length > 0) {
      const { error: insertErr } = await supabase.from('batches').insert(batchRows)
      if (insertErr) {
        console.error('[settings] Failed to sync batches (re-insert step) — batches for this subject were deleted and NOT recreated:', insertErr)
        setSubjectsError('Subject saved, but your batches for this subject were lost while saving. Please recreate them and contact support.')
        return
      }
    }

    setSubjects(newSubjects)
    setEditingSubjectIdx(null)
    flashSaved(setSubjectsSaved)

    // ── 4. Check if any existing students have a different fee ───────────
    // Gather all new fees per grade/type
    const feeUpdates: { id: string; name: string; newFee: number }[] = []
    for (const g of updatedGrades) {
      if (g.has_individual && g.individual_fee > 0) {
        const { data: indStudents } = await supabase
          .from('students')
          .select('id, name, monthly_fee')
          .eq('tutor_id', user.id)
          .eq('subject', subjectEntry.subject)
          .eq('grade', g.grade)
          .eq('class_type', 'individual')
          .eq('status', 'active')
          .neq('monthly_fee', g.individual_fee)
        indStudents?.forEach(s => feeUpdates.push({ id: s.id, name: s.name, newFee: g.individual_fee }))
      }
    }
    if (feeUpdates.length > 0) {
      setFeeSyncOffer({ updates: feeUpdates, subject: subjectEntry.subject })
    }
  }

  function toggleNewGrade(grade: string) {
    setNewSubjectGrades(prev => {
      const has = prev.some(g => g.grade === grade)
      return has
        ? prev.filter(g => g.grade !== grade)
        : [...prev, makeDefaultGradeDraft(grade)]
    })
  }

  async function addNewSubject() {
    const resolvedSubjectName = newSubjectName === 'Others' ? customSubjectName.trim() : newSubjectName
    if (!resolvedSubjectName || newSubjectGrades.length === 0) return
    const entry: SubjectEntry = {
      subject: resolvedSubjectName,
      grades: newSubjectGrades.map(g => ({
        grade: g.grade,
        has_individual: g.has_individual,
        individual_fee: parseInt(g.individual_fee) || 0,
        individual_duration_mins: g.individual_duration_mins,
        individual_slots: g.individual_slots || [],
        taking_new_individual: g.taking_new_individual,
        individual_trial_type: g.individual_trial_type,
        individual_trial_fee: g.individual_trial_type === 'paid' ? (parseInt(g.individual_trial_fee) || 0) : 0,
        has_group: g.has_group,
        batches: g.has_group ? g.batches.map(b => ({
          ...(b.id ? { id: b.id } : {}),
          name: b.name.trim(),
          day: b.day,
          time: b.time,
          duration_mins: b.duration_mins,
          monthly_fee: parseInt(b.monthly_fee) || 0,
          max_students: parseInt(b.max_students) || 0,
          accepting_new: b.accepting_new,
          trial_type: b.trial_type,
          trial_fee: b.trial_type === 'paid' ? (parseInt(b.trial_fee) || 0) : 0,
        })) : [],
      })),
    }
    const newSubjects = [...subjects, entry]
    setSubjectsLoading(true)

    // Save subjects JSONB
    const ok = await updateTutor({ subjects: newSubjects })
    if (!ok) { setSubjectsLoading(false); setSubjectsError('Could not save. Please try again.'); return }

    // Also insert batch rows into the batches table for any group batches
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const batchRows: Record<string, unknown>[] = []
      for (const g of entry.grades) {
        if (g.has_group && g.batches.length > 0) {
          for (const b of g.batches) {
            batchRows.push({
              tutor_id: user.id,
              name: b.name,
              subject: entry.subject,
              grade: g.grade,
              schedule_day: b.day,
              schedule_time: b.time,
              session_duration_mins: b.duration_mins,
              max_students: b.max_students,
              monthly_fee: b.monthly_fee,
              accepting_new: b.accepting_new,
              status: 'active',
            })
          }
        }
      }
      if (batchRows.length > 0) {
        await supabase.from('batches').insert(batchRows)
      }
    }

    setSubjectsLoading(false)
    setSubjects(newSubjects)
    setNewSubjectName('')
    setCustomSubjectName('')
    setCustomGradeInput('')
    setNewSubjectGrades([])
    setAddingSubject(false)
    flashSaved(setSubjectsSaved)
  }


  // ── Payments save ───────────────────────────────────────────────────────

  async function handleSavePayments() {
    setPaymentsError('')
    setPaymentsLoading(true)

    // Switching INTO manual mode resets the one-time Dashboard hint so it
    // shows again — the tutor is re-entering a mode they may need the
    // explainer for, even if they saw it during a previous manual period.
    const switchingToManual = (tutor?.auto_notify_overdue ?? true) === true && autoNotify === false

    const ok = await updateTutor({
      payment_instructions: paymentInstructions.trim(),
      monthly_due_date: Number(monthlyDueDate),
      grace_period_days: Number(gracePeriod),
      auto_notify_overdue: autoNotify,
      ...(switchingToManual && { manual_mode_hint_seen: false }),
    })
    setPaymentsLoading(false)
    if (!ok) { setPaymentsError('Could not save. Please try again.'); return }
    setTutor(prev => prev ? {
      ...prev,
      payment_instructions: paymentInstructions.trim(),
      monthly_due_date: Number(monthlyDueDate),
      grace_period_days: Number(gracePeriod),
      auto_notify_overdue: autoNotify,
      ...(switchingToManual && { manual_mode_hint_seen: false }),
    } : prev)
    setPaymentsEditing(false)
    flashSaved(setPaymentsSaved)
  }

  function cancelPaymentsEdit() {
    setPaymentInstructions(tutor?.payment_instructions ?? '')
    if (tutor?.monthly_due_date) {
      const validDates = ['5', '10', '15', '20', '25', '28'] as const
      const asStr = String(tutor.monthly_due_date) as (typeof validDates)[number]
      setMonthlyDueDate(validDates.includes(asStr) ? asStr : '5')
    }
    setGracePeriod(String(tutor?.grace_period_days ?? 5) as '3' | '5' | '7')
    setAutoNotify(tutor?.auto_notify_overdue ?? true)
    setPaymentsError('')
    setPaymentsEditing(false)
  }

  // ── Preferences save ────────────────────────────────────────────────────

  async function handleSavePreferences() {
    setPrefsError('')
    setWaPhoneError('')
    const country = findCountry(waCountry)
    if (waNumber) {
      const err = validatePhone(waNumber, country)
      if (err) { setWaPhoneError(err); return }
    }
    if (rescheduleOpt === 'custom' && !rescheduleCustom.trim()) {
      setPrefsError('Please enter your custom reschedule policy.')
      return
    }
    if (noshowOpt === 'custom' && !noshowCustom.trim()) {
      setPrefsError('Please enter your custom no-show policy.')
      return
    }
    setPrefsLoading(true)
    const fullPhone = waNumber ? `${country.dialCode}${waNumber}` : null
    const reschedulePolicyValue = rescheduleOpt === 'custom' ? rescheduleCustom.trim() : rescheduleOpt
    const noshowPolicyValue = noshowOpt === 'custom' ? noshowCustom.trim() : noshowOpt
    const ok = await updateTutor({
      whatsapp_number: fullPhone,
      reschedule_policy: reschedulePolicyValue,
      noshow_policy: noshowPolicyValue,
      notification_prefs: { events: notifPrefs },
    })
    setPrefsLoading(false)
    if (!ok) { setPrefsError('Could not save. Please try again.'); return }
    setTutor(prev => prev ? { ...prev, whatsapp_number: fullPhone, reschedule_policy: reschedulePolicyValue, noshow_policy: noshowPolicyValue, notification_prefs: { events: notifPrefs } } : prev)
    setPrefsEditing(false)
    flashSaved(setPrefsSaved)
  }

  function cancelPrefsEdit() {
    const row = tutor
    if (row?.whatsapp_number) {
      const raw = String(row.whatsapp_number).replace(/^\+/, '')
      const country = COUNTRIES_LIST.find(c => ('+' + raw).startsWith(c.dialCode))
      if (country) { setWaCountry(country.code); setWaNumber(raw.slice(country.dialCode.replace('+', '').length)) }
      else setWaNumber(raw)
    } else { setWaNumber(''); setWaCountry(DEFAULT_COUNTRY.code) }
    if (row?.reschedule_policy) {
      const p = row.reschedule_policy
      if (p === 'none' || p === 'auto_24h' || p === 'auto_48h') { setRescheduleOpt(p); setRescheduleCustom('') }
      else { setRescheduleOpt('custom'); setRescheduleCustom(p) }
    } else { setRescheduleOpt('auto_24h'); setRescheduleCustom('') }
    if (row?.noshow_policy) {
      const p = row.noshow_policy
      if (p === 'forfeit' || p === 'reschedule') { setNoshowOpt(p as NoshowOption); setNoshowCustom('') }
      else { setNoshowOpt('custom'); setNoshowCustom(p) }
    } else { setNoshowOpt('forfeit'); setNoshowCustom('') }
    setNotifPrefs(makeNotifPrefs(row?.notification_prefs?.events))
    setWaPhoneError('')
    setPrefsError('')
    setPrefsEditing(false)
  }

  // ── Nav scroll helper ───────────────────────────────────────────────────

  function handleNavClick(id: Section) {
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Fee sync handler ─────────────────────────────────────────────────────

  async function applyFeeSync() {
    if (!feeSyncOffer) return
    setFeeSyncing(true)
    const supabase = createClient()
    const failed: string[] = []
    for (const s of feeSyncOffer.updates) {
      const { error } = await supabase.from('students').update({ monthly_fee: s.newFee }).eq('id', s.id)
      if (error) {
        console.error(`[settings] Fee sync failed for student ${s.id} (${s.name}):`, error)
        failed.push(s.name)
      }
    }
    setFeeSyncing(false)
    setFeeSyncOffer(null)
    if (failed.length > 0) {
      setSubjectsError(
        `Fee updated for ${feeSyncOffer.updates.length - failed.length} of ${feeSyncOffer.updates.length} students. Failed: ${failed.join(', ')}.`,
      )
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
    {/* ── Batch orphan warning modal ───────────────────────────────────── */}
    {batchOrphanWarning && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[4px]">
        <div className="bg-white rounded-[18px] shadow-[0_8px_32px_rgba(0,0,0,0.18)] w-full max-w-md p-6">
          <div className="w-10 h-10 rounded-full bg-[#fff5f5] flex items-center justify-center mb-4">
            <AlertTriangle size={18} className="text-[#c92a2a]" />
          </div>
          <h3 className="text-[1rem] font-extrabold text-[#1a1a2e] mb-1">Students still enrolled</h3>
          <p className="text-[#6c757d] text-sm mb-3 leading-relaxed">
            <strong className="text-[#c92a2a]">{batchOrphanWarning.studentCount} active student{batchOrphanWarning.studentCount !== 1 ? 's' : ''}</strong> are enrolled in{' '}
            {batchOrphanWarning.batchNames.length === 1
              ? <strong>&quot;{batchOrphanWarning.batchNames[0]}&quot;</strong>
              : <strong>{batchOrphanWarning.batchNames.join(', ')}</strong>}.
            Removing this batch will leave them without a class. Their records won&apos;t be deleted but their batch assignment will be lost.
          </p>
          <p className="text-[#adb5bd] text-[0.75rem] mb-5">Reassign or remove them from the Students page first.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => batchOrphanWarning.resolve(false)}
              className="flex-1 bg-[#f1f3f5] hover:bg-[#e9ecef] text-[#343a40] font-semibold text-sm py-2.5 rounded-[10px] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => batchOrphanWarning.resolve(true)}
              className="flex-1 bg-[#c92a2a] hover:bg-[#b52626] text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all"
            >
              Remove anyway
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Fee sync offer banner ─────────────────────────────────────────── */}
    {feeSyncOffer && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
        <div className="bg-[#0e1f3b] rounded-[14px] px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.25)] flex items-start gap-4">
          <div className="w-9 h-9 rounded-[10px] bg-[#748ffc]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <CreditCard size={16} className="text-[#748ffc]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[0.84rem] font-bold">Fee updated — sync existing students?</p>
            <p className="text-white/50 text-[0.72rem] mt-0.5">
              {feeSyncOffer.updates.length} student{feeSyncOffer.updates.length !== 1 ? 's' : ''} in <strong className="text-white/70">{feeSyncOffer.subject}</strong> still have their old fee.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 mt-0.5">
            <button
              type="button"
              onClick={() => setFeeSyncOffer(null)}
              className="text-white/40 hover:text-white text-[0.72rem] font-semibold px-3 py-1.5 rounded-[8px] transition-colors"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={applyFeeSync}
              disabled={feeSyncing}
              className="bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white text-[0.75rem] font-bold px-4 py-1.5 rounded-[8px] transition-all shadow-[0_2px_8px_rgba(59,91,219,0.4)]"
            >
              {feeSyncing ? 'Updating…' : 'Update all'}
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="flex gap-6 items-start">
      {/* ── Left nav (desktop) ── */}
      <aside className="hidden lg:block w-52 flex-shrink-0 sticky top-6">
        <div
          className="bg-white border border-[#dee2e6] rounded-[18px] p-3"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <p className="text-[0.56rem] font-bold text-[#adb5bd] font-mono uppercase tracking-[0.12em] px-2 mb-2">
            Settings
          </p>
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavClick(id as Section)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-left text-[0.78rem] font-medium transition-all ${
                  activeSection === id
                    ? 'bg-[rgba(59,91,219,0.12)] text-[#748ffc] border border-[rgba(59,91,219,0.2)]'
                    : 'text-[#6c757d] hover:bg-[#f8f9fa] hover:text-[#1a1a2e]'
                }`}
              >
                <Icon size={14} className="flex-shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1">
            Settings
          </h1>
          <p className="text-[#6c757d] text-sm">
            Manage your profile, subjects, schedule and preferences.
          </p>
        </div>

        {/* Mobile tab strip */}
        <div className="lg:hidden overflow-x-auto pb-3 mb-4">
          <div className="flex gap-2 min-w-max">
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavClick(id as Section)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all ${
                  activeSection === id
                    ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                    : 'bg-white text-[#6c757d] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {dataLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            {/* ── 1. Profile ── */}
            <SectionCard
              id="profile"
              icon={User}
              title="Profile"
              subtitle="Your name, email and mobile number"
              action={!profileEditing ? (
                <button
                  type="button"
                  onClick={() => setProfileEditing(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#3b5bdb] border border-[#dbe4ff] bg-[#edf2ff] hover:bg-[#dbe4ff] px-3 py-1.5 rounded-full transition-all"
                >
                  <Pencil size={11} /> Edit
                </button>
              ) : undefined}
            >
              {!profileEditing ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Full name</dt>
                    <dd className="text-sm font-medium text-[#1a1a2e]">{profileName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Email address</dt>
                    <dd className="text-sm font-medium text-[#1a1a2e]">{currentEmail || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Mobile number</dt>
                    <dd className="text-sm font-medium text-[#1a1a2e]">
                      {profilePhone ? `${findCountry(profileCountry).dialCode} ${profilePhone}` : '—'}
                    </dd>
                  </div>
                  {profileSaved && <SavedToast visible />}
                </dl>
              ) : (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Full name</FieldLabel>
                    <InlineInput
                      value={profileName}
                      onChange={v => { setProfileName(v); setProfileError('') }}
                      placeholder="e.g. Kamal Perera"
                      hasError={!!profileError && !profileName.trim()}
                    />
                  </div>
                  <div>
                    <FieldLabel>Email address</FieldLabel>
                    <div className="flex items-center gap-3 px-3 py-[9px] border-[1.5px] border-[#dee2e6] rounded-[10px] bg-[#f8f9fa]">
                      <span className="text-[0.82rem] text-[#6c757d] flex-1 truncate">{currentEmail || '—'}</span>
                      <button type="button" onClick={() => setShowEmailModal(true)} className="text-[0.68rem] text-[#3b5bdb] font-semibold hover:underline flex-shrink-0">Change</button>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Mobile number</FieldLabel>
                    <div className="flex items-center gap-3 px-3 py-[9px] border-[1.5px] border-[#dee2e6] rounded-[10px] bg-[#f8f9fa]">
                      <span className="text-[0.82rem] text-[#6c757d] flex-1">
                        {profilePhone ? `${findCountry(profileCountry).dialCode} ${profilePhone}` : '—'}
                      </span>
                      <button type="button" onClick={() => setShowPhoneModal(true)} className="text-[0.68rem] text-[#3b5bdb] font-semibold hover:underline flex-shrink-0">
                        {profilePhone ? 'Change' : 'Add phone number'}
                      </button>
                    </div>
                  </div>
                  {profileError && <p className="text-[#c92a2a] text-xs">{profileError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <SaveButton loading={profileLoading} saved={false} onClick={handleSaveProfile} />
                    <button
                      type="button"
                      onClick={cancelProfileEdit}
                      className="px-4 py-2.5 text-sm font-semibold text-[#6c757d] border border-[#ced4da] rounded-[10px] hover:border-[#1a1a2e] hover:text-[#1a1a2e] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ── 2. Subjects & Fees ── */}
            <SectionCard id="subjects" icon={BookOpen} title="Subjects & Fees" subtitle="Edit the subjects and fees you offer">
              <div className="space-y-3 mb-4">
                {subjects.length === 0 ? (
                  <div className="border border-dashed border-[#dee2e6] rounded-[12px] py-6 text-center">
                    <p className="text-[#adb5bd] text-sm">No subjects added yet.</p>
                    <button
                      type="button"
                      onClick={() => setAddingSubject(true)}
                      className="mt-2 text-[#3b5bdb] text-xs font-semibold hover:underline"
                    >
                      Add your first subject
                    </button>
                  </div>
                ) : (
                  subjects.map((s, idx) => (
                    <SubjectCard
                      key={`${s.subject}-${idx}`}
                      entry={s}
                      isEditing={editingSubjectIdx === idx}
                      editDraft={editingSubjectIdx === idx ? editDraft : null}
                      onEdit={() => startEditSubject(idx)}
                      onSaveEdit={() => saveEditSubject(idx)}
                      onCancelEdit={() => setEditingSubjectIdx(null)}
                      onRemove={() => setConfirmRemoveIdx(idx)}
                      onEditDraftChange={setEditDraft}
                      confirmingRemove={confirmRemoveIdx === idx}
                      onConfirmRemove={() => removeSubject(idx)}
                      onCancelRemove={() => setConfirmRemoveIdx(null)}
                      makeDefaultBatchDraft={makeDefaultBatchDraft}
                    />
                  ))
                )}
              </div>

              {/* Add new subject panel */}
              {addingSubject ? (
                <div className="border border-[#dbe4ff] bg-[#edf2ff]/40 rounded-[14px] p-4 space-y-3 mb-4">
                  <p className="text-[0.78rem] font-bold text-[#3b5bdb]">Add subject</p>

                  <div>
                    <FieldLabel>Subject</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {SUBJECTS.filter(s => s !== 'Others').map(sub => {
                        const alreadyAdded = subjects.some(s => s.subject === sub)
                        const selected = newSubjectName === sub
                        return (
                          <button
                            key={sub}
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => { setNewSubjectName(sub); setCustomSubjectName(''); setNewSubjectGrades([]) }}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                              selected
                                ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                                : alreadyAdded
                                ? 'bg-[#f1f3f5] text-[#adb5bd] border-[#dee2e6] cursor-not-allowed'
                                : 'bg-white text-[#343a40] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                            }`}
                          >
                            {sub}
                            {alreadyAdded && <span className="ml-1 text-[0.6rem]">(added)</span>}
                          </button>
                        )
                      })}
                      {/* Other / custom subject */}
                      <button
                        type="button"
                        onClick={() => { setNewSubjectName('Others'); setCustomSubjectName(''); setNewSubjectGrades([]) }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          newSubjectName === 'Others'
                            ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                            : 'bg-white text-[#343a40] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                        }`}
                      >
                        Other
                      </button>
                    </div>
                    {newSubjectName === 'Others' && (
                      <input
                        type="text"
                        placeholder="Enter subject name (e.g. Art, Drama, Robotics)"
                        value={customSubjectName}
                        onChange={e => setCustomSubjectName(e.target.value)}
                        className="mt-2 w-full border border-[#ced4da] rounded-[8px] px-3 py-[7px] text-[0.8rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none bg-white focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                        autoFocus
                      />
                    )}
                  </div>

                  {(newSubjectName === 'Others' ? customSubjectName.trim() : newSubjectName) && (
                    <div>
                      <FieldLabel>Grade levels</FieldLabel>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {GRADES.map(grade => {
                          const sel = newSubjectGrades.some(g => g.grade === grade)
                          return (
                            <button
                              key={grade}
                              type="button"
                              onClick={() => toggleNewGrade(grade)}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                sel
                                  ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                                  : 'bg-white text-[#6c757d] border-[#ced4da] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                              }`}
                            >
                              {grade}
                            </button>
                          )
                        })}
                        {/* Custom grades already added */}
                        {newSubjectGrades.filter(g => !GRADES.includes(g.grade)).map(g => (
                          <button
                            key={g.grade}
                            type="button"
                            onClick={() => toggleNewGrade(g.grade)}
                            className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all bg-[#3b5bdb] text-white border-[#3b5bdb]"
                          >
                            {g.grade}
                          </button>
                        ))}
                        {/* Add custom grade */}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="Other grade…"
                            value={customGradeInput}
                            onChange={e => setCustomGradeInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && customGradeInput.trim()) {
                                e.preventDefault()
                                const g = customGradeInput.trim()
                                if (!newSubjectGrades.some(x => x.grade === g)) toggleNewGrade(g)
                                setCustomGradeInput('')
                              }
                            }}
                            className="border border-[#ced4da] rounded-full px-3 py-1 text-xs w-28 outline-none focus:border-[#3b5bdb] bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const g = customGradeInput.trim()
                              if (g && !newSubjectGrades.some(x => x.grade === g)) toggleNewGrade(g)
                              setCustomGradeInput('')
                            }}
                            className="text-[#3b5bdb] border border-[#dbe4ff] bg-[#edf2ff] rounded-full px-2.5 py-1 text-xs font-bold hover:bg-[#3b5bdb] hover:text-white transition-colors"
                          >
                            + Add
                          </button>
                        </div>
                      </div>

                      {newSubjectGrades.map((g, gi) => (
                        <div key={g.grade} className="mb-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#3b5bdb]" />
                            <span className="text-[#1a1a2e] text-xs font-bold">{g.grade}</span>
                          </div>
                          <GradeEditFields
                            draft={g}
                            onChange={(updated) => {
                              setNewSubjectGrades(prev => prev.map((x, xi) => xi === gi ? updated : x))
                            }}
                            makeDefaultBatchDraft={makeDefaultBatchDraft}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={addNewSubject}
                      disabled={subjectsLoading || !(newSubjectName === 'Others' ? customSubjectName.trim() : newSubjectName) || newSubjectGrades.length === 0}
                      className="flex items-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-[8px] transition-all"
                    >
                      {subjectsLoading && (
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      )}
                      {subjectsLoading ? 'Saving…' : 'Add subject'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingSubject(false); setNewSubjectName(''); setCustomSubjectName(''); setCustomGradeInput(''); setNewSubjectGrades([]) }}
                      className="bg-[#f1f3f5] hover:bg-[#e9ecef] text-[#6c757d] text-xs font-semibold px-4 py-2 rounded-[8px] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingSubject(true)}
                  className="flex items-center gap-1.5 text-[#3b5bdb] text-xs font-semibold hover:underline mb-4"
                >
                  <Plus size={13} />
                  Add subject
                </button>
              )}

              {subjectsError && <p className="text-[#c92a2a] text-xs mt-2">{subjectsError}</p>}
              {subjectsSaved && (
                <div className="flex items-center gap-1.5 text-[#2f9e44] text-xs font-semibold mt-2">
                  <span className="w-4 h-4 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center flex-shrink-0">
                    <Check size={10} strokeWidth={3} />
                  </span>
                  Saved
                </div>
              )}
            </SectionCard>

            {/* ── 3. Payments ── */}
            <SectionCard
              id="payments"
              icon={CreditCard}
              title="Payments"
              subtitle="Payment instructions, monthly due date and grace period"
              action={!paymentsEditing ? (
                <button
                  type="button"
                  onClick={() => setPaymentsEditing(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#3b5bdb] border border-[#dbe4ff] bg-[#edf2ff] hover:bg-[#dbe4ff] px-3 py-1.5 rounded-full transition-all"
                >
                  <Pencil size={11} /> Edit
                </button>
              ) : undefined}
            >
              {!paymentsEditing ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Payment instructions</dt>
                    <dd className="text-sm text-[#1a1a2e] font-mono whitespace-pre-wrap leading-relaxed">
                      {paymentInstructions
                        ? (paymentInstructions.length > 120 ? paymentInstructions.slice(0, 120) + '…' : paymentInstructions)
                        : <span className="text-[#adb5bd] not-italic font-sans">Not set</span>}
                    </dd>
                  </div>
                  <div className="flex gap-8 flex-wrap">
                    <div>
                      <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Monthly due date</dt>
                      <dd className="text-sm font-medium text-[#1a1a2e]">{monthlyDueDate === '28' ? '28th' : `${monthlyDueDate}th`} of month</dd>
                    </div>
                    <div>
                      <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Grace period</dt>
                      <dd className="text-sm font-medium text-[#1a1a2e]">{gracePeriod} days</dd>
                    </div>
                    <div>
                      <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Payment reminders</dt>
                      <dd className="text-sm font-medium text-[#1a1a2e]">{autoNotify ? 'Sent automatically' : 'Manual — notify me only'}</dd>
                    </div>
                  </div>
                  {paymentsSaved && <SavedToast visible />}
                </dl>
              ) : (
                <div className="space-y-5">
                  {/* Payment instructions */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#f1f3f5]">
                      <div className="w-6 h-6 rounded-[6px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <FileText size={12} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">Payment Instructions</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-2">
                      Bank details, eZCash or cash instructions — students receive these when their booking is confirmed.
                    </p>
                    <textarea
                      placeholder={'Bank: Commercial Bank\nAccount: 1234567890\nName: Kamal Perera\n\nOr eZCash: 077 XXX XXXX'}
                      value={paymentInstructions}
                      onChange={e => { setPaymentInstructions(e.target.value); setPaymentsError('') }}
                      rows={5}
                      maxLength={500}
                      className="w-full border-[1.5px] border-[#ced4da] rounded-[10px] px-3 py-[9px] text-[0.82rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] font-mono"
                    />
                    <p className="text-right text-[0.68rem] text-[#adb5bd] mt-1">{paymentInstructions.length}/500</p>
                  </div>

                  {/* Monthly due date */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#f1f3f5]">
                      <div className="w-6 h-6 rounded-[6px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <Calendar size={12} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">Monthly Due Date</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-2">Day of the month fees are due. Students will be reminded automatically.</p>
                    <div className="flex flex-wrap gap-2">
                      {(['5', '10', '15', '20', '25', '28'] as const).map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setMonthlyDueDate(d)}
                          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
                            monthlyDueDate === d
                              ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.2)]'
                              : 'bg-white text-[#6c757d] border-[#ced4da] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                          }`}
                        >
                          {d === '28' ? '28th' : `${d}th`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grace period */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#f1f3f5]">
                      <div className="w-6 h-6 rounded-[6px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={12} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">Grace Period Before Access is Blocked</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-3">After this many days overdue, Zoom links stop being sent to the student.</p>
                    <div className="space-y-2">
                      {([
                        { value: '3' as const, label: '3 days', sublabel: 'Quick — good for strict payment discipline' },
                        { value: '5' as const, label: '5 days (Recommended)', sublabel: 'Balanced — allows for bank transfer delays' },
                        { value: '7' as const, label: '7 days', sublabel: 'Lenient — better for long-term students' },
                      ]).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setGracePeriod(opt.value)}
                          className={`w-full text-left rounded-[12px] border px-4 py-3 transition-all duration-150 ${
                            gracePeriod === opt.value
                              ? 'border-[#3b5bdb] bg-[#edf2ff] shadow-[0_0_0_1px_#3b5bdb]'
                              : 'border-[#dee2e6] bg-white hover:border-[#3b5bdb] hover:bg-[#f8f9ff]'
                          }`}
                        >
                          <p className={`text-sm font-semibold ${gracePeriod === opt.value ? 'text-[#3b5bdb]' : 'text-[#1a1a2e]'}`}>{opt.label}</p>
                          <p className="text-xs text-[#6c757d] mt-0.5">{opt.sublabel}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment reminders — auto-notify consent */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#f1f3f5]">
                      <div className="w-6 h-6 rounded-[6px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <Bell size={12} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">Payment Reminders</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-3">
                      This applies to all reminder stages — 3-day-before, due date, and overdue.
                    </p>
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
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${autoNotify ? 'border-[#3b5bdb]' : 'border-[#ced4da]'}`}>
                            {autoNotify && <div className="w-2 h-2 rounded-full bg-[#3b5bdb]" />}
                          </div>
                          <div>
                            <p className={`text-sm font-semibold leading-none mb-0.5 ${autoNotify ? 'text-[#3b5bdb]' : 'text-[#1a1a2e]'}`}>Yes, send automatically</p>
                            <p className="text-xs text-[#6c757d] mt-0.5">We&apos;ll message students for you at 3 days before, on the due date, and if payment is overdue.</p>
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
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${!autoNotify ? 'border-[#3b5bdb]' : 'border-[#ced4da]'}`}>
                            {!autoNotify && <div className="w-2 h-2 rounded-full bg-[#3b5bdb]" />}
                          </div>
                          <div>
                            <p className={`text-sm font-semibold leading-none mb-0.5 ${!autoNotify ? 'text-[#3b5bdb]' : 'text-[#1a1a2e]'}`}>No, just notify me</p>
                            <p className="text-xs text-[#6c757d] mt-0.5">I&apos;ll review and decide when to send each reminder myself.</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {paymentsError && <p className="text-[#c92a2a] text-xs">{paymentsError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <SaveButton loading={paymentsLoading} saved={false} onClick={handleSavePayments} />
                    <button
                      type="button"
                      onClick={cancelPaymentsEdit}
                      className="px-4 py-2.5 text-sm font-semibold text-[#6c757d] border border-[#ced4da] rounded-[10px] hover:border-[#1a1a2e] hover:text-[#1a1a2e] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ── 4. Preferences ── */}
            <SectionCard
              id="preferences"
              icon={SlidersHorizontal}
              title="Preferences"
              subtitle="WhatsApp number, class policies and notifications"
              action={!prefsEditing ? (
                <button
                  type="button"
                  onClick={() => setPrefsEditing(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#3b5bdb] border border-[#dbe4ff] bg-[#edf2ff] hover:bg-[#dbe4ff] px-3 py-1.5 rounded-full transition-all"
                >
                  <Pencil size={11} /> Edit
                </button>
              ) : undefined}
            >
              {!prefsEditing ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">WhatsApp number</dt>
                    <dd className="text-sm font-medium text-[#1a1a2e]">
                      {waNumber ? `${findCountry(waCountry).dialCode} ${waNumber}` : <span className="text-[#adb5bd]">—</span>}
                    </dd>
                  </div>
                  <div className="flex gap-8 flex-wrap">
                    <div>
                      <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Reschedule policy</dt>
                      <dd className="text-sm font-medium text-[#1a1a2e]">
                        {rescheduleOpt === 'none' ? 'No rescheduling allowed'
                          : rescheduleOpt === 'auto_24h' ? '24 hours notice required'
                          : rescheduleOpt === 'auto_48h' ? '48 hours notice required'
                          : 'Custom policy'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">No-show policy</dt>
                      <dd className="text-sm font-medium text-[#1a1a2e]">
                        {noshowOpt === 'forfeit' ? 'Class is forfeited'
                          : noshowOpt === 'reschedule' ? 'One makeup class allowed per month'
                          : 'Custom policy'}
                      </dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-[0.68rem] font-semibold text-[#adb5bd] uppercase tracking-wide mb-0.5">Notifications</dt>
                    <dd className="text-sm font-medium text-[#1a1a2e]">{NOTIF_EVENTS.length} events configured</dd>
                  </div>
                  {prefsSaved && <SavedToast visible />}
                </dl>
              ) : (
                <div className="space-y-7">

                  {/* WhatsApp number */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#f1f3f5]">
                      <div className="w-7 h-7 rounded-[7px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <MessageCircle size={14} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">WhatsApp Number</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-3 leading-relaxed">
                      Students will message this number to book classes and get Zoom links automatically.
                      This must be a WhatsApp number you actively use.
                    </p>
                    <div className="flex gap-2">
                      <CountryDialSelect
                        value={waCountry}
                        onChange={code => { setWaCountry(code); setWaNumber(''); setWaPhoneError('') }}
                        hasError={!!waPhoneError}
                      />
                      <input
                        type="tel"
                        placeholder={waCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                        value={waNumber}
                        onChange={e => { setWaNumber(e.target.value.replace(/\D/g, '')); setWaPhoneError('') }}
                        className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                          waPhoneError
                            ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                            : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                        }`}
                      />
                    </div>
                    {waPhoneError && <p className="mt-1.5 text-[#c92a2a] text-xs">{waPhoneError}</p>}
                  </div>

                  {/* Reschedule policy */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#f1f3f5]">
                      <div className="w-7 h-7 rounded-[7px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <RotateCcw size={14} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">Reschedule Policy</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-3">This is shared with students when they book. What&apos;s your reschedule policy?</p>
                    <div className="space-y-2">
                      <RadioCard
                        label="No rescheduling allowed"
                        desc="Classes cannot be rescheduled once booked"
                        selected={rescheduleOpt === 'none'}
                        onClick={() => setRescheduleOpt('none')}
                      />
                      <RadioCard
                        label="24 hours notice required"
                        desc="Students can reschedule if they give at least 24 hours notice"
                        selected={rescheduleOpt === 'auto_24h'}
                        onClick={() => setRescheduleOpt('auto_24h')}
                        recommended
                      />
                      <RadioCard
                        label="48 hours notice required"
                        desc="Stricter — 2 day advance notice required to reschedule"
                        selected={rescheduleOpt === 'auto_48h'}
                        onClick={() => setRescheduleOpt('auto_48h')}
                      />
                      <RadioCard
                        label="Custom policy"
                        desc="Write your own reschedule rules"
                        selected={rescheduleOpt === 'custom'}
                        onClick={() => setRescheduleOpt('custom')}
                      />
                    </div>
                    {rescheduleOpt === 'custom' && (
                      <div className="mt-3">
                        <textarea
                          placeholder="e.g. Students must request reschedule at least 24 hours before the class and it will be reviewed case by case."
                          value={rescheduleCustom}
                          onChange={e => { setRescheduleCustom(e.target.value); setPrefsError('') }}
                          rows={3}
                          className="w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                        />
                      </div>
                    )}
                  </div>

                  {/* No-show policy */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#f1f3f5]">
                      <div className="w-7 h-7 rounded-[7px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <UserX size={14} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">No-show Policy</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-3">What happens if a student misses a class without notice?</p>
                    <div className="space-y-2">
                      <RadioCard
                        label="Class is forfeited"
                        desc="Unattended sessions count as used — no refund or makeup class"
                        selected={noshowOpt === 'forfeit'}
                        onClick={() => setNoshowOpt('forfeit')}
                      />
                      <RadioCard
                        label="One makeup class allowed per month"
                        desc="Automatically offers one makeup slot for no-shows"
                        selected={noshowOpt === 'reschedule'}
                        onClick={() => setNoshowOpt('reschedule')}
                      />
                      <RadioCard
                        label="Custom policy"
                        desc="Write your own no-show rules"
                        selected={noshowOpt === 'custom'}
                        onClick={() => setNoshowOpt('custom')}
                      />
                    </div>
                    {noshowOpt === 'custom' && (
                      <div className="mt-3">
                        <textarea
                          placeholder="e.g. First no-show per month gets a makeup class. Subsequent no-shows forfeit the session."
                          value={noshowCustom}
                          onChange={e => { setNoshowCustom(e.target.value); setPrefsError('') }}
                          rows={3}
                          className="w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Notifications */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#f1f3f5]">
                      <div className="w-7 h-7 rounded-[7px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                        <Bell size={14} className="text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">Notifications</h3>
                    </div>
                    <p className="text-[#6c757d] text-xs mb-4">Choose how you want to be notified for each event.</p>
                    <div className="flex justify-end gap-1 pr-1 mb-1">
                      {(['app', 'whatsapp', 'both'] as NotifChannel[]).map(ch => (
                        <span key={ch} className="w-[68px] text-center text-[0.58rem] font-bold text-[#adb5bd] font-mono uppercase tracking-wide">
                          {ch === 'app' ? 'App' : ch === 'whatsapp' ? 'WhatsApp' : 'Both'}
                        </span>
                      ))}
                    </div>
                    <div className="border border-[#dee2e6] rounded-[12px] divide-y divide-[#f1f3f5]">
                      {NOTIF_EVENTS.map(({ key, icon: EvIcon, label, desc }) => (
                        <div key={key} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <div className="w-7 h-7 rounded-[7px] bg-[#edf2ff] flex items-center justify-center flex-shrink-0 mt-0.5">
                              <EvIcon size={13} className="text-[#3b5bdb]" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-[#1a1a2e] leading-none mb-0.5">{label}</p>
                              <p className="text-[0.7rem] text-[#adb5bd] leading-tight">{desc}</p>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {(['app', 'whatsapp', 'both'] as NotifChannel[]).map(ch => {
                              const active = notifPrefs[key] === ch
                              return (
                                <button
                                  key={ch}
                                  type="button"
                                  onClick={() => setNotifPrefs(prev => ({ ...prev, [key]: ch }))}
                                  className={`w-[68px] py-1.5 rounded-[8px] text-xs font-semibold transition-all duration-150 ${
                                    active
                                      ? 'bg-[#3b5bdb] text-white shadow-[0_2px_6px_rgba(59,91,219,0.25)]'
                                      : 'bg-[#f1f3f5] text-[#6c757d] hover:bg-[#e9ecef]'
                                  }`}
                                >
                                  {ch === 'app' ? 'App' : ch === 'whatsapp' ? 'WA' : 'Both'}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {prefsError && <p className="text-[#c92a2a] text-xs">{prefsError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <SaveButton loading={prefsLoading} saved={false} onClick={handleSavePreferences} />
                    <button
                      type="button"
                      onClick={cancelPrefsEdit}
                      className="px-4 py-2.5 text-sm font-semibold text-[#6c757d] border border-[#ced4da] rounded-[10px] hover:border-[#1a1a2e] hover:text-[#1a1a2e] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>

          </>
        )}
      </div>

      {/* Email change modal */}
      {showEmailModal && (
        <EmailChangeModal
          currentEmail={currentEmail || 'tutor@example.com'}
          onClose={() => setShowEmailModal(false)}
          onSuccess={handleEmailChanged}
        />
      )}

      {/* Phone change modal (heading switches to "Add phone number" when none is on file) */}
      {showPhoneModal && (
        <PhoneChangeModal
          currentPhone={profilePhone ? `${findCountry(profileCountry).dialCode}${profilePhone}` : ''}
          currentCountry={profileCountry}
          onClose={() => setShowPhoneModal(false)}
          onSuccess={handlePhoneChanged}
        />
      )}
    </div>
    </>
  )
}

// ── SubjectCard ───────────────────────────────────────────────────────────────

// Inline-editable subject card showing subject name, grades and fees.
// Read view: individual block + each batch as its own card.
// Edit mode: full GradeEditFields per grade.

function SubjectCard({
  entry,
  isEditing,
  editDraft,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onEditDraftChange,
  confirmingRemove,
  onConfirmRemove,
  onCancelRemove,
  makeDefaultBatchDraft,
}: {
  entry: SubjectEntry
  isEditing: boolean
  editDraft: SubjectEditDraft | null
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onRemove: () => void
  onEditDraftChange: (d: SubjectEditDraft) => void
  confirmingRemove: boolean
  onConfirmRemove: () => void
  onCancelRemove: () => void
  makeDefaultBatchDraft: () => BatchDraft
}) {
  return (
    <div className="border border-[#dbe4ff] bg-[#edf2ff]/30 rounded-[14px] p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[#3b5bdb] text-sm font-bold">{entry.subject}</span>
        <div className="flex items-center gap-1.5">
          {!isEditing && !confirmingRemove && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#3b5bdb] border border-[#dbe4ff] bg-[#edf2ff] hover:bg-[#dbe4ff] px-3 py-1.5 rounded-full transition-all"
              >
                <Pencil size={11} /> Edit
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#c92a2a] border border-[#ffc9c9] bg-[#fff5f5] hover:bg-[#ffc9c9]/40 px-3 py-1.5 rounded-full transition-all"
              >
                <Trash2 size={11} /> Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirm remove */}
      {confirmingRemove && (
        <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-3 py-2.5 mb-3 flex items-center justify-between gap-3">
          <p className="text-[#c92a2a] text-xs font-semibold">Remove {entry.subject}?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirmRemove}
              className="bg-[#c92a2a] hover:bg-[#a61e1e] text-white text-xs font-semibold px-3 py-1.5 rounded-[6px] transition-colors"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={onCancelRemove}
              className="bg-[#f1f3f5] hover:bg-[#e9ecef] text-[#6c757d] text-xs font-semibold px-3 py-1.5 rounded-[6px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isEditing ? (
        // ── Read view ──────────────────────────────────────────────────────
        <div className="space-y-4">
          {entry.grades.map(g => (
            <div key={g.grade}>
              {/* Grade header */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3b5bdb]" />
                <span className="text-[0.78rem] font-bold text-[#1a1a2e]">{g.grade}</span>
              </div>

              <div className="space-y-2 pl-3.5">
                {/* Individual block */}
                {g.has_individual && (
                  <div className="bg-white border border-[#dee2e6] rounded-[10px] px-3 py-2.5">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[#adb5bd] mb-1.5">Individual</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                        LKR {g.individual_fee.toLocaleString()}/session
                      </span>
                      <span className="bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                        {g.individual_duration_mins} min
                      </span>
                      {(g.individual_slots || []).map((sl, si) => (
                        <span key={si} className="bg-[#f1f3f5] text-[#343a40] border border-[#dee2e6] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          {sl.day} {sl.time}
                        </span>
                      ))}
                      {g.taking_new_individual ? (
                        <span className="bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Accepting new
                        </span>
                      ) : (
                        <span className="bg-[#fff9db] text-[#e67700] border border-[#ffec99] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Not accepting
                        </span>
                      )}
                      {(g.individual_trial_type ?? 'none') === 'none' && (
                        <span className="bg-[#f1f3f5] text-[#adb5bd] border border-[#dee2e6] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          No trial
                        </span>
                      )}
                      {g.individual_trial_type === 'free' && (
                        <span className="bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Free trial
                        </span>
                      )}
                      {g.individual_trial_type === 'paid' && (
                        <span className="bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Trial LKR {(g.individual_trial_fee ?? 0).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Batch blocks */}
                {g.has_group && (g.batches || []).map((b, bi) => (
                  <div key={bi} className="bg-white border border-[#dee2e6] rounded-[10px] px-3 py-2.5">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[#adb5bd] mb-0.5">Group</p>
                    <p className="text-[0.8rem] font-bold text-[#1a1a2e] mb-1.5">{b.name || `Batch ${bi + 1}`}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="bg-[#f1f3f5] text-[#343a40] border border-[#dee2e6] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                        {b.day} {b.time}
                      </span>
                      <span className="bg-[#f1f3f5] text-[#343a40] border border-[#dee2e6] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                        {b.duration_mins} min · max {b.max_students}
                      </span>
                      <span className="bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                        LKR {b.monthly_fee.toLocaleString()}/mo
                      </span>
                      {b.accepting_new ? (
                        <span className="bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Accepting new
                        </span>
                      ) : (
                        <span className="bg-[#fff9db] text-[#e67700] border border-[#ffec99] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Not accepting
                        </span>
                      )}
                      {(b.trial_type ?? 'none') === 'none' && (
                        <span className="bg-[#f1f3f5] text-[#adb5bd] border border-[#dee2e6] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          No trial
                        </span>
                      )}
                      {b.trial_type === 'free' && (
                        <span className="bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Free trial
                        </span>
                      )}
                      {b.trial_type === 'paid' && (
                        <span className="bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold">
                          Trial LKR {(b.trial_fee ?? 0).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Nothing enabled */}
                {!g.has_individual && !g.has_group && (
                  <span className="text-[#adb5bd] text-xs italic">No classes configured</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── Edit view ──────────────────────────────────────────────────────
        <div className="space-y-4">
          {/* Editable subject name — only for custom (non-standard) subjects */}
          {editDraft && !SUBJECTS.filter(s => s !== 'Others').includes(entry.subject) && (
            <div>
              <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">Subject name</label>
              <input
                type="text"
                value={editDraft.subjectName}
                onChange={e => onEditDraftChange({ ...editDraft, subjectName: e.target.value })}
                className="w-full border border-[#ced4da] rounded-[8px] px-3 py-[7px] text-[0.8rem] text-[#1a1a2e] outline-none bg-white focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
              />
            </div>
          )}
          {editDraft?.grades.map((g, gi) => (
            <div key={g.grade}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3b5bdb]" />
                <span className="text-[#1a1a2e] text-xs font-bold">{g.grade}</span>
              </div>
              <GradeEditFields
                draft={g}
                onChange={(updated) => {
                  const grades = [...(editDraft?.grades ?? [])]
                  grades[gi] = updated
                  onEditDraftChange({ ...editDraft, grades })
                }}
                makeDefaultBatchDraft={makeDefaultBatchDraft}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onSaveEdit}
              className="flex items-center gap-1.5 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white text-sm font-semibold px-5 py-2.5 rounded-[10px] shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:translate-y-[-1px] transition-all"
            >
              <Check size={13} />
              Save
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-4 py-2.5 text-sm font-semibold text-[#6c757d] border border-[#ced4da] rounded-[10px] hover:border-[#1a1a2e] hover:text-[#1a1a2e] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── GradeEditFields ───────────────────────────────────────────────────────────

// Full per-grade edit panel: individual + group toggles, batch CRUD.

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180] as const

const DAYS_LIST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} hr${h > 1 ? 's' : ''}` : `${h}.5 hrs`
}

function GradeEditFields({
  draft,
  onChange,
  makeDefaultBatchDraft,
}: {
  draft: GradeDraft
  onChange: (updated: GradeDraft) => void
  makeDefaultBatchDraft: () => BatchDraft
}) {
  const [slotDay, setSlotDay] = useState(DAYS_LIST[5])
  const [slotTime, setSlotTime] = useState('09:00')

  const inputCls = 'w-full border border-[#ced4da] rounded-[8px] px-3 py-[7px] text-[0.8rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-white focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
  const secLabel = 'text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[#adb5bd] mb-2'

  function addSlot() {
    const already = draft.individual_slots.some(s => s.day === slotDay && s.time === slotTime)
    if (already) return
    onChange({ ...draft, individual_slots: [...draft.individual_slots, { day: slotDay, time: slotTime }] })
  }

  function removeSlot(si: number) {
    onChange({ ...draft, individual_slots: draft.individual_slots.filter((_, i) => i !== si) })
  }

  function updateBatch(bi: number, patch: Partial<BatchDraft>) {
    const batches = draft.batches.map((b, i) => i === bi ? { ...b, ...patch } : b)
    onChange({ ...draft, batches })
  }

  function removeBatch(bi: number) {
    const batches = draft.batches.filter((_, i) => i !== bi)
    const has_group = batches.length > 0
    onChange({ ...draft, batches, has_group })
  }

  function addBatch() {
    onChange({ ...draft, batches: [...draft.batches, makeDefaultBatchDraft()], has_group: true })
  }

  const TrialSegment = ({
    value,
    onChange: onChangeTrial,
  }: {
    value: TrialTypeDraft
    onChange: (v: TrialTypeDraft) => void
  }) => (
    <div className="flex items-center gap-0.5 bg-white border border-[#ced4da] rounded-[8px] p-0.5 w-fit">
      {(['none', 'free', 'paid'] as TrialTypeDraft[]).map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChangeTrial(t)}
          className={`text-[0.68rem] font-semibold px-2.5 py-1 rounded-[6px] transition-all ${
            value === t ? 'bg-[#3b5bdb] text-white shadow-sm' : 'text-[#6c757d] hover:text-[#1a1a2e]'
          }`}
        >
          {t === 'none' ? 'No Trial' : t === 'free' ? 'Free Trial' : 'Paid Trial'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      {/* ── Individual sub-section ── */}
      <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded-[12px] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className={secLabel}>Individual Classes</p>
          <Toggle
            checked={draft.has_individual}
            onChange={v => onChange({ ...draft, has_individual: v })}
          />
        </div>

        {draft.has_individual && (
          <div className="space-y-2.5 mt-2">
            {/* Fee */}
            <div>
              <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">
                Fee (LKR/session)
              </label>
              <input
                type="number"
                placeholder="e.g. 3500"
                value={draft.individual_fee}
                onChange={e => onChange({ ...draft, individual_fee: e.target.value })}
                min="1"
                className={inputCls}
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">
                Session duration
              </label>
              <select
                value={String(draft.individual_duration_mins)}
                onChange={e => onChange({ ...draft, individual_duration_mins: parseInt(e.target.value) })}
                className={inputCls}
              >
                {DURATION_OPTIONS.map(d => (
                  <option key={d} value={String(d)}>{durationLabel(d)}</option>
                ))}
              </select>
            </div>

            {/* Accepting new */}
            <div className="flex items-center justify-between bg-white border border-[#dee2e6] rounded-[8px] px-3 py-2">
              <span className="text-[0.78rem] font-medium text-[#1a1a2e]">Accepting new students</span>
              <Toggle
                checked={draft.taking_new_individual}
                onChange={v => onChange({ ...draft, taking_new_individual: v })}
              />
            </div>

            {/* Trial */}
            <div>
              <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1.5">Trial class</label>
              <TrialSegment
                value={draft.individual_trial_type}
                onChange={v => onChange({ ...draft, individual_trial_type: v })}
              />
              {draft.individual_trial_type === 'paid' && (
                <input
                  type="number"
                  placeholder="Trial fee (LKR)"
                  value={draft.individual_trial_fee}
                  onChange={e => onChange({ ...draft, individual_trial_fee: e.target.value })}
                  min="1"
                  className={`mt-2 ${inputCls}`}
                />
              )}
              {draft.individual_trial_type === 'free' && (
                <p className="mt-1 text-[#2f9e44] text-xs font-medium">First class free — no payment needed.</p>
              )}
            </div>

            {/* Available time slots */}
            <div>
              <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1.5">
                Available time slots
                <span className="ml-1 text-[#adb5bd] font-normal">(when you&apos;re free for individual bookings)</span>
              </label>

              {/* Existing slot chips */}
              {draft.individual_slots.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {draft.individual_slots.map((sl, si) => (
                    <span
                      key={si}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.68rem] font-semibold bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff]"
                    >
                      {sl.day.slice(0, 3)} · {TIME_OPTIONS.find(t => t.value === sl.time)?.label ?? sl.time}
                      <button
                        type="button"
                        onClick={() => removeSlot(si)}
                        className="ml-0.5 text-[#3b5bdb] hover:text-[#c92a2a] transition-colors leading-none"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {draft.individual_slots.length === 0 && (
                <p className="text-[0.7rem] text-[#c92a2a] font-medium mb-2">No slots added — add at least one.</p>
              )}

              {/* Add slot row */}
              <div className="flex items-center gap-2">
                <select
                  value={slotDay}
                  onChange={e => setSlotDay(e.target.value)}
                  className="flex-1 border border-[#ced4da] rounded-[8px] px-2.5 py-[6px] text-[0.78rem] text-[#1a1a2e] bg-white outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                >
                  {DAYS_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <TimeSelect value={slotTime} onChange={setSlotTime} className="flex-1" />
                <button
                  type="button"
                  onClick={addSlot}
                  className="flex items-center gap-1 px-3 py-[6px] rounded-[8px] bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] font-bold text-xs hover:bg-[#3b5bdb] hover:text-white transition-colors flex-shrink-0"
                >
                  <Plus size={11} />
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {!draft.has_individual && (
          <p className="text-[#adb5bd] text-xs italic">Toggle on to offer individual sessions.</p>
        )}
      </div>

      {/* ── Group sub-section ── */}
      <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded-[12px] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className={secLabel}>Group Classes</p>
          <Toggle
            checked={draft.has_group}
            onChange={v => {
              if (v && draft.batches.length === 0) {
                onChange({ ...draft, has_group: true, batches: [makeDefaultBatchDraft()] })
              } else {
                onChange({ ...draft, has_group: v })
              }
            }}
          />
        </div>

        {draft.has_group && (
          <div className="space-y-3 mt-2">
            {draft.batches.map((b, bi) => (
              <BatchEditCard
                key={b.draftId}
                batch={b}
                index={bi}
                isOnlyBatch={draft.batches.length === 1}
                onUpdate={patch => updateBatch(bi, patch)}
                onRemove={() => removeBatch(bi)}
                inputCls={inputCls}
              />
            ))}

            <button
              type="button"
              onClick={addBatch}
              className="flex items-center gap-1 border border-[#3b5bdb] text-[#3b5bdb] bg-white rounded-full font-bold text-xs px-3 py-1.5 hover:bg-[#edf2ff] transition-colors"
            >
              <Plus size={11} />
              Add batch
            </button>
          </div>
        )}

        {!draft.has_group && (
          <p className="text-[#adb5bd] text-xs italic">Toggle on to set up group classes.</p>
        )}
      </div>
    </div>
  )
}

// ── BatchEditCard ─────────────────────────────────────────────────────────────

function BatchEditCard({
  batch,
  index,
  isOnlyBatch,
  onUpdate,
  onRemove,
  inputCls,
}: {
  batch: BatchDraft
  index: number
  isOnlyBatch: boolean
  onUpdate: (patch: Partial<BatchDraft>) => void
  onRemove: () => void
  inputCls: string
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  const headerLabel = `Batch ${index + 1}${batch.name.trim() ? ` — ${batch.name.trim()}` : ''}`

  const TrialSegment = ({ value, onChange }: { value: TrialTypeDraft; onChange: (v: TrialTypeDraft) => void }) => (
    <div className="flex items-center gap-0.5 bg-white border border-[#ced4da] rounded-[8px] p-0.5 w-fit">
      {(['none', 'free', 'paid'] as TrialTypeDraft[]).map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`text-[0.68rem] font-semibold px-2.5 py-1 rounded-[6px] transition-all ${
            value === t ? 'bg-[#3b5bdb] text-white shadow-sm' : 'text-[#6c757d] hover:text-[#1a1a2e]'
          }`}
        >
          {t === 'none' ? 'No Trial' : t === 'free' ? 'Free Trial' : 'Paid Trial'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="bg-white border border-[#dee2e6] rounded-[12px] p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[0.72rem] font-bold text-[#1a1a2e]">{headerLabel}</span>
        <button
          type="button"
          onClick={() => isOnlyBatch ? setConfirmRemove(true) : onRemove()}
          className="w-5 h-5 rounded-full bg-[#fff5f5] hover:bg-[#ffc9c9] text-[#c92a2a] flex items-center justify-center transition-colors text-xs font-bold flex-shrink-0"
          aria-label={`Remove batch ${index + 1}`}
        >
          &times;
        </button>
      </div>

      {/* Last-batch confirm */}
      {confirmRemove && (
        <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[8px] px-2.5 py-2 space-y-1.5">
          <p className="text-[#c92a2a] text-xs font-semibold">Remove this batch? Group classes will be turned off.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setConfirmRemove(false); onRemove() }}
              className="px-2.5 py-1 bg-[#c92a2a] text-white text-xs font-bold rounded-[6px] hover:bg-[#a61e1e] transition-colors"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="px-2.5 py-1 border border-[#dee2e6] text-[#343a40] text-xs font-bold rounded-[6px] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Batch name */}
      <div>
        <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">Batch name</label>
        <input
          type="text"
          placeholder="e.g. 2027 A/L Batch, Morning Group…"
          value={batch.name}
          onChange={e => onUpdate({ name: e.target.value })}
          className={inputCls}
        />
      </div>

      {/* Monthly fee */}
      <div>
        <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">Monthly fee (LKR)</label>
        <input
          type="number"
          value={batch.monthly_fee}
          onChange={e => onUpdate({ monthly_fee: e.target.value })}
          min="1"
          className={inputCls}
        />
      </div>

      {/* Day + Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">Day</label>
          <select
            value={batch.day}
            onChange={e => onUpdate({ day: e.target.value })}
            className={inputCls}
          >
            {DAYS_LIST.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">Time</label>
          <TimeSelect value={batch.time} onChange={v => onUpdate({ time: v })} />
        </div>
      </div>

      {/* Duration + Max students */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">Duration</label>
          <select
            value={String(batch.duration_mins)}
            onChange={e => onUpdate({ duration_mins: parseInt(e.target.value) })}
            className={inputCls}
          >
            {([30, 45, 60, 90, 120, 150, 180] as const).map(d => (
              <option key={d} value={String(d)}>{durationLabel(d)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1">Max students</label>
          <input
            type="number"
            value={batch.max_students}
            onChange={e => onUpdate({ max_students: e.target.value })}
            min="2"
            className={inputCls}
          />
        </div>
      </div>

      {/* Accepting new */}
      <div className="flex items-center justify-between bg-[#f8f9fa] border border-[#dee2e6] rounded-[8px] px-3 py-2">
        <span className="text-[0.78rem] font-medium text-[#1a1a2e]">Accepting new students</span>
        <Toggle checked={batch.accepting_new} onChange={v => onUpdate({ accepting_new: v })} />
      </div>

      {/* Trial */}
      <div>
        <label className="block text-[#343a40] text-[0.68rem] font-semibold mb-1.5">Trial class</label>
        <TrialSegment value={batch.trial_type} onChange={v => onUpdate({ trial_type: v })} />
        {batch.trial_type === 'paid' && (
          <input
            type="number"
            placeholder="Trial fee (LKR)"
            value={batch.trial_fee}
            onChange={e => onUpdate({ trial_fee: e.target.value })}
            min="1"
            className={`mt-2 ${inputCls}`}
          />
        )}
        {batch.trial_type === 'free' && (
          <p className="mt-1 text-[#2f9e44] text-xs font-medium">First class free — no payment needed.</p>
        )}
      </div>
    </div>
  )
}

