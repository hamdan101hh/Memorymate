"""Tests for shared duplicate_helpers module."""
import duplicate_helpers as duph


def test_fingerprint_stable():
    a = {"title": "Dentist", "date": "2026-06-10", "time": "16:00", "location": "Mall"}
    assert duph.appointment_fingerprint(a) == duph.appointment_fingerprint(a)


def test_find_duplicate_matches():
    candidate = {"title": "Dentist", "date": "2026-06-10", "time": "16:00", "location": "mall"}
    existing = [
        {"id": "1", "title": "Dentist", "date": "2026-06-10", "time": "16:00", "location": "mall"},
        {"id": "2", "title": "Other", "date": "2026-07-01", "time": "10:00"},
        {"id": "3", "title": "dentist", "date": "2026-06-10", "time": "16:00", "calendar_archived": True},
    ]
    matches = duph.find_duplicate_matches(candidate, existing)
    assert len(matches) == 1
    assert matches[0]["id"] == "1"


def test_serialize_matches_no_tokens():
    matches = [{"id": "x", "title": "T", "google_event_id": "g1", "access_token": "secret"}]
    out = duph.serialize_matches(matches)
    assert "access_token" not in out[0]
    assert out[0]["id"] == "x"


def test_docs_exist():
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    assert (root / "docs" / "APP_STORE_READINESS_PLAN.md").is_file()
    assert (root / "docs" / "CLEANUP_NOTES.md").is_file()
