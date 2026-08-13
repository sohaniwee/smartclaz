'use client'

import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'

export default function ManualModeHint({
  onDismiss,
}: {
  tutorId: string
  onDismiss: () => void
}) {
  const [dismissing, setDismissing] = useState(false)

  async function dismiss() {
    setDismissing(true)
    try {
      await fetch('/api/settings/dismiss-manual-hint', { method: 'POST' })
    } finally {
      onDismiss()
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-[12px] border-[1.5px] border-[#dbe4ff] bg-[#edf2ff] px-5 py-4 mb-4">
      <Lightbulb size={19} className="text-[#3b5bdb] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[0.88rem] font-extrabold text-[#3b5bdb] mb-1">
          You&apos;re in manual reminder mode
        </p>
        <p className="text-[0.8rem] text-[#343a40] leading-relaxed">
          Students won&apos;t be messaged automatically about payments. We&apos;ll notify
          <span className="font-semibold"> you</span> when someone&apos;s due or overdue —
          check the &quot;Overdue payments&quot; card below and click{' '}
          <span className="font-semibold">Send reminder</span> whenever you&apos;re ready.
        </p>
        <a
          href="/settings#payments"
          className="inline-block text-[0.75rem] font-bold text-[#3b5bdb] underline mt-2 hover:text-[#4c6ef5]"
        >
          Change this in Settings →
        </a>
      </div>
      <button
        onClick={dismiss}
        disabled={dismissing}
        className="text-[#3b5bdb] hover:text-[#2f49b8] transition-colors p-1 flex-shrink-0 disabled:opacity-50"
      >
        <X size={16} />
      </button>
    </div>
  )
}
