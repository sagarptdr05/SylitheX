"""Tier-2 ML evidence: XGBoost reliability model trained on the Synthetic Corruption Benchmark.

Target = 100 * (1 - injected severity). SHAP values come from XGBoost's exact TreeSHAP
(`pred_contribs=True`), so no extra dependency is needed. The prediction is *evidence* shown
next to the score; the hybrid rule + weighted engine still makes the decision.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from ..config import MODELS_DIR

PATH = MODELS_DIR / "xgb.json"
FEATURES = ["completeness", "cloud", "noise", "sensor_agreement", "temporal", "anomaly", "drift", "reconstruction",
            "cloud_pct", "shadow_pct", "missing_pct", "recon_pct", "unrecovered_pct", "impossible_pct",
            "drift_index", "anomalous_tiles", "noise_ratio_opt", "noise_ratio_sar", "suspected_error_tiles",
            "recon_uncertainty"]
LABELS = {"completeness": "Completeness", "cloud": "Cloud quality", "noise": "Noise quality",
          "sensor_agreement": "S1/S2 agreement", "temporal": "Temporal consistency", "anomaly": "Anomaly score",
          "drift": "Drift score", "reconstruction": "Reconstruction reliability", "cloud_pct": "Cloud %",
          "shadow_pct": "Shadow %", "missing_pct": "Missing pixels %", "recon_pct": "Reconstructed %",
          "unrecovered_pct": "Unrecoverable %", "impossible_pct": "Impossible values %", "drift_index": "Drift index",
          "anomalous_tiles": "Anomalous tiles", "noise_ratio_opt": "Optical noise ratio",
          "noise_ratio_sar": "SAR noise ratio", "suspected_error_tiles": "Suspected-error tiles",
          "recon_uncertainty": "Reconstruction uncertainty"}


def vector(summary: dict) -> np.ndarray:
    c, m = summary["components"], summary["metrics"]
    return np.array([(c[f] if c[f] is not None else 50.0) if f in c else float(m.get(f) or 0) for f in FEATURES], np.float32)


def train(X: np.ndarray, y: np.ndarray) -> dict:
    import xgboost as xgb
    n = len(X)
    rng = np.random.default_rng(0)
    idx = rng.permutation(n)
    tr, te = idx[: int(n * 0.8)], idx[int(n * 0.8):]
    model = xgb.XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9)
    model.fit(X[tr], y[tr])
    pred = model.predict(X[te])
    mae = float(np.mean(np.abs(pred - y[te])))
    r2 = float(1 - np.sum((pred - y[te]) ** 2) / np.sum((y[te] - y[te].mean()) ** 2))
    # 5-fold cross-validation for an honest generalisation estimate
    folds = np.array_split(rng.permutation(n), 5)
    cv = []
    for k in range(5):
        te_k = folds[k]; tr_k = np.concatenate([folds[j] for j in range(5) if j != k])
        mk = xgb.XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9).fit(X[tr_k], y[tr_k])
        pk = mk.predict(X[te_k])
        cv.append(1 - np.sum((pk - y[te_k]) ** 2) / np.sum((y[te_k] - y[te_k].mean()) ** 2))
    model.fit(X, y)
    model.save_model(PATH)
    load.cache_clear()
    return {"mae": round(mae, 2), "r2": round(r2, 3), "cv_r2": round(float(np.mean(cv)), 3), "cv_r2_std": round(float(np.std(cv)), 3),
            "n_train": int(len(tr)), "n_test": int(len(te))}


@lru_cache
def load():
    if not PATH.exists():
        return None
    import xgboost as xgb
    m = xgb.XGBRegressor()
    m.load_model(PATH)
    return m


def explain(summary: dict) -> dict | None:
    m = load()
    if m is None:
        return None
    import xgboost as xgb
    x = vector(summary)[None]
    contrib = m.get_booster().predict(xgb.DMatrix(x, feature_names=FEATURES), pred_contribs=True)[0]
    pred = float(np.clip(contrib.sum(), 0, 100))
    items = [{"feature": FEATURES[i], "label": LABELS[FEATURES[i]], "value": round(float(x[0, i]), 2),
              "shap": round(float(contrib[i]), 2)} for i in range(len(FEATURES))]
    items.sort(key=lambda d: -abs(d["shap"]))
    return {"reliability": round(pred, 1), "base_value": round(float(contrib[-1]), 1),
            "increasing": [d for d in items if d["shap"] > 0.05][:6],
            "decreasing": [d for d in items if d["shap"] < -0.05][:6]}
