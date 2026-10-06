import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect } from 'react'
import { scoreColor, statusColor } from '../lib/format'
import type { Status } from '../lib/types'

interface Props { score: number; uncertainty?: number; status?: Status; size?: number; label?: string; sub?: string }

export default function TrustGauge({ score, uncertainty = 0, status, size = 220, label = 'Trust Score', sub }: Props) {
  const r = size / 2 - 18
  const C = 2 * Math.PI * r
  const arc = 0.75 // 270deg gauge
  const mv = useMotionValue(0)
  const shown = useTransform(mv, (v) => Math.round(v))
  useEffect(() => {
    const c = animate(mv, score, { duration: 1.1, ease: [0.2, 0.7, 0.2, 1] })
    return () => c.stop()
  }, [score, mv])
  const dash = useTransform(mv, (v) => `${(C * arc * v) / 100} ${C}`)
  const color = status ? statusColor(status) : scoreColor(score)
  const lo = Math.max(0, score - uncertainty), hi = Math.min(100, score + uncertainty)
  const ticks = Array.from({ length: 41 }, (_, i) => i)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-[225deg]">
        <defs>
          <linearGradient id="gaugeTrack" x1="0" x2="1">
            <stop offset="0" stopColor="#FEE2E2" /><stop offset="0.5" stopColor="#FEF3C7" /><stop offset="1" stopColor="#DCFCE7" />
          </linearGradient>
          <filter id="gglow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {ticks.map((i) => {
          const a = (i / 40) * arc * 2 * Math.PI
          const r1 = r + 11, r2 = r + (i % 5 === 0 ? 16 : 13.5)
          return <line key={i} x1={size / 2 + r1 * Math.cos(a)} y1={size / 2 + r1 * Math.sin(a)} x2={size / 2 + r2 * Math.cos(a)} y2={size / 2 + r2 * Math.sin(a)} stroke={i / 40 * 100 <= score ? color : '#E3E8EF'} strokeWidth={i % 5 === 0 ? 1.6 : 1} strokeOpacity={0.8} />
        })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#gaugeTrack)" strokeWidth={14} strokeDasharray={`${C * arc} ${C}`} strokeLinecap="round" />
        {uncertainty > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={22}
            strokeDasharray={`${(C * arc * (hi - lo)) / 100} ${C}`} strokeDashoffset={-(C * arc * lo) / 100} />
        )}
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" style={{ strokeDasharray: dash }} filter="url(#gglow)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="label">{label}</div>
          <div className="flex items-baseline justify-center gap-1">
            <motion.span className="num font-bold text-ink" style={{ fontSize: size * 0.24 }}>{shown}</motion.span>
            {uncertainty > 0 && <span className="num text-sm font-medium text-ink-3">±{uncertainty.toFixed(0)}</span>}
          </div>
          {sub && <div className="text-xs text-ink-2">{sub}</div>}
        </div>
      </div>
    </div>
  )
}
