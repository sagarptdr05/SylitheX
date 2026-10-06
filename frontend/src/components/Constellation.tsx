import { motion } from 'framer-motion'
import { Orbit } from 'lucide-react'
import { useApi } from '../lib/api'
import { fmtDate, scoreColor } from '../lib/format'
import { Card, CardTitle } from './ui'

interface Sat { id: string; name: string; sensor: string; launch: number; acquisitions: number; first: string; last: string; avg_trust: number | null; orbit: string; revisit_days: number }

function MiniOrbit({ sar, delay }: { sar: boolean; delay: number }) {
  const c = sar ? '#D97706' : '#0891B2'
  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0">
      <defs>
        <radialGradient id={`e${delay}`} cx="35%" cy="35%"><stop offset="0" stopColor="#5EEAD4" /><stop offset="0.55" stopColor="#2563EB" /><stop offset="1" stopColor="#0B3B47" /></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="20" fill={`url(#e${delay})`} />
      <circle cx="50" cy="50" r="23" fill="none" stroke="#7DD3FC" strokeOpacity="0.35" strokeWidth="3" />
      <g transform={`rotate(${sar ? -35 : 25} 50 50)`}>
        <ellipse cx="50" cy="50" rx="44" ry="16" fill="none" stroke={c} strokeOpacity="0.5" strokeDasharray="2 3" />
        <g>
          <animateMotion dur={`${sar ? 9 : 7}s`} begin={`${delay}s`} repeatCount="indefinite" path="M 94 50 A 44 16 0 1 1 6 50 A 44 16 0 1 1 94 50" />
          <circle r="5" fill={c} opacity="0.25" />
          <rect x="-2.5" y="-2.5" width="5" height="5" fill={c} />
          <rect x="-9" y="-0.9" width="5.5" height="1.8" fill="#1E3A8A" /><rect x="3.5" y="-0.9" width="5.5" height="1.8" fill="#1E3A8A" />
        </g>
      </g>
    </svg>
  )
}

export default function Constellation() {
  const q = useApi<Sat[]>('/api/constellation')
  return (
    <Card>
      <CardTitle icon={Orbit} title="Constellation feeding this AOI" sub="Platforms identified from STAC item metadata of every cached acquisition" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(q.data ?? []).map((s, i) => {
          const sar = s.id.startsWith('S1')
          return (
            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface to-surface-2 p-3">
              <div className="flex items-center gap-2">
                <MiniOrbit sar={sar} delay={i * 0.7} />
                <div className="min-w-0">
                  <div className="font-display text-[15px] font-bold">{s.name}</div>
                  <div className={`font-mono text-[10px] font-semibold ${sar ? 'text-warn-ink' : 'text-sky'}`}>{s.sensor}</div>
                  <div className="font-mono text-[10px] text-ink-3">launched {s.launch}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded-lg bg-surface/80 px-2 py-1"><div className="text-ink-3">passes</div><div className="num font-semibold">{s.acquisitions}</div></div>
                <div className="rounded-lg bg-surface/80 px-2 py-1"><div className="text-ink-3">avg trust</div><div className="num font-semibold" style={{ color: s.avg_trust ? scoreColor(s.avg_trust) : '#94A3B8' }}>{s.avg_trust ?? 'radar'}</div></div>
              </div>
              <div className="mt-1.5 font-mono text-[10px] text-ink-3">last {fmtDate(s.last)} · {s.orbit}</div>
              <span className="absolute right-2 top-2 flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pass opacity-60" /><span className="relative h-2 w-2 rounded-full bg-pass" /></span>
            </motion.div>
          )
        })}
        {!q.data && [0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-36" />)}
      </div>
    </Card>
  )
}
