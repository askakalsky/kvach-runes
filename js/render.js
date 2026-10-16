// Pixel-art renderer: prerendered map layers, pawns, cosmetics, mode props, particles, lighting.
import { TS, MW, MH, T, rng, isHideT, arenaSpiral, isWinter } from './map.js';
import { RUNES, GLYPHS, ITEMS, TEAM_COLS, MOB_COLS } from './sim.js';
import { CAPES } from './skins.js';

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
const LIGHTS = ['#ff4a3b', '#ffd23f', '#4ad0ff', '#7dff5a', '#ff7ad9'];

function palette(map) {
  const th = map.theme, ty = map.type;
  if (ty === 'pacman') return { grass: '#0a0a16', g1: '#0c0c1c', g2: '#09091a', tuft: null, chk: '#0a0a16' };
  if (isWinter(th)) return { grass: '#dfe8ee', g1: '#cfdbe4', g2: '#eef4f8', tuft: '#b8c8d4', chk: '#d2dde6', dirt: '#a8a096', snow: true };
  if (ty === 'magic') return { grass: '#3d5e55', g1: '#355449', g2: '#476b61', tuft: '#5f9a86', chk: '#3a5a51' };
  if (th === 'halloween') return { grass: '#474f2d', g1: '#3e4528', g2: '#525a33', tuft: '#5f6b3a', chk: '#424a2a' };
  if (ty === 'beach') return { grass: '#68783a', g1: '#5f6f34', g2: '#748640', tuft: '#84984a', chk: '#62723a' };
  return { grass: '#5b6b32', g1: '#52612d', g2: '#66783a', tuft: '#748a42', chk: '#56672f' };
}

function pumpkin(g, cx, cy, lit) {
  P(g, 'rgba(0,0,0,.25)', cx - 5, cy + 3, 11, 2);
  disc(g, OL, cx, cy, 5); disc(g, '#d9772e', cx, cy, 4);
  P(g, '#b85e1f', cx - 2, cy - 3, 1, 7); P(g, '#b85e1f', cx + 2, cy - 3, 1, 7); P(g, '#f0a050', cx - 3, cy - 2, 1, 2);
  P(g, '#4a6b2a', cx, cy - 6, 1, 2);
  if (lit) { P(g, '#ffd23f', cx - 2, cy - 1); P(g, '#ffd23f', cx + 2, cy - 1); P(g, '#ffd23f', cx - 2, cy + 2, 5, 1); P(g, '#ffd23f', cx - 1, cy + 1, 3, 1); }
}
function decor(g, kind, cx, cy, r) {
  if (kind === 'pumpkin') return pumpkin(g, cx, cy + 1, true);
  P(g, 'rgba(0,0,0,.25)', cx - 5, cy + 4, 11, 2);
  if (kind === 'snowman') {
    disc(g, OL, cx, cy + 1, 5); disc(g, '#f4f8fb', cx, cy + 1, 4);
    disc(g, OL, cx, cy - 5, 3); disc(g, '#f4f8fb', cx, cy - 5, 2);
    P(g, OL, cx - 1, cy - 6); P(g, OL, cx + 1, cy - 6); P(g, '#ff8a2a', cx, cy - 5, 2, 1);
    P(g, '#c8463d', cx - 3, cy - 3, 6, 1); P(g, OL, cx, cy, 1, 1); P(g, OL, cx, cy + 2, 1, 1);
    P(g, '#2a2a2a', cx - 2, cy - 9, 5, 2); P(g, '#2a2a2a', cx - 3, cy - 8, 7, 1);
  } else if (kind === 'umbrella') {
    P(g, '#8a6a44', cx, cy - 6, 1, 11);
    const cols = ['#d8453b', '#f4f0e8'];
    for (let i = -6; i <= 6; i++) { const h = 3 - Math.floor(Math.abs(i) / 3); P(g, cols[(Math.floor((i + 6) / 3)) % 2], cx + i, cy - 8 - h + 3, 1, h + 1); }
    P(g, OL, cx - 7, cy - 5, 15, 1);
  } else if (kind === 'crystal') {
    P(g, OL, cx - 3, cy - 8, 7, 13); P(g, '#9a7aff', cx - 2, cy - 7, 5, 11); P(g, '#c9b8ff', cx - 2, cy - 7, 2, 9); P(g, '#e8e0ff', cx - 1, cy - 6, 1, 3);
    P(g, OL, cx + 3, cy - 3, 4, 8); P(g, '#5ad0d0', cx + 4, cy - 2, 2, 6);
  } else {
    P(g, OL, cx - 4, cy - 6, 9, 11); P(g, '#8b5a2b', cx - 3, cy - 5, 7, 9); P(g, '#5a3b1e', cx - 3, cy - 3, 7, 1); P(g, '#5a3b1e', cx - 3, cy + 1, 7, 1); P(g, '#a8733e', cx - 3, cy - 5, 2, 9);
  }
}

export function buildLayers(map, seed) {
  const W = MW * TS, H = MH * TS, th = map.theme, ty = map.type;
  const hw = th === 'halloween', win = isWinter(th), ny = th === 'newyear', pac = ty === 'pacman';
  const pal = palette(map);
  const ground = mk(W, H), over = mk(W, H), upper = mk(W, H), mini = mk(MW, MH);
  const g = ground.getContext('2d'), o = over.getContext('2d'), u = upper.getContext('2d'), mm = mini.getContext('2d');
  const r = rng(seed * 7 + 3), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? T.WALL : map.g[y * MW + x];
  const upAt = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && map.up[y * MW + x];
  const arena = ty === 'arena';
  const decoKind = hw || ty === 'graveyard' ? 'pumpkin' : win ? 'snowman' : ty === 'beach' ? 'umbrella' : ty === 'magic' ? 'crystal' : 'barrel';
  const lights = [];

  const grass = (px, py, x, y) => {
    P(g, arena && (x + y) % 2 ? pal.chk : pal.grass, px, py, TS, TS);
    for (let i = 0; i < 14; i++) P(g, r() < 0.5 ? pal.g1 : pal.g2, px + ri(0, 15), py + ri(0, 15));
    if (pal.tuft && r() < 0.4) { const x2 = ri(1, 12), y2 = ri(4, 14); P(g, pal.tuft, px + x2, py + y2 - 2, 1, 2); P(g, pal.tuft, px + x2 + 2, py + y2 - 3, 1, 3); }
    if (!pac && !win && r() < 0.07) P(g, hw ? ['#8e58b0', '#d9772e', '#cfcfcf'][ri(0, 2)] : ty === 'magic' ? ['#ff9ad5', '#9ef0e0', '#ffe08a'][ri(0, 2)] : ['#d9c84a', '#d07a9a', '#e8e8e8', '#8fb4e0'][ri(0, 3)], px + ri(2, 13), py + ri(2, 13));
  };
  const water = (px, py, x, y) => {
    P(g, '#2f5f7c', px, py, TS, TS);
    for (let i = 0; i < 6; i++) P(g, '#3a6f8e', px + ri(0, 13), py + ri(0, 15), 3, 1);
    const wet = t => t === T.WATER || t === T.BRIDGE || t === T.ICE;
    if (!wet(at(x, y - 1))) P(g, ty === 'beach' ? '#e8f4f8' : '#24485f', px, py, TS, ty === 'beach' ? 2 : 3);
  };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), px = x * TS, py = y * TS;
    switch (t) {
      case T.GRASS: case T.BUSH: case T.TREE: case T.PORTAL: case T.TOMB: case T.DECOR: case T.MUSH:
        if (t === T.TREE && ty === 'beach' && (at(x - 1, y) === T.SAND || at(x + 1, y) === T.SAND || at(x, y + 1) === T.SAND)) { P(g, '#d9c48a', px, py, TS, TS); break; }
        grass(px, py, x, y); break;
      case T.SAND:
        P(g, '#d9c48a', px, py, TS, TS);
        for (let i = 0; i < 12; i++) P(g, r() < 0.5 ? '#cbb67c' : '#e6d49a', px + ri(0, 15), py + ri(0, 15));
        if (r() < 0.08) { P(g, '#f4e8dc', px + ri(2, 12), py + ri(2, 12), 2, 1); }
        break;
      case T.DIRT:
        P(g, pal.dirt || '#7a6040', px, py, TS, TS);
        for (let i = 0; i < 12; i++) P(g, win ? (r() < 0.5 ? '#b8b0a6' : '#9a9088') : (r() < 0.5 ? '#6d5538' : '#87704d'), px + ri(0, 15), py + ri(0, 15));
        if (r() < 0.5) P(g, '#9a907f', px + ri(1, 13), py + ri(1, 14), 2, 1);
        break;
      case T.ROAD:
        P(g, '#6e6454', px, py, TS, TS);
        for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) P(g, win ? (r() < 0.6 ? '#dfe6ea' : '#a8a296') : r() < 0.5 ? '#958a74' : '#877c68', px + j * 4 + (k % 2) * 2 % 4, py + k * 4, 3, 3);
        break;
      case T.WHEAT:
        P(g, '#8a7a34', px, py, TS, TS);
        for (let i = 0; i < 10; i++) P(g, '#7a6a2c', px + ri(0, 15), py + ri(0, 15));
        break;
      case T.STAIRS:
        P(g, '#5a5650', px, py, TS, TS);
        for (let k = 0; k < 4; k++) { P(g, '#8a857e', px, py + k * 4, TS, 3); P(g, '#a39e96', px, py + k * 4, TS, 1); }
        break;
      case T.FLOOR:
        if (pac) { P(g, '#1a0f2a', px, py, TS, TS); break; }
        P(g, '#7d5f3c', px, py, TS, TS);
        for (let k = 0; k < 4; k++) {
          P(g, '#634a2d', px, py + k * 4 + 3, TS, 1);
          P(g, '#634a2d', px + ((k * 5 + y * 3 + x * 7) % 16), py + k * 4, 1, 3);
          P(g, '#8a6b45', px + ri(0, 15), py + k * 4 + ri(0, 2));
        }
        break;
      case T.WALL: {
        if (pac) {
          P(g, '#0b1030', px, py, TS, TS);
          const n = at(x, y - 1) !== T.WALL, s = at(x, y + 1) !== T.WALL, w = at(x - 1, y) !== T.WALL, e = at(x + 1, y) !== T.WALL;
          const x0 = w ? 3 : 0, x1 = e ? 13 : 16, y0 = n ? 3 : 0, y1 = s ? 13 : 16;
          if (n) P(g, '#2d5bff', px + x0, py + 3, x1 - x0, 2); if (s) P(g, '#2d5bff', px + x0, py + 11, x1 - x0, 2);
          if (w) P(g, '#2d5bff', px + 3, py + y0, 2, y1 - y0); if (e) P(g, '#2d5bff', px + 11, py + y0, 2, y1 - y0);
          break;
        }
        P(g, '#7b7670', px, py, TS, TS);
        for (let row = 0; row < 3; row++) {
          P(g, '#57534e', px, py + row * 5 + 4, TS, 1);
          const off = row % 2 ? 0 : 4;
          P(g, '#57534e', px + off, py + row * 5, 1, 4); P(g, '#57534e', px + off + 8, py + row * 5, 1, 4);
        }
        for (let i = 0; i < 6; i++) P(g, r() < 0.5 ? '#6c6762' : '#8a857e', px + ri(0, 15), py + ri(0, 15));
        if (at(x, y - 1) !== T.WALL) {
          P(g, win ? '#f4f8fb' : '#a39e96', px, py, TS, win ? 3 : 2);
          if (ny) for (let k = 2; k < 16; k += 4) lights.push([px + k, py + 3 + (k % 8 ? 1 : 0)]);
        }
        if (at(x, y + 1) !== T.WALL) { P(g, '#55514c', px, py + 12, TS, 4); P(g, '#45423e', px, py + 15, TS, 1); }
        if (at(x - 1, y) !== T.WALL) P(g, '#615d58', px, py, 1, TS);
        if (at(x + 1, y) !== T.WALL) P(g, '#615d58', px + 15, py, 1, TS);
        if (hw && r() < 0.06) { g.strokeStyle = 'rgba(230,230,230,.5)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(px, py + 6); g.lineTo(px + 6, py); g.moveTo(px, py); g.lineTo(px + 5, py + 5); g.stroke(); }
        break;
      }
      case T.HEDGE:
        P(g, win ? '#3a5a44' : '#2e4a22', px, py, TS, TS);
        for (let i = 0; i < 16; i++) P(g, r() < 0.5 ? '#3b5e2b' : '#264019', px + ri(0, 15), py + ri(0, 15), r() < 0.3 ? 2 : 1, 1);
        if (at(x, y - 1) !== T.HEDGE) P(g, win ? '#f4f8fb' : '#4a7234', px, py, TS, win ? 3 : 2);
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
    if (t === T.TREE) {
      if (ty === 'beach') { P(g, 'rgba(0,0,0,.18)', px + 3, py + 12, 12, 3); P(g, '#8a6a44', px + 7, py + 6, 2, 9); P(g, '#a8845a', px + 7, py + 8, 1, 1); P(g, '#a8845a', px + 8, py + 11, 1, 1); }
      else { P(g, 'rgba(0,0,0,.22)', px + 2, py + 11, 13, 4); P(g, '#4a3420', px + 7, py + 8, 3, 7); P(g, '#5e4329', px + 7, py + 8, 1, 7); }
    }
    if (t === T.PORTAL) {
      if (ty === 'magic') { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P(g, i % 2 ? '#ff6b9a' : '#e0d0ff', px + 8 + Math.round(Math.cos(a) * 6), py + 8 + Math.round(Math.sin(a) * 6), 2, 2); } }
      else if (!pac) { disc(g, '#3a3540', px + 8, py + 8, 7); disc(g, '#5a5468', px + 8, py + 8, 6); disc(g, '#1c1424', px + 8, py + 8, 4); }
    }
    if (t === T.TOMB) {
      P(g, 'rgba(0,0,0,.25)', px + 4, py + 13, 10, 2);
      P(g, '#5a4a32', px + 4, py + 11, 9, 3);
      P(g, OL, px + 4, py + 2, 8, 11); P(g, OL, px + 5, py + 1, 6, 1);
      P(g, '#8a8a92', px + 5, py + 2, 6, 10); P(g, win ? '#f4f8fb' : '#a4a4ac', px + 5, py + 2, 6, win ? 2 : 1); P(g, '#6e6e76', px + 10, py + 3, 1, 9);
      P(g, '#5f5f68', px + 7, py + 4, 2, 6); P(g, '#5f5f68', px + 6, py + 5, 4, 1);
    }
    if (t === T.DECOR) decor(g, decoKind, px + 8, py + 9, r);
    if (t === T.MUSH) {
      for (let k = 0; k < 2 + ri(0, 1); k++) {
        const mx = px + ri(3, 12), my = py + ri(6, 13), magic = ty === 'magic';
        P(g, '#e8dcc0', mx, my, 1, 3);
        P(g, OL, mx - 2, my - 2, 5, 2); P(g, magic ? ['#5ad0d0', '#c85aa8', '#9a7aff'][ri(0, 2)] : '#c8463d', mx - 2, my - 2, 5, 1);
        P(g, '#ffffff', mx - 1, my - 2);
      }
    }
    if (map.up[y * MW + x]) P(g, 'rgba(0,0,0,.3)', px, py, TS, TS);
  }
  for (let y = 0; y < MH - 1; y++) for (let x = 0; x < MW; x++)
    if ((at(x, y) === T.WALL || at(x, y) === T.HEDGE) && at(x, y + 1) !== at(x, y) && !pac) P(g, 'rgba(0,0,0,.25)', x * TS, (y + 1) * TS, TS, 3);

  // canopies, bushes, wheat: drawn above pawns
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), cx = x * TS + 8;
    if (t === T.TREE) {
      const roll = r(), cy = y * TS + 3;
      if (ty === 'beach') {
        const fr = '#3f7a2c', fl = '#5a9a3a';
        P(o, OL, cx - 1, cy - 2, 3, 3);
        for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1]]) for (let s = 1; s <= 6; s++) {
          const xx = cx + dx * s, yy = cy - 1 + dy * s + (dx && s > 3 ? s - 3 : 0);
          P(o, s % 2 ? fr : fl, xx, yy, 2, 1);
        }
        P(o, '#8a5a2a', cx - 1, cy, 2, 2);
        continue;
      }
      if (hw && roll < 0.45) {
        const br = '#3a2a1c';
        P(o, br, cx - 1, cy - 4, 2, 10); P(o, br, cx - 5, cy - 3, 4, 1); P(o, br, cx - 6, cy - 5, 1, 2); P(o, br, cx + 1, cy - 1, 5, 1); P(o, br, cx + 5, cy - 4, 1, 3);
        P(o, br, cx - 1, cy - 8, 1, 4); P(o, br, cx + 1, cy - 7, 1, 3); P(o, br, cx - 3, cy + 1, 2, 1);
        if (r() < 0.5) P(o, '#d9772e', cx + 5, cy - 5);
        continue;
      }
      const pine = win ? roll < 0.7 : ty !== 'magic' && r() < 0.35;
      let col, li;
      if (ty === 'magic') { col = ['#5a4a9a', '#2f8a80', '#9a4a8a', '#3f7a5a'][ri(0, 3)]; li = shade(col, 0.3); }
      else if (hw) { col = r() < 0.5 ? '#9a4a1e' : '#8a6a2a'; li = shade(col, 0.2); }
      else if (pine) { col = '#2f5228'; li = '#3f6a34'; }
      else { col = r() < 0.15 ? '#8a6a2a' : '#3b5a26'; li = shade(col, 0.2); }
      if (pine) {
        const deco = ny && r() < 0.6;
        for (let i = 0; i < 14; i++) {
          const w = 1 + Math.floor((i % 5) * 1.6 + i * 0.35);
          P(o, OL, cx - w - 1, cy - 8 + i, w * 2 + 3, 1);
          P(o, win && i % 5 === 0 ? '#f4f8fb' : i % 5 < 2 ? li : col, cx - w, cy - 8 + i, w * 2 + 1, 1);
          if (deco && i % 3 === 1) P(o, LIGHTS[ri(0, 4)], cx - w + ri(0, w * 2), cy - 8 + i);
        }
        if (deco) { P(o, '#ffd23f', cx - 1, cy - 10, 3, 1); P(o, '#ffd23f', cx, cy - 11, 1, 3); }
      } else {
        disc(o, '#22331a', cx, cy, 8); disc(o, win ? '#7a6a5a' : col, cx, cy, 7);
        if (win) { disc(o, '#f4f8fb', cx - 1, cy - 3, 4); P(o, '#f4f8fb', cx - 6, cy - 1, 12, 2); }
        else { disc(o, li, cx - 2, cy - 2, 3); disc(o, li, cx + 3, cy + 1, 2); for (let i = 0; i < 5; i++) P(o, shade(col, -0.3), cx + ri(-5, 5), cy + ri(-4, 5)); }
        if (ty === 'magic') for (let i = 0; i < 3; i++) P(o, '#ffe08a', cx + ri(-5, 5), cy + ri(-5, 4));
      }
    } else if (t === T.BUSH) {
      const cy = y * TS + 9;
      disc(o, '#26401c', cx, cy, 7); disc(o, hw ? '#3a5a2a' : ty === 'magic' ? '#4a3a7a' : '#3f6a2c', cx, cy, 6);
      disc(o, ty === 'magic' ? '#6a5aa8' : '#558a3a', cx - 2, cy - 2, 2); P(o, '#558a3a', cx + 2, cy + 1, 2, 1);
      if (win) { P(o, '#f4f8fb', cx - 4, cy - 5, 8, 2); P(o, '#f4f8fb', cx - 2, cy - 6, 5, 1); }
      if (r() < 0.25) for (let i = 0; i < 3; i++) P(o, hw ? '#8e58b0' : ny ? LIGHTS[ri(0, 4)] : '#c0392b', cx + ri(-4, 4), cy + ri(-3, 3));
    } else if (t === T.WHEAT) {
      const px = x * TS, py = y * TS;
      for (let i = 0; i < 9; i++) {
        const sx = px + 1 + i * 2 - (i % 2), sy = py + ri(-3, 1);
        P(o, '#b8963a', sx, sy + 3, 1, 12); P(o, '#e0c25a', sx, sy, 1, 4); P(o, win ? '#ffffff' : '#f0d878', sx, sy, 1, 1);
      }
    }
  }

  // upper floor (two-storey maps)
  let hasUp = false;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!upAt(x, y)) continue;
    hasUp = true;
    const px = x * TS, py = y * TS;
    P(u, '#9a7650', px, py, TS, TS);
    for (let k = 0; k < 4; k++) { P(u, '#7d5f3c', px, py + k * 4 + 3, TS, 1); P(u, '#ad8a60', px + ((x * 5 + k * 7) % 14), py + k * 4, 2, 1); }
    if (win) for (let i = 0; i < 4; i++) P(u, '#eef4f8', px + ri(0, 14), py + ri(0, 14), 2, 1);
    const open = (xx, yy) => upAt(xx, yy) || at(xx, yy) === T.STAIRS;
    if (!open(x, y - 1)) { P(u, '#4a3420', px, py, TS, 2); P(u, '#6e5232', px, py + 2, TS, 1); }
    if (!open(x, y + 1)) { P(u, '#4a3420', px, py + 13, TS, 3); P(g, '#3a2a18', px + 1, py + 16, 2, 6); P(g, '#3a2a18', px + 13, py + 16, 2, 6); }
    if (!open(x - 1, y)) P(u, '#4a3420', px, py, 2, TS);
    if (!open(x + 1, y)) P(u, '#4a3420', px + 14, py, 2, TS);
  }

  const MC = { [T.GRASS]: pal.grass, [T.DIRT]: pal.dirt || '#7a6040', [T.WALL]: pac ? '#2d5bff' : '#9a958e', [T.WATER]: '#2f5f7c', [T.BUSH]: '#2f5022', [T.ICE]: '#a9d3e3', [T.TREE]: '#2b4220', [T.FLOOR]: '#7d5f3c', [T.PORTAL]: '#b07cff', [T.HEDGE]: '#2e4a22', [T.ROAD]: '#877c68', [T.BRIDGE]: '#8b6a42', [T.TOMB]: '#8a8a92', [T.WHEAT]: '#b8963a', [T.DECOR]: '#d9772e', [T.SAND]: '#d9c48a', [T.MUSH]: pal.grass, [T.STAIRS]: '#8a857e' };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) P(mm, upAt(x, y) ? '#9a7650' : MC[at(x, y)], x, y);
  return { ground, over, upper: hasUp ? upper : null, mini, lights };
}

function drawHat(g, key, x, hy, dir) {
  switch (key) {
    case 'cap': {
      P(g, OL, x - 4, hy - 1, 9, 3); P(g, '#c8463d', x - 3, hy, 7, 1); P(g, '#e05a50', x - 3, hy - 1, 7, 1);
      if (dir === 0) P(g, '#9a3028', x - 3, hy + 2, 7, 1); else if (dir === 2) P(g, '#9a3028', x - 6, hy + 1, 3, 1); else if (dir === 3) P(g, '#9a3028', x + 4, hy + 1, 3, 1);
      break;
    }
    case 'crown':
      P(g, OL, x - 4, hy - 3, 9, 4); P(g, '#ffcc33', x - 3, hy - 2, 7, 2);
      P(g, '#ffcc33', x - 3, hy - 3); P(g, '#ffcc33', x, hy - 3); P(g, '#ffcc33', x + 3, hy - 3); P(g, '#e23b3b', x, hy - 1);
      break;
    case 'wizard':
      P(g, OL, x - 4, hy - 1, 9, 2); P(g, '#2f4fa8', x - 3, hy - 1, 7, 1);
      P(g, OL, x - 3, hy - 5, 7, 4); P(g, '#2f4fa8', x - 2, hy - 4, 5, 3);
      P(g, OL, x - 2, hy - 9, 4, 4); P(g, '#2f4fa8', x - 1, hy - 8, 2, 3); P(g, '#ffe14a', x - 1, hy - 3); P(g, '#ffe14a', x + 1, hy - 6);
      break;
    case 'santa':
      P(g, OL, x - 4, hy - 4, 9, 5); P(g, '#d8453b', x - 3, hy - 3, 7, 3); P(g, '#d8453b', x + 2, hy - 5, 3, 2);
      P(g, '#f4f4f4', x - 4, hy - 1, 9, 2); P(g, '#f4f4f4', x + 4, hy - 6, 2, 2);
      break;
    case 'tophat':
      P(g, OL, x - 5, hy - 1, 11, 2); P(g, '#222', x - 4, hy - 1, 9, 1);
      P(g, OL, x - 3, hy - 7, 7, 6); P(g, '#2a2a2a', x - 2, hy - 6, 5, 5); P(g, '#c8463d', x - 2, hy - 2, 5, 1);
      break;
    case 'viking':
      P(g, OL, x - 4, hy - 2, 9, 4); P(g, '#9a9aa8', x - 3, hy - 1, 7, 2); P(g, '#c8c8d4', x - 3, hy - 1, 7, 1);
      P(g, '#f0e6c8', x - 5, hy - 4, 1, 3); P(g, '#f0e6c8', x - 6, hy - 5, 1, 1); P(g, '#f0e6c8', x + 5, hy - 4, 1, 3); P(g, '#f0e6c8', x + 6, hy - 5, 1, 1);
      break;
    case 'ushanka':
      P(g, OL, x - 4, hy - 2, 9, 4); P(g, '#7a5a3a', x - 3, hy - 1, 7, 2); P(g, '#a8845a', x - 3, hy - 1, 7, 1);
      if (dir !== 1) { P(g, '#7a5a3a', x - 4, hy + 1, 1, 4); P(g, '#7a5a3a', x + 4, hy + 1, 1, 4); }
      break;
    case 'witch':
      P(g, OL, x - 5, hy, 11, 2); P(g, '#2a1f3a', x - 4, hy, 9, 1);
      P(g, OL, x - 3, hy - 4, 7, 4); P(g, '#2a1f3a', x - 2, hy - 3, 5, 3); P(g, '#8e58b0', x - 2, hy - 1, 5, 1);
      P(g, OL, x - 1, hy - 7, 3, 3); P(g, '#2a1f3a', x, hy - 6, 1, 3); P(g, OL, x + 1, hy - 8, 2, 1);
      break;
    case 'horns':
      P(g, '#c0392b', x - 3, hy - 2, 1, 2); P(g, '#c0392b', x - 4, hy - 3); P(g, '#c0392b', x + 3, hy - 2, 1, 2); P(g, '#c0392b', x + 4, hy - 3);
      break;
  }
}

export function drawPawn(g, x, y, o, t) {
  x = Math.round(x); y = Math.round(y);
  const dir = Math.abs(o.fdx) > Math.abs(o.fdy) ? (o.fdx > 0 ? 3 : 2) : (o.fdy < 0 ? 1 : 0);
  const step = o.m ? Math.floor(t * 10 + (o.seed || 0)) % 2 : 0, bob = o.m && step ? 1 : 0;
  const skin = o.zombie ? '#8fb36a' : '#e8c39e', shirt = o.zombie ? '#5e7a3a' : o.color;
  const by = y - 10 - bob, cape = o.cape && CAPES[o.cape] && CAPES[o.cape].col;
  P(g, 'rgba(0,0,0,.28)', x - 4, y - 1, 9, 2); P(g, 'rgba(0,0,0,.28)', x - 3, y - 2, 7, 1); P(g, 'rgba(0,0,0,.28)', x - 3, y + 1, 7, 1);
  if (cape && dir !== 1) {
    const sway = step ? 1 : 0;
    if (dir === 0) { P(g, OL, x - 6, by + 1, 13, 8 + sway); P(g, cape, x - 5, by + 2, 11, 6 + sway); }
    else { const sx = dir === 2 ? x + 2 : x - 6; P(g, OL, sx, by + 1, 5, 9 + sway); P(g, cape, sx + 1, by + 2, 3, 7 + sway); }
  }
  P(g, OL, x - 4, y - 4, 4, step ? 3 : 4); P(g, OL, x + 1, y - 4, 4, step ? 4 : 3);
  P(g, '#3e3a48', x - 3, y - 4, 2, step ? 2 : 3); P(g, '#3e3a48', x + 2, y - 4, 2, step ? 3 : 2);
  P(g, OL, x - 4, by, 9, 7);
  P(g, shirt, x - 3, by + 1, 7, 5);
  P(g, shade(shirt, -0.25), x + 2, by + 1, 1, 5);
  P(g, shade(shirt, 0.25), x - 3, by + 1, 1, 3);
  P(g, OL, x - 5, by + 1 + step, 1, 3); P(g, OL, x + 5, by + 2 - step, 1, 3);
  P(g, skin, x - 5, by + 3 + step, 1, 1); P(g, skin, x + 5, by + 4 - step, 1, 1);
  if (cape && dir === 1) {
    P(g, OL, x - 5, by, 11, 10); P(g, cape, x - 4, by + 1, 9, 8); P(g, shade(cape, -0.2), x + 2, by + 1, 2, 8);
    if (o.cape === 'star') { P(g, '#ffe14a', x - 2, by + 3); P(g, '#ffe14a', x + 1, by + 6); P(g, '#ffffff', x + 2, by + 2); }
  }
  const hy = by - 7, hc = o.hairCol || '#3b2a1a', hat = o.hat || 'none';
  if (hat === 'pumpkin') {
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
  if (hair === 2 && hat === 'none') { P(g, OL, x - 1, hy - 3, 3, 4); P(g, hc, x, hy - 2, 1, 4); }
  if (hair === 1 && dir === 1) P(g, hc, x - 3, hy + 2, 7, 4);
  drawHat(g, hat, x, hy, dir);
}

function drawGhostSprite(g, x, y, t, col, alpha, eyesOnly, look) {
  x = Math.round(x); y = Math.round(y + Math.sin(t * 4 + x) * 1.5);
  g.globalAlpha = alpha;
  if (!eyesOnly) {
    P(g, OL, x - 5, y - 14, 11, 12); P(g, OL, x - 4, y - 15, 9, 1);
    P(g, col, x - 4, y - 14, 9, 11);
    const w = Math.floor(t * 6) % 2;
    for (let i = 0; i < 4; i++) P(g, col, x - 4 + i * 2 + w, y - 3, 1, 2);
  }
  if (look) {
    P(g, '#ffffff', x - 3, y - 11, 3, 3); P(g, '#ffffff', x + 1, y - 11, 3, 3);
    const lx = Math.round(look[0]), ly = Math.round(look[1]);
    P(g, '#1a2a8a', x - 2 + lx, y - 10 + ly); P(g, '#1a2a8a', x + 2 + lx, y - 10 + ly);
  } else { P(g, OL, x - 2, y - 11, 2, 3); P(g, OL, x + 1, y - 11, 2, 3); P(g, OL, x - 1, y - 7, 3, 2); }
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
  y += Math.round(Math.sin(t * 4 + x) * 1);
  P(g, 'rgba(0,0,0,.3)', x - 5, y + 5, 11, 2);
  P(g, OL, x - 6, y - 6, 13, 12); P(g, '#3a3a48', x - 5, y - 5, 11, 10); P(g, ITEMS[k].col, x - 5, y - 5, 11, 1);
  if (k === 'fire') { disc(g, '#ff7a2a', x, y + 1, 3); P(g, '#ff7a2a', x - 1, y - 4, 2, 3); disc(g, '#ffd23f', x, y + 2, 1); }
  if (k === 'bomb') { disc(g, '#15151c', x - 1, y + 1, 3); P(g, '#ffd23f', x + 2, y - 3); P(g, '#fff', x + 3, y + 1, 1, 3); P(g, '#fff', x + 2, y + 2, 3, 1); }
  if (k === 'boots') { P(g, '#c98b4a', x - 2, y - 3, 3, 6); P(g, '#c98b4a', x - 2, y + 2, 6, 2); P(g, '#8b5a2b', x - 2, y + 3, 6, 1); P(g, '#fff', x + 2, y - 3, 2, 1); }
}
function drawGift(g, x, y, c, t) {
  const col = ['#d8453b', '#3f7fe0', '#4f9a45', '#8e58b0'][c % 4], rib = c % 2 ? '#ffd23f' : '#f4f4f4';
  y += Math.round(Math.sin(t * 3 + x) * 1);
  P(g, 'rgba(0,0,0,.3)', x - 5, y + 4, 11, 2);
  P(g, OL, x - 5, y - 6, 11, 10); P(g, col, x - 4, y - 5, 9, 8); P(g, shade(col, 0.25), x - 4, y - 5, 9, 2);
  P(g, rib, x - 1, y - 5, 2, 8); P(g, rib, x - 4, y - 2, 9, 1);
  P(g, rib, x - 3, y - 8, 2, 2); P(g, rib, x + 1, y - 8, 2, 2);
}
function drawFlag(g, x, y, team, t) {
  const col = TEAM_COLS[team], w = Math.floor(t * 6) % 2;
  P(g, 'rgba(0,0,0,.3)', x - 2, y, 6, 2);
  P(g, OL, x - 1, y - 18, 2, 19); P(g, '#d8d0c0', x - 1, y - 18, 1, 18);
  P(g, OL, x + 1, y - 18, 9, 7); P(g, col, x + 1, y - 17, 8, 5); P(g, shade(col, 0.3), x + 1, y - 17, 8, 1);
  if (w) P(g, shade(col, -0.25), x + 6, y - 15, 3, 2);
}

const TRAIL_COL = { sparkle: ['#ffe14a', '#ffffff'], hearts: ['#ff6b9a', '#ff9ad5'], fire: ['#ff7a2a', '#ffd23f'], snow: ['#ffffff', '#cfe8ff'], leaves: ['#7ab03a', '#c9a23a'], bubbles: ['#9ad8ff', '#e0f4ff'] };

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.dark = mk(10, 10);
    this.parts = []; this.texts = []; this.flames = []; this.bats = []; this.prints = []; this.flakes = []; this.lastPrint = new Map();
    this.cam = { x: 0, y: 0 }; this.shake = 0; this.zoom = 3;
    this.layers = null;
  }
  setMap(map, seed) {
    this.map = map; this.layers = buildLayers(map, seed);
    this.parts = []; this.texts = []; this.flames = []; this.bats = []; this.prints = []; this.flakes = []; this.lastPrint.clear(); this.camInit = false;
    this.spiral = map.type === 'arena' ? arenaSpiral() : [];
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.c.width = Math.floor(innerWidth * dpr); this.c.height = Math.floor(innerHeight * dpr);
    this.dark.width = this.c.width; this.dark.height = this.c.height;
    this.zoom = Math.max(2, Math.round(Math.min(this.c.width, this.c.height) / 250));
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

  hatFor(p) {
    const h = p.skin && p.skin.hat;
    if (h && h !== 'none') return h;
    const th = this.map.theme, k = hash(p.id) % 4;
    if (th === 'halloween') return ['none', 'witch', 'horns', 'pumpkin'][k];
    if (th === 'newyear') return ['none', 'santa', 'santa', 'ushanka'][k];
    if (th === 'winter') return ['none', 'ushanka', 'none', 'ushanka'][k];
    return 'none';
  }

  draw(v, dt, t) {
    const g = this.g, z = this.zoom, W = this.c.width, H = this.c.height, map = this.map;
    const th = map.theme, hw = th === 'halloween', win = isWinter(th);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#16181b'; g.fillRect(0, 0, W, H);
    if (!this.layers) return;
    const me = v.players.find(p => p.id === v.me);
    const focus = me && (me.alive || me.ghost) ? me : v.players.find(p => p.it && p.alive) || v.players.find(p => p.alive) || me || v.players[0];
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
    const ctf = v.mode === 'ctf';
    const colorOf = p => ctf && p.team >= 0 ? TEAM_COLS[p.team] : p.color;

    // footprints in snow
    if (win) {
      for (const p of v.players) {
        if (!p.alive || p.z === 1) continue;
        const lp = this.lastPrint.get(p.id);
        if (!lp || Math.hypot(lp[0] - p.x, lp[1] - p.y) > 30) { this.lastPrint.set(p.id, [p.x, p.y, 0]); continue; }
        if (Math.hypot(lp[0] - p.x, lp[1] - p.y) > 6) {
          const side = lp[2] ? 1 : -1, nx = -p.fdy * side * 2, ny = p.fdx * side * 2;
          const t2 = map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)];
          if (t2 !== T.WATER && t2 !== T.ICE && t2 !== T.BRIDGE && t2 !== T.FLOOR) this.prints.push({ x: Math.round(p.x + nx), y: Math.round(p.y + ny - 1), t: 9 });
          this.lastPrint.set(p.id, [p.x, p.y, lp[2] ? 0 : 1]);
        }
      }
      for (const f of this.prints) { f.t -= dt; g.globalAlpha = Math.min(0.6, f.t / 6); P(g, '#a8b8c6', f.x, f.y, 2, 1); }
      g.globalAlpha = 1;
      this.prints = this.prints.filter(f => f.t > 0);
      if (this.prints.length > 600) this.prints.splice(0, this.prints.length - 600);
    }

    for (const pr of map.portals) for (const ti of pr) {
      const px = (ti % MW) * TS + 8, py = ((ti / MW) | 0) * TS + 8;
      if (map.type === 'pacman') { g.globalAlpha = 0.4 + 0.3 * Math.sin(t * 5); disc(g, '#2d5bff', px, py, 5); g.globalAlpha = 1; continue; }
      g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4 + ti);
      disc(g, map.type === 'magic' ? '#ff6b9a' : '#7a4fd0', px, py, 3);
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) { const a = t * 3 + i * Math.PI / 2; P(g, '#d9b8ff', Math.round(px + Math.cos(a) * 4), Math.round(py + Math.sin(a) * 4)); }
    }
    // pacman pellets
    if (map.pellets.size) {
      for (const i of map.pellets) {
        const px = (i % MW) * TS + 8, py = ((i / MW) | 0) * TS + 8;
        if (map.power.has(i)) { if (Math.floor(t * 4) % 2) disc(g, '#ffd9a0', px, py, 3); }
        else P(g, '#ffd9a0', px - 1, py - 1, 2, 2);
      }
    }
    // ctf bases
    if (ctf && v.flags) for (let tm = 0; tm < 2; tm++) {
      const f = v.flags[tm];
      g.globalAlpha = 0.3; disc(g, TEAM_COLS[tm], Math.round(f.hx), Math.round(f.hy), 18); g.globalAlpha = 0.6;
      g.strokeStyle = TEAM_COLS[tm]; g.lineWidth = 1; g.beginPath(); g.arc(f.hx, f.hy, 18, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    }
    if (ctf && v.flags) { g.globalAlpha = 0.25; P(g, '#ffffff', MW * TS / 2, 0, 1, MH * TS); g.globalAlpha = 1; }
    // king of the hill zone
    if (v.zone) {
      const zn = v.zone, col = zn.contested ? '#ff4a3b' : zn.owner ? '#ffd23f' : '#e0b252';
      g.globalAlpha = 0.18 + 0.08 * Math.sin(t * 4); disc(g, col, Math.round(zn.x), Math.round(zn.y), zn.r);
      g.globalAlpha = 0.8; g.strokeStyle = col; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.lineDashOffset = -t * 10;
      g.beginPath(); g.arc(zn.x, zn.y, zn.r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      drawHat(g, 'crown', Math.round(zn.x), Math.round(zn.y) - 2, 0);
    }
    for (const pu of v.puddles) {
      g.globalAlpha = 0.45; disc(g, '#6aa82e', pu.x, pu.y, 20); g.globalAlpha = 0.6; disc(g, '#8ad24a', pu.x - 3, pu.y - 2, 12);
      g.globalAlpha = 1;
      if (Math.random() < 0.1) this.parts.push({ x: pu.x + (Math.random() - 0.5) * 30, y: pu.y + (Math.random() - 0.5) * 24, vx: 0, vy: -6, life: 0.5, max: 0.5, col: '#b8f070', size: 1 });
    }
    for (const i of map.crates) {
      const px = (i % MW) * TS, py = ((i / MW) | 0) * TS;
      P(g, 'rgba(0,0,0,.25)', px + 1, py + 14, 15, 3);
      P(g, OL, px + 1, py, 14, 15); P(g, '#a8733e', px + 2, py + 1, 12, 13);
      P(g, '#8b5a2b', px + 2, py + 1, 12, 2); P(g, '#8b5a2b', px + 2, py + 12, 12, 2);
      P(g, '#8b5a2b', px + 2, py + 1, 2, 13); P(g, '#8b5a2b', px + 12, py + 1, 2, 13);
      for (let d = 0; d < 8; d++) P(g, '#8b5a2b', px + 4 + d, py + 3 + d, 1, 1);
      P(g, win ? '#f4f8fb' : '#c79a5a', px + 2, py + 1, 12, win ? 2 : 1);
    }
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
      const mine = tr.owner === v.me, near = me && Math.hypot(me.x - tr.x, me.y - tr.y) < 28;
      if (!mine && !near && !reveal) continue;
      g.globalAlpha = mine ? (tr.armed ? 0.9 : 0.5) : 0.4;
      drawGlyph(g, 'trap', tr.x - 2, tr.y - 2, '#bff2ff');
      g.globalAlpha = 1;
    }
    for (const it of v.items) drawItem(g, it.k, it.x, it.y, t);
    for (const gf of v.gifts) drawGift(g, gf.x, gf.y, gf.c, t);
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
    for (const m of v.meteors) {
      const k2 = Math.max(0, m.t / 1.3);
      g.globalAlpha = 0.35 + 0.3 * Math.sin(t * 14);
      g.strokeStyle = '#ff3b3b'; g.lineWidth = 1; g.beginPath(); g.arc(m.x, m.y, 20, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.2; disc(g, '#ff3b3b', m.x, m.y, Math.round(20 * (1 - k2)));
      g.globalAlpha = 1;
      const fy = Math.round(m.y - k2 * 140), fx = Math.round(m.x);
      P(g, 'rgba(0,0,0,.3)', m.x - 4, m.y - 1, 9, 3);
      if (hw) pumpkin(g, fx, fy, true);
      else if (win) { disc(g, '#cfe8ff', fx, fy, 4); disc(g, '#ffffff', fx - 1, fy - 1, 2); }
      else { disc(g, OL, fx, fy, 5); disc(g, '#7a5a4a', fx, fy, 4); P(g, '#ffb03b', fx - 1, fy - 8, 3, 4); }
    }

    // pawns, split by floor
    const inHide = p => isHideT(map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)]);
    const underUp = p => (p.z || 0) === 0 && map.up[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)];
    const hiddenFor = p => {
      if (reveal || p.id === v.me) return false;
      if (p.fx && p.fx.invis > 0) return true;
      const far = !me || Math.hypot(me.x - p.x, me.y - p.y) > 28;
      return (inHide(p) && far) || (underUp(p) && me && (me.z || 0) === 1 && far);
    };
    const ents = [];
    for (const p of v.players) if (p.alive) ents.push(p);
    for (const d of v.decoys) ents.push(d);
    ents.sort((a, b) => a.y - b.y);
    const zombieMode = v.mode === 'infect' || v.mode === 'hide';
    const drawEnt = p => {
      const self = p.id === v.me;
      if (hiddenFor(p)) { if (p.fx && p.fx.invis > 0 && Math.random() < 0.05 && p.m) this.burst(p.x, p.y - 4, '#ffffff55', 1, 8, 0.3); return; }
      const f = p.fx || {};
      const alpha = (f.invis > 0 ? (self ? 0.35 : 0.5) : 1) * (f.phase > 0 ? 0.55 : 1);
      const it = p.it;
      if (ctf && p.team >= 0 && !p.decoy) { g.globalAlpha = 0.6; g.strokeStyle = TEAM_COLS[p.team]; g.lineWidth = 1; g.beginPath(); g.ellipse(p.x, p.y, 7, 3.5, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if (it && !p.decoy && v.mode !== 'hide') {
        g.globalAlpha = 0.35 + 0.2 * Math.sin(t * 8);
        g.strokeStyle = v.mode === 'infect' ? '#7dff5a' : '#ff3b3b'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(p.x, p.y, 8, 4, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
      g.globalAlpha = alpha;
      const tiny = f.tiny > 0;
      if (tiny) { g.save(); g.translate(p.x, p.y); g.scale(0.6, 0.6); g.translate(-p.x, -p.y); }
      drawPawn(g, p.x, p.y, { ...p, color: colorOf(p), zombie: v.mode === 'infect' && it, hat: this.hatFor(p), cape: p.skin && p.skin.cape }, t);
      if (tiny) g.restore();
      g.globalAlpha = 1;
      const hx = Math.round(p.x), hy = Math.round(p.y) - (tiny ? 13 : 20);
      if (it && v.mode === 'classic') {
        const b = Math.round(Math.sin(t * 6) * 1.5);
        if (hw) pumpkin(g, hx, hy - 8 + b, true);
        else { P(g, OL, hx - 3, hy - 9 + b, 7, 4); P(g, '#ff3b3b', hx - 2, hy - 8 + b, 5, 2); P(g, OL, hx - 1, hy - 5 + b, 3, 2); P(g, '#ff3b3b', hx, hy - 6 + b, 1, 2); }
      }
      if (it && v.mode === 'bomb') drawBomb(g, hx, hy - 6, t, 0);
      if (it && v.mode === 'hide') { P(g, '#ffe14a', hx + 4, hy + 8, 3, 2); P(g, '#fff6c0', hx + 6, hy + 8, 1, 2); }
      if (p.carry >= 0 && ctf) drawFlag(g, hx + 2, hy - 2, p.carry, t);
      if (f.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; P(g, '#ffe14a', Math.round(p.x + Math.cos(a) * 5), Math.round(hy + 1 + Math.sin(a) * 2)); }
      if (f.frozen > 0) { g.globalAlpha = 0.55; P(g, '#bfe9ff', p.x - 6, p.y - 19, 13, 20); g.globalAlpha = 0.9; P(g, '#ffffff', p.x - 5, p.y - 18, 1, 6); P(g, '#ffffff', p.x - 3, p.y - 18, 3, 1); g.globalAlpha = 1; }
      if (f.shield > 0) { g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 10); g.strokeStyle = '#7dff8a'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y - 7, 11, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if (f.reach > 0) { g.globalAlpha = 0.25; g.strokeStyle = '#ff6b6b'; g.beginPath(); g.arc(p.x, p.y - 2, 22, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if (f.chill > 0 && Math.random() < 0.3) this.parts.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y - 10, vx: 0, vy: 8, life: 0.5, max: 0.5, col: '#cfe8ff', size: 1 });
      if (f.slow > 0 && Math.random() < 0.2) this.parts.push({ x: p.x + (Math.random() - 0.5) * 8, y: p.y - 2, vx: 0, vy: 6, life: 0.4, max: 0.4, col: '#8ad24a', size: 1 });
      if (f.eye > 0 && self) { g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); drawGlyph(g, 'eye', hx - 2, hy - 10, '#ffe08a'); g.globalAlpha = 1; }
      if ((f.haste > 0 || f.dash > 0) && p.m && Math.random() < 0.6) this.parts.push({ x: p.x - p.fdx * 6 + (Math.random() - 0.5) * 6, y: p.y - 4 + (Math.random() - 0.5) * 8, vx: -p.fdx * 30, vy: -p.fdy * 30, life: 0.25, max: 0.25, col: f.dash > 0 ? '#ffd23f' : '#d9ffa0', size: 1 });
      const trail = p.skin && p.skin.trail;
      if (trail && trail !== 'none' && p.m && Math.random() < 0.45) {
        const col = trail === 'rainbow' ? `hsl(${(t * 200) % 360},90%,65%)` : pick2(TRAIL_COL[trail] || ['#fff']);
        this.parts.push({ x: p.x - p.fdx * 5 + (Math.random() - 0.5) * 5, y: p.y - 3 + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 6, vy: trail === 'bubbles' ? -12 : trail === 'leaves' || trail === 'snow' ? 6 : -4, life: 0.7, max: 0.7, col, size: trail === 'hearts' || trail === 'bubbles' ? 2 : 1 });
      } else if (p.m && Math.random() < 0.08) this.parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 10, vy: -5, life: 0.4, max: 0.4, col: win ? '#ffffffaa' : '#c8b89a88', size: 1 });
    };
    const low = ents.filter(p => (p.z || 0) === 0 && !p.stairs), high = ents.filter(p => (p.z || 0) === 1 || p.stairs);
    for (const p of low) drawEnt(p);

    g.globalAlpha = me && me.alive && inHide(me) ? 0.55 : 1;
    g.drawImage(this.layers.over, 0, 0);
    g.globalAlpha = 1;
    if (this.layers.upper) {
      g.globalAlpha = me && underUp(me) && !me.stairs ? 0.4 : 1;
      g.drawImage(this.layers.upper, 0, 0);
      g.globalAlpha = 1;
    }
    for (const p of high) drawEnt(p);

    // flags lying on the ground
    if (ctf && v.flags) for (let tm = 0; tm < 2; tm++) { const f = v.flags[tm]; if (!f.carrier) drawFlag(g, Math.round(f.x), Math.round(f.y), tm, t); }

    // new-year garlands
    if (th === 'newyear' && this.layers.lights.length) {
      const ph = Math.floor(t * 2);
      this.layers.lights.forEach(([lx, ly], i) => { if (lx > cx - 4 && lx < cx + vw + 4 && ly > cy - 4 && ly < cy + vh + 4) P(g, LIGHTS[(i + ph) % LIGHTS.length], lx, ly); });
    }

    for (const fl of this.flames) {
      fl.t -= dt;
      const a = Math.max(0, fl.t / 0.5);
      for (const i of fl.tiles) {
        const px = (i % MW) * TS, py = ((i / MW) | 0) * TS;
        g.globalAlpha = Math.min(1, a * 1.6);
        P(g, '#ff5a1f', px + 1, py + 1, 14, 14); P(g, '#ff9a2a', px + 3, py + 3, 10, 10);
        P(g, Math.random() < 0.5 ? '#ffe36a' : '#fff3b0', px + 5, py + 5, 6, 6);
      }
      g.globalAlpha = 1;
    }
    this.flames = this.flames.filter(f => f.t > 0);

    for (const p of v.players) if (!p.alive && p.ghost) drawGhostSprite(g, p.x, p.y, t, p.id === v.me ? '#fff7d8' : '#e8eef8', p.id === v.me ? 0.7 : 0.5);
    for (const s of v.spirits) drawGhostSprite(g, s.x, s.y + 8, t, '#c9a8ff', 0.75);
    for (const m of v.mobs) {
      const fright = m.s === 1, dead = m.s === 2;
      const flash = fright && v.fright < 2 && Math.floor(t * 8) % 2;
      const col = fright ? (flash ? '#f4f4f4' : '#2d5bff') : MOB_COLS[m.kind];
      const near = me ? [Math.sign(me.x - m.x), Math.sign(me.y - m.y)] : [0, 0];
      drawGhostSprite(g, m.x, m.y + 8, t, col, 0.95, dead, fright ? null : near);
    }

    // names
    g.font = '5px "Press Start 2P", monospace'; g.textAlign = 'center';
    for (const p of ents) {
      if (hiddenFor(p)) continue;
      const self = p.id === v.me;
      const lift = (p.it && (v.mode === 'classic' || v.mode === 'bomb') ? 33 : 25) - (p.fx && p.fx.tiny > 0 ? 7 : 0);
      const ny = Math.round(p.y) - lift;
      let nm = p.name || '';
      if ((v.mode === 'bomber' || v.mode === 'pacman') && p.lives != null && !p.decoy) nm += ' ' + '♥'.repeat(Math.max(0, p.lives));
      g.fillStyle = '#000a'; g.fillText(nm, Math.round(p.x) + 0.5, ny + 0.5);
      g.fillStyle = self ? '#ffd86b' : ctf && p.team >= 0 ? shade(TEAM_COLS[p.team], 0.45) : p.it ? '#ff8a7a' : '#f0ece2';
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

    if (hw) {
      if (Math.random() < dt * 0.3) { const left = Math.random() < 0.5; this.bats.push({ x: left ? cx - 10 : cx + vw + 10, y: cy + Math.random() * vh * 0.6, vx: (left ? 1 : -1) * (40 + Math.random() * 30), ph: Math.random() * 6, life: 12 }); }
      for (const b of this.bats) {
        b.life -= dt; b.x += b.vx * dt; b.y += Math.sin(t * 3 + b.ph) * 0.4;
        const bx = Math.round(b.x), by = Math.round(b.y), up = Math.floor(t * 12 + b.ph) % 2;
        P(g, '#15101c', bx - 1, by, 3, 2); P(g, '#15101c', bx - 4, by - (up ? 1 : -1), 3, 1); P(g, '#15101c', bx + 2, by - (up ? 1 : -1), 3, 1); P(g, '#ff4a3b', bx, by);
      }
      this.bats = this.bats.filter(b => b.life > 0);
    }
    if (map.type === 'magic' && Math.random() < dt * 6) {
      this.parts.push({ x: cx + Math.random() * vw, y: cy + Math.random() * vh, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 2.5, max: 2.5, col: Math.random() < 0.5 ? '#e8ff9a' : '#9ef0e0', size: 1 });
    }

    // darkness: night / fog / blizzard / blindness / hide-and-seek
    const ev = v.event;
    let dark = null;
    const cones = [];
    if (ev === 'night') dark = { col: '6,8,22', a: 0.94, r: me && me.it ? 85 : 68 };
    if (ev === 'fog') dark = { col: '120,126,138', a: 0.82, r: 115 };
    if (ev === 'blizzard') dark = { col: '220,230,240', a: 0.85, r: 95 };
    if (ev === 'spirits' && !dark) dark = { col: '20,10,40', a: 0.6, r: 110 };
    if (v.mode === 'hide' && v.phase === 'play') {
      dark = { col: '3,3,10', a: 0.97, r: me && me.it ? 34 : 44 };
      for (const p of v.players) if (p.alive && p.it) cones.push(p);
      if (me && me.it && v.hideT > 0) dark = { col: '0,0,0', a: 1, r: 0 };
    }
    if (me && me.fx && me.fx.blind > 0) dark = { col: '10,6,16', a: 0.96, r: 36 };
    if (dark) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const d = this.dark.getContext('2d');
      d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H);
      d.fillStyle = `rgba(${dark.col},${dark.a})`; d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      const lights = [];
      if (me && (me.alive || me.ghost) && dark.r) lights.push([me.x, me.y - 6, dark.r]);
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
      if (dark.a < 1) for (const p of cones) {
        const px = (p.x - cx) * z, py = (p.y - 8 - cy) * z, rr = 130 * z, ang = Math.atan2(p.fdy, p.fdx);
        const gr = d.createRadialGradient(px, py, 0, px, py, rr);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gr; d.beginPath(); d.moveTo(px, py); d.arc(px, py, rr, ang - 0.6, ang + 0.6); d.closePath(); d.fill();
        const h2 = d.createRadialGradient(px, py, 0, px, py, 30 * z);
        h2.addColorStop(0, 'rgba(0,0,0,1)'); h2.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = h2; d.fillRect(px - 30 * z, py - 30 * z, 60 * z, 60 * z);
      }
      g.drawImage(this.dark, 0, 0);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (ev === 'frost') { g.fillStyle = 'rgba(170,220,255,0.12)'; g.fillRect(0, 0, W, H); }
    if (ev === 'mirror') { g.fillStyle = 'rgba(200,120,255,0.08)'; g.fillRect(0, 0, W, H); }
    // falling snow
    if (win || ev === 'blizzard') {
      const want = ev === 'blizzard' ? 260 : 90;
      while (this.flakes.length < want) this.flakes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random(), ph: Math.random() * 6 });
      if (this.flakes.length > want) this.flakes.length = want;
      g.fillStyle = '#ffffff';
      const wind = ev === 'blizzard' ? 140 : 15;
      for (const f of this.flakes) {
        f.y += (25 + 30 * f.s) * dt * this.dpr; f.x += (Math.sin(t + f.ph) * 10 + wind) * dt * this.dpr;
        if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
        if (f.x > W) f.x = 0;
        g.globalAlpha = 0.5 + 0.4 * f.s;
        const sz = Math.max(1, Math.round(f.s * this.dpr * 1.5));
        g.fillRect(Math.round(f.x), Math.round(f.y), sz, sz);
      }
      g.globalAlpha = 1;
    }
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

    // edge arrows toward what matters in this mode
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (me && me.alive && v.phase === 'play') {
      const targets = [];
      if (['classic', 'bomb', 'infect'].includes(v.mode)) {
        const list = v.players.filter(p => p.alive && p !== me && !hiddenFor(p) && (me.it ? !p.it : p.it));
        if (me.it) list.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
        for (const p of me.it ? list.slice(0, 1) : list) targets.push([p.x, p.y - 8, me.it ? '#ffd86b' : '#ff4a3b']);
      }
      if (ctf && v.flags && me.team >= 0) {
        const f = me.carry >= 0 ? v.flags[me.team] : v.flags[1 - me.team];
        targets.push(me.carry >= 0 ? [f.hx, f.hy, TEAM_COLS[me.team]] : [f.x, f.y - 8, TEAM_COLS[1 - me.team]]);
      }
      if (v.zone) targets.push([v.zone.x, v.zone.y, '#ffd23f']);
      for (const [x0, y0, col] of targets) {
        const px = (x0 - cx) * z, py = (y0 - cy) * z, m = 28 * this.dpr;
        if (px > m && py > m && px < W - m && py < H - m) continue;
        const ax = Math.max(m, Math.min(W - m, px)), ay = Math.max(m, Math.min(H - m, py));
        g.save(); g.translate(ax, ay); g.rotate(Math.atan2(py - ay, px - ax));
        const s = 4 * this.dpr;
        g.fillStyle = col;
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
    if (this.map.pellets.size) { g.fillStyle = '#ffd9a0'; for (const i of this.map.pellets) g.fillRect((i % MW) * 3 + 1, ((i / MW) | 0) * 3 + 1, 1, 1); }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, c.width, c.height);
    const blindMap = v.event === 'night' || v.event === 'fog' || v.event === 'blizzard' || v.mode === 'hide';
    if (blindMap) { g.fillStyle = 'rgba(0,0,20,.7)'; g.fillRect(0, 0, c.width, c.height); }
    const dot = (x, y, col, s = 3) => { const tx = Math.floor(x / TS) * 3, ty = Math.floor(y / TS) * 3; g.fillStyle = '#000'; g.fillRect(tx - 1, ty - 1, s + 2, s + 2); g.fillStyle = col; g.fillRect(tx, ty, s, s); };
    for (const r of v.runes) { g.fillStyle = RUNES[r.k].col; g.fillRect(Math.floor(r.x / TS) * 3 + 1, Math.floor(r.y / TS) * 3 + 1, 1, 1); }
    if (v.zone) { g.strokeStyle = '#ffd23f'; g.beginPath(); g.arc(v.zone.x / TS * 3, v.zone.y / TS * 3, v.zone.r / TS * 3, 0, Math.PI * 2); g.stroke(); }
    if (v.flags) v.flags.forEach((f, i) => dot(f.x, f.y, TEAM_COLS[i]));
    for (const m of v.mobs) if (m.s !== 2) dot(m.x, m.y, m.s === 1 ? '#2d5bff' : MOB_COLS[m.kind]);
    const me = v.players.find(p => p.id === v.me);
    const reveal = me && me.fx && me.fx.eye > 0;
    for (const p of v.players) {
      if (!p.alive) continue;
      const self = p === me;
      const hidden = (p.fx && p.fx.invis > 0) || isHideT(this.map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)]);
      const mate = v.mode === 'ctf' && me && p.team === me.team;
      if (!self && !reveal && !mate && (hidden || blindMap)) continue;
      dot(p.x, p.y, self ? '#ffd86b' : v.mode === 'ctf' ? TEAM_COLS[p.team] : p.it ? (v.mode === 'infect' ? '#7dff5a' : '#ff3b3b') : p.color);
    }
  }
}
function pick2(a) { return a[Math.floor(Math.random() * a.length)]; }
