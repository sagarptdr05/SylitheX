"""Build (onboard) an AOI end to end:

download S1/S2 time series -> history baselines -> S1<->S2 physics model -> pseudo-invariant targets
-> drift calibration -> Isolation Forest -> demo scenarios -> precompute every scene (JSON + layers)
-> downstream impact -> packaged demo dataset (ZIP of GeoTIFF + JSON + CSV).

Runs in a background thread for user-added locations; status is written to data/aois/<id>/status.json.
"""
from __future__ import annotations

import io
import json
import threading
import time
import traceback
import zipfile

import numpy as np

from . import aoi as A

_LOCK = threading.Lock()


def _progress(aoi_id: str, lo: float, hi: float):
    def f(frac: float, msg: str):
        A.set_status(aoi_id, state="building", progress=round(lo + (hi - lo) * frac, 3), step=msg)
    return f


def build(aoi_id: str, skip_download: bool = False) -> None:
    from . import downstream, history as H, render, scenes as S
    from . import pipeline as P
    from .fusion import reliability as R
    from .validation import anomaly as AN, drift as D

    reg = A.registry()[aoi_id]
    with _LOCK, A.use(aoi_id):
        t0 = time.time()
        try:
            A.set_status(aoi_id, state="building", progress=0.0, step="Queued", message="", started=t0)
            if not skip_download:
                from .ingest.download import download
                download(aoi_id, reg["lon"], reg["lat"], int(reg.get("grid_px", 768)), reg.get("date_range", "2025-09-01/2026-09-30"),
                         progress=_progress(aoi_id, 0.0, 0.55), name=reg.get("name", aoi_id))
            A.invalidate()
            step = _progress(aoi_id, 0.55, 0.70)
            step(0.0, "Building per-tile history baselines"); H.build_history(); A.invalidate()
            step(0.2, "Fitting S1↔S2 physics model"); H.fit_physics(); A.invalidate()
            step(0.4, "Locating pseudo-invariant calibration targets"); H.build_pif(); A.invalidate()
            hs = H.hist()
            clr = hs["s2_clear"].mean(1)
            for thr in (0.95, 0.9, 0.8, 0.6):
                clean = [str(d) for i, d in enumerate(hs["s2_dates"]) if clr[i] >= thr]
                if len(clean) >= 3:
                    break
            step(0.6, f"Calibrating natural seasonal drift on {len(clean)} clear scenes")
            D.calibrate([P.analyze(P.raw_scene(d))["_arrays"]["drift_raw"] for d in clean]); A.invalidate()
            step(0.8, "Training Isolation Forest on per-tile features")
            AN.train(P.training_features()); A.invalidate()
            if not reg.get("demos"):
                S.select_demos()
            ids = S.all_ids()
            step = _progress(aoi_id, 0.70, 0.95)
            A.results_dir().mkdir(parents=True, exist_ok=True)
            for k, sid in enumerate(ids):
                step(k / len(ids), f"Scoring scene {k + 1}/{len(ids)} · {sid}")
                res = P.analyze(S.raw_for(sid))
                res["scene_id"] = sid
                res["info"] = S.describe(sid)
                res["ml_evidence"] = R.explain(res)
                res["layers"] = render.save_layers(res, S.result_dir(sid))
                (S.result_dir(sid) / "summary.json").write_text(json.dumps(S.clean(res), default=float))
            A.invalidate()
            step(0.97, "Measuring downstream impact")
            bases = S.demo_bases()
            (A.results_dir() / "downstream.json").write_text(json.dumps(downstream.run(bases.get("suspicious")), indent=1))
            A.set_status(aoi_id, state="building", progress=0.97, step="Packaging demo dataset (GeoTIFF + JSON + CSV)")
            package_dataset(aoi_id)
            A.invalidate()
            A.set_status(aoi_id, state="ready", progress=1.0, step="Ready", message="", finished=time.time(),
                         seconds=round(time.time() - t0))
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            A.set_status(aoi_id, state="error", step="Failed", message=f"{e.__class__.__name__}: {e}")


def build_async(aoi_id: str, skip_download: bool = False) -> None:
    A.set_status(aoi_id, state="queued", progress=0.0, step="Waiting for the build worker", message="")
    threading.Thread(target=build, args=(aoi_id, skip_download), daemon=True, name=f"build-{aoi_id}").start()


# ------------------------------------------------------------------ demo dataset
def _geotiff(arrs: list[np.ndarray], dtype, nodata, transform, crs, descs: list[str]) -> bytes:
    import rasterio
    from rasterio.io import MemoryFile
    h, w = arrs[0].shape
    with MemoryFile() as mem:
        with mem.open(driver="GTiff", height=h, width=w, count=len(arrs), dtype=dtype, crs=crs, transform=transform,
                      nodata=nodata, compress="deflate", predictor=2 if dtype != "float32" else 3, tiled=True) as ds:
            for i, (a, d) in enumerate(zip(arrs, descs), 1):
                ds.write(a.astype(dtype), i)
                ds.set_band_description(i, d)
        return mem.read()


def package_dataset(aoi_id: str) -> dict:
    """Write data/aois/<id>/demo_dataset.zip: the 5 demo scenarios as analysis-ready files."""
    from rasterio.transform import Affine
    from . import scenes as S
    from .ingest import cache
    from .ingest.cache import S2_BANDS

    with A.use(aoi_id):
        g = cache.aoi()
        tr = Affine(*g["transform"])
        ts = 96
        coarse = Affine(tr.a * ts, tr.b, tr.c, tr.d, tr.e * ts, tr.f)
        reg = A.registry()[aoi_id]
        buf = io.BytesIO()
        manifest = {"dataset": f"TerraTrust demo dataset · {reg['name']}", "aoi_id": aoi_id, "region": reg.get("region"),
                    "center_lonlat": g["center"], "bbox_lonlat": g["bbox"], "crs": g["crs"], "pixel_size_m": 10,
                    "grid_px": g["grid"], "mgrs_tile": g.get("tile"), "scenes": [],
                    "license": "Contains modified Copernicus Sentinel data 2025-2026 (free, full and open). "
                               "Synthetic faults are generated by TerraTrust and labelled as such."}
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
            for d in S.demos():
                sid = d["id"]
                raw = S.raw_for(sid)
                summ = S.load_summary(sid)
                folder = f"{sid}/"
                dn = [np.where(np.isfinite(raw["refl"][b]), np.clip(raw["refl"][b] * 10000 + 1000, 1, 65535), 0) for b in S2_BANDS]
                z.writestr(folder + "s2_l2a_bands.tif", _geotiff(dn, "uint16", 0, tr, g["crs"], S2_BANDS))
                z.writestr(folder + "s2_scl.tif", _geotiff([raw["scl"]], "uint8", None, tr, g["crs"], ["SCL"]))
                if raw["s1"] is not None:
                    z.writestr(folder + "s1_rtc_vv_vh.tif", _geotiff([raw["s1"]["VV"], raw["s1"]["VH"]], "float32", None, tr, g["crs"], ["VV", "VH"]))
                n = int(np.sqrt(len(summ["tiles"])))
                tm = np.array([t["score"] for t in summ["tiles"]], np.float32).reshape(n, n)
                z.writestr(folder + "trust_map.tif", _geotiff([tm], "float32", None, coarse, g["crs"], ["tile_trust_score"]))
                feats = [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [t["polygon"] + [t["polygon"][0]]]},
                          "properties": {k: v for k, v in t.items() if k not in ("polygon", "components", "anomaly_top")}} for t in summ["tiles"]]
                z.writestr(folder + "trust_tiles.geojson", json.dumps({"type": "FeatureCollection", "features": feats}))
                z.writestr(folder + "trust_result.json", json.dumps({k: v for k, v in summ.items() if k != "tiles"}, indent=1, default=float))
                for lay in ("original", "trustmap", "cloudmask", "sar"):
                    p = S.result_dir(sid) / f"{lay}.jpg"
                    if p.exists():
                        z.write(p, folder + f"preview_{lay}.jpg")
                manifest["scenes"].append({"id": sid, "title": d["title"], "base_date": d["base"], "synthetic_faults": d["faults"],
                                           "trust_score": summ["trust_score"], "status": summ["status"],
                                           "files": ["s2_l2a_bands.tif", "s2_scl.tif", "s1_rtc_vv_vh.tif", "trust_map.tif",
                                                     "trust_tiles.geojson", "trust_result.json", "preview_*.jpg"]})
            rows = ["date,scene_id,trust,status,cloud_pct,reconstructed_pct,ai_readiness_crop,ai_readiness_flood"]
            for dt in cache.s2_dates():
                s = S.load_summary(S.real_id(dt))
                rows.append(f"{dt},{s['scene_id']},{s['trust_score']},{s['status']},{s['metrics']['cloud_pct']},{s['metrics']['recon_pct']},"
                            f"{s['ai_readiness_all']['crop_monitoring']},{s['ai_readiness_all']['flood_detection']}")
            z.writestr("timeline.csv", "\n".join(rows))
            z.writestr("manifest.json", json.dumps(manifest, indent=2))
            z.writestr("README.txt", README.format(name=reg["name"], region=reg.get("region", ""), crs=g["crs"], tile=g.get("tile"),
                                                   n2=len(cache.s2_dates()), n1=len(cache.s1_dates())))
        path = A.root(aoi_id) / "demo_dataset.zip"
        path.write_bytes(buf.getvalue())
        manifest["size_bytes"] = path.stat().st_size
        (A.root(aoi_id) / "dataset_manifest.json").write_text(json.dumps(manifest, indent=2))
        return manifest


README = """TerraTrust AI · demo dataset · {name}
{region}

Five ready-to-show scenarios (one folder each):
  DEMO-HEALTHY     real clear scene                       -> expected PASS
  DEMO-CLOUDY      real cloudy / monsoon scene            -> expected WARNING (recovery + uncertainty)
  DEMO-SUSPICIOUS  real scene + SYNTHETIC faults          -> expected BLOCKED
  DEMO-FALSECONF   real scene + SYNTHETIC hidden faults   -> False Confidence detected
  DEMO-EVENT       real scene + SIMULATED consistent flood -> real event, not penalised

Files per scenario
  s2_l2a_bands.tif     Sentinel-2 L2A B02 B03 B04 B05 B08 B11 B12, uint16 DN (reflectance = (DN-1000)/10000), nodata 0
  s2_scl.tif           Sentinel-2 Scene Classification Layer
  s1_rtc_vv_vh.tif     Sentinel-1 RTC backscatter VV, VH (linear power)
  trust_map.tif        TerraTrust tile Trust Score (960 m tiles)
  trust_tiles.geojson  per-tile score, status and reasons (WGS84)
  trust_result.json    full scene result: score, interval, components, gate rules, reasons, lineage
  preview_*.jpg        quick-look images

timeline.csv  Trust Score for every real acquisition ({n2} Sentinel-2 dates, {n1} Sentinel-1 dates)
CRS {crs} · 10 m · MGRS tile T{tile}

Contains modified Copernicus Sentinel data 2025-2026, accessed via Microsoft Planetary Computer.
Synthetic faults are generated by TerraTrust and clearly labelled; they are not real sensor errors.
"""
