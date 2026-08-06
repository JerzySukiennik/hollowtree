// Hollowtree — headless end-to-end check of the net layer over the local driver. Run: node work/net-node.test.mjs

import { createNet } from '../src/net/index.js';
import { NET } from '../src/config.net.js';
import { createSuite } from './net-cases.mjs';

let passed = 0;
let failed = 0;
const lines = [];

const log = (text) => lines.push(text);
function check(name, ok, detail) {
  if (ok) { passed++; log(`PASS  ${name}${detail ? `  (${detail})` : ''}`); }
  else { failed++; log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); }
  return ok;
}
const section = (title) => { log(''); log(`— ${title}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cases = createSuite({
  createNet,
  NET,
  log,
  check,
  section,
  sleep,
  now: () => Date.now(),
  // Each process starts with an empty in-memory store, so there is nothing to wipe.
  wipe: () => {},
});

// No case may stall the run: each races a timeout that reports FAIL and moves on.
async function runCase(entry) {
  let timer = 0;
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve('__timeout__'), entry.budget); });
  try {
    const result = await Promise.race([entry.fn().then(() => '__done__'), guard]);
    if (result === '__timeout__') {
      failed++;
      log(`FAIL  ${entry.name} timed out after ${(entry.budget / 1000).toFixed(0)} s — the rest of this case did not run`);
    }
  } catch (error) {
    failed++;
    log(`FAIL  ${entry.name} threw — ${error && error.stack ? error.stack : error}`);
  } finally {
    clearTimeout(timer);
  }
}

const started = Date.now();
log(`INFO  driver forced to local · ${NET.rates.motionHz} Hz publish · interpolation delay ${NET.interpolation.baseDelayMs} ms base, ${NET.interpolation.minDelayMs}–${NET.interpolation.maxDelayMs} ms adaptive`);
for (const entry of cases) await runCase(entry);
log('');
log(`${passed} passed, ${failed} failed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
log(failed ? 'RESULT FAIL' : 'RESULT PASS');
console.log(lines.join('\n'));
process.exit(failed ? 1 : 0);
