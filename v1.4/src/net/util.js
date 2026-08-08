// Hollowtree — net plumbing shared by both drivers: path maths, cloning, wire packing and byte accounting.

import { NET } from '../config.net.js';

const UID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function randomString(length, alphabet) {
  const chars = alphabet || UID_ALPHABET;
  const n = Math.max(1, length | 0);
  let out = '';
  const buf = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(n))
    : null;
  for (let i = 0; i < n; i++) {
    const value = buf ? buf[i] : Math.floor(Math.random() * 256);
    out += chars[value % chars.length];
  }
  return out;
}

export function makeUid() {
  return randomString(NET.identityLength);
}

// This project has no Firebase Auth (anonymous sign-in would need billing), so the
// client identity is a random id minted once and kept in localStorage. It is stable
// across visits and orders deterministically, which is all the authority rule needs.
export function localIdentity() {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(NET.identityKey);
      if (typeof existing === 'string' && existing.length >= 8) return existing;
      const fresh = makeUid();
      localStorage.setItem(NET.identityKey, fresh);
      return fresh;
    }
  } catch (error) {
    // private mode — fall through to a per-tab identity
  }
  return makeUid();
}

// The hive code is the only access control, so it is generated long and from an
// alphabet with no look-alike glyphs. Codes shorter than the rules' minimum are
// deterministically extended so a legacy short code still lands on a legal path.
export function normalizeHiveCode(code) {
  const raw = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length >= NET.codeMinLength) return raw;
  if (!raw.length) return randomString(NET.codeLength, NET.codeAlphabet);
  let out = raw;
  let salt = 0;
  for (let i = 0; i < raw.length; i++) salt = (salt * 31 + raw.charCodeAt(i)) >>> 0;
  while (out.length < NET.codeMinLength) {
    out += NET.codeAlphabet[salt % NET.codeAlphabet.length];
    salt = Math.floor(salt / NET.codeAlphabet.length) + 7;
  }
  return out;
}

export function makeHiveCode() {
  return randomString(NET.codeLength, NET.codeAlphabet);
}

export function splitPath(path) {
  if (!path) return [];
  return String(path).split('/').filter((part) => part.length > 0);
}

export function joinPath(...parts) {
  return parts
    .map((p) => String(p == null ? '' : p))
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

export function getPath(tree, path) {
  const parts = splitPath(path);
  let node = tree;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return null;
    node = node[part];
  }
  return node === undefined ? null : node;
}

export function setPath(tree, path, value) {
  const parts = splitPath(path);
  if (!parts.length) return value;
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (node[part] == null || typeof node[part] !== 'object') node[part] = {};
    node = node[part];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
  return tree;
}

export function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const key of Object.keys(value)) out[key] = clone(value[key]);
  return out;
}

// True when `path` is the same node as `other`, an ancestor of it, or a descendant.
export function pathsOverlap(path, other) {
  if (path === other) return true;
  const a = splitPath(path);
  const b = splitPath(other);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function byteLength(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value == null ? null : value);
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

export function createStats() {
  return {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    transactionRetries: 0,
    startedAt: 0,
  };
}

const P = NET.precision;

function q(value, scale) {
  return Math.round((Number.isFinite(value) ? value : 0) * scale);
}

// One leaf string per queen. Fields, in order:
//   seq, tRel(ms since session epoch), px, py, pz, qx, qy, qz, vx, vy, vz, carry
// The quaternion's w is dropped and rebuilt: q and -q are the same rotation, so the
// sender flips to w >= 0 and the receiver takes the positive root.
export function packMotion(seq, tRel, position, quaternion, velocity, carrying) {
  let qx = quaternion.x || 0;
  let qy = quaternion.y || 0;
  let qz = quaternion.z || 0;
  const qw = typeof quaternion.w === 'number' ? quaternion.w : 1;
  if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; }
  const v = velocity || { x: 0, y: 0, z: 0 };
  return [
    seq | 0,
    Math.round(tRel),
    q(position.x, P.position), q(position.y, P.position), q(position.z, P.position),
    q(qx, P.quaternion), q(qy, P.quaternion), q(qz, P.quaternion),
    q(v.x, P.velocity), q(v.y, P.velocity), q(v.z, P.velocity),
    q(carrying, P.carry),
  ].join(',');
}

export function unpackMotion(text) {
  if (typeof text !== 'string' || !text.length) return null;
  const f = text.split(',');
  if (f.length < 12) return null;
  const n = f.map(Number);
  for (let i = 0; i < 12; i++) if (!Number.isFinite(n[i])) return null;
  const qx = n[5] / P.quaternion;
  const qy = n[6] / P.quaternion;
  const qz = n[7] / P.quaternion;
  const sq = qx * qx + qy * qy + qz * qz;
  const qw = Math.sqrt(Math.max(0, 1 - sq));
  return {
    seq: n[0],
    tRel: n[1],
    position: { x: n[2] / P.position, y: n[3] / P.position, z: n[4] / P.position },
    quaternion: { x: qx, y: qy, z: qz, w: qw },
    velocity: { x: n[8] / P.velocity, y: n[9] / P.velocity, z: n[10] / P.velocity },
    carrying: n[11] / P.carry,
  };
}

export function sanitizeSwarm(swarm) {
  if (!swarm || typeof swarm !== 'object') return {};
  const out = {};
  for (const key of Object.keys(swarm)) {
    const value = Math.max(0, Math.round(Number(swarm[key]) || 0));
    if (value > 0) out[key] = value;
  }
  return out;
}

export function sameSwarm(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  for (const key of ka) if (a[key] !== b[key]) return false;
  return true;
}
