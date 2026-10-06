"""SQLite persistence: trust checks, human reviews, webhook alerts, settings."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from terratrust.config import DATA_DIR

DB_PATH = DATA_DIR / "terratrust.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS checks (id INTEGER PRIMARY KEY, aoi TEXT, scene_id TEXT, profile TEXT, status TEXT,
    trust REAL, readiness REAL, created_at TEXT);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, aoi TEXT, scene_id TEXT, decision TEXT, reviewer TEXT,
    note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, aoi TEXT, scene_id TEXT, status TEXT, target TEXT,
    delivered INTEGER, response TEXT, payload TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, org TEXT,
    pw_hash TEXT NOT NULL, salt TEXT NOT NULL, api_key TEXT UNIQUE NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT, expires_at REAL);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    with conn() as c:
        c.executescript(SCHEMA)
        for t in ("checks", "reviews", "alerts"):  # migrate pre-multi-AOI databases
            cols = [r[1] for r in c.execute(f"PRAGMA table_info({t})")]
            if "aoi" not in cols:
                c.execute(f"ALTER TABLE {t} ADD COLUMN aoi TEXT DEFAULT 'nashik'")


def rows(sql: str, args: tuple = ()) -> list[dict]:
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def execute(sql: str, args: tuple = ()) -> int:
    with conn() as c:
        cur = c.execute(sql, args)
        return cur.lastrowid


def get_setting(key: str, default=None):
    r = rows("SELECT value FROM settings WHERE key=?", (key,))
    return json.loads(r[0]["value"]) if r else default


def set_setting(key: str, value) -> None:
    execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (key, json.dumps(value)))
