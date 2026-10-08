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

test("small vowels after a kana that already ends in that vowel lengthen it", () => {
  assert.equal(toRomaji("ねぇ"), "nee");
  assert.equal(toRomaji("あぁ"), "aa");
  assert.equal(toRomaji("すごぉい"), "sugooi");
  assert.equal(toRomaji("うぅ"), "uu");
  assert.equal(toRomaji("イェス"), "yesu");
  assert.equal(toRomaji("ウィ"), "wi");
  assert.deepEqual(syllables("ねぇ").map(s => s.text), ["ねぇ"]);
});
test("an unpaired っ gets an apostrophe so it can be annotated", () => {
  assert.deepEqual(syllables("あっ"), [{ text: "あ", romaji: "a" }, { text: "っ", romaji: "'" }]);
  assert.equal(toRomaji("あっ"), "a'");
  assert.equal(toRomaji("あっ水"), "a'水");
  assert.deepEqual(syllables("っっか").map(s => s.romaji), ["'", "kka"]);
  assert.deepEqual(syllables("あっー"), [
    { text: "あ", romaji: "a" }, { text: "っ", romaji: "'" }, { text: "ー", romaji: null }]);
  assert.equal(rubyHtml("あっ", new Set(["あ"])), "あ<ruby>っ<rt>'</rt></ruby>");
});
test("decomposed kana are normalised", () => {
  assert.equal(toRomaji("が"), "ga");
  assert.deepEqual(syllables("パ").map(s => s.text), ["パ"]);
});
test("ん stays n before a vowel; per-syllable ruby makes that unambiguous", () => {
  assert.deepEqual(syllables("きんえん").map(s => s.romaji), ["ki", "n", "e", "n"]);
  assert.equal(toRomaji("きんえん"), "kinen");
});
test("leading small kana and a leading ー do not combine or crash", () => {
  assert.deepEqual(syllables("ゃ"), [{ text: "ゃ", romaji: "ya" }]);
  assert.deepEqual(syllables("ぁい").map(s => s.romaji), ["a", "i"]);
  assert.deepEqual(syllables("ーあ"), [{ text: "ー", romaji: null }, { text: "あ", romaji: "a" }]);
});
test("rubyHtml annotates a combined syllable unless all of its kana are known", () => {
  assert.equal(rubyHtml("きゃ", new Set(["き"])), "<ruby>きゃ<rt>kya</rt></ruby>");
  assert.equal(rubyHtml("きゃ", new Set(["き", "ゃ"])), "きゃ");
});
test("rubyHtml escapes quotes and ampersands", () => {
  assert.equal(rubyHtml(`&"'`, new Set()), "&amp;&quot;&#39;");
  assert.equal(rubyHtml("a&b", new Set()), "a&amp;b");
});
test("astral characters (emoji) pass through whole", () => {
  assert.deepEqual(syllables("😀あ"), [{ text: "😀", romaji: null }, { text: "あ", romaji: "a" }]);
  assert.equal(rubyHtml("😀", new Set()), "😀");
});
