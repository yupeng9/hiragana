import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bankEntries, inSource, statKey, meaningText, matchesReading, canonicalRomaji,
  pickEntry, buildChoices, validateMyWord, availableModes,
} from "../js/bank.js";
import { emptyState, saveMyWord, deleteMyWord, toggleWord, recordAnswer } from "../js/store.js";
import { WORDS } from "../js/data.js";

const mine = (s, id, word, kana, extra = {}) => saveMyWord(s, { id, word, kana, en: "x", zh: "", ...extra }, 5);

test("bankEntries combines saved built-in words and live My words; My words win on a clash", () => {
  const s = emptyState();
  const w = WORDS[0];                                  // a built-in hiragana word
  toggleWord(s, w.kana, 1);
  toggleWord(s, "存在しない", 1);                      // not in any list: skipped
  mine(s, "m1", "猫", "ねこ");
  const entries = bankEntries(s);
  assert.deepEqual(entries.map(e => e.source).sort(), ["mine", "saved"]);
  assert.equal(entries.find(e => e.source === "saved").kana, w.kana);
  // a My word with the same word and kana replaces the saved one
  mine(s, "m2", w.kanji || w.kana, w.kana);
  const clash = bankEntries(s).filter(e => e.kana === w.kana);
  assert.equal(clash.length, 1);
  assert.equal(clash[0].source, "mine");
  deleteMyWord(s, "m2", 9);
  assert.equal(bankEntries(s).filter(e => e.kana === w.kana)[0].source, "saved");
});

test("inSource filters by source", () => {
  const entries = [{ source: "saved" }, { source: "mine" }, { source: "mine" }];
  assert.equal(inSource(entries, "both").length, 3);
  assert.equal(inSource(entries, "saved").length, 1);
  assert.equal(inSource(entries, "mine").length, 2);
  assert.equal(inSource(entries, "junk").length, 3);
});

test("statKey and meaningText", () => {
  assert.equal(statKey({ key: "猫|ねこ" }), "w:猫|ねこ");
  assert.equal(meaningText({ en: "cat", zh: "猫" }), "cat · 猫");
  assert.equal(meaningText({ en: "", zh: "猫" }), "猫");
  assert.equal(meaningText({ en: "cat", zh: "" }), "cat");
});

test("matchesReading accepts romaji variants, macrons, kana and katakana", () => {
  const yes = (input, kana) => assert.ok(matchesReading(input, kana), `${input} should match ${kana}`);
  const no = (input, kana) => assert.ok(!matchesReading(input, kana), `${input} should not match ${kana}`);
  yes("gakkou", "がっこう"); yes("gakkoo", "がっこう"); yes("gakkō", "がっこう"); yes("GAKKOU", "がっこう");
  yes("  gak kou ", "がっこう");
  yes("shinbun", "しんぶん");
  yes("sensei", "せんせい"); yes("sensee", "せんせい");
  yes("si", "し"); yes("shi", "し"); yes("tu", "つ"); yes("tsu", "つ"); yes("hu", "ふ"); yes("fu", "ふ");
  yes("zi", "じ"); yes("ji", "じ"); yes("syashin", "しゃしん"); yes("shashin", "しゃしん");
  yes("tya", "ちゃ"); yes("cha", "ちゃ"); yes("jya", "じゃ"); yes("zya", "じゃ");
  yes("shuu", "しゅう"); yes("shu", "しゅ");
  yes("kin'en", "きんえん"); yes("kinen", "きんえん"); yes("konnichiha", "こんにちは");
  yes("koohii", "コーヒー"); yes("kōhī", "コーヒー");
  yes("がっこう", "がっこう"); yes("ガッコウ", "がっこう"); yes("がっこう", "ガッコウ");
  yes("ねこ", "ネコ"); yes("neko", "ネコ");
  no("gakko", "がっこう"); no("gakkouu", "がっこう"); no("neko", "いぬ"); no("", "ねこ"); no("   ", "ねこ");
  no("ねご", "ねこ");
});

test("canonicalRomaji folds the alternate spellings", () => {
  assert.equal(canonicalRomaji("Shi-n'bun"), "shinbun");
  assert.equal(canonicalRomaji("tyuu"), "chuu");
  assert.equal(canonicalRomaji("ohayou"), "ohayoo");
  assert.equal(canonicalRomaji("shuu"), "shuu", "the h of shu is not turned into f");
  assert.equal(canonicalRomaji("chuu"), "chuu", "nor the h of chu");
});

test("pickEntry favours weak words and never repeats the last one", () => {
  const s = emptyState();
  const entries = [{ key: "a|a" }, { key: "b|b" }, { key: "c|c" }];
  for (let i = 0; i < 6; i++) recordAnswer(s, "w:b|b", true, i);     // b is strong (box 5)
  assert.equal(pickEntry([{ key: "only|only" }], s, "only|only").key, "only|only", "a single word can repeat");
  assert.equal(pickEntry([], s, null), null);
  const counts = { "a|a": 0, "b|b": 0, "c|c": 0 };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let last = null;
  for (let i = 0; i < 600; i++) {
    const e = pickEntry(entries, s, last, rnd);
    assert.notEqual(e.key, last);
    counts[e.key]++; last = e.key;
  }
  assert.ok(counts["a|a"] > counts["b|b"] * 2 && counts["c|c"] > counts["b|b"] * 2, JSON.stringify(counts));
});

test("buildChoices returns the answer plus up to 3 distinct other entries, shuffled", () => {
  const entries = ["a", "b", "c", "d", "e"].map(k => ({ key: k, word: k, kana: k, en: k, zh: "" }));
  const answer = entries[0];
  for (let i = 0; i < 30; i++) {
    const choices = buildChoices(entries, answer, meaningText);
    assert.equal(choices.length, 4);
    assert.ok(choices.some(c => c.key === "a"));
    assert.equal(new Set(choices.map(meaningText)).size, 4);
  }
  const same = [answer, { key: "x", word: "x", kana: "x", en: "a", zh: "" }, { key: "y", word: "y", kana: "y", en: "b", zh: "" }];
  assert.equal(buildChoices(same, answer, meaningText).length, 2, "an entry with the same label is not a distractor");
});

test("availableModes: pick and listen need 4 words", () => {
  assert.deepEqual(availableModes(3), ["type"]);
  assert.deepEqual(availableModes(4), ["type", "pickMeaning", "pickWord", "listen"]);
  assert.deepEqual(availableModes(0), ["type"]);
});

test("validateMyWord trims, requires word, kana and a meaning, and checks the pitch number", () => {
  const ok = validateMyWord({ word: " 猫 ", kana: " ねこ ", en: " cat ", zh: "", accent: "1" });
  assert.deepEqual(ok, { value: { word: "猫", kana: "ねこ", en: "cat", zh: "", accent: 1 } });
  assert.deepEqual(validateMyWord({ word: "猫", kana: "ねこ", zh: "猫", accent: "" }).value, { word: "猫", kana: "ねこ", en: "", zh: "猫" });
  assert.match(validateMyWord({ word: "", kana: "ねこ", en: "cat" }).error, /Japanese word/);
  assert.match(validateMyWord({ word: "猫", kana: "", en: "cat" }).error, /reading/);
  assert.match(validateMyWord({ word: "猫", kana: "neko", en: "cat" }).error, /kana only/);
  assert.match(validateMyWord({ word: "猫", kana: "猫", en: "cat" }).error, /kana only/);
  assert.match(validateMyWord({ word: "猫", kana: "ねこ" }).error, /meaning/);
  assert.match(validateMyWord({ word: "猫", kana: "ねこ", en: "cat", accent: "3" }).error, /0 to 2/);
  assert.match(validateMyWord({ word: "猫", kana: "ねこ", en: "cat", accent: "1.5" }).error, /whole number/);
  assert.match(validateMyWord({ word: "猫", kana: "ねこ", en: "cat", accent: "-1" }).error, /whole number/);
  assert.equal(validateMyWord({ word: "猫", kana: "ねこ", en: "cat", accent: "0" }).value.accent, 0);
  assert.equal(validateMyWord({ word: "コーヒー", kana: "コーヒー", en: "coffee" }).error, undefined);
});

test("buildChoices never offers a second right answer: same word, same reading or same meaning", () => {
  const answer = { key: "犬|いぬ", word: "犬", kana: "いぬ", en: "dog", zh: "" };
  const entries = [
    answer,
    { key: "いぬ|いぬ", word: "いぬ", kana: "いぬ", en: "dog (kana)", zh: "" },          // same reading
    { key: "犬|けん", word: "犬", kana: "けん", en: "dog (on)", zh: "" },                  // same word
    { key: "ドッグ|どっぐ", word: "ドッグ", kana: "どっぐ", en: "dog", zh: "" },           // same meaning
    { key: "猫|ねこ", word: "猫", kana: "ねこ", en: "cat", zh: "" },
  ];
  for (let i = 0; i < 20; i++) {
    const keys = buildChoices(entries, answer, meaningText).map(c => c.key).sort();
    assert.deepEqual(keys, ["犬|いぬ", "猫|ねこ"].sort());
  }
});

test("matchesReading accepts nnn for ん, cch for tch and full-width romaji", () => {
  assert.ok(matchesReading("konnnichiha", "こんにちは"));
  assert.ok(matchesReading("macchi", "マッチ"));
  assert.ok(matchesReading("ｎｅｋｏ", "ねこ"));
});
