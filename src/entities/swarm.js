// Hollowtree — the swarm: every worker bee of every queen, in one InstancedMesh per
// worker type, steered by boids over a spatial hash.
//
// Three rules shape this file:
//   1. Worker types are DATA (src/config.swarm.js). Nothing here branches on a type id;
//      adding a type is an entry in WORKER_TYPES, never an `if` here.
//   2. One InstancedMesh per type for the WHOLE world — local flock and every remote
//      queen's flock share the same pool, so three queens x 200 bees is still four
//      draw calls.
//   3. Nothing per-bee crosses the network. `composition` (counts per type) is the
//      entire payload; a remote flock is simulated locally around the peer's position.

import {
  BufferGeometry, BufferAttribute, DynamicDrawUsage, Euler, InstancedMesh,
  Matrix4, MeshLambertMaterial, Quaternion, SphereGeometry, PlaneGeometry, Vector3,
} from 'three';

import { SWARM, WORKER_TYPES, WORKER_BY_ID, workerCost } from '../config.swarm.js';

const TYPES = WORKER_TYPES;
const TYPE_COUNT = TYPES.length;
const TYPE_SLOT = new Map(TYPES.map((t, i) => [t.id, i]));
const CAP = SWARM.poolPerType * TYPE_COUNT;
const HASH_MASK = SWARM.hashBins - 1;

// ---------------------------------------------------------------- geometry
// A bee is three squashed spheres and two wing quads, baked to vertex colours so a
// whole type — body, stripes and wings — draws in a single call.

function pushGeometry(dst, src, matrix, color) {
  const geo = src.index ? src.toNonIndexed() : src;
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const v = new Vector3();
  const nm = new Matrix4().extractRotation(matrix);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    dst.pos.push(v.x, v.y, v.z);
    v.fromBufferAttribute(nrm, i).applyMatrix4(nm).normalize();
    dst.nrm.push(v.x, v.y, v.z);
    dst.col.push(color[0], color[1], color[2]);
  }
  if (geo !== src) geo.dispose();
}

function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function beeGeometry(body) {
  const dst = { pos: [], nrm: [], col: [] };
  const ball = new SphereGeometry(1, 7, 5);
  const wing = new PlaneGeometry(1, 1);
  const m = new Matrix4();
  const coat = rgb(body.coat);
  const dark = rgb(body.dark);
  const wingCol = rgb(body.wing);

  // abdomen, thorax, head — along -Z is forward
  m.makeScale(0.30, 0.28, 0.42); m.setPosition(0, 0, 0.34);
  pushGeometry(dst, ball, m, dark);
  m.makeScale(0.32, 0.30, 0.32); m.setPosition(0, 0, -0.02);
  pushGeometry(dst, ball, m, coat);
  m.makeScale(0.22, 0.22, 0.22); m.setPosition(0, 0.02, -0.32);
  pushGeometry(dst, ball, m, dark);

  for (const side of [-1, 1]) {
    m.identity();
    m.makeRotationX(-Math.PI / 2);
    m.scale(new Vector3(0.62, 1, 0.42));
    m.setPosition(side * 0.34, 0.16, 0.06);
    pushGeometry(dst, wing, m, wingCol);
  }

  ball.dispose();
  wing.dispose();

  const geo = new BufferGeometry();
  const s = body.scale || 1;
  const posArr = new Float32Array(dst.pos);
  for (let i = 0; i < posArr.length; i++) posArr[i] *= s;
  geo.setAttribute('position', new BufferAttribute(posArr, 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(dst.nrm), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(dst.col), 3));
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------- system

export function createSwarm({ scene, assets, flight, flowers, gather, comb, net } = {}) {
  void assets;

  // ---- instanced render pools -------------------------------------------
  const pools = [];
  for (let t = 0; t < TYPE_COUNT; t++) {
    const geo = beeGeometry(TYPES[t].body || {});
    const mat = new MeshLambertMaterial({ vertexColors: true });
    const mesh = new InstancedMesh(geo, mat, SWARM.poolPerType);
    mesh.name = `swarm:${TYPES[t].id}`;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = SWARM.castShadow === true;   // hard rule: false
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    if (scene) scene.add(mesh);
    pools.push({ mesh, geo, mat });
  }

  // ---- bee storage (SoA, one pool for the whole world) -------------------
  const px = new Float32Array(CAP), py = new Float32Array(CAP), pz = new Float32Array(CAP);
  const vx = new Float32Array(CAP), vy = new Float32Array(CAP), vz = new Float32Array(CAP);
  const bType = new Int8Array(CAP);
  const bFlock = new Int16Array(CAP);
  const bPhase = new Float32Array(CAP);
  const bFlower = new Int32Array(CAP).fill(-1);
  const bfx = new Float32Array(CAP), bfy = new Float32Array(CAP), bfz = new Float32Array(CAP);
  let live = 0;

  // spatial hash
  const head = new Int32Array(SWARM.hashBins);
  const next = new Int32Array(CAP);

  // flocks: 0 is always the local queen; remotes are appended
  const flocks = [];
  const remoteByUid = new Map();
  const localAnchor = new Vector3();

  function makeFlock(anchorRef, local) {
    const flock = {
      id: flocks.length, local, anchorRef,
      composition: Object.create(null),
      point: new Vector3(),
      forward: new Vector3(0, 0, -1),
      alive: true,
    };
    flocks.push(flock);
    return flock;
  }

  const localFlock = makeFlock(flight && flight.position ? flight.position : localAnchor, true);

  const composition = Object.create(null);
  for (const t of TYPES) composition[t.id] = 0;

  const upkeep = { honeyPerSec: 0, starving: false, consumed: 0, famine: 0 };
  const stats = {
    bees: 0, drawCalls: 0, msPerFrame: 0, boidMs: 0,
    gatherRate: 0, settleRadius: 0, settledBees: 0, flowersWorked: 0, neighbourTests: 0,
  };

  // ---- spawn / kill ------------------------------------------------------
  function spawn(flock, typeSlot) {
    if (live >= CAP) return false;
    const type = TYPES[typeSlot];
    if (typeCount(typeSlot) >= SWARM.poolPerType) return false;
    const i = live++;
    const a = Math.random() * Math.PI * 2;
    const r = SWARM.spread * Math.sqrt(Math.random());
    const base = flock.anchorRef || localAnchor;
    px[i] = (base.x || 0) + Math.cos(a) * r;
    py[i] = (base.y || 0) + SWARM.lift + (Math.random() - 0.5) * 0.6;
    pz[i] = (base.z || 0) + Math.sin(a) * r;
    vx[i] = (Math.random() - 0.5) * 2; vy[i] = 0; vz[i] = (Math.random() - 0.5) * 2;
    bType[i] = typeSlot;
    bFlock[i] = flock.id;
    bPhase[i] = Math.random() * 1000;
    bFlower[i] = -1;
    flock.composition[type.id] = (flock.composition[type.id] || 0) + 1;
    if (flock.local) composition[type.id] = flock.composition[type.id];
    return true;
  }

  const typeTally = new Int32Array(TYPE_COUNT);
  function typeCount(slot) {
    let n = 0;
    for (let i = 0; i < live; i++) if (bType[i] === slot) n++;
    return n;
  }

  function killAt(i) {
    const flock = flocks[bFlock[i]];
    const id = TYPES[bType[i]].id;
    if (flock) {
      flock.composition[id] = Math.max(0, (flock.composition[id] || 0) - 1);
      if (flock.local) composition[id] = flock.composition[id];
    }
    const last = --live;
    if (i !== last) {
      px[i] = px[last]; py[i] = py[last]; pz[i] = pz[last];
      vx[i] = vx[last]; vy[i] = vy[last]; vz[i] = vz[last];
      bType[i] = bType[last]; bFlock[i] = bFlock[last]; bPhase[i] = bPhase[last];
      bFlower[i] = bFlower[last];
      bfx[i] = bfx[last]; bfy[i] = bfy[last]; bfz[i] = bfz[last];
    }
  }

  function killOneOfType(typeSlot, flockId) {
    for (let i = live - 1; i >= 0; i--) {
      if (bType[i] === typeSlot && bFlock[i] === flockId) { killAt(i); return true; }
    }
    return false;
  }

  // ---- capacity ----------------------------------------------------------
  function limitNow() {
    if (!comb) return SWARM.baseLimit;
    const eff = comb.effects || {};
    const cap = Number(eff.swarmCap) || 0;
    return Math.max(SWARM.floorLimit, Math.round(cap));
  }

  function localCount() {
    let n = 0;
    for (const t of TYPES) n += composition[t.id] || 0;
    return n;
  }

  function cellUnlocked(cellId) {
    if (!cellId) return true;
    if (!comb) return false;
    if (comb.cells && typeof comb.cells.values === 'function') {
      for (const cell of comb.cells.values()) {
        if (cell.type === cellId && cell.done && cell.active !== false) return true;
      }
      return false;
    }
    const counts = (comb.effects && comb.effects.counts) || {};
    return (counts[cellId] || 0) > 0;
  }

  function unlocked(typeId) {
    const type = WORKER_BY_ID.get(typeId);
    if (!type) return false;
    return cellUnlocked(type.requiresCell);
  }

  // ---- staffing push (composition changes only, never per frame) ---------
  function pushStaffing() {
    if (!SWARM.driveCombStaffing || !comb || typeof comb.setStaffing !== 'function') return;
    const patch = {};
    let any = false;
    for (const t of TYPES) {
      if (!t.staff) continue;
      const n = composition[t.id] || 0;
      patch[t.staff] = Math.min(1, n * (t.staffPerBee || 0));
      any = true;
    }
    if (any) comb.setStaffing(patch);
  }

  // ---- buy ---------------------------------------------------------------
  async function buy(typeId, n) {
    const type = WORKER_BY_ID.get(typeId);
    const want = Math.max(0, Math.round(Number(n) || 0));
    if (!type || want <= 0) return false;
    if (!unlocked(typeId)) return false;
    if (localCount() + want > limitNow()) return false;

    const cost = workerCost(typeId, want);
    if (net && net.bank && typeof net.bank.spend === 'function') {
      const paid = await net.bank.spend(cost);
      if (!paid) return false;
    }
    const slot = TYPE_SLOT.get(typeId);
    let made = 0;
    for (let k = 0; k < want; k++) if (spawn(localFlock, slot)) made++;
    if (made > 0) pushStaffing();
    return made === want;
  }

  // ---- collective gathering ---------------------------------------------
  const probe = new Vector3();
  const fIdx = new Int32Array(SWARM.probeMax);
  const fx = new Float32Array(SWARM.probeMax);
  const fy = new Float32Array(SWARM.probeMax);
  const fz = new Float32Array(SWARM.probeMax);
  const seen = new Set();
  let fCount = 0;
  let assignTimer = 0;
  let gatheredUnits = 0;
  let rateWindow = 0;

  function settleRadius(n) {
    return Math.min(SWARM.settleMax, SWARM.settleBase + SWARM.settleGrowth * Math.sqrt(Math.max(0, n)));
  }

  function findFlowers(tx, ty, tz, skipIndex, n) {
    fCount = 0;
    seen.clear();
    if (!flowers || typeof flowers.sampleNearest !== 'function') return;
    const radius = settleRadius(n);
    stats.settleRadius = radius;
    const probes = Math.min(SWARM.probeMax, Math.max(4, Math.ceil(n * SWARM.probePerBee) + 3));
    for (let k = 0; k < probes && fCount < SWARM.probeMax; k++) {
      const rr = radius * Math.sqrt((k + 0.5) / probes);
      const a = k * 2.39996323;
      probe.set(tx + Math.cos(a) * rr, ty, tz + Math.sin(a) * rr);
      const hit = flowers.sampleNearest(probe, SWARM.probeRadius);
      if (!hit) continue;
      const idx = hit.index;
      if (idx === skipIndex || seen.has(idx)) continue;
      if (hit.ratio !== undefined && hit.ratio <= 0.02) continue;
      seen.add(idx);
      fIdx[fCount] = idx;
      fx[fCount] = hit.position.x;
      fy[fCount] = hit.position.y;
      fz[fCount] = hit.position.z;
      fCount++;
    }
  }

  function assign(target) {
    const n = localCount();
    const tp = target && target.position ? target.position : null;
    if (!tp) { clearAssignments(); return; }
    findFlowers(tp.x, tp.y, tp.z, target.index, n);
    if (fCount === 0) { clearAssignments(); return; }
    let cursor = 0;
    let onThis = 0;
    for (let i = 0; i < live; i++) {
      if (bFlock[i] !== localFlock.id) continue;
      if (!(TYPES[bType[i]].gatherRate > 0)) { bFlower[i] = -1; continue; }
      const s = cursor % fCount;
      bFlower[i] = fIdx[s];
      bfx[i] = fx[s]; bfy[i] = fy[s]; bfz[i] = fz[s];
      if (++onThis >= SWARM.beesPerFlower) { onThis = 0; cursor++; }
    }
  }

  function clearAssignments() {
    for (let i = 0; i < live; i++) bFlower[i] = -1;
    stats.settleRadius = 0;
  }

  function credit(scoop) {
    if (!scoop) return;
    gatheredUnits += scoop.taken || 0;
    if (gather) {
      if (typeof gather.creditSwarm === 'function') gather.creditSwarm(scoop);
      else if (typeof gather.credit === 'function') gather.credit(scoop);
    }
  }

  // ---- boids -------------------------------------------------------------
  const CELL = SWARM.perception;
  const SEP2 = SWARM.separation * SWARM.separation;
  const PER2 = SWARM.perception * SWARM.perception;

  // Math.imul keeps every product in int32: the plain `*` here produced doubles and
  // cost more than the distance tests it was indexing.
  function hash(ix, iy, iz, flock) {
    let h = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791) ^ Math.imul(flock, 2654435);
    h ^= h >>> 13;
    return h & HASH_MASK;
  }

  function rebuildGrid() {
    head.fill(-1);
    for (let i = 0; i < live; i++) {
      const b = hash(Math.floor(px[i] / CELL), Math.floor(py[i] / CELL), Math.floor(pz[i] / CELL), bFlock[i]);
      next[i] = head[b];
      head[b] = i;
    }
  }

  const scratchQ = new Quaternion();
  const scratchE = new Euler();
  const scratchM = new Matrix4();
  const scratchS = new Vector3(1, 1, 1);

  function steer(dt, elapsed) {
    const t0 = now();
    rebuildGrid();
    let tests = 0;
    let settled = 0;

    const maxF = SWARM.maxForce * dt;
    const maxS = SWARM.maxSpeed;

    for (let i = 0; i < live; i++) {
      const flock = flocks[bFlock[i]];
      if (!flock) continue;

      let sx = 0, sy = 0, sz = 0;      // separation
      let ax = 0, ay = 0, az = 0;      // alignment
      let cx = 0, cy = 0, cz = 0;      // cohesion
      let found = 0;

      const myFlock = bFlock[i];
      const ix = px[i], iy = py[i], iz = pz[i];
      const gx = Math.floor(ix / CELL), gy = Math.floor(iy / CELL), gz = Math.floor(iz / CELL);
      outer:
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            let j = head[hash(gx + ox, gy + oy, gz + oz, myFlock)];
            while (j !== -1) {
              if (j !== i && bFlock[j] === myFlock) {
                tests++;
                const dx = ix - px[j], dy = iy - py[j], dz = iz - pz[j];
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < PER2) {
                  found++;
                  ax += vx[j]; ay += vy[j]; az += vz[j];
                  cx += px[j]; cy += py[j]; cz += pz[j];
                  if (d2 < SEP2 && d2 > 1e-6) {
                    const inv = 1 / d2;
                    sx += dx * inv; sy += dy * inv; sz += dz * inv;
                  }
                  // Hard bound on the neighbourhood: this, plus a bin the size of the
                  // perception radius, is what keeps the search O(n) at 200 bees.
                  if (found >= SWARM.maxNeighbours) break outer;
                }
              }
              j = next[j];
            }
          }
        }
      }

      let fxA = 0, fyA = 0, fzA = 0;
      if (found > 0) {
        const inv = 1 / found;
        fxA += sx * SWARM.wSeparation; fyA += sy * SWARM.wSeparation; fzA += sz * SWARM.wSeparation;
        fxA += (ax * inv - vx[i]) * SWARM.wAlignment;
        fyA += (ay * inv - vy[i]) * SWARM.wAlignment;
        fzA += (az * inv - vz[i]) * SWARM.wAlignment;
        fxA += (cx * inv - px[i]) * SWARM.wCohesion;
        fyA += (cy * inv - py[i]) * SWARM.wCohesion;
        fzA += (cz * inv - pz[i]) * SWARM.wCohesion;
      }

      // anchor: the cloud point behind the queen, or the assigned bloom
      let tx, ty, tz, w;
      const fi = bFlower[i];
      if (fi >= 0) {
        tx = bfx[i]; ty = bfy[i] + SWARM.settleHover; tz = bfz[i];
        w = SWARM.wSettle;
      } else {
        const ph = bPhase[i];
        const a = ph * 2.39996323;
        const rr = SWARM.spread * (0.35 + 0.65 * ((ph * 0.618) % 1));
        tx = flock.point.x + Math.cos(a) * rr;
        ty = flock.point.y + ((ph * 0.37) % 1 - 0.5) * SWARM.spread;
        tz = flock.point.z + Math.sin(a) * rr;
        w = SWARM.wAnchor;
      }
      let dx = tx - px[i], dy = ty - py[i], dz = tz - pz[i];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const ease = dist < SWARM.arrive ? dist / SWARM.arrive : 1;
      const k = (w * ease) / dist;
      fxA += dx * k * SWARM.maxSpeed;
      fyA += dy * k * SWARM.maxSpeed;
      fzA += dz * k * SWARM.maxSpeed;

      // idle drift so a parked swarm still breathes
      const wt = elapsed * SWARM.wanderHz * 6.283 + bPhase[i];
      fxA += Math.sin(wt) * SWARM.wander;
      fyA += Math.sin(wt * 1.7 + 1.3) * SWARM.wander * 0.6;
      fzA += Math.cos(wt * 0.9) * SWARM.wander;

      // clamp force, integrate
      let fl = Math.sqrt(fxA * fxA + fyA * fyA + fzA * fzA);
      if (fl > maxF) { const s = maxF / fl; fxA *= s; fyA *= s; fzA *= s; }
      vx[i] += fxA; vy[i] += fyA; vz[i] += fzA;
      const damp = 1 - Math.min(1, SWARM.drag * dt);
      vx[i] *= damp; vy[i] *= damp; vz[i] *= damp;
      let sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      if (sp > maxS) { const s = maxS / sp; vx[i] *= s; vy[i] *= s; vz[i] *= s; sp = maxS; }
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;

      const floorY = (fi >= 0 ? bfy[i] : flock.point.y - 3) + SWARM.groundClearance;
      if (py[i] < floorY) { py[i] = floorY; if (vy[i] < 0) vy[i] = 0; }

      if (fi >= 0 && dist <= SWARM.settleDist + SWARM.settleHover) settled++;
    }

    stats.neighbourTests = tests;
    stats.settledBees = settled;
    stats.boidMs = now() - t0;
  }

  // ---- render ------------------------------------------------------------
  function writeMatrices(elapsed) {
    typeTally.fill(0);
    for (let i = 0; i < live; i++) {
      const t = bType[i];
      const slot = typeTally[t];
      if (slot >= SWARM.poolPerType) continue;
      typeTally[t] = slot + 1;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      let yaw = 0, pitch = 0;
      if (sp > 0.05) {
        yaw = Math.atan2(-vx[i], -vz[i]);
        pitch = Math.asin(Math.max(-1, Math.min(1, vy[i] / sp))) * -1;
      }
      const beat = elapsed * SWARM.wingBeatHz * 6.283 + bPhase[i];
      scratchE.set(pitch, yaw, Math.sin(beat) * SWARM.wingSmear * 0.35);
      scratchQ.setFromEuler(scratchE);
      scratchM.compose(
        _p.set(px[i], py[i] + Math.sin(beat * 0.25) * SWARM.bobAmp, pz[i]),
        scratchQ,
        scratchS,
      );
      pools[t].mesh.setMatrixAt(slot, scratchM);
    }
    for (let t = 0; t < TYPE_COUNT; t++) {
      const pool = pools[t];
      pool.mesh.count = typeTally[t];
      if (typeTally[t] > 0) pool.mesh.instanceMatrix.needsUpdate = true;
    }
    stats.drawCalls = TYPE_COUNT;
  }
  const _p = new Vector3();

  // ---- upkeep ------------------------------------------------------------
  let shrinkTimer = 0;

  function starveOne() {
    // highest starveOrder dies first, so the hive keeps its foragers longest
    let bestSlot = -1, bestOrder = -Infinity;
    for (let t = 0; t < TYPE_COUNT; t++) {
      if (!(composition[TYPES[t].id] > 0)) continue;
      const order = TYPES[t].starveOrder || 0;
      if (order > bestOrder) { bestOrder = order; bestSlot = t; }
    }
    if (bestSlot < 0) return false;
    const ok = killOneOfType(bestSlot, localFlock.id);
    if (ok) pushStaffing();
    return ok;
  }

  function runUpkeep(dt, ctx) {
    let perSec = 0;
    for (let t = 0; t < TYPE_COUNT; t++) perSec += (composition[TYPES[t].id] || 0) * (TYPES[t].upkeep || 0);
    const inside = Math.max(0, Math.min(1, Number(ctx && ctx.insideness) || 0));
    perSec *= 1 - SWARM.upkeepIndoorRelief * inside;
    upkeep.honeyPerSec = perSec;

    const wanted = perSec * dt;
    let available;
    const direct = SWARM.consumeHoneyDirectly && comb && comb.stores;
    if (direct) available = Number(comb.stores.honey) || 0;
    else available = ctx && Number.isFinite(ctx.honey) ? ctx.honey : Infinity;

    const taken = Math.min(available, wanted);
    if (direct) comb.stores.honey = Math.max(0, available - taken);
    upkeep.consumed = taken;

    const short = wanted > 0 && taken < wanted - 1e-9;
    if (short) upkeep.famine += dt;
    else upkeep.famine = Math.max(0, upkeep.famine - dt * (SWARM.starveGraceSec / Math.max(1e-3, SWARM.starveRecoverSec)));

    upkeep.starving = upkeep.famine > SWARM.starveGraceSec;
    if (upkeep.starving) {
      shrinkTimer += dt;
      while (shrinkTimer >= SWARM.starveShrinkSec) {
        shrinkTimer -= SWARM.starveShrinkSec;
        if (!starveOne()) { upkeep.famine = 0; upkeep.starving = false; break; }
      }
    } else {
      shrinkTimer = 0;
    }
  }

  // ---- update ------------------------------------------------------------
  let elapsed = 0;
  const _fwd = new Vector3();

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function update(dt, ctx) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const t0 = now();
    elapsed += step;
    stats.bees = live;

    // clamp the swarm to the comb's cap — demolishing brood cells shrinks it
    const cap = limitNow();
    let over = localCount() - cap;
    while (over-- > 0) { if (!starveOne()) break; }

    // anchor points, one per flock, per frame
    for (const flock of flocks) {
      const ref = flock.anchorRef;
      if (!ref) continue;
      _fwd.set(0, 0, -1);
      if (flock.local && flight && flight.velocity) {
        const s = Math.hypot(flight.velocity.x, flight.velocity.z);
        if (s > 0.2) _fwd.set(flight.velocity.x / s, 0, flight.velocity.z / s);
      }
      flock.point.set(
        (ref.x || 0) - _fwd.x * SWARM.trail,
        (ref.y || 0) + SWARM.lift,
        (ref.z || 0) - _fwd.z * SWARM.trail,
      );
    }

    // reassignment tick — flower lookups never run per frame
    const gathering = Boolean(ctx && ctx.gathering && ctx.target);
    assignTimer += step;
    if (!gathering) {
      if (stats.settleRadius !== 0) clearAssignments();
      assignTimer = 0;
    } else if (assignTimer >= 1 / SWARM.assignHz) {
      assignTimer = 0;
      assign(ctx.target);
    } else if (stats.settleRadius === 0) {
      assign(ctx.target);
    }

    if (step > 0) steer(step, elapsed);

    // settled bees draw from their bloom
    if (gathering && step > 0 && flowers && typeof flowers.drain === 'function') {
      const throughput = (comb && comb.effects && Number(comb.effects.forageThroughput)) || 1;
      const room = !(gather && gather.state && gather.state.full);
      let worked = 0;
      if (room) {
        for (let i = 0; i < live; i++) {
          const fi = bFlower[i];
          if (fi < 0) continue;
          const dx = px[i] - bfx[i], dy = py[i] - (bfy[i] + SWARM.settleHover), dz = pz[i] - bfz[i];
          const reach = SWARM.settleDist + SWARM.settleHover;
          if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
          const rate = TYPES[bType[i]].gatherRate;
          if (!(rate > 0)) continue;
          worked++;
          flowers.drain(fi, rate * throughput * step, credit);
        }
      }
      stats.flowersWorked = worked;
    } else {
      stats.flowersWorked = 0;
    }

    runUpkeep(step, ctx);
    writeMatrices(elapsed);

    // gather rate, smoothed over a second so the HUD can show it
    rateWindow += step;
    if (rateWindow >= 0.5) {
      stats.gatherRate = gatheredUnits / rateWindow;
      gatheredUnits = 0;
      rateWindow = 0;
    }

    stats.msPerFrame = now() - t0;
    return stats;
  }

  // ---- remote flocks -----------------------------------------------------
  function spawnRemote(uid, comp, positionRef) {
    if (!uid) return null;
    let flock = remoteByUid.get(uid);
    if (!flock) {
      flock = makeFlock(positionRef, false);
      flock.uid = uid;
      remoteByUid.set(uid, flock);
    } else if (positionRef) {
      flock.anchorRef = positionRef;
    }
    // reconcile counts per type — composition is the only thing that crossed the wire
    for (let t = 0; t < TYPE_COUNT; t++) {
      const id = TYPES[t].id;
      const want = Math.max(0, Math.round(Number(comp && comp[id]) || 0));
      let have = flock.composition[id] || 0;
      while (have < want) { if (!spawn(flock, t)) break; have = flock.composition[id] || 0; }
      while (have > want) { if (!killOneOfType(t, flock.id)) break; have = flock.composition[id] || 0; }
    }
    return flock;
  }

  function despawnRemote(uid) {
    const flock = remoteByUid.get(uid);
    if (!flock) return false;
    for (let i = live - 1; i >= 0; i--) if (bFlock[i] === flock.id) killAt(i);
    flock.alive = false;
    flock.anchorRef = null;
    remoteByUid.delete(uid);
    return true;
  }

  function dispose() {
    for (const pool of pools) {
      if (scene) scene.remove(pool.mesh);
      pool.mesh.dispose();
      pool.geo.dispose();
      pool.mat.dispose();
    }
    pools.length = 0;
    remoteByUid.clear();
    live = 0;
  }

  return {
    composition,
    get count() { return localCount(); },
    get limit() { return limitNow(); },
    get total() { return live; },
    types: TYPES,
    unlocked,
    costOf: workerCost,
    buy,
    update,
    spawnRemote,
    despawnRemote,
    upkeep,
    stats,
    meshes: pools.map((p) => p.mesh),
    dispose,
  };
}
