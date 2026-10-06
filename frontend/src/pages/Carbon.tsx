import { motion } from 'framer-motion'
import { ArrowDown, ArrowRight, BadgeCheck, Leaf, Map as MapIcon, Satellite, ShieldCheck, Sprout, Trees, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import clsx from 'clsx'
import { SceneSwitcher } from '../components/Layout'
import { Card, CardTitle, InfoTip, MethodNote, PageHeader, Skeleton, StateBox, StatusBadge } from '../components/ui'
import { layerUrl, useApi } from '../lib/api'
import { fmtCompact, fmtDate, fmtInt, scoreColor, statusColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { CarbonEstimate, SceneCarbon } from '../lib/types'

interface Loc {
  aoi: string; series: { date: string; co2e_t: number; lo: number; hi: number; agb_t_ha: number; clear_pct: number; dense_pct: number; crop_pct: number }[]
  change: { from: string; to: string; same_season: boolean; compared_pct: number; changed_pct: number; loss_dense_ha: number; gain_dense_ha: number; co2e_delta_t: number; transitions: { from: string; to: string; area_ha: number }[] } | null
  method: { name: string; steps: string[]; limits: string }; classes: { id: number; name: string; color: string; agb_default_t_ha: number }[]
}

function Flow({ c }: { c: SceneCarbon }) {
  const d = c.trusted.withheld ? c.fallback : c.trusted
  const st = c.status === 'PASS' ? 'ok' : c.status === 'WARNING' ? 'warn' : 'fail'
  const col = { ok: '#16A34A', warn: '#D97706', fail: '#DC2626' }[st]
  const dense = d?.cover.find((x) => x.id === 4)
  const steps = [
    { icon: Satellite, t: 'Trusted EO data', v: c.trusted.withheld ? 'blocked' : `trust ${c.trust_score.toFixed(0)}`, s: c.trusted.withheld ? `fallback ${c.fallback?.date ?? '–'}` : `${c.trusted.observed_pct?.toFixed(0)}% usable pixels`, col },
    { icon: MapIcon, t: 'Land cover (LULC)', v: dense ? `${dense.pct.toFixed(0)}% dense veg.` : '–', s: '5 classes from spectral indices', col: '#2563EB' },
    { icon: Sprout, t: 'Biomass', v: d ? `${d.agb_t_ha.toFixed(1)} t/ha` : '–', s: 'above-ground, Tier-1 defaults × NDVI', col: '#2563EB' },
    { icon: Trees, t: 'Carbon estimate', v: d ? `${fmtCompact(d.co2e_t)} tCO₂e` : 'withheld', s: d ? `± ${d.uncertainty_pct.toFixed(0)}%` : 'no trusted input', col: '#2563EB' },
    { icon: ShieldCheck, t: 'Verification', v: c.status === 'PASS' ? 'verifiable' : c.status === 'WARNING' ? 'needs review' : 'not verifiable', s: 'Trust Passport + hashes', col },
  ]
  return (
    <div className="grid gap-2 md:grid-cols-5 md:gap-0">
      {steps.map((x, i) => (
        <div key={x.t} className="relative flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3 md:mx-1.5 md:flex-col md:items-start">
          {i > 0 && <ArrowRight size={16} className="absolute -left-[15px] top-1/2 hidden -translate-y-1/2 text-ink-3 md:block" />}
          {i > 0 && <ArrowDown size={14} className="absolute -top-[13px] left-6 text-ink-3 md:hidden" />}
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: x.col + '22', color: x.col }}><x.icon size={17} /></span>
          <div className="min-w-0">
            <div className="label text-[9.5px]">{String(i + 1).padStart(2, '0')} · {x.t}</div>
            <div className="num mt-0.5 text-[14px] font-bold text-strong">{x.v}</div>
            <div className="text-[11px] text-ink-3">{x.s}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Cover({ e }: { e: CarbonEstimate }) {
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full">{e.cover.map((c) => <div key={c.id} style={{ width: `${c.pct}%`, background: c.color }} title={`${c.name} ${c.pct}%`} />)}</div>
      {e.cover.map((c) => (
        <div key={c.id} className="grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2 text-[12.5px]">
          <span className="h-3 w-3 rounded-sm" style={{ background: c.color }} />
          <span className="truncate text-ink-2">{c.name}</span>
          <span className="num text-ink-3">{fmtInt(c.area_ha)} ha</span>
          <span className="num w-12 text-right font-semibold">{c.pct.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function Carbon() {
  const { sceneId, activeAoi } = useStore()
  const sc = useApi<SceneCarbon>(sceneId ? `/api/carbon/scene/${sceneId}` : null)
  const loc = useApi<Loc>('/api/carbon/location')
  const [layer, setLayer] = useState<'lulc' | 'biomass' | 'rgb'>('lulc')
  const c = sc.data
  const d = c ? (c.trusted.withheld ? c.fallback : c.trusted) : undefined
  const err = c && d ? (100 * (c.naive.co2e_t - d.co2e_t)) / d.co2e_t : null
  return (
    <div className="space-y-5">
      <PageHeader crumbs={['Platform', 'Carbon MRV']} kicker="Carbon MRV" title="Carbon MRV on a trust foundation"
        sub={`${activeAoi?.name ?? ''}: land cover, biomass and carbon are computed only from data that passed the trust layer, and every number carries its trust score and uncertainty.`}
        right={<div className="w-full sm:w-auto sm:min-w-[300px]"><SceneSwitcher /></div>} />

      <MethodNote><b className="text-strong">Prototype science, clearly labelled.</b> {loc.data?.method.name ?? 'Indicative IPCC Tier-1 style proxy'}: {loc.data?.method.limits ?? ''}</MethodNote>

      {!c ? (sc.error ? <StateBox kind="error" title="Carbon estimate unavailable" text={sc.error} /> : <Skeleton className="h-28" />) : <Flow c={c} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle icon={MapIcon} title="Project area" sub={c ? `${fmtInt(c.trusted.area_ha ?? d?.area_ha)} ha · ${c.scene_id}` : 'loading'}
            right={<div className="flex rounded-lg bg-surface-2 p-0.5">{(['lulc', 'biomass', 'rgb'] as const).map((k) => <button key={k} onClick={() => setLayer(k)} className={clsx('rounded-md px-2.5 py-1 text-[11.5px] font-semibold', layer === k ? 'bg-primary text-white' : 'text-ink-2')}>{k === 'lulc' ? 'Land cover' : k === 'biomass' ? 'Biomass' : 'True colour'}</button>)}</div>} />
          {!c ? <Skeleton className="aspect-square" /> : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="hud-corners relative aspect-square overflow-hidden rounded-2xl border border-line bg-bg">
                <img src={layer === 'rgb' ? layerUrl(c.scene_id, 'original') : c.images[layer]} alt={`${layer} map`} className="h-full w-full object-cover [image-rendering:pixelated]" />
                {c.trusted.withheld && layer !== 'rgb' && <div className="absolute inset-0 grid place-items-center bg-bg/70 p-6 text-center backdrop-blur-[2px]"><div><TriangleAlert className="mx-auto text-block" /><div className="mt-2 font-mono text-xs font-bold tracking-[0.16em] text-block">INPUT BLOCKED</div><p className="mt-1 text-xs text-ink-2">This acquisition failed the Trust Gate. Its land cover is shown only for inspection; the carbon estimate uses the nearest trusted acquisition ({c.fallback?.date}).</p></div></div>}
                <div className="absolute bottom-2 left-2 rounded-md bg-bg/80 px-2 py-1 font-mono text-[10px] text-ink-2">{fmtDate(c.date)} · Sentinel-2 · 10 m</div>
              </div>
              <div>{layer === 'biomass' ? (
                <div className="space-y-2 text-[12px]"><div className="label text-[10px]">Above-ground biomass</div><div className="h-3 rounded-full bg-gradient-to-r from-[#f7fcb9] via-[#41ab5d] to-[#003c1e]" /><div className="flex justify-between font-mono text-[10px] text-ink-3"><span>0</span><span>~10</span><span>130 t/ha</span></div><p className="text-ink-3">Class default density scaled by NDVI (clipped 0.6–1.4×).</p></div>
              ) : d ? <Cover e={d} /> : null}</div>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-pass/10 blur-3xl" />
            <CardTitle icon={Leaf} title="Carbon estimate" sub="Above-ground carbon stock of the project area" right={c && <StatusBadge status={c.status} size="sm" />} />
            {!c ? <Skeleton className="h-40" /> : !d ? <StateBox title="Estimate withheld" text="No trusted acquisition is available to fall back on." /> : (
              <motion.div key={c.scene_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-wrap items-baseline gap-2"><span className="num text-[44px] font-bold leading-none text-strong">{fmtInt(d.co2e_t)}</span><span className="text-sm text-ink-3">tCO₂e</span></div>
                <div className="mt-1 text-[12.5px] text-ink-2">Range {fmtInt(d.co2e_interval[0])} – {fmtInt(d.co2e_interval[1])} · {d.co2e_t_ha.toFixed(1)} tCO₂e/ha</div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[10.5px] text-ink-3">Trust <InfoTip text="Trust Score of the data the estimate is built on. For a blocked acquisition this is the trust of the fallback acquisition." /></div><div className="num text-lg font-bold" style={{ color: scoreColor((c.trusted.withheld ? c.fallback?.trust_score : c.trust_score) ?? 0) }}>{(c.trusted.withheld ? c.fallback?.trust_score : c.trust_score)?.toFixed(0)}</div></div>
                  <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[10.5px] text-ink-3">Uncertainty</div><div className="num text-lg font-bold text-strong">±{d.uncertainty_pct.toFixed(0)}%</div></div>
                  <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[10.5px] text-ink-3">Observed</div><div className="num text-lg font-bold text-strong">{d.observed_pct.toFixed(0)}%</div></div>
                </div>
                {c.trusted.recalibration && <div className="mt-3 rounded-xl border border-sky/30 bg-skytint px-3 py-2 text-[12px] text-ink-2"><b className="text-sky">Radiometric recalibration applied:</b> {c.trusted.recalibration.note}</div>}
                {c.trusted.withheld && <div className="mt-3 rounded-xl border border-block/30 bg-block-bg px-3 py-2 text-[12px] text-ink-2"><b className="text-block">Selected acquisition blocked.</b> Estimate shown from the nearest trusted acquisition ({c.fallback?.date}).</div>}
              </motion.div>
            )}
          </Card>
          <Card>
            <CardTitle icon={ShieldCheck} title="Supporting evidence" sub="Why this number can (or cannot) be trusted" />
            {!c ? <Skeleton className="h-32" /> : (
              <div className="space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"><span className="text-ink-2">Without trust layer (raw record)</span><span className="num font-semibold">{fmtCompact(c.naive.co2e_t)} tCO₂e</span></div>
                <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"><span className="text-ink-2">Difference vs trusted estimate</span><span className="num font-semibold" style={{ color: err != null && Math.abs(err) > 5 ? '#EA580C' : '#16A34A' }}>{err == null ? '–' : `${err > 0 ? '+' : ''}${err.toFixed(1)}%`}</span></div>
                <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"><span className="text-ink-2">Tiles excluded by the gate</span><span className="num font-semibold">{c.trusted.tiles_excluded ?? 0}/{c.trusted.tiles_total ?? 64}</span></div>
                <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"><span className="text-ink-2">Reconstructed pixels used</span><span className="num font-semibold">{c.trusted.recon_share_pct?.toFixed(1) ?? 0}%</span></div>
                <div className="flex gap-2 pt-1"><Link to="/provenance" className="btn-ghost flex-1 justify-center text-xs">Trace lineage</Link><Link to="/passport" className="btn-ghost flex-1 justify-center text-xs"><BadgeCheck size={14} />Passport</Link></div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle icon={Trees} title="Carbon stock over time" sub="Clear acquisitions only (≥85% clear sky); band = stated uncertainty" />
          {!loc.data ? (loc.error ? <StateBox title="No clear acquisitions" text="This project has no cloud-free acquisitions for a carbon series yet." /> : <Skeleton className="h-64" />) : (
            <div className="h-[260px]">
              <ResponsiveContainer>
                <ComposedChart data={loc.data.series.map((s) => ({ ...s, band: [s.lo, s.hi] }))} margin={{ left: 0, right: 8, top: 6 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(2, 7)} minTickGap={24} stroke="rgb(var(--line-2))" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCompact(v)} stroke="rgb(var(--line-2))" width={48} />
                  <Tooltip formatter={(v, n) => [Array.isArray(v) ? `${fmtInt(v[0])} – ${fmtInt(v[1])}` : fmtInt(Number(v)), n === 'band' ? 'range' : 'tCO₂e']} labelFormatter={(d) => fmtDate(String(d))} />
                  <Area dataKey="band" stroke="none" fill="#16A34A" fillOpacity={0.12} />
                  <Line dataKey="co2e_t" stroke="#16A34A" strokeWidth={2} dot={{ r: 2.5, fill: '#16A34A' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle icon={MapIcon} title="Change detection" sub={loc.data?.change ? `${fmtDate(loc.data.change.from)} → ${fmtDate(loc.data.change.to)}` : 'Land-cover transitions'} />
          {!loc.data?.change ? <Skeleton className="h-60" /> : (() => {
            const ch = loc.data.change!
            return (
              <div className="space-y-3">
                {!ch.same_season && <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-[11.5px] text-ink-2"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />No same-season pair in the archive: this change includes the crop cycle, not just land-use change.</div>}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-surface-2 p-2"><div className="text-[10.5px] text-ink-3">Changed</div><div className="num font-bold text-strong">{ch.changed_pct.toFixed(0)}%</div></div>
                  <div className="rounded-xl bg-surface-2 p-2"><div className="text-[10.5px] text-ink-3">Dense veg. lost</div><div className="num font-bold text-block">{fmtInt(ch.loss_dense_ha)} ha</div></div>
                  <div className="rounded-xl bg-surface-2 p-2"><div className="text-[10.5px] text-ink-3">Dense veg. gained</div><div className="num font-bold text-pass">{fmtInt(ch.gain_dense_ha)} ha</div></div>
                </div>
                <ul className="space-y-1.5">
                  {ch.transitions.slice(0, 5).map((t) => (
                    <li key={t.from + t.to} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg bg-surface-2/60 px-3 py-1.5 text-[12px]"><span className="truncate text-ink-2">{t.from} → {t.to}</span><span className="num font-semibold">{fmtInt(t.area_ha)} ha</span></li>
                  ))}
                </ul>
                <div className="text-[12px] text-ink-3">Net stock change <b className="num" style={{ color: statusColor(ch.co2e_delta_t >= 0 ? 'PASS' : 'BLOCKED') }}>{ch.co2e_delta_t > 0 ? '+' : ''}{fmtCompact(ch.co2e_delta_t)} tCO₂e</b></div>
              </div>
            )
          })()}
        </Card>
      </div>

      {loc.data && (
        <Card>
          <CardTitle icon={Sprout} title="Method" sub="Every step, so a verifier can reproduce it" />
          <ol className="grid gap-2 md:grid-cols-2">{loc.data.method.steps.map((s, i) => <li key={s} className="flex gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5 text-[12.5px] text-ink-2"><span className="num text-primary">{i + 1}</span>{s}</li>)}</ol>
          <div className="mt-3 flex flex-wrap gap-2">{loc.data.classes.map((k) => <span key={k.id} className="chip bg-surface-3 text-ink-2"><span className="h-2 w-2 rounded-sm" style={{ background: k.color }} />{k.name}: {k.agb_default_t_ha} t/ha default</span>)}</div>
        </Card>
      )}
    </div>
  )
}
