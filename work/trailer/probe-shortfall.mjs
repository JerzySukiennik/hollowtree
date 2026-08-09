import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page } = await openGame(browser, { dateEpoch: 1754640000000 });
const out = await page.evaluate(async () => {
  const ht = window.hollowtree;
  const comb = ht.nest.comb;
  const rows = [];
  // Drain the bank to a known, awkward amount so the gaps are checkable by hand.
  ht.resources.apply({ pollen: -9999, nectar: -9999, resin: -9999 });
  ht.resources.apply({ pollen: 5, nectar: 0, resin: 2 });
  const bank = comb.bankSnapshot();
  const { CELL_TYPES } = await import('/src/config.comb.js');
  for (const t of CELL_TYPES) {
    const cost = comb.costOf(t.id);
    const miss = comb.shortfall(t.id);
    const afford = comb.affordable(t.id);
    rows.push({ id: t.id, cost, miss, afford, agree: Boolean(miss) === !afford });
  }
  return { bank, rows };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
