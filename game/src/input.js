// Keyboard and pointer input. Held keys give a steering vector; the mouse gives an aim
// point in field coordinates and a firing state; one-shot presses (start, pause, upgrade
// choices) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_UPGRADE_1 = 4;
export const ACTION_UPGRADE_2 = 8;
export const ACTION_UPGRADE_3 = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter', 'KeyR']);
const PAUSE = new Set(['KeyP', 'Escape']);
const UPGRADE_KEYS = { Digit1: ACTION_UPGRADE_1, Digit2: ACTION_UPGRADE_2, Digit3: ACTION_UPGRADE_3, Numpad1: ACTION_UPGRADE_1, Numpad2: ACTION_UPGRADE_2, Numpad3: ACTION_UPGRADE_3 };

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false };
  const mouse = { x: FIELD.width / 2, y: FIELD.height / 2, down: false };
  let actions = 0;
  let click = null;

  /** The field point under a client point, undoing the renderer's letterbox scale. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (UPGRADE_KEYS[event.code] !== undefined) {
      if (!event.repeat) actions |= UPGRADE_KEYS[event.code];
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = toField(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = toField(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.down = true;
    click = point;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    /** Steering vector, -1..1 on each axis, normalised so diagonals are not faster. */
    move() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** The mouse aim point, in field coordinates. */
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    /** Whether the fire button is held. */
    firing() {
      return mouse.down;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The field point of the last click, once: the next call finds none. */
    clickPoint() {
      const taken = click;
      click = null;
      return taken;
    },
  };
}
