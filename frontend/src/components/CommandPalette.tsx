import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Satellite, Search, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { fmtDate, scoreColor } from '../lib/format'
import { useStore } from '../lib/store'
import { ALL_NAV } from './Layout'

interface Item { key: string; group: string; label: string; sub: string; icon: LucideIcon; score?: number; run: () => void }

/** ⌘K / "/" : jump to any section, dataset or location from the keyboard. */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const nav = useNavigate()
  const { scenes, setSceneId, aois, setAoi } = useStore()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 30) } }, [open])

  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase()
    const m = (s: string) => !t || s.toLowerCase().includes(t)
    const pages = ALL_NAV.filter((n) => m(n.label) || m(n.hint)).map((n) => ({ key: n.to, group: 'Sections', label: n.label, sub: n.hint, icon: n.icon, run: () => { nav(n.to) } }))
    const ds = scenes.filter((s) => m(s.title) || m(s.date) || m(s.scene_id)).slice(0, 8).map((s) => ({
      key: s.scene_id, group: 'Datasets', label: s.demo ? s.title : `Sentinel-2 · ${fmtDate(s.date)}`, sub: `${s.scene_id} · trust ${s.trust_score.toFixed(0)} · ${s.status}`,
      icon: Satellite, score: s.trust_score, run: () => { setSceneId(s.scene_id); nav('/sources') },
    }))
    const locs = aois.filter((a) => a.status.state === 'ready' && (m(a.name) || m(a.region))).map((a) => ({
      key: 'aoi-' + a.id, group: 'Projects', label: a.name, sub: a.region, icon: Satellite, run: () => setAoi(a.id),
    }))
    return [...pages, ...locs, ...ds]
  }, [q, scenes, aois, nav, setSceneId, setAoi])

  const go = (k: number) => { const it = items[k]; if (it) { it.run(); onClose() } }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(i) }
    else if (e.key === 'Escape') onClose()
  }
  let last = ''
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[4000] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div role="dialog" aria-label="Search and jump" initial={{ y: -10, scale: 0.98 }} animate={{ y: 0, scale: 1 }} onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-lift">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="text-ink-3" />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} onKeyDown={onKey} placeholder="Search sections, datasets, projects…"
                aria-label="Search" className="w-full bg-transparent py-4 text-[15px] outline-none placeholder:text-ink-3" />
              <kbd className="rounded border border-line-2 px-1.5 font-mono text-[10px] text-ink-3">ESC</kbd>
            </div>
            <div className="scrollbar-thin max-h-[56vh] overflow-y-auto p-2" role="listbox">
              {items.length === 0 && <div className="px-3 py-8 text-center text-sm text-ink-3">No matches for “{q}”.</div>}
              {items.map((it, k) => {
                const head = it.group !== last ? (last = it.group) : null
                return (
                  <div key={it.key}>
                    {head && <div className="label px-3 pb-1 pt-2 text-[10px]">{head}</div>}
                    <button role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => go(k)}
                      className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', k === i ? 'bg-mint' : '')}>
                      <it.icon size={17} className="shrink-0 text-primary" />
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{it.label}</div><div className="truncate text-[11px] text-ink-3">{it.sub}</div></div>
                      {it.score != null && <span className="num text-xs font-bold" style={{ color: scoreColor(it.score) }}>{it.score.toFixed(0)}</span>}
                      {k === i && <CornerDownLeft size={14} className="text-ink-3" />}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 border-t border-line px-4 py-2 font-mono text-[10px] text-ink-3"><span>↑↓ navigate</span><span>↵ open</span><span>⌘K / “/” anywhere</span></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
