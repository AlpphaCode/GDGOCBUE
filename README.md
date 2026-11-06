# Student Topics

Students submit their **name** and **topic**; admins see everything at `/admin`.
No npm packages — just Node.js 18+.

## Run locally
```bash
# Windows PowerShell
$env:ADMIN_PASS="your-password"; node server.js
# macOS / Linux
ADMIN_PASS=your-password node server.js
```
- Student page: http://localhost:3000/
- Admin panel: http://localhost:3000/admin
Locally, data is saved in `data/submissions.json`.

---

## Deploy for free (Vercel + Supabase, no credit card)

Serverless hosting can't keep local files, so the live site stores data in a free Supabase database.

### 1) Supabase — the database
1. Sign up at https://supabase.com → **New project**.
2. **SQL Editor** → paste `supabase-setup.sql` → **Run**.
3. **Project Settings → API Keys**: copy the **Project URL** (`https://xxxx.supabase.co`) and the **secret** key (`sb_secret_...`).
   ⚠️ Keep the secret key private. Never put it in the HTML or on GitHub.

### 2) Vercel — the hosting
1. Sign up at https://vercel.com with GitHub (Hobby plan, free).
2. **Add New → Project** → import this repo. Framework preset: **Other**. Leave build settings empty.
3. **Environment Variables**:
   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_KEY` | your secret key |
   | `ADMIN_PASS` | your admin password |
4. **Deploy**. You get a link like `https://gdgocbue.vercel.app`; share it with students.
   Admins use `https://gdgocbue.vercel.app/admin`.

### 3) Keep the database awake (recommended)
Supabase's free plan pauses a project after a week with no activity.
Add a free monitor at https://uptimerobot.com → **HTTP(s)** → `https://YOUR-APP.vercel.app/health` → every 5–30 minutes.

---

## Settings (environment variables)
| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASS` | *(required — admin login is off without it)* |
| `SUPABASE_URL`, `SUPABASE_KEY` | not set → local file |
| `DATA_FILE` | `./data/submissions.json` |
