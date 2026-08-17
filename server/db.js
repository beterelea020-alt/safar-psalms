/**
 * db.js — a deliberately simple JSON-file data layer.
 *
 * Why not SQLite/Postgres? For a single-admin, moderate-traffic site, a plain
 * JSON file is easier to deploy (no native module compilation on cheap hosts),
 * easier to back up (just copy the file), and keeps the same data shape the
 * static frontend already expects. If this project grows a lot (many editors,
 * high write concurrency), migrate to a real database — this module is the
 * only place that would need to change.
 *
 * A tiny in-process write queue prevents concurrent writes from corrupting
 * a file (Node is single-threaded for JS execution, but async fs writes can
 * still interleave without this).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SITE_DATA_DIR = path.join(__dirname, '..', 'data'); // the existing /data/psalms.json the frontend already reads
const AUDIO_DIR = path.join(__dirname, '..', 'audio');

const PSALMS_FILE = path.join(SITE_DATA_DIR, 'psalms.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admins.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const EDIT_LOG_FILE = path.join(DATA_DIR, 'edit-log.json');

for (const dir of [DATA_DIR, SITE_DATA_DIR, AUDIO_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const writeQueues = new Map();
let psalmsCache = null;
let settingsCache = null;

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error(`Failed to read ${file}:`, e.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  const prev = writeQueues.get(file) || Promise.resolve();
  const next = prev.then(() => new Promise((resolve, reject) => {
    const tmp = file + '.tmp';
    fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8', (err) => {
      if (err) return reject(err);
      fs.rename(tmp, file, (err2) => (err2 ? reject(err2) : resolve()));
    });
  }));
  writeQueues.set(file, next.catch(() => {})); // keep queue alive even if one write fails
  return next;
}

const DB = {
  // ---------- psalms (the same file the public frontend reads) ----------
  // Cached in memory since this is read on essentially every page load; invalidated on any write.
  getPsalms() {
    if (!psalmsCache) psalmsCache = readJSON(PSALMS_FILE, []);
    return psalmsCache;
  },
  async savePsalms(list) {
    await writeJSON(PSALMS_FILE, list);
    psalmsCache = list;
  },

  getPsalm(number) {
    return this.getPsalms().find(p => p.number === Number(number)) || null;
  },

  async updatePsalmFields(number, fields, adminUsername) {
    const list = this.getPsalms();
    const idx = list.findIndex(p => p.number === Number(number));
    if (idx === -1) throw new Error('psalm not found');
    const before = { ...list[idx] };
    list[idx] = { ...list[idx], ...fields };
    await this.savePsalms(list);
    await this.logEdit({
      entityType: 'psalm', entityId: number,
      fields: Object.keys(fields), before, after: list[idx],
      adminUsername,
    });
    return list[idx];
  },

  async updateVerseText(number, verseNumber, newText, adminUsername) {
    const list = this.getPsalms();
    const idx = list.findIndex(p => p.number === Number(number));
    if (idx === -1) throw new Error('psalm not found');
    const verses = list[idx].verses;
    const vIdx = verses.findIndex(v => v.number === Number(verseNumber));
    if (vIdx === -1) throw new Error('verse not found');
    const oldText = verses[vIdx].text;
    verses[vIdx] = { ...verses[vIdx], text: newText };
    await this.savePsalms(list);
    await this.logEdit({
      entityType: 'verse', entityId: `${number}:${verseNumber}`,
      fields: ['text'], before: { text: oldText }, after: { text: newText },
      adminUsername,
    });
    return verses[vIdx];
  },

  async setPsalmAudio(number, audioPath, adminUsername) {
    return this.updatePsalmFields(number, { audio: audioPath }, adminUsername);
  },

  async removePsalmAudio(number, adminUsername) {
    const psalm = this.getPsalm(number);
    if (psalm && psalm.audio) {
      const filePath = path.join(__dirname, '..', psalm.audio);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.warn('could not delete audio file', e.message); }
      }
    }
    return this.updatePsalmFields(number, { audio: null }, adminUsername);
  },

  // ---------- admin users ----------
  getAdmins() { return readJSON(ADMIN_FILE, []); },
  saveAdmins(list) { return writeJSON(ADMIN_FILE, list); },
  findAdminByUsername(username) {
    return this.getAdmins().find(a => a.username.toLowerCase() === String(username).toLowerCase()) || null;
  },

  // ---------- site settings (public banner/announcement) ----------
  getSettings() {
    if (!settingsCache) {
      settingsCache = readJSON(SETTINGS_FILE, { announcement: '', announcementActive: false, maintenanceMode: false, updatedAt: null });
    }
    return settingsCache;
  },
  async saveSettings(patch, adminUsername) {
    const current = this.getSettings();
    const updated = { ...current, ...patch, updatedAt: Date.now() };
    await writeJSON(SETTINGS_FILE, updated);
    settingsCache = updated;
    await this.logEdit({
      entityType: 'settings', entityId: 'site',
      fields: Object.keys(patch), before: current, after: updated,
      adminUsername,
    });
    return updated;
  },

  // ---------- edit log (audit trail) ----------
  getEditLog() { return readJSON(EDIT_LOG_FILE, []); },
  async logEdit(entry) {
    const log = this.getEditLog();
    log.unshift({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), at: Date.now(), ...entry });
    // bounded log — keep the most recent 500 entries
    while (log.length > 500) log.pop();
    return writeJSON(EDIT_LOG_FILE, log);
  },

  // ---------- content stats (NOT visitor tracking — the site promises no analytics on visitors) ----------
  getContentStats() {
    const psalms = this.getPsalms();
    const totalVerses = psalms.reduce((sum, p) => sum + (p.verses ? p.verses.length : 0), 0);
    const withAudio = psalms.filter(p => !!p.audio).length;
    const log = this.getEditLog();
    return {
      totalPsalms: psalms.length,
      totalVerses,
      psalmsWithAudio: withAudio,
      psalmsWithoutAudio: psalms.length - withAudio,
      totalEdits: log.length,
      lastEditAt: log[0]?.at || null,
    };
  },
};

module.exports = { DB, PSALMS_FILE, AUDIO_DIR, DATA_DIR };
