#!/usr/bin/env python3
"""Build MemoryMate transfer packages. Never prints secret values to stdout."""
import os
import secrets
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

SECRETS_MD = ROOT / "MEMORYMATE_SECRETS_BACKUP_PRIVATE.md"
SECRETS_ZIP = ROOT / "memorymate-secrets-private-encrypted.zip"
SECRETS_PWD = ROOT / "MEMORYMATE_SECRETS_ZIP_PASSWORD_PRIVATE.txt"
CODE_ZIP = ROOT / "memorymate-code-transfer.zip"

ENV_SOURCES = [
    ("backend/.env", "Backend (.env)"),
    ("frontend/.env", "Frontend (.env)"),
    ("frontend/.env.local", "Frontend (.env.local)"),
]


def read_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "=" not in s:
            continue
        k, _, v = s.partition("=")
        out[k.strip()] = v.strip()
    return out


def build_secrets_md() -> bool:
    sections: list[str] = [
        "# MEMORYMATE SECRETS BACKUP — PRIVATE",
        "",
        "**PRIVATE — DO NOT SHARE PUBLICLY**",
        "",
        "This file contains live credentials from your local machine.",
        "Move only via USB, AirDrop, or private encrypted channel.",
        "Do not commit, email, or upload to cloud storage.",
        "",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "",
    ]
    found_any = False
    for rel, label in ENV_SOURCES:
        p = ROOT / rel
        data = read_env_file(p)
        sections.append(f"## {label}")
        sections.append(f"Source path: `{rel}`")
        if not data:
            sections.append("_File not found or empty._")
        else:
            found_any = True
            for k in sorted(data.keys()):
                sections.append(f"{k}={data[k]}")
        sections.append("")
    if not found_any:
        sections.append("_No local .env files with values were found._")
    SECRETS_MD.write_text("\n".join(sections), encoding="utf-8")
    return SECRETS_MD.is_file()


def try_encrypted_zip() -> str:
    """Return status: created | openssl | failed"""
    if not SECRETS_MD.is_file():
        return "failed"
    password = secrets.token_urlsafe(32)
    SECRETS_PWD.write_text(
        "PRIVATE — password for memorymate-secrets-private-encrypted.zip\n"
        "Do not share this file.\n\n"
        f"{password}\n",
        encoding="utf-8",
    )
    try:
        import pyzipper  # type: ignore

        with pyzipper.AESZipFile(
            SECRETS_ZIP, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES,
        ) as zf:
            zf.setpassword(password.encode("utf-8"))
            zf.write(SECRETS_MD, SECRETS_MD.name)
        return "created"
    except ImportError:
        pass

    enc = ROOT / "memorymate-secrets-private.enc"
    try:
        subprocess.run(
            [
                "openssl", "enc", "-aes-256-cbc", "-pbkdf2",
                "-pass", f"pass:{password}",
                "-in", str(SECRETS_MD),
                "-out", str(enc),
            ],
            check=True,
            capture_output=True,
        )
        if SECRETS_ZIP.exists():
            SECRETS_ZIP.unlink()
        subprocess.run(
            ["zip", "-j", str(SECRETS_ZIP), str(enc)],
            check=True,
            capture_output=True,
        )
        enc.unlink(missing_ok=True)
        SECRETS_PWD.write_text(
            SECRETS_PWD.read_text(encoding="utf-8")
            + "\nNote: ZIP contains openssl-encrypted blob (memorymate-secrets-private.enc).\n"
            "Decrypt with: openssl enc -d -aes-256-cbc -pbkdf2 -in memorymate-secrets-private.enc -out MEMORYMATE_SECRETS_BACKUP_PRIVATE.md\n",
            encoding="utf-8",
        )
        return "openssl"
    except (subprocess.CalledProcessError, FileNotFoundError):
        if SECRETS_ZIP.exists():
            SECRETS_ZIP.unlink(missing_ok=True)
        return "failed"


def build_code_zip() -> None:
    if CODE_ZIP.exists():
        CODE_ZIP.unlink()
    excludes = [
        "*.git*",
        "*node_modules*",
        "*.venv*",
        "*venv*",
        "*__pycache__*",
        "*.pytest_cache*",
        "*frontend/build*",
        "*dist*",
        "*.next*",
        "*.log",
        "*.zip",
        "MEMORYMATE_SECRETS*",
        "memorymate-secrets*",
        ".local-mongo*",
        ".DS_Store",
        "*.pyc",
        "frontend/.env",
        "backend/.env",
        "frontend/.env.local",
    ]
    cmd = ["zip", "-r", str(CODE_ZIP), ".", "-x"]
    for x in excludes:
        cmd.append(x)
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> int:
    build_secrets_md()
    enc_status = try_encrypted_zip()
    build_code_zip()
    # Report only filenames and sizes (no secret content)
    print(f"secrets_md={SECRETS_MD.name} size={SECRETS_MD.stat().st_size if SECRETS_MD.exists() else 0}")
    print(f"code_zip={CODE_ZIP.name} size={CODE_ZIP.stat().st_size if CODE_ZIP.exists() else 0}")
    print(f"encrypted_zip_status={enc_status}")
    if SECRETS_PWD.exists():
        print(f"password_file={SECRETS_PWD.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
