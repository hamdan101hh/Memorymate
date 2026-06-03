"""MongoDB connection (single shared client)."""
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.patient_caregiver_links.create_index("caregiver_id")
    await db.patient_caregiver_links.create_index("patient_id")
