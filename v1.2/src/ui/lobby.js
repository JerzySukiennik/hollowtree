// Hollowtree — multiplayer loading and lobby screen: honest connection stages, the session code, three queen slots and the handoff into the world.

import { LOBBY, QUEEN_STYLE, SCREENS } from '../config.js';
import { injectScreenStyles, el, queenCrest } from './screens.css.js';

function colorById(id) {
  return QUEEN_STYLE.colors.find((c) => c.id === id) || QUEEN_STYLE.colors[0];
}

function patternById(id) {
  return QUEEN_STYLE.patterns.find((p) => p.id === id) || QUEEN_STYLE.patterns[0];
}

function randomCode() {
  const alphabet = LOBBY.codeAlphabet;
  let out = '';
  for (let i = 0; i < LOBBY.codeLength; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function latency() {
  const { min, max } = LOBBY.fakeLatency;
  return (min + Math.random() * (max - min)) * 1000;
}

export function createLocalNet() {
  const presence = [];
  const statusListeners = [];
  const presenceListeners = [];
  const stageListeners = [];
  const timers = [];
  let self = null;
  let live = false;

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function emitPresence() {
    const snapshot = presence.map((p) => ({ ...p }));
    for (const fn of presenceListeners) fn(snapshot);
  }

  function emitStatus(state, message) {
    for (const fn of statusListeners) fn({ state, message: message || '' });
  }

  function emitStage(id, state) {
    for (const fn of stageListeners) fn({ id, state });
  }

  function runStages(onDone) {
    let index = 0;
    const step = () => {
      if (index >= LOBBY.stages.length) {
        onDone();
        return;
      }
      const stage = LOBBY.stages[index];
      emitStage(stage.id, 'doing');
      later(() => {
        emitStage(stage.id, 'done');
        index++;
        step();
      }, stage.duration * 1000 * (0.7 + Math.random() * 0.6));
    };
    step();
  }

  function seatPeers() {
    for (const peer of LOBBY.fakePeers) {
      later(() => {
        if (!live || presence.length >= LOBBY.maxPlayers) return;
        const seat = {
          id: `peer-${peer.name.toLowerCase()}`,
          name: peer.name,
          color: peer.color,
          pattern: peer.pattern,
          ready: false,
          host: false,
          self: false,
        };
        presence.push(seat);
        emitPresence();
        later(() => {
          seat.ready = true;
          emitPresence();
        }, peer.readyDelay * 1000);
      }, peer.joinDelay * 1000);
    }
  }

  function open(profile, host, code) {
    emitStatus('connecting');
    return new Promise((resolve, reject) => {
      runStages(() => {
        if (!host && code === LOBBY.failCode) {
          emitStatus('offline', LOBBY.copy.failNoSession);
          reject(new Error(LOBBY.copy.failNoSession));
          return;
        }
        self = {
          id: 'self',
          name: profile.name || QUEEN_STYLE.defaultName,
          color: profile.color,
          pattern: profile.pattern,
          ready: false,
          host,
          self: true,
        };
        presence.length = 0;
        presence.push(self);
        live = true;
        emitStatus('live');
        emitPresence();
        seatPeers();
        resolve({ code: host ? randomCode() : code, selfId: self.id, host });
      });
    });
  }

  return {
    createSession(profile) {
      return open(profile, true, null);
    },
    joinSession(code, profile) {
      return open(profile, false, code);
    },
    onPresence(fn) {
      presenceListeners.push(fn);
      if (presence.length) fn(presence.map((p) => ({ ...p })));
      return () => {
        const i = presenceListeners.indexOf(fn);
        if (i !== -1) presenceListeners.splice(i, 1);
      };
    },
    onStatus(fn) {
      statusListeners.push(fn);
      return () => {
        const i = statusListeners.indexOf(fn);
        if (i !== -1) statusListeners.splice(i, 1);
      };
    },
    onStage(fn) {
      stageListeners.push(fn);
      return () => {
        const i = stageListeners.indexOf(fn);
        if (i !== -1) stageListeners.splice(i, 1);
      };
    },
    setReady(flag) {
      if (!self) return;
      later(() => {
        self.ready = Boolean(flag);
        emitPresence();
      }, latency());
    },
    leave() {
      live = false;
      for (const id of timers) clearTimeout(id);
      timers.length = 0;
      presence.length = 0;
      statusListeners.length = 0;
      presenceListeners.length = 0;
      stageListeners.length = 0;
    },
  };
}

async function resolveNet(provided) {
  if (provided) return provided;
  try {
    const module = await import('../net/session.js');
    if (typeof module.createNet === 'function') return module.createNet();
  } catch (error) {
    if (window.hollowtree) window.hollowtree.netStub = true;
  }
  return createLocalNet();
}

export function createLobby(options) {
  const config = options || {};
  const mode = config.mode === 'join' ? 'join' : 'host';
  const profile = config.profile || {
    name: QUEEN_STYLE.defaultName,
    color: QUEEN_STYLE.defaultColor,
    pattern: QUEEN_STYLE.defaultPattern,
  };
  injectScreenStyles();

  const root = el('div', 'ht-screen ht-lobby-screen', document.body);
  el('div', 'ht-veil', root);
  el('div', 'ht-vignette', root);
  el('div', 'ht-grain', root);

  const wrap = el('div', 'ht-lobby', root);
  const card = el('div', 'ht-card', wrap);

  const head = el('div', 'ht-card-head', card);
  const headLeft = el('div', null, head);
  el('div', 'ht-card-title', headLeft, mode === 'host' ? LOBBY.copy.hostingTitle : LOBBY.copy.joiningTitle);
  el('div', 'ht-card-sub', headLeft, LOBBY.copy.shareNote);

  const codeBox = el('div', 'ht-code-box', head);
  el('div', 'ht-label', codeBox, LOBBY.copy.codeLabel);
  const codeRow = el('div', 'ht-code-row', codeBox);
  const codeValue = el('div', 'ht-code-value is-pending', codeRow, '·····');
  const copyButton = el('button', 'ht-copy', codeRow, LOBBY.copy.copyAction);
  copyButton.type = 'button';
  copyButton.disabled = true;

  const stagesBox = el('div', 'ht-stages', card);
  const stageNodes = [];
  for (const stage of LOBBY.stages) {
    const node = el('div', 'ht-stage', stagesBox);
    el('i', 'ht-stage-mark', node);
    el('span', null, node, stage.label);
    const track = el('div', 'ht-stage-track', node);
    const fill = el('i', 'ht-stage-fill', track);
    stageNodes.push({ id: stage.id, node, fill });
  }

  const slots = el('div', 'ht-slots', card);
  slots.style.display = 'none';
  const slotNodes = [];
  for (let i = 0; i < LOBBY.maxPlayers; i++) {
    const node = el('div', 'ht-slot is-empty', slots);
    slotNodes.push({ node, key: null });
  }

  const failBox = el('div', 'ht-fail', card);
  failBox.style.display = 'none';

  const foot = el('div', 'ht-card-foot', card);
  const status = el('div', 'ht-status is-connecting', foot);
  el('i', null, status);
  const statusText = el('span', null, status, LOBBY.copy.statusConnecting);
  const actions = el('div', 'ht-btn-row', foot);
  const leaveButton = el('button', 'ht-btn is-ghost', actions, LOBBY.copy.leaveAction);
  leaveButton.type = 'button';
  const readyButton = el('button', 'ht-btn is-ghost', actions, LOBBY.copy.readyAction);
  readyButton.type = 'button';
  readyButton.disabled = true;
  const enterButton = el('button', 'ht-btn', actions, LOBBY.copy.enterAction);
  enterButton.type = 'button';
  enterButton.disabled = true;

  const hint = el('div', 'ht-foot-note', card, LOBBY.copy.hint);

  let net = null;
  let sessionCode = '';
  let players = [];
  let selfReady = false;
  let connected = false;
  let entered = false;
  let copyTimer = 0;
  let unsubs = [];

  function setStatus(state, message) {
    status.classList.remove('is-connecting', 'is-live', 'is-fail');
    if (state === 'live') {
      status.classList.add('is-live');
      statusText.textContent = LOBBY.copy.statusLive;
    } else if (state === 'retrying') {
      status.classList.add('is-connecting');
      statusText.textContent = LOBBY.copy.statusRetrying;
    } else if (state === 'offline') {
      status.classList.add('is-fail');
      statusText.textContent = LOBBY.copy.statusOffline;
    } else {
      status.classList.add('is-connecting');
      statusText.textContent = LOBBY.copy.statusConnecting;
    }
    if (message) showFailure(message);
  }

  function showFailure(message) {
    stagesBox.style.display = 'none';
    failBox.style.display = 'block';
    failBox.textContent = message;
    readyButton.disabled = true;
    enterButton.disabled = true;
    enterButton.textContent = LOBBY.copy.retryAction;
    enterButton.disabled = false;
    enterButton.onclick = () => connect();
    leaveButton.textContent = LOBBY.copy.offlineAction;
    leaveButton.onclick = () => finish('solo');
  }

  function paintStage(id, state) {
    for (const stage of stageNodes) {
      if (stage.id !== id) continue;
      stage.node.classList.remove('is-doing', 'is-done');
      stage.node.classList.add(state === 'done' ? 'is-done' : 'is-doing');
      stage.fill.style.width = state === 'done' ? '100%' : '55%';
    }
  }

  function paintSlots() {
    for (let i = 0; i < slotNodes.length; i++) {
      const slot = slotNodes[i];
      const player = players[i];
      const key = player
        ? `${player.id}:${player.ready}:${player.name}:${player.color}:${player.pattern}`
        : `empty:${players.length}`;
      if (key === slot.key) continue;
      const isNew = Boolean(player) && typeof slot.key === 'string' && slot.key.indexOf('empty') === 0;
      slot.key = key;
      slot.node.textContent = '';
      slot.node.className = 'ht-slot';
      if (!player) {
        slot.node.classList.add('is-empty');
        el('div', 'ht-slot-empty-mark', slot.node);
        el('div', 'ht-slot-tag', slot.node, players.length > 1 ? LOBBY.copy.empty : LOBBY.copy.emptySolo);
        continue;
      }
      slot.node.classList.add('is-filled');
      if (player.self) slot.node.classList.add('is-you');
      if (player.ready) slot.node.classList.add('is-ready');
      if (isNew) {
        slot.node.classList.add('just-joined');
        setTimeout(() => slot.node.classList.remove('just-joined'), 600);
      }
      slot.node.appendChild(queenCrest(colorById(player.color), patternById(player.pattern), 46));
      el('div', 'ht-slot-name', slot.node, player.name);
      const tags = [];
      if (player.self) tags.push(LOBBY.copy.you);
      if (player.host) tags.push(LOBBY.copy.host);
      el('div', 'ht-slot-tag', slot.node, tags.join(' · '));
      const state = el('div', 'ht-slot-state', slot.node);
      el('i', null, state);
      el('span', null, state, player.ready ? LOBBY.copy.ready : LOBBY.copy.notReady);
    }
  }

  function paintActions() {
    if (!connected) return;
    readyButton.disabled = false;
    readyButton.textContent = selfReady ? LOBBY.copy.unreadyAction : LOBBY.copy.readyAction;
    readyButton.classList.toggle('is-set', selfReady);
    enterButton.disabled = !selfReady;
    const others = players.filter((p) => !p.self);
    const waiting = others.length > 0 && others.some((p) => !p.ready);
    hint.textContent = waiting ? LOBBY.copy.waitingOthers : LOBBY.copy.hint;
    enterButton.textContent = others.length ? LOBBY.copy.enterAction : LOBBY.copy.enterSoloAction;
  }

  function setCode(code) {
    sessionCode = code;
    codeValue.textContent = code;
    codeValue.classList.remove('is-pending');
    copyButton.disabled = false;
  }

  async function copyCode() {
    if (!sessionCode) return;
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sessionCode);
        ok = true;
      }
    } catch (error) {
      ok = false;
    }
    copyButton.textContent = ok ? LOBBY.copy.copiedAction : LOBBY.copy.copyFailed;
    copyButton.classList.toggle('is-done', ok);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyButton.textContent = LOBBY.copy.copyAction;
      copyButton.classList.remove('is-done');
    }, 1800);
  }

  copyButton.addEventListener('click', copyCode);
  readyButton.addEventListener('click', () => {
    if (!connected || !net) return;
    selfReady = !selfReady;
    net.setReady(selfReady);
    paintActions();
  });
  enterButton.addEventListener('click', () => {
    if (enterButton.disabled) return;
    finish(mode);
  });
  leaveButton.addEventListener('click', () => finish('cancel'));

  function clearSubs() {
    for (const off of unsubs) {
      if (typeof off === 'function') off();
    }
    unsubs = [];
  }

  async function connect() {
    clearSubs();
    connected = false;
    selfReady = false;
    players = [];
    failBox.style.display = 'none';
    stagesBox.style.display = 'flex';
    slots.style.display = 'none';
    enterButton.textContent = LOBBY.copy.enterAction;
    enterButton.onclick = null;
    leaveButton.textContent = LOBBY.copy.leaveAction;
    leaveButton.onclick = null;
    readyButton.disabled = true;
    enterButton.disabled = true;
    for (const stage of stageNodes) {
      stage.node.classList.remove('is-doing', 'is-done');
      stage.fill.style.width = '0%';
    }
    setStatus('connecting');

    if (net && typeof net.leave === 'function') net.leave();
    net = await resolveNet(config.net);
    unsubs.push(net.onStatus(({ state, message }) => setStatus(state, message)));
    if (typeof net.onStage === 'function') {
      unsubs.push(net.onStage(({ id, state }) => paintStage(id, state)));
    }
    unsubs.push(net.onPresence((list) => {
      players = list;
      const me = list.find((p) => p.self);
      if (me) selfReady = Boolean(me.ready);
      paintSlots();
      paintActions();
    }));

    try {
      const session = mode === 'host'
        ? await net.createSession(profile)
        : await net.joinSession(config.code, profile);
      setCode(session.code);
      connected = true;
      stagesBox.style.display = 'none';
      slots.style.display = 'grid';
      paintSlots();
      paintActions();
    } catch (error) {
      const message = (error && error.message) || LOBBY.copy.failGeneric;
      setStatus('offline', message);
    }
  }

  function show() {
    root.classList.remove('is-gone');
    requestAnimationFrame(() => root.classList.add('is-on'));
    connect();
  }

  function hide() {
    root.classList.remove('is-on');
    root.classList.add('is-gone');
    return new Promise((resolve) => setTimeout(resolve, SCREENS.fadeOut * 1000));
  }

  async function finish(result) {
    if (entered) return;
    entered = true;
    await hide();
    clearSubs();
    if (result === 'cancel' || result === 'solo') {
      if (net && typeof net.leave === 'function') net.leave();
      if (typeof config.onCancel === 'function') config.onCancel(result);
      dispose();
      return;
    }
    if (typeof config.onEnter === 'function') {
      config.onEnter({ mode, code: sessionCode, profile, net, players: players.map((p) => ({ ...p })) });
    }
    dispose();
  }

  function dispose() {
    clearTimeout(copyTimer);
    clearSubs();
    root.remove();
  }

  return { root, show, hide, dispose, get code() { return sessionCode; } };
}
