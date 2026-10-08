// The Review tab: deck overview, study session, add/edit form and the list of the user's cards.
// app.js owns the state; every change goes through `update`, which also saves and syncs.
// Custom card text is user input: it reaches innerHTML only through esc() or rubyHtml().
import { allCards, deckCounts, studyQueue } from "./cards.js";
import { schedule, preview, formatDelay, nextCardId, AGAIN, HARD, GOOD, EASY, MINUTE } from "./srs.js";
import {
  srsSettings, setSrsSettings, srsOf, recordReview, saveCustomCard, deleteCustomCard, liveCustomCards, SRS_DECKS,
} from "./store.js";
import { rubyHtml, syllables } from "./romaji.js";
import { moraHtml, accentMarkHtml } from "./pitch.js";

const DECK_NAMES = { vocab: "Vocabulary", kanji: "Kanji", grammar: "Grammar", custom: "My cards" };
const RATINGS = [[AGAIN, "Again", "again"], [HARD, "Hard", "hard"], [GOOD, "Good", "good"], [EASY, "Easy", "easy"]];
const WAIT_REFRESH_MS = 30_000;

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ESC[c]);
const str = v => (typeof v === "string" ? v : "");
const list = v => (Array.isArray(v) ? v.filter(x => typeof x === "string" && x) : []);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function initReview({ getState, update, knownKana, speak }) {
  const $ = id => document.getElementById(id);
  const PANELS = ["revOverview", "revStudy", "revEdit", "revList"];
  let panel = "revOverview";
  let currentId = null, revealed = false, waitTimer = null, editingId = null;

  // ---------- Rendering helpers ----------
  const romajiOn = () => srsSettings(getState()).showRomaji;
  // All Japanese text goes through here: reading aid on, or plain escaped text.
  const jp = text => (romajiOn() ? rubyHtml(str(text), knownKana()) : esc(str(text)));
  const meaning = n => {
    const en = str(n?.en), zh = str(n?.zh);
    return `${esc(en)}${en && zh ? " " : ""}${zh ? `<span class="zh">${en ? "· " : ""}${esc(zh)}</span>` : ""}`;
  };

  // Kana with the Words-tab pitch-accent marks when the accent is known, keeping the reading aid.
  function kanaHtml(kana, accent) {
    const text = str(kana);
    const n = [...text].length;
    if (!Number.isInteger(accent) || accent < 0 || accent > Math.min(n, 9)) return `<span class="rev-kana">${jp(text)}</span>`;
    const known = romajiOn() ? knownKana() : null;
    let i = 0;
    const body = syllables(text).map(({ text: t, romaji }) => {
      const morae = [...t].map(ch => moraHtml(esc(ch), i++, accent)).join("");
      return known && romaji && ![...t].every(ch => known.has(ch)) ? `<ruby>${morae}<rt>${romaji}</rt></ruby>` : morae;
    }).join("");
    return `<span class="rev-kana pitch">${body}${accentMarkHtml(text, accent)}</span>`;
  }

  const exampleHtml = ex => !ex || !str(ex.jp) ? "" : `<div class="rev-ex">
      <div class="rev-ex-jp">${jp(ex.jp)}</div>
      ${str(ex.kana) && ex.kana !== ex.jp ? `<div class="rev-ex-kana">${jp(ex.kana)}</div>` : ""}
      <div class="rev-ex-tr">${meaning(ex)}</div>
    </div>`;
  const examplesOf = note => (Array.isArray(note.ex) ? note.ex : note.ex ? [note.ex] : []);
  const speakBtn = text => (str(text) ? `<button class="btn rev-say" data-speak="${esc(text)}" title="Listen">🔊</button>` : "");

  // A word written only in kana is its own reading: once revealed, the front itself gets the
  // pitch / romaji line and the back does not repeat it.
  const kanaOnly = note => str(note.word) !== "" && note.word === note.kana;

  function frontHtml({ kind, note }, shown) {
    if (kind === "recognition") {
      return `<div class="rev-front big">${shown && kanaOnly(note) ? kanaHtml(note.kana, note.accent) : jp(note.word)}</div>`;
    }
    if (kind === "production") return `<div class="hint">How do you say…?</div><div class="rev-front mid">${meaning(note)}</div>`;
    if (kind === "kanji") return `<div class="rev-front huge">${esc(note.kanji)}</div>`;
    const first = examplesOf(note)[0];
    return `<div class="rev-front mid">${esc(note.pattern)}</div>${first && str(first.jp) ? `<div class="rev-ex-jp">${jp(first.jp)}</div>` : ""}`;
  }

  function backHtml({ kind, note }) {
    if (kind === "recognition") {
      return `${kanaOnly(note) ? "" : kanaHtml(note.kana, note.accent)}${speakBtn(note.kana)}
        <div class="rev-meaning">${meaning(note)}</div>${exampleHtml(note.ex)}`;
    }
    if (kind === "production") {
      return `<div class="rev-front big">${jp(note.word)}</div>${kanaHtml(note.kana, note.accent)}${speakBtn(note.kana)}
        ${exampleHtml(note.ex)}`;
    }
    if (kind === "kanji") {
      const on = list(note.on), kun = list(note.kun);
      const words = Array.isArray(note.words) ? note.words.filter(w => w && typeof w === "object") : [];
      const say = words[0]?.kana || kun[0]?.replace(/[.-]/g, "") || on[0] || note.kanji;
      return `<div class="rev-meaning">${meaning(note)}</div>${speakBtn(say)}
        ${on.length ? `<div class="rev-read"><b>音</b> ${on.map(esc).join("、")}</div>` : ""}
        ${kun.length ? `<div class="rev-read"><b>訓</b> ${kun.map(esc).join("、")}</div>` : ""}
        ${words.length ? `<ul class="rev-words">${words.map(w =>
          `<li><span class="rev-w">${jp(w.word)}</span> <span class="rev-wk">${jp(w.kana)}</span> ${meaning(w)}</li>`).join("")}</ul>` : ""}`;
    }
    const exs = examplesOf(note);
    const notes = [note.note_en, note.note_zh].map(str).filter(Boolean);
    return `<div class="rev-meaning">${meaning(note)}</div>${speakBtn(exs[0]?.kana || exs[0]?.jp)}
      ${notes.map(t => `<p class="rev-note">${esc(t)}</p>`).join("")}
      ${exs.map(exampleHtml).join("")}`;
  }

  // ---------- Panels ----------
  function show(id) {
    panel = id;
    PANELS.forEach(p => { $(p).hidden = p !== id; });
    // Focus left on a button in a now-hidden panel would swallow Space / Enter.
    const focused = document.activeElement;
    if (focused && PANELS.some(p => p !== id && $(p).contains(focused))) focused.blur();
    if (id !== "revStudy") stopWaiting();
  }
  const reviewVisible = () => $("review").classList.contains("active");

  // ---------- Overview ----------
  function renderOverview() {
    const state = getState(), settings = srsSettings(state);
    const counts = deckCounts(state, Date.now());
    $("revDecks").innerHTML = SRS_DECKS.map(d => {
      const on = settings.decks.includes(d);
      const c = counts[d];
      return `<label class="rev-deck ${on ? "" : "off"}">
        <span class="rev-deck-name">${DECK_NAMES[d]}</span>
        <span class="rev-deck-counts">${on ? `<b class="due">${c.due}</b> due · <b class="new">${c.fresh}</b> new` : "off"}</span>
        <input type="checkbox" class="switch" data-deck="${d}" ${on ? "checked" : ""} aria-label="Study ${DECK_NAMES[d]}">
      </label>`;
    }).join("");
    const total = counts.total.due + counts.total.fresh;
    $("revStudyBtn").textContent = total ? `Study (${total})` : "Study";
    // Never overwrite a number the user is in the middle of typing.
    for (const [id, v] of [["revNewPerDay", settings.newPerDay], ["revReviewsPerDay", settings.reviewsPerDay]]) {
      if (document.activeElement !== $(id)) $(id).value = v;
    }
    $("revShowRomaji").checked = settings.showRomaji;
  }

  $("revDecks").addEventListener("change", e => {
    const deck = e.target.dataset.deck;
    if (!deck) return;
    update((s, now) => {
      const decks = srsSettings(s).decks;
      setSrsSettings(s, { decks: SRS_DECKS.filter(d => (d === deck ? e.target.checked : decks.includes(d))) }, now);
    });
    renderOverview();
  });

  const limitInput = (id, key) => $(id).addEventListener("change", () => {
    const v = Number.parseInt($(id).value, 10);
    if (Number.isFinite(v)) update((s, now) => setSrsSettings(s, { [key]: v }, now));
    renderOverview();
  });
  limitInput("revNewPerDay", "newPerDay");
  limitInput("revReviewsPerDay", "reviewsPerDay");
  $("revShowRomaji").addEventListener("change", e => {
    update((s, now) => setSrsSettings(s, { showRomaji: e.target.checked }, now));
  });

  // ---------- Study ----------
  const cardById = id => allCards(getState()).find(c => c.id === id) ?? null;

  function renderLeft() {
    const { due, fresh } = deckCounts(getState(), Date.now()).total;
    $("revLeft").textContent = `${due + fresh} left`;
  }

  function stopWaiting() {
    clearInterval(waitTimer);
    waitTimer = null;
  }

  // Rebuild the queue and show whatever is next, or the waiting / done screen.
  function nextCard() {
    const state = getState(), now = Date.now();
    const next = nextCardId(studyQueue(state, now), srsOf(state), now);
    if (next.id) { stopWaiting(); openCard(next.id); return; }
    currentId = null;
    revealed = false;
    renderLeft();
    if (next.aheadId) {
      const mins = Math.max(1, Math.ceil((next.waitUntil - now) / MINUTE));
      $("revCard").innerHTML = `<div class="rev-done">Next card in ${mins} min</div>
        <div class="actions"><button class="btn" data-ahead="${esc(next.aheadId)}">Study now anyway</button></div>`;
      // Keep checking while this screen is visible, so the card appears once it is due.
      if (!waitTimer) {
        waitTimer = setInterval(() => {
          if (panel === "revStudy" && currentId === null && reviewVisible()) nextCard(); else stopWaiting();
        }, WAIT_REFRESH_MS);
      }
    } else {
      stopWaiting();
      $("revCard").innerHTML = `<div class="rev-done">All done for today 🎉</div>
        <div class="actions"><button class="btn" data-rev-back>← Decks</button></div>`;
    }
  }

  function openCard(id) {
    currentId = id;
    revealed = false;
    renderCard();
  }

  function renderCard() {
    const card = cardById(currentId);
    if (!card) { nextCard(); return; }
    renderLeft();
    let html = `<div class="rev-face">${frontHtml(card, revealed)}</div>`;
    if (!revealed) {
      html += `<div class="actions"><button class="btn primary" data-reveal>Show answer</button></div>`;
    } else {
      const delays = preview(srsOf(getState())[card.id] ?? null, Date.now());
      html += `<div class="rev-back">${backHtml(card)}</div>
        <div class="rev-rates">${RATINGS.map(([r, label, cls], i) =>
          `<button class="rate ${cls}" data-rate="${r}"><b>${label}</b><small>${formatDelay(delays[i])}</small></button>`).join("")}</div>`;
    }
    $("revCard").innerHTML = html;
    // Space / Enter on "Show answer" reveals; afterwards focus sits on the card, so 1–4 rate.
    if (reviewVisible()) (revealed ? $("revCard") : $("revCard").querySelector("[data-reveal]"))?.focus({ preventScroll: revealed });
  }

  function reveal() {
    if (!currentId || revealed) return;
    revealed = true;
    renderCard();
  }

  function rate(rating) {
    const id = currentId;
    if (!id || !revealed) return;
    update((s, now) => recordReview(s, id, schedule(srsOf(s)[id] ?? null, rating, now)));
    nextCard();
  }

  function startStudy() {
    show("revStudy");
    nextCard();
  }

  // ---------- Add / edit ----------
  const form = $("revEdit");
  const field = name => form.elements.namedItem(name);
  const val = name => field(name).value.trim();
  let editReturn = "revOverview";

  function syncTypeFields() {
    const type = $("revType").value;
    form.querySelectorAll("[data-for]").forEach(el => { el.hidden = !el.dataset.for.split(" ").includes(type); });
  }

  const findCustom = id => liveCustomCards(getState()).find(c => String(c.id) === id) ?? null;

  function openEdit(id, from) {
    const note = id ? findCustom(id) : null;
    editingId = note ? String(note.id) : null;
    editReturn = from;
    form.reset();
    $("revFormMsg").textContent = "";
    $("revEditTitle").textContent = note ? "Edit card" : "Add card";
    $("revDeleteBtn").hidden = !note;
    $("revType").disabled = !!note;
    if (note) {
      $("revType").value = ["vocab", "kanji", "grammar"].includes(note.type) ? note.type : "vocab";
      for (const k of ["word", "kana", "kanji", "pattern", "en", "zh"]) field(k).value = str(note[k]);
      field("on").value = list(note.on).join(", ");
      field("kun").value = list(note.kun).join(", ");
      field("notes").value = str(note.note_en);
      const ex = examplesOf(note)[0] ?? {};
      field("exJp").value = str(ex.jp);
      field("exKana").value = str(ex.kana);
      field("exEn").value = str(ex.en);
      field("exZh").value = str(ex.zh);
    }
    syncTypeFields();
    show("revEdit");
  }

  // { card } with the fields for the chosen type, or { error } naming what is missing.
  function readForm() {
    const type = $("revType").value, en = val("en"), zh = val("zh");
    const ex = { jp: val("exJp"), kana: val("exKana"), en: val("exEn"), zh: val("exZh") };
    const hasEx = Object.values(ex).some(Boolean);
    const split = s => s.split(/[,、，]/).map(x => x.trim()).filter(Boolean);
    let card, missing = null;
    if (type === "kanji") {
      card = { type, kanji: val("kanji"), on: split(val("on")), kun: split(val("kun")), en, zh };
      if (!card.kanji) missing = "the kanji";
    } else if (type === "grammar") {
      card = { type, pattern: val("pattern"), en, zh, note_en: val("notes"), ex: hasEx ? [ex] : [] };
      if (!card.pattern) missing = "the pattern";
    } else {
      card = { type: "vocab", word: val("word"), kana: val("kana"), en, zh, ...(hasEx ? { ex } : {}) };
      if (!card.word) missing = "the word";
      else if (!card.kana) missing = "the kana reading";
    }
    if (!missing && !en && !zh) missing = "a meaning (English or Chinese)";
    if (!missing && hasEx && type !== "kanji" && !ex.jp) missing = "the example's Japanese sentence";
    return missing ? { error: `Please fill in ${missing}.` } : { card };
  }

  function leaveEdit() {
    show(editReturn);
    if (editReturn === "revList") renderList(); else renderOverview();
  }

  $("revType").addEventListener("change", () => { $("revFormMsg").textContent = ""; syncTypeFields(); });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const { card, error } = readForm();
    if (error) { $("revFormMsg").textContent = error; return; }
    if (editingId && !findCustom(editingId)) {
      $("revFormMsg").textContent = "This card was deleted on another device.";
      return;
    }
    const id = editingId ?? newId();
    update((s, now) => saveCustomCard(s, { ...card, id }, now));
    leaveEdit();
  });
  $("revCancelBtn").addEventListener("click", leaveEdit);
  $("revDeleteBtn").addEventListener("click", () => {
    if (editingId && removeCard(editingId)) leaveEdit();
  });

  function removeCard(id) {
    if (!confirm("Delete this card on all your devices? Its review progress is lost.")) return false;
    update((s, now) => deleteCustomCard(s, id, now));
    return true;
  }

  // ---------- My cards ----------
  function renderList() {
    const cards = liveCustomCards(getState()).sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
    $("revListItems").innerHTML = cards.length ? `<ul class="rev-list">${cards.map(c => `<li>
        <div class="rev-list-text"><span class="rev-list-main">${esc(str(c.word) || str(c.kanji) || str(c.pattern))}</span>
          <span class="rev-list-type">${esc(DECK_NAMES[c.type] ?? c.type)}</span>
          <div class="rev-list-mean">${meaning(c)}</div></div>
        <div class="rev-list-btns"><button class="btn" data-edit="${esc(c.id)}">Edit</button>
          <button class="btn danger" data-del="${esc(c.id)}">Delete</button></div>
      </li>`).join("")}</ul>`
      : `<p class="muted">You haven't added any cards yet. Tap ＋ Add card to make one.</p>`;
  }

  // ---------- Events ----------
  $("revStudyBtn").addEventListener("click", startStudy);
  $("revAddBtn").addEventListener("click", () => openEdit(null, "revOverview"));
  $("revListAddBtn").addEventListener("click", () => openEdit(null, "revList"));
  $("revListBtn").addEventListener("click", () => { show("revList"); renderList(); });

  $("review").addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.matches("[data-rev-back]")) { show("revOverview"); renderOverview(); }
    else if (t.matches("[data-reveal]")) reveal();
    else if (t.dataset.rate) rate(Number(t.dataset.rate));
    else if (t.dataset.ahead) { stopWaiting(); openCard(t.dataset.ahead); }
    else if (t.dataset.speak) speak(t.dataset.speak);
    else if (t.dataset.edit) openEdit(t.dataset.edit, "revList");
    else if (t.dataset.del) { if (removeCard(t.dataset.del)) renderList(); }
  });

  // Space / Enter shows the answer, 1–4 rate; only while studying on the Review tab.
  document.addEventListener("keydown", e => {
    if (!reviewVisible() || panel !== "revStudy" || !currentId) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select")) return;
    if ((e.key === "Enter" || e.key === " ") && e.target.closest?.("button")) return;   // the button handles it
    if (!revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); reveal(); }
    else if (revealed && /^[1-4]$/.test(e.key)) { e.preventDefault(); rate(Number(e.key)); }
  });

  // Re-render whatever is showing from the current state (after a sync, or when the tab is shown).
  // The edit form is left alone so typing is never lost.
  function refresh() {
    if (panel === "revOverview") renderOverview();
    else if (panel === "revList") renderList();
    else if (panel === "revStudy") { if (currentId) renderCard(); else nextCard(); }
  }

  show("revOverview");
  renderOverview();
  // Tapping the Review tab while already studying goes back to the deck overview.
  function home() {
    if (panel !== "revStudy") return;
    show("revOverview");
    renderOverview();
  }

  return { refresh, home };
}
