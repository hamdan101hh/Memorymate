# Voice & transcription cost guardrails

## Why this matters

Voice and cloud transcription are the **biggest cost risk** in MemoryMate. Always-on cloud speech-to-text (STT) can generate large bills quickly. MemoryMate is designed for **event-based capture**, not 24/7 cloud listening.

## Safe order of operations

1. **Typed text** — always available, $0
2. **Browser speech recognition** (Web Speech API) — free on the device when supported
3. **Cloud transcription** — **disabled by default**; only for explicit future fallback with caps and confirmation

## What is not allowed

- 24/7 cloud transcription
- Hidden listening or auto-recording from reminders
- Smart Capture Reminders starting the mic or uploading audio
- Google Speech-to-Text, AssemblyAI, Deepgram, or Rev without explicit product approval
- Paid OCR / image understanding (separate from voice — see photo attachments docs)

## Defaults (environment)

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLOUD_TRANSCRIPTION_ENABLED` | `false` | Block cloud STT unless explicitly enabled |
| `VOICE_COST_GUARDRAILS_ENABLED` | `true` | Enforce daily and per-recording limits |
| `REQUIRE_CONFIRMATION_FOR_CLOUD_TRANSCRIPTION` | `true` | User must confirm before cloud upload |
| `FREE_VOICE_MINUTES_PER_DAY` | `5` | Daily cap for `voice_plan=free` |
| `PLUS_VOICE_MINUTES_PER_DAY` | `30` | Daily cap for `voice_plan=plus` |
| `FAMILY_VOICE_MINUTES_PER_DAY` | `60` | Daily cap for `voice_plan=family` |
| `DEFAULT_VOICE_MINUTES_PER_DAY` | `15` | Default daily cap |
| `MAX_SINGLE_RECORDING_MINUTES` | `10` | Max length for a single memory recording |
| `MAX_MEETING_CAPTURE_MINUTES` | `60` | Max meeting/conversation capture session |
| `DAILY_VOICE_MINUTES_CAP` | `5` | Legacy alias; caps free tier |

Patient plan is read from `patients.voice_plan` (`free`, `plus`, `family`, or default).

## Daily usage tracking

Stored per patient per calendar day in `ai_usage`:

- `voice_minutes_recorded` — total voice minutes counted toward daily cap
- `cloud_transcription_minutes` — cloud STT only
- `browser_speech_sessions` — browser speech session count
- `cloud_transcription_attempts_blocked` — blocked cloud attempts when disabled
- `recording_limit_blocks` — hits on length or daily caps

Resets automatically each day.

## Backend helpers (`voice_guardrails.py`)

- `can_record_voice(patient_id, minutes, capture_type)`
- `can_use_cloud_transcription(patient_id, minutes, user_confirmed)`
- `record_voice_usage(patient_id, minutes, mode)`
- `POST /api/voice/usage` — record browser speech sessions (no cloud STT)

Friendly errors:

- “Voice limit reached for today. You can type the note instead.”
- “This recording is too long. Please keep single memories under 10 minutes.”
- “Cloud transcription is disabled in this environment.”
- “Smart Capture reminders only send check-ins. They do not record or transcribe.”

## Smart Capture Reminders

Reminder mode is **check-in only**:

- No microphone
- No transcription
- No audio upload
- Notification / in-app prompt only

## Future paid plans

Higher daily caps can map to `voice_plan` on the patient record. Cloud STT should remain opt-in with confirmation even on paid tiers until billing and monitoring are production-ready.

## Storage

Cloud transcription uses existing Whisper path in `ai.py` only when `CLOUD_TRANSCRIPTION_ENABLED=true` and keys are present. No separate paid STT vendors are integrated.
