'use client'

// Step 2 of 4 — subjects, grades, individual/group classes, fees, availability slots
// Saves to tutors.subjects (JSONB) + tutors.teaching_style + batches table
// Redirects to /signup/payments on success

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SubjectEntry } from '@/lib/types/subjects'
import { detectTeachingStyle } from '@/lib/types/subjects'

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECTS = [
  'Mathematics', 'Science', 'English', 'Sinhala', 'Tamil',
  'ICT / Information Technology', 'Business Studies', 'History', 'Commerce',
  'Combined Mathematics', 'Chemistry', 'Physics', 'Biology',
  'Accounting', 'Economics', 'Others',
]

const GRADES = ['A/L', 'O/L', 'Grade 11', 'Grade 10', 'Grade 9', 'Grade 8', 'Grade 7', 'Grade 6', 'Grade 5']

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300]

const TIME_OPTIONS: { label: string; value: string }[] = (() => {
  const opts: { label: string; value: string }[] = []
  for (let h = 5; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) continue
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const ampm = h < 12 ? 'AM' : 'PM'
      const h12 = h % 12 === 0 ? 12 : h % 12
      opts.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${ampm}` })
    }
  }
  return opts
})()

// ── Types ─────────────────────────────────────────────────────────────────────

type TrialType = 'none' | 'free' | 'paid'

type SlotDraft = { day: string; time: string }

type BatchDraft = {
  draftId: string
  name: string
  day: string
  time: string
  duration_mins: number
  monthly_fee: string
  max_students: string
  accepting_new: boolean
  trial_type: TrialType
  trial_fee: string
}

type GradeDraft = {
  grade: string
  has_individual: boolean
  individual_fee: string
  individual_duration_mins: number
  individual_slots: SlotDraft[]
  taking_new_individual: boolean
  individual_trial_type: TrialType
  individual_trial_fee: string
  has_group: boolean
  batches: BatchDraft[]
}

type SubjectDraft = {
  subject: string
  grades: GradeDraft[]
}

// ── Default factories ─────────────────────────────────────────────────────────

function makeBatchDraft(): BatchDraft {
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

function makeGradeDraft(grade: string): GradeDraft {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} hr${h > 1 ? 's' : ''}` : `${h}.5 hrs`
}

function convertFromDB(saved: SubjectEntry[]): SubjectDraft[] {
  return saved.map(s => ({
    subject: s.subject,
    grades: (s.grades || []).map(g => ({
      grade: g.grade,
      has_individual: g.has_individual,
      individual_fee: g.individual_fee > 0 ? String(g.individual_fee) : '',
      individual_duration_mins: g.individual_duration_mins || 60,
      individual_slots: g.individual_slots || [],
      taking_new_individual: g.taking_new_individual ?? true,
      individual_trial_type: g.individual_trial_type || 'none',
      individual_trial_fee: g.individual_trial_fee > 0 ? String(g.individual_trial_fee) : '',
      has_group: g.has_group,
      batches: (g.batches || []).length > 0
        ? (g.batches || []).map(b => ({
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
          }))
        : g.has_group ? [makeBatchDraft()] : [],
    })),
  }))
}

// ── Slot collection (shared by inline "Add slot" checks and submit validation) ─

// Collect all individual slots across all subjects/grades for conflict checking
type SlotRef = { subjectName: string; gradeName: string; label: string; day: string; time: string }
// Collect all batch slots for conflict checking
type BatchSlotRef = { subjectName: string; gradeName: string; batchName: string; day: string; time: string; draftId: string }

function collectAllSlots(drafts: SubjectDraft[]): { individualSlots: SlotRef[]; batchSlots: BatchSlotRef[] } {
  const individualSlots: SlotRef[] = []
  const batchSlots: BatchSlotRef[] = []

  for (const s of drafts) {
    for (const g of s.grades) {
      if (g.has_individual) {
        for (const slot of g.individual_slots) {
          individualSlots.push({
            subjectName: s.subject,
            gradeName: g.grade,
            label: `${s.subject} ${g.grade} individual`,
            day: slot.day,
            time: slot.time,
          })
        }
      }
      if (g.has_group) {
        for (const b of g.batches) {
          if (b.day && b.time) {
            batchSlots.push({
              subjectName: s.subject,
              gradeName: g.grade,
              batchName: b.name.trim() || `Batch`,
              day: b.day,
              time: b.time,
              draftId: b.draftId,
            })
          }
        }
      }
    }
  }

  return { individualSlots, batchSlots }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(drafts: SubjectDraft[]): Record<string, string> {
  const errors: Record<string, string> = {}
  if (drafts.length === 0) {
    errors.subjects = 'Select at least one subject'
    return errors
  }

  const { individualSlots: allIndividualSlots, batchSlots: allBatchSlots } = collectAllSlots(drafts)

  for (const s of drafts) {
    if (s.grades.length === 0) {
      errors[`${s.subject}_grades`] = `Select at least one grade for ${s.subject}`
    }
    for (const g of s.grades) {
      if (!g.has_individual && !g.has_group) {
        errors[`${s.subject}_${g.grade}_type`] = `Enable group or individual for ${s.subject} ${g.grade}`
      }
      if (g.has_group) {
        // Collect batch names within this grade for uniqueness check
        const namesInGrade: string[] = []
        for (const b of g.batches) {
          const id = b.draftId

          // name: required, min 3, unique within grade
          const trimmedName = b.name.trim()
          if (!trimmedName) {
            errors[`batch_${id}_name`] = 'Batch name is required'
          } else if (trimmedName.length < 3) {
            errors[`batch_${id}_name`] = 'Batch name must be at least 3 characters'
          } else if (namesInGrade.includes(trimmedName.toLowerCase())) {
            errors[`batch_${id}_name`] = 'Another batch already has this name.'
          } else {
            namesInGrade.push(trimmedName.toLowerCase())
          }

          // monthly_fee
          if (!b.monthly_fee || isNaN(Number(b.monthly_fee)) || Number(b.monthly_fee) <= 0) {
            errors[`batch_${id}_fee`] = 'Monthly fee required'
          }

          // day
          if (!b.day) {
            errors[`batch_${id}_day`] = 'Please select the class day'
          }

          // time
          if (!b.time) {
            errors[`batch_${id}_time`] = 'Please select the class time'
          }

          // day + time conflict with other batches
          if (b.day && b.time && !errors[`batch_${id}_day`] && !errors[`batch_${id}_time`]) {
            // Check against other batches (not self)
            const conflictingBatch = allBatchSlots.find(
              ref => ref.draftId !== id && ref.day === b.day && ref.time === b.time
            )
            if (conflictingBatch) {
              const timeLabel = TIME_OPTIONS.find(t => t.value === b.time)?.label ?? b.time
              errors[`batch_${id}_conflict`] =
                `You already have a class on ${b.day} at ${timeLabel}: ${conflictingBatch.batchName}`
            } else {
              // Check against individual slots
              const conflictingSlot = allIndividualSlots.find(
                ref => ref.day === b.day && ref.time === b.time
              )
              if (conflictingSlot) {
                const timeLabel = TIME_OPTIONS.find(t => t.value === b.time)?.label ?? b.time
                errors[`batch_${id}_conflict`] =
                  `You already have a class on ${b.day} at ${timeLabel}: ${conflictingSlot.label}`
              }
            }
          }

          // max_students: min 2
          if (!b.max_students || isNaN(Number(b.max_students)) || Number(b.max_students) < 2) {
            errors[`batch_${id}_max`] = Number(b.max_students) === 1
              ? 'Minimum 2 students required for a group class'
              : 'Max students required'
          }

          // trial_fee when paid
          if (b.trial_type === 'paid') {
            if (!b.trial_fee || isNaN(Number(b.trial_fee)) || Number(b.trial_fee) <= 0) {
              errors[`batch_${id}_trial_fee`] = 'Trial fee required'
            } else if (
              b.monthly_fee &&
              !isNaN(Number(b.monthly_fee)) &&
              Number(b.trial_fee) >= Number(b.monthly_fee)
            ) {
              errors[`batch_${id}_trial_fee`] = 'Trial fee must be less than the monthly fee'
            }
          }
        }
      }
      if (g.has_individual) {
        if (!g.individual_fee || isNaN(Number(g.individual_fee)))
          errors[`${s.subject}_${g.grade}_ind_fee`] = 'Individual fee required'
        if (
          g.individual_trial_type === 'paid' &&
          (!g.individual_trial_fee || isNaN(Number(g.individual_trial_fee)))
        )
          errors[`${s.subject}_${g.grade}_trial_fee`] = 'Trial fee required'
        if (g.individual_slots.length === 0)
          errors[`${s.subject}_${g.grade}_slots`] = 'Add at least one availability slot'
        else {
          // Same day+time reused elsewhere — another subject/grade's
          // individual slots, or a batch — would double-book the tutor.
          for (const slot of g.individual_slots) {
            const conflictingIndividual = allIndividualSlots.find(
              ref =>
                !(ref.subjectName === s.subject && ref.gradeName === g.grade) &&
                ref.day === slot.day && ref.time === slot.time
            )
            const conflictingBatch = !conflictingIndividual && allBatchSlots.find(
              ref => ref.day === slot.day && ref.time === slot.time
            )
            const conflict = conflictingIndividual || conflictingBatch
            if (conflict) {
              const timeLabel = TIME_OPTIONS.find(t => t.value === slot.time)?.label ?? slot.time
              const label = 'batchName' in conflict ? conflict.batchName : conflict.label
              errors[`${s.subject}_${g.grade}_slot_conflict`] =
                `You already have a class on ${slot.day} at ${timeLabel}: ${label}`
              break
            }
          }
        }
      }
    }
  }
  return errors
}

// ── Shared input / select class ───────────────────────────────────────────────

const inputCls =
  'w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-white focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] appearance-none'

const inputErrCls =
  'w-full border border-[#c92a2a] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none transition-all bg-[#fff5f5] focus:border-[#c92a2a] focus:ring-[3px] focus:ring-[rgba(201,42,42,0.12)] appearance-none'

// ── Sub-components ────────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
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

const TrialToggle = ({
  value,
  onChange,
}: {
  value: TrialType
  onChange: (v: TrialType) => void
}) => (
  <div className="flex items-center gap-0.5 bg-white border border-[#ced4da] rounded-[8px] p-0.5 w-fit">
    {(['none', 'free', 'paid'] as TrialType[]).map(opt => (
      <button
        key={opt}
        type="button"
        onClick={() => onChange(opt)}
        className={`text-xs font-semibold px-3 py-1.5 rounded-[6px] transition-all ${
          value === opt ? 'bg-[#3b5bdb] text-white shadow-sm' : 'text-[#6c757d] hover:text-[#1a1a2e]'
        }`}
      >
        {opt === 'none' ? 'No Trial' : opt === 'free' ? 'Free Trial' : 'Paid Trial'}
      </button>
    ))}
  </div>
)

// ── StepProgress ──────────────────────────────────────────────────────────────

function StepProgress({ current }: { current: number }) {
  const steps = ['Profile', 'Classes', 'Payments', 'Preferences']
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done
                    ? 'bg-[#3b5bdb] text-white'
                    : active
                    ? 'bg-[#3b5bdb] text-white ring-4 ring-[#edf2ff]'
                    : 'bg-[#f1f3f5] text-[#adb5bd]'
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
              <div
                className={`flex-1 h-px mx-2 mb-4 ${done ? 'bg-[#3b5bdb]' : 'bg-[#dee2e6]'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── BatchCard ─────────────────────────────────────────────────────────────────

const BatchCard = ({
  batch,
  index,
  isOnlyBatch,
  errors,
  nameInputRef,
  onUpdate,
  onRemove,
}: {
  batch: BatchDraft
  index: number
  isOnlyBatch: boolean
  errors: Record<string, string>
  nameInputRef?: React.RefObject<HTMLInputElement | null>
  onUpdate: (field: keyof BatchDraft, value: string | number | boolean | TrialType) => void
  onRemove: () => void
}) => {
  const id = batch.draftId
  const [showLastConfirm, setShowLastConfirm] = useState(false)

  // Dynamic header label
  const headerLabel = `Batch ${index + 1}${batch.name.trim() ? ` — ${batch.name.trim()}` : ''}`

  // Monthly fee and trial fee for preview
  const monthlyFeeNum = Number(batch.monthly_fee)
  const trialFeeNum = Number(batch.trial_fee)
  const showTrialPreview =
    batch.trial_type === 'paid' &&
    !isNaN(monthlyFeeNum) &&
    monthlyFeeNum > 0 &&
    !isNaN(trialFeeNum) &&
    trialFeeNum > 0 &&
    trialFeeNum < monthlyFeeNum

  const handleRemoveClick = () => {
    if (isOnlyBatch) {
      setShowLastConfirm(true)
    } else {
      onRemove()
    }
  }

  return (
    <div className="bg-white border border-[#dee2e6] rounded-[14px] p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#1a1a2e]">
          {headerLabel}
        </span>
        <button
          type="button"
          onClick={handleRemoveClick}
          className="w-6 h-6 rounded-full bg-[#fff5f5] hover:bg-[#ffc9c9] text-[#c92a2a] flex items-center justify-center transition-colors text-sm font-bold flex-shrink-0"
          aria-label={`Remove batch ${index + 1}`}
        >
          &times;
        </button>
      </div>

      {/* Last-batch remove confirmation */}
      {showLastConfirm && (
        <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-3 py-2.5 space-y-2">
          <p className="text-[#c92a2a] text-xs font-semibold leading-relaxed">
            Remove this batch? This will also turn off group classes for this grade.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowLastConfirm(false); onRemove() }}
              className="px-3 py-1.5 bg-[#c92a2a] text-white text-xs font-bold rounded-[8px] hover:bg-[#a61e1e] transition-colors"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setShowLastConfirm(false)}
              className="px-3 py-1.5 border border-[#dee2e6] text-[#343a40] text-xs font-bold rounded-[8px] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Batch name */}
      <div>
        <label className="block text-[#343a40] text-xs font-semibold mb-1">
          Batch name <span className="text-[#c92a2a]">*</span>
        </label>
        <input
          ref={nameInputRef as React.RefObject<HTMLInputElement>}
          type="text"
          placeholder="e.g. 2027 A/L Batch, Morning Group, Saturday Batch…"
          value={batch.name}
          onChange={e => onUpdate('name', e.target.value)}
          className={errors[`batch_${id}_name`] ? inputErrCls : inputCls}
        />
        {errors[`batch_${id}_name`] && (
          <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`batch_${id}_name`]}</p>
        )}
      </div>

      {/* Monthly fee */}
      <div>
        <label className="block text-[#343a40] text-xs font-semibold mb-1">
          Monthly fee (LKR) <span className="text-[#c92a2a]">*</span>
        </label>
        <input
          type="number"
          value={batch.monthly_fee}
          onChange={e => onUpdate('monthly_fee', e.target.value)}
          onWheel={e => e.currentTarget.blur()}
          min="1"
          className={errors[`batch_${id}_fee`] ? inputErrCls : inputCls}
        />
        {errors[`batch_${id}_fee`] && (
          <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`batch_${id}_fee`]}</p>
        )}
        {!errors[`batch_${id}_fee`] && monthlyFeeNum > 10000 && (
          <p className="mt-1 text-[#e67700] text-xs">Monthly fee seems high — double check the amount.</p>
        )}
      </div>

      {/* Day + Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[#343a40] text-xs font-semibold mb-1">Day</label>
          <select
            value={batch.day}
            onChange={e => onUpdate('day', e.target.value)}
            className={errors[`batch_${id}_day`] || errors[`batch_${id}_conflict`] ? inputErrCls : inputCls}
          >
            {DAYS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {errors[`batch_${id}_day`] && (
            <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`batch_${id}_day`]}</p>
          )}
        </div>
        <div>
          <label className="block text-[#343a40] text-xs font-semibold mb-1">Time</label>
          <select
            value={batch.time}
            onChange={e => onUpdate('time', e.target.value)}
            className={errors[`batch_${id}_time`] || errors[`batch_${id}_conflict`] ? inputErrCls : inputCls}
          >
            {TIME_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {errors[`batch_${id}_time`] && (
            <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`batch_${id}_time`]}</p>
          )}
        </div>
      </div>

      {/* Day+time conflict error (spans both columns) */}
      {errors[`batch_${id}_conflict`] && (
        <p className="text-[#c92a2a] text-xs" data-error>{errors[`batch_${id}_conflict`]}</p>
      )}

      {/* Duration + Max students */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[#343a40] text-xs font-semibold mb-1">Duration</label>
          <select
            value={String(batch.duration_mins)}
            onChange={e => onUpdate('duration_mins', parseInt(e.target.value))}
            className={inputCls}
          >
            {DURATIONS.map(d => (
              <option key={d} value={String(d)}>{durationLabel(d)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[#343a40] text-xs font-semibold mb-1">
            Max students <span className="text-[#c92a2a]">*</span>
          </label>
          <input
            type="number"
            value={batch.max_students}
            onChange={e => onUpdate('max_students', e.target.value)}
            onWheel={e => e.currentTarget.blur()}
            min="2"
            className={errors[`batch_${id}_max`] ? inputErrCls : inputCls}
          />
          {errors[`batch_${id}_max`] && (
            <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`batch_${id}_max`]}</p>
          )}
        </div>
      </div>

      {/* Accepting new students */}
      <div className="flex items-center justify-between bg-[#f8f9fa] rounded-[10px] border border-[#dee2e6] px-3 py-2.5">
        <span className="text-sm text-[#1a1a2e] font-medium">Accepting new students</span>
        <Toggle checked={batch.accepting_new} onChange={v => onUpdate('accepting_new', v)} />
      </div>

      {/* Trial type */}
      <div>
        <label className="block text-[#343a40] text-xs font-semibold mb-2">Trial class</label>
        <TrialToggle
          value={batch.trial_type}
          onChange={v => onUpdate('trial_type', v)}
        />
        {batch.trial_type === 'paid' && (
          <div className="mt-2">
            <input
              type="number"
              placeholder="Trial fee (LKR)"
              value={batch.trial_fee}
              onChange={e => onUpdate('trial_fee', e.target.value)}
              onWheel={e => e.currentTarget.blur()}
              min="1"
              className={errors[`batch_${id}_trial_fee`] ? inputErrCls : inputCls}
            />
            {errors[`batch_${id}_trial_fee`] && (
              <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`batch_${id}_trial_fee`]}</p>
            )}
            {showTrialPreview && (
              <p className="mt-1.5 text-[#3b5bdb] text-xs font-medium">
                First month: LKR {(monthlyFeeNum - trialFeeNum).toLocaleString()}
              </p>
            )}
          </div>
        )}
        {batch.trial_type === 'free' && (
          <p className="mt-1.5 text-[#2f9e44] text-xs font-medium">First class free — no payment needed.</p>
        )}
      </div>
    </div>
  )
}

// ── GradeSection ──────────────────────────────────────────────────────────────

const GradeSection = ({
  subjectName,
  grade,
  errors,
  onUpdate,
  onRemove,
  allIndividualSlots,
  allBatchSlots,
}: {
  subjectName: string
  grade: GradeDraft
  errors: Record<string, string>
  onUpdate: (updater: (g: GradeDraft) => GradeDraft) => void
  onRemove: () => void
  allIndividualSlots: SlotRef[]
  allBatchSlots: BatchSlotRef[]
}) => {
  const [slotDay, setSlotDay] = useState('')
  const [slotTime, setSlotTime] = useState('')
  const [slotErr, setSlotErr] = useState('')

  // Refs for newly added batch name inputs (to auto-focus on add)
  const newBatchNameRef = useRef<HTMLInputElement | null>(null)

  const addSlot = () => {
    if (!slotDay) { setSlotErr('Select a day'); return }
    if (!slotTime) { setSlotErr('Select a time'); return }
    const dup = grade.individual_slots.some(s => s.day === slotDay && s.time === slotTime)
    if (dup) { setSlotErr('That slot already exists'); return }

    const timeLabel = TIME_OPTIONS.find(t => t.value === slotTime)?.label ?? slotTime

    // Same day+time already used by another subject/grade's individual slots
    const conflictingIndividual = allIndividualSlots.find(
      ref =>
        !(ref.subjectName === subjectName && ref.gradeName === grade.grade) &&
        ref.day === slotDay && ref.time === slotTime
    )
    if (conflictingIndividual) {
      setSlotErr(`You already have a class on ${slotDay} at ${timeLabel}: ${conflictingIndividual.label}`)
      return
    }

    // Same day+time already used by a batch class
    const conflictingBatch = allBatchSlots.find(ref => ref.day === slotDay && ref.time === slotTime)
    if (conflictingBatch) {
      setSlotErr(`You already have a class on ${slotDay} at ${timeLabel}: ${conflictingBatch.batchName}`)
      return
    }

    setSlotErr('')
    onUpdate(g => ({
      ...g,
      individual_slots: [...g.individual_slots, { day: slotDay, time: slotTime }],
    }))
    setSlotDay('')
    setSlotTime('')
  }

  const removeSlot = (idx: number) => {
    onUpdate(g => ({
      ...g,
      individual_slots: g.individual_slots.filter((_, i) => i !== idx),
    }))
  }

  const addBatch = () => {
    onUpdate(g => ({ ...g, batches: [...g.batches, makeBatchDraft()] }))
    // Focus the new batch name input after React re-renders
    setTimeout(() => {
      if (newBatchNameRef.current) {
        newBatchNameRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        newBatchNameRef.current.focus()
      }
    }, 80)
  }

  const gradeKey = `${subjectName}_${grade.grade}`

  return (
    <div>
      <div className="space-y-3">
        {/* Type error */}
        {errors[`${gradeKey}_type`] && (
          <div className="mb-3 bg-[#fff5f5] border border-[#ffc9c9] rounded-[8px] px-3 py-2" data-error>
            <p className="text-[#c92a2a] text-xs font-semibold">{errors[`${gradeKey}_type`]}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── LEFT: Group Classes ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1a1a2e]">Group Classes</span>
              <Toggle
                checked={grade.has_group}
                onChange={v => onUpdate(g => ({
                  ...g,
                  has_group: v,
                  batches: v ? (g.batches.length === 0 ? [makeBatchDraft()] : g.batches) : [],
                }))}
              />
            </div>

            {grade.has_group && (
              <div className="space-y-3">
                {grade.batches.map((batch, bi) => {
                  const isLast = grade.batches.length === 1
                  // Only attach ref to the last batch card (the newly added one)
                  const isNewest = bi === grade.batches.length - 1
                  return (
                    <BatchCard
                      key={batch.draftId}
                      batch={batch}
                      index={bi}
                      isOnlyBatch={isLast}
                      errors={errors}
                      nameInputRef={isNewest ? newBatchNameRef : undefined}
                      onUpdate={(field, value) =>
                        onUpdate(g => ({
                          ...g,
                          batches: g.batches.map((b, i) =>
                            i === bi ? { ...b, [field]: value } : b
                          ),
                        }))
                      }
                      onRemove={() => {
                        if (isLast) {
                          // Last batch removed → turn off group
                          onUpdate(g => ({ ...g, has_group: false, batches: [] }))
                        } else {
                          onUpdate(g => ({
                            ...g,
                            batches: g.batches.filter((_, i) => i !== bi),
                          }))
                        }
                      }}
                    />
                  )
                })}

                {/* Add another batch button */}
                <div>
                  <button
                    type="button"
                    onClick={addBatch}
                    className="border border-[#3b5bdb] text-[#3b5bdb] bg-white rounded-full font-bold text-sm px-4 py-2 hover:bg-[#edf2ff] transition-colors duration-150"
                  >
                    + Add another batch
                  </button>

                </div>
              </div>
            )}

            {!grade.has_group && (
              <p className="text-[#adb5bd] text-xs italic">
                Toggle on to set up group classes for {grade.grade}.
              </p>
            )}
          </div>

          {/* ── RIGHT: Individual Classes ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1a1a2e]">Individual Classes</span>
              <Toggle
                checked={grade.has_individual}
                onChange={v => onUpdate(g => ({ ...g, has_individual: v }))}
              />
            </div>

            {grade.has_individual && (
              <div className="space-y-3">
                {/* Fee */}
                <div>
                  <label className="block text-[#343a40] text-xs font-semibold mb-1">
                    Fee (LKR/session) <span className="text-[#c92a2a]">*</span>
                  </label>
                  <input
                    type="number"
                    value={grade.individual_fee}
                    onChange={e =>
                      onUpdate(g => ({ ...g, individual_fee: e.target.value }))
                    }
                    onWheel={e => e.currentTarget.blur()}
                    min="1"
                    className={errors[`${gradeKey}_ind_fee`] ? inputErrCls : inputCls}
                  />
                  {errors[`${gradeKey}_ind_fee`] && (
                    <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`${gradeKey}_ind_fee`]}</p>
                  )}
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-[#343a40] text-xs font-semibold mb-1">Session duration</label>
                  <select
                    value={String(grade.individual_duration_mins)}
                    onChange={e =>
                      onUpdate(g => ({ ...g, individual_duration_mins: parseInt(e.target.value) }))
                    }
                    className={inputCls}
                  >
                    {DURATIONS.map(d => (
                      <option key={d} value={String(d)}>{durationLabel(d)}</option>
                    ))}
                  </select>
                </div>

                {/* Taking new students */}
                <div className="flex items-center justify-between bg-[#f8f9fa] rounded-[10px] border border-[#dee2e6] px-3 py-2.5">
                  <span className="text-sm text-[#1a1a2e] font-medium">Taking new students</span>
                  <Toggle
                    checked={grade.taking_new_individual}
                    onChange={v => onUpdate(g => ({ ...g, taking_new_individual: v }))}
                  />
                </div>

                {/* Availability slots */}
                <div>
                  <label className="block text-[#343a40] text-xs font-semibold mb-2">
                    Available slots <span className="text-[#c92a2a]">*</span>
                  </label>

                  {grade.individual_slots.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {grade.individual_slots.map((slot, si) => {
                        const opt = TIME_OPTIONS.find(t => t.value === slot.time)
                        return (
                          <div
                            key={si}
                            className="flex items-center gap-1 bg-[#edf2ff] border border-[#dbe4ff] text-[#3b5bdb] text-xs font-semibold rounded-full pl-3 pr-1.5 py-1"
                          >
                            <span>{slot.day.slice(0, 3)} · {opt?.label ?? slot.time}</span>
                            <button
                              type="button"
                              onClick={() => removeSlot(si)}
                              className="w-3.5 h-3.5 rounded-full bg-[#3b5bdb]/10 hover:bg-[#c92a2a]/10 text-[#3b5bdb] hover:text-[#c92a2a] flex items-center justify-center transition-colors text-[10px] font-bold"
                              aria-label="Remove slot"
                            >
                              &times;
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-[#adb5bd] text-xs italic mb-2">No slots added yet.</p>
                  )}

                  {errors[`${gradeKey}_slots`] && (
                    <p className="mb-2 text-[#c92a2a] text-xs" data-error>{errors[`${gradeKey}_slots`]}</p>
                  )}
                  {errors[`${gradeKey}_slot_conflict`] && (
                    <p className="mb-2 text-[#c92a2a] text-xs" data-error>{errors[`${gradeKey}_slot_conflict`]}</p>
                  )}

                  {/* Add slot row */}
                  <div className="flex gap-1.5 items-end">
                    <div className="flex-1">
                      <label className="block text-[#6c757d] text-xs font-semibold mb-1">Day</label>
                      <select
                        value={slotDay}
                        onChange={e => { setSlotDay(e.target.value); setSlotErr('') }}
                        className={inputCls}
                        aria-label="Slot day"
                      >
                        <option value="">Select</option>
                        {DAYS.map(d => (
                          <option key={d} value={d}>{d.slice(0, 3)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[#6c757d] text-xs font-semibold mb-1">Time</label>
                      <select
                        value={slotTime}
                        onChange={e => { setSlotTime(e.target.value); setSlotErr('') }}
                        className={inputCls}
                        aria-label="Slot time"
                      >
                        <option value="">Select</option>
                        {TIME_OPTIONS.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-shrink-0 pt-5">
                      <button
                        type="button"
                        onClick={addSlot}
                        className="px-3 py-[9px] border border-[#3b5bdb] text-[#3b5bdb] hover:bg-[#edf2ff] text-sm font-semibold rounded-[10px] transition-all whitespace-nowrap"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                  {slotErr && <p className="mt-1 text-[#c92a2a] text-xs">{slotErr}</p>}
                </div>

                {/* Individual trial */}
                <div>
                  <label className="block text-[#343a40] text-xs font-semibold mb-2">Trial class</label>
                  <TrialToggle
                    value={grade.individual_trial_type}
                    onChange={v => onUpdate(g => ({ ...g, individual_trial_type: v }))}
                  />
                  {grade.individual_trial_type === 'paid' && (
                    <div className="mt-2">
                      <input
                        type="number"
                        placeholder="Trial fee (LKR)"
                        value={grade.individual_trial_fee}
                        onChange={e =>
                          onUpdate(g => ({ ...g, individual_trial_fee: e.target.value }))
                        }
                        onWheel={e => e.currentTarget.blur()}
                        min="1"
                        className={errors[`${gradeKey}_trial_fee`] ? inputErrCls : inputCls}
                      />
                      {errors[`${gradeKey}_trial_fee`] && (
                        <p className="mt-1 text-[#c92a2a] text-xs" data-error>{errors[`${gradeKey}_trial_fee`]}</p>
                      )}
                    </div>
                  )}
                  {grade.individual_trial_type === 'free' && (
                    <p className="mt-1.5 text-[#2f9e44] text-xs font-medium">
                      First class free — no payment needed.
                    </p>
                  )}
                </div>
              </div>
            )}

            {!grade.has_individual && (
              <p className="text-[#adb5bd] text-xs italic">
                Toggle on to offer individual sessions for {grade.grade}.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SubjectSection ────────────────────────────────────────────────────────────

const SubjectSection = ({
  entry,
  errors,
  isExpanded,
  onToggleExpand,
  activeGrade,
  onSetActiveGrade,
  onRemove,
  onUpdate,
  allIndividualSlots,
  allBatchSlots,
}: {
  entry: SubjectDraft
  errors: Record<string, string>
  isExpanded: boolean
  onToggleExpand: () => void
  activeGrade: string | null
  onSetActiveGrade: (g: string) => void
  onRemove: () => void
  onUpdate: (updater: (s: SubjectDraft) => SubjectDraft) => void
  allIndividualSlots: SlotRef[]
  allBatchSlots: BatchSlotRef[]
}) => {
  const toggleGrade = (grade: string) => {
    onUpdate(s => {
      const has = s.grades.some(g => g.grade === grade)
      if (has) {
        const remaining = s.grades.filter(g => g.grade !== grade)
        if (activeGrade === grade && remaining.length > 0) {
          onSetActiveGrade(remaining[0].grade)
        }
        return { ...s, grades: remaining }
      } else {
        onSetActiveGrade(grade)
        return { ...s, grades: [...s.grades, makeGradeDraft(grade)] }
      }
    })
  }

  // Custom grade input state
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customGradeValue, setCustomGradeValue] = useState('')
  const [customGradeError, setCustomGradeError] = useState('')
  const customInputRef = useRef<HTMLInputElement>(null)

  const submitCustomGrade = () => {
    const trimmed = customGradeValue.trim()
    if (!trimmed) { setCustomGradeError('Enter a grade name'); return }
    if (entry.grades.some(g => g.grade.toLowerCase() === trimmed.toLowerCase())) {
      setCustomGradeError('This grade is already added'); return
    }
    toggleGrade(trimmed)
    setCustomGradeValue('')
    setCustomGradeError('')
    setShowCustomInput(false)
  }

  // Custom grades = grades in entry.grades not in the standard GRADES list
  const customGrades = entry.grades.filter(g => !GRADES.includes(g.grade))

  // Summary shown in collapsed state
  const gradeNames    = entry.grades.map(g => g.grade).join(', ')
  const hasInd        = entry.grades.some(g => g.has_individual)
  const hasGrp        = entry.grades.some(g => g.has_group)
  const typeSummary   = [hasInd && 'Individual', hasGrp && 'Group'].filter(Boolean).join(' + ')
  const isConfigured  = entry.grades.length > 0 && entry.grades.some(g => g.has_individual || g.has_group)
  const activeGradeData = entry.grades.find(g => g.grade === activeGrade)

  return (
    <div className={`border rounded-[14px] overflow-hidden bg-white transition-all duration-150 ${
      isExpanded
        ? 'border-[#3b5bdb] shadow-[0_0_0_3px_rgba(59,91,219,0.08)]'
        : 'border-[#dee2e6]'
    }`}>

      {/* ── Accordion header ── */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#f8f9ff] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Completion indicator */}
          {isConfigured ? (
            <span className="w-5 h-5 rounded-full bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white">&#10003;</span>
          ) : (
            <span className="w-5 h-5 rounded-full border-2 border-[#ced4da] flex-shrink-0" />
          )}
          <span className="font-bold text-[#1a1a2e] text-sm">{entry.subject}</span>
          {!isExpanded && gradeNames && (
            <span className="text-[#6c757d] text-xs truncate hidden sm:block">
              · {gradeNames}{typeSummary ? ` · ${typeSummary}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <span
            role="button"
            tabIndex={-1}
            onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onRemove())}
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-[#adb5bd] hover:text-[#c92a2a] px-1 text-lg leading-none transition-colors"
            aria-label={`Remove ${entry.subject}`}
          >
            &times;
          </span>
          <svg
            className={`w-4 h-4 text-[#6c757d] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <div className="border-t border-[#dee2e6]">

          {/* Grade chip picker */}
          <div className="px-5 py-4 bg-[#f8f9fa]">
            <p className="text-[#343a40] text-xs font-semibold mb-2.5">
              Which grades? <span className="text-[#c92a2a]">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {GRADES.map(grade => {
                const selected = entry.grades.some(g => g.grade === grade)
                return (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => toggleGrade(grade)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-150 ${
                      selected
                        ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                        : 'bg-white text-[#6c757d] border-[#ced4da] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                    }`}
                  >
                    {selected ? `${grade} ×` : `+ ${grade}`}
                  </button>
                )
              })}

              {/* Custom grade chips */}
              {customGrades.map(g => (
                <button
                  key={g.grade}
                  type="button"
                  onClick={() => toggleGrade(g.grade)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border bg-[#3b5bdb] text-white border-[#3b5bdb] transition-all duration-150"
                >
                  {g.grade} ×
                </button>
              ))}

              {/* Other button */}
              {!showCustomInput && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomInput(true)
                    setCustomGradeError('')
                    setTimeout(() => customInputRef.current?.focus(), 50)
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border border-dashed border-[#ced4da] text-[#6c757d] bg-white hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-all duration-150"
                >
                  + Other
                </button>
              )}
            </div>

            {/* Custom grade inline input */}
            {showCustomInput && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={customInputRef}
                  type="text"
                  value={customGradeValue}
                  onChange={e => { setCustomGradeValue(e.target.value); setCustomGradeError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitCustomGrade() } if (e.key === 'Escape') { setShowCustomInput(false); setCustomGradeValue(''); setCustomGradeError('') } }}
                  placeholder="e.g. Grade 4, Grade 3, Year 1…"
                  className="flex-1 border border-[#ced4da] rounded-[8px] px-3 py-1.5 text-xs focus:outline-none focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)]"
                />
                <button
                  type="button"
                  onClick={submitCustomGrade}
                  className="px-3 py-1.5 bg-[#3b5bdb] text-white text-xs font-bold rounded-[8px] hover:bg-[#4c6ef5] transition-colors flex-shrink-0"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustomInput(false); setCustomGradeValue(''); setCustomGradeError('') }}
                  className="px-3 py-1.5 border border-[#dee2e6] text-[#6c757d] text-xs font-bold rounded-[8px] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
            {customGradeError && (
              <p className="mt-1 text-[#c92a2a] text-xs">{customGradeError}</p>
            )}

            {errors[`${entry.subject}_grades`] && (
              <p className="mt-2 text-[#c92a2a] text-xs">{errors[`${entry.subject}_grades`]}</p>
            )}
          </div>

          {entry.grades.length > 0 ? (
            <>
              {/* Grade tab bar */}
              <div className="flex border-b border-[#dee2e6] bg-white overflow-x-auto">
                {entry.grades.map(g => {
                  const configured = g.has_individual || g.has_group
                  return (
                    <button
                      key={g.grade}
                      type="button"
                      onClick={() => onSetActiveGrade(g.grade)}
                      className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all -mb-px ${
                        activeGrade === g.grade
                          ? 'border-[#3b5bdb] text-[#3b5bdb] bg-white'
                          : 'border-transparent text-[#6c757d] hover:text-[#1a1a2e] hover:bg-[#f8f9fa]'
                      }`}
                    >
                      {g.grade}
                      {configured && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3b5bdb] flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Active grade config panel */}
              {activeGradeData ? (
                <div className="p-5">
                  <GradeSection
                    subjectName={entry.subject}
                    grade={activeGradeData}
                    errors={errors}
                    onUpdate={updater =>
                      onUpdate(s => ({
                        ...s,
                        grades: s.grades.map(g =>
                          g.grade === activeGradeData.grade ? updater(g) : g
                        ),
                      }))
                    }
                    onRemove={() => toggleGrade(activeGradeData.grade)}
                    allIndividualSlots={allIndividualSlots}
                    allBatchSlots={allBatchSlots}
                  />
                </div>
              ) : (
                <div className="px-5 py-4">
                  <p className="text-[#adb5bd] text-xs">Select a grade tab above.</p>
                </div>
              )}
            </>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[#adb5bd] text-sm">Select grades above to configure classes and fees.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

const SkeletonLoader = () => (
  <div className="w-full max-w-2xl lg:max-w-4xl">
    <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="w-7 h-7 rounded-full bg-[#f1f3f5] animate-pulse flex-shrink-0" />
            {i < 4 && <div className="flex-1 h-px mx-2 bg-[#dee2e6]" />}
          </div>
        ))}
      </div>
      <div className="h-7 bg-[#f1f3f5] rounded-[8px] w-1/2 mb-2 animate-pulse" />
      <div className="h-4 bg-[#f1f3f5] rounded-[8px] w-3/4 mb-8 animate-pulse" />
      <div className="flex flex-wrap gap-2 mb-6">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-8 w-24 bg-[#f1f3f5] rounded-full animate-pulse" />
        ))}
      </div>
      <div className="h-10 bg-[#f1f3f5] rounded-[10px] animate-pulse" />
    </div>
  </div>
)

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [subjectDrafts, setSubjectDrafts] = useState<SubjectDraft[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showOtherInput, setShowOtherInput] = useState(false)
  const [otherInput, setOtherInput] = useState('')
  // Accordion + grade-tab state
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null)
  const [activeGradeMap, setActiveGradeMap] = useState<Record<string, string>>({})

  // ── Auth check + load saved data ──────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/signup')
        return
      }
      setUserId(user.id)
      const { data } = await supabase
        .from('tutors')
        .select('subjects')
        .eq('id', user.id)
        .single()
      if (Array.isArray(data?.subjects) && data.subjects.length > 0) {
        const drafts = convertFromDB(data.subjects as SubjectEntry[])
        setSubjectDrafts(drafts)
        // Restore accordion state — expand first subject, set active grades
        if (drafts.length > 0) {
          setExpandedSubject(drafts[0].subject)
          const gradeMap: Record<string, string> = {}
          drafts.forEach(s => { if (s.grades.length > 0) gradeMap[s.subject] = s.grades[0].grade })
          setActiveGradeMap(gradeMap)
        }
      }
      setAuthChecked(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!authChecked) return <SkeletonLoader />

  // ── Handlers ──────────────────────────────────────────────────────────

  const selectedSubjectNames = subjectDrafts.map(s => s.subject)
  const { individualSlots: allIndividualSlots, batchSlots: allBatchSlots } = collectAllSlots(subjectDrafts)

  function toggleSubject(subject: string) {
    setSubjectDrafts(prev => {
      const exists = prev.some(s => s.subject === subject)
      if (!exists) setExpandedSubject(subject)
      else if (expandedSubject === subject) setExpandedSubject(null)
      return exists
        ? prev.filter(s => s.subject !== subject)
        : [...prev, { subject, grades: [] }]
    })
    setErrors(prev => {
      const next = { ...prev }
      delete next.subjects
      return next
    })
  }

  function addOtherSubject() {
    const name = otherInput.trim()
    if (!name) return
    if (subjectDrafts.some(s => s.subject === name)) return
    setExpandedSubject(name)
    setSubjectDrafts(prev => [...prev, { subject: name, grades: [] }])
    setOtherInput('')
    setShowOtherInput(false)
  }

  function updateSubject(subject: string, updater: (s: SubjectDraft) => SubjectDraft) {
    setSubjectDrafts(prev =>
      prev.map(s => (s.subject === subject ? updater(s) : s))
    )
  }

  // ── Submit ────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(subjectDrafts)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)

      // Expand the first subject that has an error so the user can see it
      const firstErrKey = Object.keys(errs)[0]
      const errSubject = subjectDrafts.find(s =>
        firstErrKey === 'subjects' ||
        firstErrKey.startsWith(s.subject + '_') ||
        s.grades.some(g =>
          g.batches?.some(b => firstErrKey.includes(b.draftId ?? ''))
        )
      )
      if (errSubject) {
        setExpandedSubject(errSubject.subject)
        // Also switch to the first grade with an error for this subject
        const errGrade = errSubject.grades.find(g =>
          Object.keys(errs).some(k =>
            k.startsWith(`${errSubject.subject}_${g.grade}`) ||
            g.batches?.some(b => k.includes(b.draftId))
          )
        )
        if (errGrade) {
          setActiveGradeMap(prev => ({ ...prev, [errSubject.subject]: errGrade.grade }))
        }
      }

      setTimeout(() => {
        const el = document.querySelector('[data-error]')
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 80)
      return
    }

    setSaving(true)
    const supabase = createClient()
    if (!userId) { setSaving(false); router.replace('/signup'); return }

    // Build subjects JSONB payload matching GradeConfig schema
    const subjects: SubjectEntry[] = subjectDrafts.map(s => ({
      subject: s.subject,
      grades: s.grades.map(g => ({
        grade: g.grade,
        has_individual: g.has_individual,
        individual_fee: g.has_individual ? Number(g.individual_fee) : 0,
        individual_duration_mins: g.individual_duration_mins,
        individual_slots: g.individual_slots,
        taking_new_individual: g.taking_new_individual,
        individual_trial_type: g.has_individual ? g.individual_trial_type : 'none',
        individual_trial_fee:
          g.has_individual && g.individual_trial_type === 'paid'
            ? Number(g.individual_trial_fee)
            : 0,
        has_group: g.has_group,
        batches: g.has_group
          ? g.batches.map(b => ({
              name: b.name.trim(),
              day: b.day,
              time: b.time,
              duration_mins: b.duration_mins,
              monthly_fee: Number(b.monthly_fee),
              max_students: Number(b.max_students),
              accepting_new: b.accepting_new,
              trial_type: b.trial_type,
              trial_fee: b.trial_type === 'paid' ? Number(b.trial_fee) : 0,
            }))
          : [],
      })),
    }))

    const teachingStyle = detectTeachingStyle(subjects)

    // 1. Update tutors table
    const { error: tutorErr } = await supabase
      .from('tutors')
      .update({ subjects, teaching_style: teachingStyle })
      .eq('id', userId)

    if (tutorErr) {
      setErrors({ submit: tutorErr.message })
      setSaving(false)
      return
    }

    // 2. Sync batches — delete old, insert new
    await supabase.from('batches').delete().eq('tutor_id', userId)

    const batchRows: Record<string, unknown>[] = []
    for (const s of subjects) {
      for (const g of s.grades) {
        if (g.has_group && g.batches.length > 0) {
          for (const b of g.batches) {
            batchRows.push({
              tutor_id: userId,
              name: b.name,
              subject: s.subject,
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
    }

    if (batchRows.length > 0) {
      const { error: batchErr } = await supabase.from('batches').insert(batchRows)
      if (batchErr) {
        setErrors({ submit: batchErr.message })
        setSaving(false)
        return
      }
    }

    router.push('/signup/payments')
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl pb-10">
      <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-8">
        <div className="lg:hidden"><StepProgress current={2} /></div>

        <div className="mb-7">
          <h1 className="text-[1.4rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] mb-1.5">
            Your Classes
          </h1>
          <p className="text-[#6c757d] text-[0.84rem] leading-relaxed italic border-l-[3px] border-[#748ffc] pl-3">
            Set up what you teach, your fees, and your schedule.
          </p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-2">
            Fields marked <span className="text-[#c92a2a] font-bold">*</span> are required
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>

          {/* ── Subject picker ── */}
          <div>
            <p className="text-[#343a40] text-xs font-semibold mb-2.5">
              Which subjects do you teach? <span className="text-[#c92a2a]">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(subject => {
                if (subject === 'Others') {
                  return (
                    <button
                      key="Others"
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
                const active = selectedSubjectNames.includes(subject)
                return (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-150 ${
                      active
                        ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.25)]'
                        : 'bg-white text-[#343a40] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                    }`}
                  >
                    {subject}
                  </button>
                )
              })}
              {/* Custom subjects */}
              {subjectDrafts
                .filter(s => !SUBJECTS.includes(s.subject))
                .map(s => (
                  <button
                    key={s.subject}
                    type="button"
                    onClick={() => toggleSubject(s.subject)}
                    className="inline-flex items-center gap-1.5 pl-4 pr-2 py-2 rounded-full text-sm font-semibold border bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.25)]"
                  >
                    {s.subject}
                    <span className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-[10px]">
                      &times;
                    </span>
                  </button>
                ))}
            </div>

            {/* Other subject input */}
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
                  className={inputCls}
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

            {errors.subjects && (
              <p className="mt-2 text-[#c92a2a] text-xs" data-error="true">{errors.subjects}</p>
            )}
          </div>

          {/* ── Subject sections ── */}
          {subjectDrafts.length > 0 && (
            <div className="space-y-4">
              {subjectDrafts.map(entry => (
                <SubjectSection
                  key={entry.subject}
                  entry={entry}
                  errors={errors}
                  isExpanded={expandedSubject === entry.subject}
                  onToggleExpand={() =>
                    setExpandedSubject(prev => prev === entry.subject ? null : entry.subject)
                  }
                  activeGrade={activeGradeMap[entry.subject] ?? entry.grades[0]?.grade ?? null}
                  onSetActiveGrade={g =>
                    setActiveGradeMap(prev => ({ ...prev, [entry.subject]: g }))
                  }
                  onRemove={() => toggleSubject(entry.subject)}
                  onUpdate={updater => updateSubject(entry.subject, updater)}
                  allIndividualSlots={allIndividualSlots}
                  allBatchSlots={allBatchSlots}
                />
              ))}
            </div>
          )}

          {/* ── Submit error ── */}
          {errors.submit && (
            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
              <p className="text-[#c92a2a] text-xs font-semibold">{errors.submit}</p>
            </div>
          )}

          {/* ── Continue button ── */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all duration-200 hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </span>
            ) : (
              'Continue to Payments →'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
