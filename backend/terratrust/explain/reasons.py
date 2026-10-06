"""Human-readable explanations, contribution waterfall and the False Confidence Detector."""
from __future__ import annotations

from typing import Any

from ..config import COMPONENTS, thresholds, weights

LABELS = {"completeness": "Data completeness", "cloud": "Cloud / shadow quality", "noise": "Noise quality",
          "sensor_agreement": "S1/S2 agreement", "temporal": "Temporal consistency", "anomaly": "Anomaly (inverted)",
          "drift": "Data drift (inverted)", "reconstruction": "Reconstruction reliability"}


def waterfall(comp: dict[str, float | None], penalties: dict[str, float], final: float) -> list[dict[str, Any]]:
    """Points lost per component from a perfect 100, then penalties -> final score."""
    w = weights()
    avail = {k: v for k, v in comp.items() if v is not None}
    tot = sum(w[k] for k in avail)
    steps = [{"name": "Perfect data", "value": 100.0, "kind": "start"}]
    for k in COMPONENTS:
        if k in avail:
            steps.append({"name": LABELS[k], "key": k, "value": -round(w[k] / tot * (100 - avail[k]), 2), "kind": "component"})
    for k, v in penalties.items():
        if abs(v) > 0.05:
            steps.append({"name": k, "value": -round(v, 2), "kind": "penalty"})
    steps.append({"name": "Trust Score", "value": round(final, 1), "kind": "end"})
    return steps


def reasons(m: dict[str, Any]) -> dict[str, list[str]]:
    pos, neg = [], []
    c = m["components"]
    if m["cloud_pct"] < 5:
        pos.append(f"Low cloud contamination ({m['cloud_pct']:.1f}%)")
    elif m["cloud_pct"] >= 20:
        neg.append(f"Heavy cloud cover ({m['cloud_pct']:.1f}%) and shadow ({m['shadow_pct']:.1f}%) obscure the optical signal")
    else:
        neg.append(f"Moderate cloud/shadow contamination ({m['cloud_pct'] + m['shadow_pct']:.1f}%)")
    if m["missing_pct"] > 2:
        neg.append(f"{m['missing_pct']:.1f}% missing / no-data pixels (sensor dropout)")
    else:
        pos.append("Complete coverage, no sensor dropouts")
    if c["sensor_agreement"] is None:
        neg.append("No Sentinel-1 acquisition within the match window, cross-sensor validation unavailable")
    elif c["sensor_agreement"] >= 80:
        pos.append(f"Strong S1/S2 physical agreement ({c['sensor_agreement']:.0f}%)")
    elif c["sensor_agreement"] < 60:
        neg.append(f"Weak S1/S2 agreement ({c['sensor_agreement']:.0f}%): optical and radar tell different stories")
    if c["noise"] >= 80:
        pos.append(f"Noise within normal range (noise quality {m['noise_label']}, normal speckle not penalised)")
    else:
        neg.append(f"Elevated noise: optical {m['noise_ratio_opt']:.1f}x / SAR {m['noise_ratio_sar']:.1f}x the historical baseline")
    if m["drift_level"] == "LOW":
        pos.append("Feature distributions match the seasonal baseline (low drift)")
    else:
        neg.append(f"{m['drift_level']} data drift vs. same-season baseline (PSI {m['psi']:.2f})")
    if m.get("calibration_flag"):
        neg.append(f"Radiometric calibration drift: {m['calibration_flag']}")
    if m["anomaly_level"] != "LOW":
        neg.append(f"{m['anomaly_level']} Isolation-Forest anomaly score in {m['anomalous_tiles']} tile(s)")
    if m["impossible_pct"] > 0:
        neg.append(f"Physically impossible values: NDVI outside [-1, 1] in {m['impossible_pct']:.2f}% of pixels")
    if m["suspected_error_tiles"]:
        neg.append(f"Temporal anomaly in {m['suspected_error_tiles']} tile(s) NOT confirmed by Sentinel-1, suspected data error")
    if m["real_event_tiles"]:
        pos.append(f"Temporal change in {m['real_event_tiles']} tile(s) confirmed by Sentinel-1: real event, not penalised")
    if m["recon_pct"] > 0.5:
        neg.append(f"{m['recon_pct']:.1f}% of pixels RECONSTRUCTED from ±{m['recovery_window']} day history (mean uncertainty {m['recon_uncertainty']:.2f})")
    if m["unrecovered_pct"] > 0.5:
        neg.append(f"{m['unrecovered_pct']:.1f}% of pixels have no valid history and remain missing (not fabricated)")
    return {"positive": pos, "negative": neg}


def false_confidence(c: dict[str, float | None], drift_level: str) -> dict[str, Any]:
    th = thresholds()["false_confidence"]
    visual = min(c["cloud"], c["completeness"])
    triggers = []
    if c["sensor_agreement"] is not None and c["sensor_agreement"] < th["max_agreement"]:
        triggers.append(f"S1/S2 agreement only {c['sensor_agreement']:.0f}%")
    if drift_level == "HIGH":
        triggers.append("HIGH distribution drift")
    if c["temporal"] < th["max_temporal"]:
        triggers.append(f"temporal consistency only {c['temporal']:.0f}")
    on = visual >= th["min_visual_quality"] and bool(triggers)
    return {"detected": on, "visual_quality": round(visual, 1), "triggers": triggers if on else [],
            "message": ("This scene looks clean but hidden cross-sensor/statistical inconsistencies reduce reliability."
                        if on else "")}
