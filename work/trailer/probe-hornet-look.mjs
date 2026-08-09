import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const info = await page.evaluate(() => {
  const ht = window.hollowtree;
  const cam = ht.camera;

  // A clear spot of sky in front of the camera, so nothing but the two silhouettes is in
  // the frame. Both subjects sit at exactly 20 m -- the distance the spec asks about.
  const fwd = cam.position.clone(); // reuse as a Vector3 factory
  const eye = cam.position.clone();
  eye.set(140, 55, 140);
  const at = eye.clone(); at.set(140, 55, 120);
  cam.position.copy(eye);
  cam.lookAt(at);
  cam.updateMatrixWorld(true);

  const meshes = { hornetBody: null, hornetAbdomen: null, hornetWing: null, bee: null };
  ht.scene.traverse((o) => {
    if (o.parent && o.parent.name === 'hornets') {
      if (!meshes.hornetBody) meshes.hornetBody = o;
      else if (!meshes.hornetAbdomen) meshes.hornetAbdomen = o;
      else if (!meshes.hornetWing) meshes.hornetWing = o;
    }
    if (o.name === 'swarm:forager') meshes.bee = o;
  });

  const M = ht.camera.matrixWorld.clone();
  const place = (mesh, x, scale) => {
    if (!mesh) return;
    M.identity();
    M.makeRotationY(Math.PI * 0.5);
    M.setPosition(140 + x, 55, 120);
    if (scale !== 1) M.scale(new (at.constructor)(scale, scale, scale));
    mesh.setMatrixAt(0, M);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 1;
    mesh.visible = true;
  };

  place(meshes.hornetBody, 1.1, 1);
  place(meshes.hornetAbdomen, 1.1, 1);
  place(meshes.bee, -1.1, 1);
  if (meshes.hornetBody && meshes.hornetBody.parent) meshes.hornetBody.parent.visible = true;

  let tris = 0;
  for (const k of ['hornetBody', 'hornetAbdomen']) {
    const m = meshes[k];
    if (m && m.geometry) tris += m.geometry.getAttribute('position').count / 3;
  }
  const beeTris = meshes.bee ? meshes.bee.geometry.getAttribute('position').count / 3 : 0;
  ht.renderer.render(ht.scene, cam);
  return { hornetTris: Math.round(tris), beeTris: Math.round(beeTris), found: Object.keys(meshes).filter((k) => meshes[k]) };
});

await page.screenshot({ path: 'out/hornet-vs-bee.png' });
console.log(JSON.stringify(info));
await browser.close();
