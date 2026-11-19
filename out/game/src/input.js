// Keyboard and mouse state. The game polls this each frame; nothing here
// touches the DOM beyond installing listeners once.

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { dx: 0, dy: 0, left: false, right: false };

  window.addEventListener('keydown', (e) => {
    const c = e.code;
    if (!down.has(c)) pressed.add(c);
    down.add(c);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); mouse.left = false; mouse.right = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      mouse.dx += e.movementX;
      mouse.dy += e.movementY;
    }
  });

  return {
    isDown: (code) => down.has(code),
    // true only on the frame the key first went down
    justPressed: (code) => pressed.has(code),
    mouse,
    lock: () => canvas.requestPointerLock && canvas.requestPointerLock(),
    locked: () => document.pointerLockElement === canvas,
    consume() {
      pressed.clear();
      mouse.dx = 0;
      mouse.dy = 0;
    },
  };
}
