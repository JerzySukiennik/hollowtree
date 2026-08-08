// Hollowtree trailer — find the drift. Two sessions, the same script, dump the numbers that
// could differ and diff them.

import { launch, openGame, setTimeOfDay } from './lib/session.mjs';
import { renderShot, shotList } from './lib/render-shot.mjs';

async function probe() {
  const browser = await launch();
  const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
  const shot = (await shotList(page)).find((s) => s.id === 'b2-meadow');
  await setTimeOfDay(page, shot.timeOfDay);
  await page.evaluate(() => window.__cine.beginShot('b2-meadow'));
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.__cine.frame(0));
    await stepper.step();
  }
  const out = await page.evaluate(() => {
    const ht = window.hollowtree;
    const v = (o) => (o ? [+o.x.toFixed(6), +o.y.toFixed(6), +o.z.toFixed(6)] : null);
    return {
      frames: window.__h.frames,
      vt: window.__h.vt,
      epoch: window.__h.epoch,
      netOffset: ht.net && ht.net.world ? ht.net.world.now() - Date.now() : null,
      worldNow: ht.net && ht.net.world ? ht.net.world.now() : null,
      loopElapsed: +ht.loop.state.elapsed.toFixed(6),
      camPos: v(ht.camera.position),
      camQuat: [+ht.camera.quaternion.x.toFixed(6), +ht.camera.quaternion.y.toFixed(6), +ht.camera.quaternion.z.toFixed(6), +ht.camera.quaternion.w.toFixed(6)],
      fov: ht.camera.fov,
      queenSim: v(ht.flight.simPosition),
      queenRender: v(ht.flight.position),
      bank: +ht.flight.bank.toFixed(6),
      bob: +ht.flight.bob.toFixed(6),
      heading: +ht.flight.heading.toFixed(6),
      sunPos: v(ht.sky.sun.position),
      sunInt: +ht.sky.sun.intensity.toFixed(6),
      fogDensity: ht.scene.fog.density,
      wx: { kind: ht.weather.state.kind, wind: +ht.weather.state.wind.strength.toFixed(6), wetness: +ht.weather.state.wetness.toFixed(6) },
      insideness: ht.nest.portal.state.insideness,
      swarmCount: ht.swarm ? ht.swarm.count : null,
      swarmComp: ht.swarm ? JSON.stringify(ht.swarm.composition) : null,
      combCells: ht.nest.comb ? ht.nest.comb.count : null,
      gather: ht.gather ? [+ht.gather.state.charge.toFixed(6), +ht.gather.state.load.toFixed(6)] : null,
      season: ht.season,
      tri: ht.renderer.info.render.triangles,
      calls: ht.renderer.info.render.calls,
      postTier: ht.post ? ht.post.tier : null,
      hornets: ht.hornets && ht.hornets.state ? JSON.stringify(ht.hornets.state) : null,
    };
  });
  await browser.close();
  return out;
}

const a = await probe();
const b = await probe();
const keys = Object.keys(a);
let diffs = 0;
for (const k of keys) {
  const sa = JSON.stringify(a[k]);
  const sb = JSON.stringify(b[k]);
  if (sa !== sb) { console.log('DIFF', k, '\n  A', sa, '\n  B', sb); diffs++; }
}
console.log(diffs ? `${diffs} fields differ` : 'all probed fields identical');
