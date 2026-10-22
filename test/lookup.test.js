import { test } from "node:test";
import assert from "node:assert/strict";
import { localIndex, lookupLocal, exactLocal } from "../js/lookup.js";
import { VOCAB } from "../js/decks/vocab.js";
import { KANJI } from "../js/decks/kanji.js";

test("the index merges the word lists, the vocabulary deck and the kanji example words", () => {
  const index = localIndex();
  assert.ok(index.length > 450, `only ${index.length} entries`);
  assert.equal(new Set(index.map(e => e.key)).size, index.length, "keys are unique");
  const find = (word, kana) => index.find(e => e.word === word && e.kana === kana);
  assert.ok(find("愛", "あい"), "from the practice lists");
  assert.ok(find("学生", "がくせい") || find(VOCAB[0].word, VOCAB[0].kana), "from the vocabulary deck");
  const kw = KANJI[0].words[0];
  assert.ok(find(kw.word, kw.kana), "from the kanji example words");
  for (const e of index) {
    assert.equal(typeof e.word, "string"); assert.equal(typeof e.kana, "string");
    assert.equal(e.source, "built-in");
  }
});

test("an entry with a pitch number is kept over a duplicate without one", () => {
  const index = localIndex();
  for (const v of VOCAB) {
    if (!Number.isInteger(v.accent)) continue;
    const e = index.find(x => x.key === `${v.word}|${v.kana}`);
    assert.ok(e && Number.isInteger(e.accent), `${v.word} lost its accent`);
  }
});

test("Japanese search: exact, prefix and hiragana-folded matches, best first", () => {
  const r = lookupLocal("あい");
  assert.equal(r[0].kana, "あい");
  const hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  assert.ok(r.every(e => hira(e.kana).includes("あい") || hira(e.word).includes("あい")), "katakana words match through folding");
  assert.equal(lookupLocal("愛")[0].word, "愛");
  assert.equal(lookupLocal("アイ")[0].kana, "あい", "katakana input matches hiragana readings");
  const prefixes = lookupLocal("あ");
  assert.ok(prefixes.length > 0 && prefixes.every(e => e.word.startsWith("あ") || e.kana.startsWith("あ")), "a single character only matches the start");
});

test("English search matches meanings, exact first", () => {
  const r = lookupLocal("love");
  assert.ok(r.some(e => e.word === "愛"));
  assert.equal(lookupLocal("LOVE")[0].en.toLowerCase().includes("love"), true);
  assert.deepEqual(lookupLocal("qzqzqz"), []);
});

test("limit, exclude and empty queries", () => {
  assert.ok(lookupLocal("い", { limit: 3 }).length <= 3);
  assert.equal(lookupLocal("い").length <= 6, true, "default limit is 6");
  const first = lookupLocal("あい")[0];
  assert.ok(!lookupLocal("あい", { exclude: new Set([first.key]) }).some(e => e.key === first.key));
  assert.deepEqual(lookupLocal(""), []);
  assert.deepEqual(lookupLocal("   "), []);
  assert.deepEqual(lookupLocal(null), []);
});

test("exactLocal matches a whole word or reading only", () => {
  assert.ok(exactLocal("あい").some(e => e.word === "愛"));
  assert.ok(exactLocal("愛").some(e => e.word === "愛"));
  assert.ok(exactLocal("アイ").some(e => e.word === "愛"), "katakana folds to hiragana");
  assert.deepEqual(exactLocal(""), []);
  assert.ok(!exactLocal("あ").some(e => e.word === "愛"), "a prefix is not exact");
  const first = exactLocal("あい")[0];
  assert.ok(!exactLocal("あい", new Set([first.key])).some(e => e.key === first.key));
});
