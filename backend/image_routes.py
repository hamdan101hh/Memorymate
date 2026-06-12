"""Authenticated image upload/serve for memories and meeting notes."""
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from db import db
from auth import get_current_user, _log
from routes import patient_id_for, save_memory_for_patient
import image_storage as imgs
import ai

router = APIRouter(prefix="/api", tags=["images"])
PROJ = {"_id": 0}
NOW = lambda: __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()


@router.post("/memories/draft-images")
async def upload_draft_image(
    file: UploadFile = File(...),
    description: str = Form(""),
    source: str = Form("upload"),
    permission_confirmed: bool = Form(False),
    use_in_summary: bool = Form(True),
    capture_session_id: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
):
    pid = await patient_id_for(user)
    if not permission_confirmed:
        raise HTTPException(status_code=400, detail="Please confirm you have permission to save this photo.")
    data = await file.read()
    mime = imgs.validate_image_upload(data, file.content_type or "")
    count = await imgs.count_draft_images(db, pid, capture_session_id)
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
        "capture_session_id": capture_session_id,
        "linked_memory_id": None,
        "linked_session_id": capture_session_id,
        "status": "draft",
        "expires_at": imgs._expires_at(),
        "storage_path": str(path),
    }
    await db.memory_image_attachments.insert_one(doc)
    await _log(user["id"], "draft_image", "memory_image", image_id)
    return {
        "id": image_id,
        "url": imgs.public_image_path(image_id),
        "description": doc["description"],
        "use_in_summary": doc["use_in_summary"],
        "filename": doc["filename"],
        "status": "draft",
    }


@router.get("/memories/draft-images")
async def list_draft_images(
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
    items = await db.memory_image_attachments.find(q, PROJ).sort("uploaded_at", 1).to_list(20)
    return {
        "images": [
            {
                "id": i["id"],
                "url": imgs.public_image_path(i["id"]),
                "description": i.get("description", ""),
                "use_in_summary": i.get("use_in_summary", True),
                "filename": i.get("filename", ""),
                "source": i.get("source", "upload"),
            }
            for i in items
        ],
        "max_images": imgs.MAX_IMAGES_PER_NOTE,
    }


@router.delete("/memories/draft-images/{image_id}")
async def delete_draft_image(image_id: str, user: dict = Depends(get_current_user)):
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


@router.get("/images/{image_id}")
async def get_image(image_id: str, user: dict = Depends(get_current_user)):
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


class DraftImagePatch(BaseModel):
    description: Optional[str] = None
    use_in_summary: Optional[bool] = None


@router.patch("/memories/draft-images/{image_id}")
async def patch_draft_image(image_id: str, body: DraftImagePatch, user: dict = Depends(get_current_user)):
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


class MeetingSaveBody(BaseModel):
    permission_confirmed: bool = False
    image_ids: List[str] = []


@router.post("/capture/sessions/{sid}/save-meeting-note")
async def save_meeting_note(
    sid: str,
    body: MeetingSaveBody,
    user: dict = Depends(get_current_user),
):
    """Save processed meeting session as a memory after user review."""
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


async def image_context_for_session(pid: str, session_id: str) -> str:
    q = {
        "patient_id": pid,
        "capture_session_id": session_id,
        "status": "draft",
        "use_in_summary": True,
    }
    items = await db.memory_image_attachments.find(q, PROJ).to_list(10)
    lines = []
    for doc in items:
        desc = doc.get("description") or doc.get("filename", "photo")
        lines.append(f"Photo ({doc.get('filename')}): {desc}")
    if not lines:
        return ""
    return "Attached meeting photos:\n" + "\n".join(lines)
