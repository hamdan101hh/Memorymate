# Smart Capture Reminders

## What this is

Smart Capture Reminders is a **24-hour opt-in helper** that sends gentle check-ins asking if you want to capture a memory, note, or reminder. It is **not automatic recording**.

- User turns it on for 24 hours.
- MemoryMate schedules **capture reminders** only.
- **Nothing is recorded** unless the user taps Record, types a note, or starts a focused capture session.
- **No microphone** is started by this feature.
- **No hidden listening** or surveillance.
- **No 24-hour cloud transcription** — this avoids 24-hour cloud transcription costs.

## Schedule

Uses the patient’s timezone (from notification preferences offset).

| Day type | Check-in interval |
|----------|-------------------|
| Weekdays (Mon–Fri) | Every **5 hours** |
| Weekends (Sat–Sun) | Every **3 hours** |

## Quiet day

User can enable **Quiet day**:

- Reminders are reduced to **one evening check-in** (around 7:00 PM local).
- No frequent prompts during the day.

If the user skips **two reminders in a row**, MemoryMate asks whether to switch to quiet day.

## Skip controls

- **Skip next reminder** — pushes the next check-in forward.
- **Skip today** — no more reminders until the next local day.
- **Pause reminders** — temporarily pause check-ins.
- **Turn off** — ends the 24-hour mode immediately.

## Consent and privacy wording

UI uses:

- “Capture reminders” / “check-ins”
- “You choose what to save”
- “Nothing is recorded unless you tap record”
- “Pause anytime”

We avoid: auto recording, always listening, surveillance, 24/7 recording.

## Notifications

- Uses existing **Web Push** when configured (`capture_status_reminders` preference).
- Respects **quiet hours** in notification settings.
- If push is unavailable, check-ins appear **in-app** on the patient home card when due.
- Push notification TODO: none required beyond existing VAPID setup.

## Smart Day Capture (separate)

**Smart Day Capture** (browser speech drafts while the page is open) remains in Capture Settings for users who explicitly start it. It is **not** started by Smart Capture Reminders on the home card.

## Data retention

Reminder mode stores settings timestamps only — no raw audio. See `docs/DATA_RETENTION_PATIENT_FEATURES.md`.
