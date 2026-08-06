// Hollowtree — pure-logic checks for the net layer: wire packing, interpolation and offline accrual. Run: node work/net-logic.test.mjs

import { createInterpolator, slerp } from '../src/net/interpolation.js';
import { computeOfflineGrant, regrownAmount, seasonAt } from '../src/net/offline.js';
import { packMotion, unpackMotion, pathsOverlap, sameSwarm, sanitizeSwarm } from '../src/net/util.js';
import { NET } from '../src/config.net.js';

let passed = 0;
let failed = 0;
const lines = [];

function check(name, ok, detail) {
  if (ok) { passed++; lines.push(`PASS  ${name}${detail ? `  (${detail})` : ''}`); }
  else { failed++; lines.push(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); }
}

function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------- wire packing

{
  const pos = { x: 123.456, y: -7.891, z: 0.004 };
  const quat = { x: 0.1830127, y: 0.6830127, z: 0.1830127, w: 0.6830127 };
  const vel = { x: 4.44, y: -0.25, z: 9.99 };
  const text = packMotion(517, 1830456, pos, quat, vel, 12.5);
  const back = unpackMotion(text);
  const posOk = near(back.position.x, pos.x, 0.01) && near(back.position.y, pos.y, 0.01) && near(back.position.z, pos.z, 0.01);
  const quatOk = near(back.quaternion.x, quat.x, 1e-3) && near(back.quaternion.w, quat.w, 1e-3);
  const velOk = near(back.velocity.x, vel.x, 0.01) && near(back.velocity.z, vel.z, 0.01);
  check('packMotion round trip', posOk && quatOk && velOk && back.seq === 517 && near(back.carrying, 12.5, 0.01));
  check('packed motion frame is small', text.length <= 80, `${text.length} chars: ${text}`);

  const flipped = { x: -quat.x, y: -quat.y, z: -quat.z, w: -quat.w };
  const backFlipped = unpackMotion(packMotion(1, 0, pos, flipped, vel, 0));
  const dot = backFlipped.quaternion.x * quat.x + backFlipped.quaternion.y * quat.y
    + backFlipped.quaternion.z * quat.z + backFlipped.quaternion.w * quat.w;
  check('negative-w quaternion survives (q and -q are one rotation)', Math.abs(Math.abs(dot) - 1) < 1e-3, `dot=${dot.toFixed(5)}`);

  check('malformed motion string is rejected', unpackMotion('nonsense') === null && unpackMotion('') === null);
}

// ---------------------------------------------------------------- path helpers

check('pathsOverlap ancestor/descendant/sibling',
  pathsOverlap('h/AB/b', 'h/AB/b/pollen')
  && pathsOverlap('h/AB/b/pollen', 'h/AB/b')
  && !pathsOverlap('h/AB/b', 'h/AB/m'));

check('sanitizeSwarm drops zero and junk',
  JSON.stringify(sanitizeSwarm({ worker: 12, builder: 0, guard: -3, fanner: '4', junk: NaN }))
    === JSON.stringify({ worker: 12, fanner: 4 }));

check('sameSwarm compares composition', sameSwarm({ a: 1, b: 2 }, { b: 2, a: 1 }) && !sameSwarm({ a: 1 }, { a: 2 }));

// ---------------------------------------------------------------- interpolation

{
  // Ground truth: a queen circling at 8 m/s, published at 10 Hz with +-25 ms jitter.
  const R = 20;
  const omega = 0.4;
  const truth = (t) => ({
    x: Math.cos(omega * t) * R,
    y: 6 + Math.sin(t * 0.9) * 2,
    z: Math.sin(omega * t) * R,
  });
  const truthVel = (t) => ({
    x: -Math.sin(omega * t) * R * omega,
    y: Math.cos(t * 0.9) * 2 * 0.9,
    z: Math.cos(omega * t) * R * omega,
  });

  const interp = createInterpolator();
  const t0 = 1000000;
  const sendInterval = 1000 / NET.rates.motionHz;
  const duration = 6000;

  let worst = 0;
  let sum = 0;
  let samples = 0;
  let maxJump = 0;
  let prev = null;
  let nextSend = 0;
  let sendIndex = 0;

  for (let ms = 0; ms <= duration; ms += 1000 / 60) {
    const serverNow = t0 + ms;
    while (nextSend <= ms) {
      const sendTime = sendIndex * sendInterval;
      const sec = sendTime / 1000;
      const p = truth(sec);
      const v = truthVel(sec);
      // Quantize exactly as the wire does, then deliver with jitter.
      const packed = unpackMotion(packMotion(sendIndex, sendTime, p, { x: 0, y: 0, z: 0, w: 1 }, v, 0));
      interp.push({
        t: t0 + sendTime,
        position: packed.position,
        quaternion: packed.quaternion,
        velocity: packed.velocity,
        carrying: 0,
      });
      sendIndex++;
      nextSend = sendIndex * sendInterval + (Math.random() * 50 - 25);
    }
    const out = interp.sample(serverNow, 1 / 60);
    if (ms < 600) { prev = { x: out.position.x, y: out.position.y, z: out.position.z }; continue; }
    const expected = truth((serverNow - interp.delay - t0) / 1000);
    const err = Math.hypot(out.position.x - expected.x, out.position.y - expected.y, out.position.z - expected.z);
    worst = Math.max(worst, err);
    sum += err;
    samples++;
    if (prev) {
      const jump = Math.hypot(out.position.x - prev.x, out.position.y - prev.y, out.position.z - prev.z);
      maxJump = Math.max(maxJump, jump);
    }
    prev = { x: out.position.x, y: out.position.y, z: out.position.z };
  }

  const mean = sum / Math.max(1, samples);
  check('interpolated path tracks truth', worst < 0.25, `mean ${mean.toFixed(4)} m, worst ${worst.toFixed(4)} m over ${samples} frames`);
  // At 8 m/s and 60 fps one frame of honest motion is ~0.13 m; anything much above
  // that is a visible pop rather than smooth flight.
  check('no visible pops between frames', maxJump < 0.30, `max frame delta ${maxJump.toFixed(4)} m`);
  check('adaptive delay stays in its band', interp.delay >= NET.interpolation.minDelayMs && interp.delay <= NET.interpolation.maxDelayMs, `${interp.delay.toFixed(1)} ms`);
}

{
  // Starvation: the sender goes quiet. Extrapolation must coast, cap, and never run away.
  const interp = createInterpolator();
  const t0 = 5000;
  for (let i = 0; i < 5; i++) {
    interp.push({
      t: t0 + i * 100,
      position: { x: i * 1, y: 5, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 10, y: 0, z: 0 },
      carrying: 0,
    });
  }
  const lastX = 4;
  let out = interp.sample(t0 + 400 + 150, 0.016);
  const beforeGap = out.position.x;
  for (let i = 0; i < 200; i++) out = interp.sample(t0 + 400 + 150 + i * 50, 0.05);
  const drift = out.position.x - lastX;
  check('extrapolation is capped when the sender goes quiet',
    drift >= 0 && drift <= 10 * (NET.interpolation.maxExtrapolationMs / 1000) + 0.01,
    `settled at x=${out.position.x.toFixed(3)} (last known ${lastX}, first sample after buffer ${beforeGap.toFixed(3)})`);
}

{
  const a = { x: 0, y: 0, z: 0, w: 1 };
  const b = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
  const out = slerp(a, b, 0.5, { x: 0, y: 0, z: 0, w: 1 });
  const expected = { y: Math.sin(Math.PI / 8), w: Math.cos(Math.PI / 8) };
  check('slerp halfway is a real half rotation', near(out.y, expected.y, 1e-6) && near(out.w, expected.w, 1e-6));
}

// ---------------------------------------------------------------- offline accrual

{
  const rate = { pollen: 40, nectar: 30, resin: 8 };
  const kinds = ['pollen', 'nectar', 'resin'];
  const now = 1_700_000_000_000;

  const short = computeOfflineGrant({ now, lastActive: now - 30 * 1000, rate, kinds });
  check('absences under a minute grant nothing', short.total === 0 && short.seconds === 0);

  const four = computeOfflineGrant({ now, lastActive: now - 4 * 3600 * 1000, rate, kinds });
  check('four hours away grants 25 % of four hours',
    near(four.grants.pollen, 40 * 0.25 * 4, 1e-9) && !four.capped,
    `pollen ${four.grants.pollen}`);

  const twenty = computeOfflineGrant({ now, lastActive: now - 20 * 3600 * 1000, rate, kinds });
  check('twenty hours away is capped at eight',
    twenty.capped && near(twenty.seconds, 8 * 3600, 1e-9) && near(twenty.grants.pollen, 40 * 0.25 * 8, 1e-9),
    `pollen ${twenty.grants.pollen} over ${(twenty.seconds / 3600).toFixed(2)} h`);

  const never = computeOfflineGrant({ now, lastActive: 0, rate, kinds });
  check('a world that has never been stamped grants nothing', never.total === 0);

  const future = computeOfflineGrant({ now, lastActive: now + 60_000, rate, kinds });
  check('a clock running backwards cannot mint resources', future.total === 0);

  const capHours = NET.bank.capHours;
  const rateFrac = NET.bank.offlineRate;
  check('offline constants match the spec', capHours === 8 && rateFrac === 0.25, `cap ${capHours} h at ${rateFrac * 100} %`);
}

// ---------------------------------------------------------------- flower regrowth

{
  const now = 1_700_000_000_000;
  const spec = { max: 100, ratePerSec: 5, delaySec: 10 };

  check('an untouched flower reads full',
    regrownAmount({ stored: 0, drainedAt: 0, now, ...spec }) === 100);
  check('regrowth waits out the delay',
    regrownAmount({ stored: 20, drainedAt: now - 8000, now, ...spec }) === 20,
    'drained 8 s ago, delay is 10 s');
  check('regrowth accrues after the delay',
    Math.abs(regrownAmount({ stored: 20, drainedAt: now - 14000, now, ...spec }) - 40) < 1e-9,
    '4 s of growth at 5/s on top of 20');
  check('regrowth never exceeds the reserve',
    regrownAmount({ stored: 20, drainedAt: now - 3600_000, now, ...spec }) === 100,
    'an hour away still caps at max');
  check('a flower regrows while nobody plays',
    regrownAmount({ stored: 0, drainedAt: now - 86_400_000, now, ...spec }) === 100,
    'a full day of absence refills it, with zero bandwidth');
  check('a clock running backwards cannot grow a flower',
    regrownAmount({ stored: 20, drainedAt: now + 60_000, now, ...spec }) === 20);
}

// ---------------------------------------------------------------- season clock

{
  const epoch = 1_700_000_000_000;
  const day = 24 * 3600 * 1000;
  const spring = seasonAt(epoch + 1000, epoch);
  const summer = seasonAt(epoch + 2 * day + 1000, epoch);
  const autumn = seasonAt(epoch + 4 * day + 1000, epoch);
  const prewinter = seasonAt(epoch + 6 * day + 1000, epoch);
  const nextYear = seasonAt(epoch + 8 * day + 1000, epoch);
  check('a season is two real days and a year is eight',
    spring.name === 'spring' && summer.name === 'summer' && autumn.name === 'autumn'
    && prewinter.name === 'prewinter' && nextYear.name === 'spring' && nextYear.year === 1,
    `${spring.name} → ${summer.name} → ${autumn.name} → ${prewinter.name} → ${nextYear.name} (year ${nextYear.year})`);
  const mid = seasonAt(epoch + day, epoch);
  check('season phase runs 0..1 across the season', near(mid.t, 0.5, 1e-9), `t=${mid.t}`);
}

// ---------------------------------------------------------------- bandwidth model

{
  const pos = { x: 12.34, y: 5.67, z: -8.9 };
  const quat = { x: 0.1, y: 0.2, z: 0.3, w: 0.927 };
  const vel = { x: 3.2, y: 0, z: -1.1 };
  const text = packMotion(1234, 1830456, pos, quat, vel, 4.2);
  const path = 'h/ABCDE/m/a1b2c3d4';
  const perMessage = text.length + path.length;
  const rtdbFraming = 78; // measured envelope of an RTDB "p" (put) frame
  const hz = NET.rates.motionHz;
  const up = (perMessage + rtdbFraming) * hz;
  const down = up * 2; // two peers at three players
  check('per-client uplink at 10 Hz stays under 2 KB/s', up < 2048, `${(up / 1024).toFixed(2)} KB/s up (${perMessage} B payload + ~${rtdbFraming} B framing)`);
  lines.push(`INFO  projected aggregate at 3 players: ${((up + down) / 1024).toFixed(2)} KB/s (up ${(up / 1024).toFixed(2)} + down ${(down / 1024).toFixed(2)})`);
}

lines.push('');
lines.push(`${passed} passed, ${failed} failed`);
console.log(lines.join('\n'));
process.exit(failed ? 1 : 0);
