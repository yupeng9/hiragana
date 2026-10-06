import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeVersion, precacheFiles } from "../scripts/bump-sw.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sw = readFileSync(join(root, "sw.js"), "utf8");

test("sw.js VERSION matches the precached files", () => {
  const version = /^const VERSION = "(.*)";$/m.exec(sw)?.[1];
  assert.equal(version, computeVersion(root), "sw.js VERSION is stale — run npm run bump-sw");
});

test("every precached file exists", () => {
  for (const f of precacheFiles(sw)) {
    assert.ok(existsSync(join(root, f === "./" ? "index.html" : f)), `${f} is listed in sw.js but missing`);
  }
});

test("every app file is precached", () => {
  const listed = new Set(precacheFiles(sw));
  const expected = [
    "index.html", "manifest.webmanifest",
    ...["js", "css"].flatMap(d => readdirSync(join(root, d)).map(f => `${d}/${f}`)),
    ...readdirSync(join(root, "icons")).filter(f => f.endsWith(".png")).map(f => `icons/${f}`),
  ];
  for (const f of expected) assert.ok(listed.has(f), `${f} is missing from the FILES list in sw.js`);
});
