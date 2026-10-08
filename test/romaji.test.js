import { test } from "node:test";
import assert from "node:assert/strict";
import { syllables, toRomaji, rubyHtml } from "../js/romaji.js";

test("basic hiragana, dakuten and ん", () => {
  assert.equal(toRomaji("さくら"), "sakura");
  assert.equal(toRomaji("がっこう"), "gakkou");
  assert.equal(toRomaji("しんぶん"), "shinbun");
});
test("small ya/yu/yo combinations", () => {
  assert.equal(toRomaji("きょう"), "kyou");
  assert.equal(toRomaji("しゃしん"), "shashin");
  assert.equal(toRomaji("ちゃ"), "cha");
  assert.equal(toRomaji("じゅぎょう"), "jugyou");
});
test("small tsu doubles the next consonant, including ch → tch", () => {
  assert.equal(toRomaji("きって"), "kitte");
  assert.equal(toRomaji("まっちゃ"), "matcha");
});
test("katakana, the long-vowel mark and extended combinations", () => {
  assert.equal(toRomaji("コーヒー"), "koohii");
  assert.equal(toRomaji("パーティー"), "paatii");
  assert.equal(toRomaji("ファン"), "fan");
});
test("non-kana passes through untouched", () => {
  assert.deepEqual(syllables("水を"), [{ text: "水", romaji: null }, { text: "を", romaji: "wo" }]);
  assert.equal(toRomaji("A、b。"), "A、b。");
});
test("syllables keep っ and ー with their syllable", () => {
  assert.deepEqual(syllables("きって").map(s => s.text), ["き", "って"]);
  assert.deepEqual(syllables("コーヒー").map(s => s.text), ["コー", "ヒー"]);
});
test("rubyHtml annotates only syllables that are not known", () => {
  const known = new Set(["あ", "い", "か", "さ"]);
  assert.equal(rubyHtml("あかい", known), "あかい");
  assert.equal(rubyHtml("あめ", known), "あ<ruby>め<rt>me</rt></ruby>");
  assert.equal(rubyHtml("ネコ", known), "<ruby>ネ<rt>ne</rt></ruby><ruby>コ<rt>ko</rt></ruby>");
  assert.equal(rubyHtml("水", known), "水");
});
test("rubyHtml escapes HTML in the input", () => {
  assert.equal(rubyHtml("<b>", new Set()), "&lt;b&gt;");
});
