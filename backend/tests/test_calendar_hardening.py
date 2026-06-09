"""Unit tests for the Google Calendar hardening pass.

Pure (no running server / DB) tests for:
  - token encryption at rest (crypto.py): values are not plaintext, round-trip,
    plaintext tolerance, missing-key behavior in production.
  - timezone resolution fallback order/validation (gcal._resolve_tz_value).
  - AI calendar event drafting (rule parser, medical warnings, missing fields).
"""
import importlib
import inspect
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException

import crypto
import ai


def _reset_crypto(monkeypatch, **env):
    # Reset module-level warn flag and apply a clean env for each scenario.
    for k in ("TOKEN_ENCRYPTION_KEY", "ENVIRONMENT", "APP_ENV", "ENABLE_DEMO", "JWT_SECRET"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(crypto, "_warned", False, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)


class TestTokenEncryption:
    def test_encrypt_is_not_plaintext(self, monkeypatch):
        _reset_crypto(monkeypatch, TOKEN_ENCRYPTION_KEY="unit-test-key")
        secret = "ya29.super-secret-access-token"
        enc = crypto.encrypt(secret)
        assert enc != secret
        assert secret not in enc
        assert crypto.is_encrypted(enc)
        assert enc.startswith("enc:v1:")

    def test_round_trip(self, monkeypatch):
        _reset_crypto(monkeypatch, TOKEN_ENCRYPTION_KEY="unit-test-key")
        for secret in ("refresh-abc", "id.token.value", "x" * 500):
            assert crypto.decrypt(crypto.encrypt(secret)) == secret

    def test_decrypt_tolerates_legacy_plaintext(self, monkeypatch):
        _reset_crypto(monkeypatch, TOKEN_ENCRYPTION_KEY="unit-test-key")
        assert crypto.decrypt("legacy-plain-token") == "legacy-plain-token"

    def test_none_passthrough(self, monkeypatch):
        _reset_crypto(monkeypatch, TOKEN_ENCRYPTION_KEY="unit-test-key")
        assert crypto.encrypt(None) is None
        assert crypto.decrypt(None) is None

    def test_dev_fallback_without_key(self, monkeypatch):
        # No key + dev -> derive from JWT_SECRET, still works.
        _reset_crypto(monkeypatch, JWT_SECRET="dev-secret", ENABLE_DEMO="true")
        assert crypto.encryption_available() is True
        assert crypto.decrypt(crypto.encrypt("tok")) == "tok"

    def test_production_without_key_fails_safe(self, monkeypatch):
        _reset_crypto(monkeypatch, ENVIRONMENT="production", JWT_SECRET="x")
        assert crypto.encryption_available() is False
        with pytest.raises(RuntimeError):
            crypto.encrypt("tok")

    def test_demo_disabled_treated_as_production(self, monkeypatch):
        _reset_crypto(monkeypatch, ENABLE_DEMO="false", JWT_SECRET="x")
        assert crypto.encryption_available() is False


class TestTimezoneResolution:
    def test_valid_user_value(self):
        gcal = importlib.import_module("gcal")
        assert gcal._resolve_tz_value("Asia/Dubai") == "Asia/Dubai"

    def test_invalid_falls_back(self, monkeypatch):
        gcal = importlib.import_module("gcal")
        monkeypatch.setattr(gcal, "CAL_TIMEZONE", "Europe/London", raising=False)
        assert gcal._resolve_tz_value("Not/AZone") == "Europe/London"

    def test_none_falls_back_to_cal_timezone(self, monkeypatch):
        gcal = importlib.import_module("gcal")
        monkeypatch.setattr(gcal, "CAL_TIMEZONE", "America/New_York", raising=False)
        assert gcal._resolve_tz_value(None) == "America/New_York"

    def test_ultimate_fallback_is_utc(self, monkeypatch):
        gcal = importlib.import_module("gcal")
        monkeypatch.setattr(gcal, "CAL_TIMEZONE", "Bad/Zone", raising=False)
        assert gcal._resolve_tz_value(None) == "UTC"


class TestCalendarEventDraft:
    REF = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)

    def test_tomorrow_at_4pm_draft(self):
        out = ai.parse_calendar_event_rules(
            "Dentist appointment tomorrow at 4 PM, remind me 1 hour before.", self.REF)
        assert out["draft"]["title"]
        assert "dentist" in out["draft"]["title"].lower() or "Dentist" in out["draft"]["title"]
        assert out["draft"]["date"] == "2026-06-08"
        assert out["draft"]["time"] == "16:00"
        assert "hour" in out["draft"]["reminder"].lower()
        assert "ai_used" in out and out["ai_used"] is False

    def test_unclear_date_missing_fields(self):
        out = ai.parse_calendar_event_rules("Call someone soon maybe", self.REF)
        assert "date" in out["missing_fields"]
        assert out["confidence"] in ("low", "medium")

    def test_medical_warning(self):
        out = ai.parse_calendar_event_rules("Medicine review appointment on June 20 at 3 PM", self.REF)
        assert any("medical" in w.lower() or "health" in w.lower() for w in out["warnings"])

    def test_draft_endpoint_shape_via_rules(self):
        # Rule parser output matches API contract fields.
        out = ai.parse_calendar_event_rules("Lunch tomorrow at 1 PM", self.REF)
        for k in ("draft", "confidence", "missing_fields", "warnings"):
            assert k in out
        for k in ("title", "date", "time", "end_time", "all_day", "location", "notes", "reminder"):
            assert k in out["draft"]

    def test_draft_start_without_end_frontend_default(self):
        """Frontend defaults end to start + 1h; rule parser may omit end_time."""
        out = ai.parse_calendar_event_rules("Dentist tomorrow at 4 PM", self.REF)
        assert out["draft"]["time"] == "16:00"
        assert not out["draft"].get("end_time")
        gcal = importlib.import_module("gcal")
        _, end = gcal._normalize_event_times(out["draft"]["time"], "", False)
        assert end == "17:00"

    def test_medical_warning_exact_text(self):
        out = ai.parse_calendar_event_rules("Doctor visit June 20 at 3 PM", self.REF)
        assert "Please review health-related details with a caregiver or doctor." in out["warnings"]

    def test_extracts_location_dubai_mall(self):
        text = "Dentist appointment at Dubai Mall tomorrow at 4 PM, remind me 1 hour before."
        out = ai.parse_calendar_event_rules(text, self.REF)
        assert out["draft"]["location"] == "Dubai Mall"
        assert "dubai mall" not in out["draft"]["title"].lower()

    def test_extracts_multword_location(self):
        out = ai.parse_calendar_event_rules(
            "Doctor visit at Mediclinic Dubai Mall on Friday at 3 PM", self.REF)
        assert out["draft"]["location"] == "Mediclinic Dubai Mall"

    def test_no_location_when_not_mentioned(self):
        out = ai.parse_calendar_event_rules("Dentist tomorrow at 4 PM", self.REF)
        assert out["draft"]["location"] == ""


class TestEventTimeNormalization:
    def test_defaults_end_to_one_hour(self):
        gcal = importlib.import_module("gcal")
        t, e = gcal._normalize_event_times("16:00", "", False)
        assert t == "16:00"
        assert e == "17:00"

    def test_preserves_valid_end_time(self):
        gcal = importlib.import_module("gcal")
        t, e = gcal._normalize_event_times("16:00", "18:00", False)
        assert e == "18:00"

    def test_rejects_end_equal_to_start(self):
        gcal = importlib.import_module("gcal")
        with pytest.raises(HTTPException) as exc:
            gcal._normalize_event_times("16:00", "16:00", False)
        assert exc.value.status_code == 400
        assert "after" in exc.value.detail.lower()

    def test_rejects_end_before_start(self):
        gcal = importlib.import_module("gcal")
        with pytest.raises(HTTPException) as exc:
            gcal._normalize_event_times("16:00", "15:00", False)
        assert exc.value.status_code == 400

    def test_all_day_skips_normalization(self):
        gcal = importlib.import_module("gcal")
        t, e = gcal._normalize_event_times("16:00", "", True)
        assert e == ""


class TestDateAndGoogleErrors:
    def test_normalize_iso_date(self):
        gcal = importlib.import_module("gcal")
        assert gcal._normalize_date_iso("2026-06-10") == "2026-06-10"

    def test_normalize_dd_mm_yyyy_date(self):
        gcal = importlib.import_module("gcal")
        assert gcal._normalize_date_iso("10/06/2026") == "2026-06-10"

    def test_invalid_date_rejected(self):
        gcal = importlib.import_module("gcal")
        with pytest.raises(HTTPException) as exc:
            gcal._normalize_date_iso("not-a-date")
        assert exc.value.status_code == 400
        assert "invalid" in exc.value.detail.lower()

    def test_google_api_disabled_error(self):
        gcal = importlib.import_module("gcal")
        body = json.dumps({
            "error": {
                "code": 403,
                "message": "Google Calendar API has not been used in project 123 before or it is disabled.",
                "errors": [{"reason": "accessNotConfigured"}],
                "details": [{"reason": "SERVICE_DISABLED"}],
            }
        })
        assert "not enabled" in gcal._google_calendar_error_detail(403, body).lower()

    def test_google_insufficient_scope_error(self):
        gcal = importlib.import_module("gcal")
        body = json.dumps({"error": {"code": 403, "message": "Insufficient Permission for scope"}})
        assert "permission" in gcal._google_calendar_error_detail(403, body).lower()

    def test_timed_event_google_payload(self):
        gcal = importlib.import_module("gcal")
        event = gcal._build_google_event(
            "Dentist Appointment", "2026-06-10", "16:00", "17:00",
            False, "Dubai Mall", "notes", "Asia/Dubai",
        )
        assert event["start"] == {"dateTime": "2026-06-10T16:00:00", "timeZone": "Asia/Dubai"}
        assert event["end"] == {"dateTime": "2026-06-10T17:00:00", "timeZone": "Asia/Dubai"}
        assert event["location"] == "Dubai Mall"


class TestMeetingAndAttendees:
    def test_conference_data_when_online_meeting(self):
        gcal = importlib.import_module("gcal")
        event = gcal._build_google_event(
            "Family meeting", "2026-06-10", "17:00", "18:00", False, "", "notes", "Asia/Dubai",
            online_meeting=True, meeting_provider="google_meet", request_id="req-1",
        )
        assert "conferenceData" in event
        assert event["conferenceData"]["createRequest"]["conferenceSolutionKey"]["type"] == "hangoutsMeet"

    def test_no_conference_when_off(self):
        gcal = importlib.import_module("gcal")
        event = gcal._build_google_event(
            "Family meeting", "2026-06-10", "17:00", "18:00", False, "", "notes", "Asia/Dubai",
        )
        assert "conferenceData" not in event

    def test_attendees_in_event_body(self):
        gcal = importlib.import_module("gcal")
        event = gcal._build_google_event(
            "Meet", "2026-06-10", "17:00", "18:00", False, "", "", "UTC",
            attendees=["alice@example.com", "bob@example.com"],
        )
        assert event["attendees"] == [{"email": "alice@example.com"}, {"email": "bob@example.com"}]

    def test_invalid_attendee_returns_400(self):
        gcal = importlib.import_module("gcal")
        with pytest.raises(HTTPException) as exc:
            gcal._normalize_attendees(["not-an-email"])
        assert exc.value.status_code == 400

    def test_duplicate_attendees_deduped(self):
        gcal = importlib.import_module("gcal")
        assert gcal._normalize_attendees(["a@x.com", "A@X.COM"]) == ["a@x.com"]

    def test_extract_meeting_link_from_conference_data(self):
        gcal = importlib.import_module("gcal")
        created = {
            "conferenceData": {
                "entryPoints": [{"entryPointType": "video", "uri": "https://meet.google.com/abc-defg-hij"}],
            }
        }
        assert gcal._extract_meeting_link(created) == "https://meet.google.com/abc-defg-hij"

    def test_extract_hangout_link(self):
        gcal = importlib.import_module("gcal")
        assert gcal._extract_meeting_link({"hangoutLink": "https://meet.google.com/xyz"}) == "https://meet.google.com/xyz"

    def test_no_whatsapp_business_api_in_gcal(self):
        gcal = importlib.import_module("gcal")
        src = inspect.getsource(gcal)
        assert "graph.facebook.com" not in src
        assert "whatsapp" not in src.lower()

    def test_insert_event_uses_conference_data_version(self):
        import asyncio
        from unittest.mock import AsyncMock, patch

        gcal = importlib.import_module("gcal")
        mock_resp = AsyncMock()
        mock_resp.post = AsyncMock(return_value=type("R", (), {"status_code": 200, "text": "{}"})())
        with patch("httpx.AsyncClient") as client_cls:
            client_cls.return_value.__aenter__.return_value = mock_resp
            asyncio.run(gcal._insert_google_event("tok", {"summary": "x"}, with_conference=True))
            _, kwargs = mock_resp.post.call_args
            assert kwargs.get("params") == {"conferenceDataVersion": "1"}

    def test_add_event_response_includes_share_fields(self):
        gcal = importlib.import_module("gcal")
        # Document API contract for frontend share UI.
        import inspect as ins
        src = ins.getsource(gcal.add_event)
        for field in ("html_link", "meeting_link", "hangout_link", "event_status", "meet_warning"):
            assert field in src

    def test_frontend_uses_free_share_links_only(self):
        path = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "caregiver" / "CreateEventWithAI.js"
        src = path.read_text()
        assert "wa.me/?text=" in src
        assert "mailto:?subject=" in src
        assert "graph.facebook.com" not in src
        assert "twilio" not in src.lower()


class TestGoogleEventLocation:
    def test_event_body_includes_location_text(self):
        gcal = importlib.import_module("gcal")
        event = gcal._build_google_event(
            "Dentist Appointment", "2026-06-10", "16:00", "17:00",
            False, "Dubai Mall", "Created from user input", "Asia/Dubai",
        )
        assert event["location"] == "Dubai Mall"
        assert "maps.googleapis.com" not in str(event)

    def test_missing_location_allowed(self):
        gcal = importlib.import_module("gcal")
        event = gcal._build_google_event(
            "Lunch", "2026-06-10", "13:00", "14:00", False, "", "Notes", "UTC",
        )
        assert event["location"] == ""

    def test_no_maps_or_places_api_in_gcal(self):
        gcal = importlib.import_module("gcal")
        src = inspect.getsource(gcal)
        assert "maps.googleapis.com/maps/api" not in src
        assert "places.googleapis.com/v1" not in src
        assert "google.maps" not in src
        assert "import googlemaps" not in src
