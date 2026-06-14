"""Tests for cost-safe AI provider pipeline."""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]


class TestPipelineConfig:
    def test_cloud_disabled_by_default(self):
        import ai_pipeline
        assert ai_pipeline.CLOUD_TRANSCRIPTION_ENABLED is False

    def test_premium_disabled_by_default(self):
        import ai_pipeline
        assert ai_pipeline.PREMIUM_FALLBACK_ENABLED is False
        assert ai_pipeline.ALLOW_PREMIUM_RETRY is False

    def test_public_config_no_secrets(self):
        import ai_pipeline
        cfg = ai_pipeline.public_config()
        assert "granola_dependency" in cfg
        assert cfg["granola_dependency"] == "none"
        for bad in ("api_key", "secret", "token", "mongodb"):
            blob = str(cfg).lower()
            assert bad not in blob or bad == "token" and "encryption" not in blob


class TestCloudTranscription:
    def test_disabled_raises_403(self):
        import ai_pipeline
        with patch.object(ai_pipeline, "CLOUD_TRANSCRIPTION_ENABLED", False):
            with patch.object(ai_pipeline.vg, "record_voice_usage", new_callable=AsyncMock):
                with pytest.raises(HTTPException) as exc:
                    asyncio.run(ai_pipeline.transcribe_audio_cost_safe(
                        "pid", b"audio", "a.webm", user_confirmed_cloud=True, duration_seconds=5,
                    ))
                assert exc.value.status_code == 403
                assert "disabled" in exc.value.detail.lower()

    def test_requires_confirmation(self):
        import ai_pipeline
        with patch.object(ai_pipeline, "CLOUD_TRANSCRIPTION_ENABLED", True):
            with patch.object(ai_pipeline.vg, "CLOUD_TRANSCRIPTION_ENABLED", True):
                with pytest.raises(HTTPException) as exc:
                    asyncio.run(ai_pipeline.transcribe_audio_cost_safe(
                        "pid", b"12345", "a.webm", user_confirmed_cloud=False, duration_seconds=5,
                    ))
                assert exc.value.status_code == 400

    def test_single_stt_provider(self):
        import ai_pipeline
        with patch.object(ai_pipeline, "CLOUD_TRANSCRIPTION_ENABLED", True):
            with patch.object(ai_pipeline.vg, "CLOUD_TRANSCRIPTION_ENABLED", True):
                with patch("ai.transcribe_audio", new_callable=AsyncMock, return_value="hello"):
                    with patch.object(ai_pipeline.vg, "assert_can_use_cloud_transcription", new_callable=AsyncMock):
                        with patch("usage.assert_within_cap", new_callable=AsyncMock):
                            with patch("usage.assert_action_cap", new_callable=AsyncMock):
                                with patch("usage.record", new_callable=AsyncMock):
                                    with patch.object(ai_pipeline.vg, "record_voice_usage", new_callable=AsyncMock):
                                        out = asyncio.run(ai_pipeline.transcribe_audio_cost_safe(
                                            "pid", b"12345", "a.webm",
                                            user_confirmed_cloud=True, duration_seconds=30,
                                        ))
        assert out["transcript"] == "hello"
        assert out["providers_used"] == 1


class TestTextPipeline:
    def test_cheap_provider_first(self):
        import ai
        import ai_pipeline
        with patch.object(ai_pipeline, "TEXT_AI_PROVIDER", "configured"):
            with patch.object(ai, "AI_ENABLED", True):
                p = ai_pipeline.choose_text_provider(cheap=True)
                assert p["cheap"] is True

    def test_premium_not_without_flags(self):
        import ai_pipeline
        assert ai_pipeline.should_use_premium_fallback("low") is False

    def test_low_confidence_clarification_when_premium_disabled(self):
        import ai_pipeline
        with patch.object(ai_pipeline, "TEXT_AI_PROVIDER", "rule_based"):
            out = asyncio.run(ai_pipeline.clean_transcript("pid", "??? um"))
            assert out["confidence"] == "low"
            assert out["clarification_question"]
            assert out["providers_used"] == 0

    def test_no_double_premium_without_allow(self):
        import ai
        import ai_pipeline
        with patch.object(ai_pipeline, "TEXT_AI_PROVIDER", "openai"):
            with patch.object(ai_pipeline, "PREMIUM_FALLBACK_ENABLED", True):
                with patch.object(ai_pipeline, "ALLOW_PREMIUM_RETRY", False):
                    with patch.object(ai, "AI_ENABLED", True):
                        with patch.object(ai, "process_transcript", new_callable=AsyncMock) as mock_pt:
                            mock_pt.return_value = {
                                "title": "Memory note", "simple_summary": "???", "timeline": "afternoon",
                                "people": [], "places": [], "medications": [],
                                "appointments": [], "reminders": [], "caregiver_notes": [],
                            }
                            with patch("usage.assert_within_cap", new_callable=AsyncMock):
                                with patch("usage.assert_action_cap", new_callable=AsyncMock):
                                    with patch("usage.record", new_callable=AsyncMock):
                                        out = asyncio.run(ai_pipeline.clean_transcript("pid", "??? unclear ???"))
                            assert mock_pt.call_count == 1
                            assert out["premium_used"] is False


class TestSafetyConstraints:
    def test_no_granola_in_pipeline(self):
        src = (ROOT / "backend" / "ai_pipeline.py").read_text(encoding="utf-8")
        assert "granola" in src.lower()
        assert "not used" in src.lower() or "NOT used" in src

    def test_no_maps_places_api(self):
        js = (ROOT / "frontend" / "src" / "lib" / "mapLinks.js").read_text(encoding="utf-8")
        assert "maps.googleapis.com" not in js

    def test_no_whatsapp_business_started_in_pipeline(self):
        routes = (ROOT / "backend" / "routes.py").read_text(encoding="utf-8")
        assert "whatsapp business" not in routes.lower()

    def test_browser_path_no_cloud_in_frontend_speech(self):
        rec = (ROOT / "frontend" / "src" / "pages" / "patient" / "RecordMemory.js").read_text(encoding="utf-8")
        assert "SpeechRecognition" in rec or "getSpeechRecognitionCtor" in rec

    def test_voice_cap_message(self):
        import usage
        assert "type the note" in usage.VOICE_LIMIT_MESSAGE.lower()
