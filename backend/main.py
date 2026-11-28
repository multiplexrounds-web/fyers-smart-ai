import os
import secrets
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.responses import HTMLResponse, RedirectResponse
from fyers_apiv3 import fyersModel
from backend.data_validation import validate_candles
from backend.indicators import calculate_indicators
from backend.decision_engine import build_decision_context
from backend.fyers_stream import create_stream_router
