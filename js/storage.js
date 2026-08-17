/**
 * storage.js
 * All local persistence for the platform. No backend, ever.
 *
 * localStorage  -> lightweight preferences (theme, font size, favorites, streak, small history)
 * IndexedDB     -> structured data (verse mastery, review history, notes, full activity log)
 */

const LS_KEYS = {
  THEME: 'psalms.theme',
  FONT_SIZE: 'psalms.fontSize',
  LINE_HEIGHT: 'psalms.lineHeight',
  FAVORITES_PSALMS: 'psalms.favoritePsalms',
  FAVORITES_VERSES: 'psalms.favoriteVerses',
  STREAK: 'psalms.streak',
  HISTORY: 'psalms.history',
  LAST_POSITION: 'psalms.lastPosition',
  READ_PSALMS: 'psalms.readPsalms',
  MEMORIZING_PSALMS: 'psalms.memorizingPsalms',
  FREQUENCY: 'psalms.frequency',
  PLAN: 'psalms.readingPlan',
  TTS_VOICE: 'psalms.ttsVoice',
  TTS_RATE: 'psalms.ttsRate',
};

const HISTORY_MAX = 40;

const Store = {
  /* ---------- generic localStorage helpers ---------- */
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Store.get failed for', key, e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Store.set failed for', key, e);
      return false;
    }
  },

  /* ---------- theme & reading prefs ---------- */
  getTheme() { return this.get(LS_KEYS.THEME, null); },
  setTheme(t) { this.set(LS_KEYS.THEME, t); },
  getFontSize() { return this.get(LS_KEYS.FONT_SIZE, 1.35); },
  setFontSize(v) { this.set(LS_KEYS.FONT_SIZE, v); },
  getLineHeight() { return this.get(LS_KEYS.LINE_HEIGHT, 2.35); },
  setLineHeight(v) { this.set(LS_KEYS.LINE_HEIGHT, v); },
  getPreferredVoice() { return this.get(LS_KEYS.TTS_VOICE, null); }, // stores voiceURI string
  setPreferredVoice(voiceURI) { this.set(LS_KEYS.TTS_VOICE, voiceURI); },
  getTTSRate() { return this.get(LS_KEYS.TTS_RATE, 0.95); },
  setTTSRate(v) { this.set(LS_KEYS.TTS_RATE, v); },

  /* ---------- favorites ---------- */
  getFavoritePsalms() { return this.get(LS_KEYS.FAVORITES_PSALMS, []); },
  togglePsalmFavorite(num) {
    const list = this.getFavoritePsalms();
    const idx = list.indexOf(num);
    if (idx >= 0) list.splice(idx, 1); else list.push(num);
    this.set(LS_KEYS.FAVORITES_PSALMS, list);
    return idx < 0; // true if now favorited
  },
  isPsalmFavorite(num) { return this.getFavoritePsalms().includes(num); },

  getFavoriteVerses() { return this.get(LS_KEYS.FAVORITES_VERSES, []); }, // ["23:1", ...]
  toggleVerseFavorite(key) {
    const list = this.getFavoriteVerses();
    const idx = list.indexOf(key);
    if (idx >= 0) list.splice(idx, 1); else list.push(key);
    this.set(LS_KEYS.FAVORITES_VERSES, list);
    return idx < 0;
  },
  isVerseFavorite(key) { return this.getFavoriteVerses().includes(key); },

  /* ---------- read / memorizing sets ---------- */
  getReadPsalms() { return this.get(LS_KEYS.READ_PSALMS, {}); }, // { num: {lastVerse, updatedAt} }
  markPsalmRead(num, lastVerse) {
    const map = this.getReadPsalms();
    map[num] = { lastVerse, updatedAt: Date.now() };
    this.set(LS_KEYS.READ_PSALMS, map);
    this.bumpFrequency(num);
    this.setLastPosition(num, lastVerse);
    this.touchStreak();
  },

  getMemorizingPsalms() { return this.get(LS_KEYS.MEMORIZING_PSALMS, []); },
  toggleMemorizing(num) {
    const list = this.getMemorizingPsalms();
    const idx = list.indexOf(num);
    if (idx >= 0) list.splice(idx, 1); else list.push(num);
    this.set(LS_KEYS.MEMORIZING_PSALMS, list);
    return idx < 0;
  },
  isMemorizing(num) { return this.getMemorizingPsalms().includes(num); },

  /* ---------- last position / continue reading ---------- */
  getLastPosition() { return this.get(LS_KEYS.LAST_POSITION, null); }, // { num, verse, updatedAt }
  setLastPosition(num, verse) {
    this.set(LS_KEYS.LAST_POSITION, { num, verse, updatedAt: Date.now() });
  },

  /* ---------- history (bounded) ---------- */
  getHistory() { return this.get(LS_KEYS.HISTORY, []); },
  pushHistory(entry) {
    const list = this.getHistory();
    list.unshift({ ...entry, at: Date.now() });
    while (list.length > HISTORY_MAX) list.pop();
    this.set(LS_KEYS.HISTORY, list);
  },

  /* ---------- reading frequency (most returned to) ---------- */
  getFrequency() { return this.get(LS_KEYS.FREQUENCY, {}); },
  bumpFrequency(num) {
    const map = this.getFrequency();
    map[num] = (map[num] || 0) + 1;
    this.set(LS_KEYS.FREQUENCY, map);
  },

  /* ---------- streak ---------- */
  getStreak() { return this.get(LS_KEYS.STREAK, { count: 0, lastDay: null, days: [] }); },
  touchStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const s = this.getStreak();
    if (s.lastDay === today) return s;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.count = (s.lastDay === yesterday) ? s.count + 1 : 1;
    s.lastDay = today;
    s.days = s.days || [];
    s.days.push(today);
    if (s.days.length > 90) s.days = s.days.slice(-90);
    this.set(LS_KEYS.STREAK, s);
    return s;
  },

  /* ---------- reading plan ---------- */
  getPlan() { return this.get(LS_KEYS.PLAN, null); },
  setPlan(plan) { this.set(LS_KEYS.PLAN, plan); },

  /* ---------- export / import (section 38) ---------- */
  async exportAll() {
    const localData = {};
    Object.values(LS_KEYS).forEach(k => { localData[k] = this.get(k, null); });
    const idbData = await IDB.exportAll();
    return {
      exported_at: new Date().toISOString(),
      app: 'سفر المزامير',
      version: 1,
      localStorage: localData,
      indexedDB: idbData,
    };
  },
  async importAll(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('ملف غير صالح');
    if (!payload.localStorage || !payload.indexedDB) throw new Error('بنية البيانات غير متوقعة');
    Object.entries(payload.localStorage).forEach(([k, v]) => {
      if (v !== null && v !== undefined) this.set(k, v);
    });
    await IDB.importAll(payload.indexedDB);
    return true;
  },
};

/* ==========================================================================
   IndexedDB layer — verse mastery, notes, review history
   ========================================================================== */

const IDB = {
  DB_NAME: 'psalms-db',
  VERSION: 2,
  STORES: ['mastery', 'notes', 'reviewLog', 'recitations'],
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB غير مدعوم فى هذا المتصفح'));
      const req = indexedDB.open(this.DB_NAME, this.VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('mastery')) db.createObjectStore('mastery', { keyPath: 'key' }); // key = "23:1"
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('reviewLog')) db.createObjectStore('reviewLog', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('recitations')) db.createObjectStore('recitations', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  async tx(store, mode = 'readonly') {
    const db = await this.open();
    return db.transaction(store, mode).objectStore(store);
  },

  async get(store, key) {
    try {
      const os = await this.tx(store);
      return await new Promise((resolve, reject) => {
        const r = os.get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    } catch (e) { console.warn('IDB.get failed', e); return null; }
  },

  async put(store, value) {
    try {
      const os = await this.tx(store, 'readwrite');
      return await new Promise((resolve, reject) => {
        const r = os.put(value);
        r.onsuccess = () => resolve(true);
        r.onerror = () => reject(r.error);
      });
    } catch (e) { console.warn('IDB.put failed', e); return false; }
  },

  async getAll(store) {
    try {
      const os = await this.tx(store);
      return await new Promise((resolve, reject) => {
        const r = os.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      });
    } catch (e) { console.warn('IDB.getAll failed', e); return []; }
  },

  /* ---- mastery: { key: "23:1", psalm, verse, attempts, correct, incorrect,
                      mastery(0-100), lastReviewed, reviewCount, difficulty,
                      streak, nextReviewAt, lastScore, memorized, needsReview } ---- */
  async getMastery(key) { return this.get('mastery', key); },
  async getAllMastery() { return this.getAll('mastery'); },

  _blankMastery(psalm, verse) {
    return {
      key: `${psalm}:${verse}`, psalm, verse,
      attempts: 0, correct: 0, incorrect: 0,
      mastery: 0, lastReviewed: null, reviewCount: 0,
      streak: 0, nextReviewAt: null, lastScore: null,
      memorized: false, needsReview: false,
    };
  },

  /** Spaced-review ladder: correct streak -> days until next review. Weak scores reset it. */
  REVIEW_INTERVALS_DAYS: [1, 3, 7, 14, 30],

  _computeNextReview(streak) {
    const DAY = 86400000;
    const idx = Math.min(streak, this.REVIEW_INTERVALS_DAYS.length - 1);
    return Date.now() + this.REVIEW_INTERVALS_DAYS[idx] * DAY;
  },

  /** Legacy simple correct/incorrect attempt (used by flashcards etc). */
  async recordAttempt(psalm, verse, wasCorrect) {
    const key = `${psalm}:${verse}`;
    const existing = await this.getMastery(key) || this._blankMastery(psalm, verse);
    existing.attempts += 1;
    existing.reviewCount += 1;
    existing.lastReviewed = Date.now();
    if (wasCorrect) { existing.correct += 1; existing.streak = (existing.streak || 0) + 1; }
    else { existing.incorrect += 1; existing.streak = 0; existing.needsReview = true; }
    existing.mastery = Math.round((existing.correct / existing.attempts) * 100);
    existing.nextReviewAt = this._computeNextReview(existing.streak);
    await this.put('mastery', existing);
    return existing;
  },

  /**
   * Record a scored recitation attempt for one verse (0-100 score from the
   * word-alignment engine), which is more precise than a plain boolean.
   * `mastery` blends recent performance rather than being overwritten by one attempt.
   */
  async recordRecitationScore(psalm, verse, score) {
    const key = `${psalm}:${verse}`;
    const existing = await this.getMastery(key) || this._blankMastery(psalm, verse);
    const wasGood = score >= 75;
    existing.attempts += 1;
    existing.reviewCount += 1;
    existing.lastReviewed = Date.now();
    existing.lastScore = score;
    if (wasGood) { existing.correct += 1; existing.streak = (existing.streak || 0) + 1; existing.needsReview = false; }
    else { existing.incorrect += 1; existing.streak = 0; existing.needsReview = score < 60; }
    // Blend: weight recent score heavily but don't let one bad attempt erase a long history.
    existing.mastery = existing.mastery
      ? Math.round(existing.mastery * 0.4 + score * 0.6)
      : score;
    existing.nextReviewAt = this._computeNextReview(existing.streak);
    if (score >= 90) existing.memorized = true;
    await this.put('mastery', existing);
    return existing;
  },

  async setBookmarkFlag(psalm, verse, field, value) {
    const key = `${psalm}:${verse}`;
    const existing = await this.getMastery(key) || this._blankMastery(psalm, verse);
    existing[field] = value;
    await this.put('mastery', existing);
    return existing;
  },

  /* ---- notes: { key: "23:1", text, updatedAt } ---- */
  async getNote(key) { return this.get('notes', key); },
  async setNote(psalm, verse, text) {
    const key = `${psalm}:${verse}`;
    if (!text || !text.trim()) {
      const os = await this.tx('notes', 'readwrite');
      os.delete(key);
      return null;
    }
    const note = { key, psalm, verse, text: text.trim(), updatedAt: Date.now() };
    await this.put('notes', note);
    return note;
  },
  async getAllNotes() { return this.getAll('notes'); },

  /* ---- review log (generic events) ---- */
  async logReview(entry) {
    try {
      const os = await this.tx('reviewLog', 'readwrite');
      os.add({ ...entry, at: Date.now() });
    } catch (e) { console.warn(e); }
  },

  /* ---- recitation sessions (full "تسميع" results — no audio, only transcript+scores) ---- */
  async logRecitation(result) {
    try {
      const os = await this.tx('recitations', 'readwrite');
      os.add(result);
    } catch (e) { console.warn(e); }
  },
  async getRecitationsForPsalm(psalmNumber) {
    const all = await this.getAll('recitations');
    return all.filter(r => r.psalmNumber === psalmNumber).sort((a, b) => b.at - a.at);
  },
  async getLastRecitation(psalmNumber, scope) {
    const list = await this.getRecitationsForPsalm(psalmNumber);
    return list.find(r => r.scope === scope) || null;
  },

  /* ---- export / import ---- */
  async exportAll() {
    const out = {};
    for (const s of this.STORES) out[s] = await this.getAll(s);
    return out;
  },
  async importAll(data) {
    for (const s of this.STORES) {
      if (!Array.isArray(data[s])) continue;
      for (const item of data[s]) {
        // basic shape validation — never trust malformed imports
        if (item && typeof item === 'object') {
          try { await this.put(s, item); } catch (e) { /* skip bad record */ }
        }
      }
    }
    return true;
  },
};
