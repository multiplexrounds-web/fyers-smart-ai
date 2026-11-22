import os
import secrets
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fyers_apiv3 import fyersModel

app = FastAPI(title="FYERS SMART AI - Read Only")

# Short-lived OAuth state and in-memory access token.
# Credentials and access tokens are never returned by API responses.
_oauth_state: Optional[str] = None
_oauth_state_created_at: Optional[float] = None
_access_token: Optional[str] = None
_token_created_at: Optional[float] = None


def _config():
    app_id = os.getenv("FYERS_APP_ID", "").strip()
    secret_key = os.getenv("FYERS_SECRET_KEY", "").strip()
    redirect_uri = os.getenv(
        "FYERS_REDIRECT_URI",
        "https://fyers-smart-ai.onrender.com/fyers/callback",
    ).strip()
    if not app_id or not secret_key:
        raise HTTPException(
            status_code=503,
            detail="FYERS credentials are not configured on the backend.",
        )
    return app_id, secret_key, redirect_uri


@app.get("/")
def home():
    return {
        "app": "FYERS SMART AI",
        "status": "Backend Running",
        "mode": "READ ONLY",
        "order_execution": False,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/fyers/status")
def fyers_status():
    return {
        "configured": bool(os.getenv("FYERS_APP_ID") and os.getenv("FYERS_SECRET_KEY")),
        "authorized": bool(_access_token),
        "mode": "READ ONLY",
        "order_execution": False,
    }


@app.get("/fyers/login")
def fyers_login():
    global _oauth_state, _oauth_state_created_at
    app_id, _secret_key, redirect_uri = _config()
    _oauth_state = secrets.token_urlsafe(32)
    _oauth_state_created_at = time.time()

    session = fyersModel.SessionModel(
        client_id=app_id,
        redirect_uri=redirect_uri,
        response_type="code",
        state=_oauth_state,
        scope="",
        nonce="",
    )
    auth_url = session.generate_authcode()
    return RedirectResponse(url=auth_url, status_code=302)


@app.get("/fyers/callback", response_class=HTMLResponse)
def fyers_callback(
    auth_code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    global _oauth_state, _oauth_state_created_at, _access_token, _token_created_at

    if error:
        _oauth_state = None
        _oauth_state_created_at = None
        return HTMLResponse(
            "<h2>FYERS authorization was not completed.</h2>"
            "<p>You can close this page and try again from Vgrow SMART AI.</p>",
            status_code=400,
        )

    if not auth_code:
        return HTMLResponse(
            "<h2>FYERS callback is ready.</h2>"
            "<p>Start authorization from the backend login endpoint.</p>",
            status_code=200,
        )

    if (
        not state
        or not _oauth_state
        or not _oauth_state_created_at
        or not secrets.compare_digest(state, _oauth_state)
        or time.time() - _oauth_state_created_at > 600
    ):
        _oauth_state = None
        _oauth_state_created_at = None
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    app_id, secret_key, _redirect_uri = _config()
    try:
        session = fyersModel.SessionModel(
            client_id=app_id,
            secret_key=secret_key,
            grant_type="authorization_code",
        )
        session.set_token(auth_code)
        token_response = session.generate_token()
        if not isinstance(token_response, dict):
            raise RuntimeError("Unexpected token response")
        token = token_response.get("access_token")
        if not token:
            # Never expose the broker response because it may contain sensitive data.
            raise RuntimeError("FYERS did not return an access token")
        _access_token = token
        _token_created_at = time.time()
    except Exception:
        _oauth_state = None
        _oauth_state_created_at = None
        raise HTTPException(
            status_code=502,
            detail="FYERS token exchange failed. Check backend credentials and FYERS app settings.",
        )

    _oauth_state = None
    _oauth_state_created_at = None
    return HTMLResponse(
        "<h2>FYERS authorization successful.</h2>"
        "<p>Your Vgrow SMART AI backend is connected in READ-ONLY mode. "
        "You may close this page.</p>"
        "<p>No orders can be placed by this application.</p>",
        status_code=200,
    )
