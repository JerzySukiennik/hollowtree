// Hollowtree — the entrance transition: one insideness scalar from the queen's position in the hall, crossfading fog, light, background, collision set and world detail visibility.

import * as THREE from 'three';
import { INTERIOR, PALETTE, WORLD } from '../config.js';

const _outFog = new THREE.Color();
const _inFog = new THREE.Color(INTERIOR.fogColor);
const _outBg = new THREE.Color();
const _tmp = new THREE.Color();

function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createPortal(scene, interior, flight, detail) {
  const spec = interior.spec;
  const details = Array.isArray(detail) ? detail.filter(Boolean) : [];

  const exp2 = Boolean(scene.fog && scene.fog.isFogExp2);
  const outFogNear = scene.fog && !exp2 ? scene.fog.near : WORLD.fogNear;
  const outFogFar = scene.fog && !exp2 ? scene.fog.far : WORLD.fogFar;
  const outFogDensity = exp2 ? scene.fog.density : 0;
  _outFog.set(scene.fog ? scene.fog.color : PALETTE.fog);
  const hadBackground = scene.background && scene.background.isColor;
  _outBg.set(hadBackground ? scene.background : PALETTE.skyHorizon);

  const state = {
    insideness: 0,
    target: 0,
    inside: false,
    latched: false,
    detailHidden: false,
    solid: false,
  };

  const listeners = { enter: [], exit: [] };

  function sample(point) {
    if (spec.inAperture(point)) {
      state.latched = spec.beyondEntranceWall(point);
      return smoothstep(INTERIOR.throatLength, -INTERIOR.insideMargin, spec.outward(point));
    }
    if (state.latched && spec.insideDepth(point) < -INTERIOR.insideMargin) state.latched = false;
    return state.latched ? 1 : 0;
  }

  function setDetailVisible(visible) {
    if (state.detailHidden === !visible) return;
    state.detailHidden = !visible;
    for (const node of details) {
      if (node && typeof node.visible === 'boolean') node.visible = visible;
    }
  }

  function emit(name) {
    for (const fn of listeners[name]) fn(state.insideness);
  }

  function update(dt) {
    const point = flight ? flight.simPosition || flight.position : null;
    if (!point) return state;
    state.target = sample(point);

    const rate = 1 - Math.exp(-INTERIOR.fadeSpeed * Math.max(0, dt));
    state.insideness += (state.target - state.insideness) * rate;
    if (state.insideness < 0.002) state.insideness = 0;
    if (state.insideness > 0.998) state.insideness = 1;

    const k = state.insideness;
    const wasInside = state.inside;
    state.inside = k > 0.5;
    if (state.inside !== wasInside) emit(state.inside ? 'enter' : 'exit');

    state.solid = state.latched;
    interior.setSolid(state.solid);

    interior.group.visible = k > 0;
    interior.setLightsActive(k > 0);
    if (k > 0) interior.setIntensity(k);
    interior.setClipped(k > 0 && k < INTERIOR.clipUntil);
    setDetailVisible(k < INTERIOR.hideDetailAt);
    if (interior.plugs) {
      const plugVisible = k < 0.15;
      for (const plug of interior.plugs) plug.visible = plugVisible;
    }

    if (scene.fog) {
      scene.fog.color.copy(_tmp.copy(_outFog).lerp(_inFog, k));
      if (exp2) {
        scene.fog.density = outFogDensity + (INTERIOR.fogDensity - outFogDensity) * k;
      } else {
        scene.fog.near = outFogNear + (INTERIOR.fogNear - outFogNear) * k;
        scene.fog.far = outFogFar + (INTERIOR.fogFar - outFogFar) * k;
      }
    }
    if (scene.background && scene.background.isColor) {
      scene.background.copy(_tmp.copy(_outBg).lerp(_inFog, k));
    }

    interior.update(dt, 0, k);
    return state;
  }

  return {
    state,
    update,
    get insideness() {
      return state.insideness;
    },
    onEnter(fn) {
      listeners.enter.push(fn);
    },
    onExit(fn) {
      listeners.exit.push(fn);
    },
    dispose() {
      setDetailVisible(true);
      interior.setSolid(false);
      if (scene.fog) {
        scene.fog.color.copy(_outFog);
        if (exp2) scene.fog.density = outFogDensity;
        else {
          scene.fog.near = outFogNear;
          scene.fog.far = outFogFar;
        }
      }
    },
  };
}
