import { motion } from 'framer-motion'
import type { WaterfallStep } from '../lib/types'

/** Horizontal waterfall: 100 → points lost per component / penalty → final Trust Score. */
export default function Waterfall({ steps }: { steps: WaterfallStep[]; height?: number }) {
  let run = 0
  const rows = steps.map((s) => {
    if (s.kind === 'start') { run = s.value; return { ...s, from: 0, to: s.value } }
    if (s.kind === 'end') return { ...s, from: 0, to: s.value }
    const from = run + s.value, to = run
    run = from
    return { ...s, from: Math.max(0, from), to }
  })
  const color = (k: string) => (k === 'start' ? '#0891B2' : k === 'end' ? '#2563EB' : k === 'penalty' ? '#DC2626' : '#D97706')
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const w = Math.max(0.4, r.to - r.from)
        return (
          <div key={r.name} className="grid grid-cols-[170px_1fr_52px] items-center gap-3 text-xs">
            <span className={r.kind === 'end' || r.kind === 'start' ? 'font-semibold text-ink' : 'text-ink-2'}>{r.name}</span>
            <div className="relative h-6 rounded-md bg-[repeating-linear-gradient(90deg,#F2F6F5_0,#F2F6F5_calc(10%-1px),#E6EEEB_calc(10%-1px),#E6EEEB_10%)]">
              <motion.div className="absolute inset-y-0.5 rounded" style={{ left: `${r.from}%`, background: color(r.kind), opacity: r.kind === 'component' && Math.abs(r.value) < 0.3 ? 0.35 : 0.92 }}
                initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ delay: i * 0.06, duration: 0.6 }} />
              {i > 0 && r.kind !== 'end' && <div className="absolute -top-1.5 h-1.5 w-px bg-ink-3/50" style={{ left: `${r.to}%` }} />}
            </div>
            <span className={`num text-right font-semibold ${r.kind === 'component' || r.kind === 'penalty' ? (Math.abs(r.value) >= 0.05 ? 'text-block' : 'text-ink-3') : 'text-ink'}`}>
              {r.kind === 'component' || r.kind === 'penalty' ? (r.value === 0 ? '0.0' : r.value.toFixed(1)) : r.value.toFixed(1)}
            </span>
          </div>
        )
      })}
      <div className="flex gap-4 pt-2 text-[11px] text-ink-2">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-[#D97706]" />component points lost</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-block" />nonlinear penalty</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-teal" />final</span>
      </div>
    </div>
  )
}
