// Keyboard and pointer, read twice a frame: held keys become a movement vector, the mouse becomes a
// yaw the camera and the character share, and one-shot presses are queued as flags so a tap between
// two frames is never lost and never counted twice. Pointer lock is taken on the first click.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_USE = 8;
export const ACTION_MUTE = 16;
export const ACTION_WEAPON_1 = 32;
export const ACTION_WEAPON_2 = 64;
export const ACTION_RELOAD = 128;
export const ACTION_QUIT = 256;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const JUMP = new Set(['Space', 'ArrowUp']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let firing = false;
  let aim = false;
  let locked = false;
  let sensitivity = 0.0026;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Tab') return;
    if (!held.has(event.code) && !event.repeat) {
      if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
      else if (event.code === 'KeyF') actions |= ACTION_ENTER;
      else if (event.code === 'KeyE') actions |= ACTION_USE;
      else if (event.code === 'KeyP') actions |= ACTION_PAUSE;
      else if (event.code === 'KeyM') actions |= ACTION_MUTE;
      else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
      else if (event.code === 'Digit1') actions |= ACTION_WEAPON_1;
      else if (event.code === 'Digit2') actions |= ACTION_WEAPON_2;
      else if (event.code === 'Escape') actions |= ACTION_QUIT;
    }
    held.add(event.code);
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || JUMP.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    firing = false;
    aim = false;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (!locked) {
      canvas.requestPointerLock?.();
      actions |= ACTION_CONFIRM;
      return;
    }
    if (event.button === 0) firing = true;
    if (event.button === 2) aim = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
    if (event.button === 2) aim = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      firing = false;
      aim = false;
    }
  });
  window.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX;
    mouseDY += event.movementY;
  });

  return {
    get locked() {
      return locked;
    },
    lock() {
      if (locked) return;
      const request = canvas.requestPointerLock?.();
      if (request && request.catch) request.catch(() => {});
    },
    unlock() {
      if (locked) document.exitPointerLock?.();
    },
    setSensitivity(value) {
      sensitivity = value;
    },
    /** -1..1 forward and right, in the camera's frame. */
    move() {
      return {
        forward: (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0),
        right: (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0),
      };
    },
    run() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    jump() {
      return held.has('Space');
    },
    get firing() {
      return firing;
    },
    get aiming() {
      return aim;
    },
    /** Mouse movement since the last call, in radians. */
    takeLook() {
      const yaw = mouseDX * sensitivity;
      const pitch = mouseDY * sensitivity;
      mouseDX = 0;
      mouseDY = 0;
      return { yaw, pitch };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Feed the scripted shots: the screenshot scenes drive the same state the mouse would. */
    press(code) {
      if (code === 0) firing = true;
      else actions |= code;
    },
    /** Hold a key down, as if the player were pressing it. */
    hold(code, on = true) {
      if (on) held.add(code);
      else held.delete(code);
    },
    release() {
      firing = false;
      aim = false;
    },
  };
}
