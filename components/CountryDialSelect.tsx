'use client'

import { useEffect, useRef, useState } from 'react'
import { COUNTRIES, findCountry } from '@/lib/countries'

type Props = {
  value: string
  onChange: (code: string) => void
  hasError?: boolean
}

export function CountryDialSelect({ value, onChange, hasError }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = findCountry(value)

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dialCode.includes(search)
  )

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 h-full border rounded-[10px] pl-2.5 pr-2.5 py-[9px] text-sm outline-none focus:ring-[3px] transition-all bg-[#f8f9fa] cursor-pointer whitespace-nowrap ${
          hasError
            ? 'border-[#c92a2a] focus:border-[#c92a2a] focus:ring-[rgba(201,42,42,0.12)]'
            : 'border-[#ced4da] focus:border-[#3b5bdb] focus:ring-[rgba(59,91,219,0.12)]'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny external flag icon, no benefit from next/image optimization */}
        <img
          src={`https://flagcdn.com/w20/${selected.code.toLowerCase()}.png`}
          alt={selected.name}
          width={20}
          height={14}
          className="rounded-[2px] flex-shrink-0"
        />
        <span className="text-[#1a1a2e] font-medium">{selected.dialCode}</span>
        <svg className="w-3 h-3 text-[#adb5bd] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-[#dee2e6] rounded-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.06)] w-64 overflow-hidden">
          {/* Search */}
          <div className="p-2.5 border-b border-[#f1f3f5]">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search country or code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-[#ced4da] rounded-[8px] outline-none focus:border-[#3b5bdb] focus:ring-[2px] focus:ring-[rgba(59,91,219,0.12)] transition-all placeholder:text-[#adb5bd]"
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); setSearch('') }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left hover:bg-[#f8f9ff] ${
                  c.code === value ? 'bg-[#edf2ff]' : ''
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny external flag icon, no benefit from next/image optimization */}
                <img
                  src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`}
                  alt={c.name}
                  width={20}
                  height={14}
                  className="rounded-[2px] flex-shrink-0"
                />
                <span className="flex-1 text-[#1a1a2e] font-medium">{c.name}</span>
                <span className="text-[#adb5bd] text-xs font-mono">{c.dialCode}</span>
                {c.code === value && (
                  <svg className="w-3.5 h-3.5 text-[#3b5bdb] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )) : (
              <p className="text-center text-[#adb5bd] text-xs py-5">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
