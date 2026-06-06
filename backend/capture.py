"""Memory Capture & Meeting Mode — consent-based, user-controlled capture sessions.
Extends the existing app; reuses patient scoping, reminders and appointments collections."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user, _log, hash_password, verify_password
from routes import patient_id_for
import ai
import usage

router = APIRouter(prefix="/api/capture", tags=["capture"])
NOW = lambda: datetime.now(timezone.utc).isoformat()
PROJ = {"_id": 0}


def _redact(ev: dict) -> dict:
    """Hide sensitive event content outside the Private Vault. Returns a locked
    stub (no summary/people/places) so the UI can show 'Private (locked)'."""
    if ev.get("privacy_level") == "sensitive":
        return {
            "id": ev.get("id"), "title": "Private (locked)",
            "event_type": ev.get("event_type", "memory_event"),
            "privacy_level": "sensitive", "locked": True,
            "summary": "", "event_time": ev.get("event_time", ""),
            "people": [], "places": [], "reminders": [], "action_items": [],
            "confidence": ev.get("confidence", "medium"), "created_at": ev.get("created_at", ""),
        }
    return ev


# ---------------- audio / privacy settings ----------------
DEFAULT_SETTINGS = {
    "private_mode": False,
    "capture_only_when_charging": False,
    "auto_stop_minutes": 30,
    "low_battery_auto_stop": True,
    "wifi_only": False,
    "local_processing": False,
    "location_enabled": False,  # optional: attach coarse location to memories/events
    "default_transcript_storage_mode": "summary_only",  # summary_only | transcript | raw_audio
    # --- message-style preferences (chosen during Always-On onboarding) ---
    "note_style": "warm",       # short | warm | detailed | bullets | family | caregiver
    "reminder_tone": "gentle",  # gentle | direct | family
    # --- always-on memory capture config ---
    "always_on": False,
    "capture_paused": False,
    "capture_duration": "until_off",  # 1d | 1w | 1m | until_off | custom
    "capture_started_at": None,
    "capture_expires_at": None,       # ISO timestamp or None (= until turned off)
    "onboarding_done": False,
}

DURATION_DELTAS = {
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
    "1m": timedelta(days=30),
}


async def get_settings_doc(pid: str) -> dict:
    doc = await db.audio_settings.find_one({"patient_id": pid}, PROJ)
    if not doc:
        doc = {"id": str(uuid.uuid4()), "patient_id": pid, **DEFAULT_SETTINGS, "created_at": NOW()}
        await db.audio_settings.insert_one(dict(doc))
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await get_settings_doc(pid)


class SettingsUpdate(BaseModel):
    private_mode: Optional[bool] = None
    capture_only_when_charging: Optional[bool] = None
    auto_stop_minutes: Optional[int] = None
    low_battery_auto_stop: Optional[bool] = None
    wifi_only: Optional[bool] = None
    local_processing: Optional[bool] = None
    location_enabled: Optional[bool] = None
    default_transcript_storage_mode: Optional[str] = None
    note_style: Optional[str] = None
    reminder_tone: Optional[str] = None


@router.patch("/settings")
async def update_settings(body: SettingsUpdate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    await get_settings_doc(pid)
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.audio_settings.update_one({"patient_id": pid}, {"$set": update})
        if "private_mode" in update:
            await _log(user["id"], "private_mode", "audio_settings", pid, f"on={update['private_mode']}")
    return await get_settings_doc(pid)


# ---------------- always-on memory capture ----------------
class AlwaysOnStart(BaseModel):
    duration: str = "until_off"  # 1d | 1w | 1m | until_off | custom
    custom_until: Optional[str] = None  # ISO timestamp when duration == custom
    note_style: Optional[str] = None
    reminder_tone: Optional[str] = None
    consent_confirmed: bool = False


def _compute_expiry(duration: str, custom_until: Optional[str], start: datetime) -> Optional[str]:
    if duration in DURATION_DELTAS:
        return (start + DURATION_DELTAS[duration]).isoformat()
    if duration == "custom" and custom_until:
        return custom_until
    return None  # until_off


async def _build_status(pid: str) -> dict:
    """Compute the live always-on capture status, auto-stopping if the window expired."""
    s = await get_settings_doc(pid)
    now = datetime.now(timezone.utc)
    expires = s.get("capture_expires_at")
    seconds_remaining = None
    expired = False
    if s.get("always_on") and expires:
        try:
            exp_dt = datetime.fromisoformat(expires)
            seconds_remaining = max(0, int((exp_dt - now).total_seconds()))
            expired = seconds_remaining <= 0
        except ValueError:
            seconds_remaining = None
    if expired:
        await db.audio_settings.update_one(
            {"patient_id": pid},
            {"$set": {"always_on": False, "capture_paused": False, "capture_expires_at": None}},
        )
        s = {**s, "always_on": False, "capture_paused": False, "capture_expires_at": None}
        seconds_remaining = 0

    last = await db.memory_events.find_one(
        {"patient_id": pid, "privacy_level": {"$ne": "sensitive"}}, PROJ, sort=[("created_at", -1)]
    )
    review_count = await db.privacy_review_items.count_documents({"patient_id": pid, "status": "pending"})
    locked_count = await db.memory_events.count_documents({"patient_id": pid, "privacy_level": "sensitive"})
    return {
        "always_on": bool(s.get("always_on")),
        "paused": bool(s.get("capture_paused")),
        "active": bool(s.get("always_on")) and not s.get("capture_paused") and not s.get("private_mode"),
        "private_mode": bool(s.get("private_mode")),
        "duration": s.get("capture_duration", "until_off"),
        "started_at": s.get("capture_started_at"),
        "expires_at": s.get("capture_expires_at"),
        "seconds_remaining": seconds_remaining,
        "expired": expired,
        "note_style": s.get("note_style", "warm"),
        "reminder_tone": s.get("reminder_tone", "gentle"),
        "onboarding_done": bool(s.get("onboarding_done")),
        "review_count": review_count,
        "locked_count": locked_count,
        "last_captured": {
            "title": last.get("title", ""), "summary": last.get("summary", ""),
            "created_at": last.get("created_at", ""),
        } if last else None,
    }


@router.get("/status")
async def capture_status(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await _build_status(pid)


@router.post("/always-on/start")
async def always_on_start(body: AlwaysOnStart, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    settings = await get_settings_doc(pid)
    if settings.get("private_mode"):
        raise HTTPException(status_code=423, detail="Private Mode is ON. Turn it off to start Always-On capture.")
    if not body.consent_confirmed:
        raise HTTPException(status_code=400, detail="Consent is required to start Always-On capture.")
    if body.duration not in ("1d", "1w", "1m", "until_off", "custom"):
        raise HTTPException(status_code=400, detail="Please choose a valid capture duration.")
    if body.duration == "custom" and not body.custom_until:
        raise HTTPException(status_code=400, detail="Please choose an end date for custom duration.")

    start = datetime.now(timezone.utc)
    update = {
        "always_on": True,
        "capture_paused": False,
        "capture_duration": body.duration,
        "capture_started_at": start.isoformat(),
        "capture_expires_at": _compute_expiry(body.duration, body.custom_until, start),
        "onboarding_done": True,
    }
    if body.note_style:
        update["note_style"] = body.note_style
    if body.reminder_tone:
        update["reminder_tone"] = body.reminder_tone
    await db.audio_settings.update_one({"patient_id": pid}, {"$set": update})

    # Consent log for transparency/auditing.
    await db.consent_logs.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "session_id": None, "user_id": user["id"],
        "confirmed": True, "informed_others": None,
        "text": f"Always-On memory capture started (duration: {body.duration}).", "created_at": NOW(),
    })
    await _log(user["id"], "always_on_start", "audio_settings", pid, body.duration)
    return await _build_status(pid)


class PauseBody(BaseModel):
    paused: bool = True


@router.post("/always-on/pause")
async def always_on_pause(body: PauseBody, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    await get_settings_doc(pid)
    await db.audio_settings.update_one({"patient_id": pid}, {"$set": {"capture_paused": body.paused}})
    await _log(user["id"], "always_on_pause", "audio_settings", pid, f"paused={body.paused}")
    return await _build_status(pid)


@router.post("/always-on/stop")
async def always_on_stop(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    await get_settings_doc(pid)
    await db.audio_settings.update_one(
        {"patient_id": pid},
        {"$set": {"always_on": False, "capture_paused": False, "capture_expires_at": None}},
    )
    await db.consent_logs.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "session_id": None, "user_id": user["id"],
        "confirmed": True, "informed_others": None,
        "text": "Always-On memory capture stopped by the user.", "created_at": NOW(),
    })
    await _log(user["id"], "always_on_stop", "audio_settings", pid, "")
    return await _build_status(pid)


@router.delete("/recent")
async def delete_recent(minutes: int = 30, user: dict = Depends(get_current_user)):
    """Delete capture-sourced memories created in the last N minutes (privacy panic button)."""
    pid = await patient_id_for(user)
    minutes = max(1, min(minutes, 24 * 60))
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    ev = await db.memory_events.delete_many(
        {"patient_id": pid, "source": "capture", "created_at": {"$gte": cutoff}})
    rem = await db.reminders.delete_many(
        {"patient_id": pid, "source": "ai", "created_at": {"$gte": cutoff}})
    rev = await db.privacy_review_items.delete_many(
        {"patient_id": pid, "status": "pending", "created_at": {"$gte": cutoff}})
    await _log(user["id"], "delete_recent_capture", "memory_events", pid, f"{minutes}m")
    return {
        "ok": True, "minutes": minutes,
        "deleted_events": ev.deleted_count,
        "deleted_reminders": rem.deleted_count,
        "deleted_reviews": rev.deleted_count,
    }


# ---------------- sessions ----------------
class SessionCreate(BaseModel):
    mode: str = "capture"  # capture | meeting
    title: str
    session_type: str = "general"  # meeting | doctor | family_visit | phone_call | routine | caregiver_checkin | general
    purpose: Optional[str] = ""
    people_involved: Optional[str] = ""
    expected_duration: Optional[int] = 30  # minutes
    transcript_storage_mode: str = "summary_only"
    consent_confirmed: bool = False
    informed_others: bool = False


@router.post("/sessions")
async def create_session(body: SessionCreate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    settings = await get_settings_doc(pid)
    if settings.get("private_mode"):
        raise HTTPException(status_code=423, detail="Private Mode is ON. Turn it off to start a capture session.")
    if not body.consent_confirmed:
        raise HTTPException(status_code=400, detail="Consent is required to start a capture session.")

    now = NOW()
    sid = str(uuid.uuid4())
    raw_audio_saved = body.transcript_storage_mode == "raw_audio"
    doc = {
        "id": sid, "patient_id": pid, "started_by_user_id": user["id"],
        "mode": body.mode, "title": body.title, "session_type": body.session_type,
        "purpose": body.purpose, "people_involved": body.people_involved,
        "expected_duration": body.expected_duration,
        "start_time": now, "end_time": None, "status": "active",
        "consent_confirmed": True, "raw_audio_saved": raw_audio_saved,
        "transcript_storage_mode": body.transcript_storage_mode,
        "manual_notes": [], "meeting_summary": None, "created_at": now,
    }
    await db.capture_sessions.insert_one(doc)

    # consent log
    await db.consent_logs.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "session_id": sid, "user_id": user["id"],
        "confirmed": True, "informed_others": body.informed_others,
        "text": "User confirmed consent to start a memory capture session.", "created_at": now,
    })
    await _log(user["id"], "start_capture", "capture_session", sid, body.mode)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/sessions")
async def list_sessions(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    q = {"patient_id": pid}
    if status:
        q["status"] = status
    return await db.capture_sessions.find(q, PROJ).sort("created_at", -1).to_list(500)


@router.get("/sessions/{sid}")
async def get_session(sid: str, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    s = await db.capture_sessions.find_one({"id": sid, "patient_id": pid}, PROJ)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found.")
    events = await db.memory_events.find({"session_id": sid}, PROJ).sort("created_at", 1).to_list(500)
    return {**s, "events": [_redact(e) for e in events]}


class SessionStatus(BaseModel):
    status: str  # active | paused | stopped | completed


@router.patch("/sessions/{sid}")
async def update_session(sid: str, body: SessionStatus, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    update = {"status": body.status}
    if body.status in ("stopped", "completed"):
        update["end_time"] = NOW()
    res = await db.capture_sessions.update_one({"id": sid, "patient_id": pid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found.")
    # Write a consent log entry whenever a session is stopped, for transparency/auditing.
    if body.status in ("stopped", "completed"):
        await db.consent_logs.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "session_id": sid, "user_id": user["id"],
            "confirmed": True, "informed_others": None,
            "text": f"Capture session was {body.status} by the user.", "created_at": NOW(),
        })
        await _log(user["id"], "stop_capture", "capture_session", sid, body.status)
    return await db.capture_sessions.find_one({"id": sid}, PROJ)


class ManualNote(BaseModel):
    note: str


@router.post("/sessions/{sid}/note")
async def add_note(sid: str, body: ManualNote, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    note = {"text": body.note, "at": NOW()}
    res = await db.capture_sessions.update_one({"id": sid, "patient_id": pid}, {"$push": {"manual_notes": note}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"ok": True, "note": note}


class ProcessBody(BaseModel):
    transcript: str


async def _route_event_to_tables(pid: str, user_id: str, etype: str, ev: dict, now: str) -> None:
    """Route a classified capture event into the EXISTING domain tables (no duplicate tables)."""
    if etype == "appointment":
        await db.appointments.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user_id,
            "title": ev.get("title", "Appointment"), "doctor_or_clinic": "",
            "date": ev.get("event_time", ""), "time": "",
            "location": (ev.get("places") or [""])[0], "notes": ev.get("summary", ""),
            "transport_notes": "", "reminder_time": "", "created_at": now,
        })
    elif etype == "medication":
        await db.medications.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user_id,
            "medication_name": ev.get("title", "Medication note"), "dosage": "", "frequency": "",
            "time_of_day": "morning", "instructions": ev.get("summary", ""),
            "start_date": "", "end_date": "",
            "notes": "From capture — please confirm with a doctor or pharmacist.",
            "priority": "medium", "created_at": now,
        })
    elif etype == "person_place_update":
        for nm in ev.get("people", []):
            if nm and not await db.important_people.find_one({"patient_id": pid, "name": nm}):
                await db.important_people.insert_one({
                    "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user_id,
                    "name": nm, "relationship": "", "photo_url": None, "phone": None,
                    "description": ev.get("summary", ""), "explanation_for_patient": "",
                    "notes": "Added from a capture session.", "last_mentioned": now[:10], "created_at": now,
                })
        for pl in ev.get("places", []):
            if pl and not await db.important_places.find_one({"patient_id": pid, "name": pl}):
                await db.important_places.insert_one({
                    "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user_id,
                    "name": pl, "type": "custom", "address": "", "description": ev.get("summary", ""),
                    "instructions": "", "notes": "Added from a capture session.", "created_at": now,
                })


async def _persist_event(pid: str, sid: str, user_id: str, ev: dict, now: str, session_title: str) -> dict:
    """Save one classified memory event, its reminders, and route it to the domain tables."""
    etype = ev.get("event_type", "memory_event")
    doc = {
        "id": str(uuid.uuid4()), "patient_id": pid, "session_id": sid,
        "title": ev.get("title", "Memory event"), "event_type": etype,
        "category": etype, "confidence": ev.get("confidence", "medium"),
        "summary": ev.get("summary", ""), "event_time": ev.get("event_time", ""),
        "people": ev.get("people", []), "places": ev.get("places", []),
        "reminders": ev.get("reminders", []), "action_items": ev.get("action_items", []),
        "privacy_level": ev.get("privacy_level", "normal"), "source": "capture",
        "status": "saved", "created_at": now,
    }
    await db.memory_events.insert_one(doc)
    # Sensitive events are locked in the Private Vault — never spill their content
    # into reminders, people, or places tables.
    if doc["privacy_level"] != "sensitive":
        for r in ev.get("reminders", []):
            await db.reminders.insert_one({
                "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user_id,
                "title": r, "description": f"From capture: {session_title}",
                "category": "appointment" if etype == "appointment" else "task",
                "priority": "medium", "due_date": "", "due_time": "", "repeat_rule": "none",
                "status": "pending", "source": "ai", "created_at": now, "completed_at": None,
            })
        await _route_event_to_tables(pid, user_id, etype, ev, now)
    return {k: v for k, v in doc.items() if k != "_id"}


async def _persist_reviews(pid: str, sid: str, review_items: list, now: str) -> list:
    """Save uncertain / sensitive snippets to the privacy review queue."""
    created = []
    for ri in review_items:
        doc = {
            "id": str(uuid.uuid4()), "patient_id": pid, "session_id": sid,
            "content": ri.get("content", ""), "suggested_type": ri.get("suggested_type", "memory_event"),
            "reason": ri.get("reason", ""), "status": "pending", "resolved_action": None, "created_at": now,
        }
        await db.privacy_review_items.insert_one(doc)
        created.append({k: v for k, v in doc.items() if k != "_id"})
    return created


async def _finalize_session(s: dict, sid: str, transcript: str, now: str, meeting_summary) -> None:
    """Complete the session; persist the transcript only when the storage policy allows it."""
    set_doc = {"status": "completed", "end_time": now, "meeting_summary": meeting_summary}
    if s.get("transcript_storage_mode") in ("transcript", "raw_audio"):
        set_doc["stored_transcript"] = transcript
    await db.capture_sessions.update_one({"id": sid}, {"$set": set_doc})


@router.post("/sessions/{sid}/process")
async def process_session(sid: str, body: ProcessBody, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    s = await db.capture_sessions.find_one({"id": sid, "patient_id": pid}, PROJ)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found.")
    settings = await get_settings_doc(pid)
    if settings.get("private_mode"):
        raise HTTPException(status_code=423, detail="Private Mode is ON. Nothing was processed or saved.")
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Please add a transcript to process.")

    # Cost guard: refuse if this patient has hit today's AI ceiling.
    await usage.assert_within_cap(pid)

    meta = {"title": s["title"], "purpose": s.get("purpose", ""), "people_involved": s.get("people_involved", "")}
    now = NOW()

    # AI filter + divide into discrete, classified events.
    result = await ai.filter_capture_transcript(body.transcript, meta, style=settings.get("note_style"))
    created_events = [await _persist_event(pid, sid, user["id"], ev, now, s["title"])
                      for ev in result.get("events", [])]
    created_reviews = await _persist_reviews(pid, sid, result.get("review_items", []), now)

    # Meeting mode -> structured meeting summary stored on the session.
    meeting_summary = await ai.summarize_meeting(body.transcript, meta) if s.get("mode") == "meeting" else None

    # Record estimated AI cost (capture splitting + optional meeting summary).
    out_chars = sum(len(str(e.get("summary", ""))) for e in created_events) + len(str(meeting_summary or ""))
    await usage.record(pid, "capture_process", in_chars=len(body.transcript), out_chars=out_chars, tier="cheap")

    await _finalize_session(s, sid, body.transcript, now, meeting_summary)
    locked_count = sum(1 for e in created_events if e.get("privacy_level") == "sensitive")
    return {
        "events": [_redact(e) for e in created_events],
        "review_items": created_reviews,
        "meeting_summary": meeting_summary,
        "context": result.get("context", "general"),
        "filtered_out": True,
        "locked_count": locked_count,
    }


@router.post("/sessions/{sid}/append")
async def append_chunk(sid: str, body: ProcessBody, user: dict = Depends(get_current_user)):
    """Continuous (always-on) capture: filter ONE chunk of live dictation into events
    without ending the session. Lets capture run hands-free while it stays open."""
    pid = await patient_id_for(user)
    s = await db.capture_sessions.find_one({"id": sid, "patient_id": pid}, PROJ)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found.")
    settings = await get_settings_doc(pid)
    if settings.get("private_mode"):
        raise HTTPException(status_code=423, detail="Private Mode is ON. Nothing was processed or saved.")
    if not body.transcript.strip():
        return {"events": [], "review_items": [], "context": "general", "locked_count": 0}

    await usage.assert_within_cap(pid)
    meta = {"title": s["title"], "purpose": s.get("purpose", ""), "people_involved": s.get("people_involved", "")}
    now = NOW()
    result = await ai.filter_capture_transcript(body.transcript, meta, style=settings.get("note_style"))
    created_events = [await _persist_event(pid, sid, user["id"], ev, now, s["title"])
                      for ev in result.get("events", [])]
    created_reviews = await _persist_reviews(pid, sid, result.get("review_items", []), now)
    out_chars = sum(len(str(e.get("summary", ""))) for e in created_events)
    await usage.record(pid, "capture_append", in_chars=len(body.transcript), out_chars=out_chars, tier="cheap")

    # Auto-detected context (meeting/family/doctor/…) — surfaced live in the UI.
    detected = result.get("context", "general")
    if detected and detected != s.get("session_type"):
        await db.capture_sessions.update_one({"id": sid}, {"$set": {"detected_context": detected}})

    locked_count = sum(1 for e in created_events if e.get("privacy_level") == "sensitive")
    return {
        "events": [_redact(e) for e in created_events],
        "review_items": created_reviews,
        "context": detected,
        "locked_count": locked_count,
    }


# ---------------- memory events ----------------
@router.get("/events")
async def list_events(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    # Sensitive events live in the Private Vault and are excluded from normal lists.
    return await db.memory_events.find(
        {"patient_id": pid, "privacy_level": {"$ne": "sensitive"}}, PROJ
    ).sort("created_at", -1).to_list(1000)


# ---------------- private vault (PIN-locked sensitive content) ----------------
MAX_PIN_FAILS = 5
LOCKOUT_MINUTES = 5


async def _vault_doc(pid: str) -> Optional[dict]:
    return await db.vault_settings.find_one({"patient_id": pid}, PROJ)


class VaultPin(BaseModel):
    pin: str
    current_pin: Optional[str] = None


class VaultUnlock(BaseModel):
    pin: str


@router.get("/vault/status")
async def vault_status(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    doc = await _vault_doc(pid)
    count = await db.memory_events.count_documents({"patient_id": pid, "privacy_level": "sensitive"})
    return {"pin_set": bool(doc), "locked_count": count}


@router.post("/vault/pin")
async def set_vault_pin(body: VaultPin, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    pin = (body.pin or "").strip()
    if len(pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 characters.")
    doc = await _vault_doc(pid)
    now = NOW()
    if doc:
        if not body.current_pin or not verify_password(body.current_pin, doc["pin_hash"]):
            raise HTTPException(status_code=403, detail="Current PIN is incorrect.")
        await db.vault_settings.update_one(
            {"patient_id": pid},
            {"$set": {"pin_hash": hash_password(pin), "updated_at": now, "failed_attempts": 0, "locked_until": None}},
        )
    else:
        await db.vault_settings.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "pin_hash": hash_password(pin),
            "failed_attempts": 0, "locked_until": None, "created_at": now, "updated_at": now,
        })
    await _log(user["id"], "vault_pin_set", "vault", pid, "")
    return {"ok": True, "pin_set": True}


@router.post("/vault/unlock")
async def unlock_vault(body: VaultUnlock, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    doc = await _vault_doc(pid)
    if not doc:
        raise HTTPException(status_code=400, detail="No vault PIN is set yet. Set one first.")
    now = NOW()
    locked_until = doc.get("locked_until")
    if locked_until and now < locked_until:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in a few minutes.")
    if not verify_password(body.pin, doc["pin_hash"]):
        fails = int(doc.get("failed_attempts", 0)) + 1
        update = {"failed_attempts": fails}
        if fails >= MAX_PIN_FAILS:
            update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            update["failed_attempts"] = 0
        await db.vault_settings.update_one({"patient_id": pid}, {"$set": update})
        await _log(user["id"], "vault_unlock_failed", "vault", pid, str(fails))
        raise HTTPException(status_code=403, detail="Incorrect PIN.")
    await db.vault_settings.update_one({"patient_id": pid}, {"$set": {"failed_attempts": 0, "locked_until": None}})
    items = await db.memory_events.find(
        {"patient_id": pid, "privacy_level": "sensitive"}, PROJ
    ).sort("created_at", -1).to_list(500)
    await _log(user["id"], "vault_unlock", "vault", pid, f"{len(items)} items")
    return {"items": items}


# ---------------- privacy review queue ----------------
@router.get("/review")
async def list_review(status: str = "pending", user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await db.privacy_review_items.find({"patient_id": pid, "status": status}, PROJ).sort("created_at", -1).to_list(500)


class ReviewAction(BaseModel):
    action: str  # save | delete | convert_reminder | convert_memory | mark_private | add_to_vault | edit
    edited_content: Optional[str] = None


VALID_REVIEW_ACTIONS = {"save", "delete", "convert_reminder", "convert_memory",
                        "mark_private", "add_to_vault", "edit"}


@router.post("/review/{rid}/action")
async def review_action(rid: str, body: ReviewAction, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    item = await db.privacy_review_items.find_one({"id": rid, "patient_id": pid}, PROJ)
    if not item:
        raise HTTPException(status_code=404, detail="Review item not found.")
    action = body.action
    if action not in VALID_REVIEW_ACTIONS:
        raise HTTPException(status_code=400, detail="Unknown review action.")
    now = NOW()
    content = (body.edited_content or item["content"]) if action == "edit" else item["content"]

    if action == "edit":
        # Save the edited text as a memory event.
        await db.memory_events.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "session_id": item["session_id"],
            "title": (content[:60] or "Reviewed memory"), "event_type": "memory_event",
            "category": "memory_event", "confidence": "high",
            "summary": content, "event_time": "", "people": [], "places": [],
            "reminders": [], "action_items": [], "privacy_level": "normal",
            "source": "review", "status": "saved", "created_at": now,
        })
    elif action == "convert_reminder":
        await db.reminders.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
            "title": content[:120], "description": "From privacy review",
            "category": "task", "priority": "medium", "due_date": "", "due_time": "", "repeat_rule": "none",
            "status": "pending", "source": "caregiver", "created_at": now, "completed_at": None,
        })
    elif action in ("convert_memory", "save"):
        await db.memory_events.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "session_id": item["session_id"],
            "title": (content[:60] or "Reviewed memory"), "event_type": "memory_event",
            "category": "memory_event", "confidence": "high",
            "summary": content, "event_time": "", "people": [], "places": [],
            "reminders": [], "action_items": [], "privacy_level": "normal",
            "source": "review", "status": "saved", "created_at": now,
        })
    elif action == "add_to_vault":
        # Save as a sensitive memory event — locked behind the Private Vault PIN.
        await db.memory_events.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "session_id": item["session_id"],
            "title": (content[:60] or "Private memory"), "event_type": "memory_event",
            "category": "memory_event", "confidence": "high",
            "summary": content, "event_time": "", "people": [], "places": [],
            "reminders": [], "action_items": [], "privacy_level": "sensitive",
            "source": "review", "status": "saved", "created_at": now,
        })
    # "delete" and "mark_private" only resolve the item without saving anything.

    await db.privacy_review_items.update_one(
        {"id": rid}, {"$set": {"status": "resolved", "resolved_action": action, "resolved_at": now}})
    await _log(user["id"], "review_action", "privacy_review", rid, action)
    return {"ok": True, "action": action}
