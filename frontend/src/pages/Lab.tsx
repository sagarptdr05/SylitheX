import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowRight, CalendarClock, Check, CloudRain, Copy, Cpu, Database, FlaskConical, Fingerprint, Gauge, Layers, Loader2, Play, Radar,
  RotateCcw, ScanLine, ShieldCheck, Sliders, Trees, Waves, Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import CompareSlider from '../components/CompareSlider'
import SceneImageMap, { TrustLegend } from '../components/SceneImageMap'
import { Card, CardTitle, InfoTip, MethodNote, PageHeader, Pill, StateBox, StatusBadge } from '../components/ui'
import { layerUrl, post } from '../lib/api'
import { fmtCompact, scoreColor, sevColor, statusColor } from '../lib/format'
import { useStore } from '../lib/store'
import { copyText, useToast } from '../lib/toast'
import type { GateRule, Status } from '../lib/types'

type Key = 'duplicate' | 'dropout' | 'timestamp_shift' | 'miscalibration' | 'ndvi_spike' | 'sar_inconsistency' | 'cloud_coverage' | 'noise' | 'flood_event'
interface Inj { k: Key; label: string; icon: typeof CloudRain; what: string; at: (s: number) => number; show: (v: number) => string; control?: boolean }

/** Each injector maps one global severity (0–1) onto its physical parameter. All faults are SYNTHETIC and labelled. */
const INJ: Inj[] = [
  { k: 'duplicate', label: 'Duplicate injection', icon: Copy, what: 'Replays an earlier acquisition under this record’s date', at: () => 1, show: () => 'replay' },
  { k: 'dropout', label: 'Missing data', icon: ScanLine, what: 'Stripe dropout: scan lines lost (no-data)', at: (s) => 0.05 + 0.35 * s, show: (v) => `${(v * 100).toFixed(0)}% rows` },
  { k: 'timestamp_shift', label: 'Timestamp corruption', icon: CalendarClock, what: 'Declared date shifted away from the sensing time', at: (s) => Math.round(1 + 8 * s), show: (v) => `+${v} days` },
  { k: 'miscalibration', label: 'Sensor drift', icon: Sliders, what: 'NIR (B08) gain error: radiometric calibration drift', at: (s) => -(0.08 + 0.3 * s), show: (v) => `${(v * 100).toFixed(0)}% gain` },
  { k: 'ndvi_spike', label: 'Outlier injection', icon: Zap, what: 'Physically impossible NDVI values (→ 1.4)', at: (s) => 0.03 + 0.15 * s, show: (v) => `${(v * 100).toFixed(0)}% area` },
  { k: 'sar_inconsistency', label: 'Suspicious change', icon: Radar, what: 'Optical change contradicted by Sentinel-1 radar', at: (s) => 0.15 + 0.5 * s, show: (v) => `${(v * 100).toFixed(0)}% area` },
  { k: 'cloud_coverage', label: 'Cloud contamination', icon: CloudRain, what: 'Bright cloud patches with offset shadows', at: (s) => 0.1 + 0.5 * s, show: (v) => `${(v * 100).toFixed(0)}% cover` },
  { k: 'noise', label: 'Sensor noise', icon: Activity, what: 'Optical Gaussian noise + SAR speckle', at: (s) => 0.15 + 0.7 * s, show: (v) => `σ ${v.toFixed(2)}` },
  { k: 'flood_event', label: 'Real flood (control)', icon: Waves, what: 'NOT a fault: a consistent S1+S2 event that must NOT be blocked', at: (s) => 0.05 + 0.2 * s, show: (v) => `${(v * 100).toFixed(0)}% area`, control: true },
]
const PRESETS: { name: string; on: Key[]; sev: number }[] = [
  { name: 'Sensor failure', on: ['dropout', 'ndvi_spike', 'noise'], sev: 0.5 },
  { name: 'Hidden drift', on: ['miscalibration'], sev: 0.5 },
  { name: 'Replayed data', on: ['duplicate'], sev: 0.5 },
  { name: 'Bad metadata', on: ['timestamp_shift'], sev: 0.4 },
  { name: 'Monsoon', on: ['cloud_coverage'], sev: 0.6 },
  { name: 'Real flood', on: ['flood_event'], sev: 0.5 },
]
const STAGES = [
  { t: 'Ingesting record', icon: Database }, { t: 'Integrity checks', icon: Fingerprint }, { t: 'Quality masks', icon: Gauge },
  { t: 'Anomaly & drift', icon: Radar }, { t: 'Radar cross-check', icon: Layers }, { t: 'Trust score & gate', icon: ShieldCheck },
  { t: 'Downstream impact', icon: Trees },
]

interface LabIssue { type: string; severity: string; why: string; action: string; n_tiles: number; area_pct: number; confidence: number }
interface LabResult {
  trust_score: number; trust_interval: [number, number]; status: Status; gate_rules_triggered: GateRule[]; synthetic: string[]
  tiles: { id: string; row: number; col: number; score: number; status: Status; reasons: string[] }[]; images: Record<string, string>
  latency_ms: number; issues: LabIssue[]
  carbon: {
    reference: { co2e_t: number; label: string }; naive: { co2e_t: number; label: string; error_pct: number }
    trusted?: { co2e_t: number; withheld: boolean; label: string; trust: number | null; error_pct: number; uncertainty_pct?: number; fallback_date?: string; recalibration?: { note: string } | null; tiles_excluded?: number }
    passport_checksum: string; method: string
  }
  response: { detected: number; rules: string[]; tiles_isolated: number; tiles_total: number; delivered_trust: number | null; delivered: 'fallback' | 'gated' }
}

function Big({ v, label, color, sub }: { v: string; label: string; color?: string; sub?: string }) {
  return (
    <div>
      <div className="label text-[10px]">{label}</div>
      <div className="num text-[44px] font-bold leading-none sm:text-[54px]" style={{ color }}>{v}</div>
      {sub && <div className="mt-1 text-[11.5px] text-ink-3">{sub}</div>}
    </div>
  )
}

export default function Lab() {
  const { profile, scenes, aoi, activeAoi } = useStore()
  const toast = useToast()
  const bases = useMemo(() => [{ id: 'DEMO-HEALTHY', label: 'Healthy demo scene' },
    ...scenes.filter((s) => !s.demo && s.status === 'PASS' && s.cloud_pct < 1).slice(-4).map((s) => ({ id: s.scene_id, label: `Clear · ${s.date.slice(0, 4)}-${s.date.slice(4, 6)}-${s.date.slice(6)}` }))], [scenes])
  const [base, setBase] = useState('DEMO-HEALTHY')
  const [on, setOn] = useState<Set<Key>>(new Set(['dropout', 'ndvi_spike', 'noise']))
  const [sev, setSev] = useState(0.5)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [stage, setStage] = useState(0)
  const [res, setRes] = useState<LabResult | null>(null)
  const [view, setView] = useState('compare')
  const seq = useRef(0)
  useEffect(() => { setBase('DEMO-HEALTHY'); setRes(null); setPhase('idle') }, [aoi])

  const baseScene = scenes.find((s) => s.scene_id === base)
  const params = useMemo(() => {
    const p: Record<string, number> = {}
    for (const i of INJ) if (on.has(i.k)) p[i.k] = i.at(sev)
    return p
  }, [on, sev])

  const run = async () => {
    const id = ++seq.current
    setPhase('running'); setStage(0)
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 330)
    const minWait = new Promise((r) => setTimeout(r, STAGES.length * 330))
    try {
      const [r] = await Promise.all([post<LabResult>('/api/inject-fault', { ...params, base_scene: base, profile }), minWait])
      if (id !== seq.current) return
      setRes(r); setPhase('done'); setView('compare')
    } catch {
      if (id === seq.current) setPhase('error')
    } finally { clearInterval(timer) }
  }
  const toggle = (k: Key) => setOn((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const c = res?.carbon
  const t = c?.trusted
  const before = baseScene?.trust_score
  return (
    <div>
      <PageHeader crumbs={['Platform', 'Simulation', 'Data Integrity Lab']} kicker="Simulation" st="3+4+5 · live" title="Data Integrity Lab"
        sub={`Deliberately inject bad data into a real, clean Sentinel scene of ${activeAoi?.name ?? 'this project'}, run the full trust pipeline, and see what the bad data would have done to a carbon estimate.`}
        right={<Pill tone="warn"><FlaskConical size={12} />Synthetic faults · clearly labelled</Pill>} />

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ------------------------------------------------ controls */}
        <Card className="xl:sticky xl:top-[84px] xl:self-start">
          <CardTitle icon={FlaskConical} title="Inject bad data" sub={`${on.size} injector${on.size === 1 ? '' : 's'} armed`}
            right={<button onClick={() => { setOn(new Set()); setRes(null); setPhase('idle') }} aria-label="Reset injectors" className="grid h-9 w-9 place-items-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink"><RotateCcw size={15} /></button>} />
          <label className="label mb-1 block text-[10px]" htmlFor="base">Clean base scene</label>
          <select id="base" value={base} onChange={(e) => setBase(e.target.value)} className="input mb-3 py-2">
            {bases.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <div className="scrollbar-none -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => { setOn(new Set(p.on)); setSev(p.sev) }} className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:border-primary/50 hover:text-strong">{p.name}</button>
            ))}
          </div>
          <div className="space-y-1.5" role="group" aria-label="Fault injectors">
            {INJ.map((i) => {
              const a = on.has(i.k)
              return (
                <button key={i.k} onClick={() => toggle(i.k)} aria-pressed={a}
                  className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                    a ? (i.control ? 'border-sky/60 bg-skytint' : 'border-block/50 bg-block/10') : 'border-line bg-surface-2/50 hover:border-line-2')}>
                  <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', a ? (i.control ? 'bg-sky/20 text-sky' : 'bg-block/20 text-block') : 'bg-surface-3 text-ink-3')}><i.icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{i.label}</span>
                    <span className="block truncate text-[11px] text-ink-3">{i.what}</span>
                  </span>
                  <span className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-md border', a ? 'border-transparent bg-primary text-white' : 'border-line-2')}>{a && <Check size={13} />}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-3">
            <div className="mb-2 flex items-center justify-between text-[12.5px]"><label htmlFor="sev" className="font-semibold">Severity</label><span className="num font-semibold text-warn">{(sev * 100).toFixed(0)}%</span></div>
            <input id="sev" type="range" className="range w-full" min={0} max={1} step={0.05} value={sev} onChange={(e) => setSev(+e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1">
              {INJ.filter((i) => on.has(i.k)).map((i) => <span key={i.k} className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{i.label.split(' ')[0]} {i.show(i.at(sev))}</span>)}
            </div>
          </div>
          <button onClick={run} disabled={phase === 'running' || on.size === 0} className="btn-primary mt-4 w-full justify-center py-3.5 text-[15px]">
            {phase === 'running' ? <><Loader2 size={18} className="animate-spin" />Running simulation…</> : <><Play size={18} />Run simulation</>}
          </button>
          {on.size === 0 && <p className="mt-2 text-center text-[11.5px] text-ink-3">Arm at least one injector or pick a preset.</p>}
        </Card>

        {/* ------------------------------------------------ results */}
        <div className="min-w-0 space-y-5">
          <AnimatePresence mode="popLayout">
            {phase === 'idle' && !res && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="grid min-h-[420px] place-items-center text-center">
                  <div className="max-w-md">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary"><FlaskConical size={28} /></div>
                    <h2 className="mt-4 text-xl font-bold text-strong">Ready to break some data</h2>
                    <p className="mt-2 text-sm text-ink-2">Choose injectors on the left and press <b className="text-strong">Run simulation</b>. The real pipeline runs on the corrupted record: integrity checks, quality masks, anomaly and drift detection, the radar cross-check, the Trust Score, the gate and the carbon estimate.</p>
                    <div className="mt-5 flex items-center justify-center gap-3 text-[12px] text-ink-3">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pass" />base trust <b className="num text-strong">{before?.toFixed(0) ?? '–'}</b></span>
                      <ArrowRight size={14} />
                      <span>?</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
            {phase === 'running' && (
              <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="min-h-[420px]">
                  <div className="label mb-4 text-[10px]">Processing corrupted record</div>
                  <div className="space-y-2.5">
                    {STAGES.map((s, i) => (
                      <div key={s.t} className={clsx('flex items-center gap-3 rounded-xl border px-3 py-2.5 transition', i < stage ? 'border-pass/30 bg-pass/5' : i === stage ? 'border-primary/60 bg-primary/10' : 'border-line opacity-50')}>
                        <span className={clsx('grid h-8 w-8 place-items-center rounded-lg', i < stage ? 'bg-pass/15 text-pass' : 'bg-primary/15 text-primary')}>
                          {i < stage ? <Check size={15} /> : i === stage ? <Loader2 size={15} className="animate-spin" /> : <s.icon size={15} />}
                        </span>
                        <span className="text-sm font-medium">{s.t}</span>
                        {i === stage && <span className="ml-auto h-1 w-24 overflow-hidden rounded-full bg-surface-3"><span className="block h-full w-1/2 animate-[shimmer_1s_linear_infinite] rounded-full bg-primary" /></span>}
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}
            {phase === 'error' && <StateBox key="err" kind="error" title="Simulation failed" text="The trust pipeline did not respond. Check that the backend is running, then try again." action="Retry" onAction={run} />}
          </AnimatePresence>

          {res && phase !== 'running' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* 1. trust before → after */}
              <Card className="overflow-hidden">
                <div className="grid gap-6 md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-center">
                  <Big label="Trust before" v={before?.toFixed(0) ?? '–'} color={before != null ? scoreColor(before) : undefined} sub="clean base scene" />
                  <ArrowRight className="hidden text-ink-3 md:block" size={28} />
                  <div>
                    <Big label="Trust after bad data" v={res.trust_score.toFixed(0)} color={scoreColor(res.trust_score)} sub={`${res.trust_interval[0].toFixed(0)}–${res.trust_interval[1].toFixed(0)} interval · ${res.latency_ms} ms`} />
                  </div>
                  <div className="space-y-2 md:pl-4">
                    <StatusBadge status={res.status} size="lg" />
                    <div className="text-sm text-ink-2"><b className="text-strong">{res.issues.length}</b> issue type{res.issues.length === 1 ? '' : 's'} detected{res.gate_rules_triggered.length > 0 && <> · gate: {res.gate_rules_triggered.map((g) => g.rule.replace(/_/g, ' ')).join(', ')}</>}</div>
                  </div>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {res.issues.slice(0, 8).map((i) => (
                    <div key={i.type} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(i.severity) }} />
                      <div className="min-w-0"><div className="text-[13px] font-semibold">{i.type} <span className="font-mono text-[10px]" style={{ color: sevColor(i.severity) }}>{i.severity}</span></div><div className="text-[11.5px] leading-snug text-ink-3">{i.why}</div></div>
                    </div>
                  ))}
                  {res.issues.length === 0 && <div className="text-sm text-pass">No issues found: the record is consistent.</div>}
                </div>
              </Card>

              {/* 2. imagery */}
              <Card>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {[['compare', 'Before / After'], ['trust', 'Trust map'], ['cloudmask', 'Detected masks'], ['sar', 'S1 radar']].map(([k, l]) => (
                    <button key={k} onClick={() => setView(k)} className={clsx('rounded-lg px-3 py-1.5 text-xs font-semibold', view === k ? 'bg-primary text-white' : 'bg-surface-2 text-ink-2 hover:text-strong')}>{l}</button>
                  ))}
                </div>
                <div className="mx-auto max-w-[620px]">
                  {view === 'compare' ? <CompareSlider before={layerUrl(base, 'original')} after={res.images.original} beforeLabel="BEFORE · CLEAN" afterLabel="AFTER · BAD DATA" />
                    : <SceneImageMap src={view === 'trust' ? res.images.original : (res.images[view] ?? res.images.original)} tiles={view === 'trust' ? res.tiles : []} showTiles={view === 'trust'} />}
                  {view === 'trust' && <div className="mt-2"><TrustLegend /></div>}
                </div>
              </Card>

              {/* 3. downstream */}
              {c && (
                <Card>
                  <CardTitle icon={Trees} title="Downstream impact: carbon estimate" sub="Same project, same estimator, three inputs" right={<InfoTip text={`${c.method}. Above-ground carbon of the whole project area, in tCO₂e. Indicative only.`} />} />
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
                      <div className="label text-[10px]">Before (clean)</div>
                      <div className="num mt-1 text-3xl font-bold text-strong">{fmtCompact(c.reference.co2e_t)}</div>
                      <div className="text-[11.5px] text-ink-3">tCO₂e · reference</div>
                    </div>
                    <div className="rounded-2xl border border-block/40 bg-block/10 p-4">
                      <div className="label text-[10px] text-block">After bad data · no trust layer</div>
                      <div className="num mt-1 text-3xl font-bold text-strong">{fmtCompact(c.naive.co2e_t)}</div>
                      <div className="num text-[13px] font-bold text-block">error {c.naive.error_pct > 0 ? '+' : ''}{c.naive.error_pct.toFixed(1)}%</div>
                    </div>
                    <div className="rounded-2xl border border-pass/40 bg-pass/10 p-4">
                      <div className="label text-[10px] text-pass">With TerraTrust</div>
                      <div className="num mt-1 text-3xl font-bold text-strong">{t ? fmtCompact(t.co2e_t) : 'withheld'}</div>
                      {t && <div className="num text-[13px] font-bold text-pass">error {t.error_pct > 0 ? '+' : ''}{t.error_pct.toFixed(1)}%{t.uncertainty_pct != null && <span className="font-normal text-ink-3"> · ±{t.uncertainty_pct.toFixed(0)}% stated</span>}</div>}
                      <div className="mt-1 text-[11px] leading-snug text-ink-3">{t?.label}</div>
                    </div>
                  </div>
                  <div className="mt-3"><MethodNote>Indicative IPCC Tier-1 style estimate from Sentinel-2 only (land cover → biomass defaults × NDVI → carbon fraction 0.47). The comparison is like-for-like; the absolute numbers are not a certified MRV claim.</MethodNote></div>
                </Card>
              )}

              {/* 4. response */}
              <Card>
                <CardTitle icon={ShieldCheck} title="Trust layer response" sub="What TerraTrust did with the bad record" />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <ul className="space-y-2.5">
                    {[
                      [res.response.detected > 0, 'Issue detected', res.response.detected > 0 ? `${res.issues.length} issue types, ${res.response.rules.length} gate rule${res.response.rules.length === 1 ? '' : 's'}` : 'record is consistent: nothing to catch'],
                      [true, 'Records isolated', res.status === 'BLOCKED' ? 'whole record blocked: never delivered downstream' : `${res.response.tiles_isolated}/${res.response.tiles_total} tiles excluded${res.status === 'WARNING' ? ' · routed to human review' : ''}`],
                      [true, 'Provenance preserved', `original untouched · faults logged · checksum ${c?.passport_checksum.slice(0, 10)}…`],
                      [!!t, 'Trusted version generated', res.response.delivered === 'fallback' ? `nearest trusted acquisition used (${t?.fallback_date ?? '–'})` : t?.recalibration ? t.recalibration.note : 'gated pixels only, uncertainty widened'],
                    ].map(([ok, title, detail], i) => (
                      <motion.li key={title as string} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 * i }} className="flex items-start gap-3">
                        <span className={clsx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full', ok ? 'bg-pass/20 text-pass' : 'bg-surface-3 text-ink-3')}><Check size={14} /></span>
                        <div><div className="text-sm font-semibold">{title as string}</div><div className="text-[12px] text-ink-3">{detail as string}</div></div>
                      </motion.li>
                    ))}
                  </ul>
                  <div className="rounded-2xl border border-pass/40 bg-pass/10 px-6 py-5 text-center">
                    <div className="label text-[10px] text-pass">Trust of delivered data</div>
                    <div className="num text-[48px] font-bold leading-none" style={{ color: res.response.delivered_trust != null ? scoreColor(res.response.delivered_trust) : undefined }}>{res.response.delivered_trust?.toFixed(0) ?? '–'}</div>
                    <div className="text-[11px] text-ink-3">/ 100 · {res.response.delivered === 'fallback' ? 'fallback acquisition' : 'excluding blocked tiles'}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[11.5px] text-ink-3">
                  <span>Faults applied:</span>{res.synthetic.map((s) => <span key={s} className="rounded-md bg-warn/10 px-1.5 py-0.5 font-mono text-[10.5px] text-warn">{s}</span>)}
                  <button onClick={() => copyText(JSON.stringify({ params, base, result: { trust: res.trust_score, status: res.status, carbon: c } }, null, 2), toast, 'Simulation record copied')} className="ml-auto flex items-center gap-1 font-semibold text-primary hover:text-primary-hover"><Copy size={12} />Copy record</button>
                </div>
              </Card>
              <div className="flex items-center gap-2 text-[12px] text-ink-3"><Cpu size={13} />Every number above comes from the live pipeline run, not from a script. <span style={{ color: statusColor(res.status) }}>●</span></div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
