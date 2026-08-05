'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SubjectEntry } from '@/lib/types/subjects'
import type { Batch } from '@/app/(app)/batches/page'
import { TimeSelect } from '@/components/ui/DateTimeInput'

const inputBase =
  'w-full rounded-[10px] px-[13px] py-[9px] text-[0.82rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-white border-[1.5px]'
const inputNormal =
  `${inputBase} border-[#ced4da] focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)]`
const inputError =
  `${inputBase} border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:shadow-[0_0_0_3px_rgba(201,42,42,0.12)]`
const labelCls = 'block text-[#343a40] text-[0.72rem] font-semibold mb-1.5'

function inputCls(hasError: boolean) {
  return hasError ? inputError : inputNormal
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DURATIONS = [
  { value: 30,  label: '30 mins' },
  { value: 45,  label: '45 mins' },
  { value: 60,  label: '1 hour' },
  { value: 90,  label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 150, label: '2.5 hours' },
  { value: 180, label: '3 hours' },
]

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex items-center w-[42px] h-[24px] rounded-full transition-colors duration-200 flex-shrink-0 ${
        value ? 'bg-[#3b5bdb]' : 'bg-[#ced4da]'
      }`}
    >
      <span
        className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
          value ? 'translate-x-[21px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

interface Props {
  batch: Batch
  isOpen: boolean
  onClose: () => void
  onUpdated: (batch: Batch) => void
}

export default function EditBatchModal({ batch, isOpen, onClose, onUpdated }: Props) {
  const [tutorSubjects, setTutorSubjects] = useState<SubjectEntry[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)

  const [subject, setSubject]           = useState(batch.subject)
  const [grade, setGrade]               = useState(batch.grade)
  const [name, setName]                 = useState(batch.name)
  const [scheduleDay, setScheduleDay]   = useState(batch.schedule_day ?? '')
  const [scheduleTime, setScheduleTime] = useState(batch.schedule_time ?? '')
  const [duration, setDuration]         = useState(batch.session_duration_mins ?? 60)
  const [fee, setFee]                   = useState(String(batch.monthly_fee))
  const [maxStudents, setMaxStudents]   = useState(String(batch.max_students))
  const [acceptingNew, setAcceptingNew] = useState(batch.accepting_new)

  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving]         = useState(false)

  const scheduleChanged =
    scheduleDay !== (batch.schedule_day ?? '') ||
    scheduleTime !== (batch.schedule_time ?? '')

  useEffect(() => {
    if (!isOpen) return
    setTutorSubjects([])
    setLoadingSubjects(true)
    setSubject(batch.subject)
    setGrade(batch.grade)
    setName(batch.name)
    setScheduleDay(batch.schedule_day ?? '')
    setScheduleTime(batch.schedule_time ?? '')
    setDuration(batch.session_duration_mins ?? 60)
    setFee(String(batch.monthly_fee))
    setMaxStudents(String(batch.max_students))
    setAcceptingNew(batch.accepting_new)
    setErrors({})
    setSubmitError('')

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoadingSubjects(false); return }
      supabase
        .from('tutors')
        .select('subjects')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data && Array.isArray(data.subjects)) {
            setTutorSubjects(data.subjects as SubjectEntry[])
          }
          setLoadingSubjects(false)
        })
    })
  }, [isOpen, batch])

  if (!isOpen) return null

  const uniqueSubjects = Array.from(new Set(tutorSubjects.map(s => s.subject)))
  const gradesForSubject = subject
    ? (tutorSubjects.find(s => s.subject === subject)?.grades.map(g => g.grade) ?? [])
    : []

  const profileGroupFee = (() => {
    if (!subject || !grade) return null
    const gc = tutorSubjects.find(s => s.subject === subject)?.grades.find(g => g.grade === grade)
    if (!gc || !gc.batches || gc.batches.length === 0) return null
    return gc.batches[0]?.monthly_fee ?? null
  })()

  function validate() {
    const errs: Record<string, string> = {}
    if (!subject) errs.subject = 'Select a subject'
    if (!grade) errs.grade = 'Select a grade'
    if (!name.trim() || name.trim().length < 3) errs.name = 'Batch name must be at least 3 characters'
    if (!scheduleDay) errs.scheduleDay = 'Select a day'
    if (!scheduleTime) errs.scheduleTime = 'Select a time'
    const feeNum = parseInt(fee, 10)
    if (!fee || isNaN(feeNum) || feeNum <= 0) errs.fee = 'Enter a valid fee greater than 0'
    const maxNum = parseInt(maxStudents, 10)
    if (!maxStudents || isNaN(maxNum) || maxNum < 2) errs.maxStudents = 'Minimum 2 students'
    if (maxNum > 200) errs.maxStudents = 'Maximum 200 students'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const changes: Record<string, unknown> = {}
    if (name !== batch.name) changes.name = name.trim()
    if (subject !== batch.subject) changes.subject = subject
    if (grade !== batch.grade) changes.grade = grade
    if (scheduleDay !== (batch.schedule_day ?? '')) changes.schedule_day = scheduleDay
    if (scheduleTime !== (batch.schedule_time ?? '')) changes.schedule_time = scheduleTime
    if (duration !== (batch.session_duration_mins ?? 60)) changes.session_duration_mins = duration
    if (fee !== String(batch.monthly_fee)) changes.monthly_fee = parseInt(fee, 10)
    if (maxStudents !== String(batch.max_students)) changes.max_students = parseInt(maxStudents, 10)
    if (acceptingNew !== batch.accepting_new) changes.accepting_new = acceptingNew

    if (Object.keys(changes).length === 0) {
      onClose()
      return
    }

    setSaving(true)
    setSubmitError('')

    try {
      const res = await fetch(`/api/batches/${batch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })

      const json = await res.json() as { batch?: Batch; error?: string }

      if (!res.ok) {
        if (res.status === 409) {
          const msg = json.error ?? ''
          if (msg.toLowerCase().includes('name')) {
            setErrors(prev => ({ ...prev, name: msg || 'A batch with this name already exists' }))
          } else {
            setErrors(prev => ({ ...prev, scheduleTime: msg || 'You already have a batch at this time' }))
          }
        } else {
          setSubmitError(json.error ?? 'Something went wrong. Please try again.')
        }
        return
      }

      if (json.batch) {
        onUpdated(json.batch)
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[6px] z-[50]" onClick={onClose} />
      <div className="fixed z-[60] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-[560px] max-h-[90vh] flex flex-col bottom-0 left-1/2 -translate-x-1/2 rounded-b-none sm:rounded-b-[18px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">

        <div className="flex justify-center pt-3 pb-0 sm:hidden">
          <div className="w-[38px] h-[4px] bg-[#dee2e6] rounded-full" />
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f1f3f5] flex-shrink-0">
          <div>
            <h2 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em]">Edit batch</h2>
            <p className="text-[#6c757d] text-[0.72rem] mt-0.5 truncate max-w-[340px]">{batch.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:text-[#1a1a2e] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">

            {loadingSubjects ? (
              <div className="flex items-center gap-2 text-[#adb5bd] text-sm py-4">
                <Loader2 size={14} className="animate-spin" />
                Loading your subjects...
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls}>Subject <span className="text-[#c92a2a]">*</span></label>
                  <select
                    value={subject}
                    onChange={e => { setSubject(e.target.value); setGrade('') }}
                    className={inputCls(!!errors.subject)}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select subject...</option>
                    {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.subject && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{errors.subject}</p>}
                </div>

                <div>
                  <label className={labelCls}>Grade <span className="text-[#c92a2a]">*</span></label>
                  <select
                    value={grade}
                    onChange={e => setGrade(e.target.value)}
                    disabled={!subject}
                    className={`${inputCls(!!errors.grade)} disabled:opacity-50 disabled:cursor-not-allowed`}
                    style={{ cursor: subject ? 'pointer' : 'not-allowed' }}
                  >
                    <option value="">{subject ? 'Select grade...' : 'Select subject first'}</option>
                    {gradesForSubject.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {errors.grade && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{errors.grade}</p>}
                </div>

                <div>
                  <label className={labelCls}>Batch name <span className="text-[#c92a2a]">*</span></label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: '' })) }}
                    placeholder="e.g. A/L Maths 2027 Batch"
                    className={inputCls(!!errors.name)}
                  />
                  {errors.name && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Day <span className="text-[#c92a2a]">*</span></label>
                    <select
                      value={scheduleDay}
                      onChange={e => setScheduleDay(e.target.value)}
                      className={inputCls(!!errors.scheduleDay)}
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="">Select day...</option>
                      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {errors.scheduleDay && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{errors.scheduleDay}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>Time <span className="text-[#c92a2a]">*</span></label>
                    <TimeSelect
                      value={scheduleTime}
                      onChange={v => { setScheduleTime(v); if (errors.scheduleTime) setErrors(p => ({ ...p, scheduleTime: '' })) }}
                      placeholder="Select time"
                    />
                    {errors.scheduleTime && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{errors.scheduleTime}</p>}
                  </div>
                </div>

                {scheduleChanged && (
                  <div className="flex items-start gap-2 bg-[#fff9db] border border-[#ffec99] rounded-[10px] p-3">
                    <AlertTriangle size={13} className="text-[#e67700] flex-shrink-0 mt-0.5" />
                    <p className="text-[0.8rem] text-[#e67700]">
                      Changing the schedule will not automatically update existing sessions. Students will be notified only if you send them a message.
                    </p>
                  </div>
                )}

                <div>
                  <label className={labelCls}>Duration</label>
                  <select
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    className={inputNormal}
                    style={{ cursor: 'pointer' }}
                  >
                    {DURATIONS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Monthly fee (LKR) <span className="text-[#c92a2a]">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6c757d] text-[0.78rem] font-semibold pointer-events-none select-none">
                      LKR
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={fee}
                      onChange={e => { setFee(e.target.value); if (errors.fee) setErrors(p => ({ ...p, fee: '' })) }}
                      placeholder="0"
                      className={`${inputCls(!!errors.fee)} pl-12`}
                    />
                  </div>
                  {errors.fee && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{errors.fee}</p>}
                  {profileGroupFee != null && (
                    <p className="mt-1.5 text-[#6c757d] text-[0.72rem]">
                      Your profile rate for {subject} {grade}: LKR {profileGroupFee.toLocaleString()}.{' '}
                      <button
                        type="button"
                        onClick={() => setFee(String(profileGroupFee))}
                        className="text-[#3b5bdb] font-semibold hover:underline"
                      >
                        Use this rate
                      </button>
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Max students <span className="text-[#c92a2a]">*</span></label>
                  <input
                    type="number"
                    min="2"
                    max="200"
                    value={maxStudents}
                    onChange={e => { setMaxStudents(e.target.value); if (errors.maxStudents) setErrors(p => ({ ...p, maxStudents: '' })) }}
                    className={inputCls(!!errors.maxStudents)}
                  />
                  {errors.maxStudents
                    ? <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{errors.maxStudents}</p>
                    : <p className="mt-1 text-[#adb5bd] text-[0.72rem]">
                        Currently {batch.enrolled_count} student{batch.enrolled_count !== 1 ? 's' : ''} enrolled
                      </p>
                  }
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-[0.82rem] font-semibold text-[#343a40]">Accepting new students?</p>
                    <p className="text-[#adb5bd] text-[0.72rem] mt-0.5">
                      {acceptingNew ? 'Students can join via WhatsApp' : 'Batch is closed to new students'}
                    </p>
                  </div>
                  <Toggle value={acceptingNew} onChange={setAcceptingNew} />
                </div>
              </>
            )}

          </div>

          <div className="px-6 py-4 border-t border-[#f1f3f5] flex-shrink-0 bg-white">
            {submitError && (
              <div className="mb-3 px-4 py-2.5 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px]">
                <p className="text-[#c92a2a] text-[0.78rem] font-semibold">{submitError}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[10px] py-2.5 hover:border-[#adb5bd] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || loadingSubjects}
                className="flex-1 py-2.5 rounded-[10px] bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-[0.88rem] shadow-[0_4px_14px_rgba(59,91,219,0.3)] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving...
                  </>
                ) : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
