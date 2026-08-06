// Hollowtree — main menu over the live meadow: play routes, the queen's colour and marking, and the options that own input, audio and render quality.

import { MENU, QUEEN_STYLE, SETTINGS, SCREENS, LOBBY } from '../config.js';
import { input } from '../core/input.js';
import { injectScreenStyles, el, queenCrest } from './screens.css.js';

const STORE = SETTINGS.storageKey;

function readStore() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch (error) {
    return;
  }
}

function colorById(id) {
  return QUEEN_STYLE.colors.find((c) => c.id === id) || QUEEN_STYLE.colors[0];
}

function patternById(id) {
  return QUEEN_STYLE.patterns.find((p) => p.id === id) || QUEEN_STYLE.patterns[0];
}

function toSlider(sensitivity) {
  const lo = Math.log(SETTINGS.sensitivityMin);
  const hi = Math.log(SETTINGS.sensitivityMax);
  const v = Math.log(Math.min(SETTINGS.sensitivityMax, Math.max(SETTINGS.sensitivityMin, sensitivity)));
  return (v - lo) / (hi - lo);
}

function fromSlider(t) {
  const lo = Math.log(SETTINGS.sensitivityMin);
  const hi = Math.log(SETTINGS.sensitivityMax);
  return Math.exp(lo + (hi - lo) * Math.min(1, Math.max(0, t)));
}

function paintRange(node) {
  node.style.setProperty('--p', `${(Number(node.value) * 100).toFixed(1)}%`);
}

function field(parent, labelText, noteText) {
  const wrap = el('div', 'ht-field', parent);
  const head = el('div', 'ht-field-head', wrap);
  el('div', 'ht-label', head, labelText);
  const value = el('div', 'ht-field-value', head);
  const body = el('div', null, wrap);
  if (noteText) el('div', 'ht-note', wrap, noteText);
  return { wrap, value, body };
}

function slider(parent, labelText, noteText, initial, format, onInput) {
  const f = field(parent, labelText, noteText);
  const range = el('input', 'ht-range', f.body);
  range.type = 'range';
  range.min = '0';
  range.max = '1';
  range.step = '0.001';
  range.value = String(initial);
  paintRange(range);
  f.value.textContent = format(initial);
  range.addEventListener('input', () => {
    const t = Number(range.value);
    paintRange(range);
    f.value.textContent = format(t);
    onInput(t);
  });
  return {
    range,
    set(t) {
      if (Math.abs(Number(range.value) - t) < 0.0005) return;
      range.value = String(t);
      paintRange(range);
      f.value.textContent = format(t);
    },
  };
}

export function createMenu(options) {
  const config = options || {};
  injectScreenStyles();

  const stored = readStore();
  const settings = {
    master: typeof stored.master === 'number' ? stored.master : SETTINGS.defaults.master,
    music: typeof stored.music === 'number' ? stored.music : SETTINGS.defaults.music,
    sfx: typeof stored.sfx === 'number' ? stored.sfx : SETTINGS.defaults.sfx,
    quality: stored.quality || SETTINGS.defaults.quality,
  };
  const profile = {
    name: stored.name || QUEEN_STYLE.defaultName,
    color: stored.color || QUEEN_STYLE.defaultColor,
    pattern: stored.pattern || QUEEN_STYLE.defaultPattern,
  };
  if (typeof stored.sensitivity === 'number') input.sensitivity = stored.sensitivity;

  function persist() {
    writeStore({
      name: profile.name,
      color: profile.color,
      pattern: profile.pattern,
      sensitivity: input.sensitivity,
      master: settings.master,
      music: settings.music,
      sfx: settings.sfx,
      quality: settings.quality,
    });
    if (typeof config.onSettings === 'function') config.onSettings(settings, profile);
  }

  const root = el('div', 'ht-screen ht-menu-screen', document.body);
  el('div', 'ht-veil', root);
  el('div', 'ht-vignette', root);
  el('div', 'ht-grain', root);

  const layout = el('div', 'ht-menu', root);
  const col = el('div', 'ht-menu-col', layout);

  const brand = el('div', 'ht-brand', col);
  el('div', 'ht-eyebrow', brand, MENU.copy.eyebrow);
  el('h1', 'ht-title', brand, MENU.copy.title);
  el('div', 'ht-title-rule', brand);
  el('div', 'ht-tagline', brand, MENU.copy.tagline);

  const nav = el('nav', 'ht-nav', col);
  const panels = el('div', 'ht-panels', layout);

  const foot = el('div', 'ht-foot', root);
  el('div', null, foot, MENU.copy.footer);

  let openPanel = null;
  const items = [];

  function setPanel(next) {
    if (openPanel && openPanel !== next) openPanel.classList.remove('is-on');
    openPanel = openPanel === next ? null : next;
    for (const item of items) item.button.classList.toggle('is-active', Boolean(openPanel) && item.panel === openPanel);
    if (openPanel) {
      openPanel.classList.add('is-on');
      const focusable = openPanel.querySelector('input,button');
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }

  function navItem(label, note, panel, action) {
    const button = el('button', 'ht-nav-item', nav);
    button.type = 'button';
    el('span', 'ht-nav-text', button, label);
    if (note) el('span', 'ht-nav-note', button, note);
    button.style.transitionDelay = `${(items.length * SCREENS.itemStagger).toFixed(3)}s`;
    button.addEventListener('click', () => {
      if (panel) setPanel(panel);
      else if (action) action();
    });
    items.push({ button, panel });
    return button;
  }

  function panel(titleText) {
    const node = el('div', 'ht-panel', panels);
    const head = el('div', 'ht-panel-head', node);
    el('div', 'ht-panel-title', head, titleText);
    const back = el('button', 'ht-btn is-ghost', head);
    back.type = 'button';
    back.textContent = MENU.copy.back;
    back.style.padding = '7px 13px';
    back.addEventListener('click', () => setPanel(node));
    const body = el('div', 'ht-panel-body', node);
    return { node, body };
  }

  const joinPanel = panel(MENU.copy.join);
  el('div', 'ht-note', joinPanel.body, MENU.copy.joinNote);
  const codeInput = el('input', 'ht-input ht-code', joinPanel.body);
  codeInput.type = 'text';
  codeInput.maxLength = LOBBY.codeLength;
  codeInput.placeholder = MENU.copy.joinPlaceholder;
  codeInput.autocomplete = 'off';
  codeInput.spellcheck = false;
  const codeError = el('div', 'ht-note', joinPanel.body, '');
  codeError.style.color = SCREENS.colors.fail;
  codeError.style.opacity = '0';
  const joinRow = el('div', 'ht-btn-row', joinPanel.body);
  const joinButton = el('button', 'ht-btn', joinRow);
  joinButton.type = 'button';
  joinButton.textContent = MENU.copy.joinAction;

  const codePattern = new RegExp(`^[${LOBBY.codeAlphabet}]{${LOBBY.codeLength}}$`);
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LOBBY.codeLength);
    codeInput.classList.remove('is-bad');
    codeError.style.opacity = '0';
  });
  codeInput.addEventListener('keydown', (event) => {
    if (event.code === 'Enter') joinButton.click();
  });
  joinButton.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!codePattern.test(code)) {
      codeInput.classList.add('is-bad');
      codeError.textContent = MENU.copy.joinBadCode;
      codeError.style.opacity = '1';
      codeInput.focus();
      return;
    }
    launch('join', code);
  });

  const queenPanel = panel(MENU.copy.queen);
  const crestRow = el('div', 'ht-crest', queenPanel.body);
  const crestHost = el('div', null, crestRow);
  const crestMeta = el('div', 'ht-crest-meta', crestRow);
  const crestName = el('div', 'ht-crest-name', crestMeta, profile.name);
  const crestStyle = el('div', 'ht-label', crestMeta, '');

  function paintCrest() {
    const color = colorById(profile.color);
    const pattern = patternById(profile.pattern);
    crestHost.textContent = '';
    crestHost.appendChild(queenCrest(color, pattern, 68));
    crestName.textContent = profile.name || QUEEN_STYLE.defaultName;
    crestStyle.textContent = `${color.name} · ${pattern.name}`;
  }

  const nameField = field(queenPanel.body, MENU.copy.queenName);
  const nameInput = el('input', 'ht-input', nameField.body);
  nameInput.type = 'text';
  nameInput.maxLength = QUEEN_STYLE.nameMaxLength;
  nameInput.placeholder = MENU.copy.queenNamePlaceholder;
  nameInput.value = profile.name;
  nameInput.addEventListener('input', () => {
    profile.name = nameInput.value.slice(0, QUEEN_STYLE.nameMaxLength);
    paintCrest();
    persist();
  });

  const colorField = field(queenPanel.body, MENU.copy.queenColor);
  const swatches = el('div', 'ht-swatches', colorField.body);
  const swatchNodes = [];
  for (const color of QUEEN_STYLE.colors) {
    const button = el('button', 'ht-swatch', swatches);
    button.type = 'button';
    button.title = color.name;
    button.style.background = `linear-gradient(160deg,${color.hex},${color.trim})`;
    button.addEventListener('click', () => {
      profile.color = color.id;
      paintSwatches();
      paintCrest();
      persist();
    });
    swatchNodes.push({ button, color });
  }
  function paintSwatches() {
    for (const s of swatchNodes) s.button.classList.toggle('is-on', s.color.id === profile.color);
  }

  const patternField = field(queenPanel.body, MENU.copy.queenPattern);
  const chips = el('div', 'ht-chips', patternField.body);
  const chipNodes = [];
  for (const pattern of QUEEN_STYLE.patterns) {
    const chip = el('button', 'ht-chip', chips);
    chip.type = 'button';
    chip.textContent = pattern.name;
    chip.addEventListener('click', () => {
      profile.pattern = pattern.id;
      paintChips();
      paintCrest();
      persist();
    });
    chipNodes.push({ chip, pattern });
  }
  function paintChips() {
    for (const c of chipNodes) c.chip.classList.toggle('is-on', c.pattern.id === profile.pattern);
  }

  const optionsPanel = panel(MENU.copy.options);
  const sensSlider = slider(
    optionsPanel.body,
    MENU.copy.optionSensitivity,
    MENU.copy.optionSensitivityNote,
    toSlider(input.sensitivity),
    (t) => (fromSlider(t) * 1000).toFixed(2),
    (t) => {
      input.sensitivity = fromSlider(t);
      persist();
    }
  );
  const masterSlider = slider(
    optionsPanel.body,
    MENU.copy.optionMaster,
    null,
    settings.master,
    (t) => `${Math.round(t * 100)}%`,
    (t) => {
      settings.master = t;
      persist();
    }
  );
  const musicSlider = slider(
    optionsPanel.body,
    MENU.copy.optionMusic,
    null,
    settings.music,
    (t) => `${Math.round(t * 100)}%`,
    (t) => {
      settings.music = t;
      persist();
    }
  );
  const sfxSlider = slider(
    optionsPanel.body,
    MENU.copy.optionSfx,
    null,
    settings.sfx,
    (t) => `${Math.round(t * 100)}%`,
    (t) => {
      settings.sfx = t;
      persist();
    }
  );
  const qualityField = field(optionsPanel.body, MENU.copy.optionQuality, MENU.copy.optionQualityNote);
  const qualityChips = el('div', 'ht-chips', qualityField.body);
  const qualityNodes = [];
  for (const tier of SETTINGS.qualityTiers) {
    const chip = el('button', 'ht-chip', qualityChips);
    chip.type = 'button';
    chip.textContent = tier.name;
    chip.addEventListener('click', () => {
      settings.quality = tier.id;
      paintQuality();
      persist();
    });
    qualityNodes.push({ chip, tier });
  }
  function paintQuality() {
    for (const q of qualityNodes) q.chip.classList.toggle('is-on', q.tier.id === settings.quality);
    qualityField.value.textContent = (SETTINGS.qualityTiers.find((t) => t.id === settings.quality) || {}).name || '';
  }

  navItem(MENU.copy.solo, MENU.copy.soloNote, null, () => launch('solo', null));
  navItem(MENU.copy.host, MENU.copy.hostNote, null, () => launch('host', null));
  navItem(MENU.copy.join, null, joinPanel.node);
  navItem(MENU.copy.queen, null, queenPanel.node);
  navItem(MENU.copy.options, null, optionsPanel.node);

  paintCrest();
  paintSwatches();
  paintChips();
  paintQuality();
  sensSlider.set(toSlider(input.sensitivity));

  let visible = false;
  let closed = false;
  let raf = 0;
  let lastSensitivity = input.sensitivity;

  function tick() {
    if (!visible) return;
    if (input.sensitivity !== lastSensitivity) {
      lastSensitivity = input.sensitivity;
      sensSlider.set(toSlider(input.sensitivity));
    }
    raf = requestAnimationFrame(tick);
  }

  function onKey(event) {
    if (!visible) return;
    if (event.code === 'Escape' && openPanel) {
      event.preventDefault();
      setPanel(openPanel);
    }
  }
  window.addEventListener('keydown', onKey);

  function show() {
    if (closed) return;
    if (!document.body.contains(root)) document.body.appendChild(root);
    root.classList.remove('is-gone');
    visible = true;
    requestAnimationFrame(() => root.classList.add('is-on'));
    lastSensitivity = input.sensitivity;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function hide() {
    visible = false;
    cancelAnimationFrame(raf);
    root.classList.remove('is-on');
    root.classList.add('is-gone');
    return new Promise((resolve) => setTimeout(resolve, SCREENS.fadeOut * 1000));
  }

  async function launch(mode, code) {
    if (!visible) return;
    persist();
    await hide();
    if (typeof config.onLaunch === 'function') {
      config.onLaunch({ mode, code, profile: { ...profile }, settings: { ...settings } });
    }
  }

  return {
    root,
    show,
    hide,
    get settings() {
      return settings;
    },
    get profile() {
      return profile;
    },
    dispose() {
      closed = true;
      visible = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
