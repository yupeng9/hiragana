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
  s.bestStreakLater = [{ value: 2, t: 12 }];
  toggleWord(s, "かさ", 10);
  resetProgress(s, 50);
  assert.deepEqual(s.stats, {});
  assert.deepEqual(s.bestStreak, { value: 0, t: 50 });
  assert.equal(s.bestStreakLater, undefined);
  assert.equal(s.resetAt, 50);
  assert.equal(isSaved(s, "かさ"), true);
});
