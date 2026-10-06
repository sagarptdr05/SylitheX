import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, BadgeCheck, Bell, Brain, Check, ChevronDown, ChevronsLeft, ChevronsRight, Copy, Cpu, FileText, FlaskConical, Gauge, GitBranch,
  Globe2, KeyRound, Layers, LineChart, Loader2, LogOut, MapPin, MoreHorizontal, Plus, Radar, Rocket, Satellite, ScanSearch, Search,
  Sparkles, Trees, TriangleAlert, UserCheck, X, type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { layerUrl, useApi } from '../lib/api'
import { fmtDate, scoreColor } from '../lib/format'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { copyText, useToast } from '../lib/toast'
import type { ProfileId } from '../lib/types'
import Logo from './Logo'
import { StatusBadge } from './ui'
import CommandPalette from './CommandPalette'
import ErrorBoundary from './ErrorBoundary'
import EarthHorizon from './EarthHorizon'

export interface NavItem { to: string; label: string; icon: LucideIcon; hint: string; badge?: string }

/** Primary navigation follows the data story: observe → inspect → trust → trace → analyse → decide. */
export const PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: Globe2, hint: 'Can this data be trusted right now?' },
  { to: '/sources', label: 'Data Sources', icon: Satellite, hint: 'Satellites, acquisitions and the dataset inspector' },
  { to: '/quality', label: 'Data Quality', icon: Gauge, hint: 'Every quality issue: what, why, where, when' },
  { to: '/anomalies', label: 'Anomalies', icon: Radar, hint: 'Drift, outliers, suspicious changes, integrity' },
  { to: '/provenance', label: 'Provenance', icon: GitBranch, hint: 'Trace a result back to its satellite source' },
  { to: '/analytics', label: 'EO Analytics', icon: Layers, hint: 'Map layers, time series, comparison' },
  { to: '/carbon', label: 'Carbon MRV', icon: Trees, hint: 'Trusted data → land cover → biomass → carbon' },
  { to: '/lab', label: 'Simulation', icon: FlaskConical, hint: 'Data Integrity Lab: inject bad data live', badge: 'LIVE' },
  { to: '/reports', label: 'Reports', icon: FileText, hint: 'Trust Passports, timeline, exports' },
]
export const SECONDARY: NavItem[] = [
  { to: '/intelligence', label: 'Trust Intelligence', icon: Sparkles, hint: 'Fit-for-purpose, silent failure, data debt' },
  { to: '/scene', label: 'Scene Analysis', icon: ScanSearch, hint: 'Full analysis of the active scene' },
  { to: '/explain', label: 'Explainability', icon: Brain, hint: 'Waterfall, SHAP, gate rules' },
  { to: '/fusion', label: 'Sensor Fusion', icon: Activity, hint: 'Sentinel-1 / Sentinel-2 cross-check' },
  { to: '/models', label: 'Models', icon: Cpu, hint: 'Model registry and metrics' },
  { to: '/timeline', label: 'Trust Timeline', icon: LineChart, hint: '12-month trust history' },
  { to: '/passport', label: 'Trust Passport', icon: BadgeCheck, hint: 'Verifiable certificate' },
  { to: '/review', label: 'Human Review', icon: UserCheck, hint: 'WARNING scenes awaiting a decision' },
  { to: '/locations', label: 'Locations', icon: MapPin, hint: 'Add or switch monitored areas' },
  { to: '/roadmap', label: 'Roadmap', icon: Rocket, hint: 'What comes next' },
]
const MOBILE = ['/dashboard', '/quality', '/anomalies', '/lab']
export const ALL_NAV = [...PRIMARY, ...SECONDARY]

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open, close])
  return ref
}

const menu = 'absolute top-full z-50 mt-2 rounded-2xl border border-line-2 bg-surface p-2 shadow-lift'

function ProjectSwitcher() {
  const { aois, aoi, setAoi, activeAoi } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  const nav = useNavigate()
  return (
    <div className="relative min-w-0 flex-1 md:flex-none" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Project: ${activeAoi?.name ?? aoi}. Switch project`}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-surface-2 sm:px-2">
        <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary sm:grid"><MapPin size={15} /></span>
        <div className="min-w-0 flex-1">
          <div className="label text-[9px]">Project</div>
          <div className="truncate text-sm font-semibold md:max-w-[240px]">{activeAoi?.name ?? aoi}</div>
        </div>
        <ChevronDown size={15} className="shrink-0 text-ink-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="listbox" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className={clsx(menu, 'left-0 w-[min(380px,calc(100vw-24px))]')}>
            <div className="label px-2 py-1.5">Monitored locations</div>
            {aois.map((a) => {
              const ready = a.status.state === 'ready'
              return (
                <button key={a.id} role="option" aria-selected={a.id === aoi} disabled={!ready} onClick={() => { setAoi(a.id); setOpen(false) }}
                  className={clsx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition', a.id === aoi ? 'bg-primary/12 bg-mint' : 'hover:bg-surface-2', !ready && 'cursor-not-allowed opacity-70')}>
                  {ready ? <img src={layerUrl('DEMO-HEALTHY', 'original', a.id)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    : <span className="grid h-10 w-10 place-items-center rounded-lg bg-skytint text-sky"><Loader2 size={16} className="animate-spin" /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{a.name}</div>
                    <div className="truncate text-[11px] text-ink-3">{ready ? `${a.region} · ${a.n_s2 ?? 0} acquisitions` : `${a.status.state} · ${Math.round(a.status.progress * 100)}%`}</div>
                  </div>
                  {ready && a.avg_trust != null && <span className="num text-xs font-semibold" style={{ color: scoreColor(a.avg_trust) }}>{a.avg_trust.toFixed(0)}</span>}
                  {a.id === aoi && <Check size={16} className="text-primary" />}
                </button>
              )
            })}
            <button onClick={() => { setOpen(false); nav('/locations') }} className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-mint">
              <Plus size={16} />Add a new location
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SceneSwitcher({ compact = false }: { compact?: boolean }) {
  const { scenes, sceneId, setSceneId } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  const demos = scenes.filter((s) => s.demo)
  const real = scenes.filter((s) => !s.demo)
  const cur = scenes.find((s) => s.scene_id === sceneId)
  return (
    <div className="relative min-w-0" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={clsx('flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left transition hover:border-primary/50', !compact && 'sm:min-w-[260px]')}>
        <Satellite size={15} className="shrink-0 text-sky" />
        <div className="min-w-0 flex-1">
          <div className="label text-[9px]">Dataset</div>
          <div className="truncate text-[13px] font-semibold">{cur ? cur.title : sceneId}</div>
        </div>
        {cur && <StatusBadge status={cur.status} size="sm" />}
        <ChevronDown size={15} className="shrink-0 text-ink-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="listbox" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className={clsx(menu, 'scrollbar-thin left-0 max-h-[70vh] w-[min(440px,calc(100vw-24px))] overflow-y-auto')}>
            <div className="label px-2 py-1.5">Demo scenarios</div>
            {demos.map((s) => (
              <button key={s.scene_id} role="option" aria-selected={s.scene_id === sceneId} onClick={() => { setSceneId(s.scene_id); setOpen(false) }}
                className={clsx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2', s.scene_id === sceneId && 'bg-mint')}>
                <img src={layerUrl(s.scene_id, 'original')} alt="" className="h-9 w-9 rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{s.title}</div><div className="font-mono text-[10px] text-ink-3">{fmtDate(s.base_date)}{s.synthetic && ' · synthetic faults'}</div></div>
                <span className="num text-sm font-semibold" style={{ color: scoreColor(s.trust_score) }}>{s.trust_score.toFixed(0)}</span>
                <StatusBadge status={s.status} size="sm" />
              </button>
            ))}
            <div className="label px-2 pb-1.5 pt-3">Real Sentinel-2 acquisitions</div>
            {real.map((s) => (
              <button key={s.scene_id} role="option" aria-selected={s.scene_id === sceneId} onClick={() => { setSceneId(s.scene_id); setOpen(false) }}
                className={clsx('flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left hover:bg-surface-2', s.scene_id === sceneId && 'bg-mint')}>
                <span className="w-24 font-mono text-xs text-ink-2">{fmtDate(s.date)}</span>
                <span className="flex-1 font-mono text-[11px] text-ink-3">cloud {s.cloud_pct.toFixed(0)}%</span>
                <span className="num text-sm font-semibold" style={{ color: scoreColor(s.trust_score) }}>{s.trust_score.toFixed(0)}</span>
                <StatusBadge status={s.status} size="sm" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** DATA HEALTH = mean Trust Score of the 10 most recent real acquisitions of the project (not demos). */
function useHealth() {
  const { scenes } = useStore()
  return useMemo(() => {
    const real = scenes.filter((s) => !s.demo).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10)
    if (!real.length) return null
    const v = real.reduce((a, s) => a + s.trust_score, 0) / real.length
    return { v, n: real.length, blocked: real.filter((s) => s.status === 'BLOCKED').length, last: real[0].date }
  }, [scenes])
}

function HealthPill() {
  const h = useHealth()
  const api = useApi<{ status: string }>('/api/health')
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  if (!h) return null
  const label = h.v >= 80 ? 'Excellent' : h.v >= 65 ? 'Good' : h.v >= 50 ? 'Degraded' : 'Poor'
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 transition hover:border-primary/50 sm:px-3" aria-label={`Data system health ${h.v.toFixed(0)} percent`}>
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: scoreColor(h.v) }} /><span className="relative h-2.5 w-2.5 rounded-full" style={{ background: scoreColor(h.v) }} /></span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 md:inline">Data health</span>
        <span className="num text-sm font-bold" style={{ color: scoreColor(h.v) }}>{h.v.toFixed(0)}%</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={clsx(menu, 'right-0 w-[300px] p-4')}>
            <div className="label">Data system health</div>
            <div className="mt-1 flex items-baseline gap-2"><span className="num text-3xl font-bold" style={{ color: scoreColor(h.v) }}>{h.v.toFixed(0)}%</span><span className="text-sm text-ink-2">{label}</span></div>
            <p className="mt-2 text-xs text-ink-2">Mean Trust Score of the {h.n} most recent real acquisitions (latest {fmtDate(h.last)}). {h.blocked} of them were blocked at the gate.</p>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-ink-3">Trust Gate API</span><span className={api.data ? 'text-pass' : 'text-block'}>{api.data ? '● online' : '● offline'}</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Pipeline</span><span className="text-pass">● 9 stages active</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Sources</span><span className="text-ink-2">Sentinel-2 L2A · Sentinel-1 RTC</span></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface Alert { id: number; scene_id: string; status: string; trust_score: number; created_at: string; delivered: string }
function Notifications() {
  const loc = useLocation()
  const { activeAoi } = useStore()
  const building = activeAoi && activeAoi.status.state !== 'ready'
  const queue = useApi<{ scene_id: string; title: string; trust_score: number; decision: unknown }[]>(building ? null : '/api/review/queue', [loc.pathname])
  const alerts = useApi<Alert[]>(building ? null : '/api/alerts', [loc.pathname])
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  const nav = useNavigate()
  const pending = queue.data?.filter((q) => !q.decision) ?? []
  const n = pending.length
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${n} pending reviews`} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2 transition hover:border-primary/50 hover:text-ink">
        <Bell size={17} />
        {n > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-warn px-1 font-mono text-[10px] font-bold text-bg">{n}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={clsx(menu, 'right-0 w-[min(340px,calc(100vw-24px))]')}>
            <div className="label px-2 py-1.5">Awaiting human review</div>
            {pending.length === 0 && <div className="px-2 pb-2 text-xs text-ink-3">Nothing waiting. Every WARNING scene has a decision.</div>}
            {pending.slice(0, 4).map((q) => (
              <button key={q.scene_id} onClick={() => { setOpen(false); nav('/review') }} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                <TriangleAlert size={15} className="text-warn" /><span className="min-w-0 flex-1 truncate text-sm">{q.title}</span><span className="num text-xs text-ink-2">{q.trust_score.toFixed(0)}</span>
              </button>
            ))}
            <div className="label px-2 pb-1.5 pt-3">Gate alerts (BLOCKED)</div>
            {(alerts.data ?? []).slice(0, 3).map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs"><span className="h-2 w-2 rounded-full bg-block" /><span className="min-w-0 flex-1 truncate font-mono">{a.scene_id}</span><span className="text-ink-3">{a.created_at?.slice(5, 16)}</span></div>
            ))}
            {!alerts.data?.length && <div className="px-2 pb-2 text-xs text-ink-3">No alerts fired yet.</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  const nav = useNavigate()
  const toast = useToast()
  if (!user) return null
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-2 p-1 transition sm:pr-2 hover:border-primary/50">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-cyan font-display text-xs font-bold text-white">{initials}</span>
        <ChevronDown size={14} className="hidden text-ink-3 sm:block" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={clsx(menu, 'right-0 w-[min(320px,calc(100vw-24px))] p-3')}>
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-cyan font-display text-sm font-bold text-white">{initials}</span>
              <div className="min-w-0"><div className="truncate font-semibold">{user.name}</div><div className="truncate text-xs text-ink-3">{user.email}</div></div>
            </div>
            <div className="mt-3">
              <div className="label mb-1 flex items-center gap-1 text-[10px]"><KeyRound size={11} />Personal API key</div>
              <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 font-mono text-[11px]">
                <span className="flex-1 truncate">{user.api_key.slice(0, 14)}••••••••</span>
                <button aria-label="Copy API key" onClick={() => copyText(user.api_key, toast, 'API key copied')} className="text-ink-2 hover:text-primary"><Copy size={13} /></button>
              </div>
              <div className="mt-1 text-[10.5px] text-ink-3">Send as <code>X-API-Key</code>; scoped to your locations.</div>
            </div>
            <button onClick={() => { setOpen(false); nav('/locations') }} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-2"><MapPin size={15} />My locations</button>
            <button onClick={async () => { await logout(); nav('/login') }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-block hover:bg-block-bg"><LogOut size={15} />Sign out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SideLink({ it, rail }: { it: NavItem; rail: boolean }) {
  return (
    <NavLink to={it.to} title={rail ? `${it.label}: ${it.hint}` : it.hint} className={({ isActive }) => clsx(
      'group relative mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors',
      rail && 'justify-center px-0',
      isActive ? 'bg-mint text-primary' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
      {({ isActive }) => (<>
        {isActive && <motion.span layoutId="navbar" className="absolute left-0 top-2 h-[calc(100%-16px)] w-[3px] rounded-r-full bg-primary shadow-[0_0_12px_rgb(var(--primary))]" />}
        <it.icon size={18} strokeWidth={isActive ? 2.3 : 1.9} className={isActive ? 'text-primary' : ''} />
        {!rail && <span className="flex-1 truncate">{it.label}</span>}
        {!rail && it.badge && <span className="rounded-md bg-block/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">{it.badge}</span>}
      </>)}
    </NavLink>
  )
}

function MoreSheet({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[1900] bg-black/60 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-label="All sections" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="scrollbar-thin fixed inset-x-0 bottom-0 z-[2000] max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-line-2 bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 lg:hidden">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-2" />
            <div className="mb-2 flex items-center justify-between"><Logo size={28} /><button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2"><X size={18} /></button></div>
            <button onClick={() => { onClose(); onSearch() }} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-3 text-sm text-ink-3"><Search size={16} />Search sections, datasets, projects…</button>
            {[['Platform', PRIMARY], ['Tools & records', SECONDARY]].map(([g, items]) => (
              <div key={g as string} className="mt-3">
                <div className="label mb-2 px-1">{g as string}</div>
                <div className="grid grid-cols-3 gap-2">
                  {(items as NavItem[]).map((it) => (
                    <NavLink key={it.to} to={it.to} onClick={onClose} className={({ isActive }) => clsx('flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 py-3 text-center text-[11.5px] font-medium',
                      isActive ? 'border-primary/60 bg-mint text-strong' : 'border-line bg-surface-2 text-ink-2')}>
                      <it.icon size={20} className="text-primary" />{it.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const items = MOBILE.map((to) => PRIMARY.find((p) => p.to === to)!)
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-[1500] border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden print:hidden">
      <div className="grid grid-cols-5">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={({ isActive }) => clsx('relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium', isActive ? 'text-strong' : 'text-ink-3')}>
            {({ isActive }) => (<>
              {isActive && <motion.span layoutId="bnav" className="absolute top-0 h-[2px] w-10 rounded-full bg-primary shadow-[0_0_10px_rgb(var(--primary))]" />}
              <it.icon size={20} className={isActive ? 'text-primary' : ''} />{it.label === 'Simulation' ? 'Lab' : it.label.replace('Data ', '')}
            </>)}
          </NavLink>
        ))}
        <button onClick={onMore} className="flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-ink-3"><MoreHorizontal size={20} />More</button>
      </div>
    </nav>
  )
}

function AppFooter() {
  return (
    <footer className="border-t border-line px-3 pb-24 pt-6 text-xs text-ink-3 sm:px-4 md:px-6 lg:pb-4 print:hidden">
      <div className="mx-auto mb-4 max-w-[1480px]"><EarthHorizon /></div>
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Logo size={20} withText={false} /><span>© 2026 TerraTrust AI · Trust layer for Earth-observation data</span></div>
        <div className="flex flex-wrap items-center gap-4">
          <span>Contains modified Copernicus Sentinel data 2025–2026</span>
          <a href="/docs" target="_blank" rel="noreferrer" className="hover:text-primary">API docs</a>
          <Link to="/models" className="hover:text-primary">Models</Link>
          <span className="font-mono">v2.0</span>
        </div>
      </div>
    </footer>
  )
}

const NO_SCENE = ['/locations', '/roadmap', '/models', '/carbon', '/anomalies', '/reports', '/timeline', '/review', '/dashboard', '/lab']

export default function Layout() {
  const { profile, setProfile, profiles, apiError, activeAoi } = useStore()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const [pal, setPal] = useState(false)
  const [rail, setRail] = useState(() => { try { return localStorage.getItem('tt.rail') === '1' } catch { return false } })
  useEffect(() => { setMore(false) }, [loc.pathname])
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setPal(true) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const toggleRail = () => setRail((r) => { try { localStorage.setItem('tt.rail', r ? '0' : '1') } catch { /* ignore */ } return !r })
  const building = activeAoi && activeAoi.status.state !== 'ready'
  const showScene = !building && !NO_SCENE.includes(loc.pathname)
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[5000] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <aside aria-label="Main navigation" className={clsx('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-bg/70 backdrop-blur-xl transition-[width] duration-300 lg:flex print:!hidden', rail ? 'w-[76px]' : 'w-[244px]')}>
        <NavLink to="/" className={clsx('pb-4 pt-5', rail ? 'px-[21px]' : 'px-5')} aria-label="TerraTrust home"><Logo withText={!rail} /></NavLink>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
          {!rail && <div className="label mb-1.5 px-3 text-[10px]">Platform</div>}
          {PRIMARY.map((it) => <SideLink key={it.to} it={it} rail={rail} />)}
          <div className={clsx('my-3 h-px bg-line', rail && 'mx-2')} />
          {!rail && <div className="label mb-1.5 px-3 text-[10px]">Tools & records</div>}
          {SECONDARY.map((it) => <SideLink key={it.to} it={it} rail={rail} />)}
        </div>
        <div className="border-t border-line p-3">
          {!rail && (
            <button onClick={() => setPal(true)} className="mb-2 flex w-full items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3 hover:border-primary/50">
              <Search size={14} />Search & jump<kbd className="ml-auto rounded border border-line-2 px-1.5 font-mono text-[10px]">⌘K</kbd>
            </button>
          )}
          <button onClick={toggleRail} aria-label={rail ? 'Expand navigation' : 'Collapse navigation'} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink">
            {rail ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} />Collapse</>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[1000] border-b border-line bg-bg/80 backdrop-blur-xl print:hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 md:px-6">
            <NavLink to="/" className="lg:hidden" aria-label="TerraTrust home"><Logo size={30} withText={false} /></NavLink>
            <ProjectSwitcher />
            {showScene && <div className="hidden md:block"><SceneSwitcher /></div>}
            <div className="hidden flex-1 md:block" />
            <select aria-label="Downstream use case" value={profile} onChange={(e) => setProfile(e.target.value as ProfileId)}
              className="hidden rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-medium outline-none hover:border-primary/50 2xl:block">
              {profiles.map((p) => <option key={p.id} value={p.id}>Use case: {p.name}</option>)}
            </select>
            <button onClick={() => setPal(true)} aria-label="Search" className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2 hover:border-primary/50 sm:grid lg:hidden"><Search size={17} /></button>
            {!building && <HealthPill />}
            {!building && <Notifications />}
            <UserMenu />
          </div>
          {showScene && <div className="border-t border-line px-3 py-2 md:hidden"><SceneSwitcher compact /></div>}
          {apiError && <div role="alert" className="bg-block-bg px-6 py-1.5 text-xs text-block">Backend not reachable. Start it with <code className="font-mono">./run.sh</code></div>}
        </header>
        <main id="main" className="relative flex-1 px-3 py-5 sm:px-4 md:px-6 md:py-6">
          {building && !['/locations', '/roadmap', '/models'].includes(loc.pathname) ? (
            <div className="relative mx-auto mt-16 max-w-xl rounded-3xl border border-sky/30 bg-surface p-8 text-center shadow-lift">
              <Loader2 className="mx-auto animate-spin text-sky" size={34} />
              <h2 className="mt-3 text-xl font-bold">Processing satellite data for {activeAoi!.name}</h2>
              <p className="mt-1 text-sm text-ink-2">{activeAoi!.status.step || 'Queued'}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan transition-all" style={{ width: `${activeAoi!.status.progress * 100}%` }} /></div>
              <Link to="/locations" className="btn-ghost mx-auto mt-5">Go to Locations</Link>
            </div>
          ) : (
            <motion.div key={loc.pathname} initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="relative mx-auto max-w-[1480px]">
              <ErrorBoundary resetKey={loc.pathname}><Suspense fallback={<div className="skeleton h-[60vh]" />}><Outlet /></Suspense></ErrorBoundary>
            </motion.div>
          )}
        </main>
        <AppFooter />
      </div>
      <BottomNav onMore={() => setMore(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} onSearch={() => setPal(true)} />
      <CommandPalette open={pal} onClose={() => setPal(false)} />
    </div>
  )
}
