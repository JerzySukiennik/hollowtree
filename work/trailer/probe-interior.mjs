// Hollowtree trailer — interior reconnaissance. The hall changed under the previous
// builder (1001-slab collider, carved build bay, comb on a shelf), so before a single
// frame of block 4 is shot the geometry is read back out of the running game: the hall
// spec, the bay's own frame, where the seed cell actually sits, and how much room a lens
// has between the comb and the opposite wall.

import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';

mkdirSync('out', { recursive: true });

const browser = await launch();
const { page, errors } = await openGame(browser, { dateEpoch: 1754640000000 });

const info = await page.evaluate(() => {
  const ht = window.hollowtree;
  const nest = ht.nest || {};
  const interior = nest.interior || {};
  const spec = interior.spec || null;
  const grid = nest.grid || null;
  const comb = nest.comb || null;

  const out = { spec: null, colliders: null, bay: null, seed: null, grid: null, keys: {} };
  out.keys.nest = Object.keys(nest);
  out.keys.interior = Object.keys(interior);
  out.keys.comb = comb ? Object.keys(comb) : null;
  out.keys.grid = grid ? Object.keys(grid) : null;

  if (spec) {
    out.spec = JSON.parse(JSON.stringify(spec, (k, v) => (
      v && v.isVector3 ? { x: v.x, y: v.y, z: v.z } : v
    )));
  }

  const cols = (ht.terrain && ht.terrain.colliders) || [];
  out.colliders = { count: cols.length };

  if (interior.colliders) {
    const ic = interior.colliders;
    out.interiorColliders = { count: Array.isArray(ic) ? ic.length : typeof ic };
  }

  if (comb) {
    const a = comb.seedAnchor ? comb.seedAnchor() : null;
    out.seed = a ? JSON.parse(JSON.stringify(a, (k, v) => (
      v && v.isVector3 ? { x: v.x, y: v.y, z: v.z } : v
    ))) : null;
    out.cells = comb.cells ? (comb.cells.size !== undefined ? comb.cells.size : comb.cells.length) : null;
  }

  if (grid) {
    out.grid = {
      keys: Object.keys(grid),
      cols: grid.cols, rows: grid.rows, layers: grid.layers,
      dv: grid.dv, du: grid.du,
    };
    if (typeof grid.center === 'function') {
      try { out.grid.centerSample = grid.center(0, 0, 0); } catch (e) { out.grid.centerErr = String(e); }
    }
  }

  return out;
});

writeFileSync('out/interior-probe.json', JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2).slice(0, 6000));
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 8));
await browser.close();
