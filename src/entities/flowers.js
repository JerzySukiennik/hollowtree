// Hollowtree — instanced flower field: per-species geometry, finite reserves, visible depletion and regrowth.

import * as THREE from 'three';
import { FLOWERS, FLOWER_SPECIES, HIVE } from '../config.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0;
    return s / 4294967296;
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function pushColor(col, c, m) {
  col.push(c.r * m, c.g * m, c.b * m);
}

function stemStrip(buf, angle, height, width, tint) {
  const { pos, nrm, col, idx } = buf;
  const base = pos.length / 3;
  const cx = Math.cos(angle) * width;
  const cz = Math.sin(angle) * width;
  pos.push(-cx, 0, -cz, cx, 0, cz, -cx * 0.58, height, -cz * 0.58, cx * 0.58, height, cz * 0.58);
  for (let i = 0; i < 4; i++) nrm.push(-Math.sin(angle), 0.42, Math.cos(angle));
  pushColor(col, tint, 0.58);
  pushColor(col, tint, 0.58);
  pushColor(col, tint, 1.0);
  pushColor(col, tint, 1.0);
  idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
}

function petalRing(buf, cfg) {
  const { pos, nrm, col, idx } = buf;
  for (let p = 0; p < cfg.count; p++) {
    const a = (p / cfg.count) * Math.PI * 2 + cfg.offset;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const sx = -dz;
    const sz = dx;
    const base = pos.length / 3;
    const wi = cfg.width * 0.5;
    const wo = cfg.width * 0.3;
    pos.push(
      dx * cfg.inner + sx * wi, cfg.y, dz * cfg.inner + sz * wi,
      dx * cfg.inner - sx * wi, cfg.y, dz * cfg.inner - sz * wi,
      dx * cfg.outer + sx * wo, cfg.y + cfg.lift, dz * cfg.outer + sz * wo,
      dx * cfg.outer - sx * wo, cfg.y + cfg.lift, dz * cfg.outer - sz * wo
    );
    const nl = Math.hypot(dx * cfg.cup, 1, dz * cfg.cup);
    for (let v = 0; v < 4; v++) nrm.push((-dx * cfg.cup) / nl, 1 / nl, (-dz * cfg.cup) / nl);
    pushColor(col, cfg.color, 0.88);
    pushColor(col, cfg.color, 0.88);
    pushColor(col, cfg.tip, 1.0);
    pushColor(col, cfg.tip, 1.0);
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
}

function discFan(buf, cfg) {
  const { pos, nrm, col, idx } = buf;
  const base = pos.length / 3;
  pos.push(0, cfg.y + cfg.dome, 0);
  nrm.push(0, 1, 0);
  pushColor(col, cfg.color, 1.15);
  for (let i = 0; i < cfg.segments; i++) {
    const a = (i / cfg.segments) * Math.PI * 2;
    pos.push(Math.cos(a) * cfg.radius, cfg.y, Math.sin(a) * cfg.radius);
    nrm.push(Math.cos(a) * 0.4, 0.92, Math.sin(a) * 0.4);
    pushColor(col, cfg.color, 0.82);
  }
  for (let i = 0; i < cfg.segments; i++) {
    idx.push(base, base + 1 + ((i + 1) % cfg.segments), base + 1 + i);
  }
}

function domeShell(buf, cfg) {
  const { pos, nrm, col, idx } = buf;
  const base = pos.length / 3;
  const rings = cfg.rings;
  const seg = cfg.segments;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const phi = t * Math.PI * 0.5;
    const rr = Math.cos(phi) * cfg.radius;
    const yy = cfg.y + Math.sin(phi) * cfg.height;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + t * 0.35;
      pos.push(Math.cos(a) * rr, yy, Math.sin(a) * rr);
      const nl = Math.hypot(Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8);
      nrm.push((Math.cos(a) * 0.8) / nl, 0.6 / nl, (Math.sin(a) * 0.8) / nl);
      const c = t < 0.5 ? cfg.color : cfg.tip;
      pushColor(col, c, 0.78 + t * 0.42);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < seg; i++) {
      const a0 = base + r * seg + i;
      const a1 = base + r * seg + ((i + 1) % seg);
      const b0 = a0 + seg;
      const b1 = a1 + seg;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
}

function bellShell(buf, cfg) {
  const { pos, nrm, col, idx } = buf;
  const base = pos.length / 3;
  pos.push(0, cfg.y + cfg.height, 0);
  nrm.push(0, 1, 0);
  pushColor(col, cfg.core, 0.9);
  for (let i = 0; i < cfg.segments; i++) {
    const a = (i / cfg.segments) * Math.PI * 2;
    pos.push(Math.cos(a) * cfg.radius, cfg.y, Math.sin(a) * cfg.radius);
    const nl = Math.hypot(Math.cos(a), 0.5, Math.sin(a));
    nrm.push(Math.cos(a) / nl, 0.5 / nl, Math.sin(a) / nl);
    pushColor(col, i % 2 === 0 ? cfg.color : cfg.tip, 1.0);
  }
  for (let i = 0; i < cfg.segments; i++) {
    idx.push(base, base + 1 + i, base + 1 + ((i + 1) % cfg.segments));
  }
}

function finalize(buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  g.setIndex(buf.idx);
  g.computeBoundingSphere();
  return g;
}

function newBuffer() {
  return { pos: [], nrm: [], col: [], idx: [] };
}

function daisyGeometry(species) {
  const c = species.colors;
  const petal = new THREE.Color(c.petal);
  const tip = new THREE.Color(c.tip);
  const core = new THREE.Color(c.core);
  const stem = new THREE.Color(c.stem);
  const buf = newBuffer();
  stemStrip(buf, 0, 0.70, 0.018, stem);
  stemStrip(buf, Math.PI * 0.5, 0.66, 0.016, stem);
  petalRing(buf, {
    count: species.petals,
    offset: 0.2,
    inner: 0.055,
    outer: 0.235,
    width: 0.105,
    y: 0.70,
    lift: 0.028,
    cup: 0.55,
    color: petal,
    tip,
  });
  discFan(buf, { y: 0.712, radius: 0.072, dome: 0.024, segments: 7, color: core });
  return finalize(buf);
}

function cloverGeometry(species) {
  const c = species.colors;
  const petal = new THREE.Color(c.petal);
  const tip = new THREE.Color(c.tip);
  const stem = new THREE.Color(c.stem);
  const buf = newBuffer();
  stemStrip(buf, 0, 0.62, 0.019, stem);
  stemStrip(buf, Math.PI * 0.5, 0.58, 0.017, stem);
  domeShell(buf, { y: 0.60, radius: 0.135, height: 0.185, rings: 3, segments: 7, color: petal, tip });
  return finalize(buf);
}

function bellGeometry(species) {
  const c = species.colors;
  const petal = new THREE.Color(c.petal);
  const tip = new THREE.Color(c.tip);
  const core = new THREE.Color(c.core);
  const stem = new THREE.Color(c.stem);
  const buf = newBuffer();
  stemStrip(buf, 0, 0.88, 0.015, stem);
  stemStrip(buf, Math.PI * 0.5, 0.84, 0.013, stem);
  bellShell(buf, { y: 0.615, height: 0.265, radius: 0.135, segments: species.petals, color: petal, tip, core });
  petalRing(buf, {
    count: species.petals,
    offset: 0.5,
    inner: 0.115,
    outer: 0.185,
    width: 0.085,
    y: 0.615,
    lift: -0.055,
    cup: -0.9,
    color: tip,
    tip: petal,
  });
  return finalize(buf);
}

const GEOMETRY_BUILDERS = {
  daisy: daisyGeometry,
  clover: cloverGeometry,
  bell: bellGeometry,
};

function flowerMaterial(uTime) {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    dithering: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWindStrength = { value: FLOWERS.windStrength };
    shader.uniforms.uWindSpeed = { value: FLOWERS.windSpeed };
    shader.uniforms.uSwayCurve = { value: FLOWERS.swayCurve };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uSwayCurve;`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 iOrigin = instanceMatrix[3].xyz;
#else
  vec3 iOrigin = vec3( 0.0 );
#endif
float phase = iOrigin.x * 0.21 + iOrigin.z * 0.17;
float gust = 0.65 + 0.35 * sin( uTime * uWindSpeed * 0.21 + iOrigin.x * 0.012 + iOrigin.z * 0.009 );
float sway = sin( uTime * uWindSpeed + phase ) * 0.62 + sin( uTime * uWindSpeed * 1.73 + phase * 1.9 ) * 0.38;
float bend = pow( max( transformed.y, 0.0 ), uSwayCurve ) * uWindStrength * gust;
transformed.x += sway * bend;
transformed.z += sway * bend * 0.45;`
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
normal = normalize( vec3( normal.x * 0.5, abs( normal.y ) * 0.35 + 0.86, normal.z * 0.5 ) );`
    );
  };
  mat.customProgramCacheKey = () => 'ht-flower';
  return mat;
}

export function createFlowers(scene, terrain) {
  const rand = rng(FLOWERS.seed);
  const uTime = { value: 0 };
  const getHeight = terrain && terrain.getHeight ? terrain.getHeight : () => 0;

  const table = FLOWER_SPECIES;
  const total = FLOWERS.count;

  const clusters = [];
  for (let i = 0; i < FLOWERS.clusterCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = FLOWERS.radius * Math.sqrt(rand());
    clusters.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      species: Math.floor(rand() * table.length),
    });
  }

  const speciesOf = new Uint8Array(total);
  let assigned = 0;
  for (let s = 0; s < table.length; s++) {
    const n = s === table.length - 1 ? total - assigned : Math.floor(total * table[s].share);
    for (let i = assigned; i < assigned + n; i++) speciesOf[i] = s;
    assigned += n;
  }

  const fx = new Float32Array(total);
  const fy = new Float32Array(total);
  const fz = new Float32Array(total);
  const yaw = new Float32Array(total);
  const scale = new Float32Array(total);
  const tint = new Float32Array(total);
  const cutoff = new Float32Array(total);
  const reserve = new Float32Array(total);
  const reserveMax = new Float32Array(total);
  const depletion = new Float32Array(total);
  const shown = new Float32Array(total);
  const idleTimer = new Float32Array(total);
  const local = new Uint16Array(total);

  const counts = new Uint16Array(table.length);
  const hiveClearSq = FLOWERS.hiveClearRadius * FLOWERS.hiveClearRadius;
  const clearSq = FLOWERS.clearRadius * FLOWERS.clearRadius;

  for (let i = 0; i < total; i++) {
    const s = speciesOf[i];
    let x = 0;
    let z = 0;
    let ok = false;
    for (let t = 0; t < FLOWERS.placementTries && !ok; t++) {
      if (rand() < FLOWERS.clusterShare) {
        let c = clusters[Math.floor(rand() * clusters.length)];
        for (let k = 0; k < 3 && c.species !== s; k++) c = clusters[Math.floor(rand() * clusters.length)];
        const ca = rand() * Math.PI * 2;
        const cr = FLOWERS.clusterRadius * Math.sqrt(rand());
        x = c.x + Math.cos(ca) * cr;
        z = c.z + Math.sin(ca) * cr;
      } else {
        const a = rand() * Math.PI * 2;
        const r = FLOWERS.radius * Math.sqrt(rand());
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      if (x * x + z * z < clearSq) continue;
      const dhx = x - HIVE.x;
      const dhz = z - HIVE.z;
      if (dhx * dhx + dhz * dhz < hiveClearSq) continue;
      const h = getHeight(x, z);
      const slope = Math.hypot(getHeight(x + 1.1, z) - h, getHeight(x, z + 1.1) - h) / 1.1;
      if (slope > FLOWERS.maxSlope) continue;
      ok = true;
    }

    fx[i] = x;
    fz[i] = z;
    fy[i] = getHeight(x, z) - FLOWERS.sink;
    yaw[i] = rand() * Math.PI * 2;
    scale[i] = table[s].scale * (1 + (rand() - 0.5) * 2 * FLOWERS.scaleVariance);
    tint[i] = 1 + (rand() - 0.5) * 2 * FLOWERS.tintVariance;
    cutoff[i] = FLOWERS.cullDistance * (1 - FLOWERS.cullJitter * rand());
    reserveMax[i] = table[s].reserve;
    reserve[i] = table[s].reserve * (0.72 + rand() * 0.28);
    depletion[i] = 1 - reserve[i] / reserveMax[i];
    shown[i] = -1;
    local[i] = counts[s];
    counts[s]++;
  }

  const groups = [];
  for (let s = 0; s < table.length; s++) {
    const species = table[s];
    const builder = GEOMETRY_BUILDERS[species.geometry] || daisyGeometry;
    const geometry = builder(species);
    const material = flowerMaterial(uTime);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, counts[s]));
    mesh.name = `flowers:${species.id}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    groups.push({
      species,
      mesh,
      count: counts[s],
      matrix: mesh.instanceMatrix.array,
      color: mesh.instanceColor.array,
      colorDirty: true,
    });
  }

  const spent = new THREE.Color(FLOWERS.spentColor);
  const cell = FLOWERS.gridCell;
  const grid = new Map();
  for (let i = 0; i < total; i++) {
    const key = `${Math.floor(fx[i] / cell)},${Math.floor(fz[i] / cell)}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  function writeColor(i) {
    const g = groups[speciesOf[i]];
    const o = local[i] * 3;
    const d = depletion[i] * FLOWERS.spentFade;
    const m = tint[i] * (1 - d * 0.34);
    g.color[o] = (1 + (spent.r - 1) * d) * m;
    g.color[o + 1] = (1 + (spent.g - 1) * d) * m;
    g.color[o + 2] = (1 + (spent.b - 1) * d) * m;
    g.colorDirty = true;
  }

  function writeMatrix(i, px, pz) {
    const g = groups[speciesOf[i]];
    const arr = g.matrix;
    const o = local[i] * 16;
    const wx = fx[i];
    const wz = fz[i];
    const dx = wx - px;
    const dz = wz - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const cut = cutoff[i];
    const vis = 1 - smoothstep(cut - FLOWERS.fadeSoftness, cut + FLOWERS.fadeSoftness, dist);

    if (vis <= 0.004) {
      for (let k = 0; k < 12; k++) arr[o + k] = 0;
      arr[o + 12] = wx;
      arr[o + 13] = fy[i];
      arr[o + 14] = wz;
      arr[o + 15] = 1;
      return;
    }

    const d = depletion[i];
    const far = smoothstep(FLOWERS.lodNear, FLOWERS.lodFar, dist);
    const s = scale[i] * vis;
    const sx = s * (1 - d * FLOWERS.curlAmount) * (1 + FLOWERS.farWidthBoost * far);
    const sy = s * (1 - d * FLOWERS.curlDroop);
    const a = yaw[i];
    const c = Math.cos(a) * sx;
    const n = Math.sin(a) * sx;
    arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -n; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = n; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
    arr[o + 12] = wx; arr[o + 13] = fy[i]; arr[o + 14] = wz; arr[o + 15] = 1;
  }

  for (let i = 0; i < total; i++) {
    writeMatrix(i, 0, 0);
    writeColor(i);
  }
  for (const g of groups) {
    g.mesh.instanceMatrix.needsUpdate = true;
    g.mesh.instanceColor.needsUpdate = true;
    g.colorDirty = false;
  }

  const handle = {
    index: -1,
    species: null,
    speciesId: '',
    position: new THREE.Vector3(),
    distance: 0,
    reserve: 0,
    reserveMax: 1,
    ratio: 0,
  };

  let cursor = 0;
  const last = new THREE.Vector3();

  function fillHandle(i, dist) {
    const s = speciesOf[i];
    handle.index = i;
    handle.species = table[s];
    handle.speciesId = table[s].id;
    handle.position.set(fx[i], fy[i] + 0.7 * scale[i], fz[i]);
    handle.distance = dist;
    handle.reserve = reserve[i];
    handle.reserveMax = reserveMax[i];
    handle.ratio = reserve[i] / reserveMax[i];
    return handle;
  }

  function sampleNearest(position, radius) {
    if (!position) return null;
    const r = radius || 1;
    const cx = Math.floor(position.x / cell);
    const cz = Math.floor(position.z / cell);
    const span = Math.ceil(r / cell);
    let best = -1;
    let bestSq = r * r;
    for (let j = -span; j <= span; j++) {
      for (let k = -span; k <= span; k++) {
        const bucket = grid.get(`${cx + k},${cz + j}`);
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const i = bucket[b];
          if (reserve[i] <= FLOWERS.reserveEpsilon) continue;
          const dx = fx[i] - position.x;
          const dy = fy[i] + 0.7 * scale[i] - position.y;
          const dz = fz[i] - position.z;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq < bestSq) {
            bestSq = dSq;
            best = i;
          }
        }
      }
    }
    if (best < 0) return null;
    return fillHandle(best, Math.sqrt(bestSq));
  }

  function drain(target, amount) {
    const i = typeof target === 'number' ? target : target && target.index;
    if (!(i >= 0) || !(amount > 0)) return null;
    const taken = Math.min(reserve[i], amount);
    if (taken <= 0) return null;
    const species = table[speciesOf[i]];
    reserve[i] -= taken;
    depletion[i] = 1 - reserve[i] / reserveMax[i];
    idleTimer[i] = 0;
    writeColor(i);
    writeMatrix(i, last.x, last.z);
    const g = groups[speciesOf[i]];
    g.mesh.instanceMatrix.needsUpdate = true;
    const share = taken / reserveMax[i];
    return {
      taken,
      pollen: species.pollen * share,
      nectar: species.nectar * share,
      resin: 0,
      speciesId: species.id,
    };
  }

  function update(dt, playerPosition) {
    uTime.value += dt;
    if (playerPosition) last.copy(playerPosition);
    const px = last.x;
    const pz = last.z;

    for (let i = 0; i < total; i++) {
      if (reserve[i] >= reserveMax[i]) continue;
      const species = table[speciesOf[i]];
      idleTimer[i] += dt;
      if (idleTimer[i] < species.regrowDelay) continue;
      reserve[i] = Math.min(reserveMax[i], reserve[i] + species.regrowth * dt);
      depletion[i] = 1 - reserve[i] / reserveMax[i];
      if (Math.abs(depletion[i] - shown[i]) > 0.01 || reserve[i] >= reserveMax[i]) {
        shown[i] = depletion[i];
        writeColor(i);
      }
    }

    const perFrame = Math.min(total, FLOWERS.updatePerFrame);
    for (let n = 0; n < perFrame; n++) {
      writeMatrix(cursor, px, pz);
      cursor = cursor + 1 === total ? 0 : cursor + 1;
    }

    for (const g of groups) {
      g.mesh.instanceMatrix.needsUpdate = true;
      if (g.colorDirty) {
        g.mesh.instanceColor.needsUpdate = true;
        g.colorDirty = false;
      }
    }
  }

  return {
    flowers: groups,
    species: table,
    count: total,
    update,
    sampleNearest,
    drain,
    reserveOf: (i) => reserve[i],
    dispose() {
      for (const g of groups) {
        g.mesh.geometry.dispose();
        g.mesh.material.dispose();
        scene.remove(g.mesh);
      }
    },
  };
}
