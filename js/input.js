// Keyboard + floating touch joystick.
// useQ: rune key presses (E / Shift / Q); actQ: action key presses (Space / J / Enter)
export const input = { useQ: 0, actQ: 0, enabled: false, dm: false, mouseDown: false, btnFire: false, mx: 0, my: 0, mouseT: -1e9 };
// fire trigger is held (automatic weapons in deathmatch)
export function fireHeld() { return input.enabled && (keys.has('Space') || keys.has('KeyJ') || input.mouseDown || input.btnFire); }
export const joy = { active: false, id: null, ox: 0, oy: 0, kx: 0, ky: 0 };
const keys = new Set();
const JR = 56;

export function initInput(canvas, onFirst) {
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    onFirst();
    keys.add(e.code);
    if (!e.repeat && input.enabled) {
      if (['KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight'].includes(e.code)) input.useQ++;
      if (['Space', 'KeyJ', 'Enter'].includes(e.code)) input.actQ++;
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); joy.active = false; input.mouseDown = false; input.btnFire = false; });

  canvas.addEventListener('pointerdown', e => {
    onFirst();
    if (e.pointerType === 'mouse' && input.dm && input.enabled) {
      if (e.button === 0) { input.mouseDown = true; input.mx = e.clientX; input.my = e.clientY; input.mouseT = performance.now(); }
      if (e.button === 2) input.useQ++;
      e.preventDefault();
      return;
    }
    if (!input.enabled || joy.active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    joy.active = true; joy.id = e.pointerId;
    joy.ox = joy.kx = e.clientX; joy.oy = joy.ky = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse') input.mouseDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { input.mx = e.clientX; input.my = e.clientY; input.mouseT = performance.now(); }
    if (!joy.active || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy);
    if (l > JR) { joy.ox += dx * (1 - JR / l); joy.oy += dy * (1 - JR / l); dx = e.clientX - joy.ox; dy = e.clientY - joy.oy; }
    joy.kx = e.clientX; joy.ky = e.clientY;
    e.preventDefault();
  });
  const end = e => { if (e.pointerId === joy.id) { joy.active = false; joy.id = null; } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

export function readMove() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
  if (joy.active) {
    let dx = (joy.kx - joy.ox) / JR, dy = (joy.ky - joy.oy) / JR;
    const l = Math.hypot(dx, dy);
    if (l < 0.18) return { x: 0, y: 0 };
    const m = Math.min(1, (l - 0.1) / 0.6);
    return { x: dx / l * m, y: dy / l * m };
  }
  return { x: 0, y: 0 };
}
