import { test } from "node:test";
import assert from "node:assert/strict";
import { ROWS, KATA_ROWS, ALL, SCRIPTS, scriptRows, SMALL_BASE } from "../js/data.js";

test("KATA_ROWS mirrors ROWS with katakana characters", () => {
  assert.equal(KATA_ROWS.length, ROWS.length);
  ROWS.forEach((row, i) => {
    const kata = KATA_ROWS[i];
    assert.equal(kata.id, row.id);
    assert.equal(kata.label, row.label);
    assert.equal(kata.chars.length, row.chars.length);
    row.chars.forEach((c, j) => {
      const k = kata.chars[j];
      if (c === null) return assert.equal(k, null);
      assert.equal(k[0].charCodeAt(0), c[0].charCodeAt(0) + 0x60, `${c[0]} → ${k[0]}`);
      assert.deepEqual(k.slice(1), c.slice(1), `${k[0]} keeps its romaji spellings`);
    });
  });
});

test("ALL holds 46 characters per script, each tagged with its script", () => {
  assert.equal(ALL.length, 92);
  assert.equal(ALL.filter(c => c.script === "hira").length, 46);
  assert.equal(ALL.filter(c => c.script === "kata").length, 46);
  assert.equal(new Set(ALL.map(c => c.kana)).size, 92, "kana are unique across scripts");
  assert.deepEqual(SCRIPTS, ["hira", "kata"]);
});

test("katakana keep their accepted romaji and row ids", () => {
  const find = k => ALL.find(c => c.kana === k);
  assert.deepEqual(find("シ").accepted, ["shi", "si"]);
  assert.deepEqual(find("ヲ").accepted, ["wo", "o"]);
  assert.deepEqual(find("ン").accepted, ["n", "nn"]);
  assert.equal(find("ツ").row, "ta");
  assert.equal(find("つ").script, "hira");
});

test("scriptRows picks the rows for a script, defaulting to hiragana", () => {
  assert.equal(scriptRows("kata"), KATA_ROWS);
  assert.equal(scriptRows("hira"), ROWS);
  assert.equal(scriptRows("anything else"), ROWS);
});

test("SMALL_BASE maps each small kana to a kana in the same script", () => {
  const kana = new Set(ALL.map(c => c.kana));
  assert.equal(Object.keys(SMALL_BASE).length, 18);
  for (const [small, base] of Object.entries(SMALL_BASE)) {
    assert.ok(kana.has(base), `${small} → ${base} is not a practice kana`);
  }
  assert.equal(SMALL_BASE["ッ"], "ツ");
  assert.equal(SMALL_BASE["ょ"], "よ");
});
