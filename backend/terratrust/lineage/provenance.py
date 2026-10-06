"""Per-pixel provenance: Observed -> Masked -> Cleaned -> Reconstructed -> Confidence -> Final Trust."""
from __future__ import annotations

import numpy as np

OBSERVED, CLEANED, RECONSTRUCTED = 0, 1, 2


def provenance(valid: np.ndarray, recon: np.ndarray) -> np.ndarray:
    """0 = original observation, 1 = masked & left empty (cleaned out), 2 = reconstructed."""
    p = np.full(valid.shape, CLEANED, np.uint8)
    p[valid] = OBSERVED
    p[recon] = RECONSTRUCTED
    return p


def chain(valid: np.ndarray, masked: np.ndarray, recon: np.ndarray, unc: np.ndarray, trust: float) -> list[dict]:
    n = valid.size
    return [
        {"stage": "Observed", "pixels": int(n), "pct": 100.0, "detail": "Raw Sentinel-2 L2A + Sentinel-1 RTC on shared 10 m grid"},
        {"stage": "Masked", "pixels": int(masked.sum()), "pct": round(100 * masked.mean(), 2), "detail": "Cloud, shadow, no-data, defective flagged"},
        {"stage": "Cleaned", "pixels": int(valid.sum()), "pct": round(100 * valid.mean(), 2), "detail": "Original observations kept untouched"},
        {"stage": "Reconstructed", "pixels": int(recon.sum()), "pct": round(100 * recon.mean(), 2), "detail": "Quality-weighted temporal median, labelled RECONSTRUCTED"},
        {"stage": "Confidence", "pixels": int(recon.sum()), "pct": round(float(np.nanmean(unc)) if recon.any() else 0.0, 3), "detail": "Mean reconstruction uncertainty (0-1)"},
        {"stage": "Final Trust", "pixels": int(n), "pct": round(trust, 1), "detail": "Scene Trust Score"},
    ]
