// Hollowtree — shared resource bank: every mutation is one clamped, all-or-nothing commit ready to be wrapped by a networked transaction.

import { RESOURCES } from '../config.js';

export function createResources() {
  const kinds = RESOURCES.kinds.slice();
  const store = {};
  const capacity = {};
  const pending = {};
  for (const kind of kinds) {
    store[kind] = RESOURCES.start[kind] || 0;
    capacity[kind] = RESOURCES.capacity[kind] || 0;
    pending[kind] = 0;
  }

  const listeners = [];
  let revision = 0;

  function snapshot() {
    const out = { revision };
    for (const kind of kinds) out[kind] = store[kind];
    return out;
  }

  function emit(delta) {
    if (!listeners.length) return;
    const snap = snapshot();
    for (let i = 0; i < listeners.length; i++) listeners[i](snap, delta);
  }

  function resolve(delta) {
    let touched = false;
    for (const kind of kinds) {
      const want = delta && typeof delta[kind] === 'number' ? delta[kind] : 0;
      if (!want) {
        pending[kind] = 0;
        continue;
      }
      const next = store[kind] + want;
      if (want < 0 && next < -1e-6) return null;
      const clamped = Math.max(0, Math.min(capacity[kind], next));
      pending[kind] = clamped - store[kind];
      if (Math.abs(pending[kind]) > 1e-9) touched = true;
    }
    return touched ? pending : null;
  }

  function commit(applied) {
    for (const kind of kinds) store[kind] += applied[kind];
    revision++;
  }

  function apply(delta) {
    const applied = resolve(delta);
    if (!applied) return null;
    const result = {};
    for (const kind of kinds) result[kind] = applied[kind];
    commit(applied);
    emit(result);
    return result;
  }

  function add(kind, amount) {
    if (!kinds.includes(kind) || !(amount > 0)) return 0;
    const result = apply({ [kind]: amount });
    return result ? result[kind] : 0;
  }

  function spend(kind, amount) {
    if (!kinds.includes(kind) || !(amount > 0)) return 0;
    if (store[kind] + 1e-6 < amount) return 0;
    const result = apply({ [kind]: -amount });
    return result ? -result[kind] : 0;
  }

  // Capacity is not a constant: from M2 on it is the sum of the comb's store cells, so
  // the nest decides how much the hive can hold. Lowering it below what is already
  // stored spills the excess — a demolished store loses what it was holding.
  function setCapacity(kind, value) {
    if (!kinds.includes(kind)) return capacity[kind];
    const next = Math.max(0, Number(value) || 0);
    if (Math.abs(next - capacity[kind]) < 1e-9) return capacity[kind];
    capacity[kind] = next;
    if (store[kind] > next) {
      const spill = store[kind] - next;
      store[kind] = next;
      revision++;
      const delta = {};
      for (const k of kinds) delta[k] = k === kind ? -spill : 0;
      emit(delta);
    }
    return capacity[kind];
  }

  function room(kind) {
    if (!kinds.includes(kind)) return 0;
    return Math.max(0, capacity[kind] - store[kind]);
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  const api = {
    kinds,
    capacity,
    apply,
    add,
    spend,
    setCapacity,
    room,
    snapshot,
    onChange,
    get revision() {
      return revision;
    },
  };

  for (const kind of kinds) {
    Object.defineProperty(api, kind, {
      enumerable: true,
      get: () => store[kind],
    });
  }

  return api;
}
