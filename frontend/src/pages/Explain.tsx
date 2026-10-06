import { AnimatePresence, motion } from 'framer-motion'
import { Brain, FlaskConical, Gavel, HelpCircle, ListTree, SlidersHorizontal, Sparkles, TrendingDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { FalseConfidenceBanner, GateRules, Reasons } from '../components/Insights'
import SceneImageMap from '../components/SceneImageMap'
import TileDrawer from '../components/TileDrawer'
import Waterfall from '../components/Waterfall'
import { Card, CardTitle, PageHeader, Skeleton, StatusBadge } from '../components/ui'
import { layerUrl, post, useApi } from '../lib/api'
import { COMPONENT_LABELS, COMPONENTS, statusColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { Scene, Status } from '../lib/types'

interface Bench { curves: Record<string, { level: number; severity: number; trust: number; status: string }[]>; samples: { severity: number; trust: number; status: string }[]; spearman: number; xgb: { mae: number; r2: number; n_train: number; n_test: number }; n: number }

const FAULT_LABEL: Record<string, string> = { cloud_coverage: 'Clouds', dropout: 'Stripe dropout', noise: 'Noise', miscalibration: 'NIR miscalibration', ndvi_spike: 'NDVI spike', sar_inconsistency: 'S1/S2 inconsistency' }
const FAULT_COLOR: Record<string, string> = { cloud_coverage: '#0891B2', dropout: '#DC2626', noise: '#7C3AED', miscalibration: '#D97706', ndvi_spike: '#16A34A', sar_inconsistency: '#2563EB' }

function narrative(s: Scene, profileName: string) {
  const verdict = s.status === 'PASS' ? 'can be trusted' : s.status === 'WARNING' ? 'needs a human check before use' : 'must not be used'
  const parts = [
    `This scene ${verdict}. TerraTrust scores it ${s.trust_score.toFixed(0)} ± ${s.trust_uncertainty.toFixed(0)} out of 100 (95% interval ${s.trust_interval[0].toFixed(0)}–${s.trust_interval[1].toFixed(0)}).`,
  ]
  if (s.reasons_positive.length) parts.push(`In its favour: ${s.reasons_positive.slice(0, 3).map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join('; ')}.`)
  if (s.reasons_negative.length) parts.push(`Against it: ${s.reasons_negative.slice(0, 3).map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join('; ')}.`)
  if (s.gate_rules_triggered.length) parts.push(`Hard gate rule${s.gate_rules_triggered.length > 1 ? 's' : ''}: ${s.gate_rules_triggered.map((g) => g.message).join('; ')}.`)
  if (s.false_confidence.detected) parts.push('Warning: it looks clean, but hidden cross-sensor or statistical inconsistencies were found (false confidence).')
  parts.push(`For ${profileName}, AI readiness is ${s.ai_readiness.toFixed(0)}/100. Decision: ${s.status === 'PASS' ? 'released to the downstream model' : s.status === 'WARNING' ? 'routed to human review' : 'blocked at the gate'}.`)
  return parts.join(' ')
}

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0)
  useEffect(() => { setN(0); const i = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(i), k) : k + 3)), 12); return () => clearInterval(i) }, [text])
  return <p className="text-[15px] leading-relaxed text-ink">{text.slice(0, n)}<span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-teal" /></p>
}

export default function Explain() {
  const { scene, sceneId, profiles, profile } = useStore()
  const bench = useApi<Bench>('/api/benchmark')
  const [ask, setAsk] = useState(false)
  const [tile, setTile] = useState<string | null>(null)
  const [w, setW] = useState<Record<string, number> | null>(null)
  const [what, setWhat] = useState<{ trust_score: number; status: Status } | null>(null)
  const cfg = useApi<{ weights: Record<string, number> }>('/api/config')
  useEffect(() => { if (cfg.data && !w) setW(Object.fromEntries(Object.entries(cfg.data.weights).map(([k, v]) => [k, Math.round(v * 100)]))) }, [cfg.data, w])
  useEffect(() => { setAsk(false); setWhat(null) }, [sceneId])
  useEffect(() => {
    if (!w || !scene) return
    const t = setTimeout(() => post<{ trust_score: number; status: Status }>('/api/trust/whatif', { scene_id: sceneId, weights: w }).then(setWhat), 180)
    return () => clearTimeout(t)
  }, [w, sceneId, scene])
  const curves = useMemo(() => {
    if (!bench.data) return []
    return bench.data.curves.noise.map((_, i) => {
      const row: Record<string, number> = { level: Math.round(bench.data!.curves.noise[i].level * 100) }
      for (const [k, v] of Object.entries(bench.data!.curves)) row[k] = v[i].trust
      return row
    })
  }, [bench.data])
  if (!scene) return <Skeleton className="h-[600px]" />
  const pname = profiles.find((p) => p.id === profile)?.name ?? profile
  const ml = scene.ml_evidence
  const shapMax = ml ? Math.max(...[...ml.increasing, ...ml.decreasing].map((d) => Math.abs(d.shap)), 1) : 1

  return (
    <div>
      <PageHeader kicker="Explainability" st="6 · Explain before AI uses it" title="Why this score?"
        sub="Every point lost is accounted for: weighted components, nonlinear penalties and hard gate rules. Machine-learning models only provide evidence; the transparent hybrid engine makes the decision." />
      <FalseConfidenceBanner fc={scene.false_confidence} />

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-sky/20 to-teal/10 blur-2xl" />
        <div className="flex flex-wrap items-center gap-4">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setAsk(true)}
            className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-teal to-sky px-6 py-4 font-display text-lg font-bold text-white shadow-lift">
            <HelpCircle size={22} /> WHY SHOULD I TRUST THIS?
          </motion.button>
          <div className="text-sm text-ink-2">Plain-language explanation for the whole scene, or click a tile below for a tile-level answer.</div>
          <div className="flex-1" />
          <StatusBadge status={scene.status} size="lg" />
        </div>
        <AnimatePresence>
          {ask && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 rounded-2xl border border-sky/30 bg-skytint/50 p-5">
              <div className="label mb-2 flex items-center gap-1.5 text-sky"><Sparkles size={13} />TerraTrust explanation · {scene.scene_id}</div>
              <Typewriter text={narrative(scene, pname)} />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardTitle icon={TrendingDown} title="Score waterfall" sub="From perfect data (100) to the final Trust Score: points lost per component and penalty" />
          <Waterfall steps={scene.waterfall} />
        </Card>
        <Card>
          <CardTitle icon={Brain} title="ML evidence · XGBoost + TreeSHAP" sub="Trained on the Synthetic Corruption Benchmark. Evidence only, never the decision."
            right={ml && <div className="text-right"><div className="label text-[9px]">reliability</div><div className="num text-2xl font-bold text-sky">{ml.reliability.toFixed(0)}</div></div>} />
          {!ml ? <div className="text-sm text-ink-3">Model not trained</div> : (
            <div className="space-y-4">
              {[['Factors increasing trust', ml.increasing, '#16A34A'], ['Factors decreasing trust', ml.decreasing, '#DC2626']].map(([t, items, col]) => (
                <div key={t as string}>
                  <div className="label mb-2 text-[10px]">{t as string}</div>
                  {(items as typeof ml.increasing).length === 0 && <div className="text-xs text-ink-3">none</div>}
                  {(items as typeof ml.increasing).map((d) => (
                    <div key={d.feature} className="mb-1.5 flex items-center gap-2 text-xs">
                      <span className="w-40 truncate text-ink-2">{d.label}</span>
                      <span className="num w-14 text-right text-ink-3">{d.value}</span>
                      <div className="h-3 flex-1 rounded bg-surface-2"><motion.div className="h-full rounded" style={{ background: col as string }} initial={{ width: 0 }} animate={{ width: `${(Math.abs(d.shap) / shapMax) * 100}%` }} /></div>
                      <span className="num w-12 text-right font-semibold" style={{ color: col as string }}>{d.shap > 0 ? '+' : ''}{d.shap.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="rounded-xl bg-surface-2 px-3 py-2 text-[11px] text-ink-2">Base value {ml.base_value.toFixed(1)} + Σ SHAP = {ml.reliability.toFixed(1)}. Exact TreeSHAP via <code className="font-mono">pred_contribs</code>.</div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardTitle icon={Gavel} title="Gate rules & reasons" />
          <GateRules rules={scene.gate_rules_triggered} />
          <div className="mt-4"><Reasons pos={scene.reasons_positive} neg={scene.reasons_negative} /></div>
        </Card>
        <Card>
          <CardTitle icon={ListTree} title="Ask per tile" sub="Click any tile to open “Why should I trust this tile?”" />
          <SceneImageMap src={layerUrl(sceneId, 'original')} tiles={scene.tiles} onTile={setTile} selected={tile} label="click a tile" tileOpacity={0.45} />
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle icon={SlidersHorizontal} title="Weight tuner (what-if)" sub="Weights live in configs/weights.yaml. Tune them here to see the effect; gate rules still apply."
          right={what && <div className="flex items-center gap-3"><span className="num text-3xl font-bold" style={{ color: statusColor(what.status) }}>{what.trust_score.toFixed(1)}</span><StatusBadge status={what.status} /></div>} />
        {w && (
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
            {COMPONENTS.map((k) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-ink-2">{COMPONENT_LABELS[k]}</span><span className="num font-semibold">{w[k]}</span></div>
                <input type="range" min={0} max={50} value={w[k]} onChange={(e) => setW({ ...w, [k]: +e.target.value })} className="range w-full" />
              </div>
            ))}
          </div>
        )}
        <button onClick={() => cfg.data && setW(Object.fromEntries(Object.entries(cfg.data.weights).map(([k, v]) => [k, Math.round(v * 100)])))} className="btn-ghost mt-4 py-1.5 text-xs">Reset to YAML defaults</button>
      </Card>

      <Card className="mt-5">
        <CardTitle icon={FlaskConical} title="Validation: injected severity vs Trust Score" sub="Synthetic Corruption Benchmark solves the 'no ground truth' problem: known faults in, monotonic score response out."
          right={bench.data && <div className="flex gap-2"><span className="chip bg-mint text-teal">Spearman ρ = {bench.data.spearman.toFixed(2)}</span><span className="chip bg-skytint text-sky">XGB R² = {bench.data.xgb.r2.toFixed(2)} · MAE {bench.data.xgb.mae.toFixed(1)}</span></div>} />
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="label mb-2 text-[10px]">Single-fault sweeps (healthy base scene)</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={curves} margin={{ left: -14, right: 8 }}>
                <CartesianGrid stroke="#E2E8F0" />
                <XAxis dataKey="level" unit="%" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" label={{ value: 'injected severity', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Object.keys(FAULT_LABEL).map((k) => <Line key={k} dataKey={k} name={FAULT_LABEL[k]} stroke={FAULT_COLOR[k]} strokeWidth={2.2} dot={{ r: 2.5 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="label mb-2 text-[10px]">{bench.data?.n ?? ''} random multi-fault scenes</div>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ left: -14, right: 8 }}>
                <CartesianGrid stroke="#E2E8F0" />
                <XAxis dataKey="severity" type="number" domain={[0, 1]} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" />
                <YAxis dataKey="trust" domain={[0, 100]} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" />
                <ZAxis range={[28, 28]} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Scatter data={bench.data?.samples ?? []} shape={(p: { cx?: number; cy?: number; payload?: { status: string } }) => <circle cx={p.cx} cy={p.cy} r={3.6} fill={statusColor(p.payload?.status ?? 'PASS')} fillOpacity={0.7} />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
      <TileDrawer sceneId={sceneId} tileId={tile} onClose={() => setTile(null)} />
    </div>
  )
}
