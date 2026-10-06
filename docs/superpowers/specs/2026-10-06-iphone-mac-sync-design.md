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
| `sw.js` | Service worker: caches app files for offline use |
| `icons/` | App icons (180px apple-touch-icon, 192px, 512px) |
| `test/merge.test.js` | `node --test` unit tests for `merge.js` |

The modules are plain ES modules (`<script type="module">`), so no bundler is needed.

## 2. State and merge rules

Every mergeable item carries a timestamp `t` (ms since epoch) of its last change.

```
{
  version: 2,
  settings: { rows, mode, autoSpeak, t },
  stats:      { [kana]: { box, seen, correct, t } },
  dictionary: { [kana]: { t, deleted: boolean } },  // saved-at time = t of last save
  bestStreak: { value, t },
  resetAt: number            // time of the last "Reset progress", 0 if never
}
```

`merge(a, b)`:
- **settings:** keep the side with the larger `t`.
- **bestStreak:** a record, so the highest `value` since the last reset wins (ties: larger
  `t`). A lower record with a later `t` is kept in `bestStreakLater` (merge-only, optional),
  because it survives a reset that wipes the higher, older one; this keeps `merge`
  associative.
- **stats:** per kana, keep the entry with the larger `t`; drop entries with `t < resetAt`.
- **dictionary:** per word, keep the entry with the larger `t`. Removing a word sets
  `deleted: true` (a tombstone), so a removal on one device wins over an older save on the
  other. Tombstones are kept (they are tiny).
- **resetAt:** the larger value wins. A reset clears stats and best streak, but leaves the
  dictionary alone (matching current behaviour).
- **bestStreak** with `t < resetAt` is treated as `{ value: 0 }`.
- **Ties** (equal `t`) are broken deterministically by comparing the two entries'
  JSON strings, so both devices pick the same winner.
- `merge` is commutative and idempotent: `merge(a, b)` equals `merge(b, a)`, and
  `merge(a, a)` equals `a`.

**Migration:** on first load of the new version, the existing v1 `localStorage` data
(`hiragana-practice-v1`) is converted to v2. Every item gets `t` = migration time, and
dictionary entries keep their original saved time.

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

**Status indicator:** shows "Not set up", "Syncing…", "Synced 10:42", "Offline — will sync
later", or "Sync error: <message>". A bad or expired token (HTTP 401) shows a clear message
and stops automatic retries until the token is replaced.

## 4. Offline and updates

`sw.js` uses a versioned cache. The page loads from cache first while the service worker
fetches fresh copies in the background (stale-while-revalidate), so an update appears on
the next launch. Requests to `api.github.com` are never cached.

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
