// Hollowtree — the comb: cells on the hex lattice, their adjacency bonuses, the stores
// they provide and the transaction that stops two queens claiming the same cell.
//
// Three invariants this file exists to hold:
//   1. A cell type is data (src/config.comb.js). Nothing here branches on a type id.
//   2. Every cell that costs something is charged through one all-or-nothing spend, and
//      the cell is CLAIMED BEFORE it is CHARGED — the loser of a race never pays.
//   3. Instance matrices are written on change, never per frame. The only cells that
//      move are the handful still under construction, and they move on a fixed tick.

import * as THREE from 'three';
import { COMB } from '../config.js';
import {
  CELL_TYPES, ALL_CELL_TYPES, CELL_BY_ID, COMB_TUNING, COST_KINDS, costOf, refundOf,
} from '../config.comb.js';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _mat = new THREE.Matrix4();
const _color = new THREE.Color();
const _neighbours = [];

const CAP_KINDS = ['pollen', 'nectar', 'resin', 'honey'];

// Multiplies one named entry of a plain effects clone by (1 + bonus). The path grammar
// is the `applies` field from config.comb.js: 'swarmCap', 'convert.rate', 'capacity.pollen'.
function applyBonusPath(effects, path, factor) {
  if (!path || path === 'none' || factor === 1) return;
  const parts = path.split('.');
  let node = effects;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node && node[parts[i]];
    if (!node || typeof node !== 'object') return;
  }
  const leaf = parts[parts.length - 1];
  if (typeof node[leaf] === 'number') node[leaf] *= factor;
}

function cloneEffects(source) {
  const out = {};
  for (const key of Object.keys(source || {})) {
    const value = source[key];
    if (Array.isArray(value)) out[key] = value.slice();
    else if (value && typeof value === 'object') out[key] = { ...value };
    else out[key] = value;
  }
  return out;
}

export function hexCellGeometry(pitch, depth) {
  // Across-flats == the lattice pitch, so neighbouring cells share a wall. A six-sided
  // cylinder laid on its side already has vertices up/down and flats facing ±tangent,
  // which is exactly the orientation cellBasis() hands us (local X = tangent, Z = normal).
  const radius = (pitch * COMB_TUNING.fill) / Math.sqrt(3);
  const geometry = new THREE.CylinderGeometry(radius, radius, depth, 6, 1, false);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function createComb(options) {
  const opts = options || {};
  const interior = opts.interior || null;
  const grid = opts.grid || (interior && interior.grid) || null;
  if (!grid) throw new Error('createComb needs a hex grid');
  const spec = opts.spec || (interior && interior.spec) || null;
  const resources = opts.resources || null;
  const scene = opts.scene || (interior && interior.group) || null;
  const audio = opts.audio || null;

  const entrance = opts.entrance || (spec
    ? { s: spec.entranceS, y: spec.entranceY, radius: spec.entranceRadius }
    : null);

  // The bare hollow's own room, before a single store cell. Overridable so a harness can
  // fund itself without rewriting the shipped economy.
  const baseCapacity = { ...COMB_TUNING.baseCapacity, ...(opts.baseCapacity || {}) };

  function emptyCapacity() {
    const out = {};
    for (const kind of CAP_KINDS) out[kind] = Number(baseCapacity[kind]) || 0;
    return out;
  }

  const cells = new Map();          // key -> record
  const building = new Set();       // records still under construction
  const listeners = [];
  const stores = { honey: 0 };
  const staffing = { ...COMB_TUNING.staffing };

  const stats = {
    matrixWrites: 0,
    colorWrites: 0,
    rebuilds: 0,
    recomputes: 0,
    remoteApplies: 0,
    lastRecomputeMs: 0,
  };

  let net = null;
  let unsubCells = null;
  let unsubStores = null;
  let unsubLattice = null;
  let disposed = false;

  // ---------------------------------------------------------------- clock and wallet

  function clockNow() {
    if (typeof opts.now === 'function') return opts.now();
    if (net && net.world && typeof net.world.now === 'function') return net.world.now();
    return Date.now();
  }

  function ownerId() {
    return (net && net.uid) || opts.uid || 'local';
  }

  function bankValue(kind) {
    if (net && net.bank && typeof net.bank.snapshot === 'function') {
      const snap = net.bank.snapshot();
      return Number(snap[kind]) || 0;
    }
    if (kind === 'honey') return stores.honey;
    return resources && typeof resources[kind] === 'number' ? resources[kind] : 0;
  }

  function affordable(cost) {
    for (const kind of COST_KINDS) {
      if ((cost[kind] || 0) > 0 && bankValue(kind) + 1e-6 < cost[kind]) return false;
    }
    return true;
  }

  // One spend, all-or-nothing, whichever bank is behind it.
  async function spend(cost) {
    let any = false;
    for (const kind of COST_KINDS) if ((cost[kind] || 0) > 0) any = true;
    if (!any) return true;
    if (net && net.bank && typeof net.bank.spend === 'function') {
      return Boolean(await net.bank.spend(cost));
    }
    if (!resources || typeof resources.apply !== 'function') return true;
    const delta = {};
    for (const kind of COST_KINDS) if (cost[kind] > 0) delta[kind] = -cost[kind];
    return Boolean(resources.apply(delta));
  }

  async function refund(amounts) {
    if (net && net.bank && typeof net.bank.deposit === 'function') {
      for (const kind of Object.keys(amounts)) {
        if (amounts[kind] > 0) await net.bank.deposit(kind, amounts[kind]);
      }
      return true;
    }
    if (!resources || typeof resources.apply !== 'function') return true;
    const delta = {};
    for (const kind of Object.keys(amounts)) if (amounts[kind] > 0) delta[kind] = amounts[kind];
    return Boolean(resources.apply(delta));
  }

  // ---------------------------------------------------------------- instanced render

  const meshes = new Map();
  let group = null;

  if (scene) {
    group = new THREE.Group();
    group.name = 'comb';
    const geometry = hexCellGeometry(grid.cellSize(), COMB.cellDepth * COMB_TUNING.depthFill);
    // ALL_CELL_TYPES, not CELL_TYPES: the hidden seed type has to have a mesh even though
    // it must never appear in the build panel.
    for (const type of ALL_CELL_TYPES) {
      const glow = typeof type.emissive === 'number' ? type.emissive : COMB_TUNING.emissive;
      const material = new THREE.MeshStandardMaterial({
        color: type.color,
        roughness: 0.72,
        metalness: 0.02,
        emissive: new THREE.Color(type.color).multiplyScalar(glow),
      });
      const mesh = new THREE.InstancedMesh(geometry, material, COMB.maxCells);
      mesh.name = `comb_${type.id}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COMB.maxCells * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh);
      meshes.set(type.id, { mesh, slots: [], count: 0, geometry, material });
    }
    scene.add(group);
  }

  function markRange(attribute, slot, stride) {
    if (!attribute) return;
    if (typeof attribute.addUpdateRange === 'function') {
      attribute.addUpdateRange(slot * stride, stride);
    }
    attribute.needsUpdate = true;
  }

  // instanceColor MULTIPLIES the material colour, so the finished, working state is
  // plain white — anything else here is a deliberate darkening.
  function tintFor(cell) {
    if (!cell.done) return _color.setScalar(0.34 + 0.5 * cell.progress);
    if (!cell.active) return _color.set(COMB_TUNING.colors.inert);
    return _color.setScalar(1);
  }

  function writeCell(cell) {
    const entry = meshes.get(cell.type);
    if (!entry || cell.slot < 0) return;
    const s = cell.done
      ? 1
      : COMB_TUNING.growFrom + (1 - COMB_TUNING.growFrom) * cell.progress;
    grid.cellCenter(cell.col, cell.row, cell.layer, _pos);
    grid.cellBasis(cell.col, cell.row, _quat);
    _scale.set(s, s, s);
    _mat.compose(_pos, _quat, _scale);
    entry.mesh.setMatrixAt(cell.slot, _mat);
    markRange(entry.mesh.instanceMatrix, cell.slot, 16);
    stats.matrixWrites++;
  }

  function writeTint(cell) {
    const entry = meshes.get(cell.type);
    if (!entry || cell.slot < 0 || !entry.mesh.instanceColor) return;
    entry.mesh.setColorAt(cell.slot, tintFor(cell));
    markRange(entry.mesh.instanceColor, cell.slot, 3);
    stats.colorWrites++;
  }

  function acquireSlot(cell) {
    const entry = meshes.get(cell.type);
    if (!entry) { cell.slot = -1; return; }
    if (entry.count >= COMB.maxCells) { cell.slot = -1; return; }
    cell.slot = entry.count++;
    entry.slots[cell.slot] = cell;
    entry.mesh.count = entry.count;
    writeCell(cell);
    writeTint(cell);
  }

  function releaseSlot(cell) {
    const entry = meshes.get(cell.type);
    if (!entry || cell.slot < 0) return;
    const last = entry.count - 1;
    if (cell.slot !== last) {
      const moved = entry.slots[last];
      entry.mesh.getMatrixAt(last, _mat);
      entry.mesh.setMatrixAt(cell.slot, _mat);
      markRange(entry.mesh.instanceMatrix, cell.slot, 16);
      stats.matrixWrites++;
      if (entry.mesh.instanceColor) {
        entry.mesh.getColorAt(last, _color);
        entry.mesh.setColorAt(cell.slot, _color);
        markRange(entry.mesh.instanceColor, cell.slot, 3);
        stats.colorWrites++;
      }
      moved.slot = cell.slot;
      entry.slots[cell.slot] = moved;
    }
    entry.slots[last] = null;
    entry.count = last;
    entry.mesh.count = last;
    cell.slot = -1;
  }

  // ---------------------------------------------------------------- lattice bookkeeping

  function insert(record) {
    record.slot = -1;
    grid.cells.set(record.key, {
      col: record.col, row: record.row, layer: record.layer, key: record.key, data: record,
    });
    cells.set(record.key, record);
    acquireSlot(record);
    if (!record.done) building.add(record);
  }

  function drop(record) {
    building.delete(record);
    releaseSlot(record);
    cells.delete(record.key);
    grid.cells.delete(record.key);
  }

  function makeRecord(col, row, layer, typeId, owner, at) {
    const type = CELL_BY_ID.get(typeId);
    const buildTime = Math.max(0, (type && type.buildTime) || 0) / buildSpeed();
    const record = {
      key: grid.key(col, row, layer),
      col: grid.wrapCol(col),
      row,
      layer: layer | 0,
      type: typeId,
      owner: owner || ownerId(),
      placedAt: at,
      buildTime,
      progress: buildTime > 0 ? 0 : 1,
      done: buildTime <= 0,
      active: true,
      routeDist: Infinity,
      bonus: { id: null, label: '', count: 0, value: 0 },
      slot: -1,
    };
    return record;
  }

  function buildSpeed() {
    return 1 + (effects ? effects.buildSpeed : 0) + staffing.builder * 0.5;
  }

  // ---------------------------------------------------------------- entrance route

  let mouthKeys = new Set();

  // The mouth is the ring of buildable cells hugging the aperture. It cannot be found by
  // walking neighbours — the aperture cells are invalid, so neighbours() never returns
  // them and a hop-count from the anchor lands inside the hole. Measure instead: the
  // aperture is excluded on a max(ds, dy) box of (radius + COMB.entranceClear), so every
  // valid cell within a couple of pitches of that box is, by construction, its rim.
  function computeMouth() {
    mouthKeys = new Set();
    if (!entrance) return;
    const clear = (Number(entrance.radius) || 0) + COMB.entranceClear;
    const band = clear + COMB_TUNING.apertureRing * grid.cellWidth;
    // Anchored on the starting comb, not on the aperture. Comb lives on one wall now and the
    // aperture is in a different one, so no buildable cell is near the hole any more and this
    // set came back empty — which silently made every routeDist Infinity and permanently
    // disabled the route-gated defensive cells. The core of the comb is the thing worth
    // defending, so the route grows from there.
    const anchorS = grid.wrapS(grid.buildWallCenterS);
    for (let row = 0; row <= grid.rows; row++) {
      if (Math.abs(grid.yOf(row) - entrance.y) > band) continue;
      for (let col = 0; col < grid.columns; col++) {
        if (!grid.isValid(col, row, 0)) continue;
        let ds = Math.abs(grid.sOf(col, row) - anchorS);
        if (ds > grid.perimeter * 0.5) ds = grid.perimeter - ds;
        if (Math.max(ds, Math.abs(grid.yOf(row) - entrance.y)) > band) continue;
        mouthKeys.add(grid.key(col, row, 0));
      }
    }
  }

  function computeRoute() {
    for (const cell of cells.values()) cell.routeDist = Infinity;
    if (!entrance) {
      // No aperture information: route gating cannot be evaluated, so it does not gate.
      for (const cell of cells.values()) cell.routeDist = 0;
      return;
    }
    let frontier = [];
    for (const key of mouthKeys) {
      const cell = cells.get(key);
      if (cell) { cell.routeDist = 0; frontier.push(cell); }
    }
    while (frontier.length) {
      const next = [];
      for (const cell of frontier) {
        const list = grid.neighbors(cell.col, cell.row, cell.layer, _neighbours);
        for (let i = 0; i < list.length; i++) {
          const other = cells.get(grid.key(list[i].col, list[i].row, list[i].layer));
          if (!other || other.routeDist <= cell.routeDist + 1) continue;
          other.routeDist = cell.routeDist + 1;
          next.push(other);
        }
      }
      frontier = next;
    }
  }

  // ---------------------------------------------------------------- bonuses and totals

  function countNeighbours(cell, predicate) {
    const list = grid.neighbors(cell.col, cell.row, cell.layer, _neighbours);
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const other = cells.get(grid.key(list[i].col, list[i].row, list[i].layer));
      if (other && other.done && predicate(other)) count++;
    }
    return count;
  }

  function bonusFor(cell, type) {
    const rule = type && type.bonus;
    if (!rule) return { id: null, label: '', count: 0, value: 0 };
    let count = 0;
    if (rule.source === 'occupiedNeighbours') {
      count = countNeighbours(cell, () => true);
    } else if (rule.source === 'sameType') {
      count = countNeighbours(cell, (o) => o.type === cell.type);
    } else if (rule.source === 'neighbourTag') {
      count = countNeighbours(cell, (o) => {
        const t = CELL_BY_ID.get(o.type);
        return Boolean(t && t.tags && t.tags.includes(rule.tag));
      });
    } else if (rule.source === 'routeProximity') {
      const range = (type.gate && type.gate.range) || COMB_TUNING.routeRange;
      count = Number.isFinite(cell.routeDist) ? Math.max(0, range - cell.routeDist) : 0;
    }
    const staff = rule.staff ? (Number(staffing[rule.staff]) || 0) : 1;
    const value = Math.min(rule.max, rule.per * count) * staff;
    return { id: rule.id, label: rule.label || rule.id, count, value };
  }

  function gatePasses(cell, type) {
    if (!type || !type.gate) return true;
    if (type.gate.kind === 'route') {
      if (!entrance) return true;
      return Number.isFinite(cell.routeDist) && cell.routeDist <= type.gate.range;
    }
    return true;
  }

  let effects = freshEffects();

  function freshEffects() {
    return {
      capacity: emptyCapacity(),
      swarmCap: 0,
      convertRate: 0,       // honey units / second
      convertDrain: 0,      // nectar units / second at that rate
      buildSpeed: 0,
      guardSlots: 0,
      hornetSlow: 0,
      forageThroughput: 1,
      trapCharges: 0,
      unlocked: new Set(),
      queenChambers: new Map(),
      counts: {},
      cellCount: 0,
      doneCount: 0,
      buildingCount: 0,
    };
  }

  function recompute() {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    computeRoute();
    const next = freshEffects();

    for (const cell of cells.values()) {
      const type = CELL_BY_ID.get(cell.type);
      next.cellCount++;
      next.counts[cell.type] = (next.counts[cell.type] || 0) + 1;
      if (!cell.done) { next.buildingCount++; continue; }
      next.doneCount++;

      cell.bonus = bonusFor(cell, type);
      const wasActive = cell.active;
      cell.active = gatePasses(cell, type);
      if (cell.active !== wasActive && cell.slot >= 0) writeTint(cell);
      if (!cell.active || !type) continue;

      const eff = cloneEffects(type.effects);
      if (type.bonus) applyBonusPath(eff, type.bonus.applies, 1 + cell.bonus.value);

      if (eff.capacity) {
        for (const kind of CAP_KINDS) next.capacity[kind] += Number(eff.capacity[kind]) || 0;
      }
      if (eff.swarmCap) next.swarmCap += eff.swarmCap;
      if (eff.convert && eff.convert.to === 'honey') {
        next.convertRate += eff.convert.rate;
        next.convertDrain += eff.convert.rate * (eff.convert.per || 1);
      }
      if (eff.buildSpeed) next.buildSpeed += eff.buildSpeed;
      if (eff.guardSlots) next.guardSlots += eff.guardSlots;
      if (eff.hornetSlow) next.hornetSlow += eff.hornetSlow;
      if (eff.forageThroughput) next.forageThroughput += eff.forageThroughput;
      if (eff.trapCharges) next.trapCharges += eff.trapCharges;
      if (eff.unlocks) for (const id of eff.unlocks) next.unlocked.add(id);
      if (eff.queenChamber) {
        next.queenChambers.set(cell.owner, (next.queenChambers.get(cell.owner) || 0) + 1);
      }
    }

    next.hornetSlow = Math.min(0.9, next.hornetSlow);
    next.forageThroughput = Math.max(0.25, next.forageThroughput);
    effects = next;

    // Stores are only real if the bank honours them.
    if (resources && typeof resources.setCapacity === 'function') {
      for (const kind of COST_KINDS) resources.setCapacity(kind, next.capacity[kind]);
    }
    if (stores.honey > next.capacity.honey) stores.honey = next.capacity.honey;

    stats.recomputes++;
    stats.lastRecomputeMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    // The START label earns its place only until the player has built something of their own;
    // after that it is a sign pointing at a road they are already on.
    if (cells.size) {
      buildStartLabel();
      // COMB_TUNING.seed, not the SEED alias — that const is declared below this function and
      // reading it here would be a temporal-dead-zone error if recompute ever ran during init.
      const seedCount = Math.max(1, ((COMB_TUNING.seed && COMB_TUNING.seed.cells) | 0) || 1);
      if (startLabel) startLabel.visible = cells.size <= seedCount;
    }
    fire();
    return effects;
  }

  function fire() {
    for (let i = 0; i < listeners.length; i++) listeners[i](effects, cells);
  }

  // ---------------------------------------------------------------- queries

  function unlockedTypes() {
    const out = [];
    for (const type of CELL_TYPES) {
      if (!type.requires || effects.unlocked.has(type.id)) out.push(type.id);
    }
    return out;
  }

  function typeUnlocked(typeId) {
    const type = CELL_BY_ID.get(typeId);
    if (!type) return false;
    return !type.requires || effects.unlocked.has(typeId);
  }

  function canPlace(col, row, layer, typeId) {
    const type = CELL_BY_ID.get(typeId);
    const cost = costOf(typeId);
    const out = { ok: false, reason: '', cost, affordable: affordable(cost) };
    if (!type) { out.reason = 'unknown'; return out; }
    if (!typeUnlocked(typeId)) { out.reason = 'locked'; return out; }
    if (!grid.isValid(col, row, layer)) { out.reason = 'blocked'; return out; }
    if (grid.has(col, row, layer)) { out.reason = 'occupied'; return out; }
    if (cells.size && !grid.touchesExisting(col, row, layer)) { out.reason = 'detached'; return out; }
    if (cells.size >= COMB.maxCells) { out.reason = 'full'; return out; }
    if (type.limitPerPlayer) {
      const mine = effects.queenChambers.get(ownerId()) || 0;
      let pending = 0;
      for (const cell of cells.values()) {
        if (cell.type === typeId && cell.owner === ownerId() && !cell.done) pending++;
      }
      if (mine + pending >= type.limitPerPlayer) { out.reason = 'limit'; return out; }
    }
    if (!out.affordable) { out.reason = 'cost'; return out; }
    out.ok = true;
    return out;
  }

  // Removing a cell must not leave an island: the nest is one organic mass, and the
  // touch rule would otherwise be enforced on the way in and quietly broken on the way out.
  function staysConnected(key) {
    if (cells.size <= 1) return true;
    let start = null;
    for (const k of cells.keys()) { if (k !== key) { start = cells.get(k); break; } }
    if (!start) return true;
    const seen = new Set([start.key]);
    let frontier = [start];
    while (frontier.length) {
      const next = [];
      for (const cell of frontier) {
        const list = grid.neighbors(cell.col, cell.row, cell.layer, _neighbours);
        for (let i = 0; i < list.length; i++) {
          const k = grid.key(list[i].col, list[i].row, list[i].layer);
          if (k === key || seen.has(k)) continue;
          const other = cells.get(k);
          if (!other) continue;
          seen.add(k);
          next.push(other);
        }
      }
      frontier = next;
    }
    return seen.size === cells.size - 1;
  }

  // ---------------------------------------------------------------- the seed comb

  // Why this exists at all: `canPlace` refuses anything that does not touch the comb, and
  // on a hive with zero cells the very first placement is unconstrained — anywhere on a
  // lattice that wraps the whole hall. One stray click on a far wall and every later
  // placement is refused against a cell the player has no way to find. Seeding removes the
  // zero-cell state, so the touch rule always points at something visible.

  const SEED = COMB_TUNING.seed || {};
  const SEED_TYPE = SEED.type || 'seed';
  const SEED_OWNER = SEED.owner || 'hive';

  // idle -> running -> done. `done` is only latched when the hive demonstrably has cells,
  // so a transaction lost to a dropped socket is retried on the next empty snapshot.
  let seedPhase = 'idle';

  // The rim of the aperture on the entrance wall, as a connected blob. Connected matters:
  // staysConnected() treats the comb as one organism, so a seed in two clumps would make
  // every later demolition read as a split.
  function seedPlan() {
    if (!entrance) return [];
    const count = Math.max(1, SEED.cells | 0);
    const steps = Math.max(1, SEED.probeSteps | 0);

    // The starting comb sits dead centre of the one buildable wall, at the height of the
    // aperture — so it is straight ahead, at eye level, the moment the queen flies in. It
    // used to hug the aperture rim on the entrance wall itself, which put it behind her.
    let anchor = null;
    for (let step = 0; step < steps && !anchor; step++) {
      // Walk outward from the middle in alternating directions in case the exact centre
      // falls on a column the lattice rejects.
      const off = Math.ceil(step / 2) * (step % 2 ? 1 : -1) * grid.cellWidth;
      const c = grid.seed(grid.buildWallCenterS + off, entrance.y, 0);
      if (grid.isValid(c.col, c.row, 0)) anchor = c;
    }
    if (!anchor) return [];

    const out = [];
    const seen = new Set([grid.key(anchor.col, anchor.row, 0)]);
    let frontier = [anchor];
    while (frontier.length && out.length < count) {
      const next = [];
      for (const c of frontier) {
        if (out.length >= count) break;
        out.push({ col: grid.wrapCol(c.col), row: c.row, layer: 0 });
        const list = grid.neighbors(c.col, c.row, 0, []);
        for (let i = 0; i < list.length; i++) {
          if (list[i].layer !== 0) continue;          // stay on the wall skin
          const k = grid.key(list[i].col, list[i].row, 0);
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(list[i]);
        }
      }
      frontier = next;
    }
    return out;
  }

  async function ensureSeed() {
    if (disposed || seedPhase !== 'idle') return false;
    seedPhase = 'running';
    const plan = seedPlan();
    if (!plan.length) { seedPhase = 'done'; return false; }
    const at = clockNow();

    if (net && net.comb && typeof net.comb.transact === 'function') {
      const payload = {};
      for (const c of plan) payload[grid.key(c.col, c.row, c.layer)] = { t: SEED_TYPE, o: SEED_OWNER, a: at };
      // ONE transaction on the whole `cells` node — the same all-or-nothing shape the
      // resource bank uses. The second and third client read a non-empty node and abort,
      // so three queens opening the same fresh code still end up with exactly one seed.
      let committed = false;
      try {
        committed = await net.comb.transact('cells', (current) => {
          if (current && typeof current === 'object' && Object.keys(current).length) return undefined;
          return payload;
        });
      } catch (error) {
        committed = false;
      }
      if (committed) {
        // Same protection a player placement gets: a snapshot in flight from before our
        // write must not delete the seed straight back out again.
        const stamp = clockNow();
        for (const c of plan) grace.set(grid.key(c.col, c.row, c.layer), stamp + GRACE_MS);
      }
      // Either we won (the echo inserts the records) or somebody else already seeded and
      // their snapshot is on its way. Only latch `done` once cells actually exist, so a
      // transaction that failed for a network reason gets another go.
      seedPhase = (committed || cells.size) ? 'done' : 'idle';
      return committed;
    }

    if (cells.size) { seedPhase = 'done'; return false; }
    for (const c of plan) insert(makeRecord(c.col, c.row, c.layer, SEED_TYPE, SEED_OWNER, at));
    recompute();
    seedPhase = 'done';
    return true;
  }

  // Where the comb is, in world space, for anything that has to point the player at it.
  function seedAnchor() {
    const plan = seedPlan();
    if (!plan.length) return null;
    const c = plan[0];
    return { col: c.col, row: c.row, layer: c.layer, position: grid.cellCenter(c.col, c.row, c.layer, new THREE.Vector3()) };
  }

  // ------------------------------------------------------------------ start marker
  //
  // A label reading START, floating just off the wall above the seed. The starting comb is
  // the one thing the player must find before anything else in the hive is reachable, and
  // "there is a comb somewhere but I cannot see it" was the single most repeated complaint.
  let startLabel = null;

  function buildStartLabel() {
    if (startLabel || typeof document === 'undefined') return;
    const anchor = seedAnchor();
    if (!anchor) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 74px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '14px';
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff3d8';
    ctx.fillText('START', canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // depthTest was off, which drew the label through every wall in the hall AND straight
    // over the hero queen in the opening cinematic, 45 m behind the shot. It is a marker on a
    // wall, not a HUD element: it should be occluded by the rock like the comb it labels.
    startLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }));
    startLabel.name = 'comb_start_label';
    startLabel.scale.set(7.2, 1.8, 1);
    startLabel.position.copy(anchor.position);
    // Lift it clear of the comb and off the wall so it never z-fights the cells.
    startLabel.position.y += 2.4;
    startLabel.renderOrder = 6;
    group.add(startLabel);
  }

  const _near = new THREE.Vector3();

  function nearestCell(point) {
    if (!point || !cells.size) return null;
    let best = null;
    let bestDist = Infinity;
    for (const cell of cells.values()) {
      grid.cellCenter(cell.col, cell.row, cell.layer, _near);
      const d = _near.distanceToSquared(point);
      if (d < bestDist) { bestDist = d; best = cell; }
    }
    if (!best) return null;
    return {
      cell: best,
      key: best.key,
      position: grid.cellCenter(best.col, best.row, best.layer, new THREE.Vector3()),
      distance: Math.sqrt(bestDist),
    };
  }

  // ---------------------------------------------------------------- place / demolish

  async function place(col, row, layer, typeId) {
    const check = canPlace(col, row, layer, typeId);
    if (!check.ok) return { ok: false, reason: check.reason, cost: check.cost };
    const key = grid.key(col, row, layer);
    const at = clockNow();
    const owner = ownerId();

    if (net && net.comb && typeof net.comb.transact === 'function') {
      // Claim first, pay second. The client that loses the claim never spends, which is
      // what makes "two queens, one tick, one cell, one charge" true rather than hopeful.
      const claimed = await net.comb.transact(`cells/${key}`, (current) => (
        current && current.t ? undefined : { t: typeId, o: owner, a: at }
      ));
      if (!claimed) return { ok: false, reason: 'taken', cost: check.cost };
      const paid = await spend(check.cost);
      if (!paid) {
        grace.delete(key);
        await net.comb.set(`cells/${key}`, null);
        return { ok: false, reason: 'cost', cost: check.cost };
      }
      grace.set(key, clockNow() + GRACE_MS);
      if (!cells.has(key)) {
        insert(makeRecord(col, row, layer, typeId, owner, at));
        recompute();
      }
      if (audio && typeof audio.play === 'function') audio.play('build');
      return { ok: true, cell: cells.get(key), cost: check.cost };
    }

    if (!(await spend(check.cost))) return { ok: false, reason: 'cost', cost: check.cost };
    insert(makeRecord(col, row, layer, typeId, owner, at));
    recompute();
    if (audio && typeof audio.play === 'function') audio.play('build');
    return { ok: true, cell: cells.get(key), cost: check.cost };
  }

  async function demolish(col, row, layer) {
    const key = grid.key(col, row, layer);
    const cell = cells.get(key);
    if (!cell) return { ok: false, reason: 'empty' };
    // The seed is load-bearing for the touch rule, not decoration: tearing it out would
    // put the hive back in the zero-cell state this whole section exists to prevent.
    const cellType = CELL_BY_ID.get(cell.type);
    if (cellType && cellType.permanent) return { ok: false, reason: 'permanent' };
    if (!staysConnected(key)) return { ok: false, reason: 'split' };
    const back = refundOf(cell.type);

    if (net && net.comb && typeof net.comb.transact === 'function') {
      const removed = await net.comb.transact(`cells/${key}`, (current) => (current ? null : undefined));
      if (!removed) return { ok: false, reason: 'gone' };
      grace.delete(key);
    }
    drop(cell);
    recompute();
    await refund(back);
    if (audio && typeof audio.play === 'function') audio.play('close');
    return { ok: true, refund: back, cell };
  }

  // ---------------------------------------------------------------- network mirror

  // key -> wall-clock ms until which a locally committed placement is protected from a
  // stale remote snapshot. Cleared as soon as the echo confirms it.
  const grace = new Map();
  const GRACE_MS = 4000;

  function normalizeRemote(map) {
    const out = new Map();
    if (!map || typeof map !== 'object') return out;
    for (const key of Object.keys(map)) {
      const entry = map[key];
      if (!entry || typeof entry !== 'object' || !entry.t) continue;
      if (!CELL_BY_ID.has(entry.t)) continue;
      const parsed = grid.parseKey(key);
      if (!Number.isFinite(parsed.col) || !Number.isFinite(parsed.row)) continue;
      if (!grid.isValid(parsed.col, parsed.row, parsed.layer)) continue;
      out.set(key, { ...parsed, type: entry.t, owner: entry.o || 'remote', at: Number(entry.a) || 0 });
    }
    return out;
  }

  // A joiner receives the whole node at once; a placement by a peer arrives as the same
  // node again. Both go through this diff, so an established hive rebuilds by exactly the
  // path a single new cell takes.
  function applyRemote(map) {
    const wanted = normalizeRemote(map);
    let changed = false;

    const stamp = clockNow();
    for (const key of Array.from(cells.keys())) {
      const entry = wanted.get(key);
      const cell = cells.get(key);
      // A snapshot older than our own committed write must not delete what we just built.
      if (!entry && (grace.get(key) || 0) > stamp) continue;
      if (!entry) { drop(cell); changed = true; continue; }
      if (entry.type !== cell.type) { drop(cell); changed = true; }
    }
    for (const [key, entry] of wanted) {
      grace.delete(key); // confirmed by the shared record; no longer needs protecting
      if (cells.has(key)) continue;
      const record = makeRecord(entry.col, entry.row, entry.layer, entry.type, entry.owner, entry.at);
      // Time already served counts: a cell placed before we joined is finished.
      settleProgress(record);
      insert(record);
      changed = true;
    }
    stats.remoteApplies++;
    if (changed) { stats.rebuilds++; recompute(); }
    return changed;
  }

  function settleProgress(record) {
    if (record.buildTime <= 0) { record.progress = 1; record.done = true; return; }
    const elapsed = Math.max(0, (clockNow() - record.placedAt) / 1000);
    record.progress = Math.min(1, elapsed / record.buildTime);
    record.done = record.progress >= 1;
  }

  function attachNet(handle) {
    detachNet();
    if (!handle || !handle.comb) return false;
    net = handle;
    // Cell keys are lattice coordinates, so they only mean anything against the lattice that
    // wrote them. When the hall's cavity was measured properly the perimeter changed and
    // `columns` went 320 -> 272; every key saved before that now resolves to a different place
    // on the wall. Rather than scatter an old hive's comb across the rock, stamp the lattice
    // the cells were written against and drop the node when it does not match.
    unsubLattice = net.comb.subscribe('lattice', (value) => {
      const stored = value && Number(value.columns);
      if (!Number.isFinite(stored)) {
        // Never stamped: either brand new, or written before this check existed.
        net.comb.set('lattice', { columns: grid.columns, rows: grid.rows });
        return;
      }
      if (stored === grid.columns) return;
      console.warn(
        `[comb] hive was built on a ${stored}-column lattice, this build uses ${grid.columns} — clearing it`
      );
      net.comb.set('cells', null);
      net.comb.set('lattice', { columns: grid.columns, rows: grid.rows });
      seedPhase = 'idle';
    }) || null;
    unsubCells = net.comb.subscribe('cells', (value) => {
      applyRemote(value);
      // A hive whose shared cells node is empty has never been seeded — whether it is
      // brand new or an old save that somehow lost every cell. Seed it exactly once,
      // transactionally, from whichever client gets there first.
      const empty = !value || typeof value !== 'object' || Object.keys(value).length === 0;
      if (empty) ensureSeed().catch(() => { seedPhase = 'idle'; });
    }) || null;
    unsubStores = net.comb.subscribe('stores', (value) => {
      if (!value || typeof value !== 'object') return;
      const honey = Number(value.honey);
      if (Number.isFinite(honey)) {
        stores.honey = Math.min(honey, effects.capacity.honey);
        fire();
      }
    }) || null;
    return true;
  }

  function detachNet() {
    if (unsubCells) { try { unsubCells(); } catch (error) { /* already gone */ } }
    if (unsubStores) { try { unsubStores(); } catch (error) { /* already gone */ } }
    if (unsubLattice) { try { unsubLattice(); } catch (error) { /* already gone */ } }
    unsubCells = null;
    unsubStores = null;
    unsubLattice = null;
    net = null;
  }

  // ---------------------------------------------------------------- ripening

  // fedSec        every second offered to the ripening system
  // processedSec  the seconds that ripened at the full rate (not clipped by room or nectar)
  // produced      honey made; produced === convertRate * processedSec by construction only
  //               when nothing clipped, which is exactly what the harness checks.
  const convert = {
    accumulator: 0, fedSec: 0, processedSec: 0, produced: 0, drained: 0, clipped: 0, busy: false,
  };

  function convertStep(seconds) {
    if (!(seconds > 0) || effects.convertRate <= 0) return null;
    const room = Math.max(0, effects.capacity.honey - stores.honey);
    if (room <= 1e-9) return null;
    const perHoney = effects.convertDrain / Math.max(1e-9, effects.convertRate);
    const wanted = effects.convertRate * seconds;
    let honey = Math.min(wanted, room);
    let nectar = honey * perHoney;
    const available = bankValue('nectar');
    if (nectar > available) {
      const k = available > 0 ? available / nectar : 0;
      honey *= k;
      nectar *= k;
    }
    if (honey <= 1e-9) return null;
    return { honey, nectar, clipped: honey < wanted - 1e-9, seconds };
  }

  function tally(step, seconds) {
    if (step.clipped) convert.clipped += seconds;
    else convert.processedSec += seconds;
    convert.produced += step.honey;
    convert.drained += step.nectar;
    fire();
  }

  // Offline the whole ripening step is synchronous — no promise, so a burst of frames
  // really does run a burst of ticks instead of one per microtask turn.
  function convertLocal(seconds) {
    const step = convertStep(seconds);
    if (!step) return null;
    if (resources && typeof resources.apply === 'function') {
      if (!resources.apply({ nectar: -step.nectar })) return null;
    }
    stores.honey = Math.min(effects.capacity.honey, stores.honey + step.honey);
    tally(step, seconds);
    return step;
  }

  // Networked: only the world owner ripens, and it does so as a spend plus a transaction,
  // so three clients watching the same honey store never triple-count it.
  async function runConvert(seconds) {
    if (!net) return convertLocal(seconds);
    const step = convertStep(seconds);
    if (!step) return null;
    if (!net.authority || !net.authority.isMine()) return null;
    const paid = await net.bank.spend({ nectar: step.nectar });
    if (!paid) return null;
    await net.comb.transact('stores/honey', (current) => {
      const base = Number(current) || 0;
      return Math.min(effects.capacity.honey, base + step.honey);
    });
    stores.honey = Math.min(effects.capacity.honey, stores.honey + step.honey);
    tally(step, seconds);
    return step;
  }

  // ---------------------------------------------------------------- frame

  let buildTick = 0;

  function update(dt) {
    if (disposed || !(dt > 0)) return;

    // Per frame, not per recompute: the comb does not change during the opening, so a check
    // that only ran on change would leave the marker sitting in the middle of the cinematic.
    if (startLabel) {
      const host = typeof window !== 'undefined' ? window.hollowtree : null;
      const seedCount = Math.max(1, ((COMB_TUNING.seed && COMB_TUNING.seed.cells) | 0) || 1);
      startLabel.visible = cells.size <= seedCount && !(host && host.mode === 'cinematic');
    }

    // Only cells still growing touch the GPU, and only on a fixed tick. A finished comb
    // of any size costs nothing here.
    if (building.size) {
      buildTick += dt;
      const step = 1 / COMB_TUNING.buildTickHz;
      if (buildTick >= step) {
        const slice = buildTick;
        buildTick = 0;
        let finished = false;
        for (const cell of Array.from(building)) {
          cell.progress = Math.min(1, cell.progress + slice / Math.max(1e-3, cell.buildTime));
          if (cell.progress >= 1) {
            cell.done = true;
            building.delete(cell);
            finished = true;
          }
          writeCell(cell);
          writeTint(cell);
        }
        if (finished) recompute();
      }
    }

    if (effects.convertRate > 0 || convert.accumulator > 0) {
      convert.accumulator += dt;
      convert.fedSec += dt;
      if (convert.accumulator >= COMB_TUNING.convertTickSec && !convert.busy) {
        const slice = convert.accumulator;
        convert.accumulator = 0;
        if (!net) {
          convertLocal(slice);
        } else {
          convert.busy = true;
          const done = () => { convert.busy = false; };
          runConvert(slice).then(done, done);
        }
      }
    }
  }

  // ---------------------------------------------------------------- lifecycle

  computeMouth();
  recompute();
  if (opts.net) attachNet(opts.net);

  return {
    group,
    grid,
    cells,
    stores,
    stats,
    convert,
    types: CELL_TYPES,
    get effects() { return effects; },
    get capacity() { return effects.capacity; },
    get honey() { return stores.honey; },
    get mouth() { return mouthKeys; },
    get netAttached() { return Boolean(net); },

    // --- findability. Build mode owns the HUD text; these are the numbers it needs. ---
    // seedAnchor() is where the hive's starting comb is (or would be) in world space.
    // nearestCell(point) is the comb cell closest to a point — the queen's position, say —
    // with its world position and distance, so a "the comb is 14 m that way" line, an
    // off-screen marker or a compass arrow can be written without any lattice maths.
    seedAnchor,
    nearestCell,
    // What is actually in the stores right now, from whichever wallet is behind this hive.
    // The build panel needs it to show room left rather than raw capacity.
    bankSnapshot() {
      return {
        pollen: bankValue('pollen'),
        nectar: bankValue('nectar'),
        resin: bankValue('resin'),
        honey: stores.honey,
      };
    },
    get seeded() { return seedPhase === 'done'; },
    seedHive() { return ensureSeed(); },

    place,
    demolish,
    canPlace,
    affordable(typeId) { return affordable(costOf(typeId)); },
    costOf,
    refundOf,
    unlockedTypes,
    typeUnlocked,
    cellAt(col, row, layer) { return cells.get(grid.key(col, row, layer)) || null; },
    routeDistance(col, row, layer) {
      const cell = cells.get(grid.key(col, row, layer));
      return cell ? cell.routeDist : Infinity;
    },
    bonusAt(col, row, layer) {
      const cell = cells.get(grid.key(col, row, layer));
      return cell ? cell.bonus : null;
    },
    // What the bonus WOULD be if this type were placed here — the number the ghost shows.
    previewBonus(col, row, layer, typeId) {
      const type = CELL_BY_ID.get(typeId);
      if (!type || !type.bonus) return { id: null, label: '', count: 0, value: 0 };
      const probe = { col: grid.wrapCol(col), row, layer: layer | 0, type: typeId, routeDist: Infinity };
      if (type.bonus.source === 'routeProximity') {
        let best = Infinity;
        const list = grid.neighbors(probe.col, probe.row, probe.layer, _neighbours);
        if (mouthKeys.has(grid.key(probe.col, probe.row, probe.layer))) best = 0;
        for (let i = 0; i < list.length; i++) {
          const other = cells.get(grid.key(list[i].col, list[i].row, list[i].layer));
          if (other && Number.isFinite(other.routeDist)) best = Math.min(best, other.routeDist + 1);
        }
        probe.routeDist = best;
      }
      return bonusFor(probe, type);
    },
    setStaffing(patch) {
      if (!patch) return;
      for (const key of Object.keys(patch)) {
        const value = Number(patch[key]);
        if (Number.isFinite(value)) staffing[key] = value;
      }
      recompute();
    },
    // M3 hook: nectar ripening and build speed both scale from here.
    get staffing() { return staffing; },

    convertStep,
    convertLocal,
    runConvert,
    update,
    recompute,
    attachNet,
    detachNet,
    applyRemote,
    onChange(cb) {
      if (typeof cb !== 'function') return () => {};
      listeners.push(cb);
      cb(effects, cells);
      return () => {
        const i = listeners.indexOf(cb);
        if (i !== -1) listeners.splice(i, 1);
      };
    },
    snapshot() {
      const out = {};
      for (const [key, cell] of cells) out[key] = { t: cell.type, o: cell.owner, a: cell.placedAt };
      return out;
    },
    clear() {
      for (const cell of Array.from(cells.values())) drop(cell);
      recompute();
    },
    dispose() {
      disposed = true;
      detachNet();
      if (group && group.parent) group.parent.remove(group);
      for (const entry of meshes.values()) {
        entry.mesh.dispose();
        entry.material.dispose();
      }
      const first = meshes.values().next().value;
      if (first && first.geometry) first.geometry.dispose();
      meshes.clear();
      if (startLabel) {
        if (startLabel.parent) startLabel.parent.remove(startLabel);
        if (startLabel.material.map) startLabel.material.map.dispose();
        startLabel.material.dispose();
        startLabel = null;
      }
      listeners.length = 0;
    },
  };
}
