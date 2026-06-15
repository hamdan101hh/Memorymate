#!/usr/bin/env python3
"""MongoDB restore drill helper — dry-run only.

Does NOT connect to MongoDB, run mongodump/mongorestore, or print secret values.
Checks whether required environment variable NAMES are set locally (set/missing).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ENV = ROOT / "backend" / ".env"
STAGING_ENV = ROOT / "backend" / ".env.staging"

# MemoryMate uses MONGO_URL (not MONGODB_URI) — check both for operator convenience.
REQUIRED_VARS = [
    ("MONGO_URL", "Primary MongoDB connection (secret — set in Render / backend/.env)"),
    ("JWT_SECRET", "JWT signing key (required for auth)"),
    ("ADMIN_PASSWORD", "Admin account password (do not use example default in prod)"),
    ("TOKEN_ENCRYPTION_KEY", "Required if Google Calendar enabled (encrypts OAuth tokens)"),
    ("ENABLE_DEMO", "Must be false on production API"),
    ("CORS_ORIGINS", "Exact frontend origin(s) — not * in production"),
]

OPTIONAL_URI_ALIASES = ["MONGODB_URI"]
STAGING_DRILL_VARS = [
    ("STAGING_MONGO_URL", "Separate staging/dev MongoDB URI — required for restore drill (never production)"),
]


def _load_backend_dotenv() -> None:
    """Load backend/.env and optional backend/.env.staging (gitignored) without printing values."""
    for path in (BACKEND_ENV, STAGING_ENV):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and val and key not in os.environ:
                os.environ[key] = val


def _is_set(name: str) -> bool:
    val = os.environ.get(name)
    if val is None:
        return False
    return bool(str(val).strip())


def _status(name: str) -> str:
    return "set" if _is_set(name) else "missing"


def main() -> int:
    _load_backend_dotenv()

    print("=" * 60)
    print("MemoryMate MongoDB restore drill — dry-run helper")
    print("=" * 60)
    print()
    print("This script does NOT connect to MongoDB or run dump/restore.")
    print("It only checks whether env var NAMES are present (never prints values).")
    print()

    print("--- Restore drill steps (summary) ---")
    steps = [
        "1. Take a fresh backup with mongodump — store OUTSIDE the repo (./backups/ is gitignored).",
        "2. Do NOT commit backup files, BSON dumps, or JSON exports.",
        "3. Do NOT paste MongoDB URIs into docs, chat, or git.",
        "4. Restore to STAGING or DEV first — never production during a drill.",
        "5. On staging: disable prod notifications, keep WHATSAPP_* unset.",
        "6. Run mongorestore against STAGING_MONGO_URL only.",
        "7. Verify API health, login, dashboards, memories/reminders/appointments.",
        "8. Run pytest, frontend build, and optional smoke scripts.",
        "9. Complete sign-off in docs/MONGODB_RESTORE_DRILL_CHECKLIST.md §7.",
        "10. Full checklist: docs/MONGODB_RESTORE_DRILL_CHECKLIST.md",
    ]
    for step in steps:
        print(f"  {step}")
    print()

    print("--- Environment variable presence (set / missing) ---")
    mongo_ok = _is_set("MONGO_URL")
    for name, hint in REQUIRED_VARS:
        print(f"  {name}: {_status(name)}")
        if name == "MONGO_URL" and not mongo_ok:
            for alias in OPTIONAL_URI_ALIASES:
                if _is_set(alias):
                    print(f"    (note: {alias} is set — MemoryMate code uses MONGO_URL)")
    print()

    print("--- Staging restore target (required for live drill) ---")
    staging_ok = True
    for name, hint in STAGING_DRILL_VARS:
        status = _status(name)
        print(f"  {name}: {status}")
        if not _is_set(name):
            staging_ok = False
    if not staging_ok:
        print()
        print("  Restore drill BLOCKED: set STAGING_MONGO_URL to a separate staging/dev database.")
        print("  Do NOT use production MONGO_URL as the mongorestore target.")
    else:
        print()
        print("  Staging URI present — live drill may proceed (staging/dev target only).")
    print()

    missing = [name for name, _ in REQUIRED_VARS if not _is_set(name)]
    if "MONGO_URL" in missing and _is_set("MONGODB_URI"):
        missing = [m for m in missing if m != "MONGO_URL"]
        print("  Note: MONGODB_URI is set but MemoryMate expects MONGO_URL in backend/.env")

    if missing:
        print("Warnings:")
        for name in missing:
            print(f"  - {name} is missing locally (may be OK if only checking staging Render env)")
    else:
        print("All checked variables are set locally.")
    print()

    print("--- Safety reminders ---")
    reminders = [
        "Never commit backups/, *.bson, *.dump, *.archive, or *.mongoexport.json",
        "Restore to staging/dev first — not production",
        "Run smoke tests after restore (see drill checklist §6)",
        "WhatsApp Business API must remain disabled unless approved",
    ]
    for r in reminders:
        print(f"  • {r}")
    print()
    print("Done. Perform the actual drill using docs/MONGODB_RESTORE_DRILL_CHECKLIST.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
