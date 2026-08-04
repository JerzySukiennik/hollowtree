// Hollowtree — the hollow: authored shell when present, procedural stand-in otherwise, plus interior lighting, dust, wall colliders and camera containment.

import * as THREE from 'three';
import { INTERIOR, HIVE, FLIGHT } from '../config.js';
import { createHexGrid } from './hexgrid.js';

const _v = new THREE.Vector3();
const _c = new THREE.Color();

function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
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

  const innerRadius = Math.max(INTERIOR.minInnerRadius, HIVE.trunkRadiusBase * INTERIOR.radiusScale);

  const entranceWorld = hive && hive.entrance ? hive.entrance : null;
  const entranceY = Math.min(
    ceilY - height * 0.25,
    Math.max(floorY + height * 0.08, entranceWorld ? entranceWorld.y : baseY + HIVE.entranceHeight)
  );
  const ex = entranceWorld ? entranceWorld.x - axisX : 0;
  const ez = entranceWorld ? entranceWorld.z - axisZ : (HIVE.z <= 0 ? 1 : -1);
  const entranceAngle = Math.atan2(ez, ex);
  const entranceRadius = HIVE.entranceRadius;

  const above = ceilY - entranceY;
  const pad = height * INTERIOR.entrancePad;
  const anchors = [
    [floorY, INTERIOR.basinRadius],
    [floorY + (entranceY - floorY) * INTERIOR.lowerAt, INTERIOR.lowerRadius],
    [entranceY - pad, 1],
    [entranceY + pad, 1],
    [entranceY + above * INTERIOR.waistAt, INTERIOR.waistRadius],
    [entranceY + above * INTERIOR.crownAt, INTERIOR.crownRadius],
    [entranceY + above * INTERIOR.capAt, INTERIOR.capRadius],
    [ceilY, INTERIOR.oculusRadius / innerRadius],
  ];
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i][0] <= anchors[i - 1][0]) anchors[i][0] = anchors[i - 1][0] + 0.01;
  }

  function profile(y) {
    if (y <= anchors[0][0]) return anchors[0][1];
    for (let i = 1; i < anchors.length; i++) {
      if (y <= anchors[i][0]) {
        const k = smoothstep(anchors[i - 1][0], anchors[i][0], y);
        return anchors[i - 1][1] + (anchors[i][1] - anchors[i - 1][1]) * k;
      }
    }
    return anchors[anchors.length - 1][1];
  }

  function radiusAt(y) {
    return innerRadius * profile(y);
  }

  function outerRadiusAt(y) {
    const t = (y - baseY) / Math.max(1, HIVE.trunkHeight);
    return Math.max(trunkRadiusAt(t), radiusAt(y) + INTERIOR.wallThickness);
  }

  const entrancePos = new THREE.Vector3(
    axisX + Math.cos(entranceAngle) * radiusAt(entranceY),
    entranceY,
    axisZ + Math.sin(entranceAngle) * radiusAt(entranceY)
  );

  return {
    axisX,
    axisZ,
    baseY,
    floorY,
    ceilY,
    height,
    innerRadius,
    refRadius: innerRadius,
    entranceY,
    entranceAngle,
    entranceRadius,
    entrancePos,
    radiusAt,
    outerRadiusAt,
    oversized: innerRadius + INTERIOR.wallThickness > trunkRadiusAt((entranceY - baseY) / Math.max(1, HIVE.trunkHeight)),
  };
}

function shellLuminance(spec, x, y, z) {
  const dxe = x - spec.entrancePos.x;
  const dye = y - spec.entrancePos.y;
  const dze = z - spec.entrancePos.z;
  const dEntrance = Math.sqrt(dxe * dxe + dye * dye + dze * dze);
  const entrance = 1 - smoothstep(2, spec.innerRadius * 2.6, dEntrance);

  const radial = Math.hypot(x - spec.axisX, z - spec.axisZ);
  const oculus =
    smoothstep(spec.ceilY - spec.height * 0.5, spec.ceilY, y) *
    (1 - smoothstep(spec.innerRadius * 0.3, spec.innerRadius, radial) * 0.55);

  const basin = smoothstep(spec.floorY + spec.height * 0.1, spec.floorY, y) * 0.35;
  return Math.min(1.35, entrance * 0.95 + oculus * 0.8 + basin);
}

const _deep = new THREE.Color(INTERIOR.colors.wallDeep);
const _lit = new THREE.Color(INTERIOR.colors.wallLit);
const _base = new THREE.Color();

function pushVertex(pos, col, nrm, spec, x, y, z, nx, ny, nz, base) {
  const lum = shellLuminance(spec, x, y, z);
  _c.copy(_deep).lerp(_base.set(base), Math.min(1, 0.25 + lum * 0.55));
  _c.lerp(_lit, Math.min(0.85, lum * 0.6));
  pos.push(x, y, z);
  nrm.push(nx, ny, nz);
  col.push(_c.r, _c.g, _c.b);
  return pos.length / 3 - 1;
}

function buildPlaceholderShell(spec) {
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];

  const seg = INTERIOR.radialSegments;
  const rows = INTERIOR.heightSegments;
  const dy = (spec.ceilY - spec.floorY) / rows;
  const aperture = Math.atan2(spec.entranceRadius * 1.05, Math.max(1, spec.radiusAt(spec.entranceY)));

  const ring = [];
  for (let r = 0; r <= rows; r++) {
    const y = spec.floorY + r * dy;
    const radius = spec.radiusAt(y);
    const row = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 3 + y * 0.21) * 0.045 + Math.sin(a * 7 - y * 0.09) * 0.02;
      const rr = radius * wob;
      const x = spec.axisX + Math.cos(a) * rr;
      const z = spec.axisZ + Math.sin(a) * rr;
      row.push(pushVertex(pos, col, nrm, spec, x, y, z, -Math.cos(a), 0, -Math.sin(a), INTERIOR.colors.wall));
    }
    ring.push(row);
  }

  function angleDelta(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  for (let r = 0; r < rows; r++) {
    const y = spec.floorY + (r + 0.5) * dy;
    for (let i = 0; i < seg; i++) {
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      const inHole =
        angleDelta(a, spec.entranceAngle) < aperture &&
        Math.abs(y - spec.entranceY) < spec.entranceRadius * 1.05;
      if (inHole) continue;
      const a0 = ring[r][i];
      const a1 = ring[r][(i + 1) % seg];
      const b0 = ring[r + 1][i];
      const b1 = ring[r + 1][(i + 1) % seg];
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }

  const floorCenter = pushVertex(
    pos, col, nrm, spec, spec.axisX, spec.floorY - 0.15, spec.axisZ, 0, 1, 0, INTERIOR.colors.floor
  );
  for (let i = 0; i < seg; i++) {
    idx.push(floorCenter, ring[0][(i + 1) % seg], ring[0][i]);
  }

  const capRing = [];
  const capY = spec.ceilY;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    capRing.push(
      pushVertex(
        pos, col, nrm, spec,
        spec.axisX + Math.cos(a) * INTERIOR.oculusRadius,
        capY + 0.2,
        spec.axisZ + Math.sin(a) * INTERIOR.oculusRadius,
        0, -1, 0, INTERIOR.colors.wall
      )
    );
  }
  for (let i = 0; i < seg; i++) {
    const a0 = ring[rows][i];
    const a1 = ring[rows][(i + 1) % seg];
    idx.push(a0, capRing[i], a1, a1, capRing[i], capRing[(i + 1) % seg]);
  }

  for (let l = 0; l < INTERIOR.ledgeCount; l++) {
    const t = INTERIOR.ledgeStart + (l / Math.max(1, INTERIOR.ledgeCount - 1)) * (INTERIOR.ledgeEnd - INTERIOR.ledgeStart);
    const y = spec.floorY + t * spec.height;
    const radius = spec.radiusAt(y);
    if (radius < INTERIOR.ledgeDepth * 1.6) continue;
    const mid = spec.entranceAngle + Math.PI * 0.55 + l * 2.399;
    const half = INTERIOR.ledgeArc * 0.5;
    const steps = 6;
    const outerTop = [];
    const innerTop = [];
    const outerBot = [];
    const innerBot = [];
    for (let s = 0; s <= steps; s++) {
      const a = mid - half + (s / steps) * INTERIOR.ledgeArc;
      const ro = radius * 0.995;
      const ri = Math.max(1, radius - INTERIOR.ledgeDepth * (0.6 + 0.4 * Math.sin((s / steps) * Math.PI)));
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      outerTop.push(pushVertex(pos, col, nrm, spec, spec.axisX + cx * ro, y, spec.axisZ + cz * ro, 0, 1, 0, INTERIOR.colors.ledge));
      innerTop.push(pushVertex(pos, col, nrm, spec, spec.axisX + cx * ri, y, spec.axisZ + cz * ri, 0, 1, 0, INTERIOR.colors.ledge));
      outerBot.push(pushVertex(pos, col, nrm, spec, spec.axisX + cx * ro, y - INTERIOR.ledgeThickness, spec.axisZ + cz * ro, 0, -1, 0, INTERIOR.colors.wallDeep));
      innerBot.push(pushVertex(pos, col, nrm, spec, spec.axisX + cx * ri, y - INTERIOR.ledgeThickness, spec.axisZ + cz * ri, 0, -1, 0, INTERIOR.colors.wallDeep));
    }
    for (let s = 0; s < steps; s++) {
      idx.push(outerTop[s], innerTop[s], outerTop[s + 1], innerTop[s], innerTop[s + 1], outerTop[s + 1]);
      idx.push(outerBot[s], outerBot[s + 1], innerBot[s], innerBot[s], outerBot[s + 1], innerBot[s + 1]);
      idx.push(innerTop[s], innerBot[s], innerTop[s + 1], innerBot[s], innerBot[s + 1], innerTop[s + 1]);
    }
  }

  const throatDir = new THREE.Vector3(Math.cos(spec.entranceAngle), 0, Math.sin(spec.entranceAngle));
  const inner = spec.radiusAt(spec.entranceY);
  const outer = inner + INTERIOR.throatLength;
  const tSeg = 12;
  const innerRing = [];
  const outerRing = [];
  for (let i = 0; i < tSeg; i++) {
    const a = (i / tSeg) * Math.PI * 2;
    const up = Math.sin(a);
    const side = Math.cos(a);
    const rIn = spec.entranceRadius * INTERIOR.throatFlare;
    const rOut = spec.entranceRadius;
    const tangent = new THREE.Vector3(-throatDir.z, 0, throatDir.x);
    const px = spec.axisX + throatDir.x * inner + tangent.x * side * rIn;
    const pz = spec.axisZ + throatDir.z * inner + tangent.z * side * rIn;
    const qx = spec.axisX + throatDir.x * outer + tangent.x * side * rOut;
    const qz = spec.axisZ + throatDir.z * outer + tangent.z * side * rOut;
    innerRing.push(pushVertex(pos, col, nrm, spec, px, spec.entranceY + up * rIn, pz, -side * tangent.x, -up, -side * tangent.z, INTERIOR.colors.ledge));
    outerRing.push(pushVertex(pos, col, nrm, spec, qx, spec.entranceY + up * rOut, qz, -side * tangent.x, -up, -side * tangent.z, INTERIOR.colors.wall));
  }
  for (let i = 0; i < tSeg; i++) {
    const j = (i + 1) % tSeg;
    idx.push(innerRing[i], outerRing[i], innerRing[j], innerRing[j], outerRing[i], outerRing[j]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, dithering: true })
  );
  mesh.name = 'hollow_shell_placeholder';
  mesh.frustumCulled = false;
  return mesh;
}

function adoptAuthoredShell(source, spec) {
  const model = source.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const sy = size.y > 0.01 ? spec.height / size.y : 1;
  const sxz = Math.max(size.x, size.z) > 0.01 ? (spec.innerRadius * 2) / Math.max(size.x, size.z) : 1;
  model.scale.set(sxz, sy, sxz);
  model.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(model);
  model.position.set(
    spec.axisX - (scaled.min.x + scaled.max.x) * 0.5,
    spec.floorY - scaled.min.y,
    spec.axisZ - (scaled.min.z + scaled.max.z) * 0.5
  );
  model.rotation.y = spec.entranceAngle;
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
  return model;
}

function buildShafts(spec) {
  const group = new THREE.Group();

  const oculusGeo = new THREE.CylinderGeometry(
    INTERIOR.oculusRadius * 1.1,
    INTERIOR.oculusRadius * 3.2,
    spec.height * 0.9,
    INTERIOR.shaftSegments,
    1,
    true
  );
  const oculusColors = [];
  const posAttr = oculusGeo.getAttribute('position');
  const top = spec.height * 0.45;
  for (let i = 0; i < posAttr.count; i++) {
    const k = Math.max(0, Math.min(1, (posAttr.getY(i) + top) / (top * 2)));
    _c.set(INTERIOR.colors.shaftCool).multiplyScalar(Math.pow(k, 1.6));
    oculusColors.push(_c.r, _c.g, _c.b);
  }
  oculusGeo.setAttribute('color', new THREE.Float32BufferAttribute(oculusColors, 3));
  const shaftMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: INTERIOR.shaftOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const oculus = new THREE.Mesh(oculusGeo, shaftMat);
  oculus.position.set(spec.axisX, spec.ceilY - spec.height * 0.45, spec.axisZ);
  oculus.frustumCulled = false;
  group.add(oculus);

  const beamLength = spec.radiusAt(spec.entranceY) * 1.9;
  const beamGeo = new THREE.CylinderGeometry(spec.entranceRadius * 0.9, spec.entranceRadius * 2.4, beamLength, INTERIOR.shaftSegments, 1, true);
  const beamColors = [];
  const bAttr = beamGeo.getAttribute('position');
  for (let i = 0; i < bAttr.count; i++) {
    const k = Math.max(0, Math.min(1, (bAttr.getY(i) + beamLength * 0.5) / beamLength));
    _c.set(INTERIOR.colors.shaftWarm).multiplyScalar(Math.pow(k, 1.4));
    beamColors.push(_c.r, _c.g, _c.b);
  }
  beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(beamColors, 3));
  const beam = new THREE.Mesh(beamGeo, shaftMat.clone());
  beam.material.opacity = INTERIOR.shaftOpacity * 1.4;
  const dir = new THREE.Vector3(Math.cos(spec.entranceAngle), -0.35, Math.sin(spec.entranceAngle)).normalize();
  beam.position.copy(spec.entrancePos).addScaledVector(dir, -beamLength * 0.45);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
  beam.frustumCulled = false;
  group.add(beam);

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
    const a = Math.random() * Math.PI * 2;
    const y = spec.floorY + Math.random() * spec.height;
    const r = spec.radiusAt(y) * Math.sqrt(Math.random()) * 0.92;
    positions[i * 3] = spec.axisX + Math.cos(a) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = spec.axisZ + Math.sin(a) * r;
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

function buildLights(spec) {
  const lights = [];
  const entrance = new THREE.PointLight(INTERIOR.entranceLightColor, INTERIOR.entranceLightIntensity, INTERIOR.entranceLightRange, 1.6);
  entrance.position.copy(spec.entrancePos).lerp(new THREE.Vector3(spec.axisX, spec.entranceY, spec.axisZ), 0.28);
  lights.push(entrance);

  const oculus = new THREE.PointLight(INTERIOR.oculusLightColor, INTERIOR.oculusLightIntensity, INTERIOR.oculusLightRange, 1.4);
  oculus.position.set(spec.axisX, spec.ceilY - spec.height * 0.06, spec.axisZ);
  lights.push(oculus);

  const crown = new THREE.PointLight(INTERIOR.crownLightColor, INTERIOR.crownLightIntensity, INTERIOR.crownLightRange, 1.6);
  crown.position.set(spec.axisX, spec.entranceY + (spec.ceilY - spec.entranceY) * INTERIOR.crownAt, spec.axisZ);
  lights.push(crown);

  const basin = new THREE.PointLight(INTERIOR.basinLightColor, INTERIOR.basinLightIntensity, INTERIOR.basinLightRange, 1.8);
  basin.position.set(spec.axisX, spec.floorY + 1.2, spec.axisZ);
  lights.push(basin);

  const ambient = new THREE.AmbientLight(INTERIOR.ambientColor, INTERIOR.ambientIntensity);
  return { lights, ambient };
}

export function createInterior(scene, hive, assets, terrain) {
  const spec = buildSpec(hive, terrain);
  const group = new THREE.Group();
  group.name = 'hollow';
  group.visible = false;
  scene.add(group);

  const authored = assets && typeof assets.get === 'function' ? assets.get(INTERIOR.model) : null;
  const shell = authored ? adoptAuthoredShell(authored, spec) : buildPlaceholderShell(spec);
  group.add(shell);

  const shafts = buildShafts(spec);
  group.add(shafts);

  const dust = buildDust(spec);
  group.add(dust);

  const { lights, ambient } = buildLights(spec);
  const lightGroup = new THREE.Group();
  lightGroup.name = 'hollow_lights';
  for (const light of lights) lightGroup.add(light);
  lightGroup.add(ambient);
  const baseIntensity = lights.map((l) => l.intensity);
  const baseAmbient = ambient.intensity;

  const clipPlane = new THREE.Plane(
    new THREE.Vector3(-Math.cos(spec.entranceAngle), 0, -Math.sin(spec.entranceAngle)),
    0
  );
  clipPlane.constant = -clipPlane.normal.dot(spec.entrancePos) + INTERIOR.throatLength * 0.35;

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

  const colliders = [];
  function buildColliders() {
    const rings = INTERIOR.collisionRings;
    const segs = INTERIOR.collisionSegments;
    const dy = spec.height / rings;
    const gapScale = spec.oversized ? 1.6 : 1.0;
    for (let r = 0; r < rings; r++) {
      const y0 = spec.floorY + r * dy;
      const y1 = y0 + dy;
      const ym = (y0 + y1) * 0.5;
      const rIn = spec.radiusAt(ym);
      const rOut = spec.outerRadiusAt(ym);
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2;
        const a1 = ((s + 1) / segs) * Math.PI * 2;
        const am = (a0 + a1) * 0.5;
        let d = (am - spec.entranceAngle) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        const inGap =
          Math.abs(d) < INTERIOR.gapAngle * gapScale &&
          Math.abs(ym - spec.entranceY) < INTERIOR.gapHeight * gapScale;
        if (inGap) continue;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let i = 0; i < 4; i++) {
          const a = i < 2 ? a0 : a1;
          const rr = i % 2 === 0 ? rIn : rOut;
          const x = spec.axisX + Math.cos(a) * rr;
          const z = spec.axisZ + Math.sin(a) * rr;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        colliders.push({
          min: new THREE.Vector3(minX, y0 - 0.02, minZ),
          max: new THREE.Vector3(maxX, y1 + 0.02, maxZ),
        });
      }
    }
    const capY = spec.ceilY;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2;
      const a1 = ((s + 1) / segs) * Math.PI * 2;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < 4; i++) {
        const a = i < 2 ? a0 : a1;
        const rr = i % 2 === 0 ? INTERIOR.oculusRadius * 1.15 : spec.radiusAt(capY) + INTERIOR.wallThickness;
        const x = spec.axisX + Math.cos(a) * rr;
        const z = spec.axisZ + Math.sin(a) * rr;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      colliders.push({
        min: new THREE.Vector3(minX, capY, minZ),
        max: new THREE.Vector3(maxX, capY + 1.2, maxZ),
      });
    }
  }
  buildColliders();

  function attachColliders(target) {
    if (!target || !Array.isArray(target.colliders)) return 0;
    const list = target.colliders;
    let removed = 0;
    const reach = spec.innerRadius + INTERIOR.wallThickness * 2;
    for (let i = list.length - 1; i >= 0; i--) {
      const box = list[i] && (list[i].min ? list[i] : list[i].box || list[i].aabb);
      if (!box || !box.min) continue;
      const cx = (box.min.x + box.max.x) * 0.5;
      const cz = (box.min.z + box.max.z) * 0.5;
      const overlapsShaft = box.max.y > spec.floorY && box.min.y < spec.ceilY;
      if (overlapsShaft && Math.hypot(cx - spec.axisX, cz - spec.axisZ) < reach) {
        list.splice(i, 1);
        removed++;
      }
    }
    for (const c of colliders) list.push(c);
    return removed;
  }

  const grid = createHexGrid({
    axisX: spec.axisX,
    axisZ: spec.axisZ,
    floorY: spec.floorY,
    ceilY: spec.ceilY,
    refRadius: spec.innerRadius,
    radiusAt: spec.radiusAt,
  });

  let clipActive = false;

  function setClipped(active) {
    if (active === clipActive) return;
    clipActive = active;
    for (const mat of clipped) {
      mat.clippingPlanes = active ? [clipPlane] : null;
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
  }

  function radialDistance(point) {
    return Math.hypot(point.x - spec.axisX, point.z - spec.axisZ);
  }

  function clampCamera(camera, insideness) {
    if (insideness <= 0.02) return;
    const y = Math.min(Math.max(camera.position.y, spec.floorY + 0.5), spec.ceilY - 0.5);
    const limit = Math.max(1.5, spec.radiusAt(y) - INTERIOR.cameraMargin);
    const dx = camera.position.x - spec.axisX;
    const dz = camera.position.z - spec.axisZ;
    const d = Math.hypot(dx, dz);
    const targetX = d > limit ? spec.axisX + (dx / d) * limit : camera.position.x;
    const targetZ = d > limit ? spec.axisZ + (dz / d) * limit : camera.position.z;
    camera.position.x += (targetX - camera.position.x) * insideness;
    camera.position.z += (targetZ - camera.position.z) * insideness;
    camera.position.y += (y - camera.position.y) * insideness;
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

  return {
    group,
    spec,
    grid,
    shell,
    lights,
    ambient,
    plugs,
    colliders,
    attachColliders,
    setLightsActive,
    setIntensity,
    setClipped,
    clampCamera,
    radialDistance,
    update,
    authored: Boolean(authored),
    dispose() {
      setLightsActive(false);
      scene.remove(group);
    },
  };
}
