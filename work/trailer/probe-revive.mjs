import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

// --- 1. No chamber: she must come back at the hollow's mouth.
const noChamber = await page.evaluate(async () => {
  const ht = window.hollowtree;
  ht.nest.comb.clear();
  await ht.nest.comb.seedHive();
  const r = ht.revive.revive();
  const spec = ht.nest.spec;
  const dx = r.at.x - spec.centerX, dy = r.at.y - spec.entranceY, dz = r.at.z - spec.centerZ;
  return {
    atChamber: r.atChamber,
    at: r.at.toArray().map((v) => +v.toFixed(2)),
    distToEntrance: +Math.hypot(dx, dy, dz).toFixed(3),
    weakness: +ht.flight.weakness.toFixed(3),
  };
});

// --- 2. Build a queen's chamber, then die again: she must come back beside it.
const withChamber = await page.evaluate(async () => {
  const ht = window.hollowtree;
  const comb = ht.nest.comb, grid = ht.nest.grid;
  const anchor = comb.seedAnchor();
  const seen = new Set([grid.key(anchor.col, anchor.row, 0)]);
  let frontier = [{ col: anchor.col, row: anchor.row, layer: 0 }];
  let spot = null;
  while (frontier.length && !spot) {
    const next = [];
    for (const c of frontier) {
      for (const n of grid.neighbors(c.col, c.row, c.layer, [])) {
        if (n.layer !== 0) continue;
        const k = grid.key(n.col, n.row, 0);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!grid.isValid(n.col, n.row, 0)) continue;
        next.push(n);
        if (!comb.cellAt(n.col, n.row, 0) && !spot) spot = n;
      }
    }
    frontier = next;
  }
  ht.resources.apply({ pollen: 9999, nectar: 9999, resin: 9999 });
  const placed = await comb.place(spot.col, spot.row, 0, 'queen');
  // Finish it instantly -- an unbuilt chamber must not count as a spawn point.
  const cell = comb.cellAt(spot.col, spot.row, 0);
  const beforeDone = cell ? comb.effects.doneCount : null;
  const midBuild = ht.revive.revive();
  if (cell) { cell.progress = 1; cell.done = true; }
  const after = ht.revive.revive();
  const p = ht.camera.position.clone();
  grid.cellCenter(spot.col, spot.row, 0, p);
  const d = Math.hypot(after.at.x - p.x, after.at.y - p.y, after.at.z - p.z);
  return {
    placed: { ok: placed.ok, reason: placed.reason || null },
    whileUnfinished: { atChamber: midBuild.atChamber },
    whenFinished: { atChamber: after.atChamber, distToChamberCell: +d.toFixed(3) },
  };
});

// --- 3. Control must survive every single frame after the hit.
const control = await page.evaluate(() => {
  window.__ctl = [];
  return true;
});
await page.evaluate(() => {
  const ht = window.hollowtree;
  ht.revive.revive();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
});
const frames = [];
for (let i = 0; i < 20; i++) {
  await stepper.step(1);
  frames.push(await page.evaluate(() => {
    const ht = window.hollowtree;
    return { fwd: ht.input.forward, weak: +ht.flight.weakness.toFixed(3), spd: +(ht.flight.speed || 0).toFixed(2) };
  }));
}
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true })));

const deadFrames = frames.filter((f) => f.fwd !== 1).length;
console.log(JSON.stringify({
  noChamber, withChamber,
  controlDeadFrames: deadFrames,
  weaknessCurve: frames.map((f) => f.weak).filter((_, i) => i % 4 === 0),
  speedCurve: frames.map((f) => f.spd).filter((_, i) => i % 4 === 0),
}, null, 1));
console.log('pageerrors:', errs.length ? errs : 'none');
await browser.close();
