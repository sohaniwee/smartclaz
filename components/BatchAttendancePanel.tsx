'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { StudentInBatch, AttendanceStatus, PaymentStatus } from '@/app/(app)/sessions/page'
import { formatDate, formatTime, hashColor } from '@/app/(app)/sessions/page'

// ── Minimal session type (used by both sessions page and dashboard) ─────────

export interface MinimalBatchSession {
  id: string
  batch_id?: string | null
  scheduled_at: string
  batch?: { name: string; subject?: string; grade?: string } | null
  attendance: Array<{ id: string; student_id: string; status: AttendanceStatus; marked_at?: string }>
}

// ── Props ──────────────────────────────────────────────────────────────────

interface BatchAttendancePanelProps {
  session: MinimalBatchSession
  tutorId: string
  paymentMap: Map<string, { status: PaymentStatus; amount_lkr: number }>
  onClose: () => void
  onSave: () => void
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BatchAttendancePanel({
  session,
  tutorId,
  paymentMap,
  onClose,
  onSave,
}: BatchAttendancePanelProps) {
  const [localAttendance, setLocalAttendance] = useState<Record<string, AttendanceStatus>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [students, setStudents] = useState<StudentInBatch[]>([])

  // Load students in batch + pre-fill attendance
  useEffect(() => {
    if (!session.batch_id) return

    const supabase = createClient()
    supabase
      .from('students')
      .select('id,name,whatsapp,status')
      .eq('batch_id', session.batch_id)
      .eq('tutor_id', tutorId)
      .eq('status', 'active')
      .then(({ data }) => {
        const loaded: StudentInBatch[] = (data ?? []).map(s => ({
          id: s.id as string,
          name: s.name as string,
          whatsapp: s.whatsapp as string | undefined,
          status: s.status as string,
          payment: paymentMap.get(s.id as string)
            ? { status: paymentMap.get(s.id as string)!.status, amount_lkr: paymentMap.get(s.id as string)!.amount_lkr }
            : null,
          attendance:
            session.attendance.find(a => a.student_id === (s.id as string)) ?? null,
        }))
        setStudents(loaded)

        // Pre-fill from existing attendance records
        const pre: Record<string, AttendanceStatus> = {}
        for (const att of session.attendance) {
          if (att.status !== 'unknown') {
            pre[att.student_id] = att.status
          }
        }
        setLocalAttendance(pre)
      })
  }, [session.batch_id, session.attendance, tutorId, paymentMap])

  // Derived counts
  const total = students.length
  const presentCount = Object.values(localAttendance).filter(s => s === 'present').length
  const absentCount = Object.values(localAttendance).filter(s => s === 'absent').length
  const lateCount = Object.values(localAttendance).filter(s => s === 'late').length
  const unknownCount = total - presentCount - absentCount - lateCount
  const markedCount = Object.keys(localAttendance).length
  const pct = total > 0 ? Math.round((markedCount / total) * 100) : 0
  const allDone = pct === 100

  // Filtered + ordered students (unmarked first)
  const filteredStudents = students
    .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const aMarked = a.id in localAttendance
      const bMarked = b.id in localAttendance
      if (aMarked === bMarked) return 0
      return aMarked ? 1 : -1
    })

  async function handleSave() {
    setSaving(true)
    try {
      const records = Object.entries(localAttendance).map(([student_id, status]) => ({
        student_id,
        status,
      }))
      await fetch(`/api/sessions/${session.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      onSave()
      onClose()
    } catch {
      // fail silently — parent will reload
      onSave()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function markAll() {
    const all: Record<string, AttendanceStatus> = {}
    for (const s of students) all[s.id] = 'present'
    setLocalAttendance(all)
  }

  function clearAll() {
    setLocalAttendance({})
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setLocalAttendance(prev => ({ ...prev, [studentId]: status }))
  }

  function resetStatus(studentId: string) {
    setLocalAttendance(prev => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
  }

  function rowBg(studentId: string): string {
    const s = localAttendance[studentId]
    if (s === 'present') return 'bg-[rgba(47,158,68,0.04)]'
    if (s === 'absent') return 'bg-[rgba(201,42,42,0.04)]'
    if (s === 'late') return 'bg-[rgba(230,119,0,0.04)]'
    return 'bg-white'
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel — desktop: right slide; mobile: bottom sheet */}
      <div className="fixed right-0 top-0 h-screen w-[500px] max-w-full bg-white z-50 flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.14)] sm:rounded-none rounded-t-[20px] sm:top-0 sm:bottom-auto bottom-0 sm:left-auto left-0 sm:h-screen h-[95vh] sm:w-[500px] w-full">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-[#dee2e6] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em]">
                Mark Attendance
              </h2>
              <p className="text-[0.72rem] text-[#6c757d] mt-0.5 truncate">
                {session.batch?.name} · {formatDate(session.scheduled_at)} · {formatTime(session.scheduled_at)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:bg-[#f8f9fa] flex-shrink-0 transition-all"
            >
              <X size={14} className="text-[#6c757d]" />
            </button>
          </div>

          {/* Summary chips */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#f1f3f5] text-[#6c757d]">
              👥 {total} total
            </span>
            <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#ebfbee] text-[#2f9e44]">
              ✅ {presentCount} present
            </span>
            <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#fff5f5] text-[#c92a2a]">
              ❌ {absentCount} absent
            </span>
            {lateCount > 0 && (
              <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#fff9db] text-[#e67700]">
                ⏰ {lateCount} late
              </span>
            )}
            {unknownCount > 0 && (
              <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#f1f3f5] text-[#6c757d]">
                ? {unknownCount}
              </span>
            )}
          </div>
        </div>

        {/* Search + bulk actions */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-[#f1f3f5] space-y-2">
          <input
            type="text"
            placeholder="Search student..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full border-[1.5px] border-[#ced4da] rounded-[10px] px-3 py-2 text-[0.82rem] focus:border-[#3b5bdb] focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)] placeholder:text-[#adb5bd]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={markAll}
              className="flex-1 bg-[#3b5bdb] text-white rounded-[10px] px-3 py-2 text-[0.78rem] font-semibold hover:bg-[#4c6ef5] transition-colors"
            >
              ✓ Mark all present
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="flex-1 border border-[#c92a2a] text-[#c92a2a] rounded-[10px] px-3 py-2 text-[0.78rem] font-semibold hover:bg-[#fff5f5] transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-y-auto">
          {filteredStudents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#adb5bd] text-sm">
              No students found
            </div>
          ) : (
            filteredStudents.map(student => {
              const { bg, text } = hashColor(student.name)
              const initials = student.name
                .split(' ')
                .map(w => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
              const att = localAttendance[student.id]
              const payStatus = student.payment?.status

              return (
                <div
                  key={student.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-[#f1f3f5] transition-colors ${rowBg(student.id)}`}
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[0.7rem] font-bold flex-shrink-0"
                    style={{ background: bg, color: text }}
                  >
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.85rem] font-bold text-[#1a1a2e] truncate">{student.name}</p>
                    {student.whatsapp && (
                      <p className="text-[0.7rem] text-[#adb5bd] font-mono truncate">{student.whatsapp}</p>
                    )}
                  </div>

                  {/* Payment badge */}
                  <div className="flex-shrink-0">
                    {payStatus === 'paid' ? (
                      <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb]">
                        Paid
                      </span>
                    ) : (
                      <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#fff9db] text-[#e67700] border border-[#ffec99]">
                        Pending
                      </span>
                    )}
                  </div>

                  {/* Attendance controls — always-visible 3-pill segmented control */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(['present', 'absent', 'late'] as const).map(s => {
                      const isSel = localAttendance[student.id] === s
                      const cfg = {
                        present: { sel: 'bg-[#2f9e44] text-white border-[#2f9e44]',   unsel: 'border-[#b2f2bb] text-[#2f9e44] hover:bg-[#2f9e44] hover:text-white hover:border-[#2f9e44]',   label: '✓ Present' },
                        absent:  { sel: 'bg-[#c92a2a] text-white border-[#c92a2a]',   unsel: 'border-[#ffc9c9] text-[#c92a2a] hover:bg-[#c92a2a] hover:text-white hover:border-[#c92a2a]',   label: '✗ Absent'  },
                        late:    { sel: 'bg-[#e67700] text-white border-[#e67700]',   unsel: 'border-[#ffec99] text-[#e67700] hover:bg-[#e67700] hover:text-white hover:border-[#e67700]',   label: '⏰ Late'    },
                      }[s]
                      return (
                        <button
                          key={s}
                          title={isSel ? 'Click to clear' : cfg.label}
                          onClick={() => isSel ? resetStatus(student.id) : setStatus(student.id, s)}
                          className={`h-6 px-2 rounded-full border text-[0.65rem] font-bold transition-all ${isSel ? cfg.sel : cfg.unsel}`}
                        >
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#dee2e6] p-4 space-y-3">
          {/* Progress */}
          <div>
            <p className="text-[0.72rem] text-[#6c757d] font-semibold mb-1.5">
              {markedCount} of {total} marked · {pct}%
            </p>
            <div className="h-1.5 bg-[#dee2e6] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2f9e44] rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border-[1.5px] border-[#ced4da] text-[#6c757d] rounded-[10px] py-2.5 text-[0.85rem] font-semibold hover:border-[#adb5bd] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`flex-1 rounded-[10px] py-2.5 text-[0.85rem] font-semibold transition-all disabled:opacity-70 ${
                allDone
                  ? 'bg-[#2f9e44] text-white hover:bg-[#2b8a3e]'
                  : 'bg-[#3b5bdb] text-white hover:bg-[#4c6ef5]'
              }`}
            >
              {saving ? 'Saving…' : allDone ? 'Save & complete session ✅' : 'Save attendance'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
