# Google Calendar Connector — Production Notes & Checklist

Branch history: `cursor/google-calendar-connector` (feature) →
`cursor/calendar-production-hardening` (this hardening pass).

The connector is privacy-first and approval-gated. This file tracks what's been
hardened and what still needs operator setup before real users connect.

## Calendar dashboard clutter — root cause (June 2026)

When `/caregiver/calendar` looked overloaded with repeated cards, investigation showed:

- **Google Calendar suggestions were not the main issue.** The suggestions API
  already excluded imported `google_event_id`s; typical dev accounts had only a
  handful of unimported Google events (often one).
- **The clutter came from many duplicate MemoryMate-only appointments** — rows in
  `appointments` **without** `google_event_id`. The page listed every such row as a
  full-width “Add to Google Calendar” card with no deduplication or hide/archive.
- **Repeated smoke tests created duplicate rows** — manual `add-event`, AI draft
  flows, and capture pipelines each inserted new appointment documents (e.g. many
  copies of “Doctor Appointment Tomorrow” / “Follow-up Call with Fadi”) instead of
  reusing one record.

The dashboard cleanup pass (`cursor/calendar-dashboard-dedup-cleanup`) groups by
date, fingerprints events, surfaces “Possible duplicates”, and lets caregivers
hide/handled suggestions or archive MemoryMate-only items from this list — without
deleting Google Calendar events.

## Done in the hardening pass

- [x] **Encrypt Google OAuth tokens at rest.**
      `access_token` / `refresh_token` / `id_token` are encrypted with Fernet
      (`backend/crypto.py`) before being stored in `calendar_links`, and decrypted
      only when calling Google. Raw tokens are never returned to the frontend
      (`/status` exposes only the connected email + a `secure_storage` boolean).
      Key comes from `TOKEN_ENCRYPTION_KEY`. **Fails safe in production**: if the
      key is missing, `/connect` and `/callback` refuse to store tokens (503 /
      error redirect). In local dev a key is derived from `JWT_SECRET` with a
      one-time warning.

- [x] **Per-user timezone support.**
      Timezone is stored on the patient profile (`PATCH /api/patient {timezone}`)
      and editable in **Notifications settings → Timezone**. Resolution order when
      creating timed Google events: acting user → patient profile → `CAL_TIMEZONE`
      → `UTC`, validated against the IANA database (`zoneinfo`/`tzdata`). Invalid
      values fall back safely, so existing appointments never break.

- [x] **Audit/history visibility.**
      `GET /api/calendar/activity` returns a privacy-safe history (no tokens, no
      private event bodies — only action + title/email + time), shown as
      "Recent Calendar Activity" on the connector page. Tracks: connected,
      disconnected, imported, added, reconnect-needed.

- [x] **Calendar dashboard dedup & cleanup** (branch `cursor/calendar-dashboard-dedup-cleanup`).
      Overview summary, grouped/collapsible suggestions, duplicate detection
      (fingerprint + title/date/time), hide/handled/archive for MemoryMate-only
      items, duplicate warning before add-to-Google. Endpoints:
      `GET /overview`, enhanced `GET /suggestions`, `POST /suggestions/hide`,
      `POST /check-duplicate`, `POST /appointments/archive`, `PATCH /appointments/{id}`.
      Archive/hide does **not** delete Google events; no Google edit/delete APIs added.

## Operator setup required before real users (production checklist)

1. **Google Cloud OAuth Web client** — create under *APIs & Services → Credentials*.
2. **Authorized redirect URI** — add exactly: `https://<api-host>/api/calendar/callback`
   (must equal `GOOGLE_REDIRECT_URI`).
3. **OAuth consent screen** — configure app name, support email, scopes, and
   authorized domains.
4. **Scopes** — `openid`, `email`,
   `https://www.googleapis.com/auth/calendar.events`.
5. **Test users** — while the consent screen is in "Testing", add each tester's
   Google account; or publish + verify for general availability.
6. **Environment variables:**

```
ENVIRONMENT=production
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<api-host>/api/calendar/callback
FRONTEND_URL=https://<frontend-host>
TOKEN_ENCRYPTION_KEY=...        # REQUIRED; python3 -c "import secrets; print(secrets.token_urlsafe(48))"
CAL_TIMEZONE=UTC                # fallback only; per-patient timezone takes priority
```

7. **Real OAuth end-to-end test** — connect → callback → read events → import
   suggestion → add appointment (with confirm) → disconnect, plus token-refresh
   and revoked-grant (reconnect) paths.

## Approval-gated invariant (do not regress)

- **Read with permission** — no calendar reads until the user connects (OAuth).
- **Import only after approval** — events become appointments only on explicit import.
- **Add only after approval** — events reach Google only after the confirm dialog.
- **Never edit/delete without explicit approval** — no edit/delete endpoints exist;
  do not add them without an explicit, confirmed approval step.

## Remaining limitations

- `TOKEN_ENCRYPTION_KEY` is a single symmetric key; there is no automated key
  rotation yet (rotating it invalidates stored tokens → users reconnect).
- Timezone is stored per patient (the calendar owner). No separate per-caregiver
  timezone for display.
- Connected / suggestions / add-with-confirmation still require a live Google
  OAuth flow to exercise fully (valid credentials).
