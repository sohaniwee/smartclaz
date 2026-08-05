'use client'

// Step 4 of 5 — availability for new individual students only
// NOT for existing students (those come via CSV import later)
// NOT for batch schedules (those are already in batches table)

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────

interface FreeSlot {
  day: string
  time: string
  duration_mins: number
}

type BatchSummary = {
  name: string
  subject: string
  grade: string
  schedule_day: string
  schedule_time: string
  accepting_new: boolean
}

type SlotDraft = {
  day: string
  time: string
  duration: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 5; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break
      const hh    = String(h).padStart(2, '0')
      const mm    = String(m).padStart(2, '0')
      const ampm  = h >= 12 ? 'PM' : 'AM'
      const hr    = h % 12 || 12
      opts.push({ value: `${hh}:${mm}`, label: `${hr}:${mm} ${ampm}` })
    }
  }
  return opts
})()

const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: '30',  label: '30 min'    },
  { value: '45',  label: '45 min'    },
  { value: '60',  label: '1 hour'    },
  { value: '90',  label: '1.5 hours' },
  { value: '120', label: '2 hours'   },
  { value: '150', label: '2.5 hours' },
  { value: '180', label: '3 hours'   },
  { value: '210', label: '3.5 hours' },
  { value: '240', label: '4 hours'   },
  { value: '270', label: '4.5 hours' },
  { value: '300', label: '5 hours'   },
]

// ── StepProgress ───────────────────────────────────────────────────────────

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

// ── Toggle ─────────────────────────────────────────────────────────────────

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

// ── PillGroup ──────────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────────────

export default function AvailabilitySignupPage() {
  const router = useRouter()

  const [freeSlots,          setFreeSlots         ] = useState<FreeSlot[]>([])
  const [slotDraft,          setSlotDraft         ] = useState<SlotDraft>({ day: '', time: '', duration: '60' })
  const [slotError,          setSlotError         ] = useState('')
  const [takingNewIndividual, setTakingNewIndividual] = useState(true)
  const [sessionDuration,    setSessionDuration   ] = useState<'60' | '90' | '120'>('60')
  const [buffer,             setBuffer            ] = useState<'15' | '30'>('15')
  const [batchSummary,       setBatchSummary      ] = useState<BatchSummary[]>([])
  const [teachingStyle,      setTeachingStyle     ] = useState<string | null>(null)
  const [authChecking,       setAuthChecking      ] = useState(true)
  const [loading,            setLoading           ] = useState(false)
  const [saveError,          setSaveError         ] = useState('')
  const [userId,             setUserId            ] = useState<string | null>(null)

  // ── Auth guard + fetch data ───────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/signup')
        return
      }
      setUserId(user.id)

      const { data: tutorData } = await supabase
        .from('tutors')
        .select('teaching_style, subjects, notification_prefs')
        .eq('id', user.id)
        .single()

      setTeachingStyle((tutorData?.teaching_style as string | null) ?? null)

      // Restore session prefs if already saved
      const prefs = tutorData?.notification_prefs as Record<string, unknown> | null
      if (prefs?.session_duration) setSessionDuration(prefs.session_duration as '60' | '90' | '120')
      if (prefs?.buffer_mins)      setBuffer(prefs.buffer_mins as '15' | '30')

      const { data: batchRows } = await supabase
        .from('batches')
        .select('name, subject, grade, schedule_day, schedule_time, accepting_new')
        .eq('tutor_id', user.id)
        .eq('status', 'active')

      if (batchRows) setBatchSummary(batchRows as BatchSummary[])

      setAuthChecking(false)
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

  // ── Helpers ───────────────────────────────────────────────────────────

  const showIndividualSection = teachingStyle === 'individual' || teachingStyle === 'both' || teachingStyle === null

  function formatTime(t: string) {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM'
    const hr   = (h ?? 0) % 12 || 12
    return `${hr}:${String(m ?? 0).padStart(2, '0')} ${ampm}`
  }

  function addSlot() {
    if (!slotDraft.day)  { setSlotError('Please select a day.'); return }
    if (!slotDraft.time) { setSlotError('Please enter a time.'); return }

    const duplicate = freeSlots.some(
      s => s.day === slotDraft.day && s.time === slotDraft.time
    )
    if (duplicate) { setSlotError('You already have a slot at that day and time.'); return }

    setFreeSlots(prev => [
      ...prev,
      { day: slotDraft.day, time: slotDraft.time, duration_mins: parseInt(slotDraft.duration) },
    ])
    setSlotDraft({ day: '', time: '', duration: '60' })
    setSlotError('')
  }

  function removeSlot(idx: number) {
    setFreeSlots(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    if (!userId) return

    setLoading(true)
    const supabase = createClient()

    const availabilityPayload = takingNewIndividual
      ? freeSlots.map(s => ({ day: s.day, time: s.time, duration_mins: s.duration_mins, is_free: true }))
      : []

    const { error } = await supabase
      .from('tutors')
      .update({
        availability:         availabilityPayload,
        taking_new_individual: takingNewIndividual,
        notification_prefs: {
          session_duration: sessionDuration,
          buffer_mins:      buffer,
        },
      })
      .eq('id', userId)

    setLoading(false)

    if (error) {
      setSaveError('Could not save your availability. Please try again.')
      return
    }

    router.push('/signup/settings')
  }

  const inputCls = 'w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-white focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] appearance-none'

  const backPath = (teachingStyle === 'group' || teachingStyle === 'both')
    ? '/signup/groups'
    : '/signup/subjects'

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg pb-10">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
        <StepProgress current={4} />

        <div className="mb-7">
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            Your availability
          </h1>
          <p className="text-[#6c757d] text-sm leading-relaxed">
            Set your free slots for new individual students and configure session settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>

          {/* ── Section A: Individual free slots ── */}
          {showIndividualSection && (
            <div>
              <h2 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest mb-4 pb-2 border-b border-[#f1f3f5]">
                Free slots for new individual students
              </h2>

              {/* Important info box */}
              <div className="mb-4 bg-[#fff9db] border border-[#ffec99] rounded-[12px] px-4 py-3">
                <p className="text-[#e67700] text-xs font-medium leading-relaxed">
                  Add time slots when you can take <strong>new</strong> individual students.
                  Do not add your existing students&apos; times here — you will import those with your student list after setup.
                  Leave empty if you are not taking new individual students right now.
                </p>
              </div>

              {/* Taking new individual students toggle */}
              <div className="flex items-center justify-between bg-[#f8f9fa] rounded-[10px] px-4 py-3 mb-4">
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e] leading-none mb-0.5">
                    Taking new individual students?
                  </p>
                  {!takingNewIndividual && (
                    <p className="text-[0.7rem] text-[#adb5bd] mt-1">
                      Bot will not offer individual bookings until you enable this.
                    </p>
                  )}
                </div>
                <Toggle checked={takingNewIndividual} onChange={setTakingNewIndividual} />
              </div>

              {/* Slot picker — only when taking new students */}
              {takingNewIndividual && (
                <>
                  {/* Added slots */}
                  {freeSlots.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {freeSlots.map((slot, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 bg-[#edf2ff] border border-[#dbe4ff] text-[#3b5bdb] text-xs font-semibold rounded-full pl-3 pr-2 py-1.5"
                        >
                          <span>{slot.day} &middot; {formatTime(slot.time)} &middot; {slot.duration_mins} min</span>
                          <button
                            type="button"
                            onClick={() => removeSlot(idx)}
                            className="w-4 h-4 rounded-full bg-[#3b5bdb]/10 hover:bg-[#c92a2a]/10 text-[#3b5bdb] hover:text-[#c92a2a] flex items-center justify-center transition-colors text-[10px] font-bold leading-none"
                            aria-label="Remove slot"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add slot row */}
                  <div className="border border-[#dee2e6] rounded-[12px] p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[#343a40] text-xs font-semibold mb-1.5">Day</label>
                        <select
                          value={slotDraft.day}
                          onChange={e => { setSlotDraft(p => ({ ...p, day: e.target.value })); setSlotError('') }}
                          className={inputCls}
                        >
                          <option value="">Day</option>
                          {DAYS.map(d => <option key={d} value={d}>{d.slice(0, 3)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[#343a40] text-xs font-semibold mb-1.5">Time</label>
                        <select
                          value={slotDraft.time}
                          onChange={e => { setSlotDraft(p => ({ ...p, time: e.target.value })); setSlotError('') }}
                          className={inputCls}
                        >
                          <option value="">Select time</option>
                          {TIME_OPTIONS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[#343a40] text-xs font-semibold mb-1.5">Duration</label>
                        <select
                          value={slotDraft.duration}
                          onChange={e => setSlotDraft(p => ({ ...p, duration: e.target.value }))}
                          className={inputCls}
                        >
                          {DURATION_OPTIONS.map(d => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {slotError && (
                      <p className="text-[#c92a2a] text-xs">{slotError}</p>
                    )}

                    <button
                      type="button"
                      onClick={addSlot}
                      className="w-full border border-[#3b5bdb] text-[#3b5bdb] hover:bg-[#edf2ff] font-semibold text-sm py-2 rounded-[10px] transition-all duration-150"
                    >
                      + Add slot
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Section B: Batch summary ── */}
          {batchSummary.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest mb-4 pb-2 border-b border-[#f1f3f5]">
                Your batch classes
              </h2>
              <div className="space-y-2 mb-3">
                {batchSummary.map((b, idx) => (
                  <div
                    key={idx}
                    className="bg-[#ebfbee] border border-[#b2f2bb] rounded-[12px] px-4 py-3"
                  >
                    <p className="text-[#2f9e44] text-sm font-bold">{b.name}</p>
                    <p className="text-[#6c757d] text-xs mt-0.5">
                      {b.subject} &middot; {b.grade} &middot; {b.schedule_day} {formatTime(b.schedule_time)} &middot;&nbsp;
                      {b.accepting_new
                        ? <span className="text-[#2f9e44] font-semibold">Accepting</span>
                        : <span className="text-[#adb5bd]">Closed</span>
                      }
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[#6c757d] text-xs mb-1">
                These are automatically offered to new group students by the bot.
              </p>
              <button
                type="button"
                onClick={() => router.push('/signup/groups')}
                className="text-[#3b5bdb] text-xs font-semibold hover:underline"
              >
                &larr; Edit groups
              </button>
            </div>
          )}

          {/* ── Section C: Session settings ── */}
          <div>
            <h2 className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest mb-4 pb-2 border-b border-[#f1f3f5]">
              Session settings
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Default session duration
                </label>
                <PillGroup
                  options={['60', '90', '120'] as const}
                  value={sessionDuration}
                  onChange={setSessionDuration}
                  labelMap={{ '60': '1 hour', '90': '1.5 hours', '120': '2 hours' }}
                />
              </div>
              <div>
                <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                  Buffer between sessions
                </label>
                <PillGroup
                  options={['15', '30'] as const}
                  value={buffer}
                  onChange={setBuffer}
                  labelMap={{ '15': '15 min', '30': '30 min' }}
                />
              </div>
            </div>
          </div>

          {saveError && (
            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
              <p className="text-[#c92a2a] text-xs font-semibold">{saveError}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push(backPath)}
              className="flex-1 border border-[#dee2e6] text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-150"
            >
              &larr; Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </span>
              ) : 'Continue →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
