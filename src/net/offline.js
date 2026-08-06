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
