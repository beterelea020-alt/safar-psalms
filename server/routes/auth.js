const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyAdminLogin, updateAdminPassword } = require('../auth');

const router = express.Router();

// Slow down brute-force login attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'محاولات دخول كثيرة جدًا، حاول مرة أخرى بعد قليل' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }
  const admin = await verifyAdminLogin(username, password);
  if (!admin) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'خطأ فى إنشاء الجلسة' });
    req.session.admin = { username: admin.username };
    res.json({ ok: true, username: admin.username });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('psalms.sid');
    res.json({ ok: true });
  });
});

router.get('/session', (req, res) => {
  if (req.session && req.session.admin) {
    return res.json({ authenticated: true, username: req.session.admin.username });
  }
  res.json({ authenticated: false });
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'محاولات كثيرة جدًا، حاول مرة أخرى بعد قليل' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/change-password', changePasswordLimiter, async (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(401).json({ error: 'غير مصرح — يلزم تسجيل الدخول' });
  }
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة جدًا — 8 خانات على الأقل' });
  }
  const admin = await verifyAdminLogin(req.session.admin.username, currentPassword);
  if (!admin) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  await updateAdminPassword(req.session.admin.username, newPassword);
  res.json({ ok: true });
});

module.exports = router;
