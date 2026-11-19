// Keyboard and mouse, kept deliberately small: a set of held codes, a set of codes that
// went down this frame, and mouse motion accumulated between frames.

const BLOCK_DEFAULT = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
]);

export class Input {
  constructor(canvas, doc = document) {
    this.canvas = canvas;
    this.doc = doc;
    this.held = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, down: false, clicked: false, wheel: 0 };
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;
    this.onPauseRequest = null;
    this.onFire = null;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Escape') {
        if (this.onPauseRequest) this.onPauseRequest();
      }
    };
    this._onKeyUp = (e) => {
      this.held.delete(e.code);
    };
    this._onBlur = () => {
      this.held.clear();
      this.mouse.down = false;
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
        if (this.onFire) this.onFire();
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.down = false;
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onWheel = (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
    };
    this._onLockChange = () => {
      this.locked = this.doc.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.mouse.down = false;
        this.mouse.dx = 0;
        this.mouse.dy = 0;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    this._onContext = (e) => e.preventDefault();

    doc.addEventListener('keydown', this._onKeyDown);
    doc.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    doc.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('wheel', this._onWheel, { passive: true });
    doc.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('contextmenu', this._onContext);
  }

  isDown(code) {
    return this.held.has(code);
  }

  axis(neg, pos) {
    return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);
  }

  take(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  requestLock() {
    if (this.doc.pointerLockElement === this.canvas) return;
    const p = this.canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  releaseLock() {
    if (this.doc.pointerLockElement === this.canvas) this.doc.exitPointerLock?.();
  }

  consumeLook() {
    const out = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
    this.mouse.wheel = 0;
  }

  dispose() {
    const doc = this.doc;
    doc.removeEventListener('keydown', this._onKeyDown);
    doc.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    doc.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('wheel', this._onWheel);
    doc.removeEventListener('pointerlockchange', this._onLockChange);
    this.canvas.removeEventListener('contextmenu', this._onContext);
  }
}
