/**
 * scripts/create-admin.js
 * Usage: npm run create-admin
 * Reads ADMIN_USERNAME / ADMIN_PASSWORD from .env and creates the account.
 * Run this once after first deploy, then you can remove the password from .env.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createAdmin } = require('../auth');

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('ضع ADMIN_USERNAME و ADMIN_PASSWORD فى ملف .env أولًا.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('كلمة المرور قصيرة جدًا — استخدم ٨ خانات على الأقل.');
    process.exit(1);
  }

  try {
    await createAdmin(username, password);
    console.log(`✓ تم إنشاء حساب الأدمن "${username}" بنجاح.`);
    console.log('يمكنك الآن تسجيل الدخول من admin.html، ويُفضَّل حذف ADMIN_PASSWORD من .env بعد ذلك.');
  } catch (e) {
    console.error('فشل الإنشاء:', e.message);
    process.exit(1);
  }
}

main();
