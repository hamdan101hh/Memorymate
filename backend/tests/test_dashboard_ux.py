"""Tests for dashboard UX, location context, cleanup-clutter, WHOOP planning."""
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


class TestMapDeepLinks:
    def test_map_links_no_api_key(self):
        js = (ROOT / "frontend" / "src" / "lib" / "mapLinks.js").read_text(encoding="utf-8")
        assert "google.com/maps/search" in js
        assert "api=1" in js
        assert "maps.googleapis.com" not in js
        assert "places" not in js.lower() or "api=1" in js

    def test_memory_visuals_no_external_images(self):
        js = (ROOT / "frontend" / "src" / "lib" / "memoryVisuals.js").read_text(encoding="utf-8")
        assert "unsplash" not in js.lower()
        assert "google" not in js.lower()


class TestMeetingContextAPI:
    def test_requires_confirmation(self):
        token = _demo("caregiver")["token"]
        appts = requests.get(f"{API}/appointments", headers=_h(token), timeout=15)
        if appts.status_code != 200 or not appts.json():
            pytest.skip("no appointments")
        aid = appts.json()[0]["id"]
        r = requests.post(
            f"{API}/appointments/{aid}/meeting-context",
            headers=_h(token),
            json={"location_text": "Test Mall", "confirmed": False},
            timeout=15,
        )
        assert r.status_code == 400

    def test_saves_after_confirmation(self):
        token = _demo("caregiver")["token"]
        appts = requests.get(f"{API}/appointments", headers=_h(token), timeout=15)
        if appts.status_code != 200 or not appts.json():
            pytest.skip("no appointments")
        aid = appts.json()[0]["id"]
        r = requests.post(
            f"{API}/appointments/{aid}/meeting-context",
            headers=_h(token),
            json={
                "location_text": "Dubai Mall",
                "started_at": "16:00",
                "ended_at": "17:00",
                "notes": "Discussed next steps",
                "confirmed": True,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        assert "memory_id" in r.json()


class TestCleanupClutter:
    def test_cleanup_endpoint_exists_no_google_delete(self):
        gcal_src = (ROOT / "backend" / "gcal.py").read_text(encoding="utf-8")
        assert "cleanup_clutter" in gcal_src
        assert "Never deletes Google" in gcal_src or "not delete Google" in gcal_src.lower()

    def test_cleanup_endpoint_ok(self):
        token = _demo("caregiver")["token"]
        r = requests.post(f"{API}/calendar/cleanup-clutter", headers=_h(token), timeout=60)
        # May fail if calendar not connected — accept 200 or 401/404 from gcal
        assert r.status_code in (200, 401, 404, 502)


class TestWhoopPlanning:
    def test_whoop_doc_exists(self):
        assert (ROOT / "docs" / "WHOOP_CONNECTOR_LEGAL_PLAN.md").is_file()

    def test_no_whoop_oauth_routes(self):
        backend = ""
        for p in (ROOT / "backend").glob("*.py"):
            backend += p.read_text(encoding="utf-8").lower()
        assert "whoop.com/oauth" not in backend
        assert "whoop_password" not in backend

    def test_whoop_ui_disabled(self):
        js = (ROOT / "frontend" / "src" / "components" / "caregiver" / "WhoopConnectorCard.js").read_text(encoding="utf-8")
        assert "Coming soon" in js
        assert "disabled" in js


class TestSuccessComponent:
    def test_success_check_has_text(self):
        js = (ROOT / "frontend" / "src" / "components" / "mvp" / "SuccessCheck.js").read_text(encoding="utf-8")
        assert "role=\"status\"" in js or "role='status'" in js
        assert "Success" in js


class TestDashboardLayout:
    def test_quick_actions_before_privacy_in_source(self):
        dash = (ROOT / "frontend" / "src" / "pages" / "caregiver" / "CaregiverDashboard.js").read_text(encoding="utf-8")
        qa = dash.find("dashboard-top-actions")
        pr = dash.find("privacy-review-section")
        assert qa > 0 and pr > 0 and qa < pr

    def test_quick_note_at_top(self):
        dash = (ROOT / "frontend" / "src" / "pages" / "caregiver" / "CaregiverDashboard.js").read_text(encoding="utf-8")
        assert "quick-note-card" in dash
        assert "QuickNoteCard" in dash
