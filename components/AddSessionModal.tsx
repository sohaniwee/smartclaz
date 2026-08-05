'use client'

import { useState, useEffect } from 'react'
import { X, User, Users, Check, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DateInput, TimeSelect } from '@/components/ui/DateTimeInput'

// ── Props ──────────────────────────────────────────────────────────────────────

interface AddSessionModalProps {
  tutorId: string
  onClose: () => void
  onCreated: () => void
}

// ── Local types ────────────────────────────────────────────────────────────────

interface StudentOption {
  id: string
  name: string
  subject: string
  grade: string
  monthly_fee: number | null
  session_duration_mins: number | null
}

interface BatchOption {
  id: string
  name: string
  subject: string
  grade: string
  schedule_day: string | null
  schedule_time: string | null
  session_duration_mins: number | null
  monthly_fee: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0]

const inputBase =
  'w-full border-[1.5px] border-[#ced4da] rounded-[10px] px-3 py-2.5 text-[0.85rem] text-[#1a1a2e] outline-none focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)] bg-white transition-all placeholder:text-[#adb5bd]'

const labelCls = 'block text-[0.75rem] font-semibold text-[#343a40] mb-1.5'

function nextDayOfWeek(dayName: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const target = days.indexOf(dayName.toLowerCase())
  if (target === -1) return TODAY
  const now = new Date()
  const current = now.getDay()
  const diff = (target - current + 7) % 7 || 7
  const result = new Date(now)
  result.setDate(now.getDate() + diff)
  return result.toISOString().split('T')[0]
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AddSessionModal({ tutorId, onClose, onCreated }: AddSessionModalProps) {
  const [sessionType, setSessionType] = useState<'individual' | 'batch'>('individual')

  // Students
  const [students, setStudents]               = useState<StudentOption[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentSearch, setStudentSearch]     = useState('')

  // Batches
  const [batches, setBatches]             = useState<BatchOption[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState('')

  // Common fields
  const [date, setDate]           = useState(TODAY)
  const [time, setTime]           = useState('09:00')
  const [duration, setDuration]   = useState('60')

  // UI state
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving]           = useState(false)
  const [errors, setErrors]           = useState<Record<string, string>>({})

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tutorId) return
    const supabase = createClient()
    setLoadingData(true)
    Promise.all([
      supabase
        .from('students')
        .select('id, name, subject, grade, monthly_fee, session_duration_mins')
        .eq('tutor_id', tutorId)
        .eq('status', 'active')
        .neq('class_type', 'batch')
        .order('name', { ascending: true }),
      supabase
        .from('batches')
        .select('id, name, subject, grade, schedule_day, schedule_time, session_duration_mins, monthly_fee')
        .eq('tutor_id', tutorId)
        .eq('status', 'active')
        .order('name', { ascending: true }),
    ]).then(([studRes, batchRes]) => {
      setStudents(
        ((studRes.data ?? []) as StudentOption[]).map(s => ({
          id: s.id,
          name: s.name,
          subject: s.subject,
          grade: s.grade,
          monthly_fee: s.monthly_fee ?? null,
          session_duration_mins: s.session_duration_mins ?? null,
        }))
      )
      setBatches(
        ((batchRes.data ?? []) as BatchOption[]).map(b => ({
          id: b.id,
          name: b.name,
          subject: b.subject,
          grade: b.grade,
          schedule_day: b.schedule_day ?? null,
          schedule_time: b.schedule_time ?? null,
          session_duration_mins: b.session_duration_mins ?? null,
          monthly_fee: b.monthly_fee ?? null,
        }))
      )
      setLoadingData(false)
    })
  }, [tutorId])

  // ── Auto-fill duration from student ───────────────────────────────────────

  useEffect(() => {
    if (!selectedStudentId) return
    const student = students.find(s => s.id === selectedStudentId)
    if (student?.session_duration_mins) {
      setDuration(String(student.session_duration_mins))
    }
  }, [selectedStudentId, students])

  // ── Auto-fill date + time + duration from batch ───────────────────────────

  useEffect(() => {
    if (!selectedBatchId) return
    const batch = batches.find(b => b.id === selectedBatchId)
    if (!batch) return
    if (batch.session_duration_mins) setDuration(String(batch.session_duration_mins))
    if (batch.schedule_day)  setDate(nextDayOfWeek(batch.schedule_day))
    if (batch.schedule_time) setTime(batch.schedule_time.slice(0, 5))
  }, [selectedBatchId, batches])

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.subject?.toLowerCase().includes(studentSearch.toLowerCase())
  )

  const selectedStudent = students.find(s => s.id === selectedStudentId)
  const selectedBatch   = batches.find(b => b.id === selectedBatchId)

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (sessionType === 'individual' && !selectedStudentId) e.student = 'Please select a student'
    if (sessionType === 'batch'      && !selectedBatchId)  e.batch   = 'Please select a batch'
    if (!date) e.date = 'Please select a date'
    if (!time) e.time = 'Please select a time'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Submit via API route ───────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    setErrors({})
    try {
      const body =
        sessionType === 'individual'
          ? {
              student_id:     selectedStudentId,
              scheduled_at:   `${date}T${time}:00`,
              duration_mins:  parseInt(duration),
              zoom_link:      null,
              payment_status: 'pending',
              session_type:   'individual',
              tutor_id:       tutorId,
            }
          : {
              batch_id:       selectedBatchId,
              scheduled_at:   `${date}T${time}:00`,
              duration_mins:  parseInt(duration),
              zoom_link:      null,
              payment_status: 'pending',
              session_type:   'batch',
              tutor_id:       tutorId,
            }

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`)
      }

      onCreated()
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Failed to create session. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[18px] w-[520px] max-w-[95vw] shadow-[0_24px_80px_rgba(0,0,0,0.2)] flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#dee2e6] flex-shrink-0">
          <div>
            <h3 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em]">Add Session</h3>
            <p className="text-[0.72rem] text-[#6c757d] mt-0.5">Assign to a student or batch</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:bg-[#f8f9fa] transition-all"
          >
            <X size={14} className="text-[#6c757d]" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {loadingData ? (
            <div className="space-y-3 animate-pulse py-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-[#f1f3f5] rounded-[10px]" />
              ))}
            </div>
          ) : (
            <>

              {/* ── Session type toggle ── */}
              <div>
                <label className={labelCls}>Session type</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'individual' as const, icon: User,  label: 'Individual student', desc: '1-on-1 session' },
                    { value: 'batch'      as const, icon: Users, label: 'Batch class',         desc: 'All batch students' },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setSessionType(opt.value)
                        setSelectedStudentId('')
                        setSelectedBatchId('')
                        setStudentSearch('')
                        setErrors({})
                      }}
                      className={`flex items-start gap-3 p-3.5 rounded-[12px] border-2 text-left transition-all ${
                        sessionType === opt.value
                          ? 'border-[#3b5bdb] bg-[#edf2ff]'
                          : 'border-[#dee2e6] bg-white hover:border-[#adb5bd]'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        sessionType === opt.value ? 'bg-[#3b5bdb]' : 'bg-[#f1f3f5]'
                      }`}>
                        <opt.icon size={15} className={sessionType === opt.value ? 'text-white' : 'text-[#6c757d]'} />
                      </div>
                      <div>
                        <p className={`text-[0.82rem] font-bold ${sessionType === opt.value ? 'text-[#3b5bdb]' : 'text-[#1a1a2e]'}`}>
                          {opt.label}
                        </p>
                        <p className="text-[0.7rem] text-[#6c757d] mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Individual: student picker ── */}
              {sessionType === 'individual' && (
                <div>
                  <label className={labelCls}>Student</label>

                  {students.length === 0 ? (
                    <div className="flex items-start gap-2.5 p-3.5 bg-[#fff9db] border border-[#ffec99] rounded-[10px]">
                      <AlertCircle size={15} className="text-[#e67700] flex-shrink-0 mt-0.5" />
                      <p className="text-[0.78rem] text-[#e67700] font-medium">
                        No individual students found. Add students in the Students tab first.
                      </p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Search by name or subject..."
                        value={studentSearch}
                        onChange={e => { setStudentSearch(e.target.value); setSelectedStudentId('') }}
                        className={`${inputBase} mb-2`}
                      />
                      <div className="border-[1.5px] border-[#dee2e6] rounded-[10px] max-h-[200px] overflow-y-auto">
                        {filteredStudents.length === 0 ? (
                          <div className="py-4 text-center text-[0.8rem] text-[#adb5bd]">No students match</div>
                        ) : (
                          filteredStudents.map((s, i) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { setSelectedStudentId(s.id); setStudentSearch('') }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                i < filteredStudents.length - 1 ? 'border-b border-[#f1f3f5]' : ''
                              } ${
                                selectedStudentId === s.id
                                  ? 'bg-[#edf2ff]'
                                  : 'hover:bg-[#f8f9fa]'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 text-white text-[0.65rem] font-extrabold">
                                {getInitials(s.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[0.83rem] font-semibold text-[#1a1a2e] truncate">{s.name}</p>
                                <p className="text-[0.7rem] text-[#6c757d] truncate">
                                  {s.subject} · {s.grade}
                                  {s.monthly_fee ? ` · LKR ${s.monthly_fee.toLocaleString()}/mo` : ''}
                                </p>
                              </div>
                              {selectedStudentId === s.id && (
                                <Check size={14} className="text-[#3b5bdb] flex-shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}

                  {errors.student && (
                    <p className="text-[0.72rem] text-[#c92a2a] mt-1.5 flex items-center gap-1">
                      <AlertCircle size={11} /> {errors.student}
                    </p>
                  )}
                </div>
              )}

              {/* ── Batch: batch picker ── */}
              {sessionType === 'batch' && (
                <div>
                  <label className={labelCls}>Batch</label>

                  {batches.length === 0 ? (
                    <div className="flex items-start gap-2.5 p-3.5 bg-[#fff9db] border border-[#ffec99] rounded-[10px]">
                      <AlertCircle size={15} className="text-[#e67700] flex-shrink-0 mt-0.5" />
                      <p className="text-[0.78rem] text-[#e67700] font-medium">
                        No batches found. Create a batch in the Batches tab first.
                      </p>
                    </div>
                  ) : (
                    <div className="border-[1.5px] border-[#dee2e6] rounded-[10px] overflow-hidden">
                      {batches.map((b, i) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBatchId(b.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            i < batches.length - 1 ? 'border-b border-[#f1f3f5]' : ''
                          } ${
                            selectedBatchId === b.id
                              ? 'bg-[#edf2ff]'
                              : 'hover:bg-[#f8f9fa]'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-[8px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 text-white text-[0.65rem] font-extrabold">
                            {getInitials(b.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[0.83rem] font-semibold text-[#1a1a2e] truncate">{b.name}</p>
                            <p className="text-[0.7rem] text-[#6c757d] truncate">
                              {b.subject} · {b.grade}
                              {b.schedule_day ? ` · ${b.schedule_day}` : ''}
                              {b.schedule_time ? ` ${b.schedule_time.slice(0, 5)}` : ''}
                            </p>
                          </div>
                          {selectedBatchId === b.id && (
                            <Check size={14} className="text-[#3b5bdb] flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {errors.batch && (
                    <p className="text-[0.72rem] text-[#c92a2a] mt-1.5 flex items-center gap-1">
                      <AlertCircle size={11} /> {errors.batch}
                    </p>
                  )}
                </div>
              )}

              {/* ── Selected preview ── */}
              {(selectedStudent || selectedBatch) && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[#edf2ff] border border-[#dbe4ff] rounded-[10px]">
                  <div className="w-6 h-6 rounded-full bg-[#3b5bdb] flex items-center justify-center flex-shrink-0">
                    {sessionType === 'individual'
                      ? <User size={12} className="text-white" />
                      : <Users size={12} className="text-white" />
                    }
                  </div>
                  <p className="text-[0.78rem] font-semibold text-[#3b5bdb]">
                    {selectedStudent
                      ? `${selectedStudent.name} · ${selectedStudent.subject} ${selectedStudent.grade}`
                      : selectedBatch
                      ? `${selectedBatch.name} · attendance will be created for all active students`
                      : ''
                    }
                  </p>
                </div>
              )}

              {/* ── Date + Time ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <DateInput value={date} onChange={setDate} />
                  {errors.date && (
                    <p className="text-[0.72rem] text-[#c92a2a] mt-1">{errors.date}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <TimeSelect value={time} onChange={setTime} />
                  {errors.time && (
                    <p className="text-[0.72rem] text-[#c92a2a] mt-1">{errors.time}</p>
                  )}
                </div>
              </div>

              {/* ── Duration ── */}
              <div>
                <label className={labelCls}>Duration</label>
                <select
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  className={inputBase}
                >
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                  <option value="150">2.5 hours</option>
                  <option value="180">3 hours</option>
                </select>
                <p className="text-[0.7rem] text-[#adb5bd] mt-1">Auto-filled from student or batch profile</p>
              </div>



              {/* ── Submit error ── */}
              {errors.submit && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px]">
                  <AlertCircle size={15} className="text-[#c92a2a] flex-shrink-0 mt-0.5" />
                  <p className="text-[0.78rem] text-[#c92a2a] font-medium">{errors.submit}</p>
                </div>
              )}

            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-2 px-6 pb-5 pt-4 border-t border-[#dee2e6] flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border-[1.5px] border-[#ced4da] text-[#6c757d] rounded-[10px] py-2.5 text-[0.85rem] font-semibold hover:border-[#adb5bd] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || loadingData}
            className="flex-1 bg-[#3b5bdb] text-white rounded-[10px] py-2.5 text-[0.85rem] font-semibold hover:bg-[#4c6ef5] transition-all disabled:opacity-50 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
          >
            {saving ? 'Adding session…' : 'Add session'}
          </button>
        </div>

      </div>
    </div>
  )
}
