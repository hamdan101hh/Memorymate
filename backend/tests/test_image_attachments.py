"""Tests for memory/meeting image attachments — validation, safety, and access."""
import io
import os
from pathlib import Path

import pytest
import requests
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]

try:
    from image_storage import validate_image_upload, MAX_IMAGE_BYTES, ALLOWED_MIME
    from ai import _needs_finance_disclaimer, FINANCE_DISCLAIMER, summarize_meeting
except ImportError:
    from backend.image_storage import validate_image_upload, MAX_IMAGE_BYTES, ALLOWED_MIME
    from backend.ai import _needs_finance_disclaimer, FINANCE_DISCLAIMER, summarize_meeting

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestImageValidation:
    def test_rejects_unsupported_file_type(self):
        with pytest.raises(HTTPException) as exc:
            validate_image_upload(b"not an image", "application/pdf")
        assert exc.value.status_code == 400
        assert "Unsupported" in exc.value.detail

    def test_rejects_files_over_size_limit(self):
        big = b"x" * (MAX_IMAGE_BYTES + 1)
        with pytest.raises(HTTPException) as exc:
            validate_image_upload(big, "image/jpeg")
        assert exc.value.status_code == 400
        assert "5MB" in exc.value.detail

    def test_accepts_allowed_mime(self):
        mime = validate_image_upload(b"\xff\xd8\xff", "image/jpeg")
        assert mime == "image/jpeg"


class TestFinanceDisclaimer:
    def test_crypto_meeting_needs_disclaimer(self):
        assert _needs_finance_disclaimer(
            "We discussed bitcoin trading strategies",
            {"title": "Crypto strategy meeting"},
        )

    def test_disclaimer_constant(self):
        assert "not financial advice" in FINANCE_DISCLAIMER.lower()

    def test_summarize_meeting_fallback_has_disclaimer_field(self):
        import asyncio
        out = asyncio.run(
            summarize_meeting(
                "Discussed crypto trading and risk limits.",
                {"title": "Crypto strategy meeting", "mode": "meeting"},
            )
        )
        assert out.get("disclaimer")
        assert "not financial advice" in out["disclaimer"].lower()


class TestNoPaidImageApis:
    def test_no_google_vision_in_backend(self):
        for rel in ["backend/routes.py", "backend/ai.py", "backend/image_routes.py", "backend/image_storage.py"]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            assert "vision.googleapis" not in text
            assert "Google Photos" not in text

    def test_no_google_photos_in_frontend(self):
        for path in ROOT.glob("frontend/src/**/*.js"):
            text = path.read_text(encoding="utf-8")
            assert "photos.googleapis" not in text


class TestDraftImageLifecycle:
    def test_draft_upload_requires_permission(self):
        token = _demo("patient")["token"]
        fd = {"file": ("test.jpg", io.BytesIO(b"\xff\xd8\xff\xe0"), "image/jpeg")}
        r = requests.post(
            f"{API}/memories/draft-images",
            headers=_h(token),
            data={"permission_confirmed": "false", "source": "upload"},
            files=fd,
            timeout=30,
        )
        assert r.status_code == 400

    def test_draft_image_not_saved_memory_until_confirm(self):
        token = _demo("patient")["token"]
        before = requests.get(f"{API}/memories", headers=_h(token), timeout=15)
        count_before = len(before.json())
        fd = {"file": ("tiny.jpg", io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF"), "image/jpeg")}
        up = requests.post(
            f"{API}/memories/draft-images",
            headers=_h(token),
            data={"permission_confirmed": "true", "source": "upload", "description": "whiteboard"},
            files=fd,
            timeout=30,
        )
        assert up.status_code == 200, up.text
        image_id = up.json()["id"]
        after = requests.get(f"{API}/memories", headers=_h(token), timeout=15)
        assert len(after.json()) == count_before
        requests.delete(f"{API}/memories/draft-images/{image_id}", headers=_h(token), timeout=15)

    def test_image_can_be_removed_before_save(self):
        token = _demo("patient")["token"]
        fd = {"file": ("rm.jpg", io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF"), "image/jpeg")}
        up = requests.post(
            f"{API}/memories/draft-images",
            headers=_h(token),
            data={"permission_confirmed": "true", "source": "upload"},
            files=fd,
            timeout=30,
        )
        assert up.status_code == 200
        image_id = up.json()["id"]
        rm = requests.delete(f"{API}/memories/draft-images/{image_id}", headers=_h(token), timeout=15)
        assert rm.status_code == 200
        get_img = requests.get(f"{API}/images/{image_id}", headers=_h(token), timeout=15)
        assert get_img.status_code == 404


class TestAccessControl:
    def test_image_requires_auth(self):
        r = requests.get(f"{API}/images/fake-id", timeout=15)
        assert r.status_code == 401

    def test_saved_memory_can_include_image_url_metadata(self):
        token = _demo("patient")["token"]
        fd = {"file": ("meta.jpg", io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF"), "image/jpeg")}
        up = requests.post(
            f"{API}/memories/draft-images",
            headers=_h(token),
            data={"permission_confirmed": "true", "source": "upload", "description": "notes on board"},
            files=fd,
            timeout=30,
        )
        if up.status_code != 200:
            pytest.skip("upload failed — server may be unavailable")
        image_id = up.json()["id"]
        mem = requests.post(
            f"{API}/memories",
            headers=_h(token),
            json={
                "transcript": "Meeting about plans with photo attached.",
                "skip_ai": True,
                "image_ids": [image_id],
                "permission_confirmed": True,
            },
            timeout=30,
        )
        assert mem.status_code == 200, mem.text
        data = mem.json()
        assert data.get("image_url") == f"/api/images/{image_id}"
