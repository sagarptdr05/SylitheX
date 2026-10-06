"""Download a 12-month Sentinel-1 RTC + Sentinel-2 L2A time series for any AOI (Planetary Computer STAC).

Every scene is reprojected onto one fixed UTM grid (10 m, grid_px x grid_px) so all arrays are
pixel-aligned. Output: data/aois/<id>/raw/S2_YYYYMMDD.npz, S1_YYYYMMDD.npz and aoi.json.
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform as warp_transform

from .. import aoi as A

S2_BANDS = ["B02", "B03", "B04", "B05", "B08", "B11", "B12", "SCL"]
S1_BANDS = ["vv", "vh"]
RES = 10.0


def utm_epsg(lon: float, lat: float) -> str:
    zone = int((lon + 180) // 6) + 1
    return f"EPSG:{(32600 if lat >= 0 else 32700) + zone}"


def grid_for(lon: float, lat: float, grid: int):
    crs = utm_epsg(lon, lat)
    xs, ys = warp_transform("EPSG:4326", crs, [lon], [lat])
    x0, y1 = xs[0] - grid * RES / 2, ys[0] + grid * RES / 2
    tr = from_origin(x0, y1, RES, RES)
    bl = warp_transform(crs, "EPSG:4326", [x0, x0 + grid * RES], [y1 - grid * RES, y1])
    return crs, tr, [bl[0][0], bl[1][0], bl[0][1], bl[1][1]]


def _read(href: str, crs: str, tr, grid: int, categorical: bool, dtype) -> np.ndarray:
    dst = np.zeros((grid, grid), dtype=dtype)
    with rasterio.open(href) as src:
        reproject(source=rasterio.band(src, 1), destination=dst, dst_transform=tr, dst_crs=crs,
                  resampling=Resampling.nearest if categorical else Resampling.bilinear,
                  src_nodata=src.nodata, dst_nodata=0)
    return dst


def _even(items, n):
    if len(items) <= n:
        return items
    idx = np.linspace(0, len(items) - 1, n).round().astype(int)
    return [items[i] for i in sorted(set(idx))]


def download(aoi_id: str, lon: float, lat: float, grid: int = 768, date_range: str = "2025-09-01/2026-09-30",
             n_s2: int = 40, n_s1: int = 26, progress: Callable[[float, str], None] | None = None,
             name: str = "") -> dict:
    import planetary_computer
    from pystac_client import Client

    out = A.raw_dir(aoi_id)
    out.mkdir(parents=True, exist_ok=True)
    crs, tr, bbox = grid_for(lon, lat, grid)
    say = progress or (lambda f, m: None)
    say(0.01, "Searching Microsoft Planetary Computer STAC catalogue")
    cat = Client.open("https://planetarycomputer.microsoft.com/api/stac/v1", modifier=planetary_computer.sign_inplace)
    s2 = list(cat.search(collections=["sentinel-2-l2a"], bbox=bbox, datetime=date_range).items())
    s1 = list(cat.search(collections=["sentinel-1-rtc"], bbox=bbox, datetime=date_range).items())
    if not s2:
        raise RuntimeError("No Sentinel-2 L2A scenes found for this location / date range")
    # group granules by acquisition day: an AOI on a tile edge is mosaicked from all same-day granules
    def by_day(items):
        g: dict = {}
        for i in items:
            g.setdefault(i.datetime.date(), []).append(i)
        return [g[k] for k in sorted(g)]
    s2, s1 = _even(by_day(s2), n_s2), _even(by_day(s1), n_s1)
    tiles = [i.properties.get("s2:mgrs_tile", "") for grp in s2 for i in grp]
    tile = max(set(tiles), key=tiles.count) if tiles else ""
    total = len(s2) + len(s1)
    done = [0]

    def mosaic(items, band, cat, dtype):
        acc = None
        for it in items:
            a = _read(it.assets[band].href, crs, tr, grid, cat, dtype)
            acc = a if acc is None else np.where(acc == 0, a, acc)
            if (acc != 0).all():
                break
        return acc

    def f2(items):
        item = items[0]
        d = item.datetime.strftime("%Y%m%d")
        p = out / f"S2_{d}.npz"
        if not p.exists():
            items = sorted(items, key=lambda i: i.properties.get("s2:nodata_pixel_percentage", 0))
            arrs = {b: mosaic(items, b, b == "SCL", "uint8" if b == "SCL" else "uint16") for b in S2_BANDS}
            if (arrs["B04"] == 0).mean() > 0.5:  # AOI mostly outside this granule's swath
                done[0] += 1
                return
            np.savez_compressed(p, **arrs, cloud_cover=item.properties.get("eo:cloud_cover", -1),
                                tile=item.properties.get("s2:mgrs_tile", ""), item_id=item.id)
        done[0] += 1
        say(0.02 + 0.9 * done[0] / total, f"Downloading Sentinel-2 L2A {d}  ({done[0]}/{total})")

    def f1(items):
        item = items[0]
        d = item.datetime.strftime("%Y%m%d")
        p = out / f"S1_{d}.npz"
        if not p.exists():
            arrs = {b.upper(): mosaic(items, b, False, "float32") for b in S1_BANDS}
            if (arrs["VV"] == 0).mean() > 0.5:
                done[0] += 1
                return
            np.savez_compressed(p, **arrs, orbit=item.properties.get("sat:orbit_state", ""), item_id=item.id)
        done[0] += 1
        say(0.02 + 0.9 * done[0] / total, f"Downloading Sentinel-1 RTC {d}  ({done[0]}/{total})")

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(f2, s2))
        list(ex.map(f1, s1))
    meta = {"center": [lon, lat], "bbox": bbox, "grid": grid, "res_m": RES, "crs": crs, "transform": list(tr)[:6],
            "aoi_name": name or aoi_id, "tile": tile, "date_range": date_range,
            "n_s2": len(list(out.glob("S2_*.npz"))), "n_s1": len(list(out.glob("S1_*.npz")))}
    (A.root(aoi_id) / "aoi.json").write_text(json.dumps(meta, indent=2))
    return meta
