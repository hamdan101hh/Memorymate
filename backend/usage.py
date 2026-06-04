"""Per-user daily AI usage tracking + hard cost cap.

This is the safety that makes "always-on capture for 100 users on a small budget"
a guarantee instead of a hope: every AI call estimates its cost and accumulates it
against a per-patient daily ceiling. Once the ceiling is hit, further AI calls are
refused for the rest of the day (the rest of the app keeps working).

Cost is estimated from text length (≈4 chars/token) and per-model token prices, so
no provider billing API is required.
"""
import os
from datetime import date
from fastapi import HTTPException

from db import db

# Per-patient daily ceiling. 0.50 leaves headroom over the ~0.35 target/user so a
# normal heavy day is never blocked, while a runaway loop still can't drain the pool.
DAILY_AI_COST_CAP_USD = float(os.environ.get("DAILY_AI_COST_CAP_USD", "0.50"))

# Rough USD per 1M tokens (input, output). "cheap" = capture/summary tier.
_PRICES = {
    "cheap": (0.15, 0.60),    # ~GPT-4o-mini / Gemini Flash class
    "primary": (3.00, 15.00), # ~Claude Sonnet class
}
_CHARS_PER_TOKEN = 4


def estimate_cost(in_chars: int, out_chars: int, tier: str = "cheap") -> float:
    in_price, out_price = _PRICES.get(tier, _PRICES["cheap"])
    in_tokens = max(0, in_chars) / _CHARS_PER_TOKEN
    out_tokens = max(0, out_chars) / _CHARS_PER_TOKEN
    return (in_tokens / 1_000_000) * in_price + (out_tokens / 1_000_000) * out_price


async def _today() -> str:
    return date.today().isoformat()


async def spent_today(pid: str) -> float:
    doc = await db.ai_usage.find_one({"patient_id": pid, "day": await _today()}, {"_id": 0})
    return float(doc.get("est_cost", 0.0)) if doc else 0.0


async def assert_within_cap(pid: str) -> None:
    """Raise 429 if the patient has already hit today's AI cost ceiling."""
    if DAILY_AI_COST_CAP_USD <= 0:
        return  # cap disabled
    if await spent_today(pid) >= DAILY_AI_COST_CAP_USD:
        raise HTTPException(
            status_code=429,
            detail="Daily AI limit reached for today. This protects your usage budget — "
            "the rest of the app still works. Please try again tomorrow.",
        )


async def record(pid: str, kind: str, in_chars: int = 0, out_chars: int = 0, tier: str = "cheap") -> None:
    """Accumulate an AI call's estimated cost against the patient's daily total."""
    cost = estimate_cost(in_chars, out_chars, tier)
    day = await _today()
    await db.ai_usage.update_one(
        {"patient_id": pid, "day": day},
        {
            "$inc": {"est_cost": cost, "ops": 1},
            "$setOnInsert": {"patient_id": pid, "day": day},
        },
        upsert=True,
    )


async def usage_summary(pid: str) -> dict:
    """Today's usage for surfacing in the UI / admin."""
    doc = await db.ai_usage.find_one({"patient_id": pid, "day": await _today()}, {"_id": 0})
    spent = float(doc.get("est_cost", 0.0)) if doc else 0.0
    return {
        "day": await _today(),
        "est_cost": round(spent, 4),
        "ops": int(doc.get("ops", 0)) if doc else 0,
        "cap": DAILY_AI_COST_CAP_USD,
        "remaining": round(max(0.0, DAILY_AI_COST_CAP_USD - spent), 4),
        "capped": spent >= DAILY_AI_COST_CAP_USD if DAILY_AI_COST_CAP_USD > 0 else False,
    }
