import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORE_KEY, LEGACY_KEY, emptyState, loadState, saveState, statOf, isSaved, savedWords,
  toggleWord, recordAnswer, updateBest, setSettings, resetProgress, activeRows, activeMode,
  srsSettings, setSrsSettings, recordReview, srsOf, saveCustomCard, deleteCustomCard, liveCustomCards,
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

test("activeRows falls back to the defaults for empty, non-array or all-unknown rows", () => {
  for (const rows of [[], "a", null, undefined, { 0: "a" }, ["zz", "qq"]]) {
    const s = emptyState();
    s.settings.rows = rows;
    assert.deepEqual(activeRows(s), DEFAULT_ROWS);
  }
});

test("activeRows drops unknown ids, keeps known ones, and does not rewrite the state", () => {
  const s = emptyState();
  s.settings.rows = ["ka", "zz", "na"];
  assert.deepEqual(activeRows(s), ["ka", "na"]);
  assert.deepEqual(s.settings.rows, ["ka", "zz", "na"]);
  s.settings.rows = [];
  const rows = activeRows(s);
  rows.push("x");
  assert.deepEqual(DEFAULT_ROWS, ["a", "ka", "sa", "ta"]);
});

test("activeMode accepts the three modes and falls back to type", () => {
  for (const mode of ["type", "pick", "mixed"]) {
    const s = emptyState();
    s.settings.mode = mode;
    assert.equal(activeMode(s), mode);
  }
  for (const mode of ["bogus", undefined, null, 3]) {
    const s = emptyState();
    s.settings.mode = mode;
    assert.equal(activeMode(s), "type");
  }
});

test("a null or non-object dictionary entry counts as not saved and is skipped", () => {
  const s = emptyState();
  s.dictionary["かさ"] = null;
  s.dictionary["いし"] = "junk";
  s.dictionary["あめ"] = { t: 5, deleted: false };
  assert.equal(isSaved(s, "かさ"), false);
  assert.equal(isSaved(s, "いし"), false);
  assert.equal(isSaved(s, "あめ"), true);
  assert.deepEqual(savedWords(s), [{ kana: "あめ", t: 5 }]);
  toggleWord(s, "かさ", 9);
  assert.equal(isSaved(s, "かさ"), true);
});

test("a new state has empty srs and customCards", () => {
  const s = emptyState();
  assert.deepEqual(s.srs, {});
  assert.deepEqual(s.customCards, {});
});

test("a v2 state saved before SRS loads with empty srs and customCards", () => {
  const old = { version: 2, stats: {}, dictionary: {}, settings: { rows: ["a"], mode: "type", autoSpeak: false, t: 4 }, bestStreak: { value: 1, t: 4 }, resetAt: 0 };
  const s = loadState(memoryStorage({ [STORE_KEY]: JSON.stringify(old) }));
  assert.deepEqual(s.srs, {});
  assert.deepEqual(s.customCards, {});
});

const ALL_DECKS = ["vocab", "kanji", "grammar", "custom"];

test("srsSettings gives the defaults when settings.srs is missing", () => {
  assert.deepEqual(srsSettings(emptyState()), { newPerDay: 10, reviewsPerDay: 100, showRomaji: true, decks: ALL_DECKS });
});

test("srsSettings clamps limits to whole numbers from 0 to 999", () => {
  const s = emptyState();
  s.settings.srs = { newPerDay: -5, reviewsPerDay: 5000 };
  assert.deepEqual([srsSettings(s).newPerDay, srsSettings(s).reviewsPerDay], [0, 999]);
  s.settings.srs = { newPerDay: 7.8, reviewsPerDay: 0 };
  assert.deepEqual([srsSettings(s).newPerDay, srsSettings(s).reviewsPerDay], [7, 0]);
  for (const bad of ["20", null, NaN, Infinity, {}]) {
    s.settings.srs = { newPerDay: bad, reviewsPerDay: bad };
    assert.deepEqual([srsSettings(s).newPerDay, srsSettings(s).reviewsPerDay], [10, 100]);
  }
});

test("srsSettings keeps a boolean showRomaji and defaults anything else to true", () => {
  const s = emptyState();
  s.settings.srs = { showRomaji: false };
  assert.equal(srsSettings(s).showRomaji, false);
  for (const bad of [0, "false", null]) {
    s.settings.srs = { showRomaji: bad };
    assert.equal(srsSettings(s).showRomaji, true);
  }
});

test("srsSettings drops unknown decks, allows none, and defaults a non-array to all", () => {
  const s = emptyState();
  s.settings.srs = { decks: ["kanji", "zz", 3, "custom"] };
  assert.deepEqual(srsSettings(s).decks, ["kanji", "custom"]);
  s.settings.srs = { decks: [] };
  assert.deepEqual(srsSettings(s).decks, []);
  for (const bad of ["vocab", null, { 0: "vocab" }]) {
    s.settings.srs = { decks: bad };
    assert.deepEqual(srsSettings(s).decks, ALL_DECKS);
  }
  for (const bad of [null, "x", 5, []]) {
    s.settings.srs = bad;
    assert.deepEqual(srsSettings(s).decks, ALL_DECKS);
  }
});

test("srsSettings never mutates the state", () => {
  const s = emptyState();
  s.settings.srs = { newPerDay: 5000, decks: ["zz", "kanji"] };
  const before = canonical(s);
  const out = srsSettings(s);
  out.decks.push("vocab");
  assert.equal(canonical(s), before);
  const fresh = emptyState();
  srsSettings(fresh).decks.push("x");
  assert.equal(fresh.settings.srs, undefined);
  assert.deepEqual(srsSettings(fresh).decks, ALL_DECKS);
});

test("setSrsSettings patches the sanitised SRS settings with a new timestamp", () => {
  const s = emptyState();
  s.settings.srs = { newPerDay: 5000 };
  setSrsSettings(s, { showRomaji: false }, 10);
  assert.equal(s.settings.t, 10);
  assert.deepEqual(s.settings.srs, { newPerDay: 999, reviewsPerDay: 100, showRomaji: false, decks: ALL_DECKS });
  assert.equal(s.settings.mode, "type");
});

test("recordReview stores the next card state and srsOf reads it", () => {
  const s = emptyState();
  const next = { reps: 1, interval: 1, ease: 2.5, due: 5, lapses: 0, t: 9 };
  recordReview(s, "vocab:ねこ", next);
  assert.deepEqual(srsOf(s), { "vocab:ねこ": next });
  assert.deepEqual(srsOf({}), {});
});

test("saveCustomCard and deleteCustomCard stamp the card, leaving a tombstone", () => {
  const s = emptyState();
  saveCustomCard(s, { id: "c1", front: "猫", back: "cat" }, 10);
  saveCustomCard(s, { id: "c2", front: "犬", back: "dog" }, 11);
  assert.deepEqual(s.customCards.c1, { id: "c1", front: "猫", back: "cat", t: 10, deleted: false });
  deleteCustomCard(s, "c1", 20);
  assert.deepEqual(s.customCards.c1, { id: "c1", front: "猫", back: "cat", t: 20, deleted: true });
  assert.deepEqual(liveCustomCards(s).map(c => c.id), ["c2"]);
  saveCustomCard(s, { id: "c1", front: "猫", back: "cat!" }, 30);
  assert.equal(s.customCards.c1.deleted, false);
});

test("liveCustomCards skips malformed entries and a missing map", () => {
  const s = emptyState();
  s.customCards = { a: null, b: "junk", c: { id: "c", t: 1, deleted: false } };
  assert.deepEqual(liveCustomCards(s).map(c => c.id), ["c"]);
  assert.deepEqual(liveCustomCards({}), []);
});

test("resetProgress leaves srs and custom cards alone", () => {
  const s = emptyState();
  recordReview(s, "kanji:日", { reps: 3, t: 10 });
  s.srsLater = { "kanji:日": [{ reps: 1, t: 12 }] };
  saveCustomCard(s, { id: "c1", front: "a", back: "b" }, 10);
  resetProgress(s, 50);
  assert.deepEqual(s.srs, { "kanji:日": { reps: 3, t: 10 } });
  assert.deepEqual(s.srsLater, { "kanji:日": [{ reps: 1, t: 12 }] });
  assert.equal(liveCustomCards(s).length, 1);
});
