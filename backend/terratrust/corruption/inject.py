"""Synthetic Corruption Lab: controlled fault injection into a clean scene.

All injected faults are SYNTHETIC and labelled as such. The same injectors generate the labelled
benchmark (severity -> expected reliability) used to validate the Trust Score and train XGBoost.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field, asdict

import numpy as np
from scipy.ndimage import gaussian_filter

CLOUD_REFL = {"B02": 0.42, "B03": 0.42, "B04": 0.43, "B05": 0.44, "B08": 0.46, "B11": 0.33, "B12": 0.24}


@dataclass
class FaultConfig:
    cloud_coverage: float = 0.0     # 0..0.9 fraction of scene
    cloud_size: float = 0.5         # 0..1 blob size
    dropout: float = 0.0            # 0..0.6 fraction of rows lost (stripe dropout)
    noise: float = 0.0              # 0..1 gaussian (optical) + speckle (SAR) level
    miscalibration: float = 0.0     # -0.5..0.5 relative gain error on B08 (NIR)
    ndvi_spike: float = 0.0         # 0..0.3 area fraction with NDVI forced to spike_value
    spike_value: float = 1.4
    sar_inconsistency: float = 0.0  # 0..0.8 area fraction with flipped/shifted SAR backscatter
    flood_event: float = 0.0        # 0..0.3 area of a SIMULATED REAL flood, consistent in S1 + S2 (not a fault)
    duplicate: float = 0.0          # 0/1 replay the pixels of another archived acquisition under this record's date
    timestamp_shift: int = 0        # -30..30 days added to the declared acquisition date (metadata corruption)
    seed: int = 42
    extra: dict = field(default_factory=dict)

    def active(self) -> list[str]:
        return [k for k in ("cloud_coverage", "dropout", "noise", "miscalibration", "ndvi_spike", "sar_inconsistency", "flood_event",
                            "duplicate", "timestamp_shift")
                if abs(getattr(self, k)) > 1e-6]


def severity(c: FaultConfig) -> dict[str, float]:
    """Ground-truth degradation severity per fault (0..1) and combined."""
    s = {
        "cloud": min(1.0, c.cloud_coverage * 1.4),
        "dropout": min(1.0, c.dropout * 2.2),
        "noise": min(1.0, c.noise),
        "miscalibration": min(1.0, abs(c.miscalibration) * 2.2),
        "ndvi_spike": min(1.0, c.ndvi_spike * 6),
        "sar_inconsistency": min(1.0, c.sar_inconsistency * 1.6),
        "duplicate": 1.0 if c.duplicate > 0 else 0.0,
        "timestamp": min(1.0, abs(c.timestamp_shift) / 5),
    }
    s["combined"] = float(1 - np.prod([1 - v for v in s.values()]))
    return s


def _blob_field(shape, coverage, size, rng) -> np.ndarray:
    h, w = shape
    sigma = 8 + 40 * size
    f = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), sigma)
    f = (f - f.mean()) / (f.std() + 1e-9)
    thr = np.quantile(f, 1 - coverage)
    return np.clip((f - thr) / 0.35 + 0.5, 0, 1)  # soft-edged opacity


def _region(shape, area, rng, kind="rect") -> np.ndarray:
    h, w = shape
    m = np.zeros(shape, bool)
    if area <= 0:
        return m
    side = int(np.sqrt(area) * h)
    if kind == "disk":
        n = 3
        r = int(np.sqrt(area * h * w / (np.pi * n)))
        yy, xx = np.mgrid[0:h, 0:w]
        for _ in range(n):
            cy, cx = rng.integers(r, h - r), rng.integers(r, w - r)
            m |= (yy - cy) ** 2 + (xx - cx) ** 2 < r * r
        return m
    y0, x0 = rng.integers(0, max(1, h - side)), rng.integers(0, max(1, w - side))
    m[y0:y0 + side, x0:x0 + side] = True
    return m


def inject(scene: dict, c: FaultConfig) -> dict:
    """Return a corrupted deep copy of a raw scene {refl, scl, s1, ...}."""
    rng = np.random.default_rng(c.seed)
    s = {**scene, "refl": {b: a.copy() for b, a in scene["refl"].items()},
         "s1": None if scene["s1"] is None else {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in scene["s1"].items()},
         "synthetic": list(scene.get("synthetic", [])), "ndvi_override": None}
    shape = s["scl"].shape
    if c.cloud_coverage > 0:
        a = _blob_field(shape, c.cloud_coverage, c.cloud_size, rng)
        sh = np.roll(np.roll(a, 28, 0), 34, 1) * (1 - a)
        for b, v in s["refl"].items():
            s["refl"][b] = (v * (1 - 0.75 * sh)) * (1 - a) + a * CLOUD_REFL[b]
        s["synthetic"].append(f"clouds {c.cloud_coverage:.0%}")
    if c.dropout > 0:
        rows = np.zeros(shape[0], bool)
        n_stripes = 6
        width = max(1, int(c.dropout * shape[0] / n_stripes))
        gap = shape[0] // n_stripes
        for k in range(n_stripes):  # evenly spaced, non-overlapping stripes with jitter
            y = k * gap + int(rng.integers(0, max(1, gap - width)))
            rows[y:y + width] = True
        for b in s["refl"]:
            s["refl"][b][rows] = np.nan
        s["synthetic"].append(f"stripe dropout {rows.mean():.0%}")
    if c.noise > 0:
        for b in s["refl"]:
            s["refl"][b] = s["refl"][b] + rng.normal(0, 0.06 * c.noise, shape).astype(np.float32)
        if s["s1"] is not None:
            L = max(0.6, 1.0 / (c.noise * 1.6))
            for k in ("VV", "VH"):
                s["s1"][k] = s["s1"][k] * rng.gamma(L, 1 / L, shape).astype(np.float32)
        s["synthetic"].append(f"noise {c.noise:.2f}")
    if abs(c.miscalibration) > 0:
        s["refl"]["B08"] = s["refl"]["B08"] * (1 + c.miscalibration)
        s["synthetic"].append(f"B08 gain error {c.miscalibration:+.0%}")
    if c.ndvi_spike > 0:
        m = _region(shape, c.ndvi_spike, rng, "disk")
        s["ndvi_override"] = (m, c.spike_value)
        s["synthetic"].append(f"NDVI spike={c.spike_value} over {m.mean():.0%}")
    if c.sar_inconsistency > 0 and s["s1"] is not None:
        m = _region(shape, c.sar_inconsistency, rng)
        for k, shift in (("VV", 3.5), ("VH", -4.0)):
            flipped = np.flip(np.flip(s["s1"][k], 0), 1)
            s["s1"][k] = np.where(m, flipped * 10 ** (shift / 10), s["s1"][k]).astype(np.float32)
        s["synthetic"].append(f"S1/S2 inconsistency over {m.mean():.0%}")
    if c.flood_event > 0:
        frng = np.random.default_rng(c.seed + 1)  # organic flood-plain shape, not a rectangle
        h, w = shape
        yy, xx = np.mgrid[0:h, 0:w]
        ell = ((yy - 0.62 * h) / (0.30 * h)) ** 2 + ((xx - 0.55 * w) / (0.36 * w)) ** 2
        fld = gaussian_filter(frng.standard_normal(shape).astype(np.float32), 18) * 40 - ell
        m = fld > np.quantile(fld, 1 - c.flood_event)
        water = {"B02": 0.055, "B03": 0.07, "B04": 0.05, "B05": 0.04, "B08": 0.03, "B11": 0.015, "B12": 0.01}
        for b, v in water.items():
            s["refl"][b] = np.where(m, v + rng.normal(0, 0.004, shape), s["refl"][b]).astype(np.float32)
        if s["s1"] is not None:  # specular reflection on open water: very low backscatter
            s["s1"]["VV"] = np.where(m, 0.008 * rng.gamma(4.4, 1 / 4.4, shape), s["s1"]["VV"]).astype(np.float32)
            s["s1"]["VH"] = np.where(m, 0.0015 * rng.gamma(4.4, 1 / 4.4, shape), s["s1"]["VH"]).astype(np.float32)
        s["synthetic"].append(f"simulated flood event over {m.mean():.0%} (consistent S1+S2)")
    if c.duplicate > 0:  # stale delivery: pixels of an earlier archived acquisition, new date on the record
        from ..history import s2 as load_s2
        from ..ingest import cache
        ds = [d for d in cache.s2_dates() if d < s["date"]] or [d for d in cache.s2_dates() if d != s["date"]]
        src = ds[-1]
        p = load_s2(src)
        s["refl"] = {b: a.copy() for b, a in p["refl"].items()}
        s["scl"] = p["scl"].copy()
        s["synthetic"].append(f"duplicate: replays acquisition {src}")
    if c.timestamp_shift:
        from datetime import date, timedelta
        d0 = date(int(s["date"][:4]), int(s["date"][4:6]), int(s["date"][6:8])) + timedelta(days=int(c.timestamp_shift))
        s["synthetic"].append(f"timestamp shifted {c.timestamp_shift:+d} d ({s['date']} -> {d0:%Y%m%d})")
        s["date"] = f"{d0:%Y%m%d}"
    s["faults"] = asdict(c)
    return s
