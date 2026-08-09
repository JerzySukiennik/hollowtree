// Hollowtree — the layer that answers "what now?", and nothing else.
//
// Exactly two things live here, and both are usually invisible:
//
//   1. ONE line of text, top centre, naming the next concrete action;
//   2. ONE marker, ever — the way home while she is carrying something, otherwise the
//      nearest bloom worth flying to.
//
// The single-marker rule is structural, not a discipline: there is one marker element in
// this file and it is retargeted, so two can never be on screen even if a future branch
// forgets. The line and the marker are both consequences of live numbers; there is no step
// counter and no script, so solving step four first simply means steps one to three never
// appear, and a player who is already self-sufficient is never spoken to at all.
//
// What this layer will not do: repeat something already on screen. The build panel is left
// to talk on its own, and the zone barrier — which draws its own sentence over the meadow
// from world/zones.js — silences the line's zone branch for as long as it is legible.

import * as THREE from 'three';
import { GATHER, HUD, HIVE, FLOWERS, ZONES } from '../config.js';
import { CELL_BY_ID } from '../config.comb.js';

// Where the guidance may draw. The bank is fixed at right:26 bottom:26 over four rows
// (measured: x 1098-1254, y 601-694) and the carrying meter sits bottom-centre from y=560.
// One generous bottom band clears both at once, which makes the no-overlap claim a single
// number rather than three rectangles. The objective line occupies y 24-38, so markers
// start below it.
const SAFE = { top: 62, bottom: 180, side: 34 };

// The middle belongs to the queen and, in build mode, to the reticle. A marker that lands
// there is redundant anyway — the target is already under her nose — so it dissolves
// rather than fight for the pixel.
const CENTER_CLEAR = 74;
const CENTER_FULL = 142;

const KINDS = ['pollen', 'nectar', 'resin'];

const CSS = `
.ht-guide{position:fixed;inset:0;z-index:5;pointer-events:none;
font:500 13px/1.2 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1,"lnum" 1;-webkit-font-smoothing:antialiased;color:${HUD.colors.text}}

.ht-obj{position:absolute;left:50%;top:24px;transform:translateX(-50%);
height:14px;display:flex;justify-content:center;width:min(760px,86vw)}
.ht-obj span{position:absolute;white-space:nowrap;font-size:10.5px;letter-spacing:.22em;
text-transform:uppercase;color:${HUD.colors.text};opacity:0;
text-shadow:0 1px 6px rgba(0,0,0,.8),0 0 22px rgba(0,0,0,.45);
transition:opacity .55s ease,transform .55s cubic-bezier(.22,.61,.36,1);
transform:translateY(-4px)}
.ht-obj span.is-on{opacity:.62;transform:none}
.ht-obj span em{font-style:normal;color:${HUD.colors.pollen};opacity:.92}

.ht-mk{position:absolute;left:0;top:0;display:inline-flex;align-items:center;gap:8px;
white-space:nowrap;opacity:0;will-change:transform,opacity}
.ht-mk.is-flip{flex-direction:row-reverse}
.ht-mk-eye{position:relative;width:9px;height:9px;flex:0 0 auto}
.ht-mk-eye::before{content:"";position:absolute;inset:0;border-radius:50%;
border:1px solid currentColor;opacity:.7}
.ht-mk-eye::after{content:"";position:absolute;inset:3px;border-radius:50%;
background:currentColor;opacity:.85;box-shadow:0 0 7px currentColor}
.ht-mk-tick{position:absolute;left:50%;top:50%;width:11px;height:1px;
background:currentColor;opacity:0;transform-origin:0 50%;transition:opacity .3s ease}
.ht-mk.is-edge .ht-mk-tick{opacity:.5}
.ht-mk-text{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;
color:${HUD.colors.text};opacity:.72;text-shadow:0 1px 5px rgba(0,0,0,.85)}
.ht-mk-text b{font-weight:500;opacity:.6}
.ht-mk-text i{font-style:normal;opacity:.42;margin:0 5px}

@media (prefers-reduced-motion:reduce){
.ht-guide *,.ht-guide{transition-duration:.01ms!important;animation:none!important}}
`;

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Metres, whole numbers. A 14-year-old reads "48 m" without a legend, and the dev readout
// already speaks metres, so the two never disagree.
function metres(d) {
  if (!(d > 0)) return '0 m';
  if (d < 10) return `${d.toFixed(1)} m`;
  return `${Math.round(d)} m`;
}

export function createGuidance() {
  const style = document.createElement('style');
  style.id = 'ht-guidance';
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'ht-guide');

  const obj = el('div', 'ht-obj', root);
  const objA = el('span', '', obj);
  const objB = el('span', '', obj);
  let objFront = objA;
  let objBack = objB;
  let objText = '';

  // THE marker. One node, retargeted — see the header note.
  const mk = el('div', 'ht-mk', root);
  const mkEye = el('i', 'ht-mk-eye', mk);
  const mkTick = el('i', 'ht-mk-tick', mkEye);
  const mkText = el('div', 'ht-mk-text', mk);
  let mkShown = 0;
  let mkLabel = '';
  let mkFlip = false;
  let mkEdge = false;

  document.body.appendChild(root);

  // --- state the guidance keeps for itself ---------------------------------------------
  let deposits = 0;
  let lastDeposit = null;
  let everGathered = false;
  let stuck = 0;          // seconds spent full and a long way from home
  let pickTimer = 0;      // throttle on the flower search
  let picked = null;      // { pos, name, kind }
  let groups = null;      // cached flower group metadata (positions read live)

  const _v = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _p = new THREE.Vector3();

  // ---------------------------------------------------------------------------------
  // Flower lookup.
  //
  // flowers.js gives us sampleNearest(point, radius) — nearest live bloom to a point — but
  // nothing that filters by what a flower YIELDS, and no per-flower position array. So the
  // scan below reads the one complete position table the module does expose: every species
  // group carries its InstancedMesh, and writeMatrix() always writes the world translation
  // into elements 12..14 of each instance, culled or not. Only the group metadata is cached;
  // the coordinates are read live, so regrowth and wind never leave a stale table behind.
  //
  // Liveness is not decided here. Candidates are handed back to sampleNearest, which already
  // owns reserve, bloom and depletion — so a drained bloom yields its live neighbour.
  function groupsOf(flowers) {
    const list = flowers && flowers.flowers;
    if (!Array.isArray(list) || !list.length) return null;
    const out = [];
    for (let s = 0; s < list.length; s++) {
      const g = list[s];
      const species = g && g.species;
      if (!species || !g.matrix || !g.count) continue;
      const yields = {
        pollen: Number(species.pollen) || 0,
        nectar: Number(species.nectar) || 0,
        resin: Number(species.resin) || 0,
      };
      if (!(yields.pollen || yields.nectar || yields.resin)) continue;
      out.push({ s, species, yields, g });
    }
    return out.length ? out : null;
  }

  // Which store the hive is poorest in, measured against the room it actually has. A kind
  // the comb cannot hold yet is not "needed least", it is not needed at all, so a zero
  // capacity scores as satisfied rather than as an emergency; and a full store goes last,
  // because there is no point sending her for pollen she cannot bank.
  function neediestKinds(bank, capacity) {
    const scored = [];
    for (const kind of KINDS) {
      const cap = capacity && Number.isFinite(capacity[kind]) ? capacity[kind] : 0;
      const have = bank && Number.isFinite(bank[kind]) ? bank[kind] : 0;
      scored.push({ kind, ratio: cap > 0 ? have / cap : have / 12, room: cap <= 0 || have < cap - 0.5 });
    }
    scored.sort((a, b) => a.ratio - b.ratio);
    const open = scored.filter((k) => k.room);
    return (open.length ? open : scored).map((k) => k.kind);
  }

  function pickFlower(world, from, bank, capacity) {
    const flowers = world.flowers;
    if (!flowers || typeof flowers.sampleNearest !== 'function') return null;
    if (!groups) groups = groupsOf(flowers);
    if (!groups) return null;

    const zones = world.zones;
    // Never point past the fog wall: a bloom in a locked band is not a suggestion, it is a
    // tease. zones.limit is the radius the wind starts turning her back at.
    const limit = zones && Number.isFinite(zones.limit) ? zones.limit - 4 : Infinity;
    const limitSq = limit * limit;
    const cx = ZONES.center.x;
    const cz = ZONES.center.z;

    const inBloom = typeof flowers.inBloom === 'function' ? flowers.inBloom : () => true;

    for (const kind of neediestKinds(bank, capacity)) {
      const candidates = groups.filter((g) => g.yields[kind] > 0 && inBloom(g.s));
      if (!candidates.length) continue;

      // The eight nearest positions, one cheap pass, no allocation per flower.
      const best = [];
      for (const c of candidates) {
        const arr = c.g.matrix;
        const n = c.g.count | 0;
        for (let i = 0; i < n; i++) {
          const o = i * 16;
          const x = arr[o + 12];
          const z = arr[o + 14];
          const rx = x - cx;
          const rz = z - cz;
          if (rx * rx + rz * rz > limitSq) continue;
          const dx = x - from.x;
          const dz = z - from.z;
          const dSq = dx * dx + dz * dz;
          if (best.length < 8) {
            best.push({ dSq, x, y: arr[o + 13], z });
            if (best.length === 8) best.sort((a, b) => a.dSq - b.dSq);
          } else if (dSq < best[7].dSq) {
            best[7] = { dSq, x, y: arr[o + 13], z };
            best.sort((a, b) => a.dSq - b.dSq);
          }
        }
      }
      if (!best.length) continue;
      best.sort((a, b) => a.dSq - b.dSq);

      // sampleNearest returns a SHARED handle, so everything is copied out before the
      // next call can overwrite it.
      for (const c of best) {
        _c.set(c.x, c.y, c.z);
        const hit = flowers.sampleNearest(_c, 7);
        if (!hit || !hit.species || !hit.inBloom) continue;
        if (!(hit.reserve > FLOWERS.reserveEpsilon)) continue;
        if (!(Number(hit.species[kind]) > 0)) continue;
        const px = hit.position.x;
        const pz = hit.position.z;
        if ((px - cx) * (px - cx) + (pz - cz) * (pz - cz) > limitSq) continue;
        return {
          pos: new THREE.Vector3(px, hit.position.y, pz),
          name: hit.species.name || 'a flower',
          kind,
        };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------------
  // Projection. Screen pixels, plus whether the point had to be pushed to an edge.
  function project(point, camera, W, H, inset) {
    _v.copy(point).project(camera);
    // A point behind the camera comes back through the near plane with both axes mirrored;
    // flipping it puts the edge marker on the side the target really is.
    _p.copy(point).applyMatrix4(camera.matrixWorldInverse);
    let behind = false;
    if (_p.z > 0) {
      behind = true;
      _v.x = -_v.x;
      _v.y = -_v.y;
    }
    let x = (_v.x * 0.5 + 0.5) * W;
    let y = (1 - (_v.y * 0.5 + 0.5)) * H;

    const minX = inset.left;
    const maxX = W - inset.right;
    const minY = inset.top;
    const maxY = H - inset.bottom;

    if (behind || x < minX || x > maxX || y < minY || y > maxY) {
      // Push along the ray from the frame's centre, so a clamped position still reads as a
      // bearing rather than as a corner.
      const ccx = (minX + maxX) * 0.5;
      const ccy = (minY + maxY) * 0.5;
      let dx = x - ccx;
      let dy = y - ccy;
      if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dy = -1;
      const t = Math.min(
        Math.abs(dx) > 1e-4 ? ((maxX - minX) * 0.5) / Math.abs(dx) : Infinity,
        Math.abs(dy) > 1e-4 ? ((maxY - minY) * 0.5) / Math.abs(dy) : Infinity
      );
      return { x: ccx + dx * t, y: ccy + dy * t, offscreen: true, angle: Math.atan2(dy, dx) };
    }
    return { x, y, offscreen: false, angle: 0 };
  }

  function drawMarker(spec, dt, camera, W, H, inset) {
    let target = 0;
    if (spec) {
      const p = project(spec.point, camera, W, H, inset);

      // Arrival: the marker dissolves as she closes on it instead of blinking out.
      let alpha = smoothstep(spec.arrive, spec.arrive * 2.4 + 2, spec.distance);
      if (!p.offscreen) {
        const r = Math.hypot(p.x - W * 0.5, p.y - H * 0.5);
        alpha *= smoothstep(CENTER_CLEAR, CENTER_FULL, r);
      }

      const flip = p.x > W * 0.5;
      if (flip !== mkFlip) { mkFlip = flip; mk.classList.toggle('is-flip', flip); }
      if (p.offscreen !== mkEdge) { mkEdge = p.offscreen; mk.classList.toggle('is-edge', p.offscreen); }
      if (p.offscreen) mkTick.style.transform = `rotate(${p.angle}rad)`;

      const label = `${spec.label}<i>·</i><b>${metres(spec.distance)}</b>`;
      if (mkLabel !== label) { mkLabel = label; mkText.innerHTML = label; }
      if (spec.color) mk.style.color = spec.color;

      // Centre the row on the point, then keep it inside the safe frame using its measured
      // box — the label is what overhangs, not the dot.
      const w = mk.offsetWidth || 0;
      const h = mk.offsetHeight || 0;
      const x = Math.min(Math.max(p.x, inset.left + w * 0.5), W - inset.right - w * 0.5);
      const y = Math.min(Math.max(p.y, inset.top + h * 0.5), H - inset.bottom - h * 0.5);
      mk.style.transform = `translate(${(x - w * 0.5).toFixed(1)}px,${(y - h * 0.5).toFixed(1)}px)`;
      target = alpha;
    }

    mkShown += (target - mkShown) * (1 - Math.exp(-6 * dt));
    if (mkShown < 0.004) mkShown = 0;
    const o = mkShown.toFixed(3);
    if (mk.style.opacity !== o) mk.style.opacity = o;
  }

  function setObjective(html) {
    const text = html || '';
    if (text === objText) return;
    objText = text;
    const next = objBack;
    objBack = objFront;
    objFront = next;
    objBack.classList.remove('is-on');
    if (!text) return;
    objFront.innerHTML = text;
    objFront.classList.remove('is-on');
    void objFront.offsetWidth;
    objFront.classList.add('is-on');
  }

  // The zone barrier draws its own sentence over the meadow, from world/zones.js. While it
  // is legible, the line must not say the same thing one row higher — so it is asked, not
  // assumed. Reading the element is the ground truth for "is this on screen".
  function barrierSpeaking() {
    const node = document.getElementById('zone-barrier');
    if (!node) return false;
    return Number(node.style.opacity || 0) > 0.03;
  }

  // zones.js builds its shortfall phrases from the raw type id and always pluralises, so it
  // says "a pollen cell" — a thing the game calls a pollen store everywhere else — and
  // "1 more comb cells". The barrier line fixes this for itself in ui/resource-sources.js
  // with a private helper; the same repair is done here so the two never disagree about
  // what a cell is called, whichever of them happens to be speaking.
  function tidyPhrase(phrase) {
    let out = phrase.replace(/^1 more comb cells$/, '1 more comb cell');
    out = out.replace(/^a ([a-z-]+) cell$/, (m, id) => {
      const type = CELL_BY_ID.get(id);
      return type ? `a ${type.name}` : m;
    });
    out = out.replace(/^(\d+) ([a-z-]+) cells$/, (m, n, id) => {
      const type = CELL_BY_ID.get(id);
      return type ? `${n} ${type.name}s` : m;
    });
    return out;
  }

  function zoneLineFor(zones) {
    if (!zones || !zones.state) return '';
    const next = zones.state.open | 0;
    const bands = zones.bands || ZONES.bands;
    if (!bands || next >= bands.length) return '';
    const req = typeof zones.requirement === 'function' ? zones.requirement(next) : null;
    if (!req || req.unlocked || !req.missing || !req.missing.length) return '';
    const band = bands[next];
    return `${(band && band.label) || 'the next ring'} opens at ${req.missing.map(tidyPhrase).join(' and ')}`;
  }

  // ---------------------------------------------------------------------------------
  // The one line. Every branch is a reading of live state, in the order a first session
  // actually meets them.
  function objectiveFor(w) {
    if (w.buildOpen) return '';         // the build panel is already talking
    // Nothing else is the next action while the mouse is not hers yet. This rung is why
    // main.js no longer keeps a "click to fly" label of its own: the same sentence, in the
    // one place sentences live, and it leaves the moment the pointer locks.
    if (!w.pointerLocked) return 'click to fly';
    if (w.notice) return w.notice;      // a refusal just answered her; that IS the next action

    if (w.inside) {
      if (!w.builtOwn) return 'press <em>Tab</em> to open the comb and place your first cell';
      if (w.zoneLine && !w.veteran) return w.zoneLine;
      return '';
    }

    if (w.full) return 'your baskets are full — fly back into the hollow';

    if (!w.veteran) {
      if (w.carrying > 0.001 && !w.deposited) return 'keep filling, then fly back into the hollow';
      if (!w.everGathered) return 'find a flower and hold <em>E</em> to fill your baskets';
      if (!w.builtOwn) {
        return w.canAfford
          ? 'you have enough to build — fly into the hollow and press <em>Tab</em>'
          : 'gather more, then carry it home to build your first cell';
      }
      if (w.zoneLine) return w.zoneLine;
    }

    // Retired. It returns only when the numbers say she is genuinely stuck: full baskets,
    // a long way out, for long enough that it is not a scenic detour.
    if (w.stuckLong) return 'nothing counts until it is inside the tree — carry it home';
    return '';
  }

  // ---------------------------------------------------------------------------------
  function update(dt, model) {
    const step = Math.min(Math.max(dt || 0, 0), 0.1);
    const w = (model && model.world) || (typeof window !== 'undefined' ? window.hollowtree : null);
    const g = (model && model.gather) || (w && w.gather && w.gather.state) || null;

    // Silent whenever there is nothing to be silent about.
    if (!w || !g || w.mode !== 'play' || !w.camera || !w.flight) {
      setObjective('');
      drawMarker(null, step);
      return;
    }

    const canvas = w.renderer && w.renderer.domElement;
    const W = (canvas && canvas.clientWidth) || window.innerWidth || 1280;
    const H = (canvas && canvas.clientHeight) || window.innerHeight || 720;

    const nest = w.nest || null;
    const comb = nest && nest.comb;
    const build = nest && nest.build;
    const portal = nest && nest.portal;

    const insideness = portal && portal.state ? portal.state.insideness : 0;
    const inside = insideness > 0.5;
    const buildOpen = Boolean(build && build.state && build.state.open);

    const bank = (comb && typeof comb.bankSnapshot === 'function' ? comb.bankSnapshot() : null)
      || (w.resources && typeof w.resources.snapshot === 'function' ? w.resources.snapshot() : {});
    const capacity = (comb && comb.capacity) || null;

    // Has she built anything of her own? The hollow is seeded with cells of type `seed`,
    // so "her own" is any other type appearing in the tally — which stays true however
    // many cells the seed happens to have.
    const counts = (comb && comb.effects && comb.effects.counts) || null;
    const builtOwn = Boolean(counts && Object.keys(counts).some((k) => k !== 'seed' && counts[k] > 0));
    const zonesOpen = w.zones && w.zones.state ? (w.zones.state.open | 0) : 1;

    // Deposits, counted off the identity of the last deposit event rather than a flash
    // decay, so a frame-rate change cannot miscount them.
    if (g.lastDeposit && g.lastDeposit !== lastDeposit) { lastDeposit = g.lastDeposit; deposits++; }
    if ((g.load || 0) > 0.001) everGathered = true;

    const carrying = g.load || 0;
    const full = Boolean(g.full) && !inside;

    const pos = w.flight.position;
    const entrance = (w.hive && w.hive.entrance)
      || (nest && nest.spec && nest.spec.entrancePos)
      || null;
    const homeDist = entrance ? pos.distanceTo(entrance) : 0;

    if (full && homeDist > 55) stuck += step; else stuck = Math.max(0, stuck - step * 2);

    // "Self-sufficient" is a measured claim, not a timer: she has built past the seed and
    // banked several loads, or she has already opened a second ring.
    const doneCount = comb && comb.effects && Number.isFinite(comb.effects.doneCount)
      ? comb.effects.doneCount : 0;
    const veteran = (builtOwn && doneCount >= 12 && deposits >= 4) || zonesOpen >= 2;

    // Can she afford anything at all? The cheapest unlocked cell decides.
    let canAfford = false;
    if (comb && typeof comb.unlockedTypes === 'function' && typeof comb.affordable === 'function') {
      try {
        for (const t of comb.unlockedTypes() || []) {
          const id = typeof t === 'string' ? t : t && t.id;
          if (id && comb.affordable(id)) { canAfford = true; break; }
        }
      } catch (error) { canAfford = false; }
    }

    const zoneLine = barrierSpeaking() ? '' : zoneLineFor(w.zones);

    setObjective(objectiveFor({
      notice: (w.gameHud && w.gameHud.notice) || null,
      pointerLocked: !w.input || w.input.pointerLocked !== false,
      inside,
      buildOpen,
      builtOwn,
      veteran,
      full,
      carrying,
      everGathered,
      deposited: deposits > 0,
      canAfford,
      stuckLong: stuck > 18,
      zoneLine,
    }));

    // --- the one marker ------------------------------------------------------------------
    const inset = { top: SAFE.top, bottom: SAFE.bottom, left: SAFE.side, right: SAFE.side };
    const outside = !inside && insideness < 0.2 && !buildOpen;

    let spec = null;
    if (outside && carrying > 0.001 && entrance) {
      // Carrying something: the only question worth pixels is which way home.
      spec = {
        point: entrance,
        distance: homeDist,
        arrive: HIVE.triggerRadius,
        label: 'the hollow',
        color: HUD.colors.honey,
      };
    } else if (outside && !g.full && !veteran) {
      // Empty-handed and still learning the meadow: name one bloom worth flying to. This
      // retires the moment she is self-sufficient — a veteran can see flowers perfectly
      // well, and pointing at them then is hand-holding.
      pickTimer -= step;
      if (pickTimer <= 0) { pickTimer = 0.35; picked = pickFlower(w, pos, bank, capacity); }
      if (picked) {
        spec = {
          point: picked.pos,
          distance: pos.distanceTo(picked.pos),
          arrive: GATHER.range,
          label: picked.name,
          color: HUD.colors[picked.kind] || HUD.colors.pollen,
        };
      }
    } else {
      picked = null;
    }

    drawMarker(spec, step, w.camera, W, H, inset);
  }

  return {
    root,
    update,
    // Exposed for verification: the measured on-screen box of each element, so overlap with
    // the build panel or the bank is a number rather than an opinion.
    probe() {
      const box = (node, on) => {
        const r = node.getBoundingClientRect();
        return {
          visible: on,
          x: Math.round(r.left), y: Math.round(r.top),
          w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          text: (node.textContent || '').trim(),
        };
      };
      return {
        objective: box(objFront, objFront.classList.contains('is-on')),
        marker: box(mk, mkShown > 0.02),
        markerOpacity: mkShown,
      };
    },
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
