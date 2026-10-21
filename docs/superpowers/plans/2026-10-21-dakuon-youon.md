# だくおん and ようおん Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the voiced (だくおん, incl. ぱ行) and combination (ようおん) kana to Practice, Chart, Progress and example words, in both scripts, with the Review reading aid following progress.

**Architecture:** Extend `ROWS` with 16 new rows tagged by `group` (basic / dakuon / youon); katakana rows stay derived from hiragana. The UI renders rows and chart tables per group. `knownChars` learns dakuon kana from their row and only the small ゃゅょ from a youon row. New example words live in `js/words-voiced.js` (hiragana) and a new part D of `js/words-katakana.js`; `js/words.js` combines every list.

**Tech Stack:** Vanilla ES modules, `node --test` (`npm test`), Playwright via `page.route` for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-21-dakuon-youon-design.md`

**Conventions for every task:** run `npm test` before committing. Any task that changes a file under `js/`, `css/` or `index.html` ends with `npm run bump-sw` before its commit (the `sw` test fails on a stale VERSION). Tasks that add a *new* file under `js/` also add it to `FILES` in `sw.js`. Use `git add` with explicit paths. Do not push; publishing is the last task and needs the user's go-ahead. Work on a branch `feature/voiced`.

---

## File map

- Modify `js/data.js` — `GROUPS`, dakuon and youon rows, whole-string `toKata`, `group` on every row.
- Modify `js/store.js` — `knownChars` youon rule.
- Create `js/words.js` — `wordsFor(script)`, `findWord(kana)`.
- Create `js/words-voiced.js` — `VOICED_WORDS` (hiragana).
- Modify `js/words-katakana.js` — part D (voiced katakana loanwords).
- Modify `js/app.js`, `css/style.css` — grouped chips and charts, highlight, pick-mode distractors, word lists.
- Modify `sw.js` — precache new files.
- Tests: extend `test/data.test.js`, `test/store.test.js`, `test/katakana-words.test.js`; create `test/voiced-words.test.js`, `test/words.test.js`.

---

### Task 1: Voiced and combination rows in the data

**Files:**
- Modify: `js/data.js`
- Test: `test/data.test.js`

- [ ] **Step 1: Update and extend the tests**

In `test/data.test.js` change the import to
`import { ROWS, KATA_ROWS, GROUPS, ALL, SCRIPTS, scriptRows, SMALL_BASE } from "../js/data.js";`,
replace the test named "ALL holds 46 characters per script, each tagged with its script" with:

```js
test("ALL holds 104 characters per script, each tagged with its script", () => {
  assert.equal(ALL.length, 208);
  assert.equal(ALL.filter(c => c.script === "hira").length, 104);
  assert.equal(ALL.filter(c => c.script === "kata").length, 104);
  assert.equal(new Set(ALL.map(c => c.kana)).size, 208, "kana are unique across scripts");
  assert.deepEqual(SCRIPTS, ["hira", "kata"]);
});
```

and append:

```js
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
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test -- test/data.test.js`
Expected: FAIL — `GROUPS` is not exported.

- [ ] **Step 3: Implement**

In `js/data.js` change `export const ROWS = [` to `const BASIC = [` (the 11 existing rows, unchanged), and directly after its closing `];` add:

```js
const DAKUON = [
  { id: "ga", label: "ga", chars: [["が","ga"],["ぎ","gi"],["ぐ","gu"],["げ","ge"],["ご","go"]] },
  { id: "za", label: "za", chars: [["ざ","za"],["じ","ji","zi"],["ず","zu"],["ぜ","ze"],["ぞ","zo"]] },
  { id: "da", label: "da", chars: [["だ","da"],["ぢ","di","ji"],["づ","du","zu"],["で","de"],["ど","do"]] },
  { id: "ba", label: "ba", chars: [["ば","ba"],["び","bi"],["ぶ","bu"],["べ","be"],["ぼ","bo"]] },
  { id: "pa", label: "pa", chars: [["ぱ","pa"],["ぴ","pi"],["ぷ","pu"],["ぺ","pe"],["ぽ","po"]] },
];

// A youon row is one consonant kana plus small ゃ ゅ ょ; prefixes are the romaji spellings
// (first = the one shown in pick mode), completed with a / u / o.
const youon = (id, kana, prefixes) => ({
  id, label: id,
  chars: [["a", "ゃ"], ["u", "ゅ"], ["o", "ょ"]].map(([v, small]) => [kana + small, ...prefixes.map(p => p + v)]),
});
const YOUON = [
  youon("kya", "き", ["ky"]), youon("sha", "し", ["sh", "sy"]), youon("cha", "ち", ["ch", "ty"]),
  youon("nya", "に", ["ny"]), youon("hya", "ひ", ["hy"]), youon("mya", "み", ["my"]),
  youon("rya", "り", ["ry"]), youon("gya", "ぎ", ["gy"]), youon("ja", "じ", ["j", "jy", "zy"]),
  youon("bya", "び", ["by"]), youon("pya", "ぴ", ["py"]),
];

// Rows are grouped for the UI: each group has its own heading and chart columns.
export const GROUPS = [
  { id: "basic", label: "基本", cols: ["a", "i", "u", "e", "o"] },
  { id: "dakuon", label: "濁音", cols: ["a", "i", "u", "e", "o"] },
  { id: "youon", label: "拗音", cols: ["ya", "yu", "yo"] },
];
export const ROWS = [
  ...BASIC.map(r => ({ ...r, group: "basic" })),
  ...DAKUON.map(r => ({ ...r, group: "dakuon" })),
  ...YOUON.map(r => ({ ...r, group: "youon" })),
];
```

Then replace the `toKata` / `KATA_ROWS` lines with a version that converts every character of a kana string:

```js
const toKata = s => [...s].map(ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)).join("");
export const KATA_ROWS = ROWS.map(r => ({ ...r, chars: r.chars.map(c => c && [toKata(c[0]), ...c.slice(1)]) }));
```

Update the comment above `WORDS` ("Only words spelled with basic hiragana…") to say it holds the words made of basic hiragana; words with ゛゜ or ゃゅょ live in `words-voiced.js`.

- [ ] **Step 4: Run all tests**

Run: `npm run bump-sw && npm test`
Expected: all pass. If an existing test fails because it assumed 46 characters or 11 rows, update that assertion to the new counts and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add js/data.js test/data.test.js sw.js
git commit -m "Add dakuon and youon rows to the data"
```

---

### Task 2: Learned characters for the new rows

**Files:**
- Modify: `js/store.js` (`knownChars`)
- Test: `test/store.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/store.test.js` (`emptyState`, `knownChars`, `activeRows` and `rubyHtml` are already imported):

```js
test("a ticked dakuon row teaches its voiced kana, in either script", () => {
  const s = emptyState();
  assert.ok(!knownChars(s).has("が"));
  s.settings.rows = ["a", "ka", "ga"];
  s.settings.krows = ["za"];
  const known = knownChars(s);
  for (const ch of "がぎぐげご") assert.ok(known.has(ch), ch);
  for (const ch of "ザジズゼゾ") assert.ok(known.has(ch), ch);
  assert.ok(!known.has("ざ") && !known.has("ガ"));
});

test("a ticked youon row teaches only its small kana, not the first kana", () => {
  const s = emptyState();
  s.settings.rows = ["a", "kya"];
  let known = knownChars(s);
  for (const ch of "ゃゅょ") assert.ok(known.has(ch), ch);
  assert.ok(!known.has("き"), "き still needs the ka row");
  s.settings.krows = ["sha"];
  known = knownChars(s);
  for (const ch of "ャュョ") assert.ok(known.has(ch), ch);
  assert.ok(!known.has("シ"));
});

test("activeRows accepts the new row ids and drops unknown ones", () => {
  const s = emptyState();
  s.settings.rows = ["a", "ga", "kya", "zz"];
  assert.deepEqual(activeRows(s), ["a", "ga", "kya"]);
  s.settings.krows = ["pa", "ja", "qq"];
  assert.deepEqual(activeRows(s, "kata"), ["pa", "ja"]);
});

test("the Review reading aid hides romaji over voiced and combined kana once their rows are ticked", () => {
  const s = emptyState();                                   // hiragana a ka sa ta
  assert.match(rubyHtml("がっこう", knownChars(s)), /<ruby>が<rt>ga<\/rt><\/ruby>/);
  s.settings.rows = ["a", "ka", "sa", "ta", "ga"];
  assert.equal(rubyHtml("がっこう", knownChars(s)), "がっこう");      // っ follows つ (ta row)
  assert.match(rubyHtml("きょう", knownChars(s)), /<ruby>きょ<rt>kyo<\/rt><\/ruby>/);
  s.settings.rows.push("kya");
  assert.equal(rubyHtml("きょう", knownChars(s)), "きょう");
  s.settings.krows = ["ka", "kya"];
  assert.match(rubyHtml("キョウ", knownChars(s)), /^キョ<ruby>ウ<rt>u<\/rt><\/ruby>$/, "ウ still needs the katakana a row");
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- test/store.test.js`
Expected: FAIL (ruby tests; youon rows currently add 2-character strings that never match).

- [ ] **Step 3: Implement**

In `js/store.js` replace the inner loop of `knownChars`:

```js
      if (learned.has(row.id)) for (const c of row.chars) if (c) known.add(c[0]);
```

with

```js
      if (!learned.has(row.id)) continue;
      // A youon kana is a first kana plus a small one: the row teaches the small kana only.
      for (const c of row.chars) if (c) for (const ch of (row.group === "youon" ? [...c[0]].slice(1) : [...c[0]])) known.add(ch);
```

- [ ] **Step 4: Run all tests**

Run: `npm run bump-sw && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js sw.js
git commit -m "Learn voiced kana from dakuon rows and small kana from youon rows"
```

---

### Task 3: Word lists module and the first voiced words

**Files:**
- Create: `js/words.js`, `js/words-voiced.js`, `test/voiced-words.test.js`, `test/words.test.js`
- Modify: `js/app.js` (use `wordsFor` / `findWord`), `sw.js` (`FILES`)

- [ ] **Step 1: Write the failing tests**

Create `test/voiced-words.test.js`:

```js
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
```

Create `test/words.test.js`:

```js
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- test/voiced-words.test.js test/words.test.js`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create the modules**

`js/words.js`:

```js
// Every example-word list in one place: hiragana (basic + voiced/combined) and katakana.
import { WORDS } from "./data.js";
import { VOICED_WORDS } from "./words-voiced.js";
import { KATA_WORDS } from "./words-katakana.js";

const HIRAGANA_WORDS = [...WORDS, ...VOICED_WORDS];
const EVERY_WORD = [...HIRAGANA_WORDS, ...KATA_WORDS];

export const wordsFor = script => (script === "kata" ? KATA_WORDS : HIRAGANA_WORDS);
export const findWord = kana => EVERY_WORD.find(w => w.kana === kana);
```

`js/words-voiced.js` — authored as `[kana, kanji ("" if usually kana), English, Chinese (simplified), accent]`; write part A (about 35 words) now, part B in Task 4. Seed entries (accents are provisional until Task 5 verifies them against OJAD):

```js
// Hiragana words that use voiced (゛゜) or combined (ゃゅょ) kana. Each entry:
// [kana, kanji or "", English, Chinese, accent] where accent is the Tokyo number (0 = flat).
// A word is shown once every character in it is learned (see knownChars in store.js).
import { toRomaji } from "./romaji.js";

const RAW = [
  // ---- A: school, town, daily life ----
  ["がっこう", "学校", "school", "学校", 0],
  ["ぎんこう", "銀行", "bank", "银行", 0],
  ["ざっし", "雑誌", "magazine", "杂志", 0],
  ["でんしゃ", "電車", "train", "电车", 0],
  ["きょう", "今日", "today", "今天", 1],
  ["おちゃ", "お茶", "tea", "茶", 0],
  ["びょういん", "病院", "hospital", "医院", 0],
  ["ごはん", "ご飯", "cooked rice; meal", "米饭；饭", 1],
  ["ともだち", "友達", "friend", "朋友", 0],
  ["かばん", "鞄", "bag", "包", 0],
  // …add about 25 more (see Step 4)
];

export const VOICED_WORDS = RAW.map(([kana, kanji, en, zh, accent]) => ({ kana, romaji: toRomaji(kana), kanji, en, zh, accent }));
```


- [ ] **Step 4: Write the rest of part A**

Add about 25 more entries to part A so it has about 35, drawn from: school and study (べんきょう, じゅぎょう, しゅくだい, がくせい, だいがく), town and transport (でぐち, じてんしゃ, しゅっぱつ), food and home (ぎゅうにゅう, たべもの, おべんとう, だいどころ), body and people (からだ, おじさん, おばあさん, しゃちょう). Rules (all checked by the test): only hiragana and ー; each word has at least one voiced (゛゜) or combined (ゃゅょ) kana; no repeat of a word already in `WORDS`; a numeric accent for every entry, best knowledge now; short English gloss, natural simplified Chinese. Remove the "add about 25 more" comment when done.

- [ ] **Step 5: Wire the app**

In `js/app.js`:
- change `import { KATA_WORDS } from "./words-katakana.js";` to `import { wordsFor, findWord } from "./words.js";`;
- change the data import to `import { ALL, MAX_BOX, scriptRows } from "./data.js";` (drop `WORDS`);
- in `usableWords` replace `(script() === "kata" ? KATA_WORDS : WORDS)` with `wordsFor(script())`;
- in `renderDictionary` replace `const w = (WORDS.find(x => x.kana === kana) ?? KATA_WORDS.find(x => x.kana === kana));` with `const w = findWord(kana);`.

Add `"js/words.js", "js/words-voiced.js"` to `FILES` in `sw.js` (same line as `"js/words-katakana.js"`).

- [ ] **Step 6: Run tests, bump, commit**

Run: `npm run bump-sw && npm test` — expected all pass.

```bash
git add js/words.js js/words-voiced.js js/app.js sw.js test/voiced-words.test.js test/words.test.js
git commit -m "Add the words module and the first voiced hiragana words"
```

---

### Task 4: More voiced words (hiragana part B, katakana part D)

**Files:**
- Modify: `js/words-voiced.js`, `js/words-katakana.js`, `test/katakana-words.test.js`

- [ ] **Step 1: Hiragana part B**

Append a `// ---- B: …` group of about 35 words to `RAW` in `js/words-voiced.js`: nature and numbers (かぜ, ひゃく, ごご, ぼうし), people, colours and things (じょうず, しゃしん, ちゃいろ, きんぎょ, ぎゅうどん). Same rules as Task 3 Step 4.

- [ ] **Step 2: Katakana part D**

In `test/katakana-words.test.js` append:

```js
test("at least 40 katakana words use voiced or combined kana", () => {
  const voiced = /[ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポャュョ]/u;
  assert.ok(KATA_WORDS.filter(w => voiced.test(w.kana)).length >= 40);
});
```

Append to `RAW` in `js/words-katakana.js`, after part C, a group `// ---- D: voiced and combined kana ----` of about 50 loanwords entries `[kana, English, Chinese, accent]`: ジュース, テレビ, ビール, バス, ドア, ベッド, ゲーム, ガス, ギター, ピアノ, パン, ペン, ポスト, プール, ダンス, デパート, ビル, ボタン, ガラス, シャワー, ジャズ, チョコレート, ジョギング, … Rules: only katakana, ー and small kana; at least one voiced or combined kana; not extended katakana (no ティ ファ ウィ ヴ); common everyday words; a numeric accent for each (provisional until Task 5).

- [ ] **Step 3: Run tests, bump, commit**

Run: `npm run bump-sw && npm test` — expected all pass.

```bash
git add js/words-voiced.js js/words-katakana.js test/katakana-words.test.js sw.js
git commit -m "Add voiced hiragana part B and katakana part D (accents unverified)"
```

---

### Task 5: Verify the new words

**Files:**
- Modify: `js/words-voiced.js`, `js/words-katakana.js`

- [ ] **Step 1: Check accents against OJAD**

Generate a lookup script for every word added in Tasks 3–4, then run it with the Playwright MCP tool `browser_run_code_unsafe` (`filename: ".playwright-mcp/voiced-ojad.js"`):

```bash
node --input-type=module -e '
import { VOICED_WORDS } from "./js/words-voiced.js";
import { KATA_WORDS } from "./js/words-katakana.js";
import fs from "fs";
const voiced = /[ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポャュョ]/u;
const list = [...VOICED_WORDS, ...KATA_WORDS.filter(w => voiced.test(w.kana))].map(w => ({ kana: w.kana, kanji: w.kanji, accent: w.accent }));
const code = `async (page) => {
const list = ${JSON.stringify(list)};
const out = [];
for (const it of list) {
  let res = [];
  try {
    await page.goto("https://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/word:" + encodeURIComponent(it.kanji || it.kana), { timeout: 30000 });
    res = await page.evaluate(() => [...document.querySelectorAll("tr")].filter(tr => tr.querySelector(":scope > td.midashi")).map(tr => {
      const td = tr.querySelector(":scope > td.katsuyo_jisho_js");
      return td ? [...td.querySelectorAll(".accented_word")].map(w => { const m = [...w.children]; const i = m.findIndex(c => c.className.includes("accent_top")); return m.map(c => c.innerText).join("") + ":" + (i < 0 ? 0 : i + 1); }) : [];
    }).flat());
  } catch (e) { res = "ERR"; }
  out.push({ ...it, ojad: res });
}
return JSON.stringify(out);
}`;
fs.writeFileSync(".playwright-mcp/voiced-ojad.js", code);
'
```

OJAD lists mora positions that equal the app's accent numbers (the page marks ゃゅょ together with the previous kana, so positions are per mora). For each word: if OJAD returns the same reading (hiragana; for katakana OJAD returns hiragana) with the same number, keep it; if it returns a different number for that reading, use OJAD's; if it returns several, keep ours when it is one of them; if it returns nothing, drop the word. Results may be too large to print inline; they are saved to a file, so read it with `node`.

- [ ] **Step 2: Check readings and meanings against jisho**

With Playwright's `page.request.get("https://jisho.org/api/v1/search/words?keyword=" + encodeURIComponent(word))` confirm that each word exists with that spelling/reading and that the English gloss overlaps a jisho sense. Fix mismatches; drop words jisho does not list.

- [ ] **Step 3: Independent proofreading**

Dispatch one subagent (general-purpose, read-only) with both word files and this brief: for every new entry confirm English and simplified-Chinese glosses are accurate and mainland-natural, flag false friends and uncommon words, report problems only. Apply sensible corrections yourself.

- [ ] **Step 4: Check counts and commit**

If verification left fewer than 60 voiced hiragana or fewer than 40 voiced katakana words, add more (verified the same way). Run `npm run bump-sw && npm test` — expected all pass.

```bash
git add js/words-voiced.js js/words-katakana.js sw.js
git commit -m "Verify voiced words against OJAD and jisho"
```

---

### Task 6: Grouped screens

**Files:**
- Modify: `js/app.js`, `css/style.css`

- [ ] **Step 1: Row chips in three sections**

In `js/app.js` import `GROUPS`: `import { ALL, MAX_BOX, scriptRows, GROUPS } from "./data.js";`. In `renderRowToggles` replace the `$("rowToggles").innerHTML = scriptRows(sc).map(...).join("");` statement with:

```js
  $("rowToggles").innerHTML = GROUPS.map(g => `<div class="group-label">${g.label}</div>` +
    scriptRows(sc).filter(r => r.group === g.id).map(r => {
      const on = activeRows(state, sc).includes(r.id);
      const sample = r.chars.find(Boolean)[0];
      return `<label class="${on ? "on" : ""}"><input type="checkbox" value="${r.id}" ${on ? "checked" : ""}>${sample} ${r.label}</label>`;
    }).join("")).join("");
```

(Leave the `querySelectorAll("input")` handler below it unchanged.)

- [ ] **Step 2: One chart table per group**

Replace `gridHtml` with:

```js
// One table per group (基本 / 濁音 / 拗音) for the selected script; the youon tables have 3 columns.
function gridHtml(cellFn) {
  return GROUPS.map(g => {
    const rows = scriptRows(script()).filter(r => r.group === g.id);
    return `<h3 class="group-title">${g.label}</h3><table class="chart"><tr><th></th>${g.cols.map(v => `<th>${v}</th>`).join("")}</tr>` +
      rows.map(r => `<tr><th>${r.label}</th>${r.chars.map(c => c ? cellFn(ALL.find(x => x.kana === c[0])) : `<td class="cell empty"></td>`).join("")}</tr>`).join("") +
      `</table>`;
  }).join("");
}
```

- [ ] **Step 3: Highlight whole combined kana**

In `wordHtml` replace the `const kana = morae(w.kana).map(...)` block with:

```js
  const mark = text => (hidden === "kana" ? `<mark>？</mark>` : `<mark>${text}</mark>`);
  const kana = morae(w.kana).map((m, i) => {
    // A combined kana (きゃ) is one mora and highlights whole; a single kana highlights inside a mora.
    const shown = m === highlight ? mark(m) : [...m].map(ch => ch !== highlight ? ch : mark(ch)).join("");
    return moraHtml(shown, i, w.accent);
  }).join("") + accentMarkHtml(w.kana, w.accent);
```

- [ ] **Step 4: Pick mode never offers a duplicate answer**

In `nextCard`, replace

```js
    const others = shuffle(pool().filter(c => c.kana !== current.kana)).slice(0, 3);
```

with

```js
    // Skip kana that also accept the prompt's spelling (じ and ぢ are both "ji") so only one answer is right.
    const others = shuffle(pool().filter(c => c.kana !== current.kana && !c.accepted.includes(current.romaji))).slice(0, 3);
```

- [ ] **Step 5: Styles**

Append to `css/style.css`:

```css
.group-label { flex-basis: 100%; margin: 6px 0 0; font-size: 13px; color: var(--muted); }
.group-label:first-child { margin-top: 0; }
.group-title { margin: 18px 0 4px; font-size: 14px; color: var(--muted); font-weight: 600; }
.cell .r { word-break: break-all; line-height: 1.15; }
```

- [ ] **Step 6: Run tests, bump, commit**

Run: `npm run bump-sw && npm test` — expected all pass.

```bash
git add js/app.js css/style.css sw.js
git commit -m "Show dakuon and youon rows in sections on Practice, Chart and Progress"
```

---

### Task 7: Browser check

**Files:** none (scratch scripts in git-ignored `.playwright-mcp/`)

- [ ] **Step 1: Build a serving script**

The sandbox cannot start a server, so serve files through `page.route` at `https://hira.test/`: generate `.playwright-mcp/voiced-walk.js` by embedding `index.html`, `manifest.webmanifest`, `sw.js`, `css/style.css`, every `js/*.js` and `js/decks/*.js` as a map and fulfilling matching requests (as done for the katakana check: `route("https://hira.test/**", …)`, viewport 390×844, `speechSynthesis.speak` stubbed to push into `window.__said`, clear `localStorage`, reload). Append the check body from Step 2, call `browser_run_code_unsafe` with `filename`. Output is large; read results from the saved result file with `head -c`.

- [ ] **Step 2: Walk through**

Verify, taking screenshots into `.playwright-mcp/`:
1. Practice (hiragana): chips are in three sections labelled 基本 / 濁音 / 拗音 (11, 5, 11 chips); on a 390px screen nothing overflows.
2. Tick `ga` and `kya`: type-mode quiz shows only kana from the ticked rows (plus the default basic rows); answering が with `ga` and きゃ with `kya` or `kya` alternatives (`sya` for しゃ after ticking `sha`) is marked correct; stats keys are the kana strings (`きゃ`).
3. Tick `za` and `da`; set pick mode: whenever the prompt is "ji" the options never include ぢ; prompt "di" shows ぢ.
4. Chart: three headed tables; the 拗音 table has 3 columns; alternates like "ja / jya / zya" do not overflow the 58px cells (wrap is fine); tapping きゃ speaks it and lists example words with きゃ highlighted whole.
5. Words tab: with default rows only, no voiced words; after ticking `ga` a word such as がっこう appears (needs っ via ta, こ via ka, う via a); after ticking `kya` きょう appears.
6. Switch to カタカナ: same three sections; tick `ka`, `kya` and `ta`: キョウ-style behaviour via Words (a katakana voiced word appears once every character is learned).
7. Review: add a custom vocab card (or inject one as in earlier checks) with kana がっこう, accent 0: romaji ruby over が until `ga` is ticked; none after.
8. Reload keeps everything. Console shows no errors other than missing icon 404s from the test server.

- [ ] **Step 3: Fix anything found**

Fix with a failing test where the logic is testable, otherwise directly; re-run `npm test` and the failing check.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A js css test sw.js
git commit -m "Fix issues found in the dakuon/youon browser check"
```

(Skip if nothing changed.)

---

### Task 8: Final review and publish (needs the user's go-ahead)

- [ ] **Step 1:** Dispatch a read-only reviewer on `git diff main...feature/voiced` (same brief as for katakana: script/row edge cases, sync, `knownChars`, highlight, words data, service worker). Fix real findings.
- [ ] **Step 2:** `npm run bump-sw && npm test` all pass; `git status` clean.
- [ ] **Step 3:** Tell the user it is ready and ask whether to publish. Only after a yes: `git checkout main && git merge --ff-only feature/voiced && GH_HOST=github.com git push origin main` (account yupeng9; never the Apple-internal hosts).
- [ ] **Step 4:** After about a minute confirm the Pages build (`GH_HOST=github.com gh api repos/yupeng9/hiragana/pages/builds/latest --jq '.status + " " + .commit'` shows `built` with the pushed commit) and fetch `https://yupeng9.github.io/hiragana/sw.js` in Playwright to confirm the new VERSION. Delete the merged branch.
- [ ] **Step 5:** Remind the user to open the app once on each device before changing rows.
