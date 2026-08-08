// Hollowtree — post stack: camera-reprojection motion blur, depth of field, bloom, filmic grade and FXAA, with auto-degrading quality tiers.

import {
  Vector2,
  Vector3,
  Matrix4,
  Quaternion,
  Color,
  ShaderMaterial,
  WebGLRenderTarget,
  DepthTexture,
  UnsignedIntType,
  DepthFormat,
  HalfFloatType,
  UnsignedByteType,
  NearestFilter,
  LinearFilter,
  MathUtils,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RENDER, POST, FLIGHT } from '../config.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DEPTH_HELPERS = /* glsl */ `
uniform float uNear;
uniform float uFar;
float linearDepth(float d) {
  return uNear * uFar / (uFar - d * (uFar - uNear));
}`;

const MOTION_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uMaxRadius;
uniform float uNearStart;
uniform float uNearEnd;
uniform float uJitter;
uniform float uMinPixels;
${DEPTH_HELPERS}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  float d = min(texture2D(tDepth, vUv).x, 0.999995);
  vec4 world = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  world /= world.w;
  vec4 prev = uPrevViewProj * world;
  vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;

  float dist = linearDepth(d);
  float nearMask = smoothstep(uNearStart, uNearEnd, dist);
  vec2 velocity = (vUv - prevUv) * uStrength * nearMask;

  float len = length(velocity);
  if (len < uTexel.y * uMinPixels) {
    gl_FragColor = base;
    return;
  }
  if (len > uMaxRadius) velocity *= uMaxRadius / len;

  float noise = hash(vUv * 137.0) - 0.5;
  vec4 sum = vec4(0.0);
  float weight = 0.0;
  for (int i = 0; i < MB_TAPS; i++) {
    float t = float(i) / float(MB_TAPS - 1) - 0.5;
    t += noise * uJitter / float(MB_TAPS);
    vec2 uv = clamp(vUv + velocity * t, vec2(0.0), vec2(1.0));
    float w = 1.0;
    #ifdef MB_DEPTH_WEIGHT
      float td = linearDepth(min(texture2D(tDepth, uv).x, 0.999995));
      w = mix(0.08, 1.0, smoothstep(uNearStart, uNearEnd, td));
      w = mix(w, 1.0, abs(t) < 0.001 ? 1.0 : 0.0);
    #endif
    sum += texture2D(tDiffuse, uv) * w;
    weight += w;
  }
  gl_FragColor = weight > 0.0001 ? sum / weight : base;
}`;

const COC_FN = /* glsl */ `
uniform float uFocus;
uniform float uRange;
uniform float uFalloff;
uniform float uNearFalloff;
float cocAt(float d) {
  float dist = linearDepth(d);
  float delta = dist - uFocus;
  float far = smoothstep(0.0, uFalloff, delta - uRange);
  float near = smoothstep(0.0, uNearFalloff, -(delta + uRange));
  return clamp(max(far, near), 0.0, 1.0);
}`;

const DOF_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uRadius;
${DEPTH_HELPERS}
${COC_FN}

const vec2 DIRS[12] = vec2[12](
  vec2(1.0, 0.0), vec2(0.5, 0.866), vec2(-0.5, 0.866),
  vec2(-1.0, 0.0), vec2(-0.5, -0.866), vec2(0.5, -0.866),
  vec2(0.866, 0.5), vec2(0.0, 1.0), vec2(-0.866, 0.5),
  vec2(-0.866, -0.5), vec2(0.0, -1.0), vec2(0.866, -0.5)
);

void main() {
  float centreCoc = cocAt(texture2D(tDepth, vUv).x);
  vec3 sum = texture2D(tDiffuse, vUv).rgb;
  float weight = 1.0;
  float maxCoc = centreCoc;
  for (int i = 0; i < 12; i++) {
    float ring = i < 6 ? 1.0 : 0.58;
    vec2 offset = DIRS[i] * uTexel * uRadius * ring;
    vec2 uv = clamp(vUv + offset, vec2(0.0), vec2(1.0));
    float c = cocAt(texture2D(tDepth, uv).x);
    float w = max(c, centreCoc * 0.35);
    sum += texture2D(tDiffuse, uv).rgb * w;
    weight += w;
    maxCoc = max(maxCoc, c);
  }
  gl_FragColor = vec4(sum / weight, maxCoc);
}`;

const GRADE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uContrast;
uniform float uContrastGain;
uniform float uSaturation;
uniform float uLift;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uShadowAmount;
uniform float uHighlightAmount;
uniform float uShadowEdge;
uniform float uHighlightEdge;
uniform vec3 uSeasonTint;
uniform float uSeasonMix;
uniform float uVignette;
uniform float uVignetteSoft;
uniform float uSharpen;
uniform float uSharpenClamp;
${DEPTH_HELPERS}
#ifdef USE_DOF
uniform sampler2D tDof;
uniform float uNearBleed;
uniform float uMaxBlend;
${COC_FN}
#endif

const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);
const mat3 ACES_OUT = mat3(
  1.60475, -0.10208, -0.00327,
  -0.53108, 1.10813, -0.07276,
  -0.07367, -0.00605, 1.07602
);

vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 aces(vec3 c) {
  c *= uExposure / 0.6;
  c = ACES_IN * c;
  c = rrtOdt(c);
  c = ACES_OUT * c;
  return clamp(c, 0.0, 1.0);
}

vec3 encodeSRGB(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  float blur = 0.0;
  #ifdef USE_DOF
    vec4 dof = texture2D(tDof, vUv);
    float coc = cocAt(texture2D(tDepth, vUv).x);
    blur = clamp(max(coc, dof.a * uNearBleed), 0.0, 1.0) * uMaxBlend;
    base = mix(base, dof.rgb, smoothstep(0.0, 1.0, blur));
  #endif

  if (uSharpen > 0.0001) {
    vec3 n = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
    n += texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
    n += texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
    n += texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
    vec3 delta = texture2D(tDiffuse, vUv).rgb - n * 0.25;
    delta = clamp(delta, vec3(-uSharpenClamp), vec3(uSharpenClamp));
    base += delta * uSharpen * (1.0 - blur);
  }

  vec3 c = max(base, 0.0);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);
  float sw = 1.0 - smoothstep(0.0, uShadowEdge, luma);
  float hw = smoothstep(uShadowEdge * 0.7, uHighlightEdge, luma);
  c *= mix(vec3(1.0), uShadowTint, sw * uShadowAmount);
  c *= mix(vec3(1.0), uHighlightTint, hw * uHighlightAmount);
  c = mix(c, c * uSeasonTint, uSeasonMix);
  c = pow(max(c, 0.0), vec3(uContrast)) * uContrastGain + uLift;

  float r = length((vUv - 0.5) * vec2(1.0, 0.92)) * 2.0;
  c *= 1.0 - uVignette * pow(smoothstep(uVignetteSoft, 1.45, r), 1.7);

  gl_FragColor = vec4(encodeSRGB(aces(c)), 1.0);
}`;

function hexToVec3(hex, target) {
  const c = new Color(hex);
  return target.set(c.r, c.g, c.b);
}

export function createPost(renderer, scene, camera) {
  if (!renderer || !scene || !camera || POST.enabled === false) {
    throw new Error('post stack disabled');
  }

  const size = renderer.getDrawingBufferSize(new Vector2());
  const tierCount = POST.tiers.length;
  let tier = MathUtils.clamp(
    POST.tier === 'auto' ? POST.startTier : POST.tier,
    0,
    tierCount - 1
  );
  let bypass = false;

  const toggles = { motion: true, dof: true, bloom: true, grade: true, fxaa: true };

  const rtScene = new WebGLRenderTarget(size.x, size.y, {
    type: HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  rtScene.depthTexture = new DepthTexture(size.x, size.y, UnsignedIntType);
  rtScene.depthTexture.format = DepthFormat;
  rtScene.depthTexture.minFilter = NearestFilter;
  rtScene.depthTexture.magFilter = NearestFilter;

  const rtColor = new WebGLRenderTarget(size.x, size.y, {
    type: HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const rtLdr = new WebGLRenderTarget(size.x, size.y, {
    type: UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const rtDof = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });

  const motionMaterial = new ShaderMaterial({
    defines: { MB_TAPS: '8' },
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: rtScene.depthTexture },
      uInvViewProj: { value: new Matrix4() },
      uPrevViewProj: { value: new Matrix4() },
      uTexel: { value: new Vector2() },
      uStrength: { value: 0 },
      uMaxRadius: { value: POST.motion.maxRadius },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uNearStart: { value: POST.motion.nearStart },
      uNearEnd: { value: POST.motion.nearEnd },
      uJitter: { value: POST.motion.jitter },
      uMinPixels: { value: POST.motion.minPixels },
    },
    vertexShader: VERT,
    fragmentShader: MOTION_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const dofMaterial = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: rtScene.depthTexture },
      uTexel: { value: new Vector2() },
      uRadius: { value: POST.dof.radius },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocus: { value: POST.dof.focusDefault },
      uRange: { value: POST.dof.range },
      uFalloff: { value: POST.dof.falloff },
      uNearFalloff: { value: POST.dof.nearFalloff },
    },
    vertexShader: VERT,
    fragmentShader: DOF_FRAG,
    glslVersion: null,
    depthTest: false,
    depthWrite: false,
  });

  const gradeMaterial = new ShaderMaterial({
    defines: { USE_DOF: '' },
    uniforms: {
      tDiffuse: { value: null },
      tDof: { value: rtDof.texture },
      tDepth: { value: rtScene.depthTexture },
      uTexel: { value: new Vector2() },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocus: { value: POST.dof.focusDefault },
      uRange: { value: POST.dof.range },
      uFalloff: { value: POST.dof.falloff },
      uNearFalloff: { value: POST.dof.nearFalloff },
      uNearBleed: { value: POST.dof.nearBleed },
      uMaxBlend: { value: POST.dof.maxBlend },
      uExposure: { value: renderer.toneMappingExposure },
      uContrast: { value: POST.grade.contrast },
      uContrastGain: { value: POST.grade.contrastGain },
      uSaturation: { value: POST.grade.saturation },
      uLift: { value: POST.grade.lift },
      uShadowTint: { value: hexToVec3(POST.grade.shadowTint, new Vector3()) },
      uHighlightTint: { value: hexToVec3(POST.grade.highlightTint, new Vector3()) },
      uShadowAmount: { value: POST.grade.shadowAmount },
      uHighlightAmount: { value: POST.grade.highlightAmount },
      uShadowEdge: { value: POST.grade.shadowEdge },
      uHighlightEdge: { value: POST.grade.highlightEdge },
      uSeasonTint: { value: hexToVec3(POST.grade.seasonTint, new Vector3()) },
      uSeasonMix: { value: POST.grade.seasonMix },
      uVignette: { value: POST.grade.vignette },
      uVignetteSoft: { value: POST.grade.vignetteSoftness },
      uSharpen: { value: POST.grade.sharpen },
      uSharpenClamp: { value: POST.grade.sharpenClamp },
    },
    vertexShader: VERT,
    fragmentShader: GRADE_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new FullScreenQuad(motionMaterial);
  const bloom = new UnrealBloomPass(
    new Vector2(1, 1),
    RENDER.bloomStrength,
    RENDER.bloomRadius,
    RENDER.bloomThreshold
  );
  const fxaa = new ShaderPass(FXAAShader);

  const insideTint = hexToVec3(POST.grade.insideTint, new Vector3());
  const seasonTint = hexToVec3(POST.grade.seasonTint, new Vector3());
  const prevViewProj = new Matrix4();
  const viewProj = new Matrix4();
  const prevCamPos = new Vector3().copy(camera.position);
  const prevCamQuat = new Quaternion().copy(camera.quaternion);
  const camDelta = new Vector3();
  const focusPoint = new Vector3();
  // Set when the camera moved discontinuously since the previous frame. The motion pass
  // is skipped for that one frame and the reprojection history is re-seeded, so a cut
  // never smears. Counted so the effect is observable from a test.
  let cutThisFrame = false;
  let cutCount = 0;

  const motionState = { speedRatio: 0, boostAmount: 0, turnRate: 0, focusDistance: 0, insideness: 0 };
  let motionDrive = 0;
  let focus = POST.dof.focusDefault;
  let insideness = 0;
  let frameMs = 1000 / RENDER.targetFps;
  let warm = 0;
  let overBudget = 0;
  let stateFresh = false;
  let host = null;
  let width = size.x;
  let height = size.y;

  function tierSpec() {
    return POST.tiers[MathUtils.clamp(tier, 0, tierCount - 1)];
  }

  function applyTier() {
    const spec = tierSpec();
    motionMaterial.defines.MB_TAPS = String(Math.max(3, spec.motionTaps));
    if (spec.motionDepthWeight) motionMaterial.defines.MB_DEPTH_WEIGHT = '';
    else delete motionMaterial.defines.MB_DEPTH_WEIGHT;
    motionMaterial.needsUpdate = true;
    if (spec.dof) gradeMaterial.defines.USE_DOF = '';
    else delete gradeMaterial.defines.USE_DOF;
    gradeMaterial.needsUpdate = true;
    resize();
  }

  function resize() {
    const spec = tierSpec();
    const draw = renderer.getDrawingBufferSize(new Vector2());
    const scale = spec.renderScale || 1;
    width = Math.max(2, Math.floor(draw.x * scale));
    height = Math.max(2, Math.floor(draw.y * scale));

    rtScene.setSize(width, height);
    rtScene.depthTexture.image.width = width;
    rtScene.depthTexture.image.height = height;
    rtScene.depthTexture.needsUpdate = true;
    rtColor.setSize(width, height);
    rtLdr.setSize(draw.x, draw.y);

    const dofW = Math.max(2, Math.floor(width * POST.dof.scale));
    const dofH = Math.max(2, Math.floor(height * POST.dof.scale));
    rtDof.setSize(dofW, dofH);

    motionMaterial.uniforms.uTexel.value.set(1 / width, 1 / height);
    dofMaterial.uniforms.uTexel.value.set(1 / dofW, 1 / dofH);
    gradeMaterial.uniforms.uTexel.value.set(1 / width, 1 / height);
    fxaa.material.uniforms.resolution.value.set(1 / draw.x, 1 / draw.y);
    bloom.setSize(
      Math.max(2, Math.floor(width * (spec.bloomScale || 0.4))),
      Math.max(2, Math.floor(height * (spec.bloomScale || 0.4)))
    );
  }

  function sniffHost() {
    if (stateFresh) return;
    const root = typeof window !== 'undefined' ? window.hollowtree : null;
    if (!root) return;
    host = root;
    const flight = root.flight;
    if (flight) {
      motionState.speedRatio = typeof flight.speedRatio === 'number' ? flight.speedRatio : 0;
      motionState.boostAmount = typeof flight.boostAmount === 'number' ? flight.boostAmount : 0;
      motionState.turnRate = typeof flight.yawRate === 'number' ? Math.abs(flight.yawRate) : 0;
      if (flight.position) motionState.focusDistance = camera.position.distanceTo(flight.position);
    }
    const portal = root.nest && root.nest.portal;
    if (portal && portal.state) motionState.insideness = portal.state.insideness || 0;
  }

  // A cut is a rate, not a distance: both thresholds divide by dt, so a slow frame looks
  // the same as a fast one and legitimate full-speed flight can never trip them.
  function detectCut(dt) {
    const step = dt > 0 ? dt : 1 / 60;
    const moved = camDelta.copy(camera.position).sub(prevCamPos).length();
    const speedRatio = moved / step / Math.max(FLIGHT.maxSpeed, 0.0001);
    // |dot| folds the quaternion double cover, so q and -q read as the same orientation.
    const dot = Math.min(1, Math.abs(camera.quaternion.dot(prevCamQuat)));
    const turnRate = (2 * Math.acos(dot)) / step;
    cutThisFrame =
      speedRatio > POST.motion.cutSpeedRatio || turnRate > POST.motion.cutTurnRate;
    if (cutThisFrame) {
      cutCount++;
      // Re-seed the history so this frame reprojects to zero velocity even if something
      // downstream still runs the motion pass.
      prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    }
  }

  function updateDrive(dt) {
    sniffHost();
    camDelta.copy(camera.position).sub(prevCamPos);
    const camRatio = cutThisFrame || dt <= 0 ? 0 : camDelta.length() / dt / FLIGHT.maxSpeed;
    const ratio = Math.max(motionState.speedRatio, camRatio);
    const target = MathUtils.clamp(
      POST.motion.hoverFloor +
        ratio * POST.motion.speedGain +
        motionState.boostAmount * POST.motion.boostGain +
        Math.min(1, motionState.turnRate * 0.5) * POST.motion.turnGain,
      0,
      2.5
    );
    motionDrive += (target - motionDrive) * (1 - Math.exp(-POST.motion.response * Math.max(dt, 0.0001)));
    // A cut must not leave a charged drive behind, or the blur ramps back in over the
    // following frames and the smear simply arrives late.
    if (cutThisFrame) motionDrive = 0;

    insideness += (motionState.insideness - insideness) * (1 - Math.exp(-POST.bloom.insideResponse * Math.max(dt, 0.0001)));

    const wanted = MathUtils.clamp(
      motionState.focusDistance > 0 ? motionState.focusDistance : POST.dof.focusDefault,
      POST.dof.focusMin,
      POST.dof.focusMax
    );
    focus += (wanted - focus) * (1 - Math.exp(-POST.dof.focusResponse * Math.max(dt, 0.0001)));

    stateFresh = false;
    motionState.speedRatio = 0;
    motionState.boostAmount = 0;
    motionState.turnRate = 0;
  }

  function updateUniforms(dt) {
    const shutter = MathUtils.clamp(
      dt > 0 ? POST.motion.dtRef / dt : 1,
      1 / POST.motion.dtClamp,
      POST.motion.dtClamp
    );
    motionMaterial.uniforms.uStrength.value =
      POST.motion.strength * motionDrive * POST.motion.shutter * shutter;
    motionMaterial.uniforms.uNear.value = camera.near;
    motionMaterial.uniforms.uFar.value = camera.far;
    motionMaterial.uniforms.uInvViewProj.value
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();
    motionMaterial.uniforms.uPrevViewProj.value.copy(prevViewProj);

    const range = MathUtils.lerp(POST.dof.range, POST.dof.rangeInside, insideness);
    const falloff = MathUtils.lerp(POST.dof.falloff, POST.dof.falloffInside, insideness);
    const nearFalloff = MathUtils.lerp(POST.dof.nearFalloff, POST.dof.nearFalloffInside, insideness);
    const radius = MathUtils.lerp(POST.dof.radius, POST.dof.radiusInside, insideness);

    dofMaterial.uniforms.uFocus.value = focus;
    dofMaterial.uniforms.uRange.value = range;
    dofMaterial.uniforms.uFalloff.value = falloff;
    dofMaterial.uniforms.uNearFalloff.value = nearFalloff;
    dofMaterial.uniforms.uRadius.value = radius;
    dofMaterial.uniforms.uNear.value = camera.near;
    dofMaterial.uniforms.uFar.value = camera.far;

    gradeMaterial.uniforms.uFocus.value = focus;
    gradeMaterial.uniforms.uRange.value = range;
    gradeMaterial.uniforms.uFalloff.value = falloff;
    gradeMaterial.uniforms.uNearFalloff.value = nearFalloff;
    gradeMaterial.uniforms.uNear.value = camera.near;
    gradeMaterial.uniforms.uFar.value = camera.far;
    gradeMaterial.uniforms.uExposure.value = renderer.toneMappingExposure;
    gradeMaterial.uniforms.uVignette.value = MathUtils.lerp(
      POST.grade.vignette,
      POST.grade.vignetteInside,
      insideness
    );
    gradeMaterial.uniforms.uSeasonTint.value
      .copy(seasonTint)
      .lerp(insideTint, insideness * POST.grade.insideWarmth);
    gradeMaterial.uniforms.uSeasonMix.value = Math.max(
      POST.grade.seasonMix,
      insideness * POST.grade.insideWarmth
    );

    bloom.strength = MathUtils.lerp(RENDER.bloomStrength, POST.bloom.strengthInside, insideness);
    bloom.threshold = MathUtils.lerp(RENDER.bloomThreshold, POST.bloom.thresholdInside, insideness);
    bloom.radius = RENDER.bloomRadius;
  }

  function blit(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    if (target) renderer.clear(true, false, false);
    quad.render(renderer);
  }

  function degrade(dt) {
    if (!POST.autoDegrade || POST.tier !== 'auto') return;
    warm += dt;
    if (warm < POST.warmup) return;
    const budget = (1000 / RENDER.targetFps) * POST.degradeTolerance;
    if (frameMs > budget) overBudget += dt;
    else overBudget = Math.max(0, overBudget - dt * 0.5);
    if (overBudget < POST.degradeGrace) return;
    overBudget = 0;
    if (tier > 0) {
      tier -= 1;
      applyTier();
      console.warn(`[post] frame budget exceeded (${frameMs.toFixed(1)} ms) — dropping to tier ${tier}`);
      return;
    }
    if (POST.allowBypass && frameMs > (1000 / RENDER.targetFps) * POST.bypassTolerance) {
      bypass = true;
      console.warn('[post] still over budget at tier 0 — bypassing the post stack');
    }
  }

  function render(dt) {
    const step = dt > 0 ? dt : 1 / 60;
    frameMs += (step * 1000 - frameMs) * POST.frameSmoothing;

    if (bypass) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    const spec = tierSpec();
    // Must precede detectCut and updateUniforms: both read the camera's world matrix.
    camera.updateMatrixWorld();
    detectCut(step);
    const useMotion = toggles.motion && POST.motion.enabled && !cutThisFrame;
    const useDof = toggles.dof && spec.dof;
    const useBloom = toggles.bloom && spec.bloom;
    const useFxaa = toggles.fxaa && spec.fxaa && toggles.grade;

    updateDrive(step);
    updateUniforms(step);

    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);

    let src = rtScene;

    if (useMotion) {
      motionMaterial.uniforms.tDiffuse.value = src.texture;
      blit(motionMaterial, rtColor);
      src = rtColor;
    }

    if (useBloom) {
      bloom.renderToScreen = false;
      bloom.render(renderer, null, src, step, false);
    }

    if (useDof) {
      dofMaterial.uniforms.tDiffuse.value = src.texture;
      blit(dofMaterial, rtDof);
      gradeMaterial.uniforms.tDof.value = rtDof.texture;
    }

    if (toggles.grade) {
      gradeMaterial.uniforms.tDiffuse.value = src.texture;
      blit(gradeMaterial, useFxaa ? rtLdr : null);
      if (useFxaa) {
        fxaa.renderToScreen = true;
        fxaa.render(renderer, null, rtLdr, step, false);
      }
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }

    renderer.setRenderTarget(null);
    prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    prevCamPos.copy(camera.position);
    prevCamQuat.copy(camera.quaternion);
    degrade(step);
  }

  const api = {
    render,
    setSize() {
      resize();
    },
    // Drops the reprojection history on the floor. Call around any deliberate camera
    // discontinuity; detectCut catches the rest on its own.
    resetMotionHistory() {
      camera.updateMatrixWorld();
      prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      prevCamPos.copy(camera.position);
      prevCamQuat.copy(camera.quaternion);
      motionDrive = 0;
      cutThisFrame = true;
    },
    motionDebug() {
      return { cutCount, cutThisFrame, motionDrive, strength: motionMaterial.uniforms.uStrength.value };
    },
    setMotionState(state) {
      if (!state) return;
      stateFresh = true;
      if (typeof state.speedRatio === 'number') motionState.speedRatio = state.speedRatio;
      else if (typeof state.speed === 'number') motionState.speedRatio = state.speed / FLIGHT.maxSpeed;
      if (typeof state.boostAmount === 'number') motionState.boostAmount = state.boostAmount;
      if (typeof state.yawRate === 'number') motionState.turnRate = Math.abs(state.yawRate);
      if (typeof state.focusDistance === 'number') motionState.focusDistance = state.focusDistance;
      else if (state.focusTarget) {
        motionState.focusDistance = camera.position.distanceTo(
          focusPoint.copy(state.focusTarget)
        );
      }
      if (typeof state.insideness === 'number') motionState.insideness = state.insideness;
    },
    setSeason(tint, mix) {
      if (tint !== undefined) hexToVec3(tint, seasonTint);
      if (typeof mix === 'number') POST.grade.seasonMix = mix;
    },
    setTier(value) {
      tier = MathUtils.clamp(value, 0, tierCount - 1);
      bypass = false;
      applyTier();
    },
    get tier() {
      return bypass ? -1 : tier;
    },
    get frameMs() {
      return frameMs;
    },
    toggles,
    materials: { motion: motionMaterial, dof: dofMaterial, grade: gradeMaterial },
    targets: { scene: rtScene, color: rtColor, ldr: rtLdr, dof: rtDof },
    bloom,
    dispose() {
      rtScene.dispose();
      rtColor.dispose();
      rtLdr.dispose();
      rtDof.dispose();
      motionMaterial.dispose();
      dofMaterial.dispose();
      gradeMaterial.dispose();
      quad.dispose();
      bloom.dispose();
      fxaa.dispose();
    },
  };

  applyTier();
  prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  if (typeof window !== 'undefined') window.hollowtreePost = api;
  return api;
}
