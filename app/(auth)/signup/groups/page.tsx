'use client'

// Step 3 of 5 — create group classes during signup
// Only shown if teaching_style = 'group' | 'both'
// Bot will offer these groups to new students immediately
// Monthly fee is auto-populated from tutor's subjects data (group_fee)

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SubjectEntry } from '@/lib/types/subjects'

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

const DURATIONS: { value: string; label: string }[] = [
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

// ── Types ──────────────────────────────────────────────────────────────────

type GroupRow = {
  id: string
  name: string
  subject: string
  grade: string
  schedule_day: string
  schedule_time: string
  session_duration_mins: number
  max_students: number
  monthly_fee: number
  accepting_new: boolean
}

type FormState = {
  subject: string
  grade: string
  schedule_day: string
  schedule_time: string
  duration: string
  max_students: string
  accepting_new: boolean
}

function blankForm(): FormState {
  return {
    subject: '',
    grade: '',
    schedule_day: '',
    schedule_time: '',
    duration: '60',
    max_students: '20',
    accepting_new: true,
  }
}

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

// ── Page ───────────────────────────────────────────────────────────────────

export default function GroupsSignupPage() {
  const router = useRouter()

  const [groups,        setGroups       ] = useState<GroupRow[]>([])
  const [form,          setForm         ] = useState<FormState>(blankForm())
  const [formError,     setFormError    ] = useState('')
  const [loading,       setLoading      ] = useState(false)
  const [authChecking,  setAuthChecking ] = useState(true)
  const [tutorSubjects, setTutorSubjects] = useState<SubjectEntry[]>([])
  const [groupSubjects, setGroupSubjects] = useState<SubjectEntry[]>([])
  const [noGroupFees,   setNoGroupFees  ] = useState(false)
  const [userId,        setUserId       ] = useState<string | null>(null)

  // ── Auth guard + load tutor subjects ──────────────────────────────────

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
        .select('subjects')
        .eq('id', user.id)
        .single()

      const allSubjects: SubjectEntry[] = (tutorData?.subjects as SubjectEntry[]) ?? []
      setTutorSubjects(allSubjects)

      // Only subjects/grades that have group classes (v2: has_group, v1: group_fee > 0)
      const filtered = allSubjects.filter(s =>
        s.grades.some(g => {
          if (g.has_group !== undefined) return g.has_group && (g.batches?.length ?? 0) > 0
          return ((g as unknown as Record<string, unknown>).group_fee as number ?? 0) > 0
        })
      )

      if (filtered.length === 0) {
        // No group fees set — show all subjects without filtering, with a warning
        setNoGroupFees(true)
        setGroupSubjects(allSubjects)
      } else {
        setGroupSubjects(filtered)
      }

      // Load any groups already saved (e.g. user came back to this step)
      const { data: existingGroups } = await supabase
        .from('batches')
        .select('id, name, subject, grade, schedule_day, schedule_time, session_duration_mins, max_students, monthly_fee, accepting_new')
        .eq('tutor_id', user.id)
        .eq('status', 'active')

      if (existingGroups && existingGroups.length > 0) {
        setGroups(existingGroups as GroupRow[])
      }

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

  // ── Derived: available grades for selected subject (only those with group_fee > 0) ──

  const selectedSubjectEntry = groupSubjects.find(s => s.subject === form.subject)
  const availableGrades = noGroupFees
    ? (selectedSubjectEntry?.grades.map(g => g.grade) ?? [])
    : (selectedSubjectEntry?.grades
        .filter(g => {
          if (g.has_group !== undefined) return g.has_group && (g.batches?.length ?? 0) > 0
          return ((g as unknown as Record<string, unknown>).group_fee as number ?? 0) > 0
        })
        .map(g => g.grade) ?? [])

  // ── Helper: get the group fee for the selected subject + grade ─────────

  function getFee(subjectName: string, gradeName: string): number {
    const subjectEntry = tutorSubjects.find(s => s.subject === subjectName)
    const gradeEntry   = subjectEntry?.grades.find(gc => gc.grade === gradeName)
    return (gradeEntry as { group_fee?: number } | undefined)?.group_fee ?? 0
  }

  // ── Handlers ──────────────────────────────────────────────────────────

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Reset grade when subject changes
      if (key === 'subject') next.grade = ''
      return next
    })
    setFormError('')
  }

  async function handleAdd() {
    if (!form.subject)      { setFormError('Please select a subject.');  return }
    if (!form.grade)        { setFormError('Please select a grade.');    return }
    if (!form.schedule_day) { setFormError('Please select a day.');      return }
    if (!form.schedule_time){ setFormError('Please enter a time.');      return }
    if (!userId) return

    setLoading(true)
    const supabase = createClient()

    const fee       = getFee(form.subject, form.grade)
    const groupName = `${form.subject} ${form.grade}`

    const { data: group, error } = await supabase
      .from('batches')
      .insert({
        tutor_id:              userId,
        name:                  groupName,
        subject:               form.subject,
        grade:                 form.grade,
        schedule_day:          form.schedule_day,
        schedule_time:         form.schedule_time,
        session_duration_mins: parseInt(form.duration),
        monthly_fee:           fee,
        max_students:          parseInt(form.max_students),
        accepting_new:         form.accepting_new,
        status:                'active',
      })
      .select()
      .single()

    setLoading(false)

    if (error || !group) {
      setFormError('Could not add group. Try again.')
      return
    }

    setGroups(prev => [...prev, group as GroupRow])
    setForm(blankForm())
    setFormError('')
  }

  async function handleContinue() {
    if (!userId) return
    // Set taking_new_individual to a default (true) so the middleware allows
    // access to /signup/availability. The availability page lets the tutor
    // change this value — this is just the gate signal.
    const supabase = createClient()
    await supabase
      .from('tutors')
      .update({ taking_new_individual: true })
      .eq('id', userId)
    router.push('/signup/availability')
  }

  function handleRemoveGroup(id: string) {
    setGroups(prev => prev.filter(g => g.id !== id))
    // Soft delete — mark inactive in DB (fire and forget)
    const supabase = createClient()
    supabase.from('batches').update({ status: 'inactive' }).eq('id', id).then(() => {})
  }

  function formatTime(t: string) {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM'
    const hr   = (h ?? 0) % 12 || 12
    return `${hr}:${String(m ?? 0).padStart(2, '0')} ${ampm}`
  }

  const inputCls = 'w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-white focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] appearance-none'

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg pb-10">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
        <StepProgress current={3} />

        <div className="mb-7">
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            Set up your group classes
          </h1>
          <p className="text-[#6c757d] text-sm leading-relaxed">
            Add your recurring group classes. Times, dates and student limits — fees are carried over from your subjects.
          </p>
        </div>

        {/* Info box */}
        <div className="mb-6 bg-[#edf2ff] border border-[#dbe4ff] rounded-[12px] px-4 py-3">
          <p className="text-[#3b5bdb] text-xs font-medium leading-relaxed">
            Creating groups now means students who message you can be placed in the right class immediately.
          </p>
        </div>

        {/* No group fees warning */}
        {noGroupFees && (
          <div className="mb-6 bg-[#fff9db] border border-[#ffec99] rounded-[12px] p-4 text-sm text-[#e67700]">
            No group fees were set in your subjects. You can still add group classes — they&apos;ll have no fee set.
            <a href="/signup/subjects" className="underline ml-1">Update your fees &rarr;</a>
          </div>
        )}

        {/* Added groups list */}
        {groups.length > 0 && (
          <div className="mb-6 space-y-2">
            <p className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest mb-3 pb-2 border-b border-[#f1f3f5]">
              Added groups
            </p>
            {groups.map(g => (
              <div
                key={g.id}
                className="bg-[#ebfbee] border border-[#b2f2bb] rounded-[12px] px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[#2f9e44] text-sm font-bold truncate">{g.name}</p>
                  <p className="text-[#6c757d] text-xs mt-0.5">
                    {g.schedule_day} {formatTime(g.schedule_time)} &middot; {g.max_students} spots &middot; LKR {g.monthly_fee.toLocaleString()}/mo (from your fees)
                  </p>
                  <p className="text-xs mt-0.5">
                    {g.accepting_new
                      ? <span className="text-[#2f9e44] font-semibold">Accepting new students</span>
                      : <span className="text-[#adb5bd]">Closed — waitlist only</span>
                    }
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveGroup(g.id)}
                  className="flex-shrink-0 text-[#adb5bd] hover:text-[#c92a2a] text-lg leading-none transition-colors"
                  aria-label="Remove group"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add group form */}
        <div className="border border-[#dee2e6] rounded-[14px] p-5 space-y-4 mb-6">
          <p className="text-xs font-bold text-[#1a1a2e] font-mono uppercase tracking-widest pb-2 border-b border-[#f1f3f5]">
            Add a group
          </p>

          {/* Subject + Grade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Subject <span className="text-[#c92a2a]">*</span>
              </label>
              <select
                value={form.subject}
                onChange={e => setField('subject', e.target.value)}
                className={inputCls}
              >
                <option value="">Select subject</option>
                {groupSubjects.map(s => (
                  <option key={s.subject} value={s.subject}>{s.subject}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Grade <span className="text-[#c92a2a]">*</span>
              </label>
              <select
                value={form.grade}
                onChange={e => setField('grade', e.target.value)}
                className={inputCls}
                disabled={!form.subject}
              >
                <option value="">Select grade</option>
                {availableGrades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fee preview */}
          {form.subject && form.grade && (
            <div className="bg-[#f8f9ff] border border-[#dbe4ff] rounded-[10px] px-4 py-2.5 flex items-center justify-between">
              <span className="text-[#6c757d] text-xs font-semibold">Group fee / month</span>
              {getFee(form.subject, form.grade) > 0
                ? <span className="text-[#3b5bdb] text-sm font-extrabold">LKR {getFee(form.subject, form.grade).toLocaleString()}</span>
                : <span className="text-[#adb5bd] text-xs">Not set — <a href="/signup/subjects" className="underline">add group fee in Step 2</a></span>
              }
            </div>
          )}

          {/* Day + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Day <span className="text-[#c92a2a]">*</span>
              </label>
              <select
                value={form.schedule_day}
                onChange={e => setField('schedule_day', e.target.value)}
                className={inputCls}
              >
                <option value="">Select day</option>
                {DAYS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Time <span className="text-[#c92a2a]">*</span>
              </label>
              <select
                value={form.schedule_time}
                onChange={e => setField('schedule_time', e.target.value)}
                className={inputCls}
              >
                <option value="">Select time</option>
                {TIME_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Duration + Max students */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Duration
              </label>
              <select
                value={form.duration}
                onChange={e => setField('duration', e.target.value)}
                className={inputCls}
              >
                {DURATIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#343a40] text-xs font-semibold mb-1.5">
                Max students
              </label>
              <input
                type="number"
                value={form.max_students}
                onChange={e => setField('max_students', e.target.value)}
                onWheel={e => e.currentTarget.blur()}
                min={1}
                max={100}
                className={inputCls}
              />
            </div>
          </div>

          {/* Accepting new students toggle */}
          <div className="flex items-center justify-between bg-[#f8f9fa] rounded-[10px] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#1a1a2e] leading-none mb-0.5">
                Currently accepting new students?
              </p>
              {!form.accepting_new && (
                <p className="text-[0.7rem] text-[#adb5bd] mt-1">
                  Group closed — students can join waitlist
                </p>
              )}
            </div>
            <Toggle checked={form.accepting_new} onChange={v => setField('accepting_new', v)} />
          </div>

          {/* Inline form error */}
          {formError && (
            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
              <p className="text-[#c92a2a] text-xs font-semibold">{formError}</p>
            </div>
          )}

          {/* Add group button */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading}
            className="w-full border border-[#3b5bdb] text-[#3b5bdb] hover:bg-[#edf2ff] disabled:opacity-60 font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-150"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </span>
            ) : '+ Add group'}
          </button>
        </div>

        {/* Navigation */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/signup/subjects')}
              className="flex-1 border border-[#dee2e6] text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-150"
            >
              &larr; Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="flex-[2] bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
            >
              Continue to availability &rarr;
            </button>
          </div>
          <button
            type="button"
            onClick={handleContinue}
            className="w-full text-center text-[#6c757d] text-xs hover:text-[#3b5bdb] transition-colors py-1"
          >
            Skip — I&apos;ll add groups later
          </button>
        </div>
      </div>
    </div>
  )
}
