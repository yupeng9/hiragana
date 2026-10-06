import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORE_KEY, LEGACY_KEY, emptyState, loadState, saveState, statOf, isSaved, savedWords,
  toggleWord, recordAnswer, updateBest, setSettings, resetProgress,
} from "../js/store.js";
import { DEFAULT_ROWS, MAX_BOX } from "../js/data.js";
import { merge, canonical } from "../js/merge.js";

const memoryStorage = (data = {}) => ({
  data,
  getItem(k) { return k in this.data ? this.data[k] : null; },
  setItem(k, v) { this.data[k] = String(v); },
});

const quietly = fn => {
  const orig = console.error;
  console.error = () => {};
  try { return fn(); } finally { console.error = orig; }
};

test("a new device starts empty with every timestamp at 0", () => {
  const s = loadState(memoryStorage());
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
  const s = loadState(memoryStorage({ [LEGACY_KEY]: JSON.stringify(v1) }));
  assert.deepEqual(s.settings, { rows: ["a", "ka"], mode: "pick", autoSpeak: true, t: 1 });
  assert.deepEqual(s.stats.か, { box: 2, seen: 3, correct: 2, t: 1 });
  assert.deepEqual(s.dictionary.かさ, { t: 1700000000000, deleted: false });
  assert.deepEqual(s.bestStreak, { value: 7, t: 1 });
});

test("prefers saved v2 data over v1", () => {
  const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify({ bestStreak: 7 }) });
  const s = loadState(storage);
  s.bestStreak = { value: 3, t: 9 };
  saveState(storage, s);
  assert.equal(JSON.parse(storage.getItem(STORE_KEY)).bestStreak.value, 3);
  assert.equal(loadState(storage).bestStreak.value, 3);
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
  s.bestStreakLater = [{ value: 2, t: 12 }];
  s.statsLater = { か: [{ box: 0, seen: 1, correct: 0, t: 12 }] };
  toggleWord(s, "かさ", 10);
  resetProgress(s, 50);
  assert.deepEqual(s.stats, {});
  assert.deepEqual(s.bestStreak, { value: 0, t: 50 });
  assert.equal(s.bestStreakLater, undefined);
  assert.equal(s.statsLater, undefined);
  assert.equal(s.resetAt, 50);
  assert.equal(isSaved(s, "かさ"), true);
});

test("migration skips v1 stats that were never answered and coerces fields", () => {
  const v1 = { stats: {
    か: { box: 2, seen: 3, correct: 2 },
    さ: { box: 0, seen: 0, correct: 0 },
    た: { box: "x", seen: 2, correct: undefined },
  } };
  const s = loadState(memoryStorage({ [LEGACY_KEY]: JSON.stringify(v1) }));
  assert.deepEqual(Object.keys(s.stats).sort(), ["か", "た"]);
  assert.deepEqual(s.stats.た, { box: 0, seen: 2, correct: 0, t: 1 });
});

test("corrupt v2 JSON gives an empty state and keeps a backup", () => {
  const storage = memoryStorage({ [STORE_KEY]: "{oops", [LEGACY_KEY]: JSON.stringify({ bestStreak: 7 }) });
  const s = quietly(() => loadState(storage));
  assert.equal(canonical(s), canonical(emptyState()));
  assert.equal(storage.getItem("hiragana-practice-v2-corrupt"), "{oops");
});

test('"null" in v2 gives an empty state and keeps a backup', () => {
  const storage = memoryStorage({ [STORE_KEY]: "null" });
  const s = quietly(() => loadState(storage));
  assert.equal(canonical(s), canonical(emptyState()));
  assert.equal(storage.getItem("hiragana-practice-v2-corrupt"), "null");
});

test("a v2 state of the wrong shape counts as corrupt", () => {
  const storage = memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 2, stats: [], dictionary: {}, settings: {}, bestStreak: {} }) });
  const s = quietly(() => loadState(storage));
  assert.equal(canonical(s), canonical(emptyState()));
  assert.ok(storage.getItem("hiragana-practice-v2-corrupt"));
});

test("corrupt v1 JSON gives an empty state and keeps a backup", () => {
  const storage = memoryStorage({ [LEGACY_KEY]: "not json" });
  const s = quietly(() => loadState(storage));
  assert.equal(canonical(s), canonical(emptyState()));
  assert.equal(storage.getItem("hiragana-practice-v1-corrupt"), "not json");
});

test('"null" in v1 gives an empty state and keeps a backup', () => {
  const storage = memoryStorage({ [LEGACY_KEY]: "null" });
  const s = quietly(() => loadState(storage));
  assert.equal(canonical(s), canonical(emptyState()));
  assert.equal(storage.getItem("hiragana-practice-v1-corrupt"), "null");
});

test("a valid v2 state with a missing top-level field is filled in", () => {
  const partial = { version: 2, stats: {}, dictionary: {}, settings: { rows: ["a"], mode: "type", autoSpeak: false, t: 4 }, bestStreak: { value: 1, t: 4 } };
  const s = loadState(memoryStorage({ [STORE_KEY]: JSON.stringify(partial) }));
  assert.equal(s.resetAt, 0);
  assert.deepEqual(s.bestStreak, { value: 1, t: 4 });
});

test("a fresh device merged with a remote state equals the remote state", () => {
  const remote = loadState(memoryStorage());
  recordAnswer(remote, "か", true, 100);
  toggleWord(remote, "かさ", 100);
  updateBest(remote, 4, 100);
  setSettings(remote, { mode: "pick" }, 100);
  const fresh = loadState(memoryStorage());
  assert.equal(canonical(merge(fresh, remote)), canonical(remote));
  assert.equal(canonical(merge(remote, fresh)), canonical(remote));
});

test("a migrated v1 state does not override real v2 progress", () => {
  const migrated = loadState(memoryStorage({ [LEGACY_KEY]: JSON.stringify({ mode: "pick", bestStreak: 2 }) }));
  const remote = loadState(memoryStorage());
  setSettings(remote, { mode: "type" }, 100);
  assert.equal(merge(migrated, remote).settings.mode, "type");
});

test("a reset merged with an older remote state leaves no stats and best 0", () => {
  const local = loadState(memoryStorage());
  resetProgress(local, 50);
  const remote = loadState(memoryStorage());
  recordAnswer(remote, "か", true, 40);
  remote.bestStreak = { value: 9, t: 40 };
  for (const m of [merge(local, remote), merge(remote, local)]) {
    assert.deepEqual(m.stats, {});
    assert.equal(m.bestStreak.value, 0);
  }
});

test("a v2 state with empty settings gets the default settings", () => {
  const v2 = { version: 2, stats: {}, dictionary: {}, settings: {}, bestStreak: { value: 0, t: 0 } };
  const s = loadState(memoryStorage({ [STORE_KEY]: JSON.stringify(v2) }));
  assert.deepEqual(s.settings, { rows: DEFAULT_ROWS, mode: "type", autoSpeak: false, t: 0 });
});

test("a v2 state whose rows are not an array gets the default rows", () => {
  const v2 = { version: 2, stats: {}, dictionary: {}, settings: { rows: "a", mode: "pick", t: 3 }, bestStreak: { value: 0, t: 0 } };
  const s = loadState(memoryStorage({ [STORE_KEY]: JSON.stringify(v2) }));
  assert.deepEqual(s.settings, { rows: DEFAULT_ROWS, mode: "pick", autoSpeak: false, t: 3 });
});

test("v1 rows that are not an array fall back to the default rows", () => {
  const s = loadState(memoryStorage({ [LEGACY_KEY]: JSON.stringify({ rows: "a" }) }));
  assert.deepEqual(s.settings.rows, DEFAULT_ROWS);
});

test("a storage that cannot save the backup still gives an empty state", () => {
  const storage = memoryStorage({ [STORE_KEY]: "{oops" });
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  const s = quietly(() => loadState(storage));
  assert.equal(canonical(s), canonical(emptyState()));
});
