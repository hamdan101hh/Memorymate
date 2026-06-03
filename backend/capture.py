"""Memory Capture & Meeting Mode — consent-based, user-controlled capture sessions.
Extends the existing app; reuses patient scoping, reminders and appointments collections."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user, _log
from routes import patient_id_for
import ai

router = APIRouter(prefix="/api/capture", tags=["capture"])
NOW = lambda: datetime.now(timezone.utc).isoformat()
PROJ = {"_id": 0}


# ---------------- audio / privacy settings ----------------
DEFAULT_SETTINGS = {
    "private_mode": False,
    "capture_only_when_charging": False,
    "auto_stop_minutes": 30,
    "low_battery_auto_stop": True,
    "wifi_only": False,
    "local_processing": False,
    "default_transcript_storage_mode": "summary_only",  # summary_only | transcript | raw_audio
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
    default_transcript_storage_mode: Optional[str] = None


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
    return {**s, "events": events}


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

    meta = {"title": s["title"], "purpose": s.get("purpose", ""), "people_involved": s.get("people_involved", "")}
    now = NOW()

    # AI filter + divide into discrete events
    result = await ai.filter_capture_transcript(body.transcript, meta)
    created_events = []
    for ev in result.get("events", []):
        eid = str(uuid.uuid4())
        etype = ev.get("event_type", "memory_event")
        doc = {
            "id": eid, "patient_id": pid, "session_id": sid,
            "title": ev.get("title", "Memory event"), "event_type": etype,
            "category": etype, "confidence": ev.get("confidence", "medium"),
            "summary": ev.get("summary", ""), "event_time": ev.get("event_time", ""),
            "people": ev.get("people", []), "places": ev.get("places", []),
            "reminders": ev.get("reminders", []), "action_items": ev.get("action_items", []),
            "privacy_level": ev.get("privacy_level", "normal"), "source": "capture",
            "status": "saved", "created_at": now,
        }
        await db.memory_events.insert_one(doc)
        created_events.append({k: v for k, v in doc.items() if k != "_id"})

        # Feed extracted reminders into the existing reminders collection
        for r in ev.get("reminders", []):
            await db.reminders.insert_one({
                "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
                "title": r, "description": f"From capture: {s['title']}",
                "category": "appointment" if etype == "appointment" else "task",
                "priority": "medium", "due_date": "", "due_time": "", "repeat_rule": "none",
                "status": "pending", "source": "ai", "created_at": now, "completed_at": None,
            })

        # Route classified events into the EXISTING domain tables (no new duplicate tables).
        if etype == "appointment":
            await db.appointments.insert_one({
                "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
                "title": ev.get("title", "Appointment"), "doctor_or_clinic": "",
                "date": ev.get("event_time", ""), "time": "",
                "location": (ev.get("places") or [""])[0], "notes": ev.get("summary", ""),
                "transport_notes": "", "reminder_time": "", "created_at": now,
            })
        elif etype == "medication":
            await db.medications.insert_one({
                "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
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
                        "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
                        "name": nm, "relationship": "", "photo_url": None, "phone": None,
                        "description": ev.get("summary", ""), "explanation_for_patient": "",
                        "notes": "Added from a capture session.", "last_mentioned": now[:10], "created_at": now,
                    })
            for pl in ev.get("places", []):
                if pl and not await db.important_places.find_one({"patient_id": pid, "name": pl}):
                    await db.important_places.insert_one({
                        "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
                        "name": pl, "type": "custom", "address": "", "description": ev.get("summary", ""),
                        "instructions": "", "notes": "Added from a capture session.", "created_at": now,
                    })

    # Uncertain / sensitive snippets -> privacy review queue
    created_reviews = []
    for ri in result.get("review_items", []):
        rid = str(uuid.uuid4())
        doc = {
            "id": rid, "patient_id": pid, "session_id": sid,
            "content": ri.get("content", ""), "suggested_type": ri.get("suggested_type", "memory_event"),
            "reason": ri.get("reason", ""), "status": "pending", "resolved_action": None, "created_at": now,
        }
        await db.privacy_review_items.insert_one(doc)
        created_reviews.append({k: v for k, v in doc.items() if k != "_id"})

    # Meeting mode -> structured meeting summary stored on session
    meeting_summary = None
    if s.get("mode") == "meeting":
        meeting_summary = await ai.summarize_meeting(body.transcript, meta)

    # Storage policy: only persist transcript when storage mode allows it
    set_doc = {"status": "completed", "end_time": now, "meeting_summary": meeting_summary}
    if s.get("transcript_storage_mode") in ("transcript", "raw_audio"):
        set_doc["stored_transcript"] = body.transcript
    await db.capture_sessions.update_one({"id": sid}, {"$set": set_doc})

    return {
        "events": created_events,
        "review_items": created_reviews,
        "meeting_summary": meeting_summary,
        "filtered_out": True,
    }


# ---------------- memory events ----------------
@router.get("/events")
async def list_events(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await db.memory_events.find({"patient_id": pid}, PROJ).sort("created_at", -1).to_list(1000)


# ---------------- privacy review queue ----------------
@router.get("/review")
async def list_review(status: str = "pending", user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await db.privacy_review_items.find({"patient_id": pid, "status": status}, PROJ).sort("created_at", -1).to_list(500)


class ReviewAction(BaseModel):
    action: str  # save | delete | convert_reminder | convert_memory | mark_private | edit
    edited_content: Optional[str] = None


VALID_REVIEW_ACTIONS = {"save", "delete", "convert_reminder", "convert_memory", "mark_private", "edit"}


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
    # "delete" and "mark_private" only resolve the item without saving anything.

    await db.privacy_review_items.update_one(
        {"id": rid}, {"$set": {"status": "resolved", "resolved_action": action, "resolved_at": now}})
    await _log(user["id"], "review_action", "privacy_review", rid, action)
    return {"ok": True, "action": action}
