"""Quality engine: cloud / shadow / missing-pixel detection and noise scoring.

Cloud detection combines the Sentinel-2 L2A Scene Classification Layer (SCL) with an
independent spectral whiteness test, so clouds are still caught when SCL is wrong or absent
(e.g. synthetic clouds injected in the Corruption Lab).
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_dilation, median_filter, uniform_filter

from ..preprocess.core import EPS

# SCL classes
SCL_NODATA, SCL_DEFECTIVE, SCL_DARK, SCL_SHADOW = 0, 1, 2, 3
SCL_VEG, SCL_SOIL, SCL_WATER, SCL_UNCLASS = 4, 5, 6, 7
SCL_CLOUD_MED, SCL_CLOUD_HIGH, SCL_CIRRUS, SCL_SNOW = 8, 9, 10, 11


def detect(refl: dict[str, np.ndarray], scl: np.ndarray) -> dict[str, np.ndarray]:
    """Return boolean masks: cloud, shadow, missing, defective, valid."""
    b2, b3, b4, b8, b11 = (refl[k] for k in ("B02", "B03", "B04", "B08", "B11"))
    nan = ~np.isfinite(b2) | ~np.isfinite(b4) | ~np.isfinite(b8) | ~np.isfinite(b11)
    missing = nan | (scl == SCL_NODATA)
    defective = (scl == SCL_DEFECTIVE) & ~missing

    with np.errstate(invalid="ignore"):
        vis = (b2 + b3 + b4) / 3
        flat = (np.maximum(np.maximum(b2, b3), b4) - np.minimum(np.minimum(b2, b3), b4)) / (vis + EPS)
        ndvi = (b8 - b4) / (b8 + b4 + EPS)
        ndwi = (b3 - b8) / (b3 + b8 + EPS)
        white = (vis > 0.22) & (flat < 0.30) & (ndvi < 0.30)
        dark = (b8 < 0.075) & (b11 < 0.06) & (ndwi < 0.0) & (vis < 0.06)
    cloud = (np.isin(scl, [SCL_CLOUD_MED, SCL_CLOUD_HIGH, SCL_CIRRUS]) | white) & ~missing
    shadow = ((scl == SCL_SHADOW) | dark) & ~missing & ~cloud
    valid = ~(missing | defective | cloud | shadow)
    return {"cloud": cloud, "shadow": shadow, "missing": missing, "defective": defective, "valid": valid}


def clear_mask(refl: dict[str, np.ndarray], scl: np.ndarray) -> np.ndarray:
    return detect(refl, scl)["valid"]


def optical_noise_sigma(b: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Robust per-pixel high-frequency residual |x - median3x3(x)| (NaN where invalid)."""
    x = np.where(np.isfinite(b), b, 0).astype(np.float32)
    res = np.abs(x - median_filter(x, size=3))
    res[~valid] = np.nan
    return res


def sar_local_cv2(vv_lin: np.ndarray, size: int = 7) -> np.ndarray:
    """Local squared coefficient of variation (Ci^2) of SAR intensity; 1/Ci^2 ~ ENL in flat areas."""
    m = uniform_filter(vv_lin, size)
    v = np.maximum(uniform_filter(vv_lin * vv_lin, size) - m * m, 0)
    return v / (m * m + EPS)


def noise_score(ratio: np.ndarray | float) -> np.ndarray:
    """Map noise ratio (current / historical baseline, 1 = normal) to 0-100 quality."""
    r = np.asarray(ratio, dtype=np.float32)
    return 100.0 / (1.0 + (np.maximum(r, 0) / 2.2) ** 3)


def noise_label(score: float) -> str:
    return "HIGH" if score >= 75 else ("MEDIUM" if score >= 50 else "LOW")


def dilate(mask: np.ndarray, it: int = 2) -> np.ndarray:
    return binary_dilation(mask, iterations=it)
