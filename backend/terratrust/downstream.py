"""Downstream impact proof: what happens to a downstream AI model with vs. without TerraTrust.

Model: RandomForest crop/vegetation classifier (7 S2 bands) trained on the AOI's clear scenes.
Experiments (reference labels from a clear acquisition / the uncorrupted scene):
  1. REAL cloudy scene vs a clear acquisition a few days apart (reference excluded from recovery)
  2. Flood false alarms: water pixels (NDWI > 0) predicted on cloudy data vs the clear reference
  3. SYNTHETIC corruption: the corrupted demo scene vs its clean original (BLOCKED at the gate)
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestClassifier

from . import history as H
from . import pipeline as P
from .corruption.inject import FaultConfig, inject
from .ingest import cache
from .ingest.cache import S2_BANDS


def _X(bands: dict) -> np.ndarray:
    return np.stack([np.nan_to_num(bands[b], nan=0).ravel() for b in S2_BANDS], 1)


def _labels(bands: dict) -> np.ndarray:
    ndvi = (bands["B08"] - bands["B04"]) / (bands["B08"] + bands["B04"] + 1e-6)
    return (ndvi > 0.4).ravel()


def _fmt(d: str) -> str:
    return f"{d[:4]}-{d[4:6]}-{d[6:]}"


def find_pair() -> tuple[str, str] | None:
    """A partly cloudy scene with a clear acquisition close in time (the 'truth')."""
    hs = H.hist()
    dates = [str(d) for d in hs["s2_dates"]]
    clear = hs["s2_clear"].mean(1)
    best = None
    for i, d in enumerate(dates):
        if not 0.30 <= clear[i] <= 0.80:
            continue
        for j, r in enumerate(dates):
            g = abs(cache.days_between(d, r))
            if j != i and clear[j] >= 0.95 and g <= 12:
                key = abs(clear[i] - 0.5) + 0.02 * g  # prefer substantially cloudy scenes with a close clear reference
                if best is None or key < best[0]:
                    best = (key, d, r)
    return (best[1], best[2]) if best else None


def train_model(exclude: set[str]) -> RandomForestClassifier:
    hs = H.hist()
    dates = [str(d) for i, d in enumerate(hs["s2_dates"]) if hs["s2_clear"][i].mean() >= 0.95 and str(d) not in exclude]
    dates = [dates[k] for k in np.linspace(0, len(dates) - 1, min(6, len(dates))).round().astype(int)] if dates else []
    rng = np.random.default_rng(0)
    Xs, ys = [], []
    for d in dates:
        p = H.s2(d)
        v = p["masks"]["valid"].ravel()
        X, y = _X(p["refl"])[v], _labels(p["refl"])[v]
        k = rng.choice(len(X), min(20000, len(X)), replace=False)
        Xs.append(X[k]); ys.append(y[k])
    return RandomForestClassifier(n_estimators=60, max_depth=12, n_jobs=-1, random_state=0).fit(np.concatenate(Xs), np.concatenate(ys))


def run(suspicious_base: str | None = None) -> dict:
    pair = find_pair()
    rf = train_model(set(pair) if pair else set())
    out = []
    if pair:
        cloudy, clear = pair
        ref = H.s2(clear)
        y_ref = _labels(ref["refl"])
        raw = P.raw_scene(cloudy)
        res = P.analyze(raw, exclude_recovery=(clear,))
        a = res["_arrays"]
        pred_raw = rf.predict(_X(raw["refl"]))
        delivered = (a["masks"]["valid"] | a["recon"]).ravel()
        pred_tt = rf.predict(_X(a["filled"]))
        out.append({"id": "monsoon", "title": f"Cloudy scene (real, {_fmt(cloudy)})", "task": "Crop vs non-crop",
                    "without": round(100 * float((pred_raw == y_ref).mean()), 1),
                    "with": round(100 * float((pred_tt[delivered] == y_ref[delivered]).mean()), 1),
                    "coverage_with": round(100 * float(delivered.mean()), 1),
                    "errors_prevented_km2": round(max(0.0, float(((pred_raw != y_ref).sum() - (pred_tt[delivered] != y_ref[delivered]).sum()) * 1e-4)), 2),
                    "decision": res["status"], "trust": res["trust_score"], "reference": _fmt(clear)})
        ndwi = lambda b: ((b["B03"] - b["B08"]) / (b["B03"] + b["B08"] + 1e-6)).ravel()
        w_ref = ndwi(ref["refl"]) > 0.0
        w_raw = np.nan_to_num(ndwi(raw["refl"])) > 0.0
        w_tt = np.nan_to_num(ndwi(a["filled"])) > 0.0
        out.append({"id": "flood", "title": f"Flood-mapping false alarms (real, {_fmt(cloudy)})", "task": "Water detection",
                    "without": round(100 * float((w_raw == w_ref).mean()), 1),
                    "with": round(100 * float((w_tt[delivered] == w_ref[delivered]).mean()), 1),
                    "false_alarm_km2_without": round(float((w_raw & ~w_ref).sum() * 1e-4), 2),
                    "false_alarm_km2_with": round(float((w_tt & ~w_ref & delivered).sum() * 1e-4), 2),
                    "decision": res["status"], "trust": res["trust_score"], "reference": _fmt(clear)})
    if suspicious_base:
        base = P.raw_scene(suspicious_base)
        y0 = _labels(base["refl"])
        bad = inject(base, FaultConfig(dropout=0.18, noise=0.5, ndvi_spike=0.12, sar_inconsistency=0.5))
        rb = P.analyze(bad, keep_arrays=False)
        pred_bad = rf.predict(_X(bad["refl"]))
        out.append({"id": "corrupted", "title": "Corrupted scene (synthetic faults)", "task": "Crop vs non-crop",
                    "without": round(100 * float((pred_bad == y0).mean()), 1), "with": None,
                    "blocked": rb["status"] == "BLOCKED",
                    "errors_prevented_km2": round(float((pred_bad != y0).sum() * 1e-4), 2),
                    "decision": rb["status"], "trust": rb["trust_score"],
                    "note": "Scene BLOCKED at the Trust Gate: 0 wrong predictions delivered downstream."})
    total = sum(o.get("errors_prevented_km2", 0) for o in out)
    return {"model": "RandomForest (60 trees, 7 S2 bands) trained on this AOI's clear scenes",
            "label": "NDVI > 0.4 on the reference acquisition (active vegetation)", "experiments": out,
            "total_errors_prevented_km2": round(total, 2)}
