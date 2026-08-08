// Hollowtree — adapter binding the main-menu opening hook to the cinematic director, resolving when the sequence finishes or is skipped.

import { createIntro } from './intro.js';

export function createOpeningCinematic(options) {
  const o = options || {};
  const host = typeof window !== 'undefined' ? window.hollowtree : null;
  const nest = host && host.nest;

  const intro = createIntro({
    scene: o.scene,
    camera: o.camera,
    renderer: o.renderer,
    terrain: o.terrain,
    sky: o.sky,
    grass: o.grass || (host && host.grass) || null,
    hive: o.hive,
    flight: o.flight,
    rig: o.rig,
    input: o.input,
    queen: o.queen || (host && host.queen) || null,
    flowers: o.flowers || null,
    post: o.post || (typeof window !== 'undefined' ? window.hollowtreePost : null) || null,
    interior: o.interior || (nest && nest.interior) || null,
    portal: o.portal || (nest && nest.portal) || null,
    // main.js does not hand the audio system to the cinematic, but it publishes it on
    // window.hollowtree before the menu can launch a session, so the opening can pick it up here
    // without a change in a file this module does not own.
    audio: o.audio || (host && host.audio) || null,
  });

  let settle = null;

  function resolve(skipped) {
    const fn = settle;
    settle = null;
    if (fn) fn(skipped);
  }

  return {
    intro,
    director: intro.director,
    play(overrides) {
      const session = overrides || o.context || {};
      const shared = Number(session.startedAt);
      const startedAt = shared > 0 ? shared : Date.now();
      return new Promise((done) => {
        settle = done;
        const started = intro.play({ startedAt, onFinish: resolve });
        if (!started) resolve(true);
      });
    },
    update(dt) {
      intro.update(dt);
    },
    skip: intro.skip,
    get active() {
      return intro.active;
    },
    get time() {
      return intro.time;
    },
    get shot() {
      return intro.shot;
    },
    dispose() {
      resolve(true);
      intro.dispose();
    },
  };
}
