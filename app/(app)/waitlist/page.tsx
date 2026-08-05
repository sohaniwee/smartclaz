'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Clock, Users, CheckCircle2, AlertCircle, Copy, RotateCcw,
  UserPlus, X,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type WaitlistTab = 'waiting' | 'offered' | 'enrolled' | 'expired'

interface EnrichedBatch {
  id: string
  name: string
  subject: string
  grade: string
  schedule_day: string
  schedule_time: string
  monthly_fee: number
  max_students: number
  accepting_new: boolean
}

interface EnrichedEntry {
  id: string
  tutor_id: string
  student_name: string
  student_whatsapp: string
  subject: string
  grade: string
  batch_id: string | null
  status: 'waiting' | 'offered' | 'enrolled' | 'expired'
  notified_at: string | null
  created_at: string
  batch: EnrichedBatch | null
}

interface ConfirmState {
  type: 'offer' | 'remove' | 'withdraw' | 'readd'
  entry: EnrichedEntry
  offerMessage?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr ?? '0', 10)
  const m = parseInt(mStr ?? '0', 10)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function isStale(entry: EnrichedEntry): boolean {
  if (!entry.notified_at) return false
  return daysBetween(entry.notified_at, new Date().toISOString()) >= 3
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-[#edf2ff] text-[#3b5bdb] flex items-center justify-center font-bold text-sm flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

// ── Skeleton rows ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#dee2e6] rounded-[14px] p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#f1f3f5] flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-[#f1f3f5] rounded w-2/3" />
          <div className="h-3 bg-[#f1f3f5] rounded w-1/3" />
        </div>
        <div className="w-12 h-5 bg-[#f1f3f5] rounded-full" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-24 bg-[#f1f3f5] rounded-[8px]" />
        <div className="h-8 w-20 bg-[#f1f3f5] rounded-[8px]" />
      </div>
    </div>
  )
}

// ── Offer confirm modal ────────────────────────────────────────────────────

function OfferModal({
  entry,
  offerMessage,
  onConfirm,
  onCancel,
}: {
  entry: EnrichedEntry
  offerMessage: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(offerMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const b = entry.batch

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[6px] z-[60]" onClick={onCancel} />
      <div className="fixed z-[70] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-sm p-6 bottom-4 left-1/2 -translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <h3 className="font-extrabold text-[#1a1a2e] text-[1rem] mb-1">
          Offer spot to {entry.student_name}?
        </h3>
        {b && (
          <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded-[10px] p-3 mb-3 mt-3 space-y-1">
            <p className="text-[0.78rem] font-bold text-[#1a1a2e]">{b.name}</p>
            <p className="text-[0.72rem] text-[#6c757d]">
              {b.schedule_day} {fmtTime(b.schedule_time)}
            </p>
            <p className="text-[0.72rem] font-semibold text-[#3b5bdb]">
              LKR {b.monthly_fee.toLocaleString()}/month
            </p>
          </div>
        )}
        {offerMessage && (
          <div className="mb-4">
            <p className="text-[0.7rem] font-semibold text-[#6c757d] mb-1.5 uppercase tracking-wide">Message that will be sent</p>
            <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded-[10px] p-3 mb-2 max-h-32 overflow-y-auto">
              <p className="text-[0.72rem] text-[#343a40] font-mono whitespace-pre-wrap leading-relaxed">
                {offerMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[8px] px-2.5 py-1 hover:bg-[#dbe4ff] transition-colors"
            >
              <Copy size={10} />
              {copied ? 'Copied!' : 'Copy message'}
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[10px] py-2.5 hover:border-[#adb5bd] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 text-white text-[0.82rem] font-semibold bg-[#3b5bdb] hover:bg-[#4c6ef5] rounded-[10px] py-2.5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            Send offer
          </button>
        </div>
      </div>
    </>
  )
}

// ── Remove confirm modal ───────────────────────────────────────────────────

function RemoveModal({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: EnrichedEntry
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[6px] z-[60]" onClick={onCancel} />
      <div className="fixed z-[70] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-sm p-6 bottom-4 left-1/2 -translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <h3 className="font-extrabold text-[#1a1a2e] text-[1rem] mb-2">
          Remove {entry.student_name} from waitlist?
        </h3>
        <p className="text-[#6c757d] text-[0.82rem] mb-5">
          No message will be sent. They can rejoin by messaging your WhatsApp again.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[10px] py-2.5 hover:border-[#adb5bd] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 text-white text-[0.82rem] font-semibold bg-[#c92a2a] hover:bg-[#a61e1e] rounded-[10px] py-2.5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            Remove
          </button>
        </div>
      </div>
    </>
  )
}

// ── Readd confirm modal ────────────────────────────────────────────────────

function ReaddModal({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: EnrichedEntry
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[6px] z-[60]" onClick={onCancel} />
      <div className="fixed z-[70] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-sm p-6 bottom-4 left-1/2 -translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <h3 className="font-extrabold text-[#1a1a2e] text-[1rem] mb-2">
          Re-add {entry.student_name} to waitlist?
        </h3>
        <p className="text-[#6c757d] text-[0.82rem] mb-5">
          They will be added to the end of the waiting queue for{' '}
          {entry.batch?.name ?? 'their batch'}.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[10px] py-2.5 hover:border-[#adb5bd] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 text-white text-[0.82rem] font-semibold bg-[#3b5bdb] hover:bg-[#4c6ef5] rounded-[10px] py-2.5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            Re-add to waitlist
          </button>
        </div>
      </div>
    </>
  )
}

// ── Resend offer modal ─────────────────────────────────────────────────────

function ResendModal({
  entry,
  message,
  onClose,
}: {
  entry: EnrichedEntry
  message: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[6px] z-[60]" onClick={onClose} />
      <div className="fixed z-[70] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-sm p-6 bottom-4 left-1/2 -translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-[#1a1a2e] text-[1rem]">
            Offer resent to {entry.student_name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#f1f3f5] flex items-center justify-center text-[#6c757d] hover:bg-[#dee2e6] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-[0.72rem] font-semibold text-[#6c757d] mb-2 uppercase tracking-wide">Message sent</p>
        <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded-[10px] p-3 mb-3 max-h-40 overflow-y-auto">
          <p className="text-[0.72rem] text-[#343a40] font-mono whitespace-pre-wrap leading-relaxed">
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[8px] px-3 py-1.5 hover:bg-[#dbe4ff] transition-colors"
        >
          <Copy size={11} />
          {copied ? 'Copied!' : 'Copy message'}
        </button>
      </div>
    </>
  )
}

// ── Waiting tab entry card ─────────────────────────────────────────────────

function WaitingCard({
  entry,
  position,
  enrolledCount,
  onOfferClick,
  onRemoveClick,
}: {
  entry: EnrichedEntry
  position: number
  enrolledCount: number
  onOfferClick: (e: EnrichedEntry) => void
  onRemoveClick: (e: EnrichedEntry) => void
}) {
  const b = entry.batch
  const isFull = b ? enrolledCount >= b.max_students : true
  const canOffer = !isFull

  return (
    <div className="bg-white border border-[#dee2e6] rounded-[14px] p-4">
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={entry.student_name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[0.84rem] font-bold text-[#1a1a2e] leading-tight truncate">{entry.student_name}</p>
            <span className="flex-shrink-0 bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
              #{position}
            </span>
          </div>
          <p className="text-[0.72rem] text-[#adb5bd]">{entry.student_whatsapp}</p>
          <p className="text-[0.72rem] text-[#6c757d] mt-0.5">
            Waiting since:{' '}
            <span className="font-semibold">
              {new Date(entry.created_at).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span className="text-[#adb5bd] ml-1">({timeAgo(entry.created_at)})</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!canOffer}
          title={!canOffer ? 'Batch is still full — a student must leave first.' : undefined}
          onClick={() => canOffer && onOfferClick(entry)}
          className={`flex items-center gap-1.5 text-[0.72rem] font-semibold rounded-[8px] px-3 py-1.5 border transition-colors ${
            canOffer
              ? 'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb] hover:bg-[#d3f9d8]'
              : 'bg-[#f1f3f5] text-[#adb5bd] border-[#dee2e6] cursor-not-allowed'
          }`}
        >
          <CheckCircle2 size={11} />
          Offer spot
        </button>
        <button
          type="button"
          onClick={() => onRemoveClick(entry)}
          className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-[#c92a2a] bg-[#fff5f5] border border-[#ffc9c9] rounded-[8px] px-3 py-1.5 hover:bg-[#ffe3e3] transition-colors"
        >
          <X size={11} />
          Remove
        </button>
      </div>
    </div>
  )
}

// ── Offered tab entry card ─────────────────────────────────────────────────

function OfferedCard({
  entry,
  onResendClick,
  onWithdrawClick,
}: {
  entry: EnrichedEntry
  onResendClick: (e: EnrichedEntry) => void
  onWithdrawClick: (e: EnrichedEntry) => void
}) {
  const stale = isStale(entry)

  return (
    <div
      className={`bg-white border rounded-[14px] p-4 ${
        stale
          ? 'border-l-[3px] border-l-[#e67700] border-[#ffec99] bg-[#fff9db]/30'
          : 'border-[#dee2e6]'
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={entry.student_name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-[0.84rem] font-bold text-[#1a1a2e] leading-tight">{entry.student_name}</p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${
              stale
                ? 'bg-[#fff9db] text-[#e67700] border-[#ffec99]'
                : 'bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]'
            }`}>
              <Clock size={9} />
              {stale ? 'No response' : 'Pending'}
            </span>
          </div>
          <p className="text-[0.72rem] text-[#adb5bd]">{entry.student_whatsapp}</p>
          {entry.batch && (
            <p className="text-[0.72rem] text-[#6c757d] mt-0.5">{entry.batch.name}</p>
          )}
          {entry.notified_at && (
            <p className="text-[0.7rem] text-[#adb5bd] mt-0.5">
              Offer sent:{' '}
              {new Date(entry.notified_at).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}
              {' '}({timeAgo(entry.notified_at)})
            </p>
          )}
          {stale && (
            <p className="text-[0.7rem] text-[#e67700] font-semibold mt-1 flex items-center gap-1">
              <AlertCircle size={10} />
              No response for 3+ days
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onResendClick(entry)}
          className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[8px] px-3 py-1.5 hover:bg-[#dbe4ff] transition-colors"
        >
          <RotateCcw size={11} />
          Resend offer
        </button>
        <button
          type="button"
          onClick={() => onWithdrawClick(entry)}
          className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-[#c92a2a] bg-[#fff5f5] border border-[#ffc9c9] rounded-[8px] px-3 py-1.5 hover:bg-[#ffe3e3] transition-colors"
        >
          <X size={11} />
          Withdraw
        </button>
      </div>
    </div>
  )
}

// ── Enrolled tab entry card ────────────────────────────────────────────────

function EnrolledCard({
  entry,
  onViewStudents,
}: {
  entry: EnrichedEntry
  onViewStudents: () => void
}) {
  const waitedDays = entry.notified_at
    ? daysBetween(entry.created_at, entry.notified_at)
    : null

  return (
    <div className="bg-white border border-[#dee2e6] rounded-[14px] p-4">
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={entry.student_name} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.84rem] font-bold text-[#1a1a2e] leading-tight">{entry.student_name}</p>
          <p className="text-[0.72rem] text-[#adb5bd]">{entry.student_whatsapp}</p>
          {entry.batch && (
            <p className="text-[0.72rem] text-[#6c757d] mt-0.5">{entry.batch.name}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]">
              <CheckCircle2 size={9} />
              Enrolled
            </span>
            {waitedDays !== null && (
              <span className="text-[0.68rem] text-[#adb5bd]">
                Waited {waitedDays} day{waitedDays !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewStudents}
        className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[8px] px-3 py-1.5 hover:bg-[#dbe4ff] transition-colors"
      >
        <Users size={11} />
        View student
      </button>
    </div>
  )
}

// ── Expired tab entry card ─────────────────────────────────────────────────

function ExpiredCard({
  entry,
  onReaddClick,
}: {
  entry: EnrichedEntry
  onReaddClick: (e: EnrichedEntry) => void
}) {
  return (
    <div className="bg-white border border-[#dee2e6] rounded-[14px] p-4">
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={entry.student_name} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.84rem] font-bold text-[#1a1a2e] leading-tight">{entry.student_name}</p>
          <p className="text-[0.72rem] text-[#adb5bd]">{entry.student_whatsapp}</p>
          {entry.batch && (
            <p className="text-[0.72rem] text-[#6c757d] mt-0.5">{entry.batch.name}</p>
          )}
          <p className="text-[0.7rem] text-[#adb5bd] mt-0.5">
            Added:{' '}
            {new Date(entry.created_at).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-bold border bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]">
          Expired
        </span>
      </div>
      <button
        type="button"
        onClick={() => onReaddClick(entry)}
        className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[8px] px-3 py-1.5 hover:bg-[#dbe4ff] transition-colors"
      >
        <RotateCcw size={11} />
        Re-add to waitlist
      </button>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function WaitlistPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tutorId, setTutorId] = useState<string | null>(null)
  const [entries, setEntries] = useState<EnrichedEntry[]>([])
  const [enrolledByBatch, setEnrolledByBatch] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<WaitlistTab>('waiting')

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [pendingOfferMessage, setPendingOfferMessage] = useState<string>('')
  const [resendModal, setResendModal] = useState<{ entry: EnrichedEntry; message: string } | null>(null)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const loadAll = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    setTutorId(user.id)

    const [waitlistRes, batchesRes, studentsRes] = await Promise.all([
      supabase
        .from('waitlist')
        .select('*')
        .eq('tutor_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('batches')
        .select('id, name, subject, grade, schedule_day, schedule_time, monthly_fee, max_students, accepting_new, status')
        .eq('tutor_id', user.id)
        .eq('status', 'active'),
      supabase
        .from('students')
        .select('batch_id')
        .eq('tutor_id', user.id)
        .eq('status', 'active')
        .not('batch_id', 'is', null),
    ])

    const batchById = new Map<string, EnrichedBatch>()
    for (const b of (batchesRes.data ?? [])) {
      batchById.set(b.id as string, {
        id: b.id as string,
        name: b.name as string,
        subject: b.subject as string,
        grade: b.grade as string,
        schedule_day: (b.schedule_day as string) ?? '',
        schedule_time: (b.schedule_time as string) ?? '',
        monthly_fee: (b.monthly_fee as number) ?? 0,
        max_students: (b.max_students as number) ?? 0,
        accepting_new: (b.accepting_new as boolean) ?? true,
      })
    }

    const countMap = new Map<string, number>()
    for (const s of (studentsRes.data ?? [])) {
      const bid = s.batch_id as string
      countMap.set(bid, (countMap.get(bid) ?? 0) + 1)
    }
    setEnrolledByBatch(countMap)

    type RawEntry = {
      id: string; tutor_id: string; student_name: string; student_whatsapp: string
      subject: string; grade: string; batch_id: string | null
      status: string; notified_at: string | null; created_at: string
    }

    const enriched: EnrichedEntry[] = ((waitlistRes.data ?? []) as RawEntry[]).map(w => ({
      id: w.id,
      tutor_id: w.tutor_id,
      student_name: w.student_name,
      student_whatsapp: w.student_whatsapp,
      subject: w.subject,
      grade: w.grade,
      batch_id: w.batch_id,
      status: w.status as EnrichedEntry['status'],
      notified_at: w.notified_at,
      created_at: w.created_at,
      batch: w.batch_id ? (batchById.get(w.batch_id) ?? null) : null,
    }))

    setEntries(enriched)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Handle ?batch= query param — pre-set to waiting tab
  useEffect(() => {
    const batchParam = searchParams.get('batch')
    if (batchParam) setActiveTab('waiting')
  }, [searchParams])

  // Realtime subscription
  useEffect(() => {
    if (!tutorId) return
    const supabase = createClient()
    const channel = supabase
      .channel('waitlist_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist', filter: `tutor_id=eq.${tutorId}` }, () => {
        loadAll()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tutorId, loadAll])

  // ── Derived counts ─────────────────────────────────────────────────────

  const waitingEntries  = entries.filter(e => e.status === 'waiting')
  const offeredEntries  = entries.filter(e => e.status === 'offered')
  const enrolledEntries = entries.filter(e => e.status === 'enrolled')
  const expiredEntries  = entries.filter(e => e.status === 'expired')

  // Group waiting by batch
  const waitingByBatch = new Map<string | null, EnrichedEntry[]>()
  for (const e of waitingEntries) {
    const key = e.batch_id
    const arr = waitingByBatch.get(key) ?? []
    arr.push(e)
    waitingByBatch.set(key, arr)
  }

  // ── Action handlers ────────────────────────────────────────────────────

  async function handleOfferConfirm() {
    if (!confirmState || confirmState.type !== 'offer') return
    const entry = confirmState.entry
    try {
      const res = await fetch('/api/waitlist/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId: entry.id }),
      })
      const json = await res.json() as { success?: boolean; offerMessage?: string; error?: string }
      if (res.status === 409) {
        showToast('Batch is still full', 'error')
      } else if (!res.ok) {
        showToast(json.error ?? 'Failed to offer spot', 'error')
      } else {
        showToast(`Offer sent to ${entry.student_name}`)
        loadAll()
      }
    } catch {
      showToast('Something went wrong', 'error')
    }
    setConfirmState(null)
    setPendingOfferMessage('')
  }

  async function handleRemoveConfirm() {
    if (!confirmState || confirmState.type !== 'remove') return
    const entry = confirmState.entry
    try {
      const res = await fetch('/api/waitlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId: entry.id }),
      })
      if (!res.ok) {
        showToast('Failed to remove from waitlist', 'error')
      } else {
        showToast(`${entry.student_name} removed`)
        loadAll()
      }
    } catch {
      showToast('Something went wrong', 'error')
    }
    setConfirmState(null)
  }

  async function handleWithdrawConfirm() {
    if (!confirmState || confirmState.type !== 'withdraw') return
    const entry = confirmState.entry
    try {
      const supabase = createClient()
      await supabase.from('waitlist').update({ status: 'waiting', notified_at: null }).eq('id', entry.id)
      showToast(`${entry.student_name} moved back to waiting`)
      loadAll()
    } catch {
      showToast('Something went wrong', 'error')
    }
    setConfirmState(null)
  }

  async function handleReaddConfirm() {
    if (!confirmState || confirmState.type !== 'readd') return
    const entry = confirmState.entry
    try {
      const res = await fetch('/api/waitlist/readd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId: entry.id }),
      })
      if (!res.ok) {
        showToast('Failed to re-add to waitlist', 'error')
      } else {
        showToast(`${entry.student_name} re-added to waitlist`)
        loadAll()
      }
    } catch {
      showToast('Something went wrong', 'error')
    }
    setConfirmState(null)
  }

  async function handleResend(entry: EnrichedEntry) {
    try {
      const res = await fetch('/api/waitlist/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId: entry.id }),
      })
      const json = await res.json() as { success?: boolean; offerMessage?: string; error?: string }
      if (!res.ok) {
        showToast(json.error ?? 'Failed to resend offer', 'error')
      } else {
        setResendModal({ entry, message: json.offerMessage ?? '' })
        loadAll()
      }
    } catch {
      showToast('Something went wrong', 'error')
    }
  }

  // Pre-fetch offer message when clicking Offer spot
  async function handleOfferClick(entry: EnrichedEntry) {
    setPendingOfferMessage('')
    setConfirmState({ type: 'offer', entry })
    // Try to get preview message
    try {
      const res = await fetch('/api/waitlist/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId: entry.id, previewOnly: true }),
      })
      const json = await res.json() as { offerMessage?: string }
      if (json.offerMessage) setPendingOfferMessage(json.offerMessage)
    } catch { /* preview failed — modal still shows without message */ }
  }

  const TABS: { key: WaitlistTab; label: string; count: number }[] = [
    { key: 'waiting',  label: 'Waiting',  count: waitingEntries.length },
    { key: 'offered',  label: 'Offered',  count: offeredEntries.length },
    { key: 'enrolled', label: 'Enrolled', count: enrolledEntries.length },
    { key: 'expired',  label: 'Expired',  count: expiredEntries.length },
  ]

  const STAT_PILLS = [
    { key: 'waiting'  as WaitlistTab, icon: Clock,          label: 'Waiting',  count: waitingEntries.length,  color: 'text-[#e67700]' },
    { key: 'offered'  as WaitlistTab, icon: RotateCcw,       label: 'Offered',  count: offeredEntries.length,  color: 'text-[#3b5bdb]' },
    { key: 'enrolled' as WaitlistTab, icon: CheckCircle2,    label: 'Enrolled', count: enrolledEntries.length, color: 'text-[#2f9e44]' },
    { key: 'expired'  as WaitlistTab, icon: AlertCircle,     label: 'Expired',  count: expiredEntries.length,  color: 'text-[#6c757d]' },
  ]

  const highlightBatch = searchParams.get('batch')

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-all ${
            toast.type === 'error' ? 'bg-[#c92a2a]' : 'bg-[#1a1a2e]'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em]">Waitlist</h1>
          <p className="text-[#6c757d] text-sm mt-0.5">
            {loading
              ? 'Loading...'
              : waitingEntries.length > 0
                ? `${waitingEntries.length} student${waitingEntries.length !== 1 ? 's' : ''} waiting for a spot`
                : 'No students currently waiting'}
          </p>
        </div>
      </div>

      {/* Summary stat pills */}
      <div className="flex items-center gap-3 flex-wrap">
        {STAT_PILLS.map(({ key, icon: Icon, label, count, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`bg-white border rounded-[10px] px-4 py-3 flex items-center gap-2.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all ${
              activeTab === key
                ? 'border-[#3b5bdb] shadow-[0_0_0_2px_rgba(59,91,219,0.12)]'
                : 'border-[#dee2e6] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
            }`}
          >
            <Icon size={15} className={color} />
            <span className="text-[0.8rem] font-bold text-[#1a1a2e]">{count}</span>
            <span className="text-[0.72rem] text-[#6c757d]">{label}</span>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-3.5 py-1.5 rounded-full text-[0.75rem] font-semibold border transition-all ${
              activeTab === key
                ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                : 'bg-white text-[#6c757d] border-[#dee2e6] hover:border-[#3b5bdb] hover:text-[#3b5bdb]'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <>
          {/* ── Waiting tab ── */}
          {activeTab === 'waiting' && (
            <div className="space-y-5">
              {waitingEntries.length === 0 ? (
                <div className="py-14 text-center bg-white rounded-[18px] border border-[#dee2e6]">
                  <Clock size={32} className="text-[#adb5bd] mx-auto mb-3" />
                  <p className="text-[#6c757d] font-semibold text-sm mb-1">No students waiting</p>
                  <p className="text-[#adb5bd] text-xs max-w-xs mx-auto leading-relaxed">
                    When batches are full, students who message your WhatsApp will appear here.
                  </p>
                </div>
              ) : (
                Array.from(waitingByBatch.entries()).map(([batchId, batchEntries]) => {
                  const batch = batchEntries[0]?.batch ?? null
                  const enrolledCount = batchId ? (enrolledByBatch.get(batchId) ?? 0) : 0
                  const isFull = batch ? enrolledCount >= batch.max_students : false
                  const isHighlighted = highlightBatch && batchId === highlightBatch

                  return (
                    <div
                      key={batchId ?? 'no-batch'}
                      className={`rounded-[14px] border p-4 ${isHighlighted ? 'border-[#3b5bdb] bg-[#edf2ff]/30' : 'border-[#dee2e6] bg-[#f8f9fa]'}`}
                    >
                      {/* Batch group header */}
                      {batch && (
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="text-[0.84rem] font-bold text-[#1a1a2e]">{batch.name}</p>
                            <p className="text-[0.72rem] text-[#6c757d] mt-0.5">
                              {batch.schedule_day} {fmtTime(batch.schedule_time)}
                              {' · '}LKR {batch.monthly_fee.toLocaleString()}/month
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            {isFull ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#c92a2a] inline-block" />
                                Full ({enrolledCount}/{batch.max_students})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#2f9e44] inline-block" />
                                {batch.max_students - enrolledCount} spot{batch.max_students - enrolledCount !== 1 ? 's' : ''} available
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Batch state note */}
                      {batch && (
                        isFull ? (
                          <p className="text-[0.72rem] text-[#e67700] bg-[#fff9db] border border-[#ffec99] rounded-[8px] px-3 py-2 mb-3">
                            Batch is full — offer a spot when a student leaves
                          </p>
                        ) : (
                          <p className="text-[0.72rem] text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[8px] px-3 py-2 mb-3">
                            Spots available — offer to students below
                          </p>
                        )
                      )}

                      {/* Student cards */}
                      <div className="space-y-2.5">
                        {batchEntries.map((entry, idx) => (
                          <WaitingCard
                            key={entry.id}
                            entry={entry}
                            position={idx + 1}
                            enrolledCount={enrolledCount}
                            onOfferClick={handleOfferClick}
                            onRemoveClick={(e) => setConfirmState({ type: 'remove', entry: e })}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── Offered tab ── */}
          {activeTab === 'offered' && (
            <div className="space-y-3">
              {offeredEntries.length === 0 ? (
                <div className="py-14 text-center bg-white rounded-[18px] border border-[#dee2e6]">
                  <RotateCcw size={32} className="text-[#adb5bd] mx-auto mb-3" />
                  <p className="text-[#6c757d] font-semibold text-sm mb-1">No pending offers</p>
                  <p className="text-[#adb5bd] text-xs">Students you offer spots to will appear here.</p>
                </div>
              ) : (
                offeredEntries.map(entry => (
                  <OfferedCard
                    key={entry.id}
                    entry={entry}
                    onResendClick={handleResend}
                    onWithdrawClick={(e) => setConfirmState({ type: 'withdraw', entry: e })}
                  />
                ))
              )}
            </div>
          )}

          {/* ── Enrolled tab ── */}
          {activeTab === 'enrolled' && (
            <div className="space-y-3">
              {enrolledEntries.length === 0 ? (
                <div className="py-14 text-center bg-white rounded-[18px] border border-[#dee2e6]">
                  <CheckCircle2 size={32} className="text-[#adb5bd] mx-auto mb-3" />
                  <p className="text-[#6c757d] font-semibold text-sm">No waitlist enrollments yet.</p>
                </div>
              ) : (
                enrolledEntries.map(entry => (
                  <EnrolledCard
                    key={entry.id}
                    entry={entry}
                    onViewStudents={() => router.push('/students')}
                  />
                ))
              )}
            </div>
          )}

          {/* ── Expired tab ── */}
          {activeTab === 'expired' && (
            <div className="space-y-3">
              {expiredEntries.length === 0 ? (
                <div className="py-14 text-center bg-white rounded-[18px] border border-[#dee2e6]">
                  <AlertCircle size={32} className="text-[#adb5bd] mx-auto mb-3" />
                  <p className="text-[#6c757d] font-semibold text-sm">No expired entries.</p>
                </div>
              ) : (
                expiredEntries.map(entry => (
                  <ExpiredCard
                    key={entry.id}
                    entry={entry}
                    onReaddClick={(e) => setConfirmState({ type: 'readd', entry: e })}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ── Confirm modals ── */}
      {confirmState?.type === 'offer' && (
        <OfferModal
          entry={confirmState.entry}
          offerMessage={pendingOfferMessage}
          onConfirm={handleOfferConfirm}
          onCancel={() => { setConfirmState(null); setPendingOfferMessage('') }}
        />
      )}
      {confirmState?.type === 'remove' && (
        <RemoveModal
          entry={confirmState.entry}
          onConfirm={handleRemoveConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
      {confirmState?.type === 'withdraw' && (
        <RemoveModal
          entry={confirmState.entry}
          onConfirm={handleWithdrawConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
      {confirmState?.type === 'readd' && (
        <ReaddModal
          entry={confirmState.entry}
          onConfirm={handleReaddConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
      {resendModal && (
        <ResendModal
          entry={resendModal.entry}
          message={resendModal.message}
          onClose={() => setResendModal(null)}
        />
      )}

    </div>
  )
}
