'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Session } from '@/app/(app)/sessions/page'
import { formatTime } from '@/app/(app)/sessions/page'

// ── Props ──────────────────────────────────────────────────────────────────

interface SessionCalendarProps {
  sessions: Session[]
  weekOffset: number
  onWeekChange: (dir: 1 | -1) => void
  onSelect: (session: Session) => void
}

// ── Constants ──────────────────────────────────────────────────────────────

const HOUR_PX = 80
const SLOT_PX = 40   // 30 min
const START_HOUR = 6  // 6 AM
const END_HOUR = 22   // 10 PM

// Generate 30-min slots from 6:00 to 22:00
const TIME_SLOTS: string[] = []
for (let h = START_HOUR; h <= END_HOUR; h++) {
  TIME_SLOTS.push(`${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`)
  if (h < END_HOUR) {
    TIME_SLOTS.push(`${h % 12 === 0 ? 12 : h % 12}:30 ${h < 12 ? 'AM' : 'PM'}`)
  }
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekDays(offset: number): Date[] {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function topPx(scheduledAt: string): number {
  const dt = new Date(scheduledAt)
  const minutesFromStart = (dt.getHours() - START_HOUR) * 60 + dt.getMinutes()
  return Math.max(0, (minutesFromStart / 30) * SLOT_PX)
}

function heightPx(durationMins: number): number {
  return Math.max(36, (durationMins / 30) * SLOT_PX - 4)
}

function isInDay(session: Session, day: Date): boolean {
  const d = new Date(session.scheduled_at)
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  )
}

function sessionBlockStyle(session: Session): { bg: string; borderColor: string; textColor: string } {
  if (session.status === 'cancelled') {
    return { bg: '#f1f3f5', borderColor: '#ced4da', textColor: '#adb5bd' }
  }
  if (session.session_type === 'batch') {
    return { bg: '#ebfbee', borderColor: '#2f9e44', textColor: '#2f9e44' }
  }
  return { bg: '#edf2ff', borderColor: '#3b5bdb', textColor: '#3b5bdb' }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SessionCalendar({
  sessions,
  weekOffset,
  onWeekChange,
  onSelect,
}: SessionCalendarProps) {
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowTop, setNowTop] = useState<number | null>(null)
  const todayStr = new Date().toISOString().split('T')[0]

  // Today column index
  const todayColIdx = weekDays.findIndex(
    d => d.toISOString().split('T')[0] === todayStr
  )

  // Update current time line every minute
  useEffect(() => {
    function calcNow() {
      const now = new Date()
      const h = now.getHours()
      const m = now.getMinutes()
      if (h < START_HOUR || h > END_HOUR) {
        setNowTop(null)
        return
      }
      const mins = (h - START_HOUR) * 60 + m
      setNowTop((mins / 30) * SLOT_PX)
    }
    calcNow()
    const interval = setInterval(calcNow, 60000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && nowTop !== null) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 80)
    }
  }, [nowTop])

  // Week label
  const mon = weekDays[0]
  const sun = weekDays[6]
  const weekLabel = `${mon.getDate()} ${mon.toLocaleString('en-LK', { month: 'short' })} – ${sun.getDate()} ${sun.toLocaleString('en-LK', { month: 'short' })} ${sun.getFullYear()}`

  const totalSlots = TIME_SLOTS.length
  const gridHeight = totalSlots * SLOT_PX

  return (
    <div className="bg-white border border-[#dee2e6] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#dee2e6]">
        <button
          onClick={() => onWeekChange(-1)}
          className="w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:border-[#3b5bdb] hover:bg-[#edf2ff] transition-all"
        >
          <ChevronLeft size={14} className="text-[#6c757d]" />
        </button>
        <span className="text-[0.82rem] font-semibold text-[#343a40]">{weekLabel}</span>
        <button
          onClick={() => onWeekChange(1)}
          className="w-8 h-8 rounded-[8px] border border-[#dee2e6] bg-white flex items-center justify-center hover:border-[#3b5bdb] hover:bg-[#edf2ff] transition-all"
        >
          <ChevronRight size={14} className="text-[#6c757d]" />
        </button>
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} className="overflow-auto max-h-[600px]">
        {/* Outer wrapper: time col + 7 day cols */}
        <div className="flex" style={{ minWidth: 600 }}>
          {/* Time labels column */}
          <div className="w-14 flex-shrink-0">
            {/* Empty header cell */}
            <div className="h-10 border-b border-[#f1f3f5]" />
            {/* Time slots */}
            <div className="relative" style={{ height: gridHeight }}>
              {TIME_SLOTS.map((label, i) => (
                <div
                  key={i}
                  className="absolute right-2 text-[0.58rem] text-[#adb5bd] font-mono leading-none"
                  style={{ top: i * SLOT_PX - 6 }}
                >
                  {i % 2 === 0 ? label.split(':')[0] + (label.includes('AM') ? 'am' : 'pm') : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {weekDays.map((day, colIdx) => {
            const isToday = colIdx === todayColIdx
            const dayStr = day.toISOString().split('T')[0]
            const daySessions = sessions.filter(s => isInDay(s, day))

            return (
              <div key={colIdx} className="flex-1 min-w-[72px]">
                {/* Day header */}
                <div
                  className={`h-10 flex flex-col items-center justify-center border-b border-[#f1f3f5] border-l border-l-[#f1f3f5] ${
                    isToday ? 'bg-[#edf2ff]' : ''
                  }`}
                >
                  <span
                    className={`text-[0.58rem] font-bold uppercase tracking-wide ${
                      isToday ? 'text-[#3b5bdb]' : 'text-[#adb5bd]'
                    }`}
                  >
                    {DAY_NAMES[colIdx]}
                  </span>
                  <span
                    className={`text-[0.78rem] font-extrabold leading-tight ${
                      isToday ? 'text-[#3b5bdb]' : 'text-[#6c757d]'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {/* Grid rows */}
                <div className="relative border-l border-[#f1f3f5]" style={{ height: gridHeight }}>
                  {/* Grid lines */}
                  {TIME_SLOTS.map((_, i) => (
                    <div
                      key={i}
                      className={`absolute left-0 right-0 border-b ${
                        i % 2 === 0 ? 'border-[#f1f3f5]' : 'border-[rgba(241,243,245,0.5)]'
                      }`}
                      style={{ top: i * SLOT_PX, height: SLOT_PX }}
                    />
                  ))}

                  {/* Current time line (today only) */}
                  {isToday && nowTop !== null && (
                    <div
                      className="absolute left-0 right-0 z-10 pointer-events-none"
                      style={{ top: nowTop }}
                    >
                      <div className="relative flex items-center">
                        <div className="w-2 h-2 rounded-full bg-[#c92a2a] flex-shrink-0 -ml-1" />
                        <div className="flex-1 h-[1.5px] bg-[#c92a2a]" />
                      </div>
                    </div>
                  )}

                  {/* Session blocks */}
                  {daySessions.map(session => {
                    const { bg, borderColor, textColor } = sessionBlockStyle(session)
                    const top = topPx(session.scheduled_at)
                    const height = heightPx(session.duration_mins)
                    const subjectText = session.student?.subject || session.batch?.subject || ''

                    return (
                      <div
                        key={session.id}
                        onClick={() => onSelect(session)}
                        className={`absolute left-1 right-1 rounded-[6px] px-1.5 py-1 cursor-pointer border-l-2 hover:brightness-95 transition-all ${
                          session.status === 'cancelled' ? 'opacity-50' : ''
                        }`}
                        style={{
                          top,
                          height,
                          backgroundColor: bg,
                          borderLeftColor: borderColor,
                          overflow: 'hidden',
                        }}
                        title={`${session.display_name} · ${formatTime(session.scheduled_at)} · ${session.duration_mins} min`}
                      >
                        <p
                          className="text-[0.68rem] font-semibold leading-tight truncate"
                          style={{ color: textColor }}
                        >
                          {session.display_name}
                        </p>
                        {height > 50 && subjectText && (
                          <p
                            className="text-[0.58rem] leading-tight truncate mt-0.5 opacity-70"
                            style={{ color: textColor }}
                          >
                            {subjectText}
                          </p>
                        )}
                        {height > 70 && (
                          <p
                            className="text-[0.55rem] leading-tight mt-0.5 opacity-60"
                            style={{ color: textColor }}
                          >
                            {formatTime(session.scheduled_at)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
