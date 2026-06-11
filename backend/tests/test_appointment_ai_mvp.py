"""Tests for AI appointment creator and duplicate prevention."""
import inspect
from datetime import datetime, timezone
import pytest

import appointment_ai as appt_ai
import routes


REF = datetime(2026, 6, 7, 10, 0, tzinfo=timezone.utc)


class TestAppointmentAiRules:
    def test_complete_prompt_draft(self):
        out = appt_ai.extract_appointment_options(
            "Dentist at Dubai Mall tomorrow at 4 PM, remind me 1 hour before"
        )
        assert out["add_to_google"] is False

    def test_missing_time_asks_clarification(self):
        q = appt_ai.build_clarification_question(["time"])
        assert "time" in q.lower()
        from ai import parse_calendar_event_rules
        out = parse_calendar_event_rules("Doctor appointment tomorrow", REF)
        assert "time" in out.get("missing_fields", [])

    def test_reminder_extraction_via_rules(self):
        from ai import parse_calendar_event_rules
        out = parse_calendar_event_rules(
            "Dentist tomorrow at 4 PM, remind me 1 hour before", REF,
        )
        assert "hour" in out["draft"]["reminder"].lower()

    def test_location_extraction(self):
        from ai import parse_calendar_event_rules
        out = parse_calendar_event_rules("Dentist at Dubai Mall tomorrow at 4 PM", REF)
        assert out["draft"]["location"] == "Dubai Mall"

    def test_urgent_wording(self):
        opts = appt_ai.extract_appointment_options("Important doctor visit tomorrow at 3 PM")
        assert opts["urgent"] is True

    def test_google_meet_detection(self):
        opts = appt_ai.extract_appointment_options("Family meeting Friday at 7 PM, Google Meet link")
        assert opts["online_meeting"] is True

    def test_attendee_emails(self):
        opts = appt_ai.extract_appointment_options("Meeting with fadi@example.com tomorrow 5pm")
        assert "fadi@example.com" in opts["attendees"]


class TestDraftEndpointNoDbWrite:
    def test_draft_ai_handler_has_no_insert(self):
        src = inspect.getsource(routes.appointment_draft_ai)
        assert "insert_one" not in src
        assert "update_one" not in src


class TestDuplicatePrevention:
    def test_find_duplicates_helper(self):
        import appointment_dashboard as adash
        a = {"title": "Doctor Appointment Tomorrow", "date": "2026-06-08", "time": "15:00"}
        b = {"title": "doctor appointment tomorrow", "date": "2026-06-08", "time": "15:00", "id": "x"}
        assert adash.is_appt_duplicate(a, b)

    def test_archive_skips_google_linked(self):
        import appointment_dashboard as adash
        linked = {"id": "g", "google_event_id": "cal-1", "title": "A", "date": "2026-06-08", "time": "10:00"}
        dup = {"id": "d", "title": "A", "date": "2026-06-08", "time": "10:00"}
        to_archive = adash.find_archiveable_duplicates([linked, dup], set())
        ids = {a["id"] for a in to_archive}
        assert "g" not in ids


class TestSafety:
    def test_no_whatsapp(self):
        src = inspect.getsource(appt_ai)
        assert "whatsapp" not in src.lower()
        assert "graph.facebook.com" not in src

    def test_no_google_delete_in_routes(self):
        src = inspect.getsource(routes.create_appointment_from_draft)
        assert "@router.delete" not in src
        assert "calendar/events" not in src

    def test_draft_requires_caregiver(self):
        src = inspect.getsource(routes.appointment_draft_ai)
        assert "require_role" in src

    def test_create_from_draft_requires_caregiver(self):
        src = inspect.getsource(routes.create_appointment_from_draft)
        assert "require_role" in src
