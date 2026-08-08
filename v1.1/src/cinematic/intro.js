// Hollowtree — the opening cinematic: a queen hatches in the hollow, climbs to the light and takes
// her first flight into the meadow. Seven authored shots, ~24 s, a pure function of elapsed time
// from one shared start timestamp so every client in a session sees the identical cut.
//
// Every camera number below is expressed in a frame built from measured, live geometry — never from
// guessed constants — because the authored hollow-tree.glb replaced the old procedural trunk and the
// previous path was cut against geometry that no longer exists. The frame is:
//
//   W       spec.entrancePos      the aperture on the INNER wall of the hall
//   O       hive.entrance         the aperture mouth on the OUTER bark surface
//   n       spec.entranceNormal   outward, flattened (0,0,1) for the shipped layout
//   inward  -n                    into the hall
//   tan     (n.z, 0, -n.x)        lateral, (1,0,0) for the shipped layout
//   up      (0,1,0)
//
// Measured 2026-08-08 against the live build at localhost:8124 (window.hollowtree):
//   hive group          (0, 0.00, -30)          terrain is flat (y≈0) for 60 m around the trunk
//   W                   (0, 16.00, -25.403)     O = (0, 16.00, -22.203)
//   trunk bark radius   6.5 m at the aperture, 10.7–11.8 m at y 8–14, branches reach r≈24 m at y 34–42
//   trunk bbox          x[-21.0, 22.4]  y[0, 66.1]  z[-50.4, -11.1]
//   canopy leaf bbox    x[-28.8, 31.5]  y[37.1, 74.0]  z[-57.0, -9.6]
//   hall (spec)         x[-48, 48]  y[3.20, 66.84]  z[-89.40, -25.40]
//   landing shelf       y 12.44–13.44, x ±13.5, z[-36.40, -25.40]   (camera must pass under or behind)
//   gallery ledges      protrude 5.2 m from each wall, lowest tier y 13.3–14.0
//   pillars             x ±22.08, z -44.60 / -70.20, half-extent 2.3, floor to ceiling
//
// Interior shots run with the trunk hidden (applyEnv), so the only solids that matter inside are the
// hall shell, the landing shelf, the ledges and the pillars. Exterior shots run with the trunk
// visible, so they are kept far outside the bark and below the leaf mass.

import * as THREE from 'three';
import { CINEMATIC, INTRO, HIVE, INTERIOR, PALETTE, SKY, WORLD } from '../config.js';
import { createDirector, shotPosition } from './director.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _fog = new THREE.Color();

// ---------------------------------------------------------------------------
// The sequence. Times are absolute seconds from the shared start timestamp.
// ---------------------------------------------------------------------------

const DURATION = 24.0;

const SHOTS = [
  // id        at     dur   ease        fov         handheld  shake
  { id: 'hatch', at: 0.0, dur: 4.0, ease: 'holdOut', fov: [40, 33], handheld: 0.30, shake: 0.0 },
  { id: 'emerge', at: 4.0, dur: 3.8, ease: 'out', fov: [45, 39], handheld: 0.50, shake: 0.10 },
  { id: 'reveal', at: 7.8, dur: 4.4, ease: 'settle', fov: [43, 66], handheld: 0.22, shake: 0.0 },
  { id: 'launch', at: 12.2, dur: 3.2, ease: 'in', fov: [58, 70], handheld: 0.45, shake: 0.22 },
  { id: 'burst', at: 15.4, dur: 2.8, ease: 'out', fov: [52, 47], handheld: 0.45, shake: 0.20 },
  { id: 'wide', at: 18.2, dur: 2.8, ease: 'settle', fov: [58, 52], handheld: 0.18, shake: 0.0 },
  { id: 'settle', at: 21.0, dur: 3.0, ease: 'settle', fov: [66, 62], handheld: 0.14, shake: 0.0 },
];

const T = {};
for (const s of SHOTS) T[s.id] = s;

const CARDS = [
  { at: 8.4, dur: 3.4, fade: 0.95, text: 'title', size: 1.0 },
  { at: 18.7, dur: 2.1, fade: 0.75, text: 'subtitle', size: 0.36 },
];

// One bloom on the cut from the hollow into daylight — it also masks the frame where the interior
// shell is swapped for the world.
const FLASHES = [{ at: 15.4, dur: 0.55, peak: 0.9, color: '#fff4dd' }];

// Staging constants, all in metres in the frame described at the top of the file.
const STAGE = {
  cellLateral: -14.0, // tan offset of the natal cell from the aperture
  cellDrop: -7.0, // up offset  → world y = 16 - 7 = 9
  cellOffWall: 0.3, // how far the comb sits off the inner wall face
  perchOut: 2.6, // inward from the cell mouth to the perch lip
  perchDrop: -1.9,
  combCols: 15,
  combRows: 9,
  capBreakAt: 3.1,
  capFall: 1.6,
  capTrembleFrom: 1.0,
  emergeEnd: 6.0, // queen is fully out of the cell
  hoverDrift: 0.9,
  // queen exit arc, shared by burst/wide/settle
  restLateral: 3.0,
  restOut: 17.2,
  restDrop: -6.0,
};

function hash(i, salt) {
  let x = Math.imul((i | 0) ^ Math.imul(salt | 0, 0x9e3779b9), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function newBuf() {
  return { pos: [], nrm: [], col: [], idx: [] };
}

function appendGeo(buf, geo, matrix, color) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const base = buf.pos.length / 3;
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
    buf.pos.push(_v.x, _v.y, _v.z);
    if (n) {
      _v2.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      buf.nrm.push(_v2.x, _v2.y, _v2.z);
    } else buf.nrm.push(0, 1, 0);
    buf.col.push(color.r, color.g, color.b);
  }
  if (geo.index) {
    for (let i = 0; i < geo.index.count; i++) buf.idx.push(base + geo.index.getX(i));
  } else {
    for (let i = 0; i < p.count; i++) buf.idx.push(base + i);
  }
}

function finishGeo(buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  g.setIndex(buf.idx);
  g.computeBoundingSphere();
  return g;
}

function PLACEHOLDER_beeGeometry(length, body, dark, wing) {
  const buf = newBuf();
  const cBody = new THREE.Color(body);
  const cDark = new THREE.Color(dark);
  const cWing = new THREE.Color(wing);
  const sphere = new THREE.IcosahedronGeometry(0.5, 1);
  const plane = new THREE.PlaneGeometry(1, 1);

  const part = (sx, sy, sz, x, y, z, color) => {
    _m.makeScale(sx, sy, sz);
    _m.setPosition(x, y, z);
    appendGeo(buf, sphere, _m, color);
  };

  part(0.44, 0.42, 0.34, 0, 0, -0.36, cDark);
  part(0.52, 0.50, 0.46, 0, 0.02, -0.06, cBody);
  part(0.46, 0.44, 0.62, 0, 0.0, 0.34, cDark);
  part(0.40, 0.38, 0.30, 0, 0.0, 0.16, cBody);

  for (let side = -1; side <= 1; side += 2) {
    _q.setFromEuler(_e.set(-0.42, side * 0.5, side * 0.28, 'YXZ'));
    _m.compose(new THREE.Vector3(side * 0.24, 0.2, 0.06), _q, new THREE.Vector3(0.42, 1, 0.72));
    appendGeo(buf, plane, _m, cWing);
  }

  sphere.dispose();
  plane.dispose();
  const geo = finishGeo(buf);
  geo.scale(length, length, length);
  return geo;
}

function PLACEHOLDER_combGeometry() {
  const buf = newBuf();
  const r = INTRO.combCellRadius;
  const d = INTRO.combCellDepth;
  const tube = new THREE.CylinderGeometry(r, r * 0.94, d, 6, 1, true);
  tube.rotateX(Math.PI * 0.5);
  const cap = new THREE.CircleGeometry(r * 0.94, 6);

  _m.identity();
  appendGeo(buf, tube, _m, new THREE.Color(0xffffff));
  _m.makeTranslation(0, 0, -d * 0.5 + 0.02);
  appendGeo(buf, cap, _m, new THREE.Color(0x5a5a5a));

  const col = buf.col;
  const pos = buf.pos;
  for (let i = 0; i < pos.length / 3; i++) {
    const z = pos[i * 3 + 2];
    const k = 0.24 + 0.76 * smoothstep(-d * 0.5, d * 0.5, z);
    col[i * 3] *= k;
    col[i * 3 + 1] *= k;
    col[i * 3 + 2] *= k;
  }
  tube.dispose();
  cap.dispose();
  return finishGeo(buf);
}

let _moteTexture = null;
function moteSprite() {
  if (_moteTexture) return _moteTexture;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _moteTexture = new THREE.CanvasTexture(canvas);
  return _moteTexture;
}

function instanced(name, geometry, capacity) {
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, dithering: true }),
    capacity
  );
  mesh.name = name;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

// Only used when the nest module failed to load — the real numbers always come from interior.spec.
function fallbackSpec(hive, terrain) {
  const base = hive && hive.position ? hive.position.clone() : new THREE.Vector3(HIVE.x, 0, HIVE.z);
  if (terrain && terrain.getHeight) base.y = terrain.getHeight(base.x, base.z);
  const faceZ = HIVE.z <= 0 ? 1 : -1;
  const entrance = hive && hive.entrance
    ? hive.entrance.clone()
    : new THREE.Vector3(base.x, base.y + HIVE.entranceHeight, base.z + HIVE.trunkRadiusBase * faceZ);
  const floorY = base.y + INTERIOR.floorLift;
  const height = Math.max(INTERIOR.minHeight, HIVE.trunkHeight * INTERIOR.heightScale);
  return {
    floorY,
    ceilY: floorY + height,
    height,
    width: INTERIOR.hallWidth,
    depth: INTERIOR.hallDepth,
    centerX: base.x,
    centerZ: base.z - INTERIOR.hallDepth * 0.5 * faceZ,
    entranceY: entrance.y,
    entranceRadius: HIVE.entranceRadius,
    entrancePos: entrance,
    entranceNormal: new THREE.Vector3(0, 0, faceZ),
  };
}

export function createIntro(context) {
  const ctx = context || {};
  const scene = ctx.scene;
  const camera = ctx.camera;
  const director = createDirector({ camera });

  const stage = new THREE.Group();
  stage.name = 'cinematic_stage';
  stage.visible = false;
  scene.add(stage);

  const workerGeo = PLACEHOLDER_beeGeometry(
    INTRO.workerLength,
    INTRO.colors.worker,
    INTRO.colors.workerDark,
    INTRO.colors.workerWing
  );
  const combGeo = PLACEHOLDER_combGeometry();

  const workers = instanced('PLACEHOLDER_worker_swarm', workerGeo, INTRO.workerMax);
  const comb = instanced('PLACEHOLDER_comb_cells', combGeo, INTRO.combMax);
  stage.add(workers, comb);

  const capGeo = new THREE.CircleGeometry(INTRO.combCellRadius * 0.98, 6);
  const cap = new THREE.Mesh(
    capGeo,
    new THREE.MeshLambertMaterial({ color: INTRO.colors.cap, flatShading: true, side: THREE.DoubleSide })
  );
  cap.name = 'PLACEHOLDER_natal_cap';
  cap.visible = false;
  stage.add(cap);

  const motePos = new Float32Array(INTRO.moteCount * 3);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: INTRO.colors.mote,
      size: INTRO.moteSize * 2.2,
      map: moteSprite(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    })
  );
  motes.name = 'cinematic_pollen_motes';
  motes.frustumCulled = false;
  motes.visible = false;
  stage.add(motes);

  const anchors = {};
  const queenState = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    speedRatio: 0,
    boostAmount: 0,
    yawRate: 0,
    bank: 0,
  };
  let detail = [];
  let envK = -1;
  let fogOwned = false;
  let restoreFog = null;

  // ---------------------------------------------------------------- audio ---
  // cutscene-music.mp3 already has a manifest entry and a music track ("cutscene") in
  // config.audio.js, so it routes through the same music bus as every other track and therefore
  // respects the master and music sliders. It is not a `core` asset, so at the moment the cinematic
  // starts the buffer is usually still decoding; music() returns null in that case, hence the retry.
  const audio = ctx.audio || (typeof window !== 'undefined' && window.hollowtree ? window.hollowtree.audio : null);
  let musicHandle = null;
  let musicTimer = 0;
  let musicTries = 0;
  let musicStopped = true;

  function startMusic() {
    if (!audio || typeof audio.music !== 'function') return;
    musicStopped = false;
    musicHandle = null;
    musicTries = 60; // ~9 s of retries at 150 ms — covers a cold decode of the mp3
    musicTimer = 0;
    pumpMusic(0);
  }

  function pumpMusic(dt) {
    if (musicStopped || musicHandle || musicTries <= 0) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer = 0.15;
    musicTries--;
    // force: true bypasses the sting min-gap; the opening always gets its track.
    const source = audio.music('cutscene', { force: true });
    if (source) musicHandle = source;
  }

  function stopMusic(fade) {
    if (musicStopped) return;
    musicStopped = true;
    musicTries = 0;
    musicHandle = null;
    if (audio && typeof audio.stopMusic === 'function') audio.stopMusic(fade);
  }

  // ------------------------------------------------------------- geometry ---

  function detailNodes() {
    const list = [];
    if (ctx.hive) {
      list.push(ctx.hive.group);
      if (ctx.hive.forest) list.push(ctx.hive.forest.mesh);
    }
    if (ctx.grass) list.push(ctx.grass.grass, ctx.grass.stones, ctx.grass.tufts);
    if (ctx.flowers && Array.isArray(ctx.flowers.flowers)) {
      for (const g of ctx.flowers.flowers) if (g) list.push(g.mesh);
    }
    return list.filter(Boolean);
  }

  function setBee(mesh, slot, position, dir, roll, scale) {
    const yaw = Math.atan2(-dir.x, -dir.z);
    const flat = Math.hypot(dir.x, dir.z);
    const pitch = Math.atan2(dir.y, flat || 0.0001);
    _q.setFromEuler(_e.set(-pitch, yaw, roll || 0, 'YXZ'));
    _s.setScalar(scale === undefined ? 1 : scale);
    _m.compose(position, _q, _s);
    mesh.setMatrixAt(slot, _m);
  }

  function faceQueen(dir, bank, effort) {
    const yaw = Math.atan2(-dir.x, -dir.z);
    const flat = Math.hypot(dir.x, dir.z);
    const pitch = Math.atan2(dir.y, flat || 0.0001);
    queenState.quaternion.setFromEuler(_e.set(-pitch, yaw, bank || 0, 'YXZ'));
    queenState.speedRatio = effort === undefined ? queenState.speedRatio : effort;
  }

  // p(base, axis, amount, axis, amount, ...) — the only way camera points are authored in this file.
  function p(base, ...parts) {
    const out = base.clone();
    for (let i = 0; i < parts.length; i += 2) out.addScaledVector(parts[i], parts[i + 1]);
    return out;
  }

  function buildAnchors() {
    const spec = (ctx.interior && ctx.interior.spec) || fallbackSpec(ctx.hive, ctx.terrain);
    const n = new THREE.Vector3().copy(spec.entranceNormal).setY(0).normalize();
    const inward = n.clone().negate();
    const tan = new THREE.Vector3(n.z, 0, -n.x).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    // W — aperture on the inner wall. O — aperture mouth on the bark, measured from the GLB anchor.
    const W = spec.entrancePos.clone();
    const O = ctx.hive && ctx.hive.entrance ? ctx.hive.entrance.clone() : p(W, n, HIVE.entranceRadius);
    const hivePos = ctx.hive && ctx.hive.position
      ? ctx.hive.position.clone()
      : new THREE.Vector3(HIVE.x, spec.floorY, HIVE.z);

    const cellRoot = p(W, tan, STAGE.cellLateral, up, STAGE.cellDrop, inward, STAGE.cellOffWall);
    const cellMouth = p(cellRoot, inward, INTRO.combCellDepth * 0.5);
    const perch = p(cellMouth, inward, STAGE.perchOut, up, STAGE.perchDrop);

    // Bee traffic anchors, all comfortably inside the hall.
    const streamOut = p(W, inward, 0.4);
    const streamDeep = p(W, inward, 26.0, up, 12.0);
    const hallFocus = p(W, inward, 16.0, tan, 2.0, up, 6.0);

    // The queen's resting spot in the meadow, and the exact pose the play rig will inherit.
    const rest = p(O, tan, STAGE.restLateral, n, STAGE.restOut, up, STAGE.restDrop);

    Object.assign(anchors, {
      spec, n, inward, tan, up, W, O, hivePos, cellRoot, cellMouth, perch,
      streamOut, streamDeep, hallFocus, rest,
    });

    // The queen leaves the hollow along this arc and comes to rest at `rest`.
    anchors.exitCurve = new THREE.CatmullRomCurve3(
      [
        p(O, n, -0.8),
        p(O, n, 3.2, tan, 1.2, up, 0.6),
        p(O, n, 8.7, tan, 3.4, up, -1.4),
        rest.clone(),
      ],
      false,
      'centripetal',
      0.5
    );

    // Perch → aperture. The last point sits in the throat, never in bark: the aperture bore in
    // hollow-tree.glb is ~2.7 m clear on the trunk axis at y = 16.
    anchors.launchCurve = new THREE.CatmullRomCurve3(
      [
        perch.clone(),
        p(cellMouth, inward, 5.35, tan, 2.5, up, 1.0),
        p(cellMouth, inward, 3.85, tan, 9.0, up, 5.0),
        p(W, inward, 1.2, up, -0.1),
        p(W, n, 1.2),
      ],
      false,
      'centripetal',
      0.5
    );
  }

  const _pathA = new THREE.Vector3();
  const _pathB = new THREE.Vector3();

  function launchPath(u, out) {
    return anchors.launchCurve.getPoint(THREE.MathUtils.clamp(u, 0, 1), out || _pathA);
  }

  function exitPath(u, out) {
    return anchors.exitCurve.getPoint(THREE.MathUtils.clamp(u, 0, 1), out || _pathA);
  }

  // Normalised progress along the exit arc, shared by burst/wide/settle so the three shots read as
  // one continuous flight. Decelerating, and its derivative is zero at u = 1, so she truly stops.
  function exitU(t) {
    const s = THREE.MathUtils.clamp((t - T.burst.at) / (DURATION - T.burst.at), 0, 1);
    return 1 - (1 - s) ** 1.8;
  }

  function buildComb() {
    const { cellRoot, tan, up, inward } = anchors;
    const cols = STAGE.combCols;
    const rows = STAGE.combRows;
    let slot = 0;
    for (let r = 0; r < rows && slot < INTRO.combMax; r++) {
      for (let c = 0; c < cols && slot < INTRO.combMax; c++) {
        const x = (c - (cols - 1) * 0.5) * INTRO.combPitch + (r % 2) * INTRO.combPitch * 0.5;
        const y = (r - (rows - 1) * 0.5) * INTRO.combRowRise;
        const cell = p(cellRoot, tan, x, up, y);
        setBee(comb, slot, cell, inward, 0, 1);
        const tone = hash(r * cols + c, 7);
        _c.copy(new THREE.Color(INTRO.colors.wax))
          .lerp(new THREE.Color(INTRO.colors.waxDeep), tone * 0.55)
          .lerp(new THREE.Color(INTRO.colors.waxFresh), Math.max(0, tone - 0.6));
        comb.setColorAt(slot, _c);
        slot++;
      }
    }
    comb.count = slot;
    comb.instanceMatrix.needsUpdate = true;
    if (comb.instanceColor) comb.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------- bee crowds ---

  function stream(t, from, count) {
    const { streamDeep, streamOut, tan, up } = anchors;
    let slot = from;
    for (let i = 0; i < count && slot < INTRO.workerMax; i++) {
      const phase = (t * INTRO.streamSpeed + hash(i, 17)) % 1;
      const q = streamDeep.clone().lerp(streamOut, phase);
      q.addScaledVector(tan, Math.sin(phase * 7.0 + hash(i, 19) * 6.3) * 3.2);
      q.addScaledVector(up, Math.cos(phase * 5.4 + hash(i, 23) * 6.3) * 2.4);
      _v3.copy(streamOut).sub(streamDeep).normalize();
      setBee(workers, slot, q, _v3, Math.sin(t * 4 + i) * 0.25, 1);
      _c.set(INTRO.colors.worker);
      workers.setColorAt(slot, _c);
      slot++;
    }
    return slot;
  }

  function orbit(t, from, count, center, radius, height) {
    let slot = from;
    for (let i = 0; i < count && slot < INTRO.workerMax; i++) {
      const a = t * INTRO.orbitSpeed * (0.6 + hash(i, 29)) * Math.PI * 2 + hash(i, 31) * Math.PI * 2;
      const r = radius * (0.35 + hash(i, 37) * 0.9);
      const y = (hash(i, 41) - 0.5) * height + Math.sin(t * 0.7 + i) * 1.2;
      _v.set(center.x + Math.cos(a) * r, center.y + y, center.z + Math.sin(a) * r);
      _v3.set(-Math.sin(a), 0.1, Math.cos(a)).normalize();
      setBee(workers, slot, _v, _v3, Math.sin(t * 3.3 + i) * 0.3, 1);
      _c.set(INTRO.colors.worker);
      workers.setColorAt(slot, _c);
      slot++;
    }
    return slot;
  }

  function guards(t, from, count) {
    const { O, n, tan, up } = anchors;
    let slot = from;
    for (let i = 0; i < count && slot < INTRO.workerMax; i++) {
      const k = count === 1 ? 0.5 : i / (count - 1);
      const a = -INTRO.guardArc * 0.5 + INTRO.guardArc * k + Math.PI * 0.5;
      const wob = Math.sin(t * INTRO.guardJitterFreq + hash(i, 3) * 9.0);
      const wob2 = Math.sin(t * INTRO.guardJitterFreq * 0.71 + hash(i, 11) * 9.0);
      const radius = INTRO.guardRadius * (0.82 + hash(i, 5) * 0.3) + wob * INTRO.guardJitter;
      _v.copy(O)
        .addScaledVector(n, 1.2 + hash(i, 13) * 2.2 + wob2 * INTRO.guardJitter)
        .addScaledVector(tan, Math.cos(a) * radius)
        .addScaledVector(up, Math.sin(a) * radius * 0.86);
      setBee(workers, slot, _v, n, wob * 0.3, 1);
      _c.set(INTRO.colors.guard);
      workers.setColorAt(slot, _c);
      slot++;
    }
    return slot;
  }

  function commitWorkers(count) {
    workers.count = count;
    workers.visible = count > 0;
    workers.instanceMatrix.needsUpdate = true;
    if (workers.instanceColor) workers.instanceColor.needsUpdate = true;
  }

  // --------------------------------------------------------------- staging ---

  // Interior for everything up to the cut at `burst`, world after it. The switch happens under the
  // bloom flash, so the frame where the shell is swapped for the trunk is never visible.
  function envAt(t) {
    if (t < T.burst.at) return { k: 1, gain: INTRO.interiorGain };
    return { k: 0, gain: 1 };
  }

  function applyEnv(k, gain) {
    const interior = ctx.interior;
    if (interior) {
      interior.group.visible = k > 0.001;
      interior.setLightsActive(k > 0.001);
      if (k > 0.001) interior.setIntensity(k * gain);
      interior.setClipped(false);
    }
    const hide = k > 0.5;
    for (const node of detail) node.visible = !hide;
    // Drive the fog while we are inside, and restore it exactly once on the way out so the world's
    // own weather-driven fog is left alone for the rest of the sequence.
    if (scene.fog && restoreFog && (k > 0.001 || fogOwned)) {
      fogOwned = k > 0.001;
      _fog.copy(restoreFog).lerp(_c.set(INTERIOR.fogColor), k);
      scene.fog.color.copy(_fog);
      if (scene.fog.isFogExp2) {
        scene.fog.density = SKY.fogDensity + (INTERIOR.fogDensity - SKY.fogDensity) * k;
      } else {
        scene.fog.near = INTERIOR.fogNear * k + WORLD.fogNear * (1 - k);
        scene.fog.far = INTERIOR.fogFar * k + WORLD.fogFar * (1 - k);
      }
    }
    envK = k;
  }

  function stageAt(t) {
    const A = anchors;
    let queenVisible = false;
    let workerCount = 0;
    cap.visible = false;
    motes.visible = false;

    // --- the cap on the natal cell: trembles, splits, tumbles away ---
    if (t < STAGE.capBreakAt + STAGE.capFall) {
      cap.visible = true;
      cap.position.copy(A.cellMouth).addScaledVector(A.inward, 0.02);
      const tremble = smoothstep(STAGE.capTrembleFrom, STAGE.capBreakAt, t);
      if (t < STAGE.capBreakAt) {
        const wob = Math.sin(t * INTRO.capTrembleFreq * Math.PI * 2) * INTRO.capTremble * tremble;
        cap.position.addScaledVector(A.inward, Math.abs(wob) * 2.2);
        cap.position.addScaledVector(A.tan, wob);
      } else {
        const f = (t - STAGE.capBreakAt) / STAGE.capFall;
        cap.position.addScaledVector(A.inward, 0.4 + f * 1.2);
        cap.position.y -= f * f * 5.0;
      }
      cap.lookAt(_v.copy(cap.position).addScaledVector(A.inward, 1));
      cap.rotateZ(t * 1.7);
    }

    // --- pollen drifting in the shaft of light on the comb face ---
    if (t < T.launch.at) {
      motes.visible = true;
      const life0 = t * 0.35;
      for (let i = 0; i < INTRO.moteCount; i++) {
        const life = (life0 + hash(i, 53)) % 1;
        const ang = hash(i, 59) * Math.PI * 2;
        const rad = 4.5 * (0.25 + hash(i, 61));
        motePos[i * 3] = A.cellMouth.x + Math.cos(ang) * rad + A.inward.x * (1 + hash(i, 63) * 4);
        motePos[i * 3 + 1] = A.cellMouth.y - 3.0 + life * 7.0;
        motePos[i * 3 + 2] = A.cellMouth.z + Math.sin(ang) * rad + A.inward.z * (1 + hash(i, 63) * 4);
      }
      moteGeo.attributes.position.needsUpdate = true;
      motes.material.opacity = 0.85 * (1 - smoothstep(T.launch.at - 1.0, T.launch.at, t));
    }

    // --- 4.0 → 6.0 s: she pushes out of the cell ---
    if (t >= T.emerge.at && t < STAGE.emergeEnd) {
      queenVisible = true;
      const u = (t - T.emerge.at) / (STAGE.emergeEnd - T.emerge.at);
      const e = 1 - (1 - u) ** 2.2;
      const wobble = Math.sin(t * 5.4) * INTRO.emergeWobble * (1 - e);
      queenState.position
        .copy(A.cellMouth)
        .addScaledVector(A.inward, -0.35 + INTRO.emergeOut * e)
        .addScaledVector(A.tan, wobble)
        .addScaledVector(A.up, wobble * 0.6 - e * 0.15);
      faceQueen(A.inward, wobble * 1.4, INTRO.queenWingIdle + e * 0.3);
    }

    // --- 6.0 → 12.2 s: she settles onto the perch lip and looks around ---
    if (t >= STAGE.emergeEnd && t < T.launch.at) {
      queenVisible = true;
      const span = T.launch.at - STAGE.emergeEnd;
      const u = (t - STAGE.emergeEnd) / span;
      const e = smoothstep(0, 0.42, u);
      _v.copy(A.cellMouth).addScaledVector(A.inward, INTRO.emergeOut);
      queenState.position.copy(_v).lerp(A.perch, e);
      queenState.position.addScaledVector(A.tan, Math.sin(t * 1.1) * STAGE.hoverDrift * e * 0.5);
      queenState.position.y += Math.sin(t * 4.6) * 0.1 * e;
      // She turns from facing the wall to facing the light in the aperture.
      _v2.copy(A.W).sub(queenState.position).normalize();
      _v3.copy(A.inward).lerp(_v2, smoothstep(0.45, 0.95, u)).normalize();
      faceQueen(_v3, Math.sin(t * 1.3) * 0.1, 0.28 + e * 0.22);
    }

    // --- 12.2 → 15.4 s: perch → aperture ---
    if (t >= T.launch.at && t < T.burst.at) {
      queenVisible = true;
      const u = (t - T.launch.at) / T.launch.dur;
      const e = u * u * (3 - 2 * u);
      queenState.position.copy(launchPath(e, _pathA));
      _v2.copy(launchPath(Math.min(1, e + 0.03), _pathB)).sub(queenState.position).normalize();
      faceQueen(_v2, -Math.sin(u * Math.PI) * 0.22, 0.55 + u * 0.45);
    }

    // --- 15.4 → 24.0 s: out into the meadow, decelerating to a hover ---
    if (t >= T.burst.at) {
      queenVisible = true;
      const u = exitU(t);
      queenState.position.copy(exitPath(u, _pathA));
      _v2.copy(exitPath(Math.min(1, u + 0.015), _pathB)).sub(queenState.position);
      if (_v2.lengthSq() < 1e-6) _v2.copy(A.n);
      _v2.normalize();
      // She swings round to face the tree as she settles, so the play rig inherits a bee that is
      // already pointing where the default camera (yaw 0, pitch 0) looks: straight down -Z.
      const land = smoothstep(0.82, 1.0, u);
      _v3.copy(_v2).lerp(_v.copy(A.n).negate(), land).normalize();
      faceQueen(_v3, -0.3 * Math.sin(u * Math.PI * 0.9) * (1 - land), 1 - land * 0.85);
    }

    // --- bee traffic ---
    if (t >= T.reveal.at && t < T.launch.at) {
      workerCount = orbit(t, 0, 26, A.hallFocus, 20.0, 18.0);
      workerCount = stream(t, workerCount, 16);
    } else if (t >= T.launch.at && t < T.burst.at) {
      workerCount = stream(t, 0, 14);
    } else if (t >= T.burst.at) {
      workerCount = guards(t, 0, 10);
    }

    commitWorkers(workerCount);
    if (ctx.queen && ctx.queen.object3D) ctx.queen.object3D.visible = queenVisible;
  }

  // ---------------------------------------------------------------- shots ---

  function buildTimeline() {
    const A = anchors;
    const { inward, tan, up, n, W, O, cellMouth, hivePos, rest } = A;
    const shot = (id, extra) => Object.assign({}, T[id], extra);
    const queenAt = () => queenState.position;

    // The exact pose createCameraRig produces on its first frame for a bee resting at `rest` with
    // input.yaw = 0 and input.pitch = 0 (the state the player is handed). Ending the last shot here
    // means the cut into play mode moves the camera by ~0 m and ~0 rad.
    //   desired = rest - dir*CAMERA.distance + up*CAMERA.height,  dir = (0,0,-1)
    //   look    = rest + up*CAMERA.lookUp + dir*CAMERA.lookAhead*0.35
    const handoffPos = p(rest, n, 4.6, up, 1.35);
    const handoffLook = p(rest, up, 0.5, n, -0.665);

    const shots = [
      // 1. HATCH — macro on the capped natal cell. Slow push in, the cap trembling then splitting.
      //    Camera 3.6–7.0 m off the comb face at y 9.5–10.6: under the y-13.3 ledge, over the
      //    y-3.2 floor, 4.4 m clear of the entrance wall, 9 m clear of the nearest pillar.
      shot('hatch', {
        pos: [
          p(cellMouth, inward, 7.0, tan, 3.0, up, 1.6),
          p(cellMouth, inward, 3.6, tan, 1.0, up, 0.55),
        ],
        look: [p(cellMouth, up, 0.05), p(cellMouth, up, 0.02)],
      }),

      // 2. EMERGE — a low, slightly rising arc on the far side of the cell as she climbs out.
      shot('emerge', {
        pos: [
          p(cellMouth, inward, 4.05, tan, -3.8, up, -1.0),
          p(cellMouth, inward, 6.25, tan, -2.2, up, 0.6),
        ],
        lookFn: () => _v2.copy(queenAt()).addScaledVector(up, 0.14),
      }),

      // 3. REVEAL — cut wide: a crane out and up that opens the hall, ending framed on the comb wall
      //    and the lit aperture. The whole track sits at z ≤ -38, i.e. behind the landing shelf
      //    (which ends at z = -36.4), and x ∈ [-17, -5], i.e. 3+ m clear of the x = -22.08 pillars.
      shot('reveal', {
        pos: [
          p(cellMouth, inward, 11.85, tan, -3.0, up, 1.4),
          p(cellMouth, inward, 18.85, tan, 1.0, up, 10.0),
          p(cellMouth, inward, 26.85, tan, 9.0, up, 18.0),
        ],
        lookFn: (u) =>
          _v2
            .copy(queenAt())
            .addScaledVector(up, 0.3)
            .lerp(p(W, tan, -2.0, up, -1.0, inward, 2.1), smoothstep(0.05, 0.9, u)),
      }),

      // 4. LAUNCH — low and under her flight line, whipping across as she rises to the light.
      //    y 6.2–8.6 keeps the camera 3 m over the floor and 4 m under the landing slab it passes
      //    beneath.
      shot('launch', {
        pos: [
          p(cellMouth, inward, 8.35, tan, 1.0, up, -2.8),
          p(cellMouth, inward, 9.35, tan, 7.5, up, -0.4),
        ],
        lookFn: () => _v2.copy(queenAt()),
      }),

      // 5. BURST — hard cut to daylight. Camera 14.5–16 m off the trunk axis on the sunward side,
      //    level with the aperture; nearest bark is ~9 m away, the leaf mass starts 23 m higher.
      shot('burst', {
        pos: [
          p(O, n, 5.7, tan, 16.0, up, -1.5),
          p(O, n, 10.2, tan, 14.5, up, -2.5),
        ],
        lookFn: (u) => _v2.copy(O).lerp(queenAt(), smoothstep(0.05, 0.45, u)),
      }),

      // 6. WIDE — the establishing shot: 74 m of hollow tree, the queen a mote leaving it. Camera
      //    73–87 m out, far outside both the trunk (max r 24 m) and the canopy (max r 31 m).
      shot('wide', {
        pos: [
          p(hivePos, tan, 52.0, up, 26.0, n, 52.0),
          p(hivePos, tan, 60.0, up, 40.0, n, 62.0),
        ],
        look: [p(hivePos, up, 26.0), p(hivePos, up, 34.0)],
      }),

      // 7. SETTLE — cut in behind her and ease onto the exact third-person pose the play rig wants.
      shot('settle', {
        pos: [p(rest, tan, 1.6, up, 3.8, n, 10.0), handoffPos],
        lookFn: (u) =>
          _v2
            .copy(queenAt())
            .addScaledVector(up, 1.0)
            .lerp(handoffLook, smoothstep(0.0, 0.98, u)),
      }),
    ];

    const cards = CARDS.map((card) =>
      Object.assign({}, card, { label: CINEMATIC.copy[card.text] || card.text })
    );

    return {
      duration: DURATION,
      shots,
      cards,
      flashes: FLASHES,
      events: [
        // Let the music breathe out under the closing fade rather than cutting with the picture.
        { at: DURATION - CINEMATIC.fadeOut - 0.9, fire: () => stopMusic(CINEMATIC.fadeOut + 0.9) },
      ],
      onStart() {
        stage.visible = true;
        startMusic();
      },
      onUpdate(t, _context, dt) {
        pumpMusic(dt || 0);
        const env = envAt(t);
        applyEnv(env.k, env.gain);
        stageAt(t);
      },
      onFinish() {
        teardown();
      },
    };
  }

  function teardown() {
    stopMusic(0.35);
    stage.visible = false;
    workers.visible = false;
    comb.visible = false;
    cap.visible = false;
    motes.visible = false;
    envK = 1;
    applyEnv(0, 1);
    for (const node of detail) node.visible = true;
    if (ctx.queen && ctx.queen.object3D) ctx.queen.object3D.visible = true;
    handoff();
  }

  // Places the player exactly where the last cinematic frame left the queen. The rig has not run
  // yet, so its first update snaps to the pose shot 7 ended on — the cut into play mode is a match
  // cut, not a jump. input.yaw/pitch are left at 0: they are driven by module-private targets in
  // core/input.js that would spring straight back if written here.
  function handoff() {
    const A = anchors;
    const flight = ctx.flight;
    if (!flight || !A.rest) return;
    const spawn = A.rest.clone();
    if (flight.simPosition) flight.simPosition.copy(spawn);
    if (flight.velocity) flight.velocity.set(0, 0, 0);
    if (flight.acceleration) flight.acceleration.set(0, 0, 0);
    if (typeof flight.sample === 'function') flight.sample();
    if (flight.position && flight.position.copy) flight.position.copy(spawn);
  }

  function releaseViewpoint() {
    if (ctx.portal && typeof ctx.portal.setViewpoint === 'function') ctx.portal.setViewpoint(null);
  }

  function play(options) {
    const o = options || {};
    if (director.active) return false;
    buildAnchors();
    buildComb();
    detail = detailNodes();
    restoreFog = scene.fog ? scene.fog.color.clone() : new THREE.Color(PALETTE.fog);
    envK = -1;
    comb.visible = true;
    // The director parks the queen in the hall and flies the camera out to the meadow for
    // the establishing shots. Insideness follows the queen by default, so the hall stayed
    // drawn during those shots and its comb punched out through the bark. For the duration
    // of the cinematic the viewer, not the queen, decides what counts as "inside".
    if (ctx.portal && typeof ctx.portal.setViewpoint === 'function' && ctx.camera) {
      ctx.portal.setViewpoint(() => ctx.camera.position);
    }
    return director.play(buildTimeline(), {
      startedAt: o.startedAt,
      onFinish: o.onFinish,
      context: ctx,
    });
  }

  function update(dt) {
    if (!director.active) return false;
    // Skipping fades the picture over CINEMATIC.skipFade; take the music down with it rather than
    // waiting for finish().
    if (director.state && director.state.skipped) stopMusic(Math.max(0.2, CINEMATIC.skipFade * 0.8));
    const running = director.update(dt);
    if (running) {
      // The interior set is a free-standing stage built out in the meadow, not inside the
      // hall, so it cannot be culled by portal.insideness — that hid it during the very shot
      // it exists for. `T.burst.at` is the authored cut from hollow to daylight: FLASHES fires
      // its bloom there precisely to mask "the frame where the interior shell is swapped for
      // the world". Nothing was doing the swapping, so the comb wall stayed on the meadow as a
      // golden slab beside the trunk for every shot after it.
      const inside = director.time < T.burst.at;
      // Only the static set. `workers` is the swarm that bursts out of the entrance and is
      // the subject of the exterior shots, so it must keep flying after the cut.
      if (comb.visible !== inside) {
        comb.visible = inside;
        cap.visible = inside;
        motes.visible = inside;
      }
    }
    if (ctx.queen && typeof ctx.queen.update === 'function' && ctx.queen.object3D.visible) {
      ctx.queen.update(dt, queenState);
    }
    if (running && ctx.post && typeof ctx.post.setMotionState === 'function') {
      ctx.post.setMotionState({
        focusTarget: director.lookTarget,
        insideness: envK > 0 ? envK : 0,
        speedRatio: queenState.speedRatio,
        boostAmount: 0,
        yawRate: 0,
      });
    }
    // Hand insideness back to the queen the moment the sequence stops, however it stopped —
    // finished, skipped or aborted. Leaving the camera as the viewpoint would make play mode
    // decide "am I in the hollow" from the chase camera instead of the player.
    if (!running) releaseViewpoint();
    return running;
  }

  return {
    play,
    update,
    skip: director.skip,
    stop: director.stop,
    director,
    stage,
    anchors,
    get active() {
      return director.active;
    },
    get time() {
      return director.time;
    },
    get shot() {
      return director.shot;
    },
    get duration() {
      return DURATION;
    },
    // Offline dump of the authored camera path, through the same shotPosition() the live camera
    // uses. This is what the geometry-clearance check is run against: every shot here authors a
    // static `pos` track, so the result is exact and independent of frame rate.
    samplePath(steps) {
      buildAnchors();
      const line = buildTimeline();
      const n = Math.max(2, steps || 2400);
      const out = [];
      const at = new THREE.Vector3();
      for (let i = 0; i <= n; i++) {
        const t = (DURATION * i) / n;
        let shot = line.shots[0];
        for (const s of line.shots) if (s.at <= t) shot = s;
        if (shotPosition(shot, t, ctx, at)) out.push({ t, id: shot.id, x: at.x, y: at.y, z: at.z });
      }
      return out;
    },
    dispose() {
      releaseViewpoint();
      stopMusic(0.2);
      director.dispose();
      scene.remove(stage);
      workerGeo.dispose();
      combGeo.dispose();
      capGeo.dispose();
      moteGeo.dispose();
    },
  };
}

export function playCinematic(context, options) {
  const intro = createIntro(context);
  intro.play(options || {});
  return intro;
}
