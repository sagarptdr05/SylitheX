"""EO analytics API: quality issues, anomaly explorer, provenance graph and (prototype) Carbon MRV.

Everything here is derived from the stored analysis results or recomputed from the archived Sentinel data.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from terratrust import aoi as A
from terratrust import carbon as C
from terratrust import intelligence as I
from terratrust import pipeline as P
from terratrust import render, scenes as S
from terratrust import tiles as T
from .. import db
from ..routers.scenes import list_scenes
from ..services import data_uri, passport_checksum, summary

router = APIRouter(prefix="/api", tags=["EO analytics"])

SEV_RANK = {"CRITICAL": 3, "HIGH": 2, "MEDIUM": 1, "LOW": 0, "INFO": -1}


def _fmt(d: str) -> str:
    return f"{d[:4]}-{d[4:6]}-{d[6:]}" if len(d) == 8 else d


def _centroid(poly):
    return [round(sum(p[1] for p in poly) / len(poly), 5), round(sum(p[0] for p in poly) / len(poly), 5)]


def _px_per_tile() -> int:
    return T.tile_size() ** 2


# --------------------------------------------------------------------------- issues

def scene_issues(s: dict) -> list[dict]:
    """Every issue in one scene, answering WHAT / WHY / WHERE / WHEN / HOW SEVERE / IMPACT / ACTION."""
    tiles = s["tiles"]
    n = len(tiles)
    when = _fmt(s["date"])
    status = s["status"]
    action_gate = {"BLOCKED": "Scene blocked at the Trust Gate; not delivered downstream",
                   "WARNING": "Routed to human review before release",
                   "PASS": "Delivered with the affected tiles flagged in the Trust Map"}[status]
    groups: dict[str, dict] = {}

    def add(kind, category, sensor, tile, sev, conf, why, action):
        g = groups.setdefault(kind, {"type": kind, "category": category, "sensor": sensor, "tiles": [], "severity": "LOW",
                                     "confidence": 0.0, "why": why, "action": action})
        g["tiles"].append(tile)
        if SEV_RANK[sev] > SEV_RANK[g["severity"]]:
            g["severity"] = sev
        g["confidence"] = max(g["confidence"], conf)

    for t in tiles:
        if t["cloud"] > 20 or t["shadow"] > 20:
            add("Cloud / shadow contamination", "quality", "Sentinel-2", t, "HIGH" if t["cloud"] > 60 else "MEDIUM", 0.95,
                "Scene classification + spectral tests flag cloud and cloud-shadow pixels",
                "Masked; gaps recovered from the temporal composite and labelled RECONSTRUCTED")
        if t["missing"] > 5:
            add("Missing values", "quality", "Sentinel-2", t, "HIGH" if t["missing"] > 30 else "MEDIUM", 0.99,
                "No-data / defective pixels in the delivered product (dropout, swath edge)",
                "Excluded; recovered where clear history exists, otherwise left missing")
        if t["drift"] != "LOW":
            add("Sensor drift", "anomaly", "Sentinel-2", t, t["drift"], min(0.99, 0.6 + t["drift_psi"]),
                f"Value distribution shifted vs the seasonal baseline (PSI {t['drift_psi']:.2f})",
                "Drift component lowered; HIGH drift with low S1/S2 agreement caps the gate at WARNING")
        if t["anomaly"] != "LOW":
            feats = ", ".join(a["feature"] for a in t["anomaly_top"][:2])
            add("Statistical outlier", "anomaly", "Sentinel-1 + Sentinel-2", t, t["anomaly"], 0.75 if t["anomaly"] == "MEDIUM" else 0.9,
                f"Isolation Forest outlier vs 12 months of tiles (driven by {feats})", "Anomaly component lowered; tile flagged")
        if t["temporal_status"] == "SUSPECTED DATA ERROR":
            add("Suspicious change", "anomaly", "Sentinel-2", t, "HIGH", min(0.99, 0.5 + abs(t["temporal_z"]) / 10),
                f"Abrupt change (z={t['temporal_z']:.1f}) NOT confirmed by Sentinel-1 radar", "Critical penalty; tile not trusted")
        elif t["temporal_status"] == "REQUIRES VALIDATION":
            add("Unconfirmed change", "anomaly", "Sentinel-2", t, "MEDIUM", min(0.95, 0.4 + abs(t["temporal_z"]) / 10),
                f"Abrupt change (z={t['temporal_z']:.1f}) with no radar acquisition to confirm it", "Sent to review")
        elif t["temporal_status"] == "REAL EVENT CONFIRMED":
            add("Confirmed real event", "event", "Sentinel-1 + Sentinel-2", t, "INFO", 0.9,
                f"Change confirmed by both optical and radar (z={t['temporal_z']:.1f})", "Not penalised: a real event is not a data error")
        if t["sensor_agreement"] is not None and t["sensor_agreement"] < 60:
            add("Radar / optical disagreement", "anomaly", "Sentinel-1 + Sentinel-2", t, "HIGH" if t["sensor_agreement"] < 40 else "MEDIUM",
                min(0.99, (100 - t["sensor_agreement"]) / 100 + 0.3),
                f"Sentinel-1 backscatter contradicts the optical land-cover signal ({t['sensor_agreement']:.0f}% agreement)",
                "Sensor-agreement component lowered; scene-level agreement < threshold blocks")
        if any("Impossible NDVI" in r for r in t["reasons"]):
            add("Out-of-range values", "anomaly", "Sentinel-2", t, "CRITICAL", 0.99, "NDVI outside the physical range [-1, 1]",
                "Critical penalty; values never reach downstream models")
        if t["components"].get("noise") is not None and t["components"]["noise"] < 60:
            add("Elevated noise", "quality", "Sentinel-1 + Sentinel-2", t, "MEDIUM", 0.8,
                "Optical residual / SAR speckle above this location's baseline", "Noise component lowered")

    out = []
    for g in groups.values():
        ts = g.pop("tiles")
        lost = sum(100 - x["score"] for x in ts) / n
        poly = [x["polygon"] for x in ts]
        out.append({**g, "id": f"{s['scene_id']}:{g['type']}", "scene_id": s["scene_id"], "scene_title": s["info"]["title"],
                    "demo": s["info"]["demo"], "synthetic": bool(s["synthetic"]), "date": when, "status": status,
                    "tiles": [x["id"] for x in ts], "n_tiles": len(ts), "area_pct": round(100 * len(ts) / n, 1),
                    "observations": len(ts) * _px_per_tile(), "trust_points": round(lost, 1),
                    "center": _centroid([p for pl in poly for p in pl]), "polygons": poly,
                    "confidence": round(100 * g["confidence"]),
                    "impact": f"{len(ts)}/{n} tiles ({100 * len(ts) / n:.0f}% of the area); costs {lost:.1f} Trust Score points",
                    "gate_action": action_gate})

    m = s["metrics"]
    scene_level = []
    if m.get("calibration_flag"):
        scene_level.append(("Sensor drift (radiometric calibration)", "anomaly", "Sentinel-2", "HIGH", 90,
                            f"Band statistics on pseudo-invariant targets deviate (max z={m.get('calibration_max_z', 0):.1f}): {m['calibration_flag']}",
                            "Gate capped at WARNING; every derived index is suspect"))
    if m.get("duplicate_of"):
        scene_level.append(("Duplicate observation", "integrity", "Sentinel-2", "CRITICAL", 99,
                            f"Pixels identical to the archived acquisition of {_fmt(m['duplicate_of'])} (replayed / stale delivery)",
                            "Blocked: duplicates would double-count observations downstream"))
    if m.get("timestamp_conflict"):
        tc = m["timestamp_conflict"]
        scene_level.append(("Timestamp conflict", "integrity", "Sentinel-2", "CRITICAL", 99,
                            f"Record dated {_fmt(tc['declared'])} but the product was sensed {_fmt(tc['sensing'])} ({tc['days']} d)",
                            "Blocked: temporal checks and recovery windows would be wrong"))
    if s["false_confidence"]["detected"]:
        scene_level.append(("False confidence", "anomaly", "Sentinel-1 + Sentinel-2", "HIGH", 85, s["false_confidence"]["message"],
                            "Never auto-released: capped at WARNING for human review"))
    for typ, cat, sensor, sev, conf, why, action in scene_level:
        out.append({"type": typ, "category": cat, "sensor": sensor, "severity": sev, "confidence": conf, "why": why, "action": action,
                    "id": f"{s['scene_id']}:{typ}", "scene_id": s["scene_id"], "scene_title": s["info"]["title"], "demo": s["info"]["demo"],
                    "synthetic": bool(s["synthetic"]), "date": when, "status": status, "tiles": [t["id"] for t in tiles],
                    "n_tiles": n, "area_pct": 100.0, "observations": n * _px_per_tile(), "trust_points": None,
                    "center": _centroid([p for t in tiles for p in t["polygon"]]), "polygons": [],
                    "impact": "Whole scene", "gate_action": action_gate, "scene_level": True})
    out.sort(key=lambda x: (-SEV_RANK[x["severity"]], -(x["trust_points"] or 100)))
    return out


@router.get("/quality/issues", summary="Every quality / integrity issue of one scene (what, why, where, when, severity, impact, action)")
def quality_issues(scene_id: str = Query(...)):
    s = summary(scene_id)
    iss = scene_issues(s)
    return {"scene_id": scene_id, "date": _fmt(s["date"]), "status": s["status"], "issues": iss,
            "checks": s["metadata_checks"], "counts": {k: sum(i["severity"] == k for i in iss) for k in SEV_RANK}}


@A.aoi_cache(maxsize=4)
def _all_issues() -> list[dict]:
    out = []
    for sc in list_scenes():
        out += scene_issues(summary(sc["scene_id"]))
    return out


@router.get("/anomalies", summary="Anomaly explorer: issues across every scene of the location")
def anomalies(category: str = "anomaly,integrity,event", severity: str | None = None, sensor: str | None = None,
              start: str | None = None, end: str | None = None, include_demo: bool = True):
    cats = set(category.split(","))
    items = [i for i in _all_issues() if i["category"] in cats]
    if severity:
        sv = set(severity.upper().split(","))
        items = [i for i in items if i["severity"] in sv]
    if sensor:
        items = [i for i in items if sensor.lower() in i["sensor"].lower()]
    if start:
        items = [i for i in items if i["date"] >= start]
    if end:
        items = [i for i in items if i["date"] <= end]
    if not include_demo:
        items = [i for i in items if not i["demo"]]
    types = sorted({i["type"] for i in items})
    return {"items": items, "total": len(items), "types": types,
            "by_severity": {k: sum(i["severity"] == k for i in items) for k in SEV_RANK},
            "aoi": A.registry()[A.cur()]["name"]}


# --------------------------------------------------------------------------- provenance graph

def _mtime(scene_id: str) -> str:
    p = S.result_dir(scene_id) / "summary.json"
    return datetime.fromtimestamp(os.path.getmtime(p), timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC") if p.exists() else ""


@router.get("/scene/{scene_id}/provenance", summary="Data-lineage graph from satellite source to carbon report")
def provenance_graph(scene_id: str):
    s = summary(scene_id)
    m, rec = s["metrics"], s["recovery"]
    ph = I.provenance_hashes(s)
    ts = _mtime(scene_id)
    reviews = db.rows("SELECT decision, reviewer, note, created_at FROM reviews WHERE scene_id=? AND aoi=? ORDER BY id DESC",
                      (scene_id, A.cur()))
    st = lambda bad, warn=False: "fail" if bad else ("warn" if warn else "ok")
    s2, s1 = s["sensors"]["s2"], s["sensors"]["s1"]
    inp = list(ph["inputs"].items())
    nodes = [
        {"id": "s2", "kind": "source", "label": "Sentinel-2 L2A", "sub": f"T{s2.get('tile')} · {_fmt(s2['date'])}", "status": "ok",
         "details": {"Product": s2.get("item_id"), "Sensing date": _fmt(s2["date"]), "Granule cloud": f"{s2.get('granule_cloud', 0):.1f}%",
                     "Source": "Microsoft Planetary Computer STAC (ESA Copernicus)"}},
    ]
    if s1:
        nodes.append({"id": "s1", "kind": "source", "label": "Sentinel-1 RTC", "sub": f"{_fmt(s1['date'])} · Δ{s1['gap_days']} d", "status": "ok",
                      "details": {"Acquisition": _fmt(s1["date"]), "Gap to optical": f"{s1['gap_days']} days", "Polarisations": "VV + VH",
                                  "Source": "Microsoft Planetary Computer STAC"}})
    dup, tsc = m.get("duplicate_of"), m.get("timestamp_conflict")
    nodes += [
        {"id": "raw", "kind": "data", "label": "Raw dataset", "sub": "v1.0 · immutable", "status": st(bool(s["synthetic"]) and False),
         "version": "v1.0", "details": {**{f"SHA-256 {k}": (v or "")[:16] + "…" for k, v in inp},
                                         "Synthetic faults": ", ".join(s["synthetic"]) or "none", "Policy": "Originals are never overwritten"}},
        {"id": "ingest", "kind": "process", "label": "Ingestion & integrity", "sub": f"{sum(c['status'] == 'ok' for c in s['metadata_checks'])}/{len(s['metadata_checks'])} checks",
         "status": st(bool(dup or tsc), any(c["status"] != "ok" for c in s["metadata_checks"])), "version": "ingest 1.2",
         "details": {c["check"]: f"{c['status'].upper()} · {c['detail']}" for c in s["metadata_checks"]}},
        {"id": "quality", "kind": "process", "label": "Quality masks", "sub": f"cloud {m['cloud_pct']:.0f}% · missing {m['missing_pct']:.0f}%",
         "status": st(m["missing_pct"] > 40, m["cloud_pct"] > 20), "version": "masks 1.1",
         "details": {"Cloud": f"{m['cloud_pct']}%", "Shadow": f"{m['shadow_pct']}%", "Missing": f"{m['missing_pct']}%",
                     "Valid observations": f"{m['valid_pct']}%", "Impossible values": f"{m['impossible_pct']}%"}},
        {"id": "recovery", "kind": "process", "label": "Temporal recovery", "sub": f"{m['recon_pct']:.0f}% reconstructed",
         "status": st(False, m["recon_pct"] > 10), "version": "recovery 1.0",
         "details": {"Reconstructed": f"{m['recon_pct']}%", "Unrecovered": f"{m['unrecovered_pct']}%",
                     "Mean uncertainty": rec.get("mean_uncertainty"), "Window": f"±{rec.get('window_days')} days",
                     "Borrowed from": ", ".join(f"{_fmt(x['date'])} ({x['pixels']:,} px)" for x in rec.get("sources_used", [])) or "none"}},
        {"id": "anomaly", "kind": "model", "label": "Anomaly & drift detection", "sub": f"anomaly {s['levels']['anomaly']} · drift {s['levels']['drift']}",
         "status": st(s["levels"]["anomaly"] == "HIGH", s["levels"]["anomaly"] == "MEDIUM" or s["levels"]["drift"] != "LOW"), "version": "isoforest + PSI/KS",
         "details": {"Anomalous tiles": m["anomalous_tiles"], "Drift index": m["drift_index"], "PSI": m["psi"],
                     "Calibration": m.get("calibration_flag") or "OK", "Temporal flags": s["temporal"]["flagged"],
                     "Model hash": (ph["models"].get("isoforest.pkl") or "")[:16] + "…"}},
        {"id": "fusion", "kind": "model", "label": "S1 / S2 cross-check", "sub": f"agreement {m['agreement']:.0f}%" if m.get("agreement") is not None else "no radar pair",
         "status": st(m.get("agreement") is not None and m["agreement"] < 50, m.get("agreement") is None or m["agreement"] < 70), "version": "physics 1.0",
         "details": {"Agreement": m.get("agreement"), "Reference": " / ".join(s["fusion"]["reference"] or []) or "none",
                     "Model hash": (ph["models"].get("physics.json") or "")[:16] + "…"}},
        {"id": "trust", "kind": "decision", "label": "Trust Score", "sub": f"{s['trust_score']:.0f} ± {s['trust_uncertainty']:.0f}",
         "status": {"PASS": "ok", "WARNING": "warn", "BLOCKED": "fail"}[s["status"]], "version": "engine 1.2",
         "details": {**{k.replace('_', ' ').title(): v for k, v in s["components"].items()}, "Interval": s["trust_interval"],
                     "XGBoost reliability": (s.get("ml_evidence") or {}).get("reliability")}},
        {"id": "gate", "kind": "decision", "label": "Trust Gate", "sub": s["status"], "status": {"PASS": "ok", "WARNING": "warn", "BLOCKED": "fail"}[s["status"]],
         "details": {"Decision": s["status"], **{g["rule"]: f"{g['action']} · {g['message']}" for g in s["gate_rules_triggered"]}}},
        {"id": "clean", "kind": "data", "label": "Trusted dataset", "sub": "v1.1 · delivered" if s["status"] != "BLOCKED" else "withheld",
         "status": "fail" if s["status"] == "BLOCKED" else ("warn" if s["status"] == "WARNING" else "ok"), "version": "v1.1",
         "details": {"Parent": "Raw dataset v1.0", "Original pixels kept": f"{m['valid_pct']}%", "Reconstructed (labelled)": f"{m['recon_pct']}%",
                     "Blocked tiles": sum(t["status"] == "BLOCKED" for t in s["tiles"]), "Created by": "TerraTrust quality pipeline", "Timestamp": ts}},
    ]
    if reviews:
        r = reviews[0]
        nodes.append({"id": "review", "kind": "decision", "label": "Human review", "sub": f"{r['decision']} · {r['reviewer']}",
                      "status": "ok" if r["decision"] == "APPROVE" else "warn", "details": {"Decision": r["decision"], "Reviewer": r["reviewer"],
                                                                                         "Note": r["note"] or "–", "At": r["created_at"]}})
    blocked = s["status"] == "BLOCKED"
    nodes += [
        {"id": "lulc", "kind": "model", "label": "LULC classification", "sub": "index thresholds", "status": "fail" if blocked else "ok",
         "version": "lulc-proxy 0.1", "details": {"Method": C.METHOD["steps"][0], "Input": "Trusted dataset v1.1"}},
        {"id": "biomass", "kind": "model", "label": "Biomass analysis", "sub": "Tier-1 defaults × NDVI", "status": "fail" if blocked else "ok",
         "version": "agb-proxy 0.1", "details": {"Method": C.METHOD["steps"][1], "Limits": C.METHOD["limits"]}},
        {"id": "carbon", "kind": "output", "label": "Carbon MRV", "sub": "withheld" if blocked else "indicative tCO₂e", "status": "fail" if blocked else "ok",
         "details": {"Method": C.METHOD["steps"][2], "Status": "Withheld: input blocked at the gate" if blocked else "Indicative estimate (prototype)"}},
        {"id": "report", "kind": "output", "label": "Trust Passport", "sub": "SHA-256 signed", "status": "ok",
         "details": {"Bundle hash": ph["bundle"][:24] + "…", "Pipeline": ph["pipeline_version"], "Verify": f"/api/passport/{scene_id}/verify"}},
    ]
    edges = [("s2", "raw"), ("raw", "ingest"), ("ingest", "quality"), ("quality", "recovery"), ("recovery", "anomaly"),
             ("anomaly", "trust"), ("fusion", "trust"), ("trust", "gate"), ("gate", "clean"), ("clean", "lulc"), ("lulc", "biomass"),
             ("biomass", "carbon"), ("carbon", "report"), ("gate", "report")]
    if s1:
        edges += [("s1", "raw"), ("s1", "fusion")]
    edges.append(("quality", "fusion"))
    if reviews:
        edges += [("gate", "review"), ("review", "clean")]
    borrowed = [{"date": _fmt(x["date"]), "pixels": x["pixels"], "scene_id": P.scene_id(x["date"])} for x in rec.get("sources_used", [])]
    return {"scene_id": scene_id, "date": _fmt(s["date"]), "status": s["status"], "nodes": nodes,
            "edges": [{"from": a, "to": b} for a, b in edges], "borrowed": borrowed, "bundle": ph["bundle"],
            "provenance_id": f"tt-prov-{ph['bundle'][:12]}"}


# --------------------------------------------------------------------------- carbon MRV

@A.aoi_cache(maxsize=12)
def _scene_carbon(scene_id: str) -> dict:
    s = summary(scene_id)
    raw = S.raw_for(scene_id)
    res = P.analyze(raw)
    naive = C.naive(raw)
    tr, cls, nd = C.trusted(res)
    agb = C.biomass(cls, nd)
    imgs = {"lulc": data_uri(render.encode(C.lulc_image(cls), "png", size=384), "png"),
            "biomass": data_uri(render.encode(C.biomass_image(cls, agb), "png", size=384), "png")}
    out = {"scene_id": scene_id, "date": _fmt(s["date"]), "status": s["status"], "trust_score": s["trust_score"],
           "naive": naive, "trusted": tr, "images": imgs, "method": C.METHOD}
    if tr.get("withheld") or s["status"] == "BLOCKED":
        statuses = {x["scene_id"].split("_")[1]: x["status"] for x in list_scenes() if not x["demo"]}
        fb = C.nearest_trusted(s["info"]["base_date"], statuses)
        if fb:
            e = C.archive(fb)
            out["fallback"] = {**e, "date": _fmt(fb), "scene_id": P.scene_id(fb), "trust_score": summary(P.scene_id(fb))["trust_score"],
                               "note": "Nearest acquisition that passed the Trust Gate"}
    return out


@router.get("/carbon/scene/{scene_id}", summary="Carbon MRV for one scene: naive vs TerraTrust-gated estimate (indicative)")
def carbon_scene(scene_id: str):
    summary(scene_id)  # 404 if unknown
    return _scene_carbon(scene_id)


@router.get("/carbon/location", summary="Carbon time series and land-cover change for the location (indicative)")
def carbon_location():
    ser = C.series()
    if not ser:
        raise HTTPException(404, "No clear acquisitions for a carbon series")
    return {"aoi": A.registry()[A.cur()]["name"], "series": ser, "change": C.change(), "method": C.METHOD,
            "classes": [{"id": k, "name": n, "color": "#%02x%02x%02x" % col, "agb_default_t_ha": d} for k, n, col, d, _ in C.CLASSES]}


def lab_carbon(base_scene: str, raw_bad: dict, res_bad: dict) -> dict:
    """Downstream carbon impact of injected faults: clean reference vs naive-on-bad vs TerraTrust response."""
    ref = _scene_carbon(base_scene)
    reference = ref["trusted"] if ref["trusted"].get("available") else ref["naive"]
    naive = C.naive(raw_bad)
    tr, _, _ = C.trusted(res_bad)
    out = {"reference": {"co2e_t": reference["co2e_t"], "label": "Clean scene (before faults)"},
           "naive": {"co2e_t": naive["co2e_t"], "label": "Bad data, no trust layer"},
           "method": C.METHOD["name"]}
    out["naive"]["error_pct"] = round(100 * (naive["co2e_t"] - reference["co2e_t"]) / reference["co2e_t"], 1)
    if res_bad["status"] == "BLOCKED":
        # the trust layer does not know the clean original: it falls back to the nearest acquisition that PASSED
        base_date = summary(base_scene)["info"]["base_date"]
        statuses = {x["scene_id"].split("_")[1]: x["status"] for x in list_scenes() if not x["demo"]}
        fb = C.nearest_trusted(base_date, statuses)
        if fb:
            e = C.archive(fb)
            out["trusted"] = {"co2e_t": e["co2e_t"], "withheld": True, "fallback_date": _fmt(fb),
                              "label": f"Bad record blocked; nearest trusted acquisition ({_fmt(fb)}) used",
                              "trust": summary(P.scene_id(fb))["trust_score"], "uncertainty_pct": e["uncertainty_pct"]}
    elif tr.get("available"):
        out["trusted"] = {"co2e_t": tr["co2e_t"], "withheld": False, "label": "TerraTrust-gated estimate",
                          "trust": tr.get("delivered_trust"), "uncertainty_pct": tr["uncertainty_pct"], "tiles_excluded": tr["tiles_excluded"],
                          "recalibration": tr.get("recalibration")}
    if "trusted" in out:
        out["trusted"]["error_pct"] = round(100 * (out["trusted"]["co2e_t"] - reference["co2e_t"]) / reference["co2e_t"], 1)
    out["passport_checksum"] = passport_checksum({"faults": raw_bad.get("synthetic", []), "trust": res_bad["trust_score"], "status": res_bad["status"]})
    return out


# --------------------------------------------------------------------------- dataset inspector

@router.get("/scene/{scene_id}/inspect", summary="Dataset inspector: files, CRS, coverage, versions")
def inspect(scene_id: str):
    s = summary(scene_id)
    g = __import__("terratrust.ingest.cache", fromlist=["aoi"]).aoi()
    raw = A.raw_dir()
    base = s["info"]["base_date"]
    files = []
    for name in [f"S2_{base}.npz"] + ([f"S1_{s['sensors']['s1']['date']}.npz"] if s["sensors"]["s1"] else []):
        p = raw / name
        if p.exists():
            files.append({"name": name, "bytes": p.stat().st_size, "role": "raw input (immutable)"})
    res_dir = S.result_dir(scene_id)
    out_bytes = sum(p.stat().st_size for p in res_dir.glob("*") if p.is_file()) if res_dir.exists() else 0
    w, so, e, n = g["bbox"]
    import math
    km_w = (e - w) * 111.32 * math.cos(math.radians((so + n) / 2))
    km_h = (n - so) * 110.57
    ph = I.provenance_hashes(s)
    reviews = db.rows("SELECT decision, reviewer, note, created_at FROM reviews WHERE scene_id=? AND aoi=? ORDER BY id", (scene_id, A.cur()))
    versions = [
        {"version": "v1.0", "label": "Raw acquisition", "by": "Planetary Computer STAC ingest", "at": _fmt(base),
         "detail": "Original Sentinel-2 L2A (+ Sentinel-1 RTC) on the shared 10 m grid, never overwritten",
         "hash": next(iter(ph["inputs"].values()), None)},
        {"version": "v1.1", "label": "Trust-processed", "by": f"TerraTrust {ph['pipeline_version']}", "at": _mtime(scene_id),
         "detail": f"Masks, recovery ({s['metrics']['recon_pct']}% reconstructed), validation, Trust Score {s['trust_score']} · {s['status']}",
         "hash": ph["bundle"]},
    ]
    for k, r in enumerate(reviews):
        versions.append({"version": f"v1.{2 + k}", "label": f"Human review: {r['decision']}", "by": r["reviewer"], "at": r["created_at"],
                         "detail": r["note"] or "No note", "hash": None})
    return {"scene_id": scene_id, "title": s["info"]["title"], "date": _fmt(s["date"]), "status": s["status"], "trust_score": s["trust_score"],
            "source": "Copernicus Sentinel-2 L2A" + (" + Sentinel-1 GRD RTC" if s["sensors"]["s1"] else ""),
            "sensor": "MSI (multispectral)" + (" + C-SAR" if s["sensors"]["s1"] else ""), "product_id": s["sensors"]["s2"].get("item_id"),
            "tile": s["sensors"]["s2"].get("tile"), "crs": g["crs"], "resolution_m": g["res_m"], "grid": g["grid"], "bbox": g["bbox"],
            "extent_km": [round(km_w, 2), round(km_h, 2)], "area_km2": round(km_w * km_h, 1),
            "bands": ["B02", "B03", "B04", "B05", "B08", "B11", "B12", "SCL"] + (["VV", "VH"] if s["sensors"]["s1"] else []),
            "format": "Analysis-ready arrays (NPZ) · exported as GeoTIFF in the dataset ZIP", "files": files, "output_bytes": out_bytes,
            "version": versions[-1]["version"], "versions": versions, "provenance_complete": all(v for v in ph["inputs"].values()),
            "synthetic": s["synthetic"], "demo": s["info"]["demo"]}
