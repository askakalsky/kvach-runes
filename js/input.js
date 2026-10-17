// Keyboard + configurable touch stick (floating / fixed / d-pad), mirrored layouts.
// useQ: rune key presses (E / Shift / Q); actQ: action key presses (Space / J / Enter)
// fireQ: every fire press (Space / J / Enter, left mouse, fire button) so a very short tap is never lost
export const input = { useQ: 0, actQ: 0, fireQ: 0, enabled: false, dm: false, mouseDown: false, btnFire: false, mx: 0, my: 0, mouseT: -1e9 };
const keys = new Set();
// fire trigger is held (automatic weapons in deathmatch)
export function fireHeld() { return input.enabled && (keys.has('Space') || keys.has('KeyJ') || input.mouseDown || input.btnFire); }

// ---------- player-tunable controls ----------
export const CTL_DEFAULTS = {
  hand: 'left',    // side of the STICK; action buttons go to the other side
  type: 'float',   // float | fixed | dpad
  size: 56,        // stick radius, px
  reach: 55,       // % of the radius that already means full speed
  dead: 10,        // dead zone, % of the radius
  opacity: 70,     // stick opacity, %
  zone: 55,        // width of the touch zone for the floating stick, % of the screen
  btn: 100,        // action button scale, %
  btnop: 100,      // action button opacity, %
  fx: 14,          // fixed stick: distance from its screen edge, % of width
  fy: 24,          // fixed stick: distance from the bottom, % of height
};
export const ctl = Object.assign({}, CTL_DEFAULTS);
try { Object.assign(ctl, JSON.parse(localStorage.getItem('kvach-ctl')) || {}); } catch (e) { }
export function saveCtl() { try { localStorage.setItem('kvach-ctl', JSON.stringify(ctl)); } catch (e) { } }
export function resetCtl() { Object.assign(ctl, CTL_DEFAULTS); saveCtl(); applyCtl(); }
// push settings into the page: layout side and button size / opacity
export function applyCtl() {
  document.body.dataset.jh = ctl.hand;
  const hud = document.getElementById('hud');
  if (hud) { hud.style.setProperty('--bs', ctl.btn / 100); hud.style.setProperty('--bo', ctl.btnop / 100); }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const newStick = () => ({ active: false, id: null, ox: 0, oy: 0, kx: 0, ky: 0 });
export const joy = newStick();

// where the fixed stick / d-pad sits inside a W x H area
export function stickBase(W, H) {
  const x = ctl.hand === 'right' ? W - W * ctl.fx / 100 : W * ctl.fx / 100;
  return { x: clamp(x, ctl.size, W - ctl.size), y: clamp(H - H * ctl.fy / 100, ctl.size, H - ctl.size * 0.5) };
}
// touch zone of the floating stick
export function stickZone(W) {
  const w = W * ctl.zone / 100;
  return ctl.hand === 'right' ? [W - w, W] : [0, w];
}

// start a stick at (x, y); false when the touch is outside what this stick listens to
export function stickBegin(st, x, y, W, H) {
  if (ctl.type === 'float') {
    const [z0, z1] = stickZone(W);
    if (x < z0 || x > z1) return false;
    st.ox = x; st.oy = y;
  } else {
    const b = stickBase(W, H);
    if (Math.hypot(x - b.x, y - b.y) > ctl.size * 1.9) return false;
    st.ox = b.x; st.oy = b.y;
  }
  st.kx = x; st.ky = y; st.active = true;
  return true;
}
export function stickMove(st, x, y, W, H) {
  st.kx = x; st.ky = y;
  if (ctl.type !== 'float') return;
  // the origin trails the finger, so you never have to drag far from where you started...
  const dx = x - st.ox, dy = y - st.oy, l = Math.hypot(dx, dy), R = ctl.size;
  if (l > R) { st.ox += dx * (1 - R / l); st.oy += dy * (1 - R / l); }
  // ...but it never leaves the thumb zone, so the finger can't creep to the middle of the screen
  const [z0, z1] = stickZone(W);
  st.ox = clamp(st.ox, z0 + R * 0.4, z1 - R * 0.4);
  st.oy = clamp(st.oy, R * 0.6, H - R * 0.4);
}
// normalised move vector in -1..1 with dead zone and full speed at `reach`
export function stickVector(st) {
  const R = ctl.size, dx = st.kx - st.ox, dy = st.ky - st.oy, l = Math.hypot(dx, dy);
  const dead = R * ctl.dead / 100;
  if (l <= dead || l < 1) return { x: 0, y: 0 };
  if (ctl.type === 'dpad') {
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: Math.round(Math.cos(a) * 1000) / 1000, y: Math.round(Math.sin(a) * 1000) / 1000 };
  }
  const full = Math.max(dead + 4, R * ctl.reach / 100);
  const m = clamp((l - dead) / (full - dead), 0, 1);
  return { x: dx / l * m, y: dy / l * m };
}

// draw a stick onto a 2D context; k = canvas pixels per css pixel
export function drawStick(g, st, k, W, H) {
  const R = ctl.size, a = ctl.opacity / 100;
  const fixedish = ctl.type !== 'float';
  if (!st.active && !fixedish) return;
  const b = stickBase(W, H);
  const ox = (st.active ? st.ox : b.x), oy = (st.active ? st.oy : b.y);
  let kx = st.active ? st.kx : ox, ky = st.active ? st.ky : oy;
  const dx = kx - ox, dy = ky - oy, l = Math.hypot(dx, dy) || 1;
  if (l > R) { kx = ox + dx / l * R; ky = oy + dy / l * R; }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = a * 0.5; g.fillStyle = '#000';
  g.beginPath(); g.arc(ox * k, oy * k, R * k, 0, Math.PI * 2); g.fill();
  g.globalAlpha = a; g.strokeStyle = '#e0b252'; g.lineWidth = 2 * k; g.stroke();
  if (ctl.type === 'dpad') {
    const v = st.active ? stickVector(st) : { x: 0, y: 0 };
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI / 4, on = (v.x || v.y) && Math.abs(Math.atan2(v.y, v.x) - ang) < 0.1;
      g.save(); g.translate(ox * k, oy * k); g.rotate(ang);
      g.fillStyle = on ? '#ffe9a8' : '#e0b252'; g.globalAlpha = a * (on ? 1 : i % 2 ? 0.4 : 0.7);
      const s = (i % 2 ? 0.16 : 0.24) * R * k;
      g.beginPath(); g.moveTo(R * 0.86 * k, 0); g.lineTo(R * 0.86 * k - s * 1.2, -s); g.lineTo(R * 0.86 * k - s * 1.2, s); g.closePath(); g.fill();
      g.restore();
    }
    g.globalAlpha = a * 0.9; g.fillStyle = '#e0b252';
    g.beginPath(); g.arc(ox * k, oy * k, R * 0.18 * k, 0, Math.PI * 2); g.fill();
  } else {
    g.globalAlpha = a; g.fillStyle = '#e0b252';
    g.beginPath(); g.arc(kx * k, ky * k, R * 0.43 * k, 0, Math.PI * 2); g.fill();
    if (fixedish && !st.active) { g.globalAlpha = a * 0.5; g.strokeStyle = '#e0b252'; g.lineWidth = 1 * k; g.beginPath(); g.arc(ox * k, oy * k, R * 0.43 * k, 0, Math.PI * 2); g.stroke(); }
  }
  g.restore();
}

export function initInput(canvas, onFirst) {
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    onFirst();
    keys.add(e.code);
    if (!e.repeat && input.enabled) {
      if (['KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight'].includes(e.code)) input.useQ++;
      if (['Space', 'KeyJ', 'Enter'].includes(e.code)) { input.actQ++; input.fireQ++; }
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); joy.active = false; input.mouseDown = false; input.btnFire = false; });

  canvas.addEventListener('pointerdown', e => {
    onFirst();
    if (e.pointerType === 'mouse' && input.dm && input.enabled) {
      if (e.button === 0) { input.fireQ++; input.mouseDown = true; input.mx = e.clientX; input.my = e.clientY; input.mouseT = performance.now(); }
      if (e.button === 2) input.useQ++;
      e.preventDefault();
      return;
    }
    if (!input.enabled || joy.active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!stickBegin(joy, e.clientX, e.clientY, innerWidth, innerHeight)) return;
    joy.id = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse') input.mouseDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { input.mx = e.clientX; input.my = e.clientY; input.mouseT = performance.now(); }
    if (!joy.active || e.pointerId !== joy.id) return;
    stickMove(joy, e.clientX, e.clientY, innerWidth, innerHeight);
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
  return joy.active ? stickVector(joy) : { x: 0, y: 0 };
}
