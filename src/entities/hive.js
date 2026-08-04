// Hollowtree — the hollow tree in the clearing: authored GLB when present, procedural low-poly trunk otherwise, plus the deposit trigger.

import * as THREE from 'three';
import { HIVE } from '../config.js';

function radiusAt(t) {
  return THREE.MathUtils.lerp(HIVE.trunkRadiusBase, HIVE.trunkRadiusTop, Math.pow(t, 0.72));
}

function trunkGeometry() {
  const seg = HIVE.trunkSegments;
  const rows = [0, HIVE.rootHeight / HIVE.trunkHeight, 0.42, 0.74, 1];
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];
  const bark = new THREE.Color(HIVE.colors.bark);
  const dark = new THREE.Color(HIVE.colors.barkDark);
  const c = new THREE.Color();

  for (let r = 0; r < rows.length; r++) {
    const t = rows[r];
    const flare = r === 0 ? HIVE.rootFlare : 1;
    const y = t * HIVE.trunkHeight;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wobble = 1 + Math.sin(a * 3 + t * 5.1) * 0.055;
      const rr = radiusAt(t) * flare * wobble;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      nrm.push(Math.cos(a), 0.12, Math.sin(a));
      c.copy(dark).lerp(bark, 0.25 + t * 0.6 + Math.sin(a * 2.3) * 0.08);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const a0 = r * seg + i;
      const a1 = r * seg + ((i + 1) % seg);
      const b0 = a0 + seg;
      const b1 = a1 + seg;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const top = pos.length / 3;
  pos.push(0, HIVE.trunkHeight + 0.4, 0);
  nrm.push(0, 1, 0);
  c.copy(dark);
  col.push(c.r, c.g, c.b);
  for (let i = 0; i < seg; i++) {
    idx.push(top, (rows.length - 1) * seg + i, (rows.length - 1) * seg + ((i + 1) % seg));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function buildPlaceholder(group) {
  const barkMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, dithering: true });
  const trunk = new THREE.Mesh(trunkGeometry(), barkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const branchMat = new THREE.MeshLambertMaterial({ color: HIVE.colors.barkDark, flatShading: true });
  for (let i = 0; i < HIVE.branchCount; i++) {
    const a = (i / HIVE.branchCount) * Math.PI * 2 + 0.9;
    const t = 0.62 + (i % 2) * 0.16;
    const geo = new THREE.CylinderGeometry(HIVE.branchRadius * 0.45, HIVE.branchRadius, HIVE.branchLength, 5, 1);
    geo.translate(0, HIVE.branchLength * 0.5, 0);
    const branch = new THREE.Mesh(geo, branchMat);
    branch.position.set(
      Math.cos(a) * radiusAt(t) * 0.8,
      t * HIVE.trunkHeight,
      Math.sin(a) * radiusAt(t) * 0.8
    );
    branch.rotation.set(Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95);
    branch.castShadow = true;
    group.add(branch);
  }

  const canopy = new THREE.Group();
  const canopyMat = new THREE.MeshLambertMaterial({ color: HIVE.colors.canopy, flatShading: true, dithering: true });
  const canopyMatDark = new THREE.MeshLambertMaterial({ color: HIVE.colors.canopyDark, flatShading: true });
  for (let i = 0; i < HIVE.canopyCount; i++) {
    const a = (i / HIVE.canopyCount) * Math.PI * 2 + 0.4;
    const r = i === 0 ? 0 : HIVE.canopySpread;
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(HIVE.canopyRadius * (i === 0 ? 1.12 : 0.78), 1),
      i % 2 === 0 ? canopyMat : canopyMatDark
    );
    blob.position.set(
      Math.cos(a) * r,
      HIVE.canopyHeight + (i === 0 ? 1.6 : Math.sin(a * 2.1) * 1.1),
      Math.sin(a) * r
    );
    blob.scale.set(1, 0.78, 1);
    blob.castShadow = true;
    blob.receiveShadow = true;
    canopy.add(blob);
  }
  group.add(canopy);
  return canopy;
}

function buildEntrance(group, faceZ) {
  const local = new THREE.Group();
  const t = HIVE.entranceHeight / HIVE.trunkHeight;
  const surface = radiusAt(t);

  const hollow = new THREE.Mesh(
    new THREE.CircleGeometry(HIVE.entranceRadius, 12),
    new THREE.MeshBasicMaterial({ color: HIVE.colors.hollow })
  );
  hollow.position.set(0, 0, -HIVE.entranceDepth * 0.5);
  local.add(hollow);

  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(HIVE.entranceRadius * 1.06, HIVE.entranceRadius * 0.24, 5, 12),
    new THREE.MeshLambertMaterial({ color: HIVE.colors.lip, flatShading: true })
  );
  lip.scale.set(1, 1, 0.6);
  lip.castShadow = true;
  local.add(lip);

  local.position.set(0, HIVE.entranceHeight, (surface - HIVE.entranceDepth * 0.2) * faceZ);
  local.rotation.y = faceZ > 0 ? 0 : Math.PI;
  group.add(local);
  return { local, surface };
}

export function createHive(scene, terrain, assets) {
  const group = new THREE.Group();
  group.name = 'hive';
  const groundY = terrain && terrain.getHeight ? terrain.getHeight(HIVE.x, HIVE.z) : 0;
  group.position.set(HIVE.x, groundY, HIVE.z);
  scene.add(group);

  const authored = assets && typeof assets.get === 'function' ? assets.get('tree') : null;
  let canopy = null;
  if (authored) {
    const model = typeof assets.clone === 'function' ? assets.clone('tree') : authored;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.add(model);
  } else {
    canopy = buildPlaceholder(group);
  }

  const faceZ = HIVE.z <= 0 ? 1 : -1;
  const { local, surface } = buildEntrance(group, faceZ);

  const entrance = new THREE.Vector3(
    HIVE.x,
    groundY + HIVE.entranceHeight,
    HIVE.z + (surface + HIVE.entranceRadius * 0.4) * faceZ
  );
  const position = new THREE.Vector3(HIVE.x, groundY, HIVE.z);

  if (terrain && Array.isArray(terrain.colliders)) {
    const r = HIVE.trunkRadiusBase * 0.86;
    terrain.colliders.push({
      min: new THREE.Vector3(HIVE.x - r, groundY - 1, HIVE.z - r),
      max: new THREE.Vector3(HIVE.x + r, groundY + HIVE.trunkHeight, HIVE.z + r),
    });
  }

  let clock = 0;

  function update(dt) {
    if (!(dt > 0)) return;
    clock += dt;
    if (canopy) {
      canopy.rotation.z = Math.sin(clock * HIVE.swaySpeed) * HIVE.swayAmp;
      canopy.rotation.x = Math.sin(clock * HIVE.swaySpeed * 0.73 + 1.3) * HIVE.swayAmp * 0.7;
    }
    const pulse = 1 + Math.sin(clock * 1.4) * HIVE.glowPulse * 0.06;
    local.scale.set(pulse, pulse, 1);
  }

  return {
    group,
    position,
    entrance,
    triggerRadius: HIVE.triggerRadius,
    update,
    dispose() {
      scene.remove(group);
    },
  };
}
