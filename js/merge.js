// Merges two progress states (see docs/superpowers/specs/2026-10-06-iphone-mac-sync-design.md).
// Most items carry a timestamp `t` and the newer one wins. A few are chosen differently:
// per kana, the stats entry with more answers wins (so a new device that answered once
// cannot overwrite a long history), per card the SRS entry with more reviews wins, and
// the best streak keeps the highest value since the last reset. merge is commutative, associative and idempotent,
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

// Entries and maps from a damaged or hand-edited file may be anything: a non-object
// (or an array) counts as absent, and a non-object map as {}.
const isRecord = v => !!v && typeof v === "object" && !Array.isArray(v);
const mapOf = v => (isRecord(v) ? v : {});
const entryOf = v => (isRecord(v) ? v : undefined);

function mergeMap(a, b, keep = () => true) {
  a = mapOf(a);
  b = mapOf(b);
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const entry = newer(entryOf(a[key]), entryOf(b[key]));
    if (entry && keep(entry)) out[key] = entry;
  }
  return out;
}

const countOf = (entry, field) => (Number.isFinite(entry?.[field]) ? entry[field] : 0);

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
  .filter(isRecord);

// Per-key "more work wins" maps (stats by `seen`, srs by `reps`): after dropping entries
// older than minT, the entry with the larger count wins; ties go to the newer t, then to
// the canonical JSON. For stats, an entry with fewer answers but a later t can outlive a
// reset that wipes the bigger, older one, so with keepLater such entries are kept in the
// merge-only `<field>Later` map to keep merge associative. Without a reset (srs), taking
// the maximum is already associative, so no `<field>Later` is read or written.
function mergeCounted(a, b, field, { count, minT, keepLater }) {
  const laterField = `${field}Later`;
  const sides = [a, b].map(s => ({ map: mapOf(s[field]), later: keepLater ? mapOf(s[laterField]) : {} }));
  const keys = new Set(sides.flatMap(s => [...Object.keys(s.map), ...Object.keys(s.later)]));
  const map = {};
  const later = {};
  for (const key of keys) {
    const candidates = sides
      .flatMap(s => recordsOf(s.map[key], s.later[key]))
      .filter(e => timeOf(e) >= minT);
    candidates.sort((x, y) =>
      countOf(y, count) - countOf(x, count) || timeOf(y) - timeOf(x) || compareCanonical(x, y));
    const [top, ...rest] = keepLater ? unbeaten(candidates) : candidates.slice(0, 1);
    if (top) map[key] = top;
    if (rest.length) later[key] = rest;
  }
  return {
    [field]: map,
    ...(Object.keys(later).length ? { [laterField]: later } : {}),
  };
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
  return {
    version: 2,
    settings: newer(a.settings, b.settings) ?? null,
    ...mergeCounted(a, b, "stats", { count: "seen", minT: resetAt, keepLater: true }),
    dictionary: mergeMap(a.dictionary, b.dictionary),
    // SRS progress is not cleared by a reset, so there is no reset filter.
    ...mergeCounted(a, b, "srs", { count: "reps", minT: 0, keepLater: false }),
    customCards: mergeMap(a.customCards, b.customCards),
    bestStreak,
    ...(later.length ? { bestStreakLater: later } : {}),
    resetAt,
  };
}
