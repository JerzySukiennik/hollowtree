// Hollowtree — the opening cinematic: hatching in the hollow, first flight into the meadow, and the hive defending itself, staged as a pure function of elapsed time from one shared start timestamp.

import * as THREE from 'three';
import { CINEMATIC, INTRO, HIVE, INTERIOR, PALETTE, SKY, WORLD } from '../config.js';
import { createDirector } from './director.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _fog = new THREE.Color();

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

function shotOf(id) {
  return CINEMATIC.shots.find((s) => s.id === id) || CINEMATIC.shots[0];
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

function finish(buf) {
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
  const geo = finish(buf);
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
  return finish(buf);
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
  const hornetGeo = PLACEHOLDER_beeGeometry(
    INTRO.hornetLength,
    INTRO.colors.hornet,
    INTRO.colors.hornetDark,
    INTRO.colors.hornetWing
  );
  const combGeo = PLACEHOLDER_combGeometry();

  const workers = instanced('PLACEHOLDER_worker_swarm', workerGeo, INTRO.workerMax);
  const hornets = instanced('PLACEHOLDER_hornet_flight', hornetGeo, INTRO.hornetMax);
  const comb = instanced('PLACEHOLDER_comb_cells', combGeo, INTRO.combMax);
  stage.add(workers, hornets, comb);

  const capGeo = new THREE.CircleGeometry(INTRO.combCellRadius * 0.98, 6);
  const cap = new THREE.Mesh(
    capGeo,
    new THREE.MeshLambertMaterial({ color: INTRO.colors.cap, flatShading: true, side: THREE.DoubleSide })
  );
  cap.name = 'PLACEHOLDER_natal_cap';
  cap.visible = false;
  stage.add(cap);

  const lipGeo = new THREE.BoxGeometry(1, 1, 1);
  const lipMat = new THREE.MeshLambertMaterial({ color: INTRO.colors.narrowing, flatShading: true });
  const narrowing = new THREE.Group();
  narrowing.name = 'PLACEHOLDER_entrance_narrowing';
  narrowing.visible = false;
  for (let i = 0; i < 4; i++) narrowing.add(new THREE.Mesh(lipGeo, lipMat));
  stage.add(narrowing);

  const motePos = new Float32Array(INTRO.moteCount * 3);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: INTRO.colors.mote,
      size: INTRO.moteSize,
      map: moteSprite(),
      transparent: true,
      opacity: 0.9,
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
  let combCounts = { natal: 0, total: 0 };
  let restoreFog = null;

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

  function buildAnchors() {
    const spec = (ctx.interior && ctx.interior.spec) || fallbackSpec(ctx.hive, ctx.terrain);
    const n = new THREE.Vector3().copy(spec.entranceNormal).setY(0).normalize();
    const inward = n.clone().negate();
    const tan = new THREE.Vector3(n.z, 0, -n.x).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    const wall = spec.entrancePos.clone();
    const cellRoot = wall
      .clone()
      .addScaledVector(tan, INTRO.natalLateral)
      .addScaledVector(up, -INTRO.natalDrop)
      .addScaledVector(inward, INTRO.natalOffWall);
    const cellMouth = cellRoot.clone().addScaledVector(inward, INTRO.combCellDepth * 0.5);

    const perch = cellMouth
      .clone()
      .addScaledVector(inward, INTRO.perchOut)
      .addScaledVector(up, -INTRO.perchDrop);

    const landing = wall
      .clone()
      .addScaledVector(inward, 6.0)
      .addScaledVector(up, -2.0);

    const hallCenter = new THREE.Vector3(spec.centerX, spec.floorY + spec.height * 0.5, spec.centerZ);

    const entrance = ctx.hive && ctx.hive.entrance ? ctx.hive.entrance.clone() : wall.clone();
    const hivePos = ctx.hive && ctx.hive.position
      ? ctx.hive.position.clone()
      : new THREE.Vector3(HIVE.x, spec.floorY, HIVE.z);

    const ground = (x, z) => (ctx.terrain && ctx.terrain.getHeight ? ctx.terrain.getHeight(x, z) : 0);

    const chaseBase = new THREE.Vector3(entrance.x, 0, entrance.z).addScaledVector(n, 30);
    const chase = (u) => {
      const p = chaseBase
        .clone()
        .addScaledVector(n, INTRO.chaseRun * u)
        .addScaledVector(tan, Math.sin(u * Math.PI * 2.2) * INTRO.chaseWeave);
      p.y = ground(p.x, p.z) + INTRO.chaseHeight + Math.sin(u * Math.PI * 3.0) * 1.2;
      return p;
    };

    const heroSeed = chase(0.97);
    let heroHead = heroSeed.clone();
    if (ctx.flowers && typeof ctx.flowers.sampleNearest === 'function') {
      const found = ctx.flowers.sampleNearest(heroSeed, 45);
      if (found && found.position) heroHead = found.position.clone();
    }

    const sunDir = new THREE.Vector3(0.4, 0.7, 0.3);
    if (ctx.sky && ctx.sky.sun) sunDir.copy(ctx.sky.sun.position).normalize();
    const sunFlat = new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize();
    const heroSide = new THREE.Vector3(sunFlat.z, 0, -sunFlat.x);

    const away = heroHead.clone().sub(hivePos).setY(0).normalize();
    const toTree = away.clone().negate();
    const cross = new THREE.Vector3(toTree.z, 0, -toTree.x);

    const duskBase = heroHead.clone().lerp(hivePos, 0.45);
    duskBase.y = ground(duskBase.x, duskBase.z) + 3.4;

    Object.assign(anchors, {
      spec, n, inward, tan, up, wall, cellRoot, cellMouth, perch, landing, hallCenter,
      entrance, hivePos, chase, heroHead, sunFlat, heroSide, away, toTree, cross, duskBase, ground,
    });
  }

  function buildComb() {
    const { cellRoot, tan, up, inward, spec } = anchors;
    const cols = INTRO.combPatchCols;
    const rows = INTRO.combPatchRows;
    const natal = [];
    const grown = [];

    const push = (list, x, y, seed) => {
      const p = cellRoot
        .clone()
        .addScaledVector(tan, x)
        .addScaledVector(up, y);
      list.push({ p, seed });
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) * 0.5) * INTRO.combPitch + (r % 2) * INTRO.combPitch * 0.5;
        const y = (r - (rows - 1) * 0.5) * INTRO.combRowRise;
        const d = Math.hypot(x, y);
        push(d < 2.6 ? natal : grown, x, y, r * cols + c);
      }
    }

    const wide = Math.floor((INTRO.combMax - natal.length - grown.length) / 2);
    for (let i = 0; i < wide * 2; i++) {
      const side = i < wide ? 1 : -1;
      const j = i % wide;
      const c = j % 17;
      const r = Math.floor(j / 17);
      const x = side * (14 + c * INTRO.combPitch) + (r % 2) * INTRO.combPitch * 0.5;
      const y = (r - 5) * INTRO.combRowRise;
      if (Math.abs(x) > spec.width * 0.44) continue;
      push(grown, x, y, 5000 + i);
    }

    const dir = inward.clone();
    let slot = 0;
    const write = (entry, scale) => {
      setBee(comb, slot, entry.p, dir, 0, scale);
      const tone = hash(entry.seed, 7);
      _c.copy(new THREE.Color(INTRO.colors.wax))
        .lerp(new THREE.Color(INTRO.colors.waxDeep), tone * 0.55)
        .lerp(new THREE.Color(INTRO.colors.waxFresh), Math.max(0, tone - 0.6));
      comb.setColorAt(slot, _c);
      slot++;
    };

    for (const entry of natal) write(entry, 1);
    const natalCount = slot;
    for (const entry of grown) {
      if (slot >= INTRO.combMax) break;
      write(entry, 0.001);
    }
    comb.count = slot;
    comb.instanceMatrix.needsUpdate = true;
    if (comb.instanceColor) comb.instanceColor.needsUpdate = true;
    combCounts = { natal: natalCount, total: slot, grown: grown.slice(0, slot - natalCount) };
  }

  function growComb(t) {
    const { inward } = anchors;
    const list = combCounts.grown || [];
    let dirty = false;
    for (let i = 0; i < list.length; i++) {
      const delay = hash(i, 91) * INTRO.combGrowStagger * INTRO.combGrowSpan;
      const k = smoothstep(0, INTRO.combGrowSpan * 0.5, t - INTRO.combGrowFrom - delay);
      const scale = Math.max(0.001, k);
      setBee(comb, combCounts.natal + i, list[i].p, inward, 0, scale);
      dirty = true;
    }
    if (dirty) comb.instanceMatrix.needsUpdate = true;
  }

  function placeNarrowing() {
    const { entrance, n, tan, up } = anchors;
    const r = HIVE.entranceRadius;
    const inset = r * INTRO.narrowInset;
    const axes = [
      [tan, 1],
      [tan, -1],
      [up, 1],
      [up, -1],
    ];
    for (let i = 0; i < narrowing.children.length; i++) {
      const [axis, sign] = axes[i];
      const lip = narrowing.children[i];
      lip.position.copy(entrance).addScaledVector(axis, sign * (r - inset * 0.5)).addScaledVector(n, -0.4);
      const along = axis === tan ? up : tan;
      lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().multiplyScalar(sign));
      lip.scale.set(r * 1.7, inset, INTRO.narrowThickness);
      void along;
    }
  }

  function guards(t, count, open, from) {
    const { entrance, n, tan, up } = anchors;
    const arc = INTRO.guardArc;
    let slot = from || 0;
    for (let i = 0; i < count && slot < INTRO.workerMax; i++) {
      const k = count === 1 ? 0.5 : i / (count - 1);
      const a = -arc * 0.5 + arc * k + Math.PI * 0.5;
      const jitter = INTRO.guardJitter;
      const wob = Math.sin(t * INTRO.guardJitterFreq + hash(i, 3) * 9.0);
      const wob2 = Math.sin(t * INTRO.guardJitterFreq * 0.71 + hash(i, 11) * 9.0);
      const radius = INTRO.guardRadius * (0.82 + hash(i, 5) * 0.3) + wob * jitter;
      const p = entrance
        .clone()
        .addScaledVector(n, 0.8 + hash(i, 13) * 1.6 + wob2 * jitter + open * 2.0)
        .addScaledVector(tan, Math.cos(a) * radius)
        .addScaledVector(up, Math.sin(a) * radius * 0.86);
      setBee(workers, slot, p, n, wob * 0.3, 1);
      _c.set(INTRO.colors.guard);
      workers.setColorAt(slot, _c);
      slot++;
    }
    return slot;
  }

  function stream(t, from, count) {
    const { landing, inward, tan, up, entrance } = anchors;
    const deep = landing.clone().addScaledVector(inward, 16).addScaledVector(up, 14);
    let slot = from;
    for (let i = 0; i < count && slot < INTRO.workerMax; i++) {
      const phase = (t * INTRO.streamSpeed + hash(i, 17)) % 1;
      const p = deep.clone().lerp(entrance, phase);
      p.addScaledVector(tan, Math.sin(phase * 7.0 + hash(i, 19) * 6.3) * 2.6);
      p.addScaledVector(up, Math.cos(phase * 5.4 + hash(i, 23) * 6.3) * 1.9);
      _v3.copy(entrance).sub(deep).normalize();
      setBee(workers, slot, p, _v3, Math.sin(t * 4 + i) * 0.25, 1);
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
      const p = new THREE.Vector3(
        center.x + Math.cos(a) * r,
        center.y + y,
        center.z + Math.sin(a) * r
      );
      _v3.set(-Math.sin(a), 0.1, Math.cos(a)).normalize();
      setBee(workers, slot, p, _v3, Math.sin(t * 3.3 + i) * 0.3, 1);
      _c.set(INTRO.colors.worker);
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

  function commitHornets(count) {
    hornets.count = count;
    hornets.visible = count > 0;
    hornets.instanceMatrix.needsUpdate = true;
    if (hornets.instanceColor) hornets.instanceColor.needsUpdate = true;
  }

  function envAt(t) {
    if (t < shotOf('burst').at) return { k: 1, gain: INTRO.interiorGain };
    if (t < shotOf('retreat').at) return { k: 0, gain: 1 };
    if (t < shotOf('flourish').at) {
      const k = smoothstep(shotOf('retreat').at, shotOf('retreat').at + 2.0, t);
      return { k: 1, gain: INTRO.siegeDim + (INTRO.interiorGain - INTRO.siegeDim) * k * 0.4 };
    }
    const k = smoothstep(shotOf('flourish').at, shotOf('flourish').at + 3.0, t);
    return { k: 1, gain: INTRO.siegeDim + (INTRO.flourishLight - INTRO.siegeDim) * k };
  }

  function skyTimeAt(t) {
    const dusk = smoothstep(shotOf('hornets').at - 0.6, shotOf('siege').at + 2.0, t);
    const back = smoothstep(shotOf('retreat').at, shotOf('retreat').at + 1.0, t);
    return INTRO.dayTime + (INTRO.duskTime - INTRO.dayTime) * dusk * (1 - back);
  }

  let lastSkyTime = -1;

  function refreshSky(force) {
    if (!ctx.sky || typeof ctx.sky.setTimeOfDay !== 'function') return;
    if (force) {
      ctx.sky.setTimeOfDay(lastSkyTime >= 0 ? lastSkyTime : INTRO.dayTime);
      return;
    }
    const want = skyTimeAt(director.time);
    if (Math.abs(want - lastSkyTime) < 0.0004) return;
    lastSkyTime = want;
    ctx.sky.setTimeOfDay(want);
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
    if (k <= 0.001 && envK > 0.001) refreshSky(true);
    if (scene.fog && k > 0.001) {
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
    const sHatch = shotOf('hatch_macro');
    const sLow = shotOf('hatch_low');
    const sReveal = shotOf('hatch_reveal');
    const sLaunch = shotOf('launch');
    const sBurst = shotOf('burst');
    const sChase = shotOf('chase');
    const sBloom = shotOf('bloom');
    const sWide = shotOf('meadow_wide');
    const sHornets = shotOf('hornets');
    const sSiege = shotOf('siege');
    const sRetreat = shotOf('retreat');
    const sFlourish = shotOf('flourish');

    const queen = ctx.queen;
    let queenVisible = false;
    let workerCount = 0;
    let hornetCount = 0;
    cap.visible = false;
    motes.visible = false;
    narrowing.visible = false;

    if (t < sLaunch.at) {
      cap.visible = t < INTRO.capBreakAt + INTRO.capFall;
      cap.position.copy(A.cellMouth).addScaledVector(A.inward, 0.02);
      const tremble = Math.min(1, Math.max(0, (t - 0.8) / (INTRO.capBreakAt - 0.8)));
      if (t < INTRO.capBreakAt) {
        const wob = Math.sin(t * INTRO.capTrembleFreq * Math.PI * 2) * INTRO.capTremble * tremble;
        cap.position.addScaledVector(A.inward, Math.abs(wob) * 2.2);
        cap.position.addScaledVector(A.tan, wob);
        cap.rotation.set(wob * 0.8, 0, wob * 1.6);
      } else {
        const f = (t - INTRO.capBreakAt) / INTRO.capFall;
        cap.position.addScaledVector(A.inward, 0.4 + f * 1.4);
        cap.position.y -= f * f * 7.0;
        cap.rotation.set(f * 5.0, f * 3.0, f * 4.0);
      }
      cap.lookAt(cap.position.clone().addScaledVector(A.inward, 1));
      cap.rotateZ(t * 1.7);
    }

    if (t >= sLow.at && t < sLaunch.at) {
      queenVisible = true;
      if (t < sReveal.at) {
        const u = (t - sLow.at) / sLow.dur;
        const e = 1 - (1 - u) ** 2.2;
        const wobble = Math.sin(t * 5.4) * INTRO.emergeWobble * (1 - e);
        queenState.position
          .copy(A.cellMouth)
          .addScaledVector(A.inward, -0.35 + INTRO.emergeOut * e)
          .addScaledVector(A.tan, wobble)
          .addScaledVector(A.up, wobble * 0.6 - e * 0.15);
        faceQueen(A.inward, wobble * 1.4, INTRO.queenWingIdle + e * 0.35);
      } else {
        const u = (t - sReveal.at) / sReveal.dur;
        const e = u * u * (3 - 2 * u);
        _v.copy(A.cellMouth).addScaledVector(A.inward, INTRO.emergeOut);
        queenState.position.copy(_v).lerp(A.perch, e);
        queenState.position.addScaledVector(A.tan, Math.sin(t * 1.6) * INTRO.perchDrift * e);
        queenState.position.y += Math.sin(t * 5.0) * 0.09 * e;
        _v2.copy(A.perch).sub(_v).setY(0).normalize();
        faceQueen(_v2.lengthSq() > 0.1 ? _v2 : A.inward, Math.sin(t * 1.3) * 0.12, 0.3 + e * 0.35);
      }
    }

    if (t >= sLaunch.at && t < sBurst.at) {
      queenVisible = true;
      const u = (t - sLaunch.at) / sLaunch.dur;
      const e = u * u * u;
      queenState.position.copy(launchPath(e, _pathA));
      _v2.copy(launchPath(Math.min(1, e + 0.03), _pathB)).sub(queenState.position).normalize();
      faceQueen(_v2, -Math.sin(u * Math.PI) * 0.28, 0.55 + u * 0.45);
    }

    if (t >= sBurst.at && t < sChase.at) {
      queenVisible = true;
      const u = (t - sBurst.at) / sBurst.dur;
      queenState.position.copy(burstPath(u, _pathA));
      _v2.copy(burstPath(Math.min(1, u + 0.02), _pathB)).sub(queenState.position).normalize();
      faceQueen(_v2, -0.42 * Math.sin(u * Math.PI * 0.9), 1);
    }

    if (t >= sChase.at && t < sBloom.at) {
      queenVisible = true;
      const u = (t - sChase.at) / sChase.dur;
      queenState.position.copy(A.chase(u));
      _v2.copy(A.chase(Math.min(1, u + 0.01))).sub(queenState.position).normalize();
      faceQueen(_v2, -Math.cos(u * Math.PI * 2.2) * 0.5, 0.95);
    }

    if (t >= sBloom.at && t < sHornets.at) {
      queenVisible = true;
      const u = (t - sBloom.at) / (sWide.at + sWide.dur - sBloom.at);
      const a = t * 0.9;
      queenState.position
        .copy(A.heroHead)
        .addScaledVector(A.heroSide, Math.cos(a) * 0.85)
        .addScaledVector(A.sunFlat, -0.55 - Math.sin(a) * 0.3);
      queenState.position.y += 0.32 + Math.sin(t * 5.6) * 0.08;
      _v2.copy(A.heroHead).sub(queenState.position).normalize();
      faceQueen(_v2, Math.sin(a) * 0.2, 0.34);
      if (t < sWide.at) {
        motes.visible = true;
        for (let i = 0; i < INTRO.moteCount; i++) {
          const life = ((t - sBloom.at) * 0.55 + hash(i, 53)) % 1;
          const ang = hash(i, 59) * Math.PI * 2;
          const rad = INTRO.moteSpread * (0.2 + hash(i, 61)) * (0.35 + life);
          motePos[i * 3] = A.heroHead.x + Math.cos(ang) * rad;
          motePos[i * 3 + 1] = A.heroHead.y - 0.3 + life * INTRO.moteRise;
          motePos[i * 3 + 2] = A.heroHead.z + Math.sin(ang) * rad;
        }
        moteGeo.attributes.position.needsUpdate = true;
        motes.material.opacity = 0.9 * (1 - smoothstep(sWide.at - 0.8, sWide.at, t));
      }
      void u;
    }

    if (t >= sHornets.at && t < sSiege.at) {
      const u = (t - sHornets.at) / sHornets.dur;
      for (let i = 0; i < INTRO.hornetCount; i++) {
        const k = u * 1.35 - i * 0.16 + 0.1;
        const p = A.duskBase
          .clone()
          .addScaledVector(A.toTree, INTRO.hornetPassLens + i * 3.4)
          .addScaledVector(A.cross, INTRO.hornetPassSpan * (0.5 - k))
          .addScaledVector(A.up, INTRO.hornetPassHeight * (0.55 + hash(i, 67) * 0.7) - 1.6);
        _v3.copy(A.cross).negate();
        setBee(hornets, i, p, _v3, Math.sin(t * 6 + i) * 0.4, 1.0 + hash(i, 71) * 0.35);
        _c.set(INTRO.colors.hornet);
        hornets.setColorAt(i, _c);
      }
      hornetCount = INTRO.hornetCount;
    }

    if (t >= sSiege.at && t < sRetreat.at) {
      narrowing.visible = true;
      workerCount = guards(t, INTRO.guardCount, 0);
      for (let i = 0; i < INTRO.hornetCount; i++) {
        const lunge = Math.max(0, Math.sin(t * INTRO.hornetLungeFreq * Math.PI * 2 + i * 2.1));
        const d = INTRO.hornetStandoff - INTRO.hornetLunge * lunge * lunge;
        const a = t * 0.8 + i * 2.1;
        const p = A.entrance
          .clone()
          .addScaledVector(A.n, d)
          .addScaledVector(A.tan, Math.cos(a) * (4.5 + i))
          .addScaledVector(A.up, Math.sin(a * 0.8) * 3.2 + 1.0);
        _v3.copy(A.entrance).sub(p).normalize();
        setBee(hornets, i, p, _v3, Math.sin(t * 7 + i) * 0.5, 1.0 + hash(i, 71) * 0.3);
        _c.set(INTRO.colors.hornet);
        hornets.setColorAt(i, _c);
      }
      hornetCount = INTRO.hornetCount;
    }

    if (t >= sRetreat.at && t < sFlourish.at) {
      queenVisible = true;
      const u = (t - sRetreat.at) / sRetreat.dur;
      const e = 1 - (1 - u) ** 2.4;
      queenState.position
        .copy(A.landing)
        .addScaledVector(A.inward, 3.0 + e * 9.0)
        .addScaledVector(A.up, e * INTRO.retreatUp)
        .addScaledVector(A.tan, Math.sin(u * 2.4) * 3.4);
      _v2.copy(A.inward).addScaledVector(A.up, 1.1).normalize();
      faceQueen(_v2, Math.sin(u * 3.1) * 0.22, 0.85);
      workerCount = stream(t, 0, INTRO.streamCount);
      workerCount = guards(t, 8, 0, workerCount);
    }

    if (t >= sFlourish.at) {
      queenVisible = true;
      const u = (t - sFlourish.at) / sFlourish.dur;
      const e = 1 - (1 - Math.min(1, u)) ** 3;
      const target = new THREE.Vector3(
        A.spec.centerX,
        A.spec.floorY + A.spec.height * 0.44,
        A.spec.centerZ
      );
      _v.copy(A.landing)
        .addScaledVector(A.inward, 12)
        .addScaledVector(A.up, INTRO.retreatUp);
      queenState.position.copy(_v).lerp(target, e);
      queenState.position.y += Math.sin(t * 4.6) * 0.16;
      _v2.copy(A.inward).applyAxisAngle(A.up, Math.sin(t * 0.4) * 0.9);
      faceQueen(_v2, Math.sin(t * 0.9) * 0.16, 0.28);
      workerCount = orbit(
        t,
        0,
        INTRO.orbitCount,
        target,
        A.spec.width * INTRO.orbitRadius,
        A.spec.height * INTRO.orbitRise
      );
      growComb(t);
    }

    commitWorkers(workerCount);
    commitHornets(hornetCount);
    if (queen && queen.object3D) queen.object3D.visible = queenVisible;
  }

  let launchCurve = null;
  let burstCurve = null;
  const _pathA = new THREE.Vector3();
  const _pathB = new THREE.Vector3();

  function launchPath(u, out) {
    return launchCurve.getPoint(THREE.MathUtils.clamp(u, 0, 1), out || _pathA);
  }

  function burstPath(u, out) {
    return burstCurve.getPoint(THREE.MathUtils.clamp(u, 0, 1), out || _pathA);
  }

  function buildPaths() {
    const A = anchors;
    launchCurve = new THREE.CatmullRomCurve3(
      [
        A.perch.clone(),
        A.perch.clone().addScaledVector(A.inward, 2.0).addScaledVector(A.up, 3.2),
        A.wall.clone().addScaledVector(A.inward, 7.0).addScaledVector(A.up, 0.4),
        A.wall.clone().addScaledVector(A.inward, 1.4),
        A.wall.clone().addScaledVector(A.n, 1.6),
      ],
      false,
      'centripetal',
      0.5
    );
    burstCurve = new THREE.CatmullRomCurve3(
      [
        A.entrance.clone(),
        A.entrance.clone().addScaledVector(A.n, INTRO.burstDive * 0.28).addScaledVector(A.up, 1.2),
        A.entrance
          .clone()
          .addScaledVector(A.n, INTRO.burstDive * 0.62)
          .addScaledVector(A.tan, INTRO.burstSide * 0.35)
          .addScaledVector(A.up, -INTRO.burstDrop * 0.4),
        A.entrance
          .clone()
          .addScaledVector(A.n, INTRO.burstDive * 0.9)
          .addScaledVector(A.tan, INTRO.burstSide * 0.8)
          .addScaledVector(A.up, -INTRO.burstDrop * 0.95),
      ],
      false,
      'centripetal',
      0.5
    );
  }

  function buildTimeline() {
    const A = anchors;
    const shot = (id, extra) => Object.assign({}, shotOf(id), extra);
    const p = (base, ...parts) => {
      const out = base.clone();
      for (let i = 0; i < parts.length; i += 2) out.addScaledVector(parts[i], parts[i + 1]);
      return out;
    };

    const queenAt = () => queenState.position;

    const shots = [
      shot('hatch_macro', {
        pos: [
          p(A.cellMouth, A.inward, INTRO.macroDist, A.tan, INTRO.macroSlide, A.up, INTRO.macroRise),
          p(A.cellMouth, A.inward, INTRO.macroPush, A.tan, INTRO.macroSlide * 0.25, A.up, INTRO.macroRise * 0.55),
        ],
        look: [p(A.cellMouth, A.up, 0.05), p(A.cellMouth, A.up, 0.02)],
      }),
      shot('hatch_low', {
        pos: [
          p(A.cellMouth, A.inward, INTRO.lowDist, A.tan, -0.95, A.up, -INTRO.lowDrop),
          p(A.cellMouth, A.inward, INTRO.lowDist * 0.9, A.tan, INTRO.lowArc, A.up, -INTRO.lowDrop * 0.8),
        ],
        lookFn: () => _v2.copy(queenAt()).addScaledVector(A.up, 0.16),
      }),
      shot('hatch_reveal', {
        pos: [
          p(A.cellMouth, A.inward, INTRO.revealStart, A.up, 1.2),
          p(A.hallCenter, A.n, A.spec.depth * 0.18, A.up, -A.spec.height * 0.1),
          p(A.hallCenter, A.n, A.spec.depth * INTRO.revealBack * 0.5, A.up, A.spec.height * (INTRO.revealHeight - 0.5)),
        ],
        lookFn: (u) => _v2.copy(queenAt()).lerp(p(A.wall, A.inward, 6, A.up, 2), u * 0.45),
      }),
      shot('launch', {
        posFn: (u) => {
          const q = launchPath(Math.min(1, u + INTRO.launchLead));
          const ahead = launchPath(Math.min(1, u + INTRO.launchLead + 0.05));
          _v.copy(ahead).sub(q).normalize();
          return _v2
            .copy(q)
            .addScaledVector(_v, -INTRO.launchTrail)
            .addScaledVector(A.up, INTRO.launchAbove);
        },
        lookFn: (u) => _v3.copy(launchPath(Math.min(1, u + INTRO.launchLead + 0.14))),
      }),
      shot('burst', {
        pos: [
          p(A.entrance, A.n, INTRO.burstOut, A.tan, INTRO.burstSide, A.up, -INTRO.burstDrop),
          p(A.entrance, A.n, INTRO.burstOut * 0.92, A.tan, INTRO.burstSide * 0.86, A.up, -INTRO.burstDrop * 0.88),
        ],
        lookFn: (u) => _v2.copy(A.entrance).lerp(queenAt(), smoothstep(0.12, 0.5, u)),
      }),
      shot('chase', {
        posFn: (u) => {
          const q = A.chase(u);
          const ahead = A.chase(Math.min(1, u + 0.02));
          _v.copy(ahead).sub(q).normalize();
          _v3.set(_v.z, 0, -_v.x).normalize();
          return _v2
            .copy(q)
            .addScaledVector(_v, -INTRO.chaseOffsetBack)
            .addScaledVector(_v3, INTRO.chaseOffsetSide * Math.sin(u * Math.PI * 1.6))
            .addScaledVector(A.up, INTRO.chaseOffsetUp);
        },
        lookFn: (u) => _v3.copy(A.chase(Math.min(1, u + 0.06))),
        rollFn: (u) => Math.cos(u * Math.PI * 2.2) * 0.16,
      }),
      shot('bloom', {
        pos: [
          p(A.heroHead, A.sunFlat, -INTRO.bloomDist, A.heroSide, INTRO.bloomOrbit, A.up, -INTRO.bloomLift),
          p(A.heroHead, A.sunFlat, -INTRO.bloomPush, A.heroSide, -INTRO.bloomOrbit * 0.7, A.up, INTRO.bloomLift * 0.5),
        ],
        lookFn: (u) => _v2.copy(A.heroHead).lerp(queenAt(), 0.35 + u * 0.2),
      }),
      shot('meadow_wide', {
        pos: [
          p(A.heroHead, A.away, INTRO.wideStart, A.up, 5.0),
          p(A.heroHead, A.away, INTRO.wideEnd * 0.55, A.up, INTRO.wideRise * 0.5),
          p(A.heroHead, A.away, INTRO.wideEnd, A.up, INTRO.wideRise),
        ],
        lookFn: (u) =>
          _v2.copy(A.heroHead).addScaledVector(A.up, 1.5).lerp(p(A.hivePos, A.up, INTRO.wideLook), smoothstep(0.1, 0.95, u)),
      }),
      shot('hornets', {
        pos: [
          p(A.duskBase, A.cross, -3.0),
          p(A.duskBase, A.cross, 3.0),
        ],
        look: [p(A.hivePos, A.up, 30), p(A.hivePos, A.up, 26)],
      }),
      shot('siege', {
        pos: [
          p(A.entrance, A.n, INTRO.siegeDist, A.tan, INTRO.siegeSide, A.up, -INTRO.siegeDrop),
          p(A.entrance, A.n, INTRO.siegePush, A.tan, INTRO.siegeSide * 0.45, A.up, -INTRO.siegeDrop * 0.62),
        ],
        look: [p(A.entrance, A.up, 1.2), p(A.entrance, A.up, 0.4)],
      }),
      shot('retreat', {
        pos: [
          p(A.landing, A.inward, INTRO.retreatBack, A.up, 1.6),
          p(A.landing, A.inward, INTRO.retreatBack * 0.7, A.up, INTRO.retreatLead),
        ],
        lookFn: () => _v2.copy(queenAt()),
      }),
      shot('flourish', {
        pos: [
          p(A.hallCenter, A.n, A.spec.depth * 0.16, A.up, -A.spec.height * 0.14),
          p(A.hallCenter, A.n, A.spec.depth * INTRO.flourishBack * 0.5, A.up, A.spec.height * (INTRO.flourishHigh - 0.5)),
        ],
        lookFn: (u) =>
          _v2
            .copy(queenAt())
            .lerp(
              new THREE.Vector3(A.spec.centerX, A.spec.floorY + A.spec.height * INTRO.flourishLook, A.spec.centerZ),
              smoothstep(0.25, 1, u)
            ),
      }),
    ];

    const cards = CINEMATIC.cards.map((card) =>
      Object.assign({}, card, { label: CINEMATIC.copy[card.text] || card.text })
    );

    return {
      duration: CINEMATIC.duration,
      shots,
      cards,
      flashes: CINEMATIC.flashes,
      events: [],
      onStart() {
        stage.visible = true;
        placeNarrowing();
      },
      onUpdate(t) {
        refreshSky(false);
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
    stage.visible = false;
    workers.visible = false;
    hornets.visible = false;
    comb.visible = false;
    cap.visible = false;
    motes.visible = false;
    narrowing.visible = false;
    lastSkyTime = INTRO.dayTime;
    envK = 1;
    applyEnv(0, 1);
    for (const node of detail) node.visible = true;
    if (ctx.queen && ctx.queen.object3D) ctx.queen.object3D.visible = true;
    handoff();
  }

  function handoff() {
    const A = anchors;
    const flight = ctx.flight;
    if (!flight || !A.entrance) return;
    const spawn = A.entrance.clone().addScaledVector(A.n, 12).addScaledVector(A.up, 0.5);
    if (flight.simPosition) flight.simPosition.copy(spawn);
    if (flight.velocity) flight.velocity.set(0, 0, 0);
    if (typeof flight.sample === 'function') flight.sample();
    if (flight.position && flight.position.copy) flight.position.copy(spawn);
  }

  function play(options) {
    const o = options || {};
    if (director.active) return false;
    buildAnchors();
    buildPaths();
    buildComb();
    detail = detailNodes();
    restoreFog = scene.fog ? scene.fog.color.clone() : new THREE.Color(PALETTE.fog);
    lastSkyTime = -1;
    envK = -1;
    comb.visible = true;
    return director.play(buildTimeline(), {
      startedAt: o.startedAt,
      onFinish: o.onFinish,
      context: ctx,
    });
  }

  function update(dt) {
    if (!director.active) return false;
    const running = director.update(dt);
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
    return running;
  }

  return {
    play,
    update,
    skip: director.skip,
    stop: director.stop,
    director,
    stage,
    get active() {
      return director.active;
    },
    get time() {
      return director.time;
    },
    get shot() {
      return director.shot;
    },
    dispose() {
      director.dispose();
      scene.remove(stage);
      workerGeo.dispose();
      hornetGeo.dispose();
      combGeo.dispose();
      capGeo.dispose();
      lipGeo.dispose();
      moteGeo.dispose();
    },
  };
}

export function playCinematic(context, options) {
  const intro = createIntro(context);
  intro.play(options || {});
  return intro;
}
