"""AI appointment drafting: clarification questions, options extraction, rule fallback."""
import re
from datetime import datetime, timedelta
from typing import Any

import ai

_WEEKDAYS = ai._WEEKDAYS  # monday..sunday list from ai module
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_MEDICAL_DISCLAIMER = (
    "MemoryMate helps organize appointments and reminders. "
    "It does not provide medical advice or emergency support."
)


def merge_conversation_text(raw_text: str, conversation: list[dict] | None) -> str:
    parts = []
    if conversation:
        for item in conversation:
            t = (item.get("text") or item.get("message") or "").strip()
            if t:
                parts.append(t)
    if raw_text.strip():
        parts.append(raw_text.strip())
    return "\n".join(parts)


def build_clarification_question(missing_fields: list[str]) -> str:
    missing = set(missing_fields or [])
    if "time" in missing and "date" in missing:
        return "What date and time is the appointment?"
    if "time" in missing:
        return "What time is the appointment?"
    if "date" in missing:
        return "Which date is the appointment?"
    if "title" in missing:
        return "What is the appointment for?"
    return "Can you add a few more details about this appointment?"


def extract_appointment_options(text: str) -> dict[str, Any]:
    t = text or ""
    urgent = bool(re.search(r"\b(urgent|important|don'?t forget|asap)\b", t, re.I))
    add_to_google = bool(
        re.search(r"\b(add to google|google calendar|put on (my )?calendar)\b", t, re.I)
    )
    online_meeting = bool(
        re.search(r"\b(google meet|meet link|video call|online meeting)\b", t, re.I)
    )
    attendees = list({m.group(0).lower() for m in _EMAIL_RE.finditer(t)})
    return {
        "urgent": urgent,
        "add_to_google": add_to_google,
        "online_meeting": online_meeting,
        "attendees": attendees,
    }


def _apply_time_of_day_hints(text: str, draft: dict) -> dict:
    if draft.get("time") or draft.get("all_day"):
        return draft
    if re.search(r"\bmorning\b", text, re.I):
        draft["time"] = "09:00"
    elif re.search(r"\bafternoon\b", text, re.I):
        draft["time"] = "14:00"
    elif re.search(r"\bevening\b", text, re.I):
        draft["time"] = "18:00"
    return draft


def _apply_weekday_dates(text: str, today: datetime, draft: dict, missing: list[str]) -> tuple[dict, list[str]]:
    """Parse 'on Friday' / 'Friday at 5' without requiring 'next'."""
    if draft.get("date"):
        return draft, missing
    for i, day_name in enumerate(_WEEKDAYS):
        if re.search(rf"\bnext\s+{day_name}\b", text, re.I):
            continue
        if re.search(rf"\b(?:on\s+)?{day_name}\b", text, re.I):
            cur = today.weekday()
            delta = (i - cur) % 7
            if delta == 0:
                delta = 7
            draft["date"] = (today + timedelta(days=delta)).date().isoformat()
            missing = [m for m in missing if m != "date"]
            break
    if re.search(r"\bnext week\b", text, re.I) and not draft.get("date"):
        if "date" not in missing:
            missing.append("date")
    return draft, missing


async def draft_appointment(
    raw_text: str,
    today_iso: str,
    timezone: str = "UTC",
    conversation: list[dict] | None = None,
) -> dict:
    """Parse natural language into a reviewable appointment draft. Never writes to DB."""
    full_text = merge_conversation_text(raw_text, conversation)
    try:
        today = datetime.fromisoformat(today_iso)
    except ValueError:
        today = datetime.now()

    base = await ai.draft_calendar_event(full_text, today_iso, timezone)
    draft = dict(base.get("draft") or {})
    missing = list(base.get("missing_fields") or [])
    warnings = list(base.get("warnings") or [])

    draft = _apply_time_of_day_hints(full_text, draft)
    draft, missing = _apply_weekday_dates(full_text, today, draft, missing)

    if draft.get("time") and "time" in missing:
        missing = [m for m in missing if m != "time"]
    if draft.get("date") and "date" in missing:
        missing = [m for m in missing if m != "date"]
    if not draft.get("all_day") and not draft.get("time"):
        if "time" not in missing:
            missing.append("time")
    if not draft.get("date"):
        if "date" not in missing:
            missing.append("date")

    options = extract_appointment_options(full_text)
    if options["urgent"] and "high" not in (draft.get("priority") or ""):
        draft["priority"] = "high"

    if _MEDICAL_DISCLAIMER not in warnings:
        warnings.append(_MEDICAL_DISCLAIMER)

    status = "ready" if not missing else "needs_info"
    follow_up = build_clarification_question(missing) if missing else ""

    return {
        "status": status,
        "follow_up_question": follow_up,
        "draft": draft,
        "missing_fields": missing,
        "confidence": base.get("confidence", "medium"),
        "warnings": warnings,
        "options": options,
        "ai_used": base.get("ai_used", False),
    }
