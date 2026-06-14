# Deployment readiness audit

**Date:** 2026-06-15 · **Branch baseline:** `main` at `2b68a2b` · **Scope:** Pre-launch documentation and config review — **no secrets, no paid service enablement.**

This audit complements `docs/TECHNICAL_READINESS_CHECKLIST.md`, `DEPLOY.md`, and `render.yaml`. Re-run before every production cut.

---

## Executive summary

| Area | Launch posture | Action before real users |
|------|----------------|---------------------------|
| Env vars & secrets | **Yellow** | Set all required secrets in Render/Vercel; never commit `.env` |
| Demo mode | **Red if enabled** | `ENABLE_DEMO=false` on production API |
| CORS / URLs | **Yellow** | Set `CORS_ORIGINS` to exact Vercel URL(s); no `*` in prod |
| Google OAuth / Calendar | **Yellow** | OAuth client + redirect URIs; Calendar API only |
| Render / Vercel | **Green** (documented) | Follow checklist below |
| Image storage | **Red for scale** | Local disk on Render is not durable; **uploads blocked by default in prod** until private storage |
| Security gates | **Green** (code) | Verify env flags in prod dashboard |
| Monitoring / backups | **Red** | No APM, backup runbook, or error reporting yet |

**Safe to deploy a controlled beta** when: demo mode off, CORS locked, strong secrets, MongoDB Atlas, and founders accept local image storage limits until object storage ships.

**Do not treat as production-ready for scale** until: image persistence, backups, monitoring, and demo/demo-seed disabled.

---

## 1. Environment variables

### Sources reviewed

| File | Purpose |
|------|---------|
| `backend/.env.example` | Backend variable names + comments (no real secrets) |
| `frontend/.env.example` | Frontend build-time variables |
| `render.yaml` | Render Blueprint defaults |
| `DEPLOY.md` | Human deploy steps |

### Required for production API (Render)

| Variable | Required? | Notes |
|----------|-----------|--------|
| `MONGO_URL` | **Yes** | MongoDB Atlas connection string |
| `DB_NAME` | Yes | Default `memorymate` |
| `JWT_SECRET` | **Yes** | Long random; Render can auto-generate |
| `CORS_ORIGINS` | **Yes** | Exact frontend origin(s), comma-separated — **not `*`** |
| `ENABLE_DEMO` | **Yes** | Must be `false` for real users |
| `TOKEN_ENCRYPTION_KEY` | **Yes** if Calendar enabled | Fernet key for Google OAuth tokens |
| `FRONTEND_URL` | **Yes** if Calendar enabled | Post-OAuth redirect to SPA |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | If Calendar used | Calendar API + OAuth only |
| `CRON_SECRET` | If push/WhatsApp cron | Protects `/api/notifications/cron/run` |

### Required for production frontend (Vercel)

| Variable | Required? | Notes |
|----------|-----------|--------|
| `REACT_APP_BACKEND_URL` | **Yes** | Public API base, no trailing slash |

### Optional / feature-gated (leave unset until approved)

| Category | Variables | Default behavior when unset |
|----------|-----------|----------------------------|
| AI | `EMERGENT_LLM_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TEXT_AI_PROVIDER`, caps | Rule-based fallbacks; no crashes |
| Voice | `CLOUD_TRANSCRIPTION_ENABLED` | **`false`** — browser speech only |
| Images | `IMAGE_UPLOADS_ENABLED`, `IMAGE_STORAGE_MODE` | **Prod defaults block uploads** on ephemeral disk |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push disabled gracefully |
| WhatsApp | `WHATSAPP_*` | Module inactive; **do not enable pre-launch** |
| WHOOP | `REACT_APP_WHOOP_CONNECTOR_ENABLED` | UI hidden (`false`) |

### Safe defaults (code)

| Setting | Default | Risk if mis-set |
|---------|---------|-----------------|
| `CLOUD_TRANSCRIPTION_ENABLED` | `false` | Cloud STT charges + bypasses browser-first |
| `VOICE_COST_GUARDRAILS_ENABLED` | `true` | Caps weakened |
| `ENABLE_DEMO` | `true` in **local** `.env.example` | **Anyone can demo-login without password** |
| `CORS_ORIGINS` | `*` if unset in `server.py` | Over-permissive cross-origin |
| `TEXT_AI_PROVIDER` | `rule_based` | Safe without keys |
| `PREMIUM_FALLBACK_ENABLED` | `false` | Extra AI spend |
| `IMAGE_UPLOADS_ENABLED` | `true` in dev / **`false` in prod** | Uploads to ephemeral disk |
| `IMAGE_STORAGE_MODE` | `local_dev` in dev / **`disabled` in prod** | Local disk unsafe on Render |

### Dangerous defaults to avoid in production

- `ENABLE_DEMO=true` — exposes `/api/auth/demo-login` and seeds demo users
- `CORS_ORIGINS=*` with credentials — overly broad (document as dev-only)
- `CLOUD_TRANSCRIPTION_ENABLED=true` without review — cloud STT costs
- `ADMIN_PASSWORD=admin123` — change seeded admin password via env
- Missing `TOKEN_ENCRYPTION_KEY` with Calendar — connect flow fails safely (by design)

### Secrets hygiene

- `.env`, `.env.*` are gitignored (see `.gitignore`); only `*.env.example` committed
- **No real API keys, tokens, or Mongo URIs in the repo** (audit: pass)
- Logs should not print JWT, OAuth tokens, or `CRON_SECRET` (review when adding APM)

---

## 2. Production demo mode

| Item | Status |
|------|--------|
| Flag | `ENABLE_DEMO` (backend) |
| When `true` | Seeds Omar/Sarah/admin demo data; `/api/auth/demo-login` issues JWT without password |
| Local / dev | **OK** — default in `backend/.env.example` for showcasing |
| Production | **Must be `false`** before real users |
| Frontend | Login page shows demo buttons when API allows demo login |
| `crypto.py` | Treats `ENABLE_DEMO=false` or `ENVIRONMENT=production` as production for encryption requirements |

**Launch gate:** Render dashboard → `ENABLE_DEMO=false` → redeploy → verify demo buttons return 403.

`render.yaml` defaults `ENABLE_DEMO` to `false` for Blueprint deploys (override only for intentional demos).

---

## 3. CORS and URLs

| Component | Configuration |
|-----------|---------------|
| Backend CORS | `CORS_ORIGINS` comma-separated list in `server.py` |
| Frontend API | `REACT_APP_BACKEND_URL` in `frontend/src/lib/api.js` |
| Calendar return | `FRONTEND_URL` in `gcal.py` |
| Health | `GET /api/` → `{"status":"ok"}` |

### Local dev

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`

### Production pattern

1. Deploy API → copy URL (e.g. `https://memorymate-api.onrender.com`)
2. Set Vercel `REACT_APP_BACKEND_URL` to that URL
3. Set Render `CORS_ORIGINS` to Vercel URL (e.g. `https://memorymate.vercel.app`)
4. If using Calendar: `GOOGLE_REDIRECT_URI=https://<api>/api/calendar/callback`, `FRONTEND_URL=https://<vercel>`

**No hardcoded localhost in production paths** — all driven by env vars.

**Wildcard CORS (`*`)** — acceptable for initial wiring only; **document as unsafe for production** with `allow_credentials=True`.

---

## 4. Google OAuth / Calendar deployment

### Enable in Google Cloud Console (only)

- **Google Calendar API** (read events, add after approval)
- **OAuth 2.0 Client** (Web application)

### Do NOT enable (without explicit approval)

- Vertex AI / Gemini Enterprise / Agent Platform
- Cloud Storage (image hosting)
- Vision API
- Maps Platform
- Speech-to-Text (app uses browser speech + optional OpenAI STT via env, not GCP STT)

### OAuth setup checklist

| Step | Detail |
|------|--------|
| Consent screen | App name, support email, scopes documented |
| Authorized JavaScript origins | `https://<your-vercel-domain>` (if needed for popup flows) |
| Authorized redirect URIs | `https://<your-api>/api/calendar/callback` |
| Backend env | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `TOKEN_ENCRYPTION_KEY` |
| Behavior | Read + import suggestions; add after user approval; **no silent edit/delete** |

See also: `docs/CALENDAR_PRODUCTION_TODO.md`.

---

## 5. Render / Vercel deployment checklist

### MongoDB Atlas

| Step | Command / setting |
|------|-------------------|
| Tier | M0 free for beta |
| Network | Allow `0.0.0.0/0` for Render (or IP allowlist if paid) |
| Env | `MONGO_URL`, `DB_NAME` |

### Render (backend)

| Item | Value |
|------|--------|
| Blueprint | `render.yaml` → service `memorymate-api` |
| Root | `backend` |
| Build | `pip install -r requirements.txt --extra-index-url …` |
| Start | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| Health check | `/api/` |
| Plan | Free tier sleeps after idle (~30s cold start) |
| Branch deploy | `autoDeploy: true` — pin production to `main`; review PR previews |

**Post-deploy env (minimum):** `MONGO_URL`, `CORS_ORIGINS`, `ENABLE_DEMO=false`, `JWT_SECRET` (generated), optional AI/VAPID/Calendar keys.

### Vercel (frontend)

| Item | Value |
|------|--------|
| Root directory | `frontend` |
| Build | `yarn build` (CRA default) |
| Env | `REACT_APP_BACKEND_URL` |
| Output | `build/` static |

### Cron / scheduled jobs

- Render Cron is paid; use external scheduler (e.g. cron-job.org) for:
  - `POST /api/notifications/cron/run` with header `X-Cron-Secret: <CRON_SECRET>`
- WhatsApp cron **not started** — do not configure until approved

### Logs

- Render service logs: request errors, startup seed/index messages
- **Do not log** request bodies with passwords, tokens, or encryption keys

---

## 6. File / image storage deployment risk

| Topic | Current state | Production requirement |
|-------|---------------|------------------------|
| Storage | Local `backend/uploads/patient_images/` | **Not durable on Render** (ephemeral disk) |
| Upload guard | `image_upload_guard.py` — **blocks prod uploads by default** | Keep until private object storage |
| Access | Auth-gated `GET /api/attachments/{id}` | Keep — no public URLs |
| Validation | MIME, size, count limits in `image_storage.py` | Already enforced |
| Draft TTL | 24 hours for unattached drafts | Documented |
| GCS / S3 | **Not implemented** | Required before scale; **do not enable GCS without approval** |

**Production defaults:** `IMAGE_STORAGE_MODE=disabled`, `IMAGE_UPLOADS_ENABLED=false`. Users see a calm message and can still save notes without photos. Ephemeral local disk is only allowed when `ALLOW_LOCAL_IMAGE_STORAGE_IN_PRODUCTION=true` (testing only).

**Launch blocker for photo-heavy production:** migrate to private object storage + signed/proxied URLs before marketing photo features broadly.

TODOs: backup/export/delete attachments; disaster recovery for user media.

---

## 7. Security launch gates

| Gate | Status | Evidence |
|------|--------|----------|
| `.env` gitignored | Pass | `.gitignore` |
| No secrets in repo | Pass | Examples only |
| `JWT_SECRET` required | Pass | `auth.py` |
| `TOKEN_ENCRYPTION_KEY` in prod | Pass | `crypto.py` + Calendar |
| Google tokens encrypted | Pass | Fernet in `crypto.py` |
| Role guards | Pass | Tests + smoke scripts |
| Upload validation | Pass | `image_storage.py`, tests |
| Image upload prod guard | Pass | `image_upload_guard.py`, `POST /attachments/draft` 403 |
| Voice guardrails | Pass | `voice_guardrails.py`, default on |
| Cloud transcription off | Pass | `CLOUD_TRANSCRIPTION_ENABLED=false` default |
| Smart Capture = reminders only | Pass | No mic/recording from reminders (interaction smoke) |
| No hidden listening | Pass | No always-on mic in smart reminders |
| No auto recording | Pass | User-initiated capture only |
| WhatsApp Business API | **Not started** | Env unset = disabled |
| Demo mode off in prod | **Gate** | Set `ENABLE_DEMO=false` |

---

## 8. Monitoring, logging, and backups

| Capability | Status | TODO |
|------------|--------|------|
| Structured APM (Sentry, Datadog, etc.) | **Not configured** | Add error reporting before scale |
| Uptime monitoring | **Manual** | Ping `/api/` externally |
| AI / voice spend alerts | **Docs only** | GCP billing alert $1; review `ai_usage` collection |
| MongoDB backups | **Not documented in ops** | Enable Atlas backup / export runbook |
| Log secret leakage review | **Manual** | Audit log statements before launch |
| Restore drill | **Not done** | Test Atlas restore to staging |

---

## Automated verification (local)

```bash
# Backend tests
cd backend && REACT_APP_BACKEND_URL=http://localhost:8000 python -m pytest tests/ -q

# Frontend build
cd frontend && CI=false yarn build

# Route smoke (frontend + API running, ENABLE_DEMO=true locally)
# npx -p playwright@1.52.0 + node tools/smoke-browser-pass.mjs

# Interaction smoke
# npx -p playwright@1.52.0 + node tools/smoke-interactions.mjs
```

---

## Launch blockers (must fix or accept)

| Blocker | Severity | Mitigation |
|---------|----------|------------|
| `ENABLE_DEMO=true` in production | **Critical** | Set `false` |
| `CORS_ORIGINS=*` in production | **High** | Exact Vercel origin |
| Weak `ADMIN_PASSWORD` | **High** | Set strong `ADMIN_PASSWORD` |
| Ephemeral image storage on Render | **High** | Limit photo marketing; plan object storage |
| No DB backup runbook | **High** | Atlas backup + restore test |
| No error monitoring | **Medium** | Manual log review for beta |
| WhatsApp enabled without approval | **Critical** | Leave env unset |
| GCP paid APIs beyond Calendar | **Critical** | Do not enable |

---

## Related documents

- `DEPLOY.md` — step-by-step Vercel + Render + Atlas
- `render.yaml` — Render Blueprint
- `docs/TECHNICAL_READINESS_CHECKLIST.md` — feature/security scores
- `docs/MEMORYMATE_BUILD_STACK_CHECKLIST.md` — stack and env index
- `docs/BROWSER_SMOKE_TEST_CHECKLIST.md` — manual QA
- `docs/CALENDAR_PRODUCTION_TODO.md` — Calendar hardening
- `docs/MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md` — cost gates
