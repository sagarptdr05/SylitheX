from __future__ import annotations

import time

from fastapi import APIRouter

from terratrust import aoi as A
from terratrust import pipeline as P
from terratrust import render, scenes as S
from terratrust.corruption.inject import FaultConfig, inject, severity
from terratrust.fusion import reliability as R
from .. import auth
from ..schemas import FaultRequest
from ..services import data_uri, gate_decision

router = APIRouter(prefix="/api", tags=["Corruption Lab"])


@A.aoi_cache(maxsize=8)
def _base(scene_id: str) -> dict:
    return S.raw_for(scene_id)


@router.post("/inject-fault", summary="Inject SYNTHETIC faults into a clean scene and re-score live")
def inject_fault(req: FaultRequest):
    auth.require(req.aoi)
    with A.use(req.aoi):
        return _inject(req)


def _inject(req: FaultRequest):
    t0 = time.perf_counter()
    cfg = FaultConfig(**req.model_dump(exclude={"base_scene", "profile", "aoi"}))
    raw = inject(_base(req.base_scene), cfg)
    res = P.analyze(raw, req.profile)
    res["ml_evidence"] = R.explain(res)
    lay = render.layers(res)
    images = {k: data_uri(render.encode(*lay[k][:1], lay[k][1], size=512), lay[k][1])
              for k in ("original", "cloudmask", "sar", "provenance") if k in lay}
    keep = ("trust_score", "trust_uncertainty", "trust_interval", "ai_readiness", "ai_readiness_all", "status",
            "components", "levels", "metrics", "gate_rules_triggered", "false_confidence", "reasons_positive",
            "reasons_negative", "waterfall", "temporal", "ml_evidence", "synthetic", "processing_ms")
    out = {k: res[k] for k in keep}
    out["tiles"] = [{"id": t["id"], "row": t["row"], "col": t["col"], "score": t["score"], "status": t["status"],
                     "reasons": t["reasons"]} for t in res["tiles"]]
    out["images"] = images
    out["severity"] = severity(cfg)
    out["decision"] = gate_decision(res["status"])
    out["base_scene"] = req.base_scene
    from .eo import lab_carbon, scene_issues
    out["carbon"] = lab_carbon(req.base_scene, raw, res)
    iss = scene_issues({**res, "info": {"title": "Integrity Lab", "demo": True}})
    out["issues"] = [{k: i[k] for k in ("type", "severity", "why", "action", "n_tiles", "area_pct", "confidence")} for i in iss]
    out["response"] = {
        "detected": len(iss), "rules": [g["rule"] for g in res["gate_rules_triggered"]],
        "tiles_isolated": sum(t["status"] == "BLOCKED" for t in res["tiles"]), "tiles_total": len(res["tiles"]),
        "provenance_preserved": True, "original_untouched": True,
        "delivered_trust": out["carbon"].get("trusted", {}).get("trust"),
        "delivered": "fallback" if res["status"] == "BLOCKED" else "gated",
    }
    out["latency_ms"] = round((time.perf_counter() - t0) * 1000)
    return out
