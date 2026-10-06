import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/** Context panel: slides in from the right on desktop, becomes a bottom sheet on phones. */
export default function Sheet({ open, onClose, title, kicker, children, width = 460 }: {
  open: boolean; onClose: () => void; title: ReactNode; kicker?: string; children: ReactNode; width?: number
}) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 768
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[2400] bg-black/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : kicker}
            initial={isPhone ? { y: '100%' } : { x: '100%' }} animate={isPhone ? { y: 0 } : { x: 0 }} exit={isPhone ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 340 }}
            className="scrollbar-thin fixed inset-x-0 bottom-0 z-[2500] max-h-[86vh] overflow-y-auto rounded-t-3xl border-t border-line-2 bg-surface pb-[env(safe-area-inset-bottom)] shadow-lift md:inset-x-auto md:right-0 md:top-0 md:h-full md:max-h-none md:rounded-none md:border-l md:border-t-0"
            style={isPhone ? undefined : { width: `min(${width}px, 100vw)` }}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
              <div className="min-w-0">
                {kicker && <div className="label text-[10px] text-primary">{kicker}</div>}
                <div className="mt-0.5 font-display text-lg font-bold text-strong">{title}</div>
              </div>
              <button onClick={onClose} aria-label="Close panel" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 hover:text-strong"><X size={17} /></button>
            </div>
            <div className="p-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
