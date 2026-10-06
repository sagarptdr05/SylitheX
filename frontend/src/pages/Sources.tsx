import { motion } from 'framer-motion'
import { ArrowDownUp, BadgeCheck, ChevronLeft, ChevronRight, Copy, Database, Download, FileJson, GitBranch, Radio, Satellite, Search, ScanSearch } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { ComponentBars } from '../components/TrustRing'
import { Card, CardTitle, InfoTip, PageHeader, Skeleton, StateBox, StatusBadge } from '../components/ui'
import { API, getApiAoi, layerUrl, useApi } from '../lib/api'
import { fmtDate, scoreColor } from '../lib/format'
import { useStore } from '../lib/store'
import { copyText, useToast } from '../lib/toast'
import type { SceneListItem } from '../lib/types'

interface Sat { id: string; name: string; sensor: string; launch: number; acquisitions: number; first: string; last: string; avg_trust: number | null; orbit: string; revisit_days: number }
interface Insp {
  scene_id: string; title: string; date: string; status: string; trust_score: number; source: string; sensor: string; product_id: string; tile: string
  crs: string; resolution_m: number; grid: number; bbox: number[]; extent_km: [number, number]; area_km2: number; bands: string[]; format: string
  files: { name: string; bytes: number; role: string }[]; output_bytes: number; version: string
  versions: { version: string; label: string; by: string; at: string; detail: string; hash: string | null }[]; provenance_complete: boolean; synthetic: string[]; demo: boolean
}
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`
const TABS = ['Overview', 'Metadata', 'Quality', 'Versions', 'Provenance', 'Preview'] as const
const LAYER_NAMES: Record<string, string> = { original: 'True colour', cloudmask: 'Quality masks', cleaned: 'Cleaned', reconstructed: 'Reconstructed', recon_highlight: 'Reconstruction map', provenance: 'Provenance map', uncertainty: 'Uncertainty', ndvi: 'NDVI', ndvi_raw: 'NDVI (raw)', sar: 'S1 radar', sar_raw: 'S1 raw', sar_filtered: 'S1 filtered', agreement: 'S1/S2 agreement', trustmap: 'Trust map' }

function Row({ k, v, mono = false, tip }: { k: string; v: React.ReactNode; mono?: boolean; tip?: string }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-line px-1 py-2.5 text-[12.5px] last:border-0 sm:grid-cols-[170px_minmax(0,1fr)]">
      <dt className="flex items-center gap-1 text-ink-3">{k}{tip && <InfoTip text={tip} />}</dt>
      <dd className={clsx('min-w-0 break-words [overflow-wrap:anywhere]', mono && 'font-mono text-[11.5px]')}>{v}</dd>
    </div>
  )
}

function Inspector() {
  const { sceneId, scene } = useStore()
  const q = useApi<Insp>(sceneId ? `/api/scene/${sceneId}/inspect` : null)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [layer, setLayer] = useState('original')
  const toast = useToast()
  const d = q.data
  if (!d || !scene) return <Card><Skeleton className="h-[420px]" /></Card>
  const checks = scene.metadata_checks
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 border-b border-line p-5">
        <img src={layerUrl(d.scene_id, 'original')} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
        <div className="min-w-0 flex-1">
          <div className="label text-[10px]">Dataset inspector</div>
          <div className="truncate text-lg font-bold text-strong">{d.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-3">
            {d.scene_id}<button aria-label="Copy dataset ID" onClick={() => copyText(d.scene_id, toast, 'Dataset ID copied')} className="hover:text-primary"><Copy size={12} /></button>
            <span className="rounded bg-primary/15 px-1.5 text-primary">{d.version}</span>{d.synthetic.length > 0 && <span className="rounded bg-warn/15 px-1.5 text-warn">synthetic faults</span>}
          </div>
        </div>
        <div className="text-right"><div className="num text-3xl font-bold" style={{ color: scoreColor(d.trust_score) }}>{d.trust_score.toFixed(0)}</div><StatusBadge status={d.status} size="sm" /></div>
      </div>
      <div role="tablist" className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line px-3">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx('relative shrink-0 px-3 py-3 text-[13px] font-semibold', tab === t ? 'text-strong' : 'text-ink-3 hover:text-ink')}>{t}{tab === t && <motion.span layoutId="itab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}</button>)}
      </div>
      <div className="p-5" role="tabpanel">
        {tab === 'Overview' && (
          <dl>
            <Row k="Source" v={d.source} />
            <Row k="Sensor" v={d.sensor} />
            <Row k="Acquisition date" v={fmtDate(d.date)} />
            <Row k="Spatial coverage" v={`${d.extent_km[0]} × ${d.extent_km[1]} km · ${d.area_km2} km²`} tip="Footprint of the project grid; every sensor is resampled onto it." />
            <Row k="CRS" v={d.crs} mono />
            <Row k="Resolution" v={`${d.resolution_m} m · ${d.grid} × ${d.grid} px`} />
            <Row k="Format" v={d.format} />
            <Row k="File size" v={`${mb(d.files.reduce((a, f) => a + f.bytes, 0))} raw · ${mb(d.output_bytes)} trust outputs`} />
            <Row k="Version" v={`${d.version} (${d.versions.length} versions)`} />
            <Row k="Quality score" v={<span className="num font-bold" style={{ color: scoreColor(d.trust_score) }}>{d.trust_score.toFixed(1)} / 100</span>} />
            <Row k="Provenance" v={d.provenance_complete ? <span className="text-pass">● Complete: inputs, configs and models hashed</span> : <span className="text-warn">● Incomplete</span>} />
          </dl>
        )}
        {tab === 'Metadata' && (
          <div>
            <dl className="mb-4"><Row k="Product ID" v={d.product_id} mono /><Row k="MGRS tile" v={`T${d.tile}`} mono /><Row k="Bands" v={d.bands.join(' · ')} mono /><Row k="Bounding box" v={d.bbox.map((x) => x.toFixed(4)).join(', ')} mono /></dl>
            <div className="label mb-2 text-[10px]">Ingestion & integrity checks</div>
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.check} className="flex items-start gap-3 rounded-lg bg-surface-2/60 px-3 py-2 text-[12.5px]">
                  <span className={clsx('mt-1 h-2 w-2 shrink-0 rounded-full', c.status === 'ok' ? 'bg-pass' : c.status === 'warn' ? 'bg-warn' : 'bg-block')} />
                  <span className="w-40 shrink-0 font-semibold">{c.check}</span><span className="min-w-0 text-ink-3 [overflow-wrap:anywhere]">{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'Quality' && (
          <div className="grid gap-6 md:grid-cols-2">
            <ComponentBars components={scene.components} />
            <dl>
              {[['Cloud', `${scene.metrics.cloud_pct}%`], ['Shadow', `${scene.metrics.shadow_pct}%`], ['Missing', `${scene.metrics.missing_pct}%`], ['Reconstructed', `${scene.metrics.recon_pct}%`], ['Impossible values', `${scene.metrics.impossible_pct}%`], ['Drift', `${scene.levels.drift} (PSI ${scene.metrics.psi})`], ['Anomaly', scene.levels.anomaly], ['Noise', scene.levels.noise]].map(([k, v]) => <Row key={k} k={k} v={v} mono />)}
            </dl>
          </div>
        )}
        {tab === 'Versions' && (
          <ol className="relative space-y-4 border-l border-line-2 pl-5">
            {d.versions.map((v) => (
              <li key={v.version} className="relative">
                <span className="absolute -left-[27px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-primary bg-bg" />
                <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-primary/15 px-1.5 font-mono text-[11px] font-bold text-primary">{v.version}</span><span className="text-sm font-semibold">{v.label}</span><span className="font-mono text-[10.5px] text-ink-3">{v.at}</span></div>
                <div className="mt-1 text-[12.5px] text-ink-2">{v.detail}</div>
                <div className="mt-0.5 text-[11px] text-ink-3">by {v.by}{v.hash && <> · <span className="font-mono">sha256 {v.hash.slice(0, 16)}…</span></>}</div>
              </li>
            ))}
          </ol>
        )}
        {tab === 'Provenance' && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {scene.lineage.filter((l) => l.stage !== 'Confidence').map((l) => (
                <div key={l.stage} className="rounded-xl border border-line bg-surface-2/60 p-3"><div className="label text-[9.5px]">{l.stage}</div><div className="num mt-0.5 text-lg font-bold text-strong">{l.stage === 'Final Trust' ? l.pct.toFixed(1) : `${l.pct.toFixed(1)}%`}</div><div className="text-[11px] text-ink-3">{l.detail}</div></div>
              ))}
            </div>
            <Link to="/provenance" className="btn-primary"><GitBranch size={15} />Open the full lineage graph</Link>
          </div>
        )}
        {tab === 'Preview' && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
            <div className="hud-corners relative aspect-square overflow-hidden rounded-2xl border border-line bg-bg"><img src={layerUrl(d.scene_id, layer)} alt={LAYER_NAMES[layer] ?? layer} className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded bg-bg/80 px-2 py-0.5 font-mono text-[10px]">{LAYER_NAMES[layer] ?? layer}</span></div>
            <div className="scrollbar-none flex gap-1.5 overflow-x-auto md:flex-col md:overflow-visible">
              {scene.layers.map((l) => <button key={l} onClick={() => setLayer(l)} className={clsx('shrink-0 rounded-lg px-3 py-2 text-left text-[12px] font-semibold', layer === l ? 'bg-primary text-white' : 'bg-surface-2 text-ink-2 hover:text-strong')}>{LAYER_NAMES[l] ?? l}</button>)}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
        <Link to="/scene" className="btn-ghost text-xs"><ScanSearch size={14} />Full scene analysis</Link>
        <a href={`${API}/api/passport/${d.scene_id}?aoi=${getApiAoi()}&format=csv`} className="btn-ghost text-xs"><Download size={14} />Quality report (CSV)</a>
        <a href={`${API}/api/scene/${d.scene_id}?aoi=${getApiAoi()}`} target="_blank" rel="noreferrer" className="btn-ghost text-xs"><FileJson size={14} />JSON</a>
        <Link to="/passport" className="btn-ghost text-xs"><BadgeCheck size={14} />Trust Passport</Link>
      </div>
    </Card>
  )
}

type SortK = 'date' | 'trust_score' | 'cloud_pct'
export default function Sources() {
  const { scenes, sceneId, setSceneId, activeAoi } = useStore()
  const sats = useApi<Sat[]>('/api/constellation')
  const [qs, setQs] = useState('')
  const [st, setSt] = useState('ALL')
  const [sort, setSort] = useState<{ k: SortK; asc: boolean }>({ k: 'date', asc: false })
  const [page, setPage] = useState(0)
  const per = 10
  const rows = useMemo(() => {
    const t = qs.toLowerCase()
    const r = scenes.filter((s) => (st === 'ALL' || s.status === st) && (!t || s.title.toLowerCase().includes(t) || s.scene_id.toLowerCase().includes(t) || s.date.includes(t.replace(/-/g, ''))))
    return r.sort((a, b) => (sort.asc ? 1 : -1) * ((a[sort.k] as number | string) > (b[sort.k] as number | string) ? 1 : -1))
  }, [scenes, qs, st, sort])
  const pages = Math.max(1, Math.ceil(rows.length / per))
  const view = rows.slice(page * per, page * per + per)
  const th = (k: SortK, label: string) => (
    <th className="px-3 py-2.5 text-left"><button onClick={() => { setSort((s) => ({ k, asc: s.k === k ? !s.asc : false })); setPage(0) }} className="flex items-center gap-1 hover:text-strong">{label}<ArrowDownUp size={11} className={sort.k === k ? 'text-primary' : ''} /></button></th>
  )
  const label = (s: SceneListItem) => (s.demo ? s.title : `Sentinel-2 · ${fmtDate(s.date)}`)
  return (
    <div className="space-y-5">
      <PageHeader crumbs={['Platform', 'Data Sources']} kicker="Data Sources" st="1" title="Data sources & datasets"
        sub={`Heterogeneous Earth-observation inputs for ${activeAoi?.name ?? 'the project'}: which satellites deliver data, every acquisition we received, and a full inspector for each dataset.`} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {(sats.data ?? []).map((s) => (
          <div key={s.id} className="rounded-2xl border border-line bg-surface/70 p-4">
            <div className="flex items-center gap-2"><span className={clsx('grid h-8 w-8 place-items-center rounded-lg', s.sensor.includes('SAR') ? 'bg-warn/15 text-warn' : 'bg-sky/15 text-sky')}>{s.sensor.includes('SAR') ? <Radio size={15} /> : <Satellite size={15} />}</span><div><div className="text-sm font-semibold">{s.name}</div><div className="text-[11px] text-ink-3">{s.sensor} · since {s.launch}</div></div></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div><div className="num text-lg font-bold text-strong">{s.acquisitions}</div><div className="text-[10px] text-ink-3">acquisitions</div></div>
              <div><div className="num text-lg font-bold text-strong">{s.revisit_days} d</div><div className="text-[10px] text-ink-3">revisit</div></div>
              <div><div className="num text-lg font-bold" style={{ color: s.avg_trust != null ? scoreColor(s.avg_trust) : undefined }}>{s.avg_trust?.toFixed(0) ?? '–'}</div><div className="text-[10px] text-ink-3">avg trust</div></div>
            </div>
            <div className="mt-2 truncate font-mono text-[10px] text-ink-3">{s.orbit}</div>
          </div>
        ))}
        {!sats.data && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-line-2 px-4 py-3 text-[12.5px] text-ink-3"><Database size={16} className="mt-0.5 shrink-0" /><div><b className="text-ink-2">GEDI / LiDAR biomass: not connected.</b> No LiDAR data exists for these projects, so biomass is not validated against LiDAR. A GEDI L4A connector is on the roadmap.</div></div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <div className="relative min-w-[180px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><input value={qs} onChange={(e) => { setQs(e.target.value); setPage(0) }} placeholder="Search datasets or dates…" aria-label="Search datasets" className="input pl-9" /></div>
            <select value={st} onChange={(e) => { setSt(e.target.value); setPage(0) }} aria-label="Filter by status" className="input w-auto py-2.5">{['ALL', 'PASS', 'WARNING', 'BLOCKED'].map((x) => <option key={x}>{x}</option>)}</select>
          </div>
          {rows.length === 0 ? <div className="p-5"><StateBox title="No observations available" text="No dataset matches this search or status filter." action="Clear filters" onAction={() => { setQs(''); setSt('ALL') }} /></div> : (
            <>
              <div className="scrollbar-thin hidden overflow-x-auto md:block">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-surface text-[10.5px] uppercase tracking-[0.12em] text-ink-3"><tr><th className="px-3 py-2.5 text-left">Dataset</th>{th('date', 'Date')}{th('cloud_pct', 'Cloud')}{th('trust_score', 'Trust')}<th className="px-3 py-2.5 text-left">Gate</th></tr></thead>
                  <tbody>
                    {view.map((s) => (
                      <tr key={s.scene_id} onClick={() => setSceneId(s.scene_id)} className={clsx('cursor-pointer border-t border-line transition', s.scene_id === sceneId ? 'bg-mint' : 'hover:bg-surface-2')}>
                        <td className="px-3 py-2.5"><div className="flex items-center gap-2.5"><img src={layerUrl(s.scene_id, 'original')} alt="" className="h-8 w-8 rounded-md object-cover" loading="lazy" /><div className="min-w-0"><div className="truncate font-semibold">{label(s)}</div><div className="truncate font-mono text-[10.5px] text-ink-3">{s.scene_id}{s.synthetic && ' · synthetic'}</div></div></div></td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-ink-2">{fmtDate(s.date)}</td>
                        <td className="px-3 py-2.5 font-mono text-ink-2">{s.cloud_pct.toFixed(0)}%</td>
                        <td className="px-3 py-2.5"><span className="num font-bold" style={{ color: scoreColor(s.trust_score) }}>{s.trust_score.toFixed(0)}</span></td>
                        <td className="px-3 py-2.5"><StatusBadge status={s.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 p-3 md:hidden">
                {view.map((s) => (
                  <li key={s.scene_id}><button onClick={() => { setSceneId(s.scene_id); document.getElementById('inspector')?.scrollIntoView({ behavior: 'smooth' }) }} className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left', s.scene_id === sceneId ? 'border-primary/60 bg-mint' : 'border-line bg-surface-2/50')}>
                    <img src={layerUrl(s.scene_id, 'original')} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{label(s)}</div><div className="text-[11px] text-ink-3">cloud {s.cloud_pct.toFixed(0)}% · {fmtDate(s.date)}</div></div>
                    <span className="num font-bold" style={{ color: scoreColor(s.trust_score) }}>{s.trust_score.toFixed(0)}</span>
                  </button></li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
                <span>{rows.length} datasets · page {page + 1}/{pages}</span>
                <div className="flex gap-1"><button aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 disabled:opacity-40"><ChevronLeft size={15} /></button><button aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 disabled:opacity-40"><ChevronRight size={15} /></button></div>
              </div>
            </>
          )}
        </Card>
        <div id="inspector" className="scroll-mt-28"><Inspector /></div>
      </div>
      <Card>
        <CardTitle icon={Database} title="Download the project dataset" sub="GeoTIFF + JSON + CSV for every acquisition, for offline verification" />
        <a href={`${API}/api/aois/${getApiAoi()}/dataset.zip?aoi=${getApiAoi()}`} className="btn-primary"><Download size={15} />Dataset ZIP</a>
      </Card>
    </div>
  )
}
