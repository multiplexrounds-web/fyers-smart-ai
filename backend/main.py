import os
import secrets
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.responses import HTMLResponse, RedirectResponse
from fyers_apiv3 import fyersModel
from data_validation import validate_candles
from indicators import calculate_indicators
from decision_engine import build_decision_context

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


@app.post("/decision/context")
def decision_context(payload: dict = Body(...)):
    """Read-only adapter: unify AI decisions using already-fetched market inputs."""
    indicators = payload.get("indicators") or {}
    validation = payload.get("data_validation") or {}
    risk_score = payload.get("risk_score")
    if validation and (validation.get("is_valid") is False or validation.get("is_fresh") is False):
        risk_score = None
    return build_decision_context(
        indicators,
        payload.get("market_bias"),
        risk_score,
        payload.get("option_pcr"),
    )


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


@app.get("/market/quotes")
def market_quotes():
    """Return verified FYERS index quotes only; never synthesize missing values."""
    if not _access_token:
        raise HTTPException(
            status_code=503,
            detail="FYERS is not authorized in this backend process. Re-authorize at /fyers/login.",
        )
    app_id = os.getenv("FYERS_APP_ID", "").strip()
    symbols = [
        ("NIFTY 50", "NSE:NIFTY50-INDEX"),
        ("BANK NIFTY", "NSE:NIFTYBANK-INDEX"),
        ("FINNIFTY", "NSE:FINNIFTY-INDEX"),
        ("SENSEX", "BSE:SENSEX-INDEX"),
    ]
    try:
        client = fyersModel.FyersModel(
            client_id=app_id,
            token=_access_token,
            log_path="",
        )
        response = client.quotes(data={"symbols": ",".join(symbol for _, symbol in symbols)})
        if not isinstance(response, dict) or response.get("s") != "ok":
            raise RuntimeError("FYERS quote request was not successful")
        by_symbol = {}
        for item in response.get("d", []):
            if not isinstance(item, dict) or item.get("s") != "ok":
                continue
            value = item.get("v") or {}
            by_symbol[item.get("n")] = value
        quotes = []
        for name, symbol in symbols:
            value = by_symbol.get(symbol)
            if not value or value.get("lp") is None:
                continue
            quotes.append({
                "name": name,
                "symbol": symbol,
                "last_price": value.get("lp"),
                "change": value.get("ch"),
                "change_percent": value.get("chp"),
                "open": value.get("open_price"),
                "high": value.get("high_price"),
                "low": value.get("low_price"),
                "previous_close": value.get("prev_close_price"),
                "volume": value.get("volume"),
            })
        return {
            "status": "live" if quotes else "empty",
            "mode": "READ ONLY",
            "quotes": quotes,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="FYERS market quote request failed. Check token validity and market session.",
        )



@app.get("/market/option-chain")
def market_option_chain(
    symbol: str = Query(default="NSE:NIFTY50-INDEX"),
    strikecount: int = Query(default=10, ge=1, le=20),
):
    """Read-only FYERS option-chain snapshot with verified fields only."""
    if not _access_token:
        raise HTTPException(status_code=503, detail="FYERS is not authorized. Re-authorize at /fyers/login.")
    allowed = {
        "NSE:NIFTY50-INDEX", "NSE:NIFTYBANK-INDEX",
        "NSE:FINNIFTY-INDEX", "BSE:SENSEX-INDEX",
    }
    if symbol not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported option-chain underlying.")
    try:
        client = fyersModel.FyersModel(
            client_id=os.getenv("FYERS_APP_ID", "").strip(),
            token=_access_token,
            log_path="",
        )
        response = client.optionchain(data={
            "symbol": symbol,
            "strikecount": strikecount,
            "timestamp": "",
        })
        if not isinstance(response, dict) or response.get("s") != "ok":
            raise RuntimeError("FYERS option-chain request failed")
        payload = response.get("data") or {}
        raw_chain = payload.get("optionsChain") or payload.get("options_chain") or []
        chain = []
        for item in raw_chain:
            if not isinstance(item, dict):
                continue
            opt_type = str(item.get("option_type") or item.get("optionType") or "").upper()
            if opt_type not in {"CE", "PE"}:
                continue
            strike = item.get("strike_price", item.get("strikePrice"))
            try:
                strike = float(strike)
            except (TypeError, ValueError):
                continue
            def number(*keys):
                for key in keys:
                    value = item.get(key)
                    if value is not None:
                        try:
                            return float(value)
                        except (TypeError, ValueError):
                            pass
                return None
            chain.append({
                "symbol": item.get("symbol"),
                "option_type": opt_type,
                "strike_price": strike,
                "ltp": number("ltp", "last_price"),
                "oi": number("oi", "open_interest"),
                "oi_change": number("oich", "oi_change", "change_in_oi"),
                "oi_change_percent": number("oipercent", "oi_change_percent"),
                "volume": number("volume"),
                "iv": number("iv", "implied_volatility"),
                "delta": number("delta", "delta_value"),
                "gamma": number("gamma", "gamma_value"),
                "theta": number("theta", "theta_value"),
                "vega": number("vega", "vega_value"),
                "bid": number("bid"),
                "ask": number("ask"),
            })
        if not chain:
            return {
                "status": "empty", "mode": "READ ONLY", "symbol": symbol,
                "underlying_value": payload.get("underlyingValue"),
                "expiry_data": payload.get("expiryData") or [],
                "options_chain": [],
                "message": "FYERS returned no option contracts for this underlying/expiry.",
            }
        calls = [x for x in chain if x["option_type"] == "CE"]
        puts = [x for x in chain if x["option_type"] == "PE"]
        call_oi = sum(x["oi"] or 0 for x in calls)
        put_oi = sum(x["oi"] or 0 for x in puts)
        pcr = round(put_oi / call_oi, 3) if call_oi else None
        strikes = sorted({x["strike_price"] for x in chain})
        max_pain = None
        if strikes:
            def pain_at(settlement):
                total = 0.0
                for option in calls:
                    total += max(0.0, settlement - option["strike_price"]) * (option["oi"] or 0)
                for option in puts:
                    total += max(0.0, option["strike_price"] - settlement) * (option["oi"] or 0)
                return total
            max_pain = min(strikes, key=pain_at)
        underlying = payload.get("underlyingValue")
        try:
            underlying = float(underlying) if underlying is not None else None
        except (TypeError, ValueError):
            underlying = None
        expiry_data = payload.get("expiryData") or []
        return {
            "status": "live", "mode": "READ ONLY", "symbol": symbol,
            "underlying_value": underlying,
            "expiry_data": expiry_data,
            "options_chain": sorted(chain, key=lambda x: (x["strike_price"], x["option_type"])),
            "summary": {
                "call_oi": call_oi, "put_oi": put_oi, "pcr": pcr,
                "max_pain": max_pain,
                "total_call_volume": sum(x["volume"] or 0 for x in calls),
                "total_put_volume": sum(x["volume"] or 0 for x in puts),
            },
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="FYERS option-chain request failed. Verify API access, underlying symbol and market session.",
        )

@app.get("/market/analysis")
def market_analysis(
    symbol: str = Query(default="NSE:NIFTY50-INDEX"),
    resolution: str = Query(default="5"),
):
    """Calculate technical indicators only from verified FYERS historical candles."""
    if not _access_token:
        raise HTTPException(status_code=503, detail="FYERS is not authorized. Re-authorize at /fyers/login.")
    allowed_symbols = {
        "NSE:NIFTY50-INDEX",
        "NSE:NIFTYBANK-INDEX",
        "NSE:FINNIFTY-INDEX",
        "BSE:SENSEX-INDEX",
    }
    allowed_resolutions = {"1", "3", "5", "10", "15", "30", "60", "120", "240", "D"}
    if symbol not in allowed_symbols or resolution not in allowed_resolutions:
        raise HTTPException(status_code=400, detail="Unsupported symbol or timeframe.")
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    start = now - timedelta(days=10 if resolution in {"1", "3", "5", "10", "15"} else 45)
    try:
        client = fyersModel.FyersModel(
            client_id=os.getenv("FYERS_APP_ID", "").strip(),
            token=_access_token,
            log_path="",
        )
        response = client.history(data={
            "symbol": symbol,
            "resolution": resolution,
            "date_format": "1",
            "range_from": start.strftime("%Y-%m-%d"),
            "range_to": now.strftime("%Y-%m-%d"),
            "cont_flag": "1",
        })
        if not isinstance(response, dict) or response.get("s") != "ok":
            raise RuntimeError("FYERS history request failed")
        raw = response.get("candles") or []
        candles = []
        for item in raw:
            if not isinstance(item, (list, tuple)) or len(item) < 6:
                continue
            try:
                candles.append({
                    "time": int(item[0]), "open": float(item[1]),
                    "high": float(item[2]), "low": float(item[3]),
                    "close": float(item[4]), "volume": float(item[5]),
                })
            except (TypeError, ValueError):
                continue
        candles.sort(key=lambda c: c["time"])
        if len(candles) < 55:
            return {"status": "insufficient_data", "symbol": symbol, "resolution": resolution,
                    "candles": candles, "indicators": {}, "mode": "READ ONLY"}
        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]
        volumes = [c["volume"] for c in candles]

        def ema(values, period):
            alpha = 2.0 / (period + 1)
            result = [None] * (len(values) - 1)
            current = sum(values[:period]) / period
            result.append(current)
            for value in values[period:]:
                current = alpha * value + (1 - alpha) * current
                result.append(current)
            return result

        ema20_series = ema(closes, 20)
        ema50_series = ema(closes, 50)
        gains, losses = [], []
        for i in range(1, len(closes)):
            delta = closes[i] - closes[i - 1]
            gains.append(max(delta, 0.0))
            losses.append(max(-delta, 0.0))
        avg_gain = sum(gains[:14]) / 14
        avg_loss = sum(losses[:14]) / 14
        for i in range(14, len(gains)):
            avg_gain = (avg_gain * 13 + gains[i]) / 14
            avg_loss = (avg_loss * 13 + losses[i]) / 14
        rsi = 100.0 if avg_loss == 0 else 100 - (100 / (1 + avg_gain / avg_loss))
        fast, slow = ema(closes, 12), ema(closes, 26)
        macd_series = [None if a is None or b is None else a - b for a, b in zip(fast, slow)]
        valid_macd = [v for v in macd_series if v is not None]
        signal_series = ema(valid_macd, 9) if len(valid_macd) >= 9 else []
        macd_value = valid_macd[-1] if valid_macd else None
        macd_signal = signal_series[-1] if signal_series else None
        # Session VWAP uses only candles from the latest trading date.
        from datetime import datetime as _dt
        latest_date = _dt.fromtimestamp(candles[-1]["time"], ZoneInfo("Asia/Kolkata")).date()
        session = [c for c in candles if _dt.fromtimestamp(c["time"], ZoneInfo("Asia/Kolkata")).date() == latest_date]
        total_pv = sum(((c["high"] + c["low"] + c["close"]) / 3) * c["volume"] for c in session)
        total_volume = sum(c["volume"] for c in session)
        vwap = total_pv / total_volume if total_volume > 0 else None
        recent = candles[-20:]
        support = min(c["low"] for c in recent)
        resistance = max(c["high"] for c in recent)
        # Transparent rule-based scoring; not a trained or calibrated predictor.
        last, previous = candles[-1], candles[-2]
        score, reasons = 0, []
        if ema20_series[-1] > ema50_series[-1]: score += 2; reasons.append("EMA 20 above EMA 50")
        else: score -= 2; reasons.append("EMA 20 below EMA 50")
        if rsi >= 55: score += 1; reasons.append("RSI positive momentum")
        elif rsi <= 45: score -= 1; reasons.append("RSI negative momentum")
        if macd_value is not None and macd_signal is not None:
            if macd_value > macd_signal: score += 1; reasons.append("MACD above signal")
            else: score -= 1; reasons.append("MACD below signal")
        if vwap is not None:
            if last["close"] >= vwap: score += 1; reasons.append("Price at/above VWAP")
            else: score -= 1; reasons.append("Price below VWAP")
        score += 1 if last["close"] > previous["close"] else -1 if last["close"] < previous["close"] else 0
        bias = "BULLISH" if score >= 3 else "BEARISH" if score <= -3 else "SIDEWAYS"
        up_probability = max(10, min(90, round(50 + score * 7)))
        down_probability = 100 - up_probability
        recent_high = max(c["high"] for c in candles[-20:-1])
        recent_low = min(c["low"] for c in candles[-20:-1])
        breakout = "BREAKOUT" if last["close"] > recent_high else "BREAKDOWN" if last["close"] < recent_low else "NO CONFIRMED BREAKOUT"
        candle_range = max(last["high"] - last["low"], 0.000001)
        upper_wick = last["high"] - max(last["open"], last["close"])
        lower_wick = min(last["open"], last["close"]) - last["low"]
        bull_trap = last["high"] > recent_high and last["close"] < recent_high and upper_wick > candle_range * .3
        bear_trap = last["low"] < recent_low and last["close"] > recent_low and lower_wick > candle_range * .3
        volatility = sum((c["high"]-c["low"])/max(c["close"],0.000001) for c in candles[-14:])/14
        risk_score = min(100, max(5, round(volatility * 10000)))
        # Additive engine integration: consumes the existing candle payload only.
        data_validation = validate_candles(candles, resolution)
        shared_indicators = calculate_indicators(candles)
        decision_context = build_decision_context(shared_indicators, bias, risk_score)
        return {
            "status": "live", "mode": "READ ONLY", "symbol": symbol,
            "resolution": resolution, "last_updated": candles[-1]["time"],
            "candles": candles[-200:],
            "data_validation": data_validation,
            "shared_indicators": shared_indicators,
            "decision_context": decision_context,
            "ai_analysis": {
                "status": "live", "market_bias": bias,
                "direction": "UPWARD" if up_probability > 55 else "DOWNWARD" if up_probability < 45 else "SIDEWAYS",
                "next_candle_up_probability": up_probability, "next_candle_down_probability": down_probability,
                "next_5m_outlook": "POSITIVE BIAS" if score >= 3 else "NEGATIVE BIAS" if score <= -3 else "NO CLEAR BIAS",
                "confidence": min(95, 50 + abs(score) * 8), "risk_score": risk_score,
                "risk_level": "HIGH" if risk_score >= 65 else "MODERATE" if risk_score >= 35 else "LOW",
                "breakout_status": breakout, "bull_trap": bool(bull_trap), "bear_trap": bool(bear_trap),
                "reasons": reasons, "trade_signal": "WAIT",
                "trade_signal_note": "Option-chain OI/IV confirmation is not connected; CE/PE calls remain disabled.",
                "option_chain_status": "PENDING"
            },
            "indicators": {
                "rsi14": round(rsi, 2),
                "macd": round(macd_value, 4) if macd_value is not None else None,
                "macd_signal": round(macd_signal, 4) if macd_signal is not None else None,
                "ema20": round(ema20_series[-1], 2) if ema20_series[-1] is not None else None,
                "ema50": round(ema50_series[-1], 2) if ema50_series[-1] is not None else None,
                "vwap": round(vwap, 2) if vwap is not None else None,
                "support": round(support, 2), "resistance": round(resistance, 2),
                "volume": candles[-1]["volume"],
            },
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="FYERS candle history unavailable. Verify market session, symbol and token.")
