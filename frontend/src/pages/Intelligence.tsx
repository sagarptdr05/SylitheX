import { motion } from 'framer-motion'
import {
  Activity, AlertTriangle, ArrowRight, Box, CheckCircle2, ChevronRight, CircleSlash, Cpu, EyeOff, Fingerprint, GitBranch, Layers, Leaf,
  Loader2, Map as MapIcon, Network, PlayCircle, Radar, RefreshCw, Satellite, ScanSearch, Sparkles, Sprout, Trees, TrendingDown, Waves, XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardTitle, PageHeader, Skeleton, StatusBadge } from '../components/ui'
import { get, layerUrl, useApi } from '../lib/api'
import { fmtDate, scoreColor, statusColor } from '../lib/format'
import { useStore } from '../lib/store'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Check = { metric: string; label: string; op: string; required: string; observed: string; ok: boolean; hard: boolean; fix: string | null }
type Fit = { id: string; name: string; short: string; icon: string; product: string; status: 'GO' | 'CONDITIONAL' | 'NO-GO'; score: number; checks: Check[]; passed: number; total: number; why: string; actions: string[] }
type Fb = { kind: string; title: string; confidence: number; why: string; scene_id?: string; date?: string; gap_days?: number }
interface Bundle {
  silent: { risk: number; level: string; visual_quality: number; clean_tiles: number; hidden_tiles: { id: string; row: number; col: number; why: string[] }[]; hidden_fraction: number; evidence: string[]; headline: string; method: string }
  fitness: Record<string, Fit>
  impact: {
    weighted: { by_use_case: Record<string, { name: string; weighted_quality: number; raw_quality: number; affected_relevant_pct: number; relevant_area_pct: number }>; relevance: Record<string, number[]>; method: string }
    contamination: { acquisition: string; upstream_sources: { date: string; gap_days: number; pixels: number }[]; downstream_scenes: { scene_id: string; date: string; pixels: number; pct: number; status: string; trust: number }[]; radius: number; borrowed_pixels: number; message: string; products_at_risk: string[] }
    graph: { nodes: { id: string; col: number; label: string; sub: string; trust: number; status: string; detail: string }[]; edges: { from: string; to: string }[] }
  }
  fallbacks: Record<string, Fb[]>
}
interface Loc {
  debt: { current: number; level: string; peak: { date: string; debt: number }; series: { date: string; scene_id: string; added: number; debt: number; status: string; top: string | null }[]; sources: { source: string; share: number; points: number }[]; actions: string[]; method: string }
  memory: { n_scenes: number; grid: { id: string; row: number; col: number; count: number; cloudy: number }[]; hotspots: { id: string; occurrences: number; dominant: string; issues: Record<string, number>; first: string; last: string; pattern: string; share: number }[]; summary: string }
}

const ICON: Record<string, typeof Leaf> = { map: MapIcon, sprout: Sprout, waves: Waves, activity: Activity, trees: Trees, leaf: Leaf }
const ST: Record<string, { c: string; bg: string; icon: typeof CheckCircle2; label: string }> = {
  GO: { c: '#16A34A', bg: '#DCFCE7', icon: CheckCircle2, label: 'GO' },
  CONDITIONAL: { c: '#D97706', bg: '#FEF3C7', icon: AlertTriangle, label: 'CONDITIONAL' },
  'NO-GO': { c: '#DC2626', bg: '#FEE2E2', icon: XCircle, label: 'NO-GO' },
}
const NODE_C: Record<string, string> = { ok: '#16A34A', warn: '#D97706', bad: '#DC2626' }
const TABS = [
  { id: 'fit', label: 'Fit-for-purpose preflight', icon: CheckCircle2 },
  { id: 'silent', label: 'Silent failure', icon: EyeOff },
  { id: 'impact', label: 'Impact & trust graph', icon: Network },
  { id: 'debt', label: 'Data debt & memory', icon: TrendingDown },
  { id: 'repro', label: 'Reproducibility', icon: Fingerprint },
]
const FLOW = ['Raw data', 'Quality', 'Anomalies', 'Provenance', 'Trust', 'Fit-for-purpose', 'Impact', 'Decision']

function TileGrid({ src, n, cells, legend }: { src: string; n: number; cells: { row: number; col: number; color: string; opacity: number; label?: string; ring?: boolean }[]; legend?: React.ReactNode }) {
  return (
    <div>
      <div className="hud-corners relative aspect-square overflow-hidden rounded-2xl border" style={{ borderColor: 'rgba(14,165,233,.6)' }}>
        <img src={src} className="absolute inset-0 h-full w-full object-cover" />
        <svg viewBox={`0 0 ${n} ${n}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {cells.map((c, i) => (
            <rect key={i} x={c.col + 0.04} y={c.row + 0.04} width={0.92} height={0.92} rx={0.08} fill={c.color} fillOpacity={c.opacity}
              stroke={c.ring ? '#fff' : 'none'} strokeWidth={c.ring ? 0.07 : 0}><title>{c.label}</title></rect>
          ))}
        </svg>
      </div>
      {legend && <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-2">{legend}</div>}
    </div>
  )
}

export default function Intelligence() {
  const { scene, sceneId, setSceneId, activeAoi } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState('fit')
  const [uc, setUc] = useState('carbon')
  const [relLayer, setRelLayer] = useState<'crop' | 'flood' | 'urban'>('crop')
  const [repro, setRepro] = useState<any>(null)
  const [reproBusy, setReproBusy] = useState(false)
  const q = useApi<Bundle>(`/api/scene/${sceneId}/intelligence`)
  const loc = useApi<Loc>('/api/intelligence/location')
  const d = q.data
  const n = scene ? Math.round(Math.sqrt(scene.tiles.length)) : 8
  const fit = d?.fitness[uc]
  const counts = useMemo(() => {
    const c = { GO: 0, CONDITIONAL: 0, 'NO-GO': 0 }
    if (d) Object.values(d.fitness).forEach((f) => (c[f.status] += 1))
    return c
  }, [d])
  if (!scene || !d) return <Skeleton className="h-[700px]" />
  const open = (sid?: string) => { if (sid) { setSceneId(sid); } }
  const runRepro = async () => { setReproBusy(true); setRepro(null); try { setRepro(await get(`/api/scene/${sceneId}/reproduce`, true)) } finally { setReproBusy(false) } }

  return (
    <div>
      <PageHeader kicker="Trust intelligence" st="beyond ST-03" title="Is this data fit for this decision?"
        sub="Valid is not the same as trustworthy for a purpose. TerraTrust checks each scene against the requirements of six downstream uses, finds failures that look normal, traces contamination through provenance, and tracks the quality debt a location accumulates."
        right={<div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2 shadow-card">
          <img src={layerUrl(sceneId, 'original')} className="h-10 w-10 rounded-lg object-cover" />
          <div><div className="text-sm font-semibold">{scene.info.title}</div><div className="font-mono text-[10px] text-ink-3">{fmtDate(scene.date)} · trust {scene.trust_score.toFixed(0)}</div></div>
          <StatusBadge status={scene.status} size="sm" />
        </div>} />

      {/* progression */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-surface/70 p-2">
        {FLOW.map((f, i) => (
          <div key={f} className="flex items-center gap-1.5">
            <span className={clsx('rounded-lg px-2.5 py-1 text-[11.5px] font-semibold', i >= 5 ? 'bg-gradient-to-r from-teal to-sky text-white' : 'bg-surface-2 text-ink-2')}>{f}</span>
            {i < FLOW.length - 1 && <ChevronRight size={13} className="text-ink-3" />}
          </div>
        ))}
        <span className="ml-auto pr-2 text-[11px] text-ink-3">highlighted = what most QA tools stop short of</span>
      </div>

      {/* summary strip */}
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-2">
          <div className="label">Fit-for-purpose across 6 uses</div>
          <div className="mt-2 flex items-center gap-3">
            {(['GO', 'CONDITIONAL', 'NO-GO'] as const).map((k) => (
              <div key={k} className="flex-1 rounded-xl px-3 py-2" style={{ background: ST[k].bg }}>
                <div className="num text-2xl font-bold" style={{ color: ST[k].c }}>{counts[k]}</div>
                <div className="text-[11px] font-semibold" style={{ color: ST[k].c }}>{k}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="label">Silent failure risk</div>
          <div className="num mt-1 text-3xl font-bold" style={{ color: d.silent.level === 'HIGH' ? '#DC2626' : d.silent.level === 'MEDIUM' ? '#D97706' : '#16A34A' }}>{d.silent.level}</div>
          <div className="text-[11px] text-ink-2">risk {d.silent.risk.toFixed(0)}/100 · visual quality {d.silent.visual_quality.toFixed(0)}</div>
        </Card>
        <Card>
          <div className="label">Contamination radius</div>
          <div className="num mt-1 text-3xl font-bold text-sky">{d.impact.contamination.radius}</div>
          <div className="text-[11px] text-ink-2">other scenes built from this acquisition</div>
        </Card>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={clsx('flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition', tab === t.id ? 'bg-ink text-white shadow-lift' : 'border border-line bg-surface text-ink-2 hover:border-teal/40')}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      <div>
        <motion.div key={tab} initial={{ opacity: 0.6, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'fit' && fit && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {Object.values(d.fitness).map((f) => {
                  const I = ICON[f.icon] ?? Box, s = ST[f.status]
                  return (
                    <button key={f.id} onClick={() => setUc(f.id)} className={clsx('card card-pad text-left transition hover:shadow-lift', uc === f.id && 'ring-2 ring-teal')}>
                      <div className="flex items-center justify-between"><I size={18} className="text-teal" /><span className="chip text-[10px]" style={{ background: s.bg, color: s.c }}><s.icon size={11} />{s.label}</span></div>
                      <div className="mt-2 text-sm font-semibold leading-tight">{f.name}</div>
                      <div className="mt-2 flex items-end justify-between">
                        <span className="num text-2xl font-bold" style={{ color: s.c }}>{f.score.toFixed(0)}</span>
                        <span className="font-mono text-[10px] text-ink-3">{f.passed}/{f.total} checks</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
                <Card>
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: ST[fit.status].bg }}>
                    {(() => { const I = ST[fit.status].icon; return <I size={40} style={{ color: ST[fit.status].c }} /> })()}
                    <div className="flex-1">
                      <div className="font-mono text-xs font-semibold tracking-widest" style={{ color: ST[fit.status].c }}>DATA PREFLIGHT · {fit.name.toUpperCase()}</div>
                      <div className="font-display text-3xl font-extrabold" style={{ color: ST[fit.status].c }}>{fit.status}</div>
                      <div className="mt-1 text-sm text-ink">{fit.why}</div>
                    </div>
                    <div className="text-right"><div className="label">fitness</div><div className="num text-4xl font-bold" style={{ color: ST[fit.status].c }}>{fit.score.toFixed(0)}</div></div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {fit.checks.map((c) => (
                      <div key={c.metric} className={clsx('flex items-center gap-3 rounded-xl border px-3 py-2.5', c.ok ? 'border-line' : c.hard ? 'border-block/30 bg-block-bg/40' : 'border-warn/30 bg-warn-bg/50')}>
                        {c.ok ? <CheckCircle2 size={18} className="text-pass" /> : c.hard ? <XCircle size={18} className="text-block" /> : <AlertTriangle size={18} className="text-warn" />}
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{c.label} <span className="font-mono text-[11px] font-normal text-ink-3">needs {c.op} {c.required}{c.hard ? ' · hard' : ' · soft'}</span></div>
                          {c.fix && <div className="text-[12px] text-ink-2">→ {c.fix}</div>}
                        </div>
                        <span className="num text-sm font-bold" style={{ color: c.ok ? '#16A34A' : c.hard ? '#DC2626' : '#D97706' }}>{c.observed}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <div className="space-y-5">
                  <Card>
                    <CardTitle icon={GitBranch} title="Recommended alternatives" sub={fit.status === 'GO' ? 'Not needed: this scene is fit for the task' : 'Ranked by fitness × time proximity'} />
                    {fit.status === 'GO' ? <div className="flex items-center gap-2 rounded-xl bg-pass-bg px-3 py-3 text-sm text-pass"><CheckCircle2 size={16} />Use this scene as-is for {fit.short}.</div> :
                      (d.fallbacks[uc] ?? []).length === 0 ? (
                        <div className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2"><CircleSlash size={15} className="mr-1 inline text-ink-3" />No trustworthy alternative within ±45 days. Do not run {fit.short} on this window; wait for the next clear acquisition.</div>
                      ) : (
                        <div className="space-y-2">
                          {(d.fallbacks[uc] ?? []).map((f, i) => (
                            <button key={i} onClick={() => f.kind === 'acquisition' && open(f.scene_id)} className="flex w-full items-center gap-3 rounded-xl border border-line p-2.5 text-left transition hover:border-teal/40 hover:bg-mint/30">
                              {f.kind === 'acquisition' ? <img src={layerUrl(f.scene_id!, 'original')} className="h-12 w-12 rounded-lg object-cover" /> :
                                <span className="grid h-12 w-12 place-items-center rounded-lg bg-skytint text-sky">{f.kind === 'radar' ? <Radar size={20} /> : <Layers size={20} />}</span>}
                              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{f.title}</div><div className="truncate text-[11px] text-ink-2">{f.why}</div></div>
                              <div className="text-right"><div className="num font-bold text-teal">{f.confidence.toFixed(0)}%</div><div className="text-[9px] text-ink-3">confidence</div></div>
                            </button>
                          ))}
                        </div>
                      )}
                  </Card>
                  {fit.actions.length > 0 && (
                    <Card>
                      <CardTitle icon={Sparkles} title="Remediation" sub="What would make this scene fit" />
                      <ol className="space-y-2">{fit.actions.map((a, i) => <li key={a} className="flex gap-2 text-sm"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mint font-mono text-[10px] font-bold text-teal">{i + 1}</span>{a}</li>)}</ol>
                    </Card>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === 'silent' && (
            <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <Card>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-pass-bg/60 p-5 text-center">
                    <div className="label">What it looks like</div>
                    <div className="num mt-1 text-5xl font-bold text-pass">{d.silent.visual_quality.toFixed(0)}</div>
                    <div className="text-xs text-ink-2">visual quality (clouds, gaps)</div>
                  </div>
                  <div className="rounded-2xl p-5 text-center" style={{ background: d.silent.level === 'HIGH' ? '#FEE2E2' : d.silent.level === 'MEDIUM' ? '#FEF3C7' : '#DCFCE7' }}>
                    <div className="label">What is hidden</div>
                    <div className="num mt-1 text-5xl font-bold" style={{ color: d.silent.level === 'HIGH' ? '#DC2626' : d.silent.level === 'MEDIUM' ? '#D97706' : '#16A34A' }}>{d.silent.level}</div>
                    <div className="text-xs text-ink-2">silent-failure risk {d.silent.risk.toFixed(0)}/100</div>
                  </div>
                </div>
                <div className={clsx('mt-4 rounded-2xl border-2 p-4', d.silent.level === 'LOW' ? 'border-pass/30' : 'border-warn')}>
                  <div className="flex items-center gap-2 font-display text-[15px] font-bold">{d.silent.level !== 'LOW' && <EyeOff size={17} className="text-warn" />}{d.silent.headline}</div>
                  <ul className="mt-2 space-y-1.5">{d.silent.evidence.length ? d.silent.evidence.map((e) => <li key={e} className="flex gap-2 text-sm"><ScanSearch size={15} className="mt-0.5 shrink-0 text-sky" />{e}</li>) : <li className="text-sm text-ink-3">No hidden evidence found.</li>}</ul>
                </div>
                <div className="mt-4 rounded-xl bg-surface-2 p-3 text-[12px] text-ink-2">
                  <b className="text-ink">Why this matters:</b> calibration drift, radar/optical contradictions and unconfirmed jumps stay inside normal value ranges, so downstream models produce believable but wrong results. Standard QA (cloud %, missing %) reports this scene as clean.
                  <div className="mt-1 font-mono text-[10.5px]">{d.silent.method}</div>
                </div>
              </Card>
              <Card>
                <CardTitle icon={EyeOff} title="Where the hidden issues are" sub={`${d.silent.clean_tiles} clean-looking tiles · ${d.silent.hidden_tiles.length} carry hidden issues`} />
                <TileGrid src={layerUrl(sceneId, 'original')} n={n}
                  cells={scene.tiles.map((t) => {
                    const h = d.silent.hidden_tiles.find((x) => x.id === t.id)
                    const clean = t.cloud + t.shadow < 5 && t.missing < 1 && t.reconstructed < 5
                    return { row: t.row, col: t.col, color: h ? '#D97706' : clean ? '#16A34A' : '#0A1220', opacity: h ? 0.62 : clean ? 0.12 : 0.55, ring: !!h, label: h ? `${t.id}: ${h.why.join('; ')}` : clean ? `${t.id}: clean & consistent` : `${t.id}: visibly degraded (cloud/gap)` }
                  })}
                  legend={<><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-warn" />hidden issue (looks clean)</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-pass/30" />clean & consistent</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-ink/60" />visibly degraded</span></>} />
                <div className="scrollbar-thin mt-3 max-h-40 space-y-1 overflow-y-auto">
                  {d.silent.hidden_tiles.slice(0, 12).map((h) => <div key={h.id} className="flex gap-2 text-xs"><span className="w-10 font-mono font-bold">{h.id}</span><span className="text-ink-2">{h.why.join(' · ')}</span></div>)}
                </div>
              </Card>
            </div>
          )}

          {tab === 'impact' && (
            <>
              <Card>
                <CardTitle icon={Network} title="Trust graph" sub="Trust flows from sensors through processing and models into every downstream product: an upstream failure visibly contaminates what depends on it" />
                <TrustGraph g={d.impact.graph} />
              </Card>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_1fr]">
                <Card>
                  <CardTitle icon={MapIcon} title="Impact-weighted quality" sub="Not all bad pixels matter equally: issues are weighted by how relevant each tile is to the task" />
                  <div className="space-y-2.5">
                    {Object.entries(d.impact.weighted.by_use_case).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[110px_1fr_70px] items-center gap-3">
                        <span className="text-sm font-semibold">{v.name}</span>
                        <div>
                          <div className="relative h-2.5 rounded-full bg-surface-2"><div className="absolute h-full rounded-full" style={{ width: `${v.weighted_quality}%`, background: scoreColor(v.weighted_quality) }} /><div className="absolute -top-0.5 h-3.5 w-0.5 bg-ink" style={{ left: `${v.raw_quality}%` }} title="unweighted" /></div>
                          <div className="mt-0.5 text-[10.5px] text-ink-3">issues hit {v.affected_relevant_pct}% of task-relevant area</div>
                        </div>
                        <span className="num text-right font-bold" style={{ color: scoreColor(v.weighted_quality) }}>{v.weighted_quality.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] text-ink-3">bar = impact-weighted · black tick = plain average · {d.impact.weighted.method}</div>
                </Card>
                <Card>
                  <CardTitle icon={Sprout} title="Task relevance map" sub="Where each use case actually looks" right={
                    <div className="flex gap-1">{(['crop', 'flood', 'urban'] as const).map((r) => <button key={r} onClick={() => setRelLayer(r)} className={clsx('rounded-lg px-2 py-1 text-[11px] font-semibold', relLayer === r ? 'bg-teal text-white' : 'bg-surface-2 text-ink-2')}>{r === 'crop' ? 'Cropland' : r === 'flood' ? 'Water-prone' : 'Built-up'}</button>)}</div>} />
                  <TileGrid src={layerUrl(sceneId, 'original')} n={n}
                    cells={scene.tiles.map((t, i) => ({ row: t.row, col: t.col, color: relLayer === 'crop' ? '#16A34A' : relLayer === 'flood' ? '#0891B2' : '#7C3AED', opacity: 0.08 + 0.6 * (d.impact.weighted.relevance[relLayer]?.[i] ?? 0), label: `${t.id}: relevance ${(d.impact.weighted.relevance[relLayer]?.[i] ?? 0).toFixed(2)} · tile trust ${t.score.toFixed(0)}`, ring: t.score < 80 && (d.impact.weighted.relevance[relLayer]?.[i] ?? 0) > 0.5 }))}
                    legend={<span>Darker = more relevant · white outline = relevant tile with trust &lt; 80</span>} />
                </Card>
              </div>
              <Card className="mt-5">
                <CardTitle icon={GitBranch} title="Contamination radius (provenance blast radius)" sub={d.impact.contamination.message} />
                <div className="grid gap-5 lg:grid-cols-[1fr_auto_1.4fr]">
                  <div>
                    <div className="label mb-2">Upstream · this scene borrowed pixels from</div>
                    {d.impact.contamination.upstream_sources.length ? d.impact.contamination.upstream_sources.map((u) => (
                      <div key={u.date} className="mb-1 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-xs"><span>{u.date}</span><span className="text-ink-3">{u.gap_days > 0 ? '+' : ''}{u.gap_days} d · {(u.pixels / 1000).toFixed(0)}k px</span></div>
                    )) : <div className="text-xs text-ink-3">Nothing: fully observed</div>}
                  </div>
                  <div className="hidden items-center lg:flex"><div className="flex flex-col items-center gap-1"><Satellite className="text-teal" /><span className="font-mono text-[10px] text-ink-3">{d.impact.contamination.acquisition}</span><ArrowRight className="text-ink-3" /></div></div>
                  <div>
                    <div className="label mb-2">Downstream · scenes that reconstructed from this acquisition ({d.impact.contamination.radius})</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {d.impact.contamination.downstream_scenes.slice(0, 8).map((s) => (
                        <button key={s.scene_id} onClick={() => open(s.scene_id)} className="flex items-center gap-2 rounded-xl border border-line p-2 text-left hover:border-teal/40">
                          <img src={layerUrl(s.scene_id, 'original')} className="h-10 w-10 rounded-lg object-cover" />
                          <div className="flex-1"><div className="font-mono text-[11px]">{s.date}</div><div className="text-[10.5px] text-ink-3">{s.pct}% of its pixels from here</div></div>
                          <span className="num text-xs font-bold" style={{ color: statusColor(s.status) }}>{s.trust.toFixed(0)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}

          {tab === 'debt' && (!loc.data ? <Skeleton className="h-96" /> : (
            <>
              <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <Card>
                  <CardTitle icon={TrendingDown} title={`EO data debt · ${activeAoi?.name ?? ''}`} sub="Unresolved quality uncertainty that reached downstream users, accumulated over time (halves every 60 days as fresh data arrives)"
                    right={<div className="text-right"><div className="num text-3xl font-bold" style={{ color: loc.data.debt.level === 'HIGH' ? '#DC2626' : loc.data.debt.level === 'MEDIUM' ? '#D97706' : '#16A34A' }}>{loc.data.debt.current.toFixed(0)}</div><div className="text-[11px] font-semibold text-ink-3">{loc.data.debt.level} debt</div></div>} />
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={loc.data.debt.series} margin={{ left: -14, right: 8 }}>
                      <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#DC2626" stopOpacity={0.35} /><stop offset="1" stopColor="#DC2626" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickFormatter={(v) => v.slice(2, 7)} stroke="#94A3B8" minTickGap={30} />
                      <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v, k) => [Number(v).toFixed(1), k === 'debt' ? 'debt' : 'added']} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.top ?? 'no new debt'}`} />
                      <Area type="monotone" dataKey="debt" stroke="#DC2626" strokeWidth={2.2} fill="url(#dg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-2 font-mono text-[10.5px] text-ink-3">{loc.data.debt.method}</div>
                </Card>
                <Card>
                  <CardTitle icon={AlertTriangle} title="Where the debt comes from" />
                  <div className="space-y-3">
                    {loc.data.debt.sources.map((s) => (
                      <div key={s.source}>
                        <div className="flex justify-between text-sm"><span>{s.source}</span><span className="num font-semibold">{s.share}%</span></div>
                        <div className="mt-1 h-2 rounded-full bg-surface-2"><motion.div className="h-full rounded-full bg-block/80" initial={{ width: 0 }} animate={{ width: `${s.share}%` }} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="label mb-2 mt-5">Pay it down</div>
                  <ol className="space-y-1.5">{loc.data.debt.actions.map((a, i) => <li key={a} className="flex gap-2 text-sm"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mint font-mono text-[10px] font-bold text-teal">{i + 1}</span>{a}</li>)}</ol>
                  <button onClick={() => nav('/review')} className="btn-ghost mt-4 py-2 text-xs">Open Human Review <ArrowRight size={13} /></button>
                </Card>
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.1fr]">
                <Card>
                  <CardTitle icon={Cpu} title="Quality memory" sub={loc.data.memory.summary} />
                  {(() => {
                    const mx = Math.max(1, ...loc.data.memory.grid.map((g) => g.count))
                    return <TileGrid src={layerUrl('DEMO-HEALTHY', 'original')} n={n}
                      cells={loc.data.memory.grid.map((g) => ({ row: g.row, col: g.col, color: '#DC2626', opacity: 0.05 + 0.65 * (g.count / mx), ring: g.count >= 3, label: `${g.id}: non-weather issues in ${g.count}/${loc.data!.memory.n_scenes} scenes · cloudy ${g.cloudy}×` }))}
                      legend={<span>Redder = issue recurs more often (clouds excluded) · outlined = recurring hotspot (≥ 3)</span>} />
                  })()}
                </Card>
                <Card>
                  <CardTitle icon={RefreshCw} title="Recurring hotspots" sub="The same tile failing again is a systematic problem, not bad luck" />
                  <div className="scrollbar-thin max-h-[440px] space-y-2 overflow-y-auto">
                    {loc.data.memory.hotspots.map((h) => (
                      <div key={h.id} className="rounded-xl border border-line p-3">
                        <div className="flex items-center justify-between"><span className="font-mono font-bold">{h.id}</span><span className={clsx('chip text-[10px]', h.pattern === 'Persistent' ? 'bg-block-bg text-block' : 'bg-warn-bg text-warn-ink')}>{h.pattern} · {h.occurrences}×</span></div>
                        <div className="mt-1 text-sm">Dominant: <b>{h.dominant}</b> <span className="text-ink-3">({Object.entries(h.issues).map(([k, v]) => `${k} ${v}`).join(', ')})</span></div>
                        <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">first {fmtDate(h.first)} · last {fmtDate(h.last)} · in {h.share}% of acquisitions</div>
                      </div>
                    ))}
                    {loc.data.memory.hotspots.length === 0 && <div className="text-sm text-ink-3">No recurring hotspots.</div>}
                  </div>
                </Card>
              </div>
            </>
          ))}

          {tab === 'repro' && (
            <Card>
              <CardTitle icon={Fingerprint} title="Can this decision be reproduced?" sub="Re-run the full pipeline now from SHA-256-hashed raw inputs, configuration and models, and compare with the stored result" />
              <button onClick={runRepro} disabled={reproBusy} className="btn-primary">{reproBusy ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}Re-run & verify</button>
              {repro && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                  <div className={clsx('flex items-center gap-3 rounded-2xl p-4', repro.reproducible ? 'bg-pass-bg' : 'bg-block-bg')}>
                    {repro.reproducible ? <CheckCircle2 className="text-pass" size={28} /> : <XCircle className="text-block" size={28} />}
                    <div className="flex-1"><div className="font-display text-lg font-bold">{repro.reproducible ? 'Reproducible ✓' : 'Not reproducible'}</div><div className="text-sm">{repro.message}</div></div>
                    <div className="text-right font-mono text-xs">stored {repro.stored.trust} · {repro.stored.status}<br />re-run {repro.rerun.trust} · {repro.rerun.status} · {repro.rerun.ms} ms</div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    {(['inputs', 'configs', 'models'] as const).map((k) => (
                      <div key={k} className="rounded-xl border border-line p-3">
                        <div className="label mb-2">{k}</div>
                        {Object.entries(repro.provenance[k] as Record<string, string | null>).map(([f, h]) => (
                          <div key={f} className="flex justify-between gap-2 py-0.5 font-mono text-[10.5px]"><span className="truncate">{f}</span><span className="text-ink-3">{h ? h.slice(0, 12) + '…' : 'n/a'}</span></div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 break-all rounded-xl bg-space p-3 font-mono text-[11px]" style={{ color: '#A7F3D0' }}>bundle sha256 {repro.provenance.bundle} · {repro.provenance.pipeline_version}</div>
                </motion.div>
              )}
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  )
}

function TrustGraph({ g }: { g: Bundle['impact']['graph'] }) {
  const cols = [0, 1, 2, 3, 4, 5]
  const W = 1180, colX = (c: number) => 20 + c * 196, NW = 170, NH = 52
  const pos: Record<string, { x: number; y: number }> = {}
  let H = 0
  cols.forEach((c) => {
    const ns = g.nodes.filter((n) => n.col === c)
    const gap = c >= 4 ? 64 : 92
    const top = c >= 4 ? 10 : 10 + (6 - ns.length) * 32
    ns.forEach((n, i) => { pos[n.id] = { x: colX(c), y: top + i * gap }; H = Math.max(H, top + i * gap + NH + 10) })
  })
  const HEAD = ['Sensors', 'Processing', 'Models', 'Trust', 'Use cases', 'Products']
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="min-w-[900px]" style={{ width: '100%' }}>
        {HEAD.map((h, i) => <text key={h} x={colX(i) + NW / 2} y={H + 18} textAnchor="middle" fontSize="11" fontFamily="JetBrains Mono" fill="#94A3B8">{h.toUpperCase()}</text>)}
        {g.edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to]
          if (!a || !b) return null
          const to = g.nodes.find((n) => n.id === e.to)!
          const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2
          return <path key={i} d={`M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`} fill="none" stroke={NODE_C[to.status]} strokeOpacity={0.45} strokeWidth={to.status === 'bad' ? 2.4 : 1.6} strokeDasharray={to.status === 'bad' ? '6 4' : undefined}>
            {to.status !== 'ok' && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />}
          </path>
        })}
        {g.nodes.map((n) => {
          const p = pos[n.id]
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}>
              <title>{`${n.label}: ${n.detail}`}</title>
              <rect width={NW} height={NH} rx={12} fill="#fff" stroke={NODE_C[n.status]} strokeWidth={2} />
              <rect width={6} height={NH} rx={3} fill={NODE_C[n.status]} />
              <text x={16} y={21} fontSize="12.5" fontWeight="700" fill="#E8EEF7" fontFamily="Inter">{n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}</text>
              <text x={16} y={39} fontSize="10.5" fill={NODE_C[n.status]} fontFamily="JetBrains Mono">{n.sub}</text>
              <text x={NW - 10} y={21} fontSize="12" fontWeight="700" textAnchor="end" fill={NODE_C[n.status]} fontFamily="JetBrains Mono">{Math.round(n.trust)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
