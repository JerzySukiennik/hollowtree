// Hollowtree trailer — diagnostic: what is the sky actually doing, and does the time of
// day move when the world clock is warped?

import { launch, openGame, setTimeOfDay } from './lib/session.mjs';

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const read = () => page.evaluate(() => {
  const ht = window.hollowtree;
  const s = ht.sky;
  const w = ht.weather;
  return {
    worldNow: window.__h.worldNow,
    tod: ((window.__h.worldNow / (45 * 60 * 1000)) % 1 + 1 + 0.58) % 1,
    sunPos: s && s.sun ? [+s.sun.position.x.toFixed(1), +s.sun.position.y.toFixed(1), +s.sun.position.z.toFixed(1)] : null,
    sunInt: s && s.sun ? +s.sun.intensity.toFixed(3) : null,
    sunColor: s && s.sun ? '#' + s.sun.color.getHexString() : null,
    fog: ht.scene.fog ? { type: ht.scene.fog.isFogExp2 ? 'exp2' : 'linear', density: ht.scene.fog.density, color: '#' + ht.scene.fog.color.getHexString() } : null,
    weather: w ? JSON.parse(JSON.stringify(w.state)) : null,
    season: ht.season,
    post: ht.post ? Object.keys(ht.post) : null,
    settings: ht.settings || null,
    exposure: ht.renderer.toneMappingExposure,
  };
});

for (const tod of [0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 0.92]) {
  await setTimeOfDay(page, tod);
  await stepper.step(30);
  const r = await read();
  console.log(tod, JSON.stringify(r));
}

await browser.close();
