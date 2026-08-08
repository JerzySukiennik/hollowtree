// Hollowtree — gameplay overlay: basket meter, resource bank and the contextual prompt, kept off the meadow when idle.

import { HUD, GATHER } from '../config.js';

// Honey has no row of its own until the comb can make it: the row unlocks the moment a
// honey store exists, which is the same moment the number stops being zero forever.
const ROWS = [
  { kind: 'pollen', label: 'pollen', color: HUD.colors.pollen },
  { kind: 'nectar', label: 'nectar', color: HUD.colors.nectar },
  { kind: 'resin', label: 'resin', color: HUD.colors.resin },
  { kind: 'honey', label: 'honey', color: HUD.colors.honey, needsCapacity: true },
];

const CSS = `
.ht-hud{position:fixed;inset:0;z-index:4;pointer-events:none;color:${HUD.colors.text};
font:500 13px/1.2 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1,"lnum" 1;-webkit-font-smoothing:antialiased;opacity:0;
transition:opacity .5s cubic-bezier(.22,.61,.36,1)}
.ht-hud.is-on{opacity:1}
.ht-scrim{position:absolute;left:0;right:0;bottom:0;height:210px;
background:linear-gradient(to top,rgba(24,16,9,.42),rgba(24,16,9,.16) 42%,transparent);
opacity:0;transition:opacity .6s ease}
.ht-hud.is-on .ht-scrim{opacity:1}
.ht-label{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;
color:${HUD.colors.dim};text-shadow:0 1px 3px rgba(0,0,0,.55)}

.ht-center{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);
display:flex;flex-direction:column;align-items:center;gap:9px;width:280px}
.ht-prompt{height:16px;position:relative;width:100%;display:flex;justify-content:center}
.ht-prompt span{position:absolute;white-space:nowrap;font-size:11px;letter-spacing:.19em;
text-transform:uppercase;text-shadow:0 1px 5px rgba(0,0,0,.75);
transition:opacity .28s ease,transform .28s cubic-bezier(.22,.61,.36,1)}
.ht-prompt span.out{opacity:0;transform:translateY(5px)}
.ht-prompt span em{font-style:normal;color:${HUD.colors.pollen}}

.ht-basket{width:100%;display:flex;flex-direction:column;gap:6px;
opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s cubic-bezier(.22,.61,.36,1)}
.ht-basket.is-on{opacity:1;transform:none}
.ht-basket-head{display:flex;justify-content:space-between;align-items:baseline}
.ht-basket-value{font-size:10.5px;letter-spacing:.1em;color:${HUD.colors.text};
text-shadow:0 1px 3px rgba(0,0,0,.6);opacity:.82}
.ht-track{position:relative;height:4px;border-radius:3px;overflow:hidden;
background:rgba(255,255,255,.15);box-shadow:0 1px 2px rgba(0,0,0,.4),inset 0 0 0 .5px rgba(255,255,255,.1)}
.ht-fill{position:absolute;inset:0;width:0;border-radius:3px;transform-origin:left center;
background:linear-gradient(90deg,${HUD.colors.nectar},${HUD.colors.pollen} 68%,#ffeec2);
box-shadow:0 0 9px rgba(246,201,90,.5)}
.ht-sheen{position:absolute;top:0;bottom:0;width:34%;opacity:0;
background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)}
.ht-basket.is-active .ht-sheen{opacity:1;animation:ht-sweep 1.15s linear infinite}
.ht-basket.is-full .ht-fill{background:linear-gradient(90deg,#ffd27a,#fff2cf);
box-shadow:0 0 14px rgba(255,224,160,.75)}
.ht-basket.is-full .ht-track{box-shadow:0 0 0 1px rgba(255,224,160,.35),0 1px 2px rgba(0,0,0,.4)}
@keyframes ht-sweep{from{transform:translateX(-120%)}to{transform:translateX(400%)}}

.ht-bloom{display:flex;align-items:center;gap:7px;height:11px;opacity:0;
transition:opacity .3s ease}
.ht-bloom.is-on{opacity:1}
.ht-bloom-name{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:${HUD.colors.dim}}
.ht-bloom-track{width:46px;height:2px;border-radius:2px;background:rgba(255,255,255,.16);overflow:hidden}
.ht-bloom-fill{height:100%;width:0;border-radius:2px;background:${HUD.colors.pollen};opacity:.8}

.ht-bank{position:absolute;right:26px;bottom:26px;display:flex;flex-direction:column;
align-items:flex-end;gap:7px}
.ht-row{display:flex;align-items:center;gap:9px;transition:opacity .4s ease}
.ht-row-name{width:52px;text-align:right}
.ht-dot{width:5px;height:5px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 6px currentColor}
.ht-row-value{min-width:38px;text-align:right;font-size:15px;font-weight:600;
letter-spacing:.01em;text-shadow:0 1px 4px rgba(0,0,0,.66);
transition:transform .22s cubic-bezier(.34,1.56,.64,1),color .5s ease}
.ht-row-cap{width:34px;text-align:left;font-size:9.5px;letter-spacing:.06em;
color:${HUD.colors.dim};text-shadow:0 1px 3px rgba(0,0,0,.55)}
.ht-row.is-brimming .ht-row-cap{color:#ffb27a}
.ht-row.is-locked{opacity:.32}
.ht-row.is-locked .ht-row-value{font-weight:500}
.ht-row.is-gain .ht-row-value{transform:translateY(-2px) scale(1.09)}
@media (prefers-reduced-motion:reduce){
.ht-hud *,.ht-hud{transition-duration:.01ms!important;animation:none!important}}
`;

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

export function createHud() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'ht-hud');
  el('div', 'ht-scrim', root);

  const center = el('div', 'ht-center', root);
  const prompt = el('div', 'ht-prompt', center);
  const promptA = el('span', 'out', prompt);
  const promptB = el('span', 'out', prompt);

  const basket = el('div', 'ht-basket', center);
  const head = el('div', 'ht-basket-head', basket);
  const headLabel = el('div', 'ht-label', head);
  headLabel.textContent = 'baskets';
  const headValue = el('div', 'ht-basket-value', head);
  headValue.textContent = '0%';
  const track = el('div', 'ht-track', basket);
  const fill = el('div', 'ht-fill', track);
  el('div', 'ht-sheen', track);

  const bloom = el('div', 'ht-bloom', center);
  const bloomName = el('div', 'ht-bloom-name', bloom);
  const bloomTrack = el('div', 'ht-bloom-track', bloom);
  const bloomFill = el('div', 'ht-bloom-fill', bloomTrack);

  const bank = el('div', 'ht-bank', root);
  const rows = [];
  for (const spec of ROWS) {
    const locked = Boolean(spec.needsCapacity);
    const row = el('div', `ht-row${locked ? ' is-locked' : ''}`, bank);
    const name = el('div', 'ht-label ht-row-name', row);
    name.textContent = spec.label;
    const dot = el('i', 'ht-dot', row);
    dot.style.background = spec.color;
    dot.style.color = spec.color;
    const value = el('div', 'ht-row-value', row);
    value.style.color = locked ? HUD.colors.dim : HUD.colors.text;
    value.textContent = locked ? '—' : '0';
    const cap = el('div', 'ht-row-cap', row);
    cap.textContent = '';
    rows.push({ spec, row, value, cap, shown: 0, target: 0, pulse: 0, locked });
  }

  document.body.appendChild(root);

  let visible = false;
  let idle = 0;
  let barShown = 0;
  let bloomShown = 0;
  let front = promptA;
  let back = promptB;
  let currentText = '';
  let override = null;

  function swapPrompt(text) {
    if (text === currentText) return;
    currentText = text;
    const next = back;
    back = front;
    front = next;
    back.classList.add('out');
    if (!text) return;
    front.innerHTML = text;
    front.classList.add('out');
    void front.offsetWidth;
    front.classList.remove('out');
  }

  function setPrompt(text) {
    override = text || null;
  }

  function copyFor(hint) {
    if (!hint) return '';
    const text = HUD.copy[hint];
    if (!text) return '';
    return text.replace(/\bE\b/, '<em>E</em>');
  }

  function update(dt, model) {
    if (!model) return;
    const step = Math.min(dt || 0, 0.1);
    const g = model.gather || model;
    const res = model.resources || model.bank || {};

    const fillTarget = typeof g.fill === 'number'
      ? g.fill
      : Math.min(1, (g.load || 0) / (g.capacity || GATHER.basketCapacity));
    const kb = 1 - Math.exp(-HUD.barResponse * step);
    barShown += (fillTarget - barShown) * kb;
    fill.style.width = `${(barShown * 100).toFixed(2)}%`;
    headValue.textContent = `${Math.round(barShown * 100)}%`;

    const showBar = fillTarget > 0.001 || g.active || g.nearFlower;
    basket.classList.toggle('is-on', Boolean(showBar));
    basket.classList.toggle('is-active', Boolean(g.active));
    basket.classList.toggle('is-full', Boolean(g.full));

    const target = g.target;
    const showBloom = Boolean(target) && Boolean(g.nearFlower);
    bloom.classList.toggle('is-on', showBloom);
    if (showBloom) {
      if (bloomName.textContent !== target.species.name) bloomName.textContent = target.species.name;
      bloomShown += ((target.ratio || 0) - bloomShown) * kb;
    } else {
      bloomShown += (0 - bloomShown) * kb;
    }
    bloomFill.style.width = `${(bloomShown * 100).toFixed(1)}%`;

    const caps = model.capacity || null;
    for (const row of rows) {
      const kind = row.spec.kind;
      const cap = caps && typeof caps[kind] === 'number' ? caps[kind] : null;
      // A store the nest cannot hold yet stays greyed out rather than reading a false zero.
      const locked = row.spec.needsCapacity ? !(cap > 0) : false;
      if (locked !== row.locked) {
        row.locked = locked;
        row.row.classList.toggle('is-locked', locked);
        row.value.style.color = locked ? HUD.colors.dim : HUD.colors.text;
        if (locked) row.value.textContent = '—';
      }
      if (locked) { row.cap.textContent = ''; continue; }
      const next = typeof res[kind] === 'number' ? res[kind] : row.target;
      if (next > row.target + 1e-4) {
        row.pulse = HUD.pulseDuration;
        row.row.classList.add('is-gain');
      }
      row.target = next;
      const kc = 1 - Math.exp(-HUD.counterResponse * step);
      row.shown += (row.target - row.shown) * kc;
      if (Math.abs(row.target - row.shown) < 0.02) row.shown = row.target;
      const text = String(Math.round(row.shown));
      if (row.value.textContent !== text) row.value.textContent = text;
      const capText = cap === null ? '' : `/${Math.round(cap)}`;
      if (row.cap.textContent !== capText) row.cap.textContent = capText;
      row.row.classList.toggle('is-brimming', cap !== null && cap > 0 && row.target >= cap - 0.5);
      if (row.pulse > 0) {
        row.pulse -= step;
        if (row.pulse <= 0) row.row.classList.remove('is-gain');
      }
    }

    const hint = override || copyFor(g.hint);
    swapPrompt(hint);

    const busy = Boolean(hint) || showBar || (g.load || 0) > 0.001;
    idle = busy ? 0 : idle + step;
    const wanted = busy || idle < HUD.idleHideDelay;
    if (wanted !== visible) {
      visible = wanted;
      root.classList.toggle('is-on', visible);
    }
  }

  return {
    root,
    update,
    setPrompt,
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
