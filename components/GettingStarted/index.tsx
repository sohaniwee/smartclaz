'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileSpreadsheet, MessageCircle, UserPlus, CheckCircle2 } from 'lucide-react'
import InviteMessage from '@/components/InviteMessage'

interface GettingStartedProps {
  tutor: {
    id: string
    name?: string
    whatsapp_number?: string
    teaching_style?: string
    [key: string]: unknown
  }
  onComplete: () => void
  onCSVUpload: () => void
  onAddStudent: () => void
}

export default function GettingStarted({ tutor, onComplete, onCSVUpload, onAddStudent }: GettingStartedProps) {
  const [showInvite, setShowInvite] = useState(false)
  const [completing, setCompleting] = useState(false)

  async function markDone() {
    if (completing) return
    setCompleting(true)
    const supabase = createClient()
    await supabase.from('tutors').update({ onboarding_complete: true }).eq('id', tutor.id)
    onComplete()
  }

  const hasBatches = tutor.teaching_style === 'group' || tutor.teaching_style === 'both'

  return (
    <div style={{
      background: 'white',
      borderRadius: 18,
      border: '1px solid var(--border)',
      overflow: 'hidden',
      maxWidth: 680,
      margin: '0 auto',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    }}>
      {/* Navy header */}
      <div style={{ background: 'var(--navy)', padding: '24px 32px' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>
          🎉 Your bot is live!
        </div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>
          New students who message you on WhatsApp are handled automatically.
        </div>
      </div>

      <div style={{ padding: '28px 32px' }}>

        {/* What's already done */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink3)', fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Setup complete
          </p>
          {[
            'Subjects & fees configured',
            hasBatches ? 'Group classes created' : null,
            'Availability set',
            'WhatsApp connected',
            'New students handled by bot automatically',
          ].filter(Boolean).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <CheckCircle2 size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', color: 'var(--ink2)' }}>{item}</span>
            </div>
          ))}
        </div>

        {/* One thing left */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>
            Do you have existing students?
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink3)', lineHeight: 1.6 }}>
            Add them to track payments, send reminders and Zoom links.
            New students joining via WhatsApp are added automatically.
          </p>
        </div>

        {/* CSV Upload */}
        <button type="button" onClick={() => { onCSVUpload(); markDone() }}
          className="w-full text-left border-[1.5px] border-[#dee2e6] bg-white rounded-[12px] p-4 hover:border-[#3b5bdb] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(59,91,219,0.1)] group mb-3"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--indigo-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
            <FileSpreadsheet size={16} style={{ color: 'var(--indigo)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>CSV Upload</p>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, background: 'var(--green-pale)', color: 'var(--green)', border: '1px solid var(--green-border)', borderRadius: 100, padding: '2px 8px' }}>Recommended</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Import your spreadsheet — best for 10+ students</p>
          </div>
        </button>

        {/* Smartclaz app self-join */}
        <button type="button" onClick={() => setShowInvite(!showInvite)}
          className="w-full text-left border-[1.5px] border-[#dee2e6] bg-white rounded-[12px] p-4 hover:border-[#3b5bdb] transition-all duration-200 mb-3"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderColor: showInvite ? 'var(--indigo)' : undefined, background: showInvite ? 'var(--indigo-pale)' : undefined }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--indigo-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
            <MessageCircle size={16} style={{ color: 'var(--indigo)' }} />
          </div>
          <div>
            <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>Students self-join via Smartclaz app</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Share an invite — students message you and get added automatically. Best for 50+ students.</p>
          </div>
        </button>

        {showInvite && (
          <div style={{ marginBottom: 16 }}>
            <InviteMessage
              tutorName={tutor.name ?? ''}
              tutorWhatsapp={tutor.whatsapp_number ?? ''}
              onDone={() => { setShowInvite(false); markDone() }}
            />
          </div>
        )}

        {/* Add manually */}
        <button type="button" onClick={() => { onAddStudent(); markDone() }}
          className="w-full text-left border-[1.5px] border-[#dee2e6] bg-white rounded-[12px] px-4 py-3 hover:border-[#3b5bdb] transition-all duration-200 group"
          style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--indigo-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserPlus size={16} style={{ color: 'var(--indigo)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>Add manually</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>Add students one at a time</p>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--indigo)', background: 'var(--indigo-pale)', border: '1px solid var(--indigo-mid)', borderRadius: 100, padding: '5px 14px', flexShrink: 0 }}>
            Add student
          </span>
        </button>

        {/* Skip */}
        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={markDone} disabled={completing}
            style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Skip — I&apos;ll add students later
          </button>
        </div>
      </div>
    </div>
  )
}
