"""Cost control, quotas, and premium feature flags — no real paid API calls."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException

from db import db

NOW = lambda: datetime.now(timezone.utc).isoformat()

# ---- platform env defaults (safe: all premium/paid paths off) ----
FOCUS_CAPTURE_ENABLED = os.environ.get("FOCUS_CAPTURE_ENABLED", "false").lower() == "true"
WHATSAPP_ASSISTANT_ENABLED = os.environ.get("WHATSAPP_ASSISTANT_ENABLED", "false").lower() == "true"
MONTHLY_SUMMARY_ENABLED = os.environ.get("MONTHLY_SUMMARY_ENABLED", "false").lower() == "true"
CLOUD_TRANSCRIPTION_ENABLED = os.environ.get("CLOUD_TRANSCRIPTION_ENABLED", "false").lower() == "true"
PAID_AI_ENABLED = os.environ.get("PAID_AI_ENABLED", "false").lower() == "true"
AUTO_TOP_UP_ENABLED = os.environ.get("AUTO_TOP_UP_ENABLED", "false").lower() == "true"

GLOBAL_MONTHLY_BUDGET_USD = float(os.environ.get("GLOBAL_MONTHLY_BUDGET_USD", "100"))
TARGET_SUBSCRIPTION_PRICE_USD = float(os.environ.get("TARGET_SUBSCRIPTION_PRICE_USD", "10"))
INTERNAL_COST_TARGET_PER_USER_USD = float(os.environ.get("INTERNAL_COST_TARGET_PER_USER_USD", "1.0"))
FREE_TRIAL_DAYS = int(os.environ.get("FREE_TRIAL_DAYS", "3"))
MONTHLY_USAGE_QUOTA_ENFORCED = os.environ.get("MONTHLY_USAGE_QUOTA_ENFORCED", "false").lower() == "true"

PLANS = frozenset({"free_trial", "basic", "admin_test", "disabled"})
SUBSCRIPTION_STATUSES = frozenset({"none", "trialing", "active", "canceled", "disabled"})

DEFAULT_FEATURE_FLAGS = {
    "focus_capture_enabled": False,
    "whatsapp_assistant_enabled": False,
    "monthly_summary_enabled": False,
    "cloud_transcription_enabled": False,
    "paid_ai_enabled": False,
}

PLAN_DEFAULT_QUOTAS = {
    "free_trial": INTERNAL_COST_TARGET_PER_USER_USD,
    "basic": INTERNAL_COST_TARGET_PER_USER_USD,
    "admin_test": 5.0,
    "disabled": 0.0,
}

PLATFORM_DOC_ID = "platform"

# Env var names only — never print values.
PAID_SERVICE_ENV_VARS = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_VERIFY_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "EMERGENT_LLM_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "STRIPE_SECRET_KEY",
    "STRIPE_API_KEY",
]


def _month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def env_feature_defaults() -> dict[str, bool]:
    return {
        "focus_capture_enabled": FOCUS_CAPTURE_ENABLED,
        "whatsapp_assistant_enabled": WHATSAPP_ASSISTANT_ENABLED,
        "monthly_summary_enabled": MONTHLY_SUMMARY_ENABLED,
        "cloud_transcription_enabled": CLOUD_TRANSCRIPTION_ENABLED,
        "paid_ai_enabled": PAID_AI_ENABLED,
        "auto_top_up_enabled": AUTO_TOP_UP_ENABLED,
    }


def detect_paid_service_env() -> dict[str, bool]:
    """Report whether paid-service env vars are set (names only, no values)."""
    out: dict[str, bool] = {}
    for name in PAID_SERVICE_ENV_VARS:
        out[name] = bool((os.environ.get(name) or "").strip())
    return out


def _merge_feature_flags(flags: Optional[dict]) -> dict[str, bool]:
    merged = {**DEFAULT_FEATURE_FLAGS, **env_feature_defaults()}
    if flags:
        for key in DEFAULT_FEATURE_FLAGS:
            if key in flags:
                merged[key] = bool(flags[key])
    # Env cannot enable paid paths unless explicitly allowed in profile AND env (belt + suspenders)
    if not FOCUS_CAPTURE_ENABLED:
        merged["focus_capture_enabled"] = False
    if not WHATSAPP_ASSISTANT_ENABLED:
        merged["whatsapp_assistant_enabled"] = False
    if not MONTHLY_SUMMARY_ENABLED:
        merged["monthly_summary_enabled"] = False
    if not CLOUD_TRANSCRIPTION_ENABLED:
        merged["cloud_transcription_enabled"] = False
    if not PAID_AI_ENABLED:
        merged["paid_ai_enabled"] = False
    return merged


async def _ensure_platform_settings() -> dict:
    doc = await db.cost_platform_settings.find_one({"id": PLATFORM_DOC_ID}, {"_id": 0})
    if doc:
        return doc
    doc = {
        "id": PLATFORM_DOC_ID,
        "global_monthly_budget_usd": GLOBAL_MONTHLY_BUDGET_USD,
        "global_used_usd_this_month": 0.0,
        "auto_top_up_enabled": AUTO_TOP_UP_ENABLED,
        "manual_top_up_notes": [],
        "api_balances": {
            "openai_usd": 0.0,
            "anthropic_usd": 0.0,
            "whatsapp_usd": 0.0,
            "transcription_usd": 0.0,
            "other_usd": 0.0,
        },
        "budget_month": _month_key(),
        "updated_at": NOW(),
    }
    await db.cost_platform_settings.insert_one(doc)
    return doc


async def _reset_month_if_needed(doc: dict) -> dict:
    month = _month_key()
    if doc.get("budget_month") == month:
        return doc
    doc = {
        **doc,
        "global_used_usd_this_month": 0.0,
        "budget_month": month,
        "updated_at": NOW(),
    }
    await db.cost_platform_settings.update_one(
        {"id": PLATFORM_DOC_ID},
        {"$set": {
            "global_used_usd_this_month": 0.0,
            "budget_month": month,
            "updated_at": doc["updated_at"],
        }},
    )
    return doc


def default_profile(user_id: str, plan: str = "free_trial") -> dict:
    now = datetime.now(timezone.utc)
    trial_end = now + timedelta(days=FREE_TRIAL_DAYS)
    quota = PLAN_DEFAULT_QUOTAS.get(plan, INTERNAL_COST_TARGET_PER_USER_USD)
    return {
        "user_id": user_id,
        "plan": plan,
        "monthly_quota_usd": quota,
        "used_usd_this_month": 0.0,
        "voice_minutes_used": 0.0,
        "whatsapp_messages_used": 0,
        "ai_tokens_used": 0,
        "image_storage_mb_used": 0.0,
        "monthly_summary_runs": 0,
        "trial_started_at": now.isoformat(),
        "trial_ends_at": trial_end.isoformat() if plan == "free_trial" else None,
        "subscription_status": "trialing" if plan == "free_trial" else "none",
        "feature_flags": dict(DEFAULT_FEATURE_FLAGS),
        "usage_month": _month_key(),
        "updated_at": NOW(),
    }


async def get_or_create_profile(user_id: str) -> dict:
    doc = await db.user_cost_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        doc = default_profile(user_id)
        await db.user_cost_profiles.insert_one(doc)
        return doc
    month = _month_key()
    if doc.get("usage_month") != month:
        doc = {
            **doc,
            "used_usd_this_month": 0.0,
            "voice_minutes_used": 0.0,
            "whatsapp_messages_used": 0,
            "ai_tokens_used": 0,
            "image_storage_mb_used": 0.0,
            "monthly_summary_runs": 0,
            "usage_month": month,
            "updated_at": NOW(),
        }
        await db.user_cost_profiles.update_one(
            {"user_id": user_id},
            {"$set": {
                "used_usd_this_month": 0.0,
                "voice_minutes_used": 0.0,
                "whatsapp_messages_used": 0,
                "ai_tokens_used": 0,
                "image_storage_mb_used": 0.0,
                "monthly_summary_runs": 0,
                "usage_month": month,
                "updated_at": doc["updated_at"],
            }},
        )
    return doc


async def patient_user_id(patient_id: str) -> Optional[str]:
    p = await db.patients.find_one({"id": patient_id}, {"_id": 0, "user_id": 1})
    return p.get("user_id") if p else None


async def ai_usage_usd_for_user(user_id: str) -> float:
    """Sum estimated AI cost from ai_usage for linked patient(s) this month."""
    patients = await db.patients.find({"user_id": user_id}, {"_id": 0, "id": 1}).to_list(20)
    if not patients:
        return 0.0
    pids = [p["id"] for p in patients]
    month = _month_key()
    total = 0.0
    for pid in pids:
        rows = await db.ai_usage.find(
            {"patient_id": pid, "day": {"$regex": f"^{month}"}},
            {"_id": 0, "est_cost": 1},
        ).to_list(500)
        total += sum(float(r.get("est_cost", 0.0)) for r in rows)
    return round(total, 4)


async def assert_within_monthly_quota(user_id: str) -> None:
    """Hard stop when user monthly usage exceeds quota or global budget."""
    profile = await get_or_create_profile(user_id)
    if profile.get("plan") == "disabled":
        raise HTTPException(status_code=403, detail="Account usage is disabled.")
    quota = float(profile.get("monthly_quota_usd", 0.0))
    used = float(profile.get("used_usd_this_month", 0.0))
    ai_extra = await ai_usage_usd_for_user(user_id)
    total_used = used + ai_extra
    if quota > 0 and total_used >= quota:
        raise HTTPException(
            status_code=429,
            detail="Monthly usage quota reached. Premium features are paused until next month or admin review.",
        )
    platform = await _reset_month_if_needed(await _ensure_platform_settings())
    global_cap = float(platform.get("global_monthly_budget_usd", GLOBAL_MONTHLY_BUDGET_USD))
    global_used = float(platform.get("global_used_usd_this_month", 0.0))
    if global_cap > 0 and global_used >= global_cap:
        raise HTTPException(
            status_code=429,
            detail="Platform monthly budget reached. Usage is paused until manual top-up or next month.",
        )


async def assert_within_monthly_quota_for_patient(patient_id: str) -> None:
    if not MONTHLY_USAGE_QUOTA_ENFORCED:
        return
    uid = await patient_user_id(patient_id)
    if uid:
        await assert_within_monthly_quota(uid)


async def assert_focus_capture_allowed(user_id: str) -> None:
    """Focus Capture requires global env or admin_test plan with per-user flag (raw profile, not env-clamped)."""
    if FOCUS_CAPTURE_ENABLED:
        return
    profile = await get_or_create_profile(user_id)
    if profile.get("plan") == "admin_test":
        raw_flags = profile.get("feature_flags") or {}
        if raw_flags.get("focus_capture_enabled"):
            return
    raise HTTPException(
        status_code=403,
        detail="Focus Capture is not enabled. Ask an admin to enable it for testing.",
    )


async def record_focus_capture_usage(user_id: str, duration_seconds: float) -> None:
    """Track session duration locally — MVP cost remains $0 (no cloud transcription)."""
    minutes = max(0.0, duration_seconds) / 60.0
    if minutes <= 0:
        return
    await db.user_cost_profiles.update_one(
        {"user_id": user_id},
        {
            "$inc": {
                "voice_minutes_used": round(minutes, 2),
            },
            "$set": {"updated_at": NOW()},
        },
    )


def profile_public(profile: dict) -> dict:
    flags = _merge_feature_flags(profile.get("feature_flags"))
    quota = float(profile.get("monthly_quota_usd", 0.0))
    used = float(profile.get("used_usd_this_month", 0.0))
    pct = (used / quota * 100) if quota > 0 else 0.0
    return {
        **profile,
        "feature_flags": flags,
        "quota_used_pct": round(min(100.0, pct), 1),
        "near_quota": quota > 0 and used >= quota * 0.8,
        "quota_exceeded": quota > 0 and used >= quota,
    }


async def build_overview() -> dict[str, Any]:
    platform = await _reset_month_if_needed(await _ensure_platform_settings())
    profiles = await db.user_cost_profiles.find({}, {"_id": 0}).to_list(5000)
    total_estimated = 0.0
    near_quota = 0
    exceeded = 0
    for p in profiles:
        uid = p["user_id"]
        ai_usd = await ai_usage_usd_for_user(uid)
        used = float(p.get("used_usd_this_month", 0.0)) + ai_usd
        total_estimated += used
        quota = float(p.get("monthly_quota_usd", 0.0))
        if quota > 0:
            if used >= quota:
                exceeded += 1
            elif used >= quota * 0.8:
                near_quota += 1

    budget = float(platform.get("global_monthly_budget_usd", GLOBAL_MONTHLY_BUDGET_USD))
    remaining = max(0.0, budget - total_estimated)
    status = "green"
    if budget > 0 and total_estimated >= budget:
        status = "red"
    elif budget > 0 and total_estimated >= budget * 0.8:
        status = "yellow"

    return {
        "budget_month": _month_key(),
        "global_monthly_budget_usd": budget,
        "total_estimated_spend_usd": round(total_estimated, 4),
        "remaining_budget_usd": round(remaining, 4),
        "budget_status": status,
        "users_tracked": len(profiles),
        "users_near_quota": near_quota,
        "users_quota_exceeded": exceeded,
        "target_subscription_price_usd": TARGET_SUBSCRIPTION_PRICE_USD,
        "internal_cost_target_per_user_usd": INTERNAL_COST_TARGET_PER_USER_USD,
        "auto_top_up_enabled": bool(platform.get("auto_top_up_enabled", False)),
        "env_feature_defaults": env_feature_defaults(),
        "paid_service_env_detected": detect_paid_service_env(),
        "free_trial_days": FREE_TRIAL_DAYS,
    }


async def list_users_with_costs() -> list[dict]:
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    uids = [u["id"] for u in users]
    month = _month_key()
    patients = await db.patients.find({"user_id": {"$in": uids}}, {"_id": 0, "id": 1, "user_id": 1}).to_list(500)
    pid_to_uid = {p["id"]: p["user_id"] for p in patients if p.get("user_id")}
    pids = list(pid_to_uid.keys())
    ai_by_user: dict[str, float] = {}
    if pids:
        usage_rows = await db.ai_usage.find(
            {"patient_id": {"$in": pids}, "day": {"$regex": f"^{month}"}},
            {"_id": 0, "patient_id": 1, "est_cost": 1},
        ).to_list(10000)
        for row in usage_rows:
            uid = pid_to_uid.get(row.get("patient_id"))
            if uid:
                ai_by_user[uid] = ai_by_user.get(uid, 0.0) + float(row.get("est_cost", 0.0))

    existing_profiles = await db.user_cost_profiles.find(
        {"user_id": {"$in": uids}}, {"_id": 0},
    ).to_list(200)
    profile_map = {p["user_id"]: p for p in existing_profiles}

    out = []
    for u in users:
        uid = u["id"]
        profile = profile_map.get(uid)
        if not profile:
            profile = default_profile(uid)
        elif profile.get("usage_month") != month:
            profile = await get_or_create_profile(uid)
            profile_map[uid] = profile
        ai_usd = round(ai_by_user.get(uid, 0.0), 4)
        pub = profile_public(profile)
        pub["ai_usage_est_usd_this_month"] = ai_usd
        pub["total_est_usd_this_month"] = round(
            float(pub.get("used_usd_this_month", 0.0)) + ai_usd, 4,
        )
        out.append({
            "user_id": uid,
            "full_name": u.get("full_name"),
            "email": u.get("email"),
            "role": u.get("role"),
            "is_active": u.get("is_active", True),
            **pub,
        })
    return out
