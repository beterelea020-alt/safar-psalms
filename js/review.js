/**
 * review.js — powers review.html
 * Lightweight local "spaced review" heuristic — no backend, no accounts.
 * Priority score favors: low mastery, marked needsReview, long time since last review.
 */

const ReviewEngine = {
  async getCandidates() {
    const all = await IDB.getAllMastery();
    const now = Date.now();
    const DAY = 86400000;
    return all
      .map(m => {
        const daysSince = m.lastReviewed ? (now - m.lastReviewed) / DAY : 999;
        const isDue = !m.nextReviewAt || m.nextReviewAt <= now;
        // priority: lower mastery + longer gap + explicit needsReview flag = higher priority
        let score = (100 - m.mastery) + Math.min(daysSince * 3, 60);
        if (m.needsReview) score += 40;
        if (isDue) score += 15;
        return { ...m, daysSince, score, isDue };
      })
      .filter(m => m.isDue && (m.score > 20 || m.needsReview))
      .sort((a, b) => b.score - a.score);
  },

  async init() {
    const candidates = await this.getCandidates();
    const root = document.getElementById('review-root');

    if (!candidates.length) {
      root.innerHTML = `
        <div class="empty-state">
          <div class="icon">✓</div>
          <h2>لا توجد آيات تحتاج مراجعة الآن</h2>
          <p>ابدأ بحفظ بعض الآيات من صفحة أى مزمور، وستظهر هنا الآيات التى تحتاج مراجعة.</p>
          <a class="btn btn-primary" href="library.html">تصفح المكتبة</a>
        </div>`;
      return;
    }

    const grouped = new Map();
    for (const c of candidates) {
      if (!grouped.has(c.psalm)) grouped.set(c.psalm, []);
      grouped.get(c.psalm).push(c);
    }

    const psalmTitles = await Promise.all([...grouped.keys()].map(async n => [n, (await PsalmsData.get(n))?.title]));
    const titleMap = new Map(psalmTitles);

    root.innerHTML = `
      <div class="card" style="margin-bottom:2rem;">
        <h3 style="margin-bottom:0.5rem;">المراجعة المقترحة اليوم</h3>
        <p style="color:var(--text-soft); margin:0;">
          ${candidates.length} آية تحتاج انتباهك، من ${grouped.size} مزمورًا.
        </p>
      </div>
      ${[...grouped.entries()].map(([psalmNum, verses]) => `
        <div class="card" style="margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <h4 style="margin:0;">${titleMap.get(psalmNum) || 'مزمور ' + psalmNum}</h4>
            <a class="btn btn-sm btn-secondary" href="memorize.html?id=${psalmNum}">راجع الآن</a>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${verses.map(v => `
              <a href="psalm.html?id=${psalmNum}&verse=${v.verse}" class="badge" title="مستوى الإتقان: ${v.mastery}%">
                آية ${v.verse} <span class="mastery-dot ${v.mastery >= 75 ? 'mastery-good' : v.mastery >= 40 ? 'mastery-mid' : 'mastery-low'}"></span>
              </a>`).join('')}
          </div>
        </div>
      `).join('')}
    `;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('review-root')) ReviewEngine.init();
});
