// Hollowtree — the gathering loop: hold to fill the queen's baskets at a flower, fly into the hollow to deposit.

import { GATHER } from '../config.js';

export function createGather(flowers, resources, flight, hive) {
  const baskets = { pollen: 0, nectar: 0, resin: 0 };
  const kinds = resources && resources.kinds ? resources.kinds : ['pollen', 'nectar', 'resin'];
  const listeners = [];

  // ------------------------------------------------------------------ voice of the loop
  //
  // Every deliberate act here answers back. The rules, in one place so they can be argued
  // with: one cue per event and never two for the same one; a refusal never sounds like a
  // success; everything that has a place in the world is played from that place; and when
  // two cues collide the emitter's give-way rule decides which one steps back, so a full
  // basket landing on the same frame as a scoop does not read as one loud noise.
  const SFX = {
    // Units of resource between scoop cues. GATHER.rate is 1.5/s, so at full charge this
    // lands roughly every 0.57 s — a steady pulse rather than a stream — and stretches out
    // by itself while the charge winds up or the bloom runs thin. The tempo is therefore a
    // reading of how well the flower is giving, taken without looking at the HUD.
    // (At 22 units of basket capacity that is about 26 ticks from empty to full.)
    scoopUnit: 0.85,
    // Below this share of a flower's reserve it is "nearly spent" and says so, once.
    spentRatio: 0.18,
    // How long after draining a bloom dry a press still reads as "that one is empty"
    // rather than "there is nothing here".
    spentMemory: 2.0,
    deniedGap: 0.4,
  };

  // Priorities for the give-way rule. Higher wins a collision.
  const P_SCOOP = 2;
  const P_SPENT = 3;
  const P_REFUSE = 4;
  const P_FULL = 5;
  const P_DEPOSIT = 6;

  let audio = null;
  // True only when main.js handed us the audio system on purpose. In that mode we own the
  // deposit cue. Found through the global fallback instead, we assume the old one-line
  // listener in main.js is still there and stay quiet, because two deposit sounds for one
  // deposit is exactly the confusion this work exists to remove.
  let audioOwned = false;

  function attachAudio(handle) {
    if (!handle || typeof handle.play !== 'function') return false;
    audio = handle;
    audioOwned = true;
    return true;
  }

  function sfx() {
    if (audio) return audio;
    const global = typeof window !== 'undefined' && window.hollowtree ? window.hollowtree.audio : null;
    if (global && typeof global.play === 'function') audio = global;
    return audio;
  }

  // One place where a cue can be silently dropped, so no call site has to think about
  // whether the context is unlocked yet.
  function cue(id, opts) {
    const handle = sfx();
    if (!handle || typeof handle.play !== 'function') return null;
    state.cues++;
    return handle.play(id, opts);
  }

  function shapeLoop(tone) {
    const handle = sfx();
    if (handle && typeof handle.setGatherTone === 'function') handle.setGatherTone(tone);
  }

  // A decisive stop: the loop is cut rather than left ringing over the answer. The charge
  // goes with it so the smoothed level cannot climb back out of the cut on the next frame.
  function cutLoop() {
    const handle = sfx();
    if (handle && typeof handle.releaseGather === 'function') handle.releaseGather();
    state.charge = 0;
    state.active = false;
  }

  // Refusals share one voice (sfx-denied) and are told apart by pitch, which is the part
  // a player actually learns: low means "not yet", high means "not you, you are full".
  const REFUSALS = {
    bloom: { rate: 0.78, volume: 0.9, lowpass: 2600 },
    empty: { rate: 0.9, volume: 0.8, lowpass: 3200 },
    // "Not like this" — a flower is right there and giving, but the queen is still moving
    // too fast to hold onto it. Quietest of the four and heavily veiled, because the HUD
    // already says `steady` and this only has to stop the player thinking nothing heard them.
    fast: { rate: 1.05, volume: 0.5, lowpass: 1500 },
    full: { rate: 1.24, volume: 0.95 },
  };

  // flowers.js hands out ONE reused handle object, so `state.target.position` is whatever
  // flower was sampled most recently — fine inside a frame, wrong by the time a networked
  // drain resolves. We copy the head position of the bloom we are actually drawing from,
  // and play the scoop from that copy, so online scoops still come out of the right flower.
  const scoopAt = { x: 0, y: 0, z: 0 };
  let scoopAtValid = false;

  function captureTarget(handle) {
    if (!handle || !handle.position) {
      scoopAtValid = false;
      return;
    }
    scoopAt.x = handle.position.x;
    scoopAt.y = handle.position.y;
    scoopAt.z = handle.position.z;
    scoopAtValid = true;
  }

  let refusedAt = -1e9;
  function refuse(reason, position, now) {
    const spec = REFUSALS[reason];
    if (!spec || now - refusedAt < SFX.deniedGap) return null;
    refusedAt = now;
    state.lastRefusal = reason;
    return cue('denied', {
      position,
      rate: spec.rate,
      volume: spec.volume,
      lowpass: spec.lowpass,
      priority: P_REFUSE,
      minGap: SFX.deniedGap,
    });
  }

  // Bookkeeping for the "once per event" rule.
  let clock = 0;
  let scoopAccum = 0;
  let creditQuiet = false;
  let wasFull = false;
  let wasWanting = false;
  let warnedIndex = -1;
  let heldIndex = -1;
  let spentAt = -1e9;

  const state = {
    active: false,
    charge: 0,
    load: 0,
    capacity: GATHER.basketCapacity,
    fill: 0,
    full: false,
    baskets,
    target: null,
    targetName: '',
    targetRatio: 0,
    nearFlower: false,
    nearHive: false,
    tooFast: false,
    hint: null,
    depositFlash: 0,
    lastDeposit: null,
    // Which refusal was heard last, and how many cues have gone out. Both exist so the
    // feedback can be asserted from outside instead of taken on trust.
    lastRefusal: null,
    cues: 0,
    // Collective gathering (M3): what the swarm brought in, kept apart from the
    // queen's own scoops so the HUD can show that a bigger swarm really is faster.
    swarmUnits: 0,
    swarmRate: 0,
  };

  let swarmWindow = 0;
  let swarmSinceWindow = 0;

  let cooldown = 0;

  function onDeposit(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  function totalLoad() {
    let sum = 0;
    for (const kind of kinds) sum += baskets[kind] || 0;
    return sum;
  }

  function deposit() {
    const load = totalLoad();
    if (load <= 1e-4) return null;
    const delta = {};
    for (const kind of kinds) delta[kind] = baskets[kind] || 0;
    const applied = resources && resources.apply ? resources.apply(delta) : null;
    if (!applied) return null;
    for (const kind of kinds) baskets[kind] = Math.max(0, (baskets[kind] || 0) - applied[kind]);
    const event = { total: load, applied, at: state.nearHive ? 'hive' : 'hive' };
    state.lastDeposit = event;
    state.depositFlash = 1;

    // The payoff of the whole loop, played from the hollow's mouth and scaled by what was
    // actually carried in — a token load lands softly, a full one arrives.
    if (audioOwned) {
      const share = Math.min(1, load / Math.max(1e-3, GATHER.basketCapacity));
      const where = hive && hive.entrance ? hive.entrance : (flight && flight.position) || null;
      cue('deposit', {
        position: where,
        volume: 0.5 + 0.5 * share,
        rate: 0.96 + 0.07 * share,
        priority: P_DEPOSIT,
        minGap: GATHER.depositCooldown * 0.5,
      });
      // A brimming load earns one grace note on top, offset so it reads as a consequence
      // of the arrival rather than as a second, competing event.
      if (share > 0.98) {
        cue('shimmer', {
          position: where,
          volume: 0.4,
          rate: 1.06,
          delay: 0.16,
          priority: P_SCOOP,
          minGap: 1.0,
        });
      }
    }

    for (let i = 0; i < listeners.length; i++) listeners[i](event);
    return event;
  }

  // A granted scoop, possibly arriving a network round trip after it was asked for.
  // Room is measured at credit time, not at request time.
  function credit(scoop) {
    if (!scoop) return;
    const room = Math.max(0, GATHER.basketCapacity - totalLoad());
    if (room <= 0) return;
    let gained = 0;
    for (const kind of kinds) gained += scoop[kind] || 0;
    if (gained <= 0) return;
    const k = gained > room ? room / gained : 1;
    const before = totalLoad();
    for (const kind of kinds) baskets[kind] = (baskets[kind] || 0) + (scoop[kind] || 0) * k;
    const next = totalLoad();
    state.load = next;
    state.fill = Math.min(1, next / GATHER.basketCapacity);
    state.full = next >= GATHER.basketCapacity - 1e-4;

    // A scoop is granted continuously but has to *land* discretely, or there is no moment
    // to hear. Cues go out per fixed quantum of resource, so the tempo of the ticking is
    // the rate the flower is actually giving, not the frame rate.
    if (!creditQuiet) {
      scoopAccum += Math.max(0, next - before);
      if (scoopAccum >= SFX.scoopUnit) {
        scoopAccum -= SFX.scoopUnit * Math.floor(scoopAccum / SFX.scoopUnit);
        cue('pickup', {
          position: scoopAtValid ? scoopAt : null,
          volume: 0.55 + 0.25 * state.fill,
          rate: 0.93 + 0.24 * state.fill,
          priority: P_SCOOP,
          minGap: 0.09,
        });
      }
    }
  }

  // The swarm's share of a bloom, credited through exactly the same room check as the
  // queen's own scoop — the baskets are one pool, so a big swarm just fills them sooner.
  function creditSwarm(scoop) {
    if (!scoop) return;
    const before = totalLoad();
    // The swarm works in the background and is heard as the hive layer swelling, not as
    // the queen's own scoop cue — a hundred bees each ticking would bury the one tick the
    // player caused.
    creditQuiet = true;
    credit(scoop);
    creditQuiet = false;
    const gained = totalLoad() - before;
    if (gained > 0) {
      state.swarmUnits += gained;
      swarmSinceWindow += gained;
    }
  }

  function update(dt, input) {
    if (!(dt > 0)) return state;
    clock += dt;
    swarmWindow += dt;
    if (swarmWindow >= 0.5) {
      state.swarmRate = swarmSinceWindow / swarmWindow;
      swarmSinceWindow = 0;
      swarmWindow = 0;
    }
    if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
    if (state.depositFlash > 0) state.depositFlash = Math.max(0, state.depositFlash - dt);

    const position = flight && flight.position ? flight.position : null;
    const speed = flight && typeof flight.planarSpeed === 'number'
      ? flight.planarSpeed
      : flight && flight.velocity
        ? Math.hypot(flight.velocity.x, flight.velocity.z)
        : 0;

    const load = totalLoad();
    state.load = load;
    state.fill = Math.min(1, load / GATHER.basketCapacity);
    state.full = load >= GATHER.basketCapacity - 1e-4;

    state.nearHive = false;
    if (position && hive && hive.entrance) {
      const radius = hive.triggerRadius || 1;
      state.nearHive = position.distanceToSquared(hive.entrance) <= radius * radius;
    }

    if (state.nearHive && cooldown <= 0 && load > 1e-4) {
      deposit();
      cooldown = GATHER.depositCooldown;
      state.active = false;
      state.charge = 0;
      state.load = totalLoad();
      state.fill = 0;
      state.full = false;
    }

    const near = position && flowers && flowers.sampleNearest
      ? flowers.sampleNearest(position, GATHER.promptRange)
      : null;
    const inRange = Boolean(near) && near.distance <= GATHER.range;
    state.nearFlower = inRange;
    state.target = near;
    state.targetName = near && near.species ? near.species.name : '';
    state.targetRatio = near ? near.ratio : 0;

    const wants = Boolean(input && input.gather);
    state.tooFast = wants && inRange && speed > GATHER.hoverSpeed;

    // A flower outside its window yields nothing — flowers.drain() refuses it outright —
    // so the charge must not build and the loop must not sing over a refusal. Before this
    // gate, holding E on a closed bloom produced the full drawing-out sound and no
    // resource, which is the single most misleading thing the loop could do.
    const usable = Boolean(near) && near.inBloom !== false;
    const canGather = wants && inRange && usable && !state.full && speed <= GATHER.breakSpeed;
    const steady = canGather && speed <= GATHER.hoverSpeed;

    if (steady) {
      state.charge = Math.min(1, state.charge + dt / Math.max(1e-3, GATHER.windUp));
    } else {
      state.charge = Math.max(0, state.charge - dt * GATHER.windDown);
    }
    state.active = steady && state.charge > 0;

    // ---------------------------------------------------------------- feedback
    const here = (flight && flight.position) || null;
    const targetAt = near && near.position ? near.position : here;

    // Refusals fire on the press, not on the hold: an answer to a question asked once
    // should be given once. Order matters — the reason nearest the player's intent wins.
    if (wants && !wasWanting) {
      if (inRange && near && !usable) {
        refuse('bloom', targetAt, clock);
      } else if (state.full && (inRange || state.load > 1e-4)) {
        refuse('full', here, clock);
      } else if (inRange && usable && speed > GATHER.hoverSpeed) {
        refuse('fast', targetAt, clock);
      } else if (!inRange && clock - spentAt < SFX.spentMemory) {
        refuse('empty', here, clock);
      }
    }

    // Baskets just filled. Said once per fill, and the drawing-out stops with it, because
    // a loop that keeps running while nothing can enter the baskets is a lie.
    if (state.full && !wasFull) {
      cue('full', {
        position: here,
        volume: 0.9,
        priority: P_FULL,
        minGap: 0.5,
      });
      cutLoop();
    }
    wasFull = state.full;

    if (state.active && near) {
      // The bloom is running out: one warning per flower, and the loop thins out with it
      // so the warning is confirmed by everything that follows rather than replaced by it.
      if (near.ratio <= SFX.spentRatio && warnedIndex !== near.index) {
        warnedIndex = near.index;
        cue('shimmer', {
          position: targetAt,
          volume: 0.45,
          rate: 0.86,
          priority: P_SPENT,
          minGap: 0.8,
        });
      }
      heldIndex = near.index;
      captureTarget(near);
      shapeLoop(near.ratio);
    } else if (heldIndex !== -1) {
      // We were drawing from something and now we are not. If it vanished from targeting
      // while we still had room, it was drained dry — that deserves the empty answer and
      // a clean cut, not a slow fade into nothing.
      // `wants` is the disambiguator: a player still holding the key when the target
      // disappears drained it. A player who simply let go did not, and gets silence.
      if (wants && !state.full && (!near || near.index !== heldIndex)) {
        spentAt = clock;
        refuse('empty', targetAt, clock);
        cutLoop();
      }
      heldIndex = -1;
      warnedIndex = -1;
      shapeLoop(1);
    }

    wasWanting = wants;

    if (state.active && near) {
      const wanted = GATHER.rate * state.charge * dt;
      // Ask; credit only what comes back. Offline the callback fires in this same
      // statement, online it fires when the shared transaction resolves — either way
      // the baskets are filled from what the flower actually gave up, never from what
      // was requested, so two queens on one bloom cannot both scoop it dry.
      if (flowers.drain) flowers.drain(near, wanted, credit);
    }

    if (state.full && state.nearHive) state.hint = 'deposit';
    else if (state.depositFlash > 0) state.hint = 'deposited';
    else if (state.full) state.hint = 'full';
    else if (state.active) state.hint = 'holding';
    else if (state.tooFast) state.hint = 'steady';
    else if (inRange) state.hint = 'gather';
    else if (state.load > 1e-4) state.hint = 'deposit';
    else state.hint = null;

    return state;
  }

  return { state, baskets, update, deposit, onDeposit, credit, creditSwarm, attachAudio };
}
