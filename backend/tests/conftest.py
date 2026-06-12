"""Shared pytest fixtures for integration tests against the live API + MongoDB."""
import os
from datetime import date
from pathlib import Path

import pytest
from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend env so tests share the same DB as the running API server.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _reset_today_ai_usage() -> None:
    """Clear today's ai_usage rows so integration tests do not hit daily action caps."""
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        return
    client = MongoClient(mongo_url)
    db = client[db_name]
    db.ai_usage.delete_many({"day": date.today().isoformat()})


@pytest.fixture(autouse=True)
def _isolate_ai_usage_caps():
    """Each test starts with a fresh daily AI budget (ops + cost counters)."""
    _reset_today_ai_usage()
    yield
