"""Trust Intelligence API: machine-readable answers to "can I trust this scene for THIS task?"."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from terratrust import aoi as A
from terratrust import intelligence as I
from .. import db
from ..services import summary

router = APIRouter(prefix="/api", tags=["Trust Intelligence"])


def _uc(use_case: str) -> str:
    if use_case not in I.use_cases():
        raise HTTPException(400, f"Unknown use case. Options: {', '.join(I.use_cases())}")
    return use_case


@router.get("/use-cases", summary="Fit-for-purpose requirement profiles")
def use_cases():
    return [{"id": k, **v} for k, v in I.use_cases().items()]


@router.get("/scene/{scene_id}/fitness", summary="Fit-for-purpose trust for every use case (GO / CONDITIONAL / NO-GO)")
def fitness(scene_id: str):
    return I.fitness(summary(scene_id))


@router.get("/scene/{scene_id}/preflight", summary="Pre-flight checklist for one use case")
def preflight(scene_id: str, use_case: str = Query("crop")):
    s = summary(scene_id)
    f = I.fitness(s)[_uc(use_case)]
    return {**f, "scene_id": scene_id, "fallbacks": I.fallback(s, use_case) if f["status"] != "GO" else []}


@router.get("/scene/{scene_id}/silent", summary="Silent Failure Risk: hidden issues inside the clean-looking area")
def silent(scene_id: str):
    return I.silent_failure(summary(scene_id))


@router.get("/scene/{scene_id}/impact", summary="Impact-weighted quality, contamination radius and trust graph")
def impact(scene_id: str):
    return I.impact(summary(scene_id))


@router.get("/scene/{scene_id}/fallback", summary="Ranked alternatives when the scene is not GO")
def fallback(scene_id: str, use_case: str = Query("crop")):
    return I.fallback(summary(scene_id), _uc(use_case))


@router.get("/scene/{scene_id}/reproduce", summary="Re-run the pipeline from hashed inputs and compare with the stored result")
def reproduce(scene_id: str):
    summary(scene_id)
    return I.reproduce(scene_id)


@router.get("/scene/{scene_id}/intelligence", summary="Everything above in one call (used by the UI)")
def bundle(scene_id: str):
    s = summary(scene_id)
    sil = I.silent_failure(s)
    fit = I.fitness(s, sil)
    return {"scene_id": scene_id, "silent": sil, "fitness": fit, "impact": I.impact(s),
            "fallbacks": {u: I.fallback(s, u) for u, f in fit.items() if f["status"] != "GO"}}


@router.get("/intelligence/location", summary="Location-level intelligence: EO data debt and quality memory")
def location():
    reviews = {r["scene_id"]: r["decision"] for r in db.rows("SELECT scene_id, decision FROM reviews WHERE aoi=?", (A.cur(),))}
    return {"aoi": A.cur(), "debt": I.data_debt(reviews), "memory": I.memory()}
