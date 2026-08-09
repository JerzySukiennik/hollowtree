import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const found = await page.evaluate(() => {
  const ht = window.hollowtree;
  const base = Date.now();
  for (let seed = 0; seed < 200; seed++) {
    ht.weather.setFromWorld({ seed, startedAt: base });
    for (let step = 1; step < 60; step++) {
      const t = base + step * 30000;
      const s = ht.weather.sample(t);
      if ((s.kind === 'rain' || s.kind === 'storm') && s.intensity > 0.85 && s.blend > 0.9) {
        // Re-base so this wet moment is happening right now, then let the loop run.
        ht.weather.setFromWorld({ seed, startedAt: base - step * 30000 });
        return { seed, offsetSec: step * 30, kind: s.kind };
      }
    }
  }
  return null;
});

// The look blends over tens of seconds of simulation, so give the downpour time to
// actually arrive before measuring anything.
for (let c = 0; c < 12; c++) await stepper.step(600);
const soaked = await page.evaluate(() => +window.hollowtree.weather.lookDebug.rain.toFixed(3));
console.log('look.rain after 120 s of rain:', soaked);

const rows = [];
for (const inside of [0, 0.3, 0.6, 1]) {
  await stepper.step(60);
  rows.push(await page.evaluate((v) => {
    const ht = window.hollowtree;
    ht.weather.setIndoor(v);
    let mesh = null;
    ht.scene.traverse((o) => { if (o.name === 'weather_rain') mesh = o; });
    return {
      inside: v,
      look: +ht.weather.lookDebug.rain.toFixed(3),
      gate: +ht.weather.lookDebug.outdoorGate.toFixed(3),
      instances: mesh ? mesh.geometry.instanceCount : null,
      opacity: mesh ? +mesh.material.uniforms.uOpacity.value.toFixed(3) : null,
      originZ: mesh ? +mesh.material.uniforms.uOrigin.value.z.toFixed(1) : null,
      camZ: +ht.camera.position.z.toFixed(1),
    };
  }, inside));
}
console.log('found:', JSON.stringify(found));
console.log(JSON.stringify(rows, null, 1));
await browser.close();
