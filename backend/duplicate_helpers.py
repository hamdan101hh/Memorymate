"""Shared appointment/calendar duplicate detection (no DB writes)."""
from typing import Any

import appointment_dashboard as apdash


def appointment_fingerprint(appt: dict) -> str:
    return apdash.appointment_fingerprint(appt)


def is_duplicate_pair(a: dict, b: dict) -> bool:
    return apdash.is_appt_duplicate(a, b)


def find_duplicate_matches(
    candidate: dict,
    appointments: list[dict],
    exclude_id: str | None = None,
) -> list[dict]:
    """Return appointments that may duplicate candidate."""
    matches: list[dict] = []
    for a in appointments:
        if a.get("calendar_archived") or a.get("status") == "completed":
            continue
        if exclude_id and a.get("id") == exclude_id:
            continue
        if is_duplicate_pair(candidate, a):
            matches.append(a)
    return matches


def serialize_matches(matches: list[dict]) -> list[dict]:
    return [
        {
            "id": m.get("id"),
            "title": m.get("title"),
            "date": m.get("date"),
            "time": m.get("time"),
            "location": m.get("location", ""),
            "google_event_id": m.get("google_event_id"),
        }
        for m in matches
    ]


def pick_best_appointment(cluster: list[dict]) -> dict:
    return max(cluster, key=lambda x: (apdash.completeness_score(x), x.get("created_at", "")))
