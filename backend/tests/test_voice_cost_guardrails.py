"""Voice and transcription cost guardrails — caps, blocking, usage tracking."""
import asyncio
import os
import uuid
from pathlib import Path
from unittest.mock import patch, AsyncMock

import pytest
import requests
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
TINY_WEBM = b"\x1a\x45\xdf\xa3"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


try:
    import voice_guardrails as vg
except ImportError:
    from backend import voice_guardrails as vg


class TestVoiceGuardrailConfig:
    def test_cloud_transcription_disabled_by_default(self):
        assert vg.CLOUD_TRANSCRIPTION_ENABLED is False

    def test_guardrails_enabled_by_default(self):
        assert vg.VOICE_COST_GUARDRAILS_ENABLED is True

    def test_defaults_match_spec(self):
        assert vg.MAX_SINGLE_RECORDING_MINUTES == 10
        assert vg.MAX_MEETING_CAPTURE_MINUTES == 60
        assert vg.FREE_VOICE_MINUTES_PER_DAY == 5


class TestCanRecordVoice:
    def test_reminder_capture_blocked(self):
        ok, msg = asyncio.run(vg.can_record_voice("pid", 1, "reminder"))
        assert not ok
        assert "reminders" in msg.lower()

    def test_single_recording_too_long(self):
        ok, msg = asyncio.run(vg.can_record_voice("pid", 11, "memory"))
        assert not ok
        assert "10 minutes" in msg

    def test_meeting_too_long(self):
        ok, msg = asyncio.run(vg.can_record_voice("pid", 61, "meeting"))
        assert not ok
        assert "60" in msg


class TestCloudTranscriptionBlocked:
    def test_cloud_disabled_message(self):
        ok, msg = asyncio.run(vg.can_use_cloud_transcription("pid", 1, user_confirmed=True))
        assert not ok
        assert "disabled" in msg.lower()

    def test_transcribe_raises_when_disabled(self):
        import ai_pipeline
        with patch.object(ai_pipeline, "CLOUD_TRANSCRIPTION_ENABLED", False):
            with patch.object(ai_pipeline.vg, "record_voice_usage", new_callable=AsyncMock):
                with pytest.raises(HTTPException) as exc:
                    asyncio.run(ai_pipeline.transcribe_audio_cost_safe(
                        "pid", b"\x00", "a.webm", user_confirmed_cloud=True, duration_seconds=5,
                    ))
                assert exc.value.status_code == 403

    def test_voice_usage_reminder_blocked(self):
        token = _demo("patient")["token"]
        r = requests.post(
            f"{API}/voice/usage",
            headers=_h(token),
            json={"minutes": 1, "mode": "browser_speech", "capture_type": "reminder"},
            timeout=15,
        )
        if r.status_code == 404:
            pytest.skip("voice/usage route not on running server")
        assert r.status_code == 403
        assert "reminders" in (r.json().get("detail") or "").lower()


class TestUsageTracking:
    def test_browser_speech_mode_tracked(self):
        assert "browser_speech" in vg.USAGE_MODES
        assert "cloud_transcription_blocked" in vg.USAGE_MODES

    def test_record_voice_usage_integration(self):
        """Live API records browser speech when route is available."""
        token = _demo("patient")["token"]
        r = requests.post(
            f"{API}/voice/usage",
            headers=_h(token),
            json={"minutes": 0.25, "mode": "browser_speech", "capture_type": "memory"},
            timeout=15,
        )
        if r.status_code == 404:
            pytest.skip("voice/usage route not deployed on server")
        assert r.status_code == 200, r.text
        usage = requests.get(f"{API}/usage/today", headers=_h(token), timeout=15)
        assert usage.status_code == 200
        assert usage.json().get("browser_speech_sessions", 0) >= 1


class TestDailyVoiceCap:
    def test_daily_cap_blocks_voice_usage(self):
        from unittest.mock import AsyncMock, patch

        with patch.object(vg, "voice_minutes_recorded_today", new_callable=AsyncMock, return_value=100.0):
            with patch.object(vg, "daily_voice_cap_minutes", new_callable=AsyncMock, return_value=5.0):
                with pytest.raises(HTTPException) as exc:
                    asyncio.run(vg.assert_can_record_voice("pid", 1, "memory"))
                assert exc.value.status_code == 429
                assert "type the note" in exc.value.detail.lower()


class TestNoPaidSttVendors:
    def test_no_google_speech_to_text(self):
        for rel in ["backend/voice_guardrails.py", "backend/ai_pipeline.py", "backend/ai.py"]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            assert "speech.googleapis.com" not in text
            assert "assemblyai" not in text.lower()
            assert "deepgram" not in text.lower()
            assert "rev.ai" not in text.lower()

    def test_smart_capture_reminders_no_transcription(self):
        src = (ROOT / "backend" / "smart_capture_reminders.py").read_text(encoding="utf-8")
        assert "transcribe" not in src.lower()
        assert "no_auto_recording" in src or "no auto-recording" in src.lower()

    def test_frontend_voice_cost_note(self):
        rec = (ROOT / "frontend" / "src" / "pages" / "patient" / "RecordMemory.js").read_text(encoding="utf-8")
        assert "voice-cost-note" in rec
        assert "unexpected costs" in rec.lower()
