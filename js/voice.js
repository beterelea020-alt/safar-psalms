/**
 * voice.js
 * Two independent browser-native features (no backend, no audio files required):
 *
 *  1. TTSNarrator — reads verses aloud using the device's built-in Arabic voice
 *     (SpeechSynthesis). Works fully offline IF the OS/browser has an Arabic
 *     voice installed locally; otherwise some browsers fetch voices online.
 *
 *  2. RecitationChecker — listens to the user reciting a verse from memory via
 *     the microphone (SpeechRecognition), compares it to the source text, and
 *     reports correct/incorrect. NOTE: most browser implementations (Chrome/Edge)
 *     send audio to a cloud speech service to transcribe it — this feature
 *     therefore requires an internet connection and microphone permission, and
 *     is NOT part of the offline-first guarantee the rest of the app makes.
 *     Firefox and Safari currently have little or no support for this API.
 */

/* ==========================================================================
   Arabic normalization — shared by search AND recitation scoring.
   Reduces (for comparison purposes only — NEVER mutates the source text):
   tashkeel, tatweel, punctuation, extra whitespace, and a few safe
   orthographic variants (alef forms, ya/alef-maqsura, ta-marbuta, hamza seats).
   ========================================================================== */
function normalizeArabic(text) {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')      // tashkeel + tatweel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[.,،؛:!؟"'`()\[\]{}«»٬٫ـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitWords(text) {
  return (text || '').split(/\s+/).filter(Boolean);
}

/* ==========================================================================
   Word-level sequence alignment (Levenshtein / edit-distance with backtrace).
   Classifies each source word as: match | sub (wrong) | del (missing),
   and each unmatched spoken word as: ins (extra).
   This is what "Arabic Speech Matching" in the spec calls for — ordered,
   position-aware comparison, not a Set() overlap.
   ========================================================================== */
function alignWords(sourceWords, spokenWords) {
  const m = sourceWords.length;
  const n = spokenWords.length;
  const normSource = sourceWords.map(normalizeArabic);
  const normSpoken = spokenWords.map(normalizeArabic);

  // dp[i][j] = edit distance between source[0..i) and spoken[0..j)
  const dp = new Array(m + 1);
  for (let i = 0; i <= m; i++) dp[i] = new Int32Array(n + 1);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = normSource[i - 1] === normSpoken[j - 1] ? 0 : 1;
      const sub = dp[i - 1][j - 1] + subCost;
      const del = dp[i - 1][j] + 1; // source word not said -> missing
      const ins = dp[i][j - 1] + 1; // spoken word not in source -> extra
      dp[i][j] = Math.min(sub, del, ins);
    }
  }

  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (normSource[i - 1] === normSpoken[j - 1] ? 0 : 1)) {
      ops.push({
        type: normSource[i - 1] === normSpoken[j - 1] ? 'match' : 'sub',
        sourceIndex: i - 1, spokenIndex: j - 1,
      });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: 'del', sourceIndex: i - 1, spokenIndex: null });
      i--;
    } else {
      ops.push({ type: 'ins', sourceIndex: null, spokenIndex: j - 1 });
      j--;
    }
  }
  ops.reverse();
  return ops;
}

const VoiceSupport = {
  hasTTS() { return 'speechSynthesis' in window; },
  hasRecognition() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },

  /** All installed Arabic voices, best-sounding first (heuristic — favors "Natural"/"Online"/neural-labeled voices). */
  listArabicVoices() {
    if (!this.hasTTS()) return [];
    const arabicVoices = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('ar'));
    const qualityKeywords = /natural|online|neural|premium|enhanced/i;
    return arabicVoices.sort((a, b) => {
      const aScore = qualityKeywords.test(a.name) ? 1 : 0;
      const bScore = qualityKeywords.test(b.name) ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      return a.name.localeCompare(b.name, 'ar');
    });
  },
};

/* ==========================================================================
   TTSNarrator — "استماع بالنطق الآلى"
   ========================================================================== */
class TTSNarrator {
  constructor(verses, { onVerseStart, onEnd } = {}) {
    this.verses = verses; // [{number, text}]
    this.onVerseStart = onVerseStart || (() => {});
    this.onEnd = onEnd || (() => {});
    this.queueIndex = 0;
    this.speaking = false;
    this.paused = false;
    this.rate = 0.95;
    this._voice = null;
  }

  static getArabicVoice() {
    const preferredURI = (typeof Store !== 'undefined') ? Store.getPreferredVoice() : null;
    const voices = VoiceSupport.listArabicVoices();
    if (preferredURI) {
      const match = voices.find(v => v.voiceURI === preferredURI);
      if (match) return match;
    }
    return voices[0] || null;
  }

  hasArabicVoice() { return !!TTSNarrator.getArabicVoice(); }

  start(fromIndex = 0) {
    if (!VoiceSupport.hasTTS()) return;
    speechSynthesis.cancel();
    this.queueIndex = fromIndex;
    this.speaking = true;
    this.paused = false;
    this._speakCurrent();
  }

  _speakCurrent() {
    if (this.queueIndex >= this.verses.length) {
      this.speaking = false;
      this.onEnd();
      return;
    }
    const v = this.verses[this.queueIndex];
    const utter = new SpeechSynthesisUtterance(v.text);
    utter.lang = 'ar-SA';
    utter.rate = this.rate;
    const voice = TTSNarrator.getArabicVoice();
    if (voice) utter.voice = voice;
    utter.onstart = () => this.onVerseStart(v.number, this.queueIndex);
    utter.onend = () => {
      if (!this.speaking || this.paused) return;
      this.queueIndex += 1;
      this._speakCurrent();
    };
    utter.onerror = () => {
      this.speaking = false;
    };
    speechSynthesis.speak(utter);
  }

  pause() {
    if (!this.speaking) return;
    this.paused = true;
    speechSynthesis.cancel();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this._speakCurrent();
  }
  stop() {
    this.speaking = false;
    this.paused = false;
    speechSynthesis.cancel();
  }
  setRate(r) { this.rate = r; }
}

/* ==========================================================================
   RecitationSession — the Smart Recitation Engine.
   Handles continuous listening across one or more verses (full-psalm,
   single-verse, or a custom set like "weak verses"), auto-restarting
   SpeechRecognition if the browser cuts it off mid-session, then aligns
   the full transcript against the source words to produce a scored,
   per-verse breakdown.

   NOTE (per spec's "technical honesty" requirement): most browsers
   (Chrome/Edge) send the audio to a cloud service to transcribe it, so
   this requires an internet connection and mic permission, and is not
   part of the rest of the app's offline guarantee. No audio is ever
   stored or uploaded by this app itself — only the resulting transcript,
   score, and error breakdown are kept, and only on this device.
   ========================================================================== */
class RecitationSession {
  /**
   * @param {number} psalmNumber
   * @param {Array<{number:number, text:string}>} verses - the verses included in this recitation, in order
   */
  constructor(psalmNumber, verses) {
    this.psalmNumber = psalmNumber;
    this.verses = verses;
    this.sourceWords = []; // [{word, verse}]
    verses.forEach(v => {
      splitWords(v.text).forEach(word => this.sourceWords.push({ word, verse: v.number }));
    });
    this.finalTranscriptParts = [];
    this.recognition = null;
    this.listening = false;
    this._userStopped = false;
    this._Impl = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!this._Impl;
  }

  /**
   * Begin continuous listening. Auto-restarts on unexpected `onend` (browsers
   * often cut recognition off after a pause) until stop() is called by the user.
   */
  start({ onInterim, onStatus, onError } = {}) {
    if (!this.supported) { onError?.(new Error('unsupported')); return; }
    this._userStopped = false;
    this.finalTranscriptParts = [];
    this._onInterim = onInterim || (() => {});
    this._onStatus = onStatus || (() => {});
    this._onError = onError || (() => {});
    this._beginRecognizer();
  }

  _beginRecognizer() {
    const r = new this._Impl();
    r.lang = 'ar-SA';
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) this.finalTranscriptParts.push(res[0].transcript);
        else interim += res[0].transcript;
      }
      if (interim) this._onInterim(interim);
    };
    r.onerror = (e) => {
      // 'no-speech' happens often during natural pauses — not a real error, just restart.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.listening = false;
      this._onError(e);
    };
    r.onend = () => {
      if (this._userStopped) { this.listening = false; return; }
      // Browser closed the session on its own (silence timeout) — keep going.
      this._onStatus('restarting');
      try { this._beginRecognizer(); } catch (e) { this.listening = false; this._onError(e); }
    };

    this.recognition = r;
    this.listening = true;
    this._onStatus('listening');
    try { r.start(); } catch (e) { this.listening = false; this._onError(e); }
  }

  /** Stop listening and return the full analysis. */
  stop() {
    this._userStopped = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) { /* ignore */ }
    }
    this.listening = false;
    return this.analyze();
  }

  analyze() {
    const transcript = this.finalTranscriptParts.join(' ').trim();
    const spokenWords = splitWords(transcript);
    const sourceWordList = this.sourceWords.map(w => w.word);
    const ops = alignWords(sourceWordList, spokenWords);

    const perVerse = new Map(); // verse -> {correct, wrong, missing, extra, total}
    this.verses.forEach(v => perVerse.set(v.number, { verse: v.number, correct: 0, wrong: 0, missing: 0, extra: 0, total: 0 }));

    let lastVerseTouched = this.verses[0]?.number ?? null;
    let correct = 0, wrong = 0, missing = 0, extra = 0;

    ops.forEach(op => {
      if (op.type === 'ins') {
        // Extra word said — attribute to whichever verse we were last aligned to.
        const bucket = perVerse.get(lastVerseTouched);
        if (bucket) bucket.extra += 1;
        extra += 1;
        return;
      }
      const verseNum = this.sourceWords[op.sourceIndex].verse;
      lastVerseTouched = verseNum;
      const bucket = perVerse.get(verseNum);
      bucket.total += 1;
      if (op.type === 'match') { bucket.correct += 1; correct += 1; }
      else if (op.type === 'sub') { bucket.wrong += 1; wrong += 1; }
      else if (op.type === 'del') { bucket.missing += 1; missing += 1; }
    });

    const totalSourceWords = correct + wrong + missing;
    const overallScore = totalSourceWords > 0 ? Math.round((correct / totalSourceWords) * 100) : 0;

    const verseResults = this.verses.map(v => {
      const b = perVerse.get(v.number);
      const score = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
      return { verse: v.number, score, correct: b.correct, wrong: b.wrong, missing: b.missing, extra: b.extra, total: b.total };
    });

    const weakVerses = verseResults.filter(v => v.score < 75).sort((a, b) => a.score - b.score);

    return {
      psalmNumber: this.psalmNumber,
      transcript,
      overallScore,
      correct, wrong, missing, extra,
      totalWords: totalSourceWords,
      verseResults,
      weakVerses,
      at: Date.now(),
    };
  }
}
