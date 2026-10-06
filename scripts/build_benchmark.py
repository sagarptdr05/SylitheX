"""Synthetic Corruption Benchmark: labelled degradations -> (a) validate Trust Score monotonicity,
(b) train the XGBoost reliability model (Tier 2)."""
import _path  # noqa: F401
import json

import numpy as np
from scipy.stats import spearmanr

from terratrust import aoi as A
from terratrust import pipeline as P
from terratrust.config import GLOBAL_DIR
from terratrust.corruption.inject import FaultConfig, inject, severity
from terratrust.fusion import reliability as R

def clear_bases(aoi_id, k=5):
    from terratrust import history as H
    with A.use(aoi_id):
        hs = H.hist(); c = hs["s2_clear"].mean(1)
        idx = [i for i in np.argsort(-c) if c[i] >= 0.95][:k]
        return [(aoi_id, str(hs["s2_dates"][i])) for i in idx]
RANGES = {"cloud_coverage": (0.05, 0.75), "dropout": (0.03, 0.45), "noise": (0.05, 1.0),
          "miscalibration": (-0.45, 0.45), "ndvi_spike": (0.02, 0.18), "sar_inconsistency": (0.1, 0.7)}
rng = np.random.default_rng(1)
AOIS = [k for k in A.registry() if A.status(k)["state"] == "ready"]
BASES = [b for a in AOIS for b in clear_bases(a)]
print("bases:", BASES)
A.activate("nashik")  # single-fault sweeps on the reference AOI; random samples span every location

# 1. per-fault validation sweeps on the healthy demo base
curves = {}
levels = np.linspace(0, 1, 8)
for fault, (lo, hi) in RANGES.items():
    pts = []
    for lv in levels:
        if fault == "miscalibration":  # sweep the gain error magnitude 0 -> 45 % (negative)
            v = -0.45 * lv
        else:
            v = 0.0 if lv == 0 else lo + (hi - lo) * lv
        c = FaultConfig(**{fault: v}, seed=3)
        r = P.analyze(inject(P.raw_scene("20260304"), c), keep_arrays=False)
        pts.append({"level": round(float(lv), 3), "value": round(v, 3), "severity": round(severity(c)["combined"], 3),
                    "trust": r["trust_score"], "status": r["status"]})
    curves[fault] = pts
    print(fault, [p["trust"] for p in pts])

# 2. random multi-fault benchmark
X, y, rows = [], [], []
for i in range(420):
    kw = {}
    for f, (lo, hi) in RANGES.items():
        if rng.random() < 0.4:
            kw[f] = float(rng.uniform(lo, hi))
    c = FaultConfig(**kw, seed=int(rng.integers(1e6)))
    aoi_id, date = BASES[i % len(BASES)]
    with A.use(aoi_id):
        r = P.analyze(inject(P.raw_scene(date), c), keep_arrays=False)
    sev = severity(c)["combined"]
    X.append(R.vector(r)); y.append(100 * (1 - sev))
    rows.append({"severity": round(sev, 3), "trust": r["trust_score"], "status": r["status"], "faults": c.active(), "aoi": aoi_id})
    if i % 40 == 0:
        print("sample", i)
X, y = np.array(X), np.array(y)
metrics = R.train(X, y)
rho = spearmanr([r["severity"] for r in rows], [r["trust"] for r in rows]).correlation
print("xgb", metrics, "spearman(severity, trust) =", rho)
GLOBAL_DIR.mkdir(parents=True, exist_ok=True)
(GLOBAL_DIR / "benchmark.json").write_text(json.dumps({
    "curves": curves, "samples": rows, "spearman": round(float(rho), 3), "xgb": metrics, "n": len(rows), "aois": AOIS,
    "per_aoi_spearman": {a: round(float(spearmanr([r["severity"] for r in rows if r["aoi"] == a], [r["trust"] for r in rows if r["aoi"] == a]).correlation), 3) for a in AOIS}}, indent=1))
