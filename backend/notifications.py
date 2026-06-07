"""Web Push notifications (VAPID).

Powers calm, family-friendly push for:
  • Patient reminder notifications
  • Caregiver alert notifications
  • Capture status reminders (when Always-On is on)
  • Missed important reminder alerts (to caregivers)
  • Daily summary ready notification
  • Privacy Review pending notification (to caregivers)

Push REPLACES WhatsApp for normal reminders. WhatsApp stays for caregiver
summaries / important alerts.

Everything degrades gracefully: if VAPID keys are not configured, all endpoints
still respond, the frontend simply shows push as "unavailable", and reminders
fall back to in-app / WhatsApp.

Env:
  VAPID_PUBLIC_KEY   base64url public key (also sent to the browser)
  VAPID_PRIVATE_KEY  base64url raw private key
  VAPID_SUBJECT      mailto: or https: contact (default mailto:care@memorymate.app)
  CRON_SECRET        shared secret protecting POST /notifications/cron/run
"""
import os
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from db import db
from auth import get_current_user, _log

logger = logging.getLogger("memorymate.notifications")
router = APIRouter(prefix="/api/notifications", tags=["notifications"])

NOW = lambda: datetime.now(timezone.utc).isoformat()
PROJ = {"_id": 0}

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:care@memorymate.app").strip()
CRON_SECRET = os.environ.get("CRON_SECRET", "")
CONFIGURED = bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)

try:
    from pywebpush import webpush, WebPushException  # type: ignore
except Exception:  # noqa: BLE001 — library optional at runtime
    webpush = None
    WebPushException = Exception  # type: ignore


# ---------------- preferences ----------------
DEFAULT_PREFS = {
    "patient_reminders": True,
    "caregiver_alerts": True,
    "daily_summary": True,
    "privacy_review_alerts": True,
    "capture_status_reminders": True,
    "missed_reminder_alerts": True,
    "quiet_hours_enabled": False,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00",
    # minutes to ADD to UTC to get the user's local time (frontend sends
    # -new Date().getTimezoneOffset()). Used for quiet hours + reminder timing.
    "tz_offset_minutes": 0,
}
_PREF_KEYS = set(DEFAULT_PREFS.keys())


async def get_prefs(user_id: str) -> dict:
    doc = await db.notification_prefs.find_one({"user_id": user_id}, PROJ) or {}
    merged = {**DEFAULT_PREFS}
    for k in _PREF_KEYS:
        if k in doc:
            merged[k] = doc[k]
    return merged


def _in_quiet_hours(prefs: dict, now_utc: datetime | None = None) -> bool:
    if not prefs.get("quiet_hours_enabled"):
        return False
    now_utc = now_utc or datetime.now(timezone.utc)
    local = now_utc + timedelta(minutes=int(prefs.get("tz_offset_minutes", 0) or 0))
    cur = local.strftime("%H:%M")
    start = prefs.get("quiet_hours_start", "22:00")
    end = prefs.get("quiet_hours_end", "07:00")
    if start <= end:
        return start <= cur < end
    # overnight window, e.g. 22:00 → 07:00
    return cur >= start or cur < end


# ---------------- safe wording ----------------
def safe_reminder_body(title: str, tone: str = "gentle") -> str:
    """Calm, non-medical reminder wording. We only ever echo the user's OWN saved
    reminder text — never give medical advice like 'you should take medicine'."""
    title = (title or "").strip()
    if not title:
        return "It may be time for one of your saved reminders."
    if tone == "direct":
        return f"Your saved reminder says: {title}"
    if tone == "family":
        return f"Your family added a reminder: {title}"
    return f"It may be time for your saved reminder — {title}"  # gentle (default)


# ---------------- sending ----------------
async def _push(sub: dict, payload: dict) -> str:
    """Send one push. Returns 'sent' | 'gone' | 'error' | 'skipped'.
    Runs the blocking pywebpush call in a thread so the event loop stays free."""
    if not (CONFIGURED and webpush):
        return "skipped"
    try:
        await asyncio.to_thread(
            webpush,
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUBJECT},
        )
        return "sent"
    except WebPushException as e:  # type: ignore
        code = getattr(getattr(e, "response", None), "status_code", None)
        if code in (404, 410):  # subscription expired/unsubscribed — clean up
            await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
            return "gone"
        logger.warning("push failed (%s): %s", code, e)
        return "error"
    except Exception as e:  # noqa: BLE001
        logger.warning("push error: %s", e)
        return "error"


async def _notify_user(user_id: str, pref_key: str | None, payload: dict,
                       *, bypass_quiet: bool = False) -> int:
    if not user_id:
        return 0
    prefs = await get_prefs(user_id)
    if pref_key and not prefs.get(pref_key, True):
        return 0
    if not bypass_quiet and _in_quiet_hours(prefs):
        return 0
    subs = await db.push_subscriptions.find({"user_id": user_id}, PROJ).to_list(50)
    sent = 0
    for s in subs:
        if await _push(s, payload) == "sent":
            sent += 1
    return sent


async def _patient_user_id(patient_id: str) -> str | None:
    p = await db.patients.find_one({"id": patient_id}, PROJ)
    return p.get("user_id") if p else None


async def notify_patient(patient_id: str, pref_key: str | None, payload: dict,
                         *, bypass_quiet: bool = False) -> int:
    uid = await _patient_user_id(patient_id)
    return await _notify_user(uid, pref_key, payload, bypass_quiet=bypass_quiet) if uid else 0


async def notify_caregivers(patient_id: str, pref_key: str | None, payload: dict,
                            *, bypass_quiet: bool = False) -> int:
    links = await db.patient_caregiver_links.find({"patient_id": patient_id}, PROJ).to_list(100)
    total = 0
    for l in links:
        total += await _notify_user(l["caregiver_id"], pref_key, payload, bypass_quiet=bypass_quiet)
    return total


# ---------------- request models ----------------
class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeBody(BaseModel):
    endpoint: str
    keys: PushKeys
    tz_offset_minutes: int | None = None


class UnsubscribeBody(BaseModel):
    endpoint: str


class PrefsUpdate(BaseModel):
    patient_reminders: bool | None = None
    caregiver_alerts: bool | None = None
    daily_summary: bool | None = None
    privacy_review_alerts: bool | None = None
    capture_status_reminders: bool | None = None
    missed_reminder_alerts: bool | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    tz_offset_minutes: int | None = None


# ---------------- endpoints ----------------
@router.get("/config")
async def config(user: dict = Depends(get_current_user)):
    """Public key + whether push is enabled server-side (frontend gates UI on this)."""
    return {"configured": CONFIGURED, "vapid_public_key": VAPID_PUBLIC_KEY or None}


@router.get("/preferences")
async def read_prefs(user: dict = Depends(get_current_user)):
    return await get_prefs(user["id"])


@router.patch("/preferences")
async def update_prefs(body: PrefsUpdate, user: dict = Depends(get_current_user)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        patch["user_id"] = user["id"]
        await db.notification_prefs.update_one(
            {"user_id": user["id"]}, {"$set": patch}, upsert=True)
    return await get_prefs(user["id"])


@router.post("/subscribe")
async def subscribe(body: SubscribeBody, user: dict = Depends(get_current_user)):
    pid = None
    try:
        from routes import patient_id_for  # lazy to avoid import cycle
        pid = await patient_id_for(user)
    except Exception:  # noqa: BLE001 — caregiver/patient may not be linked yet
        pid = None
    doc = {
        "id": uuid.uuid4().hex, "user_id": user["id"], "role": user["role"],
        "patient_id": pid, "endpoint": body.endpoint,
        "keys": body.keys.model_dump(), "updated_at": NOW(),
    }
    await db.push_subscriptions.update_one(
        {"endpoint": body.endpoint}, {"$set": doc, "$setOnInsert": {"created_at": NOW()}}, upsert=True)
    if body.tz_offset_minutes is not None:
        await db.notification_prefs.update_one(
            {"user_id": user["id"]},
            {"$set": {"user_id": user["id"], "tz_offset_minutes": int(body.tz_offset_minutes)}},
            upsert=True)
    await _log(user["id"], "push_subscribe", "push_subscription", doc["id"])
    return {"ok": True, "configured": CONFIGURED}


@router.post("/unsubscribe")
async def unsubscribe(body: UnsubscribeBody, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({"endpoint": body.endpoint, "user_id": user["id"]})
    return {"ok": True}


@router.post("/test")
async def test_push(user: dict = Depends(get_current_user)):
    if not CONFIGURED:
        raise HTTPException(status_code=503, detail="Push notifications are not configured on the server.")
    payload = {
        "title": "MemoryMate", "body": "Notifications are working — we'll gently keep you posted. 💙",
        "url": "/", "tag": "mm-test", "kind": "test",
    }
    sent = await _notify_user(user["id"], None, payload, bypass_quiet=True)
    if sent == 0:
        raise HTTPException(status_code=404, detail="No active notification device found. Turn on notifications first.")
    return {"ok": True, "sent": sent}


def _local_now(now_utc: datetime, prefs: dict) -> datetime:
    return now_utc + timedelta(minutes=int(prefs.get("tz_offset_minutes", 0) or 0))


@router.post("/cron/run")
async def cron_run(request: Request):
    """Scheduled scan — call every ~5–15 min from a scheduler (Render Cron / cron-job.org).
    Protect with header  X-Cron-Secret: <CRON_SECRET>.
    Idempotent: each item is marked sent / logged per day so it won't repeat."""
    if CRON_SECRET and request.headers.get("X-Cron-Secret") != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden.")
    if not CONFIGURED:
        return {"ok": True, "configured": False, "sent": 0}

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    out = {"reminders": 0, "missed": 0, "daily_summary": 0, "privacy_review": 0, "capture_status": 0}

    patient_ids = [p for p in await db.push_subscriptions.distinct("patient_id") if p]
    for pid in patient_ids:
        s = await db.audio_settings.find_one({"patient_id": pid}, PROJ) or {}
        tone = s.get("reminder_tone", "gentle")
        puid = await _patient_user_id(pid)
        pprefs = await get_prefs(puid) if puid else DEFAULT_PREFS
        loc_now = _local_now(now, pprefs)
        loc_hhmm = loc_now.strftime("%H:%M")

        # 1) Patient reminders due today (time passed, or no time set)
        due = await db.reminders.find(
            {"patient_id": pid, "status": "pending", "due_date": today,
             "push_sent": {"$ne": True}}, PROJ).to_list(200)
        for r in due:
            dt = r.get("due_time") or ""
            if dt and dt > loc_hhmm:
                continue  # not time yet
            payload = {"title": "MemoryMate reminder", "body": safe_reminder_body(r.get("title", ""), tone),
                       "url": "/patient/reminders", "tag": f"reminder-{r['id']}", "kind": "reminder"}
            out["reminders"] += await notify_patient(pid, "patient_reminders", payload)
            await db.reminders.update_one({"id": r["id"]}, {"$set": {"push_sent": True}})

        # 2) Missed high-priority reminders → caregivers
        missed = await db.reminders.find(
            {"patient_id": pid, "status": "missed", "priority": "high",
             "missed_push_sent": {"$ne": True}}, PROJ).to_list(100)
        for r in missed:
            payload = {"title": "Missed reminder", "body": f"A reminder may have been missed: {r.get('title','')}",
                       "url": "/caregiver/reminders", "tag": f"missed-{r['id']}", "kind": "missed_reminder"}
            out["missed"] += await notify_caregivers(pid, "missed_reminder_alerts", payload)
            await db.reminders.update_one({"id": r["id"]}, {"$set": {"missed_push_sent": True}})

        # 3) Privacy review pending → caregivers (once/day)
        pending = await db.privacy_review_items.count_documents({"patient_id": pid, "status": "pending"})
        if pending and not await _logged(pid, "privacy_review", today):
            payload = {"title": "Items to review", "body": f"{pending} item(s) are waiting in Privacy Review.",
                       "url": "/caregiver/capture/review", "tag": "privacy-review", "kind": "privacy_review"}
            out["privacy_review"] += await notify_caregivers(pid, "privacy_review_alerts", payload)
            await _mark_logged(pid, "privacy_review", today)

        # 4) Daily summary ready → patient + caregivers (once/day, only if there were memories)
        if not await _logged(pid, "daily_summary", today):
            has_today = await db.memory_events.count_documents(
                {"patient_id": pid, "created_at": {"$regex": f"^{today}"}})
            if has_today:
                payload = {"title": "Your day so far 💙", "body": "Today's memory summary is ready to read.",
                           "url": "/patient/today", "tag": "daily-summary", "kind": "daily_summary"}
                out["daily_summary"] += await notify_patient(pid, "daily_summary", payload)
                cg_payload = {**payload, "url": "/caregiver/timeline"}
                out["daily_summary"] += await notify_caregivers(pid, "daily_summary", cg_payload)
                await _mark_logged(pid, "daily_summary", today)

        # 5) Capture status reminder → patient (once/day, only when Always-On active)
        if s.get("always_on") and not s.get("capture_paused") and not s.get("private_mode"):
            if not await _logged(pid, "capture_status", today):
                payload = {"title": "Memory Capture is on", "body": "MemoryMate is gently saving useful moments. You can pause or stop anytime.",
                           "url": "/patient", "tag": "capture-status", "kind": "capture_status"}
                out["capture_status"] += await notify_patient(pid, "capture_status_reminders", payload)
                await _mark_logged(pid, "capture_status", today)

    out["ok"] = True
    out["configured"] = True
    return out


# ---------------- per-day dedupe log ----------------
async def _logged(patient_id: str, kind: str, day: str) -> bool:
    return bool(await db.notification_log.find_one({"patient_id": patient_id, "kind": kind, "day": day}))


async def _mark_logged(patient_id: str, kind: str, day: str) -> None:
    await db.notification_log.update_one(
        {"patient_id": patient_id, "kind": kind, "day": day},
        {"$set": {"created_at": NOW()}}, upsert=True)
