# Product Positioning

## What MemoryMate is

MemoryMate is a **daily-life memory, reminder, and support app**. It helps people:

- Remember and organize their day
- Track appointments, tasks, and follow-ups
- Capture important moments (with consent)
- Coordinate with family supporters and caregivers
- Review privacy before sharing

It can be used by **normal people**, **busy professionals**, **families**, **caregivers/supporters**, and anyone who wants **extra day-to-day support** or **simpler reminders**.

## What MemoryMate is not

- Not medical diagnosis, treatment, or prevention
- Not emergency response or 24/7 monitoring
- Not an “AI doctor” or clinical tool
- Not dementia or Alzheimer’s treatment
- Not guaranteed safety or surveillance

**Safety line (use in product):** MemoryMate is for daily-life organization and support. It is not medical advice, diagnosis, treatment, or emergency support.

## Safe words to use

- daily life support
- memory and reminder help
- organize appointments
- capture important moments
- help someone stay organized
- support family coordination
- busy schedule assistant
- extra support
- simple reminders
- private memory book
- family supporter / trusted supporter
- supported person (UI; backend may still use `patient` role)

## Words to avoid in marketing and onboarding

- medical treatment
- diagnosis
- dementia treatment
- Alzheimer’s treatment
- mental health treatment
- patient monitoring
- emergency response (as a promise)
- AI doctor
- clinical tool
- guaranteed safety
- prevents memory loss

## Onboarding purpose values

Stored on user as `memorymate_purpose` (current MVP). **Next stage:** adaptive onboarding with four paths — see `docs/NEXT_PRODUCT_STAGE_PLAN.md`:

| Planned mode | Maps to / replaces |
|--------------|-------------------|
| Private Executive Mode | `self`, `busy_schedule` |
| Daily Memory Support Mode | `extra_support` |
| Trusted Supporter Mode | `family_support`, `caregiver` (UI: trusted supporter) |
| Decide Later | `unsure` |

Current API values (backward compatible):

| Value | Meaning |
|-------|---------|
| `self` | Personal organization |
| `busy_schedule` | Meetings, tasks, priorities |
| `family_support` | Help a family member |
| `extra_support` | Extra day-to-day memory help |
| `caregiver` | Coordinate as supporter (UI: trusted supporter) |
| `unsure` | Start simple, customize later |

## Future capture naming

Do not market “24/7 listening.” Next opt-in session mode: **Focus Capture** or **Conversation Memory Mode** — requirements in `docs/NEXT_PRODUCT_STAGE_PLAN.md`. Granola and similar tools: optional meeting-notes connector research only — not the core listening engine.

**Adaptive onboarding** is implemented — see `docs/ADAPTIVE_ONBOARDING_PLAN.md`.

## Pricing / cost principle

- **Start simple. Connect only what you need.**
- No billing or paid tiers in MVP.
- Google Calendar is **optional** (OAuth when user chooses).
- AI should fall back without requiring paid AI where possible.
- WhatsApp Business API is **not** started in MVP.
- Free/local-friendly development path documented in transfer/setup docs.

## Legal pages (required, calm)

Privacy Policy, Terms, Consent/Recording, Medical Disclaimer, Data Deletion — kept visible, not scary.
