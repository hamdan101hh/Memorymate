"""Tests for cost control foundation — no real paid API calls."""
import os
from pathlib import Path

import pytest
import requests

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestCostControlEnvDefaults:
    def test_premium_flags_default_false(self):
        import cost_control as cc

        assert cc.FOCUS_CAPTURE_ENABLED is False
        assert cc.WHATSAPP_ASSISTANT_ENABLED is False
        assert cc.MONTHLY_SUMMARY_ENABLED is False
        assert cc.CLOUD_TRANSCRIPTION_ENABLED is False
        assert cc.PAID_AI_ENABLED is False
        assert cc.AUTO_TOP_UP_ENABLED is False

    def test_detect_paid_env_returns_names_only(self):
        import cost_control as cc

        detected = cc.detect_paid_service_env()
        assert isinstance(detected, dict)
        assert "WHATSAPP_ACCESS_TOKEN" in detected
        for name, is_set in detected.items():
            assert isinstance(name, str)
            assert isinstance(is_set, bool)


class TestCostControlAdminApi:
    def test_patient_blocked_from_costs(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/admin/costs/overview", headers=_h(token), timeout=15)
        assert r.status_code == 403

    def test_admin_costs_overview(self):
        token = _demo("admin")["token"]
        r = requests.get(f"{API}/admin/costs/overview", headers=_h(token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "global_monthly_budget_usd" in d
        assert "total_estimated_spend_usd" in d
        assert d.get("auto_top_up_enabled") is False
        assert d["env_feature_defaults"]["paid_ai_enabled"] is False

    def test_admin_costs_users_and_quota_patch(self):
        admin = _demo("admin")
        uid = _demo("patient")["user"]["id"]
        r2 = requests.patch(
            f"{API}/admin/costs/user/{uid}/quota",
            headers=_h(admin["token"]),
            json={"monthly_quota_usd": 0.75, "plan": "basic"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["plan"] == "basic"
        assert body["monthly_quota_usd"] == 0.75

    def test_admin_costs_users_list(self):
        admin = _demo("admin")
        r = requests.get(f"{API}/admin/costs/users", headers=_h(admin["token"]), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_feature_flags_patch(self):
        admin = _demo("admin")
        uid = _demo("patient")["user"]["id"]
        r = requests.patch(
            f"{API}/admin/features/user/{uid}",
            headers=_h(admin["token"]),
            json={"paid_ai_enabled": True},
            timeout=15,
        )
        assert r.status_code == 200
        # Env default keeps paid AI off even if profile flag set
        assert r.json()["feature_flags"]["paid_ai_enabled"] is False

    def test_api_balances_and_manual_note(self):
        admin = _demo("admin")
        r = requests.get(f"{API}/admin/api-balances", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("auto_top_up_enabled") is False
        assert "api_balances" in body

        r2 = requests.patch(
            f"{API}/admin/api-balances/manual-topup-note",
            headers=_h(admin["token"]),
            json={"note": "Test manual budget note", "amount_usd": 5.0},
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json().get("ok") is True
        assert len(r2.json().get("manual_top_up_notes", [])) >= 1
