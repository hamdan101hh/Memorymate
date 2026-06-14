"""Photo Memory Attachments — authenticated upload/serve for all capture flows."""
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from db import db
from auth import get_current_user, _log
from routes import patient_id_for, save_memory_for_patient
import image_storage as imgs
import image_upload_guard as img_guard
import ai

router = APIRouter(prefix="/api", tags=["attachments"])
PROJ = {"_id": 0}
NOW = lambda: __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()


def _ensure_uploads_allowed():
    if not img_guard.image_uploads_available():
        raise HTTPException(status_code=403, detail=img_guard.UPLOAD_BLOCKED_MESSAGE)


@router.get("/attachments/upload-config")
async def get_upload_config(user: dict = Depends(get_current_user)):
    """Whether photo uploads are allowed in this environment (auth-gated like other attachment routes)."""
    return img_guard.upload_availability_payload()


async def _serve_attachment(image_id: str, user: dict):
    pid = await patient_id_for(user)
    doc = await db.memory_image_attachments.find_one(
        {"id": image_id, "patient_id": pid, "status": {"$ne": "deleted"}}, PROJ,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = doc.get("storage_path")
    if not path or not __import__("pathlib").Path(path).is_file():
        raise HTTPException(status_code=404, detail="Image file missing.")
    return FileResponse(path, media_type=doc.get("mime_type", "image/jpeg"))


@router.post("/attachments/draft")
async def upload_draft_attachment(
    file: UploadFile = File(...),
    description: str = Form(""),
    source: str = Form("upload"),
    permission_confirmed: bool = Form(False),
    use_in_summary: bool = Form(True),
    linked_type: str = Form("draft"),
    linked_id: Optional[str] = Form(None),
    capture_session_id: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
):
    """Upload a draft photo attachment (alias: POST /memories/draft-images)."""
    _ensure_uploads_allowed()
    pid = await patient_id_for(user)
    if not permission_confirmed:
        raise HTTPException(status_code=400, detail="Please confirm you have permission to save this photo.")
    lt = linked_type if linked_type in imgs.LINKED_TYPES else "draft"
    lid = linked_id or capture_session_id
    data = await file.read()
    mime = imgs.validate_image_upload(data, file.content_type or "")
    count = await imgs.count_draft_images(
        db, pid, linked_type=lt if lid else None, linked_id=lid, session_id=capture_session_id,
    )
    if count >= imgs.MAX_IMAGES_PER_NOTE:
        raise HTTPException(status_code=400, detail=f"Maximum {imgs.MAX_IMAGES_PER_NOTE} images per note.")
    image_id = str(uuid.uuid4())
    ext = imgs.EXT_FOR_MIME.get(mime, ".jpg")
    path = imgs.file_path(pid, image_id, ext)
    path.write_bytes(data)
    doc = {
        "id": image_id,
        "patient_id": pid,
        "user_id": user["id"],
        "filename": file.filename or f"image{ext}",
        "mime_type": mime,
        "size": len(data),
        "uploaded_at": NOW(),
        "description": (description or "").strip()[:500],
        "source": source if source in ("camera", "upload") else "upload",
        "use_in_summary": use_in_summary,
        "linked_type": lt,
        "linked_id": lid,
        "capture_session_id": capture_session_id or (lid if lt in ("meeting", "conversation") else None),
        "linked_memory_id": None,
        "status": "draft",
        "expires_at": imgs._expires_at(),
        "storage_path": str(path),
    }
    await db.memory_image_attachments.insert_one(doc)
    await _log(user["id"], "draft_attachment", "memory_image", image_id)
    return imgs.serialize_attachment(doc)


@router.post("/memories/draft-images")
async def upload_draft_image_legacy(
    file: UploadFile = File(...),
    description: str = Form(""),
    source: str = Form("upload"),
    permission_confirmed: bool = Form(False),
    use_in_summary: bool = Form(True),
    capture_session_id: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
):
    return await upload_draft_attachment(
        file=file, description=description, source=source,
        permission_confirmed=permission_confirmed, use_in_summary=use_in_summary,
        linked_type="meeting" if capture_session_id else "draft",
        linked_id=capture_session_id, capture_session_id=capture_session_id, user=user,
    )


@router.get("/attachments/draft")
async def list_draft_attachments(
    linked_type: Optional[str] = None,
    linked_id: Optional[str] = None,
    capture_session_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    pid = await patient_id_for(user)
    now = NOW()
    q = {
        "patient_id": pid,
        "status": "draft",
        "$or": [{"expires_at": {"$gt": now}}, {"expires_at": None}],
    }
    if capture_session_id:
        q["capture_session_id"] = capture_session_id
    elif linked_id:
        q["linked_id"] = linked_id
        if linked_type:
            q["linked_type"] = linked_type
    else:
        q["linked_id"] = None
        q["capture_session_id"] = None
    items = await db.memory_image_attachments.find(q, PROJ).sort("uploaded_at", 1).to_list(20)
    return {
        "images": [imgs.serialize_attachment(i) for i in items],
        "max_images": imgs.MAX_IMAGES_PER_NOTE,
    }


@router.get("/memories/draft-images")
async def list_draft_images_legacy(
    capture_session_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    return await list_draft_attachments(
        capture_session_id=capture_session_id, user=user,
    )


@router.delete("/attachments/draft/{image_id}")
async def delete_draft_attachment(image_id: str, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    doc = await db.memory_image_attachments.find_one(
        {"id": image_id, "patient_id": pid, "status": "draft"}, PROJ,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = doc.get("storage_path")
    if path:
        try:
            __import__("pathlib").Path(path).unlink(missing_ok=True)
        except OSError:
            pass
    await db.memory_image_attachments.update_one(
        {"id": image_id}, {"$set": {"status": "deleted", "deleted_at": NOW()}},
    )
    return {"ok": True}


@router.delete("/memories/draft-images/{image_id}")
async def delete_draft_image_legacy(image_id: str, user: dict = Depends(get_current_user)):
    return await delete_draft_attachment(image_id, user)


class DraftAttachmentPatch(BaseModel):
    description: Optional[str] = None
    use_in_summary: Optional[bool] = None


@router.patch("/attachments/draft/{image_id}")
async def patch_draft_attachment(image_id: str, body: DraftAttachmentPatch, user: dict = Depends(get_current_user)):
    pid = await patient_id_for(user)
    doc = await db.memory_image_attachments.find_one(
        {"id": image_id, "patient_id": pid, "status": "draft"}, PROJ,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found.")
    updates = {}
    if body.description is not None:
        updates["description"] = body.description.strip()[:500]
    if body.use_in_summary is not None:
        updates["use_in_summary"] = body.use_in_summary
    if updates:
        await db.memory_image_attachments.update_one({"id": image_id}, {"$set": updates})
    return {"ok": True, "id": image_id, **updates}


@router.patch("/memories/draft-images/{image_id}")
async def patch_draft_image_legacy(image_id: str, body: DraftAttachmentPatch, user: dict = Depends(get_current_user)):
    return await patch_draft_attachment(image_id, body, user)


@router.get("/attachments/{image_id}")
async def get_attachment(image_id: str, user: dict = Depends(get_current_user)):
    return await _serve_attachment(image_id, user)


@router.get("/images/{image_id}")
async def get_image_legacy(image_id: str, user: dict = Depends(get_current_user)):
    return await _serve_attachment(image_id, user)


class AttachmentSaveBody(BaseModel):
    linked_type: str
    linked_id: str


@router.post("/attachments/{image_id}/save")
async def save_attachment_link(image_id: str, body: AttachmentSaveBody, user: dict = Depends(get_current_user)):
    """Mark draft attachment saved and link to memory, reminder, or appointment."""
    pid = await patient_id_for(user)
    doc = await db.memory_image_attachments.find_one(
        {"id": image_id, "patient_id": pid, "status": "draft"}, PROJ,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found.")
    lt = body.linked_type
    lid = body.linked_id
    if lt == "memory":
        await imgs.link_images_to_memory(db, pid, lid, [image_id])
    elif lt == "reminder":
        await imgs.link_images_to_reminder(db, pid, lid, [image_id])
    elif lt == "appointment":
        await imgs.link_images_to_appointment(db, pid, lid, [image_id])
    else:
        await db.memory_image_attachments.update_one(
            {"id": image_id},
            {"$set": {"status": "saved", "linked_type": lt, "linked_id": lid, "expires_at": None, "saved_at": NOW()}},
        )
    return {"ok": True, "id": image_id}


class MeetingSaveBody(BaseModel):
    permission_confirmed: bool = False
    image_ids: List[str] = []


@router.post("/capture/sessions/{sid}/save-meeting-note")
async def save_meeting_note(
    sid: str,
    body: MeetingSaveBody,
    user: dict = Depends(get_current_user),
):
    pid = await patient_id_for(user)
    if not body.permission_confirmed:
        raise HTTPException(status_code=400, detail="Please confirm before saving.")
    session = await db.capture_sessions.find_one({"id": sid, "patient_id": pid}, PROJ)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    summary = session.get("meeting_summary") or {}
    transcript = session.get("stored_transcript") or ""
    image_lines = []
    for iid in body.image_ids:
        doc = await db.memory_image_attachments.find_one({"id": iid, "patient_id": pid}, PROJ)
        if doc and doc.get("use_in_summary") and doc.get("description"):
            image_lines.append(f"- {doc['filename']}: {doc['description']}")
    parts = [
        f"Meeting: {session.get('title', 'Meeting')}",
        summary.get("summary", ""),
        transcript[:2000],
    ]
    if image_lines:
        parts.append("Attached photos:\n" + "\n".join(image_lines))
    if summary.get("disclaimer"):
        parts.append(summary["disclaimer"])
    text = "\n\n".join(p for p in parts if p).strip()
    mem = await save_memory_for_patient(
        pid, text, title=session.get("title", "Meeting note"),
        source="meeting_capture", by_user_id=user["id"], by_role=user["role"],
        skip_ai=True,
    )
    await imgs.link_images_to_memory(db, pid, mem["id"], body.image_ids)
    return {"memory": mem, "saved": True}
