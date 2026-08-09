// Hollowtree — little glyphs for comb cell types, drawn from CELL_TYPES.
//
// The build panel and the recipe board both identified a cell by a 9px coloured square.
// Three of the eight types are shades of amber (honey store f2b544, pollen store f6c95a,
// brood cell e0a25c), so the square answered "which one is this" with "an orange one".
//
// Same approach as flower-icons.js, and for the same reason: canvas glyphs, cached per id
// and size, drawn from the record itself. The SHAPE is chosen by what the cell DOES —
// `effects.capacity.honey` is the drop, `swarmCap` is the egg, `guardSlots` is the shield —
// so a glyph cannot drift from the cell it stands for: change what a cell does in
// config.comb.js and its glyph follows. Colour always comes from `type.color`.
//
// Each of the eight reads by silhouette alone at 20px, which is the size the panel uses:
//   honey store          filled hex with a drop cut out of it
//   pollen store         three packed pellets
//   brood cell           an egg with the larva curled inside
//   queen's chamber      a crown
//   wax workshop         three small hexes being fitted together
//   guard post           a shield
//   entrance constrictor a ring pinched from both sides
//   resin trap           a sticky blob with drips
// Colour is the confirmation, never the thing you have to read.

import { CELL_BY_ID } from '../config.comb.js';

const cache = new Map();

function luma(value) {
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(value, amount) {
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const up = (c) => Math.round(c + (255 - c) * amount);
  return `#${((up(r) << 16) | (up(g) << 8) | up(b)).toString(16).padStart(6, '0')}`;
}

// Guard post (9c7b52), entrance constrictor (7a5a3a) and resin trap (b7784a) are dark
// browns, and the panel they sit on is a dark brown. Measured against the honey glyph they
// came out at a third of its luma; lifting the dark ones keeps the cell's own hue and makes
// the shape visible at 20px, which is the whole point of having a shape.
function inkOf(type) {
  const l = luma(type.color);
  return l < 150 ? mix(type.color, (150 - l) / 255 + 0.22) : `#${type.color.toString(16).padStart(6, '0')}`;
}

// Dark counter-colour for cut-outs inside a filled glyph — reads as a hole, not a second
// colour, on both the amber cells and the brown ones.
const HOLE = 'rgba(26,16,6,.82)';

function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function dropPath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.45);
  ctx.quadraticCurveTo(cx + r * 1.05, cy - r * 0.15, cx + r * 0.86, cy + r * 0.36);
  ctx.arc(cx, cy + r * 0.36, r * 0.86, 0, Math.PI, false);
  ctx.quadraticCurveTo(cx - r * 1.05, cy - r * 0.15, cx, cy - r * 1.45);
  ctx.closePath();
}

// ------------------------------------------------------------------ the eight shapes

function drawHoneyStore(ctx, s, ink) {
  ctx.fillStyle = ink;
  hexPath(ctx, s / 2, s / 2, s * 0.46);
  ctx.fill();
  ctx.fillStyle = HOLE;
  dropPath(ctx, s / 2, s * 0.52, s * 0.19);
  ctx.fill();
}

function drawPollenStore(ctx, s, ink) {
  ctx.fillStyle = ink;
  const r = s * 0.2;
  const spots = [[0.5, 0.3], [0.29, 0.66], [0.71, 0.66]];
  for (const [fx, fy] of spots) {
    ctx.beginPath();
    ctx.arc(s * fx, s * fy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = HOLE;
  for (const [fx, fy] of spots) {
    ctx.beginPath();
    ctx.arc(s * fx - r * 0.26, s * fy - r * 0.26, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBrood(ctx, s, ink) {
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(s / 2, s * 0.52, s * 0.28, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // The larva, curled. Kept small: drawn large it swallowed the egg and the glyph read as
  // a letter C rather than as a cell with something growing in it.
  ctx.strokeStyle = HOLE;
  ctx.lineWidth = s * 0.075;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.55, s * 0.12, Math.PI * 0.25, Math.PI * 1.65);
  ctx.stroke();
}

function drawQueen(ctx, s, ink) {
  ctx.fillStyle = ink;
  const top = s * 0.24;
  const bottom = s * 0.72;
  ctx.beginPath();
  ctx.moveTo(s * 0.12, bottom);
  ctx.lineTo(s * 0.12, top);
  ctx.lineTo(s * 0.31, s * 0.47);
  ctx.lineTo(s * 0.5, top - s * 0.06);
  ctx.lineTo(s * 0.69, s * 0.47);
  ctx.lineTo(s * 0.88, top);
  ctx.lineTo(s * 0.88, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(s * 0.12, bottom + s * 0.03, s * 0.76, s * 0.11);
}

function drawWax(ctx, s, ink) {
  ctx.fillStyle = ink;
  // Three separate cells being fitted together. They used to be closer and merged into one
  // blob at 20px; the gap between them is the whole difference between "a workshop" and
  // "a lump", so the centres are spaced wider than two apothems apart.
  const r = s * 0.185;
  const cells = [[0.31, 0.32], [0.69, 0.32], [0.5, 0.68]];
  for (const [fx, fy] of cells) {
    hexPath(ctx, s * fx, s * fy, r);
    ctx.fill();
  }
  ctx.strokeStyle = HOLE;
  ctx.lineWidth = s * 0.055;
  for (const [fx, fy] of cells) {
    hexPath(ctx, s * fx, s * fy, r);
    ctx.stroke();
  }
}

function drawGuard(ctx, s, ink) {
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.12);
  ctx.lineTo(s * 0.86, s * 0.28);
  ctx.lineTo(s * 0.86, s * 0.55);
  ctx.quadraticCurveTo(s * 0.86, s * 0.8, s * 0.5, s * 0.92);
  ctx.quadraticCurveTo(s * 0.14, s * 0.8, s * 0.14, s * 0.55);
  ctx.lineTo(s * 0.14, s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = HOLE;
  ctx.fillRect(s * 0.44, s * 0.28, s * 0.12, s * 0.42);
  ctx.fillRect(s * 0.28, s * 0.42, s * 0.44, s * 0.12);
}

function drawConstrictor(ctx, s, ink) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = s * 0.15;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ink;
  // pinched from both sides: the mouth being narrowed
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s / 2 + dir * s * 0.48, s * 0.3);
    ctx.lineTo(s / 2 + dir * s * 0.48, s * 0.7);
    ctx.lineTo(s / 2 + dir * s * 0.2, s * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTrap(ctx, s, ink) {
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.34);
  ctx.quadraticCurveTo(s * 0.5, s * 0.14, s * 0.9, s * 0.34);
  ctx.quadraticCurveTo(s * 0.72, s * 0.56, s * 0.5, s * 0.54);
  ctx.quadraticCurveTo(s * 0.28, s * 0.56, s * 0.1, s * 0.34);
  ctx.closePath();
  ctx.fill();
  // three drips: the thing is sticky, and it runs out
  const drips = [[0.26, 0.62, 0.075], [0.5, 0.76, 0.095], [0.75, 0.6, 0.065]];
  for (const [fx, fy, fr] of drips) {
    ctx.beginPath();
    ctx.moveTo(s * fx - s * 0.045, s * 0.44);
    ctx.lineTo(s * fx + s * 0.045, s * 0.44);
    ctx.lineTo(s * fx, s * fy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * fx, s * fy, s * fr, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Which shape a record gets, decided by what it does rather than by its id, so the eight
// entries in config.comb.js keep their glyphs if they are renamed and change them if they
// change job. The id fallbacks below cover cells whose effects are all bonus-shaped.
function shapeFor(type) {
  const e = type.effects || {};
  if (e.queenChamber) return drawQueen;
  if (e.guardSlots) return drawGuard;
  if (e.trapCharges) return drawTrap;
  if (e.hornetSlow) return drawConstrictor;
  if (e.swarmCap) return drawBrood;
  if (e.unlocks && e.unlocks.length) return drawWax;
  if (e.convert) return drawHoneyStore;
  if (e.capacity && e.capacity.pollen) return drawPollenStore;
  return drawHoneyStore;
}

/** Data URI for a cell glyph, cached per id and size. Safe to call every frame. */
export function cellIconUrl(typeId, size) {
  const px = Math.max(14, Math.round(size || 20));
  const key = `${typeId}@${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const type = CELL_BY_ID.get(typeId);
  if (!type || typeof document === 'undefined') return '';
  const scale = 2; // drawn at 2x so it survives a retina panel
  const canvas = document.createElement('canvas');
  canvas.width = px * scale;
  canvas.height = px * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  shapeFor(type)(ctx, px, inkOf(type));
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** <img> for a cell glyph, shadowed so it holds against the panel and the lit hall alike. */
export function cellIconImg(typeId, size, title) {
  const url = cellIconUrl(typeId, size);
  if (!url) return '';
  const px = Math.max(14, Math.round(size || 20));
  return `<img src="${url}" width="${px}" height="${px}" alt="" title="${title || ''}"
    style="vertical-align:middle;display:inline-block;flex:0 0 auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))">`;
}

/** The same glyph as a real element, for callers building DOM rather than markup. */
export function cellIconEl(typeId, size, title) {
  const url = cellIconUrl(typeId, size);
  const px = Math.max(14, Math.round(size || 20));
  const img = document.createElement('img');
  if (url) img.src = url;
  img.width = px;
  img.height = px;
  img.alt = '';
  if (title) img.title = title;
  img.style.cssText = 'display:block;flex:0 0 auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))';
  return img;
}
