"""Tests for calendar dashboard deduplication, hiding, and summary logic."""
import inspect
from datetime import date

import pytest

import calendar_dashboard as cd
import gcal


class TestFingerprint:
    def test_fingerprint_format(self):
        fp = cd.event_fingerprint("Doctor Appointment", "2026-06-10", "16:00", "Dubai Mall")
        assert "doctor-appointment" in fp
        assert "2026-06-10" in fp
        assert "16:00" in fp

    def test_same_inputs_same_fingerprint(self):
        a = cd.event_fingerprint("Doctor Appointment", "2026-06-10", "16:00", "")
        b = cd.event_fingerprint("doctor appointment", "2026-06-10", "16:00", "")
        assert a == b


class TestDuplicateDetection:
    def test_duplicate_by_google_event_id(self):
        a = {"google_event_id": "abc", "title": "A", "date": "2026-06-10", "time": "16:00"}
        b = {"google_event_id": "abc", "title": "B", "date": "2026-06-11", "time": "10:00"}
        assert cd.is_duplicate_pair(a, b)

    def test_duplicate_by_title_date_time(self):
        a = {"title": "Doctor Appointment Tomorrow", "date": "2026-06-10", "time": "16:00"}
        b = {"title": "doctor appointment tomorrow", "date": "2026-06-10", "time": "16:00"}
        assert cd.is_duplicate_pair(a, b)

    def test_not_duplicate_different_day(self):
        a = {"title": "Doctor Appointment", "date": "2026-06-10", "time": "16:00"}
        b = {"title": "Doctor Appointment", "date": "2026-06-11", "time": "16:00"}
        assert not cd.is_duplicate_pair(a, b)

    def test_mark_duplicates_groups_repeats(self):
        items = [
            {"title": "Doctor Appointment Tomorrow", "date": "2026-06-10", "time": "16:00", "fingerprint": "a"},
            {"title": "Doctor Appointment Tomorrow", "date": "2026-06-10", "time": "16:00", "fingerprint": "b"},
            {"title": "Unique Event", "date": "2026-06-12", "time": "10:00", "fingerprint": "c"},
        ]
        primary, dups = cd.mark_duplicates(items)
        assert len(primary) == 1
        assert primary[0]["title"] == "Unique Event"
        assert len(dups) == 2


class TestBuildDashboard:
    REF = date(2026, 6, 7)

    def test_imported_not_in_new_suggestions(self):
        google = [
            {
                "google_event_id": "g1",
                "title": "Flight",
                "start": "2026-06-10T10:00:00",
                "end": "",
                "all_day": False,
                "location": "",
                "description": "",
                "html_link": "",
            },
        ]
        appointments = [
            {"id": "a1", "title": "Flight", "date": "2026-06-10", "time": "10:00", "google_event_id": "g1"},
        ]
        out = cd.build_dashboard(google, appointments, {}, self.REF)
        assert out["summary"]["new_suggestions"] == 0
        assert len(out["groups"]["imported"]) == 1

    def test_hidden_suggestions_excluded(self):
        google = [
            {
                "google_event_id": "g2",
                "title": "Hidden Event",
                "start": "2026-06-08T14:00:00",
                "end": "",
                "all_day": False,
                "location": "",
                "description": "",
                "html_link": "",
            },
        ]
        hidden = {"g2": {"status": "hidden", "fingerprint": "fp"}}
        out = cd.build_dashboard(google, [], hidden, self.REF)
        assert out["summary"]["new_suggestions"] == 0
        assert out["summary"]["hidden_count"] == 1

    def test_hidden_can_be_included(self):
        google = [
            {
                "google_event_id": "g2",
                "title": "Hidden Event",
                "start": "2026-06-08T14:00:00",
                "end": "",
                "all_day": False,
                "location": "",
                "description": "",
                "html_link": "",
            },
        ]
        hidden = {"g2": {"status": "hidden"}}
        out = cd.build_dashboard(google, [], hidden, self.REF, include_hidden=True)
        assert len(out["hidden"]) == 1

    def test_summary_counts(self):
        google = [
            {"google_event_id": "g1", "title": "Today", "start": "2026-06-07T09:00:00", "end": "", "all_day": False, "location": "", "description": "", "html_link": ""},
            {"google_event_id": "g2", "title": "Tomorrow", "start": "2026-06-08T09:00:00", "end": "", "all_day": False, "location": "", "description": "", "html_link": ""},
        ]
        appointments = [
            {"id": "a1", "title": "Local Appt", "date": "2026-06-09", "time": "11:00"},
        ]
        out = cd.build_dashboard(google, appointments, {}, self.REF)
        assert out["summary"]["total_upcoming_google"] == 2
        assert out["summary"]["today_count"] == 1
        assert out["summary"]["not_on_google_count"] == 1

    def test_duplicate_appointments_grouped(self):
        appointments = [
            {"id": "a1", "title": "Doctor Appointment Tomorrow", "date": "2026-06-08", "time": "15:00"},
            {"id": "a2", "title": "Doctor Appointment Tomorrow", "date": "2026-06-08", "time": "15:00"},
        ]
        out = cd.build_dashboard([], appointments, {}, self.REF)
        assert out["summary"]["possible_duplicates"] >= 2
        assert out["summary"]["not_on_google_count"] == 0


class TestCheckDuplicateMatches:
    def test_finds_similar_google_event(self):
        candidate = {"title": "Dentist", "date": "2026-06-10", "time": "16:00", "location": ""}
        google = [{"title": "Dentist", "date": "2026-06-10", "time": "16:00", "google_event_id": "g1"}]
        matches = cd.find_duplicate_matches(candidate, google, [])
        assert len(matches) == 1


class TestApiSafety:
    def test_no_google_delete_edit_endpoints(self):
        src = inspect.getsource(gcal)
        assert "@router.delete(\"/events" not in src
        assert "@router.patch(\"/events" not in src

    def test_no_raw_tokens_in_dashboard_response_fields(self):
        # Dashboard builder must not add token fields.
        src = inspect.getsource(cd.build_dashboard)
        assert "access_token" not in src
        assert "refresh_token" not in src

    def test_gcal_status_never_returns_tokens(self):
        src = inspect.getsource(gcal.status)
        assert "access_token" not in src
        assert "refresh_token" not in src
