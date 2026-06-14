# MemoryMate — Technical Readiness & Security Checklist

**Purpose:** Pre-launch review for founders and engineers. **No secrets in this document** — environment variable names only.

**Baseline reference:** `main` at merge of voice cost guardrails (`40ab9fe` area). Re-verify commit hash and test counts before production launch.

---

## 1. Current status summary

| Item | Status |
|------|--------|
| **Main branch** | Active development line; feature branches merged via PR |
| **Backend tests** | Expect **~316 passed**, **~4 skipped** (`cd backend && REACT_APP_BACKEND_URL=http://localhost:8000 python -m pytest tests/ -q`) |
| **Frontend build** | Expect success (`cd frontend && CI=false yarn build`) |
| **Working tree** | Should be clean before release tagging |

### Core features completed (on main)

- Patient capture: Record Memory, AI draft/review, browser speech first
- Smart Capture Reminders (24h check-in only — no auto-recording)
- Smart Day Capture drafts (optional, cost-capped)
- Meeting / conversation capture sessions
- Photo Memory Attachments (manual descriptions, auth-gated images)
- Timeline photo thumbnails (caregiver timeline + patient today summary)
- Voice / transcription cost guardrails
- Google Calendar connector (OAuth, import/add after approval)
- Web Push notifications (optional VAPID)
- Cost report docs for founders
- Privacy review, private vault, consent flows
- Medical / financial safety disclaimers in AI paths

### Known safe defaults

- `CLOUD_TRANSCRIPTION_ENABLED=false`
- `VOICE_COST_GUARDRAILS_ENABLED=true`
- `TEXT_AI_PROVIDER=rule_based` when no AI keys (graceful degradation)
- `PREMIUM_FALLBACK_ENABLED=false`, `ALLOW_PREMIUM_RETRY=false`
- `ENABLE_DEMO=true` in dev — **must be `false` for real production**
- Google Calendar: read/import/add only; no silent edits/deletes
- Maps: deep links only (no Maps Platform API in repo)
- Images: local dev storage; auth-gated `/api/attachments/{id}`

### Paid services not started

- WhatsApp Business API (code exists; env vars unset = disabled)
- WHOOP live integration (planning docs only)
- Google Vision / Photos / Maps Platform / Cloud Storage
- AssemblyAI, Deepgram, Rev, Google Speech-to-Text
- Vertex AI / Gemini Cloud / Agent Platform

---

## 2. Architecture checklist

| Layer | Implementation | Doc / module | Pre-launch check |
|-------|----------------|--------------|------------------|
| **Frontend** | React (CRA), patient + caregiver + admin + public routes | `frontend/src/` | Build passes; demo mode off in prod URL |
| **Backend API** | FastAPI, `server.py` routers | `backend/routes.py`, `capture.py`, etc. | Health check `/api/`; CORS locked to frontend origin |
| **Database** | MongoDB via Motor | `backend/db.py` | Atlas M0 or managed cluster; backups planned |
| **Auth** | JWT bearer, role-based | `backend/auth.py` | Strong `JWT_SECRET`; demo login disabled in prod |
| **File / image storage** | Local `uploads/patient_images/` + Mongo metadata | `image_storage.py`, `image_routes.py` | Production object storage TODO |
| **Notifications** | Web Push (VAPID), in-app | `notifications.py` | VAPID keys set or push gracefully disabled |
| **Calendar connector** | Google OAuth + Calendar API | `gcal.py` | OAuth client scoped to Calendar; tokens encrypted |
| **AI pipeline** | Cost-safe text + optional cloud STT | `ai_pipeline.py`, `ai.py` | Daily AI cap; no premium retry by default |
| **Voice guardrails** | Daily caps, recording limits | `voice_guardrails.py` | Cloud STT off; caps documented in env |

---

## 3. Security checklist

| Control | Status | Notes |
|---------|--------|-------|
| Secrets not committed | **Required** | `.env` gitignored; only `.env.example` with placeholders |
| `.env` ignored | **Yes** | See `.gitignore` |
| JWT / session safety | **Review** | Rotate `JWT_SECRET` per environment; short-lived tokens |
| Auth-gated images | **Yes** | `GET /api/attachments/{id}` requires auth + patient scope |
| Role-based access | **Yes** | Patient / caregiver / admin / family roles in `auth.py` |
| Caregiver / patient boundaries | **Yes** | `patient_id_for()` + link table |
| Google token encryption | **Yes** | `TOKEN_ENCRYPTION_KEY` required in production |
| Upload validation | **Yes** | MIME, size, count limits on attachments |
| Rate limiting | **Partial** | Daily AI/voice caps; no global HTTP rate limit yet |
| Input validation | **Yes** | Pydantic models on API bodies |
| Logging without secrets | **Review** | Avoid logging tokens, audio, image bytes |
| Error messages | **Review** | User-friendly messages; avoid stack traces to client |

---

## 4. Privacy checklist

| Item | Status |
|------|--------|
| Consent-based capture | Capture consent modal + consent logs |
| No hidden recording | Smart Capture Reminders = notifications only |
| No always-on cloud transcription | Cloud STT disabled by default |
| Photos permission notice | Checkbox before upload/save |
| Data deletion page | `frontend/src/pages/public/DataDeletion.js` |
| Medical disclaimer | Public page + AI safety lines for clinic notes |
| Export / delete future TODO | Attachments + full account export |
| Private attachments | Auth-gated URLs; no public paths |
| Draft expiry | Photo drafts 24h; smart day drafts configurable |

---

## 5. Cost checklist

| Rule | Status |
|------|--------|
| Google Calendar API only (GCP) | Enable only Calendar + OAuth — not other GCP products |
| No Vertex AI / Gemini Cloud / Agent Platform | Not in codebase |
| No Google Cloud Storage | Local uploads only |
| No Google Vision | Not in codebase |
| No Google Maps Platform | Deep links only |
| No WhatsApp Business API in production | Leave env vars unset until approved |
| Browser speech first | Record Memory + capture use Web Speech when available |
| Cloud transcription disabled by default | `CLOUD_TRANSCRIPTION_ENABLED=false` |
| Daily voice caps | `voice_guardrails.py` + plan tiers |
| AI daily caps | `DAILY_AI_COST_CAP_USD`, `MAX_AI_ACTIONS_PER_DAY` |
| Budget alert reminder | Set **$1** warning on Google Cloud billing (founder doc) |

See also: `docs/MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md`, `docs/VOICE_TRANSCRIPTION_COST_GUARDRAILS.md`.

---

## 6. Testing checklist

| Area | Command / location | Expectation |
|------|-------------------|-------------|
| Backend suite | `pytest` from `backend/` | ~316 passed, few skipped |
| Frontend build | `CI=false yarn build` | Success |
| Manual smoke | Record memory, calendar, reminders | See `docs/BROWSER_SMOKE_TEST_CHECKLIST.md` |
| Auth tests | `backend/tests/` auth flows | Login, demo off in prod |
| Upload tests | `test_image_attachments.py`, `test_photo_memory_attachments.py` | Type/size/count limits |
| Calendar tests | `test_calendar_*.py` | OAuth mock / connector |
| Voice guardrail tests | `test_voice_cost_guardrails.py` | Cloud off, caps, reminders |
| Timeline photo tests | `test_timeline_photo_thumbnails.py` | Thumbnail metadata |
| Mobile UI | Patient home, record, today | Responsive layout manual check |

---

## 7. Launch readiness score

| Area | Score | Rationale |
|------|-------|-----------|
| Core capture (text + browser speech) | **Green** | Shipped with guardrails |
| Photo attachments | **Yellow** | Dev storage; production migration TODO |
| Voice / transcription | **Green** | Guardrails on main; cloud off by default |
| AI features | **Yellow** | Optional keys; caps in place; review prod keys |
| Google Calendar | **Yellow** | Works; production hardening doc exists |
| Notifications (push) | **Yellow** | Optional VAPID; verify prod keys |
| WhatsApp | **Red** | Do not launch messaging until approved |
| WHOOP | **Red** | Planning only |
| Security (auth, images) | **Green** | Auth-gated assets; encryption for calendar tokens |
| Rate limiting (HTTP) | **Yellow** | Usage caps only; consider edge rate limits |
| Monitoring / logging | **Yellow** | No full APM checklist yet |
| Backups / DR | **Yellow** | Mongo backup plan needed |
| Legal / App Store | **Yellow** | Public pages exist; mobile app review if applicable |
| Demo mode disabled | **Red** if `ENABLE_DEMO=true` in prod | Must be false for real users |
| Cost controls documented | **Green** | Founder cost report + guardrails docs |

**Legend:** Green = ready for controlled launch · Yellow = needs review before scale · Red = do not launch without fix

---

## 8. Known gaps / future TODO

- Production image storage (private bucket + signed URLs)
- Export / delete saved attachments and full account data policy
- Full manual browser smoke on staging (all roles, mobile widths)
- Real deployment environment audit — see `docs/DEPLOYMENT_READINESS_AUDIT.md`
- Monitoring / alerting (errors, AI spend, voice usage anomalies)
- MongoDB backup and restore runbook
- HTTP rate limiting at API edge
- App Store / legal review if native mobile wrapper ships
- WhatsApp Business API production onboarding (not started)
- WHOOP connector implementation (not started)

---

## Related docs

- `docs/DEPLOYMENT_READINESS_AUDIT.md` — pre-launch env, CORS, demo mode, Render/Vercel
- `docs/MEMORYMATE_BUILD_STACK_CHECKLIST.md` — stack layers and env index
- `docs/MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md`
- `docs/VOICE_TRANSCRIPTION_COST_GUARDRAILS.md`
- `docs/PHOTO_MEMORY_ATTACHMENTS_PLAN.md`
- `docs/CALENDAR_PRODUCTION_TODO.md`
- `docs/APP_STORE_READINESS_PLAN.md`
