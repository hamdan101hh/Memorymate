# Focus Capture recording plan

**Status:** **MVP shipped** (manual sessions, metadata + typed notes) — no hidden listening, no 24/7 recording, no cloud transcription.

**Related:** [MEMORYMATE_COST_MODEL.md](./MEMORYMATE_COST_MODEL.md), [DEPLOYMENT_READINESS_AUDIT.md](./DEPLOYMENT_READINESS_AUDIT.md)

---

## MVP (2026) — what shipped

| Area | Status |
|------|--------|
| Manual start only | **Yes** — patient taps Start after consent checkbox |
| Visible active indicator | **Yes** — banner + timer while active/paused |
| Pause / resume / stop | **Yes** |
| Typed notes + optional local transcript field | **Yes** — not sent to cloud transcription |
| Audio persistence on server | **No** — mic used for on-device indicator only; no audio blobs stored |
| Cloud transcription | **No** — `CLOUD_TRANSCRIPTION_ENABLED` remains false |
| Paid APIs | **None** — `estimated_cost_usd` stays 0 in MVP |
| Photo attachments | **Yes** — via existing upload guard (`focus_capture` linked type) when uploads enabled |
| Save as memory | **Yes** — `skip_ai=True` (no paid AI on save) |
| Feature gate | `FOCUS_CAPTURE_ENABLED=false` globally; `admin_test` plan + per-user flag for staging |
| API routes | `/api/focus-capture/session/*` |
| Patient UI | `/patient/focus-capture` |

**Not in MVP:** silence detection, cloud transcription, audio upload, background mic, 24/7 recording, Granola-style always-on.

---

## Product rules

| Rule | Requirement |
|------|-------------|
| Start recording | **User manually starts** — tap/button, clear intent |
| Indicator | **Visible recording indicator** at all times while active |
| Consent | Clear consent before first use; easy to stop |
| Controls | Pause, stop, discard — always available |
| Hidden listening | **Never** |
| 24/7 background recording | **Never** in v1 |
| Background mic | **Not allowed** unless explicitly approved in a future phase with new consent |
| Granola-style always-on | **Out of scope** |

---

## Technical approach (phased)

### Phase 1 — Manual capture (current)

- Browser mic permission optional — indicator only; typed notes always available.
- `FOCUS_CAPTURE_ENABLED=false` globally until launch approval.
- Per-user feature flag in admin **Costs & Usage** dashboard (`admin_test` plan).
- Link photos to **active session** (`linked_type=focus_capture`).

### Phase 2 — Cost optimizations (later)

- **Silence detection** to pause encoding and skip empty audio (reduces storage and transcription).
- Session length caps (aligned with `voice_guardrails`).

### Phase 3 — Cloud transcription (optional, gated)

- Only if `CLOUD_TRANSCRIPTION_ENABLED=true` **and** user confirms per session or in settings.
- Quota check before upload (`cost_control` + `usage`).
- No upload without visible “cloud transcription” consent step.

---

## Session outcomes

After a Focus Capture session ends:

- Save as **memory** (user chooses Save as Memory).
- Attach **photos** to the same session when upload guard allows.
- No medical diagnosis or “you forgot” language in generated copy.

---

## Safety

- Smart Capture **reminders** remain text/check-in only — no mic, no transcription (existing guardrails).
- Voice guardrails and daily caps remain active.
- Admin can disable Focus Capture per user instantly.

---

*Last updated: 2026-06-07 — Focus Capture MVP (manual sessions, no cloud transcription).*
