import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, ChevronRight, Info, OctagonX, RefreshCw, SatelliteDish, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { scoreColor, statusBg, statusColor } from '../lib/format'
import type { Status } from '../lib/types'

export function Card({ children, className, pad = true, hover = false }: { children: ReactNode; className?: string; pad?: boolean; hover?: boolean }) {
  return (
    <div className={clsx('card', pad && 'card-pad', hover && 'transition-shadow hover:shadow-lift', className)}>{children}</div>
  )
}

export function CardTitle({ icon: Icon, title, sub, right }: { icon?: LucideIcon; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-mint text-primary ring-1 ring-primary/20">
            <Icon size={16} strokeWidth={2.2} />
          </div>
        )}
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {sub && <p className="mt-0.5 break-words text-xs text-ink-2 [overflow-wrap:anywhere]">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

const ICON: Record<string, LucideIcon> = { PASS: CheckCircle2, WARNING: AlertTriangle, BLOCKED: OctagonX }
export function StatusBadge({ status, size = 'md', pulse = false }: { status: Status | string; size?: 'sm' | 'md' | 'lg'; pulse?: boolean }) {
  const I = ICON[status] ?? AlertTriangle
  return (
    <span
      className={clsx('chip relative border', size === 'lg' && 'px-4 py-1.5 text-sm', size === 'sm' && 'px-2 py-0.5 text-[10px]')}
      style={{ background: statusBg(status), color: statusColor(status), borderColor: statusColor(status) + '55' }}
    >
      {pulse && <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full animate-blink" style={{ background: statusColor(status) }} />}
      <I size={size === 'lg' ? 16 : size === 'sm' ? 11 : 13} strokeWidth={2.5} />
      {status}
    </span>
  )
}

export function Stat({ label, value, unit, sub, icon: Icon, tone = 'teal' }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; icon?: LucideIcon; tone?: 'teal' | 'sky' | 'pass' | 'warn' | 'block' }) {
  const tones = { teal: 'bg-mint text-teal', sky: 'bg-skytint text-sky', pass: 'bg-pass-bg text-pass', warn: 'bg-warn-bg text-warn-ink', block: 'bg-block-bg text-block' }
  return (
    <Card className="relative overflow-hidden" hover>
      <div className="flex items-start justify-between">
        <div className="label">{label}</div>
        {Icon && <div className={clsx('grid h-8 w-8 place-items-center rounded-lg', tones[tone])}><Icon size={16} /></div>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="num text-3xl font-semibold text-strong">{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-2">{sub}</div>}
    </Card>
  )
}

export function Meter({ value, label, suffix = '', invertColor = false, max = 100 }: { value: number | null; label: string; suffix?: string; invertColor?: boolean; max?: number }) {
  const v = value ?? 0
  const pct = Math.max(0, Math.min(100, (v / max) * 100))
  const color = value === null ? '#CBD5E1' : scoreColor(invertColor ? 100 - pct : pct)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="num font-semibold text-ink">{value === null ? 'n/a' : `${v.toFixed(1)}${suffix}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      </div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />
}

export function PageHeader({ kicker, title, sub, right, st, crumbs }: { kicker: string; title: string; sub?: string; right?: ReactNode; st?: string; crumbs?: string[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
          {(crumbs ?? [kicker]).map((c, i, a) => (
            <span key={c} className="flex items-center gap-1"><span className={i === a.length - 1 ? 'text-primary' : ''}>{c}</span>{i < a.length - 1 && <ChevronRight size={11} />}</span>
          ))}
          {st && <span className="ml-2 rounded-md border border-sky/30 bg-skytint px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-sky">ST-03 · {st}</span>}
        </nav>
        <h1 className="mt-1.5 text-[26px] font-bold leading-tight text-strong sm:text-[30px]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/** Hover / focus explanation for a number or control ("what does this mean?"). */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  const [o, setO] = useState(false)
  return (
    <span className={clsx('relative inline-flex align-middle', className)}>
      <button type="button" aria-label={text} onMouseEnter={() => setO(true)} onMouseLeave={() => setO(false)} onFocus={() => setO(true)} onBlur={() => setO(false)}
        className="text-ink-3 transition hover:text-primary"><Info size={13} /></button>
      {o && <span role="tooltip" className="absolute bottom-full left-1/2 z-[60] mb-2 w-60 -translate-x-1/2 rounded-xl border border-line-2 bg-surface px-3 py-2 text-left text-[11.5px] font-normal normal-case leading-snug tracking-normal text-ink-2 shadow-lift">{text}</span>}
    </span>
  )
}

/** Professional empty / error / loading states with a next action. */
export function StateBox({ kind = 'empty', title, text, action, to, onAction }: { kind?: 'empty' | 'error' | 'loading'; title: string; text?: string; action?: string; to?: string; onAction?: () => void }) {
  const Ic = kind === 'error' ? AlertTriangle : kind === 'loading' ? RefreshCw : SatelliteDish
  return (
    <div className={clsx('grid place-items-center rounded-2xl border border-dashed px-6 py-10 text-center', kind === 'error' ? 'border-block/40 bg-block-bg' : 'border-line-2 bg-surface-2/40')}>
      <Ic size={26} className={clsx(kind === 'error' ? 'text-block' : 'text-sky', kind === 'loading' && 'animate-spin')} />
      <div className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.16em] text-ink">{title}</div>
      {text && <p className="mt-1.5 max-w-md text-sm text-ink-2">{text}</p>}
      {action && (to ? <Link to={to} className="btn-ghost mt-4">{action}</Link> : <button onClick={onAction} className="btn-ghost mt-4">{action}</button>)}
    </div>
  )
}

/** Small "how this was computed" label for simplified / prototype science. */
export function MethodNote({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 px-3 py-2 text-[11.5px] leading-snug text-ink-2"><Info size={13} className="mt-0.5 shrink-0 text-warn" /><div>{children}</div></div>
}

export function Pill({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'teal' | 'sky' | 'warn' | 'block' | 'pass' }) {
  const t = { gray: 'bg-surface-3 text-ink-2', teal: 'bg-mint text-teal', sky: 'bg-skytint text-sky', warn: 'bg-warn-bg text-warn-ink', block: 'bg-block-bg text-block', pass: 'bg-pass-bg text-pass' }
  return <span className={clsx('chip', t[tone])}>{children}</span>
}

export function LevelPill({ level }: { level: string }) {
  const tone = level === 'LOW' ? 'pass' : level === 'MEDIUM' ? 'warn' : level === 'HIGH' ? 'block' : 'gray'
  return <Pill tone={tone as 'pass'}>{level}</Pill>
}

export function Empty({ text }: { text: string }) {
  return <StateBox title="Nothing to show" text={text} />
}
