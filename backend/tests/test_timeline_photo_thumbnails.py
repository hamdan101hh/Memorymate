"""Timeline photo thumbnails — API metadata and access controls."""
import io
import os
import uuid
from pathlib import Path

import pytest
import requests

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
TINY_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _upload_draft(token, linked_id=None):
    fd = {"file": ("timeline.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")}
    data = {
        "permission_confirmed": "true",
        "source": "upload",
        "linked_type": "draft",
        "linked_id": linked_id or str(uuid.uuid4()),
    }
    return requests.post(f"{API}/attachments/draft", headers=_h(token), data=data, files=fd, timeout=30)


class TestTimelineMemoryMetadata:
    def test_memory_with_photo_has_thumbnail_fields(self):
        token = _demo("patient")["token"]
        lid = str(uuid.uuid4())
        up = _upload_draft(token, lid)
        assert up.status_code == 200, up.text
        image_id = up.json()["id"]
        mem = requests.post(
            f"{API}/memories",
            headers=_h(token),
            json={
                "transcript": "Clinic visit with photo for timeline.",
                "skip_ai": True,
                "image_ids": [image_id],
                "permission_confirmed": True,
            },
            timeout=30,
        )
        assert mem.status_code == 200, mem.text
        saved = mem.json()
        assert saved.get("image_url") in (
            f"/api/attachments/{image_id}",
            f"/api/images/{image_id}",
        )

        listed = requests.get(f"{API}/memories", headers=_h(token), timeout=30)
        assert listed.status_code == 200
        row = next((m for m in listed.json() if m["id"] == saved["id"]), None)
        assert row is not None
        assert row.get("image_url") == saved["image_url"]

    def test_memory_without_photo_has_no_image_url(self):
        token = _demo("patient")["token"]
        mem = requests.post(
            f"{API}/memories",
            headers=_h(token),
            json={"transcript": "Plain note without photos.", "skip_ai": True},
            timeout=30,
        )
        assert mem.status_code == 200, mem.text
        assert not mem.json().get("image_url")

        listed = requests.get(f"{API}/memories", headers=_h(token), timeout=30)
        row = next((m for m in listed.json() if m["id"] == mem.json()["id"]), None)
        assert row is not None
        assert not row.get("image_url")

    def test_multiple_attachments_show_count(self):
        token = _demo("patient")["token"]
        lid = str(uuid.uuid4())
        ids = []
        for _ in range(2):
            up = _upload_draft(token, lid)
            assert up.status_code == 200, up.text
            ids.append(up.json()["id"])
        mem = requests.post(
            f"{API}/memories",
            headers=_h(token),
            json={
                "transcript": "Memory with two timeline photos.",
                "skip_ai": True,
                "image_ids": ids,
                "permission_confirmed": True,
            },
            timeout=30,
        )
        assert mem.status_code == 200, mem.text
        listed = requests.get(f"{API}/memories", headers=_h(token), timeout=30)
        row = next((m for m in listed.json() if m["id"] == mem.json()["id"]), None)
        assert row is not None
        assert row.get("attachment_count") == 2
        assert len(row.get("image_ids") or []) == 2

    def test_today_summary_timeline_includes_image_metadata(self):
        token = _demo("patient")["token"]
        lid = str(uuid.uuid4())
        up = _upload_draft(token, lid)
        if up.status_code != 200:
            pytest.skip("upload failed")
        image_id = up.json()["id"]
        mem = requests.post(
            f"{API}/memories",
            headers=_h(token),
            json={
                "transcript": "Today summary timeline photo test.",
                "skip_ai": True,
                "image_ids": [image_id],
                "permission_confirmed": True,
            },
            timeout=30,
        )
        assert mem.status_code == 200, mem.text
        summary = requests.get(f"{API}/summary/today", headers=_h(token), timeout=30)
        assert summary.status_code == 200
        buckets = summary.json().get("timeline") or {}
        found = None
        for items in buckets.values():
            for m in items:
                if m.get("id") == mem.json()["id"]:
                    found = m
                    break
        assert found is not None
        assert found.get("image_url")


class TestTimelineImageAccess:
    def test_unauthorized_image_access_blocked(self):
        r = requests.get(f"{API}/attachments/fake-timeline-id", timeout=15)
        assert r.status_code == 401

    def test_missing_image_returns_not_found(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/attachments/{uuid.uuid4()}", headers=_h(token), timeout=15)
        assert r.status_code == 404


class TestNoPaidImageApis:
    def test_timeline_files_no_google_vision_or_photos(self):
        for rel in [
            "frontend/src/pages/caregiver/Timeline.js",
            "frontend/src/pages/patient/TodaySummary.js",
            "frontend/src/components/MemoryVisualTile.js",
        ]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            assert "vision.googleapis" not in text
            assert "Google Photos" not in text
