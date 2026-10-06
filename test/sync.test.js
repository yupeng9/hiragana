import { test } from "node:test";
import assert from "node:assert/strict";
import { GistClient, Syncer, SyncError, connect, GIST_FILE, CONFIG_KEY, loadConfig, saveConfig, clearConfig } from "../js/sync.js";
import { emptyState } from "../js/store.js";

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// fetch stub: routes "METHOD path" to a handler; records calls.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    const key = `${opts.method} ${url.replace("https://api.github.com", "")}`;
    calls.push({ key, opts });
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected request ${key}`);
    return handler(opts);
  };
  fn.calls = calls;
  return fn;
}

const withWord = (kana, t) => {
  const s = emptyState();
  s.dictionary[kana] = { t, deleted: false };
  return s;
};

test("connect finds an existing gist by file name", async () => {
  const fetch = fakeFetch({
    "GET /user": () => reply(200, { login: "yupeng9" }),
    "GET /gists?per_page=100&page=1": () => reply(200, [
      { id: "other", files: { "notes.md": {} } },
      { id: "g1", files: { [GIST_FILE]: {} } },
    ]),
  });
  assert.deepEqual(await connect(new GistClient("tok", fetch), emptyState()), { login: "yupeng9", gistId: "g1" });
  assert.equal(fetch.calls[0].opts.headers.Authorization, "Bearer tok");
});

test("connect creates a secret gist when none exists", async () => {
  let created;
  const fetch = fakeFetch({
    "GET /user": () => reply(200, { login: "yupeng9" }),
    "GET /gists?per_page=100&page=1": () => reply(200, []),
    "POST /gists": opts => { created = JSON.parse(opts.body); return reply(201, { id: "new" }); },
  });
  const result = await connect(new GistClient("tok", fetch), withWord("かさ", 5));
  assert.equal(result.gistId, "new");
  assert.equal(created.public, false);
  assert.equal(JSON.parse(created.files[GIST_FILE].content).dictionary.かさ.t, 5);
});

test("client reports a bad token as status 401 and a network failure as status 0", async () => {
  const bad = new GistClient("tok", fakeFetch({ "GET /user": () => reply(401, {}) }));
  await assert.rejects(bad.user(), e => e.status === 401);
  const offline = new GistClient("tok", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(offline.user(), e => e.status === 0);
});

test("client reads and writes the progress file", async () => {
  let written;
  const fetch = fakeFetch({
    "GET /gists/g1": () => reply(200, { files: { [GIST_FILE]: { content: JSON.stringify(withWord("あい", 1)) } } }),
    "PATCH /gists/g1": opts => { written = JSON.parse(opts.body); return reply(200, {}); },
  });
  const client = new GistClient("tok", fetch);
  assert.equal((await client.read("g1")).dictionary.あい.t, 1);
  await client.write("g1", withWord("かさ", 2));
  assert.equal(JSON.parse(written.files[GIST_FILE].content).dictionary.かさ.t, 2);
});

// Syncer tests use a fake client with an in-memory "remote".
function harness({ remote = null, local = emptyState(), online = true, readError, writeError, extra = {} } = {}) {
  const h = { remote, local, statuses: [], writes: 0, reads: 0 };
  h.client = {
    read: async () => { h.reads++; if (readError) throw readError; return h.remote; },
    write: async (_id, s) => { h.writes++; if (writeError) throw writeError; h.remote = JSON.parse(JSON.stringify(s)); },
  };
  h.syncer = new Syncer({
    client: h.client, gistId: "g1",
    getState: () => h.local,
    applyState: s => { h.local = s; },
    onStatus: s => h.statuses.push(s.kind),
    isOnline: () => online,
    delay: 0,
    ...extra,
  });
  return h;
}

test("first sync uploads local progress when the gist is empty", async () => {
  const h = harness({ local: withWord("かさ", 5) });
  await h.syncer.run();
  assert.equal(h.writes, 1);
  assert.equal(h.remote.dictionary.かさ.t, 5);
  assert.deepEqual(h.statuses, ["syncing", "ok"]);
});

test("pulls remote changes and skips the upload when nothing is new locally", async () => {
  const h = harness({ remote: withWord("あい", 9) });
  await h.syncer.run();
  assert.equal(h.local.dictionary.あい.t, 9);
  assert.equal(h.writes, 0);
});

test("uploads when local has changes the remote lacks", async () => {
  const h = harness({ remote: withWord("あい", 9), local: withWord("かさ", 5) });
  await h.syncer.run();
  assert.equal(h.writes, 1);
  assert.deepEqual(Object.keys(h.remote.dictionary).sort(), ["あい", "かさ"]);
});

test("reports offline without contacting GitHub", async () => {
  const h = harness({ online: false });
  await h.syncer.run();
  assert.equal(h.reads, 0);
  assert.deepEqual(h.statuses, ["offline"]);
});

test("a network failure mid-sync reports offline", async () => {
  const h = harness({ readError: Object.assign(new Error("offline"), { status: 0 }) });
  await h.syncer.run();
  assert.deepEqual(h.statuses, ["syncing", "offline"]);
  h.syncer.stop(); // cancel the pending retry so the test process can exit
});

test("a rejected token stops automatic syncing", async () => {
  const h = harness({ readError: Object.assign(new Error("bad token"), { status: 401 }) });
  await h.syncer.run();
  await h.syncer.run();
  assert.equal(h.reads, 1);
  assert.deepEqual(h.statuses, ["syncing", "error"]);
});

test("a run requested during a sync causes exactly one more cycle", async () => {
  const h = harness();
  const first = h.syncer.run();
  const second = h.syncer.run();
  const third = h.syncer.run();
  await Promise.all([first, second, third]);
  assert.equal(h.reads, 2);
});

const tick = () => new Promise(r => setTimeout(r, 10));
const statusError = status => Object.assign(new Error(`status ${status}`), { status });

test("a rejected token (404 gist not found) stops automatic syncing", async () => {
  const h = harness({ readError: statusError(404) });
  await h.syncer.run();
  await h.syncer.run();
  assert.equal(h.reads, 1);
  assert.deepEqual(h.statuses, ["syncing", "error"]);
});

test("a 401 while writing reports an error and stops the syncer", async () => {
  const h = harness({ remote: withWord("あい", 9), local: withWord("かさ", 5), writeError: statusError(401) });
  await h.syncer.run();
  await h.syncer.run();
  assert.equal(h.reads, 1);
  assert.deepEqual(h.statuses, ["syncing", "error"]);
});

test("an exception escaping a cycle does not wedge later runs", async () => {
  let calls = 0;
  const h = harness({ extra: { onStatus: s => { if (calls++ === 0) throw new Error("ui broke"); } } });
  await assert.rejects(h.syncer.run(), /ui broke/);
  await h.syncer.run();
  assert.equal(h.reads, 1);
});

test("stop() while a read is pending applies nothing, writes nothing and reports nothing", async () => {
  const h = harness({ local: withWord("かさ", 5) });
  let release;
  h.client.read = () => new Promise(r => { h.reads++; release = () => r(withWord("あい", 9)); });
  const before = h.local;
  const run = h.syncer.run();
  h.syncer.stop();
  release();
  await run;
  assert.equal(h.local, before);
  assert.equal(h.writes, 0);
  assert.deepEqual(h.statuses, ["syncing"]);
});

test("stop() while a write is pending reports nothing afterwards", async () => {
  const h = harness({ remote: withWord("あい", 9), local: withWord("かさ", 5) });
  let release;
  h.client.write = () => new Promise(r => { h.writes++; release = r; });
  const run = h.syncer.run();
  await tick();
  h.syncer.stop();
  release();
  await run;
  assert.deepEqual(h.statuses, ["syncing"]);
});

test("an error arriving after stop() is not reported", async () => {
  const h = harness();
  let fail;
  h.client.read = () => new Promise((_, rej) => { h.reads++; fail = () => rej(statusError(401)); });
  const run = h.syncer.run();
  h.syncer.stop();
  fail();
  await run;
  assert.deepEqual(h.statuses, ["syncing"]);
});

test("a remote data problem (status -1) reports an error, keeps syncing and never writes", async () => {
  const local = withWord("かさ", 5);
  const h = harness({ local, readError: new SyncError("bad file", -1) });
  await h.syncer.run();
  await h.syncer.run();
  assert.equal(h.reads, 2);
  assert.equal(h.writes, 0);
  assert.equal(h.local, local);
  assert.deepEqual(h.statuses, ["syncing", "error", "syncing", "error"]);
});

test("a network failure retries after retryDelay", async () => {
  const h = harness({ remote: withWord("あい", 9), extra: { retryDelay: 0 } });
  const read = h.client.read;
  h.client.read = async id => { if (h.reads === 0) { h.reads++; throw statusError(0); } return read(id); };
  await h.syncer.run();
  await tick();
  assert.equal(h.reads, 2);
  assert.equal(h.statuses.at(-1), "ok");
});

test("the offline precheck does not schedule a retry", async () => {
  const h = harness({ online: false, extra: { retryDelay: 0 } });
  await h.syncer.run();
  await tick();
  assert.equal(h.reads, 0);
  assert.deepEqual(h.statuses, ["offline"]);
});

test("stop() cancels a pending offline retry", async () => {
  const h = harness({ readError: statusError(0), extra: { retryDelay: 5 } });
  await h.syncer.run();
  h.syncer.stop();
  await tick();
  assert.equal(h.reads, 1);
});

test("schedule() debounces several calls into one run", async () => {
  const h = harness();
  h.syncer.schedule();
  h.syncer.schedule();
  h.syncer.schedule();
  await tick();
  assert.equal(h.reads, 1);
});

test("stop() before a scheduled run fires prevents it", async () => {
  const h = harness();
  h.syncer.schedule();
  h.syncer.stop();
  await tick();
  assert.equal(h.reads, 0);
});

// GistClient details
const gistWith = content => fakeFetch({ "GET /gists/g1": () => reply(200, { files: { [GIST_FILE]: content } }) });
const INVALID = "The sync file in your gist is not valid progress data. Fix or delete it, then Sync now.";

test("reading a gist whose file holds invalid JSON is a remote data problem", async () => {
  const client = new GistClient("tok", gistWith({ content: "{oops" }));
  await assert.rejects(client.read("g1"), e => e.status === -1 && e.message === INVALID);
});

test("reading a gist whose file has the wrong shape is a remote data problem", async () => {
  const client = new GistClient("tok", gistWith({ content: '{"settings":"x"}' }));
  await assert.rejects(client.read("g1"), e => e.status === -1 && e.message === INVALID);
});

test("reading a gist without the progress file gives null", async () => {
  const client = new GistClient("tok", fakeFetch({ "GET /gists/g1": () => reply(200, { files: { "notes.md": {} } }) }));
  assert.equal(await client.read("g1"), null);
});

test("reading a truncated progress file is rejected", async () => {
  const client = new GistClient("tok", gistWith({ truncated: true, content: "{" }));
  await assert.rejects(client.read("g1"), e => e.status === -1 && /too large/.test(e.message));
});

test("client trims the token and sends the API version and no-store", async () => {
  const fetch = fakeFetch({ "GET /user": () => reply(200, { login: "x" }) });
  await new GistClient("  tok\n", fetch).user();
  const { headers, cache } = fetch.calls[0].opts;
  assert.equal(headers.Authorization, "Bearer tok");
  assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(cache, "no-store");
});

test("connect explains a token that cannot create gists", async () => {
  for (const status of [403, 404]) {
    const fetch = fakeFetch({
      "GET /user": () => reply(200, { login: "x" }),
      "GET /gists?per_page=100&page=1": () => reply(200, []),
      "POST /gists": () => reply(status, {}),
    });
    await assert.rejects(connect(new GistClient("tok", fetch), emptyState()),
      e => e.status === status && /classic token with the gist scope/.test(e.message));
  }
});

test("findGist looks at page 2 when page 1 is full of other gists", async () => {
  const full = Array.from({ length: 100 }, (_, i) => ({ id: `o${i}`, files: { "a.txt": {} } }));
  const fetch = fakeFetch({
    "GET /gists?per_page=100&page=1": () => reply(200, full),
    "GET /gists?per_page=100&page=2": () => reply(200, [{ id: "g2", files: { [GIST_FILE]: {} } }]),
  });
  assert.equal(await new GistClient("tok", fetch).findGist(), "g2");
});

const memoryStorage = (data = {}) => ({
  data,
  getItem(k) { return k in this.data ? this.data[k] : null; },
  setItem(k, v) { this.data[k] = String(v); },
  removeItem(k) { delete this.data[k]; },
});

test("sync config round-trips through saveConfig and loadConfig", () => {
  const storage = memoryStorage();
  const config = { token: "tok", gistId: "g1", login: "yupeng9" };
  saveConfig(storage, config);
  assert.deepEqual(loadConfig(storage), config);
  saveConfig(storage, { token: "tok", gistId: "g1" });
  assert.deepEqual(loadConfig(storage), { token: "tok", gistId: "g1" });
});

test("loadConfig returns null when nothing is stored", () => {
  assert.equal(loadConfig(memoryStorage()), null);
});

test("loadConfig returns null and removes corrupt JSON", () => {
  const storage = memoryStorage({ [CONFIG_KEY]: "{oops" });
  assert.equal(loadConfig(storage), null);
  assert.equal(storage.getItem(CONFIG_KEY), null);
});

test("loadConfig returns null and removes a value of the wrong shape", () => {
  for (const raw of ["{}", '{"token":1,"gistId":"g"}', '{"token":"t"}', '{"token":"t","gistId":"g","login":5}', "null", "[]", '"x"', "7"]) {
    const storage = memoryStorage({ [CONFIG_KEY]: raw });
    assert.equal(loadConfig(storage), null, raw);
    assert.equal(storage.getItem(CONFIG_KEY), null, raw);
  }
});

test("clearConfig removes the stored config", () => {
  const storage = memoryStorage();
  saveConfig(storage, { token: "t", gistId: "g", login: "l" });
  clearConfig(storage);
  assert.equal(storage.getItem(CONFIG_KEY), null);
});
