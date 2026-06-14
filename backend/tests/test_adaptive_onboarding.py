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

PATIENT_HOME_UI_FILES = [
    ROOT / "frontend/src/pages/patient/PatientHome.js",
    ROOT / "frontend/src/lib/purposeConfig.js",
]

PATIENT_HOME_MODE_TAGLINES = {
    "private_executive": ["private", "meetings", "reminders", "ideas"],
    "daily_memory_support": ["check-in", "summaries", "reminders"],
    "trusted_supporter": ["trust", "ready"],
    "decide_later": ["customize", "anytime"],
}


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


class TestOnboardingCompletion:
    """Full onboarding completion saves mode, purpose sync, and onboarding_completed."""

    def _complete(self, role, mode, extra):
        token = _demo(role)["token"]
        body = {
            "memorymate_mode": mode,
            "main_goal": extra.get("main_goal", "not_sure"),
            "privacy_choice": extra.get("privacy_choice", "decide_later"),
            "check_in_frequency": extra.get("check_in_frequency", "sometimes"),
            "forgetfulness_frequency": extra.get("forgetfulness_frequency", "prefer_not_to_say"),
            "supporter_invite_preference": extra.get("supporter_invite_preference", "no"),
            "consent_accepted": True,
            "emergency_contact_name": "Smoke Contact",
            "emergency_contact_phone": "555-0100",
            "onboarding_completed": True,
        }
        r = requests.patch(f"{API}/auth/onboarding", headers=_h(token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("onboarding_completed") is True
        assert data.get("memorymate_mode") == mode
        assert data.get("consent_accepted") is True
        assert data.get("emergency_contact_name") == "Smoke Contact"
        me = requests.get(f"{API}/auth/me", headers=_h(token), timeout=15)
        assert me.status_code == 200
        me_data = me.json()
        assert me_data.get("onboarding_completed") is True
        assert me_data.get("memorymate_mode") == mode
        return data

    def test_complete_private_executive(self):
        data = self._complete(
            "patient",
            "private_executive",
            {
                "main_goal": "capture_meetings_ideas",
                "privacy_choice": "private",
                "check_in_frequency": "rarely",
                "forgetfulness_frequency": "rarely",
                "supporter_invite_preference": "no",
            },
        )
        assert data.get("memorymate_purpose") == "busy_schedule"
        assert data.get("supporter_invite_preference") == "no"

    def test_complete_daily_memory_support(self):
        data = self._complete(
            "patient",
            "daily_memory_support",
            {
                "main_goal": "extra_memory_support",
                "privacy_choice": "decide_later",
                "check_in_frequency": "often",
                "forgetfulness_frequency": "sometimes",
                "supporter_invite_preference": "later",
            },
        )
        assert data.get("memorymate_purpose") == "extra_support"
        assert data.get("supporter_invite_preference") == "later"

    def test_complete_trusted_supporter_patient(self):
        data = self._complete(
            "patient",
            "trusted_supporter",
            {
                "main_goal": "help_someone",
                "privacy_choice": "trusted_supporter",
                "check_in_frequency": "often",
                "forgetfulness_frequency": "often",
                "supporter_invite_preference": "now",
            },
        )
        assert data.get("memorymate_purpose") == "family_support"
        assert data.get("supporter_invite_preference") == "now"

    def test_complete_decide_later(self):
        data = self._complete(
            "patient",
            "decide_later",
            {
                "main_goal": "not_sure",
                "privacy_choice": "decide_later",
                "check_in_frequency": "sometimes",
                "forgetfulness_frequency": "prefer_not_to_say",
                "supporter_invite_preference": "later",
            },
        )
        assert data.get("memorymate_purpose") == "unsure"

    def test_complete_trusted_supporter_caregiver(self):
        data = self._complete(
            "caregiver",
            "trusted_supporter",
            {
                "main_goal": "help_someone",
                "privacy_choice": "trusted_supporter",
                "supporter_invite_preference": "now",
            },
        )
        assert data.get("memorymate_purpose") == "caregiver"


class TestPatientHomeCopy:
    def test_no_forbidden_phrases_in_patient_home_ui(self):
        combined = ""
        for path in PATIENT_HOME_UI_FILES:
            combined += path.read_text(encoding="utf-8").lower()
        for phrase in FORBIDDEN_ONBOARDING_PHRASES:
            assert phrase not in combined, f"Forbidden phrase in home UI: {phrase}"

    def test_patient_home_taglines_per_mode(self):
        cfg = (ROOT / "frontend/src/lib/purposeConfig.js").read_text(encoding="utf-8").lower()
        for mode, keywords in PATIENT_HOME_MODE_TAGLINES.items():
            assert mode in cfg, f"Missing mode {mode} in purposeConfig"
            for kw in keywords:
                assert kw in cfg, f"Expected '{kw}' for mode {mode}"

    def test_trusted_supporter_not_forced_on_home(self):
        home = (ROOT / "frontend/src/pages/patient/PatientHome.js").read_text(encoding="utf-8").lower()
        assert "never required" in home
        assert "trusted supporter" in home

    def test_decide_later_invite_later_note(self):
        home = (ROOT / "frontend/src/pages/patient/PatientHome.js").read_text(encoding="utf-8").lower()
        assert "invite-supporter-later-note" in home
        assert "no rush" in home
