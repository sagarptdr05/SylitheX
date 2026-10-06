"""Preprocessing: reflectance scaling, spectral indices, SAR dB conversion and speckle filtering."""
from __future__ import annotations

import numpy as np
from scipy.ndimage import uniform_filter

EPS = 1e-6


def to_reflectance(dn: np.ndarray) -> np.ndarray:
    """L2A DN -> BOA reflectance (processing baseline >= 04.00 has a +1000 offset). 0 DN -> NaN."""
    r = (dn.astype(np.float32) - 1000.0) / 10000.0
    r[dn == 0] = np.nan
    return np.clip(r, 0, 1.5)


def nd(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a - b) / (a + b + EPS)


def indices(refl: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    return {
        "NDVI": nd(refl["B08"], refl["B04"]),
        "NDWI": nd(refl["B03"], refl["B08"]),
        "NDBI": nd(refl["B11"], refl["B08"]),
        "NDRE": nd(refl["B08"], refl["B05"]),
    }


def to_db(lin: np.ndarray) -> np.ndarray:
    return 10.0 * np.log10(np.maximum(lin, 1e-5))


def lee_filter(img: np.ndarray, size: int = 7, looks: float = 4.4) -> np.ndarray:
    """Lee speckle filter on linear intensity.

    Uses the multiplicative speckle model: Cu^2 = 1/ENL. Homogeneous areas are smoothed to the
    local mean; edges/point targets (high local variation) are preserved.
    """
    mean = uniform_filter(img, size)
    sq = uniform_filter(img * img, size)
    var = np.maximum(sq - mean * mean, 0)
    cu2 = 1.0 / looks
    ci2 = var / (mean * mean + EPS)
    w = np.clip(1 - cu2 / (ci2 + EPS), 0, 1)
    return mean + w * (img - mean)


def enl(img: np.ndarray, size: int = 9) -> float:
    """Equivalent Number of Looks from the most homogeneous windows (mean^2 / var)."""
    mean = uniform_filter(img, size)
    var = np.maximum(uniform_filter(img * img, size) - mean * mean, EPS)
    ratio = (mean * mean / var)[size::size, size::size].ravel()
    ratio = ratio[np.isfinite(ratio)]
    if ratio.size == 0:
        return 0.0
    return float(np.percentile(ratio, 90))  # homogeneous patches have the highest ENL
