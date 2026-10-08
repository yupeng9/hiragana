import { test } from "node:test";
import assert from "node:assert/strict";
import { allCards, deckCounts, studyQueue } from "../js/cards.js";
import { emptyState, saveCustomCard, deleteCustomCard, setSrsSettings, recordReview } from "../js/store.js";
import { schedule, GOOD, DAY, MINUTE } from "../js/srs.js";
import { VOCAB } from "../js/decks/vocab.js";
import { KANJI } from "../js/decks/kanji.js";
import { GRAMMAR } from "../js/decks/grammar.js";

const NOW = new Date(2026, 9, 7, 10, 0).getTime();

test("built-in decks are interleaved one note at a time, vocab recognition and production together", () => {
  const cards = allCards(emptyState());
  const w = VOCAB[0].word, w2 = VOCAB[1].word;
  assert.deepEqual(cards.slice(0, 9).map(c => c.id), [
    `v:${w}:r`, `v:${w}:p`, `k:${KANJI[0].kanji}`, `g:${GRAMMAR[0].id}`,
    `v:${w2}:r`, `v:${w2}:p`, `k:${KANJI[1].kanji}`, `g:${GRAMMAR[1].id}`, `v:${VOCAB[2].word}:r`]);
  assert.deepEqual(cards[0], { id: `v:${w}:r`, deck: "vocab", kind: "recognition", note: VOCAB[0] });
  assert.deepEqual(cards[1], { id: `v:${w}:p`, deck: "vocab", kind: "production", note: VOCAB[0], after: `v:${w}:r` });
  const k = cards.find(c => c.deck === "kanji");
  assert.deepEqual(k, { id: `k:${KANJI[0].kanji}`, deck: "kanji", kind: "kanji", note: KANJI[0] });
  const g = cards.find(c => c.deck === "grammar");
  assert.deepEqual(g, { id: `g:${GRAMMAR[0].id}`, deck: "grammar", kind: "grammar", note: GRAMMAR[0] });
  assert.equal(cards.length, VOCAB.length * 2 + KANJI.length + GRAMMAR.length);
  // Decks that run out are skipped: the tail is vocabulary only.
  assert.ok(cards.slice(-10).every(c => c.deck === "vocab"));
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
});

test("custom cards take their turn after grammar, oldest first, with ids by type", () => {
  const s = emptyState();
  saveCustomCard(s, { id: "b", type: "kanji", kanji: "猫" }, 200);
  saveCustomCard(s, { id: "a", type: "vocab", word: "犬", kana: "いぬ" }, 100);
  saveCustomCard(s, { id: "c", type: "grammar", pattern: "〜ね" }, 300);
  const custom = allCards(s).filter(c => c.deck === "custom");
  assert.deepEqual(custom.map(c => c.id), ["c:a:r", "c:a:p", "c:b", "c:c"]);
  assert.deepEqual(custom.map(c => c.kind), ["recognition", "production", "kanji", "grammar"]);
  assert.equal(custom[1].after, "c:a:r");
  assert.equal(custom[0].note.word, "犬");
  const ids = allCards(s).map(c => c.id);
  assert.deepEqual(ids.slice(4, 6), ["c:a:r", "c:a:p"]);
  assert.equal(ids[10], "c:b");
});

test("a disabled deck is excluded", () => {
  const s = emptyState();
  setSrsSettings(s, { decks: ["kanji"] }, 1);
  const cards = allCards(s);
  assert.ok(cards.length > 0 && cards.every(c => c.deck === "kanji"));
});

test("a deleted custom card is excluded", () => {
  const s = emptyState();
  saveCustomCard(s, { id: "a", type: "vocab", word: "犬", kana: "いぬ" }, 100);
  saveCustomCard(s, { id: "b", type: "kanji", kanji: "猫" }, 200);
  deleteCustomCard(s, "a", 300);
  assert.deepEqual(allCards(s).filter(c => c.deck === "custom").map(c => c.id), ["c:b"]);
});

test("production cards wait for their recognition sibling to graduate", () => {
  const s = emptyState();
  setSrsSettings(s, { decks: ["vocab"], newPerDay: 5 }, 1);
  const w = VOCAB[0].word;
  assert.deepEqual(studyQueue(s, NOW).fresh.slice(0, 2), [`v:${w}:r`, `v:${VOCAB[1].word}:r`]);
  assert.ok(!studyQueue(s, NOW).fresh.includes(`v:${w}:p`));
  const grad = schedule(schedule(null, GOOD, NOW - 2 * DAY), GOOD, NOW - 2 * DAY + 10 * MINUTE);
  recordReview(s, `v:${w}:r`, { ...grad, t: NOW });
  assert.ok(studyQueue(s, NOW).fresh.includes(`v:${w}:p`));
});

test("counts: due is learning cards due now plus reviews due today; fresh is grouped by deck", () => {
  const s = emptyState();
  setSrsSettings(s, { newPerDay: 3 }, 1);
  saveCustomCard(s, { id: "a", type: "vocab", word: "犬", kana: "いぬ" }, 100);
  const day = new Date(2026, 9, 1, 9, 0).getTime();
  const review = { phase: "review", step: 0, interval: 3, ease: 2.5, reps: 3, lapses: 0, first: day, last: day, due: NOW - DAY };
  const learning = { phase: "learning", step: 0, interval: 0, ease: 2.5, reps: 1, lapses: 0, first: day, last: day };
  recordReview(s, `v:${VOCAB[0].word}:r`, { ...review, t: 1 });
  recordReview(s, `v:${VOCAB[1].word}:r`, { ...learning, due: NOW - MINUTE, t: 1 });
  recordReview(s, `v:${VOCAB[2].word}:r`, { ...learning, due: NOW + 5 * MINUTE, t: 1 });
  recordReview(s, `k:${KANJI[0].kanji}`, { ...review, due: NOW + 3 * DAY, t: 1 });
  recordReview(s, `g:${GRAMMAR[0].id}`, { ...review, due: NOW + 2 * DAY, t: 1 });
  const c = deckCounts(s, NOW);
  // fresh, in order: VOCAB[0]'s production (its recognition has graduated), custom 犬, KANJI[1]
  assert.deepEqual(c.vocab, { due: 2, fresh: 1 });
  assert.deepEqual(c.kanji, { due: 0, fresh: 1 });
  assert.deepEqual(c.grammar, { due: 0, fresh: 0 });
  assert.deepEqual(c.custom, { due: 0, fresh: 1 });
  assert.deepEqual(c.total, { due: 2, fresh: 3 });
});

test("counts: the daily new limit is shared across decks, and disabled decks show zero", () => {
  const s = emptyState();
  setSrsSettings(s, { newPerDay: 2, decks: ["kanji", "grammar"] }, 1);
  const c = deckCounts(s, NOW);
  assert.deepEqual(c.kanji, { due: 0, fresh: 1 });
  assert.deepEqual(c.grammar, { due: 0, fresh: 1 });
  assert.deepEqual(c.vocab, { due: 0, fresh: 0 });
  assert.deepEqual(c.total, { due: 0, fresh: 2 });
});

test("new cards mix the decks: with 3 new a day they come from three different decks", () => {
  const s = emptyState();
  setSrsSettings(s, { newPerDay: 3 }, 1);
  const fresh = studyQueue(s, NOW).fresh;
  const deckOf = new Map(allCards(s).map(c => [c.id, c.deck]));
  assert.equal(fresh.length, 3);
  assert.equal(new Set(fresh.map(id => deckOf.get(id))).size, 3);
});
