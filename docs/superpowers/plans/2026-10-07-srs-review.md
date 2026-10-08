# Spaced-Repetition Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Anki-style SM-2 review of vocabulary, kanji and grammar cards (built-in N5 decks + the user's own), synced through the existing gist.

**Architecture:**
- **Pure, unit-tested modules:**
  - `js/srs.js`: scheduler, day boundary and queue
  - `js/romaji.js`: reading aid
  - `js/cards.js`: card list from decks and custom cards
- **Data modules:** `js/decks/*.js`
- **UI module:** `js/review.js`. `js/app.js` wires it to the state, persistence and sync, the same way as the existing tabs.
- **State and merge:** `store.js` and `merge.js` gain `srs` and `customCards`. Both keep the merge laws (commutative, associative, idempotent).

**Tech Stack:** vanilla ES modules, `node --test`, the existing sync, and the service worker. After changing precached files, run `npm run bump-sw`.

**Spec:** `docs/superpowers/specs/2026-10-07-srs-review-design.md`

---

## Conventions for every task

- **Location:** work in the repo root on branch `feature/srs`. Do not push.
- **TDD:** write the tests first, watch them fail, then implement.
- **Commit message:** end every commit message with a blank line followed by `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Service worker version:**
  - Any change to a file listed in `sw.js` `FILES` requires `npm run bump-sw` before committing.
  - Each task adds its own new runtime files (including `js/decks/*.js`) to `FILES` and runs `npm run bump-sw` in the same task, so `npm test` stays green on every commit.
- **Existing state shape**, from `js/store.js` `emptyState()`:
  - `{ version: 2, settings: { rows, mode, autoSpeak, t }, stats, dictionary, bestStreak, resetAt }`
  - plus the merge-only optional fields `statsLater` and `bestStreakLater`.
  - `merge.js` exports `merge(a, b)` and `canonical(v)`.
  - Internally, `merge.js` has `timeOf`, `newer`, `mergeMap`, `unbeaten`, `recordsOf`, `compareCanonical` and `mergeStats`. `mergeStats` uses `seen` as the count; its "unbeaten entries" pattern is the one to reuse.

---

### Task 1: SM-2 scheduler and queue (`js/srs.js`)

**Files:** create `js/srs.js` and `test/srs.test.js`.

- [ ] **Step 1: Write the failing tests** (`test/srs.test.js`)

```js
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
```

- [ ] **Step 2:** Run `npm test`. It should fail with `Cannot find module …/js/srs.js`.

- [ ] **Step 3: Implement** (`js/srs.js`)

```js
// Anki-style SM-2 scheduling (see docs/superpowers/specs/2026-10-07-srs-review-design.md).
// Pure: every function takes `now` (ms) and returns new objects; nothing is random.
export const [AGAIN, HARD, GOOD, EASY] = [1, 2, 3, 4];
export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const LEARN_STEPS = [1, 10];   // minutes
export const RELEARN_STEPS = [10];    // minutes
export const START_EASE = 2.5;
const MIN_EASE = 1.3, GRADUATE_DAYS = 1, EASY_DAYS = 4, HARD_FACTOR = 1.2, EASY_BONUS = 1.3;
const MAX_DAYS = 36500, LEARN_AHEAD = 20 * MINUTE, DAY_CUTOFF_HOUR = 4;
const round2 = x => Math.round(x * 100) / 100;

// card: the card's saved state, or null if it has never been reviewed.
export function schedule(card, rating, now) {
  const c = card ?? { phase: "new", step: 0, interval: 0, ease: START_EASE, reps: 0, lapses: 0 };
  const next = { ...c, reps: (c.reps || 0) + 1, first: c.first ?? now, last: now, t: now };
  return c.phase === "review" ? reviewCard(next, rating, now) : learnCard(next, rating, now);
}

function learnCard(c, rating, now) {
  const relearning = c.phase === "relearning";
  const steps = relearning ? RELEARN_STEPS : LEARN_STEPS;
  const atStep = step => ({ ...c, phase: relearning ? "relearning" : "learning", step,
    due: now + steps[step] * MINUTE });
  if (rating === AGAIN) return atStep(0);
  if (rating === HARD) return atStep(Math.min(c.step, steps.length - 1));
  if (rating === GOOD && c.step + 1 < steps.length) return atStep(c.step + 1);
  const days = relearning ? Math.max(1, c.interval) + (rating === EASY ? 1 : 0)
    : rating === EASY ? EASY_DAYS : GRADUATE_DAYS;
  return { ...c, phase: "review", step: 0, interval: days, due: now + days * DAY };
}

function reviewCard(c, rating, now) {
  if (rating === AGAIN) {
    return { ...c, phase: "relearning", step: 0, lapses: (c.lapses || 0) + 1, interval: 1,
      ease: round2(Math.max(MIN_EASE, c.ease - 0.2)), due: now + RELEARN_STEPS[0] * MINUTE };
  }
  const cap = d => Math.min(MAX_DAYS, d);
  const hard = cap(Math.max(c.interval + 1, Math.round(c.interval * HARD_FACTOR)));
  const good = cap(Math.max(hard + 1, Math.round(c.interval * c.ease)));
  const easy = cap(Math.max(good + 1, Math.round(c.interval * c.ease * EASY_BONUS)));
  const [interval, ease] = rating === HARD ? [hard, Math.max(MIN_EASE, c.ease - 0.15)]
    : rating === GOOD ? [good, c.ease] : [easy, c.ease + 0.15];
  return { ...c, interval, ease: round2(ease), due: now + interval * DAY };
}

// Delay until the card would come back for each button [Again, Hard, Good, Easy].
export const preview = (card, now) => [AGAIN, HARD, GOOD, EASY].map(r => schedule(card, r, now).due - now);

export function formatDelay(ms) {
  const min = ms / MINUTE, days = ms / DAY;
  if (min < 60) return `${Math.max(1, Math.round(min))}m`;
  if (days < 1) return `${Math.round(min / 60)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30 * 10) / 10}mo`;
  return `${Math.round(days / 365 * 10) / 10}y`;
}

// Start of the study day (04:00 local, like Anki).
export function dayStart(now) {
  const d = new Date(now);
  if (d.getHours() < DAY_CUTOFF_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_CUTOFF_HOUR, 0, 0, 0);
  return d.getTime();
}

// cards: [{ id, after? }] in introduction order; states: { [id]: saved state }.
// `after` names a sibling that must have graduated before this card is introduced.
export function buildQueue(cards, states, now, { newPerDay, reviewsPerDay }) {
  const start = dayStart(now), end = start + DAY;
  let newToday = 0, reviewsToday = 0;
  for (const s of Object.values(states)) {
    if (s.first >= start) newToday++;
    else if (s.last >= start) reviewsToday++;
  }
  const learning = [], review = [], fresh = [];
  for (const { id, after } of cards) {
    const s = states[id];
    if (!s) { if (!after || states[after]?.phase === "review") fresh.push(id); }
    else if (s.phase === "review") { if (s.due < end) review.push(id); }
    else learning.push(id);
  }
  const byDue = (x, y) => states[x].due - states[y].due;
  return {
    learning: learning.sort(byDue),
    review: review.sort(byDue).slice(0, Math.max(0, reviewsPerDay - reviewsToday)),
    fresh: fresh.slice(0, Math.max(0, newPerDay - newToday)),
  };
}

// The card to show now, or how long until a learning card is due.
export function nextCardId(queue, states, now) {
  const learn = queue.learning.find(id => states[id].due <= now + LEARN_AHEAD);
  const id = learn ?? queue.review[0] ?? queue.fresh[0] ?? null;
  const waitUntil = id === null && queue.learning.length ? states[queue.learning[0]].due : null;
  return { id, waitUntil };
}
```

- [ ] **Step 4:** Run `npm test`. Every test should pass.
- [ ] **Step 5:** Commit with the message "Add SM-2 scheduler and review queue".

---

### Task 2: Reading aid (`js/romaji.js`)

**Files:** create `js/romaji.js` and `test/romaji.test.js`.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { syllables, toRomaji, rubyHtml } from "../js/romaji.js";

test("basic hiragana, dakuten and ん", () => {
  assert.equal(toRomaji("さくら"), "sakura");
  assert.equal(toRomaji("がっこう"), "gakkou");
  assert.equal(toRomaji("しんぶん"), "shinbun");
});
test("small ya/yu/yo combinations", () => {
  assert.equal(toRomaji("きょう"), "kyou");
  assert.equal(toRomaji("しゃしん"), "shashin");
  assert.equal(toRomaji("ちゃ"), "cha");
  assert.equal(toRomaji("じゅぎょう"), "jugyou");
});
test("small tsu doubles the next consonant, including ch → tch", () => {
  assert.equal(toRomaji("きって"), "kitte");
  assert.equal(toRomaji("まっちゃ"), "matcha");
});
test("katakana, the long-vowel mark and extended combinations", () => {
  assert.equal(toRomaji("コーヒー"), "koohii");
  assert.equal(toRomaji("パーティー"), "paatii");
  assert.equal(toRomaji("ファン"), "fan");
});
test("non-kana passes through untouched", () => {
  assert.deepEqual(syllables("水を"), [{ text: "水", romaji: null }, { text: "を", romaji: "wo" }]);
  assert.equal(toRomaji("A、b。"), "A、b。");
});
test("syllables keep っ and ー with their syllable", () => {
  assert.deepEqual(syllables("きって").map(s => s.text), ["き", "って"]);
  assert.deepEqual(syllables("コーヒー").map(s => s.text), ["コー", "ヒー"]);
});
test("rubyHtml annotates only syllables that are not known", () => {
  const known = new Set(["あ", "い", "か", "さ"]);
  assert.equal(rubyHtml("あかい", known), "あかい");
  assert.equal(rubyHtml("あめ", known), "あ<ruby>め<rt>me</rt></ruby>");
  assert.equal(rubyHtml("ネコ", known), "<ruby>ネ<rt>ne</rt></ruby><ruby>コ<rt>ko</rt></ruby>");
  assert.equal(rubyHtml("水", known), "水");
});
test("rubyHtml escapes HTML in the input", () => {
  assert.equal(rubyHtml("<b>", new Set()), "&lt;b&gt;");
});
```

- [ ] **Step 2:** Run `npm test`. It should fail because the module doesn't exist yet.

- [ ] **Step 3: Implement** (`js/romaji.js`)

```js
// Kana → romaji, one syllable at a time, so the reading aid can annotate only the
// syllables the learner hasn't met yet. Hepburn-style; long vowels are spelled out (ou, ii).
const BASE = {
  あ:"a",い:"i",う:"u",え:"e",お:"o", か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",
  さ:"sa",し:"shi",す:"su",せ:"se",そ:"so", た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",
  な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no", は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",
  ま:"ma",み:"mi",む:"mu",め:"me",も:"mo", や:"ya",ゆ:"yu",よ:"yo",
  ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro", わ:"wa",ゐ:"i",ゑ:"e",を:"wo",ん:"n",
  が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go", ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",
  だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do", ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",
  ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po", ゔ:"vu",
  ぁ:"a",ぃ:"i",ぅ:"u",ぇ:"e",ぉ:"o", ゃ:"ya",ゅ:"yu",ょ:"yo", ゎ:"wa", っ:"",
};
const SMALL_Y = "ゃゅょ", SMALLS = "ゃゅょぁぃぅぇぉ";
const isKatakana = ch => ch >= "ァ" && ch <= "ヶ";
const toHira = ch => (isKatakana(ch) ? String.fromCharCode(ch.charCodeAt(0) - 0x60) : ch);
const isKana = ch => toHira(ch) in BASE;
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = s => s.replace(/[&<>"']/g, c => ESC[c]);

function combine(first, small) {
  const base = BASE[first];
  if (SMALL_Y.includes(small)) {
    const stem = base.slice(0, -1);                            // き→k, し→sh, ち→ch, じ→j
    const v = BASE[small].slice(1);                            // ゃ→a
    return ["sh", "ch", "j"].includes(stem) ? stem + v : stem + "y" + v;
  }
  const stem = base === "u" ? "w" : base.replace(/[aiueo]$/, "");   // ファ→f+a, ウィ→w+i, ティ→t+i
  return stem + BASE[small];
}

// The kana syllable starting at chars[i]: one kana, plus a following small ゃゅょ/ぁぃぅぇぉ.
function syllableAt(chars, i) {
  const h = toHira(chars[i]), next = chars[i + 1] && toHira(chars[i + 1]);
  if (next && SMALLS.includes(next) && !SMALLS.includes(h)) return { len: 2, romaji: combine(h, next) };
  return { len: 1, romaji: BASE[h] };
}

// [{ text, romaji }] — romaji is null for anything that isn't kana. っ joins the syllable
// after it (doubling its consonant), and ー joins the syllable before it (repeating its vowel).
export function syllables(text) {
  const chars = [...text], out = [];
  for (let i = 0; i < chars.length;) {
    const ch = chars[i];
    if (ch === "ー" && out.at(-1)?.romaji) {
      const prev = out.at(-1);
      prev.text += ch;
      prev.romaji += prev.romaji.match(/[aiueo]$/)?.[0] ?? "";
      i++;
    } else if (!isKana(ch)) {
      out.push({ text: ch, romaji: null });
      i++;
    } else if (toHira(ch) === "っ" && chars[i + 1] && isKana(chars[i + 1]) && toHira(chars[i + 1]) !== "っ") {
      const s = syllableAt(chars, i + 1);
      const doubled = s.romaji.startsWith("ch") ? "t" : s.romaji[0];
      out.push({ text: chars.slice(i, i + 1 + s.len).join(""), romaji: doubled + s.romaji });
      i += 1 + s.len;
    } else {
      const s = syllableAt(chars, i);
      out.push({ text: chars.slice(i, i + s.len).join(""), romaji: s.romaji });
      i += s.len;
    }
  }
  return out;
}

export const toRomaji = text => syllables(text).map(s => s.romaji ?? s.text).join("");

// HTML for `text` with <ruby> romaji over each syllable not made entirely of known kana.
export function rubyHtml(text, known) {
  return syllables(text).map(({ text: t, romaji }) =>
    romaji && ![...t].every(ch => known.has(ch))
      ? `<ruby>${escape(t)}<rt>${romaji}</rt></ruby>` : escape(t)).join("");
}
```

- [ ] **Step 4:** Run `npm test`. Every test should pass.
- [ ] **Step 5:** Commit with the message "Add kana-to-romaji reading aid".

---

### Task 3: State and merge for SRS and custom cards

**Files:**
- modify `js/store.js`, `js/merge.js`, `test/store.test.js` and `test/merge.test.js`.

**Requirements** (write the tests first):

1. **Initial state.** `emptyState()` gains `srs: {}` and `customCards: {}`. `loadState` already fills missing top-level fields from `emptyState()`, so old saved states keep working. Add a test: a v2 state without `srs` loads with `srs: {}`.
2. **SRS settings.** `settings.srs` is optional. Add `export function srsSettings(state)`, which returns a sanitised copy:
   - `newPerDay` and `reviewsPerDay` are integers clamped to 0–999, defaulting to 10 and 100.
   - `showRomaji` is a boolean, defaulting to true.
   - `decks` is an array filtered to `["vocab","kanji","grammar","custom"]`. If it is missing or not an array it defaults to all four; an empty array is allowed and means "none".

   Update it with `setSettings(state, { srs: { ...srsSettings(state), ...patch } }, now)`. Add `export function setSrsSettings(state, patch, now)`. Write tests for the defaults, clamping, unknown decks being dropped, and that the function never mutates state.
3. **Recording a review.** Add `export function recordReview(state, cardId, nextCardState)`, which sets `state.srs[cardId] = nextCardState` (that object already carries `t`). Add `export const srsOf = (state) => state.srs ?? {}`.
4. **Custom cards.**
   - `export function saveCustomCard(state, card, now)` sets `state.customCards[card.id] = { ...card, t: now, deleted: false }`.
   - `export function deleteCustomCard(state, id, now)` sets `{ ...existing, t: now, deleted: true }`.
   - `export const liveCustomCards = state => Object.values(state.customCards ?? {}).filter(c => c && typeof c === "object" && !c.deleted)`.
5. **Merging `customCards`.** Merge per id with newest-wins (the existing `mergeMap`/`newer`), the same as `dictionary`. Tombstones are kept.
6. **Merging `srs`.**
   - For each card id, the entry with more `reps` wins, then the larger `t`, then the canonical JSON order.
   - Keep the other unbeaten entries in an optional merge-only `srsLater`, exactly like `statsLater`. Generalise `mergeStats` into a helper parameterised by the count field (`"seen"` or `"reps"`) and by the minimum `t` (`resetAt` for stats, `0` for srs). There is no reset filter for srs.
   - `srs` is not affected by `resetProgress`.
   - Missing or malformed `srs`/`srsLater` is treated as `{}`, the same hardening as stats.
7. **Tests.**
   - Extend the seeded property test so its random states also carry `srs`, with `reps` 0–3 and `t` 0–5 for 2–3 card ids, and `customCards`, with random tombstones. The test must keep asserting commutativity, associativity and idempotence.
   - Add targeted tests:
     - more reps beats a newer entry;
     - equal reps → newer `t` wins;
     - a deleted custom card beats an older save;
     - `resetProgress` leaves `srs` alone.
8. **Spec.** Update `docs/superpowers/specs/2026-10-06-iphone-mac-sync-design.md` §2 with the new fields and rules.

- [ ] Run `npm test`; everything should pass. Commit with the message "Store and merge SRS progress and custom cards".

---

### Task 4: Deck format, validation and seed data

**Files:**
- create `js/decks/vocab.js`, `js/decks/kanji.js`, `js/decks/grammar.js` and `test/decks.test.js`.

**Data shapes.** Each file exports one array. Write a short comment at the top of each file documenting its shape.

```js
// js/decks/vocab.js
export const VOCAB = [
  // word: as usually written (kanji or kana); kana: full reading in hiragana/katakana;
  // accent: Tokyo pitch-accent number (0 = flat) or null if unsure; ex: one example sentence
  // (jp as written, kana = its full reading, en, zh).
  { word: "水", kana: "みず", accent: 0, en: "water", zh: "水",
    ex: { jp: "水をください。", kana: "みずをください。", en: "Water, please.", zh: "请给我水。" } },
];
// js/decks/kanji.js
export const KANJI = [
  // on: on'yomi in katakana; kun: kun'yomi in hiragana ("." marks okurigana, "-" a suffix).
  { kanji: "日", on: ["ニチ", "ジツ"], kun: ["ひ", "-び", "-か"], en: "day; sun", zh: "日；太阳",
    words: [{ word: "日本", kana: "にほん", en: "Japan", zh: "日本" }] },
];
// js/decks/grammar.js
export const GRAMMAR = [
  { id: "wa-desu", pattern: "〜は〜です", en: "X is Y (polite)", zh: "X是Y（礼貌）",
    note_en: "…", note_zh: "…",
    ex: [{ jp: "わたしは学生です。", kana: "わたしはがくせいです。", en: "I am a student.", zh: "我是学生。" }] },
];
```

**Seed data.** Write 5 correct entries in each file. These seed entries are what the review UI is built against; Tasks 5–7 fill in the full decks.

**`test/decks.test.js` asserts:**
- **Every deck:**
  - unique keys (`word` for vocab, `kanji` for kanji, `id` for grammar);
  - all required string fields are non-empty: vocab `word kana en zh`, kanji `kanji en zh`, grammar `id pattern en zh`.
- **Kana fields** (`kana`, `ex.kana`, `words[].kana`, `ex[].kana`) contain only hiragana, katakana, `ー` and Japanese punctuation/spaces (`、。！？「」・ ～〜`). Concretely, test with `/^[぀-ゟ゠-ヿ　-〿！-～ ・ー〜～]+$/`.
- **Vocab accent:** `accent` is null or an integer from 0 to the number of morae in `kana`. Count morae by excluding the small `ゃゅょァィゥェォャュョ`.
- **Kanji readings:**
  - `kanji` is one character in the CJK range;
  - `on` entries are katakana only;
  - `kun` entries are hiragana plus `.` and `-` only;
  - at least one of `on` or `kun` is non-empty;
  - `words` has 1–3 entries and each word contains the kanji.
- **Grammar:** `ex` has 1–2 entries, each with all four fields.
- **Example sentences:** every `ex` (vocab) and every `ex[]` item (grammar) has `jp`, `kana`, `en` and `zh`.

Run `npm test` and commit with the message "Add deck formats, validation and seed decks".

---

### Tasks 5, 6, 7: Full decks (content)

Each task replaces one seed deck with the full deck. The tasks are independent of each other.

**Task 5 — `js/decks/vocab.js`, about 200 JLPT N5 words.**
- Order the words by usefulness for a beginner: greetings, pronouns, numbers, time, family, food, places and everyday verbs/adjectives in dictionary form.
- Write `word` in its usual form, kanji where an N5 learner would see kanji.
- Use plain, beginner-level example sentences, polite form (です/ます).
- Give `accent` only when confident; otherwise use null.

**Task 6 — `js/decks/kanji.js`, the ~80 standard N5 kanji.**
- Common order: 一二三…, 日月火水木金土, 人, 大小, 上下, and so on.
- Include only the main readings.
- Each kanji gets 1–3 very common example words.

**Task 7 — `js/decks/grammar.js`, about 40 N5 grammar points.**
- Covers particles (は が を に で へ と も の から まで), です/ます forms and negatives, past, 〜たい, 〜てください, 〜ています, あります/います, こそあど, adjective conjugation, 〜ましょう, 〜ませんか, 〜から (because), 〜が (but), 〜とき, and so on.
- Each grammar point gets a short `note_en`/`note_zh` explanation and 1–2 examples.

**Every deck must pass `test/decks.test.js`.** Chinese is Simplified (Mainland usage). Do not copy text from copyrighted textbooks; write original examples. Commit each deck with the message "Add full <deck> deck".

---

### Task 8: Card list (`js/cards.js`)

**Files:** create `js/cards.js` and `test/cards.test.js`.

- **`export function allCards(state)`** returns an array of card descriptors in introduction order. Each descriptor is `{ id, deck, kind, note, after? }`.
- **Deck order:** iterate `VOCAB`, then `KANJI`, then `GRAMMAR`, then the live custom cards (by `t`, oldest first).
- **Filtering:** keep only decks enabled in `srsSettings(state).decks`.
- **Vocab:**
  - `{ id: "v:"+word+":r", deck: "vocab", kind: "recognition", note }`
  - `{ id: "v:"+word+":p", deck: "vocab", kind: "production", note, after: "v:"+word+":r" }`
  - The two cards are interleaved per word: word1:r, word1:p, word2:r, …. `buildQueue`'s `after` rule keeps production cards back until the recognition card has graduated.
- **Kanji:** `{ id: "k:"+kanji, deck: "kanji", kind: "kanji", note }`
- **Grammar:** `{ id: "g:"+id, deck: "grammar", kind: "grammar", note }`
- **Custom cards** (`deck: "custom"`):
  - a vocab-type custom card → `c:<id>:r` and `c:<id>:p`, like vocab;
  - a kanji-type custom card → `c:<id>` with kind `"kanji"`;
  - a grammar-type custom card → `c:<id>` with kind `"grammar"`.
- **`export function deckCounts(state, now)`** returns `{ [deck]: { due, fresh } }`:
  - **due:** learning cards due within 20 minutes, plus review cards due today.
  - **fresh:** the deck's new cards that would be offered today, computed with `buildQueue` over all enabled cards and then grouped by deck.
  - Also return the totals.
- **`export function studyQueue(state, now)`** returns `buildQueue(allCards(state), srsOf(state), now, srsSettings(state))`.
- **Tests:**
  - ids and order;
  - a disabled deck is excluded;
  - a deleted custom card is excluded;
  - production cards wait for their sibling (via `buildQueue`);
  - the counts.

Commit with the message "Build the review card list from decks and custom cards".

---

### Task 9: Review tab UI (`js/review.js` + markup + CSS)

**Files:**
- create `js/review.js`;
- modify `index.html`, `css/style.css` and `js/app.js`.

**The `js/review.js` interface.** It exports `initReview({ getState, update, knownKana, speak })`.
- **Parameters:**
  - `update(fn)` runs `fn(state, now)`, which mutates through the store helpers, then persists and syncs. It is app.js's `persist()` pattern.
  - `knownKana()` returns a `Set` of the learned hiragana characters (the ones in `activeRows`).
- **Return value:** `{ refresh() }`. app.js calls `refresh()` after a remote merge changes state, and whenever the Review tab is shown.

**Markup** (inside `<main>`): add `<section id="review" class="view">` with four sub-panels. Show only one at a time.
- **`#revOverview`:**
  - one row per deck, with its name, due/new counts and an on/off switch;
  - a big **Study** button showing the total;
  - settings: new/day and reviews/day as `<input type="number" min="0" max="999">`, and a "Show romaji for kana I haven't learned" checkbox;
  - **＋ Add card** and **My cards** buttons.
- **`#revStudy`:**
  - a top bar with a "← Decks" back button and "N left";
  - the card front;
  - a **Show answer** button;
  - after reveal, the back plus four buttons: `Again`, `Hard`, `Good` and `Easy`. Each shows `formatDelay(preview(...))` under its label.
  - When nothing is due: "All done for today 🎉" or "Next card in N min".
- **`#revEdit`:** a form with:
  - a type select (vocab, kanji or grammar);
  - the fields for that type: vocab — word, kana, English, Chinese and an optional example (jp, kana, en, zh); kanji — kanji, on, kun (comma-separated), English, Chinese; grammar — pattern, English, Chinese, notes and an optional example;
  - Save, Cancel and (when editing) Delete buttons.

  Validate the required fields per the spec and show an inline message if one is missing. Custom card ids are `Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`.
- **`#revList`:** the user's live custom cards, each with Edit and Delete, plus "← Decks".

**Rendering cards.** All Japanese text goes through one helper: when `srsSettings(state).showRomaji` is on, use `rubyHtml(text, knownKana())`; otherwise use the escaped text. Use it for the word, kana, examples and kanji example words.
- **Vocab recognition:** the front is the `word`, large. The back is the kana (with ruby), the pitch-accent mark (reuse the Words tab look: put the existing `CIRCLED`/`isHigh` pitch rendering in a small exported helper in app.js or a new `js/pitch.js` used by both, rather than copying it), EN · ZH, and the example (jp with ruby on its kana line, then en · zh).
- **Vocab production:** the front is EN · ZH ("How do you say…?"). The back is the word, its kana and the example.
- **Kanji:** the front is the kanji, very large. The back is EN · ZH, the on'yomi (labelled 音), the kun'yomi (labelled 訓), and the words.
- **Grammar:** the front is the pattern and the first example's `jp`. The back is EN · ZH, the notes and the examples.
- **🔊:** a button on the back reads the `kana` (or the example `kana` for grammar) with the existing `speak`.

**Interaction.**
- **Keys:** Space or Enter shows the answer; 1–4 rate. Only active while `#review` is the active view and the study panel is shown.
- **Rating:** `update((s, now) => recordReview(s, id, schedule(srsOf(s)[id] ?? null, rating, now)))`, then show the next card from a fresh `studyQueue`.
- **Interval previews:** computed from the current saved state.

**Navigation.**
- **Tab:** add a nav button `<button data-view="review"><span class="ico">🗂️</span><span class="lbl">Review</span><b class="badge" id="reviewBadge" hidden></b></button>` as the second tab.
- **Badge:** shows `deckCounts(...).total.due + total.fresh` when it is above 0.
- **When to update the badge:**
  - after every review;
  - in `applyRemote`;
  - on `visibilitychange`;
  - once a minute while the app is open, so learning cards become due. Use a single `setInterval` in app.js.

**CSS.**
- Card face: centred, with a large Japanese font. `ruby rt { font-size: .45em; color: var(--muted); }`.
- The four rating buttons sit in a grid in red / orange / green / blue tones.
- The badge is a small red pill on the nav button.
- Mobile: the six bottom tabs still fit at 375 px width (`font-size: 10px` for labels if needed). The rating buttons are at least 44 px tall.
- Use the existing CSS variables.

**XSS.** Custom card text is user input. Insert it only through `escape`/`rubyHtml`, never raw into `innerHTML`.

**Tests.** The UI has no unit tests. `node --check` every file, and run `npm test`.

**Commit** with the message "Add the Review tab: overview, study, add and edit cards".

---

### Task 10: Precache, polish and publish

- **Precache list:** add every new runtime file (`js/srs.js`, `js/romaji.js`, `js/cards.js`, `js/review.js`, `js/decks/*.js`, plus `js/pitch.js` if Task 9 created it) to `sw.js` `FILES`.
- **Precache test:** extend `test/sw.test.js` so its coverage check also scans `js/decks/`.
- **Version and tests:** run `npm run bump-sw`, then `npm test`.
- **Browser check:** if the Playwright browser is available, test at 390×844 and at 1280×800:
  - study a few cards: Show answer, Good, then Again;
  - add a custom card and then delete it;
  - romaji ruby appears over unlearned kana;
  - no console errors;
  - no horizontal overflow on mobile.
- **Merge and publish:** fast-forward `main` to `feature/srs`, push `main` to `origin` (github.com/yupeng9/hiragana), and confirm that the Pages build for the new commit reaches `built`.
