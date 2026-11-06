// Student Topics — zero-dependency Node.js server
// Run: node server.js   (then open http://localhost:3000)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || ""; // set ADMIN_PASS in the environment (never commit it)
if (!ADMIN_PASS) console.warn("WARNING: ADMIN_PASS is not set — admin login is disabled.");
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "submissions.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_TTL = 1000 * 60 * 60 * 8; // 8 hours

// ---------- storage ----------
// If SUPABASE_URL + SUPABASE_KEY are set → data lives in Supabase (survives restarts, good for free hosting).
// Otherwise → local JSON file (good for testing on your PC).
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const USE_DB = Boolean(SUPABASE_URL && SUPABASE_KEY);

function sb(pathAndQuery, opts = {}) {
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) };
  if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + SUPABASE_KEY; // legacy JWT keys
  return fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { ...opts, headers }).then(async (r) => {
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    return r.status === 204 ? null : r.json().catch(() => null);
  });
}

let fileData = [];
if (!USE_DB) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  try { fileData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { fileData = []; }
}
function saveFile() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(fileData, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

const store = {
  async add(name, topic) {
    if (USE_DB) return sb("submissions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name, topic }) });
    fileData.push({ id: crypto.randomUUID(), name, topic, createdAt: new Date().toISOString() });
    saveFile();
  },
  async list() { // newest first
    if (USE_DB) {
      const rows = await sb("submissions?select=id,name,topic,created_at&order=created_at.desc");
      return rows.map((r) => ({ id: r.id, name: r.name, topic: r.topic, createdAt: r.created_at }));
    }
    return [...fileData].reverse();
  },
  async remove(id) { // returns true if deleted
    if (USE_DB) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
      const rows = await sb(`submissions?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
      return rows.length > 0;
    }
    const before = fileData.length;
    fileData = fileData.filter((s) => s.id !== id);
    if (fileData.length === before) return false;
    saveFile();
    return true;
  },
  async ping() {
    if (USE_DB) await sb("submissions?select=id&limit=1");
  },
};

// ---------- sessions & rate limiting ----------
const sessions = new Map(); // token -> expiry
const loginAttempts = new Map(); // ip -> {count, until}
const submitHits = new Map(); // ip -> [timestamps]

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function getCookie(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function isAuthed(req) {
  const t = getCookie(req, "sid");
  if (!t || !sessions.has(t)) return false;
  if (sessions.get(t) < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    ...headers,
  });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", ...headers });
}
function readBody(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) { reject(new Error("too large")); req.destroy(); }
    });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { reject(new Error("bad json")); } });
  });
}
const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serveStatic(res, file) {
  const p = path.join(PUBLIC_DIR, file);
  if (!p.startsWith(PUBLIC_DIR)) return send(res, 404, "Not found");
  fs.readFile(p, (err, buf) => {
    if (err) return send(res, 404, "Not found");
    send(res, 200, buf, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
  });
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const route = req.method + " " + url.pathname;

  try {
    // Student submission
    if (route === "POST /api/submit") {
      const ip = clientIp(req);
      const now = Date.now();
      const hits = (submitHits.get(ip) || []).filter((t) => now - t < 60_000);
      if (hits.length >= 10) return json(res, 429, { error: "Too many submissions. Please wait a minute." });
      hits.push(now); submitHits.set(ip, hits);

      const body = await readBody(req);
      const name = clean(body.name, 100);
      const topic = clean(body.topic, 300);
      if (name.length < 2) return json(res, 400, { error: "Please enter your full name." });
      if (topic.length < 2) return json(res, 400, { error: "Please enter a topic." });

      await store.add(name, topic);
      return json(res, 201, { ok: true });
    }

    // Admin login
    if (route === "POST /api/login") {
      const ip = clientIp(req);
      const a = loginAttempts.get(ip) || { count: 0, until: 0 };
      if (a.until > Date.now()) return json(res, 429, { error: "Too many attempts. Try again in a few minutes." });

      const body = await readBody(req);
      if (!ADMIN_PASS) return json(res, 503, { error: "Admin password is not configured on the server." });
      const ok = safeEqual(body.username || "", ADMIN_USER) & safeEqual(body.password || "", ADMIN_PASS);
      if (!ok) {
        a.count++;
        if (a.count >= 5) { a.until = Date.now() + 5 * 60_000; a.count = 0; }
        loginAttempts.set(ip, a);
        return json(res, 401, { error: "Wrong username or password." });
      }
      loginAttempts.delete(ip);
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, Date.now() + SESSION_TTL);
      const secure = (req.headers["x-forwarded-proto"] === "https") ? "; Secure" : "";
      return json(res, 200, { ok: true }, {
        "Set-Cookie": `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`,
      });
    }

    if (route === "POST /api/logout") {
      const t = getCookie(req, "sid");
      if (t) sessions.delete(t);
      return json(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
    }

    // Admin-only API
    if (url.pathname.startsWith("/api/admin")) {
      if (!isAuthed(req)) return json(res, 401, { error: "Not logged in." });

      if (route === "GET /api/admin/submissions") {
        return json(res, 200, await store.list());
      }
      if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/submissions/")) {
        const id = decodeURIComponent(url.pathname.split("/").pop());
        if (!(await store.remove(id))) return json(res, 404, { error: "Not found." });
        return json(res, 200, { ok: true });
      }
      if (route === "GET /api/admin/export.csv") {
        const esc = (v) => {
          let s = String(v);
          if (/^[=+\-@]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
          return '"' + s.replace(/"/g, '""') + '"';
        };
        const list = (await store.list()).reverse();
        const rows = [["Name", "Topic", "Submitted at"], ...list.map((s) => [s.name, s.topic, s.createdAt])];
        const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
        return send(res, 200, csv, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="submissions.csv"',
        });
      }
      return json(res, 404, { error: "Not found." });
    }

    // Health check — point a free uptime pinger here to keep the server AND the database awake
    if (route === "GET /health") {
      await store.ping();
      return json(res, 200, { ok: true });
    }

    // Pages
    if (req.method === "GET") {
      if (url.pathname === "/") return serveStatic(res, "index.html");
      if (url.pathname === "/admin" || url.pathname === "/admin/") return serveStatic(res, "admin.html");
      return serveStatic(res, url.pathname.slice(1));
    }

    send(res, 404, "Not found");
  } catch (e) {
    if (String(e.message).startsWith("Supabase")) {
      console.error(e.message);
      return json(res, 500, { error: "Server error. Please try again." });
    }
    json(res, 400, { error: "Bad request." });
  }
});

server.listen(PORT, () => {
  console.log(USE_DB ? "Storage: Supabase" : `Storage: local file (${DATA_FILE})`);
  console.log(`Student page:  http://localhost:${PORT}/`);
  console.log(`Admin panel:   http://localhost:${PORT}/admin`);
});
