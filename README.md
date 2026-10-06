# TerraTrust AI

> **Before AI trusts Earth, TerraTrust verifies it.**

TerraTrust is a trust layer (data observability) for multi-sensor Earth-observation data. It checks Sentinel-1 SAR and Sentinel-2 optical imagery **before** downstream AI models use it, for agriculture, disaster response, climate monitoring and urban planning. Every scene gets:

- a **Trust Score (0–100) with an uncertainty interval**, per scene and per 960 m tile,
- a gate decision: **PASS** (released to the AI), **WARNING** (sent to human review) or **BLOCKED** (rejected),
- a plain-language **explanation** of why it is or isn't trustworthy.

Problem statement **ST-03**: analyze incoming data → compare across sensors → detect quality problems → Trust Score → PASSED / WARNING / BLOCKED → explain before downstream AI uses it.

---

## Quick start

```bash
./run.sh
```

- UI: http://localhost:5173
- API + Swagger: http://localhost:8000/docs

The first run downloads the data, trains the models and precomputes the scenes (~6 min). After that, the demo never waits on the network.

## Accounts & access

| | |
|---|---|
| Demo login | `demo@terratrust.ai` / `Demo@1234`, or "Continue with the demo account" on `/login` |
| Who sees what | Built-in locations (Nashik, Vasai–Virar) are shared. A location you add is **private to your account**. The demo account owns every existing user-added location (Pune, Lodhika). |
| Security | PBKDF2-SHA256 password hashes (200 k iterations, per-user salt). HttpOnly SameSite session cookie with a 7-day expiry. Location ownership is enforced server-side on every request (403 for other users' locations). |
| Personal API key | Every user has an `X-API-Key` scoped to their own locations (user menu → copy; `POST /api/auth/api-key/rotate`). Keys in `backend/.env` are admin/service keys. |
| Public without login | Only the landing page's previews of the shared locations. Everything else needs a session or an API key. |

## Trust Intelligence (beyond ST-03)

See [`docs/INNOVATION.md`](docs/INNOVATION.md) for the market-gap map, ranking and honest limits. The **Trust Intelligence** page and API provide:

- **Fit-for-purpose preflight:** GO / CONDITIONAL / NO-GO for 6 uses (land cover, crop, flood, change detection, biomass, carbon MRV), with failing checks, fixes and ranked fallbacks (`configs/usecases.yaml`).
- **Silent Failure Risk:** hidden issues inside the area that looks clean.
- **Trust graph and contamination radius:** trust propagated from sensors to products; real recovery provenance traced forward.
- **Impact-weighted quality:** issues weighted by relevance to each use (cropland, water-prone, built-up).
- **EO Data Debt and quality memory:** accumulated unresolved uncertainty, its sources and remediation, plus recurring hotspot tiles.
- **Reproducibility:** re-run from SHA-256-hashed inputs, configs and models, and compare.

API: `GET /api/scene/{id}/fitness | preflight?use_case= | silent | impact | fallback?use_case= | reproduce | intelligence`, plus `GET /api/intelligence/location`.

## Interface (v2: dark Earth-intelligence console)

The UI follows the data story: **observe → inspect → trust → trace → analyse → decide**. Every number comes from the API, and simplified science is labelled.

| Section | What it answers |
|---|---|
| **Overview** | Interactive 3D Earth (Sentinel-1/2 orbits, trust-coloured project markers you can click), the live *satellite observation → ingestion → quality → anomaly → provenance → trust score → trusted data* pipeline, the signature Trust Score ring (one segment per component; click for "why"), data health, anomalies and downstream carbon impact |
| **Data Sources** | Satellites feeding the project, a searchable/sortable/paginated dataset catalogue, and a **Dataset Inspector** (Overview · Metadata · Quality · Versions · Provenance · Preview) |
| **Data Quality** | **Issue Center**: every issue with what / why / where / when / severity / impact / action, exportable as CSV, plus the per-component gauges and tile heatmaps |
| **Anomalies** | Explorer with severity / category / sensor / type / date filters; selecting a finding flies the satellite map to the affected tiles |
| **Provenance** | Interactive lineage graph from the Sentinel product to the carbon report; hover lights up everything a node depends on, click opens an inspection panel (hashes, versions, gate rules) |
| **EO Analytics** | Map (satellite basemap + any layer + trust tiles), time series (trust, cloud, vegetation, biomass), before/after comparison, layer gallery |
| **Carbon MRV** | Trusted EO data → land cover → biomass → carbon → verification, with naive-vs-trusted comparison, a carbon time series and change detection |
| **Simulation** | **Data Integrity Lab**: inject duplicate, missing data, timestamp corruption, sensor drift, outliers, suspicious change, clouds, noise (or a real flood as a control), press *Run simulation*, then see trust before → after, the carbon error without vs with TerraTrust, and the trust layer's response |
| **Reports** | Trust Passport, printable project report, JSON export, timeline, review queue, alert log, recent API checks |

Desktop uses a collapsible navigation rail; phones get a bottom navigation bar, a "More" sheet and bottom-sheet panels (tested at 360/390 px with no horizontal overflow). ⌘K or `/` opens a command palette. The 3D globe falls back to a static Earth without WebGL, and `prefers-reduced-motion` is respected.

### Record integrity and Carbon MRV (new)

- **Integrity checks** (`terratrust/integrity.py`): *duplicate observation* (pixels identical to another archived acquisition → BLOCK), *timestamp conflict* (declared date ≠ sensing time in the product ID → BLOCK), *future timestamp*, and *revisit cycle* (date off the tile's 5-day Sentinel-2 phases). Zero false positives on all 160 real acquisitions (tested).
- **Carbon MRV proxy** (`terratrust/carbon.py`): land cover from spectral indices → above-ground biomass from class default densities × NDVI → carbon (IPCC fraction 0.47) → tCO₂e, with uncertainty widened by reconstruction, missing coverage and trust. A flagged NIR drift is corrected with its relative gain on pseudo-invariant targets before biomass is estimated; a BLOCKED record falls back to the nearest acquisition that passed the gate. **Indicative Tier-1 style estimate, not a certified MRV result; no LiDAR/GEDI data is used.**

Example (Nashik, live): clean scene 364.7k tCO₂e; the same scene with dropout + noise + impossible NDVI → **+40.9 %** error without a trust layer, **+3.1 %** with TerraTrust (blocked, nearest trusted acquisition used). NIR drift −25 %: **−33.2 %** naive vs **+2.1 %** after PIF recalibration.

## API keys & configuration

`backend/.env` (template: `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `TERRATRUST_API_KEYS` | Trust Gate API keys (comma separated). Every **write / compute** call (`POST/PUT/DELETE /api/*`) needs header `X-API-Key`; reads stay public. A key was generated on setup. |
| `PC_SDK_SUBSCRIPTION_KEY` | Optional Microsoft Planetary Computer key (higher download rate limits). Anonymous access works without it. |
| `TERRATRUST_WEBHOOK_URL` | Optional Slack / Teams / any URL fired on BLOCKED. Empty = built-in alert inbox. |

The frontend reads the same key from `frontend/.env.local` (`VITE_TT_API_KEY`). Both files are git-ignored.

```bash
curl -X POST localhost:8000/api/trust/check -H "Content-Type: application/json" \
     -H "X-API-Key: $(grep TERRATRUST_API_KEYS backend/.env | cut -d= -f2)" \
     -d '{"aoi":"vasai-virar","scene_id":"DEMO-CLOUDY","profile":"flood_detection"}'
```

## Locations (multi-AOI)

| Location | Theme | Grid | Scenes | Demo dataset |
|---|---|---|---|---|
| **Nashik · Niphad agri belt** (20.08°N 74.03°E) | agriculture, Godavari plain | 7.68 km, T43QCC | 40 S2 + 26 S1 | `data/aois/nashik/demo_dataset.zip` (52 MB) |
| **Vasai · Nallasopara · Virar** (19.43°N 72.83°E) | urban + coastal, mangroves, salt pans | 9.6 km, T42QZG | 40 S2 + 26 S1 | `data/aois/vasai-virar/demo_dataset.zip` (80 MB) |
| *any place you add* | Locations page → pick on map → *Start satellite analysis* | 5.8–9.6 km | auto | auto |

- **Choosing a location.** Use the location switcher in the header, the location chips on the landing page, or the **Locations** page (map of India). Every API call takes `?aoi=<id>` (POST bodies take `"aoi"`).
- **Adding a location.** `POST /api/aois {name, lat, lon, size_km}` (or the UI) runs the whole pipeline in a background thread, in about 2–5 minutes: STAC search → download (same-day granules are mosaicked) → baselines → physics model → calibration targets → drift calibration → Isolation Forest → auto-selected demo scenarios → scoring every scene → downstream test → demo dataset. Progress is reported at `/api/aois/<id>/status`.
- **Isolation.** Each AOI owns `data/aois/<id>/` (raw arrays, results, models, baselines), so no location borrows another's statistics. The XGBoost reliability model and the benchmark are shared (`models/`, `data/global/`).
- **Demo datasets** (`/datasets` page, `GET /api/aois/<id>/dataset.zip`) hold 5 scenarios per location:
  - Sentinel-2 L2A bands, SCL and Sentinel-1 VV/VH as georeferenced GeoTIFFs,
  - a Trust Map GeoTIFF and GeoJSON, the full result JSON and previews,
  - `timeline.csv`, `manifest.json` and a README.

Vasai–Virar results: 17 PASS / 7 WARNING / 16 BLOCKED, with almost every June–September acquisition blocked by monsoon cloud. Downstream: crop accuracy goes from 87.1 % to 95.3 %, and water mapping from 91.5 % to 99.9 %.

Manual steps:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python ../scripts/download_demo_data.py   # per location: 40 S2 L2A + 26 S1 RTC scenes (Planetary Computer)
.venv/bin/python ../scripts/build_aoi.py            # per location: baselines, models, demos, 45 scenes, downstream, dataset ZIP
.venv/bin/python ../scripts/build_benchmark.py      # Synthetic Corruption Benchmark + XGBoost (shared)
.venv/bin/uvicorn app.main:app --port 8000
cd ../frontend && npm install && npm run dev
.venv/bin/python -m pytest                          # 87 tests (engine, gates, injectors, pipeline per location, intelligence, integrity, carbon, accounts, API)
```

---

## Data (real)

| | |
|---|---|
| AOI | Niphad agricultural belt, Nashik, Maharashtra (20.08°N 74.03°E), 7.68 × 7.68 km, grapes/onion/sugarcane, Godavari river |
| Optical | Sentinel-2 L2A, MGRS T43QCC, bands B02 B03 B04 B05 B08 B11 B12 + SCL, **40 dates** (Sep 2025 → Sep 2026) |
| Radar | Sentinel-1 RTC (terrain-corrected) VV + VH, **26 dates** |
| Source | Microsoft Planetary Computer STAC (`pystac-client`, `planetary-computer`, `rasterio`) |
| Grid | Every scene is reprojected onto one EPSG:32643 10 m grid (768 × 768 px), so all arrays are pixel-aligned |

The monsoon tells the story on its own: of the 40 optical dates, 12 are cloud-covered between June and September. TerraTrust **BLOCKS** those, puts partially cloudy scenes in **WARNING** with recovery, and **PASSES** the clear Rabi-season scenes.

**Demo scenarios** (`terratrust/scenes.py`):

| ID | Base | What | Trust | Status |
|---|---|---|---|---|
| DEMO-HEALTHY | real 2026-03-04 | clear winter crop | 94 ± 2 | PASS |
| DEMO-CLOUDY | real 2026-09-10 | real monsoon cloud: 37 % cloud, 14 % shadow, 43 % reconstructed | 62 ± 5 | WARNING |
| DEMO-SUSPICIOUS | real 2026-05-03 + **synthetic** faults | dropout, noise, NDVI = 1.4 spikes, S1/S2 contradiction | 30 ± 5 | BLOCKED |
| DEMO-FALSECONF | real 2026-01-18 + **synthetic** faults | looks perfect, but NIR gain −25 % and SAR contradiction → **False Confidence** | 69 ± 3 | WARNING |
| DEMO-EVENT | real 2026-04-13 + **simulated** flood | flood that is physically consistent in S1 and S2 → **REAL EVENT CONFIRMED**, not penalised | 86 ± 3 | PASS |

Synthetic corruption is always labelled `SYNTHETIC` in the UI, the API (`synthetic` field) and the passport.

---

## Architecture

```
Sentinel-1 RTC (VV/VH) ─┐
Sentinel-2 L2A (7 b+SCL)┼─► ingest ─► preprocess ─► quality ─► recovery ─► validation ─► fusion ─► trust ─► gate
12-month history ───────┘   STAC     reflectance   cloud/     temporal    drift (PSI/   physics   weighted   PASS → AI
                            metadata  indices, dB   shadow/    median +    KS/JS), PIF   rules     engine +   WARN → human
                            checks    Lee filter    missing,   RECON label calibration,  S1↔S2     penalties  BLOCK → reject
                                                    noise      + σ         IsoForest,              + gates    + webhook
                                                                           robust-z                 ± interval
                                                                    ▼
                                         explain (reasons, waterfall, XGBoost+SHAP, false confidence) · lineage
```

```
backend/
  app/            FastAPI: main.py, routers/{trust,scenes,lab,ops}.py, services.py, db.py (SQLite)
  terratrust/     ingest/ preprocess/ quality/ recovery/ validation/ fusion/ trust/ explain/ corruption/ lineage/
                  pipeline.py (orchestration) · history.py (baselines, physics model, PIFs) · render.py · scenes.py · downstream.py
  configs/        weights.yaml · thresholds.yaml · profiles.yaml · aois.yaml   ← everything tunable lives here
  models/         xgb.json (shared reliability model)
  data/aois/<id>/ raw/*.npz · results/<scene>/{summary.json, *.jpg|png} · models/{isoforest,physics,drift_calibration}
                  history_stats.npz · pif.npz · aoi.json · demos.json · status.json · demo_dataset.zip
  data/global/    benchmark.json
frontend/         React + Vite + TS + Tailwind + Framer Motion + Recharts + Leaflet + three.js
scripts/          download_demo_data · train_models · build_benchmark · precompute_scenes
```

The engine works on **tiles** (96 px = 960 m, an 8 × 8 Trust Map; tile size is set in `thresholds.yaml`).

---

## Trust Score engine (`terratrust/trust/engine.py`)

| Component (0–100, higher = better) | Weight | How |
|---|---|---|
| Data completeness | 15 % | 1 − (no-data + defective) fraction |
| Cloud quality | 15 % | 1 − (cloud + 0.7 · shadow); SCL classes **plus** an independent spectral whiteness/darkness test |
| Noise quality | 10 % | optical high-frequency residual σ and SAR local Cᵢ² vs the AOI's own history → `100 / (1 + (ratio/2.2)³)` |
| Multi-sensor agreement | 20 % | physics-informed S1↔S2 rules (see below) |
| Temporal consistency | 15 % | robust z-score (MAD) of tile NDVI vs neighbouring dates, S1-confirmed |
| Anomaly (inverted) | 10 % | Isolation Forest on 13 per-tile features + impossible-value check |
| Data drift (inverted) | 10 % | PSI, KS, Jensen-Shannon vs same-season baseline (calibrated on clear history) + PIF radiometric check |
| Reconstruction reliability | 5 % | 1 − mean reconstruction uncertainty, weighted by reconstructed extent |

```
base        = Σ wᵢ · componentᵢ            (missing components, e.g. no S1, are re-normalised away)
critical    = Π penalties                  (impossible values, S1-unconfirmed anomaly, S1/S2 contradiction,
                                             severe noise, anomaly severity, radiometric miscalibration)
recon_pen   = 30 / (1 + e^-(r-0.30)/0.06) − offset        (~0 up to 5 %, steep after ~25 %)
tile score  = base · critical − recon_pen
scene score = 0.85 · mean(tiles) + 0.15 · mean(worst 10 % tiles)
interval    = 1.96 · √(var_bootstrap(tiles) + var_perturbation(components)) + reconstruction & missing-S1 terms
```

**Hard gate rules** (override the score, `thresholds.yaml`): cloud > 60 % → BLOCK · S1/S2 agreement < 20 % → BLOCK · missing > 30 % → BLOCK · impossible values > 5 % → BLOCK · reconstructed > 40 % → cap WARNING · HIGH drift and agreement < 50 % → cap WARNING · radiometric calibration flag → cap WARNING.

**Status:** ≥ 80 PASS · 50–79 WARNING · < 50 BLOCKED.

**Trust Score vs AI readiness:** the Trust Score uses the task-independent weights. AI readiness re-weights the same evidence with a use-case profile (`profiles.yaml`): Crop monitoring, Flood detection (SAR-first, so clouds matter little), Urban planning, Climate monitoring. The same cloudy scene gets 64 for crop monitoring and 80 for flood detection.

### Key modules
- **Temporal recovery** (`recovery/temporal.py`): a quality-weighted median of valid pixels within ±45 days, weighted by `exp(-|Δt|/20)` × scene quality. Each recovered pixel is labelled RECONSTRUCTED and gets an uncertainty: `0.10 + 0.45·gap/window + 1.5·NDVI spread (+0.12 if single source)`. Pixels with no valid history stay missing (never fabricated). Sentinel-1 acts as a plausibility check: where |ΔVH| ≥ 3 dB the uncertainty is raised.
- **Cross-sensor physics** (`fusion/agreement.py`): `VH_dB, VV_dB ~ NDVI + NDWI + NDBI` is fitted on 131 k clear co-temporal superpixels of the AOI's own history. Four rules are scored per 80 m superpixel: vegetation (VH residual < 2.5σ), water (NDWI > 0.05 ⇒ VV < −14 dB), surface (VV residual), and change direction (ΔNDVI vs ΔVH). Raw optical is never compared with raw SAR.
- **Temporal anomaly**: |z| > 3.5 → REQUIRES VALIDATION. If S1 shows a consistent change, the label becomes **REAL EVENT CONFIRMED** (no penalty, drift and anomaly are waived). If S1 disagrees, it becomes **SUSPECTED DATA ERROR** (penalty).
- **Radiometric calibration** (`history.calibration_check`): 11.6 k pseudo-invariant targets (the most stable pixels across clear dates). If one band's gain deviates from the others by more than 4σ of natural variability, the scene is flagged. This catches sensor miscalibration that cloud masks and drift on vegetation indices both miss.
- **False Confidence Detector**: visual quality ≥ 85 but agreement < 60, HIGH drift or temporal < 60. Real data contains one natural case: **2026-01-05** looks clean but shows HIGH drift.
- **ML is evidence, not the judge**: Isolation Forest feeds the anomaly component. XGBoost (trained on the benchmark, R² 0.89) plus exact TreeSHAP (`pred_contribs`) is shown next to the score. The final decision always comes from the transparent rule-plus-weight engine.

---

## Validation (`scripts/build_benchmark.py`)

The **Synthetic Corruption Benchmark** solves the "no ground truth" problem. Known faults are injected into clean real scenes (clouds, stripe dropout, noise, NIR miscalibration, NDVI spikes, S1/S2 inconsistency), and the Trust Score is checked to fall as severity rises:

- single-fault sweeps are monotonic for all 6 fault types (Explainability page)
- 260 random multi-fault scenes: **Spearman ρ(severity, trust) = −0.77**
- XGBoost reliability model: **R² = 0.89, MAE = 5.3** (held-out 20 %)

**Downstream impact** (`terratrust/downstream.py`), RandomForest crop classifier:

| Experiment | Without TerraTrust | With TerraTrust |
|---|---|---|
| Real monsoon scene 2025-10-15 vs clear 2025-10-20 (the clear date is excluded from recovery) | 62.7 % accuracy | **77.9 %** |
| Flood mapping false alarms (cloud shadows read as water) | 1.63 km² | **0.03 km²** |
| Synthetic corrupted scene | 81 % (11.2 km² wrong) | **BLOCKED**: 0 wrong predictions shipped |

---

## API

| Method | Path | |
|---|---|---|
| POST | `/api/trust/check` | `{scene_id, profile}` → score, interval, readiness, status, components, gate rules, reasons, worst tiles. A BLOCKED result fires the webhook |
| GET | `/api/scenes` · `/api/scene/{id}` | list / full analysis |
| GET | `/api/scene/{id}/tiles` | Trust Map as GeoJSON |
| GET | `/api/scene/{id}/tile/{tile}` | "Why should I trust this tile?" |
| GET | `/api/scene/{id}/layer/{name}` | original, cloudmask, cleaned, reconstructed, recon_highlight, sar, sar_raw, sar_filtered, ndvi, ndvi_raw, uncertainty, provenance, agreement, trustmap |
| POST | `/api/inject-fault` | Data Integrity Lab: live re-scoring + carbon impact + trust-layer response (~1–2 s). Faults incl. `duplicate`, `timestamp_shift` |
| GET | `/api/anomalies` · `/api/quality/issues?scene_id=` | anomaly explorer feed · issue center for one dataset |
| GET | `/api/scene/{id}/provenance` · `/api/scene/{id}/inspect` | lineage graph (nodes + edges + hashes) · dataset inspector |
| GET | `/api/carbon/scene/{id}` · `/api/carbon/location` | indicative carbon estimate (naive vs trusted, fallback, LULC/biomass maps) · series + change |
| GET | `/api/models` · POST `/api/models/retrain` | model registry with metrics; retrain a location in the background |
| GET | `/api/passport/{id}/verify?checksum=` | verify a Trust Passport (also encoded in its QR code) |
| POST | `/api/trust/whatif` | re-score with custom weights |
| GET | `/api/timeline?aoi=` · `/api/passport/{id}` (`?format=csv`) | |
| GET/POST | `/api/review/queue` · `/api/review` | human review (SQLite) |
| GET/POST | `/api/webhook/config` · `/api/webhook/test` · `/api/alerts` | |
| GET | `/api/profiles` · `/api/config` · `/api/benchmark` · `/api/downstream` · `/api/dashboard` | |

```bash
curl -X POST localhost:8000/api/trust/check -H "Content-Type: application/json" \
     -d '{"scene_id":"DEMO-CLOUDY","profile":"flood_detection"}'
```

```python
import requests
v = requests.post("http://localhost:8000/api/trust/check",
                  json={"scene_id": "DEMO-SUSPICIOUS", "profile": "crop_monitoring"}).json()
if v["status"] != "PASS":
    print(v["status"], v["reasons"])
```

---

## Design decisions

- **AOI and tile size.** The AOI is 7.68 km (slightly above the 3–5 km brief) so the Trust Map has a readable 8 × 8 grid of 960 m tiles. Tile size is configurable.
- **Lee filter.** Lee rather than Refined Lee: RTC data is already multi-looked (ENL ≈ 4.4), and Lee is fast enough for the live lab.
- **Drift baselines.** Calibrated against the AOI's own natural seasonal drift (p90 over clear history), because raw PSI flags normal crop growth.
- **Cloud detection.** SCL is combined with an independent spectral test, so faults that SCL misses (or that are injected) are still caught.
- **Storage.** SQLite through the stdlib `sqlite3` (no ORM needed at this scale).
- **Webhook default.** With no webhook URL configured, BLOCKED alerts go to a built-in alert inbox (`/api/alerts`). Set a Slack or Teams URL in the API Console.

## Limitations

- One AOI and one year of history, so seasonal baselines are thin during the monsoon (handled by progressive windows: 45 → 90 → 150 days).
- The physics rules are empirical regressions for this AOI. A new region needs `train_models.py` to be re-run.
- Thermal and weather sensors, U-Net reconstruction, autoencoders, PDF export, federated trust and ISRO Bhuvan are roadmap items (Tier 3) and are not implemented.
- Downstream labels are NDVI-derived (active crop), not field-surveyed ground truth.
- Carbon MRV is an indicative proxy (index-based land cover, Tier-1 style biomass defaults). There are no field plots, allometry or LiDAR/GEDI; a GEDI L4A connector is on the roadmap.
- Anomaly "confidence" is a heuristic derived from signal strength (PSI, |z|, disagreement), not a calibrated probability.

See [`docs/PITCH.md`](docs/PITCH.md) for the 10-slide outline and the 3-minute demo script.
