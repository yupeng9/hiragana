// Offline lookup over the words the app already knows, for the Add word form.
// Sources, in priority order: the Practice word lists, the Review vocabulary deck, and the
// example words under each kanji. No DOM here.
import { wordsFor } from "./words.js";
import { VOCAB } from "./decks/vocab.js";
import { KANJI } from "./decks/kanji.js";

const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const clean = q => String(q ?? "").normalize("NFKC").replace(/[\u2018\u2019]/g, "'").trim();
const isEnglish = q => /^[A-Za-z][A-Za-z\s'’-]*$/.test(q);
const keyOf = (word, kana) => `${word}|${kana}`;

let index = null;

function add(map, entry) {
  const key = keyOf(entry.word, entry.kana);
  const have = map.get(key);
  if (!have) map.set(key, { key, ...entry });
  else if (have.accent == null && entry.accent != null) map.set(key, { ...have, accent: entry.accent });
}

// Built once on first use: [{ key, word, kana, en, zh, accent (number or null), source }].
export function localIndex() {
  if (index) return index;
  const map = new Map();
  for (const w of [...wordsFor("hira"), ...wordsFor("kata")]) {
    add(map, { word: w.kanji || w.kana, kana: w.kana, en: w.en, zh: w.zh, accent: Number.isInteger(w.accent) ? w.accent : null, source: "built-in" });
  }
  for (const v of VOCAB) {
    add(map, { word: v.word, kana: v.kana, en: v.en, zh: v.zh, accent: Number.isInteger(v.accent) ? v.accent : null, source: "built-in" });
  }
  for (const k of KANJI) {
    for (const w of k.words ?? []) add(map, { word: w.word, kana: w.kana, en: w.en, zh: w.zh, accent: null, source: "built-in" });
  }
  index = [...map.values()];
  return index;
}

// 0 = exact, 1 = prefix, 2 = contains, null = no match.
function japaneseScore(entry, q, qh) {
  const wordH = toHira(entry.word), kanaH = toHira(entry.kana);
  if (entry.word === q || wordH === qh || kanaH === qh) return 0;
  if (wordH.startsWith(qh) || kanaH.startsWith(qh)) return 1;
  if ([...qh].length >= 2 && (wordH.includes(qh) || kanaH.includes(qh))) return 2;
  return null;
}

function englishScore(entry, ql) {
  const en = String(entry.en ?? "").toLowerCase();
  if (!en) return null;
  const parts = en.split(/;\s*/);
  if (en === ql || parts.includes(ql)) return 0;
  if (en.startsWith(ql) || en.split(/[^a-z']+/).some(w => w.startsWith(ql))) return 1;
  if (en.includes(ql)) return 2;
  return null;
}

// Up to `limit` matches for a typed query, best first. `exclude` is a Set of keys to skip.
export function lookupLocal(query, { exclude = new Set(), limit = 6 } = {}) {
  const q = clean(query);
  if (!q) return [];
  const english = isEnglish(q), qh = toHira(q), ql = q.toLowerCase();
  const scored = [];
  for (const e of localIndex()) {
    if (exclude.has(e.key)) continue;
    const score = english ? englishScore(e, ql) : japaneseScore(e, q, qh);
    if (score !== null) scored.push([score, e]);
  }
  scored.sort((a, b) => a[0] - b[0]);            // stable: ties keep the index order
  return scored.slice(0, limit).map(s => s[1]);
}

// Entries whose word or reading equals the query exactly (hiragana-folded).
export function exactLocal(query, exclude = new Set()) {
  const q = clean(query);
  if (!q) return [];
  const qh = toHira(q);
  return localIndex().filter(e => !exclude.has(e.key) && (toHira(e.word) === qh || toHira(e.kana) === qh));
}
