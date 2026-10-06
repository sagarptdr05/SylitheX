import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, EyeOff, Gavel, MinusCircle, PlusCircle } from 'lucide-react'
import type { GateRule, Scene } from '../lib/types'

export function FalseConfidenceBanner({ fc }: { fc: Scene['false_confidence'] }) {
  if (!fc?.detected) return null
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="relative mb-5 overflow-hidden rounded-2xl border-2 border-warn bg-gradient-to-r from-warn-bg via-surface to-warn-bg p-4">
      <div className="absolute inset-y-0 left-0 w-1.5 animate-blink bg-warn" />
      <div className="flex items-start gap-3 pl-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn text-white"><EyeOff size={20} /></div>
        <div>
          <div className="font-display text-[15px] font-bold text-warn-ink">⚠ FALSE CONFIDENCE DETECTED</div>
          <p className="text-sm text-ink">{fc.message}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="chip bg-surface text-ink-2">visual quality {fc.visual_quality.toFixed(0)}/100</span>
            {fc.triggers.map((t) => <span key={t} className="chip bg-warn text-white">{t}</span>)}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function GateRules({ rules }: { rules: GateRule[] }) {
  if (!rules.length) return (
    <div className="flex items-center gap-2 rounded-xl border border-pass/30 bg-pass-bg/60 px-3 py-2.5 text-sm text-pass"><CheckCircle2 size={16} /> No hard gate rules triggered</div>
  )
  return (
    <div className="space-y-2">
      {rules.map((r) => (
        <div key={r.rule} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${r.action === 'BLOCK' ? 'border-block/30 bg-block-bg text-block' : 'border-warn/30 bg-warn-bg text-warn-ink'}`}>
          <Gavel size={16} className="mt-0.5 shrink-0" />
          <div><b>Gate rule triggered:</b> {r.message} <span className="ml-1 font-mono text-[10px] opacity-80">→ {r.action === 'BLOCK' ? 'BLOCKED' : 'max WARNING'}</span></div>
        </div>
      ))}
    </div>
  )
}

export function Reasons({ pos, neg }: { pos: string[]; neg: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="label mb-2 flex items-center gap-1.5 text-pass"><PlusCircle size={13} />Increasing trust</div>
        <ul className="space-y-1.5">{pos.map((r) => <li key={r} className="flex gap-2 rounded-lg bg-pass-bg/50 px-3 py-2 text-[13px]"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-pass" />{r}</li>)}</ul>
      </div>
      <div>
        <div className="label mb-2 flex items-center gap-1.5 text-block"><MinusCircle size={13} />Decreasing trust</div>
        <ul className="space-y-1.5">
          {neg.length === 0 && <li className="text-sm text-ink-3">Nothing significant</li>}
          {neg.map((r) => <li key={r} className="flex gap-2 rounded-lg bg-block-bg/50 px-3 py-2 text-[13px]"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-block" />{r}</li>)}
        </ul>
      </div>
    </div>
  )
}
