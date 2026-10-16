// Pixel-art renderer: prerendered map layers, pawns, runes, bombs, particles, lighting.
import { TS, MW, MH, T, rng, isHideT, arenaSpiral } from './map.js';
import { RUNES, GLYPHS, ITEMS } from './sim.js';

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
  return (shadeCache[key] = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`);
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

const PAL = {
  normal: { grass: '#5b6b32', g1: '#52612d', g2: '#66783a', tuft: '#748a42', chk: '#56672f' },
  halloween: { grass: '#474f2d', g1: '#3e4528', g2: '#525a33', tuft: '#5f6b3a', chk: '#424a2a' },
};

function pumpkin(g, cx, cy, lit) {
  P(g, 'rgba(0,0,0,.25)', cx - 5, cy + 3, 11, 2);
  disc(g, OL, cx, cy, 5); disc(g, '#d9772e', cx, cy, 4);
  P(g, '#b85e1f', cx - 2, cy - 3, 1, 7); P(g, '#b85e1f', cx + 2, cy - 3, 1, 7); P(g, '#f0a050', cx - 3, cy - 2, 1, 2);
  P(g, '#4a6b2a', cx, cy - 6, 1, 2);
  if (lit) { P(g, '#ffd23f', cx - 2, cy - 1, 1, 1); P(g, '#ffd23f', cx + 2, cy - 1, 1, 1); P(g, '#ffd23f', cx - 2, cy + 2, 5, 1); P(g, '#ffd23f', cx - 1, cy + 1, 3, 1); }
}

export function buildLayers(map, seed) {
  const W = MW * TS, H = MH * TS, hw = map.theme === 'halloween';
  const pal = hw ? PAL.halloween : PAL.normal;
  const ground = mk(W, H), over = mk(W, H), mini = mk(MW, MH);
  const g = ground.getContext('2d'), o = over.getContext('2d'), mm = mini.getContext('2d');
  const r = rng(seed * 7 + 3), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? T.WALL : map.g[y * MW + x];
  const arena = map.type === 'arena';

  const grass = (px, py, x, y) => {
    P(g, arena && (x + y) % 2 ? pal.chk : pal.grass, px, py, TS, TS);
    for (let i = 0; i < 14; i++) P(g, r() < 0.5 ? pal.g1 : pal.g2, px + ri(0, 15), py + ri(0, 15));
    if (r() < 0.4) { const x2 = ri(1, 12), y2 = ri(4, 14); P(g, pal.tuft, px + x2, py + y2 - 2, 1, 2); P(g, pal.tuft, px + x2 + 2, py + y2 - 3, 1, 3); }
    if (r() < 0.07) P(g, hw ? ['#8e58b0', '#d9772e', '#cfcfcf'][ri(0, 2)] : ['#d9c84a', '#d07a9a', '#e8e8e8', '#8fb4e0'][ri(0, 3)], px + ri(2, 13), py + ri(2, 13));
  };
  const water = (px, py, x, y) => {
    P(g, '#2f5f7c', px, py, TS, TS);
    for (let i = 0; i < 6; i++) P(g, '#3a6f8e', px + ri(0, 13), py + ri(0, 15), 3, 1);
    const wet = t => t === T.WATER || t === T.BRIDGE || t === T.ICE;
    if (!wet(at(x, y - 1))) P(g, '#24485f', px, py, TS, 3);
  };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), px = x * TS, py = y * TS;
    switch (t) {
      case T.GRASS: case T.BUSH: case T.TREE: case T.PORTAL: case T.TOMB: case T.PUMPKIN: grass(px, py, x, y); break;
      case T.DIRT:
        P(g, '#7a6040', px, py, TS, TS);
        for (let i = 0; i < 12; i++) P(g, r() < 0.5 ? '#6d5538' : '#87704d', px + ri(0, 15), py + ri(0, 15));
        if (r() < 0.5) P(g, '#9a907f', px + ri(1, 13), py + ri(1, 14), 2, 1);
        break;
      case T.ROAD:
        P(g, '#6e6454', px, py, TS, TS);
        for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) P(g, r() < 0.5 ? '#958a74' : '#877c68', px + j * 4 + ((k % 2) * 2) % 4, py + k * 4, 3, 3);
        break;
      case T.WHEAT:
        P(g, '#8a7a34', px, py, TS, TS);
        for (let i = 0; i < 10; i++) P(g, '#7a6a2c', px + ri(0, 15), py + ri(0, 15));
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
        if (hw && r() < 0.06) { g.strokeStyle = 'rgba(230,230,230,.5)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(px, py + 6); g.lineTo(px + 6, py); g.moveTo(px, py); g.lineTo(px + 5, py + 5); g.moveTo(px, py + 3); g.quadraticCurveTo(px + 3, py + 3, px + 3, py); g.stroke(); }
        break;
      }
      case T.HEDGE:
        P(g, '#2e4a22', px, py, TS, TS);
        for (let i = 0; i < 16; i++) P(g, r() < 0.5 ? '#3b5e2b' : '#264019', px + ri(0, 15), py + ri(0, 15), r() < 0.3 ? 2 : 1, 1);
        if (at(x, y - 1) !== T.HEDGE) P(g, '#4a7234', px, py, TS, 2);
        if (at(x, y + 1) !== T.HEDGE) P(g, '#1d3014', px, py + 13, TS, 3);
        break;
      case T.WATER: water(px, py, x, y); break;
      case T.BRIDGE:
        water(px, py, x, y);
        P(g, '#5a3f22', px, py + 1, TS, 14);
        for (let k = 0; k < 4; k++) { P(g, '#8b6a42', px + k * 4, py + 1, 3, 14); P(g, '#a07a4c', px + k * 4, py + 1, 1, 14); }
        P(g, '#3e2b16', px, py + 1, TS, 1); P(g, '#3e2b16', px, py + 14, TS, 1);
        break;
      case T.ICE:
        P(g, '#a9d3e3', px, py, TS, TS);
        { const off = ri(0, 15); for (let i = 0; i < 6; i++) P(g, '#d8f0f8', px + ((i + off) % 16), py + ((i * 2 + off) % 16), 2, 1); }
        for (let i = 0; i < 4; i++) P(g, '#86b6c9', px + ri(0, 15), py + ri(0, 15));
        break;
    }
    if (t === T.TREE) { P(g, 'rgba(0,0,0,.22)', px + 2, py + 11, 13, 4); P(g, '#4a3420', px + 7, py + 8, 3, 7); P(g, '#5e4329', px + 7, py + 8, 1, 7); }
    if (t === T.PORTAL) { disc(g, '#3a3540', px + 8, py + 8, 7); disc(g, '#5a5468', px + 8, py + 8, 6); disc(g, '#1c1424', px + 8, py + 8, 4); }
    if (t === T.TOMB) {
      P(g, 'rgba(0,0,0,.25)', px + 4, py + 13, 10, 2);
      P(g, '#5a4a32', px + 4, py + 11, 9, 3);
      P(g, OL, px + 4, py + 2, 8, 11); P(g, OL, px + 5, py + 1, 6, 1);
      P(g, '#8a8a92', px + 5, py + 2, 6, 10); P(g, '#a4a4ac', px + 5, py + 2, 6, 1); P(g, '#6e6e76', px + 10, py + 3, 1, 9);
      P(g, '#5f5f68', px + 7, py + 4, 2, 6); P(g, '#5f5f68', px + 6, py + 5, 4, 1);
    }
    if (t === T.PUMPKIN) pumpkin(g, px + 8, py + 9, hw);
  }
  for (let y = 0; y < MH - 1; y++) for (let x = 0; x < MW; x++)
    if ((at(x, y) === T.WALL || at(x, y) === T.HEDGE) && at(x, y + 1) !== at(x, y)) P(g, 'rgba(0,0,0,.25)', x * TS, (y + 1) * TS, TS, 3);

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), cx = x * TS + 8;
    if (t === T.TREE) {
      const roll = r(), cy = y * TS + 3;
      if (hw && roll < 0.45) {
        // dead tree
        const br = '#3a2a1c';
        P(o, br, cx - 1, cy - 4, 2, 10); P(o, br, cx - 5, cy - 3, 4, 1); P(o, br, cx - 6, cy - 5, 1, 2); P(o, br, cx + 1, cy - 1, 5, 1); P(o, br, cx + 5, cy - 4, 1, 3);
        P(o, br, cx - 1, cy - 8, 1, 4); P(o, br, cx + 1, cy - 7, 1, 3); P(o, br, cx - 3, cy + 1, 2, 1);
        if (r() < 0.5) P(o, '#d9772e', cx + 5, cy - 5);
        continue;
      }
      const autumn = hw ? roll < 0.85 : roll < 0.15, pine = !autumn && r() < 0.35;
      const col = autumn ? (hw && r() < 0.5 ? '#9a4a1e' : '#8a6a2a') : pine ? '#2f5228' : '#3b5a26';
      const li = shade(col, 0.2);
      if (pine) {
        for (let i = 0; i < 14; i++) { const w = 1 + Math.floor((i % 5) * 1.6 + i * 0.35); P(o, OL, cx - w - 1, cy - 8 + i, w * 2 + 3, 1); P(o, i % 5 < 2 ? li : col, cx - w, cy - 8 + i, w * 2 + 1, 1); }
      } else {
        disc(o, '#22331a', cx, cy, 8); disc(o, col, cx, cy, 7);
        disc(o, li, cx - 2, cy - 2, 3); disc(o, li, cx + 3, cy + 1, 2);
        for (let i = 0; i < 5; i++) P(o, shade(col, -0.3), cx + ri(-5, 5), cy + ri(-4, 5));
      }
    } else if (t === T.BUSH) {
      const cy = y * TS + 9;
      disc(o, '#26401c', cx, cy, 7); disc(o, hw ? '#3a5a2a' : '#3f6a2c', cx, cy, 6);
      disc(o, '#558a3a', cx - 2, cy - 2, 2); P(o, '#558a3a', cx + 2, cy + 1, 2, 1);
      if (r() < 0.25) for (let i = 0; i < 3; i++) P(o, hw ? '#8e58b0' : '#c0392b', cx + ri(-4, 4), cy + ri(-3, 3));
    } else if (t === T.WHEAT) {
      const px = x * TS, py = y * TS;
      for (let i = 0; i < 9; i++) {
        const sx = px + 1 + i * 2 - (i % 2), sy = py + ri(-3, 1);
        P(o, '#b8963a', sx, sy + 3, 1, 12); P(o, '#e0c25a', sx, sy, 1, 4); P(o, '#f0d878', sx, sy, 1, 1);
      }
    }
  }
  const MC = { [T.GRASS]: pal.grass, [T.DIRT]: '#7a6040', [T.WALL]: '#9a958e', [T.WATER]: '#2f5f7c', [T.BUSH]: '#2f5022', [T.ICE]: '#a9d3e3', [T.TREE]: '#2b4220', [T.FLOOR]: '#7d5f3c', [T.PORTAL]: '#b07cff', [T.HEDGE]: '#2e4a22', [T.ROAD]: '#877c68', [T.BRIDGE]: '#8b6a42', [T.TOMB]: '#8a8a92', [T.WHEAT]: '#b8963a', [T.PUMPKIN]: '#d9772e' };
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
  const hy = by - 7, hc = o.hairCol || '#3b2a1a', hat = o.hat || 0;
  if (hat === 3) {
    // pumpkin head
    P(g, OL, x - 3, hy, 7, 7); P(g, OL, x - 4, hy + 1, 9, 5);
    P(g, '#d9772e', x - 3, hy + 1, 7, 5); P(g, '#b85e1f', x, hy + 1, 1, 5); P(g, '#4a6b2a', x, hy - 1, 1, 2);
    if (dir !== 1) { P(g, '#ffd23f', dir === 3 ? x : x - 2, hy + 2); P(g, '#ffd23f', dir === 2 ? x : x + 2, hy + 2); P(g, '#ffd23f', x - 1, hy + 4, 3, 1); }
    return;
  }
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
  if (hair === 2 && hat !== 1) { P(g, OL, x - 1, hy - 3, 3, 4); P(g, hc, x, hy - 2, 1, 4); }
  if (hair === 1 && dir === 1) P(g, hc, x - 3, hy + 2, 7, 4);
  if (hat === 1) {
    P(g, OL, x - 5, hy, 11, 2); P(g, '#2a1f3a', x - 4, hy, 9, 1);
    P(g, OL, x - 3, hy - 4, 7, 4); P(g, '#2a1f3a', x - 2, hy - 3, 5, 3); P(g, '#8e58b0', x - 2, hy - 1, 5, 1);
    P(g, OL, x - 1, hy - 7, 3, 3); P(g, '#2a1f3a', x, hy - 6, 1, 3); P(g, OL, x + 1, hy - 8, 2, 1);
  }
  if (hat === 2) { P(g, '#c0392b', x - 3, hy - 2, 1, 2); P(g, '#c0392b', x - 4, hy - 3, 1, 1); P(g, '#c0392b', x + 3, hy - 2, 1, 2); P(g, '#c0392b', x + 4, hy - 3, 1, 1); }
}

function drawGhostSprite(g, x, y, t, col, alpha) {
  x = Math.round(x); y = Math.round(y + Math.sin(t * 4 + x) * 1.5);
  g.globalAlpha = alpha;
  P(g, OL, x - 5, y - 14, 11, 12); P(g, OL, x - 4, y - 15, 9, 1);
  P(g, col, x - 4, y - 14, 9, 11);
  const w = Math.floor(t * 6) % 2;
  for (let i = 0; i < 4; i++) P(g, col, x - 4 + i * 2 + w, y - 3, 1, 2);
  P(g, OL, x - 2, y - 11, 2, 3); P(g, OL, x + 1, y - 11, 2, 3); P(g, OL, x - 1, y - 7, 3, 2);
  g.globalAlpha = 1;
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
function drawBomb(g, x, y, t, big) {
  const s = big ? 1 : 0;
  disc(g, OL, x, y, 5 + s); disc(g, '#2a2a33', x, y, 4 + s); P(g, '#6a6a78', x - 2, y - 3, 2, 1); P(g, '#6a6a78', x - 3, y - 2, 1, 1);
  P(g, '#8a6a44', x + 2, y - 6 - s, 1, 2);
  P(g, Math.random() < 0.5 ? '#ffd23f' : '#ff6b3b', x + 2 + (Math.random() < 0.5 ? 1 : 0), y - 7 - s - (Math.random() < 0.5 ? 1 : 0));
}
function drawItem(g, k, x, y, t) {
  const b = Math.round(Math.sin(t * 4 + x) * 1);
  y += b;
  P(g, 'rgba(0,0,0,.3)', x - 5, y + 5, 11, 2);
  P(g, OL, x - 6, y - 6, 13, 12); P(g, '#3a3a48', x - 5, y - 5, 11, 10); P(g, ITEMS[k].col, x - 5, y - 5, 11, 1);
  if (k === 'fire') { disc(g, '#ff7a2a', x, y + 1, 3); P(g, '#ff7a2a', x - 1, y - 4, 2, 3); disc(g, '#ffd23f', x, y + 2, 1); }
  if (k === 'bomb') { disc(g, '#15151c', x - 1, y + 1, 3); P(g, '#ffd23f', x + 2, y - 3); P(g, '#fff', x + 3, y + 1, 1, 3); P(g, '#fff', x + 2, y + 2, 3, 1); }
  if (k === 'boots') { P(g, '#c98b4a', x - 2, y - 3, 3, 6); P(g, '#c98b4a', x - 2, y + 2, 6, 2); P(g, '#8b5a2b', x - 2, y + 3, 6, 1); P(g, '#fff', x + 2, y - 3, 2, 1); }
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.dark = mk(10, 10);
    this.parts = []; this.texts = []; this.flames = []; this.bats = [];
    this.cam = { x: 0, y: 0 }; this.shake = 0; this.zoom = 3;
    this.layers = null;
  }
  setMap(map, seed) {
    this.map = map; this.layers = buildLayers(map, seed);
    this.parts = []; this.texts = []; this.flames = []; this.bats = []; this.camInit = false;
    this.spiral = map.type === 'arena' ? arenaSpiral() : [];
  }
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
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: life * (0.6 + Math.random() * 0.6), max: life, col, size });
    }
  }
  ring(x, y, col, r = 50) { this.parts.push({ ring: true, x, y, r: 2, max: r, life: 0.45, col }); }
  text(x, y, txt, col = '#fff') { this.texts.push({ x, y, txt, col, life: 1.2 }); }
  blast(tiles) { this.flames.push({ tiles, t: 0.5 }); }

  draw(v, dt, t) {
    const g = this.g, z = this.zoom, W = this.c.width, H = this.c.height, map = this.map, hw = map && map.theme === 'halloween';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#16181b'; g.fillRect(0, 0, W, H);
    if (!this.layers) return;
    const me = v.players.find(p => p.id === v.me);
    const focus = me && (me.alive || me.ghost) ? me : v.players.find(p => p.it && p.alive) || me || v.players[0];
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
    const world = () => g.setTransform(z, 0, 0, z, -cx * z, -cy * z);
    world();
    g.drawImage(this.layers.ground, 0, 0);
    const reveal = me && me.fx && me.fx.eye > 0;

    for (const pr of map.portals) for (const ti of pr) {
      const px = (ti % MW) * TS + 8, py = ((ti / MW) | 0) * TS + 8;
      g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4 + ti);
      disc(g, '#7a4fd0', px, py, 3);
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) { const a = t * 3 + i * Math.PI / 2; P(g, '#d9b8ff', Math.round(px + Math.cos(a) * 4), Math.round(py + Math.sin(a) * 4)); }
    }
    // puddles of slime
    for (const pu of v.puddles) {
      g.globalAlpha = 0.45; disc(g, '#6aa82e', pu.x, pu.y, 20); g.globalAlpha = 0.6; disc(g, '#8ad24a', pu.x - 3, pu.y - 2, 12);
      g.globalAlpha = 1;
      if (Math.random() < 0.1) this.parts.push({ x: pu.x + (Math.random() - 0.5) * 30, y: pu.y + (Math.random() - 0.5) * 24, vx: 0, vy: -6, life: 0.5, max: 0.5, col: '#b8f070', size: 1 });
    }
    // crates
    for (const i of map.crates) {
      const px = (i % MW) * TS, py = ((i / MW) | 0) * TS;
      P(g, 'rgba(0,0,0,.25)', px + 1, py + 14, 15, 3);
      P(g, OL, px + 1, py, 14, 15); P(g, '#a8733e', px + 2, py + 1, 12, 13);
      P(g, '#8b5a2b', px + 2, py + 1, 12, 2); P(g, '#8b5a2b', px + 2, py + 12, 12, 2);
      P(g, '#8b5a2b', px + 2, py + 1, 2, 13); P(g, '#8b5a2b', px + 12, py + 1, 2, 13);
      for (let d = 0; d < 8; d++) P(g, '#8b5a2b', px + 4 + d, py + 3 + d, 1, 1);
      P(g, '#c79a5a', px + 4, py + 3, 8, 1);
    }
    // barricades / sudden-death blocks
    const sdSet = this.spiral.length && v.sd ? new Set(this.spiral.slice(0, v.sd)) : null;
    for (const i of v.walls) {
      const px = (i % MW) * TS, py = ((i / MW) | 0) * TS;
      if (sdSet && sdSet.has(i)) {
        P(g, OL, px, py, 16, 16); P(g, '#6e6a72', px + 1, py + 1, 14, 14); P(g, '#8e8a92', px + 1, py + 1, 14, 2); P(g, '#55515a', px + 1, py + 12, 14, 3);
        P(g, '#55515a', px + 7, py + 3, 1, 9); P(g, '#55515a', px + 1, py + 7, 14, 1);
        continue;
      }
      P(g, 'rgba(0,0,0,.25)', px, py + 14, 16, 3);
      P(g, OL, px, py + 1, 16, 15);
      for (let k2 = 0; k2 < 4; k2++) { P(g, '#8b5a2b', px + k2 * 4 + 1, py + 2, 3, 13); P(g, '#a8733e', px + k2 * 4 + 1, py + 2, 1, 13); P(g, '#c79a5a', px + k2 * 4 + 2, py, 1, 2); }
      P(g, '#5a3b1e', px, py + 6, 16, 2); P(g, '#5a3b1e', px, py + 11, 16, 2);
    }
    for (const tr of v.traps) {
      const mine = tr.owner === v.me;
      const near = me && Math.hypot(me.x - tr.x, me.y - tr.y) < 28;
      if (!mine && !near && !reveal) continue;
      g.globalAlpha = mine ? (tr.armed ? 0.9 : 0.5) : 0.4;
      drawGlyph(g, 'trap', tr.x - 2, tr.y - 2, '#bff2ff');
      g.globalAlpha = 1;
    }
    for (const it of v.items) drawItem(g, it.k, it.x, it.y, t);
    for (const r of v.runes) {
      const b = Math.round(Math.sin(t * 3 + r.id) * 1.2), col = RUNES[r.k].col, gold = r.k === 'gold';
      g.globalAlpha = (gold ? 0.35 : 0.18) + 0.1 * Math.sin(t * 5 + r.id); disc(g, col, r.x, r.y - 4 + b, gold ? 10 : 7); g.globalAlpha = 1;
      P(g, 'rgba(0,0,0,.3)', r.x - 3, r.y + 1, 7, 2);
      P(g, OL, r.x - 4, r.y - 9 + b, 9, 10); P(g, gold ? '#8a6a1a' : '#4b4a55', r.x - 3, r.y - 8 + b, 7, 8); P(g, gold ? '#c9a23a' : '#62606e', r.x - 3, r.y - 8 + b, 7, 1);
      drawGlyph(g, r.k, r.x - 2, r.y - 7 + b, col);
      if (gold && Math.random() < 0.15) this.parts.push({ x: r.x + (Math.random() - 0.5) * 12, y: r.y - 6, vx: 0, vy: -15, life: 0.6, max: 0.6, col: '#ffe08a', size: 1 });
    }
    for (const b of v.bombs) {
      const pulse = b.t < 0.7 ? Math.floor(t * 16) % 2 : Math.floor(t * 5) % 2;
      drawBomb(g, b.x, b.y + 1, t, pulse);
      if (b.t < 0.7 && pulse) { g.globalAlpha = 0.35; disc(g, '#ff4a3b', b.x, b.y + 1, 4); g.globalAlpha = 1; }
    }
    // meteor warnings
    for (const m of v.meteors) {
      const k2 = Math.max(0, m.t / 1.3);
      g.globalAlpha = 0.35 + 0.3 * Math.sin(t * 14);
      g.strokeStyle = '#ff3b3b'; g.lineWidth = 1; g.beginPath(); g.arc(m.x, m.y, 20, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.2; disc(g, '#ff3b3b', m.x, m.y, Math.round(20 * (1 - k2)));
      g.globalAlpha = 1;
      const fy = m.y - k2 * 140;
      P(g, 'rgba(0,0,0,.3)', m.x - 4, m.y - 1, 9, 3);
      if (hw) pumpkin(g, Math.round(m.x), Math.round(fy), true);
      else { disc(g, OL, Math.round(m.x), Math.round(fy), 5); disc(g, '#7a5a4a', Math.round(m.x), Math.round(fy), 4); P(g, '#ffb03b', Math.round(m.x) - 1, Math.round(fy) - 8, 3, 4); }
    }

    // pawns
    const inHide = p => isHideT(map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)]);
    const hiddenFor = p => !reveal && p.id !== v.me && ((p.fx && p.fx.invis > 0) || (inHide(p) && (!me || Math.hypot(me.x - p.x, me.y - p.y) > 28)));
    const ents = [];
    for (const p of v.players) if (p.alive) ents.push({ p, y: p.y });
    for (const d of v.decoys) ents.push({ p: d, y: d.y });
    ents.sort((a, b) => a.y - b.y);
    const zombieMode = v.mode === 'infect';
    for (const { p } of ents) {
      const self = p.id === v.me;
      if (hiddenFor(p)) { if (p.fx && p.fx.invis > 0 && Math.random() < 0.05 && p.m) this.burst(p.x, p.y - 4, '#ffffff55', 1, 8, 0.3); continue; }
      const f = p.fx || {};
      const alpha = (f.invis > 0 ? (self ? 0.35 : 0.5) : 1) * (f.phase > 0 ? 0.55 : 1);
      const it = p.it;
      if (it && !p.decoy) {
        g.globalAlpha = 0.35 + 0.2 * Math.sin(t * 8);
        g.strokeStyle = zombieMode ? '#7dff5a' : '#ff3b3b'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(p.x, p.y, 8, 4, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
      g.globalAlpha = alpha;
      const tiny = f.tiny > 0;
      if (tiny) { g.save(); g.translate(p.x, p.y); g.scale(0.6, 0.6); g.translate(-p.x, -p.y); }
      drawPawn(g, p.x, p.y, { ...p, zombie: zombieMode && it, hat: hw ? hash(p.id) % 4 : 0 }, t);
      if (tiny) g.restore();
      g.globalAlpha = 1;
      const hx = Math.round(p.x), hy = Math.round(p.y) - (tiny ? 13 : 20);
      if (it && v.mode === 'classic') {
        const b = Math.round(Math.sin(t * 6) * 1.5);
        if (hw) pumpkin(g, hx, hy - 6 + b, true);
        else { P(g, OL, hx - 3, hy - 6 + b, 7, 4); P(g, '#ff3b3b', hx - 2, hy - 5 + b, 5, 2); P(g, OL, hx - 1, hy - 2 + b, 3, 2); P(g, '#ff3b3b', hx, hy - 3 + b, 1, 2); }
      }
      if (it && v.mode === 'bomb') drawBomb(g, hx, hy - 3, t, 0);
      if (f.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; P(g, '#ffe14a', Math.round(p.x + Math.cos(a) * 5), Math.round(hy + 1 + Math.sin(a) * 2)); }
      if (f.frozen > 0) { g.globalAlpha = 0.55; P(g, '#bfe9ff', p.x - 6, p.y - 19, 13, 20); g.globalAlpha = 0.9; P(g, '#ffffff', p.x - 5, p.y - 18, 1, 6); P(g, '#ffffff', p.x - 3, p.y - 18, 3, 1); g.globalAlpha = 1; }
      if (f.shield > 0) { g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 10); g.strokeStyle = '#7dff8a'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y - 7, 11, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if (f.reach > 0) { g.globalAlpha = 0.25; g.strokeStyle = '#ff6b6b'; g.beginPath(); g.arc(p.x, p.y - 2, 22, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if (f.chill > 0 && Math.random() < 0.3) this.parts.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y - 10, vx: 0, vy: 8, life: 0.5, max: 0.5, col: '#cfe8ff', size: 1 });
      if (f.slow > 0 && Math.random() < 0.2) this.parts.push({ x: p.x + (Math.random() - 0.5) * 8, y: p.y - 2, vx: 0, vy: 6, life: 0.4, max: 0.4, col: '#8ad24a', size: 1 });
      if (f.eye > 0 && self) { g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); drawGlyph(g, 'eye', hx - 2, hy - 8, '#ffe08a'); g.globalAlpha = 1; }
      if ((f.haste > 0 || f.dash > 0) && p.m && Math.random() < 0.6) this.parts.push({ x: p.x - p.fdx * 6 + (Math.random() - 0.5) * 6, y: p.y - 4 + (Math.random() - 0.5) * 8, vx: -p.fdx * 30, vy: -p.fdy * 30, life: 0.25, max: 0.25, col: f.dash > 0 ? '#ffd23f' : '#d9ffa0', size: 1 });
      if (p.m && Math.random() < 0.08) this.parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 10, vy: -5, life: 0.4, max: 0.4, col: '#c8b89a88', size: 1 });
    }

    g.globalAlpha = me && me.alive && inHide(me) ? 0.55 : 1;
    g.drawImage(this.layers.over, 0, 0);
    g.globalAlpha = 1;

    // flames (bomberman)
    for (const fl of this.flames) {
      fl.t -= dt;
      const a = Math.max(0, fl.t / 0.5);
      for (const i of fl.tiles) {
        const px = (i % MW) * TS, py = ((i / MW) | 0) * TS;
        g.globalAlpha = Math.min(1, a * 1.6);
        P(g, '#ff5a1f', px + 1, py + 1, 14, 14);
        P(g, '#ff9a2a', px + 3, py + 3, 10, 10);
        P(g, Math.random() < 0.5 ? '#ffe36a' : '#fff3b0', px + 5, py + 5, 6, 6);
      }
      g.globalAlpha = 1;
    }
    this.flames = this.flames.filter(f => f.t > 0);

    // ghosts of eliminated players + spirits
    for (const p of v.players) if (!p.alive && p.ghost) drawGhostSprite(g, p.x, p.y, t, p.id === v.me ? '#fff7d8' : '#e8eef8', p.id === v.me ? 0.7 : 0.5);
    for (const s of v.spirits) drawGhostSprite(g, s.x, s.y + 8, t, '#c9a8ff', 0.75);

    // names
    g.font = '5px "Press Start 2P", monospace'; g.textAlign = 'center';
    for (const { p } of ents) {
      if (hiddenFor(p)) continue;
      const self = p.id === v.me;
      const lift = (p.it && v.mode !== 'infect' ? 31 : 23) - (p.fx && p.fx.tiny > 0 ? 7 : 0);
      const ny = Math.round(p.y) - lift;
      let nm = p.name || '';
      if (v.mode === 'bomber' && p.lives != null && !p.decoy) nm += ' ' + '♥'.repeat(Math.max(0, p.lives));
      g.fillStyle = '#000a'; g.fillText(nm, Math.round(p.x) + 0.5, ny + 0.5);
      g.fillStyle = self ? '#ffd86b' : p.it ? '#ff8a7a' : '#f0ece2';
      g.fillText(nm, Math.round(p.x), ny);
    }

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

    // bats (halloween ambience)
    if (hw) {
      if (Math.random() < dt * 0.3) { const left = Math.random() < 0.5; this.bats.push({ x: left ? cx - 10 : cx + vw + 10, y: cy + Math.random() * vh * 0.6, vx: (left ? 1 : -1) * (40 + Math.random() * 30), ph: Math.random() * 6, life: 12 }); }
      for (const b of this.bats) {
        b.life -= dt; b.x += b.vx * dt; b.y += Math.sin(t * 3 + b.ph) * 0.4;
        const bx = Math.round(b.x), by = Math.round(b.y), up = Math.floor(t * 12 + b.ph) % 2;
        P(g, '#15101c', bx - 1, by, 3, 2);
        P(g, '#15101c', bx - 4, by - (up ? 1 : -1), 3, 1); P(g, '#15101c', bx + 2, by - (up ? 1 : -1), 3, 1);
        P(g, '#ff4a3b', bx, by);
      }
      this.bats = this.bats.filter(b => b.life > 0);
    }

    // darkness: night / fog / blindness
    const ev = v.event;
    let dark = null;
    if (ev === 'night') dark = { col: '6,8,22', a: 0.94, r: me && me.it ? 85 : 68 };
    if (ev === 'fog') dark = { col: '120,126,138', a: 0.82, r: 115 };
    if (me && me.fx && me.fx.blind > 0) dark = { col: '10,6,16', a: 0.96, r: 36 };
    if (ev === 'spirits' && !dark) dark = { col: '20,10,40', a: 0.6, r: 110 };
    if (dark) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const d = this.dark.getContext('2d');
      d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H);
      d.fillStyle = `rgba(${dark.col},${dark.a})`; d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      const lights = [];
      if (me && (me.alive || me.ghost)) lights.push([me.x, me.y - 6, dark.r]);
      if (ev === 'night') {
        for (const p of v.players) if (p.alive && p.it && p !== me) lights.push([p.x, p.y - 6, 22]);
        for (const r of v.runes) lights.push([r.x, r.y - 4, 14]);
        for (const b of v.bombs) lights.push([b.x, b.y, 14]);
      }
      for (const [lx, ly, lr] of lights) {
        const px = (lx - cx) * z, py = (ly - cy) * z, rr = lr * z;
        const gr = d.createRadialGradient(px, py, rr * 0.25, px, py, rr);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gr; d.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
      g.drawImage(this.dark, 0, 0);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (ev === 'frost') { g.fillStyle = 'rgba(170,220,255,0.12)'; g.fillRect(0, 0, W, H); }
    if (ev === 'mirror') { g.fillStyle = 'rgba(200,120,255,0.08)'; g.fillRect(0, 0, W, H); }
    if (hw) {
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(30,10,50,0)'); vg.addColorStop(1, 'rgba(30,10,50,0.45)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    world();

    g.font = '7px "Press Start 2P", monospace';
    for (const q of this.texts) {
      q.life -= dt; q.y -= dt * 14;
      g.globalAlpha = Math.max(0, Math.min(1, q.life * 2));
      g.fillStyle = '#000'; g.fillText(q.txt, Math.round(q.x) + 1, Math.round(q.y) + 1);
      g.fillStyle = q.col; g.fillText(q.txt, Math.round(q.x), Math.round(q.y));
    }
    g.globalAlpha = 1;
    this.texts = this.texts.filter(q => q.life > 0);

    // edge arrows
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (me && me.alive && v.phase === 'play' && v.mode !== 'bomber') {
      const targets = [];
      for (const p of v.players) {
        if (!p.alive || p === me || hiddenFor(p)) continue;
        if (me.it ? !p.it : p.it) targets.push(p);
      }
      if (me.it) { targets.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)); targets.length = Math.min(1, targets.length); }
      for (const p of targets) {
        const px = (p.x - cx) * z, py = (p.y - 8 - cy) * z;
        const m = 28 * this.dpr;
        if (px > m && py > m && px < W - m && py < H - m) continue;
        const ax = Math.max(m, Math.min(W - m, px)), ay = Math.max(m, Math.min(H - m, py));
        g.save(); g.translate(ax, ay); g.rotate(Math.atan2(py - ay, px - ax));
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
    g.fillStyle = '#7a5530';
    for (const i of this.map.crates) g.fillRect((i % MW) * 3, ((i / MW) | 0) * 3, 3, 3);
    g.fillStyle = '#6e6a72';
    for (const i of v.walls) g.fillRect((i % MW) * 3, ((i / MW) | 0) * 3, 3, 3);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, c.width, c.height);
    const blindMap = v.event === 'night' || v.event === 'fog';
    if (blindMap) { g.fillStyle = 'rgba(0,0,20,.7)'; g.fillRect(0, 0, c.width, c.height); }
    for (const r of v.runes) { g.fillStyle = RUNES[r.k].col; g.fillRect(Math.floor(r.x / TS) * 3 + 1, Math.floor(r.y / TS) * 3 + 1, 1, 1); }
    const me = v.players.find(p => p.id === v.me);
    const reveal = me && me.fx && me.fx.eye > 0;
    for (const p of v.players) {
      if (!p.alive) continue;
      const self = p === me;
      const hidden = (p.fx && p.fx.invis > 0) || isHideT(this.map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)]);
      if (!self && !reveal && (hidden || blindMap)) continue;
      const x = Math.floor(p.x / TS) * 3, y = Math.floor(p.y / TS) * 3;
      g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, 5, 5);
      g.fillStyle = self ? '#ffd86b' : p.it ? (v.mode === 'infect' ? '#7dff5a' : '#ff3b3b') : p.color;
      g.fillRect(x, y, 3, 3);
    }
  }
}
