# WHOOP Connector — Legal & Technical Plan (Planning Only)

**Status:** Planned. Live integration is **disabled** (`WHOOP_CONNECTOR_ENABLED=false` by default).

## What we will NOT do

- Scrape WHOOP websites or apps
- Ask users for WHOOP passwords
- Diagnose health conditions or provide medical advice
- Store WHOOP credentials in plaintext
- Launch without reviewing WHOOP developer terms

## What we would do (future, if terms allow)

1. Use **official WHOOP API / OAuth** only when available and approved
2. Request **minimal scopes** (e.g. recovery, sleep, activity summaries — only what WHOOP permits)
3. **User consent** screen explaining what data is read and why
4. **Disconnect** option that revokes tokens and deletes cached summaries
5. **Encrypt tokens** server-side (same pattern as Google Calendar)
6. Show **simple wellness summaries** — not clinical interpretation
7. Update **Privacy Policy** before launch
8. Support **data export/deletion** for WHOOP-linked data

## Feature flag

- Backend: `WHOOP_CONNECTOR_ENABLED=false` (no live OAuth routes when false)
- Frontend: Connect button disabled — “Coming soon”

## UI today

Settings shows a planning card with “Learn what this could do” and disabled connect.

## No paid services

WHOOP API usage must be evaluated against WHOOP pricing/terms; MemoryMate does not add separate paid infrastructure for this planning phase.
