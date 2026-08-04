// Hollowtree — third-person spring-follow camera: look-ahead, bank roll, boost FOV kick, terrain push-out.

import { Vector3, MathUtils } from "three";
import { CAMERA } from "../config.js";

const _desired = new Vector3();
const _dir = new Vector3();
const _lookTarget = new Vector3();
const _vel = new Vector3();
const _lag = new Vector3();
const _prevVel = new Vector3();

function damp(rate, dt) {
  return Math.exp(-rate * dt);
}

export function createCameraRig(camera, flightState) {
  let yaw = 0;
  let pitch = -0.12;
  let roll = 0;
  let fov = CAMERA.fov;
  let clock = 0;
  let started = false;

  const pos = new Vector3();
  const posVel = new Vector3();
  const look = new Vector3();
  const lagVel = new Vector3();

  camera.fov = CAMERA.fov;
  camera.near = CAMERA.near;
  camera.far = CAMERA.far;
  camera.updateProjectionMatrix();

  function groundAt(fs, x, z) {
    const t = (fs && fs.terrain) || (flightState && flightState.terrain);
    return t && t.getHeight ? t.getHeight(x, z) : -Infinity;
  }

  function update(dt, input, fs) {
    const s = fs || flightState;
    if (!s) return;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, CAMERA.maxDt);
    clock += dt;

    yaw = input && typeof input.yaw === "number" ? input.yaw : yaw;
    pitch = MathUtils.clamp(
      input && typeof input.pitch === "number" ? input.pitch : pitch,
      CAMERA.pitchMin,
      CAMERA.pitchMax
    );

    const speedRatio = typeof s.speedRatio === "number" ? s.speedRatio : 0;
    const boost = typeof s.boostAmount === "number" ? s.boostAmount : 0;

    const cp = Math.cos(pitch);
    _dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();

    _vel.copy(s.velocity || _vel.set(0, 0, 0));
    const accX = (_vel.x - _prevVel.x) / dt;
    const accY = (_vel.y - _prevVel.y) / dt;
    const accZ = (_vel.z - _prevVel.z) / dt;
    _prevVel.copy(_vel);

    _lag.set(accX, accY * 0.4, accZ).multiplyScalar(-CAMERA.accelLag);
    if (_lag.lengthSq() > CAMERA.accelLagMax * CAMERA.accelLagMax) {
      _lag.setLength(CAMERA.accelLagMax);
    }
    lagVel.lerp(_lag, 1 - damp(CAMERA.accelLagResponse, dt));

    const dist = CAMERA.distance + speedRatio * CAMERA.distanceSpeedGain + boost * CAMERA.distanceBoostGain;
    const height = CAMERA.height + speedRatio * CAMERA.heightSpeedGain;

    _desired.copy(s.position);
    _desired.addScaledVector(_dir, -dist);
    _desired.y += height;
    _desired.add(lagVel);

    if (!started) {
      started = true;
      pos.copy(_desired);
      look.copy(s.position);
      _prevVel.copy(_vel);
    }

    const w = CAMERA.posStiffness;
    const zeta = CAMERA.posDamping;
    posVel.x += (w * w * (_desired.x - pos.x) - 2 * zeta * w * posVel.x) * dt;
    posVel.y += (w * w * (_desired.y - pos.y) - 2 * zeta * w * posVel.y) * dt;
    posVel.z += (w * w * (_desired.z - pos.z) - 2 * zeta * w * posVel.z) * dt;
    pos.addScaledVector(posVel, dt);

    const clearance = groundAt(s, pos.x, pos.z) + CAMERA.minGroundClearance;
    if (pos.y < clearance) {
      pos.y = clearance;
      if (posVel.y < 0) posVel.y = 0;
    }

    _lookTarget.copy(s.position);
    _lookTarget.y += CAMERA.lookUp;
    const vLen = _vel.length();
    if (vLen > 0.35) {
      _lookTarget.addScaledVector(
        _vel,
        (CAMERA.lookAhead * Math.min(1, speedRatio + boost * 0.3)) / vLen
      );
    } else {
      _lookTarget.addScaledVector(_dir, CAMERA.lookAhead * 0.35);
    }
    look.lerp(_lookTarget, 1 - damp(CAMERA.lookStiffness, dt));

    const shake = (boost * 0.75 + Math.max(0, speedRatio - 0.6) * 0.6) * CAMERA.shakeAmp;
    camera.position.copy(pos);
    if (shake > 1e-4) {
      camera.position.x += Math.sin(clock * CAMERA.shakeFreq) * shake;
      camera.position.y += Math.sin(clock * CAMERA.shakeFreq * 1.63 + 2.1) * shake * 0.8;
    }

    camera.up.set(0, 1, 0);
    camera.lookAt(look);

    const rollTarget =
      (typeof s.bank === "number" ? s.bank : 0) * CAMERA.bankInfluence +
      (typeof s.yawRate === "number" ? s.yawRate : 0) * speedRatio * CAMERA.rollFromTurn;
    roll += (rollTarget - roll) * (1 - damp(CAMERA.rollResponse, dt));
    if (Math.abs(roll) > 1e-4) camera.rotateZ(roll);

    const fovTarget =
      CAMERA.fov +
      (CAMERA.fovBoost - CAMERA.fov) * boost +
      Math.min(1, speedRatio) * CAMERA.fovSpeedGain;
    fov += (fovTarget - fov) * (1 - damp(CAMERA.fovResponse, dt));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    update,
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    set yaw(v) {
      yaw = v;
    },
    set pitch(v) {
      pitch = MathUtils.clamp(v, CAMERA.pitchMin, CAMERA.pitchMax);
    },
  };
}
