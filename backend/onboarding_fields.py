"""Adaptive onboarding field validation and purpose sync (no secrets)."""
from typing import Optional

MEMORYMATE_MODES = frozenset({
    "private_executive",
    "daily_memory_support",
    "trusted_supporter",
    "decide_later",
})

MAIN_GOALS = frozenset({
    "remember_tasks",
    "capture_meetings_ideas",
    "organize_personal",
    "extra_memory_support",
    "help_someone",
    "not_sure",
})

PRIVACY_CHOICES = frozenset({"private", "trusted_supporter", "decide_later"})

CHECK_IN_FREQUENCIES = frozenset({"rarely", "sometimes", "often", "very_often"})

FORGETFULNESS_FREQUENCIES = frozenset({
    "rarely", "sometimes", "often", "very_often", "prefer_not_to_say",
})

SUPPORTER_INVITE_PREFERENCES = frozenset({"now", "later", "no"})


def purpose_for_mode(
    mode: str,
    main_goal: Optional[str] = None,
    role: Optional[str] = None,
) -> str:
    """Map adaptive mode to legacy memorymate_purpose for dashboard copy."""
    if mode == "private_executive":
        if main_goal == "capture_meetings_ideas":
            return "busy_schedule"
        return "self"
    if mode == "daily_memory_support":
        return "extra_support"
    if mode == "trusted_supporter":
        return "caregiver" if role == "caregiver" else "family_support"
    return "unsure"


def default_supporter_invite_preference(privacy_choice: Optional[str]) -> str:
    if privacy_choice == "trusted_supporter":
        return "now"
    if privacy_choice == "decide_later":
        return "later"
    return "no"


_FREQ_SCORE = {"rarely": 0, "sometimes": 1, "often": 2, "very_often": 3, "prefer_not_to_say": 1}


def support_score(check_in: str, forget: str) -> int:
    return (_FREQ_SCORE.get(check_in, 1) + _FREQ_SCORE.get(forget, 1))


def recommend_mode(main_goal: str, privacy_choice: str, check_in: str, forget: str) -> str:
    """Mirror frontend recommendMode() for smoke tests and API validation."""
    if privacy_choice == "trusted_supporter" or main_goal == "help_someone":
        return "trusted_supporter"
    if main_goal == "extra_memory_support":
        return "daily_memory_support"
    score = support_score(check_in, forget)
    productivity_goals = {"remember_tasks", "capture_meetings_ideas", "organize_personal"}
    if privacy_choice == "decide_later" and (main_goal == "not_sure" or score <= 2):
        return "decide_later"
    if score <= 2 and main_goal in productivity_goals and privacy_choice == "private":
        return "private_executive"
    if main_goal == "not_sure" and score <= 2:
        return "decide_later"
    return "daily_memory_support"
