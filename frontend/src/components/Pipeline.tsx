import { motion } from 'framer-motion'
import { CheckCheck, DatabaseZap, Eraser, Gauge, History, ShieldCheck } from 'lucide-react'

const STEPS = [
  { label: 'Ingest', sub: 'STAC · S1 + S2', icon: DatabaseZap },
  { label: 'Clean', sub: 'cloud · shadow · speckle', icon: Eraser },
  { label: 'Recover', sub: 'temporal composite', icon: History },
  { label: 'Validate', sub: 'drift · anomaly · fusion', icon: CheckCheck },
  { label: 'Score', sub: 'trust ± uncertainty', icon: Gauge },
  { label: 'Gate', sub: 'pass · review · block', icon: ShieldCheck },
]

export default function Pipeline({ dark = false }: { dark?: boolean }) {
  return (
    <div className="relative">
      <div className={`absolute left-[8%] right-[8%] top-7 h-[2px] ${dark ? 'bg-sky/20' : 'bg-line'}`} />
      <motion.div className="absolute left-[8%] top-7 h-[2px] bg-gradient-to-r from-teal to-sky" initial={{ width: 0 }} whileInView={{ width: '84%' }} viewport={{ once: true }} transition={{ duration: 2.2, ease: 'easeInOut' }} />
      <div className="relative grid grid-cols-3 gap-4 md:grid-cols-6">
        {STEPS.map((s, i) => (
          <motion.div key={s.label} className="flex flex-col items-center text-center" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.25 + i * 0.32 }}>
            <div className={`relative grid h-14 w-14 place-items-center rounded-2xl border ${dark ? 'border-sky/30 bg-space-2 text-sky' : 'border-line bg-surface text-teal shadow-card'}`}>
              <s.icon size={22} />
              <motion.span className="absolute inset-0 rounded-2xl border-2 border-sky" initial={{ opacity: 0 }} whileInView={{ opacity: [0, 1, 0] }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.32, duration: 1 }} />
            </div>
            <div className={`mt-2 text-sm font-semibold ${dark ? 'text-white' : 'text-ink'}`}>{s.label}</div>
            <div className={`font-mono text-[10px] ${dark ? 'text-sky/70' : 'text-ink-3'}`}>{s.sub}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
