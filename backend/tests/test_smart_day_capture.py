"""Tests for Smart Day Capture — drafts, filters, caps, safety."""
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
import requests

import capture_meaningfulness as meaning
import ai_pipeline

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = (__import__("os").environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestMeaningfulnessFilter:
    def test_meaningful_transcript(self):
        out = meaning.is_meaningful_capture_snippet(
            "Doctor appointment tomorrow at 3 PM with Sarah",
            {"duration_seconds": 5, "min_snippet_seconds": 3},
        )
        assert out["should_create_draft"] is True

    def test_short_noise_ignored(self):
        out = meaning.is_meaningful_capture_snippet("um ok", {"duration_seconds": 1})
        assert out["should_create_draft"] is False

    def test_filler_ignored(self):
        out = meaning.is_meaningful_capture_snippet("yeah okay", {"duration_seconds": 4})
        assert out["should_create_draft"] is False


class TestCloudDefaults:
    def test_cloud_transcription_disabled_by_default(self):
        assert ai_pipeline.CLOUD_TRANSCRIPTION_ENABLED is False

    def test_no_granola_dependency(self):
        src = (ROOT / "backend" / "ai_pipeline.py").read_text(encoding="utf-8")
        assert "granola" not in src.lower() or "not used" in src.lower()


class TestSmartDayAPI:
    def test_draft_requires_active_session(self):
        token = _demo("patient")["token"]
        requests.post(f"{API}/capture/smart-day/stop", headers=_h(token), timeout=15)
        r = requests.post(
            f"{API}/capture/smart-day/draft",
            headers=_h(token),
            json={
                "transcript": "Remember doctor appointment tomorrow at 3",
                "duration_seconds": 5,
                "browser_transcript": True,
            },
            timeout=15,
        )
        assert r.status_code == 400

    def _enable_smart_day(self, token):
        requests.patch(f"{API}/capture/settings", headers=_h(token),
                       json={"mic_enabled": True, "smart_day_enabled": True}, timeout=15)
        return requests.post(f"{API}/capture/smart-day/start", headers=_h(token), timeout=15)

    def test_meaningful_draft_not_auto_memory(self):
        token = _demo("patient")["token"]
        self._enable_smart_day(token)
        before = requests.get(f"{API}/memories", headers=_h(token), timeout=15)
        n_before = len(before.json()) if before.status_code == 200 else 0
        r = requests.post(
            f"{API}/capture/smart-day/draft",
            headers=_h(token),
            json={
                "transcript": "Call Fadi on Monday about the family visit",
                "duration_seconds": 6,
                "browser_transcript": True,
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        if data.get("created"):
            after = requests.get(f"{API}/memories", headers=_h(token), timeout=15)
            assert len(after.json()) == n_before

    def test_ignore_short_transcript(self):
        token = _demo("patient")["token"]
        self._enable_smart_day(token)
        r = requests.post(
            f"{API}/capture/smart-day/draft",
            headers=_h(token),
            json={"transcript": "um hi", "duration_seconds": 1, "browser_transcript": True},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("created") is False

    def test_clear_drafts(self):
        token = _demo("patient")["token"]
        r = requests.post(f"{API}/capture/smart-day/drafts/clear", headers=_h(token), timeout=15)
        assert r.status_code == 200

    def test_pipeline_config_public(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/ai/pipeline-config", headers=_h(token), timeout=15)
        assert r.status_code == 200
        assert "cloud_transcription_enabled" in r.json()


class TestSafetyWording:
    def test_no_surveillance_wording(self):
        card = (ROOT / "frontend" / "src" / "components" / "patient" / "SmartMemoryCaptureCard.js").read_text(encoding="utf-8")
        assert "surveillance" not in card.lower()
        assert "secretly" not in card.lower()
        assert "24-hour recording" not in card.lower()
        assert "Smart Day Capture" in card

    def test_no_maps_api(self):
        js = (ROOT / "frontend" / "src" / "lib" / "mapLinks.js").read_text(encoding="utf-8")
        assert "maps.googleapis.com" not in js

    def test_no_whatsapp_in_smart_day(self):
        src = (ROOT / "backend" / "capture.py").read_text(encoding="utf-8")
        idx = src.lower().find("smart day")
        chunk = src[idx:idx + 8000] if idx >= 0 else ""
        assert "whatsapp" not in chunk.lower()

    def test_limitations_doc_exists(self):
        assert (ROOT / "docs" / "SMART_DAY_CAPTURE_LIMITATIONS.md").exists()
