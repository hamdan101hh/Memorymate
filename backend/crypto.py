"""Encryption-at-rest for sensitive secrets (currently Google OAuth tokens).

Uses Fernet (AES-128-CBC + HMAC) from the `cryptography` library. The key comes
from the env var ``TOKEN_ENCRYPTION_KEY`` (any string — it is run through SHA-256
to derive a valid 32-byte Fernet key, so you don't have to generate a Fernet key
by hand).

Safety rules:
  • Production (ENVIRONMENT=production/prod, or ENABLE_DEMO=false): if the key is
    missing, ``encryption_available()`` returns False and callers must refuse to
    store secrets — we never silently store plaintext in production.
  • Local dev: if the key is missing we fall back to a key derived from
    ``JWT_SECRET`` and log a one-time warning, so dev works without extra setup.

Stored values are prefixed with ``enc:v1:`` so we can (a) recognise encrypted
values, (b) tolerate any legacy plaintext during migration, and (c) version the
scheme later. Plaintext (un-prefixed) values are returned as-is by ``decrypt`` so
nothing breaks if an old row predates encryption.
"""
import os
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger("memorymate.crypto")

PREFIX = "enc:v1:"
_warned = False


def _is_production() -> bool:
    env = os.environ.get("ENVIRONMENT", os.environ.get("APP_ENV", "")).lower()
    if env in ("production", "prod", "live"):
        return True
    # A deployment that disables demo login is, in practice, a real environment.
    return os.environ.get("ENABLE_DEMO", "true").lower() == "false"


def _derive(key: str) -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(key.encode("utf-8")).digest())


def _fernet():
    """Return a Fernet instance, or None when encryption isn't configured in prod."""
    global _warned
    key = os.environ.get("TOKEN_ENCRYPTION_KEY", "").strip()
    if not key:
        if _is_production():
            return None
        if not _warned:
            logger.warning(
                "TOKEN_ENCRYPTION_KEY is not set — using a DEV-ONLY key derived from "
                "JWT_SECRET. Set TOKEN_ENCRYPTION_KEY before storing real user tokens."
            )
            _warned = True
        key = os.environ.get("JWT_SECRET", "memorymate-dev-insecure")
    return Fernet(_derive(key))


def encryption_available() -> bool:
    """True when we can encrypt/decrypt (always true in dev; needs key in prod)."""
    return _fernet() is not None


def encrypt(plaintext):
    if plaintext is None:
        return None
    f = _fernet()
    if f is None:
        raise RuntimeError("Token encryption is not configured (set TOKEN_ENCRYPTION_KEY).")
    return PREFIX + f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(value):
    if value is None:
        return None
    if not isinstance(value, str) or not value.startswith(PREFIX):
        return value  # legacy plaintext — tolerated for backward compatibility
    f = _fernet()
    if f is None:
        raise RuntimeError("Token encryption is not configured (set TOKEN_ENCRYPTION_KEY).")
    try:
        return f.decrypt(value[len(PREFIX):].encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise RuntimeError("Could not decrypt stored token (encryption key changed?).") from e


def is_encrypted(value) -> bool:
    return isinstance(value, str) and value.startswith(PREFIX)
