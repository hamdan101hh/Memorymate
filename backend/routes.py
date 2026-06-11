"""All application routes (memories, reminders, medications, appointments, people,
places, notes, alerts, chat, summaries, patient profile, admin)."""
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, EmailStr

from db import db
from auth import get_current_user, require_role, _log
import ai
import usage
import appointment_dashboard as apdash
import appointment_ai
import duplicate_helpers as duph

router = APIRouter(prefix="/api", tags=["app"])

NOW = lambda: datetime.now(timezone.utc).isoformat()
PROJ = {"_id": 0}


# ---------------- helpers ----------------
async def patient_id_for(user: dict) -> str:
    """Return the patient profile id accessible to this user."""
    if user["role"] == "patient":
        p = await db.patients.find_one({"user_id": user["id"]}, PROJ)
        if p:
            return p["id"]
    if user["role"] == "caregiver":
        link = await db.patient_caregiver_links.find_one({"caregiver_id": user["id"]}, PROJ)
        if link:
            return link["patient_id"]
    if user["role"] == "admin":
        p = await db.patients.find_one({}, PROJ)
        if p:
            return p["id"]
    raise HTTPException(status_code=404, detail="No connected patient profile found yet.")


async def get_patient_doc(user: dict) -> dict:
    pid = await patient_id_for(user)
    return await db.patients.find_one({"id": pid}, PROJ)


async def _list(coll, pid, sort_field="created_at", direction=-1):
    return await db[coll].find({"patient_id": pid}, PROJ).sort(sort_field, direction).to_list(1000)


# ---------------- patient profile ----------------
@router.get("/patient")
async def get_patient(user: dict = Depends(get_current_user)):
    p = await get_patient_doc(user)
    caregivers = []
    links = await db.patient_caregiver_links.find({"patient_id": p["id"]}, PROJ).to_list(100)
    for l in links:
        cg = await db.users.find_one({"id": l["caregiver_id"]}, {"_id": 0, "password_hash": 0})
        if cg:
            caregivers.append({"full_name": cg["full_name"], "email": cg["email"],
                               "phone": cg.get("phone"), "relationship": l.get("relationship")})
    return {**p, "caregivers": caregivers}


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None
    timezone: Optional[str] = None  # IANA tz, used for calendar events & reminders


@router.patch("/patient")
async def update_patient(body: PatientUpdate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.patients.update_one({"id": pid}, {"$set": update})
    return await db.patients.find_one({"id": pid}, PROJ)


@router.get("/patient/overview")
async def patient_overview(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    p = await db.patients.find_one({"id": pid}, PROJ)
    reminders = await _list("reminders", pid)
    completed = len([r for r in reminders if r.get("status") == "done"])
    missed = len([r for r in reminders if r.get("status") == "missed"])
    last_memory = await db.memories.find_one({"patient_id": pid}, PROJ, sort=[("created_at", -1)])
    last_summary = last_memory.get("simple_summary") if last_memory else None
    return {
        "patient": p,
        "reminders_completed": completed,
        "reminders_missed": missed,
        "reminders_pending": len([r for r in reminders if r.get("status") == "pending"]),
        "total_memories": await db.memories.count_documents({"patient_id": pid}),
        "last_activity": last_memory.get("created_at") if last_memory else None,
        "recent_summary": last_summary,
    }


# ---------------- memories ----------------
class MemoryCreate(BaseModel):
    transcript: str
    title: Optional[str] = None
    source: str = "manual"  # manual | voice | upload
    location: Optional[dict] = None  # optional {lat, lng, label} when location is enabled


def _bucket_now() -> str:
    h = datetime.now(timezone.utc).hour
    return "morning" if h < 12 else "afternoon" if h < 18 else "evening"


async def save_memory_for_patient(pid: str, transcript: str, *, title: Optional[str] = None,
                                  source: str = "manual", location: Optional[dict] = None,
                                  by_user_id: str = "system", by_role: str = "patient") -> dict:
    """Shared memory pipeline: AI extraction + persistence + auto-reminders.

    Used by the web app (create_memory) and by external channels (e.g. WhatsApp),
    so every entry point produces identical, AI-processed memories. Raises 429 via
    usage.assert_within_cap when the patient's daily AI budget is exhausted.
    """
    await usage.assert_within_cap(pid)
    _sdoc = await db.audio_settings.find_one({"patient_id": pid}, {"_id": 0, "note_style": 1}) or {}
    extracted = await ai.process_transcript(transcript, style=_sdoc.get("note_style"))
    await usage.record(pid, "memory", in_chars=len(transcript),
                       out_chars=len(str(extracted.get("simple_summary", ""))), tier="cheap")
    now = NOW()
    mem_id = str(uuid.uuid4())
    memory = {
        "id": mem_id, "patient_id": pid,
        "created_by_user_id": by_user_id, "created_by_role": by_role,
        "title": title or extracted.get("title") or "Memory note",
        "transcript": transcript, "source": source, "location": location,
        "simple_summary": extracted.get("simple_summary", ""),
        "timeline": extracted.get("timeline") or _bucket_now(),
        "people_mentioned": extracted.get("people", []),
        "places_mentioned": extracted.get("places", []),
        "medication_detected": extracted.get("medications", []),
        "appointment_detected": extracted.get("appointments", []),
        "tasks_detected": extracted.get("reminders", []),
        "caregiver_notes": extracted.get("caregiver_notes", []),
        "created_at": now,
    }
    await db.memories.insert_one(memory)
    for r in extracted.get("reminders", []):
        await db.reminders.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": by_user_id,
            "title": r.get("title", "Reminder"), "description": "",
            "category": r.get("category", "custom"), "priority": r.get("priority", "medium"),
            "due_date": "", "due_time": "", "repeat_rule": "none",
            "status": "pending", "source": "ai", "created_at": now, "completed_at": None,
        })
    await _log(by_user_id, "create_memory", "memory", mem_id)
    return {k: v for k, v in memory.items() if k != "_id"}


@router.post("/memories")
async def create_memory(body: MemoryCreate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Please add some text before saving.")
    return await save_memory_for_patient(
        pid, body.transcript, title=body.title, source=body.source, location=body.location,
        by_user_id=user["id"], by_role=user["role"])


@router.get("/memories")
async def list_memories(today: bool = False, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    memories = await _list("memories", pid)
    if today:
        d = date.today().isoformat()
        memories = [m for m in memories if (m.get("created_at") or "").startswith(d)]
    return memories


@router.post("/memories/transcribe")
async def transcribe(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    await patient_id_for(user)
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Recording is too large (max 25MB).")
    if not data:
        raise HTTPException(status_code=400, detail="The recording was empty. Please try again or type instead.")
    # Initialise before all code paths so the response can never reference an undefined value.
    text = ""
    try:
        text = await ai.transcribe_audio(data, file.filename or "audio.webm")
    except Exception as e:
        print(f"[transcribe] {e}")
        raise HTTPException(status_code=500, detail="Could not transcribe the audio. Please try again or type instead.")
    if not (text or "").strip():
        raise HTTPException(status_code=502, detail="No words were detected. Please try again or type instead.")
    return {"transcript": text}


# ---------------- reminders ----------------
class ReminderCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    category: str = "custom"
    priority: str = "medium"
    due_date: Optional[str] = ""
    due_time: Optional[str] = ""
    repeat_rule: str = "none"


class ReminderUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None


@router.get("/reminders")
async def list_reminders(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await _list("reminders", pid)


@router.post("/reminders")
async def create_reminder(body: ReminderCreate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    source = "caregiver" if user["role"] == "caregiver" else "patient"
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
           **body.model_dump(), "status": "pending", "source": source,
           "created_at": NOW(), "completed_at": None}
    await db.reminders.insert_one(doc)
    await _log(user["id"], "create_reminder", "reminder", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


@router.patch("/reminders/{rid}")
async def update_reminder(rid: str, body: ReminderUpdate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.status == "done":
        update["completed_at"] = NOW()
    res = await db.reminders.update_one({"id": rid, "patient_id": pid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found.")
    return await db.reminders.find_one({"id": rid}, PROJ)


@router.delete("/reminders/{rid}")
async def delete_reminder(rid: str, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    await db.reminders.delete_one({"id": rid, "patient_id": pid})
    return {"ok": True}


# ---------------- medications ----------------
class MedicationCreate(BaseModel):
    medication_name: str
    dosage: Optional[str] = ""
    frequency: Optional[str] = ""
    time_of_day: str = "morning"  # morning|afternoon|evening|night
    instructions: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    notes: Optional[str] = ""
    priority: str = "medium"


@router.get("/medications")
async def list_medications(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await _list("medications", pid)


@router.post("/medications")
async def create_medication(body: MedicationCreate, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
           **body.model_dump(), "created_at": NOW()}
    await db.medications.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/medications/{mid}")
async def delete_medication(mid: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await db.medications.delete_one({"id": mid, "patient_id": pid})
    return {"ok": True}


# ---------------- appointments ----------------
class AppointmentCreate(BaseModel):
    title: str
    doctor_or_clinic: Optional[str] = ""
    date: Optional[str] = ""
    time: Optional[str] = ""
    location: Optional[str] = ""
    notes: Optional[str] = ""
    transport_notes: Optional[str] = ""
    reminder_time: Optional[str] = ""
    ignore_duplicate_warning: bool = False


@router.get("/appointments")
async def list_appointments(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await _list("appointments", pid)


@router.post("/appointments")
async def create_appointment(body: AppointmentCreate, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    if not body.ignore_duplicate_warning and body.title and body.date:
        candidate = {
            "title": body.title, "date": body.date or "",
            "time": body.time or "", "location": body.location or "",
        }
        matches = await _find_duplicate_appointments(pid, candidate)
        if matches:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "This looks similar to an existing appointment.",
                    "duplicate_risk": True,
                    "matches": _serialize_dup_matches(matches),
                },
            )
    fields = body.model_dump()
    fields.pop("ignore_duplicate_warning", None)
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
           **fields, "created_at": NOW()}
    await db.appointments.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


class DraftAiBody(BaseModel):
    raw_text: str = ""
    conversation: Optional[List[dict]] = None
    timezone: Optional[str] = None


@router.post("/appointments/draft-ai")
async def appointment_draft_ai(
    body: DraftAiBody,
    user: dict = Depends(require_role("caregiver", "admin")),
):
    """Parse natural language into a reviewable appointment draft. Does NOT write to DB."""
    if not body.raw_text.strip() and not body.conversation:
        raise HTTPException(status_code=400, detail="Please describe the appointment.")
    pid = await patient_id_for(user)
    from gcal import _resolve_tz, _resolve_tz_value
    tz = _resolve_tz_value(body.timezone) if body.timezone else await _resolve_tz(pid, user)
    now_local = datetime.now(ZoneInfo(tz))
    result = await appointment_ai.draft_appointment(
        body.raw_text.strip(),
        now_local.date().isoformat(),
        tz,
        body.conversation,
    )
    await usage.record(pid, "appointment_draft", in_chars=len(body.raw_text), out_chars=200, tier="cheap")
    return result


class CheckApptDuplicateBody(BaseModel):
    title: str
    date: Optional[str] = ""
    time: Optional[str] = ""
    location: Optional[str] = ""
    appointment_id: Optional[str] = None


@router.post("/appointments/check-duplicate")
async def check_appointment_duplicate(
    body: CheckApptDuplicateBody,
    user: dict = Depends(require_role("caregiver", "admin")),
):
    pid = await patient_id_for(user)
    candidate = {
        "title": body.title,
        "date": body.date or "",
        "time": body.time or "",
        "location": body.location or "",
    }
    matches = await _find_duplicate_appointments(pid, candidate, body.appointment_id)
    return {"duplicate_risk": len(matches) > 0, "matches": _serialize_dup_matches(matches)}


class CreateFromDraftBody(BaseModel):
    title: str
    date: str
    time: Optional[str] = ""
    end_time: Optional[str] = ""
    all_day: bool = False
    location: Optional[str] = ""
    notes: Optional[str] = ""
    reminder_time: Optional[str] = ""
    doctor_or_clinic: Optional[str] = ""
    add_to_google: bool = False
    online_meeting: bool = False
    attendees: Optional[List[str]] = None
    ignore_duplicate_warning: bool = False
    update_existing_id: Optional[str] = None


@router.post("/appointments/create-from-draft")
async def create_appointment_from_draft(
    body: CreateFromDraftBody,
    user: dict = Depends(require_role("caregiver", "admin")),
):
    """Create appointment only after user confirmation. Optionally adds to Google Calendar."""
    pid = await patient_id_for(user)
    candidate = {
        "title": body.title,
        "date": body.date,
        "time": body.time or "",
        "location": body.location or "",
    }
    if body.update_existing_id:
        existing = await db.appointments.find_one(
            {"id": body.update_existing_id, "patient_id": pid}, PROJ,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Appointment not found.")
        updates = {
            "title": body.title,
            "date": body.date,
            "time": body.time or "",
            "location": body.location or "",
            "notes": body.notes or "",
            "reminder_time": body.reminder_time or "",
            "doctor_or_clinic": body.doctor_or_clinic or "",
            "updated_at": NOW(),
        }
        await db.appointments.update_one({"id": body.update_existing_id}, {"$set": updates})
        appt = await db.appointments.find_one({"id": body.update_existing_id}, PROJ)
    else:
        if not body.ignore_duplicate_warning:
            matches = await _find_duplicate_appointments(pid, candidate)
            if matches:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "This looks similar to an existing appointment.",
                        "duplicate_risk": True,
                        "matches": _serialize_dup_matches(matches),
                    },
                )
        appt = {
            "id": str(uuid.uuid4()),
            "patient_id": pid,
            "created_by_user_id": user["id"],
            "title": body.title,
            "doctor_or_clinic": body.doctor_or_clinic or "",
            "date": body.date,
            "time": body.time or "",
            "location": body.location or "",
            "notes": body.notes or "Created from AI draft",
            "transport_notes": "",
            "reminder_time": body.reminder_time or "",
            "source": "ai_draft",
            "created_at": NOW(),
        }
        await db.appointments.insert_one(appt)
        if body.reminder_time:
            await db.reminders.insert_one({
                "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
                "title": body.title, "description": body.reminder_time,
                "category": "appointment", "priority": "medium",
                "due_date": body.date, "due_time": body.time or "",
                "repeat_rule": "none", "status": "pending",
                "source": "ai_draft", "created_at": NOW(), "completed_at": None,
            })

    google_result = None
    if body.add_to_google:
        from gcal import add_event, AddEventBody, _connected_link
        try:
            await _connected_link(user)
        except HTTPException:
            raise HTTPException(
                status_code=400,
                detail="Connect Google Calendar to add this appointment to Google.",
            )
        google_result = await add_event(
            AddEventBody(
                appointment_id=appt["id"],
                online_meeting=body.online_meeting,
                meeting_provider="google_meet" if body.online_meeting else None,
                attendees=body.attendees,
                source="ai_draft",
                ignore_duplicate_warning=True,
            ),
            user,
        )

    return {
        "ok": True,
        "appointment": {k: v for k, v in appt.items() if k != "_id"},
        "google": google_result,
    }


class AppointmentUpdate(BaseModel):
    title: Optional[str] = None
    doctor_or_clinic: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    transport_notes: Optional[str] = None
    reminder_time: Optional[str] = None
    status: Optional[str] = None
    calendar_archived: Optional[bool] = None
    dedup_exempt: Optional[bool] = None


async def _appointment_not_dup_fps(pid: str) -> set[str]:
    rows = await db.appointment_dedup_state.find({"patient_id": pid}, PROJ).to_list(500)
    return {r.get("fingerprint", "") for r in rows if r.get("status") == "not_duplicate" and r.get("fingerprint")}


async def _find_duplicate_appointments(
    pid: str, candidate: dict, exclude_id: str | None = None,
) -> list[dict]:
    appointments = await db.appointments.find({"patient_id": pid}, PROJ).to_list(500)
    return duph.find_duplicate_matches(candidate, appointments, exclude_id)


def _serialize_dup_matches(matches: list[dict]) -> list[dict]:
    return duph.serialize_matches(matches)


@router.get("/appointments/dashboard")
async def appointments_dashboard(
    include_archived: bool = False,
    user: dict = Depends(require_role("caregiver", "admin")),
):
    """Grouped appointments with urgency, dedup, and summary counts."""
    pid = await patient_id_for(user)
    from gcal import _resolve_tz  # lazy: avoid routes ↔ gcal circular import
    tz = await _resolve_tz(pid, user)
    now = datetime.now(ZoneInfo(tz))
    appointments = await db.appointments.find({"patient_id": pid}, PROJ).to_list(500)
    not_dup_fps = await _appointment_not_dup_fps(pid)
    return apdash.build_dashboard(appointments, not_dup_fps, now, tz, include_archived=include_archived)


class AppointmentArchiveBody(BaseModel):
    appointment_id: str
    archive: bool = True


@router.post("/appointments/archive")
async def archive_appointment_route(
    body: AppointmentArchiveBody,
    user: dict = Depends(require_role("caregiver", "admin")),
):
    """Archive appointment from active list (does not delete Google Calendar events)."""
    pid = await patient_id_for(user)
    appt = await db.appointments.find_one({"id": body.appointment_id, "patient_id": pid}, PROJ)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    await db.appointments.update_one(
        {"id": body.appointment_id},
        {"$set": {"calendar_archived": bool(body.archive), "calendar_archived_at": NOW()}},
    )
    return {"ok": True, "calendar_archived": bool(body.archive)}


class MeetingContextBody(BaseModel):
    location_text: str = ""
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    notes: Optional[str] = ""
    people_present: Optional[str] = ""
    confirmed: bool = False
    location_coords: Optional[dict] = None  # {lat, lng} only after user confirms


@router.post("/appointments/{appointment_id}/meeting-context")
async def save_meeting_context(
    appointment_id: str,
    body: MeetingContextBody,
    user: dict = Depends(require_role("caregiver", "admin")),
):
    """Save optional location context as a memory linked to an appointment (confirmation required)."""
    if not body.confirmed:
        raise HTTPException(status_code=400, detail="Please confirm before saving location context.")
    pid = await patient_id_for(user)
    appt = await db.appointments.find_one({"id": appointment_id, "patient_id": pid}, PROJ)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    loc = (body.location_text or "").strip()
    if body.location_coords and isinstance(body.location_coords, dict):
        lat, lng = body.location_coords.get("lat"), body.location_coords.get("lng")
        if lat is not None and lng is not None:
            loc = loc or f"Coordinates ({lat}, {lng})"
    parts = [f"Meeting note: {appt.get('title', 'Appointment')}"]
    if loc:
        parts.append(f"at {loc}")
    if body.started_at or body.ended_at:
        parts.append(f"from {body.started_at or '—'} to {body.ended_at or '—'}")
    if body.people_present:
        parts.append(f"with {body.people_present}")
    if body.notes:
        parts.append(f"Notes: {body.notes}")
    transcript = ". ".join(parts)
    location_payload = None
    if body.location_coords and body.confirmed:
        location_payload = {
            "lat": body.location_coords.get("lat"),
            "lng": body.location_coords.get("lng"),
            "label": loc or "Saved location context",
        }
    elif loc:
        location_payload = {"label": loc}
    memory = await save_memory_for_patient(
        pid, transcript, title=f"Meeting note: {appt.get('title', '')}",
        source="meeting_note", location=location_payload,
        by_user_id=user["id"], by_role=user["role"],
    )
    if loc and not appt.get("location"):
        await db.appointments.update_one(
            {"id": appointment_id},
            {"$set": {"location": loc, "updated_at": NOW()}},
        )
    await db.memories.update_one(
        {"id": memory["id"]},
        {"$set": {"linked_appointment_id": appointment_id}},
    )
    return {"ok": True, "memory_id": memory["id"], "message": "Saved location context"}


@router.post("/appointments/archive-duplicates")
async def archive_duplicate_appointments(user: dict = Depends(require_role("caregiver", "admin"))):
    """Archive repeated MemoryMate-only duplicate appointments (never touches Google events)."""
    pid = await patient_id_for(user)
    appointments = await db.appointments.find({"patient_id": pid}, PROJ).to_list(500)
    not_dup_fps = await _appointment_not_dup_fps(pid)
    to_archive = apdash.find_archiveable_duplicates(appointments, not_dup_fps)
    ids = [a["id"] for a in to_archive]
    if ids:
        await db.appointments.update_many(
            {"id": {"$in": ids}, "patient_id": pid},
            {"$set": {"calendar_archived": True, "calendar_archived_at": NOW(), "archived_reason": "duplicate"}},
        )
    return {"ok": True, "archived_count": len(ids), "archived_ids": ids}


class AppointmentDedupBody(BaseModel):
    fingerprint: str
    appointment_id: Optional[str] = None


@router.post("/appointments/mark-not-duplicate")
async def mark_appointment_not_duplicate(
    body: AppointmentDedupBody,
    user: dict = Depends(require_role("caregiver", "admin")),
):
    pid = await patient_id_for(user)
    fp = (body.fingerprint or "").strip()
    if not fp:
        raise HTTPException(status_code=400, detail="fingerprint is required.")
    await db.appointment_dedup_state.update_one(
        {"patient_id": pid, "fingerprint": fp},
        {
            "$set": {
                "patient_id": pid,
                "fingerprint": fp,
                "status": "not_duplicate",
                "appointment_id": body.appointment_id,
                "updated_at": NOW(),
            },
            "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": NOW()},
        },
        upsert=True,
    )
    if body.appointment_id:
        await db.appointments.update_one(
            {"id": body.appointment_id, "patient_id": pid},
            {"$set": {"dedup_exempt": True}},
        )
    return {"ok": True}


@router.patch("/appointments/{aid}")
async def update_appointment(aid: str, body: AppointmentUpdate, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    if updates.get("status") == "completed":
        updates["completed_at"] = NOW()
    result = await db.appointments.update_one(
        {"id": aid, "patient_id": pid},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    doc = await db.appointments.find_one({"id": aid, "patient_id": pid}, PROJ)
    return doc


@router.post("/appointments/{aid}/complete")
async def complete_appointment(aid: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    result = await db.appointments.update_one(
        {"id": aid, "patient_id": pid},
        {"$set": {"status": "completed", "completed_at": NOW()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    return {"ok": True, "status": "completed"}


@router.delete("/appointments/{aid}")
async def delete_appointment(aid: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await db.appointments.delete_one({"id": aid, "patient_id": pid})
    return {"ok": True}


# ---------------- important people ----------------
class PersonCreate(BaseModel):
    name: str
    relationship: Optional[str] = ""
    photo_url: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = ""
    explanation_for_patient: Optional[str] = ""
    notes: Optional[str] = ""


@router.get("/people")
async def list_people(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await db.important_people.find({"patient_id": pid}, PROJ).sort("name", 1).to_list(500)


@router.post("/people")
async def create_person(body: PersonCreate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
           **body.model_dump(), "last_mentioned": None, "created_at": NOW()}
    await db.important_people.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.post("/people/{person_id}/explain")
async def explain_person(person_id: str, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    p = await db.important_people.find_one({"id": person_id, "patient_id": pid}, PROJ)
    if not p:
        raise HTTPException(status_code=404, detail="Person not found.")
    text = await ai.explain_person(p["name"], p.get("relationship", ""),
                                   p.get("description", ""), p.get("explanation_for_patient", ""))
    return {"explanation": text}


@router.delete("/people/{person_id}")
async def delete_person(person_id: str, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    await db.important_people.delete_one({"id": person_id, "patient_id": pid})
    return {"ok": True}


# ---------------- memory book ----------------
class MemoryBookCreate(BaseModel):
    title: str
    relationship: Optional[str] = ""
    photo_url: Optional[str] = None
    story: Optional[str] = ""
    category: Optional[str] = "person"  # person | place | event | fact
    facts: Optional[List[str]] = None


@router.get("/memory-book")
async def list_memory_book(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await db.memory_book.find({"patient_id": pid}, PROJ).sort("created_at", -1).to_list(500)


@router.post("/memory-book")
async def create_memory_book(body: MemoryBookCreate, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="A title is required.")
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
           "title": body.title.strip(), "relationship": body.relationship or "",
           "photo_url": body.photo_url, "story": body.story or "",
           "category": body.category or "person", "facts": body.facts or [], "created_at": NOW()}
    await db.memory_book.insert_one(doc)
    await _log(user["id"], "create_memory_book", "memory_book", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/memory-book/{entry_id}")
async def delete_memory_book(entry_id: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await db.memory_book.delete_one({"id": entry_id, "patient_id": pid})
    return {"ok": True}


# ---------------- family circle ----------------
CIRCLE_ROLES = {"primary", "family", "viewer", "medical"}
PERMISSION_LEVELS = {"full", "edit", "view"}


class FamilyInvite(BaseModel):
    email: EmailStr
    full_name: Optional[str] = ""
    relationship: Optional[str] = "Family"
    circle_role: Optional[str] = "family"
    permissions: Optional[str] = "view"


async def _my_link(user: dict, pid: str) -> Optional[dict]:
    return await db.patient_caregiver_links.find_one({"patient_id": pid, "caregiver_id": user["id"]}, PROJ)


async def assert_circle_admin(user: dict, pid: str) -> None:
    if user["role"] == "admin":
        return
    link = await _my_link(user, pid)
    if not link or link.get("permissions") != "full":
        raise HTTPException(status_code=403, detail="Only a primary caregiver can manage the family circle.")


@router.get("/family")
async def list_family(user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    links = await db.patient_caregiver_links.find({"patient_id": pid}, PROJ).to_list(200)
    members = []
    for l in links:
        cg = await db.users.find_one({"id": l["caregiver_id"]}, {"_id": 0, "password_hash": 0})
        members.append({
            "link_id": l["id"], "user_id": l["caregiver_id"],
            "full_name": (cg or {}).get("full_name") or l.get("full_name", ""),
            "email": (cg or {}).get("email", ""),
            "phone": (cg or {}).get("phone"),
            "relationship": l.get("relationship", ""),
            "circle_role": l.get("circle_role", "family"),
            "permissions": l.get("permissions", "view"),
            "is_self": l["caregiver_id"] == user["id"],
        })
    invites = await db.family_invites.find({"patient_id": pid, "status": "pending"}, PROJ).to_list(200)
    mine = await _my_link(user, pid)
    my_perms = "full" if user["role"] == "admin" else (mine or {}).get("permissions", "view")
    return {"members": members, "invites": invites, "my_permissions": my_perms}


@router.post("/family/invite")
async def invite_family(body: FamilyInvite, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await assert_circle_admin(user, pid)
    email = body.email.lower().strip()
    circle_role = body.circle_role if body.circle_role in CIRCLE_ROLES else "family"
    permissions = body.permissions if body.permissions in PERMISSION_LEVELS else "view"
    existing = await db.users.find_one({"email": email})
    if existing:
        if await db.patient_caregiver_links.find_one({"patient_id": pid, "caregiver_id": existing["id"]}):
            raise HTTPException(status_code=400, detail="This person is already in the family circle.")
        link = {"id": str(uuid.uuid4()), "patient_id": pid, "caregiver_id": existing["id"],
                "relationship": body.relationship or "Family", "circle_role": circle_role,
                "permissions": permissions, "created_at": NOW()}
        await db.patient_caregiver_links.insert_one(link)
        await _log(user["id"], "family_link", "patient_caregiver_link", link["id"], email)
        return {"linked": True, "member": {"full_name": existing["full_name"], "email": email}}
    inv = {"id": str(uuid.uuid4()), "patient_id": pid, "email": email,
           "full_name": body.full_name or "", "relationship": body.relationship or "Family",
           "circle_role": circle_role, "permissions": permissions,
           "status": "pending", "invited_by": user["id"], "created_at": NOW()}
    await db.family_invites.update_one(
        {"patient_id": pid, "email": email},
        {"$set": inv}, upsert=True)
    await _log(user["id"], "family_invite", "family_invite", inv["id"], email)
    return {"linked": False, "invite": {k: v for k, v in inv.items() if k != "_id"}}


@router.delete("/family/invite/{invite_id}")
async def cancel_family_invite(invite_id: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await assert_circle_admin(user, pid)
    await db.family_invites.delete_one({"id": invite_id, "patient_id": pid})
    return {"ok": True}


@router.delete("/family/{link_id}")
async def remove_family_member(link_id: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await assert_circle_admin(user, pid)
    link = await db.patient_caregiver_links.find_one({"id": link_id, "patient_id": pid}, PROJ)
    if not link:
        raise HTTPException(status_code=404, detail="Family member not found.")
    full_count = await db.patient_caregiver_links.count_documents({"patient_id": pid, "permissions": "full"})
    if link.get("permissions") == "full" and full_count <= 1:
        raise HTTPException(status_code=400, detail="You cannot remove the last primary caregiver.")
    await db.patient_caregiver_links.delete_one({"id": link_id, "patient_id": pid})
    await _log(user["id"], "family_unlink", "patient_caregiver_link", link_id)
    return {"ok": True}


# ---------------- important places ----------------
class PlaceCreate(BaseModel):
    name: str
    type: Optional[str] = "custom"
    address: Optional[str] = ""
    description: Optional[str] = ""
    instructions: Optional[str] = ""
    notes: Optional[str] = ""


@router.get("/places")
async def list_places(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await db.important_places.find({"patient_id": pid}, PROJ).sort("name", 1).to_list(500)


@router.post("/places")
async def create_place(body: PlaceCreate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
           **body.model_dump(), "created_at": NOW()}
    await db.important_places.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/places/{place_id}")
async def delete_place(place_id: str, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    await db.important_places.delete_one({"id": place_id, "patient_id": pid})
    return {"ok": True}


# ---------------- caregiver notes ----------------
class NoteCreate(BaseModel):
    note_text: str
    visible_to_patient: bool = True


@router.get("/notes")
async def list_notes(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    notes = await _list("caregiver_notes", pid)
    if user["role"] == "patient":
        notes = [n for n in notes if n.get("visible_to_patient", True)]
    return notes


@router.post("/notes")
async def create_note(body: NoteCreate, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "caregiver_id": user["id"],
           "note_text": body.note_text, "visible_to_patient": body.visible_to_patient,
           "created_at": NOW()}
    await db.caregiver_notes.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await db.caregiver_notes.delete_one({"id": note_id, "patient_id": pid})
    return {"ok": True}


# ---------------- alerts ----------------
class AlertCreate(BaseModel):
    alert_type: str
    message: str
    priority: str = "medium"


@router.get("/alerts")
async def list_alerts(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await _list("alerts", pid)


@router.post("/alerts")
async def create_alert(body: AlertCreate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "caregiver_id": None,
           **body.model_dump(), "status": "open", "created_at": NOW(), "resolved_at": None}
    await db.alerts.insert_one(doc)
    await _log(user["id"], "create_alert", "alert", doc["id"], body.alert_type)
    try:
        import notifications
        await notifications.notify_caregivers(pid, "caregiver_alerts", {
            "title": "MemoryMate alert", "body": body.message[:160],
            "url": "/caregiver/alerts", "tag": f"alert-{doc['id']}", "kind": "alert",
        })
    except Exception:  # noqa: BLE001 — notifications must never break alert creation
        pass
    return {k: v for k, v in doc.items() if k != "_id"}


@router.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await db.alerts.update_one({"id": alert_id, "patient_id": pid},
                               {"$set": {"status": "resolved", "resolved_at": NOW()}})
    return await db.alerts.find_one({"id": alert_id}, PROJ)


# ---------------- chat assistant ----------------
class ChatMessage(BaseModel):
    message: str


async def _build_context(pid: str) -> str:
    people = await db.important_people.find({"patient_id": pid}, PROJ).to_list(200)
    places = await db.important_places.find({"patient_id": pid}, PROJ).to_list(200)
    reminders = await db.reminders.find({"patient_id": pid}, PROJ).to_list(200)
    meds = await db.medications.find({"patient_id": pid}, PROJ).to_list(200)
    appts = await db.appointments.find({"patient_id": pid}, PROJ).to_list(200)
    notes = await db.caregiver_notes.find({"patient_id": pid, "visible_to_patient": True}, PROJ).to_list(200)
    patient = await db.patients.find_one({"id": pid}, PROJ)
    today = date.today().isoformat()
    memories = await db.memories.find({"patient_id": pid}, PROJ).sort("created_at", -1).to_list(20)

    lines = [f"Today's date: {today}."]
    if patient:
        lines.append(f"Patient name: {patient['full_name']}.")
        if patient.get("emergency_contact_name"):
            lines.append(f"Emergency contact: {patient['emergency_contact_name']} ({patient.get('emergency_contact_phone','')}).")
    lines.append("\nImportant people:")
    for p in people:
        lines.append(f"- {p['name']} ({p.get('relationship','')}): {p.get('explanation_for_patient') or p.get('description','')}")
    lines.append("\nImportant places:")
    for p in places:
        lines.append(f"- {p['name']} ({p.get('type','')}): {p.get('description','')}")
    lines.append("\nReminders:")
    for r in reminders:
        lines.append(f"- {r['title']} [{r['status']}] {r.get('due_date','')} {r.get('due_time','')} ({r.get('category','')})")
    lines.append("\nMedications (added by caregiver):")
    for m in meds:
        lines.append(f"- {m['medication_name']} {m.get('dosage','')} at {m.get('time_of_day','')}: {m.get('instructions','')}")
    lines.append("\nAppointments:")
    for a in appts:
        lines.append(f"- {a['title']} with {a.get('doctor_or_clinic','')} on {a.get('date','')} {a.get('time','')} at {a.get('location','')}")
    lines.append("\nNotes from caregiver:")
    for n in notes:
        lines.append(f"- {n['note_text']}")
    lines.append("\nRecent memories:")
    for m in memories:
        lines.append(f"- ({m.get('created_at','')[:10]}) {m.get('simple_summary','')}")
    return "\n".join(lines)


@router.get("/chat")
async def chat_history(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await db.chat_messages.find({"patient_id": pid}, PROJ).sort("created_at", 1).to_list(200)


@router.post("/chat")
async def chat_send(body: ChatMessage, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    now = NOW()
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "user_id": user["id"],
        "role": "user", "message": body.message, "created_at": now})
    history = await db.chat_messages.find({"patient_id": pid}, PROJ).sort("created_at", 1).to_list(50)
    context = await _build_context(pid)
    await usage.assert_within_cap(pid)
    _sdoc = await db.audio_settings.find_one({"patient_id": pid}, {"_id": 0, "reminder_tone": 1}) or {}
    answer = await ai.answer_question(context, history, body.message, tone=_sdoc.get("reminder_tone"))
    await usage.record(pid, "assistant", in_chars=len(context) + len(body.message), out_chars=len(answer), tier="primary")
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "user_id": user["id"],
        "role": "assistant", "message": answer, "created_at": NOW()})
    return {"answer": answer}


# ---------------- AI usage ----------------
@router.get("/usage/today")
async def usage_today(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await usage.usage_summary(pid)


# ---------------- today's summary ----------------
@router.get("/summary/today")
async def summary_today(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    today = date.today().isoformat()
    memories = [m for m in await _list("memories", pid) if (m.get("created_at") or "").startswith(today)]
    reminders = await _list("reminders", pid)
    notes = await _list("caregiver_notes", pid)
    if user["role"] == "patient":
        notes = [n for n in notes if n.get("visible_to_patient", True)]
    appts = await _list("appointments", pid)
    buckets = {"morning": [], "afternoon": [], "evening": []}
    for m in memories:
        buckets.get(m.get("timeline", "afternoon"), buckets["afternoon"]).append(m)
    people, places, meds = [], [], []
    for m in memories:
        people += m.get("people_mentioned", [])
        places += m.get("places_mentioned", [])
        meds += m.get("medication_detected", [])
    return {
        "date": today, "timeline": buckets,
        "people": people, "places": places, "medications": meds,
        "reminders_today": [r for r in reminders if r.get("status") in ("pending", "missed")][:10],
        "notes": notes[:10], "appointments": appts[:10],
        "has_data": len(memories) > 0,
    }


@router.post("/caregiver/summary")
async def gen_caregiver_summary(user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    context = await _build_context(pid)
    await usage.assert_within_cap(pid)
    text = await ai.caregiver_summary(context)
    await usage.record(pid, "caregiver_summary", in_chars=len(context), out_chars=len(text), tier="primary")
    return {"summary": text}


# ---------------- admin ----------------
@router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_role("admin"))):
    return {
        "total_users": await db.users.count_documents({}),
        "total_patients": await db.users.count_documents({"role": "patient"}),
        "total_caregivers": await db.users.count_documents({"role": "caregiver"}),
        "total_memories": await db.memories.count_documents({}),
        "total_reminders": await db.reminders.count_documents({}),
        "total_alerts": await db.alerts.count_documents({}),
        "recent_signups": await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(5),
    }


@router.get("/admin/users")
async def admin_users(user: dict = Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)


class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.patch("/admin/users/{uid}")
async def admin_update_user(uid: str, body: AdminUserUpdate, user: dict = Depends(require_role("admin"))):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": uid}, {"$set": update})
        await _log(user["id"], "admin_update_user", "user", uid, str(update))
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.get("/admin/logs")
async def admin_logs(user: dict = Depends(require_role("admin"))):
    return await db.activity_logs.find({}, PROJ).sort("created_at", -1).to_list(200)


@router.get("/admin/collection/{name}")
async def admin_collection(name: str, user: dict = Depends(require_role("admin"))):
    allowed = {"patients", "reminders", "alerts", "memories", "appointments", "medications"}
    if name not in allowed:
        raise HTTPException(status_code=400, detail="Collection not allowed.")
    return await db[name].find({}, PROJ).sort("created_at", -1).to_list(500)
