# Multilingual Capture Plan

## Scope (current)

MemoryMate supports language selection for capture and speech input:

- Auto-detect (when browser supports it)
- English (`en-US`)
- Arabic (`ar`)
- Urdu (`ur-PK`)
- Russian (`ru-RU`)
- Chinese (`zh-CN`)

UI lives in Record Memory and Capture Settings. Preference is stored per patient in `audio_settings.capture_language`.

## No model training

We are **not** training custom speech or language models. Capture uses:

1. Browser Web Speech API when available (free, on-device/browser)
2. Existing server transcription for uploaded audio blobs (`/memories/transcribe`)
3. Existing LLM text processing for enhancement (`/memories/draft`)

## Browser speech limits

- Support varies by browser and OS.
- Some locales may not be available; UI shows: *"This browser may not support speech recognition for this language. You can still type your memory."*
- Users can always type memories manually.

## Future transcription providers

Additional providers (e.g. cloud STT) may be added later behind the same language selector. Principles:

- User opt-in and visible recording state
- Cost-control caps via existing AI usage limits
- No raw audio retained unless user explicitly saves

## Medical claims

MemoryMate does not diagnose memory problems or provide medical monitoring. Multilingual capture is for everyday memory notes only.

## Cost control

Language selection does not bypass daily AI usage caps. Draft/enhance and assistant calls respect `usage.assert_within_cap`.
