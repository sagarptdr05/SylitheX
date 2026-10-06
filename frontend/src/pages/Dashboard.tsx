import { motion } from 'framer-motion'
import { ArrowRight, Bot, ChevronRight, Database, FlaskConical, GitBranch, Radar, Satellite, ScanSearch, Trees, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import clsx from 'clsx'
import Globe from '../components/Globe'
import Sheet from '../components/Sheet'
import TrustPipeline from '../components/TrustPipeline'
import TrustRing, { ComponentBars } from '../components/TrustRing'
import Waterfall from '../components/Waterfall'
import { Card, CardTitle, InfoTip, MethodNote, Skeleton, StatusBadge } from '../components/ui'
import { useApi } from '../lib/api'
import { fmtCompact, fmtDate, scoreColor, sevColor, statusColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { AnomalyFeed, SceneCarbon } from '../lib/types'

interface TL { points: { date: string; trust: number; status: string; cloud: number }[] }
interface DS { experiments: { id: string; title: string; task: string; without: number; with: number | null; blocked?: boolean }[] }

function Kpi({ label, value, sub, tone, icon: Icon, tip, to }: { label: string; value: React.ReactNode; sub: React.ReactNode; tone?: string; icon: typeof Database; tip: string; to?: string }) {
  const body = (
    <div className="group flex h-full flex-col justify-between rounded-2xl border border-line bg-surface/70 p-4 transition hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5 text-[10px]">{label}<InfoTip text={tip} /></span>
        <Icon size={16} className="text-ink-3 transition group-hover:text-primary" />
      </div>
      <div className="num mt-2 text-[30px] font-bold leading-none" style={{ color: tone }}>{value}</div>
      <div className="mt-1.5 text-[11.5px] text-ink-3">{sub}</div>
    </div>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}

export default function Dashboard() {
  const { scene, scenes, sceneId, setSceneId, aois, aoi, setAoi, activeAoi } = useStore()
  const an = useApi<AnomalyFeed>('/api/anomalies')
  const carbon = useApi<SceneCarbon>(sceneId ? `/api/carbon/scene/${sceneId}` : null)
  const tl = useApi<TL>('/api/timeline')
  const ds = useApi<DS>('/api/downstream')
  const sats = useApi<{ id: string; sensor: string; acquisitions: number }[]>('/api/constellation')
  const [why, setWhy] = useState(false)
  const [pass, setPass] = useState<string | null>(null)
  const nav = useNavigate()

  const real = useMemo(() => scenes.filter((s) => !s.demo).sort((a, b) => (a.date < b.date ? 1 : -1)), [scenes])
  const latest = real[0]
  const chips = [
    ...(latest ? [{ id: latest.scene_id, label: `Latest · ${fmtDate(latest.date)}`, status: latest.status }] : []),
    ...scenes.filter((s) => s.demo).map((s) => ({ id: s.scene_id, label: s.title.split(' · ')[0].replace('Suspicious / corrupted', 'Corrupted'), status: s.status })),
  ]
  const ready = aois.filter((a) => a.status.state === 'ready')
  const health = real.slice(0, 10)
  const healthV = health.length ? health.reduce((a, s) => a + s.trust_score, 0) / health.length : null
  const major = (an.data?.items ?? []).filter((i) => ['CRITICAL', 'HIGH'].includes(i.severity))
  const provOk = scene ? scene.metadata_checks.filter((c) => c.status === 'ok').length / Math.max(1, scene.metadata_checks.length) * 100 : null
  const c = carbon.data
  const delivered = c ? (c.trusted.withheld ? c.fallback : c.trusted) : null
  const errPct = c && delivered?.co2e_t ? (100 * (c.naive.co2e_t - delivered.co2e_t)) / delivered.co2e_t : null

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ HERO: globe + verdict */}
      <section className="theme-dark relative overflow-hidden rounded-3xl border border-line bg-[radial-gradient(ellipse_at_30%_0%,#0E2246_0%,#070D1A_55%,#04070F_100%)]">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="relative h-[330px] sm:h-[420px] lg:h-[520px]">
            <Globe className="absolute inset-0" aois={ready.map((a) => ({ id: a.id, name: a.name, lat: a.lat, lon: a.lon, trust: a.avg_trust }))} active={aoi}
              onPass={setPass} onSelect={(id) => id !== aoi && setAoi(id)} />
            <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-sky">
                <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-pass opacity-70" /><span className="relative h-2 w-2 rounded-full bg-pass" /></span>
                Live trust layer
              </div>
              <h1 className="mt-2 max-w-[280px] text-[17px] font-bold leading-snug text-strong drop-shadow-[0_2px_12px_rgba(0,0,0,.8)] sm:max-w-[360px] sm:text-[23px]">Can this Earth-observation data be trusted <span className="text-gradient">before</span> it drives a decision?</h1>
              <div className="mt-2 font-mono text-[11px] text-ink-3">{activeAoi?.name} · {activeAoi?.lat.toFixed(2)}°N {activeAoi?.lon.toFixed(2)}°E</div>
            </div>
            <div className="pointer-events-none absolute inset-x-4 bottom-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-2 sm:inset-x-6">
              {[['#38BDF8', 'Sentinel-2 optical'], ['#D97706', 'Sentinel-1 radar'], ['#16A34A', 'Trusted'], ['#D97706', 'Review'], ['#DC2626', 'Blocked']].map(([c, l], i) => (
                <span key={i} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
              ))}
              {ready.length > 1 && <span className="ml-auto hidden text-ink-3 2xl:inline">click a marker to switch project</span>}
            </div>
            {pass && <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-sky/40 bg-bg/70 px-2.5 py-1 font-mono text-[10.5px] text-sky backdrop-blur">▲ {pass} over project</div>}
          </div>

          <div className="relative flex flex-col gap-4 border-t border-line/70 p-4 sm:p-6 lg:border-l lg:border-t-0">
            <div>
              <div className="label text-[10px]">Select a dataset to verify</div>
              <div className="scrollbar-none -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {chips.map((ch) => (
                  <button key={ch.id} onClick={() => setSceneId(ch.id)} aria-pressed={sceneId === ch.id}
                    className={clsx('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition',
                      sceneId === ch.id ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-surface-2/70 text-ink-2 hover:border-line-2 hover:text-ink')}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(ch.status) }} />{ch.label}
                  </button>
                ))}
              </div>
            </div>
            {scene ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
                <TrustRing score={scene.trust_score} interval={scene.trust_interval} status={scene.status} components={scene.components} size={228} onExplain={() => setWhy(true)} />
                <div className="w-full min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={scene.status} size="lg" />{scene.synthetic.length > 0 && <span className="chip border border-warn/30 bg-warn-bg text-warn">synthetic faults</span>}</div>
                  <div className="text-[15px] font-semibold text-strong">{scene.info.title}</div>
                  <p className="text-[12.5px] leading-relaxed text-ink-2">{scene.reasons_negative[0] ?? scene.reasons_positive[0]}</p>
                  <button onClick={() => setWhy(true)} className="flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:text-primary-hover">Why {scene.trust_score.toFixed(0)}? See the breakdown <ChevronRight size={14} /></button>
                </div>
              </div>
            ) : <Skeleton className="h-[228px]" />}
          </div>
        </div>
        {/* pipeline strip */}
        <div className="relative border-t border-line/70 bg-bg/40 px-4 py-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="label text-[10px]">Earth observation → trust, in real time</div>
            {scene && <div className="font-mono text-[10.5px] text-ink-3">{scene.scene_id} · processed in {scene.processing_ms} ms</div>}
          </div>
          {scene ? <TrustPipeline scene={scene} /> : <Skeleton className="h-20" />}
        </div>
      </section>

      {/* ------------------------------------------------ KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Data health" icon={Satellite} tone={healthV != null ? scoreColor(healthV) : undefined} value={healthV != null ? `${healthV.toFixed(0)}%` : '–'}
          sub={healthV == null ? 'no acquisitions' : `${healthV >= 80 ? 'Excellent' : healthV >= 65 ? 'Good' : 'Degraded'} · last ${health.length} acquisitions`}
          tip="Mean Trust Score of the 10 most recent real Sentinel-2 acquisitions of this project (demo scenarios excluded)." to="/timeline" />
        <Kpi label="Datasets" icon={Database} value={scenes.length} sub={`${real.length} real · ${scenes.length - real.length} demo scenarios`}
          tip="Every acquisition (and curated demo scenario) that passed through the trust layer for this project." to="/sources" />
        <Kpi label="Anomalies" icon={Radar} tone={major.length ? '#EA580C' : '#16A34A'} value={an.data ? major.length : '–'}
          sub={an.data ? `high / critical · ${an.data.total} findings total` : 'loading'} tip="Anomaly, drift and integrity findings across all datasets of this project with HIGH or CRITICAL severity." to="/anomalies" />
        <Kpi label="Sources" icon={Satellite} value={sats.data?.length ?? '–'} sub={`satellites · ${sats.data ? sats.data.reduce((a, s) => a + s.acquisitions, 0) : '–'} acquisitions · S2 + S1`} tip="Sentinel-2 (multispectral optical) and Sentinel-1 (C-band SAR) spacecraft that delivered data for this project; radar cross-checks optical changes." to="/sources" />
      </div>

      {/* ------------------------------------------------ quality / downstream / anomalies */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardTitle icon={ScanSearch} title="Data quality" sub="Trust components of the selected dataset" right={<Link to="/quality" className="text-xs font-semibold text-primary">Details</Link>} />
          {scene ? <ComponentBars components={scene.components} extra={[{ label: 'Provenance completeness', value: provOk }]} /> : <Skeleton className="h-64" />}
        </Card>

        <Card>
          <CardTitle icon={Trees} title="Downstream impact" sub="What this data does to a carbon estimate" right={<Link to="/carbon" className="text-xs font-semibold text-primary">Carbon MRV</Link>} />
          {!c ? <Skeleton className="h-64" /> : (
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="flex items-center justify-between text-[11px] text-ink-3"><span>Without trust layer</span><span>raw record as delivered</span></div>
                <div className="num mt-1 text-2xl font-bold text-ink-2">{fmtCompact(c.naive.co2e_t)} <span className="text-sm font-medium text-ink-3">tCO₂e</span></div>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: statusColor(c.status) + '55', background: statusColor(c.status) + '10' }}>
                <div className="flex items-center justify-between text-[11px] text-ink-3"><span>With TerraTrust</span><span>{c.trusted.withheld ? `blocked → ${c.fallback?.date ?? 'no fallback'}` : c.trusted.recalibration ? 'recalibrated + gated' : 'gated pixels only'}</span></div>
                <div className="num mt-1 text-2xl font-bold text-strong">{delivered ? fmtCompact(delivered.co2e_t) : 'withheld'} <span className="text-sm font-medium text-ink-3">tCO₂e</span></div>
                {delivered && <div className="mt-0.5 text-[11.5px] text-ink-2">± {delivered.uncertainty_pct.toFixed(0)}% · confidence follows trust {(c.trusted.withheld ? c.fallback?.trust_score : c.trust_score)?.toFixed(0)}</div>}
              </div>
              {errPct != null && Math.abs(errPct) >= 1 && (
                <div className="flex items-center gap-2 text-[12.5px]"><TriangleAlert size={15} className="text-warn" /><span>Untrusted data would shift the claim by <b className="num" style={{ color: '#EA580C' }}>{errPct > 0 ? '+' : ''}{errPct.toFixed(1)}%</b></span></div>
              )}
              {ds.data && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {ds.data.experiments.filter((e) => e.with != null).slice(0, 2).map((e) => (
                    <span key={e.id} className="chip bg-surface-3 text-ink-2"><Bot size={12} />{e.task}: {e.without.toFixed(0)}% → <b className="text-pass">{e.with!.toFixed(0)}%</b></span>
                  ))}
                </div>
              )}
              <MethodNote>Indicative IPCC Tier-1 style estimate from Sentinel-2 only. It shows how trust propagates; it is not a certified MRV result.</MethodNote>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle icon={Radar} title="Major anomalies" sub="Where is the problem?" right={<Link to="/anomalies" className="text-xs font-semibold text-primary">Explorer</Link>} />
          {!an.data ? <Skeleton className="h-64" /> : major.length === 0 ? (
            <div className="grid h-56 place-items-center rounded-xl border border-dashed border-pass/30 text-center text-sm text-ink-2"><div><div className="font-mono text-xs font-bold tracking-[0.16em] text-pass">NO MAJOR ANOMALIES</div><p className="mt-1 text-xs text-ink-3">Nothing high or critical in this project.</p></div></div>
          ) : (
            <ul className="space-y-2">
              {major.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <button onClick={() => nav(`/anomalies?focus=${encodeURIComponent(i.id)}`)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-left transition hover:border-line-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute h-full w-full animate-ping rounded-full opacity-50" style={{ background: sevColor(i.severity) }} /><span className="relative h-2.5 w-2.5 rounded-full" style={{ background: sevColor(i.severity) }} /></span>
                    <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{i.type}</div><div className="truncate text-[11px] text-ink-3">{i.scene_title} · {fmtDate(i.date)} · {i.area_pct.toFixed(0)}% of area</div></div>
                    <span className="font-mono text-[10px] font-bold" style={{ color: sevColor(i.severity) }}>{i.severity}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------ trend + next actions */}
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardTitle icon={Satellite} title="Trust over 12 months" sub="Every real acquisition, scored before use" right={<Link to="/timeline" className="text-xs font-semibold text-primary">Timeline</Link>} />
          {tl.data ? (
            <div className="h-[200px]">
              <ResponsiveContainer>
                <AreaChart data={tl.data.points} margin={{ left: -24, right: 6, top: 6 }}>
                  <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2563EB" stopOpacity={0.45} /><stop offset="1" stopColor="#2563EB" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} minTickGap={30} stroke="rgb(var(--line-2))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="rgb(var(--line-2))" />
                  <Tooltip formatter={(v) => [Number(v).toFixed(1), 'Trust']} labelFormatter={(d) => fmtDate(String(d))} />
                  <Area type="monotone" dataKey="trust" stroke="#2563EB" strokeWidth={2} fill="url(#dg)" dot={(p) => <circle key={p.index} cx={p.cx} cy={p.cy} r={2.5} fill={statusColor((p.payload as { status: string }).status)} />} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <Skeleton className="h-[200px]" />}
        </Card>
        <Card>
          <CardTitle icon={ArrowRight} title="What to do next" sub="Follow the data story" />
          <div className="space-y-2">
            {[
              { to: '/sources', icon: Database, t: 'Inspect the dataset', d: 'Metadata, quality, versions and preview' },
              { to: '/provenance', icon: GitBranch, t: 'Trace its provenance', d: 'From the satellite to the carbon report' },
              { to: '/lab', icon: FlaskConical, t: 'Inject bad data live', d: 'Watch the trust layer catch it' },
            ].map((a) => (
              <Link key={a.to} to={a.to} className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3 py-3 transition hover:border-primary/50">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary"><a.icon size={17} /></span>
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{a.t}</div><div className="text-[11.5px] text-ink-3">{a.d}</div></div>
                <ChevronRight size={16} className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Sheet open={why && !!scene} onClose={() => setWhy(false)} kicker="Why this score?" title={scene ? `${scene.trust_score.toFixed(0)} / 100 · ${scene.info.title}` : ''} width={540}>
        {scene && (
          <div className="space-y-5">
            <div>
              <div className="label mb-2">From 100 to {scene.trust_score.toFixed(0)}</div>
              <Waterfall steps={scene.waterfall} />
            </div>
            {scene.gate_rules_triggered.length > 0 && (
              <div>
                <div className="label mb-2">Gate rules fired</div>
                <ul className="space-y-1.5">{scene.gate_rules_triggered.map((g) => <li key={g.rule} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px]"><b style={{ color: g.action === 'BLOCK' ? '#DC2626' : '#D97706' }}>{g.action}</b> · {g.message}</li>)}</ul>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><div className="label mb-2 text-pass">Raises trust</div><ul className="space-y-1.5 text-[12.5px] text-ink-2">{scene.reasons_positive.slice(0, 5).map((r) => <li key={r}>✓ {r}</li>)}</ul></div>
              <div><div className="label mb-2 text-block">Lowers trust</div><ul className="space-y-1.5 text-[12.5px] text-ink-2">{scene.reasons_negative.slice(0, 5).map((r) => <li key={r}>✕ {r}</li>)}{!scene.reasons_negative.length && <li className="text-ink-3">Nothing significant</li>}</ul></div>
            </div>
            <Link to="/explain" className="btn-ghost w-full justify-center">Open full explainability (SHAP, tiles)</Link>
          </div>
        )}
      </Sheet>
      <motion.div />
    </div>
  )
}
