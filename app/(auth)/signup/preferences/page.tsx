'use client'

// ✅ CURRENT: Step 4 of 4 — WhatsApp number, policies, notifications.
// On save: status set to 'active' + welcome email sent.
// 🚀 BEFORE LAUNCH: Wire Twilio WhatsApp Business API to activate bot on tutor's number.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { findCountry, validatePhone, DEFAULT_COUNTRY } from '@/lib/countries'
import { MessageCircle, RotateCcw, UserX, Bell, UserPlus, CreditCard, Clock, AlertCircle, HeadphonesIcon, BarChart3, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type NotifChannel = 'app' | 'whatsapp' | 'both'
type NotifPrefs   = Record<string, NotifChannel>

type Errors = {
  whatsapp?: string
  reschedule?: string
  noshow?: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const NOTIF_KEYS = ['new_enquiry', 'payment_received', 'class_reminder', 'no_show', 'bot_needs_help', 'weekly_summary', 'cap_warning'] as const

const NOTIF_ITEMS: { key: string; icon: LucideIcon; label: string; desc: string }[] = [
  { key: 'new_enquiry',      icon: UserPlus,        label: 'New student enquiry',     desc: 'When a student books via WhatsApp'             },
  { key: 'payment_received', icon: CreditCard,      label: 'Payment received',         desc: 'When a student confirms payment'               },
  { key: 'class_reminder',   icon: Clock,           label: 'Class in 30 minutes',      desc: 'Your own reminder before each session'         },
  { key: 'no_show',          icon: AlertCircle,     label: 'Student no-show detected', desc: 'When a student misses a class'                 },
  { key: 'bot_needs_help',   icon: HeadphonesIcon,  label: 'Needs your attention',     desc: 'When a conversation needs manual handling'     },
  { key: 'weekly_summary',   icon: BarChart3,       label: 'Weekly summary',           desc: 'Monday morning income and attendance report'   },
  { key: 'cap_warning',      icon: AlertTriangle,   label: 'Message cap at 80%',       desc: 'Before hitting your plan\'s WhatsApp limit'   },
]

function defaultNotifs(): NotifPrefs {
  return Object.fromEntries(NOTIF_KEYS.map(k => [k, 'both' as NotifChannel]))
}

const PREFS_DRAFT_KEY = 'smartclaz_prefs_draft'

function saveDraft(patch: Record<string, unknown>) {
  try {
    const current = JSON.parse(sessionStorage.getItem(PREFS_DRAFT_KEY) ?? '{}')
    sessionStorage.setItem(PREFS_DRAFT_KEY, JSON.stringify({ ...current, ...patch }))
  } catch { /* ignore */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(PREFS_DRAFT_KEY) } catch { /* ignore */ }
}

// ── Sub-components ─────────────────────────────────────────────────────────

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
              <div className={`flex-1 h-px mx-2 mb-4 ${done ? 'bg-[#3b5bdb]' : 'bg-[#dee2e6]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SectionHeading({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-[#f1f3f5]">
      {Icon && (
        <div className="w-7 h-7 rounded-[7px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
          <Icon size={14} className="text-white" />
        </div>
      )}
      <h2 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest">
        {children}
      </h2>
    </div>
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
          {selected && (
            <div className="w-2 h-2 rounded-full bg-[#3b5bdb]" />
          )}
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

// ── Page ───────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const router = useRouter()

  const [userId,       setUserId      ] = useState<string | null>(null)
  const [loginPhone,   setLoginPhone  ] = useState('')
  const [authChecking, setAuthChecking] = useState(true)

  // WhatsApp
  const [waNumber,  setWaNumber ] = useState('')
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY.code)

  // Reschedule policy
  // stored values: 'none' | 'auto_24h' | 'auto_48h' | custom text
  type RescheduleOption = 'none' | 'auto_24h' | 'auto_48h' | 'custom'
  const [rescheduleOpt,    setRescheduleOpt   ] = useState<RescheduleOption>('auto_24h')
  const [rescheduleCustom, setRescheduleCustom] = useState('')

  // No-show policy
  type NoshowOption = 'forfeit' | 'reschedule' | 'custom'
  const [noshowOpt,    setNoshowOpt   ] = useState<NoshowOption>('forfeit')
  const [noshowCustom, setNoshowCustom] = useState('')

  // Notifications
  const [notifs, setNotifs] = useState<NotifPrefs>(defaultNotifs())

  // UI
  const [saving,      setSaving     ] = useState(false)
  const [errors,      setErrors     ] = useState<Errors>({})
  const [saveError,   setSaveError  ] = useState('')
  const dataLoaded = useRef(false)

  // ── Persist draft to sessionStorage whenever form fields change ─────
  // Runs after every state update; skipped during initial data loading.
  useEffect(() => {
    if (!dataLoaded.current) return
    saveDraft({ waNumber, waCountry, rescheduleOpt, rescheduleCustom, noshowOpt, noshowCustom, notifs })
  }, [waNumber, waCountry, rescheduleOpt, rescheduleCustom, noshowOpt, noshowCustom, notifs])

  // ── Auth + load saved data ──────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/signup'); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('tutors')
        .select('phone, whatsapp_number, reschedule_policy, noshow_policy, notification_prefs')
        .eq('id', user.id)
        .single()

      // Load draft first — DB values below will override if already saved
      let draft: Record<string, unknown> = {}
      try { draft = JSON.parse(sessionStorage.getItem(PREFS_DRAFT_KEY) ?? '{}') } catch { /* ignore */ }

      if (draft.waNumber) { setWaNumber(draft.waNumber as string); setWaCountry((draft.waCountry as string) ?? DEFAULT_COUNTRY.code) }
      if (draft.rescheduleOpt)    setRescheduleOpt(draft.rescheduleOpt as RescheduleOption)
      if (draft.rescheduleCustom) setRescheduleCustom(draft.rescheduleCustom as string)
      if (draft.noshowOpt)        setNoshowOpt(draft.noshowOpt as NoshowOption)
      if (draft.noshowCustom)     setNoshowCustom(draft.noshowCustom as string)
      if (draft.notifs)           setNotifs(draft.notifs as NotifPrefs)

      if (data) {
        if (data.phone) setLoginPhone(data.phone)

        if (data.whatsapp_number) {
          const raw = String(data.whatsapp_number).replace(/^\+/, '')
          if (raw.startsWith('94') && raw.length >= 11) {
            setWaCountry('LK')
            setWaNumber(raw.slice(2))
          } else {
            setWaNumber(raw)
          }
        }

        if (data.reschedule_policy) {
          const p = data.reschedule_policy as string
          if (p === 'none' || p === 'auto_24h' || p === 'auto_48h') {
            setRescheduleOpt(p)
          } else {
            setRescheduleOpt('custom')
            setRescheduleCustom(p)
          }
        }

        if (data.noshow_policy) {
          const p = data.noshow_policy as string
          if (p === 'forfeit' || p === 'reschedule') {
            setNoshowOpt(p as NoshowOption)
          } else {
            setNoshowOpt('custom')
            setNoshowCustom(p)
          }
        }

        if (data.notification_prefs && typeof data.notification_prefs === 'object') {
          const prefs = data.notification_prefs as Record<string, unknown>
          if (prefs.events) {
            setNotifs({ ...defaultNotifs(), ...(prefs.events as Partial<NotifPrefs>) } as NotifPrefs)
            clearDraft()
          }
        }
      }

      dataLoaded.current = true
      setAuthChecking(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ──────────────────────────────────────────────────────

  function validate(): Errors {
    const errs: Errors = {}
    const country = findCountry(waCountry)
    const phoneErr = validatePhone(waNumber, country)
    if (phoneErr) errs.whatsapp = phoneErr
    else if (!waNumber) errs.whatsapp = 'WhatsApp number is required'

    if (rescheduleOpt === 'custom' && !rescheduleCustom.trim()) {
      errs.reschedule = 'Please enter your reschedule policy'
    }
    if (noshowOpt === 'custom' && !noshowCustom.trim()) {
      errs.noshow = 'Please enter your no-show policy'
    }
    return errs
  }

  // ── Submit ──────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')

    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setSaving(true)

    const supabase   = createClient()
    const country    = findCountry(waCountry)
    const fullPhone  = `${country.dialCode}${waNumber}`

    const reschedulePolicy = rescheduleOpt === 'custom'
      ? rescheduleCustom.trim()
      : rescheduleOpt

    const noshowPolicy = noshowOpt === 'custom'
      ? noshowCustom.trim()
      : noshowOpt

    const notifPrefs = { events: notifs }

    const { error: updateErr } = await supabase
      .from('tutors')
      .update({
        whatsapp_number:   fullPhone,
        reschedule_policy: reschedulePolicy,
        noshow_policy:     noshowPolicy,
        notification_prefs: notifPrefs,
        status:            'active',
      })
      .eq('id', userId!)

    if (updateErr) {
      setSaving(false)
      setSaveError('Could not save your settings. Please try again.')
      return
    }

    // Fire-and-forget welcome email
    try {
      const { data: tutor } = await supabase
        .from('tutors')
        .select('name, email')
        .eq('id', userId!)
        .single()

      if (tutor?.name && tutor?.email) {
        fetch('/api/auth/welcome-email', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name: tutor.name, email: tutor.email }),
        }).catch(() => {/* fire and forget */})
      }
    } catch {
      // Non-fatal — welcome email failure never blocks onboarding
    }

    setSaving(false)
    clearDraft()
    router.push('/dashboard')
  }

  // ── Loading skeleton ────────────────────────────────────────────────

  if (authChecking) {
    return (
      <div className="w-full max-w-lg lg:max-w-2xl flex items-center justify-center py-20">
        <svg className="animate-spin w-6 h-6 text-[#3b5bdb]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  const loginPhoneNorm  = loginPhone.replace(/\D/g, '')
  const waPhoneNorm     = waNumber.replace(/\D/g, '')
  const sameAsLogin     = waPhoneNorm && loginPhoneNorm.endsWith(waPhoneNorm) && waPhoneNorm.length >= 7
  const waCountryData   = findCountry(waCountry)

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg lg:max-w-2xl pb-10">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
        <div className="lg:hidden"><StepProgress current={4} /></div>

        <div className="mb-7">
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            Almost done!
          </h1>
          <p className="text-[#6c757d] text-[0.84rem] leading-relaxed italic border-l-[3px] border-[#748ffc] pl-3">
            Set your WhatsApp number and class policies. You can change these anytime.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>

          {/* ── WhatsApp number ── */}
          <div>
            <SectionHeading icon={MessageCircle}>WhatsApp Number</SectionHeading>
            <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
              Your WhatsApp number <span className="text-[#c92a2a]">*</span>
            </label>
            <p className="text-[#6c757d] text-xs mb-3 leading-relaxed">
              Students will message this number to book classes and get Zoom links automatically.
              This must be a WhatsApp number you actively use.
            </p>
            <div className="flex gap-2">
              <CountryDialSelect
                value={waCountry}
                onChange={code => {
                  setWaCountry(code)
                  setWaNumber('')
                  setErrors(p => ({ ...p, whatsapp: undefined }))
                }}
                hasError={!!errors.whatsapp}
              />
              <input
                type="tel"
                placeholder={waCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                value={waNumber}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '')
                  setWaNumber(v)
                  if (errors.whatsapp) setErrors(p => ({ ...p, whatsapp: undefined }))
                }}
                maxLength={waCountryData.maxLength}
                className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                  errors.whatsapp
                    ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                    : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                }`}
              />
            </div>
            {errors.whatsapp && (
              <p className="mt-1.5 text-[#c92a2a] text-xs">{errors.whatsapp}</p>
            )}
            {sameAsLogin && !errors.whatsapp && (
              <p className="mt-2 text-[#6c757d] text-xs bg-[#f8f9fa] border border-[#dee2e6] rounded-[8px] px-3 py-2">
                This is the same as your login phone — that&apos;s fine. Make sure WhatsApp is active on this number.
              </p>
            )}
          </div>

          {/* ── Reschedule policy ── */}
          <div>
            <SectionHeading icon={RotateCcw}>Reschedule Policy</SectionHeading>
            <p className="text-[#6c757d] text-xs mb-3">
              This is shared with students when they book. What&apos;s your reschedule policy?
            </p>
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
                  onChange={e => {
                    setRescheduleCustom(e.target.value)
                    if (errors.reschedule) setErrors(p => ({ ...p, reschedule: undefined }))
                  }}
                  rows={3}
                  className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none ${
                    errors.reschedule
                      ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                      : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                  }`}
                />
                {errors.reschedule && (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{errors.reschedule}</p>
                )}
              </div>
            )}
          </div>

          {/* ── No-show policy ── */}
          <div>
            <SectionHeading icon={UserX}>No-show Policy</SectionHeading>
            <p className="text-[#6c757d] text-xs mb-3">
              What happens if a student misses a class without notice?
            </p>
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
                  onChange={e => {
                    setNoshowCustom(e.target.value)
                    if (errors.noshow) setErrors(p => ({ ...p, noshow: undefined }))
                  }}
                  rows={3}
                  className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none ${
                    errors.noshow
                      ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                      : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                  }`}
                />
                {errors.noshow && (
                  <p className="mt-1.5 text-[#c92a2a] text-xs">{errors.noshow}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Notifications ── */}
          <div>
            <SectionHeading icon={Bell}>Notifications</SectionHeading>
            <p className="text-[#6c757d] text-xs mb-4">
              Choose how you want to be notified for each event.
            </p>

            {/* Column headers */}
            <div className="flex justify-end gap-1 pr-1 mb-1">
              {(['app', 'whatsapp', 'both'] as NotifChannel[]).map(ch => (
                <span
                  key={ch}
                  className="w-[68px] text-center text-[0.58rem] font-bold text-[#adb5bd] font-mono uppercase tracking-wide"
                >
                  {ch === 'app' ? 'App' : ch === 'whatsapp' ? 'WhatsApp' : 'Both'}
                </span>
              ))}
            </div>

            <div className="border border-[#dee2e6] rounded-[12px] divide-y divide-[#f1f3f5]">
              {NOTIF_ITEMS.map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-[7px] bg-[#edf2ff] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={13} className="text-[#3b5bdb]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1a1a2e] leading-none mb-0.5">{label}</p>
                      <p className="text-[0.7rem] text-[#adb5bd] leading-tight">{desc}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {(['app', 'whatsapp', 'both'] as NotifChannel[]).map(ch => {
                      const active = notifs[key] === ch
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setNotifs(prev => ({ ...prev, [key]: ch }))}
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

          {saveError && (
            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
              <p className="text-[#c92a2a] text-xs font-semibold">{saveError}</p>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push('/signup/payments')}
              className="flex-shrink-0 px-5 py-2.5 border border-[#ced4da] rounded-[10px] text-sm font-semibold text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] hover:bg-[#edf2ff] transition-all duration-150"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Setting up your account…
                </span>
              ) : 'Complete setup  →  Go to dashboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
