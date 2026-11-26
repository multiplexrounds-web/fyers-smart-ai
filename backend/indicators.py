"""Shared, dependency-free technical indicator calculations for verified candles."""


def _ema(values, period):
    if len(values) < period:
        return []
    alpha = 2.0 / (period + 1)
    out = [None] * (period - 1)
    current = sum(values[:period]) / period
    out.append(current)
    for value in values[period:]:
        current = alpha * value + (1 - alpha) * current
        out.append(current)
    return out


def _rsi(values, period=14):
    if len(values) <= period:
        return None
    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    gains = [max(x, 0.0) for x in changes]
    losses = [max(-x, 0.0) for x in changes]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def _supertrend(highs, lows, closes, period=10, multiplier=3.0):
    if len(closes) < period + 1:
        return None, None
    tr = []
    for i in range(1, len(closes)):
        tr.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))
    atr = sum(tr[:period]) / period
    upper = lower = None
    trend = None
    value = None
    for i in range(period, len(closes)):
        if i > period:
            atr = (atr * (period - 1) + tr[i - 1]) / period
        mid = (highs[i] + lows[i]) / 2.0
        basic_upper = mid + multiplier * atr
        basic_lower = mid - multiplier * atr
        upper = basic_upper if upper is None or basic_upper < upper or closes[i - 1] > upper else upper
        lower = basic_lower if lower is None or basic_lower > lower or closes[i - 1] < lower else lower
        if trend is None:
            trend = "BULLISH" if closes[i] >= mid else "BEARISH"
        elif trend == "BEARISH" and closes[i] > upper:
            trend = "BULLISH"
        elif trend == "BULLISH" and closes[i] < lower:
            trend = "BEARISH"
        value = lower if trend == "BULLISH" else upper
    return value, trend


def calculate_indicators(candles):
    """Calculate the common indicator set from chronological OHLCV candle dictionaries."""
    if not isinstance(candles, list) or len(candles) < 55:
        return {}
    closes = [float(c["close"]) for c in candles]
    highs = [float(c["high"]) for c in candles]
    lows = [float(c["low"]) for c in candles]
    ema20 = _ema(closes, 20)
    ema50 = _ema(closes, 50)
    fast, slow = _ema(closes, 12), _ema(closes, 26)
    macd_values = [a - b for a, b in zip(fast, slow) if a is not None and b is not None]
    signal_values = _ema(macd_values, 9) if len(macd_values) >= 9 else []
    rsi = _rsi(closes, 14)

    # Session VWAP uses the latest candle date, matching the existing app calculation.
    from datetime import datetime
    from zoneinfo import ZoneInfo
    latest_date = datetime.fromtimestamp(int(candles[-1]["time"]), ZoneInfo("Asia/Kolkata")).date()
    session = [c for c in candles if datetime.fromtimestamp(int(c["time"]), ZoneInfo("Asia/Kolkata")).date() == latest_date]
    total_volume = sum(float(c["volume"]) for c in session)
    vwap = (sum(((float(c["high"]) + float(c["low"]) + float(c["close"])) / 3.0) * float(c["volume"]) for c in session) / total_volume) if total_volume > 0 else None
    supertrend, supertrend_direction = _supertrend(highs, lows, closes)
    recent = candles[-20:]
    return {
        "rsi14": round(rsi, 2) if rsi is not None else None,
        "macd": round(macd_values[-1], 4) if macd_values else None,
        "macd_signal": round(signal_values[-1], 4) if signal_values else None,
        "ema20": round(ema20[-1], 2) if ema20 else None,
        "ema50": round(ema50[-1], 2) if ema50 else None,
        "vwap": round(vwap, 2) if vwap is not None else None,
        "support": round(min(float(c["low"]) for c in recent), 2),
        "resistance": round(max(float(c["high"]) for c in recent), 2),
        "volume": float(candles[-1]["volume"]),
        "supertrend": round(supertrend, 2) if supertrend is not None else None,
        "supertrend_direction": supertrend_direction,
    }
