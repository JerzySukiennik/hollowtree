// Hollowtree — "where does this stuff come from" in one place.
//
// Every cost in config.comb.js is pollen / nectar / resin, and every one of those three
// comes off a named flower that grows in a named ring. That link was nowhere on screen:
// the zone barrier told the player they needed two brood cells and stopped, and brood
// cells are pollen, and pollen is field poppy, and field poppy is the flower meadow —
// three hops the player was expected to make from data they had never been shown.
//
// This module is the only place that walks FLOWER_SPECIES, so the recipe board and the
// barrier message always name the same flowers.

import { FLOWER_SPECIES, ZONES, HUD } from '../config.js';
import { NET } from '../config.net.js';
import { bloomSpan, bloomOpenAt } from '../entities/flowers.js';
import { flowerIconImg } from './flower-icons.js';
import { CELL_BY_ID, COST_KINDS } from '../config.comb.js';

export const KIND_LABEL = { pollen: 'pollen', nectar: 'nectar', resin: 'resin', honey: 'honey' };

export const KIND_COLOR = {
  pollen: HUD.colors.pollen,
  nectar: HUD.colors.nectar,
  resin: HUD.colors.resin,
  honey: HUD.colors.honey,
};

const BANDS = ZONES.bands;

export function bandLabel(index) {
  const band = BANDS[index];
  return band ? band.label : 'the meadow';
}

// Species that yield `kind`, best first. `maxZone` clamps the answer to rings the player
// can actually reach right now — naming a cherry tree to someone locked out of the orchard
// is worse than naming nothing.
export function flowersFor(kind, maxZone) {
  const cap = Number.isFinite(maxZone) ? maxZone : BANDS.length - 1;
  return FLOWER_SPECIES
    .filter((s) => (s[kind] || 0) > 0 && (s.zone || 0) <= cap)
    .sort((a, b) => (b[kind] || 0) - (a[kind] || 0));
}

// "field poppy in the flower meadow, meadow daisy in the clearing"
export function flowerSourceText(kind, maxZone, limit) {
  const list = flowersFor(kind, maxZone).slice(0, limit || 2);
  if (!list.length) return '';
  return list.map((s) => `${s.name} in ${bandLabel(s.zone || 0)}`).join(', ');
}

// ---------------------------------------------------------------- the flowering year
//
// Every species carries `bloom: {start, end}` as a fraction of the year, and a flower
// outside its window yields nothing however long you hover it. Nothing on screen said so,
// and "0.26–0.70" is not a thing anyone reads. The year is four seasons of two real days
// each (NET.season), so a fraction converts straight into a season name.
//
// The maths — a window may wrap the turn of the year, and the span is measured forward
// from the start — is bloomSpan()/bloomOpenAt() in src/entities/flowers.js, the same pair
// the meadow itself uses. Nothing here re-derives it, so the table cannot promise a
// harvest the field refuses to give.

export const SEASON_NAMES = NET.season.names;

/** Season index (0..3) containing a year fraction. */
export function seasonOfYearT(t) {
  const n = SEASON_NAMES.length;
  let x = (Number(t) || 0) % 1;
  if (x < 0) x += 1;
  return Math.min(n - 1, Math.floor(x * n));
}

/**
 * A species' flowering window, ready to draw:
 *   evergreen  true when it is open all year (spruce seep)
 *   spans      1 or 2 [from, to] pairs in 0..1, already split at the turn of the year
 *   fraction   how much of the year it is open
 *   label      "spring → summer", "summer", "all year round"
 */
export function bloomInfo(species) {
  const span = bloomSpan(species);
  if (!species || !species.bloom || species.evergreen || span >= 1) {
    return { evergreen: true, spans: [[0, 1]], fraction: 1, label: 'all year round' };
  }
  const start = ((species.bloom.start % 1) + 1) % 1;
  const end = start + span;
  const spans = end <= 1 ? [[start, end]] : [[start, 1], [0, end - 1]];
  const first = seasonOfYearT(start);
  // The last season the window actually touches — measured a hair before the end so a
  // window landing exactly on a boundary does not claim the season it never opens in.
  const last = seasonOfYearT(end - 1e-4);
  const label = first === last
    ? SEASON_NAMES[first]
    : `${SEASON_NAMES[first]} → ${SEASON_NAMES[last]}`;
  return { evergreen: false, spans, fraction: span, label };
}

/** Is this species yielding right now, at year fraction `yearT`? */
export function bloomOpenNow(species, yearT) {
  return bloomOpenAt(species, yearT) > 1e-3;
}

/**
 * The live year fraction, read off the running world if there is one. The board is built
 * long before window.hollowtree exists, so this is looked up on every open rather than
 * captured — and it degrades to null (no "now" marker) instead of throwing in a test page.
 */
export function currentYearT() {
  const game = typeof window !== 'undefined' ? window.hollowtree : null;
  const flowers = game && game.flowers;
  if (flowers && typeof flowers.yearPhase === 'function') {
    const t = flowers.yearPhase();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

// Which of the three resources a set of cell types actually costs, in the fixed
// pollen / nectar / resin order so the reader learns one ordering and keeps it.
export function kindsNeededBy(typeIds) {
  const need = new Set();
  for (const id of typeIds || []) {
    const type = CELL_BY_ID.get(id);
    if (!type || !type.cost) continue;
    for (const kind of COST_KINDS) if ((type.cost[kind] || 0) > 0) need.add(kind);
  }
  return COST_KINDS.filter((kind) => need.has(kind));
}

// "3 pollen and 4 resin" — costs read as words, never as `3p · 4r`.
export function costPhrase(cost) {
  const parts = [];
  for (const kind of COST_KINDS) {
    const value = (cost && cost[kind]) || 0;
    if (value > 0) parts.push(`${value} ${KIND_LABEL[kind]}`);
  }
  if (!parts.length) return 'nothing';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// The barrier element in src/world/zones.js is one nowrap line, which was fine for a short
// string and is not fine for a sentence that names flowers. zones.js is not ours to edit,
// so the copy fixes its own container the first time it is asked for. Idempotent, and a
// no-op if the element is ever restyled at the source.
function relaxBarrierElement() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('zone-barrier');
  if (!el || el.dataset.htWrapped === '1') return;
  el.dataset.htWrapped = '1';
  el.style.whiteSpace = 'normal';
  el.style.textAlign = 'center';
  el.style.lineHeight = '1.65';
  el.style.maxWidth = 'min(760px, 84vw)';
  el.style.width = 'max-content';
}

/**
 * The zone barrier line. `band` is the ZONES.bands entry the queen is being turned away
 * from; `missing` is the phrase list zones.js already builds ("10 more comb cells", …).
 *
 * Old: "the orchard needs 10 more comb cells, 2 brood cells, a honey cell"
 * New: the same, plus the flowers those cells are made of and where they grow.
 */
// zones.js builds its shortfall phrases from the raw type id and always pluralises, so it
// says "a honey cell" (there is no such thing — it is a honey store) and "1 more comb cells".
// Rewriting them here keeps that logic where it is and still puts the cell's real name,
// the one printed in the build panel and on the recipe board, in front of the player.
function tidyPhrase(phrase) {
  let out = phrase.replace(/^1 more comb cells$/, '1 more comb cell');
  out = out.replace(/^a ([a-z-]+) cell$/, (m, id) => {
    const type = CELL_BY_ID.get(id);
    return type ? `a ${type.name}` : m;
  });
  out = out.replace(/^(\d+) ([a-z-]+) cells$/, (m, n, id) => {
    const type = CELL_BY_ID.get(id);
    return type ? `${n} ${type.name}s` : m;
  });
  return out;
}

export function zoneNeedText(band, missing) {
  if (!band || !missing || !missing.length) return '';
  relaxBarrierElement();
  const head = `${band.label} needs ${missing.map(tidyPhrase).join(', ')}`;
  const index = BANDS.indexOf(band);
  const typeIds = Object.keys((band.unlock && band.unlock.types) || {});
  const kinds = kindsNeededBy(typeIds.length ? typeIds : ['pollen', 'brood']);
  // Only rings that are already open — everything the player can reach is one ring in
  // from the one they are being turned back at.
  const maxZone = Math.max(0, (index < 0 ? 1 : index) - 1);
  // One flower per resource, not two: this line is drawn over the meadow at 12px and every
  // extra clause costs a wrapped row. The best reachable source is the only one the player
  // needs in order to act.
  const sources = kinds
    .map((kind) => {
      const best = flowersFor(kind, maxZone)[0];
      return best ? `${KIND_LABEL[kind]} from ${best.name} (${bandLabel(best.zone || 0)})` : '';
    })
    .filter(Boolean);
  if (!sources.length) return head;
  return `${head} — gather ${sources.join(', ')}, then press tab inside the hollow to build.`;
}

// The barrier line, as markup: one short sentence saying what is missing, then a row of
// flower glyphs saying where to get it. The prose version of this ran to three wrapped rows
// over the meadow while the player was being pushed backwards, which is not a thing anyone
// reads. `zoneNeedText` above is kept as the plain-text fallback and for tests.
export function zoneNeedHtml(band, missing) {
  if (!band || !missing || !missing.length) return '';
  relaxBarrierElement();
  const head = `${band.label} needs ${missing.map(tidyPhrase).join(', ')}`;
  const index = BANDS.indexOf(band);
  const typeIds = Object.keys((band.unlock && band.unlock.types) || {});
  const kinds = kindsNeededBy(typeIds.length ? typeIds : ['pollen', 'brood']);
  const maxZone = Math.max(0, (index < 0 ? 1 : index) - 1);

  const chips = kinds.map((kind) => {
    const best = flowersFor(kind, maxZone)[0];
    if (!best) return '';
    const icon = flowerIconImg(best.id, 26, `${best.name} — ${KIND_LABEL[kind]}`);
    if (!icon) return '';
    return `<span style="display:inline-flex;align-items:center;gap:5px">${icon}`
      + `<span style="color:${KIND_COLOR[kind]};font-weight:600">${KIND_LABEL[kind]}</span></span>`;
  }).filter(Boolean);

  const row = chips.length
    ? `<div style="display:flex;gap:18px;justify-content:center;align-items:center;margin-top:7px">${chips.join('')}</div>`
    : '';
  return `<div>${head}</div>${row}`;
}
