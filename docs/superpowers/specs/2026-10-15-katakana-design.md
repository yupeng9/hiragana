# Katakana support — design

Date: 2026-10-15. Builds on the hiragana practice app and the Review (SRS) tab.

## Goal

Let the learner practise katakana the same way as hiragana: a quiz, a chart, example words
with sound, pitch and translations, and a dictionary — and make the Review tab's reading aid
(romaji over kana not yet learned) follow katakana progress.

Decisions from the brainstorm:

- A script switch (ひらがな / カタカナ) rather than mixing scripts or adding a tab.
- Katakana example words may use basic kana, ー, and small kana (ッ ャ ュ ョ ァ ィ ゥ ェ ォ)
  once the kana they attach to are learned. No dakuten/handakuten (゛゜), same as hiragana.
- Review romaji follows katakana progress. No katakana SRS deck (out of scope).

## 1. Data

`js/data.js`:

- `KATA_ROWS`: the same 11 rows as `ROWS` (same ids, labels, romaji, alternate spellings),
  with each kana converted to katakana (あ→ア … ん→ン, を→ヲ).
- `ALL` entries gain a `script` field (`"hira"` | `"kata"`). Hiragana entries are unchanged
  otherwise; `kana` stays the key for stats, so ア and あ already have separate progress.
- `KATA_WORDS`: about 100 loanwords in a new file `js/words-katakana.js`. Authored as
  `[kana, English, Chinese, accent]`; the module expands each to the same object shape as
  `WORDS` (`kana, romaji, kanji: "", en, zh, accent`) and derives `romaji` with `toRomaji`, so
  spelling and romaji cannot disagree. Examples: コーヒー, タクシー, ケーキ, テニス, メニュー.
  Only words with no ゛゜ qualify (so not テレビ or パン). Every accent is a number, verified
  against OJAD; a word whose accent cannot be verified is left out.
- Authored in parts and proofread by a second pass; readings and meanings checked against jisho.

## 2. Settings and state

- `settings.krows`: learned katakana row ids. Default `[]`, meaning none learned. Unlike
  hiragana there is no "at least one row" rule or default row, so the quiz needs a guard (§4).
- `settings.script`: `"hira"` (default) or `"kata"`.
- Read through `activeRows(state, script)` and `activeScript(state)`, which validate like the
  existing readers and never rewrite state.
- No new top-level keys, no schema bump, no merge change: `settings` is still newest-`t`-wins,
  and `stats` / `dictionary` are keyed by the character or word, which already differ.
- Old app versions keep unknown settings fields when they spread `...state.settings`, so an
  un-updated device does not erase `krows`. Tests cover merge round-trips with the new fields.
- Dictionary: a saved katakana word is stored by its kana like any other. `renderDictionary`
  looks words up in `WORDS` then `KATA_WORDS`.

## 3. Known-kana set (reading aid and word eligibility)

One helper, `knownChars(state)` in `js/store.js`, returns the set of characters the learner
has learned, used by Review's romaji ruby and by word filtering:

- the hiragana of rows in `activeRows(state, "hira")`;
- the katakana of rows in `activeRows(state, "kata")`;
- `ー`, always (it is not a row);
- small kana in either script when the kana they attach to is learned: っ/ッ with つ/ツ,
  ゃゅょ/ャュョ with や ゆ よ / ヤ ユ ヨ, ぁぃぅぇぉ/ァィゥェォ with あ い う え お / ア イ ウ エ オ.

This changes today's hiragana behaviour on purpose: small hiragana were always glossed, and
now follow the same rule as katakana. Word eligibility for katakana uses the same set: every
character must be in it. Review's `knownKana` callback becomes `() => knownChars(state)`.

## 4. Practice, Chart, Words, Progress

- A two-button toggle ひらがな / カタカナ at the top of Practice, Chart, Words and Progress,
  bound to `settings.script`. Changing it re-renders the current tab and picks a new card.
- Row toggles show the selected script's rows. The quiz pool is
  `ALL.filter(c => c.script === script && rowsFor(script).includes(c.row))`.
- Katakana with no rows selected: Practice shows "Pick the katakana rows you've learned" in
  place of a card, and Chart/Words show everything greyed or empty. No quiz card is drawn.
- Chart and Progress grids render the selected script's characters, with unlearned rows dimmed
  as today.
- Example words under the quiz card and on the Words tab come from the selected script's list.
- Streaks and the session counters are shared across scripts.

## 5. Pitch accent with small kana

Pitch is counted in morae, not characters: ャ ュ ョ and ァ ィ ゥ ェ ォ join the mora before
them, while ッ, ー and ン are their own morae. Today `moraHtml(…, i, …)` and `accentTitle`
count characters, which is wrong for any word with a small ゃゅょ. This change adds
`morae(text)` to `js/pitch.js` and uses it in the Words tab, the Review kana line and
`accentTitle`. This also corrects existing Review vocabulary with ゃ ゅ ょ and a nonzero
accent, if any; the plan lists them by script and fixes the cases found.

## 6. Out of scope

- A katakana SRS deck (the Review decks already contain a few katakana words, now glossed
  only until their rows are learned).
- Dakuten/handakuten rows (neither script teaches them yet).

## 7. Tests

- `data`: `KATA_ROWS` mirrors `ROWS` (ids, romaji, 46 characters); `ALL` has both scripts;
  katakana letters are the +0x60 of their hiragana.
- `store`: `activeRows`/`activeScript` fall back safely on bad values; `knownChars` covers
  rows, ー, and small-kana attachment in both scripts.
- `romaji`: katakana ruby disappears once a row is learned; ー and ッ cases; small kana in both
  scripts are glossed until their base kana is learned (e.g. きょ needs き and よ).
- `pitch`: `morae` counts キャ as one, ッ and ー as one each; accent positions follow.
- `words`: every `KATA_WORDS` entry uses only basic katakana, ー and small kana; no
  duplicates; accents are null or within the mora count.
- `merge`: settings with `krows`/`script` survive merge both ways.
- `sw`: new file is precached and the version is bumped.
- Browser check at iPhone size: switch scripts, learn a row, take a quiz, hear a word, save
  it to the dictionary, and see the Review ruby change.
