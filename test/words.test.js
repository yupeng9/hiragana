import { test } from "node:test";
import assert from "node:assert/strict";
import { wordsFor, findWord } from "../js/words.js";
import { WORDS } from "../js/data.js";
import { KATA_WORDS } from "../js/words-katakana.js";
import { VOICED_WORDS } from "../js/words-voiced.js";

test("wordsFor returns every hiragana word or every katakana word", () => {
  assert.equal(wordsFor("hira").length, WORDS.length + VOICED_WORDS.length);
  assert.equal(wordsFor("kata"), KATA_WORDS);
  assert.equal(wordsFor("anything"), wordsFor("hira"));
});

test("findWord looks in all lists and returns undefined for unknown words", () => {
  assert.equal(findWord(WORDS[0].kana), WORDS[0]);
  assert.equal(findWord(VOICED_WORDS[0].kana), VOICED_WORDS[0]);
  assert.equal(findWord(KATA_WORDS[0].kana), KATA_WORDS[0]);
  assert.equal(findWord("zzz"), undefined);
});

test("no kana spelling appears in two lists", () => {
  const all = [...WORDS, ...VOICED_WORDS, ...KATA_WORDS].map(w => w.kana);
  assert.equal(new Set(all).size, all.length);
});
