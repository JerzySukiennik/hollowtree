// Hollowtree — Firebase Realtime Database transport: no auth, a persisted client id, server-clock correction, onDisconnect presence and real runTransaction.

import { NET } from '../config.net.js';
import { byteLength, clone, createStats, localIdentity } from './util.js';

let sdkPromise = null;

function loadSdk() {
  if (sdkPromise) return sdkPromise;
  const urls = NET.firebaseSdk;
  sdkPromise = Promise.all([
    import(/* @vite-ignore */ urls.appUrl),
    import(/* @vite-ignore */ urls.dbUrl),
  ]).then(([app, db]) => ({ app, db }));
  return sdkPromise;
}

export function firebaseConfigured() {
  const c = NET.FIREBASE;
  return Boolean(c && c.databaseURL && c.apiKey && c.projectId);
}

export async function createFirebaseDriver(options) {
  const opts = options || {};
  if (!firebaseConfigured()) {
    throw new Error('Firebase is not configured — fill NET.FIREBASE in src/config.net.js');
  }

  const sdk = await loadSdk();
  const { initializeApp, getApps, getApp } = sdk.app;
  const {
    getDatabase, ref, set, update, remove, get, onValue,
    onChildAdded, onChildChanged, onChildRemoved,
    runTransaction, onDisconnect, serverTimestamp, goOffline,
  } = sdk.db;

  const app = getApps().length ? getApp() : initializeApp(NET.FIREBASE);
  const database = getDatabase(app);

  // There is no Firebase Auth on this project, so identity is a random id kept in
  // localStorage. It is stable across sessions and lexicographically comparable,
  // which is everything the lowest-id authority rule needs.
  const uid = localIdentity();

  const stats = createStats();
  stats.startedAt = Date.now();

  let timeOffset = 0;
  const offsetOff = onValue(ref(database, '.info/serverTimeOffset'), (snap) => {
    const value = snap.val();
    if (typeof value === 'number') timeOffset = value;
  });

  let connected = false;
  let resolveConnected = null;
  const firstConnection = new Promise((resolve) => { resolveConnected = resolve; });
  const connectedOff = onValue(ref(database, '.info/connected'), (snap) => {
    connected = snap.val() === true;
    if (connected && resolveConnected) { resolveConnected(true); resolveConnected = null; }
  });

  // A dead socket must never stall the loading screen — the caller falls back.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), NET.connectTimeoutSec * 1000));
  const online = await Promise.race([firstConnection, timeout]);
  if (!online) {
    offsetOff();
    connectedOff();
    try { goOffline(database); } catch (error) { /* nothing open yet */ }
    throw new Error(`Realtime Database did not connect within ${NET.connectTimeoutSec}s`);
  }

  const teardown = [offsetOff, connectedOff];
  const disconnects = new Map();
  let disposed = false;

  function node(path) {
    return ref(database, path);
  }

  function countSent(value) {
    stats.bytesSent += byteLength(value);
    stats.messagesSent++;
  }

  function countReceived(value) {
    stats.bytesReceived += byteLength(value);
    stats.messagesReceived++;
  }

  const driver = {
    kind: 'firebase',
    uid,
    code: opts.code,
    stats,
    get connected() { return connected; },
    rawNow: () => Date.now(),

    // Server-corrected wall clock. Never use Date.now() for world time.
    now() {
      return Date.now() + timeOffset;
    },

    serverTimestamp() {
      return serverTimestamp();
    },

    async get(path) {
      const snap = await get(node(path));
      const value = snap.val();
      countReceived(value);
      return value;
    },

    async set(path, value) {
      countSent(value);
      await set(node(path), value === undefined ? null : value);
    },

    async update(path, patch) {
      countSent(patch);
      await update(node(path), patch);
    },

    async remove(path) {
      countSent(null);
      await remove(node(path));
    },

    async transact(path, fn) {
      const result = await runTransaction(node(path), (current) => fn(clone(current)), {
        applyLocally: false,
      });
      countSent(result && result.snapshot ? result.snapshot.val() : null);
      return {
        committed: Boolean(result && result.committed),
        value: result && result.snapshot ? result.snapshot.val() : null,
      };
    },

    subscribe(path, cb) {
      const off = onValue(node(path), (snap) => {
        const value = snap.val();
        countReceived(value);
        cb(value, path);
      });
      teardown.push(off);
      return () => {
        off();
        const i = teardown.indexOf(off);
        if (i !== -1) teardown.splice(i, 1);
      };
    },

    subscribeChildren(path, handlers) {
      const target = node(path);
      const offs = [];
      if (handlers && handlers.onAdd) {
        offs.push(onChildAdded(target, (snap) => {
          countReceived(snap.val());
          handlers.onAdd(snap.key, snap.val());
        }));
      }
      if (handlers && handlers.onChange) {
        offs.push(onChildChanged(target, (snap) => {
          countReceived(snap.val());
          handlers.onChange(snap.key, snap.val());
        }));
      }
      if (handlers && handlers.onRemove) {
        offs.push(onChildRemoved(target, (snap) => handlers.onRemove(snap.key)));
      }
      for (const off of offs) teardown.push(off);
      return () => {
        for (const off of offs) {
          off();
          const i = teardown.indexOf(off);
          if (i !== -1) teardown.splice(i, 1);
        }
      };
    },

    async onDisconnectRemove(path) {
      const handle = onDisconnect(node(path));
      disconnects.set(path, handle);
      await handle.remove();
    },

    async cancelDisconnect(path) {
      const handle = disconnects.get(path);
      disconnects.delete(path);
      if (handle) await handle.cancel();
    },

    flushDisconnect() {
      for (const path of Array.from(disconnects.keys())) {
        disconnects.delete(path);
        remove(node(path)).catch(() => {});
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      driver.flushDisconnect();
      for (const off of teardown) {
        try { off(); } catch (error) { /* already detached */ }
      }
      teardown.length = 0;
      try { goOffline(database); } catch (error) { /* already offline */ }
    },
  };

  return driver;
}
