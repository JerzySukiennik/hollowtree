import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page } = await openGame(browser, { dateEpoch: 1754640000000, verbose: false });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const out = await page.evaluate(() => {
  const ht = window.hollowtree;
  const painted = () => {
    let n = 0;
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      let op = 1, p = el;
      while (p && p !== document.body) { op *= parseFloat(getComputedStyle(p).opacity || '1'); p = p.parentElement; }
      if (op > 0.01) n++;
    });
    return n;
  };
  return {
    hasGuidance: !!document.querySelector('.ht-mk') || document.querySelectorAll('[class^=ht-]').length > 0,
    markers: document.querySelectorAll('.ht-mk').length,
    promptGone: document.querySelectorAll('.ht-prompt').length,
    bloomGone: document.querySelectorAll('.ht-bloom').length,
    painted: painted(),
    mode: ht && ht.mode,
  };
});
console.log(JSON.stringify(out, null, 2));
console.log('pageerrors:', errs.length ? errs : 'none');
await browser.close();
