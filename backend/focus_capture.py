"""Focus Capture — manual opt-in sessions only. No hidden listening, no 24/7 recording."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, require_role, _log
from db import db
from routes import patient_id_for, save_memory_for_patient
import cost_control as cc
import image_storage as imgs
import image_upload_guard as img_guard

router = APIRouter(prefix="/api/focus-capture", tags=["focus-capture"])
PROJ = {"_id": 0}
NOW = lambda: datetime.now(timezone.utc).isoformat()

SESSION_STATUSES = frozenset({"active", "paused", "stopped", "saved", "deleted"})
MUTABLE_STATUSES = frozenset({"active", "paused", "stopped"})


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _elapsed_since(start: str | None) -> float:
    dt = _parse_iso(start)
    if not dt:
        return 0.0
    return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())


async def _get_session_for_user(session_id: str, user: dict) -> dict:
    doc = await db.focus_capture_sessions.find_one({"id": session_id, "user_id": user["id"]}, PROJ)
    if not doc or doc.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Focus Capture session not found.")
    return doc


def _public_session(doc: dict) -> dict:
    out = {k: v for k, v in doc.items() if k != "_id"}
    if out.get("status") == "active" and out.get("last_resume_at"):
        extra = _elapsed_since(out.get("last_resume_at"))
        out["live_duration_seconds"] = int(out.get("accumulated_seconds", 0) + extra)
    else:
        out["live_duration_seconds"] = int(out.get("duration_seconds", 0))
    return out


class StartBody(BaseModel):
    title: str = Field(default="Focus Capture session", max_length=200)
    consent_confirmed: bool = False
    linked_appointment_id: Optional[str] = None
    linked_reminder_id: Optional[str] = None


class NotesBody(BaseModel):
    notes_text: Optional[str] = Field(None, max_length=20000)
    transcript_text: Optional[str] = Field(None, max_length=20000)


class AttachImageBody(BaseModel):
    image_id: Optional[str] = None


class AttachImageBody(BaseModel):
    image_id: str = Field(..., min_length=1)


class SaveMemoryBody(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    permission_confirmed: bool = False


@router.get("/config")
async def focus_capture_config(user: dict = Depends(require_role("patient"))):
    profile = await cc.get_or_create_profile(user["id"])
    raw_flags = profile.get("feature_flags") or {}
    enabled = cc.FOCUS_CAPTURE_ENABLED or (
        profile.get("plan") == "admin_test" and raw_flags.get("focus_capture_enabled")
    )
    upload = img_guard.upload_availability_payload()
    return {
        "enabled": enabled,
        "cloud_transcription_enabled": False,
        "audio_persistence": False,
        "uploads_available": upload.get("uploads_available", False),
        "upload_message": upload.get("message"),
    }


@router.get("/session/{session_id}")
async def get_session(session_id: str, user: dict = Depends(require_role("patient"))):
    doc = await _get_session_for_user(session_id, user)
    return _public_session(doc)


@router.post("/session/start")
async def start_session(body: StartBody, user: dict = Depends(require_role("patient"))):
    await cc.assert_focus_capture_allowed(user["id"])
    if not body.consent_confirmed:
        raise HTTPException(
            status_code=400,
            detail="Please confirm you understand Focus Capture starts only when you press Start.",
        )
    pid = await patient_id_for(user)
    active = await db.focus_capture_sessions.find_one(
        {"user_id": user["id"], "status": {"$in": ["active", "paused"]}}, PROJ,
    )
    if active:
        raise HTTPException(status_code=400, detail="A Focus Capture session is already open. Stop it first.")

    now = NOW()
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "user_id": user["id"],
        "patient_id": pid,
        "title": body.title.strip() or "Focus Capture session",
        "status": "active",
        "started_at": now,
        "paused_at": None,
        "stopped_at": None,
        "last_resume_at": now,
        "accumulated_seconds": 0.0,
        "duration_seconds": 0,
        "source": "manual_focus_capture",
        "transcript_text": "",
        "notes_text": "",
        "linked_memory_id": None,
        "linked_appointment_id": body.linked_appointment_id,
        "linked_reminder_id": body.linked_reminder_id,
        "attached_image_ids": [],
        "consent_confirmed": True,
        "cloud_transcription_used": False,
        "estimated_cost_usd": 0.0,
        "created_at": now,
        "updated_at": now,
    }
    await db.focus_capture_sessions.insert_one(doc)
    await _log(user["id"], "focus_capture_start", "focus_capture_session", sid)
    return _public_session(doc)


@router.patch("/session/{session_id}/pause")
async def pause_session(session_id: str, user: dict = Depends(require_role("patient"))):
    doc = await _get_session_for_user(session_id, user)
    if doc["status"] != "active":
        raise HTTPException(status_code=400, detail="Only an active session can be paused.")
    extra = _elapsed_since(doc.get("last_resume_at"))
    accumulated = float(doc.get("accumulated_seconds", 0)) + extra
    now = NOW()
    await db.focus_capture_sessions.update_one(
        {"id": session_id},
        {"$set": {
            "status": "paused",
            "paused_at": now,
            "accumulated_seconds": accumulated,
            "updated_at": now,
        }},
    )
    return _public_session(await _get_session_for_user(session_id, user))


@router.patch("/session/{session_id}/resume")
async def resume_session(session_id: str, user: dict = Depends(require_role("patient"))):
    doc = await _get_session_for_user(session_id, user)
    if doc["status"] != "paused":
        raise HTTPException(status_code=400, detail="Only a paused session can be resumed.")
    now = NOW()
    await db.focus_capture_sessions.update_one(
        {"id": session_id},
        {"$set": {
            "status": "active",
            "paused_at": None,
            "last_resume_at": now,
            "updated_at": now,
        }},
    )
    return _public_session(await _get_session_for_user(session_id, user))


@router.patch("/session/{session_id}/stop")
async def stop_session(session_id: str, user: dict = Depends(require_role("patient"))):
    doc = await _get_session_for_user(session_id, user)
    if doc["status"] not in ("active", "paused"):
        raise HTTPException(status_code=400, detail="Session is not active.")
    accumulated = float(doc.get("accumulated_seconds", 0))
    if doc["status"] == "active":
        accumulated += _elapsed_since(doc.get("last_resume_at"))
    now = NOW()
    duration = int(accumulated)
    await db.focus_capture_sessions.update_one(
        {"id": session_id},
        {"$set": {
            "status": "stopped",
            "stopped_at": now,
            "accumulated_seconds": accumulated,
            "duration_seconds": duration,
            "updated_at": now,
        }},
    )
    await cc.record_focus_capture_usage(user["id"], duration)
    return _public_session(await _get_session_for_user(session_id, user))


@router.patch("/session/{session_id}/notes")
async def update_notes(session_id: str, body: NotesBody, user: dict = Depends(require_role("patient"))):
    doc = await _get_session_for_user(session_id, user)
    if doc["status"] == "deleted":
        raise HTTPException(status_code=400, detail="Session was deleted.")
    update: dict = {"updated_at": NOW()}
    if body.notes_text is not None:
        update["notes_text"] = body.notes_text.strip()
    if body.transcript_text is not None:
        update["transcript_text"] = body.transcript_text.strip()
    await db.focus_capture_sessions.update_one({"id": session_id}, {"$set": update})
    return _public_session(await _get_session_for_user(session_id, user))


@router.post("/session/{session_id}/attach-image")
async def attach_image(
    session_id: str,
    body: AttachImageBody,
    user: dict = Depends(require_role("patient")),
):
    doc = await _get_session_for_user(session_id, user)
    if doc["status"] not in MUTABLE_STATUSES:
        raise HTTPException(status_code=400, detail="Cannot attach photos to this session.")
    pid = doc["patient_id"]
    img_doc = await db.memory_image_attachments.find_one(
        {"id": body.image_id, "patient_id": pid, "status": "draft"}, PROJ,
    )
    if not img_doc:
        raise HTTPException(status_code=404, detail="Image not found.")
    await db.memory_image_attachments.update_one(
        {"id": body.image_id},
        {"$set": {"linked_type": "focus_capture", "linked_id": session_id}},
    )
    ids = list(doc.get("attached_image_ids") or [])
    if body.image_id not in ids:
        if len(ids) >= imgs.MAX_IMAGES_PER_NOTE:
            raise HTTPException(status_code=400, detail=f"Maximum {imgs.MAX_IMAGES_PER_NOTE} images per session.")
        ids.append(body.image_id)
    await db.focus_capture_sessions.update_one(
        {"id": session_id},
        {"$set": {"attached_image_ids": ids, "updated_at": NOW()}},
    )
    await _log(user["id"], "focus_capture_attach_image", "focus_capture_session", session_id, body.image_id)
    return _public_session(await _get_session_for_user(session_id, user))


async def _session_image_ids(pid: str, session_id: str, doc: dict) -> List[str]:
    rows = await db.memory_image_attachments.find(
        {
            "patient_id": pid,
            "linked_type": "focus_capture",
            "linked_id": session_id,
            "status": "draft",
        },
        {"_id": 0, "id": 1},
    ).to_list(imgs.MAX_IMAGES_PER_NOTE)
    ids = [r["id"] for r in rows]
    if ids:
        return ids
    return list(doc.get("attached_image_ids") or [])


@router.post("/session/{session_id}/save-memory")
async def save_as_memory(session_id: str, body: SaveMemoryBody, user: dict = Depends(require_role("patient"))):
    doc = await _get_session_for_user(session_id, user)
    if doc["status"] not in ("active", "paused", "stopped"):
        raise HTTPException(status_code=400, detail="Session cannot be saved.")
    pid = doc["patient_id"]
    image_ids = await _session_image_ids(pid, session_id, doc)
    if image_ids and not body.permission_confirmed:
        raise HTTPException(status_code=400, detail="Please confirm permission to save attached photos.")

    parts = []
    if doc.get("notes_text"):
        parts.append(doc["notes_text"].strip())
    if doc.get("transcript_text"):
        parts.append(doc["transcript_text"].strip())
    text = "\n\n".join(parts).strip()
    if not text:
        text = f"Focus Capture session: {doc.get('title', 'Session')}"

    mem = await save_memory_for_patient(
        pid,
        text,
        title=body.title or doc.get("title") or "Focus Capture note",
        source="focus_capture",
        skip_ai=True,
        image_ids=image_ids or None,
        by_user_id=user["id"],
        by_role=user["role"],
    )

    now = NOW()
    duration = int(doc.get("duration_seconds", 0))
    if doc["status"] == "active":
        duration = int(float(doc.get("accumulated_seconds", 0)) + _elapsed_since(doc.get("last_resume_at")))
    await db.focus_capture_sessions.update_one(
        {"id": session_id},
        {"$set": {
            "status": "saved",
            "linked_memory_id": mem["id"],
            "duration_seconds": duration,
            "stopped_at": doc.get("stopped_at") or now,
            "estimated_cost_usd": 0.0,
            "cloud_transcription_used": False,
            "updated_at": now,
        }},
    )
    await _log(user["id"], "focus_capture_save_memory", "memory", mem["id"], session_id)
    return {"session": _public_session(await _get_session_for_user(session_id, user)), "memory": mem}


@router.delete("/session/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(require_role("patient"))):
    doc = await _get_session_for_user(session_id, user)
    if doc["status"] == "deleted":
        return {"ok": True}
    await db.focus_capture_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "deleted", "updated_at": NOW()}},
    )
    await _log(user["id"], "focus_capture_delete", "focus_capture_session", session_id)
    return {"ok": True}
