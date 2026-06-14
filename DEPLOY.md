# Deploying MemoryMate

Architecture: **Frontend** (React) on Vercel · **Backend** (FastAPI) on Render · **Database** on MongoDB Atlas. All free-tier friendly.

> You need three free accounts: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register), [Render](https://render.com), [Vercel](https://vercel.com). Sign in to each with GitHub for the smoothest setup.

---

## 1. Database — MongoDB Atlas (free)

1. Create a free **M0** cluster.
2. **Database Access** → add a user (username + password). Save them.
3. **Network Access** → add IP `0.0.0.0/0` (allow from anywhere — Render's IPs are dynamic).
4. **Connect** → "Drivers" → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<user>`/`<password>` with the ones from step 2. This is your `MONGO_URL`.

## 2. Backend — Render

1. **New → Blueprint** → connect this GitHub repo. Render reads `render.yaml` and creates the `memorymate-api` web service.
2. When prompted (or under the service's **Environment**), set the values marked "sync: false":
   - `MONGO_URL` → the Atlas string from step 1
   - `EMERGENT_LLM_KEY` → your Emergent AI key (or set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` instead)
   - `CORS_ORIGINS` → leave as a placeholder for now (e.g. `*`); you'll set it in step 4
   - `JWT_SECRET` is auto-generated; `DB_NAME` defaults to `memorymate`.
3. Deploy. When it's live, copy the service URL, e.g. `https://memorymate-api.onrender.com`.
4. Health check: open `https://<your-api>.onrender.com/api/` → should return `{"status":"ok"}`.

> Render free tier sleeps after ~15 min idle; the first request then takes ~30s to wake.

## 3. Frontend — Vercel

1. **Add New → Project** → import this repo.
2. **Root Directory** → set to `frontend`.
3. **Environment Variables** → add:
   - `REACT_APP_BACKEND_URL` = your Render URL from step 2 (no trailing slash), e.g. `https://memorymate-api.onrender.com`
4. Deploy. Copy the resulting URL, e.g. `https://memorymate.vercel.app`. **This is your public website link.**

## 4. Connect CORS

1. Back in Render → `memorymate-api` → **Environment** → set:
   - `CORS_ORIGINS` = your Vercel URL, e.g. `https://memorymate.vercel.app` (comma-separate multiple)
2. Save → Render redeploys. Done.

## 5. Verify & secure

- Open the Vercel URL, sign in, and click through patient + caregiver.
- **Production demo mode (required):** set `ENABLE_DEMO=false` on Render before real users. When `true`, `/api/auth/demo-login` issues a session for any role **without a password** and seeds demo accounts. Local dev keeps `ENABLE_DEMO=true` in `backend/.env`.
- Set `CORS_ORIGINS` to your exact Vercel URL (not `*`).
- Set a strong `ADMIN_PASSWORD` (do not use the example default).
- **Photo uploads:** production defaults block uploads to ephemeral Render disk (`IMAGE_STORAGE_MODE=disabled`). Users can still save notes without photos. Enable local disk only for short-lived testing via `ALLOW_LOCAL_IMAGE_STORAGE_IN_PRODUCTION=true` — not for real users. Do not add Google Cloud Storage without approval.
- See `docs/DEPLOYMENT_READINESS_AUDIT.md` for the full pre-launch checklist.

---

## 6. WhatsApp bot (optional)

The bot saves inbound WhatsApp messages as memories and sends reminders/summaries.
It needs the backend deployed (steps 1–4) so Meta can reach the webhook.

1. In [Meta for Developers](https://developers.facebook.com): create an app → add **WhatsApp** → get a test number, `Phone number ID`, and an access token.
2. In Render, set: `WHATSAPP_VERIFY_TOKEN` (any string you choose), `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (and optionally `WHATSAPP_APP_SECRET`). Redeploy.
3. In Meta → WhatsApp → Configuration → **Webhook**:
   - Callback URL: `https://<your-api>.onrender.com/api/whatsapp/webhook`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
4. In the app (Caregiver → **WhatsApp Bot**) link the patient's/family numbers.
5. Proactive reminders need an **approved message template**; create one in Meta, then set `WHATSAPP_REMINDER_TEMPLATE` to its name. For automatic sends, point a scheduler (Render Cron Job or cron-job.org) at `POST /api/whatsapp/cron/due-reminders` with header `X-Cron-Secret: <CRON_SECRET>`.

> Note: free-form replies only work within 24h of the user messaging you — that's a Meta rule, which is why proactive reminders use templates.

## CLI alternative (optional)

```bash
# Frontend (from repo root)
npm i -g vercel
cd frontend && vercel --prod        # set REACT_APP_BACKEND_URL when prompted

# Backend: Render is easiest via the dashboard Blueprint (render.yaml).
# Or use the Render CLI / API with a RENDER_API_KEY.
```

## Local development

```bash
# Backend
cd backend && pip install -r requirements-dev.txt
uvicorn server:app --reload --port 8000   # needs a local mongod + backend/.env

# Frontend
cd frontend && yarn install && yarn start  # uses REACT_APP_BACKEND_URL from frontend/.env
```
