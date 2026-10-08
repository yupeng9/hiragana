import { test } from "node:test";
import assert from "node:assert/strict";
import { VOCAB } from "../js/decks/vocab.js";
import { KANJI } from "../js/decks/kanji.js";
import { GRAMMAR } from "../js/decks/grammar.js";

// hiragana, katakana, ー, Japanese punctuation/fullwidth forms, ideographic space and ASCII space
const KANA = /^[぀-ゟ゠-ヿ　-〿！-～ ・ー〜～]+$/u;
const KATAKANA = /^[゠-ヿー]+$/u;
const KUN = /^-?[぀-ゟ.]+-?$/u;
const SMALL = /[ゃゅょァィゥェォャュョ]/gu;

const nonEmpty = v => typeof v === "string" && v.trim() !== "";
const morae = kana => [...kana.replace(SMALL, "")].length;

function checkExample(ex, label) {
  assert.ok(ex && typeof ex === "object", `${label}: example missing`);
  for (const f of ["jp", "kana", "en", "zh"]) assert.ok(nonEmpty(ex[f]), `${label}: example.${f} is empty`);
  assert.match(ex.kana, KANA, `${label}: example.kana has non-kana characters: ${ex.kana}`);
}

function uniqueKeys(deck, key) {
  const seen = new Set();
  for (const e of deck) {
    assert.ok(nonEmpty(e[key]), `entry without ${key}`);
    assert.ok(!seen.has(e[key]), `duplicate ${key}: ${e[key]}`);
    seen.add(e[key]);
  }
}

test("vocab: keys are unique and required fields present", () => {
  assert.ok(Array.isArray(VOCAB) && VOCAB.length > 0);
  uniqueKeys(VOCAB, "word");
  for (const e of VOCAB) for (const f of ["word", "kana", "en", "zh"]) assert.ok(nonEmpty(e[f]), `${e.word}: ${f} is empty`);
});

test("vocab: kana fields contain only kana and Japanese punctuation", () => {
  for (const e of VOCAB) assert.match(e.kana, KANA, `${e.word}: kana has non-kana characters: ${e.kana}`);
});

test("vocab: accent is null or an integer within the mora count", () => {
  for (const e of VOCAB) {
    if (e.accent === null) continue;
    assert.ok(Number.isInteger(e.accent), `${e.word}: accent is not an integer or null: ${e.accent}`);
    assert.ok(e.accent >= 0 && e.accent <= morae(e.kana),
      `${e.word}: accent ${e.accent} outside 0..${morae(e.kana)} (${e.kana})`);
  }
});

test("vocab: every entry has a complete example sentence", () => {
  for (const e of VOCAB) checkExample(e.ex, e.word);
});

test("kanji: keys are unique and required fields present", () => {
  assert.ok(Array.isArray(KANJI) && KANJI.length > 0);
  uniqueKeys(KANJI, "kanji");
  for (const e of KANJI) for (const f of ["kanji", "en", "zh"]) assert.ok(nonEmpty(e[f]), `${e.kanji}: ${f} is empty`);
});

test("kanji: kanji is a single Han character", () => {
  for (const e of KANJI) assert.match(e.kanji, /^\p{Script=Han}$/u, `${e.kanji}: not a single Han character`);
});

test("kanji: on is katakana only, kun is hiragana with . and - only", () => {
  for (const e of KANJI) {
    assert.ok(Array.isArray(e.on) && Array.isArray(e.kun), `${e.kanji}: on/kun must be arrays`);
    for (const r of e.on) assert.match(r, KATAKANA, `${e.kanji}: on reading not katakana: ${r}`);
    for (const r of e.kun) assert.match(r, KUN, `${e.kanji}: kun reading invalid: ${r}`);
    assert.ok(e.on.length + e.kun.length > 0, `${e.kanji}: on and kun both empty`);
  }
});

test("kanji: 1-3 example words, each containing the kanji with kana reading", () => {
  for (const e of KANJI) {
    assert.ok(Array.isArray(e.words) && e.words.length >= 1 && e.words.length <= 3,
      `${e.kanji}: expected 1-3 words, got ${e.words?.length}`);
    for (const w of e.words) {
      for (const f of ["word", "kana", "en", "zh"]) assert.ok(nonEmpty(w[f]), `${e.kanji}: word.${f} is empty`);
      assert.ok(w.word.includes(e.kanji), `${e.kanji}: word ${w.word} does not contain the kanji`);
      assert.match(w.kana, KANA, `${e.kanji}: word ${w.word} kana has non-kana characters: ${w.kana}`);
    }
  }
});

test("grammar: keys are unique and required fields present", () => {
  assert.ok(Array.isArray(GRAMMAR) && GRAMMAR.length > 0);
  uniqueKeys(GRAMMAR, "id");
  for (const e of GRAMMAR) for (const f of ["id", "pattern", "en", "zh"]) assert.ok(nonEmpty(e[f]), `${e.id}: ${f} is empty`);
});

test("grammar: 1-2 complete examples each", () => {
  for (const e of GRAMMAR) {
    assert.ok(Array.isArray(e.ex) && e.ex.length >= 1 && e.ex.length <= 2,
      `${e.id}: expected 1-2 examples, got ${e.ex?.length}`);
    e.ex.forEach((x, i) => checkExample(x, `${e.id}[${i}]`));
  }
});
