# MemoryMate cost model

**Purpose:** Target economics and cost-control strategy before premium features (recording, WhatsApp, photo summaries, monthly AI reports).

**No secrets in this document.**

**Related:** [MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md](./MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md), [SUBSCRIPTION_AND_REFUND_POLICY_PLAN.md](./SUBSCRIPTION_AND_REFUND_POLICY_PLAN.md)

---

## Target economics

| Metric | Target |
|--------|--------|
| Price | **$10/user/month** |
| 100 users revenue | **$1,000/month** |
| 100 users infra + API cost | **Under $100/month** at low usage |
| Gross margin (API/infra) | **~90%** before salaries, support, and other business expenses |
| Internal cost target per user | **Under $1/user/month** at typical low usage |

These are planning targets — actual costs depend on transcription minutes, WhatsApp volume, AI summaries, and image storage.

---

## Main cost risks

| Risk | Why it matters |
|------|----------------|
| **Transcription minutes** | Cloud STT is per-minute; long recordings add up fast |
| **WhatsApp message volume** | Per-message Meta pricing if Business API enabled |
| **AI monthly summaries** | End-of-month batch jobs over full user history |
| **Image storage** | Disk/object storage + egress if photos scale |
| **Premium model calls** | Sonnet-class models vs cheap tier |

---

## Cost control strategy (implemented / planned)

| Control | Status |
|---------|--------|
| Manual API top-ups only | **Default** — `AUTO_TOP_UP_ENABLED=false` |
| No automatic card charging | **Required** until billing product is ready |
| Per-user monthly quotas | `user_cost_profiles` + admin dashboard |
| Global monthly budget cap | Default **$100/month** (`GLOBAL_MONTHLY_BUDGET_USD`) |
| Feature flags per user | Focus capture, WhatsApp, summaries, paid AI — **off by default** |
| Cheap AI models first | Capture/summary tier before premium |
| Summarize in batches | Planned for monthly summary (not live) |
| Limit recording minutes | Voice guardrails + plan caps |
| Silence skipping | Planned later to reduce transcription cost |
| No paid OCR / image AI by default | Manual captions only until approved |
| Hard stop at quota | When `MONTHLY_USAGE_QUOTA_ENFORCED=true` (default off until production config) |

---

## Admin tooling

- **Costs & Usage** admin page — budget, spend, per-user quotas, feature toggles.
- **Manual top-up notes** — audit trail when founder adds API budget (no auto-recharge).
- **Paid env detection** — warns if WhatsApp/AI keys are set (names only, no values).

---

## What we are not doing yet

- Stripe or in-app payments
- WhatsApp Business API production traffic
- Cloud transcription providers (default off)
- Paid OCR or vision APIs
- Auto-recharge on API accounts

---

*Last updated: 2026-06-15 — foundation phase; no live paid APIs.*
