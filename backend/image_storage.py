"""Local patient image attachments — no paid cloud storage."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

UPLOAD_ROOT = Path(__file__).parent / "uploads" / "patient_images"
MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))
MAX_IMAGES_PER_NOTE = int(os.environ.get("MAX_IMAGES_PER_NOTE", "3"))
DRAFT_TTL_HOURS = 24

ALLOWED_MIME = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
EXT_FOR_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=DRAFT_TTL_HOURS)).isoformat()


def validate_image_upload(data: bytes, content_type: str) -> str:
    if not data:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large (max 5MB).")
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use JPG, PNG, or WebP.")
    return mime


def patient_dir(pid: str) -> Path:
    d = UPLOAD_ROOT / pid
    d.mkdir(parents=True, exist_ok=True)
    return d


def file_path(pid: str, image_id: str, ext: str) -> Path:
    return patient_dir(pid) / f"{image_id}{ext}"


def public_image_path(image_id: str) -> str:
    return f"/api/images/{image_id}"


async def count_draft_images(db, pid: str, session_id: Optional[str] = None) -> int:
    q = {"patient_id": pid, "status": "draft"}
    if session_id:
        q["capture_session_id"] = session_id
    return await db.memory_image_attachments.count_documents(q)


async def link_images_to_memory(db, pid: str, mem_id: str, image_ids: list) -> None:
    if not image_ids:
        return
    now = _now_iso()
    for iid in image_ids[:MAX_IMAGES_PER_NOTE]:
        await db.memory_image_attachments.update_one(
            {"id": iid, "patient_id": pid, "status": "draft"},
            {"$set": {"status": "saved", "linked_memory_id": mem_id, "expires_at": None, "saved_at": now}},
        )
    primary = image_ids[0]
    await db.memories.update_one(
        {"id": mem_id},
        {"$set": {"image_url": public_image_path(primary), "image_ids": image_ids[:MAX_IMAGES_PER_NOTE]}},
    )


async def image_context_text(db, pid: str, image_ids: Optional[list] = None, session_id: Optional[str] = None) -> str:
    """Build text block from draft image descriptions for AI prompts."""
    q = {"patient_id": pid, "status": "draft", "use_in_summary": True}
    if image_ids:
        q["id"] = {"$in": image_ids}
    elif session_id:
        q["capture_session_id"] = session_id
    else:
        return ""
    items = await db.memory_image_attachments.find(q, {"_id": 0, "filename": 1, "description": 1}).to_list(10)
    lines = []
    for doc in items:
        desc = (doc.get("description") or "").strip() or doc.get("filename", "photo")
        lines.append(f"- {doc.get('filename', 'photo')}: {desc}")
    if not lines:
        return ""
    return "Attached photos:\n" + "\n".join(lines)
