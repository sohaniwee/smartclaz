'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Copy, Check, Link2, Users,
  Calendar, ChevronRight, CheckCircle2,
  XCircle, Clock, Pencil, Power,
} from 'lucide-react'
import { TimeSelect } from '@/components/ui/DateTimeInput'

// ── Types ──────────────────────────────────────────────────────────────────

type BatchStatus    = 'active' | 'inactive'
type PayStatus      = 'paid' | 'pending' | 'overdue'
type SessionOutcome = 'completed' | 'no_show' | 'cancelled' | 'scheduled'

interface BatchStudent {
  id: string
  name: string
  whatsapp: string
  payment_status: PayStatus
  joined: string
}

interface BatchSession {
  id: string
  date: string   // 'YYYY-MM-DD'
  time: string   // 'HH:MM'
  status: SessionOutcome
  attendance: Record<string, 'present' | 'absent' | 'unknown'>  // student_id → outcome
}

interface Batch {
  id: string
  name: string
  subject: string
  grade: string
  schedule_day: string   // 'Monday', 'Saturday', etc.
  schedule_time: string  // 'HH:MM'
  max_students: number
  monthly_fee: number
  status: BatchStatus
  accepting_new: boolean
  current_students_count?: number
  zoom_link?: string
  zoom_meeting_id?: string
  students: BatchStudent[]
  sessions: BatchSession[]
}

interface CreateForm {
  name: string
  subject: string
  grade: string
  schedule_day: string
  schedule_time: string
  max_students: string
  monthly_fee: string
  accepting_new: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────

const SUBJECTS = ['Mathematics', 'Science', 'Physics', 'Chemistry', 'English', 'Sinhala', 'ICT', 'Other']
const GRADES   = ['A/L', 'O/L', 'Grade 9', 'Grade 8', 'Grade 7', 'Grade 6', 'Grade 5']
const DAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ── Helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-[#edf2ff] text-[#3b5bdb]',
  'bg-[#f3f0ff] text-[#7048e8]',
  'bg-[#ebfbee] text-[#2f9e44]',
  'bg-[#fff9db] text-[#e67700]',
]
function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return (
    <div className={`${dim} ${cls} rounded-full flex items-center justify-center font-bold flex-shrink-0`}>
      {name.charAt(0)}
    </div>
  )
}

const PAY_STYLE: Record<PayStatus, string> = {
  paid:    'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]',
  pending: 'bg-[#fff9db] text-[#e67700] border-[#ffec99]',
  overdue: 'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]',
}
const PAY_LABEL: Record<PayStatus, string> = { paid: 'Paid', pending: 'Pending', overdue: 'Overdue' }

const ATT_ICON: Record<'present' | 'absent' | 'unknown', React.ReactNode> = {
  present: <CheckCircle2 size={13} className="text-[#2f9e44]" />,
  absent:  <XCircle      size={13} className="text-[#c92a2a]" />,
  unknown: <Clock        size={13} className="text-[#adb5bd]" />,
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-LK', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Group card ─────────────────────────────────────────────────────────────

function GroupCard({ batch, onClick, onToggleAccepting }: { batch: Batch; onClick: () => void; onToggleAccepting: (id: string, value: boolean) => void }) {
  const enrolled    = batch.students.length
  const paidCount   = batch.students.filter(s => s.payment_status === 'paid').length
  const maxCount    = batch.max_students ?? 20
  const pct         = Math.round((enrolled / maxCount) * 100)
  const fillColor   = pct >= 90 ? '#c92a2a' : pct >= 70 ? '#e67700' : '#3b5bdb'

  return (
    <div className="bg-white rounded-[18px] border border-[#dee2e6] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 transition-all duration-200">
      {/* Top row — clickable for detail */}
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[#1a1a2e] text-sm font-bold truncate">{batch.name}</p>
            </div>
            <p className="text-[#6c757d] text-[0.72rem]">{batch.subject} · {batch.grade}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${
              batch.status === 'active'
                ? 'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]'
                : 'bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]'
            }`}>
              {batch.status === 'active' ? 'Active' : 'Inactive'}
            </span>
            <ChevronRight size={14} className="text-[#ced4da]" />
          </div>
        </div>

        {/* Schedule + fee */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-[#6c757d] text-[0.72rem]">
            <Calendar size={12} className="text-[#3b5bdb]" />
            {batch.schedule_day}s · {batch.schedule_time}
          </div>
          <div className="text-[#6c757d] text-[0.72rem]">
            LKR {batch.monthly_fee.toLocaleString()}/mo per student
          </div>
        </div>

        {/* Capacity bar */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.72rem', color: '#6c757d', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Users size={11} className="text-[#3b5bdb]" style={{ display: 'inline' }} />
              {enrolled}/{maxCount} students
            </span>
            <span style={{ fontSize: '0.72rem', color: pct >= 90 ? '#c92a2a' : '#6c757d', fontWeight: 700 }}>
              {pct}% full
            </span>
          </div>
          <div style={{ height: 6, background: '#f1f3f5', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: fillColor, borderRadius: 100, transition: 'width 0.3s' }} />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[#adb5bd] text-[0.65rem]">{paidCount} paid this month</span>
          </div>
        </div>
      </button>

      {/* Accepting new toggle — separate from the detail click area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid #f1f3f5' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          role="switch"
          aria-checked={batch.accepting_new}
          onClick={() => onToggleAccepting(batch.id, !batch.accepting_new)}
          style={{
            position: 'relative',
            display: 'inline-flex',
            width: 42,
            height: 24,
            borderRadius: 100,
            background: batch.accepting_new ? '#3b5bdb' : '#ced4da',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute',
            top: 3,
            left: batch.accepting_new ? 21 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            transition: 'left 0.2s',
          }} />
        </button>
        <span style={{ fontSize: '0.78rem', color: '#343a40', fontWeight: 600 }}>
          {batch.accepting_new ? 'Accepting new students' : 'Closed to new students'}
        </span>
        {!batch.accepting_new && (
          <span style={{ fontSize: '0.65rem', fontWeight: 700, background: '#fff5f5', color: '#c92a2a', border: '1px solid #ffc9c9', borderRadius: 100, padding: '2px 8px', marginLeft: 'auto', flexShrink: 0 }}>
            Closed
          </span>
        )}
      </div>
    </div>
  )
}

// ── Group detail panel ─────────────────────────────────────────────────────

function GroupDetailPanel({
  batch,
  onClose,
  onToggleStatus,
  onRegenerateLink,
}: {
  batch: Batch
  onClose: () => void
  onToggleStatus: (id: string) => void
  onRegenerateLink: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab]       = useState<'students' | 'sessions' | 'payments'>('students')

  const enrolled   = batch.students.length
  const paidCount  = batch.students.filter(s => s.payment_status === 'paid').length
  const upcomingS  = batch.sessions.filter(s => s.status === 'scheduled')
  const recentS    = batch.sessions.filter(s => s.status === 'completed').slice(0, 5)

  function copyLink() {
    if (!batch.zoom_link) return
    navigator.clipboard.writeText(batch.zoom_link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden" onClick={onClose} />
      <div className="fixed z-50 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.14)] flex flex-col
        bottom-0 left-0 right-0 rounded-t-[20px] max-h-[92vh]
        md:bottom-auto md:top-0 md:right-0 md:left-auto md:w-[440px] md:h-screen md:rounded-none md:rounded-l-[20px]">

        {/* Mobile handle */}
        <div className="md:hidden flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 bg-[#dee2e6] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-[#f1f3f5] flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[#1a1a2e] text-[0.95rem] font-bold truncate">{batch.name}</p>
              <p className="text-[#6c757d] text-xs mt-0.5">{batch.subject} · {batch.grade} · {batch.schedule_day}s {batch.schedule_time}</p>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] transition-colors flex-shrink-0">
              <X size={14} />
            </button>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-4 mt-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${
              batch.status === 'active'
                ? 'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]'
                : 'bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]'
            }`}>
              {batch.status === 'active' ? 'Active' : 'Inactive'}
            </span>
            <span className="text-[#6c757d] text-xs flex items-center gap-1">
              <Users size={11} className="text-[#3b5bdb]" />
              {enrolled}/{batch.max_students} enrolled
            </span>
            <span className="text-[#6c757d] text-xs">
              LKR {batch.monthly_fee.toLocaleString()}/mo
            </span>
          </div>
        </div>

        {/* Zoom link */}
        {batch.status === 'active' && (
          <div className="px-6 py-3.5 bg-[#edf2ff]/60 border-b border-[#dbe4ff] flex-shrink-0">
            <div className="flex items-center gap-2">
              <Link2 size={13} className="text-[#3b5bdb] flex-shrink-0" />
              <p className="text-[#3b5bdb] text-xs font-medium flex-1 truncate">
                {batch.zoom_link ?? 'No link generated yet'}
              </p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {batch.zoom_link && (
                  <button onClick={copyLink}
                    className={`flex items-center gap-1 text-[0.65rem] font-bold px-2 py-1 rounded-[6px] transition-all ${
                      copied ? 'bg-[#ebfbee] text-[#2f9e44]' : 'bg-white text-[#3b5bdb] hover:bg-[#3b5bdb] hover:text-white'
                    }`}>
                    {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                )}
                <button onClick={() => onRegenerateLink(batch.id)}
                  className="text-[0.65rem] font-bold px-2 py-1 rounded-[6px] bg-white text-[#6c757d] border border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-all">
                  Regenerate
                </button>
              </div>
            </div>
            <p className="text-[#748ffc] text-[0.62rem] mt-1">Auto-refreshes every Sunday at 6 AM</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[#f1f3f5] flex-shrink-0 px-6 pt-3">
          {([['students', 'Students'], ['sessions', 'Sessions'], ['payments', 'Payments']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-2.5 mr-5 text-xs font-bold border-b-2 transition-all ${
                tab === t ? 'text-[#3b5bdb] border-b-[#3b5bdb]' : 'text-[#6c757d] border-b-transparent hover:text-[#343a40]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Students tab ── */}
          {tab === 'students' && (
            <div className="py-2">
              {batch.students.length === 0 ? (
                <p className="px-6 py-8 text-[#adb5bd] text-sm text-center">No students enrolled</p>
              ) : (
                batch.students.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-6 py-3 border-b border-[#f8f9fa] last:border-0 hover:bg-[#f8f9ff] transition-colors">
                    <Avatar name={s.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#1a1a2e] text-sm font-semibold truncate">{s.name}</p>
                      <p className="text-[#adb5bd] text-[0.65rem]">Joined {s.joined}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${PAY_STYLE[s.payment_status]}`}>
                      {PAY_LABEL[s.payment_status]}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Sessions tab ── */}
          {tab === 'sessions' && (
            <div className="py-2">
              {/* Upcoming */}
              {upcomingS.length > 0 && (
                <>
                  <p className="text-[0.58rem] font-bold text-[#adb5bd] uppercase tracking-[0.12em] font-mono px-6 pt-4 pb-2">Upcoming</p>
                  {upcomingS.map(session => (
                    <div key={session.id} className="flex items-center gap-3 px-6 py-3 border-b border-[#f8f9fa]">
                      <div className="w-9 h-9 rounded-[10px] bg-[#edf2ff] flex items-center justify-center flex-shrink-0">
                        <Calendar size={15} className="text-[#3b5bdb]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#1a1a2e] text-sm font-semibold">{formatDate(session.date)}</p>
                        <p className="text-[#6c757d] text-[0.7rem]">{session.time} · 60 min</p>
                      </div>
                      <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full border bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]">
                        Scheduled
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Recent sessions with attendance */}
              {recentS.length > 0 && (
                <>
                  <p className="text-[0.58rem] font-bold text-[#adb5bd] uppercase tracking-[0.12em] font-mono px-6 pt-4 pb-2">Recent</p>
                  {recentS.map(session => {
                    const presentCount = Object.values(session.attendance).filter(v => v === 'present').length
                    const total        = batch.students.length
                    return (
                      <div key={session.id} className="px-6 py-3 border-b border-[#f8f9fa] last:border-0">
                        <div className="flex items-center justify-between mb-2.5">
                          <div>
                            <p className="text-[#1a1a2e] text-sm font-semibold">{formatDate(session.date)}</p>
                            <p className="text-[#6c757d] text-[0.7rem]">{session.time}</p>
                          </div>
                          <span className="text-[0.7rem] font-bold text-[#343a40]">
                            {presentCount}/{total} attended
                          </span>
                        </div>
                        {/* Per-student attendance */}
                        <div className="space-y-1.5">
                          {batch.students.map(s => {
                            const outcome = session.attendance[s.id] ?? 'unknown'
                            return (
                              <div key={s.id} className="flex items-center gap-2">
                                {ATT_ICON[outcome]}
                                <span className={`text-xs ${outcome === 'absent' ? 'text-[#c92a2a] font-semibold' : 'text-[#343a40]'}`}>
                                  {s.name}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {upcomingS.length === 0 && recentS.length === 0 && (
                <p className="px-6 py-8 text-[#adb5bd] text-sm text-center">No sessions yet</p>
              )}
            </div>
          )}

          {/* ── Payments tab ── */}
          {tab === 'payments' && (
            <div className="py-2">
              {/* Summary strip */}
              <div className="mx-6 my-3 grid grid-cols-3 gap-2">
                {[
                  { label: 'Paid',    count: batch.students.filter(s => s.payment_status === 'paid').length,    style: 'text-[#2f9e44]' },
                  { label: 'Pending', count: batch.students.filter(s => s.payment_status === 'pending').length, style: 'text-[#e67700]' },
                  { label: 'Overdue', count: batch.students.filter(s => s.payment_status === 'overdue').length, style: 'text-[#c92a2a]' },
                ].map(({ label, count, style }) => (
                  <div key={label} className="bg-[#f8f9fa] rounded-[10px] p-3 text-center">
                    <p className={`text-[1.1rem] font-extrabold ${style}`}>{count}</p>
                    <p className="text-[#6c757d] text-[0.65rem] font-semibold">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mx-6 mb-2 h-2 bg-[#f1f3f5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2f9e44] rounded-full"
                  style={{ width: `${paidCount / enrolled * 100}%` }}
                />
              </div>
              <p className="text-[#adb5bd] text-[0.65rem] px-6 mb-4">
                {paidCount} of {enrolled} students paid · LKR {(paidCount * batch.monthly_fee).toLocaleString()} collected
              </p>

              {/* Per-student payment rows */}
              {batch.students.map(s => (
                <div key={s.id} className={`flex items-center gap-3 px-6 py-3 border-b border-[#f8f9fa] last:border-0 ${
                  s.payment_status === 'overdue' ? 'border-l-[3px] border-l-[#c92a2a]' : ''
                }`}>
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#1a1a2e] text-sm font-semibold truncate">{s.name}</p>
                    <p className="text-[#adb5bd] text-[0.65rem]">June 2026</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-extrabold tracking-tight ${
                      s.payment_status === 'paid' ? 'text-[#2f9e44]' : s.payment_status === 'overdue' ? 'text-[#c92a2a]' : 'text-[#1a1a2e]'
                    }`}>
                      LKR {batch.monthly_fee.toLocaleString()}
                    </p>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-bold border ${PAY_STYLE[s.payment_status]}`}>
                      {PAY_LABEL[s.payment_status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Toggle status + edit actions */}
          <div className="px-6 py-5 border-t border-[#f8f9fa] space-y-2 mt-2">
            <button onClick={() => {}} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border border-[#dee2e6] text-[#343a40] text-sm font-semibold hover:border-[#3b5bdb] hover:text-[#3b5bdb] hover:bg-[#edf2ff] transition-all">
              <Pencil size={14} /> Edit group details
            </button>
            <button
              onClick={() => onToggleStatus(batch.id)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border text-sm font-semibold transition-all ${
                batch.status === 'active'
                  ? 'border-[#dee2e6] text-[#6c757d] hover:border-[#c92a2a] hover:text-[#c92a2a] hover:bg-[#fff5f5]'
                  : 'border-[#b2f2bb] text-[#2f9e44] bg-[#ebfbee] hover:bg-[#2f9e44] hover:text-white hover:border-[#2f9e44]'
              }`}>
              <Power size={14} />
              {batch.status === 'active' ? 'Deactivate group' : 'Reactivate group'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Create group modal ──────────────────────────────────────────────────────

const BLANK: CreateForm = {
  name: '', subject: '', grade: '', schedule_day: 'Saturday',
  schedule_time: '08:00', max_students: '10', monthly_fee: '', accepting_new: true,
}

const inputCls  = "w-full border border-[#ced4da] rounded-[10px] px-3 py-[9px] text-sm text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] transition-all bg-white"
const selectCls = inputCls + " appearance-none"
const labelCls  = "block text-[#343a40] text-xs font-semibold mb-1.5"

function CreateGroupModal({ onClose, onCreate }: { onClose: () => void; onCreate: (b: Batch) => void }) {
  const [form, setForm] = useState<CreateForm>(BLANK)
  const set = (k: keyof CreateForm, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const canSubmit = form.name.trim() && form.subject && form.grade && form.monthly_fee

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const batch: Batch = {
      id:            crypto.randomUUID(),
      name:          form.name.trim(),
      subject:       form.subject,
      grade:         form.grade,
      schedule_day:  form.schedule_day,
      schedule_time: form.schedule_time,
      max_students:  parseInt(form.max_students) || 10,
      monthly_fee:   parseInt(form.monthly_fee) || 0,
      status:        'active',
      accepting_new: form.accepting_new,
      students:      [],
      sessions:      [],
    }
    onCreate(batch)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed z-50 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.16)] flex flex-col
        bottom-0 left-0 right-0 rounded-t-[20px]
        sm:bottom-auto sm:top-[6vh] sm:left-1/2 sm:-translate-x-1/2 sm:w-[500px] sm:rounded-[20px]">

        <div className="sm:hidden flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 bg-[#dee2e6] rounded-full" />
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f1f3f5] flex-shrink-0">
          <h2 className="text-[#1a1a2e] text-base font-bold tracking-tight">Create new group</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] transition-colors">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">

          <div>
            <label className={labelCls}>Group name <span className="text-[#c92a2a]">*</span></label>
            <input type="text" placeholder="e.g. A/L Maths 2027 Group" value={form.name} onChange={e => set('name', e.target.value)} required className={inputCls} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Subject <span className="text-[#c92a2a]">*</span></label>
              <select value={form.subject} onChange={e => set('subject', e.target.value)} required className={selectCls}>
                <option value="">Select</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Grade <span className="text-[#c92a2a]">*</span></label>
              <select value={form.grade} onChange={e => set('grade', e.target.value)} required className={selectCls}>
                <option value="">Select</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Day</label>
              <select value={form.schedule_day} onChange={e => set('schedule_day', e.target.value)} className={selectCls}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Time</label>
              <TimeSelect value={form.schedule_time} onChange={v => set('schedule_time', v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Max students</label>
              <div className="flex gap-1.5">
                {['5', '10', '15', '20'].map(n => (
                  <button key={n} type="button" onClick={() => set('max_students', n)}
                    className={`flex-1 py-2 rounded-[8px] text-xs font-bold border transition-all ${
                      form.max_students === n
                        ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                        : 'bg-white text-[#6c757d] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                    }`}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Monthly fee (LKR) <span className="text-[#c92a2a]">*</span></label>
              <input type="number" placeholder="e.g. 1500" value={form.monthly_fee} onChange={e => set('monthly_fee', e.target.value)} min="0" required className={inputCls} />
            </div>
          </div>

          {/* Preview */}
          {form.name && form.subject && form.grade && (
            <div className="bg-[#f8f9ff] border border-[#dbe4ff] rounded-[12px] p-4">
              <p className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.1em] font-mono mb-2">Preview</p>
              <p className="text-[#1a1a2e] text-sm font-bold">{form.name}</p>
              <p className="text-[#6c757d] text-xs mt-0.5">{form.subject} · {form.grade} · {form.schedule_day}s {form.schedule_time}</p>
              <p className="text-[#6c757d] text-xs">Max {form.max_students} students · LKR {parseInt(form.monthly_fee || '0').toLocaleString()}/mo per student</p>
            </div>
          )}

          {/* Accepting new students toggle */}
          <div className="flex items-center justify-between py-3 px-4 bg-[#f8f9fa] rounded-[10px] border border-[#dee2e6]">
            <div>
              <p className="text-[#343a40] text-xs font-semibold">Accepting new students</p>
              <p className="text-[#adb5bd] text-[0.68rem]">Students can join this group via WhatsApp</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.accepting_new}
              onClick={() => set('accepting_new', !form.accepting_new)}
              style={{
                position: 'relative',
                display: 'inline-flex',
                width: 42,
                height: 24,
                borderRadius: 100,
                background: form.accepting_new ? '#3b5bdb' : '#ced4da',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 3,
                left: form.accepting_new ? 21 : 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>

          <div className="pt-1 pb-2">
            <button type="submit" disabled={!canSubmit}
              className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all hover:-translate-y-px disabled:translate-y-0 shadow-[0_4px_14px_rgba(59,91,219,0.3)]">
              Create group
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const [batches,      setBatches]      = useState<Batch[]>([])
  const [loading,      setLoading]      = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selected,     setSelected]     = useState<Batch | null>(null)
  const [showCreate,   setShowCreate]   = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const monthYear = new Date().toISOString().slice(0, 7)
      const [batchesRes, paymentsRes] = await Promise.all([
        supabase.from('batches')
          .select('id, name, subject, grade, schedule_day, schedule_time, max_students, monthly_fee, status, accepting_new, zoom_link, zoom_meeting_id, students(id, name, whatsapp, status, created_at)')
          .eq('tutor_id', user.id)
          .order('name'),
        supabase.from('payments')
          .select('student_id, status')
          .eq('tutor_id', user.id)
          .eq('month_year', monthYear),
      ])
      const paymentMap = new Map(
        ((paymentsRes.data ?? []) as Array<{ student_id: string; status: string }>).map(p => [p.student_id, p.status])
      )
      type RawBatch = {
        id: string; name: string; subject: string; grade: string; schedule_day: string | null
        schedule_time: string | null; max_students: number | null; monthly_fee: number; status: string
        accepting_new: boolean | null
        zoom_link: string | null; zoom_meeting_id: string | null
        students: Array<{ id: string; name: string; whatsapp: string; status: string; created_at: string }>
      }
      setBatches(((batchesRes.data ?? []) as unknown as RawBatch[]).map(b => ({
        id:             b.id,
        name:           b.name,
        subject:        b.subject,
        grade:          b.grade,
        schedule_day:   b.schedule_day ?? '',
        schedule_time:  b.schedule_time ?? '',
        max_students:   b.max_students ?? 20,
        monthly_fee:    b.monthly_fee,
        status:         b.status as BatchStatus,
        accepting_new:  b.accepting_new ?? true,
        zoom_link:      b.zoom_link ?? undefined,
        zoom_meeting_id: b.zoom_meeting_id ?? undefined,
        students: (b.students ?? []).map(s => ({
          id:             s.id,
          name:           s.name,
          whatsapp:       s.whatsapp,
          payment_status: (paymentMap.get(s.id) ?? 'pending') as PayStatus,
          joined:         new Date(s.created_at).toLocaleDateString('en-LK', { month: 'short', year: 'numeric' }),
        })),
        sessions: [],
      })))
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() =>
    statusFilter === 'all' ? batches : batches.filter(b => b.status === statusFilter),
    [batches, statusFilter]
  )

  const counts = useMemo(() => ({
    all:      batches.length,
    active:   batches.filter(b => b.status === 'active').length,
    inactive: batches.filter(b => b.status === 'inactive').length,
  }), [batches])

  const totalStudents = batches.filter(b => b.status === 'active').reduce((n, b) => n + b.students.length, 0)

  function handleToggleStatus(id: string) {
    const newStatus = batches.find(b => b.id === id)?.status === 'active' ? 'inactive' : 'active'
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: newStatus as BatchStatus } : b))
    setSelected(prev => prev?.id === id ? { ...prev, status: newStatus as BatchStatus } : prev)
    const supabase = createClient()
    supabase.from('batches').update({ status: newStatus }).eq('id', id).then(() => {})
  }

  async function toggleAccepting(batchId: string, newValue: boolean) {
    // Optimistic update
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, accepting_new: newValue } : b))

    const supabase = createClient()
    const { error } = await supabase
      .from('batches')
      .update({ accepting_new: newValue })
      .eq('id', batchId)

    if (error) {
      // Revert on error
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, accepting_new: !newValue } : b))
    }
  }

  function handleRegenerateLink(id: string) {
    // Placeholder — real implementation requires Zoom API
    const newLink = `https://zoom.us/j/${Math.floor(Math.random() * 90000000000 + 10000000000)}`
    setBatches(prev => prev.map(b => b.id === id ? { ...b, zoom_link: newLink } : b))
    setSelected(prev => prev?.id === id ? { ...prev, zoom_link: newLink } : prev)
  }

  async function handleCreate(batch: Batch) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBatches(prev => [batch, ...prev]); return }
    const { data, error } = await supabase.from('batches').insert({
      tutor_id:      user.id,
      name:          batch.name,
      subject:       batch.subject,
      grade:         batch.grade,
      schedule_day:  batch.schedule_day,
      schedule_time: batch.schedule_time,
      max_students:  batch.max_students,
      monthly_fee:   batch.monthly_fee,
      status:        'active',
      accepting_new: batch.accepting_new,
      created_at:    new Date().toISOString(),
    }).select('id').single()
    if (!error && data) {
      setBatches(prev => [{ ...batch, id: (data as { id: string }).id }, ...prev])
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] leading-tight">Groups</h1>
          <p className="text-[#6c757d] text-sm mt-0.5">
            {counts.active} active · {totalStudents} students enrolled
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white text-sm font-semibold px-4 py-2.5 rounded-[10px] transition-all hover:-translate-y-px shadow-[0_4px_14px_rgba(59,91,219,0.28)] flex-shrink-0"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">New group</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex gap-2">
        {([['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as const).map(([f, label]) => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
              statusFilter === f
                ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.2)]'
                : 'bg-white text-[#6c757d] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
            }`}>
            {label} ({counts[f]})
          </button>
        ))}
      </div>

      {/* ── Group grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-[18px] border border-[#dee2e6] p-5 animate-pulse">
              <div className="h-4 bg-[#f1f3f5] rounded w-1/2 mb-2" />
              <div className="h-3 bg-[#f1f3f5] rounded w-1/3 mb-4" />
              <div className="h-8 bg-[#f1f3f5] rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[18px] border border-[#dee2e6] py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#f1f3f5] flex items-center justify-center">
            <Users size={20} className="text-[#adb5bd]" />
          </div>
          <p className="text-[#6c757d] text-sm font-medium">
            {batches.length === 0 ? 'No groups yet' : 'No groups match this filter'}
          </p>
          {batches.length === 0 && (
          <button onClick={() => setShowCreate(true)}
            className="text-[#3b5bdb] text-xs font-semibold hover:underline">
            Create your first group →
          </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(batch => (
            <GroupCard key={batch.id} batch={batch} onClick={() => setSelected(batch)} onToggleAccepting={toggleAccepting} />
          ))}
        </div>
      )}

      {/* ── Detail panel ── */}
      {selected && (
        <GroupDetailPanel
          batch={selected}
          onClose={() => setSelected(null)}
          onToggleStatus={handleToggleStatus}
          onRegenerateLink={handleRegenerateLink}
        />
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <CreateGroupModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
