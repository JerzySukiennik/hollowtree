// Hollowtree — hornet look check. Stages a raid onto the shot clock (same epoch solve as
// probe-hornets.mjs), parks the camera at gameplay distance from the mouth and captures the
// swarm mid-assault. Also reports triangle counts and a frame-time sample for the full raid.
//
//   node shot-hornet.mjs out/hornet-new.png
//
// Nothing in src/ is touched; the game is driven through window.hollowtree only.

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';

const OUT = process.argv[2] || 'out/hornet-new.png';
const LABEL = OUT.replace(/^.*\//, '').replace(/\.png$/, '');
mkdirSync('out', { recursive: true });
mkdirSync('tmp/hornet-shot', { recursive: true });

const browser = await launch();
const { page, stepper, errors } = await openGame(browser, { dateEpoch: 1754640000000 });

const read = () => page.evaluate(() => {
  const ht = window.hollowtree;
  const h = ht.hornets;
  const worldNow = ht.net && ht.net.world ? ht.net.world.now() : Date.now();
  let live = 0;
  const flags = h.liveFlags || [];
  for (let k = 0; k < flags.length; k++) if (flags[k]) live++;
  return {
    worldNow, phase: h.state.phase, count: h.state.count,
    nextRaidAt: h.state.nextRaidAt, live,
    mouth: h.mouth ? { x: h.mouth.x, y: h.mouth.y, z: h.mouth.z } : null,
  };
});

await page.evaluate(() => window.hollowtree.hornets.setActive(true));
await stepper.step(4);
const base = await read();

// Two measurements fix how the calendar moves with the epoch, then one solve puts the
// swarm at the mouth a few seconds out.
const E1 = base.worldNow - 3600000;
await page.evaluate((e) => window.hollowtree.hornets.setEpoch(e), E1);
await stepper.step(4);
const m1 = await read();
const E2 = E1 + ((m1.worldNow + 4000) - m1.nextRaidAt);
await page.evaluate((e) => window.hollowtree.hornets.setEpoch(e), E2);
await stepper.step(4);

// Camera at gameplay distance: 20 m out from the mouth, slightly above, looking at the
// ring the swarm circles on. The queen is parked out of frame so only hornets are read.
async function placeCamera(dist = 20, height = 3) {
  await page.evaluate(({ d, hgt }) => {
    const ht = window.hollowtree;
    const m = ht.hornets.mouth;
    ht.camera.position.set(m.x + d * 0.55, m.y + hgt, m.z + d * 0.83);
    ht.camera.up.set(0, 1, 0);
    ht.camera.lookAt(m.x, m.y + 0.6, m.z);
    ht.flight.simPosition.set(m.x + 40, m.y + 2, m.z + 40);
    ht.flight.velocity.set(0, 0, 0);
  }, { d: dist, hgt: height });
}
await placeCamera();

// Step to the middle of the assault window, where the swarm is circling the mouth.
let seen = null;
let assaultFrames = 0;
const frameTimes = [];
for (let i = 0; i < 60 * 200; i++) {
  const t0 = Date.now();
  await stepper.step();
  const dtMs = Date.now() - t0;
  if (i % 10 === 0) {
    seen = await read();
    if (seen.phase === 'assault') assaultFrames++;
    if (seen.phase === 'assault' && seen.live >= Math.min(4, seen.count)) frameTimes.push(dtMs);
    if (assaultFrames >= 12) break;
  }
}

const stats = await page.evaluate(() => {
  const ht = window.hollowtree;
  const h = ht.hornets;
  let tris = 0;
  const meshes = [];
  h.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const idx = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    const per = idx / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    meshes.push({ name: o.name || o.type, perInstance: per, instances: n, tris: per * n });
    tris += per * n;
  });
  return { tris, meshes, live: h.state.count, info: ht.renderer.info.render };
});

// A real frame-time sample: 120 uninterrupted frames with the swarm on screen.
const perf = await page.evaluate((n) => {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) window.__h.step(1000 / 60);
  const dt = performance.now() - t0;
  return { frames: n, msPerFrame: +(dt / n).toFixed(2) };
}, 120);

await placeCamera();
await stepper.step(1);
await stepper.shot(OUT);

// A closer read of the silhouette, for the report only.
await placeCamera(8, 1.4);
await stepper.step(1);
await stepper.shot(OUT.replace(/\.png$/, '-close.png'));

console.log(JSON.stringify({ label: LABEL, phase: seen && seen.phase, live: seen && seen.live, count: seen && seen.count, stats, perf, errors: errors.slice(0, 5) }, null, 2));
writeFileSync(`out/${LABEL}-stats.json`, JSON.stringify({ stats, perf, seen }, null, 2));
await browser.close();
