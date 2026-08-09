import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page } = await openGame(browser, { dateEpoch: 1754640000000 });
const out = await page.evaluate(async () => {
  const ht = window.hollowtree;
  const comb = ht.nest.comb, grid = ht.nest.grid;
  comb.clear(); await comb.seedHive();
  const a = comb.seedAnchor();
  const seen = new Set([grid.key(a.col, a.row, 0)]);
  let frontier = [{ col: a.col, row: a.row, layer: 0 }], spot = null;
  while (frontier.length && !spot) {
    const next = [];
    for (const c of frontier) for (const n of grid.neighbors(c.col, c.row, c.layer, [])) {
      if (n.layer !== 0) continue;
      const k = grid.key(n.col, n.row, 0);
      if (seen.has(k)) continue; seen.add(k);
      if (!grid.isValid(n.col, n.row, 0)) continue;
      next.push(n);
      if (!comb.cellAt(n.col, n.row, 0) && !spot) spot = n;
    }
    frontier = next;
  }
  ht.resources.apply({ pollen: 9999, nectar: 9999, resin: 9999 });
  await comb.place(spot.col, spot.row, 0, 'queen');
  const cell = comb.cellAt(spot.col, spot.row, 0);
  cell.progress = 1; cell.done = true;
  const { CELL_BY_ID } = await import('/src/config.comb.js');
  const rows = [];
  for (const c of comb.cells.values()) {
    const t = CELL_BY_ID[c.type];
    rows.push({ type: c.type, done: c.done, owner: c.owner, chamberFlag: Boolean(t && t.effects && t.effects.queenChamber) });
  }
  const found = ht.revive.findChamber();
  return { cellsIsMap: comb.cells instanceof Map, size: comb.cells.size, rows, found: found ? found.type : null, uid: (ht.net && ht.net.uid) || 'local' };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
