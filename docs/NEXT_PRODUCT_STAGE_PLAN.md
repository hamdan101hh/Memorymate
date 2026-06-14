# Next product stage plan

**Status:** Planning · **Baseline:** `main` after restore drill merge · **Scope:** Product direction before the next implementation phase — **no code changes required in this document.**

**Principles:** No true 24/7 listening yet · Smart Capture Reminders stay check-ins only · Opt-in visible capture · Trusted-supporter language · No paid surveillance stack · Granola research-only later.

---

## 1. Do not add true 24/7 recording (this stage)

| Current (safe) | Not in this stage |
|----------------|-------------------|
| User-initiated Record Memory, Meeting Capture | Always-on microphone while app closed |
| Smart Day Capture while tab open (drafts, review-before-save) | Background OS-level recording |
| Smart Capture Reminders = **check-in prompts only** | Cloud STT running 24/7 |
| Voice guardrails + `CLOUD_TRANSCRIPTION_ENABLED=false` default | “Invisible” listening |

**Cost rule:** 24/7 cloud transcription is not affordable and is explicitly blocked in `docs/MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md`.

---

## 2. Smart Capture Reminders — check-ins only (keep)

**Smart Capture Reminders** remain:

- Opt-in check-in prompts (e.g. 24h cadence)
- **No microphone** from reminder flows
- **No auto-recording** or transcription from reminders
- Copy: reminders ask if you want to save a note — they do not listen

Evidence: `backend/smart_capture_reminders.py`, interaction smoke tests, `docs/DEPLOYMENT_READINESS_AUDIT.md`.

---

## 3. Rename future listening concept

Avoid marketing “always-on” or “24/7 listening” for the **next** capture mode.

**Preferred names (pick one in UI when built):**

| Name | Use when |
|------|----------|
| **Focus Capture** | Short, action-oriented — “capture this conversation or meeting with consent” |
| **Conversation Memory Mode** | Emphasizes memory support, not surveillance |

**Do not use as primary labels:** “always-on capture,” “24/7 listening,” “surveillance,” “monitoring.”

**Relationship to existing features:**

| Feature | Role |
|---------|------|
| Smart Day Capture | Day-wide drafts while app is open (existing) |
| Meeting / Conversation Capture | Session-based with review (existing) |
| **Focus Capture** (future) | Next opt-in mode — see §11 |
| Smart Capture Reminders | Check-ins only — not listening |

---

## 4. Adaptive onboarding (planned)

Replace one-size-fits-all onboarding with **mode selection** + gentle support questions. Backend may extend `memorymate_purpose` and add `support_profile` fields later.

### Onboarding paths (user chooses one)

| Mode | Intent | Default experience |
|------|--------|-------------------|
| **Private Executive Mode** | Busy professional, self-managed | Private notes, meetings, calendar, minimal supporter prompts |
| **Daily Memory Support Mode** | Extra day-to-day organization | Reminders, appointments, gentle check-ins, optional supporter later |
| **Trusted Supporter Mode** | Coordinating with someone who uses the app | Supporter dashboard emphasis; patient invites still consent-based |
| **Decide Later** | Low pressure | Minimal setup; full features discoverable in settings |

Maps loosely to current `memorymate_purpose` values (`self`, `busy_schedule`, `family_support`, etc.) — **implementation should unify UI labels with these four modes** while keeping API backward compatible.

### Gentle support-level questions (no clinical framing)

Ask in calm, optional steps — user can skip:

1. **Appointments:** “How often do you forget appointments or need a reminder?” (never / sometimes / often)
2. **Conversations:** “How often do you lose track of what was said in a conversation?” (never / sometimes / often)
3. **Check-ins:** “How often would you like MemoryMate to check in with a gentle prompt?” (rarely / sometimes / often)
4. **Privacy:** “Do you want to keep this private for now, or invite someone you trust?” (private / open to inviting later / ready to invite)

**Do not ask:** disability status, diagnosis, clinical screening, or “do you have dementia.”

---

## 5. Language and wording (product + onboarding)

| Avoid | Prefer |
|-------|--------|
| “disability” | daily memory support, extra organization |
| Forcing “caregiver” on users | **trusted supporter**, **support person**, family supporter |
| “Patient monitoring” | memory and reminder help |
| “Always watching” | consent-based capture, you control when it listens |

**Technical note:** Backend roles may remain `patient` / `caregiver` for compatibility; **user-facing copy** uses supported person / trusted supporter per `docs/PRODUCT_POSITIONING.md`.

---

## 6. Low support level → private-first UX

If answers skew **low** (rarely forget, rarely lose track, rare check-ins, keep private):

- Default **private** experience
- Highlight: reminders, meetings, notes, appointments, calendar (optional)
- **Do not** push supporter invite in onboarding
- Smart Capture Reminders: off or minimal until user opts in
- No Focus Capture prompts until user discovers settings

---

## 7. High support level → suggest supporter (never force)

If answers skew **high** (often forget, often lose track, wants regular check-ins, open to inviting):

- **Suggest** inviting a trusted supporter (Family Circle / link flow)
- Clear: “You can do this later” and “Decide Later” always available
- Never block app use without a linked supporter
- Supporter sees only what sharing rules allow — no automatic capture sharing

---

## 8. Granola — research only (later)

[Granola](https://www.granola.ai/) (or similar meeting-notes tools) may be researched as an **optional meeting-notes connector** in a future phase.

| Rule | Detail |
|------|--------|
| **Optional connector** | Import or link meeting notes after user approval |
| **Not core engine** | Do not use Granola (or any third party) as the 24/7 listening backbone |
| **No hidden integration** | User connects explicitly; review before save |
| **Paid / terms** | Founder approval + privacy review before any API partnership |

**Do not** depend on Granola for Focus Capture, Smart Day, or reminder check-ins.

---

## 9. Future Focus Capture — requirements (when built)

Focus Capture (or Conversation Memory Mode) must satisfy **all** of:

| Requirement | Detail |
|-------------|--------|
| **Opt-in** | User starts mode explicitly; no default-on |
| **Visible** | Clear on-screen state: listening / paused / stopped |
| **Pausable** | Pause and stop anytime; same class of control as Smart Day |
| **Time-limited** | Session bounds (e.g. meeting length cap); no indefinite hidden sessions |
| **Review-before-save** | Draft → user confirms before memory/reminder/appointment |
| **No hidden listening** | No mic when UI does not show active capture |
| **No automatic supporter sharing** | Supporter sees nothing until user saves and sharing rules apply |
| **Cloud transcription** | Only if `CLOUD_TRANSCRIPTION_ENABLED=true`, user confirms, and daily caps apply |

Align with: `docs/SMART_DAY_CAPTURE_LIMITATIONS.md`, `docs/VOICE_TRANSCRIPTION_COST_GUARDRAILS.md`.

---

## 10. Implementation phases (suggested)

| Phase | Deliverable | Out of scope |
|-------|-------------|--------------|
| **A — Docs + copy** | This plan, onboarding copy audit, positioning updates | New capture engine |
| **B — Adaptive onboarding UI** | Four modes + support questions + branching | Focus Capture mic pipeline |
| **C — Focus Capture MVP** | Opt-in session capture with §9 guardrails | 24/7 background |
| **D — Connectors research** | Granola / export connectors spec | Core listening |

---

## 11. Launch and safety gates (unchanged)

Before real users, existing gates still apply:

- `docs/PRODUCTION_ENV_AUDIT_CHECKLIST.md`
- `docs/MONGODB_RESTORE_DRILL_CHECKLIST.md` (drill Pass required)
- `ENABLE_DEMO=false`, image upload guard, WhatsApp not started
- No paid Google Cloud APIs beyond Calendar + OAuth

New features in this plan **must not** weaken voice guardrails or enable 24/7 cloud STT by default.

---

## Related documentation

| Doc | Relevance |
|-----|-----------|
| [PRODUCT_POSITIONING.md](./PRODUCT_POSITIONING.md) | Safe words, purpose values |
| [SMART_DAY_CAPTURE_LIMITATIONS.md](./SMART_DAY_CAPTURE_LIMITATIONS.md) | Open-tab capture limits |
| [VOICE_TRANSCRIPTION_COST_GUARDRAILS.md](./VOICE_TRANSCRIPTION_COST_GUARDRAILS.md) | Cloud STT caps |
| [PRODUCT_POSITIONING.md](./PRODUCT_POSITIONING.md) | Trusted supporter language |
| [MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md](./MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md) | No 24/7 cloud cost |
| [DEPLOYMENT_READINESS_AUDIT.md](./DEPLOYMENT_READINESS_AUDIT.md) | Smart Capture = reminders only |

---

*Last updated: 2026-06 — product planning; implementation tickets to be filed per phase.*
