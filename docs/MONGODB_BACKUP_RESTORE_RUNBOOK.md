# MongoDB backup and restore runbook

**Purpose:** Operational guide for backing up and restoring MemoryMate data **before real users** and on an ongoing basis.

**Related:** `docs/DEPLOYMENT_READINESS_AUDIT.md`, `docs/TECHNICAL_READINESS_CHECKLIST.md`, `DEPLOY.md`

**This document contains no secrets** — no connection strings, passwords, or backup file contents.

---

## 1. Purpose

### Why backups matter before real users

MemoryMate stores personal health-adjacent notes, reminders, caregiver relationships, and optional calendar tokens. A database loss means users lose memories, reminders, appointments, and account access — not just “app downtime.”

Before inviting real users:

- **Backups must exist** (automated or manual with a defined owner and schedule).
- **Restore must be tested** — creating a dump without ever restoring it does not prove recovery works.

### What MemoryMate stores

Data lives in **MongoDB** (local `mongod` in dev, typically **MongoDB Atlas** in production). The API reads/writes via Motor (`backend/db.py`). File blobs (photo bytes) live on disk under `backend/uploads/` when enabled — **not** inside MongoDB. A MongoDB backup alone does not restore image files unless you also back up that directory or use future object storage.

### Why restore testing matters

Restore drills surface:

- Wrong `DB_NAME` or cluster target
- Partial restores missing collections
- Broken indexes or auth after restore
- Staging accidentally sending production push/WhatsApp traffic
- Encrypted Google OAuth tokens that cannot decrypt if `TOKEN_ENCRYPTION_KEY` differs between environments

Run restores into **staging or dev** first. Never overwrite production without explicit approval and a fresh pre-restore backup.

---

## 2. Collections and data categories

Collection names below are taken from application code (`backend/db.py`, routes, capture, notifications, calendar). **Verify in your live database** before relying on a partial export:

```bash
# Example — run against your cluster with credentials from env, not pasted into docs
mongosh "$MONGO_URL" --eval 'db.getCollectionNames()'
```

| Category | Collections (verify in code/DB) | Notes |
|----------|----------------------------------|-------|
| **Users & auth** | `users`, `patients`, `patient_caregiver_links`, `family_invites` | Includes password hashes — treat backups as highly sensitive |
| **Core patient content** | `memories`, `memory_book`, `reminders`, `appointments`, `medications` | Primary user-facing data |
| **People & places** | `important_people`, `important_places`, `caregiver_notes` | |
| **Capture & privacy** | `capture_sessions`, `memory_events`, `privacy_review_items`, `consent_logs`, `vault_settings`, `smart_day_drafts` | Smart Day, meeting capture, vault |
| **Chat** | `chat_messages` | Assistant history |
| **Alerts & support** | `alerts`, `support_requests` | |
| **Notifications** | `notification_prefs`, `push_subscriptions`, `notification_log` | Push endpoints and dedupe logs |
| **Google Calendar** | `calendar_links`, `calendar_activity`, `calendar_suggestion_state`, `appointment_dedup_state` | OAuth tokens encrypted at rest when `TOKEN_ENCRYPTION_KEY` is set |
| **Image metadata** | `memory_image_attachments` | File bytes are on disk (`backend/uploads/`) unless future object storage |
| **AI / voice usage** | `ai_usage`, `audio_settings` | Daily caps, voice minutes, Smart Day cloud usage |
| **WhatsApp (if ever enabled)** | `whatsapp_links` | **Not started in production** — env unset = disabled |
| **Audit / activity** | `activity_logs` | Admin activity trail |

If a collection appears in `db.getCollectionNames()` but not in this table, include it in full backups until you understand what it stores.

---

## 3. Backup options

Choose based on hosting and budget. **Do not add paid Atlas tiers or new services without founder approval.**

| Method | When to use | Notes |
|--------|-------------|-------|
| **MongoDB Atlas continuous backup / snapshots** | Production on Atlas **M10+** (paid) | Built-in point-in-time recovery; configure in Atlas UI |
| **Atlas M0 (free)** | Dev / small staging | **No** continuous backup on free tier — use manual `mongodump` or scheduled export |
| **`mongodump`** | Full logical backup | BSON under a directory; good for dev, staging, and M0 |
| **`mongoexport`** | Selected collections to JSON | Smaller exports for debugging; not a full DR substitute alone |
| **Atlas UI export** | Ad-hoc | Useful for one-off exports; follow Atlas docs for your cluster tier |

**Manual backup process (M0 / dev):** assign an owner, calendar frequency (e.g. weekly before launch, daily after), and secure storage location (encrypted volume, not public cloud drives).

---

## 4. Restore options

1. **Restore to staging or dev first** — never the first attempt on production.
2. **Never restore directly over production** without approval, incident record, and a **fresh backup of current production** taken immediately before restore.
3. Use **`mongorestore`** for `mongodump` output (see command templates below).
4. After restore, **verify counts** (users, patients, memories, reminders, appointments) against expectations.
5. **Test login and core flows** (see §9).

If restoring to staging:

- Point staging API at the restored cluster (`MONGO_URL` / `DB_NAME` in Render **staging** env only).
- Ensure `ENABLE_DEMO`, notification cron, WhatsApp, and push keys are **staging-safe** so restored data does not trigger real user notifications.

---

## 5. Before real users checklist

| Item | Owner | Status |
|------|-------|--------|
| Backups enabled (Atlas paid backup **or** approved manual `mongodump` process) | | |
| Restore tested into staging/dev | | |
| Backup owner assigned | | |
| Backup frequency decided (e.g. daily prod, weekly pre-launch) | | |
| Retention decided (e.g. 30 days rolling) | | |
| Encryption / access reviewed (who can read dumps) | | |
| Emergency restore steps documented (this runbook + incident template) | | |
| `TOKEN_ENCRYPTION_KEY` documented per environment (restore breaks calendar if key wrong) | | |
| Photo files on disk backed up separately if uploads enabled | | |
| **No secrets stored in docs or git** | | |

**Launch gate:** MongoDB backup/restore is a **launch blocker** until at least one successful restore drill is completed and recorded (date, owner, environment).

---

## 6. Command templates (placeholders only)

**Rules:**

- **Never paste a real MongoDB URI into docs, chat, email, or git.**
- Use shell environment variables (e.g. `MONGO_URL` from `backend/.env` locally — **do not commit `.env`**).
- **Do not commit backup files**, BSON dumps, or JSON exports.
- Run dumps from a trusted machine with least-privilege DB user (read + backup role).

### Set URI from env (local shell)

```bash
# Load from backend/.env manually or export in your shell — never commit the value
export MONGO_URL='<your-connection-string>'
export STAGING_MONGO_URL='<staging-connection-string>'
export BACKUP_DIR="./backups/$(date +%Y-%m-%d)-memorymate"
```

### Full backup (`mongodump`)

```bash
mongodump --uri "<MONGODB_URI>" --out ./backups/YYYY-MM-DD-memorymate
```

With env var (preferred):

```bash
mkdir -p "$BACKUP_DIR"
mongodump --uri "$MONGO_URL" --out "$BACKUP_DIR"
```

Optional: include database name if URI has no default DB:

```bash
mongodump --uri "$MONGO_URL" --db memorymate --out "$BACKUP_DIR"
```

### Full restore to staging (`mongorestore`)

**Warning:** overwrites data in the target database.

```bash
mongorestore --uri "<STAGING_MONGODB_URI>" ./backups/YYYY-MM-DD-memorymate
```

With drop (staging only, after explicit approval):

```bash
mongorestore --uri "$STAGING_MONGO_URL" --drop "$BACKUP_DIR/memorymate"
```

### Single collection export (`mongoexport`)

```bash
mongoexport --uri "<MONGODB_URI>" --collection <collection_name> --out <file>.json
```

Example pattern (collection name only — no secrets):

```bash
mongoexport --uri "$MONGO_URL" --db memorymate --collection memories --out ./exports/memories.mongoexport.json
```

### Quick verification after backup

```bash
mongosh "$MONGO_URL" --eval 'db.users.countDocuments()'
mongosh "$MONGO_URL" --eval 'db.memories.countDocuments()'
mongosh "$MONGO_URL" --eval 'db.reminders.countDocuments()'
mongosh "$MONGO_URL" --eval 'db.appointments.countDocuments()'
```

---

## 7. `.gitignore` and local backup hygiene

The repo ignores common backup output patterns (see root `.gitignore`):

- `/backups/`
- `*.dump`
- `*.bson`
- `*.archive`
- `*.mongoexport.json`

Keep dumps **outside the repo** or under `backups/` which is gitignored. Delete local dumps after verification if they are not needed for retention.

---

## 8. Security warnings

| Risk | Mitigation |
|------|------------|
| **MongoDB URI is a secret** | Store in Render/Vercel env or password manager; rotate if leaked |
| **Backups contain private user data** | Same classification as production DB |
| **Do not send backups in chat/email** | Use encrypted storage + access controls |
| **Limit access** | Only backup owner and on-call engineers |
| **Encrypt backup files** | e.g. `gpg` or encrypted disk/volume at rest |
| **Delete local backups when done** | Shred unneeded copies |
| **No public drives** | No Google Drive/Dropbox public links for dumps |
| **Calendar tokens** | Restored DB needs the same `TOKEN_ENCRYPTION_KEY` as when tokens were encrypted |

---

## 9. Restore verification checklist

After restore to **staging/dev**, complete:

- [ ] API starts (`GET /api/` → `{"status":"ok"}`)
- [ ] Login works (patient and caregiver test accounts)
- [ ] Patient dashboard loads
- [ ] Caregiver dashboard loads
- [ ] Memories, reminders, and appointments appear (spot-check counts vs backup source)
- [ ] Photo metadata does not crash the app (files may 404 if disk not restored — expected)
- [ ] Google Calendar: connect flow or existing link behaves safely (tokens may need re-auth if key mismatch)
- [ ] **No production notifications** from staging (separate VAPID, cron disabled, or staging-only keys)
- [ ] **No WhatsApp messages sent** (`WHATSAPP_*` unset on staging; cron not pointed at prod)
- [ ] Smart Capture / cron jobs reviewed — do not run production cron against staging DB with prod notification keys

Record results: date, environment, verifier, pass/fail notes.

---

## 10. Disaster recovery mini-plan

| Step | Action |
|------|--------|
| 1. **Decide** | Founder or designated on-call decides restore vs. partial repair |
| 2. **Communicate** | Pause marketing/signups if data integrity is unknown |
| 3. **Pause app if needed** | Render: suspend service or maintenance banner on frontend |
| 4. **Fresh backup** | If production still readable, take one more `mongodump` before any destructive step |
| 5. **Restore to staging** | `mongorestore` from last good Atlas snapshot or dump |
| 6. **Verify** | Complete §9 checklist on staging |
| 7. **Production restore** | Only with explicit approval; document incident (timeline, root cause, data loss window) |
| 8. **Post-incident** | Update this runbook; fix backup gap; schedule next drill |

**Incident log template (store outside git):**

- Incident ID / date
- Symptom (what users saw)
- Data loss window (if any)
- Backup used (timestamp, source)
- Restore target and approver
- Verification sign-off
- Follow-up actions

---

## Appendix: environment variables (names only)

| Variable | Role in backup/restore |
|----------|------------------------|
| `MONGO_URL` | Source/target connection string (**secret**) |
| `DB_NAME` | Database name (default `memorymate`) |
| `TOKEN_ENCRYPTION_KEY` | Must match for Google Calendar tokens after restore |
| `JWT_SECRET` | Users can still log in if unchanged; changing it invalidates existing sessions |
| `ENABLE_DEMO` | Set appropriately per environment after restore |
| `WHATSAPP_*` | Keep unset until WhatsApp is approved — prevents accidental sends |

---

*Last updated: 2026-06 — verify collection list against `backend/db.py` and live `db.getCollectionNames()` before each launch review.*
