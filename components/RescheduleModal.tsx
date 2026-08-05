'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Session } from '@/app/(app)/sessions/page'
import { formatDate, formatTime } from '@/app/(app)/sessions/page'
import { DateInput, TimeSelect } from '@/components/ui/DateTimeInput'

// ── Props ──────────────────────────────────────────────────────────────────

interface RescheduleModalProps {
  session: Session
  tutorId: string
  onClose: () => void
  onSave: () => void
}

// ── Component ──────────────────────────────────────────────────────────────

export default function RescheduleModal({
  session,
  onClose,
  onSave,
}: RescheduleModalProps) {
  const origDt = new Date(session.scheduled_at)
  const [newDate, setNewDate] = useState(origDt.toISOString().split('T')[0])
  const [newTime, setNewTime] = useState(
    `${String(origDt.getHours()).padStart(2, '0')}:${String(origDt.getMinutes()).padStart(2, '0')}`
  )
  const [notifyStudent, setNotifyStudent] = useState(true)
  const [saving, setSaving] = useState(false)

  const inputBase =
    'w-full border-[1.5px] border-[#ced4da] rounded-[10px] px-3 py-2.5 text-[0.85rem] text-[#1a1a2e] outline-none focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)] bg-white transition-all'

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/sessions/${session.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_date: newDate,
          new_time: newTime,
          notify_student: notifyStudent,
        }),
      })
      onSave()
      onClose()
    } catch {
      // fail silently
    } finally {
      setSaving(false)
    }
  }

  return (
    /* Overlay */
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Modal */}
      <div
        className="bg-white rounded-[18px] w-[400px] max-w-[90vw] shadow-[0_8px_40px_rgba(0,0,0,0.14)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-[#dee2e6]">
          <div>
            <h3 className="text-[1rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em]">
              Reschedule session
            </h3>
            <p className="text-[0.78rem] text-[#6c757d] mt-0.5">
              Currently: {formatDate(session.scheduled_at)} · {formatTime(session.scheduled_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:bg-[#f8f9fa] flex-shrink-0 transition-all"
          >
            <X size={14} className="text-[#6c757d]" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Date + Time */}
          <div>
            <label className="block text-[0.75rem] font-semibold text-[#343a40] mb-1">
              New date &amp; time
            </label>
            <div className="grid grid-cols-2 gap-3">
              <DateInput value={newDate} onChange={setNewDate} />
              <TimeSelect value={newTime} onChange={setNewTime} />
            </div>
          </div>

          {/* Notify */}
          <div>
            <label className="block text-[0.75rem] font-semibold text-[#343a40] mb-2">
              Notify student via WhatsApp?
            </label>
            <div className="space-y-1.5">
              {[
                { value: true, label: 'Yes — bot sends message' },
                { value: false, label: "No — I'll tell them myself" },
              ].map(opt => (
                <label
                  key={String(opt.value)}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      notifyStudent === opt.value
                        ? 'border-[#3b5bdb] bg-[#3b5bdb]'
                        : 'border-[#ced4da] group-hover:border-[#3b5bdb]'
                    }`}
                  >
                    {notifyStudent === opt.value && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white block" />
                    )}
                  </span>
                  <span
                    className="text-[0.82rem] text-[#343a40]"
                    onClick={() => setNotifyStudent(opt.value)}
                  >
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 px-6 pb-6">
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
            {saving ? 'Rescheduling…' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
