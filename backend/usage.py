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
import voice_guardrails as vg
import cost_control

# Per-patient daily ceiling. 0.50 leaves headroom over the ~0.35 target/user so a
# normal heavy day is never blocked, while a runaway loop still can't drain the pool.
DAILY_AI_COST_CAP_USD = float(os.environ.get("DAILY_AI_COST_CAP_USD", "0.50"))
MAX_AI_ACTIONS_PER_DAY = int(os.environ.get("MAX_AI_ACTIONS_PER_DAY", "50"))
DAILY_VOICE_MINUTES_CAP = vg.DAILY_VOICE_MINUTES_CAP
MAX_RECORDING_SECONDS = vg.MAX_RECORDING_SECONDS
MAX_MEETING_MINUTES = vg.MAX_MEETING_MINUTES
SMART_DAY_CLOUD_MINUTES_CAP = float(os.environ.get("SMART_DAY_CLOUD_MINUTES_CAP", "15"))
MAX_SMART_DAY_SNIPPET_SECONDS = int(os.environ.get("MAX_SMART_DAY_SNIPPET_SECONDS", "60"))
MAX_SMART_DAY_SESSION_HOURS = float(os.environ.get("MAX_SMART_DAY_SESSION_HOURS", "2"))

VOICE_LIMIT_MESSAGE = vg.VOICE_LIMIT_MESSAGE

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


async def _usage_doc(pid: str) -> dict:
    return await db.ai_usage.find_one({"patient_id": pid, "day": await _today()}, {"_id": 0}) or {}


async def spent_today(pid: str) -> float:
    return float((await _usage_doc(pid)).get("est_cost", 0.0))


async def voice_minutes_today(pid: str) -> float:
    return await vg.voice_minutes_recorded_today(pid)


async def smart_day_cloud_minutes_today(pid: str) -> float:
    return float((await _usage_doc(pid)).get("smart_day_cloud_minutes", 0.0))


async def actions_today(pid: str) -> int:
    return int((await _usage_doc(pid)).get("ops", 0))


async def assert_within_cap(pid: str) -> None:
    """Raise 429 if the patient has already hit today's AI cost ceiling."""
    await cost_control.assert_within_monthly_quota_for_patient(pid)
    if DAILY_AI_COST_CAP_USD <= 0:
        return
    if await spent_today(pid) >= DAILY_AI_COST_CAP_USD:
        raise HTTPException(
            status_code=429,
            detail="Daily AI limit reached for today. This protects your usage budget — "
            "the rest of the app still works. Please try again tomorrow.",
        )


async def assert_action_cap(pid: str) -> None:
    if MAX_AI_ACTIONS_PER_DAY <= 0:
        return
    if await actions_today(pid) >= MAX_AI_ACTIONS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="Daily AI action limit reached. You can still use non-AI features or type manually.",
        )


async def assert_smart_day_cloud_cap(pid: str, minutes: float) -> None:
    if SMART_DAY_CLOUD_MINUTES_CAP <= 0:
        return
    if minutes > MAX_SMART_DAY_SNIPPET_SECONDS / 60:
        raise HTTPException(
            status_code=400,
            detail=f"Snippet too long (max {MAX_SMART_DAY_SNIPPET_SECONDS} seconds).",
        )
    if await smart_day_cloud_minutes_today(pid) + minutes > SMART_DAY_CLOUD_MINUTES_CAP:
        raise HTTPException(status_code=429, detail=VOICE_LIMIT_MESSAGE)


async def record_smart_day_cloud_minutes(pid: str, minutes: float) -> None:
    day = await _today()
    await db.ai_usage.update_one(
        {"patient_id": pid, "day": day},
        {
            "$inc": {"smart_day_cloud_minutes": max(0.0, minutes), "voice_minutes": max(0.0, minutes)},
            "$setOnInsert": {"patient_id": pid, "day": day, "est_cost": 0.0, "ops": 0},
        },
        upsert=True,
    )


async def assert_voice_cap(pid: str, minutes: float, capture_type: str = "memory") -> None:
    await vg.assert_can_record_voice(pid, minutes, capture_type=capture_type)


async def assert_meeting_length(pid: str, minutes: float) -> None:
    await vg.assert_can_record_voice(pid, minutes, capture_type="meeting")


async def record(pid: str, kind: str, in_chars: int = 0, out_chars: int = 0, tier: str = "cheap") -> None:
    """Accumulate an AI call's estimated cost against the patient's daily total."""
    cost = estimate_cost(in_chars, out_chars, tier)
    day = await _today()
    await db.ai_usage.update_one(
        {"patient_id": pid, "day": day},
        {
            "$inc": {"est_cost": cost, "ops": 1},
            "$setOnInsert": {"patient_id": pid, "day": day, "voice_minutes": 0.0},
        },
        upsert=True,
    )


async def record_voice_minutes(pid: str, minutes: float) -> None:
    await vg.record_voice_usage(pid, minutes, "voice_minutes_recorded")


async def usage_summary(pid: str) -> dict:
    """Today's usage for surfacing in the UI / admin."""
    doc = await _usage_doc(pid)
    spent = float(doc.get("est_cost", 0.0))
    voice = float(doc.get("voice_minutes_recorded", doc.get("voice_minutes", 0.0)))
    voice_cap = await vg.daily_voice_cap_minutes(pid)
    ops = int(doc.get("ops", 0))
    return {
        "day": await _today(),
        "est_cost": round(spent, 4),
        "ops": ops,
        "cap": DAILY_AI_COST_CAP_USD,
        "remaining": round(max(0.0, DAILY_AI_COST_CAP_USD - spent), 4),
        "capped": spent >= DAILY_AI_COST_CAP_USD if DAILY_AI_COST_CAP_USD > 0 else False,
        "voice_minutes": round(voice, 2),
        "voice_minutes_recorded": round(voice, 2),
        "voice_cap_minutes": voice_cap,
        "voice_remaining_minutes": round(max(0.0, voice_cap - voice), 2),
        "cloud_transcription_minutes": round(float(doc.get("cloud_transcription_minutes", 0.0)), 2),
        "browser_speech_sessions": int(doc.get("browser_speech_sessions", 0)),
        "cloud_transcription_attempts_blocked": int(doc.get("cloud_transcription_attempts_blocked", 0)),
        "recording_limit_blocks": int(doc.get("recording_limit_blocks", 0)),
        "voice_plan": await vg.patient_voice_plan(pid),
        "actions_cap": MAX_AI_ACTIONS_PER_DAY,
        "max_recording_seconds": MAX_RECORDING_SECONDS,
        "max_single_recording_minutes": vg.MAX_SINGLE_RECORDING_MINUTES,
        "max_meeting_minutes": MAX_MEETING_MINUTES,
        "max_meeting_capture_minutes": vg.MAX_MEETING_CAPTURE_MINUTES,
        "cloud_transcription_enabled": vg.CLOUD_TRANSCRIPTION_ENABLED,
        "smart_day_cloud_minutes": round(float(doc.get("smart_day_cloud_minutes", 0.0)), 2),
        "smart_day_cloud_cap_minutes": SMART_DAY_CLOUD_MINUTES_CAP,
        "smart_day_cloud_remaining_minutes": round(
            max(0.0, SMART_DAY_CLOUD_MINUTES_CAP - float(doc.get("smart_day_cloud_minutes", 0.0))), 2,
        ),
        "max_smart_day_snippet_seconds": MAX_SMART_DAY_SNIPPET_SECONDS,
        "max_smart_day_session_hours": MAX_SMART_DAY_SESSION_HOURS,
    }


async def reset_daily_usage(pid: str) -> None:
    """Clear today's AI usage for one patient (test isolation)."""
    day = await _today()
    await db.ai_usage.delete_one({"patient_id": pid, "day": day})
