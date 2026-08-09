// Does the meadow actually look like four different seasons? Same patch of grass, same
// camera, same time of day, same weather — only the year phase moves. Anything that
// differs between the four shots is the season and nothing else.
//
// The four phases are the CENTRES of the four seasons (0.125, 0.375, 0.625, 0.875), which
// is where each palette key is pure. Phases are handed to the same doors main.js will use:
// grass.setSeason / terrain.setSeason / flowers.attachSeason.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openGame, setTimeOfDay } from './lib/session.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const SEASONS = [
  { name: 'spring', yearT: 0.125 },
  { name: 'summer', yearT: 0.375 },
  { name: 'autumn', yearT: 0.625 },
  { name: 'prewinter', yearT: 0.875 },
];

// null = leave the meadow exactly as the old code left it (nothing calls setSeason), which
// is the "before" baseline for both the picture and the frame cost.
const WIRED = process.env.SEASON_OFF ? false : true;

const browser = await launch();
const { page, stepper, errors } = await openGame(browser, { dateEpoch: 1754640000000 });

await setTimeOfDay(page, 0.30);

// A low camera looking across open meadow: grass fills the lower half, ground the middle,
// flowers scattered through. The rig was neutered by __cine.install(), so this sticks.
await page.evaluate(() => {
  const ht = window.hollowtree;
  ht.flight.simPosition.set(46, 3.2, 58);
  ht.flight.velocity.set(0, 0, 0);
  ht.camera.position.set(46, 3.2, 58);
  ht.camera.up.set(0, 1, 0);
  ht.camera.lookAt(10, 2.0, 10);
  const w = ht.weather;
  if (w && typeof w.setFromWorld === 'function') {
    w.setFromWorld({ kind: 'clear', intensity: 0, seed: 7, startedAt: Date.now(), durationMs: 1e9, transitionMs: 1 });
  }
});

// Let the streaming settle before any measurement: grass writes a slice of its instance
// matrix per frame, flowers likewise, so an unsettled field would differ shot to shot for
// reasons that have nothing to do with the season.
await stepper.step(600);

async function applySeason(yearT) {
  return page.evaluate((t, wired) => {
    const ht = window.hollowtree;
    if (!wired) return { wired: false };
    const phase = { yearT: t, index: Math.floor(t * 4) % 4, t: (t * 4) % 1 };
    if (ht.flowers && typeof ht.flowers.attachSeason === 'function') ht.flowers.attachSeason(() => phase);
    if (ht.grass && typeof ht.grass.setSeason === 'function') ht.grass.setSeason(phase);
    if (ht.terrain && typeof ht.terrain.setSeason === 'function') ht.terrain.setSeason(phase);
    return {
      wired: true,
      grass: ht.grass && ht.grass.grass ? ht.grass.grass.material.color.toArray().map((v) => +v.toFixed(4)) : null,
      ground: ht.terrain && ht.terrain.mesh ? ht.terrain.mesh.material.color.toArray().map((v) => +v.toFixed(4)) : null,
      openBlooms: ht.flowers && typeof ht.flowers.bloomOf === 'function'
        ? ht.flowers.species.map((s, i) => +ht.flowers.bloomOf(i).toFixed(3)) : null,
    };
  }, yearT, WIRED);
}

// --- frame cost -----------------------------------------------------------------
// The harness owns rAF, so "fps" here is how fast the page can be made to render frames,
// measured the same way on both sides of the change. Comparing two rates, never a rate
// against a number someone typed.
async function measure(frames) {
  await stepper.step(60);
  const t0 = Date.now();
  await stepper.step(frames);
  const ms = Date.now() - t0;
  const info = await page.evaluate(() => {
    const r = window.hollowtree.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles };
  });
  return { frames, ms, fps: +(frames * 1000 / ms).toFixed(1), ...info };
}

const report = { wired: WIRED, seasons: [], perf: {} };

// Baseline cost with the meadow untinted — identical code path to before the change.
report.perf.before = await measure(300);

for (const s of SEASONS) {
  const applied = await applySeason(s.yearT);
  await stepper.step(240);
  const path = join(OUT, `season-${s.name}.png`);
  await stepper.shot(path);
  report.seasons.push({ ...s, ...applied, path });
}

report.perf.after = await measure(300);
report.errors = errors.slice(0, 5);

console.log(JSON.stringify(report, null, 2));
await browser.close();
