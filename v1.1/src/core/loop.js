// Hollowtree — fixed-step simulation accumulator with a requestAnimationFrame driver.

import { LOOP } from '../config.js';

export function createLoop() {
  const fixedHandlers = [];
  const renderHandlers = [];
  const step = 1 / LOOP.fixedHz;

  const state = {
    fps: LOOP.fixedHz,
    delta: step,
    alpha: 0,
    elapsed: 0,
    steps: 0,
    running: false,
  };

  let accumulator = 0;
  let previous = 0;
  let handle = 0;

  function tick(now) {
    handle = requestAnimationFrame(tick);

    let delta = (now - previous) * 0.001;
    previous = now;
    if (!(delta > 0)) delta = step;
    if (delta > LOOP.maxFrameTime) delta = LOOP.maxFrameTime;

    state.delta = delta;
    state.elapsed += delta;
    state.fps += (1 / delta - state.fps) * LOOP.fpsSmoothing;

    accumulator += delta;

    let steps = 0;
    while (accumulator >= step && steps < LOOP.maxSubSteps) {
      for (let i = 0; i < fixedHandlers.length; i++) fixedHandlers[i](step, state.elapsed);
      accumulator -= step;
      steps++;
    }
    if (accumulator > step) accumulator = accumulator % step;

    state.steps = steps;
    state.alpha = accumulator / step;

    for (let i = 0; i < renderHandlers.length; i++) renderHandlers[i](state.alpha, delta, state.elapsed);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    previous = performance.now();
    accumulator = 0;
    handle = requestAnimationFrame(tick);
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    cancelAnimationFrame(handle);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  window.addEventListener('pageshow', () => {
    if (!document.hidden) start();
  });

  function subscribe(list, fn) {
    if (typeof fn !== 'function') return () => {};
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    };
  }

  return {
    state,
    step,
    onFixed: (fn) => subscribe(fixedHandlers, fn),
    onRender: (fn) => subscribe(renderHandlers, fn),
    start,
    stop,
  };
}
