import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Check, Crosshair, Database, Loader2, MapPin, Plus, RefreshCw, Satellite, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleMarker, MapContainer, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import clsx from 'clsx'
import { Card, CardTitle, PageHeader, Pill } from '../components/ui'
import { API, layerUrl, post } from '../lib/api'
import { fmtDate, scoreColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { Aoi } from '../lib/types'

const PRESETS = [
  { name: 'Pune · Hadapsar', lat: 18.50, lon: 73.93, why: 'urban growth + sugarcane' },
  { name: 'Mumbai · Thane creek', lat: 19.13, lon: 72.98, why: 'mangroves, salt pans, dense city' },
  { name: 'Kolhapur · Panchganga', lat: 16.72, lon: 74.26, why: 'river floods, sugarcane' },
  { name: 'Nagpur · Butibori', lat: 21.00, lon: 79.00, why: 'cotton + orange orchards' },
  { name: 'Patna · Ganga floodplain', lat: 25.58, lon: 85.12, why: 'monsoon flooding' },
  { name: 'Bengaluru · Whitefield', lat: 12.97, lon: 77.75, why: 'urban expansion, lakes' },
  { name: 'Guwahati · Brahmaputra', lat: 26.17, lon: 91.70, why: 'flood-prone river island' },
  { name: 'Chennai · Pallikaranai', lat: 12.94, lon: 80.21, why: 'wetland, cyclone floods' },
]

function boxFor(lat: number, lon: number, km: number): [[number, number], [number, number]] {
  const dLat = km / 2 / 111.32, dLon = km / 2 / (111.32 * Math.cos((lat * Math.PI) / 180))
  return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]]
}

function ClickToPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(+e.latlng.lat.toFixed(4), +e.latlng.lng.toFixed(4)) })
  return null
}

function FlyTo({ target }: { target: { lat: number; lon: number; zoom: number } | null }) {
  const map = useMap()
  useEffect(() => { if (target) map.flyTo([target.lat, target.lon], target.zoom, { duration: 1.2 }) }, [target, map])
  return null
}

export default function Locations() {
  const { aois, aoi, setAoi, refreshAois } = useStore()
  const nav = useNavigate()
  const [draft, setDraft] = useState<{ name: string; lat: number; lon: number; size: number; region: string }>({ name: '', lat: 18.5, lon: 73.93, size: 7.68, region: '' })
  const [picking, setPicking] = useState(false)
  const [fly, setFly] = useState<{ lat: number; lon: number; zoom: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const building = aois.find((a) => ['building', 'queued'].includes(a.status.state))
  const draftBox = useMemo(() => boxFor(draft.lat, draft.lon, draft.size), [draft])

  const submit = async () => {
    setErr(null); setBusy(true)
    try {
      await post('/api/aois', { name: draft.name || `Location ${draft.lat.toFixed(2)}, ${draft.lon.toFixed(2)}`, lat: draft.lat, lon: draft.lon, size_km: draft.size, region: draft.region })
      refreshAois(); setPicking(false)
    } catch (e) { setErr(String(e).replace(/^Error: \d+ /, '')) } finally { setBusy(false) }
  }
  const use = (a: Aoi) => { setAoi(a.id); nav('/dashboard') }

  return (
    <div>
      <PageHeader kicker="Locations" title="Choose where TerraTrust watches"
        sub="Every location has its own 12-month Sentinel-1/2 archive, its own learned baselines (drift, physics model, calibration targets) and its own demo scenarios. Pick one, or add any place on Earth."
        right={<button onClick={() => { setPicking(true); document.getElementById('add-loc')?.scrollIntoView({ behavior: 'smooth' }) }} className="btn-primary"><Plus size={16} />Add location</button>} />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card pad={false} className="overflow-hidden">
          <div className="relative h-[560px]">
            <MapContainer center={[20.5, 76]} zoom={5} style={{ height: '100%', width: '100%' }} zoomSnap={0.5} scrollWheelZoom>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Imagery © Esri" maxZoom={18} />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={18} opacity={0.9} />
              <FlyTo target={fly} />
              {picking && <ClickToPick onPick={(lat, lon) => setDraft((d) => ({ ...d, lat, lon }))} />}
              {aois.map((a) => {
                const ready = a.status.state === 'ready'
                const color = a.id === aoi ? '#16A34A' : ready ? '#38BDF8' : '#D97706'
                const b = a.bbox ? [[a.bbox[1], a.bbox[0]], [a.bbox[3], a.bbox[2]]] as [[number, number], [number, number]] : boxFor(a.lat, a.lon, a.grid_px / 100)
                return (
                  <div key={a.id}>
                    <Rectangle bounds={b} pathOptions={{ color, weight: 2.5, fillOpacity: 0.18 }} eventHandlers={{ click: () => ready && !picking && setAoi(a.id) }} />
                    <CircleMarker center={[a.lat, a.lon]} radius={a.id === aoi ? 9 : 6} pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }}
                      eventHandlers={{ click: () => ready && !picking && setAoi(a.id) }}>
                      <Tooltip direction="top" offset={[0, -8]} permanent={a.id === aoi}><b>{a.name}</b>{!ready && ` · ${Math.round(a.status.progress * 100)}%`}</Tooltip>
                    </CircleMarker>
                  </div>
                )
              })}
              {picking && (
                <>
                  <Rectangle bounds={draftBox} pathOptions={{ color: '#D97706', weight: 2, dashArray: '6 6', fillOpacity: 0.12 }} />
                  <CircleMarker center={[draft.lat, draft.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#D97706', fillOpacity: 1 }} />
                </>
              )}
            </MapContainer>
            <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-xl bg-space/80 px-3 py-2 font-mono text-[10.5px] text-sky backdrop-blur">
              <div className="flex items-center gap-1.5 font-semibold text-white"><Satellite size={12} />AOI REGISTRY · {aois.length} locations</div>
              <div className="mt-1 flex gap-3"><span><span className="text-[#16A34A]">■</span> active</span><span><span className="text-[#38BDF8]">■</span> ready</span><span><span className="text-[#D97706]">■</span> processing / draft</span></div>
            </div>
            {picking && <div className="absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-warn px-4 py-2 text-xs font-semibold text-white shadow-lift"><Crosshair size={13} className="mr-1 inline" />Click on the map to place the new AOI</div>}
          </div>
        </Card>

        <div className="space-y-4">
          {aois.map((a, i) => <LocationCard key={a.id} a={a} active={a.id === aoi} i={i} onUse={() => use(a)} onFly={() => setFly({ lat: a.lat, lon: a.lon, zoom: 12 })} refresh={refreshAois} />)}
        </div>
      </div>

      <Card className="mt-5" >
        <div id="add-loc" className="scroll-mt-24" />
        <CardTitle icon={Plus} title="Add a new location" sub="TerraTrust searches the Planetary Computer STAC catalogue, downloads 12 months of Sentinel-1 + Sentinel-2, learns the local baselines and scores every scene (≈ 4–6 minutes)." />
        {building ? (
          <BuildProgress a={building} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-ink-2">Location name
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Pune · Hadapsar"
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-teal" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-ink-2">Latitude
                  <input type="number" step="0.001" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: +e.target.value })} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-mono text-sm outline-none focus:border-teal" />
                </label>
                <label className="block text-xs font-semibold text-ink-2">Longitude
                  <input type="number" step="0.001" value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: +e.target.value })} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-mono text-sm outline-none focus:border-teal" />
                </label>
              </div>
              <div>
                <div className="text-xs font-semibold text-ink-2">AOI size</div>
                <div className="mt-1 flex gap-2">
                  {[5.76, 7.68, 9.6].map((s) => (
                    <button key={s} onClick={() => setDraft({ ...draft, size: s })} className={clsx('flex-1 rounded-xl border px-3 py-2 text-sm font-semibold', draft.size === s ? 'border-teal bg-mint text-teal' : 'border-line text-ink-2')}>{s} km</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setPicking((p) => !p); setFly({ lat: draft.lat, lon: draft.lon, zoom: 9 }) }} className={clsx('btn-ghost py-2 text-xs', picking && 'border-warn text-warn-ink')}><Crosshair size={14} />{picking ? 'Picking on map…' : 'Pick on map'}</button>
                <button onClick={() => navigator.geolocation?.getCurrentPosition((p) => { setDraft((d) => ({ ...d, lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), name: d.name || 'My location' })); setPicking(true); setFly({ lat: p.coords.latitude, lon: p.coords.longitude, zoom: 11 }) })} className="btn-ghost py-2 text-xs"><MapPin size={14} />Use my location</button>
              </div>
              {err && <div className="flex items-start gap-2 rounded-xl bg-block-bg px-3 py-2 text-xs text-block"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</div>}
              <button onClick={submit} disabled={busy} className="btn-primary w-full justify-center py-3">{busy ? <Loader2 size={16} className="animate-spin" /> : <Satellite size={16} />}Start satellite analysis</button>
              <p className="text-[11px] text-ink-3">Box {draftBox[0][0].toFixed(3)}–{draftBox[1][0].toFixed(3)}°N, {draftBox[0][1].toFixed(3)}–{draftBox[1][1].toFixed(3)}°E · 10 m Sentinel grid · Sep 2025 → Sep 2026</p>
            </div>
            <div>
              <div className="label mb-2 flex items-center gap-1.5"><Search size={12} />Quick picks across India</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PRESETS.map((p) => (
                  <button key={p.name} onClick={() => { setDraft({ ...draft, name: p.name, lat: p.lat, lon: p.lon, region: p.why }); setPicking(true); setFly({ lat: p.lat, lon: p.lon, zoom: 11 }) }}
                    className={clsx('rounded-xl border p-3 text-left transition hover:border-teal/50 hover:bg-mint/40', draft.name === p.name ? 'border-teal bg-mint/60' : 'border-line')}>
                    <div className="flex items-center gap-1.5 text-sm font-semibold"><MapPin size={13} className="text-teal" />{p.name}</div>
                    <div className="text-[11px] text-ink-3">{p.why} · {p.lat.toFixed(2)}, {p.lon.toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function LocationCard({ a, active, i, onUse, onFly, refresh }: { a: Aoi; active: boolean; i: number; onUse: () => void; onFly: () => void; refresh: () => void }) {
  const ready = a.status.state === 'ready'
  const d = a.decisions
  const tot = d ? d.PASS + d.WARNING + d.BLOCKED : 0
  return (
    <motion.div id={a.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
      className={clsx('card overflow-hidden transition', active && 'ring-2 ring-teal/60')}>
      <div className="flex gap-4 p-4">
        <button onClick={onFly} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {ready ? <img src={layerUrl('DEMO-HEALTHY', 'original', a.id)} className="h-full w-full object-cover" /> :
            <div className="grid h-full place-items-center text-sky"><Loader2 className="animate-spin" /></div>}
          {active && <span className="absolute left-1.5 top-1.5 rounded-md bg-teal px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">ACTIVE</span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-display text-[16px] font-bold">{a.name}</div>
              <div className="truncate text-xs text-ink-2">{a.region}</div>
            </div>
            <div className="flex flex-col items-end gap-1"><Pill tone={a.builtin ? 'teal' : 'sky'}>{a.theme}</Pill><span className={clsx('chip text-[10px]', a.shared ? 'bg-skytint text-sky' : 'bg-mint text-teal')}>{a.shared ? 'Shared' : '🔒 Private · yours'}</span></div>
          </div>
          {ready ? (
            <>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-2">
                <span>{a.n_s2} S2 · {a.n_s1} S1</span>
                <span>{a.first && fmtDate(a.first)} → {a.last && fmtDate(a.last)}</span>
                <span>T{a.tile} · {a.size_km} km</span>
              </div>
              {d && (
                <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                  <div style={{ width: `${(d.PASS / tot) * 100}%` }} className="bg-pass" />
                  <div style={{ width: `${(d.WARNING / tot) * 100}%` }} className="bg-warn" />
                  <div style={{ width: `${(d.BLOCKED / tot) * 100}%` }} className="bg-block" />
                </div>
              )}
              <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>{d?.PASS} pass · {d?.WARNING} warn · {d?.BLOCKED} blocked</span><span>avg trust <b className="num" style={{ color: scoreColor(a.avg_trust ?? 0) }}>{a.avg_trust?.toFixed(1)}</b></span></div>
            </>
          ) : a.status.state === 'error' ? (
            <div className="mt-2 text-xs text-block">{a.status.message}</div>
          ) : (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-gradient-to-r from-teal to-sky transition-all" style={{ width: `${a.status.progress * 100}%` }} /></div>
              <div className="mt-1 truncate text-[11px] text-ink-3">{Math.round(a.status.progress * 100)}% · {a.status.step}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-4 py-2.5">
        {ready ? (
          <>
            <button onClick={onUse} className={clsx('btn py-1.5 text-xs', active ? 'bg-mint text-teal' : 'bg-teal text-white hover:bg-teal-hover')}>
              {active ? <><Check size={14} />Active · open dashboard</> : <>Use this location <ArrowRight size={14} /></>}
            </button>
            {a.dataset && <a href={`${API}/api/aois/${a.id}/dataset.zip`} className="btn-ghost py-1.5 text-xs"><Database size={13} />Dataset ({(a.dataset.size_bytes / 1e6).toFixed(0)} MB)</a>}
          </>
        ) : a.status.state === 'error' ? (
          <button onClick={() => post(`/api/aois/${a.id}/rebuild`).then(refresh)} className="btn-ghost py-1.5 text-xs"><RefreshCw size={13} />Retry</button>
        ) : <span className="text-xs text-ink-3">Processing in the background, you can keep using the app</span>}
        <div className="flex-1" />
        {!a.builtin && a.status.state !== 'building' && (
          <button onClick={() => confirm(`Remove ${a.name}?`) && post(`/api/aois/${a.id}`, {}, 'DELETE').then(refresh)} className="rounded-lg p-1.5 text-ink-3 hover:bg-block-bg hover:text-block" title="Remove"><Trash2 size={15} /></button>
        )}
      </div>
    </motion.div>
  )
}

const STEPS = ['Searching', 'Downloading', 'baselines', 'physics', 'pseudo-invariant', 'drift', 'Isolation', 'Scoring', 'downstream', 'Packaging']

function BuildProgress({ a }: { a: Aoi }) {
  const idx = Math.max(0, STEPS.findIndex((s) => a.status.step.toLowerCase().includes(s.toLowerCase())))
  return (
    <div className="rounded-2xl border border-sky/30 bg-gradient-to-br from-skytint/60 to-surface p-5">
      <div className="flex items-center gap-3">
        <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-space text-sky"><Satellite size={20} /><span className="absolute inset-0 animate-ping rounded-2xl border border-sky/50" /></div>
        <div className="flex-1">
          <div className="font-semibold">Building “{a.name}”</div>
          <div className="text-xs text-ink-2">{a.status.step}</div>
        </div>
        <span className="num text-2xl font-bold text-sky">{Math.round(a.status.progress * 100)}%</span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface"><motion.div className="h-full rounded-full bg-gradient-to-r from-teal to-sky" animate={{ width: `${a.status.progress * 100}%` }} /></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">
        {['STAC search', 'Download S1+S2', 'Baselines', 'Physics model', 'Calibration', 'Drift calib.', 'Isolation Forest', 'Score scenes', 'Downstream test', 'Demo dataset'].map((l, i) => (
          <div key={l} className={clsx('flex items-center gap-1.5 rounded-lg px-2 py-1.5', i < idx ? 'bg-pass-bg text-pass' : i === idx ? 'bg-sky text-white' : 'bg-surface text-ink-3')}>
            {i < idx ? <Check size={12} /> : i === idx ? <Loader2 size={12} className="animate-spin" /> : <span className="h-3 w-3 rounded-full border" />}{l}
          </div>
        ))}
      </div>
      <AnimatePresence />
    </div>
  )
}

void L
