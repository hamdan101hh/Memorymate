"""Local patient image attachments — Photo Memory Attachments (no paid cloud storage)."""
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List

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

LINKED_TYPES = frozenset({
    "draft", "memory", "reminder", "appointment", "meeting", "conversation",
    "smart_day_draft", "meeting_note",
})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=DRAFT_TTL_HOURS)).isoformat()


def validate_image_upload(data: bytes, content_type: str) -> str:
    if not data:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="This image is too large. Please use an image under 5MB.",
        )
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="This file type is not supported.")
    return mime


def patient_dir(pid: str) -> Path:
    d = UPLOAD_ROOT / pid
    d.mkdir(parents=True, exist_ok=True)
    return d


def file_path(pid: str, image_id: str, ext: str) -> Path:
    return patient_dir(pid) / f"{image_id}{ext}"


def public_image_path(image_id: str) -> str:
    return f"/api/attachments/{image_id}"


def _draft_query(
    pid: str,
    linked_type: Optional[str] = None,
    linked_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict:
    """Scope draft counts per note/context — not globally per patient."""
    q = {"patient_id": pid, "status": "draft"}
    if session_id:
        q["capture_session_id"] = session_id
    elif linked_id:
        q["linked_id"] = linked_id
        if linked_type:
            q["linked_type"] = linked_type
    else:
        q["linked_id"] = None
        q["capture_session_id"] = None
    return q


async def count_draft_images(
    db, pid: str,
    linked_type: Optional[str] = None,
    linked_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> int:
    return await db.memory_image_attachments.count_documents(
        _draft_query(pid, linked_type, linked_id, session_id),
    )


async def _mark_images_saved(
    db, pid: str, image_ids: List[str], linked_type: str, linked_id: str,
) -> None:
    now = _now_iso()
    for iid in image_ids[:MAX_IMAGES_PER_NOTE]:
        await db.memory_image_attachments.update_one(
            {"id": iid, "patient_id": pid, "status": "draft"},
            {
                "$set": {
                    "status": "saved",
                    "linked_type": linked_type,
                    "linked_id": linked_id,
                    "expires_at": None,
                    "saved_at": now,
                },
            },
        )


async def link_images_to_memory(db, pid: str, mem_id: str, image_ids: list) -> None:
    if not image_ids:
        return
    await _mark_images_saved(db, pid, image_ids, "memory", mem_id)
    primary = image_ids[0]
    await db.memories.update_one(
        {"id": mem_id},
        {
            "$set": {
                "image_url": public_image_path(primary),
                "image_ids": image_ids[:MAX_IMAGES_PER_NOTE],
                "attachment_count": min(len(image_ids), MAX_IMAGES_PER_NOTE),
            },
        },
    )


async def link_images_to_reminder(db, pid: str, rid: str, image_ids: list) -> None:
    if not image_ids:
        return
    await _mark_images_saved(db, pid, image_ids, "reminder", rid)
    primary = image_ids[0]
    await db.reminders.update_one(
        {"id": rid},
        {
            "$set": {
                "image_url": public_image_path(primary),
                "image_ids": image_ids[:MAX_IMAGES_PER_NOTE],
                "attachment_count": min(len(image_ids), MAX_IMAGES_PER_NOTE),
            },
        },
    )


async def link_images_to_appointment(db, pid: str, aid: str, image_ids: list) -> None:
    if not image_ids:
        return
    await _mark_images_saved(db, pid, image_ids, "appointment", aid)
    primary = image_ids[0]
    await db.appointments.update_one(
        {"id": aid},
        {
            "$set": {
                "image_url": public_image_path(primary),
                "image_ids": image_ids[:MAX_IMAGES_PER_NOTE],
                "attachment_count": min(len(image_ids), MAX_IMAGES_PER_NOTE),
            },
        },
    )


async def image_context_text(
    db, pid: str,
    image_ids: Optional[list] = None,
    session_id: Optional[str] = None,
    linked_type: Optional[str] = None,
    linked_id: Optional[str] = None,
) -> str:
    """Build text block from draft image descriptions for AI prompts."""
    q = {"patient_id": pid, "status": "draft", "use_in_summary": True}
    if image_ids:
        q["id"] = {"$in": image_ids}
    elif session_id:
        q["capture_session_id"] = session_id
    elif linked_id:
        q["linked_id"] = linked_id
        if linked_type:
            q["linked_type"] = linked_type
    else:
        return ""
    items = await db.memory_image_attachments.find(
        q, {"_id": 0, "filename": 1, "description": 1},
    ).to_list(10)
    lines = []
    for doc in items:
        desc = (doc.get("description") or "").strip() or doc.get("filename", "photo")
        lines.append(f"- {doc.get('filename', 'photo')}: {desc}")
    if not lines:
        return ""
    return "Attached photos:\n" + "\n".join(lines)


def serialize_attachment(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "url": public_image_path(doc["id"]),
        "description": doc.get("description", ""),
        "use_in_summary": doc.get("use_in_summary", True),
        "filename": doc.get("filename", ""),
        "size": doc.get("size", 0),
        "source": doc.get("source", "upload"),
        "status": doc.get("status", "draft"),
        "linked_type": doc.get("linked_type"),
        "linked_id": doc.get("linked_id"),
    }
