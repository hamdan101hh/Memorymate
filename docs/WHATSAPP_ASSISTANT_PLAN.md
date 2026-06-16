# WhatsApp assistant plan

**Status:** **Not implemented.** WhatsApp Business API is **not started.**

**Related:** [MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md](./MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md), [WHATSAPP setup in DEPLOY.md](../DEPLOY.md)

---

## Current state

- Backend webhook routes exist but **`WHATSAPP_*` env vars unset** = disabled.
- `WHATSAPP_ASSISTANT_ENABLED=false` by default.
- No production WhatsApp traffic.

---

## Before starting (founder approval required)

- [ ] Explicit product and budget approval
- [ ] Meta Business verification and template approval
- [ ] User consent flows designed and legally reviewed
- [ ] Caregiver/supporter consent where messages include third parties
- [ ] Usage caps and per-user quotas configured
- [ ] Admin kill switch tested (`WHATSAPP_ASSISTANT_ENABLED` + per-user flags)
- [ ] Global monthly budget cap in place

---

## Planned capabilities (later)

| Use | Notes |
|-----|--------|
| Reminders | Opt-in; template messages where required |
| Check-ins | Gentle prompts; no medical advice |
| Caregiver/supporter updates | Only with linked consent |
| Usage caps | Messages per user/month in `user_cost_profiles` |

---

## Safety rules

- **No medical advice** — assistant positioning only.
- **Not an emergency service** — emergency flows stay in-app (call contacts, etc.).
- **Message templates** — pre-approved content; no ad-hoc medical claims.
- **Budget cap** — hard stop when WhatsApp message quota or platform budget exceeded.
- **Admin kill switch** — env flag + per-user disable in Costs & Usage dashboard.

---

## Cost notes

- WhatsApp Cloud API is **per-message** pricing — high volume can exceed $1/user/month quickly.
- Manual API balance tracking in admin dashboard until auto top-up is explicitly approved (default: **off**).

---

*Last updated: 2026-06-15 — not started.*
