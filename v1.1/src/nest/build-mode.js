// Hollowtree — build mode: the key that opens it, the ray that finds the wall, the ghost
// that snaps to the lattice, and the click that commits.
//
// The ray is analytic, not a mesh raycast: the comb lives on four wall planes per layer,
// so sixteen plane tests answer "which cell am I looking at" exactly, cost nothing, and
// keep working on bare wall where there is no geometry to hit yet.

import * as THREE from 'three';
import { COMB } from '../config.js';
import { CELL_BY_ID, CELL_TYPES, COMB_TUNING } from '../config.comb.js';
import { hexCellGeometry } from './comb.js';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export const BUILD_KEYS = {
  toggle: 'Tab',
  toggleAlt: 'KeyB',
  close: 'Escape',
  prev: 'KeyQ',
  next: 'KeyE',
  demolish: 'KeyX',
};

// Tab is the browser's focus key, so it is only swallowed when it is genuinely the build key:
// never while a text field has the caret (the lobby's hive-code box keeps normal tabbing), and
// never when build mode could not open anyway (menus, the meadow) — there Tab stays Tab.
function isTextEntry(node) {
  if (!node || node === document.body) return false;
  if (node.isContentEditable) return true;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function createBuildMode(options) {
  const opts = options || {};
  const comb = opts.comb;
  if (!comb) throw new Error('createBuildMode needs a comb');
  const grid = comb.grid;
  const camera = opts.camera || null;
  const scene = opts.scene || (opts.interior && opts.interior.group) || null;
  const panel = opts.panel || null;
  const audio = opts.audio || null;
  const reach = Number(opts.reach) || 26;

  const state = {
    open: false,
    typeId: comb.unlockedTypes()[0] || CELL_TYPES[0].id,
    target: null,       // { col, row, layer }
    hover: null,        // existing cell under the cursor, for demolition
    valid: false,
    reason: '',
    cost: null,
    affordable: false,
    bonus: null,
    busy: false,
    lastResult: null,
    message: '',
    messageAt: 0,
  };

  // ------------------------------------------------------------------ ghost visual

  let ghost = null;
  let ghostEdges = null;
  if (scene) {
    const geometry = hexCellGeometry(grid.cellSize(), COMB.cellDepth * COMB_TUNING.depthFill);
    ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: COMB_TUNING.colors.ghostValid,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }));
    ghost.name = 'comb_ghost';
    ghost.renderOrder = 3;
    ghost.visible = false;
    ghostEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: COMB_TUNING.colors.ghostValid, transparent: true, opacity: 0.85 })
    );
    ghost.add(ghostEdges);
    scene.add(ghost);
  }

  function setGhostColor(hex) {
    if (!ghost) return;
    ghost.material.color.setHex(hex);
    if (ghostEdges) ghostEdges.material.color.setHex(hex);
  }

  // ------------------------------------------------------------------ aiming

  const hits = [];

  function gatherHits(origin, dir) {
    hits.length = 0;
    const yMin = grid.rowBase - grid.dv;
    const yMax = grid.rowBase + (grid.rows + 1) * grid.dv;
    for (let layer = 0; layer < grid.layers; layer++) {
      const inset = COMB.wallOffset + layer * COMB.cellDepth;
      for (let i = 0; i < grid.walls.length; i++) {
        const w = grid.walls[i];
        const denom = dir.x * w.nx + dir.z * w.nz;
        if (Math.abs(denom) < 1e-6) continue;
        const px = w.ox + w.nx * inset;
        const pz = w.oz + w.nz * inset;
        const t = ((px - origin.x) * w.nx + (pz - origin.z) * w.nz) / denom;
        if (t <= 0.2 || t > reach) continue;
        _hit.copy(dir).multiplyScalar(t).add(origin);
        if (_hit.y < yMin || _hit.y > yMax) continue;
        const rel = (_hit.x - w.ox) * w.tx + (_hit.z - w.oz) * w.tz;
        if (rel < 0 || rel > w.length) continue;
        hits.push({ t, x: _hit.x, y: _hit.y, z: _hit.z, layer });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  const _probe = new THREE.Vector3();

  function aim(origin, dir) {
    const list = gatherHits(origin, dir);
    let fallback = null;
    let hover = null;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      _probe.set(h.x, h.y, h.z);
      const c = grid.worldToCell(_probe);
      if (!c) continue;
      const occupied = grid.has(c.col, c.row, c.layer);
      if (occupied && !hover) hover = comb.cellAt(c.col, c.row, c.layer);
      if (occupied) {
        // Aiming at a finished cell builds on its inner face, one layer further in.
        if (c.layer + 1 < grid.layers) return { target: { col: c.col, row: c.row, layer: c.layer + 1 }, hover };
        if (!fallback) fallback = { col: c.col, row: c.row, layer: c.layer };
        continue;
      }
      // Bare lattice: only the wall itself, or a spot backed by an existing cell.
      if (c.layer === 0) return { target: c, hover };
      if (grid.has(c.col, c.row, c.layer - 1)) {
        // The cell you can actually see through this empty slot is the one behind it,
        // so that is what right-click tears down.
        if (!hover) hover = comb.cellAt(c.col, c.row, c.layer - 1);
        return { target: c, hover };
      }
      if (!fallback) fallback = c;
    }
    return { target: fallback, hover };
  }

  function rayFromCamera() {
    if (!camera) return false;
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_dir);
    return true;
  }

  // ------------------------------------------------------------------ frame

  function refresh() {
    if (!state.open || !rayFromCamera()) return;
    const found = aim(_origin, _dir);
    state.target = found.target;
    state.hover = found.hover;

    if (!state.target) {
      state.valid = false;
      state.reason = 'aim';
      state.cost = comb.costOf(state.typeId);
      state.affordable = false;
      state.bonus = null;
      if (ghost) ghost.visible = false;
      if (panel) panel.update(state, comb);
      return;
    }

    const c = state.target;
    const check = comb.canPlace(c.col, c.row, c.layer, state.typeId);
    state.valid = check.ok;
    state.reason = check.reason;
    state.cost = check.cost;
    state.affordable = check.affordable;
    state.bonus = comb.previewBonus(c.col, c.row, c.layer, state.typeId);

    if (ghost) {
      grid.cellCenter(c.col, c.row, c.layer, _pos);
      grid.cellBasis(c.col, c.row, _quat);
      ghost.position.copy(_pos);
      ghost.quaternion.copy(_quat);
      ghost.visible = true;
      setGhostColor(state.valid ? COMB_TUNING.colors.ghostValid : COMB_TUNING.colors.ghostInvalid);
    }
    if (panel) panel.update(state, comb);
  }

  let pulse = 0;

  function update(dt) {
    if (!state.open) return;
    pulse += dt || 0;
    refresh();
    if (ghost && ghost.visible) {
      const k = 0.28 + 0.1 * Math.sin(pulse * 4.2);
      ghost.material.opacity = state.valid ? k + 0.08 : k;
    }
    if (state.message && (Date.now() - state.messageAt) > 2200) {
      state.message = '';
      if (panel) panel.update(state, comb);
    }
  }

  // ------------------------------------------------------------------ actions

  function say(text) {
    state.message = text;
    state.messageAt = Date.now();
    if (panel) panel.update(state, comb);
  }

  const DENIED = {
    occupied: 'a cell already sits there',
    detached: 'must touch the comb',
    blocked: 'the entrance must stay clear',
    locked: 'build a wax workshop first',
    limit: 'you already have a chamber',
    cost: 'not enough in the stores',
    taken: 'another queen claimed it',
    full: 'the hollow is full',
    aim: 'look at the comb',
    split: 'that would cut the comb in two',
    empty: 'nothing to tear down',
  };

  async function commit() {
    if (!state.open || state.busy || !state.target) return null;
    const c = state.target;
    state.busy = true;
    let result = null;
    try {
      result = await comb.place(c.col, c.row, c.layer, state.typeId);
    } finally {
      state.busy = false;
    }
    state.lastResult = result;
    if (result && result.ok) {
      if (audio && typeof audio.play === 'function') audio.play('click');
      say('');
    } else {
      if (audio && typeof audio.play === 'function') audio.play('denied');
      say(DENIED[result && result.reason] || 'cannot build there');
    }
    refresh();
    return result;
  }

  async function tearDown() {
    if (!state.open || state.busy) return null;
    const cell = state.hover;
    if (!cell) { say(DENIED.empty); return null; }
    state.busy = true;
    let result = null;
    try {
      result = await comb.demolish(cell.col, cell.row, cell.layer);
    } finally {
      state.busy = false;
    }
    if (result && result.ok) {
      const back = result.refund || {};
      say(`+${(back.resin || 0).toFixed(1)} resin`);
    } else {
      if (audio && typeof audio.play === 'function') audio.play('denied');
      say(DENIED[result && result.reason] || 'cannot tear that down');
    }
    refresh();
    return result;
  }

  function cycle(step) {
    const list = comb.unlockedTypes();
    if (!list.length) return;
    let i = list.indexOf(state.typeId);
    if (i < 0) i = 0;
    else i = (i + step + list.length) % list.length;
    state.typeId = list[i];
    if (audio && typeof audio.play === 'function') audio.play('tick');
    refresh();
  }

  function selectType(id) {
    if (!CELL_BY_ID.has(id) || !comb.typeUnlocked(id)) return false;
    state.typeId = id;
    refresh();
    return true;
  }

  function open() {
    if (state.open) return;
    // Build mode belongs inside the hollow and in play, not on the meadow or in a menu.
    if (typeof opts.canOpen === 'function' && !opts.canOpen()) return;
    state.open = true;
    if (!comb.typeUnlocked(state.typeId)) state.typeId = comb.unlockedTypes()[0] || state.typeId;
    if (panel) panel.show();
    if (audio && typeof audio.play === 'function') audio.play('open');
    refresh();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    state.target = null;
    state.hover = null;
    if (ghost) ghost.visible = false;
    if (panel) panel.hide();
    if (audio && typeof audio.play === 'function') audio.play('close');
  }

  function toggle() { if (state.open) close(); else open(); }

  // ------------------------------------------------------------------ input

  function canOpenNow() {
    return typeof opts.canOpen !== 'function' || Boolean(opts.canOpen());
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    if (event.code === BUILD_KEYS.toggle || event.code === BUILD_KEYS.toggleAlt) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextEntry(event.target) || isTextEntry(document.activeElement)) return;
      if (!state.open && !canOpenNow()) {
        // Silence here reads as a dead key. The gate is correct — build mode belongs
        // inside the hollow — but the player pressing the build key on the meadow got no
        // answer at all, which is indistinguishable from the binding being broken.
        // Tab is still not swallowed: refusing to build must not also break tabbing.
        if (typeof opts.onRefused === 'function') opts.onRefused();
        return;
      }
      event.preventDefault();
      toggle();
      return;
    }
    if (!state.open) return;
    if (event.code === BUILD_KEYS.close) { event.preventDefault(); close(); return; }
    if (event.code === BUILD_KEYS.prev) { event.preventDefault(); cycle(-1); return; }
    if (event.code === BUILD_KEYS.next) { event.preventDefault(); cycle(1); return; }
    if (event.code === BUILD_KEYS.demolish) { event.preventDefault(); tearDown(); }
  }

  function onMouseDown(event) {
    if (!state.open) return;
    if (event.button === 0) { event.preventDefault(); commit(); }
    else if (event.button === 2) { event.preventDefault(); tearDown(); }
  }

  const target = opts.domElement || (typeof document !== 'undefined' ? document : null);
  if (target && opts.listen !== false) {
    window.addEventListener('keydown', onKeyDown);
    target.addEventListener('mousedown', onMouseDown);
  }

  return {
    state,
    ghost,
    update,
    open,
    close,
    toggle,
    cycle,
    selectType,
    commit,
    tearDown,
    aim,
    refresh,
    get isOpen() { return state.open; },
    dispose() {
      close();
      if (target && opts.listen !== false) {
        window.removeEventListener('keydown', onKeyDown);
        target.removeEventListener('mousedown', onMouseDown);
      }
      if (ghost) {
        if (ghost.parent) ghost.parent.remove(ghost);
        ghost.geometry.dispose();
        ghost.material.dispose();
        if (ghostEdges) { ghostEdges.geometry.dispose(); ghostEdges.material.dispose(); }
      }
    },
  };
}
