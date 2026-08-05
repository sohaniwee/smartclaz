'use client'
import { useCountUp } from '@/hooks/useCountUp'

interface CountUpProps {
  value: number
  prefix?: string
  suffix?: string
  duration?: number
  delay?: number
  decimals?: number
  separator?: string
  className?: string
  style?: React.CSSProperties
}

export default function CountUp({
  value,
  prefix = '',
  suffix = '',
  duration = 1200,
  delay = 0,
  decimals = 0,
  separator = ',',
  className,
  style,
}: CountUpProps) {
  const formatted = useCountUp({
    end: value,
    duration,
    delay,
    decimals,
    prefix,
    separator,
  })

  return (
    <span className={className} style={style}>
      {formatted}{suffix}
    </span>
  )
}
