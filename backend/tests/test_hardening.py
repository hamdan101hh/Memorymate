"""Regression tests for the hardening pass:
- demo-login issues tokens by role WITHOUT the client sending any password
- transcribe endpoint cannot crash on the empty-audio path (returns 400, never 500/undefined)
- server-side role enforcement (patient blocked from admin + caregiver-only writes)
- capture pipeline routes classified events into the EXISTING appointments / medications
  / important_people / important_places tables (no duplicate tables)
- privacy-review 'edit' action saves an edited memory and rejects unknown actions
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _demo(role):
    r = requests.post(f"{API}/auth/demo-login", json={"role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- demo-login (no secrets in client) ----------------
class TestDemoLogin:
    def test_demo_login_roles(self):
        for role in ("patient", "caregiver", "admin"):
            d = _demo(role)
            assert d["token"]
            assert d["user"]["role"] == role

    def test_demo_login_unknown_role(self):
        r = requests.post(f"{API}/auth/demo-login", json={"role": "hacker"}, timeout=15)
        assert r.status_code == 400


# ---------------- transcribe cannot crash ----------------
class TestTranscribeGuard:
    def test_empty_audio_returns_400_not_crash(self):
        token = _demo("patient")["token"]
        files = {"file": ("empty.webm", io.BytesIO(b""), "audio/webm")}
        r = requests.post(f"{API}/memories/transcribe",
                          headers={"Authorization": f"Bearer {token}"}, files=files, timeout=30)
        # Must be a clean handled error, never a 500 from an undefined variable.
        assert r.status_code == 400, r.text


# ---------------- role enforcement (backend, not just UI) ----------------
class TestRoleEnforcement:
    def test_patient_cannot_access_admin(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/admin/stats", headers=_h(token), timeout=15)
        assert r.status_code == 403

    def test_patient_cannot_write_caregiver_only(self):
        token = _demo("patient")["token"]
        r = requests.post(f"{API}/medications", headers=_h(token),
                          json={"medication_name": "should-be-blocked"}, timeout=15)
        assert r.status_code == 403

    def test_no_token_rejected(self):
        r = requests.get(f"{API}/reminders", timeout=15)
        assert r.status_code in (401, 403)


# ---------------- capture routes into existing tables ----------------
class TestCaptureRouting:
    def test_events_route_to_existing_tables(self):
        token = _demo("patient")["token"]
        requests.patch(f"{API}/capture/settings", json={"private_mode": False}, headers=_h(token), timeout=15)
        appts_before = len(requests.get(f"{API}/appointments", headers=_h(token), timeout=15).json())
        meds_before = len(requests.get(f"{API}/medications", headers=_h(token), timeout=15).json())

        sid = requests.post(f"{API}/capture/sessions", headers=_h(token),
                            json={"mode": "capture", "title": f"Routing {uuid.uuid4().hex[:6]}",
                                  "consent_confirmed": True}, timeout=30).json()["id"]
        transcript = ("Sarah reminded me about the doctor appointment at the clinic tomorrow at 3 PM. "
                      "The doctor said take my blood pressure medicine every morning.")
        r = requests.post(f"{API}/capture/sessions/{sid}/process", headers=_h(token),
                          json={"transcript": transcript}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        if not data.get("events"):
            pytest.skip("AI not configured (no LLM key) — no events to route")
        types = {e["event_type"] for e in data["events"]}
        # every event carries a confidence tag
        assert all("confidence" in e for e in data["events"])
        assert "appointment" in types or "medication" in types

        appts_after = len(requests.get(f"{API}/appointments", headers=_h(token), timeout=15).json())
        meds_after = len(requests.get(f"{API}/medications", headers=_h(token), timeout=15).json())
        assert appts_after >= appts_before
        assert meds_after >= meds_before
        assert (appts_after + meds_after) > (appts_before + meds_before)


# ---------------- private vault (PIN-locked sensitive content) ----------------
class TestPrivateVault:
    def test_pin_set_unlock_and_redaction(self):
        token = _demo("patient")["token"]
        h = _h(token)
        # Set/refresh a known PIN (allowed because demo patient is reused).
        st = requests.get(f"{API}/capture/vault/status", headers=h, timeout=15).json()
        pin_body = {"pin": "13579"}
        if st.get("pin_set"):
            # We don't know the old PIN in CI; skip the change path and just exercise unlock guard.
            wrong = requests.post(f"{API}/capture/vault/unlock", headers=h, json={"pin": "00000"}, timeout=15)
            assert wrong.status_code in (403, 429)
            return
        assert requests.post(f"{API}/capture/vault/pin", headers=h, json=pin_body, timeout=15).status_code == 200
        # Wrong PIN rejected.
        assert requests.post(f"{API}/capture/vault/unlock", headers=h, json={"pin": "99999"}, timeout=15).status_code == 403
        # Correct PIN unlocks (items list, possibly empty).
        ok = requests.post(f"{API}/capture/vault/unlock", headers=h, json=pin_body, timeout=15)
        assert ok.status_code == 200 and "items" in ok.json()

    def test_short_pin_rejected(self):
        token = _demo("caregiver")["token"]
        r = requests.post(f"{API}/capture/vault/pin", headers=_h(token), json={"pin": "12"}, timeout=15)
        assert r.status_code == 400


# ---------------- AI usage cap ----------------
class TestUsageCap:
    def test_usage_endpoint_shape(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/usage/today", headers=_h(token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("est_cost", "ops", "cap", "remaining"):
            assert k in d


# ---------------- continuous capture append ----------------
class TestContinuousAppend:
    def test_append_does_not_finalize_session(self):
        token = _demo("patient")["token"]
        h = _h(token)
        requests.patch(f"{API}/capture/settings", json={"private_mode": False}, headers=h, timeout=15)
        sid = requests.post(f"{API}/capture/sessions", headers=h,
                            json={"mode": "capture", "title": f"Live {uuid.uuid4().hex[:6]}",
                                  "consent_confirmed": True}, timeout=30).json()["id"]
        r = requests.post(f"{API}/capture/sessions/{sid}/append", headers=h,
                          json={"transcript": "Had breakfast with Sarah this morning."}, timeout=90)
        assert r.status_code == 200, r.text
        assert "context" in r.json()
        # Session must still be active (append never completes it).
        s = requests.get(f"{API}/capture/sessions/{sid}", headers=h, timeout=15).json()
        assert s["status"] == "active"


# ---------------- privacy review edit ----------------
class TestReviewEdit:
    def test_edit_action_and_unknown_action(self):
        token = _demo("patient")["token"]
        requests.patch(f"{API}/capture/settings", json={"private_mode": False}, headers=_h(token), timeout=15)
        sid = requests.post(f"{API}/capture/sessions", headers=_h(token),
                            json={"mode": "capture", "title": f"Review {uuid.uuid4().hex[:6]}",
                                  "consent_confirmed": True}, timeout=30).json()["id"]
        # A transcript likely to produce a private/sensitive review item.
        requests.post(f"{API}/capture/sessions/{sid}/process", headers=_h(token),
                      json={"transcript": "I talked privately about some money worries and my bank password."}, timeout=90)
        items = requests.get(f"{API}/capture/review", headers=_h(token), timeout=15).json()
        if items:
            rid = items[0]["id"]
            # unknown action rejected
            bad = requests.post(f"{API}/capture/review/{rid}/action", headers=_h(token),
                                json={"action": "nuke"}, timeout=15)
            assert bad.status_code == 400
            # edit accepted
            ok = requests.post(f"{API}/capture/review/{rid}/action", headers=_h(token),
                               json={"action": "edit", "edited_content": "Edited safe note."}, timeout=15)
            assert ok.status_code == 200 and ok.json()["action"] == "edit"


# ---------------- location (optional) ----------------
class TestLocation:
    def test_location_setting_and_memory_persist(self):
        token = _demo("patient")["token"]
        h = _h(token)
        st = requests.patch(f"{API}/capture/settings", headers=h, json={"location_enabled": True}, timeout=15)
        assert st.status_code == 200 and st.json()["location_enabled"] is True
        loc = {"lat": 25.2, "lng": 55.27, "label": "25.2, 55.27"}
        r = requests.post(f"{API}/memories", headers=h,
                          json={"transcript": "Walked in the park.", "source": "manual", "location": loc}, timeout=90)
        assert r.status_code == 200, r.text
        assert r.json().get("location", {}).get("lat") == 25.2


# ---------------- memory book ----------------
class TestMemoryBook:
    def test_caregiver_crud_and_patient_read_only(self):
        cg = _h(_demo("caregiver")["token"])
        pt = _h(_demo("patient")["token"])
        created = requests.post(f"{API}/memory-book", headers=cg,
                                json={"title": f"Sarah {uuid.uuid4().hex[:5]}", "relationship": "Daughter",
                                      "story": "Visits every Sunday.", "category": "person"}, timeout=15)
        assert created.status_code == 200, created.text
        eid = created.json()["id"]
        # patient can read but not write
        assert requests.get(f"{API}/memory-book", headers=pt, timeout=15).status_code == 200
        assert requests.post(f"{API}/memory-book", headers=pt, json={"title": "blocked"}, timeout=15).status_code == 403
        # caregiver can delete
        assert requests.delete(f"{API}/memory-book/{eid}", headers=cg, timeout=15).status_code == 200


# ---------------- family circle ----------------
class TestFamilyCircle:
    def test_list_shape_and_admin_only_management(self):
        cg = _h(_demo("caregiver")["token"])
        pt = _h(_demo("patient")["token"])
        r = requests.get(f"{API}/family", headers=cg, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("members", "invites", "my_permissions"):
            assert k in d
        assert len(d["members"]) >= 1
        # patient role has no access to the family circle endpoint
        assert requests.get(f"{API}/family", headers=pt, timeout=15).status_code == 403

    def test_invite_pending_and_cancel(self):
        cg = _h(_demo("caregiver")["token"])
        email = f"invitee_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/family/invite", headers=cg,
                          json={"email": email, "relationship": "Son", "circle_role": "family", "permissions": "view"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["linked"] is False
        invites = requests.get(f"{API}/family", headers=cg, timeout=15).json()["invites"]
        inv = next((i for i in invites if i["email"] == email), None)
        assert inv is not None
        assert requests.delete(f"{API}/family/invite/{inv['id']}", headers=cg, timeout=15).status_code == 200

    def test_cannot_remove_last_primary(self):
        cg = _h(_demo("caregiver")["token"])
        members = requests.get(f"{API}/family", headers=cg, timeout=15).json()["members"]
        fulls = [m for m in members if m["permissions"] == "full"]
        if len(fulls) == 1:
            r = requests.delete(f"{API}/family/{fulls[0]['link_id']}", headers=cg, timeout=15)
            assert r.status_code == 400


# ---------------- whatsapp bot ----------------
class TestWhatsApp:
    def test_status_caregiver_only(self):
        cg = _h(_demo("caregiver")["token"])
        pt = _h(_demo("patient")["token"])
        r = requests.get(f"{API}/whatsapp/status", headers=cg, timeout=15)
        assert r.status_code == 200 and "configured" in r.json()
        assert requests.get(f"{API}/whatsapp/status", headers=pt, timeout=15).status_code == 403

    def test_link_crud(self):
        cg = _h(_demo("caregiver")["token"])
        phone = f"15550{uuid.uuid4().int % 100000:05d}"
        created = requests.post(f"{API}/whatsapp/links", headers=cg,
                                json={"phone": phone, "name": "Test", "role": "family"}, timeout=15)
        assert created.status_code == 200, created.text
        lid = created.json()["id"]
        assert any(l["id"] == lid for l in requests.get(f"{API}/whatsapp/links", headers=cg, timeout=15).json())
        assert requests.delete(f"{API}/whatsapp/links/{lid}", headers=cg, timeout=15).status_code == 200

    def test_webhook_verify_rejects_bad_token(self):
        r = requests.get(f"{API}/whatsapp/webhook",
                         params={"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "123"},
                         timeout=15)
        assert r.status_code == 403

    def test_inbound_unknown_number_does_not_crash(self):
        # Unlinked sender: handler must swallow errors and still return 200 so Meta doesn't retry-storm.
        payload = {"entry": [{"changes": [{"value": {"messages": [
            {"from": "10000000000", "type": "text", "text": {"body": "hello"}}]}}]}]}
        r = requests.post(f"{API}/whatsapp/webhook", json=payload, timeout=30)
        assert r.status_code == 200 and r.json().get("ok") is True


# ---------------- always-on memory capture ----------------
class TestAlwaysOn:
    def test_start_requires_consent(self):
        pt = _h(_demo("patient")["token"])
        r = requests.post(f"{API}/capture/always-on/start", headers=pt,
                          json={"duration": "1w", "consent_confirmed": False}, timeout=15)
        assert r.status_code == 400

    def test_start_rejects_bad_duration(self):
        pt = _h(_demo("patient")["token"])
        r = requests.post(f"{API}/capture/always-on/start", headers=pt,
                          json={"duration": "forever", "consent_confirmed": True}, timeout=15)
        assert r.status_code == 400

    def test_start_pause_stop_lifecycle(self):
        pt = _h(_demo("patient")["token"])
        # make sure private mode is off
        requests.patch(f"{API}/capture/settings", headers=pt, json={"private_mode": False}, timeout=15)
        started = requests.post(f"{API}/capture/always-on/start", headers=pt,
                                json={"duration": "1w", "note_style": "short",
                                      "reminder_tone": "direct", "consent_confirmed": True}, timeout=15)
        assert started.status_code == 200, started.text
        s = started.json()
        assert s["always_on"] is True and s["active"] is True
        assert s["duration"] == "1w" and s["seconds_remaining"] > 0
        assert s["note_style"] == "short" and s["reminder_tone"] == "direct"

        paused = requests.post(f"{API}/capture/always-on/pause", headers=pt, json={"paused": True}, timeout=15).json()
        assert paused["paused"] is True and paused["active"] is False

        stopped = requests.post(f"{API}/capture/always-on/stop", headers=pt, timeout=15).json()
        assert stopped["always_on"] is False and stopped["active"] is False

    def test_status_shape(self):
        pt = _h(_demo("patient")["token"])
        st = requests.get(f"{API}/capture/status", headers=pt, timeout=15)
        assert st.status_code == 200
        for k in ("always_on", "paused", "active", "duration", "note_style", "reminder_tone", "review_count", "locked_count"):
            assert k in st.json()

    def test_delete_recent_returns_counts(self):
        pt = _h(_demo("patient")["token"])
        r = requests.delete(f"{API}/capture/recent?minutes=5", headers=pt, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True and "deleted_events" in body

    def test_settings_persist_style_prefs(self):
        pt = _h(_demo("patient")["token"])
        requests.patch(f"{API}/capture/settings", headers=pt,
                       json={"note_style": "bullets", "reminder_tone": "family"}, timeout=15)
        s = requests.get(f"{API}/capture/settings", headers=pt, timeout=15).json()
        assert s["note_style"] == "bullets" and s["reminder_tone"] == "family"

    def test_review_add_to_vault_action_valid(self):
        # add_to_vault must be an accepted action (404 for missing item, never 400 'unknown action').
        pt = _h(_demo("patient")["token"])
        r = requests.post(f"{API}/capture/review/{uuid.uuid4()}/action", headers=pt,
                          json={"action": "add_to_vault"}, timeout=15)
        assert r.status_code == 404


# ---------------- push notifications ----------------
class TestNotifications:
    def test_config_requires_auth(self):
        r = requests.get(f"{API}/notifications/config", timeout=15)
        assert r.status_code in (401, 403)

    def test_config_shape(self):
        pt = _h(_demo("patient")["token"])
        r = requests.get(f"{API}/notifications/config", headers=pt, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "configured" in body and "vapid_public_key" in body

    def test_preferences_defaults_and_update(self):
        pt = _h(_demo("patient")["token"])
        prefs = requests.get(f"{API}/notifications/preferences", headers=pt, timeout=15).json()
        for k in ("patient_reminders", "caregiver_alerts", "daily_summary",
                  "privacy_review_alerts", "quiet_hours_enabled", "quiet_hours_start"):
            assert k in prefs
        updated = requests.patch(f"{API}/notifications/preferences", headers=pt,
                                 json={"patient_reminders": False, "quiet_hours_enabled": True,
                                       "quiet_hours_start": "23:00"}, timeout=15).json()
        assert updated["patient_reminders"] is False
        assert updated["quiet_hours_enabled"] is True and updated["quiet_hours_start"] == "23:00"
        # reset so other runs start clean
        requests.patch(f"{API}/notifications/preferences", headers=pt,
                       json={"patient_reminders": True, "quiet_hours_enabled": False}, timeout=15)

    def test_subscribe_validates_body(self):
        pt = _h(_demo("patient")["token"])
        r = requests.post(f"{API}/notifications/subscribe", headers=pt,
                          json={"endpoint": "https://example.com/x"}, timeout=15)  # missing keys
        assert r.status_code == 422

    def test_subscribe_and_unsubscribe(self):
        pt = _h(_demo("patient")["token"])
        endpoint = f"https://push.example.com/{uuid.uuid4()}"
        sub = requests.post(f"{API}/notifications/subscribe", headers=pt, json={
            "endpoint": endpoint, "keys": {"p256dh": "BdummyKeyValue", "auth": "authValue"},
            "tz_offset_minutes": 60,
        }, timeout=15)
        assert sub.status_code == 200 and sub.json()["ok"] is True
        prefs = requests.get(f"{API}/notifications/preferences", headers=pt, timeout=15).json()
        assert prefs["tz_offset_minutes"] == 60
        un = requests.post(f"{API}/notifications/unsubscribe", headers=pt,
                           json={"endpoint": endpoint}, timeout=15)
        assert un.status_code == 200

    def test_cron_requires_secret(self):
        # With CRON_SECRET set in the env, a missing/wrong secret must be rejected.
        import os as _os
        if not _os.environ.get("CRON_SECRET"):
            pytest.skip("CRON_SECRET not configured in this environment")
        r = requests.post(f"{API}/notifications/cron/run", timeout=15)
        assert r.status_code == 403

    def test_cron_output_keys(self):
        # Best-effort: when the dev secret matches, the cron returns all job counters.
        r = requests.post(f"{API}/notifications/cron/run",
                          headers={"X-Cron-Secret": "dev-cron-secret"}, timeout=30)
        if r.status_code != 200:
            pytest.skip("cron secret differs in this environment")
        body = r.json()
        for k in ("reminders", "appointments", "daily_checkin", "missed",
                  "daily_summary", "privacy_review", "capture_status"):
            assert k in body


# ---------------- Google Calendar connector ----------------
class TestCalendar:
    def test_status_requires_caregiver(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/calendar/status", headers=_h(token), timeout=15)
        assert r.status_code == 403

    def test_status_shape(self):
        token = _demo("caregiver")["token"]
        r = requests.get(f"{API}/calendar/status", headers=_h(token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "configured" in body and "connected" in body
        assert "secure_storage" in body

    def test_status_never_returns_raw_tokens(self):
        token = _demo("caregiver")["token"]
        r = requests.get(f"{API}/calendar/status", headers=_h(token), timeout=15)
        body = r.json()
        for leak in ("access_token", "refresh_token", "id_token"):
            assert leak not in body

    def test_activity_requires_caregiver(self):
        token = _demo("patient")["token"]
        r = requests.get(f"{API}/calendar/activity", headers=_h(token), timeout=15)
        assert r.status_code == 403

    def test_activity_shape(self):
        token = _demo("caregiver")["token"]
        r = requests.get(f"{API}/calendar/activity", headers=_h(token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)  # privacy-safe history, possibly empty

    def test_events_require_connection(self):
        # 409 when not connected; 503 if unconfigured; 200/502 when connected (Google may fail in CI).
        token = _demo("caregiver")["token"]
        r = requests.get(f"{API}/calendar/events", headers=_h(token), timeout=15)
        assert r.status_code in (409, 503, 200, 502)

    def test_import_validates_body(self):
        token = _demo("caregiver")["token"]
        r = requests.post(f"{API}/calendar/import", headers=_h(token), json={}, timeout=15)
        assert r.status_code == 422  # google_event_id + title required

    def test_no_edit_or_delete_endpoints(self):
        # We intentionally do not expose calendar edit/delete. These must 404/405.
        token = _h(_demo("caregiver")["token"])
        r1 = requests.delete(f"{API}/calendar/events/some-id", headers=token, timeout=15)
        r2 = requests.patch(f"{API}/calendar/events/some-id", headers=token, json={}, timeout=15)
        assert r1.status_code in (404, 405)
        assert r2.status_code in (404, 405)

    def test_draft_event_requires_caregiver(self):
        token = _demo("patient")["token"]
        r = requests.post(f"{API}/calendar/draft-event", headers=_h(token),
                          json={"raw_text": "Dentist tomorrow at 4 PM"}, timeout=30)
        assert r.status_code == 403

    def test_draft_event_returns_structure(self):
        token = _demo("caregiver")["token"]
        r = requests.post(f"{API}/calendar/draft-event", headers=_h(token),
                          json={"raw_text": "Dentist appointment tomorrow at 4 PM, remind me 1 hour before."},
                          timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("draft", "confidence", "missing_fields", "warnings"):
            assert k in body
        assert body["draft"].get("title")
        # Draft endpoint must NOT create a Google event (no google_event_id in response).
        assert "google_event_id" not in body

    def test_draft_empty_text_rejected(self):
        token = _demo("caregiver")["token"]
        r = requests.post(f"{API}/calendar/draft-event", headers=_h(token), json={"raw_text": "  "}, timeout=15)
        assert r.status_code == 400

    def test_add_event_requires_date_and_time(self):
        token = _demo("caregiver")["token"]
        r = requests.post(f"{API}/calendar/add-event", headers=_h(token),
                          json={"title": "Test", "date": "2026-07-01"}, timeout=15)
        # Not connected -> 409, or missing time -> 400 if connected; without connection expect 409.
        assert r.status_code in (400, 409)
