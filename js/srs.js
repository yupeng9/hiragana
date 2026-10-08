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
