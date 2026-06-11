"""Appointment list dashboard: urgency, grouping, deduplication."""
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import calendar_dashboard as caldash


URGENCY_ORDER = {
    "urgent": 0,
    "soon": 1,
    "today": 2,
    "tomorrow": 3,
    "this_week": 4,
    "later": 5,
    "needs_date": 6,
    "past": 7,
    "duplicate": 8,
    "archived": 9,
}

URGENCY_BADGE = {
    "upcoming": "Upcoming",
    "soon": "Soon",
    "urgent": "Urgent",
    "past": "Past",
    "needs_date": "Needs date",
}

URGENCY_STYLES = {
    "upcoming": "border-l-sky-400 bg-sky-50/40",
    "soon": "border-l-amber-400 bg-amber-50/40",
    "urgent": "border-l-rose-400 bg-rose-50/40",
    "past": "border-l-stone-300 bg-stone-50/60",
    "needs_date": "border-l-stone-300 bg-stone-50/50",
}


def appointment_fingerprint(appt: dict) -> str:
    return caldash.event_fingerprint(
        appt.get("title", ""),
        appt.get("date", ""),
        appt.get("time", ""),
        appt.get("location", ""),
    )


def _parse_appt_datetime(appt: dict, tz: str) -> datetime | None:
    d = appt.get("date")
    if not d:
        return None
    try:
        day = date.fromisoformat(d[:10])
    except ValueError:
        return None
    zone = ZoneInfo(tz)
    t = (appt.get("time") or "").strip()
    if t and ":" in t:
        try:
            h, m = t[:5].split(":")
            return datetime(day.year, day.month, day.day, int(h), int(m), tzinfo=zone)
        except ValueError:
            return datetime(day.year, day.month, day.day, 9, 0, tzinfo=zone)
    return datetime(day.year, day.month, day.day, 9, 0, tzinfo=zone)


def compute_urgency(appt: dict, now: datetime, tz: str) -> dict:
    """Return urgency key, badge label, and style class for an appointment."""
    if not appt.get("date"):
        return {"urgency": "needs_date", "badge": "Needs date", "style": "needs_date", "hours_until": None}

    dt = _parse_appt_datetime(appt, tz)
    if not dt:
        return {"urgency": "needs_date", "badge": "Needs date", "style": "needs_date", "hours_until": None}

    delta = dt - now
    hours = delta.total_seconds() / 3600.0

    if hours < 0:
        return {"urgency": "past", "badge": "Past", "style": "past", "hours_until": hours}
    if hours <= 24:
        return {"urgency": "urgent", "badge": "Urgent", "style": "urgent", "hours_until": hours}
    if hours <= 48:
        return {"urgency": "soon", "badge": "Soon", "style": "soon", "hours_until": hours}
    return {"urgency": "upcoming", "badge": "Upcoming", "style": "upcoming", "hours_until": hours}


def completeness_score(appt: dict) -> int:
    score = 0
    if appt.get("google_event_id"):
        score += 1000
    if appt.get("date"):
        score += 50
    if appt.get("time"):
        score += 25
    if appt.get("location"):
        score += 15
    if appt.get("notes"):
        score += 10
    if appt.get("reminder_time"):
        score += 5
    if appt.get("doctor_or_clinic"):
        score += 3
    created = appt.get("created_at") or ""
    score += min(len(created), 20)
    return score


def is_appt_duplicate(a: dict, b: dict) -> bool:
    if a.get("google_event_id") and b.get("google_event_id") and a["google_event_id"] == b["google_event_id"]:
        return True
    fa = appointment_fingerprint(a)
    fb = appointment_fingerprint(b)
    if fa == fb:
        return True
    aa = {
        "title": a.get("title", ""),
        "date": a.get("date", ""),
        "time": a.get("time", ""),
        "location": a.get("location", ""),
        "start": "",
    }
    bb = {
        "title": b.get("title", ""),
        "date": b.get("date", ""),
        "time": b.get("time", ""),
        "location": b.get("location", ""),
        "start": "",
    }
    return caldash.is_duplicate_pair(aa, bb)


def cluster_duplicates(appts: list[dict], not_dup_fps: set[str]) -> tuple[list[dict], list[dict]]:
    """Split into primary appointments and duplicate rows (non-best in each cluster)."""
    active = [a for a in appts if not a.get("dedup_exempt")]
    clusters: list[list[dict]] = []
    for appt in active:
        placed = False
        for cluster in clusters:
            if is_appt_duplicate(appt, cluster[0]):
                cluster.append(appt)
                placed = True
                break
        if not placed:
            clusters.append([appt])

    primary: list[dict] = []
    duplicates: list[dict] = []
    for cluster in clusters:
        fp = appointment_fingerprint(cluster[0])
        if fp in not_dup_fps:
            primary.extend(cluster)
            continue
        if len(cluster) == 1:
            primary.append(cluster[0])
        else:
            best = max(cluster, key=lambda x: (completeness_score(x), x.get("created_at", "")))
            primary.append(best)
            for other in cluster:
                if other["id"] != best["id"]:
                    duplicates.append(other)
    return primary, duplicates


def time_bucket(appt: dict, ref: date, urgency: str) -> str:
    if urgency == "urgent":
        return "urgent"
    if urgency == "needs_date":
        return "needs_date"
    if urgency == "past":
        return "past"
    d = appt.get("date")
    if not d:
        return "needs_date"
    try:
        ad = date.fromisoformat(d[:10])
    except ValueError:
        return "needs_date"
    delta = (ad - ref).days
    if delta == 0:
        return "today"
    if delta == 1:
        return "tomorrow"
    if delta <= 7 and ad >= ref:
        return "this_week"
    if ad > ref:
        return "later"
    return "past"


def serialize_appt(appt: dict, now: datetime, tz: str, role: str = "primary") -> dict:
    urg = compute_urgency(appt, now, tz)
    bucket = time_bucket(appt, now.date(), urg["urgency"])
    return {
        "id": appt.get("id"),
        "title": appt.get("title", ""),
        "doctor_or_clinic": appt.get("doctor_or_clinic", ""),
        "date": appt.get("date", ""),
        "time": appt.get("time", ""),
        "location": appt.get("location", ""),
        "notes": appt.get("notes", ""),
        "transport_notes": appt.get("transport_notes", ""),
        "reminder_time": appt.get("reminder_time", ""),
        "google_event_id": appt.get("google_event_id"),
        "google_event_link": appt.get("google_event_link", ""),
        "status": appt.get("status", "active"),
        "calendar_archived": bool(appt.get("calendar_archived")),
        "completed_at": appt.get("completed_at"),
        "created_at": appt.get("created_at"),
        "source": appt.get("source", ""),
        "fingerprint": appointment_fingerprint(appt),
        "urgency": urg["urgency"],
        "urgency_badge": urg["badge"],
        "urgency_style": urg["style"],
        "hours_until": urg["hours_until"],
        "time_bucket": bucket,
        "duplicate_role": role,
        "on_google": bool(appt.get("google_event_id")),
    }


def build_dashboard(
    appointments: list[dict],
    not_dup_fps: set[str],
    now: datetime,
    tz: str,
    include_archived: bool = False,
) -> dict[str, Any]:
    ref = now.date()
    archived_raw = [a for a in appointments if a.get("calendar_archived") or a.get("status") == "completed"]
    active_raw = [a for a in appointments if not a.get("calendar_archived") and a.get("status") != "completed"]

    primary, dup_raw = cluster_duplicates(active_raw, not_dup_fps)
    primary_items = [serialize_appt(a, now, tz, "primary") for a in primary]
    dup_items = [serialize_appt(a, now, tz, "duplicate") for a in dup_raw]

    groups: dict[str, list[dict]] = {
        "urgent": [],
        "today": [],
        "tomorrow": [],
        "this_week": [],
        "later": [],
        "needs_date": [],
        "past": [],
        "duplicates": [],
        "archived": [],
    }

    for item in primary_items:
        b = item["time_bucket"]
        if item["urgency"] == "urgent":
            groups["urgent"].append(item)
        elif b == "today":
            groups["today"].append(item)
        elif b == "tomorrow":
            groups["tomorrow"].append(item)
        elif b == "this_week":
            groups["this_week"].append(item)
        elif b == "needs_date":
            groups["needs_date"].append(item)
        elif b == "past":
            groups["past"].append(item)
        else:
            groups["later"].append(item)

    dup_score = {a["id"]: completeness_score(a) for a in dup_raw}
    groups["duplicates"] = sorted(
        dup_items,
        key=lambda x: (-dup_score.get(x["id"], 0), x.get("created_at", "")),
    )

    if include_archived:
        groups["archived"] = [
            serialize_appt(a, now, tz, "archived")
            for a in sorted(archived_raw, key=lambda x: x.get("created_at", ""), reverse=True)
        ]

    def sort_key(item: dict) -> tuple:
        urg = item.get("urgency", "upcoming")
        order = {"urgent": 0, "soon": 1, "upcoming": 2, "needs_date": 3, "past": 4}.get(urg, 5)
        return (order, item.get("date", ""), item.get("time", ""))

    for key in ("urgent", "today", "tomorrow", "this_week", "later", "needs_date", "past"):
        groups[key] = sorted(groups[key], key=sort_key)

    summary = {
        "urgent_count": len(groups["urgent"]),
        "today_count": len(groups["today"]),
        "this_week_count": len(groups["today"]) + len(groups["tomorrow"]) + len(groups["this_week"]),
        "duplicates_hidden": len(groups["duplicates"]),
        "needs_review_count": len(groups["needs_date"]) + len(groups["duplicates"]),
        "archived_count": len(archived_raw),
        "not_on_google_count": len([i for i in primary_items if not i.get("on_google")]),
        "total_active": len(primary_items),
    }
    parts = []
    if summary["urgent_count"]:
        parts.append(f"{summary['urgent_count']} urgent")
    if summary["today_count"]:
        parts.append(f"{summary['today_count']} today")
    if summary["this_week_count"]:
        parts.append(f"{summary['this_week_count']} this week")
    if summary["duplicates_hidden"]:
        parts.append(f"{summary['duplicates_hidden']} duplicates hidden")
    summary["summary_text"] = ", ".join(parts) if parts else "No active appointments"

    return {"summary": summary, "groups": groups}


def find_archiveable_duplicates(appointments: list[dict], not_dup_fps: set[str]) -> list[dict]:
    """Return duplicate appointments safe to archive (no google_event_id, not best in cluster)."""
    active = [
        a for a in appointments
        if not a.get("calendar_archived") and a.get("status") != "completed"
    ]
    _, dup_raw = cluster_duplicates(active, not_dup_fps)
    return [a for a in dup_raw if not a.get("google_event_id")]
