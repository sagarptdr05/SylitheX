import { motion } from 'framer-motion'
import clsx from 'clsx'
import { scoreColor } from '../lib/format'
import type { Tile } from '../lib/types'

interface Props {
  src: string; tiles?: Pick<Tile, 'id' | 'row' | 'col' | 'score' | 'status'>[]; showTiles?: boolean; overlay?: string | null
  overlayOpacity?: number; onTile?: (id: string) => void; selected?: string | null; className?: string; checker?: boolean
  label?: string; tileOpacity?: number
}

/** Satellite image with an interactive tile-level Trust Map overlay (SVG). */
export default function SceneImageMap({ src, tiles = [], showTiles = true, overlay, overlayOpacity = 1, onTile, selected, className, checker, label, tileOpacity = 0.55 }: Props) {
  const n = tiles.length ? Math.round(Math.sqrt(tiles.length)) : 8
  return (
    <div className={clsx('hud-corners relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2', checker && 'checker', className)} style={{ borderColor: 'rgba(14,165,233,.6)' }}>
      <img src={src} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {overlay && <img src={overlay} className="absolute inset-0 h-full w-full object-cover" style={{ opacity: overlayOpacity }} draggable={false} />}
      {showTiles && tiles.length > 0 && (
        <svg viewBox={`0 0 ${n} ${n}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {tiles.map((t) => (
            <motion.rect key={t.id} x={t.col} y={t.row} width={1} height={1}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (t.row + t.col) * 0.025 }}
              fill={scoreColor(t.score)} fillOpacity={selected === t.id ? Math.min(0.85, tileOpacity + 0.2) : tileOpacity}
              stroke={selected === t.id ? '#FFFFFF' : 'rgba(255,255,255,0.55)'} strokeWidth={selected === t.id ? 0.06 : 0.02}
              className={onTile ? 'cursor-pointer transition-[fill-opacity] hover:[fill-opacity:0.85]' : ''} onClick={() => onTile?.(t.id)}>
              <title>{`${t.id} · trust ${t.score.toFixed(0)} · ${t.status}`}</title>
            </motion.rect>
          ))}
        </svg>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 animate-scan bg-gradient-to-b from-transparent via-sky/15 to-transparent" />
      {label && <div className="absolute left-3 top-3 rounded-lg bg-space/75 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-sky backdrop-blur">{label}</div>}
      <div className="absolute bottom-2 right-3 font-mono text-[9px] text-white/80 drop-shadow">10 m · EPSG:32643</div>
    </div>
  )
}

export function TrustLegend() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-2">
      <span className="font-mono">0</span>
      <div className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(90deg,#DC2626,#D97706 50%,#EAC81E 80%,#16A34A)' }} />
      <span className="font-mono">100</span>
      <span className="ml-2">Tile trust</span>
    </div>
  )
}
