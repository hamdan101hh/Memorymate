# Smart Day Capture — Limitations & Safety

## What Smart Day Capture is

Smart Day Capture keeps MemoryMate **ready while the app page is open**, uses **browser speech** when available, ignores short noise/silence where possible, and creates **drafts for review** — not saved memories automatically.

## Web limitations

- Works **while the page/tab is open** and active enough for the browser to run speech recognition.
- Browsers may **stop the microphone** when the tab sleeps, the phone locks, or the user switches apps.
- **True background capture** requires a **native mobile app** with explicit OS permissions (future work).
- Do not claim capture works when the browser/app is closed.

## Consent & visibility

- User must **start** Smart Day Capture and grant **microphone permission**.
- **Visible status** (listening, paused, detecting speech) is always shown.
- User can **pause or stop** anytime.
- **No hidden recording** or secret surveillance.

## Cost & cloud transcription

- **Browser speech is free** and is the default path — transcripts are sent as text only.
- **Cloud transcription is disabled by default** (`CLOUD_TRANSCRIPTION_ENABLED=false`).
- Cloud fallback (if enabled in settings) requires confirmation and is capped:
  - Default **15 minutes/day** cloud voice (`SMART_DAY_CLOUD_MINUTES_CAP`)
  - Max **60 seconds** per snippet
  - **No 24-hour audio upload**
- Raw audio is **not stored by default**.

## Drafts & retention

- Drafts expire after **24 hours** unless saved.
- User can delete individual drafts or clear all.
- Saving as memory, reminder, or appointment requires **explicit confirmation**.

## Recommended native app approach (future)

- On-device speech detection
- Local voice activity detection (VAD)
- Upload only **short, user-confirmed** snippets if cloud is needed
- Strong permissions, visible indicator, pause/stop, and privacy controls

## Not medical / not emergency

Smart Day Capture is for everyday memory support. It is **not** medical monitoring, diagnosis, or emergency detection.
