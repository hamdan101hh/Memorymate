"""Admin cost control and quota endpoints — mock balances only, no real billing APIs."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import require_role, _log
from db import db
import cost_control as cc

router = APIRouter(prefix="/api", tags=["admin-costs"])
NOW = cc.NOW


class QuotaUpdate(BaseModel):
    plan: Optional[str] = None
    monthly_quota_usd: Optional[float] = None
    subscription_status: Optional[str] = None
    used_usd_this_month: Optional[float] = None


class FeatureFlagsUpdate(BaseModel):
    focus_capture_enabled: Optional[bool] = None
    whatsapp_assistant_enabled: Optional[bool] = None
    monthly_summary_enabled: Optional[bool] = None
    cloud_transcription_enabled: Optional[bool] = None
    paid_ai_enabled: Optional[bool] = None


class ManualTopUpNote(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)
    amount_usd: Optional[float] = Field(None, ge=0)


@router.get("/admin/costs/overview")
async def costs_overview(user: dict = Depends(require_role("admin"))):
    return await cc.build_overview()


@router.get("/admin/costs/users")
async def costs_users(user: dict = Depends(require_role("admin"))):
    return await cc.list_users_with_costs()


@router.patch("/admin/costs/user/{user_id}/quota")
async def update_user_quota(
    user_id: str,
    body: QuotaUpdate,
    user: dict = Depends(require_role("admin")),
):
    existing = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found.")
    profile = await cc.get_or_create_profile(user_id)
    update: dict = {"updated_at": NOW()}
    if body.plan is not None:
        if body.plan not in cc.PLANS:
            raise HTTPException(status_code=400, detail="Invalid plan.")
        update["plan"] = body.plan
        if body.plan in cc.PLAN_DEFAULT_QUOTAS and body.monthly_quota_usd is None:
            update["monthly_quota_usd"] = cc.PLAN_DEFAULT_QUOTAS[body.plan]
    if body.monthly_quota_usd is not None:
        update["monthly_quota_usd"] = max(0.0, body.monthly_quota_usd)
    if body.subscription_status is not None:
        if body.subscription_status not in cc.SUBSCRIPTION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid subscription status.")
        update["subscription_status"] = body.subscription_status
    if body.used_usd_this_month is not None:
        update["used_usd_this_month"] = max(0.0, body.used_usd_this_month)
    await db.user_cost_profiles.update_one({"user_id": user_id}, {"$set": update})
    await _log(user["id"], "admin_cost_quota", "user_cost_profile", user_id, str(update))
    return cc.profile_public(await cc.get_or_create_profile(user_id))


@router.patch("/admin/features/user/{user_id}")
async def update_user_features(
    user_id: str,
    body: FeatureFlagsUpdate,
    user: dict = Depends(require_role("admin")),
):
    existing = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found.")
    profile = await cc.get_or_create_profile(user_id)
    flags = dict(profile.get("feature_flags") or cc.DEFAULT_FEATURE_FLAGS)
    for field in body.model_fields:
        val = getattr(body, field)
        if val is not None:
            flags[field] = val
    await db.user_cost_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"feature_flags": flags, "updated_at": NOW()}},
    )
    await _log(user["id"], "admin_feature_flags", "user_cost_profile", user_id, str(flags))
    return cc.profile_public(await cc.get_or_create_profile(user_id))


@router.get("/admin/api-balances")
async def api_balances(user: dict = Depends(require_role("admin"))):
    platform = await cc._reset_month_if_needed(await cc._ensure_platform_settings())
    return {
        "budget_month": platform.get("budget_month"),
        "global_monthly_budget_usd": platform.get("global_monthly_budget_usd"),
        "global_used_usd_this_month": platform.get("global_used_usd_this_month"),
        "auto_top_up_enabled": platform.get("auto_top_up_enabled", False),
        "api_balances": platform.get("api_balances", {}),
        "manual_top_up_notes": platform.get("manual_top_up_notes", []),
        "paid_service_env_detected": cc.detect_paid_service_env(),
        "env_feature_defaults": cc.env_feature_defaults(),
    }


@router.patch("/admin/api-balances/manual-topup-note")
async def add_manual_topup_note(
    body: ManualTopUpNote,
    user: dict = Depends(require_role("admin")),
):
    platform = await cc._ensure_platform_settings()
    entry = {
        "note": body.note.strip(),
        "amount_usd": body.amount_usd,
        "at": NOW(),
        "by_admin_id": user["id"],
    }
    notes = list(platform.get("manual_top_up_notes") or [])
    notes.append(entry)
    if body.amount_usd is not None:
        await db.cost_platform_settings.update_one(
            {"id": cc.PLATFORM_DOC_ID},
            {
                "$set": {"manual_top_up_notes": notes, "updated_at": NOW()},
                "$inc": {"global_monthly_budget_usd": body.amount_usd},
            },
        )
    else:
        await db.cost_platform_settings.update_one(
            {"id": cc.PLATFORM_DOC_ID},
            {"$set": {"manual_top_up_notes": notes, "updated_at": NOW()}},
        )
    await _log(user["id"], "manual_topup_note", "cost_platform_settings", cc.PLATFORM_DOC_ID, body.note[:120])
    platform = await cc._ensure_platform_settings()
    return {
        "ok": True,
        "manual_top_up_notes": platform.get("manual_top_up_notes", []),
        "global_monthly_budget_usd": platform.get("global_monthly_budget_usd"),
    }
