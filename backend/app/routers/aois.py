"""Locations (AOIs): list, add a new location (background download + build), status, demo datasets."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from terratrust import aoi as A
from terratrust import scenes as S
from terratrust.build import build_async
from .. import auth
from ..schemas import AoiCreate


def _guard(aoi_id: str, owner_only: bool = False) -> dict:
    reg = A.registry().get(aoi_id)
    u = auth.current()
    if reg is None or not auth.can_see(u, aoi_id):
        raise HTTPException(404, "Unknown location")
    if owner_only and (reg.get("builtin") or not u or (u.get("role") != "admin" and reg.get("owner") != u["id"])):
        raise HTTPException(403, "Only the owner can change this location")
    return reg

router = APIRouter(prefix="/api", tags=["Locations"])


def _summary_stats(aoi_id: str) -> dict:
    out: dict = {}
    with A.use(aoi_id):
        g = A.geo(aoi_id)
        if g:
            out["bbox"], out["grid"], out["tile"], out["crs"] = g["bbox"], g["grid"], g.get("tile"), g["crs"]
            out["size_km"] = round(g["grid"] * g["res_m"] / 1000, 2)
        if A.status(aoi_id)["state"] == "ready":
            try:
                from terratrust.ingest import cache
                dates = cache.s2_dates()
                trusts, stat = [], {"PASS": 0, "WARNING": 0, "BLOCKED": 0}
                for d in dates:
                    s = S.load_summary(S.real_id(d))
                    trusts.append(s["trust_score"]); stat[s["status"]] += 1
                out.update({"n_s2": len(dates), "n_s1": len(cache.s1_dates()), "first": dates[0], "last": dates[-1],
                            "avg_trust": round(sum(trusts) / len(trusts), 1), "decisions": stat,
                            "demos": [{"id": d["id"], "base": d["base"], "title": d["title"]} for d in S.demos()]})
            except FileNotFoundError:
                pass
        mp = A.root(aoi_id) / "dataset_manifest.json"
        if mp.exists():
            m = json.loads(mp.read_text())
            out["dataset"] = {"size_bytes": m.get("size_bytes"), "scenes": len(m.get("scenes", []))}
    return out


@router.get("/aois", summary="All locations with build status and statistics")
def list_aois():
    u = auth.current()
    me = u["id"] if u else None
    return [{**{k: v for k, v in reg.items() if k not in ("demos", "owner")}, "mine": reg.get("owner") is not None and reg.get("owner") == me,
             "shared": bool(reg.get("builtin")), "status": A.status(k), **_summary_stats(k)}
            for k, reg in A.registry().items() if auth.can_see(u, k)]


@router.get("/aois/{aoi_id}", summary="One location")
def get_aoi(aoi_id: str):
    _guard(aoi_id)
    return next(a for a in list_aois() if a["id"] == aoi_id)


@router.post("/aois", summary="Add a new location: downloads 12 months of S1/S2 and builds it in the background")
def create_aoi(req: AoiCreate):
    u = auth.current()
    if not u:
        raise HTTPException(401, "Login required")
    building = [k for k in A.registry() if A.status(k)["state"] in ("building", "queued")]
    if building:
        raise HTTPException(409, f"Another location is being built ({building[0]}). Try again when it finishes.")
    aoi_id = A.slug(req.name)
    grid = int(round(req.size_km * 100 / 96)) * 96  # multiple of the 96 px tile
    A.add_custom(aoi_id, {"name": req.name, "region": req.region or f"{req.lat:.3f}°N {req.lon:.3f}°E",
                          "lat": req.lat, "lon": req.lon, "grid_px": grid, "theme": "Custom",
                          "description": req.description or "User-defined area of interest.",
                          "date_range": "2025-09-01/2026-09-30", "owner": u["id"]})
    build_async(aoi_id)
    return {"id": aoi_id, "status": A.status(aoi_id)}


@router.get("/aois/{aoi_id}/status", summary="Build progress of a location")
def aoi_status(aoi_id: str):
    _guard(aoi_id)
    return A.status(aoi_id)


@router.post("/aois/{aoi_id}/rebuild", summary="Retry / rebuild a location")
def rebuild(aoi_id: str):
    _guard(aoi_id, owner_only=not A.registry().get(aoi_id, {}).get("builtin"))
    has_data = any(A.raw_dir(aoi_id).glob("S2_*.npz")) if A.raw_dir(aoi_id).exists() else False
    build_async(aoi_id, skip_download=has_data and (A.root(aoi_id) / "aoi.json").exists())
    return A.status(aoi_id)


@router.delete("/aois/{aoi_id}", summary="Remove a user-added location")
def delete_aoi(aoi_id: str):
    reg = _guard(aoi_id, owner_only=True)
    if A.status(aoi_id)["state"] in ("building", "queued"):
        raise HTTPException(409, "Location is being built")
    import shutil
    A.remove_custom(aoi_id)
    shutil.rmtree(A.root(aoi_id), ignore_errors=True)
    A.invalidate()
    return {"deleted": aoi_id}


@router.get("/datasets", summary="Packaged demo datasets (one per ready location)")
def datasets():
    out = []
    for k, reg in A.registry().items():
        if not auth.can_see(auth.current(), k):
            continue
        mp = A.root(k) / "dataset_manifest.json"
        if mp.exists():
            m = json.loads(mp.read_text())
            out.append({"aoi": k, "name": reg["name"], "region": reg.get("region"), "theme": reg.get("theme"), **m})
    return out


@router.get("/aois/{aoi_id}/dataset.zip", summary="Download the demo dataset ZIP (GeoTIFF + JSON + CSV)")
def dataset_zip(aoi_id: str):
    _guard(aoi_id)
    p = A.root(aoi_id) / "demo_dataset.zip"
    if not p.exists():
        raise HTTPException(404, "Dataset not built for this location yet")
    return FileResponse(p, media_type="application/zip", filename=f"terratrust_demo_{aoi_id}.zip")
