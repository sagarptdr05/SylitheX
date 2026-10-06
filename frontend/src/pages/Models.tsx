import { motion } from 'framer-motion'
import { Activity, Boxes, BrainCircuit, CheckCircle2, Cpu, FlaskConical, Gauge, Loader2, Radar, RefreshCw, ScanLine, Sprout } from 'lucide-react'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { Card, CardTitle, PageHeader, Pill, Skeleton } from '../components/ui'
import { get, invalidate, post, useApi } from '../lib/api'
import { statusColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { AoiStatus } from '../lib/types'

interface Model { id: string; name: string; family: string; scope: string; purpose: string; trained_on: string; metrics: Record<string, string | number>; updated: string | null }
interface Reg { aoi: string; status: AoiStatus; models: Model[] }
interface Bench { samples: { severity: number; trust: number; status: string; aoi?: string }[]; spearman: number; xgb: { r2: number; mae: number; cv_r2?: number; cv_r2_std?: number }; n: number; aois?: string[]; per_aoi_spearman?: Record<string, number> }

const ICON: Record<string, typeof Cpu> = { physics: Radar, isoforest: Boxes, drift: Activity, pif: ScanLine, xgb: BrainCircuit, downstream: Sprout }

export default function Models() {
  const { activeAoi, refreshAois } = useStore()
  const [rev, setRev] = useState(0)
  const reg = useApi<Reg>('/api/models', [rev])
  const bench = useApi<Bench>('/api/benchmark')
  const [training, setTraining] = useState<AoiStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!training || !['building', 'queued'].includes(training.state)) return
    const t = setInterval(async () => {
      const s = await get<AoiStatus>(`/api/aois/${activeAoi?.id}/status`, true)
      setTraining(s)
      if (s.state === 'ready' || s.state === 'error') { invalidate('/api'); setRev((r) => r + 1); refreshAois() }
    }, 1500)
    return () => clearInterval(t)
  }, [training, activeAoi, refreshAois])

  const retrain = async () => {
    setErr(null)
    try { setTraining(await post<AoiStatus>('/api/models/retrain')) } catch (e) { setErr(String(e).replace(/^Error: /, '')) }
  }
  const busy = training && ['building', 'queued'].includes(training.state)

  return (
    <div>
      <PageHeader kicker="Models" st="validation" title="Every model, trained on real data"
        sub={`Five models are learned from ${activeAoi?.name ?? 'this location'}'s own 12-month archive; the XGBoost reliability model is shared and validated on synthetic corruption across all locations. Models provide evidence, transparent rules decide.`}
        right={
          <button onClick={retrain} disabled={!!busy} className="btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {busy ? 'Retraining…' : `Retrain models · ${activeAoi?.name.split('·')[0].trim() ?? ''}`}
          </button>
        } />

      {(busy || training?.state === 'ready') && training && (
        <Card className="mb-5 border-sky/30 bg-gradient-to-r from-skytint/60 to-surface">
          <div className="flex items-center gap-4">
            {busy ? <Loader2 className="animate-spin text-sky" /> : <CheckCircle2 className="text-pass" />}
            <div className="flex-1">
              <div className="text-sm font-semibold">{busy ? training.step : `Retrained in ${training.seconds ?? '?'} s · all scenes re-scored`}</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface"><motion.div className="h-full rounded-full bg-gradient-to-r from-teal to-sky" animate={{ width: `${training.progress * 100}%` }} /></div>
            </div>
            <span className="num text-lg font-bold text-sky">{Math.round(training.progress * 100)}%</span>
          </div>
        </Card>
      )}
      {err && <div className="mb-4 rounded-xl bg-block-bg px-4 py-2 text-sm text-block">{err}</div>}

      {!reg.data ? <Skeleton className="h-96" /> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {reg.data.models.map((m, i) => {
            const I = ICON[m.id] ?? Cpu
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card hover className="flex h-full flex-col">
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal to-sky text-white shadow-lift"><I size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[16px] font-bold leading-tight">{m.name}</div>
                      <div className="mt-0.5 text-xs text-ink-3">{m.family}</div>
                    </div>
                    <Pill tone={m.scope.startsWith('shared') ? 'sky' : 'teal'}>{m.scope}</Pill>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{m.purpose}</p>
                  <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2"><b className="text-ink">Trained on:</b> {m.trained_on}</div>
                  <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
                    {Object.entries(m.metrics).map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-line px-3 py-2">
                        <div className="text-[10.5px] leading-tight text-ink-3">{k}</div>
                        <div className="num mt-0.5 text-[15px] font-semibold text-ink">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-pass" />trained {m.updated ?? '·'}</div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle icon={FlaskConical} title="Validation: injected severity vs Trust Score" sub={`${bench.data?.n ?? '…'} synthetic-corruption scenes · known damage in, score must fall`} />
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: -14, right: 10, top: 6 }}>
              <CartesianGrid stroke="#E2E8F0" />
              <XAxis dataKey="severity" type="number" domain={[0, 1]} name="severity" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" label={{ value: 'injected severity', position: 'insideBottom', offset: -2, fontSize: 10 }} />
              <YAxis dataKey="trust" domain={[0, 100]} name="trust" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" />
              <ZAxis range={[26, 26]} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Scatter data={bench.data?.samples ?? []} shape={(p: { cx?: number; cy?: number; payload?: { status: string } }) => <circle cx={p.cx} cy={p.cy} r={3.4} fill={statusColor(p.payload?.status ?? 'PASS')} fillOpacity={0.7} />} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <CardTitle icon={Gauge} title="Scorecard" sub="Held-out and cross-validated" />
          {bench.data && (
            <div className="space-y-3">
              {[
                ['Spearman ρ (severity vs trust)', bench.data.spearman.toFixed(3), 'strong monotonic response'],
                ['XGBoost R² (20 % hold-out)', bench.data.xgb.r2.toFixed(3), `MAE ${bench.data.xgb.mae}`],
                ...(bench.data.xgb.cv_r2 != null ? [['XGBoost R² (5-fold CV)', `${bench.data.xgb.cv_r2.toFixed(3)} ± ${bench.data.xgb.cv_r2_std?.toFixed(3)}`, 'generalisation']] : []),
              ].map(([k, v, d]) => (
                <div key={k} className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
                  <div><div className="text-sm font-semibold">{k}</div><div className="text-[11px] text-ink-3">{d}</div></div>
                  <span className="num text-xl font-bold text-teal">{v}</span>
                </div>
              ))}
              {bench.data.per_aoi_spearman && (
                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="label mb-2 text-[10px]">Per location</div>
                  {Object.entries(bench.data.per_aoi_spearman).map(([a, v]) => (
                    <div key={a} className="flex justify-between py-0.5 font-mono text-xs"><span className={clsx(a === activeAoi?.id && 'font-bold text-teal')}>{a}</span><span>ρ = {v}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
