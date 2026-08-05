'use client'

// AddStudentModal — triggered from GettingStarted or a global "+ Add Student" button.
// Inserts a student row, optionally creates a session and a payment record.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { findCountry, validatePhone } from '@/lib/countries'
import type { SubjectEntry } from '@/lib/types/subjects'
import { DateInput, TimeSelect } from '@/components/ui/DateTimeInput'

// ── Types ──────────────────────────────────────────────────────────────────

export type Batch = { id: string; name: string; subject: string; grade?: string; monthly_fee?: number; schedule_day?: string; schedule_time?: string }

export interface AddStudentModalProps {
  open: boolean
  onClose: () => void
  onStudentAdded: (studentName: string) => void
  tutorSubjects: SubjectEntry[]
  tutorBatches: Batch[]
  tutorMonthlyDueDate: number | null
}

type ClassType = 'individual' | 'batch' | 'trial'
type PaymentStatusChoice = 'not_paid' | 'paid' | 'not_applicable'


// ── Schedule suggestion helpers ────────────────────────────────────────────

const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

/** Returns the next date (YYYY-MM-DD) for a given day name (e.g. "Monday"). */
function nextDateForDay(dayName: string): string {
  const idx = DAY_INDEX[dayName.toLowerCase()]
  if (idx === undefined) return ''
  const today = new Date()
  const todayIdx = today.getDay()
  const diff = (idx - todayIdx + 7) % 7 || 7   // always next occurrence, never today
  const next = new Date(today)
  next.setDate(today.getDate() + diff)
  return next.toISOString().slice(0, 10)
}

/** Formats HH:MM (24h) to "9:00 AM" label. */
function formatTimeLabel(t: string): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${mStr} ${ampm}`
}

/** Formats a YYYY-MM-DD string to "Mon 30 Jun" */
function formatDateShort(d: string): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-LK', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Input style helpers ────────────────────────────────────────────────────

const inputBase =
  'w-full rounded-[10px] px-[13px] py-[9px] text-[0.82rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all'
const inputNormal =
  `${inputBase} border-[1.5px] border-[#ced4da] focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)]`
const inputError =
  `${inputBase} border-[1.5px] border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:shadow-[0_0_0_3px_rgba(201,42,42,0.12)]`

function inputCls(hasError: boolean) {
  return hasError ? inputError : inputNormal
}

const labelCls = 'block text-[#343a40] text-[0.72rem] font-semibold mb-1.5'

// ── PillRadio ──────────────────────────────────────────────────────────────

function PillRadio<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-full text-[0.78rem] font-semibold border transition-all duration-150 ${
            value === opt.value
              ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.22)]'
              : 'bg-white text-[#6c757d] border-[#ced4da] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner() {
  return <Loader2 size={16} className="animate-spin inline-block" />
}

// ── Success state ──────────────────────────────────────────────────────────

function SuccessView({
  name,
  onAddAnother,
  onDone,
}: {
  name: string
  onAddAnother: () => void
  onDone: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-8 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-[#ebfbee] border-2 border-[#b2f2bb] flex items-center justify-center text-2xl">
        ✅
      </div>
      <div>
        <p className="text-[1.05rem] font-extrabold text-[#1a1a2e] tracking-[-0.01em]">
          {name} added!
        </p>
        <p className="text-[#6c757d] text-sm mt-1">
          They will now receive reminders and class links automatically.
        </p>
      </div>
      <div className="flex gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={onAddAnother}
          className="flex-1 py-2.5 rounded-[100px] border-[1.5px] border-[#ced4da] text-[#343a40] text-[0.82rem] font-semibold hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-all"
        >
          + Add Another
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 py-2.5 rounded-[100px] bg-[#3b5bdb] text-white text-[0.82rem] font-semibold shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:bg-[#4c6ef5] transition-all"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AddStudentModal({
  open,
  onClose,
  onStudentAdded,
  tutorSubjects,
  tutorBatches,
  tutorMonthlyDueDate,
}: AddStudentModalProps) {

  // ── Form state ─────────────────────────────────────────────────────────

  const [name,          setName]          = useState('')
  const [countryCode,   setCountryCode]   = useState('LK')
  const [phone,         setPhone]         = useState('')
  const [subject,       setSubject]       = useState('')
  const [grade,         setGrade]         = useState('')
  const [classType,     setClassType]     = useState<ClassType>('individual')
  const [batchId,       setBatchId]       = useState('')
  const [fee,           setFee]           = useState('')
  const [nextDate,      setNextDate]      = useState('')
  const [nextTime,      setNextTime]      = useState('')
  const [payStatus,     setPayStatus]     = useState<PaymentStatusChoice>('not_paid')
  const [paidOnDate,    setPaidOnDate]    = useState('')

  // ── UI state ───────────────────────────────────────────────────────────

  const [submitting,    setSubmitting]    = useState(false)
  const [globalError,   setGlobalError]   = useState('')
  const [phoneError,    setPhoneError]    = useState('')
  const [nameError,     setNameError]     = useState('')
  const [subjectError,  setSubjectError]  = useState('')
  const [gradeError,    setGradeError]    = useState('')
  const [success,       setSuccess]       = useState(false)
  const [addedName,     setAddedName]     = useState('')

  // ── Derived ────────────────────────────────────────────────────────────

  const uniqueSubjects = Array.from(new Set(tutorSubjects.map(s => s.subject)))

  // When class type is batch, only show subjects that actually have batches
  const subjectsWithBatches = Array.from(new Set(tutorBatches.map(b => b.subject)))
  const subjectsForDropdown = classType === 'batch' ? subjectsWithBatches : uniqueSubjects

  const gradesForSubject: string[] = subject
    ? tutorSubjects
        .find(s => s.subject === subject)
        ?.grades.map(g => g.grade) ?? []
    : []

  // Filter batches by subject, then by grade when both subject and grade are selected.
  // If a batch has no grade stored (legacy), it matches any grade.
  const batchesForSubject = tutorBatches.filter(b => {
    if (b.subject !== subject) return false
    if (grade && b.grade && b.grade !== grade) return false
    return true
  })

  const country = findCountry(countryCode)
  const fullPhone = phone ? `${country.dialCode}${phone}` : ''

  // ── Available class types based on subject + grade config ───────────────
  // Computed from what the tutor has actually set up in their profile.

  const availableClassTypes = useMemo(() => {
    const opts: { value: ClassType; label: string }[] = []
    if (!subject) return opts

    const gc = tutorSubjects.find(s => s.subject === subject)?.grades.find(g => g.grade === grade)

    // Individual — requires has_individual flag on the grade config
    if (gc?.has_individual) {
      opts.push({ value: 'individual', label: 'Individual' })
    }

    // Group/Batch — requires at least one active batch for the subject
    // (grade is not required for batches — they're subject-level)
    if (batchesForSubject.length > 0) {
      opts.push({ value: 'batch', label: 'Group' })
    }

    // Trial — requires individual trial type set to free or paid
    if (gc?.has_individual && gc?.individual_trial_type && gc.individual_trial_type !== 'none') {
      opts.push({ value: 'trial', label: 'Trial' })
    }

    return opts
  }, [subject, grade, tutorSubjects, batchesForSubject])

  // ── Schedule suggestions based on class type + subject + grade ─────────
  // Each suggestion: { date: 'YYYY-MM-DD', time: 'HH:MM', label: 'Mon 30 Jun · 9:00 AM' }

  const suggestions = useMemo(() => {
    if (!subject) return []

    if (classType === 'batch') {
      // Batch suggestions come from the selected batch or all batches for subject
      const relevantBatches = batchId
        ? tutorBatches.filter(b => b.id === batchId)
        : batchesForSubject
      return relevantBatches
        .filter(b => b.schedule_day && b.schedule_time)
        .map(b => {
          const date = nextDateForDay(b.schedule_day!)
          const time = b.schedule_time!.slice(0, 5)
          return {
            date,
            time,
            label: `${formatDateShort(date)} · ${formatTimeLabel(time)}`,
            sublabel: b.name,
          }
        })
    }

    if (classType === 'individual' || classType === 'trial') {
      if (!grade) return []
      const gc = tutorSubjects.find(s => s.subject === subject)?.grades.find(g => g.grade === grade)
      if (!gc || !gc.individual_slots?.length) return []
      return gc.individual_slots.map(slot => {
        const date = nextDateForDay(slot.day)
        const time = slot.time.slice(0, 5)
        return {
          date,
          time,
          label: `${formatDateShort(date)} · ${formatTimeLabel(time)}`,
          sublabel: slot.day,
        }
      })
    }

    return []
  }, [subject, grade, classType, batchId, tutorSubjects, tutorBatches, batchesForSubject])

  // ── Auto-fill fee when subject + grade + classType + batchId change ────

  useEffect(() => {
    if (!subject) { setFee(''); return }

    // Batch fee comes from the DB batches list — grade is not required
    if (classType === 'batch') {
      const selectedBatch = batchId ? tutorBatches.find(b => b.id === batchId) : null
      if (selectedBatch?.monthly_fee) {
        setFee(String(selectedBatch.monthly_fee))
        return
      }
      // No specific batch selected yet — use first available batch for subject
      const firstBatch = tutorBatches.find(b => b.subject === subject)
      if (firstBatch?.monthly_fee) {
        setFee(String(firstBatch.monthly_fee))
        return
      }
      setFee('')
      return
    }

    // Individual and trial need grade to look up the right GradeConfig
    if (!grade) { setFee(''); return }
    const entry = tutorSubjects.find(s => s.subject === subject)
    const gc = entry?.grades.find(g => g.grade === grade)
    if (!gc) { setFee(''); return }

    if (classType === 'individual') {
      setFee(gc.individual_fee ? String(gc.individual_fee) : '')
    } else if (classType === 'trial') {
      const trialType = gc.individual_trial_type ?? 'none'
      if (trialType === 'free') setFee('0')
      else if (trialType === 'paid') setFee(gc.individual_trial_fee ? String(gc.individual_trial_fee) : '')
      else setFee('')
    }
  }, [subject, grade, classType, batchId, tutorSubjects, tutorBatches])

  // Reset grade when subject changes
  useEffect(() => { setGrade('') }, [subject])

  // Reset batch when subject or classType changes
  useEffect(() => { setBatchId('') }, [subject, classType])

  // When switching to batch mode, clear subject if that subject has no batches
  useEffect(() => {
    if (classType === 'batch' && subject && !subjectsWithBatches.includes(subject)) {
      setSubject('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classType])

  // Auto-select / reset classType when available options change
  useEffect(() => {
    if (availableClassTypes.length === 0) return
    const stillValid = availableClassTypes.some(o => o.value === classType)
    if (!stillValid) {
      setClassType(availableClassTypes[0].value)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableClassTypes])

  // ── Reset form ─────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setName('')
    setCountryCode('LK')
    setPhone('')
    setSubject('')
    setGrade('')
    setClassType('individual')
    setBatchId('')
    setFee('')
    setNextDate('')
    setNextTime('')
    setPayStatus('not_paid')
    setPaidOnDate('')
    setGlobalError('')
    setPhoneError('')
    setNameError('')
    setSubjectError('')
    setGradeError('')
    setSuccess(false)
    setAddedName('')
  }, [])

  // Reset when modal opens
  useEffect(() => {
    if (open) resetForm()
  }, [open, resetForm])

  // ── Validate ───────────────────────────────────────────────────────────

  function validate(): boolean {
    let ok = true

    if (!name.trim()) {
      setNameError('Please enter the student name')
      ok = false
    } else {
      setNameError('')
    }

    const phoneErr = validatePhone(phone, country)
    if (phoneErr) {
      setPhoneError(phoneErr)
      ok = false
    } else {
      setPhoneError('')
    }

    if (!subject) {
      setSubjectError('Please select a subject')
      ok = false
    } else {
      setSubjectError('')
    }

    if (!grade) {
      setGradeError('Please select a grade')
      ok = false
    } else {
      setGradeError('')
    }

    return ok
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError('')

    if (!validate()) return

    setSubmitting(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // 1. Check for duplicate WhatsApp
      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('tutor_id', user.id)
        .eq('whatsapp', fullPhone)
        .maybeSingle()

      if (existing) {
        setPhoneError('This student is already in your list')
        setSubmitting(false)
        return
      }

      // 2. Insert student
      const { data: student, error: insertErr } = await supabase
        .from('students')
        .insert({
          tutor_id:      user.id,
          name:          name.trim(),
          whatsapp:      fullPhone,
          subject,
          grade,
          class_type:    classType,
          monthly_fee:   fee ? parseInt(fee) || 0 : 0,
          batch_id:      (classType === 'batch' && batchId) ? batchId : null,
          status:        'active',
          consent_given: false,
          created_at:    new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertErr || !student) {
        throw new Error(insertErr?.message ?? 'Insert failed')
      }

      // 3. Optionally create a session
      if (nextDate && nextTime) {
        await supabase.from('sessions').insert({
          tutor_id:       user.id,
          student_id:     student.id,
          scheduled_at:   `${nextDate}T${nextTime}`,
          status:         'scheduled',
          payment_status: payStatus === 'paid' ? 'paid' : 'pending',
          session_type:   classType === 'batch' ? 'batch' : 'individual',
          batch_id:       (classType === 'batch' && batchId) ? batchId : null,
        })
      }

      // 4. Optionally create a payment record
      if (payStatus === 'paid' || payStatus === 'not_paid') {
        // month_year always tracks the current calendar month so the payment
        // appears on the Payments page without needing to navigate months.
        // due_date uses the class date's month when provided (so the correct
        // monthly cycle due date is computed), falling back to today's month.
        const now = new Date()
        const monthYear = now.toISOString().slice(0, 7)

        const dueRef  = nextDate ? new Date(nextDate) : now
        const dueYear  = dueRef.getFullYear()
        const dueMonth = String(dueRef.getMonth() + 1).padStart(2, '0')
        const dueDateStr = tutorMonthlyDueDate
          ? `${dueYear}-${dueMonth}-${String(tutorMonthlyDueDate).padStart(2, '0')}`
          : null

        await supabase.from('payments').insert({
          tutor_id:     user.id,
          student_id:   student.id,
          amount_lkr:   fee ? parseInt(fee) || 0 : 0,
          payment_type: 'monthly',
          month_year:   monthYear,
          status:       payStatus === 'paid' ? 'paid' : 'pending',
          paid_at:      payStatus === 'paid' ? (paidOnDate ? new Date(paidOnDate).toISOString() : now.toISOString()) : null,
          due_date:     payStatus !== 'paid' && dueDateStr ? dueDateStr : null,
        })
      }

      // 5. Audit log (best-effort)
      try {
        await supabase.from('audit_logs').insert({
          tutor_id:  user.id,
          action:    'student_added_manually',
          entity:    'students',
          entity_id: student.id,
          new_value: { name: name.trim() },
        })
      } catch {
        // non-blocking
      }

      // 6. Success
      const finalName = name.trim()
      setAddedName(finalName)
      setSuccess(true)
      onStudentAdded(finalName)

    } catch {
      setGlobalError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Don't render when closed ───────────────────────────────────────────

  if (!open) return null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        aria-modal="true"
        role="dialog"
        aria-labelledby="add-student-title"
      >
        {/* Modal card */}
        <div
          className="relative w-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.1),0_3px_8px_rgba(0,0,0,0.05)] flex flex-col max-h-[90vh]"
          style={{
            maxWidth: 560,
            borderRadius: 20,
          }}
          // Mobile: full-screen feel via max-h + overflow-y-auto below
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#f1f3f5] flex-shrink-0">
            <div>
              <h2
                id="add-student-title"
                className="text-[1.05rem] font-extrabold text-[#1a1a2e] tracking-[-0.015em]"
              >
                Add Student
              </h2>
              <p className="text-[#6c757d] text-[0.78rem] mt-0.5">
                Add an existing student to start tracking their classes
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:text-[#1a1a2e] transition-all ml-3 flex-shrink-0 mt-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="overflow-y-auto flex-1 px-6 py-5">

            {success ? (
              <SuccessView
                name={addedName}
                onAddAnother={resetForm}
                onDone={onClose}
              />
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">

                {/* Global error banner */}
                {globalError && (
                  <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <p className="text-[#c92a2a] text-[0.78rem] font-semibold">{globalError}</p>
                  </div>
                )}

                {/* 1. Student name */}
                <div>
                  <label htmlFor="asm-name" className={labelCls}>
                    Student name <span className="text-[#c92a2a]">*</span>
                  </label>
                  <input
                    id="asm-name"
                    type="text"
                    placeholder="Kavindu Perera"
                    value={name}
                    onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
                    className={inputCls(!!nameError)}
                    autoComplete="off"
                  />
                  {nameError && (
                    <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{nameError}</p>
                  )}
                </div>

                {/* 2. WhatsApp number */}
                <div>
                  <label htmlFor="asm-phone" className={labelCls}>
                    WhatsApp number <span className="text-[#c92a2a]">*</span>
                  </label>
                  <div className="flex gap-2">
                    <CountryDialSelect
                      value={countryCode}
                      onChange={code => { setCountryCode(code); if (phoneError) setPhoneError('') }}
                      hasError={!!phoneError}
                    />
                    <input
                      id="asm-phone"
                      type="tel"
                      placeholder={country.code === 'LK' ? '77 123 4567' : 'Local number'}
                      value={phone}
                      onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); if (phoneError) setPhoneError('') }}
                      maxLength={country.maxLength}
                      className={`flex-1 ${inputCls(!!phoneError)}`}
                      autoComplete="tel"
                    />
                  </div>
                  {phoneError ? (
                    <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{phoneError}</p>
                  ) : (
                    <p className="mt-1 text-[#adb5bd] text-[0.7rem]">
                      Students will receive reminders on this number
                    </p>
                  )}
                </div>

                {/* 3. Subject */}
                <div>
                  <label htmlFor="asm-subject" className={labelCls}>
                    Subject <span className="text-[#c92a2a]">*</span>
                  </label>
                  <select
                    id="asm-subject"
                    value={subject}
                    onChange={e => { setSubject(e.target.value); if (subjectError) setSubjectError('') }}
                    className={inputCls(!!subjectError)}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select subject…</option>
                    {subjectsForDropdown.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {subjectError && (
                    <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{subjectError}</p>
                  )}
                </div>

                {/* 4. Grade */}
                <div>
                  <label htmlFor="asm-grade" className={labelCls}>
                    Grade <span className="text-[#c92a2a]">*</span>
                  </label>
                  <select
                    id="asm-grade"
                    value={grade}
                    onChange={e => { setGrade(e.target.value); if (gradeError) setGradeError('') }}
                    disabled={!subject}
                    className={`${inputCls(!!gradeError)} disabled:opacity-50 disabled:cursor-not-allowed`}
                    style={{ cursor: subject ? 'pointer' : 'not-allowed' }}
                  >
                    <option value="">
                      {subject ? 'Select grade…' : 'Select subject first'}
                    </option>
                    {gradesForSubject.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  {gradeError && (
                    <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{gradeError}</p>
                  )}
                </div>

                {/* 5. Class type */}
                <div>
                  <label className={labelCls}>
                    Class type <span className="text-[#c92a2a]">*</span>
                  </label>

                  {/* No subject selected yet */}
                  {!subject && (
                    <p className="text-[0.75rem] text-[#adb5bd]">Select a subject to see available class types.</p>
                  )}

                  {/* Subject selected but needs grade for individual/trial, no batches either */}
                  {subject && !grade && batchesForSubject.length === 0 && (
                    <p className="text-[0.75rem] text-[#adb5bd]">Select a grade to see available class types.</p>
                  )}

                  {/* Subject + grade selected but nothing is configured */}
                  {subject && (grade || batchesForSubject.length > 0) && availableClassTypes.length === 0 && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-[10px] bg-[#fff9db] border border-[#ffec99]">
                      <span className="text-[#e67700] text-sm flex-shrink-0 mt-px">⚠</span>
                      <p className="text-[0.75rem] text-[#e67700] font-medium leading-snug">
                        No class types configured for this subject and grade.{' '}
                        <a href="/settings" target="_blank" className="underline font-bold">
                          Set up your availability in Settings
                        </a>{' '}
                        first.
                      </p>
                    </div>
                  )}

                  {/* Available options */}
                  {availableClassTypes.length > 0 && (
                    <PillRadio<ClassType>
                      options={availableClassTypes}
                      value={classType}
                      onChange={setClassType}
                    />
                  )}

                  {/* Group selector (shown when Group selected and groups exist for subject) */}
                  {classType === 'batch' && batchesForSubject.length > 0 && (
                    <div className="mt-3">
                      <label htmlFor="asm-batch" className={labelCls}>
                        Group
                      </label>
                      <select
                        id="asm-batch"
                        value={batchId}
                        onChange={e => setBatchId(e.target.value)}
                        className={inputNormal}
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="">No specific group</option>
                        {batchesForSubject.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* 6. Monthly fee */}
                <div>
                  <label htmlFor="asm-fee" className={labelCls}>
                    Monthly fee (LKR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6c757d] text-[0.78rem] font-semibold pointer-events-none select-none">
                      LKR
                    </span>
                    <input
                      id="asm-fee"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={fee}
                      onChange={e => setFee(e.target.value)}
                      className={`${inputNormal} pl-12`}
                    />
                  </div>
                  <p className="mt-1 text-[#adb5bd] text-[0.7rem]">
                    Pre-filled from your subject settings — you can override it
                  </p>
                </div>

                {/* 7. Next session */}
                <div>
                  <label className={labelCls}>
                    Next session{' '}
                    <span className="text-[#adb5bd] font-normal">(optional)</span>
                  </label>

                  {/* Suggestions — shown when schedule slots are configured */}
                  {suggestions.length > 0 && (
                    <div className="mb-2.5">
                      <p className="text-[0.68rem] text-[#adb5bd] font-medium mb-1.5">
                        Suggested from your schedule:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s, i) => {
                          const active = nextDate === s.date && nextTime === s.time
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => { setNextDate(s.date); setNextTime(s.time) }}
                              className={`flex flex-col items-start px-3 py-1.5 rounded-[8px] border text-left transition-all duration-150 ${
                                active
                                  ? 'bg-[#3b5bdb] border-[#3b5bdb] text-white shadow-[0_2px_8px_rgba(59,91,219,0.22)]'
                                  : 'bg-white border-[#ced4da] text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] hover:bg-[#edf2ff]'
                              }`}
                            >
                              <span className="text-[0.75rem] font-bold leading-tight">{s.label}</span>
                              {s.sublabel && (
                                <span className={`text-[0.65rem] leading-tight mt-0.5 ${active ? 'text-white/70' : 'text-[#adb5bd]'}`}>
                                  {s.sublabel}
                                </span>
                              )}
                            </button>
                          )
                        })}
                        {(nextDate || nextTime) && (
                          <button
                            type="button"
                            onClick={() => { setNextDate(''); setNextTime('') }}
                            className="px-3 py-1.5 rounded-[8px] border border-dashed border-[#ced4da] text-[0.72rem] text-[#adb5bd] hover:border-[#c92a2a] hover:text-[#c92a2a] transition-all"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <DateInput value={nextDate} onChange={setNextDate} />
                    <TimeSelect value={nextTime} onChange={setNextTime} />
                  </div>
                </div>

                {/* 8. Payment status this month */}
                <div>
                  <label className={labelCls}>
                    Payment status this month
                  </label>
                  <PillRadio<PaymentStatusChoice>
                    options={[
                      { value: 'not_paid',        label: 'Not paid yet' },
                      { value: 'paid',            label: 'Already paid ✅' },
                      { value: 'not_applicable',  label: 'Not applicable' },
                    ]}
                    value={payStatus}
                    onChange={setPayStatus}
                  />

                  {/* "Paid on" date — shown when already paid */}
                  {payStatus === 'paid' && (
                    <div className="mt-3">
                      <label className={labelCls}>Paid on</label>
                      <DateInput value={paidOnDate} onChange={setPaidOnDate} />
                    </div>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-[100px] bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-[0.88rem] shadow-[0_4px_14px_rgba(59,91,219,0.3)] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Spinner />
                      Adding&hellip;
                    </>
                  ) : (
                    'Add Student'
                  )}
                </button>

              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
