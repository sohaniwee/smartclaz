'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import Papa from 'papaparse'
import {
  X, Upload, Download, CheckCircle2, AlertTriangle,
  XCircle, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SubjectEntry, IndividualSlot } from '@/lib/types/subjects'

// ── Re-export for callers that use this alias ──────────────────────────────
export type { SubjectEntry as TutorSubject }

// ── Component props ────────────────────────────────────────────────────────

export interface CSVUploadProps {
  open: boolean
  onClose: () => void
  onImportComplete: (count: number) => void
  tutorSubjects?: SubjectEntry[] // optional — component fetches its own if not provided
}

// ── ValidatedRow (full spec) ───────────────────────────────────────────────

interface ValidatedRow {
  // raw CSV columns
  name: string
  whatsapp: string
  subject: string
  grade: string
  class_type: string
  batch_name: string
  paid_this_month: string
  next_session_date: string
  next_session_time: string
  monthly_fee_override: string
  // meta
  _rowNumber: number
  _status: 'valid' | 'warning' | 'error' | 'skipped'
  _errors: string[]
  _warnings: string[]
  _skipped: boolean
  // resolved values
  _normalizedPhone: string
  _resolvedFee: number
  _feeSource: 'profile' | 'batch' | 'trial' | 'override'
  _profileFee: number
  _resolvedBatchId: string | null
  _resolvedBatchSchedule: string | null
  _resolvedSubject: string
  _resolvedGrade: string
}

// ── Lookup maps built from Supabase data ───────────────────────────────────

interface SubjectMapValue {
  name: string
  grades: Map<string, GradeData>
}

interface GradeData {
  grade: string
  has_individual: boolean
  individual_fee: number
  individual_trial_type: string
  individual_trial_fee: number
  individual_slots: IndividualSlot[]
  individual_duration_mins: number
  has_group: boolean
  batches: BatchConfig[]
}

interface BatchConfig {
  name: string
  day: string
  time: string
  monthly_fee: number
  accepting_new: boolean
}

interface DBBatch {
  id: string
  name: string
  subject: string
  grade: string
  monthly_fee: number
  max_students: number
  accepting_new: boolean
  schedule_day: string
  schedule_time: string
}

// ── Phone helpers ──────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('94') && digits.length === 11) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+94' + digits.slice(1)
  return '+94' + digits
}

function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  return (
    (digits.startsWith('94') && digits.length === 11) ||
    (digits.startsWith('0') && digits.length === 10)
  )
}

// ── Levenshtein distance ───────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

// ── Build lookup maps from raw Supabase data ───────────────────────────────

function buildSubjectMap(
  subjects: SubjectEntry[] | null | undefined,
): Map<string, SubjectMapValue> {
  const map = new Map<string, SubjectMapValue>()
  subjects?.forEach((s: SubjectEntry) => {
    const gradeMap = new Map<string, GradeData>()
    s.grades?.forEach((g) => {
      gradeMap.set(g.grade.toLowerCase().trim(), {
        grade: g.grade,
        has_individual: g.has_individual ?? false,
        individual_fee: g.individual_fee ?? 0,
        individual_trial_type: g.individual_trial_type ?? 'none',
        individual_trial_fee: g.individual_trial_fee ?? 0,
        individual_slots: g.individual_slots ?? [],
        individual_duration_mins: g.individual_duration_mins ?? 60,
        has_group: g.has_group ?? false,
        batches: (g.batches ?? []).map((b) => ({
          name: b.name,
          day: b.day,
          time: b.time,
          monthly_fee: b.monthly_fee,
          accepting_new: b.accepting_new,
        })),
      })
    })
    map.set(s.subject.toLowerCase().trim(), { name: s.subject, grades: gradeMap })
  })
  return map
}

function buildBatchMap(
  batches: DBBatch[] | null | undefined,
): Map<string, DBBatch> {
  const map = new Map<string, DBBatch>()
  batches?.forEach((b) => {
    map.set(b.name.toLowerCase().trim(), b)
  })
  return map
}

function buildSubjectGradeBatches(
  batches: DBBatch[] | null | undefined,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  batches?.forEach((b) => {
    const key = `${b.subject.toLowerCase()}_${b.grade.toLowerCase()}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(b.name)
  })
  return map
}

// ── Row validation ─────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function validateRows(
  dataRows: Record<string, string>[],
  subjectMap: Map<string, SubjectMapValue>,
  batchMap: Map<string, DBBatch>,
  subjectGradeBatches: Map<string, string[]>,
): ValidatedRow[] {
  // First pass: normalize phones to detect duplicates within the file
  const phoneToRowNumbers = new Map<string, number[]>()
  dataRows.forEach((row, idx) => {
    const rawPhone = String(row.whatsapp ?? '').trim()
    if (rawPhone && isValidPhone(rawPhone)) {
      const normalized = normalizePhone(rawPhone)
      if (!phoneToRowNumbers.has(normalized)) phoneToRowNumbers.set(normalized, [])
      phoneToRowNumbers.get(normalized)!.push(idx + 1)
    }
  })

  return dataRows.map((raw, idx): ValidatedRow => {
    const rowNumber = idx + 1
    const errors: string[] = []
    const warnings: string[] = []

    // ── 1. name ──────────────────────────────────────────────────────────
    const name = String(raw.name ?? '').trim()
    if (!name) {
      errors.push('Name is required')
    } else if (name.length < 2) {
      errors.push('Name must be at least 2 characters')
    }

    // ── 2. whatsapp ───────────────────────────────────────────────────────
    const rawPhone = String(raw.whatsapp ?? '').trim()
    let normalizedPhone = rawPhone
    if (!rawPhone) {
      errors.push('WhatsApp number is required')
    } else if (!isValidPhone(rawPhone)) {
      errors.push(
        `Invalid WhatsApp number "${rawPhone}" — expected Sri Lanka format (e.g. 0771234567 or +94771234567)`,
      )
    } else {
      normalizedPhone = normalizePhone(rawPhone)
      const dupeRows = phoneToRowNumbers.get(normalizedPhone) ?? []
      if (dupeRows.length > 1) {
        const others = dupeRows.filter((n) => n !== rowNumber)
        errors.push(
          `Duplicate phone number — also appears on row${others.length > 1 ? 's' : ''} ${others.join(', ')}`,
        )
      }
    }

    // ── 3. subject ────────────────────────────────────────────────────────
    const rawSubject = String(raw.subject ?? '').trim()
    let resolvedSubjectName = rawSubject
    let subjectData: SubjectMapValue | undefined

    if (!rawSubject) {
      errors.push('Subject is required')
    } else if (subjectMap.size > 0) {
      const lc = rawSubject.toLowerCase()
      if (subjectMap.has(lc)) {
        subjectData = subjectMap.get(lc)
        resolvedSubjectName = subjectData!.name
      } else {
        // Try Levenshtein fuzzy match
        let bestMatch = ''
        let bestDist = Infinity
        for (const key of subjectMap.keys()) {
          const d = levenshtein(lc, key)
          if (d < bestDist) { bestDist = d; bestMatch = key }
        }
        if (bestDist <= 3 && bestMatch) {
          const suggestion = subjectMap.get(bestMatch)!.name
          errors.push(
            `Subject "${rawSubject}" not found. Did you mean "${suggestion}"? Your subjects: ${[...subjectMap.values()].map((v) => v.name).join(', ')}.`,
          )
        } else {
          errors.push(
            `Subject "${rawSubject}" not found. Your subjects: ${[...subjectMap.values()].map((v) => v.name).join(', ')}.`,
          )
        }
      }
    }

    // ── 4. grade ──────────────────────────────────────────────────────────
    const rawGrade = String(raw.grade ?? '').trim()
    let resolvedGradeName = rawGrade
    let gradeData: GradeData | undefined

    if (!rawGrade) {
      errors.push('Grade is required')
    } else if (subjectData) {
      const lc = rawGrade.toLowerCase()
      if (subjectData.grades.has(lc)) {
        gradeData = subjectData.grades.get(lc)
        resolvedGradeName = gradeData!.grade
      } else {
        const allGrades = [...subjectData.grades.values()].map((g) => g.grade)
        errors.push(
          `Grade "${rawGrade}" not found for ${resolvedSubjectName}. Your grades: ${allGrades.join(', ')}.`,
        )
      }
    }

    // ── 5. class_type ─────────────────────────────────────────────────────
    const rawClassType = String(raw.class_type ?? '').trim().toLowerCase()
    const validClassTypes = ['individual', 'group', 'trial']
    if (!rawClassType) {
      errors.push('class_type is required (individual | group | trial)')
    } else if (!validClassTypes.includes(rawClassType)) {
      errors.push(
        `class_type must be individual, group, or trial — got "${raw.class_type}"`,
      )
    }

    // ── 6 & 7. batch_name + fee resolution ───────────────────────────────
    const rawBatchName = String(raw.batch_name ?? '').trim()
    let resolvedBatchId: string | null = null
    let resolvedBatchSchedule: string | null = null
    let profileFee = 0
    let resolvedFee = 0
    let feeSource: ValidatedRow['_feeSource'] = 'profile'

    if (rawClassType === 'group') {
      if (!rawBatchName) {
        // List available batches for this subject+grade combination
        const sgKey = `${resolvedSubjectName.toLowerCase()}_${resolvedGradeName.toLowerCase()}`
        const availableBatches = subjectGradeBatches.get(sgKey) ?? []
        if (availableBatches.length > 0) {
          errors.push(
            `batch_name is required for group. Available batches: ${availableBatches.join(', ')}.`,
          )
        } else {
          errors.push('batch_name is required for group. No active batches found for this subject/grade.')
        }
      } else {
        const lc = rawBatchName.toLowerCase()
        let matchedBatch = batchMap.get(lc)
        if (!matchedBatch) {
          // Levenshtein fuzzy match
          let bestKey = ''
          let bestDist = Infinity
          for (const key of batchMap.keys()) {
            const d = levenshtein(lc, key)
            if (d < bestDist) { bestDist = d; bestKey = key }
          }
          if (bestDist <= 3 && bestKey) {
            matchedBatch = batchMap.get(bestKey)
          }
        }

        if (matchedBatch) {
          resolvedBatchId = matchedBatch.id
          const timeStr = matchedBatch.schedule_time
            ? formatTime12h(String(matchedBatch.schedule_time))
            : ''
          resolvedBatchSchedule = [matchedBatch.schedule_day, timeStr].filter(Boolean).join(' ')
          resolvedFee = matchedBatch.monthly_fee
          feeSource = 'batch'
          if (matchedBatch.accepting_new === false) {
            warnings.push(
              `Batch "${matchedBatch.name}" is not accepting new students.`,
            )
          }
        } else {
          const sgKey = `${resolvedSubjectName.toLowerCase()}_${resolvedGradeName.toLowerCase()}`
          const availableBatches = subjectGradeBatches.get(sgKey) ?? []
          if (availableBatches.length > 0) {
            errors.push(
              `Batch "${rawBatchName}" not found. Available batches for ${resolvedSubjectName} ${resolvedGradeName}: ${availableBatches.join(', ')}.`,
            )
          } else {
            errors.push(`Batch "${rawBatchName}" not found.`)
          }
        }
      }
    } else if (rawClassType === 'individual') {
      if (gradeData) {
        profileFee = gradeData.individual_fee ?? 0
        resolvedFee = profileFee
        feeSource = 'profile'
      }
      if (rawBatchName) {
        warnings.push('batch_name is ignored for individual class type.')
      }
    } else if (rawClassType === 'trial') {
      if (gradeData) {
        if (gradeData.individual_trial_type === 'none') {
          warnings.push('Trial class is not enabled in your profile for this subject/grade.')
        }
        profileFee = gradeData.individual_trial_fee ?? 0
        resolvedFee = profileFee
        feeSource = 'trial'
      }
      if (rawBatchName) {
        warnings.push('batch_name is ignored for trial class type.')
      }
    }

    // ── 8. monthly_fee_override ───────────────────────────────────────────
    const rawOverride = String(raw.monthly_fee_override ?? '').trim()
    if (rawOverride) {
      const overrideNum = Number(rawOverride)
      if (isNaN(overrideNum) || overrideNum < 0) {
        errors.push(
          `monthly_fee_override must be a non-negative number — got "${rawOverride}"`,
        )
      } else {
        const standardFee = resolvedFee
        resolvedFee = overrideNum
        feeSource = 'override'
        warnings.push(
          `Custom rate: LKR ${overrideNum.toLocaleString()}. Standard: LKR ${standardFee.toLocaleString()}.`,
        )
      }
    }

    // ── 9. paid_this_month ────────────────────────────────────────────────
    const rawPaid = String(raw.paid_this_month ?? '').trim().toLowerCase()
    if (rawPaid && !['yes', 'no', 'na'].includes(rawPaid)) {
      errors.push(`paid_this_month must be yes, no, or na — got "${raw.paid_this_month}"`)
    }

    // ── 10. next_session_date / time ──────────────────────────────────────
    const nextDate = String(raw.next_session_date ?? '').trim()
    const nextTime = String(raw.next_session_time ?? '').trim()

    if (rawClassType === 'group' && nextDate) {
      warnings.push('next_session_date is ignored for group — schedule comes from the batch.')
    } else if (nextDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
        errors.push(`next_session_date must be YYYY-MM-DD — got "${nextDate}"`)
      } else {
        const d = new Date(nextDate)
        if (isNaN(d.getTime())) {
          errors.push(`next_session_date "${nextDate}" is not a valid date`)
        } else {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          if (d < today) {
            warnings.push(`next_session_date "${nextDate}" is in the past.`)
          }
          if (!nextTime) {
            errors.push('next_session_time is required when next_session_date is provided')
          }
        }
      }
    }

    if (nextTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(nextTime)) {
      errors.push(`next_session_time must be HH:MM (24-hour) — got "${nextTime}"`)
    }

    // ── 10b. Cross-check individual/trial date+time against this subject+grade's
    // configured individual_slots (set per-grade in signup/classes — day + time,
    // shared duration via individual_duration_mins). Skipped for group (schedule
    // comes from the batch) and when this grade has no individual slots configured
    // at all — nothing to validate against.
    if (
      rawClassType !== 'group' &&
      nextDate && nextTime &&
      /^\d{4}-\d{2}-\d{2}$/.test(nextDate) &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(nextTime) &&
      gradeData && gradeData.individual_slots.length > 0
    ) {
      const [y, mo, da] = nextDate.split('-').map(Number)
      const localDate = new Date(y, mo - 1, da)
      if (!isNaN(localDate.getTime())) {
        const weekday = WEEKDAY_NAMES[localDate.getDay()]
        const daySlots = gradeData.individual_slots.filter(s => s.day === weekday)
        if (daySlots.length === 0) {
          errors.push(
            `You have no ${resolvedSubjectName} ${resolvedGradeName} individual slots set for ${weekday}s. Fix the date, or leave next_session_date/next_session_time blank to schedule it later in Sessions.`,
          )
        } else {
          const toMins = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            return h * 60 + m
          }
          const nextMins = toMins(nextTime)
          const durationMins = gradeData.individual_duration_mins
          const inSlot = daySlots.some(s => {
            const start = toMins(s.time)
            return nextMins >= start && nextMins < start + durationMins
          })
          if (!inSlot) {
            const ranges = daySlots.map(s => formatTime12h(s.time)).join(', ')
            errors.push(
              `${formatTime12h(nextTime)} on ${weekday} is outside your set ${resolvedSubjectName} ${resolvedGradeName} individual slots (${ranges}, ${durationMins} min each). Fix the date/time, or leave next_session_date/next_session_time blank to schedule it later in Sessions.`,
            )
          }
        }
      }
    }

    // ── Final status ──────────────────────────────────────────────────────
    const status: ValidatedRow['_status'] =
      errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid'

    return {
      name,
      whatsapp: rawPhone,
      subject: rawSubject,
      grade: rawGrade,
      class_type: rawClassType,
      batch_name: rawBatchName,
      paid_this_month: rawPaid,
      next_session_date: nextDate,
      next_session_time: nextTime,
      monthly_fee_override: rawOverride,
      _rowNumber: rowNumber,
      _status: status,
      _errors: errors,
      _warnings: warnings,
      _skipped: false,
      _normalizedPhone: normalizedPhone,
      _resolvedFee: resolvedFee,
      _feeSource: feeSource,
      _profileFee: profileFee,
      _resolvedBatchId: resolvedBatchId,
      _resolvedBatchSchedule: resolvedBatchSchedule,
      _resolvedSubject: resolvedSubjectName,
      _resolvedGrade: resolvedGradeName,
    }
  })
}

// ── Small helpers ──────────────────────────────────────────────────────────

function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr ?? '0', 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Status badge component ─────────────────────────────────────────────────

interface StatusBadgeProps {
  status: ValidatedRow['_status']
  errors: string[]
  warnings: string[]
  expanded: boolean
  onToggle: () => void
}

function StatusBadge({ status, errors, warnings, expanded, onToggle }: StatusBadgeProps) {
  if (status === 'valid') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] px-2.5 py-0.5 text-[0.68rem] font-bold">
        <CheckCircle2 size={10} />
        Ready
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f5] text-[#6c757d] border border-[#dee2e6] px-2.5 py-0.5 text-[0.68rem] font-bold">
        Skipped
      </span>
    )
  }

  const isError = status === 'error'
  const messages = isError ? errors : warnings
  const hasMessages = messages.length > 0

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={hasMessages ? onToggle : undefined}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold border transition-colors ${
          isError
            ? 'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9] hover:bg-[#ffe3e3]'
            : 'bg-[#fff9db] text-[#e67700] border-[#ffec99] hover:bg-[#fff3bf]'
        }`}
        aria-expanded={expanded}
      >
        {isError ? <XCircle size={10} /> : <AlertTriangle size={10} />}
        {isError ? 'Error' : 'Warning'}
        {hasMessages && (
          expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />
        )}
      </button>
    </div>
  )
}

// ── Fee cell ───────────────────────────────────────────────────────────────

function FeeCell({ row }: { row: ValidatedRow }) {
  if (row._resolvedFee === 0 && row._feeSource !== 'trial') {
    return <span className="text-[#adb5bd]">—</span>
  }

  const amount =
    row._feeSource === 'trial' && row._resolvedFee === 0
      ? 'Free'
      : `LKR ${row._resolvedFee.toLocaleString()}`

  const colorClass =
    row._feeSource === 'profile'
      ? 'text-[#2f9e44]'
      : row._feeSource === 'batch'
      ? 'text-[#3b5bdb]'
      : row._feeSource === 'trial'
      ? 'text-[#0c8599]'
      : 'text-[#e67700]'

  const subLabel =
    row._feeSource === 'profile'
      ? '(from profile)'
      : row._feeSource === 'batch'
      ? '(from batch)'
      : row._feeSource === 'trial'
      ? '(trial fee)'
      : `Standard: LKR ${row._profileFee.toLocaleString()}`

  const overrideFlag = row._feeSource === 'override' ? ' ⚠' : ''

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`font-bold text-[0.8rem] ${colorClass}`}>
        {amount}{overrideFlag}
      </span>
      <span className="text-[0.65rem] text-[#6c757d]">{subLabel}</span>
    </div>
  )
}

// ── Batch/schedule cell ────────────────────────────────────────────────────

function BatchCell({ row }: { row: ValidatedRow }) {
  if (row.class_type === 'group') {
    if (row._resolvedBatchId) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[#2f9e44] text-[0.78rem]">
            {row.batch_name}
          </span>
          {row._resolvedBatchSchedule && (
            <span className="text-[0.65rem] text-[#6c757d]">{row._resolvedBatchSchedule}</span>
          )}
        </div>
      )
    }
    if (row.batch_name) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[#c92a2a] text-[0.78rem]">Not found</span>
          <span className="text-[0.65rem] text-[#6c757d]">"{row.batch_name}"</span>
        </div>
      )
    }
    return <span className="text-[#c92a2a] text-[0.78rem] font-semibold">Required</span>
  }

  // individual or trial
  const hasDate = Boolean(row.next_session_date)
  const hasTime = Boolean(row.next_session_time)

  if (hasDate) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-[#343a40] text-[0.78rem]">
          {row.next_session_date}
        </span>
        {hasTime && (
          <span className="text-[0.65rem] text-[#6c757d]">
            {formatTime12h(row.next_session_time)}
          </span>
        )}
      </div>
    )
  }

  return <span className="text-[0.65rem] text-[#adb5bd]">Not scheduled</span>
}

// ── Paid cell ──────────────────────────────────────────────────────────────

function PaidCell({ value }: { value: string }) {
  if (value === 'yes') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] px-2 py-0.5 text-[0.68rem] font-bold">
        Paid
      </span>
    )
  }
  if (value === 'na') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f5] text-[#6c757d] border border-[#dee2e6] px-2 py-0.5 text-[0.68rem] font-bold">
        N/A
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff9db] text-[#e67700] border border-[#ffec99] px-2 py-0.5 text-[0.68rem] font-bold">
      Pending
    </span>
  )
}

// ── Row background ─────────────────────────────────────────────────────────

function rowBg(row: ValidatedRow): string {
  if (row._skipped) return 'bg-[#f8f9fa] opacity-50'
  if (row._status === 'error') return 'bg-[#fff5f5] border-l-[3px] border-l-[#c92a2a]'
  if (row._status === 'warning') return 'bg-[#fff9db] border-l-[3px] border-l-[#e67700]'
  return 'bg-white'
}

// ── Import result ──────────────────────────────────────────────────────────

interface ImportResult {
  added: number
  skipped_duplicate: number
  skipped_by_user: number
  errors: number
  by_type: { individual: number; group: number; trial: number }
  custom_fee_rows: Array<{ name: string; fee: number; standard: number }>
  failed_rows: ValidatedRow[]
}

// ── Main component ─────────────────────────────────────────────────────────

type Step = 'start' | 'preview' | 'importing' | 'done'

export default function CSVUpload({
  open,
  onClose,
  onImportComplete,
}: CSVUploadProps) {
  const [step, setStep]             = useState<Step>('start')
  const [rows, setRows]             = useState<ValidatedRow[]>([])
  const [rawData, setRawData]       = useState<Record<string, string>[]>([])
  const [dragOver, setDragOver]     = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [progress, setProgress]     = useState(0)
  const [result, setResult]         = useState<ImportResult | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [loadingTutorData, setLoadingTutorData] = useState(false)

  // Lookup maps stored in refs (built once after fetch)
  const subjectMapRef        = useRef<Map<string, SubjectMapValue>>(new Map())
  const batchMapRef          = useRef<Map<string, DBBatch>>(new Map())
  const subjectGradeBatchRef = useRef<Map<string, string[]>>(new Map())
  const dbBatchesRef         = useRef<DBBatch[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch tutor data when modal opens ─────────────────────────────────

  useEffect(() => {
    if (!open) return
    setLoadingTutorData(true)
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoadingTutorData(false); return }

      const [tutorRes, batchRes] = await Promise.all([
        supabase
          .from('tutors')
          .select('subjects, id')
          .eq('id', user.id)
          .single(),
        supabase
          .from('batches')
          .select('id, name, subject, grade, monthly_fee, max_students, accepting_new, schedule_day, schedule_time')
          .eq('tutor_id', user.id)
          .eq('status', 'active'),
      ])

      const subjects = tutorRes.data?.subjects as SubjectEntry[] | undefined
      const batches = (batchRes.data ?? []) as DBBatch[]

      subjectMapRef.current        = buildSubjectMap(subjects)
      batchMapRef.current          = buildBatchMap(batches)
      subjectGradeBatchRef.current = buildSubjectGradeBatches(batches)
      dbBatchesRef.current         = batches

      setLoadingTutorData(false)

      // Re-validate if file was already parsed
      setRawData(prev => {
        if (prev.length > 0) {
          const reValidated = validateRows(
            prev,
            subjectMapRef.current,
            batchMapRef.current,
            subjectGradeBatchRef.current,
          ).map((r, i) => ({ ...r, _skipped: rows[i]?._skipped ?? false }))
          setRows(reValidated)
        }
        return prev
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Reset on close ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      setStep('start')
      setRows([])
      setRawData([])
      setDragOver(false)
      setParseError(null)
      setProgress(0)
      setResult(null)
      setExpandedRows(new Set())
      subjectMapRef.current        = new Map()
      batchMapRef.current          = new Map()
      subjectGradeBatchRef.current = new Map()
      dbBatchesRef.current         = []
    }
  }, [open])

  // ── File handling ──────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setParseError(null)
    if (!file.name.endsWith('.csv')) {
      setParseError('Please upload a .csv file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError('File is too large. Maximum size is 5MB.')
      return
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (parsed) => {
        if (parsed.errors.length > 0 && parsed.data.length === 0) {
          setParseError('Could not parse CSV. Please check the file format.')
          return
        }

        // Filter out comment rows (first cell starts with #)
        const dataRows = parsed.data.filter((row: Record<string, string>) => {
          const firstVal = String(Object.values(row)[0] ?? '').trim()
          return !firstVal.startsWith('#')
        })

        setRawData(dataRows)
        const validated = validateRows(
          dataRows,
          subjectMapRef.current,
          batchMapRef.current,
          subjectGradeBatchRef.current,
        )
        setRows(validated)
        setStep('preview')
      },
      error: (err) => {
        setParseError(`Error reading file: ${err.message}`)
      },
    })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ''
    },
    [handleFile],
  )

  // ── Row controls ───────────────────────────────────────────────────────

  function toggleSkip(rowNumber: number) {
    setRows((prev) =>
      prev.map((r) =>
        r._rowNumber === rowNumber ? { ...r, _skipped: !r._skipped } : r,
      ),
    )
  }

  function skipAllErrors() {
    setRows((prev) =>
      prev.map((r) => (r._status === 'error' ? { ...r, _skipped: true } : r)),
    )
  }

  function toggleExpand(rowNumber: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  // ── Counts ─────────────────────────────────────────────────────────────

  const validCount   = rows.filter((r) => r._status === 'valid' && !r._skipped).length
  const warnCount    = rows.filter((r) => r._status === 'warning' && !r._skipped).length
  const errorCount   = rows.filter((r) => r._status === 'error' && !r._skipped).length
  const skippedCount = rows.filter((r) => r._skipped).length
  const importCount  = rows.filter((r) => !r._skipped && r._status !== 'error').length
  const canImport    = errorCount === 0 && importCount > 0

  // ── Download template ──────────────────────────────────────────────────

  // Triggers a browser download from a Blob. The anchor must be attached to the
  // DOM before .click() — several browsers (notably Firefox) silently no-op a
  // click on a detached <a>, which is why the button previously appeared to do
  // nothing at all in some browsers.
  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function downloadTemplate() {
    try {
      const res = await fetch('/api/students/csv-template')
      if (!res.ok) throw new Error('Template request failed')
      const blob = await res.blob()
      triggerDownload(blob, 'students-template.csv')
    } catch {
      // Offline/network-failure fallback — mirrors the real template's column
      // order and guideline comment block exactly (see app/api/students/csv-template/route.ts)
      // so a transient fetch failure never silently serves a worse, guideline-less file.
      const commentBlock = [
        '# ═══════════════════════════════════════',
        '# SMARTCLAZ — STUDENT IMPORT TEMPLATE',
        '# ═══════════════════════════════════════',
        '# Delete ALL lines starting with # before uploading.',
        '#',
        '# COLUMN GUIDE:',
        '# ─────────────────────────────────────',
        '# name (required) — Student full name. e.g. Kavindu Perera',
        '# whatsapp (required) — 0771234567 or +94771234567',
        '# subject (required) — Must match your subjects exactly.',
        '# grade (required) — Must match the grade listed for that subject.',
        '# class_type (required) — individual | group | trial',
        '# batch_name (required for group only) — Copy name exactly. Blank for individual/trial.',
        '# paid_this_month (optional) — yes | no | na. Blank = no.',
        '# next_session_date (optional) — YYYY-MM-DD. Blank for group (comes from batch schedule).',
        '# next_session_time (optional) — HH:MM 24h. Required if date given. Blank for group.',
        '# monthly_fee_override (optional) — Leave blank. System auto-fills from your profile. Only for special rates.',
        '# ─────────────────────────────────────',
      ].join('\n')
      const header =
        'name,whatsapp,subject,grade,class_type,batch_name,paid_this_month,next_session_date,next_session_time,monthly_fee_override'
      const example =
        'Nimasha Perera,0771234567,Mathematics,A/L,individual,,no,,,'
      const csv = [commentBlock, header, example].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      triggerDownload(blob, 'students-template.csv')
    }
  }

  // ── Download import report ─────────────────────────────────────────────

  function downloadImportReport() {
    if (!result) return
    // Reflect what the server actually did, not just the pre-import validation
    // snapshot — a row that passed client-side validation can still fail on the
    // server (duplicate, DB error, etc.), and rows with a pre-existing error were
    // never even sent to the server at all.
    const failedByRow = new Map(result.failed_rows.map(r => [r._rowNumber, r]))
    const reportRows = [
      ...rows
        .filter((r) => !r._skipped)
        .map((r) => {
          const failedRow = failedByRow.get(r._rowNumber)
          const wasAttempted = r._status !== 'error'
          const importStatus = failedRow ? 'failed' : wasAttempted ? 'imported' : 'not_imported'
          const errors = (failedRow ?? r)._errors.join('; ')
          return {
            name: r.name,
            whatsapp: r._normalizedPhone,
            subject: r._resolvedSubject,
            grade: r._resolvedGrade,
            class_type: r.class_type,
            batch_name: r.batch_name,
            resolved_fee_lkr: r._resolvedFee,
            fee_source: r._feeSource,
            paid_this_month: r.paid_this_month,
            next_session_date: r.next_session_date,
            next_session_time: r.next_session_time,
            import_status: importStatus,
            errors,
            warnings: r._warnings.join('; '),
          }
        }),
    ]
    const csv = Papa.unparse(reportRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    triggerDownload(blob, 'import-report.csv')
  }

  // ── Run import ─────────────────────────────────────────────────────────

  async function runImport() {
    setStep('importing')
    setProgress(0)

    const rowsToImport = rows
      .filter((r) => !r._skipped && r._status !== 'error')
      .map((r) => ({ ...r }))

    let simProgress = 0
    const timer = setInterval(() => {
      simProgress = Math.min(simProgress + Math.random() * 8, 90)
      setProgress(simProgress)
    }, 300)

    try {
      const response = await fetch('/api/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToImport }),
      })

      clearInterval(timer)
      setProgress(100)

      let added = 0
      let skipped_duplicate = 0
      let errors = 0
      let failed_rows: ValidatedRow[] = []

      if (response.ok) {
        try {
          const json = await response.json()
          // API returns: { success, imported, skipped, alreadyExist, failed, errorDetails, breakdown }
          added             = json.imported           ?? rowsToImport.length
          skipped_duplicate = json.alreadyExist       ?? 0
          errors            = json.failed             ?? 0

          // Build failed_rows from errorDetails returned by the server
          if (Array.isArray(json.errorDetails) && json.errorDetails.length > 0) {
            const errorRowNumbers = new Set<number>(
              json.errorDetails.map((e: { row: number }) => e.row),
            )
            failed_rows = rowsToImport.filter(r => errorRowNumbers.has(r._rowNumber)).map(r => {
              const detail = json.errorDetails.find((e: { row: number; error: string }) => e.row === r._rowNumber)
              return {
                ...r,
                _errors: [...r._errors, detail?.error ?? 'Server error during import'],
              }
            })
          }
        } catch {
          added = rowsToImport.length
        }
      } else {
        // Surface the actual server error instead of failing silently with no message —
        // the response body may not be JSON (e.g. a framework-level 404/500 error page,
        // or the request got redirected somewhere before ever reaching this API route).
        let serverError = `Import request failed (HTTP ${response.status})`
        if (response.redirected) {
          serverError += ` — redirected to ${response.url}`
        }
        try {
          const errJson = await response.json()
          if (errJson?.error) serverError = errJson.error
        } catch {
          // Non-JSON error response — keep the generic HTTP-status/redirect message above.
        }
        errors    = rowsToImport.length
        failed_rows = rowsToImport.map(r => ({ ...r, _errors: [...r._errors, serverError] }))
      }

      // Build by_type breakdown from client-side rows
      const by_type = { individual: 0, group: 0, trial: 0 }
      rowsToImport.forEach((r) => {
        const t = r.class_type as 'individual' | 'group' | 'trial'
        if (t in by_type) by_type[t]++
      })

      // Custom fee rows
      const custom_fee_rows = rowsToImport
        .filter((r) => r._feeSource === 'override')
        .map((r) => ({ name: r.name, fee: r._resolvedFee, standard: r._profileFee }))

      const importResult: ImportResult = {
        added,
        skipped_duplicate,
        skipped_by_user: skippedCount,
        errors,
        by_type,
        custom_fee_rows,
        failed_rows,
      }

      setResult(importResult)
      setStep('done')
      if (added > 0) onImportComplete(added)
    } catch {
      clearInterval(timer)
      setProgress(100)
      const by_type = { individual: 0, group: 0, trial: 0 }
      setResult({
        added: 0,
        skipped_duplicate: 0,
        skipped_by_user: skippedCount,
        errors: rowsToImport.length,
        by_type,
        custom_fee_rows: [],
        failed_rows: rowsToImport,
      })
      setStep('done')
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[6px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div
          className="w-full sm:max-w-4xl bg-white sm:rounded-[20px] rounded-t-[20px] shadow-[0_8px_40px_rgba(0,0,0,0.18)] flex flex-col max-h-[94vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle (mobile) */}
          <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-9 h-1 bg-[#dee2e6] rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f1f3f5] flex-shrink-0">
            <div>
              <h2
                className="font-extrabold text-[#1a1a2e] tracking-[-0.02em]"
                style={{ fontSize: '1.05rem' }}
              >
                {step === 'start' && 'Import Students from CSV'}
                {step === 'preview' &&
                  `Preview — ${rows.length} student${rows.length === 1 ? '' : 's'} found`}
                {step === 'importing' && 'Importing students...'}
                {step === 'done' && 'Import complete!'}
              </h2>
              {step === 'preview' && (
                <p className="text-[#6c757d] text-[0.78rem] mt-0.5">
                  Review and confirm before importing
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:text-[#1a1a2e] transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Step: start ── */}
            {step === 'start' && (
              <div className="p-6 space-y-5">
                {/* Loading tutor data notice */}
                {loadingTutorData && (
                  <div className="flex items-center gap-2.5 bg-[#edf2ff] border border-[#dbe4ff] rounded-[10px] px-4 py-2.5">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[#3b5bdb] border-t-transparent animate-spin flex-shrink-0" />
                    <p className="text-[#3b5bdb] text-[0.78rem] font-medium">
                      Loading your subjects and batches for validation...
                    </p>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Download template card */}
                  <div className="border-[1.5px] border-[#dee2e6] rounded-[14px] p-5 flex flex-col gap-3 hover:border-[#3b5bdb] transition-colors">
                    <div className="w-10 h-10 rounded-[10px] bg-[#edf2ff] flex items-center justify-center flex-shrink-0">
                      <Download size={18} className="text-[#3b5bdb]" />
                    </div>
                    <div>
                      <p className="font-bold text-[#1a1a2e] text-[0.9rem]">
                        Download CSV template
                      </p>
                      <p className="text-[#6c757d] text-[0.78rem] mt-1 leading-relaxed">
                        Get the template with the correct column headers for your student list.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="mt-auto inline-flex items-center gap-2 bg-[#edf2ff] hover:bg-[#dbe4ff] text-[#3b5bdb] text-[0.82rem] font-semibold px-4 py-2 rounded-[100px] transition-colors self-start"
                    >
                      <Download size={13} />
                      Download template
                    </button>
                  </div>

                  {/* Upload drop zone */}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleInputChange}
                      className="sr-only"
                      id="csv-file-input"
                      aria-label="Upload CSV file"
                    />
                    <label
                      htmlFor="csv-file-input"
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      className={`flex flex-col items-center justify-center gap-3 h-full min-h-[160px] border-[2px] border-dashed rounded-[14px] cursor-pointer transition-all duration-200 p-6 ${
                        dragOver
                          ? 'border-[#3b5bdb] bg-[#edf2ff]'
                          : 'border-[#ced4da] hover:border-[#3b5bdb] hover:bg-[#f8f9ff]'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors ${
                          dragOver ? 'bg-[#dbe4ff]' : 'bg-[#f1f3f5]'
                        }`}
                      >
                        <FileText
                          size={18}
                          className={dragOver ? 'text-[#3b5bdb]' : 'text-[#6c757d]'}
                        />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-[#343a40] text-[0.85rem]">
                          Drag your CSV file here
                        </p>
                        <p className="text-[#6c757d] text-[0.75rem] mt-0.5">
                          or click to browse
                        </p>
                      </div>
                      <p className="text-[#adb5bd] text-[0.68rem] font-medium">
                        .csv files only &middot; max 5MB
                      </p>
                    </label>
                  </div>
                </div>

                {parseError && (
                  <div className="flex items-start gap-2.5 bg-[#fff5f5] border border-[#ffc9c9] rounded-[10px] px-4 py-3">
                    <XCircle size={15} className="text-[#c92a2a] flex-shrink-0 mt-0.5" />
                    <p className="text-[#c92a2a] text-[0.82rem] font-medium">{parseError}</p>
                  </div>
                )}

                {/* Column reference */}
                <div className="bg-[#f8f9fa] rounded-[12px] px-4 py-3 border border-[#dee2e6]">
                  <p className="text-[0.72rem] font-bold text-[#343a40] uppercase tracking-[0.06em] mb-2">
                    Required columns
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {['name', 'whatsapp', 'subject', 'grade', 'class_type'].map((col) => (
                      <code
                        key={col}
                        className="text-[0.68rem] bg-white border border-[#dee2e6] rounded-[6px] px-2 py-0.5 text-[#3b5bdb] font-mono"
                      >
                        {col}
                      </code>
                    ))}
                  </div>
                  <p className="text-[0.72rem] font-bold text-[#343a40] uppercase tracking-[0.06em] mb-2 mt-2.5">
                    Optional columns
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'batch_name',
                      'monthly_fee_override',
                      'paid_this_month',
                      'next_session_date',
                      'next_session_time',
                    ].map((col) => (
                      <code
                        key={col}
                        className="text-[0.68rem] bg-white border border-[#dee2e6] rounded-[6px] px-2 py-0.5 text-[#6c757d] font-mono"
                      >
                        {col}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step: preview ── */}
            {step === 'preview' && (
              <div>
                {/* Re-validating notice */}
                {loadingTutorData && (
                  <div className="mx-6 mt-4 flex items-center gap-2 bg-[#edf2ff] border border-[#dbe4ff] rounded-[10px] px-4 py-2.5">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[#3b5bdb] border-t-transparent animate-spin flex-shrink-0" />
                    <p className="text-[#3b5bdb] text-[0.78rem] font-medium">
                      Fetching your profile to validate subjects and batches...
                    </p>
                  </div>
                )}

                {/* No profile subjects warning */}
                {!loadingTutorData && subjectMapRef.current.size === 0 && (
                  <div className="mx-6 mt-4 flex items-start gap-2 bg-[#fff9db] border border-[#ffec99] rounded-[10px] px-4 py-2.5">
                    <AlertTriangle size={14} className="text-[#e67700] flex-shrink-0 mt-0.5" />
                    <p className="text-[#e67700] text-[0.78rem] font-medium">
                      No subjects found in your profile — subject and grade validation is skipped. Fees won&apos;t be auto-filled.
                    </p>
                  </div>
                )}

                {/* Summary bar */}
                <div className="px-6 py-3.5 border-b border-[#f1f3f5] flex items-center gap-3 flex-wrap">
                  <p className="text-[#6c757d] text-[0.78rem]">
                    Found <span className="font-bold text-[#1a1a2e]">{rows.length}</span> student{rows.length !== 1 ? 's' : ''}:
                  </p>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-[#2f9e44]" />
                    <span className="text-[0.78rem] font-semibold text-[#2f9e44]">
                      {validCount} ready
                    </span>
                  </div>
                  {warnCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-[#e67700]" />
                      <span className="text-[0.78rem] font-semibold text-[#e67700]">
                        {warnCount} warning{warnCount !== 1 ? 's' : ''} (will import)
                      </span>
                    </div>
                  )}
                  {errorCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <XCircle size={13} className="text-[#c92a2a]" />
                      <span className="text-[0.78rem] font-semibold text-[#c92a2a]">
                        {errorCount} error{errorCount !== 1 ? 's' : ''} — fix or skip to continue
                      </span>
                    </div>
                  )}
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={skipAllErrors}
                      className="ml-auto text-[0.73rem] font-semibold text-[#6c757d] hover:text-[#c92a2a] border border-[#dee2e6] hover:border-[#ffc9c9] rounded-[100px] px-3 py-1 transition-colors"
                    >
                      Skip all errors
                    </button>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-[0.78rem]">
                    <thead>
                      <tr className="bg-[#f8f9fa] border-b border-[#dee2e6]">
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em] w-8">
                          Skip
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em] w-7">
                          #
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Name
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Phone
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Subject / Grade
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Type
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Batch / Schedule
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Fee
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Paid
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-[#6c757d] text-[0.63rem] uppercase tracking-[0.06em]">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const isExpanded = expandedRows.has(row._rowNumber)
                        const messages =
                          row._status === 'error' ? row._errors : row._warnings
                        return (
                          <React.Fragment key={`row-${row._rowNumber}`}>
                            <tr
                              className={`${rowBg(row)} transition-colors border-b border-[#f1f3f5]`}
                            >
                              {/* Skip checkbox */}
                              <td className="px-3 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={row._skipped}
                                  onChange={() => toggleSkip(row._rowNumber)}
                                  className="w-3.5 h-3.5 accent-[#3b5bdb] cursor-pointer"
                                  aria-label={`Skip row ${row._rowNumber}`}
                                />
                              </td>

                              {/* Row number */}
                              <td className="px-3 py-2.5 text-[#adb5bd] font-mono text-[0.67rem]">
                                {row._rowNumber}
                              </td>

                              {/* Name */}
                              <td className="px-3 py-2.5">
                                <span
                                  className={`font-semibold text-[0.82rem] ${
                                    row._skipped
                                      ? 'text-[#adb5bd] line-through'
                                      : 'text-[#1a1a2e]'
                                  }`}
                                >
                                  {row.name || (
                                    <span className="italic text-[#ffc9c9]">missing</span>
                                  )}
                                </span>
                              </td>

                              {/* Phone */}
                              <td className="px-3 py-2.5">
                                <span
                                  className={`font-mono text-[0.72rem] ${
                                    row._skipped ? 'text-[#adb5bd]' : 'text-[#343a40]'
                                  }`}
                                >
                                  {row._normalizedPhone || row.whatsapp || (
                                    <span className="italic text-[#ffc9c9]">missing</span>
                                  )}
                                </span>
                              </td>

                              {/* Subject / Grade */}
                              <td className="px-3 py-2.5">
                                <div className="flex flex-col gap-0.5">
                                  <span
                                    className={`font-semibold text-[0.78rem] ${
                                      row._skipped ? 'text-[#adb5bd]' : 'text-[#1a1a2e]'
                                    }`}
                                  >
                                    {row._resolvedSubject || row.subject || '—'}
                                  </span>
                                  <span
                                    className={`text-[0.68rem] ${
                                      row._skipped ? 'text-[#adb5bd]' : 'text-[#6c757d]'
                                    }`}
                                  >
                                    {row._resolvedGrade || row.grade || '—'}
                                  </span>
                                </div>
                              </td>

                              {/* Type */}
                              <td className="px-3 py-2.5">
                                <span
                                  className={`capitalize text-[0.78rem] ${
                                    row._skipped ? 'text-[#adb5bd]' : 'text-[#343a40]'
                                  }`}
                                >
                                  {row.class_type || '—'}
                                </span>
                              </td>

                              {/* Batch / Schedule */}
                              <td className="px-3 py-2.5">
                                {row._skipped ? (
                                  <span className="text-[#adb5bd]">—</span>
                                ) : (
                                  <BatchCell row={row} />
                                )}
                              </td>

                              {/* Fee */}
                              <td className="px-3 py-2.5">
                                {row._skipped ? (
                                  <span className="text-[#adb5bd]">—</span>
                                ) : (
                                  <FeeCell row={row} />
                                )}
                              </td>

                              {/* Paid */}
                              <td className="px-3 py-2.5">
                                {row._skipped ? (
                                  <span className="text-[#adb5bd]">—</span>
                                ) : (
                                  <PaidCell value={row.paid_this_month} />
                                )}
                              </td>

                              {/* Status badge */}
                              <td className="px-3 py-2.5">
                                {row._skipped ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f5] text-[#6c757d] border border-[#dee2e6] px-2.5 py-0.5 text-[0.68rem] font-bold">
                                    Skipped
                                  </span>
                                ) : (
                                  <StatusBadge
                                    status={row._status}
                                    errors={row._errors}
                                    warnings={row._warnings}
                                    expanded={isExpanded}
                                    onToggle={() => toggleExpand(row._rowNumber)}
                                  />
                                )}
                              </td>
                            </tr>

                            {/* Expanded error/warning list */}
                            {isExpanded && !row._skipped && messages.length > 0 && (
                              <tr
                                key={`expand-${row._rowNumber}`}
                                className={
                                  row._status === 'error'
                                    ? 'bg-[#fff5f5] border-l-[3px] border-l-[#c92a2a]'
                                    : 'bg-[#fff9db] border-l-[3px] border-l-[#e67700]'
                                }
                              >
                                <td colSpan={10} className="px-5 pb-3 pt-0">
                                  <ul className="space-y-1">
                                    {messages.map((msg, i) => (
                                      <li
                                        key={i}
                                        className={`flex items-start gap-1.5 text-[0.75rem] ${
                                          row._status === 'error'
                                            ? 'text-[#c92a2a]'
                                            : 'text-[#e67700]'
                                        }`}
                                      >
                                        <span className="mt-0.5 flex-shrink-0">
                                          {row._status === 'error' ? (
                                            <XCircle size={11} />
                                          ) : (
                                            <AlertTriangle size={11} />
                                          )}
                                        </span>
                                        {msg}
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Step: importing ── */}
            {step === 'importing' && (
              <div className="p-10 flex flex-col items-center gap-6">
                <div className="w-14 h-14 rounded-full bg-[#edf2ff] flex items-center justify-center">
                  <Upload size={24} className="text-[#3b5bdb]" />
                </div>
                <div className="w-full max-w-sm space-y-3 text-center">
                  <p className="text-[#1a1a2e] font-semibold text-[0.9rem]">
                    Importing students...
                  </p>
                  <div className="w-full h-2 bg-[#f1f3f5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#3b5bdb] rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[#6c757d] text-[0.78rem]">
                    {Math.round((progress / 100) * importCount)} of {importCount}
                  </p>
                </div>
              </div>
            )}

            {/* ── Step: done ── */}
            {step === 'done' && result && (
              <div className="p-8 flex flex-col items-start gap-4 max-w-lg mx-auto">
                {/* Success header */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#ebfbee] flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={24} className="text-[#2f9e44]" />
                  </div>
                  <div>
                    <p className="font-extrabold text-[#1a1a2e] text-xl tracking-[-0.02em]">
                      Import complete!
                    </p>
                  </div>
                </div>

                {/* Summary card */}
                <div className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-[14px] divide-y divide-[#dee2e6]">
                  {/* Added */}
                  <div className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-[#2f9e44] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-[#2f9e44] text-[0.82rem]">
                          {result.added} student{result.added !== 1 ? 's' : ''} added
                        </p>
                        {result.added > 0 && (
                          <p className="text-[0.72rem] text-[#6c757d] mt-0.5">
                            {[
                              result.by_type.individual > 0 &&
                                `${result.by_type.individual} individual`,
                              result.by_type.group > 0 &&
                                `${result.by_type.group} group`,
                              result.by_type.trial > 0 &&
                                `${result.by_type.trial} trial`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Custom fee rows */}
                  {result.custom_fee_rows.length > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={14} className="text-[#e67700] flex-shrink-0" />
                        <p className="font-semibold text-[#e67700] text-[0.82rem]">
                          {result.custom_fee_rows.length} imported with custom fee:
                        </p>
                      </div>
                      <ul className="space-y-1 ml-5">
                        {result.custom_fee_rows.map((r, i) => (
                          <li key={i} className="text-[0.75rem] text-[#6c757d]">
                            {r.name} &middot; LKR {r.fee.toLocaleString()}{' '}
                            <span className="text-[#adb5bd]">
                              (standard: LKR {r.standard.toLocaleString()})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Skipped by user */}
                  {result.skipped_by_user > 0 && (
                    <div className="px-4 py-3 flex items-center gap-2">
                      <span className="text-[#6c757d] text-[0.82rem]">
                        ⏭ {result.skipped_by_user} skipped by you
                      </span>
                    </div>
                  )}

                  {/* Duplicates */}
                  {result.skipped_duplicate > 0 && (
                    <div className="px-4 py-3 flex items-center gap-2">
                      <AlertTriangle size={14} className="text-[#e67700] flex-shrink-0" />
                      <p className="text-[0.82rem] text-[#e67700]">
                        {result.skipped_duplicate} already in your system (same phone — skipped)
                      </p>
                    </div>
                  )}

                  {/* Errors */}
                  {result.errors > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle size={14} className="text-[#c92a2a] flex-shrink-0" />
                        <p className="text-[0.82rem] text-[#c92a2a] font-semibold">
                          {result.errors} failed
                        </p>
                      </div>
                      {result.failed_rows.length > 0 && (
                        <ul className="space-y-1.5 ml-5">
                          {result.failed_rows.map((r) => (
                            <li key={r._rowNumber} className="text-[0.75rem] text-[#6c757d]">
                              <span className="font-semibold text-[#1a1a2e]">{r.name || `Row ${r._rowNumber}`}</span>
                              {' — '}
                              {r._errors[r._errors.length - 1]}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={downloadImportReport}
                    className="inline-flex items-center gap-2 border border-[#dee2e6] text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] text-[0.8rem] font-semibold px-4 py-2 rounded-[100px] transition-colors"
                  >
                    <Download size={13} />
                    Download import report
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#f1f3f5] flex items-center gap-3 justify-end flex-shrink-0">
            {step === 'start' && (
              <button
                type="button"
                onClick={onClose}
                className="text-[#6c757d] text-[0.82rem] font-semibold hover:text-[#1a1a2e] transition-colors px-4 py-2"
              >
                Cancel
              </button>
            )}

            {step === 'preview' && (
              <>
                <p className="text-[#6c757d] text-[0.78rem] mr-auto">
                  Importing{' '}
                  <span className="font-bold text-[#1a1a2e]">{importCount}</span>{' '}
                  student{importCount !== 1 ? 's' : ''}
                  {skippedCount > 0 && (
                    <>
                      {' '}&middot;{' '}
                      <span className="font-bold">{skippedCount}</span> skipped
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => { setStep('start'); setRows([]) }}
                  className="text-[#6c757d] text-[0.82rem] font-semibold hover:text-[#1a1a2e] transition-colors px-4 py-2"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={runImport}
                  disabled={!canImport}
                  title={
                    !canImport && errorCount > 0
                      ? 'Fix or skip all errors to continue'
                      : undefined
                  }
                  className="inline-flex items-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:bg-[#adb5bd] disabled:cursor-not-allowed text-white text-[0.84rem] font-semibold px-5 py-2.5 rounded-[100px] transition-all shadow-[0_4px_14px_rgba(59,91,219,0.3)] disabled:shadow-none hover:enabled:-translate-y-px"
                >
                  Import {importCount} Student{importCount !== 1 ? 's' : ''}
                </button>
              </>
            )}

            {step === 'done' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep('start')
                    setRows([])
                    setResult(null)
                    setRawData([])
                  }}
                  className="text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[100px] px-4 py-2 hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors"
                >
                  Import more
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white text-[0.84rem] font-semibold px-5 py-2.5 rounded-[100px] transition-all shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:-translate-y-px"
                >
                  View Students
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
