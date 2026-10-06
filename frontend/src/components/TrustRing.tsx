import { motion } from 'framer-motion'
import { useState } from 'react'
import { COMPONENT_LABELS, scoreColor, statusColor, statusLabel } from '../lib/format'

const ORDER = ['completeness', 'cloud', 'noise', 'sensor_agreement', 'temporal', 'anomaly', 'drift', 'reconstruction']

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)]
  const [x0, y0] = p(a0), [x1, y1] = p(a1)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`
}

/**
 * Signature Trust Score: the outer ring has one segment per trust component (filled by its score),
 * the inner arc is the overall score with its uncertainty band. Click → "why this score".
 */
export default function TrustRing({ score, interval, status, components, size = 248, onExplain }: {
  score: number; interval?: [number, number]; status: string; components: Record<string, number | null>; size?: number; onExplain?: () => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const c = size / 2
  const R1 = size * 0.46, R2 = size * 0.355
  const n = ORDER.length
  const gap = 0.05
  const seg = (Math.PI * 2) / n
  const col = statusColor(status)
  const hv = hover ? components[hover] : null
  const full = Math.PI * 2 * 0.999
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          <radialGradient id="tr-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={col} stopOpacity="0.20" /><stop offset="70%" stopColor={col} stopOpacity="0.04" /><stop offset="100%" stopColor={col} stopOpacity="0" />
          </radialGradient>
          <filter id="tr-glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx={c} cy={c} r={R2 - 8} fill="url(#tr-core)" />
        {/* tick marks */}
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2
          const r0 = R1 + 9, r1 = R1 + (i % 5 === 0 ? 15 : 12)
          return <line key={i} x1={c + r0 * Math.sin(a)} y1={c - r0 * Math.cos(a)} x2={c + r1 * Math.sin(a)} y2={c - r1 * Math.cos(a)} stroke="rgb(var(--line-2))" strokeWidth={i % 5 === 0 ? 1.4 : 0.8} />
        })}
        {/* component segments */}
        {ORDER.map((k, i) => {
          const v = components[k]
          const a0 = i * seg + gap, a1 = (i + 1) * seg - gap
          const fill = v == null ? 0 : Math.max(0.02, v / 100)
          return (
            <g key={k} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(k)} onBlur={() => setHover(null)} tabIndex={0}
              role="img" aria-label={`${COMPONENT_LABELS[k]}: ${v == null ? 'not available' : v.toFixed(0)}`} className="cursor-help outline-none">
              <path d={arc(c, c, R1, a0, a1)} stroke="rgb(var(--surface-3))" strokeWidth={hover === k ? 13 : 10} fill="none" strokeLinecap="round" />
              <motion.path d={arc(c, c, R1, a0, a0 + (a1 - a0) * fill)} stroke={v == null ? 'rgb(var(--line-2))' : scoreColor(v)} strokeWidth={hover === k ? 13 : 10} fill="none" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.1 + i * 0.05, ease: 'easeOut' }} />
            </g>
          )
        })}
        {/* overall score + uncertainty band */}
        <path d={arc(c, c, R2, 0, full)} stroke="rgb(var(--surface-3))" strokeWidth={6} fill="none" />
        {interval && <path d={arc(c, c, R2, (interval[0] / 100) * full, Math.max((interval[0] / 100) * full + 0.01, (interval[1] / 100) * full))} stroke={col} strokeOpacity={0.28} strokeWidth={14} fill="none" />}
        <motion.path key={score} d={arc(c, c, R2, 0, Math.max(0.01, (score / 100) * full))} stroke={col} strokeWidth={6} fill="none" strokeLinecap="round" filter="url(#tr-glow)"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: [0.2, 0.7, 0.2, 1] }} />
        {/* orbiting marker */}
        <g style={{ transformOrigin: `${c}px ${c}px` }} className="animate-orbitSlow motion-reduce:animate-none">
          <circle cx={c} cy={c - R1 - 22} r={3} fill="rgb(var(--cyan))" />
        </g>
      </svg>
      <button type="button" onClick={onExplain} disabled={!onExplain} aria-label={`Trust score ${score.toFixed(0)}, ${statusLabel(status)}. Show why.`}
        className="absolute inset-0 m-auto grid h-[56%] w-[56%] place-items-center rounded-full text-center outline-none transition enabled:hover:bg-white/[0.03]">
        <div>
          {hover ? (
            <>
              <div className="mx-auto max-w-[120px] text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">{COMPONENT_LABELS[hover]}</div>
              <div className="num mt-1 text-4xl font-bold" style={{ color: hv == null ? undefined : scoreColor(hv) }}>{hv == null ? 'n/a' : hv.toFixed(0)}</div>
              <div className="text-[10px] text-ink-3">component score</div>
            </>
          ) : (
            <>
              <div className="label text-[9.5px]">Trust score</div>
              <motion.div key={score} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="num text-[54px] font-bold leading-none text-strong">{score.toFixed(0)}</motion.div>
              {interval && <div className="num mt-1 text-[11px] text-ink-3">{interval[0].toFixed(0)}–{interval[1].toFixed(0)} (90%)</div>}
              <div className="mt-1.5 font-mono text-[11px] font-bold tracking-[0.2em]" style={{ color: col }}>{statusLabel(status)}</div>
            </>
          )}
        </div>
      </button>
    </div>
  )
}

export function ComponentBars({ components, extra = [] }: { components: Record<string, number | null>; extra?: { label: string; value: number | null; hint?: string }[] }) {
  const rows = [
    ...ORDER.map((k) => ({ label: COMPONENT_LABELS[k], value: components[k] })),
    ...extra,
  ]
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          <div className="truncate text-[12.5px] text-ink-2">{r.label}</div>
          <div className="num text-[12.5px] font-semibold" style={{ color: r.value == null ? undefined : scoreColor(r.value) }}>{r.value == null ? 'n/a' : `${r.value.toFixed(0)}%`}</div>
          <div className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full rounded-full" style={{ background: r.value == null ? 'transparent' : scoreColor(r.value) }}
              initial={{ width: 0 }} animate={{ width: `${r.value ?? 0}%` }} transition={{ duration: 0.8, delay: i * 0.04 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
