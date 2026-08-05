'use client'

import { useState, useEffect } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Session } from '@/app/(app)/sessions/page'
import { formatDate, formatTime } from '@/app/(app)/sessions/page'
import { DateInput, TimeSelect } from '@/components/ui/DateTimeInput'

// ── Props ──────────────────────────────────────────────────────────────────

interface EditSessionPanelProps {
  session: Session
  tutorId: string
  onClose: () => void
  onSave: (updates: Record<string, unknown>) => void
  onOpenReschedule: (session: Session) => void
  onOpenAttendance: (session: Session) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

const inputBase =
  'w-full border-[1.5px] border-[#ced4da] rounded-[10px] px-3 py-2 text-[0.85rem] text-[#1a1a2e] placeholder:text-[#adb5bd] outline-none focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)] bg-white transition-all'

const labelCls = 'block text-[0.75rem] font-semibold text-[#343a40] mb-1'


// ── Component ──────────────────────────────────────────────────────────────

export default function EditSessionPanel({
  session,
  onClose,
  onSave,
  onOpenReschedule,
  onOpenAttendance,
}: EditSessionPanelProps) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState('60')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDanger, setShowDanger] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [copied, setCopied] = useState(false)

  // Initialize from session
  useEffect(() => {
    const dt = new Date(session.scheduled_at)
    setDate(dt.toISOString().split('T')[0])
    setTime(
      `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    )
    setDuration(String(session.duration_mins ?? 60))
    setNotes(session.notes ?? '')
  }, [session])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const updates: Record<string, unknown> = {}

      // Compare scheduled_at timezone-independently: convert both to UTC ms
      const originalMs = new Date(session.scheduled_at).getTime()
      const newMs = new Date(`${date}T${time}:00`).getTime()
      if (newMs !== originalMs) {
        updates.scheduled_at = new Date(`${date}T${time}:00`).toISOString()
      }

      const newDuration = Number(duration)
      if (newDuration !== (session.duration_mins ?? 60)) {
        updates.duration_mins = newDuration
      }

      const trimmedNotes = notes.trim()
      if (trimmedNotes !== (session.notes ?? '').trim()) {
        updates.notes = trimmedNotes || null
      }

      if (Object.keys(updates).length > 0) {
        const { error, data } = await supabase
          .from('sessions')
          .update(updates)
          .eq('id', session.id)
          .select('id')
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) throw new Error('Could not save — you may not have permission to edit this session.')
      }

      onSave(updates)
      // onClose is intentionally NOT called here — the parent's onSave handler closes the panel
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled', cancelled_reason: cancelReason || null })
        .eq('id', session.id)
      if (error) throw new Error(error.message)
      onSave({ status: 'cancelled', cancelled_reason: cancelReason || null })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel session.')
    } finally {
      setSaving(false)
    }
  }

  function handleCopyZoom() {
    if (session.zoom_link) {
      navigator.clipboard.writeText(session.zoom_link).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-screen w-[420px] max-w-full bg-white z-50 flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.14)] sm:rounded-none rounded-t-[20px] sm:top-0 bottom-0 sm:left-auto left-0 sm:h-screen h-[95vh] sm:w-[420px] w-full">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-[#dee2e6] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em]">Edit Session</h2>
              <p className="text-[0.72rem] text-[#6c757d] mt-0.5 truncate">
                {session.display_name}
                {(session.student?.subject || session.batch?.subject) &&
                  ` · ${session.student?.subject || session.batch?.subject}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:bg-[#f8f9fa] flex-shrink-0 transition-all"
            >
              <X size={14} className="text-[#6c757d]" />
            </button>
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Info chip */}
          <div className="bg-[#f1f3f5] rounded-[10px] px-3 py-2 text-[0.78rem] text-[#6c757d]">
            {formatDate(session.scheduled_at)} · {formatTime(session.scheduled_at)} · {session.duration_mins} min
          </div>

          {/* Zoom link */}
          {session.zoom_link && (
            <div className="bg-[#edf2ff] rounded-[8px] px-3 py-2 flex items-center gap-2">
              <span className="text-base flex-shrink-0">🎥</span>
              <span className="truncate text-[0.75rem] text-[#3b5bdb] flex-1 font-mono">
                {session.zoom_link}
              </span>
              <button
                onClick={handleCopyZoom}
                className="flex-shrink-0 w-7 h-7 rounded-[6px] bg-white border border-[#dbe4ff] flex items-center justify-center hover:border-[#3b5bdb] transition-all"
                title="Copy Zoom link"
              >
                {copied ? <Check size={12} className="text-[#2f9e44]" /> : <Copy size={12} className="text-[#3b5bdb]" />}
              </button>
            </div>
          )}

          {/* Date + Time */}
          <div>
            <label className={labelCls}>Date &amp; Time</label>
            <div className="grid grid-cols-2 gap-3">
              <DateInput value={date} onChange={setDate} />
              <TimeSelect value={time} onChange={setTime} />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className={labelCls}>Duration</label>
            <select
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className={inputBase}
            >
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">120 min</option>
            </select>
          </div>

          {/* Status + attendance hint */}
          <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded-[10px] px-3 py-2.5 flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-[0.72rem] font-semibold text-[#6c757d]">
                Status &amp; attendance are updated directly on the session row.
              </p>
              {session.session_type === 'batch' && (
                <button
                  type="button"
                  onClick={() => { onOpenAttendance(session); onClose() }}
                  className="mt-1 text-[0.72rem] font-semibold text-[#3b5bdb] hover:underline"
                >
                  Open batch attendance panel →
                </button>
              )}
            </div>
          </div>

          {/* Payment status — read-only */}
          {(() => {
            const ps = session.payment?.status ?? session.payment_status
            const pill =
              ps === 'paid'    ? 'bg-[#ebfbee] text-[#2f9e44] border-[#b2f2bb]' :
              ps === 'pending' ? 'bg-[#fff9db] text-[#e67700] border-[#ffec99]' :
              ps === 'overdue' ? 'bg-[#fff5f5] text-[#c92a2a] border-[#ffc9c9]' :
                                 'bg-[#f1f3f5] text-[#adb5bd] border-[#dee2e6]'
            const label =
              ps === 'paid' ? 'Paid' : ps === 'pending' ? 'Pending' : ps === 'overdue' ? 'Overdue' : ps ?? '—'
            return (
              <div className="flex items-center justify-between bg-[#f8f9fa] border border-[#dee2e6] rounded-[10px] px-3 py-2.5">
                <div>
                  <p className="text-[0.72rem] font-semibold text-[#6c757d]">Payment status</p>
                  <p className="text-[0.68rem] text-[#adb5bd] mt-0.5">
                    Manage payments in the{' '}
                    <a href="/payments" className="text-[#3b5bdb] hover:underline">
                      Payments tab
                    </a>
                  </p>
                </div>
                <span className={`rounded-full border text-[0.68rem] font-bold px-2.5 py-0.5 flex-shrink-0 ${pill}`}>
                  {label}
                </span>
              </div>
            )
          })()}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Session notes..."
              className={`${inputBase} resize-none`}
            />
            <p className="text-[0.7rem] text-[#adb5bd] mt-1">Visible only to you</p>
          </div>

          {/* Danger zone */}
          <div>
            <button
              type="button"
              onClick={() => setShowDanger(v => !v)}
              className="text-[0.78rem] font-semibold text-[#6c757d] hover:text-[#c92a2a] transition-colors"
            >
              ⚠️ Session actions {showDanger ? '▴' : '▾'}
            </button>

            {showDanger && (
              <div className="mt-2 bg-[#fff5f5] border border-[#ffc9c9] rounded-[12px] p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => { onOpenReschedule(session); onClose() }}
                  className="w-full border border-[#c92a2a] text-[#c92a2a] rounded-[10px] py-2 text-[0.82rem] font-semibold hover:bg-[#fff5f5] transition-all"
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full border border-[#c92a2a] text-[#c92a2a] rounded-[10px] py-2 text-[0.82rem] font-semibold hover:bg-[#fff5f5] transition-all"
                >
                  Cancel session
                </button>

                {showCancelConfirm && (
                  <div className="space-y-2 pt-2 border-t border-[#ffc9c9]">
                    <p className="text-[0.78rem] text-[#c92a2a] font-semibold">Are you sure?</p>
                    <textarea
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="Reason (optional)"
                      rows={2}
                      className="w-full border border-[#ffc9c9] rounded-[8px] px-2 py-1.5 text-[0.78rem] outline-none focus:border-[#c92a2a] resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={saving}
                        className="flex-1 bg-[#c92a2a] text-white rounded-[8px] py-1.5 text-[0.78rem] font-semibold disabled:opacity-70"
                      >
                        {saving ? 'Cancelling…' : 'Cancel session'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="flex-1 border border-[#dee2e6] rounded-[8px] py-1.5 text-[0.78rem] font-semibold text-[#6c757d] hover:border-[#adb5bd] transition-all"
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#dee2e6] p-4 space-y-3">
          {error && (
            <p className="text-[0.75rem] font-semibold text-[#c92a2a] bg-[#fff5f5] border border-[#ffc9c9] rounded-[8px] px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border-[1.5px] border-[#ced4da] text-[#6c757d] rounded-[10px] py-2.5 text-[0.85rem] font-semibold hover:border-[#adb5bd] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#3b5bdb] text-white rounded-[10px] py-2.5 text-[0.85rem] font-semibold hover:bg-[#4c6ef5] transition-all disabled:opacity-70 shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          </div>
        </div>
      </div>
    </>
  )
}
