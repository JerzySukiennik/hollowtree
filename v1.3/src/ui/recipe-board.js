// Hollowtree — the recipe board: every buildable cell, in words, on one screen.
//
// The build panel is a picker — it has room for a name and a couple of coloured numbers,
// and that is all it ever showed. A player who has never been told that `2 4` next to
// "honey store" means two pollen and four resin cannot learn it from the picker, because
// the picker never spells it out anywhere.
//
// So the board is the one screen that is allowed to be long and literal. Everything on it
// is generated from CELL_TYPES / COMB_TUNING, so it cannot drift from the game: change a
// cost in config.comb.js and the board changes with it. Nothing here is hand-copied.

import { CELL_TYPES, COMB_TUNING, COST_KINDS } from '../config.comb.js';
import { HUD, SCREENS } from '../config.js';
import {
  KIND_COLOR, KIND_LABEL, costPhrase, flowersFor, bandLabel,
} from './resource-sources.js';

const C = SCREENS.colors;

const CSS = `
/* bottom clears the HUD's resource bank (right:26px, bottom:26px, four rows) so the
   pollen line is never hidden behind the board. */
.ht-recipes{position:fixed;left:306px;right:24px;top:22px;bottom:128px;z-index:9;
color:${HUD.colors.text};opacity:0;pointer-events:none;
font:500 12px/1.5 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1,"lnum" 1;-webkit-font-smoothing:antialiased;
transition:opacity .24s ease}
.ht-recipes.is-on{opacity:1;pointer-events:auto}
.ht-recipes-card{height:100%;display:flex;flex-direction:column;
background:rgba(24,17,9,.86);backdrop-filter:blur(18px) saturate(1.08);
-webkit-backdrop-filter:blur(18px) saturate(1.08);
border:.5px solid ${C.panelEdge};border-radius:16px;
box-shadow:0 26px 64px rgba(0,0,0,.55)}

.ht-recipes-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;
padding:17px 22px 13px;border-bottom:.5px solid rgba(247,234,210,.1)}
.ht-recipes-title{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:${C.bright}}
.ht-recipes-sub{flex:1 1 auto;font-size:10.5px;line-height:1.5;color:${C.dim};letter-spacing:.02em}
.ht-recipes-close{flex:0 0 auto;padding:6px 12px;border-radius:8px;cursor:pointer;
background:rgba(255,255,255,.05);border:.5px solid rgba(255,255,255,.13);
font:inherit;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:${C.dim};
transition:color .2s ease,border-color .2s ease,background .2s ease}
.ht-recipes-close:hover{color:${C.text};border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.08)}

.ht-recipes-body{flex:1 1 auto;overflow-y:auto;padding:16px 22px 20px;
scrollbar-width:thin;scrollbar-color:rgba(246,201,90,.32) transparent}
.ht-recipes-body::-webkit-scrollbar{width:8px}
.ht-recipes-body::-webkit-scrollbar-thumb{background:rgba(246,201,90,.28);border-radius:8px}

.ht-rsec{margin-bottom:18px}
.ht-rsec:last-child{margin-bottom:0}
.ht-rsec-head{display:flex;align-items:baseline;gap:11px;margin-bottom:9px}
.ht-rsec-title{font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:${C.honey}}
.ht-rsec-note{font-size:10px;color:${C.dim}}
.ht-rsec-rule{flex:1 1 auto;height:1px;background:linear-gradient(90deg,rgba(242,181,68,.34),rgba(242,181,68,0))}

.ht-rgrid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(258px,1fr))}
.ht-rcard{padding:12px 13px 11px;border-radius:11px;
background:rgba(255,255,255,.035);border:.5px solid rgba(255,255,255,.08)}
.ht-rcard-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.ht-rcard-swatch{width:9px;height:9px;border-radius:2.5px;flex:0 0 auto;box-shadow:0 0 8px currentColor}
.ht-rcard-name{flex:1 1 auto;font-size:12.5px;letter-spacing:.02em;color:${C.bright}}
.ht-rcard-time{font-size:9.5px;letter-spacing:.06em;color:${C.dim};white-space:nowrap}
.ht-rcard-cost{font-size:11px;margin-bottom:7px;color:${HUD.colors.text}}
.ht-rcard-cost b{font-weight:700}
.ht-rline{display:flex;gap:8px;font-size:10.5px;line-height:1.55;color:rgba(247,234,210,.8);
margin-top:3px}
.ht-rline i{flex:0 0 auto;font-style:normal;width:9px;text-align:center;color:${C.honey};opacity:.8}
.ht-rline.is-tip i{color:#a8e8b4}
.ht-rline.is-warn i{color:#ff9b8c}
.ht-rline.is-warn{color:rgba(255,178,164,.86)}

.ht-rflow{display:grid;gap:9px;grid-template-columns:repeat(auto-fill,minmax(232px,1fr))}
.ht-rflow-item{padding:10px 12px;border-radius:10px;
background:rgba(255,255,255,.03);border:.5px solid rgba(255,255,255,.07)}
.ht-rflow-head{display:flex;align-items:center;gap:7px;margin-bottom:5px;
font-size:10px;letter-spacing:.2em;text-transform:uppercase}
.ht-rflow-dot{width:6px;height:6px;border-radius:50%;box-shadow:0 0 7px currentColor}
.ht-rflow-list{font-size:10.5px;line-height:1.6;color:rgba(247,234,210,.78)}
.ht-rflow-list b{font-weight:600;color:${HUD.colors.text}}

.ht-recipes-foot{padding:11px 22px 13px;border-top:.5px solid rgba(247,234,210,.1);
font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:${C.dim}}

@media (max-width:1100px){.ht-recipes{left:24px;top:16px;bottom:128px}}
@media (prefers-reduced-motion:reduce){.ht-recipes,.ht-recipes *{transition-duration:.01ms!important}}
`;

function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function nameOf(id) {
  const type = CELL_TYPES.find((t) => t.id === id);
  return type ? type.name : id;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------- effects, in words
//
// One sentence per effect, in the order a player asks the questions: what do I get, what
// does it let me build, and what does it cost me elsewhere.

function effectLines(type) {
  const e = type.effects || {};
  const out = [];

  if (e.capacity) {
    const parts = COST_KINDS.concat(['honey'])
      .filter((k) => (e.capacity[k] || 0) > 0)
      .map((k) => `${e.capacity[k]} more ${KIND_LABEL[k]}`);
    if (parts.length) out.push({ text: `Your hive can hold ${list(parts)}.` });
  }
  if (e.convert) {
    const perMin = (e.convert.rate * 60).toFixed(1);
    out.push({
      text: `Slowly turns ${KIND_LABEL[e.convert.from]} into ${KIND_LABEL[e.convert.to]} — `
        + `about ${perMin} ${KIND_LABEL[e.convert.to]} a minute, using `
        + `${e.convert.per} ${KIND_LABEL[e.convert.from]} for each one.`,
    });
  }
  if (e.swarmCap) out.push({ text: `Room for ${e.swarmCap} more bees in your swarm.` });
  if (e.queenChamber) {
    out.push({ text: 'Where you come back to life after a hornet hits you, and where flight upgrades live.' });
  }
  if (e.guardSlots) out.push({ text: `Seats ${e.guardSlots} guard bees to fight off hornets.` });
  if (e.hornetSlow) out.push({ text: `Hornets fly ${pct(e.hornetSlow)} slower at the entrance.` });
  if (e.trapCharges) out.push({ text: `Sticks to ${e.trapCharges} hornets, then it is used up and stops working.` });
  if (e.buildSpeed) out.push({ text: `Every cell you build finishes ${pct(e.buildSpeed)} faster.` });
  if (e.unlocks && e.unlocks.length) {
    out.push({ tone: 'tip', text: `Unlocks: ${list(e.unlocks.map(nameOf))}.` });
  }
  if (e.forageThroughput && e.forageThroughput < 0) {
    out.push({ tone: 'warn', text: `Your own bees carry ${pct(-e.forageThroughput)} less through that entrance.` });
  }
  return out;
}

// ---------------------------------------------------------------- placement, in words

function ruleLines(type) {
  const out = [];
  if (type.requires) {
    out.push({ tone: 'warn', text: `You must build a ${nameOf(type.requires)} before you can build this.` });
  }
  if (type.limitPerPlayer === 1) out.push({ tone: 'warn', text: 'Only one of these per queen.' });
  if (type.gate && type.gate.kind === 'route') {
    out.push({
      tone: 'warn',
      text: `Build it near the entrance — no more than ${type.gate.range} cells away along the comb, `
        + 'or it just sits there doing nothing.',
    });
  }
  return out;
}

// The adjacency bonus is the whole reason the hexes are not wallpaper, and it was shown
// as "airflow  3 · +48%". Here it is the instruction it always was.
const APPLIES_NOUN = {
  swarmCap: 'bee space',
  'convert.rate': 'honey making',
  'capacity.pollen': 'pollen storage',
  guardSlots: 'guard seats',
  hornetSlow: 'slowing power',
  trapCharges: 'uses',
};

function bonusLine(type) {
  const b = type.bonus;
  if (!b || b.applies === 'none') return null;
  const noun = APPLIES_NOUN[b.applies] || 'effect';
  const each = pct(b.per);
  const cap = pct(b.max);
  if (b.source === 'sameType') {
    return { tone: 'tip', text: `Build them in a block: +${each} ${noun} for each ${type.name} touching it, up to +${cap}.` };
  }
  if (b.source === 'neighbourTag') {
    const mates = CELL_TYPES
      .filter((t) => t.id !== type.id && (t.tags || []).includes(b.tag))
      .map((t) => t.name);
    const who = mates.length ? `${list(mates)} or another ${type.name}` : `another ${type.name}`;
    return { tone: 'tip', text: `Put it next to ${who}: +${each} ${noun} each, up to +${cap}.` };
  }
  if (b.source === 'routeProximity') {
    return { tone: 'tip', text: `The closer to the entrance you put it, the stronger it is — up to +${cap} ${noun}.` };
  }
  return { tone: 'tip', text: `Surround it with other cells: +${each} ${noun} per neighbour, up to +${cap}.` };
}

function costTotal(type) {
  return COST_KINDS.reduce((sum, k) => sum + ((type.cost && type.cost[k]) || 0), 0);
}

function costHtml(cost) {
  const parts = [];
  for (const kind of COST_KINDS) {
    const value = (cost && cost[kind]) || 0;
    if (value > 0) parts.push(`<b style="color:${KIND_COLOR[kind]}">${value}</b> ${KIND_LABEL[kind]}`);
  }
  return parts.length ? `Costs ${parts.join(' + ')}` : 'Costs nothing';
}

function makeCard(type, parent) {
  const card = el('div', 'ht-rcard', parent);
  const head = el('div', 'ht-rcard-head', card);
  const swatch = el('i', 'ht-rcard-swatch', head);
  swatch.style.background = hex(type.color);
  swatch.style.color = hex(type.color);
  el('div', 'ht-rcard-name', head, type.name);
  el('div', 'ht-rcard-time', head, `${type.buildTime}s to build`);

  const cost = el('div', 'ht-rcard-cost', card);
  cost.innerHTML = costHtml(type.cost);

  const lines = effectLines(type);
  const bonus = bonusLine(type);
  if (bonus) lines.push(bonus);
  lines.push(...ruleLines(type));
  for (const line of lines) {
    const row = el('div', `ht-rline${line.tone ? ` is-${line.tone}` : ''}`, card);
    el('i', null, row, line.tone === 'warn' ? '!' : (line.tone === 'tip' ? '+' : '·'));
    el('div', null, row, line.text);
  }
  return card;
}

function makeSection(parent, title, note) {
  const sec = el('div', 'ht-rsec', parent);
  const head = el('div', 'ht-rsec-head', sec);
  el('div', 'ht-rsec-title', head, title);
  if (note) el('div', 'ht-rsec-note', head, note);
  el('div', 'ht-rsec-rule', head);
  return sec;
}

export function createRecipeBoard(options) {
  const opts = options || {};
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'ht-recipes');
  const card = el('div', 'ht-recipes-card', root);

  const head = el('div', 'ht-recipes-head', card);
  el('div', 'ht-recipes-title', head, 'recipe board');
  el('div', 'ht-recipes-sub', head,
    'Everything you can build, what it costs, and what it does. '
    + 'Fly out and gather pollen, nectar and resin with E, come back, press TAB, and spend them here.');
  const close = el('button', 'ht-recipes-close', head, 'close  R');

  const body = el('div', 'ht-recipes-body', card);

  // Cheapest first, and the four you can build from minute one before the four you cannot.
  const starters = CELL_TYPES.filter((t) => !t.requires).sort((a, b) => costTotal(a) - costTotal(b));
  const later = CELL_TYPES.filter((t) => t.requires).sort((a, b) => costTotal(a) - costTotal(b));

  const first = makeSection(body, 'start with these', 'buildable right away — cheapest first');
  const firstGrid = el('div', 'ht-rgrid', first);
  for (const type of starters) makeCard(type, firstGrid);

  if (later.length) {
    const gateName = nameOf(later[0].requires);
    const second = makeSection(body, 'after the wax workshop', `build a ${gateName} first, then these appear`);
    const secondGrid = el('div', 'ht-rgrid', second);
    for (const type of later) makeCard(type, secondGrid);
  }

  // Where the three numbers in every recipe actually come from. Without this the board
  // would still leave "8 pollen" as a thing that happens to you rather than a thing you go
  // and get from a named flower in a named ring.
  const where = makeSection(body, 'where the ingredients come from',
    'fly to a flower, slow down, hold E — then fly back into the hollow to drop it off');
  const flowGrid = el('div', 'ht-rflow', where);
  for (const kind of COST_KINDS) {
    const item = el('div', 'ht-rflow-item', flowGrid);
    const itemHead = el('div', 'ht-rflow-head', item);
    const dot = el('i', 'ht-rflow-dot', itemHead);
    dot.style.background = KIND_COLOR[kind];
    dot.style.color = KIND_COLOR[kind];
    itemHead.appendChild(document.createTextNode(KIND_LABEL[kind]));
    const listEl = el('div', 'ht-rflow-list', item);
    // Richest first, with the ring named after it. Sorting by ring instead reads "nicely"
    // but answers the wrong question: it buried field poppy (4.2 pollen) under red clover
    // (1.2) purely because both grow near home. The board is asked "which flower gives me
    // pollen", and the honest answer is the best one, plus how far it is.
    const flowers = flowersFor(kind).slice(0, 4);
    listEl.innerHTML = flowers
      .map((s) => `<b>${s.name}</b> — ${bandLabel(s.zone || 0)}`)
      .join('<br>') || 'nothing carries this yet';
  }

  const startCost = costPhrase(starters[0] ? starters[0].cost : null);
  const foot = el('div', 'ht-recipes-foot', card,
    `a bare hollow already holds ${COMB_TUNING.baseCapacity.pollen} pollen, `
    + `${COMB_TUNING.baseCapacity.nectar} nectar and ${COMB_TUNING.baseCapacity.resin} resin · `
    + `tearing a cell down gives back half its resin · `
    + `your first ${starters[0] ? starters[0].name : 'cell'} needs only ${startCost}`);
  void foot;

  document.body.appendChild(root);

  let shown = false;

  function show() {
    if (shown) return;
    shown = true;
    root.classList.add('is-on');
    body.scrollTop = 0;
    if (typeof opts.onShow === 'function') opts.onShow();
  }

  function hide() {
    if (!shown) return;
    shown = false;
    root.classList.remove('is-on');
    if (typeof opts.onHide === 'function') opts.onHide();
  }

  function toggle() { if (shown) hide(); else show(); }

  close.addEventListener('click', hide);

  return {
    root,
    show,
    hide,
    toggle,
    get visible() { return shown; },
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
