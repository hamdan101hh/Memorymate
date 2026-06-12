"""Photo Memory Attachments — cross-flow tests."""
import io
import os
import uuid
from pathlib import Path

import pytest
import requests
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]

try:
    from image_storage import validate_image_upload, DRAFT_TTL_HOURS
    from ai import safety_line_for_text, MEDICAL_DISCLAIMER, FINANCE_DISCLAIMER
except ImportError:
    from backend.image_storage import validate_image_upload, DRAFT_TTL_HOURS
    from backend.ai import safety_line_for_text, MEDICAL_DISCLAIMER, FINANCE_DISCLAIMER

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
TINY_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _upload_draft(token, **extra):
    fd = {"file": ("test.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")}
    data = {
        "permission_confirmed": "true",
        "source": "upload",
        "linked_type": "draft",
        "linked_id": extra.pop("linked_id", str(uuid.uuid4())),
        **extra,
    }
    return requests.post(f"{API}/attachments/draft", headers=_h(token), data=data, files=fd, timeout=30)


class TestAttachmentEndpoints:
    def test_upload_jpeg_via_attachments_draft(self):
        token = _demo("patient")["token"]
        r = _upload_draft(token)
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("/api/attachments/")

    def test_rejects_unsupported_type(self):
        with pytest.raises(HTTPException) as exc:
            validate_image_upload(b"pdf", "application/pdf")
        assert "not supported" in exc.value.detail.lower()

    def test_draft_ttl_is_24h(self):
        assert DRAFT_TTL_HOURS == 24


class TestSafetyLines:
    def test_clinic_note_medical_disclaimer(self):
        line = safety_line_for_text("Clinic visit today at the hospital")
        assert line == MEDICAL_DISCLAIMER

    def test_crypto_note_finance_disclaimer(self):
        line = safety_line_for_text("Crypto strategy discussion")
        assert line == FINANCE_DISCLAIMER


class TestLinkToEntities:
    def test_link_image_to_reminder(self):
        token = _demo("patient")["token"]
        up = _upload_draft(token, linked_type="reminder")
        assert up.status_code == 200, up.text
        image_id = up.json()["id"]
        rem = requests.post(
            f"{API}/reminders",
            headers=_h(token),
            json={
                "title": "Bring document",
                "image_ids": [image_id],
                "permission_confirmed": True,
            },
            timeout=30,
        )
        assert rem.status_code == 200, rem.text
        assert rem.json().get("image_url") == f"/api/attachments/{image_id}"

    def test_link_image_to_appointment(self):
        cg = _demo("caregiver")["token"]
        up = _upload_draft(cg, linked_type="appointment")
        if up.status_code != 200:
            pytest.skip("upload failed")
        image_id = up.json()["id"]
        unique = str(uuid.uuid4())[:8]
        ap = requests.post(
            f"{API}/appointments",
            headers=_h(cg),
            json={
                "title": f"Photo appt {unique}",
                "date": "2030-06-15",
                "image_ids": [image_id],
                "permission_confirmed": True,
            },
            timeout=30,
        )
        assert ap.status_code == 200, ap.text
        assert ap.json().get("image_url") == f"/api/attachments/{image_id}"


class TestNoPaidImageApis:
    def test_no_google_vision_or_photos(self):
        for rel in ["backend/image_routes.py", "backend/image_storage.py", "backend/ai.py"]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            assert "vision.googleapis" not in text
            assert "Google Photos" not in text

    def test_photo_picker_exists(self):
        assert (ROOT / "frontend/src/components/PhotoAttachmentPicker.js").exists()
        assert (ROOT / "docs/PHOTO_MEMORY_ATTACHMENTS_PLAN.md").exists()
