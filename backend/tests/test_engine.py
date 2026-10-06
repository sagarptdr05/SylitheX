"""Unit tests: Trust Score engine, gate rules and corruption injectors."""
import numpy as np
import pytest

from terratrust.corruption.inject import FaultConfig, inject, severity
from terratrust.trust import engine as E

COMP = ["completeness", "cloud", "noise", "sensor_agreement", "temporal", "anomaly", "drift", "reconstruction"]


def comps(v=100.0, n=4, **over):
    c = {k: np.full(n, v, float) for k in COMP}
    for k, x in over.items():
        c[k] = np.full(n, x, float)
    return c


# ----------------------------------------------------------------- score engine
def test_perfect_data_scores_100():
    s = E.tile_scores(comps(), np.zeros(4), np.ones(4))
    assert np.allclose(s, 100)
    assert E.aggregate(s) == pytest.approx(100)


def test_weights_sum_to_one():
    from terratrust.config import profiles, weights
    assert sum(weights().values()) == pytest.approx(1)
    for p in profiles().values():
        assert sum(p["weights"].values()) == pytest.approx(1)


def test_missing_component_is_renormalised():
    c = comps(80)
    c["sensor_agreement"][:] = np.nan  # no Sentinel-1
    assert E.weighted_base(c, E.weights()) == pytest.approx(np.full(4, 80))


def test_reconstruction_penalty_is_nonlinear():
    p = E.reconstruction_penalty(np.array([0.0, 0.05, 0.25, 0.4, 0.8]))
    assert p[0] == pytest.approx(0)
    assert p[1] < 1.0                     # ~0 up to 5 %
    assert p[3] - p[2] > p[2] - p[1]      # steep rise after ~25 %
    assert np.all(np.diff(p) > 0)


def test_score_monotonic_in_each_component():
    base = E.aggregate(E.tile_scores(comps(90), np.zeros(4), np.ones(4)))
    for k in COMP:
        worse = E.aggregate(E.tile_scores(comps(90, **{k: 40}), np.zeros(4), np.ones(4)))
        assert worse < base, k


def test_worst_tile_penalty():
    s = np.array([100.0] * 9 + [0.0])
    assert E.aggregate(s) < s.mean()


def test_critical_penalty_impossible_values_and_disagreement():
    p = E.critical_penalty(np.array([0.0, 0.2]), np.array([False, False]), np.array([90.0, 90.0]))
    assert p[0] == 1 and p[1] < 1
    q = E.critical_penalty(np.zeros(2), np.zeros(2, bool), np.array([90.0, 20.0]))
    assert q[1] < q[0]


@pytest.mark.parametrize("score,status", [(95, "PASS"), (80, "PASS"), (79.9, "WARNING"), (50, "WARNING"), (49.9, "BLOCKED")])
def test_status_thresholds(score, status):
    assert E.status_from_score(score) == status


# ----------------------------------------------------------------- gate rules
def metrics(**kw):
    m = {"cloud_pct": 0, "missing_pct": 0, "recon_pct": 0, "agreement": 90, "drift_level": "LOW", "impossible_pct": 0}
    m.update(kw)
    return m


@pytest.mark.parametrize("kw,rule,action", [
    ({"cloud_pct": 61}, "cloud_cover", "BLOCK"),
    ({"agreement": 19}, "sensor_agreement", "BLOCK"),
    ({"missing_pct": 31}, "missing_pixels", "BLOCK"),
    ({"impossible_pct": 6}, "impossible_values", "BLOCK"),
    ({"recon_pct": 41}, "reconstruction", "CAP_WARNING"),
    ({"drift_level": "HIGH", "agreement": 40}, "drift_and_agreement", "CAP_WARNING"),
])
def test_gate_rules_trigger(kw, rule, action):
    rules = E.gate_rules(metrics(**kw))
    assert any(r["rule"] == rule and r["action"] == action for r in rules)


def test_no_rules_on_clean_metrics():
    assert E.gate_rules(metrics()) == []


def test_gate_overrides():
    block = [{"rule": "x", "action": "BLOCK", "message": ""}]
    cap = [{"rule": "y", "action": "CAP_WARNING", "message": ""}]
    assert E.apply_gates("PASS", block) == "BLOCKED"
    assert E.apply_gates("PASS", cap) == "WARNING"
    assert E.apply_gates("BLOCKED", cap) == "BLOCKED"  # a cap never upgrades


def test_no_s1_handled_without_crash():
    assert E.gate_rules(metrics(agreement=None, drift_level="HIGH")) == []


# ----------------------------------------------------------------- corruption injectors
@pytest.fixture
def scene():
    rng = np.random.default_rng(0)
    shape = (96, 96)
    refl = {b: (0.05 + 0.2 * rng.random(shape)).astype(np.float32) for b in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]}
    s1 = {"date": "x", "VV": (0.1 + 0.05 * rng.random(shape)).astype(np.float32), "VH": (0.02 + 0.01 * rng.random(shape)).astype(np.float32)}
    return {"date": "20260101", "refl": refl, "scl": np.full(shape, 4, np.uint8), "s1": s1, "synthetic": []}


def test_inject_never_mutates_original(scene):
    before = scene["refl"]["B04"].copy()
    inject(scene, FaultConfig(cloud_coverage=0.5, dropout=0.3, noise=0.5, miscalibration=0.2, sar_inconsistency=0.4))
    assert np.array_equal(before, scene["refl"]["B04"])


def test_clouds_brighten(scene):
    out = inject(scene, FaultConfig(cloud_coverage=0.5))
    assert np.nanmean(out["refl"]["B02"]) > np.nanmean(scene["refl"]["B02"])
    assert out["synthetic"]


def test_dropout_creates_nan_rows(scene):
    out = inject(scene, FaultConfig(dropout=0.3))
    rows = np.isnan(out["refl"]["B04"]).all(axis=1)
    assert 0.2 < rows.mean() < 0.4


def test_ndvi_spike_override(scene):
    out = inject(scene, FaultConfig(ndvi_spike=0.1, spike_value=1.4))
    m, v = out["ndvi_override"]
    assert v == 1.4 and m.any()


def test_miscalibration_scales_nir(scene):
    out = inject(scene, FaultConfig(miscalibration=-0.25))
    assert np.allclose(out["refl"]["B08"], scene["refl"]["B08"] * 0.75)


def test_sar_inconsistency_changes_backscatter(scene):
    out = inject(scene, FaultConfig(sar_inconsistency=0.4))
    assert not np.allclose(out["s1"]["VV"], scene["s1"]["VV"])


def test_severity_combined_and_monotonic():
    s1 = severity(FaultConfig(noise=0.2))["combined"]
    s2 = severity(FaultConfig(noise=0.6))["combined"]
    s3 = severity(FaultConfig(noise=0.6, dropout=0.2))["combined"]
    assert 0 < s1 < s2 < s3 <= 1
    assert severity(FaultConfig())["combined"] == 0
