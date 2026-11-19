// Keyboard + mouse input. Keeps a set of held keys, exposes edge-triggered
// "pressed" queries, and tracks a normalized mouse position for aiming.

const KEY_ALIASES = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'fire',
  KeyE: 'enter',
  KeyF: 'enter',
  KeyR: 'reset',
  KeyM: 'map',
};

export class Input {
  constructor(target = globalThis) {
    this.held = new Set();
    this.pressedThisFrame = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.enabled = true;

    target.addEventListener('keydown', (e) => {
      const action = KEY_ALIASES[e.code];
      if (!action) return;
      if (action === 'fire' || action === 'up' || action === 'down') e.preventDefault();
      if (this.enabled && !this.held.has(action)) this.pressedThisFrame.add(action);
      this.held.add(action);
    });
    target.addEventListener('keyup', (e) => {
      const action = KEY_ALIASES[e.code];
      if (action) this.held.delete(action);
    });
    target.addEventListener('blur', () => {
      this.held.clear();
      this.mouse.down = false;
    });

    const canvasHost = globalThis.document;
    if (canvasHost) {
      canvasHost.addEventListener('mousemove', (e) => {
        this.mouse.x = (e.clientX / canvasHost.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / canvasHost.innerHeight) * 2 + 1;
      });
      canvasHost.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.mouse.down = true;
          this.mouse.clicked = true;
        }
      });
      canvasHost.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.down = false;
      });
    }
  }

  is(action) {
    return this.enabled && this.held.has(action);
  }

  pressed(action) {
    return this.enabled && this.pressedThisFrame.has(action);
  }

  axis() {
    let x = 0;
    let z = 0;
    if (this.is('left')) x -= 1;
    if (this.is('right')) x += 1;
    if (this.is('up')) z -= 1;
    if (this.is('down')) z += 1;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }

  endFrame() {
    this.pressedThisFrame.clear();
    this.mouse.clicked = false;
  }
}
