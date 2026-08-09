import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

// Force a downpour regardless of the schedule.
await page.evaluate(() => {
  const ht = window.hollowtree;
  // Weather is a pure function of the clock, so it cannot be set -- it has to be found.
  // Walk seeds and phase offsets until sample() reports real rain, then re-base the
  // schedule so that moment is now.
  const base = Date.now();
  let found = null;
  for (let seed = 0; seed < 120 && !found; seed++) {
    ht.weather.setFromWorld({ seed, startedAt: base });
    for (let step = 0; step < 40; step++) {
      const t = base + step * 30000;
      const s = ht.weather.sample(t);
      if ((s.kind === 'rain' || s.kind === 'storm') && s.intensity > 0.8) { found = { seed, t, kind: s.kind }; break; }
    }
  }
  if (found) ht.weather.setFromWorld({ seed: found.seed, startedAt: base - (found.t - base) });
  window.__found = found;
});

// Walk insideness 0 -> 1 by hand and watch the audio mix and the rain amount.
const sweep = await page.evaluate(() => {
  const ht = window.hollowtree;
  const rows = [];
  for (let i = 0; i <= 20; i++) {
    const inside = i / 20;
    ht.weather.setIndoor(inside);
    for (let k = 0; k < 90; k++) ht.weather.update(1 / 60, i + k / 60, ht.camera.position);
    let mesh = null;
    ht.scene.traverse((o) => { if (o.name === 'weather_rain') mesh = o; });
    rows.push({
      inside: +inside.toFixed(2),
      visible: mesh ? mesh.visible : null,
      instances: mesh && mesh.geometry ? mesh.geometry.instanceCount : null,
      opacity: mesh ? +mesh.material.uniforms.uOpacity.value.toFixed(3) : null,
      originZ: mesh ? +mesh.material.uniforms.uOrigin.value.z.toFixed(2) : null,
      counts: ht.weather.counts.rain,
      kind: ht.weather.state.kind,
      intensity: +ht.weather.state.intensity.toFixed(2),
      quality: ht.weather.quality,
      look: ht.weather.lookDebug,
    });
  }
  return rows;
});
console.log('found:', JSON.stringify(await page.evaluate(() => window.__found)));
console.log('sweep:', JSON.stringify(sweep));
console.log('pageerrors:', errs.length ? errs : 'none');
await browser.close();
