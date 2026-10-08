# Spaced-repetition review (Anki-style) for vocabulary, kanji and grammar

## Goal

Add Anki-style spaced repetition (SRS) to the hiragana app, with built-in beginner (JLPT N5)
decks for vocabulary, kanji and grammar, plus the user's own cards. Review progress syncs
between iPhone and Mac through the existing gist sync.

## Decisions (agreed with the user)

- **Content:** built-in decks — ~200 N5 words, ~80 N5 kanji, ~40 N5 grammar points — plus
  user-created cards. Every card has English and Chinese. Content is written by us, so it may
  contain small errors; the user reports them and we fix the data files.
- **Reading aid:** any kana syllable the user hasn't learned (not in their enabled practice
  rows; all katakana) shows small romaji above it (`<ruby>`). A setting turns this off.
- **Scheduler:** Anki's classic SM-2 (not FSRS). No random fuzz, so it is deterministic.
- **Defaults:** 10 new cards/day, 100 reviews/day, both adjustable.

## 1. Cards

| Deck | Card(s) | Front | Back |
|---|---|---|---|
| Vocabulary | `v:<word>:r` (recognition) | word | kana (+ pitch accent if known), English, Chinese, example sentence |
|  | `v:<word>:p` (production), introduced after the `:r` card graduates | English + Chinese | word, kana, example |
| Kanji | `k:<kanji>` | kanji | meanings (EN/ZH), on'yomi (katakana), kun'yomi (hiragana), 2–3 example words |
| Grammar | `g:<id>` | pattern + one short example | meaning (EN/ZH), explanation, 2 examples |
| Custom | `c:<id>:r` (+ `c:<id>:p` for vocabulary) | as for the matching type | as for the matching type |

New cards are introduced from enabled decks in turn, one note per deck (vocab 1, kanji 1, grammar 1,
custom 1, vocab 2, …), keeping each deck's file order (most common first).

## 2. Scheduling (SM-2, Anki-style)

- New cards: learning steps 1 min, 10 min. Again → step 1; Hard → stay on the current step:
  5.5 min on the first learning step, 10 min on the second, 15 min for the relearning step;
  Good → next step, then graduate to 1 day; Easy → graduate to 4 days.
- Review cards (ease starts at 2.5, minimum 1.3):
  - Again → relearning (10 min step), lapses +1, ease −0.2, interval resets to 1 day.
  - Hard → interval × 1.2, ease −0.15. Good → interval × ease. Easy → interval × ease × 1.3,
    ease +0.15. Each is at least one day longer than the previous button's; maximum 100 years
    (at the cap the buttons can tie). Intervals are rounded with `Math.round` (Anki truncates).
- Relearning: Good → back to review at the reset interval; Easy → that interval + 1 day.
- The day starts at 04:00 local time (as in Anki). Review cards are due "today" if due before
  the next 04:00. There is no automatic learn-ahead: a learning card that is not yet due is not
  shown by itself; the user can open it with "Study now anyway" (see section 4).
- Daily limits count cards first seen today (new) and cards first seen earlier but rated today
  (reviews), only over the currently enabled cards.
- Queue order: learning cards due now, then due reviews (oldest first), then new cards.
- Every button shows its next interval ("10m", "3d", "2.1mo").

## 3. State and sync

Added to the synced state:

```
srs:         { [cardId]: { phase, step, due, interval, ease, reps, lapses, first, last, t } }
customCards: { [id]: { type, ...fields, t, deleted } }
settings.srs: { newPerDay, reviewsPerDay, showRomaji, decks: ["vocab","kanji","grammar","custom"] }
```

Merge rules (same guarantees as before: commutative, associative, idempotent):
- **srs:** per card, the entry with more `reps` wins, then newer `t`, then canonical JSON. There is
  no reset filter, so this maximum is already associative and no side-set is kept (no `srsLater`).
  "Reset progress" does not touch SRS. A device that repeats a card's learning steps many times can
  out-count another device's entry for that card; this is accepted.
- **customCards:** newer `t` wins; deleting sets `deleted: true` (tombstone), like the dictionary.
- **settings.srs:** part of `settings` (newest wins); read through a sanitiser that fills
  defaults and clamps limits to 0–999.

Built-in deck content ships with the app (not in the gist).

## 4. UI

- New **Review** tab (🗂️), with a badge showing how many cards can be studied now.
- **Overview:** per deck — due / new counts and an on/off toggle; a **Study** button; settings
  (new/day, reviews/day, show romaji); **＋ Add card**; **My cards** (list, edit, delete).
- **Study:** the front, **Show answer** (Space), then Again / Hard / Good / Easy (keys 1–4) with
  interval previews; 🔊 reads the Japanese; "N left". When only not-yet-due learning
  cards remain: "Next card in N min" with a **Study now anyway** button that opens the earliest one;
  when nothing is left: "All done for today".
- **Add/edit card:** pick the type; the form shows that type's fields. Required: vocabulary —
  word, kana, English or Chinese; kanji — kanji, a meaning; grammar — pattern, a meaning.

## 5. Files

| File | Purpose |
|---|---|
| `js/srs.js` | Pure SM-2 scheduler, day boundary, queue building, interval formatting |
| `js/romaji.js` | Kana → per-syllable romaji, for the reading aid |
| `js/decks/vocab.js`, `kanji.js`, `grammar.js` | Built-in deck data |
| `js/cards.js` | Builds the card list (ids, order, siblings) from decks + custom cards |
| `js/review.js` | Review tab UI (overview, study, add/edit, my cards) |
| `test/srs.test.js`, `romaji.test.js`, `decks.test.js`, `cards.test.js` | Unit tests |

`store.js`, `merge.js`, `app.js`, `index.html`, `css/style.css` and `sw.js` are extended.

## 6. Testing

- Scheduler: exact interval/ease sequences for each button and phase; limits; day boundary;
  sibling rule; queue order.
- Romaji: hiragana, katakana, dakuten, ゃゅょ combinations, っ, ー, ん, non-kana passthrough.
- Decks: required fields, unique ids, reading scripts (on'yomi katakana, kun'yomi hiragana),
  kana fields contain only kana, pitch accent in range or null.
- Merge: property tests extended to `srs` and `customCards`.
- Browser check at iPhone and desktop sizes when the Playwright browser is available.

## Out of scope

- FSRS, fuzz, card suspension/burying controls, review history charts, deck import (.apkg/CSV),
  audio other than speech synthesis.
