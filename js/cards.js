// The review card list: built-in decks plus the user's own cards, in introduction order.
// Pure: reads the state, never changes it.
import { VOCAB } from "./decks/vocab.js";
import { KANJI } from "./decks/kanji.js";
import { GRAMMAR } from "./decks/grammar.js";
import { srsSettings, srsOf, liveCustomCards } from "./store.js";
import { buildQueue } from "./srs.js";

const DECKS = ["vocab", "kanji", "grammar", "custom"];

// A vocab note is two cards, interleaved per word; production waits for recognition (`after`).
function vocabCards(deck, prefix, note) {
  const r = `${prefix}:r`;
  return [
    { id: r, deck, kind: "recognition", note },
    { id: `${prefix}:p`, deck, kind: "production", note, after: r },
  ];
}

// Custom cards per note, oldest first; each entry is that note's cards.
function customNotes(state) {
  const live = liveCustomCards(state).sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  return live.map(note => {
    const prefix = `c:${note.id}`;
    if (note.type === "vocab") return vocabCards("custom", prefix, note);
    if (note.type === "kanji") return [{ id: prefix, deck: "custom", kind: "kanji", note }];
    if (note.type === "grammar") return [{ id: prefix, deck: "custom", kind: "grammar", note }];
    return [];
  });
}

// Enabled decks interleaved one note at a time (vocab 1, kanji 1, grammar 1, custom 1, vocab 2, …),
// so new cards mix the decks; a deck that runs out is skipped.
export function allCards(state) {
  const on = new Set(srsSettings(state).decks);
  const decks = [
    on.has("vocab") ? VOCAB.map(n => vocabCards("vocab", `v:${n.word}`, n)) : [],
    on.has("kanji") ? KANJI.map(n => [{ id: `k:${n.kanji}`, deck: "kanji", kind: "kanji", note: n }]) : [],
    on.has("grammar") ? GRAMMAR.map(n => [{ id: `g:${n.id}`, deck: "grammar", kind: "grammar", note: n }]) : [],
    on.has("custom") ? customNotes(state) : [],
  ];
  const longest = Math.max(...decks.map(d => d.length));
  const out = [];
  for (let i = 0; i < longest; i++) for (const d of decks) if (i < d.length) out.push(...d[i]);
  return out;
}

export const studyQueue = (state, now) => buildQueue(allCards(state), srsOf(state), now, srsSettings(state));

// { [deck]: { due, fresh }, total: { due, fresh } }. A learning card is due once its time has come;
// a review card is due when buildQueue lists it for today; fresh is what buildQueue offers as new.
export function deckCounts(state, now) {
  const cards = allCards(state);
  const states = srsOf(state);
  const queue = buildQueue(cards, states, now, srsSettings(state));
  const deckOf = new Map(cards.map(c => [c.id, c.deck]));
  const counts = { total: { due: 0, fresh: 0 } };
  for (const d of DECKS) counts[d] = { due: 0, fresh: 0 };
  const add = (id, key) => { counts[deckOf.get(id)][key]++; counts.total[key]++; };
  for (const id of queue.learning) if (states[id].due <= now) add(id, "due");
  for (const id of queue.review) add(id, "due");
  for (const id of queue.fresh) add(id, "fresh");
  return counts;
}
