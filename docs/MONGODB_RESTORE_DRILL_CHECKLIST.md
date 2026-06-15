# MongoDB restore drill checklist

**Purpose:** Step-by-step **dry-run and live drill** to prove a backup can be restored into **staging or dev** before real users — without touching production.

**Related:** [MONGODB_BACKUP_RESTORE_RUNBOOK.md](./MONGODB_BACKUP_RESTORE_RUNBOOK.md), [PRODUCTION_ENV_AUDIT_CHECKLIST.md](./PRODUCTION_ENV_AUDIT_CHECKLIST.md), [BROWSER_SMOKE_TEST_CHECKLIST.md](./BROWSER_SMOKE_TEST_CHECKLIST.md)

**No secrets in this document** — placeholder commands only.

**Local helper (optional):** `python scripts/restore_drill_checklist.py` — checks env var **names** are set locally; does **not** connect to MongoDB or print values.

---

## Drill status (latest attempt)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-07 |
| **Environment** | Local readiness check — live drill **not executed** |
| **Overall** | **BLOCKED** |
| **Blocker** | `STAGING_MONGO_URL` not set locally (separate staging/dev MongoDB URI required) |
| **Backup created** | No |
| **Restore performed** | No |
| **App verified against restored DB** | No |
| **Production touched** | No |

**Next steps to unblock:**

1. Provision a **separate** MongoDB database or cluster for staging/dev (not production).
2. Set `STAGING_MONGO_URL` in local shell or staging Render env (never commit the value).
3. Run backup: `mongodump --uri "$MONGO_URL" --db memorymate --out "./backups/$(date +%Y-%m-%d)-memorymate"` (gitignored `./backups/`).
4. Restore to staging only: `mongorestore --uri "$STAGING_MONGO_URL" --drop "./backups/YYYY-MM-DD-memorymate/memorymate"`.
5. Point staging API at `STAGING_MONGO_URL`; keep `WHATSAPP_*` unset; disable prod push on staging.
6. Complete §5 verification and §6 smoke; sign off §7.

**Do not** restore into production `MONGO_URL`. Production launch remains blocked until Overall drill is **Pass**.

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
mongorestore --uri "$STAGING_MONGO_URL" --drop "$BACKUP_DIR/memorymate"
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
| Backup created and stored securely | | | | |
| Restore to staging/dev completed | | | | |
| API health `GET /api/` | | | | |
| Login (patient) | | | | |
| Login (caregiver) | | | | |
| Patient dashboard | | | | |
| Caregiver dashboard | | | | |
| Memories / reminders / appointments visible | | | | |
| Calendar tokens / re-auth OK | | | | |
| No staging WhatsApp / prod notifications | | | | |
| `pytest` on release branch | | | | |
| Frontend build | | | | |
| **Overall drill** | **BLOCKED** | `STAGING_MONGO_URL` missing — 2026-06-07 | 2026-06-07 | Engineering |

**Launch blocker:** Overall drill must be **Pass** with date and owner recorded before real users.

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

*Last updated: 2026-06-07 — live drill blocked pending `STAGING_MONGO_URL`; run at least once before real users; repeat after major schema changes.*
