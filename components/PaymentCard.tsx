'use client'

import { CheckCircle2, MessageCircle, UserX, Clock } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

export type PaymentCardType = 'pending' | 'paid' | 'overdue' | 'trial' | 'first_month'

export interface EnrichedPayment {
  id: string
  student_id: string
  student_name: string
  student_whatsapp: string
  subject: string
  grade: string
  class_type: 'individual' | 'batch' | 'trial'
  batch_name?: string | null
  amount_lkr: number
  full_fee?: number | null
  trial_deduction?: number | null
  month_year: string
  status: string
  paid_at?: string | null
  payment_reference?: string | null
  is_trial_payment?: boolean
  reminder_sent_at?: string | null
  reminder_count?: number
  isOverdue: boolean
  daysPastDue: number
  student_status?: string
}

interface PaymentCardProps {
  payment: EnrichedPayment
  reminderSending: boolean
  onMarkPaid: () => void
  onSendReminder: () => void
  onVerifyTrial: () => void
  onBlockStudent: () => void
  onViewHistory: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getCardType(p: EnrichedPayment): PaymentCardType {
  if (p.is_trial_payment) return 'trial'
  if (p.isOverdue) return 'overdue'
  if (p.status === 'paid') return 'paid'
  if (p.trial_deduction && p.trial_deduction > 0) return 'first_month'
  return 'pending'
}

function formatPaidAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-LK', {
    day: 'numeric', month: 'short',
  }) + ' · ' + new Date(iso).toLocaleTimeString('en-LK', {
    hour: '2-digit', minute: '2-digit',
  })
}

function formatMonthYear(my: string): string {
  const [y, m] = my.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-LK', { month: 'short', year: 'numeric' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function Avatar({ name }: { name: string }) {
  const colors = [
    'bg-[#edf2ff] text-[#3b5bdb]',
    'bg-[#f3f0ff] text-[#7048e8]',
    'bg-[#ebfbee] text-[#2f9e44]',
    'bg-[#fff9db] text-[#e67700]',
  ]
  const cls = colors[name.charCodeAt(0) % colors.length]
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[0.78rem] font-bold flex-shrink-0 ${cls}`}>
      {initials}
    </div>
  )
}

// ── Card header styles per type ────────────────────────────────────────────

const HEADER_STYLES: Record<PaymentCardType, { bg: string; text: string; label: string }> = {
  pending:     { bg: 'bg-[#fff9db]',  text: 'text-[#e67700]', label: '' },
  paid:        { bg: 'bg-[#ebfbee]',  text: 'text-[#2f9e44]', label: '' },
  overdue:     { bg: 'bg-[#fff5f5]',  text: 'text-[#c92a2a]', label: '' },
  trial:       { bg: 'bg-[#f3f0ff]',  text: 'text-[#7048e8]', label: '' },
  first_month: { bg: 'bg-[#edf2ff]',  text: 'text-[#3b5bdb]', label: '' },
}

const CARD_BORDER: Record<PaymentCardType, string> = {
  pending:     'border-[#ffec99]',
  paid:        'border-[#b2f2bb]',
  overdue:     'border-[#c92a2a]',
  trial:       'border-[#d0bfff]',
  first_month: 'border-[#dbe4ff]',
}

const CARD_BORDER_WIDTH: Record<PaymentCardType, string> = {
  pending:     'border',
  paid:        'border',
  overdue:     'border-2',
  trial:       'border',
  first_month: 'border',
}

function cardHeaderLabel(type: PaymentCardType, p: EnrichedPayment): string {
  switch (type) {
    case 'pending':     return `Pending · ${formatMonthYear(p.month_year)}`
    case 'paid':        return `Paid · ${p.paid_at ? formatPaidAt(p.paid_at) : formatMonthYear(p.month_year)}`
    case 'overdue':     return `Overdue · ${p.daysPastDue} day${p.daysPastDue !== 1 ? 's' : ''}`
    case 'trial':       return `Trial payment · ${formatMonthYear(p.month_year)}`
    case 'first_month': return `First month · ${formatMonthYear(p.month_year)}`
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PaymentCard({
  payment: p,
  reminderSending,
  onMarkPaid,
  onSendReminder,
  onVerifyTrial,
  onBlockStudent,
  onViewHistory,
}: PaymentCardProps) {
  const type = getCardType(p)
  const hdr = HEADER_STYLES[type]
  const hasReference = !!p.payment_reference
  const isBlocked = p.student_status === 'blocked'
  const reminderCount = p.reminder_count ?? 0

  return (
    <div
      className={`
        rounded-[14px] ${CARD_BORDER_WIDTH[type]} ${CARD_BORDER[type]}
        bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]
        overflow-hidden transition-all duration-150
        hover:-translate-y-[2px] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
      `}
    >
      {/* Card header */}
      <div className={`${hdr.bg} ${hdr.text} px-4 py-2 flex items-center justify-between`}>
        <p className="text-[0.72rem] font-bold tracking-wide">
          {cardHeaderLabel(type, p)}
        </p>
        {type === 'first_month' && (
          <span className="text-[0.62rem] font-semibold opacity-80">Trial fee deducted</span>
        )}
        {isBlocked && (
          <span className="text-[0.62rem] font-bold bg-[#c92a2a] text-white px-2 py-0.5 rounded-full">
            Blocked
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="px-5 py-4 space-y-3.5">

        {/* Row 1: avatar + name + type */}
        <div className="flex items-center gap-3">
          <Avatar name={p.student_name} />
          <div className="flex-1 min-w-0">
            <p className="text-[0.9rem] font-bold text-[#1a1a2e] truncate">{p.student_name}</p>
            <p className="text-[0.72rem] text-[#6c757d] truncate">
              {p.subject} · {p.grade}
              {p.class_type === 'batch' && p.batch_name
                ? ` · ${p.batch_name}`
                : p.class_type === 'individual'
                ? ' · Individual'
                : p.class_type === 'trial'
                ? ' · Trial'
                : ''}
            </p>
          </div>
        </div>

        {/* Row 2: amount */}
        {type === 'first_month' && p.full_fee && p.trial_deduction ? (
          <div className="bg-[#f8f9fa] rounded-[10px] px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.75rem] font-mono text-[#6c757d]">Monthly fee</span>
              <span className="text-[0.82rem] font-mono font-semibold text-[#1a1a2e]">
                LKR {p.full_fee.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[0.75rem] font-mono text-[#c92a2a]">Trial deduction</span>
              <span className="text-[0.82rem] font-mono font-semibold text-[#c92a2a]">
                &minus;LKR {p.trial_deduction.toLocaleString()}
              </span>
            </div>
            <div className="border-t border-[#dee2e6] pt-1.5 flex items-center justify-between">
              <span className="text-[0.75rem] font-mono font-bold text-[#2f9e44]">Amount due</span>
              <span className="text-[0.95rem] font-mono font-extrabold text-[#2f9e44]">
                LKR {p.amount_lkr.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <p className={`text-[1.1rem] font-extrabold tracking-tight ${
            type === 'trial' ? 'text-[#7048e8]' :
            type === 'paid'  ? 'text-[#2f9e44]' :
            type === 'overdue' ? 'text-[#c92a2a]' :
            'text-[#1a1a2e]'
          }`}>
            LKR {p.amount_lkr.toLocaleString()}
          </p>
        )}

        {/* Row 3: reference */}
        <div>
          {hasReference ? (
            <div className="flex items-center gap-2">
              <span className="text-[0.7rem] text-[#adb5bd] font-medium">Ref:</span>
              <span className="text-[0.72rem] font-mono font-semibold text-[#343a40] bg-[#f1f3f5] px-2 py-0.5 rounded-[6px]">
                {p.payment_reference}
              </span>
            </div>
          ) : (
            <p className="text-[0.7rem] text-[#adb5bd] italic">No reference yet</p>
          )}
        </div>

        {/* Row 4: timestamp / overdue info */}
        {type === 'overdue' && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#c92a2a] flex-shrink-0" />
            <p className="text-[0.72rem] font-bold text-[#c92a2a]">
              {p.daysPastDue} day{p.daysPastDue !== 1 ? 's' : ''} overdue
            </p>
          </div>
        )}
        {type === 'paid' && p.paid_at && (
          <p className="text-[0.7rem] text-[#adb5bd]">
            Confirmed {formatPaidAt(p.paid_at)}
          </p>
        )}
        {(type === 'pending' || type === 'first_month') && p.reminder_sent_at && (
          <p className="text-[0.7rem] text-[#6c757d]">
            <Clock size={10} className="inline mr-1" />
            Reference sent {timeAgo(p.reminder_sent_at)}
          </p>
        )}

        {/* ── Actions ── */}
        <div className="space-y-2 pt-0.5">

          {/* PENDING */}
          {(type === 'pending' || type === 'first_month') && (
            <>
              {hasReference ? (
                <>
                  <button
                    onClick={onMarkPaid}
                    className="w-full flex items-center justify-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white text-[0.82rem] font-semibold py-2.5 rounded-full transition-all shadow-[0_4px_14px_rgba(59,91,219,0.25)] hover:-translate-y-px"
                  >
                    <CheckCircle2 size={14} />
                    Mark as paid
                  </button>
                  <button
                    onClick={onSendReminder}
                    disabled={reminderSending}
                    className="w-full flex items-center justify-center gap-2 border border-[#dee2e6] text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] text-[0.78rem] font-semibold py-2 rounded-full transition-all disabled:opacity-60"
                  >
                    <MessageCircle size={13} />
                    {reminderSending ? 'Sending…' : 'Send reminder'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onSendReminder}
                    disabled={reminderSending}
                    className="w-full flex items-center justify-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white text-[0.82rem] font-semibold py-2.5 rounded-full transition-all shadow-[0_4px_14px_rgba(59,91,219,0.25)] hover:-translate-y-px disabled:opacity-60"
                  >
                    <MessageCircle size={14} />
                    {reminderSending ? 'Sending…' : 'Send reminder'}
                  </button>
                  <button
                    onClick={onMarkPaid}
                    className="w-full flex items-center justify-center gap-2 border border-[#dee2e6] text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] text-[0.78rem] font-semibold py-2 rounded-full transition-all"
                  >
                    <CheckCircle2 size={13} />
                    Mark as paid
                  </button>
                </>
              )}
            </>
          )}

          {/* PAID */}
          {type === 'paid' && (
            <button
              onClick={onViewHistory}
              className="w-full flex items-center justify-center gap-2 border border-[#dee2e6] text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] text-[0.78rem] font-semibold py-2 rounded-full transition-all"
            >
              View history
            </button>
          )}

          {/* OVERDUE */}
          {type === 'overdue' && (
            <>
              <button
                onClick={onMarkPaid}
                className="w-full flex items-center justify-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white text-[0.82rem] font-semibold py-2.5 rounded-full transition-all shadow-[0_4px_14px_rgba(59,91,219,0.25)] hover:-translate-y-px"
              >
                <CheckCircle2 size={14} />
                Mark as paid
              </button>
              <button
                onClick={onSendReminder}
                disabled={reminderSending}
                className="w-full flex items-center justify-center gap-2 border border-[#dee2e6] text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] text-[0.78rem] font-semibold py-2 rounded-full transition-all disabled:opacity-60"
              >
                <MessageCircle size={13} />
                {reminderSending ? 'Sending…' : 'Send reminder'}
              </button>
              {!isBlocked && (
                <button
                  onClick={onBlockStudent}
                  className="w-full text-[0.72rem] font-semibold text-[#c92a2a] hover:underline py-1 transition-colors flex items-center justify-center gap-1"
                >
                  <UserX size={12} />
                  Block student
                </button>
              )}
            </>
          )}

          {/* TRIAL */}
          {type === 'trial' && (
            <>
              <button
                onClick={onVerifyTrial}
                className="w-full flex items-center justify-center gap-2 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white text-[0.82rem] font-semibold py-2.5 rounded-full transition-all shadow-[0_4px_14px_rgba(59,91,219,0.25)] hover:-translate-y-px"
              >
                <CheckCircle2 size={14} />
                Verify trial
              </button>
              <button
                onClick={onViewHistory}
                className="w-full flex items-center justify-center gap-2 border border-[#dee2e6] text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] text-[0.78rem] font-semibold py-2 rounded-full transition-all"
              >
                View student
              </button>
            </>
          )}
        </div>

        {/* Reminder sent indicator */}
        {reminderCount > 0 && type !== 'paid' && (
          <p className="text-[0.67rem] text-[#adb5bd] italic">
            Reminder sent {reminderCount} time{reminderCount !== 1 ? 's' : ''}
            {p.reminder_sent_at ? ` · Last: ${timeAgo(p.reminder_sent_at)}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Compact table row ──────────────────────────────────────────────────────

const STATUS_ROW: Record<PaymentCardType, { label: string; cls: string }> = {
  pending:     { label: 'Pending',    cls: 'bg-[#fff9db] text-[#e67700] border-[#ffec99]' },
  paid:        { label: 'Paid',       cls: 'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]' },
  overdue:     { label: 'Overdue',    cls: 'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]' },
  trial:       { label: 'Trial',      cls: 'bg-[#f3f0ff] text-[#7048e8] border-[#d0bfff]' },
  first_month: { label: '1st month',  cls: 'bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]' },
}

const LEFT_BORDER: Record<PaymentCardType, string> = {
  pending:     'border-l-[3px] border-l-[#e67700]',
  paid:        'border-l-[3px] border-l-[#2f9e44]',
  overdue:     'border-l-[3px] border-l-[#c92a2a]',
  trial:       'border-l-[3px] border-l-[#7048e8]',
  first_month: 'border-l-[3px] border-l-[#3b5bdb]',
}

export function PaymentRow({
  payment: p,
  reminderSending,
  onMarkPaid,
  onSendReminder,
  onVerifyTrial,
  onBlockStudent,
  onViewHistory,
}: PaymentCardProps) {
  const type = getCardType(p)
  const { label, cls } = STATUS_ROW[type]
  const isBlocked = p.student_status === 'blocked'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-[#f1f3f5] last:border-0 hover:bg-[#fafbff] transition-colors ${LEFT_BORDER[type]}`}>

      {/* Name + subject */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[0.85rem] font-bold text-[#1a1a2e] truncate">{p.student_name}</p>
          {isBlocked && (
            <span className="text-[0.58rem] font-bold bg-[#c92a2a] text-white px-1.5 py-0.5 rounded-full flex-shrink-0">Blocked</span>
          )}
        </div>
        <p className="text-[0.7rem] text-[#6c757d] truncate">
          {p.subject} · {p.grade}
          {p.class_type === 'batch' && p.batch_name ? ` · ${p.batch_name}` : ''}
          {type === 'overdue' ? ` · ${p.daysPastDue}d overdue` : ''}
          {p.payment_reference ? ` · ref: ${p.payment_reference}` : ''}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0 w-[100px]">
        <p className={`text-[0.88rem] font-extrabold tracking-tight ${
          type === 'paid' ? 'text-[#2f9e44]' : type === 'overdue' ? 'text-[#c92a2a]' : type === 'trial' ? 'text-[#7048e8]' : 'text-[#1a1a2e]'
        }`}>
          LKR {p.amount_lkr.toLocaleString()}
        </p>
        {type === 'paid' && p.paid_at && (
          <p className="text-[0.6rem] text-[#adb5bd]">{new Date(p.paid_at).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}</p>
        )}
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0 w-[76px] ml-3">
        <span className={`text-[0.62rem] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 w-[160px]">
        {(type === 'pending' || type === 'first_month' || type === 'overdue') && (
          <button
            onClick={onMarkPaid}
            className="text-[0.68rem] font-bold px-2.5 py-1 rounded-full bg-[#3b5bdb] text-white hover:bg-[#2f49b8] transition-colors"
          >
            Mark paid
          </button>
        )}
        {type === 'trial' && (
          <button
            onClick={onVerifyTrial}
            className="text-[0.68rem] font-bold px-2.5 py-1 rounded-full bg-[#7048e8] text-white hover:bg-[#5f3dc4] transition-colors"
          >
            Verify
          </button>
        )}
        {type !== 'paid' && (
          <button
            onClick={onSendReminder}
            disabled={reminderSending}
            title="Send reminder"
            className="w-7 h-7 rounded-full border border-[#dee2e6] bg-white flex items-center justify-center hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors disabled:opacity-50 text-[#6c757d]"
          >
            <MessageCircle size={12} />
          </button>
        )}
        {type === 'overdue' && !isBlocked && (
          <button
            onClick={onBlockStudent}
            title="Block student"
            className="w-7 h-7 rounded-full border border-[#ffc9c9] bg-white flex items-center justify-center hover:bg-[#fff5f5] hover:border-[#c92a2a] transition-colors text-[#c92a2a]"
          >
            <UserX size={12} />
          </button>
        )}
        <button
          onClick={onViewHistory}
          className="text-[0.65rem] font-semibold px-2.5 py-1 rounded-full border border-[#dee2e6] bg-white text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors"
        >
          History
        </button>
      </div>
    </div>
  )
}
