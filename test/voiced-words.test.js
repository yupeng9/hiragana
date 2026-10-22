import { test } from "node:test";
import assert from "node:assert/strict";
import { VOICED_WORDS } from "../js/words-voiced.js";
import { WORDS } from "../js/data.js";
import { morae } from "../js/pitch.js";
import { toRomaji } from "../js/romaji.js";

const HIRAGANA = /^[ぁ-ゖー]+$/u;
const VOICED_OR_COMBINED = /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょ]/u;
const nonEmpty = v => typeof v === "string" && v.trim() !== "";

test("there are at least 60 voiced hiragana words, unique and not repeated from WORDS", () => {
  assert.ok(VOICED_WORDS.length >= 60, `only ${VOICED_WORDS.length} words`);
  assert.equal(new Set(VOICED_WORDS.map(w => w.kana)).size, VOICED_WORDS.length);
  const basic = new Set(WORDS.map(w => w.kana));
  for (const w of VOICED_WORDS) assert.ok(!basic.has(w.kana), `${w.kana} is already in WORDS`);
});

test("every word is hiragana, NFC, and has a voiced or combined kana", () => {
  for (const w of VOICED_WORDS) {
    assert.match(w.kana, HIRAGANA, w.kana);
    assert.equal(w.kana, w.kana.normalize("NFC"), `${w.kana} is not NFC`);
    assert.match(w.kana, VOICED_OR_COMBINED, `${w.kana} has no voiced or combined kana`);
  }
});

test("every word has translations, a derived romaji and an accent within its morae", () => {
  for (const w of VOICED_WORDS) {
    assert.ok(nonEmpty(w.en) && nonEmpty(w.zh), `${w.kana}: missing translation`);
    assert.equal(w.romaji, toRomaji(w.kana));
    assert.equal(typeof w.kanji, "string");
    assert.ok(Number.isInteger(w.accent) && w.accent >= 0 && w.accent <= morae(w.kana).length, `${w.kana}: accent ${w.accent}`);
  }
});
