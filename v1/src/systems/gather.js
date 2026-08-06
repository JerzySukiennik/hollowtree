// Hollowtree — the gathering loop: hold to fill the queen's baskets at a flower, fly into the hollow to deposit.

import { GATHER } from '../config.js';

export function createGather(flowers, resources, flight, hive) {
  const baskets = { pollen: 0, nectar: 0, resin: 0 };
  const kinds = resources && resources.kinds ? resources.kinds : ['pollen', 'nectar', 'resin'];
  const listeners = [];

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
  };

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
    for (const kind of kinds) baskets[kind] = (baskets[kind] || 0) + (scoop[kind] || 0) * k;
    const next = totalLoad();
    state.load = next;
    state.fill = Math.min(1, next / GATHER.basketCapacity);
    state.full = next >= GATHER.basketCapacity - 1e-4;
  }

  function update(dt, input) {
    if (!(dt > 0)) return state;
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

    const canGather = wants && inRange && !state.full && speed <= GATHER.breakSpeed;
    const steady = canGather && speed <= GATHER.hoverSpeed;

    if (steady) {
      state.charge = Math.min(1, state.charge + dt / Math.max(1e-3, GATHER.windUp));
    } else {
      state.charge = Math.max(0, state.charge - dt * GATHER.windDown);
    }
    state.active = steady && state.charge > 0;

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

  return { state, baskets, update, deposit, onDeposit };
}
