// Hollowtree — instanced grass field with vertex-shader wind, toroidal recycling around the player, plus stone/tuft clutter.

import * as THREE from 'three';
import { CLUTTER, GRASS, GRASS_DETAIL, PALETTE } from '../config.js';

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

function bladeGeometry() {
  const W = GRASS_DETAIL.bladeWidth;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([
    -W, 0, 0,
    W, 0, 0,
    -W * 0.62, 0.55, 0.06,
    W * 0.62, 0.55, 0.06,
    0, 1, 0.2,
  ]);
  const nrm = new Float32Array(15);
  for (let i = 0; i < 5; i++) {
    nrm[i * 3] = 0;
    nrm[i * 3 + 1] = 0.86;
    nrm[i * 3 + 2] = 0.51;
  }
  const r = GRASS_DETAIL.rootShade;
  const m = GRASS_DETAIL.midShade;
  const t = GRASS_DETAIL.tipShade;
  const col = new Float32Array([r, r, r, r, r, r, m, m, m, m, m, m, t, t, t]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  return g;
}

function tuftGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.4;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const w = 0.13;
    const px = -cz * w;
    const pz = cx * w;
    const base = b * 4;
    pos.push(-px, 0, -pz, px, 0, pz, -px * 0.5 + cx * 0.35, 0.85, -pz * 0.5 + cz * 0.35, px * 0.5 + cx * 0.35, 0.85, pz * 0.5 + cz * 0.35);
    for (let v = 0; v < 4; v++) nrm.push(0, 0.9, 0.44);
    col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1);
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function stoneGeometry(rand) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  const j = CLUTTER.stoneJitter;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      p.getX(i) * (1 + (rand() - 0.5) * j),
      p.getY(i) * (1 + (rand() - 0.5) * j) * 0.72,
      p.getZ(i) * (1 + (rand() - 0.5) * j)
    );
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function windMaterial(color, strength, speed, uTime, key) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    vertexColors: true,
    side: THREE.DoubleSide,
    dithering: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWindStrength = { value: strength };
    shader.uniforms.uWindSpeed = { value: speed };
    shader.uniforms.uFieldColor = { value: new THREE.Color(PALETTE.ground).multiplyScalar(GRASS_DETAIL.mergeTint) };
    shader.uniforms.uMergeNear = { value: GRASS_DETAIL.mergeNear };
    shader.uniforms.uMergeFar = { value: GRASS_DETAIL.mergeFar };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform vec3 uFieldColor;
uniform float uMergeNear;
uniform float uMergeFar;
float htHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float htNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( htHash( i ), htHash( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( htHash( i + vec2( 0.0, 1.0 ) ), htHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 iOrigin = instanceMatrix[3].xyz;
#else
  vec3 iOrigin = vec3( 0.0 );
#endif
transformed.y *= 0.72 + 0.56 * htNoise( iOrigin.xz * 0.34 );
float phase = iOrigin.x * 0.21 + iOrigin.z * 0.17;
float gust = 0.65 + 0.35 * sin( uTime * uWindSpeed * 0.21 + iOrigin.x * 0.012 + iOrigin.z * 0.009 );
float sway = sin( uTime * uWindSpeed + phase ) * 0.62 + sin( uTime * uWindSpeed * 1.73 + phase * 1.9 ) * 0.38;
float bend = transformed.y * transformed.y * uWindStrength * gust;
transformed.x += sway * bend;
transformed.z += sway * bend * 0.45;
#ifdef USE_COLOR
  float htP = htNoise( iOrigin.xz * 0.042 ) * 0.62 + htNoise( iOrigin.xz * 0.011 ) * 0.38;
  vColor.rgb *= mix( vec3( 0.78, 0.98, 0.72 ), vec3( 1.2, 1.06, 0.66 ), smoothstep( 0.34, 0.72, htP ) );
  vColor.rgb = mix( vColor.rgb, uFieldColor, smoothstep( uMergeNear, uMergeFar, distance( iOrigin, cameraPosition ) ) );
#endif`
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
normal = normalize( vec3( normal.x * 0.32, abs( normal.y ) * 0.2 + 0.94, normal.z * 0.32 ) );`
    );
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function createGrass(scene, terrain) {
  const rand = rng(90210);
  const uTime = { value: 0 };
  const count = GRASS.count;

  const baseX = new Float32Array(count);
  const baseZ = new Float32Array(count);
  const yaw = new Float32Array(count);
  const hVar = new Float32Array(count);
  const cutoff = new Float32Array(count);
  const tier = new Uint8Array(count);

  const tiers = GRASS_DETAIL.tiers;
  const tileOf = new Float32Array(tiers.length);
  const fadeA = new Float32Array(tiers.length);
  const fadeB = new Float32Array(tiers.length);
  const radialOf = new Uint8Array(tiers.length);
  let cut = 0;
  for (let t = 0; t < tiers.length; t++) {
    tileOf[t] = tiers[t].tile;
    fadeA[t] = tiers[t].fadeStart;
    fadeB[t] = tiers[t].fadeEnd;
    radialOf[t] = tiers[t].radial ? 1 : 0;
    const n = t === tiers.length - 1 ? count - cut : Math.floor(count * tiers[t].share);
    for (let i = cut; i < cut + n; i++) tier[i] = t;
    cut += n;
  }

  for (let i = 0; i < count; i++) {
    const t = tier[i];
    const P = tileOf[t];
    baseX[i] = (rand() - 0.5) * P;
    baseZ[i] = (rand() - 0.5) * P;
    yaw[i] = rand() * Math.PI * 2;
    hVar[i] = 1 + (rand() - 0.5) * 2 * GRASS_DETAIL.heightVariance;
    cutoff[i] = fadeA[t] + (fadeB[t] - fadeA[t]) * Math.pow(rand(), 0.7);
  }

  const geo = bladeGeometry();
  const mat = windMaterial(0xffffff, GRASS.windStrength, GRASS.windSpeed, uTime, 'ht-blade');
  const grass = new THREE.InstancedMesh(geo, mat, count);
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.frustumCulled = false;
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.matrixAutoUpdate = false;

  const lushC = new THREE.Color(GRASS_DETAIL.colorLush);
  const dryC = new THREE.Color(GRASS_DETAIL.colorDry);
  const tmpC = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = rand();
    tmpC.copy(lushC).lerp(dryC, t * t * GRASS_DETAIL.dryMix);
    const v = 1 + (rand() - 0.5) * 2 * GRASS_DETAIL.tintVariance;
    grass.setColorAt(i, tmpC.multiplyScalar(v));
  }
  grass.instanceColor.needsUpdate = true;
  scene.add(grass);

  const stoneMat = new THREE.MeshLambertMaterial({ color: CLUTTER.stoneColor, flatShading: true, dithering: true });
  const stones = new THREE.InstancedMesh(stoneGeometry(rand), stoneMat, CLUTTER.stoneCount);
  stones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stones.frustumCulled = false;
  stones.castShadow = true;
  stones.receiveShadow = true;
  stones.matrixAutoUpdate = false;
  scene.add(stones);

  const tuftMat = windMaterial(CLUTTER.tuftColor, GRASS.windStrength * 0.7, GRASS.windSpeed * 0.85, uTime, 'ht-tuft');
  const tufts = new THREE.InstancedMesh(tuftGeometry(), tuftMat, CLUTTER.tuftCount);
  tufts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tufts.frustumCulled = false;
  tufts.castShadow = false;
  tufts.receiveShadow = true;
  tufts.matrixAutoUpdate = false;
  scene.add(tufts);

  const clutter = [];
  for (const [mesh, n, radius, scale, seed] of [
    [stones, CLUTTER.stoneCount, CLUTTER.stoneRadius, CLUTTER.stoneScale, 4711],
    [tufts, CLUTTER.tuftCount, CLUTTER.tuftRadius, CLUTTER.tuftScale, 8123],
  ]) {
    const cr = rng(seed);
    const bx = new Float32Array(n);
    const bz = new Float32Array(n);
    const cy = new Float32Array(n);
    const cs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = cr() * Math.PI * 2;
      const r = radius * Math.sqrt(cr());
      bx[i] = Math.cos(a) * r;
      bz[i] = Math.sin(a) * r;
      cy[i] = cr() * Math.PI * 2;
      cs[i] = scale * (0.6 + cr() * 0.9);
    }
    clutter.push({ mesh, n, radius, bx, bz, cy, cs });
  }

  const getHeight = terrain.getHeight;
  const arr = grass.instanceMatrix.array;
  const perFrame = Math.min(count, GRASS_DETAIL.updatePerFrame);
  const lodNear = GRASS.lodNear;
  const lodFar = GRASS.lodFar;
  const bladeH = GRASS.bladeHeight;
  let cursor = 0;
  let frame = 0;
  const px0 = new THREE.Vector3();

  function writeBlade(i, px, pz) {
    const t = tier[i];
    const P = tileOf[t];
    const bx = baseX[i];
    const bz = baseZ[i];
    const wx = bx + P * Math.round((px - bx) / P);
    const wz = bz + P * Math.round((pz - bz) / P);
    const dx = wx - px;
    const dz = wz - pz;
    const dist = radialOf[t]
      ? Math.sqrt(dx * dx + dz * dz)
      : Math.max(Math.abs(dx), Math.abs(dz));

    const o = i * 16;
    let sy = 0;
    let sx = 0;
    let y = 0;

    const cut = cutoff[i];
    const vis = 1 - smoothstep(cut - GRASS_DETAIL.fadeSoftness, cut + GRASS_DETAIL.fadeSoftness, dist);
    if (vis > 0.002) {
      const h = getHeight(wx, wz);
      const hx = getHeight(wx + 1.1, wz);
      const hz = getHeight(wx, wz + 1.1);
      const slope = Math.hypot(hx - h, hz - h) / 1.1;
      if (slope < GRASS_DETAIL.maxSlope) {
        const far = smoothstep(lodNear, lodFar, Math.sqrt(dx * dx + dz * dz));
        sy = bladeH * hVar[i] * vis;
        sx = (1 + GRASS_DETAIL.farWidthBoost * far) * (0.45 + 0.55 * vis);
        y = h - GRASS_DETAIL.sink;
      }
    }

    if (sy === 0) {
      arr[o] = 0; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = 0; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = 0; arr[o + 11] = 0;
      arr[o + 12] = wx; arr[o + 13] = 0; arr[o + 14] = wz; arr[o + 15] = 1;
      return;
    }

    const a = yaw[i];
    const c = Math.cos(a);
    const s = Math.sin(a);
    arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = s * sx; arr[o + 9] = 0; arr[o + 10] = c * sx; arr[o + 11] = 0;
    arr[o + 12] = wx; arr[o + 13] = y; arr[o + 14] = wz; arr[o + 15] = 1;
  }

  function refreshAll(px, pz) {
    for (let i = 0; i < count; i++) writeBlade(i, px, pz);
    grass.instanceMatrix.needsUpdate = true;
  }

  function updateClutter(px, pz) {
    for (const c of clutter) {
      const a = c.mesh.instanceMatrix.array;
      const dd = c.radius * 2;
      for (let i = 0; i < c.n; i++) {
        const bx = c.bx[i];
        const bz = c.bz[i];
        const wx = bx + dd * Math.round((px - bx) / dd);
        const wz = bz + dd * Math.round((pz - bz) / dd);
        const dx = wx - px;
        const dz = wz - pz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const o = i * 16;
        const fade = Math.min(1, Math.max(0, (c.radius - dist) / 16));
        const sc = c.cs[i] * fade;
        const ang = c.cy[i];
        const cc = Math.cos(ang) * sc;
        const ss = Math.sin(ang) * sc;
        a[o] = cc; a[o + 1] = 0; a[o + 2] = -ss; a[o + 3] = 0;
        a[o + 4] = 0; a[o + 5] = sc; a[o + 6] = 0; a[o + 7] = 0;
        a[o + 8] = ss; a[o + 9] = 0; a[o + 10] = cc; a[o + 11] = 0;
        a[o + 12] = wx; a[o + 13] = getHeight(wx, wz) - sc * 0.28; a[o + 14] = wz; a[o + 15] = 1;
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  refreshAll(0, 0);
  updateClutter(0, 0);

  return {
    grass,
    stones,
    tufts,
    update(dt, playerPosition) {
      uTime.value += dt;
      const p = playerPosition || px0;
      const px = p.x;
      const pz = p.z;

      const end = cursor + perFrame;
      const stop = Math.min(count, end);
      for (let i = cursor; i < stop; i++) writeBlade(i, px, pz);
      let wrapped = 0;
      if (end > count) {
        wrapped = end - count;
        for (let i = 0; i < wrapped; i++) writeBlade(i, px, pz);
      }
      const attr = grass.instanceMatrix;
      if (attr.clearUpdateRanges && wrapped === 0) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(cursor * 16, (stop - cursor) * 16);
      } else if (attr.clearUpdateRanges) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, count * 16);
      }
      attr.needsUpdate = true;
      cursor = wrapped > 0 ? wrapped : (stop === count ? 0 : stop);

      if (frame % CLUTTER.updateInterval === 0) updateClutter(px, pz);
      frame++;
    },
    dispose() {
      grass.geometry.dispose();
      grass.material.dispose();
      stones.geometry.dispose();
      stones.material.dispose();
      tufts.geometry.dispose();
      tufts.material.dispose();
      scene.remove(grass, stones, tufts);
    },
  };
}
