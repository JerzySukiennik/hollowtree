// Hollowtree trailer — end-card light sweep: render the same frame at a range of times of
// day and report what the sky is doing at each, so the shot picks a real hour.

import { mkdirSync } from 'node:fs';
import { launch, openGame, setTimeOfDay } from './lib/session.mjs';

mkdirSync('tmp/tod', { recursive: true });
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

for (const tod of [0.06, 0.14, 0.22, 0.30, 0.40, 0.86, 0.92, 0.97]) {
  await setTimeOfDay(page, tod);
  await page.evaluate(() => window.__cine.beginShot('b7-endcard'));
  for (let i = 0; i < 70; i++) {
    await page.evaluate(() => window.__cine.frame(150));
    await stepper.step();
  }
  const r = await page.evaluate(() => {
    const ht = window.hollowtree;
    return {
      sunY: +ht.sky.sun.position.y.toFixed(1),
      sunInt: +ht.sky.sun.intensity.toFixed(2),
      sunColor: '#' + ht.sky.sun.color.getHexString(),
      fog: +ht.scene.fog.density.toFixed(5),
      fogColor: '#' + ht.scene.fog.color.getHexString(),
      kind: ht.weather.state.kind,
      season: ht.season,
      sched: JSON.parse(JSON.stringify(ht.weather.schedule)),
      wNow: ht.net && ht.net.world ? ht.net.world.now() : Date.now(),
      sample: ht.weather.sample(ht.net.world.now()),
    };
  });
  await stepper.shot(`tmp/tod/${String(Math.round(tod * 100)).padStart(3, '0')}.png`);
  console.log(tod, JSON.stringify(r));
}

await browser.close();
