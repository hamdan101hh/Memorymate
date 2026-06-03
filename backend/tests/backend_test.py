"""MemoryMate backend regression tests (pytest).
Covers: auth (login/register/me), patient/caregiver/admin role flows,
memories + AI extraction, reminders CRUD, medications, appointments,
people, places, notes, alerts, chat assistant, today's summary,
caregiver summary, admin stats/users/logs/collections, RBAC.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gentle-support-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@memorymate.app", "admin123")
PATIENT = ("omar@memorymate.app", "Patient123!")
CAREGIVER = ("sarah@memorymate.app", "Caregiver123!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- session-scoped tokens ----------
@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)["token"]


@pytest.fixture(scope="session")
def patient_token():
    return _login(*PATIENT)["token"]


@pytest.fixture(scope="session")
def caregiver_token():
    return _login(*CAREGIVER)["token"]


# ---------- AUTH ----------
class TestAuth:
    def test_login_admin(self):
        d = _login(*ADMIN)
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == "admin@memorymate.app"

    def test_login_patient(self):
        d = _login(*PATIENT)
        assert d["user"]["role"] == "patient"

    def test_login_caregiver(self):
        d = _login(*CAREGIVER)
        assert d["user"]["role"] == "caregiver"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@memorymate.app", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_bearer(self, patient_token):
        r = requests.get(f"{API}/auth/me", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "patient"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_register_patient(self):
        email = f"TEST_patient_{uuid.uuid4().hex[:8]}@memorymate.app"
        payload = {
            "full_name": "TEST Patient",
            "email": email,
            "password": "TestPass123!",
            "role": "patient",
            "consent_accepted": True,
        }
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["email"] == email.lower()
        assert d["user"]["role"] == "patient"
        assert "token" in d

    def test_register_caregiver_with_patient_info(self):
        email = f"TEST_caregiver_{uuid.uuid4().hex[:8]}@memorymate.app"
        payload = {
            "full_name": "TEST Caregiver",
            "email": email,
            "password": "TestPass123!",
            "role": "caregiver",
            "consent_accepted": True,
            "patient_info": {
                "full_name": "TEST Loved One",
                "age": 70,
                "relationship": "Daughter",
                "emergency_contact_name": "EM",
                "emergency_contact_phone": "+1000",
            },
        }
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "caregiver"
        # the new caregiver should have an accessible patient
        me = requests.get(f"{API}/patient", headers=_headers(d["token"]), timeout=15)
        assert me.status_code == 200
        assert me.json()["full_name"] == "TEST Loved One"

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={
            "full_name": "Dup", "email": "admin@memorymate.app",
            "password": "abcdef", "role": "patient", "consent_accepted": True}, timeout=15)
        assert r.status_code == 400


# ---------- PATIENT PROFILE + OVERVIEW ----------
class TestPatientProfile:
    def test_patient_profile(self, patient_token):
        r = requests.get(f"{API}/patient", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("full_name")

    def test_patient_overview(self, patient_token):
        r = requests.get(f"{API}/patient/overview", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("patient", "reminders_completed", "reminders_pending", "total_memories"):
            assert k in d


# ---------- MEMORIES (AI) ----------
class TestMemoriesAI:
    def test_create_memory_with_ai_extraction(self, patient_token):
        body = {"transcript": "Sarah visited me today and reminded me to go to the clinic at 3 PM. I should take my heart medicine after lunch.", "source": "manual"}
        r = requests.post(f"{API}/memories", json=body, headers=_headers(patient_token), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d
        assert d["transcript"] == body["transcript"]
        # AI fields should exist (may be empty if AI fails, but keys present)
        for k in ("simple_summary", "people_mentioned", "places_mentioned",
                  "medication_detected", "appointment_detected", "tasks_detected"):
            assert k in d
        # validate GET persistence
        list_r = requests.get(f"{API}/memories", headers=_headers(patient_token), timeout=15)
        assert list_r.status_code == 200
        assert any(m["id"] == d["id"] for m in list_r.json())

    def test_list_memories_today_flag(self, patient_token):
        r = requests.get(f"{API}/memories?today=true", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_empty_transcript_rejected(self, patient_token):
        r = requests.post(f"{API}/memories", json={"transcript": "   "},
                          headers=_headers(patient_token), timeout=20)
        assert r.status_code == 400


# ---------- REMINDERS CRUD ----------
class TestReminders:
    def test_list_reminders_seeded(self, patient_token):
        r = requests.get(f"{API}/reminders", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_update_delete_reminder(self, patient_token):
        payload = {"title": "TEST Walk", "category": "custom", "priority": "low"}
        r = requests.post(f"{API}/reminders", json=payload, headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]

        upd = requests.patch(f"{API}/reminders/{rid}", json={"status": "done"},
                             headers=_headers(patient_token), timeout=15)
        assert upd.status_code == 200
        assert upd.json()["status"] == "done"
        assert upd.json()["completed_at"] is not None

        d = requests.delete(f"{API}/reminders/{rid}", headers=_headers(patient_token), timeout=15)
        assert d.status_code == 200


# ---------- MEDICATIONS (RBAC) ----------
class TestMedications:
    def test_patient_cannot_create_medication(self, patient_token):
        r = requests.post(f"{API}/medications", json={"medication_name": "TEST Med"},
                          headers=_headers(patient_token), timeout=15)
        assert r.status_code == 403

    def test_caregiver_can_create_medication(self, caregiver_token):
        r = requests.post(f"{API}/medications",
                          json={"medication_name": "TEST Heart Med", "dosage": "5mg",
                                "time_of_day": "morning", "priority": "high"},
                          headers=_headers(caregiver_token), timeout=15)
        assert r.status_code == 200
        mid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/medications/{mid}", headers=_headers(caregiver_token), timeout=15)

    def test_list_medications(self, patient_token):
        r = requests.get(f"{API}/medications", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- APPOINTMENTS (RBAC) ----------
class TestAppointments:
    def test_patient_cannot_create_appointment(self, patient_token):
        r = requests.post(f"{API}/appointments", json={"title": "TEST Visit"},
                          headers=_headers(patient_token), timeout=15)
        assert r.status_code == 403

    def test_caregiver_create_appointment(self, caregiver_token):
        r = requests.post(f"{API}/appointments",
                          json={"title": "TEST Checkup", "doctor_or_clinic": "Dr. X",
                                "date": "2026-02-01", "time": "10:00"},
                          headers=_headers(caregiver_token), timeout=15)
        assert r.status_code == 200
        aid = r.json()["id"]
        requests.delete(f"{API}/appointments/{aid}", headers=_headers(caregiver_token), timeout=15)


# ---------- PEOPLE + EXPLAIN ----------
class TestPeople:
    def test_list_people(self, patient_token):
        r = requests.get(f"{API}/people", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_explain_delete_person(self, caregiver_token):
        cr = requests.post(f"{API}/people",
                           json={"name": "TEST Friend", "relationship": "Friend",
                                 "explanation_for_patient": "An old colleague who visits weekly."},
                           headers=_headers(caregiver_token), timeout=15)
        assert cr.status_code == 200
        pid = cr.json()["id"]
        ex = requests.post(f"{API}/people/{pid}/explain", headers=_headers(caregiver_token), timeout=60)
        assert ex.status_code == 200
        assert isinstance(ex.json().get("explanation"), str)
        d = requests.delete(f"{API}/people/{pid}", headers=_headers(caregiver_token), timeout=15)
        assert d.status_code == 200


# ---------- PLACES ----------
class TestPlaces:
    def test_list_places(self, patient_token):
        r = requests.get(f"{API}/places", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200


# ---------- NOTES (caregiver only) + ALERTS ----------
class TestNotesAndAlerts:
    def test_patient_cannot_create_note(self, patient_token):
        r = requests.post(f"{API}/notes", json={"note_text": "x"},
                          headers=_headers(patient_token), timeout=15)
        assert r.status_code == 403

    def test_caregiver_create_note(self, caregiver_token):
        r = requests.post(f"{API}/notes", json={"note_text": "TEST note", "visible_to_patient": True},
                          headers=_headers(caregiver_token), timeout=15)
        assert r.status_code == 200
        nid = r.json()["id"]
        requests.delete(f"{API}/notes/{nid}", headers=_headers(caregiver_token), timeout=15)

    def test_alert_create_and_resolve(self, caregiver_token):
        c = requests.post(f"{API}/alerts",
                          json={"alert_type": "missed_medication", "message": "TEST alert", "priority": "medium"},
                          headers=_headers(caregiver_token), timeout=15)
        assert c.status_code == 200
        aid = c.json()["id"]
        r = requests.patch(f"{API}/alerts/{aid}/resolve", headers=_headers(caregiver_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"


# ---------- CHAT + SUMMARIES (AI) ----------
class TestAIChatAndSummaries:
    def test_chat_send(self, patient_token):
        r = requests.post(f"{API}/chat", json={"message": "Who is my emergency contact?"},
                          headers=_headers(patient_token), timeout=120)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("answer"), str) and len(r.json()["answer"]) > 0

    def test_today_summary(self, patient_token):
        r = requests.get(f"{API}/summary/today", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("date", "timeline", "reminders_today", "notes", "appointments"):
            assert k in d

    def test_caregiver_summary_rbac(self, patient_token):
        r = requests.post(f"{API}/caregiver/summary", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 403

    def test_caregiver_summary(self, caregiver_token):
        r = requests.post(f"{API}/caregiver/summary", headers=_headers(caregiver_token), timeout=120)
        assert r.status_code == 200
        assert isinstance(r.json().get("summary"), str)
        assert len(r.json()["summary"]) > 0


# ---------- ADMIN ----------
class TestAdmin:
    def test_non_admin_blocked(self, patient_token):
        r = requests.get(f"{API}/admin/stats", headers=_headers(patient_token), timeout=15)
        assert r.status_code == 403

    def test_admin_stats(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_users", "total_patients", "total_caregivers",
                  "total_memories", "total_reminders", "total_alerts"):
            assert k in d

    def test_admin_users_and_update(self, admin_token):
        ul = requests.get(f"{API}/admin/users", headers=_headers(admin_token), timeout=15)
        assert ul.status_code == 200
        users = ul.json()
        target = next((u for u in users if u["email"].startswith("test_patient_")), None)
        if not target:
            pytest.skip("no TEST user available for update")
        # toggle active off then on
        r1 = requests.patch(f"{API}/admin/users/{target['id']}", json={"is_active": False},
                            headers=_headers(admin_token), timeout=15)
        assert r1.status_code == 200 and r1.json()["is_active"] == False
        r2 = requests.patch(f"{API}/admin/users/{target['id']}", json={"is_active": True},
                            headers=_headers(admin_token), timeout=15)
        assert r2.json()["is_active"] == True

    def test_admin_logs(self, admin_token):
        r = requests.get(f"{API}/admin/logs", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_collection(self, admin_token):
        for c in ("patients", "reminders", "memories"):
            r = requests.get(f"{API}/admin/collection/{c}", headers=_headers(admin_token), timeout=15)
            assert r.status_code == 200, c
        r = requests.get(f"{API}/admin/collection/users", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 400
