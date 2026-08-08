// Hollowtree trailer — caption plates, rendered as transparent 1920x1080 PNGs in the same
// browser the game runs in, using the game's own UI type family and palette
// (see src/ui/screens.css.js). ffmpeg composites them; no text is ever burned into a
// captured game frame.

import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { CAPTIONS } from './lib/captions.def.mjs';

const OUT = 'captions';
mkdirSync(OUT, { recursive: true });

// Lifted from src/ui/screens.css.js so the plates and the game speak with one voice.
const FAMILY = `ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif`;
const C = {
  text: '#f7ead2',
  bright: '#fff3d8',
  dim: 'rgba(247,234,210,.62)',
  honey: '#f2b544',
};

function page(body, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1920px;height:1080px;background:transparent;overflow:hidden}
  body{font-family:${FAMILY};-webkit-font-smoothing:antialiased;color:${C.text}}
  /* A scrim, not a bar: the caption has to hold up over a bright meadow and over the
     near-black of the hollow, and a hard band would read as a subtitle track. */
  .scrim{position:absolute;left:0;right:0;bottom:0;height:420px;
    background:linear-gradient(to top,rgba(10,7,3,.62) 0%,rgba(10,7,3,.34) 42%,rgba(10,7,3,0) 100%)}
  .wrap{position:absolute;left:0;right:0;bottom:132px;text-align:center}
  .line{font-size:40px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;
    color:${C.bright};text-indent:.22em;
    text-shadow:0 2px 10px rgba(8,5,2,.85),0 0 34px rgba(8,5,2,.6)}
  .rule{width:190px;height:1px;margin:26px auto 0;
    background:linear-gradient(90deg,rgba(242,181,68,0),${C.honey},rgba(242,181,68,0));opacity:.75}
  ${extraCss}
  </style></head><body>${body}</body></html>`;
}

function lower(text) {
  return page(`<div class="scrim"></div><div class="wrap"><div class="line">${text}</div><div class="rule"></div></div>`);
}

function endTitle() {
  return page(
    `<div class="endscrim"></div>
     <div class="end">
       <div class="title">Hollowtree</div>
       <div class="trule"></div>
     </div>`,
    `.endscrim{position:absolute;inset:0;
       background:radial-gradient(120% 90% at 50% 52%,rgba(10,7,3,.34) 0%,rgba(10,7,3,.66) 100%)}
     .end{position:absolute;left:0;right:0;top:50%;transform:translateY(-72%);text-align:center}
     .title{font-size:132px;font-weight:200;letter-spacing:.20em;text-transform:uppercase;
       line-height:1;text-indent:.20em;color:${C.bright};
       text-shadow:0 10px 46px rgba(8,5,2,.8)}
     .trule{width:640px;height:1px;margin:38px auto 0;
       background:linear-gradient(90deg,rgba(242,181,68,0),${C.honey},rgba(242,181,68,0))}`
  );
}

function endCall() {
  return page(
    `<div class="call">
       <div class="play">Play now</div>
       <div class="url">hollowtree.gzowo.fun</div>
     </div>`,
    `.call{position:absolute;left:0;right:0;bottom:118px;text-align:center}
     .play{font-size:26px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;
       color:${C.honey};text-indent:.34em;text-shadow:0 2px 12px rgba(8,5,2,.9)}
     .url{margin-top:20px;font-size:22px;font-weight:400;letter-spacing:.16em;
       color:${C.dim};text-indent:.16em;text-shadow:0 2px 12px rgba(8,5,2,.9)}`
  );
}

const RENDER = {
  lower,
  endTitle: () => endTitle(),
  endCall: () => endCall(),
};

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none'],
});
const p = await browser.newPage();
await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

for (const c of CAPTIONS) {
  const html = c.kind === 'lower' ? lower(c.text) : RENDER[c.kind]();
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const buf = await p.screenshot({ type: 'png', omitBackground: true });
  writeFileSync(`${OUT}/${c.id}.png`, buf);
  console.log(`${c.id}.png  ${(buf.length / 1024).toFixed(0)} KB`);
}

await browser.close();
