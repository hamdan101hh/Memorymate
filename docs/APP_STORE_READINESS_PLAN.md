# App Store Readiness Plan

Practical notes for turning MemoryMate’s web MVP into a store-ready app later.

## Already app-ready

- Responsive layouts on caregiver and patient pages (mobile nav, large tap targets on patient home).
- Patient home uses big buttons and calm wording.
- PWA basics: check `frontend/public/manifest.json` and service worker if present.
- Role-based API access (caregiver vs patient).
- Consent-gated memory capture and privacy review flow.
- AI appointment/event creation is approval-gated (draft does not write to DB).
- Google Calendar: read/import/add with confirmation; no edit/delete endpoints.
- No raw OAuth tokens exposed to the client.

## Before App Store submission

1. **Native shell** — Choose PWA (Capacitor / TWA) vs React Native/Expo. Web UI is structured for either; no native rewrite required yet.
2. **Push notifications** — Web push is partial; native apps need APNs (iOS) and FCM (Android) plus backend device token storage.
3. **Background capture** — OS limits background mic/camera; document that capture is user-initiated, not always-on surveillance.
4. **OAuth production** — Google Calendar OAuth needs verified app, production redirect URIs, and encrypted token storage (already planned in backend).
5. **Privacy labels** — App Store privacy questionnaire: memories, calendar, contacts, health-related scheduling (not diagnosis).
6. **Medical disclaimer** — Keep “not medical advice / not emergency support” in app and store listing.
7. **Data deletion** — Ensure in-app path to data deletion page and backend account deletion flow.
8. **Accessibility** — VoiceOver/TalkBack pass on patient flows (large text, focus order).
9. **Offline** — Define what works offline (view cached reminders) vs requires network.

## PWA vs native

| Approach | Pros | Cons |
|----------|------|------|
| PWA + Capacitor | Reuse current React app | Limited background APIs |
| React Native | Better native UX | Larger rewrite |

Recommendation: ship PWA/Capacitor first for MVP store presence; native only if capture/notifications need deeper OS integration.

## What not to claim medically

- Do not claim diagnosis, treatment, dementia cure, or guaranteed safety.
- Do not promise emergency monitoring or 24/7 surveillance.
- Use: memory support, reminders, caregiver coordination, consent-based capture, review before sharing.

## Google Calendar production

- Separate dev/prod OAuth clients.
- Store refresh tokens encrypted server-side.
- User must confirm before adding events or Meet links.
- No automatic writes from AI drafts.

## Push notification requirements

- User opt-in per platform.
- Clear categories: reminders, appointment soon, privacy review (not scary alert spam).
- Deep links to relevant in-app screens.

## Background limitations

- Memory capture should remain explicit start/stop with visible status.
- No “always recording” positioning in store materials.
