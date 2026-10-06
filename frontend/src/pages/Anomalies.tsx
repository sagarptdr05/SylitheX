import 'leaflet/dist/leaflet.css'
import { motion } from 'framer-motion'
import { Crosshair, Filter, GitBranch, Radar, ScanSearch, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Polygon, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import Sheet from '../components/Sheet'
import { Card, InfoTip, PageHeader, Skeleton, StateBox, StatusBadge } from '../components/ui'
import { layerUrl, useApi } from '../lib/api'
import { fmtDate, sevColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { AnomalyFeed, Issue } from '../lib/types'

const SEVS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const
const CATS = [{ id: 'anomaly', label: 'Anomalies' }, { id: 'integrity', label: 'Integrity' }, { id: 'event', label: 'Real events' }, { id: 'quality', label: 'Quality' }]
const SENSORS = ['All sensors', 'Sentinel-2', 'Sentinel-1']

function Fly({ target, home }: { target: Issue | null; home: [[number, number], [number, number]] }) {
  const map = useMap()
  useEffect(() => {
    if (target && target.polygons.length) {
      const pts = target.polygons.flat().map(([lo, la]) => [la, lo] as [number, number])
      const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1])
      map.flyToBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], { padding: [40, 40], duration: 0.8, maxZoom: 15 })
    } else map.flyToBounds(home, { duration: 0.6 })
  }, [target, map, home])
  return null
}

function Detail({ i, onOpen }: { i: Issue; onOpen: (to: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4" style={{ borderColor: sevColor(i.severity) + '66', background: sevColor(i.severity) + '12' }}>
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: sevColor(i.severity) }}>{i.category === 'event' ? 'Real event confirmed' : 'Anomaly detected'}</div>
        <div className="mt-1 text-xl font-bold text-strong">{i.type}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
          <div><div className="text-ink-3">Severity</div><div className="font-bold" style={{ color: sevColor(i.severity) }}>{i.severity}</div></div>
          <div><div className="text-ink-3">Confidence <InfoTip text="Detector confidence (heuristic): derived from the strength of the signal, e.g. PSI for drift, |z| for temporal changes, disagreement for radar/optical." /></div><div className="num font-bold text-strong">{i.confidence}%</div></div>
          <div><div className="text-ink-3">Affected observations</div><div className="num font-bold text-strong">{i.observations.toLocaleString()} px</div></div>
          <div><div className="text-ink-3">Detected</div><div className="font-bold text-strong">{fmtDate(i.date)}</div></div>
          <div><div className="text-ink-3">Sensor</div><div className="font-semibold text-strong">{i.sensor}</div></div>
          <div><div className="text-ink-3">Area</div><div className="num font-bold text-strong">{i.area_pct.toFixed(0)}% · {i.n_tiles} tiles</div></div>
        </div>
      </div>
      {[['Why', i.why], ['Potential downstream impact', i.trust_points != null ? `${i.impact}. Lower trust feeds every downstream estimate made from these pixels.` : i.impact], ['Action taken', i.action], ['Gate decision', `${i.gate_action}`]].map(([k, v]) => (
        <div key={k}><div className="label mb-1 text-[10px]">{k}</div><p className="text-[13px] leading-relaxed text-ink-2">{v}</p></div>
      ))}
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-ink-3">Dataset</span><span className="font-mono text-xs">{i.scene_id}</span><StatusBadge status={i.status} size="sm" />{i.synthetic && <span className="chip bg-warn-bg text-[10px] text-warn">synthetic</span>}</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onOpen('/scene')} className="btn-ghost justify-center text-xs"><ScanSearch size={14} />Open dataset</button>
        <button onClick={() => onOpen('/provenance')} className="btn-ghost justify-center text-xs"><GitBranch size={14} />Trace provenance</button>
      </div>
    </div>
  )
}

export default function Anomalies() {
  const { activeAoi, setSceneId } = useStore()
  const [params, setParams] = useSearchParams()
  const [sev, setSev] = useState<Set<string>>(new Set(['CRITICAL', 'HIGH', 'MEDIUM']))
  const [cats, setCats] = useState<Set<string>>(new Set(['anomaly', 'integrity', 'event']))
  const [sensor, setSensor] = useState('All sensors')
  const [type, setType] = useState('All types')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [demo, setDemo] = useState(true)
  const [sel, setSel] = useState<string | null>(params.get('focus'))
  const [showFilters, setShowFilters] = useState(false)
  const nav = useNavigate()
  const q = useApi<AnomalyFeed>(`/api/anomalies?category=${[...cats].join(',') || 'none'}`)

  const items = useMemo(() => (q.data?.items ?? []).filter((i) =>
    sev.has(i.severity) && (sensor === 'All sensors' || i.sensor.includes(sensor)) && (type === 'All types' || i.type === type)
    && (!start || i.date >= start) && (!end || i.date <= end) && (demo || !i.demo)), [q.data, sev, sensor, type, start, end, demo])
  const cur = items.find((i) => i.id === sel) ?? q.data?.items.find((i) => i.id === sel) ?? null
  useEffect(() => { if (sel) setParams({ focus: sel }, { replace: true }); else setParams({}, { replace: true }) }, [sel, setParams])

  const bb = activeAoi?.bbox
  const home: [[number, number], [number, number]] | null = bb ? [[bb[1], bb[0]], [bb[3], bb[2]]] : null
  const counts = Object.fromEntries(SEVS.map((s) => [s, (q.data?.items ?? []).filter((i) => i.severity === s).length]))
  const types = ['All types', ...new Set((q.data?.items ?? []).map((i) => i.type))]
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 1280
  const toggle = (set: Set<string>, v: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); fn(n) }
  const open = (to: string) => { if (cur) { setSceneId(cur.scene_id); nav(to) } }

  const filters = (
    <div className="space-y-4">
      <div>
        <div className="label mb-2 text-[10px]">Severity</div>
        <div className="flex flex-wrap gap-1.5">
          {SEVS.map((s) => (
            <button key={s} onClick={() => toggle(sev, s, setSev)} aria-pressed={sev.has(s)} className={clsx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold', sev.has(s) ? 'text-strong' : 'border-line text-ink-3')}
              style={sev.has(s) ? { borderColor: sevColor(s) + '88', background: sevColor(s) + '22' } : undefined}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: sevColor(s) }} />{s} <span className="num font-normal opacity-70">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-2 text-[10px]">Category</div>
        <div className="flex flex-wrap gap-1.5">
          {CATS.map((c) => <button key={c.id} onClick={() => toggle(cats, c.id, setCats)} aria-pressed={cats.has(c.id)} className={clsx('rounded-full border px-2.5 py-1 text-[11px] font-semibold', cats.has(c.id) ? 'border-primary/60 bg-primary/10 text-primary' : 'border-line text-ink-3')}>{c.label}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-3">Sensor<select value={sensor} onChange={(e) => setSensor(e.target.value)} className="input mt-1 py-2 text-[12.5px]">{SENSORS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="text-[11px] text-ink-3">Type<select value={type} onChange={(e) => setType(e.target.value)} className="input mt-1 py-2 text-[12.5px]">{types.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="text-[11px] text-ink-3">From<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1 py-2 text-[12.5px]" /></label>
        <label className="text-[11px] text-ink-3">To<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input mt-1 py-2 text-[12.5px]" /></label>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="h-4 w-4 accent-[rgb(86,145,255)]" />Include demo scenarios (synthetic faults)</label>
    </div>
  )

  return (
    <div>
      <PageHeader crumbs={['Platform', 'Anomalies']} kicker="Anomalies" st="4" title="Anomaly Explorer"
        sub={`Sensor drift, statistical outliers, suspicious changes, radar/optical contradictions and record-integrity failures across every dataset of ${activeAoi?.name ?? 'the project'}. Select one to focus the map on the affected region.`} />

      {q.error ? <StateBox kind="error" title="Anomaly feed unavailable" text={q.error} /> : (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4 xl:order-1">
            <Card className="hidden xl:block">{filters}</Card>
            <button onClick={() => setShowFilters(true)} className="btn-ghost w-full justify-center xl:hidden"><Filter size={15} />Filters · {items.length} results</button>
            <Card pad={false}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="text-sm font-semibold">{items.length} findings</span>{sel && <button onClick={() => setSel(null)} className="flex items-center gap-1 text-xs text-ink-3 hover:text-strong"><X size={12} />clear focus</button>}</div>
              <div className="scrollbar-thin max-h-[520px] overflow-y-auto p-2">
                {!q.data ? <Skeleton className="h-60" /> : items.length === 0 ? (
                  <StateBox title="No anomalies match" text="Nothing in this project matches the current filters. Widen the severity or the date range." />
                ) : items.map((i) => (
                  <button key={i.id} onClick={() => setSel(i.id === sel ? null : i.id)} className={clsx('mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', sel === i.id ? 'bg-mint ring-1 ring-primary/50' : 'hover:bg-surface-2')}>
                    <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">{['CRITICAL', 'HIGH'].includes(i.severity) && <span className="absolute h-full w-full animate-ping rounded-full opacity-50" style={{ background: sevColor(i.severity) }} />}<span className="relative h-2.5 w-2.5 rounded-full" style={{ background: sevColor(i.severity) }} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold">{i.type}</span><span className="font-mono text-[9.5px] font-bold" style={{ color: sevColor(i.severity) }}>{i.severity}</span></span>
                      <span className="block truncate text-[11.5px] text-ink-3">{i.scene_title} · {fmtDate(i.date)}</span>
                      <span className="block text-[11px] text-ink-3">{i.sensor} · {i.area_pct.toFixed(0)}% area · {i.confidence}% conf.</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4 xl:order-2">
            <Card pad={false} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[12px]">
                <Radar size={15} className="text-primary" /><span className="font-semibold">{cur ? `${cur.type} · ${fmtDate(cur.date)}` : 'All findings'}</span>
                <span className="text-ink-3">{cur ? `${cur.n_tiles} tiles highlighted` : 'pulsing markers = HIGH / CRITICAL'}</span>
                {sel && <button onClick={() => setSel(null)} className="ml-auto flex items-center gap-1 text-ink-3 hover:text-strong"><Crosshair size={13} />reset view</button>}
              </div>
              <div className="h-[380px] sm:h-[480px] xl:h-[560px]">
                {home ? (
                  <MapContainer bounds={home} style={{ height: '100%', width: '100%' }} zoomSnap={0.25} scrollWheelZoom={false} attributionControl>
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Basemap © Esri" maxZoom={18} />
                    {cur && <ImageOverlay url={layerUrl(cur.scene_id, 'original')} bounds={home} opacity={0.85} />}
                    <Rectangle bounds={home} pathOptions={{ color: '#0891B2', weight: 1.5, fill: false, dashArray: '6 6' }} />
                    {cur?.polygons.map((p, k) => <Polygon key={k} positions={p.map(([lo, la]) => [la, lo] as [number, number])} pathOptions={{ color: sevColor(cur.severity), weight: 1.5, fillColor: sevColor(cur.severity), fillOpacity: 0.35 }} />)}
                    {!cur && items.map((i) => (
                      <CircleMarker key={i.id} center={i.center} radius={['CRITICAL', 'HIGH'].includes(i.severity) ? 9 : 6} eventHandlers={{ click: () => setSel(i.id) }}
                        pathOptions={{ color: sevColor(i.severity), weight: 2, fillColor: sevColor(i.severity), fillOpacity: 0.45 }}>
                        <Tooltip><span style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}>{i.type} · {i.severity} · {i.date}</span></Tooltip>
                      </CircleMarker>
                    ))}
                    <Fly target={cur} home={home} />
                  </MapContainer>
                ) : <StateBox kind="error" title="Map unavailable" text="This project has no geographic bounds yet." />}
              </div>
            </Card>
            {cur && !isPhone && (
              <motion.div key={cur.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card><Detail i={cur} onOpen={open} /></Card>
              </motion.div>
            )}
          </div>
        </div>
      )}

      <Sheet open={showFilters} onClose={() => setShowFilters(false)} kicker="Anomaly explorer" title="Filters">{filters}<button onClick={() => setShowFilters(false)} className="btn-primary mt-5 w-full justify-center">Show {items.length} findings</button></Sheet>
      <Sheet open={!!cur && isPhone} onClose={() => setSel(null)} kicker="Anomaly" title={cur?.type ?? ''}>{cur && <Detail i={cur} onOpen={open} />}</Sheet>
    </div>
  )
}
