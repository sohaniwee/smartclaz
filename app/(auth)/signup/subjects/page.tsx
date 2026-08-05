'use client'

// ✅ CURRENT: Step 2 of signup — subjects, grade levels, individual/group/trial fees, payment instructions.
// 📝 NOTE: Data saved to tutors.subjects (JSONB array) and tutors.payment_instructions.
//    Schema: [{subject, grades: [{grade, individual_fee, group_fee, trial_type, trial_fee}]}]

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SubjectEntry } from '@/lib/types/subjects'

// ── Constants ──────────────────────────────────────────────────────────────

const SUBJECTS = ['Mathematics', 'Science', 'Physics', 'Chemistry', 'English', 'Sinhala', 'ICT', 'Other']
const GRADES   = ['A/L', 'O/L', 'Grade 9', 'Grade 8', 'Grade 7', 'Grade 6', 'Grade 5']

// ── Types ──────────────────────────────────────────────────────────────────

type GradeDraft = {
  grade: string
  individual_fee: string
  group_fee: string
  trial_type: 'none' | 'free' | 'paid'
  trial_fee: string
}

type SubjectDraft = {
  subject: string
  grades: GradeDraft[]
}

type GradeErrors = { fees?: string; trial_fee?: string }

type FormErrors = {
  subjects?: string
  subjectGrades?: Record<string, string>
  gradeErrors?: Record<string, Record<string, GradeErrors>>
  paymentInstructions?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDraftGrade(grade: string): GradeDraft {
  return { grade, individual_fee: '', group_fee: '', trial_type: 'none', trial_fee: '' }
}

function detectTeachingStyle(subjects: SubjectEntry[]): 'individual' | 'group' | 'both' {
  let hasIndividual = false
  let hasGroup = false
  for (const subject of subjects) {
    for (const grade of subject.grades ?? []) {
      if (grade.individual_fee > 0) hasIndividual = true
      if (grade.has_group && grade.batches?.length > 0) hasGroup = true
    }
  }
  if (hasIndividual && hasGroup) return 'both'
  if (hasGroup) return 'group'
  return 'individual'
}

function buildSupabasePayload(drafts: SubjectDraft[]): SubjectEntry[] {
  return drafts.map(s => ({
    subject: s.subject,
    grades: s.grades.map(g => {
      const individualFee = parseInt(g.individual_fee) || 0
      const trialFee = g.trial_type === 'paid' ? (parseInt(g.trial_fee) || 0) : 0
      return {
        grade:                   g.grade,
        has_individual:          individualFee > 0,
        individual_fee:          individualFee,
        individual_duration_mins: 60,
        individual_slots:        [],
        taking_new_individual:   true,
        individual_trial_type:   g.trial_type,
        individual_trial_fee:    trialFee,
        has_group:               (parseInt(g.group_fee) || 0) > 0,
        batches:                 [],
      }
    }),
  }))
}

function validate(subjects: SubjectDraft[]): FormErrors {
  const errs: FormErrors = {}

  if (subjects.length === 0) {
    errs.subjects = 'Please select at least one subject.'
    return errs
  }

  for (const s of subjects) {
    if (s.grades.length === 0) {
      errs.subjectGrades = { ...errs.subjectGrades, [s.subject]: 'Select at least one grade level.' }
    }
    for (const g of s.grades) {
      const gradeErr: GradeErrors = {}
      const indFee = parseInt(g.individual_fee) || 0
      const grpFee = parseInt(g.group_fee)      || 0
      if (indFee <= 0 && grpFee <= 0) {
        gradeErr.fees = 'Enter at least one fee — individual or group.'
      }
      if (g.trial_type === 'paid' && (parseInt(g.trial_fee) || 0) <= 0) {
        gradeErr.trial_fee = 'Enter a trial fee amount.'
      }
      if (Object.keys(gradeErr).length > 0) {
        errs.gradeErrors = {
          ...errs.gradeErrors,
          [s.subject]: { ...(errs.gradeErrors?.[s.subject] ?? {}), [g.grade]: gradeErr },
        }
      }
    }
  }

  return errs
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

// ── GradePriceCard ─────────────────────────────────────────────────────────

function GradePriceCard({
  config,
  errors,
  onChange,
}: {
  config: GradeDraft
  errors?: GradeErrors
  onChange: (field: keyof GradeDraft, value: string) => void
}) {
  const [feesTouched,     setFeesTouched    ] = useState(false)
  const [trialFeeTouched, setTrialFeeTouched] = useState(false)

  const feesInvalid     = (parseInt(config.individual_fee) || 0) <= 0 && (parseInt(config.group_fee) || 0) <= 0
  const showFeesErr     = errors?.fees || (feesTouched && feesInvalid)
  const feesErrMsg      = errors?.fees ?? (feesTouched && feesInvalid ? 'Enter at least one fee — individual or group.' : undefined)

  const trialFeeInvalid = config.trial_type === 'paid' && (parseInt(config.trial_fee) || 0) <= 0
  const showTrialErr    = errors?.trial_fee || (trialFeeTouched && trialFeeInvalid)
  const trialErrMsg     = errors?.trial_fee ?? (trialFeeTouched && trialFeeInvalid ? 'Enter a trial fee amount.' : undefined)

  const base = 'w-full rounded-[8px] px-3 py-[7px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-white'
  const ok   = 'border border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
  const err  = 'border border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]'

  return (
    <div className="mt-2 mb-1 bg-[#f8f9ff] border border-[#dbe4ff] rounded-[10px] p-4 space-y-3">
      <p className="text-[#343a40] text-[0.7rem] font-semibold">
        Session fees <span className="text-[#c92a2a]">*</span>
        <span className="text-[#adb5bd] font-normal ml-1">— at least one</span>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[#343a40] text-[0.7rem] font-semibold mb-1.5">
            Individual (LKR/mo)
          </label>
          <input
            type="number"
            placeholder="LKR"
            value={config.individual_fee}
            onChange={e => onChange('individual_fee', e.target.value)}
            onBlur={() => setFeesTouched(true)}
            onWheel={e => e.currentTarget.blur()}
            min="1"
            className={`${base} ${showFeesErr ? err : ok}`}
          />
        </div>
        <div>
          <label className="block text-[#343a40] text-[0.7rem] font-semibold mb-1.5">
            Group (LKR/mo)
          </label>
          <input
            type="number"
            placeholder="LKR"
            value={config.group_fee}
            onChange={e => onChange('group_fee', e.target.value)}
            onBlur={() => setFeesTouched(true)}
            onWheel={e => e.currentTarget.blur()}
            min="1"
            className={`${base} ${showFeesErr ? err : ok}`}
          />
        </div>
      </div>
      {feesErrMsg && <p className="text-[#c92a2a] text-xs">{feesErrMsg}</p>}

      {/* ─── Trial class ─────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[#343a40] text-[0.7rem] font-semibold">Trial class</label>
          <span className="text-[#adb5bd] text-[0.68rem] font-medium">optional</span>
        </div>

        {/* Not offered / Free trial / Paid trial */}
        <div className="flex items-center gap-0.5 bg-white border border-[#ced4da] rounded-[8px] p-0.5 w-fit mb-3">
          <button
            type="button"
            onClick={() => onChange('trial_type', 'none')}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-[6px] transition-all ${
              config.trial_type === 'none' ? 'bg-[#3b5bdb] text-white shadow-sm' : 'text-[#6c757d] hover:text-[#1a1a2e]'
            }`}
          >
            Not offered
          </button>
          <button
            type="button"
            onClick={() => onChange('trial_type', 'free')}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-[6px] transition-all ${
              config.trial_type === 'free' ? 'bg-[#3b5bdb] text-white shadow-sm' : 'text-[#6c757d] hover:text-[#1a1a2e]'
            }`}
          >
            Free trial
          </button>
          <button
            type="button"
            onClick={() => onChange('trial_type', 'paid')}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-[6px] transition-all ${
              config.trial_type === 'paid' ? 'bg-[#3b5bdb] text-white shadow-sm' : 'text-[#6c757d] hover:text-[#1a1a2e]'
            }`}
          >
            Paid trial
          </button>
        </div>

        {/* Paid trial fee input */}
        {config.trial_type === 'paid' && (
          <div className="space-y-2">
            <input
              type="number"
              placeholder="Trial fee (LKR) *"
              value={config.trial_fee}
              onChange={e => onChange('trial_fee', e.target.value)}
              onBlur={() => setTrialFeeTouched(true)}
              onWheel={e => e.currentTarget.blur()}
              min="1"
              className={`w-full rounded-[8px] px-3 py-[7px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all ${
                showTrialErr ? 'border border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)]' : 'border border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]'
              } bg-white`}
            />
            {showTrialErr && <p className="text-[#c92a2a] text-xs">{trialErrMsg}</p>}
            <p className="text-[#6c757d] text-[0.7rem]">
              Deducted from student&apos;s first monthly payment when they convert.
            </p>
          </div>
        )}

        {config.trial_type === 'free' && (
          <p className="text-[#2f9e44] text-[0.7rem] font-medium">
            First class free — no payment from student needed.
          </p>
        )}
      </div>
    </div>
  )
}

// ── SubjectPanel ───────────────────────────────────────────────────────────

function SubjectPanel({
  entry,
  noGradesError,
  gradeErrors,
  onRemove,
  onToggleGrade,
  onUpdateGrade,
}: {
  entry: SubjectDraft
  noGradesError?: string
  gradeErrors?: Record<string, GradeErrors>
  onRemove: () => void
  onToggleGrade: (grade: string) => void
  onUpdateGrade: (grade: string, field: keyof GradeDraft, value: string) => void
}) {
  return (
    <div className="border border-[#dbe4ff] bg-[#edf2ff]/50 rounded-[14px] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[#3b5bdb] text-sm font-bold tracking-tight">{entry.subject}</span>
        <button
          type="button"
          onClick={onRemove}
          className="w-5 h-5 rounded-full bg-[#3b5bdb]/10 hover:bg-[#c92a2a]/10 text-[#748ffc] hover:text-[#c92a2a] flex items-center justify-center transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      <div>
        <p className="text-[#6c757d] text-[0.68rem] font-semibold mb-2">
          Select grade levels you teach <span className="text-[#c92a2a]">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {GRADES.map(grade => {
            const selected = entry.grades.some(g => g.grade === grade)
            return (
              <button
                key={grade}
                type="button"
                onClick={() => { if (!selected) onToggleGrade(grade) }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-150 ${
                  selected
                    ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.25)] cursor-default'
                    : 'bg-white text-[#6c757d] border-[#ced4da] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                }`}
              >
                {grade}
              </button>
            )
          })}
        </div>
        {noGradesError && (
          <p className="mt-1.5 text-[#c92a2a] text-xs">{noGradesError}</p>
        )}
      </div>

      {entry.grades.length > 0 ? (
        <div className="space-y-3 pt-1">
          {entry.grades.map(gc => (
            <div key={gc.grade}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#3b5bdb] flex-shrink-0" />
                  <span className="text-[#1a1a2e] text-xs font-bold">{gc.grade}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleGrade(gc.grade)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[#adb5bd] hover:text-[#c92a2a] hover:bg-[#fff5f5] transition-colors"
                  aria-label={`Remove ${gc.grade}`}
                >
                  <X size={11} />
                </button>
              </div>
              <GradePriceCard
                config={gc}
                errors={gradeErrors?.[gc.grade]}
                onChange={(field, value) => onUpdateGrade(gc.grade, field, value)}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[0.7rem] text-[#adb5bd] italic">
          Tap a grade chip above to set fees for that level.
        </p>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SubjectsPage() {
  const router = useRouter()

  const [subjects,       setSubjects      ] = useState<SubjectDraft[]>([])
  const [loading,        setLoading       ] = useState(false)
  const [authChecking,   setAuthChecking  ] = useState(true)
  const [formErrors,     setFormErrors    ] = useState<FormErrors>({})
  const [saveError,      setSaveError     ] = useState('')
  const [showOtherInput, setShowOtherInput] = useState(false)
  const [otherInput,     setOtherInput    ] = useState('')

  // ── Auth guard + load existing subjects ──────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/signup')
        return
      }

      // Pre-populate form if tutor already has subjects saved (e.g. navigating back)
      const { data: tutorData } = await supabase
        .from('tutors')
        .select('subjects')
        .eq('id', user.id)
        .single()

      if (Array.isArray(tutorData?.subjects) && tutorData.subjects.length > 0) {
        const drafts = (tutorData.subjects as SubjectEntry[]).map(se => ({
          subject: se.subject,
          grades: se.grades.map(gc => {
            // Handle both v1 flat schema (group_fee, trial_type, trial_fee) and
            // v2 nested schema (has_group, batches[], individual_trial_type, individual_trial_fee)
            const raw = gc as unknown as Record<string, unknown>
            const trialType: GradeDraft['trial_type'] =
              gc.individual_trial_type
                ? gc.individual_trial_type
                : typeof raw.trial_type === 'string'
                ? (raw.trial_type as GradeDraft['trial_type'])
                : raw.trial_free === true ? 'free'
                : 'none'
            const groupFee = gc.batches?.[0]?.monthly_fee
              ?? (typeof raw.group_fee === 'number' ? raw.group_fee : 0)
            const trialFee = gc.individual_trial_fee
              ?? (typeof raw.trial_fee === 'number' ? raw.trial_fee : 0)
            return {
              grade:          gc.grade,
              individual_fee: gc.individual_fee > 0 ? String(gc.individual_fee) : '',
              group_fee:      groupFee > 0 ? String(groupFee) : '',
              trial_type:     trialType,
              trial_fee:      trialFee > 0 ? String(trialFee) : '',
            }
          }),
        }))
        setSubjects(drafts)
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

  // ── Event handlers ────────────────────────────────────────────────────

  function clearSubjectError(subject: string) {
    setFormErrors(prev => {
      const next = { ...prev }
      delete next.subjects
      if (next.subjectGrades) {
        const sg = { ...next.subjectGrades }
        delete sg[subject]
        next.subjectGrades = sg
      }
      if (next.gradeErrors) {
        const ge = { ...next.gradeErrors }
        delete ge[subject]
        next.gradeErrors = ge
      }
      return next
    })
  }

  function toggleSubject(subject: string) {
    setSubjects(prev => {
      const exists = prev.some(s => s.subject === subject)
      return exists
        ? prev.filter(s => s.subject !== subject)
        : [...prev, { subject, grades: [] }]
    })
    clearSubjectError(subject)
  }

  function addOtherSubject() {
    const name = otherInput.trim()
    if (!name) return
    if (subjects.some(s => s.subject === name)) return
    toggleSubject(name)
    setOtherInput('')
    setShowOtherInput(false)
  }

  function toggleGrade(subject: string, grade: string) {
    setSubjects(prev => prev.map(s => {
      if (s.subject !== subject) return s
      const has = s.grades.some(g => g.grade === grade)
      return {
        ...s,
        grades: has
          ? s.grades.filter(g => g.grade !== grade)
          : [...s.grades, makeDraftGrade(grade)],
      }
    }))
    setFormErrors(prev => {
      const next = { ...prev }
      if (next.subjectGrades) {
        const sg = { ...next.subjectGrades }
        delete sg[subject]
        next.subjectGrades = sg
      }
      if (next.gradeErrors?.[subject]) {
        const sub = { ...next.gradeErrors[subject] }
        delete sub[grade]
        next.gradeErrors = { ...next.gradeErrors, [subject]: sub }
      }
      return next
    })
  }

  function updateGrade(
    subject: string,
    grade: string,
    field: keyof GradeDraft,
    value: string,
  ) {
    setSubjects(prev => prev.map(s =>
      s.subject !== subject
        ? s
        : { ...s, grades: s.grades.map(g => g.grade === grade ? { ...g, [field]: value } : g) },
    ))
    if (field === 'individual_fee' || field === 'group_fee') {
      setFormErrors(prev => {
        if (!prev.gradeErrors?.[subject]?.[grade]?.fees) return prev
        const sub = { ...prev.gradeErrors[subject], [grade]: { ...prev.gradeErrors[subject][grade] } }
        delete sub[grade].fees
        return { ...prev, gradeErrors: { ...prev.gradeErrors, [subject]: sub } }
      })
    }
    if (field === 'trial_fee' || field === 'trial_type') {
      setFormErrors(prev => {
        if (!prev.gradeErrors?.[subject]?.[grade]?.trial_fee) return prev
        const sub = { ...prev.gradeErrors[subject], [grade]: { ...prev.gradeErrors[subject][grade] } }
        delete sub[grade].trial_fee
        return { ...prev, gradeErrors: { ...prev.gradeErrors, [subject]: sub } }
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')

    const errs = validate(subjects)
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      return
    }
    setFormErrors({})
    setLoading(true)

    const payload = buildSupabasePayload(subjects)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      router.replace('/signup')
      return
    }

    const { error: updateErr } = await supabase
      .from('tutors')
      .update({
        subjects:       payload,
        teaching_style: detectTeachingStyle(payload),
      })
      .eq('id', user.id)

    if (updateErr) {
      setLoading(false)
      setSaveError('Could not save your subjects. Please try again.')
      return
    }

    setLoading(false)
    const style = detectTeachingStyle(payload)
    router.push(style === 'group' || style === 'both' ? '/signup/groups' : '/signup/availability')
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
        <StepProgress current={2} />

        <div className="mb-7">
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            What do you teach?
          </h1>
          <p className="text-[#6c757d] text-sm leading-relaxed">
            Pick your subjects, tap the grade levels you teach, then set your fees for each.
          </p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-2">
            Fields marked <span className="text-[#c92a2a] font-bold">*</span> are required
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>

          {/* Subject chips */}
          <div>
            <p className="text-[#343a40] text-xs font-semibold mb-2.5">
              Select subjects <span className="text-[#c92a2a]">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(subject => {
                if (subject === 'Other') {
                  return (
                    <button
                      key="Other"
                      type="button"
                      onClick={() => setShowOtherInput(v => !v)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-150 ${
                        showOtherInput
                          ? 'bg-[#edf2ff] text-[#3b5bdb] border-[#3b5bdb]'
                          : 'bg-white text-[#343a40] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                      }`}
                    >
                      + Other
                    </button>
                  )
                }
                const active = subjects.some(s => s.subject === subject)
                return active ? (
                  <span
                    key={subject}
                    className="inline-flex items-center gap-1.5 pl-4 pr-2 py-2 rounded-full text-sm font-semibold border bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.25)]"
                  >
                    {subject}
                    <button
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                      aria-label={`Remove ${subject}`}
                    >
                      <X size={9} />
                    </button>
                  </span>
                ) : (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className="px-4 py-2 rounded-full text-sm font-semibold border bg-white text-[#343a40] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-all duration-150"
                  >
                    {subject}
                  </button>
                )
              })}
              {/* Custom subjects added via "Other" */}
              {subjects.filter(s => !SUBJECTS.includes(s.subject)).map(s => (
                <span
                  key={s.subject}
                  className="inline-flex items-center gap-1.5 pl-4 pr-2 py-2 rounded-full text-sm font-semibold border bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.25)]"
                >
                  {s.subject}
                  <button
                    type="button"
                    onClick={() => toggleSubject(s.subject)}
                    className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                    aria-label={`Remove ${s.subject}`}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            {showOtherInput && (
              <div className="flex gap-2 mt-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. Tamil, Drama, Art, Commerce…"
                  value={otherInput}
                  onChange={e => setOtherInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addOtherSubject() }
                    if (e.key === 'Escape') { setShowOtherInput(false); setOtherInput('') }
                  }}
                  className="flex-1 border border-[#ced4da] rounded-[10px] px-3 py-2 text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] transition-all"
                />
                <button
                  type="button"
                  onClick={addOtherSubject}
                  disabled={!otherInput.trim()}
                  className="px-4 py-2 bg-[#3b5bdb] disabled:opacity-40 text-white text-sm font-semibold rounded-[10px] hover:bg-[#4c6ef5] transition-colors"
                >
                  Add
                </button>
              </div>
            )}
            {formErrors.subjects && (
              <p className="mt-2 text-[#c92a2a] text-xs">{formErrors.subjects}</p>
            )}
          </div>

          {/* Subject panels */}
          {subjects.length > 0 ? (
            <div className="space-y-3">
              {subjects.map(entry => (
                <SubjectPanel
                  key={entry.subject}
                  entry={entry}
                  noGradesError={formErrors.subjectGrades?.[entry.subject]}
                  gradeErrors={formErrors.gradeErrors?.[entry.subject]}
                  onRemove={() => toggleSubject(entry.subject)}
                  onToggleGrade={grade => toggleGrade(entry.subject, grade)}
                  onUpdateGrade={(grade, field, value) => updateGrade(entry.subject, grade, field, value)}
                />
              ))}
            </div>
          ) : null}

          {saveError && (
            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
              <p className="text-[#c92a2a] text-xs font-semibold">{saveError}</p>
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
                Saving…
              </span>
            ) : 'Continue →'}
          </button>
        </form>
      </div>
    </div>
  )
}
