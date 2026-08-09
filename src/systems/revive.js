// Hollowtree — where a queen comes back, and how she feels about it.
//
// The rule this file serves is the one the whole game is built on: you can die, but you
// cannot lose. So there is no death screen, no countdown, no loading, and no frame in which
// the player is not flying. A hornet costs you your load and your place -- never your grip.
//
// Two things live here:
//   1. Where she reappears. Without a queen's chamber, at the hollow's mouth, as before.
//      With one, beside it -- which is the entire reason to spend resources on that cell.
//   2. How she flies for the next few seconds. Slower, visibly, recovering by itself.
//
// The chamber is looked up fresh on every revival rather than cached: a chamber can be
// built, demolished, or arrive over the network between one death and the next, and a stale
// spawn point would drop a queen inside solid wood.

import * as THREE from 'three';
import { CELL_BY_ID } from '../config.comb.js';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _out = new THREE.Vector3();

export const REVIVE = {
  // How hard the knock is, and how long it takes to shake off. Four seconds is long enough
  // to feel and short enough that nobody sits still waiting for it -- she is already flying
  // home during it.
  weakFactor: 0.55,
  weakSeconds: 4,
  // How far off the chamber's mouth she appears, along the cell's own outward normal.
  standOff: 1.35,
  // Three queens revived at one chamber must not appear inside one another. Each is pushed
  // a fixed step around a small circle by a hash of their own id, so the same queen always
  // lands in the same spot and two different ones never share it -- no negotiation, no
  // network round trip, no shoving.
  spreadRadius: 0.55,
  spreadSlots: 6,
};

function hashSlot(id, slots) {
  const text = String(id || 'local');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % slots;
}

export function createRevive(options) {
  const opts = options || {};
  const comb = opts.comb || null;
  const grid = opts.grid || null;
  const spec = opts.spec || null;
  const flight = opts.flight || null;
  const post = opts.post || null;
  const uid = () => (typeof opts.uid === 'function' ? opts.uid() : opts.uid) || 'local';

  const stats = { revivals: 0, atChamber: 0, atEntrance: 0 };

  // The chamber to use: hers if she built one, otherwise anyone's. A hive with one chamber
  // shelters the whole crew -- that is the co-op reading, and it also means the first queen
  // to build one has done something for her father and brother, not just for herself.
  function findChamber() {
    if (!comb || !comb.cells || !grid) return null;
    const mine = uid();
    let fallback = null;
    for (const cell of comb.cells.values()) {
      if (!cell.done) continue;
      // CELL_BY_ID is a Map, not a plain object -- indexing it with brackets silently
      // yields undefined and every chamber in the hive looks like an ordinary cell.
      const type = CELL_BY_ID.get(cell.type);
      if (!type || !type.effects || !type.effects.queenChamber) continue;
      if (cell.owner === mine) return cell;
      if (!fallback) fallback = cell;
    }
    return fallback;
  }

  function entrancePoint(target) {
    if (!spec) return target.set(0, 0, 0);
    return target.set(spec.centerX, spec.entranceY, spec.centerZ);
  }

  function chamberPoint(cell, target) {
    grid.cellCenter(cell.col, cell.row, cell.layer, _pos);
    grid.cellBasis(cell.col, cell.row, _quat);
    // Local +Z is the cell's outward normal, so this steps off the wall into the room.
    _out.set(0, 0, REVIVE.standOff).applyQuaternion(_quat);
    target.copy(_pos).add(_out);

    const slot = hashSlot(uid(), REVIVE.spreadSlots);
    const angle = (slot / REVIVE.spreadSlots) * Math.PI * 2;
    _out.set(Math.cos(angle) * REVIVE.spreadRadius, Math.sin(angle) * REVIVE.spreadRadius, 0)
      .applyQuaternion(_quat);
    return target.add(_out);
  }

  // Returns where she went and whether a chamber earned it, so a probe can check the claim
  // rather than trusting it.
  function revive() {
    const target = new THREE.Vector3();
    const cell = findChamber();
    if (cell) {
      chamberPoint(cell, target);
      stats.atChamber++;
    } else {
      entrancePoint(target);
      stats.atEntrance++;
    }
    stats.revivals++;

    if (flight && flight.simPosition) {
      flight.simPosition.copy(target);
      if (flight.velocity) flight.velocity.set(0, 0, 0);
    }
    if (flight && typeof flight.shake === 'function') {
      flight.shake(REVIVE.weakFactor, REVIVE.weakSeconds);
    }
    // No extra visual channel is opened here on purpose. The spec suggested driving
    // post.setMotionState, but that function takes the flight's own state object and is
    // written by the game loop every frame -- poking a made-up value into it would fight the
    // loop and corrupt the motion blur's velocity estimate. The weakness is already visible
    // in the only way that matters: the meadow goes past slower, and the blur follows the
    // real speed down with it.

    return {
      at: target.clone(),
      atChamber: Boolean(cell),
      chamber: cell ? { col: cell.col, row: cell.row, layer: cell.layer, owner: cell.owner } : null,
    };
  }

  return {
    revive,
    findChamber,
    get stats() { return stats; },
    // Exposed for probes and for anything that wants to show the player she is still shaken.
    get weakness() { return flight && typeof flight.weakness === 'number' ? flight.weakness : 1; },
  };
}
