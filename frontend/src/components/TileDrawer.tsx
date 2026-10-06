import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle, X } from 'lucide-react'
import { useApi } from '../lib/api'
import { COMPONENT_LABELS } from '../lib/format'
import type { Tile } from '../lib/types'
import TrustGauge from './TrustGauge'
import { LevelPill, Meter, StatusBadge } from './ui'

export default function TileDrawer({ sceneId, tileId, onClose }: { sceneId: string; tileId: string | null; onClose: () => void }) {
  const q = useApi<Tile & { explanation: string }>(tileId ? `/api/scene/${sceneId}/tile/${tileId}` : null)
  const t = q.data
  return (
    <AnimatePresence>
      {tileId && (
        <>
          <motion.div className="fixed inset-0 z-[1500] bg-ink/20 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="scrollbar-thin fixed right-0 top-0 z-[1600] h-full w-[420px] overflow-y-auto border-l border-line bg-surface p-6 shadow-lift"
            initial={{ x: 440 }} animate={{ x: 0 }} exit={{ x: 440 }} transition={{ type: 'spring', damping: 28, stiffness: 260 }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="label">Tile inspector · 960 m × 960 m</div>
                <h3 className="mt-1 font-mono text-2xl font-bold">{tileId}</h3>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-3"><X size={18} /></button>
            </div>
            {!t ? <div className="skeleton mt-6 h-64" /> : (
              <>
                <div className="mt-4 flex items-center gap-4">
                  <TrustGauge score={t.score} size={150} status={t.status} label="Tile trust" />
                  <div className="space-y-2">
                    <StatusBadge status={t.status} />
                    <div className="text-xs text-ink-2">Temporal: <b>{t.temporal_status}</b></div>
                    <div className="flex items-center gap-1 text-xs text-ink-2">Drift <LevelPill level={t.drift} /></div>
                    <div className="flex items-center gap-1 text-xs text-ink-2">Anomaly <LevelPill level={t.anomaly} /></div>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-sky/30 bg-skytint/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-sky"><HelpCircle size={16} />Why should I trust this tile?</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink">{t.explanation}</p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                  {[['Cloud', t.cloud], ['Shadow', t.shadow], ['Missing', t.missing], ['Reconstructed', t.reconstructed]].map(([k, v]) => (
                    <div key={k as string} className="rounded-xl border border-line p-2.5"><div className="label text-[9px]">{k}</div><div className="num text-lg font-semibold">{(v as number).toFixed(1)}%</div></div>
                  ))}
                  <div className="rounded-xl border border-line p-2.5"><div className="label text-[9px]">S1/S2 agreement</div><div className="num text-lg font-semibold">{t.sensor_agreement == null ? 'n/a' : `${t.sensor_agreement.toFixed(0)}%`}</div></div>
                  <div className="rounded-xl border border-line p-2.5"><div className="label text-[9px]">Drift PSI</div><div className="num text-lg font-semibold">{t.drift_psi.toFixed(2)}</div></div>
                </div>
                <div className="mt-5 space-y-3">
                  <div className="label">Components</div>
                  {Object.entries(t.components).map(([k, v]) => <Meter key={k} label={COMPONENT_LABELS[k] ?? k} value={v} />)}
                </div>
                {t.anomaly_top?.length > 0 && (
                  <div className="mt-5">
                    <div className="label mb-2">Isolation-Forest top features</div>
                    {t.anomaly_top.map((a) => (
                      <div key={a.feature} className="flex justify-between border-b border-line py-1.5 font-mono text-xs"><span>{a.feature}</span><span className={Math.abs(a.z) > 3 ? 'text-block' : 'text-ink-2'}>z = {a.z.toFixed(1)}</span></div>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
