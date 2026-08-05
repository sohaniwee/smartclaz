'use client'

// Prevents mouse scroll from changing the selected option in <select> elements.
// Native browser behaviour: a focused <select> changes value on wheel events.
// This global listener blurs any focused select before the wheel event fires,
// so the page scrolls normally instead of cycling through options.
// Placed once in the root layout — covers the entire app.

import { useEffect } from 'react'

export function ScrollLock() {
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const el = document.activeElement
      if (el instanceof HTMLSelectElement) {
        el.blur()
      }
    }

    document.addEventListener('wheel', handleWheel, { passive: true })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [])

  return null
}
