"""AI features: transcript processing, patient Q&A, caregiver summary, audio transcription.
Uses Claude Sonnet 4.6 via the Emergent LLM key. All functions are defensive and
degrade gracefully so the app keeps working even if the AI call fails."""
import os
import re
import json
import uuid
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

load_dotenv(Path(__file__).parent / ".env")


def _resolve_provider():
    """Pick an LLM key + provider from the environment.

    Supports the Emergent universal key, a direct Anthropic key, or an OpenAI key,
    so the app is not locked to a single provider. Returns (key, provider, model).
    If no key is configured we still return a placeholder so the module imports and
    the app boots — every AI call is wrapped in try/except and degrades gracefully.
    """
    emergent = os.environ.get("EMERGENT_LLM_KEY")
    anthropic = os.environ.get("ANTHROPIC_API_KEY")
    openai = os.environ.get("OPENAI_API_KEY")
    if emergent and emergent != "local-dev-placeholder-key":
        return emergent, "anthropic", os.environ.get("MODEL_NAME", "claude-sonnet-4-6")
    if anthropic:
        return anthropic, "anthropic", os.environ.get("MODEL_NAME", "claude-sonnet-4-6")
    if openai:
        return openai, "openai", os.environ.get("MODEL_NAME", "gpt-4o-mini")
    # No real key configured — AI features will use graceful fallbacks.
    return emergent or "no-key-configured", "anthropic", "claude-sonnet-4-6"


LLM_KEY, MODEL_PROVIDER, MODEL_NAME = _resolve_provider()
# Whisper transcription needs an OpenAI-compatible key (Emergent or OpenAI).
STT_KEY = os.environ.get("OPENAI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY") or LLM_KEY
AI_ENABLED = LLM_KEY not in ("no-key-configured", "local-dev-placeholder-key")

# Cost-control tier: high-VOLUME work (capture filtering, meeting summaries, memory
# extraction) runs on a cheaper model so always-on capture stays affordable
# (see the AI cost model). Interactive/low-volume work (the assistant, caregiver
# summary) keeps the primary model for quality. Defaults to the primary model so
# nothing changes until a cheap model is configured via env.
CAPTURE_MODEL_PROVIDER = os.environ.get("CAPTURE_MODEL_PROVIDER", MODEL_PROVIDER)
CAPTURE_MODEL_NAME = os.environ.get("CAPTURE_MODEL_NAME", MODEL_NAME)

SAFETY_RULES = (
    "You are MemoryMate, a calm, gentle memory-support assistant for elderly people and "
    "people with early memory loss. SAFETY RULES you must always follow:\n"
    "- Use very simple, short, warm sentences.\n"
    "- Never diagnose any condition. Never say the person has dementia or any illness.\n"
    "- Never say 'you forgot'. Instead say 'here is a reminder'.\n"
    "- Never invent memories, people, medication, or schedules. Only use the information given to you.\n"
    "- For medical questions, gently say to please check with their doctor or caregiver.\n"
    "- Never claim to handle emergencies. If unsafe, suggest calling their emergency contact or local services.\n"
)


def _chat(system_message: str, session_id: str | None = None, cheap: bool = False) -> LlmChat:
    """Build a chat client. Set cheap=True for high-volume capture/summary work
    so it routes to the low-cost capture model when one is configured."""
    provider = CAPTURE_MODEL_PROVIDER if cheap else MODEL_PROVIDER
    model = CAPTURE_MODEL_NAME if cheap else MODEL_NAME
    return LlmChat(
        api_key=LLM_KEY,
        session_id=session_id or str(uuid.uuid4()),
        system_message=system_message,
    ).with_model(provider, model)


# ---- user message-style preferences (set during Always-On onboarding) ----
NOTE_STYLES = {
    "short": "Write the summary VERY short and simple — one easy sentence.",
    "warm": "Write the summary in a warm, gentle, reassuring tone of 2-4 short sentences.",
    "detailed": "Write a clear, detailed summary that covers all the useful points.",
    "bullets": "Write the summary as a few short bullet points, each starting with '- '.",
    "family": "Write a friendly family-update style summary, as if telling a relative how the day went.",
    "caregiver": "Write a concise, factual caregiver-report style summary.",
}
REMINDER_TONES = {
    "gentle": "When mentioning reminders, phrase them gently, e.g. 'It may be time to take your medicine.'",
    "direct": "When mentioning reminders, be clear and direct, e.g. 'Take your medicine at 8 PM.'",
    "family": "When mentioning reminders, use a warm family tone, e.g. 'Your family wanted to remind you about your medicine.'",
}


def _note_style_hint(style: str | None) -> str:
    return "\nWRITING STYLE: " + NOTE_STYLES.get(style or "warm", NOTE_STYLES["warm"]) + "\n"


def _reminder_tone_hint(tone: str | None) -> str:
    return "\n" + REMINDER_TONES.get(tone or "gentle", REMINDER_TONES["gentle"]) + "\n"


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response, defensively.

    Handles ```json fenced blocks, surrounding prose, and common trailing-comma
    mistakes that otherwise make json.loads fail.
    """
    import re

    text = (text or "").strip()
    # Strip a fenced code block if present (```json ... ``` or ``` ... ```).
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # Narrow to the outermost JSON object.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Remove trailing commas before } or ] and retry once.
        cleaned = re.sub(r",(\s*[}\]])", r"\1", text)
        return json.loads(cleaned)


async def process_transcript(transcript: str, style: str | None = None) -> dict:
    """Turn a raw memory transcript into a structured summary + extractions."""
    fallback = {
        "title": "Memory note",
        "simple_summary": transcript[:240],
        "timeline": "afternoon",
        "people": [], "places": [], "medications": [],
        "appointments": [], "reminders": [], "caregiver_notes": [],
    }
    system = (
        SAFETY_RULES
        + "\nYou will receive a transcript of something the person said about their day. "
        "Extract structured information. Respond ONLY with valid JSON in exactly this shape:\n"
        "{\n"
        '  "title": "short 3-6 word title",\n'
        '  "simple_summary": "2-4 gentle simple sentences summarizing the day, addressed to the person as \'you\'",\n'
        '  "timeline": "morning | afternoon | evening",\n'
        '  "people": [{"name": "", "relationship": ""}],\n'
        '  "places": [{"name": "", "type": ""}],\n'
        '  "medications": [{"name": "", "instruction": ""}],\n'
        '  "appointments": [{"title": "", "time": "", "location": ""}],\n'
        '  "reminders": [{"title": "", "priority": "low|medium|high", "category": "medication|appointment|family|task|routine|custom"}],\n'
        '  "caregiver_notes": ["short note for the caregiver"]\n'
        "}\n"
        "Use empty arrays when nothing applies. Do not invent anything not in the transcript."
        + _note_style_hint(style)
    )
    try:
        chat = _chat(system, cheap=True)
        resp = await chat.send_message(UserMessage(text=f"Transcript:\n{transcript}"))
        data = _extract_json(resp)
        for key in fallback:
            data.setdefault(key, fallback[key])
        return data
    except Exception as e:
        print(f"[ai.process_transcript] failed: {e}")
        return fallback


async def answer_question(context: str, history: list[dict], question: str, tone: str | None = None) -> str:
    """Answer a patient question grounded strictly on their saved data."""
    system = (
        SAFETY_RULES
        + "\nAnswer the person's question using ONLY the saved information below. "
        "If the answer is not in the saved information, gently say: "
        "\"I don't have that saved yet. You can ask your caregiver to add it.\" "
        "Keep answers to 1-3 short, warm sentences."
        + _reminder_tone_hint(tone) +
        "\n=== SAVED INFORMATION ===\n" + context + "\n=== END ==="
    )
    try:
        chat = _chat(system)
        # Replay short history for continuity
        for h in history[-6:]:
            if h.get("role") == "user":
                await chat.send_message(UserMessage(text=h["message"]))
        return await chat.send_message(UserMessage(text=question))
    except Exception as e:
        print(f"[ai.answer_question] failed: {e}")
        return "I'm having a little trouble right now. Please try again in a moment, or ask your caregiver."


async def caregiver_summary(context: str) -> str:
    system = (
        SAFETY_RULES
        + "\nYou are writing a brief daily overview for a family caregiver. "
        "Be factual, calm and supportive. Use the saved information only. "
        "Structure the response in short labelled sections using these exact headings:\n"
        "Today's overview:\nReminders completed:\nReminders missed:\nPossible things to check:\nSuggested check-in questions:\n"
        "Under 'Possible things to check', never use alarming or medical-diagnosis language.\n\n"
        "=== SAVED INFORMATION ===\n" + context + "\n=== END ==="
    )
    try:
        chat = _chat(system)
        return await chat.send_message(UserMessage(text="Please generate today's caregiver summary."))
    except Exception as e:
        print(f"[ai.caregiver_summary] failed: {e}")
        return "Unable to generate the summary right now. Please try again shortly."


async def explain_person(name: str, relationship: str, description: str, explanation: str) -> str:
    base = explanation or description
    system = (
        SAFETY_RULES
        + "\nExplain who a person is to the user in 1-2 very warm, simple sentences. Address the user as 'you'."
    )
    info = f"Name: {name}. Relationship: {relationship}. Notes: {base}"
    try:
        chat = _chat(system)
        return await chat.send_message(UserMessage(text=f"Explain this person simply: {info}"))
    except Exception:
        rel = relationship or "someone important to you"
        return f"{name} is your {rel}. {base}".strip()


async def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe an uploaded audio blob using Whisper."""
    suffix = Path(filename).suffix or ".webm"
    stt = OpenAISpeechToText(api_key=STT_KEY)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        with open(tmp_path, "rb") as f:
            resp = await stt.transcribe(file=f, model="whisper-1", response_format="json", language="en")
        return resp.text
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass



CAPTURE_RULES = (
    "\nYou are a strict memory-support FILTER for a consent-based capture session. "
    "You DO NOT save everything. Filter aggressively and keep only information that genuinely "
    "helps memory support: events worth remembering, reminders, appointments, medication notes, "
    "and updates about important people/places.\n"
    "Rules:\n"
    "- If a transcript contains multiple topics, SPLIT it into separate events.\n"
    "- Ignore small talk, filler, and irrelevant chatter (do not save).\n"
    "- PRIVACY: if a useful memory contains sensitive/private details (passwords, PINs, bank/"
    "financial info, health specifics, home address, legal matters, anything embarrassing), still "
    "save it as an event but set privacy_level to 'sensitive'. Sensitive events are locked in a "
    "PIN-protected Private Vault and hidden from the timeline and shared summaries.\n"
    "- Only when you are genuinely UNSURE whether something should be saved at all, send it to "
    "caregiver privacy review instead of saving.\n"
    "- Never invent details. Use only what is in the transcript.\n"
)


async def filter_capture_transcript(transcript: str, meta: dict | None = None, style: str | None = None) -> dict:
    """Classify + divide a capture transcript into discrete memory events and review items."""
    fallback = {"context": "general", "events": [], "review_items": []}
    meta = meta or {}
    ctx = f"Session title: {meta.get('title','')}. Purpose: {meta.get('purpose','')}. People involved: {meta.get('people_involved','')}."
    system = (
        SAFETY_RULES + CAPTURE_RULES
        + "\nRespond ONLY with valid JSON in exactly this shape:\n"
        "{\n"
        '  "context": "meeting | family_visit | doctor | phone_call | routine | general — your best guess at what kind of situation this is",\n'
        '  "events": [\n'
        "    {\n"
        '      "title": "short title",\n'
        '      "event_type": "memory_event | reminder | appointment | medication | person_place_update",\n'
        '      "summary": "1-2 simple sentences",\n'
        '      "event_time": "morning | afternoon | evening | a time/date if mentioned, else empty",\n'
        '      "people": ["names"],\n'
        '      "places": ["places"],\n'
        '      "reminders": ["reminder text"],\n'
        '      "action_items": ["action item text"],\n'
        '      "privacy_level": "normal | sensitive",\n'
        '      "confidence": "low | medium | high"\n'
        "    }\n"
        "  ],\n"
        '  "review_items": [\n'
        '    {"content": "the snippet", "suggested_type": "reminder|memory_event|appointment|private", "reason": "why this needs review"}\n'
        "  ]\n"
        "}\n"
        "Use empty arrays when nothing applies. Keep events focused and separate.\n\n"
        "EXAMPLE — for the transcript: \"Today I spoke to Fadi about the business idea. "
        "Then Sarah came home and reminded me about the doctor appointment. Later I went to the pharmacy.\" "
        "you would return three events: "
        "(1) title 'Meeting with Fadi', event_type 'memory_event', people ['Fadi'], "
        "action_items ['Follow up with Fadi']; "
        "(2) title 'Sarah's reminder', event_type 'reminder', people ['Sarah'], "
        "reminders ['Doctor appointment']; "
        "(3) title 'Pharmacy visit', event_type 'memory_event', places ['Pharmacy'].\n\n"
        f"Session context: {ctx}"
        + _note_style_hint(style)
    )
    try:
        chat = _chat(system, cheap=True)
        resp = await chat.send_message(UserMessage(text=f"Transcript:\n{transcript}"))
        data = _extract_json(resp)
        data.setdefault("context", "general")
        data.setdefault("events", [])
        data.setdefault("review_items", [])
        for ev in data["events"]:
            for k, default in {"title": "Memory event", "event_type": "memory_event", "summary": "",
                               "event_time": "", "people": [], "places": [], "reminders": [],
                               "action_items": [], "privacy_level": "normal", "confidence": "medium"}.items():
                ev.setdefault(k, default)
        return data
    except Exception as e:
        print(f"[ai.filter_capture_transcript] failed: {e}")
        return fallback


async def summarize_meeting(transcript: str, meta: dict | None = None) -> dict:
    """Produce a structured meeting summary."""
    meta = meta or {}
    fallback = {
        "summary": transcript[:240], "key_points": [], "decisions": [], "action_items": [],
        "follow_ups": [], "people": [], "dates": [], "reminders": [], "next_steps": [],
    }
    system = (
        SAFETY_RULES
        + "\nYou are summarizing a meeting that was captured with consent. "
        "Be factual and concise. Respond ONLY with valid JSON in exactly this shape:\n"
        "{\n"
        '  "summary": "3-5 sentence overview",\n'
        '  "key_points": ["..."], "decisions": ["..."], "action_items": ["..."],\n'
        '  "follow_ups": ["..."], "people": ["..."], "dates": ["..."],\n'
        '  "reminders": ["..."], "next_steps": ["..."]\n'
        "}\nUse empty arrays where nothing applies. Do not invent anything.\n\n"
        f"Meeting title: {meta.get('title','')}. Purpose: {meta.get('purpose','')}. People: {meta.get('people_involved','')}."
    )
    try:
        chat = _chat(system, cheap=True)
        resp = await chat.send_message(UserMessage(text=f"Meeting transcript:\n{transcript}"))
        data = _extract_json(resp)
        for k in fallback:
            data.setdefault(k, fallback[k])
        return data
    except Exception as e:
        print(f"[ai.summarize_meeting] failed: {e}")
        return fallback


# ---- calendar event drafting (approval-gated — draft only, never auto-add) ----
_MEDICAL_RE = re.compile(
    r"\b(doctor|dr\.?|dentist|medicine|medication|pharmacy|hospital|clinic|therapy|checkup|review)\b",
    re.I,
)
_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_WEEKDAY_RE = "|".join(_WEEKDAYS)
_MONTH_RE = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
)


def _extract_location_from_text(text: str) -> str:
    """Extract explicit 'at <place>' from user text. Never invents locations."""
    if not text:
        return ""
    patterns = [
        rf"\bat\s+(.+?)\s+(?:tomorrow|today)\b",
        rf"\bat\s+(.+?)\s+on\s+(?:next\s+)?(?:{_WEEKDAY_RE})\b",
        rf"\bat\s+(.+?)\s+on\s+(?:{_MONTH_RE})\s+\d{{1,2}}\b",
        r"\bat\s+(.+?)\s+at\s+\d{1,2}",
        r"\bat\s+(.+?)\s*,\s*remind\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            loc = m.group(1).strip(" ,.-")
            if not loc or re.match(r"^\d", loc):
                continue
            return loc[:120]
    return ""


def _parse_hm(h: int, m: int, ampm: str | None) -> str:
    if ampm:
        ap = ampm.lower()
        if ap == "pm" and h < 12:
            h += 12
        if ap == "am" and h == 12:
            h = 0
    return f"{h:02d}:{m:02d}"


def parse_calendar_event_rules(raw_text: str, today: datetime) -> dict:
    """Basic rule-based draft when AI is unavailable. Never invents doctor names."""
    from datetime import timedelta

    text = (raw_text or "").strip()
    warnings: list[str] = []
    missing: list[str] = []
    if not text:
        return {
            "draft": {"title": "", "date": "", "time": "", "end_time": "", "all_day": False,
                      "location": "", "notes": "Created from user input", "reminder": ""},
            "confidence": "low", "missing_fields": ["title", "date"], "warnings": ["Please describe the event."],
            "ai_used": False,
        }

    if _MEDICAL_RE.search(text):
        warnings.append(
            "Please review health-related details with a caregiver or doctor."
        )

    date = ""
    if re.search(r"\btomorrow\b", text, re.I):
        date = (today + timedelta(days=1)).date().isoformat()
    elif re.search(r"\btoday\b", text, re.I):
        date = today.date().isoformat()
    else:
        wd = re.search(r"\bnext\s+(\w+day)\b", text, re.I)
        if wd:
            target = wd.group(1).lower()
            if target in _WEEKDAYS:
                cur = today.weekday()
                tgt = _WEEKDAYS.index(target)
                delta = (tgt - cur) % 7
                if delta == 0:
                    delta = 7
                date = (today + timedelta(days=delta)).date().isoformat()
        if not date:
            dm = re.search(r"\b(june|january|february|march|april|may|july|august|september|october|november|december)\s+(\d{1,2})\b", text, re.I)
            if dm:
                months = {"january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
                          "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12}
                m = months[dm.group(1).lower()]
                d = int(dm.group(2))
                y = today.year
                try:
                    date = datetime(y, m, d).date().isoformat()
                except ValueError:
                    pass
        if not date:
            iso = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
            if iso:
                date = iso.group(1)

    time = ""
    end_time = ""
    all_day = bool(re.search(r"\ball\s*day\b", text, re.I))
    range_m = re.search(
        r"from\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?",
        text, re.I,
    )
    at_m = re.search(r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", text, re.I)
    if range_m:
        h1, m1, ap1 = int(range_m.group(1)), int(range_m.group(2) or 0), range_m.group(3)
        h2, m2, ap2 = int(range_m.group(4)), int(range_m.group(5) or 0), range_m.group(6)
        time = _parse_hm(h1, m1, ap1)
        end_time = _parse_hm(h2, m2, ap2)
    elif at_m:
        time = _parse_hm(int(at_m.group(1)), int(at_m.group(2) or 0), at_m.group(3))

    reminder = ""
    rem_m = re.search(r"remind(?:\s+me)?\s+(.+?)(?:\.|$)", text, re.I)
    if rem_m:
        reminder = rem_m.group(1).strip()

    location = _extract_location_from_text(text)

    # Title: strip common scheduling phrases; keep user's words only.
    title = text
    if location:
        title = re.sub(rf"\bat\s+{re.escape(location)}\b", "", title, flags=re.I)
    for pat in (
        r"\btomorrow\b", r"\btoday\b", r"\bnext\s+\w+day\b",
        r"\bon\s+(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        r"\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b",
        r"\bfrom\s+\d{1,2}.+?to\s+\d{1,2}.+?(?:pm|am)?\b",
        r"\bremind(?:\s+me)?\s+.+", r"\bon\s+\w+\s+\d{1,2}\b",
    ):
        title = re.sub(pat, "", title, flags=re.I)
    title = re.sub(r"\s+", " ", title).strip(" ,.-")
    if len(title) > 80:
        title = title[:77] + "..."
    if not title:
        title = "Appointment"

    if not date:
        missing.append("date")
    if not all_day and not time:
        missing.append("time")
    if not title:
        missing.append("title")

    confidence = "high" if date and (time or all_day) and title else "medium" if date or time else "low"
    if confidence != "high":
        warnings.append("I'm not fully sure about this. Please review before adding.")

    return {
        "draft": {
            "title": title, "date": date, "time": time, "end_time": end_time,
            "all_day": all_day, "location": location, "notes": "Created from user input",
            "reminder": reminder,
        },
        "confidence": confidence,
        "missing_fields": missing,
        "warnings": warnings,
        "ai_used": False,
    }


async def draft_calendar_event(raw_text: str, today_iso: str, timezone: str = "UTC") -> dict:
    """Turn natural language into a structured event draft. Never writes to Google Calendar."""
    from datetime import datetime as dt
    try:
        today = dt.fromisoformat(today_iso)
    except ValueError:
        today = dt.now(timezone.utc)

    if not AI_ENABLED:
        out = parse_calendar_event_rules(raw_text, today)
        if not out["draft"]["title"] and raw_text.strip():
            out["warnings"].append("AI event drafting is not configured yet. A basic draft was created — please review.")
        return out

    system = (
        SAFETY_RULES
        + "\nYou extract a calendar event DRAFT from the user's words. "
        "This is NOT saved automatically — a human will review first.\n"
        "RULES:\n"
        "- Use only information explicitly stated. Do NOT invent doctor names, locations, or instructions.\n"
        "- If date/time is unclear, leave fields empty and list them in missing_fields.\n"
        "- For medical-sounding events, add a warning (no medical advice) but still draft the appointment title/time the user said.\n"
        "- Never say 'you forgot'.\n"
        "- Reference date for relative terms: today is " + today_iso + f" (timezone {timezone}).\n"
        "Respond ONLY with valid JSON:\n"
        "{\n"
        '  "draft": {\n'
        '    "title": "short event title",\n'
        '    "date": "YYYY-MM-DD or empty",\n'
        '    "time": "HH:MM 24h start or empty",\n'
        '    "end_time": "HH:MM 24h end or empty",\n'
        '    "all_day": false,\n'
        '    "location": "only if mentioned",\n'
        '    "notes": "Created from user input",\n'
        '    "reminder": "e.g. 1 hour before — only if mentioned"\n'
        "  },\n"
        '  "confidence": "low | medium | high",\n'
        '  "missing_fields": ["date","time"],\n'
        '  "warnings": ["optional safety messages"]\n'
        "}\n"
    )
    try:
        chat = _chat(system, cheap=True)
        resp = await chat.send_message(UserMessage(text=f"User input:\n{raw_text}"))
        data = _extract_json(resp)
        draft = data.get("draft") or {}
        for k, default in {"title": "", "date": "", "time": "", "end_time": "", "all_day": False,
                           "location": "", "notes": "Created from user input", "reminder": ""}.items():
            draft.setdefault(k, default)
        missing = list(data.get("missing_fields") or [])
        warnings = list(data.get("warnings") or [])
        if not draft.get("date") and "date" not in missing:
            missing.append("date")
        if not draft.get("all_day") and not draft.get("time") and "time" not in missing:
            missing.append("time")
        if not draft.get("title") and "title" not in missing:
            missing.append("title")
        confidence = data.get("confidence") or ("high" if not missing else "medium")
        if confidence != "high" and "I'm not fully sure" not in " ".join(warnings):
            warnings.append("I'm not fully sure about this. Please review before adding.")
        if _MEDICAL_RE.search(raw_text) and not any("medical" in w.lower() for w in warnings):
            warnings.append("Please review health-related details with a caregiver or doctor.")
        return {"draft": draft, "confidence": confidence, "missing_fields": missing,
                "warnings": warnings, "ai_used": True}
    except Exception as e:
        print(f"[ai.draft_calendar_event] failed: {e}")
        out = parse_calendar_event_rules(raw_text, today)
        out["warnings"].append("AI parsing had trouble. A basic draft was created — please review.")
        return out
