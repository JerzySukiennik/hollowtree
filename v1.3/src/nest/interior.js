// Hollowtree — the hollow: a rectangular great hall, authored shell when present and a procedural stand-in otherwise, plus galleries, light wells, dust, AABB colliders and camera containment.

import * as THREE from 'three';
import { INTERIOR, HIVE, FLIGHT } from '../config.js';
import { createHexGrid } from './hexgrid.js';

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _deep = new THREE.Color(INTERIOR.colors.wallDeep);
const _lit = new THREE.Color(INTERIOR.colors.wallLit);
const _base = new THREE.Color();

// ---------------------------------------------------------------- local tuning
//
// Comb is buildable on ONE wall — the far one, the one you face flying in. Everything
// below exists so that wall reads as the wall, at a glance, from the aperture, without
// lighting the room like an office. Measured in game before this landed: the starting
// comb metered 174.3 luma against a 170.6 luma wall — a Weber contrast of 2.1%, i.e.
// invisible. The lion's share of that was not lighting at all: the lattice was keyed off
// the hall's BOUNDING BOX, so every cell sat inside the authored rock (see the cavity
// block below). Tuned against work/lightlab.html.
//
// They live here rather than in config.js because config.js is owned elsewhere; if they
// settle, `BUILD_WALL` and `SHAFTS` belong next to the rest of INTERIOR.
const BUILD_WALL = {
  // One raking lamp, close to the wall and off to one side, so the comb's hex relief
  // catches a grazing light and reads as geometry rather than as a flat brown patch.
  rakeColor: 0xffc282,
  rakeIntensity: 62.0,
  rakeRange: 38.0,
  rakeDecay: 1.45,
  rakeOffset: 7.0,          // stand-off from the wall plane
  rakeSpread: 0.30,         // ± fraction of the wall's length
  rakeLift: 0.06,           // raised above the comb by this fraction of hall height
  // Baked warmth on the wall skin itself, so the wall still reads as "the" wall in the
  // half-second before the lamps' falloff registers.
  tint: 0xc08a4c,
  tintStrength: 0.62,
  tintBandDepth: 2.4,       // how far from the wall plane a vertex counts as wall skin
  tintFalloffU: 0.62,       // across the wall, as a fraction of half its length
  tintFalloffV: 0.34,       // up the wall, as a fraction of hall height
  // A soft glow panel just behind the comb: additive, depth-tested, so the comb cells
  // occlude it and read as relief against a lit wall instead of brown-on-brown.
  glowColor: 0xffb257,
  glowOpacity: 0.34,
  glowWidth: 0.52,          // fraction of the wall's length
  glowHeight: 0.34,         // fraction of hall height
  glowOffset: 0.10,         // in front of the wall plane, behind the comb layer
};

const SHAFTS = {
  // The old shafts were closed polygon tubes: flat additive quads whose silhouette ended
  // on a hard straight line, which is exactly the "border" that showed up across the side
  // walls. They are now single soft-edged planes that turn about their own axis to face
  // the camera, so there is no silhouette to see.
  skylightWidth: 2.2,       // multiple of INTERIOR.skylightWidth
  skylightGain: 1.25,        // multiple of INTERIOR.shaftOpacity
  entranceWidth: 3.4,       // multiple of the entrance radius
  entranceGain: 1.0,
  entranceReach: 0.5,       // fraction of hall depth
};

// The entrance lamp used to sit 5.1 units INSIDE the hall at exactly eye height, so the
// first thing the queen saw on flying in was the lamp itself: the near field metered 137
// luma (250 on the landing) while the far wall metered 4. It now sits in the throat,
// behind her as she comes through, lighting the rim and the landing instead of the lens.
const ENTRANCE_LAMP = { offset: 0.45, gain: 0.5 };

function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function trunkRadiusAt(t) {
  const k = Math.pow(Math.min(1, Math.max(0, t)), 0.72);
  return HIVE.trunkRadiusBase + (HIVE.trunkRadiusTop - HIVE.trunkRadiusBase) * k;
}

function buildSpec(hive, terrain) {
  const axisX = hive && hive.position ? hive.position.x : HIVE.x;
  const axisZ = hive && hive.position ? hive.position.z : HIVE.z;
  const baseY = hive && hive.position ? hive.position.y : (terrain && terrain.getHeight ? terrain.getHeight(axisX, axisZ) : 0);

  const floorY = baseY + INTERIOR.floorLift;
  const maxHeight = FLIGHT.maxAltitude - INTERIOR.ceilingClearance;
  const height = Math.min(Math.max(HIVE.trunkHeight * INTERIOR.heightScale, INTERIOR.minHeight), maxHeight);
  const ceilY = floorY + height;

  const width = INTERIOR.hallWidth;
  const depth = INTERIOR.hallDepth;
  const entranceRadius = HIVE.entranceRadius;

  const entranceWorld = hive && hive.entrance ? hive.entrance : null;
  const ex = entranceWorld ? entranceWorld.x - axisX : 0;
  const ez = entranceWorld ? entranceWorld.z - axisZ : (HIVE.z <= 0 ? 1 : -1) * HIVE.trunkRadiusBase;
  const useZ = Math.abs(ez) >= Math.abs(ex);
  const sign = useZ ? (ez >= 0 ? 1 : -1) : (ex >= 0 ? 1 : -1);
  const reach = Math.max(entranceRadius + INTERIOR.throatLength, Math.abs(useZ ? ez : ex));
  const wallOffset = reach - INTERIOR.throatLength;

  let minX;
  let maxX;
  let minZ;
  let maxZ;
  if (useZ) {
    minX = axisX - width * 0.5;
    maxX = axisX + width * 0.5;
    if (sign > 0) {
      maxZ = axisZ + wallOffset;
      minZ = maxZ - depth;
    } else {
      minZ = axisZ - wallOffset;
      maxZ = minZ + depth;
    }
  } else {
    minZ = axisZ - width * 0.5;
    maxZ = axisZ + width * 0.5;
    if (sign > 0) {
      maxX = axisX + wallOffset;
      minX = maxX - depth;
    } else {
      minX = axisX - wallOffset;
      maxX = minX + depth;
    }
  }

  const entranceY = Math.min(
    ceilY - height * 0.22,
    Math.max(floorY + height * 0.1, entranceWorld ? entranceWorld.y : baseY + HIVE.entranceHeight)
  );

  const entranceNormal = new THREE.Vector3(useZ ? 0 : sign, 0, useZ ? sign : 0);
  const entrancePos = new THREE.Vector3(
    useZ ? axisX : (sign > 0 ? maxX : minX),
    entranceY,
    useZ ? (sign > 0 ? maxZ : minZ) : axisZ
  );

  const wallLengths = [maxX - minX, maxZ - minZ, maxX - minX, maxZ - minZ];
  const wallStarts = [0, wallLengths[0], wallLengths[0] + wallLengths[1], wallLengths[0] + wallLengths[1] + wallLengths[2]];
  const perimeter = wallStarts[3] + wallLengths[3];

  let entranceWall;
  let entranceS;
  if (useZ && sign > 0) {
    entranceWall = 0;
    entranceS = wallStarts[0] + (entrancePos.x - minX);
  } else if (!useZ && sign > 0) {
    entranceWall = 1;
    entranceS = wallStarts[1] + (maxZ - entrancePos.z);
  } else if (useZ) {
    entranceWall = 2;
    entranceS = wallStarts[2] + (maxX - entrancePos.x);
  } else {
    entranceWall = 3;
    entranceS = wallStarts[3] + (entrancePos.z - minZ);
  }

  const half = Math.max(1, trunkRadiusAt((entranceY - baseY) / Math.max(1, HIVE.trunkHeight))) * INTERIOR.clipLateral;

  const skylights = [];
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const spanX = useZ ? INTERIOR.skylightSpanX * (maxX - minX) * 0.5 : INTERIOR.skylightSpanZ * (maxX - minX) * 0.5;
  const spanZ = useZ ? INTERIOR.skylightSpanZ * (maxZ - minZ) * 0.5 : INTERIOR.skylightSpanX * (maxZ - minZ) * 0.5;
  skylights.push({ x: cx - spanX, z: cz + spanZ });
  skylights.push({ x: cx + spanX, z: cz - spanZ });

  function insideDepth(point) {
    const dx = Math.min(point.x - minX, maxX - point.x);
    const dz = Math.min(point.z - minZ, maxZ - point.z);
    const dy = Math.min(point.y - floorY, ceilY - point.y);
    return Math.min(dx, dz, dy);
  }

  function outward(point) {
    return useZ
      ? (sign > 0 ? point.z - maxZ : minZ - point.z)
      : (sign > 0 ? point.x - maxX : minX - point.x);
  }

  function inAperture(point) {
    const lateral = useZ ? Math.abs(point.x - entrancePos.x) : Math.abs(point.z - entrancePos.z);
    if (lateral > entranceRadius * 1.15) return false;
    if (Math.abs(point.y - entranceY) > entranceRadius * 1.15) return false;
    const out = outward(point);
    return out > -INTERIOR.insideMargin * 2 && out < INTERIOR.throatLength + 2;
  }

  function beyondEntranceWall(point) {
    return outward(point) < 0;
  }

  return {
    axisX,
    axisZ,
    baseY,
    floorY,
    ceilY,
    height,
    width: maxX - minX,
    depth: maxZ - minZ,
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: cx,
    centerZ: cz,
    perimeter,
    wallStarts,
    wallLengths,
    entranceY,
    entranceRadius,
    entrancePos,
    entranceNormal,
    entranceWall,
    entranceS,
    entranceAxisZ: useZ,
    entranceSign: sign,
    clipHalf: half,
    skylights,
    insideDepth,
    outward,
    inAperture,
    beyondEntranceWall,
    oversized: Math.max(maxX - minX, maxZ - minZ) * 0.5 > HIVE.trunkRadiusBase,
  };
}

// ------------------------------------------------------------------- cavity
//
// The hall's SPEC is a bounding box: the authored hollow.glb is scaled so its outer
// extents match it. Its rock is thick, so the surface you can actually see and touch is
// inset from that box — measured on the shipped model: 3.3 units on the build wall, 2.3
// and 3.4 on the sides, 5.8 on the floor. The hex lattice and the wall colliders were
// both keyed off the bounding box, which put every comb cell about three units INSIDE
// the rock (the starting comb raycast as hidden behind hollow_shell) and let the queen
// fly into the wall before stopping. Everything that has to meet the visible surface now
// reads spec.cavity instead, measured off the shell itself so it survives a remodel.
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function percentile(list, q) {
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[i];
}

// Cast a fan of rays at the height the comb actually lives at — the room is a tree hollow
// and narrows toward the ceiling, so probing at mid-height would report a wall several
// units further in than the one the comb meets. Take a low percentile of the hits, i.e.
// lean toward the nearest surface, so cells end up proud of the rock rather than in it.
function probeWall(targets, spec, dir, sign, spread, q) {
  const across = dir.x !== 0 ? 'z' : 'x';
  const halfAcross = across === 'x' ? spec.width * 0.5 : spec.depth * 0.5;
  const cx = spec.centerX;
  const cz = spec.centerZ;
  const y0 = Math.min(Math.max(spec.entranceY, spec.floorY + spec.height * 0.12), spec.ceilY - spec.height * 0.12);
  const axis = dir.x !== 0 ? 'x' : 'y';
  const hits = [];
  const far = Math.max(spec.width, spec.depth, spec.height) * 1.5;
  for (let i = -4; i <= 4; i++) {
    for (let j = -1; j <= 1; j++) {
      _rayOrigin.set(cx, y0 + j * spec.height * 0.07, cz);
      const u = (i / 4) * halfAcross * spread;
      if (across === 'x') _rayOrigin.x += u; else _rayOrigin.z += u;
      _raycaster.set(_rayOrigin, _rayDir.copy(dir));
      _raycaster.far = far;
      const hit = _raycaster.intersectObjects(targets, false)[0];
      if (hit) hits.push(hit.point[dir.x !== 0 ? 'x' : 'z']);
    }
  }
  void axis;
  // sign > 0 means the wall is at a LOW coordinate (minX/minZ): the nearest surface is the
  // largest value, so take a high percentile there and a low one on the far side.
  return percentile(hits, sign > 0 ? q : 1 - q);
}

function probeVertical(targets, spec, dir, sign, spread, q) {
  const hits = [];
  const far = Math.max(spec.width, spec.depth, spec.height) * 1.5;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      _rayOrigin.set(
        spec.centerX + (i / 2) * spec.width * 0.3,
        spec.floorY + spec.height * 0.5,
        spec.centerZ + (j / 2) * spec.depth * 0.3
      );
      _raycaster.set(_rayOrigin, _rayDir.copy(dir));
      _raycaster.far = far;
      const hit = _raycaster.intersectObjects(targets, false)[0];
      if (hit) hits.push(hit.point.y);
    }
  }
  void spread;
  return percentile(hits, sign > 0 ? q : 1 - q);
}

function measureCavity(shell, spec) {
  const cavity = {
    minX: spec.minX, maxX: spec.maxX,
    minZ: spec.minZ, maxZ: spec.maxZ,
    floorY: spec.floorY, ceilY: spec.ceilY,
    measured: false,
  };
  if (!shell) return cavity;
  const targets = [];
  shell.traverse((child) => {
    // Ledges, deco and pools stand proud of the wall; only the shell itself is the room.
    if (child.isMesh && /shell/i.test(child.name || '')) targets.push(child);
  });
  if (!targets.length) return cavity;
  shell.updateMatrixWorld(true);

  // The wall the comb goes on is probed tightly, right where the starting comb sits, and
  // at the median: the lattice is a flat plane and the rock is not, so the plane is fitted
  // to the patch that matters instead of to the whole wall.
  const combWall = ['maxZ', 'maxX', 'minZ', 'minX'][((spec.entranceWall | 0) + 2) % 4];
  const faces = [
    ['maxX', new THREE.Vector3(1, 0, 0), -1, probeWall],
    ['minX', new THREE.Vector3(-1, 0, 0), 1, probeWall],
    ['maxZ', new THREE.Vector3(0, 0, 1), -1, probeWall],
    ['minZ', new THREE.Vector3(0, 0, -1), 1, probeWall],
    ['ceilY', new THREE.Vector3(0, 1, 0), -1, probeVertical],
    ['floorY', new THREE.Vector3(0, -1, 0), 1, probeVertical],
  ];
  for (const [key, dir, sign, probe] of faces) {
    const tight = key === combWall;
    const found = probe(targets, spec, dir, sign, tight ? 0.16 : 0.5, tight ? 0.5 : 0.72);
    if (found === null || !Number.isFinite(found)) continue;
    // Only ever pull the surface INWARD; a stray miss must not grow the room.
    cavity[key] = sign > 0 ? Math.max(cavity[key], found) : Math.min(cavity[key], found);
    cavity.measured = true;
  }
  // Refuse anything degenerate rather than shipping a room with no floor.
  if (cavity.maxX - cavity.minX < spec.width * 0.5
    || cavity.maxZ - cavity.minZ < spec.depth * 0.5
    || cavity.ceilY - cavity.floorY < spec.height * 0.4) {
    console.warn('[interior] cavity probe looked wrong — falling back to the hall bounds');
    return {
      minX: spec.minX, maxX: spec.maxX, minZ: spec.minZ, maxZ: spec.maxZ,
      floorY: spec.floorY, ceilY: spec.ceilY, measured: false,
    };
  }
  return cavity;
}

// The one buildable wall, derived the same way the hex lattice derives it: walls run
// 0 = maxZ, 1 = maxX, 2 = minZ, 3 = minX around the perimeter, and comb goes on
// entranceWall + 2 — the far wall, the one you are looking at when you fly in.
function buildWallInfo(spec) {
  const box = spec.cavity || spec;
  const wall = ((spec.entranceWall | 0) + 2) % 4;
  const centreY = spec.entranceY;
  const cx = (box.minX + box.maxX) * 0.5;
  const cz = (box.minZ + box.maxZ) * 0.5;
  if (wall === 0 || wall === 2) {
    const plane = wall === 0 ? box.maxZ : box.minZ;
    return {
      wall,
      axis: 'z',
      plane,
      normal: new THREE.Vector3(0, 0, wall === 0 ? -1 : 1),
      tangent: new THREE.Vector3(1, 0, 0),
      centre: new THREE.Vector3(cx, centreY, plane),
      half: (box.maxX - box.minX) * 0.5,
    };
  }
  const plane = wall === 1 ? box.maxX : box.minX;
  return {
    wall,
    axis: 'x',
    plane,
    normal: new THREE.Vector3(wall === 1 ? -1 : 1, 0, 0),
    tangent: new THREE.Vector3(0, 0, 1),
    centre: new THREE.Vector3(plane, centreY, cz),
    half: (box.maxZ - box.minZ) * 0.5,
  };
}

// 0..1 — how much of the build wall's baked warmth a point at (x,y,z) should get. Falls
// off with distance from the wall plane, across the wall and up it, so the wall glows
// around the starting comb and dies out before the corners.
function buildWallGlow(spec, x, y, z) {
  const w = spec.buildWall;
  if (!w) return 0;
  const along = w.axis === 'z' ? z : x;
  const depth = Math.abs(along - w.plane);
  if (depth > BUILD_WALL.tintBandDepth) return 0;
  const u = (w.axis === 'z' ? x - w.centre.x : z - w.centre.z) / Math.max(1, w.half);
  const v = (y - w.centre.y) / Math.max(1, spec.height);
  const near = 1 - smoothstep(0, BUILD_WALL.tintBandDepth, depth);
  const across = 1 - smoothstep(0, BUILD_WALL.tintFalloffU, Math.abs(u));
  const up = 1 - smoothstep(0, BUILD_WALL.tintFalloffV, Math.abs(v));
  return near * across * up;
}

function hallLuminance(spec, x, y, z) {
  const dEntrance = Math.hypot(x - spec.entrancePos.x, y - spec.entrancePos.y, z - spec.entrancePos.z);
  const entrance = 1 - smoothstep(3, spec.depth * 1.15, dEntrance);

  let sky = 0;
  for (let i = 0; i < spec.skylights.length; i++) {
    const s = spec.skylights[i];
    const d = Math.hypot(x - s.x, z - s.z);
    const near = 1 - smoothstep(INTERIOR.skylightWidth * 0.5, INTERIOR.skylightWidth * 3.4, d);
    sky = Math.max(sky, near * smoothstep(spec.floorY, spec.ceilY, y));
  }

  let knot = 0;
  if (spec.knots) {
    for (let i = 0; i < spec.knots.length; i++) {
      const k = spec.knots[i];
      const d = Math.hypot(x - k.x, y - k.y, z - k.z);
      knot = Math.max(knot, 1 - smoothstep(INTERIOR.knotWidth, INTERIOR.knotBeamLength * 0.5, d));
    }
  }

  const rise = smoothstep(spec.floorY, spec.floorY + spec.height * 0.3, y) * 0.22;
  const corner =
    smoothstep(spec.width * 0.5, spec.width * 0.18, Math.abs(x - spec.centerX)) *
    smoothstep(spec.depth * 0.5, spec.depth * 0.18, Math.abs(z - spec.centerZ));

  return Math.min(1.4, entrance * 0.85 + sky * 0.8 + knot * 0.7 + rise + corner * 0.12);
}

function newBuf() {
  return { pos: [], nrm: [], col: [], idx: [] };
}

const _tint = new THREE.Color(BUILD_WALL.tint);

function vert(buf, spec, x, y, z, nx, ny, nz, base) {
  const lum = hallLuminance(spec, x, y, z);
  _c.copy(_deep).lerp(_base.set(base), Math.min(1, 0.28 + lum * 0.6));
  _c.lerp(_lit, Math.min(0.85, lum * 0.62));
  const glow = buildWallGlow(spec, x, y, z);
  if (glow > 0) _c.lerp(_tint, glow * BUILD_WALL.tintStrength);
  buf.pos.push(x, y, z);
  buf.nrm.push(nx, ny, nz);
  buf.col.push(_c.r, _c.g, _c.b);
  return buf.pos.length / 3 - 1;
}

function addGrid(buf, spec, ox, oy, oz, ux, uy, uz, vx, vy, vz, uLen, vLen, cols, rows, nx, ny, nz, base, holes) {
  const grid = [];
  for (let r = 0; r <= rows; r++) {
    const v = (r / rows) * vLen;
    const line = [];
    for (let c = 0; c <= cols; c++) {
      const u = (c / cols) * uLen;
      line.push(
        vert(buf, spec, ox + ux * u + vx * v, oy + uy * u + vy * v, oz + uz * u + vz * v, nx, ny, nz, base)
      );
    }
    grid.push(line);
  }
  for (let r = 0; r < rows; r++) {
    const vm = ((r + 0.5) / rows) * vLen;
    for (let c = 0; c < cols; c++) {
      const um = ((c + 0.5) / cols) * uLen;
      let skip = false;
      if (holes) {
        for (let h = 0; h < holes.length; h++) {
          const hole = holes[h];
          if (um > hole.u0 && um < hole.u1 && vm > hole.v0 && vm < hole.v1) {
            skip = true;
            break;
          }
        }
      }
      if (skip) continue;
      const a = grid[r][c];
      const b = grid[r][c + 1];
      const d = grid[r + 1][c];
      const e = grid[r + 1][c + 1];
      buf.idx.push(a, b, d, b, e, d);
    }
  }
}

function addBox(buf, spec, min, max, base) {
  const faces = [
    [0, 1, 0, min.x, max.y, min.z, 1, 0, 0, 0, 0, 1, max.x - min.x, max.z - min.z],
    [0, -1, 0, min.x, min.y, min.z, 1, 0, 0, 0, 0, 1, max.x - min.x, max.z - min.z],
    [1, 0, 0, max.x, min.y, min.z, 0, 0, 1, 0, 1, 0, max.z - min.z, max.y - min.y],
    [-1, 0, 0, min.x, min.y, min.z, 0, 0, 1, 0, 1, 0, max.z - min.z, max.y - min.y],
    [0, 0, 1, min.x, min.y, max.z, 1, 0, 0, 0, 1, 0, max.x - min.x, max.y - min.y],
    [0, 0, -1, min.x, min.y, min.z, 1, 0, 0, 0, 1, 0, max.x - min.x, max.y - min.y],
  ];
  for (const f of faces) {
    const [nx, ny, nz, ox, oy, oz, ux, uy, uz, vx, vy, vz, uLen, vLen] = f;
    const a = vert(buf, spec, ox, oy, oz, nx, ny, nz, base);
    const b = vert(buf, spec, ox + ux * uLen, oy + uy * uLen, oz + uz * uLen, nx, ny, nz, base);
    const c = vert(buf, spec, ox + vx * vLen, oy + vy * vLen, oz + vz * vLen, nx, ny, nz, base);
    const d = vert(buf, spec, ox + ux * uLen + vx * vLen, oy + uy * uLen + vy * vLen, oz + uz * uLen + vz * vLen, nx, ny, nz, base);
    buf.idx.push(a, b, c, b, d, c);
  }
}

function galleryBoxes(spec) {
  const boxes = [];
  const tiers = Math.max(1, INTERIOR.galleryTiers);
  const runLong = spec.width * INTERIOR.ledgeRunLong;
  const runShort = spec.depth * INTERIOR.ledgeRunShort;
  const th = INTERIOR.ledgeThickness;
  const dp = INTERIOR.ledgeDepth;

  for (let t = 0; t < tiers; t++) {
    const k = tiers === 1 ? 0.5 : t / (tiers - 1);
    const y = spec.floorY + lerp(INTERIOR.galleryStart, INTERIOR.galleryEnd, k) * spec.height;
    const swing = (t % 2 === 0 ? 1 : -1) * 0.16;

    const cx = spec.centerX + spec.width * swing;
    boxes.push({
      min: new THREE.Vector3(cx - runLong * 0.5, y - th, spec.minZ),
      max: new THREE.Vector3(cx + runLong * 0.5, y, spec.minZ + dp),
    });
    boxes.push({
      min: new THREE.Vector3(cx - runLong * 0.5, y - th, spec.maxZ - dp),
      max: new THREE.Vector3(cx + runLong * 0.5, y, spec.maxZ),
    });

    const cz = spec.centerZ - spec.depth * swing;
    boxes.push({
      min: new THREE.Vector3(spec.minX, y - th, cz - runShort * 0.5),
      max: new THREE.Vector3(spec.minX + dp, y, cz + runShort * 0.5),
    });
    boxes.push({
      min: new THREE.Vector3(spec.maxX - dp, y - th, cz - runShort * 0.5),
      max: new THREE.Vector3(spec.maxX, y, cz + runShort * 0.5),
    });
  }
  return boxes;
}

function alcoveBoxes(spec) {
  const boxes = [];
  const tiers = Math.max(1, INTERIOR.alcoveTiers);
  const w = INTERIOR.alcoveWidth;
  const d = INTERIOR.alcoveDepth;
  const th = INTERIOR.ledgeThickness * 1.4;
  const corners = [
    [spec.minX, spec.minZ, 1, 1],
    [spec.maxX, spec.minZ, -1, 1],
    [spec.minX, spec.maxZ, 1, -1],
    [spec.maxX, spec.maxZ, -1, -1],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [x, z, sx, sz] = corners[i];
    for (let t = 0; t < tiers; t++) {
      const k = (t + (i % 2) * 0.5) / Math.max(1, tiers - 1 + 0.5);
      const y = spec.floorY + lerp(INTERIOR.alcoveStart, INTERIOR.alcoveEnd, Math.min(1, k)) * spec.height;
      boxes.push({
        min: new THREE.Vector3(Math.min(x, x + sx * w), y - th, Math.min(z, z + sz * d)),
        max: new THREE.Vector3(Math.max(x, x + sx * w), y, Math.max(z, z + sz * d)),
      });
    }
  }
  return boxes;
}

function pillarBoxes(spec) {
  const boxes = [];
  const h = INTERIOR.pillarSize * 0.5;
  const offsets = [
    [-INTERIOR.pillarSpanX, -INTERIOR.pillarSpanZ],
    [INTERIOR.pillarSpanX, INTERIOR.pillarSpanZ],
    [-INTERIOR.pillarSpanX * 0.42, INTERIOR.pillarSpanZ],
    [INTERIOR.pillarSpanX * 0.42, -INTERIOR.pillarSpanZ],
  ];
  for (const [ox, oz] of offsets) {
    const x = spec.centerX + ox * spec.width * 0.5;
    const z = spec.centerZ + oz * spec.depth * 0.5;
    boxes.push({
      min: new THREE.Vector3(x - h, spec.floorY, z - h),
      max: new THREE.Vector3(x + h, spec.ceilY, z + h),
    });
  }
  return boxes;
}

function landingBox(spec) {
  const w = INTERIOR.landingWidth * 0.5;
  const d = INTERIOR.landingDepth;
  const y = spec.entranceY - spec.entranceRadius * 0.8;
  if (spec.entranceAxisZ) {
    const z0 = spec.entranceSign > 0 ? spec.maxZ - d : spec.minZ;
    return {
      min: new THREE.Vector3(spec.entrancePos.x - w, y - INTERIOR.landingThickness, z0),
      max: new THREE.Vector3(spec.entrancePos.x + w, y, z0 + d),
    };
  }
  const x0 = spec.entranceSign > 0 ? spec.maxX - d : spec.minX;
  return {
    min: new THREE.Vector3(x0, y - INTERIOR.landingThickness, spec.entrancePos.z - w),
    max: new THREE.Vector3(x0 + d, y, spec.entrancePos.z + w),
  };
}

function PLACEHOLDER_hallShell(spec, ledges) {
  const buf = newBuf();
  const long = INTERIOR.segmentsLong;
  const short = INTERIOR.segmentsShort;
  const up = INTERIOR.segmentsUp;
  const W = spec.width;
  const D = spec.depth;
  const H = spec.height;

  const ceilHoles = spec.skylights.map((s) => ({
    u0: s.x - spec.minX - INTERIOR.skylightWidth * 0.5,
    u1: s.x - spec.minX + INTERIOR.skylightWidth * 0.5,
    v0: s.z - spec.minZ - INTERIOR.skylightDepth * 0.5,
    v1: s.z - spec.minZ + INTERIOR.skylightDepth * 0.5,
  }));

  addGrid(buf, spec, spec.minX, spec.floorY, spec.minZ, 1, 0, 0, 0, 0, 1, W, D, long, short, 0, 1, 0, INTERIOR.colors.floor, null);
  addGrid(buf, spec, spec.minX, spec.ceilY, spec.minZ, 1, 0, 0, 0, 0, 1, W, D, long, short, 0, -1, 0, INTERIOR.colors.ceiling, ceilHoles);

  const g = spec.entranceRadius;
  const holeZ = [{
    u0: spec.entrancePos.x - spec.minX - g,
    u1: spec.entrancePos.x - spec.minX + g,
    v0: spec.entranceY - spec.floorY - g,
    v1: spec.entranceY - spec.floorY + g,
  }];
  const holeX = [{
    u0: spec.entrancePos.z - spec.minZ - g,
    u1: spec.entrancePos.z - spec.minZ + g,
    v0: spec.entranceY - spec.floorY - g,
    v1: spec.entranceY - spec.floorY + g,
  }];
  const onZ = spec.entranceAxisZ;

  addGrid(buf, spec, spec.minX, spec.floorY, spec.maxZ, 1, 0, 0, 0, 1, 0, W, H, long, up, 0, 0, -1, INTERIOR.colors.wall,
    onZ && spec.entranceSign > 0 ? holeZ : null);
  addGrid(buf, spec, spec.minX, spec.floorY, spec.minZ, 1, 0, 0, 0, 1, 0, W, H, long, up, 0, 0, 1, INTERIOR.colors.wall,
    onZ && spec.entranceSign < 0 ? holeZ : null);
  addGrid(buf, spec, spec.maxX, spec.floorY, spec.minZ, 0, 0, 1, 0, 1, 0, D, H, short, up, -1, 0, 0, INTERIOR.colors.wall,
    !onZ && spec.entranceSign > 0 ? holeX : null);
  addGrid(buf, spec, spec.minX, spec.floorY, spec.minZ, 0, 0, 1, 0, 1, 0, D, H, short, up, 1, 0, 0, INTERIOR.colors.wall,
    !onZ && spec.entranceSign < 0 ? holeX : null);

  for (const box of ledges) addBox(buf, spec, box.min, box.max, INTERIOR.colors.ledge);

  const n = spec.entranceNormal;
  const inner = g * INTERIOR.throatFlare;
  const outer = g;
  const L = INTERIOR.throatLength;
  const tx = spec.entranceAxisZ ? 1 : 0;
  const tz = spec.entranceAxisZ ? 0 : 1;
  const p = spec.entrancePos;
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const innerIdx = [];
  const outerIdx = [];
  for (let i = 0; i < 4; i++) {
    const [su, sv] = ring[i];
    innerIdx.push(vert(buf, spec,
      p.x + tx * su * inner, p.y + sv * inner, p.z + tz * su * inner,
      -su * tx, -sv, -su * tz, INTERIOR.colors.ledge));
    outerIdx.push(vert(buf, spec,
      p.x + n.x * L + tx * su * outer, p.y + sv * outer, p.z + n.z * L + tz * su * outer,
      -su * tx, -sv, -su * tz, INTERIOR.colors.wall));
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    buf.idx.push(innerIdx[i], outerIdx[i], innerIdx[j], innerIdx[j], outerIdx[i], outerIdx[j]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  geometry.setIndex(buf.idx);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, dithering: true })
  );
  mesh.name = 'hollow_shell_placeholder';
  mesh.frustumCulled = false;
  return mesh;
}

function adoptAuthoredHall(source, spec) {
  const model = source.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const sx = size.x > 0.01 ? spec.width / size.x : 1;
  const sy = size.y > 0.01 ? spec.height / size.y : 1;
  const sz = size.z > 0.01 ? spec.depth / size.z : 1;
  model.scale.set(sx, sy, sz);
  model.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(model);
  model.position.set(
    spec.centerX - (scaled.min.x + scaled.max.x) * 0.5,
    spec.floorY - scaled.min.y,
    spec.centerZ - (scaled.min.z + scaled.max.z) * 0.5
  );
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;
    child.frustumCulled = false;
    if (child.name === 'hollow_pools' && child.material && child.material.emissive) {
      child.material.emissive = new THREE.Color(INTERIOR.colors.pool);
      child.material.emissiveIntensity = 1.0;
    }
  });
  tintBuildWall(model, spec);
  return model;
}

// The authored hall carries its shading in vertex colours, so the one buildable wall is
// marked the same way: its skin is lerped toward a warm honey, strongest around the
// starting comb and gone by the corners. The other three walls are left as bare rock.
const _vc = new THREE.Color();
function tintBuildWall(model, spec) {
  if (!spec.buildWall) return;
  const point = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const pos = child.geometry.getAttribute('position');
    const col = child.geometry.getAttribute('color');
    if (!pos || !col) return;
    let touched = false;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      const glow = buildWallGlow(spec, point.x, point.y, point.z);
      if (glow <= 0) continue;
      _vc.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      _vc.lerp(_tint, glow * BUILD_WALL.tintStrength);
      col.setXYZ(i, _vc.r, _vc.g, _vc.b);
      touched = true;
    }
    if (touched) col.needsUpdate = true;
  });
}

// A soft mask for a light shaft: bright at the source, gone by the far end, and — the
// part that matters — zero at BOTH rims across the beam, so the plane has no silhouette.
let _shaftTexture = null;
function shaftTexture() {
  if (_shaftTexture) return _shaftTexture;
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const along = Math.pow(1 - y / (h - 1), 1.7);
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const across = Math.pow(Math.max(0, 1 - u * u), 1.9);
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * along * across);
    }
  }
  ctx.putImageData(img, 0, 0);
  _shaftTexture = new THREE.CanvasTexture(canvas);
  return _shaftTexture;
}

const _shaftPos = new THREE.Vector3();
const _shaftUp = new THREE.Vector3();
const _shaftToCam = new THREE.Vector3();
const _shaftRight = new THREE.Vector3();
const _shaftBasis = new THREE.Matrix4();

// Turn the plane about its own axis until it faces the camera. A shaft is a volume; a
// flat quad only reads as one if you never see it edge-on and never see where it ends.
function faceCameraAboutAxis(mesh, camera) {
  const up = mesh.userData.shaftUp;
  if (!up || !camera) return;
  mesh.getWorldPosition(_shaftPos);
  _shaftUp.copy(up);
  _shaftToCam.copy(camera.position).sub(_shaftPos);
  _shaftToCam.addScaledVector(_shaftUp, -_shaftUp.dot(_shaftToCam));
  if (_shaftToCam.lengthSq() < 1e-6) return;
  _shaftToCam.normalize();
  _shaftRight.crossVectors(_shaftUp, _shaftToCam).normalize();
  _shaftBasis.makeBasis(_shaftRight, _shaftUp, _shaftToCam);
  mesh.quaternion.setFromRotationMatrix(_shaftBasis);
}

// source: where the light comes in. dir: unit vector the beam travels along.
function shaftPlane(source, dir, length, width, color, opacity) {
  const material = new THREE.MeshBasicMaterial({
    color,
    map: shaftTexture(),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
  // Local +Y is the source end of the mask, so the plane's up axis points back up the beam.
  mesh.userData.shaftUp = dir.clone().negate().normalize();
  mesh.position.copy(source).addScaledVector(dir, length * 0.5);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.onBeforeRender = (renderer, scene, camera) => faceCameraAboutAxis(mesh, camera);
  return mesh;
}

function buildShafts(spec) {
  const group = new THREE.Group();
  group.name = 'hollow_shafts';

  const down = new THREE.Vector3(0, -1, 0);
  const yTop = spec.ceilY - 0.2;
  const yBot = spec.floorY + spec.height * 0.04;
  for (const s of spec.skylights) {
    group.add(shaftPlane(
      new THREE.Vector3(s.x, yTop, s.z),
      down,
      yTop - yBot,
      INTERIOR.skylightWidth * SHAFTS.skylightWidth,
      INTERIOR.colors.shaftCool,
      INTERIOR.shaftOpacity * SHAFTS.skylightGain
    ));
  }

  const inward = spec.entranceNormal.clone().negate();
  group.add(shaftPlane(
    spec.entrancePos.clone(),
    inward,
    spec.depth * SHAFTS.entranceReach,
    spec.entranceRadius * SHAFTS.entranceWidth,
    INTERIOR.colors.shaftWarm,
    INTERIOR.shaftOpacity * SHAFTS.entranceGain
  ));

  return group;
}

function knotholeSpots(spec) {
  const spots = [];
  const n = Math.max(0, INTERIOR.knotCount);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = spec.floorY + spec.height * (0.28 + 0.56 * ((i * 0.37) % 1));
    const along = -0.78 + 1.56 * ((i * 0.31 + 0.17) % 1);
    if (i % 4 === 0) {
      spots.push({ x: spec.centerX + along * spec.width * 0.5, y, z: spec.minZ, nx: 0, nz: 1, tx: 1, tz: 0 });
    } else if (i % 4 === 1) {
      spots.push({ x: spec.maxX, y, z: spec.centerZ + along * spec.depth * 0.5, nx: -1, nz: 0, tx: 0, tz: 1 });
    } else if (i % 4 === 2) {
      spots.push({ x: spec.centerX - along * spec.width * 0.5, y, z: spec.maxZ, nx: 0, nz: -1, tx: 1, tz: 0 });
    } else {
      spots.push({ x: spec.minX, y, z: spec.centerZ - along * spec.depth * 0.5, nx: 1, nz: 0, tx: 0, tz: 1 });
    }
    void t;
  }
  return spots.filter((s) => Math.hypot(s.x - spec.entrancePos.x, s.y - spec.entranceY, s.z - spec.entrancePos.z) > spec.entranceRadius * 3);
}

function buildKnotholes(spec, spots) {
  const group = new THREE.Group();
  const hw = INTERIOR.knotWidth * 0.5;
  const hh = INTERIOR.knotHeight * 0.5;

  const facePos = [];
  const faceIdx = [];
  for (const s of spots) {
    const b = facePos.length / 3;
    const ex = s.tx * hw;
    const ez = s.tz * hw;
    facePos.push(s.x - ex + s.nx * 0.05, s.y - hh, s.z - ez + s.nz * 0.05);
    facePos.push(s.x + ex + s.nx * 0.05, s.y - hh, s.z + ez + s.nz * 0.05);
    facePos.push(s.x + ex + s.nx * 0.05, s.y + hh, s.z + ez + s.nz * 0.05);
    facePos.push(s.x - ex + s.nx * 0.05, s.y + hh, s.z - ez + s.nz * 0.05);
    faceIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(facePos, 3));
  faceGeo.setIndex(faceIdx);
  const faces = new THREE.Mesh(
    faceGeo,
    new THREE.MeshBasicMaterial({ color: INTERIOR.colors.knot, side: THREE.DoubleSide, toneMapped: false })
  );
  faces.frustumCulled = false;
  group.add(faces);

  const pos = [];
  const col = [];
  const idx = [];
  const near = new THREE.Color(INTERIOR.colors.knot);
  const far = new THREE.Color(INTERIOR.colors.knot).multiplyScalar(0.02);
  const L = INTERIOR.knotBeamLength;
  const spread = INTERIOR.knotBeamSpread;
  for (const s of spots) {
    const b = pos.length / 3;
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [u, v] of ring) {
      pos.push(s.x + s.tx * u * hw, s.y + v * hh, s.z + s.tz * u * hw);
      col.push(near.r, near.g, near.b);
    }
    for (const [u, v] of ring) {
      pos.push(
        s.x + s.nx * L + s.tx * u * hw * spread,
        s.y + v * hh * spread - L * 0.3,
        s.z + s.nz * L + s.tz * u * hw * spread
      );
      col.push(far.r, far.g, far.b);
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      idx.push(b + i, b + j, b + 4 + i, b + j, b + 4 + j, b + 4 + i);
    }
  }
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  beamGeo.setIndex(idx);
  const beams = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: INTERIOR.knotBeamOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  );
  beams.frustumCulled = false;
  group.add(beams);
  return group;
}

function buildPools(spec) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: INTERIOR.colors.pool, toneMapped: false, transparent: true, opacity: 0.85 });
  for (let i = 0; i < INTERIOR.poolCount; i++) {
    const a = (i / INTERIOR.poolCount) * Math.PI * 2 + 0.7;
    const geo = new THREE.CircleGeometry(INTERIOR.poolRadius * (0.6 + (i % 3) * 0.24), 12);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(
      spec.centerX + Math.cos(a) * spec.width * 0.28,
      spec.floorY + 0.06,
      spec.centerZ + Math.sin(a) * spec.depth * 0.28
    );
    mesh.name = 'hollow_pools';
    group.add(mesh);
  }
  return group;
}

let _dustTexture = null;
function dustSprite() {
  if (_dustTexture) return _dustTexture;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _dustTexture = new THREE.CanvasTexture(canvas);
  return _dustTexture;
}

function buildDust(spec) {
  const count = INTERIOR.dustCount;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = lerp(spec.minX + 1, spec.maxX - 1, Math.random());
    positions[i * 3 + 1] = spec.floorY + Math.random() * spec.height;
    positions[i * 3 + 2] = lerp(spec.minZ + 1, spec.maxZ - 1, Math.random());
    seeds[i * 3] = Math.random() * Math.PI * 2;
    seeds[i * 3 + 1] = 0.4 + Math.random() * 1.4;
    seeds[i * 3 + 2] = Math.random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: INTERIOR.colors.dust,
      size: INTERIOR.dustSize,
      map: dustSprite(),
      alphaTest: 0.02,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  points.frustumCulled = false;
  points.userData.seeds = seeds;
  points.userData.base = positions.slice();
  return points;
}

// A wide, soft warm panel a hair in front of the build wall. It is additive and depth
// TESTED, so every comb cell occludes it: the comb reads as dark relief on a lit wall
// rather than as brown on brown. Nothing but this wall gets one.
function buildWallGlowPanel(spec) {
  const w = spec.buildWall;
  if (!w) return null;
  const width = w.half * 2 * BUILD_WALL.glowWidth;
  const height = spec.height * BUILD_WALL.glowHeight;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color: BUILD_WALL.glowColor,
      map: dustSprite(),
      transparent: true,
      opacity: BUILD_WALL.glowOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  mesh.name = 'hollow_build_wall_glow';
  mesh.position.copy(w.centre).addScaledVector(w.normal, BUILD_WALL.glowOffset);
  if (w.axis === 'x') mesh.rotation.y = w.normal.x > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  else if (w.normal.z < 0) mesh.rotation.y = Math.PI;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

function buildLights(spec) {
  const lights = [];
  const entrance = new THREE.PointLight(
    INTERIOR.entranceLightColor,
    INTERIOR.entranceLightIntensity * ENTRANCE_LAMP.gain,
    INTERIOR.entranceLightRange,
    1.5
  );
  entrance.position.copy(spec.entrancePos).addScaledVector(spec.entranceNormal, INTERIOR.throatLength * ENTRANCE_LAMP.offset);
  lights.push(entrance);

  // The build wall gets exactly ONE lamp. Its job is not to raise the wall's brightness —
  // the baked tint and the glow panel already do that for free — but to come at the comb
  // from one side so the hex relief throws a shadow and reads as geometry. Measured on the
  // shipped scene at 1600x900: each extra point light costs about 1 ms a frame, and a
  // second raker plus a fill moved the wall by 9 luma and the contrast not at all, so they
  // were cut. See work/lightlab.html.
  const w = spec.buildWall;
  if (w) {
    const rake = new THREE.PointLight(BUILD_WALL.rakeColor, BUILD_WALL.rakeIntensity, BUILD_WALL.rakeRange, BUILD_WALL.rakeDecay);
    rake.position.copy(w.centre)
      .addScaledVector(w.normal, BUILD_WALL.rakeOffset)
      .addScaledVector(w.tangent, -w.half * BUILD_WALL.rakeSpread);
    rake.position.y = w.centre.y + spec.height * BUILD_WALL.rakeLift;
    lights.push(rake);
  }

  for (const s of spec.skylights) {
    const light = new THREE.PointLight(INTERIOR.skylightLightColor, INTERIOR.skylightLightIntensity, INTERIOR.skylightLightRange, 1.4);
    light.position.set(s.x, spec.ceilY - spec.height * 0.08, s.z);
    lights.push(light);
  }

  const crown = new THREE.PointLight(INTERIOR.crownLightColor, INTERIOR.crownLightIntensity, INTERIOR.crownLightRange, 1.5);
  crown.position.set(spec.centerX, spec.floorY + spec.height * 0.62, spec.centerZ);
  lights.push(crown);

  const basin = new THREE.PointLight(INTERIOR.basinLightColor, INTERIOR.basinLightIntensity, INTERIOR.basinLightRange, 1.7);
  basin.position.set(spec.centerX, spec.floorY + 2.2, spec.centerZ);
  lights.push(basin);

  const ambient = new THREE.AmbientLight(INTERIOR.ambientColor, INTERIOR.ambientIntensity);
  const hemi = new THREE.HemisphereLight(INTERIOR.hemiSkyColor, INTERIOR.hemiGroundColor, INTERIOR.hemiIntensity);
  hemi.position.set(spec.centerX, spec.ceilY, spec.centerZ);
  return { lights, ambient, hemi };
}

function box(minX, minY, minZ, maxX, maxY, maxZ) {
  return {
    min: new THREE.Vector3(minX, minY, minZ),
    max: new THREE.Vector3(maxX, maxY, maxZ),
  };
}

function buildShellColliders(spec, ledges) {
  const t = INTERIOR.wallThickness;
  const list = [];
  // The visible surface, not the bounding box — otherwise the queen flies three units
  // into rock before anything stops her.
  const c = spec.cavity || spec;
  const x0 = c.minX - t;
  const x1 = c.maxX + t;
  const z0 = c.minZ - t;
  const z1 = c.maxZ + t;
  const y0 = c.floorY - t;
  const y1 = c.ceilY + t;

  list.push(box(x0, y0, z0, x1, c.floorY, z1));
  list.push(box(x0, c.ceilY, z0, x1, y1, z1));

  const g = spec.entranceRadius;
  const p = spec.entrancePos;
  const onZ = spec.entranceAxisZ;

  function wallZ(zInner, zOuter, holed) {
    const zi = Math.min(zInner, zOuter);
    const za = Math.max(zInner, zOuter);
    if (!holed) {
      list.push(box(x0, y0, zi, x1, y1, za));
      return;
    }
    list.push(box(x0, y0, zi, p.x - g, y1, za));
    list.push(box(p.x + g, y0, zi, x1, y1, za));
    list.push(box(p.x - g, y0, zi, p.x + g, p.y - g, za));
    list.push(box(p.x - g, p.y + g, zi, p.x + g, y1, za));
  }

  function wallX(xInner, xOuter, holed) {
    const xi = Math.min(xInner, xOuter);
    const xa = Math.max(xInner, xOuter);
    if (!holed) {
      list.push(box(xi, y0, z0, xa, y1, z1));
      return;
    }
    list.push(box(xi, y0, z0, xa, y1, p.z - g));
    list.push(box(xi, y0, p.z + g, xa, y1, z1));
    list.push(box(xi, y0, p.z - g, xa, p.y - g, p.z + g));
    list.push(box(xi, p.y + g, p.z - g, xa, y1, p.z + g));
  }

  wallZ(c.maxZ, z1, onZ && spec.entranceSign > 0);
  wallZ(z0, c.minZ, onZ && spec.entranceSign < 0);
  wallX(c.maxX, x1, !onZ && spec.entranceSign > 0);
  wallX(x0, c.minX, !onZ && spec.entranceSign < 0);

  for (const b of ledges) list.push({ min: b.min.clone(), max: b.max.clone() });
  return list;
}

function buildTrunkColliders(spec) {
  const list = [];
  const r = HIVE.trunkRadiusBase * HIVE.colliderRadius;
  const top = spec.baseY + HIVE.trunkHeight;
  const bottom = spec.baseY - 1;
  const g = spec.entranceRadius;
  const p = spec.entrancePos;
  const x0 = spec.axisX - r;
  const x1 = spec.axisX + r;
  const z0 = spec.axisZ - r;
  const z1 = spec.axisZ + r;

  if (spec.entranceAxisZ) {
    list.push(box(x0, bottom, z0, Math.min(x1, p.x - g), top, z1));
    list.push(box(Math.max(x0, p.x + g), bottom, z0, x1, top, z1));
    list.push(box(Math.max(x0, p.x - g), bottom, z0, Math.min(x1, p.x + g), p.y - g, z1));
    list.push(box(Math.max(x0, p.x - g), p.y + g, z0, Math.min(x1, p.x + g), top, z1));
  } else {
    list.push(box(x0, bottom, z0, x1, top, Math.min(z1, p.z - g)));
    list.push(box(x0, bottom, Math.max(z0, p.z + g), x1, top, z1));
    list.push(box(x0, bottom, Math.max(z0, p.z - g), x1, p.y - g, Math.min(z1, p.z + g)));
    list.push(box(x0, p.y + g, Math.max(z0, p.z - g), x1, top, Math.min(z1, p.z + g)));
  }

  const rr = HIVE.trunkRadiusBase * HIVE.rootColliderRadius;
  list.push(box(spec.axisX - rr, bottom, spec.axisZ - rr, spec.axisX + rr, spec.baseY + HIVE.rootHeight * 0.6, spec.axisZ + rr));

  return list.filter((b) => b.max.x - b.min.x > 0.05 && b.max.z - b.min.z > 0.05 && b.max.y - b.min.y > 0.05);
}

export function createInterior(scene, hive, assets, terrain) {
  const spec = buildSpec(hive, terrain);
  // Derived before anything reads the shell: the vertex tint, the glow panel and the
  // wash lamps all key off which wall the comb lives on.
  spec.cavity = {
    minX: spec.minX, maxX: spec.maxX, minZ: spec.minZ, maxZ: spec.maxZ,
    floorY: spec.floorY, ceilY: spec.ceilY, measured: false,
  };
  spec.buildWall = buildWallInfo(spec);
  spec.knots = knotholeSpots(spec);
  const group = new THREE.Group();
  group.name = 'hollow';
  group.visible = false;
  scene.add(group);

  const ledges = galleryBoxes(spec).concat(alcoveBoxes(spec), pillarBoxes(spec), [landingBox(spec)]);

  const authored = assets && typeof assets.get === 'function' ? assets.get(INTERIOR.model) : null;
  const shell = authored ? adoptAuthoredHall(authored, spec) : PLACEHOLDER_hallShell(spec, ledges);
  group.add(shell);

  // Now that the room exists, find out where its surface actually is, and re-derive
  // everything that has to meet that surface. The procedural stand-in sits exactly on the
  // bounding box, so this is a no-op for it and a three-unit correction for hollow.glb.
  if (authored) {
    spec.cavity = measureCavity(shell, spec);
    spec.buildWall = buildWallInfo(spec);
    tintBuildWall(shell, spec);
  }

  group.add(buildShafts(spec));
  group.add(buildKnotholes(spec, spec.knots));
  group.add(buildPools(spec));
  const wallGlow = buildWallGlowPanel(spec);
  if (wallGlow) group.add(wallGlow);

  const dust = buildDust(spec);
  group.add(dust);

  const { lights, ambient, hemi } = buildLights(spec);
  const lightGroup = new THREE.Group();
  lightGroup.name = 'hollow_lights';
  for (const light of lights) lightGroup.add(light);
  lightGroup.add(ambient);
  lightGroup.add(hemi);
  const baseIntensity = lights.map((l) => l.intensity);
  const baseAmbient = ambient.intensity;
  const baseHemi = hemi.intensity;

  const n = spec.entranceNormal;
  const tangent = new THREE.Vector3(spec.entranceAxisZ ? 1 : 0, 0, spec.entranceAxisZ ? 0 : 1);
  const up = new THREE.Vector3(0, 1, 0);
  const clipPlanes = [
    new THREE.Plane(n.clone().negate(), n.dot(spec.entrancePos) + INTERIOR.throatLength * 0.35),
    new THREE.Plane(tangent.clone().negate(), tangent.dot(spec.entrancePos) + spec.clipHalf),
    new THREE.Plane(tangent.clone(), spec.clipHalf - tangent.dot(spec.entrancePos)),
    new THREE.Plane(up.clone().negate(), spec.entranceY + spec.clipHalf),
    new THREE.Plane(up.clone(), spec.clipHalf - spec.entranceY),
  ];

  const clipped = [];
  shell.traverse((child) => {
    if (child.isMesh && child.material) clipped.push(child.material);
  });

  const plugs = [];
  if (hive && hive.group) {
    const hollowColor = new THREE.Color(HIVE.colors.hollow);
    hive.group.traverse((child) => {
      if (!child.isMesh || !child.material || !child.material.color) return;
      child.getWorldPosition(_v);
      if (_v.distanceTo(spec.entrancePos) > spec.entranceRadius * 4) return;
      const named = /plug|hollow|dark/i.test(child.name || '');
      if (named || child.material.color.getHex() === hollowColor.getHex()) plugs.push(child);
    });
  }

  const hallColliders = buildShellColliders(spec, ledges);
  const trunkColliders = buildTrunkColliders(spec);
  let colliderTarget = null;
  let solidInside = null;

  function attachColliders(target) {
    if (!target || !Array.isArray(target.colliders)) return 0;
    colliderTarget = target;
    const list = target.colliders;
    let removed = 0;
    const reach = HIVE.trunkRadiusBase * HIVE.rootColliderRadius + 1;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i] && (list[i].min ? list[i] : list[i].box || list[i].aabb);
      if (!b || !b.min) continue;
      const cx = (b.min.x + b.max.x) * 0.5;
      const cz = (b.min.z + b.max.z) * 0.5;
      const overlaps = b.max.y > spec.floorY && b.min.y < spec.ceilY;
      if (overlaps && Math.hypot(cx - spec.axisX, cz - spec.axisZ) < reach) {
        list.splice(i, 1);
        removed++;
      }
    }
    setSolid(false);
    return removed;
  }

  function setSolid(inside) {
    if (!colliderTarget || inside === solidInside) return;
    const list = colliderTarget.colliders;
    const drop = solidInside === true ? hallColliders : trunkColliders;
    if (solidInside !== null) {
      for (const c of drop) {
        const i = list.indexOf(c);
        if (i >= 0) list.splice(i, 1);
      }
    }
    solidInside = inside;
    const add = inside ? hallColliders : trunkColliders;
    for (const c of add) list.push(c);
  }

  // The lattice lives on the visible surface, so its perimeter is the cavity's, and the
  // entrance's distance along that perimeter has to be re-measured in the same space.
  const cav = spec.cavity;
  const cavWalls = [cav.maxX - cav.minX, cav.maxZ - cav.minZ, cav.maxX - cav.minX, cav.maxZ - cav.minZ];
  const cavStarts = [0, cavWalls[0], cavWalls[0] + cavWalls[1], cavWalls[0] + cavWalls[1] + cavWalls[2]];
  const p0 = spec.entrancePos;
  const entranceS = spec.entranceWall === 0 ? cavStarts[0] + (p0.x - cav.minX)
    : spec.entranceWall === 1 ? cavStarts[1] + (cav.maxZ - p0.z)
      : spec.entranceWall === 2 ? cavStarts[2] + (cav.maxX - p0.x)
        : cavStarts[3] + (p0.z - cav.minZ);

  const grid = createHexGrid({
    minX: cav.minX,
    maxX: cav.maxX,
    minZ: cav.minZ,
    maxZ: cav.maxZ,
    floorY: cav.floorY,
    ceilY: cav.ceilY,
    entranceWall: spec.entranceWall,
    entranceS,
    entranceY: spec.entranceY,
    entranceRadius: spec.entranceRadius,
  });

  let clipActive = false;

  function setClipped(active) {
    if (active === clipActive) return;
    clipActive = active;
    for (const mat of clipped) {
      mat.clippingPlanes = active ? clipPlanes : null;
      mat.needsUpdate = true;
    }
  }

  function setLightsActive(active) {
    if (active && !lightGroup.parent) scene.add(lightGroup);
    else if (!active && lightGroup.parent) scene.remove(lightGroup);
  }

  function setIntensity(k) {
    for (let i = 0; i < lights.length; i++) lights[i].intensity = baseIntensity[i] * k;
    ambient.intensity = baseAmbient * k;
    hemi.intensity = baseHemi * k;
  }

  function clampCamera(camera, insideness) {
    if (insideness <= 0.02) return;
    const m = INTERIOR.cameraMargin;
    const inAperture =
      Math.abs(camera.position.y - spec.entranceY) < spec.entranceRadius * 2 &&
      (spec.entranceAxisZ
        ? Math.abs(camera.position.x - spec.entrancePos.x) < spec.entranceRadius * 2
        : Math.abs(camera.position.z - spec.entrancePos.z) < spec.entranceRadius * 2);

    const c = spec.cavity || spec;
    let tx = Math.min(Math.max(camera.position.x, c.minX + m), c.maxX - m);
    let ty = Math.min(Math.max(camera.position.y, c.floorY + m), c.ceilY - m);
    let tz = Math.min(Math.max(camera.position.z, c.minZ + m), c.maxZ - m);
    if (inAperture) {
      if (spec.entranceAxisZ) tz = camera.position.z;
      else tx = camera.position.x;
    }
    camera.position.x += (tx - camera.position.x) * insideness;
    camera.position.y += (ty - camera.position.y) * insideness;
    camera.position.z += (tz - camera.position.z) * insideness;
  }

  let clock = 0;
  const dustPos = dust.geometry.getAttribute('position');

  function update(dt, elapsed, insideness) {
    if (insideness <= 0) return;
    clock += dt;
    const seeds = dust.userData.seeds;
    const base = dust.userData.base;
    for (let i = 0; i < INTERIOR.dustCount; i++) {
      const i3 = i * 3;
      const phase = seeds[i3];
      const speed = seeds[i3 + 1];
      const swirl = seeds[i3 + 2];
      const drift = INTERIOR.dustDrift;
      dustPos.array[i3] = base[i3] + Math.sin(clock * speed * 0.3 + phase) * drift * 2.2;
      dustPos.array[i3 + 1] = base[i3 + 1] + ((clock * speed * 0.12 + phase) % 2 - 1) * drift * 3.0;
      dustPos.array[i3 + 2] = base[i3 + 2] + Math.cos(clock * speed * 0.27 + swirl) * drift * 2.2;
    }
    dustPos.needsUpdate = true;
  }

  if (spec.oversized) {
    console.info('[interior] the hall is wider than the trunk — concealed by inside-only rendering and entrance clipping');
  }

  return {
    group,
    spec,
    grid,
    shell,
    lights,
    ambient,
    plugs,
    ledges,
    hallColliders,
    trunkColliders,
    attachColliders,
    setSolid,
    setLightsActive,
    setIntensity,
    setClipped,
    clampCamera,
    insideDepth: spec.insideDepth,
    update,
    authored: Boolean(authored),
    dispose() {
      setLightsActive(false);
      scene.remove(group);
    },
  };
}
