import { motion } from 'framer-motion'
import { Bot, Database, OctagonX, ShieldCheck, UserCheck } from 'lucide-react'
import type { Status } from '../lib/types'

const LANES = [
  { key: 'PASS', label: 'Downstream AI', sub: 'released', icon: Bot, color: '#16A34A', y: 40 },
  { key: 'WARNING', label: 'Human Review', sub: 'queued', icon: UserCheck, color: '#D97706', y: 110 },
  { key: 'BLOCKED', label: 'Rejected', sub: 'blocked', icon: OctagonX, color: '#DC2626', y: 180 },
] as const

export default function GateVisual({ status, score }: { status: Status; score: number }) {
  const lane = LANES.find((l) => l.key === status)!
  const blocked = status === 'BLOCKED'
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface to-mint/40 p-4">
      <div className="relative">
      <svg viewBox="0 0 640 220" className="w-full">
        <defs>
          <linearGradient id="lanefade" x1="0" x2="1"><stop offset="0" stopColor="#2563EB" stopOpacity="0.5" /><stop offset="1" stopColor="#2563EB" stopOpacity="0.05" /></linearGradient>
          <filter id="pglow"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        {/* source */}
        <line x1="70" y1="110" x2="290" y2="110" stroke="url(#lanefade)" strokeWidth="3" strokeDasharray="6 6" />
        {LANES.map((l) => (
          <g key={l.key}>
            <path d={`M 330 110 C 380 110, 390 ${l.y}, 440 ${l.y} L 470 ${l.y}`} fill="none" stroke={l.color} strokeOpacity={l.key === status ? 0.9 : 0.18} strokeWidth={l.key === status ? 3 : 2} strokeDasharray={l.key === status ? '0' : '5 6'} />
          </g>
        ))}
        {/* gate */}
        <rect x="288" y="62" width="44" height="96" rx="12" fill="#fff" stroke={lane.color} strokeWidth="2.5" />
        <text x="310" y="180" textAnchor="middle" className="fill-ink-2" style={{ font: '600 10px JetBrains Mono' }}>TRUST GATE</text>
        <text x="310" y="116" textAnchor="middle" style={{ font: '700 16px JetBrains Mono', fill: lane.color }}>{Math.round(score)}</text>
        {blocked && (
          <motion.rect x="286" y="60" width="48" height="100" rx="13" fill="none" stroke="#DC2626" strokeWidth="3"
            animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity }} />
        )}
        {/* packet */}
        <motion.g key={status + score}
          initial={{ x: 40, y: 110 }}
          animate={blocked ? { x: [40, 268, 262, 268], y: [110, 110, 110, 110] } : { x: [40, 300, 420, 462], y: [110, 110, lane.y, lane.y] }}
          transition={{ duration: blocked ? 2 : 2.4, times: [0, 0.5, 0.75, 1], repeat: Infinity, repeatDelay: 0.8, ease: 'easeInOut' }}>
          <circle r="11" fill={lane.color} opacity="0.35" filter="url(#pglow)" />
          <rect x="-9" y="-9" width="18" height="18" rx="5" fill={lane.color} />
          <rect x="-4" y="-4" width="8" height="8" rx="2" fill="#fff" opacity="0.9" />
        </motion.g>
      </svg>
      <div className="pointer-events-none absolute left-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal text-white shadow-lift"><Database size={18} /></div>
        <span className="font-mono text-[10px] text-ink-2">S1+S2 scene</span>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[25%]">
        {LANES.map((l) => (
          <div key={l.key} className="absolute left-0 flex -translate-y-1/2 items-center gap-2" style={{ top: `${(l.y / 220) * 100}%`, opacity: l.key === status ? 1 : 0.4 }}>
            <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: l.color }}><l.icon size={17} /></div>
            <div className="whitespace-nowrap text-xs"><div className="font-semibold text-ink">{l.label}</div><div className="font-mono text-[10px] text-ink-3">{l.sub}</div></div>
          </div>
        ))}
      </div>
      </div>
      {blocked && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="mt-2 flex items-center gap-2 rounded-xl border border-block/30 bg-block-bg px-3 py-2 text-sm font-semibold text-block">
          <OctagonX size={16} /> This data has been blocked from reaching the downstream AI model.
        </motion.div>
      )}
      {status === 'PASS' && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-pass/30 bg-pass-bg px-3 py-2 text-sm font-semibold text-pass">
          <ShieldCheck size={16} /> Verified and released to the downstream AI model.
        </div>
      )}
      {status === 'WARNING' && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn-bg px-3 py-2 text-sm font-semibold text-warn-ink">
          <UserCheck size={16} /> Routed to a human reviewer before any AI model may use it.
        </div>
      )}
    </div>
  )
}
