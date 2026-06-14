"""Tests for adaptive onboarding modes and safe copy."""
import os
from pathlib import Path

import requests

try:
    from onboarding_fields import purpose_for_mode, MEMORYMATE_MODES, MAIN_GOALS, recommend_mode
except ImportError:
    from backend.onboarding_fields import purpose_for_mode, MEMORYMATE_MODES, MAIN_GOALS, recommend_mode

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
    "do you have a disability",
    "do you have dementia",
    "disability score",
    "dementia level",
    "caregiver required",
    "24/7 recording",
    "hidden listening",
]

ONBOARDING_UI_FILES = [
    ROOT / "frontend/src/pages/Onboarding.js",
    ROOT / "frontend/src/lib/onboardingConfig.js",
]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestAdaptiveOnboardingAPI:
    def test_save_private_executive_mode(self):
        token = _demo("patient")["token"]
        body = {
            "memorymate_mode": "private_executive",
            "main_goal": "capture_meetings_ideas",
            "privacy_choice": "private",
            "check_in_frequency": "rarely",
            "forgetfulness_frequency": "rarely",
            "supporter_invite_preference": "no",
            "onboarding_completed": True,
        }
        r = requests.patch(f"{API}/auth/onboarding", headers=_h(token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("memorymate_mode") == "private_executive"
        assert data.get("memorymate_purpose") == "busy_schedule"
        assert data.get("supporter_invite_preference") == "no"

    def test_private_executive_no_supporter_required(self):
        token = _demo("patient")["token"]
        r = requests.patch(
            f"{API}/auth/onboarding",
            headers=_h(token),
            json={
                "memorymate_mode": "private_executive",
                "privacy_choice": "private",
                "supporter_invite_preference": "no",
            },
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("supporter_invite_preference") == "no"

    def test_trusted_supporter_suggests_invite_not_forced(self):
        token = _demo("caregiver")["token"]
        r = requests.patch(
            f"{API}/auth/onboarding",
            headers=_h(token),
            json={
                "memorymate_mode": "trusted_supporter",
                "privacy_choice": "trusted_supporter",
                "supporter_invite_preference": "now",
            },
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("memorymate_mode") == "trusted_supporter"
        assert data.get("supporter_invite_preference") == "now"
        assert data.get("memorymate_purpose") == "caregiver"

    def test_decide_later_defaults_private(self):
        token = _demo("patient")["token"]
        r = requests.patch(
            f"{API}/auth/onboarding",
            headers=_h(token),
            json={
                "memorymate_mode": "decide_later",
                "privacy_choice": "decide_later",
            },
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("memorymate_mode") == "decide_later"
        assert data.get("memorymate_purpose") == "unsure"
        assert data.get("supporter_invite_preference") == "later"

    def test_daily_memory_support_mode(self):
        token = _demo("patient")["token"]
        r = requests.patch(
            f"{API}/auth/onboarding",
            headers=_h(token),
            json={
                "memorymate_mode": "daily_memory_support",
                "main_goal": "extra_memory_support",
                "check_in_frequency": "often",
                "forgetfulness_frequency": "often",
            },
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("memorymate_purpose") == "extra_support"

    def test_invalid_mode_rejected(self):
        token = _demo("patient")["token"]
        r = requests.patch(
            f"{API}/auth/onboarding",
            headers=_h(token),
            json={"memorymate_mode": "medical_diagnosis"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_all_valid_modes(self):
        token = _demo("caregiver")["token"]
        for mode in MEMORYMATE_MODES:
            r = requests.patch(
                f"{API}/auth/onboarding",
                headers=_h(token),
                json={"memorymate_mode": mode},
                timeout=15,
            )
            assert r.status_code == 200, f"{mode}: {r.text}"


class TestAdaptiveOnboardingCopy:
    def test_no_forbidden_phrases_in_onboarding_ui(self):
        combined = ""
        for path in ONBOARDING_UI_FILES:
            combined += path.read_text(encoding="utf-8").lower()
        for phrase in FORBIDDEN_ONBOARDING_PHRASES:
            assert phrase not in combined, f"Forbidden phrase: {phrase}"

    def test_trusted_supporter_wording_present(self):
        cfg = (ROOT / "frontend/src/lib/onboardingConfig.js").read_text(encoding="utf-8").lower()
        assert "trusted supporter" in cfg
        assert "disability" not in cfg

    def test_purpose_for_mode_mapping(self):
        assert purpose_for_mode("private_executive", "capture_meetings_ideas") == "busy_schedule"
        assert purpose_for_mode("private_executive", "organize_personal") == "self"
        assert purpose_for_mode("trusted_supporter", role="caregiver") == "caregiver"
        assert purpose_for_mode("decide_later") == "unsure"

    def test_no_granola_in_onboarding(self):
        for path in ONBOARDING_UI_FILES:
            assert "granola" not in path.read_text(encoding="utf-8").lower()


class TestOnboardingRecommendations:
    """Smoke-path recommendation logic (mirrors frontend recommendMode)."""

    def test_private_executive_path(self):
        mode = recommend_mode(
            "capture_meetings_ideas", "private", "rarely", "rarely",
        )
        assert mode == "private_executive"

    def test_daily_memory_support_path(self):
        mode = recommend_mode(
            "extra_memory_support", "private", "often", "sometimes",
        )
        assert mode == "daily_memory_support"
        mode2 = recommend_mode(
            "extra_memory_support", "decide_later", "often", "often",
        )
        assert mode2 == "daily_memory_support"

    def test_trusted_supporter_paths(self):
        assert recommend_mode(
            "help_someone", "private", "often", "often",
        ) == "trusted_supporter"
        assert recommend_mode(
            "remember_tasks", "trusted_supporter", "often", "often",
        ) == "trusted_supporter"

    def test_decide_later_path(self):
        assert recommend_mode(
            "not_sure", "decide_later", "sometimes", "prefer_not_to_say",
        ) == "decide_later"

    def test_decide_later_productivity_low_support(self):
        assert recommend_mode(
            "capture_meetings_ideas", "decide_later", "rarely", "rarely",
        ) == "decide_later"
