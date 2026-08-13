'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Send, ShieldOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export interface OverduePaymentItem {
  paymentId: string
  studentId: string
  studentName: string
  amountLkr: number
  daysOverdue: number
}

// Embeddable "Overdue payments" group for the Dashboard's At-Risk Students
// card, shown above the Missed sessions group. Live data comes from the
// caller (computed via lib/payment-status.ts), this component only handles
// the three real actions a tutor can take here.
export default function OverduePaymentsCard({
  payments,
  totalCount,
  autoNotifyMode,
  onChanged,
}: {
  payments: OverduePaymentItem[]
  totalCount: number
  autoNotifyMode: boolean
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError]   = useState('')

  async function markPaid(paymentId: string) {
    setBusyId(paymentId)
    setError('')
    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark as paid')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as paid')
    } finally {
      setBusyId(null)
    }
  }

  async function sendReminder(paymentId: string) {
    setBusyId(paymentId)
    setError('')
    try {
      const res = await fetch('/api/payments/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminder')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder')
    } finally {
      setBusyId(null)
    }
  }

  // Blocking is ALWAYS a manual tutor click — this is the only place a
  // student's status ever becomes 'blocked'. The reminders cron never does this.
  async function blockStudent(studentId: string, paymentId: string) {
    setBusyId(paymentId)
    setError('')
    try {
      const supabase = createClient()
      const { error: updErr } = await supabase.from('students').update({
        status: 'blocked',
        status_reason: 'Overdue payment',
      }).eq('id', studentId)
      if (updErr) throw new Error(updErr.message)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block student')
    } finally {
      setBusyId(null)
    }
  }

  if (totalCount === 0) return null

  return (
    <div className="rounded-[14px] border border-[#f1f3f5] overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8f9fa] border-b border-[#f1f3f5]">
        <div className="w-5 h-5 rounded-full bg-[#fff9db] border border-[#ffec99] flex items-center justify-center flex-shrink-0">
          <AlertCircle size={11} className="text-[#e67700]" />
        </div>
        <span className="text-[0.72rem] font-bold text-[#343a40]">Overdue payments</span>
        <span className="text-[0.68rem] text-[#adb5bd] font-medium">· {totalCount} student{totalCount !== 1 ? 's' : ''}</span>
        <Link href="/payments?tab=overdue" className="ml-auto text-[0.68rem] font-semibold text-[#3b5bdb] hover:text-[#4c6ef5] transition-colors flex-shrink-0">
          View all in Payments →
        </Link>
      </div>

      {!autoNotifyMode && (
        <p className="text-[#6c757d] text-[0.7rem] px-4 pt-2">
          Nothing sent to students yet — review and remind if needed
        </p>
      )}
      {error && (
        <p className="px-4 pt-2 text-[#c92a2a] text-[0.72rem] font-semibold">{error}</p>
      )}

      {/* Rows */}
      {payments.map(p => {
        const busy = busyId === p.paymentId
        return (
          <div key={p.paymentId} className="flex items-center gap-3 px-4 py-3 border-b border-[#f8f9fa] last:border-0 hover:bg-[#fffbf5] transition-colors">
            <div className="w-9 h-9 rounded-full bg-[#edf2ff] flex items-center justify-center flex-shrink-0 text-[#3b5bdb] text-[0.75rem] font-extrabold">
              {p.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.82rem] font-semibold text-[#1a1a2e] truncate">{p.studentName}</p>
              <p className="text-[0.72rem] text-[#c92a2a] font-semibold mt-0.5">
                LKR {p.amountLkr.toLocaleString()}
                <span className="text-[#adb5bd] font-normal ml-1">
                  · {p.daysOverdue} day{p.daysOverdue !== 1 ? 's' : ''} overdue
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => markPaid(p.paymentId)}
                disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[0.7rem] font-semibold bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] hover:bg-[#d3f9d8] transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={11} /> Mark paid
              </button>
              <button
                onClick={() => sendReminder(p.paymentId)}
                disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[0.7rem] font-semibold border border-[#dee2e6] text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors bg-white disabled:opacity-50"
              >
                <Send size={11} /> Remind
              </button>
              <button
                onClick={() => blockStudent(p.studentId, p.paymentId)}
                disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[0.7rem] font-semibold bg-[#fff5f5] text-[#c92a2a] border border-[#ffc9c9] hover:bg-[#ffe3e3] transition-colors disabled:opacity-50"
              >
                <ShieldOff size={11} /> Block
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
