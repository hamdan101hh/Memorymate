"""Memory Capture & Meeting Mode — consent-based, user-controlled capture sessions.
Extends the existing app; reuses patient scoping, reminders and appointments collections."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user, _log, hash_password, verify_password
from routes import patient_id_for, save_memory_for_patient
import ai
import ai_pipeline
import usage
import capture_meaningfulness as meaning
import image_storage as imgs

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
    "mic_enabled": False,  # user opted in to microphone for Smart Capture (browser permission still required)
    "capture_language": "auto",  # auto | en-US | ar | ur-PK | ru-RU | zh-CN
    "last_location_preview": None,  # {label, lat, lng, at} after user-confirmed share
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
    # --- Smart Day Capture (browser speech drafts while page is open) ---
    "smart_day_enabled": True,
    "smart_day_active": False,
    "smart_day_paused": False,
    "smart_day_started_at": None,
    "smart_day_min_snippet_seconds": 3,
    "smart_day_cloud_fallback": False,
    "smart_day_draft_hours": 24,
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
    merged = {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k != "_id"}}
    return merged


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
    mic_enabled: Optional[bool] = None
    capture_language: Optional[str] = None
    last_location_preview: Optional[dict] = None
    default_transcript_storage_mode: Optional[str] = None
    note_style: Optional[str] = None
    reminder_tone: Optional[str] = None
    smart_day_enabled: Optional[bool] = None
    smart_day_min_snippet_seconds: Optional[int] = None
    smart_day_cloud_fallback: Optional[bool] = None
    smart_day_draft_hours: Optional[int] = None


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
    # Let caregivers know if the PATIENT changed capture state (it's relevant to them).
    if user["role"] == "patient":
        await _notify_caregivers_capture(pid, "paused" if body.paused else "resumed")
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
    if user["role"] == "patient":
        await _notify_caregivers_capture(pid, "stopped")
    return await _build_status(pid)


async def _notify_caregivers_capture(pid: str, state: str) -> None:
    """Best-effort caregiver push when the patient pauses/stops/resumes capture."""
    bodies = {
        "paused": "Memory Capture was paused.",
        "resumed": "Memory Capture was resumed.",
        "stopped": "Memory Capture was turned off.",
    }
    try:
        import notifications
        await notifications.notify_caregivers(pid, "caregiver_alerts", {
            "title": "Capture status update", "body": bodies.get(state, "Memory Capture status changed."),
            "url": "/caregiver", "tag": "capture-state", "kind": "capture_state",
        })
    except Exception:  # noqa: BLE001 — never break the capture control flow
        pass


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
    meeting_minutes: Optional[float] = None


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
    if created:
        try:
            import notifications
            await notifications.notify_caregivers(pid, "privacy_review_alerts", {
                "title": "Items to review",
                "body": f"{len(created)} new item(s) are waiting in Privacy Review.",
                "url": "/caregiver/capture/review", "tag": "privacy-review", "kind": "privacy_review",
            })
        except Exception:  # noqa: BLE001 — never break capture processing
            pass
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

    img_ctx = await imgs.image_context_text(db, pid, session_id=sid)
    img_count = await imgs.count_draft_images(db, pid, sid)
    meta = {
        "title": s["title"],
        "purpose": s.get("purpose", ""),
        "people_involved": s.get("people_involved", ""),
        "note_style": settings.get("note_style"),
        "mode": s.get("mode"),
        "image_context": img_ctx,
        "image_count": img_count,
    }
    transcript = body.transcript.strip()
    if img_ctx:
        transcript = f"{transcript}\n\n{img_ctx}"
    now = NOW()
    meeting_mins = body.meeting_minutes
    pipeline_out = await ai_pipeline.process_meeting_transcript(
        pid, transcript, meta, meeting_minutes=meeting_mins,
    )
    result = pipeline_out["filter_result"]
    meeting_summary = pipeline_out.get("meeting_summary")
    created_events = [await _persist_event(pid, sid, user["id"], ev, now, s["title"])
                      for ev in result.get("events", [])]
    created_reviews = await _persist_reviews(pid, sid, result.get("review_items", []), now)

    await _finalize_session(s, sid, transcript, now, meeting_summary)
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


# ---------------- Smart Day Capture (cost-safe browser speech drafts) ----------------
SMART_DAY_DRAFT_HOURS_DEFAULT = 24


def _draft_expires(hours: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=max(1, hours))).isoformat()


def _active_draft_filter(pid: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "patient_id": pid,
        "status": "draft",
        "$or": [{"expires_at": {"$gt": now}}, {"expires_at": None}],
    }


@router.get("/smart-day/status")
async def smart_day_status(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    settings = await get_settings_doc(pid)
    usage_info = await usage.usage_summary(pid)
    draft_count = await db.smart_day_drafts.count_documents(_active_draft_filter(pid))
    started = settings.get("smart_day_started_at")
    session_hours = 0.0
    if started and settings.get("smart_day_active"):
        try:
            start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
            session_hours = (datetime.now(timezone.utc) - start_dt).total_seconds() / 3600
        except ValueError:
            session_hours = 0.0
    return {
        "enabled": settings.get("smart_day_enabled", True),
        "active": settings.get("smart_day_active", False),
        "paused": settings.get("smart_day_paused", False),
        "started_at": started,
        "session_hours": round(session_hours, 2),
        "session_limit_hours": usage.MAX_SMART_DAY_SESSION_HOURS,
        "draft_count": draft_count,
        "cloud_minutes_used": usage_info.get("smart_day_cloud_minutes", 0),
        "cloud_minutes_cap": usage_info.get("smart_day_cloud_cap_minutes", 15),
        "voice_limit_reached": usage_info.get("smart_day_cloud_remaining_minutes", 15) <= 0,
    }


@router.post("/smart-day/start")
async def smart_day_start(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    settings = await get_settings_doc(pid)
    if settings.get("private_mode"):
        raise HTTPException(status_code=423, detail="Private Mode is ON. Smart Day Capture is disabled.")
    if not settings.get("mic_enabled"):
        raise HTTPException(status_code=400, detail="Turn on microphone permission in Capture settings first.")
    if not settings.get("smart_day_enabled", True):
        raise HTTPException(status_code=400, detail="Smart Day Capture is disabled in settings.")
    await db.audio_settings.update_one(
        {"patient_id": pid},
        {"$set": {"smart_day_active": True, "smart_day_paused": False, "smart_day_started_at": NOW()}},
    )
    await _log(user["id"], "smart_day_start", "capture", pid)
    return await smart_day_status(user)


class SmartDayPauseBody(BaseModel):
    paused: bool = True


@router.post("/smart-day/pause")
async def smart_day_pause(body: SmartDayPauseBody, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    paused = body.paused
    await db.audio_settings.update_one(
        {"patient_id": pid},
        {"$set": {"smart_day_paused": paused}},
    )
    return await smart_day_status(user)


@router.post("/smart-day/stop")
async def smart_day_stop(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    await db.audio_settings.update_one(
        {"patient_id": pid},
        {"$set": {"smart_day_active": False, "smart_day_paused": False, "smart_day_started_at": None}},
    )
    await _log(user["id"], "smart_day_stop", "capture", pid)
    return await smart_day_status(user)


class SmartDayDraftBody(BaseModel):
    transcript: str
    language: Optional[str] = "auto"
    detected_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    location_context: Optional[dict] = None
    location_confirmed: bool = False
    source: str = "smart_day_capture"
    browser_transcript: bool = True


@router.post("/smart-day/draft")
async def smart_day_create_draft(body: SmartDayDraftBody, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    settings = await get_settings_doc(pid)
    if settings.get("private_mode"):
        raise HTTPException(status_code=423, detail="Private Mode is ON.")
    if not settings.get("smart_day_active"):
        raise HTTPException(status_code=400, detail="Start Smart Day Capture first.")

    duration = float(body.duration_seconds or 0)
    if duration > usage.MAX_SMART_DAY_SNIPPET_SECONDS:
        return {"created": False, "reason": "snippet_too_long"}

    meta = {
        "duration_seconds": duration,
        "min_snippet_seconds": settings.get("smart_day_min_snippet_seconds", 3),
    }
    check = meaning.is_meaningful_capture_snippet(body.transcript, meta)
    if not check.get("should_create_draft"):
        return {"created": False, "reason": check.get("reason"), "filter": check}

    # Browser transcript path — no cloud STT when browser_transcript is true.
    if not body.browser_transcript and settings.get("smart_day_cloud_fallback"):
        if not ai_pipeline.CLOUD_TRANSCRIPTION_ENABLED:
            return {"created": False, "reason": "cloud_transcription_disabled"}
        minutes = max(duration / 60.0, 0.1)
        await usage.assert_smart_day_cloud_cap(pid, minutes)

    hours = int(settings.get("smart_day_draft_hours") or SMART_DAY_DRAFT_HOURS_DEFAULT)
    now = NOW()
    draft_id = str(uuid.uuid4())
    loc = body.location_context if body.location_confirmed and body.location_context else None
    doc = {
        "id": draft_id,
        "patient_id": pid,
        "user_id": user["id"],
        "transcript": body.transcript.strip(),
        "suggested_title": check.get("suggested_title", body.transcript[:60]),
        "suggested_summary": check.get("suggested_summary", body.transcript[:280]),
        "suggested_type": check.get("suggested_type", "memory"),
        "confidence": check.get("confidence", "medium"),
        "detected_at": body.detected_at or now,
        "duration_seconds": duration,
        "language": body.language or "auto",
        "location_context": loc,
        "source": body.source,
        "status": "draft",
        "expires_at": _draft_expires(hours),
        "created_at": now,
    }
    await db.smart_day_drafts.insert_one(doc)
    await _log(user["id"], "smart_day_draft", "smart_day_draft", draft_id)
    return {"created": True, "reason": check.get("reason"), "draft": {k: v for k, v in doc.items() if k != "_id"}}


@router.get("/smart-day/drafts")
async def smart_day_list_drafts(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    drafts = await db.smart_day_drafts.find(_active_draft_filter(pid), PROJ).sort("created_at", -1).to_list(200)
    return {"drafts": drafts}


class SmartDaySaveBody(BaseModel):
    save_as: str  # memory | reminder | appointment
    location_confirmed: bool = False
    image_ids: List[str] = []
    permission_confirmed: bool = False


@router.post("/smart-day/drafts/{draft_id}/save")
async def smart_day_save_draft(draft_id: str, body: SmartDaySaveBody, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    draft = await db.smart_day_drafts.find_one({"id": draft_id, "patient_id": pid, "status": "draft"}, PROJ)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found or expired.")
    if body.image_ids and not body.permission_confirmed:
        raise HTTPException(status_code=400, detail="Please confirm you have permission to save attached photos.")
    save_as = body.save_as
    if save_as not in ("memory", "reminder", "appointment"):
        raise HTTPException(status_code=400, detail="save_as must be memory, reminder, or appointment.")
    now = NOW()
    location = draft.get("location_context") if body.location_confirmed else None
    img_ctx = await imgs.image_context_text(
        db, pid, image_ids=body.image_ids or None,
        linked_type="smart_day_draft", linked_id=draft_id,
    )
    transcript = draft["transcript"]
    if img_ctx:
        transcript = f"{transcript}\n\n{img_ctx}"
    result = {}
    if save_as == "memory":
        mem = await save_memory_for_patient(
            pid, transcript, title=draft.get("suggested_title"),
            source="smart_day_capture", location=location,
            image_ids=body.image_ids or None,
            by_user_id=user["id"], by_role=user["role"],
        )
        result["memory"] = mem
    elif save_as == "reminder":
        desc = draft.get("suggested_summary", "")[:500]
        if img_ctx and not desc:
            desc = img_ctx[:500]
        doc = {
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
            "title": draft.get("suggested_title", "Reminder")[:200],
            "description": desc,
            "category": "custom", "priority": "medium",
            "due_date": "", "due_time": "", "repeat_rule": "none",
            "status": "pending", "source": "smart_day_capture",
            "created_at": now, "completed_at": None,
        }
        await db.reminders.insert_one(doc)
        if body.image_ids:
            await imgs.link_images_to_reminder(db, pid, doc["id"], body.image_ids)
            doc["image_url"] = imgs.public_image_path(body.image_ids[0])
        result["reminder"] = {k: v for k, v in doc.items() if k != "_id"}
    else:
        doc = {
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
            "title": draft.get("suggested_title", "Appointment")[:200],
            "doctor_or_clinic": "", "date": "", "time": "",
            "location": (location or {}).get("label", "") if location else "",
            "notes": transcript[:500],
            "status": "scheduled", "source": "smart_day_capture", "created_at": now,
        }
        await db.appointments.insert_one(doc)
        if body.image_ids:
            await imgs.link_images_to_appointment(db, pid, doc["id"], body.image_ids)
            doc["image_url"] = imgs.public_image_path(body.image_ids[0])
        result["appointment"] = {k: v for k, v in doc.items() if k != "_id"}

    await db.smart_day_drafts.update_one(
        {"id": draft_id}, {"$set": {"status": "saved", "saved_at": now, "saved_as": save_as}},
    )
    return {"ok": True, "saved_as": save_as, **result}


@router.post("/smart-day/drafts/{draft_id}/ignore")
async def smart_day_ignore_draft(draft_id: str, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    res = await db.smart_day_drafts.update_one(
        {"id": draft_id, "patient_id": pid, "status": "draft"},
        {"$set": {"status": "ignored", "ignored_at": NOW()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Draft not found.")
    return {"ok": True}


@router.post("/smart-day/drafts/clear")
async def smart_day_clear_drafts(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    res = await db.smart_day_drafts.update_many(
        {"patient_id": pid, "status": "draft"},
        {"$set": {"status": "deleted", "deleted_at": NOW()}},
    )
    return {"cleared": res.modified_count}
