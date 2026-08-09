import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

const setup = await page.evaluate(async () => {
  const ht = window.hollowtree;
  const comb = ht.nest.comb, grid = ht.nest.grid;
  comb.clear(); await comb.seedHive();
  const a = comb.seedAnchor();
  const seen = new Set([grid.key(a.col, a.row, 0)]);
  let frontier = [{ col: a.col, row: a.row, layer: 0 }];
  const free = [];
  while (frontier.length && free.length < 6) {
    const nx = [];
    for (const c of frontier) for (const n of grid.neighbors(c.col, c.row, c.layer, [])) {
      if (n.layer !== 0) continue;
      const k = grid.key(n.col, n.row, 0);
      if (seen.has(k)) continue; seen.add(k);
      if (!grid.isValid(n.col, n.row, 0)) continue;
      nx.push(n);
      if (!comb.cellAt(n.col, n.row, 0)) free.push(n);
    }
    frontier = nx;
  }
  // Two brood cells, finished instantly.
  const made = [];
  for (const f of free.slice(0, 2)) {
    ht.resources.apply({ pollen: 9999, nectar: 9999, resin: 9999 });
    const r = await comb.place(f.col, f.row, 0, 'brood');
    const cell = comb.cellAt(f.col, f.row, 0);
    if (cell) { cell.progress = 1; cell.done = true; }
    made.push({ ok: r.ok, reason: r.reason || null });
  }
  comb.recompute && comb.recompute();
  // Feed the hive so upkeep starvation cannot mask the hatch, and empty the flock so the
  // first larva is measurable rather than hidden inside a population already at the cap.
  comb.stores.honey = 100000;
  while (ht.swarm.count > 0 && ht.swarm.starveOne && ht.swarm.starveOne()) {}
  return { made, startCount: ht.swarm.count, cap: ht.swarm.limit ? ht.swarm.limit : null, swarmCap: comb.effects.swarmCap, count: ht.swarm.count };
});

// Step and watch bees appear.
const timeline = [];
let firstHatchSec = null;
for (let i = 0; i < 60 * 50; i++) {
  await stepper.step(1);
  if (i % 60 === 0) {
    const s = await page.evaluate(() => ({
      count: window.hollowtree.swarm.count,
      hatched: window.hollowtree.swarm.broodStats.hatched,
      blocked: window.hollowtree.swarm.broodStats.blockedByCap,
      honey: +window.hollowtree.nest.comb.stores.honey.toFixed(1),
      honeyCap: window.hollowtree.nest.comb.capacity.honey,
      starving: window.hollowtree.swarm.upkeep ? window.hollowtree.swarm.upkeep.starving : null,
      cap: window.hollowtree.nest.comb.effects.swarmCap,
    }));
    s.sec = i / 60;
    timeline.push(s);
    if (firstHatchSec === null && s.hatched > 0) firstHatchSec = s.sec;
  }
}
const last = timeline[timeline.length - 1];
console.log(JSON.stringify({
  setup,
  firstHatchSec,
  final: last,
  overCap: timeline.filter((s) => s.count > s.cap).length,
  curve: timeline.filter((s) => s.sec % 5 === 0).map((s) => `${s.sec}s n=${s.count} h=${s.hatched} honey=${s.honey}/${s.honeyCap} starv=${s.starving}`),
}, null, 1));
console.log('pageerrors:', errs.length ? errs : 'none');
await browser.close();
