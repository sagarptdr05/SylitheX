from __future__ import annotations

import secrets

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import auth, db

router = APIRouter(prefix="/api/auth", tags=["Accounts"])


class Login(BaseModel):
    email: str = Field(..., examples=["demo@terratrust.ai"])
    password: str = Field(..., examples=["Demo@1234"])


class Register(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=2, max_length=60)
    org: str = ""


def _set_cookie(resp: Response, tok: str) -> None:
    resp.set_cookie(auth.COOKIE, tok, max_age=auth.SESSION_DAYS * 86400, httponly=True, samesite="lax", path="/")


@router.post("/login", summary="Sign in (sets an HttpOnly session cookie)")
def login(body: Login, resp: Response):
    u = auth.check_password(body.email, body.password)
    if not u:
        raise HTTPException(401, "Wrong email or password")
    _set_cookie(resp, auth.new_session(u["id"]))
    return auth.public(u)


@router.post("/demo", summary="One-click sign-in as the demo analyst")
def demo(resp: Response):
    u = auth.ensure_demo()
    _set_cookie(resp, auth.new_session(u["id"]))
    return auth.public(u)


@router.post("/register", summary="Create an account")
def register(body: Register, resp: Response):
    if "@" not in body.email or "." not in body.email.split("@")[-1]:
        raise HTTPException(400, "Enter a valid email address")
    try:
        u = auth.create_user(body.email, body.password, body.name, body.org)
    except ValueError as e:
        raise HTTPException(409, str(e))
    _set_cookie(resp, auth.new_session(u["id"]))
    return auth.public(u)


@router.post("/logout")
def logout(req: Request, resp: Response):
    tok = req.cookies.get(auth.COOKIE)
    if tok:
        auth.end_session(tok)
    resp.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


@router.get("/me", summary="The signed-in user (or null)")
def me():
    u = auth.current()
    return auth.public(u) if u else None


@router.post("/api-key/rotate", summary="Issue a new personal API key")
def rotate():
    u = auth.current()
    if not u or u.get("role") == "admin":
        raise HTTPException(401, "Login required")
    key = "tt_user_" + secrets.token_hex(16)
    db.execute("UPDATE users SET api_key=? WHERE id=?", (key, u["id"]))
    return {"api_key": key}
