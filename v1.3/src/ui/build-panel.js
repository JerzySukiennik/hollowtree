// Hollowtree — build panel: the type picker, what each cell costs, and what the spot
// under the cursor would give you. Opened with the build key, never resident on screen.
//
// Every readout here used to be compressed to the width of the panel: costs were bare
// coloured numbers (`2 4`), stores were `40p · 40n · 40r · 0h`, and the swarm line was
// `0 · 0.0/min`. All three are legible only to someone who already knows the game. They
// are now labelled in words, the panel is a little wider to pay for it, and the long-form
// explanation of every cell lives one key away on the recipe board.

import { HUD } from '../config.js';
import { CELL_TYPES, COST_KINDS } from '../config.comb.js';
import { createRecipeBoard } from './recipe-board.js';
import { KIND_COLOR, KIND_LABEL, costPhrase } from './resource-sources.js';

// The board is a first-run teacher as well as a reference: the first time a player ever
// opens build mode it opens with it, because a player who does not know the board exists
// cannot decide to press its key.
const SEEN_KEY = 'hollowtree.recipeBoard.seen';
const BOARD_KEY = 'KeyR';

function seenBoard() {
  try { return window.localStorage.getItem(SEEN_KEY) === '1'; } catch (error) { return true; }
}

function markBoardSeen() {
  try { window.localStorage.setItem(SEEN_KEY, '1'); } catch (error) { /* private mode */ }
}

const CSS = `
.ht-build{position:fixed;left:26px;top:50%;transform:translateY(-50%) translateX(-12px);z-index:6;
width:272px;color:${HUD.colors.text};opacity:0;pointer-events:none;
font:500 12px/1.45 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1,"lnum" 1;-webkit-font-smoothing:antialiased;
transition:opacity .26s ease,transform .32s cubic-bezier(.22,.61,.36,1)}
.ht-build.is-on{opacity:1;transform:translateY(-50%) translateX(0);pointer-events:auto}
.ht-build-card{background:rgba(26,18,10,.62);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);
border:.5px solid rgba(246,201,90,.16);border-radius:13px;padding:13px 13px 11px;
box-shadow:0 12px 34px rgba(0,0,0,.42);
max-height:calc(100vh - 28px);overflow-y:auto;scrollbar-width:thin}
.ht-build-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.ht-build-title{font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:${HUD.colors.dim}}
.ht-build-count{font-size:9.5px;letter-spacing:.12em;color:${HUD.colors.dim}}
.ht-build-legend{display:flex;gap:9px;align-items:center;margin:0 0 8px 1px;
font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${HUD.colors.dim}}
.ht-build-legend span{display:flex;align-items:center;gap:4px}
.ht-build-legend i{width:5px;height:5px;border-radius:50%;box-shadow:0 0 6px currentColor}
.ht-type{display:flex;align-items:center;gap:8px;padding:4px 7px;border-radius:8px;cursor:pointer;
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
.ht-build-cost{font-size:11px;line-height:1.45;margin-bottom:4px}
.ht-build-cost b{font-weight:700}
.ht-build-blurb{font-size:10.5px;color:${HUD.colors.dim};min-height:24px}
.ht-build-line{display:flex;justify-content:space-between;gap:10px;font-size:10.5px;margin-top:5px}
.ht-build-line span:first-child{color:${HUD.colors.dim};white-space:nowrap}
.ht-build-line span:last-child{color:${HUD.colors.text};text-align:right}
.ht-build-sub{margin-top:8px;padding-top:7px;border-top:.5px solid rgba(247,234,210,.08)}
.ht-build-subhead{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:${HUD.colors.dim};
margin-bottom:4px}
.ht-build-store{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}
.ht-build-store div{display:flex;justify-content:space-between;gap:6px;font-size:10.5px}
.ht-build-store div span:first-child{color:${HUD.colors.dim}}
.ht-build-status{margin-top:8px;font-size:10.5px;letter-spacing:.05em;min-height:14px}
.ht-build-status.is-bad{color:#ff9b8c}
.ht-build-status.is-good{color:#a8e8b4}
.ht-build-recipes{display:block;width:100%;margin-top:9px;padding:8px 10px;border-radius:9px;
cursor:pointer;background:rgba(246,201,90,.12);border:.5px solid rgba(246,201,90,.3);
font:inherit;font-size:9.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;
color:#ffe6a8;text-align:center;
transition:background .2s ease,border-color .2s ease,color .2s ease}
.ht-build-recipes:hover{background:rgba(246,201,90,.2);border-color:rgba(246,201,90,.5);color:#fff3d8}
.ht-build-keys{margin-top:8px;font-size:9px;line-height:1.7;letter-spacing:.13em;
text-transform:uppercase;color:${HUD.colors.dim}}
@media (prefers-reduced-motion:reduce){.ht-build,.ht-build *{transition-duration:.01ms!important}}
`;

function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

// The picker row stays compact — the legend above it says which colour is which resource,
// and the selected cell's cost is spelled out in words in the footer.
function costText(cost) {
  const parts = [];
  for (const kind of COST_KINDS) {
    const value = cost[kind] || 0;
    if (value > 0) parts.push(`<b style="color:${KIND_COLOR[kind]}">${value}</b>`);
  }
  return parts.join(' ') || '<b>free</b>';
}

function costHtml(cost) {
  const parts = [];
  for (const kind of COST_KINDS) {
    const value = (cost && cost[kind]) || 0;
    if (value > 0) parts.push(`<b style="color:${KIND_COLOR[kind]}">${value}</b> ${KIND_LABEL[kind]}`);
  }
  return parts.length ? `costs ${parts.join(' + ')}` : 'costs nothing';
}

export function createBuildPanel(handlers) {
  const on = handlers || {};
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'ht-build');
  const card = el('div', 'ht-build-card', root);
  const head = el('div', 'ht-build-head', card);
  el('div', 'ht-build-title', head, 'build');
  const count = el('div', 'ht-build-count', head);

  const legend = el('div', 'ht-build-legend', card);
  for (const kind of COST_KINDS) {
    const item = el('span', null, legend);
    const dot = el('i', null, item);
    dot.style.background = KIND_COLOR[kind];
    dot.style.color = KIND_COLOR[kind];
    item.appendChild(document.createTextNode(KIND_LABEL[kind]));
  }

  const rows = new Map();
  for (const type of CELL_TYPES) {
    const row = el('div', 'ht-type', card);
    const swatch = el('i', 'ht-swatch', row);
    const hex = `#${type.color.toString(16).padStart(6, '0')}`;
    swatch.style.background = hex;
    swatch.style.color = hex;
    const name = el('div', 'ht-type-name', row, type.name);
    const cost = el('div', 'ht-type-cost', row);
    cost.innerHTML = costText(type.cost);
    row.title = `${type.name} — costs ${costPhrase(type.cost)}`;
    row.addEventListener('click', () => {
      if (typeof on.onSelect === 'function') on.onSelect(type.id);
    });
    rows.set(type.id, { type, row, name, cost, locked: null, selected: null, poor: null });
  }

  const foot = el('div', 'ht-build-foot', card);
  const costLine = el('div', 'ht-build-cost', foot);
  const blurb = el('div', 'ht-build-blurb', foot);
  const bonusLine = el('div', 'ht-build-line', foot);
  const bonusLabel = el('span', null, bonusLine);
  const bonusValue = el('span', null, bonusLine);

  const sub = el('div', 'ht-build-sub', foot);
  el('div', 'ht-build-subhead', sub, 'room left in your stores');
  const storeGrid = el('div', 'ht-build-store', sub);
  const storeCells = {};
  for (const kind of ['pollen', 'nectar', 'resin', 'honey']) {
    const cellEl = el('div', null, storeGrid);
    el('span', null, cellEl, KIND_LABEL[kind]);
    storeCells[kind] = el('span', null, cellEl, '0');
  }

  const swarmLine = el('div', 'ht-build-line', foot);
  el('span', null, swarmLine, 'bees your hive can house');
  const swarmValue = el('span', null, swarmLine);
  const honeyLine = el('div', 'ht-build-line', foot);
  el('span', null, honeyLine, 'honey made per minute');
  const honeyValue = el('span', null, honeyLine);

  const status = el('div', 'ht-build-status', foot);

  const board = createRecipeBoard();
  const recipes = el('button', 'ht-build-recipes', foot, 'recipe board — press R');
  recipes.addEventListener('click', () => board.toggle());

  const keys = el('div', 'ht-build-keys', foot);
  // Spelled out, not abbreviated: "LMB / RMB" is exactly the sort of shorthand that made
  // this legend unreadable to someone who has never seen it written that way.
  keys.textContent = 'Q or E — pick a cell · left click — build it · right click — tear it down · Tab — close';

  document.body.appendChild(root);

  let shown = false;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function setHtml(node, html) {
    if (node.dataset.html !== html) {
      node.dataset.html = html;
      node.innerHTML = html;
    }
  }

  function update(state, comb) {
    if (!comb) return;
    const effects = comb.effects;
    setText(count, `${effects.doneCount}${effects.buildingCount ? ` +${effects.buildingCount}` : ''} cells built`);

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
    setHtml(costLine, type ? costHtml(type.type.cost) : '');
    setText(blurb, type ? type.type.blurb : '');

    const bonus = state.bonus;
    setText(bonusLabel, bonus && bonus.id ? `${bonus.label} bonus here` : 'bonus from neighbours');
    setText(bonusValue, bonus && bonus.id
      ? `${bonus.count} next to it · +${Math.round(bonus.value * 100)}%`
      : 'none here');

    // "room left in your stores" has to be capacity MINUS what is already in them. It printed
    // raw capacity, so the panel said `pollen 40` while the HUD said `18 /40` — the label was
    // simply false. The bank is the truth for the three gathered kinds; honey lives in the comb.
    const cap = effects.capacity;
    const bank = comb && comb.bankSnapshot ? comb.bankSnapshot() : null;
    const held = {
      pollen: bank ? bank.pollen : 0,
      nectar: bank ? bank.nectar : 0,
      resin: bank ? bank.resin : 0,
      honey: comb ? comb.honey : 0,
    };
    for (const kind of ['pollen', 'nectar', 'resin', 'honey']) {
      const room = Math.max(0, (cap[kind] || 0) - (held[kind] || 0));
      setText(storeCells[kind], String(Math.round(room)));
    }
    setText(swarmValue, `${effects.swarmCap} bees`);
    setText(honeyValue, (effects.convertRate * 60).toFixed(1));

    let text = '';
    let good = false;
    if (state.message) text = state.message;
    else if (state.valid) { text = 'ready — left click to build'; good = true; }
    else if (state.reasonText || state.reason) text = state.reasonText || state.reason;
    setText(status, text);
    status.classList.toggle('is-bad', Boolean(text) && !good);
    status.classList.toggle('is-good', good);
  }

  // R toggles the board while build mode is open. Escape closes the board first — this
  // listener is registered before src/nest/build-mode.js binds its own (main.js builds the
  // panel before the build mode), so stopping propagation here means one Escape does not
  // both close the board and drop the player out of build mode.
  function onKeyDown(event) {
    if (!shown || event.repeat) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const node = event.target || document.activeElement;
    if (node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName || ''))) return;
    if (event.code === BOARD_KEY) {
      event.preventDefault();
      board.toggle();
      markBoardSeen();
      return;
    }
    if (event.code === 'Escape' && board.visible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      board.hide();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  function show() {
    if (shown) return;
    shown = true;
    root.classList.add('is-on');
    if (!seenBoard()) {
      markBoardSeen();
      board.show();
    }
  }

  function hide() {
    if (!shown) return;
    shown = false;
    root.classList.remove('is-on');
    board.hide();
  }

  return {
    root,
    board,
    update,
    show,
    hide,
    get visible() { return shown; },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      board.dispose();
      root.remove();
      style.remove();
    },
  };
}
