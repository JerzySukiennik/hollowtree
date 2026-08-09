import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const out = await page.evaluate(async () => {
  const ht = window.hollowtree;
  const comb = ht.nest.comb, grid = ht.nest.grid;
  comb.clear();
  await comb.seedHive();
  const anchor = comb.seedAnchor();

  // Walk outward until we find cells that are valid AND empty -- the seed ring itself is
  // already occupied, which is what made the first attempt place nothing.
  const seen = new Set([grid.key(anchor.col, anchor.row, 0)]);
  let frontier = [{ col: anchor.col, row: anchor.row, layer: 0 }];
  const free = [];
  while (frontier.length && free.length < 12) {
    const next = [];
    for (const c of frontier) {
      for (const n of grid.neighbors(c.col, c.row, c.layer, [])) {
        if (n.layer !== 0) continue;
        const k = grid.key(n.col, n.row, 0);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!grid.isValid(n.col, n.row, 0)) continue;
        next.push(n);
        if (!comb.cellAt(n.col, n.row, 0)) free.push(n);
      }
    }
    frontier = next;
  }

  const results = [];
  for (let i = 0; i < Math.min(6, free.length); i++) {
    ht.resources.apply({ pollen: 9999, nectar: 9999, resin: 9999 });
    const r = await comb.place(free[i].col, free[i].row, 0, 'wax');
    results.push({ ok: r.ok, reason: r.reason || null });
  }

  // Retag the placed cells with three different owners, one of whom is in no roster at all,
  // then let the slow tick repaint.
  const owners = ['queen-a', 'queen-b', 'ghost-who-left'];
  let i = 0;
  const tagged = [];
  for (const f of free.slice(0, 6)) {
    const cell = comb.cellAt(f.col, f.row, 0);
    if (!cell) continue;
    cell.owner = owners[i % owners.length];
    i++;
    tagged.push(cell.owner);
  }
  const repainted = comb.refreshOwnerColors();

  const rings = [];
  for (const f of free.slice(0, 6)) {
    const cell = comb.cellAt(f.col, f.row, 0);
    if (cell) rings.push({ owner: cell.owner, ring: cell.ring, hex: cell.ringHex });
  }
  const seedCell = comb.cellAt(anchor.col, anchor.row, 0);
  return {
    results,
    tagged,
    repainted,
    rings,
    seed: seedCell ? { owner: seedCell.owner, ring: seedCell.ring, hex: seedCell.ringHex } : null,
    ringMeshCount: (() => {
      let n = null;
      ht.scene.traverse((o) => { if (o.name === 'comb_owner_rings') n = o.count; });
      return n;
    })(),
  };
});
console.log(JSON.stringify(out, null, 1));
// Fly her into the hollow first and let the loop run: the interior only draws once the
// portal reports insideness, so a camera teleported in from outside sees the meadow.
await page.evaluate(() => {
  const ht = window.hollowtree;
  ht.flight.simPosition.set(ht.nest.spec.centerX, ht.nest.spec.entranceY, ht.nest.spec.centerZ);
  ht.flight.velocity.set(0, 0, 0);
});
await stepper.step(120);
const inside = await page.evaluate(() => {
  const ht = window.hollowtree;
  const a = ht.nest.comb.seedAnchor();
  const p = ht.camera.position.clone();
  ht.nest.grid.cellCenter(a.col, a.row, 0, p);
  const centre = p.clone();
  centre.x = ht.nest.spec.centerX;
  centre.z = ht.nest.spec.centerZ;
  // The interior is hidden while the portal says we are outside; for a look at the rings
  // we just show it. This is a rendering probe, not a gameplay one.
  if (ht.nest.interior && ht.nest.interior.group) ht.nest.interior.group.visible = true;
  const n = p.clone().sub(centre).normalize();
  ht.camera.position.copy(p).addScaledVector(n, -2.6);
  ht.camera.position.y += 0.3;
  ht.camera.lookAt(p);
  ht.camera.updateMatrixWorld(true);
  ht.renderer.render(ht.scene, ht.camera);
  return { insideness: ht.nest.portal ? ht.nest.portal.state.insideness : null, cam: ht.camera.position.toArray().map((v) => +v.toFixed(2)) };
});
console.log('inside:', JSON.stringify(inside));
await page.screenshot({ path: 'out/owner-rings.png' });
await browser.close();
