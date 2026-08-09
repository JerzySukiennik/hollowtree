// Hollowtree trailer — what is actually on the build wall at boot, and what the bay's own
// frame is. The build block has to open on a wall with the START marker and seven seed
// cells, not on a wall somebody already filled, so this reports what is there before any
// camera is pointed at it.

import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';

mkdirSync('out', { recursive: true });

const browser = await launch();
const { page, errors } = await openGame(browser, { dateEpoch: 1754640000000 });

const out = await page.evaluate(() => {
  const ht = window.hollowtree;
  const comb = ht.nest.comb;
  const grid = ht.nest.grid;
  const spec = ht.nest.interior.spec;

  const v3 = (v) => (v ? { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) } : null);

  const cells = [];
  let i = 0;
  for (const [k, rec] of comb.cells) {
    if (i++ < 12) cells.push({ k, type: rec.type || rec.t, owner: rec.owner || rec.o });
  }
  const byType = {};
  for (const [, rec] of comb.cells) {
    const t = rec.type || rec.t;
    byType[t] = (byType[t] || 0) + 1;
  }

  const label = comb.group.children.find((c) => c.name === 'comb_start_label');

  const bw = spec.buildWall;
  return {
    cellCount: comb.cells.size,
    byType,
    sample: cells,
    seeded: comb.seeded,
    anchor: (() => { const a = comb.seedAnchor(); return a ? { col: a.col, row: a.row, layer: a.layer, position: v3(a.position) } : null; })(),
    startLabel: label ? { visible: label.visible, position: v3(label.position), scale: v3(label.scale) } : null,
    buildWall: {
      wall: bw.wall, axis: bw.axis, plane: bw.plane,
      normal: v3(bw.normal), tangent: v3(bw.tangent), centre: v3(bw.centre), half: bw.half,
    },
    gridInfo: {
      columns: grid.columns, rows: grid.rows, layers: grid.layers,
      cellWidth: grid.cellWidth, dv: grid.dv, rowBase: grid.rowBase,
      buildWall: grid.buildWall, buildWallCenterS: grid.buildWallCenterS,
    },
    // Where a ring of cells around the anchor would actually land in world space, so a
    // camera can be framed on the growth rather than guessed at.
    ring: (() => {
      const a = comb.seedAnchor();
      if (!a) return null;
      const list = grid.neighbors(a.col, a.row, a.layer, []);
      return list.map((n) => ({ col: n.col, row: n.row, layer: n.layer, valid: grid.isValid(n.col, n.row, n.layer), c: v3(grid.cellCenter(n.col, n.row, n.layer)) }));
    })(),
    bank: comb.bankSnapshot ? comb.bankSnapshot() : null,
    resources: ht.resources && ht.resources.snapshot ? ht.resources.snapshot() : null,
    canPlaceProbe: (() => {
      const a = comb.seedAnchor();
      const list = ht.nest.grid.neighbors(a.col, a.row, a.layer, []);
      const n = list[0];
      try { return { cell: n, canPlace: comb.canPlace(n.col, n.row, n.layer, 'wax'), affordable: comb.affordable('wax'), cost: comb.costOf('wax') }; }
      catch (e) { return { err: String(e) }; }
    })(),
  };
});

writeFileSync('out/comb-probe.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 8));
await browser.close();
