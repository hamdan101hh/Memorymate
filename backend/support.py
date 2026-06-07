"""Support / data-rights requests (account deletion, export, access changes).

The public Data Deletion page posts here. We store a lightweight ticket so a human
can action it. This is intentionally public (a person may not be able to log in to
ask for deletion). Keep it minimal and rate-friendly.
"""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from db import db
from auth import require_role

logger = logging.getLogger("memorymate.support")
router = APIRouter(prefix="/api/support", tags=["support"])

NOW = lambda: datetime.now(timezone.utc).isoformat()
PROJ = {"_id": 0}

VALID_ROLES = {"patient", "caregiver", "family"}
VALID_TYPES = {
    "delete_account", "delete_memory_data", "export_data",
    "remove_caregiver", "remove_connector", "other",
}


class SupportRequest(BaseModel):
    full_name: str
    email: EmailStr
    role: str = "patient"
    request_type: str = "other"
    message: str | None = ""


@router.post("/requests")
async def create_request(body: SupportRequest):
    if not body.full_name.strip():
        raise HTTPException(status_code=400, detail="Please enter your name.")
    doc = {
        "id": uuid.uuid4().hex,
        "full_name": body.full_name.strip()[:200],
        "email": str(body.email).lower(),
        "role": body.role if body.role in VALID_ROLES else "patient",
        "request_type": body.request_type if body.request_type in VALID_TYPES else "other",
        "message": (body.message or "").strip()[:4000],
        "status": "open",
        "created_at": NOW(),
    }
    await db.support_requests.insert_one(doc)
    logger.info("support request %s (%s) from %s", doc["id"], doc["request_type"], doc["email"])
    return {"ok": True, "id": doc["id"]}


@router.get("/requests")
async def list_requests(user: dict = Depends(require_role("admin"))):
    return await db.support_requests.find({}, PROJ).sort("created_at", -1).to_list(500)
