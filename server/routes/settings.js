const express = require('express');
const { DB } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.get('/', (req, res) => {
  const s = DB.getSettings();
  // public read only exposes what the frontend banner needs, nothing internal
  res.json({
    announcement: s.announcement || '',
    announcementActive: !!s.announcementActive,
    maintenanceMode: !!s.maintenanceMode,
  });
});

router.put('/', requireAdmin, async (req, res) => {
  const { announcement, announcementActive, maintenanceMode } = req.body || {};
  const patch = {};
  if (typeof announcement === 'string') patch.announcement = announcement.trim().slice(0, 500);
  if (typeof announcementActive === 'boolean') patch.announcementActive = announcementActive;
  if (typeof maintenanceMode === 'boolean') patch.maintenanceMode = maintenanceMode;
  const updated = await DB.saveSettings(patch, req.session.admin.username);
  res.json(updated);
});

module.exports = router;
