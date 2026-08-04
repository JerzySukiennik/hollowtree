// Hollowtree — bootstrap: renderer, scene, module wiring and the frame loop.

import * as THREE from 'three';
import { CAMERA, RENDER, WORLD, PALETTE, FLIGHT, DEV } from './config.js';
import { createLoop } from './core/loop.js';
import { input, initInput } from './core/input.js';
import { loadAssets } from './core/assets.js';
import { createResources } from './systems/resources.js';
import { createGather } from './systems/gather.js';
import { createHud as createGameHud } from './ui/hud.js';

const canvas = document.getElementById('app');
const loadingEl = document.getElementById('loading');
const barEl = document.querySelector('#bar > i');
const missingModules = [];

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  stencil: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = RENDER.toneMappingExposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyHorizon);
scene.fog = new THREE.Fog(PALETTE.fog, WORLD.fogNear, WORLD.fogFar);

const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far
);
camera.position.set(0, CAMERA.height + 6, CAMERA.distance + 6);

async function importFactory(path, name) {
  try {
    const module = await import(path);
    if (typeof module[name] === 'function') return module[name];
    console.warn(`[main] ${path} has no export "${name}"`);
  } catch (error) {
    console.warn(`[main] ${path} unavailable — ${error && error.message}`);
  }
  missingModules.push(name);
  return null;
}

function fallbackTerrain(targetScene) {
  const geometry = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: PALETTE.ground })
  );
  mesh.receiveShadow = true;
  targetScene.add(mesh);
  return { mesh, getHeight: () => 0, colliders: [] };
}

function fallbackSky(targetScene) {
  const hemi = new THREE.HemisphereLight(PALETTE.skyTop, PALETTE.ground, 1.1);
  const sun = new THREE.DirectionalLight(PALETTE.sunWarm, 2.2);
  sun.position.set(70, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
  targetScene.add(hemi, sun);
  return { update: () => {} };
}

function fallbackFlight(terrain) {
  const state = {
    position: new THREE.Vector3(0, 6, 0),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    bank: 0,
    speed: 0,
    update(dt, control, cameraYaw) {
      const max = control.boost ? FLIGHT.boostSpeed : FLIGHT.maxSpeed;
      const accel = control.boost ? FLIGHT.boostAccel : FLIGHT.accel;
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      const wishX = control.strafe * cos - control.forward * sin;
      const wishZ = -control.strafe * sin - control.forward * cos;
      state.velocity.x += wishX * accel * dt;
      state.velocity.z += wishZ * accel * dt;
      state.velocity.y += control.lift * FLIGHT.liftAccel * dt;
      const damp = Math.exp(-FLIGHT.drag * dt);
      state.velocity.multiplyScalar(damp);
      const planar = Math.hypot(state.velocity.x, state.velocity.z);
      if (planar > max) {
        state.velocity.x *= max / planar;
        state.velocity.z *= max / planar;
      }
      state.velocity.y = THREE.MathUtils.clamp(state.velocity.y, -FLIGHT.liftSpeed, FLIGHT.liftSpeed);
      state.position.addScaledVector(state.velocity, dt);
      const ground = terrain.getHeight(state.position.x, state.position.z) + FLIGHT.minAltitude;
      if (state.position.y < ground) { state.position.y = ground; state.velocity.y = 0; }
      state.speed = state.velocity.length();
      state.bank += (-control.strafe * FLIGHT.bankMax - state.bank) * Math.min(1, FLIGHT.bankResponse * dt);
      state.quaternion.setFromEuler(new THREE.Euler(0, cameraYaw, state.bank, 'YZX'));
    },
  };
  return state;
}

function fallbackRig(cam, flight) {
  const offset = new THREE.Vector3();
  const desired = new THREE.Vector3();
  return {
    yaw: 0,
    update(dt, control) {
      this.yaw = control.yaw;
      offset.set(
        Math.sin(control.yaw) * CAMERA.distance,
        CAMERA.height + Math.sin(control.pitch) * CAMERA.distance,
        Math.cos(control.yaw) * CAMERA.distance
      );
      desired.copy(flight.position).add(offset);
      cam.position.lerp(desired, Math.min(1, CAMERA.posStiffness * dt));
      cam.lookAt(flight.position);
    },
  };
}

function setProgress(value) {
  if (barEl) barEl.style.width = `${Math.round(THREE.MathUtils.clamp(value, 0, 1) * 100)}%`;
}

function createHud() {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'left:14px',
    'bottom:12px',
    'z-index:5',
    'pointer-events:none',
    'white-space:pre',
    'font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
    'letter-spacing:.06em',
    'color:#f6e9cf',
    'text-shadow:0 1px 3px rgba(0,0,0,.7)',
    `opacity:${DEV.hudOpacity}`,
    'display:none',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function createHint() {
  const el = document.createElement('div');
  el.textContent = 'click to fly';
  el.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:44px',
    'transform:translateX(-50%)',
    'z-index:5',
    'pointer-events:none',
    'font-size:12px',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'color:#f6e9cf',
    'text-shadow:0 1px 4px rgba(0,0,0,.8)',
    'transition:opacity .45s ease',
    'opacity:0',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

async function boot() {
  const assets = await loadAssets(setProgress);

  const [createTerrain, createSky, createGrass, createFlight, createCameraRig, createQueen] =
    await Promise.all([
      importFactory('./world/terrain.js', 'createTerrain'),
      importFactory('./world/sky.js', 'createSky'),
      importFactory('./world/grass.js', 'createGrass'),
      importFactory('./entities/flight.js', 'createFlight'),
      importFactory('./camera/rig.js', 'createCameraRig'),
      importFactory('./entities/queen.js', 'createQueen'),
    ]);

  const [createFlowers, createHive] = await Promise.all([
    importFactory('./entities/flowers.js', 'createFlowers'),
    importFactory('./entities/hive.js', 'createHive'),
  ]);

  const terrain = createTerrain ? createTerrain(scene) : fallbackTerrain(scene);
  const sky = createSky ? createSky(scene, renderer, camera) : fallbackSky(scene);
  const grass = createGrass ? createGrass(scene, terrain) : null;
  const flight = createFlight ? createFlight(terrain) : fallbackFlight(terrain);
  const rig = createCameraRig ? createCameraRig(camera, flight) : fallbackRig(camera, flight);
  const queen = createQueen ? createQueen(scene, assets) : null;
  const flowers = createFlowers ? createFlowers(scene, terrain) : null;
  const hive = createHive ? createHive(scene, terrain, assets) : null;

  let interior = null;
  let portal = null;
  if (hive) {
    try {
      const [interiorModule, portalModule] = await Promise.all([
        import('./nest/interior.js'),
        import('./nest/portal.js'),
      ]);
      interior = interiorModule.createInterior(scene, hive, assets, terrain);
      interior.attachColliders(terrain);
      portal = portalModule.createPortal(scene, interior, flight, [
        grass && grass.grass,
        grass && grass.stones,
        grass && grass.tufts,
        ...(flowers && Array.isArray(flowers.flowers) ? flowers.flowers.map((g) => g && g.mesh) : []),
      ]);
    } catch (error) {
      console.warn('[main] hollow interior unavailable —', error && error.message);
      interior = null;
      portal = null;
    }
  }

  const resources = createResources();
  const gather = flowers && hive ? createGather(flowers, resources, flight, hive) : null;
  const gameHud = createGameHud();

  let post = null;
  try {
    const module = await import('./render/post.js');
    if (typeof module.createPost === 'function') {
      const candidate = module.createPost(renderer, scene, camera);
      if (candidate && typeof candidate.render === 'function') post = candidate;
    }
  } catch (error) {
    post = null;
  }

  initInput(canvas);

  const hud = createHud();
  const hint = createHint();
  let hudVisible = false;
  let hudTimer = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F3') return;
    event.preventDefault();
    hudVisible = !hudVisible;
    hud.style.display = hudVisible ? 'block' : 'none';
  });

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
    renderer.setSize(width, height, false);
    if (post && typeof post.setSize === 'function') post.setSize(width, height);
  }
  window.addEventListener('resize', resize);
  resize();

  const loop = createLoop();

  loop.onFixed((dt) => {
    input.update(dt);
    const cameraYaw = rig && typeof rig.yaw === 'number' ? rig.yaw : input.yaw;
    flight.update(dt, input, cameraYaw);
    if (portal) portal.update(dt);
    if (gather) gather.update(dt, input);
  });

  loop.onRender((alpha, dt, elapsed) => {
    if (sky && typeof sky.update === 'function') sky.update(dt, camera.position, elapsed);
    if (grass && typeof grass.update === 'function') grass.update(dt, camera.position, elapsed);
    if (queen && typeof queen.update === 'function') queen.update(dt, flight, elapsed);
    if (rig && typeof rig.update === 'function') rig.update(dt, input, flight);
    if (interior && portal) interior.clampCamera(camera, portal.state.insideness);
    if (flowers && typeof flowers.update === 'function') flowers.update(dt, flight.position, elapsed);
    if (hive && typeof hive.update === 'function') hive.update(dt, elapsed);
    if (gather) gameHud.update(dt, { gather: gather.state, resources: resources.snapshot() });

    if (post) {
      try {
        post.render(dt);
      } catch (error) {
        console.warn('[main] post stack disabled —', error && error.message);
        post = null;
      }
    } else {
      renderer.render(scene, camera);
    }

    hint.style.opacity = input.pointerLocked ? 0 : DEV.hintOpacity;

    if (!hudVisible) return;
    hudTimer += dt;
    if (hudTimer < DEV.hudRefresh) return;
    hudTimer = 0;
    const speed = typeof flight.speed === 'number' ? flight.speed : flight.velocity.length();
    const altitude = flight.position.y - terrain.getHeight(flight.position.x, flight.position.z);
    hud.textContent =
      `fps ${loop.state.fps.toFixed(0).padStart(3)}   spd ${speed.toFixed(1).padStart(5)} m/s   alt ${altitude.toFixed(1).padStart(5)} m\n` +
      `tri ${renderer.info.render.triangles}   draw ${renderer.info.render.calls}   sens ${(input.sensitivity * 1000).toFixed(2)}  [ / ]` +
      (missingModules.length ? `\nmissing ${missingModules.join(' ')}` : '');
  });

  window.hollowtree = {
    renderer, scene, camera, terrain, sky, grass, flight, rig, queen, input, loop, assets,
    hive,
    nest: interior ? { interior, portal, grid: interior.grid, spec: interior.spec } : null,
  };

  setProgress(1);
  renderer.render(scene, camera);
  if (loadingEl) loadingEl.classList.add('hidden');
  hint.style.opacity = DEV.hintOpacity;

  loop.start();
}

boot().catch((error) => {
  console.error('[main] boot failed', error);
  if (loadingEl) {
    const hintEl = document.getElementById('hint');
    if (hintEl) hintEl.textContent = 'failed to start — see console';
  }
});
