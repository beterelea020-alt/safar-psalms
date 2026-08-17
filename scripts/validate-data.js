#!/usr/bin/env node
/**
 * validate-data.js
 * Validates /data/psalms.json against structural rules.
 * This does NOT check theological/translation accuracy — only structure:
 * sequence, duplicates, missing verses, empty text, malformed JSON, broken audio refs.
 *
 * Run: node scripts/validate-data.js
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'psalms.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'validation-report.json');

function fail(msg) {
  console.error('FATAL:', msg);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(DATA_PATH, 'utf-8');
} catch (e) {
  fail(`Cannot read ${DATA_PATH}: ${e.message}`);
}

let psalms;
try {
  psalms = JSON.parse(raw);
} catch (e) {
  fail(`Malformed JSON in psalms.json: ${e.message}`);
}

const errors = [];
const warnings = [];

if (!Array.isArray(psalms)) fail('psalms.json root must be an array');

// 1. Complete Psalm sequence (this edition follows Septuagint numbering: 1-151)
const seenIds = new Set();
const numbers = psalms.map(p => p.number).sort((a, b) => a - b);
for (let i = 0; i < numbers.length; i++) {
  const expected = i + 1;
  if (numbers[i] !== expected) {
    warnings.push(`Sequence gap: expected Psalm ${expected}, found ${numbers[i]} at position ${i}`);
  }
}

psalms.forEach((p, idx) => {
  const label = `Psalm ${p.number ?? '?'} (index ${idx})`;

  // 2. Duplicate IDs
  if (seenIds.has(p.id)) errors.push(`${label}: duplicate id ${p.id}`);
  seenIds.add(p.id);

  // 3. Missing required fields
  if (p.number === undefined || p.number === null) errors.push(`${label}: missing "number"`);
  if (!p.title) warnings.push(`${label}: missing "title"`);
  if (!Array.isArray(p.verses) || p.verses.length === 0) {
    errors.push(`${label}: missing or empty "verses" array`);
    return;
  }

  // 4. Verse-level checks
  const seenVerseNums = new Set();
  let lastNum = 0;
  p.verses.forEach((v, vIdx) => {
    if (v.number === undefined || v.number === null) {
      errors.push(`${label} verse index ${vIdx}: missing verse number`);
    } else {
      if (seenVerseNums.has(v.number)) {
        errors.push(`${label}: duplicate verse number ${v.number} — likely a text-extraction artifact (needs manual check against source)`);
      }
      seenVerseNums.add(v.number);
      if (v.number < lastNum) {
        warnings.push(`${label}: verse ${v.number} appears out of order after verse ${lastNum}`);
      }
      if (v.number > lastNum + 1 && lastNum !== 0) {
        warnings.push(`${label}: possible gap — verse ${lastNum} followed by verse ${v.number}`);
      }
      lastNum = v.number;
    }
    if (!v.text || !v.text.trim()) {
      errors.push(`${label} verse ${v.number}: empty text`);
    }
  });

  // 5. Broken audio references
  if (p.audio) {
    // We can't check filesystem existence from pure data here reliably across environments,
    // this is a placeholder check for well-formed paths only.
    if (typeof p.audio !== 'string' || !p.audio.endsWith('.mp3')) {
      warnings.push(`${label}: audio field is not a valid .mp3 path`);
    }
  }
});

// 6. Cross-psalm duplicate verse text detection (possible copy/paste extraction errors)
const seenTexts = new Map();
psalms.forEach(p => {
  (p.verses || []).forEach(v => {
    const key = (v.text || '').trim();
    if (!key) return;
    if (seenTexts.has(key)) {
      warnings.push(`Identical verse text found in Psalm ${p.number}:${v.number} and Psalm ${seenTexts.get(key)}`);
    } else {
      seenTexts.set(key, `${p.number}:${v.number}`);
    }
  });
});

const report = {
  generated_at: new Date().toISOString(),
  total_psalms: psalms.length,
  total_verses: psalms.reduce((sum, p) => sum + (p.verses ? p.verses.length : 0), 0),
  error_count: errors.length,
  warning_count: warnings.length,
  errors,
  warnings,
  note: "This validator checks STRUCTURE only (sequence, duplicates, missing/empty fields). " +
        "It cannot verify translation accuracy or diacritic correctness — the source PDF's font " +
        "produces known extraction artifacts (stray letters replacing certain diacritics, and " +
        "occasional digit misreads e.g. '10' extracted as '11'). Manual proofreading against the " +
        "printed source is required before treating this dataset as final."
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

console.log(`Validated ${psalms.length} psalms, ${report.total_verses} verses.`);
console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}`);
console.log(`Full report written to ${REPORT_PATH}`);
if (errors.length > 0) {
  console.log('\nFirst 20 errors:');
  errors.slice(0, 20).forEach(e => console.log(' -', e));
  process.exitCode = 1;
}
