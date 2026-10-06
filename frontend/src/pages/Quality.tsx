import { motion } from 'framer-motion'
import { Cloud, Gauge, History, Radio, ScanLine, Sigma, TrendingUp, Waves } from 'lucide-react'
import { FalseConfidenceBanner } from '../components/Insights'
import IssueCenter from '../components/IssueCenter'
import { Card, CardTitle, LevelPill, Meter, PageHeader, Skeleton } from '../components/ui'
import { COMPONENT_LABELS, COMPONENTS, scoreColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { Tile } from '../lib/types'

function MiniGauge({ value, label }: { value: number | null; label: string }) {
  const v = value ?? 0
  const r = 46, C = 2 * Math.PI * r, arc = 0.75
  const col = value === null ? '#CBD5E1' : scoreColor(v)
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[112px] w-[112px]">
        <svg viewBox="0 0 112 112" className="h-full w-full rotate-[135deg]">
          <circle cx="56" cy="56" r={r} fill="none" stroke="#E2E8F0" strokeWidth="9" strokeDasharray={`${C * arc} ${C}`} strokeLinecap="round" />
          <motion.circle cx="56" cy="56" r={r} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${(C * arc * v) / 100} ${C}` }} transition={{ duration: 1, ease: 'easeOut' }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center"><span className="num text-2xl font-bold">{value === null ? 'n/a' : v.toFixed(0)}</span></div>
      </div>
      <div className="mt-[-4px] text-center text-[12.5px] font-semibold text-ink">{label}</div>
    </div>
  )
}

function TileHeat({ tiles, field, title, invert = true, unit = '%' }: { tiles: Tile[]; field: (t: Tile) => number; title: string; invert?: boolean; unit?: string }) {
  const n = Math.round(Math.sqrt(tiles.length))
  return (
    <div>
      <div className="label mb-2 text-[10px]">{title}</div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {tiles.map((t) => {
          const v = field(t)
          return <motion.div key={t.id} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: (t.row + t.col) * 0.02 }}
            title={`${t.id}: ${v.toFixed(1)}${unit}`} className="aspect-square rounded-[4px]" style={{ background: scoreColor(invert ? 100 - v : v) }} />
        })}
      </div>
    </div>
  )
}

export default function Quality() {
  const { scene, sceneId } = useStore()
  if (!scene) return <Skeleton className="h-[600px]" />
  const m = scene.metrics
  const c = scene.components
  const cal = scene.drift.calibration
  return (
    <div>
      <PageHeader crumbs={['Platform', 'Data Quality']} kicker="Data Quality" st="3 · Detect quality problems" title="Data Quality Center"
        sub="What is wrong with this data, why, where, when, how severe, what it costs and what the trust layer did. Every dimension is measured per 960 m tile and normalised to 0–100 (higher = more trustworthy)." />
      <FalseConfidenceBanner fc={scene.false_confidence} />
      <div className="mb-5"><IssueCenter sceneId={sceneId} /></div>
      <Card>
        <CardTitle icon={Gauge} title="Trust components" sub="The eight inputs of the Trust Score engine" />
        <div className="grid grid-cols-2 gap-y-6 md:grid-cols-4 xl:grid-cols-8">
          {COMPONENTS.map((k) => <MiniGauge key={k} value={c[k]} label={COMPONENT_LABELS[k].replace(' (inverted)', '')} />)}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardTitle icon={Cloud} title="Cloud, shadow & missing pixels" sub="SCL classes + independent spectral whiteness / darkness tests" />
          <div className="space-y-3.5">
            <Meter label="Valid (clear) pixels" value={m.valid_pct} suffix="%" />
            <Meter label="Cloud (med/high/cirrus)" value={m.cloud_pct} suffix="%" invertColor />
            <Meter label="Cloud shadow" value={m.shadow_pct} suffix="%" invertColor />
            <Meter label="Missing / no-data / defective" value={m.missing_pct} suffix="%" invertColor />
            <Meter label="Reconstructed (temporal)" value={m.recon_pct} suffix="%" invertColor />
            <Meter label="Unrecoverable (left missing)" value={m.unrecovered_pct} suffix="%" invertColor />
            <Meter label="Physically impossible values" value={m.impossible_pct} suffix="%" invertColor max={20} />
          </div>
        </Card>
        <Card>
          <CardTitle icon={Radio} title="Noise quality" sub="Optical residual σ & SAR local Cᵢ² vs the AOI's own history" />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3"><div className="label text-[9px]">Optical noise</div><div className="num text-2xl font-semibold">{m.noise_ratio_opt.toFixed(2)}×</div><div className="text-[11px] text-ink-2">of baseline</div></div>
            <div className="rounded-xl bg-surface-2 p-3"><div className="label text-[9px]">SAR speckle</div><div className="num text-2xl font-semibold">{m.noise_ratio_sar ? `${m.noise_ratio_sar.toFixed(2)}×` : 'n/a'}</div><div className="text-[11px] text-ink-2">of baseline ENL</div></div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm">Noise quality level</span><LevelPill level={m.noise_label === 'HIGH' ? 'LOW' : m.noise_label === 'LOW' ? 'HIGH' : 'MEDIUM'} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-2">SAR is converted to dB and Lee-filtered (7×7, ENL≈4.4). Normal speckle (ratio ≈ 1×) is <b>not</b> penalised; only noise above the AOI's historical level lowers the score.</p>
          <div className="mt-4"><TileHeat tiles={scene.tiles} field={(t) => t.components.noise ?? 0} title="Noise quality per tile" invert={false} unit="" /></div>
        </Card>
        <Card>
          <CardTitle icon={TrendingUp} title="Drift vs same-season baseline" sub="PSI · Kolmogorov–Smirnov · Jensen–Shannon" right={<LevelPill level={scene.levels.drift} />} />
          <table className="w-full text-xs">
            <thead><tr className="label text-[9px]"><th className="text-left">Feature</th><th>PSI</th><th>KS</th><th>JS</th></tr></thead>
            <tbody>
              {Object.entries(scene.drift.per_feature).map(([f, d]) => (
                <tr key={f} className="border-t border-line text-center font-mono">
                  <td className="py-1.5 text-left font-sans font-semibold">{f}</td>
                  <td>{d.psi?.toFixed(3) ?? '·'}</td><td>{d.ks?.toFixed(3) ?? '·'}</td><td>{d.js?.toFixed(3) ?? '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs">Combined drift index <b className="num">{scene.drift.index.toFixed(2)}</b> (1.0 = edge of natural seasonal drift, calibrated on clear history)</div>
          {cal?.bands && Object.keys(cal.bands).length > 0 && (
            <div className="mt-4">
              <div className="label mb-2 text-[10px]">Radiometric calibration · {cal.n_targets?.toLocaleString()} pseudo-invariant targets</div>
              <div className="grid grid-cols-5 gap-1.5">
                {Object.entries(cal.bands as Record<string, { gain: number }>).map(([b, v]) => {
                  const rz = cal.relative_z?.[b] ?? 0
                  return (
                    <div key={b} className="rounded-lg border border-line p-1.5 text-center" style={{ borderColor: rz > 4 ? '#DC2626' : undefined, background: rz > 4 ? '#FEE2E2' : undefined }}>
                      <div className="font-mono text-[10px] text-ink-3">{b}</div><div className="num text-sm font-semibold">{v.gain.toFixed(2)}×</div>
                    </div>
                  )
                })}
              </div>
              {cal.flag && <div className="mt-2 text-xs font-semibold text-block">⚠ {cal.flag}</div>}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardTitle icon={ScanLine} title="Spatial quality maps" sub="Per-tile metrics (8 × 8 grid, 960 m tiles)" />
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <TileHeat tiles={scene.tiles} field={(t) => t.cloud + t.shadow} title="Cloud + shadow %" />
            <TileHeat tiles={scene.tiles} field={(t) => t.missing} title="Missing %" />
            <TileHeat tiles={scene.tiles} field={(t) => t.reconstructed} title="Reconstructed %" />
            <TileHeat tiles={scene.tiles} field={(t) => t.components.drift ?? 0} title="Drift score" invert={false} unit="" />
            <TileHeat tiles={scene.tiles} field={(t) => t.components.anomaly ?? 0} title="Anomaly score" invert={false} unit="" />
            <TileHeat tiles={scene.tiles} field={(t) => t.components.temporal ?? 0} title="Temporal consistency" invert={false} unit="" />
            <TileHeat tiles={scene.tiles} field={(t) => t.sensor_agreement ?? 50} title="S1/S2 agreement" invert={false} unit="" />
            <TileHeat tiles={scene.tiles} field={(t) => t.score} title="Final tile trust" invert={false} unit="" />
          </div>
        </Card>
        <Card>
          <CardTitle icon={History} title="Temporal recovery" sub={`Quality-weighted median · ±${scene.recovery.window_days} day window`} />
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface-2 p-2.5"><div className="label text-[9px]">Recovered</div><div className="num text-lg font-semibold">{scene.recovery.recon_pct.toFixed(1)}%</div></div>
            <div className="rounded-xl bg-surface-2 p-2.5"><div className="label text-[9px]">Unrecoverable</div><div className="num text-lg font-semibold">{scene.recovery.unrecovered_pct.toFixed(1)}%</div></div>
            <div className="rounded-xl bg-surface-2 p-2.5"><div className="label text-[9px]">Mean σ</div><div className="num text-lg font-semibold">{scene.recovery.mean_uncertainty.toFixed(2)}</div></div>
          </div>
          {scene.recovery.s1_plausibility && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-sky/30 bg-skytint px-3 py-2 text-xs"><Waves size={14} className="text-sky" />
              S1 plausibility: <b>{(scene.recovery.s1_plausibility.plausible_fraction * 100).toFixed(0)}%</b> of recovered pixels show stable radar backscatter (ref. {scene.recovery.s1_plausibility.reference_s1})</div>
          )}
          <div className="label mb-1.5 mt-4 text-[10px]">Candidate acquisitions used</div>
          <div className="scrollbar-thin max-h-48 space-y-1 overflow-y-auto">
            {scene.recovery.sources_used.length === 0 && <div className="text-xs text-ink-3">No reconstruction required</div>}
            {scene.recovery.sources_used.map((s: { date: string; gap_days: number; pixels: number }) => (
              <div key={s.date} className="flex items-center gap-3 font-mono text-[11px]">
                <span className="w-20">{s.date}</span><span className={`w-14 ${Math.abs(s.gap_days) > 30 ? 'text-warn-ink' : 'text-ink-2'}`}>{s.gap_days > 0 ? '+' : ''}{s.gap_days} d</span>
                <div className="h-1.5 flex-1 rounded-full bg-surface-2"><div className="h-full rounded-full bg-teal" style={{ width: `${Math.min(100, (s.pixels / (scene.tiles.length * 9216)) * 100 * 2)}%` }} /></div>
                <span className="w-16 text-right text-ink-3">{(s.pixels / 1000).toFixed(0)}k px</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-2"><Sigma size={13} />uncertainty = 0.10 + 0.45·gap/window + 1.5·NDVI spread (+0.12 single source)</div>
        </Card>
      </div>
    </div>
  )
}
