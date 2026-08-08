// Hollowtree — procedural rolling meadow: heightfield, exact bilinear sampling, baked AO vertex colours.

import * as THREE from 'three';
import { PALETTE, TERRAIN, WORLD } from '../config.js';

function hash2(ix, iy, seed) {
  let h = (ix * 374761393) ^ (iy * 668265263) ^ (seed * 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}

function fbm(x, y, seed, octaves) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy, seed + i * 131) * amp;
    norm += amp;
    amp *= TERRAIN.gain;
    fx *= TERRAIN.lacunarity;
    fy *= TERRAIN.lacunarity;
  }
  return sum / norm;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createTerrain(scene) {
  const size = WORLD.size;
  const seg = WORLD.segments;
  const N = seg + 1;
  const half = size * 0.5;
  const step = size / seg;

  const height = new Float32Array(N * N);
  const s = TERRAIN.noiseScale;
  const ws = TERRAIN.warpScale;
  const seed = TERRAIN.seed;

  for (let j = 0; j < N; j++) {
    const z = -half + j * step;
    for (let i = 0; i < N; i++) {
      const x = -half + i * step;
      const wx = x + (fbm(x * ws, z * ws, seed + 811, 3) - 0.5) * TERRAIN.warpStrength;
      const wz = z + (fbm(x * ws + 17.3, z * ws - 9.1, seed + 977, 3) - 0.5) * TERRAIN.warpStrength;
      const base = fbm(wx * s, wz * s, seed, TERRAIN.octaves) - 0.5;
      const ridge = 1 - Math.abs(2 * fbm(wx * s * 2.7, wz * s * 2.7, seed + 71, 3) - 1) - 0.5;
      const mid = fbm(wx * s * 6.4, wz * s * 6.4, seed + 207, 3) - 0.5;
      let h = (base * TERRAIN.ampBase + ridge * TERRAIN.ampRidge + mid * TERRAIN.ampMid) * WORLD.hillHeight;
      const d = Math.sqrt(x * x + z * z);
      const k = smoothstep(TERRAIN.clearingRadius, TERRAIN.clearingRadius + TERRAIN.clearingFalloff, d);
      h *= k;
      height[j * N + i] = h;
    }
  }

  const blur = new Float32Array(N * N);
  const tmp = new Float32Array(N * N);
  const br = TERRAIN.aoBlurRadius;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -br; k <= br; k++) {
        const ii = Math.min(N - 1, Math.max(0, i + k));
        sum += height[j * N + ii];
        n++;
      }
      tmp[j * N + i] = sum / n;
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -br; k <= br; k++) {
        const jj = Math.min(N - 1, Math.max(0, j + k));
        sum += tmp[jj * N + i];
        n++;
      }
      blur[j * N + i] = sum / n;
    }
  }

  const positions = new Float32Array(N * N * 3);
  const normals = new Float32Array(N * N * 3);
  const colors = new Float32Array(N * N * 3);
  const uvs = new Float32Array(N * N * 2);

  const lush = new THREE.Color(PALETTE.ground);
  const dry = new THREE.Color(PALETTE.groundDry);
  const c = new THREE.Color();
  const inv2 = 1 / (2 * step);

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const x = -half + i * step;
      const z = -half + j * step;
      const h = height[idx];

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = h;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = i / seg;
      uvs[idx * 2 + 1] = j / seg;

      const il = Math.max(0, i - 1);
      const ir = Math.min(N - 1, i + 1);
      const jd = Math.max(0, j - 1);
      const ju = Math.min(N - 1, j + 1);
      const dhx = (height[j * N + ir] - height[j * N + il]) * inv2 * (ir - il === 2 ? 1 : 2);
      const dhz = (height[ju * N + i] - height[jd * N + i]) * inv2 * (ju - jd === 2 ? 1 : 2);
      const nx = -dhx;
      const nz = -dhz;
      const len = Math.hypot(nx, 1, nz);
      normals[idx * 3] = nx / len;
      normals[idx * 3 + 1] = 1 / len;
      normals[idx * 3 + 2] = nz / len;

      const slope = Math.hypot(dhx, dhz);
      const ao = 1 - TERRAIN.aoStrength * smoothstep(0, TERRAIN.aoRange, blur[idx] - h);
      const crest = smoothstep(0, TERRAIN.aoRange, h - blur[idx]);
      const shade = 1 - TERRAIN.slopeShade * smoothstep(0.1, 0.9, slope);
      const patch = fbm(x * TERRAIN.patchScale, z * TERRAIN.patchScale, seed + 901, 3);
      let dryness = smoothstep(TERRAIN.patchLow, TERRAIN.patchHigh, patch) * TERRAIN.patchDryness
        + smoothstep(0.05, 0.9, slope * TERRAIN.slopeDryness) * 0.45
        + crest * TERRAIN.heightDryness;
      dryness = Math.min(1, Math.max(0, dryness));
      c.copy(lush).lerp(dry, dryness);
      const tint = 1 + (fbm(x * TERRAIN.tintScale, z * TERRAIN.tintScale, seed + 55, 2) - 0.5) * 2 * TERRAIN.tintStrength;
      const m = ao * shade * tint * (1 + crest * TERRAIN.sunTerrainTint);
      colors[idx * 3] = c.r * m;
      colors[idx * 3 + 1] = c.g * m;
      colors[idx * 3 + 2] = c.b * m;
    }
  }

  const indices = new (N * N > 65535 ? Uint32Array : Uint16Array)(seg * seg * 6);
  let p = 0;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * N + i;
      const b = a + 1;
      const cc = a + N;
      const d = cc + 1;
      indices[p++] = a;
      indices[p++] = cc;
      indices[p++] = b;
      indices[p++] = b;
      indices[p++] = cc;
      indices[p++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    dithering: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'meadow';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);

  function getHeight(x, z) {
    const fx = (x + half) / step;
    const fz = (z + half) / step;
    if (fx <= 0 || fz <= 0 || fx >= seg || fz >= seg) {
      const ci = Math.min(N - 1, Math.max(0, Math.round(fx)));
      const cj = Math.min(N - 1, Math.max(0, Math.round(fz)));
      return height[cj * N + ci];
    }
    const i0 = fx | 0;
    const j0 = fz | 0;
    const tx = fx - i0;
    const tz = fz - j0;
    const r0 = j0 * N + i0;
    const r1 = r0 + N;
    const h00 = height[r0];
    const h10 = height[r0 + 1];
    const h01 = height[r1];
    const h11 = height[r1 + 1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  return {
    mesh,
    getHeight,
    colliders: [],
    size,
    heightField: height,
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(mesh);
    },
  };
}
