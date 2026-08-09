// Hollowtree trailer — recon for the build montage. Establishes, against the running game,
// exactly what it takes to get an empty wall, a seed on it and enough in the bank to grow a
// comb from START — because a montage that silently fails to place anything is worse than
// no montage.

import { writeFileSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const out = await page.evaluate(async () => {
  const ht = window.hollowtree;
  const comb = ht.nest.comb;
  const grid = ht.nest.grid;
  const log = [];
  const snap = () => ({
    count: comb.count,
    resources: ht.resources.snapshot(),
    stores: comb.storesSnapshot ? comb.storesSnapshot() : null,
  });

  log.push(['boot', snap()]);

  comb.clear();
  log.push(['after clear', snap()]);

  const seeded = await comb.seedHive();
  log.push(['after seedHive', { seeded, ...snap() }]);

  const anchor = comb.seedAnchor();
  ht.resources.apply({ pollen: 6000, nectar: 6000, resin: 6000 });
  log.push(['after resources.apply', snap()]);

  // Can a neighbour of the anchor actually be paid for and placed?
  const nb = grid.neighbors(anchor.col, anchor.row, 0, []).filter((c) => c.layer === 0);
  const probe = comb.canPlace(nb[0].col, nb[0].row, 0, 'wax');
  const placed = await comb.place(nb[0].col, nb[0].row, 0, 'wax');
  log.push(['place probe', { neighbour: nb[0], canPlace: probe, placed: { ok: placed.ok, reason: placed.reason || null }, ...snap() }]);

  // How wide can the montage go before the lattice refuses? Walk the ring plan the shot
  // uses and count how many cells survive isValid.
  const seen = new Set();
  let frontier = [{ col: anchor.col, row: anchor.row, layer: 0 }];
  seen.add(grid.key(anchor.col, anchor.row, 0));
  const plan = [];
  while (frontier.length && plan.length < 400) {
    const next = [];
    for (const c of frontier) {
      for (const n of grid.neighbors(c.col, c.row, c.layer, [])) {
        if (n.layer !== 0) continue;
        const k = grid.key(n.col, n.row, n.layer);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!grid.isValid(n.col, n.row, 0)) continue;
        plan.push(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  grid.cellCenter(plan[0].col, plan[0].row, 0, v);
  const p0 = { x: v.x, y: v.y, z: v.z };

  return {
    log,
    anchor,
    planLength: plan.length,
    planFirst: plan.slice(0, 4),
    planLast: plan.slice(-4),
    seedCost: comb.canPlace(nb[1].col, nb[1].row, 0, 'honey').cost,
    p0,
  };
});

console.log(JSON.stringify(out, null, 1));
writeFileSync('out/build-probe.json', JSON.stringify(out, null, 2));
await browser.close();
