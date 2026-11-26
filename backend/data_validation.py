"""Read-only validation for FYERS candle payloads. Does not fetch or alter market data."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def validate_candles(candles, resolution="5", now=None):
    """Return validation metadata without modifying the supplied candles."""
    rows = candles if isinstance(candles, list) else []
    problems = []
    if not rows:
        return {"status": "invalid", "is_valid": False, "is_fresh": False,
                "reason": "No candle data received.", "age_seconds": None}

    seen = set()
    previous_time = None
    for index, candle in enumerate(rows):
        if not isinstance(candle, dict):
            problems.append("Malformed candle row.")
            continue
        try:
            stamp = int(candle["time"])
            o, h, l, c, v = (float(candle[k]) for k in ("open", "high", "low", "close", "volume"))
        except (KeyError, TypeError, ValueError, OverflowError):
            problems.append("Candle has missing or non-numeric OHLCV fields.")
            continue
        if stamp <= 0 or stamp in seen:
            problems.append("Candle timestamps are invalid or duplicated.")
        if previous_time is not None and stamp <= previous_time:
            problems.append("Candle timestamps are not strictly increasing.")
        seen.add(stamp)
        previous_time = stamp
        if min(o, h, l, c) <= 0 or v < 0 or h < max(o, c, l) or l > min(o, c, h):
            problems.append("Candle OHLCV values fail consistency checks.")
        if index == len(rows) - 1:
            last_stamp = stamp

    if problems:
        return {"status": "invalid", "is_valid": False, "is_fresh": False,
                "reason": problems[0], "age_seconds": None}

    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    local_now = now.astimezone(IST)
    age = max(0, int(now.timestamp()) - last_stamp)
    try:
        minutes = int(resolution) if str(resolution).isdigit() else 1440
    except (TypeError, ValueError):
        minutes = 5
    # Do not label data stale outside regular weekday market hours.
    in_session = local_now.weekday() < 5 and (
        (local_now.hour, local_now.minute) >= (9, 15) and
        (local_now.hour, local_now.minute) <= (15, 30)
    )
    if in_session and minutes < 1440:
        allowed_age = max(180, minutes * 180 + 60)
        fresh = age <= allowed_age
        return {"status": "valid" if fresh else "stale", "is_valid": fresh,
                "is_fresh": fresh, "reason": "Candle data is fresh." if fresh else "Latest candle is older than the allowed live-data window.",
                "age_seconds": age}
    return {"status": "valid", "is_valid": True, "is_fresh": None,
            "reason": "Structure is valid; freshness is not assessed outside market hours.",
            "age_seconds": age}
