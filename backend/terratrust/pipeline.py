"""End-to-end TerraTrust pipeline:

Ingest -> Preprocess -> Quality -> Recovery -> Validation (anomaly / temporal / drift)
       -> Cross-sensor agreement -> Trust Score engine -> Gate -> Explanation
"""
from __future__ import annotations

import time
import warnings
from typing import Any

import numpy as np
from rasterio.warp import transform as warp_transform

from . import aoi as AOI
from . import history as H
from . import integrity as IG
from . import tiles as T
from .config import COMPONENTS, profiles, thresholds
from .explain import reasons as X
from .fusion import agreement as F
from .ingest import cache
from .ingest.stac import validate_metadata
from .lineage.provenance import chain, provenance
from .preprocess.core import indices, lee_filter, to_db
from .quality import masks as qm
from .recovery.temporal import recover
from .trust import engine as E
from .validation import anomaly as A
from .validation import drift as D
from .validation import temporal as TP

warnings.filterwarnings("ignore", category=RuntimeWarning)


# ------------------------------------------------------------------ scene construction
def raw_scene(date: str) -> dict:
    """Original (never overwritten) S2 scene + matched S1 acquisition."""
    p = H.s2(date)
    s1d, gap = cache.nearest_s1(date, int(thresholds()["s1_match_days"]))
    s1 = None
    if s1d:
        q = H.s1(s1d)
        s1 = {"date": s1d, "VV": q["VV"], "VH": q["VH"]}
    return {"date": date, "refl": p["refl"], "scl": p["scl"], "s1": s1, "s1_gap": gap, "meta": p["meta"],
            "synthetic": [], "ndvi_override": None}


def _prep_s1(s1: dict | None, pristine: bool) -> dict | None:
    if s1 is None:
        return None
    if pristine:
        return H.s1(s1["date"])
    vvf, vhf = lee_filter(s1["VV"]), lee_filter(s1["VH"])
    return {"date": s1["date"], "VV": s1["VV"], "VH": s1["VH"], "VVf": vvf, "VHf": vhf,
            "VV_db": to_db(vvf), "VH_db": to_db(vhf)}


@AOI.aoi_cache(maxsize=64)
def _reference_pair(date: str) -> tuple[str, str] | None:
    """Clear S2 date (+ co-temporal S1) used as the reference for change agreement."""
    hs = H.hist()
    best = None
    for i, d in enumerate(hs["s2_dates"]):
        d = str(d)
        g = cache.days_between(d, date)
        if d == date or not (10 <= abs(g) <= 75) or hs["s2_clear"][i].mean() < 0.85:
            continue
        s1d, _ = cache.nearest_s1(d, 7)
        if s1d and (best is None or abs(g) < best[0]):
            best = (abs(g), d, s1d)
    return (best[1], best[2]) if best else None


@AOI.aoi_cache()
def tile_geometry() -> list[dict]:
    a = cache.aoi()
    t = T.tile_size()
    x0, res, y0 = a["transform"][2], a["transform"][0], a["transform"][5]
    n = a["grid"] // t
    out = []
    for r in range(n):
        for c in range(n):
            xs = [x0 + c * t * res, x0 + (c + 1) * t * res]
            ys = [y0 - r * t * res, y0 - (r + 1) * t * res]
            lon, lat = warp_transform(a["crs"], "EPSG:4326", [xs[0], xs[1], xs[1], xs[0]], [ys[0], ys[0], ys[1], ys[1]])
            out.append({"id": f"T{r}{c}", "row": r, "col": c,
                        "polygon": [[round(lo, 6), round(la, 6)] for lo, la in zip(lon, lat)]})
    return out


@AOI.aoi_cache()
def _noise_baselines() -> tuple[np.ndarray, np.ndarray]:
    hs = H.hist()
    opt = np.where(hs["s2_clear"] >= 0.5, hs["s2_noise"], np.nan)
    return np.nanmedian(opt, 0), np.nanmedian(hs["s1_cv2"], 0)


# ------------------------------------------------------------------ analysis
def analyze(raw: dict, profile: str = "crop_monitoring", exclude_recovery: tuple[str, ...] = (),
            keep_arrays: bool = True) -> dict[str, Any]:
    t0 = time.perf_counter()
    th = thresholds()
    date = raw["date"]
    pristine = not raw["synthetic"]
    refl, scl = raw["refl"], raw["scl"]

    # 1. quality masks -----------------------------------------------------------
    m = qm.detect(refl, scl)
    invalid = ~m["valid"]
    idx = indices(refl)
    if raw.get("ndvi_override"):
        mk, val = raw["ndvi_override"]
        idx["NDVI"] = np.where(mk, val, idx["NDVI"])
    s1p = _prep_s1(raw["s1"], pristine)

    # 2. temporal recovery --------------------------------------------------------
    rec = recover(date, refl, invalid, s1p, exclude=exclude_recovery)
    idx_r = indices(rec["bands"])
    if raw.get("ndvi_override"):
        mk, val = raw["ndvi_override"]
        idx_r["NDVI"] = np.where(mk & ~rec["recon"], val, idx_r["NDVI"])
    valid_opt = m["valid"] | rec["recon"]
    unrecovered = invalid & ~rec["recon"]

    # 3. tile quality metrics ------------------------------------------------------
    cloud_f, shadow_f = T.frac(m["cloud"]), T.frac(m["shadow"])
    missing_f = T.frac(m["missing"] | m["defective"])
    recon_f, unrec_f = T.frac(rec["recon"]), T.frac(unrecovered)
    impossible = (np.abs(idx["NDVI"]) > 1.0) & ~m["missing"]
    impossible_f = T.frac(impossible)

    opt_base, sar_base = _noise_baselines()
    res = qm.optical_noise_sigma(refl["B04"], m["valid"])
    opt_sigma = T.nanmed(res, 200)
    ratio_opt = np.nan_to_num(opt_sigma / opt_base, nan=1.0)
    if s1p is not None:
        cv2 = qm.sar_local_cv2(s1p["VV"])
        ratio_sar = np.nanpercentile(T.blocks(cv2)[:, ::7], 15, axis=1) / sar_base
        noise_c = 0.5 * qm.noise_score(ratio_opt) + 0.5 * qm.noise_score(ratio_sar)
    else:
        ratio_sar = np.full_like(ratio_opt, np.nan)
        noise_c = qm.noise_score(ratio_opt)

    ndvi_v = np.where(valid_opt, idx_r["NDVI"], np.nan)
    ndwi_v = np.where(valid_opt, idx_r["NDWI"], np.nan)
    ndbi_v = np.where(valid_opt, idx_r["NDBI"], np.nan)
    ndvi_t, ndwi_t = T.nanmed(ndvi_v), T.nanmed(ndwi_v)
    vh_t = T.nanmed(s1p["VH_db"]) if s1p else None
    vv_t = T.nanmed(s1p["VV_db"]) if s1p else None

    # 4. validation ---------------------------------------------------------------
    tmp = TP.analyze(date, ndvi_t, ndwi_t, s1p["date"] if s1p else None, vh_t, vv_t)
    dr = D.analyze(date, s1p["date"] if s1p else None, T.subsample(ndvi_v), T.subsample(ndwi_v),
                   T.subsample(s1p["VH_db"]) if s1p else None)
    cal = H.calibration_check(refl, m["valid"], float(th["calibration"]["z_flag"]))
    if cal["max_z"] > 2.0:  # systematic sensor drift lowers the drift component everywhere
        cal_score = 100.0 / (1.0 + ((cal["max_z"] - 2.0) / 4.0) ** 2)
        dr["score"] = np.minimum(dr["score"], cal_score)
        if cal["flag"]:
            dr["index"] = np.maximum(dr["index"], 1.3)
            dr["level"] = np.full(dr["level"].shape, "HIGH", dtype=object)
    ref = _reference_pair(date)
    fu = F.analyze(idx_r, valid_opt, s1p, (H.s2(ref[0]), H.s1(ref[1])) if (ref and s1p) else None)

    n = len(cloud_f)
    feats = np.stack([
        ndvi_t, T.nanstd(ndvi_v), ndwi_t, T.nanmed(ndbi_v),
        vv_t if s1p else np.zeros(n), vh_t if s1p else np.zeros(n),
        (vv_t - vh_t) if s1p else np.zeros(n),
        T.nanstd(s1p["VV_db"]) if s1p else np.zeros(n),
        ratio_opt, cloud_f * 100, missing_f * 100, recon_f * 100, np.nan_to_num(np.abs(tmp["dndvi"]))], 1)
    if not s1p and A.load() is not None:  # no SAR: use typical values so missing radar is not "anomalous"
        feats[:, 4:8] = A.load()["med"][4:8]
    an = A.score(feats, impossible_f)

    # 5. components (0..100, higher = more trustworthy) ----------------------------
    recon_unc_t = T.nanmean(np.where(rec["recon"], rec["unc"], np.nan), 1)
    # reliability of reconstructed pixels, weighted by how much of the tile was reconstructed
    recon_rel = 100 - 100 * np.nan_to_num(recon_unc_t, nan=0.5) * np.clip(recon_f / 0.05, 0, 1)
    comp_t = {
        "completeness": 100 * (1 - missing_f),
        "cloud": 100 * np.clip(1 - (cloud_f + 0.7 * shadow_f), 0, 1),
        "noise": noise_c,
        "sensor_agreement": fu["score"] if fu["available"] else np.full(n, np.nan),
        "temporal": tmp["score"],
        "anomaly": an["score"],
        "drift": dr["score"],
        "reconstruction": recon_rel,
    }
    if fu["available"]:  # tiles without usable optical data: neutral 50 (unverifiable)
        comp_t["sensor_agreement"] = np.where(np.isfinite(fu["score"]), fu["score"], 50.0)
    suspected = tmp["status"] == "SUSPECTED DATA ERROR"
    event = tmp["status"] == "REAL EVENT CONFIRMED"
    if event.any():  # distribution shift / outlier explained by a multi-sensor confirmed event: not a data fault
        comp_t["drift"] = np.where(event, np.maximum(comp_t["drift"], 85.0), comp_t["drift"])
        comp_t["anomaly"] = np.where(event, np.maximum(comp_t["anomaly"], 85.0), comp_t["anomaly"])
        an["severity"] = np.where(event, np.minimum(an["severity"], 0.15), an["severity"])
        an["level"] = np.where(event, "LOW", an["level"])
        dr["level"] = np.where(event, "LOW", dr["level"])
        dr["index"] = np.where(event, np.minimum(dr["index"], 0.5), dr["index"])
    crit = E.critical_penalty(impossible_f, suspected, comp_t["sensor_agreement"], comp_t["noise"], an["severity"])
    if cal["flag"]:  # systematic radiometric error corrupts every derived index
        crit = crit * float(np.clip(1 - 0.03 * (cal["max_z"] - 4.0), 0.6, 1.0))
    tile_s = E.tile_scores(comp_t, recon_f, crit)
    trust = E.aggregate(tile_s)

    comp = {k: (None if not np.isfinite(v).any() else round(float(np.nanmean(v)), 1)) for k, v in comp_t.items()}
    drift_idx = float(np.mean(dr["index"]))
    drift_level = "HIGH" if drift_idx >= 1.3 else ("MEDIUM" if drift_idx >= 0.8 else "LOW")
    sev = an["severity"]
    anomaly_level = "HIGH" if (np.mean(sev >= 0.5) >= 0.1 or sev.mean() >= 0.5) else (
        "MEDIUM" if np.mean(sev >= 0.2) >= 0.1 else "LOW")
    has_s1 = s1p is not None
    metrics = {
        "cloud_pct": round(100 * float(m["cloud"].mean()), 2),
        "shadow_pct": round(100 * float(m["shadow"].mean()), 2),
        "missing_pct": round(100 * float((m["missing"] | m["defective"]).mean()), 2),
        "recon_pct": round(100 * float(rec["recon"].mean()), 2),
        "unrecovered_pct": round(100 * float(unrecovered.mean()), 2),
        "valid_pct": round(100 * float(m["valid"].mean()), 2),
        "impossible_pct": round(100 * float(impossible.mean()), 3),
        "agreement": comp["sensor_agreement"],
        "drift_level": drift_level, "drift_index": round(drift_idx, 3),
        "psi": round(float(np.nanmean(dr["psi"])), 3), "ks": round(float(np.nanmean(dr["ks"])), 3),
        "js": round(float(np.nanmean(dr["js"])), 3),
        "anomaly_level": anomaly_level, "anomalous_tiles": int((sev >= 0.2).sum()),
        "noise_label": qm.noise_label(comp["noise"]),
        "noise_ratio_opt": round(float(np.median(ratio_opt)), 2),
        "noise_ratio_sar": round(float(np.nanmedian(ratio_sar)), 2) if has_s1 else 0.0,
        "suspected_error_tiles": int(suspected.sum()),
        "real_event_tiles": int((tmp["status"] == "REAL EVENT CONFIRMED").sum()),
        "requires_validation_tiles": int((tmp["status"] == "REQUIRES VALIDATION").sum()),
        "calibration_flag": cal["flag"], "calibration_max_z": cal["max_z"],
        "recon_uncertainty": round(float(np.nanmean(rec["unc"])) if rec["recon"].any() else 0.0, 3),
        "recovery_window": int(th["recovery"]["window_days"]),
        "components": comp,
    }

    # 6. gate --------------------------------------------------------------------
    rules = E.gate_rules(metrics)
    integ_checks, integ_rules, integ = IG.checks(date, refl, raw["meta"])
    rules += integ_rules
    metrics["duplicate_of"] = integ["duplicate_of"]
    metrics["timestamp_conflict"] = integ["timestamp_conflict"]
    status = E.apply_gates(E.status_from_score(trust), rules)
    hw = E.uncertainty(tile_s, comp_t, recon_f, crit, metrics["recon_uncertainty"], has_s1)
    readiness = {p: round(E.ai_readiness(comp_t, recon_f, crit, p, has_s1), 1) for p in profiles()}
    fc = X.false_confidence(comp, drift_level)
    if fc["detected"]:  # looks clean but hidden inconsistencies: never auto-release, send to a human
        rules.append({"rule": "false_confidence", "action": "CAP_WARNING",
                      "message": "False confidence: clean-looking scene with hidden inconsistencies (" + ", ".join(fc["triggers"]) + ")"})
        status = E.apply_gates(status, rules)

    base_mean = float(np.mean(E.weighted_base(comp_t, E.weights())))
    crit_mean = float(np.mean(E.weighted_base(comp_t, E.weights()) * crit))
    rpen = float(np.mean(E.reconstruction_penalty(recon_f)))
    penalties = {"Critical penalties": base_mean - crit_mean, "Reconstruction penalty": rpen,
                 "Worst-tile penalty": float(np.mean(tile_s)) - trust}
    expl = X.reasons(metrics)

    # 7. per-tile records ------------------------------------------------------------
    geom = tile_geometry()
    tiles = []
    for i in range(n):
        ts = float(tile_s[i])
        reasons_t = []
        if cloud_f[i] > 0.05: reasons_t.append(f"Cloud {cloud_f[i]:.0%}, shadow {shadow_f[i]:.0%}")
        if missing_f[i] > 0.01: reasons_t.append(f"Missing pixels {missing_f[i]:.0%}")
        if recon_f[i] > 0.01: reasons_t.append(f"Reconstructed {recon_f[i]:.0%} (uncertainty {np.nan_to_num(recon_unc_t[i]):.2f})")
        if comp_t["sensor_agreement"][i] < 60: reasons_t.append(f"Low S1/S2 agreement ({comp_t['sensor_agreement'][i]:.0f}%)")
        if dr["level"][i] != "LOW": reasons_t.append(f"{dr['level'][i]} drift (PSI {np.nan_to_num(dr['psi'][i]):.2f})")
        if an["level"][i] != "LOW": reasons_t.append(f"{an['level'][i]} anomaly: " + ", ".join(t["feature"] for t in an["top"][i][:2]))
        if tmp["status"][i] != "NORMAL": reasons_t.append(f"Temporal: {tmp['status'][i]} (z={tmp['z'][i]:.1f})")
        if impossible_f[i] > 0: reasons_t.append(f"Impossible NDVI in {impossible_f[i]:.0%} of tile")
        if comp_t["noise"][i] < 70: reasons_t.append(f"Elevated noise (quality {comp_t['noise'][i]:.0f})")
        if not reasons_t: reasons_t.append("Clean, consistent observation")
        tiles.append({
            **geom[i], "score": round(ts, 1), "status": E.status_from_score(ts),
            "cloud": round(100 * float(cloud_f[i]), 1), "shadow": round(100 * float(shadow_f[i]), 1),
            "missing": round(100 * float(missing_f[i]), 1), "reconstructed": round(100 * float(recon_f[i]), 1),
            "sensor_agreement": round(float(comp_t["sensor_agreement"][i]), 1) if has_s1 else None,
            "drift": dr["level"][i], "drift_psi": round(float(np.nan_to_num(dr["psi"][i])), 3),
            "anomaly": an["level"][i], "anomaly_top": an["top"][i],
            "temporal_status": tmp["status"][i], "temporal_z": round(float(tmp["z"][i]), 2),
            "ndvi": None if not np.isfinite(ndvi_t[i]) else round(float(ndvi_t[i]), 3),
            "components": {k: (None if not np.isfinite(v[i]) else round(float(v[i]), 1)) for k, v in comp_t.items()},
            "critical_penalty": round(float(crit[i]), 4), "recon_ratio": round(float(recon_f[i]), 4),
            "reasons": reasons_t,
        })
    worst = sorted(tiles, key=lambda t: t["score"])[:5]

    result = {
        "scene_id": scene_id(date, raw.get("synthetic")), "date": date, "profile": profile,
        "trust_score": round(trust, 1), "trust_uncertainty": hw,
        "trust_interval": [round(max(0, trust - hw), 1), round(min(100, trust + hw), 1)],
        "ai_readiness": readiness[profile], "ai_readiness_all": readiness,
        "readiness_status": E.status_from_score(readiness[profile]),
        "status": status,
        "components": comp,
        "levels": {"anomaly": anomaly_level, "drift": drift_level, "noise": metrics["noise_label"]},
        "metrics": {k: v for k, v in metrics.items() if k != "components"},
        "gate_rules_triggered": rules,
        "false_confidence": fc,
        "reasons": expl["positive"] + expl["negative"],
        "reasons_positive": expl["positive"], "reasons_negative": expl["negative"],
        "waterfall": X.waterfall(comp, penalties, trust),
        "worst_tiles": [{"id": t["id"], "score": t["score"], "reasons": t["reasons"]} for t in worst if t["score"] < 80],
        "tiles": tiles,
        "fusion": {"available": fu["available"], "rules": fu.get("rules_summary", {}),
                   "reference": ref, "s1_date": s1p["date"] if s1p else None, "s1_gap_days": raw.get("s1_gap")},
        "drift": {"per_feature": dr["per_feature"], "index": round(drift_idx, 3), "calibration": cal},
        "temporal": {"flagged": int((tmp["status"] != "NORMAL").sum()),
                     "statuses": {s: int((tmp["status"] == s).sum()) for s in
                                  ("REQUIRES VALIDATION", "REAL EVENT CONFIRMED", "SUSPECTED DATA ERROR")}},
        "recovery": {**rec["info"], "recon_pct": metrics["recon_pct"], "unrecovered_pct": metrics["unrecovered_pct"],
                     "mean_uncertainty": metrics["recon_uncertainty"]},
        "lineage": chain(m["valid"], invalid, rec["recon"], rec["unc"], trust),
        "aoi": AOI.cur(),
        "metadata_checks": validate_metadata(raw["meta"], "S2") + (validate_metadata({"orbit": "descending"}, "S1") if has_s1 else []) + integ_checks,
        "integrity": integ,
        "sensors": {"s2": {"date": date, "tile": raw["meta"].get("tile"), "granule_cloud": raw["meta"].get("cloud_cover"),
                           "item_id": raw["meta"].get("item_id")},
                    "s1": {"date": s1p["date"], "gap_days": raw.get("s1_gap")} if has_s1 else None},
        "synthetic": raw.get("synthetic", []),
        "processing_ms": None,
    }
    if keep_arrays:
        result["_arrays"] = {"refl": refl, "filled": rec["bands"], "masks": m, "recon": rec["recon"], "unc": rec["unc"],
                             "prov": provenance(m["valid"], rec["recon"]), "s1": s1p, "ndvi": idx_r["NDVI"],
                             "agree": fu.get("map"), "tile_scores": tile_s, "feats": feats,
                             "valid_f": T.frac(valid_opt), "drift_raw": dr["raw"]}
    result["processing_ms"] = round((time.perf_counter() - t0) * 1000)
    return result


def scene_id(date: str, synthetic: list | None = None) -> str:
    tile = "T" + str(cache.aoi().get("tile", "XXXXX"))
    return f"S2_{date}_{tile}" + ("_SYN" if synthetic else "")


def training_features() -> np.ndarray:
    """Per-tile feature vectors over the whole real time series (Isolation Forest training set)."""
    rows = []
    for d in cache.s2_dates():
        r = analyze(raw_scene(d))
        a = r["_arrays"]
        rows.append(a["feats"][a["valid_f"] >= 0.6])
    return np.concatenate(rows)
