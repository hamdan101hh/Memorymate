"""Voice and transcription cost guardrails — browser speech first, cloud STT off by default."""
import os
from typing import Optional, Tuple

from fastapi import HTTPException

from db import db

# ---- environment (safe defaults) ----
CLOUD_TRANSCRIPTION_ENABLED = os.environ.get("CLOUD_TRANSCRIPTION_ENABLED", "false").lower() == "true"
VOICE_COST_GUARDRAILS_ENABLED = os.environ.get("VOICE_COST_GUARDRAILS_ENABLED", "true").lower() == "true"
REQUIRE_CONFIRMATION_FOR_CLOUD_TRANSCRIPTION = (
    os.environ.get("REQUIRE_CONFIRMATION_FOR_CLOUD_TRANSCRIPTION", "true").lower() == "true"
)

FREE_VOICE_MINUTES_PER_DAY = float(os.environ.get("FREE_VOICE_MINUTES_PER_DAY", "5"))
PLUS_VOICE_MINUTES_PER_DAY = float(os.environ.get("PLUS_VOICE_MINUTES_PER_DAY", "30"))
FAMILY_VOICE_MINUTES_PER_DAY = float(os.environ.get("FAMILY_VOICE_MINUTES_PER_DAY", "60"))
DEFAULT_VOICE_MINUTES_PER_DAY = float(os.environ.get("DEFAULT_VOICE_MINUTES_PER_DAY", "15"))

MAX_SINGLE_RECORDING_MINUTES = float(os.environ.get("MAX_SINGLE_RECORDING_MINUTES", "10"))
MAX_MEETING_CAPTURE_MINUTES = float(os.environ.get("MAX_MEETING_CAPTURE_MINUTES", "60"))

# Legacy env aliases (still honored when plan caps not overridden)
DAILY_VOICE_MINUTES_CAP = float(os.environ.get("DAILY_VOICE_MINUTES_CAP", str(FREE_VOICE_MINUTES_PER_DAY)))
MAX_RECORDING_SECONDS = int(os.environ.get("MAX_RECORDING_SECONDS", str(int(MAX_SINGLE_RECORDING_MINUTES * 60))))
MAX_MEETING_MINUTES = int(os.environ.get("MAX_MEETING_MINUTES", str(int(MAX_MEETING_CAPTURE_MINUTES))))

VOICE_LIMIT_MESSAGE = "Voice limit reached for today. You can type the note instead."
SINGLE_RECORDING_TOO_LONG = (
    f"This recording is too long. Please keep single memories under {int(MAX_SINGLE_RECORDING_MINUTES)} minutes."
)
MEETING_TOO_LONG = f"Meeting capture is limited to {int(MAX_MEETING_CAPTURE_MINUTES)} minutes."
CLOUD_TRANSCRIPTION_DISABLED = "Cloud transcription is disabled in this environment."
CLOUD_TRANSCRIPTION_CONFIRM = "Cloud transcription requires your confirmation before upload."
REMINDER_NO_VOICE = "Smart Capture reminders only send check-ins. They do not record or transcribe."

CAPTURE_TYPES = frozenset({
    "memory", "meeting", "conversation", "smart_day", "browser_speech", "reminder", "unknown",
})
USAGE_MODES = frozenset({
    "browser_speech", "cloud_transcription", "recording_limit_block", "cloud_transcription_blocked",
    "voice_minutes_recorded",
})

_PLAN_CAPS = {
    "free": FREE_VOICE_MINUTES_PER_DAY,
    "plus": PLUS_VOICE_MINUTES_PER_DAY,
    "family": FAMILY_VOICE_MINUTES_PER_DAY,
    "default": DEFAULT_VOICE_MINUTES_PER_DAY,
}


async def patient_voice_plan(pid: str) -> str:
    doc = await db.patients.find_one({"id": pid}, {"_id": 0, "voice_plan": 1})
    plan = (doc or {}).get("voice_plan") or "default"
    return plan if plan in _PLAN_CAPS else "default"


async def daily_voice_cap_minutes(pid: str) -> float:
    plan = await patient_voice_plan(pid)
    cap = _PLAN_CAPS.get(plan, DEFAULT_VOICE_MINUTES_PER_DAY)
    if DAILY_VOICE_MINUTES_CAP > 0 and plan == "free":
        return min(cap, DAILY_VOICE_MINUTES_CAP)
    return cap


async def _usage_doc(pid: str) -> dict:
    from usage import _today

    day = await _today()
    return await db.ai_usage.find_one({"patient_id": pid, "day": day}, {"_id": 0}) or {}


async def voice_minutes_recorded_today(pid: str) -> float:
    doc = await _usage_doc(pid)
    return float(doc.get("voice_minutes_recorded", doc.get("voice_minutes", 0.0)))


async def cloud_transcription_minutes_today(pid: str) -> float:
    return float((await _usage_doc(pid)).get("cloud_transcription_minutes", 0.0))


async def can_record_voice(
    pid: str,
    minutes_requested: float,
    capture_type: str = "memory",
) -> Tuple[bool, Optional[str]]:
    """Check recording length and daily voice cap. Reminders never allow voice."""
    ct = capture_type if capture_type in CAPTURE_TYPES else "unknown"
    if ct == "reminder":
        return False, REMINDER_NO_VOICE

    if not VOICE_COST_GUARDRAILS_ENABLED:
        return True, None

    mins = max(0.0, float(minutes_requested or 0))
    if ct in ("meeting", "conversation"):
        if MAX_MEETING_CAPTURE_MINUTES > 0 and mins > MAX_MEETING_CAPTURE_MINUTES:
            return False, MEETING_TOO_LONG
    else:
        if MAX_SINGLE_RECORDING_MINUTES > 0 and mins > MAX_SINGLE_RECORDING_MINUTES:
            return False, SINGLE_RECORDING_TOO_LONG

    cap = await daily_voice_cap_minutes(pid)
    if cap > 0 and await voice_minutes_recorded_today(pid) + mins > cap:
        return False, VOICE_LIMIT_MESSAGE

    return True, None


async def can_use_cloud_transcription(
    pid: str,
    minutes_requested: float,
    *,
    user_confirmed: bool = False,
) -> Tuple[bool, Optional[str]]:
    if not CLOUD_TRANSCRIPTION_ENABLED:
        return False, CLOUD_TRANSCRIPTION_DISABLED
    if REQUIRE_CONFIRMATION_FOR_CLOUD_TRANSCRIPTION and not user_confirmed:
        return False, CLOUD_TRANSCRIPTION_CONFIRM
    ok, msg = await can_record_voice(pid, minutes_requested, "memory")
    if not ok:
        return False, msg
    return True, None


async def assert_can_record_voice(
    pid: str,
    minutes_requested: float,
    capture_type: str = "memory",
) -> None:
    ok, msg = await can_record_voice(pid, minutes_requested, capture_type)
    if not ok:
        code = 429 if msg == VOICE_LIMIT_MESSAGE else 400
        if capture_type == "reminder":
            code = 403
        raise HTTPException(status_code=code, detail=msg)


async def assert_can_use_cloud_transcription(
    pid: str,
    minutes_requested: float,
    *,
    user_confirmed: bool = False,
) -> None:
    ok, msg = await can_use_cloud_transcription(pid, minutes_requested, user_confirmed=user_confirmed)
    if not ok:
        if msg == CLOUD_TRANSCRIPTION_DISABLED:
            raise HTTPException(status_code=403, detail=msg)
        if msg == CLOUD_TRANSCRIPTION_CONFIRM:
            raise HTTPException(status_code=400, detail=msg)
        code = 429 if msg == VOICE_LIMIT_MESSAGE else 400
        raise HTTPException(status_code=code, detail=msg)


async def record_voice_usage(pid: str, minutes_used: float, mode: str) -> None:
    """Track daily voice usage counters (resets by calendar day)."""
    from usage import _today

    if mode not in USAGE_MODES:
        mode = "voice_minutes_recorded"
    mins = max(0.0, float(minutes_used or 0))
    day = await _today()
    inc: dict = {}
    if mode == "browser_speech":
        inc["browser_speech_sessions"] = 1
        if mins > 0:
            inc["voice_minutes_recorded"] = mins
            inc["voice_minutes"] = mins
    elif mode == "cloud_transcription":
        inc["cloud_transcription_minutes"] = mins
        inc["voice_minutes_recorded"] = mins
        inc["voice_minutes"] = mins
    elif mode == "cloud_transcription_blocked":
        inc["cloud_transcription_attempts_blocked"] = 1
    elif mode == "recording_limit_block":
        inc["recording_limit_blocks"] = 1
    elif mode == "voice_minutes_recorded" and mins > 0:
        inc["voice_minutes_recorded"] = mins
        inc["voice_minutes"] = mins

    if not inc:
        return

    await db.ai_usage.update_one(
        {"patient_id": pid, "day": day},
        {
            "$inc": inc,
            "$setOnInsert": {"patient_id": pid, "day": day, "est_cost": 0.0, "ops": 0},
        },
        upsert=True,
    )


def public_config() -> dict:
    """Safe voice guardrail flags for frontend — no secrets."""
    return {
        "voice_guardrails_enabled": VOICE_COST_GUARDRAILS_ENABLED,
        "cloud_transcription_enabled": CLOUD_TRANSCRIPTION_ENABLED,
        "require_confirmation_for_cloud_transcription": REQUIRE_CONFIRMATION_FOR_CLOUD_TRANSCRIPTION,
        "browser_speech_first": True,
        "daily_voice_cap_default_minutes": DEFAULT_VOICE_MINUTES_PER_DAY,
        "free_voice_minutes_per_day": FREE_VOICE_MINUTES_PER_DAY,
        "plus_voice_minutes_per_day": PLUS_VOICE_MINUTES_PER_DAY,
        "family_voice_minutes_per_day": FAMILY_VOICE_MINUTES_PER_DAY,
        "max_single_recording_minutes": MAX_SINGLE_RECORDING_MINUTES,
        "max_meeting_capture_minutes": MAX_MEETING_CAPTURE_MINUTES,
        "voice_limit_message": VOICE_LIMIT_MESSAGE,
        "cloud_transcription_disabled_message": CLOUD_TRANSCRIPTION_DISABLED,
    }
