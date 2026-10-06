import { AnimatePresence, motion } from 'framer-motion'
import { Check, ClipboardCheck, RefreshCw, UserCheck, X } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { Reasons, GateRules, FalseConfidenceBanner } from '../components/Insights'
import SceneImageMap from '../components/SceneImageMap'
import TrustGauge from '../components/TrustGauge'
import { Card, CardTitle, Empty, PageHeader, StatusBadge } from '../components/ui'
import { invalidate, layerUrl, post, useApi } from '../lib/api'
import type { Scene } from '../lib/types'

interface Q { scene_id: string; title: string; date: string; trust_score: number; status: string; reasons: string[]; decision: { decision: string; reviewer: string; created_at: string } | null }
const VIEWS = [['original', 'Original'], ['cloudmask', 'Mask'], ['cleaned', 'Cleaned'], ['recon_highlight', 'Reconstructed'], ['sar', 'S1 SAR'], ['trustmap', 'Trust map']]

export default function Review() {
  const [rev, setRev] = useState(0)
  const q = useApi<Q[]>('/api/review/queue', [rev])
  const [sel, setSel] = useState<string | null>(null)
  const id = sel ?? q.data?.find((x) => !x.decision)?.scene_id ?? q.data?.[0]?.scene_id ?? null
  const s = useApi<Scene>(id ? `/api/scene/${id}` : null)
  const [note, setNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const decide = async (decision: string) => {
    if (!id) return
    await post('/api/review', { scene_id: id, decision, reviewer: 'analyst@terratrust', note })
    invalidate('/api/review'); invalidate('/api/passport'); invalidate('/api/dashboard')
    setToast(`${decision} stored for ${id}`); setNote(''); setRev((r) => r + 1)
    setTimeout(() => setToast(null), 2500)
  }
  const pending = q.data?.filter((x) => !x.decision).length ?? 0
  return (
    <div>
      <PageHeader kicker="Human review" st="5 · WARNING → human" title="Review queue"
        sub="WARNING scenes (and clean-looking scenes with false confidence) never go to AI automatically. A reviewer sees every processing state and decides; the decision is stored and written into the Trust Passport." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Card pad={false}>
          <div className="p-5 pb-2"><CardTitle icon={UserCheck} title="Queue" sub={`${pending} pending · ${q.data?.length ?? 0} total`} /></div>
          <div className="scrollbar-thin max-h-[75vh] overflow-y-auto px-3 pb-3">
            {q.data?.length === 0 && <Empty text="Queue is empty" />}
            {q.data?.map((x) => (
              <button key={x.scene_id} onClick={() => setSel(x.scene_id)}
                className={clsx('mb-1.5 flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition', id === x.scene_id ? 'border-teal bg-mint/60' : 'border-transparent hover:bg-surface-3')}>
                <img src={layerUrl(x.scene_id, 'original')} className="h-11 w-11 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{x.title}</div>
                  <div className="truncate text-[11px] text-ink-3">{x.reasons[0]}</div>
                </div>
                <div className="text-right">
                  <div className="num text-sm font-semibold">{x.trust_score.toFixed(0)}</div>
                  {x.decision ? <span className={clsx('chip text-[9px]', x.decision.decision === 'APPROVE' ? 'bg-pass-bg text-pass' : x.decision.decision === 'REJECT' ? 'bg-block-bg text-block' : 'bg-skytint text-sky')}>{x.decision.decision}</span> : <span className="chip bg-warn-bg text-[9px] text-warn-ink">PENDING</span>}
                </div>
              </button>
            ))}
          </div>
        </Card>
        {s.data ? (
          <div className="space-y-5">
            <FalseConfidenceBanner fc={s.data.false_confidence} />
            <Card>
              <div className="flex flex-wrap items-center gap-5">
                <TrustGauge score={s.data.trust_score} uncertainty={s.data.trust_uncertainty} status={s.data.status} size={170} />
                <div className="flex-1">
                  <div className="flex items-center gap-2"><h2 className="text-xl font-bold">{s.data.info.title}</h2><StatusBadge status={s.data.status} /></div>
                  <div className="font-mono text-xs text-ink-3">{s.data.scene_id}</div>
                  <p className="mt-2 text-sm text-ink-2">{s.data.info.story}</p>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note (optional)…" className="mt-3 h-16 w-full resize-none rounded-xl border border-line p-2.5 text-sm outline-none focus:border-teal" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => decide('APPROVE')} className="btn bg-pass text-white hover:opacity-90"><Check size={16} />Approve for AI</button>
                    <button onClick={() => decide('REJECT')} className="btn bg-block text-white hover:opacity-90"><X size={16} />Reject</button>
                    <button onClick={() => decide('REPROCESS')} className="btn-ghost"><RefreshCw size={16} />Request reprocessing</button>
                  </div>
                </div>
              </div>
            </Card>
            <Card>
              <CardTitle icon={ClipboardCheck} title="Evidence" sub="All processing states side by side" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {VIEWS.filter(([k]) => s.data!.layers.includes(k)).map(([k, l]) => (
                  <SceneImageMap key={k} src={layerUrl(s.data!.scene_id, k)} showTiles={false} label={l} checker={k === 'cleaned'} />
                ))}
              </div>
            </Card>
            <Card>
              <GateRules rules={s.data.gate_rules_triggered} />
              <div className="mt-4"><Reasons pos={s.data.reasons_positive} neg={s.data.reasons_negative} /></div>
            </Card>
          </div>
        ) : <div className="skeleton h-[600px]" />}
      </div>
      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lift"><Check size={16} className="text-pass" />{toast} · saved to SQLite</motion.div>}
      </AnimatePresence>
    </div>
  )
}
