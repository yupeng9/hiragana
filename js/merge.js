// Merges two progress states (see docs/superpowers/specs/2026-10-06-iphone-mac-sync-design.md).
// Every item carries a timestamp `t`; the newer one wins. merge is commutative and
// idempotent, so devices that sync in any order end up with the same state.

// JSON with sorted keys, so equal states always produce equal strings.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Newer t wins; on a tie, compare canonical JSON so both devices pick the same entry.
function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.t !== b.t) return a.t > b.t ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

function mergeMap(a = {}, b = {}, keep = () => true) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const entry = newer(a[key], b[key]);
    if (keep(entry)) out[key] = entry;
  }
  return out;
}

export function merge(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
  const best = newer(a.bestStreak, b.bestStreak);
  return {
    version: 2,
    settings: newer(a.settings, b.settings),
    stats: mergeMap(a.stats, b.stats, s => s.t >= resetAt),
    dictionary: mergeMap(a.dictionary, b.dictionary),
    bestStreak: best.t >= resetAt ? best : { value: 0, t: resetAt },
    resetAt,
  };
}
