// Hollowtree — queen visual: glb body, wingbeat smear and pose driven by the flight state,
// plus the player's chosen livery (colour + pattern) from the Your Queen screen.
//
// The livery is applied to *cloned* materials. `model.clone(true)` shares material instances
// with the loaded asset, so tinting the clone in place would repaint every other queen in the
// hollow — the local player, the remote peers and the cinematic bee all come from one glb.

import { Group, Mesh, MeshBasicMaterial, DoubleSide, MathUtils, Color } from 'three';
import { QUEEN, QUEEN_STYLE, SETTINGS } from '../config.js';

// Material names authored in queen.glb. Anything not listed here (eyes, wings) stays as-authored.
const STYLED_MATERIALS = new Set([
  'queen_amber',    // main body plates — the colour you actually read at distance
  'queen_fuzz',     // thorax fur
  'queen_dark',     // abdomen bands
  'queen_chitin',   // legs / underplate
  'queen_crownrim', // crown rim
  'queen_gold',     // crown highlight
]);

function colorById(id) {
  return QUEEN_STYLE.colors.find((c) => c.id === id) || QUEEN_STYLE.colors[0];
}

function patternById(id) {
  return QUEEN_STYLE.patterns.find((p) => p.id === id) || QUEEN_STYLE.patterns[0];
}

// The one place the player's saved livery is read. Same key and shape the menu writes.
export function readStoredStyle() {
  let stored = {};
  try {
    const raw = localStorage.getItem(SETTINGS.storageKey);
    if (raw) stored = JSON.parse(raw) || {};
  } catch (error) {
    stored = {};
  }
  return {
    color: stored.color || QUEEN_STYLE.defaultColor,
    pattern: stored.pattern || QUEEN_STYLE.defaultPattern,
  };
}

// Six swatches x four patterns from two authored hexes. Absolute values, never accumulated,
// so re-applying a livery mid-session lands on exactly the same look as booting into it.
function livery(color, patternId) {
  const base = new Color(color.hex);
  const trim = new Color(color.trim);
  const white = new Color('#ffffff');

  const colors = {
    queen_amber: base.clone(),
    queen_fuzz: base.clone().lerp(white, 0.34),
    queen_dark: trim.clone().multiplyScalar(0.42),
    queen_chitin: trim.clone().lerp(base, 0.35),
    queen_crownrim: base.clone().lerp(trim, 0.45),
    queen_gold: base.clone().lerp(new Color('#ffe65b'), 0.5),
  };
  const emissive = {};

  if (patternId === 'dusted') {
    colors.queen_fuzz = base.clone().lerp(new Color('#fff3cf'), 0.68);
    colors.queen_chitin = base.clone().lerp(white, 0.28);
    colors.queen_dark = trim.clone().lerp(base, 0.3);
    emissive.queen_fuzz = { color: new Color('#fff0c0'), intensity: 0.22 };
  } else if (patternId === 'sable') {
    colors.queen_amber = base.clone().multiplyScalar(0.46);
    colors.queen_fuzz = base.clone().multiplyScalar(0.6);
    colors.queen_dark = trim.clone().multiplyScalar(0.2);
    colors.queen_chitin = trim.clone().multiplyScalar(0.38);
    colors.queen_crownrim = trim.clone().multiplyScalar(0.62);
    colors.queen_gold = base.clone().lerp(trim, 0.6);
  } else if (patternId === 'crowned') {
    colors.queen_gold = new Color('#ffe89a');
    colors.queen_crownrim = new Color('#ffcf5e');
    colors.queen_amber = base.clone().lerp(white, 0.12);
    emissive.queen_gold = { color: new Color('#ffcf5e'), intensity: 0.6 };
    emissive.queen_crownrim = { color: new Color('#ffb844'), intensity: 0.35 };
  }

  return { colors, emissive };
}

// main.js calls createQueen(scene, assets) for the local player first and again for every peer
// that joins, so the first instance of the page is the one wearing the saved livery. Callers
// can be explicit instead: { style: { color, pattern } } or { style: 'stored' } / { style: null }.
let localClaimed = false;

function collectWings(model) {
  const wings = [];
  model.traverse((child) => {
    if (child.isMesh && /wing/i.test(child.name)) wings.push(child);
  });
  return wings;
}

function buildSmear(wing, parent) {
  const hinge = new Group();
  hinge.position.copy(wing.position);
  hinge.quaternion.copy(wing.quaternion);
  parent.add(hinge);

  const side = wing.position.x >= 0 ? 1 : -1;
  const ghosts = [];
  for (let i = 0; i < QUEEN.smearGhosts; i++) {
    const ghost = new Mesh(
      wing.geometry,
      new MeshBasicMaterial({
        color: QUEEN.wingColor,
        transparent: true,
        opacity: QUEEN.smearOpacity * (1 - i / QUEEN.smearGhosts) ** 1.4,
        depthWrite: false,
        side: DoubleSide,
      })
    );
    ghost.position.set(0, 0, 0);
    ghost.scale.copy(wing.scale);
    ghost.renderOrder = 2;
    hinge.add(ghost);
    ghosts.push(ghost);
  }

  wing.visible = false;
  return { hinge, ghosts, side };
}

export function createQueen(scene, assets, options) {
  const opts = options || {};
  const root = new Group();
  const yawFix = new Group();
  yawFix.rotation.y = Math.PI;
  root.add(yawFix);
  scene.add(root);

  const source = assets && typeof assets.get === 'function' ? assets.get('queen') : null;
  const model = source && source.isObject3D ? source.clone(true) : null;

  let smears = [];
  if (model) {
    model.scale.setScalar(QUEEN.scale);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = false;
      child.frustumCulled = false;
      if (child.material) child.material.side = DoubleSide;
    });
    yawFix.add(model);
    smears = collectWings(model).map((wing) => buildSmear(wing, wing.parent));
  }

  // ---------------------------------------------------------------- livery

  // name -> material, populated the first time this instance is styled. Cloning here is what
  // keeps one queen's colour off every other queen: the asset's own materials are never touched.
  let ownMaterials = null;

  function ensureOwnMaterials() {
    if (ownMaterials || !model) return ownMaterials;
    ownMaterials = new Map();
    model.traverse((child) => {
      if (!child.isMesh || !child.material || Array.isArray(child.material)) return;
      const name = child.material.name;
      if (!STYLED_MATERIALS.has(name)) return;
      const mine = child.material.clone();
      mine.name = name;
      child.material = mine;
      ownMaterials.set(name, mine);
    });
    return ownMaterials;
  }

  let style = null;

  function setStyle(next) {
    if (!model || !next) return false;
    const color = colorById(next.color);
    const pattern = patternById(next.pattern);
    style = { color: color.id, pattern: pattern.id };
    const mats = ensureOwnMaterials();
    if (!mats || !mats.size) return false;
    const { colors, emissive } = livery(color, pattern.id);
    for (const [name, material] of mats) {
      if (colors[name]) material.color.copy(colors[name]);
      if (!material.emissive) continue;
      const glow = emissive[name];
      if (glow) {
        material.emissive.copy(glow.color);
        material.emissiveIntensity = glow.intensity;
      } else {
        material.emissive.setRGB(0, 0, 0);
        material.emissiveIntensity = 1;
      }
    }
    return true;
  }

  // Which livery this instance wears. Explicit wins; otherwise the first queen of the page is
  // the player's own and everyone after it keeps the authored look until told otherwise.
  let isLocal = false;
  if (opts.style && typeof opts.style === 'object') {
    setStyle(opts.style);
  } else if (opts.style === 'stored' || (opts.style === undefined && !localClaimed)) {
    localClaimed = true;
    isLocal = true;
    setStyle(readStoredStyle());
  }

  // The menu writes the livery and shouts; the queen already in the scene repaints live, so the
  // choice is visible the moment it is made and again after the menu -> play handoff.
  function onProfileChange(event) {
    const detail = (event && event.detail) || null;
    setStyle(detail && (detail.color || detail.pattern) ? detail : readStoredStyle());
  }
  if (isLocal && typeof window !== 'undefined') {
    window.addEventListener('hollowtree:profile', onProfileChange);
  }

  let beat = 0;
  let blur = 0;

  function update(dt, flight) {
    if (!(dt > 0)) dt = 1 / 60;
    if (!flight) return;

    root.position.copy(flight.position);
    root.quaternion.copy(flight.quaternion);

    if (!smears.length) return;

    const effort = MathUtils.clamp(
      QUEEN.beatIdle +
        (typeof flight.speedRatio === 'number' ? flight.speedRatio : 0) * QUEEN.beatSpeedGain +
        (typeof flight.boostAmount === 'number' ? flight.boostAmount : 0) * QUEEN.beatBoostGain,
      0,
      1
    );

    beat += dt * Math.PI * 2 * (QUEEN.beatHz * (0.75 + effort * 0.5));
    if (beat > Math.PI * 2) beat -= Math.PI * 2;
    blur += (effort - blur) * Math.min(1, dt * QUEEN.blurResponse);

    const sweep = QUEEN.sweepMin + (QUEEN.sweepMax - QUEEN.sweepMin) * blur;

    for (let i = 0; i < smears.length; i++) {
      const smear = smears[i];
      for (let g = 0; g < smear.ghosts.length; g++) {
        const lag = (g / smear.ghosts.length) * QUEEN.smearLag;
        const angle = Math.sin(beat - lag) * sweep;
        smear.ghosts[g].rotation.z = smear.side * angle;
        smear.ghosts[g].rotation.x = Math.cos(beat - lag) * sweep * QUEEN.sweepTwist;
        smear.ghosts[g].material.opacity =
          QUEEN.smearOpacity * (1 - g / smear.ghosts.length) ** 1.4 * (0.45 + blur * 0.55);
      }
    }
  }

  function dispose() {
    if (isLocal && typeof window !== 'undefined') {
      window.removeEventListener('hollowtree:profile', onProfileChange);
    }
  }

  return {
    object3D: root,
    model,
    update,
    setStyle,
    dispose,
    get style() { return style ? { ...style } : null; },
    get isLocal() { return isLocal; },
  };
}
