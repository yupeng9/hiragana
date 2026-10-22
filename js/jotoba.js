// Online Japanese dictionary lookup (Jotoba) for the Add word form. Only the typed query is sent.
// Chinese is not available from this source; the pitch number is given only when the pattern
// settles it (see accentFromPitch).
import { morae } from "./pitch.js";

const URL = "https://jotoba.de/api/search/words";
const MAX_RESULTS = 5;
const MAX_GLOSSES = 3;
const cache = new Map();

// Jotoba gives the pitch as parts with a high/low flag. A drop inside the word fixes the accent
// number. A word that rises and stays high looks the same whether it is flat (0) or drops only on
// the following particle (last mora), so those return null and the learner decides.
export function accentFromPitch(pitch, kana) {
  if (!Array.isArray(pitch) || pitch.length === 0) return null;
  if (pitch.some(p => !p || typeof p.part !== "string")) return null;
  if (pitch.map(p => p.part).join("") !== kana) return null;
  const flags = pitch.flatMap(p => morae(p.part).map(() => Boolean(p.high)));
  if (flags.length !== morae(kana).length) return null;
  for (let i = 0; i + 1 < flags.length; i++) if (flags[i] && !flags[i + 1]) return i + 1;
  return null;
}

function candidatesFrom(data) {
  const out = [], seen = new Set();
  for (const w of Array.isArray(data?.words) ? data.words : []) {
    const kana = w?.reading?.kana;
    if (typeof kana !== "string" || !kana) continue;
    const kanji = typeof w.reading.kanji === "string" ? w.reading.kanji : "";
    const glosses = [];
    for (const sense of Array.isArray(w.senses) ? w.senses : []) {
      if (sense?.language && sense.language !== "English") continue;
      for (const g of Array.isArray(sense?.glosses) ? sense.glosses : []) {
        if (typeof g === "string" && g && !glosses.includes(g) && glosses.length < MAX_GLOSSES) glosses.push(g);
      }
    }
    if (!glosses.length) continue;
    const word = kanji || kana, key = `${word}|${kana}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, word, kana, en: glosses.join("; "), zh: "", accent: accentFromPitch(w.pitch, kana), source: "dictionary" });
    if (out.length === MAX_RESULTS) break;
  }
  return out;
}

const fail = (message, aborted = false) => Object.assign(new Error(message), { aborted });

// Resolves to up to 5 candidates, or rejects with an Error whose message is fit to show.
// `signal` lets the caller cancel (the error then has aborted === true).
export async function searchJotoba(query, { fetchFn = (...a) => fetch(...a), timeoutMs = 6000, signal } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return [];
  if (cache.has(q)) return cache.get(q);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const relay = () => ctl.abort();
  signal?.addEventListener("abort", relay);
  try {
    let res;
    try {
      res = await fetchFn(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, language: "English", no_english: false }),
        signal: ctl.signal,
      });
    } catch {
      if (signal?.aborted) throw fail("The lookup was cancelled.", true);
      throw fail(ctl.signal.aborted ? "The dictionary took too long to answer." : "Couldn't reach the dictionary.");
    }
    if (!res.ok) throw fail(`The dictionary answered with an error (${res.status}).`);
    let data;
    try { data = await res.json(); } catch {
      if (signal?.aborted) throw fail("The lookup was cancelled.", true);
      throw fail(ctl.signal.aborted ? "The dictionary took too long to answer." : "The dictionary sent an unreadable answer.");
    }
    const found = candidatesFrom(data);
    cache.set(q, found);
    return found;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}
