// Hollowtree — audio asset loading: fetch + decode every manifest entry once, warn once per missing file, never throw.

import { AUDIO } from '../config.audio.js';

export function createLibrary(ctx) {
  const buffers = new Map();
  const pending = new Map();
  const failed = new Set();

  function resolve(file) {
    const base = AUDIO.basePath;
    return base.endsWith('/') ? base + file : base + '/' + file;
  }

  function decode(data) {
    return new Promise((ok, fail) => {
      const result = ctx.decodeAudioData(data, ok, fail);
      if (result && typeof result.then === 'function') result.then(ok, fail);
    });
  }

  function load(id) {
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (pending.has(id)) return pending.get(id);
    const entry = AUDIO.manifest[id];
    if (!entry) {
      if (!failed.has(id)) {
        failed.add(id);
        console.warn(`[audio] no manifest entry for "${id}"`);
      }
      return Promise.resolve(null);
    }
    const task = fetch(resolve(entry.file))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => decode(data))
      .then((buffer) => {
        buffers.set(id, buffer);
        return buffer;
      })
      .catch((error) => {
        if (!failed.has(id)) {
          failed.add(id);
          console.warn(`[audio] "${entry.file}" unavailable — ${error && error.message}`);
        }
        buffers.set(id, null);
        return null;
      });
    pending.set(id, task);
    return task;
  }

  function loadAll(coreOnly) {
    const ids = Object.keys(AUDIO.manifest).filter(
      (id) => !coreOnly || AUDIO.manifest[id].core
    );
    return Promise.all(ids.map(load)).then(() => undefined);
  }

  function get(id) {
    return buffers.has(id) ? buffers.get(id) : null;
  }

  function loopPoints(buffer) {
    const trim = Math.min(AUDIO.loopTrim, buffer.duration * 0.02);
    return { start: trim, end: Math.max(trim + 0.05, buffer.duration - trim) };
  }

  return { load, loadAll, get, loopPoints, buffers, failed };
}
