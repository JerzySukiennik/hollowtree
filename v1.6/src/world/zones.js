// Hollowtree — four concentric zones gated on the state of the comb, with a fog wall and a wind barrier that turns the queen around instead of stopping her.

import * as THREE from 'three';
import { ZONES } from '../config.js';
import { zoneNeedHtml } from '../ui/resource-sources.js';

const BANDS = ZONES.bands;
const B = ZONES.barrier;
const CX = ZONES.center.x;
const CZ = ZONES.center.z;
// Eye height for a queen on the wing, a little above the meadow so the sign clears the grass.
const SIGN_HEIGHT = 18;

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
    text: zoneNeedHtml(band, missing),
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
  // The barrier used to be a flat translucent cylinder and it read as a pane of glass with a
  // hard vertical seam wherever the curve turned away from the camera — so its rendering was
  // switched off entirely and the player was left being shoved by something invisible. The
  // master prompt is explicit that a locked border is fog, never a wall, so this is fog: it
  // dies at the top and bottom, dies again wherever you see it edge-on (which is what kills
  // the seam), and only exists at all when you are close enough to be turned back by it.
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(B.fogColor) },
      uOpacity: { value: B.fogOpacity },
      uTime: { value: 0 },
      uNear: { value: 0 },      // how close the queen is, 0 = far away, 1 = at the line
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uNear;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        // Vertical: nothing at the ground, nothing at the top, a soft band between.
        float band = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));

        // Edge-on: the seam was the cylinder's silhouette. Fade it out exactly there.
        vec3 view = normalize(cameraPosition - vWorld);
        float facing = abs(dot(view, vNormalW));
        float rim = smoothstep(0.05, 0.55, facing);

        // Drifting cloud, two octaves, so it never reads as a flat sheet.
        float n = noise(vec2(vUv.x * 26.0 + uTime * 0.6, vUv.y * 3.0 - uTime * 0.15)) * 0.65
                + noise(vec2(vUv.x * 61.0 - uTime * 0.35, vUv.y * 6.0 + uTime * 0.08)) * 0.35;

        float a = band * rim * (0.35 + n * 0.65) * uOpacity * uNear;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'zone-fog';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.position.set(CX, B.fogHeight * 0.5 - B.fogDrop, CZ);
  if (scene) scene.add(mesh);

  // The name of the ring you are being turned back from, floating on the fog itself. The DOM
  // line at the bottom of the screen says what you still need; this says WHERE you are, which
  // is the part you want while flying rather than while reading.
  let signLabel = '';
  const signCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let sign = null;
  if (signCanvas && scene) {
    signCanvas.width = 1024;
    signCanvas.height = 192;
    const tex = new THREE.CanvasTexture(signCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    // A plane, not a sprite: a sprite swivels to face the camera, and Jurek asked for a sign
    // that simply stands there. It is pinned to one point on the ring — straight out from the
    // hollow's mouth — and turned to face the tree, so it reads head-on to a queen flying out
    // and is a landmark rather than a HUD element.
    sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, side: THREE.FrontSide, fog: false,
      })
    );
    sign.name = 'zone-sign';
    sign.renderOrder = 4;
    sign.scale.set(52, 9.8, 1);
    sign.visible = false;
    scene.add(sign);
  }

  function drawSign(text) {
    if (!sign || text === signLabel) return;
    signLabel = text;
    const ctx = signCanvas.getContext('2d');
    ctx.clearRect(0, 0, signCanvas.width, signCanvas.height);
    ctx.font = '600 76px ui-rounded, -apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '14px';
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#f7ead2';
    ctx.fillText(text.toUpperCase(), signCanvas.width / 2, signCanvas.height / 2);
    sign.material.map.needsUpdate = true;
  }

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
    // It is fog now, so it ships. The last ring has nothing beyond it to fence off.
    mesh.visible = open < BANDS.length;
    if (sign) {
      if (open < BANDS.length) {
        drawSign(BANDS[open].label);
        // Straight out from the hollow's mouth. The aperture normal is +Z for the shipped
        // layout, so the sign sits at (centre + limit) along +Z and faces back at the tree.
        sign.position.set(CX, SIGN_HEIGHT, CZ + limit);
        // lookAt the hive rather than a hand-picked rotation: a guessed Y rotation showed the
        // plane's back face, which renders the text mirrored. Aiming it at the tree is
        // unambiguous and stays correct if the entrance ever moves.
        sign.lookAt(CX, SIGN_HEIGHT, CZ);
        sign.visible = true;
      } else {
        sign.visible = false;
      }
    }
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
    // Markup, not text: the line carries flower glyphs now. `lockedText` is built by
    // zoneNeedHtml() from game data only — no player input ever reaches it.
    if (messageEl.innerHTML !== lockedText) messageEl.innerHTML = lockedText;
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
  // The barrier is a cylinder centred on the hive, and the hollow is INSIDE that cylinder's
  // footprint — but the hall runs 59.4 m back from the trunk while the first ring stops at 46.
  // So on a new hive the wind wall cut straight through the interior and clamped the queen
  // 8.5 m short of the very wall the game tells her to build on, with the "this ring is locked"
  // line pinned to the screen the whole time she stood at her own comb. The rings gate the
  // MEADOW; inside the tree they mean nothing.
  function update(dt, flight, insideness) {
    if (comb && comb.effects && comb.effects !== effects) setEffects(comb.effects);
    // Drive the fog. `uNear` is the whole reason it does not loom across the meadow: the fog
    // only exists within reach of the line that turns you back, and fades out entirely once
    // you are well inside your own ring.
    material.uniforms.uTime.value += dt;
    if (flight && flight.position) {
      const px = flight.position.x - CX;
      const pz = flight.position.z - CZ;
      const d = Math.sqrt(px * px + pz * pz);
      const fadeFrom = Math.max(1, B.thickness * 2.6);
      const near = 1 - Math.min(1, Math.max(0, (limit - d) / fadeFrom));
      material.uniforms.uNear.value += (near - material.uniforms.uNear.value) * Math.min(1, dt * 4);
    }
    if (insideness > 0.001) {
      state.blocked = false;
      state.turned = false;
      state.depth = 0;
      state.message = '';
      fadeMessage(dt);
      return state;
    }
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
