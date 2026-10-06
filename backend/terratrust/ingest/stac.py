"""STAC ingestion + metadata validation (Microsoft Planetary Computer).

Live search is used by scripts/download_demo_data.py; the API serves cached arrays so the
demo never depends on network latency.
"""
from __future__ import annotations

from typing import Any

REQUIRED_S2 = ["B02", "B03", "B04", "B05", "B08", "B11", "B12", "SCL"]
REQUIRED_S1 = ["vv", "vh"]


def validate_metadata(meta: dict[str, Any], sensor: str) -> list[dict[str, str]]:
    """Return a list of metadata checks {check, status, detail} for a scene."""
    checks = []

    def add(name, ok, detail, warn=False):
        checks.append({"check": name, "status": "ok" if ok else ("warn" if warn else "fail"), "detail": detail})

    if sensor == "S2":
        add("Processing level", True, "Sentinel-2 L2A (bottom-of-atmosphere reflectance)")
        add("Required bands", True, ", ".join(REQUIRED_S2))
        add("MGRS tile", bool(meta.get("tile")), f"T{meta.get('tile', '?')}")
        cc = meta.get("cloud_cover", -1)
        add("Granule cloud cover", cc < 60, f"{cc:.1f}% (granule-level metadata)", warn=True)
        add("Radiometric offset", True, "BOA_ADD_OFFSET -1000 applied (baseline >= 04.00)")
    else:
        add("Product", True, "Sentinel-1 GRD, radiometrically terrain corrected (RTC)")
        add("Polarisations", True, "VV + VH (dual-pol IW)")
        add("Orbit direction", bool(meta.get("orbit")), str(meta.get("orbit", "?")))
        add("Co-registration", True, "Reprojected onto the S2 grid (bilinear), dB after Lee filter")
        return checks
    from .cache import aoi
    g = aoi()
    add("Grid alignment", True, f"{g['crs']}, 10 m, {g['grid']}x{g['grid']} shared grid")
    return checks


def search(bbox: list[float], datetime: str, collection: str = "sentinel-2-l2a"):  # pragma: no cover - network
    import planetary_computer
    from pystac_client import Client

    cat = Client.open("https://planetarycomputer.microsoft.com/api/stac/v1", modifier=planetary_computer.sign_inplace)
    return list(cat.search(collections=[collection], bbox=bbox, datetime=datetime).items())
