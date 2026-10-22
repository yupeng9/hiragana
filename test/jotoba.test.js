import { test } from "node:test";
import assert from "node:assert/strict";
import { accentFromPitch, searchJotoba } from "../js/jotoba.js";

const P = (...pairs) => pairs.map(([part, high]) => ({ part, high }));

test("accentFromPitch: a drop inside the word gives the accent number", () => {
  assert.equal(accentFromPitch(P(["ね", true], ["こ", false]), "ねこ"), 1);                    // head-high
  assert.equal(accentFromPitch(P(["お", false], ["と", true], ["うと", false]), "おとうと"), 2); // middle-high, 2nd mora
  assert.equal(accentFromPitch(P(["た", false], ["べも", true], ["の", false]), "たべもの"), 3);
  assert.equal(accentFromPitch(P(["き", true], ["ょう", false]), "きょう"), null, "a part that splits a mora (きょ) cannot be trusted");
  assert.equal(accentFromPitch(P(["きょ", true], ["う", false]), "きょう"), 1, "きょ stays together, one mora");
});

test("accentFromPitch: no drop inside the word is ambiguous, so null", () => {
  assert.equal(accentFromPitch(P(["べ", false], ["んきょう", true]), "べんきょう"), null);
  assert.equal(accentFromPitch(P(["は", false], ["な", true]), "はな"), null);
  assert.equal(accentFromPitch(P(["ひ", true]), "ひ"), null);
  assert.equal(accentFromPitch(P(["あ", false], ["い", false]), "あい"), null);
});

test("accentFromPitch: bad or mismatched data gives null", () => {
  assert.equal(accentFromPitch(undefined, "ねこ"), null);
  assert.equal(accentFromPitch([], "ねこ"), null);
  assert.equal(accentFromPitch(P(["ね", true], ["こ", false]), "いぬ"), null, "parts must spell the reading");
  assert.equal(accentFromPitch([null, { part: "こ", high: false }], "ねこ"), null);
  assert.equal(accentFromPitch("x", "ねこ"), null);
});

const reply = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });
const NEKO = {
  reading: { kana: "ねこ", kanji: "猫", furigana: "[猫|ねこ]" },
  senses: [
    { glosses: ["cat (esp. the domestic cat)", "feline"], language: "English" },
    { glosses: ["shamisen"], language: "English" },
    { glosses: ["geisha"], language: "English" },
  ],
  pitch: P(["ね", true], ["こ", false]),
};
const KANA_ONLY = { reading: { kana: "ありがとう" }, senses: [{ glosses: ["thank you"], language: "English" }] };

test("searchJotoba maps results: word, reading, three glosses, accent", async () => {
  let call;
  const fetchFn = async (url, opts) => { call = { url, opts }; return reply({ words: [NEKO, KANA_ONLY] }); };
  const r = await searchJotoba("map-1", { fetchFn });
  assert.equal(call.url, "https://jotoba.de/api/search/words");
  assert.equal(call.opts.method, "POST");
  assert.deepEqual(JSON.parse(call.opts.body), { query: "map-1", language: "English", no_english: false });
  assert.deepEqual(r[0], { key: "猫|ねこ", word: "猫", kana: "ねこ", en: "cat (esp. the domestic cat); feline; shamisen", zh: "", accent: 1, source: "dictionary" });
  assert.deepEqual(r[1], { key: "ありがとう|ありがとう", word: "ありがとう", kana: "ありがとう", en: "thank you", zh: "", accent: null, source: "dictionary" });
});

test("searchJotoba returns at most 5 results and skips unusable ones", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ reading: { kana: `あ${"い".repeat(i + 1)}` }, senses: [{ glosses: [`w${i}`] }] }));
  const junk = [null, {}, { reading: {} }, { reading: { kana: "ゆ" }, senses: [] }, { reading: { kana: "ゆ" }, senses: [{ glosses: [] }] }];
  const r = await searchJotoba("many-1", { fetchFn: async () => reply({ words: [...junk, ...many] }) });
  assert.equal(r.length, 5);
  assert.ok(r.every(w => w.en.startsWith("w")));
});

test("searchJotoba caches by query and ignores an empty query", async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return reply({ words: [NEKO] }); };
  await searchJotoba("cache-1", { fetchFn });
  await searchJotoba("cache-1", { fetchFn });
  assert.equal(calls, 1);
  assert.deepEqual(await searchJotoba("   ", { fetchFn }), []);
  assert.equal(calls, 1);
});

test("searchJotoba reports network errors, bad status, bad JSON and timeouts", async () => {
  await assert.rejects(searchJotoba("err-1", { fetchFn: async () => { throw new TypeError("Failed to fetch"); } }), /reach the dictionary/);
  await assert.rejects(searchJotoba("err-2", { fetchFn: async () => reply({}, false, 503) }), /error \(503\)/);
  await assert.rejects(searchJotoba("err-3", { fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } }) }), /unreadable/);
  const hang = (_url, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  await assert.rejects(searchJotoba("err-4", { fetchFn: hang, timeoutMs: 20 }), /too long/);
  assert.deepEqual(await searchJotoba("err-5", { fetchFn: async () => reply({ words: "nope" }) }), []);
});

test("searchJotoba stops when the caller aborts and marks the error", async () => {
  const hang = (_url, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const ctl = new AbortController();
  const p = searchJotoba("abort-1", { fetchFn: hang, signal: ctl.signal, timeoutMs: 5000 });
  ctl.abort();
  await assert.rejects(p, e => e.aborted === true);
});

test("a timeout while the body is being read reports the timeout, not bad JSON", async () => {
  const slowBody = (_url, opts) => ({
    ok: true, status: 200,
    json: () => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  });
  await assert.rejects(searchJotoba("slow-body-1", { fetchFn: slowBody, timeoutMs: 20 }), /too long/);
  const ctl = new AbortController();
  const p = searchJotoba("slow-body-2", { fetchFn: slowBody, signal: ctl.signal, timeoutMs: 5000 });
  setTimeout(() => ctl.abort(), 10);
  await assert.rejects(p, e => e.aborted === true);
});
