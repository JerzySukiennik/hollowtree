// Hollowtree — hornet raids (M6).
//
// A raid is a seasonal event, not a fight. The player never aims anything: the nest's
// SHAPE is the defence. The constrictor turns hornets away at the mouth, resin traps
// spend their charges, staffed guard posts take a toll, and every lattice step between
// the mouth and the stores shaves what the survivors manage to carry out. What is left
// steals honey and chews cells on the path — and nothing else. No progress is wiped, the
// hive is never killed, the queen's chamber is never touched.
//
// AUTHORITY. The simulation runs on exactly one client: the world-lease holder. Everyone
// else renders what that client published and decides nothing. This is cheap to hold to
// because the whole schedule is DERIVED, not rolled: (HORNETS.seed, world epoch, absolute
// season index) fixes which season is raided, at what minute, and by how many. Two clients
// that never exchange a byte agree. A lease handover mid-raid therefore CONTINUES the raid
// — the new owner re-derives the identical timeline — and an already-published outcome for
// a season is never recomputed, so the numbers cannot drift either.
//
// Shape follows src/world/weather.js: owner schedules, everyone subscribes and renders.

import * as THREE from 'three';
import { HORNETS, HORNET_PHASES } from '../config.hornets.js';
import { HIVE } from '../config.js';
import { CELL_BY_ID } from '../config.comb.js';
import { NET } from '../config.net.js';

// The calendar is the net layer's, not ours — one definition of a season, shared.
const SEASON_NAMES = NET.season.names;
const SEASON_LENGTH_SEC = NET.season.lengthSec;

// ---------------------------------------------------------------- determinism

// A 32-bit mix so that consecutive season indices do not produce correlated streams.
function hash32(a, b) {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Everything about season S, from nothing but the seed and S. Pure; no clock, no network.
export function raidForSeason(seasonIndex, seed) {
  const s = seasonIndex | 0;
  if (s < 0) return null;
  const rnd = mulberry32(hash32(seed >>> 0, s * 2654435761));
  const name = SEASON_NAMES[((s % 4) + 4) % 4];
  const chance = Number(HORNETS.seasonChance[name]) || 0;
  const roll = rnd();
  if (roll >= chance) return null;
  const [lo, hi] = HORNETS.seasonWindow;
  const f = lo + (hi - lo) * rnd();
  const span = HORNETS.countMax - HORNETS.countMin;
  const count = Math.max(1, Math.min(HORNETS.maxAlive, HORNETS.countMin + Math.round(span * rnd())));
  const bearing = HORNETS.origin.bearing + HORNETS.origin.bearingJitter * (rnd() * 2 - 1);
  return { season: s, name, offsetSec: f * SEASON_LENGTH_SEC, count, bearing };
}

// Absolute season index for a server timestamp. `epoch` is the world epoch.
export function seasonIndexAt(nowMs, epochMs) {
  const elapsed = Math.max(0, (Number(nowMs) || 0) - (Number(epochMs) || 0));
  return Math.floor(elapsed / (SEASON_LENGTH_SEC * 1000));
}

// The full timeline of a raid, in server ms. `arriveAt` is the moment the swarm is at the
// mouth; every other instant hangs off it, so shifting the schedule shifts nothing else.
export function timelineOf(raid, epochMs) {
  if (!raid) return null;
  const T = HORNETS.timing;
  const arriveAt = epochMs + raid.season * SEASON_LENGTH_SEC * 1000 + raid.offsetSec * 1000;
  return {
    season: raid.season,
    name: raid.name,
    count: raid.count,
    bearing: raid.bearing,
    warnAt: arriveAt - T.warnLeadSec * 1000,
    inboundAt: arriveAt - T.approachSec * 1000,
    arriveAt,
    raidAt: arriveAt + T.assaultSec * 1000,
    departAt: arriveAt + (T.assaultSec + T.raidSec) * 1000,
    endAt: arriveAt + (T.assaultSec + T.raidSec + T.departSec) * 1000,
  };
}

// ---------------------------------------------------------------- defence maths

// How the built nest turns a raid back. Pure arithmetic over what comb already computes,
// so the player can read the outcome off their own nest before it happens.
export function resolveDefence(count, snap) {
  const D = HORNETS.defence;
  const n = Math.max(0, count | 0);
  const slow = Math.max(0, Math.min(0.9, Number(snap.hornetSlow) || 0));
  const turnedAway = n * slow * D.constrictorTurnaway;

  let left = Math.max(0, n - turnedAway);
  const trapKills = Math.min(left, (Number(snap.trapCharges) || 0) * D.trapKillPerCharge);
  left -= trapKills;

  const staffing = Number.isFinite(snap.guardStaffing) ? snap.guardStaffing : D.defaultGuardStaffing;
  const guardKills = Math.min(
    left,
    (Number(snap.guardSlots) || 0) * Math.max(0, staffing) * D.guardKillPerSlot
  );
  left -= guardKills;

  const breachers = Math.max(0, Math.floor(left + 1e-9));
  const corridor = Math.min(D.corridorMax, D.corridorPerStep * Math.max(0, Number(snap.corridorSteps) || 0));

  return {
    turnedAway: round2(turnedAway),
    trapKills: round2(trapKills),
    guardKills: round2(guardKills),
    breachers,
    corridor: round2(corridor),
    // 0 = nothing built, 1 = the swarm never gets past the mouth. Drives threat/audio.
    strength: n > 0 ? Math.max(0, Math.min(1, 1 - breachers / n)) : 1,
    trapChargesUsed: Math.ceil(trapKills / Math.max(1e-6, D.trapKillPerCharge)),
  };
}

function round2(v) { return Math.round(v * 100) / 100; }

// Reads the live comb into the flat record resolveDefence wants. Never mutates comb.
export function readComb(comb) {
  const snap = {
    hornetSlow: 0, trapCharges: 0, guardSlots: 0, guardStaffing: undefined,
    corridorSteps: 0, honey: 0, doneCount: 0,
  };
  if (!comb) return snap;
  const eff = comb.effects || {};
  snap.hornetSlow = Number(eff.hornetSlow) || 0;
  snap.trapCharges = Number(eff.trapCharges) || 0;
  snap.guardSlots = Number(eff.guardSlots) || 0;
  snap.doneCount = Number(eff.doneCount) || 0;
  if (comb.staffing && Number.isFinite(Number(comb.staffing.guard))) {
    snap.guardStaffing = Number(comb.staffing.guard);
  }
  snap.honey = Number(comb.stores && comb.stores.honey) || 0;

  // The corridor is the shortest built path from the mouth to anything that stores.
  let best = Infinity;
  if (comb.cells && typeof comb.cells.values === 'function') {
    for (const cell of comb.cells.values()) {
      if (!cell.done) continue;
      const type = CELL_BY_ID.get(cell.type);
      if (!type || !type.tags || type.tags.indexOf('store') === -1) continue;
      if (Number.isFinite(cell.routeDist)) best = Math.min(best, cell.routeDist);
    }
  }
  snap.corridorSteps = Number.isFinite(best) ? best : 0;
  return snap;
}

// What the breach costs, expressed only in stores and cells — never in progress.
export function tallyLoss(defence, comb, rnd) {
  const L = HORNETS.loss;
  const snap = readComb(comb);
  const keep = 1 - defence.corridor;
  const b = defence.breachers;

  const wantHoney = b * L.honeyPerBreacher * keep;
  const honeyStolen = Math.max(0, round2(Math.min(wantHoney, snap.honey * L.honeyMaxFraction, snap.honey)));

  const wantCells = Math.floor(b * L.cellsPerBreacher * keep + 1e-9);
  const cellBudget = Math.max(0, Math.min(
    L.maxCellsLost,
    wantCells,
    Math.floor(snap.doneCount * L.maxCellFraction)
  ));

  const cellsDestroyed = [];
  if (cellBudget > 0 && comb && comb.cells) {
    const candidates = [];
    for (const [key, cell] of comb.cells) {
      if (!cell.done) continue;
      if (L.protectedTypes.indexOf(cell.type) !== -1) continue;   // the respawn point is sacred
      if (!Number.isFinite(cell.routeDist)) continue;             // off the raid's path
      candidates.push({ key, d: cell.routeDist });
    }
    // Closest to the mouth first; the key breaks ties so every client orders identically.
    candidates.sort((a, z) => (a.d - z.d) || (a.key < z.key ? -1 : a.key > z.key ? 1 : 0));
    const take = Math.min(cellBudget, candidates.length);
    for (let i = 0; i < take; i++) cellsDestroyed.push(candidates[i].key);
    // One deterministic shuffle-in of a deeper cell, so a long corridor is not always
    // eaten strictly front-to-back. Uses the raid's own stream, so it stays reproducible.
    if (typeof rnd === 'function' && candidates.length > take && take > 0) {
      const swapAt = Math.floor(rnd() * take);
      const from = take + Math.floor(rnd() * Math.min(3, candidates.length - take));
      cellsDestroyed[swapAt] = candidates[from].key;
    }
  }

  return {
    honeyStolen,
    cellsDestroyed,
    breachers: b,
    strength: defence.strength,
    corridor: defence.corridor,
    turnedAway: defence.turnedAway,
    trapKills: defence.trapKills,
    guardKills: defence.guardKills,
    trapChargesUsed: defence.trapChargesUsed,
  };
}

// ---------------------------------------------------------------- the system

export function createHornets({ scene, terrain, comb, net, flight, entrance } = {}) {
  const R = HORNETS.render;
  const T = HORNETS.timing;
  const MAX = HORNETS.maxAlive;

  const state = {
    active: false,
    phase: 'idle',
    count: 0,
    nextRaidAt: 0,
    threat: 0,
    season: -1,
    warnAt: 0,
    result: null,
  };

  const stats = { decisions: 0, publishes: 0, resolves: 0, warnings: 0, contacts: 0 };

  let disposed = false;
  let activeOverride = null;     // setActive() wins over the lease when set
  let epoch = 0;
  let timeline = null;           // the raid currently scheduled or running
  let resolvedSeason = -1;       // season whose outcome is already known
  let warnedSeason = -1;
  let scheduleAcc = 1e9;         // force a schedule on the first update
  let contactCooldown = 0;
  let published = null;          // last payload seen (ours or the owner's)
  let unsubscribe = null;

  const warningCbs = [];
  const contactCbs = [];
  const resultCbs = [];

  // ---- geometry: three InstancedMeshes, sized once, never resized, no shadows.

  const group = new THREE.Group();
  group.name = 'hornets';
  group.visible = false;

  const bodyGeo = makeBodyGeometry(R);
  const abdomenGeo = new THREE.SphereGeometry(R.bodyRadius * 1.02, 7, 5);
  abdomenGeo.scale(1, 0.86, 1.55);
  const wingGeo = new THREE.PlaneGeometry(R.wingSpan * 0.5, R.wingSpan * 0.22);
  wingGeo.translate(R.wingSpan * 0.25, 0, 0);

  const bodyMat = new THREE.MeshLambertMaterial({ color: R.colors.dark });
  const abdomenMat = new THREE.MeshLambertMaterial({ color: R.colors.amber });
  const wingMat = new THREE.MeshBasicMaterial({
    color: R.colors.wing, transparent: true, opacity: R.colors.wingAlpha,
    side: THREE.DoubleSide, depthWrite: false,
  });

  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX);
  const abdomenMesh = new THREE.InstancedMesh(abdomenGeo, abdomenMat, MAX);
  const wingMesh = new THREE.InstancedMesh(wingGeo, wingMat, MAX * 2);
  for (const m of [bodyMesh, abdomenMesh, wingMesh]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    group.add(m);
  }
  if (scene && typeof scene.add === 'function') scene.add(group);

  // ---- scratch: every vector below is allocated once, here, and reused every frame.

  const _pos = new THREE.Vector3();
  const _prev = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _quat = new THREE.Quaternion();
  const _mat = new THREE.Matrix4();
  const _mat2 = new THREE.Matrix4();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _abdScale = new THREE.Vector3(1, 1, 1);
  const _origin = new THREE.Vector3();
  const _mouth = new THREE.Vector3();
  const _wingQ = new THREE.Quaternion();
  const _wingE = new THREE.Euler();

  const mouth = new THREE.Vector3();
  if (entrance && entrance.isVector3) mouth.copy(entrance);
  else {
    const faceZ = HIVE.z <= 0 ? 1 : -1;
    const ground = terrain && typeof terrain.getHeight === 'function' ? terrain.getHeight(HIVE.x, HIVE.z) : 0;
    const surface = HIVE.trunkRadiusBase * 0.72;
    mouth.set(HIVE.x, ground + HIVE.entranceHeight, HIVE.z + (surface + HIVE.entranceRadius * 0.4) * faceZ);
  }

  // Per-hornet swirl phases and fates. Fixed-size, filled per raid, never grown.
  const phaseA = new Float32Array(MAX);
  const phaseB = new Float32Array(MAX);
  const phaseC = new Float32Array(MAX);
  const ring = new Float32Array(MAX);
  const ringY = new Float32Array(MAX);
  const lane = new Float32Array(MAX);
  const breacher = new Uint8Array(MAX);
  const leaveAt = new Float32Array(MAX);   // seconds after arriveAt a repelled hornet quits
  const livePos = [];
  for (let i = 0; i < MAX; i++) livePos.push(new THREE.Vector3());
  const liveOn = new Uint8Array(MAX);

  // ---------------------------------------------------------------- helpers

  function owns() {
    if (activeOverride !== null) return activeOverride;
    return Boolean(net && net.authority && typeof net.authority.isMine === 'function' && net.authority.isMine());
  }

  function serverNow(fallback) {
    if (net && net.world && typeof net.world.now === 'function') return net.world.now();
    return Number.isFinite(fallback) ? fallback : Date.now();
  }

  // Before the world epoch is known every derived instant is meaningless, so the system
  // stays fully inert rather than firing a phantom warning against epoch 0. When the epoch
  // does land (or moves, on a rejoin) everything derived from it is thrown away.
  function worldEpoch() {
    const live = net && net.world && Number.isFinite(net.world.epoch) ? net.world.epoch : 0;
    if (live > 0 && live !== epoch) {
      epoch = live;
      timeline = null;
      warnedSeason = -1;
      resolvedSeason = -1;
      state.result = null;
      scheduleAcc = 1e9;
    }
    return epoch;
  }

  function fire(list, a, b) {
    for (let i = 0; i < list.length; i++) {
      try { list[i](a, b); } catch (err) { console.warn('[hornets] listener threw', err); }
    }
  }

  // ---------------------------------------------------------------- scheduling

  // Owner only. Walks forward from the current season until it finds a raid that has not
  // finished yet. Pure arithmetic — the same call on any client returns the same answer.
  function schedule(seasonPhase) {
    const e = worldEpoch();
    const now = serverNow();
    let idx;
    if (seasonPhase && Number.isFinite(seasonPhase.index)) {
      const year = Number.isFinite(seasonPhase.year) ? seasonPhase.year : 0;
      idx = year * SEASON_NAMES.length + seasonPhase.index;
    } else {
      idx = seasonIndexAt(now, e);
    }
    stats.decisions++;
    for (let k = 0; k < HORNETS.lookaheadSeasons; k++) {
      const raid = raidForSeason(idx + k, HORNETS.seed);
      if (!raid) continue;
      const line = timelineOf(raid, e);
      if (line.endAt <= now) continue;
      return line;
    }
    return null;
  }

  function publish(line, result) {
    if (!net || !net.world || typeof net.world.set !== 'function') return;
    const payload = {
      seed: HORNETS.seed,
      epoch: worldEpoch(),
      season: line ? line.season : -1,
      arriveAt: line ? line.arriveAt : 0,
      count: line ? line.count : 0,
      bearing: line ? line.bearing : 0,
      result: result || null,
      at: serverNow(),
    };
    published = payload;
    stats.publishes++;
    try {
      const r = net.world.set('hornets', payload);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (err) { /* offline driver — the derivation still holds locally */ }
  }

  // A published payload is authoritative for the OUTCOME only. The timeline is re-derived
  // locally from (seed, epoch, season), which is what makes a handover continuous.
  function adopt(payload) {
    if (!payload || typeof payload !== 'object') return;
    published = payload;
    if (Number.isFinite(payload.epoch) && payload.epoch > 0) epoch = payload.epoch;
    if (payload.result && Number.isFinite(payload.season)) {
      if (payload.season > resolvedSeason) {
        resolvedSeason = payload.season;
        state.result = payload.result;
        fire(resultCbs, payload.result);
      }
    }
    scheduleAcc = 1e9;
  }

  if (net && net.world && typeof net.world.subscribe === 'function') {
    try {
      unsubscribe = net.world.subscribe('hornets', (value) => { if (!disposed) adopt(value); });
    } catch (err) { unsubscribe = null; }
  }

  // ---------------------------------------------------------------- raid setup

  function seedSwarm(line) {
    const rnd = mulberry32(hash32(HORNETS.seed ^ 0x5bf03635, line.season));
    for (let i = 0; i < MAX; i++) {
      phaseA[i] = rnd() * Math.PI * 2;
      phaseB[i] = rnd() * Math.PI * 2;
      phaseC[i] = rnd() * Math.PI * 2;
      ring[i] = (i / Math.max(1, line.count)) * Math.PI * 2 + rnd() * 0.4;
      ringY[i] = (rnd() * 2 - 1) * R.circleSpread;
      lane[i] = (rnd() * 2 - 1);
      breacher[i] = 0;
      leaveAt[i] = 0;
    }
  }

  // Assigns which hornets go in and which are turned back, from the resolved defence.
  // Deterministic: same season + same defence numbers -> same assignment on every client.
  function assignFates(line, res) {
    const rnd = mulberry32(hash32(HORNETS.seed ^ 0x1d872b41, line.season));
    const n = Math.max(0, Math.min(MAX, line.count));
    const b = Math.max(0, Math.min(n, res.breachers | 0));
    for (let i = 0; i < n; i++) {
      breacher[i] = i < b ? 1 : 0;
      // Repelled hornets peel off across the assault window rather than all at once.
      leaveAt[i] = i < b ? Infinity : T.assaultSec * (0.25 + 0.7 * rnd());
    }
    for (let i = n; i < MAX; i++) { breacher[i] = 0; leaveAt[i] = 0; }
  }

  function originFor(line) {
    const b = line.bearing;
    const x = mouth.x + Math.sin(b) * HORNETS.origin.distance;
    const z = mouth.z + Math.cos(b) * HORNETS.origin.distance;
    const ground = terrain && typeof terrain.getHeight === 'function' ? terrain.getHeight(x, z) : 0;
    _origin.set(x, ground + HORNETS.origin.altitude, z);
    return _origin;
  }

  // ---------------------------------------------------------------- update

  function update(dt, nowMs) {
    if (disposed) return state;
    const step = Math.min(0.1, Math.max(0, Number(dt) || 0));
    const now = serverNow(nowMs);
    const e = worldEpoch();
    if (contactCooldown > 0) contactCooldown = Math.max(0, contactCooldown - step);
    if (!(e > 0)) { idle(); return state; }   // no epoch yet: no calendar, no raid, no warning

    // ---- derive the timeline. Both owner and observer do this; only the owner PUBLISHES.
    scheduleAcc += step;
    const needsSchedule = !timeline || now > timeline.endAt || scheduleAcc >= HORNETS.scheduleEverySec;
    if (needsSchedule) {
      scheduleAcc = 0;
      const line = deriveCurrent(now, e);
      const changed = !timeline || !line || timeline.season !== line.season;
      timeline = line;
      if (changed && owns()) publish(line, state.result && line && state.result.season === line.season ? state.result : null);
    }

    if (!timeline) { idle(); return state; }

    state.season = timeline.season;
    state.nextRaidAt = timeline.arriveAt;
    state.warnAt = timeline.warnAt;
    state.count = timeline.count;

    // ---- phase from the clock alone, so an observer lands on the same phase as the owner.
    let phase = 'idle';
    if (now >= timeline.endAt) phase = 'idle';
    else if (now >= timeline.departAt) phase = 'depart';
    else if (now >= timeline.raidAt) phase = 'raid';
    else if (now >= timeline.arriveAt) phase = 'assault';
    else if (now >= timeline.inboundAt) phase = 'inbound';
    else if (now >= timeline.warnAt) phase = 'warning';
    state.phase = phase;
    state.active = phase !== 'idle' && phase !== 'warning';

    // ---- the announcement. Fires once, on every client, warnLeadSec before the mouth.
    if (phase !== 'idle' && warnedSeason !== timeline.season && now >= timeline.warnAt) {
      warnedSeason = timeline.season;
      stats.warnings++;
      fire(warningCbs, {
        season: timeline.season,
        seasonName: timeline.name,
        arriveAt: timeline.arriveAt,
        count: timeline.count,
        leadSec: Math.max(0, (timeline.arriveAt - now) / 1000),
      });
    }

    // ---- the outcome. OWNER ONLY, once per season, at the end of the assault window.
    if (owns() && resolvedSeason < timeline.season && now >= timeline.raidAt) {
      const snap = readComb(comb);
      const defence = resolveDefence(timeline.count, snap);
      const rnd = mulberry32(hash32(HORNETS.seed ^ 0x27d4eb2f, timeline.season));
      const result = tallyLoss(defence, comb, rnd);
      result.season = timeline.season;
      result.count = timeline.count;
      resolvedSeason = timeline.season;
      state.result = result;
      stats.resolves++;
      publish(timeline, result);
      fire(resultCbs, result);
    }

    // ---- swarm bookkeeping and rendering (everyone, owner or not)
    if (state.active || phase === 'inbound') {
      if (timeline.__seeded !== timeline.season) { seedSwarm(timeline); timeline.__seeded = timeline.season; }
      const res = state.result && state.result.season === timeline.season
        ? state.result
        : previewResult(timeline);
      if (timeline.__fated !== res.breachers) { assignFates(timeline, res); timeline.__fated = res.breachers; }
      state.threat = threatFor(phase, now, res);
      render(now, phase, res);
      checkContact(phase);
    } else {
      state.threat = phase === 'warning'
        ? 0.15 + 0.25 * clamp01((now - timeline.warnAt) / Math.max(1, timeline.inboundAt - timeline.warnAt))
        : 0;
      hide();
    }

    return state;
  }

  function idle() {
    state.phase = 'idle';
    state.active = false;
    state.count = 0;
    state.nextRaidAt = 0;
    state.threat = 0;
    state.warnAt = 0;
    state.season = -1;
    hide();
  }

  // What the CURRENT moment belongs to: a raid still running, else the next one ahead.
  function deriveCurrent(now, e) {
    const idx = seasonIndexAt(now, e);
    // one season back, in case a raid that started late in season S runs into S+1
    for (let k = -1; k < HORNETS.lookaheadSeasons; k++) {
      const s = idx + k;
      if (s < 0) continue;
      const raid = raidForSeason(s, HORNETS.seed);
      if (!raid) continue;
      const line = timelineOf(raid, e);
      if (line.endAt <= now) continue;
      return line;
    }
    return null;
  }

  // The defence as it stands right now — used to shape the visuals before the owner has
  // committed the outcome, and as the observer's stand-in until the payload arrives.
  function previewResult(line) {
    const defence = resolveDefence(line.count, readComb(comb));
    return { breachers: defence.breachers, strength: defence.strength, season: line.season, preview: true };
  }

  function threatFor(phase, now, res) {
    const bite = 1 - clamp01(res.strength);
    if (phase === 'inbound') return 0.4 + 0.35 * clamp01((now - timeline.inboundAt) / (T.approachSec * 1000));
    if (phase === 'assault') return 0.75 + 0.25 * bite;
    if (phase === 'raid') return 0.55 + 0.45 * bite;
    if (phase === 'depart') return 0.45 * bite;
    return 0;
  }

  // ---------------------------------------------------------------- placement

  function positionOf(i, phase, tRel, now) {
    const swirl = R.swirlAmp;
    const f = R.swirlFreq;
    const t = now * 0.001;
    const sx = Math.sin(t * f[0] + phaseA[i]) * swirl;
    const sy = Math.sin(t * f[1] + phaseB[i]) * swirl * 0.6;
    const sz = Math.cos(t * f[2] + phaseC[i]) * swirl;

    if (phase === 'inbound') {
      const u = ease(clamp01(tRel / T.approachSec), R.approachEase);
      originFor(timeline);
      _pos.lerpVectors(_origin, mouth, u);
      _pos.x += lane[i] * 6 * (1 - u);
      _pos.y += (1 - u) * 3 * lane[i];
    } else if (phase === 'assault') {
      const gone = tRel - leaveAt[i];
      if (!breacher[i] && gone > 0) {
        // A repelled hornet's own flight home.
        const u = ease(clamp01(gone / T.retreatSec), 1.6);
        originFor(timeline);
        _pos.lerpVectors(mouth, _origin, u);
      } else {
        circleAt(i, t);
      }
    } else if (phase === 'raid') {
      if (breacher[i]) { _pos.copy(mouth); return null; }   // inside, out of sight
      originFor(timeline);
      _pos.copy(_origin);
      return null;
    } else if (phase === 'depart') {
      if (!breacher[i]) return null;
      const u = ease(clamp01(tRel / T.departSec), 1.4);
      originFor(timeline);
      _pos.lerpVectors(mouth, _origin, u);
    } else {
      return null;
    }

    _pos.x += sx; _pos.y += sy; _pos.z += sz;
    return _pos;
  }

  function circleAt(i, t) {
    const a = ring[i] + t * R.circleSpeed;
    _pos.set(
      mouth.x + Math.cos(a) * R.circleRadius,
      mouth.y + ringY[i] * 0.5 + Math.sin(a * 1.7 + phaseA[i]) * 0.7,
      mouth.z + Math.sin(a) * R.circleRadius * 0.55
    );
  }

  function render(now, phase, res) {
    const base = phase === 'inbound' ? timeline.inboundAt
      : phase === 'assault' ? timeline.arriveAt
        : phase === 'raid' ? timeline.raidAt
          : timeline.departAt;
    const tRel = (now - base) / 1000;
    const n = Math.min(MAX, timeline.count);

    let live = 0;
    let wings = 0;
    for (let i = 0; i < n; i++) {
      const p = positionOf(i, phase, tRel, now);
      liveOn[i] = p ? 1 : 0;
      if (!p) continue;

      _prev.copy(livePos[i]);
      _dir.subVectors(p, _prev);
      if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
      _dir.normalize();
      _quat.setFromUnitVectors(_up, _dir);
      // The body model points +Y; align it with travel and roll it a touch per hornet.
      _mat.compose(p, _quat, _scale);
      bodyMesh.setMatrixAt(live, _mat);
      _abdScale.set(1, 1, 1);
      _mat2.compose(p, _quat, _abdScale);
      abdomenMesh.setMatrixAt(live, _mat2);

      const flap = Math.sin(now * 0.06 + phaseA[i]) * 0.9;
      for (let w = 0; w < 2; w++) {
        _wingE.set(0, 0, w === 0 ? flap : Math.PI - flap);
        _wingQ.setFromEuler(_wingE);
        _wingQ.premultiply(_quat);
        _mat2.compose(p, _wingQ, _scale);
        wingMesh.setMatrixAt(wings++, _mat2);
      }

      livePos[i].copy(p);
      live++;
    }

    bodyMesh.count = live;
    abdomenMesh.count = live;
    wingMesh.count = wings;
    bodyMesh.instanceMatrix.needsUpdate = true;
    abdomenMesh.instanceMatrix.needsUpdate = true;
    wingMesh.instanceMatrix.needsUpdate = true;
    group.visible = live > 0;
    void res;
  }

  function hide() {
    if (!group.visible && bodyMesh.count === 0) return;
    bodyMesh.count = 0;
    abdomenMesh.count = 0;
    wingMesh.count = 0;
    group.visible = false;
    for (let i = 0; i < MAX; i++) liveOn[i] = 0;
  }

  // ---------------------------------------------------------------- contact

  // Local to each client: only this machine knows where its own queen really is. Touching
  // a hornet costs the carried load and sends her home — never health, never progress.
  function checkContact(phase) {
    if (contactCooldown > 0) return;
    if (phase !== 'assault' && phase !== 'inbound' && phase !== 'depart') return;
    if (!flight || !flight.position) return;
    const r2 = HORNETS.contact.radius * HORNETS.contact.radius;
    const n = timeline ? Math.min(MAX, timeline.count) : 0;
    for (let i = 0; i < n; i++) {
      if (!liveOn[i]) continue;
      if (livePos[i].distanceToSquared(flight.position) <= r2) {
        contactCooldown = HORNETS.contact.cooldownSec;
        stats.contacts++;
        fire(contactCbs, {
          at: livePos[i].clone(),
          season: timeline ? timeline.season : -1,
          phase,
        });
        return;
      }
    }
  }

  // ---------------------------------------------------------------- api

  return {
    state,
    stats,
    group,
    update,
    schedule,
    onWarning(cb) { return sub(warningCbs, cb); },
    onContact(cb) { return sub(contactCbs, cb); },
    onRaidResult(cb) { return sub(resultCbs, cb); },
    setActive(mine) { activeOverride = mine === null || mine === undefined ? null : Boolean(mine); },
    get owns() { return owns(); },
    get timeline() { return timeline; },
    get published() { return published; },
    get mouth() { return mouth; },
    setEpoch(ms) { if (Number.isFinite(ms) && ms > 0) { epoch = ms; scheduleAcc = 1e9; timeline = null; } },
    // Test/debug seam: the phase names in order, and a pure preview of what the current
    // nest would do to a raid of `n` right now.
    phases: HORNET_PHASES,
    preview(n) { return resolveDefence(n, readComb(comb)); },
    // Live world positions, indexed by hornet. Read-only by contract; the array itself is
    // reused every frame, so callers must not hold on to the vectors.
    get positions() { return livePos; },
    get liveFlags() { return liveOn; },
    dispose() {
      disposed = true;
      if (typeof unsubscribe === 'function') { try { unsubscribe(); } catch (err) { /* noop */ } }
      unsubscribe = null;
      if (group.parent) group.parent.remove(group);
      bodyMesh.dispose(); abdomenMesh.dispose(); wingMesh.dispose();
      bodyGeo.dispose(); abdomenGeo.dispose(); wingGeo.dispose();
      bodyMat.dispose(); abdomenMat.dispose(); wingMat.dispose();
      warningCbs.length = 0; contactCbs.length = 0; resultCbs.length = 0;
    },
  };

  function sub(list, cb) {
    if (typeof cb !== 'function') return () => {};
    list.push(cb);
    return () => { const i = list.indexOf(cb); if (i !== -1) list.splice(i, 1); };
  }
}

// ---------------------------------------------------------------- small utils

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function ease(u, k) { return 1 - Math.pow(1 - clamp01(u), k); }

function makeBodyGeometry(R) {
  const g = typeof THREE.CapsuleGeometry === 'function'
    ? new THREE.CapsuleGeometry(R.bodyRadius, R.bodyLength * 0.6, 3, 7)
    : new THREE.CylinderGeometry(R.bodyRadius, R.bodyRadius * 0.8, R.bodyLength, 7, 1);
  return g;
}
