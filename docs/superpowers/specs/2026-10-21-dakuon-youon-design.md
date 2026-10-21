# だくおん and ようおん support — design

Date: 2026-10-21. Builds on the basic hiragana/katakana practice (see the katakana spec).

## Goal

Add the voiced kana (だくおん, including the ぱ行) and the combination kana (ようおん) to Practice,
Chart, Progress and the example words, in both scripts, and make the Review reading aid follow
progress on them.

Decisions from the brainstorm:

- Scope: quiz and chart rows, example words, both scripts, reading aid follows progress.
- Layout: the same screens, with three labelled sections (基本 / 濁音 / 拗音) rather than a
  separate set switch. The quiz draws from every ticked row in any section.
- ぱ行 is grouped with だくおん. Extended katakana (ティ, ファ, ウィ, ヴ) is out of scope.

## 1. Data (`js/data.js`)

- Every row gets `group` (`"basic"` | `"dakuon"` | `"youon"`). The existing 11 rows are `basic`.
- Dakuon rows, 5 slots each (a i u e o), ids `ga za da ba pa`:
  が ぎ ぐ げ ご / ざ じ ず ぜ ぞ / だ ぢ づ で ど / ば び ぶ べ ぼ / ぱ ぴ ぷ ぺ ぽ (25 kana).
  Romaji: じ `ji`,`zi`; ぢ `di`,`ji`; づ `du`,`zu`; ず `zu`; otherwise the Hepburn spelling.
  The first entry is the *primary* spelling shown in pick mode, so ぢ shows "di" and づ "du".
- Youon rows, 3 slots each (ゃ ゅ ょ), ids `kya sha cha nya hya mya rya gya ja bya pya`:
  きゃ きゅ きょ / しゃ しゅ しょ / ちゃ ちゅ ちょ / にゃ にゅ にょ / ひゃ ひゅ ひょ / みゃ みゅ みょ /
  りゃ りゅ りょ / ぎゃ ぎゅ ぎょ / じゃ じゅ じょ / びゃ びゅ びょ / ぴゃ ぴゅ ぴょ (33 kana).
  Alternate spellings: しゃ `sha`,`sya`; ちゃ `cha`,`tya`; じゃ `ja`,`jya`,`zya` and the same
  pattern for ゅ and ょ. ぢゃ ぢゅ ぢょ are not included.
- `ROWS` order: basic, then dakuon, then youon. `KATA_ROWS` is still derived by `+0x60`, but now
  converts every character of a kana string (`toKata` maps over the string), so きゃ → キャ.
- A character's `kana` may be two characters long (きゃ). It is still the key for stats.
- Each group has its column headers for the chart: basic and dakuon `a i u e o`, youon `ya yu yo`.
  `GROUPS` exports `{ id, label, cols }` for the three groups.
- `ALL` grows to 104 characters per script (46 + 25 + 33). `DEFAULT_ROWS` is unchanged.
- `SMALL_BASE` is unchanged.

## 2. Settings

No new fields. Row ids for the new rows are stored in the existing `settings.rows` / `settings.krows`
arrays. `ROW_IDS` in `js/store.js` is derived from `ROWS`, so the new ids are recognised.
The hiragana "keep at least one row" rule and the empty katakana state are unchanged.
An app version without this feature ignores unknown row ids when reading, but rewrites the arrays
from its own chips when you toggle a row, so it drops the new ids. Open the app on each device
once after the update (same caveat as katakana).

## 3. Learned characters (`knownChars`)

For each ticked row, in either script:

- **dakuon:** add each kana of the row (が ぎ ぐ げ ご …).
- **youon:** add only the small kana (ゃ ゅ ょ / ャ ュ ョ), not the first kana — き still needs the
  ka row. So きょう is readable once the ka row, the あ row and the きゃ row are ticked, even before
  the や row.
- **basic:** unchanged.

`SMALL_BASE` still applies (ゃ is also known once や is learned). Word eligibility and the
Review reading aid both use this set, so romaji disappears over voiced and combined kana once their
rows are ticked. `rubyHtml` already splits ゛゜ and combined syllables correctly.

## 4. Practice, Chart, Progress

- **Row chips:** three labelled sections in order 基本, 濁音, 拗音 (a small heading above each
  group's chips). A chip shows the row's first kana and its label, as now.
- **Pool:** `ALL.filter(script matches, row ticked)`; no change in logic.
- **Pick mode** needs at least 4 characters (existing rule). Distractors exclude any character
  whose accepted spellings include the prompt's primary spelling, so "ji" never offers both じ and ぢ.
- **Chart and Progress:** one table per group under its heading; the youon tables have 3 columns.
  Unticked rows are dimmed as now. Tapping a cell speaks it and lists example words for it.
- **Prompt size:** two-character kana (きゃ) fit the existing prompt box on a 390px screen.
- **Word highlighting** (`wordHtml`): a mora equal to the highlighted kana is highlighted whole
  (きゃ), and a single highlighted kana is still matched inside a mora (き in きゃ).

## 5. Example words

Hiragana: new file `js/words-voiced.js`, exporting `VOICED_WORDS`, about 70 words, each containing
at least one dakuon or youon kana. Authored as `[kana, kanji ("" if none), English, Chinese, accent]`
and expanded to the `WORDS` shape (`romaji` derived with `toRomaji`). Examples: がっこう, ざっし,
でんしゃ, きょう, おちゃ, びょういん.

Katakana: about 50 more loanwords appended to `js/words-katakana.js` (a new part D), each with
at least one dakuon or youon kana: ジュース, テレビ, ビール, シャツ …. Rare words and extended
forms are excluded.

New module `js/words.js` exports `wordsFor(script)` (the script's complete list) and `findWord(kana)`
across all lists, replacing the separate `WORDS` / `KATA_WORDS` references in `app.js`
(`usableWords`, dictionary lookup). Eligibility is unchanged: every character must be in
`knownChars`.

Verification, as for the katakana words: accents against OJAD (a word whose accent cannot be
confirmed is dropped), readings and meanings against jisho, then an independent proofread of the
Chinese. Chinese is Simplified, mainland usage.

## 6. Out of scope

- Extended katakana (ティ, ファ, ウィ, ヴ) and ぢゃ ぢゅ ぢょ.
- A Review deck for these words.
- Changing how the Review decks store their own words.

## 7. Tests

- `data`: 27 rows with groups, 104 characters per script, unique `kana`, unique row ids; youon
  rows have 3 slots; ぢ primary spelling is `di`; katakana youon (キャ) derive correctly;
  `GROUPS` columns.
- `store`: `knownChars` for dakuon rows, for youon rows (small kana only, base kana not added),
  and combined with `SMALL_BASE`; `activeRows` accepts the new ids.
- `romaji`: ruby disappears over が and over きょ when the rows are ticked, and stays otherwise.
- `words`: allowed characters; each new word contains a dakuon/youon kana; accents within
  morae; unique across all lists; `findWord` finds words in every list.
- `pitch`: a word with きゃ counts one mora.
- `sw`: new files precached, version bumped.
- Browser check at iPhone size: tick a dakuon row and a youon row in both scripts, take a
  type-mode and a pick-mode quiz (including ji/di), check the three chart tables, an example
  word's highlight, and the Review ruby before and after ticking.
