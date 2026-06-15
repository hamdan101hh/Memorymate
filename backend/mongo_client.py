"""Shared MongoDB client options (TLS CA bundle for Atlas on macOS/dev)."""
import os

try:
    import certifi
except ImportError:
    certifi = None  # type: ignore


def mongo_client_kwargs(mongo_url: str | None = None) -> dict:
    """Return safe PyMongo/Motor kwargs. Uses certifi CA bundle for Atlas SRV/TLS — never disables verification."""
    url = (mongo_url or os.environ.get("MONGO_URL") or "").strip()
    if not url:
        return {}
    if url.startswith("mongodb+srv://") or "tls=true" in url.lower():
        if certifi is not None:
            return {"tlsCAFile": certifi.where()}
    return {}
