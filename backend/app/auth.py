"""Accounts, sessions and per-user API keys.

* Passwords: PBKDF2-HMAC-SHA256 (200k iterations, per-user salt); never stored in plain text.
* Browser sessions: random 256-bit token in an HttpOnly, SameSite=Lax cookie (`tt_session`), 7-day expiry.
* Machine access: every user gets a personal API key (`X-API-Key`) scoped to their own locations.
  Keys in backend/.env (TERRATRUST_API_KEYS) are admin/service keys with access to every location.
* Location ownership: built-in locations are shared with everyone; user-added locations are private to their owner.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from contextvars import ContextVar
from typing import Any

from terratrust import aoi as A
from . import db, settings

COOKIE = "tt_session"
SESSION_DAYS = 7
DEMO = {"email": "demo@terratrust.ai", "password": "Demo@1234", "name": "Demo Analyst", "org": "TerraTrust Demo"}
ADMIN = {"id": 0, "email": "service@terratrust", "name": "Service key", "role": "admin"}
_USER: ContextVar[dict[str, Any] | None] = ContextVar("user", default=None)


def current() -> dict[str, Any] | None:
    return _USER.get()


def set_current(u):
    return _USER.set(u)


def reset(tok) -> None:
    _USER.reset(tok)


def _hash(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()


def public(u: dict[str, Any]) -> dict[str, Any]:
    return {k: u[k] for k in ("id", "email", "name", "org", "api_key", "created_at") if k in u} | {"role": u.get("role", "user")}


def create_user(email: str, password: str, name: str, org: str = "") -> dict[str, Any]:
    email = email.strip().lower()
    if db.rows("SELECT id FROM users WHERE email=?", (email,)):
        raise ValueError("An account with this email already exists")
    salt = secrets.token_hex(16)
    key = "tt_user_" + secrets.token_hex(16)
    uid = db.execute("INSERT INTO users(email,name,org,pw_hash,salt,api_key,created_at) VALUES (?,?,?,?,?,?,?)",
                     (email, name.strip(), org.strip(), _hash(password, salt), salt, key, db.now()))
    return db.rows("SELECT * FROM users WHERE id=?", (uid,))[0]


def check_password(email: str, password: str) -> dict[str, Any] | None:
    r = db.rows("SELECT * FROM users WHERE email=?", (email.strip().lower(),))
    if not r:
        _hash(password, "00" * 16)  # constant-ish time
        return None
    u = r[0]
    return u if hmac.compare_digest(_hash(password, u["salt"]), u["pw_hash"]) else None


def new_session(user_id: int) -> str:
    tok = secrets.token_urlsafe(32)
    db.execute("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES (?,?,?,?)",
               (tok, user_id, db.now(), time.time() + SESSION_DAYS * 86400))
    return tok


def end_session(tok: str) -> None:
    db.execute("DELETE FROM sessions WHERE token=?", (tok,))


def user_from_session(tok: str) -> dict[str, Any] | None:
    r = db.rows("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?", (tok, time.time()))
    return r[0] if r else None


def user_from_key(key: str) -> dict[str, Any] | None:
    if key in settings.API_KEYS:
        return dict(ADMIN)
    r = db.rows("SELECT * FROM users WHERE api_key=?", (key,))
    return r[0] if r else None


def can_see(u: dict[str, Any] | None, aoi_id: str) -> bool:
    reg = A.registry().get(aoi_id)
    if reg is None:
        return False
    if reg.get("builtin"):
        return True
    if u is None:
        return False
    return u.get("role") == "admin" or reg.get("owner") == u["id"]


def visible_aois(u: dict[str, Any] | None) -> list[str]:
    return [k for k in A.registry() if can_see(u, k)]


def ensure_demo() -> dict[str, Any]:
    """Create the demo account and give it every existing user-added location (built-ins stay shared)."""
    r = db.rows("SELECT * FROM users WHERE email=?", (DEMO["email"],))
    u = r[0] if r else create_user(DEMO["email"], DEMO["password"], DEMO["name"], DEMO["org"])
    custom = A._custom()
    changed = False
    for k, v in custom.items():
        if not v.get("owner"):
            v["owner"] = u["id"]; changed = True
    if changed:
        for k, v in custom.items():
            A.add_custom(k, v)
    return u


def require(aoi_id: str) -> None:
    """Raise 403 unless the current caller may use this location (for endpoints taking `aoi` in the body)."""
    from fastapi import HTTPException
    if not can_see(current(), aoi_id):
        raise HTTPException(403, "You do not have access to this location")
