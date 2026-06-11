# MemoryMate — Environment setup (placeholders only)

Copy values from your **private secrets backup** into real `.env` files on your PC.
**Do not commit** files that contain real secrets.

---

## Backend — `backend/.env`

```env
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=memorymate
JWT_SECRET=replace_with_long_random_string
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ADMIN_EMAIL=admin@memorymate.app
ADMIN_PASSWORD=replace_with_strong_password
ENABLE_DEMO=true

# AI — set ONE of:
EMERGENT_LLM_KEY=replace_or_leave_empty
# ANTHROPIC_API_KEY=replace_with_sk_ant_...
# OPENAI_API_KEY=replace_with_sk_...

# Google Calendar (optional but required for calendar features)
GOOGLE_CLIENT_ID=replace_with_google_client_id
GOOGLE_CLIENT_SECRET=replace_with_your_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/calendar/callback
FRONTEND_URL=http://localhost:3000
CAL_TIMEZONE=UTC
TOKEN_ENCRYPTION_KEY=replace_with_token_encryption_key

# Production hardening (optional for local dev)
# ENVIRONMENT=development
```

Generate secrets locally:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Frontend — `frontend/.env`

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

Optional dev server port:

```env
# PORT=3000
```

---

## Google Cloud Console checklist

1. Create OAuth **Web application** client.
2. Authorized redirect URI (local dev):
   `http://localhost:8000/api/calendar/callback`
3. Enable **Google Calendar API** for the project.
4. Add test users while the app is in "Testing" mode on the consent screen.

---

## WhatsApp Business API

**Not required** for local dev. Leave all `WHATSAPP_*` variables unset unless you explicitly enable that integration later.
