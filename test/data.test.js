import { test } from "node:test";
import assert from "node:assert/strict";
import { ROWS, KATA_ROWS, GROUPS, ALL, SCRIPTS, scriptRows, SMALL_BASE } from "../js/data.js";

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

test("ALL holds 104 characters per script, each tagged with its script", () => {
  assert.equal(ALL.length, 208);
  assert.equal(ALL.filter(c => c.script === "hira").length, 104);
  assert.equal(ALL.filter(c => c.script === "kata").length, 104);
  assert.equal(new Set(ALL.map(c => c.kana)).size, 208, "kana are unique across scripts");
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

test("rows come in three groups: 11 basic, 5 dakuon, 11 youon", () => {
  const count = g => ROWS.filter(r => r.group === g).length;
  assert.equal(ROWS.length, 27);
  assert.deepEqual([count("basic"), count("dakuon"), count("youon")], [11, 5, 11]);
  assert.equal(new Set(ROWS.map(r => r.id)).size, 27, "row ids are unique");
  const order = ROWS.map(r => ["basic", "dakuon", "youon"].indexOf(r.group));
  assert.deepEqual(order, [...order].sort((x, y) => x - y), "ordered basic, dakuon, youon");
  assert.deepEqual(KATA_ROWS.map(r => r.group), ROWS.map(r => r.group));
});

test("GROUPS lists each group's chart columns", () => {
  assert.deepEqual(GROUPS.map(g => g.id), ["basic", "dakuon", "youon"]);
  assert.deepEqual(GROUPS.map(g => g.label), ["基本", "濁音", "拗音"]);
  assert.deepEqual(GROUPS[2].cols, ["ya", "yu", "yo"]);
  for (const g of GROUPS) for (const r of ROWS.filter(r => r.group === g.id)) assert.equal(r.chars.length, g.cols.length, `${r.id} slots`);
});

test("dakuon and youon romaji, including alternate spellings", () => {
  const acc = k => ALL.find(c => c.kana === k).accepted;
  assert.deepEqual(acc("が"), ["ga"]);
  assert.deepEqual(acc("じ"), ["ji", "zi"]);
  assert.deepEqual(acc("ぢ"), ["di", "ji"], "ぢ shows di in pick mode but still accepts ji");
  assert.deepEqual(acc("づ"), ["du", "zu"]);
  assert.deepEqual(acc("ぱ"), ["pa"]);
  assert.deepEqual(acc("きゃ"), ["kya"]);
  assert.deepEqual(acc("しゃ"), ["sha", "sya"]);
  assert.deepEqual(acc("ちょ"), ["cho", "tyo"]);
  assert.deepEqual(acc("じゅ"), ["ju", "jyu", "zyu"]);
  assert.deepEqual(acc("ぴょ"), ["pyo"]);
});

test("katakana dakuon and youon are derived from the hiragana strings", () => {
  const find = k => ALL.find(c => c.kana === k);
  assert.equal(find("ガ").row, "ga");
  assert.equal(find("ヂ").script, "kata");
  assert.deepEqual(find("キャ").accepted, ["kya"]);
  assert.deepEqual(find("シュ").accepted, ["shu", "syu"]);
  assert.equal(find("ジョ").row, "ja");
  assert.equal(find("ヴ"), undefined, "ヴ is out of scope");
});
