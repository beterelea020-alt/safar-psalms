const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { DB, AUDIO_DIR } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AUDIO_DIR),
  filename: (req, file, cb) => {
    const num = String(req.params.number).padStart(3, '0');
    cb(null, `psalm-${num}.mp3`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB per psalm audio file, generous but bounded
  fileFilter: (req, file, cb) => {
    const okTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4'];
    if (okTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.mp3')) {
      return cb(null, true);
    }
    cb(new Error('يُسمح فقط بملفات صوت (mp3/wav)'));
  },
});

router.post('/:number', requireAdmin, (req, res) => {
  const psalm = DB.getPsalm(req.params.number);
  if (!psalm) return res.status(404).json({ error: 'المزمور غير موجود' });

  upload.single('audio')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'فشل رفع الملف' });
    if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق ملف' });

    const relativePath = `audio/${req.file.filename}`;
    try {
      const updated = await DB.setPsalmAudio(req.params.number, relativePath, req.session.admin.username);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

router.delete('/:number', requireAdmin, async (req, res) => {
  try {
    const updated = await DB.removePsalmAudio(req.params.number, req.session.admin.username);
    res.json(updated);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

module.exports = router;
