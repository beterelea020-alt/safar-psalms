/**
 * memorization.js — powers memorize.html
 * Modes: full reading, missing words (easy/medium/hard), verse completion, recall, flashcards.
 */

const Memorize = {
  psalm: null,
  mode: 'missing-easy',
  verses: [],
  cardIndex: 0,

  async init() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get('id')) || 1;
    this.psalm = await PsalmsData.get(id);
    if (!this.psalm) {
      document.getElementById('memorize-root').innerHTML = `<div class="empty-state"><h2>المزمور غير موجود</h2></div>`;
      return;
    }
    document.title = `حفظ ${this.psalm.title} — سفر المزامير`;
    document.getElementById('memorize-title').textContent = this.psalm.title;
    document.getElementById('memorize-subtitle').textContent = 'اختر طريقة الحفظ التى تناسبك';

    this.wireTabs();
    this.renderMode();
    this.renderMasteryOverview();
  },

  wireTabs() {
    document.querySelectorAll('.mode-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.dataset.mode;
        this.cardIndex = 0;
        this.renderMode();
      });
    });
  },

  renderMode() {
    const root = document.getElementById('memorize-body');
    if (this.mode === 'full') return this.renderFull(root);
    if (this.mode.startsWith('missing-')) return this.renderMissingWords(root, this.mode.split('-')[1]);
    if (this.mode === 'recall') return this.renderRecall(root);
    if (this.mode === 'flashcards') return this.renderFlashcards(root);
    if (this.mode === 'completion') return this.renderCompletion(root);
    if (this.mode === 'voice') return this.renderVoice(root);
  },

  renderFull(root) {
    root.innerHTML = `<div class="verses">${this.psalm.verses.map(v =>
      `<div class="verse"><div class="vnum">${v.number}</div><div class="vtext">${v.text}</div></div>`
    ).join('')}</div>`;
  },

  hideRatio(level) {
    return level === 'easy' ? 0.2 : level === 'medium' ? 0.45 : 0.75;
  },

  maskVerse(text, ratio) {
    const words = text.split(' ');
    return words.map(w => {
      const clean = w.replace(/[،.:؛]/g, '');
      if (clean.length < 2) return w;
      return Math.random() < ratio
        ? `<span class="missing-word" data-word="${escapeHtml(w)}" tabindex="0" role="button" aria-label="كلمة مخفية">${'ـ'.repeat(Math.min(clean.length, 6))}</span>`
        : w;
    }).join(' ');
  },

  renderMissingWords(root, level) {
    const ratio = this.hideRatio(level);
    root.innerHTML = `
      <p style="color:var(--text-soft); margin-bottom:1rem;">انقر على الكلمات المخفية لإظهارها واحدة تلو الأخرى.</p>
      <div class="verses">${this.psalm.verses.map(v =>
        `<div class="verse"><div class="vnum">${v.number}</div><div class="vtext">${this.maskVerse(v.text, ratio)}</div></div>`
      ).join('')}</div>`;
    root.querySelectorAll('.missing-word').forEach(w => {
      w.addEventListener('click', () => {
        w.textContent = w.dataset.word;
        w.classList.add('revealed');
      });
    });
  },

  renderRecall(root) {
    let i = 0;
    const total = this.psalm.verses.length;
    const draw = () => {
      const v = this.psalm.verses[i];
      root.innerHTML = `
        <div style="text-align:center; padding: 2rem 0;">
          <div style="color:var(--accent); font-family:var(--font-arabic); font-size:1.6rem; margin-bottom:1.5rem;">
            مزمور ${this.psalm.number}:${v.number}
          </div>
          <p style="color:var(--text-soft); margin-bottom:1.5rem;">حاول أن تتذكر نص الآية قبل إظهارها</p>
          <button class="btn btn-secondary" id="reveal-recall">إظهار الآية</button>
          <div class="verses" id="recall-answer" style="display:none; margin-top:1.5rem;">
            <div class="verse"><div class="vtext">${v.text}</div></div>
          </div>
          <div style="margin-top:2rem; display:flex; gap:0.75rem; justify-content:center;">
            <button class="btn btn-sm btn-secondary" id="recall-prev" ${i === 0 ? 'disabled' : ''}>◀ السابقة</button>
            <span style="align-self:center; color:var(--text-soft); font-size:0.9rem;">${i + 1} / ${total}</span>
            <button class="btn btn-sm btn-secondary" id="recall-next" ${i === total - 1 ? 'disabled' : ''}>التالية ▶</button>
          </div>
        </div>`;
      root.querySelector('#reveal-recall').addEventListener('click', () => {
        root.querySelector('#recall-answer').style.display = 'block';
      });
      root.querySelector('#recall-prev')?.addEventListener('click', () => { i--; draw(); });
      root.querySelector('#recall-next')?.addEventListener('click', () => { i++; draw(); });
    };
    draw();
  },

  renderCompletion(root) {
    const v = this.psalm.verses[this.cardIndex % this.psalm.verses.length];
    const words = v.text.split(' ');
    const splitAt = Math.max(1, Math.floor(words.length * 0.55));
    const shown = words.slice(0, splitAt).join(' ');
    const hidden = words.slice(splitAt).join(' ');
    root.innerHTML = `
      <div style="text-align:center; padding:2rem 0;">
        <div class="verse" style="justify-content:center;"><div class="vtext">${shown} …</div></div>
        <p style="color:var(--text-soft); margin:1rem 0;">أكمل الآية فى ذهنك، ثم تحقق من نفسك</p>
        <button class="btn btn-secondary" id="show-rest">إظهار الباقى</button>
        <div id="rest-text" style="display:none; margin-top:1rem; font-family:var(--font-arabic); font-size:1.2rem;">${hidden}</div>
        <div style="margin-top:2rem;">
          <button class="btn btn-sm btn-primary" id="completion-next">التالية</button>
        </div>
      </div>`;
    root.querySelector('#show-rest').addEventListener('click', () => root.querySelector('#rest-text').style.display = 'block');
    root.querySelector('#completion-next').addEventListener('click', () => { this.cardIndex++; this.renderCompletion(root); });
  },

  renderFlashcards(root) {
    const v = this.psalm.verses[this.cardIndex % this.psalm.verses.length];
    root.innerHTML = `
      <div class="flashcard-wrap">
        <div class="flashcard" id="fc">
          <div class="flashcard-face front"><span class="ref">مزمور ${this.psalm.number}:${v.number}</span></div>
          <div class="flashcard-face back">${v.text}</div>
        </div>
      </div>
      <p style="text-align:center; color:var(--text-soft); font-size:0.9rem;">انقر على البطاقة لقلبها</p>
      <div style="display:flex; gap:0.75rem; justify-content:center; margin-top:1rem;">
        <button class="btn btn-secondary" id="fc-need-review">أحتاج مراجعة</button>
        <button class="btn btn-primary" id="fc-know">عرفتها</button>
      </div>`;
    const fc = root.querySelector('#fc');
    fc.addEventListener('click', () => fc.classList.toggle('flipped'));
    root.querySelector('#fc-know').addEventListener('click', async () => {
      await IDB.recordAttempt(this.psalm.number, v.number, true);
      toast('أحسنت! سننتقل للآية التالية');
      this.cardIndex++;
      this.renderFlashcards(root);
      this.renderMasteryOverview();
    });
    root.querySelector('#fc-need-review').addEventListener('click', async () => {
      await IDB.recordAttempt(this.psalm.number, v.number, false);
      await IDB.setBookmarkFlag(this.psalm.number, v.number, 'needsReview', true);
      toast('أُضيفت لقائمة المراجعة');
      this.cardIndex++;
      this.renderFlashcards(root);
      this.renderMasteryOverview();
    });
  },

  /* ======================================================================
     Smart Recitation Engine — "التسميع الصوتى"
     Scopes: كامل المزمور | آية واحدة | الآيات الضعيفة
     ====================================================================== */
  voiceScope: 'full',
  voiceVerseChoice: null, // for single-verse scope
  _session: null,

  async renderVoice(root) {
    if (!VoiceSupport.hasRecognition()) {
      root.innerHTML = `
        <div class="empty-state">
          <div class="icon">🎙</div>
          <h3>التسميع الصوتى غير مدعوم فى هذا المتصفح</h3>
          <p>هذه الميزة تعمل حاليًا على متصفحات Chrome أو Edge على سطح المكتب أو أندرويد.
             جرّب أحد أوضاع الحفظ الأخرى من الأعلى.</p>
        </div>`;
      return;
    }
    await this.renderVoiceSetup(root);
  },

  async renderVoiceSetup(root) {
    const mastery = await IDB.getAllMastery();
    const mine = mastery.filter(m => m.psalm === this.psalm.number);
    const weak = mine.filter(m => m.needsReview || m.mastery < 75);

    root.innerHTML = `
      <p style="color:var(--text-soft); font-size:0.85rem; margin-bottom:1.25rem;">
        ⚠ هذه الميزة تحتاج عادةً اتصالًا بالإنترنت وإذن الميكروفون، لأن أغلب المتصفحات ترسل الصوت
        لخدمة سحابية لتحويله إلى نص. لا يُحفَظ أى تسجيل صوتى — فقط النص المسموع والنتيجة، محليًا على جهازك.
      </p>
      <div class="mode-tabs" id="voice-scope-tabs" role="tablist" aria-label="اختر نوع التسميع">
        <button data-scope="full" class="${this.voiceScope === 'full' ? 'active' : ''}">تسميع المزمور كاملًا</button>
        <button data-scope="verse" class="${this.voiceScope === 'verse' ? 'active' : ''}">تسميع آية واحدة</button>
        <button data-scope="weak" class="${this.voiceScope === 'weak' ? 'active' : ''}" ${weak.length ? '' : 'disabled'}>
          الآيات الضعيفة ${weak.length ? `(${weak.length})` : ''}
        </button>
      </div>
      <div id="voice-scope-body"></div>
    `;

    document.getElementById('voice-scope-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-scope]');
      if (!btn || btn.disabled) return;
      document.querySelectorAll('#voice-scope-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.voiceScope = btn.dataset.scope;
      this.renderVoiceScopeBody(weak);
    });

    this.renderVoiceScopeBody(weak);
  },

  renderVoiceScopeBody(weakList) {
    const body = document.getElementById('voice-scope-body');
    if (!body) return;

    if (this.voiceScope === 'verse') {
      body.innerHTML = `
        <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap; margin-bottom:1.5rem;">
          <label for="voice-verse-select" style="color:var(--text-soft);">اختر آية:</label>
          <select id="voice-verse-select" style="background:var(--bg-elevated); border:1px solid var(--line); border-radius:6px; padding:0.5rem;">
            ${this.psalm.verses.map(v => `<option value="${v.number}">آية ${v.number}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" id="voice-start-btn">ابدأ التسميع</button>
        </div>
        <div id="voice-stage"></div>`;
      document.getElementById('voice-start-btn').addEventListener('click', () => {
        const vnum = Number(document.getElementById('voice-verse-select').value);
        const verse = this.psalm.verses.find(v => v.number === vnum);
        this.startRecitation([verse], 'verse');
      });
      return;
    }

    if (this.voiceScope === 'weak') {
      const verses = weakList.map(w => this.psalm.verses.find(v => v.number === w.verse)).filter(Boolean);
      body.innerHTML = `
        <p style="color:var(--text-soft); margin-bottom:1rem;">
          سيُطلَب منك تسميع ${verses.length} ${verses.length === 1 ? 'آية' : 'آيات'} تحتاج مراجعة، بترتيب المزمور.
        </p>
        <button class="btn btn-primary" id="voice-start-btn">ابدأ تسميع الآيات الضعيفة</button>
        <div id="voice-stage"></div>`;
      document.getElementById('voice-start-btn').addEventListener('click', () => this.startRecitation(verses, 'weak'));
      return;
    }

    // full
    body.innerHTML = `
      <p style="color:var(--text-soft); margin-bottom:1rem;">سيتم تسميع المزمور كاملًا (${this.psalm.verses.length} آية) دفعة واحدة.</p>
      <button class="btn btn-primary" id="voice-start-btn">ابدأ تسميع المزمور كاملًا</button>
      <div id="voice-stage"></div>`;
    document.getElementById('voice-start-btn').addEventListener('click', () => this.startRecitation(this.psalm.verses, 'full'));
  },

  startRecitation(verses, scope) {
    const stage = document.getElementById('voice-stage');
    const session = new RecitationSession(this.psalm.number, verses);
    this._session = session;

    stage.innerHTML = `
      <div style="text-align:center; padding:2rem 0;">
        <div class="mic-pulse" id="mic-pulse" aria-hidden="true">🎙️</div>
        <p id="voice-live-status" role="status" aria-live="polite" style="margin-top:1rem; color:var(--text-soft);">
          جارى الاستماع…
        </p>
        <p style="color:var(--text-soft); font-size:0.85rem;">استمر فى التسميع — لن يظهر النص أمامك، اعتمد على حفظك</p>
        <div id="voice-interim" aria-live="off" style="min-height:1.4em; margin:0.75rem 0; color:var(--text-soft); font-family:var(--font-arabic);"></div>
        <button class="btn btn-primary" id="voice-finish-btn" style="border-radius:999px; padding:0.9rem 2.5rem;">إنهاء التسميع</button>
      </div>`;

    const statusEl = stage.querySelector('#voice-live-status');
    const interimEl = stage.querySelector('#voice-interim');
    const pulseEl = stage.querySelector('#mic-pulse');
    const finishBtn = stage.querySelector('#voice-finish-btn');

    session.start({
      onStatus: (s) => {
        pulseEl.classList.toggle('active', s === 'listening');
        if (s === 'restarting') statusEl.textContent = 'لسه بيسمعك… (استكمال تلقائى)';
        else statusEl.textContent = 'جارى الاستماع…';
      },
      onInterim: (text) => { interimEl.textContent = text; },
      onError: (err) => {
        if (err && err.error === 'not-allowed') {
          statusEl.textContent = 'رفض إذن الميكروفون — فعّله من إعدادات المتصفح';
        } else {
          statusEl.textContent = 'حدث خطأ أثناء الاستماع';
        }
        pulseEl.classList.remove('active');
      },
    });

    finishBtn.addEventListener('click', async () => {
      finishBtn.disabled = true;
      finishBtn.textContent = 'جارٍ التحليل…';
      const result = session.stop();
      result.scope = scope;
      await this.handleRecitationResult(result, stage);
    });
  },

  async handleRecitationResult(result, stage) {
    // Save per-verse mastery
    for (const vr of result.verseResults) {
      await IDB.recordRecitationScore(this.psalm.number, vr.verse, vr.score);
    }
    // Compare with previous attempt of the same scope before overwriting history
    const previous = await IDB.getLastRecitation(this.psalm.number, result.scope);
    await IDB.logRecitation(result);
    this.renderMasteryOverview();
    this.renderRecitationResult(result, previous, stage);
  },

  renderRecitationResult(result, previous, stage) {
    const delta = previous ? result.overallScore - previous.overallScore : null;
    stage.innerHTML = `
      <div style="text-align:center; padding:1rem 0 2rem;">
        <div style="font-size:3rem; font-weight:700; font-family:var(--font-arabic); color:var(--accent);">
          ${result.overallScore}%
        </div>
        <p style="color:var(--text-soft); margin-top:0.25rem;">نتيجة التسميع</p>
        ${previous ? `
          <p style="margin-top:0.5rem; font-size:0.9rem; color:${delta >= 0 ? '#4C8B5E' : 'var(--danger)'};">
            المحاولة السابقة: ${previous.overallScore}% — ${delta >= 0 ? 'تحسّن' : 'تراجع'} ${delta >= 0 ? '+' : ''}${delta}%
          </p>` : ''}
      </div>

      <div class="journey-grid" style="margin-bottom:2rem;">
        <div class="card journey-stat"><div class="num" style="font-size:1.5rem;">${result.correct}</div><div class="label">كلمات صحيحة</div></div>
        <div class="card journey-stat"><div class="num" style="font-size:1.5rem;">${result.wrong}</div><div class="label">كلمات خاطئة</div></div>
        <div class="card journey-stat"><div class="num" style="font-size:1.5rem;">${result.missing}</div><div class="label">كلمات ناقصة</div></div>
        <div class="card journey-stat"><div class="num" style="font-size:1.5rem;">${result.extra}</div><div class="label">كلمات زائدة</div></div>
      </div>

      <h4 style="margin-bottom:0.75rem;">نتيجة كل آية</h4>
      <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1.5rem;">
        ${result.verseResults.map(v => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.9rem; border:1px solid var(--line); border-radius:var(--radius);">
            <span>آية ${v.verse}</span>
            <span style="display:flex; align-items:center; gap:0.5rem;">
              <span style="color:var(--text-soft); font-size:0.85rem;">${v.score}%</span>
              <span class="mastery-dot ${v.score >= 75 ? 'mastery-good' : v.score >= 40 ? 'mastery-mid' : 'mastery-low'}"></span>
            </span>
          </div>`).join('')}
      </div>

      ${result.weakVerses.length ? `
        <h4 style="margin-bottom:0.75rem;">الآيات التى تحتاج مراجعة</h4>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1.5rem;">
          ${result.weakVerses.map(v => `<a class="badge" href="psalm.html?id=${this.psalm.number}&verse=${v.verse}">آية ${v.verse} — ${v.score}%</a>`).join('')}
        </div>` : `<p style="color:var(--text-soft); margin-bottom:1.5rem;">كل الآيات فى مستوى جيد 🎉</p>`}

      <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap:wrap;">
        <button class="btn btn-primary" id="voice-retry-btn">أعد التسميع</button>
        <a class="btn btn-secondary" href="review.html">اذهب للمراجعة</a>
      </div>
    `;
    stage.querySelector('#voice-retry-btn').addEventListener('click', () => {
      this.renderVoiceScopeBody([]); // re-render entry point; scope selection preserved
      this.renderVoice(document.getElementById('memorize-body'));
    });
  },

  async renderMasteryOverview() {
    const all = await IDB.getAllMastery();
    const mine = new Map(all.filter(m => m.psalm === this.psalm.number).map(m => [m.verse, m]));
    const el = document.getElementById('mastery-overview');
    if (!el) return;
    el.innerHTML = this.psalm.verses.map(v => {
      const m = mine.get(v.number);
      const cls = !m ? 'mastery-low' : m.mastery >= 75 ? 'mastery-good' : m.mastery >= 40 ? 'mastery-mid' : 'mastery-low';
      return `<span title="آية ${v.number}: ${m ? m.mastery + '%' : 'لم تُراجع بعد'}" class="mastery-dot ${cls}"></span>`;
    }).join('');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('memorize-root')) Memorize.init();
});
