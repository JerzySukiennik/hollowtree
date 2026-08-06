// Hollowtree — bootstrap: renderer, scene, module wiring and the frame loop.

import * as THREE from 'three';
import { CAMERA, RENDER, WORLD, PALETTE, FLIGHT, DEV, MENU, HIVE } from './config.js';
import { createLoop } from './core/loop.js';
import { input, initInput } from './core/input.js';
import { loadAssets } from './core/assets.js';
import { createResources } from './systems/resources.js';
import { createGather } from './systems/gather.js';
import { createHud as createGameHud } from './ui/hud.js';
import { createMenu } from './ui/menu.js';
import { createLobby } from './ui/lobby.js';
import { createAudio } from './audio/index.js';
import { createNet } from './net/index.js';

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
        hive && hive.group,
        hive && hive.forest && hive.forest.mesh,
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

  const createWeather = await importFactory('./world/weather.js', 'createWeather');
  const weather = createWeather
    ? createWeather(scene, camera, terrain, sky, { grass, post, quality: 'balanced' })
    : null;

  const audio = createAudio(camera);
  if (weather) {
    weather.onChange((state) => audio.setWeather(state));
    weather.onLightning((distance) => {
      if (typeof audio.thunder === 'function') audio.thunder(distance);
    });
    audio.setWeather(weather.state);
  }
  if (gather && typeof gather.onDeposit === 'function') {
    gather.onDeposit((event) => audio.play('deposit', {
      volume: Math.min(1, 0.6 + ((event && event.total) || 0) / 200),
    }));
  }

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

  const viewSize = new THREE.Vector2();

  function resize() {
    const width = Math.round(canvas.clientWidth || window.innerWidth || 0);
    const height = Math.round(canvas.clientHeight || window.innerHeight || 0);
    if (width < 2 || height < 2) return;
    renderer.getSize(viewSize);
    const ratio = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
    if (viewSize.x === width && viewSize.y === height && renderer.getPixelRatio() === ratio) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    if (post && typeof post.setSize === 'function') post.setSize(width, height);
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', resize);
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
  resize();

  const loop = createLoop();

  let mode = 'menu';
  let cinematic = null;
  let session = null;
  let net = null;
  let netInfo = null;
  let bankSnapshot = null;
  const remotes = new Map();
  let menuAngle = MENU.backdrop.startAngle;

  function applySettings(settings) {
    if (!settings) return;
    if (post && typeof post.setQuality === 'function') post.setQuality(settings.quality);
    audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
    if (weather && settings.quality) weather.setQuality(settings.quality);
    if (window.hollowtree) window.hollowtree.settings = settings;
  }

  function updateMenuCamera(dt, elapsed) {
    const b = MENU.backdrop;
    menuAngle += b.speed * dt;
    const ground = terrain.getHeight(HIVE.x, HIVE.z);
    camera.position.set(
      HIVE.x + Math.sin(menuAngle) * b.radius,
      ground + b.height + Math.sin(elapsed * b.bobSpeed) * b.bobAmp,
      HIVE.z + Math.cos(menuAngle) * b.radius
    );
    camera.lookAt(HIVE.x, ground + b.lookHeight, HIVE.z);
    camera.rotateY(b.frameOffset);
    if (camera.fov !== b.fov) {
      camera.fov = b.fov;
      camera.updateProjectionMatrix();
    }
  }

  async function playOpeningCinematic(context) {
    try {
      const module = await import('./cinematic/opening.js');
      if (typeof module.createOpeningCinematic !== 'function') return;
      const shot = module.createOpeningCinematic({
        scene, camera, renderer, terrain, sky, hive, flight, rig, input, context,
        queen, grass, flowers, post, interior, portal,
      });
      if (!shot || typeof shot.play !== 'function') return;
      cinematic = shot;
      mode = 'cinematic';
      if (window.hollowtree) window.hollowtree.cinematic = shot;
      await shot.play();
    } catch (error) {
      console.warn('[main] opening cinematic unavailable —', error && error.message);
    }
    if (cinematic && typeof cinematic.dispose === 'function') cinematic.dispose();
    cinematic = null;
  }

  async function connectNet(context) {
    try {
      net = context && context.net && typeof context.net.detach === 'function'
        ? context.net.detach()
        : createNet(context);
      netInfo = await net.ready;
      net.onPeerJoin((peer) => {
        if (!createQueen || remotes.has(peer.uid)) return;
        const visual = createQueen(scene, assets);
        remotes.set(peer.uid, visual);
      });
      net.onPeerLeave((peer) => {
        const visual = remotes.get(peer.uid);
        if (visual && visual.object3D) scene.remove(visual.object3D);
        remotes.delete(peer.uid);
      });
      if (gather && net.bank) {
        gather.onDeposit((event) => {
          const applied = (event && event.applied) || {};
          for (const kind of Object.keys(applied)) {
            if (applied[kind] > 0) net.bank.deposit(kind, applied[kind]);
          }
        });
        net.bank.onChange((snapshot) => { bankSnapshot = snapshot; });
      }
    } catch (error) {
      console.warn('[main] multiplayer unavailable —', error && error.message);
      net = null;
      netInfo = null;
    }
  }

  async function enterWorld(context) {
    session = context || null;
    await connectNet(session);
    await playOpeningCinematic(session);
    camera.fov = CAMERA.fov;
    camera.updateProjectionMatrix();
    mode = 'play';
    hint.style.opacity = DEV.hintOpacity;
  }

  function openLobby(context) {
    const lobby = createLobby({
      mode: context.mode,
      code: context.code,
      profile: context.profile,
      onEnter: (result) => enterWorld({ ...context, ...result }),
      onCancel: () => menu.show(),
    });
    lobby.show();
  }

  const menu = createMenu({
    onSettings: applySettings,
    onLaunch: (context) => {
      audio.unlock();
      if (context.mode === 'solo') enterWorld(context);
      else openLobby(context);
    },
  });
  applySettings(menu.settings);

  loop.onFixed((dt) => {
    if (mode !== 'play') return;
    input.update(dt);
    const cameraYaw = rig && typeof rig.yaw === 'number' ? rig.yaw : input.yaw;
    flight.update(dt, input, cameraYaw);
    if (weather) flight.velocity.addScaledVector(weather.windAt(flight.position), dt);
    if (portal) portal.update(dt);
    if (gather) gather.update(dt, input);
    if (net) {
      net.publishSelf({
        position: flight.position,
        quaternion: flight.quaternion,
        velocity: flight.velocity,
        carrying: gather ? gather.state.load : 0,
        swarm: {},
        cosmetic: session && session.profile
          ? { color: session.profile.color, pattern: session.profile.pattern }
          : null,
      });
    }
  });

  loop.onRender((alpha, dt, elapsed) => {
    if (sky && typeof sky.update === 'function') sky.update(dt, camera.position, elapsed);
    if (weather) {
      if (typeof weather.setIndoor === 'function') {
        weather.setIndoor(portal ? portal.state.insideness : 0);
      }
      weather.update(dt, elapsed, camera.position);
    }
    if (grass && typeof grass.update === 'function') grass.update(dt, camera.position, elapsed);
    if (queen && typeof queen.update === 'function' && mode !== 'cinematic') queen.update(dt, flight, elapsed);
    if (mode === 'play') {
      if (rig && typeof rig.update === 'function') rig.update(dt, input, flight);
      if (interior && portal) interior.clampCamera(camera, portal.state.insideness);
    } else if (mode === 'cinematic' && cinematic && typeof cinematic.update === 'function') {
      cinematic.update(dt, elapsed);
    } else if (mode !== 'cinematic') {
      updateMenuCamera(dt, elapsed);
    }
    if (flowers && typeof flowers.update === 'function') {
      flowers.update(dt, mode === 'cinematic' ? camera.position : flight.position, elapsed);
    }
    if (hive && typeof hive.update === 'function') hive.update(dt, elapsed);
    if (net) {
      net.update(dt);
      for (const [uid, visual] of remotes) {
        const peer = net.peers.get(uid);
        if (!peer || !peer.hasMotion || !visual) continue;
        visual.update(dt, {
          position: peer.position,
          quaternion: peer.quaternion,
          speedRatio: Math.min(1, Math.hypot(peer.velocity.x, peer.velocity.y, peer.velocity.z) / FLIGHT.maxSpeed),
          boostAmount: 0,
        });
      }
    }

    if (gather && mode === 'play') {
      gameHud.update(dt, {
        gather: gather.state,
        resources: bankSnapshot || resources.snapshot(),
      });
    }

    audio.update(dt, {
      insideness: portal ? portal.state.insideness : 0,
      speed: typeof flight.speed === 'number' ? flight.speed : flight.velocity.length(),
      swarmSize: 0,
      season: (window.hollowtree && window.hollowtree.season) || 'summer',
      timeOfDay: sky && typeof sky.timeOfDay === 'number' ? sky.timeOfDay : 0.5,
      position: flight.position,
      gathering: gather ? gather.state.charge : 0,
    });

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

    hint.style.opacity = mode !== 'play' || input.pointerLocked ? 0 : DEV.hintOpacity;

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
    hive, menu, audio, weather,
    enterWorld,
    get mode() { return mode; },
    get session() { return session; },
    get net() { return net; },
    get netInfo() { return netInfo; },
    get remotes() { return remotes; },
    nest: interior ? { interior, portal, grid: interior.grid, spec: interior.spec } : null,
  };

  setProgress(1);
  updateMenuCamera(0, 0);
  renderer.render(scene, camera);
  if (loadingEl) loadingEl.classList.add('hidden');
  hint.style.opacity = 0;
  menu.show();

  loop.start();
}

boot().catch((error) => {
  console.error('[main] boot failed', error);
  if (loadingEl) {
    const hintEl = document.getElementById('hint');
    if (hintEl) hintEl.textContent = 'failed to start — see console';
  }
});
