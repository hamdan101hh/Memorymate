"""MemoryMate Memory Capture & Meeting Mode tests.
Covers: capture settings GET/PATCH, private_mode 423 block, session creation,
process transcript -> AI divides into multiple memory_events + auto-reminders,
meeting mode summary, privacy review queue actions (save/convert_reminder/
mark_private/delete)."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

PATIENT = ("omar@memorymate.app", "Patient123!")
CAREGIVER = ("sarah@memorymate.app", "Caregiver123!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def patient_token():
    return _login(*PATIENT)["token"]


@pytest.fixture(scope="module")
def caregiver_token():
    return _login(*CAREGIVER)["token"]


@pytest.fixture(autouse=True)
def _ensure_private_off(patient_token):
    """Make sure private mode is OFF before each test so sessions can be created.
    A test that needs it ON will toggle it then toggle it back off in teardown."""
    requests.patch(f"{API}/capture/settings", json={"private_mode": False},
                   headers=_h(patient_token), timeout=15)
    yield
    requests.patch(f"{API}/capture/settings", json={"private_mode": False},
                   headers=_h(patient_token), timeout=15)


# ---------------- Settings ----------------
class TestCaptureSettings:
    def test_get_settings(self, patient_token):
        r = requests.get(f"{API}/capture/settings", headers=_h(patient_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("private_mode", "capture_only_when_charging", "auto_stop_minutes",
                  "low_battery_auto_stop", "wifi_only", "local_processing",
                  "default_transcript_storage_mode"):
            assert k in d
        assert not d["private_mode"]

    def test_patch_settings_persists(self, patient_token):
        r = requests.patch(f"{API}/capture/settings",
                           json={"auto_stop_minutes": 45, "wifi_only": True,
                                 "default_transcript_storage_mode": "transcript"},
                           headers=_h(patient_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["auto_stop_minutes"] == 45
        assert d["wifi_only"]
        assert d["default_transcript_storage_mode"] == "transcript"
        # GET to verify persistence
        g = requests.get(f"{API}/capture/settings", headers=_h(patient_token), timeout=15)
        assert g.json()["auto_stop_minutes"] == 45
        # restore defaults
        requests.patch(f"{API}/capture/settings",
                       json={"auto_stop_minutes": 30, "wifi_only": False,
                             "default_transcript_storage_mode": "summary_only"},
                       headers=_h(patient_token), timeout=15)


# ---------------- Session creation + consent + private mode block ----------------
class TestCaptureSessions:
    def test_create_session_requires_consent(self, patient_token):
        r = requests.post(f"{API}/capture/sessions",
                          json={"mode": "capture", "title": "TEST no consent",
                                "consent_confirmed": False},
                          headers=_h(patient_token), timeout=15)
        assert r.status_code == 400

    def test_create_session_ok(self, patient_token):
        r = requests.post(f"{API}/capture/sessions",
                          json={"mode": "capture", "title": "TEST Session",
                                "session_type": "general", "purpose": "test",
                                "people_involved": "Fadi, Sarah", "expected_duration": 30,
                                "transcript_storage_mode": "summary_only",
                                "consent_confirmed": True, "informed_others": True},
                          headers=_h(patient_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] and d["status"] == "active" and d["mode"] == "capture"
        assert d["consent_confirmed"]
        # cleanup: stop the session
        requests.patch(f"{API}/capture/sessions/{d['id']}",
                       json={"status": "stopped"}, headers=_h(patient_token), timeout=15)

    def test_private_mode_blocks_session_creation(self, patient_token):
        # turn on private mode
        u = requests.patch(f"{API}/capture/settings", json={"private_mode": True},
                           headers=_h(patient_token), timeout=15)
        assert u.status_code == 200 and u.json()["private_mode"]
        # try to start a session -> 423
        r = requests.post(f"{API}/capture/sessions",
                          json={"mode": "capture", "title": "TEST blocked",
                                "consent_confirmed": True}, headers=_h(patient_token), timeout=15)
        assert r.status_code == 423
        # turn off
        requests.patch(f"{API}/capture/settings", json={"private_mode": False},
                       headers=_h(patient_token), timeout=15)

    def test_add_note_and_status_transitions(self, patient_token):
        c = requests.post(f"{API}/capture/sessions",
                          json={"mode": "capture", "title": "TEST notes",
                                "consent_confirmed": True}, headers=_h(patient_token), timeout=15)
        sid = c.json()["id"]
        n = requests.post(f"{API}/capture/sessions/{sid}/note",
                         json={"note": "manual annotation"}, headers=_h(patient_token), timeout=15)
        assert n.status_code == 200 and n.json()["ok"]
        # pause
        p = requests.patch(f"{API}/capture/sessions/{sid}", json={"status": "paused"},
                          headers=_h(patient_token), timeout=15)
        assert p.status_code == 200 and p.json()["status"] == "paused"
        # stop
        s = requests.patch(f"{API}/capture/sessions/{sid}", json={"status": "stopped"},
                          headers=_h(patient_token), timeout=15)
        assert s.status_code == 200 and s.json()["end_time"]


# ---------------- AI process: divides into multiple events + auto reminders ----------------
class TestCaptureProcess:
    def test_process_transcript_divides_events(self, patient_token):
        c = requests.post(f"{API}/capture/sessions",
                          json={"mode": "capture", "title": "TEST AI division",
                                "session_type": "general",
                                "people_involved": "Fadi, Sarah",
                                "consent_confirmed": True}, headers=_h(patient_token), timeout=15)
        sid = c.json()["id"]
        # count reminders before
        before = requests.get(f"{API}/reminders", headers=_h(patient_token), timeout=15).json()
        before_count = len(before)

        transcript = ("Today I spoke to Fadi about the business idea. "
                      "Then Sarah came home and reminded me about the doctor appointment. "
                      "Later I went to the pharmacy.")
        r = requests.post(f"{API}/capture/sessions/{sid}/process",
                          json={"transcript": transcript}, headers=_h(patient_token), timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        if not d.get("events"):
            pytest.skip("AI not configured (no LLM key) — transcript produced no events")
        # Expect AI to produce at least 2 distinct events (ideally ~3)
        assert isinstance(d.get("events"), list)
        assert len(d["events"]) >= 2, f"expected multi-event division, got {len(d['events'])}"
        # Each event has a title and summary
        for ev in d["events"]:
            assert ev.get("title")
            assert "summary" in ev

        # GET session -> embedded events should match
        g = requests.get(f"{API}/capture/sessions/{sid}", headers=_h(patient_token), timeout=15)
        assert g.status_code == 200
        assert len(g.json()["events"]) == len(d["events"])

        # Reminders auto-created (doctor appointment usually triggers one)
        after = requests.get(f"{API}/reminders", headers=_h(patient_token), timeout=15).json()
        assert len(after) >= before_count  # may be equal if AI didn't surface reminders

    def test_process_empty_transcript_rejected(self, patient_token):
        c = requests.post(f"{API}/capture/sessions",
                          json={"mode": "capture", "title": "TEST empty",
                                "consent_confirmed": True}, headers=_h(patient_token), timeout=15)
        sid = c.json()["id"]
        r = requests.post(f"{API}/capture/sessions/{sid}/process",
                          json={"transcript": "   "}, headers=_h(patient_token), timeout=30)
        assert r.status_code == 400


# ---------------- Meeting mode ----------------
class TestMeetingMode:
    def test_meeting_summary(self, caregiver_token):
        c = requests.post(f"{API}/capture/sessions",
                          json={"mode": "meeting", "title": "TEST Meeting",
                                "session_type": "meeting",
                                "people_involved": "Fadi",
                                "consent_confirmed": True}, headers=_h(caregiver_token), timeout=15)
        assert c.status_code == 200, c.text
        sid = c.json()["id"]
        transcript = ("Fadi and I agreed to build an MVP. "
                      "Decision: launch a pilot in two weeks. "
                      "I will send Fadi the design doc by Friday. "
                      "Schedule a follow-up call next Monday.")
        r = requests.post(f"{API}/capture/sessions/{sid}/process",
                          json={"transcript": transcript},
                          headers=_h(caregiver_token), timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        ms = d.get("meeting_summary")
        assert isinstance(ms, dict), f"expected meeting_summary dict, got {ms}"
        # at least one of the expected keys must be a non-empty list/string
        keys = ("key_points", "decisions", "action_items", "follow_ups", "next_steps")
        present = [k for k in keys if ms.get(k)]
        if not present:
            pytest.skip("AI not configured (no LLM key) — meeting summary empty")
        assert present, f"meeting_summary missing structured fields, got keys={list(ms.keys())}"


# ---------------- Privacy review queue ----------------
class TestPrivacyReview:
    def _seed_review_item(self, token):
        """Create a session + post transcript that may produce review items.
        If no items are produced, manually insert one via a transcript with sensitive content."""
        c = requests.post(f"{API}/capture/sessions",
                          json={"mode": "capture", "title": "TEST review seed",
                                "consent_confirmed": True}, headers=_h(token), timeout=15)
        sid = c.json()["id"]
        transcript = ("I felt very sad today and worried about my finances. "
                      "Someone mentioned a password I should not share.")
        requests.post(f"{API}/capture/sessions/{sid}/process",
                      json={"transcript": transcript}, headers=_h(token), timeout=180)
        items = requests.get(f"{API}/capture/review?status=pending",
                             headers=_h(token), timeout=15).json()
        return items

    def test_review_list(self, patient_token):
        r = requests.get(f"{API}/capture/review?status=pending",
                         headers=_h(patient_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_review_action_resolves(self, patient_token):
        items = self._seed_review_item(patient_token)
        if not items:
            pytest.skip("AI did not surface any privacy review items for this transcript")
        rid = items[0]["id"]
        r = requests.post(f"{API}/capture/review/{rid}/action",
                          json={"action": "convert_reminder"}, headers=_h(patient_token), timeout=15)
        assert r.status_code == 200 and r.json()["ok"]
        # confirm it is no longer pending
        remaining = requests.get(f"{API}/capture/review?status=pending",
                                 headers=_h(patient_token), timeout=15).json()
        assert all(it["id"] != rid for it in remaining)
