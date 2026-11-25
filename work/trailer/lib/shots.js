// Hollowtree trailer — the shot list. All seven blocks of SPEC-trailer.md are shot, except
// that block 6 is a hornet raid rather than the spec's three queens: three simultaneous
// clients in one hive is beyond this single-page harness, and an attack is the beat that was
// actually asked for. See the note above b6-hornets.
//
// Every shot is a pure function of its own clock: camera(t, u) and queen(t, u) never read
// the previous frame, so frame N is identical on every render.

(() => {
  const D = window.__cine.define;

  // A queen path is a spline the flight model integrates along. Sampling it slightly ahead
  // and behind gives the velocity, which is what drives banking, wing blur and hover state,
  // so the motion stays the game's own even though the route is authored.
  function pathQueen(points, u, api, opts) {
    const o = opts || {};
    const e = o.ease ? o.ease(u) : u;
    const h = 1 / 240;
    const p = api.spline(points, e);
    const a = api.spline(points, Math.max(0, e - h));
    const b = api.spline(points, Math.min(1, e + h));
    const dt = (Math.min(1, e + h) - Math.max(0, e - h)) * (o.seconds || 1);
    const vel = api.vscale(api.vsub(b, a), dt > 0 ? 1 / dt : 0);
    return { pos: p, vel };
  }

  // Keeps the queen alive as an LOD anchor without putting her in frame: flowers and grass
  // stream around HER, not around the camera, so a shot with the queen parked on the far
  // side of the map renders an empty meadow.
  function parkQueen(pos) {
    return () => ({ pos, vel: { x: 0, y: 0, z: 0 } });
  }

  const CAMERA_FOV = 62;

  // ============================================================ BLOCK 1 — opening
  // Black to first light through the crown, then a slow crane down onto the hollow.
  D({
    id: 'b1-opening',
    seconds: 6.0,
    caption: 'Introducing…',
    timeOfDay: 0.30,
    weather: 'clear',
    setup(api, st) {
      // The sun sits out at +X at this hour, so the lens starts on the far side of the
      // trunk and the crown is rim-lit rather than flat, then arcs round and down to the
      // mouth, which faces +Z.
      st.path = [
        api.V(-19.0, 50.0, -19.0),
        api.V(-17.0, 41.0, -13.0),
        api.V(-13.0, 30.0, -7.5),
        api.V(-8.0, 21.5, -8.5),
        api.V(-4.2, 17.8, -12.6),
      ];
      st.look = [
        api.V(-1.5, 58.0, -29.0),
        api.V(-1.0, 45.0, -29.0),
        api.V(-0.6, 30.0, -27.5),
        api.V(-0.2, 20.0, -25.0),
        api.V(0.0, 16.1, -22.6),
      ];
    },
    // Parked well behind the lens and off to the side: out of frame, close enough that the
    // meadow around the tree still has its detail streamed in.
    queen: parkQueen({ x: 26, y: 7.5, z: 14 }),
    camera(t, u, api, st) {
      const e = api.easeInOut(u);
      const pos = api.vadd(api.spline(st.path, e), api.float3(t, 0.16, 0.55, 1.3));
      const look = api.vadd(api.spline(st.look, e), api.float3(t, 0.09, 0.41, 4.1));
      return { pos, look, fov: api.lerp(58, 46, api.smooth(u)), focus: look, speed: 0.12 };
    },
  });

  // ============================================================ BLOCK 2 — the meadow
  // One unbroken low pass across the flower fields. No cut anywhere inside it.
  D({
    id: 'b2-meadow',
    seconds: 11.0,
    caption: 'Explore a meadow that breathes',
    timeOfDay: 0.31,
    weather: 'clear',
    // NO flowerGuard. The reactive guard is what made this shot jump; see the long note on
    // clearance() in cinecam.js. The clearance curve below replaces it.
    //
    // The lens tracks the queen at four to five and a half metres, and camera-reprojection
    // blur has no object velocity, so at the shipped mask (2.6 → 11 m) she was inside the
    // blurred band and got smeared as if she were scenery. Pushing the ramp out past her
    // exempts the subject; the meadow beyond fourteen metres, which is what actually moves
    // across the frame at this speed, still streaks.
    motionNear: [7.5, 20.0],
    setup(api, st) {
      const g = (x, z) => api.ground(x, z);
      // Held between six and eight metres: high enough to clear the seven-metre conifers
      // the meadow is seeded with, low enough that the flower heads still fill the
      // bottom of the frame.
      st.route = [
        api.V(62, g(62, 52) + 8.2, 52),
        api.V(44, g(44, 38) + 7.0, 38),
        api.V(24, g(24, 24) + 6.4, 24),
        api.V(4, g(4, 12) + 7.0, 12),
        api.V(-16, g(-16, 2) + 6.2, 2),
        api.V(-34, g(-34, -8) + 7.2, -8),
        api.V(-50, g(-50, -18) + 8.6, -18),
      ];
      // The lens position with no clearance applied and no handheld float, as a pure
      // function of u. setup() samples it to build the clearance curve; camera() then adds
      // the curve back. Both read the same function, so the curve cannot describe a path
      // the shot does not fly.
      st.raw = (u) => rigAt(u, api, st);
      st.lift = api.clearance(st.raw, 264, { radius: 3.4, headroom: 2.1, floor: 3.0, spread: 16 });
    },
    queen(t, u, api, st) {
      return pathQueen(st.route, u, api, { ease: api.smoother, seconds: 11.0 });
    },
    camera(t, u, api, st) {
      const q = pathQueen(st.route, u, api, { ease: api.smoother, seconds: 11.0 });
      const dir = api.vnorm(api.V(q.vel.x, 0, q.vel.z));
      const swing = api.smooth(api.clamp((u - 0.12) / 0.7, 0, 1));
      const pos = api.vadd(st.raw(u), api.float3(t, 0.22, 0.9, 2.7));
      pos.y += st.lift(u);
      const look = api.vadd(
        api.vadd(q.pos, api.vscale(dir, api.lerp(3.0, 1.2, swing))),
        api.vadd(api.V(0, -0.9, 0), api.float3(t, 0.12, 0.7, 6.2))
      );
      // The look point stays welded to the QUEEN, with no share of the clearance lift. Give
      // it one and the rig and its aim rise together, which is a translation: the queen does
      // not rise with them, so she slides down the frame — measured at 0.6 of NDC height on
      // the first attempt. Anchored to her, the lens simply tilts down as it climbs and she
      // holds her place in frame while the horizon drops behind her.
      //
      // Declared low on purpose. The post stack takes the greater of this and the camera's
      // own measured speed, so a high number here only ever adds blur that the move has not
      // earned — which is what put a smear on the queen in the first two seconds, where the
      // lens is barely moving at all.
      return { pos, look, fov: api.lerp(64, 58, api.smooth(u)), focus: q.pos, speed: 0.25 };
    },
  });

  // The b2 rig, factored out so setup() and camera() cannot drift apart. The rig drifts from
  // over her shoulder round to a low side profile, slung BELOW her so the flower heads run
  // along the bottom of the frame and she reads against the sky rather than the horizon.
  function rigAt(u, api, st) {
    const q = pathQueen(st.route, u, api, { ease: api.smoother, seconds: 11.0 });
    const dir = api.vnorm(api.V(q.vel.x, 0, q.vel.z));
    const right = api.V(-dir.z, 0, dir.x);
    const swing = api.smooth(api.clamp((u - 0.12) / 0.7, 0, 1));
    const back = api.lerp(5.2, 2.6, swing);
    const side = api.lerp(0.4, 3.4, swing);
    const lift = api.lerp(-1.3, -0.7, swing);
    return api.vadd(
      api.vadd(api.vsub(q.pos, api.vscale(dir, back)), api.vscale(right, side)),
      api.V(0, lift, 0)
    );
  }

  // ============================================================ BLOCK 3 — gathering
  // Three shorter shots. The middle one is the only place in the cut where the HUD is
  // deliberately on screen, because the load meter is the thing being shown.
  function flowerNear(api, x, z) {
    const ht = api.ht;
    const y = api.ground(x, z) + 1.2;
    const hit = ht.flowers && ht.flowers.sampleNearest
      ? ht.flowers.sampleNearest({ x, y, z }, 34)
      : null;
    if (hit && hit.position) return api.V(hit.position.x, hit.position.y, hit.position.z);
    return api.V(x, y + 1.5, z);
  }

  D({
    id: 'b3a-approach',
    seconds: 3.6,
    flowerGuard: 1.6,
    // She is the subject and she is four to seven metres out; keep her out of the
    // reprojection blur's band for the same reason as b2.
    motionNear: [7.6, 18.0],
    caption: 'Gather what the hive needs',
    timeOfDay: 0.32,
    weather: 'clear',
    setup(api, st) {
      st.flower = flowerNear(api, -14, 13);
      st.from = api.vadd(st.flower, api.V(11.0, 4.2, 9.5));
      st.to = api.vadd(st.flower, api.V(0.9, 0.35, 2.1));
    },
    queen(t, u, api, st) {
      const e = api.easeOut(u);
      const pos = api.vlerp(st.from, st.to, e);
      const h = 0.004;
      const prev = api.vlerp(st.from, st.to, api.easeOut(Math.max(0, u - h)));
      const vel = api.vscale(api.vsub(pos, prev), 1 / (h * 3.6));
      return { pos, vel };
    },
    camera(t, u, api, st) {
      const a = -0.55 + u * 0.42;
      const r = api.lerp(7.4, 4.6, api.easeInOut(u));
      const pos = api.vadd(
        api.vadd(st.flower, api.V(Math.sin(a) * r, api.lerp(3.1, 1.5, api.easeInOut(u)), Math.cos(a) * r)),
        api.float3(t, 0.11, 1.1, 0.7)
      );
      const look = api.vadd(st.flower, api.V(0, 0.5, 0));
      return { pos, look, fov: 54, focus: look, speed: 0.3 };
    },
  });

  D({
    id: 'b3b-scoop',
    seconds: 4.0,
    motionNear: [5.0, 14.0],
    caption: null,
    timeOfDay: 0.32,
    weather: 'clear',
    hud: true,
    setup(api, st) {
      st.flower = flowerNear(api, -14, 13);
      st.hover = api.vadd(st.flower, api.V(0.85, 0.3, 1.9));
      api.setGather(true);
    },
    queen(t, u, api, st) {
      const bob = Math.sin(t * 2.1) * 0.09;
      return {
        pos: api.V(st.hover.x, st.hover.y + bob, st.hover.z),
        vel: api.V(0, 0, 0),
        heading: Math.atan2(-(st.flower.x - st.hover.x), -(st.flower.z - st.hover.z)),
      };
    },
    camera(t, u, api, st) {
      const a = 0.95 + u * 0.5;
      const r = api.lerp(3.5, 2.7, api.easeInOut(u));
      const pos = api.vadd(
        api.vadd(st.flower, api.V(Math.sin(a) * r, api.lerp(1.5, 1.05, u), Math.cos(a) * r)),
        api.float3(t, 0.07, 1.3, 3.9)
      );
      const look = api.vadd(st.flower, api.V(0.35, 0.35, 0.8));
      return { pos, look, fov: 46, focus: look, speed: 0.12 };
    },
  });

  D({
    id: 'b3c-lift',
    seconds: 3.4,
    motionNear: [8.0, 19.0],
    caption: null,
    timeOfDay: 0.33,
    weather: 'clear',
    setup(api, st) {
      st.flower = flowerNear(api, -14, 13);
      st.route = [
        api.vadd(st.flower, api.V(0.85, 0.3, 1.9)),
        api.vadd(st.flower, api.V(1.9, 2.4, 0.2)),
        api.vadd(st.flower, api.V(3.4, 5.6, -4.2)),
        api.vadd(st.flower, api.V(4.2, 9.2, -11.0)),
      ];
    },
    queen(t, u, api, st) {
      return pathQueen(st.route, u, api, { ease: api.easeIn, seconds: 3.4 });
    },
    camera(t, u, api, st) {
      const q = pathQueen(st.route, u, api, { ease: api.easeIn, seconds: 3.4 });
      const pos = api.vadd(
        api.vadd(st.flower, api.V(6.2, api.lerp(1.2, 4.4, api.smooth(u)), 6.4)),
        api.float3(t, 0.1, 1.0, 5.3)
      );
      const look = api.vlerp(api.vadd(st.flower, api.V(0, 0.6, 0)), q.pos, api.smooth(u) * 0.85);
      return { pos, look, fov: 52, focus: q.pos, speed: 0.35 };
    },
  });

  // ============================================================ BLOCK 4 — building
  // The heart of the cut: in through the mouth, the hall opening up, then the comb growing
  // cell by cell on the start wall.
  D({
    id: 'b4a-enter',
    guard: false,
    seconds: 3.2,
    motionNear: [8.0, 20.0],
    caption: 'Build your hollow, cell by cell',
    timeOfDay: 0.33,
    weather: 'clear',
    setup(api, st) {
      const e = api.world.entrance;
      st.route = [
        api.V(e.x + 1.4, e.y + 1.6, e.z + 15.0),
        api.V(e.x + 0.7, e.y + 0.7, e.z + 8.0),
        api.V(e.x + 0.15, e.y + 0.1, e.z + 1.5),
        api.V(e.x, e.y - 0.2, e.z - 7.0),
        api.V(e.x - 0.6, e.y - 0.6, e.z - 15.0),
      ];
    },
    queen(t, u, api, st) {
      return pathQueen(st.route, u, api, { ease: api.smoother, seconds: 3.2 });
    },
    camera(t, u, api, st) {
      const q = pathQueen(st.route, u, api, { ease: api.smoother, seconds: 3.2 });
      // Straight down the axis of the mouth. Off-axis by more than a metre and the lens
      // would clip the bark on the way through.
      const back = api.lerp(6.2, 4.6, api.smooth(u));
      const pos = api.vadd(
        api.V(q.pos.x * 0.35, q.pos.y + api.lerp(1.3, 0.5, api.smooth(u)), q.pos.z + back),
        api.float3(t, 0.08, 0.8, 2.2)
      );
      const look = api.V(q.pos.x * 0.5, q.pos.y, q.pos.z - 6.0);
      return { pos, look, fov: api.lerp(58, 66, api.smooth(u)), focus: q.pos, speed: 0.6 };
    },
  });

  D({
    id: 'b4b-hall',
    guard: false,
    inside: true,
    seconds: 4.2,
    caption: null,
    timeOfDay: 0.34,
    weather: 'clear',
    setup(api, st) {
      const s = api.world.spec;
      st.s = s;
      st.path = [
        api.V(2.0, s.entranceY + 1.0, s.maxZ - 5.0),
        api.V(4.5, s.entranceY + 5.5, s.maxZ - 14.0),
        api.V(5.5, s.entranceY + 11.0, s.maxZ - 24.0),
        api.V(3.0, s.entranceY + 15.5, s.maxZ - 33.0),
      ];
      st.look = [
        api.V(0, s.entranceY, s.minZ + 14.0),
        api.V(-2.0, s.entranceY + 3.0, s.minZ + 10.0),
        api.V(-1.0, s.entranceY + 4.5, s.minZ + 6.0),
        api.V(0.4, s.entranceY + 1.5, s.minZ + 2.0),
      ];
      st.queenRoute = [
        api.V(-0.6, s.entranceY - 0.6, s.maxZ - 12.0),
        api.V(-2.4, s.entranceY + 0.6, s.maxZ - 22.0),
        api.V(-3.0, s.entranceY + 1.4, s.maxZ - 32.0),
      ];
    },
    queen(t, u, api, st) {
      return pathQueen(st.queenRoute, u, api, { ease: api.smoother, seconds: 4.2 });
    },
    camera(t, u, api, st) {
      const e = api.easeInOut(u);
      const pos = api.vadd(api.spline(st.path, e), api.float3(t, 0.2, 0.6, 1.9));
      const look = api.vadd(api.spline(st.look, e), api.float3(t, 0.1, 0.45, 5.5));
      return { pos, look, fov: api.lerp(70, 62, e), focus: look, speed: 0.4 };
    },
  });

  D({
    id: 'b4c-comb',
    guard: false,
    inside: true,
    seconds: 6.6,
    caption: null,
    timeOfDay: 0.34,
    weather: 'clear',
    setup(api, st) {
      const ht = api.ht;
      const comb = ht.nest && ht.nest.comb;
      st.comb = comb;
      st.seed = api.world.seed;
      st.placed = 0;
      st.plan = [];
      if (comb) {
        // The test hive boots with 208 cells already on this wall, so "a comb grows from
        // START" has to start by taking them off it. clear() drops every cell including the
        // permanent seed (it goes round the permanence check), and seedHive() then puts the
        // seven-cell start flower back — verified in probe-build.mjs, which is also where
        // the two traps below were measured.
        try { comb.clear(); } catch (e) {}
        if (typeof comb.seedHive === 'function') { try { comb.seedHive(); } catch (e) {} }

        // TRAP 1: net.bank.deposit does not reach the wallet the comb spends from once
        // comb.detachNet() has run, which the session does at boot. resources.apply is the
        // door that works.
        // TRAP 2: apply() CLAMPS to the bank's capacity, which is 40 of each — five cells'
        // worth, not four thousand. So the montage tops the bank up every frame in act()
        // rather than funding it once here.
        fundBuild(ht);

        // A ring-by-ring plan outward from the start flower, so the comb blooms rather
        // than crawls. Cells the lattice refuses are filtered out, and so are the seven
        // the seed itself occupies — asking for those comes back 'occupied' and silently
        // eats a slot in the schedule.
        const anchor = comb.seedAnchor ? comb.seedAnchor() : null;
        const grid = ht.nest.grid;
        const taken = new Set(Object.keys(comb.snapshot ? comb.snapshot() : {}));
        if (anchor && grid) {
          const seen = new Set();
          let frontier = [{ col: anchor.col, row: anchor.row, layer: 0 }];
          seen.add(grid.key(anchor.col, anchor.row, 0));
          const types = ['wax', 'honey', 'pollen', 'wax', 'brood', 'honey', 'wax', 'pollen'];
          let n = 0;
          while (frontier.length && st.plan.length < 230) {
            const next = [];
            for (const c of frontier) {
              const list = grid.neighbors(c.col, c.row, c.layer, []);
              for (const nb of list) {
                if (nb.layer !== 0) continue;
                const k = grid.key(nb.col, nb.row, nb.layer);
                if (seen.has(k)) continue;
                seen.add(k);
                if (!grid.isValid(nb.col, nb.row, 0)) continue;
                next.push(nb);
                if (taken.has(k)) continue;
                st.plan.push({ col: nb.col, row: nb.row, layer: 0, type: types[n++ % types.length] });
              }
            }
            frontier = next;
          }
        }
      }
    },
    act(t, u, api, st) {
      if (!st.comb || !st.plan.length) return;
      // The bank holds five cells' worth and a cell is spent the moment it is placed, so
      // the top-up is per frame. It is a constant, not a rate, so it cannot desynchronise.
      fundBuild(api.ht);
      // Cells land on a fixed schedule in shot time, never on wall-clock, so the montage
      // is identical every render. The rate eases up: a hesitant start, then a rush.
      const want = Math.floor(api.clamp((t - 0.35) / 5.6, 0, 1) ** 0.78 * st.plan.length);
      while (st.placed < want && st.placed < st.plan.length) {
        const c = st.plan[st.placed++];
        try { st.comb.place(c.col, c.row, c.layer, c.type); } catch (e) {}
      }
    },
    queen(t, u, api, st) {
      // She hangs at the wall where the comb is growing, drifting slowly along it.
      const s = st.seed;
      const x = s.x + Math.sin(t * 0.42) * 5.5;
      const y = s.y + 2.2 + Math.sin(t * 0.71 + 1.2) * 1.4;
      return {
        pos: api.V(x, y, s.z + 4.6),
        vel: api.V(Math.cos(t * 0.42) * 2.3, 0, 0),
        heading: Math.PI,
      };
    },
    camera(t, u, api, st) {
      const s = st.seed;
      const e = api.easeInOut(u);
      // A long push onto the wall with a slight lateral drift, so the growth reads as
      // spreading across the frame rather than simply getting closer.
      const pos = api.vadd(
        api.V(
          api.lerp(-9.5, 3.0, e),
          api.lerp(s.y + 9.5, s.y + 3.2, e),
          api.lerp(s.z + 34.0, s.z + 14.5, e)
        ),
        api.float3(t, 0.16, 0.5, 3.3)
      );
      const look = api.vadd(
        api.V(s.x + api.lerp(1.5, -0.6, e), s.y + api.lerp(1.8, 0.4, e), s.z + 0.6),
        api.float3(t, 0.07, 0.38, 7.1)
      );
      return { pos, look, fov: api.lerp(66, 58, e), focus: look, speed: 0.3 };
    },
  });

  // Tops the hive's wallet up to the brim. resources.apply() clamps to capacity — 40 of
  // each as shipped — so this is a top-up, not a deposit, and asking for four thousand
  // lands exactly the same forty. A cell costs 8 pollen / 4 nectar / 8 resin.
  function fundBuild(ht) {
    if (ht.resources && typeof ht.resources.apply === 'function') {
      try { ht.resources.apply({ pollen: 200, nectar: 200, resin: 200 }); } catch (e) {}
    }
  }

  // ============================================================ BLOCK 5 — weather, seasons
  //
  // One unbroken wide of the tree and the meadow while a whole year and half a dozen
  // weather states go past. Three of the game's own systems are driven, none is faked:
  //
  //   sky      an authored time of day is fed into the real sky.update, so the real sun
  //            crosses the real sky and the real shadow cascade sweeps with it. This is the
  //            same seam src/cinematic/intro.js uses for its two-day lapse.
  //   weather  the real schedule re-based onto a fast phase through weather.setFromWorld —
  //            the module's own multiplayer entry point — so the authored chain runs:
  //            clear, overcast, storm, wind, rain, clear. The rain is weather.js rain and
  //            the wind that bends the grass is weather.js wind.
  //   season   flowers.attachSeason drives bloom openness, so the meadow's species really
  //            open and close through spring, summer, autumn and pre-winter, with a light
  //            seasonal cast on the grade to match.
  D({
    id: 'b5-seasons',
    seconds: 12.0,
    caption: 'Weather every season',
    timeOfDay: 0.22,
    weather: 'clear',
    // A wide, static-ish subject: nothing near the lens, so the reprojection blur has
    // nothing to smear and the slow move earns none anyway.
    motionNear: [14.0, 34.0],
    // Seed 50, entered one phase in: clear → rain → storm → wind → storm → clear. Chosen by
    // reading the chain out of the module for ninety seeds (probe-chain.mjs) rather than by
    // rendering and hoping — the criteria were "opens and closes in sunshine", "at least one
    // real downpour" and "never two fog phases", because a shot that spends three of its
    // twelve seconds in a white-out shows the viewer nothing.
    weatherChain: { seed: 50, phaseMs: 1750, transitionMs: 900, phaseOffset: 1 },
    setup(api, st) {
      st.centre = api.V(0, 22.0, -30.0);
    },
    // Out of frame behind the lens, near enough to keep the meadow's detail streamed in.
    // Behind the lens for the whole arc — checked against both ends of the camera path —
    // and still close enough to the meadow that its flowers and grass stay streamed in.
    queen: parkQueen({ x: -70, y: 8.0, z: 30 }),
    // Morning to dusk in twelve seconds. It stops short of true night on purpose: the block
    // hands over to the end card, which is already a dusk shot, so the light runs straight
    // through the cut instead of dipping to black and coming back.
    sky(t, u, api) {
      return 0.22 + api.easeInOut(u) * 0.74;
    },
    // A whole year, spring through pre-winter, ending just short of the wrap so the last
    // frame is not the same meadow as the first.
    season(t, u) {
      return 0.02 + u * 0.94;
    },
    camera(t, u, api, st) {
      const e = api.easeInOut(u);
      // A long, slow left-to-right drift with a gentle rise. Slow enough that the sun
      // moving and the sky turning over are the motion in the shot, not the dolly.
      const a = -0.95 + e * 0.62;
      const r = api.lerp(72, 60, e);
      const pos = api.vadd(
        api.V(Math.sin(a) * r, api.lerp(13.0, 24.0, e), -30 + Math.cos(a) * r),
        api.float3(t, 0.20, 0.34, 5.2)
      );
      const look = api.vadd(st.centre, api.float3(t, 0.09, 0.28, 1.6));
      return { pos, look, fov: api.lerp(56, 50, e), focus: look, speed: 0.1 };
    },
  });

  // ============================================================ BLOCK 6 — the raid
  //
  // Not the spec's "three queens": that block needs three simultaneous clients in one hive
  // and this single-page harness cannot host them. What went in instead is the beat Jurek
  // actually asked for — an attack. The raid calendar in src/entities/hornets.js is a pure
  // function of (seed, the module's epoch, the season index), and hornets.setEpoch()
  // re-derives it, so sliding that one number brings a real raid onto the shot clock
  // without touching the world clock, the sun, the weather or anything else. Nothing is
  // staged: these are the game's hornets, on the game's own approach, circling the game's
  // own mouth at the radius the config gives them.
  const RAID_SETTLE = 6;       // frames of preroll spent measuring before the calendar is set
  const RAID_ARRIVE_AT = 0.5;  // seconds into the SHOT at which they should reach the mouth

  D({
    id: 'b6-hornets',
    seconds: 5.6,
    caption: 'And hold it when they come',
    timeOfDay: 0.36,
    weather: 'clear',
    motionNear: [9.0, 22.0],
    setup(api, st) {
      const ht = api.ht;
      st.n = 0;
      st.epoch1 = 0;
      const h = ht.hornets;
      st.mouth = h && h.mouth ? api.V(h.mouth.x, h.mouth.y, h.mouth.z) : api.V(0, 16, -22.2);
      if (h && typeof h.setActive === 'function') h.setActive(true);
    },
    act(t, u, api, st) {
      const h = api.ht.hornets;
      if (!h) return;
      const worldNow = api.ht.net && api.ht.net.world ? api.ht.net.world.now() : Date.now();
      // The timeline is rebuilt inside hornets.update(), so the two writes have to be a few
      // frames apart. Both land inside the renderer's preroll, where t is pinned at zero and
      // the frame counter still advances — so the whole solve is a function of the frame
      // index and repeats exactly on every render.
      if (st.n === 0) {
        st.epoch1 = worldNow - 3600000;
        h.setEpoch(st.epoch1);
      } else if (st.n === RAID_SETTLE && h.state.nextRaidAt) {
        // The calendar shifts one for one with the epoch, so one measurement is the solve.
        // Aim the arrival at the top of the shot. The approach was tried first and does not
        // read: at 220 m out on a 45 s lerp, a 0.62 m hornet is a speck, and five specks
        // converging on a tree is not an attack, it is dust. The assault phase — the swarm
        // working the mouth at a 4.2 m radius, close enough to the lens to be animals — is
        // the only framing of this system that carries in five seconds.
        const prerollLeft = (window.__cine.prerollMs || 1000) - RAID_SETTLE * (1000 / 60);
        const lead = prerollLeft + RAID_ARRIVE_AT * 1000;
        h.setEpoch(st.epoch1 + ((worldNow + lead) - h.state.nextRaidAt));
      }
      st.n++;
    },
    // She holds off the mouth, watching them come. The game's rule is that a queen never
    // fights a hornet, so the shot must not show her doing it — she is a witness here, and
    // small in frame, which is also the only way the hornets read as a threat.
    queen(t, u, api, st) {
      const m = st.mouth;
      const bob = Math.sin(t * 1.9) * 0.14;
      // Backed off from the mouth and low in frame, roughly seven metres from the lens. The
      // game's rule is that a queen never fights a hornet, so the shot must not show her
      // doing it: she is a witness, and the size difference is the point.
      return {
        pos: api.V(m.x + 2.6, m.y - 2.4 + bob, m.z + 1.4 + u * 0.5),
        vel: api.V(-0.05, 0, -0.1),
        heading: Math.atan2(-2.6, -1.4),
      };
    },
    camera(t, u, api, st) {
      const m = st.mouth;
      const e = api.easeInOut(u);
      // Right up against the entrance. Sixteen metres out (probe-hornets.mjs) and again at
      // ten, the hornets were flecks; at five, the near side of their 4.2 m ring passes
      // within two metres of the lens and they read as animals. The mouth carries the
      // context — it is unmistakably the front door — so the wide is not needed for it.
      const pos = api.vadd(
        api.V(
          m.x + api.lerp(-6.6, -4.4, e),
          m.y + api.lerp(1.9, 1.0, e),
          m.z + api.lerp(6.0, 4.2, e)
        ),
        api.float3(t, 0.13, 0.8, 4.4)
      );
      const look = api.vadd(api.V(m.x + 0.7, m.y + 0.1, m.z - 0.8), api.float3(t, 0.06, 0.55, 2.9));
      return { pos, look, fov: api.lerp(60, 54, e), focus: api.V(m.x, m.y, m.z), speed: 0.16 };
    },
  });

  // ============================================================ BLOCK 7 — end card
  D({
    id: 'b7-endcard',
    seconds: 9.0,
    caption: 'HOLLOWTREE',
    timeOfDay: 0.97,
    weather: 'clear',
    setup(api, st) {
      st.centre = api.V(0, 26.0, -30.0);
    },
    // Far enough out of frame not to be seen, close enough to keep the meadow dressed.
    queen: parkQueen({ x: 34, y: 8.0, z: 22 }),
    camera(t, u, api, st) {
      const e = api.easeInOut(u);
      const a = -0.62 + e * 0.5;
      const r = api.lerp(56, 46, e);
      const pos = api.vadd(
        api.V(Math.sin(a) * r, api.lerp(17.0, 26.0, e), -30 + Math.cos(a) * r),
        api.float3(t, 0.24, 0.42, 8.8)
      );
      const look = api.vadd(st.centre, api.float3(t, 0.1, 0.3, 2.4));
      return { pos, look, fov: api.lerp(52, 47, e), focus: look, speed: 0.15 };
    },
  });

  // The cut, in order.
  window.__cine.ORDER = [
    'b1-opening',
    'b2-meadow',
    'b3a-approach',
    'b3b-scoop',
    'b3c-lift',
    'b4a-enter',
    'b4b-hall',
    'b4c-comb',
    'b5-seasons',
    'b6-hornets',
    'b7-endcard',
  ];
})();
