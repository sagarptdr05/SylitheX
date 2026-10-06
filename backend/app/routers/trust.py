from __future__ import annotations

import numpy as np
from fastapi import APIRouter

from terratrust import aoi as A
from terratrust.config import COMPONENTS, weights as default_weights
from terratrust.trust import engine as E
from .. import db
from .. import auth
from ..schemas import TrustCheckRequest, TrustCheckResponse, WhatIfRequest
from ..services import fire_alert, summary, trust_response

router = APIRouter(prefix="/api/trust", tags=["Trust Gate"])


@router.post("/check", response_model=TrustCheckResponse, summary="Trust Gate: score + PASS/WARNING/BLOCKED")
async def check(req: TrustCheckRequest):
    """Evaluate a scene before it reaches a downstream AI model.

    Returns the Trust Score (0-100) with a confidence interval, the task-specific AI Readiness for the
    chosen use-case profile, the gate decision, triggered hard rules and plain-language reasons.
    A BLOCKED decision fires the configured webhook.
    """
    auth.require(req.aoi)
    with A.use(req.aoi):
        s = summary(req.scene_id, req.profile)
        out = trust_response(s)
        out["aoi"] = req.aoi
        db.execute("INSERT INTO checks(aoi,scene_id,profile,status,trust,readiness,created_at) VALUES (?,?,?,?,?,?,?)",
                   (req.aoi, s["scene_id"], req.profile, s["status"], s["trust_score"], s["ai_readiness"], db.now()))
        if s["status"] == "BLOCKED":
            await fire_alert(s)
            out["alert_sent"] = True
        return out


@router.post("/whatif", summary="Recompute the Trust Score with custom component weights")
def whatif(req: WhatIfRequest):
    auth.require(req.aoi)
    with A.use(req.aoi):
        return _whatif(req)


def _whatif(req: WhatIfRequest):
    s = summary(req.scene_id)
    w = {k: max(0.0, float(req.weights.get(k, default_weights()[k]))) for k in COMPONENTS}
    tot = sum(w.values()) or 1
    w = {k: v / tot for k, v in w.items()}
    comp = {k: np.array([np.nan if t["components"][k] is None else t["components"][k] for t in s["tiles"]]) for k in COMPONENTS}
    crit = np.array([t.get("critical_penalty", 1.0) for t in s["tiles"]])
    rr = np.array([t.get("recon_ratio", t["reconstructed"] / 100) for t in s["tiles"]])
    ts = E.tile_scores(comp, rr, crit, w)
    score = E.aggregate(ts)
    status = E.apply_gates(E.status_from_score(score), s["gate_rules_triggered"])
    return {"scene_id": s["scene_id"], "weights": w, "trust_score": round(score, 1), "status": status,
            "tile_scores": [round(float(x), 1) for x in ts]}
