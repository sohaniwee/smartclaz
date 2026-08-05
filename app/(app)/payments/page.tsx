'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronLeft, ChevronRight, CheckCircle2, X, Send,
  AlertCircle,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import type { EnrichedPayment } from '@/components/PaymentCard'

// ── Lazy-loaded heavy components ──────────────────────────────────────────

const PaymentCard      = dynamic(() => import('@/components/PaymentCard'),        { ssr: false })
const PaymentRow       = dynamic(() => import('@/components/PaymentCard').then(m => ({ default: m.PaymentRow })), { ssr: false })
const PaymentHistoryPanel = dynamic(() => import('@/components/PaymentHistoryPanel'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────

type TabValue  = 'pending' | 'overdue' | 'paid' | 'trial' | 'all'
type PayMethod = 'bank' | 'ezCash' | 'cash'

interface TutorSettings {
  payment_instructions: string | null
  monthly_due_date: number | null
  grace_period_days: number | null
  whatsapp_number: string | null
  name: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-LK', { month: 'long', year: 'numeric' })
}

function computeOverdue(
  payment: Omit<EnrichedPayment, 'isOverdue' | 'daysPastDue'>,
  graceEnd: Date,
): Pick<EnrichedPayment, 'isOverdue' | 'daysPastDue'> {
  const now = new Date()
  const pastGrace = now > graceEnd
  const isPending = payment.status === 'pending'
  const isOverdue = isPending && pastGrace && !payment.is_trial_payment
  const daysPastDue = isOverdue
    ? Math.max(0, Math.floor((now.getTime() - graceEnd.getTime()) / 86400000))
    : 0
  return { isOverdue, daysPastDue }
}

// ── Mark Paid Modal ────────────────────────────────────────────────────────

function MarkPaidModal({
  payment,
  onClose,
  onConfirm,
  confirming,
}: {
  payment: EnrichedPayment
  onClose: () => void
  onConfirm: (method: PayMethod) => void
  confirming: boolean
}) {
  const [method, setMethod] = useState<PayMethod>('bank')
  const hasZoom = payment.class_type !== 'trial'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed z-50 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.16)] flex flex-col bottom-0 left-0 right-0 rounded-t-[20px] sm:bottom-auto sm:top-[15vh] sm:left-1/2 sm:-translate-x-1/2 sm:w-[460px] sm:rounded-[20px]">

        <div className="sm:hidden flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 bg-[#dee2e6] rounded-full" />
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-tight">
                Mark payment as received?
              </h2>
              <p className="text-[0.75rem] text-[#6c757d] mt-0.5">
                {formatMonthLabel(payment.month_year)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Student info */}
          <div className="bg-[#f8f9fa] rounded-[14px] p-4 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.9rem] font-bold text-[#1a1a2e]">{payment.student_name}</p>
                <p className="text-[0.72rem] text-[#6c757d]">
                  {payment.subject} · {payment.grade}
                  {payment.class_type === 'individual' ? ' · Individual' : payment.batch_name ? ` · ${payment.batch_name}` : ''}
                </p>
              </div>
              <p className="text-[1.2rem] font-extrabold text-[#1a1a2e] tracking-tight flex-shrink-0">
                LKR {payment.amount_lkr.toLocaleString()}
              </p>
            </div>
            {payment.payment_reference && (
              <div className="pt-1.5 border-t border-[#dee2e6]">
                <p className="text-[0.7rem] text-[#6c757d]">
                  Reference: <span className="font-mono font-semibold text-[#343a40]">{payment.payment_reference}</span>
                </p>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div>
            <p className="text-[0.75rem] font-semibold text-[#343a40] mb-2.5">How was payment received?</p>
            <div className="grid grid-cols-3 gap-2">
              {(['bank', 'ezCash', 'cash'] as PayMethod[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`py-2.5 rounded-[10px] text-sm font-semibold border transition-all ${
                    method === m
                      ? 'bg-[#3b5bdb] text-white border-[#3b5bdb] shadow-[0_2px_8px_rgba(59,91,219,0.25)]'
                      : 'bg-white text-[#343a40] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
                  }`}
                >
                  {m === 'bank' ? 'Bank' : m === 'ezCash' ? 'eZCash' : 'Cash'}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom note */}
          {hasZoom ? (
            <div className="flex items-start gap-2.5 bg-[#edf2ff] rounded-[10px] px-4 py-3">
              <CheckCircle2 size={14} className="text-[#3b5bdb] flex-shrink-0 mt-0.5" />
              <p className="text-[#3b5bdb] text-[0.75rem] font-medium leading-snug">
                Zoom link will be sent to {payment.student_name} automatically after confirming.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 bg-[#fff9db] rounded-[10px] px-4 py-3">
              <AlertCircle size={14} className="text-[#e67700] flex-shrink-0 mt-0.5" />
              <p className="text-[#e67700] text-[0.75rem] font-medium leading-snug">
                No Zoom link configured. Student will not receive a link. Set up Zoom in Settings first.
              </p>
            </div>
          )}

          <button
            onClick={() => onConfirm(method)}
            disabled={confirming}
            className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all hover:-translate-y-px shadow-[0_4px_14px_rgba(59,91,219,0.3)] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {confirming ? 'Confirming…' : 'Confirm & send Zoom'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Verify Trial Modal ─────────────────────────────────────────────────────

function VerifyTrialModal({
  payment,
  onClose,
  onConfirm,
  confirming,
}: {
  payment: EnrichedPayment
  onClose: () => void
  onConfirm: () => void
  confirming: boolean
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed z-50 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.16)] flex flex-col bottom-0 left-0 right-0 rounded-t-[20px] sm:bottom-auto sm:top-[20vh] sm:left-1/2 sm:-translate-x-1/2 sm:w-[440px] sm:rounded-[20px]">
        <div className="sm:hidden flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 bg-[#dee2e6] rounded-full" />
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-tight">Verify trial payment?</h2>
              <p className="text-[0.75rem] text-[#6c757d] mt-0.5">Trial class fee</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="bg-[#f3f0ff] rounded-[14px] p-4 space-y-1">
            <p className="text-[0.9rem] font-bold text-[#1a1a2e]">{payment.student_name}</p>
            <p className="text-[0.72rem] text-[#7048e8]">{payment.subject} · {payment.grade} · Trial</p>
            <p className="text-[1.1rem] font-extrabold text-[#7048e8] mt-1">LKR {payment.amount_lkr.toLocaleString()}</p>
            {payment.payment_reference && (
              <p className="text-[0.7rem] font-mono text-[#6c757d]">Ref: {payment.payment_reference}</p>
            )}
          </div>
          <div className="bg-[#f8f9fa] rounded-[10px] px-4 py-3">
            <p className="text-[0.78rem] text-[#6c757d] leading-relaxed">
              After verifying, this student will be added to your trial students list. You can then accept or decline from the Students tab.
            </p>
          </div>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="w-full bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all hover:-translate-y-px shadow-[0_4px_14px_rgba(59,91,219,0.3)] disabled:opacity-70"
          >
            {confirming ? 'Verifying…' : 'Verify trial'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Block Student Modal ────────────────────────────────────────────────────

function BlockStudentModal({
  payment,
  onClose,
  onConfirm,
  confirming,
}: {
  payment: EnrichedPayment
  onClose: () => void
  onConfirm: () => void
  confirming: boolean
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed z-50 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.16)] flex flex-col bottom-0 left-0 right-0 rounded-t-[20px] sm:bottom-auto sm:top-[25vh] sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] sm:rounded-[20px]">
        <div className="sm:hidden flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 bg-[#dee2e6] rounded-full" />
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <h2 className="text-[1rem] font-extrabold text-[#c92a2a] tracking-tight">
              Block {payment.student_name}?
            </h2>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="bg-[#fff5f5] rounded-[12px] px-4 py-3 space-y-1.5 border border-[#ffc9c9]">
            <p className="text-[0.82rem] text-[#c92a2a] font-semibold">What happens when blocked:</p>
            <ul className="text-[0.78rem] text-[#6c757d] space-y-1 pl-2">
              <li>· No Zoom links will be sent until payment is made</li>
              <li>· Bot will inform them access is paused</li>
              <li>· Student can still message you via WhatsApp</li>
            </ul>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="flex-1 bg-[#c92a2a] hover:brightness-95 text-white font-semibold text-sm py-2.5 rounded-[10px] transition-all disabled:opacity-70"
            >
              {confirming ? 'Blocking…' : 'Block student'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 border border-[#dee2e6] text-[#6c757d] font-semibold text-sm py-2.5 rounded-[10px] hover:border-[#adb5bd] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-[#dee2e6] overflow-hidden animate-pulse">
          <div className="h-9 bg-[#f8f9fa]" />
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#f1f3f5]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-[#f1f3f5] rounded-full w-2/3" />
                <div className="h-2.5 bg-[#f1f3f5] rounded-full w-1/2" />
              </div>
            </div>
            <div className="h-6 bg-[#f1f3f5] rounded-full w-1/3" />
            <div className="h-9 bg-[#f1f3f5] rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab counts badge ────────────────────────────────────────────────────────

function TabBadge({ count, active, color }: { count: number; active: boolean; color?: string }) {
  if (count === 0) return (
    <span className={`px-1.5 py-0.5 rounded-full text-[0.58rem] font-bold ${active ? 'bg-white/20 text-white' : 'bg-[#f1f3f5] text-[#adb5bd]'}`}>
      0
    </span>
  )
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[0.58rem] font-bold ${
      active ? 'bg-white/20 text-white' : color ?? 'bg-[#f1f3f5] text-[#6c757d]'
    }`}>
      {count}
    </span>
  )
}

// ── All-time bar chart ────────────────────────────────────────────────────

type BreakdownRow = {
  month: string
  label: string
  expected: number
  collected: number
  pending: number
  rate: number
}

function AlltimeChart({ data }: { data: BreakdownRow[] }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) }, [])

  const rows = [...data].reverse() // oldest → newest
  if (rows.length === 0) return null

  const SVG_W      = 700
  const SVG_H      = 240
  const PAD_LEFT   = 56
  const PAD_RIGHT  = 12
  const PAD_TOP    = 28
  const PAD_BOTTOM = 40
  const chartW     = SVG_W - PAD_LEFT - PAD_RIGHT
  const chartH     = SVG_H - PAD_TOP  - PAD_BOTTOM

  const maxVal    = Math.max(...rows.map(r => r.expected), 1)
  const groupW    = chartW / rows.length
  const barW      = Math.min(Math.max(groupW * 0.3, 7), 26)
  const barGap    = barW * 0.4

  const rawStep   = maxVal / 4
  const mag       = Math.pow(10, Math.floor(Math.log10(rawStep || 1)))
  const niceStep  = Math.ceil(rawStep / mag) * mag
  const ticks     = Array.from({ length: 5 }, (_, i) => i * niceStep).filter(v => v <= maxVal * 1.15)

  function fmtLKR(v: number) {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
    return String(v)
  }
  function barColor(rate: number) {
    return rate >= 70 ? '#2f9e44' : rate >= 50 ? '#e67700' : '#c92a2a'
  }

  const baseline = PAD_TOP + chartH

  return (
    <div className="px-3 pb-4 pt-2">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ overflow: 'visible' }}>

        {/* Grid + Y labels */}
        {ticks.map(v => {
          const y = baseline - (v / maxVal) * chartH
          return (
            <g key={v}>
              <line x1={PAD_LEFT} y1={y} x2={SVG_W - PAD_RIGHT} y2={y}
                stroke={v === 0 ? '#dee2e6' : '#f1f3f5'} strokeWidth={1} />
              <text x={PAD_LEFT - 7} y={y + 4} textAnchor="end"
                fontSize={10} fill="#adb5bd" fontFamily="Plus Jakarta Sans, sans-serif">
                {fmtLKR(v)}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {rows.map((row, i) => {
          const cx    = PAD_LEFT + i * groupW + groupW / 2
          const expX  = cx - barW - barGap / 2
          const colX  = cx + barGap / 2
          const expH  = Math.max((row.expected  / maxVal) * chartH, 2)
          const colH  = Math.max((row.collected / maxVal) * chartH, row.collected > 0 ? 2 : 0)
          const color = barColor(row.rate)
          const abbr  = new Date(row.month + '-01').toLocaleDateString('en-LK', { month: 'short' })
          const yr    = row.month.slice(2, 4)
          const delay = `${i * 0.04}s`
          const spring = `cubic-bezier(0.34, 1.28, 0.64, 1)`
          const barStyle = (h: number): React.CSSProperties => ({
            transformBox:    'fill-box',
            transformOrigin: 'bottom',
            transform:       `scaleY(${ready ? 1 : 0})`,
            transition:      `transform 0.55s ${spring} ${delay}`,
          })

          return (
            <g key={row.month}>
              {/* Expected bar */}
              <rect
                x={expX} y={baseline - expH} width={barW} height={expH}
                fill="#dbe4ff" rx={3}
                style={barStyle(expH)}
              />
              {/* Collected bar */}
              {row.collected > 0 && (
                <rect
                  x={colX} y={baseline - colH} width={barW} height={colH}
                  fill={color} rx={3}
                  style={barStyle(colH)}
                />
              )}
              {/* Rate label — fades in with bars */}
              {row.rate > 0 && (
                <text
                  x={colX + barW / 2} y={baseline - colH - 5}
                  textAnchor="middle" fontSize={9} fill={color}
                  fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="700"
                  style={{ opacity: ready ? 1 : 0, transition: `opacity 0.3s ease ${parseFloat(delay) + 0.4}s` }}
                >
                  {row.rate}%
                </text>
              )}
              {/* X labels */}
              <text x={cx} y={baseline + 14} textAnchor="middle"
                fontSize={10} fill="#6c757d" fontFamily="Plus Jakarta Sans, sans-serif">
                {abbr}
              </text>
              <text x={cx} y={baseline + 26} textAnchor="middle"
                fontSize={9} fill="#adb5bd" fontFamily="Plus Jakarta Sans, sans-serif">
                &apos;{yr}
              </text>
            </g>
          )
        })}

        {/* Baseline */}
        <line x1={PAD_LEFT} y1={baseline} x2={SVG_W - PAD_RIGHT} y2={baseline}
          stroke="#dee2e6" strokeWidth={1} />

        {/* Legend */}
        <g transform={`translate(${PAD_LEFT}, 8)`}>
          <rect x={0} y={0} width={9} height={9} fill="#dbe4ff" rx={2} />
          <text x={13} y={8} fontSize={10} fill="#6c757d" fontFamily="Plus Jakarta Sans, sans-serif">Expected</text>
          <rect x={72} y={0} width={9} height={9} fill="#3b5bdb" rx={2} />
          <text x={85} y={8} fontSize={10} fill="#6c757d" fontFamily="Plus Jakarta Sans, sans-serif">Collected</text>
        </g>
      </svg>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

export default function PaymentsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const studentIdParam = searchParams.get('student')

  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH)
  const [payments,      setPayments]      = useState<EnrichedPayment[]>([])
  const [tutor,         setTutor]         = useState<TutorSettings | null>(null)
  const [tutorId,       setTutorId]       = useState('')
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState<TabValue>('all')
  const [viewMode,      setViewMode]      = useState<'monthly' | 'alltime'>('monthly')
  const [toast,         setToast]         = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modal state
  const [markingPaid,    setMarkingPaid]    = useState<EnrichedPayment | null>(null)
  const [verifyingTrial, setVerifyingTrial] = useState<EnrichedPayment | null>(null)
  const [blockingStudent,setBlockingStudent]= useState<EnrichedPayment | null>(null)
  const [historyFor,     setHistoryFor]     = useState<EnrichedPayment | null>(null)

  // Action loading state
  const [confirmingId,      setConfirmingId]      = useState<string | null>(null)
  const [reminderSendingIds,setReminderSendingIds] = useState<Set<string>>(new Set())
  const [remindAllSending,  setRemindAllSending]  = useState(false)

  // Stable ref so Realtime handlers always call the latest reload function
  const reloadRef   = useRef<() => void>(() => {})
  // Track whether this is the very first load (show skeleton) vs a background refresh (no skeleton)
  const initialLoad = useRef(true)

  // ── Toast helper ────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Resolve tutorId once on mount ────────────────────────────────────────

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) setTutorId(user.id)
    })
  }, [])

  // ── Data loading — fetch ALL payments (no month filter) ─────────────────
  // Month selector filters client-side so records stored under any month_year
  // are always visible without needing to navigate months.

  const loadPayments = useCallback(async (uid: string, showSkeleton = false) => {
    if (showSkeleton) setLoading(true)
    const supabase = createClient()

    const [paymentsRes, tutorRes] = await Promise.all([
      supabase
        .from('payments')
        .select(`
          id, tutor_id, student_id, amount_lkr, status, paid_at,
          month_year, payment_reference, is_trial_payment,
          trial_deduction, full_fee, reminder_sent_at, reminder_count,
          students (
            id, name, whatsapp, subject, grade, class_type, status,
            batch_id
          )
        `)
        .eq('tutor_id', uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('tutors')
        .select('payment_instructions, monthly_due_date, grace_period_days, whatsapp_number, name')
        .eq('id', uid)
        .single(),
    ])

    const tutorData = tutorRes.data as TutorSettings | null
    setTutor(tutorData)

    type RawPayment = {
      id: string
      student_id: string
      amount_lkr: number
      status: string
      paid_at: string | null
      month_year: string
      payment_reference: string | null
      is_trial_payment: boolean | null
      trial_deduction: number | null
      full_fee: number | null
      reminder_sent_at: string | null
      reminder_count: number | null
      students: {
        id: string
        name: string
        whatsapp: string
        subject: string
        grade: string
        class_type: string
        status: string
        batch_id: string | null
      } | null
    }

    // Store raw enriched payments without overdue computation —
    // overdue is computed per-month in the useMemo below since each
    // month has its own grace-end date.
    const raw: EnrichedPayment[] = ((paymentsRes.data ?? []) as unknown as RawPayment[]).map(p => {
      const s = p.students
      return {
        id:                p.id,
        student_id:        p.student_id,
        student_name:      s?.name ?? 'Unknown',
        student_whatsapp:  s?.whatsapp ?? '',
        subject:           s?.subject ?? '',
        grade:             s?.grade ?? '',
        class_type:        (s?.class_type ?? 'individual') as 'individual' | 'batch' | 'trial',
        batch_name:        null, // batch name fetched separately if needed
        amount_lkr:        p.amount_lkr,
        full_fee:          p.full_fee ?? null,
        trial_deduction:   p.trial_deduction ?? null,
        month_year:        p.month_year,
        status:            p.status,
        paid_at:           p.paid_at ?? null,
        payment_reference: p.payment_reference ?? null,
        is_trial_payment:  p.is_trial_payment ?? false,
        reminder_sent_at:  p.reminder_sent_at ?? null,
        reminder_count:    p.reminder_count ?? 0,
        student_status:    s?.status ?? 'active',
        isOverdue:         false,
        daysPastDue:       0,
      }
    })

    setPayments(raw)
    setLoading(false)
  }, [])

  // Initial load + Realtime — both wait for tutorId to be set
  useEffect(() => {
    if (!tutorId) return

    // Seed the reload ref (background reload — no skeleton) and do the first load with skeleton
    reloadRef.current = () => loadPayments(tutorId, false)
    const isFirst = initialLoad.current
    initialLoad.current = false
    loadPayments(tutorId, isFirst)

    // Subscribe to live changes — use tutorId in channel name to avoid collision
    const supabase = createClient()
    const channel = supabase
      .channel(`payments_realtime_${tutorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `tutor_id=eq.${tutorId}` },
        (payload) => {
          reloadRef.current()
          if (
            payload.eventType === 'UPDATE' &&
            (payload.new as Record<string, unknown>).payment_reference &&
            !(payload.old as Record<string, unknown>).payment_reference
          ) {
            showToast('A student sent a payment reference!')
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students', filter: `tutor_id=eq.${tutorId}` },
        () => { reloadRef.current() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tutorId, loadPayments, showToast])

  // ── Month navigation ──────────────────────────────────────────────────────

  function navigateMonth(dir: 1 | -1) {
    setSelectedMonth(cur => {
      const d = new Date(cur + '-01')
      d.setMonth(d.getMonth() + dir)
      return d.toISOString().slice(0, 7)
    })
    setTab('all')
  }

  // The furthest month we allow navigating to: whichever is later —
  // today's month OR the latest month_year stored in any fetched payment.
  const latestMonth = useMemo(() => {
    const months = payments.map(p => p.month_year).filter(Boolean)
    return months.length > 0 ? months.sort().at(-1)! : CURRENT_MONTH
  }, [payments])

  const isCurrentMonth = selectedMonth === CURRENT_MONTH
  const isLatestMonth  = selectedMonth >= latestMonth

  // ── Month-filtered + overdue-enriched payments ────────────────────────────
  // Computed once per selectedMonth change; all three memos below derive from this.

  const monthPayments = useMemo(() => {
    // Filter to the selected month
    const filtered = payments.filter(p => p.month_year === selectedMonth)

    // Compute grace-end for this specific month
    const [y, m] = selectedMonth.split('-').map(Number)
    const dueDay         = tutor?.monthly_due_date  ?? null
    const gracedays      = tutor?.grace_period_days ?? null
    const effectiveDue   = dueDay    ?? 28
    const effectiveGrace = gracedays ?? 999
    const dueDate  = new Date(y, m - 1, effectiveDue)
    const graceEnd = new Date(dueDate)
    graceEnd.setDate(dueDate.getDate() + effectiveGrace)

    return filtered.map(p => ({ ...p, ...computeOverdue(p, graceEnd) }))
  }, [payments, selectedMonth, tutor])

  // ── Summary ───────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const expected    = monthPayments.reduce((s, p) => s + p.amount_lkr, 0)
    const collected   = monthPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount_lkr, 0)
    const pending     = monthPayments.filter(p => p.status === 'pending' && !p.isOverdue && !p.is_trial_payment).reduce((s, p) => s + p.amount_lkr, 0)
    const overdue     = monthPayments.filter(p => p.isOverdue).reduce((s, p) => s + p.amount_lkr, 0)
    const paidCount   = monthPayments.filter(p => p.status === 'paid').length
    const pendingCount= monthPayments.filter(p => p.status === 'pending' && !p.isOverdue).length
    const overdueCount= monthPayments.filter(p => p.isOverdue).length
    const rate        = expected > 0 ? Math.round((collected / expected) * 100) : 0
    return { expected, collected, pending, overdue, paidCount, pendingCount, overdueCount, rate }
  }, [monthPayments])

  const allTimeSummary = useMemo(() => {
    const totalCollected = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount_lkr, 0)
    const totalPending   = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount_lkr, 0)
    const totalExpected  = payments.reduce((s, p) => s + p.amount_lkr, 0)
    const monthsSet      = new Set(payments.map(p => p.month_year).filter(Boolean))
    const overallRate    = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0
    return { totalCollected, totalPending, totalExpected, monthCount: monthsSet.size, overallRate }
  }, [payments])

  const monthlyBreakdown = useMemo(() => {
    const map = new Map<string, { expected: number; collected: number; pending: number; count: number }>()
    for (const p of payments) {
      if (!p.month_year) continue
      const e = map.get(p.month_year) ?? { expected: 0, collected: 0, pending: 0, count: 0 }
      e.expected += p.amount_lkr
      e.count++
      if (p.status === 'paid') e.collected += p.amount_lkr
      else e.pending += p.amount_lkr
      map.set(p.month_year, e)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, d]) => ({
        month,
        label: formatMonthLabel(month),
        ...d,
        rate: d.expected > 0 ? Math.round((d.collected / d.expected) * 100) : 0,
      }))
  }, [payments])

  const counts = useMemo(() => ({
    pending: monthPayments.filter(p => p.status === 'pending' && !p.isOverdue && !p.is_trial_payment).length,
    overdue: monthPayments.filter(p => p.isOverdue).length,
    paid:    monthPayments.filter(p => p.status === 'paid').length,
    trial:   monthPayments.filter(p => p.is_trial_payment && p.status === 'pending').length,
    all:     monthPayments.length,
  }), [monthPayments])

  const tabPayments = useMemo(() => {
    switch (tab) {
      case 'pending':  return monthPayments.filter(p => p.status === 'pending' && !p.isOverdue && !p.is_trial_payment)
      case 'overdue':  return monthPayments.filter(p => p.isOverdue)
      case 'paid':     return monthPayments.filter(p => p.status === 'paid')
      case 'trial':    return monthPayments.filter(p => p.is_trial_payment && p.status === 'pending')
      default:         return monthPayments
    }
  }, [monthPayments, tab])

  const displayPayments = useMemo(() =>
    studentIdParam ? tabPayments.filter(p => p.student_id === studentIdParam) : tabPayments
  , [tabPayments, studentIdParam])

  // Auto-switch to All tab when arriving with a student filter
  useEffect(() => {
    if (studentIdParam) setTab('all')
  }, [studentIdParam])

  // ── Progress bar color ────────────────────────────────────────────────────

  const rateBarCls  = summary.rate >= 70 ? 'bg-[#2f9e44]' : summary.rate >= 50 ? 'bg-[#e67700]' : 'bg-[#c92a2a]'
  const rateTextCls = summary.rate >= 70 ? 'text-[#2f9e44]' : summary.rate >= 50 ? 'text-[#e67700]' : 'text-[#c92a2a]'

  // ── Optimistic helpers ────────────────────────────────────────────────────

  function optimisticMarkPaid(id: string) {
    setPayments(prev => prev.map(p =>
      p.id === id
        ? { ...p, status: 'paid', paid_at: new Date().toISOString(), isOverdue: false }
        : p
    ))
  }

  function optimisticBlockStudent(studentId: string) {
    setPayments(prev => prev.map(p =>
      p.student_id === studentId ? { ...p, student_status: 'blocked' } : p
    ))
  }

  function optimisticReminderSent(id: string) {
    setPayments(prev => prev.map(p =>
      p.id === id
        ? {
            ...p,
            reminder_sent_at: new Date().toISOString(),
            reminder_count: (p.reminder_count ?? 0) + 1,
          }
        : p
    ))
  }

  // ── Mark paid handler ─────────────────────────────────────────────────────

  async function handleMarkPaid(method: PayMethod) {
    if (!markingPaid) return
    const id = markingPaid.id
    setConfirmingId(id)
    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to verify payment')

      // Also update method on the DB (verify route doesn't store method)
      const supabase = createClient()
      await supabase.from('payments').update({ method }).eq('id', id)

      optimisticMarkPaid(id)
      setMarkingPaid(null)
      showToast(data.zoomLink ? 'Payment confirmed · Zoom link sent' : 'Payment confirmed')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to mark as paid')
    } finally {
      setConfirmingId(null)
    }
  }

  // ── Verify trial handler ──────────────────────────────────────────────────

  async function handleVerifyTrial() {
    if (!verifyingTrial) return
    const p = verifyingTrial
    setConfirmingId(p.id)
    try {
      const supabase = createClient()
      const [payRes, studentRes] = await Promise.all([
        supabase.from('payments').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          verified_by: 'tutor',
        }).eq('id', p.id),
        supabase.from('students').update({
          trial_status: 'completed',
          trial_fee_paid: p.amount_lkr,
        }).eq('id', p.student_id),
      ])
      if (payRes.error) throw new Error(payRes.error.message)
      if (studentRes.error) throw new Error(studentRes.error.message)

      optimisticMarkPaid(p.id)
      setVerifyingTrial(null)
      showToast('Trial verified · Check Students tab')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to verify trial')
    } finally {
      setConfirmingId(null)
    }
  }

  // ── Block student handler ─────────────────────────────────────────────────

  async function handleBlockStudent() {
    if (!blockingStudent) return
    const p = blockingStudent
    setConfirmingId(p.id)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('students').update({
        status: 'blocked',
        status_reason: 'Overdue payment',
      }).eq('id', p.student_id)
      if (error) throw new Error(error.message)

      optimisticBlockStudent(p.student_id)
      setBlockingStudent(null)
      showToast('Student blocked · Zoom links paused')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to block student')
    } finally {
      setConfirmingId(null)
    }
  }

  // ── Send reminder handler ─────────────────────────────────────────────────

  async function handleSendReminder(paymentId: string) {
    setReminderSendingIds(prev => new Set([...prev, paymentId]))
    try {
      const res = await fetch('/api/payments/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, tutorId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminder')
      optimisticReminderSent(paymentId)
      const p = payments.find(x => x.id === paymentId)
      showToast(`Reminder sent to ${p?.student_name ?? 'student'}`)
    } catch {
      showToast('Failed to send reminder')
    } finally {
      setReminderSendingIds(prev => {
        const next = new Set(prev)
        next.delete(paymentId)
        return next
      })
    }
  }

  // ── Remind all unpaid ────────────────────────────────────────────────────

  async function handleRemindAll() {
    const unpaid = monthPayments.filter(p => p.status === 'pending' || p.isOverdue)
    if (unpaid.length === 0) return
    setRemindAllSending(true)
    try {
      await Promise.all(unpaid.map(p =>
        fetch('/api/payments/send-reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: p.id, tutorId }),
        })
      ))
      unpaid.forEach(p => optimisticReminderSent(p.id))
      showToast(`Reminders sent to ${unpaid.length} student${unpaid.length !== 1 ? 's' : ''}`)
    } catch {
      showToast('Some reminders failed to send')
    } finally {
      setRemindAllSending(false)
    }
  }

  // ── Unpaid count for remind-all button ───────────────────────────────────

  const unpaidCount = counts.pending + counts.overdue

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-4 z-[100] bg-[#1a1a2e] text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.2)] pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em] leading-tight">
            Payments
          </h1>
          <p className="text-[#6c757d] text-sm mt-0.5">
            {viewMode === 'alltime'
              ? `${allTimeSummary.monthCount} month${allTimeSummary.monthCount !== 1 ? 's' : ''} · all time`
              : `${formatMonthLabel(selectedMonth)} · ${monthPayments.length} student${monthPayments.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {/* Monthly / All time toggle */}
          <div className="flex items-center bg-[#f1f3f5] rounded-[10px] p-0.5">
            <button
              onClick={() => setViewMode('monthly')}
              className={`text-[0.75rem] font-semibold px-3.5 py-1.5 rounded-[8px] transition-all ${
                viewMode === 'monthly' ? 'bg-white text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#6c757d] hover:text-[#343a40]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode('alltime')}
              className={`text-[0.75rem] font-semibold px-3.5 py-1.5 rounded-[8px] transition-all ${
                viewMode === 'alltime' ? 'bg-white text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#6c757d] hover:text-[#343a40]'
              }`}
            >
              All time
            </button>
          </div>

          {/* Month navigator — only in monthly view */}
          {viewMode === 'monthly' && (
            <div className="flex items-center gap-2 bg-white rounded-[12px] border border-[#dee2e6] px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <button
                onClick={() => navigateMonth(-1)}
                className="w-7 h-7 rounded-full border border-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <p className="text-[0.82rem] font-bold text-[#1a1a2e] min-w-[100px] text-center">
                {formatMonthLabel(selectedMonth)}
              </p>
              <button
                onClick={() => navigateMonth(1)}
                disabled={isLatestMonth}
                className="w-7 h-7 rounded-full border border-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Remind all — only in monthly view */}
          {viewMode === 'monthly' && unpaidCount > 0 && (
            <button
              onClick={handleRemindAll}
              disabled={remindAllSending}
              className="flex items-center gap-2 text-[0.82rem] font-semibold px-4 py-2.5 rounded-[10px] border border-[#dee2e6] bg-white text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-all disabled:opacity-60"
            >
              <Send size={13} />
              {remindAllSending ? 'Sending…' : `Remind all (${unpaidCount})`}
            </button>
          )}
        </div>
      </div>

      {/* ── All time view ───────────────────────────────────────────────────── */}
      {viewMode === 'alltime' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p className="text-[0.62rem] font-bold text-[#6c757d] uppercase tracking-[0.08em]">Total expected</p>
              <p className="text-[1.35rem] font-extrabold text-[#3b5bdb] tracking-tight mt-1">
                LKR {allTimeSummary.totalExpected.toLocaleString()}
              </p>
              <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">{allTimeSummary.monthCount} month{allTimeSummary.monthCount !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p className="text-[0.62rem] font-bold text-[#6c757d] uppercase tracking-[0.08em]">Total collected</p>
              <p className="text-[1.35rem] font-extrabold text-[#2f9e44] tracking-tight mt-1">
                LKR {allTimeSummary.totalCollected.toLocaleString()}
              </p>
              <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">{allTimeSummary.overallRate}% overall rate</p>
            </div>
            <div className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p className="text-[0.62rem] font-bold text-[#6c757d] uppercase tracking-[0.08em]">Outstanding</p>
              <p className={`text-[1.35rem] font-extrabold tracking-tight mt-1 ${allTimeSummary.totalPending > 0 ? 'text-[#e67700]' : 'text-[#adb5bd]'}`}>
                LKR {allTimeSummary.totalPending.toLocaleString()}
              </p>
              <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">across all months</p>
            </div>
          </div>

          {/* Table + Chart side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

            {/* Month-by-month table */}
            <div className="lg:col-span-1 bg-white border border-[#dee2e6] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="px-4 py-3 border-b border-[#f1f3f5]">
                <p className="text-[0.78rem] font-bold text-[#1a1a2e]">Month by month</p>
                <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">Tap a row to view that month</p>
              </div>
              {/* Table header */}
              <div className="grid px-4 py-2 border-b border-[#f1f3f5] bg-[#f8f9fa]"
                style={{ gridTemplateColumns: '1fr 90px 90px 50px' }}>
                <div className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em]">Month</div>
                <div className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em] text-right">Expected</div>
                <div className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em] text-right">Collected</div>
                <div className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em] text-right">Rate</div>
              </div>
              {monthlyBreakdown.length === 0 ? (
                <div className="py-12 text-center text-[#adb5bd] text-sm">No payment history yet</div>
              ) : (
                monthlyBreakdown.map(row => {
                  const rateColor = row.rate >= 70 ? 'text-[#2f9e44]' : row.rate >= 50 ? 'text-[#e67700]' : 'text-[#c92a2a]'
                  const barCls    = row.rate >= 70 ? 'bg-[#2f9e44]' : row.rate >= 50 ? 'bg-[#e67700]' : 'bg-[#c92a2a]'
                  return (
                    <button
                      key={row.month}
                      onClick={() => { setViewMode('monthly'); setSelectedMonth(row.month) }}
                      className="w-full grid px-4 py-3 border-b border-[#f1f3f5] last:border-0 hover:bg-[#fafbff] transition-colors text-left items-center"
                      style={{ gridTemplateColumns: '1fr 90px 90px 50px' }}
                    >
                      <div>
                        <p className="text-[0.82rem] font-semibold text-[#1a1a2e]">{row.label}</p>
                        <div className="mt-1 h-1 bg-[#f1f3f5] rounded-full overflow-hidden w-20">
                          <div className={`h-full rounded-full ${barCls}`} style={{ width: `${row.rate}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[0.76rem] font-semibold text-[#3b5bdb]">LKR {row.expected.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[0.76rem] font-semibold text-[#2f9e44]">LKR {row.collected.toLocaleString()}</p>
                        {row.pending > 0 && (
                          <p className="text-[0.62rem] text-[#e67700]">+{(row.pending / 1000).toFixed(0)}k pend.</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className={`text-[0.82rem] font-extrabold ${rateColor}`}>{row.rate}%</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Bar chart */}
            <div className="lg:col-span-2 bg-white border border-[#dee2e6] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="px-4 pt-4 pb-0">
                <p className="text-[0.78rem] font-bold text-[#1a1a2e]">Expected vs collected</p>
                <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">Bars animate in · rate % above each collected bar</p>
              </div>
              <AlltimeChart data={monthlyBreakdown} />
            </div>

          </div>
        </div>
      )}

      {/* ── Monthly view ─────────────────────────────────────────────────────── */}
      {viewMode === 'monthly' && <>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <p className="text-[0.62rem] font-bold text-[#6c757d] uppercase tracking-[0.08em]">Expected</p>
          <p className="text-[1.35rem] font-extrabold text-[#3b5bdb] tracking-tight mt-1">
            LKR {summary.expected.toLocaleString()}
          </p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">this month</p>
        </div>
        <div className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <p className="text-[0.62rem] font-bold text-[#6c757d] uppercase tracking-[0.08em]">Collected</p>
          <p className="text-[1.35rem] font-extrabold text-[#2f9e44] tracking-tight mt-1">
            LKR {summary.collected.toLocaleString()}
          </p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">{summary.paidCount} student{summary.paidCount !== 1 ? 's' : ''} paid</p>
        </div>
        <button
          onClick={() => setTab('pending')}
          className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-left hover:border-[#3b5bdb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all"
        >
          <p className="text-[0.62rem] font-bold text-[#6c757d] uppercase tracking-[0.08em]">Pending</p>
          <p className="text-[1.35rem] font-extrabold text-[#e67700] tracking-tight mt-1">
            LKR {summary.pending.toLocaleString()}
          </p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">{summary.pendingCount} student{summary.pendingCount !== 1 ? 's' : ''}</p>
        </button>
        <button
          onClick={() => setTab('overdue')}
          className="bg-white border border-[#dee2e6] rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-left hover:border-[#3b5bdb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all"
        >
          <p className="text-[0.62rem] font-bold text-[#6c757d] uppercase tracking-[0.08em]">Overdue</p>
          <p className={`text-[1.35rem] font-extrabold tracking-tight mt-1 ${summary.overdueCount > 0 ? 'text-[#c92a2a]' : 'text-[#adb5bd]'}`}>
            LKR {summary.overdue.toLocaleString()}
          </p>
          <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">{summary.overdueCount} student{summary.overdueCount !== 1 ? 's' : ''}</p>
        </button>
      </div>

      {/* Collection rate bar */}
      <div className="bg-white border border-[#dee2e6] rounded-[14px] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.72rem] font-semibold text-[#6c757d]">Collection rate</p>
          <p className={`font-extrabold text-[0.88rem] ${rateTextCls}`}>{summary.rate}%</p>
        </div>
        <div className="h-2 bg-[#f1f3f5] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${rateBarCls}`}
            style={{ width: `${summary.rate}%` }}
          />
        </div>
        <p className="text-[#adb5bd] text-[0.62rem] mt-1.5">
          LKR {summary.collected.toLocaleString()} of LKR {summary.expected.toLocaleString()} collected
        </p>
      </div>

      {/* ── Student filter banner ────────────────────────────────────────── */}
      {studentIdParam && displayPayments.length > 0 && (
        <div className="flex items-center gap-3 bg-[#edf2ff] border border-[#dbe4ff] rounded-[12px] px-4 py-2.5">
          <div className="flex-1">
            <p className="text-[0.78rem] font-semibold text-[#3b5bdb]">
              Filtered: {displayPayments[0]?.student_name}
            </p>
            <p className="text-[0.68rem] text-[#6c757d] mt-0.5">{displayPayments.length} payment record{displayPayments.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => router.replace('/payments')}
            className="text-[0.72rem] font-semibold text-[#3b5bdb] hover:text-[#2f49b8] border border-[#dbe4ff] hover:border-[#3b5bdb] rounded-full px-3 py-1 transition-colors bg-white"
          >
            Clear filter ×
          </button>
        </div>
      )}

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {(
          [
            { value: 'all'     as TabValue, label: 'All',      badge: counts.all,     color: undefined },
            { value: 'pending' as TabValue, label: 'Pending',  badge: counts.pending, color: 'bg-[#fff9db] text-[#e67700]' },
            { value: 'overdue' as TabValue, label: 'Overdue',  badge: counts.overdue, color: 'bg-[#fff5f5] text-[#c92a2a]' },
            { value: 'paid'    as TabValue, label: 'Paid',     badge: counts.paid,    color: 'bg-[#ebfbee] text-[#2f9e44]' },
            { value: 'trial'   as TabValue, label: 'Trial',    badge: counts.trial,   color: 'bg-[#f3f0ff] text-[#7048e8]' },
          ]
        ).map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 px-4 py-2 text-[0.78rem] font-bold rounded-[8px] whitespace-nowrap transition-all ${
              tab === t.value
                ? 'bg-[#3b5bdb] text-white shadow-[0_2px_8px_rgba(59,91,219,0.2)]'
                : 'bg-white text-[#6c757d] border border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
            }`}
          >
            {t.label}
            <TabBadge count={t.badge} active={tab === t.value} color={t.color} />
          </button>
        ))}
      </div>

      {/* ── Payment cards grid ────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonCards />
      ) : displayPayments.length === 0 ? (
        <div className="bg-white rounded-[18px] border border-[#dee2e6] py-16 flex flex-col items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CheckCircle2 size={30} className="text-[#b2f2bb]" />
          <p className="text-[#6c757d] text-sm font-medium">
            {tab === 'overdue'
              ? 'No overdue payments — great!'
              : tab === 'pending'
              ? 'No pending payments this month'
              : tab === 'trial'
              ? 'No trial payments to verify'
              : tab === 'paid'
              ? 'No payments recorded yet'
              : 'No payment records for this month'}
          </p>
          {monthPayments.length === 0 && tab === 'all' && (
            <p className="text-[#adb5bd] text-xs text-center max-w-[260px]">
              Payment records are generated automatically on the 1st of each month for all active students.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-[14px] border border-[#dee2e6] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {/* Table header */}
          <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 border-b border-[#f1f3f5] bg-[#f8f9fa]">
            <div className="flex-1 text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em]">Student</div>
            <div className="w-[100px] text-right text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em]">Amount</div>
            <div className="w-[76px] text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em] ml-3">Status</div>
            <div className="w-[160px] text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em]">Actions</div>
          </div>
          {displayPayments.map(p => (
            <PaymentRow
              key={p.id}
              payment={p}
              reminderSending={reminderSendingIds.has(p.id)}
              onMarkPaid={() => setMarkingPaid(p)}
              onSendReminder={() => handleSendReminder(p.id)}
              onVerifyTrial={() => setVerifyingTrial(p)}
              onBlockStudent={() => setBlockingStudent(p)}
              onViewHistory={() => setHistoryFor(p)}
            />
          ))}
        </div>
      )}

      </>}

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {markingPaid && (
        <MarkPaidModal
          payment={markingPaid}
          onClose={() => setMarkingPaid(null)}
          onConfirm={handleMarkPaid}
          confirming={confirmingId === markingPaid.id}
        />
      )}

      {verifyingTrial && (
        <VerifyTrialModal
          payment={verifyingTrial}
          onClose={() => setVerifyingTrial(null)}
          onConfirm={handleVerifyTrial}
          confirming={confirmingId === verifyingTrial.id}
        />
      )}

      {blockingStudent && (
        <BlockStudentModal
          payment={blockingStudent}
          onClose={() => setBlockingStudent(null)}
          onConfirm={handleBlockStudent}
          confirming={confirmingId === blockingStudent.id}
        />
      )}

      {historyFor && (
        <PaymentHistoryPanel
          studentId={historyFor.student_id}
          studentName={historyFor.student_name}
          subject={historyFor.subject}
          grade={historyFor.grade}
          tutorId={tutorId}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  )
}
