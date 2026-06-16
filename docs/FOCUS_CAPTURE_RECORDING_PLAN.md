# Focus Capture recording plan

**Status:** Planning — **not implemented.** No hidden listening, no 24/7 recording.

**Related:** [MEMORYMATE_COST_MODEL.md](./MEMORYMATE_COST_MODEL.md), [DEPLOYMENT_READINESS_AUDIT.md](./DEPLOYMENT_READINESS_AUDIT.md)

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

### Phase 1 — Manual capture (current direction)

- Browser / on-device speech where possible (no cloud cost).
- `FOCUS_CAPTURE_ENABLED=false` globally until ready.
- Per-user feature flag in admin cost dashboard.
- Link photos to **active session** only (metadata in MongoDB; files local/object storage when enabled).

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

- Save as **note / memory / meeting summary** (user chooses).
- Attach **photos** taken during session to same `capture_session_id`.
- No medical diagnosis or “you forgot” language in generated copy.

---

## Safety

- Smart Capture **reminders** remain text/check-in only — no mic, no transcription (existing guardrails).
- Voice guardrails and daily caps remain active.
- Admin can disable Focus Capture per user instantly.

---

*Last updated: 2026-06-15 — planning only.*
