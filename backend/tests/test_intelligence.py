"""Trust Intelligence + accounts."""
import pytest

from terratrust import aoi as A
from terratrust import intelligence as I

BUILT = [k for k in ("nashik", "vasai-virar") if A.status(k)["state"] == "ready"]
pytestmark = pytest.mark.skipif(not BUILT, reason="locations not built")


@pytest.fixture(params=BUILT)
def aoi(request):
    with A.use(request.param):
        yield request.param


def S(sid):
    from terratrust import scenes
    return scenes.load_summary(sid)


def test_healthy_scene_is_go_for_everything(aoi):
    fit = I.fitness(S("DEMO-HEALTHY"))
    assert all(f["status"] == "GO" for f in fit.values()), {k: f["status"] for k, f in fit.items()}


def test_same_cloudy_scene_differs_by_use_case(aoi):
    fit = I.fitness(S("DEMO-CLOUDY"))
    assert fit["flood"]["status"] == "GO"          # radar sees through clouds
    assert fit["carbon"]["status"] == "NO-GO"      # MRV needs observed, high-trust data
    assert any(not c["ok"] and c["hard"] for c in fit["carbon"]["checks"])


def test_corrupted_scene_is_no_go_everywhere(aoi):
    assert all(f["status"] == "NO-GO" for f in I.fitness(S("DEMO-SUSPICIOUS")).values())


def test_silent_failure_catches_clean_looking_miscalibration(aoi):
    s = I.silent_failure(S("DEMO-FALSECONF"))
    assert s["visual_quality"] >= 90 and s["level"] == "HIGH"
    assert I.silent_failure(S("DEMO-HEALTHY"))["level"] == "LOW"


def test_failed_requirements_come_with_fixes(aoi):
    for f in I.fitness(S("DEMO-CLOUDY")).values():
        for c in f["checks"]:
            assert c["ok"] or c["fix"]


def test_contamination_uses_real_recovery_provenance(aoi):
    c = I.contamination(S("DEMO-HEALTHY"))
    for d in c["downstream_scenes"]:
        assert any(src["date"] == c["acquisition"] for src in S(d["scene_id"])["recovery"]["sources_used"])


def test_trust_graph_propagates_to_products(aoi):
    s = S("DEMO-SUSPICIOUS")
    g = I.trust_graph(s, I.fitness(s))
    prods = [n for n in g["nodes"] if n["id"].startswith("p_")]
    assert prods and all(n["status"] == "bad" for n in prods)


def test_data_debt_blocked_scenes_add_nothing_and_reviews_reduce_debt(aoi):
    d0 = I.data_debt({})
    assert all(p["added"] == 0 for p in d0["series"] if p["status"] == "BLOCKED")
    warn = [p["scene_id"] for p in d0["series"] if p["status"] == "WARNING"]
    d1 = I.data_debt({w: "APPROVE" for w in warn})
    assert d1["current"] <= d0["current"]


def test_memory_ignores_weather(aoi):
    m = I.memory()
    assert all(h["dominant"] != "cloud" for h in m["hotspots"])


def test_reproducible(aoi):
    r = I.reproduce("DEMO-CLOUDY")
    assert r["reproducible"] and r["provenance"]["bundle"]


def test_fallback_offers_radar_for_flood(aoi):
    fb = I.fallback(S("DEMO-SUSPICIOUS"), "flood")
    assert any(f["kind"] == "radar" for f in fb)


# ------------------------------------------------------------------ accounts
def test_password_hashing_and_ownership(tmp_path, monkeypatch):
    from app import auth, db
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    db.init()
    u = auth.create_user("a@b.co", "secret123", "A")
    assert u["pw_hash"] != "secret123" and auth.check_password("a@b.co", "secret123")
    assert auth.check_password("a@b.co", "wrong") is None
    with pytest.raises(ValueError):
        auth.create_user("a@b.co", "x" * 8, "dup")
    tok = auth.new_session(u["id"])
    assert auth.user_from_session(tok)["id"] == u["id"]
    assert auth.can_see(u, "nashik")                     # built-in: shared
    assert not auth.can_see(None, "pune-hadapsar") if A.exists("pune-hadapsar") else True
