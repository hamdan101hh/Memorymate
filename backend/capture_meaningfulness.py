"""Lightweight meaningful-memory filter for Smart Day Capture snippets."""
import re
from typing import Optional

MIN_CHARS = 12
MIN_WORDS = 3
FILLER_ONLY = re.compile(
    r"^(um+|uh+|hmm+|ok+|yeah+|yes+|no+|ah+|oh+|like|so|well|okay)[\s.,!]*$",
    re.I,
)
MEMORY_KEYWORDS = re.compile(
    r"\b(remember|appointment|meeting|call|doctor|family|tomorrow|today|later|remind|visit|"
    r"medicine|pharmacy|hospital|clinic|mom|dad|daughter|son|friend|schedule|pickup)\b",
    re.I,
)
TIME_PATTERN = re.compile(
    r"\b(\d{1,2}(:\d{2})?\s*(am|pm)?|tomorrow|today|monday|tuesday|wednesday|thursday|"
    r"friday|saturday|sunday|next week|at \d)\b",
    re.I,
)
DATE_PATTERN = re.compile(r"\b\d{1,2}[/-]\d{1,2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", re.I)
NAME_LIKE = re.compile(r"\b[A-Z][a-z]{2,}\b")
NOISE_MARKERS = ("[inaudible]", "???", "…", "...")

SUGGESTED_TYPES = {
    "appointment": ("appointment", "doctor", "clinic", "dentist", "hospital", "visit at"),
    "reminder": ("remind", "don't forget", "remember to", "call", "pick up"),
    "meeting_note": ("meeting", "discussed", "agenda", "attendees"),
}


def _suggest_type(text: str) -> str:
    low = text.lower()
    for stype, words in SUGGESTED_TYPES.items():
        if any(w in low for w in words):
            return stype
    return "memory"


def is_meaningful_capture_snippet(
    transcript: str,
    metadata: Optional[dict] = None,
) -> dict:
    """Return whether a snippet should become a draft."""
    meta = metadata or {}
    text = (transcript or "").strip()
    duration = float(meta.get("duration_seconds") or 0)
    min_seconds = float(meta.get("min_snippet_seconds") or 3)

    if not text:
        return {
            "should_create_draft": False,
            "reason": "empty_transcript",
            "suggested_type": "memory",
            "confidence": "low",
        }

    if duration > 0 and duration < min_seconds:
        return {
            "should_create_draft": False,
            "reason": "too_short_duration",
            "suggested_type": "memory",
            "confidence": "low",
        }

    if len(text) < MIN_CHARS:
        return {
            "should_create_draft": False,
            "reason": "too_short_text",
            "suggested_type": "memory",
            "confidence": "low",
        }

    words = [w for w in re.split(r"\s+", text) if w]
    if len(words) < MIN_WORDS:
        return {
            "should_create_draft": False,
            "reason": "too_few_words",
            "suggested_type": "memory",
            "confidence": "low",
        }

    if FILLER_ONLY.match(text):
        return {
            "should_create_draft": False,
            "reason": "filler_only",
            "suggested_type": "memory",
            "confidence": "low",
        }

    noise_hits = sum(1 for m in NOISE_MARKERS if m in text.lower())
    if noise_hits >= 2:
        return {
            "should_create_draft": False,
            "reason": "low_confidence_noise",
            "suggested_type": "memory",
            "confidence": "low",
        }

    has_keyword = MEMORY_KEYWORDS.search(text)
    has_time = TIME_PATTERN.search(text) or DATE_PATTERN.search(text)
    has_name = NAME_LIKE.search(text)
    long_enough = len(words) >= 8

    if not (has_keyword or has_time or has_name or long_enough):
        return {
            "should_create_draft": False,
            "reason": "not_meaningful",
            "suggested_type": "memory",
            "confidence": "low",
        }

    confidence = "high"
    if noise_hits == 1 or len(words) < 5:
        confidence = "medium"

    stype = _suggest_type(text)
    title = text[:60] + ("…" if len(text) > 60 else "")
    summary = text[:280] + ("…" if len(text) > 280 else "")

    return {
        "should_create_draft": True,
        "reason": "meaningful_speech",
        "suggested_type": stype,
        "confidence": confidence,
        "suggested_title": title,
        "suggested_summary": summary,
    }
