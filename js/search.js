/**
 * search.js — fast, fully client-side search across numbers, titles, and verse text.
 * Builds a lightweight inverted index once, then reuses it for every query.
 */

const Search = {
  _index: null, // Array<{ psalm, number, title, verse, text, normText }>
  _byNumberStr: null,

  normalize(s) {
    if (!s) return '';
    // strip Arabic diacritics for forgiving matching, normalize alef/ya variants
    return s
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // tashkeel + tatweel
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  },

  async buildIndex() {
    if (this._index) return;
    const psalms = await PsalmsData.all();
    const idx = [];
    for (const p of psalms) {
      for (const v of p.verses) {
        idx.push({
          psalm: p.number,
          title: p.title,
          verse: v.number,
          text: v.text,
          normText: this.normalize(v.text),
          normTitle: this.normalize(p.title),
        });
      }
    }
    this._index = idx;
  },

  highlight(text, query) {
    if (!query) return text;
    const norm = this.normalize(query);
    if (!norm) return text;
    // best-effort highlight on raw text using a loose regex from the query terms
    const terms = norm.split(' ').filter(Boolean);
    let out = text;
    terms.forEach(t => {
      if (t.length < 2) return;
      try {
        const re = new RegExp(`([\\u0600-\\u06FF]{0,0}${t.split('').join('[\\u064B-\\u0652\\u0670]*')})`, 'giu');
        out = out.replace(re, m => `<mark>${m}</mark>`);
      } catch (e) { /* ignore bad pattern */ }
    });
    return out;
  },

  /**
   * query supports:
   *  - pure number -> jump to that psalm
   *  - "23:4" -> psalm 23 verse 4
   *  - text -> verse/title full-text search
   */
  async search(query, { limit = 60 } = {}) {
    await this.buildIndex();
    const raw = (query || '').trim();
    if (!raw) return { type: 'empty', results: [] };

    const verseRefMatch = raw.match(/^(\d{1,3})\s*[:،]\s*(\d{1,3})$/);
    if (verseRefMatch) {
      const [, p, v] = verseRefMatch;
      const hit = this._index.find(e => e.psalm === Number(p) && e.verse === Number(v));
      return { type: 'verse-ref', results: hit ? [hit] : [] };
    }

    if (/^\d{1,3}$/.test(raw)) {
      const num = Number(raw);
      const psalm = await PsalmsData.get(num);
      return { type: 'psalm-number', results: psalm ? [psalm] : [] };
    }

    const norm = this.normalize(raw);
    if (!norm) return { type: 'empty', results: [] };
    const terms = norm.split(' ').filter(Boolean);

    const results = [];
    for (const e of this._index) {
      const hitsInText = terms.every(t => e.normText.includes(t));
      const hitsInTitle = terms.every(t => e.normTitle.includes(t));
      if (hitsInText || hitsInTitle) {
        results.push({ ...e, matchedIn: hitsInTitle && !hitsInText ? 'title' : 'text' });
        if (results.length >= limit) break;
      }
    }
    return { type: 'text', results };
  },
};
