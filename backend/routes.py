"""All application routes (memories, reminders, medications, appointments, people,
places, notes, alerts, chat, summaries, patient profile, admin)."""
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from db import db
from auth import get_current_user, require_role, _log
import ai

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


def _bucket_now() -> str:
    h = datetime.now(timezone.utc).hour
    return "morning" if h < 12 else "afternoon" if h < 18 else "evening"


@router.post("/memories")
async def create_memory(body: MemoryCreate, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Please add some text before saving.")
    extracted = await ai.process_transcript(body.transcript)
    now = NOW()
    mem_id = str(uuid.uuid4())
    memory = {
        "id": mem_id, "patient_id": pid,
        "created_by_user_id": user["id"], "created_by_role": user["role"],
        "title": body.title or extracted.get("title") or "Memory note",
        "transcript": body.transcript, "source": body.source,
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

    # Auto-create reminders from extraction
    for r in extracted.get("reminders", []):
        await db.reminders.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
            "title": r.get("title", "Reminder"), "description": "",
            "category": r.get("category", "custom"), "priority": r.get("priority", "medium"),
            "due_date": "", "due_time": "", "repeat_rule": "none",
            "status": "pending", "source": "ai", "created_at": now, "completed_at": None,
        })
    await _log(user["id"], "create_memory", "memory", mem_id)
    return {k: v for k, v in memory.items() if k != "_id"}


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


@router.get("/appointments")
async def list_appointments(user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    return await _list("appointments", pid)


@router.post("/appointments")
async def create_appointment(body: AppointmentCreate, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    doc = {"id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
           **body.model_dump(), "created_at": NOW()}
    await db.appointments.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


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
    answer = await ai.answer_question(context, history, body.message)
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "user_id": user["id"],
        "role": "assistant", "message": answer, "created_at": NOW()})
    return {"answer": answer}


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
    text = await ai.caregiver_summary(context)
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
