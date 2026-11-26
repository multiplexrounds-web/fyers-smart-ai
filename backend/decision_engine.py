"""Central, read-only decision context shared by backend AI analysis consumers."""


def build_decision_context(indicators, market_bias, risk_score, option_pcr=None):
    """Produce one consistent market/option decision context; never submits orders."""
    indicators = indicators or {}
    bias = market_bias if market_bias in {"BULLISH", "BEARISH", "SIDEWAYS"} else "SIDEWAYS"
    try:
        risk = float(risk_score)
    except (TypeError, ValueError):
        risk = None
    try:
        pcr = float(option_pcr) if option_pcr is not None else None
    except (TypeError, ValueError):
        pcr = None
    valid_pcr = pcr is not None and pcr >= 0
    ready = risk is not None and 0 <= risk <= 100
    trade = "WAIT"
    if ready and risk < 65 and valid_pcr:
        if bias == "BULLISH" and pcr >= 0.9:
            trade = "BUY CE"
        elif bias == "BEARISH" and pcr <= 1.1:
            trade = "BUY PE"
    trend_checks = {
        "ema": indicators.get("ema20") is not None and indicators.get("ema50") is not None,
        "rsi": indicators.get("rsi14") is not None,
        "macd": indicators.get("macd") is not None and indicators.get("macd_signal") is not None,
        "vwap": indicators.get("vwap") is not None,
        "supertrend": indicators.get("supertrend") is not None,
    }
    return {
        "status": "ready" if ready else "pending",
        "mode": "READ ONLY",
        "order_execution": False,
        "market_bias": bias,
        "risk_score": round(risk, 2) if ready else None,
        "option_pcr": pcr if valid_pcr else None,
        "smart_trade_signal": trade,
        "indicator_availability": trend_checks,
        "indicator_confirmation_count": sum(bool(v) for v in trend_checks.values()),
        "note": "Rule-based decision context, not a calibrated prediction or guarantee of profit.",
    }
