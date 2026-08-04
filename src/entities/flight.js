// Hollowtree — queen flight kinematics: thrust, drag, banking, hover bob, terrain follow. Pure state, no rendering.

import { Vector3, Quaternion, Euler, MathUtils } from "three";
import { FLIGHT } from "../config.js";

const _wish = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _closest = new Vector3();
const _normal = new Vector3();
const _euler = new Euler(0, 0, 0, "YXZ");

function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

function damp(rate, dt) {
  return Math.exp(-rate * dt);
}

function smoothstep(edge0, edge1, x) {
  const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function boxOf(c) {
  if (!c) return null;
  if (c.min && c.max) return c;
  if (c.box && c.box.min) return c.box;
  if (c.aabb && c.aabb.min) return c.aabb;
  return null;
}

export function createFlight(terrain) {
  const position = new Vector3(0, FLIGHT.minAltitude + 2.5, 0);
  const velocity = new Vector3();
  const quaternion = new Quaternion();

  const base = position.clone();
  const lastExposed = position.clone();
  const prevPlanar = new Vector3();

  let heading = 0;
  let yawRate = 0;
  let bank = 0;
  let bankVel = 0;
  let pitch = 0;
  let pitchVel = 0;
  let boostAmount = 0;
  let boostSurge = 0;
  let liftDrive = 0;
  let fwdAccelSmooth = 0;
  let bobPhase = Math.random() * Math.PI * 2;
  let bobOffset = 0;
  let hoverFactor = 0;
  let grounded = false;
  let clock = 0;

  const groundHeight = (x, z) => (terrain && terrain.getHeight ? terrain.getHeight(x, z) : 0);

  function resolveColliders(p, v, radius) {
    const list = terrain && terrain.colliders;
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const b = boxOf(list[i]);
      if (!b) continue;
      const min = b.min;
      const max = b.max;
      if (
        p.x < min.x - radius || p.x > max.x + radius ||
        p.y < min.y - radius || p.y > max.y + radius ||
        p.z < min.z - radius || p.z > max.z + radius
      ) continue;

      _closest.set(
        MathUtils.clamp(p.x, min.x, max.x),
        MathUtils.clamp(p.y, min.y, max.y),
        MathUtils.clamp(p.z, min.z, max.z)
      );
      _normal.copy(p).sub(_closest);
      const distSq = _normal.lengthSq();
      let depth;

      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        if (dist >= radius) continue;
        _normal.multiplyScalar(1 / dist);
        depth = radius - dist;
      } else {
        const px = Math.min(p.x - min.x, max.x - p.x);
        const py = Math.min(p.y - min.y, max.y - p.y);
        const pz = Math.min(p.z - min.z, max.z - p.z);
        if (py <= px && py <= pz) {
          _normal.set(0, p.y - (min.y + max.y) * 0.5 >= 0 ? 1 : -1, 0);
          depth = py + radius;
        } else if (px <= pz) {
          _normal.set(p.x - (min.x + max.x) * 0.5 >= 0 ? 1 : -1, 0, 0);
          depth = px + radius;
        } else {
          _normal.set(0, 0, p.z - (min.z + max.z) * 0.5 >= 0 ? 1 : -1);
          depth = pz + radius;
        }
      }

      p.addScaledVector(_normal, depth);
      const vn = v.dot(_normal);
      if (vn < 0) {
        v.addScaledVector(_normal, -vn);
        v.multiplyScalar(FLIGHT.collisionSlide);
      }
      if (_normal.y > 0.5) grounded = true;
    }
  }

  const state = {
    position,
    velocity,
    quaternion,
    bank: 0,
    pitch: 0,
    yawRate: 0,
    heading: 0,
    speed: 0,
    planarSpeed: 0,
    speedRatio: 0,
    boostAmount: 0,
    hoverFactor: 0,
    bob: 0,
    grounded: false,
    altitude: 0,
    terrain,
    update,
  };

  function update(dt, input, cameraYaw) {
    if (!(dt > 0)) return state;
    dt = Math.min(dt, FLIGHT.maxDt);
    clock += dt;

    const inF = input && typeof input.forward === "number" ? input.forward : 0;
    const inS = input && typeof input.strafe === "number" ? input.strafe : 0;
    const inL = input && typeof input.lift === "number" ? input.lift : 0;
    const inB = input && input.boost ? 1 : 0;
    const yawRef = typeof cameraYaw === "number" ? cameraYaw : heading;

    if (position.distanceToSquared(lastExposed) > 1e-6) base.copy(position);

    const prevBoost = boostAmount;
    boostAmount += (inB - boostAmount) * (1 - damp(FLIGHT.boostResponse, dt));
    if (boostAmount - prevBoost > 0.0005 && boostAmount < 0.85) {
      boostSurge = Math.min(1, boostSurge + (boostAmount - prevBoost) * 6);
    }
    boostSurge *= damp(FLIGHT.boostSurgeDecay, dt);

    const maxSpeed = MathUtils.lerp(FLIGHT.maxSpeed, FLIGHT.boostSpeed, boostAmount);
    const accel =
      MathUtils.lerp(FLIGHT.accel, FLIGHT.boostAccel, boostAmount) *
      (1 + boostSurge * (FLIGHT.boostSurge - 1));

    _fwd.set(-Math.sin(yawRef), 0, -Math.cos(yawRef));
    _right.set(Math.cos(yawRef), 0, -Math.sin(yawRef));

    const f = inF >= 0 ? inF : inF * FLIGHT.reverseScale;
    const s = inS * FLIGHT.strafeScale;
    _wish.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, s);
    const wishLen = _wish.length();
    if (wishLen > 1) _wish.multiplyScalar(1 / wishLen);
    const throttle = Math.min(wishLen, 1);

    prevPlanar.set(velocity.x, 0, velocity.z);

    velocity.x += _wish.x * accel * dt;
    velocity.z += _wish.z * accel * dt;

    let planar = Math.hypot(velocity.x, velocity.z);
    const dragRate = FLIGHT.drag + FLIGHT.dragQuad * planar + (grounded ? FLIGHT.groundFriction : 0);
    const dragFactor = damp(dragRate, dt);
    velocity.x *= dragFactor;
    velocity.z *= dragFactor;

    planar = Math.hypot(velocity.x, velocity.z);
    if (planar > maxSpeed && planar > 1e-4) {
      const target = maxSpeed + (planar - maxSpeed) * damp(FLIGHT.speedCapResponse, dt);
      const k = target / planar;
      velocity.x *= k;
      velocity.z *= k;
      planar = target;
    }

    liftDrive += (inL - liftDrive) * (1 - damp(FLIGHT.liftSpool, dt));
    velocity.y += liftDrive * FLIGHT.liftAccel * dt;
    velocity.y *= damp(FLIGHT.liftDamp + (Math.abs(inL) < 0.01 ? FLIGHT.liftIdleDamp : 0), dt);
    const liftCap = FLIGHT.liftSpeed * (1 + boostAmount * 0.45);
    if (Math.abs(velocity.y) > liftCap) {
      velocity.y = MathUtils.lerp(Math.sign(velocity.y) * liftCap, velocity.y, damp(FLIGHT.speedCapResponse, dt));
    }

    base.addScaledVector(velocity, dt);

    grounded = false;

    const floor = groundHeight(base.x, base.z) + FLIGHT.minAltitude;
    const pen = floor - base.y;
    if (pen > 0) {
      velocity.y += pen * FLIGHT.groundSpring * dt;
      if (velocity.y < 0) velocity.y *= damp(FLIGHT.groundAbsorb, dt);
      base.y += pen * (1 - damp(FLIGHT.groundPush, dt));
      if (base.y < floor - FLIGHT.groundMaxPenetration) base.y = floor - FLIGHT.groundMaxPenetration;
    }
    grounded = pen > -FLIGHT.groundedBand;

    const ceiling = groundHeight(base.x, base.z) + FLIGHT.maxAltitude;
    if (base.y > ceiling) {
      base.y = MathUtils.lerp(ceiling, base.y, damp(FLIGHT.ceilingDamp, dt));
      if (velocity.y > 0) velocity.y *= damp(FLIGHT.ceilingDamp * 2, dt);
    }

    resolveColliders(base, velocity, FLIGHT.bodyRadius);

    const turnCap = FLIGHT.turnRate * (1 + boostAmount * (FLIGHT.turnRateBoost - 1));
    const delta = wrapAngle(yawRef - heading);
    const desiredRate = MathUtils.clamp(delta * FLIGHT.turnSharpness, -turnCap, turnCap);
    yawRate += (desiredRate - yawRate) * (1 - damp(FLIGHT.turnSmoothing, dt));
    heading = wrapAngle(heading + yawRate * dt);

    planar = Math.hypot(velocity.x, velocity.z);
    const speedRatio = MathUtils.clamp(planar / FLIGHT.maxSpeed, 0, 1.6);

    const dvx = velocity.x - prevPlanar.x;
    const dvz = velocity.z - prevPlanar.z;
    const fwdAccel = (dvx * _fwd.x + dvz * _fwd.z) / dt;
    fwdAccelSmooth += (fwdAccel - fwdAccelSmooth) * (1 - damp(FLIGHT.accelSmoothing, dt));

    hoverFactor = 1 - smoothstep(FLIGHT.hoverSpeedRange * 0.15, FLIGHT.hoverSpeedRange, planar);

    let bankTarget =
      yawRate * planar * FLIGHT.bankFromTurn +
      inS * FLIGHT.bankFromStrafe * (0.35 + speedRatio * 0.65);
    bankTarget += Math.sin(clock * FLIGHT.hoverWobbleFreq * Math.PI * 2) * FLIGHT.hoverWobbleAmp * hoverFactor;
    bankTarget = MathUtils.clamp(bankTarget, -FLIGHT.bankMax, FLIGHT.bankMax);

    const bw = FLIGHT.bankResponse;
    bankVel += (bw * bw * (bankTarget - bank) - 2 * bw * bankVel) * dt;
    bank += bankVel * dt;

    let pitchTarget =
      -fwdAccelSmooth * FLIGHT.pitchFromAccel +
      velocity.y * FLIGHT.pitchFromClimb -
      throttle * speedRatio * FLIGHT.pitchFromThrottle;
    pitchTarget = MathUtils.clamp(pitchTarget, -FLIGHT.pitchMax, FLIGHT.pitchMax);

    const pw = FLIGHT.pitchResponse;
    pitchVel += (pw * pw * (pitchTarget - pitch) - 2 * pw * pitchVel) * dt;
    pitch += pitchVel * dt;

    bobPhase += dt * Math.PI * 2 * (FLIGHT.hoverBobFreq + speedRatio * FLIGHT.hoverBobFreqGain);
    if (bobPhase > Math.PI * 4) bobPhase -= Math.PI * 4;
    const bobTarget =
      (Math.sin(bobPhase) * 0.72 + Math.sin(bobPhase * 2.13 + 1.1) * 0.28) *
      FLIGHT.hoverBobAmp *
      (hoverFactor * 0.85 + 0.15);
    bobOffset += (bobTarget - bobOffset) * (1 - damp(FLIGHT.hoverBobResponse, dt));

    _euler.set(pitch, heading, bank, "YXZ");
    quaternion.setFromEuler(_euler);

    position.copy(base);
    position.y += bobOffset;
    lastExposed.copy(position);

    state.bank = bank;
    state.pitch = pitch;
    state.yawRate = yawRate;
    state.heading = heading;
    state.speed = velocity.length();
    state.planarSpeed = planar;
    state.speedRatio = speedRatio;
    state.boostAmount = boostAmount;
    state.hoverFactor = hoverFactor;
    state.bob = bobOffset;
    state.grounded = grounded;
    state.altitude = base.y - groundHeight(base.x, base.z);
    return state;
  }

  _euler.set(0, 0, 0);
  quaternion.setFromEuler(_euler);

  return state;
}
