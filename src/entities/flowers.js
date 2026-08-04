// Hollowtree — instanced flower field: authored GLB per species, bee-scale placement, finite reserves, visible depletion and regrowth.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FLOWERS, FLOWER_SPECIES, HIVE } from '../config.js';

const loader = new GLTFLoader();

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

function newBuffer() {
  return { pos: [], nrm: [], col: [], idx: [] };
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

function PLACEHOLDER_ribbon(buf, x0, z0, y0, x1, z1, y1, w, tint) {
  const { pos, nrm, col, idx } = buf;
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI * 0.5;
    const cx = Math.cos(a) * w;
    const cz = Math.sin(a) * w;
    const base = pos.length / 3;
    pos.push(
      x0 - cx, y0, z0 - cz,
      x0 + cx, y0, z0 + cz,
      x1 - cx * 0.5, y1, z1 - cz * 0.5,
      x1 + cx * 0.5, y1, z1 + cz * 0.5
    );
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
    for (let i = 0; i < 4; i++) col.push(tint.r * (i < 2 ? 0.6 : 1), tint.g * (i < 2 ? 0.6 : 1), tint.b * (i < 2 ? 0.6 : 1));
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
}

function PLACEHOLDER_head(buf, cx, cz, y, radius, seg, petal, core) {
  const { pos, nrm, col, idx } = buf;
  const base = pos.length / 3;
  pos.push(cx, y + radius * 0.32, cz);
  nrm.push(0, 1, 0);
  col.push(core.r, core.g, core.b);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius);
    nrm.push(0, 1, 0);
    col.push(petal.r, petal.g, petal.b);
  }
  for (let i = 0; i < seg; i++) idx.push(base, base + 1 + ((i + 1) % seg), base + 1 + i);
}

function PLACEHOLDER_flowerGeometry(species) {
  const c = species.colors;
  const petal = new THREE.Color(c.petal);
  const core = new THREE.Color(c.core || c.tip);
  const stem = new THREE.Color(c.stem);
  const buf = newBuffer();
  const heads = Math.max(1, species.heads || 1);
  const h = species.height;
  const r = species.headRadius;
  PLACEHOLDER_ribbon(buf, 0, 0, 0, 0, 0, species.headHeight, h * 0.022, stem);
  PLACEHOLDER_head(buf, 0, 0, species.headHeight, r, 7, petal, core);
  for (let i = 1; i < heads; i++) {
    const a = (i / (heads - 1 || 1)) * Math.PI * 2 + 0.6;
    const sp = species.spread * (0.55 + 0.45 * ((i * 7) % 5) / 5);
    const hy = species.headHeight * (0.62 + 0.22 * ((i * 3) % 4) / 4);
    const bx = Math.cos(a) * sp;
    const bz = Math.sin(a) * sp;
    PLACEHOLDER_ribbon(buf, 0, 0, h * 0.24, bx, bz, hy, h * 0.016, stem);
    PLACEHOLDER_head(buf, bx, bz, hy, r * 0.78, 6, petal, core);
  }
  return finalize(buf);
}

function mergeModel(root) {
  root.updateMatrixWorld(true);
  const buf = newBuffer();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const c = new THREE.Color();
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const g = child.geometry;
    const p = g.attributes.position;
    if (!p) return;
    const base = buf.pos.length / 3;
    nm.getNormalMatrix(child.matrixWorld);
    const na = g.attributes.normal;
    const ca = g.attributes.color;
    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (mat && mat.color) c.copy(mat.color);
    else c.setRGB(1, 1, 1);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(child.matrixWorld);
      buf.pos.push(v.x, v.y, v.z);
      if (na) {
        n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        buf.nrm.push(n.x, n.y, n.z);
      } else buf.nrm.push(0, 1, 0);
      if (ca) buf.col.push(ca.getX(i) * c.r, ca.getY(i) * c.g, ca.getZ(i) * c.b);
      else buf.col.push(c.r, c.g, c.b);
    }
    if (g.index) {
      const ia = g.index;
      for (let i = 0; i < ia.count; i++) buf.idx.push(base + ia.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) buf.idx.push(base + i);
    }
  });
  if (!buf.pos.length) return null;
  return finalize(buf);
}

function findAnchor(root, name) {
  if (!name) return null;
  const want = name.toLowerCase();
  let found = null;
  root.traverse((child) => {
    if (found || !child.name) return;
    const n = child.name.toLowerCase();
    if (n === want || n.startsWith(`${want}_`) || n.startsWith(`${want}.`)) found = child;
  });
  return found;
}

async function fetchModel(file) {
  const url = new URL(`${FLOWERS.modelPath}${file}`, new URL('../../', import.meta.url)).href;
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    return null;
  }
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  const folder = url.slice(0, url.lastIndexOf('/') + 1);
  try {
    return await new Promise((res, rej) => loader.parse(buffer, folder, res, rej));
  } catch (error) {
    console.warn(`[flowers] failed to parse ${file} — ${error && error.message}`);
    return null;
  }
}

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
  const headOf = new Float32Array(table.length);
  for (let s = 0; s < table.length; s++) headOf[s] = table[s].headHeight;

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
    const geometry = PLACEHOLDER_flowerGeometry(species);
    const material = flowerMaterial(uTime);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, counts[s]));
    mesh.name = `flowers:${species.id}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = Boolean(FLOWERS.castShadow);
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
      authored: false,
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

  function headY(i) {
    return fy[i] + headOf[speciesOf[i]] * scale[i] * (1 - depletion[i] * FLOWERS.curlDroop);
  }

  function fillHandle(i, dist) {
    const s = speciesOf[i];
    handle.index = i;
    handle.species = table[s];
    handle.speciesId = table[s].id;
    handle.position.set(fx[i], headY(i), fz[i]);
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
          const dy = headY(i) - position.y;
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

  function adopt(s, gltf) {
    const species = table[s];
    const root = gltf.scene || gltf.scenes[0];
    if (!root) return;
    const anchor = findAnchor(root, species.headAnchor);
    let anchorY = null;
    if (anchor) {
      root.updateMatrixWorld(true);
      anchorY = anchor.getWorldPosition(new THREE.Vector3()).y;
    }
    const geometry = mergeModel(root);
    if (!geometry) return;
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const raw = bb.max.y - bb.min.y;
    const k = raw > 1e-4 ? species.height / raw : 1;
    geometry.translate(0, -bb.min.y, 0);
    geometry.scale(k, k, k);
    geometry.computeBoundingSphere();
    headOf[s] = anchorY !== null ? (anchorY - bb.min.y) * k : species.headHeight;
    const g = groups[s];
    g.mesh.geometry.dispose();
    g.mesh.geometry = geometry;
    g.authored = true;
  }

  (async () => {
    for (let s = 0; s < table.length; s++) {
      const file = table[s].model;
      if (!file) continue;
      const gltf = await fetchModel(file);
      if (!gltf) {
        console.warn(`[flowers] ${file} not found — placeholder stand-in for "${table[s].id}"`);
        continue;
      }
      try {
        adopt(s, gltf);
      } catch (error) {
        console.warn(`[flowers] could not adopt ${file} — ${error && error.message}`);
      }
    }
  })();

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
    headHeightOf: (s) => headOf[s],
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
