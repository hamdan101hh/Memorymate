# Data Retention — Patient Features

## Temporary chat (Ask My Assistant)

- Chat messages expire after **24 hours** unless the user saves them.
- Saved answers are marked `saved: true` and kept; unsaved messages are filtered from display after expiry.
- User can **Clear chat now** to remove unsaved messages immediately.
- UI note: *"Chat clears after 24 hours unless you save something."*

## Today's summary

- Summary is scoped to **today only** (patient timezone when set).
- Refreshes daily at local midnight / new calendar day.
- User can **Save today's summary** to create a permanent memory entry.
- Old daily summaries do not clutter the main view.

## Temporary capture & audio

- Voice input and capture sessions use **temporary** audio/transcripts during processing.
- Temporary audio is **not permanently saved** unless converted into a saved memory after review.
- Smart Capture shows visible status (microphone on/off, paused, listening with permission).
- User can pause, stop, and delete recent temporary capture items.

## Meeting Capture

- Requires explicit **Start** and **Stop** (or pause).
- Notes are saved only after **review and confirmation**.
- Raw audio is not saved by default.

## Saved memories

- Memories saved after user confirmation are retained until the user or caregiver deletes them.
- Location is stored only when the user confirms adding location to a specific memory.

## User control

- Microphone and location are **opt-in** in Capture Settings.
- Private Mode stops processing and saving.
- Future: export and bulk delete (not yet implemented).

## What we do not do

- No hidden or background surveillance.
- No auto-sharing without review.
- No indefinite retention of raw audio by default.
