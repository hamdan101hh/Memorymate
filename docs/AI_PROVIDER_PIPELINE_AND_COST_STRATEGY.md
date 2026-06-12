# AI Provider Pipeline & Cost Strategy

## Goal

Support speech, memory, and meeting capture **cheaply and safely** without a wasteful “API circle” (calling many providers for the same audio or transcript).

## Recommended pipeline

```
Browser speech (free) → transcript text
    ↓ (only if browser fails AND user confirms AND cloud enabled)
Cloud STT (ONE provider, capped minutes)
    ↓
Cheap LLM cleanup / extraction (ONE call)
    ↓ (only if confidence low AND premium enabled AND under budget)
Premium LLM fallback (ONE optional retry)
    ↓
User review
    ↓
Save memory / reminder / appointment (confirmation required)
```

Implemented in `backend/ai_pipeline.py`.

## Provider roles

### A. Browser Speech Recognition

- **Free first option** — client-side Web Speech API
- Good for simple notes; language support varies
- **No backend cost**
- Used in patient Record Memory “Speak” mode

### B. Cloud speech-to-text

- **Disabled by default** (`CLOUD_TRANSCRIPTION_ENABLED=false`)
- Requires **user confirmation** (`cloud_confirmed` on upload)
- Enforces **daily voice minute cap** (`DAILY_VOICE_MINUTES_CAP`)
- **Biggest cost risk** — never 24/7 cloud STT
- Single provider per request (`ai.transcribe_audio` only)

### C. Cheap LLM (DeepSeek-class / gpt-4o-mini)

- Configured via existing `CAPTURE_MODEL_*` env + `CHEAP_TEXT_AI_PROVIDER` label
- Transcript cleanup, memory extraction, reminder enhance, capture filter
- Default path when `TEXT_AI_PROVIDER` ≠ `rule_based` and API key present

### D. Premium fallback (Gemini / OpenAI / Claude primary)

- **Off by default** (`PREMIUM_FALLBACK_ENABLED=false`, `ALLOW_PREMIUM_RETRY=false`)
- Used only when confidence is **low** after cheap pass
- Multilingual / messy transcripts
- One retry max per request

### E. Granola

- **Do not use** as transcription backend unless official API/partnership terms allow
- Listed as **research/partnership only**
- **Not depended on** for MVP (`granola_dependency: none` in pipeline config)

## Confidence-based fallback

| Confidence | Action |
|--------------|--------|
| **high** | Return draft for review |
| **medium** | Ask user to review / add missing details |
| **low** | Ask clarification first; premium only if enabled |

Never automatically chain 3+ API calls.

## Caps (enforced in `usage.py` + pipeline)

| Cap | Default env |
|-----|-------------|
| Daily AI cost (USD) | `DAILY_AI_COST_CAP_USD=0.50` |
| Daily voice minutes | `DAILY_VOICE_MINUTES_CAP=5` |
| Daily AI actions | `MAX_AI_ACTIONS_PER_DAY=50` |
| Max single recording | `MAX_RECORDING_SECONDS=600` |
| Max meeting length | `MAX_MEETING_MINUTES=60` |

When voice cap exceeded:

> “You've reached today's voice limit. You can still type your memory.”

## Meeting capture flow

1. Visible **Start** / **Stop** / **Pause**
2. **Browser speech first** (transcript sent to `/capture/sessions/{id}/process`)
3. Cloud upload only if user confirms and cloud STT enabled
4. Cheap LLM filter + meeting summary (meeting mode)
5. Premium fallback only if enabled
6. **Review before save** — no raw audio by default
7. No attendance verification claims

## Multilingual

- Auto, English, Arabic, Urdu, Russian, Chinese (UI + browser locales)
- Browser speech when supported
- Type if unsupported
- Cloud STT only if enabled and under cap
- Cheap cleanup first; premium for messy text only if enabled

## API endpoints

| Endpoint | Pipeline |
|----------|----------|
| `GET /api/ai/pipeline-config` | Public flags (no secrets) |
| `POST /api/memories/transcribe` | `transcribe_audio_cost_safe` |
| `POST /api/memories/draft` | `extract_memory_fields` |
| `POST /api/reminders/enhance` | `extract_reminder_fields` |
| `POST /api/capture/sessions/{id}/process` | `process_meeting_transcript` |

## Safe defaults (no paid services auto-started)

- Cloud transcription: **off**
- Premium fallback: **off**
- Text AI: **rule_based** until keys configured
- WhatsApp Business API: **not started**
- Google Maps/Places paid APIs: **not used**
- Granola: **not integrated**

## What we do not do

- Hidden recording or surveillance
- Send audio to multiple STT providers
- Send transcript to multiple models without fallback rules
- Store raw audio by default
- Auto-save without user review
