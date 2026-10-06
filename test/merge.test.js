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
