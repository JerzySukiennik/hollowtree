// Hollowtree — the M4 test cases, shared by the browser page (work/net-test.html) and the headless runner (work/net-node.test.mjs) so the two can never drift apart.

export function createSuite(env) {
  const { createNet, NET, log, check, section, sleep, now, wipe } = env;

  function net(code, mode, name, color, pattern) {
    // Forced onto the local driver: the suite must never touch the live hive.
    return createNet({ mode, code, driver: 'local', profile: { name, color, pattern } });
  }

  async function until(predicate, timeoutMs) {
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      if (predicate()) return true;
      await sleep(20);
    }
    return false;
  }

  async function shutdown(...nets) {
    for (const n of nets) { try { n.dispose(); } catch (error) { /* already gone */ } }
    await sleep(250);
  }

  // ───────────────────────────────────────────────────────── presence & clock
  async function casePresence() {
    section('presence, profiles and the server clock');
    const CODE = 'HTPRESENCE';
    wipe(CODE);
    const a = net(CODE, 'host', 'Jurek', 'amber', 'crowned');
    const b = net(CODE, 'join', 'Ryszard', 'harebell', 'dusted');

    const joins = [];
    const leaves = [];
    a.onPeerJoin((peer) => joins.push(peer.uid));
    a.onPeerLeave((peer) => leaves.push(peer.uid));

    const ra = await a.ready;
    const rb = await b.ready;
    check('both sessions become ready on the same hive', ra.code === CODE && rb.code === CODE, `${ra.uid} / ${rb.uid}`);
    check('the hive code is long enough for the deployed rules', CODE.length >= NET.codeMinLength, `${CODE.length} chars, rules demand ${NET.codeMinLength}`);

    check('each queen sees exactly one peer',
      await until(() => a.peers.size === 1 && b.peers.size === 1, 4000), `a=${a.peers.size} b=${b.peers.size}`);
    check('onPeerJoin fired for the remote queen', joins.length === 1 && joins[0] === rb.uid, joins.join(','));

    const peer = a.peers.get(rb.uid);
    check('peer carries profile and cosmetic',
      Boolean(peer) && peer.profile.name === 'Ryszard' && peer.cosmetic.color === 'harebell' && peer.cosmetic.pattern === 'dusted',
      peer ? `${peer.profile.name} / ${peer.cosmetic.color} / ${peer.cosmetic.pattern}` : 'missing');

    const rawGap = Math.abs(a.driver.rawNow() - b.driver.rawNow());
    const serverGap = Math.abs(a.driver.now() - b.driver.now());
    check('world time is server time, not client time', rawGap > 100 && serverGap < 50,
      `client clocks differ by ${rawGap.toFixed(0)} ms, server clocks agree within ${serverGap.toFixed(0)} ms`);

    const season = a.world.seasonPhase();
    check('season derives from the session epoch',
      NET.season.names.includes(season.name) && season.t >= 0 && season.t < 1,
      `${season.name} t=${season.t.toFixed(4)} year ${season.year}`);

    b.dispose();
    check('leaving removes the queen for everyone else',
      await until(() => a.peers.size === 0 && leaves.length === 1, 4000), `peers=${a.peers.size} leaves=${leaves.length}`);
    await shutdown(a);
  }

  // ────────────────────────────────────────────────── motion & interpolation
  async function caseMotion() {
    section('10 Hz publish, interpolated remote queen, bandwidth');
    const CODE = 'HTFLIGHT01';
    wipe(CODE);
    const a = net(CODE, 'host', 'Jurek', 'amber', 'banded');
    const b = net(CODE, 'join', 'Ryszard', 'clover', 'sable');
    await a.ready;
    await b.ready;
    await until(() => a.peers.size === 1 && b.peers.size === 1, 4000);

    // A flies a deterministic circle keyed to server time, so B can grade itself.
    const R = 18;
    const omega = 0.55;
    const epoch = a.world.epoch;
    const truth = (ms) => {
      const t = (ms - epoch) / 1000;
      return { x: Math.cos(omega * t) * R, y: 7 + Math.sin(t * 1.1) * 2.4, z: Math.sin(omega * t) * R };
    };
    const truthVel = (ms) => {
      const t = (ms - epoch) / 1000;
      return { x: -Math.sin(omega * t) * R * omega, y: Math.cos(t * 1.1) * 2.64, z: Math.cos(omega * t) * R * omega };
    };

    const bytesAtStart = a.driver.stats.bytesSent;
    const messagesAtStart = a.driver.stats.messagesSent;
    const motionAtStart = a.motionSends;
    const startedAt = now();
    let last = startedAt;
    let samples = 0;
    let sumErr = 0;
    let worstErr = 0;
    let maxJump = 0;
    let prev = null;

    while (now() - startedAt < 5000) {
      await sleep(8);
      const tick = now();
      const dt = Math.min(0.05, (tick - last) / 1000);
      last = tick;

      const serverNow = a.world.now();
      const half = (omega * (serverNow - epoch) / 1000) * 0.5;
      a.publishSelf({
        position: truth(serverNow),
        quaternion: { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) },
        velocity: truthVel(serverNow),
        carrying: 6.5,
        swarm: { worker: 14, builder: 3 },
      });
      a.update(dt);
      b.update(dt);

      if (tick - startedAt < 1600) { prev = null; continue; }
      const peer = b.peers.get(a.uid);
      if (!peer || !peer.hasMotion) continue;
      const expected = truth(b.world.now() - peer.interp.delay);
      const err = Math.hypot(peer.position.x - expected.x, peer.position.y - expected.y, peer.position.z - expected.z);
      sumErr += err; samples++; worstErr = Math.max(worstErr, err);
      if (prev) {
        maxJump = Math.max(maxJump, Math.hypot(peer.position.x - prev.x, peer.position.y - prev.y, peer.position.z - prev.z));
      }
      prev = { x: peer.position.x, y: peer.position.y, z: peer.position.z };
    }

    const elapsed = (now() - startedAt) / 1000;
    const peer = b.peers.get(a.uid);
    const meanErr = sumErr / Math.max(1, samples);
    check('remote queen is actually moving on the other side',
      Boolean(peer) && samples > 60 && Math.hypot(peer.position.x, peer.position.z) > R * 0.5,
      `${samples} sampled frames, radius ${peer ? Math.hypot(peer.position.x, peer.position.z).toFixed(2) : 0} m`);
    check('interpolated position tracks the authority', meanErr < 0.35 && worstErr < 1.2,
      `mean ${meanErr.toFixed(3)} m, worst ${worstErr.toFixed(3)} m, buffer delay ${peer.interp.delay.toFixed(0)} ms`);
    // At ~10 m/s and 60 fps one honest frame of motion is ~0.17 m; a dropped packet
    // or a rubber-band would be several times that.
    check('no rubber-banding or jitter between frames', maxJump < 0.6, `max frame delta ${maxJump.toFixed(3)} m`);
    check('remote quaternion stays a unit rotation',
      Math.abs(Math.hypot(peer.quaternion.x, peer.quaternion.y, peer.quaternion.z, peer.quaternion.w) - 1) < 1e-3);
    check('carrying load crosses the wire', Math.abs(peer.carrying - 6.5) < 0.1, peer.carrying.toFixed(2));
    check('swarm crosses as composition only, never per-bee',
      peer.swarm.worker === 14 && peer.swarm.builder === 3 && Object.keys(peer.swarm).length === 2,
      JSON.stringify(peer.swarm));

    const bytes = a.driver.stats.bytesSent - bytesAtStart;
    const messages = a.driver.stats.messagesSent - messagesAtStart;
    const perMessage = bytes / Math.max(1, messages);
    const rate = (a.motionSends - motionAtStart) / elapsed;
    log(`INFO  measured uplink ${(bytes / elapsed / 1024).toFixed(3)} KB/s payload · ${rate.toFixed(1)} msg/s · ${perMessage.toFixed(1)} B/msg over ${elapsed.toFixed(1)} s`);
    const rtdbUp = (perMessage + 78) * rate;
    log(`INFO  projected on RTDB (payload + ~78 B frame): ${(rtdbUp / 1024).toFixed(2)} KB/s up, ${(rtdbUp * 3 / 1024).toFixed(2)} KB/s aggregate per client at 3 players`);
    check('publish rate is ~10 Hz', rate > 8 && rate < 13, `${rate.toFixed(1)} Hz`);
    check('per-client uplink under 2 KB/s at 3 players', rtdbUp < 2048, `${(rtdbUp / 1024).toFixed(2)} KB/s`);

    // A still queen must not keep paying for 10 Hz.
    const idleStart = a.motionSends;
    const idleFrom = now();
    const parked = truth(a.world.now());
    let idleLast = idleFrom;
    while (now() - idleFrom < 3000) {
      await sleep(8);
      const tick = now();
      const idleDt = Math.min(0.05, (tick - idleLast) / 1000);
      idleLast = tick;
      a.publishSelf({ position: parked, velocity: { x: 0, y: 0, z: 0 } });
      a.update(idleDt);
      b.update(idleDt);
    }
    const idleRate = (a.motionSends - idleStart) / ((now() - idleFrom) / 1000);
    check('a still queen throttles down to the idle rate', idleRate <= NET.rates.idleMotionHz + 0.6, `${idleRate.toFixed(2)} Hz while parked`);

    await shutdown(a, b);
  }

  // ───────────────────────────────────────────────────── contended transactions
  async function caseBank() {
    section('shared bank under contention');
    const CODE = 'HTBANK0001';
    wipe(CODE);
    const a = net(CODE, 'host', 'Jurek', 'amber', 'banded');
    const b = net(CODE, 'join', 'Ryszard', 'ember', 'sable');
    await a.ready;
    await b.ready;
    await until(() => a.peers.size === 1 && b.peers.size === 1, 4000);

    // Two queens fly into the hollow in the same tick, twenty times each.
    const before = a.bank.snapshot().pollen;
    const N = 20;
    const work = [];
    for (let i = 0; i < N; i++) {
      work.push(a.bank.deposit('pollen', 3));
      work.push(b.bank.deposit('pollen', 5));
    }
    const results = await Promise.all(work);
    const expected = before + N * 3 + N * 5;

    await until(() => Math.abs(a.bank.snapshot().pollen - expected) < 1e-6, 5000);
    await until(() => Math.abs(b.bank.snapshot().pollen - expected) < 1e-6, 5000);
    const finalA = a.bank.snapshot().pollen;
    const finalB = b.bank.snapshot().pollen;

    check('every contended deposit committed', results.every(Boolean), `${results.filter(Boolean).length}/${results.length}`);
    check('bank ends at the exact sum, no lost update',
      Math.abs(finalA - expected) < 1e-6 && Math.abs(finalB - expected) < 1e-6,
      `expected ${expected}, host sees ${finalA}, peer sees ${finalB}`);
    const retries = a.driver.stats.transactionRetries + b.driver.stats.transactionRetries;
    check('contention really happened (transactions retried)', retries > 0,
      `${retries} retries — a set() on a stale read would have lost updates here`);

    await a.bank.deposit('resin', 10);
    await until(() => a.bank.snapshot().resin >= 10, 3000);
    const beforeSpend = a.bank.snapshot();
    const tooMuch = await a.bank.spend({ pollen: 5, resin: 9999 });
    await sleep(200);
    const afterFail = a.bank.snapshot();
    check('an unaffordable purchase changes nothing',
      tooMuch === false
        && Math.abs(afterFail.pollen - beforeSpend.pollen) < 1e-6
        && Math.abs(afterFail.resin - beforeSpend.resin) < 1e-6,
      `pollen ${afterFail.pollen}, resin ${afterFail.resin}`);

    const afford = await a.bank.spend({ pollen: 10, resin: 4 });
    await until(() => Math.abs(a.bank.snapshot().pollen - (beforeSpend.pollen - 10)) < 1e-6, 3000);
    const afterOk = a.bank.snapshot();
    check('an affordable purchase debits every resource at once',
      afford === true
        && Math.abs(afterOk.pollen - (beforeSpend.pollen - 10)) < 1e-6
        && Math.abs(afterOk.resin - (beforeSpend.resin - 4)) < 1e-6,
      `pollen ${afterOk.pollen}, resin ${afterOk.resin}`);

    check('the other queen sees the same single bank',
      await until(() => Math.abs(b.bank.snapshot().pollen - afterOk.pollen) < 1e-6, 4000),
      `peer pollen ${b.bank.snapshot().pollen}`);

    const contrib = await a.bank.contributions();
    const mine = (contrib && contrib[a.uid] && contrib[a.uid].pollen) || 0;
    check('contributions are logged per queen', Math.abs(mine - N * 3) < 1e-6, `${a.uid} brought ${mine} pollen`);

    await shutdown(a, b);
  }

  // ─────────────────────────────────────────────── single-owner world simulation
  async function caseAuthority() {
    section('single-owner world simulation and handover');
    const CODE = 'HTAUTHOR01';
    wipe(CODE);
    const a = net(CODE, 'host', 'Jurek', 'amber', 'banded');
    const b = net(CODE, 'join', 'Ryszard', 'clover', 'dusted');
    const c = net(CODE, 'join', 'Marta', 'thistle', 'crowned');
    const ra = await a.ready;
    const rb = await b.ready;
    const rc = await c.ready;
    const all = [a, b, c];
    await until(() => all.every((n) => n.peers.size === 2), 6000);
    // The lease is only held by a client that is actually simulating, so tick all
    // three for long enough that the claim settles on the lowest id.
    const settleUntil = now() + 2000;
    while (now() < settleUntil) { await sleep(16); for (const n of all) n.update(0.016); }

    const uids = [ra.uid, rb.uid, rc.uid].sort();
    const lowest = uids[0];
    const owners = all.filter((n) => n.authority.isMine());
    check('exactly one client owns the world simulation', owners.length === 1, `${owners.length} owner(s)`);
    check('the owner is the lowest client id present',
      owners.length === 1 && owners[0].uid === lowest,
      `${uids.join(' < ')} → owner ${owners.length === 1 ? owners[0].uid : '?'}`);
    check('everybody agrees who the owner is', all.every((n) => n.authority.owner() === lowest),
      all.map((n) => n.authority.owner()).join(' / '));

    const leaving = owners[0] || a;
    const rest = all.filter((n) => n !== leaving);
    const nextLowest = uids.filter((u) => u !== leaving.uid).sort()[0];
    leaving.dispose();
    const settled = await until(() => {
      for (const n of rest) n.update(0.05);
      return rest.filter((n) => n.authority.isMine()).length === 1;
    }, 8000);
    const nextOwners = rest.filter((n) => n.authority.isMine());
    check('authority hands over when the owner leaves', settled && nextOwners.length === 1, `${nextOwners.length} owner(s)`);
    check('the new owner is the next lowest client id',
      nextOwners.length === 1 && nextOwners[0].uid === nextLowest,
      `${nextOwners.length === 1 ? nextOwners[0].uid : '?'} vs expected ${nextLowest}`);
    const holdUntil = now() + 600;
    let dual = 0;
    while (now() < holdUntil) {
      await sleep(50);
      for (const n of rest) n.update(0.05);
      if (rest.filter((n) => n.authority.isMine()).length > 1) dual++;
    }
    check('never two owners at once', dual === 0, `${dual} dual-owner samples`);

    const owner = nextOwners[0] || rest[0];
    const other = rest.find((n) => n !== owner);
    await owner.world.transact('flowers/dandelion-04', (current) => ({
      a: ((current && current.a) || 100) - 35,
      d: owner.world.now(),
    }));
    let mirrored = false;
    for (let i = 0; i < 60 && !mirrored; i++) {
      const value = await other.world.get('flowers/dandelion-04');
      if (value && value.a === 65) mirrored = true;
      else await sleep(40);
    }
    check('world state written by the owner reaches the others', mirrored, 'flower depleted 100 → 65');

    await owner.comb.transact('q3r-4', (current) => (current ? undefined : { t: 'honey-store', o: owner.uid, b: owner.world.now() }));
    await sleep(150);
    const cell = await other.comb.get('q3r-4');
    check('comb cells live in their own subtree', Boolean(cell && cell.t === 'honey-store'), JSON.stringify(cell));

    await shutdown(...rest);
  }

  // ──────────────────────────────────── a frozen tab must not keep owning the world
  // src/core/loop.js stops requestAnimationFrame on visibilitychange, so a hidden tab
  // stops calling update(). This reproduces that exactly: the owner goes quiet for
  // twice the presence-stale window while its peer keeps ticking, and we sample both
  // clients throughout. The old inference-based authority reported two owners for the
  // whole stall; a lease has to report exactly one at every instant.
  async function caseFrozenOwner() {
    section('a frozen tab never keeps world-simulation ownership');
    const CODE = 'HTFROZEN01';
    wipe(CODE);
    const a = net(CODE, 'host', 'Jurek', 'amber', 'banded');
    const b = net(CODE, 'join', 'Ryszard', 'clover', 'dusted');
    await a.ready;
    await b.ready;
    await until(() => a.peers.size === 1 && b.peers.size === 1, 5000);

    // Either client can win the lease, so remember who wears what.
    const styles = new Map([
      [a.uid, { name: 'Jurek', color: 'amber', pattern: 'banded' }],
      [b.uid, { name: 'Ryszard', color: 'clover', pattern: 'dusted' }],
    ]);

    const warmUntil = now() + 1500;
    while (now() < warmUntil) { await sleep(16); a.update(0.016); b.update(0.016); }

    const owners = [a, b].filter((n) => n.authority.isMine());
    check('exactly one owner before the stall', owners.length === 1, `${owners.length} owner(s)`);
    const frozen = owners[0] || a;
    const ticking = frozen === a ? b : a;

    // Stop calling update() on the owner for 2 × presenceStaleSec, sampling both
    // clients every 50 ms. The peer keeps running its frame loop as normal.
    let both = 0;
    let neither = 0;
    let samples = 0;
    let sawHandover = false;
    const stallMs = 2 * NET.rates.presenceStaleSec * 1000;
    const stallUntil = now() + stallMs;
    let tick = now();
    while (now() < stallUntil) {
      await sleep(50);
      const step = Math.min(0.05, (now() - tick) / 1000);
      tick = now();
      ticking.update(step);                       // the visible tab keeps rendering
      const frozenOwns = frozen.authority.isMine();
      const tickingOwns = ticking.authority.isMine();
      samples++;
      if (frozenOwns && tickingOwns) both++;
      if (!frozenOwns && !tickingOwns) neither++;
      if (tickingOwns) sawHandover = true;
    }

    check('never two owners at any sampled instant during the stall',
      both === 0, `${both} dual-owner samples of ${samples} over ${(stallMs / 1000).toFixed(0)} s`);
    check('the frozen client revokes its own claim', !frozen.authority.isMine(),
      `lease expires in ${frozen.authority.expiresIn().toFixed(0)} ms`);
    check('the ticking client takes the world over', sawHandover && ticking.authority.isMine(),
      `owner is now ${ticking.authority.owner()}`);
    log(`INFO  ${neither} of ${samples} samples had no owner (the gap between expiry and the next claim)`);

    // Resuming has to heal the roster: a reaped client must get its presence and its
    // metadata back, or it loses its colour, pattern, swarm and ready flag for good.
    const resumeUntil = now() + 4000;
    while (now() < resumeUntil) {
      await sleep(16);
      a.update(0.016);
      b.update(0.016);
    }
    const meta = await frozen.driver.get(`${NET.root}/${CODE}/world/meta/${frozen.uid}`);
    check('the resumed client republishes world/meta/$uid',
      Boolean(meta && meta.c && meta.k), JSON.stringify(meta));
    // Asserted on the OTHER client's view: the point is that a queen who was reaped
    // and came back is still drawn in her own colours by everyone else.
    const want = styles.get(frozen.uid);
    const restored = ticking.peers.get(frozen.uid);
    const rosterEntry = ticking.roster().find((p) => p.uid === frozen.uid);
    check('the resumed client keeps its colour and pattern in the peer view',
      Boolean(restored) && restored.cosmetic.color === want.color && restored.cosmetic.pattern === want.pattern
        && restored.profile.name === want.name,
      restored ? `${restored.profile.name}: ${restored.cosmetic.color} / ${restored.cosmetic.pattern} (expected ${want.color} / ${want.pattern})` : 'missing');
    check('the resumed client keeps its colour and pattern in the peer roster',
      Boolean(rosterEntry) && rosterEntry.color === want.color && rosterEntry.pattern === want.pattern,
      rosterEntry ? `${rosterEntry.name}: ${rosterEntry.color} / ${rosterEntry.pattern}` : 'missing');
    check('the resumed client is back in the other roster',
      ticking.peers.has(frozen.uid), `peers=${ticking.peers.size}`);
    const ownersAfter = [a, b].filter((n) => n.authority.isMine());
    check('still exactly one owner after the resume', ownersAfter.length === 1,
      `${ownersAfter.length} owner(s), ${ownersAfter.map((n) => n.uid).join(',')}`);

    await shutdown(a, b);
  }

  // ─────────────────────────────────────────────────────────────── ghost queens
  async function caseGhosts() {
    section('disconnect cleanup — no ghost queens');
    const CODE = 'HTGHOST001';
    wipe(CODE);
    const a = net(CODE, 'host', 'Jurek', 'amber', 'banded');
    const b = net(CODE, 'join', 'Ryszard', 'clover', 'dusted');
    await a.ready;
    await b.ready;
    await until(() => a.peers.size === 1, 4000);

    // A closed tab: onDisconnect fires exactly what the driver registered.
    b.driver.flushDisconnect();
    check('a closed tab leaves no ghost queen', await until(() => a.peers.size === 0, 4000), `peers=${a.peers.size}`);
    b.dispose();
    await sleep(200);

    // A hard crash where nothing fired: the stale heartbeat must be reaped.
    const ghostUid = 'ghostuid00000000';
    await a.driver.set(`${NET.root}/${CODE}/presence/${ghostUid}`, { name: 'Ghost', at: a.world.now() - 60000 });
    check('a stale entry is visible before the reaper runs', await until(() => a.peers.has(ghostUid), 3000));
    // Reaping runs on the heartbeat interval now, so that it still happens when the
    // frame loop is stopped. Keep ticking so this client counts as simulating.
    const reapUntil = now() + (NET.rates.heartbeatSec * 2 + 1) * 1000;
    while (now() < reapUntil && a.peers.has(ghostUid)) { await sleep(50); a.update(0.05); }
    check('a stale heartbeat is reaped', !a.peers.has(ghostUid), `peers=${a.peers.size}`);
    // The local queen must survive its own reaper, and a client that resumes ticking
    // after a quiet spell must be able to take the vacant world lease back.
    const settle = now() + 3000;
    while (now() < settle && !a.authority.isMine()) { await sleep(50); a.update(0.05); }
    check('the reaper never eats the local queen',
      a.roster().some((p) => p.self) && a.authority.isMine(),
      `roster=${a.roster().length} owner=${a.authority.owner()}`);

    await shutdown(a);
  }

  // ─────────────────────────────────────────────────────── offline progression
  async function caseOffline() {
    section('offline progression — 25 %, capped at eight hours');
    const CODE = 'HTOFFLINE1';
    wipe(CODE);
    const seed = net(CODE, 'host', 'Jurek', 'amber', 'banded');
    await seed.ready;
    await sleep(150);

    const rate = NET.bank.defaultRate;
    const before = seed.bank.snapshot();
    check('a brand-new hollow grants nothing on the first join',
      before.pollen === 0 && before.nectar === 0, JSON.stringify({ pollen: before.pollen, nectar: before.nectar }));

    const twentyHoursAgo = seed.world.now() - 20 * 3600 * 1000;
    await seed.driver.transact(`${NET.root}/${CODE}/bank`, (current) => {
      const base = current || {};
      base.lastActive = twentyHoursAgo;
      return base;
    });
    await sleep(200);

    const returning = net(CODE, 'join', 'Ryszard', 'clover', 'dusted');
    await returning.ready;
    await until(() => returning.bank.snapshot().pollen > 0, 5000);
    const after = returning.bank.snapshot();
    const report = returning.offlineReport;
    const expectedPollen = rate.pollen * NET.bank.offlineRate * NET.bank.capHours;

    check('twenty hours away credits exactly eight hours at 25 %',
      Math.abs(after.pollen - expectedPollen) < 1e-6 && report && report.capped,
      `pollen ${after.pollen} (expected ${expectedPollen}), credited ${(report ? report.seconds / 3600 : 0).toFixed(2)} h of ${(report ? report.rawSeconds / 3600 : 0).toFixed(2)} h away`);
    check('every resource accrues at its own rate',
      Math.abs(after.nectar - rate.nectar * 0.25 * 8) < 1e-6 && Math.abs(after.resin - rate.resin * 0.25 * 8) < 1e-6,
      `nectar ${after.nectar}, resin ${after.resin}`);

    // A third queen arriving right behind must not be paid twice for the same absence.
    const tagalong = net(CODE, 'join', 'Marta', 'thistle', 'crowned');
    await tagalong.ready;
    await sleep(400);
    check('the same absence is never credited twice',
      Math.abs(tagalong.bank.snapshot().pollen - expectedPollen) < 1e-6,
      `pollen still ${tagalong.bank.snapshot().pollen}`);

    await shutdown(seed, returning, tagalong);
  }

  return [
    { name: 'presence', fn: casePresence, budget: 30000 },
    { name: 'motion', fn: caseMotion, budget: 45000 },
    { name: 'bank', fn: caseBank, budget: 45000 },
    { name: 'authority', fn: caseAuthority, budget: 60000 },
    { name: 'frozen-owner', fn: caseFrozenOwner, budget: 90000 },
    { name: 'ghosts', fn: caseGhosts, budget: 30000 },
    { name: 'offline', fn: caseOffline, budget: 30000 },
  ];
}
