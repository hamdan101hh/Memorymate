#!/usr/bin/env python3
"""Run MongoDB restore drill — staging target only. Never prints URIs or secrets."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def load_env_files() -> None:
    """Load backend/.env and optional gitignored backend/.env.staging (values never printed)."""
    for path in (BACKEND / ".env", BACKEND / ".env.staging"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            if key and val and key not in os.environ:
                os.environ[key] = val


def _valid_mongo_uri(uri: str) -> bool:
    return uri.startswith("mongodb://") or uri.startswith("mongodb+srv://")


def _safe_output_line(line: str) -> bool:
    """Drop lines that may contain connection strings or credentials."""
    lower = line.lower()
    if "mongodb" in lower:
        return False
    if "@" in line:
        return False
    return True


def _print_safe_tool_output(stdout: str, stderr: str) -> None:
    for chunk in (stdout, stderr):
        for line in chunk.splitlines():
            if _safe_output_line(line):
                print(line)


def run(cmd: list[str], env: dict[str, str] | None = None, label: str = "") -> bool:
    result = subprocess.run(
        cmd, check=False, env=env or os.environ, capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"FAIL: {label or 'command'} (exit {result.returncode})")
        _print_safe_tool_output(result.stdout or "", result.stderr or "")
        if "scheme must be" in (result.stderr or ""):
            print("Hint: URI must start with mongodb:// or mongodb+srv:// (check .env.staging)")
        return False
    return True


def health_check_staging(staging_uri: str) -> bool:
    """Brief local API ping against staging DB — no notifications or WhatsApp."""
    drill_env = os.environ.copy()
    drill_env["MONGO_URL"] = staging_uri
    drill_env["ENABLE_DEMO"] = "true"
    for key in list(drill_env):
        if key.startswith("WHATSAPP_"):
            drill_env.pop(key, None)

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server:app", "--port", "8799"],
        cwd=BACKEND,
        env=drill_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ok = False
    try:
        for _ in range(20):
            time.sleep(0.5)
            try:
                with urllib.request.urlopen("http://127.0.0.1:8799/api/", timeout=5) as resp:
                    ok = resp.status == 200
                    if ok:
                        break
            except Exception:
                continue
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    return ok


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="MemoryMate MongoDB restore drill (staging target only).",
        epilog=(
            "Requires MONGO_URL (source dump) and STAGING_MONGO_URL (restore target) in the "
            "environment or backend/.env / backend/.env.staging (gitignored). "
            "Never paste URI values into docs or git. Backups go under ./backups/ (gitignored)."
        ),
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip brief local GET /api/ health check after restore",
    )
    parser.add_argument(
        "--force-dump",
        action="store_true",
        help="Run mongodump even if a backup for today already exists",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    load_env_files()

    mongo = (os.environ.get("MONGO_URL") or "").strip()
    staging = (os.environ.get("STAGING_MONGO_URL") or "").strip()
    db_name = (os.environ.get("DB_NAME") or "memorymate").strip()

    if not mongo:
        print("FAIL: MONGO_URL missing (set in environment or backend/.env)")
        return 1
    if not staging:
        print("FAIL: STAGING_MONGO_URL missing")
        print("Set in environment or backend/.env.staging (gitignored — never commit)")
        return 1
    if mongo == staging:
        print("FAIL: MONGO_URL and STAGING_MONGO_URL are identical — aborting")
        return 1
    if not _valid_mongo_uri(mongo):
        print("FAIL: MONGO_URL has invalid scheme (must be mongodb:// or mongodb+srv://)")
        return 1
    if not _valid_mongo_uri(staging):
        print("FAIL: STAGING_MONGO_URL has invalid scheme (must be mongodb:// or mongodb+srv://)")
        return 1

    backup_dir = ROOT / "backups" / f"{date.today().isoformat()}-memorymate"
    backup_data = backup_dir / db_name
    backup_dir.mkdir(parents=True, exist_ok=True)

    dump_ok = True
    restore_ok = True
    health_ok = True

    print("=== MemoryMate restore drill (staging target only) ===")
    print("Env: MONGO_URL (source dump) + STAGING_MONGO_URL (restore target)")
    print(f"Backup dir: backups/{backup_dir.name}/ (gitignored — do not commit)")
    print("mongorestore uses parent dump folder, not inner memorymate/ alone")
    print()

    has_backup = backup_data.is_dir() and any(backup_data.glob("*.bson"))
    if has_backup and not args.force_dump:
        print("[1/3] SKIP mongodump — using existing backup for today")
    else:
        print("[1/3] mongodump (read-only from source)...")
        dump_ok = run(
            ["mongodump", "--uri", mongo, "--db", db_name, "--out", str(backup_dir)],
            label="mongodump",
        )

    if dump_ok:
        print("[2/3] mongorestore to staging (--drop)...")
        # Parent dump dir from mongodump --out (contains memorymate/*.bson), not the inner DB folder alone
        restore_ok = run(
            ["mongorestore", "--uri", staging, "--drop", str(backup_dir)],
            label="mongorestore",
        )
    else:
        restore_ok = False
        print("[2/3] SKIP mongorestore — mongodump failed")

    if restore_ok and not args.skip_health_check:
        print("[3/3] Brief staging API health check (local :8799, WhatsApp env cleared)...")
        health_ok = health_check_staging(staging)
        print("OK: staging API health 200" if health_ok else "WARN: staging API health check failed")
    elif args.skip_health_check:
        print("[3/3] SKIP health check (--skip-health-check)")
        health_ok = True
    else:
        health_ok = False
        print("[3/3] SKIP health check — mongorestore failed")

    print()
    overall = dump_ok and restore_ok and health_ok
    print("--- summary ---")
    print(f"  mongodump: {'PASS' if dump_ok else 'FAIL'}")
    print(f"  mongorestore (staging): {'PASS' if restore_ok else 'FAIL'}")
    if not args.skip_health_check:
        print(f"  health_check: {'PASS' if health_ok else 'FAIL'}")
    print(f"  overall: {'PASS' if overall else 'FAIL'}")
    if overall:
        print()
        print("Next: row counts, pytest, frontend build — see docs/MONGODB_RESTORE_DRILL_CHECKLIST.md")
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())
