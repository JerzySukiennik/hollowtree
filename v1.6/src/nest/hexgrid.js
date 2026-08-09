// Hollowtree — comb lattice: pointy-top odd-r hex on the hall's unrolled rectangular perimeter, plus inward layers. Maths only.

import { Vector3, Quaternion, Matrix4 } from 'three';
import { COMB } from '../config.js';

const _p = new Vector3();
const _q = new Vector3();
const _n = new Vector3();
const _t = new Vector3();
const _u = new Vector3();
const _m = new Matrix4();
const _up = new Vector3(0, 1, 0);

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
  const minX = volume.minX;
  const maxX = volume.maxX;
  const minZ = volume.minZ;
  const maxZ = volume.maxZ;
  const floorY = volume.floorY;
  const ceilY = volume.ceilY;
  const width = maxX - minX;
  const depth = maxZ - minZ;

  const walls = [
    { id: 0, ox: minX, oz: maxZ, tx: 1, tz: 0, nx: 0, nz: -1, length: width },
    { id: 1, ox: maxX, oz: maxZ, tx: 0, tz: -1, nx: -1, nz: 0, length: depth },
    { id: 2, ox: maxX, oz: minZ, tx: -1, tz: 0, nx: 0, nz: 1, length: width },
    { id: 3, ox: minX, oz: minZ, tx: 0, tz: 1, nx: 1, nz: 0, length: depth },
  ];
  let acc = 0;
  for (const w of walls) {
    w.start = acc;
    acc += w.length;
  }
  const perimeter = acc;

  const columns = Math.max(6, Math.round(perimeter / COMB.cellWidth));
  const cellWidth = perimeter / columns;
  const dv = cellWidth * (Math.sqrt(3) / 2);
  const rowBase = floorY + COMB.rowPad;
  const rows = Math.max(1, Math.floor((ceilY - COMB.rowPad - rowBase) / dv));

  const entranceWall = typeof volume.entranceWall === 'number' ? volume.entranceWall : -1;
  // Comb goes on ONE wall — the one you are looking at when you fly in — and the other three
  // stay bare. Wrapping the lattice round all four made 90% of every aim land on a wall the
  // player had no reason to be at and no way to tell apart, so the hollow read as "red
  // everywhere". Walls are ordered around the perimeter, so the far wall is entrance + 2.
  const buildWall = entranceWall >= 0 ? (entranceWall + 2) % walls.length : 0;
  const entranceS = volume.entranceS || 0;
  const entranceY = volume.entranceY || 0;
  const entranceClear = (volume.entranceRadius || 0) + COMB.entranceClear;

  const cells = new Map();

  function wrapCol(col) {
    const c = col % columns;
    return c < 0 ? c + columns : c;
  }

  function wrapS(s) {
    const v = s % perimeter;
    return v < 0 ? v + perimeter : v;
  }

  function key(col, row, layer) {
    return `${wrapCol(col)},${row},${layer || 0}`;
  }

  function parseKey(k) {
    const parts = k.split(',');
    return { col: +parts[0], row: +parts[1], layer: +parts[2] };
  }

  function sOf(col, row) {
    return wrapS((wrapCol(col) + 0.5 * (row & 1)) * cellWidth);
  }

  function yOf(row) {
    return rowBase + row * dv;
  }

  function wallAt(s) {
    for (let i = walls.length - 1; i >= 0; i--) {
      if (s >= walls[i].start) return walls[i];
    }
    return walls[0];
  }

  function cellCenter(col, row, layer, out) {
    const target = out || new Vector3();
    const s = sOf(col, row);
    const w = wallAt(s);
    const d = s - w.start;
    const inset = COMB.wallOffset + (layer || 0) * COMB.cellDepth;
    return target.set(
      w.ox + w.tx * d + w.nx * inset,
      yOf(row),
      w.oz + w.tz * d + w.nz * inset
    );
  }

  function cellSize() {
    return cellWidth;
  }

  function cellBasis(col, row, out) {
    const target = out || new Quaternion();
    const w = wallAt(sOf(col, row));
    _t.set(w.tx, 0, w.tz);
    _n.set(w.nx, 0, w.nz);
    _u.copy(_up);
    _m.makeBasis(_t, _u, _n);
    return target.setFromRotationMatrix(_m);
  }

  function inEntrance(col, row) {
    if (entranceWall < 0) return false;
    const s = sOf(col, row);
    const w = wallAt(s);
    if (w.id !== entranceWall) return false;
    let ds = Math.abs(s - entranceS);
    if (ds > perimeter * 0.5) ds = perimeter - ds;
    return ds < entranceClear && Math.abs(yOf(row) - entranceY) < entranceClear;
  }

  function isValid(col, row, layer) {
    const l = layer || 0;
    if (row < 0 || row > rows) return false;
    if (l < 0 || l >= COMB.layers) return false;
    if (wallAt(sOf(col, row)).id !== buildWall) return false;
    return !inEntrance(col, row);
  }

  function neighbors(col, row, layer, out) {
    const list = out || [];
    list.length = 0;
    const table = row & 1 ? OFFSET_ODD : OFFSET_EVEN;
    const l = layer || 0;
    for (let i = 0; i < 6; i++) {
      const nc = wrapCol(col + table[i][0]);
      const nr = row + table[i][1];
      if (isValid(nc, nr, l)) list.push({ col: nc, row: nr, layer: l });
    }
    if (isValid(col, row, l - 1)) list.push({ col: wrapCol(col), row, layer: l - 1 });
    if (isValid(col, row, l + 1)) list.push({ col: wrapCol(col), row, layer: l + 1 });
    return list;
  }

  function candidateOn(w, point) {
    const rel = (point.x - w.ox) * w.tx + (point.z - w.oz) * w.tz;
    const d = Math.min(Math.max(rel, 0), w.length);
    const inset = (point.x - w.ox) * w.nx + (point.z - w.oz) * w.nz;
    const v = (point.y - rowBase) / dv;
    const u = (w.start + d) / cellWidth;
    const q = u - 0.5 * v;
    const [rx, , rz] = cubeRound(q, -q - v, v);
    const row = rz;
    const col = wrapCol(rx + ((rz - (rz & 1)) >> 1));
    let layer = Math.round((inset - COMB.wallOffset) / COMB.cellDepth);
    if (layer < 0) layer = 0;
    if (layer >= COMB.layers) layer = COMB.layers - 1;
    return { col, row, layer };
  }

  function worldToCell(point) {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < walls.length; i++) {
      const c = candidateOn(walls[i], point);
      cellCenter(c.col, c.row, c.layer, _q);
      const d = _q.distanceToSquared(point);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
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

  function seed(s, y, layer) {
    const row = Math.max(0, Math.min(rows, Math.round((y - rowBase) / dv)));
    const col = wrapCol(Math.round(wrapS(s) / cellWidth - 0.5 * (row & 1)));
    return { col, row, layer: layer || 0 };
  }

  function selfTest() {
    const fails = [];
    const midRow = Math.floor(rows * 0.5);

    for (let row = Math.max(0, midRow - 4); row <= Math.min(rows, midRow + 4); row++) {
      for (let col = 0; col < columns; col += 3) {
        for (let layer = 0; layer < COMB.layers; layer++) {
          if (!isValid(col, row, layer)) continue;
          cellCenter(col, row, layer, _p);
          const back = worldToCell(_p);
          if (back.col !== col || back.row !== row || back.layer !== layer) {
            fails.push(`roundtrip ${col},${row},${layer} -> ${back.col},${back.row},${back.layer}`);
          }
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

    const a = new Vector3();
    const b = new Vector3();
    for (let col = 0; col < columns; col++) {
      cellCenter(col, midRow, 0, a);
      cellCenter(col + 1, midRow, 0, b);
      const gap = a.distanceTo(b);
      const sameWall = wallAt(sOf(col, midRow)).id === wallAt(sOf(col + 1, midRow)).id;
      if (sameWall) {
        if (Math.abs(gap - cellWidth) > cellWidth * 0.01) {
          fails.push(`flat run ${col} spacing ${gap.toFixed(3)} vs ${cellWidth.toFixed(3)}`);
        }
      } else if (gap < cellWidth * 0.45 || gap > cellWidth * 1.01) {
        fails.push(`corner pinch ${col} spacing ${gap.toFixed(3)}`);
      }
    }

    const list = neighbors(3, midRow, 0);
    if (!list.some((c) => c.row === midRow + 1)) fails.push('missing vertical neighbour');
    if (!list.some((c) => c.layer === 1)) fails.push('missing inward layer neighbour');

    if (entranceWall >= 0) {
      const blocked = seed(entranceS, entranceY, 0);
      if (isValid(blocked.col, blocked.row, 0)) fails.push('entrance aperture is buildable');
    }

    return fails;
  }

  return {
    walls,
    buildWall,
    // Middle of the buildable wall, in perimeter coordinates — where the starting comb goes.
    buildWallCenterS: walls[buildWall].start + walls[buildWall].length * 0.5,
    perimeter,
    columns,
    rows,
    layers: COMB.layers,
    cellWidth,
    dv,
    rowBase,
    cells,
    key,
    parseKey,
    wrapCol,
    wrapS,
    sOf,
    yOf,
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
