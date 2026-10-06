"""TerraTrust AI: Trust Gate API.  Run: uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from urllib.parse import parse_qs

from fastapi.responses import JSONResponse

from terratrust import aoi as A
from . import db, settings
from .routers import account, aois, eo, intelligence, lab, models, ops, scenes, trust


class AoiMiddleware:
    """Activate the AOI given by `?aoi=<id>` for the whole request (default: nashik)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        q = parse_qs(scope.get("query_string", b"").decode())
        aoi_id = q.get("aoi", [A.DEFAULT])[0]
        if not A.exists(aoi_id):
            aoi_id = A.DEFAULT
        token = A.activate(aoi_id)
        try:
            await self.app(scope, receive, send)
        finally:
            A.deactivate(token)

import re
from http.cookies import SimpleCookie

from . import auth

PUBLIC = {"/api/health", "/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/me", "/api/auth/demo"}
# anonymous visitors (landing page) may read the shared demo locations, nothing else
ANON_READ = [re.compile(p) for p in (r"^/api/aois$", r"^/api/profiles$", r"^/api/downstream$", r"^/api/scenes$", r"^/api/scene/[^/]+/layer/[^/]+$")]


class AuthMiddleware:
    """Resolves the caller (session cookie or X-API-Key) and enforces login + location ownership."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)
        hdr = {k.decode().lower(): v.decode() for k, v in scope.get("headers") or []}
        user = None
        if hdr.get("x-api-key"):
            user = auth.user_from_key(hdr["x-api-key"])
            if user is None:
                return await JSONResponse({"detail": "Invalid API key"}, status_code=401)(scope, receive, send)
        elif "cookie" in hdr:
            c = SimpleCookie(); c.load(hdr["cookie"])
            if auth.COOKIE in c:
                user = auth.user_from_session(c[auth.COOKIE].value)
        path, method = scope["path"], scope["method"]
        if user is None and path not in PUBLIC:
            anon_ok = method == "GET" and any(p.match(path) for p in ANON_READ)
            if not anon_ok:
                return await JSONResponse({"detail": "Login required"}, status_code=401)(scope, receive, send)
        # location ownership: private locations are visible only to their owner
        q = parse_qs(scope.get("query_string", b"").decode())
        aoi_id = q.get("aoi", [None])[0]
        if aoi_id and A.exists(aoi_id) and not auth.can_see(user, aoi_id):
            return await JSONResponse({"detail": "You do not have access to this location"}, status_code=403)(scope, receive, send)
        tok = auth.set_current(user)
        try:
            await self.app(scope, receive, send)
        finally:
            auth.reset(tok)


app = FastAPI(
    title="TerraTrust AI: Trust Gate API",
    version="1.0.0",
    description="Before AI trusts Earth, TerraTrust verifies it. Quality and trust checks for multi-sensor "
                "Earth-observation data (Sentinel-1 SAR + Sentinel-2 optical) before downstream AI uses it. "
                "Problem statement ST-03.",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(AoiMiddleware)
app.add_middleware(AuthMiddleware)
for r in (account.router, eo.router, intelligence.router, aois.router, trust.router, scenes.router, lab.router, ops.router, models.router):
    app.include_router(r)


@app.on_event("startup")
def _startup() -> None:
    db.init()
    auth.ensure_demo()
    for k in A.registry():  # a build interrupted by a restart is reported, not left "building" forever
        if A.status(k)["state"] in ("building", "queued"):
            A.set_status(k, state="error", message="Build interrupted by a server restart. Click retry.")


@app.get("/api/health", tags=["Operations"])
def health():
    return {"status": "ok", "service": "terratrust", "version": app.version,
            "auth": {"api_keys": len(settings.API_KEYS) > 0, "planetary_computer_key": bool(settings.PC_KEY),
                     "webhook": bool(settings.WEBHOOK_URL)}}
