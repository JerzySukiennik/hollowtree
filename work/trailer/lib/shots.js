// Hollowtree trailer — the shot list. Blocks 1, 2, 3, 4 and 7 of SPEC-trailer.md.
// Blocks 5 (weather time-lapse) and 6 (three queens) are deliberately absent; the gaps are
// marked below so they can be dropped in without touching anything else.
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
    flowerGuard: 3.4,
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
    },
    queen(t, u, api, st) {
      return pathQueen(st.route, u, api, { ease: api.smoother, seconds: 11.0 });
    },
    camera(t, u, api, st) {
      const q = pathQueen(st.route, u, api, { ease: api.smoother, seconds: 11.0 });
      const dir = api.vnorm(api.V(q.vel.x, 0, q.vel.z));
      const right = api.V(-dir.z, 0, dir.x);
      // The rig drifts from over her shoulder round to a low side profile, so the shot
      // reads as one move rather than a locked follow-cam.
      const swing = api.smooth(api.clamp((u - 0.12) / 0.7, 0, 1));
      // Slung BELOW her, so the flower heads run along the bottom of the frame and she
      // reads against the sky instead of against the horizon line.
      const back = api.lerp(5.2, 2.6, swing);
      const side = api.lerp(0.4, 3.4, swing);
      const lift = api.lerp(-1.3, -0.7, swing);
      const pos = api.vadd(
        api.vadd(
          api.vsub(q.pos, api.vscale(dir, back)),
          api.vscale(right, side)
        ),
        api.vadd(api.V(0, lift, 0), api.float3(t, 0.22, 0.9, 2.7))
      );
      // Never let the lens dip into the grass.
      const floor = api.ground(pos.x, pos.z) + 3.0;
      if (pos.y < floor) pos.y = floor;
      const look = api.vadd(
        api.vadd(q.pos, api.vscale(dir, api.lerp(3.0, 1.2, swing))),
        api.vadd(api.V(0, -0.9, 0), api.float3(t, 0.12, 0.7, 6.2))
      );
      return { pos, look, fov: api.lerp(64, 58, api.smooth(u)), focus: q.pos, speed: 0.55 };
    },
  });

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
        // Fill the bank first: an empty hive cannot afford a cell, and a build montage
        // that silently fails is worse than no montage.
        const bank = ht.net && ht.net.bank;
        if (bank && typeof bank.deposit === 'function') {
          for (const kind of ['pollen', 'nectar', 'resin', 'wax', 'honey']) {
            try { bank.deposit(kind, 4000); } catch (e) {}
          }
        }
        if (ht.resources && typeof ht.resources.apply === 'function') {
          try { ht.resources.apply({ pollen: 4000, nectar: 4000, resin: 4000 }); } catch (e) {}
        }
        if (typeof comb.seedHive === 'function') { try { comb.seedHive(); } catch (e) {} }
        // A ring-by-ring plan outward from the start flower, so the comb blooms rather
        // than crawls. Only cells the lattice actually accepts survive the filter.
        const anchor = comb.seedAnchor ? comb.seedAnchor() : null;
        const grid = ht.nest.grid;
        if (anchor && grid) {
          const seen = new Set();
          let frontier = [{ col: anchor.col, row: anchor.row, layer: 0 }];
          seen.add(grid.key(anchor.col, anchor.row, 0));
          const types = ['wax', 'honey', 'pollen', 'wax', 'brood', 'honey', 'wax', 'pollen'];
          let n = 0;
          while (frontier.length && st.plan.length < 190) {
            const next = [];
            for (const c of frontier) {
              const list = grid.neighbors(c.col, c.row, c.layer, []);
              for (const nb of list) {
                if (nb.layer !== 0) continue;
                const k = grid.key(nb.col, nb.row, nb.layer);
                if (seen.has(k)) continue;
                seen.add(k);
                if (!grid.isValid(nb.col, nb.row, 0)) continue;
                st.plan.push({ col: nb.col, row: nb.row, layer: 0, type: types[n++ % types.length] });
                next.push(nb);
              }
            }
            frontier = next;
          }
        }
      }
    },
    act(t, u, api, st) {
      if (!st.comb || !st.plan.length) return;
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

  // ============================================================ BLOCK 5 — GAP
  // "Weather the season" — a sun-to-rain-to-dusk time-lapse. Not built this round: it
  // depends on the weather acceleration another builder is finishing for the rebuilt intro.
  // Drop shots in here with ids b5-*, add them to ORDER below, and the assembly picks them
  // up with no other change.

  // ============================================================ BLOCK 6 — GAP
  // "Three queens, one hollow" — needs three simultaneous clients in one hive, which this
  // single-page harness cannot host. Same drill: ids b6-*, added to ORDER.

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

  // The cut, in order. Blocks 5 and 6 belong between b4c-comb and b7-endcard.
  window.__cine.ORDER = [
    'b1-opening',
    'b2-meadow',
    'b3a-approach',
    'b3b-scoop',
    'b3c-lift',
    'b4a-enter',
    'b4b-hall',
    'b4c-comb',
    'b7-endcard',
  ];
})();
