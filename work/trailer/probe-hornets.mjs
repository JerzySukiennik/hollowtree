// Hollowtree trailer — can a hornet raid be staged for the camera? The raid calendar is a
// pure function of (HORNETS.seed, the module's epoch, the season index) and hornets.setEpoch()
// re-derives it, so sliding that epoch moves the next raid onto the shot clock without
// touching the world clock, the sun or the weather. update() is what rebuilds the timeline,
// so a frame has to be stepped after every write.

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';

mkdirSync('tmp/hornet', { recursive: true });

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const read = () => page.evaluate(() => {
  const ht = window.hollowtree;
  const h = ht.hornets;
  const worldNow = ht.net && ht.net.world ? ht.net.world.now() : Date.now();
  let live = 0;
  const flags = h.liveFlags || [];
  for (let k = 0; k < flags.length; k++) if (flags[k]) live++;
  return {
    worldNow,
    phase: h.state.phase,
    count: h.state.count,
    season: h.state.season,
    nextRaidAt: h.state.nextRaidAt,
    leadSec: h.state.nextRaidAt ? +((h.state.nextRaidAt - worldNow) / 1000).toFixed(1) : null,
    live,
    mouth: h.mouth ? { x: +h.mouth.x.toFixed(2), y: +h.mouth.y.toFixed(2), z: +h.mouth.z.toFixed(2) } : null,
  };
});

await page.evaluate(() => window.hollowtree.hornets.setActive(true));
await stepper.step(4);
const base = await read();
console.log('base', JSON.stringify(base));

// Two measurements establish how the calendar moves with the epoch, then one solve.
const E1 = base.worldNow - 3600000;
await page.evaluate((e) => window.hollowtree.hornets.setEpoch(e), E1);
await stepper.step(4);
const m1 = await read();
console.log('at E1', JSON.stringify(m1));

const TARGET_LEAD_MS = 4000;
const E2 = E1 + ((m1.worldNow + TARGET_LEAD_MS) - m1.nextRaidAt);
await page.evaluate((e) => window.hollowtree.hornets.setEpoch(e), E2);
await stepper.step(4);
const m2 = await read();
console.log('at E2', JSON.stringify(m2));

await page.evaluate(() => {
  const ht = window.hollowtree;
  const m = ht.hornets.mouth;
  ht.camera.position.set(m.x + 16, m.y + 7, m.z + 30);
  ht.camera.up.set(0, 1, 0);
  ht.camera.lookAt(m.x, m.y + 1, m.z);
  ht.flight.simPosition.set(m.x + 4, m.y + 2, m.z + 9);
  ht.flight.velocity.set(0, 0, 0);
});

const seen = [];
for (let i = 0; i <= 60 * 130; i++) {
  await stepper.step();
  if (i % 30 !== 0) continue;
  const s = await read();
  seen.push({ sec: i / 60, phase: s.phase, live: s.live, lead: s.leadSec });
  if (s.live > 0 && seen.filter((x) => x.live > 0).length % 8 === 1) {
    writeFileSync(`tmp/hornet/t${String(Math.round(i / 60)).padStart(3, '0')}.png`, await stepper.buffer());
  }
  if (s.phase === 'depart' && s.live === 0) break;
}
const phases = [];
for (const s of seen) {
  const last = phases[phases.length - 1];
  if (!last || last.phase !== s.phase) phases.push({ phase: s.phase, from: s.sec, to: s.sec, maxLive: s.live });
  else { last.to = s.sec; last.maxLive = Math.max(last.maxLive, s.live); }
}
console.log('phase timeline:');
for (const p of phases) console.log(`  ${p.phase.padEnd(9)} ${p.from}s → ${p.to}s   max live ${p.maxLive}`);
writeFileSync('out/hornet-probe.json', JSON.stringify({ base, m1, m2, phases, seen }, null, 2));
await browser.close();
