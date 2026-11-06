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

## Deploy for free (Render + Supabase)

Render's free plan wipes local files on every restart, so the live site stores data in a free Supabase database.

### 1) Supabase — the database
1. Sign up at https://supabase.com → **New project** (pick any region close to Egypt, e.g. Frankfurt).
2. Open **SQL Editor** → paste the contents of `supabase-setup.sql` → **Run**.
3. Go to **Project Settings → API Keys** and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **secret** key (`sb_secret_...`), or the legacy **service_role** key.
   ⚠️ Keep this key private. Never put it in the HTML or on GitHub.

### 2) GitHub — the code
Create a new repo and upload all the files in this folder.

### 3) Render — the server
1. Sign up at https://render.com with your GitHub account.
2. **New → Web Service** → choose the repo.
3. Language: **Node** · Build command: leave empty (or `npm install`) · Start command: `node server.js` · Instance type: **Free**.
4. **Environment Variables**:
   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_KEY` | your secret key |
   | `ADMIN_PASS` | your admin password |
5. **Deploy**. You get a link like `https://student-topics.onrender.com`; share it with the students.
   Admins use `https://student-topics.onrender.com/admin`.

### 4) Keep it awake (optional but recommended)
Render's free plan sleeps after 15 min with no visitors (the next visitor waits about 1 min), and Supabase's free plan pauses after a week with no activity.
Fix both with a free monitor at https://uptimerobot.com:
**New monitor → HTTP(s)** → URL `https://YOUR-APP.onrender.com/health` → every **5 minutes**.
`/health` touches the database too, so both stay awake.

---

## Settings (environment variables)
| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASS` | *(required — admin login is off without it)* |
| `SUPABASE_URL`, `SUPABASE_KEY` | not set → local file |
| `DATA_FILE` | `./data/submissions.json` |
