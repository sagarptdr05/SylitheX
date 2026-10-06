"""Isolation Forest anomaly scoring on per-tile feature vectors (+ top contributing features)."""
from __future__ import annotations

import pickle

import numpy as np
from sklearn.ensemble import IsolationForest

from .. import aoi as A

FEATURES = ["ndvi_mean", "ndvi_std", "ndwi_mean", "ndbi_mean", "vv_db", "vh_db", "vv_vh_ratio",
            "sar_texture", "optical_noise", "cloud_pct", "missing_pct", "recon_pct", "temporal_change"]
def path():
    return A.models_dir() / "isoforest.pkl"


def train(X: np.ndarray) -> dict:
    X = np.nan_to_num(X, nan=0.0)
    m = IsolationForest(n_estimators=300, contamination="auto", random_state=7).fit(X)
    s = -m.score_samples(X)
    med = np.median(X, 0)
    mad = np.median(np.abs(X - med), 0) * 1.4826 + 1e-3
    bundle = {"model": m, "q75": float(np.quantile(s, 0.75)), "q999": float(np.quantile(s, 0.999)),
              "med": med, "mad": mad, "n": int(len(X))}
    path().write_bytes(pickle.dumps(bundle))
    load.cache_clear()
    return bundle


@A.aoi_cache()
def load() -> dict | None:
    return pickle.loads(path().read_bytes()) if path().exists() else None


def score(X: np.ndarray, impossible_frac: np.ndarray) -> dict:
    b = load()
    n = X.shape[0]
    if b is None:
        sev = np.zeros(n)
        top = [[] for _ in range(n)]
    else:
        Xn = np.nan_to_num(X, nan=0.0)
        s = -b["model"].score_samples(Xn)
        sev = np.clip((s - b["q75"]) / (b["q999"] - b["q75"] + 1e-6), 0, 2) / 2
        z = (Xn - b["med"]) / b["mad"]
        top = [[{"feature": FEATURES[j], "z": round(float(z[i, j]), 2)} for j in np.argsort(-np.abs(z[i]))[:3]]
               for i in range(n)]
    sev = np.maximum(sev, np.clip(impossible_frac * 8, 0, 1))  # physically impossible values
    sc = 100 * (1 - sev)
    level = np.where(sev >= 0.5, "HIGH", np.where(sev >= 0.2, "MEDIUM", "LOW"))
    return {"severity": sev, "score": sc, "level": level, "top": top}
