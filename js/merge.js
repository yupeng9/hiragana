// Merges two progress states (see docs/superpowers/specs/2026-10-06-iphone-mac-sync-design.md).
// Most items carry a timestamp `t` and the newer one wins. Two items are chosen differently:
// per kana, the stats entry with more answers wins (so a new device that answered once
// cannot overwrite a long history), and the best streak keeps the highest value since the
// last reset. merge is commutative, associative and idempotent,
// so devices that sync in any order end up with the same state.
// Callers must treat the result as read-only: its entries are shared with the inputs.

// JSON with sorted keys, so equal states always produce equal strings.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// A missing or non-numeric t counts as 0.
const timeOf = entry => (Number.isFinite(entry?.t) ? entry.t : 0);

// Newer t wins; on a tie, compare canonical JSON so both devices pick the same entry.
function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta !== tb) return ta > tb ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

function mergeMap(a, b, keep = () => true) {
  a = a ?? {};
  b = b ?? {};
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const entry = newer(a[key], b[key]);
    if (keep(entry)) out[key] = entry;
  }
  return out;
}

const seenOf = entry => (Number.isFinite(entry?.seen) ? entry.seen : 0);

const compareCanonical = (x, y) => (canonical(y) > canonical(x) ? 1 : canonical(y) < canonical(x) ? -1 : 0);

// From entries sorted best first, keep those that no earlier entry beats on t as well.
function unbeaten(sorted) {
  const kept = [];
  let latest = -Infinity;
  for (const e of sorted) {
    if (timeOf(e) > latest) {
      kept.push(e);
      latest = timeOf(e);
    }
  }
  return kept;
}

const recordsOf = (entry, later) => [entry, ...(Array.isArray(later) ? later : [])]
  .filter(e => e && typeof e === "object");

// Stats: after dropping entries older than the reset, the entry with more answers wins;
// ties go to the newer t, then to the canonical JSON. As with the best streak, an entry
// with fewer answers but a later t can outlive a reset that wipes the bigger, older one,
// so such entries are kept in `statsLater` (merge-only, optional) to keep merge associative.
function mergeStats(a, b, resetAt) {
  const sides = [a, b].map(s => ({ stats: s.stats ?? {}, later: s.statsLater ?? {} }));
  const keys = new Set(sides.flatMap(s => [...Object.keys(s.stats), ...Object.keys(s.later)]));
  const stats = {};
  const statsLater = {};
  for (const key of keys) {
    const candidates = sides
      .flatMap(s => recordsOf(s.stats[key], s.later[key]))
      .filter(e => timeOf(e) >= resetAt);
    candidates.sort((x, y) =>
      seenOf(y) - seenOf(x) || timeOf(y) - timeOf(x) || compareCanonical(x, y));
    const [top, ...rest] = unbeaten(candidates);
    if (top) stats[key] = top;
    if (rest.length) statsLater[key] = rest;
  }
  return { stats, statsLater };
}

const valueOf = entry => (Number.isFinite(entry?.value) ? entry.value : 0);

// The best streak is a record: the highest value since the last reset wins, so it only
// goes down through a reset. A lower record with a later t can still matter, because it
// survives a reset that wipes out the higher but older one. So we keep every record that
// no other record beats on both value and t; the top one is `bestStreak` and the rest go
// in `bestStreakLater`. Without them, merging in a different order could lose a record.
function mergeBest(sides, resetAt) {
  const candidates = sides
    .flatMap(s => recordsOf(s.bestStreak, s.bestStreakLater))
    .filter(e => timeOf(e) >= resetAt);
  candidates.push({ value: 0, t: resetAt });
  candidates.sort((x, y) =>
    valueOf(y) - valueOf(x) || timeOf(y) - timeOf(x) ||
    compareCanonical(x, y));
  const kept = unbeaten(candidates);
  return { bestStreak: kept[0], later: kept.slice(1) };
}

export function merge(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
  const { bestStreak, later } = mergeBest([a, b], resetAt);
  const { stats, statsLater } = mergeStats(a, b, resetAt);
  return {
    version: 2,
    settings: newer(a.settings, b.settings) ?? null,
    stats,
    ...(Object.keys(statsLater).length ? { statsLater } : {}),
    dictionary: mergeMap(a.dictionary, b.dictionary),
    bestStreak,
    ...(later.length ? { bestStreakLater: later } : {}),
    resetAt,
  };
}
