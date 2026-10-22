# Word Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Add word form, type a Japanese word, a reading or an English word and get matches (from the app's built-in words, then the online Jotoba dictionary); picking one fills in the rest.

**Architecture:** `js/lookup.js` (pure, offline: index of built-in words and matching), `js/jotoba.js` (one `fetch` to Jotoba, response mapping, pitch-to-accent), and a lookup section in the Add word form wired in `js/bank-ui.js`. Nothing changes in the state or the sync.

**Tech Stack:** Vanilla ES modules, `node --test` (`npm test`), Playwright via `page.route` for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-22-word-lookup-design.md`

**Conventions for every task:** run `npm test` before committing. Any task that changes a file under `js/`, `css/` or `index.html` ends with `npm run bump-sw` before its commit (the `sw` test fails on a stale VERSION). Tasks that add a *new* file under `js/` also add it to `FILES` in `sw.js`. Use `git add` with explicit paths. Do not push; publishing is the last task and needs the user's go-ahead. Work on a branch `feature/lookup`.

---

## File map

- Create `js/lookup.js`, `js/jotoba.js`.
- Modify `js/bank-ui.js`, `index.html`, `css/style.css`, `sw.js`.
- Tests: create `test/lookup.test.js`, `test/jotoba.test.js`.

---

### Task 1: Local lookup

**Files:**
- Create: `js/lookup.js`, `test/lookup.test.js`
- Modify: `sw.js` (`FILES`: add `"js/lookup.js"`)

- [ ] **Step 1: Write the failing test**

Create `test/lookup.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { localIndex, lookupLocal, exactLocal } from "../js/lookup.js";
import { VOCAB } from "../js/decks/vocab.js";
import { KANJI } from "../js/decks/kanji.js";

test("the index merges the word lists, the vocabulary deck and the kanji example words", () => {
  const index = localIndex();
  assert.ok(index.length > 450, `only ${index.length} entries`);
  assert.equal(new Set(index.map(e => e.key)).size, index.length, "keys are unique");
  const find = (word, kana) => index.find(e => e.word === word && e.kana === kana);
  assert.ok(find("愛", "あい"), "from the practice lists");
  assert.ok(find("学生", "がくせい") || find(VOCAB[0].word, VOCAB[0].kana), "from the vocabulary deck");
  const kw = KANJI[0].words[0];
  assert.ok(find(kw.word, kw.kana), "from the kanji example words");
  for (const e of index) {
    assert.equal(typeof e.word, "string"); assert.equal(typeof e.kana, "string");
    assert.equal(e.source, "built-in");
  }
});

test("an entry with a pitch number is kept over a duplicate without one", () => {
  const index = localIndex();
  for (const v of VOCAB) {
    if (!Number.isInteger(v.accent)) continue;
    const e = index.find(x => x.key === `${v.word}|${v.kana}`);
    assert.ok(e && Number.isInteger(e.accent), `${v.word} lost its accent`);
  }
});

test("Japanese search: exact, prefix and hiragana-folded matches, best first", () => {
  const r = lookupLocal("あい");
  assert.equal(r[0].kana, "あい");
  assert.ok(r.every(e => e.kana.includes("あい") || e.word.includes("あい")));
  assert.equal(lookupLocal("愛")[0].word, "愛");
  assert.equal(lookupLocal("アイ")[0].kana, "あい", "katakana input matches hiragana readings");
  const prefixes = lookupLocal("あ");
  assert.ok(prefixes.length > 0 && prefixes.every(e => e.word.startsWith("あ") || e.kana.startsWith("あ")), "a single character only matches the start");
});

test("English search matches meanings, exact first", () => {
  const r = lookupLocal("love");
  assert.ok(r.some(e => e.word === "愛"));
  assert.equal(lookupLocal("LOVE")[0].en.toLowerCase().includes("love"), true);
  assert.deepEqual(lookupLocal("qzqzqz"), []);
});

test("limit, exclude and empty queries", () => {
  assert.ok(lookupLocal("い", { limit: 3 }).length <= 3);
  assert.equal(lookupLocal("い").length <= 6, true, "default limit is 6");
  const first = lookupLocal("あい")[0];
  assert.ok(!lookupLocal("あい", { exclude: new Set([first.key]) }).some(e => e.key === first.key));
  assert.deepEqual(lookupLocal(""), []);
  assert.deepEqual(lookupLocal("   "), []);
  assert.deepEqual(lookupLocal(null), []);
});

test("exactLocal matches a whole word or reading only", () => {
  assert.ok(exactLocal("あい").some(e => e.word === "愛"));
  assert.ok(exactLocal("愛").some(e => e.word === "愛"));
  assert.ok(exactLocal("アイ").some(e => e.word === "愛"), "katakana folds to hiragana");
  assert.deepEqual(exactLocal(""), []);
  assert.ok(!exactLocal("あ").some(e => e.word === "愛"), "a prefix is not exact");
  const first = exactLocal("あい")[0];
  assert.ok(!exactLocal("あい", new Set([first.key])).some(e => e.key === first.key));
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test -- test/lookup.test.js`
Expected: FAIL — `js/lookup.js` does not exist.

- [ ] **Step 3: Implement `js/lookup.js`**

```js
// Offline lookup over the words the app already knows, for the Add word form.
// Sources, in priority order: the Practice word lists, the Review vocabulary deck, and the
// example words under each kanji. No DOM here.
import { wordsFor } from "./words.js";
import { VOCAB } from "./decks/vocab.js";
import { KANJI } from "./decks/kanji.js";

const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const clean = q => String(q ?? "").normalize("NFKC").trim();
const isEnglish = q => /^[A-Za-z][A-Za-z\s'’-]*$/.test(q);
const keyOf = (word, kana) => `${word}|${kana}`;

let index = null;

function add(map, entry) {
  const key = keyOf(entry.word, entry.kana);
  const have = map.get(key);
  if (!have) map.set(key, { key, ...entry });
  else if (have.accent == null && entry.accent != null) map.set(key, { ...have, accent: entry.accent });
}

// Built once on first use: [{ key, word, kana, en, zh, accent (number or null), source }].
export function localIndex() {
  if (index) return index;
  const map = new Map();
  for (const w of [...wordsFor("hira"), ...wordsFor("kata")]) {
    add(map, { word: w.kanji || w.kana, kana: w.kana, en: w.en, zh: w.zh, accent: Number.isInteger(w.accent) ? w.accent : null, source: "built-in" });
  }
  for (const v of VOCAB) {
    add(map, { word: v.word, kana: v.kana, en: v.en, zh: v.zh, accent: Number.isInteger(v.accent) ? v.accent : null, source: "built-in" });
  }
  for (const k of KANJI) {
    for (const w of k.words ?? []) add(map, { word: w.word, kana: w.kana, en: w.en, zh: w.zh, accent: null, source: "built-in" });
  }
  index = [...map.values()];
  return index;
}

// 0 = exact, 1 = prefix, 2 = contains, null = no match.
function japaneseScore(entry, q, qh) {
  const wordH = toHira(entry.word), kanaH = toHira(entry.kana);
  if (entry.word === q || wordH === qh || kanaH === qh) return 0;
  if (wordH.startsWith(qh) || kanaH.startsWith(qh)) return 1;
  if ([...qh].length >= 2 && (wordH.includes(qh) || kanaH.includes(qh))) return 2;
  return null;
}

function englishScore(entry, ql) {
  const en = String(entry.en ?? "").toLowerCase();
  if (!en) return null;
  const parts = en.split(/;\s*/);
  if (en === ql || parts.includes(ql)) return 0;
  if (en.startsWith(ql) || en.split(/[^a-z']+/).some(w => w.startsWith(ql))) return 1;
  if (en.includes(ql)) return 2;
  return null;
}

// Up to `limit` matches for a typed query, best first. `exclude` is a Set of keys to skip.
export function lookupLocal(query, { exclude = new Set(), limit = 6 } = {}) {
  const q = clean(query);
  if (!q) return [];
  const english = isEnglish(q), qh = toHira(q), ql = q.toLowerCase();
  const scored = [];
  for (const e of localIndex()) {
    if (exclude.has(e.key)) continue;
    const score = english ? englishScore(e, ql) : japaneseScore(e, q, qh);
    if (score !== null) scored.push([score, e]);
  }
  scored.sort((a, b) => a[0] - b[0]);            // stable: ties keep the index order
  return scored.slice(0, limit).map(s => s[1]);
}

// Entries whose word or reading equals the query exactly (hiragana-folded).
export function exactLocal(query, exclude = new Set()) {
  const q = clean(query);
  if (!q) return [];
  const qh = toHira(q);
  return localIndex().filter(e => !exclude.has(e.key) && (toHira(e.word) === qh || toHira(e.kana) === qh));
}
```

- [ ] **Step 4: Precache and run all tests**

Add `"js/lookup.js"` to `FILES` in `sw.js` (same line as `"js/bank.js"`).
Run: `npm run bump-sw && npm test`
Expected: all pass. If the index-size assertion (> 450) fails, print `localIndex().length` and lower the bound to just under the real count, noting it in the commit message.

- [ ] **Step 5: Commit**

```bash
git add js/lookup.js test/lookup.test.js sw.js
git commit -m "Add the offline word lookup over the built-in words"
```

---

### Task 2: Jotoba client

**Files:**
- Create: `js/jotoba.js`, `test/jotoba.test.js`
- Modify: `sw.js` (`FILES`: add `"js/jotoba.js"`)

- [ ] **Step 1: Write the failing test**

Create `test/jotoba.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { accentFromPitch, searchJotoba } from "../js/jotoba.js";

const P = (...pairs) => pairs.map(([part, high]) => ({ part, high }));

test("accentFromPitch: a drop inside the word gives the accent number", () => {
  assert.equal(accentFromPitch(P(["ね", true], ["こ", false]), "ねこ"), 1);                    // head-high
  assert.equal(accentFromPitch(P(["お", false], ["と", true], ["うと", false]), "おとうと"), 2); // middle-high, 2nd mora
  assert.equal(accentFromPitch(P(["た", false], ["べも", true], ["の", false]), "たべもの"), 3);
  assert.equal(accentFromPitch(P(["き", true], ["ょう", false]), "きょう"), null, "a part that splits a mora (きょ) cannot be trusted");
  assert.equal(accentFromPitch(P(["きょ", true], ["う", false]), "きょう"), 1, "きょ stays together, one mora");
});

test("accentFromPitch: no drop inside the word is ambiguous, so null", () => {
  assert.equal(accentFromPitch(P(["べ", false], ["んきょう", true]), "べんきょう"), null);
  assert.equal(accentFromPitch(P(["は", false], ["な", true]), "はな"), null);
  assert.equal(accentFromPitch(P(["ひ", true]), "ひ"), null);
  assert.equal(accentFromPitch(P(["あ", false], ["い", false]), "あい"), null);
});

test("accentFromPitch: bad or mismatched data gives null", () => {
  assert.equal(accentFromPitch(undefined, "ねこ"), null);
  assert.equal(accentFromPitch([], "ねこ"), null);
  assert.equal(accentFromPitch(P(["ね", true], ["こ", false]), "いぬ"), null, "parts must spell the reading");
  assert.equal(accentFromPitch([null, { part: "こ", high: false }], "ねこ"), null);
  assert.equal(accentFromPitch("x", "ねこ"), null);
});

const reply = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });
const NEKO = {
  reading: { kana: "ねこ", kanji: "猫", furigana: "[猫|ねこ]" },
  senses: [
    { glosses: ["cat (esp. the domestic cat)", "feline"], language: "English" },
    { glosses: ["shamisen"], language: "English" },
    { glosses: ["geisha"], language: "English" },
  ],
  pitch: P(["ね", true], ["こ", false]),
};
const KANA_ONLY = { reading: { kana: "ありがとう" }, senses: [{ glosses: ["thank you"], language: "English" }] };

test("searchJotoba maps results: word, reading, three glosses, accent", async () => {
  let call;
  const fetchFn = async (url, opts) => { call = { url, opts }; return reply({ words: [NEKO, KANA_ONLY] }); };
  const r = await searchJotoba("map-1", { fetchFn });
  assert.equal(call.url, "https://jotoba.de/api/search/words");
  assert.equal(call.opts.method, "POST");
  assert.deepEqual(JSON.parse(call.opts.body), { query: "map-1", language: "English", no_english: false });
  assert.deepEqual(r[0], { key: "猫|ねこ", word: "猫", kana: "ねこ", en: "cat (esp. the domestic cat); feline; shamisen", zh: "", accent: 1, source: "dictionary" });
  assert.deepEqual(r[1], { key: "ありがとう|ありがとう", word: "ありがとう", kana: "ありがとう", en: "thank you", zh: "", accent: null, source: "dictionary" });
});

test("searchJotoba returns at most 5 results and skips unusable ones", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ reading: { kana: `あ${"い".repeat(i + 1)}` }, senses: [{ glosses: [`w${i}`] }] }));
  const junk = [null, {}, { reading: {} }, { reading: { kana: "ゆ" }, senses: [] }, { reading: { kana: "ゆ" }, senses: [{ glosses: [] }] }];
  const r = await searchJotoba("many-1", { fetchFn: async () => reply({ words: [...junk, ...many] }) });
  assert.equal(r.length, 5);
  assert.ok(r.every(w => w.en.startsWith("w")));
});

test("searchJotoba caches by query and ignores an empty query", async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return reply({ words: [NEKO] }); };
  await searchJotoba("cache-1", { fetchFn });
  await searchJotoba("cache-1", { fetchFn });
  assert.equal(calls, 1);
  assert.deepEqual(await searchJotoba("   ", { fetchFn }), []);
  assert.equal(calls, 1);
});

test("searchJotoba reports network errors, bad status, bad JSON and timeouts", async () => {
  await assert.rejects(searchJotoba("err-1", { fetchFn: async () => { throw new TypeError("Failed to fetch"); } }), /reach the dictionary/);
  await assert.rejects(searchJotoba("err-2", { fetchFn: async () => reply({}, false, 503) }), /error \(503\)/);
  await assert.rejects(searchJotoba("err-3", { fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } }) }), /unreadable/);
  const hang = (_url, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  await assert.rejects(searchJotoba("err-4", { fetchFn: hang, timeoutMs: 20 }), /too long/);
  assert.deepEqual(await searchJotoba("err-5", { fetchFn: async () => reply({ words: "nope" }) }), []);
});

test("searchJotoba stops when the caller aborts and marks the error", async () => {
  const hang = (_url, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const ctl = new AbortController();
  const p = searchJotoba("abort-1", { fetchFn: hang, signal: ctl.signal, timeoutMs: 5000 });
  ctl.abort();
  await assert.rejects(p, e => e.aborted === true);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test -- test/jotoba.test.js`
Expected: FAIL — `js/jotoba.js` does not exist.

- [ ] **Step 3: Implement `js/jotoba.js`**

```js
// Online Japanese dictionary lookup (Jotoba) for the Add word form. Only the typed query is sent.
// Chinese is not available from this source; the pitch number is given only when the pattern
// settles it (see accentFromPitch).
import { morae } from "./pitch.js";

const URL = "https://jotoba.de/api/search/words";
const MAX_RESULTS = 5;
const MAX_GLOSSES = 3;
const cache = new Map();

// Jotoba gives the pitch as parts with a high/low flag. A drop inside the word fixes the accent
// number. A word that rises and stays high looks the same whether it is flat (0) or drops only on
// the following particle (last mora), so those return null and the learner decides.
export function accentFromPitch(pitch, kana) {
  if (!Array.isArray(pitch) || pitch.length === 0) return null;
  if (pitch.some(p => !p || typeof p.part !== "string")) return null;
  if (pitch.map(p => p.part).join("") !== kana) return null;
  const flags = pitch.flatMap(p => morae(p.part).map(() => Boolean(p.high)));
  if (flags.length !== morae(kana).length) return null;
  for (let i = 0; i + 1 < flags.length; i++) if (flags[i] && !flags[i + 1]) return i + 1;
  return null;
}

function candidatesFrom(data) {
  const out = [], seen = new Set();
  for (const w of Array.isArray(data?.words) ? data.words : []) {
    const kana = w?.reading?.kana;
    if (typeof kana !== "string" || !kana) continue;
    const kanji = typeof w.reading.kanji === "string" ? w.reading.kanji : "";
    const glosses = [];
    for (const sense of Array.isArray(w.senses) ? w.senses : []) {
      if (sense?.language && sense.language !== "English") continue;
      for (const g of Array.isArray(sense?.glosses) ? sense.glosses : []) {
        if (typeof g === "string" && g && !glosses.includes(g) && glosses.length < MAX_GLOSSES) glosses.push(g);
      }
    }
    if (!glosses.length) continue;
    const word = kanji || kana, key = `${word}|${kana}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, word, kana, en: glosses.join("; "), zh: "", accent: accentFromPitch(w.pitch, kana), source: "dictionary" });
    if (out.length === MAX_RESULTS) break;
  }
  return out;
}

const fail = (message, aborted = false) => Object.assign(new Error(message), { aborted });

// Resolves to up to 5 candidates, or rejects with an Error whose message is fit to show.
// `signal` lets the caller cancel (the error then has aborted === true).
export async function searchJotoba(query, { fetchFn = (...a) => fetch(...a), timeoutMs = 6000, signal } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return [];
  if (cache.has(q)) return cache.get(q);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const relay = () => ctl.abort();
  signal?.addEventListener("abort", relay);
  try {
    let res;
    try {
      res = await fetchFn(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, language: "English", no_english: false }),
        signal: ctl.signal,
      });
    } catch {
      if (signal?.aborted) throw fail("The lookup was cancelled.", true);
      throw fail(ctl.signal.aborted ? "The dictionary took too long to answer." : "Couldn't reach the dictionary.");
    }
    if (!res.ok) throw fail(`The dictionary answered with an error (${res.status}).`);
    let data;
    try { data = await res.json(); } catch { throw fail("The dictionary sent an unreadable answer."); }
    const found = candidatesFrom(data);
    cache.set(q, found);
    return found;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}
```

- [ ] **Step 4: Precache and run all tests**

Add `"js/jotoba.js"` to `FILES` in `sw.js` (next to `"js/lookup.js"`).
Run: `npm run bump-sw && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/jotoba.js test/jotoba.test.js sw.js
git commit -m "Add the Jotoba dictionary client and pitch-to-accent conversion"
```

---

### Task 3: Lookup in the Add word form

**Files:**
- Modify: `index.html`, `css/style.css`, `js/bank-ui.js`

- [ ] **Step 1: Markup**

In `index.html`, in `#bankForm`, directly after the `<label>English <input name="en"></label>` line and before the Chinese label, insert:

```html
      <div id="bankLookup" class="bank-lookup">
        <button type="button" class="btn" id="bankLookupBtn">🔍 Look up</button>
        <div id="bankSuggest" class="bank-suggest"></div>
        <p class="muted" id="bankLookupMsg" aria-live="polite">Type a Japanese word, its reading or an English word, then pick a match.</p>
      </div>
```

- [ ] **Step 2: Styles**

Append to `css/style.css`:

```css
.bank-lookup { display: grid; gap: 8px; }
.bank-lookup[hidden] { display: none; }
.bank-lookup .btn { justify-self: start; }
.bank-suggest { display: grid; gap: 6px; }
.bank-sug {
  display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; padding: 8px 12px;
  border: 1px solid var(--line); border-radius: 12px; background: var(--card); font: inherit; color: var(--ink); cursor: pointer;
}
.bank-sug .sug-main { font-size: 20px; }
.bank-sug .sug-kana { font-size: 14px; color: var(--muted); margin-left: 6px; }
.bank-sug .sug-en { grid-column: 1; font-size: 14px; color: var(--muted); }
.bank-sug .sug-src { grid-column: 2; grid-row: 1; font-size: 11px; color: var(--muted); align-self: center; }
@media (hover: hover) { .bank-sug:hover { border-color: var(--ink); } }
@media (max-width: 640px) { .bank-sug { min-height: 44px; } }
```

- [ ] **Step 3: Wire `js/bank-ui.js`**

Add to the imports at the top of the file:

```js
import { lookupLocal, exactLocal } from "./lookup.js";
import { searchJotoba } from "./jotoba.js";
```

Inside `initBank`, directly after the `updateMoraHint` function, add the lookup block:

```js
  // ---------- Lookup (the Add word form only) ----------
  const LOOKUP_FIELDS = ["word", "kana", "en"];
  let sug = [], lastField = "word", ctl = null, localTimer = null, onlineTimer = null, autoFilled = false;
  const myKeys = () => new Set(liveMyWords(getState()).map(w => `${w.word}|${w.kana}`));
  const lookupOn = () => panel === "bankForm" && editingId === null;
  const setLookupMsg = text => { $("bankLookupMsg").textContent = text; };

  function renderSuggestions() {
    $("bankSuggest").innerHTML = sug.map((s, i) => `<button type="button" class="bank-sug" data-i="${i}">
      <span class="sug-main">${esc(s.word)}${s.word !== s.kana ? `<span class="sug-kana">${esc(s.kana)}</span>` : ""}</span>
      <span class="sug-src">${s.source === "dictionary" ? "dictionary" : "built-in"}</span>
      <span class="sug-en">${esc(s.en)}${s.zh ? ` · ${esc(s.zh)}` : ""}</span></button>`).join("");
  }

  function stopLookup() {
    clearTimeout(localTimer); clearTimeout(onlineTimer);
    ctl?.abort(); ctl = null;
  }

  function resetLookup() {
    stopLookup();
    sug = []; autoFilled = false;
    renderSuggestions();
    setLookupMsg("Type a Japanese word, its reading or an English word, then pick a match.");
  }

  function fillFrom(s) {
    const f = $("bankForm");
    f.word.value = s.word; f.kana.value = s.kana; f.en.value = s.en ?? ""; f.zh.value = s.zh ?? "";
    f.accent.value = Number.isInteger(s.accent) ? String(s.accent) : "";
    $("bankFormMsg").textContent = "";
    updateMoraHint();
  }

  // Instant, offline: built-in matches, with an auto-fill when exactly one word matches exactly.
  function runLocal(field) {
    if (!lookupOn()) return;
    const f = $("bankForm"), q = f[field].value;
    autoFilled = false;
    if (!q.trim()) { sug = []; renderSuggestions(); setLookupMsg(""); return; }
    const exclude = myKeys();
    if (field !== "en" && ([...q.trim()].length >= 2 || /[一-鿿]/.test(q))) {
      const exact = exactLocal(q, exclude);
      const othersEmpty = ["word", "kana", "en", "zh", "accent"].filter(n => n !== field).every(n => !f[n].value.trim());
      if (exact.length === 1 && othersEmpty) {
        fillFrom(exact[0]);
        sug = []; autoFilled = true;
        renderSuggestions();
        setLookupMsg("Filled from the built-in words — edit if needed.");
        return;
      }
    }
    sug = lookupLocal(q, { exclude });
    renderSuggestions();
    setLookupMsg("");
  }

  // Online: Jotoba. A newer query cancels the older one; failures never block adding a word by hand.
  async function runOnline(field) {
    if (!lookupOn() || autoFilled) return;
    const q = $("bankForm")[field].value.trim();
    if (!q) return;
    ctl?.abort();
    const mine = ctl = new AbortController();
    setLookupMsg("Looking up…");
    try {
      const found = await searchJotoba(q, { signal: mine.signal });
      if (mine.signal.aborted || !lookupOn()) return;
      const have = new Set([...sug.map(s => s.key), ...myKeys()]);
      sug = [...sug, ...found.filter(s => !have.has(s.key))];
      renderSuggestions();
      setLookupMsg(sug.length ? "" : "No matches — type the word in yourself.");
    } catch (e) {
      if (e.aborted || mine.signal.aborted || !lookupOn()) return;
      setLookupMsg(sug.length
        ? "Couldn't reach the online dictionary — showing built-in matches only."
        : `${e.message} You can type the word in yourself.`);
    }
  }

  for (const field of LOOKUP_FIELDS) {
    $("bankForm")[field].addEventListener("input", () => {
      if (!lookupOn()) return;
      lastField = field;
      stopLookup();
      localTimer = setTimeout(() => runLocal(field), 150);
      onlineTimer = setTimeout(() => runOnline(field), 450);
    });
  }
  $("bankLookupBtn").addEventListener("click", () => {
    stopLookup();
    runLocal(lastField);
    runOnline(lastField);
  });
  $("bankSuggest").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]");
    const s = b && sug[Number(b.dataset.i)];
    if (!s) return;
    stopLookup();
    fillFrom(s);
    sug = []; autoFilled = true;
    renderSuggestions();
    setLookupMsg("Filled from the dictionary — edit if needed.");
  });
```

Then make three small edits elsewhere in `bank-ui.js`:
- in `show(name)`, add as the first statement: `if (name !== "bankForm") stopLookup();` — `stopLookup` is a function declaration inside `initBank`, so it is hoisted;
- in `openForm`, after `$("bankFormMsg").textContent = "";`, add: `$("bankLookup").hidden = Boolean(id); resetLookup(); lastField = "word";`;
- nothing else changes: submit, cancel and validation keep working as they are.

- [ ] **Step 4: Run tests, bump, commit**

Run: `npm run bump-sw && npm test` — expected all pass (Playwright is not available to implementers; the controller runs Task 4).

```bash
git add index.html css/style.css js/bank-ui.js sw.js
git commit -m "Look up words in the Add word form: built-in words first, then Jotoba"
```

---

### Task 4: Browser check

**Files:** none (scratch scripts in git-ignored `.playwright-mcp/`)

- [ ] **Step 1: Build a serving script**

As for the earlier features: `.playwright-mcp/lookup-walk.js` embeds `index.html`, `manifest.webmanifest`, `sw.js`, `css/style.css`, every `js/*.js` and `js/decks/*.js`, routes `https://hira.test/**` with `page.route`, viewport 390×844, stubs `speechSynthesis.speak`, clears `localStorage`. Add a second route for `https://jotoba.de/api/search/words` that answers the `OPTIONS` preflight (204 with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Allow-Methods: POST`) and, for `POST`, parses the body's `query` and returns canned JSON: for `ありがとう` and `本棚` a result with reading/kanji, English senses and a `pitch` array; for anything else `{ "words": [] }`; a query `fail` returns status 503. Record every request body in `window`-visible array via `page.evaluate` or in the Node closure. Read results from the saved result file with `head -c`.

- [ ] **Step 2: Walk through**

1. Open Dictionary → Add word. The lookup block shows its hint; Look up is visible.
2. Type `猫`-style input where the app knows the word, e.g. `愛` into Japanese: after the pause the reading `あい`, English `love` and Chinese fill in on their own with the "Filled from the built-in words" note; pitch is filled (the word-list accent); no Jotoba request was made.
3. Clear the fields. Type `あい` into Reading only: a list of up to 6 built-in rows, each tagged "built-in"; tap one: all five fields fill; Save works and the word appears in My words.
4. English field: type `cat` — built-in rows (if any) appear; type a word the app does not know, e.g. `本棚` in Japanese: after about half a second the stub's dictionary row appears tagged "dictionary" below any built-in ones; tap it: Japanese/Reading/English fill, Chinese is empty, Pitch is empty or the derived number; Save works with only English as the meaning.
5. Query `fail` → the message "The dictionary answered with an error (503). You can type the word in yourself." and manual typing still saves. Abort the route (`route.abort()`) for another query → "Couldn't reach the dictionary." message.
6. Typing quickly (several characters within 450 ms) results in a single Jotoba request, for the final text only; the older request is cancelled.
7. Edit an existing word: the lookup block is hidden and no lookups fire when typing.
8. Cancel returns to the list; reopening the form shows no stale suggestions.
9. No console errors other than icon 404s from the test server.
10. Real service: from Node (`page.request.post`, outside the page), POST `{"query":"猫","language":"English","no_english":false}` to `https://jotoba.de/api/search/words` and confirm `words[0].reading.kana` is a string, `words[0].senses[0].glosses` an array and `words[0].pitch` an array of `{part, high}`. If the shape differs, fix `jotoba.js` and its tests.

- [ ] **Step 3: Fix anything found**

Fix with a failing test where the logic is testable, otherwise directly; re-run `npm test` and the failing check.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A js css index.html test sw.js
git commit -m "Fix issues found in the lookup browser check"
```

(Skip if nothing changed.)

---

### Task 5: Final review and publish (needs the user's go-ahead)

- [ ] **Step 1:** Dispatch a read-only reviewer on `git diff main...feature/lookup` (lookup ranking and false auto-fills, timer/abort races between the 150 ms and 450 ms searches, stale responses applied after Cancel/Save/edit, HTML escaping of dictionary text, handling of unusual Jotoba responses, the single outbound URL, service worker unaffected, sw precache). Fix real findings.
- [ ] **Step 2:** `npm run bump-sw && npm test` all pass; `git status` clean.
- [ ] **Step 3:** Tell the user it is ready and ask whether to publish. Only after a yes: `git checkout main && git merge --ff-only feature/lookup && GH_HOST=github.com git push origin main` (account yupeng9; never the Apple-internal hosts).
- [ ] **Step 4:** After about a minute confirm the Pages build (`GH_HOST=github.com gh api repos/yupeng9/hiragana/pages/builds/latest --jq '.status + " " + .commit'` shows `built` with the pushed commit) and fetch `https://yupeng9.github.io/hiragana/sw.js` in Playwright to confirm the new VERSION. Delete the merged branch.
- [ ] **Step 5:** Tell the user lookups from Jotoba need a connection and send only what they typed.
