'use client'

// Auth layout — frosted glass navbar + two-column desktop layout.
// Mobile: centered single-column card (existing behaviour).
// Desktop (lg+): fixed left brand/progress panel + scrollable right form area.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GraduationCap, BookOpen, Zap, MessageCircle } from 'lucide-react'
// GraduationCap used in top navbar only

// ── Step config ────────────────────────────────────────────────────────────

const SIGNUP_STEPS = [
  { path: '/signup',             num: 1, label: 'Your Profile',   desc: 'Account and verification'    },
  { path: '/signup/classes',     num: 2, label: 'Your Classes',   desc: 'Subjects, fees and schedule' },
  { path: '/signup/payments',    num: 3, label: 'Payments',       desc: 'How students pay you'        },
  { path: '/signup/preferences', num: 4, label: 'Preferences',    desc: 'WhatsApp and policies'       },
]

function getCurrentStep(pathname: string): number {
  if (pathname.startsWith('/signup/preferences')) return 4
  if (pathname.startsWith('/signup/payments'))    return 3
  if (pathname.startsWith('/signup/classes'))     return 2
  return 1
}

// ── Left panel ─────────────────────────────────────────────────────────────

function LeftPanel({ pathname }: { pathname: string }) {
  const isSignup    = pathname.startsWith('/signup')
  const currentStep = isSignup ? getCurrentStep(pathname) : 0

  return (
    <aside
      className="hidden lg:flex flex-col w-[320px] xl:w-[360px] flex-shrink-0 min-h-full px-8 py-10"
      style={{
        background: 'linear-gradient(160deg, #0e1f3b 0%, #162844 60%, #1a3055 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {isSignup ? (
        <>
          {/* Signup welcome */}
          <div className="mb-8">
            <p className="text-[0.6rem] font-bold text-[rgba(255,255,255,0.3)] font-mono uppercase tracking-widest mb-2">
              Getting started
            </p>
            <h2 className="text-[1.35rem] font-extrabold text-white leading-snug tracking-[-0.02em]">
              Let&apos;s get you<br />set up
            </h2>
            <p className="text-[0.78rem] text-[rgba(255,255,255,0.4)] mt-1.5 leading-relaxed">
              Takes about 3 minutes.
            </p>
          </div>

          {/* Signup step list */}
          <p className="text-[0.6rem] font-bold text-[rgba(255,255,255,0.3)] font-mono uppercase tracking-widest mb-3">
            Setup progress
          </p>

          <nav className="space-y-1 mb-auto">
            {SIGNUP_STEPS.map(step => {
              const done   = step.num < currentStep
              const active = step.num === currentStep
              const future = step.num > currentStep
              return (
                <div
                  key={step.num}
                  className={`flex items-center gap-3.5 px-3 py-2.5 rounded-[10px] transition-colors ${
                    active ? 'bg-[rgba(59,91,219,0.25)]' : ''
                  }`}
                >
                  {/* Step bubble */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      done   ? 'bg-[#3b5bdb] text-white'
                    : active ? 'bg-[#3b5bdb] text-white ring-4 ring-[rgba(59,91,219,0.25)]'
                    :          'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.3)]'
                    }`}
                  >
                    {done ? '✓' : step.num}
                  </div>

                  <div>
                    <p className={`text-sm font-semibold leading-none mb-0.5 ${
                      active ? 'text-white' : done ? 'text-[rgba(255,255,255,0.7)]' : 'text-[rgba(255,255,255,0.3)]'
                    }`}>
                      {step.label}
                    </p>
                    <p className={`text-[0.68rem] leading-tight ${
                      active ? 'text-[#748ffc]' : done ? 'text-[rgba(255,255,255,0.35)]' : 'text-[rgba(255,255,255,0.2)]'
                    }`}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Bottom blurb */}
          <div className="mt-8 pt-6 border-t border-[rgba(255,255,255,0.08)]">
            <p className="text-[0.72rem] text-[rgba(255,255,255,0.35)] leading-relaxed">
              &ldquo;Less admin, more teaching.&rdquo;
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Login page — feature highlights */}
          <div className="mb-auto">
            <p className="text-[0.6rem] font-bold text-[rgba(255,255,255,0.3)] font-mono uppercase tracking-widest mb-2">
              Welcome back
            </p>
            <h2 className="text-[1.35rem] font-extrabold text-white mb-1.5 tracking-[-0.02em] leading-snug">
              Good to see you<br />again
            </h2>
            <p className="text-[0.78rem] text-[rgba(255,255,255,0.4)] mb-8 leading-relaxed">
              Your students are waiting.
            </p>

            <div className="space-y-4">
              {[
                { icon: MessageCircle, text: 'Students book via WhatsApp — no app needed'     },
                { icon: Zap,           text: 'Zoom links sent automatically after payment'    },
                { icon: BookOpen,      text: 'Track attendance, fees and batches in one place' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-[8px] bg-[rgba(59,91,219,0.3)] flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-[#748ffc]" />
                  </span>
                  <p className="text-[0.8rem] text-[rgba(255,255,255,0.55)] leading-relaxed pt-0.5">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[rgba(255,255,255,0.08)]">
            <p className="text-[0.7rem] text-[rgba(255,255,255,0.3)] leading-relaxed">
              &ldquo;Less admin, more teaching.&rdquo;
            </p>
          </div>
        </>
      )}
    </aside>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSignup = pathname?.startsWith('/signup')
  const isLogin  = pathname?.startsWith('/login')
  const hideNav  = isSignup || isLogin

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>

      {/* Frosted-glass navbar */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'saturate(180%) blur(12px)', borderColor: '#e7eaf1' }}
      >
        <div className="max-w-[1160px] mx-auto px-6 flex items-center justify-between h-[64px]">
          <Link
            href="/"
            className="flex items-center gap-[11px] font-extrabold text-[21px] tracking-[-0.025em] text-[#0e1f3b]"
          >
            <span
              className="relative w-9 h-9 rounded-[11px] grid place-items-center text-white"
              style={{
                background: 'linear-gradient(150deg, #6f8bff 0%, #3b5bdb 52%, #2f49b8 100%)',
                boxShadow: '0 6px 14px rgba(59,91,219,0.4), inset 0 1px 0 rgba(255,255,255,0.45)',
              }}
            >
              <GraduationCap size={20} strokeWidth={2.2} />
            </span>
            <span>Smart<span style={{ color: '#3b5bdb' }}>claz</span></span>
          </Link>

          {!hideNav && (
            <div className="flex items-center gap-[14px]">
              <Link
                href="/login"
                className="hidden md:block font-semibold text-[15px] text-[#0e1f3b] hover:text-[#3b5bdb] transition-colors duration-150"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center font-semibold text-[15px] text-white rounded-[10px] px-[18px] py-[10px] transition-all duration-150 hover:-translate-y-px"
                style={{ background: '#3b5bdb', boxShadow: '0 6px 16px rgba(59,91,219,0.28)' }}
              >
                Start Free Trial
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Body: stacked on mobile, side-by-side on desktop */}
      <div className="flex-1 flex flex-col lg:flex-row" style={{ background: '#f6f8fc' }}>

        <LeftPanel pathname={pathname ?? ''} />

        {/* Form area */}
        <main className="flex-1 flex items-start justify-center px-4 py-8 md:py-12 lg:px-10 overflow-y-auto">
          {children}
        </main>

      </div>
    </div>
  )
}
