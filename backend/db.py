"""MongoDB connection (single shared client)."""
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from mongo_client import mongo_client_kwargs

load_dotenv(Path(__file__).parent / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"], **mongo_client_kwargs())
db = client[os.environ["DB_NAME"]]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.patient_caregiver_links.create_index("caregiver_id")
    await db.patient_caregiver_links.create_index("patient_id")
    await db.push_subscriptions.create_index("endpoint", unique=True)
    await db.push_subscriptions.create_index("user_id")
    await db.push_subscriptions.create_index("patient_id")
    await db.notification_prefs.create_index("user_id", unique=True)
    await db.notification_log.create_index([("patient_id", 1), ("kind", 1), ("day", 1)], unique=True)
    await db.calendar_links.create_index("patient_id", unique=True)
    await db.calendar_activity.create_index([("patient_id", 1), ("created_at", -1)])
    await db.smart_day_drafts.create_index([("patient_id", 1), ("status", 1), ("expires_at", 1)])
    await db.memory_image_attachments.create_index("id", unique=True)
    await db.memory_image_attachments.create_index([("patient_id", 1), ("status", 1)])
    await db.memory_image_attachments.create_index([("patient_id", 1), ("capture_session_id", 1)])
    await db.memory_image_attachments.create_index("expires_at")
    await db.user_cost_profiles.create_index("user_id", unique=True)
    await db.cost_platform_settings.create_index("id", unique=True)
