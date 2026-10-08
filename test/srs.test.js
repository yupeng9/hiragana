import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGAIN, HARD, GOOD, EASY, DAY, MINUTE, START_EASE,
  schedule, preview, formatDelay, dayStart, buildQueue, nextCardId,
} from "../js/srs.js";

const T0 = new Date(2026, 9, 7, 10, 0).getTime();   // local 10:00

test("a new card: Good walks the learning steps, then graduates to 1 day", () => {
  let c = schedule(null, GOOD, T0);
  assert.equal(c.phase, "learning"); assert.equal(c.step, 1); assert.equal(c.due, T0 + 10 * MINUTE);
  c = schedule(c, GOOD, T0 + 10 * MINUTE);
  assert.equal(c.phase, "review"); assert.equal(c.interval, 1);
  assert.equal(c.due, T0 + 10 * MINUTE + DAY);
  assert.equal(c.reps, 2); assert.equal(c.first, T0); assert.equal(c.last, T0 + 10 * MINUTE);
});

test("a new card: Again and Hard keep it on the first step, Easy graduates to 4 days", () => {
  assert.deepEqual([schedule(null, AGAIN, T0).due, schedule(null, HARD, T0).due], [T0 + MINUTE, T0 + MINUTE]);
  const e = schedule(null, EASY, T0);
  assert.equal(e.phase, "review"); assert.equal(e.interval, 4); assert.equal(e.ease, START_EASE);
});

test("review intervals grow by ease and the buttons are strictly ordered", () => {
  const card = { phase: "review", step: 0, interval: 10, ease: 2.5, reps: 5, lapses: 0, first: 0, last: 0, due: T0 };
  const [h, g, e] = [HARD, GOOD, EASY].map(r => schedule(card, r, T0));
  assert.deepEqual([h.interval, g.interval, e.interval], [12, 25, 33]);
  assert.deepEqual([h.ease, g.ease, e.ease], [2.35, 2.5, 2.65]);
  const tiny = { ...card, interval: 1 };
  const [h1, g1, e1] = [HARD, GOOD, EASY].map(r => schedule(tiny, r, T0).interval);
  assert.ok(h1 < g1 && g1 < e1, `${h1} < ${g1} < ${e1}`);
});

test("a lapse relearns for 10 minutes, lowers ease, and returns at 1 day", () => {
  const card = { phase: "review", step: 0, interval: 30, ease: 1.4, reps: 9, lapses: 2, first: 0, last: 0, due: T0 };
  const l = schedule(card, AGAIN, T0);
  assert.equal(l.phase, "relearning"); assert.equal(l.due, T0 + 10 * MINUTE);
  assert.equal(l.lapses, 3); assert.equal(l.ease, 1.3); assert.equal(l.interval, 1);
  const back = schedule(l, GOOD, T0 + 10 * MINUTE);
  assert.equal(back.phase, "review"); assert.equal(back.interval, 1);
  assert.equal(schedule(l, EASY, T0 + 10 * MINUTE).interval, 2);
});

test("intervals are capped at 100 years", () => {
  const card = { phase: "review", step: 0, interval: 36000, ease: 3, reps: 50, lapses: 0, first: 0, last: 0, due: T0 };
  assert.equal(schedule(card, EASY, T0).interval, 36500);
});

test("preview returns the delay of each button and formatDelay is short", () => {
  assert.deepEqual(preview(null, T0), [MINUTE, MINUTE, 10 * MINUTE, 4 * DAY]);
  assert.deepEqual([MINUTE, 10 * MINUTE, 3 * 3600_000, DAY, 3 * DAY, 45 * DAY, 400 * DAY].map(formatDelay),
    ["1m", "10m", "3h", "1d", "3d", "1.5mo", "1.1y"]);
});

test("the day starts at 04:00 local time", () => {
  const four = new Date(2026, 9, 7, 4, 0).getTime();
  assert.equal(dayStart(new Date(2026, 9, 7, 10, 0).getTime()), four);
  assert.equal(dayStart(new Date(2026, 9, 8, 3, 59).getTime()), four);
});

test("buildQueue orders learning, then due reviews, then new cards within the limits", () => {
  const cards = ["a", "b", "c", "d", "e", "f"].map(id => ({ id }));
  const states = {
    a: { phase: "review", due: T0 + 5 * 3600_000, first: 0, last: 0 },        // due later today
    b: { phase: "review", due: T0 - DAY, first: 0, last: 0 },                  // overdue
    c: { phase: "review", due: T0 + 2 * DAY, first: 0, last: 0 },              // not due
    d: { phase: "learning", due: T0 + 5 * MINUTE, first: T0 - MINUTE, last: T0 - MINUTE },
  };
  const q = buildQueue(cards, states, T0, { newPerDay: 1, reviewsPerDay: 100 });
  assert.deepEqual(q.learning, ["d"]);
  assert.deepEqual(q.review, ["b", "a"]);
  assert.deepEqual(q.fresh, []);              // d was first seen today and used the only new slot
});

test("daily limits subtract what was already done today", () => {
  const cards = ["n1", "n2", "n3", "r1", "r2"].map(id => ({ id }));
  const start = dayStart(T0);
  const states = {
    old: { phase: "review", due: T0 + 9 * DAY, first: start - 9 * DAY, last: start + 60_000 },  // reviewed today
    seen: { phase: "learning", due: T0 + 9 * MINUTE, first: start + 60_000, last: start + 60_000 }, // new today
    r1: { phase: "review", due: T0 - 1, first: 0, last: 0 },
    r2: { phase: "review", due: T0 - 2, first: 0, last: 0 },
  };
  const q = buildQueue(cards, states, T0, { newPerDay: 2, reviewsPerDay: 2 });
  assert.deepEqual(q.fresh, ["n1"]);
  assert.deepEqual(q.review, ["r2"]);
});

test("a card with `after` becomes new only once its sibling has graduated", () => {
  const cards = [{ id: "w:r" }, { id: "w:p", after: "w:r" }];
  assert.deepEqual(buildQueue(cards, {}, T0, { newPerDay: 9, reviewsPerDay: 9 }).fresh, ["w:r"]);
  const learning = { "w:r": { phase: "learning", due: T0 + MINUTE, first: T0, last: T0 } };
  assert.deepEqual(buildQueue(cards, learning, T0, { newPerDay: 9, reviewsPerDay: 9 }).fresh, []);
  const graduated = { "w:r": { phase: "review", due: T0 + DAY, first: 0, last: 0 } };
  assert.deepEqual(buildQueue(cards, graduated, T0, { newPerDay: 9, reviewsPerDay: 9 }).fresh, ["w:p"]);
});

test("nextCardId prefers due learning cards, then reviews, then new; reports the wait otherwise", () => {
  const states = { l: { phase: "learning", due: T0 + 30 * MINUTE } };
  const q = { learning: ["l"], review: [], fresh: [] };
  assert.deepEqual(nextCardId(q, states, T0), { id: null, waitUntil: T0 + 30 * MINUTE });
  assert.deepEqual(nextCardId(q, states, T0 + 15 * MINUTE), { id: "l", waitUntil: null });   // within 20 min learn-ahead
  assert.deepEqual(nextCardId({ learning: [], review: ["r"], fresh: ["n"] }, {}, T0), { id: "r", waitUntil: null });
  assert.deepEqual(nextCardId({ learning: [], review: [], fresh: ["n"] }, {}, T0), { id: "n", waitUntil: null });
  assert.deepEqual(nextCardId({ learning: [], review: [], fresh: [] }, {}, T0), { id: null, waitUntil: null });
});
