import { motion } from 'framer-motion'
import {
  ArrowRight, Bot, Building2, CloudRain, CloudSun, Database, BookOpen, Droplets, FlaskConical, Layers, Mail, MapPin, Plus, Radar, Satellite,
  ShieldCheck, Sprout, Thermometer, Waves, Zap,
} from 'lucide-react'
import { useState } from 'react'
import EarthHorizon from '../components/EarthHorizon'
import { Link, useNavigate } from 'react-router-dom'
import Globe from '../components/Globe'
import Logo from '../components/Logo'
import Pipeline from '../components/Pipeline'
import { StatusBadge } from '../components/ui'
import { layerUrl, useApi } from '../lib/api'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'

const ST03 = [
  { req: 'Analyze incoming multi-sensor data', feat: 'STAC ingestion · metadata validation · S1/S2 grid alignment', to: '/scene', icon: Satellite },
  { req: 'Compare information across sensors', feat: 'Physics-informed S1↔S2 agreement (water, vegetation, surface, change)', to: '/fusion', icon: Radar },
  { req: 'Detect quality problems', feat: 'Cloud/shadow/missing masks · SAR speckle · drift (PSI/KS/JS) · Isolation Forest · calibration', to: '/quality', icon: Layers },
  { req: 'Generate a Trust Score (0–100)', feat: 'Weighted engine + nonlinear penalties + uncertainty (± interval) per tile & scene', to: '/explain', icon: Zap },
  { req: 'Classify PASSED / WARNING / BLOCKED', feat: 'Trust Gate API with hard gate rules, webhook alert, human review queue', to: '/passport', icon: ShieldCheck },
  { req: 'Explain before downstream AI uses it', feat: '“Why this score?” waterfall · SHAP · False Confidence Detector · Trust Passport', to: '/explain', icon: Bot },
]

const TICKER_BASE = [
  'S2 MSI · L2A · 10 m', 'S1 C-SAR · IW · VV+VH · RTC', 'ORBIT 693 km SSO · INC 98.6°', 'REVISIT S2 5 d · S1 12 d',
  'LEE SPECKLE FILTER 7×7', 'PSI · KS · JENSEN-SHANNON', 'ISOLATION FOREST PER AOI', 'XGBOOST + TREESHAP', 'TRUST GATE API v1.0',
]

interface DS { experiments: { id: string; without: number; with: number | null; false_alarm_km2_without?: number; false_alarm_km2_with?: number; errors_prevented_km2?: number }[]; total_errors_prevented_km2: number }

export default function Landing() {
  const [pass, setPass] = useState<string | null>(null)
  const { scenes, setSceneId, aois, aoi, setAoi } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()
  const ds = useApi<DS>('/api/downstream?aoi=nashik')
  const ready = aois.filter((a) => a.status.state === 'ready')
  const totalScenes = ready.reduce((n, a) => n + (a.n_s2 ?? 0) + 5, 0)
  const totalBlocked = ready.reduce((n, a) => n + (a.decisions?.BLOCKED ?? 0), 0)
  const TICKER = [...ready.map((a) => `AOI ${a.lat.toFixed(2)}°N ${a.lon.toFixed(2)}°E · ${a.name.toUpperCase()} · T${a.tile}`), `${totalScenes} SCENES VERIFIED`, ...TICKER_BASE]
  const demos = scenes.filter((s) => ['DEMO-HEALTHY', 'DEMO-CLOUDY', 'DEMO-SUSPICIOUS'].includes(s.scene_id))
  const blocked = scenes.filter((s) => s.status === 'BLOCKED').length
  const monsoon = ds.data?.experiments.find((e) => e.id === 'monsoon')
  const flood = ds.data?.experiments.find((e) => e.id === 'flood')

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      {/* NAV */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3.5">
          <Logo />
          <nav className="hidden gap-6 text-sm font-medium text-ink-2 md:flex">
            <a href="#problem" className="hover:text-teal">Problem</a>
            <a href="#how" className="hover:text-teal">How it works</a>
            <a href="#st03" className="hover:text-teal">ST-03 mapping</a>
            <a href="#locations" className="hover:text-teal">Locations</a>
            <Link to="/models" className="hover:text-teal">Models</Link>
            <a href="/docs" className="hover:text-teal">API docs</a>
          </nav>
          <div className="flex-1" />
          {user ? <Link to="/dashboard" className="btn-primary">Open console <ArrowRight size={16} /></Link> : (
            <div className="flex items-center gap-2"><Link to="/login" className="btn-ghost">Sign in</Link><Link to="/login?mode=up" className="btn-primary">Get started <ArrowRight size={16} /></Link></div>
          )}
        </div>
      </header>

      {/* HERO */}
      <section className="relative pt-24">
        <div className="pointer-events-none absolute inset-0 grid-bg [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <svg className="pointer-events-none absolute -left-40 top-20 h-[700px] w-[700px] animate-orbitSlow opacity-40" viewBox="0 0 700 700">
          <ellipse cx="350" cy="350" rx="340" ry="140" fill="none" stroke="#2563EB" strokeOpacity=".25" strokeDasharray="4 8" />
          <ellipse cx="350" cy="350" rx="260" ry="250" fill="none" stroke="#0891B2" strokeOpacity=".18" />
          <circle cx="690" cy="350" r="5" fill="#0891B2" />
        </svg>
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 pb-10 pt-10 lg:grid-cols-[1fr_1.08fr]">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-teal/20 bg-surface/80 px-3 py-1.5 text-xs font-semibold text-teal shadow-card">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pass opacity-75" /><span className="relative h-2 w-2 rounded-full bg-pass" /></span>
              ST-03 · Trust layer for multi-sensor Earth observation
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
              className="mt-5 text-5xl font-extrabold leading-[1.04] text-ink md:text-[64px]">
              Can AI <span className="text-gradient">trust</span> this satellite data?
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
              TerraTrust verifies Sentinel-1 radar and Sentinel-2 optical imagery <b className="text-ink">before</b> it reaches your crop, flood, climate or urban models.
              It detects clouds, gaps, noise, drift and cross-sensor contradictions, then gives every scene a Trust Score and a gate decision with plain-language reasons.
            </motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }} className="mt-3 font-display text-base font-semibold text-teal">
              “Before AI trusts Earth, TerraTrust verifies it.”
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="mt-7 flex flex-wrap gap-3">
              <Link to="/scene" className="btn-primary px-5 py-3 text-[15px]">Analyze a Scene <ArrowRight size={17} /></Link>
              <Link to="/lab" className="btn-ghost px-5 py-3 text-[15px]"><FlaskConical size={17} />Open Corruption Lab</Link>
            </motion.div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="label mr-1 text-[10px]">Live locations</span>
              {ready.map((a) => (
                <button key={a.id} onClick={() => setAoi(a.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${a.id === aoi ? 'border-teal bg-teal text-white shadow-card' : 'border-line bg-surface/80 text-ink-2 hover:border-teal/50'}`}>
                  <MapPin size={12} />{a.name}
                </button>
              ))}
              <Link to="/locations" className="flex items-center gap-1 rounded-full border border-dashed border-teal/50 px-3 py-1.5 text-xs font-semibold text-teal hover:bg-mint/60"><Plus size={12} />Add yours</Link>
            </div>
            <div className="mt-6 grid max-w-lg grid-cols-3 gap-3">
              {[
                [totalScenes || scenes.length || '·', `scenes verified · ${ready.length} locations`],
                [totalBlocked || blocked || '·', 'blocked before AI'],
                [ds.data ? `${ds.data.total_errors_prevented_km2.toFixed(0)} km²` : '·', 'wrong predictions prevented'],
              ].map(([v, l]) => (
                <div key={l as string} className="rounded-2xl border border-line bg-surface/80 p-3 shadow-card">
                  <div className="num text-2xl font-bold text-ink">{v}</div>
                  <div className="text-[11px] leading-tight text-ink-2">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ORBITAL VIEWPORT */}
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}
            className="relative aspect-[1/0.92] overflow-hidden rounded-[28px] border border-sky/30 bg-[radial-gradient(ellipse_at_30%_20%,#0E3358_0%,#061325_55%,#030A16_100%)] shadow-[0_30px_80px_-30px_rgba(14,116,144,0.6)]">
            <div className="absolute inset-0 grid-bg-dark opacity-60" />
            <Globe className="absolute inset-0" onPass={setPass} aois={ready.map((a) => ({ id: a.id, name: a.name, lat: a.lat, lon: a.lon }))} active={aoi} />
            {/* HUD */}
            <div className="pointer-events-none absolute inset-0 p-5 font-mono text-[10px] text-sky/80">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white"><span className="h-1.5 w-1.5 animate-blink rounded-full bg-pass" />ORBITAL VIEW · LIVE</div>
                  <div className="mt-1 uppercase">AOI {ready.find((a) => a.id === aoi)?.name ?? aoi}</div>
                  <div>{(() => { const a = ready.find((x) => x.id === aoi); return a ? `${a.lat.toFixed(2)}°N ${a.lon.toFixed(2)}°E · MGRS T${a.tile ?? ''}` : '' })()}</div>
                </div>
                <div className="text-right">
                  <div className="text-white">EPOCH 2026-10-05</div>
                  <div>SUN-SYNC · 10:30 LTDN</div>
                  <div>ALT 693 km</div>
                </div>
              </div>
              <div className="absolute left-5 top-1/2 -translate-y-1/2 space-y-1.5">
                {['OPT', 'SAR', 'THR', 'WX'].map((k, i) => (
                  <div key={k} className="flex items-center gap-1.5"><span className="w-7">{k}</span><span className="h-1 rounded-full bg-sky/70" style={{ width: [46, 38, 12, 8][i] }} /><span className={i > 1 ? 'text-sky/40' : ''}>{i > 1 ? 'roadmap' : 'online'}</span></div>
                ))}
              </div>
              <div className="absolute inset-x-5 bottom-5 flex items-end justify-between">
                <motion.div key={pass ?? 'idle'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={`rounded-lg border px-2.5 py-1.5 backdrop-blur ${pass ? 'border-pass/60 bg-pass/15 text-pass' : 'border-sky/30 bg-space/60 text-sky/80'}`}>
                  {pass ? <>▶ ACQUIRING · {pass} over AOI</> : <>◌ AWAITING OVERPASS · tracking 2 satellites · {ready.length} AOIs</>}
                </motion.div>
                <div className="text-right"><div>drag to rotate</div><div className="text-white">TerraTrust ground segment</div></div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* TICKER */}
        <div className="relative border-y border-line bg-surface/70 py-2.5 backdrop-blur">
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-mono text-[11px] font-medium text-ink-2">
            {[...TICKER, ...TICKER].map((t, i) => <span key={i} className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-teal" />{t}</span>)}
          </div>
        </div>
      </section>

      {/* FLOW */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center">
          <div className="label text-teal">The missing layer</div>
          <h2 className="mt-2 text-4xl font-bold">Satellite data → <span className="text-gradient">TerraTrust</span> → trusted intelligence</h2>
          <p className="mx-auto mt-3 max-w-2xl text-ink-2">Data observability for Earth observation. TerraTrust works like Great Expectations for satellite pixels: it sits between the sensors and every downstream model.</p>
        </div>
        <div className="relative mt-12 grid items-center gap-6 lg:grid-cols-[1fr_auto_1.1fr_auto_1fr]">
          <div className="space-y-3">
            {[
              { icon: Radar, t: 'Sentinel-1 SAR', s: 'C-band · VV/VH · all-weather' },
              { icon: Satellite, t: 'Sentinel-2 Optical', s: '7 bands + SCL · 10–20 m' },
              { icon: Layers, t: '12-month history', s: '40 S2 + 26 S1 acquisitions' },
            ].map((x, i) => (
              <motion.div key={x.t} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="card flex items-center gap-3 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-skytint text-sky"><x.icon size={19} /></div>
                <div><div className="font-semibold">{x.t}</div><div className="font-mono text-[11px] text-ink-3">{x.s}</div></div>
              </motion.div>
            ))}
          </div>
          <FlowArrow />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl border border-teal/30 bg-gradient-to-br from-teal to-[#0B5E6B] p-6 text-white shadow-lift">
            <div className="absolute -right-10 -top-10 h-40 w-40 animate-orbit rounded-full border border-dashed border-white/25" />
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full border border-white/20" />
            <Logo dark />
            <div className="mt-5 grid grid-cols-2 gap-2 text-[12px]">
              {['Quality engine', 'Temporal recovery', 'Cross-sensor fusion', 'Drift & anomaly', 'Trust Score ±σ', 'Trust Gate'].map((t) => (
                <div key={t} className="rounded-lg bg-white/10 px-2.5 py-2 font-medium backdrop-blur">{t}</div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <span className="chip bg-pass-bg text-pass">PASS → AI</span><span className="chip bg-warn-bg text-warn-ink">WARN → human</span><span className="chip bg-block-bg text-block">BLOCK</span>
            </div>
          </motion.div>
          <FlowArrow />
          <div className="space-y-3">
            {[
              { icon: Sprout, t: 'Agriculture AI', s: 'crop health · yield' },
              { icon: Waves, t: 'Disaster AI', s: 'flood · damage mapping' },
              { icon: Thermometer, t: 'Climate AI', s: 'long-term trends' },
              { icon: Building2, t: 'Urban AI', s: 'built-up growth' },
            ].map((x, i) => (
              <motion.div key={x.t} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="card flex items-center gap-3 p-3.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-mint text-teal"><x.icon size={17} /></div>
                <div><div className="text-sm font-semibold">{x.t}</div><div className="font-mono text-[11px] text-ink-3">{x.s}</div></div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="border-y border-line bg-gradient-to-b from-sand to-bg py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <div className="label text-block">The problem</div>
            <h2 className="mt-2 text-4xl font-bold">Bad pixels in, confident mistakes out.</h2>
            <p className="mt-3 text-ink-2">During the Indian monsoon, more than half of the optical acquisitions over Maharashtra are cloudy. Downstream models have no idea, so they keep predicting. These are real failures we measured on our Nashik AOI:</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <FailureCard icon={Sprout} title="Cloud-corrupted NDVI → wrong crop-damage estimate"
              img={layerUrl('S2_20251015_T43QCC', 'original', 'nashik')} img2={layerUrl('S2_20251015_T43QCC', 'ndvi_raw', 'nashik')}
              metric={monsoon ? `${monsoon.without}% → ${monsoon.with}%` : '·'} metricLabel="crop-classifier accuracy without → with TerraTrust"
              text="Clouds read as “bare soil”, so a crop model flags healthy fields as damaged. TerraTrust masks the clouds, recovers the gaps from history and labels them RECONSTRUCTED." />
            <FailureCard icon={Droplets} title="Cloud shadow → false flood alarm"
              img={layerUrl('S2_20251015_T43QCC', 'cloudmask', 'nashik')} img2={layerUrl('S2_20251015_T43QCC', 'sar', 'nashik')}
              metric={flood ? `${flood.false_alarm_km2_without} → ${flood.false_alarm_km2_with} km²` : '·'} metricLabel="false water area without → with TerraTrust"
              text="Dark cloud shadows look like water in optical indices. Radar sees through the clouds and disagrees, so TerraTrust catches the contradiction before a flood alert goes out." />
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center">
          <div className="label text-teal">How it works</div>
          <h2 className="mt-2 text-4xl font-bold">Ingest → Clean → Recover → Validate → Score → Gate</h2>
        </div>
        <div className="mt-12"><Pipeline /></div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {demos.map((s, i) => (
            <motion.div key={s.scene_id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Link to="/scene" onClick={() => setSceneId(s.scene_id)} className="card group block overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img src={layerUrl(s.scene_id, 'trustmap')} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute left-3 top-3"><StatusBadge status={s.status} /></div>
                  <div className="absolute bottom-3 right-3 rounded-xl bg-surface/90 px-3 py-1.5 backdrop-blur"><span className="num text-2xl font-bold">{s.trust_score.toFixed(0)}</span><span className="text-xs text-ink-3">/100</span></div>
                </div>
                <div className="p-4">
                  <div className="font-semibold">{s.title}</div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{s.story}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* LOCATIONS */}
      <section id="locations" className="border-t border-line bg-gradient-to-b from-surface/40 to-bg py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="label text-teal">Locations</div>
              <h2 className="mt-2 text-4xl font-bold">Real places, real Sentinel archives</h2>
              <p className="mt-2 max-w-2xl text-ink-2">Each location learns its own baselines from 12 months of Sentinel-1 and Sentinel-2. Pick one below, or drop a pin anywhere and TerraTrust builds it for you.</p>
            </div>
            <Link to="/locations" className="btn-ghost"><MapPin size={16} />Open location map</Link>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ready.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className="card group overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
                <div className="relative grid aspect-[16/9] grid-cols-2 gap-px bg-line">
                  <img src={layerUrl('DEMO-HEALTHY', 'original', a.id)} loading="lazy" className="h-full w-full object-cover" />
                  <img src={layerUrl('DEMO-CLOUDY', 'cloudmask', a.id)} loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute left-3 top-3 rounded-lg bg-space/75 px-2 py-1 font-mono text-[10px] font-semibold text-sky backdrop-blur">{a.theme?.toUpperCase()}</span>
                  <span className="absolute bottom-3 right-3 rounded-lg bg-surface/90 px-2 py-1 font-mono text-[11px] font-semibold backdrop-blur">{a.lat.toFixed(2)}°N {a.lon.toFixed(2)}°E</span>
                </div>
                <div className="p-5">
                  <div className="font-display text-lg font-bold">{a.name}</div>
                  <div className="text-xs text-ink-3">{a.region}</div>
                  <p className="mt-2 line-clamp-2 text-[13px] text-ink-2">{a.description}</p>
                  {a.decisions && (
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg bg-surface-2 py-1.5"><div className="num text-sm font-bold">{a.n_s2}</div><div className="text-[10px] text-ink-3">scenes</div></div>
                      <div className="rounded-lg bg-pass-bg py-1.5"><div className="num text-sm font-bold text-pass">{a.decisions.PASS}</div><div className="text-[10px] text-ink-3">pass</div></div>
                      <div className="rounded-lg bg-warn-bg py-1.5"><div className="num text-sm font-bold text-warn-ink">{a.decisions.WARNING}</div><div className="text-[10px] text-ink-3">warn</div></div>
                      <div className="rounded-lg bg-block-bg py-1.5"><div className="num text-sm font-bold text-block">{a.decisions.BLOCKED}</div><div className="text-[10px] text-ink-3">blocked</div></div>
                    </div>
                  )}
                  <button onClick={() => { setAoi(a.id); navigate('/dashboard') }} className="btn-primary mt-4 w-full justify-center">Explore {a.name.split('·')[0].trim()} <ArrowRight size={15} /></button>
                </div>
              </motion.div>
            ))}
            <Link to="/locations" className="group grid min-h-[320px] place-items-center rounded-2xl border-2 border-dashed border-teal/30 bg-surface/60 p-8 text-center transition hover:border-teal hover:bg-mint/40">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint text-teal transition group-hover:scale-110"><Plus size={26} /></div>
                <div className="mt-4 font-display text-lg font-bold">Add your location</div>
                <p className="mt-1 text-sm text-ink-2">Click anywhere on the map. 12 months of Sentinel-1/2 are downloaded and scored in about 5 minutes.</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ST-03 */}
      <section id="st03" className="border-t border-line bg-surface py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="label text-sky">Problem statement ST-03</div>
              <h2 className="mt-2 text-4xl font-bold">Every requirement, mapped to a feature</h2>
              <p className="mt-2 max-w-2xl text-ink-2">An AI-powered quality and trust-checking system for multi-sensor Earth-observation data (optical, SAR, thermal, weather).</p>
            </div>
            <div className="flex gap-2 text-ink-3"><CloudSun /><CloudRain /><Radar /><Satellite /></div>
          </div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-line">
            {ST03.map((r, i) => (
              <Link key={r.req} to={r.to} className="group grid grid-cols-[40px_1fr_1.6fr_24px] items-center gap-4 border-b border-line bg-surface px-5 py-4 last:border-0 hover:bg-mint/40">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-mint font-mono text-sm font-bold text-teal">{i + 1}</div>
                <div className="flex items-center gap-2 font-semibold"><r.icon size={16} className="text-sky" />{r.req}</div>
                <div className="text-sm text-ink-2">{r.feat}</div>
                <ArrowRight size={16} className="text-ink-3 transition group-hover:translate-x-1 group-hover:text-teal" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="relative overflow-hidden rounded-3xl border border-teal/20 bg-gradient-to-br from-mint via-surface to-skytint p-10 shadow-card md:p-12">
          <svg className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 animate-orbitSlow opacity-60" viewBox="0 0 200 200"><ellipse cx="100" cy="100" rx="95" ry="38" fill="none" stroke="#0891B2" strokeOpacity=".4" strokeDasharray="3 5" /><circle cx="195" cy="100" r="4" fill="#0891B2" /></svg>
          <div className="relative grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-3xl font-bold md:text-4xl">Put a trust gate in front of your Earth-observation AI.</h2>
              <p className="mt-3 text-ink-2">One call before inference: <code className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-sm text-teal">POST /api/trust/check</code>, then PASS, WARNING or BLOCKED with the reasons.</p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link to="/dashboard" className="btn-primary px-6 py-3">Open console <ArrowRight size={16} /></Link>
              <Link to="/locations" className="btn-ghost px-6 py-3"><Database size={16} />Locations & datasets</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <div className="mx-auto max-w-7xl px-6 pb-10"><EarthHorizon /></div>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-2">Quality and trust verification for multi-sensor Earth-observation data, before it reaches agriculture, disaster, climate and urban AI models.</p>
            <div className="mt-5 flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pass opacity-60" /><span className="relative h-2 w-2 rounded-full bg-pass" /></span>
              <span className="text-xs font-medium text-ink-2">All systems operational</span>
            </div>
            <div className="mt-5 flex gap-2">
              <a href="/docs" className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-2 hover:border-teal/40 hover:text-teal" aria-label="API docs"><BookOpen size={16} /></a>
              <a href="mailto:hello@terratrust.ai" className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-2 hover:border-teal/40 hover:text-teal" aria-label="Email"><Mail size={16} /></a>
            </div>
          </div>
          {[
            { h: 'Product', l: [['Mission dashboard', '/dashboard'], ['Scene analysis', '/scene'], ['Corruption Lab', '/lab'], ['Trust Passport', '/passport'], ['Human review', '/review']] },
            { h: 'Locations', l: [...ready.slice(0, 4).map((a) => [a.name.split('·')[0].trim(), `/locations#${a.id}`]), ['Add a location', '/locations']] },
            { h: 'Developers', l: [['Swagger API docs', '/docs'], ['Models & validation', '/models'], ['Trust Passport', '/passport'], ['Roadmap', '/roadmap']] },
            { h: 'Data sources', l: [['Copernicus Sentinel-1', 'https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-1'], ['Copernicus Sentinel-2', 'https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2'], ['Microsoft Planetary Computer', 'https://planetarycomputer.microsoft.com'], ['Esri World Imagery', 'https://www.esri.com']] },
          ].map((c) => (
            <div key={c.h}>
              <div className="text-sm font-semibold text-ink">{c.h}</div>
              <ul className="mt-4 space-y-2.5">
                {c.l.map(([t, href]) => (
                  <li key={t}>{href.startsWith('http') || href.startsWith('/docs') ? <a href={href} target="_blank" rel="noreferrer" className="text-sm text-ink-2 hover:text-teal">{t}</a> : <Link to={href} className="text-sm text-ink-2 hover:text-teal">{t}</Link>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-ink-3">
            <span>© 2026 TerraTrust AI. Built for problem statement ST-03.</span>
            <span>Contains modified Copernicus Sentinel data 2025–2026 · Synthetic faults are labelled as synthetic</span>
            <span className="font-mono">v1.1 · API v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="relative mx-auto hidden h-2 w-16 lg:block">
      <div className="absolute inset-0 rounded-full bg-line" />
      <motion.div className="absolute top-0 h-2 w-4 rounded-full bg-sky shadow-glow" animate={{ left: ['0%', '75%'] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  )
}

function FailureCard({ icon: Icon, title, img, img2, metric, metricLabel, text }: { icon: typeof Sprout; title: string; img: string; img2: string; metric: string; metricLabel: string; text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="card overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line">
        <img src={img} className="aspect-square w-full object-cover" />
        <img src={img2} className="aspect-square w-full object-cover" />
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2 font-semibold"><Icon size={17} className="text-block" />{title}</div>
        <p className="mt-2 text-sm text-ink-2">{text}</p>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-mint px-4 py-3">
          <span className="num text-xl font-bold text-teal">{metric}</span>
          <span className="text-xs text-ink-2">{metricLabel}</span>
        </div>
      </div>
    </motion.div>
  )
}
