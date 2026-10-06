"""Areas of interest (AOIs): registry, per-AOI storage and the active-AOI context.

Every AOI owns an isolated folder  data/aois/<id>/{raw, results, models, *.npz, aoi.json, status.json}
so baselines, physics models and calibrations are always learned on that location's own history.
The active AOI is a ContextVar, set per request by the API middleware (or `with use(id):`).
"""
from __future__ import annotations

import json
import re
from contextlib import contextmanager
from contextvars import ContextVar
from functools import lru_cache, wraps
from pathlib import Path
from typing import Any, Callable

import yaml

from .config import CONFIG_DIR, DATA_DIR

AOI_ROOT = DATA_DIR / "aois"
CUSTOM_PATH = AOI_ROOT / "custom.json"
DEFAULT = "nashik"
_CUR: ContextVar[str] = ContextVar("aoi", default=DEFAULT)
_CACHES: list[Callable] = []


# ------------------------------------------------------------------ context
def cur() -> str:
    return _CUR.get()


def activate(aoi_id: str):
    return _CUR.set(aoi_id)


def deactivate(token) -> None:
    _CUR.reset(token)


@contextmanager
def use(aoi_id: str):
    tok = _CUR.set(aoi_id)
    try:
        yield
    finally:
        _CUR.reset(tok)


def aoi_cache(maxsize: int | None = 128):
    """lru_cache whose key includes the active AOI (so AOIs never share cached arrays)."""
    def deco(fn):
        cached = lru_cache(maxsize=maxsize)(lambda _aoi, *a: fn(*a))
        _CACHES.append(cached)

        @wraps(fn)
        def wrapper(*args):
            return cached(cur(), *args)
        wrapper.cache_clear = cached.cache_clear  # type: ignore[attr-defined]
        return wrapper
    return deco


def invalidate() -> None:
    for c in _CACHES:
        c.cache_clear()


# ------------------------------------------------------------------ paths
def root(a: str | None = None) -> Path:
    return AOI_ROOT / (a or cur())


def raw_dir(a: str | None = None) -> Path:
    return root(a) / "raw"


def results_dir(a: str | None = None) -> Path:
    return root(a) / "results"


def models_dir(a: str | None = None) -> Path:
    p = root(a) / "models"
    p.mkdir(parents=True, exist_ok=True)
    return p


# ------------------------------------------------------------------ registry
def _builtin() -> dict[str, dict[str, Any]]:
    return yaml.safe_load((CONFIG_DIR / "aois.yaml").read_text())


def _custom() -> dict[str, dict[str, Any]]:
    return json.loads(CUSTOM_PATH.read_text()) if CUSTOM_PATH.exists() else {}


def registry() -> dict[str, dict[str, Any]]:
    out = {k: {**v, "id": k, "builtin": True} for k, v in _builtin().items()}
    out.update({k: {**v, "id": k, "builtin": False} for k, v in _custom().items()})
    return out


def exists(a: str) -> bool:
    return a in registry()


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:32] or "aoi"
    base, i = s, 2
    while exists(s):
        s, i = f"{base}-{i}", i + 1
    return s


def add_custom(aoi_id: str, entry: dict[str, Any]) -> None:
    c = _custom()
    c[aoi_id] = entry
    AOI_ROOT.mkdir(parents=True, exist_ok=True)
    CUSTOM_PATH.write_text(json.dumps(c, indent=2))


def remove_custom(aoi_id: str) -> None:
    c = _custom()
    c.pop(aoi_id, None)
    CUSTOM_PATH.write_text(json.dumps(c, indent=2))


def geo(a: str | None = None) -> dict | None:
    p = root(a) / "aoi.json"
    return json.loads(p.read_text()) if p.exists() else None


# ------------------------------------------------------------------ build status
def status(a: str | None = None) -> dict[str, Any]:
    p = root(a) / "status.json"
    if p.exists():
        return json.loads(p.read_text())
    ready = (results_dir(a) / "downstream.json").exists()
    return {"state": "ready" if ready else "pending", "progress": 1.0 if ready else 0.0, "step": "", "message": ""}


def set_status(a: str, **kw) -> dict[str, Any]:
    st = {**status(a), **kw}
    root(a).mkdir(parents=True, exist_ok=True)
    (root(a) / "status.json").write_text(json.dumps(st))
    return st
