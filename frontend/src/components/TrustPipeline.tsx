import { motion } from 'framer-motion'
import { BadgeCheck, Database, Fingerprint, Gauge, OctagonX, Radar, Satellite, ScanSearch, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import { fmtDate, statusColor } from '../lib/format'
import type { Scene } from '../lib/types'

type St = 'ok' | 'warn' | 'fail'
const C: Record<St, string> = { ok: '#16A34A', warn: '#D97706', fail: '#DC2626' }

export function stages(s: Scene) {
  const m = s.metrics
  const checks = s.metadata_checks ?? []
  const okN = checks.filter((c) => c.status === 'ok').length
  const integ = checks.some((c) => c.status === 'fail')
  const final: St = s.status === 'PASS' ? 'ok' : s.status === 'WARNING' ? 'warn' : 'fail'
  return [
    { key: 'obs', title: 'Satellite observation', icon: Satellite, st: 'ok' as St,
      value: `S2 ${fmtDate(s.sensors.s2.date)}`, sub: s.sensors.s1 ? `S1 radar Δ${s.sensors.s1.gap_days} d` : 'optical only' },
    { key: 'ing', title: 'Ingestion', icon: Database, st: (integ ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok') as St,
      value: `${okN}/${checks.length} checks`, sub: integ ? checks.find((c) => c.status === 'fail')!.check : 'metadata + integrity' },
    { key: 'qa', title: 'Quality analysis', icon: Gauge, st: (m.missing_pct > 40 || m.cloud_pct > 60 ? 'fail' : m.cloud_pct > 20 || m.missing_pct > 10 ? 'warn' : 'ok') as St,
      value: `cloud ${m.cloud_pct.toFixed(0)}%`, sub: `missing ${m.missing_pct.toFixed(0)}% · noise ${s.levels.noise.toLowerCase()}` },
    { key: 'an', title: 'Anomaly detection', icon: Radar,
      st: (s.levels.anomaly === 'HIGH' || m.impossible_pct > 1 ? 'fail' : s.levels.anomaly === 'MEDIUM' || s.levels.drift === 'HIGH' || s.false_confidence.detected ? 'warn' : 'ok') as St,
      value: `anomaly ${s.levels.anomaly}`, sub: s.false_confidence.detected ? 'hidden inconsistency found' : `drift ${s.levels.drift}` },
    { key: 'prov', title: 'Provenance verification', icon: Fingerprint, st: (m.recon_pct > 25 ? 'warn' : 'ok') as St,
      value: `${m.valid_pct.toFixed(0)}% original`, sub: `${m.recon_pct.toFixed(0)}% reconstructed · hashed` },
    { key: 'trust', title: 'Trust score', icon: ScanSearch, st: final,
      value: `${s.trust_score.toFixed(0)} ± ${s.trust_uncertainty.toFixed(0)}`, sub: `${s.gate_rules_triggered.length} gate rule${s.gate_rules_triggered.length === 1 ? '' : 's'} fired` },
    { key: 'out', title: s.status === 'BLOCKED' ? 'Blocked' : s.status === 'WARNING' ? 'Human review' : 'Trusted data', icon: s.status === 'BLOCKED' ? OctagonX : s.status === 'WARNING' ? ShieldAlert : BadgeCheck, st: final,
      value: s.status === 'PASS' ? 'released' : s.status === 'WARNING' ? 'held for review' : 'never delivered', sub: s.status === 'PASS' ? 'to downstream AI' : s.status === 'WARNING' ? 'analyst decides' : 'downstream protected' },
  ]
}

/** The signature "data → trust" flow. Re-plays stage by stage whenever a different dataset is selected. */
export default function TrustPipeline({ scene, compact = false }: { scene: Scene; compact?: boolean }) {
  const st = stages(scene)
  const step = 0.28
  return (
    <div key={scene.scene_id} className={clsx('relative grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 lg:gap-0')}>
      {st.map((x, i) => (
        <div key={x.key} className="relative flex items-stretch lg:block">
          {/* connector */}
          {i > 0 && (
            <svg className="absolute -top-2 left-[22px] h-2 w-1 lg:left-[-50%] lg:top-[22px] lg:h-1 lg:w-full" preserveAspectRatio="none" viewBox="0 0 100 4" aria-hidden>
              <motion.line x1="0" y1="2" x2="100" y2="2" stroke={C[st[i - 1].st]} strokeWidth="2" strokeDasharray="6 6" className="animate-flow"
                initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={{ delay: i * step }} />
            </svg>
          )}
          <motion.div initial={{ opacity: 0.25, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * step, duration: 0.35 }}
            className="relative z-10 flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-2.5 lg:mx-1 lg:w-auto lg:flex-col lg:items-center lg:border-0 lg:bg-transparent lg:p-0 lg:text-center">
            <motion.div initial={{ boxShadow: '0 0 0 0 rgba(0,0,0,0)' }} animate={{ boxShadow: `0 0 0 4px ${C[x.st]}22, 0 0 24px -4px ${C[x.st]}` }} transition={{ delay: i * step + 0.1 }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-bg" style={{ borderColor: C[x.st] + '88', color: C[x.st] }}>
              <x.icon size={19} />
            </motion.div>
            <div className="min-w-0 lg:mt-2">
              <div className="label text-[9.5px] text-ink-3">{String(i + 1).padStart(2, '0')} · {x.title}</div>
              <div className="num mt-0.5 truncate text-[13px] font-semibold" style={{ color: i >= 5 ? statusColor(scene.status) : undefined }}>{x.value}</div>
              <div className="truncate text-[11px] text-ink-3">{x.sub}</div>
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  )
}
