/**
 * scripts/bulk-upload-audio.js
 *
 * Uploads a folder of numbered mp3 files (1.mp3 ... 151.mp3) to a RUNNING
 * سفر المزامير server, one HTTP request per file, using the same authenticated
 * admin API the dashboard uses (POST /api/admin/audio/:number).
 *
 * Usage:
 *   node scripts/bulk-upload-audio.js <path-to-folder> [server-url]
 *
 * Examples:
 *   node scripts/bulk-upload-audio.js ./my-audio
 *   node scripts/bulk-upload-audio.js "C:\Users\pola\Music\psalms" http://localhost:3000
 *   node scripts/bulk-upload-audio.js ./my-audio https://your-app.onrender.com
 *
 * Reads ADMIN_USERNAME / ADMIN_PASSWORD from .env to log in (same file used
 * by create-admin.js). The server must already be running and reachable.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const folderArg = process.argv[2];
const serverUrl = (process.argv[3] || 'http://localhost:3000').replace(/\/$/, '');
const TOTAL_PSALMS = 151;

if (!folderArg) {
  console.error('الاستخدام: node scripts/bulk-upload-audio.js <مسار-المجلد> [رابط-السيرفر]');
  process.exit(1);
}
const folder = path.resolve(folderArg);
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`✗ المجلد غير موجود: ${folder}`);
  process.exit(1);
}

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) {
  console.error('✗ ضع ADMIN_USERNAME و ADMIN_PASSWORD فى ملف .env أولًا (نفس المستخدم فى admins.json).');
  process.exit(1);
}

let sessionCookie = null;

async function login() {
  const res = await fetch(`${serverUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('لم يتم استلام جلسة (session) من السيرفر');
  sessionCookie = setCookie.split(';')[0];
  console.log(`✓ تم تسجيل الدخول كـ "${data.username}"`);
}

async function uploadOne(number, filePath) {
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: 'audio/mpeg' });
  const form = new FormData();
  form.append('audio', blob, `${number}.mp3`);

  const res = await fetch(`${serverUrl}/api/admin/audio/${number}`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function findFileFor(number) {
  // accept a few harmless naming variations even though we expect plain "N.mp3"
  const candidates = [`${number}.mp3`, `${String(number).padStart(3, '0')}.mp3`];
  for (const name of candidates) {
    const p = path.join(folder, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  console.log(`جارٍ الاتصال بـ ${serverUrl} ...`);
  await login();

  const results = { uploaded: [], missing: [], failed: [] };

  for (let n = 1; n <= TOTAL_PSALMS; n++) {
    const filePath = findFileFor(n);
    if (!filePath) {
      results.missing.push(n);
      continue;
    }
    try {
      await uploadOne(n, filePath);
      results.uploaded.push(n);
      process.stdout.write(`\r✓ رُفع ${results.uploaded.length}/${TOTAL_PSALMS} — آخر ملف: مزمور ${n}    `);
    } catch (e) {
      results.failed.push({ number: n, error: e.message });
    }
  }

  console.log('\n');
  console.log('==================== النتيجة ====================');
  console.log(`✓ تم رفعه بنجاح: ${results.uploaded.length} / ${TOTAL_PSALMS}`);
  if (results.missing.length) {
    console.log(`⚠ ملفات غير موجودة فى المجلد لهذه الأرقام: ${results.missing.join(', ')}`);
  }
  if (results.failed.length) {
    console.log(`✗ فشل رفعها:`);
    results.failed.forEach(f => console.log(`   مزمور ${f.number}: ${f.error}`));
  }
  if (!results.missing.length && !results.failed.length) {
    console.log('🎉 كل الـ151 ملف اتربطوا بنجاح!');
  }
  console.log('===================================================');
}

main().catch(e => {
  console.error('\n✗ توقف السكريبت بخطأ:', e.message);
  process.exit(1);
});
