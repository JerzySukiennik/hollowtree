// Hollowtree — same-machine transport: BroadcastChannel + localStorage behind the exact driver interface the Firebase RTDB driver implements.

import { NET } from '../config.net.js';
import {
  byteLength, clone, createStats, getPath, makeUid, pathsOverlap, setPath,
} from './util.js';

const L = NET.local;

// Shared across every driver in this context, so peers still find each other when
// localStorage is unavailable (private browsing, or a headless test runner).
const memory = new Map();
const memoryStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

function pickStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ht.net.probe', '1');
      localStorage.removeItem('ht.net.probe');
      return localStorage;
    }
  } catch (error) {
    // private mode or disabled storage — fall through
  }
  return memoryStorage;
}

export async function createLocalDriver(options) {
  const opts = options || {};
  const code = String(opts.code || 'LOCAL').toUpperCase();
  const uid = opts.uid || makeUid();
  const storage = pickStorage();
  const storeKey = L.storagePrefix + code;
  const channelName = L.storagePrefix + code;
  const stats = createStats();
  stats.startedAt = Date.now();

  // Pretend this tab's wall clock is wrong by clientSkew. Everything the game reads
  // goes through now(), which corrects back to the shared "server" clock, so a wrong
  // local clock can never leak into world time.
  const clientSkew = (Math.random() * 2 - 1) * L.clientSkewSpreadMs;
  const rawNow = () => Date.now() + clientSkew;

  let channel = null;
  try {
    if (typeof BroadcastChannel === 'function') channel = new BroadcastChannel(channelName);
  } catch (error) {
    channel = null;
  }

  const valueSubs = [];
  const childSubs = [];
  const disconnects = new Map();
  const timers = new Set();
  let disposed = false;
  let lockChain = Promise.resolve();

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function latency() {
    return Math.max(0, L.latencyMs + (Math.random() * 2 - 1) * L.latencyJitterMs);
  }

  function wait(ms) {
    return new Promise((resolve) => later(resolve, ms));
  }

  function readStore() {
    let raw = null;
    try {
      raw = storage.getItem(storeKey);
    } catch (error) {
      raw = null;
    }
    if (!raw) return { __c: 0, __w: {}, __skew: null, tree: {} };
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('bad');
      parsed.__w = parsed.__w || {};
      parsed.tree = parsed.tree || {};
      parsed.__c = parsed.__c || 0;
      return parsed;
    } catch (error) {
      return { __c: 0, __w: {}, __skew: null, tree: {} };
    }
  }

  function writeStore(store) {
    try {
      storage.setItem(storeKey, JSON.stringify(store));
    } catch (error) {
      // quota — the mirror in memory still works for this tab
    }
  }

  async function withLock(fn) {
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return navigator.locks.request(`${channelName}.lock`, fn);
    }
    const previous = lockChain;
    let release;
    lockChain = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  // Highest write counter of any path that overlaps `path` — the optimistic-concurrency
  // stamp a transaction validates against.
  function stampOf(store, path) {
    let max = 0;
    for (const key of Object.keys(store.__w)) {
      if (!pathsOverlap(key, path)) continue;
      if (store.__w[key] > max) max = store.__w[key];
    }
    return max;
  }

  function applyLocal(store, path, value) {
    store.__c = (store.__c || 0) + 1;
    store.__w[path] = store.__c;
    setPath(store.tree, path, value === undefined ? null : value);
    return store.__c;
  }

  function broadcast(ops) {
    if (!channel || !ops.length) return;
    const message = { from: uid, ops };
    let bytes = 0;
    for (const op of ops) bytes += op.path.length + byteLength(op.value);
    stats.bytesSent += bytes;
    stats.messagesSent += ops.length;
    try {
      channel.postMessage(message);
    } catch (error) {
      // structured clone failure — values are always JSON-safe here
    }
  }

  function emit(paths) {
    const store = readStore();
    for (const sub of valueSubs.slice()) {
      if (!paths.some((p) => pathsOverlap(p, sub.path))) continue;
      const value = getPath(store.tree, sub.path);
      sub.cb(clone(value), sub.path);
    }
    for (const sub of childSubs.slice()) {
      if (!paths.some((p) => pathsOverlap(p, sub.path))) continue;
      const node = getPath(store.tree, sub.path) || {};
      const keys = Object.keys(node);
      for (const key of keys) {
        const value = clone(node[key]);
        const prior = sub.known.get(key);
        const serialized = JSON.stringify(value === undefined ? null : value);
        if (prior === undefined) {
          sub.known.set(key, serialized);
          if (sub.onAdd) sub.onAdd(key, value);
        } else if (prior !== serialized) {
          sub.known.set(key, serialized);
          if (sub.onChange) sub.onChange(key, value);
        }
      }
      for (const key of Array.from(sub.known.keys())) {
        if (keys.indexOf(key) !== -1) continue;
        sub.known.delete(key);
        if (sub.onRemove) sub.onRemove(key);
      }
    }
  }

  function receive(message) {
    if (disposed || !message || message.from === uid || !Array.isArray(message.ops)) return;
    let bytes = 0;
    for (const op of message.ops) bytes += op.path.length + byteLength(op.value);
    stats.bytesReceived += bytes;
    stats.messagesReceived += message.ops.length;
    later(() => emit(message.ops.map((op) => op.path)), latency());
  }

  if (channel) channel.onmessage = (event) => receive(event.data);

  function onStorage(event) {
    if (disposed || !event || event.key !== storeKey) return;
    later(() => emit(['']), 0);
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  async function commit(ops) {
    await wait(latency());
    await withLock(() => {
      const store = readStore();
      for (const op of ops) applyLocal(store, op.path, op.value);
      writeStore(store);
    });
    broadcast(ops);
    emit(ops.map((op) => op.path));
  }

  const driver = {
    kind: 'local',
    uid,
    code,
    stats,
    rawNow,

    now() {
      const store = readStore();
      const skew = typeof store.__skew === 'number' ? store.__skew : L.clockSkewMs;
      // rawNow() is this tab's (deliberately wrong) clock; the offset corrects it to the
      // shared clock, exactly as .info/serverTimeOffset does on RTDB.
      return rawNow() - clientSkew + skew;
    },

    serverTimestamp() {
      return driver.now();
    },

    async get(path) {
      const store = readStore();
      return clone(getPath(store.tree, path));
    },

    async set(path, value) {
      await commit([{ path, value }]);
    },

    async update(path, patch) {
      const ops = Object.keys(patch || {}).map((key) => ({
        path: `${path}/${key}`,
        value: patch[key],
      }));
      if (ops.length) await commit(ops);
    },

    async remove(path) {
      await commit([{ path, value: null }]);
    },

    async transact(path, fn) {
      for (let attempt = 0; attempt < NET.bank.transactionRetries; attempt++) {
        const before = readStore();
        const baseStamp = stampOf(before, path);
        const current = clone(getPath(before.tree, path));
        const next = fn(current);
        if (next === undefined) return { committed: false, value: current };
        await wait(latency());
        const ok = await withLock(() => {
          const store = readStore();
          if (stampOf(store, path) !== baseStamp) return false;
          applyLocal(store, path, next);
          writeStore(store);
          return true;
        });
        if (ok) {
          broadcast([{ path, value: next }]);
          emit([path]);
          return { committed: true, value: next, attempts: attempt + 1 };
        }
        stats.transactionRetries++;
        // Exponential backoff with jitter, so colliding clients spread out instead of
        // lock-stepping into each other on every retry.
        const backoff = Math.min(NET.bank.retryBackoffMaxMs, NET.bank.retryBackoffMs * Math.pow(1.6, attempt));
        await wait(backoff * (0.5 + Math.random()));
      }
      return { committed: false, value: clone(getPath(readStore().tree, path)), exhausted: true };
    },

    subscribe(path, cb) {
      const sub = { path, cb };
      valueSubs.push(sub);
      const store = readStore();
      cb(clone(getPath(store.tree, path)), path);
      return () => {
        const i = valueSubs.indexOf(sub);
        if (i !== -1) valueSubs.splice(i, 1);
      };
    },

    subscribeChildren(path, handlers) {
      const sub = {
        path,
        known: new Map(),
        onAdd: handlers && handlers.onAdd,
        onChange: handlers && handlers.onChange,
        onRemove: handlers && handlers.onRemove,
      };
      childSubs.push(sub);
      const node = getPath(readStore().tree, path) || {};
      for (const key of Object.keys(node)) {
        sub.known.set(key, JSON.stringify(node[key]));
        if (sub.onAdd) sub.onAdd(key, clone(node[key]));
      }
      return () => {
        const i = childSubs.indexOf(sub);
        if (i !== -1) childSubs.splice(i, 1);
      };
    },

    async onDisconnectRemove(path) {
      disconnects.set(path, null);
    },

    async cancelDisconnect(path) {
      disconnects.delete(path);
    },

    // Fires the registered onDisconnect writes. Called on pagehide and by dispose().
    flushDisconnect() {
      if (!disconnects.size) return;
      const paths = Array.from(disconnects.keys());
      disconnects.clear();
      const store = readStore();
      for (const path of paths) applyLocal(store, path, null);
      writeStore(store);
      broadcast(paths.map((path) => ({ path, value: null })));
    },

    dispose() {
      if (disposed) return;
      driver.flushDisconnect();
      disposed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      valueSubs.length = 0;
      childSubs.length = 0;
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('pagehide', onLeave);
        window.removeEventListener('beforeunload', onLeave);
      }
      if (channel) {
        channel.onmessage = null;
        try { channel.close(); } catch (error) { /* already closed */ }
      }
    },
  };

  function onLeave() {
    driver.flushDisconnect();
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
  }

  // First tab in decides the shared clock skew so every peer agrees on "server" time.
  await withLock(() => {
    const store = readStore();
    if (typeof store.__skew !== 'number') {
      store.__skew = L.clockSkewMs;
      writeStore(store);
    }
  });

  return driver;
}
