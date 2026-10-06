# iPhone + Mac with Gist Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hiragana practice app installable and usable offline on iPhone and Mac, with progress and saved words synced through a secret GitHub Gist.

**Architecture:** Split the single `index.html` into plain ES modules with no build step. `merge.js` is a pure, tested merge of two timestamped states. `store.js` owns the local state shape, the v1 → v2 migration, and all state mutations. `sync.js` talks to the Gist API and schedules sync runs. `app.js` is the UI. A service worker and web manifest make it a PWA, and GitHub Pages hosts it.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), Service Worker, GitHub REST API (gists), `node --test` for unit tests, Playwright (MCP) for browser checks, `gh` CLI for publishing.

**Spec:** `docs/superpowers/specs/2026-10-06-iphone-mac-sync-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `index.html` | Markup + meta tags; loads `css/style.css` and `js/app.js` |
| `css/style.css` | All styles; mobile layout in a `max-width: 640px` media query |
| `js/data.js` | `ROWS`, `DEFAULT_ROWS`, `MAX_BOX`, `ALL`, `WORDS` (moved verbatim) |
| `js/merge.js` | `merge(a, b)`, `canonical(value)` — pure |
| `js/store.js` | State shape, `loadState`/`saveState`, migration, mutation helpers |
| `js/sync.js` | `GistClient`, `connect`, `Syncer`, `SyncError` |
| `js/app.js` | All UI and wiring |
| `sw.js` | Offline cache (stale-while-revalidate for same-origin GETs) |
| `manifest.webmanifest`, `icons/*.png` | PWA install metadata |
| `test/*.test.js` | Unit tests (`npm test`) |
| `package.json` | `"type": "module"` + test script |

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `.gitignore`
- Commit: existing `index.html` as the baseline

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "hiragana-practice",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
.playwright-mcp/
node_modules/
.DS_Store
```

- [ ] **Step 3: Commit the baseline**

```bash
git add package.json .gitignore index.html
git commit -m "Add single-file hiragana app as baseline"
```

---

### Task 2: Pure merge (`js/merge.js`)

**Files:**
- Create: `js/merge.js`
- Test: `test/merge.test.js`

- [ ] **Step 1: Write the failing tests** — `test/merge.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { merge, canonical } from "../js/merge.js";

const base = (over = {}) => ({
  version: 2,
  settings: { rows: ["a"], mode: "type", autoSpeak: false, t: 0 },
  stats: {},
  dictionary: {},
  bestStreak: { value: 0, t: 0 },
  resetAt: 0,
  ...over,
});

test("combines words saved on different devices", () => {
  const a = base({ dictionary: { あい: { t: 10, deleted: false } } });
  const b = base({ dictionary: { かさ: { t: 20, deleted: false } } });
  assert.deepEqual(Object.keys(merge(a, b).dictionary).sort(), ["あい", "かさ"]);
});

test("a removal beats an older save", () => {
  const a = base({ dictionary: { かさ: { t: 30, deleted: true } } });
  const b = base({ dictionary: { かさ: { t: 10, deleted: false } } });
  assert.equal(merge(a, b).dictionary.かさ.deleted, true);
});

test("a save after a removal wins", () => {
  const a = base({ dictionary: { かさ: { t: 30, deleted: false } } });
  const b = base({ dictionary: { かさ: { t: 20, deleted: true } } });
  assert.equal(merge(a, b).dictionary.かさ.deleted, false);
});

test("newer stats win per character", () => {
  const a = base({ stats: {
    か: { box: 1, seen: 1, correct: 1, t: 10 },
    さ: { box: 2, seen: 2, correct: 2, t: 10 },
  } });
  const b = base({ stats: { か: { box: 3, seen: 5, correct: 4, t: 20 } } });
  const m = merge(a, b);
  assert.deepEqual(m.stats.か, { box: 3, seen: 5, correct: 4, t: 20 });
  assert.deepEqual(m.stats.さ, { box: 2, seen: 2, correct: 2, t: 10 });
});

test("newer settings win", () => {
  const a = base({ settings: { rows: ["a", "ka"], mode: "pick", autoSpeak: true, t: 5 } });
  const b = base();
  assert.deepEqual(merge(a, b).settings, a.settings);
});

test("a reset on one device clears older stats and best streak", () => {
  const a = base({ resetAt: 50, bestStreak: { value: 0, t: 50 } });
  const b = base({
    stats: {
      か: { box: 3, seen: 3, correct: 3, t: 40 },
      さ: { box: 1, seen: 1, correct: 1, t: 60 },
    },
    bestStreak: { value: 9, t: 40 },
  });
  const m = merge(a, b);
  assert.deepEqual(Object.keys(m.stats), ["さ"]);
  assert.equal(m.bestStreak.value, 0);
  assert.equal(m.resetAt, 50);
});

test("a reset keeps the dictionary", () => {
  const a = base({ resetAt: 50, bestStreak: { value: 0, t: 50 } });
  const b = base({ dictionary: { かさ: { t: 40, deleted: false } } });
  assert.equal(merge(a, b).dictionary.かさ.deleted, false);
});

test("is commutative and idempotent, including ties", () => {
  const a = base({
    settings: { rows: ["a"], mode: "pick", autoSpeak: false, t: 7 },
    stats: { か: { box: 1, seen: 1, correct: 1, t: 10 } },
    dictionary: { かさ: { t: 15, deleted: true }, あい: { t: 3, deleted: false } },
    bestStreak: { value: 4, t: 12 },
  });
  const b = base({
    settings: { rows: ["a", "ka"], mode: "type", autoSpeak: true, t: 7 },
    stats: { か: { box: 2, seen: 2, correct: 1, t: 10 }, さ: { box: 1, seen: 1, correct: 1, t: 2 } },
    dictionary: { かさ: { t: 15, deleted: false } },
    bestStreak: { value: 6, t: 11 },
  });
  const ab = merge(a, b);
  assert.equal(canonical(ab), canonical(merge(b, a)));
  assert.equal(canonical(merge(ab, ab)), canonical(ab));
  assert.equal(canonical(merge(ab, a)), canonical(ab));
});

test("canonical ignores key order", () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: [3] } }), canonical({ a: { c: [3], d: 2 }, b: 1 }));
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../js/merge.js`

- [ ] **Step 3: Implement** — `js/merge.js`

```js
// Merges two progress states (see docs/superpowers/specs/2026-10-06-iphone-mac-sync-design.md).
// Every item carries a timestamp `t`; the newer one wins. merge is commutative and
// idempotent, so devices that sync in any order end up with the same state.

// JSON with sorted keys, so equal states always produce equal strings.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Newer t wins; on a tie, compare canonical JSON so both devices pick the same entry.
function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.t !== b.t) return a.t > b.t ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

function mergeMap(a = {}, b = {}, keep = () => true) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const entry = newer(a[key], b[key]);
    if (keep(entry)) out[key] = entry;
  }
  return out;
}

export function merge(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
  const best = newer(a.bestStreak, b.bestStreak);
  return {
    version: 2,
    settings: newer(a.settings, b.settings),
    stats: mergeMap(a.stats, b.stats, s => s.t >= resetAt),
    dictionary: mergeMap(a.dictionary, b.dictionary),
    bestStreak: best.t >= resetAt ? best : { value: 0, t: resetAt },
    resetAt,
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: PASS — 9 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add js/merge.js test/merge.test.js
git commit -m "Add timestamp-based merge for synced progress"
```

---

### Task 3: Data module and local store (`js/data.js`, `js/store.js`)

**Files:**
- Create: `js/data.js` (moved from `index.html` lines 219–374)
- Create: `js/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: Extract `js/data.js` from `index.html`**

Copy the lines from `// ---------- Data ----------` through the line ending `accent }));` (lines 219–374) into `js/data.js`, and export the five constants:

```bash
mkdir -p js
python3 - <<'EOF'
lines = open("index.html", encoding="utf-8").read().split("\n")
start = next(i for i, l in enumerate(lines) if l.startswith("// ---------- Data"))
end = next(i for i, l in enumerate(lines) if l.endswith("accent }));"))
src = "\n".join(lines[start:end + 1]) + "\n"
for name in ["ROWS", "DEFAULT_ROWS", "MAX_BOX", "ALL", "WORDS"]:
    assert src.count(f"const {name} =") == 1, name
    src = src.replace(f"const {name} =", f"export const {name} =")
open("js/data.js", "w", encoding="utf-8").write(src)
EOF
node -e 'import("./js/data.js").then(d => console.log(d.ROWS.length, d.ALL.length, d.WORDS.length, d.DEFAULT_ROWS))'
```

Expected output: `11 46 126 [ 'a', 'ka', 'sa', 'ta' ]`

- [ ] **Step 2: Write the failing tests** — `test/store.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORE_KEY, LEGACY_KEY, loadState, saveState, statOf, isSaved, savedWords,
  toggleWord, recordAnswer, updateBest, setSettings, resetProgress,
} from "../js/store.js";
import { DEFAULT_ROWS, MAX_BOX } from "../js/data.js";

const memoryStorage = (data = {}) => ({
  data,
  getItem(k) { return k in this.data ? this.data[k] : null; },
  setItem(k, v) { this.data[k] = String(v); },
});

test("a new device starts empty with every timestamp at 0", () => {
  const s = loadState(memoryStorage(), 5000);
  assert.deepEqual(s.settings, { rows: DEFAULT_ROWS, mode: "type", autoSpeak: false, t: 0 });
  assert.deepEqual(s.bestStreak, { value: 0, t: 0 });
  assert.deepEqual(s.stats, {});
  assert.deepEqual(s.dictionary, {});
  assert.equal(s.resetAt, 0);
});

test("migrates v1 data, keeping saved-word times", () => {
  const v1 = {
    rows: ["a", "ka"], mode: "pick", autoSpeak: true, bestStreak: 7,
    stats: { か: { box: 2, seen: 3, correct: 2 } },
    dictionary: { かさ: 1700000000000 },
  };
  const s = loadState(memoryStorage({ [LEGACY_KEY]: JSON.stringify(v1) }), 5000);
  assert.deepEqual(s.settings, { rows: ["a", "ka"], mode: "pick", autoSpeak: true, t: 5000 });
  assert.deepEqual(s.stats.か, { box: 2, seen: 3, correct: 2, t: 5000 });
  assert.deepEqual(s.dictionary.かさ, { t: 1700000000000, deleted: false });
  assert.deepEqual(s.bestStreak, { value: 7, t: 5000 });
});

test("prefers saved v2 data over v1", () => {
  const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify({ bestStreak: 7 }) });
  const s = loadState(storage, 1);
  s.bestStreak = { value: 3, t: 9 };
  saveState(storage, s);
  assert.equal(JSON.parse(storage.getItem(STORE_KEY)).bestStreak.value, 3);
  assert.equal(loadState(storage, 2).bestStreak.value, 3);
});

test("statOf reads without creating entries", () => {
  const s = loadState(memoryStorage(), 0);
  assert.equal(statOf(s, "か").box, 0);
  assert.deepEqual(s.stats, {});
});

test("recordAnswer moves the box and counts, with a timestamp", () => {
  const s = loadState(memoryStorage(), 0);
  recordAnswer(s, "か", true, 10);
  recordAnswer(s, "か", true, 11);
  assert.deepEqual(s.stats.か, { box: 2, seen: 2, correct: 2, t: 11 });
  recordAnswer(s, "か", false, 12);
  assert.deepEqual(s.stats.か, { box: 0, seen: 3, correct: 2, t: 12 });
  for (let i = 0; i < 10; i++) recordAnswer(s, "さ", true, 20 + i);
  assert.equal(s.stats.さ.box, MAX_BOX);
});

test("toggleWord saves, removes, and re-saves", () => {
  const s = loadState(memoryStorage(), 0);
  toggleWord(s, "かさ", 10);
  assert.equal(isSaved(s, "かさ"), true);
  toggleWord(s, "かさ", 20);
  assert.equal(isSaved(s, "かさ"), false);
  assert.deepEqual(s.dictionary.かさ, { t: 20, deleted: true });
  toggleWord(s, "かさ", 30);
  assert.deepEqual(s.dictionary.かさ, { t: 30, deleted: false });
});

test("savedWords lists saved words newest first and skips removed ones", () => {
  const s = loadState(memoryStorage(), 0);
  toggleWord(s, "あい", 10);
  toggleWord(s, "かさ", 30);
  toggleWord(s, "すし", 20);
  toggleWord(s, "すし", 40);
  assert.deepEqual(savedWords(s), [{ kana: "かさ", t: 30 }, { kana: "あい", t: 10 }]);
});

test("updateBest only ever raises the best streak", () => {
  const s = loadState(memoryStorage(), 0);
  updateBest(s, 3, 10);
  updateBest(s, 2, 11);
  assert.deepEqual(s.bestStreak, { value: 3, t: 10 });
});

test("setSettings applies a patch with a new timestamp", () => {
  const s = loadState(memoryStorage(), 0);
  setSettings(s, { mode: "pick" }, 10);
  assert.deepEqual(s.settings, { rows: DEFAULT_ROWS, mode: "pick", autoSpeak: false, t: 10 });
});

test("resetProgress clears stats and best streak but keeps saved words", () => {
  const s = loadState(memoryStorage(), 0);
  recordAnswer(s, "か", true, 10);
  updateBest(s, 5, 10);
  toggleWord(s, "かさ", 10);
  resetProgress(s, 50);
  assert.deepEqual(s.stats, {});
  assert.deepEqual(s.bestStreak, { value: 0, t: 50 });
  assert.equal(s.resetAt, 50);
  assert.equal(isSaved(s, "かさ"), true);
});
```

- [ ] **Step 3: Run tests, verify the new ones fail**

Run: `npm test`
Expected: merge tests PASS; store tests FAIL — `Cannot find module .../js/store.js`

- [ ] **Step 4: Implement** — `js/store.js`

```js
// Local progress state: shape, persistence, v1 migration, and every mutation.
// Each mutation stamps the changed item with `t` so merge.js can sync it.
import { DEFAULT_ROWS, MAX_BOX } from "./data.js";

export const STORE_KEY = "hiragana-practice-v2";
export const LEGACY_KEY = "hiragana-practice-v1";
const UNSEEN = Object.freeze({ box: 0, seen: 0, correct: 0, t: 0 });

// Everything starts at t = 0, so a brand-new device never overrides synced progress.
export function emptyState() {
  return {
    version: 2,
    settings: { rows: [...DEFAULT_ROWS], mode: "type", autoSpeak: false, t: 0 },
    stats: {},
    dictionary: {},
    bestStreak: { value: 0, t: 0 },
    resetAt: 0,
  };
}

export function migrateV1(v1, now) {
  const s = emptyState();
  s.settings = {
    rows: v1.rows || [...DEFAULT_ROWS],
    mode: v1.mode || "type",
    autoSpeak: v1.autoSpeak ?? false,
    t: now,
  };
  for (const [kana, st] of Object.entries(v1.stats || {})) {
    s.stats[kana] = { box: st.box, seen: st.seen, correct: st.correct, t: now };
  }
  for (const [kana, savedAt] of Object.entries(v1.dictionary || {})) {
    s.dictionary[kana] = { t: savedAt, deleted: false };
  }
  s.bestStreak = { value: v1.bestStreak || 0, t: now };
  return s;
}

export function loadState(storage, now = Date.now()) {
  const v2 = storage.getItem(STORE_KEY);
  if (v2) return JSON.parse(v2);
  const v1 = storage.getItem(LEGACY_KEY);
  return v1 ? migrateV1(JSON.parse(v1), now) : emptyState();
}

export const saveState = (storage, state) => storage.setItem(STORE_KEY, JSON.stringify(state));

export const statOf = (state, kana) => state.stats[kana] || UNSEEN;

export const isSaved = (state, kana) => !!state.dictionary[kana] && !state.dictionary[kana].deleted;

export const savedWords = state => Object.entries(state.dictionary)
  .filter(([, entry]) => !entry.deleted)
  .sort((a, b) => b[1].t - a[1].t)
  .map(([kana, entry]) => ({ kana, t: entry.t }));

// Removing a word leaves a tombstone so the removal syncs to the other device.
export function toggleWord(state, kana, now) {
  state.dictionary[kana] = { t: now, deleted: isSaved(state, kana) };
}

export function recordAnswer(state, kana, ok, now) {
  const s = statOf(state, kana);
  state.stats[kana] = {
    box: ok ? Math.min(MAX_BOX, s.box + 1) : 0,
    seen: s.seen + 1,
    correct: s.correct + (ok ? 1 : 0),
    t: now,
  };
}

export function updateBest(state, streak, now) {
  if (streak > state.bestStreak.value) state.bestStreak = { value: streak, t: now };
}

export function setSettings(state, patch, now) {
  state.settings = { ...state.settings, ...patch, t: now };
}

export function resetProgress(state, now) {
  state.stats = {};
  state.bestStreak = { value: 0, t: now };
  state.resetAt = now;
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: PASS — 19 tests, 0 failures

- [ ] **Step 6: Commit**

```bash
git add js/data.js js/store.js test/store.test.js
git commit -m "Add data module and timestamped local store with v1 migration"
```

---

### Task 4: Gist sync client and scheduler (`js/sync.js`)

**Files:**
- Create: `js/sync.js`
- Test: `test/sync.test.js`

- [ ] **Step 1: Write the failing tests** — `test/sync.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { GistClient, Syncer, connect, GIST_FILE } from "../js/sync.js";
import { emptyState } from "../js/store.js";

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// fetch stub: routes "METHOD path" to a handler; records calls.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    const key = `${opts.method} ${url.replace("https://api.github.com", "")}`;
    calls.push({ key, opts });
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected request ${key}`);
    return handler(opts);
  };
  fn.calls = calls;
  return fn;
}

const withWord = (kana, t) => {
  const s = emptyState();
  s.dictionary[kana] = { t, deleted: false };
  return s;
};

test("connect finds an existing gist by file name", async () => {
  const fetch = fakeFetch({
    "GET /user": () => reply(200, { login: "yupeng9" }),
    "GET /gists?per_page=100&page=1": () => reply(200, [
      { id: "other", files: { "notes.md": {} } },
      { id: "g1", files: { [GIST_FILE]: {} } },
    ]),
  });
  assert.deepEqual(await connect(new GistClient("tok", fetch), emptyState()), { login: "yupeng9", gistId: "g1" });
  assert.equal(fetch.calls[0].opts.headers.Authorization, "Bearer tok");
});

test("connect creates a secret gist when none exists", async () => {
  let created;
  const fetch = fakeFetch({
    "GET /user": () => reply(200, { login: "yupeng9" }),
    "GET /gists?per_page=100&page=1": () => reply(200, []),
    "POST /gists": opts => { created = JSON.parse(opts.body); return reply(201, { id: "new" }); },
  });
  const result = await connect(new GistClient("tok", fetch), withWord("かさ", 5));
  assert.equal(result.gistId, "new");
  assert.equal(created.public, false);
  assert.equal(JSON.parse(created.files[GIST_FILE].content).dictionary.かさ.t, 5);
});

test("client reports a bad token as status 401 and a network failure as status 0", async () => {
  const bad = new GistClient("tok", fakeFetch({ "GET /user": () => reply(401, {}) }));
  await assert.rejects(bad.user(), e => e.status === 401);
  const offline = new GistClient("tok", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(offline.user(), e => e.status === 0);
});

test("client reads and writes the progress file", async () => {
  let written;
  const fetch = fakeFetch({
    "GET /gists/g1": () => reply(200, { files: { [GIST_FILE]: { content: JSON.stringify(withWord("あい", 1)) } } }),
    "PATCH /gists/g1": opts => { written = JSON.parse(opts.body); return reply(200, {}); },
  });
  const client = new GistClient("tok", fetch);
  assert.equal((await client.read("g1")).dictionary.あい.t, 1);
  await client.write("g1", withWord("かさ", 2));
  assert.equal(JSON.parse(written.files[GIST_FILE].content).dictionary.かさ.t, 2);
});

// Syncer tests use a fake client with an in-memory "remote".
function harness({ remote = null, local = emptyState(), online = true, readError } = {}) {
  const h = { remote, local, statuses: [], writes: 0, reads: 0 };
  h.client = {
    read: async () => { h.reads++; if (readError) throw readError; return h.remote; },
    write: async (_id, s) => { h.writes++; h.remote = JSON.parse(JSON.stringify(s)); },
  };
  h.syncer = new Syncer({
    client: h.client, gistId: "g1",
    getState: () => h.local,
    applyState: s => { h.local = s; },
    onStatus: s => h.statuses.push(s.kind),
    isOnline: () => online,
    delay: 0,
  });
  return h;
}

test("first sync uploads local progress when the gist is empty", async () => {
  const h = harness({ local: withWord("かさ", 5) });
  await h.syncer.run();
  assert.equal(h.writes, 1);
  assert.equal(h.remote.dictionary.かさ.t, 5);
  assert.deepEqual(h.statuses, ["syncing", "ok"]);
});

test("pulls remote changes and skips the upload when nothing is new locally", async () => {
  const h = harness({ remote: withWord("あい", 9) });
  await h.syncer.run();
  assert.equal(h.local.dictionary.あい.t, 9);
  assert.equal(h.writes, 0);
});

test("uploads when local has changes the remote lacks", async () => {
  const h = harness({ remote: withWord("あい", 9), local: withWord("かさ", 5) });
  await h.syncer.run();
  assert.equal(h.writes, 1);
  assert.deepEqual(Object.keys(h.remote.dictionary).sort(), ["あい", "かさ"]);
});

test("reports offline without contacting GitHub", async () => {
  const h = harness({ online: false });
  await h.syncer.run();
  assert.equal(h.reads, 0);
  assert.deepEqual(h.statuses, ["offline"]);
});

test("a network failure mid-sync reports offline", async () => {
  const h = harness({ readError: Object.assign(new Error("offline"), { status: 0 }) });
  await h.syncer.run();
  assert.deepEqual(h.statuses, ["syncing", "offline"]);
});

test("a rejected token stops automatic syncing", async () => {
  const h = harness({ readError: Object.assign(new Error("bad token"), { status: 401 }) });
  await h.syncer.run();
  await h.syncer.run();
  assert.equal(h.reads, 1);
  assert.deepEqual(h.statuses, ["syncing", "error"]);
});

test("a run requested during a sync causes exactly one more cycle", async () => {
  const h = harness();
  const first = h.syncer.run();
  const second = h.syncer.run();
  const third = h.syncer.run();
  await Promise.all([first, second, third]);
  assert.equal(h.reads, 2);
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `npm test`
Expected: merge + store PASS; sync tests FAIL — `Cannot find module .../js/sync.js`

- [ ] **Step 3: Implement** — `js/sync.js`

```js
// Syncs progress through one file in a secret GitHub Gist.
import { merge, canonical } from "./merge.js";

const API = "https://api.github.com";
export const GIST_FILE = "hiragana-progress.json";
// Per-device sync settings { token, gistId, login }; stored locally, never synced.
export const CONFIG_KEY = "hiragana-sync";

// status 0 = network failure (offline); otherwise the HTTP status.
export class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const MESSAGES = {
  401: "GitHub rejected the token (wrong or expired). Disconnect and connect with a new token.",
  404: "The sync gist was not found. Disconnect and connect again.",
};

export class GistClient {
  constructor(token, fetchFn = (...args) => globalThis.fetch(...args)) {
    this.token = token;
    this.fetch = fetchFn;
  }

  async request(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await this.fetch(API + path, {
        method,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError("You're offline.", 0);
    }
    if (!res.ok) throw new SyncError(MESSAGES[res.status] || `GitHub returned ${res.status}.`, res.status);
    return res.json();
  }

  user() {
    return this.request("/user");
  }

  async findGist() {
    for (let page = 1; page <= 10; page++) {
      const gists = await this.request(`/gists?per_page=100&page=${page}`);
      const hit = gists.find(g => g.files && GIST_FILE in g.files);
      if (hit) return hit.id;
      if (gists.length < 100) break;
    }
    return null;
  }

  async createGist(state) {
    const gist = await this.request("/gists", {
      method: "POST",
      body: {
        description: "Hiragana Practice progress (synced by the app)",
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(state) } },
      },
    });
    return gist.id;
  }

  async read(gistId) {
    const gist = await this.request(`/gists/${gistId}`);
    const file = gist.files[GIST_FILE];
    return file ? JSON.parse(file.content) : null;
  }

  write(gistId, state) {
    return this.request(`/gists/${gistId}`, {
      method: "PATCH",
      body: { files: { [GIST_FILE]: { content: JSON.stringify(state) } } },
    });
  }
}

// Checks the token and finds this user's progress gist, creating it on first use.
export async function connect(client, state) {
  const { login } = await client.user();
  const gistId = (await client.findGist()) ?? (await client.createGist(state));
  return { login, gistId };
}

// Runs pull → merge → push cycles, one at a time.
// onStatus receives { kind: "syncing" | "ok" | "offline" | "error", at?, message? }.
export class Syncer {
  constructor({ client, gistId, getState, applyState, onStatus, isOnline = () => true, delay = 3000 }) {
    Object.assign(this, { client, gistId, getState, applyState, onStatus, isOnline, delay });
    this.active = null;     // promise of the running cycle loop
    this.again = false;     // a run was requested while one was active
    this.stopped = false;   // set after a 401 or stop(); needs a new Syncer to resume
    this.timer = null;
  }

  // Debounced run, used after local changes.
  schedule() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), this.delay);
  }

  run() {
    if (this.stopped) return Promise.resolve();
    if (this.active) {
      this.again = true;
      return this.active;
    }
    this.active = (async () => {
      do {
        this.again = false;
        await this.cycle();
      } while (this.again && !this.stopped);
      this.active = null;
    })();
    return this.active;
  }

  async cycle() {
    if (!this.isOnline()) {
      this.onStatus({ kind: "offline" });
      return;
    }
    this.onStatus({ kind: "syncing" });
    try {
      const remote = await this.client.read(this.gistId);
      const merged = remote ? merge(this.getState(), remote) : this.getState();
      this.applyState(merged);
      if (!remote || canonical(merged) !== canonical(remote)) await this.client.write(this.gistId, merged);
      this.onStatus({ kind: "ok", at: new Date() });
    } catch (e) {
      if (e.status === 0) {
        this.onStatus({ kind: "offline" });
        return;
      }
      if (e.status === 401 || e.status === 404) this.stopped = true;
      this.onStatus({ kind: "error", message: e.message });
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: PASS — 30 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add js/sync.js test/sync.test.js
git commit -m "Add Gist sync client and single-flight sync scheduler"
```

---

### Task 5: Split the app into modules and use the store

**Files:**
- Create: `css/style.css` (moved from `index.html` lines 8–133)
- Create: `js/app.js`
- Modify: `index.html` (becomes markup only)

- [ ] **Step 1: Move the styles to `css/style.css`**

```bash
mkdir -p css
python3 - <<'EOF'
lines = open("index.html", encoding="utf-8").read().split("\n")
start = lines.index("<style>") + 1
end = lines.index("</style>")
css = "\n".join(l[2:] if l.startswith("  ") else l for l in lines[start:end]) + "\n"
open("css/style.css", "w", encoding="utf-8").write(css)
EOF
head -3 css/style.css
```

Expected: first line is `:root {`

- [ ] **Step 2: Create `js/app.js`** — the existing script logic, now using `store.js` (state lives in `state.settings`, timestamped mutations, `persist()` instead of `save()`) and wired to sync.

```js
import { ROWS, ALL, WORDS, MAX_BOX } from "./data.js";
import {
  loadState, saveState, statOf, isSaved, savedWords, toggleWord, recordAnswer,
  updateBest, setSettings, resetProgress,
} from "./store.js";
import { merge } from "./merge.js";
import { GistClient, Syncer, connect, CONFIG_KEY } from "./sync.js";

let state = loadState(localStorage);
saveState(localStorage, state);  // persists a v1 → v2 migration straight away

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pool = () => ALL.filter(c => state.settings.rows.includes(c.row));

// Save locally, then sync a few seconds later.
function persist() {
  saveState(localStorage, state);
  syncer?.schedule();
}

function usableWords() {
  const known = new Set(pool().map(c => c.kana));
  return WORDS.filter(w => [...w.kana].every(ch => known.has(ch)));
}
const wordsWith = (kana, limit) => shuffle(usableWords().filter(w => w.kana.includes(kana))).slice(0, limit);

const starHtml = kana => {
  const on = isSaved(state, kana);
  return `<button class="star ${on ? "on" : ""}" data-save="${kana}" title="Save to my dictionary">${on ? "★" : "☆"}</button>`;
};

const CIRCLED = "⓪①②③④⑤⑥⑦⑧⑨";

// Which morae are high in Tokyo pitch accent: 0 = low-high-high…, 1 = high-low-low…,
// n ≥ 2 = low, high up to mora n, then low.
const isHigh = (i, accent) => accent === 0 ? i > 0 : accent === 1 ? i === 0 : i > 0 && i < accent;

function accentTitle(w) {
  const n = [...w.kana].length;
  const how = w.accent === 0 ? "flat: starts low, rises, never drops"
    : w.accent === n ? "rises, drops right after the word (on a following particle)"
    : `pitch drops after mora ${w.accent}`;
  return `Pitch accent ${w.accent}: ${how}. ${n} mora${n > 1 ? "e" : ""}.`;
}

// opts.highlight: kana to highlight. opts.hidden: during a question, hide whatever would give
// the answer away — the target kana becomes "？" in pick mode, the romaji is hidden in type mode.
function wordHtml(w, { highlight, hidden } = {}) {
  const kana = [...w.kana].map((ch, i) => {
    const shown = ch !== highlight ? ch : hidden === "kana" ? `<mark>？</mark>` : `<mark>${ch}</mark>`;
    const cls = (isHigh(i, w.accent) ? " hi" : "") + (i === w.accent - 1 ? " drop" : "");
    return `<span class="m${cls}">${shown}</span>`;
  }).join("") + `<span class="acc" title="${accentTitle(w)}">${CIRCLED[w.accent]}</span>`;
  const romaji = hidden ? "answer to reveal" : `${w.romaji} 🔊`;
  return `<div class="word ${hidden ? "locked" : ""}" ${hidden ? "" : `data-say="${w.kana}" title="Click to hear"`}>
    ${starHtml(w.kana)}
    <span class="wk">${kana}</span>${w.kanji && hidden !== "kana" ? `<span class="wj">${w.kanji}</span>` : ""}
    <span class="wr">${romaji}</span>
    <span class="wt">${w.en} <span>· ${w.zh}</span></span>
  </div>`;
}

function examplesHtml(kana, words, hidden) {
  if (!words.length) return `<p class="muted">No example words for this character with your current practice set yet.</p>`;
  const title = hidden ? "Words with this character" : `Words with ${kana} — click to hear, ☆ to save`;
  return `<h3>${title}</h3><div class="word-list">${words.map(w => wordHtml(w, { highlight: kana, hidden })).join("")}</div>`;
}

const refreshStars = () =>
  document.querySelectorAll("[data-save]").forEach(b => b.outerHTML = starHtml(b.dataset.save));

function toggleSaved(kana) {
  toggleWord(state, kana, Date.now());
  persist();
  refreshStars();
  if ($("dictionary").classList.contains("active")) renderDictionary();
}

// ☆ buttons save words; any other element with data-say speaks its text when clicked.
document.addEventListener("click", e => {
  const star = e.target.closest("[data-save]");
  if (star) { toggleSaved(star.dataset.save); return; }
  const el = e.target.closest("[data-say]");
  if (el) speak(el.dataset.say);
});

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.8;
  const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith("ja"));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// Leitner-style weighting: characters in lower boxes (weaker) come up far more often.
let lastKana = null;
function pickCard() {
  const p = pool();
  const candidates = p.length > 1 ? p.filter(c => c.kana !== lastKana) : p;
  const weights = candidates.map(c => 2 ** (MAX_BOX - statOf(state, c.kana).box));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// ---------- Practice ----------
const session = { correct: 0, total: 0, streak: 0 };
let current = null, answered = false, currentMode = null, currentWords = [];

function renderRowToggles() {
  $("rowToggles").innerHTML = ROWS.map(r => {
    const on = state.settings.rows.includes(r.id);
    const sample = r.chars.find(Boolean)[0];
    return `<label class="${on ? "on" : ""}"><input type="checkbox" value="${r.id}" ${on ? "checked" : ""}>${sample} ${r.label}</label>`;
  }).join("");
  $("rowToggles").querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
    const sel = [...$("rowToggles").querySelectorAll("input:checked")].map(i => i.value);
    if (sel.length === 0) { inp.checked = true; return; }  // keep at least one row
    setSettings(state, { rows: sel }, Date.now());
    persist();
    renderRowToggles();
    renderChart();
    nextCard();
  }));
}

function nextCard() {
  current = pickCard();
  lastKana = current.kana;
  answered = false;
  const mode = state.settings.mode;
  currentMode = mode === "mixed" ? (Math.random() < 0.5 ? "type" : "pick") : mode;
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("nextBtn").style.display = "none";

  const prompt = $("prompt");
  if (currentMode === "type") {
    $("hint").textContent = "How do you read this?";
    prompt.textContent = current.kana;
    prompt.className = "prompt";
    $("answerArea").innerHTML = `<input class="answer-input" id="answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="romaji">`;
    const input = $("answer");
    input.focus();
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !answered && input.value.trim()) {
        // preventDefault stops this Enter from also "clicking" the Next button once it has focus
        e.preventDefault(); e.stopPropagation(); checkTyped(input.value);
      }
    });
  } else {
    $("hint").textContent = "Which kana is this?";
    prompt.textContent = current.romaji;
    prompt.className = "prompt romaji";
    const others = shuffle(pool().filter(c => c.kana !== current.kana)).slice(0, 3);
    const options = shuffle([current, ...others]);
    $("answerArea").innerHTML = `<div class="choices">${options.map((o, i) =>
      `<button data-kana="${o.kana}"><small>${i + 1}</small>${o.kana}</button>`).join("")}</div>`;
    $("answerArea").querySelectorAll("button").forEach(b =>
      b.addEventListener("click", () => checkPicked(b.dataset.kana)));
  }
  // Show example words right away, hiding the part that would give away the answer.
  currentWords = wordsWith(current.kana, 3);
  $("examples").innerHTML = examplesHtml(current.kana, currentWords, currentMode === "type" ? "romaji" : "kana");
}

function checkTyped(value) {
  const ok = current.accepted.includes(value.trim().toLowerCase());
  $("answer").disabled = true;
  grade(ok);
}

function checkPicked(kana) {
  if (answered) return;
  const ok = kana === current.kana;
  $("answerArea").querySelectorAll("button").forEach(b => {
    b.disabled = true;
    if (b.dataset.kana === current.kana) b.classList.add("correct");
    else if (b.dataset.kana === kana) b.classList.add("wrong");
  });
  if (!ok) {
    const picked = ALL.find(c => c.kana === kana);
    $("hint").textContent = `${picked.kana} is "${picked.romaji}"`;
  }
  grade(ok);
}

function grade(ok) {
  answered = true;
  const now = Date.now();
  recordAnswer(state, current.kana, ok, now);
  session.total++;
  if (ok) {
    session.correct++;
    session.streak++;
    updateBest(state, session.streak, now);
  } else {
    session.streak = 0;
  }
  persist();

  const fb = $("feedback");
  fb.className = "feedback " + (ok ? "good" : "bad");
  fb.textContent = ok
    ? `Correct! ${current.kana} = ${current.romaji}`
    : `Not quite — ${current.kana} is "${current.romaji}"`;
  if (state.settings.autoSpeak) speak(current.kana);

  $("sCorrect").textContent = session.correct;
  $("sTotal").textContent = session.total;
  $("sStreak").textContent = session.streak;
  $("sBest").textContent = state.bestStreak.value;

  // Stay on the card so the example words can be read; Enter / Next moves on.
  $("examples").innerHTML = examplesHtml(current.kana, currentWords);
  $("nextBtn").style.display = "";
  document.activeElement?.blur();
}

document.addEventListener("keydown", e => {
  if (!$("practice").classList.contains("active")) return;
  if (answered && e.key === "Enter") { e.preventDefault(); nextCard(); return; }
  if (!answered && currentMode === "pick" && /^[1-4]$/.test(e.key)) {
    const btn = $("answerArea").querySelectorAll("button")[+e.key - 1];
    if (btn) btn.click();
  }
});

$("nextBtn").addEventListener("click", nextCard);
$("speakBtn").addEventListener("click", () => current && speak(current.kana));
$("mode").addEventListener("change", e => { setSettings(state, { mode: e.target.value }, Date.now()); persist(); nextCard(); });
$("autoSpeak").addEventListener("change", e => { setSettings(state, { autoSpeak: e.target.checked }, Date.now()); persist(); });

// ---------- Chart & Progress ----------
function gridHtml(cellFn) {
  const vowels = ["a", "i", "u", "e", "o"];
  return `<table class="chart"><tr><th></th>${vowels.map(v => `<th>${v}</th>`).join("")}</tr>` +
    ROWS.map(r => `<tr><th>${r.label}</th>${r.chars.map(c => c ? cellFn(ALL.find(x => x.kana === c[0])) : `<td class="cell empty"></td>`).join("")}</tr>`).join("") +
    `</table>`;
}

function renderChart() {
  $("chartTable").innerHTML = gridHtml(c =>
    `<td class="cell ${state.settings.rows.includes(c.row) ? "" : "off"}" data-kana="${c.kana}"><span class="k">${c.kana}</span><span class="r">${c.accepted.join(" / ")}</span></td>`);
  $("chartTable").querySelectorAll("td[data-kana]").forEach(td =>
    td.addEventListener("click", () => {
      speak(td.dataset.kana);
      $("chartWords").innerHTML = examplesHtml(td.dataset.kana, wordsWith(td.dataset.kana, 6));
    }));
  $("chartWords").innerHTML = "";
}

function renderWords() {
  const words = usableWords().sort((a, b) => a.kana.localeCompare(b.kana, "ja"));
  $("wordsInfo").textContent = `${words.length} words you can read with your practice set. Click a word to hear it, ☆ to save it — enable more rows to unlock more. The circled number is the pitch accent: the line over the kana shows high pitch, and the tick marks where it drops (⓪ = never drops).`;
  $("wordsList").innerHTML = words.map(w => wordHtml(w)).join("");
}

function renderDictionary() {
  const entries = savedWords(state);
  $("dictInfo").textContent = entries.length
    ? `${entries.length} saved word${entries.length > 1 ? "s" : ""}, newest first. Click to hear, ★ to remove.`
    : "Your dictionary is empty. Click ☆ on any word to save it here.";
  $("dictList").innerHTML = entries.map(({ kana, t }) => {
    const w = WORDS.find(x => x.kana === kana);
    return w ? wordHtml(w).replace("</div>", `<span class="wd">saved ${new Date(t).toLocaleDateString()}</span></div>`) : "";
  }).join("");
}

function renderProgress() {
  $("progressTable").innerHTML = gridHtml(c => {
    const s = state.stats[c.kana];
    const level = !s || s.seen === 0 ? 0 : 1 + Math.min(4, s.box);
    const acc = s && s.seen ? `${Math.round(100 * s.correct / s.seen)}% · ${s.seen}×` : "—";
    return `<td class="cell m${level} ${state.settings.rows.includes(c.row) ? "" : "off"}"><span class="k">${c.kana}</span><span class="r">${acc}</span></td>`;
  });
  const st = kana => statOf(state, kana);
  const weak = pool()
    .filter(c => st(c.kana).seen)
    .sort((a, b) => st(a.kana).box - st(b.kana).box ||
                    st(a.kana).correct / st(a.kana).seen - st(b.kana).correct / st(b.kana).seen)
    .slice(0, 5);
  $("weakList").innerHTML = weak.length
    ? `<p class="muted">Needs the most practice:</p>${weak.map(c => `<span title="${c.romaji}">${c.kana}</span>`).join("")}`
    : `<p class="muted">Practice a bit and your weakest characters will show up here.</p>`;
}

$("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset all progress on all your devices? Saved words are kept. This cannot be undone.")) return;
  resetProgress(state, Date.now());
  persist();
  $("sBest").textContent = 0;
  renderProgress();
});

// ---------- Sync ----------
const loadConfig = () => JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
let syncer = null;

const STATUS_TEXT = {
  off: () => "Sync not set up",
  syncing: () => "Syncing…",
  ok: s => `Synced ${s.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  offline: () => "Offline — will sync later",
  error: s => `Sync error: ${s.message}`,
};

function showStatus(status) {
  const text = STATUS_TEXT[status.kind](status);
  $("syncBadge").dataset.kind = status.kind;
  $("syncBadge").title = text;
  $("syncStatus").textContent = text;
}

// Merge what the gist had into whatever is local *now* (the user may have changed
// something while the request was in flight), then refresh the screen.
function applyRemote(remote) {
  const rowsBefore = JSON.stringify(state.settings.rows);
  state = merge(state, remote);
  saveState(localStorage, state);

  $("mode").value = state.settings.mode;
  $("autoSpeak").checked = state.settings.autoSpeak;
  $("sBest").textContent = state.bestStreak.value;
  refreshStars();
  if (rowsBefore !== JSON.stringify(state.settings.rows)) {
    renderRowToggles();
    renderChart();
    if (!answered) nextCard();
  }
  const view = document.querySelector(".view.active").id;
  if (view === "words") renderWords();
  if (view === "dictionary") renderDictionary();
  if (view === "progress") renderProgress();
}

function startSync(config) {
  syncer?.stop();
  syncer = new Syncer({
    client: new GistClient(config.token),
    gistId: config.gistId,
    getState: () => state,
    applyState: applyRemote,
    onStatus: showStatus,
    isOnline: () => navigator.onLine,
  });
  return syncer.run();
}

function renderSyncPanel() {
  const config = loadConfig();
  $("syncSetup").hidden = !!config;
  $("syncConnected").hidden = !config;
  if (config) $("syncLogin").textContent = config.login;
}

$("connectBtn").addEventListener("click", async () => {
  const token = $("tokenInput").value.trim();
  if (!token) return;
  $("connectBtn").disabled = true;
  showStatus({ kind: "syncing" });
  try {
    const { login, gistId } = await connect(new GistClient(token), state);
    const config = { token, gistId, login };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    $("tokenInput").value = "";
    renderSyncPanel();
    await startSync(config);
  } catch (e) {
    showStatus({ kind: "error", message: e.message });
  } finally {
    $("connectBtn").disabled = false;
  }
});

// A fresh Syncer, so "Sync now" also retries after an error.
$("syncNowBtn").addEventListener("click", () => { const c = loadConfig(); if (c) startSync(c); });

$("disconnectBtn").addEventListener("click", () => {
  if (!confirm("Stop syncing on this device? Your progress stays here and in the gist.")) return;
  syncer?.stop();
  syncer = null;
  localStorage.removeItem(CONFIG_KEY);
  showStatus({ kind: "off" });
  renderSyncPanel();
});

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncer?.run(); });
window.addEventListener("online", () => syncer?.run());

// ---------- Navigation ----------
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === b.dataset.view));
  if (b.dataset.view === "progress") renderProgress();
  if (b.dataset.view === "words") renderWords();
  if (b.dataset.view === "dictionary") renderDictionary();
  if (b.dataset.view === "sync") renderSyncPanel();
  if (b.dataset.view === "practice" && currentMode === "type" && !answered) $("answer")?.focus();
}));

// ---------- Init ----------
$("mode").value = state.settings.mode;
$("autoSpeak").checked = state.settings.autoSpeak;
$("sBest").textContent = state.bestStreak.value;
renderRowToggles();
renderChart();
nextCard();
renderSyncPanel();
const config = loadConfig();
if (config) startSync(config); else showStatus({ kind: "off" });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(e => console.warn("Offline support unavailable:", e));
}
```

- [ ] **Step 3: Rewrite `index.html` as markup only**

Replace the whole file with the following. The `<main>` sections are unchanged except for the new `#sync` section; the header gains nav icons and the sync badge.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#faf7f2">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ひらがな">
<title>Hiragana Practice</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="stylesheet" href="css/style.css">
<script type="module" src="js/app.js"></script>
</head>
<body>
<header>
  <h1>ひらがな <span>Practice</span></h1>
  <nav>
    <button data-view="practice" class="active"><span class="ico">✏️</span><span class="lbl">Practice</span></button>
    <button data-view="chart"><span class="ico">あ</span><span class="lbl">Chart</span></button>
    <button data-view="words"><span class="ico">📖</span><span class="lbl">Words</span></button>
    <button data-view="dictionary"><span class="ico">⭐</span><span class="lbl">Dictionary</span></button>
    <button data-view="progress"><span class="ico">📈</span><span class="lbl">Progress</span></button>
  </nav>
  <button id="syncBadge" data-view="sync" data-kind="off" title="Sync" aria-label="Sync settings">⚙️<i></i></button>
</header>

<main>
  <!-- Practice -->
  <section id="practice" class="view active">
    <div class="rows" id="rowToggles"></div>
    <div class="controls">
      Mode:
      <select id="mode">
        <option value="type">See kana → type romaji</option>
        <option value="pick">See romaji → pick kana</option>
        <option value="mixed">Mixed</option>
      </select>
      <label><input type="checkbox" id="autoSpeak"> Speak answer</label>
    </div>

    <div class="card">
      <div class="hint" id="hint"></div>
      <div class="prompt" id="prompt"></div>
      <div id="answerArea"></div>
      <div class="feedback" id="feedback"></div>
      <div class="actions">
        <button class="btn" id="speakBtn" title="Hear pronunciation">🔊 Listen</button>
        <button class="btn primary" id="nextBtn" style="display:none">Next ↵</button>
      </div>
      <div class="examples" id="examples"></div>
    </div>

    <div class="session">
      <div>Session: <b id="sCorrect">0</b> / <b id="sTotal">0</b></div>
      <div>Streak: <b id="sStreak">0</b></div>
      <div>Best streak: <b id="sBest">0</b></div>
    </div>
  </section>

  <!-- Chart -->
  <section id="chart" class="view">
    <p class="muted">Click any character to hear it and see example words. Faded rows are not in your practice set.</p>
    <div id="chartTable"></div>
    <div class="examples" id="chartWords"></div>
  </section>

  <!-- Words -->
  <section id="words" class="view">
    <p class="muted" id="wordsInfo"></p>
    <div class="word-list" id="wordsList"></div>
  </section>

  <!-- Dictionary -->
  <section id="dictionary" class="view">
    <p class="muted" id="dictInfo"></p>
    <div class="word-list" id="dictList"></div>
  </section>

  <!-- Progress -->
  <section id="progress" class="view">
    <div class="legend">
      <span><i class="m0" style="border:1px solid #ddd"></i>New</span>
      <span><i class="m1"></i>Struggling</span>
      <span><i class="m2"></i>Learning</span>
      <span><i class="m3"></i>Familiar</span>
      <span><i class="m4"></i>Good</span>
      <span><i class="m5"></i>Mastered</span>
    </div>
    <div id="progressTable"></div>
    <div class="weak" id="weakList"></div>
    <div class="actions" style="margin-top:24px">
      <button class="btn" id="resetBtn">Reset progress</button>
    </div>
  </section>

  <!-- Sync -->
  <section id="sync" class="view">
    <h2>Sync between devices</h2>
    <p class="sync-status" id="syncStatus">Sync not set up</p>
    <div id="syncSetup">
      <ol class="steps">
        <li><a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=Hiragana%20Practice%20sync" target="_blank" rel="noopener">Create a GitHub token</a> with only the <b>gist</b> scope.</li>
        <li>Paste it below and tap <b>Connect</b>. Do the same on your other device with the same token.</li>
      </ol>
      <input id="tokenInput" class="token-input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_…">
      <button class="btn primary" id="connectBtn">Connect</button>
    </div>
    <div id="syncConnected" hidden>
      <p>Connected as <b id="syncLogin"></b>. Progress and saved words sync automatically.</p>
      <div class="actions">
        <button class="btn primary" id="syncNowBtn">Sync now</button>
        <button class="btn" id="disconnectBtn">Disconnect</button>
      </div>
    </div>
    <p class="muted">Your token is stored only on this device. Progress is saved in a secret gist named <code>hiragana-progress.json</code>.</p>
  </section>
</main>
</body>
</html>
```

- [ ] **Step 4: Add desktop styles for the new elements** — append to `css/style.css`

```css
nav .ico { display: none; }
#syncBadge {
  border: none; background: none; font-size: 20px; cursor: pointer;
  position: relative; padding: 6px; line-height: 1;
}
#syncBadge i {
  position: absolute; right: 1px; top: 3px; width: 10px; height: 10px; border-radius: 50%;
  background: #bbb; border: 2px solid var(--card);
}
#syncBadge[data-kind="ok"] i { background: var(--good); }
#syncBadge[data-kind="syncing"] i { background: #e0a100; }
#syncBadge[data-kind="error"] i { background: var(--bad); }
#sync h2 { font-size: 20px; margin: 0 0 8px; }
.sync-status { font-weight: 600; }
.steps { padding-left: 20px; line-height: 1.7; }
.token-input {
  font-size: 16px; padding: 10px; width: 100%; max-width: 360px;
  border: 2px solid var(--line); border-radius: 10px; margin: 8px 8px 8px 0;
}
```

- [ ] **Step 5: Verify syntax and unit tests**

Run: `node --check js/app.js && npm test`
Expected: no syntax error; PASS — 30 tests

- [ ] **Step 6: Browser smoke test (Playwright MCP)**

Generate a script that serves the project files from a fake origin, then run it with `mcp__playwright__browser_run_code_unsafe` (`filename` must be inside the project, so it goes in the git-ignored `.playwright-mcp/`):

```bash
mkdir -p .playwright-mcp
node -e '
const fs = require("fs"), path = require("path");
const files = {};
for (const f of ["index.html","css/style.css","js/data.js","js/store.js","js/merge.js","js/sync.js","js/app.js"]
  .concat(["sw.js","manifest.webmanifest"].filter(f => fs.existsSync(f))))
  files["/" + f] = fs.readFileSync(f, "utf8");
const types = { html: "text/html", css: "text/css", js: "text/javascript", webmanifest: "application/manifest+json" };
fs.writeFileSync(".playwright-mcp/smoke.js", `async (page) => {
  const FILES = ${JSON.stringify(files)};
  const TYPES = ${JSON.stringify(types)};
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("https://hira.test/**", r => {
    let p = new URL(r.request().url()).pathname; if (p === "/") p = "/index.html";
    if (!(p in FILES)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: TYPES[p.split(".").pop()] + "; charset=utf-8", body: FILES[p] });
  });
  await page.goto("https://hira.test/");
  // simulate a v1 user: their data must survive the upgrade
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("hiragana-practice-v1", JSON.stringify({ rows: ["a","ka","sa","ta"], mode: "type", bestStreak: 4, stats: {}, dictionary: { "かさ": 1700000000000 } })); });
  await page.reload();
  const out = {};
  await page.fill("#answer", "zzz"); await page.press("#answer", "Enter");
  out.feedback = await page.locator("#feedback").innerText();
  out.examplesRevealed = !(await page.locator("#examples").innerText()).includes("answer to reveal");
  out.best = await page.locator("#sBest").innerText();
  await page.click("nav button[data-view=dictionary]");
  out.dict = await page.locator("#dictInfo").innerText();
  await page.click("#syncBadge");
  out.sync = await page.locator("#syncStatus").innerText();
  out.v2 = await page.evaluate(() => JSON.parse(localStorage.getItem("hiragana-practice-v2")).dictionary);
  out.errors = errors;
  return out;
}`);
'
```

Run via MCP: `browser_run_code_unsafe` with `filename: /Users/yupeng/personal/japanese/.playwright-mcp/smoke.js`

Expected: `feedback` starts with `Not quite`, `examplesRevealed: true`, `best: "4"`, `dict` starts with `1 saved word`, `sync: "Sync not set up"`, `v2` contains `かさ` with `t: 1700000000000`, `errors: []` (a service-worker 404 warning is acceptable until Task 7).

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/app.js
git commit -m "Split app into modules, use timestamped store, add sync panel"
```

---

### Task 6: Mobile layout

**Files:**
- Modify: `css/style.css` (append)

- [ ] **Step 1: Append the mobile media query to `css/style.css`**

```css
/* ---------- iPhone / narrow screens ---------- */
@media (max-width: 640px) {
  header { padding: 10px 14px; padding-top: max(10px, env(safe-area-inset-top)); }
  header h1 { font-size: 18px; }
  nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: flex;
    background: var(--card); border-top: 1px solid var(--line);
    padding-bottom: env(safe-area-inset-bottom);
  }
  nav button {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    min-height: 54px; padding: 8px 0 6px; font-size: 11px; border-radius: 0;
  }
  nav button.active { background: none; color: var(--accent); }
  nav .ico { display: block; font-size: 20px; line-height: 1; }
  main { padding: 14px 12px calc(86px + env(safe-area-inset-bottom)); }

  select, input { font-size: 16px; }  /* below 16px, iOS zooms in on focus */
  .rows label { padding: 8px 12px; }
  .card { padding: 20px 14px; border-radius: 16px; }
  .prompt { font-size: 96px; min-height: 112px; }
  .prompt.romaji { font-size: 56px; padding-top: 22px; }
  .answer-input { font-size: 24px; width: 100%; max-width: 260px; }
  .choices button { font-size: 40px; padding: 10px; min-height: 72px; }
  .btn { min-height: 44px; }
  .session { gap: 14px; font-size: 13px; }

  table.chart { border-spacing: 4px; }
  table.chart th { font-size: 11px; }
  .cell { width: 58px; height: 64px; border-radius: 10px; }
  .cell .k { font-size: 26px; }
  .cell .r { font-size: 10px; }

  .word-list { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .word .wk { font-size: 22px; }
  .star { font-size: 22px; padding: 4px; }
}
```

- [ ] **Step 2: Check the layout at iPhone size (Playwright MCP)**

1. Re-run the Task 5 Step 6 generator command so `.playwright-mcp/smoke.js` includes the new CSS.
2. `browser_resize` to width 390, height 844.
3. `browser_run_code_unsafe` with `filename: /Users/yupeng/personal/japanese/.playwright-mcp/smoke.js` (loads the app at iPhone size).
4. `browser_run_code_unsafe` with this code:

```js
async (page) => {
  const shots = {};
  for (const view of ["practice", "chart", "words", "dictionary", "sync"]) {
    await page.click(`[data-view=${view}]`);
    await page.screenshot({ path: `/Users/yupeng/personal/japanese/.playwright-mcp/m-${view}.png`, fullPage: true });
  }
  return {
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    nav: await page.evaluate(() => getComputedStyle(document.querySelector("nav")).position),
  };
}
```

5. Look at each `m-*.png` with the Read tool.
6. `browser_resize` to 1280×800, take one screenshot of Practice, and check that the top nav looks as before.

Expected: `overflow: false`, `nav: "fixed"`; screenshots show the bottom tab bar, a chart that fits the width, and two word columns.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "Add iPhone layout with bottom tab bar"
```

---

### Task 7: PWA — manifest, icons, service worker

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon-512.png`, `icons/icon-192.png`, `icons/icon-180.png`

- [ ] **Step 1: Create `manifest.webmanifest`**

```json
{
  "name": "Hiragana Practice",
  "short_name": "ひらがな",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#faf7f2",
  "theme_color": "#faf7f2",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Render the icons**

Render a 512×512 icon with Playwright MCP (`browser_run_code_unsafe`, inline `code`):

```js
async (page) => {
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<body style="margin:0"><div id="i" style="width:512px;height:512px;background:#c8433a;color:#fff;display:flex;align-items:center;justify-content:center;font:600 340px 'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif">あ</div></body>`);
  await page.locator("#i").screenshot({ path: "/Users/yupeng/personal/japanese/icons/icon-512.png", scale: "css" });
  return "ok";
}
```

Then resize with `sips`:

```bash
mkdir -p icons   # before the MCP call above
sips -z 192 192 icons/icon-512.png --out icons/icon-192.png
sips -z 180 180 icons/icon-512.png --out icons/icon-180.png
sips -g pixelWidth -g pixelHeight icons/*.png
```

Expected: 180×180, 192×192, 512×512. Look at `icons/icon-512.png` with the Read tool: a red square with a white あ.

- [ ] **Step 3: Create `sw.js`**

```js
// Offline support: serve the app's own files from cache, refreshing them in the
// background so an update shows up on the next launch. GitHub API calls are untouched.
const CACHE = "hiragana-v1";
const FILES = [
  "./", "index.html", "css/style.css", "manifest.webmanifest",
  "js/app.js", "js/data.js", "js/store.js", "js/merge.js", "js/sync.js",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    return fresh;
  }));
});
```

- [ ] **Step 4: Verify the service worker registers and serves offline (Playwright MCP)**

Generate a script that also serves `sw.js`, the manifest, and the icons (as binary) — `cache.addAll` fails if any listed file is missing:

```bash
node -e '
const fs = require("fs");
const text = ["index.html","css/style.css","js/data.js","js/store.js","js/merge.js","js/sync.js","js/app.js","sw.js","manifest.webmanifest"];
const files = Object.fromEntries(text.map(f => ["/" + f, fs.readFileSync(f, "utf8")]));
const bin = Object.fromEntries(["icons/icon-180.png","icons/icon-192.png","icons/icon-512.png"].map(f => ["/" + f, fs.readFileSync(f).toString("base64")]));
fs.writeFileSync(".playwright-mcp/pwa.js", `async (page) => {
  const FILES = ${JSON.stringify(files)}, BIN = ${JSON.stringify(bin)};
  const TYPES = { html: "text/html", css: "text/css", js: "text/javascript", webmanifest: "application/manifest+json", png: "image/png" };
  await page.context().route("https://hira.test/**", r => {
    let p = new URL(r.request().url()).pathname; if (p === "/") p = "/index.html";
    const type = TYPES[p.split(".").pop()];
    if (p in FILES) return r.fulfill({ contentType: type, body: FILES[p] });
    if (p in BIN) return r.fulfill({ contentType: type, body: Buffer.from(BIN[p], "base64") });
    r.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://hira.test/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => (await (await caches.open("hiragana-v1")).keys()).length);
  return { swActive: await page.evaluate(() => !!navigator.serviceWorker.controller || "registered"), cached };
}`);
'
```

Run via MCP with `filename: /Users/yupeng/personal/japanese/.playwright-mcp/pwa.js`.
Expected: `cached: 12`. (If the Playwright browser refuses service workers on routed origins, record that and rely on the real check against GitHub Pages in Task 8, Step 4.)

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest sw.js icons/
git commit -m "Make the app installable and usable offline"
```

---

### Task 8: Publish to GitHub Pages

All `gh` commands target **github.com** (`GH_HOST=github.com`), account `yupeng9`; never the Apple-internal hosts.

- [ ] **Step 1: Final checks**

Run: `npm test && git status --short`
Expected: PASS — 30 tests; working tree clean.

- [ ] **Step 2: Create the public repo and push**

```bash
GH_HOST=github.com gh repo create yupeng9/hiragana --public \
  --description "Hiragana practice app (PWA) with Gist-synced progress" \
  --source . --remote origin --push
```

Expected: `✓ Created repository yupeng9/hiragana on github.com` and the push of `main`.

- [ ] **Step 3: Enable Pages from `main` root**

```bash
GH_HOST=github.com gh api -X POST repos/yupeng9/hiragana/pages \
  -f "source[branch]=main" -f "source[path]=/"
GH_HOST=github.com gh api repos/yupeng9/hiragana/pages --jq '.html_url, .status'
```

Expected: `https://yupeng9.github.io/hiragana/` and status `building` or `built`. Poll the second command until `built` (normally under 2 minutes).

- [ ] **Step 4: Verify the live site (Playwright MCP)**

`browser_navigate` to `https://yupeng9.github.io/hiragana/`, then `browser_console_messages` (level `error`) and evaluate:

```js
async (page) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  return {
    title: await page.title(),
    cached: await page.evaluate(async () => (await (await caches.open("hiragana-v1")).keys()).length),
    prompt: await page.locator("#prompt").innerText(),
  };
}
```

Expected: title `Hiragana Practice`, `cached: 12`, a non-empty prompt, no console errors.

- [ ] **Step 5: Hand-off instructions for the user** (in the final message, not a file)

1. Mac: open https://yupeng9.github.io/hiragana/ → ⚙️ → create a token via the link (only the `gist` scope) → paste → Connect. Existing progress on the old local file does **not** carry over automatically, because the hosted site is a different browser origin: before connecting, the user can keep using the local file, or start fresh on the hosted site.
2. iPhone: open the link in Safari → Share → Add to Home Screen → open it → ⚙️ → paste the same token → Connect.
3. Save a word on one device, open the app on the other: it appears within a few seconds.

---

## Self-review notes

- **Spec coverage:** files (T2–T7), state and merge rules including ties and resets (T2), migration (T3), sync setup/cycle/triggers/single-flight/status/401 (T4, T5), offline and updates (T7), mobile layout (T6), testing (unit tests in T2–T4; browser checks in T5–T8), publishing (T8).
- **Known limitation, carried into the hand-off:** v1 progress lives in the `file://` origin's `localStorage`, which the hosted `https://yupeng9.github.io` origin cannot read. Migration covers anyone who had used a hosted v1 (nobody yet). If the user wants their current local progress, the fix is a one-time export/import; it isn't planned unless they ask.
