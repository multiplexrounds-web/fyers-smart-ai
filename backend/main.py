from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FYERS SMART AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/market")
def market():
    return {
        "message": "Market data connection pending",
        "live_data": False,
        "order_execution": False
    }
