// Hollowtree — queen visual: glb body, wingbeat smear and pose driven by the flight state.

import { Group, Mesh, MeshBasicMaterial, DoubleSide, MathUtils } from 'three';
import { QUEEN } from '../config.js';

function collectWings(model) {
  const wings = [];
  model.traverse((child) => {
    if (child.isMesh && /wing/i.test(child.name)) wings.push(child);
  });
  return wings;
}

function buildSmear(wing, parent) {
  const hinge = new Group();
  hinge.position.copy(wing.position);
  hinge.quaternion.copy(wing.quaternion);
  parent.add(hinge);

  const side = wing.position.x >= 0 ? 1 : -1;
  const ghosts = [];
  for (let i = 0; i < QUEEN.smearGhosts; i++) {
    const ghost = new Mesh(
      wing.geometry,
      new MeshBasicMaterial({
        color: QUEEN.wingColor,
        transparent: true,
        opacity: QUEEN.smearOpacity * (1 - i / QUEEN.smearGhosts) ** 1.4,
        depthWrite: false,
        side: DoubleSide,
      })
    );
    ghost.position.set(0, 0, 0);
    ghost.scale.copy(wing.scale);
    ghost.renderOrder = 2;
    hinge.add(ghost);
    ghosts.push(ghost);
  }

  wing.visible = false;
  return { hinge, ghosts, side };
}

export function createQueen(scene, assets) {
  const root = new Group();
  const yawFix = new Group();
  yawFix.rotation.y = Math.PI;
  root.add(yawFix);
  scene.add(root);

  const source = assets && typeof assets.get === 'function' ? assets.get('queen') : null;
  const model = source && source.isObject3D ? source.clone(true) : null;

  let smears = [];
  if (model) {
    model.scale.setScalar(QUEEN.scale);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = false;
      child.frustumCulled = false;
      if (child.material) child.material.side = DoubleSide;
    });
    yawFix.add(model);
    smears = collectWings(model).map((wing) => buildSmear(wing, wing.parent));
  }

  let beat = 0;
  let blur = 0;

  function update(dt, flight) {
    if (!(dt > 0)) dt = 1 / 60;
    if (!flight) return;

    root.position.copy(flight.position);
    root.quaternion.copy(flight.quaternion);

    if (!smears.length) return;

    const effort = MathUtils.clamp(
      QUEEN.beatIdle +
        (typeof flight.speedRatio === 'number' ? flight.speedRatio : 0) * QUEEN.beatSpeedGain +
        (typeof flight.boostAmount === 'number' ? flight.boostAmount : 0) * QUEEN.beatBoostGain,
      0,
      1
    );

    beat += dt * Math.PI * 2 * (QUEEN.beatHz * (0.75 + effort * 0.5));
    if (beat > Math.PI * 2) beat -= Math.PI * 2;
    blur += (effort - blur) * Math.min(1, dt * QUEEN.blurResponse);

    const sweep = QUEEN.sweepMin + (QUEEN.sweepMax - QUEEN.sweepMin) * blur;

    for (let i = 0; i < smears.length; i++) {
      const smear = smears[i];
      for (let g = 0; g < smear.ghosts.length; g++) {
        const lag = (g / smear.ghosts.length) * QUEEN.smearLag;
        const angle = Math.sin(beat - lag) * sweep;
        smear.ghosts[g].rotation.z = smear.side * angle;
        smear.ghosts[g].rotation.x = Math.cos(beat - lag) * sweep * QUEEN.sweepTwist;
        smear.ghosts[g].material.opacity =
          QUEEN.smearOpacity * (1 - g / smear.ghosts.length) ** 1.4 * (0.45 + blur * 0.55);
      }
    }
  }

  return { object3D: root, model, update };
}
