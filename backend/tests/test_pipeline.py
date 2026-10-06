"""Integration tests on the cached real data for every built location (skipped if not built)."""
import time

import pytest

from terratrust import aoi as A

BUILT = [k for k in A.registry() if any(A.raw_dir(k).glob("S2_*.npz")) and A.status(k)["state"] == "ready"] \
    if A.AOI_ROOT.exists() else []
pytestmark = pytest.mark.skipif(not BUILT, reason="no location built")


@pytest.fixture(params=BUILT)
def aoi(request):
    with A.use(request.param):
        yield request.param


def test_demo_scenarios_ordering(aoi):
    from terratrust import pipeline as P, scenes as S
    r = {k: P.analyze(S.raw_for(k), keep_arrays=False) for k in ("DEMO-HEALTHY", "DEMO-CLOUDY", "DEMO-SUSPICIOUS")}
    assert r["DEMO-HEALTHY"]["status"] == "PASS"
    assert r["DEMO-CLOUDY"]["status"] == "WARNING"
    assert r["DEMO-SUSPICIOUS"]["status"] == "BLOCKED"
    assert r["DEMO-HEALTHY"]["trust_score"] > r["DEMO-CLOUDY"]["trust_score"] > r["DEMO-SUSPICIOUS"]["trust_score"]
    assert r["DEMO-CLOUDY"]["metrics"]["recon_pct"] > 10


def test_real_event_not_penalised(aoi):
    from terratrust import pipeline as P, scenes as S
    r = P.analyze(S.raw_for("DEMO-EVENT"), keep_arrays=False)
    assert r["temporal"]["statuses"]["REAL EVENT CONFIRMED"] > 0
    assert r["status"] == "PASS"


def test_false_confidence_detected(aoi):
    from terratrust import pipeline as P, scenes as S
    r = P.analyze(S.raw_for("DEMO-FALSECONF"), keep_arrays=False)
    assert r["false_confidence"]["detected"] and r["status"] != "PASS"


def test_live_lab_latency(aoi):
    from terratrust import pipeline as P, scenes as S
    from terratrust.corruption.inject import FaultConfig, inject
    base = S.raw_for("DEMO-HEALTHY")
    P.analyze(base, keep_arrays=False)
    t = time.perf_counter()
    P.analyze(inject(base, FaultConfig(cloud_coverage=0.3, noise=0.3)), keep_arrays=False)
    assert time.perf_counter() - t < 1.5


def test_aois_isolated():
    """Each AOI resolves its own data directory and caches."""
    from terratrust.ingest import cache
    tiles = set()
    for k in BUILT:
        with A.use(k):
            tiles.add(cache.aoi()["tile"])
    assert len(tiles) == len(BUILT)
