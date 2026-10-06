"""Distribution drift vs. the same-season historical baseline: PSI, KS-test, Jensen-Shannon."""
from __future__ import annotations

import numpy as np

import json

from ..config import thresholds
from .. import aoi as A
from .. import history as H


def cal_path():
    return A.models_dir() / "drift_calibration.json"


@A.aoi_cache()
def calibration() -> dict | None:
    """p90 of each drift metric over clean historical tiles (natural seasonal drift level)."""
    return json.loads(cal_path().read_text()) if cal_path().exists() else None


def psi(cur: np.ndarray, ref: np.ndarray, bins: int = 10) -> float:
    q = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)))
    if q.size < 3:
        return 0.0
    q[0], q[-1] = -np.inf, np.inf
    a = np.histogram(ref, q)[0] / ref.size + 1e-4
    b = np.histogram(cur, q)[0] / cur.size + 1e-4
    return float(np.sum((b - a) * np.log(b / a)))


def ks(cur: np.ndarray, ref: np.ndarray) -> float:
    allv = np.sort(np.concatenate([cur, ref]))
    ca = np.searchsorted(np.sort(cur), allv, side="right") / cur.size
    cb = np.searchsorted(np.sort(ref), allv, side="right") / ref.size
    return float(np.max(np.abs(ca - cb)))


def js(cur: np.ndarray, ref: np.ndarray, bins: int = 20) -> float:
    lo, hi = np.percentile(np.concatenate([cur, ref]), [0.5, 99.5])
    if hi <= lo:
        return 0.0
    a = np.histogram(ref, bins, (lo, hi))[0] + 1e-6
    b = np.histogram(cur, bins, (lo, hi))[0] + 1e-6
    a, b = a / a.sum(), b / b.sum()
    m = (a + b) / 2
    return float(0.5 * np.sum(a * np.log2(a / m)) + 0.5 * np.sum(b * np.log2(b / m)))


def _baseline(date: str, key: str, dates_key: str, days: int = 60) -> np.ndarray | None:
    hs = H.hist()
    for d in (days, 120, 200):
        idx = H.window(list(hs[dates_key]), date, d)
        if idx:
            return np.concatenate([hs[key][i] for i in idx], axis=1)  # (tiles, k*len)
    return None


def analyze(date: str, s1_date: str | None, ndvi_s: np.ndarray, ndwi_s: np.ndarray,
            vh_s: np.ndarray | None) -> dict:
    """Per-tile drift. *_s are per-tile pixel subsamples (n_tiles, k) with NaN for invalid."""
    th = thresholds()["drift"]
    feats = [("NDVI", ndvi_s, _baseline(date, "s2_ndvi_s", "s2_dates")),
             ("NDWI", ndwi_s, _baseline(date, "s2_ndwi_s", "s2_dates"))]
    if vh_s is not None and s1_date is not None:
        feats.append(("VH", vh_s, _baseline(s1_date, "s1_vh_s", "s1_dates")))
    n = ndvi_s.shape[0]
    out = {f: {"psi": np.full(n, np.nan), "ks": np.full(n, np.nan), "js": np.full(n, np.nan)} for f, *_ in feats}
    for name, cur, ref in feats:
        if ref is None:
            continue
        for i in range(n):
            c, r = cur[i][np.isfinite(cur[i])], ref[i][np.isfinite(ref[i])]
            if c.size < 30 or r.size < 60:
                continue
            out[name]["psi"][i], out[name]["ks"][i], out[name]["js"][i] = psi(c, r), ks(c, r), js(c, r)
    cal = calibration()
    feat_idx = []
    for f, d in out.items():
        ref_p90 = (cal or {}).get(f, {"psi": th["psi_high"], "ks": 0.45, "js": 0.25})
        feat_idx.append(np.nanmean(np.stack([d[k] / max(ref_p90[k], 1e-3) for k in ("psi", "ks", "js")]), 0))
    feat_idx = np.nan_to_num(np.stack(feat_idx), nan=0.0)
    idx = 0.6 * feat_idx.max(0) + 0.4 * feat_idx.mean(0)  # 1.0 == upper end of natural seasonal drift
    stack_psi = np.nanmax(np.stack([out[f]["psi"] for f in out]), 0)
    stack_ks = np.nanmax(np.stack([out[f]["ks"] for f in out]), 0)
    stack_js = np.nanmax(np.stack([out[f]["js"] for f in out]), 0)
    score = 100.0 * np.clip(1.1 - 0.45 * idx, 0, 1)
    level = np.where(idx >= 1.3, "HIGH", np.where(idx >= 0.8, "MEDIUM", "LOW"))
    per_feat = {f: {m: float(np.nanmean(v)) if np.isfinite(v).any() else None for m, v in d.items()} for f, d in out.items()}
    return {"raw": out, "index": idx, "score": score, "level": level, "psi": stack_psi, "ks": stack_ks, "js": stack_js,
            "per_feature": per_feat}


def calibrate(raw_metrics: list[dict]) -> dict:
    """raw_metrics: list of analyze()['_raw'] dicts from clean scenes -> p90 per feature/metric."""
    cal = {}
    for f in ("NDVI", "NDWI", "VH"):
        cal[f] = {}
        for k in ("psi", "ks", "js"):
            v = np.concatenate([m[f][k] for m in raw_metrics if f in m])
            v = v[np.isfinite(v)]
            cal[f][k] = float(np.percentile(v, 90)) if v.size else 1.0
    cal_path().write_text(json.dumps(cal, indent=2))
    calibration.cache_clear()
    return cal
