"""Build an AOI: baselines, models, demo scenarios, precomputed scenes, downstream impact, demo dataset ZIP.

    python scripts/build_aoi.py nashik vasai-virar            # data already downloaded
    python scripts/build_aoi.py my-aoi --download             # download first
"""
import _path  # noqa: F401
import json
import sys
import threading
import time

from terratrust import aoi as A
from terratrust.build import build

ids = [a for a in sys.argv[1:] if not a.startswith("--")] or list(A.registry())
for aoi_id in ids:
    t = threading.Thread(target=build, args=(aoi_id, "--download" not in sys.argv))
    t.start()
    last = ""
    while t.is_alive():
        st = A.status(aoi_id)
        line = f"[{aoi_id}] {st.get('progress', 0):4.0%} {st.get('step', '')}"
        if line != last:
            print(line, flush=True)
            last = line
        time.sleep(0.5)
    print(json.dumps(A.status(aoi_id)))
