# Production environment audit checklist

**Purpose:** Go/no-go verification of **environment variables and external settings** before deploying MemoryMate to production with real users.

**Use this document at deploy time** — not as a substitute for `docs/DEPLOYMENT_READINESS_AUDIT.md`, `docs/PRODUCTION_ERROR_MONITORING_PLAN.md`, or `docs/MONGODB_BACKUP_RESTORE_RUNBOOK.md`.

**No secrets in this doc** — variable names only, no real values, no connection strings.

---

## 1. Production go/no-go summary

| Status | Condition |
|--------|-----------|
| **Ready** | All **Do not deploy** items are green; **Needs review** items explicitly accepted by founder |
| **Needs review** | Optional features enabled (Calendar, push, AI keys) — verify caps and encryption |
| **Do not deploy** | Any row in §10 Launch blockers is true |

### Quick gates

| Check | Ready when | Do not deploy when |
|-------|------------|-------------------|
| `ENABLE_DEMO` | `false` on Render API | `true` — passwordless demo login for any role |
| `CORS_ORIGINS` | Exact Vercel URL(s), comma-separated | `*` or wrong origin |
| `JWT_SECRET` | Strong random; Render-generated or rotated | Default / weak / missing |
| `ADMIN_PASSWORD` | Strong; not `admin123` | Example default still in use |
| `TOKEN_ENCRYPTION_KEY` | Set if Google Calendar enabled | Calendar enabled without key |
| `MONGO_URL` | Set in Render only; not in git | Missing, or committed to repo |
| Secrets in repo | None — `.env` gitignored | Any real secret in git history |
| `CLOUD_TRANSCRIPTION_ENABLED` | `false` (default) unless approved + capped | `true` without budget review |
| Image uploads | Blocked by default in prod (`IMAGE_STORAGE_MODE=disabled`) | Local disk uploads for real users without approval |
| WhatsApp | All `WHATSAPP_*` unset | Any WhatsApp env set without approval |
| Google Cloud | Calendar API + OAuth only | Vertex, GCS, Vision, Maps, Speech-to-Text, etc. enabled |

**Sign-off:** Founder / deployer name, date, environment URL, and go/no-go recorded outside git (password manager or ops log).

---

## 2. Backend environment variables (Render)

Set in **Render → memorymate-api → Environment**. Names only — never paste values into docs or chat.

### Core app / runtime

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `PYTHON_VERSION` | Yes (Blueprint) | `3.12.4` | Wrong runtime | `render.yaml` |
| `ENVIRONMENT` | Recommended | unset / `production` | Mis-detected dev vs prod behavior | Render |
| `APP_ENV` | Optional | unset | Same as above | Render |
| `NODE_ENV` | Optional | unset | Rare on API | Render |
| `RENDER` | Auto on Render | set by host | — | Render |

### Auth / security

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `JWT_SECRET` | **Yes** | Render `generateValue` | Forged sessions | Render |
| `ADMIN_EMAIL` | Optional | seeded default | Wrong admin inbox | Render |
| `ADMIN_PASSWORD` | **Yes** (if admin used) | **not** example default | Trivial admin access | Render |
| `TOKEN_ENCRYPTION_KEY` | **Yes if Calendar on** | Render `generateValue` | OAuth tokens stored unsafely / connect fails | Render |

### Database

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `MONGO_URL` | **Yes** | — (**secret**) | App cannot start / wrong cluster | Render `sync: false` |
| `DB_NAME` | Yes | `memorymate` | Wrong database | Render |

### CORS / URLs

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `CORS_ORIGINS` | **Yes** | exact frontend origin | CSRF-like issues; `*` over-permissive | Render |
| `FRONTEND_URL` | **Yes if Calendar** | production Vercel URL | OAuth redirect broken | Render |

### Google OAuth / Calendar

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `GOOGLE_CLIENT_ID` | If Calendar used | unset = disabled | — | Render |
| `GOOGLE_CLIENT_SECRET` | If Calendar used | unset (**secret**) | — | Render |
| `GOOGLE_REDIRECT_URI` | If Calendar used | `https://<api>/api/calendar/callback` | OAuth mismatch | Render + Google console |
| `CAL_TIMEZONE` | Optional | `UTC` | Wrong reminder times | Render |

### AI provider / cost caps

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `EMERGENT_LLM_KEY` | Optional | unset → rule-based | Spend if set without caps | Render |
| `ANTHROPIC_API_KEY` | Optional | unset | Spend | Render |
| `OPENAI_API_KEY` | Optional | unset | Spend + enables Whisper path | Render |
| `MODEL_NAME` | Optional | provider default | Wrong model / cost | Render |
| `CAPTURE_MODEL_PROVIDER` | Optional | unset | Higher capture cost | Render |
| `CAPTURE_MODEL_NAME` | Optional | unset | Higher capture cost | Render |
| `DAILY_AI_COST_CAP_USD` | Recommended if AI on | `0.50` or lower | Runaway AI spend | Render |
| `TEXT_AI_PROVIDER` | Optional | `rule_based` | Unexpected provider | Render |
| `CHEAP_TEXT_AI_PROVIDER` | Optional | unset | — | Render |
| `PREMIUM_TEXT_AI_PROVIDER` | Optional | unset | — | Render |
| `PREMIUM_FALLBACK_ENABLED` | Optional | `false` | Extra spend | Render |
| `MAX_AI_PROVIDERS_PER_REQUEST` | Optional | `1` | Multi-provider cost | Render |
| `ALLOW_PREMIUM_RETRY` | Optional | `false` | Extra spend | Render |
| `MAX_AI_ACTIONS_PER_DAY` | Optional | capped | Abuse | Render |

### Voice / transcription guardrails

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `CLOUD_TRANSCRIPTION_ENABLED` | Optional | **`false`** | Cloud STT charges | Render |
| `VOICE_COST_GUARDRAILS_ENABLED` | Optional | `true` | Caps weakened | Render |
| `REQUIRE_CONFIRMATION_FOR_CLOUD_TRANSCRIPTION` | Optional | `true` | Silent cloud upload | Render |
| `FREE_VOICE_MINUTES_PER_DAY` | Optional | low cap | — | Render |
| `PLUS_VOICE_MINUTES_PER_DAY` | Optional | capped | — | Render |
| `FAMILY_VOICE_MINUTES_PER_DAY` | Optional | capped | — | Render |
| `DEFAULT_VOICE_MINUTES_PER_DAY` | Optional | capped | — | Render |
| `MAX_SINGLE_RECORDING_MINUTES` | Optional | `10` | Long recordings | Render |
| `MAX_MEETING_CAPTURE_MINUTES` | Optional | `60` | Long meetings | Render |
| `DAILY_VOICE_MINUTES_CAP` | Optional | low | — | Render |
| `MAX_RECORDING_SECONDS` | Optional | capped | — | Render |
| `MAX_MEETING_MINUTES` | Optional | capped | — | Render |
| `SMART_DAY_CLOUD_MINUTES_CAP` | Optional | `15` | Smart Day cloud cost | Render |
| `MAX_SMART_DAY_SNIPPET_SECONDS` | Optional | capped | — | Render |
| `MAX_SMART_DAY_SESSION_HOURS` | Optional | capped | — | Render |

### Image uploads / storage

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `IMAGE_UPLOADS_ENABLED` | Optional | **`false` in prod** | Uploads to ephemeral disk | Render |
| `IMAGE_STORAGE_MODE` | Optional | **`disabled` in prod** | Lost photos on redeploy | Render |
| `ALLOW_LOCAL_IMAGE_STORAGE_IN_PRODUCTION` | Optional | **`false`** | Real users on ephemeral disk | Render |
| `MAX_IMAGE_BYTES` | Optional | `5242880` | — | Render |
| `MAX_IMAGES_PER_NOTE` | Optional | `3` | — | Render |

### Notifications

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `VAPID_PUBLIC_KEY` | If push used | unset = no push | — | Render |
| `VAPID_PRIVATE_KEY` | If push used | unset (**secret**) | — | Render |
| `VAPID_SUBJECT` | If push used | `mailto:...` | Push provider rejection | Render |
| `CRON_SECRET` | If cron used | Render generated | Open cron endpoint | Render |

### WhatsApp — **keep disabled**

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `WHATSAPP_VERIFY_TOKEN` | **No** | unset | Messaging started | Render |
| `WHATSAPP_ACCESS_TOKEN` | **No** | unset | Paid Meta API | Render |
| `WHATSAPP_PHONE_NUMBER_ID` | **No** | unset | — | Render |
| `WHATSAPP_APP_SECRET` | **No** | unset | — | Render |
| `WHATSAPP_REMINDER_TEMPLATE` | **No** | unset | — | Render |
| `WHATSAPP_TEMPLATE_LANG` | **No** | unset | — | Render |

### Demo mode / admin

| Variable | Required prod? | Safe default | Danger if wrong | Where |
|----------|----------------|--------------|-----------------|-------|
| `ENABLE_DEMO` | **Yes — must be false** | **`false`** on prod | Anyone demo-logs in | Render |

**Verify in code:** `backend/.env.example`, `render.yaml`, `backend/crypto.py`, `backend/image_upload_guard.py`.

---

## 3. Frontend environment variables (Vercel)

Set in **Vercel → Project → Settings → Environment Variables** (Production). Build-time for CRA — redeploy after changes.

| Variable | Required prod? | Production value type | Danger if wrong | Where |
|----------|----------------|----------------------|-----------------|-------|
| `REACT_APP_BACKEND_URL` | **Yes** | `https://<your-render-api-host>` (no trailing slash) | All API calls fail | Vercel |
| `REACT_APP_WHOOP_CONNECTOR_ENABLED` | No | `false` or unset | Shows planning UI only | Vercel |
| `PORT` | Dev only | unset on Vercel | — | Local |

**Note:** Google OAuth client IDs are **backend** vars (`GOOGLE_CLIENT_ID`); frontend uses backend Calendar routes only.

**Verify:** `frontend/.env.example`, `frontend/src/lib/api.js`.

---

## 4. External service setup checklist

| Service | Verify before go-live |
|---------|----------------------|
| **MongoDB Atlas** | M0 or approved tier; user with least privilege; IP allowlist (`0.0.0.0/0` for Render); `MONGO_URL` only in Render |
| **Render backend** | Blueprint deployed; `ENABLE_DEMO=false`; health check `/api/` green; logs accessible |
| **Vercel frontend** | Root `frontend/`; `REACT_APP_BACKEND_URL` set; production URL matches `CORS_ORIGINS` |
| **Google Cloud OAuth** | Web client; authorized redirect = `GOOGLE_REDIRECT_URI`; consent screen configured |
| **Google Calendar API** | API enabled only (not other GCP products) |
| **Web Push (optional)** | VAPID keys in Render; cron hits staging/prod with correct `CRON_SECRET` |
| **Email** | Not required for MVP — verify no accidental SMTP secrets |
| **WhatsApp** | **Disabled** — no `WHATSAPP_*` on Render |

---

## 5. Google Cloud safe setup

### Only enable

- **Google Calendar API**
- **OAuth 2.0 client** (Web application) for Calendar connector
- OAuth consent screen (scopes limited to Calendar needs)

### Do **not** enable (without explicit approval + cost review)

| API / product | Risk |
|---------------|------|
| Vertex AI | Per-token/image billing |
| Gemini Enterprise | Enterprise contracts |
| Google Cloud Agent Platform | Agent runtime billing |
| Google Cloud Storage | Storage + egress; use private storage plan first |
| Google Vision API | Per-image OCR |
| Google Photos API | Not in product scope |
| Google Maps Platform / Places API | Per-request; app uses deep links only |
| Google Speech-to-Text | Per-minute; cloud STT disabled by default |
| BigQuery | Analytics warehouse cost |
| Compute Engine | VM billing |
| Cloud Run (paid scale) | Container billing |

**Billing alert:** Set a low GCP budget alert (e.g. $1) if any Google APIs are enabled.

---

## 6. Production deployment settings

| Item | Expected |
|------|----------|
| **Render build** | `pip install -r requirements.txt --extra-index-url ...` (`render.yaml`) |
| **Render start** | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| **Render health** | `healthCheckPath: /api/` → `{"status":"ok","app":"MemoryMate"}` |
| **Vercel build** | `frontend/` root; `yarn build` / CRA default |
| **Allowed origins** | `CORS_ORIGINS` = exact Vercel production URL |
| **Backend URL** | `REACT_APP_BACKEND_URL` = Render service URL |
| **Frontend URL** | `FRONTEND_URL` + Google OAuth redirects |
| **Logs** | Render dashboard + Vercel logs; see `docs/PRODUCTION_ERROR_MONITORING_PLAN.md` |
| **Branch deploy** | Prefer `main` only for production; preview deploys use staging env — **never prod `MONGO_URL` on previews** |
| **Auto-deploy** | Confirm intentional; tag releases for rollback reference |

---

## 7. Secrets handling

- **Never** paste secrets into docs, issues, or chat (including this checklist).
- **Never** commit `.env`, `credentials.json`, or backup dumps.
- Store production env in **password manager** or Render/Vercel secret UI only.
- **Rotate** `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, API keys if leaked.
- Enable **GitHub secret scanning** / dependabot alerts on the repo if available.
- Confirm `.gitignore` includes `.env`, `.env.*`, `credentials.json`, `/backups/`.

---

## 8. Pre-deploy test commands

Run from clean `main` before promoting production:

```bash
# Backend tests
cd backend && REACT_APP_BACKEND_URL=http://localhost:8000 python -m pytest tests/ -q

# Frontend production build
cd frontend && CI=false yarn build

# Optional smoke (local API + frontend running, Playwright installed)
# npx -p playwright@1.52.0 node tools/smoke-browser-pass.mjs
# npx -p playwright@1.52.0 node tools/smoke-interactions.mjs
```

Also complete: MongoDB restore drill per `docs/MONGODB_RESTORE_DRILL_CHECKLIST.md` (sign-off §7 required before launch).

| Restore drill | Status (2026-06-07) |
|---------------|---------------------|
| Overall | **BLOCKED** — `STAGING_MONGO_URL` not set (need separate staging/dev MongoDB URI) |
| Backup / restore executed | No |
| Production overwritten | No |

Set `STAGING_MONGO_URL` to a **non-production** database before `mongorestore`. Never use production `MONGO_URL` as restore target.

---

## 9. Post-deploy smoke checklist

| Check | Pass? |
|-------|-------|
| Landing page loads (Vercel URL) | |
| `GET /api/` returns `status: ok` | |
| Real login works (register or seeded admin — **not** demo login) | |
| Demo login **disabled** (`POST /api/auth/demo-login` should fail or be unavailable) | |
| Patient dashboard loads | |
| Caregiver dashboard loads | |
| Calendar `GET /api/calendar/status` (if Calendar enabled) | |
| Photo uploads show disabled message or guard (if storage not configured) | |
| Smart Capture reminders **do not** start microphone | |
| Voice guardrails active (cloud STT off unless explicitly enabled) | |
| No fatal errors in browser console (spot check) | |
| Render logs: no sustained 5xx spike | |

Detailed manual steps: `docs/BROWSER_SMOKE_TEST_CHECKLIST.md`.

---

## 10. Launch blockers

**Do not deploy to real users** if any of the following is true:

| Blocker | Severity |
|---------|----------|
| MongoDB backup/restore **not drilled** | High — complete `docs/MONGODB_RESTORE_DRILL_CHECKLIST.md` §7 sign-off |
| `ENABLE_DEMO=true` on production API | **Critical** |
| `CORS_ORIGINS=*` or missing frontend origin | **High** |
| Missing or weak `JWT_SECRET` | **Critical** |
| Calendar enabled without `TOKEN_ENCRYPTION_KEY` | **High** |
| `ALLOW_LOCAL_IMAGE_STORAGE_IN_PRODUCTION=true` for real users | **High** |
| `IMAGE_UPLOADS_ENABLED=true` + ephemeral disk for real users | **High** |
| `CLOUD_TRANSCRIPTION_ENABLED=true` without caps and approval | **High** |
| Any `WHATSAPP_*` set without approval | **Critical** |
| Google Cloud paid APIs enabled accidentally | **Critical** |
| Real secrets committed to git | **Critical** |

---

## Related documentation

| Doc | Role |
|-----|------|
| [DEPLOYMENT_READINESS_AUDIT.md](./DEPLOYMENT_READINESS_AUDIT.md) | Full pre-launch audit |
| [PRODUCTION_ERROR_MONITORING_PLAN.md](./PRODUCTION_ERROR_MONITORING_PLAN.md) | Logs and incidents |
| [MONGODB_BACKUP_RESTORE_RUNBOOK.md](./MONGODB_BACKUP_RESTORE_RUNBOOK.md) | Backup options and DR |
| [MONGODB_RESTORE_DRILL_CHECKLIST.md](./MONGODB_RESTORE_DRILL_CHECKLIST.md) | Restore drill steps and sign-off (**launch blocker**) |
| [BROWSER_SMOKE_TEST_CHECKLIST.md](./BROWSER_SMOKE_TEST_CHECKLIST.md) | Manual QA |
| [VOICE_TRANSCRIPTION_COST_GUARDRAILS.md](./VOICE_TRANSCRIPTION_COST_GUARDRAILS.md) | Voice env caps |
| [MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md](./MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md) | Paid service gates |
| [MEMORYMATE_BUILD_STACK_CHECKLIST.md](./MEMORYMATE_BUILD_STACK_CHECKLIST.md) | Stack and env index |
| `DEPLOY.md` | Step-by-step deploy |
| `render.yaml` | Render Blueprint defaults |

---

*Last updated: 2026-06 — reconcile with `backend/.env.example` and `render.yaml` before each production cut.*
