"""Tests for patient capture, assistant, daily summary, and safety constraints."""
import os
from pathlib import Path

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ROOT = Path(__file__).resolve().parents[2]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestMemoryDraftNoSaveUntilConfirm:
    def test_draft_endpoint_does_not_create_memory(self):
        token = _demo("patient")["token"]
        before = requests.get(f"{API}/memories", headers=_h(token), timeout=15)
        assert before.status_code == 200
        count_before = len(before.json())
        draft = requests.post(
            f"{API}/memories/draft",
            headers=_h(token),
            json={"transcript": "Visited the park with Sarah today."},
            timeout=60,
        )
        assert draft.status_code == 200, draft.text
        assert "draft" in draft.json()
        after = requests.get(f"{API}/memories", headers=_h(token), timeout=15)
        assert len(after.json()) == count_before


class TestChatExpiry:
    def test_chat_returns_expiry_metadata(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/chat", headers=_h(token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "messages" in data
        assert data.get("expires_after_hours") == 24
        assert "session_note" in data

    def test_clear_chat_endpoint(self):
        token = _demo("patient")["token"]
        requests.post(f"{API}/chat", headers=_h(token), json={"message": "test clear"}, timeout=60)
        r = requests.delete(f"{API}/chat", headers=_h(token), timeout=15)
        assert r.status_code == 200


class TestTodaySummary:
    def test_summary_has_date_and_refresh_note(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/summary/today", headers=_h(token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "date" in data
        assert data.get("refresh_note")
        assert "suggested_next_action" in data


class TestReminderEnhance:
    def test_enhance_returns_clarification_shape(self):
        token = _demo("patient")["token"]
        r = requests.post(
            f"{API}/reminders/enhance",
            headers=_h(token),
            json={"raw_text": "call fadi"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "enhanced_text" in data
        assert "needs_clarification" in data


class TestCaptureSettings:
    def test_mic_and_language_settings_exist(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/capture/settings", headers=_h(token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "mic_enabled" in data
        assert "capture_language" in data


class TestSafetyAndConstraints:
    def test_no_google_places_api(self):
        for rel in [
            "frontend/src/lib/mapLinks.js",
            "frontend/src/pages/patient/TodaySummary.js",
            "frontend/src/pages/patient/RecordMemory.js",
        ]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            assert "maps.googleapis.com" not in text
            assert "places.googleapis" not in text

    def test_no_external_image_apis(self):
        js = (ROOT / "frontend" / "src" / "lib" / "memoryVisuals.js").read_text(encoding="utf-8")
        assert "unsplash" not in js.lower()
        assert "googleusercontent" not in js.lower()

    def test_no_whatsapp_business(self):
        routes = (ROOT / "backend" / "routes.py").read_text(encoding="utf-8")
        assert "whatsapp business" not in routes.lower()

    def test_no_hidden_recording_wording_in_patient_home(self):
        js = (ROOT / "frontend" / "src" / "pages" / "patient" / "PatientHome.js").read_text(encoding="utf-8")
        assert "secretly" not in js.lower()
        assert "surveillance" not in js.lower()
        assert "background forever" not in js.lower()

    def test_smart_capture_card_exists(self):
        js = (ROOT / "frontend" / "src" / "components" / "patient" / "SmartMemoryCaptureCard.js").read_text(encoding="utf-8")
        assert "Smart Memory Capture" in js
        assert "Pause anytime" in js

    def test_multilingual_options(self):
        js = (ROOT / "frontend" / "src" / "lib" / "captureLanguage.js").read_text(encoding="utf-8")
        assert "ur-PK" in js
        assert "zh-CN" in js
        assert "ar" in js

    def test_speech_fallback_message(self):
        js = (ROOT / "frontend" / "src" / "pages" / "patient" / "RecordMemory.js").read_text(encoding="utf-8")
        assert "may not support speech recognition" in js

    def test_no_gcal_edit_delete_in_patient_tests(self):
        gcal = (ROOT / "backend" / "gcal.py").read_text(encoding="utf-8")
        assert "events().delete" not in gcal or "Never deletes Google" in gcal or "not delete Google" in gcal.lower()

    def test_patient_routes_in_app(self):
        app = (ROOT / "frontend" / "src" / "App.js").read_text(encoding="utf-8")
        assert "path=\"record\"" in app or "path=\"record\"" in app.replace("'", '"')
        assert "PatientHome" in app

    def test_docs_exist(self):
        assert (ROOT / "docs" / "MULTILINGUAL_CAPTURE_PLAN.md").exists()
        assert (ROOT / "docs" / "DATA_RETENTION_PATIENT_FEATURES.md").exists()
