/**
 * psalms.js — loads and indexes the Psalms dataset.
 * The PDF source is the single source of truth; this module never alters verse text.
 */

const PsalmsData = {
  _all: null,
  _byNumber: null,

  async load() {
    if (this._all) return this._all;
    const res = await fetch('data/psalms.json');
    if (!res.ok) throw new Error('تعذّر تحميل بيانات المزامير');
    const list = await res.json();
    this._all = list;
    this._byNumber = new Map(list.map(p => [p.number, p]));
    return list;
  },

  async get(number) {
    await this.load();
    return this._byNumber.get(Number(number)) || null;
  },

  async all() {
    return this.load();
  },

  async count() {
    await this.load();
    return this._all.length;
  },

  async preview(number, len = 90) {
    const p = await this.get(number);
    if (!p || !p.verses.length) return '';
    const t = p.verses[0].text;
    return t.length > len ? t.slice(0, len) + '…' : t;
  },

  async random(excludeSet = new Set()) {
    await this.load();
    const pool = this._all.filter(p => !excludeSet.has(p.number));
    const list = pool.length ? pool : this._all;
    return list[Math.floor(Math.random() * list.length)];
  },
};

/** Arabic ordinal number -> western digits for display where useful */
function toArabicIndicDigits(n) {
  const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return String(n).replace(/\d/g, d => map[d]);
}
