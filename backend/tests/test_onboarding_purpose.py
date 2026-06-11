"""Tests for purpose-based onboarding and product positioning."""
import os
from pathlib import Path

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ROOT = Path(__file__).resolve().parents[2]

FORBIDDEN_ONBOARDING_PHRASES = [
    "dementia treatment",
    "alzheimer",
    "ai doctor",
    "clinical tool",
    "patient monitoring",
    "guaranteed safety",
    "prevents memory loss",
]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestOnboardingPurposeAPI:
    def test_save_and_read_purpose(self):
        token = _demo("caregiver")["token"]
        r = requests.patch(
            f"{API}/auth/onboarding",
            headers=_h(token),
            json={"memorymate_purpose": "busy_schedule"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("memorymate_purpose") == "busy_schedule"

        me = requests.get(f"{API}/auth/me", headers=_h(token), timeout=15)
        assert me.status_code == 200
        assert me.json().get("memorymate_purpose") == "busy_schedule"

    def test_invalid_purpose_rejected(self):
        token = _demo("patient")["token"]
        r = requests.patch(
            f"{API}/auth/onboarding",
            headers=_h(token),
            json={"memorymate_purpose": "medical_diagnosis"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_all_valid_purposes(self):
        token = _demo("caregiver")["token"]
        for purpose in ("self", "busy_schedule", "family_support", "extra_support", "caregiver", "unsure"):
            r = requests.patch(
                f"{API}/auth/onboarding",
                headers=_h(token),
                json={"memorymate_purpose": purpose},
                timeout=15,
            )
            assert r.status_code == 200, f"{purpose}: {r.text}"
            assert r.json().get("memorymate_purpose") == purpose

    def test_roles_still_work(self):
        for role in ("patient", "caregiver", "admin"):
            d = _demo(role)
            assert d["user"]["role"] == role
            r = requests.get(f"{API}/auth/me", headers=_h(d["token"]), timeout=15)
            assert r.status_code == 200


class TestProductPositioningAssets:
    def test_legal_pages_exist(self):
        for path in (
            "frontend/src/pages/public/Privacy.js",
            "frontend/src/pages/public/Terms.js",
            "frontend/src/pages/public/Consent.js",
            "frontend/src/pages/public/MedicalDisclaimer.js",
            "frontend/src/pages/public/DataDeletion.js",
        ):
            assert (ROOT / path).is_file(), path

    def test_product_positioning_doc_exists(self):
        assert (ROOT / "docs" / "PRODUCT_POSITIONING.md").is_file()

    def test_onboarding_copy_no_forbidden_medical_claims(self):
        onboarding = (ROOT / "frontend" / "src" / "pages" / "Onboarding.js").read_text(encoding="utf-8").lower()
        purpose_cfg = (ROOT / "frontend" / "src" / "lib" / "purposeConfig.js").read_text(encoding="utf-8").lower()
        combined = onboarding + purpose_cfg
        for phrase in FORBIDDEN_ONBOARDING_PHRASES:
            assert phrase not in combined, f"Forbidden phrase in onboarding: {phrase}"

    def test_purpose_options_count(self):
        cfg = (ROOT / "frontend" / "src" / "lib" / "purposeConfig.js").read_text(encoding="utf-8")
        assert "For myself" in cfg
        assert "For a busy schedule" in cfg
        assert "For family support" in cfg
        assert "For extra day-to-day support" in cfg
        assert "For a caregiver" in cfg
        assert "I'm not sure yet" in cfg

    def test_dashboard_copy_varies_by_purpose(self):
        cfg = (ROOT / "frontend" / "src" / "lib" / "purposeConfig.js").read_text(encoding="utf-8")
        assert "Your day" in cfg
        assert "Today's priorities" in cfg
        assert "Family support overview" in cfg
        assert "Today made simple" in cfg
        assert "Caregiver overview" in cfg

    def test_no_whatsapp_business_api_in_backend(self):
        # WhatsApp setup page may exist; Business API integration should not be started.
        routes = (ROOT / "backend" / "routes.py").read_text(encoding="utf-8").lower()
        assert "whatsapp business api" not in routes
