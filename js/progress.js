/**
 * progress.js — "رحلتى مع المزامير" journey stats, used on index.html and my-psalms.html
 */

const Progress = {
  async summary() {
    const readMap = Store.getReadPsalms();
    const memorizing = Store.getMemorizingPsalms();
    const mastery = await IDB.getAllMastery();
    const reviewed = mastery.filter(m => m.reviewCount > 0);
    const streak = Store.getStreak();

    return {
      readCount: Object.keys(readMap).length,
      memorizingCount: memorizing.length,
      reviewedVerseCount: reviewed.length,
      streakDays: streak.count,
      streakDaySet: new Set(streak.days || []),
    };
  },

  async continueReading() {
    const pos = Store.getLastPosition();
    if (!pos) return null;
    const psalm = await PsalmsData.get(pos.num);
    if (!psalm) return null;
    const pct = Math.min(100, Math.round((pos.verse / psalm.verses[psalm.verses.length - 1].number) * 100));
    return { psalm, verse: pos.verse, pct };
  },

  async mostReturned(limit = 5) {
    const freq = Store.getFrequency();
    const entries = Object.entries(freq).map(([num, count]) => ({ num: Number(num), count }));
    entries.sort((a, b) => b.count - a.count);
    const top = entries.slice(0, limit);
    const withTitles = await Promise.all(top.map(async e => ({ ...e, psalm: await PsalmsData.get(e.num) })));
    return withTitles.filter(e => e.psalm);
  },
};
