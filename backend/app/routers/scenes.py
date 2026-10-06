from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse

from terratrust import scenes as S
from terratrust.ingest import cache
from .. import db
from ..services import passport, passport_csv, static_json, summary

router = APIRouter(prefix="/api", tags=["Scenes"])
LIGHT = ("tiles", "waterfall", "lineage", "metadata_checks", "recovery", "drift")


@router.get("/scenes", summary="List all scenes (demo scenarios + real time series)")
def list_scenes():
    out = []
    for sid in S.all_ids():
        try:
            s = summary(sid)
        except HTTPException:
            continue
        out.append({"scene_id": sid, **s["info"], "date": s["date"], "trust_score": s["trust_score"],
                    "trust_interval": s["trust_interval"], "status": s["status"], "ai_readiness_all": s["ai_readiness_all"],
                    "cloud_pct": s["metrics"]["cloud_pct"], "recon_pct": s["metrics"]["recon_pct"],
                    "false_confidence": s["false_confidence"]["detected"], "s1_date": s["fusion"]["s1_date"]})
    return out


@router.get("/scene/{scene_id}", summary="Full analysis of one scene")
def scene(scene_id: str, profile: str = "crop_monitoring"):
    return summary(scene_id, profile)


@router.get("/scene/{scene_id}/tiles", summary="Trust Map as GeoJSON (one polygon per tile)")
def tiles(scene_id: str):
    s = summary(scene_id)
    feats = [{"type": "Feature", "id": t["id"],
              "geometry": {"type": "Polygon", "coordinates": [t["polygon"] + [t["polygon"][0]]]},
              "properties": {k: v for k, v in t.items() if k != "polygon"}} for t in s["tiles"]]
    return {"type": "FeatureCollection", "scene_id": scene_id, "features": feats}


@router.get("/scene/{scene_id}/tile/{tile_id}", summary="Why should I trust this tile?")
def tile(scene_id: str, tile_id: str):
    s = summary(scene_id)
    t = next((t for t in s["tiles"] if t["id"] == tile_id), None)
    if t is None:
        raise HTTPException(404, "Unknown tile")
    verdict = {"PASS": "can be trusted", "WARNING": "should be reviewed before use", "BLOCKED": "should not be used"}[t["status"]]
    return {**t, "explanation": f"Tile {tile_id} scores {t['score']:.0f}/100 and {verdict}. " + "; ".join(t["reasons"]) + "."}


@router.get("/scene/{scene_id}/layer/{name}", summary="Rendered image layer")
def layer(scene_id: str, name: str):
    folder = S.result_dir(scene_id)
    for ext, mt in (("jpg", "image/jpeg"), ("png", "image/png")):
        p = folder / f"{name}.{ext}"
        if p.exists():
            return FileResponse(p, media_type=mt, headers={"Cache-Control": "public, max-age=3600"})
    raise HTTPException(404, "Layer not available")


@router.get("/timeline", summary="Trust Score over time for an AOI")
def timeline(aoi: str = Query("nashik", description="AOI id (see GET /api/aois)")):
    pts = []
    for d in cache.s2_dates():
        s = summary(S.real_id(d))
        neg = s["reasons_negative"]
        pts.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "scene_id": s["scene_id"], "trust": s["trust_score"],
                    "lo": s["trust_interval"][0], "hi": s["trust_interval"][1], "status": s["status"],
                    "readiness": s["ai_readiness_all"], "cloud": s["metrics"]["cloud_pct"],
                    "recon": s["metrics"]["recon_pct"], "cause": neg[0] if neg else "Clean observation",
                    "false_confidence": s["false_confidence"]["detected"]})
    month = defaultdict(list)
    for p in pts:
        month[p["date"][:7]].append(p)
    monthly = [{"month": m, "trust": round(sum(x["trust"] for x in v) / len(v), 1), "n": len(v),
                "pass": sum(x["status"] == "PASS" for x in v), "warning": sum(x["status"] == "WARNING" for x in v),
                "blocked": sum(x["status"] == "BLOCKED" for x in v)} for m, v in sorted(month.items())]
    # seasonal forecast: same calendar month one year earlier (monsoon climatology)
    by_m = {m["month"]: m["trust"] for m in monthly}
    forecast = []
    last = monthly[-1]["month"]
    y, mo = int(last[:4]), int(last[5:])
    for k in range(1, 4):
        mo2, y2 = (mo + k - 1) % 12 + 1, y + (mo + k - 1) // 12
        prev = f"{y2 - 1}-{mo2:02d}"
        if prev in by_m:
            forecast.append({"month": f"{y2}-{mo2:02d}", "trust": by_m[prev], "basis": f"same month {y2 - 1}"})
    from terratrust import aoi as A
    return {"aoi": A.cur(), "aoi_name": A.registry()[A.cur()]["name"], "points": pts, "monthly": monthly, "forecast": forecast,
            "seasons": [{"name": "SW Monsoon", "start": "2026-06-01", "end": "2026-09-30"},
                        {"name": "Monsoon tail", "start": "2025-09-01", "end": "2025-10-15"}]}


@router.get("/passport/{scene_id}", summary="Trust Passport (JSON or CSV)")
def get_passport(scene_id: str, format: str = "json"):
    if format == "csv":
        return PlainTextResponse(passport_csv(scene_id), media_type="text/csv",
                                 headers={"Content-Disposition": f"attachment; filename={scene_id}_tiles.csv"})
    return passport(scene_id)


@router.get("/passport/{scene_id}/verify", summary="Verify a Trust Passport checksum")
def verify_passport(scene_id: str, checksum: str):
    p = passport(scene_id)
    ok = p["checksum_sha256"] == checksum.strip().lower()
    return {"scene_id": scene_id, "valid": ok, "expected": p["checksum_sha256"], "status": p["trust"]["status"],
            "message": "Passport is authentic and matches the current analysis." if ok else "Checksum mismatch: the passport was altered or the scene was re-analysed."}


@router.get("/dashboard", summary="Fleet-level statistics")
def dashboard():
    sc = list_scenes()
    n = len(sc)
    from terratrust import aoi as A
    checks = db.rows("SELECT * FROM checks WHERE aoi=? ORDER BY id DESC LIMIT 8", (A.cur(),))
    return {
        "total": n, "pass": sum(s["status"] == "PASS" for s in sc), "warning": sum(s["status"] == "WARNING" for s in sc),
        "blocked": sum(s["status"] == "BLOCKED" for s in sc),
        "avg_trust": round(sum(s["trust_score"] for s in sc) / n, 1),
        "avg_readiness": round(sum(s["ai_readiness_all"]["crop_monitoring"] for s in sc) / n, 1),
        "false_confidence": sum(s["false_confidence"] for s in sc),
        "alerts": db.rows("SELECT COUNT(*) AS n FROM alerts WHERE aoi=?", (A.cur(),))[0]["n"],
        "reviews": db.rows("SELECT COUNT(*) AS n FROM reviews WHERE aoi=?", (A.cur(),))[0]["n"],
        "recent_checks": checks, "aoi": cache.aoi(),
    }


@router.get("/benchmark", summary="Synthetic Corruption Benchmark + validation curves", tags=["Validation"])
def benchmark():
    return static_json("benchmark.json", global_=True)


@router.get("/downstream", summary="Downstream impact: model accuracy with vs without TerraTrust", tags=["Validation"])
def downstream():
    return static_json("downstream.json")
