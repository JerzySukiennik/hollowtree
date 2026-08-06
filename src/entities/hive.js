// Hollowtree — the hollow tree landmark and the instanced background forest: authored GLB when present, labelled placeholders otherwise, plus the deposit trigger.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FLOWERS, FOREST, HIVE } from '../config.js';

const loader = new GLTFLoader();

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0;
    return s / 4294967296;
  };
}

function radiusAt(t) {
  return THREE.MathUtils.lerp(HIVE.trunkRadiusBase, HIVE.trunkRadiusTop, Math.pow(t, 0.72));
}

function newBuffer() {
  return { pos: [], nrm: [], col: [], idx: [] };
}

function finalize(buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  g.setIndex(buf.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function appendGeometry(buf, geo, matrix, color) {
  const p = geo.attributes.position;
  const base = buf.pos.length / 3;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix);
    buf.pos.push(v.x, v.y, v.z);
    buf.nrm.push(0, 1, 0);
    buf.col.push(color.r, color.g, color.b);
  }
  if (geo.index) {
    const ia = geo.index;
    for (let i = 0; i < ia.count; i++) buf.idx.push(base + ia.getX(i));
  } else {
    for (let i = 0; i < p.count; i++) buf.idx.push(base + i);
  }
}

function mergeModel(root) {
  root.updateMatrixWorld(true);
  const buf = newBuffer();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const c = new THREE.Color();
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const g = child.geometry;
    const p = g.attributes.position;
    if (!p) return;
    const base = buf.pos.length / 3;
    nm.getNormalMatrix(child.matrixWorld);
    const na = g.attributes.normal;
    const ca = g.attributes.color;
    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (mat && mat.color) c.copy(mat.color);
    else c.setRGB(1, 1, 1);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(child.matrixWorld);
      buf.pos.push(v.x, v.y, v.z);
      if (na) {
        n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        buf.nrm.push(n.x, n.y, n.z);
      } else buf.nrm.push(0, 1, 0);
      if (ca) buf.col.push(ca.getX(i) * c.r, ca.getY(i) * c.g, ca.getZ(i) * c.b);
      else buf.col.push(c.r, c.g, c.b);
    }
    if (g.index) {
      const ia = g.index;
      for (let i = 0; i < ia.count; i++) buf.idx.push(base + ia.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) buf.idx.push(base + i);
    }
  });
  if (!buf.pos.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  out.setIndex(buf.idx);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function findNode(root, name) {
  if (!name) return null;
  const want = name.toLowerCase();
  let found = null;
  root.traverse((child) => {
    if (found || !child.name) return;
    const n = child.name.toLowerCase();
    if (n === want || n.startsWith(`${want}_`) || n.startsWith(`${want}.`)) found = child;
  });
  return found;
}

async function fetchModel(file) {
  const url = new URL(`${FLOWERS.modelPath}${file}`, new URL('../../', import.meta.url)).href;
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    return null;
  }
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  const folder = url.slice(0, url.lastIndexOf('/') + 1);
  try {
    return await new Promise((res, rej) => loader.parse(buffer, folder, res, rej));
  } catch (error) {
    console.warn(`[hive] failed to parse ${file} — ${error && error.message}`);
    return null;
  }
}

function PLACEHOLDER_trunkGeometry() {
  const seg = HIVE.trunkSegments;
  const rows = [0, HIVE.rootHeight / HIVE.trunkHeight, 0.26, 0.52, 0.78, 1];
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
      const wobble = 1 + Math.sin(a * 3 + t * 5.1) * 0.075;
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
  pos.push(0, HIVE.trunkHeight + 1.2, 0);
  nrm.push(0, 1, 0);
  col.push(dark.r, dark.g, dark.b);
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

function PLACEHOLDER_hollowTree(group) {
  const barkMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, dithering: true });
  const trunk = new THREE.Mesh(PLACEHOLDER_trunkGeometry(), barkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const branchMat = new THREE.MeshLambertMaterial({ color: HIVE.colors.barkDark, flatShading: true });
  for (let i = 0; i < HIVE.branchCount; i++) {
    const a = (i / HIVE.branchCount) * Math.PI * 2 + 0.9;
    const t = 0.62 + (i % 3) * 0.11;
    const geo = new THREE.CylinderGeometry(HIVE.branchRadius * 0.4, HIVE.branchRadius, HIVE.branchLength, 5, 1);
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
      new THREE.IcosahedronGeometry(HIVE.canopyRadius * (i === 0 ? 1.1 : 0.74), 1),
      i % 2 === 0 ? canopyMat : canopyMatDark
    );
    blob.position.set(
      Math.cos(a) * r,
      HIVE.canopyHeight + (i === 0 ? 7.5 : Math.sin(a * 2.1) * 5.5),
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

function buildEntranceMarker(group, faceZ, height, surface) {
  const local = new THREE.Group();

  const hollow = new THREE.Mesh(
    new THREE.CircleGeometry(HIVE.entranceRadius, 14),
    new THREE.MeshBasicMaterial({ color: HIVE.colors.hollow })
  );
  hollow.position.set(0, 0, -HIVE.entranceDepth * 0.6);
  local.add(hollow);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(HIVE.entranceRadius * HIVE.glowRadius, HIVE.entranceRadius * 0.98, 16),
    new THREE.MeshBasicMaterial({
      color: HIVE.glowColor,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  glow.position.set(0, 0, -HIVE.entranceDepth * 0.25);
  glow.renderOrder = 3;
  local.add(glow);

  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(HIVE.entranceRadius * 1.08, HIVE.entranceRadius * 0.22, 6, 14),
    new THREE.MeshLambertMaterial({ color: HIVE.colors.lip, flatShading: true })
  );
  lip.scale.set(1, 1, 0.6);
  lip.castShadow = true;
  local.add(lip);

  local.position.set(0, height, (surface - HIVE.entranceDepth * 0.2) * faceZ);
  local.rotation.y = faceZ > 0 ? 0 : Math.PI;
  group.add(local);
  return { local, glow };
}

function PLACEHOLDER_meadowTreeGeometry() {
  const buf = newBuffer();
  const bark = new THREE.Color(FOREST.colors.bark);
  const barkDark = new THREE.Color(FOREST.colors.barkDark);
  const canopy = new THREE.Color(FOREST.colors.canopy);
  const canopyDark = new THREE.Color(FOREST.colors.canopyDark);
  const m = new THREE.Matrix4();

  const seg = FOREST.trunkSegments;
  const rows = FOREST.trunkRows;
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const flare = r === 0 ? FOREST.trunkFlare : 1;
    const rr = FOREST.trunkRadius * (1 - t * 0.62) * flare;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, t * FOREST.canopyBase * 1.08, Math.sin(a) * rr);
      nrm.push(Math.cos(a), 0.1, Math.sin(a));
      c.copy(barkDark).lerp(bark, 0.3 + t * 0.5);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const a0 = r * seg + i;
      const a1 = r * seg + ((i + 1) % seg);
      idx.push(a0, a0 + seg, a1, a1, a0 + seg, a1 + seg);
    }
  }
  buf.pos.push(...pos);
  buf.nrm.push(...nrm);
  buf.col.push(...col);
  buf.idx.push(...idx);

  const blob = new THREE.IcosahedronGeometry(FOREST.canopyRadius, FOREST.canopyDetail);
  for (let i = 0; i < FOREST.canopyPerTree; i++) {
    const a = (i / FOREST.canopyPerTree) * Math.PI * 2 + 0.7;
    const r = i === 0 ? 0 : FOREST.canopySpread;
    const y = FOREST.canopyBase + (i === 0 ? 0.26 : 0.12 + 0.1 * Math.sin(a * 2.3));
    const s = i === 0 ? 1.12 : 0.82;
    m.makeScale(s, s * FOREST.canopySquash, s);
    m.setPosition(Math.cos(a) * r, y, Math.sin(a) * r);
    appendGeometry(buf, blob, m, i % 2 === 0 ? canopy : canopyDark);
  }
  blob.dispose();
  return finalize(buf);
}

function createForest(scene, terrain, hiveGround) {
  const rand = rng(FOREST.seed);
  const geometry = PLACEHOLDER_meadowTreeGeometry();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    dithering: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, FOREST.count);
  mesh.name = 'forest';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  const getHeight = terrain && terrain.getHeight ? terrain.getHeight : () => hiveGround;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const boxes = [];
  let placed = 0;

  for (let i = 0; i < FOREST.count; i++) {
    let x = 0;
    let z = 0;
    let ok = false;
    for (let t = 0; t < 8 && !ok; t++) {
      const a = rand() * Math.PI * 2;
      const r = THREE.MathUtils.lerp(FOREST.innerRadius, FOREST.outerRadius, Math.sqrt(rand()));
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      const h = getHeight(x, z);
      const slope = Math.hypot(getHeight(x + 2, z) - h, getHeight(x, z + 2) - h) / 2;
      if (slope > FOREST.maxSlope) continue;
      ok = true;
    }
    if (!ok) continue;
    const height = THREE.MathUtils.lerp(FOREST.minHeight, FOREST.maxHeight, rand());
    const lean = 1 + (rand() - 0.5) * 0.22;
    p.set(x, getHeight(x, z) - height * 0.01, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    s.set(height * lean, height, height * lean);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    placed++;

    if (Math.hypot(x, z) < FOREST.colliderRange) {
      const rad = height * FOREST.trunkRadius * FOREST.trunkFlare * FOREST.colliderRadius;
      boxes.push({
        min: new THREE.Vector3(x - rad, p.y - 1, z - rad),
        max: new THREE.Vector3(x + rad, p.y + height * FOREST.canopyBase, z + rad),
      });
    }
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;

  if (terrain && Array.isArray(terrain.colliders)) {
    for (const b of boxes) terrain.colliders.push(b);
  }

  (async () => {
    const gltf = await fetchModel(FOREST.model);
    if (!gltf) {
      console.warn(`[hive] ${FOREST.model} not found — placeholder stand-in for the background forest`);
      return;
    }
    const merged = mergeModel(gltf.scene || gltf.scenes[0]);
    if (!merged) return;
    const bb = merged.boundingBox;
    const raw = bb.max.y - bb.min.y;
    const k = raw > 1e-4 ? 1 / raw : 1;
    merged.translate(0, -bb.min.y, 0);
    merged.scale(k, k, k);
    merged.computeBoundingSphere();
    mesh.geometry.dispose();
    mesh.geometry = merged;
  })();

  return { mesh, count: placed };
}

export function createHive(scene, terrain, assets) {
  const group = new THREE.Group();
  group.name = 'hive';
  const groundY = terrain && terrain.getHeight ? terrain.getHeight(HIVE.x, HIVE.z) : 0;
  group.position.set(HIVE.x, groundY, HIVE.z);
  scene.add(group);

  const faceZ = HIVE.z <= 0 ? 1 : -1;
  let canopy = null;
  let entranceHeight = HIVE.entranceHeight;
  let entranceSurface = radiusAt(HIVE.entranceHeight / HIVE.trunkHeight);

  const preloaded = assets && typeof assets.get === 'function' ? assets.get('tree') : null;
  let authored = null;
  if (preloaded) {
    authored = typeof assets.clone === 'function' ? assets.clone('tree') : preloaded;
  } else {
    canopy = PLACEHOLDER_hollowTree(group);
  }

  function adoptTree(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const raw = box.max.y - box.min.y;
    const k = raw > 1e-4 ? HIVE.trunkHeight / raw : 1;
    root.scale.multiplyScalar(k);
    root.position.y -= box.min.y * k;
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    const node = findNode(root, HIVE.canopyNode);
    if (node) canopy = node;
    group.add(root);
    group.updateMatrixWorld(true);
    const anchor = findNode(root, HIVE.entranceAnchor);
    if (anchor) {
      const local = group.worldToLocal(anchor.getWorldPosition(new THREE.Vector3()));
      entranceHeight = local.y;
      entranceSurface = Math.hypot(local.x, local.z);
    }
  }

  if (authored) adoptTree(authored);

  const marker = buildEntranceMarker(group, faceZ, entranceHeight, entranceSurface);

  const entrance = new THREE.Vector3(
    HIVE.x,
    groundY + entranceHeight,
    HIVE.z + (entranceSurface + HIVE.entranceRadius * 0.4) * faceZ
  );
  const position = new THREE.Vector3(HIVE.x, groundY, HIVE.z);

  if (terrain && Array.isArray(terrain.colliders)) {
    const r = HIVE.trunkRadiusBase * HIVE.colliderRadius;
    terrain.colliders.push({
      min: new THREE.Vector3(HIVE.x - r, groundY - 1, HIVE.z - r),
      max: new THREE.Vector3(HIVE.x + r, groundY + HIVE.trunkHeight, HIVE.z + r),
    });
    const rr = HIVE.trunkRadiusBase * HIVE.rootColliderRadius;
    terrain.colliders.push({
      min: new THREE.Vector3(HIVE.x - rr, groundY - 1, HIVE.z - rr),
      max: new THREE.Vector3(HIVE.x + rr, groundY + HIVE.rootHeight * 0.6, HIVE.z + rr),
    });
  }

  const forest = createForest(scene, terrain, groundY);

  if (!preloaded) {
    (async () => {
      const gltf = await fetchModel(HIVE.model);
      if (!gltf) {
        console.warn(`[hive] ${HIVE.model} not found — placeholder stand-in for the hollow tree`);
        return;
      }
      const root = gltf.scene || gltf.scenes[0];
      if (!root) return;
      for (const child of group.children.slice()) {
        if (child === marker.local) continue;
        group.remove(child);
      }
      canopy = null;
      adoptTree(root);
      marker.local.position.set(0, entranceHeight, (entranceSurface - HIVE.entranceDepth * 0.2) * faceZ);
      entrance.set(
        HIVE.x,
        groundY + entranceHeight,
        HIVE.z + (entranceSurface + HIVE.entranceRadius * 0.4) * faceZ
      );
    })();
  }

  let clock = 0;

  function update(dt) {
    if (!(dt > 0)) return;
    clock += dt;
    if (canopy) {
      canopy.rotation.z = Math.sin(clock * HIVE.swaySpeed) * HIVE.swayAmp;
      canopy.rotation.x = Math.sin(clock * HIVE.swaySpeed * 0.73 + 1.3) * HIVE.swayAmp * 0.7;
    }
    const pulse = 0.72 + Math.sin(clock * 1.4) * HIVE.glowPulse * 0.22;
    marker.glow.material.opacity = pulse;
  }

  return {
    group,
    position,
    entrance,
    forest,
    triggerRadius: HIVE.triggerRadius,
    update,
    dispose() {
      scene.remove(group);
      if (forest && forest.mesh) {
        forest.mesh.geometry.dispose();
        forest.mesh.material.dispose();
        scene.remove(forest.mesh);
      }
    },
  };
}
