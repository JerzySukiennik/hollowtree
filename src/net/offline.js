// Hollowtree — offline progression maths: 25 % of the live gather rate, hard capped at eight hours, always from server timestamps.

import { NET } from '../config.net.js';

const B = NET.bank;

// lastActive / now are server-clock milliseconds. rate is units per hour at full
// (online) efficiency. Returns the grant and the number of seconds actually credited.
export function computeOfflineGrant(options) {
  const opts = options || {};
  const now = Number(opts.now) || 0;
  const lastActive = Number(opts.lastActive) || 0;
  const rate = opts.rate || B.defaultRate;
  const kinds = opts.kinds || Object.keys(rate);
  const capSeconds = (opts.capHours != null ? opts.capHours : B.capHours) * 3600;
  const efficiency = opts.efficiency != null ? opts.efficiency : B.offlineRate;

  const raw = Math.max(0, (now - lastActive) / 1000);
  const seconds = Math.min(raw, capSeconds);
  const grants = {};
  for (const kind of kinds) grants[kind] = 0;

  if (!lastActive || raw < B.minAccrualSec) {
    return { seconds: 0, rawSeconds: raw, capped: false, grants, total: 0 };
  }

  let total = 0;
  for (const kind of kinds) {
    const perHour = Number(rate[kind]) || 0;
    const value = perHour * efficiency * (seconds / 3600);
    grants[kind] = value;
    total += value;
  }

  return { seconds, rawSeconds: raw, capped: raw > capSeconds, grants, total };
}

// A flower's reserve is stored as the amount it had when it was last drained, plus
// the server timestamp of that drain. Every client derives the current amount from
// those two numbers, so regrowth costs no bandwidth at all, every client agrees
// without syncing, and the meadow refills while nobody is playing — which is the
// whole point of "the world advances while nobody plays".
export function regrownAmount(options) {
  const opts = options || {};
  const max = Number(opts.max) || 0;
  const stored = Math.max(0, Math.min(max, Number(opts.stored) || 0));
  const drainedAt = Number(opts.drainedAt) || 0;
  const now = Number(opts.now) || 0;
  const ratePerSec = Number(opts.ratePerSec) || 0;
  const delaySec = Number(opts.delaySec) || 0;

  // No drain has ever been recorded, so nobody has touched this flower: it is full.
  // Reading it as empty would start every meadow stripped bare.
  if (!drainedAt) return max;
  if (stored >= max || ratePerSec <= 0) return stored;
  const elapsed = (now - drainedAt) / 1000 - delaySec;
  if (!(elapsed > 0)) return stored;
  return Math.min(max, stored + elapsed * ratePerSec);
}

// The season clock derives purely from the server epoch, so the world keeps turning
// while nobody is connected.
export function seasonAt(nowMs, epochMs) {
  const names = NET.season.names;
  const lengthMs = NET.season.lengthSec * 1000;
  const yearMs = lengthMs * names.length;
  const elapsed = Math.max(0, (Number(nowMs) || 0) - (Number(epochMs) || 0));
  const yearT = (elapsed % yearMs) / yearMs;
  const index = Math.min(names.length - 1, Math.floor((elapsed % yearMs) / lengthMs));
  const t = ((elapsed % yearMs) - index * lengthMs) / lengthMs;
  return {
    index,
    name: names[index],
    t,
    yearT,
    year: Math.floor(elapsed / yearMs),
    secondsLeft: (1 - t) * NET.season.lengthSec,
  };
}
