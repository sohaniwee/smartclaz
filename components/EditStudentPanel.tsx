'use client'

import { useState, useEffect } from 'react'
import { X, Info, Loader2, AlertTriangle, ChevronRight, CheckCircle2, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CountryDialSelect } from '@/components/CountryDialSelect'
import { findCountry, validatePhone } from '@/lib/countries'
import type { SubjectEntry } from '@/lib/types/subjects'

// ── Types ──────────────────────────────────────────────────────────────────

export interface EditableStudent {
  id: string
  tutor_id: string
  name: string
  whatsapp: string
  parent_name?: string
  parent_whatsapp?: string
  subject: string
  grade: string
  class_type: 'individual' | 'group' | 'trial'
  batch_id?: string
  batch_name?: string
  monthly_fee: number
  fee_type: 'monthly' | 'per_session'
  status: 'active' | 'inactive' | 'blocked'
  phone_history?: Array<{ old_number: string; changed_at: string; reason?: string }>
  status_reason?: string
  deactivated_at?: string
  consent_given: boolean
  consent_at?: string
  created_at: string
  current_payment_status?: 'paid' | 'pending' | 'overdue' | 'na'
}

export interface EditStudentPanelProps {
  student: EditableStudent
  isOpen: boolean
  onClose: () => void
  onSave: (updated: EditableStudent) => void
  onStatusChange: (id: string, status: 'active' | 'inactive' | 'blocked', reason?: string) => void
  tutorSubjects: SubjectEntry[]
  onMarkPaid?: () => void
  onMarkUnpaid?: () => void
}

// ── Style helpers ──────────────────────────────────────────────────────────

const inputBase =
  'w-full rounded-[10px] px-[13px] py-[9px] text-[0.82rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-white'
const inputNormal =
  `${inputBase} border-[1.5px] border-[#ced4da] focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)]`
const inputError =
  `${inputBase} border-[1.5px] border-[#c92a2a] bg-[#fff5f5] focus:border-[#c92a2a] focus:shadow-[0_0_0_3px_rgba(201,42,42,0.12)]`
const labelCls = 'block text-[#343a40] text-[0.72rem] font-semibold mb-1.5'

function inputCls(hasError: boolean) {
  return hasError ? inputError : inputNormal
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.12em] font-mono mb-3">
      {children}
    </p>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-[#edf2ff] text-[#3b5bdb] flex items-center justify-center font-bold text-sm flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function StatusBadge({ status }: { status: 'active' | 'inactive' | 'blocked' }) {
  const map: Record<string, string> = {
    active:   'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]',
    inactive: 'bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]',
    blocked:  'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${map[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

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

// ── Soft Delete Modal ──────────────────────────────────────────────────────

function SoftDeleteModal({
  studentName,
  onClose,
  onConfirm,
}: {
  studentName: string
  onClose: () => void
  onConfirm: (reason?: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    await onConfirm(reason.trim() || undefined)
    setSaving(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[70]" onClick={onClose} />
      <div className="fixed z-[80] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-sm p-6
        bottom-4 left-1/2 -translate-x-1/2
        sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <h3 className="font-extrabold text-[#1a1a2e] text-[1rem] mb-1">
          Mark {studentName} as inactive?
        </h3>
        <p className="text-[#6c757d] text-[0.8rem] mb-4">
          Their profile, payment history, and session records will be kept. You can reactivate them at any time.
        </p>
        <div className="mb-4">
          <label className={labelCls}>
            Reason <span className="text-[#adb5bd] font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Moved to another tutor, completed course..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            className={`${inputNormal} resize-none`}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[10px] py-2.5 hover:border-[#adb5bd] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 bg-[#e67700] hover:bg-[#d06200] text-white text-[0.82rem] font-semibold rounded-[10px] py-2.5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Mark as inactive
          </button>
        </div>
      </div>
    </>
  )
}

// ── Hard Delete Modal ──────────────────────────────────────────────────────

function HardDeleteModal({
  studentName,
  onClose,
  onConfirm,
}: {
  studentName: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)

  const isMatch = typed.trim().toLowerCase() === studentName.toLowerCase()

  async function handleConfirm() {
    if (!isMatch) return
    setSaving(true)
    await onConfirm()
    setSaving(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[70]" onClick={onClose} />
      <div className="fixed z-[80] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-sm p-6
        bottom-4 left-1/2 -translate-x-1/2
        sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#fff5f5] flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={17} className="text-[#c92a2a]" />
          </div>
          <h3 className="font-extrabold text-[#1a1a2e] text-[1rem]">
            Remove {studentName} permanently?
          </h3>
        </div>
        <p className="text-[#6c757d] text-[0.8rem] mb-4">
          This cannot be undone. All their sessions, payments, and conversation history will be deleted.
        </p>
        <div className="mb-4">
          <label className={labelCls}>
            Type <span className="text-[#c92a2a] font-bold">{studentName}</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={studentName}
            className={inputNormal}
            autoComplete="off"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[10px] py-2.5 hover:border-[#adb5bd] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isMatch || saving}
            className="flex-1 bg-[#c92a2a] hover:bg-[#a61e1e] text-white text-[0.82rem] font-semibold rounded-[10px] py-2.5 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Remove permanently
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export default function EditStudentPanel({
  student,
  isOpen,
  onClose,
  onSave,
  onStatusChange,
  tutorSubjects,
  onMarkPaid,
  onMarkUnpaid,
}: EditStudentPanelProps) {

  const [name, setName]                 = useState(student.name)
  const [countryCode, setCountryCode]   = useState('LK')
  const [localPhone, setLocalPhone]     = useState('')
  const [phoneReason, setPhoneReason]   = useState('')
  const [phoneChanged, setPhoneChanged] = useState(false)
  const [subject, setSubject]           = useState(student.subject)
  const [grade, setGrade]               = useState(student.grade)
  const [classType, setClassType]       = useState<'individual' | 'group' | 'trial'>(student.class_type)
  const [batchId, setBatchId]           = useState(student.batch_id ?? '')
  const [fee, setFee]                   = useState(String(student.monthly_fee))
  const [statusDraft, setStatusDraft]   = useState<'active' | 'inactive' | 'blocked'>(student.status)
  const [statusReason, setStatusReason] = useState(student.status_reason ?? '')
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState('')
  const [localPayStatus, setLocalPayStatus] = useState<'paid' | 'pending' | 'overdue' | 'na'>(student.current_payment_status ?? 'na')
  const [classTypeUnlocked, setClassTypeUnlocked] = useState(false)
  const [dangerOpen, setDangerOpen]     = useState(false)
  const [showSoftDelete, setShowSoftDelete] = useState(false)
  const [showHardDelete, setShowHardDelete] = useState(false)
  const [eligibleForHardDelete, setEligibleForHardDelete] = useState<boolean | null>(null)
  const [hardDeleteReason, setHardDeleteReason] = useState('')

  const [nameError, setNameError]   = useState('')
  const [phoneError, setPhoneError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName(student.name)
    setSubject(student.subject)
    setGrade(student.grade)
    setClassType(student.class_type)
    setBatchId(student.batch_id ?? '')
    setFee(String(student.monthly_fee))
    setStatusDraft(student.status)
    setStatusReason(student.status_reason ?? '')
    setLocalPayStatus(student.current_payment_status ?? 'na')
    setPhoneChanged(false)
    setPhoneReason('')
    setSaveError('')
    setNameError('')
    setPhoneError('')
    setClassTypeUnlocked(false)
    setDangerOpen(false)
    setEligibleForHardDelete(null)
    setHardDeleteReason('')

    const raw = student.whatsapp ?? ''
    if (raw.startsWith('+94')) {
      setCountryCode('LK')
      setLocalPhone(raw.slice(3))
    } else {
      setCountryCode('LK')
      setLocalPhone(raw.replace(/^\+\d{1,4}/, ''))
    }
  }, [isOpen, student])

  useEffect(() => {
    if (!dangerOpen || eligibleForHardDelete !== null) return
    async function check() {
      try {
        const res = await fetch(`/api/students/${student.id}/eligibility`)
        if (res.ok) {
          const json = await res.json() as { eligible: boolean; reason?: string }
          setEligibleForHardDelete(json.eligible)
          if (!json.eligible && json.reason) setHardDeleteReason(json.reason)
        } else {
          setEligibleForHardDelete(false)
          setHardDeleteReason('Could not check eligibility.')
        }
      } catch {
        setEligibleForHardDelete(false)
        setHardDeleteReason('Could not check eligibility.')
      }
    }
    check()
  }, [dangerOpen, student.id, eligibleForHardDelete])

  const country = findCountry(countryCode)
  const fullPhone = localPhone ? `${country.dialCode}${localPhone}` : ''

  const uniqueSubjects = Array.from(new Set(tutorSubjects.map(s => s.subject)))
  const gradesForSubject = subject
    ? tutorSubjects.find(s => s.subject === subject)?.grades.map(g => g.grade) ?? []
    : []
  const batchesForSubject = subject && grade
    ? (tutorSubjects.find(s => s.subject === subject)
        ?.grades.find(g => g.grade === grade)
        ?.batches ?? [])
    : []

  const profileFee = (() => {
    if (!subject || !grade) return null
    const gc = tutorSubjects
      .find(s => s.subject === subject)
      ?.grades.find(g => g.grade === grade)
    if (!gc) return null
    if (classType === 'individual') return gc.individual_fee || null
    if (classType === 'group') {
      const b = batchId
        ? gc.batches?.find(b => b.id === batchId)
        : gc.batches?.[0]
      return b?.monthly_fee ?? null
    }
    return null
  })()

  useEffect(() => {
    if (!localPhone) { setPhoneChanged(false); return }
    setPhoneChanged(fullPhone !== student.whatsapp && fullPhone !== '')
  }, [fullPhone, student.whatsapp, localPhone])

  function validate() {
    let ok = true
    if (!name.trim() || name.trim().length < 2) {
      setNameError('Name must be at least 2 characters')
      ok = false
    } else {
      setNameError('')
    }
    if (localPhone) {
      const err = validatePhone(localPhone, country)
      if (err) { setPhoneError(err); ok = false } else { setPhoneError('') }
    } else {
      setPhoneError('')
    }
    return ok
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    setSaveError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const updates: Record<string, unknown> = {
        name: name.trim(),
        subject,
        grade,
        class_type: classType,
        batch_id: classType === 'group' && batchId ? batchId : null,
        monthly_fee: parseInt(fee) || 0,
        status: statusDraft,
      }

      if (phoneChanged && fullPhone) {
        updates.whatsapp = fullPhone
        const history = student.phone_history ?? []
        updates.phone_history = [
          ...history,
          {
            old_number: student.whatsapp,
            changed_at: new Date().toISOString(),
            ...(phoneReason.trim() ? { reason: phoneReason.trim() } : {}),
          },
        ]
      }

      if (statusDraft !== 'active') {
        if (student.status === 'active') updates.deactivated_at = new Date().toISOString()
        if (statusReason.trim()) updates.status_reason = statusReason.trim()
      } else if (student.status !== 'active') {
        updates.deactivated_at = null
        updates.status_reason = null
      }

      const { error } = await supabase
        .from('students')
        .update(updates)
        .eq('id', student.id)

      if (error) throw error

      try {
        await supabase.from('audit_logs').insert({
          tutor_id: user.id,
          action: 'student_edited',
          entity: 'students',
          entity_id: student.id,
          new_value: { student_name: name.trim(), changes: Object.keys(updates) },
          status: 'success',
        })
      } catch { /* non-blocking */ }

      const updated: EditableStudent = {
        ...student,
        name: name.trim(),
        whatsapp: phoneChanged && fullPhone ? fullPhone : student.whatsapp,
        subject,
        grade,
        class_type: classType,
        batch_id: classType === 'group' && batchId ? batchId : undefined,
        monthly_fee: parseInt(fee) || 0,
        status: statusDraft,
        current_payment_status: localPayStatus,
        status_reason: (statusDraft !== 'active' && statusReason.trim())
          ? statusReason.trim()
          : undefined,
        phone_history: phoneChanged && fullPhone
          ? [
              ...(student.phone_history ?? []),
              {
                old_number: student.whatsapp,
                changed_at: new Date().toISOString(),
                ...(phoneReason.trim() ? { reason: phoneReason.trim() } : {}),
              },
            ]
          : student.phone_history,
      }

      onSave(updated)
      onClose()
    } catch {
      setSaveError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSoftDelete(reason?: string) {
    const supabase = createClient()
    await supabase.from('students').update({
      status: 'inactive',
      status_reason: reason ?? null,
      deactivated_at: new Date().toISOString(),
    }).eq('id', student.id)
    onStatusChange(student.id, 'inactive', reason)
    setShowSoftDelete(false)
    onClose()
  }

  async function handleHardDelete() {
    await fetch(`/api/students/${student.id}`, { method: 'DELETE' })
    onStatusChange(student.id, 'inactive')
    setShowHardDelete(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      <div
        className="fixed z-50 bg-white flex flex-col
          inset-0
          md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-[480px]
          md:shadow-[-8px_0_40px_rgba(0,0,0,0.12),_0_0_0_1px_rgba(0,0,0,0.06)]"
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-[#f1f3f5] flex items-center gap-3">
          <Avatar name={name || student.name} />
          <div className="flex-1 min-w-0">
            <p className="text-[#1a1a2e] text-sm font-bold leading-tight truncate">
              {name || student.name}
            </p>
            <p className="text-[#6c757d] text-[0.68rem] mt-0.5 truncate">{student.whatsapp}</p>
          </div>
          <StatusBadge status={statusDraft} />
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:text-[#1a1a2e] transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Section 1: Personal details */}
          <div className="px-6 py-5 border-b border-[#f8f9fa]">
            <SectionHeading>Personal details</SectionHeading>
            <div className="space-y-4">

              <div>
                <label className={labelCls}>
                  Full name <span className="text-[#c92a2a]">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
                  className={inputCls(!!nameError)}
                  placeholder="Student name"
                />
                {nameError && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{nameError}</p>}
              </div>

              <div>
                <label className={labelCls}>WhatsApp number</label>
                <div className="flex gap-2">
                  <CountryDialSelect
                    value={countryCode}
                    onChange={code => { setCountryCode(code); if (phoneError) setPhoneError('') }}
                    hasError={!!phoneError}
                  />
                  <input
                    type="tel"
                    placeholder={countryCode === 'LK' ? '77 123 4567' : 'Local number'}
                    value={localPhone}
                    onChange={e => {
                      setLocalPhone(e.target.value.replace(/\D/g, ''))
                      if (phoneError) setPhoneError('')
                    }}
                    className={`flex-1 ${inputCls(!!phoneError)}`}
                  />
                </div>
                {phoneError && <p className="mt-1 text-[#c92a2a] text-[0.72rem]">{phoneError}</p>}

                {phoneChanged && (
                  <div className="mt-2 p-3 bg-[#fff9db] border border-[#ffec99] rounded-[10px]">
                    <div className="flex items-start gap-2">
                      <Info size={13} className="text-[#e67700] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[#e67700] text-[0.72rem] font-semibold">
                          Old number ({student.whatsapp}) will be saved in history
                        </p>
                        <textarea
                          rows={2}
                          placeholder="Reason for change (optional)"
                          value={phoneReason}
                          onChange={e => setPhoneReason(e.target.value)}
                          className="mt-2 w-full rounded-[8px] px-3 py-2 text-[0.78rem] text-[#1a1a2e] placeholder:text-[#adb5bd] border-[1.5px] border-[#ffec99] bg-white focus:border-[#e67700] focus:outline-none resize-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Class details */}
          <div className="px-6 py-5 border-b border-[#f8f9fa]">
            <SectionHeading>Class details</SectionHeading>
            <div className="space-y-4">

              <div>
                <label className={labelCls}>Subject</label>
                <select
                  value={subject}
                  onChange={e => { setSubject(e.target.value); setGrade(''); setBatchId('') }}
                  className={inputNormal}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Select subject...</option>
                  {uniqueSubjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Grade</label>
                <select
                  value={grade}
                  onChange={e => { setGrade(e.target.value); setBatchId('') }}
                  disabled={!subject}
                  className={`${inputNormal} disabled:opacity-50 disabled:cursor-not-allowed`}
                  style={{ cursor: subject ? 'pointer' : 'not-allowed' }}
                >
                  <option value="">{subject ? 'Select grade...' : 'Select subject first'}</option>
                  {gradesForSubject.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls} style={{ marginBottom: 0 }}>Class type</label>
                  {!classTypeUnlocked ? (
                    <button
                      type="button"
                      onClick={() => setClassTypeUnlocked(true)}
                      className="text-[0.7rem] font-semibold text-[#3b5bdb] hover:underline"
                    >
                      Edit
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setClassTypeUnlocked(false); setClassType(student.class_type); setBatchId(student.batch_id ?? '') }}
                      className="text-[0.7rem] font-semibold text-[#6c757d] hover:text-[#343a40] hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {classTypeUnlocked ? (
                  <PillRadio<'individual' | 'group' | 'trial'>
                    options={[
                      { value: 'individual', label: 'Individual' },
                      { value: 'group',      label: 'Group' },
                      { value: 'trial',      label: 'Trial' },
                    ]}
                    value={classType}
                    onChange={v => { setClassType(v); setBatchId('') }}
                  />
                ) : (
                  <div className="inline-flex items-center px-4 py-1.5 rounded-full text-[0.78rem] font-semibold border bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.22)]">
                    {classType === 'individual' ? 'Individual' : classType === 'group' ? 'Group' : 'Trial'}
                  </div>
                )}

                {classType === 'group' && batchesForSubject.length > 0 && (
                  <div className="mt-3">
                    <label className={labelCls}>Group / Batch</label>
                    <select
                      value={batchId}
                      onChange={e => setBatchId(e.target.value)}
                      className={inputNormal}
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="">No specific batch</option>
                      {batchesForSubject.map(b => (
                        <option key={b.id ?? b.name} value={b.id ?? ''}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Fee */}
          <div className="px-6 py-5 border-b border-[#f8f9fa]">
            <SectionHeading>Fee</SectionHeading>
            <div>
              <label className={labelCls}>Monthly fee (LKR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6c757d] text-[0.78rem] font-semibold pointer-events-none select-none">
                  LKR
                </span>
                <input
                  type="number"
                  min="0"
                  value={fee}
                  onChange={e => setFee(e.target.value)}
                  className={`${inputNormal} pl-12`}
                  placeholder="0"
                />
              </div>
              {profileFee != null && (
                <p className="mt-1.5 text-[#6c757d] text-[0.72rem]">
                  Profile rate for {subject} {grade}: LKR {profileFee.toLocaleString()}.{' '}
                  <button
                    type="button"
                    onClick={() => setFee(String(profileFee))}
                    className="text-[#3b5bdb] font-semibold hover:underline"
                  >
                    Reset to profile rate
                  </button>
                </p>
              )}
            </div>
          </div>

          {/* Section 4: Payment */}
          {(onMarkPaid || onMarkUnpaid) && (
            <div className="px-6 py-5 border-b border-[#f8f9fa]">
              <SectionHeading>This month&apos;s payment</SectionHeading>

              {/* Status card */}
              <div className={`rounded-[12px] border px-4 py-3 flex items-center justify-between gap-3 ${
                localPayStatus === 'paid'    ? 'bg-[#ebfbee] border-[#b2f2bb]' :
                localPayStatus === 'overdue' ? 'bg-[#fff5f5] border-[#ffc9c9]' :
                localPayStatus === 'pending' ? 'bg-[#fff9db] border-[#ffec99]' :
                                               'bg-[#f8f9fa] border-[#dee2e6]'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    localPayStatus === 'paid'    ? 'bg-[#2f9e44]/10' :
                    localPayStatus === 'overdue' ? 'bg-[#c92a2a]/10' :
                    localPayStatus === 'pending' ? 'bg-[#e67700]/10' :
                                                   'bg-[#adb5bd]/10'
                  }`}>
                    {localPayStatus === 'paid'    && <CheckCircle2 size={15} className="text-[#2f9e44]" />}
                    {localPayStatus === 'overdue' && <AlertTriangle size={15} className="text-[#c92a2a]" />}
                    {localPayStatus === 'pending' && <RotateCcw size={15} className="text-[#e67700]" />}
                    {localPayStatus === 'na'      && <Info size={15} className="text-[#adb5bd]" />}
                  </div>
                  <div>
                    <p className={`text-[0.82rem] font-bold leading-tight ${
                      localPayStatus === 'paid'    ? 'text-[#2f9e44]' :
                      localPayStatus === 'overdue' ? 'text-[#c92a2a]' :
                      localPayStatus === 'pending' ? 'text-[#e67700]' :
                                                     'text-[#6c757d]'
                    }`}>
                      {localPayStatus === 'paid'    ? 'Payment received' :
                       localPayStatus === 'overdue' ? 'Overdue' :
                       localPayStatus === 'pending' ? 'Awaiting payment' :
                                                      'No payment record'}
                    </p>
                    <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">
                      {localPayStatus === 'paid'    ? 'Confirmed for this month' :
                       localPayStatus === 'overdue' ? 'Past grace period, access may be restricted' :
                       localPayStatus === 'pending' ? 'Not yet confirmed by you' :
                                                      'No fee record found for this month'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action button */}
              <div className="mt-3">
                {(localPayStatus === 'pending' || localPayStatus === 'overdue') && onMarkPaid && (
                  <button
                    type="button"
                    onClick={() => { onMarkPaid(); setLocalPayStatus('paid') }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] bg-[#2f9e44] hover:bg-[#257a36] text-white text-[0.82rem] font-semibold transition-all shadow-[0_2px_8px_rgba(47,158,68,0.25)]"
                  >
                    <CheckCircle2 size={14} />
                    Mark as paid
                  </button>
                )}
                {localPayStatus === 'paid' && onMarkUnpaid && (
                  <button
                    type="button"
                    onClick={() => { onMarkUnpaid(); setLocalPayStatus('pending') }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border-[1.5px] border-[#ffec99] bg-[#fff9db] text-[#e67700] text-[0.82rem] font-semibold hover:bg-[#ffec99] transition-all"
                  >
                    <RotateCcw size={14} />
                    Mark as unpaid
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Section 5: Status */}
          <div className="px-6 py-5 border-b border-[#f8f9fa]">
            <SectionHeading>Status</SectionHeading>
            <PillRadio<'active' | 'inactive' | 'blocked'>
              options={[
                { value: 'active',   label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'blocked',  label: 'Blocked' },
              ]}
              value={statusDraft}
              onChange={setStatusDraft}
            />
            {(statusDraft === 'inactive' || statusDraft === 'blocked') && (
              <div className="mt-3">
                <label className={labelCls}>
                  Reason <span className="text-[#adb5bd] font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder={
                    statusDraft === 'blocked'
                      ? 'e.g. Overdue payment after grace period...'
                      : 'e.g. Completed course, moved abroad...'
                  }
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  className={`${inputNormal} resize-none`}
                />
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="px-6 py-5">
            <button
              type="button"
              onClick={() => setDangerOpen(v => !v)}
              className="flex items-center gap-2 text-[#c92a2a] text-[0.78rem] font-semibold hover:underline"
            >
              <ChevronRight
                size={14}
                className={`transition-transform duration-200 ${dangerOpen ? 'rotate-90' : ''}`}
              />
              Danger zone
            </button>

            {dangerOpen && (
              <div className="mt-3 space-y-2 border border-[#ffc9c9] rounded-[12px] p-4 bg-[#fff5f5]">
                <p className="text-[#c92a2a] text-[0.72rem] font-semibold mb-3">
                  These actions affect this student&apos;s records.
                </p>

                {student.status !== 'inactive' && (
                  <button
                    type="button"
                    onClick={() => setShowSoftDelete(true)}
                    className="w-full text-left px-4 py-2.5 rounded-[10px] border border-[#ffec99] bg-[#fff9db] text-[#e67700] text-[0.8rem] font-semibold hover:bg-[#fff3c4] transition-colors"
                  >
                    Mark as inactive
                  </button>
                )}

                {eligibleForHardDelete === true ? (
                  <button
                    type="button"
                    onClick={() => setShowHardDelete(true)}
                    className="w-full text-left px-4 py-2.5 rounded-[10px] border border-[#ffc9c9] bg-white text-[#c92a2a] text-[0.8rem] font-semibold hover:bg-[#fff5f5] transition-colors"
                  >
                    Remove student permanently
                  </button>
                ) : eligibleForHardDelete === false ? (
                  <div className="px-4 py-2.5 rounded-[10px] border border-[#dee2e6] bg-white">
                    <p className="text-[#6c757d] text-[0.78rem] font-semibold">Cannot remove permanently</p>
                    <p className="text-[#adb5bd] text-[0.72rem] mt-0.5">{hardDeleteReason}</p>
                    {student.status !== 'inactive' && (
                      <button
                        type="button"
                        onClick={() => setShowSoftDelete(true)}
                        className="mt-2 text-[#3b5bdb] text-[0.72rem] font-semibold hover:underline"
                      >
                        Mark as inactive instead
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-2 text-[#adb5bd] text-[0.72rem]">
                    Checking eligibility...
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Footer: Save */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-[#f1f3f5] bg-white">
          {saveError && (
            <div className="mb-3 px-4 py-2.5 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px]">
              <p className="text-[#c92a2a] text-[0.78rem] font-semibold">{saveError}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-[10px] bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-[0.88rem] shadow-[0_4px_14px_rgba(59,91,219,0.3)] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </div>

      {showSoftDelete && (
        <SoftDeleteModal
          studentName={student.name}
          onClose={() => setShowSoftDelete(false)}
          onConfirm={handleSoftDelete}
        />
      )}

      {showHardDelete && (
        <HardDeleteModal
          studentName={student.name}
          onClose={() => setShowHardDelete(false)}
          onConfirm={handleHardDelete}
        />
      )}
    </>
  )
}
