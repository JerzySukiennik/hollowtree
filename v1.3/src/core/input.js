// Hollowtree — keyboard, pointer-lock mouse look and gamepad folded into one input state.

import { INPUT } from '../config.js';

export const input = {
  sensitivity: INPUT.mouseSensitivity,
  forward: 0,
  strafe: 0,
  lift: 0,
  yaw: 0,
  pitch: 0,
  boost: false,
  gather: false,
  build: false,
  pointerLocked: false,
  update,
};

const keys = new Set();
const kb = { forward: 0, strafe: 0, lift: 0, boost: false, gather: false, build: false };

let targetYaw = 0;
let targetPitch = 0;
let element = null;

function axis(negative, positive) {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

function refreshKeyboard() {
  const up = keys.has('KeyW') || keys.has('ArrowUp');
  const down = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  const rise = keys.has('Space');
  const sink = keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight');

  kb.forward = axis(down, up);
  kb.strafe = axis(left, right);
  kb.lift = axis(sink, rise);
  kb.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  kb.gather = keys.has('KeyE');
  kb.build = keys.has('KeyB');

  input.forward = kb.forward;
  input.strafe = kb.strafe;
  input.lift = kb.lift;
  input.boost = kb.boost;
  input.gather = kb.gather;
  input.build = kb.build;
}

function deadzone(value) {
  const d = INPUT.gamepadDeadzone;
  if (Math.abs(value) < d) return 0;
  return (value - Math.sign(value) * d) / (1 - d);
}

function pollGamepad(dt) {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let pad = null;
  for (let i = 0; i < pads.length; i++) {
    if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
  }
  if (!pad) return;

  const moveX = deadzone(pad.axes[0] || 0);
  const moveY = deadzone(pad.axes[1] || 0);
  const lookX = deadzone(pad.axes[2] || 0);
  const lookY = deadzone(pad.axes[3] || 0);

  if (Math.abs(moveY) > Math.abs(input.forward)) input.forward = -moveY;
  if (Math.abs(moveX) > Math.abs(input.strafe)) input.strafe = moveX;

  targetYaw -= lookX * INPUT.gamepadLookSpeed * dt;
  targetPitch -= lookY * INPUT.gamepadLookSpeed * dt * (INPUT.invertY ? -1 : 1);

  const buttons = pad.buttons;
  const rise = buttons[0] && buttons[0].pressed ? 1 : 0;
  const sink = buttons[1] && buttons[1].pressed ? 1 : 0;
  if (rise || sink) input.lift = rise - sink;
  if (buttons[7] && buttons[7].pressed) input.boost = true;
  if (buttons[2] && buttons[2].pressed) input.gather = true;
  if (buttons[3] && buttons[3].pressed) input.build = true;
}

function update(dt) {
  refreshKeyboard();
  pollGamepad(dt || 0);

  targetPitch = Math.max(-INPUT.pitchClamp, Math.min(INPUT.pitchClamp, targetPitch));
  const k = 1 - Math.pow(1 - INPUT.lookSmoothing, Math.max(dt, 0) * 60);
  input.yaw += (targetYaw - input.yaw) * k;
  input.pitch += (targetPitch - input.pitch) * k;
}

function onMouseMove(event) {
  if (!input.pointerLocked) return;
  const dx = event.movementX || 0;
  const dy = event.movementY || 0;
  targetYaw -= dx * input.sensitivity;
  targetPitch -= dy * input.sensitivity * (INPUT.invertY ? -1 : 1);
  targetPitch = Math.max(-INPUT.pitchClamp, Math.min(INPUT.pitchClamp, targetPitch));
}

function onKeyDown(event) {
  if (event.repeat) return;
  keys.add(event.code);
  if (event.code === 'BracketLeft') input.sensitivity = Math.max(0.0002, input.sensitivity * 0.8);
  if (event.code === 'BracketRight') input.sensitivity = Math.min(0.02, input.sensitivity * 1.25);
  if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  refreshKeyboard();
}

function onKeyUp(event) {
  keys.delete(event.code);
  refreshKeyboard();
}

function clearKeys() {
  keys.clear();
  refreshKeyboard();
}

function onPointerLockChange() {
  input.pointerLocked = document.pointerLockElement === element;
  if (!input.pointerLocked) clearKeys();
}

export function initInput(domElement) {
  element = domElement;

  domElement.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (!input.pointerLocked && domElement.requestPointerLock) domElement.requestPointerLock();
  });
  domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', () => { input.pointerLocked = false; });
  document.addEventListener('mousemove', onMouseMove);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);

  refreshKeyboard();
  return input;
}
