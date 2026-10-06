import { motion } from 'framer-motion'
import { Activity, ArrowLeftRight, Building2, Leaf, Radar, Satellite, ShieldQuestion, Waves } from 'lucide-react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { FalseConfidenceBanner } from '../components/Insights'
import SceneImageMap from '../components/SceneImageMap'
import { Card, CardTitle, PageHeader, Pill, Skeleton } from '../components/ui'
import { layerUrl } from '../lib/api'
import { scoreColor } from '../lib/format'
import { useStore } from '../lib/store'

const RULES = [
  { k: 'vegetation', icon: Leaf, title: 'Vegetation ↔ VH', physics: 'Green canopy causes volume scattering → higher cross-pol VH. VH must match the NDVI-predicted value within 2.5σ.' },
  { k: 'water', icon: Waves, title: 'Water ↔ low VV', physics: 'Open water is a specular reflector → very low VV (< −14 dB) wherever optical NDWI says water.' },
  { k: 'surface', icon: Building2, title: 'Built-up / surface ↔ VV', physics: 'Buildings and rough bare soil give double-bounce / surface scattering → VV consistent with NDBI.' },
  { k: 'change', icon: Activity, title: 'Change agreement', physics: 'Where NDVI changed since the reference date, VH must change in the same direction.' },
]

export default function Fusion() {
  const { scene, sceneId } = useStore()
  if (!scene) return <Skeleton className="h-[600px]" />
  const f = scene.fusion
  const agree = scene.components.sensor_agreement
  const pts = scene.tiles.filter((t) => t.ndvi != null && t.sensor_agreement != null).map((t) => ({ ndvi: t.ndvi, agree: t.sensor_agreement, score: t.score, id: t.id }))
  return (
    <div>
      <PageHeader kicker="Sensor fusion" st="2 · Compare across sensors" title="Do radar and optical tell the same story?"
        sub="Raw optical and raw SAR are never compared directly. TerraTrust checks physics: what Sentinel-2 sees should produce a predictable Sentinel-1 backscatter. The relationship is learned on the AOI's own clear history." />
      <FalseConfidenceBanner fc={scene.false_confidence} />
      {!f.available ? (
        <Card><div className="flex items-center gap-3 text-sm"><ShieldQuestion className="text-warn" />No Sentinel-1 acquisition within ±12 days of this scene. Cross-sensor validation is unavailable, its weight is redistributed and the uncertainty widened.</div></Card>
      ) : (
        <>
          <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <Panel title="Sentinel-1 · C-band SAR" sub={`${f.s1_date} · VV/VH Lee-filtered`} icon={Radar}><SceneImageMap src={layerUrl(sceneId, 'sar')} showTiles={false} label="S1 SAR" /></Panel>
            <Link />
            <Panel title="Agreement heatmap" sub="per 80 m superpixel · green = consistent" icon={ArrowLeftRight}>
              <SceneImageMap src={layerUrl(sceneId, 'original')} overlay={layerUrl(sceneId, 'agreement')} overlayOpacity={0.78} showTiles={false} label="S1 ⇄ S2" />
            </Panel>
            <Link />
            <Panel title="Sentinel-2 · MSI optical" sub={`${scene.date} · recovered where cloudy`} icon={Satellite}><SceneImageMap src={layerUrl(sceneId, 'reconstructed')} showTiles={false} label="S2 OPTICAL" /></Panel>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardTitle icon={ArrowLeftRight} title="Multi-sensor agreement" sub="Weighted combination of physics rules per tile" right={<span className="num text-3xl font-bold" style={{ color: scoreColor(agree ?? 0) }}>{agree?.toFixed(0)}%</span>} />
              <div className="space-y-3">
                {RULES.map((r, i) => {
                  const v = f.rules[r.k]
                  return (
                    <motion.div key={r.k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="rounded-xl border border-line p-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint text-teal"><r.icon size={17} /></div>
                        <div className="flex-1"><div className="text-sm font-semibold">{r.title}</div><div className="text-[11.5px] leading-snug text-ink-2">{r.physics}</div></div>
                        {v == null ? <Pill>n/a</Pill> : <span className="num text-lg font-semibold" style={{ color: scoreColor(v) }}>{v.toFixed(0)}%</span>}
                      </div>
                      {v != null && <div className="mt-2 h-1.5 rounded-full bg-surface-2"><motion.div className="h-full rounded-full" style={{ background: scoreColor(v) }} initial={{ width: 0 }} animate={{ width: `${v}%` }} /></div>}
                    </motion.div>
                  )
                })}
              </div>
              {f.reference && <div className="mt-3 font-mono text-[11px] text-ink-3">change reference: S2 {f.reference[0]} + S1 {f.reference[1]}</div>}
            </Card>
            <div className="space-y-5">
              <Card>
                <CardTitle icon={Activity} title="Temporal anomalies vs Sentinel-1" sub="An optical anomaly is only an error if radar disagrees" />
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['REQUIRES VALIDATION', 'sky', 'flagged, no radar evidence'],
                    ['REAL EVENT CONFIRMED', 'pass', 'S1 confirms → no penalty'],
                    ['SUSPECTED DATA ERROR', 'block', 'S1 disagrees → penalty'],
                  ].map(([k, tone, d]) => (
                    <div key={k} className={`rounded-xl p-3 ${tone === 'pass' ? 'bg-pass-bg' : tone === 'block' ? 'bg-block-bg' : 'bg-skytint'}`}>
                      <div className="num text-3xl font-bold">{scene.temporal.statuses[k] ?? 0}</div>
                      <div className="text-[11px] font-bold">{k}</div>
                      <div className="text-[10.5px] text-ink-2">{d}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardTitle icon={Leaf} title="Tile NDVI vs S1/S2 agreement" sub="Each dot is a 960 m tile, coloured by final trust" />
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ left: -12, right: 8, top: 4 }}>
                    <CartesianGrid stroke="#E2E8F0" />
                    <XAxis dataKey="ndvi" name="NDVI" type="number" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" domain={['auto', 'auto']} />
                    <YAxis dataKey="agree" name="agreement" unit="%" domain={[0, 100]} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" />
                    <ZAxis range={[50, 50]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Scatter data={pts} shape={(p: { cx?: number; cy?: number; payload?: { score: number } }) => <circle cx={p.cx} cy={p.cy} r={6} fill={scoreColor(p.payload?.score ?? 0)} stroke="#fff" strokeWidth={1.5} />} />
                  </ScatterChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Panel({ title, sub, icon: Icon, children }: { title: string; sub: string; icon: typeof Radar; children: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-2 px-1"><Icon size={15} className="text-teal" /><div><div className="text-sm font-semibold">{title}</div><div className="font-mono text-[10px] text-ink-3">{sub}</div></div></div>
      {children}
    </Card>
  )
}

function Link() {
  return (
    <div className="mx-auto flex flex-col items-center gap-1">
      <div className="relative h-1 w-10 overflow-hidden rounded-full bg-line">
        <motion.div className="absolute h-1 w-3 rounded-full bg-sky" animate={{ left: ['-20%', '100%'] }} transition={{ duration: 1, repeat: Infinity }} />
      </div>
      <ArrowLeftRight size={16} className="text-sky" />
    </div>
  )
}
