"""WhatsApp bot (Meta Cloud API).

Two directions:
  • Inbound  — patient/family messages the WhatsApp number; we save it as an
    AI-processed memory (same pipeline as the web app) and reply with a summary.
  • Outbound — send reminders / daily summaries to the patient's WhatsApp.

Setup (env):
  WHATSAPP_VERIFY_TOKEN   any string you choose; also pasted into Meta's webhook config
  WHATSAPP_ACCESS_TOKEN   Graph API access token (System User token recommended)
  WHATSAPP_PHONE_NUMBER_ID  the sender phone-number id from Meta
  WHATSAPP_APP_SECRET     (optional) app secret -> verifies request signatures
  WHATSAPP_REMINDER_TEMPLATE (optional) approved template name for proactive reminders
  WHATSAPP_TEMPLATE_LANG  (optional) template language code, default "en_US"
  CRON_SECRET             (optional) shared secret to protect the due-reminders cron

Note on Meta's rules: you may only send FREE-FORM messages within 24h of the user
messaging you. Proactive (unprompted) messages must use a pre-approved template.
"""
import os
import re
import uuid
import hmac
import hashlib
import logging
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from db import db
from auth import get_current_user, require_role, _log
import ai
import routes

logger = logging.getLogger("memorymate.whatsapp")
router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

GRAPH_VERSION = os.environ.get("WHATSAPP_GRAPH_VERSION", "v21.0")
VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "")
ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "")
REMINDER_TEMPLATE = os.environ.get("WHATSAPP_REMINDER_TEMPLATE", "")
TEMPLATE_LANG = os.environ.get("WHATSAPP_TEMPLATE_LANG", "en_US")
CRON_SECRET = os.environ.get("CRON_SECRET", "")

CONFIGURED = bool(ACCESS_TOKEN and PHONE_NUMBER_ID)
NOW = routes.NOW
PROJ = {"_id": 0}


def normalize_phone(phone: str) -> str:
    """Reduce to digits only (E.164 without '+'), as Meta expects."""
    return re.sub(r"\D", "", phone or "")


# ---------------- outbound (Graph API) ----------------
async def _graph_post(path: str, payload: dict) -> dict:
    if not CONFIGURED:
        raise HTTPException(status_code=503, detail="WhatsApp is not configured on the server.")
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{path}"
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, json=payload, headers=headers)
    if r.status_code >= 400:
        logger.warning("WhatsApp send failed %s: %s", r.status_code, r.text)
        raise HTTPException(status_code=502, detail=f"WhatsApp API error: {r.text[:300]}")
    return r.json()


async def send_text(to: str, body: str) -> dict:
    """Free-form message. Only delivered within the 24h customer-service window."""
    return await _graph_post(f"{PHONE_NUMBER_ID}/messages", {
        "messaging_product": "whatsapp", "to": normalize_phone(to),
        "type": "text", "text": {"preview_url": False, "body": body[:4096]},
    })


async def send_template(to: str, name: str, params: list[str] | None = None, lang: str = TEMPLATE_LANG) -> dict:
    """Proactive message via an approved template (required outside the 24h window)."""
    components = []
    if params:
        components = [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}]
    return await _graph_post(f"{PHONE_NUMBER_ID}/messages", {
        "messaging_product": "whatsapp", "to": normalize_phone(to), "type": "template",
        "template": {"name": name, "language": {"code": lang}, "components": components},
    })


async def _download_media(media_id: str) -> tuple[bytes, str] | None:
    """Fetch a media object (e.g. a voice note) and return (bytes, filename)."""
    try:
        headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
        async with httpx.AsyncClient(timeout=30) as client:
            meta = (await client.get(
                f"https://graph.facebook.com/{GRAPH_VERSION}/{media_id}", headers=headers)).json()
            url = meta.get("url")
            if not url:
                return None
            data = (await client.get(url, headers=headers)).content
        return data, "voice.ogg"
    except Exception as e:  # noqa: BLE001
        logger.warning("media download failed: %s", e)
        return None


# ---------------- inbound (webhook) ----------------
async def _link_for(phone: str) -> dict | None:
    return await db.whatsapp_links.find_one({"phone": normalize_phone(phone)}, PROJ)


async def _handle_message(msg: dict) -> None:
    phone = msg.get("from", "")
    link = await _link_for(phone)
    if not link:
        # Unknown sender — invite them to get linked, don't save anything.
        try:
            await send_text(phone, "Hi! This number isn't linked to a MemoryMate account yet. "
                                   "Please ask your family caregiver to add it in the app.")
        except Exception:  # noqa: BLE001
            pass
        return

    pid = link["patient_id"]
    by_user_id = link.get("created_by", "system")
    text = ""
    mtype = msg.get("type")
    if mtype == "text":
        text = (msg.get("text") or {}).get("body", "")
    elif mtype in ("audio", "voice"):
        media = (msg.get(mtype) or {}).get("id")
        dl = await _download_media(media) if media else None
        if dl:
            try:
                text = await ai.transcribe_audio(dl[0], dl[1])
            except Exception:  # noqa: BLE001
                text = ""
        if not text:
            await send_text(phone, "I couldn't understand that voice note — please send it as text.")
            return
    else:
        await send_text(phone, "I can save text or voice notes. Please send one of those.")
        return

    if not text.strip():
        return

    try:
        mem = await routes.save_memory_for_patient(
            pid, text, source="whatsapp", by_user_id=by_user_id,
            by_role=link.get("role", "family"))
    except HTTPException as e:
        if e.status_code == 429:
            await send_text(phone, "Today's saving limit has been reached. Your earlier notes are safe — "
                                   "please try again tomorrow.")
            return
        raise
    summary = mem.get("simple_summary") or "Saved."
    await send_text(phone, f"Saved \u2713\n\n{summary}")


@router.get("/webhook")
async def verify_webhook(request: Request):
    """Meta calls this once to verify the webhook subscription."""
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == VERIFY_TOKEN and VERIFY_TOKEN:
        return PlainTextResponse(params.get("hub.challenge", ""))
    raise HTTPException(status_code=403, detail="Verification failed.")


def _valid_signature(raw: bytes, signature: str) -> bool:
    if not APP_SECRET:
        return True  # signature checking disabled
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.split("=", 1)[1])


@router.post("/webhook")
async def receive_webhook(request: Request):
    raw = await request.body()
    if not _valid_signature(raw, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(status_code=403, detail="Bad signature.")
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {"ok": True}
    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            for msg in (change.get("value", {}) or {}).get("messages", []) or []:
                try:
                    await _handle_message(msg)
                except Exception as e:  # noqa: BLE001
                    logger.warning("inbound handling error: %s", e)
    return {"ok": True}  # always 200 so Meta doesn't retry-storm


# ---------------- caregiver management (authed) ----------------
class LinkCreate(BaseModel):
    phone: str
    name: str | None = ""
    role: str = "family"  # patient | family


class SendBody(BaseModel):
    phone: str
    message: str


@router.get("/status")
async def status(user: dict = Depends(require_role("caregiver", "admin"))):
    return {
        "configured": CONFIGURED,
        "has_verify_token": bool(VERIFY_TOKEN),
        "signature_check": bool(APP_SECRET),
        "reminder_template": REMINDER_TEMPLATE or None,
    }


@router.get("/links")
async def list_links(user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await routes.patient_id_for(user)
    return await db.whatsapp_links.find({"patient_id": pid}, PROJ).to_list(200)


@router.post("/links")
async def add_link(body: LinkCreate, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await routes.patient_id_for(user)
    phone = normalize_phone(body.phone)
    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Enter a valid phone number with country code.")
    if await db.whatsapp_links.find_one({"phone": phone}):
        raise HTTPException(status_code=400, detail="That number is already linked.")
    doc = {"id": uuid.uuid4().hex, "patient_id": pid, "phone": phone,
           "name": body.name or "", "role": body.role if body.role in ("patient", "family") else "family",
           "created_by": user["id"], "created_at": NOW()}
    await db.whatsapp_links.insert_one(doc)
    await _log(user["id"], "whatsapp_link", "whatsapp_link", doc["id"], phone)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/links/{link_id}")
async def remove_link(link_id: str, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await routes.patient_id_for(user)
    await db.whatsapp_links.delete_one({"id": link_id, "patient_id": pid})
    return {"ok": True}


@router.post("/send")
async def send_message(body: SendBody, user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await routes.patient_id_for(user)
    link = await _link_for(body.phone)
    if not link or link["patient_id"] != pid:
        raise HTTPException(status_code=404, detail="That number isn't linked to this patient.")
    await send_text(body.phone, body.message)
    return {"ok": True}


@router.post("/send-summary")
async def send_summary(user: dict = Depends(require_role("caregiver", "admin"))):
    pid = await routes.patient_id_for(user)
    targets = await db.whatsapp_links.find({"patient_id": pid, "role": "patient"}, PROJ).to_list(50)
    if not targets:
        raise HTTPException(status_code=404, detail="Link the patient's WhatsApp number first.")
    d = date.today().isoformat()
    mems = [m for m in await db.memories.find({"patient_id": pid}, PROJ).to_list(500)
            if (m.get("created_at") or "").startswith(d)]
    reminders = await db.reminders.find({"patient_id": pid, "status": "pending"}, PROJ).to_list(100)
    lines = ["Here is your day so far \U0001f499"]
    for m in mems[:6]:
        lines.append(f"\u2022 {m.get('simple_summary') or m.get('title')}")
    if reminders:
        lines.append("\nReminders:")
        for r in reminders[:6]:
            lines.append(f"\u2022 {r.get('title')}")
    body = "\n".join(lines) if (mems or reminders) else "No notes yet today. Have a lovely day \U0001f499"
    sent = 0
    for t in targets:
        try:
            await send_text(t["phone"], body)
            sent += 1
        except Exception:  # noqa: BLE001
            pass
    return {"sent": sent}


@router.post("/cron/due-reminders")
async def cron_due_reminders(request: Request):
    """Hit by a scheduler (e.g. cron-job.org / Render Cron) to push due reminders.
    Protect with header  X-Cron-Secret: <CRON_SECRET>.  Proactive sends use the
    approved template when WHATSAPP_REMINDER_TEMPLATE is set, else a free-form text
    (which only lands if the user messaged within 24h).

    NOTE: Normal reminders are now delivered via Web Push (see notifications.py).
    WhatsApp only carries HIGH-priority (important) reminders here, plus caregiver
    summaries via /send-summary — so users aren't double-notified."""
    if CRON_SECRET and request.headers.get("X-Cron-Secret") != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden.")
    today = date.today().isoformat()
    sent = 0
    due = await db.reminders.find(
        {"due_date": today, "status": "pending", "priority": "high",
         "whatsapp_sent": {"$ne": True}}, PROJ).to_list(500)
    for r in due:
        targets = await db.whatsapp_links.find(
            {"patient_id": r["patient_id"], "role": "patient"}, PROJ).to_list(20)
        for t in targets:
            try:
                if REMINDER_TEMPLATE:
                    await send_template(t["phone"], REMINDER_TEMPLATE, [r.get("title", "your reminder")])
                else:
                    await send_text(t["phone"], f"Reminder \u23f0\n{r.get('title')}")
                sent += 1
            except Exception:  # noqa: BLE001
                pass
        await db.reminders.update_one({"id": r["id"]}, {"$set": {"whatsapp_sent": True}})
    return {"sent": sent, "due": len(due)}
