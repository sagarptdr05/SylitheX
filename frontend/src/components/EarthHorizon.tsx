import { motion } from 'framer-motion'
import { ArrowRight, Radar, Satellite, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Earth-observation satellite silhouette (dish, bus, two solar arrays). */
function Sat() {
  return (
    <svg viewBox="0 0 420 200" className="h-full w-full drop-shadow-[0_10px_30px_rgba(0,0,0,.6)]" aria-hidden>
      <defs>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e3a5f" /><stop offset="1" stopColor="#0b1626" /></linearGradient>
        <linearGradient id="bus" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a4250" /><stop offset="1" stopColor="#14181f" /></linearGradient>
      </defs>
      {[[20, 'url(#panel)'], [262, 'url(#panel)']].map(([x, f]) => (
        <g key={x as number} transform={`translate(${x} 70) skewY(-8)`}>
          <rect width="138" height="54" rx="3" fill={f as string} stroke="#5d7aa3" strokeWidth="1.2" />
          {[1, 2, 3].map((i) => <line key={i} x1={i * 34.5} y1="0" x2={i * 34.5} y2="54" stroke="#5d7aa3" strokeWidth="0.8" />)}
          <line x1="0" y1="27" x2="138" y2="27" stroke="#5d7aa3" strokeWidth="0.6" opacity=".6" />
        </g>
      ))}
      <line x1="158" y1="92" x2="182" y2="98" stroke="#8a93a3" strokeWidth="2.5" />
      <line x1="238" y1="92" x2="262" y2="86" stroke="#8a93a3" strokeWidth="2.5" />
      <rect x="182" y="70" width="56" height="62" rx="6" fill="url(#bus)" stroke="#6b7484" strokeWidth="1.2" />
      <rect x="190" y="78" width="40" height="10" rx="2" fill="#c9a24a" opacity=".85" />
      <ellipse cx="172" cy="104" rx="20" ry="30" transform="rotate(-18 172 104)" fill="#20262f" stroke="#7d8696" strokeWidth="1.5" />
      <line x1="172" y1="104" x2="150" y2="94" stroke="#7d8696" strokeWidth="1.5" />
      <line x1="214" y1="70" x2="222" y2="34" stroke="#8a93a3" strokeWidth="2" />
      <circle cx="222" cy="32" r="4" fill="#9aa3b2" />
      <line x1="226" y1="132" x2="248" y2="160" stroke="#8a93a3" strokeWidth="1.8" />
      <circle cx="222" cy="32" r="2.5" fill="#34d399"><animate attributeName="opacity" values="1;.2;1" dur="1.8s" repeatCount="indefinite" /></circle>
    </svg>
  )
}

/** Footer hero: night-side Earth from orbit with an observing satellite. */
export default function EarthHorizon({ cta = true }: { cta?: boolean }) {
  return (
    <section className="theme-dark relative overflow-hidden rounded-3xl border border-line bg-[#03060d] print:hidden">
      <img src="/images/earth-horizon.jpg" srcSet="/images/earth-horizon-sm.jpg 1200w, /images/earth-horizon.jpg 2400w" sizes="100vw"
        alt="Night-side Earth from orbit with city lights and the blue atmospheric limb" loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-[50%_70%]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#03060d]/85 via-[#03060d]/30 to-transparent" />
      {/* observation beam from the satellite down to the surface */}
      <div className="pointer-events-none absolute right-[16%] top-[30%] hidden h-[55%] w-[18%] origin-top bg-gradient-to-b from-sky/25 to-transparent [clip-path:polygon(45%_0,55%_0,100%_100%,0_100%)] md:block" />
      <motion.div className="pointer-events-none absolute right-[6%] top-[4%] w-[46%] max-w-[420px] sm:w-[36%]"
        animate={{ y: [0, -8, 0], rotate: [-1, 1, -1] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}>
        <Sat />
      </motion.div>
      <div className="relative flex min-h-[260px] flex-col justify-center gap-4 px-6 py-10 sm:min-h-[320px] sm:px-10">
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-sky"><Satellite size={13} />Sentinel-1 · Sentinel-2 · always on</div>
        <h2 className="max-w-xl text-2xl font-bold leading-tight text-white sm:text-[32px]">Every pixel verified <span className="text-gradient">before</span> it drives a decision.</h2>
        <p className="max-w-lg text-sm text-ink-2">TerraTrust watches each acquisition, scores its trust and traces its provenance, so crop, flood, climate and carbon models only see data they can rely on.</p>
        {cta && (
          <div className="flex flex-wrap gap-2">
            <Link to="/lab" className="btn-primary"><ShieldCheck size={15} />Test the trust layer <ArrowRight size={15} /></Link>
            <Link to="/anomalies" className="btn border border-white/20 bg-white/5 text-white hover:bg-white/10"><Radar size={15} />Live anomalies</Link>
          </div>
        )}
      </div>
    </section>
  )
}
