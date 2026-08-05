'use client'

import { useState, useEffect } from 'react'
import { X, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────

interface HistoryPayment {
  id: string
  amount_lkr: number
  month_year: string
  status: string
  paid_at?: string | null
  payment_reference?: string | null
  is_trial_payment?: boolean
  method?: string | null
}

interface PaymentHistoryPanelProps {
  studentId: string
  studentName: string
  subject: string
  grade: string
  tutorId: string
  onClose: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatMonthYear(my: string): string {
  const [y, m] = my.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-LK', { month: 'long', year: 'numeric' })
}

function formatPaidAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusPill({ status, isTrial }: { status: string; isTrial?: boolean }) {
  if (isTrial) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.62rem] font-bold bg-[#f3f0ff] text-[#7048e8] border border-[#e5dbff]">
        Trial
      </span>
    )
  }
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.62rem] font-bold bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb]">
        Paid
      </span>
    )
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.62rem] font-bold bg-[#fff5f5] text-[#c92a2a] border border-[#ffc9c9]">
        Overdue
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.62rem] font-bold bg-[#fff9db] text-[#e67700] border border-[#ffec99]">
      Pending
    </span>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PaymentHistoryPanel({
  studentId,
  studentName,
  subject,
  grade,
  tutorId,
  onClose,
}: PaymentHistoryPanelProps) {
  const [history, setHistory] = useState<HistoryPayment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('payments')
        .select('id, amount_lkr, month_year, status, paid_at, payment_reference, is_trial_payment, method')
        .eq('student_id', studentId)
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false })
      setHistory((data ?? []) as HistoryPayment[])
      setLoading(false)
    }
    load()
  }, [studentId, tutorId])

  const totalCollected = history
    .filter(p => p.status === 'paid')
    .reduce((s, p) => s + p.amount_lkr, 0)

  const initials = studentName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-screen w-[420px] max-w-full bg-white z-50 flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.14)]">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-[#dee2e6] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#edf2ff] text-[#3b5bdb] flex items-center justify-center text-[0.78rem] font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <h2 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] truncate">
                  Payment history
                </h2>
                <p className="text-[0.72rem] text-[#6c757d] mt-0.5 truncate">
                  {studentName} · {subject} · {grade}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:bg-[#f8f9fa] flex-shrink-0 transition-all"
            >
              <X size={14} className="text-[#6c757d]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-[#f8f9fa] rounded-[12px] animate-pulse" />
            ))
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <TrendingUp size={28} className="text-[#dee2e6]" />
              <p className="text-[0.82rem] text-[#adb5bd] font-medium text-center">
                No payment records yet
              </p>
            </div>
          ) : (
            history.map(p => (
              <div
                key={p.id}
                className="bg-white border border-[#dee2e6] rounded-[12px] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[0.84rem] font-semibold text-[#1a1a2e]">
                        {formatMonthYear(p.month_year)}
                      </p>
                      <StatusPill status={p.status} isTrial={p.is_trial_payment} />
                    </div>
                    {p.payment_reference && (
                      <p className="text-[0.68rem] font-mono text-[#6c757d] mt-0.5">
                        Ref: {p.payment_reference}
                      </p>
                    )}
                    {p.paid_at && p.status === 'paid' && (
                      <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">
                        Paid {formatPaidAt(p.paid_at)}
                        {p.method ? ` · ${p.method === 'ezCash' ? 'eZCash' : p.method.charAt(0).toUpperCase() + p.method.slice(1)}` : ''}
                      </p>
                    )}
                  </div>
                  <p className={`text-[0.95rem] font-extrabold tracking-tight flex-shrink-0 ${
                    p.status === 'paid' ? 'text-[#2f9e44]' : p.status === 'overdue' ? 'text-[#c92a2a]' : 'text-[#1a1a2e]'
                  }`}>
                    LKR {p.amount_lkr.toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer — total */}
        {!loading && history.length > 0 && (
          <div className="flex-shrink-0 border-t border-[#dee2e6] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.72rem] font-semibold text-[#6c757d]">Total collected</p>
                <p className="text-[0.68rem] text-[#adb5bd]">
                  {history.filter(p => p.status === 'paid').length} of {history.length} payments
                </p>
              </div>
              <p className="text-[1.1rem] font-extrabold text-[#2f9e44] tracking-tight">
                LKR {totalCollected.toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
