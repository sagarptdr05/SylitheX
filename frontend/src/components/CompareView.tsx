import { ArrowLeftRight, MoveHorizontal } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { layerUrl } from '../lib/api'
import { fmtDate } from '../lib/format'
import type { SceneListItem } from '../lib/types'

const LABEL: Record<string, string> = {
  original: 'Original S2', cloudmask: 'Cloud mask', cleaned: 'Cleaned', reconstructed: 'Reconstructed', recon_highlight: 'Reconstructed (marked)',
  sar: 'S1 SAR', sar_raw: 'SAR raw', sar_filtered: 'SAR filtered', ndvi: 'NDVI (recovered)', ndvi_raw: 'NDVI (raw)', uncertainty: 'Uncertainty',
  trustmap: 'Trust map', agreement: 'S1/S2 agreement',
}
type Opt = { key: string; label: string; url: string }

/** Before / after swipe between any two layers of a scene, or between this scene and another date. */
export default function CompareView({ sceneId, date, layers, scenes }: { sceneId: string; date: string; layers: string[]; scenes: SceneListItem[] }) {
  const others = useMemo(() => scenes.filter((s) => !s.demo && s.date !== date).sort((a, b) => a.date.localeCompare(b.date)), [scenes, date])
  const prevClear = [...others].reverse().find((s) => s.date < date && s.status === 'PASS') ?? others.find((s) => s.status === 'PASS')
  const opts: Opt[] = [
    ...layers.filter((l) => LABEL[l]).map((l) => ({ key: l, label: `This scene · ${LABEL[l]}`, url: layerUrl(sceneId, l) })),
    ...others.map((s) => ({ key: `d:${s.scene_id}`, label: `${fmtDate(s.date)} · ${s.status} ${s.trust_score.toFixed(0)}`, url: layerUrl(s.scene_id, 'original') })),
  ]
  const PRESETS: [string, string, string][] = [
    ['Original ↔ Reconstructed', 'original', 'recon_highlight'],
    ['Cloud mask ↔ Cleaned', 'cloudmask', 'cleaned'],
    ['Optical ↔ Radar', 'original', 'sar'],
    ['Raw ↔ Recovered NDVI', 'ndvi_raw', 'ndvi'],
    ...(prevClear ? [['Last clear date ↔ This scene', `d:${prevClear.scene_id}`, 'original'] as [string, string, string]] : []),
  ]
  const [a, setA] = useState(prevClear ? `d:${prevClear.scene_id}` : 'original')
  const [b, setB] = useState(layers.includes('recon_highlight') ? 'original' : 'original')
  const [x, setX] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const A = opts.find((o) => o.key === a) ?? opts[0], B = opts.find((o) => o.key === b) ?? opts[0]
  const set = (cx: number) => { const r = ref.current!.getBoundingClientRect(); setX(Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100))) }
  const Sel = ({ v, on, side }: { v: string; on: (s: string) => void; side: string }) => (
    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold text-ink-2">
      <span className={clsx('rounded-md px-1.5 py-0.5 font-mono text-[10px] text-white', side === 'BEFORE' ? 'bg-ink-2' : 'bg-teal')}>{side}</span>
      <select value={v} onChange={(e) => on(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-medium">
        <optgroup label="Layers of this scene">{opts.filter((o) => !o.key.startsWith('d:')).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
        <optgroup label="Other acquisitions (true colour)">{opts.filter((o) => o.key.startsWith('d:')).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
      </select>
    </label>
  )
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.filter(([, p, q]) => (p.startsWith('d:') || layers.includes(p)) && layers.includes(q)).map(([t, p, q]) => (
          <button key={t} onClick={() => { setA(p); setB(q); setX(50) }} className={clsx('rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', a === p && b === q ? 'border-teal bg-teal text-white' : 'border-line bg-surface text-ink-2 hover:border-teal/50')}>{t}</button>
        ))}
      </div>
      <div className="mb-2 flex items-center gap-2">
        <Sel v={a} on={setA} side="BEFORE" />
        <button onClick={() => { setA(b); setB(a) }} className="rounded-lg border border-line p-1.5 text-ink-2 hover:text-teal" title="Swap"><ArrowLeftRight size={14} /></button>
        <Sel v={b} on={setB} side="AFTER" />
      </div>
      <div ref={ref} className="hud-corners checker relative aspect-square select-none overflow-hidden rounded-2xl border" style={{ borderColor: 'rgba(14,165,233,.6)', touchAction: 'none' }}
        onPointerDown={(e) => { drag.current = true; set(e.clientX) }} onPointerMove={(e) => drag.current && set(e.clientX)}
        onPointerUp={() => (drag.current = false)} onPointerLeave={() => (drag.current = false)}>
        <img src={B.url} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}><img src={A.url} className="absolute inset-0 h-full w-full object-cover" draggable={false} /></div>
        <div className="absolute inset-y-0 w-[3px] bg-white shadow-[0_0_14px_rgba(14,165,233,.9)]" style={{ left: `${x}%` }}>
          <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-white bg-teal text-white shadow-lift"><MoveHorizontal size={18} /></div>
        </div>
        <span className="absolute left-3 top-3 max-w-[45%] truncate rounded-lg bg-space/80 px-2 py-1 font-mono text-[10px] font-semibold text-sky">BEFORE · {A.label}</span>
        <span className="absolute right-3 top-3 max-w-[45%] truncate rounded-lg bg-teal/90 px-2 py-1 font-mono text-[10px] font-semibold text-white">AFTER · {B.label}</span>
      </div>
    </div>
  )
}
