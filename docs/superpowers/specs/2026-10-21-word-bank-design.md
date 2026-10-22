# Word bank — design

Date: 2026-10-21. Builds on the Dictionary (saved ☆ words), the Practice quiz and the sync.

## Goal

Let the learner build a bank of words and drill it in a quiz-style session, like the Practice tab
but for a customised word set. The bank holds the words saved with ☆ plus words the learner types
in. It is separate from the Review (spaced-repetition) cards.

Decisions from the brainstorm:

- Quiz-style practice, not spaced repetition.
- Words come from both the saved ⭐ Dictionary and typed-in "My words".
- Quiz modes: word → type its reading; word → pick the meaning; meaning → pick the word;
  listen → pick; mixed.
- It lives in the ⭐ Dictionary tab (no seventh tab). The Words tab and Practice are unchanged.

## 1. Data

- **Saved words:** unchanged (`state.dictionary`, keyed by kana, with tombstones).
- **My words:** new top-level `state.myWords`, a map `id → { id, t, word, kana, en, zh, accent, deleted }`.
  - `word`: the Japanese spelling (kanji or kana), required.
  - `kana`: the reading in hiragana/katakana (and ー), required; it must contain only kana.
  - `en`, `zh`: at least one is required.
  - `accent`: optional integer from 0 to the word's mora count (see `morae`), else absent.
  - Same lifecycle as `customCards`: `saveMyWord` stamps `t` and `deleted: false`;
    `deleteMyWord` leaves a minimal tombstone `{ id, t, deleted: true }`; `liveMyWords` reads
    non-deleted entries taking the id from the map key and tolerating junk.
  - `emptyState()` gets `myWords: {}`.
- **Bank entries** (derived, never stored): `bankEntries(state)` returns
  `{ key, word, kana, en, zh, accent, source }` where `source` is `"saved"` or `"mine"`.
  - Saved: every live dictionary word found by `findWord(kana)`; `word = kanji || kana`.
  - Mine: every live My word.
  - `key = word + "|" + kana`; if a saved word and a My word share a key, the My word wins.
- **Quiz progress:** the existing per-item `stats` with key `w:<key>` (box, seen, correct, t), written
  with `recordAnswer`. It syncs through the existing stats merge. Reset progress clears these too
  (the reset dialog's wording is unchanged: it already says all progress). `bestStreak` is not
  touched by the bank quiz.

## 2. Sync (`js/merge.js`)

- `merge` gains `myWords: mergeMap(a.myWords, b.myWords)` (newest `t` wins, tombstones).
- Unknown top-level keys are now carried through instead of dropped: for a key other than the ones
  `merge` knows, take the side that has it; if both do, take the one with the larger canonical
  JSON. This is a safety net, so a future new key survives an older app version's merge; it is
  commutative, associative and idempotent, and the property tests cover it.
- An app version without this feature drops `myWords` when it merges (same limitation as for
  `srs`/`customCards`). Open the app on each device once after the update, before adding words.

## 3. Reading check (`js/bank.js`)

`matchesReading(input, kana)` is true when, after normalising, the input equals the word's reading.

- Kana input (typed with a Japanese keyboard): katakana is folded to hiragana and compared with the
  word's reading folded the same way.
- Romaji input: lowercase; strip spaces, hyphens and apostrophes; macron vowels expand (ō → oo);
  then both the input and `toRomaji(kana)` are reduced to one canonical form before comparing:
  `si→shi`, `ti→chi`, `tu→tsu`, `hu→fu`, `zi→ji`, `sya/syu/syo→sha/shu/sho`, `tya…→cha…`,
  `zya/jya…→ja…`, `nn→n`, and the vowel pairs `ou→oo`, `ei→ee`.
- Words are read as spelled (は stays "ha"), so a particle-like は needs "ha" — noted in the form hint.

## 4. The quiz (`js/bank-ui.js` plus pure helpers in `js/bank.js`)

- **Entry:** a **Practice** button in the Dictionary tab opens the quiz panel; **← Back** returns.
  The bank must have at least 1 word; the panel shows how many words it has.
- **Source filter:** Saved / Mine / Both (default Both).
- **Mode menu:** Word → type reading; Word → pick meaning; Meaning → pick word; Listen → pick;
  Mixed. Pick and listen modes need at least 4 words in the chosen source; with fewer the quiz
  uses typing only, with a one-line note.
- **A card:**
  - *Type reading:* the word large; an input for romaji or kana. Check on Enter.
  - *Pick meaning:* the word large; 4 buttons with the meaning ("English · 中文", whichever exist).
  - *Pick word:* the meaning large; 4 buttons with the word (`word`, or kana if the word is kana).
  - *Listen:* the word is spoken (also a Replay button); 4 meaning buttons.
  - Distractors are other bank entries from the same source with a different word and meaning.
- **After answering:** feedback ("Correct!" / "Not quite — …"), and the full card revealed: word,
  kana with pitch marks (when `accent` is known), the romaji, English and Chinese, and a 🔊 button.
  **Next ↵** (or Enter) moves on. Keys 1–4 pick in pick modes.
- **Choosing the next word:** weighted by `2 ** (MAX_BOX − box)` like characters, never the same
  word twice in a row when more than one word exists.
- **Session counters:** correct / total / streak for the session, shown under the card. Not saved.
- **Autospeak:** reuses the existing "Speak answer" setting.

## 5. Dictionary tab changes

- Header: "N words in your bank (X saved, Y mine)".
- Buttons: **＋ Add word**, **Practice**.
- A **My words** list with ✎ edit and 🗑 delete for each, followed by the existing saved-words list.
- **Add / edit form:** Japanese, reading (kana), English, Chinese, pitch number (optional). Validation
  messages: reading must be kana only; at least one meaning; pitch within range. A hint shows the
  reading's mora count. All user text reaches the page through `esc()` only.
- Deleting asks nothing (it is a tombstone and can be re-added); editing a word that was deleted on
  another device shows "This word was deleted on another device", like Review cards.

## 6. Out of scope

- Spaced-repetition scheduling of bank words (use Review for that).
- Import or export, multiple lists, tags.
- Adding words from the Review decks to the bank.
- Particle-aware romaji reading.

## 7. Tests

- `store`: `saveMyWord` / `deleteMyWord` / `liveMyWords` (ignored bad ids, tombstones, junk entries);
  `emptyState` has `myWords`; loading an older saved state without `myWords` works.
- `merge`: `myWords` newest wins, tombstone beats an older save and loses to a newer save; unknown
  top-level keys are carried through, symmetrically; merge stays commutative/associative/idempotent
  in the existing seeded property tests with `myWords` and an unknown key added.
- `bank`: `bankEntries` (saved words found/unfound, mine, key clash, tombstones); `matchesReading`
  table of accepted and rejected inputs (romaji variants, macrons, kana, katakana input, wrong
  answers); weighted pick never repeats and favours low boxes; distractor builder returns 3 distinct
  other entries and never the answer.
- `sw`: new files precached, version bumped.
- Browser check at iPhone size: add a word, edit it, delete it; save a built-in word with ☆; run each
  mode (including Mixed and the under-4-words fallback); answer right and wrong; reload and confirm
  progress and words persist.
