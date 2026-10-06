import { BadgeCheck, Bell, Cpu, Download, FileJson, FileText, LineChart, Printer, ShieldCheck, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle, PageHeader, Skeleton, StatusBadge } from '../components/ui'
import { API, get, getApiAoi, useApi } from '../lib/api'
import { fmtDate, scoreColor, sevColor } from '../lib/format'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import type { AnomalyFeed } from '../lib/types'

interface Dash { total: number; pass: number; warning: number; blocked: number; avg_trust: number; false_confidence: number; alerts: number; reviews: number; recent_checks: { scene_id: string; status: string; trust: number; created_at: string; profile: string }[] }
interface Alert { id: number; aoi: string; scene_id: string; status: string; target: string; created_at: string }

export default function Reports() {
  const { scene, sceneId, scenes, activeAoi, aoi } = useStore()
  const dash = useApi<Dash>('/api/dashboard')
  const an = useApi<AnomalyFeed>('/api/anomalies')
  const alerts = useApi<Alert[]>('/api/alerts')
  const queue = useApi<{ decision: unknown }[]>('/api/review/queue')
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const pending = queue.data?.filter((q) => !q.decision).length ?? 0
  const d = dash.data
  const real = scenes.filter((s) => !s.demo)

  const exportJson = async () => {
    setBusy(true)
    try {
      const [dashboard, timeline, anomalies, carbon] = await Promise.all([get('/api/dashboard', true), get('/api/timeline'), get('/api/anomalies'), get('/api/carbon/location').catch(() => null)])
      const blob = new Blob([JSON.stringify({ generated_at: new Date().toISOString(), project: activeAoi?.name, aoi, dashboard, timeline, anomalies, carbon }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `terratrust_${aoi}_project_report.json`; a.click(); URL.revokeObjectURL(url)
      toast('Project report exported')
    } catch { toast('Export failed', 'warn') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader crumbs={['Platform', 'Reports']} kicker="Reports" st="10" title="Reports & certificates"
        sub="Everything a verifier needs: a signed Trust Passport per dataset, a project-level trust report, the 12-month history, human decisions and the alert log."
        right={<div className="flex flex-wrap gap-2 print:hidden"><button onClick={() => window.print()} className="btn-ghost"><Printer size={15} />Print / PDF</button><button onClick={exportJson} disabled={busy} className="btn-primary"><FileJson size={15} />{busy ? 'Exporting…' : 'Export project report'}</button></div>} />

      {/* project report (also the printable page) */}
      <Card>
        <CardTitle icon={FileText} title={`Project trust report · ${activeAoi?.name ?? ''}`} sub={`Generated ${new Date().toLocaleString('en-GB')} · ${activeAoi?.region ?? ''}`} />
        {!d ? <Skeleton className="h-32" /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[['Datasets verified', d.total], ['Released (PASS)', d.pass], ['Human review', d.warning], ['Blocked', d.blocked], ['Mean trust', d.avg_trust.toFixed(1)], ['False confidence caught', d.false_confidence]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-line bg-surface-2/60 p-3"><div className="text-[11px] text-ink-3">{k}</div><div className="num mt-1 text-2xl font-bold text-strong">{v}</div></div>
            ))}
          </div>
        )}
        {an.data && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-ink-3">Findings:</span>
            {Object.entries(an.data.by_severity).filter(([, n]) => n).map(([k, n]) => <span key={k} className="chip border" style={{ borderColor: sevColor(k) + '66', color: sevColor(k) }}>{n} {k}</span>)}
            <span className="text-ink-3">· {real.length} real acquisitions · {scenes.length - real.length} demo scenarios</span>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardTitle icon={BadgeCheck} title="Trust Passport" sub="Signed certificate for the selected dataset" />
          {scene ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3"><span className="num text-3xl font-bold" style={{ color: scoreColor(scene.trust_score) }}>{scene.trust_score.toFixed(0)}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{scene.info.title}</div><div className="font-mono text-[11px] text-ink-3">{fmtDate(scene.date)}</div></div><StatusBadge status={scene.status} size="sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <Link to="/passport" className="btn-primary justify-center text-xs"><ShieldCheck size={14} />Open passport</Link>
                <a href={`${API}/api/passport/${sceneId}?aoi=${getApiAoi()}`} target="_blank" rel="noreferrer" className="btn-ghost justify-center text-xs"><FileJson size={14} />JSON</a>
                <a href={`${API}/api/passport/${sceneId}?aoi=${getApiAoi()}&format=csv`} className="btn-ghost col-span-2 justify-center text-xs"><Download size={14} />Per-tile quality report (CSV)</a>
              </div>
            </div>
          ) : <Skeleton className="h-32" />}
        </Card>
        <Card>
          <CardTitle icon={LineChart} title="Trust timeline" sub="12 months of decisions" />
          <p className="text-[12.5px] text-ink-2">Monthly trust, gate decisions, seasonal forecast and the cause of every drop.</p>
          <Link to="/timeline" className="btn-ghost mt-3 w-full justify-center text-xs">Open timeline</Link>
          <div className="mt-4 border-t border-line pt-4"><CardTitle icon={UserCheck} title="Human review" sub={pending ? `${pending} decisions pending` : 'Queue is empty'} /><Link to="/review" className="btn-ghost w-full justify-center text-xs">Open review queue</Link></div>
        </Card>
        <Card>
          <CardTitle icon={Bell} title="Gate alert log" sub="Webhook alerts fired on BLOCKED" />
          {!alerts.data ? <Skeleton className="h-32" /> : alerts.data.filter((a) => a.aoi === aoi).length === 0 ? <p className="text-[12.5px] text-ink-3">No alerts fired for this project yet. Alerts fire when a scene is checked through the Trust Gate API and blocked.</p> : (
            <ul className="scrollbar-thin max-h-56 space-y-1.5 overflow-y-auto">
              {alerts.data.filter((a) => a.aoi === aoi).slice(0, 12).map((a) => <li key={a.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px]"><span className="h-2 w-2 rounded-full bg-block" /><span className="min-w-0 flex-1 truncate font-mono">{a.scene_id}</span><span className="text-ink-3">{a.created_at.slice(0, 16).replace('T', ' ')}</span></li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle icon={Cpu} title="Recent Trust Gate checks" sub="Machine-to-machine calls (POST /api/check) for this project" right={<Link to="/models" className="text-xs font-semibold text-primary">Model registry</Link>} />
        {!d ? <Skeleton className="h-24" /> : d.recent_checks.length === 0 ? <p className="text-[12.5px] text-ink-3">No API checks yet. Call the Trust Gate with your personal API key (user menu → API key).</p> : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]"><thead className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3"><tr><th className="py-2 text-left">Dataset</th><th className="text-left">Use case</th><th className="text-left">Trust</th><th className="text-left">Decision</th><th className="text-left">At</th></tr></thead>
              <tbody>{d.recent_checks.map((c, i) => <tr key={i} className="border-t border-line"><td className="py-2 font-mono">{c.scene_id}</td><td className="text-ink-2">{c.profile}</td><td className="num font-bold" style={{ color: scoreColor(c.trust) }}>{c.trust.toFixed(0)}</td><td><StatusBadge status={c.status} size="sm" /></td><td className="font-mono text-ink-3">{c.created_at.slice(0, 16).replace('T', ' ')}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[11.5px] text-ink-3">Carbon figures in exports are indicative (IPCC Tier-1 style, Sentinel-2 only) and are not a certified MRV claim.</p>
    </div>
  )
}
