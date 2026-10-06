"""Tile helpers: every metric is computed per tile -> spatial Trust Map."""
from __future__ import annotations

import warnings

import numpy as np

from .config import thresholds


def tile_size() -> int:
    return int(thresholds()["tile_size"])


def blocks(a: np.ndarray, t: int | None = None) -> np.ndarray:
    """(H, W) -> (n_tiles, t*t) row-major tile blocks."""
    t = t or tile_size()
    h, w = a.shape
    ny, nx = h // t, w // t
    return a[: ny * t, : nx * t].reshape(ny, t, nx, t).transpose(0, 2, 1, 3).reshape(ny * nx, t * t)


def grid_shape(h: int, t: int | None = None) -> int:
    return h // (t or tile_size())


def frac(mask: np.ndarray) -> np.ndarray:
    return blocks(mask.astype(np.float32)).mean(axis=1)


def nanmed(a: np.ndarray, min_count: int = 20) -> np.ndarray:
    b = blocks(a)
    cnt = np.isfinite(b).sum(axis=1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        m = np.nanmedian(b, axis=1)
    m[cnt < min_count] = np.nan
    return m


def nanmean(a: np.ndarray, min_count: int = 20) -> np.ndarray:
    b = blocks(a)
    cnt = np.isfinite(b).sum(axis=1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        m = np.nanmean(b, axis=1)
    m[cnt < min_count] = np.nan
    return m


def nanstd(a: np.ndarray, min_count: int = 20) -> np.ndarray:
    b = blocks(a)
    cnt = np.isfinite(b).sum(axis=1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        m = np.nanstd(b, axis=1)
    m[cnt < min_count] = np.nan
    return m


def superpix(a: np.ndarray, s: int = 8) -> np.ndarray:
    """Block-average to s x s superpixels (NaN-aware)."""
    h, w = a.shape
    b = a[: h // s * s, : w // s * s].reshape(h // s, s, w // s, s)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(b, axis=(1, 3))


def subsample(a: np.ndarray, stride: int = 6) -> np.ndarray:
    """Per-tile regular subsample -> (n_tiles, k)."""
    t = tile_size()
    b = blocks(a).reshape(-1, t, t)[:, ::stride, ::stride]
    return b.reshape(b.shape[0], -1)
