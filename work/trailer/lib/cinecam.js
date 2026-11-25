// Hollowtree trailer — cinematic camera. Drives the real game camera from outside, through
// window.hollowtree only, along authored paths. Every value is a pure function of the shot
// clock: the same frame index always yields the same camera, which is what makes the render
// deterministic and the agent-critic loop meaningful.

(() => {
  const HT = () => window.hollowtree;

  // ------------------------------------------------------------------ small maths
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);
  const easeInOut = smoother;
  const linear = (t) => clamp(t, 0, 1);

  const V = (x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 });
  const vadd = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
  const vsub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const vscale = (a, k) => V(a.x * k, a.y * k, a.z * k);
  const vlerp = (a, b, t) => V(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
  const vlen = (a) => Math.hypot(a.x, a.y, a.z);
  const vnorm = (a) => { const l = vlen(a) || 1; return V(a.x / l, a.y / l, a.z / l); };

  // Catmull-Rom through a waypoint list, endpoints duplicated. Gives a path with no
  // corners, which is what separates a dolly from a pan-and-snap.
  function spline(points, t) {
    const n = points.length;
    if (n === 0) return V();
    if (n === 1) return points[0];
    const u = clamp(t, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(u));
    const f = u - i;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const f2 = f * f;
    const f3 = f2 * f;
    const a = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
    return V(a('x'), a('y'), a('z'));
  }

  // Deterministic handheld float: a sum of incommensurable sines, so it never repeats
  // inside a shot and never needs a random source.
  function float3(t, amp, rate, phase) {
    const p = phase || 0;
    return V(
      (Math.sin(t * rate * 0.73 + p * 1.7) * 0.6 + Math.sin(t * rate * 1.31 + p * 3.1) * 0.4) * amp,
      (Math.sin(t * rate * 0.51 + p * 2.3) * 0.6 + Math.sin(t * rate * 1.17 + p * 5.9) * 0.4) * amp * 0.8,
      (Math.sin(t * rate * 0.61 + p * 4.7) * 0.6 + Math.sin(t * rate * 1.43 + p * 0.9) * 0.4) * amp
    );
  }

  // ------------------------------------------------------------------ world probes
  const world = {};

  function ground(x, z) {
    const t = HT().terrain;
    return t && typeof t.getHeight === 'function' ? t.getHeight(x, z) : 0;
  }

  // Shoves a point out of any static collider it has ended up inside. The trailer must
  // never show a frame from inside a tree trunk, and an authored spline through a meadow
  // full of instanced trunks will find one sooner or later. Uses the game's own collider
  // set, so what the camera avoids is exactly what the queen would have bounced off.
  let colliders = null;
  function pushOut(p, radius) {
    if (!colliders) {
      const t = HT().terrain;
      colliders = (t && Array.isArray(t.colliders)) ? t.colliders : [];
    }
    const r = radius || 1.2;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        const min = box.min || box;
        const max = box.max || box;
        if (!min || !max) continue;
        if (p.x < min.x - r || p.x > max.x + r) continue;
        if (p.y < min.y - r || p.y > max.y + r) continue;
        if (p.z < min.z - r || p.z > max.z + r) continue;
        const cx = Math.min(Math.max(p.x, min.x), max.x);
        const cy = Math.min(Math.max(p.y, min.y), max.y);
        const cz = Math.min(Math.max(p.z, min.z), max.z);
        let nx = p.x - cx;
        let ny = p.y - cy;
        let nz = p.z - cz;
        let d = Math.hypot(nx, ny, nz);
        if (d > 1e-6) {
          if (d >= r) continue;
          nx /= d; ny /= d; nz /= d;
        } else {
          // Dead centre: leave along the shallowest axis.
          const px = Math.min(p.x - min.x, max.x - p.x);
          const pz = Math.min(p.z - min.z, max.z - p.z);
          if (px <= pz) { nx = p.x >= (min.x + max.x) * 0.5 ? 1 : -1; ny = 0; nz = 0; d = -px; }
          else { nx = 0; ny = 0; nz = p.z >= (min.z + max.z) * 0.5 ? 1 : -1; d = -pz; }
        }
        const depth = r - d;
        p.x += nx * depth;
        p.y += ny * depth;
        p.z += nz * depth;
        moved = true;
      }
      if (!moved) break;
    }
    return p;
  }

  // ------------------------------------------------------------------ flower clearance
  //
  // AUTHORED, NOT REACTIVE. The previous guard (clearFlowers, below) was a per-frame clamp:
  // it asked flowers.sampleNearest for the nearest bloom within a 3-D radius and, if one was
  // close, shoved the lens up over its head. That is a feedback loop, and it oscillated. The
  // query is a SPHERE test, so the moment the lift succeeded the flower fell outside the
  // radius, the lift was withdrawn, the lens dropped back into range, and the lift was
  // reapplied — measured on b2-meadow as the camera strobing between y=5.5 and y=8.1 about
  // ten times in two seconds, with single-frame steps up to 2.30 m (138 m/s, eleven times
  // the queen's top speed). That is the "camera jumps from top to bottom" defect, and it
  // also spiked the motion-blur drive and tripped the post stack's cut detector 14 times.
  //
  // The cure is to take the decision off the frame clock. flowers.sampleNearest reads a
  // persistent spatial grid over every flower in the world — not a streamed subset — so the
  // whole clearance curve can be computed once in setup(), widened with a running maximum so
  // the rise starts before the obstacle, smoothed so it has no corners, and then simply read
  // as a function of u. Nothing during the shot can feed back into it.
  function clearance(at, n, opts) {
    const o = opts || {};
    const radius = o.radius || 3.4;      // horizontal distance at which a bloom counts
    const headroom = o.headroom || 2.2;  // metres of air kept above its head
    const floorGap = o.floor || 3.0;     // and never nearer the ground than this
    const spread = o.spread === undefined ? 14 : o.spread;
    const passes = o.smooth === undefined ? 2 : o.smooth;
    const N = n || 240;
    const f = HT().flowers;
    const req = new Array(N + 1);
    for (let k = 0; k <= N; k++) {
      const p = at(k / N);
      const g = ground(p.x, p.z);
      let top = g + floorGap;
      if (f && typeof f.sampleNearest === 'function') {
        // Probe from just above the ground rather than from the lens. sampleNearest measures
        // in three dimensions, so probing from altitude is exactly how a tall flower directly
        // underneath goes unseen — the miss that made the reactive guard oscillate.
        const hit = f.sampleNearest(V(p.x, g + 1.0, p.z), radius * 2.4);
        if (hit && hit.position) {
          const d = Math.hypot(p.x - hit.position.x, p.z - hit.position.z);
          if (d < radius) top = Math.max(top, hit.position.y + headroom);
        }
      }
      req[k] = Math.max(0, top - p.y);
    }
    // Running maximum first: a lone spike becomes a plateau, so the smoothing that follows
    // rounds its shoulders instead of cutting its height.
    let cur = new Array(N + 1);
    for (let k = 0; k <= N; k++) {
      let m = 0;
      for (let j = Math.max(0, k - spread); j <= Math.min(N, k + spread); j++) if (req[j] > m) m = req[j];
      cur[k] = m;
    }
    for (let pass = 0; pass < passes; pass++) {
      const next = new Array(N + 1);
      for (let k = 0; k <= N; k++) {
        let s = 0;
        let c = 0;
        for (let j = Math.max(0, k - spread); j <= Math.min(N, k + spread); j++) { s += cur[j]; c++; }
        next[k] = s / c;
      }
      cur = next;
    }
    const lift = (u) => {
      const x = clamp(u, 0, 1) * N;
      const i = Math.min(N - 1, Math.floor(x));
      const t = x - i;
      return cur[i] + (cur[i + 1] - cur[i]) * t;
    };
    lift.peak = cur.reduce((a, b) => Math.max(a, b), 0);
    lift.samples = cur;
    return lift;
  }

  // The meadow's tall species reach seven metres and are not colliders, so the collider
  // guard cannot see them. This lifts the lens over the head of whatever is nearest.
  //
  // KEPT ONLY AS A LAST RESORT for shots that have not authored a clearance curve. It is a
  // reactive clamp and it oscillates; see the note above. Do not put it back on a moving
  // shot.
  function clearFlowers(p, radius) {
    const f = HT().flowers;
    if (!f || typeof f.sampleNearest !== 'function') return p;
    const hit = f.sampleNearest(p, radius || 3.0);
    if (!hit || !hit.position) return p;
    const dx = p.x - hit.position.x;
    const dz = p.z - hit.position.z;
    const r = radius || 3.0;
    if (Math.hypot(dx, dz) > r) return p;
    const top = hit.position.y + r * 0.65;
    if (p.y < top) p.y = top;
    return p;
  }

  // ------------------------------------------------------------------ camera write
  let fovNow = 62;

  function applyCamera(pos, look, fov, roll) {
    const cam = HT().camera;
    cam.position.set(pos.x, pos.y, pos.z);
    // Roll is baked into the up vector before lookAt, so the horizon can tilt without
    // fighting the lookAt that frames the subject.
    if (roll) {
      const fwd = vnorm(vsub(look, pos));
      const right = vnorm(V(fwd.z, 0, -fwd.x));
      const up = vnorm(vsub(V(0, 1, 0), vscale(right, 0)));
      const c = Math.cos(roll);
      const s = Math.sin(roll);
      cam.up.set(
        up.x * c + right.x * s,
        up.y * c + right.y * s,
        up.z * c + right.z * s
      );
    } else {
      cam.up.set(0, 1, 0);
    }
    cam.lookAt(look.x, look.y, look.z);
    const f = fov || 62;
    if (Math.abs(f - fovNow) > 1e-4) {
      fovNow = f;
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ queen write
  // The queen is positioned by writing the simulation position and velocity the flight
  // model integrates from. The model still runs — banking, hover bob, wing blur and the
  // collision clamp are all the game's own — it is only the path that is authored.
  function placeQueen(pos, vel, headingOverride) {
    const ht = HT();
    const f = ht.flight;
    if (!f) return;
    f.simPosition.set(pos.x, pos.y, pos.z);
    if (vel) f.velocity.set(vel.x, vel.y, vel.z);
    const heading = typeof headingOverride === 'number'
      ? headingOverride
      : (vel && Math.hypot(vel.x, vel.z) > 0.05 ? Math.atan2(-vel.x, -vel.z) : null);
    if (heading !== null && ht.rig) ht.rig.yaw = heading;
  }

  // ------------------------------------------------------------------ shots
  const shots = new Map();
  const order = [];

  function define(shot) {
    shots.set(shot.id, shot);
    order.push(shot.id);
    return shot;
  }

  let current = null;
  let frameIndex = 0;

  // The gather key, forced from outside. input.update() rewrites input.gather from the
  // keyboard every fixed step, so a plain assignment would be erased; an accessor that
  // swallows the write is the only way to hold the key down from a harness.
  let forceGather = false;
  function installGatherOverride() {
    const inp = HT().input;
    if (!inp || inp.__cineGather) return;
    Object.defineProperty(inp, 'gather', {
      get: () => forceGather,
      set: () => {},
      configurable: true,
    });
    inp.__cineGather = true;
  }

  // The weather schedule wanders into overcast, which halves the sun and doubles the fog.
  // A trailer needs the light it was framed for, so each shot states the sky it wants.
  function setWeather(kind, intensity) {
    const ht = HT();
    // The weather module was built with the session's server-corrected clock, NOT Date.now(),
    // so a phase stamped with the local clock lands hundreds of phases into the chain and
    // the "clear sky" the shot asked for arrives as rain. Stamp it with the clock weather
    // itself reads.
    const worldNow = ht.net && ht.net.world && typeof ht.net.world.now === 'function'
      ? ht.net.world.now()
      : Date.now();
    const payload = {
      kind: kind || 'clear',
      // Intensity does not dim a clear sky — every multiplier in the clear preset is 1 —
      // it only scales the wind, and the meadow is supposed to breathe.
      intensity: typeof intensity === 'number' ? intensity : 1.0,
      seed: 20260808,
      startedAt: worldNow,
      durationMs: 36000000,
      transitionMs: 400,
    };
    // Deliberately NOT routed through net.weather.set(): the local driver echoes a write
    // back through a simulated-latency setTimeout, so the sky would change on whichever
    // frame happened to be in flight when the echo landed — a real-time dependency in the
    // middle of an otherwise frame-exact render.
    if (ht.weather && typeof ht.weather.setFromWorld === 'function') ht.weather.setFromWorld(payload);
  }

  // ------------------------------------------------------------------ motion blur mask
  //
  // The blur is CAMERA REPROJECTION: it unprojects each pixel with the depth buffer, moves
  // it by the camera's own change of view, and smears along that. There is no per-object
  // velocity in it. A shot that TRACKS the queen therefore smears her worst of all — she is
  // motionless on screen, but the pass computes her screen velocity as if she were a fence
  // post the camera flew past, and drags her along it. On b2-meadow that came to roughly
  // eleven pixels across wings three pixels thick, which is the hard-edged fan Jurek read as
  // "a weird sharp blur".
  //
  // uNearStart / uNearEnd are the only lever that separates subject from background: the
  // shader multiplies the velocity by smoothstep(near, far, depth), so pushing the ramp out
  // past the subject exempts her while the mid-ground still streaks. They are set once at
  // construction and never rewritten per frame, so writing them here holds for the shot.
  let motionDefaults = null;
  function motionUniforms() {
    const post = HT().post;
    return post && post.materials && post.materials.motion ? post.materials.motion.uniforms : null;
  }
  function applyMotionMask(shot) {
    const u = motionUniforms();
    if (!u) return;
    if (!motionDefaults) {
      motionDefaults = {
        near: [u.uNearStart.value, u.uNearEnd.value],
        maxRadius: u.uMaxRadius.value,
      };
    }
    const near = shot.motionNear || motionDefaults.near;
    u.uNearStart.value = near[0];
    u.uNearEnd.value = near[1];
    u.uMaxRadius.value = typeof shot.motionMax === 'number' ? shot.motionMax : motionDefaults.maxRadius;
  }

  // ------------------------------------------------------------------ zone markers
  //
  // zones.js hangs a translucent cylinder ('zone-fog') and a floating ring name ('zone-sign')
  // around the tree to tell a player where the unlocked world ends. They are guidance, i.e.
  // UI, and the trailer must never show them. They were absent from the first cut only by
  // luck — the zone system had unlocked itself by the time b2 was rendered — and they came
  // straight back as a grey column across the trunk the moment a shot was rendered on its
  // own. Hidden explicitly, every frame, so nothing about ordering can bring them back.
  let zoneMarkers = null;
  function hideZoneMarkers() {
    if (!zoneMarkers) {
      zoneMarkers = [];
      const scene = HT().scene;
      if (scene) scene.traverse((o) => { if (o.name === 'zone-fog' || o.name === 'zone-sign') zoneMarkers.push(o); });
    }
    for (let i = 0; i < zoneMarkers.length; i++) zoneMarkers[i].visible = false;
  }

  // ------------------------------------------------------------------ sky and season
  //
  // main.js recomputes the time of day from the world clock every frame and pushes it into
  // sky.update() before anything else can, so the only way to author a sunrise is to sit in
  // that call. src/cinematic/intro.js does exactly this for its two-day time-lapse; this is
  // the same technique, driven from the trailer instead. Outside a shot that asks for it the
  // wrapper is a pass-through.
  let skyPatch = null;
  let skyOverride = null;
  function patchSky() {
    const sky = HT().sky;
    if (skyPatch || !sky || typeof sky.update !== 'function') return;
    const original = sky.update;
    skyPatch = { sky, original };
    sky.update = function patched(dt, tod, target) {
      return original.call(sky, dt, skyOverride === null ? tod : skyOverride, target);
    };
  }

  // Bloom openness per species is a pure function of the year phase, and flowers.js exposes
  // attachSeason() so a caller can supply that phase. Driving it sweeps the meadow through
  // spring, summer, autumn and pre-winter for real — the species that are out of season
  // close and grey off, the ones in season open — without touching the world clock, which
  // would otherwise have to advance eight real days and spin the sun 256 times to get there.
  let seasonPhase = null;
  function installSeason() {
    const f = HT().flowers;
    if (!f || typeof f.attachSeason !== 'function' || f.__cineSeason) return;
    f.__cineSeason = true;
    f.attachSeason(() => (seasonPhase === null ? null : { yearT: seasonPhase }));
  }

  // A light seasonal cast on the grade, so the sweep reads as a year and not only as the
  // flowers opening and closing. The post stack already has the knob (setSeason) and applies
  // it as a tint with a small mix; nothing here recolours a texture.
  const SEASON_TINT = [0xd8f0c8, 0xffffff, 0xffd9a0, 0xc9d8ee]; // spring, summer, autumn, pre-winter
  const SEASON_MIX = [0.16, 0.0, 0.24, 0.26];
  function seasonGrade(yearT) {
    const x = (((yearT % 1) + 1) % 1) * 4;
    const i = Math.floor(x) % 4;
    const j = (i + 1) % 4;
    const f = smooth(x - Math.floor(x));
    const a = SEASON_TINT[i];
    const b = SEASON_TINT[j];
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, f));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, f));
    const bl = Math.round(lerp(a & 255, b & 255, f));
    return { tint: (r << 16) | (g << 8) | bl, mix: lerp(SEASON_MIX[i], SEASON_MIX[j], f) };
  }

  // The weather chain re-based onto a fast phase, exactly as the intro does it: same door
  // (setFromWorld), same four numbers (seed, startedAt, durationMs, transitionMs), the
  // game's own authored chain of kinds. Nothing here paints a cloud.
  function setWeatherChain(shot) {
    const ht = HT();
    const w = ht.weather;
    const c = shot.weatherChain;
    if (!w || !c || typeof w.setFromWorld !== 'function') return;
    const worldNow = ht.net && ht.net.world && typeof ht.net.world.now === 'function'
      ? ht.net.world.now() : Date.now();
    w.setFromWorld({
      kind: shot.weather || 'clear',
      intensity: typeof shot.weatherIntensity === 'number' ? shot.weatherIntensity : 1,
      seed: c.seed,
      // The renderer holds the opening frame for a preroll before it captures anything, and
      // the world clock runs during it. Offsetting by that much puts phase 0 on frame 0 of
      // the shot rather than a second into it.
      startedAt: worldNow
        + (window.__cine && window.__cine.prerollMs ? window.__cine.prerollMs : 0)
        // Skipping phases lets a shot start on the interesting part of a chain instead of
        // spending its first seconds on whatever the chain happens to open with.
        - (c.phaseOffset || 0) * c.phaseMs,
      durationMs: c.phaseMs,
      transitionMs: c.transitionMs,
    });
  }

  const api = {
    V, vadd, vsub, vscale, vlerp, vlen, vnorm, spline, float3,
    clamp, lerp, smooth, smoother, easeIn, easeOut, easeInOut, linear,
    ground, world, placeQueen, applyCamera, setWeather, pushOut, clearance,
    setGather(on) { forceGather = Boolean(on); },
    hud(on) {
      document.documentElement.classList.toggle('trailer-nohud', !on);
    },
    get ht() { return HT(); },
  };

  // ------------------------------------------------------------------ install
  function install() {
    const ht = HT();
    // The gameplay rig must stop writing to the camera; from here the trailer owns it.
    if (ht.rig && typeof ht.rig.update === 'function') ht.rig.update = () => {};
    // Insideness is sampled from the queen by default, which is wrong for a camera that
    // flies into the hollow ahead of her. portal.setViewpoint is the API for exactly this.
    const portal = ht.nest && ht.nest.portal;
    if (portal && typeof portal.setViewpoint === 'function') {
      portal.setViewpoint(() => ht.camera.position);
    }
    const hiveX = 0;
    const hiveZ = -30;
    world.hive = V(hiveX, ground(hiveX, hiveZ), hiveZ);
    const e = ht.hive && ht.hive.entrance;
    world.entrance = e ? V(e.x, e.y, e.z) : V(hiveX, world.hive.y + 16, hiveZ + 7.4);
    const spec = ht.nest && ht.nest.interior && ht.nest.interior.spec;
    if (spec) {
      world.spec = {
        centerX: spec.centerX, centerZ: spec.centerZ,
        minX: spec.minX, maxX: spec.maxX, minZ: spec.minZ, maxZ: spec.maxZ,
        floorY: spec.floorY, ceilY: spec.ceilY, entranceY: spec.entranceY,
        entrancePos: spec.entrancePos
          ? V(spec.entrancePos.x, spec.entrancePos.y, spec.entrancePos.z) : null,
      };
    }
    installGatherOverride();
    patchSky();
    installSeason();
    hideZoneMarkers();
    const comb = ht.nest && ht.nest.comb;
    if (comb && typeof comb.seedAnchor === 'function') {
      const a = comb.seedAnchor();
      if (a && a.position) world.seed = V(a.position.x, a.position.y, a.position.z);
    }
    return world;
  }

  // ------------------------------------------------------------------ per-frame
  function beginShot(id) {
    const shot = shots.get(id);
    if (!shot) throw new Error('unknown shot ' + id);
    current = shot;
    frameIndex = 0;
    shot.__state = {};
    forceGather = false;
    api.hud(Boolean(shot.hud));
    hideZoneMarkers();
    applyMotionMask(shot);
    // Sky and season go back to the world's own before anything is authored on top, so a
    // shot can never inherit the previous shot's sunrise or its autumn.
    skyOverride = null;
    seasonPhase = null;
    const grade = HT().post;
    if (grade && typeof grade.setSeason === 'function') grade.setSeason(0xffffff, 0);
    setWeather(shot.weather || 'clear', shot.weatherIntensity);
    if (shot.weatherChain) setWeatherChain(shot);
    const post = HT().post;
    if (post && typeof post.resetMotionHistory === 'function') post.resetMotionHistory();
    // Insideness is a smoothed latch, so an exterior shot that follows an interior one
    // inherits a fraction of it — and a fraction is enough to draw the hall, its ledges and
    // the comb hanging in mid-air beside the trunk. Each shot states where it is and the
    // latch is set outright rather than left to fade.
    const portal = HT().nest && HT().nest.portal;
    if (portal && portal.state) {
      const k = shot.inside ? 1 : 0;
      portal.state.insideness = k;
      portal.state.target = k;
      portal.state.inside = k > 0.5;
      portal.state.latched = k > 0.5;
    }
    if (typeof shot.setup === 'function') shot.setup(api, shot.__state);
    return { id: shot.id, seconds: shot.seconds, frames: Math.round(shot.seconds * 60) };
  }

  // Called once per frame, BEFORE the frame is stepped, so the game renders with exactly
  // this camera and this queen. t is seconds into the shot, u is 0..1 across it.
  function frame(i) {
    if (!current) return null;
    frameIndex = i;
    const t = i / 60;
    const u = current.seconds > 0 ? clamp(t / current.seconds, 0, 1) : 0;
    const st = current.__state;
    hideZoneMarkers();
    // Authored sky and season, evaluated before the world's own update runs on this frame.
    skyOverride = typeof current.sky === 'function' ? current.sky(t, u, api, st) : null;
    seasonPhase = typeof current.season === 'function' ? current.season(t, u, api, st) : null;
    if (seasonPhase !== null) {
      const post = HT().post;
      if (post && typeof post.setSeason === 'function') {
        const g = seasonGrade(seasonPhase);
        post.setSeason(g.tint, g.mix);
      }
    }
    if (typeof current.act === 'function') current.act(t, u, api, st);
    if (typeof current.queen === 'function') {
      const q = current.queen(t, u, api, st);
      if (q && q.pos) placeQueen(q.pos, q.vel, q.heading);
    }
    const c = current.camera(t, u, api, st);
    // Exterior shots get the collider guard; inside the hollow the hall's own colliders
    // enclose the camera by design, so the guard would shove it through the bark.
    if (current.guard !== false) pushOut(c.pos, current.guardRadius || 1.6);
    if (current.flowerGuard) clearFlowers(c.pos, current.flowerGuard);
    applyCamera(c.pos, c.look, c.fov, c.roll);
    // Depth of field focuses on the queen by default, which is wrong whenever the shot's
    // subject is the tree or the wall. A shot may name its own focus point instead.
    const post = HT().post;
    if (post && typeof post.setMotionState === 'function') {
      const target = c.focus || c.look;
      post.setMotionState({
        focusDistance: vlen(vsub(target, c.pos)),
        speedRatio: typeof c.speed === 'number' ? c.speed : 0.25,
        boostAmount: 0,
        turnRate: 0,
        insideness: HT().nest && HT().nest.portal ? HT().nest.portal.state.insideness : 0,
      });
    }
    return { t, u };
  }

  window.__cine = {
    define, install, beginShot, frame, api,
    shots: () => order.slice(),
    shotInfo: (id) => {
      const s = shots.get(id);
      return s ? {
        id: s.id,
        seconds: s.seconds,
        caption: s.caption || null,
        timeOfDay: typeof s.timeOfDay === 'number' ? s.timeOfDay : null,
        hud: Boolean(s.hud),
        frames: Math.round(s.seconds * 60),
      } : null;
    },
    get world() { return world; },
  };
})();
