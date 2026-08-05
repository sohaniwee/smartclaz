'use client'

// GettingStarted banner — shown on the dashboard until the tutor has added at
// least one student, session, and payment record. Purely presentational for
// sessions/payments (links out to their pages); students get a richer inline
// flow since that's the most common first step. Batches are not a manual
// step here — CSV-imported 'group' students automatically create/link a
// batch on the Batches tab, and tutors can still create batches manually
// from that tab directly.

import Link from 'next/link'
import { Rocket, FileSpreadsheet, MessageCircle, UserPlus } from 'lucide-react'

interface GettingStartedProps {
  studentsDone: boolean
  onAddStudents: () => void
  onCSVUpload: () => void
  onInviteMessage: () => void
  tutorName?: string
  tutorWhatsapp?: string
}

function IconBadge({ icon: Icon }: { icon: typeof FileSpreadsheet }) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{ width: 36, height: 36, borderRadius: 10, background: '#edf2ff' }}
    >
      <Icon size={16} className="text-[#3b5bdb]" strokeWidth={2.2} />
    </div>
  )
}

function ChecklistRow({
  done,
  label,
  sub,
  cta,
  href,
}: {
  done: boolean
  label: string
  sub: string
  cta: string
  href: string
}) {
  return (
    <div className="w-full flex items-center gap-3 border-[1.5px] border-[#dee2e6] bg-white rounded-[12px] px-4 py-3">
      <span
        className="flex items-center justify-center flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold"
        style={
          done
            ? { background: '#ebfbee', color: '#2f9e44', border: '1px solid #b2f2bb' }
            : { background: '#f1f3f5', color: '#adb5bd', border: '1px solid #dee2e6' }
        }
        aria-hidden="true"
      >
        {done ? '✓' : ''}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-[#343a40]"
          style={{ fontSize: '0.82rem' }}
        >
          {label}
        </p>
        <p className="text-[#adb5bd]" style={{ fontSize: '0.7rem' }}>{sub}</p>
      </div>
      {done ? (
        <span className="text-[0.72rem] font-semibold text-[#2f9e44] flex-shrink-0">Done</span>
      ) : (
        <Link
          href={href}
          className="inline-flex items-center text-[0.75rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[100px] px-3 py-1.5 flex-shrink-0 hover:bg-[#dbe4ff] transition-colors"
        >
          {cta}
        </Link>
      )}
    </div>
  )
}

export default function GettingStarted({
  studentsDone,
  onAddStudents,
  onCSVUpload,
  onInviteMessage,
}: GettingStartedProps) {
  return (
    <div
      style={{
        background: '#edf2ff',
        border: '1.5px solid #dbe4ff',
        borderRadius: 14,
        padding: 24,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(150deg, #6f8bff 0%, #3b5bdb 52%, #2f49b8 100%)',
            boxShadow: '0 4px 10px rgba(59,91,219,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
          aria-hidden="true"
        >
          <Rocket size={16} className="text-white" strokeWidth={2.2} />
        </div>
        <h2
          className="font-extrabold text-[#1a1a2e] tracking-[-0.015em]"
          style={{ fontSize: '0.97rem' }}
        >
          Finish setting up your classes
        </h2>
      </div>

      <p className="text-[#343a40] text-sm mb-4 leading-relaxed">
        The Smartclaz app is live — students can already find you on WhatsApp.
      </p>

      {/* ── Students step ───────────────────────────────────────────────── */}
      {studentsDone ? (
        <ChecklistRow
          done
          label="Students added"
          sub="Existing students are on your roster"
          cta=""
          href="/students"
        />
      ) : (
        <>
          <p
            className="font-semibold text-[#343a40] mb-3"
            style={{ fontSize: '0.82rem' }}
          >
            How would you like to add your existing students?
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">

            {/* CSV Upload card — Recommended */}
            <button
              type="button"
              onClick={onCSVUpload}
              className="text-left border-[1.5px] border-[#dee2e6] bg-white rounded-[12px] p-4 hover:border-[#3b5bdb] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(59,91,219,0.1)] group"
            >
              <div className="flex items-start justify-between mb-2">
                <IconBadge icon={FileSpreadsheet} />
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.62rem] font-bold border"
                  style={{ background: '#ebfbee', color: '#2f9e44', borderColor: '#b2f2bb' }}
                >
                  Recommended
                </span>
              </div>
              <p className="font-bold text-[#1a1a2e] mb-0.5 group-hover:text-[#3b5bdb] transition-colors" style={{ fontSize: '0.84rem' }}>
                CSV Upload
              </p>
              <p className="text-[#6c757d] mb-2" style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                Import your spreadsheet
              </p>
              <p className="font-medium" style={{ fontSize: '0.7rem', color: '#adb5bd' }}>
                Best for 10+ students
              </p>
              <div className="mt-3">
                <span className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[100px] px-3 py-1.5">
                  Upload CSV
                </span>
              </div>
            </button>

            {/* Self-join via Smartclaz app card */}
            <button
              type="button"
              onClick={onInviteMessage}
              className="text-left border-[1.5px] border-[#dee2e6] bg-white rounded-[12px] p-4 hover:border-[#3b5bdb] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(59,91,219,0.1)] group"
            >
              <div className="flex items-start justify-between mb-2">
                <IconBadge icon={MessageCircle} />
              </div>
              <p className="font-bold text-[#1a1a2e] mb-0.5 group-hover:text-[#3b5bdb] transition-colors" style={{ fontSize: '0.84rem' }}>
                Self-join via Smartclaz app
              </p>
              <p className="text-[#6c757d] mb-2" style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                Students message you on WhatsApp
              </p>
              <p className="font-medium" style={{ fontSize: '0.7rem', color: '#adb5bd' }}>
                Best for 50+ students
              </p>
              <div className="mt-3">
                <span className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[100px] px-3 py-1.5">
                  Copy invite
                </span>
              </div>
            </button>
          </div>

          {/* Manual option — smaller, full-width horizontal card */}
          <button
            type="button"
            onClick={onAddStudents}
            className="w-full flex items-center gap-3 border-[1.5px] border-[#dee2e6] bg-white rounded-[12px] px-4 py-3 hover:border-[#3b5bdb] transition-all duration-200 group text-left mb-3"
          >
            <IconBadge icon={UserPlus} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#343a40] group-hover:text-[#3b5bdb] transition-colors" style={{ fontSize: '0.82rem' }}>
                Add manually
              </p>
              <p className="text-[#adb5bd]" style={{ fontSize: '0.7rem' }}>
                One student at a time
              </p>
            </div>
            <span className="inline-flex items-center text-[0.75rem] font-semibold text-[#3b5bdb] bg-[#edf2ff] border border-[#dbe4ff] rounded-[100px] px-3 py-1.5 flex-shrink-0">
              Add student
            </span>
          </button>
        </>
      )}

      {/* ── Footer note ─────────────────────────────────────────────────── */}
      <p className="mt-4 text-[#adb5bd]" style={{ fontSize: '0.72rem' }}>
        You can update your teaching profile in Settings anytime.
      </p>
    </div>
  )
}
