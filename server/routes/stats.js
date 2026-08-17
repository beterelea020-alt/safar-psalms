const express = require('express');
const { DB } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  res.json(DB.getContentStats());
});

router.get('/edit-log', requireAdmin, (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 100);
  res.json(DB.getEditLog().slice(0, limit));
});

module.exports = router;
