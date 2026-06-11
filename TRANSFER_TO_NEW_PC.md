# Transfer MemoryMate to a new PC

This guide assumes you received two artifacts from your old machine:

1. **`memorymate-code-transfer.zip`** — safe to copy via normal channels (no secrets).
2. **Private secrets backup** — `MEMORYMATE_SECRETS_BACKUP_PRIVATE.md` inside `memorymate-secrets-private-encrypted.zip` (or the markdown file alone). **Move privately** (USB, AirDrop, private folder). Do not send on WhatsApp or public cloud.

---

## 1. Unzip the code package

```bash
# macOS / Linux
unzip memorymate-code-transfer.zip -d memory-mate
cd memory-mate

# Windows (PowerShell)
Expand-Archive -Path memorymate-code-transfer.zip -DestinationPath memory-mate
cd memory-mate
```

---

## 2. Install backend dependencies

**macOS / Linux:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

## 3. Install frontend dependencies

```bash
cd ../frontend
yarn install
# or: npm install
```

---

## 4. Create backend `.env`

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and paste values from your **private secrets backup** (see `ENV_SETUP_EXAMPLE.md` for variable names).

Required for calendar on a new PC:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=http://localhost:8000/api/calendar/callback`
- `FRONTEND_URL=http://localhost:3000`
- `TOKEN_ENCRYPTION_KEY`
- `JWT_SECRET`
- `MONGO_URL` / `DB_NAME`

---

## 5. Create frontend `.env`

```bash
cp frontend/.env.example frontend/.env
```

Set:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

---

## 6. Google Calendar API

In [Google Cloud Console](https://console.cloud.google.com/):

1. Enable **Google Calendar API**.
2. OAuth client → Authorized redirect URI:
   `http://localhost:8000/api/calendar/callback`
3. Add your Google account as a **test user** if the consent screen is in Testing mode.

---

## 7. MongoDB

Local (default in `.env.example`):

```bash
# macOS with Homebrew
brew services start mongodb-community

# Or use MongoDB Atlas — set MONGO_URL to your Atlas URI in backend/.env
```

---

## 8. Run backend

```bash
cd backend
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

---

## 9. Run frontend

```bash
cd frontend
yarn start
# or: npm start
```

App: http://localhost:3000

---

## 10. Test login

1. Open http://localhost:3000
2. Use demo caregiver login (if `ENABLE_DEMO=true`) or your registered account.
3. Confirm dashboard loads.

---

## 11. Reconnect Google Calendar

1. Go to **Caregiver → Google Calendar**.
2. Click **Connect Google Calendar**.
3. Complete OAuth consent.
4. Try import suggestion or add appointment to Google (approval-gated).

---

## 12. Run tests

```bash
cd backend
source .venv/bin/activate
pytest
```

```bash
cd frontend
CI=false yarn build
```

---

## Decrypt secrets ZIP (if encrypted)

If you received `memorymate-secrets-private-encrypted.zip`:

1. Open `MEMORYMATE_SECRETS_ZIP_PASSWORD_PRIVATE.txt` on the **source machine only** (or the password you chose).
2. If the ZIP contains `memorymate-secrets-private.enc`:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in memorymate-secrets-private.enc \
  -out MEMORYMATE_SECRETS_BACKUP_PRIVATE.md
```

(Enter the password when prompted, or use `-pass pass:YOUR_PASSWORD` locally only.)

3. If the ZIP is a standard AES zip, extract with your zip tool using the password file.

---

## Troubleshooting

### Google OAuth redirect mismatch

- `GOOGLE_REDIRECT_URI` in `backend/.env` must **exactly** match Google Cloud Console.
- Local default: `http://localhost:8000/api/calendar/callback`
- No trailing slash mismatch; use `http` not `https` for local dev.

### Calendar API not enabled

- Error mentions `SERVICE_DISABLED` or API not enabled → enable Google Calendar API in GCP.

### TOKEN_ENCRYPTION_KEY missing

- Set `TOKEN_ENCRYPTION_KEY` in `backend/.env` (see `.env.example`).
- In production mode without this key, calendar connect is blocked.

### MongoDB not connected

- Check `MONGO_URL` and that MongoDB is running.
- `mongosh` or Atlas network access for cloud URIs.

### Frontend cannot reach backend

- Confirm `REACT_APP_BACKEND_URL=http://localhost:8000`
- Restart frontend after changing `.env`.
- Check CORS: `CORS_ORIGINS` must include `http://localhost:3000`.

### Port already in use

**macOS / Linux:**

```bash
lsof -i :8000
lsof -i :3000
```

**Windows:**

```powershell
netstat -ano | findstr :8000
```

Kill the process or change ports (`PORT=3001` in frontend `.env`).

### Windows vs Mac commands

| Task | macOS / Linux | Windows |
|------|----------------|---------|
| Activate venv | `source .venv/bin/activate` | `.\.venv\Scripts\Activate.ps1` |
| Run backend | `uvicorn main:app --reload --port 8000` | same |
| Run tests | `pytest` | `pytest` |

---

## Security reminders

- Never commit `backend/.env` or `frontend/.env`.
- Do not upload `MEMORYMATE_SECRETS_BACKUP_PRIVATE.md` to GitHub.
- WhatsApp Business API is **not** required for local development.
- Re-authorize Google Calendar on the new PC (OAuth tokens are machine-specific).
