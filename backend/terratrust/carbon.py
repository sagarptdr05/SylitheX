"""Carbon MRV (prototype): trusted EO data -> land cover -> above-ground biomass -> carbon -> verification.

IMPORTANT, and shown in the UI: this is an INDICATIVE, IPCC Tier-1 style estimate built only from Sentinel-2
spectral indices. Land cover comes from index thresholds, biomass from per-class default densities scaled by
NDVI, carbon with the IPCC default carbon fraction (0.47). There are no field plots, no LiDAR/GEDI and no
allometric models, so the numbers demonstrate how data trust propagates into a carbon claim; they are not a
certified MRV result.

Three ways of producing the same number are compared:
  naive    the raw record as delivered: every finite pixel is used (clouds, impossible values, drifted bands)
  trusted  TerraTrust output: valid + reconstructed pixels only, BLOCKED tiles and impossible values excluded,
           uncertainty widened by reconstruction and missing coverage; withheld if the scene is BLOCKED
  archive  a clear archived acquisition with its quality masks (used for the time series and as fallback)
"""
from __future__ import annotations

import numpy as np

from . import aoi as A
from . import history as H
from . import tiles as T
from .ingest import cache

PIXEL_HA = 0.01            # 10 m x 10 m
CARBON_FRACTION = 0.47     # IPCC 2006 default carbon fraction of dry matter
CO2_PER_C = 44.0 / 12.0
DEFAULT_REL_UNC = 0.30     # uncertainty of Tier-1 default biomass densities (indicative)

# id, name, colour, default above-ground biomass (t dry matter / ha), reference NDVI for in-class scaling
CLASSES = [
    (0, "Water", (37, 99, 235), 0.0, None),
    (1, "Built-up / bare soil", (148, 120, 96), 1.0, None),
    (2, "Sparse vegetation", (190, 205, 110), 12.0, 0.30),
    (3, "Cropland / grassland", (110, 190, 80), 8.0, 0.50),
    (4, "Dense vegetation / tree cover", (22, 120, 60), 95.0, 0.75),
]
METHOD = {
    "name": "Indicative IPCC Tier-1 style proxy (Sentinel-2 only)",
    "steps": [
        "Land cover from spectral indices (MNDWI water, NDVI vegetation classes, remainder built-up/bare)",
        "Above-ground biomass = class default density x clip(NDVI / class reference, 0.6, 1.4)",
        f"Carbon = biomass x {CARBON_FRACTION} (IPCC default carbon fraction); CO2e = C x 44/12",
        "Unobserved area is extrapolated from the observed mean; its share widens the uncertainty",
    ],
    "limits": "No field plots, LiDAR/GEDI or allometric models. Demonstrates trust propagation, not a certified MRV claim.",
}


def _nd(a, b):
    return (a - b) / (a + b + 1e-6)


def classify(bands: dict, ndvi: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """-> (class map int8, NDVI used). Pixels with non-finite input get class -1."""
    nd = _nd(bands["B08"], bands["B04"]) if ndvi is None else ndvi
    mndwi = _nd(bands["B03"], bands["B11"])
    c = np.full(nd.shape, 1, np.int8)
    c[nd >= 0.20] = 2
    c[nd >= 0.40] = 3
    c[nd >= 0.65] = 4
    c[(mndwi > 0.10) & (nd < 0.20)] = 0
    c[~np.isfinite(nd) | ~np.isfinite(mndwi)] = -1
    return c, nd


def biomass(cls: np.ndarray, ndvi: np.ndarray) -> np.ndarray:
    """Above-ground biomass density (t/ha) per pixel; NaN where unclassified."""
    agb = np.full(cls.shape, np.nan, np.float32)
    for k, _, _, dens, ref in CLASSES:
        m = cls == k
        if ref is None:
            agb[m] = dens
        else:
            agb[m] = dens * np.clip(np.nan_to_num(ndvi[m]) / ref, 0.6, 1.4)
    return agb


def _summarise(cls: np.ndarray, agb: np.ndarray, use: np.ndarray, extra_rel_unc: float = 0.0) -> dict:
    total_px = cls.size
    used = use & np.isfinite(agb)
    n = int(used.sum())
    if n == 0:
        return {"available": False}
    mean_agb = float(agb[used].mean())
    area_ha = total_px * PIXEL_HA
    agb_t = mean_agb * area_ha
    c_t = agb_t * CARBON_FRACTION
    co2 = c_t * CO2_PER_C
    observed = n / total_px
    rel = float(np.sqrt(DEFAULT_REL_UNC ** 2 + extra_rel_unc ** 2 + (0.5 * (1 - observed)) ** 2))
    cover = []
    for k, name, col, dens, _ in CLASSES:
        m = used & (cls == k)
        cover.append({"id": k, "name": name, "color": "#%02x%02x%02x" % col, "pct": round(100 * float(m.sum()) / n, 2),
                      "area_ha": round(float(m.sum()) / n * area_ha, 1),
                      "agb_t": round(float(agb[m].sum()) / n * total_px * PIXEL_HA, 0)})
    return {"available": True, "area_ha": round(area_ha, 1), "observed_pct": round(100 * observed, 1),
            "agb_t_ha": round(mean_agb, 2), "agb_t": round(agb_t), "carbon_t": round(c_t), "co2e_t": round(co2),
            "co2e_t_ha": round(co2 / area_ha, 2), "uncertainty_pct": round(100 * rel, 1),
            "co2e_interval": [round(co2 * (1 - rel)), round(co2 * (1 + rel))], "cover": cover}


def naive(raw: dict) -> dict:
    """What an untrusted pipeline would report from the record as delivered."""
    bands = raw["refl"]
    ndvi = _nd(bands["B08"], bands["B04"])
    if raw.get("ndvi_override"):
        mk, val = raw["ndvi_override"]
        ndvi = np.where(mk, val, ndvi)
    cls, nd = classify(bands, ndvi)
    out = _summarise(cls, biomass(cls, nd), cls >= 0)
    out["mode"] = "naive"
    out["note"] = "Every finite pixel used as delivered: clouds, impossible values and drifted bands included"
    return out


def trusted(res: dict) -> dict:
    """TerraTrust-gated estimate from an analysis result that kept its arrays."""
    a = res["_arrays"]
    bands = a["filled"]
    ndvi = a["ndvi"]
    recal = None
    cal = res["drift"]["calibration"]
    if cal.get("flag") and cal.get("relative_z"):
        # radiometric drift: correct the deviating band with its relative gain on pseudo-invariant targets
        worst = max(cal["relative_z"], key=cal["relative_z"].get)
        logs = {b: np.log(v["gain"]) for b, v in cal["bands"].items()}
        rel_gain = float(np.exp(logs[worst] - np.median(list(logs.values()))))
        bands = {**bands, worst: bands[worst] / rel_gain}
        fresh = _nd(bands["B08"], bands["B04"])
        ndvi = np.where(np.abs(np.nan_to_num(ndvi)) > 1.0, ndvi, fresh)
        recal = {"band": worst, "relative_gain": round(rel_gain, 3),
                 "note": f"{worst} divided by its {rel_gain:.2f}x relative gain on pseudo-invariant targets"}
    cls, nd = classify(bands, ndvi)
    use = (a["masks"]["valid"] | a["recon"]) & (np.abs(np.nan_to_num(nd)) <= 1.0) & (cls >= 0)
    blocked = np.array([t["status"] == "BLOCKED" for t in res["tiles"]])
    if blocked.any():
        t = T.tile_size()
        g = cls.shape[0] // t
        use &= ~np.kron(blocked.reshape(g, g), np.ones((t, t), bool)).astype(bool)[:cls.shape[0], :cls.shape[1]]
    recon_share = float((a["recon"] & use).sum()) / max(1, int(use.sum()))
    extra = recon_share * float(res["metrics"].get("recon_uncertainty") or 0.3) + (100 - res["trust_score"]) / 100 * 0.15
    out = _summarise(cls, biomass(cls, nd), use, extra)
    kept = [t["score"] for t in res["tiles"] if t["status"] != "BLOCKED"]
    out.update({"mode": "trusted", "status": res["status"], "trust_score": res["trust_score"],
                "tiles_excluded": int(blocked.sum()), "tiles_total": len(res["tiles"]),
                "delivered_trust": round(float(np.mean(kept)), 1) if kept else None,
                "recon_share_pct": round(100 * recon_share, 1),
                "withheld": res["status"] == "BLOCKED", "recalibration": recal,
                "note": "Valid + reconstructed pixels only; BLOCKED tiles and impossible values excluded"})
    return out, cls, nd


def lulc_image(cls: np.ndarray) -> np.ndarray:
    img = np.zeros((*cls.shape, 4), np.uint8)
    for k, _, col, _, _ in CLASSES:
        img[cls == k] = (*col, 255)
    return img


def biomass_image(cls: np.ndarray, agb: np.ndarray) -> np.ndarray:
    x = np.clip(np.nan_to_num(np.log1p(agb)) / np.log1p(130), 0, 1)
    stops = np.array([[247, 252, 185], [173, 221, 142], [65, 171, 93], [0, 104, 55], [0, 60, 30]], np.float32)
    pos = x * (len(stops) - 1)
    i = np.clip(pos.astype(int), 0, len(stops) - 2)
    f = (pos - i)[..., None]
    rgb = stops[i] * (1 - f) + stops[i + 1] * f
    img = np.concatenate([rgb.astype(np.uint8), np.where(cls[..., None] >= 0, 255, 0).astype(np.uint8)], -1)
    return img


@A.aoi_cache(maxsize=64)
def archive(date: str) -> dict:
    """Estimate from an archived acquisition using its own quality masks (no reconstruction)."""
    p = H.s2(date)
    cls, nd = classify(p["refl"])
    use = p["masks"]["valid"] & (cls >= 0)
    out = _summarise(cls, biomass(cls, nd), use)
    out.update({"mode": "archive", "date": date})
    return out


@A.aoi_cache()
def series(min_clear: float = 0.85) -> list[dict]:
    hs = H.hist()
    out = []
    for i, d in enumerate(hs["s2_dates"]):
        d = str(d)
        clear = float(hs["s2_clear"][i].mean())
        if clear < min_clear:
            continue
        e = archive(d)
        if e.get("available"):
            out.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "raw_date": d, "co2e_t": e["co2e_t"], "lo": e["co2e_interval"][0],
                        "hi": e["co2e_interval"][1], "agb_t_ha": e["agb_t_ha"], "clear_pct": round(100 * clear, 1),
                        "dense_pct": e["cover"][4]["pct"], "crop_pct": e["cover"][3]["pct"]})
    return out


@A.aoi_cache()
def change() -> dict | None:
    """Land-cover transitions between the first and last clear acquisitions in the same season (±45 days of year)."""
    s = series()
    if len(s) < 2:
        return None
    a = s[0]
    days = lambda x, y: int((np.datetime64(y) - np.datetime64(x)).astype(int))
    # prefer an acquisition about one year later (same season, so crop phenology does not dominate the change)
    same = [x for x in s[1:] if 300 <= days(a["date"], x["date"]) <= 430]
    b = min(same, key=lambda x: abs(days(a["date"], x["date"]) - 365)) if same else s[-1]
    pa, pb = H.s2(a["raw_date"]), H.s2(b["raw_date"])
    ca, _ = classify(pa["refl"])
    cb, _ = classify(pb["refl"])
    ok = pa["masks"]["valid"] & pb["masks"]["valid"] & (ca >= 0) & (cb >= 0)
    names = {k: n for k, n, *_ in CLASSES}
    trans = []
    for i in range(5):
        for j in range(5):
            if i == j:
                continue
            n = int((ok & (ca == i) & (cb == j)).sum())
            if n * PIXEL_HA >= 1:
                trans.append({"from": names[i], "to": names[j], "area_ha": round(n * PIXEL_HA, 1)})
    trans.sort(key=lambda t: -t["area_ha"])
    changed = ok & (ca != cb)
    return {"from": a["date"], "to": b["date"], "same_season": bool(same), "compared_pct": round(100 * float(ok.mean()), 1),
            "changed_pct": round(100 * float(changed.sum()) / max(1, int(ok.sum())), 1),
            "loss_dense_ha": round(float((ok & (ca == 4) & (cb != 4)).sum()) * PIXEL_HA, 1),
            "gain_dense_ha": round(float((ok & (ca != 4) & (cb == 4)).sum()) * PIXEL_HA, 1),
            "co2e_delta_t": b["co2e_t"] - a["co2e_t"], "transitions": trans[:8]}


def nearest_trusted(date: str, statuses: dict[str, str], exclude: set[str] = frozenset()) -> str | None:
    """Closest real acquisition (by date) whose gate decision was PASS."""
    best = None
    for d, st in statuses.items():
        if st != "PASS" or d in exclude or d == date:
            continue
        g = abs(cache.days_between(d, date))
        if best is None or g < best[0]:
            best = (g, d)
    return best[1] if best else None
