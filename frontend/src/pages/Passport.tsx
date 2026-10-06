import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck, CheckCircle2, ClipboardCopy, Cpu, FileJson, FileSpreadsheet, Fingerprint, Gavel, KeyRound, Layers, Loader2, MinusCircle,
  PlusCircle, Printer, Satellite, ShieldAlert, ShieldCheck, Terminal, UserCheck, XCircle,
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import TrustGauge from '../components/TrustGauge'
import { Card, CardTitle, PageHeader, Skeleton, StatusBadge } from '../components/ui'
import { API, get, layerUrl, post, useApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { COMPONENT_LABELS, fmtDate, scoreColor, statusColor } from '../lib/format'
import { useStore } from '../lib/store'
import type { Status } from '../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = Record<string, any>

function Seal({ status }: { status: string }) {
  const c = statusColor(status)
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 animate-orbitSlow">
      <defs><path id="sealpath" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" /></defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke={c} strokeWidth="2" strokeDasharray="3 3" />
      <circle cx="60" cy="60" r="36" fill={c} fillOpacity="0.14" stroke={c} strokeWidth="2" />
      <text fontFamily="JetBrains Mono" fontSize="9.5" fontWeight="700" fill={c} letterSpacing="2.4"><textPath href="#sealpath">TERRATRUST · VERIFIED DATA PASSPORT · ST-03 ·</textPath></text>
    </svg>
  )
}

export default function Passport() {
  const { sceneId, setSceneId, scenes, scene, profiles, aoi } = useStore()
  const API_KEY = useAuth().user?.api_key ?? ''
  const p = useApi<P>(`/api/passport/${sceneId}`)
  const [qr, setQr] = useState<string | null>(null)
  const [verify, setVerify] = useState<{ valid: boolean; message: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [live, setLive] = useState<P | null>(null)
  const [liveBusy, setLiveBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const d = p.data
  const verifyAbs = d ? `${window.location.origin}${d.verify_url}` : ''
  useEffect(() => { setVerify(null); setLive(null) }, [sceneId, aoi])
  useEffect(() => { if (d) QRCode.toDataURL(verifyAbs, { margin: 1, width: 220, color: { dark: '#0F172A', light: '#ffffff' } }).then(setQr) }, [d, verifyAbs])
  if (!scene || !d) return <Skeleton className="h-[800px]" />

  const download = () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${sceneId}_trust_passport.json`; a.click()
  }
  const doVerify = async () => {
    setChecking(true)
    try { setVerify(await get<{ valid: boolean; message: string }>(`/api/passport/${sceneId}/verify?checksum=${d.checksum_sha256}`, true)) } finally { setChecking(false) }
  }
  const runLive = async () => {
    setLiveBusy(true)
    try { setLive(await post<P>('/api/trust/check', { scene_id: sceneId, profile: scene.profile })) } catch (e) { setLive({ error: String(e) }) } finally { setLiveBusy(false) }
  }
  const curl = `curl -X POST ${window.location.origin}/api/trust/check \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${API_KEY ? API_KEY.slice(0, 10) + '…' : '<your key>'}" \\\n  -d '{"aoi":"${aoi}","scene_id":"${sceneId}","profile":"${scene.profile}"}'`
  const status = d.trust.status as Status
  const ml = scene.ml_evidence

  return (
    <div>
      <PageHeader kicker="Trust passport" st="5 + 6 · auditable decision" title="A verifiable certificate for every scene"
        sub="Scores, decision, reasons, lineage, sensors and model evidence, sealed with a SHA-256 checksum and a QR code that anyone can scan to verify the passport against the live analysis."
        right={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} className="max-w-[260px] rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium shadow-card">
              {scenes.map((s) => <option key={s.scene_id} value={s.scene_id}>{s.demo ? s.title : fmtDate(s.date)} · {s.status}</option>)}
            </select>
            <button onClick={download} className="btn-primary"><FileJson size={16} />JSON</button>
            <a href={`${API}/api/passport/${sceneId}?format=csv&aoi=${aoi}`} className="btn-ghost"><FileSpreadsheet size={16} />CSV</a>
            <button onClick={() => window.print()} className="btn-ghost"><Printer size={16} />PDF</button>
          </div>
        } />

      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-line bg-surface shadow-lift print:shadow-none">
        {/* header band */}
        <div className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#0E3358,#061325_70%)] px-8 py-7 text-white">
          <div className="absolute inset-0 grid-bg-dark" />
          <div className="absolute -right-8 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full opacity-25" style={{ background: `radial-gradient(circle, ${statusColor(status)}, transparent 70%)` }} />
          <div className="relative flex flex-wrap items-center gap-6">
            <Seal status={status} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-sky"><BadgeCheck size={14} />TerraTrust · Data Trust Passport · v{d.passport_version}</div>
              <div className="mt-2 font-display text-3xl font-bold">{d.title}</div>
              <div className="mt-1 font-mono text-xs text-sky/80">{d.scene_id} · {d.aoi}</div>
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
                <span className="rounded-lg bg-white/10 px-2.5 py-1">S2 {fmtDate(d.sensors.s2.date)} · T{d.sensors.s2.tile}</span>
                <span className="rounded-lg bg-white/10 px-2.5 py-1">S1 {d.sensors.s1 ? `${fmtDate(d.sensors.s1.date)} · Δ${d.sensors.s1.gap_days} d` : 'no overlap'}</span>
                <span className={clsx('rounded-lg px-2.5 py-1', d.synthetic_faults.length ? 'bg-warn/30 text-warn-bg' : 'bg-pass/25 text-pass-bg')}>{d.synthetic_faults.length ? 'synthetic faults' : 'real data'}</span>
              </div>
            </div>
            <motion.div initial={{ scale: 1.6, rotate: -18, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', damping: 12 }}
              className="rounded-2xl border-4 px-6 py-3 text-center font-display text-3xl font-extrabold tracking-wider" style={{ borderColor: statusColor(status), color: statusColor(status), background: 'rgba(255,255,255,0.06)' }}>
              {status}<div className="font-mono text-[10px] font-semibold tracking-[0.2em] opacity-80">{d.trust.decision.split(':')[0]}</div>
            </motion.div>
          </div>
        </div>

        <div className="grid gap-8 p-8 lg:grid-cols-[260px_1fr]">
          {/* left column */}
          <div className="space-y-5">
            <div className="flex justify-center"><TrustGauge score={d.trust.score} uncertainty={scene.trust_uncertainty} status={status} size={230} /></div>
            <div className="text-center font-mono text-xs text-ink-2">95 % interval [{d.trust.interval.join(' – ')}]</div>
            <div className="relative overflow-hidden rounded-2xl border border-line">
              <img src={layerUrl(sceneId, 'trustmap')} className="aspect-square w-full object-cover" />
              <span className="absolute left-2 top-2 rounded-md bg-space/75 px-2 py-0.5 font-mono text-[10px] text-sky">TRUST MAP</span>
            </div>
            <div className="rounded-2xl border border-line p-4 text-center">
              {qr ? <img src={qr} className="mx-auto h-40 w-40" /> : <div className="skeleton mx-auto h-40 w-40" />}
              <div className="mt-2 text-[11px] text-ink-3">Scan to verify this passport</div>
              <div className="mt-2 break-all font-mono text-[9.5px] text-ink-2"><Fingerprint size={11} className="mr-1 inline" />{d.checksum_sha256}</div>
              <button onClick={doVerify} disabled={checking} className="btn-ghost mt-3 w-full justify-center py-2 text-xs print:hidden">
                {checking ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}Verify authenticity
              </button>
              <AnimatePresence>
                {verify && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={clsx('mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-left text-xs', verify.valid ? 'bg-pass-bg text-pass' : 'bg-block-bg text-block')}>
                    {verify.valid ? <CheckCircle2 size={15} className="shrink-0" /> : <XCircle size={15} className="shrink-0" />}{verify.message}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* right column */}
          <div className="space-y-6">
            <div className="rounded-2xl border-2 p-5" style={{ borderColor: statusColor(status) + '55', background: statusColor(status) + '0D' }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: statusColor(status) }}><Gavel size={16} />Decision</div>
              <div className="mt-1 text-lg font-semibold text-ink">{d.trust.decision}</div>
              {d.gate_rules_triggered.length > 0 ? (
                <ul className="mt-2 space-y-1">{d.gate_rules_triggered.map((g: P) => <li key={g.rule} className="flex gap-2 text-sm"><ShieldAlert size={15} className="mt-0.5 shrink-0 text-block" />{g.message}<span className="font-mono text-[10px] text-ink-3">→ {g.action === 'BLOCK' ? 'BLOCKED' : 'max WARNING'}</span></li>)}</ul>
              ) : <div className="mt-1 flex items-center gap-1.5 text-sm text-pass"><CheckCircle2 size={14} />No hard gate rule triggered</div>}
              {d.false_confidence.detected && <div className="mt-2 rounded-lg bg-warn-bg px-3 py-1.5 text-sm text-warn-ink">⚠ False confidence: {d.false_confidence.triggers.join(', ')}</div>}
            </div>

            {d.fit_for_purpose && (
              <div>
                <div className="label mb-2">Suitable for</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(d.fit_for_purpose as Record<string, P>).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-2 rounded-xl border px-3 py-2" style={{ borderColor: v.status === 'GO' ? '#16A34A55' : v.status === 'CONDITIONAL' ? '#D9770666' : '#DC262655', background: v.status === 'GO' ? '#F0FDF4' : v.status === 'CONDITIONAL' ? '#FFFBEB' : '#FEF2F2' }}>
                      <span className="mt-0.5 text-base font-bold" style={{ color: v.status === 'GO' ? '#16A34A' : v.status === 'CONDITIONAL' ? '#D97706' : '#DC2626' }}>{v.status === 'GO' ? '✓' : v.status === 'CONDITIONAL' ? '⚠' : '✕'}</span>
                      <div className="min-w-0"><div className="text-[12.5px] font-semibold leading-tight">{v.name}</div><div className="text-[10.5px] text-ink-3">{v.status} · fitness {v.score}</div></div>
                    </div>
                  ))}
                </div>
                {d.silent_failure && <div className={clsx('mt-2 rounded-lg px-3 py-1.5 text-[12px]', d.silent_failure.level === 'LOW' ? 'bg-pass-bg/60 text-pass' : 'bg-warn-bg text-warn-ink')}>Silent-failure risk {d.silent_failure.level} ({d.silent_failure.risk}): {d.silent_failure.headline}</div>}
              </div>
            )}

            <div>
              <div className="label mb-3">Trust components</div>
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {Object.entries(d.components as Record<string, number | null>).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs"><span className="text-ink-2">{COMPONENT_LABELS[k]}</span><span className="num font-semibold">{v == null ? 'n/a' : v.toFixed(1)}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-surface-2"><motion.div className="h-full rounded-full" style={{ background: scoreColor(v ?? 0) }} initial={{ width: 0 }} animate={{ width: `${v ?? 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="label mb-2">AI readiness by use case</div>
                <div className="grid grid-cols-2 gap-2">
                  {profiles.map((pr) => <div key={pr.id} className="rounded-xl bg-surface-2 p-2.5"><div className="text-[10.5px] text-ink-2">{pr.name}</div><div className="num text-lg font-semibold" style={{ color: scoreColor(d.ai_readiness[pr.id]) }}>{d.ai_readiness[pr.id].toFixed(0)}</div></div>)}
                </div>
              </div>
              <div>
                <div className="label mb-2">Data quality</div>
                <div className="grid grid-cols-2 gap-2">
                  {[['Cloud', d.quality.cloud_pct], ['Shadow', d.quality.shadow_pct], ['Missing', d.quality.missing_pct], ['Reconstructed', d.quality.recon_pct]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-surface-2 p-2.5"><div className="text-[10.5px] text-ink-2">{k}</div><div className="num text-lg font-semibold">{(v as number).toFixed(1)}%</div></div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="label mb-3 flex items-center gap-1.5"><Layers size={12} />Lineage</div>
              <div className="flex items-stretch">
                {(d.lineage as P[]).map((l, i) => (
                  <div key={l.stage} className="relative flex-1">
                    <div className="mx-1 rounded-xl border border-line bg-surface-2 p-2.5 text-center">
                      <div className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-teal font-mono text-[11px] font-bold text-white">{i + 1}</div>
                      <div className="mt-1 text-[11px] font-semibold">{l.stage}</div>
                      <div className="num text-sm font-bold text-teal">{l.stage === 'Confidence' ? l.pct.toFixed(2) : l.stage === 'Final Trust' ? l.pct.toFixed(1) : `${l.pct.toFixed(1)}%`}</div>
                    </div>
                    {i < 5 && <div className="absolute -right-1 top-1/2 z-10 h-0.5 w-2 bg-teal" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="label mb-2 flex items-center gap-1.5 text-pass"><PlusCircle size={12} />Supports trust</div>
                <ul className="space-y-1.5">{scene.reasons_positive.map((r) => <li key={r} className="rounded-lg bg-pass-bg/50 px-3 py-1.5 text-[12.5px]">{r}</li>)}</ul>
              </div>
              <div>
                <div className="label mb-2 flex items-center gap-1.5 text-block"><MinusCircle size={12} />Reduces trust</div>
                <ul className="space-y-1.5">{scene.reasons_negative.length ? scene.reasons_negative.map((r) => <li key={r} className="rounded-lg bg-block-bg/50 px-3 py-1.5 text-[12.5px]">{r}</li>) : <li className="text-xs text-ink-3">nothing significant</li>}</ul>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {ml && (
                <div className="rounded-2xl border border-line p-4">
                  <div className="flex items-center justify-between"><div className="label flex items-center gap-1.5"><Cpu size={12} />ML evidence (XGBoost + SHAP)</div><span className="num font-bold text-sky">{ml.reliability.toFixed(0)}</span></div>
                  <div className="mt-2 space-y-1">
                    {[...ml.decreasing.slice(0, 3), ...ml.increasing.slice(0, 2)].map((x) => (
                      <div key={x.feature} className="flex justify-between text-xs"><span className="text-ink-2">{x.label}</span><span className={clsx('num font-semibold', x.shap < 0 ? 'text-block' : 'text-pass')}>{x.shap > 0 ? '+' : ''}{x.shap.toFixed(1)}</span></div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-line p-4">
                <div className="label flex items-center gap-1.5"><UserCheck size={12} />Human review</div>
                {d.reviews.length ? d.reviews.map((r: P, i: number) => (
                  <div key={i} className="mt-2 flex items-center justify-between text-xs"><span className={clsx('chip text-[10px]', r.decision === 'APPROVE' ? 'bg-pass-bg text-pass' : r.decision === 'REJECT' ? 'bg-block-bg text-block' : 'bg-skytint text-sky')}>{r.decision}</span><span className="text-ink-2">{r.reviewer} · {r.created_at.slice(0, 16).replace('T', ' ')}</span></div>
                )) : <div className="mt-2 text-xs text-ink-3">{status === 'WARNING' ? 'Pending: awaiting a reviewer in Human Review' : 'Not required for this decision'}</div>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-8 py-3 font-mono text-[10px] text-ink-3">
          <span>Issuer: {d.issuer} · issued {d.issued_at}{d.provenance && ` · inputs+configs+models bundle ${d.provenance.bundle.slice(0, 16)}…`}</span>
          <span><Satellite size={11} className="mr-1 inline" />Contains modified Copernicus Sentinel data · config {d.config.weights_file}</span>
        </div>
      </div>

      {/* developer panel (replaces the old API console) */}
      <Card className="mx-auto mt-6 max-w-6xl print:hidden">
        <CardTitle icon={Terminal} title="Use this decision in your pipeline" sub="The same Trust Gate decision over the API, authenticated with your personal API key (header X-API-Key, scoped to your locations)."
          right={<span className={clsx('chip', API_KEY ? 'bg-pass-bg text-pass' : 'bg-warn-bg text-warn-ink')}><KeyRound size={12} />{API_KEY ? `key ${API_KEY.slice(0, 10)}… active` : 'no key configured'}</span>} />
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="relative">
              <pre className="scrollbar-thin overflow-x-auto rounded-xl bg-space p-4 font-mono text-[12px] leading-relaxed" style={{ color: '#CDEBFF' }}>{curl}</pre>
              <button onClick={() => { navigator.clipboard.writeText(curl.replace(/X-API-Key: [^"]+/, `X-API-Key: ${API_KEY || '<your key>'}`)); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] text-sky hover:bg-white/20"><ClipboardCopy size={12} />{copied ? 'copied' : 'copy'}</button>
            </div>
            <button onClick={runLive} disabled={liveBusy} className="btn-primary mt-3">{liveBusy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}Run live check now</button>
            <a href="/docs" target="_blank" className="btn-ghost ml-2 mt-3">Swagger docs</a>
          </div>
          <div>
            {live ? (
              live.error ? <div className="rounded-xl bg-block-bg p-3 text-sm text-block">{live.error}</div> : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="mb-2 flex items-center gap-2"><StatusBadge status={live.status} /><span className="num text-sm">trust {live.trust_score} · ready {live.ai_readiness}</span>{live.alert_sent && <span className="chip bg-block-bg text-block">alert sent</span>}</div>
                  <pre className="scrollbar-thin max-h-56 overflow-auto rounded-xl bg-[#0B1A2E] p-3 font-mono text-[11px]" style={{ color: '#A7F3D0' }}>{JSON.stringify(live, null, 2)}</pre>
                </motion.div>
              )
            ) : <div className="grid h-full min-h-[160px] place-items-center rounded-xl border border-dashed border-line text-sm text-ink-3">Run the live check to see the API response</div>}
          </div>
        </div>
      </Card>
    </div>
  )
}
