"""Trust Score engine: weighted components + nonlinear penalties + hard gate rules + uncertainty.

    base_score  = sum_i  w_i * component_i                     (components 0..100)
    final_score = base_score * critical_penalty - reconstruction_penalty(ratio)
    scene_score = (1 - w) * mean(tile scores) + w * mean(worst 10 % tiles)
    status      = thresholds -> then hard gate rules override (BLOCK / cap at WARNING)

ML models (Isolation Forest, XGBoost) only supply *evidence* (components); this hybrid rule +
weighted engine always makes the final decision.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from ..config import COMPONENTS, profiles, thresholds, weights


def reconstruction_penalty(ratio: np.ndarray | float, tolerance: float = 1.0) -> np.ndarray:
    """Sigmoid penalty: ~0 up to 5 % reconstructed, steep rise after ~25 %."""
    c = thresholds()["reconstruction_penalty"]
    r = np.asarray(ratio, dtype=np.float64)
    p = c["max_points"] / (1 + np.exp(-(r - c["midpoint"]) / c["steepness"]))
    p0 = c["max_points"] / (1 + np.exp(c["midpoint"] / c["steepness"]))  # value at r = 0
    return np.clip(p - p0, 0, None) * tolerance


def weighted_base(comp: dict[str, np.ndarray], w: dict[str, float]) -> np.ndarray:
    """Weighted mean of available components; NaN components (e.g. no S1) are re-normalised away."""
    num = 0.0
    den = 0.0
    for k in COMPONENTS:
        v = np.asarray(comp[k], dtype=np.float64)
        m = np.isfinite(v)
        num = num + np.where(m, v * w[k], 0)
        den = den + np.where(m, w[k], 0)
    return num / np.maximum(den, 1e-9)


def critical_penalty(impossible_frac: np.ndarray, suspected_error: np.ndarray, agreement: np.ndarray,
                     noise: np.ndarray | None = None, anomaly_sev: np.ndarray | None = None) -> np.ndarray:
    """Multiplicative penalty (<= 1) for critical defects that a weighted average would dilute."""
    pen = 1.0 - np.clip(impossible_frac * 4, 0, 0.5)
    if noise is not None:
        pen = pen * np.where(noise < 30, 0.85, 1.0)
    if anomaly_sev is not None:
        pen = pen * (1 - 0.15 * np.clip(anomaly_sev, 0, 1))
    pen = pen * np.where(suspected_error, 0.85, 1.0)
    ag = np.nan_to_num(np.asarray(agreement, dtype=np.float64), nan=100.0)
    pen = pen * np.clip(0.55 + 0.45 * ag / 70.0, 0.55, 1.0)  # optical/radar contradiction is critical
    return pen


def tile_scores(comp: dict[str, np.ndarray], recon_ratio: np.ndarray, crit: np.ndarray,
                w: dict[str, float] | None = None, tolerance: float = 1.0) -> np.ndarray:
    w = w or weights()
    s = weighted_base(comp, w) * crit - reconstruction_penalty(recon_ratio, tolerance)
    return np.clip(s, 0, 100)


def aggregate(tile_s: np.ndarray) -> float:
    w = thresholds()["aggregation"]["worst_tile_weight"]
    s = np.sort(tile_s)
    k = max(1, int(round(len(s) * 0.1)))
    return float((1 - w) * s.mean() + w * s[:k].mean())


def status_from_score(score: float) -> str:
    st = thresholds()["status"]
    return "PASS" if score >= st["pass"] else ("WARNING" if score >= st["warning"] else "BLOCKED")


def gate_rules(m: dict[str, Any]) -> list[dict[str, str]]:
    """Hard gate rules evaluated on scene-level metrics (percentages)."""
    g = thresholds()["gate_rules"]
    out = []
    if m["cloud_pct"] > g["max_cloud_cover"]:
        out.append({"rule": "cloud_cover", "action": "BLOCK",
                    "message": f"Cloud cover {m['cloud_pct']:.1f}% > {g['max_cloud_cover']}%"})
    if m.get("agreement") is not None and m["agreement"] < g["min_sensor_agreement"]:
        out.append({"rule": "sensor_agreement", "action": "BLOCK",
                    "message": f"S1/S2 agreement {m['agreement']:.1f}% < {g['min_sensor_agreement']}%"})
    if m["missing_pct"] > g["max_missing_pixels"]:
        out.append({"rule": "missing_pixels", "action": "BLOCK",
                    "message": f"Missing pixels {m['missing_pct']:.1f}% > {g['max_missing_pixels']}%"})
    if m.get("impossible_pct", 0) > g.get("max_impossible_pct", 5):
        out.append({"rule": "impossible_values", "action": "BLOCK",
                    "message": f"Physically impossible values in {m['impossible_pct']:.1f}% of pixels > {g.get('max_impossible_pct', 5)}%"})
    if m.get("calibration_flag"):
        out.append({"rule": "radiometric_calibration", "action": "CAP_WARNING",
                    "message": f"Radiometric calibration drift: {m['calibration_flag']}"})
    if m["recon_pct"] > g["max_reconstruction"]:
        out.append({"rule": "reconstruction", "action": "CAP_WARNING",
                    "message": f"Reconstructed {m['recon_pct']:.1f}% > {g['max_reconstruction']}%, human review required"})
    if m["drift_level"] == "HIGH" and (m.get("agreement") is not None and m["agreement"] < g["drift_agreement_cap"]):
        out.append({"rule": "drift_and_agreement", "action": "CAP_WARNING",
                    "message": f"HIGH drift with low S1/S2 agreement ({m['agreement']:.1f}%)"})
    return out


def apply_gates(status: str, rules: list[dict[str, str]]) -> str:
    if any(r["action"] == "BLOCK" for r in rules):
        return "BLOCKED"
    if status == "PASS" and any(r["action"] == "CAP_WARNING" for r in rules):
        return "WARNING"
    return status


def uncertainty(tile_s: np.ndarray, comp: dict[str, np.ndarray], recon_ratio: np.ndarray, crit: np.ndarray,
                recon_unc: float, has_s1: bool, n_boot: int = 200, seed: int = 0) -> float:
    """Half-width of the ~95 % interval: tile bootstrap + component perturbation + reconstruction."""
    rng = np.random.default_rng(seed)
    n = len(tile_s)
    boot = [aggregate(tile_s[rng.integers(0, n, n)]) for _ in range(n_boot)]
    pert = []
    for _ in range(60):
        c2 = {k: np.clip(np.asarray(v) + rng.normal(0, 4, size=np.shape(v)), 0, 100) for k, v in comp.items()}
        pert.append(aggregate(tile_scores(c2, recon_ratio, crit)))
    hw = 1.96 * np.sqrt(np.var(boot) + np.var(pert))
    hw += 12 * float(np.mean(recon_ratio)) * recon_unc + (4 if not has_s1 else 0)
    return float(max(2.0, round(hw, 1)))


def ai_readiness(comp: dict[str, np.ndarray], recon_ratio: np.ndarray, crit: np.ndarray, profile: str,
                 has_s1: bool) -> float:
    p = profiles()[profile]
    s = aggregate(tile_scores(comp, recon_ratio, crit, p["weights"], p.get("reconstruction_tolerance", 1.0)))
    if p.get("sar_primary") and not has_s1:
        s *= 0.6
    return float(np.clip(s, 0, 100))
