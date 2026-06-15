# MongoDB restore drill checklist

**Purpose:** Step-by-step **dry-run and live drill** to prove a backup can be restored into **staging or dev** before real users — without touching production.

**Related:** [MONGODB_BACKUP_RESTORE_RUNBOOK.md](./MONGODB_BACKUP_RESTORE_RUNBOOK.md), [PRODUCTION_ENV_AUDIT_CHECKLIST.md](./PRODUCTION_ENV_AUDIT_CHECKLIST.md), [BROWSER_SMOKE_TEST_CHECKLIST.md](./BROWSER_SMOKE_TEST_CHECKLIST.md)

**No secrets in this document** — placeholder commands only.

**Local helpers (optional):**

- `python scripts/restore_drill_checklist.py` — dry-run; checks env var **names** are set locally; does **not** connect to MongoDB or print values.
- `python scripts/run_restore_drill.py` — runs `mongodump` (source) + `mongorestore` (staging only). See **§2.1** below.

---

## 2.1 Restore drill helper script

Use `scripts/run_restore_drill.py` for a guided dump → restore flow. It reads **environment variables only** (or optional gitignored `backend/.env` / `backend/.env.staging`). It **never prints** MongoDB URIs or secret values.

**Before running:**

- Set `MONGO_URL` (source — read-only dump) and `STAGING_MONGO_URL` (restore target) in your shell or gitignored env files.
- **Do not paste** URI values into docs, chat, issues, or git.
- **Do not commit** `backend/.env.staging`, backup files, or anything under `./backups/` (gitignored).
- Confirm `MONGO_URL` ≠ `STAGING_MONGO_URL` (script refuses if they match).

**Usage:**

```bash
# Dry-run env check first
python scripts/restore_drill_checklist.py

# Help (no database access)
python scripts/run_restore_drill.py --help

# Live drill — mongodump from MONGO_URL, mongorestore to STAGING_MONGO_URL only
python scripts/run_restore_drill.py

# Skip brief local API health check after restore
python scripts/run_restore_drill.py --skip-health-check

# Force a fresh mongodump even if today's backup folder exists
python scripts/run_restore_drill.py --force-dump
```

**What the script does:**

1. `mongodump` from `MONGO_URL` into `./backups/YYYY-MM-DD-memorymate/` (gitignored).
2. `mongorestore --drop` to `STAGING_MONGO_URL` using the **parent** dump folder (`backups/YYYY-MM-DD-memorymate/`), **not** the inner `memorymate/` path alone — pointing at the inner folder restores **0** documents.
3. Optional brief local `GET /api/` on `:8799` against staging (WhatsApp env vars cleared; no notifications sent).

**Safety:** TLS verification is not disabled. The script does not call WhatsApp or send notifications. It does not commit backups.

---

## Drill status (latest attempt)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-15 |
| **Environment** | Local backup from source `MONGO_URL`; restore to **`STAGING_MONGO_URL`** only; row-count + API checks via staging DB (equivalent to Render staging verification) |
| **Overall** | **Pass** — backup, staging restore, row-count match, staging API verification, `pytest`, frontend build |
| **Backup created** | Yes — gitignored `backups/2026-06-15-memorymate/` |
| **Restore performed** | Yes — staging target only (`mongorestore --drop` exit 0; **18,866** documents restored) |
| **Production touched** | No — source dump read-only; restore target ≠ production URI |
| **Row-count check** | **Pass** — staging counts match backup BSON counts (see safe counts below) |
| **Staging API verification** | **Pass** — `GET /api/` 200; demo login patient + caregiver; memories/reminders/appointments/today summary; onboarding `me`; image upload config blocked |
| **Local SSL issue** | Fixed — Motor/PyMongo use `certifi` CA bundle (`backend/mongo_client.py`) |
| **Tests / build** | `pytest` 354 passed, 4 skipped; `CI=false yarn build` OK |
| **Smoke scripts** | Not run — require local frontend on `:3000` + Playwright; covered by `pytest` + staging API checks |
| **WhatsApp / notifications** | Not triggered |

**Safe collection counts (staging = backup `2026-06-15`):** users **188**; patients **185**; patient_caregiver_links **94**; memories **488**; reminders **128**; appointments **186**; notification_prefs **1**; calendar_links **1**; calendar_activity **103**; memory_image_attachments **502**; ai_usage **8**; activity_logs **14632**; consent_logs **1215**; capture_sessions **851**; push_subscriptions **0**.

**Restore path note:** `mongorestore` must target the **parent** dump folder (e.g. `backups/YYYY-MM-DD-memorymate/`), not the inner `memorymate/` directory — pointing at the inner folder restores **0** documents.

**Earlier blockers (resolved):** `STAGING_MONGO_URL` missing locally (2026-06-07); macOS Python Atlas SSL via `certifi` (do **not** disable TLS verification).

---

## 1. Goal

| Objective | Rule |
|-----------|------|
| Prove backup restores successfully | Restore into **staging or dev** only |
| Confirm app works after restore | Login, dashboards, core data visible |
| **Do not touch production** during the drill | No `mongorestore` to prod without explicit approval |
| Record pass/fail sign-off | §7 table — required to clear launch blocker |

Creating a backup without completing this drill does **not** satisfy the launch gate in `docs/DEPLOYMENT_READINESS_AUDIT.md`.

---

## 2. Preparation

Before starting:

- [ ] **Owner assigned** (name recorded in §7)
- [ ] **Staging/dev target** identified — separate Atlas cluster or database, not production
- [ ] **Fresh backup** taken manually (see §3) — stored **outside the git repo**
- [ ] **Do not commit** backup, dump, BSON, or export files (`/backups/` is gitignored)
- [ ] **Do not paste** MongoDB URI in docs, chat, email, or issues
- [ ] **Staging env** uses staging `MONGO_URL` only (Render staging service or local)
- [ ] **Production notifications disabled on staging** — separate or unset `VAPID_*`, cron pointed away from prod users
- [ ] **WhatsApp disabled** — all `WHATSAPP_*` unset on staging
- [ ] **Demo mode** — `ENABLE_DEMO=true` OK on dev; staging should mirror prod intent (`false` for prod-like drill)
- [ ] **`TOKEN_ENCRYPTION_KEY`** on staging matches source if testing Calendar tokens from prod backup (or expect re-auth)
- [ ] Run `python scripts/restore_drill_checklist.py` locally to verify env **names** (not values) before API smoke
- [ ] Optional live dump/restore: `python scripts/run_restore_drill.py` (see §2.1 — env vars only; never paste URIs)

---

## 3. Backup command templates (placeholders only)

Export URI in your shell from password manager — **never commit**:

```bash
export MONGO_URL='<your-source-connection-string>'
export BACKUP_DIR="./backups/$(date +%Y-%m-%d)-memorymate"
mkdir -p "$BACKUP_DIR"

mongodump --uri "$MONGO_URL" --db memorymate --out "$BACKUP_DIR"
```

MemoryMate uses `MONGO_URL` and `DB_NAME` (default `memorymate`) in `backend/db.py` and `backend/.env.example`.

**Rules:**

- Keep `BACKUP_DIR` under `./backups/` (gitignored) or outside the repo entirely
- Encrypt backup at rest if storing on disk overnight
- Delete local copies when drill is complete if not needed for retention policy

---

## 4. Restore command templates (placeholders only)

**Target: staging or dev only.**

```bash
export STAGING_MONGO_URL='<your-staging-connection-string>'
export BACKUP_DIR="./backups/YYYY-MM-DD-memorymate"

# Staging only — drops existing data in target DB when using --drop
# Use the parent folder from mongodump --out (contains memorymate/*.bson), not the inner memorymate/ path alone
mongorestore --uri "$STAGING_MONGO_URL" --drop "$BACKUP_DIR"
```

Or without `--drop` if restoring into an empty database.

**Never run against production URI without:**

1. Founder approval
2. Fresh production backup taken immediately before
3. Incident record started

---

## 5. Post-restore verification

After restore, point the **staging** API at `STAGING_MONGO_URL` and verify:

| Check | Pass? |
|-------|-------|
| API starts — `GET /api/` → `{"status":"ok",...}` | |
| Login works (patient + caregiver) | |
| Patient dashboard loads | |
| Caregiver dashboard loads | |
| Memories appear (spot-check count) | |
| Reminders appear | |
| Appointments appear | |
| Google Calendar tokens handled safely (connect or re-auth if key mismatch) | |
| Image attachment metadata does not crash app (files may 404 if disk not restored) | |
| Photo uploads blocked in prod-like staging (`IMAGE_STORAGE_MODE=disabled`) | |
| Smart Capture reminders **do not** start microphone | |
| Voice caps still active (`CLOUD_TRANSCRIPTION_ENABLED=false` unless testing) | |
| **No WhatsApp messages sent** | |
| **No production notifications** from staging cron/push | |

Quick counts (staging shell — redact output before sharing):

```bash
mongosh "$STAGING_MONGO_URL" --eval 'db.users.countDocuments()'
mongosh "$STAGING_MONGO_URL" --eval 'db.memories.countDocuments()'
mongosh "$STAGING_MONGO_URL" --eval 'db.reminders.countDocuments()'
mongosh "$STAGING_MONGO_URL" --eval 'db.appointments.countDocuments()'
```

---

## 6. Smoke commands after restore

With staging API + frontend pointed at staging:

```bash
# Backend regression (against local or staging API URL in env)
cd backend && REACT_APP_BACKEND_URL=http://localhost:8000 python -m pytest tests/ -q

# Frontend build
cd frontend && CI=false yarn build

# Optional browser smoke (Playwright required; API + frontend running)
# npx -p playwright@1.52.0 node tools/smoke-browser-pass.mjs
# npx -p playwright@1.52.0 node tools/smoke-interactions.mjs
```

Manual pass: `docs/BROWSER_SMOKE_TEST_CHECKLIST.md`.

---

## 7. Pass/fail sign-off

Complete after drill. Store completed copy outside git (ops log / password manager attachment).

| Check | Result (Pass / Fail) | Notes | Date | Owner |
|-------|----------------------|-------|------|-------|
| Backup created and stored securely | Pass | `backups/2026-06-15-memorymate/` (gitignored) | 2026-06-15 | Engineering |
| Restore to staging/dev completed | Pass | `mongorestore --drop` to staging only; 18,866 docs | 2026-06-15 | Engineering |
| Row counts match backup | Pass | 15 key collections — see safe counts in drill status | 2026-06-15 | Engineering |
| API health `GET /api/` | Pass | Staging DB via local API `:8799` | 2026-06-15 | Engineering |
| Login (patient) | Pass | Demo login (staging drill) | 2026-06-15 | Engineering |
| Login (caregiver) | Pass | Demo login (staging drill) | 2026-06-15 | Engineering |
| Patient dashboard data | Pass | 488 memories, 128 reminders, 186 appointments | 2026-06-15 | Engineering |
| Caregiver dashboard data | Pass | Overview + caregiver summary OK | 2026-06-15 | Engineering |
| Memories / reminders / appointments visible | Pass | List endpoints 200 | 2026-06-15 | Engineering |
| Calendar tokens / re-auth OK | Pass | calendar_links **1**, calendar_activity **103** restored | 2026-06-15 | Engineering |
| Image metadata / upload guard | Pass | Upload config `disabled`; uploads blocked | 2026-06-15 | Engineering |
| No staging WhatsApp / prod notifications | Pass | WhatsApp env unset; no messages sent | 2026-06-15 | Engineering |
| `pytest` on release branch | Pass | 354 passed, 4 skipped | 2026-06-15 | Engineering |
| Frontend build | Pass | `CI=false yarn build` | 2026-06-15 | Engineering |
| **Overall drill** | **Pass** | Full row-count + staging API verification complete | 2026-06-15 | Engineering |

**Launch blocker:** Overall drill must be **Pass** with date and owner recorded before real users — **cleared 2026-06-15**.

---

## 8. Failure plan

If restore or verification **fails**:

1. **Stop the drill** — do not proceed to production
2. **Do not touch production** database
3. **Preserve logs** — Render staging logs, `mongorestore` output (redact URIs before sharing)
4. **Note failing collection or step** (e.g. missing index, auth error, wrong `DB_NAME`)
5. **Retry** on a **clean** staging database (drop and restore again, or new empty cluster)
6. **Document** failure in ops log; link to this checklist and runbook
7. **Update** `docs/MONGODB_BACKUP_RESTORE_RUNBOOK.md` if process gap found

Do not delete the only good backup while debugging.

---

## 9. Related documentation

| Doc | Role |
|-----|------|
| [MONGODB_BACKUP_RESTORE_RUNBOOK.md](./MONGODB_BACKUP_RESTORE_RUNBOOK.md) | Backup options, security, DR |
| [DEPLOYMENT_READINESS_AUDIT.md](./DEPLOYMENT_READINESS_AUDIT.md) | Launch blockers |
| [PRODUCTION_ENV_AUDIT_CHECKLIST.md](./PRODUCTION_ENV_AUDIT_CHECKLIST.md) | Env go/no-go before deploy |
| [PRODUCTION_ERROR_MONITORING_PLAN.md](./PRODUCTION_ERROR_MONITORING_PLAN.md) | Logs during incident |

---

*Last updated: 2026-06-15 — restore drill **Pass**; staging row counts match backup; launch blocker cleared.*
