import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, Rocket, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import Logo from '../components/Logo'
import { layerUrl } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { user, login, register, demo, ready } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/dashboard'
  const nav = useNavigate()
  const [mode, setMode] = useState<'in' | 'up'>(params.get('mode') === 'up' ? 'up' : 'in')
  const [f, setF] = useState({ email: '', password: '', name: '', org: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (ready && user) return <Navigate to={next} replace />

  const run = async (kind: string, fn: () => Promise<void>) => {
    setErr(null); setBusy(kind)
    try { await fn(); nav(next, { replace: true }) } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'in') run('in', () => login(f.email, f.password))
    else run('up', () => register(f))
  }
  const field = (k: keyof typeof f, label: string, icon: typeof Mail, type = 'text', ph = '') => {
    const I = icon
    return (
      <label className="block">
        <span className="text-xs font-semibold text-ink-2">{label}</span>
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10">
          <I size={16} className="text-ink-3" />
          <input type={k === 'password' ? (show ? 'text' : 'password') : type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph}
            required={k !== 'org'} minLength={k === 'password' && mode === 'up' ? 8 : undefined} autoComplete={k === 'password' ? (mode === 'in' ? 'current-password' : 'new-password') : k}
            className="w-full bg-transparent py-2.5 text-sm outline-none" />
          {k === 'password' && <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-3 hover:text-ink">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
        </div>
      </label>
    )
  }

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.05fr_1fr]">
      {/* left: brand + live imagery */}
      <div className="relative hidden overflow-hidden bg-[radial-gradient(ellipse_at_30%_20%,#0E3358_0%,#061325_60%,#030A16_100%)] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 grid-bg-dark opacity-70" />
        <svg className="absolute -right-40 top-10 h-[760px] w-[760px] animate-orbitSlow opacity-40" viewBox="0 0 700 700">
          <ellipse cx="350" cy="350" rx="330" ry="130" fill="none" stroke="#38BDF8" strokeOpacity=".5" strokeDasharray="4 8" />
          <ellipse cx="350" cy="350" rx="250" ry="240" fill="none" stroke="#14B8A6" strokeOpacity=".35" />
          <circle cx="680" cy="350" r="6" fill="#38BDF8" />
        </svg>
        <Link to="/" className="relative"><Logo dark /></Link>
        <div className="relative mt-auto">
          <div className="grid max-w-md grid-cols-3 gap-3">
            {['DEMO-HEALTHY', 'DEMO-CLOUDY', 'DEMO-SUSPICIOUS'].map((s, i) => (
              <motion.div key={s} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.12 }}
                className="overflow-hidden rounded-2xl border border-white/15 shadow-lift">
                <img src={layerUrl(s, 'trustmap', 'nashik')} className="aspect-square w-full object-cover" />
                <div className={clsx('py-1 text-center font-mono text-[10px] font-bold', ['bg-pass', 'bg-warn', 'bg-block'][i])}>{['PASS', 'WARNING', 'BLOCKED'][i]}</div>
              </motion.div>
            ))}
          </div>
          <h1 className="mt-8 max-w-lg text-4xl font-extrabold leading-tight">Before AI trusts Earth, <span className="bg-gradient-to-r from-pass to-cyan bg-clip-text text-transparent">TerraTrust verifies it.</span></h1>
          <p className="mt-3 max-w-md text-sky/80">Sign in to analyse scenes, add your own locations, run the Corruption Lab and issue verifiable Trust Passports.</p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[11px] text-sky/80">
            {['Sentinel-1 + Sentinel-2', 'Fit-for-purpose trust', 'Private locations', 'Personal API key'].map((t) => <span key={t} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1">{t}</span>)}
          </div>
        </div>
      </div>

      {/* right: form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-3xl font-bold">{mode === 'in' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-ink-2">{mode === 'in' ? 'Sign in to your TerraTrust workspace.' : 'Your locations stay private to your account.'}</p>

          <button onClick={() => run('demo', demo)} disabled={!!busy}
            className="group mt-6 flex w-full items-center gap-3 rounded-2xl border-2 border-teal/30 bg-gradient-to-r from-mint to-skytint p-4 text-left transition hover:border-teal hover:shadow-lift">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal text-white">{busy === 'demo' ? <Loader2 className="animate-spin" size={20} /> : <Rocket size={20} />}</div>
            <div className="flex-1">
              <div className="font-semibold">Continue with the demo account</div>
              <div className="font-mono text-[11px] text-ink-2">demo@terratrust.ai · all 4 sample locations</div>
            </div>
            <ArrowRight size={18} className="text-teal transition group-hover:translate-x-1" />
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-ink-3"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>

          <div className="mb-4 grid grid-cols-2 rounded-xl bg-surface-2 p-1">
            {(['in', 'up'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setErr(null) }} className={clsx('rounded-lg py-2 text-sm font-semibold transition', mode === m ? 'bg-surface text-ink shadow-card' : 'text-ink-2')}>{m === 'in' ? 'Sign in' : 'Create account'}</button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <AnimatePresence initial={false}>
              {mode === 'up' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-3 overflow-hidden">
                  {field('name', 'Full name', UserIcon, 'text', 'Riya Sharma')}
                  {field('org', 'Organisation (optional)', ShieldCheck, 'text', 'Agriculture department')}
                </motion.div>
              )}
            </AnimatePresence>
            {field('email', 'Email', Mail, 'email', 'you@example.com')}
            {field('password', 'Password', Lock, 'password', mode === 'up' ? 'at least 8 characters' : '••••••••')}
            {err && <div className="rounded-xl bg-block-bg px-3 py-2 text-sm text-block">{err}</div>}
            <button type="submit" disabled={!!busy} className="btn-primary w-full justify-center py-3">
              {busy === 'in' || busy === 'up' ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {mode === 'in' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div className="mt-6 rounded-xl border border-dashed border-line bg-surface/60 p-3 text-[11.5px] text-ink-2">
            <b className="text-ink">Demo credentials:</b> <span className="font-mono">demo@terratrust.ai</span> / <span className="font-mono">Demo@1234</span>
            <div className="mt-1 text-ink-3">Passwords are stored as salted PBKDF2-SHA256 hashes; sessions use an HttpOnly cookie.</div>
          </div>
          <Link to="/" className="mt-6 inline-block text-sm text-ink-2 hover:text-teal">← Back to home</Link>
        </div>
      </div>
    </div>
  )
}
