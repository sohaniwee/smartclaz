'use client'

// Shared date picker (calendar popover) + time picker (scrollable list popover).
// Drop-in replacement for all <input type="date"> and TIME_OPTIONS <select> pairs.

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { Calendar, Clock, ChevronLeft, ChevronRight, X } from 'lucide-react'
import 'react-day-picker/dist/style.css'

// ── TIME_OPTIONS — single source of truth ─────────────────────────────────

export const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 5; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break
      const hh   = String(h).padStart(2, '0')
      const mm   = String(m).padStart(2, '0')
      const ampm = h >= 12 ? 'PM' : 'AM'
      const hr   = h % 12 || 12
      opts.push({ value: `${hh}:${mm}`, label: `${hr}:${mm} ${ampm}` })
    }
  }
  return opts
})()

// ── Popover wrapper ───────────────────────────────────────────────────────

function Popover({
  anchorRef,
  open,
  onClose,
  children,
  width = 280,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  // Compute viewport-relative position each time popover opens
  useEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    let left = rect.left
    const top  = rect.bottom + 4
    // Flip left if it would overflow the right edge
    if (left + width > window.innerWidth - 8) left = rect.right - width
    setCoords({ top, left })
  }, [open, anchorRef, width])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (!open) return
    function handle(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!open || !coords) return null

  // Render via portal so overflow:hidden on any ancestor never clips the calendar
  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 9999, minWidth: width }}
      className="bg-white rounded-[14px] border border-[#dee2e6] shadow-[0_8px_24px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)]"
    >
      {children}
    </div>,
    document.body
  )
}

// ── DateInput — calendar popover ──────────────────────────────────────────

export function DateInput({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select date',
  disabled = false,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const parsed    = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const isGood    = parsed && isValid(parsed)
  const minParsed = min ? parse(min, 'yyyy-MM-dd', new Date()) : undefined
  const maxParsed = max ? parse(max, 'yyyy-MM-dd', new Date()) : undefined

  const disabledDays: import('react-day-picker').Matcher | undefined =
    minParsed && maxParsed ? { before: minParsed, after: maxParsed }
    : minParsed            ? { before: minParsed }
    : maxParsed            ? { after: maxParsed }
    : undefined

  const handleSelect = useCallback((day: Date | undefined) => {
    if (day) {
      onChange(format(day, 'yyyy-MM-dd'))
      setOpen(false)
    }
  }, [onChange])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={[
          'flex items-center gap-2 w-full rounded-[10px] border-[1.5px] bg-white',
          'px-3 py-[9px] text-[0.82rem] text-left transition-all outline-none',
          open
            ? 'border-[#3b5bdb] shadow-[0_0_0_3px_rgba(59,91,219,0.12)]'
            : 'border-[#ced4da] hover:border-[#adb5bd]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <Calendar size={14} className="text-[#adb5bd] flex-shrink-0" />
        <span className={`flex-1 ${isGood ? 'text-[#1a1a2e]' : 'text-[#adb5bd]'}`}>
          {isGood ? format(parsed, 'd MMM yyyy') : placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
            className="text-[#adb5bd] hover:text-[#343a40] transition-colors flex-shrink-0"
          >
            <X size={11} />
          </span>
        )}
      </button>

      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={290}>
        <div className="p-3">
          <style>{`
            .rdp { --rdp-cell-size: 34px; --rdp-accent-color: #3b5bdb; --rdp-background-color: #edf2ff; margin: 0; }
            .rdp-day_selected, .rdp-day_selected:hover { background-color: #3b5bdb !important; color: white !important; border-radius: 8px; }
            .rdp-day_today:not(.rdp-day_selected) { border: 1.5px solid #3b5bdb; color: #3b5bdb; font-weight: 700; border-radius: 8px; }
            .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) { background-color: #edf2ff; color: #3b5bdb; border-radius: 8px; }
            .rdp-day_disabled { color: #ced4da !important; cursor: not-allowed; }
            .rdp-day_outside { color: #dee2e6; }
            .rdp-head_cell { font-size: 0.65rem; font-weight: 700; color: #adb5bd; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'JetBrains Mono', monospace; }
            .rdp-caption { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid #f1f3f5; }
            .rdp-caption_label { font-size: 0.85rem; font-weight: 700; color: #1a1a2e; font-family: 'Plus Jakarta Sans', sans-serif; }
            .rdp-nav_button { width: 26px; height: 26px; border-radius: 8px; border: 1.5px solid #dee2e6; background: white; color: #343a40; display: flex; align-items: center; justify-content: center; cursor: pointer; }
            .rdp-nav_button:hover { background: #f1f3f5; }
            .rdp-day { font-size: 0.82rem; font-weight: 500; font-family: 'Plus Jakarta Sans', sans-serif; border-radius: 8px; }
            .rdp-table { border-collapse: separate; border-spacing: 2px; }
          `}</style>
          <DayPicker
            mode="single"
            selected={isGood ? parsed : undefined}
            onSelect={handleSelect}
            disabled={disabledDays}
            showOutsideDays
            components={{
              IconLeft:  () => <ChevronLeft size={13} />,
              IconRight: () => <ChevronRight size={13} />,
            }}
          />
        </div>
      </Popover>
    </div>
  )
}

// ── TimeSelect — scrollable time list popover ─────────────────────────────

const AM_TIMES = TIME_OPTIONS.filter(t => parseInt(t.value.split(':')[0]) < 12)
const PM_TIMES = TIME_OPTIONS.filter(t => parseInt(t.value.split(':')[0]) >= 12)

export function TimeSelect({
  value,
  onChange,
  placeholder = 'Select time',
  disabled = false,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const anchorRef  = useRef<HTMLButtonElement>(null)
  const amListRef  = useRef<HTMLDivElement>(null)
  const pmListRef  = useRef<HTMLDivElement>(null)

  const selected = TIME_OPTIONS.find(t => t.value === value)
  const isAm = value ? parseInt(value.split(':')[0]) < 12 : false

  // Scroll selected item into view on open
  useEffect(() => {
    if (!open) return
    const targetRef = isAm ? amListRef : pmListRef
    if (targetRef.current) {
      const sel = targetRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
      if (sel) {
        targetRef.current.scrollTop = sel.offsetTop - targetRef.current.clientHeight / 2 + sel.clientHeight / 2
      }
    }
  }, [open, isAm])

  const handleSelect = useCallback((val: string) => {
    onChange(val)
    setOpen(false)
  }, [onChange])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={[
          'flex items-center gap-2 w-full rounded-[10px] border-[1.5px] bg-white',
          'px-3 py-[9px] text-[0.82rem] text-left transition-all outline-none',
          open
            ? 'border-[#3b5bdb] shadow-[0_0_0_3px_rgba(59,91,219,0.12)]'
            : 'border-[#ced4da] hover:border-[#adb5bd]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <Clock size={14} className="text-[#adb5bd] flex-shrink-0" />
        <span className={`flex-1 ${selected ? 'text-[#1a1a2e]' : 'text-[#adb5bd]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
            className="text-[#adb5bd] hover:text-[#343a40] transition-colors flex-shrink-0"
          >
            <X size={11} />
          </span>
        )}
      </button>

      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={240}>
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#f1f3f5] flex items-center justify-between">
          <span className="text-[0.75rem] font-bold text-[#1a1a2e] font-[Plus_Jakarta_Sans]">Select time</span>
          <button type="button" onClick={() => setOpen(false)} className="text-[#adb5bd] hover:text-[#343a40] transition-colors">
            <X size={13} />
          </button>
        </div>

        {/* Two columns: AM | PM */}
        <div className="grid grid-cols-2 divide-x divide-[#f1f3f5]">
          {/* AM */}
          <div>
            <p className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-wider px-3 py-2 border-b border-[#f1f3f5]">AM</p>
            <div ref={amListRef} className="overflow-y-auto py-1.5 px-1.5" style={{ maxHeight: 220 }}>
              {AM_TIMES.map(t => {
                const isSel = t.value === value
                return (
                  <button
                    key={t.value}
                    type="button"
                    data-selected={isSel}
                    onClick={() => handleSelect(t.value)}
                    className={[
                      'w-full text-left px-2.5 py-1.5 rounded-[7px] text-[0.8rem] font-medium transition-colors block',
                      isSel
                        ? 'bg-[#3b5bdb] text-white font-bold'
                        : 'text-[#343a40] hover:bg-[#edf2ff] hover:text-[#3b5bdb]',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* PM */}
          <div>
            <p className="text-[0.6rem] font-bold text-[#adb5bd] uppercase tracking-wider px-3 py-2 border-b border-[#f1f3f5]">PM</p>
            <div ref={pmListRef} className="overflow-y-auto py-1.5 px-1.5" style={{ maxHeight: 220 }}>
              {PM_TIMES.map(t => {
                const isSel = t.value === value
                return (
                  <button
                    key={t.value}
                    type="button"
                    data-selected={isSel}
                    onClick={() => handleSelect(t.value)}
                    className={[
                      'w-full text-left px-2.5 py-1.5 rounded-[7px] text-[0.8rem] font-medium transition-colors block',
                      isSel
                        ? 'bg-[#3b5bdb] text-white font-bold'
                        : 'text-[#343a40] hover:bg-[#edf2ff] hover:text-[#3b5bdb]'
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Popover>
    </div>
  )
}

// ── DateTimeRow — convenience wrapper for side-by-side date + time ────────

export function DateTimeRow({
  date,
  time,
  onDateChange,
  onTimeChange,
  minDate,
  disabled = false,
}: {
  date: string
  time: string
  onDateChange: (v: string) => void
  onTimeChange: (v: string) => void
  minDate?: string
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DateInput value={date} onChange={onDateChange} min={minDate} disabled={disabled} />
      <TimeSelect value={time} onChange={onTimeChange} disabled={disabled} />
    </div>
  )
}
