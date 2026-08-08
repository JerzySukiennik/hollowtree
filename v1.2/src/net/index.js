// Hollowtree — the multiplayer layer: own-queen authority at 10 Hz, interpolated peers, transactional shared bank, server-clock world and single-owner simulation.

import { RESOURCES } from '../config.js';
import { NET } from '../config.net.js';
import { createLocalDriver } from './driver-local.js';
import { createFirebaseDriver, firebaseConfigured } from './driver-firebase.js';
import { createInterpolator } from './interpolation.js';
import { computeOfflineGrant, regrownAmount, seasonAt } from './offline.js';
import {
  joinPath, makeUid, normalizeHiveCode, packMotion, sameSwarm, sanitizeSwarm, unpackMotion,
} from './util.js';

const KINDS = (RESOURCES && Array.isArray(RESOURCES.kinds) ? RESOURCES.kinds : ['pollen', 'nectar', 'resin']).slice();
const CAPACITY = (RESOURCES && RESOURCES.capacity) || {};
const RATE_PREFIX = 'r_';

function capacityOf(kind) {
  const value = Number(CAPACITY[kind]);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
}

// The deployed rules type every child of /hives/<code>/bank as a number, so the
// accrual stamp and the offline rates live there as flat numeric keys rather than as
// a nested object. That keeps the whole bank inside one transaction.
function emptyBank() {
  const bank = { lastActive: 0 };
  for (const kind of KINDS) {
    bank[kind] = Number((RESOURCES.start || {})[kind]) || 0;
    bank[RATE_PREFIX + kind] = Number(NET.bank.defaultRate[kind]) || 0;
  }
  return bank;
}

function ratesFrom(bank) {
  const rate = {};
  for (const kind of KINDS) {
    const value = Number(bank[RATE_PREFIX + kind]);
    rate[kind] = Number.isFinite(value) ? value : (Number(NET.bank.defaultRate[kind]) || 0);
  }
  return rate;
}

async function pickDriver(code, forced) {
  const want = forced || NET.driver;
  if (want === 'local') return createLocalDriver({ code });
  if (!firebaseConfigured()) {
    console.warn('[net] firebase driver requested but NET.FIREBASE is empty — falling back to local');
    return createLocalDriver({ code });
  }
  try {
    return await createFirebaseDriver({ code });
  } catch (error) {
    console.warn('[net] firebase unavailable, playing on the local driver —', error && error.message);
    return createLocalDriver({ code });
  }
}

export function createNet(session) {
  const ctx = session || {};
  const mode = ctx.mode === 'join' || ctx.mode === 'host' ? ctx.mode : 'solo';
  const code = normalizeHiveCode(ctx.code || (mode === 'solo' ? soloCode() : ''));
  const profile = {
    name: String((ctx.profile && ctx.profile.name) || 'Queen').slice(0, 24),
    color: (ctx.profile && ctx.profile.color) || 'amber',
    pattern: (ctx.profile && ctx.profile.pattern) || 'banded',
  };

  // Five subtrees, exactly the five the deployed rules allow.
  const root = joinPath(NET.root, code);
  const P = {
    presence: joinPath(root, 'presence'),
    queens: joinPath(root, 'queens'),
    bank: joinPath(root, 'bank'),
    world: joinPath(root, 'world'),
    comb: joinPath(root, 'comb'),
  };
  const W = {
    epoch: joinPath(P.world, 'epoch'),
    host: joinPath(P.world, 'host'),
    lease: joinPath(P.world, 'lease'),
    meta: joinPath(P.world, 'meta'),
    contrib: joinPath(P.world, 'contrib'),
  };
  const RESERVED = ['epoch', 'host', 'lease', 'meta', 'contrib', 'flowers', 'weather'];

  const peers = new Map();
  const joinListeners = [];
  const leaveListeners = [];
  const authorityListeners = [];
  const bankListeners = [];
  const presenceListeners = [];
  const presenceRaw = new Map();
  const metaRaw = new Map();
  const subs = [];

  let driver = null;
  let uid = null;
  let epoch = 0;
  let hostUid = null;
  let disposed = false;
  let isAuthority = false;
  let bankState = emptyBank();
  let offlineReport = null;

  let lastMotionAt = 0;
  let lastClockSyncAt = 0;
  let seq = 0;
  let lease = null;
  let lastUpdateAt = 0;
  let vacantSince = 0;
  let motionSends = 0;
  let weatherState = null;
  const flowerCache = new Map();
  let heartbeatTimer = null;
  let wasSimulating = false;

  const pending = {
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    carrying: 0,
    swarm: {},
    hasVelocity: false,
    dirty: false,
  };
  const lastSent = {
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    time: 0,
    valid: false,
  };
  let lastMetaSent = null;

  function normalizeFlower(value) {
    return {
      a: Number(value && value.a) || 0,
      d: Number(value && value.d) || 0,
    };
  }

  function fire(list, ...args) {
    for (const fn of list.slice()) {
      try { fn(...args); } catch (error) { console.warn('[net] listener failed —', error && error.message); }
    }
  }

  function now() {
    return driver ? driver.now() : Date.now();
  }

  // Every presence entry whose heartbeat is recent enough to count, including our own
  // only when we are actually simulating. A frozen client must not keep voting for
  // itself — that is precisely how two owners used to coexist.
  function livePresenceUids() {
    const at = now();
    const cutoff = at - NET.rates.presenceStaleSec * 1000;
    const out = [];
    for (const [id, entry] of presenceRaw) {
      const seen = Number(entry && entry.at) || 0;
      if (id === uid) {
        if (simulating(at)) out.push(id);
        continue;
      }
      if (seen && seen < cutoff) continue;
      out.push(id);
    }
    if (uid && simulating(at) && out.indexOf(uid) === -1) out.push(uid);
    return out.sort();
  }

  // update() has been called recently enough that this client is really running the
  // world forward. A backgrounded tab stops calling it, so this goes false on its own.
  function simulating(at) {
    const stamp = at || now();
    return lastUpdateAt > 0 && stamp - lastUpdateAt < NET.rates.simStaleSec * 1000;
  }

  function leaseLive(value, at) {
    return Boolean(value && value.uid && Number(value.exp) > at);
  }

  // The owner is whoever holds an unexpired lease — a pure function of the last lease
  // we saw and our server-corrected clock. No network is needed to notice our own
  // claim has run out, which is what makes expiry self-healing in a frozen tab.
  function ownerUid() {
    const at = now();
    return leaseLive(lease, at) ? lease.uid : null;
  }

  // The live answer to "am I the world simulation owner right now".
  function owns() {
    return ownerUid() === uid && simulating();
  }

  function recomputeAuthority() {
    const owner = ownerUid();
    // Remember when the lease first looked vacant: the grace period a non-lowest
    // client waits out is measured from here.
    if (owner) vacantSince = 0;
    else if (!vacantSince) vacantSince = now();
    const mine = owns();
    for (const [id, peer] of peers) peer.authority = id === owner;
    if (mine === isAuthority) return;
    isAuthority = mine;
    fire(authorityListeners, isAuthority, owner);
  }

  // Take the lease if it is vacant or expired, renew it if it is already ours, and
  // never touch it while somebody else's claim is still good. One transaction, so two
  // clients racing for a vacant lease cannot both win.
  async function tickLease() {
    if (!driver || disposed) return;
    const at = now();
    if (!simulating(at)) {
      // Not simulating: do not renew, do not claim. If the lease was ours it simply
      // runs out, and the next client takes over cleanly.
      recomputeAuthority();
      return;
    }
    const mineAlready = leaseLive(lease, at) && lease.uid === uid;
    if (!mineAlready) {
      // Somebody else's claim is still good — leave it strictly alone.
      if (leaseLive(lease, at)) { recomputeAuthority(); return; }
      // The lease is vacant. The master prompt wants the lowest id to own the world,
      // so the lowest live client claims at once and everyone else waits out a grace
      // period first. That keeps the choice deterministic instead of "whoever booted
      // first", while still guaranteeing somebody takes over if the lowest is gone.
      const live = livePresenceUids();
      const lowest = live.length ? live[0] : uid;
      if (lowest !== uid && at - vacantSince < NET.rates.leaseGraceSec * 1000) {
        recomputeAuthority();
        return;
      }
    }
    const result = await driver.transact(W.lease, (current) => {
      const stamp = now();
      if (current && current.uid && current.uid !== uid && Number(current.exp) > stamp) {
        return undefined; // somebody else holds a good lease — leave it alone
      }
      return { uid, exp: stamp + NET.rates.leaseSec * 1000 };
    });
    if (result.committed && result.value) lease = result.value;
    recomputeAuthority();
  }

  function applyLease(value) {
    lease = value && typeof value === 'object' ? value : null;
    recomputeAuthority();
  }

  async function releaseLease() {
    if (!driver) return;
    try {
      await driver.transact(W.lease, (current) => {
        if (!current || current.uid !== uid) return undefined;
        return { uid: '', exp: 0 };
      });
    } catch (error) {
      // Leaving without releasing is survivable: the lease expires on its own.
    }
  }

  function ensurePeer(id) {
    let peer = peers.get(id);
    if (peer) return peer;
    const interp = createInterpolator();
    peer = {
      uid: id,
      profile: { name: 'Queen', color: 'amber', pattern: 'banded' },
      cosmetic: { color: 'amber', pattern: 'banded' },
      position: interp.position,
      quaternion: interp.quaternion,
      velocity: interp.velocity,
      carrying: 0,
      swarm: {},
      ready: false,
      authority: false,
      joinedAt: 0,
      lastSeen: 0,
      hasMotion: false,
      extrapolating: false,
      interp,
    };
    peers.set(id, peer);
    applyMetaTo(peer, metaRaw.get(id));
    fire(joinListeners, peer);
    return peer;
  }

  function dropPeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    fire(leaveListeners, peer);
  }

  function roster() {
    const out = [];
    for (const [id, value] of presenceRaw) {
      const meta = metaRaw.get(id) || {};
      out.push({
        id,
        uid: id,
        name: (value && value.name) || 'Queen',
        color: meta.c || 'amber',
        pattern: meta.k || 'banded',
        ready: Boolean(meta.r),
        joinedAt: Number(meta.j) || 0,
        self: id === uid,
        host: id === hostUid,
      });
    }
    out.sort((a, b) => (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1));
    return out;
  }

  function emitPresence() {
    if (!presenceListeners.length) return;
    fire(presenceListeners, roster());
  }

  function applyMetaTo(peer, meta) {
    if (!peer || !meta) return;
    peer.profile.color = meta.c || peer.profile.color;
    peer.profile.pattern = meta.k || peer.profile.pattern;
    peer.cosmetic.color = peer.profile.color;
    peer.cosmetic.pattern = peer.profile.pattern;
    peer.swarm = sanitizeSwarm(meta.s);
    peer.ready = Boolean(meta.r);
    peer.joinedAt = Number(meta.j) || peer.joinedAt;
  }

  function applyPresence(id, value) {
    if (!value) {
      presenceRaw.delete(id);
      if (id !== uid) dropPeer(id);
      recomputeAuthority();
      emitPresence();
      return;
    }
    presenceRaw.set(id, value);
    if (id !== uid) {
      const peer = ensurePeer(id);
      peer.profile.name = value.name || peer.profile.name;
      peer.lastSeen = Number(value.at) || peer.lastSeen;
    }
    recomputeAuthority();
    emitPresence();
  }

  function applyMeta(id, value) {
    if (!value) metaRaw.delete(id);
    else metaRaw.set(id, value);
    if (id !== uid) applyMetaTo(peers.get(id), value);
    emitPresence();
  }

  function applyQueen(id, value) {
    if (id === uid || !value || typeof value.p !== 'string') return;
    const parsed = unpackMotion(value.p);
    if (!parsed) return;
    const peer = ensurePeer(id);
    peer.hasMotion = true;
    peer.interp.push({
      t: epoch + parsed.tRel,
      position: parsed.position,
      quaternion: parsed.quaternion,
      velocity: parsed.velocity,
      carrying: parsed.carrying,
    });
  }

  function applyBank(value) {
    const next = emptyBank();
    if (value && typeof value === 'object') {
      for (const kind of KINDS) {
        const amount = Number(value[kind]);
        if (Number.isFinite(amount)) next[kind] = amount;
        const rate = Number(value[RATE_PREFIX + kind]);
        if (Number.isFinite(rate)) next[RATE_PREFIX + kind] = rate;
      }
      next.lastActive = Number(value.lastActive) || 0;
    }
    bankState = next;
    fire(bankListeners, bankSnapshot());
  }

  function bankSnapshot() {
    const out = { lastActive: bankState.lastActive, rate: ratesFrom(bankState) };
    for (const kind of KINDS) out[kind] = bankState[kind] || 0;
    return out;
  }

  // Serialises this client's own writes to one node. Two queens colliding on the bank
  // is the case transactions exist for; one queen colliding with herself twenty times
  // in the same tick is just wasted retries, and enough of them exhaust the budget and
  // silently drop deposits.
  function queued(chainRef, task) {
    const next = chainRef.p.then(task, task);
    chainRef.p = next.then(() => {}, () => {});
    return next;
  }
  const bankChain = { p: Promise.resolve() };
  const contribChain = { p: Promise.resolve() };

  // Every bank write is one transaction on the whole node, so a multi-resource
  // purchase is all-or-nothing and the offline stamp can never drift from the
  // balances. Never a set() on a previously read value.
  function mutateBank(mutator) {
    if (!driver) return Promise.resolve(false);
    return queued(bankChain, () => runBankMutation(mutator));
  }

  async function runBankMutation(mutator) {
    const result = await driver.transact(P.bank, (current) => {
      const base = current && typeof current === 'object' ? current : emptyBank();
      for (const kind of KINDS) {
        if (!Number.isFinite(Number(base[kind]))) base[kind] = 0;
        if (!Number.isFinite(Number(base[RATE_PREFIX + kind]))) {
          base[RATE_PREFIX + kind] = Number(NET.bank.defaultRate[kind]) || 0;
        }
      }
      if (!Number.isFinite(Number(base.lastActive))) base.lastActive = 0;
      return mutator(base);
    });
    if (result.committed) applyBank(result.value);
    return Boolean(result.committed);
  }

  async function deposit(kind, amount) {
    const value = Number(amount);
    if (!KINDS.includes(kind) || !(value > 0)) return false;
    const ok = await mutateBank((base) => {
      const cap = capacityOf(kind);
      base[kind] = Math.min(cap, (Number(base[kind]) || 0) + value);
      base.lastActive = now();
      return base;
    });
    if (ok && uid) {
      queued(contribChain, () => driver
        .transact(joinPath(W.contrib, uid, kind), (current) => (Number(current) || 0) + value)
        .catch(() => {}));
    }
    return ok;
  }

  async function spend(costs) {
    if (!costs || typeof costs !== 'object') return false;
    const wanted = {};
    let any = false;
    for (const kind of KINDS) {
      const value = Number(costs[kind]) || 0;
      if (value > 0) { wanted[kind] = value; any = true; }
    }
    if (!any) return false;
    return mutateBank((base) => {
      for (const kind of Object.keys(wanted)) {
        if ((Number(base[kind]) || 0) + 1e-6 < wanted[kind]) return undefined; // abort, nothing changes
      }
      // Clamp at zero: floating point can leave ~-5e-7, and the deployed rule
      // (newData.val() >= 0) rejects the whole transaction for it.
      for (const kind of Object.keys(wanted)) base[kind] = Math.max(0, (Number(base[kind]) || 0) - wanted[kind]);
      base.lastActive = now();
      return base;
    });
  }

  // Runs on every join. Whoever wins the transaction stamps lastActive, so the second
  // and third queen see an elapsed time under minAccrualSec and are granted nothing.
  async function settleOffline() {
    let report = null;
    await mutateBank((base) => {
      const stamp = Number(base.lastActive) || 0;
      const grant = computeOfflineGrant({
        now: now(),
        lastActive: stamp,
        rate: ratesFrom(base),
        kinds: KINDS,
      });
      report = grant;
      if (stamp && grant.seconds > 0) {
        for (const kind of KINDS) {
          const cap = capacityOf(kind);
          base[kind] = Math.min(cap, (Number(base[kind]) || 0) + (grant.grants[kind] || 0));
        }
      }
      base.lastActive = now();
      return base;
    });
    offlineReport = report;
    return report;
  }

  function metaPayload() {
    return {
      c: profile.color,
      k: profile.pattern,
      s: pending.swarm,
      j: metaRaw.has(uid) ? (Number((metaRaw.get(uid) || {}).j) || now()) : now(),
      r: Boolean((metaRaw.get(uid) || {}).r),
    };
  }

  function pushMeta(extra) {
    const payload = { ...metaPayload(), ...(extra || {}) };
    lastMetaSent = payload;
    metaRaw.set(uid, payload);
    emitPresence();
    return driver.set(joinPath(W.meta, uid), payload).catch(() => {});
  }

  function publishSelf(state) {
    if (!state) return;
    if (state.position) {
      pending.position.x = state.position.x;
      pending.position.y = state.position.y;
      pending.position.z = state.position.z;
    }
    if (state.quaternion) {
      pending.quaternion.x = state.quaternion.x;
      pending.quaternion.y = state.quaternion.y;
      pending.quaternion.z = state.quaternion.z;
      pending.quaternion.w = typeof state.quaternion.w === 'number' ? state.quaternion.w : 1;
    }
    if (state.velocity) {
      pending.velocity.x = state.velocity.x;
      pending.velocity.y = state.velocity.y;
      pending.velocity.z = state.velocity.z;
      pending.hasVelocity = true;
    }
    if (typeof state.carrying === 'number') pending.carrying = state.carrying;
    if (state.swarm) pending.swarm = sanitizeSwarm(state.swarm);
    if (state.cosmetic) {
      if (state.cosmetic.color) profile.color = state.cosmetic.color;
      if (state.cosmetic.pattern) profile.pattern = state.cosmetic.pattern;
    }
    pending.dirty = true;
  }

  function movedEnough() {
    if (!lastSent.valid) return true;
    const dp = Math.hypot(
      pending.position.x - lastSent.position.x,
      pending.position.y - lastSent.position.y,
      pending.position.z - lastSent.position.z
    );
    if (dp > NET.rates.idleMoveEpsilon) return true;
    const dq = Math.abs(pending.quaternion.x - lastSent.quaternion.x)
      + Math.abs(pending.quaternion.y - lastSent.quaternion.y)
      + Math.abs(pending.quaternion.z - lastSent.quaternion.z)
      + Math.abs(pending.quaternion.w - lastSent.quaternion.w);
    return dq > NET.rates.idleTurnEpsilon;
  }

  function sendMotion() {
    const t = now();
    // Hermite interpolation on the far side needs a velocity. Use the one the game
    // supplied; otherwise difference against the previous published sample.
    if (!pending.hasVelocity && lastSent.valid) {
      const span = Math.max(1e-3, (t - lastSent.time) / 1000);
      pending.velocity.x = (pending.position.x - lastSent.position.x) / span;
      pending.velocity.y = (pending.position.y - lastSent.position.y) / span;
      pending.velocity.z = (pending.position.z - lastSent.position.z) / span;
    }
    seq = (seq + 1) & 0xffff;
    motionSends++;
    const text = packMotion(seq, t - epoch, pending.position, pending.quaternion, pending.velocity, pending.carrying);
    driver.set(joinPath(P.queens, uid, 'p'), text).catch(() => {});
    lastSent.position.x = pending.position.x;
    lastSent.position.y = pending.position.y;
    lastSent.position.z = pending.position.z;
    lastSent.quaternion.x = pending.quaternion.x;
    lastSent.quaternion.y = pending.quaternion.y;
    lastSent.quaternion.z = pending.quaternion.z;
    lastSent.quaternion.w = pending.quaternion.w;
    lastSent.time = t;
    lastSent.valid = true;
    pending.dirty = false;

    // Swarm composition is the only swarm data on the wire, and only when it changes.
    if (!lastMetaSent || !sameSwarm(pending.swarm, lastMetaSent.s)
      || lastMetaSent.c !== profile.color || lastMetaSent.k !== profile.pattern) {
      pushMeta();
    }
  }

  // Presence, lease and reaping run on a timer, never on the frame loop, so a hidden
  // tab either keeps its claim alive or loses it cleanly — never both.
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => { onHeartbeat().catch(() => {}); }, NET.rates.heartbeatSec * 1000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function onHeartbeat() {
    if (disposed || !driver || !uid) return;
    if (simulating()) {
      // A client reaped while it was frozen has lost its presence AND its metadata.
      // Coming back has to restore both, or its colour, pattern, swarm and ready flag
      // are gone from every roster for the rest of the session.
      driver.set(joinPath(P.presence, uid), { name: profile.name, at: now() }).catch(() => {});
      if (!metaRaw.has(uid)) pushMeta();
    }
    else wasSimulating = false;
    prunePresence();
    await tickLease();
  }

  function prunePresence() {
    if (!driver) return;
    const cutoff = now() - NET.rates.presenceStaleSec * 1000;
    let pruned = false;
    for (const [id, entry] of Array.from(presenceRaw)) {
      if (id === uid) continue;
      const seen = Number(entry && entry.at) || 0;
      if (!seen || seen >= cutoff) continue;
      presenceRaw.delete(id);
      dropPeer(id);
      pruned = true;
      if (owns()) {
        driver.remove(joinPath(P.presence, id)).catch(() => {});
        driver.remove(joinPath(P.queens, id)).catch(() => {});
        driver.remove(joinPath(W.meta, id)).catch(() => {});
      }
    }
    recomputeAuthority();
    if (pruned) emitPresence();
  }

  function update(dt) {
    if (disposed || !driver || !uid) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;

    // Detect the stall from the clock rather than from a flag the heartbeat maintains:
    // a hidden tab may have had its timers throttled too, and the roster still has to
    // heal on resume.
    const at = now();
    const resumed = !wasSimulating || (lastUpdateAt > 0 && at - lastUpdateAt >= NET.rates.simStaleSec * 1000);
    lastUpdateAt = at;
    if (resumed) {
      wasSimulating = true;
      driver.set(joinPath(P.presence, uid), { name: profile.name, at }).catch(() => {});
      pushMeta();
      tickLease().catch(() => {});
    }

    // Throttle on the wall clock, not on accumulated dt. dt is clamped per frame, so
    // a couple of long frames would silently drop the publish rate below 10 Hz.
    const sinceSend = lastMotionAt ? at - lastMotionAt : Infinity;
    if (sinceSend >= 1000 / NET.rates.motionHz) {
      const idle = !movedEnough();
      if (!idle || sinceSend >= 1000 / NET.rates.idleMotionHz) {
        sendMotion();
        lastMotionAt = at;
      }
    }

    const serverNow = now();
    for (const peer of peers.values()) {
      if (!peer.hasMotion) continue;
      const out = peer.interp.sample(serverNow, step);
      peer.carrying = out.carrying;
      peer.extrapolating = out.extrapolating;
    }

    if (owns()) {
      if (!lastClockSyncAt) lastClockSyncAt = at;
      else if (at - lastClockSyncAt >= NET.rates.worldClockSyncSec * 1000) {
        lastClockSyncAt = at;
        mutateBank((base) => { base.lastActive = now(); return base; }).catch(() => {});
      }
    }
  }

  const ready = (async () => {
    driver = await pickDriver(code, ctx.driver);
    uid = driver.uid || makeUid();

    const seed = await driver.transact(W.epoch, (current) => {
      if (Number(current) > 0) return undefined;
      return driver.serverTimestamp();
    });
    let stamp = Number(seed.value);
    if (!Number.isFinite(stamp) || stamp <= 0) stamp = Number(await driver.get(W.epoch));
    epoch = Number.isFinite(stamp) && stamp > 0 ? stamp : now();

    const claimed = await driver.transact(W.host, (current) => (current ? undefined : uid));
    hostUid = (typeof claimed.value === 'string' && claimed.value) || (await driver.get(W.host)) || uid;

    await driver.onDisconnectRemove(joinPath(P.presence, uid));
    await driver.onDisconnectRemove(joinPath(P.queens, uid));
    await driver.onDisconnectRemove(joinPath(W.meta, uid));

    await driver.set(joinPath(P.presence, uid), { name: profile.name, at: now() });
    await pushMeta({ j: now(), r: false });

    subs.push(driver.subscribeChildren(P.presence, {
      onAdd: applyPresence,
      onChange: applyPresence,
      onRemove: (id) => applyPresence(id, null),
    }));
    subs.push(driver.subscribeChildren(W.meta, {
      onAdd: applyMeta,
      onChange: applyMeta,
      onRemove: (id) => applyMeta(id, null),
    }));
    subs.push(driver.subscribeChildren(P.queens, {
      onAdd: applyQueen,
      onChange: applyQueen,
    }));
    subs.push(driver.subscribe(P.bank, applyBank));
    subs.push(driver.subscribe(W.lease, applyLease));

    await settleOffline();

    // Count as simulating from the moment we are ready, so the first lease tick can
    // claim; update() keeps it true from here on.
    lastUpdateAt = now();
    wasSimulating = true;
    await tickLease();
    startHeartbeat();

    return { uid, code, isAuthority, driver: driver.kind };
  })();

  function dispose() {
    if (disposed) return;
    // Hand the lease back before tearing down, so the next client takes over at once
    // instead of waiting out the expiry.
    releaseLease().catch(() => {});
    disposed = true;
    stopHeartbeat();
    for (const off of subs) {
      try { off(); } catch (error) { /* already detached */ }
    }
    subs.length = 0;
    if (driver) {
      // Fire the onDisconnect writes now rather than queueing removals: disposing the
      // driver tears down its pending work, so anything merely scheduled would be lost
      // and the queen would linger as a ghost.
      driver.flushDisconnect();
      const stamp = now();
      driver.transact(P.bank, (current) => {
        const base = current && typeof current === 'object' ? current : emptyBank();
        base.lastActive = stamp;
        return base;
      }).catch(() => {});
      // Give the closing stamp a moment to land before the socket goes away.
      setTimeout(() => driver.dispose(), 600);
    }
    peers.clear();
    presenceRaw.clear();
    metaRaw.clear();
  }

  function worldPath(path) {
    const key = String(path || '').split('/')[0];
    if (RESERVED.includes(key)) {
      console.warn(`[net] world path "${path}" collides with a reserved key — namespace it`);
    }
    return joinPath(P.world, path);
  }

  return {
    ready,
    peers,
    publishSelf,
    update,
    dispose,
    roster,
    get uid() { return uid; },
    get code() { return code; },
    get mode() { return mode; },
    get driver() { return driver; },
    get profile() { return profile; },
    get offlineReport() { return offlineReport; },
    get hostUid() { return hostUid; },
    // Motion publishes only, so the send throttle can be measured without counting
    // presence heartbeats and lease renewals as if they were queen updates.
    get motionSends() { return motionSends; },

    setPresence(patch) {
      if (!driver || !uid || !patch) return Promise.resolve();
      // Presence is typed by the rules as { name, at }; anything else is metadata.
      const meta = {};
      if ('r' in patch) meta.r = Boolean(patch.r);
      if ('c' in patch) meta.c = patch.c;
      if ('k' in patch) meta.k = patch.k;
      if (Object.keys(meta).length) return pushMeta(meta);
      if (patch.name) profile.name = String(patch.name).slice(0, 24);
      return driver.set(joinPath(P.presence, uid), { name: profile.name, at: now() }).catch(() => {});
    },
    onPresence(cb) {
      if (typeof cb !== 'function') return () => {};
      presenceListeners.push(cb);
      if (presenceRaw.size) cb(roster());
      return () => {
        const i = presenceListeners.indexOf(cb);
        if (i !== -1) presenceListeners.splice(i, 1);
      };
    },

    onPeerJoin(cb) {
      if (typeof cb !== 'function') return () => {};
      joinListeners.push(cb);
      for (const peer of peers.values()) cb(peer);
      return () => {
        const i = joinListeners.indexOf(cb);
        if (i !== -1) joinListeners.splice(i, 1);
      };
    },
    onPeerLeave(cb) {
      if (typeof cb !== 'function') return () => {};
      leaveListeners.push(cb);
      return () => {
        const i = leaveListeners.indexOf(cb);
        if (i !== -1) leaveListeners.splice(i, 1);
      };
    },

    bank: {
      kinds: KINDS,
      snapshot: bankSnapshot,
      deposit,
      spend,
      onChange(cb) {
        if (typeof cb !== 'function') return () => {};
        bankListeners.push(cb);
        cb(bankSnapshot());
        return () => {
          const i = bankListeners.indexOf(cb);
          if (i !== -1) bankListeners.splice(i, 1);
        };
      },
      setRate(rate) {
        if (!rate || typeof rate !== 'object') return Promise.resolve(false);
        return mutateBank((base) => {
          for (const kind of KINDS) {
            const value = Number(rate[kind]);
            if (Number.isFinite(value) && value >= 0) base[RATE_PREFIX + kind] = value;
          }
          return base;
        });
      },
      contributions() {
        return driver ? driver.get(W.contrib) : Promise.resolve(null);
      },
    },

    world: {
      now,
      get epoch() { return epoch; },
      seasonPhase() { return seasonAt(now(), epoch); },
      get(path) { return driver ? driver.get(worldPath(path)) : Promise.resolve(null); },
      set(path, value) { return driver ? driver.set(worldPath(path), value) : Promise.resolve(); },
      transact(path, fn) {
        return driver
          ? driver.transact(worldPath(path), fn).then((r) => r.committed)
          : Promise.resolve(false);
      },
      subscribe(path, cb) {
        return driver ? driver.subscribe(worldPath(path), cb) : () => {};
      },
    },

    // Flower reserves: shared, transactional, and regrown from server timestamps
    // rather than from a local dt, so three queens stripping one meadow really do
    // exhaust it and it really does refill between sessions.
    flowers: {
      // spec: { max, regrowth (units/sec), regrowDelay (sec) }
      amount(id, spec) {
        const entry = flowerCache.get(id);
        const max = Number(spec && spec.max) || 0;
        if (!entry) return max;
        return regrownAmount({
          stored: entry.a,
          drainedAt: entry.d,
          now: now(),
          max,
          ratePerSec: Number(spec && spec.regrowth) || 0,
          delaySec: Number(spec && spec.regrowDelay) || 0,
        });
      },
      // Returns how much was actually taken — never more than the flower still has,
      // even if two queens hit it in the same tick.
      async drain(id, want, spec) {
        if (!driver || !(want > 0)) return 0;
        const max = Number(spec && spec.max) || 0;
        const rate = Number(spec && spec.regrowth) || 0;
        const delay = Number(spec && spec.regrowDelay) || 0;
        let taken = 0;
        await driver.transact(joinPath(P.world, 'flowers', id), (current) => {
          const stamp = now();
          const available = regrownAmount({
            stored: current ? Number(current.a) : max,
            drainedAt: current ? Number(current.d) : 0,
            now: stamp,
            max,
            ratePerSec: rate,
            delaySec: delay,
          });
          taken = Math.min(available, want);
          if (taken <= 0) { taken = 0; return undefined; }
          return { a: available - taken, d: stamp };
        });
        return taken;
      },
      subscribe(cb) {
        if (!driver) return () => {};
        return driver.subscribeChildren(joinPath(P.world, 'flowers'), {
          onAdd: (id, value) => { flowerCache.set(id, normalizeFlower(value)); cb(id, flowerCache.get(id)); },
          onChange: (id, value) => { flowerCache.set(id, normalizeFlower(value)); cb(id, flowerCache.get(id)); },
          onRemove: (id) => { flowerCache.delete(id); cb(id, null); },
        });
      },
    },

    // Weather is scheduled by the one owner and read by everyone, stamped in server
    // time so a client's own clock can never shift the storm.
    weather: {
      current() { return weatherState ? { ...weatherState } : null; },
      subscribe(cb) {
        if (!driver) return () => {};
        return driver.subscribe(joinPath(P.world, 'weather'), (value) => {
          weatherState = value && typeof value === 'object' ? value : null;
          cb(weatherState ? { ...weatherState } : null);
        });
      },
      // Owner only. Pass { kind, intensity, seed, durationMs }; startedAt is stamped here.
      set(entry) {
        if (!driver || !owns() || !entry) return Promise.resolve(false);
        return driver
          .set(joinPath(P.world, 'weather'), { ...entry, startedAt: now() })
          .then(() => true, () => false);
      },
    },

    // The comb (nest cells) has its own subtree in the deployed rules.
    comb: {
      get(path) { return driver ? driver.get(joinPath(P.comb, path)) : Promise.resolve(null); },
      set(path, value) { return driver ? driver.set(joinPath(P.comb, path), value) : Promise.resolve(); },
      transact(path, fn) {
        return driver
          ? driver.transact(joinPath(P.comb, path), fn).then((r) => r.committed)
          : Promise.resolve(false);
      },
      subscribe(path, cb) {
        return driver ? driver.subscribe(joinPath(P.comb, path), cb) : () => {};
      },
    },

    authority: {
      // Evaluated against the clock every call, so a client that has stopped ticking
      // reports false immediately — no network round trip, no dual-owner window.
      isMine() { return ownerUid() === uid && simulating(); },
      owner() { return ownerUid(); },
      get lease() { return lease ? { ...lease } : null; },
      expiresIn() { return lease ? Math.max(0, Number(lease.exp) - now()) : 0; },
      onChange(cb) {
        if (typeof cb !== 'function') return () => {};
        authorityListeners.push(cb);
        cb(isAuthority, this.owner());
        return () => {
          const i = authorityListeners.indexOf(cb);
          if (i !== -1) authorityListeners.splice(i, 1);
        };
      },
    },

    stats() {
      if (!driver) return null;
      const elapsed = Math.max(0.001, (Date.now() - driver.stats.startedAt) / 1000);
      return {
        ...driver.stats,
        driver: driver.kind,
        motionSends,
        seconds: elapsed,
        upBytesPerSecond: driver.stats.bytesSent / elapsed,
        downBytesPerSecond: driver.stats.bytesReceived / elapsed,
      };
    },
  };
}

// Solo is not a separate code path — it is a session you happen to be alone in. The
// code is minted once per browser so the solo hollow persists between visits.
function soloCode() {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem('ht.solo.code');
      if (typeof existing === 'string' && existing.length >= NET.codeMinLength) return existing;
      const fresh = normalizeHiveCode('');
      localStorage.setItem('ht.solo.code', fresh);
      return fresh;
    }
  } catch (error) {
    // private mode — a fresh solo world each visit is an acceptable degradation
  }
  return normalizeHiveCode('');
}

export { computeOfflineGrant, regrownAmount, seasonAt } from './offline.js';
export { createInterpolator } from './interpolation.js';
export { makeHiveCode, normalizeHiveCode } from './util.js';
