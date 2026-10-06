import { motion } from 'framer-motion'
import { Columns2, Layers, LineChart as LineIcon, Map as MapIcon } from 'lucide-react'
import { useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import clsx from 'clsx'
import CompareView from '../components/CompareView'
import GeoTrustMap from '../components/GeoTrustMap'
import { TrustLegend } from '../components/SceneImageMap'
import TileDrawer from '../components/TileDrawer'
import { Card, CardTitle, PageHeader, Skeleton, StateBox } from '../components/ui'
import { layerUrl, useApi } from '../lib/api'
import { fmtDate, monsoonRange } from '../lib/format'
import { useStore } from '../lib/store'

interface TL { points: { date: string; trust: number; cloud: number; recon: number; status: string }[] }
interface CS { series: { date: string; agb_t_ha: number; dense_pct: number; crop_pct: number; co2e_t: number }[] }
const TABS = [{ id: 'map', label: 'Map', icon: MapIcon }, { id: 'ts', label: 'Time series', icon: LineIcon }, { id: 'cmp', label: 'Comparison', icon: Columns2 }, { id: 'layers', label: 'Layers', icon: Layers }] as const
const LAYERS: Record<string, [string, string]> = {
  original: ['True colour', 'Sentinel-2 B04/B03/B02 as delivered'], trustmap: ['Trust map', 'Per-tile Trust Score, green → red'],
  cloudmask: ['Quality masks', 'Cloud, shadow, missing and defective pixels'], reconstructed: ['Reconstructed', 'Gaps filled from the temporal composite'],
  recon_highlight: ['Reconstruction map', 'Where pixels were reconstructed'], uncertainty: ['Uncertainty', 'Reconstruction uncertainty (0–1)'],
  ndvi: ['NDVI', 'Vegetation index after recovery'], ndvi_raw: ['NDVI (raw)', 'Vegetation index before recovery'],
  sar: ['S1 radar', 'Sentinel-1 VV/VH false colour'], sar_raw: ['S1 raw', 'Speckled radar backscatter'], sar_filtered: ['S1 filtered', 'Lee-filtered radar'],
  agreement: ['S1/S2 agreement', 'Where radar confirms optical'], provenance: ['Provenance map', 'Original vs reconstructed vs missing'], cleaned: ['Cleaned', 'Only original valid observations'],
}

export default function Analytics() {
  const { scene, sceneId, scenes, activeAoi } = useStore()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('map')
  const [layer, setLayer] = useState('original')
  const [tiles, setTiles] = useState(true)
  const [op, setOp] = useState(1)
  const [tile, setTile] = useState<string | null>(null)
  const tl = useApi<TL>('/api/timeline')
  const cs = useApi<CS>('/api/carbon/location')
  const bbox = activeAoi?.bbox
  const mr = tl.data ? monsoonRange(tl.data.points.map((p) => p.date)) : null
  return (
    <div className="space-y-5">
      <PageHeader crumbs={['Platform', 'EO Analytics']} kicker="EO Analytics" st="2+6" title="Earth-observation analytics"
        sub="Explore the selected dataset on a satellite basemap, follow vegetation and trust through the year, compare dates and layers, and switch between every derived product." />
      <div role="tablist" className="scrollbar-none flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/60 p-1.5">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={clsx('relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold', tab === t.id ? 'text-strong' : 'text-ink-3 hover:text-ink')}>
            {tab === t.id && <motion.span layoutId="atab" className="absolute inset-0 rounded-xl bg-primary/20 ring-1 ring-primary/50" />}
            <t.icon size={16} className="relative" /><span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card pad={false} className="overflow-hidden p-2">
            {scene && bbox ? <GeoTrustMap bbox={bbox} image={layerUrl(sceneId, layer)} tiles={scene.tiles} showTiles={tiles} onTile={setTile} selected={tile} imageOpacity={op} height={typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : 600} />
              : <Skeleton className="h-[600px]" />}
          </Card>
          <div className="space-y-4">
            <Card>
              <CardTitle icon={Layers} title="Layers" sub="Progressive: one product at a time" />
              <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-1">
                {(scene?.layers ?? []).filter((l) => LAYERS[l]).map((l) => (
                  <button key={l} onClick={() => setLayer(l)} className={clsx('rounded-lg px-3 py-2 text-left text-[12.5px] font-semibold', layer === l ? 'bg-primary text-white' : 'bg-surface-2 text-ink-2 hover:text-strong')}>{LAYERS[l][0]}</button>
                ))}
              </div>
              <label className="mt-4 block text-[12px] text-ink-2">Layer opacity <span className="num float-right">{Math.round(op * 100)}%</span>
                <input type="range" min={0.2} max={1} step={0.05} value={op} onChange={(e) => setOp(+e.target.value)} className="range mt-2 w-full" /></label>
              <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-2"><input type="checkbox" checked={tiles} onChange={(e) => setTiles(e.target.checked)} className="h-4 w-4" />Trust tiles overlay</label>
            </Card>
            <Card><div className="text-[12.5px] text-ink-2"><b className="text-strong">{LAYERS[layer]?.[0]}</b>: {LAYERS[layer]?.[1]}</div><div className="mt-3"><TrustLegend /></div><p className="mt-2 text-[11.5px] text-ink-3">Click a tile to ask “why should I trust this tile?”</p></Card>
          </div>
        </div>
      )}

      {tab === 'ts' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardTitle icon={LineIcon} title="Trust vs cloud cover" sub="Every real acquisition; shaded = SW monsoon" />
            {!tl.data ? <Skeleton className="h-72" /> : (
              <div className="h-[300px]"><ResponsiveContainer>
                <ComposedChart data={tl.data.points} margin={{ left: -18, right: 6, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(2, 7)} minTickGap={24} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(d) => fmtDate(String(d))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {mr && <Area dataKey={() => 100} data={tl.data.points.filter((p) => p.date >= mr[0] && p.date <= mr[1])} fill="#0891B2" fillOpacity={0.05} stroke="none" legendType="none" />}
                  <Bar dataKey="cloud" name="Cloud %" fill="#94A3B8" opacity={0.6} radius={[3, 3, 0, 0]} />
                  <Line dataKey="trust" name="Trust Score" stroke="#2563EB" strokeWidth={2.2} dot={{ r: 2 }} />
                  <Line dataKey="recon" name="Reconstructed %" stroke="#D97706" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer></div>
            )}
          </Card>
          <Card>
            <CardTitle icon={LineIcon} title="Vegetation & biomass" sub="Clear acquisitions only · indicative biomass proxy" />
            {!cs.data ? (cs.error ? <StateBox title="Insufficient data" text="No clear acquisitions to build a vegetation series." /> : <Skeleton className="h-72" />) : (
              <div className="h-[300px]"><ResponsiveContainer>
                <ComposedChart data={cs.data.series} margin={{ left: -18, right: 6, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(2, 7)} minTickGap={24} />
                  <YAxis yAxisId="p" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(d) => fmtDate(String(d))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="p" dataKey="dense_pct" name="Dense vegetation %" stroke="#16A34A" fill="#16A34A" fillOpacity={0.15} />
                  <Area yAxisId="p" dataKey="crop_pct" name="Cropland %" stroke="#65A30D" fill="#65A30D" fillOpacity={0.08} />
                  <Line yAxisId="b" dataKey="agb_t_ha" name="Biomass t/ha" stroke="#F472B6" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer></div>
            )}
          </Card>
        </div>
      )}

      {tab === 'cmp' && scene && (
        <Card><CardTitle icon={Columns2} title="Before / after" sub="Drag the slider: original vs reconstructed, two layers, or two dates" /><CompareView sceneId={sceneId} date={scene.date} layers={scene.layers} scenes={scenes} /></Card>
      )}

      {tab === 'layers' && scene && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {scene.layers.filter((l) => LAYERS[l]).map((l) => (
            <button key={l} onClick={() => { setLayer(l); setTab('map') }} className="group overflow-hidden rounded-2xl border border-line bg-surface text-left transition hover:border-primary/50">
              <img src={layerUrl(sceneId, l)} alt={LAYERS[l][0]} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
              <div className="p-3"><div className="text-[13px] font-semibold">{LAYERS[l][0]}</div><div className="text-[11px] text-ink-3">{LAYERS[l][1]}</div></div>
            </button>
          ))}
        </div>
      )}
      <TileDrawer sceneId={sceneId} tileId={tile} onClose={() => setTile(null)} />
    </div>
  )
}
