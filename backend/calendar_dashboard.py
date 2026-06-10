"""Pure helpers for the caregiver calendar dashboard: fingerprints, dedup, grouping, summary."""
import re
from datetime import date, datetime, timedelta
from typing import Any

_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")


def normalize_title(title: str) -> str:
    t = _NON_WORD.sub("", (title or "").lower().strip())
    return _WS.sub(" ", t).strip()


def normalize_location(location: str) -> str:
    return re.sub(r"[^\w]", "", (location or "").lower().strip())[:80]


def split_start(start: str) -> tuple[str, str]:
    """Return (YYYY-MM-DD, HH:MM) from Google start or appointment fields."""
    if not start:
        return "", ""
    if "T" in start:
        try:
            dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            return dt.date().isoformat(), dt.strftime("%H:%M")
        except ValueError:
            return start[:10], ""
    return start[:10], ""


def event_fingerprint(title: str, date_str: str, time_str: str = "", location: str = "") -> str:
    """Stable id: normalized-title|date|time|location."""
    nt = normalize_title(title).replace(" ", "-") or "event"
    d = (date_str or "nodate")[:10]
    t = (time_str or "allday")[:5]
    loc = normalize_location(location)
    parts = [nt, d, t]
    if loc:
        parts.append(loc[:40])
    return "|".join(parts)


def titles_similar(a: str, b: str) -> bool:
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if len(na) >= 8 and na in nb:
        return True
    if len(nb) >= 8 and nb in na:
        return True
    return False


def _hm_minutes(hm: str) -> int | None:
    if not hm or ":" not in hm:
        return None
    try:
        h, m = hm[:5].split(":")
        return int(h) * 60 + int(m)
    except ValueError:
        return None


def times_close(t1: str, t2: str, minutes: int = 30) -> bool:
    if not t1 and not t2:
        return True
    m1, m2 = _hm_minutes(t1), _hm_minutes(t2)
    if m1 is None or m2 is None:
        return not t1 and not t2
    return abs(m1 - m2) <= minutes


def parse_date(date_str: str) -> date | None:
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str[:10])
    except ValueError:
        return None


def time_group_for(event_date: date | None, ref: date) -> str:
    if not event_date:
        return "later"
    delta = (event_date - ref).days
    if delta < 0:
        return "later"
    if delta == 0:
        return "today"
    if delta == 1:
        return "tomorrow"
    if delta <= 7:
        return "this_week"
    return "later"


def is_duplicate_pair(a: dict, b: dict) -> bool:
    """Detect if two calendar items likely represent the same event."""
    gid_a, gid_b = a.get("google_event_id"), b.get("google_event_id")
    if gid_a and gid_b and gid_a == gid_b:
        return True

    da = a.get("date") or split_start(a.get("start", ""))[0]
    db = b.get("date") or split_start(b.get("start", ""))[0]
    if not da or not db or da != db:
        return False

    ta = a.get("time") or split_start(a.get("start", ""))[1]
    tb = b.get("time") or split_start(b.get("start", ""))[1]

    fp_a = a.get("fingerprint") or event_fingerprint(
        a.get("title", ""), da, ta, a.get("location", ""),
    )
    fp_b = b.get("fingerprint") or event_fingerprint(
        b.get("title", ""), db, tb, b.get("location", ""),
    )
    if fp_a == fp_b:
        return True

    if titles_similar(a.get("title", ""), b.get("title", "")) and times_close(ta, tb):
        return True
    return False


def _item_key(item: dict) -> str:
    if item.get("google_event_id"):
        return f"g:{item['google_event_id']}"
    if item.get("appointment_id"):
        return f"a:{item['appointment_id']}"
    return f"f:{item.get('fingerprint', '')}"


def mark_duplicates(items: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split items into primary list and duplicate cluster (all members of dup groups)."""
    if not items:
        return [], []
    clusters: list[list[dict]] = []
    for item in items:
        placed = False
        for cluster in clusters:
            if is_duplicate_pair(item, cluster[0]):
                cluster.append(item)
                placed = True
                break
        if not placed:
            clusters.append([item])
    primary_clean: list[dict] = []
    duplicates_clean: list[dict] = []
    for cluster in clusters:
        if len(cluster) > 1:
            head_key = _item_key(cluster[0])
            for i, it in enumerate(cluster):
                d = dict(it)
                d["status"] = "possible_duplicate"
                d["badge"] = "possible_duplicate"
                d["duplicate_count"] = len(cluster) - 1
                if i > 0:
                    d["duplicate_of"] = head_key
                duplicates_clean.append(d)
        else:
            primary_clean.append(dict(cluster[0]))
    return primary_clean, duplicates_clean


def find_duplicate_matches(
    candidate: dict,
    google_events: list[dict],
    appointments: list[dict],
) -> list[dict]:
    """Return existing Google events or imported appointments that match candidate."""
    matches: list[dict] = []
    seen: set[str] = set()
    for pool in (google_events, appointments):
        for other in pool:
            if not is_duplicate_pair(candidate, other):
                continue
            key = _item_key(other)
            if key in seen:
                continue
            seen.add(key)
            matches.append(other)
    return matches


def build_summary_text(summary: dict) -> str:
    parts = [
        f"{summary.get('total_upcoming_google', 0)} upcoming events found.",
        f"{summary.get('imported_count', 0)} are already in MemoryMate.",
    ]
    ns = summary.get("new_suggestions", 0)
    if ns:
        parts.append(f"{ns} new suggestions.")
    dup = summary.get("possible_duplicates", 0)
    if dup:
        parts.append(f"{dup} may be duplicates.")
    nxt = summary.get("next_event")
    if nxt and nxt.get("title"):
        when = nxt.get("when_label") or ""
        parts.append(f"Next: {nxt['title']}{f' {when}' if when else ''}.")
    return " ".join(parts)


def _when_label(event_date: date | None, time_str: str, ref: date) -> str:
    if not event_date:
        return ""
    delta = (event_date - ref).days
    if delta == 0:
        base = "today"
    elif delta == 1:
        base = "tomorrow"
    else:
        base = event_date.strftime("%b %d")
    if time_str:
        try:
            h, m = time_str[:5].split(":")
            hour, minute = int(h), int(m)
            t = datetime(2000, 1, 1, hour, minute)
            base = f"{base} at {t.strftime('%I:%M %p').lstrip('0')}"
        except ValueError:
            base = f"{base} at {time_str}"
    return base


def build_dashboard(
    google_raw: list[dict],
    appointments: list[dict],
    hidden_map: dict[str, dict],
    ref: date,
    include_hidden: bool = False,
) -> dict[str, Any]:
    """Assemble grouped dashboard payload from Google events and MemoryMate appointments."""
    imported_gids = {
        a.get("google_event_id") for a in appointments if a.get("google_event_id")
    }
    imported_by_gid = {
        a.get("google_event_id"): a for a in appointments if a.get("google_event_id")
    }

    def hidden_status(fp: str, gid: str | None) -> str | None:
        if gid and gid in hidden_map:
            return hidden_map[gid].get("status")
        if fp in hidden_map:
            return hidden_map[fp].get("status")
        return None

    def make_google_item(ev: dict, status: str, badge: str) -> dict:
        d, t = split_start(ev.get("start", ""))
        fp = event_fingerprint(ev.get("title", ""), d, t, ev.get("location", ""))
        return {
            "type": "google_suggestion",
            "google_event_id": ev.get("google_event_id"),
            "appointment_id": None,
            "title": ev.get("title", ""),
            "date": d,
            "time": t,
            "location": ev.get("location", ""),
            "start": ev.get("start", ""),
            "end": ev.get("end", ""),
            "all_day": ev.get("all_day", False),
            "description": ev.get("description", ""),
            "html_link": ev.get("html_link", ""),
            "fingerprint": fp,
            "status": status,
            "badge": badge,
        }

    all_google_simplified = list(google_raw)
    total_upcoming = len(all_google_simplified)

    suggestions_new: list[dict] = []
    imported_items: list[dict] = []
    hidden_items: list[dict] = []

    for ev in all_google_simplified:
        gid = ev.get("google_event_id")
        d, t = split_start(ev.get("start", ""))
        fp = event_fingerprint(ev.get("title", ""), d, t, ev.get("location", ""))
        hs = hidden_status(fp, gid)
        if hs in ("hidden", "handled", "duplicate"):
            item = make_google_item(ev, "hidden" if hs == "hidden" else "handled", hs)
            hidden_items.append(item)
            continue
        if gid in imported_gids:
            ap = imported_by_gid.get(gid)
            item = make_google_item(ev, "imported", "imported")
            if ap:
                item["appointment_id"] = ap.get("id")
            imported_items.append(item)
        else:
            suggestions_new.append(make_google_item(ev, "new", "new"))

    primary_suggestions, dup_google = mark_duplicates(suggestions_new)
    not_dup_fps = {
        r.get("fingerprint") for r in hidden_map.values()
        if r.get("status") == "not_duplicate"
    }
    dup_google = [d for d in dup_google if d.get("fingerprint") not in not_dup_fps]
    primary_suggestions = [
        p for p in primary_suggestions
        if p.get("fingerprint") not in not_dup_fps
    ]

    not_on_google: list[dict] = []
    for a in appointments:
        if a.get("google_event_id"):
            continue
        if a.get("calendar_archived"):
            continue
        if not (a.get("title") and a.get("date")):
            continue
        fp = event_fingerprint(
            a.get("title", ""), a.get("date", ""), a.get("time", ""), a.get("location", ""),
        )
        hs = hidden_status(fp, None)
        if hs in ("hidden", "handled") and not include_hidden:
            continue
        item = {
            "type": "appointment",
            "google_event_id": None,
            "appointment_id": a.get("id"),
            "title": a.get("title", ""),
            "date": a.get("date", ""),
            "time": a.get("time", ""),
            "location": a.get("location", ""),
            "start": a.get("date", "") if not a.get("time") else f"{a.get('date')}T{a.get('time')}:00",
            "all_day": not bool(a.get("time")),
            "fingerprint": fp,
            "status": "not_on_google",
            "badge": "not_on_google",
            "doctor_or_clinic": a.get("doctor_or_clinic", ""),
            "notes": a.get("notes", ""),
        }
        if hs == "hidden":
            item["status"] = "hidden"
            item["badge"] = "hidden"
            hidden_items.append(item)
            continue
        if hs == "handled":
            item["status"] = "handled"
            item["badge"] = "handled"
            hidden_items.append(item)
            continue
        not_on_google.append(item)

    primary_appts, dup_appts = mark_duplicates(not_on_google)
    dup_appts = [d for d in dup_appts if d.get("fingerprint") not in not_dup_fps]
    primary_appts = [p for p in primary_appts if p.get("fingerprint") not in not_dup_fps]

    all_duplicates = dup_google + dup_appts
    # dedupe duplicate list by key
    seen_d: set[str] = set()
    duplicates_unique: list[dict] = []
    for d in all_duplicates:
        k = _item_key(d)
        if k in seen_d:
            continue
        seen_d.add(k)
        duplicates_unique.append(d)

    groups: dict[str, list[dict]] = {
        "today": [],
        "tomorrow": [],
        "this_week": [],
        "later": [],
        "imported": [],
        "duplicates": duplicates_unique,
    }

    for item in primary_suggestions:
        ed = parse_date(item.get("date", ""))
        grp = time_group_for(ed, ref)
        groups[grp].append(item)

    for item in imported_items:
        ed = parse_date(item.get("date", ""))
        if ed and ed >= ref:
            groups["imported"].append(item)

    today_count = len(groups["today"])
    week_count = today_count + len(groups["tomorrow"]) + len(groups["this_week"])

    next_event = None
    upcoming = sorted(
        [i for i in primary_suggestions if parse_date(i.get("date", "")) and parse_date(i.get("date", "")) >= ref],
        key=lambda x: (x.get("date", ""), x.get("time", "")),
    )
    if upcoming:
        u = upcoming[0]
        ed = parse_date(u.get("date", ""))
        next_event = {
            "title": u.get("title"),
            "date": u.get("date"),
            "time": u.get("time"),
            "when_label": _when_label(ed, u.get("time", ""), ref),
        }

    summary = {
        "total_upcoming_google": total_upcoming,
        "imported_count": len(imported_items),
        "new_suggestions": len(primary_suggestions),
        "possible_duplicates": len(duplicates_unique),
        "hidden_count": len(hidden_items),
        "not_on_google_count": len(primary_appts),
        "today_count": today_count,
        "week_count": week_count,
        "next_event": next_event,
    }
    summary["summary_text"] = build_summary_text(summary)

    return {
        "summary": summary,
        "groups": groups,
        "not_on_google": primary_appts,
        "hidden": hidden_items if include_hidden else [],
        "suggestions": primary_suggestions,
    }
