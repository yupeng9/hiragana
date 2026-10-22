// The word bank: saved ⭐ words plus typed-in "My words", and the pure logic behind the quiz
// (reading check, weighted pick, choices, form validation). No DOM here; see bank-ui.js.
import { findWord } from "./words.js";
import { toRomaji } from "./romaji.js";
import { morae } from "./pitch.js";
import { MAX_BOX } from "./data.js";
import { savedWords, liveMyWords, statOf } from "./store.js";

export const entryKey = (word, kana) => `${word}|${kana}`;
export const statKey = entry => `w:${entry.key}`;
export const meaningText = e => [e.en, e.zh].filter(Boolean).join(" · ");

// Saved built-in words and My words as one list. A My word with the same word and kana as a
// saved one replaces it.
export function bankEntries(state) {
  const map = new Map();
  for (const { kana } of savedWords(state)) {
    const w = findWord(kana);
    if (!w) continue;
    const word = w.kanji || w.kana;
    const key = entryKey(word, w.kana);
    map.set(key, { key, word, kana: w.kana, en: w.en, zh: w.zh, accent: w.accent, source: "saved" });
  }
  for (const m of liveMyWords(state)) {
    const key = entryKey(m.word, m.kana);
    map.set(key, {
      key, word: m.word, kana: m.kana, en: m.en || "", zh: m.zh || "",
      accent: Number.isInteger(m.accent) ? m.accent : null, source: "mine", id: m.id,
    });
  }
  return [...map.values()];
}

export const inSource = (entries, source) =>
  source === "saved" || source === "mine" ? entries.filter(e => e.source === source) : entries;

// ---------- Reading check ----------
const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const MACRON = { ā: "aa", ī: "ii", ū: "uu", ē: "ee", ō: "oo" };
// Alternate spellings folded into one form. The y-forms go first; the h of "shu"/"chu" is kept.
const FOLD = [
  [/sya/g, "sha"], [/syu/g, "shu"], [/syo/g, "sho"], [/tya/g, "cha"], [/tyu/g, "chu"], [/tyo/g, "cho"],
  [/jya/g, "ja"], [/jyu/g, "ju"], [/jyo/g, "jo"], [/zya/g, "ja"], [/zyu/g, "ju"], [/zyo/g, "jo"],
  [/si/g, "shi"], [/ti/g, "chi"], [/tu/g, "tsu"], [/(?<![sc])hu/g, "fu"], [/zi/g, "ji"],
  [/cch/g, "tch"], [/n{2,}/g, "n"], [/ou/g, "oo"], [/ei/g, "ee"],
];

export function canonicalRomaji(text) {
  let r = text.normalize("NFKC").toLowerCase()
    .replace(/[āīūēō]/g, c => MACRON[c])
    .replace(/[\s'’\-・.,]/g, "");
  for (const [re, to] of FOLD) r = r.replace(re, to);
  return r;
}

// Words are read as spelled (は stays "ha").
export function matchesReading(input, kana) {
  const typed = String(input ?? "").normalize("NFC").trim();
  if (!typed) return false;
  if (/[ぁ-ゖァ-ヶ]/.test(typed)) return toHira(typed.replace(/\s/g, "")) === toHira(kana);
  return canonicalRomaji(typed) === canonicalRomaji(toRomaji(kana));
}

// ---------- Picking ----------
const shuffle = (list, rnd = Math.random) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// Weak words (lower box) come up far more often, like the characters on Practice.
export function pickEntry(entries, state, lastKey, rnd = Math.random) {
  const pool = entries.length > 1 ? entries.filter(e => e.key !== lastKey) : entries;
  if (!pool.length) return null;
  const weights = pool.map(e => 2 ** (MAX_BOX - statOf(state, statKey(e)).box));
  let r = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// The answer plus up to 3 other entries that differ in word, reading, meaning and label, shuffled.
export function buildChoices(entries, answer, label, rnd = Math.random) {
  const seen = new Set([label(answer)]);
  const picked = [];
  // A distractor must differ in word, reading and meaning, or it could be a second right answer.
  const clash = x => x.word === answer.word || x.kana === answer.kana || meaningText(x) === meaningText(answer);
  for (const e of shuffle(entries.filter(x => x.key !== answer.key && !clash(x)), rnd)) {
    const l = label(e);
    if (seen.has(l)) continue;
    seen.add(l);
    picked.push(e);
    if (picked.length === 3) break;
  }
  return shuffle([answer, ...picked], rnd);
}

export const availableModes = count =>
  count >= 4 ? ["type", "pickMeaning", "pickWord", "listen"] : ["type"];

// ---------- The add / edit form ----------
const KANA_ONLY = /^[ぁ-ゖァ-ヶー]+$/u;

export function validateMyWord({ word, kana, en, zh, accent } = {}) {
  const clean = v => String(v ?? "").normalize("NFC").trim();
  word = clean(word); kana = clean(kana); en = clean(en); zh = clean(zh);
  if (!word) return { error: "Enter the Japanese word." };
  if (!kana) return { error: "Enter the reading in kana." };
  if (!KANA_ONLY.test(kana)) return { error: "The reading must be kana only (hiragana or katakana)." };
  if (!en && !zh) return { error: "Enter an English or Chinese meaning." };
  const out = { word, kana, en, zh };
  const raw = clean(accent);
  if (raw !== "") {
    const max = morae(kana).length;
    const n = Number(raw);
    if (!/^\d+$/.test(raw)) return { error: "Pitch accent must be a whole number." };
    if (n > max) return { error: `Pitch accent must be a whole number from 0 to ${max}.` };
    out.accent = n;
  }
  return { value: out };
}
