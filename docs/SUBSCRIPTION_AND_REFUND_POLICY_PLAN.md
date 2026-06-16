# Subscription and refund policy plan

**Status:** Planning — **not live billing.** Requires adult/legal review before launch.

**Related:** [MEMORYMATE_COST_MODEL.md](./MEMORYMATE_COST_MODEL.md), [DEPLOYMENT_READINESS_AUDIT.md](./DEPLOYMENT_READINESS_AUDIT.md)

---

## Target pricing

| Item | Plan |
|------|------|
| Monthly price | **$10/month** per user (target) |
| Free trial | **3 days** — full product access within usage quotas |
| Cancellation | Clear, easy, no traps |
| Refunds | Via support email — case-by-case, fair process |

---

## Principles (no dark patterns)

- Users can cancel without calling support unless a specific legal exception applies.
- Cancellation flow must be **as easy as signup** (same account settings area).
- No hidden fees, surprise charges, or misleading “free” labels.
- No blocking cancellation behind chat bots or excessive steps.
- Optional **save offer** before final cancellation (e.g. pause, discount, feedback) — user can still cancel immediately.
- Do not use guilt, fear, or medical language in billing UX.
- Final policy text must be reviewed by a qualified adult/legal advisor before public launch.

---

## Planned user flows (pre-implementation)

### Signup / trial

1. User creates account.
2. Trial starts (`trialing` status, 3-day window in cost profile).
3. Usage quotas and feature flags apply during trial.
4. Before trial ends: email/in-app notice with price and cancel path.

### Subscribe (future — Stripe or similar)

- Not integrated yet.
- Payment only after explicit user confirmation.
- No automatic charges without stored payment method and consent.

### Cancel

1. Settings → Subscription → Cancel.
2. Optional save offer screen (skip allowed).
3. Confirm cancellation — service continues until period end or immediate per policy.
4. Confirmation email with end date and support contact.

### Refund requests

- Contact support email (see app support page).
- Team reviews within defined SLA (to be set at launch).
- Partial refunds possible for billing errors or exceptional cases — policy to be finalized legally.

---

## Technical hooks (current foundation)

- `user_cost_profiles` — plan, trial dates, subscription status, quotas.
- Admin cost dashboard — quotas and feature flags per user.
- **No Stripe/payment API** connected in this phase.

---

## Launch checklist (billing)

- [ ] Legal review of terms, privacy, and refund policy
- [ ] Stripe (or processor) in test mode only first
- [ ] Production `ENABLE_DEMO=false`
- [ ] Cancellation and refund paths documented on website
- [ ] Support email monitored

---

*Last updated: 2026-06-15 — planning only; no payment integration.*
