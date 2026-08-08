// Gauntlet Builder A — in-engine measurement harness. Loaded into the running page with
// fetch()+eval from the browser tool. Not shipped, not imported by the game.
(function () {
  const h = window.hollowtree;
  window.__ready = false;
  window.__stage = 'start';
  if (!h) { window.__stage = 'no-app'; return; }

  function hideChrome() {
    for (const el of [...document.body.children]) {
      const t = (el.textContent || '').trim().toLowerCase();
      if (el.classList.contains('ht-menu-screen')) el.style.display = 'none';
      if (el.classList.contains('ht-build')) el.style.display = 'none';
      if (el.classList.contains('ht-recipes')) el.style.display = 'none';
      if (el.classList.contains('ht-hud')) el.style.display = 'none';
      if (t === 'any key to skip' || t === 'click to fly') el.style.display = 'none';
    }
    try { if (h.nest && h.nest.build && h.nest.build.state.open) h.nest.build.close(); } catch (e) { /* not ready */ }
  }
  window.hideChrome = hideChrome;

  // The build panel keeps coming back (input focus in the harness), and its translucent
  // sheet sits over the middle of every evidence shot. Kill it with a stylesheet so it
  // cannot re-show, and keep build mode itself closed from inside the render hook.
  if (!document.getElementById('gauntlet-a-css')) {
    const st = document.createElement('style');
    st.id = 'gauntlet-a-css';
    st.textContent = '.ht-build,.ht-recipes,.ht-hud,.ht-menu-screen{display:none !important}';
    document.head.appendChild(st);
  }

  // ---- helpers -------------------------------------------------------------
  const CAM_BACK = 10.36; // measured: camera trails the queen by this much along forward

  window.tp = function (x, y, z, yaw, pitch) {
    h.flight.simPosition.set(x, y, z);
    h.flight.velocity.set(0, 0, 0);
    if (yaw !== undefined) h.rig.yaw = yaw;
    if (pitch !== undefined) h.rig.pitch = pitch;
  };

  // Put the CAMERA at (x,y,z) looking along yaw (0 = -Z), by placing the queen ahead of it.
  window.view = function (x, y, z, yaw, pitch) {
    const fx = -Math.sin(yaw || 0);
    const fz = -Math.cos(yaw || 0);
    window.tp(x + fx * CAM_BACK, y, z + fz * CAM_BACK, yaw || 0, pitch || 0);
  };

  window.camInfo = function () {
    const c = h.camera;
    return { pos: c.position.toArray().map(v => +v.toFixed(2)), bee: h.flight.position.toArray().map(v => +v.toFixed(2)) };
  };

  // ---- framebuffer sampler --------------------------------------------------
  if (window.__samplerVersion !== 2) {
    window.__samplerVersion = 2;
    const post = h.post;
    const orig = post.render.bind(post);
    window.__req = null;
    window.__out = null;
    post.render = function (...a) {
      if (window.__lockCam) {
        try { if (h.nest && h.nest.build && h.nest.build.state.open) h.nest.build.close(); } catch (e) { /* fine */ }
        const L = window.__lockCam;
        h.camera.position.set(L.pos[0], L.pos[1], L.pos[2]);
        h.camera.up.set(0, 1, 0);
        h.camera.lookAt(L.look[0], L.look[1], L.look[2]);
        h.camera.updateMatrixWorld(true);
      }
      const r = orig(...a);
      if (window.__req) {
        const gl = h.renderer.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const buf = new Uint8Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const fn = window.__req;
        window.__req = null;
        try { window.__out = fn(buf, W, H); } catch (e) { window.__out = { error: String(e) }; }
      }
      return r;
    };
  }

  // Deterministic camera: the chase rig trails the queen by a distance that depends on her
  // speed, so for evidence shots the camera is pinned instead. Insideness still keys off the
  // queen, so she is parked inside the hall and her model hidden.
  window.lockCam = function (px, py, pz, lx, ly, lz) {
    window.__lockCam = { pos: [px, py, pz], look: [lx, ly, lz] };
    // The queen stays parked just inside the aperture: insideness latches off HER position,
    // and anywhere deeper is outside the trunk cylinder, so the portal would drop her out.
    h.flight.simPosition.set(0, 16, -35);
    h.flight.velocity.set(0, 0, 0);
    if (h.queen && h.queen.object3D) h.queen.object3D.visible = false;
    return 'locked';
  };
  window.unlockCam = function () {
    window.__lockCam = null;
    if (h.queen && h.queen.object3D) h.queen.object3D.visible = true;
    return 'free';
  };

  // rect in top-left screen coords, in drawing-buffer pixels
  window.rectStats = function (buf, W, H, x0, y0, x1, y1) {
    let n = 0, sr = 0, sg = 0, sb = 0, ls = 0, lmax = 0, lmin = 999;
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) {
      const gy = H - 1 - y;
      for (let x = x0; x < x1; x++) {
        const i = (gy * W + x) * 4;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sr += r; sg += g; sb += b; ls += l;
        if (l > lmax) lmax = l;
        if (l < lmin) lmin = l;
        n++;
      }
    }
    if (!n) return null;
    return {
      n, r: +(sr / n).toFixed(1), g: +(sg / n).toFixed(1), b: +(sb / n).toFixed(1),
      luma: +(ls / n).toFixed(1), lumaMax: +lmax.toFixed(1), lumaMin: +lmin.toFixed(1),
    };
  };

  // project a world point to top-left screen pixels of the drawing buffer
  window.project = function (v) {
    const gl = h.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const p = v.clone ? v.clone() : Object.assign(Object.create(Object.getPrototypeOf(h.camera.position)), v);
    const q = h.camera.position.clone().set(v.x, v.y, v.z);
    q.project(h.camera);
    return { x: Math.round((q.x * 0.5 + 0.5) * W), y: Math.round((-q.y * 0.5 + 0.5) * H), z: +q.z.toFixed(3), W, H };
  };

  // one-shot: ask for stats on a list of rects, resolved on the next rendered frame
  window.shoot = function (rects) {
    window.__out = null;
    window.__req = function (buf, W, H) {
      const out = { W, H, rects: {} };
      for (const k of Object.keys(rects)) {
        const r = rects[k];
        out.rects[k] = window.rectStats(buf, W, H, r[0], r[1], r[2], r[3]);
      }
      return out;
    };
    return 'queued';
  };

  // frame-time sampler: collects per-frame deltas, discards harness stalls
  window.fpsProbe = function (ms) {
    window.__frames = [];
    let last = performance.now();
    const stop = performance.now() + (ms || 4000);
    function tick(now) {
      window.__frames.push(now - last);
      last = now;
      if (now < stop) requestAnimationFrame(tick);
      else {
        const d = window.__frames.filter(v => v < 100 && v > 0).sort((a, b) => a - b);
        window.__fps = d.length ? {
          samples: d.length, dropped: window.__frames.length - d.length,
          median: +d[d.length >> 1].toFixed(2), p95: +d[Math.floor(d.length * 0.95)].toFixed(2),
          mean: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2),
        } : null;
      }
    }
    requestAnimationFrame(tick);
    return 'probing';
  };

  // ---- boot ----------------------------------------------------------------
  hideChrome();
  if (h.mode === 'menu') h.enterWorld({ mode: 'solo' });
  const t0 = performance.now();
  const iv = setInterval(() => {
    hideChrome();
    if (h.cinematic && h.cinematic.active && h.cinematic.skip) h.cinematic.skip();
    if (h.mode === 'play') {
      clearInterval(iv);
      const comb = h.nest && h.nest.comb;
      if (comb) {
        // Local seeding: detach the shared room so the seed lands in this client only and
        // the measurement never depends on a round trip.
        try { comb.detachNet(); } catch (e) { /* nothing attached */ }
        comb.seedHive();
      }
      window.__stage = 'play';
      window.__ready = true;
    } else if (performance.now() - t0 > 90000) {
      clearInterval(iv);
      window.__stage = 'timeout';
    }
  }, 250);
})();
