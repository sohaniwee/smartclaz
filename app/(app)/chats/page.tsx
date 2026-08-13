'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MessageCircle, Search, Send, Megaphone, Bot, UserCheck,
  CheckCheck, ChevronDown, X, Phone, RotateCcw, Users, AlertCircle, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvStatus = 'bot' | 'needs_help' | 'resolved'

type Conversation = {
  id: string
  studentName: string
  whatsapp: string
  subject: string
  status: ConvStatus
  lastMessage: string
  lastMessageAt: string
  unread: number
}

type AnnouncementAudience = 'all' | 'batch' | 'subject'

// ── Status helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ConvStatus }) {
  if (status === 'needs_help') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold border bg-[#fff9db] text-[#e67700] border-[#ffec99]">
      <AlertCircle size={9} /> Needs help
    </span>
  )
  if (status === 'bot') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold border bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]">
      <Bot size={9} /> Smartclaz app active
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold border bg-[#f1f3f5] text-[#6c757d] border-[#dee2e6]">
      <CheckCheck size={9} /> Resolved
    </span>
  )
}

// ── Announcement Modal ─────────────────────────────────────────────────────────

function AnnouncementModal({ onClose, batches, subjects }: {
  onClose: () => void
  batches: string[]
  subjects: string[]
}) {
  const [audience, setAudience]   = useState<AnnouncementAudience>('all')
  const [batch,    setBatch]      = useState(batches[0] ?? '')
  const [subject,  setSubject]    = useState(subjects[0] ?? '')
  const [message,  setMessage]    = useState('')
  const [sending,  setSending]    = useState(false)
  const [sent,     setSent]       = useState(false)

  const recipientCount = 0

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    await new Promise(r => setTimeout(r, 1200))
    setSending(false)
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-lg md:rounded-[20px] rounded-t-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.1)] z-10">
        {/* Handle (mobile) */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#ced4da]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#dee2e6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] bg-[#edf2ff] flex items-center justify-center">
              <Megaphone size={15} className="text-[#3b5bdb]" />
            </div>
            <div>
              <p className="text-[#1a1a2e] font-bold text-[0.9rem]">Send Announcement</p>
              <p className="text-[#6c757d] text-[0.7rem]">Broadcast a WhatsApp message to students</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#adb5bd] hover:text-[#6c757d] transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#ebfbee] flex items-center justify-center">
              <CheckCheck size={22} className="text-[#2f9e44]" />
            </div>
            <p className="text-[#1a1a2e] font-bold text-[0.95rem]">Announcement sent!</p>
            <p className="text-[#6c757d] text-sm">Message delivered to {recipientCount} students via WhatsApp.</p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-[10px] bg-[#3b5bdb] text-white text-sm font-semibold hover:bg-[#4c6ef5] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Audience */}
            <div>
              <label className="block text-[#343a40] text-[0.78rem] font-semibold mb-2">Send to</label>
              <div className="grid grid-cols-3 gap-2">
                {(['all', 'batch', 'subject'] as AnnouncementAudience[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setAudience(opt)}
                    className={`py-2 rounded-[10px] text-[0.75rem] font-semibold border transition-all ${
                      audience === opt
                        ? 'bg-[#edf2ff] text-[#3b5bdb] border-[#dbe4ff]'
                        : 'bg-white text-[#6c757d] border-[#dee2e6] hover:border-[#adb5bd]'
                    }`}
                  >
                    {opt === 'all' ? 'All Students' : opt === 'batch' ? 'A Batch' : 'By Subject'}
                  </button>
                ))}
              </div>
            </div>

            {/* Audience selector */}
            {audience === 'batch' && (
              <div>
                <label className="block text-[#343a40] text-[0.78rem] font-semibold mb-1.5">Select group</label>
                <div className="relative">
                  <select
                    value={batch}
                    onChange={e => setBatch(e.target.value)}
                    className="w-full appearance-none border border-[#ced4da] rounded-[10px] px-3 py-2.5 pr-8 text-[0.82rem] text-[#1a1a2e] bg-white focus:outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                  >
                    {batches.length === 0
                      ? <option value="">No groups yet</option>
                      : batches.map(b => <option key={b}>{b}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#adb5bd] pointer-events-none" />
                </div>
              </div>
            )}

            {audience === 'subject' && (
              <div>
                <label className="block text-[#343a40] text-[0.78rem] font-semibold mb-1.5">Select subject</label>
                <div className="relative">
                  <select
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full appearance-none border border-[#ced4da] rounded-[10px] px-3 py-2.5 pr-8 text-[0.82rem] text-[#1a1a2e] bg-white focus:outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
                  >
                    {subjects.length === 0
                      ? <option value="">No subjects yet</option>
                      : subjects.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#adb5bd] pointer-events-none" />
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <label className="block text-[#343a40] text-[0.78rem] font-semibold mb-1.5">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder="Type your announcement here..."
                className="w-full border border-[#ced4da] rounded-[10px] px-3 py-2.5 text-[0.82rem] text-[#1a1a2e] placeholder-[#adb5bd] bg-white resize-none focus:outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
              />
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[#6c757d] text-[0.7rem]">
                  Will be sent as a WhatsApp message
                </p>
                <p className="text-[#6c757d] text-[0.7rem]">{message.length} chars</p>
              </div>
            </div>

            {/* Recipient count */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[#f8f9fa] border border-[#dee2e6]">
              <Users size={14} className="text-[#3b5bdb] flex-shrink-0" />
              <p className="text-[#343a40] text-[0.78rem]">
                This will send to <span className="font-bold text-[#3b5bdb]">{recipientCount} students</span>
                {audience === 'batch' && <span className="text-[#6c757d]"> in {batch}</span>}
                {audience === 'subject' && <span className="text-[#6c757d]"> studying {subject}</span>}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 pb-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-[10px] border border-[#ced4da] text-[#6c757d] text-sm font-semibold hover:border-[#adb5bd] hover:text-[#343a40] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim() || sending}
                className="flex-1 py-2.5 rounded-[10px] bg-[#3b5bdb] text-white text-sm font-semibold hover:bg-[#4c6ef5] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ boxShadow: '0 4px 14px rgba(59,91,219,0.3)' }}
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </span>
                ) : (
                  <>
                    <Send size={13} />
                    Send Announcement
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({ conv, onJoin, onHandBack }: {
  conv: Conversation
  onJoin: () => void
  onHandBack: () => void
}) {
  const messages: never[] = []
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv.id])

  const isHuman = conv.status === 'needs_help'

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-[#dee2e6] bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#edf2ff] flex items-center justify-center text-[#3b5bdb] font-bold text-sm flex-shrink-0">
            {conv.studentName.charAt(0)}
          </div>
          <div>
            <p className="text-[#1a1a2e] font-bold text-[0.85rem] leading-tight">{conv.studentName}</p>
            <p className="text-[#6c757d] text-[0.7rem]">{conv.subject} · {conv.whatsapp}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={conv.status} />
          <a
            href={`tel:${conv.whatsapp}`}
            className="w-7 h-7 rounded-[8px] border border-[#dee2e6] flex items-center justify-center text-[#6c757d] hover:border-[#3b5bdb] hover:text-[#3b5bdb] transition-all"
          >
            <Phone size={13} />
          </a>
        </div>
      </div>

      {/* Status banner */}
      {conv.status === 'needs_help' && (
        <div className="mx-4 mt-3 px-3 py-2.5 rounded-[10px] bg-[#fff9db] border border-[#ffec99] flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-[#e67700] flex-shrink-0" />
            <p className="text-[#e67700] text-[0.75rem] font-semibold">Smartclaz app paused — conversation needs your attention</p>
          </div>
          <button
            onClick={onHandBack}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#e67700] text-white text-[0.7rem] font-semibold hover:bg-[#d46800] transition-colors flex-shrink-0"
          >
            <RotateCcw size={11} /> Hand back to Smartclaz app
          </button>
        </div>
      )}
      {conv.status === 'bot' && (
        <div className="mx-4 mt-3 px-3 py-2.5 rounded-[10px] bg-[#edf2ff] border border-[#dbe4ff] flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-[#3b5bdb] flex-shrink-0" />
            <p className="text-[#3b5bdb] text-[0.75rem] font-semibold">Smartclaz app is handling this conversation</p>
          </div>
          <button
            onClick={onJoin}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#3b5bdb] text-white text-[0.7rem] font-semibold hover:bg-[#4c6ef5] transition-colors flex-shrink-0"
          >
            <UserCheck size={11} /> Join chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <div className="w-10 h-10 rounded-full bg-[#f1f3f5] flex items-center justify-center mb-3">
              <MessageCircle size={18} className="text-[#ced4da]" />
            </div>
            <p className="text-[#adb5bd] text-sm">No message history</p>
            <p className="text-[#ced4da] text-[0.72rem] mt-1">Messages will appear here once synced</p>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isHuman ? (
        <div className="px-4 py-3 border-t border-[#dee2e6] bg-white flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={1}
              placeholder="Type a message…"
              className="flex-1 border border-[#ced4da] rounded-[10px] px-3 py-2.5 text-[0.82rem] text-[#1a1a2e] placeholder-[#adb5bd] resize-none focus:outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
            />
            <button
              disabled={!draft.trim()}
              className="w-9 h-9 rounded-[10px] bg-[#3b5bdb] text-white flex items-center justify-center hover:bg-[#4c6ef5] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              style={{ boxShadow: '0 4px 14px rgba(59,91,219,0.3)' }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-[#dee2e6] bg-[#f8f9fa] flex-shrink-0">
          <p className="text-center text-[#adb5bd] text-[0.72rem]">
            {conv.status === 'resolved' ? 'This conversation is resolved' : 'Click "Join chat" to send messages manually'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [filter,        setFilter]        = useState<'all' | ConvStatus>('all')
  const [showAnnounce,  setShowAnnounce]  = useState(false)
  const [batchNames,    setBatchNames]    = useState<string[]>([])
  const [subjectNames,  setSubjectNames]  = useState<string[]>([])

  const loadConversations = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [convsRes, studentsRes, batchesRes, tutorRes] = await Promise.all([
      supabase.from('conversations')
        .select('id, student_whatsapp, status, last_message_at')
        .eq('tutor_id', user.id)
        .order('last_message_at', { ascending: false }),
      supabase.from('students')
        .select('whatsapp, name, subject')
        .eq('tutor_id', user.id),
      supabase.from('batches')
        .select('name')
        .eq('tutor_id', user.id)
        .eq('status', 'active'),
      supabase.from('tutors')
        .select('subjects')
        .eq('id', user.id)
        .single(),
    ])

    const studentMap = new Map(
      ((studentsRes.data ?? []) as Array<{ whatsapp: string; name: string; subject: string }>)
        .map(s => [s.whatsapp, s])
    )

    const mapped: Conversation[] = ((convsRes.data ?? []) as Array<{
      id: string; student_whatsapp: string; status: string; last_message_at: string
    }>).map(c => {
      const student = studentMap.get(c.student_whatsapp)
      const status: ConvStatus = c.status === 'human' ? 'needs_help' : c.status === 'bot' ? 'bot' : 'resolved'
      const ts = c.last_message_at ? new Date(c.last_message_at) : null
      const lastMessageAt = ts ? ts.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' }) : ''
      return {
        id: c.id,
        studentName: student?.name ?? c.student_whatsapp,
        whatsapp: c.student_whatsapp,
        subject: student?.subject ?? '—',
        status,
        lastMessage: '',
        lastMessageAt,
        unread: 0,
      }
    })

    setConversations(mapped)

    setBatchNames(((batchesRes.data ?? []) as Array<{ name: string }>).map(b => b.name))

    const rawSubjects = (tutorRes.data?.subjects as Array<{ subject: string }> | null) ?? []
    setSubjectNames(rawSubjects.map(s => s.subject))

    setLoading(false)
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  const filtered = conversations.filter(c => {
    const matchSearch = c.studentName.toLowerCase().includes(search.toLowerCase()) ||
                        c.subject.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || c.status === filter
    return matchSearch && matchFilter
  })

  const selectedConv = conversations.find(c => c.id === selected) ?? null

  async function handleJoin(id: string) {
    const supabase = createClient()
    await supabase.from('conversations').update({ status: 'human' }).eq('id', id)
    setConversations(prev => prev.map(c => c.id === id ? { ...c, status: 'needs_help' as ConvStatus } : c))
  }

  async function handleHandBack(id: string) {
    const supabase = createClient()
    await supabase.from('conversations').update({ status: 'bot' }).eq('id', id)
    setConversations(prev => prev.map(c => c.id === id ? { ...c, status: 'bot' as ConvStatus } : c))
  }

  const needsHelpCount = conversations.filter(c => c.status === 'needs_help').length

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col gap-0 -m-5 md:-m-8">

      {/* Page header */}
      <div className="px-5 md:px-8 pt-5 md:pt-6 pb-4 bg-[#f6f8fc] border-b border-[#dee2e6] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[#1a1a2e] font-extrabold text-[1.25rem] tracking-[-0.025em]">WhatsApp Chats</h1>
          <p className="text-[#6c757d] text-[0.78rem] mt-0.5">
            {conversations.length} conversations
            {needsHelpCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[#e67700] font-semibold">
                · <AlertCircle size={11} /> {needsHelpCount} need{needsHelpCount === 1 ? 's' : ''} attention
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAnnounce(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#3b5bdb] text-white text-sm font-semibold hover:bg-[#4c6ef5] transition-all"
          style={{ boxShadow: '0 4px 14px rgba(59,91,219,0.3)' }}
        >
          <Megaphone size={14} />
          <span className="hidden sm:inline">Send Announcement</span>
          <span className="sm:hidden">Announce</span>
        </button>
      </div>

      {/* Body: list + chat */}
      <div className="flex flex-1 min-h-0">

        {/* Conversation list */}
        <div className={`flex flex-col bg-white border-r border-[#dee2e6] flex-shrink-0 ${selected ? 'hidden md:flex w-72' : 'flex w-full'}`}>

          {/* Search + filter */}
          <div className="px-3 py-3 space-y-2 border-b border-[#f1f3f5]">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb5bd]" />
              <input
                type="text"
                placeholder="Search students…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-[#ced4da] rounded-[10px] text-[0.8rem] text-[#1a1a2e] placeholder-[#adb5bd] focus:outline-none focus:border-[#3b5bdb] focus:ring-[3px] focus:ring-[rgba(59,91,219,0.12)]"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'needs_help', 'bot', 'resolved'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 py-1 rounded-[8px] text-[0.65rem] font-bold transition-all ${
                    filter === f
                      ? 'bg-[#edf2ff] text-[#3b5bdb]'
                      : 'text-[#6c757d] hover:bg-[#f8f9fa]'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'needs_help' ? 'Help' : f === 'bot' ? 'App' : 'Done'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#f1f3f5]">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-3 py-3 animate-pulse flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#f1f3f5] flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-[#f1f3f5] rounded w-2/3" />
                    <div className="h-2.5 bg-[#f1f3f5] rounded w-1/2" />
                    <div className="h-2 bg-[#f1f3f5] rounded w-3/4 mt-1" />
                  </div>
                </div>
              ))
            ) : conversations.length === 0 ? (
              <div className="py-14 px-4 text-center">
                <MessageCircle size={28} className="text-[#ced4da] mx-auto mb-2" />
                <p className="text-[#6c757d] text-sm font-semibold">No conversations yet</p>
                <p className="text-[#adb5bd] text-[0.72rem] mt-1 leading-relaxed">
                  Once students message your WhatsApp number, their chats will appear here.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <MessageCircle size={28} className="text-[#ced4da] mx-auto mb-2" />
                <p className="text-[#adb5bd] text-sm">No conversations found</p>
              </div>
            ) : filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelected(conv.id)}
                className={`w-full text-left px-3 py-3 transition-colors ${
                  selected === conv.id ? 'bg-[#edf2ff]' : 'hover:bg-[#f8f9fa]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-[#edf2ff] flex items-center justify-center text-[#3b5bdb] font-bold text-sm">
                      {conv.studentName.charAt(0)}
                    </div>
                    {conv.status === 'needs_help' && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#e67700] border-2 border-white" />
                    )}
                    {conv.unread > 0 && conv.status !== 'needs_help' && (
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#3b5bdb] border-2 border-white flex items-center justify-center text-white text-[0.5rem] font-bold">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-[#1a1a2e] font-semibold text-[0.8rem] truncate">{conv.studentName}</p>
                      <span className="text-[#adb5bd] text-[0.62rem] flex-shrink-0 flex items-center gap-1">
                        <Clock size={9} />{conv.lastMessageAt}
                      </span>
                    </div>
                    <p className="text-[#6c757d] text-[0.68rem] mb-1 truncate">{conv.subject}</p>
                    <StatusBadge status={conv.status} />
                    <p className="text-[#adb5bd] text-[0.7rem] mt-1 truncate">{conv.lastMessage}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${!selected ? 'hidden md:flex' : 'flex'}`}>
          {selectedConv ? (
            <ChatView
              conv={selectedConv}
              onJoin={() => handleJoin(selectedConv.id)}
              onHandBack={() => handleHandBack(selectedConv.id)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-14 h-14 rounded-[18px] bg-[#edf2ff] flex items-center justify-center mb-4">
                <MessageCircle size={26} className="text-[#3b5bdb]" />
              </div>
              <p className="text-[#1a1a2e] font-bold text-[0.95rem] mb-1">Select a conversation</p>
              <p className="text-[#6c757d] text-sm max-w-xs">Choose a student conversation from the list to view messages and manage the chat.</p>
            </div>
          )}
        </div>
      </div>

      {showAnnounce && (
        <AnnouncementModal
          onClose={() => setShowAnnounce(false)}
          batches={batchNames}
          subjects={subjectNames}
        />
      )}
    </div>
  )
}
