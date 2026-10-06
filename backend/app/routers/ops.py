from __future__ import annotations

from fastapi import APIRouter, HTTPException

from terratrust import aoi as A
from terratrust import scenes as S
from terratrust.config import COMPONENTS, profiles, thresholds, weights
from terratrust.ingest import cache
from .. import db
from ..schemas import ReviewRequest, WebhookConfig
from ..services import fire_alert, summary, webhook_url

router = APIRouter(prefix="/api", tags=["Operations"])


@router.get("/profiles", summary="Use-case profiles (weights per downstream task)")
def get_profiles():
    return [{"id": k, **v} for k, v in profiles().items()]


@router.get("/config", summary="Active weights, thresholds and gate rules (from YAML)")
def get_config():
    return {"weights": weights(), "thresholds": thresholds(), "components": COMPONENTS, "aoi": cache.aoi()}


@router.get("/review/queue", summary="WARNING scenes waiting for a human decision")
def queue():
    decided = {r["scene_id"]: r for r in db.rows("SELECT * FROM reviews WHERE aoi=? ORDER BY id", (A.cur(),))}
    out = []
    for sid in S.all_ids():
        s = summary(sid)
        if s["status"] == "WARNING" or (s["false_confidence"]["detected"] and s["status"] != "BLOCKED"):
            out.append({"scene_id": sid, "title": s["info"]["title"], "date": s["date"], "trust_score": s["trust_score"],
                        "status": s["status"], "reasons": s["reasons_negative"][:3], "decision": decided.get(sid)})
    return out


@router.post("/review", summary="Record a human review decision")
def review(req: ReviewRequest):
    from .. import auth
    if not auth.can_see(auth.current(), req.aoi):
        raise HTTPException(403, "No access to this location")
    with A.use(req.aoi):
        summary(req.scene_id)
    from .. import auth
    u = auth.current()
    reviewer = u["name"] if u else req.reviewer
    rid = db.execute("INSERT INTO reviews(aoi,scene_id,decision,reviewer,note,created_at) VALUES (?,?,?,?,?,?)",
                     (req.aoi, req.scene_id, req.decision, reviewer, req.note, db.now()))
    return {"id": rid, "scene_id": req.scene_id, "decision": req.decision, "stored": True}


@router.get("/review/history")
def review_history():
    return db.rows("SELECT * FROM reviews WHERE aoi=? ORDER BY id DESC LIMIT 50", (A.cur(),))


@router.get("/alerts", summary="Webhook alert log")
def alerts():
    return db.rows("SELECT id, aoi, scene_id, status, target, delivered, response, created_at FROM alerts ORDER BY id DESC LIMIT 30")


@router.get("/webhook/config")
def get_webhook():
    return {"url": webhook_url(), "mode": "external" if webhook_url() else "built-in alert inbox"}


@router.post("/webhook/config", summary="Set the webhook URL fired on BLOCKED (empty = built-in inbox)")
def set_webhook(cfg: WebhookConfig):
    db.set_setting("webhook_url", cfg.url.strip())
    return get_webhook()


@router.post("/webhook/test", summary="Send a test alert for a BLOCKED demo scene")
async def test_webhook():
    return await fire_alert(summary("DEMO-SUSPICIOUS"))


@router.get("/constellation", summary="Satellites feeding the AOI (from cached STAC item metadata)")
def constellation():
    import numpy as np
    from collections import defaultdict
    info = {"S2A": ("Sentinel-2A", "MSI optical", 2015), "S2B": ("Sentinel-2B", "MSI optical", 2017), "S2C": ("Sentinel-2C", "MSI optical", 2024),
            "S1A": ("Sentinel-1A", "C-band SAR", 2014), "S1B": ("Sentinel-1B", "C-band SAR", 2016), "S1C": ("Sentinel-1C", "C-band SAR", 2024), "S1D": ("Sentinel-1D", "C-band SAR", 2025)}
    acc: dict[str, dict] = defaultdict(lambda: {"dates": [], "trust": []})
    for p in sorted(A.raw_dir().glob("S2_*.npz")) + sorted(A.raw_dir().glob("S1_*.npz")):
        plat = str(np.load(p)["item_id"])[:3]
        d = p.stem[3:]
        acc[plat]["dates"].append(d)
        if p.stem.startswith("S2"):
            acc[plat]["trust"].append(summary(S.real_id(d))["trust_score"])
    out = []
    for plat, v in sorted(acc.items()):
        name, sensor, launch = info.get(plat, (plat, "", None))
        out.append({"id": plat, "name": name, "sensor": sensor, "launch": launch, "acquisitions": len(v["dates"]),
                    "first": v["dates"][0], "last": v["dates"][-1],
                    "avg_trust": round(sum(v["trust"]) / len(v["trust"]), 1) if v["trust"] else None,
                    "orbit": "693 km SSO, 10:30 LTDN" if plat.startswith("S2") else "693 km SSO, 06:00 LTDN",
                    "revisit_days": 10 if plat.startswith("S2") else 12})
    return out
