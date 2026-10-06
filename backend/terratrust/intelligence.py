"""Trust Intelligence: decision-aware analysis on top of the trust engine.

Everything here is computed from real analysis outputs (scene summaries, per-tile metrics, recovery
provenance, the location's 12-month history). Nothing is decorative:

* fitness()        fit-for-purpose preflight per use case → GO / CONDITIONAL / NO-GO + failing evidence
* silent_failure() hidden problems inside the *clean-looking* part of a scene
* impact()         impact-weighted quality per use case + contamination radius + trust graph
* fallback()       ranked alternatives when a scene is not GO
* data_debt()      unresolved quality uncertainty accumulated over a location's timeline
* memory()         recurring (non-weather) problem tiles across time
* reproduce()      re-run the pipeline from hashed inputs and compare
"""
from __future__ import annotations

import hashlib
import json
import math
from functools import lru_cache
from typing import Any

import numpy as np
import yaml

from . import aoi as A
from .config import CONFIG_DIR, MODELS_DIR

DRIFT_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
LABEL = {
    "trust": "Trust Score", "uncertainty": "Score uncertainty (±)", "cloud_shadow": "Cloud + shadow %", "missing": "Missing pixels %",
    "recon": "Reconstructed %", "unrecovered": "Unrecoverable gaps %", "impossible": "Impossible values %", "agreement": "S1/S2 agreement %",
    "has_s1": "Sentinel-1 radar pair", "noise": "Noise quality", "temporal": "Temporal consistency", "drift_rank": "Drift level",
    "calib_ok": "Radiometric calibration", "silent_risk": "Silent-failure risk", "real_data": "Real (non-synthetic) data", "gate_pass": "Trust Gate PASS",
}
FIX = {
    "trust": "Use a cleaner acquisition (see fallbacks) or review the failing components",
    "uncertainty": "Wait for an acquisition with less reconstruction / more evidence to narrow the interval",
    "cloud_shadow": "Use a clearer acquisition, or a SAR-based workflow for this task",
    "missing": "Request reprocessing / use an acquisition without sensor dropout",
    "recon": "Prefer an observed (non-reconstructed) acquisition for this task",
    "unrecovered": "No valid history exists for these pixels: exclude them from the analysis",
    "impossible": "Data corruption: quarantine the scene and request reprocessing",
    "agreement": "Inspect the S1/S2 disagreement tiles on Sensor Fusion before use",
    "has_s1": "Wait for the next Sentinel-1 pass (12-day repeat) to cross-check",
    "noise": "Apply stronger speckle filtering or use another radar acquisition",
    "temporal": "Validate the temporal jump against field data or the next acquisition",
    "drift_rank": "Recalibrate against the seasonal baseline before trend analysis",
    "calib_ok": "Sensor gain drift detected: do not use for indices until recalibrated",
    "silent_risk": "Investigate the hidden-issue tiles (Silent Failure) before relying on this scene",
    "real_data": "Scene contains synthetic test faults: never certify for reporting",
    "gate_pass": "Only PASS scenes can back a certified report: resolve the gate decision first",
}
FMT = {"has_s1": lambda v: "yes" if v else "no", "calib_ok": lambda v: "ok" if v else "drift", "real_data": lambda v: "yes" if v else "synthetic",
       "gate_pass": lambda v: "PASS" if v else "not PASS", "drift_rank": lambda v: ["LOW", "MEDIUM", "HIGH"][int(v)]}


@lru_cache
def use_cases() -> dict[str, dict]:
    return yaml.safe_load((CONFIG_DIR / "usecases.yaml").read_text())


# ------------------------------------------------------------------ silent failure
def silent_failure(s: dict) -> dict[str, Any]:
    """Risk that a scene *looks* trustworthy but carries hidden problems inside its clean-looking area."""
    tiles = s["tiles"]
    clean = [t for t in tiles if t["cloud"] + t["shadow"] < 5 and t["missing"] < 1 and t["reconstructed"] < 5]
    hidden = []
    for t in clean:
        why = []
        if t.get("sensor_agreement") is not None and t["sensor_agreement"] < 60:
            why.append(f"S1/S2 disagreement ({t['sensor_agreement']:.0f}%)")
        if t["drift"] == "HIGH":
            why.append(f"HIGH distribution drift (PSI {t['drift_psi']:.2f})")
        if t["anomaly"] != "LOW":
            why.append(f"{t['anomaly']} anomaly ({', '.join(a['feature'] for a in t['anomaly_top'][:2])})")
        if t["temporal_status"] == "SUSPECTED DATA ERROR":
            why.append(f"temporal jump not confirmed by radar (z={t['temporal_z']:.1f})")
        if any("Impossible" in r for r in t["reasons"]):
            why.append("physically impossible values")
        if why:
            hidden.append({"id": t["id"], "row": t["row"], "col": t["col"], "why": why})
    m = s["metrics"]
    clean_frac = len(clean) / max(1, len(tiles))
    hidden_frac = len(hidden) / max(1, len(clean))
    calib = min(1.0, max(0.0, (m.get("calibration_max_z", 0) - 2.0) / 6.0))
    drift = min(1.0, max(0.0, (m.get("drift_index", 0) - 0.6) / 1.4))
    risk = 100 * min(1.0, 0.6 * hidden_frac + 0.25 * calib + 0.15 * drift) if clean else 0.0
    level = "HIGH" if risk >= 45 else "MEDIUM" if risk >= 20 else "LOW"
    visual = round(min(s["components"]["cloud"], s["components"]["completeness"]), 1)
    evidence = []
    if hidden:
        counts: dict[str, int] = {}
        for h in hidden:
            for w in h["why"]:
                k = w.split(" (")[0]
                counts[k] = counts.get(k, 0) + 1
        for k, v in sorted(counts.items(), key=lambda x: -x[1]):
            evidence.append(f"{k} in {v} clean-looking tile{'s' if v > 1 else ''}")
    if calib > 0:
        evidence.append(f"Radiometric calibration deviation z = {m.get('calibration_max_z', 0):.1f} on pseudo-invariant targets" + (f": {m['calibration_flag']}" if m.get("calibration_flag") else ""))
    if drift > 0.3:
        evidence.append(f"Scene-level drift index {m.get('drift_index', 0):.2f} (1.0 = edge of natural seasonal drift)")
    if level == "LOW":
        headline = ("Clean and consistent: no hidden issues inside the clean-looking area" if not hidden else
                    f"Clean and consistent: only minor hidden signals in {round(100 * hidden_frac)}% of the clean-looking area")
    else:
        headline = f"Looks {visual:.0f}/100 clean, but hidden issues affect {round(100 * hidden_frac)}% of the clean-looking area"
    return {"risk": round(risk, 1), "level": level, "visual_quality": visual, "clean_tiles": len(clean), "clean_fraction": round(clean_frac, 3),
            "hidden_tiles": hidden, "hidden_fraction": round(hidden_frac, 3), "evidence": evidence, "headline": headline,
            "method": "risk = 100·min(1, 0.6·hidden/clean tiles + 0.25·calibration z-excess + 0.15·drift excess)"}


# ------------------------------------------------------------------ fitness / preflight
def _values(s: dict, silent: dict) -> dict[str, float]:
    m, c = s["metrics"], s["components"]
    return {
        "trust": s["trust_score"], "uncertainty": s["trust_uncertainty"], "cloud_shadow": m["cloud_pct"] + m["shadow_pct"],
        "missing": m["missing_pct"], "recon": m["recon_pct"], "unrecovered": m["unrecovered_pct"], "impossible": m["impossible_pct"],
        "agreement": c["sensor_agreement"] if c["sensor_agreement"] is not None else 0.0, "has_s1": 1.0 if s["sensors"]["s1"] else 0.0,
        "noise": c["noise"], "temporal": c["temporal"], "drift_rank": float(DRIFT_RANK.get(s["levels"]["drift"], 2)),
        "calib_ok": 0.0 if m.get("calibration_flag") else 1.0, "silent_risk": silent["risk"],
        "real_data": 0.0 if s.get("synthetic") else 1.0, "gate_pass": 1.0 if s["status"] == "PASS" else 0.0,
    }


def _fmt(metric: str, v: float) -> str:
    return FMT[metric](v) if metric in FMT else (f"{v:.1f}" if isinstance(v, float) else str(v))


def fitness(s: dict, silent: dict | None = None) -> dict[str, Any]:
    silent = silent or silent_failure(s)
    vals = _values(s, silent)
    out = {}
    for uid, uc in use_cases().items():
        checks, hard_fail, soft_fail = [], 0, 0
        for r in uc["requires"]:
            v = vals[r["metric"]]
            ok = v >= r["value"] if r["op"] == ">=" else v <= r["value"]
            if not ok:
                hard_fail += r["hard"]; soft_fail += not r["hard"]
            checks.append({"metric": r["metric"], "label": LABEL[r["metric"]], "op": r["op"], "required": _fmt(r["metric"], float(r["value"])),
                           "observed": _fmt(r["metric"], float(v)), "ok": bool(ok), "hard": bool(r["hard"]), "fix": None if ok else FIX[r["metric"]]})
        status = "NO-GO" if hard_fail else "CONDITIONAL" if soft_fail else "GO"
        base = s["ai_readiness_all"].get(uc["readiness"], s["trust_score"])
        score = base - 7 * soft_fail - 10 * hard_fail
        score = min(score, 49) if hard_fail else min(score, 79) if soft_fail else max(score, 80)
        fails = [c for c in checks if not c["ok"]]
        why = (f"All {len(checks)} requirements met" if not fails else
               "; ".join(f"{c['label']} {c['observed']} (needs {c['op']} {c['required']})" for c in fails[:3]))
        out[uid] = {"id": uid, "name": uc["name"], "short": uc["short"], "icon": uc["icon"], "product": uc["product"], "status": status,
                    "score": round(max(0.0, min(100.0, score)), 1), "checks": checks, "passed": sum(c["ok"] for c in checks), "total": len(checks),
                    "why": why, "actions": list(dict.fromkeys(c["fix"] for c in fails))[:3], "sar_capable": bool(uc.get("sar_capable"))}
    return out


# ------------------------------------------------------------------ impact-weighted quality
@A.aoi_cache()
def relevance() -> dict[str, list[float]]:
    """Per-tile relevance of each use case (prototype proxies from the location's own data)."""
    from . import history as H
    from . import scenes as S
    hs = H.hist()
    healthy = S.load_summary("DEMO-HEALTHY")
    ndvi = np.array([t["ndvi"] if t["ndvi"] is not None else 0.0 for t in healthy["tiles"]])
    nd = np.where(hs["s2_clear"] >= 0.8, hs["s2_ndwi"], np.nan)
    with np.errstate(all="ignore"):
        ndwi_hi = np.nan_to_num(np.nanpercentile(nd, 90, axis=0), nan=-0.3)  # wettest typical state of the tile
    crop = np.clip((ndvi - 0.2) / 0.4, 0, 1)
    lo, hi = np.percentile(ndwi_hi, [30, 95])
    water = np.clip((ndwi_hi - lo) / max(hi - lo, 1e-3), 0, 1)  # relative water-proneness within this location
    urban = np.clip((0.35 - ndvi) / 0.25, 0, 1)
    flat = np.ones_like(ndvi)
    return {"crop": crop.tolist(), "biomass": crop.tolist(), "carbon": crop.tolist(), "flood": water.tolist(),
            "lulc": flat.tolist(), "change": flat.tolist(), "urban": urban.tolist()}


def impact_weighted(s: dict) -> dict[str, Any]:
    rel = relevance()
    optical = np.array([t["score"] for t in s["tiles"]])
    # SAR-first tasks are judged on radar quality (noise + cross-sensor agreement), not optical cleanliness
    radar = np.array([np.mean([t["components"].get("noise") or 0, t.get("sensor_agreement") if t.get("sensor_agreement") is not None else 50]) for t in s["tiles"]])
    score = optical
    out = {}
    for uid, uc in use_cases().items():
        score = radar if uc.get("sar_capable") else optical
        bad = score < 80
        w = np.array(rel[uid]); tot = w.sum() or 1.0
        out[uid] = {"name": uc["short"], "weighted_quality": round(float((w * score).sum() / tot), 1), "raw_quality": round(float(score.mean()), 1),
                    "affected_relevant_pct": round(float(100 * (w * bad).sum() / tot), 1), "relevant_area_pct": round(float(100 * (w > 0.5).mean()), 1)}
    score = optical
    worst = sorted(range(len(score)), key=lambda i: score[i])[:6]
    return {"by_use_case": out, "relevance": {k: [round(x, 2) for x in v] for k, v in rel.items() if k in ("crop", "flood", "urban")},
            "worst_tiles": [{"id": s["tiles"][i]["id"], "score": float(score[i]), "crop_rel": rel["crop"][i], "flood_rel": rel["flood"][i]} for i in worst],
            "method": "tile quality weighted by per-tile relevance (cropland = clearest-scene NDVI; water-prone = 90th-percentile NDWI over 12 months; "
                      "built-up = low NDVI). SAR-first tasks use radar tile quality (noise + S1/S2 agreement)."}


# ------------------------------------------------------------------ contamination radius (real recovery provenance)
@A.aoi_cache()
def _borrow_index() -> dict[str, list[dict]]:
    """date -> scenes that reconstructed pixels from that acquisition."""
    from . import scenes as S
    from .ingest import cache
    idx: dict[str, list[dict]] = {}
    grid = cache.aoi()["grid"] ** 2
    for d in cache.s2_dates():
        sm = S.load_summary(S.real_id(d))
        for src in sm["recovery"].get("sources_used", []):
            idx.setdefault(src["date"], []).append({"scene_id": sm["scene_id"], "date": d, "pixels": src["pixels"],
                                                    "pct": round(100 * src["pixels"] / grid, 2), "status": sm["status"], "trust": sm["trust_score"]})
    return idx


def contamination(s: dict) -> dict[str, Any]:
    from . import scenes as S
    base = s["info"]["base_date"]
    downstream = sorted(_borrow_index().get(base, []), key=lambda x: -x["pixels"])
    upstream = s["recovery"].get("sources_used", [])
    derived = [d["id"] for d in S.demos() if d["base"] == base and d["id"] != s["scene_id"]] if not s["scene_id"].startswith("DEMO") else []
    affected_uses = [] if s["status"] == "PASS" else [uc["product"] for uc in use_cases().values()]
    return {"acquisition": base, "upstream_sources": upstream, "downstream_scenes": downstream, "derived_scenarios": derived,
            "radius": len(downstream), "borrowed_pixels": int(sum(d["pixels"] for d in downstream)),
            "message": (f"{len(downstream)} other scene(s) reconstructed {sum(d['pixels'] for d in downstream):,} pixels from this acquisition: "
                        "if it is distrusted, those reconstructions inherit the problem." if downstream else
                        "No other scene borrowed pixels from this acquisition: contamination radius is zero."),
            "products_at_risk": affected_uses}


def trust_graph(s: dict, fit: dict) -> dict[str, Any]:
    c, m = s["components"], s["metrics"]

    def st(v):
        return "ok" if v >= 80 else "warn" if v >= 50 else "bad"
    s1 = s["sensors"]["s1"]
    nodes = [
        {"id": "s2", "col": 0, "label": "Sentinel-2 L2A", "sub": s["date"], "trust": min(c["completeness"], c["cloud"]), "detail": f"cloud {m['cloud_pct']:.0f}% · missing {m['missing_pct']:.1f}%"},
        {"id": "s1", "col": 0, "label": "Sentinel-1 RTC", "sub": s1["date"] if s1 else "no pair", "trust": c["sensor_agreement"] if s1 else 0, "detail": f"agreement {c['sensor_agreement']:.0f}%" if s1 else "no radar cross-check"},
        {"id": "recovery", "col": 1, "label": "Masks + recovery", "sub": f"{m['recon_pct']:.0f}% rebuilt", "trust": c["reconstruction"], "detail": f"σ {m['recon_uncertainty']:.2f}"},
        {"id": "quality", "col": 1, "label": "Quality engine", "sub": "noise · temporal", "trust": min(c["noise"], c["temporal"]), "detail": f"noise {c['noise']:.0f} · temporal {c['temporal']:.0f}"},
        {"id": "models", "col": 2, "label": "Models", "sub": "IsoForest · drift · physics", "trust": min(c["anomaly"], c["drift"]), "detail": f"anomaly {s['levels']['anomaly']} · drift {s['levels']['drift']}"},
        {"id": "trust", "col": 3, "label": "Trust Score", "sub": f"{s['trust_score']:.0f} ± {s['trust_uncertainty']:.0f}", "trust": s["trust_score"], "detail": s["status"]},
    ]
    for n in nodes:
        n["status"] = st(n["trust"]) if not (n["id"] == "s1" and not s1) else "warn"
    smap = {"GO": "ok", "CONDITIONAL": "warn", "NO-GO": "bad"}
    for uid, f in fit.items():
        nodes.append({"id": f"uc_{uid}", "col": 4, "label": f["short"], "sub": f["status"], "trust": f["score"], "status": smap[f["status"]], "detail": f["why"]})
        nodes.append({"id": f"p_{uid}", "col": 5, "label": f["product"], "sub": "contaminated" if f["status"] == "NO-GO" else "at risk" if f["status"] == "CONDITIONAL" else "safe", "trust": f["score"], "status": smap[f["status"]], "detail": ""})
    edges = [("s2", "recovery"), ("s2", "quality"), ("s1", "quality"), ("s1", "models"), ("recovery", "models"), ("quality", "models"),
             ("recovery", "trust"), ("quality", "trust"), ("models", "trust")]
    edges += [("trust", f"uc_{u}") for u in fit] + [(f"uc_{u}", f"p_{u}") for u in fit]
    return {"nodes": nodes, "edges": [{"from": a, "to": b} for a, b in edges]}


def impact(s: dict) -> dict[str, Any]:
    sil = silent_failure(s)
    fit = fitness(s, sil)
    return {"weighted": impact_weighted(s), "contamination": contamination(s), "graph": trust_graph(s, fit)}


# ------------------------------------------------------------------ fallback recommendations
def fallback(s: dict, use_case: str) -> list[dict]:
    from . import scenes as S
    from .ingest import cache
    uc = use_cases()[use_case]
    base = s["info"]["base_date"]
    out = []
    for d in cache.s2_dates():
        if d == base:
            continue
        gap = abs(cache.days_between(base, d))
        if gap > 45:
            continue
        o = S.load_summary(S.real_id(d))
        f = fitness(o)[use_case]
        if f["status"] == "GO":
            conf = f["score"] / 100 * math.exp(-gap / 30)
            out.append({"kind": "acquisition", "scene_id": o["scene_id"], "date": d, "gap_days": gap, "fitness": f["score"], "trust": o["trust_score"],
                        "confidence": round(100 * conf, 1), "title": f"Sentinel-2 acquisition {d[:4]}-{d[4:6]}-{d[6:]} ({gap} days away)",
                        "why": f"GO for {uc['short']} · trust {o['trust_score']:.0f}"})
    out.sort(key=lambda x: -x["confidence"])
    out = out[:3]
    if uc.get("sar_capable") and s["sensors"]["s1"]:
        out.insert(0, {"kind": "radar", "title": f"Radar-only workflow (Sentinel-1 {s['sensors']['s1']['date']})", "confidence": round(min(95.0, s["components"]["noise"]), 1),
                       "why": "SAR sees through cloud: water/flood mapping does not need the optical scene", "scene_id": s["scene_id"]})
    if s["metrics"]["recon_pct"] > 1 and use_case in ("lulc", "change", "crop"):
        out.append({"kind": "reconstruction", "title": "Use the reconstructed layer, with uncertainty", "scene_id": s["scene_id"],
                    "confidence": round(100 * (1 - s["metrics"]["recon_uncertainty"]) * 0.8, 1),
                    "why": f"{s['metrics']['recon_pct']:.0f}% of pixels rebuilt from history (σ {s['metrics']['recon_uncertainty']:.2f}); label outputs as derived"})
    return out


# ------------------------------------------------------------------ data debt + quality memory (location level)
def data_debt(reviews: dict[str, str] | None = None) -> dict[str, Any]:
    """EO Data Debt: unresolved quality uncertainty that was *released* downstream, accumulated with a 60-day half-life."""
    from . import scenes as S
    from .ingest import cache
    reviews = reviews or {}
    series, sources_total = [], {}
    debt, prev = 0.0, None
    for d in cache.s2_dates():
        s = S.load_summary(S.real_id(d))
        sil = silent_failure(s)
        m = s["metrics"]
        contrib = {}
        if s["status"] != "BLOCKED":  # blocked data never reached a model: no debt
            contrib["Reconstructed pixels released"] = m["recon_pct"] * m["recon_uncertainty"] * 0.6
            contrib["Unreviewed WARNING"] = 12.0 if s["status"] == "WARNING" and s["scene_id"] not in reviews else 0.0
            contrib["Silent-failure risk"] = sil["risk"] * 0.25
            contrib["No radar cross-check"] = 6.0 if not s["sensors"]["s1"] else 0.0
            contrib["Unrecoverable gaps"] = m["unrecovered_pct"] * 0.4
            contrib["Calibration drift"] = 10.0 if m.get("calibration_flag") else 0.0
        new = sum(contrib.values())
        if prev is not None:
            debt *= 0.5 ** (cache.days_between(prev, d) / 60)
        debt += new
        prev = d
        for k, v in contrib.items():
            sources_total[k] = sources_total.get(k, 0.0) + v
        series.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "scene_id": s["scene_id"], "added": round(new, 1), "debt": round(debt, 1), "status": s["status"],
                       "top": max(contrib, key=contrib.get) if new > 0.5 else None})
    level = "HIGH" if debt >= 60 else "MEDIUM" if debt >= 25 else "LOW"
    tot = sum(sources_total.values()) or 1
    srcs = [{"source": k, "share": round(100 * v / tot, 1), "points": round(v, 1)} for k, v in sorted(sources_total.items(), key=lambda x: -x[1]) if v > 0]
    unreviewed = [p["scene_id"] for p in series if p["top"] == "Unreviewed WARNING" or (p["status"] == "WARNING" and p["scene_id"] not in reviews)]
    actions = []
    for sr in srcs[:4]:
        k = sr["source"]
        actions.append({"Reconstructed pixels released": "Prefer observed acquisitions for quantitative products; keep reconstructed pixels labelled",
                        "Unreviewed WARNING": f"Review {len(unreviewed)} pending WARNING scene(s) in Human Review",
                        "Silent-failure risk": "Investigate hidden-issue tiles on clean-looking scenes before reporting",
                        "No radar cross-check": "Schedule products around Sentinel-1 passes (12-day repeat) for cross-validation",
                        "Unrecoverable gaps": "Exclude permanently missing pixels from area statistics",
                        "Calibration drift": "Recalibrate optical indices against pseudo-invariant targets"}[k])
    peak = max(series, key=lambda p: p["debt"])
    return {"current": round(debt, 1), "level": level, "peak": peak, "series": series, "sources": srcs, "actions": actions,
            "method": "per scene: 0.6·reconstructed%·σ + 12 (unreviewed WARNING) + 0.25·silent risk + 6 (no S1) + 0.4·unrecoverable% + 10 (calibration); "
                      "blocked scenes add nothing; debt halves every 60 days as fresh data arrives"}


def memory() -> dict[str, Any]:
    """Institutional data memory: recurring non-weather problems per tile across the whole archive."""
    from . import scenes as S
    from .ingest import cache
    tiles: dict[str, dict] = {}
    dates = cache.s2_dates()
    for d in dates:
        s = S.load_summary(S.real_id(d))
        for t in s["tiles"]:
            rec = tiles.setdefault(t["id"], {"id": t["id"], "row": t["row"], "col": t["col"], "issues": {}, "cloudy": 0, "dates": []})
            if t["cloud"] + t["shadow"] > 30:
                rec["cloudy"] += 1
                continue  # weather is not a data defect
            found = []
            if t.get("sensor_agreement") is not None and t["sensor_agreement"] < 60:
                found.append("S1/S2 disagreement")
            if t["drift"] == "HIGH":
                found.append("HIGH drift")
            if t["anomaly"] != "LOW":
                found.append("Anomaly")
            if t["temporal_status"] == "SUSPECTED DATA ERROR":
                found.append("Unconfirmed temporal jump")
            if t["components"].get("noise") is not None and t["components"]["noise"] < 60:
                found.append("High noise")
            for f in found:
                rec["issues"][f] = rec["issues"].get(f, 0) + 1
            if found:
                rec["dates"].append(d)
    grid, hotspots = [], []
    for t in tiles.values():
        n = len(t["dates"])
        grid.append({"id": t["id"], "row": t["row"], "col": t["col"], "count": n, "cloudy": t["cloudy"]})
        if n >= 3:
            dom = max(t["issues"], key=t["issues"].get)
            hotspots.append({"id": t["id"], "row": t["row"], "col": t["col"], "occurrences": n, "dominant": dom, "issues": t["issues"],
                             "first": t["dates"][0], "last": t["dates"][-1],
                             "pattern": "Persistent" if n >= 6 else "Recurring", "share": round(100 * n / len(dates), 1)})
    hotspots.sort(key=lambda h: -h["occurrences"])
    return {"n_scenes": len(dates), "grid": grid, "hotspots": hotspots[:12],
            "summary": (f"{len(hotspots)} tile(s) show a recurring non-weather problem (≥ 3 of {len(dates)} acquisitions)" if hotspots
                        else "No recurring non-weather problems: issues at this location are transient")}


# ------------------------------------------------------------------ reproducibility
def _sha(path) -> str | None:
    if not path.exists():
        return None
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def provenance_hashes(s: dict) -> dict[str, Any]:
    raw = A.raw_dir()
    inputs = {f"S2_{s['info']['base_date']}.npz": _sha(raw / f"S2_{s['info']['base_date']}.npz")}
    if s["sensors"]["s1"]:
        inputs[f"S1_{s['sensors']['s1']['date']}.npz"] = _sha(raw / f"S1_{s['sensors']['s1']['date']}.npz")
    configs = {p.name: _sha(p) for p in sorted(CONFIG_DIR.glob("*.yaml"))}
    md = A.models_dir()
    models = {"physics.json": _sha(md / "physics.json"), "isoforest.pkl": _sha(md / "isoforest.pkl"),
              "drift_calibration.json": _sha(md / "drift_calibration.json"), "pif.npz": _sha(A.root() / "pif.npz"), "xgb.json": _sha(MODELS_DIR / "xgb.json")}
    bundle = hashlib.sha256(json.dumps({"i": inputs, "c": configs, "m": models}, sort_keys=True).encode()).hexdigest()
    return {"inputs": inputs, "configs": configs, "models": models, "bundle": bundle, "pipeline_version": "terratrust-engine 1.2"}


def reproduce(scene_id: str) -> dict[str, Any]:
    from . import pipeline as P
    from . import scenes as S
    import time
    stored = S.load_summary(scene_id)
    t0 = time.perf_counter()
    r = P.analyze(S.raw_for(scene_id), keep_arrays=False)
    ms = round((time.perf_counter() - t0) * 1000)
    deltas = {k: round(abs((r["components"][k] or 0) - (stored["components"][k] or 0)), 3) for k in stored["components"]}
    same = abs(r["trust_score"] - stored["trust_score"]) < 0.05 and r["status"] == stored["status"] and max(deltas.values()) < 0.05
    return {"scene_id": scene_id, "reproducible": same, "stored": {"trust": stored["trust_score"], "status": stored["status"]},
            "rerun": {"trust": r["trust_score"], "status": r["status"], "ms": ms}, "max_component_delta": max(deltas.values()),
            "component_deltas": deltas, "provenance": provenance_hashes(stored),
            "message": ("Reproduced identically from the hashed inputs, configs and models." if same else
                        "Re-run differs from the stored result: inputs, configuration or models changed since it was issued.")}
