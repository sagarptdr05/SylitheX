export type Status = 'PASS' | 'WARNING' | 'BLOCKED'
export type ProfileId = 'crop_monitoring' | 'flood_detection' | 'urban_planning' | 'climate_monitoring'

export interface Tile {
  id: string; row: number; col: number; polygon: [number, number][]
  score: number; status: Status; cloud: number; shadow: number; missing: number; reconstructed: number
  sensor_agreement: number | null; drift: string; drift_psi: number; anomaly: string
  anomaly_top: { feature: string; z: number }[]; temporal_status: string; temporal_z: number; ndvi: number | null
  components: Record<string, number | null>; reasons: string[]; critical_penalty?: number; recon_ratio?: number
}
export interface GateRule { rule: string; action: 'BLOCK' | 'CAP_WARNING'; message: string }
export interface WaterfallStep { name: string; value: number; kind: 'start' | 'component' | 'penalty' | 'end'; key?: string }
export interface ShapItem { feature: string; label: string; value: number; shap: number }
export interface MlEvidence { reliability: number; base_value: number; increasing: ShapItem[]; decreasing: ShapItem[] }

export interface SceneInfo { title: string; kind: string; story: string; demo: boolean; base_date: string; synthetic: boolean }

export interface Scene {
  scene_id: string; date: string; profile: string
  trust_score: number; trust_uncertainty: number; trust_interval: [number, number]
  ai_readiness: number; ai_readiness_all: Record<ProfileId, number>; readiness_status: Status; status: Status
  components: Record<string, number | null>
  levels: { anomaly: string; drift: string; noise: string }
  metrics: Record<string, any>
  gate_rules_triggered: GateRule[]
  false_confidence: { detected: boolean; visual_quality: number; triggers: string[]; message: string }
  reasons: string[]; reasons_positive: string[]; reasons_negative: string[]
  waterfall: WaterfallStep[]; worst_tiles: { id: string; score: number; reasons: string[] }[]
  tiles: Tile[]
  fusion: { available: boolean; rules: Record<string, number | null>; reference: [string, string] | null; s1_date: string | null; s1_gap_days: number | null }
  drift: { per_feature: Record<string, Record<string, number | null>>; index: number; calibration: any }
  temporal: { flagged: number; statuses: Record<string, number> }
  recovery: any; lineage: { stage: string; pixels: number; pct: number; detail: string }[]
  metadata_checks: { check: string; status: string; detail: string }[]
  sensors: any; synthetic: string[]; processing_ms: number; aoi?: string
  info: SceneInfo; ml_evidence: MlEvidence | null; layers: string[]
}

export interface SceneListItem extends SceneInfo {
  scene_id: string; date: string; trust_score: number; trust_interval: [number, number]; status: Status
  ai_readiness_all: Record<ProfileId, number>; cloud_pct: number; recon_pct: number; false_confidence: boolean; s1_date: string | null
}

export interface Profile { id: ProfileId; name: string; description: string; icon: string; weights: Record<string, number> }

export interface AoiStatus { state: 'ready' | 'building' | 'queued' | 'error' | 'pending'; progress: number; step: string; message: string; seconds?: number }
export interface Aoi {
  id: string; name: string; region: string; lat: number; lon: number; grid_px: number; theme: string; description: string
  builtin: boolean; shared?: boolean; mine?: boolean; status: AoiStatus; bbox?: number[]; grid?: number; tile?: string; crs?: string; size_km?: number
  n_s2?: number; n_s1?: number; first?: string; last?: string; avg_trust?: number
  decisions?: { PASS: number; WARNING: number; BLOCKED: number }
  demos?: { id: string; base: string; title: string }[]; dataset?: { size_bytes: number; scenes: number }
}

export interface Issue {
  id: string; type: string; category: 'quality' | 'anomaly' | 'integrity' | 'event'; sensor: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'; confidence: number; why: string; action: string
  scene_id: string; scene_title: string; demo: boolean; synthetic: boolean; date: string; status: Status
  tiles: string[]; n_tiles: number; area_pct: number; observations: number; trust_points: number | null
  center: [number, number]; polygons: [number, number][][]; impact: string; gate_action: string; scene_level?: boolean
}
export interface AnomalyFeed { items: Issue[]; total: number; types: string[]; by_severity: Record<string, number>; aoi: string }

export interface CoverClass { id: number; name: string; color: string; pct: number; area_ha: number; agb_t: number }
export interface CarbonEstimate {
  available: boolean; area_ha: number; observed_pct: number; agb_t_ha: number; agb_t: number; carbon_t: number; co2e_t: number
  co2e_t_ha: number; uncertainty_pct: number; co2e_interval: [number, number]; cover: CoverClass[]; mode: string; note?: string
  status?: Status; trust_score?: number; tiles_excluded?: number; tiles_total?: number; delivered_trust?: number | null
  recon_share_pct?: number; withheld?: boolean; recalibration?: { band: string; relative_gain: number; note: string } | null
  date?: string; scene_id?: string
}
export interface SceneCarbon {
  scene_id: string; date: string; status: Status; trust_score: number; naive: CarbonEstimate; trusted: CarbonEstimate
  fallback?: CarbonEstimate; images: { lulc: string; biomass: string }; method: { name: string; steps: string[]; limits: string }
}
