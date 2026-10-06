"""Load the cached, grid-aligned Sentinel-1 / Sentinel-2 time series (see scripts/download_demo_data.py)."""
from __future__ import annotations

import json
from datetime import date, datetime
import numpy as np

from .. import aoi as A

S2_BANDS = ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]


def _d(s: str) -> date:
    return datetime.strptime(s, "%Y%m%d").date()


@A.aoi_cache()
def aoi() -> dict:
    return json.loads((A.root() / "aoi.json").read_text())


@A.aoi_cache()
def s2_dates() -> list[str]:
    return sorted(p.stem[3:] for p in A.raw_dir().glob("S2_*.npz"))


@A.aoi_cache()
def s1_dates() -> list[str]:
    return sorted(p.stem[3:] for p in A.raw_dir().glob("S1_*.npz"))


@A.aoi_cache(maxsize=64)
def load_s2(d: str) -> dict:
    z = np.load(A.raw_dir() / f"S2_{d}.npz")
    out = {b: z[b] for b in S2_BANDS}
    out["SCL"] = z["SCL"]
    out["meta"] = {"cloud_cover": float(z["cloud_cover"]), "tile": str(z["tile"]), "item_id": str(z["item_id"])}
    return out


@A.aoi_cache(maxsize=64)
def load_s1(d: str) -> dict:
    z = np.load(A.raw_dir() / f"S1_{d}.npz")
    return {"VV": z["VV"], "VH": z["VH"], "meta": {"orbit": str(z["orbit"]), "item_id": str(z["item_id"])}}


def nearest_s1(d: str, max_days: int) -> tuple[str | None, int | None]:
    """Nearest Sentinel-1 acquisition to an S2 date (None if outside max_days)."""
    t = _d(d)
    best = min(s1_dates(), key=lambda x: abs((_d(x) - t).days), default=None)
    if best is None:
        return None, None
    gap = abs((_d(best) - t).days)
    return (best, gap) if gap <= max_days else (None, gap)


def days_between(a: str, b: str) -> int:
    return (_d(b) - _d(a)).days
