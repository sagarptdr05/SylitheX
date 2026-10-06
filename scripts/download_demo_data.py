"""Download the Sentinel-1/2 time series for every built-in AOI (configs/aois.yaml)."""
import _path  # noqa: F401
import sys

from terratrust import aoi as A
from terratrust.ingest.download import download

for aoi_id, reg in A.registry().items():
    if len(sys.argv) > 1 and aoi_id not in sys.argv[1:]:
        continue
    print(f"▶ {aoi_id}: {reg['name']}")
    meta = download(aoi_id, reg["lon"], reg["lat"], int(reg.get("grid_px", 768)), reg.get("date_range"),
                    progress=lambda f, m: print(f"  {f:4.0%} {m}", flush=True), name=reg["name"])
    print(f"  done: {meta['n_s2']} S2 + {meta['n_s1']} S1 scenes, tile T{meta['tile']}, {meta['crs']}")
