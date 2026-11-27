"""Central, read-only decision context shared by all AI consumers."""


def _number(value):
    try:
        result = float(value)
        return result if result == result and abs(result) != float("inf") else None
    except (TypeError, ValueError, OverflowError):
        return None


def build_decision_context(indicators, market_bias, risk_score, option_pcr=None, tool_inputs=None):
    """Aggregate existing feature outputs without fetching or modifying market data."""
    indicators = indicators or {}
    tools = tool_inputs or {}
    bias = market_bias if market_bias in {"BULLISH", "BEARISH", "SIDEWAYS"} else "SIDEWAYS"
    risk = _number(risk_score)
    pcr = _number(option_pcr)
    valid_pcr = pcr is not None and pcr >= 0
    ready = risk is not None and 0 <= risk <= 100
    confirmation = tools.get("option_chain_confirmation") or {}
    call_oi = _number(confirmation.get("call_oi"))
    put_oi = _number(confirmation.get("put_oi"))
    call_iv = _number(confirmation.get("atm_call_iv"))
    put_iv = _number(confirmation.get("atm_put_iv"))
    oi_iv_ready = (
        confirmation.get("ready") is True
        and call_oi is not None and call_oi > 0
        and put_oi is not None and put_oi > 0
        and call_iv is not None and call_iv > 0
        and put_iv is not None and put_iv > 0
    )
    oi_direction = (
        "BEARISH" if call_oi > put_oi
        else "BULLISH" if put_oi > call_oi
        else "NEUTRAL"
    ) if oi_iv_ready else "PENDING"
    oi_iv_confirmed = oi_iv_ready and oi_direction == bias

    trade = "WAIT"
    if ready and risk < 65 and valid_pcr and oi_iv_confirmed:
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

    breakout = tools.get("breakout_status")
    if breakout not in {"BREAKOUT", "BREAKDOWN", "NO CONFIRMED BREAKOUT"}:
        breakout = "PENDING"
    support = _number(tools.get("support", indicators.get("support")))
    resistance = _number(tools.get("resistance", indicators.get("resistance")))

    trend_stability = _number(tools.get("trend_stability"))
    momentum = _number(tools.get("momentum_score"))
    risk_level = "PENDING" if not ready else "HIGH" if risk >= 65 else "MODERATE" if risk >= 35 else "LOW"

    sentiment_ready = tools.get("sentiment_ready") is True
    sentiment = tools.get("sentiment_label") if sentiment_ready else "WAITING"
    if sentiment not in {"BULLISH", "BEARISH", "NEUTRAL"}:
        sentiment = "WAITING"

    scalp_ready = tools.get("scalp_data_ready") is True and ready and risk < 65 and trade in {"BUY CE", "BUY PE"}
    scalp_type = tools.get("scalp_type")
    bull_score = _number(tools.get("scalp_bull_score"))
    bear_score = _number(tools.get("scalp_bear_score"))
    scalp_signal = "WAIT"
    if scalp_ready and scalp_type == "CE" and trade == "BUY CE" and bull_score is not None and bull_score >= 75:
        scalp_signal = "BUY CE"
    elif scalp_ready and scalp_type == "PE" and trade == "BUY PE" and bear_score is not None and bear_score >= 75:
        scalp_signal = "BUY PE"

    option_verdict = "PENDING" if not (valid_pcr and oi_iv_ready) else "BULLISH" if oi_direction == "BULLISH" else "BEARISH" if oi_direction == "BEARISH" else "SIDEWAYS"

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
        "tool_contexts": {
            "trend_detection": {"status": "ready" if any(trend_checks.values()) else "pending", "market_bias": bias, "indicator_availability": trend_checks},
            "breakout_detection": {"status": breakout, "confirmed": breakout in {"BREAKOUT", "BREAKDOWN"}},
            "support_resistance": {"status": "ready" if support is not None and resistance is not None else "pending", "support": support, "resistance": resistance},
            "risk_meter": {"status": "ready" if ready else "pending", "score": round(risk, 2) if ready else None, "level": risk_level, "trend_stability": trend_stability, "momentum_score": momentum},
            "market_sentiment": {"status": "ready" if sentiment_ready else "pending", "label": sentiment, "advances": tools.get("sentiment_up"), "declines": tools.get("sentiment_down")},
            "option_chain": {
                "status": "ready" if valid_pcr and oi_iv_ready else "pending",
                "verdict": option_verdict,
                "pcr": pcr if valid_pcr else None,
                "oi_iv_confirmation": "CONFIRMED" if oi_iv_confirmed else "CONFLICT" if oi_iv_ready else "PENDING",
                "oi_direction": oi_direction,
                "call_oi": call_oi,
                "put_oi": put_oi,
                "atm_call_iv": call_iv,
                "atm_put_iv": put_iv,
            },
            "smart_scalping": {"status": "ready" if scalp_ready else "pending", "signal": scalp_signal, "score": bull_score if scalp_type == "CE" else bear_score, "contract_type": scalp_type if scalp_type in {"CE", "PE"} else None},
        },
        "note": "Rule-based central context; existing feature calculations are retained and this is not a calibrated prediction or guarantee of profit.",
    }
