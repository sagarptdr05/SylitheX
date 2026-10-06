"""Temporal recovery: quality-weighted median composite from neighbouring acquisitions.

* Only pixels flagged cloud / shadow / missing / defective are filled.
* Every filled pixel is marked RECONSTRUCTED with an uncertainty in [0, 1] that grows with the
  temporal gap and with the disagreement (spread) between candidate observations.
* Pixels with no valid history inside the window stay MISSING (never fabricated).
* Sentinel-1 is used as a plausibility check on recovered regions, not as an optical substitute.
"""
from __future__ import annotations


import numpy as np

from ..config import thresholds
from ..ingest import cache
from .. import aoi as A
from .. import history as H


@A.aoi_cache(maxsize=8)
def _candidates(date: str, days: int, exclude: tuple[str, ...]) -> list[tuple[str, int]]:
    return [(d, cache.days_between(date, d)) for d in cache.s2_dates()
            if d != date and d not in exclude and abs(cache.days_between(date, d)) <= days]


def recover(date: str, refl: dict[str, np.ndarray], invalid: np.ndarray, s1_now: dict | None,
            exclude: tuple[str, ...] = ()) -> dict:
    """Fill `invalid` pixels of `refl` from history. Returns filled bands + lineage arrays."""
    days = int(thresholds()["recovery"]["window_days"])
    cands = _candidates(date, days, exclude)
    h, w = invalid.shape
    filled = {b: a.copy() for b, a in refl.items()}
    recon = np.zeros((h, w), bool)
    unc = np.full((h, w), np.nan, np.float32)
    src_gap = np.full((h, w), np.nan, np.float32)
    idx = np.flatnonzero(invalid)
    info = {"candidates": [{"date": d, "gap_days": g} for d, g in cands], "window_days": days,
            "s1_plausibility": None, "sources_used": []}
    if idx.size == 0 or not cands:
        return {"bands": filled, "recon": recon, "unc": unc, "gap": src_gap, "info": info}

    K = len(cands)
    vals = {b: np.full((K, idx.size), np.nan, np.float32) for b in refl}
    wts = np.zeros((K, idx.size), np.float32)
    gaps = np.zeros(K, np.float32)
    for k, (d, g) in enumerate(cands):
        p = H.s2(d)
        ok = p["masks"]["valid"].ravel()[idx]
        if not ok.any():
            continue
        q = 1.0 - 0.5 * (1 - p["masks"]["valid"].mean())         # scene-quality factor
        wts[k] = np.where(ok, np.exp(-abs(g) / 20.0) * q, 0)
        gaps[k] = abs(g)
        for b in refl:
            vals[b][k] = p["refl"][b].ravel()[idx]
        info["sources_used"].append({"date": d, "gap_days": g, "pixels": int(ok.sum())})

    tot = wts.sum(0)
    good = tot > 0
    if not good.any():
        return {"bands": filled, "recon": recon, "unc": unc, "gap": src_gap, "info": info}
    order = None
    for b in refl:
        v = np.where(wts > 0, vals[b], np.inf)
        order = np.argsort(v, axis=0)
        sw = np.take_along_axis(wts, order, 0)
        cw = np.cumsum(sw, 0)
        pick = (cw >= tot / 2).argmax(0)
        med = np.take_along_axis(np.take_along_axis(v, order, 0), pick[None], 0)[0]
        out = filled[b].ravel()
        sel = idx[good]
        out[sel] = med[good]
        filled[b] = out.reshape(h, w)

    # uncertainty: temporal gap + NDVI spread among candidates (weighted MAD)
    ndvi = (vals["B08"] - vals["B04"]) / (vals["B08"] + vals["B04"] + 1e-6)
    ndvi_med = np.nansum(np.where(wts > 0, ndvi, 0) * wts, 0) / np.maximum(tot, 1e-6)
    spread = np.nansum(np.where(wts > 0, np.abs(ndvi - ndvi_med), 0) * wts, 0) / np.maximum(tot, 1e-6)
    eff_gap = (wts * gaps[:, None]).sum(0) / np.maximum(tot, 1e-6)
    n_src = (wts > 0).sum(0)
    u = 0.10 + 0.45 * np.clip(eff_gap / days, 0, 1) + 1.5 * spread + np.where(n_src == 1, 0.12, 0)
    u = np.clip(u, 0, 1)
    flat_recon = recon.ravel(); flat_recon[idx[good]] = True
    flat_unc = unc.ravel(); flat_unc[idx[good]] = u[good]
    flat_gap = src_gap.ravel(); flat_gap[idx[good]] = eff_gap[good]

    # S1 plausibility: backscatter change between now and the effective source time must be small
    if s1_now is not None and recon.any():
        mean_gap = float(np.nanmean(src_gap[recon])) * np.sign(np.mean([g for _, g in cands]) or 1)
        ref_dates = [d for d in cache.s1_dates() if d != s1_now["date"]
                     and abs(cache.days_between(s1_now["date"], d)) <= days]
        if ref_dates:
            ref = min(ref_dates, key=lambda d: abs(abs(cache.days_between(s1_now["date"], d)) - abs(mean_gap)))
            dvh = np.abs(s1_now["VH_db"] - H.s1(ref)["VH_db"])
            ok = dvh[recon] < 3.0
            info["s1_plausibility"] = {"reference_s1": ref, "plausible_fraction": round(float(ok.mean()), 3)}
            implaus = recon & (dvh >= 3.0)
            unc[implaus] = np.clip(unc[implaus] + 0.25, 0, 1)
    return {"bands": filled, "recon": recon, "unc": unc, "gap": src_gap, "info": info}
