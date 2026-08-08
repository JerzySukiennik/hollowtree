// Hollowtree — build panel: the type picker, what each cell costs, and what the spot
// under the cursor would give you. Opened with the build key, never resident on screen.

import { HUD } from '../config.js';
import { CELL_TYPES } from '../config.comb.js';

const KIND_COLOR = {
  pollen: HUD.colors.pollen,
  nectar: HUD.colors.nectar,
  resin: HUD.colors.resin,
  honey: HUD.colors.honey,
};

const CSS = `
.ht-build{position:fixed;left:26px;top:50%;transform:translateY(-50%) translateX(-12px);z-index:6;
width:264px;color:${HUD.colors.text};opacity:0;pointer-events:none;
font:500 12px/1.45 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1,"lnum" 1;-webkit-font-smoothing:antialiased;
transition:opacity .26s ease,transform .32s cubic-bezier(.22,.61,.36,1)}
.ht-build.is-on{opacity:1;transform:translateY(-50%) translateX(0);pointer-events:auto}
.ht-build-card{background:rgba(26,18,10,.62);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);
border:.5px solid rgba(246,201,90,.16);border-radius:13px;padding:13px 13px 11px;
box-shadow:0 12px 34px rgba(0,0,0,.42)}
.ht-build-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px}
.ht-build-title{font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:${HUD.colors.dim}}
.ht-build-count{font-size:9.5px;letter-spacing:.12em;color:${HUD.colors.dim}}
.ht-type{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:8px;cursor:pointer;
transition:background .18s ease,opacity .18s ease}
.ht-type:hover{background:rgba(255,255,255,.05)}
.ht-type.is-sel{background:rgba(246,201,90,.13);box-shadow:inset 0 0 0 .5px rgba(246,201,90,.3)}
.ht-type.is-locked{opacity:.3;cursor:default}
.ht-type.is-poor .ht-type-cost{color:#ff9b8c}
.ht-swatch{width:9px;height:9px;border-radius:2.5px;flex:0 0 auto;box-shadow:0 0 7px currentColor}
.ht-type-name{flex:1 1 auto;font-size:11.5px;letter-spacing:.02em;white-space:nowrap;
overflow:hidden;text-overflow:ellipsis}
.ht-type-cost{display:flex;gap:6px;font-size:10.5px;color:${HUD.colors.dim};white-space:nowrap}
.ht-type-cost b{font-weight:600}
.ht-build-foot{margin-top:9px;padding-top:8px;border-top:.5px solid rgba(247,234,210,.12)}
.ht-build-blurb{font-size:10.5px;color:${HUD.colors.dim};min-height:28px}
.ht-build-line{display:flex;justify-content:space-between;font-size:10.5px;margin-top:5px}
.ht-build-line span:last-child{color:${HUD.colors.text}}
.ht-build-status{margin-top:7px;font-size:10.5px;letter-spacing:.05em;min-height:14px}
.ht-build-status.is-bad{color:#ff9b8c}
.ht-build-status.is-good{color:#a8e8b4}
.ht-build-keys{margin-top:8px;font-size:9px;letter-spacing:.16em;text-transform:uppercase;
color:${HUD.colors.dim}}
@media (prefers-reduced-motion:reduce){.ht-build,.ht-build *{transition-duration:.01ms!important}}
`;

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function costText(cost) {
  const parts = [];
  for (const kind of ['pollen', 'nectar', 'resin']) {
    const value = cost[kind] || 0;
    if (value > 0) parts.push(`<b style="color:${KIND_COLOR[kind]}">${value}</b>`);
  }
  return parts.join(' ') || '<b>free</b>';
}

export function createBuildPanel(handlers) {
  const on = handlers || {};
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'ht-build');
  const card = el('div', 'ht-build-card', root);
  const head = el('div', 'ht-build-head', card);
  const title = el('div', 'ht-build-title', head);
  title.textContent = 'build';
  const count = el('div', 'ht-build-count', head);

  const rows = new Map();
  for (const type of CELL_TYPES) {
    const row = el('div', 'ht-type', card);
    const swatch = el('i', 'ht-swatch', row);
    const hex = `#${type.color.toString(16).padStart(6, '0')}`;
    swatch.style.background = hex;
    swatch.style.color = hex;
    const name = el('div', 'ht-type-name', row);
    name.textContent = type.name;
    const cost = el('div', 'ht-type-cost', row);
    cost.innerHTML = costText(type.cost);
    row.addEventListener('click', () => {
      if (typeof on.onSelect === 'function') on.onSelect(type.id);
    });
    rows.set(type.id, { type, row, name, cost, locked: null, selected: null, poor: null });
  }

  const foot = el('div', 'ht-build-foot', card);
  const blurb = el('div', 'ht-build-blurb', foot);
  const bonusLine = el('div', 'ht-build-line', foot);
  const bonusLabel = el('span', null, bonusLine);
  const bonusValue = el('span', null, bonusLine);
  const storeLine = el('div', 'ht-build-line', foot);
  const storeLabel = el('span', null, storeLine);
  storeLabel.textContent = 'stores';
  const storeValue = el('span', null, storeLine);
  const swarmLine = el('div', 'ht-build-line', foot);
  const swarmLabel = el('span', null, swarmLine);
  swarmLabel.textContent = 'brood / ripening';
  const swarmValue = el('span', null, swarmLine);
  const status = el('div', 'ht-build-status', foot);
  const keys = el('div', 'ht-build-keys', foot);
  // Tab is the binding the player is told about; B still works as a secondary key, but
  // naming it here is what made the legend wrong after the toggle moved off B.
  keys.textContent = 'Q E type · LMB place · RMB tear down · Tab close';

  document.body.appendChild(root);

  let shown = false;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function update(state, comb) {
    if (!comb) return;
    const effects = comb.effects;
    setText(count, `${effects.doneCount}${effects.buildingCount ? ` +${effects.buildingCount}` : ''} cells`);

    for (const [id, entry] of rows) {
      const locked = !comb.typeUnlocked(id);
      if (entry.locked !== locked) {
        entry.locked = locked;
        entry.row.classList.toggle('is-locked', locked);
      }
      const selected = state.typeId === id;
      if (entry.selected !== selected) {
        entry.selected = selected;
        entry.row.classList.toggle('is-sel', selected);
      }
      const poor = !comb.affordable(id);
      if (entry.poor !== poor) {
        entry.poor = poor;
        entry.row.classList.toggle('is-poor', poor);
      }
    }

    const type = rows.get(state.typeId);
    setText(blurb, type ? type.type.blurb : '');

    const bonus = state.bonus;
    setText(bonusLabel, bonus && bonus.id ? bonus.label : 'adjacency');
    setText(bonusValue, bonus && bonus.id
      ? `${bonus.count} · +${Math.round(bonus.value * 100)}%`
      : '—');

    const cap = effects.capacity;
    setText(storeValue, `${Math.round(cap.pollen)}p · ${Math.round(cap.nectar)}n · ${Math.round(cap.resin)}r · ${Math.round(cap.honey)}h`);
    setText(swarmValue, `${effects.swarmCap} · ${(effects.convertRate * 60).toFixed(1)}/min`);

    let text = '';
    let good = false;
    if (state.message) text = state.message;
    else if (state.valid) { text = 'ready'; good = true; }
    else if (state.reasonText || state.reason) text = state.reasonText || state.reason;
    setText(status, text);
    status.classList.toggle('is-bad', Boolean(text) && !good);
    status.classList.toggle('is-good', good);
  }

  function show() {
    if (shown) return;
    shown = true;
    root.classList.add('is-on');
  }

  function hide() {
    if (!shown) return;
    shown = false;
    root.classList.remove('is-on');
  }

  return {
    root,
    update,
    show,
    hide,
    get visible() { return shown; },
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
