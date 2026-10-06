// Merges two progress states (see docs/superpowers/specs/2026-10-06-iphone-mac-sync-design.md).
// Most items carry a timestamp `t` and the newer one wins; the best streak keeps the
// highest value since the last reset. merge is commutative, associative and idempotent,
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

const valueOf = entry => (Number.isFinite(entry?.value) ? entry.value : 0);

// The best streak is a record: the highest value since the last reset wins, so it only
// goes down through a reset. A lower record with a later t can still matter, because it
// survives a reset that wipes out the higher but older one. So we keep every record that
// no other record beats on both value and t; the top one is `bestStreak` and the rest go
// in `bestStreakLater`. Without them, merging in a different order could lose a record.
function mergeBest(sides, resetAt) {
  const candidates = sides
    .flatMap(s => [s.bestStreak, ...(Array.isArray(s.bestStreakLater) ? s.bestStreakLater : [])])
    .filter(e => e && typeof e === "object" && timeOf(e) >= resetAt);
  candidates.push({ value: 0, t: resetAt });
  candidates.sort((x, y) =>
    valueOf(y) - valueOf(x) || timeOf(y) - timeOf(x) ||
    (canonical(y) > canonical(x) ? 1 : canonical(y) < canonical(x) ? -1 : 0));
  const kept = [];
  let latest = -Infinity;
  for (const e of candidates) {
    if (timeOf(e) > latest) {
      kept.push(e);
      latest = timeOf(e);
    }
  }
  return { bestStreak: kept[0], later: kept.slice(1) };
}

export function merge(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
  const { bestStreak, later } = mergeBest([a, b], resetAt);
  return {
    version: 2,
    settings: newer(a.settings, b.settings) ?? null,
    stats: mergeMap(a.stats, b.stats, s => timeOf(s) >= resetAt),
    dictionary: mergeMap(a.dictionary, b.dictionary),
    bestStreak,
    ...(later.length ? { bestStreakLater: later } : {}),
    resetAt,
  };
}
