'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Plus, X,
  Users, UserMinus, ShieldAlert, CheckCircle2, Clock,
  ChevronRight, Pencil, Phone, MessageCircle,
  Upload, Loader2, Undo2,
} from 'lucide-react'
import AddStudentModal from '@/components/AddStudentModal'
import CSVUpload from '@/components/CSVUpload'
import InviteMessage from '@/components/InviteMessage'
import EditStudentPanel, { type EditableStudent } from '@/components/EditStudentPanel'
import { useTutor } from '@/lib/contexts/tutor'
import type { SubjectEntry } from '@/lib/types/subjects'

// ── Types ──────────────────────────────────────────────────────────────────

type StudentStatus    = 'active' | 'inactive' | 'blocked'
type FilterStatus     = 'all' | 'active' | 'inactive' | 'blocked'
type ClassType        = 'individual' | 'batch' | 'group' | 'trial'
type CurrentPayStatus = 'paid' | 'pending' | 'overdue' | 'na'

interface PendingPayment {
  id: string
  amount_lkr: number
  due_date: string | null
}

interface Student {
  id: string
  tutor_id: string
  name: string
  whatsapp: string
  parent_name?: string
  parent_whatsapp?: string
  subject: string
  grade: string
  class_type: ClassType
  batch_id?: string
  batch_name?: string | null
  monthly_fee: number
  fee_type: 'monthly' | 'per_session'
  status: StudentStatus
  phone_history?: Array<{ old_number: string; changed_at: string; reason?: string }>
  status_reason?: string
  deactivated_at?: string
  consent_given: boolean
  created_at: string
  current_payment_status: CurrentPayStatus
  pending_payment?: PendingPayment | null
  sessions_this_month: number
  sessions_attended: number
}

interface TutorBatch {
  id: string
  name: string
  subject: string
  grade?: string
  monthly_fee?: number
  schedule_day?: string
  schedule_time?: string
}

interface TutorProfile {
  name: string
  whatsapp_number: string
  monthly_due_date: number | null
}

// ── Badge helpers ─────────────────────────────────────────────────────────

const STATUS_CLS: Record<StudentStatus, string> = {
  active:   'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]',
  inactive: 'bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]',
  blocked:  'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]',
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${cls}`}>
      {children}
    </span>
  )
}

function StatusBadge({ status }: { status: StudentStatus }) {
  return (
    <Badge cls={STATUS_CLS[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

function TrialBadge() {
  return <Badge cls="bg-[#f3f0ff] text-[#7048e8] border-[#e5dbff]">Trial</Badge>
}

// ── Payment status cell ───────────────────────────────────────────────────

function PaymentCell({ status, pending, monthly_fee }: {
  status: CurrentPayStatus
  pending?: PendingPayment | null
  monthly_fee: number
}) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]">
        <CheckCircle2 size={11} />
        Paid
      </span>
    )
  }
  if (status === 'pending') {
    const dueStr = pending?.due_date
      ? new Date(pending.due_date).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })
      : null
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#fff9db] text-[#e67700] border-[#ffec99]">
          <Clock size={11} />
          Pending
        </span>
        {dueStr && <p className="text-[0.68rem] text-[#adb5bd] mt-0.5 pl-0.5">Due {dueStr}</p>}
      </div>
    )
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]">
        <ShieldAlert size={11} />
        Overdue
      </span>
    )
  }
  return <span className="text-[#ced4da] text-[0.78rem]">—</span>
}

// ── Class type cell ───────────────────────────────────────────────────────

function ClassCell({ classType, batchName }: { classType: ClassType; batchName?: string | null }) {
  if (classType === 'individual') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]">
        Individual
      </span>
    )
  }
  if (classType === 'batch' || classType === 'group') {
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]">
          Group
        </span>
        {batchName && <p className="text-[0.68rem] text-[#adb5bd] mt-0.5 pl-0.5 truncate max-w-[100px]">{batchName}</p>}
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#f3f0ff] text-[#7048e8] border-[#e5dbff]">
      Trial
    </span>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-9 h-9 bg-[#edf2ff] text-[#3b5bdb] rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, iconBg, iconColor, value, label, sub, onClick, active,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string
  value: React.ReactNode; label: string; sub: string
  onClick?: () => void; active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-[18px] p-4 transition-all duration-150 ${
        active
          ? 'border-[#3b5bdb] shadow-[0_0_0_2px_rgba(59,91,219,0.12),0_4px_12px_rgba(0,0,0,0.08)]'
          : 'border-[#dee2e6] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={17} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[1.5rem] font-extrabold text-[#1a1a2e] leading-none tracking-[-0.04em]">{value}</p>
          <p className="text-[0.72rem] font-semibold text-[#6c757d] mt-0.5">{label}</p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-1 leading-tight">{sub}</p>
        </div>
      </div>
    </button>
  )
}



// ── Expanded row ──────────────────────────────────────────────────────────

function ExpandedRow({ student }: { student: Student }) {
  const [attended, setAttended]         = useState(0)
  const [missed, setMissed]             = useState(0)
  const [lastPayment, setLastPayment]   = useState<{ amount: number; paid_at: string } | null>(null)
  const [nextSession, setNextSession]   = useState<{ date: string; zoom_link?: string } | null>(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const now = new Date().toISOString()
    Promise.all([
      supabase.from('sessions').select('scheduled_at, status, zoom_link').eq('student_id', student.id).order('scheduled_at'),
      supabase.from('payments').select('amount_lkr, paid_at').eq('student_id', student.id).eq('status', 'paid').order('paid_at', { ascending: false }).limit(1),
    ]).then(([sessRes, payRes]) => {
      const all = sessRes.data ?? []
      const future = all.filter(s => (s.scheduled_at as string) > now)
      if (future.length > 0) {
        setNextSession({
          date: new Date(future[0].scheduled_at as string).toLocaleDateString('en-LK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          zoom_link: future[0].zoom_link as string | undefined,
        })
      }
      const past = all.filter(s => (s.scheduled_at as string) <= now)
      setAttended(past.filter(s => s.status === 'completed').length)
      setMissed(past.filter(s => s.status === 'no_show').length)
      const lp = payRes.data?.[0]
      if (lp) setLastPayment({ amount: lp.amount_lkr as number, paid_at: new Date(lp.paid_at as string).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' }) })
      setLoading(false)
    })
  }, [student.id])

  return (
    <div className="px-4 py-4 bg-[#f8f9fa] border-t border-[#f1f3f5]">
      {loading ? (
        <div className="flex items-center gap-2 text-[#adb5bd] text-xs">
          <Loader2 size={13} className="animate-spin" /> Loading...
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 text-[0.78rem]">
          <div>
            <p className="text-[#adb5bd] text-[0.65rem] font-semibold uppercase tracking-wide mb-1">Next session</p>
            {nextSession ? (
              <div>
                <p className="text-[#1a1a2e] font-medium">{nextSession.date}</p>
                {nextSession.zoom_link && (
                  <a href={nextSession.zoom_link} target="_blank" rel="noopener noreferrer"
                    className="text-[#3b5bdb] text-[0.7rem] font-semibold hover:underline">🔗 Open Zoom</a>
                )}
              </div>
            ) : <p className="text-[#adb5bd]">None scheduled</p>}
          </div>
          <div>
            <p className="text-[#adb5bd] text-[0.65rem] font-semibold uppercase tracking-wide mb-1">Last payment</p>
            {lastPayment ? (
              <div>
                <p className="text-[#1a1a2e] font-medium">LKR {lastPayment.amount.toLocaleString()}</p>
                <p className="text-[#adb5bd] text-[0.7rem]">{lastPayment.paid_at}</p>
              </div>
            ) : <p className="text-[#adb5bd]">No payments yet</p>}
          </div>
          <div>
            <p className="text-[#adb5bd] text-[0.65rem] font-semibold uppercase tracking-wide mb-1">Sessions</p>
            <p className="text-[#1a1a2e] font-medium">{attended} attended · {missed} missed</p>
            <p className="text-[#adb5bd] text-[0.7rem]">Since {new Date(student.created_at).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-[#f1f3f5]">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-[#f1f3f5] rounded-full animate-pulse" style={{ width: `${60 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function StudentsPage() {
  const { subjects: tutorSubjects } = useTutor()

  const [students, setStudents]           = useState<Student[]>([])
  const [loading, setLoading]             = useState(true)
  const [tutorProfile, setTutorProfile]   = useState<TutorProfile | null>(null)
  const [tutorBatches, setTutorBatches]   = useState<TutorBatch[]>([])

  const searchParams = useSearchParams()

  const [searchQuery, setSearchQuery]     = useState('')
  const [statusFilter, setStatusFilter]   = useState<FilterStatus>('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [classFilter, setClassFilter]     = useState<'all' | ClassType>('all')
  const [paymentFilter, setPaymentFilter] = useState<'all' | CurrentPayStatus>('all')
  const [batchFilter, setBatchFilter]     = useState<string>('all')
  const [atRiskFilter, setAtRiskFilter]   = useState(false)

  useEffect(() => {
    const batchId   = searchParams.get('batch')
    const paymentQs = searchParams.get('payment') as CurrentPayStatus | null
    const filterQs  = searchParams.get('filter')
    if (batchId) setBatchFilter(batchId)
    if (paymentQs && ['paid', 'pending', 'overdue'].includes(paymentQs)) {
      setPaymentFilter(paymentQs)
    }
    if (filterQs === 'at_risk') setAtRiskFilter(true)
  }, [searchParams])

  const [expandedRow, setExpandedRow]  = useState<string | null>(null)
  const [editStudent, setEditStudent]  = useState<Student | null>(null)
  const [addOpen, setAddOpen]          = useState(false)
  const [csvOpen, setCsvOpen]          = useState(false)
  const [inviteOpen, setInviteOpen]    = useState(false)
  const [toast, setToast] = useState<{ msg: string; undoFn?: () => Promise<void> } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, undoFn?: () => Promise<void>) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, undoFn })
    toastTimer.current = setTimeout(() => setToast(null), undoFn ? 6000 : 3000)
  }, [])

  async function loadAll() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const currentMonth = new Date().toISOString().slice(0, 7)

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const endOfMonth   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString()

    const [studentsRes, paymentsRes, tutorRes, batchesRes, sessionsRes] = await Promise.all([
      supabase.from('students').select('*')
        .eq('tutor_id', user.id).order('created_at', { ascending: false }),

      supabase.from('payments').select('id, student_id, status, amount_lkr, month_year, due_date')
        .eq('tutor_id', user.id).eq('month_year', currentMonth),

      supabase.from('tutors').select('name, whatsapp_number, monthly_due_date').eq('id', user.id).single(),

      supabase.from('batches').select('id, name, subject, grade, monthly_fee, schedule_day, schedule_time').eq('tutor_id', user.id),

      supabase.from('sessions').select('student_id, status')
        .eq('tutor_id', user.id)
        .gte('scheduled_at', startOfMonth)
        .lte('scheduled_at', endOfMonth)
        .not('student_id', 'is', null),
    ])

    if (studentsRes.error) {
      console.error('Students query failed:', studentsRes.error.message)
      showToast('Failed to load students: ' + studentsRes.error.message)
      setLoading(false)
      return
    }

    // Build lookup maps from flat results
    type RawPayment = { id: string; student_id: string; status: string; amount_lkr: number; month_year: string | null; due_date: string | null }
    const payByStudent = new Map<string, RawPayment[]>()
    for (const p of ((paymentsRes.data ?? []) as RawPayment[])) {
      const arr = payByStudent.get(p.student_id) ?? []
      arr.push(p)
      payByStudent.set(p.student_id, arr)
    }

    const batchNameById = new Map<string, string>()
    const batchFeeById  = new Map<string, number>()
    for (const b of (batchesRes.data ?? [])) {
      batchNameById.set(b.id as string, b.name as string)
      if (b.monthly_fee) batchFeeById.set(b.id as string, b.monthly_fee as number)
    }

    type RawSession = { student_id: string | null; status: string }
    const sessionsByStudent = new Map<string, RawSession[]>()
    for (const sess of ((sessionsRes.data ?? []) as RawSession[])) {
      if (!sess.student_id) continue
      const arr = sessionsByStudent.get(sess.student_id) ?? []
      arr.push(sess)
      sessionsByStudent.set(sess.student_id, arr)
    }

    if (studentsRes.data) {
      const enriched: Student[] = studentsRes.data.map(s => {
        const sid    = s.id as string
        const currPay = payByStudent.get(sid) ?? []

        let current_payment_status: CurrentPayStatus = 'na'
        if (currPay.some(p => p.status === 'paid'))         current_payment_status = 'paid'
        else if (currPay.some(p => p.status === 'overdue')) current_payment_status = 'overdue'
        else if (currPay.some(p => p.status === 'pending')) current_payment_status = 'pending'

        const pendingEntry  = currPay.find(p => p.status === 'pending')
        const batchId       = s.batch_id as string | undefined
        const studentSess   = sessionsByStudent.get(sid) ?? []
        const sessTotal     = studentSess.filter(ss => ss.status !== 'cancelled').length
        const sessAttended  = studentSess.filter(ss => ss.status === 'completed').length

        return {
          id:              sid,
          tutor_id:        s.tutor_id as string,
          name:            s.name as string,
          whatsapp:        s.whatsapp as string,
          parent_name:     s.parent_name as string | undefined,
          parent_whatsapp: s.parent_whatsapp as string | undefined,
          subject:         s.subject as string,
          grade:           s.grade as string,
          class_type:      s.class_type as ClassType,
          batch_id:        batchId,
          batch_name:      batchId ? (batchNameById.get(batchId) ?? null) : null,
          monthly_fee:     s.monthly_fee as number,
          fee_type:        s.fee_type as 'monthly' | 'per_session',
          status:          s.status as StudentStatus,
          phone_history:   s.phone_history as Student['phone_history'],
          consent_given:   s.consent_given as boolean,
          created_at:      s.created_at as string,
          current_payment_status,
          sessions_this_month: sessTotal,
          sessions_attended:   sessAttended,
          pending_payment: pendingEntry
            ? { id: pendingEntry.id, amount_lkr: pendingEntry.amount_lkr, due_date: pendingEntry.due_date }
            : null,
        }
      })
      setStudents(enriched)
    }

    if (tutorRes.data) {
      setTutorProfile({
        name:             tutorRes.data.name as string,
        whatsapp_number:  tutorRes.data.whatsapp_number as string,
        monthly_due_date: tutorRes.data.monthly_due_date as number | null,
      })
    }

    if (batchesRes.data) {
      setTutorBatches(batchesRes.data.map(b => ({
        id: b.id as string,
        name: b.name as string,
        subject: b.subject as string,
        grade: b.grade as string | undefined,
        monthly_fee: b.monthly_fee as number | undefined,
        schedule_day: b.schedule_day as string | undefined,
        schedule_time: b.schedule_time as string | undefined,
      })))
    }

    setLoading(false)
  }

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Summary ──────────────────────────────────────────────────────────────

  const activeStudents   = students.filter(s => s.status === 'active')
  const inactiveStudents = students.filter(s => s.status === 'inactive')
  const blockedStudents  = students.filter(s => s.status === 'blocked')

  // ── Filtering ────────────────────────────────────────────────────────────

  const uniqueSubjects = Array.from(new Set(students.map(s => s.subject))).sort()

  const filtered = useMemo(() => {
    const qText   = searchQuery.toLowerCase()
    const qDigits = qText.replace(/\D/g, '')
    return students.filter(s => {
      if (searchQuery) {
        const ok = s.name.toLowerCase().includes(qText)
          || s.whatsapp.toLowerCase().includes(qText)
          || (qDigits.length > 0 && s.whatsapp.replace(/\D/g, '').includes(qDigits))
          || (s.batch_name?.toLowerCase().includes(qText) ?? false)
        if (!ok) return false
      }
      if (atRiskFilter) {
        const isOverdue = s.current_payment_status === 'overdue'
        const hasMissed = s.sessions_this_month > 0 && s.sessions_attended < s.sessions_this_month
        if (!isOverdue && !hasMissed) return false
      }
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (subjectFilter !== 'all' && s.subject !== subjectFilter) return false
      if (classFilter   !== 'all' && s.class_type !== classFilter)  return false
      if (paymentFilter !== 'all' && s.current_payment_status !== paymentFilter) return false
      if (batchFilter   !== 'all' && s.batch_id !== batchFilter) return false
      return true
    })
  }, [students, searchQuery, statusFilter, subjectFilter, classFilter, paymentFilter, batchFilter, atRiskFilter])

  const hasActiveFilters = !!(searchQuery || statusFilter !== 'all' || subjectFilter !== 'all' || classFilter !== 'all' || paymentFilter !== 'all' || batchFilter !== 'all' || atRiskFilter)

  function clearFilters() {
    setSearchQuery(''); setStatusFilter('all'); setSubjectFilter('all')
    setClassFilter('all'); setPaymentFilter('all'); setBatchFilter('all')
    setAtRiskFilter(false)
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleMarkPaid(student: Student) {
    const supabase = createClient()
    const currentMonth = new Date().toISOString().slice(0, 7)
    const prevStatus  = student.current_payment_status
    const prevPending = student.pending_payment

    if (prevPending?.id) {
      await supabase.from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', prevPending.id)
    }

    setStudents(prev => prev.map(s =>
      s.id === student.id ? { ...s, current_payment_status: 'paid' as CurrentPayStatus, pending_payment: null } : s
    ))

    showToast(`${student.name} marked as paid`, async () => {
      if (prevPending?.id) {
        await supabase.from('payments')
          .update({ status: prevStatus, paid_at: null })
          .eq('id', prevPending.id)
      }
      await loadAll()
    })

    await loadAll()
  }

  async function handleMarkUnpaid(student: Student) {
    const supabase = createClient()
    const currentMonth = new Date().toISOString().slice(0, 7)

    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('student_id', student.id)
      .eq('month_year', currentMonth)
      .single()

    if (existing?.id) {
      await supabase.from('payments')
        .update({ status: 'pending', paid_at: null })
        .eq('id', existing.id)
    }

    await loadAll()
    showToast(`${student.name} payment reverted to pending`)
  }

  function handleStudentSaved(updated: EditableStudent) {
    setStudents(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
    setEditStudent(null)
    showToast(`${updated.name} updated ✅`)
  }

  function handleStatusChange(id: string, status: 'active' | 'inactive' | 'blocked') {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    setEditStudent(null)
  }

  function rowAccent(s: Student) {
    if (s.class_type === 'trial')               return 'border-l-[3px] border-l-[#7048e8]'
    if (s.status === 'blocked')                 return 'border-l-[3px] border-l-[#c92a2a]'
    if (s.current_payment_status === 'overdue') return 'border-l-[3px] border-l-[#c92a2a]'
    if (s.current_payment_status === 'pending') return 'border-l-[3px] border-l-[#e67700]'
    return 'border-l-[3px] border-l-transparent'
  }


  return (
    <div className="min-h-screen">

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-[#1a1a2e] text-white text-sm font-semibold pl-5 pr-3 py-2.5 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
          <span>{toast.msg}</span>
          {toast.undoFn && (
            <button
              type="button"
              onClick={async () => {
                const fn = toast.undoFn!
                setToast(null)
                await fn()
              }}
              className="flex items-center gap-1 text-[0.72rem] font-bold text-[#748ffc] hover:text-white border border-[#748ffc]/40 hover:border-white/40 rounded-full px-3 py-1 transition-all"
            >
              <Undo2 size={11} /> Undo
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em]">Students</h1>
          <p className="text-[#6c757d] text-sm mt-0.5">{loading ? 'Loading...' : `${students.length} total`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCsvOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#6c757d] border border-[#dee2e6] bg-white hover:border-[#adb5bd] px-3 py-2 rounded-[10px] transition-all">
            <Upload size={13} /> Import CSV
          </button>
          <button type="button" onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#3b5bdb] hover:bg-[#4c6ef5] px-4 py-2 rounded-[10px] shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:-translate-y-px transition-all">
            <Plus size={15} /> Add student
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} iconBg="bg-[#ebfbee]" iconColor="text-[#2f9e44]"
          value={activeStudents.length} label="Active students"
          sub="Currently enrolled"
          onClick={() => setStatusFilter(f => f === 'active' ? 'all' : 'active')} active={statusFilter === 'active'} />
        <StatCard icon={UserMinus} iconBg="bg-[#f1f3f5]" iconColor="text-[#6c757d]"
          value={inactiveStudents.length} label="Inactive students"
          sub={inactiveStudents.length > 0 ? 'Not currently attending' : 'None inactive'}
          onClick={() => setStatusFilter(f => f === 'inactive' ? 'all' : 'inactive')} active={statusFilter === 'inactive'} />
        <StatCard icon={ShieldAlert} iconBg="bg-[#fff5f5]" iconColor="text-[#c92a2a]"
          value={blockedStudents.length} label="Blocked students"
          sub={blockedStudents.length > 0 ? 'Access paused' : 'No blocked students'}
          onClick={() => setStatusFilter(f => f === 'blocked' ? 'all' : 'blocked')} active={statusFilter === 'blocked'} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#dee2e6] rounded-[14px] p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb5bd]" />
          <input type="text" placeholder="Search by name or phone number..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-[9px] border-[1.5px] border-[#ced4da] rounded-[10px] text-[0.82rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)] transition-all" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#adb5bd] hover:text-[#6c757d]">
              <X size={14} />
            </button>
          )}
        </div>
        {/* Filter dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as FilterStatus)}
            className={`text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] outline-none cursor-pointer transition-colors ${
              statusFilter !== 'all' ? 'border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff]' : 'border-[#dee2e6] text-[#6c757d] bg-[#f8f9fa] hover:border-[#adb5bd]'
            }`}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </select>

          <select value={classFilter} onChange={e => setClassFilter(e.target.value as 'all' | ClassType)}
            className={`text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] outline-none cursor-pointer transition-colors ${
              classFilter !== 'all' ? 'border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff]' : 'border-[#dee2e6] text-[#6c757d] bg-[#f8f9fa] hover:border-[#adb5bd]'
            }`}>
            <option value="all">All class types</option>
            <option value="individual">Individual</option>
            <option value="group">Group</option>
            <option value="trial">Trial</option>
          </select>

          <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as 'all' | CurrentPayStatus)}
            className={`text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] outline-none cursor-pointer transition-colors ${
              paymentFilter !== 'all' ? 'border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff]' : 'border-[#dee2e6] text-[#6c757d] bg-[#f8f9fa] hover:border-[#adb5bd]'
            }`}>
            <option value="all">All payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>

          {tutorBatches.length > 0 && (
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
              className={`text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] outline-none cursor-pointer transition-colors ${
                batchFilter !== 'all' ? 'border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff]' : 'border-[#dee2e6] text-[#6c757d] bg-[#f8f9fa] hover:border-[#adb5bd]'
              }`}>
              <option value="all">All batches</option>
              {tutorBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          {atRiskFilter && (
            <button
              type="button"
              onClick={() => setAtRiskFilter(false)}
              className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] border-[#c92a2a] text-[#c92a2a] bg-[#fff5f5] hover:bg-[#ffc9c9] transition-colors"
            >
              <ShieldAlert size={11} />
              At Risk
              <X size={10} />
            </button>
          )}

          {uniqueSubjects.length > 1 && (
            <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
              className={`text-[0.72rem] font-semibold border rounded-full px-3 py-[5px] outline-none cursor-pointer transition-colors ${
                subjectFilter !== 'all' ? 'border-[#3b5bdb] text-[#3b5bdb] bg-[#edf2ff]' : 'border-[#dee2e6] text-[#6c757d] bg-[#f8f9fa] hover:border-[#adb5bd]'
              }`}>
              <option value="all">All subjects</option>
              {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="text-[0.72rem] font-semibold text-[#c92a2a] hover:underline">Clear all</button>
          )}
          {hasActiveFilters && (
            <span className="ml-auto text-[0.72rem] text-[#6c757d]">Showing {filtered.length} of {students.length}</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#dee2e6] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-[#f8f9fa] border-b border-[#eaecef]">
                {[
                  { label: 'Student',        w: '' },
                  { label: 'Subject / Grade', w: '' },
                  { label: 'Class',           w: 'w-[110px]' },
                  { label: 'Fee / month',     w: 'w-[100px]' },
                  { label: 'Payment',         w: 'w-[120px]' },
                  { label: 'Sessions',        w: 'w-[90px]' },
                  { label: 'Status',          w: 'w-[90px]' },
                  { label: '',                w: 'w-[90px]' },
                ].map(h => (
                  <th key={h.label} className={`px-4 py-2.5 text-left text-[0.62rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em] font-mono ${h.w}`}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {loading ? (
                [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#f1f3f5] flex items-center justify-center">
                        <Users size={18} className="text-[#adb5bd]" />
                      </div>
                      <p className="text-[#6c757d] text-[0.84rem] font-semibold">
                        {hasActiveFilters ? 'No students match your filters.' : 'No students yet.'}
                      </p>
                      {!hasActiveFilters
                        ? <button type="button" onClick={() => setAddOpen(true)} className="text-[#3b5bdb] text-[0.82rem] font-semibold hover:underline">Add your first student</button>
                        : <button type="button" onClick={clearFilters} className="text-[#3b5bdb] text-[0.82rem] font-semibold hover:underline">Clear filters</button>
                      }
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.flatMap(student => {
                  const isExpanded = expandedRow === student.id
                  return [
                    <tr
                      key={student.id}
                      onClick={() => setExpandedRow(isExpanded ? null : student.id)}
                      className={`hover:bg-[#f8f9ff] cursor-pointer transition-colors ${rowAccent(student)} ${isExpanded ? 'bg-[#f8f9ff]' : 'bg-white'}`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={student.name} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-[0.84rem] font-bold text-[#1a1a2e] leading-tight truncate">{student.name}</p>
                              <ChevronRight size={11} className={`text-[#ced4da] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>
                            <p className="text-[0.69rem] text-[#adb5bd] mt-0.5">{student.whatsapp}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-[0.82rem] font-semibold text-[#1a1a2e] leading-tight">{student.subject}</p>
                        <p className="text-[0.69rem] text-[#adb5bd] mt-0.5">{student.grade}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <ClassCell classType={student.class_type} batchName={student.batch_name} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-[0.82rem] font-bold text-[#3b5bdb]">
                          LKR {student.monthly_fee.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <PaymentCell status={student.current_payment_status} pending={student.pending_payment} monthly_fee={student.monthly_fee} />
                      </td>
                      <td className="px-4 py-3.5">
                        {student.sessions_this_month > 0 ? (
                          <div>
                            <p className="text-[0.82rem] font-bold text-[#1a1a2e]">
                              {student.sessions_attended}<span className="text-[#adb5bd] font-normal">/{student.sessions_this_month}</span>
                            </p>
                            <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">this month</p>
                          </div>
                        ) : (
                          <span className="text-[0.78rem] text-[#ced4da]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {student.class_type === 'trial' ? <TrialBadge /> : <StatusBadge status={student.status} />}
                      </td>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <a
                            href={`tel:${student.whatsapp}`}
                            className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[#adb5bd] hover:text-[#2f9e44] hover:bg-[#ebfbee] transition-all"
                            title="Call student"
                          >
                            <Phone size={13} />
                          </a>
                          <a
                            href={`/chats?student=${student.id}`}
                            className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[#adb5bd] hover:text-[#3b5bdb] hover:bg-[#edf2ff] transition-all"
                            title="WhatsApp chat"
                          >
                            <MessageCircle size={13} />
                          </a>
                          <button
                            type="button"
                            onClick={() => setEditStudent(student)}
                            className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[#adb5bd] hover:text-[#3b5bdb] hover:bg-[#edf2ff] transition-all"
                            title="Edit student"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>,
                    ...(isExpanded ? [
                      <tr key={`${student.id}-exp`}>
                        <td colSpan={7} className="p-0">
                          <ExpandedRow student={student} />
                        </td>
                      </tr>,
                    ] : []),
                  ]
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {addOpen && (
        <AddStudentModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onStudentAdded={() => { setAddOpen(false); loadAll() }}
          tutorSubjects={tutorSubjects as SubjectEntry[]}
          tutorBatches={tutorBatches}
          tutorMonthlyDueDate={tutorProfile?.monthly_due_date ?? null}
        />
      )}

      {csvOpen && (
        <CSVUpload
          open={csvOpen}
          onClose={() => setCsvOpen(false)}
          onImportComplete={() => { setCsvOpen(false); loadAll() }}
          tutorSubjects={tutorSubjects as SubjectEntry[]}
        />
      )}

      {inviteOpen && tutorProfile && (
        <InviteMessage
          tutorName={tutorProfile.name}
          tutorWhatsapp={tutorProfile.whatsapp_number}
          onDone={() => setInviteOpen(false)}
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {editStudent && (
        <EditStudentPanel
          student={editStudent as EditableStudent}
          isOpen={!!editStudent}
          onClose={() => setEditStudent(null)}
          onSave={handleStudentSaved}
          onStatusChange={handleStatusChange}
          tutorSubjects={tutorSubjects as SubjectEntry[]}
          onMarkPaid={() => handleMarkPaid(editStudent)}
          onMarkUnpaid={() => handleMarkUnpaid(editStudent)}
        />
      )}
    </div>
  )
}
