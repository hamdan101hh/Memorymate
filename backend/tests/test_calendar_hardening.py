"""Unit tests for the Google Calendar hardening pass.

Pure (no running server / DB) tests for:
  - token encryption at rest (crypto.py): values are not plaintext, round-trip,
    plaintext tolerance, missing-key behavior in production.
  - timezone resolution fallback order/validation (gcal._resolve_tz_value).
"""
import importlib

import pytest

import crypto


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
