# Production error monitoring and incident response plan

**Purpose:** How to detect, triage, and respond to production issues **before and after real users** — without paid APM tools in the MVP phase.

**Related:** `docs/DEPLOYMENT_READINESS_AUDIT.md`, `docs/MONGODB_BACKUP_RESTORE_RUNBOOK.md`, `docs/BROWSER_SMOKE_TEST_CHECKLIST.md`

**This document contains no secrets** — no DSNs, API keys, connection strings, or log excerpts with user data.

---

## 1. Purpose

### Why monitoring matters before real users

Passing local tests and a green `yarn build` does not guarantee production health. Real deployments add:

- Cold starts on Render free tier (slow first request after sleep)
- CORS mismatches between Vercel and Render
- Missing or wrong environment variables
- MongoDB Atlas network or auth issues
- OAuth redirect URI mismatches (Google Calendar)
- Ephemeral disk and upload guards on Render
- Cron jobs hitting the wrong environment

Early detection limits data loss, support burden, and accidental cost (AI/voice).

### Local tests vs production health

| Local dev | Production |
|-----------|------------|
| `ENABLE_DEMO=true`, demo login | `ENABLE_DEMO=false` — real auth only |
| Local MongoDB or dev Atlas | Production Atlas cluster |
| `localhost` CORS | Exact Vercel origin required |
| Fast API always warm | Render may sleep ~15 min idle |
| Browser console on your machine | Users on mobile + varied networks |

**Rule:** Run smoke scripts and manual checklist on **staging** that mirrors production env flags before launch.

### Failures MemoryMate must detect early

- API unavailable or returning 5xx
- Users cannot log in or save memories/reminders
- Calendar connect/import silently failing
- Push or cron sending to wrong environment
- MongoDB connection failures
- AI/voice cost caps misconfigured (runaway spend)
- Image upload guard blocking users without clear UX (expected in prod until object storage)
- Security issues (auth bypass, token leakage in logs)

---

## 2. What to monitor

### Backend signals

| Area | What to watch | Where / how (free-first) |
|------|---------------|---------------------------|
| **API 5xx** | Stack traces, unhandled exceptions | Render service logs |
| **Auth** | Spike in 401/403; repeated failed logins | Render logs; `activity_logs` if enabled |
| **Google Calendar** | OAuth 503, token refresh failures, `encryption_available` false | Render logs; `GET /api/calendar/status` (caregiver) |
| **Notifications** | Push send errors, cron failures | Render logs; `notification_log` gaps |
| **Image uploads** | 403 upload guard (expected prod); 5xx on serve | Render logs; user reports |
| **Voice / transcription** | Guardrail blocks (429/400), cloud STT errors | Render logs; `ai_usage` collection |
| **AI pipeline** | Provider errors, daily cap hits | Render logs; `ai_usage` |
| **MongoDB** | Connection timeouts, auth errors | Render logs; Atlas metrics/alerts (free tier limited) |
| **Backups** | Failed `mongodump`, missed schedule | Ops calendar; `docs/MONGODB_BACKUP_RESTORE_RUNBOOK.md` |
| **Rate limits** | HTTP edge limits (if added later) | Render / future WAF logs |

### Frontend signals

| Area | What to watch | How |
|------|---------------|-----|
| **Blank screen / crash** | React render errors, chunk load failures | Vercel logs; browser console on smoke pass |
| **Route errors** | 404 on nested routes, stale outlet flash | `tools/smoke-browser-pass.mjs`; manual checklist |
| **Failed API calls** | Network errors, 4xx/5xx in Network tab | Browser devtools during smoke |
| **Image preview** | 404 on `GET /api/attachments/{id}` | Interaction smoke; `AuthenticatedImage` fallback |
| **Recording / browser speech** | Mic permission, Web Speech unsupported | Manual mobile smoke |
| **Calendar UI** | Connect button errors, status not connected | Caregiver Calendar connector page |
| **Mobile layout** | Broken nav, overflow, tap targets | `docs/BROWSER_SMOKE_TEST_CHECKLIST.md` |

### Security and privacy in logs

**Never log:**

- Passwords, JWTs, session tokens
- Google OAuth access/refresh tokens
- Full `MONGO_URL` or query strings with credentials
- `TOKEN_ENCRYPTION_KEY`, `JWT_SECRET`, VAPID private keys, WhatsApp tokens
- Full memory transcripts or medical/financial note bodies (if avoidable)

**When reviewing or exporting logs:**

- Redact emails and phone numbers where possible
- Restrict log access to on-call / founders
- Do not paste production logs into public chat, email, or git issues with user content

**Error reporting access:** Anyone with Render/Vercel/Atlas dashboard access can see operational data — use MFA and least-privilege accounts.

---

## 3. Free / local-first approach (no paid monitoring required yet)

MemoryMate can operate a **controlled beta** with:

| Source | Use for |
|--------|---------|
| **Render logs** | API errors, startup, seed messages, request failures |
| **Vercel logs / analytics** | Frontend deploy errors, function edge (if used) |
| **MongoDB Atlas** | Cluster health, connection counts (M0 metrics are basic) |
| **Browser console** | During manual and Playwright smoke runs |
| **Manual health checks** | Ping `GET /api/` after deploy |
| **Smoke scripts** | `tools/smoke-browser-pass.mjs`, `tools/smoke-interactions.mjs` (requires local Playwright) |
| **`pytest`** | Regression before each release (`327+` tests) |
| **`ai_usage` collection** | Daily AI/voice spend review |

**Cadence suggestion (pre-launch):**

- After each production deploy: health ping + 5-minute log skim
- Weekly: manual browser smoke on staging
- Daily (with real users): log skim + `ai_usage` spot check

No Sentry, Datadog, or paid uptime SaaS is **required** for initial beta if the above cadence is followed.

---

## 4. Future optional monitoring (do not enable without approval)

Possible later tools — **optional only**, not MVP requirements:

| Tool | Role | Approval |
|------|------|----------|
| **Sentry** | Frontend/backend error grouping | Paid tiers possible — founder approval |
| **Logtail / Better Stack** | Log aggregation | Paid — approval |
| **Datadog** | APM + infra | Paid — approval |
| **OpenTelemetry** | Standard traces/metrics export | Hosting cost depends on backend |
| **UptimeRobot / Better Stack uptime** | External ping alerts | Free tiers exist; still configure carefully |

**Rules:**

- Do **not** enable paid monitoring without explicit approval and budget.
- Do **not** paste DSNs or API keys into the repo.
- Store keys only in Render/Vercel env vars (e.g. `SENTRY_DSN` — not used today).
- Prefer staging DSN/project separate from production.

---

## 5. Health checks

### Current endpoints (on `main`)

| Check | URL / action | Expected |
|-------|--------------|----------|
| **API health** | `GET https://<api-host>/api/` | `{"status":"ok","app":"MemoryMate"}` |
| **Render blueprint** | `healthCheckPath: /api/` in `render.yaml` | Render uses this for deploy health |
| **Frontend landing** | `https://<vercel-host>/` | Public page loads |
| **Login (dev only)** | `POST /api/auth/demo-login` | Only when `ENABLE_DEMO=true` — **not production** |
| **Authenticated smoke** | Patient + caregiver routes via smoke scripts | See `docs/BROWSER_SMOKE_TEST_CHECKLIST.md` |
| **Calendar status** | `GET /api/calendar/status` (caregiver JWT) | `configured`, `connected`, `secure_storage` flags — no tokens in response |

### TODO (optional enhancement)

A richer **`GET /api/health`** could return non-sensitive dependency hints only, for example:

- `mongodb: ok | error` (no URI)
- `encryption: available | unavailable`
- `demo_mode: true | false`

**Do not** expose version strings that aid attackers, internal hostnames, or collection counts in public health responses without auth.

Until then, **`GET /api/`** is the production liveness check.

---

## 6. Incident response mini-plan

| Step | Action |
|------|--------|
| 1. **Detect** | Uptime failure, user report, log alert, failed deploy |
| 2. **Triage severity** | Use §8 severity table |
| 3. **Stop risky feature** | Disable cron, pause WhatsApp env, set `CLOUD_TRANSCRIPTION_ENABLED=false`, suspend Render service if data at risk |
| 4. **Protect user data** | No destructive DB ops without backup — see `docs/MONGODB_BACKUP_RESTORE_RUNBOOK.md` |
| 5. **Check deployments** | Render + Vercel last deploy time vs incident start |
| 6. **Review logs** | Render/Vercel — redact before sharing externally |
| 7. **Rollback if needed** | Redeploy previous Render commit or Vercel deployment |
| 8. **Document** | Incident time, impact, root cause, fix, follow-ups |
| 9. **Notify users** | If data loss or prolonged outage — template TBD for caregivers/patients |
| 10. **Postmortem** | Within 1 week for P0/P1; update this doc if process gaps found |

**Rollback pointers:**

- Render: Dashboard → service → **Manual Deploy** → previous commit on `main`
- Vercel: Deployments → promote previous production deployment
- Database: restore only via runbook — never ad-hoc on production

---

## 7. Error severity levels

| Level | Definition | Examples | Response time target |
|-------|------------|----------|----------------------|
| **P0** | Security, data leak, or runaway cost | Exposed tokens in logs; auth bypass; AI spend spike; wrong env sending prod notifications | Immediate — all hands |
| **P1** | Core app unusable or data not saving | Login broken for all users; MongoDB down; memories not persisting | < 1 hour |
| **P2** | Major feature broken | Calendar connect fails; photos broken for all; push entirely dead | < 24 hours |
| **P3** | Minor / polish | UI glitch, single-route 404, typo, non-blocking calendar suggestion UI | Next sprint |

Assign an **incident commander** (founder or designated engineer) for P0/P1.

---

## 8. Pre-launch checklist

| Item | Done? | Notes |
|------|-------|-------|
| Render logs accessible to on-call | | MFA on Render account |
| Vercel logs accessible to on-call | | |
| Atlas dashboard accessible | | |
| Team knows where to check logs | | Link this doc |
| No secrets in application logs | | Manual grep review before launch |
| Health check verified (`GET /api/`) | | After each deploy |
| Smoke scripts runnable locally | | `tools/smoke-*.mjs` + Playwright |
| Error monitoring **provider decision** recorded | | Free-first OK for beta; paid tools pending approval |
| Rollback process understood | | Render + Vercel |
| Env vars backed up privately | | Not in git — password manager |
| MongoDB backup/restore runbook linked | | `docs/MONGODB_BACKUP_RESTORE_RUNBOOK.md` |
| `ENABLE_DEMO=false` on production API | | |
| `WHATSAPP_*` unset on production | | WhatsApp not started |
| Staging mirrors prod flags for smoke | | |

**Launch review item:** Production monitoring is **not a hard blocker** for a controlled beta if free-first monitoring cadence and incident plan are assigned — but **P0/P1 response ownership** must be named before real users.

---

## 9. Related documentation

| Doc | Relevance |
|-----|-----------|
| [DEPLOYMENT_READINESS_AUDIT.md](./DEPLOYMENT_READINESS_AUDIT.md) | Env gates, CORS, demo mode, launch blockers |
| [MONGODB_BACKUP_RESTORE_RUNBOOK.md](./MONGODB_BACKUP_RESTORE_RUNBOOK.md) | DR during incidents |
| [BROWSER_SMOKE_TEST_CHECKLIST.md](./BROWSER_SMOKE_TEST_CHECKLIST.md) | Manual QA pass |
| [VOICE_TRANSCRIPTION_COST_GUARDRAILS.md](./VOICE_TRANSCRIPTION_COST_GUARDRAILS.md) | Voice/cloud STT caps and alerts |
| [MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md](./MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md) | Paid service gates |
| [PRODUCTION_ENV_AUDIT_CHECKLIST.md](./PRODUCTION_ENV_AUDIT_CHECKLIST.md) | Pre-deploy env go/no-go |

---

## Appendix: quick commands (no secrets)

```bash
# API health (replace host — do not commit real URL with credentials)
curl -sS "https://<your-api-host>/api/"

# Backend tests before release
cd backend && REACT_APP_BACKEND_URL=http://localhost:8000 python -m pytest tests/ -q

# Frontend build
cd frontend && CI=false yarn build

# Optional smoke (API + frontend running locally, Playwright installed)
# npx -p playwright@1.52.0 node tools/smoke-browser-pass.mjs
# npx -p playwright@1.52.0 node tools/smoke-interactions.mjs
```

---

*Last updated: 2026-06 — re-verify health routes in `backend/server.py` and `render.yaml` before each launch review.*
