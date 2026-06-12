"""Smart Capture Reminders — 24h opt-in check-ins only (no auto-recording)."""
import random
from datetime import datetime, timezone, timedelta
from typing import Optional

from zoneinfo import ZoneInfo

MODE_HOURS = 24
QUIET_DAY_EVENING_HOUR = 19

PROMPT_MESSAGES = [
    "Anything worth saving from the last few hours?",
    "Want to record a quick memory?",
    "Need to save a reminder, note, or moment?",
    "You can skip if nothing important happened.",
]

SMART_REMINDER_FIELDS = {
    "smart_capture_reminders_enabled": False,
    "smart_capture_started_at": None,
    "smart_capture_ends_at": None,
    "smart_capture_paused": False,
    "smart_capture_quiet_day": False,
    "smart_capture_skip_until": None,
    "smart_capture_last_prompt_at": None,
    "smart_capture_next_prompt_at": None,
    "smart_capture_weekday_interval_hours": 5,
    "smart_capture_weekend_interval_hours": 3,
    "smart_capture_consecutive_skips": 0,
    "smart_capture_quiet_day_evening_sent": False,
}


def _parse_iso(s: str | None) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def local_now_from_offset(now_utc: datetime, tz_offset_minutes: int) -> datetime:
    return now_utc + timedelta(minutes=int(tz_offset_minutes or 0))


def utc_from_local(local_dt: datetime, tz_offset_minutes: int) -> datetime:
    return local_dt - timedelta(minutes=int(tz_offset_minutes or 0))


def interval_hours(local_dt: datetime, settings: dict) -> int:
    wd = local_dt.weekday()
    if wd >= 5:
        return int(settings.get("smart_capture_weekend_interval_hours") or 3)
    return int(settings.get("smart_capture_weekday_interval_hours") or 5)


def end_of_local_day_iso(now_utc: datetime, tz_offset_minutes: int) -> str:
    local = local_now_from_offset(now_utc, tz_offset_minutes)
    end_local = local.replace(hour=23, minute=59, second=59, microsecond=0)
    return utc_from_local(end_local, tz_offset_minutes).isoformat()


def evening_checkin_utc(now_utc: datetime, tz_offset_minutes: int) -> Optional[datetime]:
    local = local_now_from_offset(now_utc, tz_offset_minutes)
    evening_local = local.replace(hour=QUIET_DAY_EVENING_HOUR, minute=0, second=0, microsecond=0)
    if local.hour >= QUIET_DAY_EVENING_HOUR:
        return None
    return utc_from_local(evening_local, tz_offset_minutes)


def compute_next_prompt_at(
    now_utc: datetime,
    settings: dict,
    tz_offset_minutes: int,
    *,
    after_skip: bool = False,
) -> Optional[str]:
    if settings.get("smart_capture_quiet_day"):
        if settings.get("smart_capture_quiet_day_evening_sent"):
            return None
        evening = evening_checkin_utc(now_utc, tz_offset_minutes)
        return evening.isoformat() if evening else None
    hours = interval_hours(local_now_from_offset(now_utc, tz_offset_minutes), settings)
    base = now_utc
    if after_skip and settings.get("smart_capture_next_prompt_at"):
        nxt = _parse_iso(settings["smart_capture_next_prompt_at"])
        if nxt and nxt > now_utc:
            base = nxt
    return (base + timedelta(hours=hours)).isoformat()


def is_active(settings: dict, now_utc: datetime | None = None) -> bool:
    now_utc = now_utc or datetime.now(timezone.utc)
    if not settings.get("smart_capture_reminders_enabled"):
        return False
    ends = _parse_iso(settings.get("smart_capture_ends_at"))
    if ends and now_utc >= ends:
        return False
    return True


def is_skipped(settings: dict, now_utc: datetime) -> bool:
    skip_until = _parse_iso(settings.get("smart_capture_skip_until"))
    if skip_until and now_utc < skip_until:
        return True
    return False


def prompt_is_due(settings: dict, now_utc: datetime, tz_offset_minutes: int) -> bool:
    if not is_active(settings, now_utc):
        return False
    if settings.get("smart_capture_paused"):
        return False
    if is_skipped(settings, now_utc):
        return False
    nxt = _parse_iso(settings.get("smart_capture_next_prompt_at"))
    if not nxt:
        return False
    if now_utc < nxt:
        return False
    if settings.get("smart_capture_quiet_day") and settings.get("smart_capture_quiet_day_evening_sent"):
        return False
    return True


def time_remaining_seconds(settings: dict, now_utc: datetime) -> int:
    ends = _parse_iso(settings.get("smart_capture_ends_at"))
    if not ends:
        return 0
    return max(0, int((ends - now_utc).total_seconds()))


def format_remaining(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    return f"{h}h {m}m"


def build_status(settings: dict, tz_offset_minutes: int, now_utc: datetime | None = None) -> dict:
    now_utc = now_utc or datetime.now(timezone.utc)
    active = is_active(settings, now_utc)
    local = local_now_from_offset(now_utc, tz_offset_minutes)
    remaining = time_remaining_seconds(settings, now_utc) if active else 0
    interval = interval_hours(local, settings) if active else None
    weekend = local.weekday() >= 5
    due = prompt_is_due(settings, now_utc, tz_offset_minutes)
    skips = int(settings.get("smart_capture_consecutive_skips") or 0)
    suggest_quiet = active and skips >= 2 and not settings.get("smart_capture_quiet_day")

    nxt_iso = settings.get("smart_capture_next_prompt_at")
    nxt_dt = _parse_iso(nxt_iso)

    return {
        "active": active,
        "enabled": settings.get("smart_capture_reminders_enabled", False),
        "paused": settings.get("smart_capture_paused", False),
        "quiet_day": settings.get("smart_capture_quiet_day", False),
        "skipped_today": is_skipped(settings, now_utc),
        "started_at": settings.get("smart_capture_started_at"),
        "ends_at": settings.get("smart_capture_ends_at"),
        "time_remaining_seconds": remaining,
        "time_remaining_label": format_remaining(remaining) if active else "",
        "next_prompt_at": nxt_iso,
        "next_prompt_local_hint": nxt_dt.isoformat() if nxt_dt else None,
        "interval_hours": interval,
        "weekend_schedule": weekend,
        "schedule_interval_hours": interval,
        "prompt_due": due,
        "prompt_message": random.choice(PROMPT_MESSAGES) if due else None,
        "suggest_quiet_day": suggest_quiet,
        "consecutive_skips": skips,
        "no_auto_recording": True,
        "recording_requires_user_action": True,
    }


def start_updates(now_iso: str, now_utc: datetime, tz_offset_minutes: int) -> dict:
    ends = now_utc + timedelta(hours=MODE_HOURS)
    settings_stub = {
        "smart_capture_weekday_interval_hours": 5,
        "smart_capture_weekend_interval_hours": 3,
        "smart_capture_quiet_day": False,
        "smart_capture_quiet_day_evening_sent": False,
    }
    next_at = compute_next_prompt_at(now_utc, settings_stub, tz_offset_minutes)
    return {
        "smart_capture_reminders_enabled": True,
        "smart_capture_started_at": now_iso,
        "smart_capture_ends_at": ends.isoformat(),
        "smart_capture_paused": False,
        "smart_capture_quiet_day": False,
        "smart_capture_quiet_day_evening_sent": False,
        "smart_capture_skip_until": None,
        "smart_capture_last_prompt_at": None,
        "smart_capture_next_prompt_at": next_at,
        "smart_capture_consecutive_skips": 0,
    }


def stop_updates() -> dict:
    return {
        "smart_capture_reminders_enabled": False,
        "smart_capture_paused": False,
        "smart_capture_quiet_day": False,
        "smart_capture_quiet_day_evening_sent": False,
        "smart_capture_skip_until": None,
        "smart_capture_started_at": None,
        "smart_capture_ends_at": None,
        "smart_capture_next_prompt_at": None,
        "smart_capture_consecutive_skips": 0,
    }


def after_prompt_sent_updates(
    settings: dict,
    now_iso: str,
    now_utc: datetime,
    tz_offset_minutes: int,
) -> dict:
    updates = {"smart_capture_last_prompt_at": now_iso}
    if settings.get("smart_capture_quiet_day"):
        updates["smart_capture_quiet_day_evening_sent"] = True
        updates["smart_capture_next_prompt_at"] = None
    else:
        updates["smart_capture_next_prompt_at"] = compute_next_prompt_at(
            now_utc, settings, tz_offset_minutes,
        )
    updates["smart_capture_consecutive_skips"] = 0
    return updates


def skip_next_updates(settings: dict, now_utc: datetime, tz_offset_minutes: int) -> dict:
    skips = int(settings.get("smart_capture_consecutive_skips") or 0) + 1
    nxt = compute_next_prompt_at(now_utc, settings, tz_offset_minutes, after_skip=True)
    return {
        "smart_capture_next_prompt_at": nxt,
        "smart_capture_consecutive_skips": skips,
    }


def skip_today_updates(now_utc: datetime, tz_offset_minutes: int) -> dict:
    return {
        "smart_capture_skip_until": end_of_local_day_iso(now_utc, tz_offset_minutes),
        "smart_capture_consecutive_skips": int(0),
    }


def quiet_day_updates(now_utc: datetime, tz_offset_minutes: int) -> dict:
    stub = {"smart_capture_quiet_day": True, "smart_capture_quiet_day_evening_sent": False}
    evening = evening_checkin_utc(now_utc, tz_offset_minutes)
    return {
        "smart_capture_quiet_day": True,
        "smart_capture_quiet_day_evening_sent": False,
        "smart_capture_next_prompt_at": evening.isoformat() if evening else None,
        "smart_capture_consecutive_skips": 0,
    }


async def patient_tz_offset_minutes(pid: str) -> int:
    """Prefer notification prefs offset; fallback 0."""
    from notifications import get_prefs, DEFAULT_PREFS
    patient = await __import__("db").db.patients.find_one({"id": pid}, {"_id": 0, "user_id": 1})
    if not patient or not patient.get("user_id"):
        return int(DEFAULT_PREFS.get("tz_offset_minutes", 0))
    prefs = await get_prefs(patient["user_id"])
    return int(prefs.get("tz_offset_minutes", 0) or 0)


async def patient_quiet_hours_blocked(pid: str, now_utc: datetime) -> bool:
    from notifications import get_prefs, _in_quiet_hours, DEFAULT_PREFS
    patient = await __import__("db").db.patients.find_one({"id": pid}, {"_id": 0, "user_id": 1})
    if not patient or not patient.get("user_id"):
        return False
    prefs = await get_prefs(patient["user_id"])
    return _in_quiet_hours(prefs, now_utc)
