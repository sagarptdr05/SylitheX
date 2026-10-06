"""Scene registry per AOI: real Sentinel time series + 5 curated demo scenarios, with precomputed results.

Demo base dates come from configs/aois.yaml (`demos:`) or are auto-selected from the AOI's own
history when a location is built (`select_demos`) and stored in data/aois/<id>/demos.json.
"""
from __future__ import annotations

import json

import numpy as np

from . import aoi as A
from . import pipeline as P
from .corruption.inject import FaultConfig, inject
from .ingest import cache

FAULTS = {
    "healthy": None,
    "cloudy": None,
    "suspicious": {"dropout": 0.18, "noise": 0.5, "ndvi_spike": 0.12, "sar_inconsistency": 0.5},
    "falseconf": {"miscalibration": -0.25, "sar_inconsistency": 0.5},
    "event": {"flood_event": 0.15},
}
META = {
    "healthy": ("DEMO-HEALTHY", "healthy", "Healthy · clear sky",
                "Clear, cloud-free scene. Optical and radar agree and distributions match the seasonal baseline."),
    "cloudy": ("DEMO-CLOUDY", "cloudy", "Monsoon cloud cover",
               "Real cloudy acquisition: clouds and shadows are detected, gaps are recovered from a quality-weighted "
               "temporal composite and labelled RECONSTRUCTED; areas with no clear history stay missing."),
    "suspicious": ("DEMO-SUSPICIOUS", "suspicious", "Suspicious / corrupted",
                   "Real scene with SYNTHETIC faults: stripe dropout, sensor noise, impossible NDVI spikes and a region "
                   "where SAR contradicts optical."),
    "falseconf": ("DEMO-FALSECONF", "false_confidence", "False confidence",
                  "Looks perfectly clean (no clouds, full coverage) but carries a SYNTHETIC NIR calibration drift and a "
                  "radar/optical contradiction that only cross-sensor + statistical checks reveal."),
    "event": ("DEMO-EVENT", "real_event", "Real event · flood",
              "A SIMULATED flood that is physically consistent in Sentinel-2 (water spectra) and Sentinel-1 (specular low "
              "backscatter). The temporal anomaly is confirmed by S1, so it is NOT penalised."),
}
ORDER = ["healthy", "cloudy", "suspicious", "falseconf", "event"]


def demo_bases() -> dict[str, str]:
    reg = A.registry().get(A.cur(), {})
    if reg.get("demos"):
        return reg["demos"]
    p = A.root() / "demos.json"
    return json.loads(p.read_text()) if p.exists() else {}


def demos() -> list[dict]:
    bases = demo_bases()
    out = []
    for k in ORDER:
        if k not in bases:
            continue
        sid, kind, title, story = META[k]
        out.append({"id": sid, "key": k, "base": bases[k], "kind": kind, "title": title, "story": story, "faults": FAULTS[k]})
    return out


def demo_by_id() -> dict[str, dict]:
    return {d["id"]: d for d in demos()}


def select_demos() -> dict[str, str]:
    """Pick demo base dates from this AOI's own history (clearest scenes, a partly-cloudy one, ...)."""
    from . import history as H
    hs = H.hist()
    dates = [str(d) for d in hs["s2_dates"]]
    clear = hs["s2_clear"].mean(1)
    s1ok = [cache.nearest_s1(d, 12)[0] is not None for d in dates]
    clean = [i for i in np.argsort(-clear) if clear[i] >= 0.93 and s1ok[i]] or [int(np.argmax(clear))]
    picks: dict[str, str] = {}
    # rank clear candidates by their actual trust (no false confidence, low drift) so "healthy" really is healthy
    scored = []
    for i in clean[:10]:
        r = P.analyze(P.raw_scene(dates[i]), keep_arrays=False)
        scored.append((r["false_confidence"]["detected"] or r["status"] != "PASS", -r["trust_score"], dates[i]))
    pool = [d for *_, d in sorted(scored)] or [dates[i] for i in clean]
    names = ["healthy", "suspicious", "falseconf", "event"]
    for j, n in enumerate(names):
        picks[n] = pool[j % len(pool)]
    partly = [i for i in range(len(dates)) if 0.40 <= clear[i] <= 0.80 and s1ok[i]]
    if partly:
        mons = [i for i in partly if dates[i][4:6] in ("06", "07", "08", "09", "10")] or partly
        picks["cloudy"] = dates[min(mons, key=lambda i: abs(clear[i] - 0.6))]
    (A.root() / "demos.json").write_text(json.dumps(picks, indent=2))
    return picks


def real_id(date: str) -> str:
    return P.scene_id(date)


def all_ids() -> list[str]:
    return [d["id"] for d in demos()] + [real_id(d) for d in cache.s2_dates()]


def raw_for(scene_id: str) -> dict:
    db = demo_by_id()
    if scene_id in db:
        d = db[scene_id]
        raw = P.raw_scene(d["base"])
        return inject(raw, FaultConfig(**d["faults"])) if d["faults"] else raw
    return P.raw_scene(scene_id.split("_")[1])


def describe(scene_id: str) -> dict:
    db = demo_by_id()
    if scene_id in db:
        d = db[scene_id]
        return {"title": d["title"], "kind": d["kind"], "story": d["story"], "demo": True, "base_date": d["base"],
                "synthetic": d["faults"] is not None}
    date = scene_id.split("_")[1]
    return {"title": f"Sentinel-2 · {date[:4]}-{date[4:6]}-{date[6:]}", "kind": "real",
            "story": "Real acquisition from the 12-month AOI time series.", "demo": False, "base_date": date, "synthetic": False}


def result_dir(scene_id: str):
    return A.results_dir() / scene_id


@A.aoi_cache(maxsize=256)
def load_summary(scene_id: str) -> dict:
    return json.loads((result_dir(scene_id) / "summary.json").read_text())


def clean(res: dict) -> dict:
    return {k: v for k, v in res.items() if not k.startswith("_")}
