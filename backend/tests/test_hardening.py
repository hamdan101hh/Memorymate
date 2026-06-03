"""Regression tests for the hardening pass:
- demo-login issues tokens by role WITHOUT the client sending any password
- transcribe endpoint cannot crash on the empty-audio path (returns 400, never 500/undefined)
- server-side role enforcement (patient blocked from admin + caregiver-only writes)
- capture pipeline routes classified events into the EXISTING appointments / medications
  / important_people / important_places tables (no duplicate tables)
- privacy-review 'edit' action saves an edited memory and rejects unknown actions
"""
import os
import io
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- demo-login (no secrets in client) ----------------
class TestDemoLogin:
    def test_demo_login_roles(self):
        for role in ("patient", "caregiver", "admin"):
            d = _demo(role)
            assert d["token"]
            assert d["user"]["role"] == role

    def test_demo_login_unknown_role(self):
        r = requests.post(f"{API}/auth/demo-login", json={"role": "hacker"}, timeout=15)
        assert r.status_code == 400


# ---------------- transcribe cannot crash ----------------
class TestTranscribeGuard:
    def test_empty_audio_returns_400_not_crash(self):
        token = _demo("patient")["token"]
        files = {"file": ("empty.webm", io.BytesIO(b""), "audio/webm")}
        r = requests.post(f"{API}/memories/transcribe",
                          headers={"Authorization": f"Bearer {token}"}, files=files, timeout=30)
        # Must be a clean handled error, never a 500 from an undefined variable.
        assert r.status_code == 400, r.text


# ---------------- role enforcement (backend, not just UI) ----------------
class TestRoleEnforcement:
    def test_patient_cannot_access_admin(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/admin/stats", headers=_h(token), timeout=15)
        assert r.status_code == 403

    def test_patient_cannot_write_caregiver_only(self):
        token = _demo("patient")["token"]
        r = requests.post(f"{API}/medications", headers=_h(token),
                          json={"medication_name": "should-be-blocked"}, timeout=15)
        assert r.status_code == 403

    def test_no_token_rejected(self):
        r = requests.get(f"{API}/reminders", timeout=15)
        assert r.status_code in (401, 403)


# ---------------- capture routes into existing tables ----------------
class TestCaptureRouting:
    def test_events_route_to_existing_tables(self):
        token = _demo("patient")["token"]
        requests.patch(f"{API}/capture/settings", json={"private_mode": False}, headers=_h(token), timeout=15)
        appts_before = len(requests.get(f"{API}/appointments", headers=_h(token), timeout=15).json())
        meds_before = len(requests.get(f"{API}/medications", headers=_h(token), timeout=15).json())

        sid = requests.post(f"{API}/capture/sessions", headers=_h(token),
                            json={"mode": "capture", "title": f"Routing {uuid.uuid4().hex[:6]}",
                                  "consent_confirmed": True}, timeout=30).json()["id"]
        transcript = ("Sarah reminded me about the doctor appointment at the clinic tomorrow at 3 PM. "
                      "The doctor said take my blood pressure medicine every morning.")
        r = requests.post(f"{API}/capture/sessions/{sid}/process", headers=_h(token),
                          json={"transcript": transcript}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        types = {e["event_type"] for e in data["events"]}
        # every event carries a confidence tag
        assert all("confidence" in e for e in data["events"])
        assert "appointment" in types or "medication" in types

        appts_after = len(requests.get(f"{API}/appointments", headers=_h(token), timeout=15).json())
        meds_after = len(requests.get(f"{API}/medications", headers=_h(token), timeout=15).json())
        assert appts_after >= appts_before
        assert meds_after >= meds_before
        assert (appts_after + meds_after) > (appts_before + meds_before)


# ---------------- privacy review edit ----------------
class TestReviewEdit:
    def test_edit_action_and_unknown_action(self):
        token = _demo("patient")["token"]
        requests.patch(f"{API}/capture/settings", json={"private_mode": False}, headers=_h(token), timeout=15)
        sid = requests.post(f"{API}/capture/sessions", headers=_h(token),
                            json={"mode": "capture", "title": f"Review {uuid.uuid4().hex[:6]}",
                                  "consent_confirmed": True}, timeout=30).json()["id"]
        # A transcript likely to produce a private/sensitive review item.
        requests.post(f"{API}/capture/sessions/{sid}/process", headers=_h(token),
                      json={"transcript": "I talked privately about some money worries and my bank password."}, timeout=90)
        items = requests.get(f"{API}/capture/review", headers=_h(token), timeout=15).json()
        if items:
            rid = items[0]["id"]
            # unknown action rejected
            bad = requests.post(f"{API}/capture/review/{rid}/action", headers=_h(token),
                                json={"action": "nuke"}, timeout=15)
            assert bad.status_code == 400
            # edit accepted
            ok = requests.post(f"{API}/capture/review/{rid}/action", headers=_h(token),
                               json={"action": "edit", "edited_content": "Edited safe note."}, timeout=15)
            assert ok.status_code == 200 and ok.json()["action"] == "edit"
