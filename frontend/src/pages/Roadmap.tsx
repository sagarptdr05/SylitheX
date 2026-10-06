import { motion } from 'framer-motion'
import { Boxes, BrainCircuit, CheckCircle2, CloudSun, FileText, Flag, Network, Satellite, Thermometer, Workflow } from 'lucide-react'
import { Card, PageHeader } from '../components/ui'

const DONE = [
  'STAC ingestion + metadata validation (Planetary Computer)', 'Cloud / shadow / missing detection (SCL + spectral tests)', 'Temporal recovery with RECONSTRUCTED labels + uncertainty',
  'Lee speckle filter + SAR noise score', 'Physics-informed S1↔S2 agreement', 'Drift (PSI, KS, JS) + PIF radiometric calibration check', 'Isolation Forest + robust temporal z-score',
  'Trust Score engine, gate rules, profiles, ± interval', 'Tile Trust Map + lineage', 'False Confidence Detector', 'Synthetic Corruption Lab + benchmark', 'Trust Gate API + webhook',
  'XGBoost + TreeSHAP evidence', 'Trust Timeline + seasonal forecast', 'Trust Passport (JSON/CSV)', 'Human review queue', 'Downstream impact proof',
]
const FUTURE = [
  { icon: BrainCircuit, t: 'U-Net / Residual U-Net reconstruction', d: 'SAR-conditioned deep gap filling to replace the temporal median where history is sparse (monsoon).' },
  { icon: Boxes, t: 'Autoencoder anomaly detection', d: 'Pixel-level reconstruction error as a learned anomaly signal alongside Isolation Forest.' },
  { icon: Thermometer, t: 'Thermal sensors (Landsat TIRS / ECOSTRESS)', d: 'Land-surface temperature consistency checks against optical & SAR moisture signals.' },
  { icon: CloudSun, t: 'Weather data (ERA5 / IMD)', d: 'Rainfall & cloud reanalysis to predict trust dips and validate flood/water signals.' },
  { icon: FileText, t: 'PDF Trust Passport export', d: 'Signed, printable certificates for audit and procurement workflows.' },
  { icon: Network, t: 'Federated trust', d: 'Share trust statistics across agencies without moving raw imagery.' },
  { icon: Satellite, t: 'ISRO Bhuvan integration', d: 'Native support for Resourcesat LISS-III/IV, RISAT and EOS-04 data streams.' },
  { icon: Workflow, t: 'Streaming trust gate', d: 'Score scenes as they land in the archive; event-driven gating for disaster response.' },
]

export default function Roadmap() {
  return (
    <div>
      <PageHeader kicker="Roadmap" title="From hackathon MVP to national EO trust infrastructure" sub="Tier 1 + Tier 2 are implemented and working. Tier 3 is the future scope below (shown, not implemented)." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <div className="label mb-3 flex items-center gap-1.5 text-pass"><CheckCircle2 size={13} />Shipped (Tier 1 + 2)</div>
          <ul className="space-y-1.5">{DONE.map((d) => <li key={d} className="flex gap-2 text-[13px]"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-pass" />{d}</li>)}</ul>
        </Card>
        <div className="relative">
          <div className="absolute bottom-0 left-[22px] top-0 w-0.5 bg-gradient-to-b from-teal via-sky to-transparent" />
          {FUTURE.map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }} className="relative mb-4 flex gap-4">
              <div className="z-10 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-sky/30 bg-surface text-sky shadow-card"><f.icon size={19} /></div>
              <Card className="flex-1 py-4" hover>
                <div className="flex items-center gap-2"><span className="font-semibold">{f.t}</span><span className="chip bg-skytint text-[10px] text-sky"><Flag size={10} />Tier 3</span></div>
                <p className="mt-1 text-[13px] text-ink-2">{f.d}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
