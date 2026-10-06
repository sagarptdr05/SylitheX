import type { Status } from './types'

export const statusColor = (s: Status | string) =>
  s === 'PASS' || s === 'GO' || s === 'ok' ? '#16A34A' : s === 'WARNING' || s === 'CONDITIONAL' || s === 'warn' ? '#D97706' : '#DC2626'
export const statusBg = (s: Status | string) =>
  s === 'PASS' || s === 'GO' || s === 'ok' ? 'rgba(22,163,74,0.10)' : s === 'WARNING' || s === 'CONDITIONAL' || s === 'warn' ? 'rgba(217,119,6,0.10)' : 'rgba(220,38,38,0.10)'
export const statusLabel = (s: Status | string) => (s === 'PASS' ? 'TRUSTED' : s === 'WARNING' ? 'REVIEW' : s === 'BLOCKED' ? 'BLOCKED' : s)
export const sevColor = (s: string) =>
  s === 'CRITICAL' ? '#DC2626' : s === 'HIGH' ? '#EA580C' : s === 'MEDIUM' ? '#D97706' : s === 'LOW' ? '#2563EB' : '#0891B2'
export const fmtInt = (n: number | null | undefined) => (n == null ? '–' : Math.round(n).toLocaleString('en-IN'))
export const fmtCompact = (n: number | null | undefined) =>
  n == null ? '–' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString('en-IN')

export function scoreColor(v: number) {
  // green -> yellow -> red trust gradient
  const stops: [number, [number, number, number]][] = [[0, [220, 38, 38]], [50, [234, 120, 10]], [80, [202, 160, 10]], [100, [22, 163, 74]]]
  const x = Math.max(0, Math.min(100, v))
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i]
      const t = (x - a) / (b - a)
      const c = ca.map((v0, j) => Math.round(v0 + (cb[j] - v0) * t))
      return `rgb(${c[0]},${c[1]},${c[2]})`
    }
  }
  return 'rgb(22,163,74)'
}

export const fmtDate = (d: string) => {
  const s = d.includes('-') ? d : `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
  return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const COMPONENT_LABELS: Record<string, string> = {
  completeness: 'Data Completeness', cloud: 'Cloud Quality', noise: 'Noise Quality', sensor_agreement: 'Multi-Sensor Agreement',
  temporal: 'Temporal Consistency', anomaly: 'Anomaly (inverted)', drift: 'Data Drift (inverted)', reconstruction: 'Reconstruction Reliability',
}
export const COMPONENTS = Object.keys(COMPONENT_LABELS)

/** First / last acquisition date inside the 2026 SW-monsoon (Jun–Sep) for categorical chart axes. */
export function monsoonRange(dates: string[]): [string, string] | null {
  const m = dates.filter((d) => d >= '2026-06-01' && d <= '2026-09-30')
  return m.length ? [m[0], m[m.length - 1]] : null
}
