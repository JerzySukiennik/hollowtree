// Hollowtree — the opening cinematic: a queen hatches in the hollow, climbs to the light and takes
// her first flight into the meadow. Seven authored shots, ~24 s, a pure function of elapsed time
// from one shared start timestamp so every client in a session sees the identical cut.
//
// Every camera number below is expressed in a frame built from measured, live geometry — never from
// guessed constants. The frame is:
//
//   W       spec.entrancePos      the aperture on the INNER wall of the hall
//   O       hive.entrance         the aperture mouth on the OUTER bark surface
//   n       spec.entranceNormal   outward, flattened (0,0,1) for the shipped layout
//   inward  -n                    into the hall
//   tan     (n.z, 0, -n.x)        lateral, (1,0,0) for the shipped layout
//   up      (0,1,0)
//
// WHY THE INTERIOR SET MOVED (2026-08-08)
// --------------------------------------
// The previous staging trusted `spec` as if the hall were a hollow box: spec reports
// x[-48,48] y[3.20,66.84] z[-89.40,-25.40], so a natal cell hung 14 m lateral of the aperture,
// just off the z = -25.40 plane, looked safely inside. It was not. `spec` is the hall's *bounding*
// volume; the drawn shell, its landing slab, four tiers of gallery ledges, the alcoves and the
// floor-to-ceiling pillars all live inside that box, and near the entrance wall they fill it
// almost completely. Measured with measureClearance() below, the old path put 377 of 2401 camera
// samples within 0.6 m of a solid and touched `hollow_shell` at 0.005 m. A camera sitting *in* a
// single-sided wall sees straight through it, which is exactly why the first frames of the old
// opening were flat brown fields — and why the hatch shot showed the comb hanging over open
// meadow with sky behind it.
//
// So the set is no longer placed by assumption. The clearance field was sampled over the whole
// front half of the hall and the one wide, genuinely empty lane is:
//
//   x ∈ [-26, -16]   y ∈ [14, 29]   z ∈ [-38, -58]      4.7 m to 12.1 m clear throughout
//
// The natal comb now sits at the far end of that lane, at (-20, 19, -52), and every interior
// camera works from inside it. That spot was not chosen only for the clearance: the hall's own
// skylight sits at (-21.12, -49.08) directly above it, so the comb face has a motivated key light
// and the pollen motes have a real shaft to drift in.
//
// Reference numbers for the rest of the layout:
//   hive group          (0, 0.00, -30)          terrain is flat (y≈0) for 60 m around the trunk
//   W                   (0, 16.00, -25.403)     O = (0, 16.00, -22.203)
//   trunk bbox          x[-21.0, 22.4]  y[0, 66.1]  z[-50.4, -11.1]
//   canopy leaf bbox    x[-28.8, 31.5]  y[37.1, 74.0]  z[-57.0, -9.6]
//   skylights           (-21.12, -49.08) and (21.12, -65.72), in the ceiling at y 66.8
//
// Interior shots run with the trunk hidden (applyEnv); exterior shots run with it visible and are
// kept far outside the bark and below the leaf mass. Do not move a camera point in this file
// without re-running measureClearance() — that is what it is for.

import * as THREE from 'three';
import { CINEMATIC, INTRO, HIVE, INTERIOR, PALETTE, SKY, WORLD } from '../config.js';
import { createDirector, shotPosition, easing } from './director.js';

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

// Seven beats. The cut at `burst` is load-bearing: FLASHES fires a bloom on exactly that frame to
// mask the swap from interior shell to world, so its `at` must not move without moving the flash.
const SHOTS = [
  // id        at     dur   ease        fov         handheld  shake
  { id: 'hatch', at: 0.0, dur: 4.2, ease: 'holdOut', fov: [38, 31], handheld: 0.24, shake: 0.0 },
  { id: 'emerge', at: 4.2, dur: 3.8, ease: 'out', fov: [44, 37], handheld: 0.40, shake: 0.07 },
  { id: 'reveal', at: 8.0, dur: 4.4, ease: 'settle', fov: [40, 52], handheld: 0.18, shake: 0.0 },
  // launch tightens rather than widens: its subject is flying away from a locked-off camera, and
  // the old 50 -> 66 shrank a queen who was already receding until she was a speck on a dark wall.
  { id: 'launch', at: 12.4, dur: 3.0, ease: 'in', fov: [58, 42], handheld: 0.34, shake: 0.15 },
  { id: 'burst', at: 15.4, dur: 2.8, ease: 'out', fov: [52, 47], handheld: 0.42, shake: 0.18 },
  { id: 'wide', at: 18.2, dur: 2.8, ease: 'settle', fov: [56, 48], handheld: 0.16, shake: 0.0 },
  { id: 'settle', at: 21.0, dur: 3.0, ease: 'settle', fov: [66, 62], handheld: 0.14, shake: 0.0 },
];

const T = {};
for (const s of SHOTS) T[s.id] = s;

const CARDS = [
  { at: 8.6, dur: 3.4, fade: 0.95, text: 'title', size: 1.0 },
  { at: 18.9, dur: 2.1, fade: 0.75, text: 'subtitle', size: 0.36 },
];

// One bloom on the cut from the hollow into daylight — it also masks the frame where the interior
// shell is swapped for the world.
const FLASHES = [{ at: 15.4, dur: 0.55, peak: 0.9, color: '#fff4dd' }];

// Staging constants, all in metres in the frame described at the top of the file.
// cellLateral / cellLift / cellDepth put the comb at world (-20, 19, -52): the centre of the one
// measured lane in the hall that is clear on every side, and directly under the (-21.12, -49.08)
// skylight. The comb face looks back at the aperture (+n), so every interior camera stands between
// the comb and the daylight and is lit from behind.
const STAGE = {
  cellLateral: -20.0, // tan offset of the natal comb from the aperture  → world x = -20
  cellLift: 3.0, //      up offset                                       → world y = 19
  cellDepth: 26.6, //    inward from the aperture wall                   → world z = -52.0
  perchOut: 2.8, //      out along +n from the cell mouth to the perch lip
  perchDrop: -1.6,
  // 420 cells, 21.5 m wide x 19.5 m tall — exactly INTRO.combMax. The old 15x9 patch was 16 x 8 m,
  // which the reveal crane cleared entirely: the comb read as a rectangular slab hanging in mid-air
  // with all four cut edges in shot. Squarer and half again as tall, it runs past every frame edge
  // of every interior shot (the widest is 18.0 x 10.1 m of comb at the end of the reveal crane), so
  // it reads as what it is meant to be — a wall of brood she is one cell of.
  combCols: 20,
  combRows: 21,
  capBreakAt: 3.1,
  capFall: 1.6,
  capTrembleFrom: 1.0,
  emergeEnd: 6.4, // queen is fully out of the cell
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

    // The natal comb, deep in the measured lane. `faceOut` is the direction its cell mouths open:
    // back toward the aperture, so the camera never has to stand behind the comb in the dark.
    const cellRoot = p(W, tan, STAGE.cellLateral, up, STAGE.cellLift, inward, STAGE.cellDepth);
    const faceOut = n.clone();
    const cellMouth = p(cellRoot, faceOut, INTRO.combCellDepth * 0.5);
    const perch = p(cellMouth, faceOut, STAGE.perchOut, up, STAGE.perchDrop);

    // Bee traffic anchors. hallFocus sits in the same open lane as the set so the orbiting workers
    // read as depth behind the queen instead of popping through a wall.
    const streamOut = p(W, inward, 1.2);
    const streamDeep = p(W, inward, 32.0, tan, -6.0, up, 9.0);
    const hallFocus = p(W, inward, 24.0, tan, -11.0, up, 6.0);

    // The queen's resting spot in the meadow, and the exact pose the play rig will inherit.
    const rest = p(O, tan, STAGE.restLateral, n, STAGE.restOut, up, STAGE.restDrop);

    Object.assign(anchors, {
      spec, n, inward, tan, up, W, O, hivePos, cellRoot, faceOut, cellMouth, perch,
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

    // Perch → aperture, 28 m across the hall. She climbs out of the lane, crosses the open middle
    // and only converges on the trunk axis in the last two control points, where the aperture bore
    // in hollow-tree.glb is ~2.7 m clear at y = 16.
    anchors.launchCurve = new THREE.CatmullRomCurve3(
      [
        perch.clone(),
        p(cellMouth, faceOut, 5.5, tan, 1.2, up, 0.9),
        p(cellMouth, faceOut, 12.0, tan, 5.0, up, 1.7),
        p(W, inward, 8.0, tan, -3.0, up, 1.0),
        p(W, inward, 2.4, up, 0.2),
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
    const { cellRoot, tan, up, faceOut } = anchors;
    const cols = STAGE.combCols;
    const rows = STAGE.combRows;
    let slot = 0;
    for (let r = 0; r < rows && slot < INTRO.combMax; r++) {
      for (let c = 0; c < cols && slot < INTRO.combMax; c++) {
        const x = (c - (cols - 1) * 0.5) * INTRO.combPitch + (r % 2) * INTRO.combPitch * 0.5;
        const y = (r - (rows - 1) * 0.5) * INTRO.combRowRise;
        const cell = p(cellRoot, tan, x, up, y);
        setBee(comb, slot, cell, faceOut, 0, 1);
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
  // The two macro shots sit 3–7 m off a wax face lit only by a skylight 48 m overhead, which at the
  // authored hall intensity renders as brown murk before anything resolves. Lift the hall while the
  // camera is that close and ease back to the authored level by the time `reveal` opens it out, so
  // the wide shot keeps the deep, unlit corners it needs to read as a cavern.
  function envAt(t) {
    if (t >= T.burst.at) return { k: 0, gain: 1 };
    const macro = 1 - smoothstep(T.emerge.at, T.reveal.at, t); // the two shots hard against the wax
    const hall = 1 - smoothstep(T.reveal.at, T.burst.at, t); //   the two that cross the hollow
    return { k: 1, gain: INTRO.interiorGain * (1 + 0.45 * macro + 0.25 * hall) };
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
    // The interior set is a free-standing prop, so nothing culls it once the cut lands in daylight.
    // Own that here, on the one path that runs every frame, rather than only in update()'s
    // `running` branch — a frame that reaches the stage without reaching that branch used to leave
    // the comb standing in the meadow beside the trunk.
    const setDressed = t < T.burst.at;
    if (comb.visible !== setDressed) comb.visible = setDressed;

    // --- the cap on the natal cell: trembles, splits, tumbles away ---
    if (t < STAGE.capBreakAt + STAGE.capFall) {
      cap.visible = true;
      cap.position.copy(A.cellMouth).addScaledVector(A.faceOut, 0.02);
      const tremble = smoothstep(STAGE.capTrembleFrom, STAGE.capBreakAt, t);
      if (t < STAGE.capBreakAt) {
        const wob = Math.sin(t * INTRO.capTrembleFreq * Math.PI * 2) * INTRO.capTremble * tremble;
        cap.position.addScaledVector(A.faceOut, Math.abs(wob) * 2.2);
        cap.position.addScaledVector(A.tan, wob);
      } else {
        const f = (t - STAGE.capBreakAt) / STAGE.capFall;
        cap.position.addScaledVector(A.faceOut, 0.4 + f * 1.2);
        cap.position.y -= f * f * 5.0;
      }
      cap.lookAt(_v.copy(cap.position).addScaledVector(A.faceOut, 1));
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
        motePos[i * 3] = A.cellMouth.x + Math.cos(ang) * rad + A.faceOut.x * (1 + hash(i, 63) * 4);
        motePos[i * 3 + 1] = A.cellMouth.y - 3.0 + life * 7.0;
        motePos[i * 3 + 2] = A.cellMouth.z + Math.sin(ang) * rad + A.faceOut.z * (1 + hash(i, 63) * 4);
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
        .addScaledVector(A.faceOut, -0.35 + INTRO.emergeOut * e)
        .addScaledVector(A.tan, wobble)
        .addScaledVector(A.up, wobble * 0.6 - e * 0.15);
      faceQueen(A.faceOut, wobble * 1.4, INTRO.queenWingIdle + e * 0.3);
    }

    // --- 6.0 → 12.2 s: she settles onto the perch lip and looks around ---
    if (t >= STAGE.emergeEnd && t < T.launch.at) {
      queenVisible = true;
      const span = T.launch.at - STAGE.emergeEnd;
      const u = (t - STAGE.emergeEnd) / span;
      const e = smoothstep(0, 0.42, u);
      _v.copy(A.cellMouth).addScaledVector(A.faceOut, INTRO.emergeOut);
      queenState.position.copy(_v).lerp(A.perch, e);
      queenState.position.addScaledVector(A.tan, Math.sin(t * 1.1) * STAGE.hoverDrift * e * 0.5);
      queenState.position.y += Math.sin(t * 4.6) * 0.1 * e;
      // She turns from facing straight out of the cell to facing the light in the aperture.
      _v2.copy(A.W).sub(queenState.position).normalize();
      _v3.copy(A.faceOut).lerp(_v2, smoothstep(0.45, 0.95, u)).normalize();
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
    const { inward, tan, up, n, W, O, cellRoot, cellMouth, faceOut, hivePos, rest } = A;
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
      // 1. HATCH — macro on the capped natal cell, a slow 3 m push as the cap trembles and splits.
      //    Camera 3.5–6.6 m off the comb face inside the measured lane; nearest solid 7.0 m at the
      //    start, 8.6 m at the end. At fov 38 the frame holds about seven cells across, so the pale
      //    capped one reads immediately instead of dissolving into a wall of wax.
      shot('hatch', {
        pos: [
          p(cellMouth, faceOut, 6.6, tan, 2.4, up, 1.2),
          p(cellMouth, faceOut, 3.5, tan, 0.9, up, 0.5),
        ],
        look: [p(cellMouth, tan, 0.55, up, -0.22), p(cellMouth, tan, 0.3, up, -0.12)],
      }),

      // 2. EMERGE — a low, rising arc round the far side of the cell as she climbs out. Held on the
      //    queen, so she is the subject from her first frame. Clearance 7.3–8.1 m throughout.
      shot('emerge', {
        pos: [
          p(cellMouth, faceOut, 4.4, tan, -3.6, up, -1.5),
          p(cellMouth, faceOut, 7.0, tan, -2.2, up, 1.0),
        ],
        lookFn: () => _v2.copy(queenAt()).addScaledVector(up, 0.14),
      }),

      // 3. REVEAL — the scale beat: she is one cell of thousands. A slow crane up and back across
      //    the brood wall, widening 40 -> 52, so the single cell we have been living in since the
      //    first frame recedes into a face of comb that runs past every edge of the frame.
      //
      //    Two earlier versions of this shot failed and both failures are worth keeping written
      //    down. Pointing the look at the lit aperture put a gallery ledge 4.8 m in front of the
      //    lens and ended the shot on a flat brown field. Craning higher and further back to open
      //    the hall instead cleared the comb entirely and exposed its four cut edges — a rectangle
      //    of honeycomb hanging in mid-air. The hall gets its establishing shot at `launch`, from
      //    a camera low enough to see the far wall and the entrance light; this beat stays on the
      //    comb, where there is always something in frame.
      shot('reveal', {
        pos: [
          p(cellMouth, faceOut, 6.0, tan, 0.8, up, 1.2),
          p(cellMouth, faceOut, 7.2, tan, 1.8, up, 3.6),
          p(cellMouth, faceOut, 8.4, tan, 2.6, up, 6.0),
        ],
        lookFn: (u) =>
          _v2
            .copy(queenAt())
            .addScaledVector(up, 0.35)
            .lerp(p(cellRoot, up, 1.5), smoothstep(0.12, 0.95, u)),
      }),

      // 4. LAUNCH — she leaves the perch and crosses the hall toward the light. The camera holds in
      //    the open lane and widens instead of chasing her into the throat; the old version flew the
      //    lens to within 2 cm of the trunk to keep up. Staying put also keeps the comb wall in the
      //    near frame as a foreground she flies out of, so the shot never empties to bare hall.
      shot('launch', {
        pos: [
          p(cellMouth, faceOut, 6.4, tan, -2.6, up, -2.0),
          p(cellMouth, faceOut, 10.4, tan, -0.6, up, -0.6),
        ],
        lookFn: (u) => _v2.copy(queenAt()).lerp(p(cellMouth, faceOut, 9.0, up, 1.2), 0.28 * (1 - u)),
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

      // 6. WIDE — the establishing shot. Pulled in from the old 73–87 m to 52–66 m and dropped to
      //    y 14 at the start so the tree fills the frame from root flare to crown and the camera
      //    rises past it, rather than sitting level with the canopy watching a small tree. Still
      //    41 m clear of the bark at the closest point and below the leaf mass (y 37+) at the start.
      shot('wide', {
        pos: [
          p(hivePos, tan, 34.0, up, 14.0, n, 40.0),
          p(hivePos, tan, 40.0, up, 26.0, n, 50.0),
        ],
        look: [p(hivePos, up, 24.0), p(hivePos, up, 34.0)],
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
    // The set's visibility is driven from stageAt(), which director.update() has just run for this
    // frame: `T.burst.at` is the authored cut from hollow to daylight, and FLASHES fires its bloom
    // there precisely to mask the frame where the interior shell is swapped for the world. Nothing
    // else culls the prop — portal.insideness cannot, because the set is free-standing out in the
    // meadow rather than inside the hall — so if that swap is ever dropped the comb wall stands on
    // the grass beside the trunk for the whole back half of the sequence. `workers` is deliberately
    // exempt: the swarm bursting from the entrance is the subject of the exterior shots.
    if (!running && comb.visible) comb.visible = false;
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

  // One solid-distance field over the scene, shared by both debug probes below.
  //
  // Only opaque, lit meshes count. The hall's light shafts, knot beams, glow quads and the ghost
  // comb are transparent MeshBasicMaterial and a camera may fly through them freely; counting them
  // made the whole hall read as solid and hid the real collisions.
  //
  // This is deliberately a distance field over raw triangles rather than THREE.Raycaster. The
  // raycaster returns nothing at all for `hollow_shell` from inside the hall — its material is
  // FrontSide and the shell's winding faces away from the interior, so every probe ray is
  // backface-culled and a camera buried in a wall measures as perfectly clear. Point-to-triangle
  // distance has no notion of facing and cannot be fooled that way.
  function solidField() {
  const solids = [];
  const roots = [ctx.interior && ctx.interior.group, ctx.hive && ctx.hive.group].filter(Boolean);
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((node) => {
      const mat = node.isMesh && node.material;
      if (!mat || !node.geometry || !node.geometry.attributes.position) return;
      if (mat.transparent || mat.opacity < 1 || mat.type === 'MeshBasicMaterial') return;
      if (/^comb_/.test(node.name || '')) return; // player-built cells, empty at t = 0
      solids.push(node);
    });
  }

  const tri = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  for (const node of solids) {
    const attr = node.geometry.attributes.position;
    const index = node.geometry.index;
    const count = index ? index.count : attr.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      va.fromBufferAttribute(attr, ia).applyMatrix4(node.matrixWorld);
      vb.fromBufferAttribute(attr, ib).applyMatrix4(node.matrixWorld);
      vc.fromBufferAttribute(attr, ic).applyMatrix4(node.matrixWorld);
      tri.push({ a: va.clone(), b: vb.clone(), c: vc.clone(), tag: node.name || 'anon' });
    }
  }

  // Uniform grid so 2400 samples against ~16 k triangles stays interactive.
  const CELL = 4;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const box = new THREE.Box3();
  for (let i = 0; i < tri.length; i++) {
    const t = tri[i];
    box.makeEmpty().expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
    for (let x = Math.floor(box.min.x / CELL); x <= Math.floor(box.max.x / CELL); x++) {
      for (let y = Math.floor(box.min.y / CELL); y <= Math.floor(box.max.y / CELL); y++) {
        for (let z = Math.floor(box.min.z / CELL); z <= Math.floor(box.max.z / CELL); z++) {
          const k = key(x, y, z);
          let bucket = grid.get(k);
          if (!bucket) grid.set(k, (bucket = []));
          bucket.push(i);
        }
      }
    }
  }

  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const ap = new THREE.Vector3();
  const bp = new THREE.Vector3();
  const cp = new THREE.Vector3();
  const hit = new THREE.Vector3();
  // Ericson, Real-Time Collision Detection §5.1.5 — closest point on a triangle to a point.
  function pointTri(p, a, b, c) {
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ap.subVectors(p, a);
    const d1 = ab.dot(ap);
    const d2 = ac.dot(ap);
    if (d1 <= 0 && d2 <= 0) return hit.copy(a).distanceTo(p);
    bp.subVectors(p, b);
    const d3 = ab.dot(bp);
    const d4 = ac.dot(bp);
    if (d3 >= 0 && d4 <= d3) return hit.copy(b).distanceTo(p);
    const vcv = d1 * d4 - d3 * d2;
    if (vcv <= 0 && d1 >= 0 && d3 <= 0) {
      return hit.copy(a).addScaledVector(ab, d1 / (d1 - d3)).distanceTo(p);
    }
    cp.subVectors(p, c);
    const d5 = ab.dot(cp);
    const d6 = ac.dot(cp);
    if (d6 >= 0 && d5 <= d6) return hit.copy(c).distanceTo(p);
    const vbv = d5 * d2 - d1 * d6;
    if (vbv <= 0 && d2 >= 0 && d6 <= 0) {
      return hit.copy(a).addScaledVector(ac, d2 / (d2 - d6)).distanceTo(p);
    }
    const vav = d3 * d6 - d5 * d4;
    if (vav <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      return hit.copy(b).lerp(c, (d4 - d3) / (d4 - d3 + (d5 - d6))).distanceTo(p);
    }
    const denom = 1 / (vav + vbv + vcv);
    return hit
      .copy(a)
      .addScaledVector(ab, vbv * denom)
      .addScaledVector(ac, vcv * denom)
      .distanceTo(p);
  }

  const probe = new THREE.Vector3();
  function nearest(x, y, z) {
    probe.set(x, y, z);
    let best = Infinity;
    let tag = '';
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const cz = Math.floor(z / CELL);
    const seen = new Set();
    for (let r = 0; r <= 4; r++) {
      for (let X = cx - r; X <= cx + r; X++) {
        for (let Y = cy - r; Y <= cy + r; Y++) {
          for (let Z = cz - r; Z <= cz + r; Z++) {
            const ring = Math.max(Math.abs(X - cx), Math.abs(Y - cy), Math.abs(Z - cz));
            if (r > 0 && ring !== r) continue;
            const bucket = grid.get(key(X, Y, Z));
            if (!bucket) continue;
            for (const i of bucket) {
              if (seen.has(i)) continue;
              seen.add(i);
              const d = pointTri(probe, tri[i].a, tri[i].b, tri[i].c);
              if (d < best) {
                best = d;
                tag = tri[i].tag;
              }
            }
          }
        }
      }
      if (best < r * CELL) break;
    }
    return { d: best, tag };
  }
    return { triangles: tri.length, nearest };
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
    // The geometry-clearance check the camera notes above are written against. Dumps the authored
    // path through the same shotPosition() the live camera uses, then measures every sample against
    // the solid triangles actually in the scene — the hall shell, its ledges, deco and basins, and
    // the trunk and canopy — and reports the distance to the nearest surface.
    //
    // Only opaque, lit meshes count. The hall's light shafts, knot beams, glow quads and the ghost
    // comb are transparent MeshBasicMaterial and a camera may fly through them freely; counting
    // them made the whole hall look solid and hid the real collisions.
    //
    //   window.hollowtree.cinematic.intro.measureClearance()
    //
    // Acceptance: `under0_6` must be 0 and `globalMin` must stay well above the 0.1 m near plane.
    measureClearance(steps) {
      const field = solidField();
      const path = this.samplePath(steps || 2400);
      const perShot = new Map();
      const all = [];
      for (const s of path) {
        const near = field.nearest(s.x, s.y, s.z);
        const d = Number.isFinite(near.d) ? Number(near.d.toFixed(3)) : 999;
        all.push({ t: Number(s.t.toFixed(2)), id: s.id, d, hit: near.tag });
        let row = perShot.get(s.id);
        if (!row) perShot.set(s.id, (row = { id: s.id, samples: 0, min: Infinity, atT: 0, hit: '', under0_6: 0, under1_5: 0 }));
        row.samples++;
        if (d < row.min) {
          row.min = d;
          row.atT = Number(s.t.toFixed(2));
          row.hit = near.tag;
        }
        if (d < 0.6) row.under0_6++;
        if (d < 1.5) row.under1_5++;
      }
      const sorted = all.slice().sort((a, b) => a.d - b.d);
      return {
        triangles: field.triangles,
        samples: all.length,
        globalMin: sorted[0].d,
        under0_6: all.filter((r) => r.d < 0.6).length,
        under1_5: all.filter((r) => r.d < 1.5).length,
        under3: all.filter((r) => r.d < 3).length,
        perShot: [...perShot.values()].map((r) => ({ ...r, min: Number(r.min.toFixed(3)) })),
        worst: sorted.slice(0, 8),
      };
    },
    // The companion check to measureClearance(). Clearance proves the camera is not buried in a
    // wall; it says nothing about whether the shot has anything in it. A camera 5 m off a flat
    // ledge, aimed at that ledge, is perfectly "clear" and renders as a flat brown field — which is
    // what the old reveal did at its final second.
    //
    // So: pose a scratch camera on the authored track at each time, sphere-trace a 5x5 grid of rays
    // through the frustum against the same distance field, and look at the spread of hit distances.
    // Note this measures the STATIC set — hall, trunk, canopy — not the queen or the workers, so a
    // shot whose only subject is the queen still has to be judged from a frame.
    //
    //   nearest / median / farthest   depth of the surfaces actually in frame
    //   openRays                      rays that hit nothing (sky, or the unlit depth of the hall)
    //   spread                        farthest / nearest — 1.0 means every ray landed on one plane
    //
    // A shot reads when the frame has layers: either spread well above ~1.6, or open rays behind a
    // near subject. spread ≈ 1.0 with no open rays is the signature of a flat wash.
    measureFraming(times) {
      buildAnchors();
      buildComb();
      // The probe has to see the set to measure it, so remember what it found and hand it back
      // untouched — this is callable mid-sequence and must not leave the prop standing.
      const wasStage = stage.visible;
      const wasComb = comb.visible;
      const wasEnvK = envK;
      const wasDetail = detail;
      if (!detail.length) detail = detailNodes();
      const restoreVis = detail.map((node) => node.visible);
      const interiorWasVisible = ctx.interior ? ctx.interior.group.visible : false;
      stage.visible = true;
      comb.visible = true;
      const line = buildTimeline();
      const list = times && times.length
        ? times
        : line.shots.map((s) => [s.at + s.dur * 0.15, s.at + s.dur * 0.5, s.at + s.dur * 0.92]).flat();

      const field = solidField();
      const FAR = 220;

      // solidField() only collects the hall and the tree, and the comb is a 420-instance
      // InstancedMesh whose triangles are expensive to expand. But the comb IS the subject of the
      // first three shots, so measure it analytically instead: it is a flat slab, and its distance
      // is the usual point-to-box in the (tan, up, faceOut) frame it was built in.
      const A = anchors;
      const halfW = (STAGE.combCols * INTRO.combPitch) * 0.5;
      const halfH = (STAGE.combRows * INTRO.combRowRise) * 0.5;
      const halfD = INTRO.combCellDepth * 0.5;
      const rel = new THREE.Vector3();
      function combDistance(x, y, z) {
        if (!comb.visible) return Infinity;
        rel.set(x, y, z).sub(A.cellRoot);
        const ex = Math.max(0, Math.abs(rel.dot(A.tan)) - halfW);
        const ey = Math.max(0, Math.abs(rel.dot(A.up)) - halfH);
        const ez = Math.max(0, Math.abs(rel.dot(A.faceOut)) - halfD);
        return Math.hypot(ex, ey, ez);
      }

      // Sphere tracing on the distance field: step by the distance to the nearest surface, which
      // can never overshoot one, until we are on it or out of range. `nearest` only searches a few
      // grid rings, so a ray crossing open air reports Infinity long before it reaches anything —
      // coast forward in fixed strides rather than calling that a miss, or the wide shot (60 m of
      // clear air before the tree) measures as an empty frame.
      function march(ox, oy, oz, dx, dy, dz) {
        let travelled = 0.05;
        for (let i = 0; i < 400 && travelled < FAR; i++) {
          const px = ox + dx * travelled;
          const py = oy + dy * travelled;
          const pz = oz + dz * travelled;
          const world = field.nearest(px, py, pz).d;
          const d = Math.min(Number.isFinite(world) ? world : Infinity, combDistance(px, py, pz));
          if (d < 0.06) return travelled;
          travelled += Number.isFinite(d) ? Math.max(0.1, d * 0.85) : 8;
        }
        return null;
      }

      const scratch = camera ? camera.clone() : new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 800);
      const at = new THREE.Vector3();
      const look = new THREE.Vector3();
      const ray = new THREE.Vector3();

      const out = [];
      for (const t of list) {
        let shot = line.shots[0];
        for (const s of line.shots) if (s.at <= t) shot = s;
        // Put the world into the state this instant of the sequence actually renders in before
        // measuring it. Both halves matter: stageAt so a lookFn that tracks the queen finds her
        // where this shot thinks she is, and applyEnv so the hall is drawn for interior shots and
        // the trunk for exterior ones. Without the env pass the answer depends entirely on when the
        // probe happened to be called — run at the menu it reported every ray missing, because the
        // hall is hidden until the player is inside it.
        stageAt(t);
        const env = envAt(t);
        applyEnv(env.k, env.gain);
        if (!shotPosition(shot, t, ctx, at)) continue;
        const local = Math.min(1, Math.max(0, (t - shot.at) / Math.max(0.0001, shot.dur)));
        const u = easing(shot.ease)(local);
        if (typeof shot.lookFn === 'function') look.copy(shot.lookFn(u, ctx, t, local));
        else if (Array.isArray(shot.look)) look.copy(shot.look[0]).lerp(shot.look[shot.look.length - 1], u);
        else look.set(0, 0, 0);

        scratch.fov = Array.isArray(shot.fov) ? shot.fov[0] + (shot.fov[shot.fov.length - 1] - shot.fov[0]) * u : scratch.fov;
        scratch.up.set(0, 1, 0);
        scratch.position.copy(at);
        scratch.lookAt(look);
        scratch.updateProjectionMatrix();
        scratch.updateMatrixWorld(true);

        const depths = [];
        let open = 0;
        const halfV = Math.tan((scratch.fov * Math.PI) / 360);
        const halfH = halfV * (scratch.aspect || 16 / 9);
        for (let ix = -2; ix <= 2; ix++) {
          for (let iy = -2; iy <= 2; iy++) {
            ray
              .set(ix * 0.4 * halfH, iy * 0.4 * halfV, -1)
              .applyQuaternion(scratch.quaternion)
              .normalize();
            const d = march(at.x, at.y, at.z, ray.x, ray.y, ray.z);
            if (d === null) open++;
            else depths.push(d);
          }
        }
        depths.sort((a, b) => a - b);
        const near = depths.length ? depths[0] : null;
        const far = depths.length ? depths[depths.length - 1] : null;
        out.push({
          t: Number(t.toFixed(2)),
          shot: shot.id,
          nearest: near === null ? null : Number(near.toFixed(2)),
          median: depths.length ? Number(depths[Math.floor(depths.length / 2)].toFixed(2)) : null,
          farthest: far === null ? null : Number(far.toFixed(2)),
          openRays: open,
          spread: near && far ? Number((far / near).toFixed(2)) : null,
        });
      }
      stage.visible = wasStage;
      comb.visible = wasComb;
      detail.forEach((node, i) => {
        node.visible = restoreVis[i];
      });
      if (ctx.interior) ctx.interior.group.visible = interiorWasVisible;
      detail = wasDetail;
      envK = wasEnvK;
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
