'use client'

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, TrendingUp, Users, XCircle, Pencil, Plus,
  ChevronLeft, ChevronRight, LayoutList, CalendarDays,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { DateInput } from '@/components/ui/DateTimeInput'
import { computeOverdueStatus } from '@/lib/payment-status'

// ── Types (exported for component files) ──────────────────────────────────

export type SessionStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled' | 'rescheduled'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'unknown'
export type PaymentStatus = 'paid' | 'pending' | 'overdue' | 'blocked'

export interface AttendanceRecord {
  id: string
  student_id: string
  status: AttendanceStatus
  marked_at?: string
}

export interface StudentInBatch {
  id: string
  name: string
  whatsapp?: string
  status: string
  payment?: { status: PaymentStatus; amount_lkr: number } | null
  attendance?: AttendanceRecord | null
}

export interface SessionStudent {
  id: string
  name: string
  whatsapp?: string
  subject: string
  grade: string
  class_type: string
  monthly_fee?: number
}

export interface SessionBatch {
  id: string
  name: string
  subject: string
  grade: string
  schedule_day?: string
  schedule_time?: string
  monthly_fee?: number
  zoom_meeting_id?: string
}

export interface Session {
  id: string
  tutor_id: string
  student_id?: string | null
  batch_id?: string | null
  session_type: 'individual' | 'batch'
  scheduled_at: string
  duration_mins: number
  zoom_link?: string | null
  status: SessionStatus
  payment_status: PaymentStatus
  notes?: string | null
  cancelled_reason?: string | null
  rescheduled_to?: string | null
  student?: SessionStudent | null
  batch?: SessionBatch | null
  batchStudents?: StudentInBatch[]
  attendance: AttendanceRecord[]
  payment?: { status: PaymentStatus } | null
  display_name: string
}

export interface PageStats {
  today: number
  thisMonth: number
  completed: number
  cancelled: number
  attendanceRate: number
}

// ── Lazy-loaded heavy components ──────────────────────────────────────────

const BatchAttendancePanel = dynamic(() => import('@/components/BatchAttendancePanel'), { ssr: false })
const EditSessionPanel = dynamic(() => import('@/components/EditSessionPanel'), { ssr: false })
const RescheduleModal = dynamic(() => import('@/components/RescheduleModal'), { ssr: false })
const AddSessionModal = dynamic(() => import('@/components/AddSessionModal'), { ssr: false })
const SessionCalendar = dynamic(() => import('@/components/SessionCalendar'), { ssr: false })

// ── Helper constants ──────────────────────────────────────────────────────

const TODAY_STR = new Date().toISOString().split('T')[0]
const CURRENT_MONTH = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

// ── Helper functions ──────────────────────────────────────────────────────

function getWeekRange(offset = 0): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function getMonthRange(): { start: Date; end: Date } {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

function isPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date()
}

function isToday(dateStr: string): boolean {
  return dateStr.startsWith(TODAY_STR)
}

export function minutesUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 60000)
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-LK', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-LK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function hashColor(name: string): { bg: string; text: string } {
  const colors = [
    { bg: '#edf2ff', text: '#3b5bdb' },
    { bg: '#f3f0ff', text: '#7048e8' },
    { bg: '#ebfbee', text: '#2f9e44' },
    { bg: '#fff9db', text: '#e67700' },
  ]
  return colors[name.charCodeAt(0) % colors.length]
}

// ── Left border color helper ──────────────────────────────────────────────

function leftBorderColor(
  session: Session,
  nextUpId: string | null,
  paymentMap: Map<string, { status: PaymentStatus; amount_lkr: number }>
): string {
  if (session.status === 'cancelled') return 'border-l-transparent'
  if (session.id === nextUpId) return 'border-l-[#3b5bdb]'
  if (session.status === 'completed') return 'border-l-[#2f9e44]'
  const pay =
    session.payment?.status ??
    paymentMap.get(session.student_id ?? '')?.status
  if (pay === 'overdue') return 'border-l-[#c92a2a]'
  if (pay === 'pending') return 'border-l-[#e67700]'
  return 'border-l-transparent'
}

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  sub,
}: {
  icon: React.ElementType
  value: React.ReactNode
  label: string
  sub?: string
}) {
  return (
    <div className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-150">
      <div className="flex items-start gap-3">
        <div className="w-[38px] h-[38px] rounded-[10px] bg-[#edf2ff] flex items-center justify-center flex-shrink-0">
          <Icon size={17} className="text-[#3b5bdb]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[1.6rem] font-extrabold text-[#1a1a2e] leading-none tracking-[-0.04em]">{value}</p>
          <p className="text-[0.72rem] font-semibold text-[#6c757d] mt-0.5">{label}</p>
          {sub && <p className="text-[0.68rem] text-[#adb5bd] mt-0.5 leading-tight">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-[14px] border border-[#dee2e6] h-[72px] animate-pulse flex items-center gap-3 px-4"
        >
          <div className="w-14 h-8 rounded-[8px] bg-[#f1f3f5]" />
          <div className="w-9 h-9 rounded-full bg-[#f1f3f5]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-[#f1f3f5] rounded-full w-1/3" />
            <div className="h-2 bg-[#f1f3f5] rounded-full w-1/2" />
          </div>
          <div className="w-16 h-5 bg-[#f1f3f5] rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────

function IndividualAvatar({ name }: { name: string }) {
  const { bg, text } = hashColor(name)
  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[0.75rem] font-bold flex-shrink-0"
      style={{ background: bg, color: text }}
    >
      {initials}
    </div>
  )
}

function BatchAvatar({ name }: { name: string }) {
  const abbrev = name.split(' ').slice(0, 2).join(' ').substring(0, 6)
  return (
    <div className="w-9 h-9 rounded-[8px] bg-[#ebfbee] text-[#2f9e44] flex items-center justify-center flex-shrink-0">
      <span className="text-[0.5rem] font-bold text-center leading-tight px-0.5 text-center">{abbrev}</span>
    </div>
  )
}

// ── Payment pill ──────────────────────────────────────────────────────────

function PaymentPill({ status }: { status?: PaymentStatus | null }) {
  if (status === 'paid') {
    return (
      <span className="rounded-full border text-[0.65rem] font-bold px-2 py-0.5 bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]">
        Paid
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="rounded-full border text-[0.65rem] font-bold px-2 py-0.5 bg-[#fff9db] text-[#e67700] border-[#ffec99]">
        Pending
      </span>
    )
  }
  if (status === 'overdue') {
    return (
      <span className="rounded-full border text-[0.65rem] font-bold px-2 py-0.5 bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]">
        Overdue
      </span>
    )
  }
  return <span className="text-[0.65rem] text-[#adb5bd]">—</span>
}

// ── Inline session-status cycle ───────────────────────────────────────────
//
// Clicking cycles:  scheduled → completed → cancelled → scheduled
// Only shown for past/in-progress sessions.

const STATUS_CYCLE: Record<SessionStatus, SessionStatus> = {
  scheduled:   'completed',
  completed:   'no_show',
  no_show:     'cancelled',
  cancelled:   'scheduled',
  rescheduled: 'completed',
}

const STATUS_PILL: Record<SessionStatus, string> = {
  scheduled:   'bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]',
  completed:   'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]',
  no_show:     'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]',
  cancelled:   'bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]',
  rescheduled: 'bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]',
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled:   'Scheduled',
  completed:   'Completed',
  no_show:     'No Show',
  cancelled:   'Cancelled',
  rescheduled: 'Rescheduled',
}

// ── Session row ───────────────────────────────────────────────────────────

function SessionRow({
  session,
  isNextUp,
  paymentMap,
  onEdit,
  onMarkAttendance,
  markIndividualAttendance,
  cycleSessionStatus,
  showToast,
}: {
  session: Session
  isNextUp: boolean
  paymentMap: Map<string, { status: PaymentStatus; amount_lkr: number }>
  onEdit: (s: Session) => void
  onMarkAttendance: (s: Session) => void
  markIndividualAttendance: (sessionId: string, studentId: string, status: AttendanceStatus) => void
  cycleSessionStatus: (sessionId: string, next: SessionStatus) => void
  showToast: (msg: string) => void
}) {
  const future = !isPast(session.scheduled_at)
  const isCancelled = session.status === 'cancelled'
  const payStatus =
    session.payment?.status ??
    paymentMap.get(session.student_id ?? '')?.status ??
    session.payment_status

  const borderClass = leftBorderColor(session, isNextUp ? session.id : null, paymentMap)

  // Individual attendance record
  const indivRec =
    session.session_type === 'individual' && session.student_id
      ? session.attendance.find(a => a.student_id === session.student_id)
      : null

  // Batch attendance summary
  const batchPresent = session.attendance.filter(a => a.status === 'present').length
  const batchAbsent  = session.attendance.filter(a => a.status === 'absent').length
  const batchUnknown = session.attendance.filter(a => a.status === 'unknown').length
  const batchTotal   = session.attendance.length

  return (
    <div className="relative mb-2">
      {isNextUp && (
        <div className="absolute -top-0 right-4 z-10 bg-[#3b5bdb] text-white text-[0.58rem] font-bold px-2 py-0.5 rounded-b-[8px]">
          Next up · in {minutesUntil(session.scheduled_at)} min
        </div>
      )}
      <div
        className={`
          bg-white rounded-[14px] border border-[#dee2e6]
          shadow-[0_1px_3px_rgba(0,0,0,0.05)]
          border-l-[3.5px] ${borderClass}
          ${isCancelled ? 'opacity-70 bg-[#f8f9fa]' : ''}
          transition-all duration-150
        `}
      >
        {/* ── Top row: always visible ── */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#fafbff] rounded-[14px] transition-colors"
          onClick={() => onEdit(session)}
        >
          {/* Time */}
          <div className="w-16 flex-shrink-0">
            <p className={`font-mono font-bold text-[0.82rem] text-[#3b5bdb] leading-tight ${isCancelled ? 'line-through opacity-60' : ''}`}>
              {formatTime(session.scheduled_at)}
            </p>
            <p className="text-[0.65rem] text-[#adb5bd] mt-0.5">{session.duration_mins} min</p>
          </div>

          {/* Avatar */}
          {session.session_type === 'batch'
            ? <BatchAvatar name={session.display_name} />
            : <IndividualAvatar name={session.display_name} />
          }

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-[0.88rem] font-semibold text-[#1a1a2e] truncate">{session.display_name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[0.7rem] text-[#6c757d] truncate">
                {session.student?.subject || session.batch?.subject || ''}
                {(session.student?.grade || session.batch?.grade)
                  ? ` · ${session.student?.grade || session.batch?.grade}`
                  : ''}
              </span>
              {session.session_type === 'individual'
                ? <span className="bg-[#edf2ff] text-[#3b5bdb] text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full">Indiv.</span>
                : <span className="bg-[#ebfbee] text-[#2f9e44] text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full">Batch</span>
              }
            </div>
          </div>

          {/* Payment pill */}
          <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[0.58rem] font-bold text-[#adb5bd] uppercase tracking-[0.1em]">Payment</span>
            <PaymentPill status={payStatus as PaymentStatus} />
          </div>

          {/* Edit button */}
          <button
            className="ml-1 w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:border-[#3b5bdb] hover:bg-[#edf2ff] transition-all flex-shrink-0"
            title="Edit session details"
            onClick={e => { e.stopPropagation(); onEdit(session) }}
          >
            <Pencil size={13} className="text-[#6c757d]" />
          </button>
        </div>

        {/* ── Bottom action strip: status + attendance inline ── */}
        <div
          className="flex items-center gap-4 px-4 pb-3 border-t border-[#f1f3f5] mt-0 pt-2.5 flex-wrap"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Status column ── */}
          <div className="flex flex-col gap-1">
            <span className="text-[0.58rem] font-bold text-[#adb5bd] uppercase tracking-[0.1em]">Status</span>
            {future && session.status === 'scheduled' ? (
              <span className="rounded-full border text-[0.65rem] font-bold px-2.5 py-0.5 bg-[#f1f3f5] text-[#adb5bd] border-[#dee2e6]">
                Scheduled
              </span>
            ) : (
              <button
                title="Click to change status"
                onClick={() => cycleSessionStatus(session.id, STATUS_CYCLE[session.status])}
                className={`rounded-full border text-[0.65rem] font-bold px-2.5 py-0.5 transition-all hover:brightness-95 active:scale-95 ${STATUS_PILL[session.status]}`}
              >
                {STATUS_LABEL[session.status]}
              </button>
            )}
          </div>

          {/* ── Divider ── */}
          <div className="w-px h-7 bg-[#f1f3f5] flex-shrink-0" />

          {/* ── Attendance column ── */}
          <div className="flex flex-col gap-1">
            <span className="text-[0.58rem] font-bold text-[#adb5bd] uppercase tracking-[0.1em]">Attendance</span>

            {isCancelled ? (
              <span className="text-[0.65rem] text-[#adb5bd]">—</span>

            ) : future ? (
              <span className="text-[0.65rem] text-[#adb5bd]">After session</span>

            ) : session.session_type === 'individual' && session.student_id ? (
              /* Always show 3 segmented buttons — selected one filled, click selected to clear */
              <div className="flex items-center gap-1">
                {(['present', 'absent', 'late'] as const).map(s => {
                  const isSel = indivRec?.status === s
                  const cfg = {
                    present: { sel: 'bg-[#2f9e44] text-white border-[#2f9e44]',   unsel: 'border-[#b2f2bb] text-[#2f9e44] hover:bg-[#2f9e44] hover:text-white hover:border-[#2f9e44]',   label: '✓ Present' },
                    absent:  { sel: 'bg-[#c92a2a] text-white border-[#c92a2a]',   unsel: 'border-[#ffc9c9] text-[#c92a2a] hover:bg-[#c92a2a] hover:text-white hover:border-[#c92a2a]',   label: '✗ Absent'  },
                    late:    { sel: 'bg-[#e67700] text-white border-[#e67700]',   unsel: 'border-[#ffec99] text-[#e67700] hover:bg-[#e67700] hover:text-white hover:border-[#e67700]',   label: '⏰ Late'    },
                  }[s]
                  return (
                    <button
                      key={s}
                      title={isSel ? 'Click to clear' : cfg.label}
                      onClick={() => markIndividualAttendance(session.id, session.student_id!, isSel ? 'unknown' : s)}
                      className={`h-6 px-2 rounded-full border text-[0.65rem] font-bold transition-all ${isSel ? cfg.sel : cfg.unsel}`}
                    >
                      {cfg.label}
                    </button>
                  )
                })}
              </div>

            ) : session.session_type === 'batch' ? (
              batchTotal === 0 || batchUnknown === batchTotal ? (
                <button
                  onClick={() => onMarkAttendance(session)}
                  className="rounded-full border border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff] text-[0.65rem] font-bold px-2.5 py-0.5 hover:bg-[#3b5bdb] hover:text-white transition-all"
                >
                  Mark attendance
                </button>
              ) : batchUnknown > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.65rem] text-[#6c757d]">
                    ✅{batchPresent} ❌{batchAbsent} ?{batchUnknown}
                  </span>
                  <button
                    onClick={() => onMarkAttendance(session)}
                    className="rounded-full border border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff] text-[0.65rem] font-bold px-2.5 py-0.5 hover:bg-[#3b5bdb] hover:text-white transition-all"
                  >
                    {batchUnknown} left
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onMarkAttendance(session)}
                  className="rounded-full border border-[#b2f2bb] text-[#2f9e44] bg-[#ebfbee] text-[0.65rem] font-bold px-2.5 py-0.5 hover:brightness-95 transition-all"
                >
                  ✅{batchPresent} ❌{batchAbsent}
                </button>
              )
            ) : null}
          </div>

          {/* ── Zoom link strip ── */}
          {session.zoom_link && !isCancelled && (
            <div
              className="flex items-center gap-2 px-4 pb-3 pt-0"
              onClick={e => e.stopPropagation()}
            >
              <a
                href={session.zoom_link}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.65rem] font-bold border transition-all ${
                  future
                    ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] hover:bg-[#2f49b8] shadow-[0_2px_6px_rgba(59,91,219,0.3)]'
                    : 'bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff] hover:bg-[#dbe4ff]'
                }`}
              >
                <svg width="8" height="9" viewBox="0 0 10 11" fill="currentColor" className="flex-shrink-0">
                  <path d="M2 2.5L8 5.5L2 8.5V2.5Z"/>
                </svg>
                {future ? 'Join Class' : 'Open Zoom'}
              </a>
              <button
                onClick={() => { navigator.clipboard.writeText(session.zoom_link!); showToast('Zoom link copied!') }}
                className="rounded-full border border-[#dee2e6] bg-white text-[#6c757d] text-[0.6rem] font-bold px-2.5 py-1 hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-all"
              >
                Copy link
              </button>
              <span className="text-[0.6rem] text-[#adb5bd] truncate max-w-[140px] font-mono">
                {session.zoom_link.replace('https://', '')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

function SessionsPageInner() {
  const searchParams = useSearchParams()
  const [sessions, setSessions] = useState<Session[]>([])
  const [stats, setStats] = useState<PageStats>({
    today: 0,
    thisMonth: 0,
    completed: 0,
    cancelled: 0,
    attendanceRate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [tutorId, setTutorId] = useState<string>('')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'custom'>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'individual' | 'batch'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all')
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [attendanceSession, setAttendanceSession] = useState<Session | null>(null)
  const [rescheduleSession, setRescheduleSession] = useState<Session | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [paymentMap, setPaymentMap] = useState<Map<string, { status: PaymentStatus; amount_lkr: number }>>(new Map())
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref that always points to the latest reload fn (avoids stale closure in Realtime handler)
  const reloadRef = useRef<() => void>(() => {})

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadSessions = useCallback(async (dateStart?: Date, dateEnd?: Date) => {
    setLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setTutorId(user.id)

    const { start, end } =
      dateStart && dateEnd
        ? { start: dateStart, end: dateEnd }
        : getWeekRange()

    const monthRange = getMonthRange()

    const [sessionsRes, monthSessionsRes, studentsRes, batchesRes, paymentsRes, tutorRes] =
      await Promise.all([
        supabase
          .from('sessions')
          .select('*')
          .eq('tutor_id', user.id)
          .gte('scheduled_at', start.toISOString())
          .lte('scheduled_at', end.toISOString())
          .order('scheduled_at', { ascending: true }),
        supabase
          .from('sessions')
          .select('id,status,scheduled_at')
          .eq('tutor_id', user.id)
          .gte('scheduled_at', monthRange.start.toISOString())
          .lte('scheduled_at', monthRange.end.toISOString()),
        supabase
          .from('students')
          .select('id,name,whatsapp,subject,grade,class_type,monthly_fee,batch_id,status')
          .eq('tutor_id', user.id),
        supabase
          .from('batches')
          .select('id,name,subject,grade,schedule_day,schedule_time,monthly_fee,zoom_meeting_id,status')
          .eq('tutor_id', user.id),
        supabase
          .from('payments')
          .select('student_id,status,amount_lkr,month_year,is_trial_payment')
          .eq('tutor_id', user.id)
          .eq('month_year', CURRENT_MONTH),
        supabase
          .from('tutors')
          .select('monthly_due_date,grace_period_days')
          .eq('id', user.id)
          .single(),
      ])

    // Live-computed, not read from the stored payments.status column — same
    // computeOverdueStatus() helper used by Dashboard/Students/Payments/Batches,
    // so a 'pending' payment past the tutor's due date + grace period shows as
    // overdue here too instead of staying amber until the reminders cron runs.
    const monthlyDueDate  = (tutorRes.data?.monthly_due_date as number | null)  ?? 28
    const gracePeriodDays = (tutorRes.data?.grace_period_days as number | null) ?? 3

    const rawSessions = sessionsRes.data ?? []
    const sessionIds = rawSessions.map(s => s.id as string)

    const attendanceRes =
      sessionIds.length > 0
        ? await supabase.from('attendance').select('*').in('session_id', sessionIds)
        : { data: [] }

    const studentsMap = new Map(
      (studentsRes.data ?? []).map(s => [s.id as string, s])
    )
    const batchesMap = new Map(
      (batchesRes.data ?? []).map(b => [b.id as string, b])
    )
    const pMap = new Map(
      (paymentsRes.data ?? []).map(p => {
        const rawStatus = p.status as PaymentStatus
        const isTrial = (p.is_trial_payment as boolean | null) ?? false
        const liveStatus: PaymentStatus =
          rawStatus === 'pending' && !isTrial &&
          computeOverdueStatus(monthlyDueDate, gracePeriodDays, p.month_year as string, rawStatus).isOverdue
            ? 'overdue'
            : rawStatus
        return [
          p.student_id as string,
          { status: liveStatus, amount_lkr: p.amount_lkr as number },
        ]
      })
    )
    setPaymentMap(pMap)

    const attendanceBySession = new Map<string, AttendanceRecord[]>()
    for (const a of attendanceRes.data ?? []) {
      const sid = a.session_id as string
      const arr = attendanceBySession.get(sid) ?? []
      arr.push({
        id: a.id as string,
        student_id: a.student_id as string,
        status: (a.status ?? 'unknown') as AttendanceStatus,
        marked_at: a.marked_at as string | undefined,
      })
      attendanceBySession.set(sid, arr)
    }

    const enriched: Session[] = rawSessions.map(s => {
      const studentRaw = s.student_id ? studentsMap.get(s.student_id as string) ?? null : null
      const batchRaw = s.batch_id ? batchesMap.get(s.batch_id as string) ?? null : null
      const payment = s.student_id ? pMap.get(s.student_id as string) ?? null : null
      const sessionType =
        (s.session_type as string | null) ?? (s.batch_id ? 'batch' : 'individual')

      return {
        ...(s as Record<string, unknown>),
        id: s.id as string,
        tutor_id: s.tutor_id as string,
        student_id: s.student_id as string | null,
        batch_id: s.batch_id as string | null,
        session_type: sessionType as 'individual' | 'batch',
        scheduled_at: s.scheduled_at as string,
        duration_mins: (s.duration_mins as number) ?? 60,
        zoom_link: s.zoom_link as string | null,
        status: ((s.status as string) ?? 'scheduled') as SessionStatus,
        payment_status: ((s.payment_status as string) ?? 'pending') as PaymentStatus,
        notes: s.notes as string | null,
        cancelled_reason: s.cancelled_reason as string | null,
        rescheduled_to: s.rescheduled_to as string | null,
        student: studentRaw
          ? {
              id: studentRaw.id as string,
              name: studentRaw.name as string,
              whatsapp: studentRaw.whatsapp as string | undefined,
              subject: studentRaw.subject as string,
              grade: studentRaw.grade as string,
              class_type: studentRaw.class_type as string,
              monthly_fee: studentRaw.monthly_fee as number | undefined,
            }
          : null,
        batch: batchRaw
          ? {
              id: batchRaw.id as string,
              name: batchRaw.name as string,
              subject: batchRaw.subject as string,
              grade: batchRaw.grade as string,
              schedule_day: batchRaw.schedule_day as string | undefined,
              schedule_time: batchRaw.schedule_time as string | undefined,
              monthly_fee: batchRaw.monthly_fee as number | undefined,
              zoom_meeting_id: batchRaw.zoom_meeting_id as string | undefined,
            }
          : null,
        attendance: attendanceBySession.get(s.id as string) ?? [],
        payment: payment ? { status: payment.status } : null,
        display_name:
          (studentRaw?.name as string | undefined) ??
          (batchRaw?.name as string | undefined) ??
          'Unknown',
      } as Session
    })

    setSessions(enriched)

    // Stats
    const monthData = monthSessionsRes.data ?? []
    const allAttendance = attendanceRes.data ?? []
    const markedCount = allAttendance.filter(
      a => (a.status as string) !== 'unknown'
    ).length
    const presentCount = allAttendance.filter(
      a => (a.status as string) === 'present'
    ).length

    setStats({
      today: enriched.filter(s => isToday(s.scheduled_at)).length,
      thisMonth: monthData.length,
      completed: monthData.filter(s => (s.status as string) === 'completed').length,
      cancelled: monthData.filter(s => (s.status as string) === 'cancelled').length,
      attendanceRate:
        markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0,
    })

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load — seed reloadRef with the default week range
  useEffect(() => {
    reloadRef.current = () => loadSessions()
    loadSessions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open session detail when ?session=<id> is in the URL
  useEffect(() => {
    const sessionId = searchParams.get('session')
    if (!sessionId || sessions.length === 0) return
    const match = sessions.find(s => s.id === sessionId)
    if (match) setSelectedSession(match)
  }, [searchParams, sessions])

  // Date filter changes — keep reloadRef in sync with the current active filter
  useEffect(() => {
    let reload: () => void
    if (dateFilter === 'today') {
      const t = new Date(TODAY_STR + 'T00:00:00')
      const te = new Date(TODAY_STR + 'T23:59:59')
      reload = () => loadSessions(t, te)
    } else if (dateFilter === 'week') {
      const { start, end } = getWeekRange(weekOffset)
      reload = () => loadSessions(start, end)
    } else if (dateFilter === 'month') {
      const { start, end } = getMonthRange()
      reload = () => loadSessions(start, end)
    } else if (dateFilter === 'custom' && customStart && customEnd) {
      const s = new Date(customStart)
      const e = new Date(customEnd + 'T23:59:59')
      reload = () => loadSessions(s, e)
    } else {
      reload = () => loadSessions()
    }
    reloadRef.current = reload
    reload()
  }, [dateFilter, customStart, customEnd, weekOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — uses reloadRef so it always calls with the current active date range
  useEffect(() => {
    if (!tutorId) return
    const supabase = createClient()
    const channel = supabase
      .channel('sessions_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `tutor_id=eq.${tutorId}` },
        () => reloadRef.current()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => reloadRef.current()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tutorId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Inline session status cycling ─────────────────────────────────────

  const cycleSessionStatus = useCallback(
    async (sessionId: string, next: SessionStatus) => {
      // Optimistic
      setSessions(prev =>
        prev.map(s => s.id === sessionId ? { ...s, status: next } : s)
      )
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('sessions')
          .update({ status: next })
          .eq('id', sessionId)
        if (error) throw new Error(error.message)
      } catch {
        showToast('Failed to update status')
        reloadRef.current()
      }
    },
    [loadSessions, showToast]
  )

  // ── Inline attendance ──────────────────────────────────────────────────

  const markIndividualAttendance = useCallback(
    async (sessionId: string, studentId: string, status: AttendanceStatus) => {
      // Optimistic update
      setSessions(prev =>
        prev.map(s => {
          if (s.id !== sessionId) return s
          const filtered = s.attendance.filter(a => a.student_id !== studentId)
          const remainingAfterReset = filtered.filter(a => a.status !== 'unknown')
          return {
            ...s,
            // Resetting → revert to scheduled.
            // Absent → no_show (student didn't attend).
            // Present / Late → completed (session ran).
            status: (status === 'unknown'
              ? (remainingAfterReset.length > 0 ? s.status : 'scheduled')
              : status === 'absent' ? 'no_show'
              : 'completed') as SessionStatus,
            attendance:
              status === 'unknown'
                ? filtered
                : [
                    ...filtered,
                    {
                      id: 'opt_' + Date.now(),
                      student_id: studentId,
                      status,
                      marked_at: new Date().toISOString(),
                    },
                  ],
          }
        })
      )
      try {
        const supabase = createClient()
        if (status === 'unknown') {
          // Deleting the record (reset)
          await supabase
            .from('attendance')
            .delete()
            .eq('session_id', sessionId)
            .eq('student_id', studentId)
        } else {
          // Upsert attendance record
          const { error } = await supabase
            .from('attendance')
            .upsert(
              { session_id: sessionId, student_id: studentId, status, marked_at: new Date().toISOString() },
              { onConflict: 'session_id,student_id' }
            )
          if (error) throw new Error(error.message)
          // Also update session status in DB to match the optimistic update
          const newSessionStatus: SessionStatus =
            status === 'absent' ? 'no_show' : 'completed'
          await supabase
            .from('sessions')
            .update({ status: newSessionStatus })
            .eq('id', sessionId)
        }
      } catch {
        showToast('Failed to save attendance')
        reloadRef.current()
      }
    },
    [loadSessions, showToast]
  )

  // ── Computed ──────────────────────────────────────────────────────────

  const filteredSessions = useMemo(() => {
    let result = sessions
    if (typeFilter !== 'all') result = result.filter(s => s.session_type === typeFilter)
    if (statusFilter === 'upcoming')
      result = result.filter(s => s.status === 'scheduled' && !isPast(s.scheduled_at))
    if (statusFilter === 'completed') result = result.filter(s => s.status === 'completed')
    if (statusFilter === 'cancelled') result = result.filter(s => s.status === 'cancelled')
    return result
  }, [sessions, typeFilter, statusFilter])

  const nextUpId = useMemo(() => {
    const upcoming = sessions
      .filter(
        s =>
          isToday(s.scheduled_at) &&
          !isPast(s.scheduled_at) &&
          s.status === 'scheduled'
      )
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      )
    return upcoming[0]?.id ?? null
  }, [sessions])

  const nextSessionTime = useMemo(() => {
    const s = sessions.find(s => s.id === nextUpId)
    return s ? formatTime(s.scheduled_at) : null
  }, [sessions, nextUpId])

  // ── Group sessions by date ────────────────────────────────────────────

  const sessionsByDate = useMemo(() => {
    const groups = new Map<string, Session[]>()
    for (const s of filteredSessions) {
      const dateKey = s.scheduled_at.split('T')[0]
      const arr = groups.get(dateKey) ?? []
      arr.push(s)
      groups.set(dateKey, arr)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredSessions])

  // ── Handlers ─────────────────────────────────────────────────────────

  const applySessionUpdates = useCallback(
    (sessionId: string, updates: Record<string, unknown>) => {
      setSessions(prev =>
        prev.map(s => {
          if (s.id !== sessionId) return s
          const patched = { ...s, ...updates }
          // If payment_status was updated, also patch the inline payment field
          // so PaymentPill reads the new value immediately (before DB round-trip)
          if ('payment_status' in updates) {
            patched.payment_status = updates.payment_status as PaymentStatus
            // Clear cached payment object so payStatus falls through to payment_status
            patched.payment = null
          }
          return patched as Session
        })
      )
    },
    []
  )

  const handleSave = useCallback(
    (sessionId: string, updates: Record<string, unknown>) => {
      if (Object.keys(updates).length > 0) {
        applySessionUpdates(sessionId, updates)
      }
      // Reload in background to pick up any server-side changes
      // (e.g. scheduled_at changes that shift the session to a different day group)
      if ('scheduled_at' in updates) {
        reloadRef.current()
      }
    },
    [applySessionUpdates, dateFilter, loadSessions]
  )

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-4 z-[100] bg-[#1a1a2e] text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.2)] pointer-events-none">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em]">Sessions</h1>
          <p className="text-[#6c757d] text-sm mt-0.5">
            {loading ? 'Loading…' : `${stats.thisMonth} sessions this month · ${stats.today} today`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-[#3b5bdb] hover:bg-[#4c6ef5] px-4 py-2.5 rounded-[10px] shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:-translate-y-px transition-all"
        >
          <Plus size={15} /> Add Session
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Calendar}
          value={stats.today}
          label="Sessions today"
          sub={nextSessionTime ? `Next: ${nextSessionTime}` : 'None upcoming'}
        />
        <StatCard
          icon={TrendingUp}
          value={stats.thisMonth}
          label="This month"
          sub={`${stats.completed} completed`}
        />
        <StatCard
          icon={Users}
          value={`${stats.attendanceRate}%`}
          label="Attendance rate"
          sub="Marked sessions only"
        />
        <StatCard
          icon={XCircle}
          value={stats.cancelled}
          label="Cancelled"
          sub="This month"
        />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-[#dee2e6] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">

        {/* Row 1: view toggle + date controls (date pills OR inline custom inputs) */}
        <div className={`flex items-center gap-3 px-4 py-3 flex-wrap ${view === 'list' ? 'border-b border-[#f1f3f5]' : ''}`}>

          {/* View toggle — segmented */}
          <div className="flex items-center bg-[#f1f3f5] rounded-[8px] p-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 text-[0.75rem] font-semibold px-3 py-1.5 rounded-[6px] transition-all ${
                view === 'list' ? 'bg-white text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#6c757d] hover:text-[#343a40]'
              }`}
            >
              <LayoutList size={13} /> List
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 text-[0.75rem] font-semibold px-3 py-1.5 rounded-[6px] transition-all ${
                view === 'calendar' ? 'bg-white text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#6c757d] hover:text-[#343a40]'
              }`}
            >
              <CalendarDays size={13} /> Calendar
            </button>
          </div>

          <div className="w-px h-5 bg-[#dee2e6] flex-shrink-0" />

          {/* Date pills — hide when custom to make room for inline inputs */}
          {dateFilter !== 'custom' ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['today', 'week', 'month', 'custom'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDateFilter(f)}
                  className={`text-[0.75rem] font-semibold px-3 py-1.5 rounded-[8px] border transition-all ${
                    dateFilter === f
                      ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_6px_rgba(59,91,219,0.25)]'
                      : 'bg-[#f8f9fa] border-[#dee2e6] text-[#6c757d] hover:border-[#adb5bd] hover:text-[#343a40]'
                  }`}
                >
                  {f === 'today' ? 'Today' : f === 'week' ? 'This week' : f === 'month' ? 'This month' : 'Custom range'}
                </button>
              ))}
            </div>
          ) : (
            /* Custom date inputs inline — no extra row needed */
            <div className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => { setDateFilter('week'); setCustomStart(''); setCustomEnd('') }}
                className="text-[0.72rem] font-semibold text-[#6c757d] hover:text-[#3b5bdb] flex-shrink-0 transition-colors"
              >
                ← Back
              </button>
              <span className="text-[0.72rem] font-medium text-[#6c757d] flex-shrink-0">From</span>
              <div className="w-[145px] flex-shrink-0">
                <DateInput value={customStart} onChange={setCustomStart} />
              </div>
              <span className="text-[#adb5bd] flex-shrink-0">–</span>
              <div className="w-[145px] flex-shrink-0">
                <DateInput value={customEnd} onChange={setCustomEnd} />
              </div>
            </div>
          )}

          {/* Calendar week nav — right-aligned */}
          {view === 'calendar' && (
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              <button onClick={() => setWeekOffset(w => w - 1)} className="w-7 h-7 rounded-[6px] border border-[#dee2e6] bg-white flex items-center justify-center hover:border-[#3b5bdb] hover:bg-[#edf2ff] transition-all">
                <ChevronLeft size={13} className="text-[#6c757d]" />
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="w-7 h-7 rounded-[6px] border border-[#dee2e6] bg-white flex items-center justify-center hover:border-[#3b5bdb] hover:bg-[#edf2ff] transition-all">
                <ChevronRight size={13} className="text-[#6c757d]" />
              </button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="text-[0.72rem] font-semibold text-[#3b5bdb] hover:underline">
                  Today
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 2: type + status filter dropdowns (list view only) */}
        {view === 'list' && (
          <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className={`text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] outline-none cursor-pointer transition-colors ${
                typeFilter !== 'all'
                  ? 'border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff]'
                  : 'border-[#dee2e6] text-[#6c757d] bg-[#f8f9fa] hover:border-[#adb5bd]'
              }`}
            >
              <option value="all">All types</option>
              <option value="individual">Individual</option>
              <option value="batch">Batch</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className={`text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] outline-none cursor-pointer transition-colors ${
                statusFilter !== 'all'
                  ? 'border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff]'
                  : 'border-[#dee2e6] text-[#6c757d] bg-[#f8f9fa] hover:border-[#adb5bd]'
              }`}
            >
              <option value="all">All statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonList />
      ) : view === 'calendar' ? (
        <SessionCalendar
          sessions={filteredSessions}
          weekOffset={weekOffset}
          onWeekChange={dir => setWeekOffset(o => o + dir)}
          onSelect={setSelectedSession}
        />
      ) : filteredSessions.length === 0 ? (
        <div className="bg-white rounded-[18px] border border-[#dee2e6] py-20 flex flex-col items-center gap-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <span className="text-5xl">📅</span>
          <p className="text-[#1a1a2e] font-bold text-base">No sessions found</p>
          <p className="text-[#6c757d] text-sm max-w-xs">
            Sessions are created when students book via WhatsApp or when you add them manually.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white bg-[#3b5bdb] hover:bg-[#4c6ef5] px-4 py-2 rounded-[10px] shadow-[0_4px_14px_rgba(59,91,219,0.3)] transition-all"
          >
            <Plus size={14} /> Add session
          </button>
        </div>
      ) : (
        <div>
          {sessionsByDate.map(([dateKey, dateSessions]) => {
            const isTodayGroup = dateKey === TODAY_STR
            const groupLabel = isTodayGroup ? 'Today' : ''
            const formattedDate = new Date(dateKey).toLocaleDateString('en-LK', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })
            return (
              <div key={dateKey}>
                {/* Date group header */}
                <div className="flex items-center gap-3 my-4">
                  <span
                    className={`text-[0.62rem] font-bold uppercase tracking-[0.12em] flex-shrink-0 font-mono ${
                      isTodayGroup ? 'text-[#3b5bdb]' : 'text-[#adb5bd]'
                    }`}
                  >
                    {groupLabel ? `${groupLabel} · ` : ''}{formattedDate}
                  </span>
                  <div className="flex-1 h-px bg-[#dee2e6]" />
                </div>

                {/* Session rows */}
                {dateSessions.map(session => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    isNextUp={session.id === nextUpId}
                    paymentMap={paymentMap}
                    onEdit={setSelectedSession}
                    onMarkAttendance={setAttendanceSession}
                    markIndividualAttendance={markIndividualAttendance}
                    cycleSessionStatus={cycleSessionStatus}
                    showToast={showToast}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Panels and modals */}
      {selectedSession && (
        <EditSessionPanel
          session={selectedSession}
          tutorId={tutorId}
          onClose={() => setSelectedSession(null)}
          onSave={updates => {
            handleSave(selectedSession.id, updates)
            setSelectedSession(null)
            if (Object.keys(updates).length > 0) {
              reloadRef.current()
            }
          }}
          onOpenReschedule={s => { setRescheduleSession(s); setSelectedSession(null) }}
          onOpenAttendance={s => { setAttendanceSession(s); setSelectedSession(null) }}
        />
      )}

      {attendanceSession && (
        <BatchAttendancePanel
          session={attendanceSession}
          tutorId={tutorId}
          paymentMap={paymentMap}
          onClose={() => setAttendanceSession(null)}
          onSave={() => {
            setAttendanceSession(null)
            showToast('Attendance saved')
          }}
        />
      )}

      {rescheduleSession && (
        <RescheduleModal
          session={rescheduleSession}
          tutorId={tutorId}
          onClose={() => setRescheduleSession(null)}
          onSave={() => {
            setRescheduleSession(null)
            // Mark the original session as rescheduled immediately in local state
            // so it stops showing as cancelled/scheduled before the reload arrives
            applySessionUpdates(rescheduleSession.id, { status: 'rescheduled' })
            // Full reload using the current active date filter
            reloadRef.current()
            showToast('Session rescheduled')
          }}
        />
      )}

      {showAdd && (
        <AddSessionModal
          tutorId={tutorId}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false)
            reloadRef.current()
            showToast('Session added')
          }}
        />
      )}
    </div>
  )
}

// useSearchParams() requires a Suspense boundary for static generation.
export default function SessionsPage() {
  return (
    <Suspense fallback={null}>
      <SessionsPageInner />
    </Suspense>
  )
}
