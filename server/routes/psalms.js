const express = require('express');
const { DB } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

const MAX_TITLE_LEN = 200;
const MAX_INTRO_LEN = 2000;
const MAX_VERSE_LEN = 3000;

function isValidPsalmNumber(n) {
  const num = Number(n);
  return Number.isInteger(num) && num >= 1 && num <= 200; // generous upper bound, real data caps at 151
}
function isValidVerseNumber(n) {
  const num = Number(n);
  return Number.isInteger(num) && num >= 1 && num <= 500;
}

/* ---------- Public read endpoints (no auth) ---------- */
router.get('/', (req, res) => {
  res.json(DB.getPsalms());
});

router.get('/:number', (req, res) => {
  if (!isValidPsalmNumber(req.params.number)) return res.status(400).json({ error: 'رقم مزمور غير صالح' });
  const psalm = DB.getPsalm(req.params.number);
  if (!psalm) return res.status(404).json({ error: 'المزمور غير موجود' });
  res.json(psalm);
});

/* ---------- Admin write endpoints (auth required) ---------- */

// Edit psalm-level fields: title, introduction
router.patch('/:number', requireAdmin, async (req, res, next) => {
  if (!isValidPsalmNumber(req.params.number)) return res.status(400).json({ error: 'رقم مزمور غير صالح' });

  const allowed = ['title', 'introduction'];
  const fields = {};
  for (const key of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
      const val = String(req.body[key] ?? '').trim();
      const maxLen = key === 'title' ? MAX_TITLE_LEN : MAX_INTRO_LEN;
      if (val.length > maxLen) {
        return res.status(400).json({ error: `${key === 'title' ? 'العنوان' : 'المقدمة'} أطول من الحد المسموح (${maxLen} حرف)` });
      }
      fields[key] = val;
    }
  }
  if (!Object.keys(fields).length) {
    return res.status(400).json({ error: 'لا توجد حقول صالحة للتعديل' });
  }
  try {
    const updated = await DB.updatePsalmFields(req.params.number, fields, req.session.admin.username);
    res.json(updated);
  } catch (e) {
    if (e.message === 'psalm not found') return res.status(404).json({ error: e.message });
    next(e);
  }
});

// Edit a single verse's text — the sensitive one, always logged with before/after.
router.patch('/:number/verses/:verseNumber', requireAdmin, async (req, res, next) => {
  if (!isValidPsalmNumber(req.params.number)) return res.status(400).json({ error: 'رقم مزمور غير صالح' });
  if (!isValidVerseNumber(req.params.verseNumber)) return res.status(400).json({ error: 'رقم آية غير صالح' });

  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'نص الآية مطلوب' });
  }
  if (text.trim().length > MAX_VERSE_LEN) {
    return res.status(400).json({ error: `نص الآية أطول من الحد المسموح (${MAX_VERSE_LEN} حرف)` });
  }
  try {
    const updated = await DB.updateVerseText(req.params.number, req.params.verseNumber, text.trim(), req.session.admin.username);
    res.json(updated);
  } catch (e) {
    if (e.message === 'psalm not found' || e.message === 'verse not found') return res.status(404).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
