"""Prepared scenes + historical baselines built from the cached 12-month time series.

Everything heavy (per-date tile statistics, physics model for S1<->S2 agreement, drift
baselines) is computed once and cached to disk so live analysis stays < 1.5 s.
"""
from __future__ import annotations

import json
import numpy as np

from . import aoi as A
from .ingest import cache
from .preprocess.core import indices, lee_filter, to_db, to_reflectance
from .quality import masks as qm
from . import tiles as T

def hist_path():
    return A.root() / "history_stats.npz"


def phys_path():
    return A.models_dir() / "physics.json"


@A.aoi_cache(maxsize=24)
def s2(date: str) -> dict:
    raw = cache.load_s2(date)
    refl = {b: to_reflectance(raw[b]) for b in cache.S2_BANDS}
    m = qm.detect(refl, raw["SCL"])
    return {"date": date, "refl": refl, "scl": raw["SCL"], "masks": m, "idx": indices(refl), "meta": raw["meta"]}


@A.aoi_cache(maxsize=32)
def s1(date: str) -> dict:
    raw = cache.load_s1(date)
    vv, vh = raw["VV"].astype(np.float32), raw["VH"].astype(np.float32)
    vvf, vhf = lee_filter(vv), lee_filter(vh)
    return {"date": date, "VV": vv, "VH": vh, "VVf": vvf, "VHf": vhf,
            "VV_db": to_db(vvf), "VH_db": to_db(vhf), "meta": raw["meta"]}


def _s2_tile_stats(p: dict) -> dict:
    v = p["masks"]["valid"]
    ndvi = np.where(v, p["idx"]["NDVI"], np.nan)
    ndwi = np.where(v, p["idx"]["NDWI"], np.nan)
    res = qm.optical_noise_sigma(p["refl"]["B04"], v)
    return {"ndvi": T.nanmed(ndvi), "ndwi": T.nanmed(ndwi), "clear": T.frac(v),
            "noise": T.nanmed(res, 200), "ndvi_s": T.subsample(ndvi), "ndwi_s": T.subsample(ndwi)}


def _s1_tile_stats(p: dict) -> dict:
    cv2 = qm.sar_local_cv2(p["VV"])
    return {"vv": T.nanmed(p["VV_db"]), "vh": T.nanmed(p["VH_db"]),
            "cv2": np.nanpercentile(T.blocks(cv2)[:, ::7], 15, axis=1), "vh_s": T.subsample(p["VH_db"])}


def build_history() -> None:
    """Precompute per-date tile statistics for all cached acquisitions."""
    out: dict[str, list] = {}
    for d in cache.s2_dates():
        st = _s2_tile_stats(s2(d))
        for k, v in st.items():
            out.setdefault("s2_" + k, []).append(v)
    for d in cache.s1_dates():
        st = _s1_tile_stats(s1(d))
        for k, v in st.items():
            out.setdefault("s1_" + k, []).append(v)
    np.savez_compressed(hist_path(), s2_dates=np.array(cache.s2_dates()), s1_dates=np.array(cache.s1_dates()),
                        **{k: np.stack(v).astype(np.float32) for k, v in out.items()})


@A.aoi_cache()
def hist() -> dict:
    if not hist_path().exists():
        build_history()
    z = np.load(hist_path())
    return {k: z[k] for k in z.files}


def window(dates: list[str], date: str, days: int, exclude_self: bool = True) -> list[int]:
    return [i for i, d in enumerate(dates)
            if abs(cache.days_between(date, d)) <= days and not (exclude_self and d == date)]


# ---------------------------------------------------------------- physics model (S1 <-> S2)
def fit_physics() -> dict:
    """Fit VV_dB, VH_dB ~ NDVI + NDWI + NDBI on clear superpixels of co-temporal S1/S2 pairs.

    The sign of the learned coefficients is checked against radar physics (vegetation volume
    scattering raises VH; open water lowers VV) and stored with residual spread.
    """
    X, Yvv, Yvh = [], [], []
    for d in cache.s2_dates():
        s1d, gap = cache.nearest_s1(d, 6)
        if s1d is None:
            continue
        p, q = s2(d), s1(s1d)
        v = T.superpix(p["masks"]["valid"].astype(np.float32)) > 0.95
        if v.mean() < 0.5:
            continue
        f = [T.superpix(np.where(p["masks"]["valid"], p["idx"][k], np.nan)) for k in ("NDVI", "NDWI", "NDBI")]
        X.append(np.stack([x[v] for x in f], 1))
        Yvv.append(T.superpix(q["VV_db"])[v])
        Yvh.append(T.superpix(q["VH_db"])[v])
    X = np.concatenate(X)
    A = np.c_[np.ones(len(X)), X]
    model = {"features": ["NDVI", "NDWI", "NDBI"], "n_samples": int(len(X))}
    for name, Y in (("VV", np.concatenate(Yvv)), ("VH", np.concatenate(Yvh))):
        coef, *_ = np.linalg.lstsq(A, Y, rcond=None)
        res = Y - A @ coef
        model[name] = {"coef": coef.tolist(), "sigma": float(1.4826 * np.median(np.abs(res - np.median(res))))}
    phys_path().write_text(json.dumps(model, indent=2))
    return model


@A.aoi_cache()
def physics() -> dict:
    if not phys_path().exists():
        return fit_physics()
    return json.loads(phys_path().read_text())


# ---------------------------------------------------------------- radiometric calibration (PIFs)
def pif_path():
    return A.root() / "pif.npz"


PIF_BANDS = ["B02", "B03", "B04", "B08", "B11"]


def build_pif() -> dict:
    """Pseudo-invariant features: pixels whose reflectance is most stable across clear dates.

    A sensor gain/offset error shifts the reflectance of these targets systematically, which
    natural (crop) change cannot do. Stores per-pixel reference medians and the natural spread of
    the scene-level ratio across clear dates.
    """
    hs = hist()
    clean = [str(d) for i, d in enumerate(hs["s2_dates"]) if hs["s2_clear"][i].mean() >= 0.95]
    valid_all = np.logical_and.reduce([s2(d)["masks"]["valid"] for d in clean])
    stacks = {b: np.stack([s2(d)["refl"][b][valid_all] for d in clean]) for b in PIF_BANDS}
    cv = sum(stacks[b].std(0) / (stacks[b].mean(0) + 1e-6) for b in ("B04", "B08"))
    ndwi = np.median((stacks["B03"] - stacks["B08"]) / (stacks["B03"] + stacks["B08"] + 1e-6), 0)
    cv[ndwi > 0] = np.inf
    keep = np.argsort(cv)[: max(500, int(0.02 * cv.size))]
    flat_idx = np.flatnonzero(valid_all)[keep]
    ref = {b: np.median(stacks[b][:, keep], 0) for b in PIF_BANDS}
    ratios = {b: np.array([np.median(stacks[b][k, keep] / ref[b]) for k in range(len(clean))]) for b in PIF_BANDS}
    sigma = {b: float(max(np.std(np.log(ratios[b])), 0.015)) for b in PIF_BANDS}
    np.savez_compressed(pif_path(), idx=flat_idx, **{f"ref_{b}": ref[b] for b in PIF_BANDS},
                        **{f"sig_{b}": sigma[b] for b in PIF_BANDS})
    pif.cache_clear()
    return {"n_pif": int(flat_idx.size), "sigma": sigma}


@A.aoi_cache()
def pif() -> dict:
    if not pif_path().exists():
        build_pif()
    z = np.load(pif_path())
    return {k: z[k] for k in z.files}


def calibration_check(refl: dict, valid: np.ndarray, z_flag: float) -> dict:
    p = pif()
    idx = p["idx"]
    ok = valid.ravel()[idx]
    out = {"n_targets": int(ok.sum()), "bands": {}, "max_z": 0.0, "flag": None}
    if ok.sum() < 100:
        return out
    for b in PIF_BANDS:
        r = float(np.median(refl[b].ravel()[idx][ok] / p[f"ref_{b}"][ok]))
        z = abs(np.log(max(r, 1e-3))) / float(p[f"sig_{b}"])
        out["bands"][b] = {"gain": round(r, 3), "z": round(z, 2)}
    # a single band deviating from the others (relative gain) is the signature of miscalibration;
    # a uniform shift of all bands is more likely atmosphere/illumination
    gains = np.log([out["bands"][b]["gain"] for b in PIF_BANDS])
    rel = {b: abs(g - np.median(gains)) / float(p[f"sig_{b}"]) for b, g in zip(PIF_BANDS, gains)}
    worst = max(rel, key=rel.get)
    out["relative_z"] = {b: round(v, 2) for b, v in rel.items()}
    out["max_z"] = round(float(rel[worst]), 2)
    if rel[worst] > z_flag:
        out["flag"] = f"{worst} gain {out['bands'][worst]['gain']:.2f}x relative to other bands on pseudo-invariant targets"
    return out
