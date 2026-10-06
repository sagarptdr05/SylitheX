"""Record integrity (duplicates, timestamps), Carbon MRV proxy and the EO analytics API."""
import pytest

from terratrust import aoi as A
from terratrust import carbon as C
from terratrust import history as H
from terratrust import integrity as IG
from terratrust import pipeline as P
from terratrust import scenes as S
from terratrust.corruption.inject import FaultConfig, inject
from terratrust.ingest import cache

BUILT = [k for k in ("nashik", "vasai-virar") if A.status(k)["state"] == "ready"]
pytestmark = pytest.mark.skipif(not BUILT, reason="locations not built")


@pytest.fixture(params=BUILT)
def aoi(request):
    with A.use(request.param):
        yield request.param


def test_real_archive_has_no_integrity_false_positives(aoi):
    for d in cache.s2_dates():
        p = H.s2(d)
        _, rules, summ = IG.checks(d, p["refl"], p["meta"])
        assert not rules and not summ["off_cycle"], d


def test_replayed_acquisition_is_blocked_as_duplicate(aoi):
    r = P.analyze(inject(S.raw_for("DEMO-HEALTHY"), FaultConfig(duplicate=1)), keep_arrays=False)
    assert r["status"] == "BLOCKED"
    assert [g["rule"] for g in r["gate_rules_triggered"]] == ["duplicate_observation"]
    assert r["metrics"]["duplicate_of"]


def test_shifted_timestamp_is_blocked_not_called_duplicate(aoi):
    r = P.analyze(inject(S.raw_for("DEMO-HEALTHY"), FaultConfig(timestamp_shift=3)), keep_arrays=False)
    rules = [g["rule"] for g in r["gate_rules_triggered"]]
    assert r["status"] == "BLOCKED" and "timestamp_conflict" in rules and "duplicate_observation" not in rules
    assert r["metrics"]["timestamp_conflict"]["days"] == 3


def test_carbon_trusted_matches_naive_on_clean_data(aoi):
    raw = S.raw_for("DEMO-HEALTHY")
    tr, cls, _ = C.trusted(P.analyze(raw))
    nv = C.naive(raw)
    assert tr["available"] and abs(tr["co2e_t"] - nv["co2e_t"]) / nv["co2e_t"] < 0.02
    assert abs(sum(c["pct"] for c in tr["cover"]) - 100) < 0.5
    assert tr["co2e_interval"][0] < tr["co2e_t"] < tr["co2e_interval"][1]


def test_pif_recalibration_repairs_drifted_carbon_estimate(aoi):
    base = S.raw_for("DEMO-HEALTHY")
    ref, _, _ = C.trusted(P.analyze(base))
    bad = inject(base, FaultConfig(miscalibration=-0.25))
    naive_err = abs(C.naive(bad)["co2e_t"] - ref["co2e_t"]) / ref["co2e_t"]
    tr, _, _ = C.trusted(P.analyze(bad))
    trusted_err = abs(tr["co2e_t"] - ref["co2e_t"]) / ref["co2e_t"]
    assert tr["recalibration"] and tr["recalibration"]["band"] == "B08"
    assert trusted_err < naive_err / 2


def test_carbon_series_and_change(aoi):
    s = C.series()
    assert len(s) >= 3 and all(x["lo"] < x["co2e_t"] < x["hi"] for x in s)
    ch = C.change()
    assert ch and 0 <= ch["changed_pct"] <= 100


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    assert c.post("/api/auth/demo").status_code == 200
    return c


@pytest.mark.parametrize("path", ["/api/anomalies", "/api/quality/issues?scene_id=DEMO-SUSPICIOUS",
                                  "/api/scene/DEMO-CLOUDY/provenance", "/api/scene/DEMO-CLOUDY/inspect", "/api/carbon/location"])
def test_eo_endpoints(client, path):
    r = client.get(path + ("&" if "?" in path else "?") + "aoi=nashik")
    assert r.status_code == 200, r.text
    j = r.json()
    if "provenance" in path:
        ids = {n["id"] for n in j["nodes"]}
        assert {"s2", "raw", "trust", "gate", "carbon", "report"} <= ids
        assert all(e["from"] in ids and e["to"] in ids for e in j["edges"])
    if "issues" in path:
        assert j["status"] == "BLOCKED" and any(i["severity"] == "CRITICAL" for i in j["issues"])
        assert all({"type", "why", "action", "impact", "date"} <= set(i) for i in j["issues"])


def test_eo_endpoints_require_login():
    from fastapi.testclient import TestClient
    from app.main import app
    assert TestClient(app).get("/api/anomalies?aoi=nashik").status_code == 401


def test_lab_reports_downstream_carbon_impact(client):
    r = client.post("/api/inject-fault", json={"aoi": "nashik", "base_scene": "DEMO-HEALTHY", "dropout": 0.2, "noise": 0.4, "ndvi_spike": 0.1})
    j = r.json()
    assert j["status"] == "BLOCKED"
    c = j["carbon"]
    assert abs(c["naive"]["error_pct"]) > abs(c["trusted"]["error_pct"])
    assert j["response"]["delivered"] == "fallback" and c["trusted"]["fallback_date"]
