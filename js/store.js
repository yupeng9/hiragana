// Local progress state: shape, persistence, v1 migration, and every mutation.
// Each mutation stamps the changed item with `t` so merge.js can sync it.
import { DEFAULT_ROWS, MAX_BOX } from "./data.js";

export const STORE_KEY = "hiragana-practice-v2";
export const LEGACY_KEY = "hiragana-practice-v1";
const UNSEEN = Object.freeze({ box: 0, seen: 0, correct: 0, t: 0 });

// Everything starts at t = 0, so a brand-new device never overrides synced progress.
export function emptyState() {
  return {
    version: 2,
    settings: { rows: [...DEFAULT_ROWS], mode: "type", autoSpeak: false, t: 0 },
    stats: {},
    dictionary: {},
    bestStreak: { value: 0, t: 0 },
    resetAt: 0,
  };
}

export function migrateV1(v1, now) {
  const s = emptyState();
  s.settings = {
    rows: v1.rows || [...DEFAULT_ROWS],
    mode: v1.mode || "type",
    autoSpeak: v1.autoSpeak ?? false,
    t: now,
  };
  for (const [kana, st] of Object.entries(v1.stats || {})) {
    s.stats[kana] = { box: st.box, seen: st.seen, correct: st.correct, t: now };
  }
  for (const [kana, savedAt] of Object.entries(v1.dictionary || {})) {
    s.dictionary[kana] = { t: savedAt, deleted: false };
  }
  s.bestStreak = { value: v1.bestStreak || 0, t: now };
  return s;
}

export function loadState(storage, now = Date.now()) {
  const v2 = storage.getItem(STORE_KEY);
  if (v2) return JSON.parse(v2);
  const v1 = storage.getItem(LEGACY_KEY);
  return v1 ? migrateV1(JSON.parse(v1), now) : emptyState();
}

export const saveState = (storage, state) => storage.setItem(STORE_KEY, JSON.stringify(state));

export const statOf = (state, kana) => state.stats[kana] || UNSEEN;

export const isSaved = (state, kana) => !!state.dictionary[kana] && !state.dictionary[kana].deleted;

export const savedWords = state => Object.entries(state.dictionary)
  .filter(([, entry]) => !entry.deleted)
  .sort((a, b) => b[1].t - a[1].t)
  .map(([kana, entry]) => ({ kana, t: entry.t }));

// Removing a word leaves a tombstone so the removal syncs to the other device.
export function toggleWord(state, kana, now) {
  state.dictionary[kana] = { t: now, deleted: isSaved(state, kana) };
}

export function recordAnswer(state, kana, ok, now) {
  const s = statOf(state, kana);
  state.stats[kana] = {
    box: ok ? Math.min(MAX_BOX, s.box + 1) : 0,
    seen: s.seen + 1,
    correct: s.correct + (ok ? 1 : 0),
    t: now,
  };
}

export function updateBest(state, streak, now) {
  if (streak > state.bestStreak.value) state.bestStreak = { value: streak, t: now };
}

export function setSettings(state, patch, now) {
  state.settings = { ...state.settings, ...patch, t: now };
}

export function resetProgress(state, now) {
  state.stats = {};
  state.bestStreak = { value: 0, t: now };
  delete state.bestStreakLater;
  state.resetAt = now;
}
