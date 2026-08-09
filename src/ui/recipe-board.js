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
import { FLOWER_SPECIES, HUD, SCREENS } from '../config.js';
import {
  KIND_COLOR, KIND_LABEL, costPhrase, flowersFor, bandLabel,
  SEASON_NAMES, bloomInfo, bloomOpenNow, currentYearT,
} from './resource-sources.js';
import { flowerIconImg } from './flower-icons.js';
import { cellIconImg } from './cell-icons.js';

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
.ht-rcard-head img{width:22px;height:22px;flex:0 0 auto}
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

/* the flower table — ten species, what each one carries, where it grows and when it opens.
   One grid, one column template shared by the header and every row, so the columns line up
   without a <table> and still collapse sensibly on a narrow board. */
.ht-rt{border-radius:11px;overflow:hidden;
background:rgba(255,255,255,.028);border:.5px solid rgba(255,255,255,.08)}
.ht-rt-row{display:grid;align-items:center;gap:14px;padding:7px 12px;
grid-template-columns:minmax(126px,1.3fr) 54px 54px 48px minmax(96px,.9fr) minmax(178px,1.5fr)}
.ht-rt-row+.ht-rt-row{border-top:.5px solid rgba(255,255,255,.055)}
.ht-rt-head{padding-top:8px;padding-bottom:8px;background:rgba(255,255,255,.035);
font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.dim}}
/* the three yield headings sit in 54px columns; at the section's tracking they collided
   into POLLENNECTARRESIN, so they lose the letter-spacing the rest of the head keeps */
.ht-rt-head .ht-rt-num{text-align:right;letter-spacing:.04em;font-size:8.5px}
.ht-rt-name{display:flex;align-items:center;gap:8px;font-size:11.5px;color:${C.bright};
letter-spacing:.01em;min-width:0}
.ht-rt-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ht-rt-num{font-size:11.5px;text-align:right;font-variant-numeric:tabular-nums}
.ht-rt-num.is-zero{color:rgba(247,234,210,.22)}
.ht-rt-ring{font-size:10.5px;color:rgba(247,234,210,.72);white-space:nowrap;
overflow:hidden;text-overflow:ellipsis}
.ht-rt-when{min-width:0}
.ht-rt-bar{position:relative;height:7px;border-radius:4px;overflow:hidden;
background:rgba(255,255,255,.08)}
.ht-rt-bar b{position:absolute;top:0;bottom:0;background:${C.honey};opacity:.85;border-radius:4px}
.ht-rt-bar u{position:absolute;top:0;bottom:0;width:1.5px;background:#fff3d8;
box-shadow:0 0 6px rgba(255,243,216,.9)}
/* season boundaries, drawn over the fill so a window that ends mid-season still reads */
.ht-rt-bar i{position:absolute;top:0;bottom:0;width:1px;background:rgba(24,17,9,.75)}
.ht-rt-when-label{margin-top:4px;font-size:9.5px;letter-spacing:.03em;
color:rgba(247,234,210,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ht-rt-when-label em{font-style:normal;color:#a8e8b4}
.ht-rt-seasons{display:grid;grid-template-columns:repeat(4,1fr);margin-top:3px;
font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:rgba(247,234,210,.34)}
.ht-rt-seasons span{text-align:center}
.ht-rt-note{margin-top:8px;font-size:10px;line-height:1.6;color:rgba(247,234,210,.66)}
.ht-rt-note b{font-weight:600;color:${HUD.colors.text}}

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
  head.insertAdjacentHTML('afterbegin', cellIconImg(type.id, 22, type.name));
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

// ---------------------------------------------------------------- the flower table
//
// "Where do I get nectar?" was a question the game could not answer anywhere on screen.
// The board named two flowers per resource and stopped there, which left out half the
// meadow and all of the calendar — and the calendar is the half that bites, because a
// flower outside its bloom window gives nothing however long you hover it.
//
// Ten species, every yield, the ring it grows in and the weeks it is open. Read straight
// from FLOWER_SPECIES, so it cannot drift from what the meadow actually hands over.

function yieldText(value) {
  if (!value) return '—';
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

function makeFlowerTable(parent) {
  const table = el('div', 'ht-rt', parent);

  const head = el('div', 'ht-rt-row ht-rt-head', table);
  el('div', null, head, 'flower');
  for (const kind of COST_KINDS) {
    const cell = el('div', 'ht-rt-num', head, KIND_LABEL[kind]);
    cell.style.color = KIND_COLOR[kind];
    cell.style.opacity = '.75';
  }
  el('div', null, head, 'grows in');
  const whenHead = el('div', 'ht-rt-when', head);
  el('div', null, whenHead, 'when it blooms');
  // The four season names sit directly under the header and directly over every bar, so
  // the bars are labelled once instead of ten times.
  const legend = el('div', 'ht-rt-seasons', whenHead);
  for (const name of SEASON_NAMES) el('span', null, legend, name);

  // Nearest ring first — the order the player unlocks them in — and the richest flower
  // first inside each ring, so the top of every group is the one worth flying to.
  const species = FLOWER_SPECIES.slice().sort((a, b) => {
    const zone = (a.zone || 0) - (b.zone || 0);
    if (zone) return zone;
    const best = (s) => Math.max(s.pollen || 0, s.nectar || 0, s.resin || 0);
    return best(b) - best(a);
  });

  const live = [];
  for (const s of species) {
    const row = el('div', 'ht-rt-row', table);
    const name = el('div', 'ht-rt-name', row);
    name.insertAdjacentHTML('afterbegin', flowerIconImg(s.id, 22, s.name));
    el('span', null, name, s.name);
    for (const kind of COST_KINDS) {
      const value = s[kind] || 0;
      const cell = el('div', `ht-rt-num${value ? '' : ' is-zero'}`, row, yieldText(value));
      if (value) cell.style.color = KIND_COLOR[kind];
    }
    el('div', 'ht-rt-ring', row, bandLabel(s.zone || 0));

    const when = el('div', 'ht-rt-when', row);
    const info = bloomInfo(s);
    const bar = el('div', 'ht-rt-bar', when);
    bar.innerHTML = info.spans
      .map(([a, b]) => `<b style="left:${(a * 100).toFixed(2)}%;width:${((b - a) * 100).toFixed(2)}%"></b>`)
      .join('')
      + [1, 2, 3].map((i) => `<i style="left:${i * 25}%"></i>`).join('');
    const marker = el('u', null, bar);
    marker.style.display = 'none';
    const label = el('div', 'ht-rt-when-label', when);
    live.push({ species: s, info, marker, label });
  }

  // The "now" line, and the flowers that are open behind it. Recomputed each time the
  // board is opened rather than ticked: the year turns over eight real days, so a value
  // sampled on open is right for as long as anyone has the board up.
  function refresh() {
    const t = currentYearT();
    for (const entry of live) {
      const open = t === null ? null : bloomOpenNow(entry.species, t);
      entry.marker.style.display = t === null ? 'none' : 'block';
      if (t !== null) entry.marker.style.left = `${(t * 100).toFixed(2)}%`;
      entry.label.innerHTML = open
        ? `${entry.info.label} <em>· open now</em>`
        : entry.info.label;
    }
  }
  refresh();
  return refresh;
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
    'Everything you can build, what it costs and what it does — and, at the foot, every '
    + 'flower in the world: what it carries, where it grows and when it is open. Gather with '
    + 'E, fly back into the hollow, press TAB, and spend it here.');
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
  const where = makeSection(body, 'every flower in the world',
    'fly to one, slow down, hold E — then fly back into the hollow to drop it off');
  const refreshFlowers = makeFlowerTable(where);

  // The one-line answer under the table, generated from the same data: the best source of
  // each resource you can reach from minute one, and the best there is anywhere. That gap
  // is the reason the rings are worth unlocking, and it was never stated.
  const note = el('div', 'ht-rt-note', where);
  note.innerHTML = COST_KINDS.map((kind) => {
    const near = flowersFor(kind, 0)[0];
    const best = flowersFor(kind)[0];
    if (!best) return '';
    const nearPart = near
      ? `<b>${near.name}</b> in ${bandLabel(near.zone || 0)} (${yieldText(near[kind])})`
      : 'nothing you can reach yet';
    if (near && best.id === near.id) {
      return `Best ${KIND_LABEL[kind]}: ${nearPart} — and nothing beats it further out.`;
    }
    return `Best ${KIND_LABEL[kind]} close to home: ${nearPart}. `
      + `Best anywhere: <b>${best.name}</b> in ${bandLabel(best.zone || 0)} (${yieldText(best[kind])}), `
      + 'once that ring is open.';
  }).filter(Boolean).join('<br>');

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
    // The year has turned since the board was built; the "now" line and the "open now"
    // tags are only true if they are re-read every time it comes up.
    refreshFlowers();
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
