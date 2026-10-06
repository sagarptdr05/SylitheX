"""Runtime settings from backend/.env (or real environment variables)."""
from __future__ import annotations

import os
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / ".env"


def _load_env() -> None:
    if not ENV.exists():
        return
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_env()
API_KEYS = {k.strip() for k in os.environ.get("TERRATRUST_API_KEYS", "").split(",") if k.strip()}
WEBHOOK_URL = os.environ.get("TERRATRUST_WEBHOOK_URL", "")
PC_KEY = os.environ.get("PC_SDK_SUBSCRIPTION_KEY", "")  # read by `planetary_computer` automatically


def mask(k: str) -> str:
    return k[:8] + "…" + k[-4:] if len(k) > 14 else "****"
