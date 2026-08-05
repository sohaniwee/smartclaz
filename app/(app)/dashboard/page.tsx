'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
const BatchAttendancePanel = dynamic(() => import('@/components/BatchAttendancePanel'), { ssr: false })
import {
  TrendingUp, Users, Calendar, CreditCard,
  CheckCircle2, XCircle, AlertCircle, Bot,
  ChevronRight, ArrowUp, ArrowDown,
  MessageCircle,
  Clock, Activity,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AddStudentModal, { type Batch } from '@/components/AddStudentModal'
import CSVUpload from '@/components/CSVUpload'
import InviteMessage from '@/components/InviteMessage'
import GettingStartedChecklist from '@/components/GettingStartedChecklist'
import GettingStartedWizard from '@/components/GettingStarted'
import type { SubjectEntry } from '@/lib/types/subjects'
import CountUp from '@/components/CountUp'

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'upcoming' | 'completed' | 'no_show' | 'cancelled'
type PaymentStatus = 'paid' | 'pending' | 'overdue'

interface TodaySession {
  id: string
  student_id: string | null
  batch_id: string | null
  time: string
  displayName: string
  subject: string
  type: 'individual' | 'batch'
  status: SessionStatus
  payment: PaymentStatus
  durationMins: number
  zoomLink: string | null
  studentCount: number | null
  scheduledAt: string
}

interface UpcomingItem {
  id: string
  date: string
  time: string
  displayName: string
  subject: string
  type: 'individual' | 'batch'
}

interface ChatItem {
  id: string
  name: string
  lastMessage: string
  time: string
  status: 'bot' | 'needs_help' | 'resolved'
  unread: boolean
}

interface AtRiskStudent {
  studentId: string
  studentName: string
  amountLkr: number
  dueDate: string
  daysOverdue: number
}

interface MissedSession {
  id: string
  studentName: string
  subject: string
  scheduledAt: string
}

interface RecentActivity {
  id: string
  action: string
  description: string
  createdAt: string
}

interface DashboardStats {
  incomeThisMonth: number
  activeStudents: number
  sessionsToday: number
  pendingPaymentsTotal: number
  pendingPaymentsCount: number
}

interface ActionCounts {
  pendingPayments: number
  chatsNeedingHelp: number
  overdueStudents: number
  newEnquiriesToday: number
  waitlistCount: number
  staleOffersCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(name: string): string {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}

function getTodayLabel() {
  return new Date().toLocaleDateString('en-LK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function getTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-LK', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = (h ?? 0) >= 12 ? 'PM' : 'AM'
  const hour   = (h ?? 0) % 12 || 12
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

const DAYS_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function daysOverdue(dueDateStr: string): number {
  const due = new Date(dueDateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
}

function getActivityIcon(action: string) {
  if (action === 'student_joined') return <Users size={13} className="text-[#3b5bdb]" />
  if (action === 'payment_verified') return <CreditCard size={13} className="text-[#2f9e44]" />
  if (action === 'no_show_detected') return <XCircle size={13} className="text-[#c92a2a]" />
  return <Activity size={13} className="text-[#6c757d]" />
}

function getActivityIconBg(action: string) {
  if (action === 'student_joined') return 'bg-[#edf2ff]'
  if (action === 'payment_verified') return 'bg-[#ebfbee]'
  if (action === 'no_show_detected') return 'bg-[#fff5f5]'
  return 'bg-[#f1f3f5]'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  valueClass = 'text-[#1a1a2e]',
  loading = false,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  sub?: string
  trend?: 'up' | 'down'
  valueClass?: string
  loading?: boolean
}) {
  return (
    <div className="bg-white rounded-[18px] border border-[#dee2e6] p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="w-[38px] h-[38px] rounded-[10px] bg-[#edf2ff] flex items-center justify-center flex-shrink-0">
          <Icon size={17} className="text-[#3b5bdb]" />
        </div>
        {trend && !loading && (
          <span className={`flex items-center gap-0.5 text-[0.68rem] font-bold ${trend === 'up' ? 'text-[#2f9e44]' : 'text-[#c92a2a]'}`}>
            {trend === 'up' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {trend === 'up' ? '+12%' : '-5%'}
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 w-28 bg-[#f1f3f5] rounded-[6px]" />
          <div className="h-3 w-20 bg-[#f1f3f5] rounded-[6px]" />
        </div>
      ) : (
        <>
          <p className={`text-[1.6rem] font-extrabold tracking-[-0.04em] leading-none mb-1 ${valueClass}`}>
            {value}
          </p>
          <p className="text-[#6c757d] text-[0.72rem] font-semibold">{label}</p>
          {sub && <p className="text-[#adb5bd] text-[0.65rem] mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  )
}

const SESSION_STATUS_STYLES: Record<SessionStatus, string> = {
  upcoming:  'bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]',
  completed: 'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]',
  no_show:   'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]',
  cancelled: 'bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]',
}
const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  upcoming: 'Upcoming', completed: 'Completed', no_show: 'No Show', cancelled: 'Cancelled',
}
const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  paid:    'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]',
  pending: 'bg-[#fff9db] text-[#e67700] border-[#ffec99]',
  overdue: 'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]',
}

function isStartingSoon(scheduledAt: string): boolean {
  const diff = new Date(scheduledAt).getTime() - Date.now()
  return diff >= 0 && diff <= 15 * 60 * 1000
}

function isClassPast(scheduledAt: string): boolean {
  const t = new Date(scheduledAt).getTime()
  return !isNaN(t) && t < Date.now()
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function SessionRow({ session, onStatusChange, onMarkBatchAttendance }: { session: TodaySession; onStatusChange: () => void; onMarkBatchAttendance: (s: TodaySession) => void }) {
  const [, setTick] = useState(0)
  const [marking, setMarking] = useState<'completed' | 'no_show' | null>(null)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const isCompleted = session.status === 'completed'
  const isNoShow = session.status === 'no_show'
  const isPast = !isCompleted && !isNoShow && isClassPast(session.scheduledAt)
  const startsSoon = !isPast && session.status === 'upcoming' && isStartingSoon(session.scheduledAt)

  async function markStatus(status: 'completed' | 'no_show') {
    setMarking(status)
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      onStatusChange()
    } finally {
      setMarking(null)
    }
  }

  return (
    <div className="flex items-center gap-4 py-4 border-b border-[#f1f3f5] last:border-0">
      {/* Time + duration */}
      <div className="w-[72px] flex-shrink-0">
        <p className="text-[0.82rem] font-bold text-[#1a1a2e] tabular-nums leading-tight">
          {session.time.replace(/^0/, '')}
        </p>
        <p className="text-[0.68rem] text-[#adb5bd] font-medium mt-0.5">{session.durationMins} min</p>
      </div>

      {/* Initials avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[0.72rem] font-extrabold
        ${isCompleted ? 'bg-[#ebfbee] text-[#2f9e44]' : isNoShow ? 'bg-[#fff5f5] text-[#c92a2a]' : 'bg-[#edf2ff] text-[#3b5bdb]'}`}>
        {getInitials(session.displayName)}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-[0.875rem] font-bold truncate ${isCompleted ? 'text-[#6c757d]' : isNoShow ? 'text-[#c92a2a]' : 'text-[#1a1a2e]'}`}>
          {session.displayName}
        </p>
        <p className="text-[0.72rem] text-[#6c757d] mt-0.5 truncate">
          {session.subject || 'No subject'}
          <span className="text-[#ced4da] mx-1">·</span>
          {session.type === 'batch'
            ? session.studentCount ? `${session.studentCount} students` : 'Group'
            : '1-on-1'}
        </p>
      </div>

      {/* Right: status + actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isCompleted && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.7rem] font-bold border bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2f9e44] flex-shrink-0" />
            Done
          </span>
        )}
        {isNoShow && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.7rem] font-bold border bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c92a2a] flex-shrink-0" />
            No show
          </span>
        )}
        {!isCompleted && !isNoShow && isPast && session.type === 'individual' && (
          <>
            <button onClick={() => markStatus('completed')} disabled={marking !== null}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[0.7rem] font-bold border bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb] hover:bg-[#d3f9d8] transition-colors disabled:opacity-50">
              {marking === 'completed' ? '…' : '✓ Done'}
            </button>
            <button onClick={() => markStatus('no_show')} disabled={marking !== null}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[0.7rem] font-bold border bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9] hover:bg-[#ffe3e3] transition-colors disabled:opacity-50">
              {marking === 'no_show' ? '…' : '✗ No show'}
            </button>
          </>
        )}
        {!isCompleted && !isNoShow && isPast && session.type === 'batch' && session.batch_id && (
          <button
            onClick={() => onMarkBatchAttendance(session)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.7rem] font-bold border bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff] hover:bg-[#dbe4ff] transition-colors"
          >
            Mark attendance
          </button>
        )}
        {!isCompleted && !isNoShow && !isPast && startsSoon && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.7rem] font-bold border bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2f9e44] animate-pulse flex-shrink-0" />
            Starts soon
          </span>
        )}
        {!isCompleted && !isNoShow && !isPast && !startsSoon && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.7rem] font-bold border bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#adb5bd] flex-shrink-0" />
            Upcoming
          </span>
        )}
        {!isCompleted && !isNoShow && !isPast && session.zoomLink && (
          <a
            href={session.zoomLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[0.7rem] font-bold transition-colors ${
              startsSoon
                ? 'bg-[#3b5bdb] text-white hover:bg-[#2f49b8] shadow-[0_2px_8px_rgba(59,91,219,0.35)]'
                : 'bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] hover:bg-[#dbe4ff]'
            }`}
          >
            <svg width="10" height="11" viewBox="0 0 10 11" fill="currentColor" className="flex-shrink-0">
              <path d="M2 2.5L8 5.5L2 8.5V2.5Z"/>
            </svg>
            {startsSoon ? 'Start Class' : 'Join Class'}
          </a>
        )}
        <Link
          href={`/sessions?session=${session.id}`}
          className="text-[0.72rem] font-semibold text-[#6c757d] hover:text-[#3b5bdb] transition-colors whitespace-nowrap"
        >
          Manage →
        </Link>
      </div>
    </div>
  )
}

// ─── Realtime updater (subscribes and triggers refreshes) ─────────────────────

function RealtimeUpdater({
  tutorId,
  onPaymentsChange,
  onConversationsChange,
  onStudentsChange,
  onSessionsChange,
}: {
  tutorId: string
  onPaymentsChange: () => void
  onConversationsChange: () => void
  onStudentsChange: () => void
  onSessionsChange: () => void
}) {
  const router = useRouter()
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dashboard-rt-${tutorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `tutor_id=eq.${tutorId}` }, () => {
        onConversationsChange()
        router.refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `tutor_id=eq.${tutorId}` }, () => {
        onPaymentsChange()
        router.refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `tutor_id=eq.${tutorId}` }, () => {
        onStudentsChange()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `tutor_id=eq.${tutorId}` }, () => {
        onSessionsChange()
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [tutorId, onPaymentsChange, onConversationsChange, onStudentsChange, onSessionsChange, router])

  return null
}

// ─── Session skeleton ─────────────────────────────────────────────────────────

function SessionSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#f1f3f5] last:border-0 animate-pulse">
      <div className="w-11 h-4 bg-[#f1f3f5] rounded" />
      <div className="w-2 h-2 rounded-full bg-[#f1f3f5]" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-[#f1f3f5] rounded w-2/3" />
        <div className="h-3 bg-[#f1f3f5] rounded w-1/3" />
      </div>
      <div className="hidden sm:flex gap-2">
        <div className="w-14 h-5 bg-[#f1f3f5] rounded-full" />
        <div className="w-16 h-5 bg-[#f1f3f5] rounded-full" />
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tutorId,           setTutorId]           = useState<string | null>(null)
  const [tutorName,         setTutorName]         = useState('')
  const [hasSubjects,       setHasSubjects]       = useState(false)
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [tutorObj,           setTutorObj]           = useState<Record<string, unknown> | null>(null)

  // ── Add Student modal state ────────────────────────────────────────────
  const [showAddStudent,    setShowAddStudent]    = useState(false)
  const [showCSV,           setShowCSV]           = useState(false)
  const [showInvite,        setShowInvite]        = useState(false)
  const [tutorWhatsapp,     setTutorWhatsapp]     = useState('')
  const [tutorSubjects,     setTutorSubjects]     = useState<SubjectEntry[]>([])
  const [tutorBatches,      setTutorBatches]      = useState<Batch[]>([])
  const [tutorMonthlyDueDate, setTutorMonthlyDueDate] = useState<number | null>(null)
  const [tutorAvailability,   setTutorAvailability]   = useState<Array<{ day: string; enabled: boolean; start: string; end: string }>>([])
  const [sessionDuration,     setSessionDuration]     = useState<string>('')

  const [stats,         setStats]         = useState<DashboardStats | null>(null)
  const [statsLoading,  setStatsLoading]  = useState(true)

  // ── Onboarding checklist counts ─────────────────────────────────────────
  const [onboardingCounts,  setOnboardingCounts]  = useState({ students: 0, batches: 0, sessions: 0, payments: 0 })
  const [onboardingLoading, setOnboardingLoading] = useState(true)

  const [actions,       setActions]       = useState<ActionCounts>({ pendingPayments: 0, chatsNeedingHelp: 0, overdueStudents: 0, newEnquiriesToday: 0, waitlistCount: 0, staleOffersCount: 0 })
  const [actionsLoading, setActionsLoading] = useState(true)

  const [sessions,      setSessions]      = useState<TodaySession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  const [upcoming,      setUpcoming]      = useState<UpcomingItem[]>([])
  const [upcomingLoading, setUpcomingLoading] = useState(true)

  const [atRisk,              setAtRisk]              = useState<AtRiskStudent[]>([])
  const [atRiskLoading,       setAtRiskLoading]       = useState(true)

  const [missedSessions, setMissedSessions] = useState<MissedSession[]>([])
  const [missedLoading,  setMissedLoading]  = useState(true)

  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])

  const [recentChats,   setRecentChats]   = useState<ChatItem[]>([])
  const [waitlistCount, setWaitlistCount] = useState(0)
  const [trialCount,    setTrialCount]    = useState(0)

  const [dashboardAttendanceSession, setDashboardAttendanceSession] = useState<import('@/components/BatchAttendancePanel').MinimalBatchSession | null>(null)

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchTutor = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    try {
      const { data } = await supabase
        .from('tutors')
        .select('name, created_at, subjects, monthly_due_date, whatsapp_number, availability, notification_prefs, onboarding_complete, teaching_style')
        .eq('id', userId)
        .single()
      if (data) {
        setTutorName(data.name ?? '')
        setTutorWhatsapp(data.whatsapp_number ?? '')
        const subjects = data.subjects
        setHasSubjects(Array.isArray(subjects) ? subjects.length > 0 : !!subjects)
        // Populate modal data
        if (Array.isArray(subjects)) setTutorSubjects(subjects as SubjectEntry[])
        if (typeof data.monthly_due_date === 'number') setTutorMonthlyDueDate(data.monthly_due_date)
        if (Array.isArray(data.availability)) setTutorAvailability(data.availability as Array<{ day: string; enabled: boolean; start: string; end: string }>)
        const prefs = data.notification_prefs as Record<string, unknown> | null
        if (prefs?.session_duration) setSessionDuration(String(prefs.session_duration))
        // Onboarding wizard
        setOnboardingComplete(data.onboarding_complete ?? false)
        setTutorObj({ id: userId, ...data })
      }
    } catch { /* table may not exist yet */ }
  }, [])

  const fetchBatches = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    try {
      const { data } = await supabase
        .from('batches')
        .select('id, name, subject')
        .eq('tutor_id', userId)
        .eq('status', 'active')
        .order('name', { ascending: true })
      if (data) {
        setTutorBatches(data as Batch[])
      }
    } catch { /* graceful fallback */ }
  }, [])

  const fetchStats = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>, sessionCount = 0) => {
    try {
      setStatsLoading(true)
      const monthYear = new Date().toISOString().slice(0, 7) // "YYYY-MM"

      const [incomeRes, activeRes, pendingRes] = await Promise.all([
        supabase
          .from('payments')
          .select('amount_lkr')
          .eq('tutor_id', userId)
          .eq('status', 'paid')
          .eq('month_year', monthYear),

        supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', userId)
          .eq('status', 'active'),

        supabase
          .from('payments')
          .select('amount_lkr')
          .eq('tutor_id', userId)
          .in('status', ['pending', 'overdue']),
      ])

      const incomeThisMonth = ((incomeRes.data ?? []) as Array<{ amount_lkr: number }>)
        .reduce((sum, p) => sum + (p.amount_lkr ?? 0), 0)

      const pendingPaymentsTotal = ((pendingRes.data ?? []) as Array<{ amount_lkr: number }>)
        .reduce((sum, p) => sum + (p.amount_lkr ?? 0), 0)

      setStats({
        incomeThisMonth,
        activeStudents:      activeRes.count ?? 0,
        sessionsToday:       sessionCount,
        pendingPaymentsTotal,
        pendingPaymentsCount: pendingRes.data?.length ?? 0,
      })
    } catch { /* graceful fallback */ }
    setStatsLoading(false)
  }, [])

  const fetchOnboardingCounts = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    setOnboardingLoading(true)
    try {
      const [studentsRes, batchesRes, sessionsRes, paymentsRes] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('tutor_id', userId),
        supabase.from('batches').select('*', { count: 'exact', head: true }).eq('tutor_id', userId),
        supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('tutor_id', userId),
        supabase.from('payments').select('*', { count: 'exact', head: true }).eq('tutor_id', userId),
      ])

      setOnboardingCounts({
        students: studentsRes.count ?? 0,
        batches:  batchesRes.count  ?? 0,
        sessions: sessionsRes.count ?? 0,
        payments: paymentsRes.count ?? 0,
      })
    } catch { /* graceful fallback */ }
    setOnboardingLoading(false)
  }, [])

  const fetchActionCounts = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    setActionsLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const todayStart = `${today}T00:00:00`
      const todayEnd   = `${today}T23:59:59`

      const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

      const [pendingRes, chatsRes, overdueRes, enquiriesRes, waitlistRes, staleOffersRes] = await Promise.all([
        supabase
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', userId)
          .eq('status', 'pending'),

        supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', userId)
          .eq('status', 'human'),

        supabase
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', userId)
          .eq('status', 'pending')
          .lt('due_date', today),

        supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', userId)
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd),

        supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', userId)
          .eq('status', 'waiting'),

        supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', userId)
          .eq('status', 'offered')
          .lt('notified_at', staleThreshold),
      ])

      setActions({
        pendingPayments:   pendingRes.count    ?? 0,
        chatsNeedingHelp:  chatsRes.count      ?? 0,
        overdueStudents:   overdueRes.count    ?? 0,
        newEnquiriesToday: enquiriesRes.count  ?? 0,
        waitlistCount:     waitlistRes.count   ?? 0,
        staleOffersCount:  staleOffersRes.count ?? 0,
      })
    } catch { /* graceful fallback */ }
    setActionsLoading(false)
  }, [])

  const fetchTodaySessions = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    setSessionsLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: raw } = await supabase
        .from('sessions')
        .select(`
          id, batch_id, scheduled_at, session_type, status, payment_status, student_id,
          duration_mins, zoom_link,
          students(name, subject),
          batches(name, subject, max_students)
        `)
        .eq('tutor_id', userId)
        .gte('scheduled_at', `${today}T00:00:00`)
        .lte('scheduled_at', `${today}T23:59:59`)
        .order('scheduled_at', { ascending: true })

      type RawSession = {
        id: string
        batch_id: string | null
        scheduled_at: string
        session_type: string
        status: string
        payment_status: string
        student_id: string | null
        duration_mins: number | null
        zoom_link: string | null
        students: { name: string; subject: string | null } | null
        batches: { name: string; subject: string | null; max_students: number | null } | null
      }

      const mapped: TodaySession[] = ((raw ?? []) as unknown as RawSession[]).map(s => ({
        id: s.id,
        student_id: s.student_id ?? null,
        batch_id: s.batch_id ?? null,
        scheduledAt: s.scheduled_at,
        time: new Date(s.scheduled_at).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: false }),
        displayName: s.session_type === 'batch'
          ? (s.batches?.name ?? 'Group class')
          : (s.students?.name ?? 'Student'),
        subject: s.session_type === 'batch'
          ? (s.batches?.subject ?? '')
          : (s.students?.subject ?? ''),
        type: s.session_type === 'batch' ? 'batch' : 'individual',
        status: (s.status === 'scheduled' ? 'upcoming' : s.status) as SessionStatus,
        payment: s.payment_status === 'paid' ? 'paid' : s.payment_status === 'forfeited' ? 'overdue' : 'pending',
        durationMins: s.duration_mins ?? 60,
        zoomLink: s.zoom_link ?? null,
        studentCount: s.session_type === 'batch' ? (s.batches?.max_students ?? null) : null,
      }))

      setSessions(mapped)
      setSessionsLoading(false)
      return mapped.length
    } catch {
      setSessionsLoading(false)
      return 0
    }
  }, [])

  const fetchUpcoming = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    setUpcomingLoading(true)
    try {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      const nextWeek = new Date(tomorrow)
      nextWeek.setDate(nextWeek.getDate() + 7)

      const { data: raw } = await supabase
        .from('sessions')
        .select(`
          id, scheduled_at, session_type,
          students(name, subject),
          batches(name, subject)
        `)
        .eq('tutor_id', userId)
        .eq('status', 'scheduled')
        .gte('scheduled_at', tomorrow.toISOString())
        .lte('scheduled_at', nextWeek.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10)

      type RawUpcoming = {
        id: string
        scheduled_at: string
        session_type: string
        students: { name: string; subject: string | null } | null
        batches: { name: string; subject: string | null } | null
      }

      const mapped: UpcomingItem[] = ((raw ?? []) as unknown as RawUpcoming[]).map(s => ({
        id: s.id,
        date: getDateLabel(s.scheduled_at),
        time: new Date(s.scheduled_at).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: false }),
        displayName: s.session_type === 'batch'
          ? (s.batches?.name ?? 'Group class')
          : (s.students?.name ?? 'Student'),
        subject: s.session_type === 'batch'
          ? (s.batches?.subject ?? '')
          : (s.students?.subject ?? ''),
        type: s.session_type === 'batch' ? 'batch' : 'individual',
      }))

      setUpcoming(mapped)
    } catch { /* graceful fallback */ }
    setUpcomingLoading(false)
  }, [])

  const fetchAtRisk = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    setAtRiskLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: raw } = await supabase
        .from('payments')
        .select(`
          student_id, amount_lkr, due_date,
          students(name)
        `)
        .eq('tutor_id', userId)
        .eq('status', 'pending')
        .lt('due_date', today)
        .order('due_date', { ascending: true })
        .limit(5)

      type RawAtRisk = {
        student_id: string
        amount_lkr: number
        due_date: string
        students: { name: string } | null
      }

      const mapped: AtRiskStudent[] = ((raw ?? []) as unknown as RawAtRisk[]).map(p => ({
        studentId: p.student_id,
        studentName: p.students?.name ?? 'Unknown',
        amountLkr: p.amount_lkr ?? 0,
        dueDate: p.due_date,
        daysOverdue: daysOverdue(p.due_date),
      }))

      setAtRisk(mapped)
    } catch { /* graceful fallback */ }
    setAtRiskLoading(false)
  }, [])


  const fetchMissedSessions = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    setMissedLoading(true)
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const now = new Date().toISOString()

      // Include explicit no_show AND sessions that are still 'scheduled' but already in the past
      const [noShowRes, pastScheduledRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, scheduled_at, students(name, subject)')
          .eq('tutor_id', userId)
          .eq('status', 'no_show')
          .gte('scheduled_at', thirtyDaysAgo.toISOString())
          .order('scheduled_at', { ascending: false })
          .limit(5),

        supabase
          .from('sessions')
          .select('id, scheduled_at, students(name, subject)')
          .eq('tutor_id', userId)
          .eq('status', 'scheduled')
          .lt('scheduled_at', now)
          .gte('scheduled_at', thirtyDaysAgo.toISOString())
          .order('scheduled_at', { ascending: false })
          .limit(5),
      ])

      type RawMissed = { id: string; scheduled_at: string; students: { name: string; subject: string | null } | null }

      const combined = [
        ...((noShowRes.data ?? []) as unknown as RawMissed[]),
        ...((pastScheduledRes.data ?? []) as unknown as RawMissed[]),
      ]
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
        .slice(0, 5)

      setMissedSessions(combined.map(s => ({
        id: s.id,
        studentName: s.students?.name ?? 'Unknown',
        subject: s.students?.subject ?? '',
        scheduledAt: s.scheduled_at,
      })))
    } catch { /* graceful */ }
    setMissedLoading(false)
  }, [])

  const fetchRecentActivity = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    try {
      // Pull from real tables: paid payments, completed/no-show sessions, new students
      const [paymentsRes, sessionsRes, studentsRes] = await Promise.all([
        supabase
          .from('payments')
          .select('id, amount_lkr, paid_at, students(name)')
          .eq('tutor_id', userId)
          .eq('status', 'paid')
          .not('paid_at', 'is', null)
          .order('paid_at', { ascending: false })
          .limit(5),
        supabase
          .from('sessions')
          .select('id, status, scheduled_at, students(name, subject), batches(name, subject)')
          .eq('tutor_id', userId)
          .in('status', ['completed', 'no_show'])
          .order('scheduled_at', { ascending: false })
          .limit(5),
        supabase
          .from('students')
          .select('id, name, subject, created_at')
          .eq('tutor_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const entries: RecentActivity[] = []

      type RawPayment = { id: string; amount_lkr: number; paid_at: string; students: { name: string } | null }
      for (const p of ((paymentsRes.data ?? []) as unknown as RawPayment[])) {
        const studentName = p.students?.name ?? 'Student'
        entries.push({
          id: `pay-${p.id}`,
          action: 'payment_verified',
          description: `${studentName} paid LKR ${p.amount_lkr.toLocaleString()}`,
          createdAt: p.paid_at,
        })
      }

      type RawSession = { id: string; status: string; scheduled_at: string; students: { name: string; subject: string } | null; batches: { name: string; subject: string } | null }
      for (const s of ((sessionsRes.data ?? []) as unknown as RawSession[])) {
        const name = s.students?.name ?? s.batches?.name ?? 'Session'
        const subject = s.students?.subject ?? s.batches?.subject ?? ''
        const subjectPart = subject ? ` · ${subject}` : ''
        entries.push({
          id: `ses-${s.id}`,
          action: s.status === 'completed' ? 'student_joined' : 'no_show_detected',
          description: s.status === 'completed'
            ? `${name} attended class${subjectPart}`
            : `${name} missed session${subjectPart}`,
          createdAt: s.scheduled_at,
        })
      }

      type RawStudent = { id: string; name: string; subject: string; created_at: string }
      for (const st of ((studentsRes.data ?? []) as unknown as RawStudent[])) {
        entries.push({
          id: `stu-${st.id}`,
          action: 'student_joined',
          description: `${st.name} joined${st.subject ? ` · ${st.subject}` : ''}`,
          createdAt: st.created_at,
        })
      }

      // Sort all entries by date descending, take the 8 most recent
      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setRecentActivity(entries.slice(0, 8))
    } catch { /* graceful fallback */ }
  }, [])

  const fetchRecentChats = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    try {
      const { data: raw } = await supabase
        .from('conversations')
        .select('id, student_whatsapp, status, context, last_message_at')
        .eq('tutor_id', userId)
        .order('last_message_at', { ascending: false })
        .limit(5)

      type RawChat = {
        id: string
        student_whatsapp: string
        status: string
        context: Record<string, unknown> | null
        last_message_at: string | null
      }

      const mapped: ChatItem[] = ((raw ?? []) as RawChat[]).map(c => {
        const ctx = c.context ?? {}
        const studentName = (ctx.student_name as string | undefined) ?? c.student_whatsapp
        const lastMsg = (ctx.last_message as string | undefined) ?? 'No messages yet'
        return {
          id: c.id,
          name: studentName,
          lastMessage: lastMsg,
          time: c.last_message_at ? getTimeAgo(new Date(c.last_message_at)) : '',
          status: c.status === 'human' ? 'needs_help' : c.status === 'resolved' ? 'resolved' : 'bot',
          unread: c.status === 'human',
        }
      })

      setRecentChats(mapped)
    } catch { /* graceful fallback */ }
  }, [])

  const fetchWaitlist = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    try {
      const { count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', userId)
        .eq('status', 'waiting')
      setWaitlistCount(count ?? 0)
    } catch { /* graceful */ }
  }, [])

  const fetchTrialCount = useCallback(async (userId: string, supabase: ReturnType<typeof createClient>) => {
    try {
      const { count: trialC } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', userId)
        .eq('trial_status', 'completed')
      if (trialC) setTrialCount(trialC)
    } catch { /* graceful */ }
  }, [])

  // ── Main effect ────────────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        // No session — stop all loading states so the page renders with empty states
        setStatsLoading(false)
        setActionsLoading(false)
        setSessionsLoading(false)
        setUpcomingLoading(false)
        setAtRiskLoading(false)
        setMissedLoading(false)
        return
      }
      setTutorId(user.id)

      fetchTutor(user.id, supabase)
      fetchBatches(user.id, supabase)
      fetchTodaySessions(user.id, supabase).then(n => fetchStats(user.id, supabase, n))
      fetchOnboardingCounts(user.id, supabase)
      fetchActionCounts(user.id, supabase)
      fetchUpcoming(user.id, supabase)
      fetchAtRisk(user.id, supabase)
      fetchMissedSessions(user.id, supabase)
      fetchRecentActivity(user.id, supabase)
      fetchRecentChats(user.id, supabase)
      fetchWaitlist(user.id, supabase)
      fetchTrialCount(user.id, supabase)
    })
  }, [fetchTutor, fetchBatches, fetchTodaySessions, fetchStats, fetchOnboardingCounts, fetchActionCounts, fetchUpcoming, fetchAtRisk, fetchMissedSessions, fetchRecentActivity, fetchRecentChats, fetchWaitlist, fetchTrialCount])

  // Re-fetch payment-sensitive data whenever the user navigates back to this tab
  useEffect(() => {
    if (!tutorId) return
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      const supabase = createClient()
      fetchStats(tutorId!, supabase, sessions.length).catch(() => {})
      fetchActionCounts(tutorId!, supabase).catch(() => {})
      fetchAtRisk(tutorId!, supabase).catch(() => {})
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [tutorId, sessions.length, fetchStats, fetchActionCounts, fetchAtRisk])

  // ── Realtime callbacks ─────────────────────────────────────────────────────

  const handlePaymentsChange = useCallback(() => {
    if (!tutorId) return
    const supabase = createClient()
    fetchActionCounts(tutorId, supabase).catch(() => {})
    fetchStats(tutorId, supabase, sessions.length).catch(() => {})
    fetchAtRisk(tutorId, supabase).catch(() => {})
    fetchRecentActivity(tutorId, supabase).catch(() => {})
  }, [tutorId, sessions.length, fetchActionCounts, fetchStats, fetchAtRisk, fetchRecentActivity])

  const handleConversationsChange = useCallback(() => {
    if (!tutorId) return
    const supabase = createClient()
    fetchActionCounts(tutorId, supabase).catch(() => {})
    fetchRecentChats(tutorId, supabase).catch(() => {})
  }, [tutorId, fetchActionCounts, fetchRecentChats])

  const handleStudentsChange = useCallback(() => {
    if (!tutorId) return
    const supabase = createClient()
    fetchRecentActivity(tutorId, supabase).catch(() => {})
    fetchStats(tutorId, supabase, sessions.length).catch(() => {})
    fetchActionCounts(tutorId, supabase).catch(() => {})
  }, [tutorId, sessions.length, fetchRecentActivity, fetchStats, fetchActionCounts])

  const handleSessionsChange = useCallback(() => {
    if (!tutorId) return
    const supabase = createClient()
    fetchRecentActivity(tutorId, supabase).catch(() => {})
    fetchTodaySessions(tutorId, supabase).then(n => fetchStats(tutorId, supabase, n)).catch(() => {})
    fetchMissedSessions(tutorId, supabase).catch(() => {})
  }, [tutorId, fetchRecentActivity, fetchTodaySessions, fetchStats, fetchMissedSessions])

  // ── Derived ────────────────────────────────────────────────────────────────

  const completedCount  = sessions.filter(s => s.status === 'completed').length
  const upcomingCount   = sessions.filter(s => s.status === 'upcoming').length

  const showWizard = onboardingComplete === false
    && !onboardingLoading
    && onboardingCounts.students === 0
    && onboardingCounts.batches === 0

  const allActionsZero  = !actionsLoading
    && actions.pendingPayments === 0
    && actions.chatsNeedingHelp === 0
    && actions.overdueStudents === 0
    && actions.newEnquiriesToday === 0
    && actions.waitlistCount === 0
    && actions.staleOffersCount === 0
    && waitlistCount === 0
    && trialCount === 0
  const monthLabel = new Date().toLocaleDateString('en-LK', { month: 'long', year: 'numeric' })
  const isNewTutor    = !statsLoading && (stats?.activeStudents ?? 0) === 0
  // Batches are intentionally excluded here — they're not a required manual
  // step (CSV-imported group students auto-create one), so requiring it
  // would keep this card stuck open forever for individual-only tutors.
  const onboardingStepsDone = {
    students: onboardingCounts.students > 0,
    sessions: onboardingCounts.sessions > 0,
    payments: onboardingCounts.payments > 0,
  }
  const showGettingStarted = !onboardingLoading && !onboardingStepsDone.students

  // ── Wizard render (brand-new tutors with no students or batches) ───────────

  // Still waiting for tutor data — show blank to avoid flashing the full dashboard
  if (onboardingComplete === null) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-[3px] border-[#3b5bdb] border-t-transparent animate-spin" />
          <p className="text-[#adb5bd] text-xs font-medium">Loading your dashboard…</p>
        </div>
      </div>
    )
  }

  if (showWizard && tutorObj) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
        <GettingStartedWizard
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tutor={tutorObj as any}
          onComplete={() => {
            setOnboardingComplete(true)
            if (tutorId) {
              const supabase = createClient()
              fetchOnboardingCounts(tutorId, supabase)
            }
          }}
          onCSVUpload={() => setShowCSV(true)}
          onAddStudent={() => setShowAddStudent(true)}
        />
        {/* Modals still mount so they work when triggered from wizard */}
        <AddStudentModal
          open={showAddStudent}
          onClose={() => setShowAddStudent(false)}
          onStudentAdded={() => {
            setShowAddStudent(false)
            if (tutorId) {
              const supabase = createClient()
              fetchOnboardingCounts(tutorId, supabase)
            }
          }}
          tutorSubjects={tutorSubjects}
          tutorBatches={tutorBatches}
          tutorMonthlyDueDate={tutorMonthlyDueDate}
        />
        <CSVUpload
          open={showCSV}
          onClose={() => setShowCSV(false)}
          onImportComplete={() => {
            setShowCSV(false)
            if (tutorId) {
              const supabase = createClient()
              fetchOnboardingCounts(tutorId, supabase)
            }
          }}
          tutorSubjects={[]}
        />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Realtime subscriber */}
      {tutorId && (
        <RealtimeUpdater
          tutorId={tutorId}
          onPaymentsChange={handlePaymentsChange}
          onConversationsChange={handleConversationsChange}
          onStudentsChange={handleStudentsChange}
          onSessionsChange={handleSessionsChange}
        />
      )}

      {/* ── Always-mounted modals ────────────────────────────────────────── */}
      <AddStudentModal
        open={showAddStudent}
        onClose={() => setShowAddStudent(false)}
        onStudentAdded={() => {
          if (tutorId) {
            const supabase = createClient()
            fetchStats(tutorId, supabase, sessions.length)
            fetchOnboardingCounts(tutorId, supabase)
          }
        }}
        tutorSubjects={tutorSubjects}
        tutorBatches={tutorBatches}
        tutorMonthlyDueDate={tutorMonthlyDueDate}
      />
      <CSVUpload
        open={showCSV}
        onClose={() => setShowCSV(false)}
        onImportComplete={(_count) => {
          setShowCSV(false)
          if (tutorId) {
            const supabase = createClient()
            fetchStats(tutorId, supabase, sessions.length)
            fetchOnboardingCounts(tutorId, supabase)
          }
        }}
        tutorSubjects={[]}
      />
      <InviteMessage
        open={showInvite}
        onClose={() => setShowInvite(false)}
        tutorName={tutorName}
        tutorWhatsapp={tutorWhatsapp}
        onDone={() => setShowInvite(false)}
      />
      {dashboardAttendanceSession && (
        <BatchAttendancePanel
          session={dashboardAttendanceSession}
          tutorId={tutorId ?? ''}
          paymentMap={new Map()}
          onClose={() => setDashboardAttendanceSession(null)}
          onSave={() => {
            setDashboardAttendanceSession(null)
            handleSessionsChange()
          }}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] leading-tight">
            {tutorName ? getGreeting(tutorName) : 'Welcome to Smartclaz'}
          </h1>
          <p className="text-[#6c757d] text-[0.84rem] mt-1 italic border-l-[3px] border-[#748ffc] pl-3 leading-relaxed">Everything you need to manage and grow your classes, in one place.</p>
          <p className="text-[#adb5bd] text-xs mt-1">{getTodayLabel()}</p>
        </div>
        {!isNewTutor && (
          <div className="flex-shrink-0 flex items-center gap-1.5 text-[0.7rem] font-semibold text-[#6c757d] bg-white border border-[#dee2e6] rounded-[10px] px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <Calendar size={13} className="text-[#3b5bdb]" />
            <span className="hidden sm:inline">
              {sessionsLoading ? '— sessions' : `${completedCount}/${sessions.length} sessions done`}
            </span>
            <span className="sm:hidden">
              {sessionsLoading ? '—' : `${completedCount}/${sessions.length}`}
            </span>
          </div>
        )}
      </div>

      {/* ── Getting started checklist ────────────────────────────────────── */}
      {showGettingStarted && (
        <GettingStartedChecklist
          studentsDone={onboardingStepsDone.students}
          onAddStudents={() => setShowAddStudent(true)}
          onCSVUpload={() => setShowCSV(true)}
          onInviteMessage={() => setShowInvite(true)}
          tutorName={tutorName}
          tutorWhatsapp={tutorWhatsapp}
        />
      )}

      {/* ── Main dashboard (hidden until first student) ──────────────────── */}
      {!isNewTutor && (
        <>
          {/* 1. Dark blue action center — always visible, all five items always shown */}
          <div className="bg-[#0e1f3b] rounded-[18px] p-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">

            {/* Needs attention (chats) */}
            <div className={`bg-white/[0.05] border border-white/[0.08] border-l-[3px] ${actions.chatsNeedingHelp > 0 ? 'border-l-[#c92a2a]' : 'border-l-white/10'} rounded-[12px] px-4 py-3.5 transition-all duration-200 hover:-translate-y-[4px] hover:bg-white/[0.09] hover:border-white/[0.18] cursor-pointer`}>
              <div className="flex items-center gap-1.5 mb-2">
                <Bot size={13} className={actions.chatsNeedingHelp > 0 ? 'text-[#ffc9c9]' : 'text-white/30'} />
                <p className="text-[0.65rem] font-semibold text-white/40 uppercase tracking-[0.08em]">Needs attention</p>
              </div>
              {actionsLoading ? (
                <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-2" />
              ) : (
                <p className={`text-[1.5rem] font-extrabold tracking-[-0.04em] leading-none mb-2 ${actions.chatsNeedingHelp > 0 ? 'text-white' : 'text-white/25'}`}>
                  {actions.chatsNeedingHelp}
                  <span className="text-[0.75rem] font-medium text-white/50 ml-1.5 tracking-normal">
                    chat{actions.chatsNeedingHelp !== 1 ? 's' : ''}
                  </span>
                </p>
              )}
              <Link href="/chats" className="flex items-center gap-1 text-[0.72rem] font-semibold text-[#ffc9c9]/70 hover:text-white transition-colors">
                View chats <ChevronRight size={11} />
              </Link>
            </div>

            {/* New enquiries */}
            <div className={`bg-white/[0.05] border border-white/[0.08] border-l-[3px] ${actions.newEnquiriesToday > 0 ? 'border-l-[#748ffc]' : 'border-l-white/10'} rounded-[12px] px-4 py-3.5 transition-all duration-200 hover:-translate-y-[4px] hover:bg-white/[0.09] hover:border-white/[0.18] cursor-pointer`}>
              <div className="flex items-center gap-1.5 mb-2">
                <MessageCircle size={13} className={actions.newEnquiriesToday > 0 ? 'text-[#748ffc]' : 'text-white/30'} />
                <p className="text-[0.65rem] font-semibold text-white/40 uppercase tracking-[0.08em]">New enquiries</p>
              </div>
              {actionsLoading ? (
                <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-2" />
              ) : (
                <p className={`text-[1.5rem] font-extrabold tracking-[-0.04em] leading-none mb-2 ${actions.newEnquiriesToday > 0 ? 'text-white' : 'text-white/25'}`}>
                  {actions.newEnquiriesToday}
                  <span className="text-[0.75rem] font-medium text-white/50 ml-1.5 tracking-normal">
                    today
                  </span>
                </p>
              )}
              <Link href="/chats" className="flex items-center gap-1 text-[0.72rem] font-semibold text-[#748ffc]/70 hover:text-white transition-colors">
                View chats <ChevronRight size={11} />
              </Link>
            </div>

            {/* Awaiting payment verification */}
            <div className={`bg-white/[0.05] border border-white/[0.08] border-l-[3px] ${actions.pendingPayments > 0 ? 'border-l-[#e67700]' : 'border-l-white/10'} rounded-[12px] px-4 py-3.5 transition-all duration-200 hover:-translate-y-[4px] hover:bg-white/[0.09] hover:border-white/[0.18] cursor-pointer`}>
              <div className="flex items-center gap-1.5 mb-2">
                <CreditCard size={13} className={actions.pendingPayments > 0 ? 'text-[#ffec99]' : 'text-white/30'} />
                <p className="text-[0.65rem] font-semibold text-white/40 uppercase tracking-[0.08em]">Awaiting verify</p>
              </div>
              {actionsLoading ? (
                <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-2" />
              ) : (
                <p className={`text-[1.5rem] font-extrabold tracking-[-0.04em] leading-none mb-2 ${actions.pendingPayments > 0 ? 'text-white' : 'text-white/25'}`}>
                  {actions.pendingPayments}
                  <span className="text-[0.75rem] font-medium text-white/50 ml-1.5 tracking-normal">
                    payment{actions.pendingPayments !== 1 ? 's' : ''}
                  </span>
                </p>
              )}
              <Link href="/payments" className="flex items-center gap-1 text-[0.72rem] font-semibold text-[#ffec99]/70 hover:text-white transition-colors">
                View all <ChevronRight size={11} />
              </Link>
            </div>

            {/* Waitlist */}
            <div className={`bg-white/[0.05] border border-white/[0.08] border-l-[3px] ${(actions.waitlistCount || waitlistCount) > 0 ? 'border-l-[#748ffc]' : 'border-l-white/10'} rounded-[12px] px-4 py-3.5 transition-all duration-200 hover:-translate-y-[4px] hover:bg-white/[0.09] hover:border-white/[0.18] cursor-pointer`}>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock size={13} className={(actions.waitlistCount || waitlistCount) > 0 ? 'text-[#748ffc]' : 'text-white/30'} />
                <p className="text-[0.65rem] font-semibold text-white/40 uppercase tracking-[0.08em]">On waitlist</p>
              </div>
              {actionsLoading ? (
                <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-2" />
              ) : (
                <p className={`text-[1.5rem] font-extrabold tracking-[-0.04em] leading-none mb-2 ${(actions.waitlistCount || waitlistCount) > 0 ? 'text-white' : 'text-white/25'}`}>
                  {actions.waitlistCount || waitlistCount}
                  <span className="text-[0.75rem] font-medium text-white/50 ml-1.5 tracking-normal">
                    student{(actions.waitlistCount || waitlistCount) !== 1 ? 's' : ''}
                  </span>
                </p>
              )}
              <Link href="/waitlist" className="flex items-center gap-1 text-[0.72rem] font-semibold text-[#748ffc]/70 hover:text-white transition-colors">
                View waitlist <ChevronRight size={11} />
              </Link>
            </div>

            {/* Stale offers / no response */}
            <div className={`bg-white/[0.05] border border-white/[0.08] border-l-[3px] ${actions.staleOffersCount > 0 ? 'border-l-[#e67700]' : 'border-l-white/10'} rounded-[12px] px-4 py-3.5 transition-all duration-200 hover:-translate-y-[4px] hover:bg-white/[0.09] hover:border-white/[0.18] cursor-pointer`}>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle size={13} className={actions.staleOffersCount > 0 ? 'text-[#ffec99]' : 'text-white/30'} />
                <p className="text-[0.65rem] font-semibold text-white/40 uppercase tracking-[0.08em]">No response</p>
              </div>
              {actionsLoading ? (
                <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-2" />
              ) : (
                <p className={`text-[1.5rem] font-extrabold tracking-[-0.04em] leading-none mb-2 ${actions.staleOffersCount > 0 ? 'text-white' : 'text-white/25'}`}>
                  {actions.staleOffersCount}
                  <span className="text-[0.75rem] font-medium text-white/50 ml-1.5 tracking-normal">
                    offer{actions.staleOffersCount !== 1 ? 's' : ''} (3d+)
                  </span>
                </p>
              )}
              <Link href="/waitlist?tab=offered" className="flex items-center gap-1 text-[0.72rem] font-semibold text-[#ffec99]/70 hover:text-white transition-colors">
                View offers <ChevronRight size={11} />
              </Link>
            </div>

          </div>

          {/* Trial students awaiting decision — shown as a separate callout when > 0 */}
          {trialCount > 0 && (
            <Link href="/students?tab=trial" className="flex items-center justify-between p-3 rounded-[14px] bg-[#f3f0ff] border border-[#e5dbff] hover:border-[#7048e8] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-[#e5dbff] flex items-center justify-center flex-shrink-0">
                  <Users size={14} className="text-[#7048e8]" />
                </div>
                <div>
                  <p className="text-[0.8rem] font-bold text-[#1a1a2e]">
                    {trialCount} trial student{trialCount !== 1 ? 's' : ''} awaiting decision
                  </p>
                  <p className="text-[0.72rem] text-[#6c757d]">Accept or decline each trial student</p>
                </div>
              </div>
              <ChevronRight size={15} className="text-[#adb5bd]" />
            </Link>
          )}

          {/* 2. Today's sessions */}
          <div className="bg-white rounded-[18px] border border-[#dee2e6] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f1f3f5] flex items-center justify-between">
              <h2 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em]">Today&apos;s Classes</h2>
              <Link href="/sessions" className="text-[0.75rem] font-semibold text-[#3b5bdb] hover:text-[#4c6ef5] transition-colors">
                View schedule
              </Link>
            </div>
            <div className="px-5">
              {sessionsLoading ? (
                Array.from({ length: 3 }).map((_, i) => <SessionSkeleton key={i} />)
              ) : sessions.length === 0 ? (
                <div className="py-6 px-1">
                  {(() => {
                    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
                    const todaySlot = tutorAvailability.find(s => s.day === todayName && s.enabled)
                    return todaySlot ? (
                      <div className="flex items-start gap-3 p-3 rounded-[12px] bg-[#edf2ff] border border-[#dbe4ff] mb-4">
                        <div className="w-8 h-8 rounded-[8px] bg-[#3b5bdb] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Calendar size={14} className="text-white" />
                        </div>
                        <div>
                          <p className="text-[#1a1a2e] text-[0.82rem] font-semibold">You&apos;re available today</p>
                          <p className="text-[#3b5bdb] text-[0.78rem] font-bold mt-0.5">
                            {fmtTime(todaySlot.start)} – {fmtTime(todaySlot.end)}
                            {sessionDuration && <span className="text-[#6c757d] font-normal ml-1.5">· {sessionDuration} sessions</span>}
                          </p>
                          <p className="text-[#6c757d] text-[0.7rem] mt-1">No sessions scheduled yet for this slot.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#f1f3f5] flex items-center justify-center flex-shrink-0">
                          <Calendar size={15} className="text-[#adb5bd]" />
                        </div>
                        <div>
                          <p className="text-[#6c757d] text-sm font-medium">No sessions today</p>
                          <p className="text-[#adb5bd] text-xs">{todayName} is not in your schedule</p>
                        </div>
                      </div>
                    )
                  })()}
                  <Link href="/sessions" className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] hover:bg-[#dbe4ff] px-3 py-1.5 rounded-[8px] transition-colors">
                    Schedule a session →
                  </Link>
                </div>
              ) : (
                sessions.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onStatusChange={handleSessionsChange}
                    onMarkBatchAttendance={(sess) => setDashboardAttendanceSession({
                      id: sess.id,
                      batch_id: sess.batch_id,
                      scheduled_at: sess.scheduledAt,
                      batch: { name: sess.displayName },
                      attendance: [],
                    })}
                  />
                ))
              )}
            </div>
          </div>

          {/* 3. Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={TrendingUp}
              label="This month income"
              value={<CountUp value={stats?.incomeThisMonth ?? 0} prefix="LKR " duration={1400} delay={0} />}
              sub={monthLabel}
              trend="up"
              valueClass="text-[#3b5bdb]"
              loading={statsLoading}
            />
            <StatCard
              icon={Users}
              label="Active students"
              value={stats?.activeStudents ?? 0}
              loading={statsLoading}
            />
            <StatCard
              icon={Calendar}
              label="Sessions today"
              value={sessions.length}
              sub={sessionsLoading ? undefined : `${completedCount} done · ${upcomingCount} left`}
              loading={sessionsLoading}
            />
            <StatCard
              icon={CreditCard}
              label="Outstanding fees"
              value={`LKR ${(stats?.pendingPaymentsTotal ?? 0).toLocaleString()}`}
              sub={statsLoading ? undefined : `${stats?.pendingPaymentsCount ?? 0} student${(stats?.pendingPaymentsCount ?? 0) !== 1 ? 's' : ''}`}
              valueClass="text-[#c92a2a]"
              loading={statsLoading}
            />
          </div>

          {/* 4. At Risk Students (left) + Recent Activity (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

            {/* At Risk Students */}
            <div className="bg-white rounded-[18px] border border-[#dee2e6] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">

              {/* Header */}
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-[0.95rem] font-extrabold text-[#1a1a2e] tracking-[-0.015em]">At-Risk Students</h2>
                  <AlertCircle size={15} className="text-[#e67700]" />
                </div>
                <Link href="/students?filter=at_risk" className="text-[0.72rem] font-semibold text-[#3b5bdb] hover:text-[#4c6ef5] transition-colors">
                  View all students →
                </Link>
              </div>

              {(atRiskLoading || missedLoading) ? (
                /* Skeleton */
                <div className="px-4 pb-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-[12px] bg-[#f8f9fa] animate-pulse">
                      <div className="w-9 h-9 rounded-full bg-[#e9ecef] flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-[#e9ecef] rounded w-2/3" />
                        <div className="h-2.5 bg-[#e9ecef] rounded w-1/3" />
                      </div>
                      <div className="w-16 h-7 bg-[#e9ecef] rounded-full" />
                    </div>
                  ))}
                </div>

              ) : atRisk.length === 0 && missedSessions.length === 0 ? (
                /* Empty state */
                <div className="py-10 text-center px-5">
                  <div className="w-10 h-10 rounded-full bg-[#ebfbee] flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={18} className="text-[#2f9e44]" />
                  </div>
                  <p className="text-[#2f9e44] text-sm font-semibold">All students on track</p>
                  <p className="text-[#adb5bd] text-[0.72rem] mt-1">No overdue payments or missed sessions</p>
                </div>

              ) : (
                <div className="px-4 pb-4 space-y-3">

                  {/* ── Overdue payments group ── */}
                  {atRisk.length > 0 && (
                    <div className="rounded-[14px] border border-[#f1f3f5] overflow-hidden">
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8f9fa] border-b border-[#f1f3f5]">
                        <div className="w-5 h-5 rounded-full bg-[#fff9db] border border-[#ffec99] flex items-center justify-center flex-shrink-0">
                          <AlertCircle size={11} className="text-[#e67700]" />
                        </div>
                        <span className="text-[0.72rem] font-bold text-[#343a40]">Overdue payments</span>
                        <span className="text-[0.68rem] text-[#adb5bd] font-medium">· {atRisk.length} student{atRisk.length !== 1 ? 's' : ''}</span>
                      </div>
                      {/* Rows */}
                      {atRisk.map((student, i) => (
                        <div key={`overdue-${i}`} className="flex items-center gap-3 px-4 py-3 border-b border-[#f8f9fa] last:border-0 hover:bg-[#fffbf5] transition-colors">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full bg-[#edf2ff] flex items-center justify-center flex-shrink-0 text-[#3b5bdb] text-[0.75rem] font-extrabold">
                            {student.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[0.82rem] font-semibold text-[#1a1a2e] truncate">
                              {student.studentName}
                              <span className="text-[#adb5bd] font-normal"> · {student.daysOverdue} days overdue</span>
                            </p>
                            <p className="text-[0.72rem] text-[#c92a2a] font-semibold mt-0.5">
                              LKR {student.amountLkr.toLocaleString()}
                              <span className="text-[#adb5bd] font-normal ml-1">· Due {new Date(student.dueDate).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}</span>
                            </p>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Link
                              href="/chats"
                              className="px-3 py-1.5 rounded-full text-[0.7rem] font-semibold border border-[#dee2e6] text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors bg-white"
                            >
                              Remind
                            </Link>
                            <Link
                              href={`/payments?student=${student.studentId}`}
                              className="px-3 py-1.5 rounded-full text-[0.7rem] font-semibold bg-[#3b5bdb] text-white hover:bg-[#2f49b8] transition-colors shadow-[0_2px_6px_rgba(59,91,219,0.3)]"
                            >
                              Verify
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Missed sessions group ── */}
                  {missedSessions.length > 0 && (
                    <div className="rounded-[14px] border border-[#f1f3f5] overflow-hidden">
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8f9fa] border-b border-[#f1f3f5]">
                        <div className="w-5 h-5 rounded-full bg-[#fff5f5] border border-[#ffc9c9] flex items-center justify-center flex-shrink-0">
                          <XCircle size={11} className="text-[#c92a2a]" />
                        </div>
                        <span className="text-[0.72rem] font-bold text-[#343a40]">Missed sessions</span>
                        <span className="text-[0.68rem] text-[#adb5bd] font-medium">· {missedSessions.length} student{missedSessions.length !== 1 ? 's' : ''}</span>
                      </div>
                      {/* Rows */}
                      {missedSessions.map(s => (
                        <div key={`missed-${s.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-[#f8f9fa] last:border-0 hover:bg-[#fff5f5]/50 transition-colors">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full bg-[#edf2ff] flex items-center justify-center flex-shrink-0 text-[#3b5bdb] text-[0.75rem] font-extrabold">
                            {s.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[0.82rem] font-semibold text-[#1a1a2e] truncate">
                              {s.studentName}
                              <span className="text-[#adb5bd] font-normal"> · missed session</span>
                            </p>
                            <p className="text-[0.72rem] text-[#6c757d] mt-0.5">
                              <span className="text-[#e67700] font-semibold">LKR 0</span>
                              <span className="text-[#adb5bd] ml-1">· {new Date(s.scheduledAt).toLocaleDateString('en-LK', { weekday: 'short', day: 'numeric', month: 'short' })}{s.subject ? ` · ${s.subject}` : ''}</span>
                            </p>
                          </div>
                          {/* Action */}
                          <Link
                            href="/chats"
                            className="px-3 py-1.5 rounded-full text-[0.7rem] font-semibold bg-[#3b5bdb] text-white hover:bg-[#2f49b8] transition-colors shadow-[0_2px_6px_rgba(59,91,219,0.3)] flex-shrink-0"
                          >
                            Send message
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-[18px] border border-[#dee2e6] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f1f3f5]">
                <h2 className="text-[0.84rem] font-bold text-[#1a1a2e] tracking-[-0.01em]">Recent Activity</h2>
                <p className="text-[#6c757d] text-[0.7rem] mt-0.5">Latest events across your classes</p>
              </div>
              {recentActivity.length === 0 ? (
                <div className="py-8 text-center px-5">
                  <div className="w-9 h-9 rounded-full bg-[#f1f3f5] flex items-center justify-center mx-auto mb-2">
                    <Activity size={16} className="text-[#adb5bd]" />
                  </div>
                  <p className="text-[#adb5bd] text-sm">No recent activity</p>
                  <p className="text-[#ced4da] text-[0.68rem] mt-0.5">Events appear here as students join, pay, and attend</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f1f3f5]">
                  {recentActivity.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f9fa] transition-colors">
                      <div className={`w-7 h-7 rounded-[8px] ${getActivityIconBg(entry.action)} flex items-center justify-center flex-shrink-0`}>
                        {getActivityIcon(entry.action)}
                      </div>
                      <p className="flex-1 text-[#343a40] text-[0.78rem] truncate">{entry.description}</p>
                      <span className="text-[#adb5bd] text-[0.65rem] flex-shrink-0 tabular-nums">
                        {getTimeAgo(new Date(entry.createdAt))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </>
      )}

    </div>
  )
}
