// Hollowtree trailer — which weather seed gives block 5 the best twelve seconds? The chain
// is a pure function of (seed, index), so it can be read straight out of the module without
// rendering anything: re-base the schedule on a candidate seed and sample the kind at each
// phase index the shot will pass through.

import { writeFileSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';

const PHASES = 8;

const browser = await launch();
const { page } = await openGame(browser, { dateEpoch: 1754640000000 });

const rows = await page.evaluate((phases) => {
  const ht = window.hollowtree;
  const w = ht.weather;
  const worldNow = ht.net && ht.net.world ? ht.net.world.now() : Date.now();
  const out = [];
  for (let seed = 1; seed <= 90; seed++) {
    const kinds = [];
    for (let i = 0; i < phases; i++) {
      // One phase is one durationMs; sampling at startedAt + i*duration reads phase i.
      const dur = 100000;
      w.setFromWorld({ seed, startedAt: worldNow - i * dur, durationMs: dur, transitionMs: 2000, kind: 'clear' });
      const s = w.sample ? w.sample(worldNow) : null;
      kinds.push(s && s.nextKind ? s.nextKind : (s && s.kind) || '?');
    }
    out.push({ seed, kinds });
  }
  return out;
}, PHASES);

await browser.close();

const score = (k) => {
  const uniq = new Set(k).size;
  const wet = k.filter((x) => x === 'rain' || x === 'storm').length;
  const grey = k.filter((x) => x === 'fog' || x === 'overcast').length;
  const clear = k.filter((x) => x === 'clear').length;
  // Wanted: opens and closes clear, at least one wet state, at least one windy or grey one,
  // and never two fogs — a shot that spends a quarter of its length in white-out shows the
  // viewer nothing.
  let s = uniq * 2 + wet * 2 + Math.min(clear, 3);
  if (k[0] !== 'clear') s -= 4;
  if (k[k.length - 1] !== 'clear') s -= 2;
  if (grey > 3) s -= 4;
  if (k.filter((x) => x === 'fog').length > 1) s -= 3;
  if (!k.includes('wind')) s -= 2;
  return s;
};

rows.sort((a, b) => score(b.kinds) - score(a.kinds));
for (const r of rows.slice(0, 10)) console.log(String(r.seed).padStart(3), score(r.kinds), r.kinds.join(' → '));
writeFileSync('out/weather-chains.json', JSON.stringify(rows.slice(0, 20), null, 2));
