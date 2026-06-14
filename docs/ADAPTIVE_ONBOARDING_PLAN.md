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

## Recommendation logic

`recommendMode()` in `frontend/src/lib/onboardingConfig.js` (mirrored in `backend/onboarding_fields.py` for tests):

| Answers pattern | Recommended mode |
|-----------------|------------------|
| Privacy = trusted supporter OR goal = help someone | `trusted_supporter` |
| Goal = extra memory support | `daily_memory_support` |
| Privacy = decide later + (not sure OR low support score) | `decide_later` |
| Low support + productivity goal + private privacy | `private_executive` |
| Not sure + low support | `decide_later` |
| Default (higher support needs) | `daily_memory_support` |

User can always override on the recommendation step. High support may suggest Daily Memory Support with optional supporter — never forced.

## Smoke test (2026-06-07)

Branch `cursor/onboarding-smoke-polish` · `tools/smoke-onboarding.mjs` + `tools/test-onboarding-recommend.mjs`

| Path | Result | Notes |
|------|--------|-------|
| Private Executive (capture + private + low support) | Pass | Recommends `private_executive`; no forced supporter |
| Daily Memory Support (extra support + often check-ins) | Pass | Soft wording; no disability phrasing |
| Trusted Supporter (help someone + invite privacy) | Pass | Invite suggested; “never required” in copy |
| Decide Later (not sure + decide later + prefer not to say) | Pass | `decide_later` mode; “start private” message |

**Copy polish:** Step 3 body softened (removed “diagnosis” phrasing). Recommendation step shows “Suggested” badge and `onboarding-recommended-mode` test id.

**Logic fix:** Productivity goal + decide later + low support now recommends `decide_later` instead of incorrectly defaulting to daily memory support.

## Related

- [NEXT_PRODUCT_STAGE_PLAN.md](./NEXT_PRODUCT_STAGE_PLAN.md)
- [PRODUCT_POSITIONING.md](./PRODUCT_POSITIONING.md)
