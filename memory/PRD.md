# MemoryMate — Product Requirements & Build Log

## Original Problem Statement
Build MemoryMate: a full-stack, mobile-first, AI-powered dementia & memory-support app for people with early memory loss and their family caregivers. It is supportive, NOT diagnostic. Patients record voice/typed memories that AI turns into simple summaries + extracted reminders/people/places/medication/appointments. Caregivers get a dashboard to manage care. Admin oversees the system. Tagline: "Helping families remember, care, and stay connected."

## User Choices
- AI model: Claude Sonnet 4.6 (primary, via Emergent LLM key) + Whisper for speech-to-text
- Auth: JWT email + password (Google login deferred)
- Voice: real browser recording (MediaRecorder + Whisper) + manual transcript box
- Sample data + demo accounts: YES
- Language: English

## Architecture
- Backend: FastAPI (`/app/backend`): `server.py`, `auth.py` (JWT/bcrypt), `routes.py` (all CRUD + AI endpoints), `ai.py` (Claude + Whisper), `db.py`, `seed.py`. MongoDB via Motor. UUID string ids, `_id` excluded everywhere.
- Frontend: React + CRA/craco, Tailwind, shadcn/ui. AuthContext (Bearer token in localStorage), role-based routing (`App.js`), DashboardShell for caregiver/admin sidebars.
- AI grounded strictly on saved data with safety rules (no diagnosis, calm language, never "you forgot").

## User Personas
1. Patient (elderly / early memory loss) — ultra-simple large-button UI, reassurance.
2. Caregiver / family member — clean dashboard, manages reminders/meds/appointments/people/places/notes/alerts.
3. Admin — system stats, user management, data tables, logs.

## Core Requirements (static)
Three roles, JWT auth, role dashboards, memory recording + AI summary/extraction, reminder system with statuses, medication & appointment managers, important people/places, caregiver notes, alerts, AI caregiver summary, patient Q&A assistant, admin panel, safety disclaimers, sample data, responsive mobile-first, accessibility (large text / high contrast).

## Implemented (2026-06) — MVP COMPLETE
- Public: premium landing, About, Privacy, Safety pages.
- Auth: JWT register/login, role selection, caregiver→patient connection, consent, demo quick-login.
- Onboarding: 5-step flow (welcome, role, consent, safety, emergency contact).
- Patient: home tiles, Record Memory (voice+manual, real AI extraction), Assistant chat, Today's Summary timeline, Reminders (done/snooze/add), Important People (AI "Who is this?"), Places, Emergency, Settings (large-text/high-contrast).
- Caregiver: dashboard, patient overview, daily timeline, reminders, medication, appointments, people, places, alerts, notes, settings, AI caregiver summary.
- Admin: stats dashboard, user management (role/deactivate), database collections viewer, activity logs.
- Seeded demo data (Omar/Sarah/Admin) + idempotent seeding on startup.
- Tested: 100% backend (36/36 endpoints) + 100% frontend critical flows.

## Backlog (prioritized)
- P1: Real voice recording fully wired (done for MVP) → add waveform UI; reminder due-time → auto "missed" cron job; alert auto-generation for missed meds.
- P1: Google social login (Emergent-managed) as alternate sign-in.
- P2: SMS/WhatsApp/push notifications; multi-patient per caregiver; Arabic/English i18n.
- P2: Photo upload for people (object storage); medication photo scan; calendar sync.
- P3: Wearable/GPS geofencing, doctor portal, care-home dashboard, family group chat.

## Next Tasks
1. Add background job to flip overdue pending reminders to "missed" and auto-create caregiver alerts.
2. Add Google login option.
3. Add person photo uploads via object storage.
