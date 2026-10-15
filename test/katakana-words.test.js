import { test } from "node:test";
import assert from "node:assert/strict";
import { KATA_WORDS } from "../js/words-katakana.js";
import { ALL } from "../js/data.js";
import { morae } from "../js/pitch.js";
import { toRomaji } from "../js/romaji.js";

// Only practice katakana plus ー and the small kana: no ゛゜ forms.
const ALLOWED = new Set([...ALL.filter(c => c.script === "kata").map(c => c.kana), ..."ーッャュョァィゥェォ"]);
const nonEmpty = v => typeof v === "string" && v.trim() !== "";

test("there are at least 80 katakana words, with unique spellings", () => {
  assert.ok(KATA_WORDS.length >= 80, `only ${KATA_WORDS.length} words`);
  assert.equal(new Set(KATA_WORDS.map(w => w.kana)).size, KATA_WORDS.length);
});

test("every word uses only practice katakana, ー and small kana", () => {
  for (const w of KATA_WORDS) for (const ch of w.kana) assert.ok(ALLOWED.has(ch), `${w.kana} contains ${ch}`);
});

test("every word has English, Chinese and a pitch accent within its morae", () => {
  for (const w of KATA_WORDS) {
    assert.ok(nonEmpty(w.en) && nonEmpty(w.zh), `${w.kana}: missing translation`);
    assert.ok(Number.isInteger(w.accent) && w.accent >= 0 && w.accent <= morae(w.kana).length, `${w.kana}: accent ${w.accent}`);
    assert.equal(w.kanji, "");
    assert.equal(w.romaji, toRomaji(w.kana));
  }
});
