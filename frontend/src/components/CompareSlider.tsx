import { useRef, useState } from 'react'
import { MoveHorizontal } from 'lucide-react'

export default function CompareSlider({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const [x, setX] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const set = (cx: number) => {
    const r = ref.current!.getBoundingClientRect()
    setX(Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)))
  }
  return (
    <div ref={ref} className="hud-corners relative aspect-square select-none overflow-hidden rounded-2xl border bg-surface-2" style={{ borderColor: 'rgba(14,165,233,.6)' }}
      onPointerDown={(e) => { drag.current = true; set(e.clientX) }} onPointerMove={(e) => drag.current && set(e.clientX)}
      onPointerUp={() => (drag.current = false)} onPointerLeave={() => (drag.current = false)}>
      <img src={after} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
        <img src={before} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      </div>
      <div className="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_12px_rgba(14,165,233,.9)]" style={{ left: `${x}%` }}>
        <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-white bg-teal text-white shadow-lift"><MoveHorizontal size={16} /></div>
      </div>
      <span className="absolute left-3 top-3 rounded-lg bg-space/75 px-2 py-1 font-mono text-[10px] font-semibold text-sky">{beforeLabel}</span>
      <span className="absolute right-3 top-3 rounded-lg bg-space/75 px-2 py-1 font-mono text-[10px] font-semibold text-sky">{afterLabel}</span>
    </div>
  )
}
