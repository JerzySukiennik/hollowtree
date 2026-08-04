// Hollowtree — manifest-driven GLTF/texture loading with cache, progress and missing-file tolerance.

import { TextureLoader, SRGBColorSpace, RepeatWrapping } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MANIFEST = {
  models: {
    queen: 'assets/models/queen.glb',
  },
  textures: {},
};

const gltfLoader = new GLTFLoader();
const textureLoader = new TextureLoader();
const cache = new Map();

function baseUrl() {
  return new URL('../../', import.meta.url).href;
}

function resolve(path) {
  return new URL(path, baseUrl()).href;
}

async function fetchGltf(name, path) {
  const url = resolve(path);
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.warn(`[assets] network error for "${name}" (${path})`, error.message);
    return null;
  }
  if (!response.ok) {
    console.warn(`[assets] missing model "${name}" (${path}) — continuing without it`);
    return null;
  }
  const buffer = await response.arrayBuffer();
  const folder = url.slice(0, url.lastIndexOf('/') + 1);
  try {
    return await new Promise((res, rej) => gltfLoader.parse(buffer, folder, res, rej));
  } catch (error) {
    console.warn(`[assets] failed to parse "${name}" (${path})`, error && error.message);
    return null;
  }
}

function fetchTexture(name, path) {
  return new Promise((res) => {
    textureLoader.load(
      resolve(path),
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.anisotropy = 4;
        res(texture);
      },
      undefined,
      () => {
        console.warn(`[assets] missing texture "${name}" (${path}) — continuing without it`);
        res(null);
      }
    );
  });
}

export async function loadAssets(onProgress) {
  const modelEntries = Object.entries(MANIFEST.models);
  const textureEntries = Object.entries(MANIFEST.textures);
  const total = modelEntries.length + textureEntries.length;

  const gltfs = {};
  const models = {};
  const textures = {};
  const missing = [];

  let done = 0;
  const report = () => { if (onProgress) onProgress(total ? done / total : 1); };
  report();

  for (const [name, path] of modelEntries) {
    const key = `model:${name}`;
    const gltf = cache.has(key) ? cache.get(key) : await fetchGltf(name, path);
    cache.set(key, gltf);
    gltfs[name] = gltf;
    models[name] = gltf ? gltf.scene : null;
    if (!gltf) missing.push(path);
    done++;
    report();
  }

  for (const [name, path] of textureEntries) {
    const key = `texture:${name}`;
    const texture = cache.has(key) ? cache.get(key) : await fetchTexture(name, path);
    cache.set(key, texture);
    textures[name] = texture;
    if (!texture) missing.push(path);
    done++;
    report();
  }

  return {
    models,
    gltfs,
    textures,
    missing,
    has: (name) => Boolean(models[name] || textures[name]),
    get: (name) => models[name] || null,
    gltf: (name) => gltfs[name] || null,
    clone: (name) => (models[name] ? models[name].clone(true) : null),
    animations: (name) => (gltfs[name] ? gltfs[name].animations : []),
    texture: (name) => textures[name] || null,
  };
}
