"""Cost-safe multi-provider AI pipeline for voice, meetings, and transcript cleanup.

Pipeline order (no wasteful API circle):
  1. Browser/local speech on the client (free) — no backend call
  2. Cloud STT only if enabled, user confirmed, and under voice cap — ONE provider
  3. Cheap text model for cleanup/extraction — ONE call
  4. Premium text fallback only if confidence low AND env allows — ONE optional retry
  5. User reviews before save

Granola is NOT used as a transcription backend (research/partnership only).
"""
import os
import re
from typing import Optional

from fastapi import HTTPException

import ai
import usage

# ---- env flags (safe defaults: cloud off, premium off) ----
CLOUD_TRANSCRIPTION_ENABLED = os.environ.get("CLOUD_TRANSCRIPTION_ENABLED", "false").lower() == "true"
TEXT_AI_PROVIDER = os.environ.get("TEXT_AI_PROVIDER", "rule_based").strip().lower()
CHEAP_TEXT_AI_PROVIDER = os.environ.get("CHEAP_TEXT_AI_PROVIDER", "deepseek").strip()
PREMIUM_TEXT_AI_PROVIDER = os.environ.get("PREMIUM_TEXT_AI_PROVIDER", "gemini_or_openai").strip()
PREMIUM_FALLBACK_ENABLED = os.environ.get("PREMIUM_FALLBACK_ENABLED", "false").lower() == "true"
MAX_AI_PROVIDERS_PER_REQUEST = max(1, int(os.environ.get("MAX_AI_PROVIDERS_PER_REQUEST", "1")))
ALLOW_PREMIUM_RETRY = os.environ.get("ALLOW_PREMIUM_RETRY", "false").lower() == "true"

_MESSY_MARKERS = ("???", "[inaudible", "unclear", "…", "...")


def public_config() -> dict:
    """Safe config for frontend — no secrets."""
    return {
        "pipeline_version": 1,
        "browser_speech_first": True,
        "cloud_transcription_enabled": CLOUD_TRANSCRIPTION_ENABLED,
        "text_ai_provider": TEXT_AI_PROVIDER,
        "cheap_text_ai_provider": CHEAP_TEXT_AI_PROVIDER,
        "premium_text_ai_provider": PREMIUM_TEXT_AI_PROVIDER,
        "premium_fallback_enabled": PREMIUM_FALLBACK_ENABLED,
        "allow_premium_retry": ALLOW_PREMIUM_RETRY,
        "max_providers_per_request": MAX_AI_PROVIDERS_PER_REQUEST,
        "daily_voice_minutes_cap": usage.DAILY_VOICE_MINUTES_CAP,
        "max_recording_seconds": usage.MAX_RECORDING_SECONDS,
        "max_meeting_minutes": usage.MAX_MEETING_MINUTES,
        "daily_ai_cost_cap_usd": usage.DAILY_AI_COST_CAP_USD,
        "max_ai_actions_per_day": usage.MAX_AI_ACTIONS_PER_DAY,
        "granola_dependency": "none",
        "granola_note": "Research/partnership only — not used for transcription.",
        "voice_limit_message": usage.VOICE_LIMIT_MESSAGE,
    }


def choose_text_provider(cheap: bool = True) -> dict:
    """Return which text tier would be used (labels only)."""
    if TEXT_AI_PROVIDER == "rule_based" or not ai.AI_ENABLED:
        return {"tier": "rule_based", "provider_label": "rule_based", "cheap": True}
    if cheap:
        return {"tier": "cheap", "provider_label": CHEAP_TEXT_AI_PROVIDER, "cheap": True}
    return {"tier": "premium", "provider_label": PREMIUM_TEXT_AI_PROVIDER, "cheap": False}


def should_use_premium_fallback(confidence: str) -> bool:
    return (
        confidence == "low"
        and PREMIUM_FALLBACK_ENABLED
        and ALLOW_PREMIUM_RETRY
        and ai.AI_ENABLED
        and TEXT_AI_PROVIDER != "rule_based"
    )


def _estimate_minutes(duration_seconds: Optional[float], audio_bytes: int) -> float:
    if duration_seconds is not None and duration_seconds > 0:
        return duration_seconds / 60.0
    # Rough fallback: ~32 KB/s for compressed webm ≈ 0.5 min per MB
    return max(0.1, len(audio_bytes) / (32 * 1024 * 60))


def _rule_clean(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if not t:
        return ""
    if len(t) > 240 and "." not in t[:120]:
        t = t[:237] + "..."
    return t


def _score_confidence(raw: str, extracted: Optional[dict] = None) -> str:
    t = (raw or "").strip()
    if len(t) < 8:
        return "low"
    messy = sum(1 for m in _MESSY_MARKERS if m in t.lower())
    words = len(t.split())
    if messy >= 2 or words < 3:
        return "low"
    if extracted:
        summary = (extracted.get("simple_summary") or "").strip()
        title = (extracted.get("title") or "").strip()
        if len(summary) < 10 or title == "Memory note" and len(t) > 80:
            return "medium"
    if words < 8 or messy == 1:
        return "medium"
    return "high"


def _clarification_for(confidence: str, premium_used: bool) -> str:
    if confidence == "high":
        return ""
    if confidence == "medium":
        return "Please review this draft. Add any missing date, time, or names if needed."
    if premium_used:
        return "This transcript was hard to read. Please edit the text before saving."
    if should_use_premium_fallback("low"):
        return ""
    return (
        "This transcript looks unclear. Please add more detail, edit the text, "
        "or confirm premium cleanup if your caregiver has enabled it."
    )


async def transcribe_audio_cost_safe(
    pid: str,
    audio_bytes: bytes,
    filename: str,
    *,
    user_confirmed_cloud: bool = False,
    duration_seconds: Optional[float] = None,
) -> dict:
    """Cloud STT — disabled by default; requires confirmation; single provider; capped."""
    if not CLOUD_TRANSCRIPTION_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="Cloud transcription is disabled. Use browser speech or type your memory.",
        )
    if not user_confirmed_cloud:
        raise HTTPException(
            status_code=400,
            detail="Cloud transcription requires your confirmation before upload.",
        )
    minutes = _estimate_minutes(duration_seconds, len(audio_bytes))
    await usage.assert_voice_cap(pid, minutes)
    await usage.assert_within_cap(pid)
    await usage.assert_action_cap(pid)

    # Single STT provider — never fan-out to multiple STT backends.
    text = await ai.transcribe_audio(audio_bytes, filename)
    await usage.record_voice_minutes(pid, minutes)
    await usage.record(pid, "cloud_transcribe", in_chars=len(audio_bytes), out_chars=len(text or ""), tier="cheap")
    return {
        "transcript": (text or "").strip(),
        "source": "cloud_stt",
        "providers_used": 1,
        "minutes_charged": round(minutes, 2),
    }


async def clean_transcript(pid: str, raw: str, style: Optional[str] = None) -> dict:
    """Cheap cleanup first; optional single premium retry; returns confidence metadata."""
    raw = (raw or "").strip()
    if not raw:
        return {
            "cleaned_text": "",
            "confidence": "low",
            "clarification_question": "What would you like to remember?",
            "providers_used": 0,
            "premium_used": False,
        }

    await usage.assert_within_cap(pid)
    await usage.assert_action_cap(pid)

    providers_used = 0
    premium_used = False

    if TEXT_AI_PROVIDER == "rule_based" or not ai.AI_ENABLED:
        cleaned = _rule_clean(raw)
        conf = _score_confidence(raw)
        return {
            "cleaned_text": cleaned,
            "confidence": conf,
            "clarification_question": _clarification_for(conf, False),
            "providers_used": 0,
            "premium_used": False,
        }

    providers_used += 1
    extracted = await ai.process_transcript(raw, style=style, premium=False)
    await usage.record(pid, "clean_transcript", in_chars=len(raw),
                       out_chars=len(str(extracted.get("simple_summary", ""))), tier="cheap")
    conf = _score_confidence(raw, extracted)

    if conf == "low" and should_use_premium_fallback(conf) and providers_used < MAX_AI_PROVIDERS_PER_REQUEST:
        providers_used += 1
        premium_used = True
        extracted = await ai.process_transcript(raw, style=style, premium=True)
        await usage.record(pid, "clean_transcript_premium", in_chars=len(raw),
                           out_chars=len(str(extracted.get("simple_summary", ""))), tier="primary")
        conf = _score_confidence(raw, extracted)

    cleaned = extracted.get("simple_summary") or _rule_clean(raw)
    return {
        "cleaned_text": cleaned,
        "confidence": conf,
        "clarification_question": _clarification_for(conf, premium_used),
        "providers_used": providers_used,
        "premium_used": premium_used,
        "draft": extracted,
    }


async def extract_memory_fields(pid: str, transcript: str, style: Optional[str] = None) -> dict:
    """Structured memory extraction with confidence — used before user confirms save."""
    result = await clean_transcript(pid, transcript, style=style)
    fields = result.get("draft") or {
        "title": "Memory note",
        "simple_summary": result.get("cleaned_text") or transcript[:240],
        "timeline": "afternoon",
        "people": [], "places": [], "medications": [],
        "appointments": [], "reminders": [], "caregiver_notes": [],
    }
    return {
        "fields": fields,
        "confidence": result["confidence"],
        "clarification_question": result.get("clarification_question") or "",
        "providers_used": result.get("providers_used", 0),
        "premium_used": result.get("premium_used", False),
    }


async def extract_reminder_fields(pid: str, raw_text: str) -> dict:
    """Reminder enhancement via existing AI helper — capped."""
    await usage.assert_within_cap(pid)
    await usage.assert_action_cap(pid)
    result = await ai.enhance_reminder_text(raw_text)
    await usage.record(pid, "reminder_extract", in_chars=len(raw_text),
                       out_chars=len(result.get("enhanced_text", "")), tier="cheap")
    conf = "high" if not result.get("needs_clarification") else "medium"
    return {**result, "confidence": conf, "providers_used": 1}


async def extract_appointment_fields(pid: str, raw_text: str, today_iso: str, timezone: str = "UTC") -> dict:
    """Appointment draft — delegates to calendar AI; single cheap call by default."""
    await usage.assert_within_cap(pid)
    await usage.assert_action_cap(pid)
    result = await ai.draft_calendar_event(raw_text, today_iso, timezone)
    conf = result.get("confidence") or "medium"
    await usage.record(pid, "appointment_extract", in_chars=len(raw_text), out_chars=200, tier="cheap")
    return {**result, "providers_used": 1}


async def process_meeting_transcript(
    pid: str,
    transcript: str,
    meta: dict,
    *,
    meeting_minutes: Optional[float] = None,
) -> dict:
    """Meeting capture cleanup — browser transcript first; cheap filter + summary."""
    if meeting_minutes is not None:
        await usage.assert_meeting_length(meeting_minutes)
    await usage.assert_within_cap(pid)
    await usage.assert_action_cap(pid)

    providers_used = 0
    result = await ai.filter_capture_transcript(transcript, meta, style=meta.get("note_style"))
    providers_used += 1
    out_chars = sum(len(str(e.get("summary", ""))) for e in result.get("events", []))
    meeting_summary = None
    if meta.get("mode") == "meeting":
        meeting_summary = await ai.summarize_meeting(transcript, meta)
        providers_used += 1
        out_chars += len(str(meeting_summary or ""))
    await usage.record(pid, "meeting_process", in_chars=len(transcript), out_chars=out_chars, tier="cheap")
    return {
        "filter_result": result,
        "meeting_summary": meeting_summary,
        "providers_used": min(providers_used, MAX_AI_PROVIDERS_PER_REQUEST),
        "confidence": _score_confidence(transcript),
    }
