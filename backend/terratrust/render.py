"""Render analysis layers to images (JPEG for opaque layers, PNG for transparent overlays)."""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

from .preprocess.core import to_db

LO, HI, GAMMA = 0.015, 0.22, 0.8


def rgb(refl: dict) -> np.ndarray:
    st = np.stack([refl["B04"], refl["B03"], refl["B02"]], -1)
    st = np.clip((np.nan_to_num(st, nan=0) - LO) / (HI - LO), 0, 1) ** GAMMA
    return (st * 255).astype(np.uint8)


def _lut(stops: list[tuple[float, tuple[int, int, int]]], x: np.ndarray) -> np.ndarray:
    xs = np.array([s for s, _ in stops]); cs = np.array([c for _, c in stops], float)
    x = np.clip(np.nan_to_num(x, nan=xs[0]), xs[0], xs[-1])
    return np.stack([np.interp(x, xs, cs[:, i]) for i in range(3)], -1).astype(np.uint8)


NDVI_CM = [(-0.2, (120, 80, 50)), (0.1, (196, 160, 110)), (0.3, (234, 222, 140)), (0.5, (120, 190, 90)), (0.8, (20, 110, 60))]
TRUST_CM = [(0, (220, 38, 38)), (50, (245, 158, 11)), (80, (234, 200, 30)), (100, (22, 163, 74))]
UNC_CM = [(0, (240, 249, 255)), (0.3, (125, 211, 252)), (0.6, (14, 116, 144)), (1.0, (30, 27, 75))]
AGREE_CM = [(0, (220, 38, 38)), (0.5, (245, 158, 11)), (1, (22, 163, 74))]


def sar_rgb(s1: dict, filtered: bool = True) -> np.ndarray:
    vv = s1["VV_db"] if filtered else to_db(s1["VV"])
    vh = s1["VH_db"] if filtered else to_db(s1["VH"])
    r = np.clip((vv + 20) / 17, 0, 1)
    g = np.clip((vh + 27) / 17, 0, 1)
    b = np.clip((vv - vh - 3) / 10, 0, 1)
    return (np.stack([r, g, b], -1) * 255).astype(np.uint8)


def sar_gray(s1: dict, filtered: bool) -> np.ndarray:
    vv = s1["VV_db"] if filtered else to_db(s1["VV"])
    g = (np.clip((vv + 22) / 20, 0, 1) * 255).astype(np.uint8)
    return np.stack([g, g, g], -1)


def layers(res: dict) -> dict[str, tuple[np.ndarray, str]]:
    a = res["_arrays"]
    m = a["masks"]
    base = rgb(a["refl"])
    out: dict[str, tuple[np.ndarray, str]] = {"original": (base, "jpg")}
    dim = (base * 0.45).astype(np.uint8)
    for key, col in (("cloud", (125, 211, 252)), ("shadow", (124, 58, 237)), ("missing", (220, 38, 38)), ("defective", (249, 115, 22))):
        dim[m[key]] = col
    out["cloudmask"] = (dim, "jpg")
    cl = np.dstack([base, np.where(m["valid"], 255, 0).astype(np.uint8)])
    out["cleaned"] = (cl, "png")
    filled = rgb(a["filled"])
    filled[~(m["valid"] | a["recon"])] = (0, 0, 0)
    out["reconstructed"] = (filled, "jpg")
    hl = filled.copy()
    hl[a["recon"]] = (0.55 * hl[a["recon"]] + 0.45 * np.array([220, 38, 38])).astype(np.uint8)
    out["recon_highlight"] = (hl, "jpg")
    prov = np.zeros(base.shape[:2] + (4,), np.uint8)
    prov[a["prov"] == 0] = (59, 130, 246, 70)
    prov[a["prov"] == 1] = (245, 158, 11, 200)
    prov[a["prov"] == 2] = (220, 38, 38, 190)
    out["provenance"] = (prov, "png")
    unc = np.dstack([_lut(UNC_CM, np.nan_to_num(a["unc"], nan=0)), np.where(a["recon"], 220, 0).astype(np.uint8)])
    out["uncertainty"] = (unc, "png")
    out["ndvi"] = (_lut(NDVI_CM, a["ndvi"]), "jpg")
    r = a["refl"]
    raw_ndvi = (r["B08"] - r["B04"]) / (r["B08"] + r["B04"] + 1e-6)  # what a naive model would see
    out["ndvi_raw"] = (_lut(NDVI_CM, raw_ndvi), "jpg")
    if a["s1"] is not None:
        out["sar"] = (sar_rgb(a["s1"]), "jpg")
        out["sar_raw"] = (sar_gray(a["s1"], False), "jpg")
        out["sar_filtered"] = (sar_gray(a["s1"], True), "jpg")
    if a["agree"] is not None:
        ag = a["agree"]
        col = _lut(AGREE_CM, np.nan_to_num(ag, nan=0.5))
        alpha = np.where(np.isfinite(ag), 255, 60).astype(np.uint8)
        img = np.dstack([col, alpha])
        img = np.array(Image.fromarray(img, "RGBA").resize((base.shape[1], base.shape[0]), Image.NEAREST))
        out["agreement"] = (img, "png")
    ts = a["tile_scores"]
    n = int(np.sqrt(ts.size))
    tm = _lut(TRUST_CM, ts.reshape(n, n))
    tm = np.array(Image.fromarray(tm).resize((base.shape[1], base.shape[0]), Image.NEAREST))
    out["trustmap"] = ((0.35 * base + 0.65 * tm).astype(np.uint8), "jpg")
    return out


def encode(img: np.ndarray, fmt: str, size: int | None = None) -> bytes:
    im = Image.fromarray(img)
    if size:
        im = im.resize((size, size), Image.BILINEAR)
    buf = io.BytesIO()
    if fmt == "jpg":
        im.convert("RGB").save(buf, "JPEG", quality=86, optimize=True)
    else:
        im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def save_layers(res: dict, folder: Path) -> list[str]:
    folder.mkdir(parents=True, exist_ok=True)
    names = []
    for name, (img, fmt) in layers(res).items():
        (folder / f"{name}.{fmt}").write_bytes(encode(img, fmt))
        names.append(name)
    return names
