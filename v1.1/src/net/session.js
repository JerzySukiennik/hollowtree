// Hollowtree — lobby adapter: the shape src/ui/lobby.js expects, backed by the real session so the lobby's slots, codes and ready flags are live, not simulated.

import { LOBBY } from '../config.js';
import { NET } from '../config.net.js';
import { createNet as createGameNet } from './index.js';
import { makeHiveCode, normalizeHiveCode } from './util.js';

export function createNet() {
  const statusListeners = [];
  const presenceListeners = [];
  const stageListeners = [];
  let game = null;
  let offPresence = null;
  let left = false;

  function emitStatus(state, message) {
    for (const fn of statusListeners.slice()) fn({ state, message: message || '' });
  }

  function emitStage(id, state) {
    for (const fn of stageListeners.slice()) fn({ id, state });
  }

  function emitPresence(list) {
    for (const fn of presenceListeners.slice()) fn(list.map((p) => ({ ...p })));
  }

  function stageId(index) {
    const stage = LOBBY.stages[index];
    return stage ? stage.id : `stage-${index}`;
  }

  async function open(mode, code, profile) {
    emitStatus('connecting');
    emitStage(stageId(0), 'doing');

    // The hive code is the only access control on this database — there is no auth —
    // so a hosted session always gets a full-length random code, never the five
    // characters the lobby's placeholder art suggests.
    const session = {
      mode,
      code: mode === 'host' ? makeHiveCode() : normalizeHiveCode(code),
      profile,
    };

    game = createGameNet(session);
    emitStage(stageId(0), 'done');
    emitStage(stageId(1), 'doing');

    let info;
    try {
      info = await game.ready;
    } catch (error) {
      emitStatus('offline', LOBBY.copy.failNetwork);
      throw new Error(LOBBY.copy.failNetwork);
    }
    emitStage(stageId(1), 'done');
    emitStage(stageId(2), 'doing');

    const roster = game.roster();
    if (mode === 'join') {
      // A hollow only exists once somebody has written its epoch and stayed. If we are
      // the only presence and we did not create the session, the code is dead.
      const others = roster.filter((p) => !p.self);
      if (!others.length && game.hostUid === info.uid) {
        game.dispose();
        game = null;
        emitStatus('offline', LOBBY.copy.failNoSession);
        throw new Error(LOBBY.copy.failNoSession);
      }
      if (roster.length > NET.maxPlayers) {
        game.dispose();
        game = null;
        emitStatus('offline', LOBBY.copy.failFull);
        throw new Error(LOBBY.copy.failFull);
      }
    }

    emitStage(stageId(2), 'done');
    emitStage(stageId(3), 'doing');
    offPresence = game.onPresence(emitPresence);
    emitStage(stageId(3), 'done');
    emitStatus('live');
    emitPresence(game.roster());

    return { code: game.code, selfId: info.uid, host: game.hostUid === info.uid };
  }

  return {
    get game() { return game; },
    createSession(profile) { return open('host', null, profile); },
    joinSession(code, profile) { return open('join', code, profile); },
    onPresence(fn) {
      presenceListeners.push(fn);
      if (game) fn(game.roster());
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
      if (game) game.setPresence({ r: Boolean(flag) });
    },
    leave() {
      if (left) return;
      left = true;
      if (offPresence) offPresence();
      offPresence = null;
      if (game) game.dispose();
      game = null;
      statusListeners.length = 0;
      presenceListeners.length = 0;
      stageListeners.length = 0;
    },
    // Called by main.js when the lobby hands off: keeps the live session, drops only
    // the lobby's own listeners.
    detach() {
      const handle = game;
      if (offPresence) offPresence();
      offPresence = null;
      left = true;
      game = null;
      statusListeners.length = 0;
      presenceListeners.length = 0;
      stageListeners.length = 0;
      return handle;
    },
  };
}
