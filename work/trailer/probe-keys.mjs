import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page } = await openGame(browser, { dateEpoch: 1754640000000 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const read = () => page.evaluate(() => window.hollowtree.input.lift);
const press = async (code, key) => page.evaluate(([c, k]) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: k, bubbles: true }));
}, [code, key]);
const release = async (code, key) => page.evaluate(([c, k]) => {
  window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: k, bubbles: true }));
}, [code, key]);

const out = {};
for (const [code, key] of [['KeyC','c'], ['KeyX','x'], ['ControlLeft','Control'], ['AltLeft','Alt'], ['Space',' ']]) {
  await press(code, key);
  out[code] = await read();
  await release(code, key);
}
out.beforeunloadGuard = await page.evaluate(() => {
  // Does a beforeunload listener now veto the close while in play?
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  return { mode: window.hollowtree.mode, defaultPrevented: ev.defaultPrevented };
});
console.log(JSON.stringify(out, null, 1));
console.log('pageerrors:', errs.length ? errs : 'none');
await browser.close();
