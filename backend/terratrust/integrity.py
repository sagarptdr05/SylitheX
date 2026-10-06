"""Record-level integrity checks: duplicate (replayed) observations and timestamp consistency.

These complement the pixel-level quality checks. They answer "is this record what it claims to be?":
  * duplicate      pixels identical to another archived acquisition (stale / replayed delivery)
  * timestamp      declared acquisition date vs the sensing time inside the product id (SAFE name)
  * revisit cycle  the declared date is on the AOI's Sentinel-2 revisit cycle (5-day constellation repeat)
  * future date    acquisitions cannot be dated after "now"
All checks are deterministic and computed from the archived products, nothing is simulated here.
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import date as Date

import numpy as np

from . import aoi as A
from .ingest import cache
from .preprocess.core import to_reflectance

_STRIDE = 24


def _fp(b04: np.ndarray, b08: np.ndarray) -> np.ndarray:
    return np.stack([b04[::_STRIDE, ::_STRIDE], b08[::_STRIDE, ::_STRIDE]]).astype(np.float32)


@A.aoi_cache()
def archive_fingerprints() -> dict[str, np.ndarray]:
    """Small reflectance fingerprints of every archived Sentinel-2 acquisition (B04 + B08 on a 24-px lattice)."""
    out = {}
    for d in cache.s2_dates():
        z = np.load(A.raw_dir() / f"S2_{d}.npz")
        out[d] = _fp(to_reflectance(z["B04"]), to_reflectance(z["B08"]))
    return out


def duplicate_of(date: str, refl: dict) -> dict | None:
    """Archived acquisition (other than `date`) whose pixels are identical to this record, if any."""
    fp = _fp(refl["B04"], refl["B08"])
    ok = np.isfinite(fp)
    if ok.mean() < 0.3:
        return None
    for d, f in archive_fingerprints().items():
        if d == date:
            continue
        both = ok & np.isfinite(f)
        if both.mean() < 0.3:
            continue
        diff = float(np.max(np.abs(fp[both] - f[both])))
        if diff < 1e-4:
            return {"date": d, "pixels_compared": int(both.sum()), "max_abs_diff": diff}
    return None


def _d(s: str) -> Date:
    return Date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def sensing_date(item_id: str | None) -> str | None:
    m = re.search(r"_(\d{8})T\d{6}_", item_id or "")
    return m.group(1) if m else None


@A.aoi_cache()
def revisit_phases() -> set[int] | None:
    """Day-number phases (mod 5) on which this tile is observed. Sentinel-2A/B/C repeat every 5 days per
    relative orbit; a tile covered by two orbits has two phases. Phases seen at least twice count as real."""
    ds = cache.s2_dates()
    if len(ds) < 4:
        return None
    c = Counter(_d(d).toordinal() % 5 for d in ds)
    return {ph for ph, n in c.items() if n >= 2}


def checks(date: str, refl: dict, meta: dict) -> tuple[list[dict], list[dict], dict]:
    """-> (metadata-style checks, gate rules, summary)."""
    out, rules = [], []
    summary: dict = {"duplicate_of": None, "timestamp_conflict": None, "off_cycle": False}

    sd = sensing_date(meta.get("item_id"))
    dup = duplicate_of(date, refl)
    if dup and dup["date"] == sd:  # the record's own product under a wrong date: a timestamp problem, not a replay
        dup = None
    if dup:
        summary["duplicate_of"] = dup["date"]
        out.append({"check": "Duplicate observation", "status": "fail",
                    "detail": f"Pixels identical to the archived acquisition of {dup['date'][:4]}-{dup['date'][4:6]}-{dup['date'][6:]} "
                              f"({dup['pixels_compared']} fingerprint pixels, max diff {dup['max_abs_diff']:.1e})"})
        rules.append({"rule": "duplicate_observation", "action": "BLOCK",
                      "message": f"Duplicate observation: this record replays the acquisition of {dup['date']}"})
    else:
        out.append({"check": "Duplicate observation", "status": "ok", "detail": "No archived acquisition has identical pixels"})

    if sd and sd != date:
        gap = abs((_d(sd) - _d(date)).days)
        summary["timestamp_conflict"] = {"declared": date, "sensing": sd, "days": gap}
        out.append({"check": "Timestamp consistency", "status": "fail",
                    "detail": f"Declared {date} but the product was sensed on {sd} ({gap} days apart)"})
        rules.append({"rule": "timestamp_conflict", "action": "BLOCK",
                      "message": f"Timestamp conflict: record dated {date}, product sensed {sd} ({gap} d). Temporal checks are unreliable."})
    else:
        out.append({"check": "Timestamp consistency", "status": "ok" if sd else "warn",
                    "detail": f"Declared date matches sensing time in {meta.get('item_id', '?')[:38]}" if sd else "No sensing time in product id"})

    if _d(date) > Date.today():
        out.append({"check": "Future timestamp", "status": "fail", "detail": f"{date} is in the future"})
        rules.append({"rule": "future_timestamp", "action": "BLOCK", "message": f"Acquisition dated in the future ({date})"})

    ph = revisit_phases()
    if ph:
        on = _d(date).toordinal() % 5 in ph
        summary["off_cycle"] = not on
        out.append({"check": "Revisit cycle", "status": "ok" if on else "warn",
                    "detail": "On the tile's 5-day Sentinel-2 revisit cycle" if on else
                              "Date is off the tile's 5-day Sentinel-2 revisit cycle (possible mislabelled timestamp)"})
    return out, rules, summary
