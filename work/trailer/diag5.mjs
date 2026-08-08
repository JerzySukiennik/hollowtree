// Is the difference in the encoder, the GPU, or the sim? Capture the same frame repeatedly
// in one session, then compare pixel data rather than PNG bytes.
import { createHash } from 'node:crypto';
import { launch, openGame, setTimeOfDay } from './lib/session.mjs';
import { shotList } from './lib/render-shot.mjs';

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
const shot = (await shotList(page)).find((s) => s.id === 'b2-meadow');
await setTimeOfDay(page, shot.timeOfDay);
await page.evaluate(() => window.__cine.beginShot('b2-meadow'));
for (let i = 0; i < 90; i++) { await page.evaluate(() => window.__cine.frame(30)); await stepper.step(); }

const h = [];
for (let i = 0; i < 4; i++) {
  const buf = await stepper.buffer();
  h.push(createHash('sha256').update(buf).digest('hex').slice(0, 24));
}
console.log('same-frame repeat (no step):', h.join(' | '));

// Pixel readback straight from the WebGL context, bypassing the screenshot encoder.
const px = await page.evaluate(() => {
  const gl = window.hollowtree.renderer.getContext();
  const w = 160, hh = 90;
  const data = new Uint8Array(w * hh * 4);
  gl.readPixels(880, 495, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, data);
  let sum = 0; let acc = 0;
  for (let i = 0; i < data.length; i++) { sum += data[i]; acc = (acc * 31 + data[i]) >>> 0; }
  return { sum, acc };
});
console.log('gl readback:', JSON.stringify(px));
await browser.close();
