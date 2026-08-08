// Hollowtree trailer — world probe. Boots the game once, dumps the geometry the shot list
// needs, and shoots stills from candidate camera setups so paths can be authored against
// what the renderer actually shows rather than against guesses.

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openGame, setTimeOfDay } from './lib/session.mjs';

const OUT = 'tmp/probe';
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const { page, stepper, world, errors } = await openGame(browser, {
  dateEpoch: 1754640000000,
  verbose: false,
});

const info = await page.evaluate(() => {
  const ht = window.hollowtree;
  const t = ht.terrain;
  const spec = ht.nest && ht.nest.interior && ht.nest.interior.spec;
  const comb = ht.nest && ht.nest.comb;
  const anchor = comb && comb.seedAnchor ? comb.seedAnchor() : null;
  const heights = {};
  for (const [x, z] of [[0, -30], [0, 0], [0, 40], [30, 20], [-40, 10], [60, -10], [-60, -40], [20, 60], [-25, -70]]) {
    heights[`${x},${z}`] = t.getHeight(x, z);
  }
  const e = ht.hive && ht.hive.entrance;
  const hiveEntrance = e ? { x: e.x, y: e.y, z: e.z } : null;
  // A handful of real flower positions, so the gather shots can be aimed at something
  // that is actually there.
  const flowerSamples = [];
  if (ht.flowers && ht.flowers.sampleNearest) {
    for (const [x, z] of [[10, 10], [-20, 15], [25, -5], [0, 35], [-35, -10], [40, 25], [15, -55]]) {
      const p = { x, y: t.getHeight(x, z) + 1, z };
      const h = ht.flowers.sampleNearest(p, 30);
      if (h) flowerSamples.push({ near: [x, z], hit: JSON.parse(JSON.stringify(h)) });
    }
  }
  return {
    flowerSamples,
    hiveEntrance,
    heights,
    spec: spec ? {
      centerX: spec.centerX, centerZ: spec.centerZ,
      minX: spec.minX, maxX: spec.maxX, minZ: spec.minZ, maxZ: spec.maxZ,
      floorY: spec.floorY, ceilY: spec.ceilY, entranceY: spec.entranceY,
      entranceRadius: spec.entranceRadius,
      entrancePos: spec.entrancePos ? { x: spec.entrancePos.x, y: spec.entrancePos.y, z: spec.entrancePos.z } : null,
      entranceWall: spec.entranceWall, entranceSign: spec.entranceSign, entranceAxisZ: spec.entranceAxisZ,
    } : null,
    seedAnchor: anchor ? { col: anchor.col, row: anchor.row, layer: anchor.layer, position: { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z } } : null,
    unlocked: comb && comb.unlockedTypes ? comb.unlockedTypes().map((t2) => (typeof t2 === 'string' ? t2 : t2.id)) : null,
    combCells: comb ? comb.count : null,
    zones: ht.zones ? Object.keys(ht.zones) : null,
    netKeys: ht.net ? Object.keys(ht.net) : null,
    bankKeys: ht.net && ht.net.bank ? Object.keys(ht.net.bank) : null,
  };
});

console.log(JSON.stringify(info, null, 2));
writeFileSync(`${OUT}/world.json`, JSON.stringify({ world, info }, null, 2));

// ---------------------------------------------------------------- candidate stills
const CANDIDATES = [
  // id, timeOfDay, camera pos, look target, fov
  ['tod-025-tree', 0.25, [26, 30, 12], [0, 34, -30], 55],
  ['tod-035-tree', 0.35, [26, 30, 12], [0, 34, -30], 55],
  ['tod-050-tree', 0.50, [26, 30, 12], [0, 34, -30], 55],
  ['tod-062-tree', 0.62, [26, 30, 12], [0, 34, -30], 55],
  ['tod-072-tree', 0.72, [26, 30, 12], [0, 34, -30], 55],
  ['tod-080-tree', 0.80, [26, 30, 12], [0, 34, -30], 55],
  ['canopy-up', 0.30, [7, 44, -18], [0, 66, -30], 70],
  ['entrance-near', 0.30, [3, 18, -14], [0, 16.5, -29], 50],
  ['meadow-low', 0.30, [12, 3.4, 22], [-10, 2.6, -2], 62],
  ['meadow-wide', 0.30, [40, 10, 55], [0, 6, 0], 62],
];

let i = 0;
for (const [id, tod, pos, look, fov] of CANDIDATES) {
  await setTimeOfDay(page, tod);
  await page.evaluate((p, l, f) => {
    const c = window.hollowtree.camera;
    c.up.set(0, 1, 0);
    c.position.set(p[0], p[1], p[2]);
    c.lookAt(l[0], l[1], l[2]);
    c.fov = f;
    c.updateProjectionMatrix();
    // Keep the queen out of the probe frames.
    window.hollowtree.flight.simPosition.set(0, 200, 400);
  }, pos, look, fov);
  await stepper.step(45);
  await stepper.shot(`${OUT}/${String(i).padStart(2, '0')}-${id}.png`);
  console.log('shot', id);
  i++;
}

if (errors.length) console.log('ERRORS:', errors.slice(0, 5));
await browser.close();
