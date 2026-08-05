'use client'

import { useState } from 'react'
import { X, Copy, CheckCircle2 } from 'lucide-react'

export interface InviteMessageProps {
  tutorName: string
  tutorWhatsapp: string
  onDone: () => void
  // Allow rendering as a modal (with backdrop) or inline
  open?: boolean
  onClose?: () => void
}

export default function InviteMessage({
  tutorName,
  tutorWhatsapp,
  onDone,
  open,
  onClose,
}: InviteMessageProps) {
  const [copied, setCopied] = useState(false)

  const message = `Hi! 👋

I've set up a new system to manage our classes better.

From now on, class bookings, reminders and updates will be handled automatically.

Please message me on this number to confirm your class details:
📱 ${tutorWhatsapp || 'your WhatsApp number'}

Just say "Hi" and the system will guide you through in seconds ✅

See you in class! 🎓`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that block clipboard
      const el = document.createElement('textarea')
      el.value = message
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Inner content ──────────────────────────────────────────────────────

  const content = (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header (only when modal) */}
      {open !== undefined && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f1f3f5] flex-shrink-0">
          <div>
            <h2
              className="font-extrabold text-[#1a1a2e] tracking-[-0.02em]"
              style={{ fontSize: '1.05rem' }}
            >
              Share with your students
            </h2>
            {tutorName && (
              <p className="text-[#6c757d] text-[0.78rem] mt-0.5">
                From {tutorName}
              </p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#f1f3f5] hover:bg-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:text-[#1a1a2e] transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">

        {/* Section heading (inline usage) */}
        {open === undefined && (
          <h2
            className="font-extrabold text-[#1a1a2e] tracking-[-0.02em]"
            style={{ fontSize: '1.05rem' }}
          >
            Share with your students
          </h2>
        )}

        {/* WhatsApp bubble preview */}
        <div>
          <p className="text-[0.68rem] font-bold text-[#adb5bd] uppercase tracking-[0.12em] font-mono mb-2">
            Message preview
          </p>
          <div
            style={{
              background: '#dcf8c6',
              borderRadius: 12,
              padding: '12px 16px',
              fontSize: '0.875rem',
              lineHeight: '1.6',
              color: '#1a1a2e',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            {message}
          </div>
        </div>

        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className={`w-full flex items-center justify-center gap-2.5 font-semibold text-[0.9rem] py-3 rounded-[100px] transition-all duration-200 ${
            copied
              ? 'bg-[#ebfbee] text-[#2f9e44] border border-[#b2f2bb]'
              : 'bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white shadow-[0_4px_14px_rgba(59,91,219,0.3)] hover:-translate-y-px'
          }`}
        >
          {copied ? (
            <>
              <CheckCircle2 size={16} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={16} />
              Copy message
            </>
          )}
        </button>

        {/* Instructions card */}
        <div
          style={{
            background: '#0e1f3b',
            borderRadius: 14,
            padding: '16px 18px',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          <p
            className="font-bold mb-3"
            style={{ fontSize: '0.82rem', color: '#748ffc' }}
          >
            How it works:
          </p>
          <ol className="space-y-2">
            {[
              'Copy the message above',
              'Paste into your WhatsApp groups or send individually',
              'Students message your number',
              'Smartclaz app guides them: name → subject → fee → payment',
              'All saved automatically ✅',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  style={{
                    background: 'rgba(59,91,219,0.3)',
                    color: '#748ffc',
                    borderRadius: 100,
                    minWidth: 20,
                    height: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: '0.8rem' }}>{step}</span>
              </li>
            ))}
          </ol>
          <p
            className="mt-3 font-semibold"
            style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}
          >
            You do nothing — the Smartclaz app handles everything.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#f1f3f5] flex-shrink-0">
        <button
          type="button"
          onClick={onDone}
          className="w-full flex items-center justify-center gap-2 font-semibold text-[0.84rem] py-2.5 rounded-[100px] border-[1.5px] border-[#dee2e6] text-[#343a40] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )

  // ── Modal wrapper ──────────────────────────────────────────────────────
  if (open !== undefined) {
    if (!open) return null
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[6px]"
          onClick={onClose}
        />
        {/* Panel */}
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="w-full sm:max-w-md bg-white sm:rounded-[20px] rounded-t-[20px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] flex flex-col max-h-[92dvh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle (mobile) */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-[#dee2e6] rounded-full" />
            </div>
            {content}
          </div>
        </div>
      </>
    )
  }

  // Inline usage
  return (
    <div className="bg-white border border-[#dee2e6] rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      {content}
    </div>
  )
}
