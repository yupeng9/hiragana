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
  const a = base({ resetAt: 50, bestStreak: { value: 0, t: 0 } });
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

test("a stats entry stamped exactly at the reset time is kept", () => {
  const a = base({ resetAt: 50 });
  const b = base({
    stats: {
      か: { box: 1, seen: 1, correct: 1, t: 50 },
      さ: { box: 1, seen: 1, correct: 1, t: 49 },
    },
  });
  assert.deepEqual(Object.keys(merge(a, b).stats), ["か"]);
  assert.deepEqual(Object.keys(merge(b, a).stats), ["か"]);
});

test("an entry without a timestamp merges the same in both orders", () => {
  const noT = { box: 1, seen: 1, correct: 1 };
  const withT = { box: 2, seen: 2, correct: 2, t: 5 };
  const a = base({ stats: { か: noT } });
  const b = base({ stats: { か: withT } });
  assert.deepEqual(merge(a, b).stats.か, withT);
  assert.deepEqual(merge(b, a).stats.か, withT);
  const c = base({ stats: { か: { box: 1, seen: 1, correct: 1, t: "x" } } });
  assert.equal(canonical(merge(c, b)), canonical(merge(b, c)));
});

test("a state with missing sections merges in both orders and keeps the other data", () => {
  const full = base({
    settings: { rows: ["a", "ka"], mode: "pick", autoSpeak: true, t: 5 },
    stats: { か: { box: 1, seen: 1, correct: 1, t: 10 } },
    dictionary: { かさ: { t: 15, deleted: false } },
    bestStreak: { value: 4, t: 12 },
  });
  const sparse = { version: 2 };
  for (const m of [merge(full, sparse), merge(sparse, full)]) {
    assert.deepEqual(m.settings, full.settings);
    assert.deepEqual(m.stats, full.stats);
    assert.deepEqual(m.dictionary, full.dictionary);
    assert.deepEqual(m.bestStreak, full.bestStreak);
  }
  assert.doesNotThrow(() => merge({}, {}));
  assert.doesNotThrow(() => merge(base({ stats: null, dictionary: null }), base()));
});

test("the best streak never goes down, even when the lower one is newer", () => {
  const a = base({ bestStreak: { value: 9, t: 40 } });
  const b = base({ bestStreak: { value: 5, t: 45 } });
  assert.equal(merge(a, b).bestStreak.value, 9);
  assert.equal(merge(b, a).bestStreak.value, 9);
});

test("canonical skips undefined values like JSON does", () => {
  assert.equal(canonical({ t: 1, x: undefined }), canonical({ t: 1 }));
});

// Tiny seeded PRNG so failures are reproducible.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomState(rnd) {
  const int = n => Math.floor(rnd() * n);
  const chance = p => rnd() < p;
  const keys = ["か", "さ", "あ"];
  const state = { version: 2 };
  if (chance(0.85)) {
    state.settings = {
      rows: chance(0.5) ? ["a"] : ["a", "ka"],
      mode: chance(0.5) ? "type" : "pick",
      autoSpeak: chance(0.5),
      t: int(6),
    };
  }
  if (chance(0.85)) {
    state.stats = {};
    for (const k of keys) {
      if (chance(0.6)) state.stats[k] = { box: int(4), seen: int(4), correct: int(4), t: int(6) };
    }
  }
  if (chance(0.85)) {
    state.dictionary = {};
    for (const k of keys) {
      if (chance(0.6)) state.dictionary[k] = { t: int(6), deleted: chance(0.5) };
    }
  }
  if (chance(0.85)) state.bestStreak = { value: int(10), t: int(6) };
  if (chance(0.85)) state.resetAt = int(6);
  return state;
}

test("property: merge is commutative, associative and idempotent on merge outputs", () => {
  const rnd = mulberry32(12345);
  for (let i = 0; i < 300; i++) {
    const a = randomState(rnd), b = randomState(rnd), c = randomState(rnd);
    const note = `case ${i}: ${canonical([a, b, c])}`;
    assert.equal(canonical(merge(a, b)), canonical(merge(b, a)), `commutative, ${note}`);
    assert.equal(
      canonical(merge(merge(a, b), c)),
      canonical(merge(a, merge(b, c))),
      `associative, ${note}`,
    );
    const m = merge(a, b);
    assert.equal(canonical(merge(m, m)), canonical(m), `idempotent, ${note}`);
  }
});

test("a lower but later best streak survives a reset whatever the merge order", () => {
  const a = base({ resetAt: 4 });
  const b = base({ bestStreak: { value: 3, t: 3 } });
  const c = base({ bestStreak: { value: 2, t: 4 } });
  const left = merge(merge(a, b), c);
  const right = merge(a, merge(b, c));
  assert.equal(left.bestStreak.value, 2);
  assert.equal(canonical(left), canonical(right));
});

test("a malformed bestStreakLater on one side does not throw", () => {
  for (const bad of [5, "x", { value: 1 }, [null, 7, "y"]]) {
    const m = merge(base({ bestStreak: { value: 4, t: 2 }, bestStreakLater: bad }), base());
    assert.equal(m.bestStreak.value, 4);
  }
});
