import { motion } from 'framer-motion'
import { CheckCircle2, Columns2, CircleAlert, CircleX, Globe2, Grid3x3, History, Layers3, ListChecks, Satellite, ScanSearch, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import CompareSlider from '../components/CompareSlider'
import CompareView from '../components/CompareView'
import GeoTrustMap from '../components/GeoTrustMap'
import { FalseConfidenceBanner, GateRules } from '../components/Insights'
import SceneImageMap, { TrustLegend } from '../components/SceneImageMap'
import TileDrawer from '../components/TileDrawer'
import TrustGauge from '../components/TrustGauge'
import { Card, CardTitle, PageHeader, Pill, Skeleton, StatusBadge } from '../components/ui'
import { layerUrl, useApi } from '../lib/api'
import { fmtDate, scoreColor } from '../lib/format'
import { useStore } from '../lib/store'

const LAYERS = [
  { id: 'original', label: 'Original S2', hint: 'True colour B4-B3-B2, untouched observation' },
  { id: 'cloudmask', label: 'Cloud mask', hint: 'Cloud (cyan) · shadow (violet) · missing (red) · defective (orange)' },
  { id: 'cleaned', label: 'Cleaned', hint: 'Flagged pixels removed: original observations only', checker: true },
  { id: 'reconstructed', label: 'Reconstructed', hint: 'Gaps filled by quality-weighted temporal median' },
  { id: 'recon_highlight', label: 'Recon. highlighted', hint: 'Reconstructed pixels tinted red, never presented as observed' },
  { id: 'sar', label: 'S1 SAR (filtered)', hint: 'Lee-filtered VV / VH / VV−VH false colour' },
  { id: 'ndvi', label: 'NDVI', hint: 'Vegetation index from recovered optical data' },
  { id: 'uncertainty', label: 'Uncertainty', hint: 'Reconstruction uncertainty: grows with temporal gap & candidate spread', checker: true },
]

function FitStrip({ sceneId }: { sceneId: string }) {
  const q = useApi<Record<string, { short: string; status: string; score: number; why: string }>>(`/api/scene/${sceneId}/fitness`)
  const nav = useNavigate()
  if (!q.data) return null
  const C: Record<string, [string, string, string]> = { GO: ['#16A34A', '#DCFCE7', '✓'], CONDITIONAL: ['#D97706', '#FEF3C7', '⚠'], 'NO-GO': ['#DC2626', '#FEE2E2', '✕'] }
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2.5 shadow-card">
      <span className="label px-2 text-[10px]">Fit for purpose</span>
      {Object.entries(q.data).map(([k, v]) => (
        <button key={k} title={v.why} onClick={() => nav('/intelligence')} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition hover:scale-105" style={{ background: C[v.status][1], color: C[v.status][0] }}>
          <span>{C[v.status][2]}</span>{v.short}<span className="font-mono opacity-70">{v.score.toFixed(0)}</span>
        </button>
      ))}
      <button onClick={() => nav('/intelligence')} className="ml-auto flex items-center gap-1 px-2 text-xs font-semibold text-teal hover:underline">Trust Intelligence →</button>
    </div>
  )
}

export default function SceneAnalysis() {
  const { scene, sceneId, profiles, profile, scenes } = useStore()
  const cfg = useApi<{ aoi: { bbox: number[] } }>('/api/config')
  const [layer, setLayer] = useState('original')
  const [tiles, setTiles] = useState(true)
  const [prov, setProv] = useState(false)
  const [geo, setGeo] = useState(false)
  const [cmp, setCmp] = useState(false)
  const [tile, setTile] = useState<string | null>(null)
  if (!scene) return <Skeleton className="h-[600px]" />
  const L = LAYERS.find((l) => l.id === layer)!
  const available = (id: string) => scene.layers.includes(id)
  const img = layerUrl(sceneId, layer)

  return (
    <div>
      <PageHeader kicker="Scene analysis" st="1 · Analyze incoming data" title={scene.info.title}
        sub={scene.info.story}
        right={<div className="flex flex-wrap items-center gap-2">
          {scene.info.synthetic && <Pill tone="warn"><Sparkles size={12} />SYNTHETIC faults injected</Pill>}
          <Pill tone="sky"><Satellite size={12} />S2 {fmtDate(scene.date)}</Pill>
          <Pill tone={scene.sensors.s1 ? 'teal' : 'block'}>S1 {scene.sensors.s1 ? `${fmtDate(scene.sensors.s1.date)} (Δ${scene.sensors.s1.gap_days}d)` : 'no overlap'}</Pill>
          <StatusBadge status={scene.status} size="lg" pulse />
        </div>} />
      <FalseConfidenceBanner fc={scene.false_confidence} />
      <FitStrip sceneId={sceneId} />

      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {LAYERS.filter((l) => available(l.id)).map((l) => (
              <button key={l.id} onClick={() => { setLayer(l.id); setGeo(false); setCmp(false) }}
                className={clsx('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', layer === l.id && !geo && !cmp ? 'bg-teal text-white shadow' : 'bg-surface-2 text-ink-2 hover:bg-mint')}>{l.label}</button>
            ))}
            <button onClick={() => { setCmp((c) => !c); setGeo(false) }} className={clsx('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold', cmp ? 'bg-ink text-white' : 'bg-[#EEF0FF] text-[#4338CA]')}><Columns2 size={13} />Before / After</button>
            <button onClick={() => { setGeo((g) => !g); setCmp(false) }} className={clsx('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold', geo ? 'bg-sky text-white' : 'bg-skytint text-sky')}><Globe2 size={13} />Geo map</button>
          </div>
          <div className="relative">
            {cmp ? (
              <CompareView key={sceneId} sceneId={sceneId} date={scene.date} layers={scene.layers} scenes={scenes} />
            ) : geo && cfg.data ? (
              <GeoTrustMap bbox={cfg.data.aoi.bbox} image={img} tiles={scene.tiles} showTiles={tiles} onTile={setTile} selected={tile} height={640} />
            ) : (
              <motion.div key={layer + sceneId} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>
                <SceneImageMap src={img} tiles={scene.tiles} showTiles={tiles} onTile={setTile} selected={tile} checker={L.checker}
                  overlay={prov ? layerUrl(sceneId, 'provenance') : null} label={L.label} />
              </motion.div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-ink-2">{cmp ? 'Drag the handle: compare any two layers, or this scene against another date' : geo ? 'Esri World Imagery basemap · scene overlay georeferenced to WGS84' : L.hint}</div>
            <div className="flex items-center gap-4">
              <Toggle on={tiles} set={setTiles} icon={Grid3x3} label="Trust Map" />
              <Toggle on={prov} set={setProv} icon={Layers3} label="Provenance" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
            <TrustLegend />
            {prov && <div className="flex gap-3 text-[11px] text-ink-2">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#3B82F6]/60" />Original observed</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#D97706]" />Cleaned (masked)</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#DC2626]" />Reconstructed</span>
            </div>}
            <span className="text-[11px] text-ink-3">Click any tile → “Why should I trust this?”</span>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center gap-4">
              <TrustGauge score={scene.trust_score} uncertainty={scene.trust_uncertainty} status={scene.status} size={196} />
              <div className="flex-1 space-y-2.5">
                <div className="label">AI readiness by use case</div>
                {profiles.map((p) => {
                  const v = scene.ai_readiness_all[p.id]
                  return (
                    <div key={p.id} className={clsx('rounded-lg px-2 py-1', p.id === profile && 'bg-skytint')}>
                      <div className="flex justify-between text-xs"><span className={clsx(p.id === profile ? 'font-semibold text-sky' : 'text-ink-2')}>{p.name}</span><span className="num font-semibold">{v.toFixed(0)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-2"><motion.div className="h-full rounded-full" style={{ background: scoreColor(v) }} initial={{ width: 0 }} animate={{ width: `${v}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MiniStat k="Interval" v={`${scene.trust_interval[0].toFixed(0)}–${scene.trust_interval[1].toFixed(0)}`} />
              <MiniStat k="Tiles" v={`${scene.tiles.length}`} />
              <MiniStat k="Compute" v={`${scene.processing_ms} ms`} />
            </div>
          </Card>
          <Card>
            <CardTitle icon={ListChecks} title="Gate rules" sub="Hard rules override the weighted score" />
            <GateRules rules={scene.gate_rules_triggered} />
          </Card>
          <Card>
            <CardTitle icon={ScanSearch} title="Ingestion & metadata validation" sub={scene.sensors.s2.item_id} />
            <div className="space-y-1.5">
              {scene.metadata_checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-[12.5px]">
                  {c.status === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-pass" /> : c.status === 'warn' ? <CircleAlert size={14} className="mt-0.5 text-warn" /> : <CircleX size={14} className="mt-0.5 text-block" />}
                  <span className="w-28 shrink-0 font-medium sm:w-36">{c.check}</span><span className="min-w-0 text-ink-2 [overflow-wrap:anywhere]">{c.detail}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle icon={History} title="Before / after recovery" sub="Drag: original observation ↔ reconstructed (red tint = RECONSTRUCTED pixels)" />
          <CompareSlider before={layerUrl(sceneId, 'original')} after={layerUrl(sceneId, 'recon_highlight')} beforeLabel="ORIGINAL" afterLabel="RECONSTRUCTED" />
        </Card>
        <Card>
          <CardTitle icon={Satellite} title="SAR speckle filtering" sub="Raw VV backscatter ↔ Lee 7×7 filtered (normal speckle is not a failure)" />
          {available('sar_raw') ? <CompareSlider before={layerUrl(sceneId, 'sar_raw')} after={layerUrl(sceneId, 'sar_filtered')} beforeLabel="RAW VV" afterLabel="LEE FILTERED" />
            : <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-line text-sm text-ink-3">No Sentinel-1 acquisition within ±12 days</div>}
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle icon={Layers3} title="Data lineage" sub="Every pixel keeps its provenance: original → masked → cleaned → reconstructed → confidence → trust" />
        <div className="grid gap-3 md:grid-cols-6">
          {scene.lineage.map((l, i) => (
            <motion.div key={l.stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="relative rounded-xl border border-line bg-surface-2 p-3">
              <div className="label text-[9px] text-teal">{String(i + 1).padStart(2, '0')} · {l.stage}</div>
              <div className="num mt-1 text-xl font-semibold">{l.stage === 'Confidence' ? l.pct.toFixed(2) : l.stage === 'Final Trust' ? l.pct.toFixed(1) : `${l.pct.toFixed(1)}%`}</div>
              <div className="mt-1 text-[11px] leading-snug text-ink-2">{l.detail}</div>
              {i < 5 && <div className="absolute -right-2.5 top-1/2 z-10 hidden h-0.5 w-3 bg-teal md:block" />}
            </motion.div>
          ))}
        </div>
      </Card>

      {scene.worst_tiles.length > 0 && (
        <Card className="mt-5">
          <CardTitle icon={CircleAlert} title="Worst tiles" sub="Lowest-trust 960 m tiles: click to inspect" />
          <div className="grid gap-3 md:grid-cols-5">
            {scene.worst_tiles.map((t) => (
              <button key={t.id} onClick={() => setTile(t.id)} className="rounded-xl border border-line p-3 text-left transition hover:border-block/40 hover:shadow-card">
                <div className="flex items-center justify-between"><span className="font-mono font-bold">{t.id}</span><span className="num font-semibold" style={{ color: scoreColor(t.score) }}>{t.score.toFixed(0)}</span></div>
                <div className="mt-1 line-clamp-3 text-[11px] text-ink-2">{t.reasons.join(' · ')}</div>
              </button>
            ))}
          </div>
        </Card>
      )}
      <TileDrawer sceneId={sceneId} tileId={tile} onClose={() => setTile(null)} />
    </div>
  )
}

function Toggle({ on, set, icon: Icon, label }: { on: boolean; set: (b: boolean) => void; icon: typeof Grid3x3; label: string }) {
  return (
    <button onClick={() => set(!on)} className="flex items-center gap-2 text-xs font-semibold text-ink-2">
      <span className={clsx('relative h-5 w-9 rounded-full transition', on ? 'bg-teal' : 'bg-surface-3')}>
        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <Icon size={14} />{label}
    </button>
  )
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-surface-2 px-2 py-2"><div className="label text-[9px]">{k}</div><div className="num text-sm font-semibold">{v}</div></div>
}
