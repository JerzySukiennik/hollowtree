// Hollowtree trailer — one-off probe: can headless Chrome run the game with real WebGL?

import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-frame-rate-limit',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[page]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));

await page.goto('http://localhost:8124/', { waitUntil: 'load', timeout: 60000 });

const gl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const g = c.getContext('webgl2');
  if (!g) return { ok: false };
  const d = g.getExtension('WEBGL_debug_renderer_info');
  return { ok: true, renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER) };
});
console.log('WEBGL:', JSON.stringify(gl));

await page.waitForFunction('!!window.hollowtree', { timeout: 90000 });
const keys = await page.evaluate(() => Object.keys(window.hollowtree));
console.log('hollowtree keys:', keys.join(' '));

await page.screenshot({ path: 'tmp/probe-menu.png' });
console.log('menu screenshot written');

await browser.close();
