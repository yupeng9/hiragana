// The Dictionary tab's word bank: the My words list, the add/edit form and the quiz.
// app.js owns the state; every change goes through `update`, which also saves and syncs.
// Word text is user input: it reaches innerHTML only through esc().
import {
  bankEntries, inSource, statKey, meaningText, matchesReading, pickEntry, buildChoices,
  validateMyWord, availableModes,
} from "./bank.js";
import { saveMyWord, deleteMyWord, liveMyWords, recordAnswer } from "./store.js";
import { toRomaji } from "./romaji.js";
import { morae, moraHtml, accentMarkHtml } from "./pitch.js";
import { lookupLocal, exactLocal } from "./lookup.js";
import { searchJotoba } from "./jotoba.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ESC[c]);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PANELS = ["bankHome", "bankForm", "bankPractice"];
const PICK_MODES = ["pickMeaning", "pickWord", "listen"];

export function initBank({ getState, update, speak }) {
  const $ = id => document.getElementById(id);
  let panel = "bankHome", editingId = null;
  let entry = null, mode = null, answered = false, lastKey = null;
  const session = { correct: 0, total: 0, streak: 0 };

  function show(name) {
    if (name !== "bankForm") stopLookup();
    panel = name;
    for (const id of PANELS) $(id).hidden = id !== name;
  }

  const kanaHtml = e => {
    const n = morae(e.kana).length;
    if (!Number.isInteger(e.accent) || e.accent < 0 || e.accent > Math.min(n, 9)) return esc(e.kana);
    return morae(e.kana).map((m, i) => moraHtml(esc(m), i, e.accent)).join("") + accentMarkHtml(e.kana, e.accent);
  };

  // ---------- Home: summary and My words ----------
  function renderHome() {
    const entries = bankEntries(getState());
    const saved = entries.filter(e => e.source === "saved").length, mine = entries.length - saved;
    $("bankSummary").textContent = `${entries.length} word${entries.length === 1 ? "" : "s"} in your bank (${saved} saved, ${mine} mine).`;
    $("bankPracticeBtn").disabled = entries.length === 0;
    const words = liveMyWords(getState()).sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
    $("myWordsList").innerHTML = words.length ? words.map(w => {
      const e = { kana: w.kana, accent: Number.isInteger(w.accent) ? w.accent : null };
      return `<div class="word" data-say="${esc(w.kana)}" title="Click to hear">
        <span class="bank-actions"><button data-edit="${esc(w.id)}" title="Edit">✎</button><button data-del="${esc(w.id)}" title="Delete">🗑</button></span>
        <span class="wk">${kanaHtml(e)}</span>${w.word !== w.kana ? `<span class="wj">${esc(w.word)}</span>` : ""}
        <span class="wr">${esc(toRomaji(w.kana))} 🔊</span>
        <span class="wt">${esc(w.en)}${w.en && w.zh ? " " : ""}${w.zh ? `<span>${w.en ? "· " : ""}${esc(w.zh)}</span>` : ""}</span>
      </div>`;
    }).join("") : `<p class="muted">No words of your own yet. Tap “＋ Add word”.</p>`;
  }

  // ---------- Form ----------
  function openForm(id) {
    editingId = id;
    const w = id ? liveMyWords(getState()).find(x => x.id === id) : null;
    $("bankFormTitle").textContent = w ? "Edit word" : "Add word";
    const f = $("bankForm");
    f.word.value = w?.word ?? ""; f.kana.value = w?.kana ?? ""; f.en.value = w?.en ?? "";
    f.zh.value = w?.zh ?? ""; f.accent.value = Number.isInteger(w?.accent) ? String(w.accent) : "";
    $("bankFormMsg").textContent = "";
    $("bankLookup").hidden = Boolean(id); resetLookup(); lastField = "word";
    updateMoraHint();
    show("bankForm");
    f.word.focus();
  }

  function updateMoraHint() {
    const n = morae($("bankForm").kana.value.trim()).length;
    $("bankMoraHint").textContent = (n ? `The reading has ${n} mora${n === 1 ? "" : "e"}; the pitch number can be 0–${n}. ` : "") +
      "Words are read as spelled (は is “ha”).";
  }

  // ---------- Lookup (the Add word form only) ----------
  const LOOKUP_FIELDS = ["word", "kana", "en"];
  let sug = [], lastField = "word", ctl = null, localTimer = null, onlineTimer = null, autoFilled = false;
  const myKeys = () => new Set(liveMyWords(getState()).map(w => `${w.word}|${w.kana}`));
  const lookupOn = () => panel === "bankForm" && editingId === null;
  const setLookupMsg = text => { $("bankLookupMsg").textContent = text; };

  function renderSuggestions() {
    $("bankSuggest").innerHTML = sug.map((s, i) => `<button type="button" class="bank-sug" data-i="${i}">
      <span class="sug-main">${esc(s.word)}${s.word !== s.kana ? `<span class="sug-kana">${esc(s.kana)}</span>` : ""}</span>
      <span class="sug-src">${s.source === "dictionary" ? "dictionary" : "built-in"}</span>
      <span class="sug-en">${esc(s.en)}${s.zh ? ` · ${esc(s.zh)}` : ""}</span></button>`).join("");
  }

  function stopLookup() {
    clearTimeout(localTimer); clearTimeout(onlineTimer);
    ctl?.abort(); ctl = null;
  }

  function resetLookup() {
    stopLookup();
    sug = []; autoFilled = false;
    renderSuggestions();
    setLookupMsg("Type a Japanese word, its reading or an English word, then pick a match.");
  }

  function fillFrom(s) {
    const f = $("bankForm");
    f.word.value = s.word; f.kana.value = s.kana; f.en.value = s.en ?? ""; f.zh.value = s.zh ?? "";
    f.accent.value = Number.isInteger(s.accent) ? String(s.accent) : "";
    $("bankFormMsg").textContent = "";
    updateMoraHint();
  }

  // Instant, offline: built-in matches, with an auto-fill when exactly one word matches exactly.
  function runLocal(field) {
    if (!lookupOn()) return;
    const f = $("bankForm"), q = f[field].value;
    autoFilled = false;
    if (!q.trim()) { sug = []; renderSuggestions(); setLookupMsg(""); return; }
    const exclude = myKeys();
    sug = lookupLocal(q, { exclude });
    renderSuggestions();
    setLookupMsg("");
  }

  // Called when the learner leaves a field (not while typing, not during IME composition): if what they
  // typed is exactly the spelling of one built-in word and the other fields are empty, fill them in.
  function tryAutoFill(field) {
    if (!lookupOn()) return;
    const f = $("bankForm"), q = f[field].value.trim().normalize("NFKC");
    if (!q) return;
    const exact = exactLocal(q, myKeys()).filter(e => e.word === q);
    const othersEmpty = ["word", "kana", "en", "zh", "accent"].filter(n => n !== field).every(n => !f[n].value.trim());
    if (exact.length !== 1 || !othersEmpty) return;
    stopLookup();
    fillFrom(exact[0]);
    sug = []; autoFilled = true;
    renderSuggestions();
    setLookupMsg("Filled from the built-in words — edit if needed.");
  }

  // Online: Jotoba. A newer query cancels the older one; failures never block adding a word by hand.
  async function runOnline(field) {
    if (!lookupOn() || autoFilled) return;
    const q = $("bankForm")[field].value.trim();
    if (!q) return;
    ctl?.abort();
    const mine = ctl = new AbortController();
    setLookupMsg("Looking up…");
    try {
      const found = await searchJotoba(q, { signal: mine.signal });
      if (mine.signal.aborted || !lookupOn()) return;
      const have = new Set([...sug.map(s => s.key), ...myKeys()]);
      sug = [...sug, ...found.filter(s => !have.has(s.key))];
      renderSuggestions();
      setLookupMsg(sug.length ? "" : "No matches — type the word in yourself.");
    } catch (e) {
      if (e.aborted || mine.signal.aborted || !lookupOn()) return;
      setLookupMsg(sug.length
        ? "Couldn't reach the online dictionary — showing built-in matches only."
        : `${e.message} You can type the word in yourself.`);
    }
  }

  function scheduleLookup(field) {
    lastField = field;
    stopLookup();
    localTimer = setTimeout(() => runLocal(field), 150);
    onlineTimer = setTimeout(() => runOnline(field), 450);
  }
  for (const field of LOOKUP_FIELDS) {
    const el = $("bankForm")[field];
    // While a Japanese keyboard is composing, the field holds unconfirmed text: wait for compositionend.
    el.addEventListener("input", e => { if (lookupOn() && !e.isComposing) scheduleLookup(field); });
    el.addEventListener("compositionend", () => { if (lookupOn()) scheduleLookup(field); });
    if (field !== "en") el.addEventListener("change", () => tryAutoFill(field));
  }
  $("bankLookupBtn").addEventListener("click", () => {
    if (!$("bankForm")[lastField].value.trim()) { setLookupMsg("Type something to look up."); return; }
    stopLookup();
    runLocal(lastField);
    runOnline(lastField);
  });
  $("bankSuggest").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]");
    const s = b && sug[Number(b.dataset.i)];
    if (!s) return;
    stopLookup();
    fillFrom(s);
    sug = []; autoFilled = true;
    renderSuggestions();
    setLookupMsg("Filled from the dictionary — edit if needed.");
  });

  $("bankForm").kana.addEventListener("input", updateMoraHint);
  $("bankForm").addEventListener("submit", e => {
    e.preventDefault();
    const f = $("bankForm");
    const { error, value } = validateMyWord({ word: f.word.value, kana: f.kana.value, en: f.en.value, zh: f.zh.value, accent: f.accent.value });
    if (error) { $("bankFormMsg").textContent = error; return; }
    if (editingId && !liveMyWords(getState()).some(w => w.id === editingId)) {
      $("bankFormMsg").textContent = "This word was deleted on another device.";
      return;
    }
    const id = editingId || newId();
    update((s, now) => saveMyWord(s, { ...value, id }, now));
    show("bankHome");
    renderHome();
  });
  $("bankCancelBtn").addEventListener("click", () => { show("bankHome"); renderHome(); });
  $("bankAddBtn").addEventListener("click", () => openForm(null));

  $("myWordsList").addEventListener("click", e => {
    const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (edit) { e.stopPropagation(); openForm(edit.dataset.edit); }
    else if (del) { e.stopPropagation(); update((s, now) => deleteMyWord(s, del.dataset.del, now)); renderHome(); }
  }, true);

  // ---------- Quiz ----------
  const source = () => $("bankSource").value;
  const pool = () => inSource(bankEntries(getState()), source());

  function modeFor(entries) {
    const modes = availableModes(entries.length);
    const wanted = $("bankMode").value;
    if (wanted === "mixed") return modes[Math.floor(Math.random() * modes.length)];
    return modes.includes(wanted) ? wanted : "type";
  }

  function clearCard() {
    $("bankFeedback").textContent = ""; $("bankFeedback").className = "feedback";
    $("bankReveal").innerHTML = ""; $("bankAnswer").innerHTML = "";
    $("bankNextBtn").style.display = "none";
    $("bankListenBtn").style.display = "none";   // hearing the word first would give the answer away
  }

  function nextCard() {
    const entries = pool();
    clearCard();
    entry = null;
    if (!entries.length) {
      $("bankHint").textContent = ""; $("bankPrompt").textContent = "";
      $("bankNote").textContent = "No words in this source yet — add a word or save one with ☆.";
      return;
    }
    mode = modeFor(entries);
    const wanted = $("bankMode").value;
    const count = `${entries.length} word${entries.length === 1 ? "" : "s"} in this source.`;
    $("bankNote").textContent = entries.length < 4 && wanted !== "type"
      ? `${count} Pick and listen modes need at least 4 words; typing is used until then.` : count;
    entry = pickEntry(entries, getState(), lastKey);
    lastKey = entry.key;
    answered = false;
    const prompt = $("bankPrompt");
    prompt.className = "prompt bank-prompt";
    if (mode === "type") {
      $("bankHint").textContent = "How do you read this?";
      prompt.textContent = entry.word;
      $("bankAnswer").innerHTML = `<input class="answer-input" id="bankInput" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="romaji or kana">`;
      const input = $("bankInput");
      input.focus();
      input.addEventListener("keydown", ev => {
        if (ev.key === "Enter" && !ev.isComposing && !answered && input.value.trim()) { ev.preventDefault(); ev.stopPropagation(); input.disabled = true; grade(matchesReading(input.value, entry.kana)); }
      });
      return;
    }
    const label = mode === "pickWord" ? e => e.word : meaningText;
    if (mode === "pickMeaning") { $("bankHint").textContent = "What does it mean?"; prompt.textContent = entry.word; }
    else if (mode === "pickWord") { $("bankHint").textContent = "Which word is this?"; prompt.textContent = meaningText(entry); prompt.classList.add("small"); }
    else { $("bankHint").textContent = "Listen, then pick the meaning"; prompt.innerHTML = `<button type="button" class="btn bank-play" id="bankPlay" aria-label="Play the word">🔊</button>`; $("bankListenBtn").style.display = ""; speak(entry.kana); }
    const choices = buildChoices(entries, entry, label);
    $("bankAnswer").innerHTML = `<div class="choices bank-choices">${choices.map((c, i) =>
      `<button data-key="${esc(c.key)}"><small>${i + 1}</small>${esc(label(c))}</button>`).join("")}</div>`;
  }

  function pick(key) {
    if (answered || !entry) return;
    document.querySelectorAll("#bankAnswer button").forEach(b => {
      b.disabled = true;
      if (b.dataset.key === entry.key) b.classList.add("correct");
      else if (b.dataset.key === key) b.classList.add("wrong");
    });
    grade(key === entry.key);
  }

  function grade(ok) {
    answered = true;
    update((s, now) => recordAnswer(s, statKey(entry), ok, now));
    session.total++;
    if (ok) { session.correct++; session.streak++; } else session.streak = 0;
    $("bCorrect").textContent = session.correct; $("bTotal").textContent = session.total; $("bStreak").textContent = session.streak;
    const fb = $("bankFeedback");
    fb.className = "feedback " + (ok ? "good" : "bad");
    fb.textContent = ok ? `Correct! ${entry.word} = ${entry.kana}` : `Not quite — ${entry.word} is read “${entry.kana}”`;
    $("bankReveal").innerHTML = `<div class="bank-word">${esc(entry.word)}</div>
      <div class="bank-kana">${kanaHtml(entry)}</div>
      <div class="bank-romaji">${esc(toRomaji(entry.kana))}</div>
      <div>${esc(entry.en)}${entry.en && entry.zh ? " " : ""}${entry.zh ? `<span class="zh">${entry.en ? "· " : ""}${esc(entry.zh)}</span>` : ""}</div>`;
    if (getState().settings.autoSpeak && mode !== "listen") speak(entry.kana);
    $("bankNextBtn").style.display = "";
    $("bankListenBtn").style.display = "";
    document.activeElement?.blur();
  }

  $("bankAnswer").addEventListener("click", e => { const b = e.target.closest("button[data-key]"); if (b) pick(b.dataset.key); });
  $("bankNextBtn").addEventListener("click", nextCard);
  $("bankListenBtn").addEventListener("click", () => entry && speak(entry.kana));
  $("bankPrompt").addEventListener("click", e => { if (e.target.closest("#bankPlay") && entry) speak(entry.kana); });
  $("bankMode").addEventListener("change", nextCard);
  $("bankSource").addEventListener("change", () => { lastKey = null; nextCard(); });
  $("bankPracticeBtn").addEventListener("click", () => { show("bankPractice"); nextCard(); });
  $("bankBackBtn").addEventListener("click", () => { show("bankHome"); renderHome(); });

  document.addEventListener("keydown", e => {
    if (!$("dictionary").classList.contains("active") || panel !== "bankPractice") return;
    if (answered && e.key === "Enter") { e.preventDefault(); nextCard(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("select, input, textarea")) return;
    if (!answered && PICK_MODES.includes(mode) && /^[1-4]$/.test(e.key)) {
      const btn = document.querySelectorAll("#bankAnswer button")[+e.key - 1];
      if (btn) btn.click();
    }
  });

  return {
    // Back to the list (used when the Dictionary tab is opened).
    home() { show("bankHome"); renderHome(); },
    // Re-render after the state changed elsewhere (sync, ☆ toggled). Never disturbs a quiz in progress.
    refresh() { if (panel === "bankHome") renderHome(); else if (panel === "bankPractice" && !entry) nextCard(); },
  };
}
