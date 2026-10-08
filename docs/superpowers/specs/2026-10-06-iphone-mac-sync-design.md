# Hiragana Practice on iPhone + Mac with synced progress

## Goal

Use the hiragana practice app on both Mac and iPhone, with learning progress and the
word dictionary kept in sync between them.

## Decisions

- **Platform:** stay a static web app (plain HTML/CSS/JS, no build step).
- **Hosting:** public repo `github.com/yupeng9/hiragana`, served by GitHub Pages at
  `https://yupeng9.github.io/hiragana/`.
- **Install:** Progressive Web App — "Add to Home Screen" on iPhone, works offline.
- **Sync:** a secret GitHub Gist holding one file, `hiragana-progress.json`, accessed with
  a user-supplied classic personal access token with only the `gist` scope.

## 1. Files

| File | Purpose |
|---|---|
| `index.html` | Markup only; loads the CSS/JS below |
| `css/style.css` | All styles, including the mobile layout |
| `js/data.js` | `ROWS`, `WORDS` (kana data, example words with pitch accent) |
| `js/store.js` | Local state shape, load/save to `localStorage`, change timestamps |
| `js/merge.js` | Pure function `merge(local, remote) → state`; no DOM, no network |
| `js/sync.js` | Gist API client, sync scheduling, status reporting |
| `js/app.js` | UI: practice, chart, words, dictionary, progress, sync panel |
| `manifest.webmanifest` | PWA name, icons, `display: standalone`, theme colour |
| `sw.js` | Service worker: precaches app files for offline use (versioned cache) |
| `scripts/bump-sw.js` | `npm run bump-sw`: stamps `sw.js` with a content-hash `VERSION` |
| `icons/` | App icons (180px apple-touch-icon, 192px, 512px) |
| `test/merge.test.js` | `node --test` unit tests for `merge.js` |
| `test/store.test.js` | Unit tests for state load/save and v1 → v2 migration |
| `test/sync.test.js` | Unit tests for the Gist client, `connect` and the sync cycle (mocked `fetch`) |
| `test/sw.test.js` | Checks that `sw.js` VERSION is current and the precache list is complete |

The modules are plain ES modules (`<script type="module">`), so no bundler is needed.

## 2. State and merge rules

Every mergeable item carries a timestamp `t` (ms since epoch) of its last change.

```
{
  version: 2,
  settings: { rows, mode, autoSpeak, srs?, t },  // srs? = { newPerDay, reviewsPerDay, showRomaji, decks }
  stats:      { [kana]: { box, seen, correct, t } },
  dictionary: { [kana]: { t, deleted: boolean } },  // saved-at time = t of last save
  bestStreak: { value, t },
  resetAt: number,           // time of the last "Reset progress", 0 if never
  srs:         { [cardId]: { reps, ..., t } },       // scheduler state per card (js/srs.js)
  customCards: { [id]: { id, ..., t, deleted: false } | { id, t, deleted: true } }
}
```

`merge(a, b)`:
- **settings:** keep the side with the larger `t`.
- **bestStreak:** a record, so the highest `value` since the last reset wins (ties: larger
  `t`). A lower record with a later `t` is kept in `bestStreakLater` (merge-only, optional),
  because it survives a reset that wipes the higher, older one; this keeps `merge`
  associative.
- **stats:** per kana, drop entries with `t < resetAt`, then keep the entry with more
  answers (`seen`); ties go to the larger `t`. This stops a new device that answered once
  before its first sync from overwriting a long history. As with the best streak, an entry
  with fewer answers but a later `t` is kept in `statsLater` (merge-only, optional, a map
  of kana to entries), because it survives a reset that wipes the bigger, older one.
- **dictionary:** per word, keep the entry with the larger `t`. Removing a word sets
  `deleted: true` (a tombstone), so a removal on one device wins over an older save on the
  other. Tombstones are kept (they are tiny).
- **srs:** per card, keep the entry with more reviews (`reps`); ties go to the larger `t`,
  then the JSON string. There is no reset filter, so this maximum is already associative
  and nothing like `statsLater` is needed: no `srsLater` is read or written. Stats and srs
  share one merge helper, parameterised by the count field, the minimum `t` and whether to
  keep the later entries.
- **customCards:** per id, keep the entry with the larger `t`, like the dictionary. Deleting
  a card replaces it with a minimal tombstone `{ id, t, deleted: true }`; tombstones are
  kept. Readers take a card's id from its map key.
- **Malformed data:** in `dictionary`, `customCards`, `stats` and `srs`, an entry that is
  not an object (or is an array) counts as absent, and a whole map that is not an object
  (or is an array) counts as `{}`. A v2 state saved before `srs`/`customCards` existed
  loads with both as `{}`. `settings.srs` is optional; it is read through `srsSettings`,
  which fills defaults and drops bad values, and `setSrsSettings` stores only that
  sanitised value.
- **resetAt:** the larger value wins. A reset clears stats and best streak, but leaves the
  dictionary, `srs` and `customCards` alone.
- **bestStreak** with `t < resetAt` is treated as `{ value: 0 }`.
- **Ties** (equal `t`) are broken deterministically by comparing the two entries'
  JSON strings, so both devices pick the same winner.
- `merge` is commutative, associative and idempotent: `merge(a, b)` equals `merge(b, a)`,
  `merge(merge(a, b), c)` equals `merge(a, merge(b, c))`, and `merge(a, a)` equals `a`.

**Migration:** on first load of the new version, the existing v1 `localStorage` data
(`hiragana-practice-v1`) is converted to v2. Settings, stats and best streak get `t = 1`
(above a fresh device's 0, below any real change), not the migration time, so migrated items
never beat real v2 settings or a reset, and for stats the bigger answer history wins. Stats that were never answered are skipped. Dictionary entries
keep their original saved time.

## 3. Sync

**Setup (⚙️ Sync panel):** the user pastes a token. The app checks it by calling
`GET /user`, then lists the user's gists to find one containing `hiragana-progress.json`.
If none exists, it creates a secret gist. The gist ID and token are stored in
`localStorage` under a separate key (they are never synced and never committed). A
"Disconnect" button removes them.

**Sync cycle:** pull the gist → `merge(local, remote)` → save locally and re-render → if
the merged result differs from the remote, PATCH the gist.

**When a sync runs:**
- on app start
- when the page becomes visible again (`visibilitychange`)
- when the browser comes back online
- about 3 seconds after the last local change (debounced)
- when the user taps **Sync now**

Only one sync runs at a time; a request made during a sync queues one follow-up run.

**Status indicator:** shows "Sync not set up", "Syncing…", "Synced HH:MM",
"Offline — will sync later", or "Sync error: <message>". A bad or expired token (HTTP 401)
or a missing gist (HTTP 404) shows a clear message and stops automatic sync until the user
disconnects and connects again. During the first Connect, a rejected token shows "GitHub
rejected this token. Check it and try again." instead. A network failure shows the offline
status and retries after 30 seconds.

## 4. Offline and updates

`sw.js` precaches the app's own files as one versioned set:

- **Versioned cache:** the cache is named `hiragana-<VERSION>`. VERSION is a content hash of
  every precached file, generated by `npm run bump-sw` and enforced by a test that fails when
  it is stale. Old caches are deleted on activation.
- **Atomic precache at install:** each file is fetched with a `?v=<VERSION>` query and
  `cache: "reload"` to bypass the browser cache and CDN, then stored under its plain path.
  If any response is not ok, the install fails and the old version keeps running.
- **Cache-first serving, no runtime writes:** same-origin GETs are answered from the cache
  (ignoring the query string) and fall back to the network; nothing is added to the cache
  after install. Offline navigation falls back to the cached `./`.
- **Updates:** a new worker activates immediately and the page reloads once when it takes
  control, so old and new files never mix.
- **GitHub API:** requests to `api.github.com` are never handled by the service worker.

## 5. Mobile layout

- Under 640px wide, the top nav becomes a fixed bottom tab bar (icon + short label) that
  respects the iPhone safe-area insets.
- The prompt character, choice buttons, and chart cells scale down; the 5-column chart
  fits a 375px screen.
- Word grids use one or two columns.
- Tap targets are at least 44px.
- The answer field uses a 16px+ font (prevents iOS zoom on focus) and keeps
  `autocapitalize`/`autocorrect` off.
- `apple-mobile-web-app-capable` and status-bar meta tags give a full-screen app look.

## 6. Testing

- `node --test` for the merge rules: disjoint changes, conflicting edits (newer
  wins), a removal against an older save, a save after a removal, a reset on one side,
  commutativity/idempotence, and v1 → v2 migration.
- Playwright at an iPhone viewport (390×844) and a desktop viewport: practice flow, words,
  dictionary, sync panel; no console errors.
- The sync client is tested against a mocked `fetch`. A real end-to-end sync between Mac
  and iPhone is done by the user with their own token.

## 7. Publishing

Create the public repo `yupeng9/hiragana`, push `main`, enable Pages from the `main` root,
and confirm the site loads. Later changes reach the devices only when pushed.

## Out of scope

- Accounts or login other than the GitHub token
- Real-time sync between two devices open at the same moment (sync happens on the
  triggers above)
- Encrypting the gist contents
