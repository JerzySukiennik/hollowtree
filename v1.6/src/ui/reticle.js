// Hollowtree — the aiming dot and the cell inspector that opens beside it.
//
// Two things live here because they are one thing to the player: a quiet mark at the centre
// of the screen that says "this is what you are looking at", and a card next to it that says
// what that is. The dot is deliberately not a crosshair — no arms, no gap, no ticks. It is a
// warm point with a soft dark halo so it survives both the bright meadow and the near-black
// hollow without ever reading as a weapon sight.
//
// Everything the card prints is derived from src/config.comb.js and the live cell record.
// Nothing is restated from memory here: names, blurbs, effects and bonus rules are read off
// the type record, and the bonus's current worth is the value the comb itself computed.
//
// The DOM is rebuilt only when the hovered cell's *description* changes — the cell key, its
// type, its finished/active flags, its bonus count and, while it is still growing, the
// progress rounded to whole percent. Aim moves every frame; this does not.

import { HUD, SCREENS } from '../config.js';
import { CELL_BY_ID } from '../config.comb.js';
import { KIND_LABEL } from './resource-sources.js';

const C = SCREENS.colors;

const CSS = `
.ht-retic{position:fixed;left:50%;top:50%;z-index:5;pointer-events:none;
transform:translate(-50%,-50%);opacity:0;transition:opacity .28s ease}
.ht-retic.is-on{opacity:1}
/* Three stacked circles: a dark bloom for contrast on pale ground, a hairline ring, and the
   warm point itself. Centred with inset+margin so nothing depends on the parent's size. */
.ht-retic-halo{position:absolute;left:50%;top:50%;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;
border-radius:50%;background:radial-gradient(circle,rgba(8,5,2,.5) 0%,rgba(8,5,2,.34) 42%,rgba(8,5,2,0) 72%)}
.ht-retic-ring{position:absolute;left:50%;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;
border-radius:50%;border:.5px solid rgba(247,234,210,.42);
transition:width .22s cubic-bezier(.22,.61,.36,1),height .22s cubic-bezier(.22,.61,.36,1),
margin .22s cubic-bezier(.22,.61,.36,1),border-color .22s ease}
.ht-retic-dot{position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;
border-radius:50%;background:${HUD.colors.text};box-shadow:0 0 3px rgba(0,0,0,.75);
transition:background .22s ease}
.ht-retic.is-hot .ht-retic-ring{width:13px;height:13px;margin:-6.5px 0 0 -6.5px;
border-color:rgba(246,201,90,.72)}
.ht-retic.is-hot .ht-retic-dot{background:${C.honey}}

.ht-insp{position:fixed;left:50%;top:50%;z-index:5;pointer-events:none;
margin-left:24px;transform:translateY(-50%) translateX(-6px);
width:238px;color:${HUD.colors.text};opacity:0;
font:500 12px/1.45 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1,"lnum" 1;-webkit-font-smoothing:antialiased;
transition:opacity .2s ease,transform .26s cubic-bezier(.22,.61,.36,1)}
.ht-insp.is-on{opacity:1;transform:translateY(-50%) translateX(0)}
.ht-insp-card{background:rgba(26,18,10,.62);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);
border:.5px solid rgba(246,201,90,.16);border-radius:13px;padding:11px 12px 10px;
box-shadow:0 12px 34px rgba(0,0,0,.42)}
.ht-insp-head{display:flex;align-items:center;gap:7px;margin-bottom:5px}
.ht-insp-swatch{width:8px;height:8px;border-radius:2.5px;flex:0 0 auto;box-shadow:0 0 7px currentColor}
.ht-insp-name{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${C.bright}}
.ht-insp-blurb{font-size:10.5px;line-height:1.5;color:${HUD.colors.dim}}
.ht-insp-tag{display:inline-block;margin-top:7px;padding:2.5px 7px;border-radius:6px;
font-size:8.5px;letter-spacing:.18em;text-transform:uppercase}
.ht-insp-tag.is-building{background:rgba(246,201,90,.14);color:#ffe6a8;
box-shadow:inset 0 0 0 .5px rgba(246,201,90,.28)}
.ht-insp-tag.is-inert{background:rgba(217,96,79,.13);color:#ff9b8c;
box-shadow:inset 0 0 0 .5px rgba(217,96,79,.3)}
.ht-insp-sec{margin-top:8px;padding-top:7px;border-top:.5px solid rgba(247,234,210,.1)}
.ht-insp-subhead{font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;
color:${HUD.colors.dim};margin-bottom:4px}
.ht-insp-line{display:flex;justify-content:space-between;gap:10px;font-size:10.5px;line-height:1.5}
.ht-insp-line span:first-child{color:${HUD.colors.dim}}
.ht-insp-line span:last-child{text-align:right;white-space:nowrap}
.ht-insp-note{font-size:10px;line-height:1.5;color:${HUD.colors.dim};margin-top:3px}
.ht-insp-note.is-live{color:#a8e8b4}
@media (prefers-reduced-motion:reduce){.ht-retic,.ht-retic *,.ht-insp,.ht-insp *{transition-duration:.01ms!important}}
`;

function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function hex(color) {
  return `#${Number(color || 0).toString(16).padStart(6, '0')}`;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

// One entry of "what it contributes", already scaled by whatever the adjacency bonus is
// worth at this position — the player is looking at a real cell, so the numbers should be
// the ones it is actually paying out, not the catalogue values.
function contributions(type, factorFor) {
  const out = [];
  const eff = (type && type.effects) || {};
  const scale = (path, value) => value * factorFor(path);

  if (eff.capacity) {
    for (const kind of ['pollen', 'nectar', 'resin', 'honey']) {
      const raw = Number(eff.capacity[kind]) || 0;
      if (!raw) continue;
      const value = scale(`capacity.${kind}`, raw);
      out.push([`${KIND_LABEL[kind]} room`, `+${Math.round(value)}`]);
    }
  }
  if (eff.swarmCap) {
    out.push(['houses', `${Math.round(scale('swarmCap', eff.swarmCap))} bees`]);
  }
  if (eff.convert && eff.convert.to === 'honey') {
    const rate = scale('convert.rate', eff.convert.rate);
    out.push(['ripens nectar', `${(rate * 60).toFixed(1)} honey/min`]);
  }
  if (eff.buildSpeed) out.push(['every build', `${pct(scale('buildSpeed', eff.buildSpeed))} faster`]);
  if (eff.guardSlots) out.push(['guard seats', String(Math.round(scale('guardSlots', eff.guardSlots)))]);
  if (eff.hornetSlow) out.push(['slows hornets', pct(scale('hornetSlow', eff.hornetSlow))]);
  if (eff.forageThroughput) {
    const v = scale('forageThroughput', eff.forageThroughput);
    out.push(['your foragers', `${v > 0 ? '+' : ''}${pct(v)}`]);
  }
  if (eff.trapCharges) out.push(['trap charges', String(Math.round(scale('trapCharges', eff.trapCharges)))]);
  if (eff.queenChamber) out.push(['respawn point', 'yours']);
  if (eff.unlocks && eff.unlocks.length) {
    const names = eff.unlocks
      .map((id) => (CELL_BY_ID.get(id) || {}).name || id)
      .join(', ');
    out.push(['unlocks', names]);
  }
  return out;
}

// What the bonus counts, in the player's words rather than the rule's enum.
function bonusSourceText(rule) {
  if (!rule) return '';
  if (rule.source === 'occupiedNeighbours') return 'counts every finished cell touching it';
  if (rule.source === 'sameType') return 'counts touching cells of the same kind';
  if (rule.source === 'neighbourTag') return `counts touching cells that carry ${rule.tag}`;
  if (rule.source === 'routeProximity') return 'counts how close it sits to the entrance route';
  return '';
}

export function createReticle(options) {
  const opts = options || {};
  if (typeof document === 'undefined') return null;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const dot = el('div', 'ht-retic');
  el('div', 'ht-retic-halo', dot);
  el('div', 'ht-retic-ring', dot);
  el('div', 'ht-retic-dot', dot);
  document.body.appendChild(dot);

  const insp = el('div', 'ht-insp');
  const card = el('div', 'ht-insp-card', insp);
  document.body.appendChild(insp);

  const stats = { rebuilds: 0, ticks: 0 };

  let dotOn = false;
  let inspOn = false;
  let signature = null;
  // A tick that does not arrive means we are no longer in play — hide rather than freeze.
  let ticked = false;

  function setDotVisible(on) {
    if (dotOn === on) return;
    dotOn = on;
    dot.classList.toggle('is-on', on);
  }

  function setInspVisible(on) {
    if (inspOn === on) return;
    inspOn = on;
    insp.classList.toggle('is-on', on);
    dot.classList.toggle('is-hot', on);
  }

  // The signature is the whole of what the card prints. Aim jitters constantly; these
  // fields do not, so comparing them is what keeps the DOM still between rebuilds.
  function signatureOf(cell) {
    if (!cell) return null;
    const bonus = cell.bonus || {};
    const grow = cell.done ? 100 : Math.round(cell.progress * 100);
    return `${cell.key}|${cell.type}|${cell.done ? 1 : 0}|${cell.active ? 1 : 0}|${bonus.count || 0}|${grow}`;
  }

  function render(cell, comb) {
    stats.rebuilds++;
    card.textContent = '';
    const type = CELL_BY_ID.get(cell.type) || { name: cell.type, blurb: '', color: 0xffffff };

    const head = el('div', 'ht-insp-head', card);
    const swatch = el('i', 'ht-insp-swatch', head);
    swatch.style.background = hex(type.color);
    swatch.style.color = hex(type.color);
    el('div', 'ht-insp-name', head, type.name);
    if (type.blurb) el('div', 'ht-insp-blurb', card, type.blurb);

    const building = !cell.done;
    const inert = cell.done && !cell.active;
    if (building) {
      el('div', 'ht-insp-tag is-building', card, `building — ${Math.round(cell.progress * 100)}%`);
    } else if (inert) {
      el('div', 'ht-insp-tag is-inert', card, 'inert');
    }

    // The bonus the comb actually computed for this cell, right here, right now.
    const live = (comb && typeof comb.bonusAt === 'function'
      ? comb.bonusAt(cell.col, cell.row, cell.layer)
      : cell.bonus) || { id: null, label: '', count: 0, value: 0 };
    const rule = type.bonus || null;
    const earning = Boolean(rule) && cell.done && cell.active
      && live.value > 0 && rule.applies && rule.applies !== 'none';

    const factorFor = (path) => (
      earning && rule.applies === path ? 1 + live.value : 1
    );

    const lines = contributions(type, factorFor);
    if (lines.length) {
      const sec = el('div', 'ht-insp-sec', card);
      el('div', 'ht-insp-subhead', sec, building ? 'will give' : 'what it gives');
      for (const [label, value] of lines) {
        const row = el('div', 'ht-insp-line', sec);
        el('span', null, row, label);
        el('span', null, row, value);
      }
      if (inert) el('div', 'ht-insp-note', sec, 'none of it counts while the cell is inert');
      else if (building) el('div', 'ht-insp-note', sec, 'nothing until it is finished');
    } else {
      const sec = el('div', 'ht-insp-sec', card);
      el('div', 'ht-insp-subhead', sec, 'what it gives');
      el('div', 'ht-insp-note', sec, 'nothing on its own — it is what the hive grows from');
    }

    const sec = el('div', 'ht-insp-sec', card);
    if (!rule) {
      el('div', 'ht-insp-subhead', sec, 'neighbours');
      el('div', 'ht-insp-note', sec, 'this kind gains nothing from what sits beside it');
    } else {
      el('div', 'ht-insp-subhead', sec, `${live.label || rule.label || rule.id} bonus`);
      const row = el('div', 'ht-insp-line', sec);
      el('span', null, row, live.count === 1 ? '1 neighbour' : `${live.count} neighbours`);
      el('span', null, row, `+${Math.round(live.value * 100)}%`);
      el('div', 'ht-insp-note', sec, bonusSourceText(rule));
      if (earning) {
        el('div', 'ht-insp-note is-live', sec, 'earning here — already in the numbers above');
      } else if (!cell.done) {
        el('div', 'ht-insp-note', sec, 'starts counting once the cell is finished');
      } else if (inert) {
        el('div', 'ht-insp-note', sec, 'earning nothing — the cell is inert');
      } else if (rule.applies === 'none') {
        el('div', 'ht-insp-note', sec, 'earning nothing yet — nothing scales from it');
      } else {
        el('div', 'ht-insp-note', sec, 'earning nothing here — no neighbours to count');
      }
    }
  }

  // Called once per frame from build mode, whether or not build mode is open.
  //   visible  — draw the dot at all (play, pointer locked)
  //   cell     — the comb cell under the aim ray, or null
  function tick(visible, cell, comb) {
    ticked = true;
    stats.ticks++;
    const locked = typeof document !== 'undefined' && Boolean(document.pointerLockElement);
    const on = Boolean(visible) && locked;
    setDotVisible(on);
    if (!on || !cell) {
      setInspVisible(false);
      signature = null;
      return;
    }
    const next = signatureOf(cell);
    if (next !== signature) {
      signature = next;
      render(cell, comb);
    }
    setInspVisible(true);
  }

  function hide() {
    setDotVisible(false);
    setInspVisible(false);
    signature = null;
  }

  function onPointerLockChange() {
    if (!document.pointerLockElement) hide();
  }
  document.addEventListener('pointerlockchange', onPointerLockChange);

  return {
    root: dot,
    panel: insp,
    stats,
    tick,
    hide,
    get visible() { return dotOn; },
    get inspecting() { return inspOn; },
    get ticked() { return ticked; },
    dispose() {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      dot.remove();
      insp.remove();
      style.remove();
    },
  };
}
