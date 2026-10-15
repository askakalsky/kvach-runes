// Tile map: generation, collision, pathfinding fields.
export const TS = 16, MW = 48, MH = 34;
export const T = { GRASS: 0, DIRT: 1, WALL: 2, WATER: 3, BUSH: 4, ICE: 5, TREE: 6, FLOOR: 7, PORTAL: 8 };

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const isSolidT = t => t === T.WALL || t === T.TREE;

export function genMap(seed) {
  const R = rng(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const g = new Uint8Array(MW * MH);
  const inb = (x, y) => x > 0 && y > 0 && x < MW - 1 && y < MH - 1;
  const get = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? T.WALL : g[y * MW + x];
  const set = (x, y, v) => { if (inb(x, y)) g[y * MW + x] = v; };
  const blob = (cx, cy, rad, v) => {
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++)
      for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++)
        if (Math.hypot(x - cx, y - cy) + R() * 0.9 < rad) set(x, y, v);
  };

  for (let i = 0; i < 16; i++) blob(ri(2, MW - 3), ri(2, MH - 3), 1.5 + R() * 3, T.DIRT);
  const lakes = ri(2, 3);
  for (let i = 0; i < lakes; i++) {
    const cx = ri(6, MW - 7), cy = ri(6, MH - 7), r = 2.2 + R() * 2.2;
    blob(cx, cy, r + 1.4, R() < 0.5 ? T.ICE : T.DIRT);
    blob(cx, cy, r, T.WATER);
  }
  blob(ri(8, MW - 9), ri(6, MH - 7), 2.5 + R() * 2, T.ICE);

  const rooms = [];
  for (let i = 0; i < 7 && rooms.length < 5; i++) {
    const w = ri(6, 10), h = ri(5, 8), x0 = ri(2, MW - w - 3), y0 = ri(2, MH - h - 3);
    if (rooms.some(r => x0 < r.x + r.w + 2 && x0 + w + 2 > r.x && y0 < r.y + r.h + 2 && y0 + h + 2 > r.y)) continue;
    rooms.push({ x: x0, y: y0, w, h });
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      set(x, y, edge ? (R() < 0.84 ? T.WALL : T.FLOOR) : T.FLOOR);
    }
    const doors = ri(2, 3);
    for (let d = 0; d < doors; d++) {
      const side = ri(0, 3);
      if (side < 2) { const x = ri(x0 + 1, x0 + w - 3), y = side ? y0 : y0 + h - 1; set(x, y, T.FLOOR); set(x + 1, y, T.FLOOR); }
      else { const y = ri(y0 + 1, y0 + h - 3), x = side === 2 ? x0 : x0 + w - 1; set(x, y, T.FLOOR); set(x, y + 1, T.FLOOR); }
    }
  }

  for (let i = 0; i < 11; i++) {
    const cx = ri(2, MW - 3), cy = ri(2, MH - 3), n = ri(3, 7);
    for (let k = 0; k < n; k++) {
      const x = cx + ri(-2, 2), y = cy + ri(-2, 2), t = get(x, y);
      if (t === T.GRASS || t === T.DIRT) set(x, y, T.BUSH);
    }
  }
  for (let i = 0; i < 50; i++) {
    const x = ri(1, MW - 2), y = ri(1, MH - 2);
    if (get(x, y) !== T.GRASS) continue;
    let ok = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = get(x + dx, y + dy); if (t === T.TREE || t === T.WALL) ok = false; }
    if (ok) set(x, y, T.TREE);
  }
  for (let x = 0; x < MW; x++) { g[x] = T.WALL; g[(MH - 1) * MW + x] = T.WALL; }
  for (let y = 0; y < MH; y++) { g[y * MW] = T.WALL; g[y * MW + MW - 1] = T.WALL; }

  // keep only the largest connected walkable region
  const comp = new Int32Array(MW * MH).fill(-1);
  let best = -1, bestSize = 0, cid = 0;
  for (let i = 0; i < MW * MH; i++) {
    if (comp[i] !== -1 || isSolidT(g[i])) continue;
    const q = [i]; comp[i] = cid; let size = 0;
    while (q.length) {
      const c = q.pop(); size++;
      const cx = c % MW, cy = (c / MW) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const n = ny * MW + nx;
        if (comp[n] === -1 && !isSolidT(g[n])) { comp[n] = cid; q.push(n); }
      }
    }
    if (size > bestSize) { bestSize = size; best = cid; }
    cid++;
  }
  for (let i = 0; i < MW * MH; i++) if (!isSolidT(g[i]) && comp[i] !== best) g[i] = T.TREE;

  const open4 = i => {
    const x = i % MW, y = (i / MW) | 0;
    return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .every(([dx, dy]) => { const t = get(x + dx, y + dy); return !isSolidT(t) && t !== T.WATER; });
  };
  const cand = [];
  for (let i = 0; i < MW * MH; i++) if ((g[i] === T.GRASS || g[i] === T.DIRT) && open4(i)) cand.push(i);
  const portals = [];
  const dist = (a, b) => Math.hypot(a % MW - b % MW, ((a / MW) | 0) - ((b / MW) | 0));
  for (let p = 0; p < 2 && cand.length > 10; p++) {
    const used = portals.flat();
    const far = c => used.every(x => dist(x, c) > 8);
    let a = cand[ri(0, cand.length - 1)];
    for (let k = 0; k < 20 && !far(a); k++) a = cand[ri(0, cand.length - 1)];
    let b = a, bd = 0;
    for (let k = 0; k < 40; k++) {
      const c = cand[ri(0, cand.length - 1)];
      const d = dist(a, c);
      if (d > bd && far(c)) { bd = d; b = c; }
    }
    if (a === b || !far(a)) continue;
    g[a] = T.PORTAL; g[b] = T.PORTAL; portals.push([a, b]);
  }

  const spawns = [], walk = [];
  for (let i = 0; i < MW * MH; i++) {
    const t = g[i];
    if (isSolidT(t) || t === T.WATER || t === T.PORTAL) continue;
    const pt = [(i % MW) * TS + 8, ((i / MW) | 0) * TS + 8];
    walk.push(pt);
    if (t !== T.BUSH) spawns.push(pt);
  }
  return { g, dyn: new Map(), portals, spawns, walk };
}

export function solidIdx(map, i) {
  return isSolidT(map.g[i]) || map.dyn.has(i);
}
export function solidAt(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true;
  return solidIdx(map, ty * MW + tx);
}
export function collides(map, x, y, r) {
  const x0 = Math.floor((x - r) / TS), x1 = Math.floor((x + r) / TS);
  const y0 = Math.floor((y - r) / TS), y1 = Math.floor((y + r) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty)) return true;
  return false;
}
export function tileIdx(x, y) {
  const tx = Math.max(0, Math.min(MW - 1, Math.floor(x / TS)));
  const ty = Math.max(0, Math.min(MH - 1, Math.floor(y / TS)));
  return ty * MW + tx;
}
export function tileAt(map, x, y) { return map.g[tileIdx(x, y)]; }

const Q = new Int32Array(MW * MH);
// Multi-source BFS distance field (in tiles), -1 = unreachable.
export function bfs(map, sources, out) {
  out.fill(-1);
  let h = 0, t = 0;
  for (const s of sources) if (out[s] === -1) { out[s] = 0; Q[t++] = s; }
  while (h < t) {
    const c = Q[h++], cx = c % MW, cy = (c / MW) | 0, d = out[c] + 1;
    if (cx > 0) { const n = c - 1; if (out[n] === -1 && !solidIdx(map, n)) { out[n] = d; Q[t++] = n; } }
    if (cx < MW - 1) { const n = c + 1; if (out[n] === -1 && !solidIdx(map, n)) { out[n] = d; Q[t++] = n; } }
    if (cy > 0) { const n = c - MW; if (out[n] === -1 && !solidIdx(map, n)) { out[n] = d; Q[t++] = n; } }
    if (cy < MH - 1) { const n = c + MW; if (out[n] === -1 && !solidIdx(map, n)) { out[n] = d; Q[t++] = n; } }
  }
  return out;
}
