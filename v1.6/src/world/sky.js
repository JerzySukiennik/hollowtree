// Hollowtree — gradient sky dome, warm sun with a single tight shadow cascade, horizon-matched fog.

import * as THREE from 'three';
import { PALETTE, RENDER, SKY } from '../config.js';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSoftness;
uniform float uGlow;
uniform float uDisc;
varying vec3 vDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -1.0, 1.0);
  float t = pow(smoothstep(-0.02, uSoftness, h), 0.78);
  vec3 col = mix(uHorizon, uTop, t);

  float sd = max(dot(dir, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sd, 4.0) * 0.14 * uGlow;
  col += uSunColor * pow(sd, 26.0) * 0.55 * uGlow;
  col += uSunColor * pow(sd, uDisc) * 1.4;

  col = mix(uFog, col, smoothstep(-0.16, 0.015, h));
  col += (hash12(gl_FragCoord.xy) - 0.5) * 0.006;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function sunDirection(t, out) {
  const arc = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0.0, 1.0));
  const elev = THREE.MathUtils.lerp(SKY.sunElevationMin, SKY.sunElevationMax, arc);
  const theta = elev * Math.PI * 0.5;
  const az = SKY.sunAzimuth + (t - 0.5) * 1.15;
  const c = Math.cos(theta);
  return out.set(Math.sin(az) * c, Math.sin(theta), Math.cos(az) * c).normalize();
}

export function createSky(scene, renderer) {
  if (renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (renderer.toneMapping === THREE.NoToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
    }
  }

  const topColor = new THREE.Color(PALETTE.skyTop);
  const horizonColor = new THREE.Color(PALETTE.skyHorizon);
  const fogColor = new THREE.Color(PALETTE.fog);
  const sunHigh = new THREE.Color(PALETTE.sunWarm);
  const sunLow = new THREE.Color(SKY.sunHorizonColor);

  const uniforms = {
    uTop: { value: topColor.clone() },
    uHorizon: { value: horizonColor.clone() },
    uFog: { value: fogColor.clone() },
    uSunColor: { value: sunHigh.clone() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSoftness: { value: SKY.horizonSoftness },
    uGlow: { value: SKY.glowStrength },
    uDisc: { value: SKY.discSharpness },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY.domeRadius, SKY.domeSegments, Math.round(SKY.domeSegments * 0.6)),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true,
    })
  );
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.matrixAutoUpdate = false;
  dome.onBeforeRender = (r, s, camera) => {
    dome.matrixWorld.makeTranslation(camera.position.x, camera.position.y, camera.position.z);
  };
  scene.add(dome);

  scene.fog = new THREE.FogExp2(fogColor.getHex(), SKY.fogDensity);
  scene.background = null;

  const sun = new THREE.DirectionalLight(PALETTE.sunWarm, SKY.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
  sun.shadow.bias = SKY.shadowBias;
  sun.shadow.normalBias = SKY.shadowNormalBias;
  const R = RENDER.shadowRadius;
  const cam = sun.shadow.camera;
  cam.left = -R;
  cam.right = R;
  cam.top = R;
  cam.bottom = -R;
  cam.near = SKY.shadowNear;
  cam.far = SKY.shadowFar;
  cam.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(PALETTE.skyHorizon, SKY.hemiGround, SKY.hemiIntensity);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(SKY.ambientColor, SKY.ambientIntensity);
  scene.add(ambient);

  const dir = new THREE.Vector3();
  const focus = new THREE.Vector3(0, 0, 0);
  const texel = (R * 2) / RENDER.shadowMapSize;
  let time = SKY.defaultTimeOfDay;
  let lastTime = -1;

  function applyTime(t) {
    sunDirection(t, dir);
    const warm = THREE.MathUtils.smoothstep(dir.y, 0.08, 0.55);
    sun.color.copy(sunLow).lerp(sunHigh, warm);
    sun.intensity = SKY.sunIntensity * (0.62 + 0.38 * warm);
    uniforms.uSunColor.value.copy(sun.color);
    uniforms.uSunDir.value.copy(dir);
    uniforms.uTop.value.copy(topColor).lerp(sunLow, (1.0 - warm) * 0.18);
    uniforms.uHorizon.value.copy(horizonColor).lerp(sunLow, (1.0 - warm) * 0.42);
    uniforms.uFog.value.copy(fogColor).lerp(sunLow, (1.0 - warm) * 0.35);
    scene.fog.color.copy(uniforms.uFog.value);
    hemi.color.copy(uniforms.uHorizon.value);
  }

  function followTarget(p) {
    if (p) focus.set(p.x, 0, p.z);
    const sx = Math.round(focus.x / texel) * texel;
    const sz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(sx, 0, sz);
    sun.position.set(
      sx + dir.x * SKY.sunDistance,
      dir.y * SKY.sunDistance,
      sz + dir.z * SKY.sunDistance
    );
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  applyTime(time);
  followTarget(null);

  return {
    sun,
    hemi,
    ambient,
    dome,
    fog: scene.fog,
    followTarget,
    setTimeOfDay(t) {
      time = t;
      applyTime(time);
      followTarget(null);
    },
    update(dt, timeOfDay, target) {
      let focusTarget = target || null;
      if (typeof timeOfDay === 'number') time = timeOfDay;
      else if (timeOfDay && timeOfDay.isVector3) focusTarget = timeOfDay;
      if (time !== lastTime) {
        applyTime(time);
        lastTime = time;
      }
      followTarget(focusTarget);
    },
    dispose() {
      dome.geometry.dispose();
      dome.material.dispose();
      scene.remove(dome, sun, sun.target, hemi, ambient);
    },
  };
}
