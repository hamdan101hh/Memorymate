"""Production safety guard for photo/image uploads on ephemeral local disk."""
import os

UPLOAD_BLOCKED_MESSAGE = (
    "Photo uploads are not enabled in this environment yet. "
    "You can still save the note without photos."
)

ALLOWED_STORAGE_MODES = frozenset({"local_dev", "disabled", "private_object_storage"})


def is_production_environment() -> bool:
    """True when deployed or configured as a real (non-demo) environment."""
    env = os.environ.get("ENVIRONMENT", os.environ.get("APP_ENV", "")).lower()
    if env in ("production", "prod", "live"):
        return True
    if os.environ.get("NODE_ENV", "").lower() == "production":
        return True
    if os.environ.get("RENDER", "").strip().lower() in ("true", "1", "yes"):
        return True
    # A deployment that disables demo login is, in practice, a real environment.
    return os.environ.get("ENABLE_DEMO", "true").lower() == "false"


def _parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None or not str(raw).strip():
        return default
    v = str(raw).strip().lower()
    if v in ("true", "1", "yes", "on"):
        return True
    if v in ("false", "0", "no", "off"):
        return False
    return default


def image_storage_mode() -> str:
    raw = os.environ.get("IMAGE_STORAGE_MODE", "").strip().lower()
    if raw in ALLOWED_STORAGE_MODES:
        return raw
    if is_production_environment():
        return "disabled"
    return "local_dev"


def image_uploads_enabled_flag() -> bool:
    default = not is_production_environment()
    return _parse_bool(os.environ.get("IMAGE_UPLOADS_ENABLED"), default)


def allow_local_image_storage_in_production() -> bool:
    return _parse_bool(os.environ.get("ALLOW_LOCAL_IMAGE_STORAGE_IN_PRODUCTION"), False)


def image_uploads_available() -> bool:
    if not image_uploads_enabled_flag():
        return False
    mode = image_storage_mode()
    if mode == "disabled":
        return False
    if mode == "private_object_storage":
        # Future: enable when private object storage is implemented.
        return False
    if mode == "local_dev":
        if is_production_environment():
            return allow_local_image_storage_in_production()
        return True
    return False


def upload_availability_payload() -> dict:
    available = image_uploads_available()
    return {
        "uploads_available": available,
        "storage_mode": image_storage_mode(),
        "production": is_production_environment(),
        "message": UPLOAD_BLOCKED_MESSAGE if not available else None,
    }
