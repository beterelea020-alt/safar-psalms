/**
 * sharing.js — Web Share API with copy-link fallback (section 31).
 */

const Sharing = {
  buildUrl(psalmNum, verseNum) {
    const url = new URL('psalm.html', location.href);
    url.searchParams.set('id', psalmNum);
    if (verseNum) url.searchParams.set('verse', verseNum);
    return url.toString();
  },

  async sharePsalm(psalm, verseNum) {
    const url = this.buildUrl(psalm.number, verseNum);
    const title = verseNum ? `${psalm.title} — الآية ${verseNum}` : psalm.title;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: 'سفر المزامير', url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // user cancelled
      }
    }
    await this.copyLink(url);
  },

  async copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      toast('تم نسخ الرابط');
    } catch (e) {
      // very old browsers: fallback prompt
      window.prompt('انسخ الرابط:', url);
    }
  },
};
