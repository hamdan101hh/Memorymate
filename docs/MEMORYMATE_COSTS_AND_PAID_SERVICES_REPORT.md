# MemoryMate — Costs & Paid Services Report

**For founders · Simple version · No secrets in this document**

> Current MemoryMate cost should be close to **$0 while testing locally**, as long as only free/local tools are used and paid APIs are not enabled.

| Quick facts | |
|-------------|---|
| **Current risk level** | **Low** (local/free tier) → **Medium** if real AI keys + cloud hosting → **High** if always-on cloud transcription or Google paid products |
| **Biggest cost danger** | Always-on transcription + accidental Google Cloud paid services |
| **Safest rule** | Do not enable paid services without approval |
| **Recommended monthly budget alert** | **$1** on Google Cloud (warning only, not a hard cap) |

---

## A. Simple Summary

MemoryMate is designed to run cheaply during testing:

- Local MongoDB = free
- No AI keys = AI features degrade gracefully (no crashes, no bills)
- Google Calendar = free for normal OAuth + Calendar API use (if configured)
- Maps = free deep links only (not paid Maps Platform)
- WhatsApp Business API = **not started** for production messaging
- WHOOP = **planning only**

**Turn on real API keys only when you understand the cost.**

---

## B. Services Currently Used or Planned

| Service | Used for | Status | Free or paid? | Cost risk | What triggers charges | How to control |
|---------|----------|--------|---------------|-----------|----------------------|----------------|
| **Google Cloud / Calendar API** | Import/read calendar, add events after approval | **Optional** — needs `GOOGLE_CLIENT_ID` + secret | Free tier for Calendar API at low volume | 🟡 Watch | Many API calls; enabling other GCP products | Only enable Calendar API; $1 budget alert |
| **Google OAuth** | Calendar connect login | Same as above | Free for normal auth | 🟢 Low | Misconfigured paid GCP services | OAuth client only; no extra APIs |
| **Google Meet (via Calendar)** | Meet link on calendar events | **Used if** calendar add includes conference | Free with Calendar event | 🟢 Low | N/A at normal scale | Same as Calendar |
| **Google Maps / Waze links** | “Open in Maps” deep links | **Used now** — free URLs only | **Free deep link only** | 🟢 Safe | Using Maps Platform / Places API (NOT in repo) | Keep deep links; never add Places API |
| **MongoDB** | All app data | **Used now** — `MONGO_URL` | Free M0 Atlas or local | 🟡 Watch | Cluster upgrade, storage growth | Stay on M0; monitor size |
| **Vercel** | Frontend hosting | **Planned** (`DEPLOY.md`) | Hobby free tier | 🟡 Watch | Pro plan, bandwidth, team | Hobby first |
| **Render** | Backend API hosting | **Planned** (`render.yaml` free plan) | Free tier sleeps when idle | 🟡 Watch | Paid plan, always-on, cron jobs | Free plan first |
| **AI text (Emergent / Anthropic / OpenAI)** | Memories draft, assistant, reminders, summaries | **Optional** — `EMERGENT_LLM_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` | **Paid per token** when key is real | 🟡–🔴 | Every AI enhance, chat, capture filter | `DAILY_AI_COST_CAP_USD` (default $0.50/patient/day) |
| **Speech-to-text (Whisper / OpenAI)** | `/memories/transcribe`, capture audio | **Optional** — needs `OPENAI_API_KEY` or Emergent key | **Paid per minute/audio** | 🔴 High if heavy | Voice record uploads, always-on capture | Cap minutes; prefer browser speech (free) |
| **Browser speech recognition** | Patient Record Memory “Speak” mode | **Used now** (client-side) | **Free** (browser) | 🟢 Low | N/A | Default for light voice input |
| **WhatsApp (Meta Cloud API)** | Bot links, webhook, reminders | **Code exists** — env vars optional | Paid per conversation in production | 🔴 if enabled | Setting tokens + sending messages | **Do not start** until approved |
| **WHOOP** | Wellness summaries | **Planning only** | Not integrated | 🟢 Disabled | Future API if any | `REACT_APP_WHOOP_CONNECTOR_ENABLED` not set |
| **Email / Gmail API** | — | **Not used** | — | 🟢 None | — | — |
| **File storage (S3, etc.)** | — | **Not used** — temp audio files | Local temp only | 🟢 Low | Adding cloud storage | Not implemented |
| **Web Push (VAPID)** | Reminder notifications | **Optional** — `VAPID_*` keys | Free (self-hosted push) | 🟢 Low | N/A | Optional; degrades if unset |
| **Emergent pip index** | Install `emergentintegrations` package | Build-time only | Unknown / partner | 🟢 Low | N/A | Required for cloud build |

**Legend:** 🟢 Safe / free · 🟡 Watch carefully · 🔴 High cost danger

---

## C. Google Cloud: What Can Charge Me?

### Safe (what MemoryMate actually needs)

- Google **Calendar API** for read / import / add (after user approval)
- Google **OAuth** client (Web application)
- **Google Meet** links created through Calendar events
- Normal use at startup scale is usually **$0**

### Danger (do NOT enable unless you know why)

| Product | Risk |
|---------|------|
| Compute Engine / VMs | Can run 24/7 and bill continuously |
| Cloud Run (paid scale) | Server costs if always on |
| BigQuery | Analytics warehouse — expensive at scale |
| Cloud Storage | Storage + egress fees |
| Vertex AI / Gemini | AI charges per token |
| **Maps Platform / Places API** | Per-request billing |
| Cloud SQL | Managed database bills |
| Kubernetes (GKE) | Cluster costs |
| Heavy logging/monitoring | Can add up if abused |

### Google Cloud checklist

**Should ONLY have:**

- [ ] Calendar API enabled
- [ ] OAuth client configured
- [ ] Budget alert set to **$1**

**Do NOT enable:**

- [ ] Gemini / Vertex AI
- [ ] Compute Engine
- [ ] BigQuery
- [ ] Cloud Run (unless you understand pricing)
- [ ] Cloud Storage
- [ ] Cloud SQL
- [ ] Kubernetes
- [ ] Google Maps Platform APIs
- [ ] Places API

> **Warning:** Budget alerts are **warnings**, not hard caps. Google can still charge above the alert unless you disable APIs or remove billing access.

---

## D. Estimated Cost Per User (Per Month)

| User type | AI text usage | Voice / transcription | Est. cost/user/month | Notes |
|-----------|---------------|----------------------|----------------------|-------|
| **Light** | Few enhances + chats | Rare voice, mostly typing | **$0.05 – $0.30** | Browser speech = free |
| **Normal** | Daily assistant + summaries | ~10 min voice/day | **$0.50 – $2.00** | Within default AI cap |
| **Heavy** | Many AI actions | ~30–60 min voice/day | **$3 – $10+** | May hit caps; watch transcription |
| **Dangerous always-on** | Capture filtering all day | Cloud STT 24/7 | **$100+/user/month risk** | **Not affordable** — cap hard |

**Rule:** Voice/transcription is the biggest variable. Text AI is usually cheap. **24/7 cloud recording is not affordable.**

---

## E. Example Calculations

### Example 1: Text AI

Small token jobs (appointment drafting, reminder cleanup, daily summary, assistant questions) are usually **fractions of a cent to a few cents** per action when using cheaper models (`gpt-4o-mini` / cheap tier).

MemoryMate already estimates cost in `usage.py` and defaults to **$0.50/patient/day cap** via `DAILY_AI_COST_CAP_USD`.

### Example 2: Voice transcription (placeholder math)

Using **$0.003 per minute** as an **example only** (replace with real provider price before launch):

| Minutes per day | Calculation | Est. / month |
|-----------------|-------------|--------------|
| 10 min/day | 10 × 30 × $0.003 | **$0.90** |
| 30 min/day | 30 × 30 × $0.003 | **$2.70** |
| 60 min/day | 60 × 30 × $0.003 | **$5.40** |
| 1440 min/day (24h) | 1440 × 30 × $0.003 | **$129.60** |

> Actual price depends on provider (OpenAI Whisper, etc.). **Replace with real pricing before launch.**

---

## F. Current Free-Safe Design Choices

- Google Maps / Waze = **free deep links**, not paid Maps APIs
- WHOOP = **planning-only**, no live integration
- WhatsApp Business API = **not started** for production
- Mic / location = **opt-in**, visible, pause/stop
- No hidden recording
- AI draft / enhance = **approval before save**
- Google Calendar = **no edit/delete** endpoints in code
- Chat clears after **24 hours** unless saved
- Daily summary **refreshes** each day
- Memory saving requires **confirmation**

---

## G. What You Need to Deposit Money Into

| Service | Deposit now? | When you'd need money | Recommended limit |
|---------|--------------|----------------------|-------------------|
| **Google Cloud** | No — avoid paid products | Paid GCP products or after free credits | $1 budget **alert** |
| **OpenAI / AI provider** | Only if using real AI key | Drafts, summaries, assistant | Start $5–$20 test credit + daily cap |
| **Transcription provider** | Only if using cloud STT | Voice upload / capture | Cap **minutes per user/day** |
| **MongoDB Atlas** | No on free M0 | Database grows past free tier | Free tier first |
| **Render** | No on free plan | Always-on backend / paid plan | Free plan first |
| **Vercel** | No on Hobby | Pro / team / high traffic | Hobby first |
| **WhatsApp Business API** | No — not started | Production messaging | **Do not start yet** |
| **WHOOP** | No — planning only | Official API later | Do not start until legal review |

---

## H. Hard Caps to Add in Code (Recommendations)

Already in repo:

- `DAILY_AI_COST_CAP_USD` per patient (default **$0.50**)
- Cheap model tier for high-volume capture (`CAPTURE_MODEL_PROVIDER` / `CAPTURE_MODEL_NAME`)

**Recommended additions:**

| Cap | Suggested values |
|-----|------------------|
| Max AI actions per user/day | Free: 5 · Plus: 50 · Family: 150 |
| Max transcription minutes/user/day | Free: 5 · Plus: 30 · Family: 60 |
| Max assistant messages/user/day | Align with AI cap |
| Max meeting capture minutes/day | e.g. 60 min |
| Admin usage dashboard | Show `est_cost` from `ai_usage` collection |
| Hard stop when budget exceeded | Already 429 on AI cap |
| Alert near limit | Email / in-app when 80% of cap |
| No auto-upgrade paid services | Manual approval only |

---

## I. Red Flag Checklist (Before Launch)

- [ ] Google Cloud budget alert = **$1**
- [ ] Only **Calendar API** enabled
- [ ] No Maps / Places API
- [ ] No Compute Engine VM
- [ ] No BigQuery
- [ ] No Cloud Run paid deployment (unless priced)
- [ ] No Vertex / Gemini paid use
- [ ] `.env` **not committed**
- [ ] API keys **not in frontend**
- [ ] AI provider has spending cap / prepaid limit
- [ ] Transcription has **minute cap**
- [ ] MongoDB on **free tier** (or known cost)
- [ ] Render free or **known** price
- [ ] Vercel free or **known** price
- [ ] WhatsApp Business API **not started**
- [ ] WHOOP **not live**
- [ ] No hidden recording
- [ ] User can pause/stop capture

---

## J. Final Recommendation

**Best current setup:** Keep local/free testing, use Google Calendar only (if needed), keep WhatsApp and WHOOP disabled, cap AI and transcription, and **do not enable any Google paid services without approval.**

---

## Environment Variables (Names Only — Never Commit Values)

### Backend (`backend/.env.example`)

`MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ENABLE_DEMO`, `EMERGENT_LLM_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MODEL_NAME`, `CAPTURE_MODEL_PROVIDER`, `CAPTURE_MODEL_NAME`, `DAILY_AI_COST_CAP_USD`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_REMINDER_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ENVIRONMENT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `CAL_TIMEZONE`, `TOKEN_ENCRYPTION_KEY`

### Frontend (`frontend/.env.example`)

`REACT_APP_BACKEND_URL`, `PORT` (optional)

### Frontend optional

`REACT_APP_WHOOP_CONNECTOR_ENABLED` (planning flag)

---

*Generated from MemoryMate repository inspection. No API keys, secrets, or `.env` values are included in this document.*
