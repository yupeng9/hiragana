import { ROWS, ALL, WORDS, MAX_BOX } from "./data.js";
import {
  loadState, saveState, statOf, isSaved, savedWords, toggleWord, recordAnswer,
  updateBest, setSettings, resetProgress, activeRows, activeMode,
} from "./store.js";
import { merge, canonical } from "./merge.js";
import { GistClient, Syncer, connect, loadConfig, saveConfig, clearConfig } from "./sync.js";

let state = loadState(localStorage);
saveState(localStorage, state);  // persists a v1 → v2 migration straight away

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pool = () => ALL.filter(c => activeRows(state).includes(c.row));

// Save locally, then sync a few seconds later.
function persist() {
  saveState(localStorage, state);
  syncer?.schedule();
}

function usableWords() {
  const known = new Set(pool().map(c => c.kana));
  return WORDS.filter(w => [...w.kana].every(ch => known.has(ch)));
}
const wordsWith = (kana, limit) => shuffle(usableWords().filter(w => w.kana.includes(kana))).slice(0, limit);

const starHtml = kana => {
  const on = isSaved(state, kana);
  return `<button class="star ${on ? "on" : ""}" data-save="${kana}" title="Save to my dictionary">${on ? "★" : "☆"}</button>`;
};

const CIRCLED = "⓪①②③④⑤⑥⑦⑧⑨";

// Which morae are high in Tokyo pitch accent: 0 = low-high-high…, 1 = high-low-low…,
// n ≥ 2 = low, high up to mora n, then low.
const isHigh = (i, accent) => accent === 0 ? i > 0 : accent === 1 ? i === 0 : i > 0 && i < accent;

function accentTitle(w) {
  const n = [...w.kana].length;
  const how = w.accent === 0 ? "flat: starts low, rises, never drops"
    : w.accent === n ? "rises, drops right after the word (on a following particle)"
    : `pitch drops after mora ${w.accent}`;
  return `Pitch accent ${w.accent}: ${how}. ${n} mora${n > 1 ? "e" : ""}.`;
}

// opts.highlight: kana to highlight. opts.hidden: during a question, hide whatever would give
// the answer away — the target kana becomes "？" in pick mode, the romaji is hidden in type mode.
function wordHtml(w, { highlight, hidden } = {}) {
  const kana = [...w.kana].map((ch, i) => {
    const shown = ch !== highlight ? ch : hidden === "kana" ? `<mark>？</mark>` : `<mark>${ch}</mark>`;
    const cls = (isHigh(i, w.accent) ? " hi" : "") + (i === w.accent - 1 ? " drop" : "");
    return `<span class="m${cls}">${shown}</span>`;
  }).join("") + `<span class="acc" title="${accentTitle(w)}">${CIRCLED[w.accent]}</span>`;
  const romaji = hidden ? "answer to reveal" : `${w.romaji} 🔊`;
  return `<div class="word ${hidden ? "locked" : ""}" ${hidden ? "" : `data-say="${w.kana}" title="Click to hear"`}>
    ${starHtml(w.kana)}
    <span class="wk">${kana}</span>${w.kanji && hidden !== "kana" ? `<span class="wj">${w.kanji}</span>` : ""}
    <span class="wr">${romaji}</span>
    <span class="wt">${w.en} <span>· ${w.zh}</span></span>
  </div>`;
}

function examplesHtml(kana, words, hidden) {
  if (!words.length) return `<p class="muted">No example words for this character with your current practice set yet.</p>`;
  const title = hidden ? "Words with this character" : `Words with ${kana} — click to hear, ☆ to save`;
  return `<h3>${title}</h3><div class="word-list">${words.map(w => wordHtml(w, { highlight: kana, hidden })).join("")}</div>`;
}

const refreshStars = () =>
  document.querySelectorAll("[data-save]").forEach(b => b.outerHTML = starHtml(b.dataset.save));

function toggleSaved(kana) {
  toggleWord(state, kana, Date.now());
  persist();
  refreshStars();
  if ($("dictionary").classList.contains("active")) renderDictionary();
}

// ☆ buttons save words; any other element with data-say speaks its text when clicked.
document.addEventListener("click", e => {
  const star = e.target.closest("[data-save]");
  if (star) { toggleSaved(star.dataset.save); return; }
  const el = e.target.closest("[data-say]");
  if (el) speak(el.dataset.say);
});

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.8;
  const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith("ja"));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// Leitner-style weighting: characters in lower boxes (weaker) come up far more often.
let lastKana = null;
function pickCard() {
  const p = pool();
  const candidates = p.length > 1 ? p.filter(c => c.kana !== lastKana) : p;
  const weights = candidates.map(c => 2 ** (MAX_BOX - statOf(state, c.kana).box));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// ---------- Practice ----------
const session = { correct: 0, total: 0, streak: 0 };
let current = null, answered = false, currentMode = null, currentWords = [];

function renderRowToggles() {
  $("rowToggles").innerHTML = ROWS.map(r => {
    const on = activeRows(state).includes(r.id);
    const sample = r.chars.find(Boolean)[0];
    return `<label class="${on ? "on" : ""}"><input type="checkbox" value="${r.id}" ${on ? "checked" : ""}>${sample} ${r.label}</label>`;
  }).join("");
  $("rowToggles").querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
    const sel = [...$("rowToggles").querySelectorAll("input:checked")].map(i => i.value);
    if (sel.length === 0) { inp.checked = true; return; }  // keep at least one row
    setSettings(state, { rows: sel }, Date.now());
    persist();
    renderRowToggles();
    renderChart();
    nextCard();
  }));
}

function nextCard() {
  current = pickCard();
  lastKana = current.kana;
  answered = false;
  const mode = activeMode(state);
  currentMode = mode === "mixed" ? (Math.random() < 0.5 ? "type" : "pick") : mode;
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("nextBtn").style.display = "none";

  const prompt = $("prompt");
  if (currentMode === "type") {
    $("hint").textContent = "How do you read this?";
    prompt.textContent = current.kana;
    prompt.className = "prompt";
    $("answerArea").innerHTML = `<input class="answer-input" id="answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="romaji">`;
    const input = $("answer");
    input.focus();
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !answered && input.value.trim()) {
        // preventDefault stops this Enter from also "clicking" the Next button once it has focus
        e.preventDefault(); e.stopPropagation(); checkTyped(input.value);
      }
    });
  } else {
    $("hint").textContent = "Which kana is this?";
    prompt.textContent = current.romaji;
    prompt.className = "prompt romaji";
    const others = shuffle(pool().filter(c => c.kana !== current.kana)).slice(0, 3);
    const options = shuffle([current, ...others]);
    $("answerArea").innerHTML = `<div class="choices">${options.map((o, i) =>
      `<button data-kana="${o.kana}"><small>${i + 1}</small>${o.kana}</button>`).join("")}</div>`;
    $("answerArea").querySelectorAll("button").forEach(b =>
      b.addEventListener("click", () => checkPicked(b.dataset.kana)));
  }
  // Show example words right away, hiding the part that would give away the answer.
  currentWords = wordsWith(current.kana, 3);
  $("examples").innerHTML = examplesHtml(current.kana, currentWords, currentMode === "type" ? "romaji" : "kana");
}

function checkTyped(value) {
  const ok = current.accepted.includes(value.trim().toLowerCase());
  $("answer").disabled = true;
  grade(ok);
}

function checkPicked(kana) {
  if (answered) return;
  const ok = kana === current.kana;
  $("answerArea").querySelectorAll("button").forEach(b => {
    b.disabled = true;
    if (b.dataset.kana === current.kana) b.classList.add("correct");
    else if (b.dataset.kana === kana) b.classList.add("wrong");
  });
  if (!ok) {
    const picked = ALL.find(c => c.kana === kana);
    $("hint").textContent = `${picked.kana} is "${picked.romaji}"`;
  }
  grade(ok);
}

function grade(ok) {
  answered = true;
  const now = Date.now();
  recordAnswer(state, current.kana, ok, now);
  session.total++;
  if (ok) {
    session.correct++;
    session.streak++;
    updateBest(state, session.streak, now);
  } else {
    session.streak = 0;
  }
  persist();

  const fb = $("feedback");
  fb.className = "feedback " + (ok ? "good" : "bad");
  fb.textContent = ok
    ? `Correct! ${current.kana} = ${current.romaji}`
    : `Not quite — ${current.kana} is "${current.romaji}"`;
  if (state.settings.autoSpeak) speak(current.kana);

  $("sCorrect").textContent = session.correct;
  $("sTotal").textContent = session.total;
  $("sStreak").textContent = session.streak;
  $("sBest").textContent = state.bestStreak.value;

  // Stay on the card so the example words can be read; Enter / Next moves on.
  $("examples").innerHTML = examplesHtml(current.kana, currentWords);
  $("nextBtn").style.display = "";
  document.activeElement?.blur();
}

document.addEventListener("keydown", e => {
  if (!$("practice").classList.contains("active")) return;
  if (answered && e.key === "Enter") { e.preventDefault(); nextCard(); return; }
  if (!answered && currentMode === "pick" && /^[1-4]$/.test(e.key)) {
    const btn = $("answerArea").querySelectorAll("button")[+e.key - 1];
    if (btn) btn.click();
  }
});

$("nextBtn").addEventListener("click", nextCard);
$("speakBtn").addEventListener("click", () => current && speak(current.kana));
$("mode").addEventListener("change", e => { setSettings(state, { mode: e.target.value }, Date.now()); persist(); nextCard(); });
$("autoSpeak").addEventListener("change", e => { setSettings(state, { autoSpeak: e.target.checked }, Date.now()); persist(); });

// ---------- Chart & Progress ----------
function gridHtml(cellFn) {
  const vowels = ["a", "i", "u", "e", "o"];
  return `<table class="chart"><tr><th></th>${vowels.map(v => `<th>${v}</th>`).join("")}</tr>` +
    ROWS.map(r => `<tr><th>${r.label}</th>${r.chars.map(c => c ? cellFn(ALL.find(x => x.kana === c[0])) : `<td class="cell empty"></td>`).join("")}</tr>`).join("") +
    `</table>`;
}

function renderChart() {
  $("chartTable").innerHTML = gridHtml(c =>
    `<td class="cell ${activeRows(state).includes(c.row) ? "" : "off"}" data-kana="${c.kana}"><span class="k">${c.kana}</span><span class="r">${c.accepted.join(" / ")}</span></td>`);
  $("chartTable").querySelectorAll("td[data-kana]").forEach(td =>
    td.addEventListener("click", () => {
      speak(td.dataset.kana);
      $("chartWords").innerHTML = examplesHtml(td.dataset.kana, wordsWith(td.dataset.kana, 6));
    }));
  $("chartWords").innerHTML = "";
}

function renderWords() {
  const words = usableWords().sort((a, b) => a.kana.localeCompare(b.kana, "ja"));
  $("wordsInfo").textContent = `${words.length} words you can read with your practice set. Click a word to hear it, ☆ to save it — enable more rows to unlock more. The circled number is the pitch accent: the line over the kana shows high pitch, and the tick marks where it drops (⓪ = never drops).`;
  $("wordsList").innerHTML = words.map(w => wordHtml(w)).join("");
}

function renderDictionary() {
  const entries = savedWords(state);
  $("dictInfo").textContent = entries.length
    ? `${entries.length} saved word${entries.length > 1 ? "s" : ""}, newest first. Click to hear, ★ to remove.`
    : "Your dictionary is empty. Click ☆ on any word to save it here.";
  $("dictList").innerHTML = entries.map(({ kana, t }) => {
    const w = WORDS.find(x => x.kana === kana);
    return w ? wordHtml(w).replace("</div>", `<span class="wd">saved ${new Date(t).toLocaleDateString()}</span></div>`) : "";
  }).join("");
}

function renderProgress() {
  $("progressTable").innerHTML = gridHtml(c => {
    const s = state.stats[c.kana];
    const level = !s || s.seen === 0 ? 0 : 1 + Math.min(4, s.box);
    const acc = s && s.seen ? `${Math.round(100 * s.correct / s.seen)}% · ${s.seen}×` : "—";
    return `<td class="cell m${level} ${activeRows(state).includes(c.row) ? "" : "off"}"><span class="k">${c.kana}</span><span class="r">${acc}</span></td>`;
  });
  const st = kana => statOf(state, kana);
  const weak = pool()
    .filter(c => st(c.kana).seen)
    .sort((a, b) => st(a.kana).box - st(b.kana).box ||
                    st(a.kana).correct / st(a.kana).seen - st(b.kana).correct / st(b.kana).seen)
    .slice(0, 5);
  $("weakList").innerHTML = weak.length
    ? `<p class="muted">Needs the most practice:</p>${weak.map(c => `<span title="${c.romaji}">${c.kana}</span>`).join("")}`
    : `<p class="muted">Practice a bit and your weakest characters will show up here.</p>`;
}

$("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset all progress on all your devices? Saved words are kept. This cannot be undone.")) return;
  resetProgress(state, Date.now());
  persist();
  $("sBest").textContent = 0;
  renderProgress();
});

// ---------- Sync ----------
let syncer = null;

const STATUS_TEXT = {
  off: () => "Sync not set up",
  syncing: () => "Syncing…",
  ok: s => `Synced ${s.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  offline: () => "Offline — will sync later",
  error: s => `Sync error: ${s.message}`,
};

function showStatus(status) {
  const text = STATUS_TEXT[status.kind](status);
  $("syncBadge").dataset.kind = status.kind;
  $("syncBadge").title = text;
  $("syncStatus").textContent = text;
}

// Merge what the gist had into whatever is local *now* (the user may have changed
// something while the request was in flight), then refresh the screen.
function applyRemote(remote) {
  const rowsBefore = JSON.stringify(activeRows(state));
  const before = canonical(state);
  state = merge(state, remote);
  if (canonical(state) === before) return;  // nothing new from the other device
  saveState(localStorage, state);

  $("mode").value = activeMode(state);
  $("autoSpeak").checked = state.settings.autoSpeak;
  $("sBest").textContent = state.bestStreak.value;
  refreshStars();
  if (rowsBefore !== JSON.stringify(activeRows(state))) {
    renderRowToggles();
    renderChart();
    if (!answered && current && !activeRows(state).includes(current.row)) nextCard();
  }
  const view = document.querySelector(".view.active").id;
  if (view === "words") renderWords();
  if (view === "dictionary") renderDictionary();
  if (view === "progress") renderProgress();
}

function startSync(config) {
  syncer?.stop();
  syncer = new Syncer({
    client: new GistClient(config.token),
    gistId: config.gistId,
    getState: () => state,
    applyState: applyRemote,
    onStatus: showStatus,
    isOnline: () => navigator.onLine,
  });
  return syncer.run();
}

function renderSyncPanel() {
  const config = loadConfig(localStorage);
  $("syncSetup").hidden = !!config;
  $("syncConnected").hidden = !config;
  if (config) $("syncLogin").textContent = config.login;
}

$("connectBtn").addEventListener("click", async () => {
  const token = $("tokenInput").value.trim();
  if (!token) return;
  $("connectBtn").disabled = true;
  showStatus({ kind: "syncing" });
  try {
    const { login, gistId } = await connect(new GistClient(token), state);
    const config = { token, gistId, login };
    saveConfig(localStorage, config);
    $("tokenInput").value = "";
    renderSyncPanel();
    await startSync(config);
  } catch (e) {
    showStatus({ kind: "error", message: e.message });
  } finally {
    $("connectBtn").disabled = false;
  }
});

// Reuse the running syncer; after a 401/404 it is stopped, so start a fresh one to retry.
$("syncNowBtn").addEventListener("click", () => {
  const c = loadConfig(localStorage);
  if (!c) return;
  (syncer && !syncer.stopped ? syncer.run() : startSync(c)).catch(e => console.error("sync failed", e));
});

// Enter in the token box connects.
$("tokenInput").addEventListener("keydown", e => { if (e.key === "Enter") $("connectBtn").click(); });

$("disconnectBtn").addEventListener("click", () => {
  if (!confirm("Stop syncing on this device? Your progress stays here and in the gist.")) return;
  syncer?.stop();
  syncer = null;
  clearConfig(localStorage);
  showStatus({ kind: "off" });
  renderSyncPanel();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") syncer?.run().catch(e => console.error("sync failed", e));
});
window.addEventListener("online", () => syncer?.run().catch(e => console.error("sync failed", e)));

// ---------- Navigation ----------
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === b.dataset.view));
  if (b.dataset.view === "progress") renderProgress();
  if (b.dataset.view === "words") renderWords();
  if (b.dataset.view === "dictionary") renderDictionary();
  if (b.dataset.view === "sync") renderSyncPanel();
  if (b.dataset.view === "practice" && currentMode === "type" && !answered) $("answer")?.focus();
}));

// ---------- Init ----------
$("mode").value = activeMode(state);
$("autoSpeak").checked = state.settings.autoSpeak;
$("sBest").textContent = state.bestStreak.value;
renderRowToggles();
renderChart();
nextCard();
renderSyncPanel();
const config = loadConfig(localStorage);
if (config) startSync(config).catch(e => console.error("sync failed", e)); else showStatus({ kind: "off" });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(e => console.warn("Offline support unavailable:", e));
}
