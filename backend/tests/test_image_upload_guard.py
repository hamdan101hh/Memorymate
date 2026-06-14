"""Tests for production image upload guard — no ephemeral local disk in prod by default."""
import os
from pathlib import Path

import pytest
import requests

ROOT = Path(__file__).resolve().parents[2]

try:
    from image_upload_guard import (
        UPLOAD_BLOCKED_MESSAGE,
        image_uploads_available,
        image_storage_mode,
        is_production_environment,
    )
except ImportError:
    from backend.image_upload_guard import (
        UPLOAD_BLOCKED_MESSAGE,
        image_uploads_available,
        image_storage_mode,
        is_production_environment,
    )

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _reset_guard_env(monkeypatch, **env):
    keys = [
        "ENVIRONMENT", "APP_ENV", "NODE_ENV", "RENDER", "ENABLE_DEMO",
        "IMAGE_UPLOADS_ENABLED", "IMAGE_STORAGE_MODE",
        "ALLOW_LOCAL_IMAGE_STORAGE_IN_PRODUCTION",
    ]
    for k in keys:
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)


class TestImageUploadGuardEnv:
    def test_local_dev_allows_uploads_by_default(self, monkeypatch):
        _reset_guard_env(monkeypatch, ENABLE_DEMO="true", ENVIRONMENT="development")
        assert is_production_environment() is False
        assert image_storage_mode() == "local_dev"
        assert image_uploads_available() is True

    def test_production_blocks_local_dev_by_default(self, monkeypatch):
        _reset_guard_env(monkeypatch, ENVIRONMENT="production")
        assert is_production_environment() is True
        assert image_storage_mode() == "disabled"
        assert image_uploads_available() is False

    def test_render_treated_as_production(self, monkeypatch):
        _reset_guard_env(monkeypatch, RENDER="true", ENABLE_DEMO="true")
        assert is_production_environment() is True
        assert image_uploads_available() is False

    def test_image_uploads_enabled_false_blocks(self, monkeypatch):
        _reset_guard_env(monkeypatch, ENABLE_DEMO="true", IMAGE_UPLOADS_ENABLED="false")
        assert image_uploads_available() is False

    def test_production_local_dev_requires_explicit_allow(self, monkeypatch):
        _reset_guard_env(
            monkeypatch,
            ENVIRONMENT="production",
            IMAGE_STORAGE_MODE="local_dev",
            IMAGE_UPLOADS_ENABLED="true",
        )
        assert image_uploads_available() is False
        monkeypatch.setenv("ALLOW_LOCAL_IMAGE_STORAGE_IN_PRODUCTION", "true")
        assert image_uploads_available() is True

    def test_private_object_storage_not_enabled_yet(self, monkeypatch):
        _reset_guard_env(
            monkeypatch,
            ENABLE_DEMO="true",
            IMAGE_STORAGE_MODE="private_object_storage",
            IMAGE_UPLOADS_ENABLED="true",
        )
        assert image_uploads_available() is False

    def test_blocked_message_is_friendly(self):
        assert "save" in UPLOAD_BLOCKED_MESSAGE.lower()
        assert "without photos" in UPLOAD_BLOCKED_MESSAGE.lower()


class TestNoPaidImageStorageApis:
    def test_no_gcs_or_vision_in_guard_module(self):
        text = (ROOT / "backend/image_upload_guard.py").read_text(encoding="utf-8")
        assert "google.cloud" not in text
        assert "vision.googleapis" not in text
        assert "Google Photos" not in text

    def test_no_gcs_in_image_routes(self):
        text = (ROOT / "backend/image_routes.py").read_text(encoding="utf-8")
        assert "google.cloud" not in text
        assert "vision.googleapis" not in text


class TestImageUploadGuardApi:
    def test_upload_config_endpoint(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/attachments/upload-config", headers=_h(token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "uploads_available" in body
        assert "storage_mode" in body

    def test_note_save_without_photo_still_works(self):
        token = _demo("patient")["token"]
        r = requests.post(
            f"{API}/memories",
            headers=_h(token),
            json={
                "transcript": "Note without photos for upload guard test",
                "skip_ai": True,
                "permission_confirmed": True,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("id")
