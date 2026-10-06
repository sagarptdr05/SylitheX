"""Shared helpers for the API layer."""
from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import httpx
from fastapi import HTTPException

from terratrust import aoi as A
from terratrust import scenes as S
from terratrust.config import GLOBAL_DIR, profiles, thresholds
from . import db


def summary(scene_id: str, profile: str | None = None) -> dict:
    try:
        s = dict(S.load_summary(scene_id))
    except FileNotFoundError:
        raise HTTPException(404, f"Unknown scene '{scene_id}' in AOI '{A.cur()}'. See GET /api/scenes?aoi={A.cur()}")
    if profile:
        if profile not in profiles():
            raise HTTPException(400, f"Unknown profile '{profile}'")
        s["profile"] = profile
        s["ai_readiness"] = s["ai_readiness_all"][profile]
    return s


def gate_decision(status: str) -> str:
    return {"PASS": "Released to downstream AI model",
            "WARNING": "Routed to human review",
            "BLOCKED": "Rejected: data blocked from reaching the downstream AI model"}[status]


def trust_response(s: dict) -> dict:
    c = s["components"]
    return {
        "scene_id": s["scene_id"], "trust_score": s["trust_score"], "trust_interval": s["trust_interval"],
        "ai_readiness": s["ai_readiness"], "profile": s["profile"], "status": s["status"],
        "components": {"completeness": c["completeness"], "cloud": c["cloud"], "noise": c["noise"],
                       "sensor_agreement": c["sensor_agreement"], "temporal": c["temporal"],
                       "anomaly": s["levels"]["anomaly"], "drift": s["levels"]["drift"],
                       "reconstruction": s["metrics"]["recon_pct"]},
        "gate_rules_triggered": [{"rule": g["rule"], "action": g["action"], "message": g["message"]} for g in s["gate_rules_triggered"]],
        "false_confidence": s["false_confidence"]["detected"],
        "reasons": s["reasons"], "worst_tiles": s["worst_tiles"], "decision": gate_decision(s["status"]),
    }


def webhook_url() -> str:
    from .settings import WEBHOOK_URL
    return db.get_setting("webhook_url", "") or WEBHOOK_URL or thresholds()["webhook"].get("url", "") or ""


async def fire_alert(s: dict) -> dict:
    """On BLOCKED: POST to the configured webhook (Slack/Teams/any URL) or the built-in alert inbox."""
    payload = {"event": "terratrust.scene.blocked", "aoi": A.cur(), "scene_id": s["scene_id"], "status": s["status"],
               "trust_score": s["trust_score"], "reasons": s["reasons_negative"][:4],
               "gate_rules": [g["message"] for g in s["gate_rules_triggered"]], "timestamp": db.now(),
               "text": f"⛔ TerraTrust BLOCKED {s['scene_id']} (trust {s['trust_score']}): "
                       + "; ".join(g["message"] for g in s["gate_rules_triggered"]) }
    url = webhook_url()
    target, delivered, resp = "built-in alert inbox", 1, "stored"
    if url:
        target = url
        try:
            async with httpx.AsyncClient(timeout=4) as cl:
                r = await cl.post(url, json=payload)
            delivered, resp = int(r.is_success), f"HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            delivered, resp = 0, f"error: {e.__class__.__name__}"
    db.execute("INSERT INTO alerts(aoi,scene_id,status,target,delivered,response,payload,created_at) VALUES (?,?,?,?,?,?,?,?)",
               (A.cur(), s["scene_id"], s["status"], target, delivered, resp, json.dumps(payload), db.now()))
    return {"target": target, "delivered": bool(delivered), "response": resp}


def passport(scene_id: str) -> dict:
    s = summary(scene_id)
    body = {
        "passport_version": "1.0", "issuer": "TerraTrust AI Trust Layer", "issued_at": db.now(),
        "scene_id": s["scene_id"], "title": s["info"]["title"], "aoi_id": A.cur(),
        "aoi": f"{A.registry()[A.cur()]['name']} · {A.registry()[A.cur()].get('region', '')}",
        "sensors": s["sensors"], "synthetic_faults": s["synthetic"],
        "trust": {"score": s["trust_score"], "interval": s["trust_interval"], "status": s["status"],
                  "decision": gate_decision(s["status"])},
        "ai_readiness": s["ai_readiness_all"], "components": s["components"], "levels": s["levels"],
        "quality": {k: s["metrics"][k] for k in ("cloud_pct", "shadow_pct", "missing_pct", "recon_pct", "unrecovered_pct", "impossible_pct")},
        "gate_rules_triggered": s["gate_rules_triggered"], "false_confidence": s["false_confidence"],
        "reasons": s["reasons"], "lineage": s["lineage"], "metadata_checks": s["metadata_checks"],
        "recovery": {k: s["recovery"][k] for k in ("window_days", "recon_pct", "unrecovered_pct", "mean_uncertainty", "s1_plausibility")},
        "ml_evidence": s.get("ml_evidence"),
        "reviews": db.rows("SELECT decision, reviewer, note, created_at FROM reviews WHERE scene_id=? AND aoi=? ORDER BY id DESC", (scene_id, A.cur())),
        "config": {"weights_file": "configs/weights.yaml", "thresholds_file": "configs/thresholds.yaml"},
    }
    from terratrust import intelligence as I
    sil = I.silent_failure(s)
    body["fit_for_purpose"] = {k: {"name": v["name"], "status": v["status"], "score": v["score"], "why": v["why"]} for k, v in I.fitness(s, sil).items()}
    body["silent_failure"] = {"risk": sil["risk"], "level": sil["level"], "headline": sil["headline"]}
    body["provenance"] = I.provenance_hashes(s)
    body["checksum_sha256"] = passport_checksum(body)
    body["verify_url"] = f"/api/passport/{scene_id}/verify?aoi={A.cur()}&checksum={body['checksum_sha256']}"
    return body


def passport_checksum(body: dict) -> str:
    """SHA-256 over the content that defines the decision (not the issue time or later reviews)."""
    core = {k: v for k, v in body.items() if k not in ("issued_at", "reviews", "checksum_sha256", "verify_url")}
    return hashlib.sha256(json.dumps(core, sort_keys=True, default=str).encode()).hexdigest()


def passport_csv(scene_id: str) -> str:
    s = summary(scene_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["tile_id", "score", "status", "cloud_pct", "missing_pct", "reconstructed_pct", "sensor_agreement",
                "drift", "anomaly", "temporal_status", "reasons"])
    for t in s["tiles"]:
        w.writerow([t["id"], t["score"], t["status"], t["cloud"], t["missing"], t["reconstructed"], t["sensor_agreement"],
                    t["drift"], t["anomaly"], t["temporal_status"], " | ".join(t["reasons"])])
    return buf.getvalue()


def data_uri(img_bytes: bytes, fmt: str) -> str:
    return f"data:image/{'jpeg' if fmt == 'jpg' else 'png'};base64," + base64.b64encode(img_bytes).decode()


def static_json(name: str, global_: bool = False) -> dict:
    p = (GLOBAL_DIR if global_ else A.results_dir()) / name
    if not p.exists():
        raise HTTPException(404, f"{name} not built yet. Run scripts/build_aoi.py / build_benchmark.py")
    return json.loads(p.read_text())
