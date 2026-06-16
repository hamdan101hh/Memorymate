"""Tests for Focus Capture MVP — manual sessions only, no cloud transcription."""
import os
from pathlib import Path

import pytest
import requests

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _enable_focus_capture_for_user(user_id: str, admin_token: str, enabled: bool = True):
    if enabled:
        requests.patch(
            f"{API}/admin/costs/user/{user_id}/quota",
            headers=_h(admin_token),
            json={"plan": "admin_test"},
            timeout=15,
        )
        requests.patch(
            f"{API}/admin/features/user/{user_id}",
            headers=_h(admin_token),
            json={"focus_capture_enabled": True},
            timeout=15,
        )
    else:
        requests.patch(
            f"{API}/admin/costs/user/{user_id}/quota",
            headers=_h(admin_token),
            json={"plan": "basic"},
            timeout=15,
        )
        requests.patch(
            f"{API}/admin/features/user/{user_id}",
            headers=_h(admin_token),
            json={
                "focus_capture_enabled": False,
                "paid_ai_enabled": False,
                "cloud_transcription_enabled": False,
            },
            timeout=15,
        )


@pytest.fixture
def patient_token():
    return _demo("patient")["token"]


@pytest.fixture
def caregiver_token():
    return _demo("caregiver")["token"]


@pytest.fixture
def admin_token():
    return _demo("admin")["token"]


@pytest.fixture(autouse=True)
def enable_focus_capture_demo(admin_token):
    patient = _demo("patient")
    _enable_focus_capture_for_user(patient["user"]["id"], admin_token, enabled=True)
    yield


class TestFocusCaptureAuth:
    def test_start_requires_auth(self):
        r = requests.post(
            f"{API}/focus-capture/session/start",
            json={"consent_confirmed": True},
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_start_requires_consent(self, patient_token):
        r = requests.post(
            f"{API}/focus-capture/session/start",
            json={"consent_confirmed": False},
            headers=_h(patient_token),
            timeout=15,
        )
        assert r.status_code == 400


class TestFocusCaptureSessionFlow:
    def _start(self, token):
        r = requests.post(
            f"{API}/focus-capture/session/start",
            json={"title": "TEST Focus", "consent_confirmed": True},
            headers=_h(token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_pause_resume_stop_belongs_to_user(self, patient_token, caregiver_token):
        sess = self._start(patient_token)
        sid = sess["id"]
        r_pause = requests.patch(
            f"{API}/focus-capture/session/{sid}/pause",
            headers=_h(patient_token),
            timeout=15,
        )
        assert r_pause.status_code == 200
        assert r_pause.json()["status"] == "paused"

        r_other = requests.patch(
            f"{API}/focus-capture/session/{sid}/pause",
            headers=_h(caregiver_token),
            timeout=15,
        )
        assert r_other.status_code in (403, 404)

        r_resume = requests.patch(
            f"{API}/focus-capture/session/{sid}/resume",
            headers=_h(patient_token),
            timeout=15,
        )
        assert r_resume.status_code == 200
        assert r_resume.json()["status"] == "active"

        r_stop = requests.patch(
            f"{API}/focus-capture/session/{sid}/stop",
            headers=_h(patient_token),
            timeout=15,
        )
        assert r_stop.status_code == 200
        assert r_stop.json()["status"] == "stopped"
        assert r_stop.json().get("estimated_cost_usd") == 0.0
        assert r_stop.json().get("cloud_transcription_used") is False

        requests.delete(f"{API}/focus-capture/session/{sid}", headers=_h(patient_token), timeout=15)

    def test_save_memory_zero_cost(self, patient_token):
        sess = self._start(patient_token)
        sid = sess["id"]
        requests.patch(
            f"{API}/focus-capture/session/{sid}/notes",
            headers=_h(patient_token),
            json={"notes_text": "TEST focus capture notes"},
            timeout=15,
        )
        requests.patch(f"{API}/focus-capture/session/{sid}/stop", headers=_h(patient_token), timeout=15)
        r = requests.post(
            f"{API}/focus-capture/session/{sid}/save-memory",
            headers=_h(patient_token),
            json={"permission_confirmed": True},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["session"]["status"] == "saved"
        assert body["session"]["estimated_cost_usd"] == 0.0
        assert body["memory"]["id"]


class TestFocusCaptureFeatureFlag:
    def test_start_blocked_when_disabled(self, patient_token, admin_token):
        patient = _demo("patient")
        _enable_focus_capture_for_user(patient["user"]["id"], admin_token, enabled=False)
        r = requests.post(
            f"{API}/focus-capture/session/start",
            json={"consent_confirmed": True},
            headers=_h(patient_token),
            timeout=15,
        )
        assert r.status_code == 403
        _enable_focus_capture_for_user(patient["user"]["id"], admin_token, enabled=True)


class TestFocusCaptureNoCloudTranscription:
    def test_config_cloud_transcription_false(self, patient_token):
        r = requests.get(f"{API}/focus-capture/config", headers=_h(patient_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("cloud_transcription_enabled") is False
        assert r.json().get("audio_persistence") is False

    def test_module_never_calls_transcription(self):
        text = (ROOT / "backend/focus_capture.py").read_text(encoding="utf-8")
        assert "transcribe" not in text.lower()
        assert "openai" not in text.lower()


class TestFocusCaptureImageGuard:
    def test_attach_without_image_fails(self, patient_token):
        sess = requests.post(
            f"{API}/focus-capture/session/start",
            json={"consent_confirmed": True},
            headers=_h(patient_token),
            timeout=15,
        ).json()
        sid = sess["id"]
        r = requests.post(
            f"{API}/focus-capture/session/{sid}/attach-image",
            headers=_h(patient_token),
            json={"image_id": "nonexistent-image-id"},
            timeout=15,
        )
        assert r.status_code == 404
        requests.delete(f"{API}/focus-capture/session/{sid}", headers=_h(patient_token), timeout=15)


class TestRemindersDoNotStartFocusCapture:
    def test_smart_capture_reminders_no_focus_capture(self):
        text = (ROOT / "backend/smart_capture_reminders.py").read_text(encoding="utf-8").lower()
        assert "focus_capture" not in text
        assert "focus-capture" not in text

    def test_smart_memory_card_no_focus_capture_route(self):
        js = (ROOT / "frontend/src/components/patient/SmartMemoryCaptureCard.js").read_text(encoding="utf-8").lower()
        assert "focus-capture" not in js
        assert "/patient/focus-capture" not in js
