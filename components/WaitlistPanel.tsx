'use client'

import { useState, useEffect } from 'react'
import { X, Copy, CheckCircle2 } from 'lucide-react'
import type { Batch, WaitlistEntry } from '@/app/(app)/batches/page'

interface Props {
  batch: Batch
  waitlist: WaitlistEntry[]
  isOpen: boolean
  onClose: () => void
  onUpdated: () => void
}

type ActionState =
  | { type: 'idle' }
  | { type: 'confirm-offer' }
  | { type: 'confirm-remove' }
  | { type: 'loading' }
  | { type: 'offered'; offerMessage: string }
  | { type: 'error'; message: string }

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-[#edf2ff] text-[#3b5bdb] flex items-center justify-center font-bold text-sm flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function WaitlistRow({
  entry,
  onOfferSuccess,
  onRemoveSuccess,
}: {
  entry: WaitlistEntry
  onOfferSuccess: () => void
  onRemoveSuccess: () => void
}) {
  const [state, setState] = useState<ActionState>({ type: 'idle' })
  const [copied, setCopied] = useState(false)

  const waitingSince = new Date(entry.created_at).toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  async function handleOffer() {
    setState({ type: 'loading' })
    try {
      const res = await fetch('/api/waitlist/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId: entry.id }),
      })
      const json = await res.json() as { offerMessage?: string; error?: string }
      if (!res.ok) {
        setState({ type: 'error', message: json.error ?? 'Failed to offer spot' })
        return
      }
      setState({ type: 'offered', offerMessage: json.offerMessage ?? '' })
      onOfferSuccess()
    } catch {
      setState({ type: 'error', message: 'Something went wrong. Please try again.' })
    }
  }

  async function handleRemove() {
    setState({ type: 'loading' })
    try {
      const res = await fetch('/api/waitlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId: entry.id }),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setState({ type: 'error', message: json.error ?? 'Failed to remove from waitlist' })
        return
      }
      onRemoveSuccess()
    } catch {
      setState({ type: 'error', message: 'Something went wrong. Please try again.' })
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border border-[#dee2e6] rounded-[12px] p-4 bg-white">
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={entry.student_name} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.84rem] font-bold text-[#1a1a2e] leading-tight">{entry.student_name}</p>
          <p className="text-[0.72rem] text-[#adb5bd] mt-0.5">{entry.student_whatsapp}</p>
          <p className="text-[0.72rem] text-[#6c757d] mt-0.5">Waiting since: {waitingSince}</p>
        </div>
      </div>

      {state.type === 'idle' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setState({ type: 'confirm-offer' })}
            className="bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] rounded-[8px] px-3 py-1.5 text-[0.72rem] font-semibold hover:bg-[#d3f9d8] transition-colors"
          >
            Offer spot
          </button>
          <button
            type="button"
            onClick={() => setState({ type: 'confirm-remove' })}
            className="bg-[#fff5f5] text-[#c92a2a] border border-[#ffc9c9] rounded-[8px] px-3 py-1.5 text-[0.72rem] font-semibold hover:bg-[#ffe3e3] transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      {state.type === 'confirm-offer' && (
        <div>
          <p className="text-[0.78rem] font-semibold text-[#1a1a2e] mb-2">
            Offer spot to {entry.student_name}?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleOffer}
              className="flex items-center gap-1 bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb] rounded-[8px] px-3 py-1.5 text-[0.72rem] font-semibold hover:bg-[#d3f9d8] transition-colors"
            >
              <CheckCircle2 size={11} />
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setState({ type: 'idle' })}
              className="text-[#6c757d] text-[0.72rem] font-semibold border border-[#dee2e6] rounded-[8px] px-3 py-1.5 hover:border-[#adb5bd] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.type === 'confirm-remove' && (
        <div>
          <p className="text-[0.78rem] font-semibold text-[#1a1a2e] mb-2">
            Remove {entry.student_name} from waitlist?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRemove}
              className="bg-[#fff5f5] text-[#c92a2a] border border-[#ffc9c9] rounded-[8px] px-3 py-1.5 text-[0.72rem] font-semibold hover:bg-[#ffe3e3] transition-colors"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setState({ type: 'idle' })}
              className="text-[#6c757d] text-[0.72rem] font-semibold border border-[#dee2e6] rounded-[8px] px-3 py-1.5 hover:border-[#adb5bd] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.type === 'loading' && (
        <div className="flex items-center gap-2 text-[#adb5bd] text-[0.72rem]">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Processing...
        </div>
      )}

      {state.type === 'offered' && (
        <div>
          <p className="text-[0.72rem] font-semibold text-[#2f9e44] mb-2">Offer sent — message ready to copy</p>
          <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded-[8px] p-3 mb-2">
            <p className="text-[0.72rem] text-[#343a40] font-mono whitespace-pre-wrap break-words leading-relaxed">
              {state.offerMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(state.offerMessage)}
            className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[8px] px-3 py-1.5 hover:bg-[#dbe4ff] transition-colors"
          >
            <Copy size={11} />
            {copied ? 'Copied!' : 'Copy message'}
          </button>
        </div>
      )}

      {state.type === 'error' && (
        <div className="flex items-start gap-2">
          <p className="text-[0.72rem] text-[#c92a2a]">{state.message}</p>
          <button
            type="button"
            onClick={() => setState({ type: 'idle' })}
            className="text-[0.72rem] text-[#3b5bdb] font-semibold hover:underline whitespace-nowrap"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

export default function WaitlistPanel({ batch, waitlist, isOpen, onClose, onUpdated }: Props) {
  const [localWaitlist, setLocalWaitlist] = useState<WaitlistEntry[]>(() =>
    waitlist.filter(w => w.batch_id === batch.id && w.status === 'waiting')
  )

  useEffect(() => {
    if (isOpen) {
      setLocalWaitlist(waitlist.filter(w => w.batch_id === batch.id && w.status === 'waiting'))
    }
  }, [isOpen, waitlist, batch.id])

  if (!isOpen) return null

  function removeEntry(id: string) {
    setLocalWaitlist(prev => prev.filter(e => e.id !== id))
    onUpdated()
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div
        className={`fixed right-0 top-0 h-full w-[400px] max-w-full bg-white z-50 shadow-xl flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex-shrink-0 px-5 py-4 border-b border-[#f1f3f5] flex items-start justify-between gap-3">
          <div>
            <p
              className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-[0.12em] mb-1"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              Waitlist
            </p>
            <h2 className="text-[0.95rem] font-extrabold text-[#1a1a2e] tracking-[-0.02em] leading-tight">
              {batch.name}
            </h2>
            <p className="text-[0.72rem] text-[#6c757d] mt-0.5">
              {localWaitlist.length} student{localWaitlist.length !== 1 ? 's' : ''} waiting
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:text-[#1a1a2e] transition-colors flex-shrink-0 mt-0.5"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {localWaitlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-[0.9rem] font-semibold text-[#1a1a2e] mb-2">No one on the waitlist yet.</p>
              <p className="text-[0.78rem] text-[#6c757d] max-w-[240px] leading-relaxed">
                Students who try to join when the batch is full or closed will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {localWaitlist.map(entry => (
                <WaitlistRow
                  key={entry.id}
                  entry={entry}
                  onOfferSuccess={() => removeEntry(entry.id)}
                  onRemoveSuccess={() => removeEntry(entry.id)}
                />
              ))}
            </div>
          )}
        </div>

        {localWaitlist.length > 0 && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-[#f1f3f5]">
            <p className="text-[0.7rem] text-[#adb5bd] italic text-center">
              Students are offered spots in order of wait time (oldest first)
            </p>
          </div>
        )}
      </div>
    </>
  )
}
