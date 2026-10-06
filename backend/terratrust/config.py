"""YAML-backed configuration: weights, thresholds and use-case profiles (nothing hardcoded)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

BACKEND = Path(__file__).resolve().parents[1]
CONFIG_DIR = BACKEND / "configs"
DATA_DIR = BACKEND / "data"
GLOBAL_DIR = DATA_DIR / "global"          # cross-AOI artefacts (benchmark)
MODELS_DIR = BACKEND / "models"           # cross-AOI models (XGBoost reliability)

COMPONENTS = ["completeness", "cloud", "noise", "sensor_agreement", "temporal", "anomaly", "drift", "reconstruction"]


def _load(name: str) -> dict[str, Any]:
    return yaml.safe_load((CONFIG_DIR / name).read_text())


@lru_cache
def weights() -> dict[str, float]:
    w = _load("weights.yaml")
    total = sum(w.values())
    return {k: w[k] / total for k in COMPONENTS}


@lru_cache
def thresholds() -> dict[str, Any]:
    return _load("thresholds.yaml")


@lru_cache
def profiles() -> dict[str, dict[str, Any]]:
    p = _load("profiles.yaml")
    for v in p.values():
        total = sum(v["weights"].values())
        v["weights"] = {k: v["weights"][k] / total for k in COMPONENTS}
    return p
