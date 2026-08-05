'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Copy, RefreshCw, Send, Users, Link2, ChevronDown,
  AlertTriangle, CheckCircle2, Clock, Package,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import CreateBatchModal from '@/components/CreateBatchModal'
import EditBatchModal from '@/components/EditBatchModal'
import WaitlistPanel from '@/components/WaitlistPanel'

// ── Types ──────────────────────────────────────────────────────────────────

export interface BatchStudent {
  id: string
  name: string
  whatsapp: string
  status: string
  monthly_fee: number
  payment_status: 'paid' | 'pending' | 'overdue' | 'na'
}

export interface Batch {
  id: string
  name: string
  subject: string
  grade: string
  schedule_day: string | null
  schedule_time: string | null
  session_duration_mins: number | null
  monthly_fee: number
  max_students: number
  accepting_new: boolean
  current_zoom_link: string | null
  zoom_link_generated_at: string | null
  status: 'active' | 'paused' | 'inactive'
  created_at: string
  enrolled_count: number
  paid_count: number
  pending_count: number
  collected_lkr: number
  pending_lkr: number
  students: BatchStudent[]
}

export interface WaitlistEntry {
  id: string
  batch_id: string | null
  student_name: string
  student_whatsapp: string
  subject: string
  grade: string
  status: string
  created_at: string
}

interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void>
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

function fmtDuration(mins: number | null): string {
  if (!mins) return ''
  if (mins < 60) return `${mins} mins`
  const h = mins / 60
  return h === Math.floor(h) ? `${h} hour${h !== 1 ? 's' : ''}` : `${h} hours`
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#dee2e6] rounded-[14px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] animate-pulse">
      <div className="flex justify-between mb-4">
        <div className="h-5 w-40 bg-[#f1f3f5] rounded-full" />
        <div className="h-5 w-20 bg-[#f1f3f5] rounded-full" />
      </div>
      <div className="h-3 w-32 bg-[#f1f3f5] rounded-full mb-3" />
      <div className="h-2 w-full bg-[#f1f3f5] rounded-full mb-4" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-8 bg-[#f1f3f5] rounded-[10px]" />
        <div className="h-8 bg-[#f1f3f5] rounded-[10px]" />
      </div>
    </div>
  )
}

// ── Confirm Modal ──────────────────────────────────────────────────────────

function ConfirmModal({
  state,
  onClose,
}: {
  state: ConfirmState
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await state.onConfirm()
    } finally {
      setLoading(false)
      onClose()
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[60]" onClick={onClose} />
      <div className="fixed z-[70] bg-white rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] w-full max-w-sm p-6 bottom-4 left-1/2 -translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <h3 className="font-extrabold text-[#1a1a2e] text-[1rem] mb-2">{state.title}</h3>
        <p className="text-[#6c757d] text-[0.82rem] mb-5">{state.body}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-[#6c757d] text-[0.82rem] font-semibold border border-[#dee2e6] rounded-[10px] py-2.5 hover:border-[#adb5bd] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 text-white text-[0.82rem] font-semibold rounded-[10px] py-2.5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
              state.danger
                ? 'bg-[#c92a2a] hover:bg-[#a61e1e]'
                : 'bg-[#3b5bdb] hover:bg-[#4c6ef5]'
            }`}
          >
            {loading && (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Batch Card ─────────────────────────────────────────────────────────────

function BatchCard({
  batch,
  waitlistCount,
  index,
  onEdit,
  onViewWaitlist,
  onToggleAccepting,
  onOfferSpot,
  showToast,
  reload,
}: {
  batch: Batch
  waitlistCount: number
  index: number
  onEdit: (b: Batch) => void
  onViewWaitlist: (b: Batch) => void
  onToggleAccepting: (b: Batch) => void
  onOfferSpot: (b: Batch) => void
  showToast: (msg: string, type: 'success' | 'error') => void
  reload: () => void
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null)
  const [copyDone, setCopyDone] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const pct = batch.max_students > 0 ? (batch.enrolled_count / batch.max_students) * 100 : 0
  const barColor =
    pct >= 100 ? '#c92a2a' :
    pct >= 80  ? '#c92a2a' :
    pct >= 50  ? '#e67700' :
    '#3b5bdb'

  const isFull = batch.enrolled_count >= batch.max_students

  function statusDot() {
    if (isFull) {
      return <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#c92a2a]"><span className="w-1.5 h-1.5 rounded-full bg-[#c92a2a] inline-block" />Full</span>
    }
    if (!batch.accepting_new) {
      return <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#6c757d]"><span className="w-1.5 h-1.5 rounded-full bg-[#adb5bd] inline-block" />Closed</span>
    }
    if (batch.status === 'paused') {
      return <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#6c757d]"><span className="w-1.5 h-1.5 rounded-full bg-[#adb5bd] inline-block" />Paused</span>
    }
    return <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#2f9e44]"><span className="w-1.5 h-1.5 rounded-full bg-[#2f9e44] inline-block" />Accepting</span>
  }

  function scheduleLabel() {
    if (!batch.schedule_day && !batch.schedule_time) return null
    const parts: string[] = []
    if (batch.schedule_day) parts.push(batch.schedule_day)
    if (batch.schedule_time) parts.push(fmtTime(batch.schedule_time))
    if (batch.session_duration_mins) parts.push(fmtDuration(batch.session_duration_mins))
    return parts.join(' · ')
  }

  async function handleCopyZoom() {
    if (!batch.current_zoom_link) return
    await navigator.clipboard.writeText(batch.current_zoom_link)
    setCopyDone(true)
    showToast('Zoom link copied', 'success')
    setTimeout(() => setCopyDone(false), 2000)
  }

  async function handleGenerateZoom() {
    const res = await fetch(`/api/batches/${batch.id}/zoom`, { method: 'POST' })
    if (res.ok) {
      showToast('Zoom link generated', 'success')
      reload()
    } else {
      showToast('Failed to generate Zoom link', 'error')
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' })
    if (res.status === 409) {
      const json = await res.json() as { error: string; count: number }
      showToast(`Cannot delete: ${json.count} active student${json.count !== 1 ? 's' : ''} enrolled`, 'error')
    } else if (res.ok) {
      showToast('Batch deleted', 'success')
      reload()
    } else {
      showToast('Failed to delete batch', 'error')
    }
  }

  const totalMonthly = batch.monthly_fee * batch.enrolled_count

  return (
    <>
      <div className="bg-white border border-[#dee2e6] rounded-[14px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200">

        {/* Card header */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex-1 min-w-0">
            <h3 className="text-[0.9rem] font-bold text-[#1a1a2e] leading-tight truncate">{batch.name}</h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {statusDot()}
            <button
              type="button"
              onClick={() => onEdit(batch)}
              className="text-[0.72rem] font-semibold text-[#6c757d] border border-[#dee2e6] rounded-[8px] px-2.5 py-1 hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors"
            >
              Edit
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="w-7 h-7 flex items-center justify-center text-[#6c757d] hover:text-[#1a1a2e] hover:bg-[#f1f3f5] rounded-[8px] transition-colors"
              >
                <ChevronDown size={14} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-[12px] border border-[#dee2e6] shadow-[0_8px_24px_rgba(0,0,0,0.1)] z-30 overflow-hidden py-1">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onToggleAccepting(batch) }}
                    className="w-full text-left px-4 py-2 text-[0.8rem] text-[#343a40] hover:bg-[#f8f9fa] transition-colors"
                  >
                    {batch.accepting_new ? 'Stop accepting new students' : 'Start accepting new students'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmModal({
                        title: 'Send reminder to all?',
                        body: `Send a payment reminder WhatsApp message to all ${batch.enrolled_count} students in ${batch.name}.`,
                        confirmLabel: 'Send reminders',
                        onConfirm: async () => {
                          const res = await fetch(`/api/batches/${batch.id}/remind-all`, { method: 'POST' })
                          const json = res.ok ? await res.json() as { sent_count: number } : null
                          if (json) showToast(`Reminders sent to ${json.sent_count} student${json.sent_count !== 1 ? 's' : ''}`, 'success')
                          else showToast('Failed to send reminders', 'error')
                        },
                      })
                    }}
                    className="w-full text-left px-4 py-2 text-[0.8rem] text-[#343a40] hover:bg-[#f8f9fa] transition-colors"
                  >
                    Send reminder to all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmModal({
                        title: 'Mark all as paid?',
                        body: `This will mark all pending payments for ${batch.name} as paid for this month.`,
                        confirmLabel: 'Mark all paid',
                        onConfirm: async () => {
                          const res = await fetch(`/api/batches/${batch.id}/mark-all-paid`, { method: 'POST' })
                          const json = res.ok ? await res.json() as { marked_count: number } : null
                          if (json) { showToast(`${json.marked_count} payment${json.marked_count !== 1 ? 's' : ''} marked as paid`, 'success'); reload() }
                          else showToast('Failed to mark payments', 'error')
                        },
                      })
                    }}
                    className="w-full text-left px-4 py-2 text-[0.8rem] text-[#343a40] hover:bg-[#f8f9fa] transition-colors"
                  >
                    Mark all as paid
                  </button>
                  <div className="border-t border-[#f1f3f5] my-1" />
                  {batch.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmModal({
                          title: 'Pause this batch?',
                          body: 'Students will not receive reminders or Zoom links while the batch is paused.',
                          confirmLabel: 'Pause batch',
                          onConfirm: async () => {
                            const res = await fetch(`/api/batches/${batch.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'paused' }),
                            })
                            if (res.ok) { showToast('Batch paused', 'success'); reload() }
                            else showToast('Failed to pause batch', 'error')
                          },
                        })
                      }}
                      className="w-full text-left px-4 py-2 text-[0.8rem] text-[#e67700] hover:bg-[#fff9db] transition-colors"
                    >
                      Pause batch
                    </button>
                  ) : batch.status === 'paused' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmModal({
                          title: 'Resume this batch?',
                          body: 'The batch will become active again and students will receive reminders and Zoom links as normal.',
                          confirmLabel: 'Resume batch',
                          onConfirm: async () => {
                            const res = await fetch(`/api/batches/${batch.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'active' }),
                            })
                            if (res.ok) { showToast('Batch resumed', 'success'); reload() }
                            else showToast('Failed to resume batch', 'error')
                          },
                        })
                      }}
                      className="w-full text-left px-4 py-2 text-[0.8rem] text-[#2f9e44] hover:bg-[#ebfbee] transition-colors"
                    >
                      Resume batch
                    </button>
                  ) : null}
                  <div className="border-t border-[#f1f3f5] my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmModal({
                        title: `Delete "${batch.name}"?`,
                        body: batch.enrolled_count > 0
                          ? `This batch has ${batch.enrolled_count} enrolled student${batch.enrolled_count !== 1 ? 's' : ''}. You must remove them first before deleting.`
                          : 'This action cannot be undone. All batch data will be permanently deleted.',
                        confirmLabel: 'Delete batch',
                        danger: true,
                        onConfirm: handleDelete,
                      })
                    }}
                    className="w-full text-left px-4 py-2 text-[0.8rem] text-[#c92a2a] hover:bg-[#fff5f5] transition-colors"
                  >
                    Delete batch
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Schedule */}
        {scheduleLabel() && (
          <p className="text-[0.72rem] text-[#6c757d] mb-3">{scheduleLabel()}</p>
        )}

        {/* Capacity bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.7rem] text-[#6c757d]">
              {isFull
                ? `${batch.enrolled_count}/${batch.max_students} · Full`
                : `${batch.enrolled_count} student${batch.enrolled_count !== 1 ? 's' : ''} · ${batch.max_students - batch.enrolled_count} spot${batch.max_students - batch.enrolled_count !== 1 ? 's' : ''} left`
              }
            </span>
            {isFull && <span className="text-[0.68rem] font-bold text-[#c92a2a]">Full</span>}
          </div>
          <div className="h-2 bg-[#e9ecef] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
            />
          </div>
        </div>

        {/* Fee section */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[0.7rem] text-[#adb5bd]">LKR {batch.monthly_fee.toLocaleString()}/student</p>
            <p className="text-[1.05rem] font-extrabold text-[#3b5bdb] tracking-[-0.03em] leading-tight">
              LKR {totalMonthly.toLocaleString()}
              <span className="text-[0.7rem] font-semibold text-[#adb5bd] ml-1">/month total</span>
            </p>
          </div>

          {/* Payment status */}
          <div className="text-right">
            <div className="flex items-center gap-3 justify-end text-[0.7rem] mb-0.5">
              <span className="flex items-center gap-1 text-[#2f9e44] font-semibold">
                <CheckCircle2 size={11} />
                {batch.paid_count} paid
              </span>
              <span className="flex items-center gap-1 text-[#e67700] font-semibold">
                <Clock size={11} />
                {batch.pending_count} pending
              </span>
            </div>
            <p className="text-[0.68rem] text-[#adb5bd]">
              LKR {batch.collected_lkr.toLocaleString()} collected
            </p>
          </div>
        </div>

        {/* Zoom link section */}
        <div className="mb-4 p-3 bg-[#f8f9fa] rounded-[10px] border border-[#e9ecef]">
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={12} className="text-[#adb5bd] flex-shrink-0" />
            <span className="text-[0.65rem] font-bold text-[#adb5bd] uppercase tracking-[0.08em] font-mono">Zoom Link</span>
          </div>
          {batch.current_zoom_link ? (
            <div>
              <p className="text-[0.72rem] text-[#3b5bdb] font-mono mb-2 truncate">
                {batch.current_zoom_link.length > 38
                  ? batch.current_zoom_link.slice(0, 35) + '...'
                  : batch.current_zoom_link}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyZoom}
                  className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[6px] px-2.5 py-1 hover:bg-[#dbe4ff] transition-colors"
                >
                  <Copy size={10} />
                  {copyDone ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmModal({
                    title: 'Refresh Zoom link?',
                    body: 'This will generate a new Zoom link. The old link will stop working immediately.',
                    confirmLabel: 'Refresh link',
                    onConfirm: handleGenerateZoom,
                  })}
                  className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#6c757d] border border-[#dee2e6] rounded-[6px] px-2.5 py-1 hover:border-[#adb5bd] transition-colors"
                >
                  <RefreshCw size={10} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmModal({
                    title: `Send Zoom link to paid students?`,
                    body: `This will send the Zoom link to all ${batch.paid_count} paid student${batch.paid_count !== 1 ? 's' : ''} in ${batch.name} via WhatsApp.`,
                    confirmLabel: `Send to ${batch.paid_count} student${batch.paid_count !== 1 ? 's' : ''}`,
                    onConfirm: async () => {
                      const res = await fetch(`/api/batches/${batch.id}/send-zoom`, { method: 'POST' })
                      const json = res.ok ? await res.json() as { sent_count: number } : null
                      if (json) showToast(`Zoom link sent to ${json.sent_count} student${json.sent_count !== 1 ? 's' : ''}`, 'success')
                      else showToast('Failed to send Zoom link', 'error')
                    },
                  })}
                  className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#6c757d] border border-[#dee2e6] rounded-[6px] px-2.5 py-1 hover:border-[#adb5bd] transition-colors"
                >
                  <Send size={10} />
                  Send all
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-[0.72rem] text-[#adb5bd]">No Zoom link set</p>
              <button
                type="button"
                onClick={handleGenerateZoom}
                className="flex items-center gap-1 text-[0.7rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[6px] px-2.5 py-1 hover:bg-[#dbe4ff] transition-colors"
              >
                <Plus size={10} />
                Generate link
              </button>
            </div>
          )}
        </div>

        {/* Waitlist opportunity banner */}
        {waitlistCount > 0 && !isFull && (
          <div className="mb-4 px-3 py-2.5 bg-[#edf2ff] border border-[#dbe4ff] rounded-[10px] flex items-center justify-between gap-3">
            <p className="text-[0.75rem] text-[#3b5bdb] font-semibold">
              {waitlistCount} student{waitlistCount !== 1 ? 's' : ''} waiting for a spot
            </p>
            <button
              type="button"
              onClick={() => onOfferSpot(batch)}
              className="text-[0.72rem] font-bold text-[#3b5bdb] hover:underline whitespace-nowrap"
            >
              Offer spot →
            </button>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => router.push(`/students?batch=${batch.id}`)}
            className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-full px-3.5 py-1.5 hover:bg-[#dbe4ff] transition-colors"
          >
            <Users size={11} />
            View students
          </button>
          <button
            type="button"
            onClick={() => onViewWaitlist(batch)}
            className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-white bg-[#7048e8] rounded-full px-3.5 py-1.5 hover:bg-[#6741d9] transition-colors"
          >
            <Clock size={11} />
            Waitlist ({waitlistCount})
          </button>
        </div>
      </div>

      {confirmModal && (
        <ConfirmModal
          state={confirmModal}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function BatchesPage() {
  const router = useRouter()
  const [batches, setBatches]           = useState<Batch[]>([])
  const [waitlist, setWaitlist]         = useState<WaitlistEntry[]>([])
  const [loading, setLoading]           = useState(true)
  const [createOpen, setCreateOpen]     = useState(false)
  const [editBatch, setEditBatch]       = useState<Batch | null>(null)
  const [waitlistBatch, setWaitlistBatch] = useState<Batch | null>(null)
  const [toast, setToast]               = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [tutorId, setTutorId]           = useState<string | null>(null)
  const toastTimer                      = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch('/api/batches')
      if (!res.ok) {
        showToast('Failed to load batches', 'error')
        return
      }
      const json = await res.json() as { batches: Batch[]; waitlist: WaitlistEntry[] }
      setBatches(json.batches ?? [])
      setWaitlist(json.waitlist ?? [])
    } catch {
      showToast('Failed to load batches', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setTutorId(user.id)
      loadAll()
    })
  }, [loadAll])

  // Realtime subscriptions
  useEffect(() => {
    if (!tutorId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`batches-rt-${tutorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `tutor_id=eq.${tutorId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `tutor_id=eq.${tutorId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist', filter: `tutor_id=eq.${tutorId}` }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tutorId, loadAll])

  async function toggleAccepting(batch: Batch) {
    const newValue = !batch.accepting_new
    setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, accepting_new: newValue } : b))
    const res = await fetch(`/api/batches/${batch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepting_new: newValue }),
    })
    if (!res.ok) {
      setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, accepting_new: !newValue } : b))
      showToast('Failed to update', 'error')
    } else {
      showToast(newValue ? 'Now accepting new students' : 'Closed to new students', 'success')
    }
  }

  // Derived stats
  const totalEnrolled    = batches.reduce((s, b) => s + b.enrolled_count, 0)
  const totalMonthly     = batches.reduce((s, b) => s + b.monthly_fee * b.enrolled_count, 0)
  const totalWaitlist    = waitlist.filter(w => w.status === 'waiting').length

  const grouped = batches.reduce((acc, b) => {
    const key = `${b.subject}||${b.grade}`
    if (!acc[key]) acc[key] = []
    acc[key].push(b)
    return acc
  }, {} as Record<string, Batch[]>)

  // Unscheduled active batches
  const unscheduled = batches.filter(b => b.status !== 'inactive' && (!b.schedule_day || !b.schedule_time))

  const waitlistCountForBatch = (batchId: string) =>
    waitlist.filter(w => w.batch_id === batchId && w.status === 'waiting').length

  return (
    <div className="min-h-screen">

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

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[1.5rem] font-extrabold text-[#1a1a2e] tracking-[-0.025em]">Batches</h1>
          <p className="text-[#6c757d] text-sm mt-0.5">
            {loading ? 'Loading...' : `${batches.length} batch${batches.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#3b5bdb] hover:bg-[#4c6ef5] px-4 py-2 rounded-[10px] shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:-translate-y-px transition-all"
        >
          <Plus size={15} />
          Create batch
        </button>
      </div>

      {/* Summary strip */}
      {!loading && batches.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <div className="bg-white border border-[#dee2e6] rounded-[10px] px-4 py-3 flex items-center gap-2">
            <div className="bg-[#edf2ff] rounded-[8px] p-1.5">
              <Package size={13} className="text-[#3b5bdb]" />
            </div>
            <span className="text-[0.8rem] font-bold text-[#1a1a2e]">{batches.length}</span>
            <span className="text-[0.75rem] text-[#6c757d]">Batch{batches.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="bg-white border border-[#dee2e6] rounded-[10px] px-4 py-3 flex items-center gap-2">
            <div className="bg-[#edf2ff] rounded-[8px] p-1.5">
              <Users size={13} className="text-[#3b5bdb]" />
            </div>
            <span className="text-[0.8rem] font-bold text-[#1a1a2e]">{totalEnrolled}</span>
            <span className="text-[0.75rem] text-[#6c757d]">Students enrolled</span>
          </div>
          <div className="bg-white border border-[#dee2e6] rounded-[10px] px-4 py-3 flex items-center gap-2">
            <div className="bg-[#edf2ff] rounded-[8px] p-1.5">
              <span className="text-[0.6rem] font-bold text-[#3b5bdb] font-mono">LKR</span>
            </div>
            <span className="text-[0.8rem] font-bold text-[#3b5bdb]">LKR {totalMonthly.toLocaleString()}</span>
            <span className="text-[0.75rem] text-[#6c757d]">/month</span>
          </div>
          {totalWaitlist > 0 && (
            <div className="bg-white border border-[#dee2e6] rounded-[10px] px-4 py-3 flex items-center gap-2">
              <div className="bg-[#f3f0ff] rounded-[8px] p-1.5">
                <Clock size={13} className="text-[#7048e8]" />
              </div>
              <span className="text-[0.8rem] font-bold text-[#1a1a2e]">{totalWaitlist}</span>
              <span className="text-[0.75rem] text-[#6c757d]">Waitlist</span>
            </div>
          )}
        </div>
      )}

      {/* Unscheduled banner */}
      {!loading && unscheduled.length > 0 && (
        <div className="bg-[#fff9db] border border-[#ffec99] rounded-[12px] p-4 mb-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={15} className="text-[#e67700] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[0.8rem] font-bold text-[#e67700] mb-1">
                {unscheduled.length} batch{unscheduled.length !== 1 ? 'es' : ''} without a schedule
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {unscheduled.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setEditBatch(b)}
                    className="text-[0.75rem] font-semibold text-[#e67700] hover:underline"
                  >
                    {b.name} <span className="text-[#adb5bd] font-normal">Set schedule →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">📦</div>
          <h2 className="text-[1.1rem] font-bold text-[#1a1a2e] mb-2">No batch classes yet</h2>
          <p className="text-[#6c757d] text-sm max-w-xs mb-6">
            Create your first batch to start managing group classes, collecting fees, and sharing Zoom links.
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#3b5bdb] hover:bg-[#4c6ef5] px-5 py-2.5 rounded-[10px] shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:-translate-y-px transition-all"
          >
            <Plus size={15} />
            Create your first batch
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([key, groupBatches]) => {
            const [subject, grade] = key.split('||')
            return (
              <div key={key}>
                {/* Subject + grade header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.84rem] font-extrabold text-[#1a1a2e] tracking-[-0.01em]">
                      {subject}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#edf2ff] text-[#3b5bdb] border border-[#dbe4ff] text-[0.68rem] font-bold">
                      {grade}
                    </span>
                    <span className="text-[0.72rem] text-[#adb5bd] font-medium">
                      {groupBatches.length} batch{groupBatches.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-[#f1f3f5]" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {groupBatches.map((batch, index) => (
                    <BatchCard
                      key={batch.id}
                      batch={batch}
                      waitlistCount={waitlistCountForBatch(batch.id)}
                      index={index}
                      onEdit={setEditBatch}
                      onViewWaitlist={setWaitlistBatch}
                      onToggleAccepting={toggleAccepting}
                      onOfferSpot={(b) => router.push(`/waitlist?batch=${b.id}`)}
                      showToast={showToast}
                      reload={loadAll}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {createOpen && (
        <CreateBatchModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(batch) => {
            setCreateOpen(false)
            showToast(`${batch.name} created`, 'success')
            loadAll()
          }}
        />
      )}

      {editBatch && (
        <EditBatchModal
          batch={editBatch}
          isOpen={!!editBatch}
          onClose={() => setEditBatch(null)}
          onUpdated={(updated) => {
            setBatches(prev => prev.map(b => b.id === updated.id ? updated : b))
            setEditBatch(null)
            showToast(`${updated.name} updated`, 'success')
          }}
        />
      )}

      {waitlistBatch && (
        <WaitlistPanel
          batch={waitlistBatch}
          waitlist={waitlist}
          isOpen={!!waitlistBatch}
          onClose={() => setWaitlistBatch(null)}
          onUpdated={loadAll}
        />
      )}
    </div>
  )
}
