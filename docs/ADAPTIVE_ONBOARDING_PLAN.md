# Adaptive onboarding plan

**Status:** Implemented in onboarding flow (`frontend/src/pages/Onboarding.js`) and `PATCH /api/auth/onboarding`.

## Modes

| `memorymate_mode` | User-facing name | Focus |
|-------------------|------------------|--------|
| `private_executive` | Private Executive Mode | Private productivity — meetings, reminders, notes |
| `daily_memory_support` | Daily Memory Support Mode | Gentle check-ins, summaries, optional supporter later |
| `trusted_supporter` | Trusted Supporter Mode | Invite trusted supporter (never required) |
| `decide_later` | Decide Later | Default private; customize later |

Legacy `memorymate_purpose` is synced automatically for dashboard copy compatibility.

## Onboarding questions

1. **Main goal** — tasks, meetings, personal life, extra support, help someone, not sure
2. **Privacy** — private, trusted supporter, decide later
3. **Support level** — check-in frequency; forgetfulness frequency (with “prefer not to say”)
4. **Recommended mode** — user can override

## Safety wording

- Use: trusted supporter, support person, extra memory support, check-ins, private mode
- Avoid: disability, dementia diagnosis, Alzheimer’s treatment, forced caregiver, surveillance, 24/7 recording
- No diagnosis score or “disability level”

## Product rules (unchanged)

- No hidden listening
- No true 24/7 recording in this stage
- Smart Capture Reminders = check-ins only (no mic from reminders)
- Supporter invite is suggested, never forced
- Cloud transcription remains off by default

## API fields (users collection)

`memorymate_mode`, `main_goal`, `privacy_choice`, `check_in_frequency`, `forgetfulness_frequency`, `supporter_invite_preference`, `onboarding_completed`, `memorymate_purpose` (synced).

See `backend/onboarding_fields.py` for allowed values.

## Related

- [NEXT_PRODUCT_STAGE_PLAN.md](./NEXT_PRODUCT_STAGE_PLAN.md)
- [PRODUCT_POSITIONING.md](./PRODUCT_POSITIONING.md)
