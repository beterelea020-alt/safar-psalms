/**
 * server.js — serves the existing static سفر المزامير frontend AS-IS, plus:
 *   - GET /data/psalms.json   -> now dynamic (reads the same file admin edits write to)
 *   - /api/admin/auth/*       -> admin login/logout/session/change-password
 *   - /api/psalms/*           -> public read + admin content editing (title, introduction, verse text)
 *   - /api/admin/audio/*      -> admin audio upload/removal
 *   - /api/settings           -> public read / admin write of the announcement banner
 *   - /api/admin/stats        -> content stats + edit log
 *
 * The frontend's fetch('data/psalms.json') and file layout (audio/, css/, js/) are
 * untouched — this process just serves the same folder and adds the API on top.
 *
 * Hardening in this file: strict security headers (CSP included), layered rate
 * limiting, a startup check against weak secrets in production, a JSON-only
 * global error handler (never leaks stack traces to clients), process-level
 * crash guards, and graceful shutdown on SIGTERM/SIGINT.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { DB } = require('./db');

const SITE_ROOT = path.join(__dirname, '..');
const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const IS_PROD = process.env.NODE_ENV === 'production';

/* ---------- Startup safety checks — refuse to boot with unsafe config in production ---------- */
const WEAK_SECRETS = ['change-this-secret', 'change-this-to-a-long-random-string', ''];
if (IS_PROD && WEAK_SECRETS.includes(process.env.SESSION_SECRET || '')) {
  console.error('✗ رفض التشغيل: SESSION_SECRET لسه على القيمة الافتراضية. غيّره لقيمة عشوائية فريدة فى .env قبل النشر.');
  process.exit(1);
}
if (IS_PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16)) {
  console.error('✗ رفض التشغيل: SESSION_SECRET قصير جدًا (أقل من 16 حرف). استخدم نصًا عشوائيًا أطول.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // needed on Render/Railway/etc behind a reverse proxy for secure cookies + accurate rate-limit IPs
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // the existing frontend uses inline <script> boot blocks on several pages —
      // 'unsafe-inline' is required for those specific pages to keep working
      // without a rewrite. Everything else is locked to same-origin + Google Fonts.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"], // blocks the admin panel from being embedded in an iframe (clickjacking)
    },
  },
}));
app.use(express.json({ limit: '1mb' }));

/* ---------- Rate limiting (layered): a lenient global cap, a strict one on login ---------- */
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جدًا، حاول مرة أخرى بعد قليل' },
}));

app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, ttl: 60 * 60 * 24 * 7, logFn: () => {} }),
  name: 'psalms.sid',
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict', // admin panel + API are same-origin only — no legitimate cross-site cookie use case
    secure: IS_PROD,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

/* ---------- Dynamic override of the psalms dataset the frontend already fetches ---------- */
app.get('/data/psalms.json', (req, res) => {
  res.json(DB.getPsalms());
});

/* ---------- Public settings (announcement banner) + admin write ---------- */
app.use('/api/settings', require('./routes/settings'));

/* ---------- Public + admin psalm content endpoints ---------- */
app.use('/api/psalms', require('./routes/psalms'));

/* ---------- Admin-only ---------- */
app.use('/api/admin/auth', require('./routes/auth'));
app.use('/api/admin/audio', require('./routes/audio'));
app.use('/api/admin/stats', require('./routes/stats'));

/* ---------- Health check for uptime monitoring ---------- */
app.get('/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

/* ---------- Static frontend (index.html, psalm.html, admin.html, css/, js/, audio/, data/) ---------- */
app.use(express.static(SITE_ROOT, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    // data/psalms.json is handled dynamically above; this only affects other static files.
    if (filePath.endsWith('data/psalms.json')) res.setHeader('Cache-Control', 'no-store');
  },
}));

/* ---------- 404 fallback ---------- */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'المسار غير موجود' });
  res.status(404).sendFile(path.join(SITE_ROOT, 'index.html'));
});

/* ---------- Global JSON error handler — never let a route crash the process or leak a stack trace ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: IS_PROD ? 'حدث خطأ غير متوقع فى الخادم' : (err.message || 'خطأ داخلى') });
});

/* ---------- Process-level crash guards — log clearly instead of dying silently ---------- */
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION — الخادم استمر فى العمل، لكن هذا يحتاج مراجعة:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED PROMISE REJECTION — يحتاج مراجعة:', reason);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`سفر المزامير — الخادم شغّال على http://localhost:${PORT}`);
  console.log(`لوحة تحكم الأدمن: http://localhost:${PORT}/admin.html`);
});

/* ---------- Graceful shutdown — important on hosts (Render/Railway) that send SIGTERM on redeploy ---------- */
function shutdown(signal) {
  console.log(`\n${signal} استُلمت — جارٍ إغلاق الخادم بأمان...`);
  server.close(() => {
    console.log('تم الإغلاق بأمان.');
    process.exit(0);
  });
  // force-exit if graceful close hangs for too long
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
