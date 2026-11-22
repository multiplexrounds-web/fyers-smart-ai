import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="FYERS SMART AI - Read Only")

@app.get("/")
def home():
    return {
        "app": "FYERS SMART AI",
        "status": "Backend Running",
        "mode": "READ ONLY",
        "order_execution": False
    }

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/fyers/callback")
def fyers_callback(auth_code: str = None, state: str = None):
    if not auth_code:
        return {
            "message": "FYERS callback endpoint ready",
            "auth_code_received": False
        }
    return {
        "message": "Authorization code received",
        "auth_code_received": True,
        "note": "Token exchange not configured yet"
    }
