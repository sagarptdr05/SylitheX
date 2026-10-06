# Innovation analysis: Trust Intelligence

This analysis asks one question: *if another team implements ST-03 correctly, why would a judge still choose TerraTrust?*

The answer we build toward is that TerraTrust decides whether a scene is **fit for a specific decision**, and does it in a way that shows hidden failures, follows the damage through provenance, and can be reproduced and audited. A clean/cloudy flag cannot do that.

> Positioning (deliberately not "nobody has done this"): *our contribution is the integration of fit-for-purpose requirements, silent-failure detection, provenance-based contamination tracing, data debt and reproducibility into one trust workflow on real multi-sensor data.*

## 1. Landscape (what exists and what is commoditised)

| Area | Typical tools and practices (from public knowledge) | What they do well | Where they stop |
|---|---|---|---|
| Cloud and shadow masking | Sen2Cor SCL, Fmask, s2cloudless, cloud-probability layers | Per-pixel masks | Say nothing about *non-cloud* failures or downstream fitness |
| Analysis Ready Data | CEOS-ARD, Landsat Collection-2 QA bands, Copernicus L2A | Standard corrections and QA bits | QA is per product, not per use case; there is no cross-sensor check |
| Catalogs and cloud-native EO | STAC, Planetary Computer, Earth Engine, openEO | Discovery and scalable access | Metadata says what exists, not whether it is trustworthy for a task |
| Data observability (tabular) | Great Expectations, Monte Carlo, Soda | Expectations, lineage, incidents | Not raster- or physics-aware; they don't understand radar vs optical |
| Calibration and validation | CEOS Cal/Val, pseudo-invariant calibration sites (PICS), vicarious calibration | Mission-level radiometric accuracy | Run by agencies, slow, not per-scene for end users |
| Multi-sensor fusion | SAR–optical fusion research, harmonised products | Better products | Disagreement is usually blended away instead of reported |
| Provenance | W3C PROV, STAC processing extensions, MLflow-style lineage | Records history | Rarely used to answer "which results are now contaminated?" |
| Carbon MRV and verification | Registries and dMRV platforms | Reporting workflows | Data-quality uncertainty is rarely propagated into the claim |

## 2. Market-gap map

| # | Existing capability | Existing solutions | Limitation | Hidden (second-order) problem | Our opportunity |
|---|---|---|---|---|---|
| 1 | Per-scene QA / cloud % | SCL, Fmask, ARD QA bits | One generic number | A scene fine for land-cover mapping can be unsafe for carbon MRV, and users discover this only after the model fails | **Fit-for-purpose trust and preflight**: requirement profiles per use case → GO / CONDITIONAL / NO-GO with the failing evidence |
| 2 | Visual cleanliness checks | cloud masks, eyeballing quick-looks | Clean-looking means trusted | Calibration drift and radar/optical contradictions stay inside normal value ranges and give believable but wrong results | **Silent Failure Risk**: hidden issues measured *inside the clean-looking area* |
| 3 | Gap filling / compositing | median composites | The filled pixels are not tracked downstream | If a source acquisition is later found bad, nobody knows which other scenes borrowed its pixels | **Contamination radius**: real provenance (`recovery.sources_used`) traced forward |
| 4 | Lineage graphs | PROV, catalogs | Static records | Trust does not *propagate*: a bad upstream node doesn't visibly downgrade downstream products | **Trust graph**: sensors → processing → models → decision → use cases → products, with status propagated |
| 5 | Equal-weight quality | % bad pixels | A gap over the sea counts the same as one over cropland | Severity without decision context causes wrong prioritisation | **Impact-weighted quality**: tile issues weighted by relevance to each use case (cropland, water-prone, built-up) |
| 6 | Pass/fail per run | QA flags | Every warning is forgotten after release | Reconstructed pixels, skipped reviews and unverified scenes pile up into unquantified risk | **EO Data Debt**: unresolved quality uncertainty accumulated over time, with sources and remediation |
| 7 | Anomaly detection per scene | Isolation Forest, thresholds | Each scene judged in isolation | The same tile fails again and again (a systematic local problem) and is treated as new each time | **Quality memory**: recurring hotspots with first/last seen and dominant issue |
| 8 | "Use another image" | manual search | No ranked, explained alternatives | Teams either use bad data or wait blindly | **Fallback recommender**: nearest trustworthy acquisition, a radar-only option for SAR tasks, or the reconstruction, with confidence |
| 9 | Reports and certificates | PDFs, logs | Cannot be re-derived | "Can we prove how this decision was produced?" fails in audits | **Reproducibility check**: re-run the pipeline from hashed inputs, configs and models, then compare |
| 10 | Trust as a dashboard | UIs | Other software cannot ask | Trust stays human-only and does not plug into pipelines | **Machine-readable trust API**: `/fitness`, `/preflight`, `/silent`, `/impact`, `/reproduce`, keyed per user |
| 11 | Uncertainty as a footnote | ± on products | Lost once data enters a model | Downstream numbers look exact | Partly covered: score ± interval and reconstruction σ now flow into fitness requirements (full propagation is Tier 3) |

## 3. Ranking (Impact × Novelty × Feasibility × Demo value, each 1–5)

| Opportunity | I | N | F | D | Score | Tier |
|---|---|---|---|---|---|---|
| Fit-for-purpose preflight (GO/NO-GO) | 5 | 4 | 5 | 5 | 500 | **1: build** |
| Silent Failure Risk | 5 | 4 | 5 | 5 | 500 | **1: build** |
| Contamination radius + trust graph | 5 | 5 | 4 | 5 | 500 | **2: build** |
| Data debt + quality memory | 4 | 4 | 4 | 4 | 256 | **2: build** |
| Impact-weighted quality | 4 | 3 | 4 | 4 | 192 | **2: build** |
| Fallback recommender | 4 | 3 | 5 | 4 | 240 | **2: build** |
| Reproducibility check | 4 | 3 | 5 | 4 | 240 | **2: build** |
| Trust-gated carbon MRV proxy (uncertainty from trust, PIF recalibration, gated fallback) | 5 | 4 | 4 | 5 | 400 | **2: built (indicative)** |
| Record integrity: duplicate / timestamp checks | 4 | 3 | 5 | 4 | 240 | **2: built** |
| Full uncertainty propagation into carbon tCO₂e (plots, allometry) | 5 | 4 | 2 | 3 | 120 | 3: roadmap |
| GEDI / LiDAR biomass cross-check | 5 | 4 | 2 | 4 | 160 | 3: roadmap (no GEDI in our data, not faked) |
| Pipeline regression detection | 3 | 3 | 3 | 2 | 54 | 3: roadmap |

## 4. What we built (all computed from real analysis outputs; nothing is decorative)

| Innovation | Input → method → output | Measurable value |
|---|---|---|
| **Fit-for-purpose preflight** | Scene metrics → requirement profiles (`configs/usecases.yaml`) for 6 uses (land cover, crop, flood, change detection, biomass, carbon MRV) → GO / CONDITIONAL / NO-GO, fitness score, failing checks, remediation | The same monsoon scene: GO for flood mapping (radar), NO-GO for carbon MRV, with the exact failing requirement |
| **Silent Failure Risk** | Tiles that *look* clean (cloud + shadow < 5 %, missing < 1 %, reconstructed < 5 %) → hidden signals (S1/S2 disagreement, HIGH drift, anomaly, unconfirmed temporal jump, impossible values) + scene calibration z + drift index → 0–100 risk, % of the clean area affected, tile map | Catches the NIR-miscalibration scene: visual quality 99 but silent risk HIGH |
| **Contamination radius** | `recovery.sources_used` of every scene → reverse index of "who borrowed my pixels" → affected scenes, pixel counts, their downstream use cases | When one acquisition is distrusted, every reconstruction built from it is listed |
| **Trust graph** | Sensors → masks/recovery → quality engine → models → trust score → gate → use cases → products, each node with trust and status, with upstream failures propagated | Shows visually why a decision is NO-GO |
| **Impact-weighted quality** | Tile scores weighted by use-case relevance (cropland from the clearest scene's NDVI, water-proneness from 12-month NDWI history, built-up from low vegetation) | "Issues hit 62 % of cropland but only 8 % of water-prone land" |
| **EO Data Debt + memory** | Per scene: released reconstruction × uncertainty, unreviewed WARNINGs, silent risk, missing radar cross-check, unrecovered gaps, calibration flags → debt; cumulative debt with 60-day half-life; recurring non-cloud tile issues → hotspots | The location's debt trend, its sources, recommended remediation, and persistent problem tiles |
| **Fallback recommender** | For a non-GO decision, rank nearby trustworthy acquisitions, the radar-only route (for SAR-capable tasks) or the reconstruction, with confidence = trust × time decay | Actionable next step instead of a dead end |
| **Reproducibility** | SHA-256 of raw inputs, configs and models → re-run the pipeline live → compare score, status and components | "Reproduced identically from hashed inputs" for audits |

| **Record integrity** | Reflectance fingerprints of every archived acquisition + sensing time parsed from the product ID + revisit phases → duplicate / timestamp-conflict / off-cycle checks wired into the gate | Replayed or mis-dated records are BLOCKED; 0 false positives on 160 real acquisitions |
| **Trust-gated Carbon MRV (indicative)** | Gated pixels → index-based land cover → Tier-1 style biomass × NDVI → carbon; NIR drift corrected by PIF gain; BLOCKED → nearest trusted acquisition | Integrity Lab: naive error +40.9 % vs +3.1 % with the trust layer (sensor failure); −33 % vs +2 % (NIR drift) |

Every feature is exposed through the keyed Trust API and the **Trust Intelligence** page, and appears on the Trust Passport ("Suitable for ✓ / ⚠ / ✕").

## 5. Honest limits

- The use-case requirement thresholds are **expert-set prototype profiles**, not regulatory standards. They are editable in `configs/usecases.yaml`.
- Data debt is a **defined index** (its formula is documented in code and in the UI), not a physical quantity.
- Impact relevance maps are proxies (NDVI / NDWI history), not field-surveyed crop or flood maps.
- There is no GEDI, LiDAR or thermal data in the system, so we do not claim biomass validation against LiDAR.
- The carbon numbers are an indicative proxy for showing how trust propagates into a claim. They are not certified MRV estimates.
