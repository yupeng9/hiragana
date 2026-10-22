# Word lookup for the Add word form — design

Date: 2026-10-22. Builds on the word bank (`docs/superpowers/specs/2026-10-21-word-bank-design.md`).

## Goal

Adding a word should not mean filling in every field. The learner types the Japanese, the reading
or an English word, picks a match, and the form fills in the rest. Matches come from the words the
app already knows, then from an online Japanese dictionary (Jotoba).

Decisions from the brainstorm:

- Sources, in order: the app's built-in words (instant, offline, with Chinese and checked pitch
  numbers), then Jotoba.
- Chinese comes only from the built-in words. Jotoba has no Chinese, so it stays blank otherwise.
- The pitch number is filled only when it can be worked out without guessing.
- The operating-system dictionary (macOS Dictionary, iOS Look Up) cannot be read by a web app, so
  it is not used.

## 1. Local words (`js/lookup.js`)

- `localIndex()` builds, once and lazily, a list of `{ key, word, kana, en, zh, accent, source }` from:
  1. the Practice word lists (`WORDS`, `VOICED_WORDS`, `KATA_WORDS`, via `js/words.js`);
  2. the Review vocabulary deck (`VOCAB`: `word`, `kana`, `en`, `zh`, `accent` or null);
  3. the example words under each kanji (`KANJI[].words`: `word`, `kana`, `en`, `zh`, no accent).
  `word` is `kanji || kana` for the practice lists. `key = word|kana`. Duplicates keep the first
  occurrence in that order, except that an entry with a pitch number replaces one without.
- `lookupLocal(query, { exclude, limit = 6 })`:
  - the query is trimmed and NFKC-normalised; katakana is folded to hiragana for reading matches;
  - Latin letters (and spaces, apostrophes, hyphens) mean an English search: an entry matches when
    its English text, lower-cased, contains the query; matches that start with the query, or start
    a word in the text, rank first;
  - anything else is a Japanese search: an entry matches when its word or its reading equals the
    query, starts with it, or (for words of 2+ query characters) contains it; exact matches rank
    first, then prefix matches, then the rest, ties in index order;
  - entries whose key is in `exclude` (the learner's existing My words) are skipped.
- `exactLocal(query, exclude)` returns the entries whose word or reading equals the query exactly
  (hiragana-folded). The form narrows this to `e.word === query` before auto-filling.

## 2. Online dictionary (`js/jotoba.js`)

- `searchJotoba(query, { fetchFn = fetch, timeoutMs = 6000 })` POSTs
  `https://jotoba.de/api/search/words` with JSON `{ query, language: "English", no_english: false }`
  and returns up to 5 candidates `{ key, word, kana, en, zh: "", accent, source: "dictionary" }`, or throws
  an `Error` with a short message on a network error, timeout, non-200 reply or unreadable JSON.
- From each result word: `kana = reading.kana`; `word = reading.kanji || reading.kana`;
  `en` = the first 3 glosses of the senses in order, joined with "; ";
  `accent = accentFromPitch(pitch, kana)`.
- Words without a reading, or whose English text would be empty, are skipped.
- `accentFromPitch(pitch, kana)`: concatenate the parts, which must spell `kana` exactly, else
  `null`. Give each mora of a part that part's `high` flag. If a high mora is followed by a low
  one inside the word, the accent is the 1-based position of that high mora (this covers
  head-high and middle-high words). Otherwise return `null`: a word that rises and stays high looks
  the same whether it is flat (⓪) or drops only on a following particle (the last mora), so the
  number is left for the learner. The result must be within `0…mora count`, else `null`.
- Only that one URL is called and only the typed query is sent; nothing else leaves the device.
  The service worker already ignores cross-origin and non-GET requests, so no change is needed.
- Results are cached in memory for the session, keyed by the query.

## 3. The form (`js/bank-ui.js`, `index.html`, `css/style.css`)

- New markup in the Add word form: a **🔍 Look up** button next to the Japanese field, a
  suggestions list `#bankSuggest` below the first three fields, and a status line `#bankLookupMsg`.
  The lookup UI is hidden when editing an existing word.
- **What triggers a search.** Typing in Japanese, Reading or English (when the learner is adding; not during IME composition):
  - after 150 ms of no typing, local matches are shown immediately;
  - after 450 ms, Jotoba is queried as well (and **Look up** queries it at once). A newer query
    aborts the older request. The query is the text of the field being typed in.
  - Jotoba candidates already present locally (same key) are dropped; the rest are appended below
    the local ones, each row tagged "built-in" or "dictionary".
- **Auto-fill.** When the learner leaves the Japanese or Reading field (the `change` event, never
  while typing and never during IME composition), and what they typed is exactly the spelling
  (`word`) of one built-in word, and the other four fields are all empty, those fields are filled
  and the status line says "Filled from the built-in words — edit if needed." A reading that only
  matches a word's pronunciation (はし for 橋 and 箸) is never auto-filled; it shows suggestions.
  While typing, only suggestions appear: nothing is written into any field.
- **Japanese keyboards.** `input` events during composition are ignored; the lookup runs on
  `compositionend`, so the unconfirmed text is never searched or overwritten.
- **Choosing a row.** Tapping a suggestion fills Japanese, Reading, English, Chinese and Pitch
  (blank when unknown), clears the suggestions, and sets the status "Filled from the dictionary —
  edit if needed." Existing text is replaced because the learner asked for it by tapping.
- **Status lines.** "Looking up…", "No matches — type the word in yourself.", "Couldn't reach the
  dictionary. You can type the word in yourself." and, when the built-in matches exist
  but Jotoba fails, only the offline note after the local rows.
- All dictionary text reaches the page through `esc()`. Suggestion rows are `<button type="button">`
  elements so Enter in a field still submits the form only when no suggestion has focus.
- Validation is unchanged: a Japanese word, a kana reading and at least one meaning are required.

## 4. Out of scope

- Chinese meanings for words the app does not know.
- Pitch numbers when they cannot be worked out.
- Looking up while editing an existing word.
- Using the macOS or iOS system dictionary (not available to a web app).
- Looking words up from the quiz or from other tabs.

## 5. Tests

- `lookup`: index size and content (words from all three sources; duplicates merged; pitch
  preferred), `lookupLocal` for Japanese, hiragana-folded katakana, reading, English and ranking,
  `exclude`, `limit`, empty and whitespace queries, `exactLocal`.
- `jotoba`: `accentFromPitch` for ねこ (1), a middle drop, べんきょう (null: rises and stays high),
  all-low, a mismatch with the kana, and a single mora; `searchJotoba` with a fake `fetchFn`:
  mapping, the 3-gloss English text, skipping empty results, caching, abort/timeout, non-200, bad
  JSON and network errors.
- Browser check at iPhone size, with Jotoba served by a route stub so the check is deterministic:
  type 猫 → instant built-in row + auto-fill; type a word the app does not know (a stubbed
  Jotoba result) → dictionary row, tap, save; English search "cat"; offline message when the route
  is aborted; editing hides the lookup UI; one real call to Jotoba at the end to confirm the live
  service still has the same response shape.
