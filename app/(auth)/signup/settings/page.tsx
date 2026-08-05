'use client'

// ✅ CURRENT: Step 5 of signup — policies, group settings, monthly payment, notifications, WhatsApp.
// 🚀 BEFORE LAUNCH: Wire Twilio WhatsApp Business API to connect tutor's WhatsApp number.
// 📝 NOTE: On successful save, status is set to 'active' and a welcome email is sent via
//    /api/auth/welcome-email (keeps RESEND_API_KEY server-only).
// 📝 NOTE: Availability and session duration/buffer are now collected in Step 4 (/signup/availability).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_COUNTRY, findCountry, validatePhone } from '@/lib/countries'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────

type SettingsErrors = {
  whatsappNumber?: string
}

type NotifChannel = 'app' | 'whatsapp' | 'both'
type NotifPrefs   = Record<string, NotifChannel>

type NotifPrefsPayload = {
  events: NotifPrefs
  daily_summary: boolean
  weekly_report: boolean
  group_min: string
  max_reschedules: string
}

const NOTIF_EVENTS: { key: string; label: string; desc: string }[] = [
  { key: 'new_booking',     label: 'New student enquiry',           desc: 'When a student completes onboarding via WhatsApp'  },
  { key: 'payment_pending', label: 'Payment pending verification',  desc: 'When a student says they have paid'                },
  { key: 'bot_needs_help',  label: 'Conversation needs your attention', desc: 'When a student conversation needs manual handling' },
  { key: 'class_reminder',  label: 'Class starting in 30 min',      desc: 'Your own reminder before each session'             },
  { key: 'payment_overdue', label: 'Student payment overdue',       desc: 'When a student passes the grace period'            },
]

// ── Initializers ───────────────────────────────────────────────────────────

function makeNotifPrefs(): NotifPrefs {
  return Object.fromEntries(NOTIF_EVENTS.map(e => [e.key, 'both' as NotifChannel]))
}

// ── Validation ─────────────────────────────────────────────────────────────

function validate(
  whatsappNumber: string,
  whatsappCountry: string,
): SettingsErrors {
  const errs: SettingsErrors = {}

  if (whatsappNumber) {
    const wc  = findCountry(whatsappCountry)
    const err = validatePhone(whatsappNumber, wc)
    if (err) errs.whatsappNumber = err
  }

  return errs
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StepProgress({ current }: { current: number }) {
  const steps = ['Profile', 'Subjects', 'Groups', 'Availability', 'Settings']
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
                  done   ? 'bg-[#3b5bdb] text-white'
                : active ? 'bg-[#3b5bdb] text-white ring-4 ring-[#edf2ff]'
                :          'bg-[#f1f3f5] text-[#adb5bd]'
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest mb-4 pb-2 border-b border-[#f1f3f5]">
      {children}
    </h2>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[#343a40] text-xs font-semibold mb-1.5">{children}</label>
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
          {labelMap ? labelMap[opt] ?? opt : opt}
        </button>
      ))}
    </div>
  )
}

const selectCls = 'w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] transition-all bg-white appearance-none'

// ── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()

  // Session preferences
  const [groupMinStudents, setGroupMinStudents] = useState<'1' | '3' | '5' | 'ask'>('3')

  // Policies
  const [reschedulePolicy, setReschedulePolicy] = useState('auto_24h')
  const [maxReschedules,   setMaxReschedules   ] = useState<'1' | '2' | 'unlimited'>('2')
  const [noShowPolicy,     setNoShowPolicy     ] = useState('forfeit')

  // Payment
  // ✅ CURRENT: 'null' means "Not applicable" — tutor charges per session, no monthly billing.
  //    When 'null' is selected, grace_period_days field is hidden and null is saved to DB.
  const [monthlyDueDate, setMonthlyDueDate] = useState<'null' | '1' | '5' | '10' | '15' | '20' | '25'>('5')
  const [gracePeriod,    setGracePeriod    ] = useState<'3' | '5' | '7'>('5')

  // Notifications
  const [notifPrefs,   setNotifPrefs  ] = useState<NotifPrefs>(makeNotifPrefs())
  const [dailySummary, setDailySummary] = useState(true)
  const [weeklyReport, setWeeklyReport] = useState(true)

  // Payment instructions
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [paymentInstErr,      setPaymentInstErr      ] = useState('')

  // WhatsApp
  // TODO BEFORE LAUNCH: Wire Twilio WhatsApp Business API
  // Save whatsapp_number to tutors table (already done below)
  // Connect via Twilio API to enable bot on this number
  const [whatsappNumber,  setWhatsappNumber ] = useState('')
  const [whatsappCountry, setWhatsappCountry] = useState(DEFAULT_COUNTRY.code)

  // UI state
  const [loading,      setLoading     ] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [errors,       setErrors      ] = useState<SettingsErrors>({})
  const [saveError,    setSaveError   ] = useState('')

  // ── Auth guard ──────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/signup')
      } else {
        setAuthChecking(false)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (authChecking) {
    return (
      <div className="w-full max-w-lg flex items-center justify-center py-20">
        <svg className="animate-spin w-6 h-6 text-[#3b5bdb]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  // ── Event handlers ──────────────────────────────────────────────────

  function setNotif(key: string, val: NotifChannel) {
    setNotifPrefs(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')

    if (!paymentInstructions.trim() || paymentInstructions.trim().length < 10) {
      setPaymentInstErr('Please add your payment instructions so students know how to pay you.')
      return
    }
    setPaymentInstErr('')

    const errs = validate(whatsappNumber, whatsappCountry)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setLoading(true)

    const notifPrefsPayload: NotifPrefsPayload = {
      events:          notifPrefs,
      daily_summary:   dailySummary,
      weekly_report:   weeklyReport,
      group_min:       groupMinStudents,
      max_reschedules: maxReschedules,
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      router.replace('/signup')
      return
    }

    const waCountry = findCountry(whatsappCountry)

    // ✅ CURRENT: Save null for monthly_due_date when "Not applicable" is selected.
    //    This means the tutor charges per session, not monthly — no due date tracking needed.
    const dueDateValue       = monthlyDueDate === 'null' ? null : Number(monthlyDueDate)
    const gracePeriodValue   = monthlyDueDate === 'null' ? null : Number(gracePeriod)

    const { error: updateErr } = await supabase
      .from('tutors')
      .update({
        reschedule_policy:    reschedulePolicy,
        noshow_policy:        noShowPolicy,
        monthly_due_date:     dueDateValue,
        grace_period_days:    gracePeriodValue,
        notification_prefs:   notifPrefsPayload,
        payment_instructions: paymentInstructions.trim(),
        whatsapp_number:      whatsappNumber
          ? `${waCountry.dialCode}${whatsappNumber}`
          : null,
        status: 'active',   // Step 5 complete — mark tutor as fully active
      })
      .eq('id', user.id)

    if (updateErr) {
      setLoading(false)
      setSaveError('Could not save your settings. Please try again.')
      return
    }

    // ✅ CURRENT: Send welcome email after successful setup completion.
    // 🚀 BEFORE LAUNCH: Ensure RESEND_API_KEY is set in .env.local.
    // 📝 NOTE: Fire and forget via API route — never blocks the redirect.
    try {
      const tutorRes = await supabase
        .from('tutors')
        .select('name, email')
        .eq('id', user.id)
        .single()

      if (tutorRes.data?.name && tutorRes.data?.email) {
        // Call server-side welcome email route (keeps RESEND_API_KEY server-only)
        fetch('/api/auth/welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:  tutorRes.data.name,
            email: tutorRes.data.email,
          }),
        }).catch(() => {/* fire and forget — ignore errors */})
      }
    } catch {
      // Non-fatal — welcome email failure never blocks onboarding completion
    }

    setLoading(false)
    router.push('/dashboard')
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg pb-10">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
        <StepProgress current={5} />

        <div className="mb-7">
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            Policies &amp; notifications
          </h1>
          <p className="text-[#6c757d] text-sm leading-relaxed">
            Set your class rules, payment policies, and how you want to be notified.
          </p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-2">
            Fields marked <span className="text-[#c92a2a] font-bold">*</span> are required
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>

          {/* ── Group class settings ── */}
          <div>
            <SectionHeading>Group class settings</SectionHeading>
            <div>
              <FieldLabel>Minimum students to run a group class</FieldLabel>
              <p className="text-[#6c757d] text-xs mb-1.5">
                If fewer students are enrolled, you will be asked before the batch is confirmed.
              </p>
              <PillGroup
                options={['1', '3', '5', 'ask'] as const}
                value={groupMinStudents}
                onChange={setGroupMinStudents}
                labelMap={{ '1': '1 student', '3': '3 students', '5': '5 students', 'ask': 'Ask me' }}
              />
            </div>
          </div>

          {/* ── Policies ── */}
          <div>
            <SectionHeading>Policies</SectionHeading>
            <div className="space-y-4">
              <div>
                <FieldLabel>Reschedule policy</FieldLabel>
                <select
                  value={reschedulePolicy}
                  onChange={e => setReschedulePolicy(e.target.value)}
                  className={selectCls}
                >
                  <option value="auto_24h">Allow up to 24 hours before — automatic</option>
                  <option value="auto_48h">Allow up to 48 hours before — automatic</option>
                  <option value="manual">Always ask me — manual approval</option>
                </select>
              </div>
              <div>
                <FieldLabel>Max reschedules per student per month</FieldLabel>
                <PillGroup
                  options={['1', '2', 'unlimited'] as const}
                  value={maxReschedules}
                  onChange={setMaxReschedules}
                  labelMap={{ '1': '1', '2': '2', 'unlimited': 'Unlimited' }}
                />
              </div>
              <div>
                <FieldLabel>No-show policy</FieldLabel>
                <select
                  value={noShowPolicy}
                  onChange={e => setNoShowPolicy(e.target.value)}
                  className={selectCls}
                >
                  <option value="forfeit">Forfeit class — no refund or reschedule</option>
                  <option value="reschedule">Offer reschedule automatically</option>
                  <option value="ask">Ask me each time</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Monthly payment settings ── */}
          <div>
            <SectionHeading>Monthly payment settings</SectionHeading>
            {/* ✅ CURRENT: "Not applicable" saves null to DB — for per-session tutors. */}
            {/* 📝 NOTE: Grace period is hidden when due date is "Not applicable". */}
            <div className="space-y-4">
              <div>
                <FieldLabel>Monthly fee due date</FieldLabel>
                <p className="text-[#6c757d] text-xs mb-2">
                  Select the day of the month when fees are due. Choose &quot;Not applicable&quot; if you charge per session only.
                </p>
                <PillGroup
                  options={['null', '1', '5', '10', '15', '20', '25'] as const}
                  value={monthlyDueDate}
                  onChange={setMonthlyDueDate}
                  labelMap={{
                    'null': 'Not applicable',
                    '1': '1st', '5': '5th', '10': '10th',
                    '15': '15th', '20': '20th', '25': '25th',
                  }}
                />
              </div>
              {/* ✅ CURRENT: Grace period only shown when a due date is selected. */}
              {monthlyDueDate !== 'null' && (
                <div>
                  <FieldLabel>Grace period before blocking access</FieldLabel>
                  <PillGroup
                    options={['3', '5', '7'] as const}
                    value={gracePeriod}
                    onChange={setGracePeriod}
                    labelMap={{ '3': '3 days', '5': '5 days', '7': '7 days' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Notification preferences ── */}
          <div>
            <SectionHeading>Notification preferences</SectionHeading>
            <p className="text-[#6c757d] text-xs mb-4">
              Choose how you want to be notified for each event.
            </p>

            {/* Per-event table */}
            <div className="space-y-1 mb-5">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto] gap-3 mb-2 pr-1">
                <span />
                <div className="flex gap-1">
                  {(['app', 'whatsapp', 'both'] as NotifChannel[]).map(ch => (
                    <span
                      key={ch}
                      className="w-[72px] text-center text-[0.6rem] font-bold text-[#adb5bd] font-mono uppercase tracking-wide"
                    >
                      {ch === 'app' ? 'App' : ch === 'whatsapp' ? 'WhatsApp' : 'Both'}
                    </span>
                  ))}
                </div>
              </div>

              {NOTIF_EVENTS.map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="grid grid-cols-[1fr_auto] gap-3 items-center py-2.5 px-3 rounded-[10px] hover:bg-[#f8f9fa] transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[#1a1a2e] leading-none mb-0.5">{label}</p>
                    <p className="text-[0.7rem] text-[#adb5bd] leading-tight">{desc}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {(['app', 'whatsapp', 'both'] as NotifChannel[]).map(ch => {
                      const active = notifPrefs[key] === ch
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setNotif(key, ch)}
                          className={`w-[72px] py-1.5 rounded-[8px] text-xs font-semibold transition-all duration-150 ${
                            active
                              ? 'bg-[#3b5bdb] text-white shadow-[0_2px_6px_rgba(59,91,219,0.3)]'
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

            {/* Summary toggles */}
            <div className="border border-[#dee2e6] rounded-[12px] divide-y divide-[#f1f3f5]">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e] leading-none mb-0.5">
                    Daily summary at 8 am
                  </p>
                  <p className="text-[0.7rem] text-[#adb5bd] leading-tight">
                    Overview of today&apos;s sessions and pending payments
                  </p>
                </div>
                <Toggle checked={dailySummary} onChange={setDailySummary} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e] leading-none mb-0.5">
                    Weekly income report
                  </p>
                  <p className="text-[0.7rem] text-[#adb5bd] leading-tight">
                    Sent every Monday — last week&apos;s earnings and collection rate
                  </p>
                </div>
                <Toggle checked={weeklyReport} onChange={setWeeklyReport} />
              </div>
            </div>
          </div>

          {/* ── Payment instructions ── */}
          <div>
            <SectionHeading>Payment instructions</SectionHeading>
            <p className="text-[#6c757d] text-xs mb-3">
              Bank details, eZCash or cash instructions — sent to students automatically after booking.
            </p>
            <textarea
              placeholder={'Bank: Commercial Bank\nAccount: 1234567890\nName: Kamal Perera\n\nOr eZCash: 077 XXX XXXX'}
              value={paymentInstructions}
              onChange={e => {
                setPaymentInstructions(e.target.value)
                if (paymentInstErr) setPaymentInstErr('')
              }}
              rows={4}
              className={`w-full border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all resize-none ${
                paymentInstErr
                  ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                  : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
              }`}
            />
            {paymentInstErr && (
              <p className="mt-1.5 text-[#c92a2a] text-xs">{paymentInstErr}</p>
            )}
          </div>

          {/* ── WhatsApp Business ── */}
          {/* TODO: Profile photo upload
              - Allowed types: image/jpeg, image/png, image/webp only
              - Max size: 2MB
              - Convert to WebP + resize to 400x400 (use sharp library)
              - Strip EXIF data
              - Generate filename: tutorId + '-' + Date.now() + '.webp'
              - Upload to Supabase Storage bucket: 'tutor-avatars'
              - Validate MIME type from file buffer, NOT filename extension
              - Never use original filename (path traversal risk)
              - Store URL in tutors.avatar_url
          */}
          <div>
            <SectionHeading>WhatsApp Business</SectionHeading>
            {/* ✅ CURRENT: WhatsApp Business number — optional at signup, can be set from dashboard. */}
            {/* 🚀 BEFORE LAUNCH: Wire Twilio WhatsApp Business API to enable automated responses. */}
            <p className="text-[#6c757d] text-xs mb-4">
              Your students message this number as always. Smartclaz handles everything behind the scenes.
            </p>
            <FieldLabel>
              WhatsApp Business number{' '}
              <span className="text-[#adb5bd] font-normal">(optional — you can connect from the dashboard later)</span>
            </FieldLabel>
            <div className="flex gap-2">
              <CountryDialSelect
                value={whatsappCountry}
                onChange={code => {
                  setWhatsappCountry(code)
                  setWhatsappNumber('')
                  setErrors(p => ({ ...p, whatsappNumber: undefined }))
                }}
                hasError={!!errors.whatsappNumber}
              />
              <input
                type="tel"
                placeholder={whatsappCountry === 'LK' ? '77 123 4567' : 'Phone number'}
                value={whatsappNumber}
                onChange={e => {
                  setWhatsappNumber(e.target.value.replace(/\D/g, ''))
                  if (errors.whatsappNumber) setErrors(p => ({ ...p, whatsappNumber: undefined }))
                }}
                maxLength={findCountry(whatsappCountry).maxLength}
                className={`flex-1 border rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                  errors.whatsappNumber
                    ? 'border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'
                    : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
                }`}
              />
            </div>
            {errors.whatsappNumber && (
              <p className="mt-1.5 text-[#c92a2a] text-xs">{errors.whatsappNumber}</p>
            )}
          </div>

          {saveError && (
            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
              <p className="text-[#c92a2a] text-xs font-semibold">{saveError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-3 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </span>
            ) : 'Complete setup  →  Go to dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
