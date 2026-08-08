// Hollowtree trailer — why is it raining? Track what the weather module actually applies
// after a shot asks for clear sky.

import { launch, openGame } from './lib/session.mjs';

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const read = () => page.evaluate(() => {
  const ht = window.hollowtree;
  const w = ht.weather;
  return {
    kind: w.state.kind,
    intensity: +w.state.intensity.toFixed(3),
    wetness: +w.state.wetness.toFixed(3),
    schedule: JSON.parse(JSON.stringify(w.schedule)),
    now: window.__h.worldNow,
    rel: window.__h.worldNow - w.schedule.startedAt,
    sunInt: +ht.sky.sun.intensity.toFixed(3),
    fogDensity: ht.scene.fog.density,
    counts: w.counts,
    netWeather: ht.net && ht.net.weather ? Object.keys(ht.net.weather) : null,
    netCurrent: ht.net && ht.net.weather && ht.net.weather.current ? ht.net.weather.current() : null,
  };
});

console.log('before:', JSON.stringify(await read()));

await page.evaluate(() => window.__cine.beginShot('b2-meadow'));
console.log('after beginShot:', JSON.stringify(await read()));

for (const n of [10, 60, 120, 300]) {
  await stepper.step(n);
  console.log(`+${n}:`, JSON.stringify(await read()));
}

await browser.close();
