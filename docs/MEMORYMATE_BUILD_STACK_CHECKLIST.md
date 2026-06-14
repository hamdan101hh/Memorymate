# MemoryMate — Build Stack Checklist

**Purpose:** Single reference for what MemoryMate is built with, what is free vs paid, and what must not be enabled without approval. **Environment variable names only — no values.**

---

## Frontend

| Item | Detail |
|------|--------|
| **Framework** | React (Create React App) |
| **Routing** | React Router — patient, caregiver, admin, capture, public |
| **UI** | Tailwind-style utilities, shadcn/ui components |
| **API client** | Axios (`frontend/src/lib/api.js`) |
| **Key pages** | Record Memory, Today Summary, Timeline, Appointments, Reminders, Capture sessions, Calendar connector, Notification settings |
| **Key components** | `PhotoAttachmentPicker`, `MemoryVisualTile`, `AuthenticatedImage`, `SmartMemoryCaptureCard` |
| **Speech** | Browser Web Speech API (`captureLanguage.js`, `useSpeechToText.js`) — free, on-device |
| **Maps** | Deep links only (`mapLinks.js`) — no Maps JavaScript API |
| **Hosting assumption** | Vercel or similar static host (`DEPLOY.md`) |

---

## Backend

| Item | Detail |
|------|--------|
| **Runtime** | Python 3.12, FastAPI, Uvicorn |
| **Entry** | `backend/server.py` |
| **Modules** | `routes.py` (core API), `capture.py`, `auth.py`, `gcal.py`, `notifications.py`, `image_routes.py`, `whatsapp.py`, `support.py` |
| **AI** | `ai.py`, `ai_pipeline.py`, `usage.py` |
| **Voice** | `voice_guardrails.py` |
| **Images** | `image_storage.py`, `image_routes.py` |
| **Smart reminders** | `smart_capture_reminders.py` |
| **Deployment** | Render blueprint (`render.yaml`) — free tier API |

---

## Database (MongoDB)

Collections in active use (non-exhaustive):

| Collection | Purpose |
|------------|---------|
| `users` | Accounts, roles |
| `patients` | Patient profiles, timezone, optional `voice_plan` |
| `patient_caregiver_links` | Caregiver ↔ patient access |
| `memories` | Recorded memories |
| `reminders` | Reminders |
| `appointments` | Appointments |
| `medications` | Medication notes |
| `memory_book` | Family-curated album entries |
| `caregiver_notes` | Notes visible to patient |
| `capture_sessions` | Meeting/conversation sessions |
| `memory_events` | Capture session events |
| `privacy_review_items` | Privacy queue |
| `audio_settings` | Capture settings, smart reminders state |
| `consent_logs` | Consent audit |
| `smart_day_drafts` | Smart day draft snippets |
| `memory_image_attachments` | Photo attachment metadata |
| `ai_usage` | Daily AI + voice usage counters |
| `calendar_links` | Google Calendar OAuth linkage |
| `calendar_activity` | Calendar import/add audit |
| `push_subscriptions` | Web Push endpoints |
| `notification_prefs` | Per-user notification settings |
| `notification_log` | Deduped notification sends |
| `whatsapp_links` | WhatsApp phone linkage (optional) |
| `activity_logs` | Admin activity |
| `support_requests` | Support form |
| `family_invites` | Family circle invites |

Indexes: see `backend/db.py` `ensure_indexes()`.

---

## Auth / session / tokens

| Item | Detail |
|------|--------|
| **Auth** | JWT in `Authorization: Bearer` header |
| **Password** | bcrypt hashes in `users` |
| **Demo login** | `/api/auth/demo-login` when `ENABLE_DEMO=true` — **disable in production** |
| **Google Calendar tokens** | Encrypted at rest with `TOKEN_ENCRYPTION_KEY` (Fernet) |
| **Patient scope** | `patient_id_for(user)` on data routes |

---

## Google Calendar connector

| Item | Detail |
|------|--------|
| **Module** | `backend/gcal.py` |
| **Scope** | Read/import; add events after user approval |
| **Not done** | Silent edit/delete of user calendar |
| **Frontend** | `CalendarConnector.js` |
| **Production TODO** | `docs/CALENDAR_PRODUCTION_TODO.md` |

---

## Notifications

| Item | Detail |
|------|--------|
| **Web Push** | VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) |
| **Module** | `backend/notifications.py` |
| **Cron** | Optional `CRON_SECRET` for scheduled jobs |
| **WhatsApp** | Code in `whatsapp.py` — **not started for production** |

---

## Photo attachments

| Item | Detail |
|------|--------|
| **Storage (dev)** | `backend/uploads/patient_images/{patient_id}/` |
| **API** | `POST /api/attachments/draft`, `GET /api/attachments/{id}` |
| **Limits** | 3 images, 5MB, jpg/png/webp |
| **AI** | Manual descriptions only — no Vision API |
| **Doc** | `docs/PHOTO_MEMORY_ATTACHMENTS_PLAN.md` |

---

## Voice guardrails

| Item | Detail |
|------|--------|
| **Module** | `backend/voice_guardrails.py` |
| **Order** | Type → browser speech → cloud STT (disabled by default) |
| **API** | `POST /api/voice/usage`, caps in `GET /api/usage/today` |
| **Doc** | `docs/VOICE_TRANSCRIPTION_COST_GUARDRAILS.md` |

---

## AI pipeline

| Item | Detail |
|------|--------|
| **Text** | Rule-based fallback or configured provider (Emergent / Anthropic / OpenAI) |
| **Cloud STT** | Whisper via OpenAI only when `CLOUD_TRANSCRIPTION_ENABLED=true` |
| **Caps** | `DAILY_AI_COST_CAP_USD`, `MAX_AI_ACTIONS_PER_DAY` |
| **Doc** | `docs/AI_PROVIDER_PIPELINE_AND_COST_STRATEGY.md` |

---

## Docs / legal pages (frontend)

| Page | Path |
|------|------|
| Privacy | `/privacy` |
| Terms | `/terms` |
| Consent | `/consent` |
| Medical disclaimer | `/medical-disclaimer` |
| Safety | `/safety` |
| Data deletion | `/data-deletion` |
| How it works | `/how-it-works` |

---

## Deployment assumptions

| Component | Assumption |
|-----------|------------|
| API | Render free/low tier (`render.yaml`) |
| Frontend | Vercel hobby or static host |
| Database | MongoDB Atlas M0 or self-hosted |
| Secrets | Set in host dashboard, never in git |
| `ENABLE_DEMO` | `false` before real users |
| `ENVIRONMENT` | `production` triggers stricter crypto checks |

---

## Environment variables (names only)

### Core

- `MONGO_URL`, `DB_NAME`
- `JWT_SECRET`, `CORS_ORIGINS`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `ENABLE_DEMO`, `ENVIRONMENT`

### AI text (optional — pick one key)

- `EMERGENT_LLM_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MODEL_NAME`
- `CAPTURE_MODEL_PROVIDER`, `CAPTURE_MODEL_NAME`
- `DAILY_AI_COST_CAP_USD`, `MAX_AI_ACTIONS_PER_DAY`
- `TEXT_AI_PROVIDER`, `CHEAP_TEXT_AI_PROVIDER`, `PREMIUM_TEXT_AI_PROVIDER`
- `PREMIUM_FALLBACK_ENABLED`, `ALLOW_PREMIUM_RETRY`, `MAX_AI_PROVIDERS_PER_REQUEST`

### Voice / transcription

- `CLOUD_TRANSCRIPTION_ENABLED`
- `VOICE_COST_GUARDRAILS_ENABLED`
- `REQUIRE_CONFIRMATION_FOR_CLOUD_TRANSCRIPTION`
- `FREE_VOICE_MINUTES_PER_DAY`, `PLUS_VOICE_MINUTES_PER_DAY`, `FAMILY_VOICE_MINUTES_PER_DAY`, `DEFAULT_VOICE_MINUTES_PER_DAY`
- `MAX_SINGLE_RECORDING_MINUTES`, `MAX_MEETING_CAPTURE_MINUTES`
- `DAILY_VOICE_MINUTES_CAP`, `MAX_RECORDING_SECONDS`, `MAX_MEETING_MINUTES`
- `SMART_DAY_CLOUD_MINUTES_CAP`, `MAX_SMART_DAY_SNIPPET_SECONDS`, `MAX_SMART_DAY_SESSION_HOURS`

### Google Calendar

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `FRONTEND_URL`, `CAL_TIMEZONE`, `TOKEN_ENCRYPTION_KEY`

### Notifications

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `CRON_SECRET`

### WhatsApp (optional — not started)

- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`, `WHATSAPP_REMINDER_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`

### Images (optional overrides)

- `MAX_IMAGE_BYTES`, `MAX_IMAGES_PER_NOTE`

### Frontend (build-time)

- `REACT_APP_BACKEND_URL`
- `REACT_APP_WHOOP_CONNECTOR_ENABLED` (planning — not live)

---

## Free vs paid services

| Service | Typical tier | In MemoryMate today |
|---------|--------------|---------------------|
| MongoDB Atlas M0 | Free tier | **Used / planned** |
| Render API free | Free (sleeps) | **Planned** |
| Vercel hobby | Free | **Planned** |
| Browser speech | Free | **Used** |
| Google Calendar API | Free at low volume | **Optional** |
| Google Meet via Calendar | Free with event | **Optional** |
| Maps deep links | Free | **Used** |
| Web Push (self-hosted) | Free | **Optional** |
| OpenAI / Anthropic / Emergent | **Paid per token** | **Optional** — keys unset = rule-based |
| Whisper / cloud STT | **Paid** | **Disabled by default** |
| WhatsApp Cloud API | **Paid per conversation** | **Not started** |
| Google Maps Platform | **Paid** | **Not used** |
| Google Vision / Photos | **Paid** | **Not used** |
| S3 / GCS | **Paid** | **Not used** |
| AssemblyAI / Deepgram / Rev | **Paid** | **Not integrated** |

---

## Do not enable without approval

1. WhatsApp Business API production messaging
2. Cloud transcription (`CLOUD_TRANSCRIPTION_ENABLED=true`) without budget review
3. Premium AI fallback flags without cost model
4. Google Cloud products beyond Calendar API + OAuth
5. Google Maps Platform / Places API
6. Google Vision API or Google Photos API
7. Google Cloud Storage or S3 for uploads without privacy review
8. Vertex AI, Gemini Enterprise, Google Cloud Agent Platform
9. Third-party STT: AssemblyAI, Deepgram, Rev, Google Speech-to-Text
10. Always-on / 24/7 cloud transcription
11. `ENABLE_DEMO=true` on production deployments

---

## Dangerous services not currently needed

These are **not required** for MemoryMate’s current MVP and should stay disabled until explicitly approved with a cost and privacy review:

| Service | Why dangerous / unnecessary now |
|---------|--------------------------------|
| **Google Cloud Agent Platform** | Agent runtime billing; not in product scope |
| **Gemini Enterprise** | Enterprise AI contracts; use optional text keys only if needed |
| **Vertex AI** | Per-token/image cloud AI charges |
| **Google Speech-to-Text** | Per-minute cloud STT; browser speech + disabled Whisper path suffice |
| **Google Cloud Storage** | Storage + egress; local/private bucket plan preferred first |
| **Google Vision API** | Per-image OCR/analysis; manual photo descriptions only |
| **Google Maps Platform / Places API** | Per-request billing; deep links are free |
| **WhatsApp Business API** | Per-conversation fees; not started |
| **AssemblyAI** | Paid STT vendor — not integrated |
| **Deepgram** | Paid STT vendor — not integrated |
| **Rev** | Paid transcription — not integrated |
| **Always-on transcription** | Highest cost risk; explicitly blocked by guardrails |

---

## Cross-reference

- Deployment readiness audit: `docs/DEPLOYMENT_READINESS_AUDIT.md`
- Technical readiness scoring: `docs/TECHNICAL_READINESS_CHECKLIST.md`
- Founder cost report: `docs/MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md`
