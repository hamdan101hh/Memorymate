"""Smart Capture Reminders — no auto-recording, schedule, skip/quiet behavior."""
import os
from datetime import datetime, timezone, timedelta
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


try:
    from smart_capture_reminders import (
        interval_hours,
        compute_next_prompt_at,
        build_status,
        is_active,
        prompt_is_due,
        start_updates,
        stop_updates,
        skip_next_updates,
        quiet_day_updates,
        MODE_HOURS,
    )
except ImportError:
    from backend.smart_capture_reminders import (
        interval_hours,
        compute_next_prompt_at,
        build_status,
        is_active,
        prompt_is_due,
        start_updates,
        stop_updates,
        skip_next_updates,
        quiet_day_updates,
        MODE_HOURS,
    )


class TestScheduleLogic:
    def test_weekday_interval_five_hours(self):
        monday = datetime(2026, 6, 8, 12, 0, tzinfo=timezone.utc)  # Monday
        assert interval_hours(monday, {}) == 5

    def test_weekend_interval_three_hours(self):
        saturday = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)
        assert interval_hours(saturday, {}) == 3

    def test_start_creates_24h_window(self):
        now = datetime.now(timezone.utc)
        updates = start_updates(now.isoformat(), now, 0)
        ends = datetime.fromisoformat(updates["smart_capture_ends_at"].replace("Z", "+00:00"))
        assert updates["smart_capture_reminders_enabled"]
        assert (ends - now).total_seconds() <= MODE_HOURS * 3600 + 5

    def test_expired_mode_not_active(self):
        now = datetime.now(timezone.utc)
        settings = {
            "smart_capture_reminders_enabled": True,
            "smart_capture_ends_at": (now - timedelta(hours=1)).isoformat(),
        }
        assert not is_active(settings, now)

    def test_quiet_day_evening_only(self):
        now = datetime(2026, 6, 8, 10, 0, tzinfo=timezone.utc)
        updates = quiet_day_updates(now, 0)
        assert updates["smart_capture_quiet_day"]
        assert updates["smart_capture_next_prompt_at"] is not None


class TestApiNoAutoRecord:
    def test_start_enables_reminders_not_smart_day(self):
        token = _demo("patient")["token"]
        requests.post(f"{API}/capture/smart-reminders/stop", headers=_h(token), timeout=15)
        requests.post(f"{API}/capture/smart-day/stop", headers=_h(token), timeout=15)
        r = requests.post(f"{API}/capture/smart-reminders/start", headers=_h(token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["active"]
        assert data.get("no_auto_recording")
        sd = requests.get(f"{API}/capture/smart-day/status", headers=_h(token), timeout=15)
        assert sd.status_code == 200
        assert not sd.json().get("active")

    def test_stop_turns_off(self):
        token = _demo("patient")["token"]
        requests.post(f"{API}/capture/smart-reminders/start", headers=_h(token), timeout=15)
        r = requests.post(f"{API}/capture/smart-reminders/stop", headers=_h(token), timeout=15)
        assert r.status_code == 200
        assert not r.json()["active"]

    def test_skip_next_increments_skips(self):
        token = _demo("patient")["token"]
        requests.post(f"{API}/capture/smart-reminders/start", headers=_h(token), timeout=15)
        r = requests.post(f"{API}/capture/smart-reminders/skip-next", headers=_h(token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("consecutive_skips", 0) >= 1

    def test_quiet_day_flag(self):
        token = _demo("patient")["token"]
        requests.post(f"{API}/capture/smart-reminders/start", headers=_h(token), timeout=15)
        r = requests.post(f"{API}/capture/smart-reminders/quiet-day", headers=_h(token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("quiet_day")


class TestSafetyWording:
    def test_card_no_hidden_recording_terms(self):
        js = (ROOT / "frontend/src/components/patient/SmartMemoryCaptureCard.js").read_text(encoding="utf-8")
        assert "Smart Capture Reminders" in js
        assert "auto recording" not in js.lower()
        assert "always listening" not in js.lower()
        assert "surveillance" not in js.lower()
        assert "24/7 recording" not in js.lower()
        assert "nothing is recorded unless" in js.lower() or "Nothing records unless" in js

    def test_no_whatsapp_business(self):
        scr = (ROOT / "backend/smart_capture_reminders.py").read_text(encoding="utf-8")
        assert "whatsapp business" not in scr.lower()

    def test_docs_exist(self):
        assert (ROOT / "docs/SMART_CAPTURE_REMINDERS.md").exists()
