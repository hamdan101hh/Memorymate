"""Idempotent seeding of admin + demo accounts + sample patient data."""
import os
import uuid
from datetime import datetime, timezone, date, timedelta
from db import db
from auth import hash_password

NOW = lambda: datetime.now(timezone.utc).isoformat()


async def _ensure_user(email, full_name, password, role, **extra):
    existing = await db.users.find_one({"email": email})
    if existing:
        # keep password in sync with the seed so demo logins always work
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
        return existing["id"]
    uid = str(uuid.uuid4())
    await db.users.insert_one({
        "id": uid, "full_name": full_name, "email": email,
        "password_hash": hash_password(password), "role": role,
        "phone": extra.get("phone"), "emergency_contact_name": extra.get("ec_name"),
        "emergency_contact_phone": extra.get("ec_phone"),
        "consent_accepted": True, "is_active": True,
        "onboarding_completed": True, "created_at": NOW(), "updated_at": NOW(),
    })
    return uid


async def seed():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@memorymate.app")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    await _ensure_user(admin_email, "MemoryMate Admin", admin_password, "admin")

    patient_uid = await _ensure_user(
        "omar@memorymate.app", "Omar Ahmed", "Patient123!", "patient",
        phone="+1 555 0100", ec_name="Sarah Ahmed", ec_phone="+1 555 0142")
    caregiver_uid = await _ensure_user(
        "sarah@memorymate.app", "Sarah Ahmed", "Caregiver123!", "caregiver",
        phone="+1 555 0142")

    # Only seed sample content once (detect by patient profile presence)
    patient = await db.patients.find_one({"user_id": patient_uid})
    if patient:
        return  # already seeded

    pid = str(uuid.uuid4())
    await db.patients.insert_one({
        "id": pid, "user_id": patient_uid, "full_name": "Omar Ahmed", "age": 72,
        "emergency_contact_name": "Sarah Ahmed", "emergency_contact_phone": "+1 555 0142",
        "notes": "Enjoys tea in the afternoon. Reads the newspaper every morning.",
        "created_at": NOW(),
    })
    await db.patient_caregiver_links.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "caregiver_id": caregiver_uid,
        "relationship": "Daughter", "permissions": "full", "created_at": NOW(),
    })

    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    people = [
        ("Sarah Ahmed", "Daughter", "Sarah visits often and helps with appointments.",
         "Sarah is your daughter. She visits you often and helps with your appointments.", "+1 555 0142"),
        ("Ahmed Khan", "Son", "Ahmed calls every evening to check on you.",
         "Ahmed is your son. He calls you every evening.", "+1 555 0188"),
        ("Dr. Faisal", "Doctor", "Dr. Faisal is the family doctor at City Clinic.",
         "Dr. Faisal is your doctor. He takes care of your health at City Clinic.", "+1 555 0170"),
    ]
    for name, rel, desc, expl, phone in people:
        await db.important_people.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": caregiver_uid,
            "name": name, "relationship": rel, "photo_url": None, "phone": phone,
            "description": desc, "explanation_for_patient": expl, "notes": "",
            "last_mentioned": today, "created_at": NOW(),
        })

    places = [
        ("Home", "home", "Your home where you live.", ""),
        ("City Clinic", "clinic", "This is where you go for doctor appointments.", "Sarah usually drives you here."),
        ("Al Noor Pharmacy", "pharmacy", "Where you collect your medicine.", ""),
        ("Local Mosque", "mosque", "Where you go for prayers.", ""),
    ]
    for name, ptype, desc, instr in places:
        await db.important_places.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": caregiver_uid,
            "name": name, "type": ptype, "address": "", "description": desc,
            "instructions": instr, "notes": "", "created_at": NOW(),
        })

    reminders = [
        ("Take morning medicine", "Blood pressure medicine", "medication", "high", today, "09:00"),
        ("Call Sarah", "Give your daughter a call", "family", "medium", today, "17:00"),
        ("Doctor appointment", "Visit Dr. Faisal at City Clinic", "appointment", "high", tomorrow, "15:00"),
    ]
    for title, desc, cat, prio, dd, dt in reminders:
        await db.reminders.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": caregiver_uid,
            "title": title, "description": desc, "category": cat, "priority": prio,
            "due_date": dd, "due_time": dt, "repeat_rule": "none",
            "status": "pending", "source": "caregiver", "created_at": NOW(), "completed_at": None,
        })

    await db.medications.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": caregiver_uid,
        "medication_name": "Blood Pressure Medicine", "dosage": "1 tablet", "frequency": "Daily",
        "time_of_day": "morning", "instructions": "Take after breakfast with water.",
        "start_date": today, "end_date": "", "notes": "Confirmed with Dr. Faisal.",
        "priority": "high", "created_at": NOW(),
    })

    await db.appointments.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": caregiver_uid,
        "title": "Doctor Appointment", "doctor_or_clinic": "Dr. Faisal - City Clinic",
        "date": tomorrow, "time": "15:00", "location": "City Clinic",
        "notes": "Regular check-up.", "transport_notes": "Sarah will drive.",
        "reminder_time": "1 hour before", "created_at": NOW(),
    })

    await db.caregiver_notes.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "caregiver_id": caregiver_uid,
        "note_text": "Dad, I will visit you at 5 PM today. Love, Sarah.",
        "visible_to_patient": True, "created_at": NOW(),
    })

    await db.memories.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": patient_uid,
        "created_by_role": "patient", "title": "Sarah visited",
        "transcript": ("Today Sarah came to visit me. We had tea in the afternoon. She reminded me "
                       "that I have a doctor appointment tomorrow at 3 PM. I also need to take my "
                       "medicine in the morning."),
        "source": "manual",
        "simple_summary": ("Sarah visited today and had tea with you. You have a doctor appointment "
                           "tomorrow at 3 PM. Remember to take your medicine in the morning."),
        "timeline": "afternoon",
        "people_mentioned": [{"name": "Sarah", "relationship": "Daughter"}],
        "places_mentioned": [], "medication_detected": [{"name": "Morning medicine", "instruction": "every morning"}],
        "appointment_detected": [{"title": "Doctor appointment", "time": "3 PM tomorrow", "location": "Clinic"}],
        "tasks_detected": [{"title": "Take medicine in the morning", "priority": "high", "category": "medication"}],
        "caregiver_notes": ["Sarah visited and confirmed tomorrow's appointment."],
        "created_at": NOW(),
    })

    await db.alerts.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "caregiver_id": None,
        "alert_type": "appointment_soon", "message": "Doctor appointment tomorrow at 3 PM.",
        "priority": "high", "status": "open", "created_at": NOW(), "resolved_at": None,
    })

    print("[seed] Sample data created.")
