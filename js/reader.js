/**
 * reader.js — powers psalm.html: rendering, verse actions, reading/prayer modes,
 * memorization modes (missing words, recall), font controls.
 */

const Reader = {
  psalm: null,
  mode: 'full', // full | missing-easy | missing-medium | missing-hard | recall

  async init() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get('id')) || 1;
    const verseParam = Number(params.get('verse')) || null;

    const psalm = await PsalmsData.get(id);
    if (!psalm) {
      this.renderNotFound(id);
      return;
    }
    this.psalm = psalm;
    document.title = `${psalm.title} — سفر المزامير`;

    await this.renderHeader();
    await this.renderVerses();
    this.wireToolbar();
    this.setupPager();
    this.setupAudio();
    this.restoreVerseStates();

    if (verseParam) {
      setTimeout(() => this.scrollToVerse(verseParam, true), 150);
    }

    Store.pushHistory({ type: 'read', psalm: psalm.number, title: psalm.title });
    const lastSeenVerse = verseParam || psalm.verses[0].number;
    Store.markPsalmRead(psalm.number, lastSeenVerse);
  },

  renderNotFound(id) {
    document.getElementById('reader-root').innerHTML = `
      <div class="empty-state">
        <div class="icon">؟</div>
        <h2>هذا المزمور غير موجود</h2>
        <p>لم نجد مزمورًا برقم ${id}. تأكد من الرقم أو تصفح المكتبة.</p>
        <a class="btn btn-primary" href="library.html">اذهب إلى المكتبة</a>
      </div>`;
  },

  async renderHeader() {
    const p = this.psalm;
    const isFav = Store.isPsalmFavorite(p.number);
    const isMemorizing = Store.isMemorizing(p.number);
    document.getElementById('reader-header').innerHTML = `
      <div class="psalm-number-label">مزمور ${p.number}</div>
      <h1>${p.title}</h1>
      ${p.introduction ? `<p class="introduction">${p.introduction}</p>` : ''}
      <div class="hero-actions" style="margin-top:1.5rem;">
        <button class="btn-icon ${isFav ? 'active' : ''}" id="fav-psalm-btn" title="أضف إلى المفضلة" aria-pressed="${isFav}">♥</button>
        <button class="btn-icon ${isMemorizing ? 'active' : ''}" id="memorize-psalm-btn" title="ابدأ الحفظ" aria-pressed="${isMemorizing}">✎</button>
        <button class="btn-icon" id="share-psalm-btn" title="مشاركة">⇪</button>
      </div>`;

    document.getElementById('fav-psalm-btn').addEventListener('click', (e) => {
      const now = Store.togglePsalmFavorite(p.number);
      e.currentTarget.classList.toggle('active', now);
      e.currentTarget.setAttribute('aria-pressed', String(now));
      toast(now ? 'أُضيف المزمور إلى المفضلة' : 'أُزيل المزمور من المفضلة');
    });
    document.getElementById('memorize-psalm-btn').addEventListener('click', (e) => {
      const now = Store.toggleMemorizing(p.number);
      e.currentTarget.classList.toggle('active', now);
      e.currentTarget.setAttribute('aria-pressed', String(now));
      toast(now ? 'بدأت رحلة حفظ هذا المزمور' : 'أُزيل من قائمة الحفظ');
    });
    document.getElementById('share-psalm-btn').addEventListener('click', () => Sharing.sharePsalm(p));
  },

  async renderVerses() {
    const p = this.psalm;
    const notes = await IDB.getAllNotes();
    const noteMap = new Map(notes.filter(n => n.psalm === p.number).map(n => [n.verse, n]));
    const mastery = await IDB.getAllMastery();
    const masteryMap = new Map(mastery.filter(m => m.psalm === p.number).map(m => [m.verse, m]));

    const html = p.verses.map(v => {
      const key = `${p.number}:${v.number}`;
      const isFav = Store.isVerseFavorite(key);
      const m = masteryMap.get(v.number);
      const isMemorized = m && m.memorized;
      const note = noteMap.get(v.number);
      return `
        <div class="verse" id="verse-${v.number}" data-verse="${v.number}" data-psalm="${p.number}">
          <div class="vnum" aria-hidden="true">${v.number}</div>
          <div class="vtext-wrap" style="flex:1;">
            <div class="vtext">${v.text}</div>
            ${note ? `<div class="verse-note" data-static><div class="note-text">${escapeHtml(note.text)}</div></div>` : ''}
          </div>
          <div class="verse-actions">
            <button class="fav-verse ${isFav ? 'active' : ''}" title="مفضلة الآية" aria-pressed="${isFav}">♥</button>
            <button class="mem-verse ${isMemorized ? 'active' : ''}" title="تم حفظها" aria-pressed="${!!isMemorized}">✓</button>
            <button class="review-verse" title="أحتاج مراجعة">⟲</button>
            <button class="note-verse" title="أضف ملاحظة">✎</button>
          </div>
        </div>`;
    }).join('');
    document.getElementById('verses-root').innerHTML = html;
    this.wireVerseActions();
  },

  wireVerseActions() {
    const p = this.psalm;
    document.querySelectorAll('.verse').forEach(el => {
      const vnum = Number(el.dataset.verse);
      const key = `${p.number}:${vnum}`;

      el.querySelector('.fav-verse').addEventListener('click', (e) => {
        const now = Store.toggleVerseFavorite(key);
        e.currentTarget.classList.toggle('active', now);
        e.currentTarget.setAttribute('aria-pressed', String(now));
        el.classList.toggle('is-bookmarked', now);
        toast(now ? 'أُضيفت الآية إلى المفضلة' : 'أُزيلت من المفضلة');
      });

      el.querySelector('.mem-verse').addEventListener('click', async (e) => {
        const m = await IDB.getMastery(key);
        const nowVal = !(m && m.memorized);
        await IDB.setBookmarkFlag(p.number, vnum, 'memorized', nowVal);
        e.currentTarget.classList.toggle('active', nowVal);
        e.currentTarget.setAttribute('aria-pressed', String(nowVal));
        el.classList.toggle('is-memorized', nowVal);
        toast(nowVal ? 'أُضيفت للآيات المحفوظة' : 'أُزيلت من المحفوظة');
      });

      el.querySelector('.review-verse').addEventListener('click', async () => {
        await IDB.setBookmarkFlag(p.number, vnum, 'needsReview', true);
        toast('أُضيفت الآية لقائمة المراجعة');
      });

      el.querySelector('.note-verse').addEventListener('click', async () => {
        this.openNoteEditor(el, p.number, vnum);
      });
    });
  },

  async openNoteEditor(verseEl, psalmNum, vnum) {
    const existingStatic = verseEl.querySelector('.verse-note[data-static]');
    if (existingStatic) existingStatic.remove();
    if (verseEl.querySelector('.verse-note[data-editing]')) return;

    const note = await IDB.getNote(`${psalmNum}:${vnum}`);
    const wrap = document.createElement('div');
    wrap.className = 'verse-note';
    wrap.dataset.editing = 'true';
    wrap.innerHTML = `
      <textarea placeholder="ملاحظتك الشخصية على هذه الآية…">${note ? escapeHtml(note.text) : ''}</textarea>
      <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
        <button class="btn btn-sm btn-primary" data-save>حفظ</button>
        <button class="btn btn-sm btn-secondary" data-cancel>إلغاء</button>
      </div>`;
    verseEl.querySelector('.vtext-wrap').appendChild(wrap);
    const ta = wrap.querySelector('textarea');
    ta.focus();

    wrap.querySelector('[data-save]').addEventListener('click', async () => {
      const val = ta.value.trim();
      await IDB.setNote(psalmNum, vnum, val);
      verseEl.classList.toggle('has-note', !!val);
      wrap.remove();
      if (val) {
        const staticEl = document.createElement('div');
        staticEl.className = 'verse-note';
        staticEl.dataset.static = 'true';
        staticEl.innerHTML = `<div class="note-text">${escapeHtml(val)}</div>`;
        verseEl.querySelector('.vtext-wrap').appendChild(staticEl);
      }
      toast('تم حفظ الملاحظة محليًا على جهازك');
    });
    wrap.querySelector('[data-cancel]').addEventListener('click', () => wrap.remove());
  },

  async restoreVerseStates() {
    const p = this.psalm;
    const mastery = await IDB.getAllMastery();
    mastery.filter(m => m.psalm === p.number).forEach(m => {
      const el = document.getElementById(`verse-${m.verse}`);
      if (el && m.memorized) el.classList.add('is-memorized');
    });
    Store.getFavoriteVerses().forEach(key => {
      const [pn, vn] = key.split(':').map(Number);
      if (pn === p.number) document.getElementById(`verse-${vn}`)?.classList.add('is-bookmarked');
    });
  },

  scrollToVerse(vnum, highlight) {
    const el = document.getElementById(`verse-${vnum}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlight) {
      el.classList.add('target-highlight');
      setTimeout(() => el.classList.remove('target-highlight'), 2200);
    }
  },

  wireToolbar() {
    document.getElementById('reading-mode-btn')?.addEventListener('click', () => {
      document.body.classList.toggle('reading-mode');
      toast(document.body.classList.contains('reading-mode') ? 'وضع القراءة مفعّل' : 'تم إيقاف وضع القراءة');
    });
    document.getElementById('prayer-mode-btn')?.addEventListener('click', () => {
      document.body.classList.add('prayer-mode');
    });
    document.getElementById('prayer-exit-btn')?.addEventListener('click', () => {
      document.body.classList.remove('prayer-mode');
    });

    const fontPop = document.getElementById('font-popover');
    document.getElementById('font-controls-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fontPop.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (fontPop && !fontPop.contains(e.target) && e.target.id !== 'font-controls-btn') fontPop.classList.remove('open');
    });
    document.getElementById('font-inc')?.addEventListener('click', () => App.changeFontSize(0.1));
    document.getElementById('font-dec')?.addEventListener('click', () => App.changeFontSize(-0.1));
    document.getElementById('font-reset')?.addEventListener('click', () => App.resetFontSize());
    document.getElementById('lh-inc')?.addEventListener('click', () => App.changeLineHeight(0.1));
    document.getElementById('lh-dec')?.addEventListener('click', () => App.changeLineHeight(-0.1));
    document.getElementById('lh-reset')?.addEventListener('click', () => App.resetLineHeight());
  },

  async setupPager() {
    const p = this.psalm;
    const total = await PsalmsData.count();
    const pagerEl = document.getElementById('psalm-pager');
    const prevNum = p.number > 1 ? p.number - 1 : null;
    const nextNum = p.number < total ? p.number + 1 : null;
    window.__psalmNav = {
      prev: prevNum ? `psalm.html?id=${prevNum}` : null,
      next: nextNum ? `psalm.html?id=${nextNum}` : null,
    };
    const prevPsalm = prevNum ? await PsalmsData.get(prevNum) : null;
    const nextPsalm = nextNum ? await PsalmsData.get(nextNum) : null;
    pagerEl.innerHTML = `
      ${prevPsalm ? `<a class="prev" href="psalm.html?id=${prevPsalm.number}"><span class="pager-label">المزمور السابق</span><span class="pager-title">${prevPsalm.title}</span></a>` : '<span></span>'}
      ${nextPsalm ? `<a class="next" href="psalm.html?id=${nextPsalm.number}"><span class="pager-label">المزمور التالى</span><span class="pager-title">${nextPsalm.title}</span></a>` : '<span></span>'}
    `;
  },

  setupAudio() {
    const p = this.psalm;
    const container = document.getElementById('audio-container');
    if (p.audio) {
      window.AudioController = new AudioPlayer(container, p.audio, p.timings || null);
      return;
    }
    this.setupTTS(container, p);
  },

  setupTTS(container, p) {
    if (!VoiceSupport.hasTTS()) {
      container.innerHTML = `<div class="audio-unavailable"><span>🔇</span><span>لا يوجد صوت مُسجَّل لهذا المزمور، ومتصفحك لا يدعم النطق الآلى</span></div>`;
      return;
    }
    container.classList.add('audio-player');
    const savedRate = Store.getTTSRate();
    container.innerHTML = `
      <button class="btn-icon" data-tts-play title="استماع بالنطق الآلى">🔊</button>
      <span style="color:var(--text-soft); font-size:0.85rem; flex:1;">لا يوجد تسجيل صوتى لهذا المزمور — هذا نطق آلى من متصفحك، وليس صوتًا مُسجَّلًا</span>
      <select data-tts-speed style="background:transparent; border:1px solid var(--line); border-radius:6px; padding:0.3rem;">
        <option value="0.75" ${savedRate === 0.75 ? 'selected' : ''}>×0.75</option>
        <option value="0.95" ${savedRate === 0.95 ? 'selected' : ''}>×1</option>
        <option value="1.25" ${savedRate === 1.25 ? 'selected' : ''}>×1.25</option>
      </select>
      <a href="settings.html" class="btn-icon" title="اختيار صوت أفضل من الإعدادات" style="font-size:0.85rem; width:auto; padding:0 0.6rem;">⚙</a>
    `;
    const narrator = new TTSNarrator(p.verses, {
      onVerseStart: (vnum) => {
        document.querySelectorAll('.verse.now-playing').forEach(el => el.classList.remove('now-playing'));
        document.getElementById(`verse-${vnum}`)?.classList.add('now-playing');
      },
      onEnd: () => {
        document.querySelectorAll('.verse.now-playing').forEach(el => el.classList.remove('now-playing'));
        playBtn.textContent = '🔊';
        playing = false;
      },
    });
    narrator.setRate(Store.getTTSRate());
    if (!narrator.hasArabicVoice()) {
      // voices load async in some browsers — retry once after they populate
      speechSynthesis.onvoiceschanged = () => {
        if (narrator.hasArabicVoice()) {
          container.querySelector('span').textContent = 'لا يوجد تسجيل صوتى لهذا المزمور — هذا نطق آلى من متصفحك، وليس صوتًا مُسجَّلًا';
        }
      };
    }
    let playing = false;
    const playBtn = container.querySelector('[data-tts-play]');
    playBtn.addEventListener('click', () => {
      if (!playing) {
        narrator.setRate(Number(container.querySelector('[data-tts-speed]').value));
        narrator.start();
        playBtn.textContent = '⏸';
        playing = true;
      } else {
        narrator.stop();
        playBtn.textContent = '🔊';
        playing = false;
        document.querySelectorAll('.verse.now-playing').forEach(el => el.classList.remove('now-playing'));
      }
    });
    container.querySelector('[data-tts-speed]').addEventListener('change', (e) => {
      const r = Number(e.target.value);
      narrator.setRate(r);
      Store.setTTSRate(r);
    });
    window.AudioController = { isReady: () => true, toggle: () => playBtn.click() };
  },
};

/* ---------------- Audio player (section 18 & 19) ---------------- */
class AudioPlayer {
  constructor(container, src, timings) {
    this.container = container;
    this.timings = timings;
    this.audio = new Audio();
    this.audio.preload = 'none'; // lazy load — never preload every psalm's audio
    this.audio.src = src;
    this.render();
    this.bind();
  }
  isReady() { return true; }
  render() {
    this.container.innerHTML = `
      <button class="btn-icon" data-prev title="السابق">⏮</button>
      <button class="btn-icon" data-play title="تشغيل / إيقاف">▶</button>
      <button class="btn-icon" data-next title="التالى">⏭</button>
      <span class="time" data-current>٠:٠٠</span>
      <input type="range" class="seek" min="0" max="100" value="0" data-seek>
      <span class="time" data-duration>٠:٠٠</span>
      <select data-speed style="background:transparent;border:1px solid var(--line);border-radius:6px;padding:0.3rem;">
        <option value="0.75">×0.75</option>
        <option value="1" selected>×1</option>
        <option value="1.25">×1.25</option>
        <option value="1.5">×1.5</option>
      </select>`;
  }
  bind() {
    const playBtn = this.container.querySelector('[data-play]');
    playBtn.addEventListener('click', () => this.toggle());
    this.container.querySelector('[data-speed]').addEventListener('change', (e) => {
      this.audio.playbackRate = Number(e.target.value);
    });
    this.container.querySelector('[data-seek]').addEventListener('input', (e) => {
      if (this.audio.duration) this.audio.currentTime = (e.target.value / 100) * this.audio.duration;
    });
    this.container.querySelector('[data-prev]').addEventListener('click', () => location.href = window.__psalmNav?.prev || '#');
    this.container.querySelector('[data-next]').addEventListener('click', () => location.href = window.__psalmNav?.next || '#');
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('loadedmetadata', () => {
      this.container.querySelector('[data-duration]').textContent = this.fmt(this.audio.duration);
    });
    this.audio.addEventListener('error', () => {
      this.container.innerHTML = `<div class="audio-unavailable"><span>⚠</span><span>تعذّر تحميل الصوت</span></div>`;
    });
  }
  toggle() {
    if (this.audio.paused) { this.audio.play(); this.container.querySelector('[data-play]').textContent = '⏸'; }
    else { this.audio.pause(); this.container.querySelector('[data-play]').textContent = '▶'; }
  }
  onTimeUpdate() {
    const cur = this.audio.currentTime, dur = this.audio.duration || 0;
    this.container.querySelector('[data-current]').textContent = this.fmt(cur);
    this.container.querySelector('[data-seek]').value = dur ? (cur / dur) * 100 : 0;
    if (this.timings) {
      document.querySelectorAll('.verse.now-playing').forEach(el => el.classList.remove('now-playing'));
      const active = this.timings.find(t => cur >= t.start && cur < t.end);
      if (active) document.getElementById(`verse-${active.verse}`)?.classList.add('now-playing');
    }
  }
  fmt(t) {
    if (!isFinite(t)) return '٠:٠٠';
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return toArabicIndicDigits(`${m}:${String(s).padStart(2, '0')}`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('reader-root')) Reader.init();
});
