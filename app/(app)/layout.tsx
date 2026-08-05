'use client'

import { useState, useEffect, useRef } from 'react'
import { signOut } from '@/lib/auth'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Calendar, Layers,
  CreditCard, MessageCircle, Settings, Menu, X, GraduationCap, LogOut,
  Mail, Phone, ChevronRight, ClipboardList, LifeBuoy, Send, ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TutorContext } from '@/lib/contexts/tutor'
import type { SubjectEntry } from '@/lib/types/subjects'

// ---------------------------------------------------------------------------
// Contact Support Modal
// ---------------------------------------------------------------------------
const SUPPORT_TOPICS = [
  'Billing & subscription',
  'WhatsApp bot issue',
  'Student or batch problem',
  'Sessions & scheduling',
  'Payments & verification',
  'Account or login',
  'Feature request',
  'Other',
]

function ContactSupportModal({
  open,
  onClose,
  tutorName,
  tutorEmail,
}: {
  open: boolean
  onClose: () => void
  tutorName: string
  tutorEmail: string
}) {
  const [topic,   setTopic]   = useState(SUPPORT_TOPICS[0])
  const [message, setMessage] = useState('')
  const [sent,    setSent]    = useState(false)

  function handleSend() {
    if (!message.trim()) return
    const subject = encodeURIComponent(`[Smartclaz Support] ${topic}`)
    const body = encodeURIComponent(
      `Hi Smartclaz Support,\n\nName: ${tutorName || '(not set)'}\nEmail: ${tutorEmail || '(not set)'}\nTopic: ${topic}\n\n${message.trim()}\n\n---\nSent from Smartclaz dashboard`
    )
    window.open(`mailto:support@smartclaz.com?subject=${subject}&body=${body}`, '_blank')
    setSent(true)
  }

  function handleClose() {
    setTopic(SUPPORT_TOPICS[0])
    setMessage('')
    setSent(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[6px]"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-[440px] bg-white rounded-t-[20px] sm:rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">

        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-[38px] h-1 rounded-full bg-[#ced4da]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f1f3f5]">
          <div className="flex items-center gap-2.5">
            {/* Small Smartclaz logo mark */}
            <span
              className="w-7 h-7 rounded-[7px] grid place-items-center text-white flex-shrink-0"
              style={{
                background: 'linear-gradient(150deg, #6f8bff 0%, #3b5bdb 52%, #2f49b8 100%)',
                boxShadow: '0 3px 8px rgba(59,91,219,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              <GraduationCap size={14} strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-[#1a1a2e] font-bold text-[0.9rem] leading-tight">Contact Support</p>
              <p className="text-[#adb5bd] text-[0.68rem]">support@smartclaz.com</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-[#adb5bd] hover:text-[#343a40] transition-colors p-1 rounded-[6px] hover:bg-[#f1f3f5]"
          >
            <X size={15} />
          </button>
        </div>

        {sent ? (
          /* ── Success state ── */
          <div className="px-5 py-8 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#ebfbee] border border-[#b2f2bb] flex items-center justify-center">
              <Send size={20} className="text-[#2f9e44]" />
            </div>
            <div>
              <p className="text-[#1a1a2e] font-bold text-[0.95rem]">Email client opened</p>
              <p className="text-[#6c757d] text-[0.78rem] mt-1 leading-relaxed">
                Your default email app opened with the message pre-filled. Hit Send there to reach our support team.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 px-5 py-2.5 rounded-[10px] bg-[#3b5bdb] text-white text-[0.82rem] font-semibold hover:bg-[#4c6ef5] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <div className="px-5 py-4 space-y-4">

            {/* Topic */}
            <div>
              <label className="block text-[0.72rem] font-bold text-[#343a40] mb-1.5 uppercase tracking-[0.06em]">
                Topic
              </label>
              <div className="relative">
                <select
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  className="w-full appearance-none rounded-[10px] border-[1.5px] border-[#ced4da] bg-white px-3 py-2.5 pr-9 text-[0.82rem] text-[#1a1a2e] font-medium focus:outline-none focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)] transition-all"
                >
                  {SUPPORT_TOPICS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#adb5bd] pointer-events-none" />
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="block text-[0.72rem] font-bold text-[#343a40] mb-1.5 uppercase tracking-[0.06em]">
                Message
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe your issue or question..."
                rows={4}
                className="w-full rounded-[10px] border-[1.5px] border-[#ced4da] bg-white px-3 py-2.5 text-[0.82rem] text-[#1a1a2e] placeholder-[#adb5bd] resize-none focus:outline-none focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.12)] transition-all leading-relaxed"
              />
              <p className="text-[0.68rem] text-[#adb5bd] mt-1">
                Your name and email will be included automatically.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-0.5 pb-1">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-[10px] border-[1.5px] border-[#ced4da] text-[#343a40] text-[0.82rem] font-semibold hover:border-[#3b5bdb] hover:text-[#3b5bdb] hover:bg-[#edf2ff] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#3b5bdb] text-white text-[0.82rem] font-semibold hover:bg-[#4c6ef5] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(59,91,219,0.3)]"
              >
                <Send size={13} />
                Send email
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

const NAV = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/students',  icon: Users,           label: 'Students' },
      { href: '/batches',   icon: Layers,           label: 'Batches' },
      { href: '/sessions',  icon: Calendar,         label: 'Sessions' },
      { href: '/payments',  icon: CreditCard,       label: 'Payments' },
      { href: '/waitlist',  icon: ClipboardList,    label: 'Waitlist' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/chats', icon: MessageCircle, label: 'WhatsApp Chats' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

function Sidebar({
  onClose,
  waitlistCount,
  onContactSupport,
}: {
  onClose?: () => void
  waitlistCount: number
  onContactSupport: () => void
}) {
  const pathname = usePathname()
  return (
    <div className="h-full flex flex-col bg-[#0e1f3b] w-60 overflow-hidden">
      {/* Logo */}
      <div className="h-[68px] px-4 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
        <Link href="/" className="flex items-center gap-[10px]">
          <span
            className="relative w-8 h-8 rounded-[9px] grid place-items-center text-white flex-shrink-0"
            style={{
              background: 'linear-gradient(150deg, #6f8bff 0%, #3b5bdb 52%, #2f49b8 100%)',
              boxShadow: '0 4px 10px rgba(59,91,219,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            <GraduationCap size={17} strokeWidth={2.2} />
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-white font-extrabold text-[15px] tracking-[-0.02em]">
              Smart<span style={{ color: '#748ffc' }}>claz</span>
            </span>
            <span
              className="mt-[4px] text-[0.45rem] font-semibold tracking-[0.06em] uppercase"
              style={{
                background: 'linear-gradient(90deg, #748ffc 0%, rgba(255,255,255,0.35) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Less admin, more teaching
            </span>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors p-1">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {NAV.map(section => (
          <div key={section.label}>
            <p className="text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.12em] font-mono px-2 mb-1.5">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-[8px] text-sm font-medium transition-all duration-150 ${
                      active
                        ? 'bg-[rgba(59,91,219,0.2)] text-[#748ffc] border border-[rgba(59,91,219,0.3)]'
                        : 'text-white/50 hover:bg-white/[0.06] hover:text-white/85 border border-transparent'
                    }`}
                  >
                    <Icon size={15} className="flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                    {href === '/waitlist' && waitlistCount > 0 && (
                      <span className="text-[0.6rem] font-bold bg-[#c92a2a] text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none flex-shrink-0">
                        {waitlistCount > 99 ? '99+' : waitlistCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Contact Support — pinned to bottom */}
      <div className="px-3 pb-4 flex-shrink-0 border-t border-white/[0.06] pt-3">
        <button
          onClick={() => { onClose?.(); onContactSupport() }}
          className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-[8px] text-white/50 hover:bg-white/[0.06] hover:text-white/85 border border-transparent transition-all duration-150 text-sm font-medium"
        >
          <LifeBuoy size={15} className="flex-shrink-0" />
          <span className="flex-1 text-left">Contact Support</span>
        </button>
      </div>

    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open,           setOpen]           = useState(false)
  const [profileOpen,    setProfileOpen]    = useState(false)
  const [supportOpen,    setSupportOpen]    = useState(false)
  const [name,           setName]           = useState('')
  const [email,          setEmail]          = useState('')
  const [phone,          setPhone]          = useState('')
  const [plan,           setPlan]           = useState('')
  const [initial,        setInitial]        = useState('')
  const [subjects,       setSubjects]       = useState<SubjectEntry[]>([])
  const [whatsapp,       setWhatsapp]       = useState('')
  const [tutorId,        setTutorId]        = useState<string | null>(null)
  const [waitlistCount,  setWaitlistCount]  = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      setTutorId(user.id)
      supabase
        .from('tutors')
        .select('name, plan, phone, whatsapp_number, subjects')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setName(data.name ?? '')
            setPlan(data.plan ?? '')
            setPhone(data.phone ?? '')
            setWhatsapp(data.whatsapp_number ?? '')
            setInitial((data.name as string ?? '').charAt(0).toUpperCase())
            setSubjects(Array.isArray(data.subjects) ? data.subjects as SubjectEntry[] : [])
          }
        })
    })
  }, [])

  useEffect(() => {
    if (!tutorId) return
    const supabase = createClient()

    async function loadCount() {
      const { count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', tutorId!)
        .eq('status', 'waiting')
      setWaitlistCount(count ?? 0)
    }
    loadCount()

    const channel = supabase
      .channel('waitlist_badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist', filter: `tutor_id=eq.${tutorId}` }, () => loadCount())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tutorId])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    if (profileOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [profileOpen])

  return (
    <TutorContext.Provider value={{ subjects }}>
    <div className="min-h-screen bg-[#f6f8fc] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-60 z-30">
        <Sidebar waitlistCount={waitlistCount} onContactSupport={() => setSupportOpen(true)} />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-50 h-full w-60">
            <Sidebar onClose={() => setOpen(false)} waitlistCount={waitlistCount} onContactSupport={() => setSupportOpen(true)} />
          </aside>
        </div>
      )}

      {/* Contact Support Modal */}
      <ContactSupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        tutorName={name}
        tutorEmail={email}
      />

      {/* Content */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">

        {/* Topbar — shared mobile + desktop */}
        <header className="h-[60px] px-4 md:px-8 flex items-center justify-between bg-white border-b border-[#e7eaf1] flex-shrink-0 sticky top-0 z-20">
          {/* Left: hamburger (mobile) or empty spacer (desktop) */}
          <button
            onClick={() => setOpen(true)}
            className="md:hidden text-[#6c757d] hover:text-[#1a1a2e] transition-colors"
          >
            <Menu size={20} />
          </button>

          {/* Center logo (mobile only) */}
          <Link href="/dashboard" className="md:hidden flex items-center gap-[9px]">
            <span
              className="w-7 h-7 rounded-[8px] grid place-items-center text-white flex-shrink-0"
              style={{
                background: 'linear-gradient(150deg, #6f8bff 0%, #3b5bdb 52%, #2f49b8 100%)',
                boxShadow: '0 4px 10px rgba(59,91,219,0.4), inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
            >
              <GraduationCap size={15} strokeWidth={2.2} />
            </span>
            <span className="text-[#0e1f3b] font-extrabold text-[15px] tracking-[-0.02em]">
              Smart<span style={{ color: '#3b5bdb' }}>claz</span>
            </span>
          </Link>

          {/* Desktop left spacer */}
          <div className="hidden md:block" />

          {/* Right: profile trigger + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProfileOpen(p => !p)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] hover:bg-[#f1f3f5] transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#3b5bdb] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initial || '?'}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <p className="text-[#1a1a2e] text-[0.8rem] font-semibold">{name || 'My profile'}</p>
                {plan && <p className="text-[#adb5bd] text-[0.65rem] capitalize">{plan} plan</p>}
              </div>
              <ChevronRight size={13} className={`hidden sm:block text-[#adb5bd] transition-transform duration-200 ${profileOpen ? 'rotate-90' : ''}`} />
            </button>

            {/* Dropdown */}
            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-[16px] border border-[#dee2e6] shadow-[0_8px_24px_rgba(0,0,0,0.1),0_3px_8px_rgba(0,0,0,0.05)] z-50 overflow-hidden">

                {/* Profile header */}
                <div className="px-4 py-4 border-b border-[#f1f3f5]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#3b5bdb] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {initial || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#1a1a2e] font-bold text-[0.88rem] truncate">{name || '—'}</p>
                      {plan && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.62rem] font-bold border bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff] capitalize">
                          {plan} plan
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact details */}
                <div className="px-4 py-3 space-y-2 border-b border-[#f1f3f5]">
                  {email && (
                    <div className="flex items-center gap-2.5">
                      <Mail size={13} className="text-[#adb5bd] flex-shrink-0" />
                      <p className="text-[#343a40] text-[0.78rem] truncate">{email}</p>
                    </div>
                  )}
                  {phone && (
                    <div className="flex items-center gap-2.5">
                      <Phone size={13} className="text-[#adb5bd] flex-shrink-0" />
                      <p className="text-[#343a40] text-[0.78rem]">{phone}</p>
                    </div>
                  )}
                  {whatsapp && whatsapp !== phone && (
                    <div className="flex items-center gap-2.5">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#adb5bd] flex-shrink-0 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      <p className="text-[#343a40] text-[0.78rem]">{whatsapp}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-3 py-2.5 space-y-0.5">
                  <Link
                    href="/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[#343a40] text-[0.8rem] font-medium hover:bg-[#f1f3f5] transition-colors w-full"
                  >
                    <Settings size={14} className="text-[#6c757d]" />
                    Edit profile & settings
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[#c92a2a] text-[0.8rem] font-medium hover:bg-[#fff5f5] transition-colors w-full"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>

              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-5 md:p-8 max-w-[1200px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
    </TutorContext.Provider>
  )
}
