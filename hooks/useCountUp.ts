import { useState, useEffect, useRef } from 'react'

interface UseCountUpOptions {
  end: number
  duration?: number
  start?: number
  delay?: number
  decimals?: number
  prefix?: string
  separator?: string
}

export function useCountUp({
  end,
  duration = 1200,
  start = 0,
  delay = 0,
  decimals = 0,
  prefix = '',
  separator = ',',
}: UseCountUpOptions) {
  const [value, setValue] = useState(start)
  const frameRef = useRef<number>()
  const startTimeRef = useRef<number>()

  useEffect(() => {
    setValue(start)

    const timeout = setTimeout(() => {
      const animate = (timestamp: number) => {
        if (!startTimeRef.current) {
          startTimeRef.current = timestamp
        }

        const elapsed = timestamp - startTimeRef.current
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = start + (end - start) * eased

        setValue(current)

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate)
        } else {
          setValue(end)
        }
      }

      frameRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeout)
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
      startTimeRef.current = undefined
    }
  }, [end, duration, start, delay])

  const formatted = formatNumber(value, decimals, separator)
  return prefix + formatted
}

function formatNumber(num: number, decimals: number, separator: string): string {
  const fixed = num.toFixed(decimals)
  const parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  return parts.join('.')
}
