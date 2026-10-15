// Pixel-art renderer: prerendered map layers, pawns, runes, particles, lighting.
import { TS, MW, MH, T, rng } from './map.js';
import { RUNES, GLYPHS } from './sim.js';

const OL = '#1d1712';
function P(g, c, x, y, w = 1, h = 1) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function disc(g, c, cx, cy, r) {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}
const shadeCache = {};
export function shade(hex, amt) {
  const key = hex + amt;
  if (shadeCache[key]) return shadeCache[key];
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return (shadeCache[key] = `rgb(${r},${g},${b})`);
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function buildLayers(map, seed) {
  const W = MW * TS, H = MH * TS;
  const ground = mk(W, H), over = mk(W, H), mini = mk(MW, MH);
  const g = ground.getContext('2d'), o = over.getContext('2d'), mm = mini.getContext('2d');
  const r = rng(seed * 7 + 3), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? T.WALL : map.g[y * MW + x];

  const grass = (px, py) => {
    P(g, '#5b6b32', px, py, TS, TS);
    for (let i = 0; i < 14; i++) P(g, r() < 0.5 ? '#52612d' : '#66783a', px + ri(0, 15), py + ri(0, 15));
    if (r() < 0.4) { const x = ri(1, 12), y = ri(4, 14); P(g, '#748a42', px + x, py + y - 2, 1, 2); P(g, '#748a42', px + x + 2, py + y - 3, 1, 3); P(g, '#748a42', px + x + 1, py + y - 1, 1, 1); }
    if (r() < 0.07) P(g, ['#d9c84a', '#d07a9a', '#e8e8e8', '#8fb4e0'][ri(0, 3)], px + ri(2, 13), py + ri(2, 13));
  };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), px = x * TS, py = y * TS;
    switch (t) {
      case T.GRASS: case T.BUSH: case T.TREE: case T.PORTAL: grass(px, py); break;
      case T.DIRT:
        P(g, '#7a6040', px, py, TS, TS);
        for (let i = 0; i < 12; i++) P(g, r() < 0.5 ? '#6d5538' : '#87704d', px + ri(0, 15), py + ri(0, 15));
        if (r() < 0.5) P(g, '#9a907f', px + ri(1, 13), py + ri(1, 14), 2, 1);
        break;
      case T.FLOOR:
        P(g, '#7d5f3c', px, py, TS, TS);
        for (let k = 0; k < 4; k++) {
          P(g, '#634a2d', px, py + k * 4 + 3, TS, 1);
          P(g, '#634a2d', px + ((k * 5 + y * 3 + x * 7) % 16), py + k * 4, 1, 3);
          P(g, '#8a6b45', px + ri(0, 15), py + k * 4 + ri(0, 2));
        }
        break;
      case T.WALL: {
        P(g, '#7b7670', px, py, TS, TS);
        for (let row = 0; row < 3; row++) {
          P(g, '#57534e', px, py + row * 5 + 4, TS, 1);
          const off = row % 2 ? 0 : 4;
          P(g, '#57534e', px + off, py + row * 5, 1, 4); P(g, '#57534e', px + off + 8, py + row * 5, 1, 4);
        }
        for (let i = 0; i < 6; i++) P(g, r() < 0.5 ? '#6c6762' : '#8a857e', px + ri(0, 15), py + ri(0, 15));
        if (at(x, y - 1) !== T.WALL) P(g, '#a39e96', px, py, TS, 2);
        if (at(x, y + 1) !== T.WALL) { P(g, '#55514c', px, py + 12, TS, 4); P(g, '#45423e', px, py + 15, TS, 1); }
        if (at(x - 1, y) !== T.WALL) P(g, '#615d58', px, py, 1, TS);
        if (at(x + 1, y) !== T.WALL) P(g, '#615d58', px + 15, py, 1, TS);
        break;
      }
      case T.WATER:
        P(g, '#2f5f7c', px, py, TS, TS);
        for (let i = 0; i < 6; i++) P(g, '#3a6f8e', px + ri(0, 13), py + ri(0, 15), 3, 1);
        if (at(x, y - 1) !== T.WATER) P(g, '#24485f', px, py, TS, 3);
        if (at(x - 1, y) !== T.WATER) P(g, '#28516b', px, py, 1, TS);
        if (at(x + 1, y) !== T.WATER) P(g, '#28516b', px + 15, py, 1, TS);
        break;
      case T.ICE:
        P(g, '#a9d3e3', px, py, TS, TS);
        { const off = ri(0, 15); for (let i = 0; i < 6; i++) P(g, '#d8f0f8', px + ((i + off) % 16), py + ((i * 2 + off) % 16), 2, 1); }
        for (let i = 0; i < 4; i++) P(g, '#86b6c9', px + ri(0, 15), py + ri(0, 15));
        break;
    }
    if (t === T.TREE) { P(g, 'rgba(0,0,0,.22)', px + 2, py + 11, 13, 4); P(g, '#4a3420', px + 7, py + 8, 3, 7); P(g, '#5e4329', px + 7, py + 8, 1, 7); }
    if (t === T.PORTAL) { disc(g, '#3a3540', px + 8, py + 8, 7); disc(g, '#5a5468', px + 8, py + 8, 6); disc(g, '#1c1424', px + 8, py + 8, 4); }
  }
  // drop shadows below walls
  for (let y = 0; y < MH - 1; y++) for (let x = 0; x < MW; x++)
    if (at(x, y) === T.WALL && at(x, y + 1) !== T.WALL) P(g, 'rgba(0,0,0,.25)', x * TS, (y + 1) * TS, TS, 3);

  // overlay: canopies and bushes drawn above pawns
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), cx = x * TS + 8;
    if (t === T.TREE) {
      const autumn = r() < 0.15, pine = r() < 0.35;
      const col = autumn ? '#8a6a2a' : pine ? '#2f5228' : '#3b5a26', li = autumn ? '#ab8838' : pine ? '#3f6a34' : '#4f7432';
      const cy = y * TS + 3;
      if (pine) {
        for (let i = 0; i < 14; i++) { const w = 1 + Math.floor((i % 5) * 1.6 + i * 0.35); P(o, OL, cx - w - 1, cy - 8 + i, w * 2 + 3, 1); P(o, i % 5 < 2 ? li : col, cx - w, cy - 8 + i, w * 2 + 1, 1); }
      } else {
        disc(o, '#22331a', cx, cy, 8); disc(o, col, cx, cy, 7);
        disc(o, li, cx - 2, cy - 2, 3); disc(o, li, cx + 3, cy + 1, 2);
        for (let i = 0; i < 5; i++) P(o, shade(col, -0.3), cx + ri(-5, 5), cy + ri(-4, 5));
      }
    } else if (t === T.BUSH) {
      const cy = y * TS + 9;
      disc(o, '#26401c', cx, cy, 7); disc(o, '#3f6a2c', cx, cy, 6);
      disc(o, '#558a3a', cx - 2, cy - 2, 2); P(o, '#558a3a', cx + 2, cy + 1, 2, 1);
      if (r() < 0.25) for (let i = 0; i < 3; i++) P(o, '#c0392b', cx + ri(-4, 4), cy + ri(-3, 3));
    }
  }
  const MC = { [T.GRASS]: '#5b6b32', [T.DIRT]: '#7a6040', [T.WALL]: '#9a958e', [T.WATER]: '#2f5f7c', [T.BUSH]: '#2f5022', [T.ICE]: '#a9d3e3', [T.TREE]: '#2b4220', [T.FLOOR]: '#7d5f3c', [T.PORTAL]: '#b07cff' };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) P(mm, MC[at(x, y)], x, y);
  return { ground, over, mini };
}

export function drawPawn(g, x, y, o, t) {
  x = Math.round(x); y = Math.round(y);
  const dir = Math.abs(o.fdx) > Math.abs(o.fdy) ? (o.fdx > 0 ? 3 : 2) : (o.fdy < 0 ? 1 : 0);
  const step = o.m ? Math.floor(t * 10 + (o.seed || 0)) % 2 : 0, bob = o.m && step ? 1 : 0;
  const skin = o.zombie ? '#8fb36a' : '#e8c39e', shirt = o.zombie ? '#5e7a3a' : o.color;
  P(g, 'rgba(0,0,0,.28)', x - 4, y - 1, 9, 2); P(g, 'rgba(0,0,0,.28)', x - 3, y - 2, 7, 1); P(g, 'rgba(0,0,0,.28)', x - 3, y + 1, 7, 1);
  P(g, OL, x - 4, y - 4, 4, step ? 3 : 4); P(g, OL, x + 1, y - 4, 4, step ? 4 : 3);
  P(g, '#3e3a48', x - 3, y - 4, 2, step ? 2 : 3); P(g, '#3e3a48', x + 2, y - 4, 2, step ? 3 : 2);
  const by = y - 10 - bob;
  P(g, OL, x - 4, by, 9, 7);
  P(g, shirt, x - 3, by + 1, 7, 5);
  P(g, shade(shirt, -0.25), x + 2, by + 1, 1, 5);
  P(g, shade(shirt, 0.25), x - 3, by + 1, 1, 3);
  P(g, OL, x - 5, by + 1 + step, 1, 3); P(g, OL, x + 5, by + 2 - step, 1, 3);
  P(g, skin, x - 5, by + 3 + step, 1, 1); P(g, skin, x + 5, by + 4 - step, 1, 1);
  const hy = by - 7, hc = o.hairCol || '#3b2a1a';
  P(g, OL, x - 2, hy, 5, 1); P(g, OL, x - 3, hy + 1, 7, 5); P(g, OL, x - 2, hy + 6, 5, 1);
  P(g, skin, x - 2, hy + 1, 5, 5);
  P(g, shade(skin, -0.12), x + 2, hy + 2, 1, 4);
  const hair = o.hair || 0;
  if (dir === 1) {
    if (hair !== 3) P(g, hc, x - 2, hy + 1, 5, 5); else P(g, shade(skin, -0.08), x - 2, hy + 1, 5, 5);
  } else {
    const eye = o.zombie ? '#e23b3b' : OL;
    if (dir === 0) { P(g, eye, x - 1, hy + 3); P(g, eye, x + 1, hy + 3); }
    else P(g, eye, dir === 2 ? x - 2 : x + 2, hy + 3);
    if (hair === 0) { P(g, hc, x - 2, hy + 1, 5, 1); P(g, hc, dir === 2 ? x + 1 : x - 2, hy + 2, dir === 0 ? 5 : 2, 1); }
    if (hair === 1) { P(g, hc, x - 2, hy + 1, 5, 2); if (dir !== 2) P(g, hc, x - 3, hy + 2, 1, 5); if (dir !== 3) P(g, hc, x + 3, hy + 2, 1, 5); }
    if (hair === 3) P(g, '#fff6', x - 1, hy + 1, 2, 1);
  }
  if (hair === 2) { P(g, OL, x - 1, hy - 3, 3, 4); P(g, hc, x, hy - 2, 1, 4); }
  if (hair === 1 && dir === 1) { P(g, hc, x - 3, hy + 2, 7, 4); }
}

function drawGlyph(g, k, x, y, col) {
  const gl = GLYPHS[k];
  g.fillStyle = col;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (gl[j][i] === '1') g.fillRect(x + i, y + j, 1, 1);
}
export function drawRuneIcon(c, k) {
  const g = c.getContext('2d');
  c.width = 11; c.height = 11;
  g.clearRect(0, 0, 11, 11);
  if (!k) return;
  P(g, OL, 0, 0, 11, 11); P(g, '#4b4a55', 1, 1, 9, 9); P(g, '#62606e', 1, 1, 9, 1);
  drawGlyph(g, k, 3, 3, RUNES[k].col);
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.dark = mk(10, 10);
    this.parts = []; this.texts = [];
    this.cam = { x: 0, y: 0 }; this.shake = 0; this.zoom = 3;
    this.layers = null;
  }
  setMap(map, seed) { this.map = map; this.layers = buildLayers(map, seed); this.parts = []; this.texts = []; this.camInit = false; }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.c.width = Math.floor(innerWidth * dpr); this.c.height = Math.floor(innerHeight * dpr);
    this.dark.width = this.c.width; this.dark.height = this.c.height;
    const mn = Math.min(this.c.width, this.c.height);
    this.zoom = Math.max(2, Math.round(mn / 250));
  }

  burst(x, y, col, n = 12, sp = 60, life = 0.6, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: life * (0.6 + Math.random() * 0.6), max: life, col, size, grav: 0 });
    }
  }
  ring(x, y, col, r = 50) { this.parts.push({ ring: true, x, y, r: 2, max: r, life: 0.45, col }); }
  text(x, y, txt, col = '#fff') { this.texts.push({ x, y, txt, col, life: 1.2 }); }

  worldToScreen(x, y) { return [(x - this.cam.x) * this.zoom, (y - this.cam.y) * this.zoom]; }

  draw(v, dt, t) {
    const g = this.g, z = this.zoom, W = this.c.width, H = this.c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#16181b'; g.fillRect(0, 0, W, H);
    if (!this.layers) return;
    const me = v.players.find(p => p.id === v.me);
    let focus = me && me.alive ? me : v.players.find(p => p.it && p.alive) || me || v.players[0];
    const vw = W / z, vh = H / z, mw = MW * TS, mh = MH * TS;
    let tx = focus ? focus.x - vw / 2 : 0, ty = focus ? focus.y - vh / 2 - 6 : 0;
    tx = vw >= mw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, tx));
    ty = vh >= mh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, ty));
    if (!this.camInit) { this.cam.x = tx; this.cam.y = ty; this.camInit = true; }
    const k = Math.min(1, dt * 10);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    this.shake = Math.max(0, this.shake - dt * 3);
    const sx = (Math.random() - 0.5) * this.shake * 6, sy = (Math.random() - 0.5) * this.shake * 6;
    const cx = Math.round((this.cam.x + sx) * z) / z, cy = Math.round((this.cam.y + sy) * z) / z;
    g.setTransform(z, 0, 0, z, -cx * z, -cy * z);
    g.drawImage(this.layers.ground, 0, 0);

    // portals
    for (const pr of this.map.portals) for (const ti of pr) {
      const px = (ti % MW) * TS + 8, py = ((ti / MW) | 0) * TS + 8;
      g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4 + ti);
      disc(g, '#7a4fd0', px, py, 3);
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) { const a = t * 3 + i * Math.PI / 2; P(g, '#d9b8ff', Math.round(px + Math.cos(a) * 4), Math.round(py + Math.sin(a) * 4)); }
    }
    // barricades
    for (const i of v.walls) {
      const px = (i % MW) * TS, py = ((i / MW) | 0) * TS;
      P(g, 'rgba(0,0,0,.25)', px, py + 14, 16, 3);
      P(g, OL, px, py + 1, 16, 15);
      for (let k2 = 0; k2 < 4; k2++) { P(g, '#8b5a2b', px + k2 * 4 + 1, py + 2, 3, 13); P(g, '#a8733e', px + k2 * 4 + 1, py + 2, 1, 13); P(g, '#c79a5a', px + k2 * 4 + 2, py, 1, 2); }
      P(g, '#5a3b1e', px, py + 6, 16, 2); P(g, '#5a3b1e', px, py + 11, 16, 2);
    }
    // traps
    for (const tr of v.traps) {
      const mine = tr.owner === v.me;
      const near = me && Math.hypot(me.x - tr.x, me.y - tr.y) < 28;
      if (!mine && !near) continue;
      g.globalAlpha = mine ? (tr.armed ? 0.9 : 0.5) : 0.35;
      drawGlyph(g, 'trap', tr.x - 2, tr.y - 2, '#bff2ff');
      g.globalAlpha = 1;
    }
    // runes
    for (const r of v.runes) {
      const b = Math.round(Math.sin(t * 3 + r.id) * 1.2), col = RUNES[r.k].col;
      g.globalAlpha = 0.18 + 0.1 * Math.sin(t * 5 + r.id); disc(g, col, r.x, r.y - 4 + b, 7); g.globalAlpha = 1;
      P(g, 'rgba(0,0,0,.3)', r.x - 3, r.y + 1, 7, 2);
      P(g, OL, r.x - 4, r.y - 9 + b, 9, 10); P(g, '#4b4a55', r.x - 3, r.y - 8 + b, 7, 8); P(g, '#62606e', r.x - 3, r.y - 8 + b, 7, 1);
      drawGlyph(g, r.k, r.x - 2, r.y - 7 + b, col);
    }

    // pawns
    const inBush = p => this.map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)] === T.BUSH;
    const ents = [];
    for (const p of v.players) if (p.alive) ents.push({ p, y: p.y });
    for (const d of v.decoys) ents.push({ p: d, y: d.y, decoy: true });
    ents.sort((a, b) => a.y - b.y);
    const zombieMode = v.mode === 'infect';
    for (const { p } of ents) {
      const self = p.id === v.me;
      let alpha = 1;
      if (p.fx && p.fx.invis > 0) { if (!self) { if (Math.random() < 0.05 && p.m) this.burst(p.x, p.y - 4, '#ffffff55', 1, 8, 0.3); continue; } alpha = 0.35; }
      if (!self && inBush(p) && (!me || Math.hypot(me.x - p.x, me.y - p.y) > 28)) continue;
      const it = p.it;
      if (it && !p.decoy) {
        g.globalAlpha = 0.35 + 0.2 * Math.sin(t * 8);
        g.strokeStyle = zombieMode ? '#7dff5a' : '#ff3b3b'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(p.x, p.y, 8, 4, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
      g.globalAlpha = alpha;
      drawPawn(g, p.x, p.y, { ...p, zombie: zombieMode && it }, t);
      g.globalAlpha = 1;
      const f = p.fx || {};
      const hx = Math.round(p.x), hy = Math.round(p.y) - 20;
      if (it && v.mode === 'classic') {
        const b = Math.round(Math.sin(t * 6) * 1.5);
        P(g, OL, hx - 3, hy - 6 + b, 7, 4); P(g, '#ff3b3b', hx - 2, hy - 5 + b, 5, 2); P(g, OL, hx - 1, hy - 2 + b, 3, 2); P(g, '#ff3b3b', hx, hy - 3 + b, 1, 2);
      }
      if (it && v.mode === 'bomb') {
        disc(g, OL, hx, hy - 3, 4); disc(g, '#2a2a2a', hx, hy - 3, 3); P(g, '#666', hx - 1, hy - 5, 1, 1);
        P(g, '#8a6a44', hx + 2, hy - 8, 1, 2);
        P(g, Math.random() < 0.5 ? '#ffd23f' : '#ff6b3b', hx + 2 + (Math.random() < 0.5 ? 1 : 0), hy - 9 - (Math.random() < 0.5 ? 1 : 0));
      }
      if (f.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; P(g, '#ffe14a', Math.round(p.x + Math.cos(a) * 5), Math.round(hy + 1 + Math.sin(a) * 2)); }
      if (f.frozen > 0) { g.globalAlpha = 0.55; P(g, '#bfe9ff', p.x - 6, p.y - 19, 13, 20); g.globalAlpha = 0.9; P(g, '#ffffff', p.x - 5, p.y - 18, 1, 6); P(g, '#ffffff', p.x - 3, p.y - 18, 3, 1); g.globalAlpha = 1; }
      if (f.shield > 0) { g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 10); g.strokeStyle = '#7dff8a'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y - 7, 11, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if (f.reach > 0) { g.globalAlpha = 0.25; g.strokeStyle = '#ff6b6b'; g.beginPath(); g.arc(p.x, p.y - 2, 22, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if ((f.haste > 0 || f.dash > 0) && p.m && Math.random() < 0.6) this.parts.push({ x: p.x - p.fdx * 6 + (Math.random() - 0.5) * 6, y: p.y - 4 + (Math.random() - 0.5) * 8, vx: -p.fdx * 30, vy: -p.fdy * 30, life: 0.25, max: 0.25, col: f.dash > 0 ? '#ffd23f' : '#d9ffa0', size: 1, grav: 0 });
      if (p.m && Math.random() < 0.08) this.parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 10, vy: -5, life: 0.4, max: 0.4, col: '#c8b89a88', size: 1, grav: 0 });
    }

    g.globalAlpha = me && inBush(me) ? 0.55 : 1;
    g.drawImage(this.layers.over, 0, 0);
    g.globalAlpha = 1;

    // names
    g.font = '5px "Press Start 2P", monospace'; g.textAlign = 'center';
    for (const { p, decoy } of ents) {
      const self = p.id === v.me;
      if (!self && ((p.fx && p.fx.invis > 0) || (inBush(p) && (!me || Math.hypot(me.x - p.x, me.y - p.y) > 28)))) continue;
      const nm = p.name || '';
      const ny = Math.round(p.y) - (p.it && v.mode !== 'infect' ? 31 : 23);
      g.fillStyle = '#000a'; g.fillText(nm, Math.round(p.x) + 0.5, ny + 0.5);
      g.fillStyle = self ? '#ffd86b' : p.it ? '#ff8a7a' : '#f0ece2';
      g.fillText(nm, Math.round(p.x), ny);
    }

    // particles
    for (const q of this.parts) {
      q.life -= dt;
      if (q.ring) {
        const k2 = 1 - q.life / 0.45; g.globalAlpha = Math.max(0, q.life / 0.45);
        g.strokeStyle = q.col; g.lineWidth = 1.5; g.beginPath(); g.arc(q.x, q.y, 2 + k2 * q.max, 0, Math.PI * 2); g.stroke();
      } else {
        q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92;
        g.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5));
        P(g, q.col, Math.round(q.x), Math.round(q.y), q.size, q.size);
      }
    }
    g.globalAlpha = 1;
    this.parts = this.parts.filter(q => q.life > 0);

    // lighting (night)
    if (v.event === 'night') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const d = this.dark.getContext('2d');
      d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H);
      d.fillStyle = 'rgba(6,8,22,0.94)'; d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      const lights = [];
      if (me && me.alive) lights.push([me.x, me.y - 6, me.it ? 85 : 68]);
      for (const p of v.players) if (p.alive && p.it && p !== me) lights.push([p.x, p.y - 6, 22]);
      for (const r of v.runes) lights.push([r.x, r.y - 4, 14]);
      for (const [lx, ly, lr] of lights) {
        const [px, py] = [(lx - cx) * z, (ly - cy) * z], rr = lr * z;
        const gr = d.createRadialGradient(px, py, rr * 0.25, px, py, rr);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gr; d.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
      g.drawImage(this.dark, 0, 0);
      g.setTransform(z, 0, 0, z, -cx * z, -cy * z);
    }
    if (v.event === 'frost') { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(170,220,255,0.12)'; g.fillRect(0, 0, W, H); g.setTransform(z, 0, 0, z, -cx * z, -cy * z); }

    // floating texts
    g.font = '7px "Press Start 2P", monospace';
    for (const q of this.texts) {
      q.life -= dt; q.y -= dt * 14;
      g.globalAlpha = Math.max(0, Math.min(1, q.life * 2));
      g.fillStyle = '#000'; g.fillText(q.txt, Math.round(q.x) + 1, Math.round(q.y) + 1);
      g.fillStyle = q.col; g.fillText(q.txt, Math.round(q.x), Math.round(q.y));
    }
    g.globalAlpha = 1;
    this.texts = this.texts.filter(q => q.life > 0);

    // screen space: edge arrows
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (me && me.alive && v.phase === 'play') {
      const targets = [];
      for (const p of v.players) {
        if (!p.alive || p === me || (p.fx && p.fx.invis > 0)) continue;
        if (me.it ? !p.it : p.it) targets.push(p);
      }
      if (me.it) { targets.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)); targets.length = Math.min(1, targets.length); }
      for (const p of targets) {
        const [px, py] = [(p.x - cx) * z, (p.y - 8 - cy) * z];
        const m = 28 * this.dpr;
        if (px > m && py > m && px < W - m && py < H - m) continue;
        const ax = Math.max(m, Math.min(W - m, px)), ay = Math.max(m, Math.min(H - m, py));
        const ang = Math.atan2(py - ay, px - ax);
        g.save(); g.translate(ax, ay); g.rotate(ang);
        const s = 4 * this.dpr;
        g.fillStyle = me.it ? '#ffd86b' : '#ff4a3b';
        g.beginPath(); g.moveTo(3 * s, 0); g.lineTo(-2 * s, -2.2 * s); g.lineTo(-2 * s, 2.2 * s); g.closePath(); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = this.dpr; g.stroke();
        g.restore();
      }
    }
  }

  drawJoystick(joy) {
    if (!joy.active) return;
    const g = this.g, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.35; g.fillStyle = '#000';
    g.beginPath(); g.arc(joy.ox * d, joy.oy * d, 56 * d, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.6; g.strokeStyle = '#e0b252'; g.lineWidth = 2 * d; g.stroke();
    g.globalAlpha = 0.85; g.fillStyle = '#e0b252';
    g.beginPath(); g.arc(joy.kx * d, joy.ky * d, 24 * d, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }

  drawMini(c, v) {
    if (!this.layers) return;
    const g = c.getContext('2d');
    if (c.width !== MW * 3) { c.width = MW * 3; c.height = MH * 3; }
    g.imageSmoothingEnabled = false;
    g.drawImage(this.layers.mini, 0, 0, MW * 3, MH * 3);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, c.width, c.height);
    if (v.event === 'night') { g.fillStyle = 'rgba(0,0,20,.7)'; g.fillRect(0, 0, c.width, c.height); }
    for (const r of v.runes) { g.fillStyle = RUNES[r.k].col; g.fillRect(Math.floor(r.x / TS) * 3 + 1, Math.floor(r.y / TS) * 3 + 1, 1, 1); }
    const me = v.players.find(p => p.id === v.me);
    for (const p of v.players) {
      if (!p.alive) continue;
      const self = p === me;
      const hidden = (p.fx && p.fx.invis > 0) || this.map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)] === T.BUSH;
      if (!self && (hidden || v.event === 'night')) continue;
      const x = Math.floor(p.x / TS) * 3, y = Math.floor(p.y / TS) * 3;
      g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, 5, 5);
      g.fillStyle = self ? '#ffd86b' : p.it ? (v.mode === 'infect' ? '#7dff5a' : '#ff3b3b') : p.color;
      g.fillRect(x, y, 3, 3);
    }
  }
}
