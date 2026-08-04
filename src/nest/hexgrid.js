// Hollowtree — comb lattice: wrapped odd-r hex coordinates on the unwrapped hollow wall, plus inward layers. Maths only.

import { Vector3, Quaternion, Matrix4 } from 'three';
import { COMB } from '../config.js';

const _p = new Vector3();
const _n = new Vector3();
const _t = new Vector3();
const _u = new Vector3();
const _m = new Matrix4();

const OFFSET_EVEN = [
  [1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1],
];
const OFFSET_ODD = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1],
];

function cubeRound(x, y, z) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, ry, rz];
}

export function createHexGrid(volume) {
  const axisX = volume.axisX || 0;
  const axisZ = volume.axisZ || 0;
  const floorY = volume.floorY || 0;
  const ceilY = volume.ceilY || 1;
  const radiusAt = volume.radiusAt || (() => 1);
  const refRadius = volume.refRadius || radiusAt((floorY + ceilY) * 0.5);

  const columns = Math.max(6, Math.round((Math.PI * 2 * refRadius) / COMB.cellWidth));
  const dTheta = (Math.PI * 2) / columns;
  const cellWidth = (Math.PI * 2 * refRadius) / columns;
  const dv = cellWidth * (Math.sqrt(3) / 2);
  const rowBase = floorY + COMB.rowPad;
  const rows = Math.max(1, Math.floor((ceilY - COMB.rowPad - rowBase) / dv));

  const cells = new Map();

  function wrapCol(col) {
    const c = col % columns;
    return c < 0 ? c + columns : c;
  }

  function key(col, row, layer) {
    return `${wrapCol(col)},${row},${layer || 0}`;
  }

  function parseKey(k) {
    const parts = k.split(',');
    return { col: +parts[0], row: +parts[1], layer: +parts[2] };
  }

  function thetaOf(col, row) {
    return (wrapCol(col) + 0.5 * (row & 1)) * dTheta;
  }

  function yOf(row) {
    return rowBase + row * dv;
  }

  function surfaceRadius(row) {
    return radiusAt(yOf(row));
  }

  function cellRadius(row, layer) {
    return surfaceRadius(row) - COMB.wallOffset - (layer || 0) * COMB.cellDepth;
  }

  function isValid(col, row, layer) {
    const l = layer || 0;
    if (row < 0 || row > rows) return false;
    if (l < 0 || l >= COMB.layers) return false;
    return cellRadius(row, l) >= COMB.minCellRadius;
  }

  function cellCenter(col, row, layer, out) {
    const target = out || new Vector3();
    const theta = thetaOf(col, row);
    const r = cellRadius(row, layer);
    return target.set(axisX + Math.cos(theta) * r, yOf(row), axisZ + Math.sin(theta) * r);
  }

  function cellSize(row) {
    return cellWidth * (surfaceRadius(row) / refRadius);
  }

  function cellBasis(col, row, out) {
    const target = out || new Quaternion();
    const theta = thetaOf(col, row);
    const y = yOf(row);
    const h = dv * 0.5;
    const slope = (radiusAt(Math.min(ceilY, y + h)) - radiusAt(Math.max(floorY, y - h))) / (2 * h);
    _n.set(-Math.cos(theta), slope, -Math.sin(theta)).normalize();
    _t.set(-Math.sin(theta), 0, Math.cos(theta)).normalize();
    _u.copy(_n).cross(_t).normalize();
    _t.copy(_u).cross(_n).normalize();
    _m.makeBasis(_t, _u, _n);
    return target.setFromRotationMatrix(_m);
  }

  function neighbors(col, row, layer, out) {
    const list = out || [];
    list.length = 0;
    const table = row & 1 ? OFFSET_ODD : OFFSET_EVEN;
    for (let i = 0; i < 6; i++) {
      const nc = wrapCol(col + table[i][0]);
      const nr = row + table[i][1];
      if (isValid(nc, nr, layer)) list.push({ col: nc, row: nr, layer: layer || 0 });
    }
    const l = layer || 0;
    if (isValid(col, row, l - 1)) list.push({ col: wrapCol(col), row, layer: l - 1 });
    if (isValid(col, row, l + 1)) list.push({ col: wrapCol(col), row, layer: l + 1 });
    return list;
  }

  function worldToCell(point) {
    const dx = point.x - axisX;
    const dz = point.z - axisZ;
    const r = Math.hypot(dx, dz);
    let theta = Math.atan2(dz, dx);
    if (theta < 0) theta += Math.PI * 2;

    const v = (point.y - rowBase) / dv;
    const u = theta / dTheta;

    const q = u - 0.5 * v;
    const [rx, , rz] = cubeRound(q, -q - v, v);
    const row = rz;
    const col = wrapCol(rx + ((rz - (rz & 1)) >> 1));

    const surface = surfaceRadius(row);
    let layer = Math.round((surface - COMB.wallOffset - r) / COMB.cellDepth);
    if (layer < 0) layer = 0;
    if (layer >= COMB.layers) layer = COMB.layers - 1;
    return { col, row, layer };
  }

  function has(col, row, layer) {
    return cells.has(key(col, row, layer));
  }

  function touchesExisting(col, row, layer) {
    if (!cells.size) return false;
    const list = neighbors(col, row, layer);
    for (let i = 0; i < list.length; i++) {
      if (cells.has(key(list[i].col, list[i].row, list[i].layer))) return true;
    }
    return false;
  }

  function canPlace(col, row, layer) {
    if (!isValid(col, row, layer)) return false;
    if (has(col, row, layer)) return false;
    if (!cells.size) return true;
    return touchesExisting(col, row, layer);
  }

  function place(col, row, layer, data) {
    if (!canPlace(col, row, layer)) return null;
    const cell = {
      col: wrapCol(col),
      row,
      layer: layer || 0,
      key: key(col, row, layer),
      data: data || null,
    };
    cells.set(cell.key, cell);
    return cell;
  }

  function remove(col, row, layer) {
    return cells.delete(key(col, row, layer));
  }

  function snap(point, requireTouch) {
    const guess = worldToCell(point);
    if (isValid(guess.col, guess.row, guess.layer) && !has(guess.col, guess.row, guess.layer)) {
      if (!requireTouch || !cells.size || touchesExisting(guess.col, guess.row, guess.layer)) return guess;
    }
    let best = null;
    let bestDist = Infinity;
    const list = neighbors(guess.col, guess.row, guess.layer);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (has(c.col, c.row, c.layer)) continue;
      if (requireTouch && cells.size && !touchesExisting(c.col, c.row, c.layer)) continue;
      cellCenter(c.col, c.row, c.layer, _p);
      const d = _p.distanceToSquared(point);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  function seed(theta, y, layer) {
    let t = theta;
    if (t < 0) t += Math.PI * 2;
    const row = Math.max(0, Math.min(rows, Math.round((y - rowBase) / dv)));
    const col = wrapCol(Math.round(t / dTheta - 0.5 * (row & 1)));
    return { col, row, layer: layer || 0 };
  }

  function selfTest() {
    const fails = [];
    const midRow = Math.floor(rows * 0.5);

    for (let row = Math.max(0, midRow - 3); row <= Math.min(rows, midRow + 3); row++) {
      for (let col = 0; col < columns; col += 7) {
        if (!isValid(col, row, 0)) continue;
        cellCenter(col, row, 0, _p);
        const back = worldToCell(_p);
        if (back.col !== col || back.row !== row || back.layer !== 0) {
          fails.push(`roundtrip ${col},${row},0 -> ${back.col},${back.row},${back.layer}`);
        }
      }
    }

    for (let row = Math.max(0, midRow - 2); row <= Math.min(rows, midRow + 2); row++) {
      for (let col = 0; col < columns; col += 11) {
        if (!isValid(col, row, 0)) continue;
        const list = neighbors(col, row, 0);
        for (let i = 0; i < list.length; i++) {
          const back = neighbors(list[i].col, list[i].row, list[i].layer);
          const found = back.some((c) => c.col === wrapCol(col) && c.row === row && c.layer === 0);
          if (!found) fails.push(`asymmetric ${col},${row} <-> ${list[i].col},${list[i].row},${list[i].layer}`);
        }
      }
    }

    if (isValid(0, midRow, 0) && isValid(columns - 1, midRow, 0)) {
      const a = cellCenter(0, midRow, 0, new Vector3());
      const b = cellCenter(columns - 1, midRow, 0, new Vector3());
      const gap = a.distanceTo(b);
      const expected = cellSize(midRow);
      if (Math.abs(gap - expected) > expected * 0.06) {
        fails.push(`wrap seam ${gap.toFixed(3)} vs ${expected.toFixed(3)}`);
      }
    }

    const spacing = [];
    for (let col = 0; col < Math.min(columns, 16); col++) {
      if (!isValid(col, midRow, 0) || !isValid(col + 1, midRow, 0)) continue;
      const a = cellCenter(col, midRow, 0, new Vector3());
      const b = cellCenter(col + 1, midRow, 0, new Vector3());
      spacing.push(a.distanceTo(b));
    }
    if (spacing.length) {
      const min = Math.min(...spacing);
      const max = Math.max(...spacing);
      if (max - min > max * 0.02) fails.push(`uneven row spacing ${min.toFixed(3)}..${max.toFixed(3)}`);
    }

    const above = neighbors(3, midRow, 0).some((c) => c.row === midRow + 1);
    const inward = neighbors(3, midRow, 0).some((c) => c.layer === 1);
    if (!above) fails.push('missing vertical neighbour');
    if (!inward) fails.push('missing inward layer neighbour');

    return fails;
  }

  return {
    columns,
    rows,
    layers: COMB.layers,
    cellWidth,
    dTheta,
    dv,
    rowBase,
    refRadius,
    cells,
    key,
    parseKey,
    wrapCol,
    isValid,
    cellCenter,
    cellBasis,
    cellSize,
    neighbors,
    worldToCell,
    has,
    touchesExisting,
    canPlace,
    place,
    remove,
    snap,
    seed,
    selfTest,
    clear() {
      cells.clear();
    },
  };
}
