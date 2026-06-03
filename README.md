# MemoryMate

An AI-assisted **memory-support app** for people with dementia, Alzheimer's, early memory
loss, and older adults — plus a **caregiver dashboard** for family and support people.

MemoryMate is **supportive, not diagnostic**. It does not diagnose, treat, cure, or replace
professional medical advice, emergency services, or clinical care. It helps people remember,
organize their day, and feel reassured, and helps caregivers stay informed.

## Features

- **Patient experience** — calm, large-button UI: record/type memories, daily summary,
  reminders, important people & places, an AI assistant grounded only on saved data, and a
  one-tap emergency contact.
- **Caregiver dashboard** — daily overview, reminders, medications, appointments, people,
  places, caregiver notes, alerts, missed reminders, memory timeline, and AI summaries.
- **Memory Capture & Meeting Mode** — consent-based, user-controlled capture sessions with
  visible status, pause/stop, Private Mode, and consent logging. **Raw audio is never stored
  by default** — only summaries, memory events, reminders, and action items.
- **AI Memory Filter** — splits a transcript into discrete, classified events (memory event /
  reminder / appointment / medication / person-place update), routes them into the existing
  domain tables, and sends uncertain or sensitive content to a **Privacy Review Queue**.
- **Roles & auth** — patient / caregiver / admin, JWT auth, server-side role enforcement.
- **Accessibility** — large-text and high-contrast modes.

## Tech stack

- **Backend:** FastAPI (Python), MongoDB (Motor), JWT auth (bcrypt + PyJWT).
- **Frontend:** React 19 (Create React App + CRACO), Tailwind CSS, shadcn/ui, React Router.
- **AI:** Anthropic Claude Sonnet 4.6 (via Emergent universal key, a direct Anthropic key,
  or OpenAI), with graceful fallbacks if no key is configured.

## Local development

### Prerequisites
- Python 3.11+
- Node 18+ and Yarn
- A running MongoDB (local `mongod`, Docker, or a MongoDB Atlas URI)

### 1. Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
cp .env.example .env          # then edit .env (set MONGO_URL, JWT_SECRET, and optionally an AI key)
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```
The API serves under `/api`. Health check: `GET http://localhost:8000/api/`.
On startup it creates indexes and seeds demo accounts + sample data (idempotent).

### 2. Frontend
```bash
cd frontend
yarn install
cp .env.example .env          # ensure REACT_APP_BACKEND_URL points at the backend
yarn start                    # http://localhost:3000
```

### Demo accounts (seeded)
Use the **Quick demo login** buttons on the login page (passwords stay server-side), or:
- Patient — `omar@memorymate.app` / `Patient123!`
- Caregiver — `sarah@memorymate.app` / `Caregiver123!`
- Admin — `admin@memorymate.app` / `admin123`

### Tests
```bash
cd backend && source .venv/bin/activate
REACT_APP_BACKEND_URL=http://localhost:8000 python -m pytest tests/ -q
```
AI-dependent tests skip automatically when no LLM key is configured.

## Deployment

1. **Database:** create a free MongoDB Atlas cluster and use its connection string as `MONGO_URL`.
2. **Backend:** deploy `backend/` to a Python host (Render, Railway, Fly.io, etc.). Set all
   env vars from `backend/.env.example`. Start command:
   `uvicorn server:app --host 0.0.0.0 --port $PORT`. Set `CORS_ORIGINS` to your frontend URL.
3. **Frontend:** `yarn build` and deploy the static `build/` folder (Vercel, Netlify, Render
   static, etc.). Set `REACT_APP_BACKEND_URL` to the deployed backend URL **at build time**.
4. **AI:** add one of `EMERGENT_LLM_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` to the backend.

## Security & privacy notes
- Secrets live only on the backend; the frontend bundle contains no API keys.
- Auth tokens are centralized in `frontend/src/lib/token.js` (localStorage, with expiry checks).
  For a hardened deployment, move to httpOnly + SameSite cookies + CSRF — it's a single-file change.
- Memory Capture is consent-based with consent logging; raw audio is not stored by default.
