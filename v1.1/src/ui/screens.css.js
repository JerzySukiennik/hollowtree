// Hollowtree — shared stylesheet for the front-end screens (menu, lobby), injected once in the same way the gameplay HUD does it.

import { SCREENS } from '../config.js';

const C = SCREENS.colors;

const CSS = `
.ht-screen{position:fixed;inset:0;z-index:8;color:${C.text};
font:500 14px/1.45 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1,"lnum" 1;-webkit-font-smoothing:antialiased;
opacity:0;transition:opacity ${SCREENS.fadeOut}s cubic-bezier(.22,.61,.36,1)}
.ht-screen.is-on{opacity:1}
.ht-screen.is-gone{pointer-events:none}
.ht-screen input,.ht-screen button{font:inherit;color:inherit}
.ht-screen ::selection{background:rgba(242,181,68,.28)}

.ht-veil{position:absolute;inset:0;background:${SCREENS.veil};
backdrop-filter:blur(${SCREENS.blurPx}px) saturate(1.04);-webkit-backdrop-filter:blur(${SCREENS.blurPx}px) saturate(1.04)}
.ht-vignette{position:absolute;inset:0;pointer-events:none;
background:radial-gradient(120% 90% at 62% 46%,transparent 38%,rgba(12,8,3,.55) 100%)}
.ht-grain{position:absolute;inset:0;pointer-events:none;opacity:.5;
background:repeating-linear-gradient(0deg,rgba(255,255,255,.014) 0 1px,transparent 1px 3px)}

.ht-label{font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:${C.dim}}
.ht-rule{height:1px;background:linear-gradient(90deg,${C.honey},rgba(242,181,68,0));opacity:.5}

.ht-menu{position:absolute;inset:0;display:flex;align-items:center;
padding:0 clamp(28px,7vw,120px);gap:clamp(28px,4vw,64px)}
.ht-menu-col{width:min(500px,46vw);flex:0 0 auto;display:flex;flex-direction:column;gap:34px}
.ht-brand{display:flex;flex-direction:column;gap:12px}
.ht-eyebrow{font-size:10px;letter-spacing:.38em;text-transform:uppercase;color:${C.honey};opacity:.85}
.ht-title{font-size:clamp(34px,4vw,56px);font-weight:200;letter-spacing:.15em;text-transform:uppercase;
line-height:1.02;text-indent:.15em;white-space:nowrap;color:${C.bright};
background:linear-gradient(168deg,#fff5e0 8%,${C.honey} 92%);-webkit-background-clip:text;background-clip:text;
-webkit-text-fill-color:transparent;text-shadow:0 8px 40px rgba(0,0,0,.45)}
.ht-title-rule{height:1px;width:0;background:linear-gradient(90deg,${C.honey},rgba(242,181,68,0));
transition:width 1.5s cubic-bezier(.22,.61,.36,1) .28s}
.ht-screen.is-on .ht-title-rule{width:100%}
.ht-tagline{font-size:13px;line-height:1.6;color:${C.dim};max-width:46ch}

.ht-nav{display:flex;flex-direction:column;align-items:flex-start;gap:2px;margin-left:-14px}
.ht-nav-item{position:relative;display:flex;align-items:baseline;gap:12px;
padding:11px 14px;background:none;border:0;cursor:pointer;text-align:left;
font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:${C.text};
opacity:0;transform:translateY(9px);
transition:opacity .5s cubic-bezier(.22,.61,.36,1),transform .5s cubic-bezier(.22,.61,.36,1),color .22s ease}
.ht-screen.is-on .ht-nav-item{opacity:.78;transform:none}
.ht-nav-item::before{content:"";position:absolute;left:0;top:50%;width:2px;height:0;
transform:translateY(-50%);background:${C.honey};border-radius:2px;
transition:height .26s cubic-bezier(.22,.61,.36,1),opacity .26s ease;opacity:0}
.ht-nav-item:hover,.ht-nav-item:focus-visible,.ht-nav-item.is-active{opacity:1;color:${C.bright};outline:none}
.ht-nav-item:hover::before,.ht-nav-item:focus-visible::before,.ht-nav-item.is-active::before{height:17px;opacity:1}
.ht-nav-item span.ht-nav-text{transition:transform .26s cubic-bezier(.22,.61,.36,1);display:inline-block}
.ht-nav-item:hover span.ht-nav-text,.ht-nav-item:focus-visible span.ht-nav-text,
.ht-nav-item.is-active span.ht-nav-text{transform:translateX(7px)}
.ht-nav-note{font-size:10.5px;letter-spacing:.06em;text-transform:none;color:${C.dim};
opacity:0;transform:translateX(2px);transition:opacity .3s ease,transform .3s ease}
.ht-nav-item:hover .ht-nav-note,.ht-nav-item:focus-visible .ht-nav-note,
.ht-nav-item.is-active .ht-nav-note{opacity:1;transform:translateX(7px)}

.ht-foot{position:absolute;left:clamp(28px,7vw,120px);bottom:34px;display:flex;gap:22px;align-items:center;
font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${C.dim};
opacity:0;transition:opacity .8s ease .7s}
.ht-screen.is-on .ht-foot{opacity:1}

.ht-panels{display:grid;align-items:center;justify-items:start}
.ht-panel{grid-area:1/1;position:relative;width:min(430px,44vw);padding:26px 28px 28px;border-radius:16px;
max-height:78vh;overflow-y:auto;scrollbar-width:thin;
background:${C.panel};border:1px solid ${C.panelEdge};
box-shadow:0 30px 70px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);
backdrop-filter:blur(${SCREENS.panelBlurPx}px) saturate(1.1);
-webkit-backdrop-filter:blur(${SCREENS.panelBlurPx}px) saturate(1.1);
display:flex;flex-direction:column;gap:20px;
opacity:0;transform:translateX(16px) scale(.985);pointer-events:none;
transition:opacity .34s cubic-bezier(.22,.61,.36,1),transform .34s cubic-bezier(.22,.61,.36,1)}
.ht-panel.is-on{opacity:1;transform:none;pointer-events:auto}
.ht-panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.ht-panel-title{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:${C.bright}}
.ht-panel-body{display:flex;flex-direction:column;gap:18px}

.ht-field{display:flex;flex-direction:column;gap:9px}
.ht-field-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.ht-field-value{font-size:11px;letter-spacing:.08em;color:${C.text};opacity:.8}
.ht-note{font-size:10.5px;line-height:1.5;color:${C.dim}}

.ht-swatches{display:flex;flex-wrap:wrap;gap:10px}
.ht-swatch{position:relative;width:30px;height:30px;border-radius:50%;border:0;padding:0;cursor:pointer;
box-shadow:inset 0 0 0 1px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.35);
transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s ease}
.ht-swatch:hover{transform:scale(1.09)}
.ht-swatch::after{content:"";position:absolute;inset:-5px;border-radius:50%;
border:1px solid ${C.honey};opacity:0;transform:scale(.86);
transition:opacity .24s ease,transform .24s cubic-bezier(.34,1.56,.64,1)}
.ht-swatch.is-on::after{opacity:1;transform:none}
.ht-swatch:focus-visible{outline:none}
.ht-swatch:focus-visible::after{opacity:.6;transform:none}

.ht-chips{display:flex;flex-wrap:wrap;gap:8px}
.ht-chip{padding:7px 13px;border-radius:9px;cursor:pointer;
background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);
font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${C.dim};
transition:color .22s ease,border-color .22s ease,background .22s ease,transform .22s ease}
.ht-chip:hover{color:${C.text};border-color:rgba(255,255,255,.2);transform:translateY(-1px)}
.ht-chip.is-on{color:${C.ink};background:${C.pollen};border-color:${C.pollen};font-weight:600}
.ht-chip:focus-visible{outline:none;border-color:${C.honey}}

.ht-crest{display:flex;align-items:center;gap:14px}
.ht-crest svg{display:block;filter:drop-shadow(0 6px 14px rgba(0,0,0,.45))}
.ht-crest-meta{display:flex;flex-direction:column;gap:5px}
.ht-crest-name{font-size:15px;letter-spacing:.05em;color:${C.bright}}

.ht-input{width:100%;padding:11px 13px;border-radius:10px;background:rgba(0,0,0,.26);
border:1px solid rgba(255,255,255,.1);letter-spacing:.06em;
transition:border-color .22s ease,background .22s ease}
.ht-input:focus{outline:none;border-color:${C.honey};background:rgba(0,0,0,.34)}
.ht-input::placeholder{color:rgba(247,234,210,.28)}
.ht-input.ht-code{font:600 20px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.42em;
text-transform:uppercase;text-align:center;padding:14px 10px 14px 18px}
.ht-input.is-bad{border-color:${C.fail}}

.ht-range{-webkit-appearance:none;appearance:none;width:100%;height:18px;background:none;cursor:pointer}
.ht-range::-webkit-slider-runnable-track{height:3px;border-radius:3px;
background:linear-gradient(90deg,${C.honey} var(--p,50%),rgba(255,255,255,.14) var(--p,50%))}
.ht-range::-moz-range-track{height:3px;border-radius:3px;background:rgba(255,255,255,.14)}
.ht-range::-moz-range-progress{height:3px;border-radius:3px;background:${C.honey}}
.ht-range::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-5px;
border-radius:50%;background:${C.bright};box-shadow:0 1px 5px rgba(0,0,0,.5);
transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
.ht-range::-moz-range-thumb{width:13px;height:13px;border:0;border-radius:50%;background:${C.bright}}
.ht-range:hover::-webkit-slider-thumb{transform:scale(1.18)}
.ht-range:focus-visible::-webkit-slider-thumb{transform:scale(1.18);box-shadow:0 0 0 4px rgba(242,181,68,.25)}

.ht-btn{position:relative;padding:12px 22px;border-radius:11px;cursor:pointer;border:1px solid transparent;
font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
background:linear-gradient(168deg,#ffd781,${C.honey});color:${C.ink};
box-shadow:0 10px 26px rgba(155,94,12,.3);
transition:transform .2s cubic-bezier(.22,.61,.36,1),box-shadow .24s ease,opacity .24s ease,filter .24s ease}
.ht-btn:hover{transform:translateY(-1px);box-shadow:0 14px 32px rgba(155,94,12,.42);filter:brightness(1.05)}
.ht-btn:active{transform:translateY(0);box-shadow:0 6px 16px rgba(155,94,12,.3)}
.ht-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(242,181,68,.3),0 12px 28px rgba(155,94,12,.35)}
.ht-btn.is-ghost{background:none;color:${C.text};border-color:rgba(255,255,255,.16);box-shadow:none;font-weight:500}
.ht-btn.is-ghost:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.05);filter:none}
.ht-btn[disabled]{opacity:.34;cursor:default;transform:none;box-shadow:none;filter:none}
.ht-btn.is-ghost.is-set{color:${C.live};border-color:rgba(143,196,106,.4)}
.ht-btn-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}

.ht-lobby{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:32px}
.ht-card{width:min(720px,94vw);padding:32px 34px 30px;border-radius:20px;
background:${C.panel};border:1px solid ${C.panelEdge};
box-shadow:0 40px 90px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);
backdrop-filter:blur(${SCREENS.panelBlurPx}px) saturate(1.1);
-webkit-backdrop-filter:blur(${SCREENS.panelBlurPx}px) saturate(1.1);
display:flex;flex-direction:column;gap:26px;
opacity:0;transform:translateY(14px) scale(.99);
transition:opacity .5s cubic-bezier(.22,.61,.36,1),transform .5s cubic-bezier(.22,.61,.36,1)}
.ht-screen.is-on .ht-card{opacity:1;transform:none}
.ht-card-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap}
.ht-card-title{font-size:22px;font-weight:300;letter-spacing:.13em;text-transform:uppercase;color:${C.bright}}
.ht-card-sub{margin-top:7px;font-size:11px;line-height:1.5;color:${C.dim};max-width:36ch}

.ht-code-box{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.ht-code-row{display:flex;align-items:center;gap:12px}
.ht-code-value{font:300 30px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.34em;
text-indent:.34em;color:${C.pollen};text-shadow:0 4px 22px rgba(242,181,68,.28)}
.ht-code-value.is-pending{color:${C.dim};text-shadow:none}
.ht-copy{padding:8px 13px;border-radius:9px;cursor:pointer;background:rgba(255,255,255,.06);
border:1px solid rgba(255,255,255,.12);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;
color:${C.dim};transition:color .22s ease,border-color .22s ease,background .22s ease}
.ht-copy:hover{color:${C.text};border-color:rgba(255,255,255,.26)}
.ht-copy.is-done{color:${C.ink};background:${C.live};border-color:${C.live};font-weight:600}
.ht-copy[disabled]{opacity:.3;cursor:default}
.ht-slot.is-empty .ht-slot-tag{max-width:15ch;line-height:1.5}

.ht-stages{display:flex;flex-direction:column;gap:10px}
.ht-stage{display:flex;align-items:center;gap:12px;font-size:11.5px;letter-spacing:.1em;
color:${C.dim};transition:color .35s ease}
.ht-stage.is-doing{color:${C.text}}
.ht-stage.is-done{color:${C.dim}}
.ht-stage-mark{position:relative;width:14px;height:14px;border-radius:50%;flex:0 0 auto;
border:1px solid rgba(255,255,255,.16);transition:border-color .35s ease,background .35s ease}
.ht-stage.is-doing .ht-stage-mark{border-color:${C.honey}}
.ht-stage.is-doing .ht-stage-mark::after{content:"";position:absolute;inset:3px;border-radius:50%;
background:${C.honey};animation:ht-breathe 1.5s ease-in-out infinite}
.ht-stage.is-done .ht-stage-mark{border-color:rgba(143,196,106,.5);background:rgba(143,196,106,.16)}
.ht-stage.is-done .ht-stage-mark::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;
border:solid ${C.live};border-width:0 1.5px 1.5px 0;transform:rotate(42deg)}
.ht-stage-track{flex:1;height:1px;background:rgba(255,255,255,.08);overflow:hidden;border-radius:1px}
.ht-stage-fill{display:block;height:100%;width:0;background:${C.honey};opacity:.7;
transition:width .25s linear}
@keyframes ht-breathe{0%,100%{opacity:.45;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}

.ht-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.ht-slot{position:relative;padding:18px 16px;border-radius:14px;min-height:132px;
border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);
display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;text-align:center;
transition:border-color .4s ease,background .4s ease,transform .4s cubic-bezier(.22,.61,.36,1)}
.ht-slot.is-empty{border-style:dashed;border-color:rgba(255,255,255,.11)}
.ht-slot.is-filled{background:rgba(255,255,255,.055);border-color:rgba(246,201,90,.2)}
.ht-slot.is-you{border-color:rgba(246,201,90,.4);box-shadow:inset 0 0 0 1px rgba(246,201,90,.1)}
.ht-slot.just-joined{animation:ht-land .55s cubic-bezier(.22,.61,.36,1)}
@keyframes ht-land{from{opacity:0;transform:translateY(9px) scale(.97)}to{opacity:1;transform:none}}
.ht-slot-empty-mark{width:34px;height:34px;border-radius:50%;border:1px dashed rgba(255,255,255,.18);
animation:ht-breathe 2.8s ease-in-out infinite}
.ht-slot-name{font-size:13.5px;letter-spacing:.06em;color:${C.bright}}
.ht-slot-tag{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:${C.dim}}
.ht-slot-state{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.18em;
text-transform:uppercase;color:${C.dim};transition:color .35s ease}
.ht-slot-state i{width:5px;height:5px;border-radius:50%;background:currentColor;
box-shadow:0 0 7px currentColor}
.ht-slot.is-ready .ht-slot-state{color:${C.live}}

.ht-status{display:flex;align-items:center;gap:9px;font-size:10.5px;letter-spacing:.16em;
text-transform:uppercase;color:${C.dim};transition:color .35s ease}
.ht-status i{width:6px;height:6px;border-radius:50%;background:currentColor;flex:0 0 auto;
box-shadow:0 0 8px currentColor}
.ht-status.is-connecting{color:${C.warn}}
.ht-status.is-connecting i{animation:ht-breathe 1.3s ease-in-out infinite}
.ht-status.is-live{color:${C.live}}
.ht-status.is-fail{color:${C.fail}}
.ht-fail{font-size:11.5px;line-height:1.55;color:${C.text};opacity:.9;max-width:52ch}
.ht-card-foot{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;
padding-top:22px;border-top:1px solid rgba(255,255,255,.07)}
.ht-foot-note{font-size:10.5px;line-height:1.5;color:${C.dim};max-width:38ch}

@media (max-width:900px){
.ht-menu{flex-direction:column;align-items:flex-start;justify-content:center;gap:26px}
.ht-menu-col{width:min(400px,86vw)}
.ht-panel{width:min(400px,86vw)}
.ht-slots{grid-template-columns:1fr}
.ht-foot{display:none}}
@media (prefers-reduced-motion:reduce){
.ht-screen *,.ht-screen{transition-duration:.01ms!important;animation:none!important}}
`;

let injected = false;

export function injectScreenStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'ht-screens';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

export function queenCrest(color, pattern, size) {
  const s = size || 64;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(s));
  svg.setAttribute('height', String(s));
  const make = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    for (const key in attrs) node.setAttribute(key, String(attrs[key]));
    svg.appendChild(node);
    return node;
  };
  make('circle', { cx: 32, cy: 32, r: 30, fill: 'rgba(0,0,0,.28)' });
  make('circle', { cx: 32, cy: 32, r: 30, fill: 'none', stroke: color.hex, 'stroke-opacity': .45 });
  make('ellipse', { cx: 22, cy: 24, rx: 13, ry: 8, fill: '#ffffff', 'fill-opacity': .17,
    transform: 'rotate(-24 22 24)' });
  make('ellipse', { cx: 24, cy: 34, rx: 11, ry: 7, fill: '#ffffff', 'fill-opacity': .12,
    transform: 'rotate(16 24 34)' });
  make('ellipse', { cx: 36, cy: 34, rx: 15, ry: 10.5, fill: color.hex });
  make('ellipse', { cx: 23.5, cy: 30, rx: 7.5, ry: 7.5, fill: color.trim });
  make('circle', { cx: 20, cy: 28.5, r: 2.1, fill: '#120b04' });
  if (pattern.id === 'banded') {
    make('path', { d: 'M32 25.5 L32 42.5', stroke: color.trim, 'stroke-width': 4.4, 'stroke-linecap': 'round' });
    make('path', { d: 'M40 26.5 L40 41.5', stroke: color.trim, 'stroke-width': 4.4, 'stroke-linecap': 'round' });
  } else if (pattern.id === 'dusted') {
    make('circle', { cx: 33, cy: 30, r: 2.1, fill: color.trim });
    make('circle', { cx: 39, cy: 36, r: 2.1, fill: color.trim });
    make('circle', { cx: 43, cy: 30.5, r: 1.6, fill: color.trim });
    make('circle', { cx: 35, cy: 38, r: 1.6, fill: color.trim });
  } else if (pattern.id === 'sable') {
    make('path', { d: 'M43 27 A15 10.5 0 0 1 43 41 Z', fill: color.trim, 'fill-opacity': .95 });
  } else {
    make('path', { d: 'M15 21 l3.5 4 3.5-5 3.5 5 3.5-4 -1.5 6 h-11 Z', fill: '#ffe6a8' });
    make('path', { d: 'M34 26 L34 42', stroke: color.trim, 'stroke-width': 4, 'stroke-linecap': 'round' });
  }
  return svg;
}
