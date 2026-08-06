// Hollowtree — deterministic weather: seeded schedule, light and palette grading, wind, camera-following rain, ground splashes, low fog and lightning.

import * as THREE from 'three';
import { WEATHER, WEATHER_PRESETS } from '../config.weather.js';

const LOOK_KEYS = [
  'sunMul', 'sunTintAmount', 'ambientMul', 'hemiMul', 'fogMul', 'fogTintAmount',
  'skyTintAmount', 'glowMul', 'gradeMix', 'wetness', 'rain', 'groundFog',
  'windScale', 'lightning',
];
const COLOR_KEYS = ['sunTint', 'fogTint', 'skyTint', 'gradeTint'];

function hash11(n) {
  let s = Math.imul(n ^ 0x9e3779b9, 2246822519) >>> 0;
  s ^= s >>> 15;
  s = Math.imul(s ^ (s >>> 12), 2654435761) >>> 0;
  s ^= s >>> 16;
  return (s >>> 8) / 16777216;
}

function hash21(a, b) {
  return hash11((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) | 0);
}

function smoothstep01(x) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function makeLook() {
  const look = {};
  for (const k of LOOK_KEYS) look[k] = 0;
  for (const k of COLOR_KEYS) look[k] = new THREE.Color(1, 1, 1);
  return look;
}

function copyLook(dst, src) {
  for (const k of LOOK_KEYS) dst[k] = src[k];
  for (const k of COLOR_KEYS) dst[k].copy(src[k]);
  return dst;
}

function presetLook(dst, name) {
  const p = WEATHER_PRESETS[name] || WEATHER_PRESETS.clear;
  for (const k of LOOK_KEYS) dst[k] = p[k];
  for (const k of COLOR_KEYS) dst[k].set(p[k]);
  return dst;
}

function mixLook(dst, a, b, t) {
  for (const k of LOOK_KEYS) dst[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of COLOR_KEYS) dst[k].copy(a[k]).lerp(b[k], t);
  return dst;
}

const RAIN_VERT = `
attribute vec4 aSeed;
uniform vec3 uBox;
uniform vec3 uOrigin;
uniform vec3 uOffset;
uniform vec3 uDir;
uniform float uLen;
uniform float uWidth;
uniform float uNearFade;
uniform float uEdge;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float vary = 0.75 + 0.5 * aSeed.w;
  vec3 p = aSeed.xyz * uBox + uOffset * vary;
  vec3 rel = mod(p - uOrigin + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 world = uOrigin + rel;
  vec3 toCam = world - cameraPosition;
  float dist = length(toCam);
  vec3 side = normalize(cross(uDir, toCam / max(dist, 0.0001)));
  world += side * (position.x * uWidth) - uDir * (position.y * uLen * vary);
  vec2 rxz = rel.xz / (uBox.xz * 0.5);
  float edge = 1.0 - smoothstep(1.0 - uEdge, 1.0, max(abs(rxz.x), abs(rxz.y)));
  vAlpha = edge * smoothstep(0.0, uNearFade, dist);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const RAIN_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float a = vAlpha * uOpacity * (0.18 + 0.82 * (1.0 - vUv.y));
  a *= smoothstep(0.0, 0.5, 1.0 - abs(vUv.x - 0.5) * 2.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const SPLASH_VERT = `
attribute vec3 aPos;
attribute vec2 aLife;
uniform float uTime;
uniform float uLife;
uniform float uSize;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float phase = (uTime - aLife.x) / uLife;
  if (phase < 0.0 || phase > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0);
    vAlpha = 0.0;
    return;
  }
  float scale = uSize * (0.3 + 1.1 * phase) * (0.6 + 0.8 * aLife.y);
  vec3 world = aPos + vec3(position.x * scale, 0.0, position.y * scale);
  vUv = uv;
  vAlpha = 1.0 - phase;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SPLASH_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.42, 0.78, d) * (1.0 - smoothstep(0.86, 1.0, d));
  float a = ring * vAlpha * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const FOG_VERT = `
attribute float aLayer;
uniform vec3 uCenter;
uniform float uSize;
uniform float uSpacing;
uniform float uBase;
varying vec3 vWorld;
varying float vLayer;
void main() {
  vec3 world = vec3(
    position.x * uSize + uCenter.x,
    uBase + aLayer * uSpacing,
    position.y * uSize + uCenter.z
  );
  vWorld = world;
  vLayer = aLayer;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FOG_FRAG = `
uniform vec3 uColor;
uniform float uAmount;
uniform float uDensity;
uniform float uNoiseA;
uniform float uNoiseB;
uniform vec2 uDrift;
uniform float uEdge;
uniform float uSize;
uniform float uThickness;
uniform vec3 uCenter;
varying vec3 vWorld;
varying float vLayer;
float wHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x),
             mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 q = vWorld.xz + uDrift;
  float n = wNoise(q * uNoiseA) * 0.68 + wNoise(q * uNoiseB) * 0.32;
  n = smoothstep(0.24, 0.86, n);
  float radial = 1.0 - smoothstep(1.0 - uEdge, 1.0, length(vWorld.xz - uCenter.xz) / uSize);
  float high = 1.0 - smoothstep(0.0, uThickness, vWorld.y - uCenter.y);
  float a = uAmount * uDensity * n * radial * (0.45 + 0.55 * high);
  float above = 1.0 - smoothstep(0.0, 2.2, cameraPosition.y - vWorld.y);
  a *= mix(0.55, 1.0, above);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

function quadGeometry(instanced, centered) {
  const g = instanced ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  const a = centered ? -0.5 : 0.0;
  const b = centered ? 0.5 : 1.0;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, a, 0, 0.5, a, 0, -0.5, b, 0, 0.5, b, 0,
  ]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}

export function createWeather(scene, camera, terrain, sky, options = {}) {
  const grass = options.grass || null;
  const post = options.post || null;
  const quality = { id: options.quality || WEATHER.quality };
  // World time. Defaults to this machine's clock so the module still stands alone,
  // but a session passes the server-corrected clock: the schedule is a pure function
  // of time, so a client whose clock is minutes off would otherwise sit in a
  // different storm from everyone else.
  const now = typeof options.now === 'function' ? options.now : Date.now;

  const sun = sky && sky.sun ? sky.sun : null;
  const hemi = sky && sky.hemi ? sky.hemi : null;
  const ambient = sky && sky.ambient ? sky.ambient : null;
  const domeUniforms = sky && sky.dome && sky.dome.material ? sky.dome.material.uniforms : null;
  const fog = scene.fog || null;
  const getHeight = terrain && typeof terrain.getHeight === 'function' ? terrain.getHeight : () => 0;

  const state = {
    kind: 'clear',
    intensity: 0,
    wetness: 0,
    wind: { dirX: 1, dirZ: 0, strength: 0 },
    lightning: 0,
  };

  const schedule = {
    seed: WEATHER.seed,
    startedAt: now(),
    durationMs: WEATHER.phaseMinutes * 60000,
    transitionMs: WEATHER.transitionSeconds * 1000,
    kind: 'clear',
    intensity: 1,
  };

  const kinds = WEATHER.kinds;
  const weights = new Float32Array(kinds.length);
  let weightSum = 0;
  for (let i = 0; i < kinds.length; i++) {
    weights[i] = WEATHER.chainWeights[kinds[i]] || 0.1;
    weightSum += weights[i];
  }

  let cacheIndex = -1;
  let cacheKind = 'clear';
  function kindAtCache(index) {
    if (index <= 0) return schedule.kind;
    if (index === cacheIndex) return cacheKind;
    let r = hash21(schedule.seed, index * 7 + 1) * weightSum;
    for (let i = 0; i < kinds.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        cacheIndex = index;
        cacheKind = kinds[i];
        return cacheKind;
      }
    }
    cacheIndex = index;
    cacheKind = kinds[kinds.length - 1];
    return cacheKind;
  }

  function intensityAt(index) {
    if (index <= 0) return schedule.intensity;
    const h = hash21(schedule.seed, index * 31 + 3);
    return WEATHER.intensityMin + (WEATHER.intensityMax - WEATHER.intensityMin) * h;
  }

  const scheduled = { prevKind: 'clear', nextKind: 'clear', blend: 1, intensity: 1, index: 0, phaseStart: 0 };

  function scheduleInto(out, nowMs) {
    const rel = nowMs - schedule.startedAt;
    const index = Math.floor(rel / schedule.durationMs);
    const local = rel - index * schedule.durationMs;
    const blend = smoothstep01(local / schedule.transitionMs);
    out.index = index;
    out.phaseStart = schedule.startedAt + index * schedule.durationMs;
    out.prevKind = kindAtCache(index - 1);
    out.nextKind = kindAtCache(index);
    out.blend = blend;
    out.intensity = intensityAt(index - 1) + (intensityAt(index) - intensityAt(index - 1)) * blend;
    return out;
  }

  const lookPrev = makeLook();
  const lookNext = makeLook();
  const lookScheduled = makeLook();
  const lookFrom = makeLook();
  const look = makeLook();
  let overrideBlend = 1;
  let overrideStart = 0;

  function lookAt(out, nowMs) {
    scheduleInto(scheduled, nowMs);
    presetLook(lookPrev, scheduled.prevKind);
    presetLook(lookNext, scheduled.nextKind);
    mixLook(out, lookPrev, lookNext, scheduled.blend);
    return out;
  }

  const listeners = [];
  const strikeListeners = [];

  function setFromWorld(payload) {
    if (!payload) return;
    copyLook(lookFrom, look);
    overrideBlend = 0;
    overrideStart = now();
    if (typeof payload.seed === 'number') schedule.seed = payload.seed | 0;
    if (typeof payload.startedAt === 'number') schedule.startedAt = payload.startedAt;
    if (typeof payload.durationMs === 'number' && payload.durationMs > 1000) schedule.durationMs = payload.durationMs;
    if (typeof payload.transitionMs === 'number' && payload.transitionMs > 0) schedule.transitionMs = payload.transitionMs;
    if (typeof payload.kind === 'string' && WEATHER_PRESETS[payload.kind]) schedule.kind = payload.kind;
    if (typeof payload.intensity === 'number') schedule.intensity = THREE.MathUtils.clamp(payload.intensity, 0, 1);
    cacheIndex = -1;
    if (schedule.transitionMs > schedule.durationMs) schedule.transitionMs = schedule.durationMs * 0.5;
  }

  function windAngle(nowMs, index, blend) {
    const seconds = nowMs * 0.001;
    const a = hash21(schedule.seed, index * 5 + 11) * Math.PI * 2;
    const b = hash21(schedule.seed, (index - 1) * 5 + 11) * Math.PI * 2;
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const base = b + d * blend;
    const swirl = Math.sin(seconds * WEATHER.wind.swirlFreq) * WEATHER.wind.swirlAmount;
    return base + swirl + seconds * WEATHER.wind.directionDrift;
  }

  function gustAt(nowMs) {
    const s = nowMs * 0.001;
    const g1 = Math.sin(s * Math.PI * 2 * WEATHER.wind.gustFreq);
    const g2 = Math.sin(s * Math.PI * 2 * WEATHER.wind.gustFreq2 + 1.7);
    return 0.5 + 0.32 * g1 + 0.18 * g2;
  }

  function sample(nowMs) {
    const t = typeof nowMs === 'number' ? nowMs : now();
    const s = scheduleInto({ prevKind: '', nextKind: '', blend: 0, intensity: 0, index: 0, phaseStart: 0 }, t);
    const l = mixLook(makeLook(), presetLook(makeLook(), s.prevKind), presetLook(makeLook(), s.nextKind), s.blend);
    const kind = s.blend < 0.5 ? s.prevKind : s.nextKind;
    const angle = windAngle(t, s.index, s.blend);
    const strength = (WEATHER.wind.baseSpeed + WEATHER.wind.gustSpeed * gustAt(t)) * l.windScale * s.intensity;
    return {
      kind,
      intensity: s.intensity,
      wetness: l.wetness * s.intensity,
      wind: { dirX: Math.cos(angle), dirZ: Math.sin(angle), strength },
      lightning: l.lightning,
      blend: s.blend,
      prevKind: s.prevKind,
      nextKind: s.nextKind,
      phaseIndex: s.index,
    };
  }

  const baseline = {
    sunIntensity: sun ? sun.intensity : 0,
    sunColor: sun ? sun.color.clone() : new THREE.Color(),
    ambientIntensity: ambient ? ambient.intensity : 0,
    hemiIntensity: hemi ? hemi.intensity : 0,
    hemiColor: hemi ? hemi.color.clone() : new THREE.Color(),
    fogDensity: fog && fog.isFogExp2 ? fog.density : 0,
    fogNear: fog && !fog.isFogExp2 ? fog.near : 0,
    fogFar: fog && !fog.isFogExp2 ? fog.far : 0,
    fogColor: fog ? fog.color.clone() : new THREE.Color(),
    domeTop: domeUniforms ? domeUniforms.uTop.value.clone() : new THREE.Color(),
    domeHorizon: domeUniforms ? domeUniforms.uHorizon.value.clone() : new THREE.Color(),
    domeFog: domeUniforms ? domeUniforms.uFog.value.clone() : new THREE.Color(),
    domeGlow: domeUniforms ? domeUniforms.uGlow.value : 0,
  };

  const applied = {
    sunIntensity: baseline.sunIntensity,
    sunColor: baseline.sunColor.clone(),
    ambientIntensity: baseline.ambientIntensity,
    hemiIntensity: baseline.hemiIntensity,
    hemiColor: baseline.hemiColor.clone(),
    fogDensity: baseline.fogDensity,
    fogNear: baseline.fogNear,
    fogFar: baseline.fogFar,
    fogColor: baseline.fogColor.clone(),
    domeTop: baseline.domeTop.clone(),
    domeHorizon: baseline.domeHorizon.clone(),
    domeFog: baseline.domeFog.clone(),
    domeGlow: baseline.domeGlow,
    gradeMix: -1,
  };

  const wetTargets = [];
  function addWetTarget(material) {
    if (!material || !material.color || wetTargets.some((t) => t.material === material)) return;
    wetTargets.push({ material, base: material.color.clone() });
  }
  if (terrain && terrain.mesh) addWetTarget(terrain.mesh.material);
  if (grass) {
    if (grass.grass) addWetTarget(grass.grass.material);
    if (grass.tufts) addWetTarget(grass.tufts.material);
    if (grass.stones) addWetTarget(grass.stones.material);
  }
  if (Array.isArray(options.wetMaterials)) options.wetMaterials.forEach(addWetTarget);

  const grassWind = grass && typeof grass.setWind === 'function' ? grass : null;

  const rainMax = WEATHER.rain.counts.high;
  const rainGeo = quadGeometry(true, false);
  const rainSeeds = new Float32Array(rainMax * 4);
  for (let i = 0; i < rainMax; i++) {
    rainSeeds[i * 4] = hash21(1, i * 3 + 1);
    rainSeeds[i * 4 + 1] = hash21(2, i * 3 + 2);
    rainSeeds[i * 4 + 2] = hash21(3, i * 3 + 3);
    rainSeeds[i * 4 + 3] = hash21(4, i * 3 + 4);
  }
  rainGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rainSeeds, 4));
  rainGeo.instanceCount = 0;
  const rainUniforms = {
    uBox: { value: new THREE.Vector3(WEATHER.rain.box[0], WEATHER.rain.box[1], WEATHER.rain.box[2]) },
    uOrigin: { value: new THREE.Vector3() },
    uOffset: { value: new THREE.Vector3() },
    uDir: { value: new THREE.Vector3(0, -1, 0) },
    uLen: { value: WEATHER.rain.streakLength },
    uWidth: { value: WEATHER.rain.streakWidth },
    uNearFade: { value: WEATHER.rain.nearFade },
    uEdge: { value: WEATHER.rain.edgeFade },
    uColor: { value: new THREE.Color(WEATHER.rain.color) },
    uOpacity: { value: 0 },
  };
  const rainMesh = new THREE.Mesh(rainGeo, new THREE.ShaderMaterial({
    uniforms: rainUniforms,
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  }));
  rainMesh.frustumCulled = false;
  rainMesh.matrixAutoUpdate = false;
  rainMesh.renderOrder = 8;
  rainMesh.visible = false;
  scene.add(rainMesh);

  const splashMax = WEATHER.splash.counts.high;
  const splashGeo = quadGeometry(true, true);
  const splashPos = new Float32Array(splashMax * 3);
  const splashLife = new Float32Array(splashMax * 2);
  for (let i = 0; i < splashMax; i++) splashLife[i * 2] = -1000;
  const splashPosAttr = new THREE.InstancedBufferAttribute(splashPos, 3);
  const splashLifeAttr = new THREE.InstancedBufferAttribute(splashLife, 2);
  splashPosAttr.setUsage(THREE.DynamicDrawUsage);
  splashLifeAttr.setUsage(THREE.DynamicDrawUsage);
  splashGeo.setAttribute('aPos', splashPosAttr);
  splashGeo.setAttribute('aLife', splashLifeAttr);
  splashGeo.instanceCount = 0;
  const splashUniforms = {
    uTime: { value: 0 },
    uLife: { value: WEATHER.splash.life },
    uSize: { value: WEATHER.splash.ringSize },
    uColor: { value: new THREE.Color(WEATHER.splash.color) },
    uOpacity: { value: 0 },
  };
  const splashMesh = new THREE.Mesh(splashGeo, new THREE.ShaderMaterial({
    uniforms: splashUniforms,
    vertexShader: SPLASH_VERT,
    fragmentShader: SPLASH_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  }));
  splashMesh.frustumCulled = false;
  splashMesh.matrixAutoUpdate = false;
  splashMesh.renderOrder = 7;
  splashMesh.visible = false;
  scene.add(splashMesh);

  const fogLayersMax = WEATHER.groundFog.layers.high;
  const fogGeo = quadGeometry(true, true);
  const fogLayerAttr = new Float32Array(fogLayersMax);
  for (let i = 0; i < fogLayersMax; i++) fogLayerAttr[i] = i;
  fogGeo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(fogLayerAttr, 1));
  fogGeo.instanceCount = 0;
  const fogUniforms = {
    uCenter: { value: new THREE.Vector3() },
    uSize: { value: WEATHER.groundFog.size },
    uSpacing: { value: WEATHER.groundFog.spacing },
    uBase: { value: 0 },
    uColor: { value: new THREE.Color(WEATHER.groundFog.color) },
    uAmount: { value: 0 },
    uDensity: { value: WEATHER.groundFog.density },
    uNoiseA: { value: WEATHER.groundFog.noiseScale },
    uNoiseB: { value: WEATHER.groundFog.noiseScale2 },
    uDrift: { value: new THREE.Vector2() },
    uEdge: { value: WEATHER.groundFog.edgeFade },
    uThickness: { value: WEATHER.groundFog.thickness },
  };
  const fogMesh = new THREE.Mesh(fogGeo, new THREE.ShaderMaterial({
    uniforms: fogUniforms,
    vertexShader: FOG_VERT,
    fragmentShader: FOG_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  }));
  fogMesh.frustumCulled = false;
  fogMesh.matrixAutoUpdate = false;
  fogMesh.renderOrder = 6;
  fogMesh.visible = false;
  scene.add(fogMesh);

  const flash = new THREE.DirectionalLight(WEATHER.lightning.color, 0);
  flash.castShadow = false;
  flash.position.set(200, 120, 200);
  scene.add(flash);
  scene.add(flash.target);

  const counts = { rain: WEATHER.rain.counts.high, splash: WEATHER.splash.counts.high, fog: fogLayersMax };
  function setQuality(id) {
    const key = id === 'low' || id === 'performance' ? 'low' : id === 'medium' || id === 'balanced' ? 'medium' : 'high';
    quality.id = key;
    counts.rain = WEATHER.rain.counts[key];
    counts.splash = WEATHER.splash.counts[key];
    counts.fog = WEATHER.groundFog.layers[key];
  }
  setQuality(quality.id);

  const windVec = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const tmpColor2 = new THREE.Color();
  const rainDir = new THREE.Vector3();
  const splashRand = { s: (WEATHER.seed ^ 0x5f3a) >>> 0 };
  function nextRandom() {
    splashRand.s = (Math.imul(splashRand.s ^ (splashRand.s >>> 15), 2246822507) ^ Math.imul(splashRand.s ^ (splashRand.s >>> 13), 3266489909)) >>> 0;
    return splashRand.s / 4294967296;
  }

  let shaderTime = 0;
  let indoor = 0;
  let outdoorGate = 1;
  let splashCursor = 0;
  let fogBase = 0;
  let fogBaseInit = false;
  const fogCenter = new THREE.Vector3();
  let wetSmoothed = 0;
  let lastKind = '';
  let lastStrikeIndex = -1;
  let lastRainInstances = -1;
  let lastSplashInstances = -1;
  let lastFogInstances = -1;

  function strikeEnvelope(dt, doubled) {
    const d = WEATHER.lightning.flashSeconds;
    if (dt < 0 || dt > d * 2.6) return 0;
    const a = Math.exp(-dt / (d * 0.32)) * (1 - Math.exp(-dt / (d * 0.045)));
    let e = a;
    if (doubled) {
      const t2 = dt - d * 0.55;
      if (t2 > 0) e = Math.max(e, Math.exp(-t2 / (d * 0.5)) * (1 - Math.exp(-t2 / (d * 0.05))) * 0.85);
    }
    return Math.min(1, e * 1.35);
  }

  function updateLightning(nowMs, amount) {
    if (amount < 0.02) {
      state.lightning = damp(state.lightning, 0, 12, 0.016);
      return;
    }
    const interval = WEATHER.lightning.intervalSeconds * 1000;
    const rel = nowMs - schedule.startedAt;
    const index = Math.floor(rel / interval);
    let level = 0;
    for (let k = index - 1; k <= index; k++) {
      const jitter = (hash21(schedule.seed, k * 97 + 41) - 0.5) * WEATHER.lightning.jitterSeconds * 1000;
      const at = schedule.startedAt + k * interval + jitter;
      const dt = (nowMs - at) * 0.001;
      if (dt < 0) continue;
      const doubled = hash21(schedule.seed, k * 131 + 7) < WEATHER.lightning.doubleChance;
      const e = strikeEnvelope(dt, doubled);
      if (e > level) level = e;
      if (e > 0.12 && k !== lastStrikeIndex) {
        lastStrikeIndex = k;
        const dist = WEATHER.lightning.distanceMin +
          hash21(schedule.seed, k * 211 + 19) * (WEATHER.lightning.distanceMax - WEATHER.lightning.distanceMin);
        const az = hash21(schedule.seed, k * 313 + 23) * Math.PI * 2;
        flash.position.set(Math.cos(az) * dist, dist * WEATHER.lightning.elevation, Math.sin(az) * dist);
        for (let i = 0; i < strikeListeners.length; i++) strikeListeners[i](dist, level);
      }
    }
    state.lightning = level * amount;
  }

  function syncBaseline() {
    if (sun) {
      if (Math.abs(sun.intensity - applied.sunIntensity) > 1e-4) baseline.sunIntensity = sun.intensity;
      if (!sun.color.equals(applied.sunColor)) baseline.sunColor.copy(sun.color);
    }
    if (hemi) {
      if (Math.abs(hemi.intensity - applied.hemiIntensity) > 1e-4) baseline.hemiIntensity = hemi.intensity;
      if (!hemi.color.equals(applied.hemiColor)) baseline.hemiColor.copy(hemi.color);
    }
    if (ambient && Math.abs(ambient.intensity - applied.ambientIntensity) > 1e-4) {
      baseline.ambientIntensity = ambient.intensity;
    }
    if (fog) {
      if (fog.isFogExp2) {
        if (Math.abs(fog.density - applied.fogDensity) > 1e-7) baseline.fogDensity = fog.density;
      } else {
        if (Math.abs(fog.near - applied.fogNear) > 1e-4) baseline.fogNear = fog.near;
        if (Math.abs(fog.far - applied.fogFar) > 1e-4) baseline.fogFar = fog.far;
      }
      if (!fog.color.equals(applied.fogColor)) baseline.fogColor.copy(fog.color);
    }
    if (domeUniforms) {
      if (!domeUniforms.uTop.value.equals(applied.domeTop)) baseline.domeTop.copy(domeUniforms.uTop.value);
      if (!domeUniforms.uHorizon.value.equals(applied.domeHorizon)) baseline.domeHorizon.copy(domeUniforms.uHorizon.value);
      if (!domeUniforms.uFog.value.equals(applied.domeFog)) baseline.domeFog.copy(domeUniforms.uFog.value);
      if (Math.abs(domeUniforms.uGlow.value - applied.domeGlow) > 1e-4) baseline.domeGlow = domeUniforms.uGlow.value;
    }
  }

  function applyLook(dt) {
    const strength = look.lightning > 0 ? state.lightning : 0;
    if (sun) {
      sun.intensity = baseline.sunIntensity * look.sunMul;
      applied.sunIntensity = sun.intensity;
      sun.color.copy(baseline.sunColor).lerp(tmpColor.copy(look.sunTint), look.sunTintAmount);
      applied.sunColor.copy(sun.color);
    }
    if (ambient) {
      ambient.intensity = baseline.ambientIntensity * look.ambientMul * (1 + strength * WEATHER.lightning.ambientFlash);
      applied.ambientIntensity = ambient.intensity;
    }
    if (hemi) {
      hemi.intensity = baseline.hemiIntensity * look.hemiMul * (1 + strength * 0.6);
      applied.hemiIntensity = hemi.intensity;
      hemi.color.copy(baseline.hemiColor).lerp(tmpColor.copy(look.skyTint), look.skyTintAmount * 0.8);
      applied.hemiColor.copy(hemi.color);
    }
    if (fog) {
      if (fog.isFogExp2) {
        fog.density = baseline.fogDensity * look.fogMul;
        applied.fogDensity = fog.density;
      } else {
        fog.near = baseline.fogNear / Math.max(0.2, look.fogMul);
        fog.far = baseline.fogFar / Math.max(0.2, look.fogMul);
        applied.fogNear = fog.near;
        applied.fogFar = fog.far;
      }
      fog.color.copy(baseline.fogColor).lerp(tmpColor.copy(look.fogTint), look.fogTintAmount);
      if (strength > 0.001) fog.color.lerp(tmpColor2.set(WEATHER.lightning.color), strength * WEATHER.lightning.skyFlash);
      applied.fogColor.copy(fog.color);
    }
    if (domeUniforms) {
      domeUniforms.uTop.value.copy(baseline.domeTop).lerp(tmpColor.copy(look.skyTint), look.skyTintAmount);
      domeUniforms.uHorizon.value.copy(baseline.domeHorizon).lerp(tmpColor.copy(look.skyTint), look.skyTintAmount * 0.85);
      domeUniforms.uFog.value.copy(baseline.domeFog).lerp(tmpColor.copy(look.fogTint), look.fogTintAmount);
      if (strength > 0.001) {
        tmpColor2.set(WEATHER.lightning.color);
        const f = strength * WEATHER.lightning.skyFlash;
        domeUniforms.uTop.value.lerp(tmpColor2, f);
        domeUniforms.uHorizon.value.lerp(tmpColor2, f);
        domeUniforms.uFog.value.lerp(tmpColor2, f);
      }
      domeUniforms.uGlow.value = baseline.domeGlow * look.glowMul;
      applied.domeTop.copy(domeUniforms.uTop.value);
      applied.domeHorizon.copy(domeUniforms.uHorizon.value);
      applied.domeFog.copy(domeUniforms.uFog.value);
      applied.domeGlow = domeUniforms.uGlow.value;
    }
    flash.intensity = strength * WEATHER.lightning.peakIntensity;
    if (post && typeof post.setSeason === 'function' && Math.abs(look.gradeMix - applied.gradeMix) > 0.004) {
      post.setSeason(look.gradeTint.getHex(), look.gradeMix);
      applied.gradeMix = look.gradeMix;
    }

    const wetTarget = look.wetness * state.intensity;
    const rate = wetTarget > wetSmoothed ? WEATHER.wet.response : WEATHER.wet.dryResponse;
    wetSmoothed = damp(wetSmoothed, wetTarget, rate, dt);
    state.wetness = wetSmoothed;
    for (let i = 0; i < wetTargets.length; i++) {
      const t = wetTargets[i];
      t.material.color.copy(t.base).multiplyScalar(1 - WEATHER.wet.darken * wetSmoothed);
      t.material.color.lerp(tmpColor.copy(t.base).multiply(tmpColor2.set(WEATHER.wet.coolTint)), WEATHER.wet.tintAmount * wetSmoothed);
    }
  }

  function updateWind(nowMs) {
    const angle = windAngle(nowMs, scheduled.index, scheduled.blend);
    const strength = (WEATHER.wind.baseSpeed + WEATHER.wind.gustSpeed * gustAt(nowMs)) * look.windScale * state.intensity;
    state.wind.dirX = Math.cos(angle);
    state.wind.dirZ = Math.sin(angle);
    state.wind.strength = strength;
    if (!grassWind) return;
    const sway = WEATHER.wind.swayBase + WEATHER.wind.swayGain * look.windScale;
    const lean = Math.max(0, look.windScale - 0.3) * 0.85 * state.intensity;
    grassWind.setWind(state.wind.dirX, state.wind.dirZ, sway, lean);
  }

  function updateRain(dt, cameraPosition) {
    const amount = Math.min(1.35, look.rain * state.intensity) * outdoorGate;
    const target = Math.round((counts.rain * Math.min(1, amount)) / WEATHER.rain.quantize) * WEATHER.rain.quantize;
    const instances = Math.min(counts.rain, target);
    if (instances !== lastRainInstances) {
      rainGeo.instanceCount = instances;
      lastRainInstances = instances;
    }
    rainMesh.visible = instances > 0;
    if (instances === 0) return;
    const fall = WEATHER.rain.fallSpeed * (0.85 + 0.35 * Math.min(1, amount));
    const wx = state.wind.dirX * state.wind.strength * WEATHER.rain.fallSpread;
    const wz = state.wind.dirZ * state.wind.strength * WEATHER.rain.fallSpread;
    const off = rainUniforms.uOffset.value;
    const box = rainUniforms.uBox.value;
    off.x = (off.x + wx * dt) % box.x;
    off.y = (off.y - fall * dt) % box.y;
    off.z = (off.z + wz * dt) % box.z;
    rainDir.set(wx, -fall, wz).normalize();
    rainUniforms.uDir.value.copy(rainDir);
    rainUniforms.uOrigin.value.set(
      cameraPosition.x,
      cameraPosition.y + WEATHER.rain.lift,
      cameraPosition.z
    );
    rainUniforms.uLen.value = WEATHER.rain.streakLength * (0.8 + 0.5 * Math.min(1, amount));
    rainUniforms.uOpacity.value =
      (WEATHER.rain.opacity + (WEATHER.rain.stormOpacity - WEATHER.rain.opacity) * Math.max(0, amount - 1)) *
      Math.min(1, amount);
  }

  function updateSplashes(dt, cameraPosition) {
    const amount = Math.min(1, look.rain * state.intensity) * outdoorGate;
    const ground = getHeight(cameraPosition.x, cameraPosition.z);
    const near = cameraPosition.y - ground < WEATHER.splash.altitudeCutoff;
    const instances = amount > 0.05 && near ? counts.splash : 0;
    if (instances !== lastSplashInstances) {
      splashGeo.instanceCount = instances;
      lastSplashInstances = instances;
    }
    splashMesh.visible = instances > 0;
    if (instances === 0) return;
    splashUniforms.uTime.value = shaderTime;
    splashUniforms.uOpacity.value = WEATHER.splash.opacity * amount;
    const budget = Math.min(WEATHER.splash.respawnPerFrame, instances);
    let done = 0;
    for (let n = 0; n < instances && done < budget; n++) {
      const i = splashCursor;
      splashCursor = (splashCursor + 1) % instances;
      const start = splashLife[i * 2];
      if (shaderTime - start < WEATHER.splash.life) continue;
      const a = nextRandom() * Math.PI * 2;
      const r = WEATHER.splash.radius * Math.sqrt(nextRandom());
      const x = cameraPosition.x + Math.cos(a) * r;
      const z = cameraPosition.z + Math.sin(a) * r;
      splashPos[i * 3] = x;
      splashPos[i * 3 + 1] = getHeight(x, z) + WEATHER.splash.lift;
      splashPos[i * 3 + 2] = z;
      splashLife[i * 2] = shaderTime + nextRandom() * 0.12;
      splashLife[i * 2 + 1] = nextRandom();
      done++;
    }
    if (done > 0) {
      splashPosAttr.needsUpdate = true;
      splashLifeAttr.needsUpdate = true;
    }
  }

  function updateGroundFog(dt, cameraPosition) {
    const amount = Math.min(1, look.groundFog * (0.5 + 0.5 * state.intensity)) * outdoorGate;
    const instances = amount > 0.02 ? counts.fog : 0;
    if (instances !== lastFogInstances) {
      fogGeo.instanceCount = instances;
      lastFogInstances = instances;
    }
    fogMesh.visible = instances > 0;
    if (instances === 0) return;
    if (!fogBaseInit ||
      Math.abs(cameraPosition.x - fogCenter.x) > WEATHER.groundFog.followStep ||
      Math.abs(cameraPosition.z - fogCenter.z) > WEATHER.groundFog.followStep) {
      fogCenter.set(cameraPosition.x, 0, cameraPosition.z);
      fogBaseInit = true;
    }
    fogBase = damp(fogBase, getHeight(fogCenter.x, fogCenter.z) + WEATHER.groundFog.baseHeight, 1.6, dt);
    fogCenter.y = fogBase;
    fogUniforms.uCenter.value.copy(fogCenter);
    fogUniforms.uBase.value = fogBase;
    fogUniforms.uAmount.value = amount;
    fogUniforms.uDrift.value.set(
      state.wind.dirX * state.wind.strength * shaderTime * WEATHER.groundFog.drift,
      state.wind.dirZ * state.wind.strength * shaderTime * WEATHER.groundFog.drift
    );
  }

  const followPosition = new THREE.Vector3();

  function update(dt, elapsed, cameraPosition) {
    const step = Math.min(dt || 0, 0.05);
    shaderTime += step;
    const nowMs = now();
    const p = cameraPosition || (camera ? camera.position : followPosition);

    lookAt(lookScheduled, nowMs);
    if (overrideBlend < 1) {
      overrideBlend = Math.min(1, (nowMs - overrideStart) / Math.max(1, schedule.transitionMs));
      mixLook(look, lookFrom, lookScheduled, smoothstep01(overrideBlend));
    } else {
      copyLook(look, lookScheduled);
    }

    state.intensity = scheduled.intensity;
    const kind = scheduled.blend < 0.5 ? scheduled.prevKind : scheduled.nextKind;
    if (kind !== lastKind) {
      lastKind = kind;
      state.kind = kind;
      for (let i = 0; i < listeners.length; i++) listeners[i](state);
    }

    updateWind(nowMs);
    updateLightning(nowMs, look.lightning * state.intensity);
    syncBaseline();
    applyLook(step);
    updateRain(step, p);
    updateSplashes(step, p);
    updateGroundFog(step, p);
  }

  function setIndoor(insideness) {
    indoor = typeof insideness === 'number' ? THREE.MathUtils.clamp(insideness, 0, 1) : 0;
    outdoorGate = 1 - smoothstep01((indoor - WEATHER.indoor.fadeStart) /
      (WEATHER.indoor.fadeEnd - WEATHER.indoor.fadeStart));
    if (outdoorGate < WEATHER.indoor.cutoff) outdoorGate = 0;
  }

  function windAt(position) {
    const s = state.wind;
    if (outdoorGate <= 0) return windVec.set(0, 0, 0);
    const px = position ? position.x : 0;
    const py = position ? position.y : 0;
    const pz = position ? position.z : 0;
    const turb = Math.sin(px * WEATHER.wind.turbulenceScale + shaderTime * 0.7) *
      Math.cos(pz * WEATHER.wind.turbulenceScale * 1.3 - shaderTime * 0.5);
    const alt = 1 + WEATHER.wind.altitudeGain * Math.min(1.5, Math.max(0, py) / WEATHER.wind.altitudeRef);
    const mag = s.strength * alt * (1 + turb * WEATHER.wind.turbulenceAmount) * WEATHER.wind.pushGain * outdoorGate;
    windVec.set(s.dirX * mag, turb * mag * 0.12, s.dirZ * mag);
    return windVec;
  }

  setFromWorld({ kind: 'clear', intensity: 1, seed: WEATHER.seed, startedAt: now() });
  overrideBlend = 1;
  lookAt(lookScheduled, now());
  copyLook(look, lookScheduled);
  state.kind = scheduled.nextKind;
  lastKind = state.kind;

  return {
    state,
    schedule,
    update,
    setFromWorld,
    sample,
    windAt,
    setIndoor,
    setQuality,
    get indoor() {
      return indoor;
    },
    get quality() {
      return quality.id;
    },
    onChange(cb) {
      if (typeof cb === 'function') listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    onLightning(cb) {
      if (typeof cb === 'function') strikeListeners.push(cb);
      return () => {
        const i = strikeListeners.indexOf(cb);
        if (i >= 0) strikeListeners.splice(i, 1);
      };
    },
    get counts() {
      return { rain: lastRainInstances, splash: lastSplashInstances, fogLayers: lastFogInstances };
    },
    get windPatched() {
      return grassWind ? 'grass.setWind' : grass ? 'missing grass.setWind' : 'no grass';
    },
    dispose() {
      for (let i = 0; i < wetTargets.length; i++) wetTargets[i].material.color.copy(wetTargets[i].base);
      if (grassWind) grassWind.setWind(1.0, 0.45, 1, 0);
      if (sun) {
        sun.intensity = baseline.sunIntensity;
        sun.color.copy(baseline.sunColor);
      }
      if (hemi) {
        hemi.intensity = baseline.hemiIntensity;
        hemi.color.copy(baseline.hemiColor);
      }
      if (ambient) ambient.intensity = baseline.ambientIntensity;
      if (fog) {
        if (fog.isFogExp2) fog.density = baseline.fogDensity;
        else {
          fog.near = baseline.fogNear;
          fog.far = baseline.fogFar;
        }
        fog.color.copy(baseline.fogColor);
      }
      if (domeUniforms) {
        domeUniforms.uTop.value.copy(baseline.domeTop);
        domeUniforms.uHorizon.value.copy(baseline.domeHorizon);
        domeUniforms.uFog.value.copy(baseline.domeFog);
        domeUniforms.uGlow.value = baseline.domeGlow;
      }
      scene.remove(rainMesh, splashMesh, fogMesh, flash, flash.target);
      rainMesh.geometry.dispose();
      rainMesh.material.dispose();
      splashMesh.geometry.dispose();
      splashMesh.material.dispose();
      fogMesh.geometry.dispose();
      fogMesh.material.dispose();
      listeners.length = 0;
      strikeListeners.length = 0;
    },
  };
}
