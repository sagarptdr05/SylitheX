"""Model registry: what every model is, what it was trained on, how well it validates; retrain on demand."""
from __future__ import annotations

import json
import time

import numpy as np
from fastapi import APIRouter, HTTPException

from terratrust import aoi as A
from terratrust.build import build_async
from terratrust.config import GLOBAL_DIR, MODELS_DIR

router = APIRouter(prefix="/api", tags=["Models"])


def _mtime(p):
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(p.stat().st_mtime)) if p.exists() else None


@router.get("/models", summary="Model registry for the active location")
def models():
    root, md = A.root(), A.models_dir()
    out = []
    phys = json.loads((md / "physics.json").read_text()) if (md / "physics.json").exists() else None
    if phys:
        out.append({"id": "physics", "name": "S1↔S2 physics model", "family": "Linear regression (least squares)", "scope": "per location",
                    "purpose": "Predicts radar backscatter (VV, VH) from optical indices (NDVI, NDWI, NDBI) to test cross-sensor agreement.",
                    "trained_on": f"{phys['n_samples']:,} clear co-temporal 80 m superpixels",
                    "metrics": {"VH residual σ (dB)": round(phys['VH']['sigma'], 2), "VV residual σ (dB)": round(phys['VV']['sigma'], 2),
                                "VH ∂/∂NDVI": round(phys['VH']['coef'][1], 2)},
                    "updated": _mtime(md / "physics.json")})
    iso = md / "isoforest.pkl"
    if iso.exists():
        import pickle
        b = pickle.loads(iso.read_bytes())
        out.append({"id": "isoforest", "name": "Isolation Forest", "family": "Unsupervised anomaly detection (300 trees)", "scope": "per location",
                    "purpose": "Flags tiles whose 13-feature signature (indices, radar, texture, noise, cloud, gaps) is unlike the location's history.",
                    "trained_on": f"{b['n']:,} tiles from 12 months of acquisitions",
                    "metrics": {"features": 13, "trees": 300, "score p75": round(b['q75'], 3), "score p99.9": round(b['q999'], 3)},
                    "updated": _mtime(iso)})
    cal = md / "drift_calibration.json"
    if cal.exists():
        c = json.loads(cal.read_text())
        out.append({"id": "drift", "name": "Drift calibration", "family": "PSI · KS · Jensen–Shannon (p90 of natural drift)", "scope": "per location",
                    "purpose": "Learns how much NDVI, NDWI and VH distributions drift naturally between seasons, so only abnormal drift is penalised.",
                    "trained_on": "all clear scenes of the location",
                    "metrics": {f"{f} PSI p90": round(v['psi'], 2) for f, v in c.items()},
                    "updated": _mtime(cal)})
    pif = root / "pif.npz"
    if pif.exists():
        z = np.load(pif)
        out.append({"id": "pif", "name": "Radiometric calibration targets", "family": "Pseudo-invariant features", "scope": "per location",
                    "purpose": "The most stable pixels across clear dates. A band whose gain drifts on these targets reveals sensor miscalibration.",
                    "trained_on": f"{int(z['idx'].size):,} pseudo-invariant pixels",
                    "metrics": {f"{b} natural σ": round(float(z[f'sig_{b}']), 3) for b in ("B04", "B08", "B11")},
                    "updated": _mtime(pif)})
    bench = GLOBAL_DIR / "benchmark.json"
    if bench.exists():
        b = json.loads(bench.read_text())
        x = b["xgb"]
        out.append({"id": "xgb", "name": "XGBoost reliability + TreeSHAP", "family": "Gradient-boosted trees (300 × depth 4)", "scope": "shared by all locations",
                    "purpose": "Predicts reliability from all quality metrics and explains it with exact SHAP values. Evidence only; rules decide.",
                    "trained_on": f"{b['n']} synthetic-corruption scenes" + (f" from {len(b.get('aois', []))} locations" if b.get("aois") else ""),
                    "metrics": {"R² (hold-out)": x["r2"], "MAE": x["mae"], **({"CV R² (5-fold)": x["cv_r2"]} if "cv_r2" in x else {}),
                                "Spearman ρ trust vs severity": b["spearman"]},
                    "updated": _mtime(MODELS_DIR / "xgb.json")})
    ds = A.results_dir() / "downstream.json"
    if ds.exists():
        d = json.loads(ds.read_text())
        m = {e["title"]: f"{e['without']}% → {e['with']}%" if e.get("with") is not None else f"{e['without']}% → BLOCKED" for e in d["experiments"]}
        out.append({"id": "downstream", "name": "Downstream crop model (impact test)", "family": "Random Forest (60 trees)", "scope": "per location",
                    "purpose": "A stand-in downstream AI: how much better it performs when TerraTrust filters and repairs its input.",
                    "trained_on": "clear scenes of the location (NDVI > 0.4 labels)", "metrics": m, "updated": _mtime(ds)})
    return {"aoi": A.cur(), "status": A.status(), "models": out}


@router.post("/models/retrain", summary="Retrain every per-location model for the active location (background)")
def retrain():
    st = A.status()
    if st["state"] in ("building", "queued"):
        raise HTTPException(409, "Already training")
    build_async(A.cur(), skip_download=True)
    return A.status()
