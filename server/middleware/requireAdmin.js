function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'غير مصرح — يلزم تسجيل الدخول' });
}

module.exports = { requireAdmin };
