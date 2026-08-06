// Hollowtree — reusable cinematic director: a timeline driven by one shared start timestamp, keyframed camera shots with easing, hard cuts, letterbox, cards, flashes, timed events and an always-available skip.

import { Vector3, MathUtils, CatmullRomCurve3 } from 'three';
import { CINEMATIC } from '../config.js';

const _pos = new Vector3();
const _look = new Vector3();
const lookTarget = new Vector3();

export const EASING = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  settle: (t) => 1 - (1 - t) ** 4.2,
  smooth: (t) => t * t * (3 - 2 * t),
  holdIn: (t) => {
    const u = MathUtils.clamp((t - 0.3) / 0.7, 0, 1);
    return u * u * (3 - 2 * u);
  },
  holdOut: (t) => {
    const u = MathUtils.clamp(t / 0.66, 0, 1);
    return 1 - (1 - u) ** 3;
  },
};

export function easing(name) {
  return EASING[name] || EASING.inOut;
}

export function makeTrack(points) {
  if (!points || !points.length) return null;
  if (points.length === 1) {
    const only = points[0];
    return { at: (out) => out.copy(only) };
  }
  if (points.length === 2) {
    const a = points[0];
    const b = points[1];
    return { at: (out, u) => out.lerpVectors(a, b, u) };
  }
  const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);
  return { at: (out, u) => curve.getPoint(MathUtils.clamp(u, 0, 1), out) };
}

function wave(t, freq, phase) {
  return Math.sin(t * freq + phase) * 0.62 + Math.sin(t * freq * 1.71 + phase * 2.3) * 0.38;
}

function overlay() {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:9',
    'pointer-events:none',
    'overflow:hidden',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  ].join(';');

  const bar = (edge) => {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      `${edge}:0`,
      'background:#000',
      'height:0%',
      'will-change:height',
    ].join(';');
    root.appendChild(el);
    return el;
  };
  const top = bar('top');
  const bottom = bar('bottom');

  const flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;will-change:opacity';
  root.appendChild(flash);

  const card = document.createElement('div');
  card.style.cssText = [
    'position:absolute',
    'left:0',
    'right:0',
    'top:50%',
    'transform:translateY(-50%)',
    'text-align:center',
    'opacity:0',
    'color:#f7e6c4',
    'text-shadow:0 2px 24px rgba(0,0,0,.85)',
    'will-change:opacity,letter-spacing',
  ].join(';');
  root.appendChild(card);

  const skip = document.createElement('div');
  skip.style.cssText = [
    'position:absolute',
    'right:26px',
    'bottom:22px',
    'font-size:11px',
    'letter-spacing:.22em',
    'text-transform:uppercase',
    'color:#f6e9cf',
    'opacity:0',
    'text-shadow:0 1px 6px rgba(0,0,0,.9)',
    'transition:opacity .5s ease',
  ].join(';');
  skip.textContent = CINEMATIC.copy.skip;
  root.appendChild(skip);

  document.body.appendChild(root);
  return { root, top, bottom, flash, card, skip };
}

export function createDirector(options) {
  const config = options || {};
  const camera = config.camera;
  const dom = null;

  let ui = null;
  let timeline = null;
  let context = null;
  let onFinish = null;

  let startedAt = 0;
  let localTime = 0;
  let shotIndex = -1;
  let eventCursor = 0;
  let skipping = false;
  let skipAt = 0;
  let cardKey = '';

  const state = {
    active: false,
    time: 0,
    duration: 0,
    shot: '',
    skipped: false,
  };

  function resolveTracks(shot) {
    if (shot.posTrack === undefined) shot.posTrack = makeTrack(shot.pos);
    if (shot.lookTrack === undefined) shot.lookTrack = makeTrack(shot.look);
  }

  function shotAt(t) {
    const shots = timeline.shots;
    let index = 0;
    for (let i = 0; i < shots.length; i++) {
      if (shots[i].at <= t) index = i;
      else break;
    }
    return index;
  }

  function applyCamera(shot, t) {
    if (!camera) return;
    const local = MathUtils.clamp((t - shot.at) / Math.max(0.0001, shot.dur), 0, 1);
    const u = easing(shot.ease)(local);

    if (typeof shot.posFn === 'function') _pos.copy(shot.posFn(u, context, t, local));
    else if (shot.posTrack) shot.posTrack.at(_pos, u);
    else return;

    if (typeof shot.lookFn === 'function') _look.copy(shot.lookFn(u, context, t, local));
    else if (shot.lookTrack) shot.lookTrack.at(_look, u);
    else _look.set(0, 0, 0);

    const fov = Array.isArray(shot.fov)
      ? MathUtils.lerp(shot.fov[0], shot.fov[shot.fov.length - 1], u)
      : camera.fov;
    const roll = typeof shot.rollFn === 'function'
      ? shot.rollFn(u, context, t, local)
      : Array.isArray(shot.roll) ? MathUtils.lerp(shot.roll[0], shot.roll[1], u) : 0;
    lookTarget.copy(_look);

    camera.up.set(0, 1, 0);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    if (roll) camera.rotateZ(roll);

    const hand = (shot.handheld || 0) * CINEMATIC.handheldAmp;
    if (hand > 0) {
      const f = CINEMATIC.handheldFreq;
      camera.rotateX(wave(t, f * 0.83, 1.1) * hand * 0.62);
      camera.rotateY(wave(t, f, 0.0) * hand);
      camera.rotateZ(wave(t, f * 0.61, 2.3) * hand * 0.45);
    }
    const shake = (shot.shake || 0) * CINEMATIC.shakeAmp;
    if (shake > 0) {
      const f = CINEMATIC.shakeFreq;
      camera.rotateX(Math.sin(t * f * 1.13 + 0.7) * shake);
      camera.rotateY(Math.sin(t * f) * shake * 1.2);
      camera.position.y += Math.sin(t * f * 0.91 + 2.0) * shake * 0.6;
    }

    if (Math.abs(camera.fov - fov) > 0.005) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function bars(t) {
    const inK = MathUtils.clamp(t / CINEMATIC.letterboxIn, 0, 1);
    const outStart = state.duration - CINEMATIC.letterboxOut;
    const outK = MathUtils.clamp((t - outStart) / CINEMATIC.letterboxOut, 0, 1);
    const k = EASING.out(inK) * (1 - EASING.inOut(skipping ? 1 : outK));
    const h = `${(CINEMATIC.letterbox * k * 100).toFixed(3)}%`;
    ui.top.style.height = h;
    ui.bottom.style.height = h;
  }

  function veil(t) {
    let alpha = 0;
    let color = '#000';
    const fadeIn = 1 - MathUtils.clamp(t / CINEMATIC.fadeIn, 0, 1);
    if (fadeIn > alpha) alpha = EASING.out(fadeIn);
    const fadeOut = MathUtils.clamp((t - (state.duration - CINEMATIC.fadeOut)) / CINEMATIC.fadeOut, 0, 1);
    if (fadeOut > alpha) alpha = EASING.inOut(fadeOut);

    const flashes = timeline.flashes || [];
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      const k = (t - f.at) / f.dur;
      if (k < 0 || k > 1) continue;
      const a = (1 - EASING.out(k)) * (f.peak === undefined ? 1 : f.peak);
      if (a > alpha) {
        alpha = a;
        color = f.color || '#000';
      }
    }
    if (skipping) {
      const a = MathUtils.clamp((t - skipAt) / CINEMATIC.skipFade, 0, 1);
      if (a > alpha) {
        alpha = a;
        color = '#000';
      }
    }
    ui.flash.style.background = color;
    ui.flash.style.opacity = alpha.toFixed(4);
  }

  function cards(t) {
    const list = timeline.cards || [];
    let active = null;
    let alpha = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (t < c.at || t > c.at + c.dur) continue;
      const fade = c.fade || 0.8;
      const a = Math.min(
        MathUtils.clamp((t - c.at) / fade, 0, 1),
        MathUtils.clamp((c.at + c.dur - t) / fade, 0, 1)
      );
      if (a > alpha) {
        alpha = a;
        active = c;
      }
    }
    if (!active) {
      ui.card.style.opacity = '0';
      cardKey = '';
      return;
    }
    const key = `${active.at}`;
    if (key !== cardKey) {
      cardKey = key;
      const size = active.size === undefined ? 1 : active.size;
      ui.card.style.font = `${300} clamp(${(22 * size).toFixed(0)}px, ${(6.4 * size).toFixed(2)}vw, ${(76 * size).toFixed(0)}px)/1.2 inherit`;
      ui.card.style.textTransform = size > 0.6 ? 'uppercase' : 'lowercase';
      ui.card.textContent = active.label || '';
    }
    const eased = EASING.out(alpha);
    ui.card.style.opacity = eased.toFixed(4);
    ui.card.style.letterSpacing = `${(0.34 - 0.12 * eased).toFixed(3)}em`;
    ui.card.style.textIndent = `${(0.34 - 0.12 * eased).toFixed(3)}em`;
  }

  function fireEvents(t, silent) {
    const list = timeline.events || [];
    while (eventCursor < list.length && list[eventCursor].at <= t) {
      const event = list[eventCursor];
      eventCursor++;
      if (!silent && typeof event.fire === 'function') event.fire(context, t);
    }
  }

  function advance(dt) {
    const wall = (Date.now() - startedAt) * 0.001;
    localTime += dt;
    const drift = wall - localTime;
    if (Math.abs(drift) > CINEMATIC.maxDrift) localTime = wall;
    else localTime += drift * Math.min(1, CINEMATIC.driftCorrect * Math.max(dt, 0.0001) * 60);
    if (localTime < 0) localTime = 0;
    state.time = localTime;
  }

  function onSkipInput(event) {
    if (!state.active || skipping) return;
    if (event && event.type === 'keydown' && (event.code === 'F3' || event.code === 'F5')) return;
    skip();
  }

  function listen(on) {
    const fn = on ? window.addEventListener : window.removeEventListener;
    fn.call(window, 'keydown', onSkipInput, true);
    fn.call(window, 'pointerdown', onSkipInput, true);
  }

  function finish() {
    if (!state.active) return;
    state.active = false;
    state.shot = '';
    listen(false);
    if (ui) {
      ui.root.remove();
      ui = null;
    }
    const done = onFinish;
    const line = timeline;
    const ctx = context;
    timeline = null;
    onFinish = null;
    context = null;
    if (line && typeof line.onFinish === 'function') line.onFinish(ctx, state.skipped);
    if (typeof done === 'function') done(state.skipped);
  }

  function skip() {
    if (!state.active || skipping) return;
    skipping = true;
    state.skipped = true;
    skipAt = state.time;
  }

  function seek(t) {
    localTime = Math.max(0, t);
    state.time = localTime;
    eventCursor = 0;
    fireEvents(localTime, true);
    shotIndex = shotAt(localTime);
    const shot = timeline.shots[shotIndex];
    if (shot && typeof shot.onEnter === 'function') shot.onEnter(context, true);
  }

  function play(spec, opts) {
    if (state.active) finish();
    const o = opts || {};
    timeline = spec;
    context = o.context || spec.context || null;
    onFinish = o.onFinish || null;
    state.duration = spec.duration || CINEMATIC.duration;
    state.skipped = false;
    skipping = false;
    skipAt = 0;
    cardKey = '';

    for (const shot of timeline.shots) resolveTracks(shot);

    startedAt = Number(o.startedAt) > 0 ? Number(o.startedAt) : Date.now();
    const elapsed = (Date.now() - startedAt) * 0.001;
    if (elapsed >= state.duration) {
      state.active = false;
      if (typeof spec.onFinish === 'function') spec.onFinish(context, true);
      if (typeof onFinish === 'function') onFinish(true);
      timeline = null;
      context = null;
      onFinish = null;
      return false;
    }

    ui = overlay();
    ui.card.textContent = '';
    state.active = true;
    shotIndex = -1;
    eventCursor = 0;
    seek(Math.max(0, elapsed));
    listen(true);
    if (typeof spec.onStart === 'function') spec.onStart(context, state.time);
    update(0);
    return true;
  }

  function update(dt) {
    if (!state.active) return false;
    advance(dt || 0);
    const t = state.time;

    if (t >= state.duration || (skipping && t - skipAt >= CINEMATIC.skipFade)) {
      if (skipping) {
        veil(t);
        finish();
        return false;
      }
      finish();
      return false;
    }

    fireEvents(t, false);

    const index = shotAt(t);
    const shot = timeline.shots[index];
    if (index !== shotIndex) {
      shotIndex = index;
      state.shot = shot.id || String(index);
      if (typeof shot.onEnter === 'function') shot.onEnter(context, false);
    }

    if (typeof timeline.onUpdate === 'function') timeline.onUpdate(t, context, dt || 0);
    const local = MathUtils.clamp((t - shot.at) / Math.max(0.0001, shot.dur), 0, 1);
    if (typeof shot.onUpdate === 'function') {
      shot.onUpdate(easing(shot.ease)(local), context, t, local, dt || 0);
    }
    applyCamera(shot, t);

    bars(t);
    veil(t);
    cards(t);

    const promptAlpha = t > CINEMATIC.skipPromptDelay && !skipping ? 0.45 : 0;
    if (ui.skip.style.opacity !== String(promptAlpha)) ui.skip.style.opacity = String(promptAlpha);

    return true;
  }

  return {
    play,
    update,
    skip,
    seek,
    stop: finish,
    get active() {
      return state.active;
    },
    get time() {
      return state.time;
    },
    get shot() {
      return state.shot;
    },
    get lookTarget() {
      return lookTarget;
    },
    get progress() {
      return state.duration > 0 ? state.time / state.duration : 0;
    },
    get startedAt() {
      return startedAt;
    },
    state,
    dispose() {
      finish();
      void dom;
    },
  };
}
