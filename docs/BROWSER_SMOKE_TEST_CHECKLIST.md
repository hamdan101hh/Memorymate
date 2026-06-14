# Browser smoke test checklist

Manual QA pass before launch or after large UI changes. Complements automated `pytest` and `yarn build` (see `docs/TECHNICAL_READINESS_CHECKLIST.md` §6).

**Last full pass:** 2026-06-14 · branch `cursor/browser-smoke-test-fixes` · local stack (`localhost:3000` + `localhost:8000`)

---

## Prerequisites

| Step | Command / action |
|------|------------------|
| Backend | `cd backend && uvicorn main:app --reload --port 8000` |
| Frontend | `cd frontend && yarn start` |
| Demo mode | `ENABLE_DEMO=true` in `backend/.env` (local only) |
| Health | `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/api/` → `200` |
| Clean session | Log out or use incognito before role-specific sections |

---

## How to record results

Use: **Pass** · **Fail** · **Skip** · **N/T** (not tested this pass)

For failures, note: URL, role, expected vs actual, screenshot path.

---

## 1. Public (unauthenticated)

| Route | Check | 2026-06-14 |
|-------|-------|------------|
| `/` | Landing loads, CTA to login/signup | N/T |
| `/how-it-works` | Page loads | N/T |
| `/about` | Page loads | N/T |
| `/privacy` | Legal text visible | N/T |
| `/terms` | Legal text visible | N/T |
| `/consent` | Page loads | N/T |
| `/medical-disclaimer` | Page loads | N/T |
| `/data-deletion` | Page loads | N/T |
| `/safety` | Page loads | N/T |
| `/login` | Email/password + demo buttons (if demo on) | Pass |
| `/signup` | Form loads | N/T |
| Unknown path e.g. `/foo` | Redirects to `/` | N/T |

---

## 2. Auth & role guards

| Check | Expected | 2026-06-14 |
|-------|----------|------------|
| Demo **Patient (Omar)** | Lands on `/patient` | Pass |
| Demo **Caregiver (Sarah)** | Lands on `/caregiver` | Pass |
| Demo **Admin** | Lands on `/admin` | N/T |
| Patient opens `/caregiver/timeline` | Redirect to `/patient` | Pass |
| Caregiver opens `/patient` | Redirect to `/caregiver` | N/T |
| Log out | Returns to `/login` | Pass |

---

## 3. Patient (`/patient/*`)

Login as Patient (Omar). Each route should load its page (no blank screen, no redirect loop).

| Route | `data-testid` / heading | 2026-06-14 |
|-------|-------------------------|------------|
| `/patient` | `patient-home` | Pass |
| `/patient/record` | Record memory form, photo picker, voice note | Pass |
| `/patient/today` | “What's happening today?” | Pass |
| `/patient/reminders` | Reminders list / empty state | N/T |
| `/patient/assistant` | Assistant chat | N/T |
| `/patient/people` | People list | N/T |
| `/patient/places` | Places list | N/T |
| `/patient/emergency` | Emergency / call for help | Pass |
| `/patient/settings` | `patient-settings-page` | N/T |
| `/patient/notifications` | Notification toggles | N/T |
| `/patient/memory-book` | Memory book | N/T |
| `/patient/share` | Share & export | N/T |
| `/patient/capture` | `capture-start-page` | N/T |
| `/patient/meeting` | Meeting capture start | N/T |
| `/patient/capture/review` | Privacy review | N/T |
| `/patient/capture/vault` | Private vault | N/T |
| `/patient/capture/settings` | Capture settings | N/T |
| `/patient/capture/smart-day-drafts` | Smart day drafts | N/T |

**Patient home tiles** — each link navigates correctly:

| Tile | Target | 2026-06-14 |
|------|--------|------------|
| Record a memory | `/patient/record` | N/T |
| Ask my assistant | `/patient/assistant` | N/T |
| What's happening today? | `/patient/today` | N/T |
| My reminders | `/patient/reminders` | N/T |
| Important people | `/patient/people` | N/T |
| My memory book | `/patient/memory-book` | N/T |
| Call for help | `/patient/emergency` | N/T |

**Smart Capture card** — buttons respond (no console errors):

| Action | 2026-06-14 |
|--------|------------|
| Capture now → `/patient/record` | N/T |
| Review → `/patient/capture/review` | N/T |
| Focused capture / Capture settings links | Visible on home | Pass |
| Pause / Skip / Turn off (API toast) | N/T |

**Header:** Home (when not on home), Settings, Log out.

---

## 4. Caregiver (`/caregiver/*`)

Login as Caregiver (Sarah). Sidebar nav: each item loads; active item highlighted.

| Route | Check | 2026-06-14 |
|-------|-------|------------|
| `/caregiver` | Dashboard, quick note, summary cards | Pass |
| `/caregiver/appointments` | Appointments list / filters | N/T |
| `/caregiver/appointments?filter=duplicates` | Duplicates filter + group open | Pass |
| `/caregiver/calendar` | Calendar connector | N/T |
| `/caregiver/reminders` | Reminders | N/T |
| `/caregiver/memory-book` | Memory book | N/T |
| `/caregiver/people` | People | N/T |
| `/caregiver/capture/review` | Privacy review | N/T |
| `/caregiver/settings` | Settings | N/T |
| `/caregiver/overview` | Supported person | N/T |
| `/caregiver/timeline` | “Daily Timeline” (no stale dashboard flash) | Pass |
| `/caregiver/medication` | Medication | N/T |
| `/caregiver/places` | Places | N/T |
| `/caregiver/family` | Family circle | N/T |
| `/caregiver/capture` | Capture start | N/T |
| `/caregiver/capture/sessions` | Session list | N/T |
| `/caregiver/alerts` | Alerts | N/T |
| `/caregiver/notes` | Caregiver notes | N/T |
| `/caregiver/share` | Share & export | N/T |
| `/caregiver/notifications` | Notifications | N/T |
| `/caregiver/whatsapp` | “WhatsApp Bot”, not-configured message | Pass |
| `/how-it-works` (from nav) | Leaves shell, public page loads | N/T |

**Dashboard quick actions:**

| Action | Expected | 2026-06-14 |
|--------|----------|------------|
| Review duplicates (badge) | `/caregiver/appointments?filter=duplicates` | Pass |
| Create with AI | Appointments | N/T |
| View timeline → | Timeline | N/T |

---

## 5. Admin (`/admin/*`)

Login as Admin.

| Route | Check | 2026-06-14 |
|-------|-------|------------|
| `/admin` | Dashboard | N/T |
| `/admin/users` | Users table | N/T |
| `/admin/data` | Collections | N/T |
| `/admin/logs` | Activity logs | N/T |

---

## 6. Mobile layout (width &lt; 1024px)

| Check | 2026-06-14 |
|-------|------------|
| Caregiver: hamburger opens drawer, nav closes on tap | N/T |
| Patient home tiles stack, readable text | N/T |
| Record memory: form usable | N/T |
| No horizontal scroll on main content | N/T |

---

## 7. Cross-cutting UI

| Check | 2026-06-14 |
|-------|------------|
| Notification permission prompt: Dismiss / Not now | Visible on dashboards | Pass |
| Photo thumbnails on memories / timeline | Visible in demo data | Pass |
| Toast on save errors (network off) | N/T |
| No unhandled errors in browser console on happy path | N/T |

---

## 8. Known data / env limitations (not UI bugs)

- Demo DB may contain many duplicate appointment rows and memories from prior test runs — use “Archive duplicates” in Appointments or reset DB.
- WhatsApp page shows “not configured” until Cloud API keys are set (expected pre-launch).
- Push notifications require VAPID keys in production.

---

## 9. Sign-off

| Role | Name | Date | Pass? |
|------|------|------|-------|
| Engineering | | | |
| Founder / QA | | | |

---

## Related docs

- `docs/TECHNICAL_READINESS_CHECKLIST.md` — launch gates and automated tests
- `docs/CLEANUP_NOTES.md` — cleaning duplicate test data
- `docs/CALENDAR_PRODUCTION_TODO.md` — calendar-specific QA
