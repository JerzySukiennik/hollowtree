// Hollowtree — four concentric zones gated on the state of the comb, with a fog wall and a wind barrier that turns the queen around instead of stopping her.

import * as THREE from 'three';
import { ZONES } from '../config.js';

const BANDS = ZONES.bands;
const B = ZONES.barrier;
const CX = ZONES.center.x;
const CZ = ZONES.center.z;

export function distanceFromCenter(x, z) {
  const dx = x - CX;
  const dz = z - CZ;
  return Math.sqrt(dx * dx + dz * dz);
}

export function zoneIndexAt(x, z) {
  const d = distanceFromCenter(x, z);
  for (let i = BANDS.length - 1; i >= 0; i--) {
    if (d >= BANDS[i].inner) return i;
  }
  return 0;
}

// What the band still needs, phrased as the hive's shortfall rather than as a rule.
export function zoneRequirement(index, effects) {
  const band = BANDS[index];
  if (!band) return { unlocked: false, missing: [], text: '' };
  if (!band.unlock) return { unlocked: true, missing: [], text: '' };
  const have = effects && Number.isFinite(effects.doneCount) ? effects.doneCount : 0;
  const counts = effects && effects.counts ? effects.counts : null;
  const missing = [];
  const needCells = band.unlock.cells || 0;
  if (have < needCells) missing.push(`${needCells - have} more comb cells`);
  const types = band.unlock.types || {};
  for (const id of Object.keys(types)) {
    const want = types[id];
    const got = counts && Number.isFinite(counts[id]) ? counts[id] : 0;
    if (got < want) missing.push(want - got === 1 ? `a ${id} cell` : `${want - got} ${id} cells`);
  }
  return {
    unlocked: missing.length === 0,
    missing,
    text: missing.length ? `${band.label} needs ${missing.join(', ')}` : '',
  };
}

export function unlockedCount(effects) {
  let n = 1;
  for (let i = 1; i < BANDS.length; i++) {
    if (!zoneRequirement(i, effects).unlocked) break;
    n++;
  }
  return n;
}

function fogTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.34, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.94)');
  grad.addColorStop(1, 'rgba(255,255,255,0.2)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

function makeMessageElement() {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.id = 'zone-barrier';
  el.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:17%', 'transform:translateX(-50%)',
    'font:500 12px/1.5 ui-rounded,-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif',
    'letter-spacing:.14em', 'text-transform:uppercase',
    'color:#f7ead2', 'text-shadow:0 1px 4px rgba(0,0,0,.7)',
    'pointer-events:none', 'opacity:0', 'transition:opacity .32s ease',
    'z-index:6', 'white-space:nowrap',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

export function createZones(scene, options) {
  const opts = options || {};
  const baseRadius = 100;
  const geometry = new THREE.CylinderGeometry(baseRadius, baseRadius, B.fogHeight, B.segments, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color: B.fogColor,
    transparent: true,
    opacity: B.fogOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    alphaMap: fogTexture(),
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'zone-fog';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.position.set(CX, B.fogHeight * 0.5 - B.fogDrop, CZ);
  if (scene) scene.add(mesh);

  const messageEl = opts.messageElement !== undefined ? opts.messageElement : makeMessageElement();

  let comb = null;
  let effects = null;
  let open = 1;
  let limit = BANDS.length > 1 ? BANDS[1].inner : BANDS[0].outer;
  let lockedText = '';
  let messageTimer = 0;
  let messageShown = false;
  let unsubscribe = null;

  const state = {
    open: 1,
    limit,
    zone: 0,
    depth: 0,
    blocked: false,
    turned: false,
    message: '',
    turns: 0,
  };

  function recompute() {
    open = unlockedCount(effects);
    state.open = open;
    if (open >= BANDS.length) {
      limit = BANDS[BANDS.length - 1].outer + B.thickness * 4;
      lockedText = '';
    } else {
      limit = BANDS[open].inner;
      lockedText = zoneRequirement(open, effects).text;
    }
    state.limit = limit;
    const scale = limit / baseRadius;
    mesh.scale.set(scale, 1, scale);
    // The barrier's LOGIC ships; its rendering does not. As a translucent double-sided
    // cylinder it read as a hard wall with a visible vertical seam across the screen —
    // the master prompt is explicit that a locked border is fog, never a wall. Until it
    // is rebuilt as a soft radial fog, the queen is still turned back with a message,
    // she just is not shown a slab. Flip this to `open < BANDS.length` once it is fog.
    mesh.visible = false;
  }

  function setEffects(next) {
    effects = next || null;
    recompute();
  }

  function attachComb(handle) {
    if (unsubscribe) { try { unsubscribe(); } catch (error) { /* already gone */ } }
    unsubscribe = null;
    comb = handle || null;
    if (!comb) { setEffects(null); return false; }
    setEffects(comb.effects);
    if (typeof comb.onChange === 'function') unsubscribe = comb.onChange((next) => setEffects(next)) || null;
    return true;
  }

  function showMessage() {
    if (!messageEl || !lockedText) return;
    if (messageEl.textContent !== lockedText) messageEl.textContent = lockedText;
    messageEl.style.opacity = '1';
    messageShown = true;
    messageTimer = B.messageHold;
  }

  function fadeMessage(dt) {
    if (!messageShown) return;
    messageTimer -= dt;
    if (messageTimer > 0) return;
    if (messageEl) messageEl.style.opacity = '0';
    messageShown = false;
  }

  // The barrier is wind, not a wall. Past turnStart the queen feels a gust that grows with
  // the square of how far she has leaned into it; at the line her outward speed is reflected
  // so she comes about under her own momentum. Clamping the position is the last resort, so
  // a full-speed dive cannot slip through between two frames.
  function update(dt, flight) {
    if (comb && comb.effects && comb.effects !== effects) setEffects(comb.effects);
    if (material.alphaMap) material.alphaMap.offset.x = (material.alphaMap.offset.x + dt * B.fogScroll) % 1;
    if (!flight || !flight.position) { fadeMessage(dt); return state; }
    const p = flight.position;
    const dx = p.x - CX;
    const dz = p.z - CZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    state.zone = zoneIndexAt(p.x, p.z);
    state.turned = false;

    if (open >= BANDS.length || dist <= limit - B.thickness) {
      state.blocked = false;
      state.depth = 0;
      state.message = '';
      fadeMessage(dt);
      return state;
    }

    const nx = dist > 1e-4 ? dx / dist : 1;
    const nz = dist > 1e-4 ? dz / dist : 0;
    const depth = Math.min(1, (dist - (limit - B.thickness)) / B.thickness);
    state.depth = depth;
    const v = flight.velocity;
    if (v && depth > B.turnStart) {
      const lean = (depth - B.turnStart) / (1 - B.turnStart);
      v.x -= nx * B.push * lean * lean * dt;
      v.z -= nz * B.push * lean * lean * dt;
      const radial = v.x * nx + v.z * nz;
      if (dist >= limit - B.hardMargin && radial > 0) {
        v.x -= nx * radial * (1 + B.bounce);
        v.z -= nz * radial * (1 + B.bounce);
        state.turned = true;
        state.turns++;
      }
    }
    if (dist > limit) {
      p.x = CX + nx * limit;
      p.z = CZ + nz * limit;
    }
    state.blocked = depth > 0;
    state.message = lockedText;
    if (depth > B.messageAt) showMessage();
    else fadeMessage(dt);
    return state;
  }

  recompute();

  return {
    mesh,
    bands: BANDS,
    state,
    attachComb,
    setEffects,
    update,
    zoneIndexAt,
    distanceFromCenter,
    get openCount() { return open; },
    get limit() { return limit; },
    requirement: (i) => zoneRequirement(i, effects),
    requirementText: (i) => zoneRequirement(i, effects).text,
    isOpen: (i) => i < open,
    dispose() {
      if (unsubscribe) { try { unsubscribe(); } catch (error) { /* already gone */ } }
      if (scene) scene.remove(mesh);
      geometry.dispose();
      if (material.alphaMap) material.alphaMap.dispose();
      material.dispose();
      if (messageEl && messageEl.parentNode) messageEl.parentNode.removeChild(messageEl);
    },
  };
}
