"""Physics-informed Sentinel-1 <-> Sentinel-2 agreement (never raw optical vs raw SAR).

Rules, evaluated on 8x8 superpixels inside each tile:
  vegetation : VH backscatter matches what NDVI predicts (volume scattering), |residual| < 2.5 sigma
  water      : optical water (NDWI > 0.05) must show low VV backscatter (< -14 dB, specular)
  surface    : VV backscatter matches NDBI/NDVI/NDWI prediction (built-up / bare surfaces)
  change     : direction of NDVI change vs VH change since the reference date agrees
"""
from __future__ import annotations

import numpy as np

from .. import history as H
from .. import tiles as T

RULE_WEIGHTS = {"vegetation": 0.40, "water": 0.20, "surface": 0.20, "change": 0.20}
SP = 8


def _tile_of_sp(shape_sp: tuple[int, int]) -> np.ndarray:
    t = T.tile_size() // SP
    ny, nx = shape_sp
    r, c = np.mgrid[0:ny, 0:nx]
    return (r // t) * (nx // t) + (c // t)


def analyze(idx: dict[str, np.ndarray], valid_opt: np.ndarray, s1: dict | None,
            ref: tuple[dict, dict] | None) -> dict:
    """idx: optical indices (recovered where possible). valid_opt: pixels with usable optical data."""
    ts = T.tile_size()
    n_tiles = (valid_opt.shape[0] // ts) * (valid_opt.shape[1] // ts)
    if s1 is None:
        return {"available": False, "score": np.full(n_tiles, np.nan), "rules": {}, "map": None}
    phys = H.physics()
    v = T.superpix(valid_opt.astype(np.float32)) > 0.7
    f = {k: T.superpix(np.where(valid_opt, idx[k], np.nan)) for k in ("NDVI", "NDWI", "NDBI")}
    vv, vh = T.superpix(s1["VV_db"]), T.superpix(s1["VH_db"])
    A = np.stack([np.ones_like(vv), f["NDVI"], f["NDWI"], f["NDBI"]], -1)
    res_vh = (vh - A @ np.array(phys["VH"]["coef"])) / phys["VH"]["sigma"]
    res_vv = (vv - A @ np.array(phys["VV"]["coef"])) / phys["VV"]["sigma"]
    tid = _tile_of_sp(vv.shape)

    ok_veg = (np.abs(res_vh) < 2.5) & v
    ok_surf = (np.abs(res_vv) < 2.5) & v
    water = (f["NDWI"] > 0.05) & v
    ok_water = water & (vv < -14)

    change_ok = change_n = None
    if ref is not None:
        r2, r1 = ref
        rv = T.superpix(r2["masks"]["valid"].astype(np.float32)) > 0.7
        d_ndvi = f["NDVI"] - T.superpix(np.where(r2["masks"]["valid"], r2["idx"]["NDVI"], np.nan))
        d_vh = vh - T.superpix(r1["VH_db"])
        sig = v & rv & (np.abs(d_ndvi) > 0.12)
        change_n = sig
        change_ok = sig & ((np.sign(d_ndvi) == np.sign(d_vh)) | (np.abs(d_vh) < 0.75))

    rules = {k: np.full(n_tiles, np.nan) for k in RULE_WEIGHTS}
    for t in range(n_tiles):
        sel = tid == t
        nv = (v & sel).sum()
        if nv >= 10:
            rules["vegetation"][t] = ok_veg[sel].sum() / nv
            rules["surface"][t] = ok_surf[sel].sum() / nv
        if (water & sel).sum() >= 4:
            rules["water"][t] = ok_water[sel].sum() / (water & sel).sum()
        if change_n is not None and (change_n & sel).sum() >= 8:
            rules["change"][t] = change_ok[sel].sum() / (change_n & sel).sum()
    num = np.zeros(n_tiles); den = np.zeros(n_tiles)
    for k, w in RULE_WEIGHTS.items():
        m = np.isfinite(rules[k])
        num[m] += w * rules[k][m]; den[m] += w
    score = np.where(den > 0, 100 * num / np.maximum(den, 1e-6), np.nan)
    # per-superpixel agreement map in [0,1] for the heatmap
    amap = np.clip(1 - (np.maximum(np.abs(res_vh), np.abs(res_vv)) - 1.5) / 2.5, 0, 1)
    amap = np.where(v, amap, np.nan)
    summary = {k: (round(float(np.nanmean(r)) * 100, 1) if np.isfinite(r).any() else None) for k, r in rules.items()}
    return {"available": True, "score": score, "rules": rules, "rules_summary": summary, "map": amap}
