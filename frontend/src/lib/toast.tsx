import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'warn' | 'info'
interface T { id: number; text: string; tone: Tone }
const C = createContext<(text: string, tone?: Tone) => void>(() => undefined)

/** Small, accessible toast notifications (aria-live) for confirmations like "copied" or "report exported". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x.slice(-2), { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 2600)
  }, [])
  const I = { ok: CheckCircle2, warn: AlertTriangle, info: Info }
  const col = { ok: 'text-pass', warn: 'text-warn', info: 'text-sky' }
  return (
    <C.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[3000] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6">
        <AnimatePresence>
          {items.map((t) => {
            const Ic = I[t.tone]
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
                className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line-2 bg-surface px-4 py-2.5 text-sm shadow-lift">
                <Ic size={16} className={col[t.tone]} />{t.text}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </C.Provider>
  )
}

export const useToast = () => useContext(C)

export async function copyText(text: string, toast: (t: string, tone?: Tone) => void, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`${what} to clipboard`) } catch { toast('Copy failed: clipboard blocked', 'warn') }
}
