// Hollowtree trailer — fast look pass: a few stills spread across every shot, plus a
// contact sheet, so paths can be judged from pixels instead of from arithmetic.
// Usage: node preview.mjs [shotId ...]

import { mkdirSync, rmSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';
import { renderShot, shotList } from './lib/render-shot.mjs';

const only = process.argv.slice(2);
const OUT = 'tmp/preview';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const { page, stepper, errors } = await openGame(browser, { dateEpoch: 1754640000000 });

const shots = (await shotList(page)).filter((s) => !only.length || only.includes(s.id));

for (const shot of shots) {
  const n = Math.max(4, Math.round(shot.seconds / 1.1));
  const every = Math.max(1, Math.floor((shot.seconds * 60) / n));
  const t0 = Date.now();
  await renderShot(page, stepper, shot, {
    outDir: `${OUT}/${shot.id}`,
    everyN: every,
    hash: false,
  });
  console.log(`${shot.id}  ${shot.seconds}s  ${n} stills  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 8));
await browser.close();
