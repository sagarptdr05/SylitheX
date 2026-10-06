import { motion } from 'framer-motion'
import { CalendarDays, CloudRain, Film, LineChart as LC, Snowflake, Sun, Sunrise, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardTitle, PageHeader, Skeleton, StatusBadge } from '../components/ui'
import { layerUrl, useApi } from '../lib/api'
import { fmtDate, monsoonRange, scoreColor, statusColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { ProfileId } from '../lib/types'

interface Pt { date: string; scene_id: string; trust: number; lo: number; hi: number; status: string; cloud: number; recon: number; cause: string; false_confidence: boolean; readiness: Record<ProfileId, number> }
interface TL { aoi_name: string; points: Pt[]; monthly: { month: string; trust: number; n: number; pass: number; warning: number; blocked: number }[]; forecast: { month: string; trust: number; basis: string }[] }

const PROFILE_COLORS: Record<ProfileId, string> = { crop_monitoring: '#16A34A', flood_detection: '#0891B2', urban_planning: '#7C3AED', climate_monitoring: '#D97706' }
const SEASONS = [
  { id: 'winter', name: 'Winter (Rabi)', months: ['11', '12', '01', '02'], icon: Snowflake, color: '#0891B2' },
  { id: 'summer', name: 'Summer', months: ['03', '04', '05'], icon: Sun, color: '#D97706' },
  { id: 'monsoon', name: 'SW Monsoon', months: ['06', '07', '08', '09'], icon: CloudRain, color: '#6366F1' },
  { id: 'post', name: 'Post-monsoon', months: ['10'], icon: Sunrise, color: '#14B8A6' },
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Timeline() {
  const q = useApi<TL>('/api/timeline')
  const { setSceneId, profiles, activeAoi } = useStore()
  const nav = useNavigate()
  const [lines, setLines] = useState<ProfileId[]>(['flood_detection'])
  const [hover, setHover] = useState<string | null>(null)
  const d = q.data
  const pts = useMemo(() => d?.points.map((p) => ({ ...p, band: [p.lo, p.hi], ...Object.fromEntries(Object.entries(p.readiness).map(([k, v]) => [`r_${k}`, v])) })) ?? [], [d])
  const open = (sid: string) => { setSceneId(sid); nav('/scene') }

  const stats = useMemo(() => {
    if (!d) return null
    const P = d.points
    const avg = (a: Pt[]) => (a.length ? a.reduce((s, p) => s + p.trust, 0) / a.length : 0)
    const seasons = SEASONS.map((s) => {
      const a = P.filter((p) => s.months.includes(p.date.slice(5, 7)))
      return { ...s, n: a.length, avg: avg(a), passRate: a.length ? a.filter((p) => p.status === 'PASS').length / a.length : 0 }
    })
    const best = [...P].sort((a, b) => b.trust - a.trust)[0], worst = [...P].sort((a, b) => a.trust - b.trust)[0]
    const dry = seasons.find((s) => s.id === 'winter')!.avg, mon = seasons.find((s) => s.id === 'monsoon')!.avg
    return { avg: avg(P), pass: P.filter((p) => p.status === 'PASS').length / P.length, best, worst, seasons, dip: dry ? (dry - mon) / dry : 0 }
  }, [d])

  if (!d || !stats) return <Skeleton className="h-[700px]" />
  const mon = monsoonRange(pts.map((p) => p.date))
  return (
    <div>
      <PageHeader kicker="Trust timeline" st="4 · Trust over time" title={`A year of trust over ${activeAoi?.name ?? d.aoi_name}`}
        sub="Every real acquisition, scored. Watch the South-West monsoon pull optical trust down while radar keeps flood-detection readiness high, and use last year to predict the next dip." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          { k: 'Average trust', v: stats.avg.toFixed(1), s: `${d.points.length} acquisitions`, icon: LC, c: '#2563EB' },
          { k: 'Pass rate', v: `${Math.round(stats.pass * 100)}%`, s: 'released to AI', icon: TrendingUp, c: '#16A34A' },
          { k: 'Monsoon dip', v: `−${Math.round(stats.dip * 100)}%`, s: 'vs winter average', icon: TrendingDown, c: '#6366F1' },
          { k: 'Best scene', v: stats.best.trust.toFixed(0), s: fmtDate(stats.best.date), icon: Trophy, c: '#16A34A', sid: stats.best.scene_id },
          { k: 'Worst scene', v: stats.worst.trust.toFixed(0), s: fmtDate(stats.worst.date), icon: CloudRain, c: '#DC2626', sid: stats.worst.scene_id },
          { k: 'Next 3 months', v: d.forecast.length ? (d.forecast.reduce((s, f) => s + f.trust, 0) / d.forecast.length).toFixed(0) : '·', s: 'forecast trust', icon: CalendarDays, c: '#0891B2' },
        ].map((x, i) => (
          <motion.button key={x.k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            onClick={() => x.sid && open(x.sid)} className={clsx('card card-pad text-left transition hover:shadow-lift', x.sid && 'cursor-pointer')}>
            <div className="flex items-center justify-between"><span className="label">{x.k}</span><x.icon size={16} style={{ color: x.c }} /></div>
            <div className="num mt-2 text-3xl font-bold" style={{ color: x.c }}>{x.v}</div>
            <div className="mt-0.5 text-xs text-ink-2">{x.s}</div>
          </motion.button>
        ))}
      </div>

      <Card className="mt-5">
        <CardTitle icon={LC} title="Trust Score per acquisition" sub="Shaded band = 95 % interval · dots = gate decision · dashed ring = false confidence · click any point"
          right={
            <div className="flex flex-wrap gap-1.5">
              {profiles.map((p) => {
                const on = lines.includes(p.id)
                return (
                  <button key={p.id} onClick={() => setLines((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                    className={clsx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', on ? 'text-white' : 'bg-surface text-ink-2')}
                    style={{ background: on ? PROFILE_COLORS[p.id] : undefined, borderColor: PROFILE_COLORS[p.id] + '88' }}>
                    AI ready · {p.name}
                  </button>
                )
              })}
            </div>
          } />
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={pts} margin={{ left: -14, right: 12, top: 10 }}
            onClick={(e) => { const i = Number(e?.activeIndex); const s = Number.isFinite(i) ? pts[i]?.scene_id : undefined; if (s) open(s) }}>
            <CartesianGrid stroke="#E2E8F0" vertical={false} />
            <ReferenceArea y1={80} y2={100} fill="#16A34A" fillOpacity={0.06} />
            <ReferenceArea y1={50} y2={80} fill="#D97706" fillOpacity={0.06} />
            <ReferenceArea y1={0} y2={50} fill="#DC2626" fillOpacity={0.06} />
            {mon && <ReferenceArea x1={mon[0]} x2={mon[1]} fill="#6366F1" fillOpacity={0.08} label={{ value: '☔ SW monsoon 2026', position: 'insideTop', fontSize: 11, fill: '#4338CA' }} />}
            <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" minTickGap={24} tickFormatter={(v) => v.slice(2)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="#94A3B8" />
            <Tooltip content={({ payload }) => {
              const p = payload?.[0]?.payload as Pt | undefined
              if (!p) return null
              return (
                <div className="w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-lift">
                  <img src={layerUrl(p.scene_id, 'original')} className="h-28 w-full object-cover" />
                  <div className="p-3 text-xs">
                    <div className="flex items-center justify-between"><b>{fmtDate(p.date)}</b><StatusBadge status={p.status} size="sm" /></div>
                    <div className="num mt-1 text-xl font-bold">{p.trust.toFixed(1)} <span className="text-xs text-ink-3">[{p.lo}–{p.hi}]</span></div>
                    <div className="text-ink-2">cloud {p.cloud.toFixed(0)}% · reconstructed {p.recon.toFixed(0)}%</div>
                    <div className="mt-1 text-ink">{p.cause}</div>
                  </div>
                </div>
              )
            }} />
            <Area dataKey="band" stroke="none" fill="#2563EB" fillOpacity={0.12} />
            {lines.map((id) => <Line key={id} dataKey={`r_${id}`} stroke={PROFILE_COLORS[id]} strokeWidth={1.8} strokeDasharray="5 4" dot={false} />)}
            <Line dataKey="trust" stroke="#2563EB" strokeWidth={2.6}
              dot={(p: { cx?: number; cy?: number; payload?: Pt; index?: number }) => (
                <g key={p.index} style={{ cursor: 'pointer' }}>
                  {p.payload?.false_confidence && <circle cx={p.cx} cy={p.cy} r={10} fill="none" stroke="#D97706" strokeWidth={2} strokeDasharray="2 2" />}
                  <circle cx={p.cx} cy={p.cy} r={hover === p.payload?.scene_id ? 8 : 5.5} fill={statusColor(p.payload?.status ?? 'PASS')} stroke="#fff" strokeWidth={2} />
                </g>
              )} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card className="mt-5" pad={false}>
        <div className="p-5 pb-3"><CardTitle icon={Film} title="Acquisition filmstrip" sub="Real Sentinel-2 quick-looks in order · colour bar = trust · click to analyse" /></div>
        <div className="scrollbar-thin flex gap-3 overflow-x-auto px-5 pb-5">
          {d.points.map((p, i) => (
            <motion.button key={p.scene_id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i * 0.015, 0.5) }}
              onMouseEnter={() => setHover(p.scene_id)} onMouseLeave={() => setHover(null)} onClick={() => open(p.scene_id)}
              className="group w-[118px] shrink-0 overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:-translate-y-1 hover:shadow-lift">
              <div className="relative h-[100px]">
                <img src={layerUrl(p.scene_id, 'original')} loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute right-1 top-1 rounded-md bg-surface/90 px-1.5 font-mono text-[11px] font-bold" style={{ color: statusColor(p.status) }}>{p.trust.toFixed(0)}</span>
                {p.false_confidence && <span className="absolute left-1 top-1 rounded bg-warn px-1 text-[8px] font-bold text-white">FC</span>}
              </div>
              <div className="h-1" style={{ background: scoreColor(p.trust) }} />
              <div className="px-2 py-1.5 font-mono text-[10px] text-ink-2">{p.date.slice(2)}</div>
            </motion.button>
          ))}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardTitle icon={CalendarDays} title="Decision calendar" sub="Each square is one acquisition · hover for details" />
          <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-2">
            {d.monthly.map((m) => {
              const ps = d.points.filter((p) => p.date.startsWith(m.month))
              const isMon = ['06', '07', '08', '09'].includes(m.month.slice(5))
              return (
                <div key={m.month} className={clsx('rounded-xl p-1.5 text-center', isMon && 'bg-[#EEF0FF]')}>
                  <div className="font-mono text-[10px] font-semibold text-ink-2">{MONTHS[+m.month.slice(5) - 1]}</div>
                  <div className="font-mono text-[9px] text-ink-3">{m.month.slice(2, 4)}</div>
                  <div className="mt-1.5 flex flex-col items-center gap-1">
                    {ps.map((p) => (
                      <button key={p.scene_id} title={`${p.date} · ${p.trust.toFixed(0)} · ${p.status}`} onClick={() => open(p.scene_id)}
                        onMouseEnter={() => setHover(p.scene_id)} onMouseLeave={() => setHover(null)}
                        className={clsx('h-5 w-full rounded-md transition hover:scale-110', hover === p.scene_id && 'ring-2 ring-ink')} style={{ background: statusColor(p.status) }} />
                    ))}
                  </div>
                  <div className="num mt-1.5 text-[11px] font-bold" style={{ color: scoreColor(m.trust) }}>{m.trust.toFixed(0)}</div>
                </div>
              )
            })}
          </div>
          {d.forecast.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {d.forecast.map((f) => (
                <div key={f.month} className="flex-1 rounded-xl border border-dashed border-sky/50 bg-skytint/50 px-3 py-2 text-xs">
                  <div className="label text-[9px] text-sky">Forecast · {f.month}</div>
                  <div className="num text-xl font-bold" style={{ color: scoreColor(f.trust) }}>{f.trust.toFixed(0)}</div>
                  <div className="text-ink-3">{f.basis}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardTitle icon={CloudRain} title="Seasons compared" sub="Average trust and pass rate per season" />
          <div className="space-y-4">
            {stats.seasons.map((s) => (
              <div key={s.id}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold"><s.icon size={15} style={{ color: s.color }} />{s.name}<span className="font-mono text-[10px] text-ink-3">{s.n} scenes</span></span>
                  <span className="num font-bold" style={{ color: scoreColor(s.avg) }}>{s.avg.toFixed(1)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2"><motion.div className="h-full rounded-full" style={{ background: s.color }} initial={{ width: 0 }} animate={{ width: `${s.avg}%` }} transition={{ duration: 0.9 }} /></div>
                <div className="mt-1 text-[11px] text-ink-3">{Math.round(s.passRate * 100)}% passed the gate</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle icon={TrendingDown} title="Why trust dropped" sub="The main reason behind every acquisition that did not pass" />
        <div className="grid gap-2 md:grid-cols-2">
          {d.points.filter((p) => p.status !== 'PASS' || p.false_confidence).map((p) => (
            <button key={p.scene_id} onClick={() => open(p.scene_id)} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-left transition hover:border-teal/40 hover:bg-mint/30">
              <img src={layerUrl(p.scene_id, 'original')} loading="lazy" className="h-11 w-11 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[11px] text-ink-2">{p.date}<StatusBadge status={p.status} size="sm" />{p.false_confidence && <span className="chip bg-warn text-[9px] text-white">FALSE CONF.</span>}</div>
                <div className="mt-0.5 truncate text-[12.5px]">{p.cause}</div>
              </div>
              <span className="num font-semibold" style={{ color: statusColor(p.status) }}>{p.trust.toFixed(0)}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
