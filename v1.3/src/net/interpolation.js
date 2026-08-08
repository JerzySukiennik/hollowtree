// Hollowtree — remote queen smoothing: a jitter buffer plus Hermite position and slerp orientation, rendered a fixed delay behind server time.

import { NET } from '../config.net.js';

const I = NET.interpolation;

function hermite(p0, v0, p1, v1, h, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1;
}

export function slerp(a, b, t, out) {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let s0 = 1 - t;
  let s1 = t;
  if (dot < 0.9995) {
    const theta = Math.acos(Math.min(1, dot));
    const sin = Math.sin(theta);
    if (sin > 1e-6) {
      s0 = Math.sin((1 - t) * theta) / sin;
      s1 = Math.sin(t * theta) / sin;
    }
  }
  out.x = a.x * s0 + bx * s1;
  out.y = a.y * s0 + by * s1;
  out.z = a.z * s0 + bz * s1;
  out.w = a.w * s0 + bw * s1;
  const len = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  out.x /= len; out.y /= len; out.z /= len; out.w /= len;
  return out;
}

export function createInterpolator() {
  const buffer = [];
  const position = { x: 0, y: 0, z: 0 };
  const quaternion = { x: 0, y: 0, z: 0, w: 1 };
  const velocity = { x: 0, y: 0, z: 0 };

  let delay = I.baseDelayMs;
  let intervalEma = 1000 / NET.rates.motionHz;
  let jitterEma = 0;
  let lastArrival = 0;
  let carrying = 0;
  let started = false;
  let extrapolating = false;

  function push(sample) {
    if (!sample || !Number.isFinite(sample.t)) return;
    const last = buffer.length ? buffer[buffer.length - 1] : null;
    if (last && sample.t <= last.t) return; // out of order or duplicate — drop it
    if (last) {
      const gap = sample.t - last.t;
      const deviation = Math.abs(gap - intervalEma);
      intervalEma += (gap - intervalEma) * 0.2;
      jitterEma += (deviation - jitterEma) * 0.2;
    }
    lastArrival = sample.t;
    buffer.push(sample);
    while (buffer.length > I.bufferSamples) buffer.shift();
    if (!started) {
      started = true;
      position.x = sample.position.x;
      position.y = sample.position.y;
      position.z = sample.position.z;
      quaternion.x = sample.quaternion.x;
      quaternion.y = sample.quaternion.y;
      quaternion.z = sample.quaternion.z;
      quaternion.w = sample.quaternion.w;
    }
  }

  function targetDelay() {
    const want = intervalEma + I.jitterFactor * jitterEma + I.safetyMs;
    return Math.min(I.maxDelayMs, Math.max(I.minDelayMs, want));
  }

  function adapt(dt) {
    const want = targetDelay();
    const k = 1 - Math.exp(-I.delayAdaptRate * Math.max(0, dt));
    delay += (want - delay) * k;
  }

  // serverNow is the receiver's server-corrected clock; sample.t is the sender's.
  function sample(serverNow, dt) {
    adapt(dt || 0);
    if (!buffer.length) return { position, quaternion, velocity, carrying, extrapolating, delay };

    const renderTime = serverNow - delay;

    while (buffer.length > 2 && buffer[1].t <= renderTime) buffer.shift();

    const first = buffer[0];
    const last = buffer[buffer.length - 1];

    if (renderTime <= first.t) {
      assign(first, 0);
      extrapolating = false;
      return { position, quaternion, velocity, carrying, extrapolating, delay };
    }

    let a = null;
    let b = null;
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].t <= renderTime && renderTime <= buffer[i + 1].t) {
        a = buffer[i];
        b = buffer[i + 1];
        break;
      }
    }

    if (a && b) {
      extrapolating = false;
      const h = (b.t - a.t) / 1000;
      const s = h > 1e-6 ? (renderTime - a.t) / (b.t - a.t) : 1;
      const dist = Math.hypot(
        b.position.x - a.position.x,
        b.position.y - a.position.y,
        b.position.z - a.position.z
      );
      if (dist > I.snapDistance) {
        assign(b, 0);
      } else {
        position.x = hermite(a.position.x, a.velocity.x, b.position.x, b.velocity.x, h, s);
        position.y = hermite(a.position.y, a.velocity.y, b.position.y, b.velocity.y, h, s);
        position.z = hermite(a.position.z, a.velocity.z, b.position.z, b.velocity.z, h, s);
        slerp(a.quaternion, b.quaternion, s, quaternion);
        velocity.x = a.velocity.x + (b.velocity.x - a.velocity.x) * s;
        velocity.y = a.velocity.y + (b.velocity.y - a.velocity.y) * s;
        velocity.z = a.velocity.z + (b.velocity.z - a.velocity.z) * s;
        carrying = a.carrying + (b.carrying - a.carrying) * s;
      }
      return { position, quaternion, velocity, carrying, extrapolating, delay };
    }

    // Starved: coast on the newest sample's velocity, damped and hard capped.
    const ahead = Math.min(I.maxExtrapolationMs, renderTime - last.t) / 1000;
    const damp = Math.max(0, 1 - ahead / (I.maxExtrapolationMs / 1000));
    extrapolating = ahead > 0;
    assign(last, 0);
    position.x += last.velocity.x * ahead * damp;
    position.y += last.velocity.y * ahead * damp;
    position.z += last.velocity.z * ahead * damp;
    return { position, quaternion, velocity, carrying, extrapolating, delay };
  }

  function assign(s) {
    position.x = s.position.x;
    position.y = s.position.y;
    position.z = s.position.z;
    quaternion.x = s.quaternion.x;
    quaternion.y = s.quaternion.y;
    quaternion.z = s.quaternion.z;
    quaternion.w = s.quaternion.w;
    velocity.x = s.velocity.x;
    velocity.y = s.velocity.y;
    velocity.z = s.velocity.z;
    carrying = s.carrying;
  }

  return {
    push,
    sample,
    position,
    quaternion,
    velocity,
    get carrying() { return carrying; },
    get delay() { return delay; },
    get jitter() { return jitterEma; },
    get interval() { return intervalEma; },
    get lastArrival() { return lastArrival; },
    get count() { return buffer.length; },
    get started() { return started; },
    reset() {
      buffer.length = 0;
      started = false;
    },
  };
}
