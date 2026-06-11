"""Tests for appointment dashboard urgency, dedup, and archive safety."""
import inspect
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

import appointment_dashboard as adash
import routes


TZ = "UTC"
NOW = datetime(2026, 6, 7, 10, 0, tzinfo=ZoneInfo(TZ))


def _appt(**kw):
    base = {
        "id": kw.pop("id", "a1"),
        "title": "Doctor Appointment Tomorrow",
        "date": "2026-06-08",
        "time": "15:00",
        "location": "",
        "notes": "",
        "created_at": "2026-06-01T10:00:00",
    }
    base.update(kw)
    return base


class TestUrgency:
    def test_upcoming_more_than_48h(self):
        a = _appt(date="2026-06-12", time="10:00")
        u = adash.compute_urgency(a, NOW, TZ)
        assert u["urgency"] == "upcoming"
        assert u["badge"] == "Upcoming"

    def test_soon_24_to_48h(self):
        a = _appt(date="2026-06-08", time="20:00")
        u = adash.compute_urgency(a, NOW, TZ)
        assert u["urgency"] == "soon"
        assert u["badge"] == "Soon"

    def test_urgent_within_24h(self):
        a = _appt(date="2026-06-07", time="16:00")
        u = adash.compute_urgency(a, NOW, TZ)
        assert u["urgency"] == "urgent"
        assert u["badge"] == "Urgent"

    def test_past(self):
        a = _appt(date="2026-06-05", time="10:00")
        u = adash.compute_urgency(a, NOW, TZ)
        assert u["urgency"] == "past"
        assert u["badge"] == "Past"

    def test_needs_date(self):
        a = _appt(date="", time="")
        u = adash.compute_urgency(a, NOW, TZ)
        assert u["urgency"] == "needs_date"
        assert u["badge"] == "Needs date"


class TestDuplicates:
    def test_duplicate_by_title_date_time(self):
        a = _appt(id="a1")
        b = _appt(id="a2", created_at="2026-06-02T10:00:00")
        assert adash.is_appt_duplicate(a, b)

    def test_best_keeps_google_linked(self):
        local = _appt(id="local", google_event_id=None)
        linked = _appt(id="linked", google_event_id="gcal-123")
        primary, dups = adash.cluster_duplicates([local, linked], set())
        assert len(primary) == 1
        assert primary[0]["id"] == "linked"
        assert len(dups) == 1
        assert dups[0]["id"] == "local"

    def test_duplicates_hidden_from_primary_groups(self):
        dupes = [_appt(id=f"d{i}", title="Test", date="2026-06-10", time="10:00") for i in range(3)]
        out = adash.build_dashboard(dupes, set(), NOW, TZ)
        assert out["summary"]["total_active"] == 1
        assert out["summary"]["duplicates_hidden"] == 2

    def test_mark_not_duplicate_fingerprint_splits_cluster(self):
        dupes = [_appt(id="d1"), _appt(id="d2", title="Other", date="2026-06-09")]
        fp = adash.appointment_fingerprint(dupes[0])
        primary, dups = adash.cluster_duplicates(dupes, {fp})
        assert len(primary) == 2
        assert len(dups) == 0


class TestArchiveDuplicates:
    def test_archive_only_memorymate_duplicates(self):
        linked = _appt(id="linked", google_event_id="g-1")
        dup1 = _appt(id="d1")
        dup2 = _appt(id="d2")
        to_archive = adash.find_archiveable_duplicates([linked, dup1, dup2], set())
        ids = {a["id"] for a in to_archive}
        assert "linked" not in ids
        assert "d1" in ids or "d2" in ids

    def test_no_google_delete_in_routes(self):
        src = inspect.getsource(routes.archive_duplicate_appointments)
        assert "delete" not in src.lower() or "google" in src.lower()
        assert "calendar_archived" in src


class TestSorting:
    def test_urgent_group_before_later_in_dashboard(self):
        urgent = _appt(id="u", date="2026-06-07", time="20:00")
        later = _appt(id="l", title="Later visit", date="2026-06-20", time="10:00")
        out = adash.build_dashboard([urgent, later], set(), NOW, TZ)
        assert len(out["groups"]["urgent"]) == 1
        assert len(out["groups"]["later"]) == 1


class TestSafety:
    def test_no_whatsapp_in_appointment_dashboard(self):
        src = inspect.getsource(adash)
        assert "whatsapp" not in src.lower()
        assert "graph.facebook.com" not in src

    def test_dashboard_endpoint_requires_caregiver(self):
        src = inspect.getsource(routes.appointments_dashboard)
        assert "require_role" in src

    def test_no_tokens_in_serialized_appt(self):
        raw = _appt(google_event_id="g1", access_token="secret")
        item = adash.serialize_appt(raw, NOW, TZ)
        assert "access_token" not in item
