"""Google Calendar connector — privacy-first, consent-based, approval-gated.

Rules enforced here:
  • Read calendar events ONLY after the user connects (OAuth consent).
  • Suggest/import appointments — nothing is imported automatically; the user
    approves each event (calling /import is the approval).
  • Add events to Google Calendar ONLY after explicit approval (/add-event).
  • NEVER edit or delete calendar events. Those endpoints are intentionally absent.

Implemented with plain httpx against Google's OAuth + Calendar REST API, so no
heavy client libraries are required. If GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
are not configured, every endpoint degrades gracefully (status -> configured:false)
and the rest of the app is unaffected.

Env:
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   OAuth client (Google Cloud console)
  GOOGLE_REDIRECT_URI   must match the console, e.g.
                        http://localhost:8000/api/calendar/callback
  FRONTEND_URL          where to send the user back after consent
                        (default http://localhost:3000)
  CAL_TIMEZONE          fallback IANA tz when a patient has no timezone set
  TOKEN_ENCRYPTION_KEY  key used to encrypt OAuth tokens at rest (see crypto.py)

SECURITY: OAuth access/refresh tokens are encrypted at rest via crypto.py before
they touch MongoDB and decrypted only when calling Google. Raw tokens are never
returned to the frontend (/status exposes only the connected email).
"""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import jwt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from db import db
from auth import get_current_user, require_role, _secret, _log
from routes import patient_id_for
import crypto

logger = logging.getLogger("memorymate.gcal")
router = APIRouter(prefix="/api/calendar", tags=["calendar"])

NOW = lambda: datetime.now(timezone.utc).isoformat()
PROJ = {"_id": 0}

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/calendar/callback").strip()
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
CAL_TIMEZONE = os.environ.get("CAL_TIMEZONE", "UTC")
CONFIGURED = bool(CLIENT_ID and CLIENT_SECRET)

SCOPES = "openid email https://www.googleapis.com/auth/calendar.events"
AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


SENSITIVE = ("access_token", "refresh_token", "id_token")


# ---------------- token helpers ----------------
async def _link_for(pid: str) -> dict | None:
    return await db.calendar_links.find_one({"patient_id": pid}, PROJ)


async def _activity(pid: str, user_id: str, kind: str, detail: str = "") -> None:
    """Caregiver-visible calendar history (privacy-safe: titles/email only, no tokens)."""
    await db.calendar_activity.insert_one({
        "id": str(uuid.uuid4()), "patient_id": pid, "user_id": user_id,
        "kind": kind, "detail": detail, "created_at": NOW(),
    })


def _resolve_tz_value(tz: str | None) -> str:
    """Validate an IANA tz name, falling back CAL_TIMEZONE -> UTC."""
    for candidate in (tz, CAL_TIMEZONE, "UTC"):
        if not candidate:
            continue
        try:
            ZoneInfo(candidate)
            return candidate
        except Exception:  # noqa: BLE001
            continue
    return "UTC"


async def _resolve_tz(pid: str, user: dict | None = None) -> str:
    """Timezone order: acting user -> patient profile -> CAL_TIMEZONE -> UTC."""
    if user and user.get("timezone"):
        return _resolve_tz_value(user.get("timezone"))
    patient = await db.patients.find_one({"id": pid}, {"_id": 0, "timezone": 1})
    return _resolve_tz_value((patient or {}).get("timezone"))


async def _exchange_code(code: str) -> dict:
    data = {
        "code": code, "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI, "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(TOKEN_URL, data=data)
    if r.status_code >= 400:
        logger.warning("token exchange failed: %s", r.text)
        raise HTTPException(status_code=502, detail="Google sign-in failed. Please try again.")
    return r.json()


async def _refresh(link: dict) -> str:
    """Return a valid (decrypted) access token, refreshing if needed.

    Tokens are stored encrypted; we decrypt only here, just before calling Google.
    If the refresh is rejected (revoked grant) the link is dropped and a
    'reconnect needed' activity entry is recorded.
    """
    expiry = link.get("token_expiry")
    if link.get("access_token") and expiry:
        try:
            if datetime.fromisoformat(expiry) - datetime.now(timezone.utc) > timedelta(seconds=60):
                return crypto.decrypt(link["access_token"])
        except ValueError:
            pass
    rt = crypto.decrypt(link.get("refresh_token"))
    if not rt:
        raise HTTPException(status_code=401, detail="Calendar needs to be reconnected.")
    data = {
        "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
        "refresh_token": rt, "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(TOKEN_URL, data=data)
    if r.status_code >= 400:
        await db.calendar_links.delete_one({"patient_id": link["patient_id"]})
        await _activity(link["patient_id"], link.get("user_id", ""), "reconnect_needed")
        raise HTTPException(status_code=401, detail="Calendar access expired. Please reconnect.")
    tok = r.json()
    new_expiry = (datetime.now(timezone.utc) + timedelta(seconds=tok.get("expires_in", 3600))).isoformat()
    await db.calendar_links.update_one(
        {"patient_id": link["patient_id"]},
        {"$set": {"access_token": crypto.encrypt(tok["access_token"]),
                  "token_expiry": new_expiry, "updated_at": NOW()}},
    )
    return tok["access_token"]


async def _connected_link(user: dict) -> dict:
    pid = await patient_id_for(user)
    link = await _link_for(pid)
    if not link:
        raise HTTPException(status_code=409, detail="Google Calendar is not connected yet.")
    return link


async def _cal_get(token: str, params: dict) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(EVENTS_URL, params=params, headers={"Authorization": f"Bearer {token}"})
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Could not read your calendar right now.")
    return r.json()


def _simplify(ev: dict) -> dict:
    start = ev.get("start", {}) or {}
    end = ev.get("end", {}) or {}
    all_day = "date" in start
    return {
        "google_event_id": ev.get("id"),
        "title": ev.get("summary", "(no title)"),
        "location": ev.get("location", ""),
        "description": ev.get("description", ""),
        "start": start.get("dateTime") or start.get("date") or "",
        "end": end.get("dateTime") or end.get("date") or "",
        "all_day": all_day,
        "html_link": ev.get("htmlLink", ""),
    }


def _split_dt(iso_or_date: str) -> tuple[str, str]:
    """Return (YYYY-MM-DD, HH:MM) from an event start (date or dateTime)."""
    if not iso_or_date:
        return "", ""
    if "T" in iso_or_date:
        try:
            dt = datetime.fromisoformat(iso_or_date.replace("Z", "+00:00"))
            return dt.date().isoformat(), dt.strftime("%H:%M")
        except ValueError:
            return iso_or_date[:10], ""
    return iso_or_date[:10], ""


# ---------------- OAuth flow ----------------
@router.get("/status")
async def status(user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    link = await _link_for(pid)
    return {
        "configured": CONFIGURED,
        "connected": bool(link),
        "email": link.get("email") if link else None,
        "secure_storage": crypto.encryption_available(),
    }


@router.get("/connect")
async def connect(user: dict = Depends(require_role("caregiver", "admin"))):
    if not CONFIGURED:
        raise HTTPException(status_code=503, detail="Calendar connector is not configured on the server.")
    if not crypto.encryption_available():
        # Fail safe: never store OAuth tokens unencrypted in production.
        raise HTTPException(status_code=503, detail="Secure token storage is not configured (TOKEN_ENCRYPTION_KEY).")
    state = jwt.encode(
        {"sub": user["id"], "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "typ": "gcal_state"},
        _secret(), algorithm="HS256",
    )
    from urllib.parse import urlencode
    params = {
        "client_id": CLIENT_ID, "redirect_uri": REDIRECT_URI, "response_type": "code",
        "scope": SCOPES, "access_type": "offline", "include_granted_scopes": "true",
        "prompt": "consent", "state": state,
    }
    return {"url": f"{AUTH_BASE}?{urlencode(params)}"}


@router.get("/callback")
async def callback(request: Request):
    """Google redirects here after consent. Public (no bearer); identity is in `state`."""
    params = request.query_params
    err = params.get("error")
    if err:
        return RedirectResponse(f"{FRONTEND_URL}/caregiver/calendar?calendar=denied")
    code, state = params.get("code"), params.get("state")
    if not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/caregiver/calendar?calendar=error")
    try:
        payload = jwt.decode(state, _secret(), algorithms=["HS256"])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise ValueError("user gone")
        pid = await patient_id_for(user)
    except Exception:  # noqa: BLE001
        return RedirectResponse(f"{FRONTEND_URL}/caregiver/calendar?calendar=error")

    if not crypto.encryption_available():
        logger.error("calendar callback blocked: TOKEN_ENCRYPTION_KEY missing in production")
        return RedirectResponse(f"{FRONTEND_URL}/caregiver/calendar?calendar=error")
    try:
        tok = await _exchange_code(code)
        access = tok["access_token"]
        async with httpx.AsyncClient(timeout=20) as c:
            info = (await c.get(USERINFO_URL, headers={"Authorization": f"Bearer {access}"})).json()
        expiry = (datetime.now(timezone.utc) + timedelta(seconds=tok.get("expires_in", 3600))).isoformat()
        email = info.get("email", "")
        # Encrypt every sensitive token field before it touches the database.
        doc = {
            "patient_id": pid, "user_id": user["id"], "email": email,
            "access_token": crypto.encrypt(access), "token_expiry": expiry,
            "scope": tok.get("scope", SCOPES), "updated_at": NOW(),
        }
        if tok.get("id_token"):
            doc["id_token"] = crypto.encrypt(tok["id_token"])
        # Keep the existing refresh_token if Google didn't send a new one.
        if tok.get("refresh_token"):
            doc["refresh_token"] = crypto.encrypt(tok["refresh_token"])
        await db.calendar_links.update_one(
            {"patient_id": pid}, {"$set": doc, "$setOnInsert": {"created_at": NOW()}}, upsert=True)
        await _log(user["id"], "calendar_connect", "calendar_link", pid, email)
        await _activity(pid, user["id"], "connected", email)
    except HTTPException:
        return RedirectResponse(f"{FRONTEND_URL}/caregiver/calendar?calendar=error")
    return RedirectResponse(f"{FRONTEND_URL}/caregiver/calendar?calendar=connected")


@router.post("/disconnect")
async def disconnect(user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    await db.calendar_links.delete_one({"patient_id": pid})
    await _log(user["id"], "calendar_disconnect", "calendar_link", pid)
    await _activity(pid, user["id"], "disconnected")
    return {"ok": True}


@router.get("/activity")
async def activity(limit: int = 20, user: dict = Depends(require_role("caregiver", "admin"))):
    """Recent, privacy-safe calendar history for this patient (no tokens)."""
    pid = await patient_id_for(user)
    limit = max(1, min(limit, 50))
    rows = await db.calendar_activity.find({"patient_id": pid}, PROJ).sort("created_at", -1).to_list(limit)
    return rows


# ---------------- read (with permission) ----------------
@router.get("/events")
async def events(days: int = 14, user: dict = Depends(require_role("caregiver", "admin"))):
    link = await _connected_link(user)
    token = await _refresh(link)
    days = max(1, min(days, 90))
    now = datetime.now(timezone.utc)
    data = await _cal_get(token, {
        "timeMin": now.isoformat(), "timeMax": (now + timedelta(days=days)).isoformat(),
        "singleEvents": "true", "orderBy": "startTime", "maxResults": 50,
    })
    return [_simplify(e) for e in data.get("items", [])]


@router.get("/suggestions")
async def suggestions(days: int = 30, user: dict = Depends(require_role("caregiver", "admin"))):
    """Upcoming events the user hasn't imported yet — candidates to approve."""
    pid = await patient_id_for(user)
    link = await _connected_link(user)
    token = await _refresh(link)
    days = max(1, min(days, 90))
    now = datetime.now(timezone.utc)
    data = await _cal_get(token, {
        "timeMin": now.isoformat(), "timeMax": (now + timedelta(days=days)).isoformat(),
        "singleEvents": "true", "orderBy": "startTime", "maxResults": 50,
    })
    imported = {a.get("google_event_id") for a in
                await db.appointments.find({"patient_id": pid, "google_event_id": {"$exists": True}}, PROJ).to_list(500)}
    out = []
    for e in data.get("items", []):
        s = _simplify(e)
        if s["google_event_id"] not in imported:
            out.append(s)
    return out


# ---------------- import (calendar -> MemoryMate, after approval) ----------------
class ImportBody(BaseModel):
    google_event_id: str
    title: str
    date: str | None = ""
    time: str | None = ""
    location: str | None = ""
    notes: str | None = ""
    also_reminder: bool = False


@router.post("/import")
async def import_event(body: ImportBody, user: dict = Depends(require_role("caregiver", "admin"))):
    await _connected_link(user)  # importing requires an active calendar connection
    pid = await patient_id_for(user)
    if await db.appointments.find_one({"patient_id": pid, "google_event_id": body.google_event_id}):
        raise HTTPException(status_code=409, detail="That event was already imported.")
    appt = {
        "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
        "title": body.title.strip() or "Appointment", "doctor_or_clinic": "",
        "date": body.date or "", "time": body.time or "", "location": body.location or "",
        "notes": body.notes or "", "transport_notes": "", "reminder_time": "",
        "google_event_id": body.google_event_id, "source": "google_calendar", "created_at": NOW(),
    }
    await db.appointments.insert_one(appt)
    if body.also_reminder:
        await db.reminders.insert_one({
            "id": str(uuid.uuid4()), "patient_id": pid, "created_by_user_id": user["id"],
            "title": body.title.strip() or "Appointment", "description": "Imported from Google Calendar",
            "category": "appointment", "priority": "medium",
            "due_date": body.date or "", "due_time": body.time or "", "repeat_rule": "none",
            "status": "pending", "source": "google_calendar", "created_at": NOW(), "completed_at": None,
        })
    await _log(user["id"], "calendar_import", "appointment", appt["id"], body.google_event_id)
    await _activity(pid, user["id"], "imported", appt["title"])
    return {k: v for k, v in appt.items() if k != "_id"}


# ---------------- add (MemoryMate -> calendar, after explicit approval) ----------------
class AddEventBody(BaseModel):
    appointment_id: str | None = None
    title: str | None = None
    date: str | None = None
    time: str | None = None
    location: str | None = ""
    notes: str | None = ""


@router.post("/add-event")
async def add_event(body: AddEventBody, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await patient_id_for(user)
    appt = None
    if body.appointment_id:
        appt = await db.appointments.find_one({"id": body.appointment_id, "patient_id": pid}, PROJ)
        if not appt:
            raise HTTPException(status_code=404, detail="Appointment not found.")
        if appt.get("google_event_id"):
            raise HTTPException(status_code=409, detail="This appointment is already on Google Calendar.")
        title, date, time = appt.get("title"), appt.get("date"), appt.get("time")
        location, notes = appt.get("location", ""), appt.get("notes", "")
    else:
        title, date, time = body.title, body.date, body.time
        location, notes = body.location or "", body.notes or ""
    if not title or not date:
        raise HTTPException(status_code=400, detail="A title and date are required to add an event.")

    link = await _connected_link(user)
    token = await _refresh(link)
    tz = await _resolve_tz(pid, user)
    if time:
        start_dt = f"{date}T{time}:00"
        try:
            end_dt = (datetime.fromisoformat(start_dt) + timedelta(hours=1)).isoformat()
        except ValueError:
            end_dt = start_dt
        event = {"summary": title, "location": location, "description": notes or "Added by MemoryMate",
                 "start": {"dateTime": start_dt, "timeZone": tz},
                 "end": {"dateTime": end_dt, "timeZone": tz}}
    else:
        event = {"summary": title, "location": location, "description": notes or "Added by MemoryMate",
                 "start": {"date": date}, "end": {"date": date}}

    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(EVENTS_URL, json=event, headers={"Authorization": f"Bearer {token}"})
    if r.status_code >= 400:
        logger.warning("calendar insert failed: %s", r.text)
        raise HTTPException(status_code=502, detail="Could not add the event to Google Calendar.")
    created = r.json()
    if appt:
        await db.appointments.update_one(
            {"id": appt["id"]}, {"$set": {"google_event_id": created.get("id")}})
    await _log(user["id"], "calendar_add_event", "appointment", appt["id"] if appt else "", created.get("id", ""))
    await _activity(pid, user["id"], "added", title)
    return {"ok": True, "google_event_id": created.get("id"), "html_link": created.get("htmlLink", "")}
