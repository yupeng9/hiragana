// Syncs progress through one file in a secret GitHub Gist.
import { merge, canonical } from "./merge.js";
import { isValidV2 } from "./store.js";

const API = "https://api.github.com";
export const GIST_FILE = "hiragana-progress.json";
// Per-device sync settings { token, gistId, login }; stored locally, never synced.
export const CONFIG_KEY = "hiragana-sync";

const isConfig = v => !!v && typeof v === "object" && !Array.isArray(v) &&
  typeof v.token === "string" && typeof v.gistId === "string" &&
  (v.login === undefined || typeof v.login === "string");

// Returns the saved config, or null if there is none or it is unusable (then it is removed).
export function loadConfig(storage) {
  const raw = storage.getItem(CONFIG_KEY);
  if (raw === null) return null;
  let config;
  try { config = JSON.parse(raw); } catch { config = undefined; }
  if (isConfig(config)) return config;
  storage.removeItem(CONFIG_KEY);
  return null;
}

export const saveConfig = (storage, config) => storage.setItem(CONFIG_KEY, JSON.stringify(config));
export const clearConfig = storage => storage.removeItem(CONFIG_KEY);

// status 0 = network failure (offline); -1 = the gist's file is unusable (a remote data
// problem, worth retrying later); otherwise the HTTP status.
export class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const MESSAGES = {
  401: "GitHub rejected the token (wrong or expired). Disconnect and connect with a new token.",
  404: "The sync gist was not found. Disconnect and connect again.",
};

export class GistClient {
  constructor(token, fetchFn = (...args) => globalThis.fetch(...args)) {
    this.token = token.trim();
    this.fetch = fetchFn;
  }

  async request(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await this.fetch(API + path, {
        method,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError("You're offline.", 0);
    }
    if (!res.ok) throw new SyncError(MESSAGES[res.status] || `GitHub returned ${res.status}.`, res.status);
    return res.json();
  }

  user() {
    return this.request("/user");
  }

  async findGist() {
    for (let page = 1; page <= 10; page++) {
      const gists = await this.request(`/gists?per_page=100&page=${page}`);
      const hit = gists.find(g => g.files && GIST_FILE in g.files);
      if (hit) return hit.id;
      if (gists.length < 100) break;
    }
    return null;
  }

  async createGist(state) {
    const gist = await this.request("/gists", {
      method: "POST",
      body: {
        description: "Hiragana Practice progress (synced by the app)",
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(state) } },
      },
    });
    return gist.id;
  }

  async read(gistId) {
    const gist = await this.request(`/gists/${gistId}`);
    const file = gist.files?.[GIST_FILE];
    if (!file) return null;
    if (file.truncated) throw new SyncError("The sync file is too large to read.", -1);
    let parsed;
    try {
      parsed = JSON.parse(file.content);
    } catch {
      parsed = undefined;
    }
    if (!isValidV2(parsed)) {
      throw new SyncError("The sync file in your gist is not valid progress data. Fix or delete it, then Sync now.", -1);
    }
    return parsed;
  }

  write(gistId, state) {
    return this.request(`/gists/${gistId}`, {
      method: "PATCH",
      body: { files: { [GIST_FILE]: { content: JSON.stringify(state) } } },
    });
  }
}

// Checks the token and finds this user's progress gist, creating it on first use.
export async function connect(client, state) {
  const { login } = await client.user();
  let gistId = await client.findGist();
  if (gistId === null) {
    try {
      gistId = await client.createGist(state);
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        throw new SyncError("This token can't create gists. Create a classic token with the gist scope.", e.status);
      }
      throw e;
    }
  }
  return { login, gistId };
}

// Runs pull → merge → push cycles, one at a time.
// onStatus receives { kind: "syncing" | "ok" | "offline" | "error", at?, message? }.
export class Syncer {
  constructor({ client, gistId, getState, applyState, onStatus, isOnline = () => true, delay = 3000, retryDelay = 30000 }) {
    Object.assign(this, { client, gistId, getState, applyState, onStatus, isOnline, delay, retryDelay });
    this.active = null;     // promise of the running cycle loop
    this.again = false;     // a run was requested while one was active
    this.stopped = false;   // set after a 401/404 or stop(); needs a new Syncer to resume
    this.timer = null;
  }

  // Debounced run, used after local changes.
  schedule() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run().catch(e => console.error("sync failed", e)), this.delay);
  }

  run() {
    if (this.stopped) return Promise.resolve();
    if (this.active) {
      this.again = true;
      return this.active;
    }
    this.active = (async () => {
      try {
        do {
          this.again = false;
          await this.cycle();
        } while (this.again && !this.stopped);
      } finally {
        this.active = null;
      }
    })();
    return this.active;
  }

  async cycle() {
    if (!this.isOnline()) {
      this.onStatus({ kind: "offline" });
      return;
    }
    this.onStatus({ kind: "syncing" });
    try {
      const remote = await this.client.read(this.gistId);
      if (this.stopped) return;
      const merged = remote ? merge(this.getState(), remote) : this.getState();
      this.applyState(merged);
      if (!remote || canonical(merged) !== canonical(remote)) {
        await this.client.write(this.gistId, merged);
        if (this.stopped) return;
      }
      this.onStatus({ kind: "ok", at: new Date() });
    } catch (e) {
      if (this.stopped) return;  // stop() was called while this cycle was in flight
      if (e.status === 0) {
        this.onStatus({ kind: "offline" });
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.run().catch(e => console.error("sync failed", e)), this.retryDelay);
        return;
      }
      if (e.status === 401 || e.status === 404) this.stopped = true;
      this.onStatus({ kind: "error", message: e.message });
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
