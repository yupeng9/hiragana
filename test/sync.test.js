import { test } from "node:test";
import assert from "node:assert/strict";
import { GistClient, Syncer, connect, GIST_FILE } from "../js/sync.js";
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
function harness({ remote = null, local = emptyState(), online = true, readError } = {}) {
  const h = { remote, local, statuses: [], writes: 0, reads: 0 };
  h.client = {
    read: async () => { h.reads++; if (readError) throw readError; return h.remote; },
    write: async (_id, s) => { h.writes++; h.remote = JSON.parse(JSON.stringify(s)); },
  };
  h.syncer = new Syncer({
    client: h.client, gistId: "g1",
    getState: () => h.local,
    applyState: s => { h.local = s; },
    onStatus: s => h.statuses.push(s.kind),
    isOnline: () => online,
    delay: 0,
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
