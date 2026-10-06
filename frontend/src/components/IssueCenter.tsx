import { ChevronDown, Download, ListChecks } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { API, getApiAoi, useApi } from '../lib/api'
import { fmtDate, sevColor } from '../lib/format'
import type { Issue } from '../lib/types'
import { Card, CardTitle, Skeleton, StateBox } from './ui'

interface Resp { scene_id: string; date: string; status: string; issues: Issue[]; checks: { check: string; status: string; detail: string }[]; counts: Record<string, number> }
const SEVS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
const CATS = ['all', 'quality', 'anomaly', 'integrity', 'event']

/** Every issue of the active dataset, answering WHAT · WHY · WHERE · WHEN · HOW SEVERE · IMPACT · ACTION. */
export default function IssueCenter({ sceneId }: { sceneId: string }) {
  const q = useApi<Resp>(`/api/quality/issues?scene_id=${sceneId}`)
  const [cat, setCat] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const items = useMemo(() => (q.data?.issues ?? []).filter((i) => cat === 'all' || i.category === cat), [q.data, cat])

  const exportCsv = () => {
    if (!q.data) return
    const head = ['what', 'severity', 'category', 'sensor', 'when', 'where_tiles', 'area_pct', 'why', 'impact', 'action', 'confidence_pct']
    const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const rows = q.data.issues.map((i) => [i.type, i.severity, i.category, i.sensor, i.date, i.tiles.join(' '), i.area_pct, i.why, i.impact, i.action, i.confidence].map(esc).join(','))
    const url = URL.createObjectURL(new Blob([[head.join(','), ...rows].join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `${q.data.scene_id}_quality_issues.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <Card pad={false}>
      <div className="p-5 pb-3">
        <CardTitle icon={ListChecks} title="Issue center" sub="Every problem found in this dataset, and what the trust layer did about it"
          right={<div className="flex gap-2"><button onClick={exportCsv} className="btn-ghost px-3 py-2 text-xs"><Download size={13} />Export issues</button><a href={`${API}/api/passport/${sceneId}?aoi=${getApiAoi()}&format=csv`} className="btn-ghost hidden px-3 py-2 text-xs sm:inline-flex"><Download size={13} />Tile report</a></div>} />
        {q.data && (
          <div className="flex flex-wrap items-center gap-2">
            {SEVS.filter((s) => q.data!.counts[s]).map((s) => <span key={s} className="chip border text-[11px]" style={{ borderColor: sevColor(s) + '66', color: sevColor(s), background: sevColor(s) + '14' }}>{q.data!.counts[s]} {s}</span>)}
            <div className="ml-auto flex flex-wrap gap-1">{CATS.map((c) => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={clsx('rounded-lg px-2.5 py-1 text-[11.5px] font-semibold capitalize', cat === c ? 'bg-primary text-white' : 'bg-surface-2 text-ink-3 hover:text-strong')}>{c}</button>)}</div>
          </div>
        )}
      </div>
      {!q.data ? <div className="p-5"><Skeleton className="h-48" /></div> : items.length === 0 ? (
        <div className="p-5"><StateBox title="No issues found" text="This dataset passed every quality, anomaly and integrity check in this category." /></div>
      ) : (
        <>
          <div className="scrollbar-thin hidden overflow-x-auto lg:block">
            <table className="w-full text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3"><tr className="border-y border-line">
                {['What', 'Severity', 'Where', 'When', 'Impact', 'Action', ''].map((h) => <th key={h} className="px-4 py-2.5 text-left font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((i) => (
                  <Fragment key={i.id}>
                    <tr onClick={() => setOpen(open === i.id ? null : i.id)} className="cursor-pointer border-b border-line align-top transition hover:bg-surface-2/60">
                      <td className="px-4 py-3"><div className="font-semibold text-strong">{i.type}</div><div className="text-[11px] text-ink-3">{i.sensor}</div></td>
                      <td className="px-4 py-3"><span className="font-mono text-[11px] font-bold" style={{ color: sevColor(i.severity) }}>● {i.severity}</span><div className="text-[11px] text-ink-3">{i.confidence}% conf.</div></td>
                      <td className="px-4 py-3 text-ink-2">{i.scene_level ? 'whole scene' : `${i.n_tiles} tiles · ${i.area_pct.toFixed(0)}%`}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-ink-2">{fmtDate(i.date)}</td>
                      <td className="max-w-[220px] px-4 py-3 text-ink-2">{i.impact}</td>
                      <td className="max-w-[260px] px-4 py-3 text-ink-2">{i.action}</td>
                      <td className="px-4 py-3"><ChevronDown size={15} className={clsx('text-ink-3 transition', open === i.id && 'rotate-180')} /></td>
                    </tr>
                    {open === i.id && (
                      <tr className="border-b border-line bg-surface-2/40"><td colSpan={7} className="px-4 py-3 text-[12.5px]">
                        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                          <div><div className="label mb-1 text-[10px]">Why</div><p className="text-ink-2">{i.why}</p><div className="label mb-1 mt-3 text-[10px]">Gate</div><p className="text-ink-2">{i.gate_action}</p></div>
                          <div><div className="label mb-1 text-[10px]">Where (tiles)</div><p className="font-mono text-[11px] text-ink-3 [overflow-wrap:anywhere]">{i.tiles.join(' ')}</p>
                            <Link to={`/anomalies?focus=${encodeURIComponent(i.id)}`} className="mt-2 inline-block text-xs font-semibold text-primary">Show on map →</Link></div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 p-3 lg:hidden">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl border border-line bg-surface-2/50 p-3">
                <button className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(open === i.id ? null : i.id)}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(i.severity) }} />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{i.type} <span className="font-mono text-[10px]" style={{ color: sevColor(i.severity) }}>{i.severity}</span></span>
                    <span className="block text-[11.5px] text-ink-3">{i.scene_level ? 'whole scene' : `${i.n_tiles} tiles · ${i.area_pct.toFixed(0)}%`} · {fmtDate(i.date)}</span></span>
                  <ChevronDown size={15} className={clsx('mt-1 text-ink-3 transition', open === i.id && 'rotate-180')} />
                </button>
                {open === i.id && <dl className="mt-2 space-y-1.5 border-t border-line pt-2 text-[12px]">{[['Why', i.why], ['Impact', i.impact], ['Action', i.action]].map(([k, v]) => <div key={k}><dt className="text-ink-3">{k}</dt><dd className="text-ink-2">{v}</dd></div>)}</dl>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
