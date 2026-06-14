# Browser smoke test checklist

Manual QA pass before launch or after large UI changes. Complements automated `pytest` and `yarn build` (see `docs/TECHNICAL_READINESS_CHECKLIST.md` §6).

**Last full pass:** 2026-06-15 · branch `cursor/finish-browser-smoke-pass` · Playwright script `tools/smoke-browser-pass.mjs` + local stack (`localhost:3000` + `localhost:8000`)

---

## Prerequisites

| Step | Command / action |
|------|------------------|
| Backend | `cd backend && uvicorn main:app --reload --port 8000` |
| Frontend | `cd frontend && yarn start` |
| Demo mode | `ENABLE_DEMO=true` in `backend/.env` (local only) |
| Health | `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/api/` → `200` |
| Clean session | Log out or use incognito before role-specific sections |
| Automated sweep | `npx -p playwright@1.52.0` temp install + `node tools/smoke-browser-pass.mjs` (from repo with frontend running) |
| Onboarding smoke | `node tools/test-onboarding-recommend.mjs` (no browser) · `node tools/smoke-onboarding.mjs` (needs stack + Playwright) |

---

## How to record results

Use: **Pass** · **Fail** · **Skip** · **N/A** · **N/T** (not tested this pass)

For failures, note: URL, role, expected vs actual, screenshot path.

---

## Fixes from smoke pass (2026-06-15)

| Fix | File(s) |
|-----|---------|
| Single sidebar in dashboard shell (no duplicate nav `data-testid`s; slide-in drawer on mobile) | `frontend/src/components/DashboardShell.js` |
| Unknown nested routes redirect to role home (e.g. `/caregiver/record` → `/caregiver`) | `frontend/src/App.js` |
| Repeatable route sweep script | `tools/smoke-browser-pass.mjs` |

---

## 1. Public (unauthenticated)

| Route | Check | 2026-06-15 |
|-------|-------|------------|
| `/` | Landing loads, CTA to login/signup | Pass |
| `/how-it-works` | Page loads | Pass |
| `/about` | Page loads | Pass |
| `/privacy` | Legal text visible | Pass |
| `/terms` | Legal text visible | Pass |
| `/consent` | Page loads | Pass |
| `/medical-disclaimer` | Page loads | Pass |
| `/data-deletion` | Form loads | Pass |
| `/safety` | Page loads | Pass |
| `/login` | Email/password + demo buttons (if demo on) | Pass |
| `/signup` | Form loads | Pass |
| Unknown path e.g. `/foo` | Redirects to `/` | Pass |

---

## 2. Auth & role guards

| Check | Expected | 2026-06-15 |
|-------|----------|------------|
| Demo **Patient (Omar)** | Lands on `/patient` | Pass |
| Demo **Caregiver (Sarah)** | Lands on `/caregiver` | Pass |
| Demo **Admin** | Lands on `/admin` | Pass |
| Patient opens `/caregiver/timeline` | Redirect to `/patient` | Pass |
| Caregiver opens `/patient` | Redirect to `/caregiver` | Pass |
| Admin opens `/patient` | Redirect to `/admin` | Pass |
| Log out | Returns to `/login` | Pass |

---

## 3. Patient (`/patient/*`)

Login as Patient (Omar). Each route should load its page (no blank screen, no redirect loop).

| Route | `data-testid` / heading | 2026-06-15 |
|-------|-------------------------|------------|
| `/patient` | `patient-home` | Pass |
| `/patient/record` | `record-memory-page` | Pass |
| `/patient/today` | “What's happening today?” | Pass |
| `/patient/reminders` | `patient-reminders-page` | Pass |
| `/patient/assistant` | `assistant-page` | Pass |
| `/patient/people` | `patient-people-page` | Pass |
| `/patient/places` | `patient-places-page` | Pass |
| `/patient/emergency` | Emergency heading | Pass |
| `/patient/settings` | `patient-settings-page` | Pass |
| `/patient/notifications` | `notification-settings-page` | Pass |
| `/patient/memory-book` | `patient-memorybook-page` | Pass |
| `/patient/share` | `share-export-page` | Pass |
| `/patient/capture` | `capture-start-page` | Pass |
| `/patient/meeting` | `capture-start-page` | Pass |
| `/patient/capture/review` | `privacy-review-page` | Pass |
| `/patient/capture/vault` | `privacy-vault-page` | Pass |
| `/patient/capture/settings` | `capture-settings-page` | Pass |
| `/patient/capture/smart-day-drafts` | `smart-day-drafts-page` | Pass |
| Unknown e.g. `/patient/foo` | Redirect to `/patient` | Pass (catch-all added) |

**Patient home tiles** — each link navigates correctly:

| Tile | Target | 2026-06-15 |
|------|--------|------------|
| Record a memory | `/patient/record` | Pass (route sweep) |
| Ask my assistant | `/patient/assistant` | Pass |
| What's happening today? | `/patient/today` | Pass |
| My reminders | `/patient/reminders` | Pass |
| Important people | `/patient/people` | Pass |
| My memory book | `/patient/memory-book` | Pass |
| Call for help | `/patient/emergency` | Pass |

**Smart Capture card** — buttons respond (no console errors):

| Action | 2026-06-15 |
|--------|------------|
| Capture now → `/patient/record` | Pass (route exists) |
| Review → `/patient/capture/review` | Pass |
| Focused capture / Capture settings links | Pass |
| Pause / Skip / Turn off (API toast) | Pass (see Final interaction pass) |

**Header:** Home (when not on home), Settings, Log out — Pass (visible on subpages).

---

## 4. Caregiver (`/caregiver/*`)

Login as Caregiver (Sarah). Sidebar nav: each item loads; active item highlighted.

| Route | Check | 2026-06-15 |
|-------|-------|------------|
| `/caregiver` | Dashboard, quick note, summary cards | Pass |
| `/caregiver/appointments` | Appointments list / filters | Pass |
| `/caregiver/appointments?filter=duplicates` | Duplicates filter + group open | Pass |
| `/caregiver/calendar` | `cg-calendar-page` | Pass |
| `/caregiver/reminders` | `cg-reminders-page` | Pass |
| `/caregiver/memory-book` | `cg-memorybook-page` | Pass |
| `/caregiver/people` | `cg-people-page` | Pass |
| `/caregiver/capture/review` | `privacy-review-page` | Pass |
| `/caregiver/settings` | `cg-settings-page` | Pass |
| `/caregiver/overview` | `patient-overview-page` | Pass |
| `/caregiver/timeline` | “Daily Timeline” | Pass |
| `/caregiver/medication` | `medication-page` | Pass |
| `/caregiver/places` | `cg-places-page` | Pass |
| `/caregiver/family` | `cg-family-page` | Pass |
| `/caregiver/capture` | `capture-start-page` | Pass |
| `/caregiver/capture/sessions` | `capture-sessions-page` | Pass |
| `/caregiver/alerts` | `alerts-page` | Pass |
| `/caregiver/notes` | `caregiver-notes-page` | Pass |
| `/caregiver/share` | `share-export-page` | Pass |
| `/caregiver/notifications` | `notification-settings-page` | Pass |
| `/caregiver/whatsapp` | `cg-whatsapp-page` | Pass |
| `/how-it-works` (from nav) | Leaves shell, public page loads | Pass (route `/how-it-works`) |
| Unknown e.g. `/caregiver/record` | Redirect to `/caregiver` | Pass (catch-all added) |

**Dashboard quick actions:**

| Action | Expected | 2026-06-15 |
|--------|----------|------------|
| Review duplicates (badge) | `/caregiver/appointments?filter=duplicates` | Pass |
| Create with AI | Appointments | Pass (same route) |
| View timeline → | Timeline | Pass |

**Sidebar nav (all items):** Pass (automated route sweep).

---

## 5. Admin (`/admin/*`)

Login as Admin.

| Route | Check | 2026-06-15 |
|-------|-------|------------|
| `/admin` | `admin-dashboard` | Pass |
| `/admin/users` | `admin-users-page` | Pass |
| `/admin/data` | `admin-data-page` | Pass |
| `/admin/logs` | `admin-logs-page` | Pass |
| Unknown e.g. `/admin/foo` | Redirect to `/admin` | Pass (catch-all added) |

---

## 6. Mobile layout (width &lt; 1024px, ~375px)

| Check | 2026-06-15 |
|-------|------------|
| Caregiver: hamburger opens drawer, nav closes on tap | Pass |
| Patient hamburger/menu | N/A — patient uses header Home button (no drawer) |
| Admin nav/menu | N/A — same shell as caregiver; desktop sidebar slides in on small screens |
| Patient home tiles stack, readable text | Pass |
| Record memory: form usable | Pass |
| Today Summary | Pass (route loads at 375px) |
| Timeline | Pass (via mobile menu nav) |
| Appointments | Pass (route sweep) |
| Reminders | Pass |
| Emergency page | Pass |
| Photo thumbnails | Pass (tap opens preview; see Final interaction pass) |
| Modal/dialog behavior | Pass (375px; see Final interaction pass) |
| No horizontal scroll on main content | Pass (375px sweep) |

---

## 7. Cross-cutting UI

| Check | 2026-06-15 |
|-------|------------|
| Notification permission prompt: Dismiss / Not now | Pass |
| Photo thumbnails on memories / timeline | Pass |
| Toast on save errors (network off) | Pass — quick note shows “Could not save note” |
| No unhandled errors in browser console on happy path | Pass — no app errors in Playwright happy-path sweep |
| Dev-only console noise | Harmless: React DevTools suggestion; manifest `start_url` warning in dev |

---

## 8. Known data / env limitations (not UI bugs)

- Demo DB may contain many duplicate appointment rows and memories from prior test runs — use “Archive duplicates” in Appointments or reset DB.
- WhatsApp page shows “not configured” until Cloud API keys are set (expected pre-launch).
- Push notifications require VAPID keys in production.

---

## Final interaction smoke pass (2026-06-15)

Branch `cursor/final-smoke-interaction-fixes` · Playwright `tools/smoke-interactions.mjs` at 375px width.

| Area | Result | Notes |
|------|--------|-------|
| Smart Capture — Turn on 24h | Pass | Toast + active meta updates |
| Smart Capture — Pause / Resume | Pass | Paused notice visible; no mic/recording |
| Smart Capture — Skip next / Skip today | Pass | Toast feedback |
| Smart Capture — Turn off | Pass | Returns to inactive state |
| No mic / recording / transcription from reminders | Pass | `getUserMedia` not called during control clicks |
| Photo thumbnail tap → preview | Pass | Today summary + timeline thumbs |
| Preview close (Escape) | Pass | Dialog dismisses |
| Multi-photo count badge | Pass | `+N` on thumbnails |
| Image load failure fallback | Pass | `image-load-failed` placeholder (no crash) |
| Record Memory photo picker at 375px | Pass | Picker visible; draft thumb opens preview modal |
| Dialog above mobile drawer | Pass | Dialog z-index raised to `z-[100]` |

**Bugs fixed in this pass:**

- `AuthenticatedImage` shows loading pulse + broken-image fallback instead of empty space
- `PhotoAttachmentPreview` tap-to-preview dialog for draft photos
- `SmartMemoryCaptureCard` paused-state notice
- Dialog overlay/content z-index for mobile over sidebar drawer

---

## 9. Sign-off

| Role | Name | Date | Pass? |
|------|------|------|-------|
| Engineering | | | |
| Founder / QA | | | |

---

**Last full pass:** 2026-06-07 · branch `cursor/onboarding-smoke-polish` · onboarding smoke + prior route sweep

---

## 10. Adaptive onboarding smoke (2026-06-07)

Branch `cursor/onboarding-smoke-polish` · `tools/smoke-onboarding.mjs` (Playwright) + `tools/test-onboarding-recommend.mjs` (Node unit).

| Path | Answers (summary) | Expected mode | Result |
|------|-------------------|---------------|--------|
| Private Executive | Capture meetings; private; rarely / rarely | `private_executive` | Pass |
| Daily Memory Support | Extra support; decide later; often / sometimes | `daily_memory_support` | Pass |
| Trusted Supporter | Help someone; invite supporter; often / often | `trusted_supporter` | Pass |
| Decide Later | Not sure; decide later; sometimes / prefer not to say | `decide_later` | Pass |

| Check | Result |
|-------|--------|
| No disability / dementia / surveillance wording in onboarding UI | Pass (automated phrase scan in pytest) |
| Supporter invite suggested, not forced | Pass |
| User can override recommended mode | Pass (mode picker on step 4) |
| Demo user onboarding reset via API before each path | Pass |
| Caregiver trusted-supporter hint (Family circle) | N/T (patient paths only in script) |

**N/T this pass:** Full finish flow through consent + emergency contact; patient home copy per mode after complete onboarding.

---

## Related docs

- `docs/TECHNICAL_READINESS_CHECKLIST.md` — launch gates and automated tests
- `docs/CLEANUP_NOTES.md` — cleaning duplicate test data
- `docs/CALENDAR_PRODUCTION_TODO.md` — calendar-specific QA
- `tools/smoke-browser-pass.mjs` — automated route sweep (requires Playwright)
- `tools/smoke-onboarding.mjs` — adaptive onboarding recommendation paths
- `tools/test-onboarding-recommend.mjs` — recommendation logic unit check (no browser)
- `tools/smoke-interactions.mjs` — Smart Capture, photo modals, mobile dialogs
