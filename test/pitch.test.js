import { test } from "node:test";
import assert from "node:assert/strict";
import { morae, accentTitle } from "../js/pitch.js";
import { VOCAB } from "../js/decks/vocab.js";

test("small ya/yu/yo and small vowels join the mora before them", () => {
  assert.deepEqual(morae("きょう"), ["きょ", "う"]);
  assert.deepEqual(morae("シャツ"), ["シャ", "ツ"]);
  assert.deepEqual(morae("ファン"), ["ファ", "ン"]);
});

test("っ/ッ, ー and ん/ン are morae of their own", () => {
  assert.deepEqual(morae("きって"), ["き", "っ", "て"]);
  assert.deepEqual(morae("コーヒー"), ["コ", "ー", "ヒ", "ー"]);
  assert.deepEqual(morae("ラーメン"), ["ラ", "ー", "メ", "ン"]);
});

test("morae handles empty text and a lone small kana", () => {
  assert.deepEqual(morae(""), []);
  assert.deepEqual(morae("ゃ"), ["ゃ"]);
});

test("accentTitle counts morae, not characters", () => {
  assert.match(accentTitle("きょう", 2), /2 morae/);
  assert.match(accentTitle("きょう", 2), /drops right after the word/);
  assert.match(accentTitle("きょう", 1), /drops after mora 1/);
  assert.match(accentTitle("あ", 1), /1 mora\./);
});

test("every vocabulary accent fits within the word's morae", () => {
  for (const v of VOCAB) {
    if (Number.isInteger(v.accent)) assert.ok(v.accent <= morae(v.kana).length, `${v.word}: ${v.accent} > ${morae(v.kana).length}`);
  }
});
