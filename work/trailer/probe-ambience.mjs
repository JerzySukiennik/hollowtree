import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page } = await openGame(browser, { dateEpoch: 1754640000000 });
const out = await page.evaluate(async () => {
  const { AUDIO } = await import('/src/config.audio.js');
  const cfg = AUDIO.ambience;
  const rows = [];
  for (let k = 0; k <= 100; k++) {
    const time = k / 100;
    let g = 0;
    for (const at of [cfg.dawn, cfg.dusk]) {
      let d = Math.abs(time - at);
      if (d > 0.5) d = 1 - d;
      const kk = 1 - Math.min(1, d / cfg.goldenWidth);
      if (kk > g) g = kk;
    }
    g = g * g * (3 - 2 * g);
    rows.push([+time.toFixed(2), +(1 - cfg.goldenDuck * g).toFixed(3)]);
  }
  return { dawn: cfg.dawn, dusk: cfg.dusk, duck: cfg.goldenDuck, rows };
});
const mins = out.rows.filter((r) => r[1] < 0.4).map((r) => r[0]);
console.log('dawn', out.dawn, 'dusk', out.dusk, 'duck', out.duck);
console.log('cicadas ducked below 40% at times:', JSON.stringify(mins));
console.log('cicada multiplier at noon:', out.rows.find((r) => r[0] === 0.5)[1]);
console.log('cicada multiplier at dusk:', out.rows.find((r) => r[0] === 0.8)[1]);
await browser.close();
