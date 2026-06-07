# Google Calendar Connector — Production Hardening TODO

Branch: `cursor/google-calendar-connector` · Status: pushed, **not merged** (review on GitHub).
Main remains unchanged at `d00d70e`.

The connector is functional and degrades gracefully when unconfigured. Before
real users connect their calendars, complete the items below.

## Must-do before real users

- [ ] **1. Encrypt Google OAuth tokens at rest.**
      `access_token` / `refresh_token` are currently stored in plaintext in the
      `calendar_links` collection (see note in `backend/gcal.py`). Encrypt with a
      KMS-managed key or Fernet (env-provided key) before storing, and decrypt on use.

- [ ] **2. Per-user timezone support.**
      Replace the global `CAL_TIMEZONE` env (default `UTC`) used when creating timed
      events. Store an IANA timezone per user/patient and use it for both event
      creation and display so times are correct across regions.

- [ ] **3. Complete real Google OAuth testing.**
      Exercise the full flow with valid credentials: connect → callback → read
      events → import suggestion → add appointment (with confirm) → disconnect, plus
      token-refresh and revoked-grant (reconnect) paths. The connected / suggestions /
      add-with-confirmation UI states are code-verified only so far.

- [ ] **4. Confirm OAuth consent screen & scopes are production-ready.**
      Scopes requested: `openid email https://www.googleapis.com/auth/calendar.events`.
      Configure the consent screen, move out of "Testing" (add test users or publish +
      verify), and confirm the authorized redirect URI matches `GOOGLE_REDIRECT_URI`.

## Invariant to keep (do not regress)

- [ ] **5. Connector stays approval-gated.** Verify after any change:
  - **Read with permission** — no calendar reads until the user connects (OAuth).
  - **Import only after approval** — events become MemoryMate appointments only when
    the user explicitly imports them (no auto-import).
  - **Add only after approval** — events are pushed to Google only after the
    confirmation dialog.
  - **Never edit/delete without explicit approval** — no edit/delete endpoints exist;
    do not add them without an explicit, confirmed approval step.

## Production setup checklist (env)

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<api-host>/api/calendar/callback
FRONTEND_URL=https://<frontend-host>
CAL_TIMEZONE=UTC   # superseded once per-user timezone (#2) lands
```
