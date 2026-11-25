// Hollowtree trailer — headless session: boots the real game with the clock and the frame
// queue under our control, then hands back a stepper. Nothing in src/ is modified; the game
// is driven entirely through window.hollowtree and the injected harness.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 60;
export const STEP_MS = 1000 / FPS;
export const URL = 'http://localhost:8150/';
// Every session steps exactly this many frames before the first shot, so the simulation is
// always at the same phase when capture starts.
export const BOOT_FRAMES = 900;
export const BOOT_TIME_OF_DAY = 0.30;

const HARNESS = readFileSync(join(HERE, 'harness-inject.js'), 'utf8');
const CINECAM = readFileSync(join(HERE, 'cinecam.js'), 'utf8');
const SHOTS = readFileSync(join(HERE, 'shots.js'), 'utf8');

export async function launch({ verbose = false } = {}) {
  const browser = await puppeteer.launch({
    headless: 'shell',
    args: [
      '--use-gl=angle',
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-device-scale-factor=1',
      '--disable-lcd-text',
      '--font-render-hinting=none',
      `--window-size=${WIDTH},${HEIGHT}`,
    ],
    protocolTimeout: 300000,
  });
  return browser;
}

// One page, booted to the point where the trailer owns the camera.
export async function openGame(browser, {
  dateEpoch,
  seed = 20260808,
  quality = 'high',
  verbose = false,

} = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);

  const errors = [];
  page.on('pageerror', (e) => { errors.push(String(e)); if (verbose) console.log('[pageerror]', String(e).slice(0, 300)); });
  page.on('console', (m) => {
    const t = m.text();
    if (verbose) console.log('[page]', m.type(), t.slice(0, 240));
    if (m.type() === 'error') errors.push(t);
  });

  await page.evaluateOnNewDocument(
    `window.__TRAILER_CFG = ${JSON.stringify({ dateEpoch, seed })};`
  );
  await page.evaluateOnNewDocument(HARNESS);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Assets load on real promises, not on frames, so this resolves without stepping.
  // Poll on a timer, never on rAF: the harness owns requestAnimationFrame and it does not
  // fire on its own, so puppeteer's default raf polling would wait forever.
  await page.waitForFunction('!!window.hollowtree', { timeout: 180000, polling: 250 });

  // Force the render quality we want regardless of any stored setting, then strip the
  // page down to the canvas so no menu, HUD or hint can appear in a frame.
  await page.evaluate((wantQuality) => {
    const ht = window.hollowtree;
    if (ht.menu && ht.menu.settings) {
      ht.menu.settings.quality = wantQuality;
    }
    const style = document.createElement('style');
    style.id = 'trailer-clean';
    style.textContent = `
      #loading{display:none!important}
      body > *:not(canvas):not(.ht-hud){display:none!important}
      html.trailer-nohud .ht-hud{display:none!important}
      canvas{width:100vw!important;height:100vh!important}
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('trailer-nohud');
  }, quality);

  const stepper = makeStepper(page);

  // enterWorld plays the opening cinematic; the trailer supplies its own opening, so the
  // built-in one is skipped the moment it exists.
  //
  // Crucially this waits WITHOUT stepping a single frame. Both enterWorld and the skip
  // resolve on promises and real timers, not on the frame queue, so nothing here needs the
  // clock to move — and that is what makes the render reproducible. Stepping until the
  // world happened to be ready burned a different number of frames on every run, which
  // left the simulation at a different phase before the first shot even began, and every
  // captured frame then differed between sessions.
  await page.evaluate(() => {
    window.__entered = window.hollowtree.enterWorld({
      mode: 'solo',
      code: 'TRAILER',
      profile: { name: 'Queen', color: '#f2b544', pattern: 'stripe' },
      startedAt: 1754640000000,
    }).then(() => { window.__enteredOk = true; });
  });

  // Wait for the cinematic to EXIST without stepping. Everything up to this point runs on
  // promises — the net handshake and the dynamic import — so no frame has been consumed
  // yet and the frame counter is still exactly zero on every run.
  await page.waitForFunction(() => {
    const ht = window.hollowtree;
    return ht.mode === 'cinematic' && ht.cinematic && typeof ht.cinematic.skip === 'function';
  }, { polling: 50, timeout: 120000 });

  // The session's clock is only server-corrected once the net handshake has landed, and the
  // correction is derived from real wall time, so it is a few tens of milliseconds different
  // on every run. Everything time-derived reads it — the sun, the weather schedule, the wind
  // that nudges the queen — so it is pinned to a canonical value here, BEFORE the first
  // frame. Without this the boot frames run on a slightly different world and the queen
  // arrives at shot one with a different hover phase, which is enough to change every pixel.
  await page.evaluate(() => {
    const world = window.hollowtree.net && window.hollowtree.net.world;
    if (world && typeof world.now === 'function') world.now = () => Date.now();
  });

  await page.evaluate(() => window.hollowtree.cinematic.skip());

  // From here the only thing that advances the world is frames we hand it, and the count
  // is padded to a fixed total. Two sessions therefore reach the first shot with the
  // simulation at an identical phase.
  let entered = false;
  let switchFrame = -1;
  for (let i = 0; i < 600 && !entered; i++) {
    await stepper.step();
    entered = await page.evaluate(() => window.hollowtree.mode === 'play' && Boolean(window.__enteredOk));
  }
  switchFrame = await page.evaluate(() => window.__h.frames);
  if (!entered) throw new Error('enterWorld never resolved');
  if (process.env.TRAILER_DEBUG) console.log('[session] play mode at frame', switchFrame);

  const mode = await page.evaluate(() => window.hollowtree.mode);
  if (mode !== 'play') throw new Error(`game never reached play mode (mode=${mode})`);

  await page.evaluate(CINECAM);
  await page.evaluate(SHOTS);
  const world = await page.evaluate(() => window.__cine.install());

  // Cut the simulation loose from the network driver. The local driver delivers every write
  // through a simulated-latency setTimeout on the REAL clock, so shared state — comb cells,
  // flower reserves, the swarm, the hornets — would arrive on whichever frame happened to
  // be in flight when the timer fired. Detached, all four run purely off the frames we hand
  // them, which is what the render needs. The session itself stays up; only the shared-state
  // plumbing goes quiet.
  await page.evaluate(() => {
    const ht = window.hollowtree;
    const nest = ht.nest || {};
    for (const mod of [nest.comb, ht.flowers, ht.swarm, ht.hornets]) {
      if (mod && typeof mod.detachNet === 'function') {
        try { mod.detachNet(); } catch (e) {}
      }
    }
  });

  // hornets.js is the one shared-state module with no detachNet(): it talks to the world
  // node directly. It computes a raid's outcome locally AND publishes it, and the local
  // driver echoes that publish back through a simulated-latency timer on the real clock, so
  // adopt() lands on whichever frame the echo happens to catch and rewrites which hornets
  // breach. That is why the raid shot came out a few pixels different on every render while
  // every other shot was frame-identical. Swallowing writes to the 'hornets' key leaves the
  // local computation — a pure function of the calendar — and removes the echo.
  await page.evaluate(() => {
    const world = window.hollowtree.net && window.hollowtree.net.world;
    if (!world || typeof world.set !== 'function' || world.__cineNoHornets) return;
    world.__cineNoHornets = true;
    const set = world.set.bind(world);
    world.set = (key, value) => (key === 'hornets' ? Promise.resolve(true) : set(key, value));
  });

  // The built-in opening leaves the queen — and therefore the camera — inside the hollow,
  // which latches the portal to insideness 1. Park both out on the meadow and let the
  // portal, the LOD rings, the flower streaming and the grass wind settle before any shot
  // begins, or the first captured frame opens inside the hall looking at nothing.
  await page.evaluate(() => {
    const ht = window.hollowtree;
    ht.flight.simPosition.set(40, 6, 40);
    ht.flight.velocity.set(0, 0, 0);
    ht.camera.up.set(0, 1, 0);
    ht.camera.position.set(48, 8, 52);
    ht.camera.lookAt(0, 4, 0);
  });

  // From here on the page's own timers run on the virtual clock too, so nothing in the
  // world can advance because a screenshot took a while.
  await page.evaluate(() => window.__h.freezeTimers());

  // Pad to a fixed frame count. However many frames the skip happened to need, every
  // session arrives at the first shot having stepped exactly BOOT_FRAMES of them.
  const consumed = await page.evaluate(() => window.__h.frames);
  if (consumed > BOOT_FRAMES) {
    throw new Error(`boot consumed ${consumed} frames, over the ${BOOT_FRAMES} budget`);
  }
  await stepper.step(BOOT_FRAMES - consumed);

  return { page, stepper, world, errors };
}

function makeStepper(page) {
  return {
    async step(n = 1) {
      return page.evaluate((count, dt) => {
        for (let i = 0; i < count; i++) window.__h.step(dt);
        return window.__h.frames;
      }, n, STEP_MS);
    },
    async advance(frameIndex) {
      return page.evaluate((n, dt) => window.__h.advance(n, dt), frameIndex, STEP_MS);
    },
    async shot(path) {
      return page.screenshot({ path, type: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
    },
    async buffer() {
      return page.screenshot({ type: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
    },
  };
}

// timeOfDay in the game is derived from the world clock: ((now / dayLength) % 1 + 1 + 0.58) % 1.
// Inverting it gives the world time that puts the sun exactly where a shot wants it. Boot
// burns virtual seconds, so the epoch is set AFTER settling, from the clock as it stands.
const DAY_MS = 45 * 60 * 1000;
const DEFAULT_TOD = 0.58;

export async function setTimeOfDay(page, tod, dayIndex = 40000) {
  return page.evaluate((want, day, dayMs, base) => {
    const ht = window.hollowtree;
    // The game reads the session's server-corrected clock, not Date.now(). The offset
    // between them has to come out of the epoch or the sun lands somewhere else entirely.
    const offset = ht.net && ht.net.world && typeof ht.net.world.now === 'function'
      ? ht.net.world.now() - Date.now()
      : 0;
    const frac = (((want - base) % 1) + 1) % 1;
    const target = Math.round((day + frac) * dayMs);
    window.__h.setEpoch(target - offset - window.__h.vt);
    const now = (ht.net && ht.net.world ? ht.net.world.now() : Date.now());
    return { tod: ((now / dayMs) % 1 + 1 + base) % 1, offset };
  }, ((tod % 1) + 1) % 1, dayIndex, DAY_MS, DEFAULT_TOD);
}
