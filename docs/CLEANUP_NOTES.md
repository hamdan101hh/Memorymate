# MVP Cleanup Notes

## Files added

- `frontend/src/components/mvp/index.js` — shared PageHeader, SummaryCard, StatusBadge, CollapsibleSection, etc.
- `backend/duplicate_helpers.py` — centralized duplicate match serialization for routes.
- `docs/APP_STORE_READINESS_PLAN.md`, `docs/CLEANUP_NOTES.md`.

## Files cleaned / simplified

- `frontend/src/pages/caregiver/CaregiverLayout.js` — primary nav simplified; secondary items under “More”.
- `frontend/src/pages/caregiver/CaregiverDashboard.js` — focused overview with summary cards and quick actions.
- `frontend/src/pages/caregiver/CgReminders.js` — grouped reminders with urgency styling.
- `frontend/src/pages/caregiver/CgMemoryBook.js` — search and category filter.
- `frontend/src/pages/patient/PatientHome.js` — patient labels, today-at-a-glance, calmer safety text.
- `frontend/src/components/DashboardShell.js` — nav section labels.
- `backend/routes.py` — duplicate lookup delegates to `duplicate_helpers`.

## Intentionally kept

- All legal/safety pages (privacy, terms, medical disclaimer, data deletion).
- WhatsApp setup page (not API integration) under “More” nav.
- Capture sessions, medication, timeline, alerts — still routed but not in primary nav.
- Transfer docs (`TRANSFER_TO_NEW_PC.md`, etc.).
- Existing appointment/calendar dashboard modules (`appointment_dashboard.py`, `calendar_dashboard.py`).

## Risky clutter not removed yet

- Large `routes.py` — could split by domain later.
- Duplicate dedup logic still partially in `appointment_dashboard` and `calendar_dashboard` (shared matching via `duplicate_helpers` for routes only).
- Patient capture section on home — detailed; may simplify further for store build.
- Test/smoke appointment rows in DB — use archive-duplicates UI, not auto-delete.

## Recommended future cleanup

- Import `duplicate_helpers` from calendar import paths if routes grow.
- Consolidate `MvpDisclaimer` with `MVP_DISCLAIMER` string in one module.
- Optional “More” settings hub instead of long sidebar list.
- Audit unused frontend pages with bundle analyzer before native shell.
