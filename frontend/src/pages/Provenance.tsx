import { motion } from 'framer-motion'
import { BadgeCheck, Box, Copy, Cpu, Database, GitBranch, Link2, Satellite, Scale, ShieldCheck, Workflow } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import Sheet from '../components/Sheet'
import { Card, CardTitle, PageHeader, Skeleton, StateBox, StatusBadge } from '../components/ui'
import { useApi } from '../lib/api'
import { fmtDate } from '../lib/format'
import { useStore } from '../lib/store'
import { copyText, useToast } from '../lib/toast'

interface PNode { id: string; kind: 'source' | 'data' | 'process' | 'model' | 'decision' | 'output'; label: string; sub: string; status: 'ok' | 'warn' | 'fail'; version?: string; details: Record<string, unknown> }
interface Prov { scene_id: string; date: string; status: string; nodes: PNode[]; edges: { from: string; to: string }[]; borrowed: { date: string; pixels: number; scene_id: string }[]; bundle: string; provenance_id: string }

const KIND: Record<PNode['kind'], { icon: typeof Box; label: string; color: string }> = {
  source: { icon: Satellite, label: 'Satellite source', color: '#0891B2' },
  data: { icon: Database, label: 'Dataset version', color: '#2563EB' },
  process: { icon: Workflow, label: 'Processing step', color: '#A78BFA' },
  model: { icon: Cpu, label: 'Model', color: '#F472B6' },
  decision: { icon: Scale, label: 'Decision', color: '#D97706' },
  output: { icon: BadgeCheck, label: 'Output', color: '#16A34A' },
}
const ST = { ok: '#16A34A', warn: '#D97706', fail: '#DC2626' }

/** Layered layout: each node's layer = longest path from a source. */
function layout(nodes: PNode[], edges: { from: string; to: string }[]) {
  const layer: Record<string, number> = {}
  const inc = (id: string) => edges.filter((e) => e.to === id).map((e) => e.from)
  const depth = (id: string, seen = new Set<string>()): number => {
    if (layer[id] != null) return layer[id]
    if (seen.has(id)) return 0
    seen.add(id)
    const p = inc(id)
    return (layer[id] = p.length ? Math.max(...p.map((x) => depth(x, seen) + 1)) : 0)
  }
  nodes.forEach((n) => depth(n.id))
  const rows: PNode[][] = []
  nodes.forEach((n) => { (rows[layer[n.id]] ??= []).push(n) })
  return { rows, layer }
}

export default function Provenance() {
  const { sceneId, scene } = useStore()
  const q = useApi<Prov>(sceneId ? `/api/scene/${sceneId}/provenance` : null)
  const [sel, setSel] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const toast = useToast()
  const d = q.data
  const L = useMemo(() => (d ? layout(d.nodes, d.edges) : null), [d])

  // highlight the full upstream lineage of the hovered / selected node
  const focus = hover ?? sel
  const lineage = useMemo(() => {
    if (!d || !focus) return null
    const s = new Set<string>([focus])
    const up = (id: string) => d.edges.filter((e) => e.to === id).forEach((e) => { if (!s.has(e.from)) { s.add(e.from); up(e.from) } })
    up(focus)
    return s
  }, [d, focus])
  const node = d?.nodes.find((n) => n.id === sel)

  // geometry (vertical flow); columns centred per row
  const W = 1000, rowH = 96, nodeW = 214, nodeH = 68
  const pos: Record<string, { x: number; y: number }> = {}
  L?.rows.forEach((row, r) => row.forEach((n, i) => { pos[n.id] = { x: (W / (row.length + 1)) * (i + 1), y: 40 + r * rowH } }))
  const H = L ? 40 + L.rows.length * rowH : 400

  return (
    <div>
      <PageHeader crumbs={['Platform', 'Provenance']} kicker="Provenance" st="9" title="Provenance Explorer"
        sub="Trace any result back to the satellite pass it came from. Each node is a real record: product IDs, SHA-256 hashes, processing versions and gate decisions. Hover a node to light up everything it depends on; click it to inspect."
        right={d && (
          <button onClick={() => copyText(d.provenance_id, toast, 'Provenance ID copied')} className="btn-ghost font-mono text-xs"><Copy size={13} />{d.provenance_id}</button>
        )} />

      {!d ? (q.error ? <StateBox kind="error" title="Lineage unavailable" text={q.error} /> : <Skeleton className="h-[70vh]" />) : (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card pad={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
              <GitBranch size={16} className="text-primary" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{scene?.info.title ?? d.scene_id}</div><div className="font-mono text-[11px] text-ink-3">{d.scene_id} · {fmtDate(d.date)}</div></div>
              <StatusBadge status={d.status} />
            </div>
            {/* desktop / tablet: graph */}
            <div className="scrollbar-thin hidden overflow-x-auto md:block">
              <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px]" style={{ width: '100%' }} role="img" aria-label="Data lineage graph">
                <defs>
                  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--line-2))" /></marker>
                  <marker id="arrOn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2563EB" /></marker>
                </defs>
                {d.edges.map((e, i) => {
                  const a = pos[e.from], b = pos[e.to]
                  if (!a || !b) return null
                  const on = lineage ? lineage.has(e.from) && lineage.has(e.to) : false
                  const y1 = a.y + nodeH / 2, y2 = b.y - nodeH / 2 - 3
                  const path = `M ${a.x} ${y1} C ${a.x} ${(y1 + y2) / 2}, ${b.x} ${(y1 + y2) / 2}, ${b.x} ${y2}`
                  return (
                    <g key={i}>
                      <path d={path} fill="none" stroke={on ? '#2563EB' : 'rgb(var(--line-2))'} strokeWidth={on ? 2.2 : 1.3} markerEnd={`url(#${on ? 'arrOn' : 'arr'})`} opacity={lineage && !on ? 0.35 : 1} />
                      {on && <path d={path} fill="none" stroke="#9cc0ff" strokeWidth={2.2} strokeDasharray="5 9" className="animate-flow" />}
                    </g>
                  )
                })}
                {d.nodes.map((n, i) => {
                  const p = pos[n.id]
                  const k = KIND[n.kind]
                  const dim = lineage && !lineage.has(n.id)
                  return (
                    <g key={n.id} transform={`translate(${p.x - nodeW / 2} ${p.y - nodeH / 2})`}>
                    <motion.g initial={{ opacity: 0 }} animate={{ opacity: dim ? 0.35 : 1 }} transition={{ delay: lineage ? 0 : i * 0.03 }}
                      className="cursor-pointer" tabIndex={0} role="button" aria-label={`${n.label}: ${n.sub}`}
                      onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                      onClick={() => setSel(n.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(n.id) }}>
                      <rect width={nodeW} height={nodeH} rx={14} fill="rgb(var(--surface))" stroke={sel === n.id ? '#2563EB' : k.color + '66'} strokeWidth={sel === n.id ? 2 : 1.2} />
                      <rect x={0} y={0} width={4} height={nodeH} rx={2} fill={k.color} />
                      <circle cx={nodeW - 13} cy={15} r={4.5} fill={ST[n.status]}>{n.status !== 'ok' && <animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite" />}</circle>
                      <text x={16} y={24} fontSize={13} fontWeight={700} fill="rgb(var(--ink))" fontFamily="Inter">{n.label}</text>
                      <text x={16} y={41} fontSize={11} fill="rgb(var(--ink-3))" fontFamily="JetBrains Mono">{n.sub.length > 30 ? n.sub.slice(0, 29) + '…' : n.sub}</text>
                      {n.version && <text x={16} y={58} fontSize={9.5} textAnchor="start" fill={k.color} fontFamily="JetBrains Mono">{n.version}</text>}
                    </motion.g>
                    </g>
                  )
                })}
              </svg>
            </div>
            {/* phone: vertical lineage list */}
            <ol className="space-y-2 p-4 md:hidden">
              {L?.rows.flat().map((n) => {
                const k = KIND[n.kind]
                return (
                  <li key={n.id}>
                    <button onClick={() => setSel(n.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-left">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: k.color + '22', color: k.color }}><k.icon size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{n.label}</span><span className="block truncate font-mono text-[11px] text-ink-3">{n.sub}</span></span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ST[n.status] }} />
                    </button>
                  </li>
                )
              })}
            </ol>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-5 py-3 text-[11px] text-ink-3">
              {Object.values(KIND).map((k) => <span key={k.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: k.color }} />{k.label}</span>)}
              <span className="ml-auto flex items-center gap-3"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pass" />ok</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn" />warning</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-block" />failed</span></span>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardTitle icon={ShieldCheck} title="Chain of custody" sub="Hashes that make the result reproducible" />
              <div className="break-all rounded-xl bg-bg p-3 font-mono text-[11px] leading-relaxed text-pass/90">bundle sha256<br />{d.bundle}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/passport" className="btn-ghost text-xs"><BadgeCheck size={14} />Trust Passport</Link>
                <Link to="/intelligence" className="btn-ghost text-xs"><Link2 size={14} />Re-run & compare</Link>
              </div>
            </Card>
            <Card>
              <CardTitle icon={Link2} title="Borrowed pixels" sub="Other acquisitions this result depends on" />
              {d.borrowed.length === 0 ? <p className="text-sm text-ink-3">No reconstruction: every pixel is an original observation of this acquisition.</p> : (
                <ul className="space-y-1.5">
                  {d.borrowed.map((b) => (
                    <li key={b.date} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[12.5px]"><span className="font-mono">{fmtDate(b.date)}</span><span className="num text-ink-2">{b.pixels.toLocaleString()} px</span></li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11.5px] text-ink-3">If any of these acquisitions is later found faulty, this result is contaminated too (see Trust Intelligence → contamination radius).</p>
            </Card>
          </div>
        </div>
      )}

      <Sheet open={!!node} onClose={() => setSel(null)} kicker={node ? KIND[node.kind].label : ''} title={node?.label ?? ''}>
        {node && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx('chip border', node.status === 'ok' ? 'border-pass/40 text-pass' : node.status === 'warn' ? 'border-warn/40 text-warn' : 'border-block/40 text-block')}>● {node.status === 'ok' ? 'Verified' : node.status === 'warn' ? 'Needs attention' : 'Failed'}</span>
              {node.version && <span className="chip bg-surface-3 font-mono text-ink-2">{node.version}</span>}
            </div>
            <p className="text-sm text-ink-2">{node.sub}</p>
            <dl className="divide-y divide-line rounded-xl border border-line">
              {Object.entries(node.details).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-[12.5px]">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="break-words font-mono text-[11.5px] text-ink [overflow-wrap:anywhere]">{v == null ? '–' : Array.isArray(v) ? v.join(' / ') : String(v)}</dd>
                </div>
              ))}
            </dl>
            {d && (
              <div>
                <div className="label mb-1.5">Depends on</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.edges.filter((e) => e.to === node.id).map((e) => <button key={e.from} onClick={() => setSel(e.from)} className="chip bg-surface-3 text-ink-2 hover:text-strong">← {d.nodes.find((n) => n.id === e.from)?.label}</button>)}
                  {!d.edges.some((e) => e.to === node.id) && <span className="text-xs text-ink-3">Nothing: this is an original source.</span>}
                </div>
                <div className="label mb-1.5 mt-3">Feeds into</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.edges.filter((e) => e.from === node.id).map((e) => <button key={e.to} onClick={() => setSel(e.to)} className="chip bg-surface-3 text-ink-2 hover:text-strong">→ {d.nodes.find((n) => n.id === e.to)?.label}</button>)}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
