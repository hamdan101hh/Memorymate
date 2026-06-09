"""Unit tests for the Google Calendar hardening pass.

Pure (no running server / DB) tests for:
  - token encryption at rest (crypto.py): values are not plaintext, round-trip,
    plaintext tolerance, missing-key behavior in production.
  - timezone resolution fallback order/validation (gcal._resolve_tz_value).
  - AI calendar event drafting (rule parser, medical warnings, missing fields).
"""
import importlib
from datetime import datetime, timezone

import pytest

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
