// Hollowtree — the opening cinematic: a queen hatches in the hollow, crosses it to the light,
// flies out into the meadow, and the world turns around her before the player takes the stick.
// Nine authored shots, 52 s, a pure function of elapsed time from one shared start timestamp so
// every client in a session sees the identical cut.
//
// Every camera number below is expressed in a frame built from measured, live geometry — never
// from guessed constants. Two frames are used:
//
//   the aperture frame          the natal frame
//   W    spec.entrancePos       N     the natal cell centre, from the live comb lattice
//   O    hive.entrance          M     N + faceOut * (cell depth / 2) — the cell mouth
//   n    spec.entranceNormal    faceOut  the build wall's inward normal, (0,0,1) as shipped
//   inward -n                   tan   cross(up, faceOut), (1,0,0) as shipped
//   tan  (n.z, 0, -n.x)         up    (0,1,0)
//
// WHERE SHE HATCHES (2026-08-08, second pass)
// -------------------------------------------
// She used to hatch from a free-standing prop — `PLACEHOLDER_comb_cells`, 420 instanced cells
// parked out in the meadow at (-20, 19, -52) and struck at the cut. It was a lie the player
// caught: the first thing the opening showed them was a wall of brood that does not exist
// anywhere in the game, and the place they actually start — the seven-cell flower on the build
// wall, under the START marker — they had never seen.
//
// The prop is gone. The natal cell is now a REAL cell of the hive's starting comb, read live from
// `nest.comb.seedAnchor()` and `nest.grid`: the seed sits at (0.382, 15.623, -84.487) on wall 2
// and she hatches from the cell directly above-right of it at (0.881, 16.488, -84.487). Nothing
// is staged there but the wax capping over her cell (which breaks and falls, so it is gone by
// design), a dark hex standing in for the open cell under it, and the pollen drifting in the build
// wall's rake light. When the player flies back in twenty minutes later, that cell is still there,
// with six of its neighbours, and it is where they place their first comb.
//
// Nothing in this file hard-codes those coordinates: seedAnchor() and grid.cellCenter() are read
// at play() time, the wall normal is derived from the lattice (layer 1 minus layer 0), and the
// natal cell is chosen as the neighbour with the greatest lift so the pick is stable. The numbers
// above are what the shipped layout reports; the hall volume is rebuilt from the loaded GLB, so
// the seed's z has been observed at both -84.487 and -85.330 across loads. Use natalReport().
//
// That change costs the old "she is one cell of thousands" beat — there are seven cells, not
// thousands — and replaces it with a truer one: the crane in `reveal` pulls back off a comb the
// size of a dinner plate until it is a speck on a 96 x 63 m empty wall. The hollow is empty
// because the player has not built it yet.
//
// The gameplay START sprite stays suppressed while mode === 'cinematic' (comb.js already does
// this). It is a wayfinding marker for play, and a floating UI word is the one thing that would
// make these frames read as a tutorial instead of a film. It reappears on the same cell the
// instant play starts, which is now a callback rather than a first sighting.
//
// THE TIME-LAPSE (shot 8)
// -----------------------
// The opening was 24 s and read as a cut to gameplay. Shot 8 is 12.4 s of held wide on the tree
// in which the world's own clock is run fast: `sky.setTimeOfDay` is driven through exactly two
// whole days (so the offset is 0 mod 1 at the end and the hand-back is bit-exact), and the real
// weather schedule is re-based onto a 3 s phase so its authored chain — clear, overcast, storm,
// wind, rain — plays out in one shot with the system's own transitions. Nothing is faked: the
// sun really moves, the shadow cascade really sweeps, the rain is `weather.js` rain and the wind
// is bending the same grass the player will fly over. Both systems are put back exactly as they
// were; see driveSky/driveWeather.
//
// Reference numbers for the layout:
//   hall               x[-48,48]  y[3.20,66.84]  z[-89.40,-25.40]   (bounding volume)
//   build wall         comb cells at z ~ -84.49, cell mouths 0.24 m proud of that, wall skin
//                      0.12 m behind them; the cell pitch is 1.00 m across flats
//   W                  (0, 16.00, -25.403)      O = (0, 16.00, -22.203)
//   hive group         (0, 0.00, -30)           terrain flat (y≈0) for 60 m around the trunk
//   trunk bbox         x[-21.0, 22.4]  y[0, 66.1]  z[-50.4, -11.1]
//   canopy leaf bbox   x[-28.8, 31.5]  y[37.1, 74.0]  z[-57.0, -9.6]
//
// Interior shots run with the trunk hidden (applyEnv); exterior shots run with it visible and are
// kept far outside the bark and below the leaf mass. Do not move a camera point in this file
// without re-running measureClearance() — that is what it is for. The macro shots are necessarily
// closer to a wall than the old prop staging was, because the subject is a 1 m cell on that wall
// and not a 21 m slab hanging in mid-air; the floor is 3 m and it is measured, not assumed.

import * as THREE from 'three';
import { CINEMATIC, INTRO, HIVE, INTERIOR, PALETTE, SKY, WORLD } from '../config.js';
import { createDirector, shotPosition, easing } from './director.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _fog = new THREE.Color();

// ---------------------------------------------------------------------------
// The sequence. Times are absolute seconds from the shared start timestamp.
// ---------------------------------------------------------------------------

const DURATION = 52.0;

// Nine beats. The cut at `burst` is load-bearing: FLASHES fires a bloom on exactly that frame to
// mask the swap from interior shell to world, so its `at` must not move without moving the flash.
const SHOTS = [
  // id        at      dur    ease        fov         handheld  shake
  { id: 'hatch', at: 0.0, dur: 6.6, ease: 'smooth', fov: [30, 23], handheld: 0.20, shake: 0.0 },
  { id: 'emerge', at: 6.6, dur: 5.4, ease: 'out', fov: [34, 27], handheld: 0.34, shake: 0.05 },
  { id: 'reveal', at: 12.0, dur: 6.2, ease: 'inOut', fov: [38, 62], handheld: 0.16, shake: 0.0 },
  { id: 'hall', at: 18.2, dur: 5.0, ease: 'inOut', fov: [50, 34], handheld: 0.20, shake: 0.0 },
  { id: 'launch', at: 23.2, dur: 4.4, ease: 'in', fov: [46, 28], handheld: 0.30, shake: 0.12 },
  { id: 'burst', at: 27.6, dur: 3.2, ease: 'out', fov: [52, 47], handheld: 0.42, shake: 0.18 },
  { id: 'wide', at: 30.8, dur: 4.2, ease: 'settle', fov: [56, 48], handheld: 0.16, shake: 0.0 },
  // The passage-of-time beat. Held wide, almost locked off — the drift is 7 m over 12.4 s — so the
  // only thing moving in frame is the world: sun, shadow, cloud colour, rain, wind in the grass.
  { id: 'lapse', at: 35.0, dur: 12.4, ease: 'inOut', fov: [46, 44], handheld: 0.05, shake: 0.0 },
  { id: 'settle', at: 47.4, dur: 4.6, ease: 'settle', fov: [66, 62], handheld: 0.12, shake: 0.0 },
];

const T = {};
for (const s of SHOTS) T[s.id] = s;

const CARDS = [
  { at: 12.6, dur: 4.0, fade: 1.0, text: 'title', size: 1.0 },
  { at: 43.2, dur: 3.0, fade: 0.9, text: 'subtitle', size: 0.36 },
];

// One bloom on the cut from the hollow into daylight — it also masks the frame where the interior
// shell is swapped for the world.
const FLASHES = [{ at: 27.6, dur: 0.55, peak: 0.9, color: '#fff4dd' }];

// Staging constants, in metres, in the frames described at the top of the file.
const STAGE = {
  perchOut: 1.9, //   out along faceOut from the cell mouth to where she rests
  perchDrop: -0.75,
  capBreakAt: 4.7,
  capFall: 2.0,
  capTrembleFrom: 2.2,
  emergeEnd: 10.2, // queen is fully out of the cell
  liftAt: 18.4, //    she leaves the comb and starts the long crossing
  emergeOut: 1.0,
  hoverDrift: 0.35,
  // queen exit arc, shared by burst/wide, landing before the time-lapse
  exitEnd: 35.0,
  restLateral: 3.0,
  restOut: 17.2,
  restDrop: -6.0,
};

// The time-lapse. Both systems are the game's own; both are handed back.
const LAPSE = {
  // sky: exactly `days` whole days, eased in and out, so the offset is 0 mod 1 at skyTo and the
  // sky lands back on the true world time to the millisecond.
  skyFrom: 35.8,
  skyTo: 46.6,
  days: 2,
  // weather: re-base the real schedule onto a fast phase. Seed 45's authored chain from index 0 is
  // clear → overcast → storm → wind → rain → clear, which is the arc this shot wants and which
  // ends calm, so the handoff shot is not played in a downpour.
  wxOn: 35.2,
  wxSeed: 45,
  wxPhaseMs: 3000,
  wxTransitionMs: 1700,
  // Put the real schedule back under the closing fade-to-black (which runs from 50.4 to 52.0), so
  // the one frame where the chain jumps back to true world time is at ~94% black.
  wxOff: 51.6,
};

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

function finishGeo(buf) {
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
  const geo = finishGeo(buf);
  geo.scale(length, length, length);
  return geo;
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

// Only used when the nest module failed to load — the real numbers always come from interior.spec.
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

  const workers = instanced('PLACEHOLDER_worker_swarm', workerGeo, INTRO.workerMax);
  stage.add(workers);

  // The only thing this cinematic adds to the build wall: the wax capping over the one cell she is
  // in. It is a hexagon the size of a real cell face, it breaks at STAGE.capBreakAt and falls, and
  // it is gone from the frame long before the cut — a capping that has been hatched out of is
  // supposed to be gone, so nothing here survives into play.
  const capGeo = new THREE.CircleGeometry(0.5, 6);
  capGeo.rotateZ(Math.PI * 0.5); // pointy-top, matching hexCellGeometry's cell mouths
  const cap = new THREE.Mesh(
    capGeo,
    new THREE.MeshLambertMaterial({
      color: 0xf6dfab,
      emissive: 0x4a3312,
      flatShading: true,
      side: THREE.DoubleSide,
    })
  );
  cap.name = 'cinematic_natal_cap';
  cap.visible = false;
  stage.add(cap);

  // The hive's cells are closed hex prisms — a sealed plug, not an open tube — so with nothing but
  // a capping on top there is no visual difference between a cell she can hatch out of and its six
  // neighbours, and once the capping falls she would push out of solid wax. This is the opening of
  // her cell: a dark hex face a few centimetres proud of the real one, under the capping, revealed
  // when it breaks. It is 0.9 m across, it lives in the cinematic stage, and it goes with it.
  const mouthGeo = new THREE.CircleGeometry(0.47, 6);
  mouthGeo.rotateZ(Math.PI * 0.5);
  const mouth = new THREE.Mesh(
    mouthGeo,
    new THREE.MeshBasicMaterial({ color: 0x2a1a0b, side: THREE.DoubleSide, toneMapped: true })
  );
  mouth.name = 'cinematic_natal_mouth';
  mouth.visible = false;
  stage.add(mouth);

  const motePos = new Float32Array(INTRO.moteCount * 3);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: INTRO.colors.mote,
      size: INTRO.moteSize * 1.6,
      map: moteSprite(),
      transparent: true,
      opacity: 0.85,
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
  let fogOwned = false;
  let restoreFog = null;

  // ---------------------------------------------------------------- audio ---
  // cutscene-music.mp3 already has a manifest entry and a music track ("cutscene") in
  // config.audio.js, so it routes through the same music bus as every other track and therefore
  // respects the master and music sliders. It is not a `core` asset, so at the moment the cinematic
  // starts the buffer is usually still decoding; music() returns null in that case, hence the retry.
  const audio = ctx.audio || (typeof window !== 'undefined' && window.hollowtree ? window.hollowtree.audio : null);
  let musicHandle = null;
  let musicTimer = 0;
  let musicTries = 0;
  let musicStopped = true;

  function startMusic() {
    if (!audio || typeof audio.music !== 'function') return;
    musicStopped = false;
    musicHandle = null;
    musicTries = 60; // ~9 s of retries at 150 ms — covers a cold decode of the mp3
    musicTimer = 0;
    pumpMusic(0);
  }

  function pumpMusic(dt) {
    if (musicStopped || musicHandle || musicTries <= 0) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer = 0.15;
    musicTries--;
    // force: true bypasses the sting min-gap; the opening always gets its track.
    const source = audio.music('cutscene', { force: true });
    if (source) musicHandle = source;
  }

  function stopMusic(fade) {
    if (musicStopped) return;
    musicStopped = true;
    musicTries = 0;
    musicHandle = null;
    if (audio && typeof audio.stopMusic === 'function') audio.stopMusic(fade);
  }

  // ------------------------------------------------- world clock and weather ---
  //
  // Both of these drive a live game system forward and then hand it back. Neither fakes anything:
  // there is no time-lapse texture, no second sun, no scripted cloud sprite.

  // main.js recomputes the time of day from the world clock every frame and pushes it into
  // sky.update() BEFORE the cinematic gets its update, so writing sky.setTimeOfDay() from here
  // would be overwritten by weather's own light grade on the following frame — weather multiplies
  // whatever the sky last wrote. Wrapping sky.update instead puts the offset in at the right point
  // in the frame: main's true time of day goes in, ours comes out, and weather still grades on top
  // of it. The wrapper is installed for the whole sequence and removed on teardown; outside the
  // lapse window skyOffsetAt() returns 0, so it is a no-op.
  let skyPatch = null;

  function skyOffsetAt(t) {
    if (!(t > LAPSE.skyFrom)) return 0;
    if (t >= LAPSE.skyTo) return 0; // LAPSE.days is a whole number of days: 0 mod 1
    const u = smoothstep(LAPSE.skyFrom, LAPSE.skyTo, t);
    return (LAPSE.days * u) % 1;
  }

  function patchSky() {
    const sky = ctx.sky;
    if (skyPatch || !sky || typeof sky.update !== 'function') return;
    const original = sky.update;
    skyPatch = { sky, original };
    sky.update = function patched(dt, timeOfDay, target) {
      if (typeof timeOfDay === 'number' && director.active) {
        const shifted = (timeOfDay + skyOffsetAt(director.time)) % 1;
        return original.call(sky, dt, shifted, target);
      }
      return original.call(sky, dt, timeOfDay, target);
    };
  }

  function unpatchSky() {
    if (!skyPatch) return;
    skyPatch.sky.update = skyPatch.original;
    skyPatch = null;
  }

  // The weather schedule is a pure function of (seed, startedAt, durationMs, transitionMs) and the
  // world clock, so accelerating it is a matter of re-basing those four numbers and putting them
  // back. setFromWorld() is the module's own entry point for exactly this — it cross-fades from
  // the look on screen into the new schedule rather than cutting — and it is what a multiplayer
  // session already uses to push the host's weather at every client.
  let wxSaved = null;

  function driveWeather(t) {
    const weather = ctx.weather;
    if (!weather || typeof weather.setFromWorld !== 'function' || !weather.schedule) return;
    if (!wxSaved && t >= LAPSE.wxOn && t < LAPSE.wxOff) {
      const s = weather.schedule;
      wxSaved = {
        seed: s.seed,
        startedAt: s.startedAt,
        durationMs: s.durationMs,
        transitionMs: s.transitionMs,
        kind: s.kind,
        intensity: s.intensity,
      };
      weather.setFromWorld({
        seed: LAPSE.wxSeed,
        startedAt: Date.now(),
        durationMs: LAPSE.wxPhaseMs,
        transitionMs: LAPSE.wxTransitionMs,
        kind: s.kind,
        intensity: s.intensity,
      });
    } else if (wxSaved && t >= LAPSE.wxOff) {
      restoreWeather();
    }
  }

  // Exact restore: the same six numbers back, through the same door they went out of. The look on
  // screen then eases from the last fast phase into the true one over the schedule's own
  // transitionMs — a normal 150 s weather change, i.e. the thing the game does anyway — and
  // weather.sample() is bit-identical to the untouched chain from the first frame after this call.
  function restoreWeather() {
    const weather = ctx.weather;
    if (!wxSaved) return;
    const saved = wxSaved;
    wxSaved = null;
    if (weather && typeof weather.setFromWorld === 'function') weather.setFromWorld(saved);
  }

  // ------------------------------------------------------------ start marker ---
  //
  // comb.js already intends the START sprite to be suppressed during the opening — it tests
  // `host.mode === 'cinematic'` — but that test lives in comb.update(), and main.js only calls
  // comb.update() from the fixed step when mode === 'play'. So during the cinematic the check
  // never runs and the sprite keeps whatever visibility it was built with, which is on. It did not
  // matter while the opening was staged 60 m away in the meadow; now that the shot is ON the seed
  // comb, the word START floats in the middle of the reveal. Hidden here, restored on teardown.
  //
  // And it should be hidden: the marker is play-mode wayfinding, and a floating UI word in these
  // frames would make the opening read as a tutorial. The player meets the cell first as a place,
  // then finds it labelled the moment they have the stick — a callback rather than a caption.
  let startLabel = null;
  let startLabelWas = true;

  function findStartLabel() {
    if (startLabel) return startLabel;
    const group = ctx.comb && ctx.comb.group;
    if (!group) return null;
    group.traverse((node) => {
      if (node.name === 'comb_start_label') startLabel = node;
    });
    if (startLabel) startLabelWas = startLabel.visible;
    return startLabel;
  }

  function setStartMarker(visible) {
    const label = findStartLabel();
    if (!label) return;
    label.visible = visible ? startLabelWas : false;
  }

  // ------------------------------------------------------------- geometry ---

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

  // p(base, axis, amount, axis, amount, ...) — the only way camera points are authored in this file.
  function p(base, ...parts) {
    const out = base.clone();
    for (let i = 0; i < parts.length; i += 2) out.addScaledVector(parts[i], parts[i + 1]);
    return out;
  }

  // The natal cell, read from the live hive rather than invented. seedAnchor() is the middle of the
  // seven-cell starting flower; the cell she hatches from is the neighbour above it, so the seed
  // and the rest of the flower sit under her in the macro frames and the whole cluster is the thing
  // the crane in `reveal` pulls away from.
  function natalCell() {
    const comb = ctx.comb;
    const grid = ctx.grid || (comb && comb.grid) || (ctx.interior && ctx.interior.grid) || null;
    const anchor = comb && typeof comb.seedAnchor === 'function' ? comb.seedAnchor() : null;
    if (!anchor || !grid || typeof grid.cellCenter !== 'function') return null;

    const seed = anchor.position.clone();
    // Wall normal, straight from the lattice: layer 1 is one cell-depth further off the wall than
    // layer 0, so the difference is the inward normal. No hard-coded (0,0,1).
    const l0 = grid.cellCenter(anchor.col, anchor.row, 0, new THREE.Vector3());
    const l1 = grid.cellCenter(anchor.col, anchor.row, 1, new THREE.Vector3());
    const faceOut = l1.clone().sub(l0);
    if (faceOut.lengthSq() < 1e-8) faceOut.set(0, 0, 1);
    faceOut.normalize();

    // Pick the neighbour with the greatest lift, tie-broken laterally, so the choice is stable
    // across runs and lattices instead of depending on neighbour ordering.
    const list = typeof grid.neighbors === 'function' ? grid.neighbors(anchor.col, anchor.row, 0, []) : [];
    let best = null;
    let bestKey = -Infinity;
    const tanProbe = new THREE.Vector3(0, 1, 0).cross(faceOut).normalize();
    for (const c of list) {
      if (c.layer !== 0) continue;
      const pos = grid.cellCenter(c.col, c.row, c.layer, new THREE.Vector3());
      if (pos.distanceTo(seed) > grid.cellSize() * 1.6) continue; // stay on this wall
      const key = (pos.y - seed.y) * 100 + pos.clone().sub(seed).dot(tanProbe);
      if (key > bestKey) {
        bestKey = key;
        best = { cell: c, pos };
      }
    }
    const chosen = best || { cell: anchor, pos: seed.clone() };
    return {
      seed,
      cell: chosen.cell,
      position: chosen.pos,
      faceOut,
      cellSize: typeof grid.cellSize === 'function' ? grid.cellSize() : 1,
    };
  }

  function buildAnchors() {
    const spec = (ctx.interior && ctx.interior.spec) || fallbackSpec(ctx.hive, ctx.terrain);
    const n = new THREE.Vector3().copy(spec.entranceNormal).setY(0).normalize();
    const inward = n.clone().negate();
    const tan = new THREE.Vector3(n.z, 0, -n.x).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    // W — aperture on the inner wall. O — aperture mouth on the bark, measured from the GLB anchor.
    const W = spec.entrancePos.clone();
    const O = ctx.hive && ctx.hive.entrance ? ctx.hive.entrance.clone() : p(W, n, HIVE.entranceRadius);
    const hivePos = ctx.hive && ctx.hive.position
      ? ctx.hive.position.clone()
      : new THREE.Vector3(HIVE.x, spec.floorY, HIVE.z);

    // The natal cell, live from the comb. The fallback keeps the module standing if the nest failed
    // to load: the middle of the build wall, which is where the seed would have been.
    const natal = natalCell();
    const wall = spec.buildWall;
    const cellRoot = natal
      ? natal.position.clone()
      : wall
        ? p(wall.centre.clone(), wall.normal, 0.12)
        : p(W, inward, spec.depth - 1.0, up, 0.0);
    const faceOut = natal
      ? natal.faceOut.clone()
      : wall
        ? wall.normal.clone().normalize()
        : n.clone();
    const seedRoot = natal ? natal.seed.clone() : cellRoot.clone();
    const cellSize = natal ? natal.cellSize : 1;
    // Lateral axis of the wall, always well defined and always right-handed with (up, faceOut).
    const wtan = new THREE.Vector3().crossVectors(up, faceOut).normalize();
    // Cell prisms are COMB.cellDepth * depthFill deep and centred on cellCenter, so the mouth is
    // half that proud of the centre. 0.24 m on the shipped lattice.
    const cellMouth = p(cellRoot, faceOut, 0.24);
    const perch = p(cellMouth, faceOut, STAGE.perchOut, up, STAGE.perchDrop);

    // Bee traffic anchors, in the open middle of the hall between the two walls.
    const streamOut = p(W, inward, 1.5);
    const streamDeep = p(W, inward, 44.0, tan, -9.0, up, 10.0);
    const hallFocus = p(W, inward, 34.0, tan, -15.0, up, 11.0);

    // The queen's resting spot in the meadow, and the exact pose the play rig will inherit.
    const rest = p(O, tan, STAGE.restLateral, n, STAGE.restOut, up, STAGE.restDrop);

    Object.assign(anchors, {
      spec, n, inward, tan, up, W, O, hivePos,
      natalCell: natal ? natal.cell : null,
      cellRoot, seedRoot, faceOut, wtan, cellSize, cellMouth, perch,
      streamOut, streamDeep, hallFocus, rest,
    });

    // The queen leaves the hollow along this arc and comes to rest at `rest`.
    anchors.exitCurve = new THREE.CatmullRomCurve3(
      [
        p(O, n, -0.8),
        p(O, n, 3.2, tan, 1.2, up, 0.6),
        p(O, n, 8.7, tan, 3.4, up, -1.4),
        rest.clone(),
      ],
      false,
      'centripetal',
      0.5
    );

    // Comb → aperture: the full 59 m length of the hollow, which is the crossing the shot pair
    // `hall` + `launch` covers. She pushes off the wall, climbs into the open middle, and only
    // converges on the trunk axis in the last two control points, where the aperture bore in
    // hollow-tree.glb is ~2.7 m clear at y = 16.
    anchors.launchCurve = new THREE.CatmullRomCurve3(
      [
        perch.clone(),
        p(cellMouth, faceOut, 6.0, wtan, -2.4, up, 2.2),
        p(cellMouth, faceOut, 17.0, wtan, -5.0, up, 5.0),
        p(W, inward, 30.0, tan, -4.0, up, 5.0),
        p(W, inward, 14.0, tan, -1.5, up, 2.0),
        p(W, inward, 2.4, up, 0.2),
        p(W, n, 1.2),
      ],
      false,
      'centripetal',
      0.5
    );
  }

  const _pathA = new THREE.Vector3();
  const _pathB = new THREE.Vector3();

  function launchPath(u, out) {
    return anchors.launchCurve.getPoint(THREE.MathUtils.clamp(u, 0, 1), out || _pathA);
  }

  function exitPath(u, out) {
    return anchors.exitCurve.getPoint(THREE.MathUtils.clamp(u, 0, 1), out || _pathA);
  }

  // Normalised progress along the exit arc, shared by burst and wide so the two shots read as one
  // continuous flight. Decelerating, derivative zero at u = 1, so she truly stops before the lapse.
  function exitU(t) {
    const s = THREE.MathUtils.clamp((t - T.burst.at) / (STAGE.exitEnd - T.burst.at), 0, 1);
    return 1 - (1 - s) ** 1.8;
  }

  // Progress along the crossing of the hollow, shared by `hall` and `launch`.
  function crossU(t) {
    // Front-loaded: she shoves off the wall hard and then cruises. A symmetric ease left her still
    // hugging the comb for most of `hall`, which made that shot a second helping of `reveal`
    // instead of the establishing shot of the hollow.
    const s = THREE.MathUtils.clamp((t - STAGE.liftAt) / (T.burst.at - STAGE.liftAt), 0, 1);
    return s ** 0.72;
  }

  // ------------------------------------------------------------- bee crowds ---

  function stream(t, from, count) {
    const { streamDeep, streamOut, tan, up } = anchors;
    let slot = from;
    for (let i = 0; i < count && slot < INTRO.workerMax; i++) {
      const phase = (t * INTRO.streamSpeed + hash(i, 17)) % 1;
      const q = streamDeep.clone().lerp(streamOut, phase);
      q.addScaledVector(tan, Math.sin(phase * 7.0 + hash(i, 19) * 6.3) * 3.2);
      q.addScaledVector(up, Math.cos(phase * 5.4 + hash(i, 23) * 6.3) * 2.4);
      _v3.copy(streamOut).sub(streamDeep).normalize();
      setBee(workers, slot, q, _v3, Math.sin(t * 4 + i) * 0.25, 1);
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
      _v.set(center.x + Math.cos(a) * r, center.y + y, center.z + Math.sin(a) * r);
      _v3.set(-Math.sin(a), 0.1, Math.cos(a)).normalize();
      setBee(workers, slot, _v, _v3, Math.sin(t * 3.3 + i) * 0.3, 1);
      _c.set(INTRO.colors.worker);
      workers.setColorAt(slot, _c);
      slot++;
    }
    return slot;
  }

  function guards(t, from, count) {
    const { O, n, tan, up } = anchors;
    let slot = from;
    for (let i = 0; i < count && slot < INTRO.workerMax; i++) {
      const k = count === 1 ? 0.5 : i / (count - 1);
      const a = -INTRO.guardArc * 0.5 + INTRO.guardArc * k + Math.PI * 0.5;
      const wob = Math.sin(t * INTRO.guardJitterFreq + hash(i, 3) * 9.0);
      const wob2 = Math.sin(t * INTRO.guardJitterFreq * 0.71 + hash(i, 11) * 9.0);
      const radius = INTRO.guardRadius * (0.82 + hash(i, 5) * 0.3) + wob * INTRO.guardJitter;
      _v.copy(O)
        .addScaledVector(n, 1.2 + hash(i, 13) * 2.2 + wob2 * INTRO.guardJitter)
        .addScaledVector(tan, Math.cos(a) * radius)
        .addScaledVector(up, Math.sin(a) * radius * 0.86);
      setBee(workers, slot, _v, n, wob * 0.3, 1);
      _c.set(INTRO.colors.guard);
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

  // --------------------------------------------------------------- staging ---

  // Interior for everything up to the cut at `burst`, world after it. The switch happens under the
  // bloom flash, so the frame where the shell is swapped for the trunk is never visible.
  // The macro shots sit 4-8 m off a wax face on the build wall; that wall has its own rake lamp
  // (interior.js) so the hex relief reads, but at the authored hall intensity a 17-degree lens on
  // it is still murky. Lift the hall while the camera is that close and ease back to the authored
  // level by the time `reveal` opens it out, so the wide shots keep the deep, unlit corners they
  // need to read as a cavern.
  function envAt(t) {
    if (t >= T.burst.at) return { k: 0, gain: 1 };
    const macro = 1 - smoothstep(T.emerge.at, T.reveal.at, t); // the two shots hard against the wax
    const hall = 1 - smoothstep(T.reveal.at, T.launch.at, t); //  the crane that opens it out
    return { k: 1, gain: INTRO.interiorGain * (1 + 0.15 * macro + 0.62 * hall) };
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
    // Drive the fog while we are inside, and restore it exactly once on the way out so the world's
    // own weather-driven fog is left alone for the rest of the sequence.
    if (scene.fog && restoreFog && (k > 0.001 || fogOwned)) {
      fogOwned = k > 0.001;
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
    let queenVisible = false;
    let workerCount = 0;
    cap.visible = false;
    motes.visible = false;

    // --- her cell stands open once the capping is off, and stays open until we are too far to
    //     see it. Struck with the rest of the stage at the cut, like everything else here.
    mouth.visible = t < T.hall.at;
    if (mouth.visible) {
      mouth.position.copy(A.cellMouth).addScaledVector(A.faceOut, 0.028);
      _m.makeBasis(A.wtan, A.up, A.faceOut);
      mouth.quaternion.setFromRotationMatrix(_m);
      mouth.scale.setScalar(A.cellSize);
    }

    // --- the capping on the natal cell: trembles, splits, tumbles away ---
    if (t < STAGE.capBreakAt + STAGE.capFall) {
      cap.visible = true;
      cap.position.copy(A.cellMouth).addScaledVector(A.faceOut, 0.06);
      const tremble = smoothstep(STAGE.capTrembleFrom, STAGE.capBreakAt, t);
      if (t < STAGE.capBreakAt) {
        const wob = Math.sin(t * INTRO.capTrembleFreq * Math.PI * 2) * INTRO.capTremble * tremble;
        cap.position.addScaledVector(A.faceOut, Math.abs(wob) * 1.4);
        cap.position.addScaledVector(A.wtan, wob);
      } else {
        const f = (t - STAGE.capBreakAt) / STAGE.capFall;
        cap.position.addScaledVector(A.faceOut, 0.25 + f * 0.9);
        cap.position.y -= f * f * 4.0;
      }
      _m.makeBasis(A.wtan, A.up, A.faceOut);
      cap.quaternion.setFromRotationMatrix(_m);
      // Aligned with the cell it seals until it breaks — a capping that is already spinning while
      // it is still on the cell shows the dark mouth through its corners.
      if (t >= STAGE.capBreakAt) cap.rotateZ((t - STAGE.capBreakAt) * 2.4);
      cap.scale.setScalar(A.cellSize * 0.99);
    }

    // --- pollen drifting in the build wall's rake light, across the comb face ---
    if (t < T.hall.at) {
      motes.visible = true;
      const life0 = t * 0.3;
      for (let i = 0; i < INTRO.moteCount; i++) {
        const life = (life0 + hash(i, 53)) % 1;
        const ang = hash(i, 59) * Math.PI * 2;
        const rad = 2.2 * (0.25 + hash(i, 61));
        const out = 0.5 + hash(i, 63) * 3.0;
        motePos[i * 3] = A.cellMouth.x + A.wtan.x * Math.cos(ang) * rad + A.faceOut.x * out;
        motePos[i * 3 + 1] = A.cellMouth.y - 1.6 + life * 3.6;
        motePos[i * 3 + 2] = A.cellMouth.z + A.wtan.z * Math.cos(ang) * rad + A.faceOut.z * out;
      }
      moteGeo.attributes.position.needsUpdate = true;
      motes.material.opacity = 0.85 * (1 - smoothstep(T.hall.at - 1.2, T.hall.at, t));
    }

    // --- 6.6 → 10.2 s: she pushes out of the cell ---
    if (t >= T.emerge.at && t < STAGE.emergeEnd) {
      queenVisible = true;
      const u = (t - T.emerge.at) / (STAGE.emergeEnd - T.emerge.at);
      const e = 1 - (1 - u) ** 2.2;
      const wobble = Math.sin(t * 5.4) * INTRO.emergeWobble * (1 - e);
      queenState.position
        .copy(A.cellMouth)
        .addScaledVector(A.faceOut, -0.3 + STAGE.emergeOut * e)
        .addScaledVector(A.wtan, wobble)
        .addScaledVector(A.up, wobble * 0.6 - e * 0.12);
      faceQueen(A.faceOut, wobble * 1.4, INTRO.queenWingIdle + e * 0.3);
    }

    // --- 10.2 → 18.4 s: she settles just off the comb and looks around ---
    if (t >= STAGE.emergeEnd && t < STAGE.liftAt) {
      queenVisible = true;
      const span = STAGE.liftAt - STAGE.emergeEnd;
      const u = (t - STAGE.emergeEnd) / span;
      const e = smoothstep(0, 0.42, u);
      _v.copy(A.cellMouth).addScaledVector(A.faceOut, STAGE.emergeOut);
      queenState.position.copy(_v).lerp(A.perch, e);
      queenState.position.addScaledVector(A.wtan, Math.sin(t * 1.1) * STAGE.hoverDrift * e);
      queenState.position.y += Math.sin(t * 4.6) * 0.08 * e;
      // She turns from facing straight out of the cell to facing the light in the aperture.
      _v2.copy(A.W).sub(queenState.position).normalize();
      _v3.copy(A.faceOut).lerp(_v2, smoothstep(0.55, 0.98, u)).normalize();
      faceQueen(_v3, Math.sin(t * 1.3) * 0.1, 0.28 + e * 0.22);
    }

    // --- 18.4 → 27.6 s: the crossing, comb wall to aperture, 59 m ---
    if (t >= STAGE.liftAt && t < T.burst.at) {
      queenVisible = true;
      const e = crossU(t);
      queenState.position.copy(launchPath(e, _pathA));
      _v2.copy(launchPath(Math.min(1, e + 0.02), _pathB)).sub(queenState.position);
      if (_v2.lengthSq() < 1e-6) _v2.copy(A.n);
      _v2.normalize();
      faceQueen(_v2, -Math.sin(e * Math.PI) * 0.22, 0.42 + e * 0.55);
    }

    // --- 27.6 → 35.0 s: out into the meadow, decelerating to a hover ---
    if (t >= T.burst.at && t < STAGE.exitEnd) {
      queenVisible = true;
      const u = exitU(t);
      queenState.position.copy(exitPath(u, _pathA));
      _v2.copy(exitPath(Math.min(1, u + 0.015), _pathB)).sub(queenState.position);
      if (_v2.lengthSq() < 1e-6) _v2.copy(A.n);
      _v2.normalize();
      // She swings round to face the tree as she settles, so the play rig inherits a bee that is
      // already pointing where the default camera (yaw 0, pitch 0) looks: straight down -Z.
      const land = smoothstep(0.82, 1.0, u);
      _v3.copy(_v2).lerp(_v.copy(A.n).negate(), land).normalize();
      faceQueen(_v3, -0.3 * Math.sin(u * Math.PI * 0.9) * (1 - land), 1 - land * 0.85);
    }

    // --- 35.0 s → end: she holds station in the meadow while the world turns ---
    if (t >= STAGE.exitEnd) {
      queenVisible = true;
      // The bob is damped to nothing over the last second so the pose handed to the play rig is
      // `rest` exactly, not `rest` plus whatever the sine happened to be on the final frame.
      const calm = 1 - smoothstep(DURATION - 1.4, DURATION - 0.1, t);
      queenState.position.copy(A.rest);
      queenState.position.y += Math.sin(t * 1.9) * 0.12 * calm;
      queenState.position.addScaledVector(A.tan, Math.sin(t * 0.7) * 0.1 * calm);
      _v3.copy(A.n).negate().applyAxisAngle(A.up, Math.sin(t * 0.31) * 0.16 * calm);
      faceQueen(_v3, 0, 0.16);
    }

    // --- bee traffic ---
    if (t >= T.reveal.at && t < T.launch.at) {
      // Kept small and kept away from the lens: the placeholder worker is a four-sphere blob with
      // two quad wings and it does not survive being 3 m from a 50 mm lens.
      workerCount = orbit(t, 0, 18, A.hallFocus, 13.0, 16.0);
      workerCount = stream(t, workerCount, 16);
    } else if (t >= T.launch.at && t < T.burst.at) {
      workerCount = stream(t, 0, 14);
    } else if (t >= T.burst.at && t < T.wide.at) {
      workerCount = guards(t, 0, 10);
    }

    commitWorkers(workerCount);
    if (ctx.queen && ctx.queen.object3D) ctx.queen.object3D.visible = queenVisible;
  }

  // ---------------------------------------------------------------- shots ---

  function buildTimeline() {
    const A = anchors;
    const { inward, tan, up, n, W, O, cellRoot, seedRoot, cellMouth, faceOut, wtan, hivePos, rest } = A;
    const shot = (id, extra) => Object.assign({}, T[id], extra);
    const queenAt = () => queenState.position;

    // The exact pose createCameraRig produces on its first frame for a bee resting at `rest` with
    // input.yaw = 0 and input.pitch = 0 (the state the player is handed). Ending the last shot here
    // means the cut into play mode moves the camera by ~0 m and ~0 rad.
    //   desired = rest - dir*CAMERA.distance + up*CAMERA.height,  dir = (0,0,-1)
    //   look    = rest + up*CAMERA.lookUp + dir*CAMERA.lookAhead*0.35
    const handoffPos = p(rest, n, 4.6, up, 1.35);
    // The rig's look target is `rest + up*CAMERA.lookUp + dir*CAMERA.lookAhead*0.35`, but it does
    // NOT start there: createCameraRig initialises its smoothed look to the bee itself and eases in
    // at CAMERA.lookStiffness, so its very first frame is only ~1 - exp(-17/60) = 0.246 of the way.
    // Ending the last shot on the steady-state target therefore cut 5.29 degrees — measured — to a
    // camera that was still most of the way back at the bee. Landing on the rig's FIRST frame
    // instead makes the cut itself exact; the remaining few degrees are then eased in by the rig
    // over ~0.2 s, which reads as the camera settling rather than as a jump.
    const HANDOFF_LOOK_K = 0.246;
    const handoffLook = p(rest, up, 0.5 * HANDOFF_LOOK_K, n, -0.665 * HANDOFF_LOOK_K);

    const shots = [
      // 1. HATCH — macro on the capped natal cell, a 2.5 m push while the capping trembles and
      //    splits. The cell is 1 m across, so this is a long lens (24 -> 17 deg) rather than a close
      //    camera: the frame holds ~3 cells at the start and ~1.5 at the end, and the camera never
      //    comes within 5 m of the wall. The seven-cell flower and the seed cell sit just below her
      //    in frame the whole time — that is the point of the shot.
      shot('hatch', {
        pos: [
          p(cellMouth, faceOut, 9.5, wtan, 2.6, up, 1.6),
          p(cellMouth, faceOut, 6.4, wtan, 1.3, up, 0.8),
        ],
        // Centred between her cell and the seed cell below it, so the seven-cell flower — the
        // exact cluster the player will find under the START marker — is the composition and her
        // capping is the bright thing in the middle of it.
        look: [p(seedRoot, up, 0.50), p(seedRoot, up, 0.42)],
      }),

      // 2. EMERGE — a low, rising arc round the far side of the cell as she climbs out. Held on the
      //    queen, so she is the subject from her first frame.
      shot('emerge', {
        pos: [
          p(cellMouth, faceOut, 4.8, wtan, -3.1, up, -2.0),
          p(cellMouth, faceOut, 6.9, wtan, -1.9, up, 1.35),
        ],
        lookFn: () => _v2.copy(queenAt()).addScaledVector(up, 0.12),
      }),

      // 3. REVEAL — the scale beat, inverted from what it used to be. The old version craned back
      //    off a 21 m prop wall of brood to say "she is one of thousands". There are seven cells,
      //    and the honest beat is the opposite: crane back off a comb the size of a dinner plate
      //    until it is a bright speck on 96 x 63 m of bare wall. The hollow is empty. That is the
      //    game.
      //
      //    Two earlier framings of this shot failed and both are worth keeping written down.
      //    Pointing the look at the lit aperture put a gallery ledge 4.8 m in front of the lens and
      //    ended on a flat brown field. Craning until the comb left frame entirely ended on bare
      //    wall with nothing to hold the eye. The look therefore stays pinned to the comb cluster:
      //    however wide it goes, the thing the shot is about is still in the middle of the frame.
      shot('reveal', {
        pos: [
          p(cellMouth, faceOut, 8.0, wtan, 0.8, up, 2.0),
          p(cellMouth, faceOut, 23.0, wtan, 3.2, up, 7.5),
          p(cellMouth, faceOut, 38.0, wtan, 5.5, up, 12.5),
        ],
        lookFn: (u) =>
          _v2
            .copy(queenAt())
            .addScaledVector(up, 0.3)
            .lerp(p(seedRoot, up, 0.4), smoothstep(0.10, 0.92, u)),
      }),

      // 4. HALL — the establishing shot of the hollow, and the shot she leaves the comb in. Held
      //    wide in the open middle of the hall with the comb wall behind her, the far entrance
      //    light in frame, and workers crossing the volume. The lens tightens 50 -> 34 as she comes
      //    toward camera so she grows from a speck on the wall to a readable figure.
      shot('hall', {
        pos: [
          p(W, inward, 34.6, tan, 14.0, up, 16.0),
          p(W, inward, 28.6, tan, 10.0, up, 13.0),
        ],
        // Held on the aperture and pulled only 30% of the way toward her, so the lit hole she is
        // heading for anchors the frame and she crosses it. Aiming this shot at the queen made it
        // a second helping of `reveal`; aiming it above the gallery tiers is what lets the frame
        // contain floor, ledges, ceiling and the entrance at once.
        lookFn: (u) => _v2.copy(p(W, inward, 5.0, up, 1.0)).lerp(queenAt(), 0.14 + 0.26 * u),
      }),

      // 5. LAUNCH — reverse angle across the hall as she runs the last 30 m at the light. The
      //    camera is deliberately still 28-32 m back from the entrance wall: the whole front third
      //    of the hollow — throat, landing slab, gallery ledges, deco — is solid, and every camera
      //    the old version tried near the aperture measured under a metre of clearance (0.96 m at
      //    z = -42 in the pass before this one; 0.02 m in the version before that). She flies away
      //    from a locked-off lens into the bright hole instead, which is the better shot anyway.
      //    The lens tightens 46 -> 28 so she is still a readable figure as she reaches the mouth.
      shot('launch', {
        pos: [
          p(W, inward, 30.0, tan, 12.0, up, 12.0),
          p(W, inward, 20.6, tan, 7.0, up, 8.0),
        ],
        lookFn: (u) => _v2.copy(queenAt()).lerp(p(W, inward, 2.0, up, 0.6), 0.34 * (1 - u)),
      }),

      // 6. BURST — hard cut to daylight. Camera 14.5-16 m off the trunk axis on the sunward side,
      //    level with the aperture; nearest bark is ~9 m away, the leaf mass starts 23 m higher.
      shot('burst', {
        pos: [
          p(O, n, 5.7, tan, 16.0, up, -1.5),
          p(O, n, 10.2, tan, 14.5, up, -2.5),
        ],
        lookFn: (u) => _v2.copy(O).lerp(queenAt(), smoothstep(0.05, 0.45, u)),
      }),

      // 7. WIDE — the establishing shot of the tree. 52-66 m out and dropped to y 14 at the start so
      //    the tree fills the frame from root flare to crown and the camera rises past it. Still
      //    41 m clear of the bark at the closest point and below the leaf mass (y 37+) at the start.
      shot('wide', {
        pos: [
          p(hivePos, tan, 34.0, up, 14.0, n, 40.0),
          p(hivePos, tan, 40.0, up, 26.0, n, 50.0),
        ],
        look: [p(hivePos, up, 24.0), p(hivePos, up, 34.0)],
      }),

      // 8. LAPSE — the passage of time. Almost locked off, on the shaded side of the tree so the
      //    sun is roughly 23-45 deg off the lens axis through the whole cycle: it crosses in and out
      //    of frame twice, the tree is rim-lit for half of each day and flat for the other half, and
      //    its shadow sweeps toward camera across the meadow. Everything moving in this shot is a
      //    live system — see driveSky/driveWeather. 78 m from the trunk, 40 m clear of the canopy.
      shot('lapse', {
        pos: [
          p(hivePos, tan, -44.0, up, 13.0, n, 26.0),
          p(hivePos, tan, -38.0, up, 17.0, n, 20.0),
        ],
        look: [p(hivePos, up, 22.0), p(hivePos, up, 26.0)],
      }),

      // 9. SETTLE — cut in behind her and ease onto the exact third-person pose the play rig wants.
      shot('settle', {
        pos: [p(rest, tan, 1.6, up, 3.8, n, 10.0), handoffPos],
        lookFn: (u) =>
          _v2
            .copy(queenAt())
            .addScaledVector(up, 1.0)
            .lerp(handoffLook, smoothstep(0.0, 0.98, u)),
      }),
    ];

    const cards = CARDS.map((card) =>
      Object.assign({}, card, { label: CINEMATIC.copy[card.text] || card.text })
    );

    return {
      duration: DURATION,
      shots,
      cards,
      flashes: FLASHES,
      events: [
        // Let the music breathe out under the closing fade rather than cutting with the picture.
        { at: DURATION - CINEMATIC.fadeOut - 0.9, fire: () => stopMusic(CINEMATIC.fadeOut + 0.9) },
      ],
      onStart() {
        stage.visible = true;
        startMusic();
      },
      onUpdate(t, _context, dt) {
        pumpMusic(dt || 0);
        // Every frame, not once at play(): the sprite is built lazily by comb.recompute() the
        // first time the seeded cells land, which can be after the cinematic has already started.
        setStartMarker(false);
        driveWeather(t);
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
    stopMusic(0.35);
    stage.visible = false;
    workers.visible = false;
    cap.visible = false;
    mouth.visible = false;
    motes.visible = false;
    envK = 1;
    applyEnv(0, 1);
    for (const node of detail) node.visible = true;
    if (ctx.queen && ctx.queen.object3D) ctx.queen.object3D.visible = true;
    // Whatever the sequence borrowed from the world goes back here, on every exit path there is:
    // finished, skipped or aborted.
    restoreWeather();
    unpatchSky();
    setStartMarker(true);
    handoff();
  }

  // Places the player exactly where the last cinematic frame left the queen. The rig has not run
  // yet, so its first update snaps to the pose shot 9 ended on — the cut into play mode is a match
  // cut, not a jump. input.yaw/pitch are left at 0: they are driven by module-private targets in
  // core/input.js that would spring straight back if written here.
  function handoff() {
    const A = anchors;
    const flight = ctx.flight;
    if (!flight || !A.rest) return;
    const spawn = A.rest.clone();
    const park = () => {
      if (flight.simPosition) flight.simPosition.copy(spawn);
      if (flight.velocity) flight.velocity.set(0, 0, 0);
      if (flight.acceleration) flight.acceleration.set(0, 0, 0);
    };
    park();
    // `flight.position` is a getter that interpolates a previous and a current fixed-step position,
    // and those two only take a copy of `simPosition` inside flight.update(). Setting simPosition
    // alone therefore does NOT move the position the camera rig reads on its first play frame — it
    // was still the default spawn at (0, 2.95, 0), 9.0 m and 5.3 degrees away from the pose shot 9
    // ends on, which is exactly the snap this handoff exists to prevent. (Writing flight.position
    // does nothing at all: it is a getter, and the next read recomputes it.) Two microscopic fixed
    // steps push `rest` through both interpolation slots, so the render position is `rest` at every
    // alpha and the cut is a match cut whatever moment the first play frame lands on.
    if (typeof flight.update === 'function' && ctx.input) {
      for (let i = 0; i < 2; i++) {
        flight.update(1e-4, ctx.input, 0);
        park();
      }
    }
    if (typeof flight.sample === 'function') flight.sample();
  }

  function releaseViewpoint() {
    if (ctx.portal && typeof ctx.portal.setViewpoint === 'function') ctx.portal.setViewpoint(null);
  }

  function play(options) {
    const o = options || {};
    if (director.active) return false;
    buildAnchors();
    detail = detailNodes();
    restoreFog = scene.fog ? scene.fog.color.clone() : new THREE.Color(PALETTE.fog);
    envK = -1;
    patchSky();
    setStartMarker(false);
    // The director parks the queen in the hall and flies the camera out to the meadow for
    // the establishing shots. Insideness follows the queen by default, so the hall stayed
    // drawn during those shots and its comb punched out through the bark. For the duration
    // of the cinematic the viewer, not the queen, decides what counts as "inside".
    if (ctx.portal && typeof ctx.portal.setViewpoint === 'function' && ctx.camera) {
      ctx.portal.setViewpoint(() => ctx.camera.position);
    }
    return director.play(buildTimeline(), {
      startedAt: o.startedAt,
      onFinish: o.onFinish,
      context: ctx,
    });
  }

  function update(dt) {
    if (!director.active) return false;
    // Skipping fades the picture over CINEMATIC.skipFade; take the music down with it rather than
    // waiting for finish().
    if (director.state && director.state.skipped) stopMusic(Math.max(0.2, CINEMATIC.skipFade * 0.8));
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
    // Hand insideness back to the queen the moment the sequence stops, however it stopped —
    // finished, skipped or aborted. Leaving the camera as the viewpoint would make play mode
    // decide "am I in the hollow" from the chase camera instead of the player.
    if (!running) releaseViewpoint();
    return running;
  }

  // One solid-distance field over the scene, shared by both debug probes below.
  //
  // Only opaque, lit meshes count. The hall's light shafts, knot beams, glow quads and the ghost
  // comb are transparent MeshBasicMaterial and a camera may fly through them freely; counting them
  // made the whole hall read as solid and hid the real collisions.
  //
  // This is deliberately a distance field over raw triangles rather than THREE.Raycaster. The
  // raycaster returns nothing at all for `hollow_shell` from inside the hall — its material is
  // FrontSide and the shell's winding faces away from the interior, so every probe ray is
  // backface-culled and a camera buried in a wall measures as perfectly clear. Point-to-triangle
  // distance has no notion of facing and cannot be fooled that way.
  function solidField() {
  const solids = [];
  const roots = [ctx.interior && ctx.interior.group, ctx.hive && ctx.hive.group].filter(Boolean);
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((node) => {
      const mat = node.isMesh && node.material;
      if (!mat || !node.geometry || !node.geometry.attributes.position) return;
      if (mat.transparent || mat.opacity < 1 || mat.type === 'MeshBasicMaterial') return;
      if (/^comb_/.test(node.name || '')) return; // instanced cells: measured analytically instead
      solids.push(node);
    });
  }

  const tri = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  for (const node of solids) {
    const attr = node.geometry.attributes.position;
    const index = node.geometry.index;
    const count = index ? index.count : attr.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      va.fromBufferAttribute(attr, ia).applyMatrix4(node.matrixWorld);
      vb.fromBufferAttribute(attr, ib).applyMatrix4(node.matrixWorld);
      vc.fromBufferAttribute(attr, ic).applyMatrix4(node.matrixWorld);
      tri.push({ a: va.clone(), b: vb.clone(), c: vc.clone(), tag: node.name || 'anon' });
    }
  }

  // Uniform grid so 2400 samples against ~16 k triangles stays interactive.
  const CELL = 4;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const box = new THREE.Box3();
  for (let i = 0; i < tri.length; i++) {
    const t = tri[i];
    box.makeEmpty().expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
    for (let x = Math.floor(box.min.x / CELL); x <= Math.floor(box.max.x / CELL); x++) {
      for (let y = Math.floor(box.min.y / CELL); y <= Math.floor(box.max.y / CELL); y++) {
        for (let z = Math.floor(box.min.z / CELL); z <= Math.floor(box.max.z / CELL); z++) {
          const k = key(x, y, z);
          let bucket = grid.get(k);
          if (!bucket) grid.set(k, (bucket = []));
          bucket.push(i);
        }
      }
    }
  }

  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const ap = new THREE.Vector3();
  const bp = new THREE.Vector3();
  const cp = new THREE.Vector3();
  const hit = new THREE.Vector3();
  // Ericson, Real-Time Collision Detection §5.1.5 — closest point on a triangle to a point.
  function pointTri(p, a, b, c) {
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ap.subVectors(p, a);
    const d1 = ab.dot(ap);
    const d2 = ac.dot(ap);
    if (d1 <= 0 && d2 <= 0) return hit.copy(a).distanceTo(p);
    bp.subVectors(p, b);
    const d3 = ab.dot(bp);
    const d4 = ac.dot(bp);
    if (d3 >= 0 && d4 <= d3) return hit.copy(b).distanceTo(p);
    const vcv = d1 * d4 - d3 * d2;
    if (vcv <= 0 && d1 >= 0 && d3 <= 0) {
      return hit.copy(a).addScaledVector(ab, d1 / (d1 - d3)).distanceTo(p);
    }
    cp.subVectors(p, c);
    const d5 = ab.dot(cp);
    const d6 = ac.dot(cp);
    if (d6 >= 0 && d5 <= d6) return hit.copy(c).distanceTo(p);
    const vbv = d5 * d2 - d1 * d6;
    if (vbv <= 0 && d2 >= 0 && d6 <= 0) {
      return hit.copy(a).addScaledVector(ac, d2 / (d2 - d6)).distanceTo(p);
    }
    const vav = d3 * d6 - d5 * d4;
    if (vav <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      return hit.copy(b).lerp(c, (d4 - d3) / (d4 - d3 + (d5 - d6))).distanceTo(p);
    }
    const denom = 1 / (vav + vbv + vcv);
    return hit
      .copy(a)
      .addScaledVector(ab, vbv * denom)
      .addScaledVector(ac, vcv * denom)
      .distanceTo(p);
  }

  const probe = new THREE.Vector3();
  function nearest(x, y, z) {
    probe.set(x, y, z);
    let best = Infinity;
    let tag = '';
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const cz = Math.floor(z / CELL);
    const seen = new Set();
    for (let r = 0; r <= 4; r++) {
      for (let X = cx - r; X <= cx + r; X++) {
        for (let Y = cy - r; Y <= cy + r; Y++) {
          for (let Z = cz - r; Z <= cz + r; Z++) {
            const ring = Math.max(Math.abs(X - cx), Math.abs(Y - cy), Math.abs(Z - cz));
            if (r > 0 && ring !== r) continue;
            const bucket = grid.get(key(X, Y, Z));
            if (!bucket) continue;
            for (const i of bucket) {
              if (seen.has(i)) continue;
              seen.add(i);
              const d = pointTri(probe, tri[i].a, tri[i].b, tri[i].c);
              if (d < best) {
                best = d;
                tag = tri[i].tag;
              }
            }
          }
        }
      }
      if (best < r * CELL) break;
    }
    return { d: best, tag };
  }
    return { triangles: tri.length, nearest };
  }

  return {
    play,
    update,
    skip: director.skip,
    stop: director.stop,
    director,
    stage,
    anchors,
    get active() {
      return director.active;
    },
    get time() {
      return director.time;
    },
    get shot() {
      return director.shot;
    },
    get duration() {
      return DURATION;
    },
    // Where the opening thinks the natal cell is, next to where the hive says its seed comb is.
    // These two must agree to within one cell width or the queen is hatching out of nothing.
    natalReport() {
      buildAnchors();
      const A = anchors;
      const comb = ctx.comb;
      const anchor = comb && typeof comb.seedAnchor === 'function' ? comb.seedAnchor() : null;
      const nearestReal = comb && typeof comb.nearestCell === 'function'
        ? comb.nearestCell(A.cellRoot)
        : null;
      const round = (v) => [Number(v.x.toFixed(3)), Number(v.y.toFixed(3)), Number(v.z.toFixed(3))];
      return {
        seedAnchor: anchor ? { cell: [anchor.col, anchor.row, anchor.layer], position: round(anchor.position) } : null,
        natalCell: A.natalCell ? [A.natalCell.col, A.natalCell.row, A.natalCell.layer] : null,
        natalPosition: round(A.cellRoot),
        natalMouth: round(A.cellMouth),
        faceOut: round(A.faceOut),
        cellSize: Number(A.cellSize.toFixed(4)),
        distanceToSeed: anchor ? Number(A.cellRoot.distanceTo(anchor.position).toFixed(3)) : null,
        // The comb's own answer to "which real cell is nearest the point you are shooting?"
        nearestRealCell: nearestReal
          ? { cell: [nearestReal.col, nearestReal.row, nearestReal.layer], position: round(nearestReal.position) }
          : null,
      };
    },
    // The authored time-lapse curve, offline: sky offset in days and the weather phase index at
    // each instant. The live proof is sampling sky.sun and weather.state while it runs; this is the
    // authored intent those samples are checked against.
    lapsePlan(steps) {
      const n = Math.max(2, steps || 24);
      const out = [];
      for (let i = 0; i <= n; i++) {
        const t = LAPSE.skyFrom - 1 + ((LAPSE.skyTo + 2 - (LAPSE.skyFrom - 1)) * i) / n;
        out.push({
          t: Number(t.toFixed(2)),
          skyOffsetDays: Number(skyOffsetAt(t).toFixed(4)),
          wxPhase: t >= LAPSE.wxOn ? Math.floor(((t - LAPSE.wxOn) * 1000) / LAPSE.wxPhaseMs) : null,
        });
      }
      return { window: LAPSE, samples: out };
    },
    // Offline dump of the authored camera path, through the same shotPosition() the live camera
    // uses. This is what the geometry-clearance check is run against: every shot here authors a
    // static `pos` track, so the result is exact and independent of frame rate.
    samplePath(steps) {
      buildAnchors();
      const line = buildTimeline();
      const n = Math.max(2, steps || 2400);
      const out = [];
      const at = new THREE.Vector3();
      for (let i = 0; i <= n; i++) {
        const t = (DURATION * i) / n;
        let shot = line.shots[0];
        for (const s of line.shots) if (s.at <= t) shot = s;
        if (shotPosition(shot, t, ctx, at)) out.push({ t, id: shot.id, x: at.x, y: at.y, z: at.z });
      }
      return out;
    },
    // The geometry-clearance check the camera notes above are written against. Dumps the authored
    // path through the same shotPosition() the live camera uses, then measures every sample against
    // the solid triangles actually in the scene — the hall shell, its ledges, deco and basins, and
    // the trunk and canopy — and reports the distance to the nearest surface.
    //
    // Only opaque, lit meshes count. The hall's light shafts, knot beams, glow quads and the ghost
    // comb are transparent MeshBasicMaterial and a camera may fly through them freely; counting
    // them made the whole hall look solid and hid the real collisions.
    //
    //   window.hollowtree.cinematic.intro.measureClearance()
    //
    // Acceptance: `under0_6` must be 0 and `globalMin` must stay well above the 0.1 m near plane.
    // The shipped path holds every sample above 3 m. That is lower than the 5.8 m the prop-comb
    // staging managed, and necessarily so: the subject of the first three shots is now a 1 m cell
    // ON a wall rather than a slab hanging in the middle of the room, so the camera has to be able
    // to see that wall. 3 m is thirty times the near plane and there is no near-miss anywhere.
    measureClearance(steps) {
      const field = solidField();
      const path = this.samplePath(steps || 2400);
      const perShot = new Map();
      const all = [];
      for (const s of path) {
        const near = field.nearest(s.x, s.y, s.z);
        const d = Number.isFinite(near.d) ? Number(near.d.toFixed(3)) : 999;
        all.push({ t: Number(s.t.toFixed(2)), id: s.id, d, hit: near.tag });
        let row = perShot.get(s.id);
        if (!row) perShot.set(s.id, (row = { id: s.id, samples: 0, min: Infinity, atT: 0, hit: '', under0_6: 0, under1_5: 0 }));
        row.samples++;
        if (d < row.min) {
          row.min = d;
          row.atT = Number(s.t.toFixed(2));
          row.hit = near.tag;
        }
        if (d < 0.6) row.under0_6++;
        if (d < 1.5) row.under1_5++;
      }
      const sorted = all.slice().sort((a, b) => a.d - b.d);
      return {
        triangles: field.triangles,
        samples: all.length,
        globalMin: sorted[0].d,
        under0_6: all.filter((r) => r.d < 0.6).length,
        under1_5: all.filter((r) => r.d < 1.5).length,
        under3: all.filter((r) => r.d < 3).length,
        perShot: [...perShot.values()].map((r) => ({ ...r, min: Number(r.min.toFixed(3)) })),
        worst: sorted.slice(0, 8),
      };
    },
    // Point probe on the same field, for designing a shot before it exists.
    probeClearance(points) {
      const field = solidField();
      return (points || []).map((q) => {
        const near = field.nearest(q[0], q[1], q[2]);
        return { at: q, d: Number.isFinite(near.d) ? Number(near.d.toFixed(3)) : null, hit: near.tag };
      });
    },
    // The companion check to measureClearance(). Clearance proves the camera is not buried in a
    // wall; it says nothing about whether the shot has anything in it. A camera 5 m off a flat
    // ledge, aimed at that ledge, is perfectly "clear" and renders as a flat brown field — which is
    // what the old reveal did at its final second.
    //
    // So: pose a scratch camera on the authored track at each time, sphere-trace a 5x5 grid of rays
    // through the frustum against the same distance field, and look at the spread of hit distances.
    // Note this measures the STATIC set — hall, trunk, canopy, plus the comb cluster as a sphere —
    // not the queen or the workers, so a shot whose only subject is the queen still has to be
    // judged from a frame.
    //
    //   nearest / median / farthest   depth of the surfaces actually in frame
    //   openRays                      rays that hit nothing (sky, or the unlit depth of the hall)
    //   spread                        farthest / nearest — 1.0 means every ray landed on one plane
    //
    // A shot reads when the frame has layers: either spread well above ~1.6, or open rays behind a
    // near subject. spread ≈ 1.0 with no open rays is the signature of a flat wash — with the
    // caveat that the two macro shots are ON a flat wall by design and are judged from frames.
    measureFraming(times) {
      buildAnchors();
      const wasStage = stage.visible;
      const wasEnvK = envK;
      const wasDetail = detail;
      if (!detail.length) detail = detailNodes();
      const restoreVis = detail.map((node) => node.visible);
      const interiorWasVisible = ctx.interior ? ctx.interior.group.visible : false;
      stage.visible = true;
      const line = buildTimeline();
      const list = times && times.length
        ? times
        : line.shots.map((s) => [s.at + s.dur * 0.15, s.at + s.dur * 0.5, s.at + s.dur * 0.92]).flat();

      const field = solidField();
      const FAR = 220;

      // solidField() skips the `comb_*` instanced meshes — their triangles live in instance
      // matrices, not in the world matrix — but the comb cluster IS the subject of the first three
      // shots, so measure it as the sphere it very nearly is: seven cells of radius cellSize,
      // centred on the seed.
      const A = anchors;
      const clusterR = A.cellSize * 1.7;
      const rel = new THREE.Vector3();
      function combDistance(x, y, z) {
        return Math.max(0, rel.set(x, y, z).sub(A.seedRoot).length() - clusterR);
      }

      // Sphere tracing on the distance field: step by the distance to the nearest surface, which
      // can never overshoot one, until we are on it or out of range. `nearest` only searches a few
      // grid rings, so a ray crossing open air reports Infinity long before it reaches anything —
      // coast forward in fixed strides rather than calling that a miss, or the wide shot (60 m of
      // clear air before the tree) measures as an empty frame.
      function march(ox, oy, oz, dx, dy, dz) {
        let travelled = 0.05;
        for (let i = 0; i < 400 && travelled < FAR; i++) {
          const px = ox + dx * travelled;
          const py = oy + dy * travelled;
          const pz = oz + dz * travelled;
          const world = field.nearest(px, py, pz).d;
          const d = Math.min(Number.isFinite(world) ? world : Infinity, combDistance(px, py, pz));
          if (d < 0.06) return travelled;
          travelled += Number.isFinite(d) ? Math.max(0.1, d * 0.85) : 8;
        }
        return null;
      }

      const scratch = camera ? camera.clone() : new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 800);
      const at = new THREE.Vector3();
      const look = new THREE.Vector3();
      const ray = new THREE.Vector3();

      const out = [];
      for (const t of list) {
        let shot = line.shots[0];
        for (const s of line.shots) if (s.at <= t) shot = s;
        // Put the world into the state this instant of the sequence actually renders in before
        // measuring it. Both halves matter: stageAt so a lookFn that tracks the queen finds her
        // where this shot thinks she is, and applyEnv so the hall is drawn for interior shots and
        // the trunk for exterior ones. Without the env pass the answer depends entirely on when the
        // probe happened to be called — run at the menu it reported every ray missing, because the
        // hall is hidden until the player is inside it.
        stageAt(t);
        const env = envAt(t);
        applyEnv(env.k, env.gain);
        if (!shotPosition(shot, t, ctx, at)) continue;
        const local = Math.min(1, Math.max(0, (t - shot.at) / Math.max(0.0001, shot.dur)));
        const u = easing(shot.ease)(local);
        if (typeof shot.lookFn === 'function') look.copy(shot.lookFn(u, ctx, t, local));
        else if (Array.isArray(shot.look)) look.copy(shot.look[0]).lerp(shot.look[shot.look.length - 1], u);
        else look.set(0, 0, 0);

        scratch.fov = Array.isArray(shot.fov) ? shot.fov[0] + (shot.fov[shot.fov.length - 1] - shot.fov[0]) * u : scratch.fov;
        scratch.up.set(0, 1, 0);
        scratch.position.copy(at);
        scratch.lookAt(look);
        scratch.updateProjectionMatrix();
        scratch.updateMatrixWorld(true);

        const depths = [];
        let open = 0;
        const halfV = Math.tan((scratch.fov * Math.PI) / 360);
        const halfH = halfV * (scratch.aspect || 16 / 9);
        for (let ix = -2; ix <= 2; ix++) {
          for (let iy = -2; iy <= 2; iy++) {
            ray
              .set(ix * 0.4 * halfH, iy * 0.4 * halfV, -1)
              .applyQuaternion(scratch.quaternion)
              .normalize();
            const d = march(at.x, at.y, at.z, ray.x, ray.y, ray.z);
            if (d === null) open++;
            else depths.push(d);
          }
        }
        depths.sort((a, b) => a - b);
        const near = depths.length ? depths[0] : null;
        const far = depths.length ? depths[depths.length - 1] : null;
        out.push({
          t: Number(t.toFixed(2)),
          shot: shot.id,
          nearest: near === null ? null : Number(near.toFixed(2)),
          median: depths.length ? Number(depths[Math.floor(depths.length / 2)].toFixed(2)) : null,
          farthest: far === null ? null : Number(far.toFixed(2)),
          openRays: open,
          spread: near && far ? Number((far / near).toFixed(2)) : null,
        });
      }
      stage.visible = wasStage;
      detail.forEach((node, i) => {
        node.visible = restoreVis[i];
      });
      if (ctx.interior) ctx.interior.group.visible = interiorWasVisible;
      detail = wasDetail;
      envK = wasEnvK;
      return out;
    },
    dispose() {
      releaseViewpoint();
      restoreWeather();
      unpatchSky();
      setStartMarker(true);
      stopMusic(0.2);
      director.dispose();
      scene.remove(stage);
      workerGeo.dispose();
      capGeo.dispose();
      mouthGeo.dispose();
      moteGeo.dispose();
    },
  };
}

export function playCinematic(context, options) {
  const intro = createIntro(context);
  intro.play(options || {});
  return intro;
}
