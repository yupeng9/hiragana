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
  const step = Math.min(Math.max(0, Number.isInteger(c.step) ? c.step : 0), steps.length - 1);
  const atStep = (s, minutes = steps[s]) => ({ ...c, phase: relearning ? "relearning" : "learning", step: s,
    due: now + minutes * MINUTE });
  if (rating === AGAIN) return atStep(0);
  if (rating === HARD) {   // like Anki: first step waits between the two steps; a lone step is stretched 1.5x
    const minutes = step > 0 ? steps[step] : steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5;
    return atStep(step, minutes);
  }
  if (rating === GOOD && step + 1 < steps.length) return atStep(step + 1);
  const days = relearning ? Math.max(1, Number.isFinite(c.interval) ? c.interval : 1) + (rating === EASY ? 1 : 0)
    : rating === EASY ? EASY_DAYS : GRADUATE_DAYS;
  return { ...c, phase: "review", step: 0, interval: days, due: now + days * DAY };
}

// Intervals use Math.round (Anki truncates). Each button is at least a day longer than the one
// before it, except at the 100-year cap, where Good and Easy (or Hard and Good) can tie.
function reviewCard(c, rating, now) {
  const ease = Number.isFinite(c.ease) ? c.ease : START_EASE;
  const interval = Math.max(1, Number.isFinite(c.interval) ? c.interval : 1);
  if (rating === AGAIN) {
    return { ...c, phase: "relearning", step: 0, lapses: (c.lapses || 0) + 1, interval: 1,
      ease: round2(Math.max(MIN_EASE, ease - 0.2)), due: now + RELEARN_STEPS[0] * MINUTE };
  }
  const cap = d => Math.min(MAX_DAYS, d);
  const hard = cap(Math.max(interval + 1, Math.round(interval * HARD_FACTOR)));
  const good = cap(Math.max(hard + 1, Math.round(interval * ease)));
  const easy = cap(Math.max(good + 1, Math.round(interval * ease * EASY_BONUS)));
  const [next, nextEase] = rating === HARD ? [hard, Math.max(MIN_EASE, ease - 0.15)]
    : rating === GOOD ? [good, ease] : [easy, ease + 0.15];
  return { ...c, interval: next, ease: round2(nextEase), due: now + next * DAY };
}

// Delay until the card would come back for each button [Again, Hard, Good, Easy].
export const preview = (card, now) => [AGAIN, HARD, GOOD, EASY].map(r => schedule(card, r, now).due - now);

export function formatDelay(ms) {
  // Round within each unit and move up a unit when the rounded value would reach the next one.
  const min = ms / MINUTE, hours = min / 60, days = ms / DAY, months = Math.round(days / 30 * 10) / 10;
  if (min < 59.5) return `${Math.max(1, Math.round(min))}m`;
  if (hours < 23.5) return `${Math.round(hours)}h`;
  if (days < 29.5) return `${Math.round(days)}d`;
  if (months < 12) return `${months}mo`;
  return `${Math.round(days / 365 * 10) / 10}y`;
}

// Start of the study day (04:00 local, like Anki).
export function dayStart(now) {
  const d = new Date(now);
  if (d.getHours() < DAY_CUTOFF_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_CUTOFF_HOUR, 0, 0, 0);
  return d.getTime();
}

// Start of the next study day. Built from calendar fields so a 23/25-hour DST day is still right.
export function nextDayStart(now) {
  const d = new Date(dayStart(now));
  d.setDate(d.getDate() + 1);
  d.setHours(DAY_CUTOFF_HOUR, 0, 0, 0);
  return d.getTime();
}

// cards: [{ id, after? }] in introduction order; states: { [id]: saved state }.
// `after` names a sibling that must have graduated before this card is introduced.
export function buildQueue(cards, states, now, { newPerDay, reviewsPerDay }) {
  const start = dayStart(now), end = nextDayStart(now);
  // Only cards that still exist use up today's limits. A card first seen today is "new"; any other
  // card rated today is a "review", whatever phase it is in now.
  let newToday = 0, reviewsToday = 0;
  for (const { id } of cards) {
    const s = states[id];
    if (!s) continue;
    if (s.first >= start) newToday++;
    else if (s.last >= start) reviewsToday++;
  }
  const dueOf = id => Number.isFinite(states[id]?.due) ? states[id].due : 0;   // no due = due now
  const learning = [], review = [], fresh = [];
  for (const { id, after } of cards) {
    const s = states[id];
    if (!s) { if (!after || states[after]?.phase === "review") fresh.push(id); }
    else if (s.phase === "review") { if (dueOf(id) < end) review.push(id); }
    else learning.push(id);
  }
  const byDue = (x, y) => dueOf(x) - dueOf(y);
  return {
    learning: learning.sort(byDue),
    review: review.sort(byDue).slice(0, Math.max(0, reviewsPerDay - reviewsToday)),
    fresh: fresh.slice(0, Math.max(0, newPerDay - newToday)),
  };
}

// The card to show now, or how long until a learning card is due. Like Anki: learning cards due
// now, then reviews, then new cards, and only then learning cards due within the learn-ahead window.
export function nextCardId(queue, states, now) {
  const ready = (id, t) => Number.isFinite(states[id]?.due) && states[id].due <= t;
  const id = queue.learning.find(i => ready(i, now)) ?? queue.review[0] ?? queue.fresh[0]
    ?? queue.learning.find(i => ready(i, now + LEARN_AHEAD)) ?? null;
  const dues = queue.learning.map(i => states[i]?.due).filter(Number.isFinite);
  const waitUntil = id === null && dues.length ? Math.min(...dues) : null;
  return { id, waitUntil };
}
