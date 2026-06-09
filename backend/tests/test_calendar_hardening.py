"""Unit tests for the Google Calendar hardening pass.

Pure (no running server / DB) tests for:
  - token encryption at rest (crypto.py): values are not plaintext, round-trip,
    plaintext tolerance, missing-key behavior in production.
  - timezone resolution fallback order/validation (gcal._resolve_tz_value).
  - AI calendar event drafting (rule parser, medical warnings, missing fields).
"""
import importlib
import inspect
from datetime import datetime, timezone

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
