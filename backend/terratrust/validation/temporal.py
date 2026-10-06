"""Temporal anomaly detection: rolling median + robust z-score (MAD) against neighbouring dates.

A temporal anomaly is never treated as an error by itself:
    |z| > z_flag                         -> REQUIRES VALIDATION
    ... and Sentinel-1 shows a consistent change  -> REAL EVENT CONFIRMED (no penalty)
    ... and Sentinel-1 disagrees                  -> SUSPECTED DATA ERROR (penalty)
"""
from __future__ import annotations

import numpy as np

from ..config import thresholds
from .. import history as H


def analyze(date: str, ndvi_tile: np.ndarray, ndwi_tile: np.ndarray, s1_date: str | None,
            vh_tile: np.ndarray | None, vv_tile: np.ndarray | None) -> dict:
    th = thresholds()["temporal"]
    hs = H.hist()
    s2d = list(hs["s2_dates"])
    n = ndvi_tile.size
    clear = hs["s2_clear"] >= 0.3

    def robust(key: str, cur: np.ndarray, floor: float):
        base = np.full(n, np.nan, np.float32)
        scale = np.full(n, floor, np.float32)
        for t in range(n):  # per-tile progressive window: smallest window with >= 2 clear observations
            for days in (45, 90, 150):
                idx = H.window(s2d, date, days)
                vals = hs[key][idx, t][clear[idx, t]] if idx else np.array([])
                vals = vals[np.isfinite(vals)]
                if vals.size >= 2:
                    base[t] = np.median(vals)
                    scale[t] = max(1.4826 * np.median(np.abs(vals - base[t])), floor + 0.0008 * days)
                    break
        z = np.where(np.isfinite(cur) & np.isfinite(base), (cur - base) / scale, 0).astype(np.float32)
        return base, z

    base, z_ndvi = robust("s2_ndvi", ndvi_tile, 0.10)
    base_w, z_ndwi = robust("s2_ndwi", ndwi_tile, 0.08)
    # vegetation change (NDVI) or water appearing / disappearing (NDWI), whichever is stronger
    z = np.where(np.abs(z_ndwi) > np.abs(z_ndvi), z_ndwi, z_ndvi).astype(np.float32)
    dndvi = np.where(np.isfinite(base), ndvi_tile - base, np.nan)

    # Sentinel-1 change over the same window
    dvh = np.full(n, np.nan, np.float32)
    dvv = np.full(n, np.nan, np.float32)
    if s1_date is not None and vh_tile is not None:
        s1d = list(hs["s1_dates"])
        j = H.window(s1d, s1_date, 60)
        if j:
            dvh = vh_tile - np.nanmedian(hs["s1_vh"][j], 0)
            dvv = vv_tile - np.nanmedian(hs["s1_vv"][j], 0)

    status = np.array(["NORMAL"] * n, dtype=object)
    flagged = np.abs(z) > th["z_flag"]
    mind = th["s1_min_change_db"]
    for i in np.flatnonzero(flagged):
        if not np.isfinite(dvh[i]):
            status[i] = "REQUIRES VALIDATION"
            continue
        veg_ok = np.sign(dndvi[i]) == np.sign(dvh[i]) and abs(dvh[i]) >= mind
        water_ok = (ndwi_tile[i] > 0 and dvv[i] <= -mind)
        status[i] = "REAL EVENT CONFIRMED" if (veg_ok or water_ok) else "SUSPECTED DATA ERROR"

    excess = np.maximum(np.abs(z) - 1.5, 0)
    score = 100.0 / (1.0 + (excess / 2.5) ** 2)
    score = np.where(status == "REAL EVENT CONFIRMED", np.maximum(score, 92.0), score)
    score = np.where(status == "SUSPECTED DATA ERROR", np.minimum(score, 35.0), score)
    return {"z": z, "baseline_ndvi": base, "dndvi": dndvi, "dvh": dvh, "dvv": dvv,
            "status": status, "score": score.astype(np.float32)}
