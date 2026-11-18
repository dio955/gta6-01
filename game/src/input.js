// Solmar Heat — keyboard + mouse input. Keys are read as a held set; pressed()
// is edge-triggered and CONSUMED on read, so one press fires exactly one
// action even when the fixed-step sim runs several steps per frame.
export function createInput(canvas) {
  const held = new Set();
  const pressedSet = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let locked = false;
  let lockFailed = false;
  let wasLocked = false;
  let onLockLost = null;

  function keyName(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!held.has(e.code)) pressedSet.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
  });
  document.addEventListener('mousemove', (e) => {
    if (locked) {
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && wasLocked && onLockLost) onLockLost();
    wasLocked = locked;
  });
  document.addEventListener('pointerlockerror', () => {
    lockFailed = true;
  });

  return {
    get locked() { return locked; },
    get lockFailed() { return lockFailed; },
    setOnLockLost(cb) { onLockLost = cb; },
    isDown(code) { return held.has(code); },
    // Edge-triggered, consumed on read: returns true once per physical press.
    pressed(code) {
      if (pressedSet.has(code)) { pressedSet.delete(code); return true; }
      return false;
    },
    // Mouse deltas since the last read, consumed on read.
    mouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },
    requestLock() {
      if (!locked && !lockFailed) {
        try { canvas.requestPointerLock(); } catch { lockFailed = true; }
      }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Movement axes from WASD / arrows, camera-relative when driving.
    axes() {
      let x = 0; let z = 0;
      if (held.has('KeyW') || held.has('ArrowUp')) z += 1;
      if (held.has('KeyS') || held.has('ArrowDown')) z -= 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      return { x, z };
    },
  };
}
