const bcrypt = require('bcryptjs');
const { DB } = require('./db');

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function createAdmin(username, plainPassword) {
  const existing = DB.findAdminByUsername(username);
  if (existing) throw new Error('اسم المستخدم موجود بالفعل');
  const passwordHash = await hashPassword(plainPassword);
  const admins = DB.getAdmins();
  admins.push({ username, passwordHash, createdAt: Date.now() });
  await DB.saveAdmins(admins);
  return { username };
}

async function verifyAdminLogin(username, plainPassword) {
  const admin = DB.findAdminByUsername(username);
  if (!admin) return null;
  const ok = await verifyPassword(plainPassword, admin.passwordHash);
  return ok ? { username: admin.username } : null;
}

async function updateAdminPassword(username, newPlainPassword) {
  const admins = DB.getAdmins();
  const idx = admins.findIndex(a => a.username.toLowerCase() === String(username).toLowerCase());
  if (idx === -1) throw new Error('الحساب غير موجود');
  admins[idx].passwordHash = await hashPassword(newPlainPassword);
  admins[idx].passwordChangedAt = Date.now();
  await DB.saveAdmins(admins);
  return { username };
}

module.exports = { hashPassword, verifyPassword, createAdmin, verifyAdminLogin, updateAdminPassword };
