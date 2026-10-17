// Tile map: generation (many layouts), collision with two floors, pathfinding fields.
export const TS = 16, MW = 48, MH = 34;
export const T = {
  GRASS: 0, DIRT: 1, WALL: 2, WATER: 3, BUSH: 4, ICE: 5, TREE: 6, FLOOR: 7, PORTAL: 8,
  HEDGE: 9, ROAD: 10, BRIDGE: 11, TOMB: 12, WHEAT: 13, DECOR: 14, SAND: 15, MUSH: 16, STAIRS: 17, VOID: 18,
};
export const BOMBER_MAPS = { arena: 'Классика', cross: 'Крест', ring: 'Кольцо' };
export const MAP_TYPES = {
  meadow: 'Луг', village: 'Деревня', maze: 'Лабиринт', islands: 'Острова', graveyard: 'Кладбище',
  beach: 'Пляж', magic: 'Волшебный лес', fort: 'Двухэтажная крепость',
};
// arena bounds (bomberman)
export const ARENA = { x0: 8, y0: 5, x1: 40, y1: 27 };

const SOLID = new Uint8Array(32);
for (const t of [T.WALL, T.TREE, T.HEDGE, T.TOMB, T.DECOR, T.VOID]) SOLID[t] = 1;
export const isSolidT = t => SOLID[t] === 1;
export const isHideT = t => t === T.BUSH || t === T.WHEAT;

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeCtx(seed) {
  const R = rng(seed);
  const g = new Uint8Array(MW * MH);
  const c = {
    R, g, up: new Uint8Array(MW * MH), lvl: new Uint8Array(MW * MH), stair: new Int8Array(MW * MH).fill(-1), stairD: new Uint8Array(MW * MH), deco: new Uint8Array(MW * MH), fstyle: new Uint8Array(MW * MH), fp: new Uint8Array(MW * MH),
    ri: (a, b) => a + Math.floor(R() * (b - a + 1)),
    inb: (x, y) => x > 0 && y > 0 && x < MW - 1 && y < MH - 1,
    get: (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? T.WALL : g[y * MW + x],
    set: (x, y, v) => { if (c.inb(x, y)) g[y * MW + x] = v; },
    fill: (x0, y0, w, h, v, only) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (only == null || only.includes(c.get(x, y))) c.set(x, y, v); },
    blob: (cx, cy, rad, v, only) => {
      for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++)
        for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++)
          if (Math.hypot(x - cx, y - cy) + R() * 0.9 < rad && (only == null || only.includes(c.get(x, y)))) c.set(x, y, v);
    },
    okRect: (x0, y0, w, h, allowed = [T.GRASS, T.DIRT]) => {
      for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (!allowed.includes(c.get(x, y))) return false;
      return true;
    },
    room: (x0, y0, w, h, keep = 0.84) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
        c.set(x, y, edge ? (R() < keep ? T.WALL : T.FLOOR) : T.FLOOR);
      }
      const doors = c.ri(2, 3);
      for (let d = 0; d < doors; d++) {
        const side = c.ri(0, 3);
        if (side < 2) { const x = c.ri(x0 + 1, x0 + w - 3), y = side ? y0 : y0 + h - 1; c.set(x, y, T.FLOOR); c.set(x + 1, y, T.FLOOR); }
        else { const y = c.ri(y0 + 1, y0 + h - 3), x = side === 2 ? x0 : x0 + w - 1; c.set(x, y, T.FLOOR); c.set(x, y + 1, T.FLOOR); }
      }
    },
    free8: (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isSolidT(c.get(x + dx, y + dy))) return false;
      return true;
    },
    scatter: (n, v, on) => {
      for (let i = 0; i < n * 4 && n > 0; i++) {
        const x = c.ri(1, MW - 2), y = c.ri(1, MH - 2);
        if (!on.includes(c.get(x, y)) || !c.free8(x, y) || c.up[y * MW + x]) continue;
        c.set(x, y, v); n--;
      }
    },
    bushes: (n, on = [T.GRASS, T.DIRT]) => {
      for (let i = 0; i < n; i++) {
        const cx = c.ri(2, MW - 3), cy = c.ri(2, MH - 3), k = c.ri(3, 7);
        for (let j = 0; j < k; j++) { const x = cx + c.ri(-2, 2), y = cy + c.ri(-2, 2); if (on.includes(c.get(x, y))) c.set(x, y, T.BUSH); }
      }
    },
  };
  return c;
}

function genMeadow(c) {
  const { ri, R, blob } = c;
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
    c.room(x0, y0, w, h);
  }
  c.bushes(11);
  c.scatter(50, T.TREE, [T.GRASS]);
}

function genVillage(c) {
  const { ri, R, blob } = c;
  for (let i = 0; i < 8; i++) blob(ri(2, MW - 3), ri(2, MH - 3), 1.5 + R() * 2, T.DIRT);
  const rows = [], cols = [];
  for (let y = ri(4, 6); y < MH - 4; y += ri(8, 10)) rows.push(y);
  for (let x = ri(5, 8); x < MW - 4; x += ri(10, 13)) cols.push(x);
  for (const y of rows) c.fill(1, y, MW - 2, 2, T.ROAD);
  for (const x of cols) c.fill(x, 1, 2, MH - 2, T.ROAD);
  let houses = 0;
  for (let i = 0; i < 80 && houses < 9; i++) {
    const w = ri(5, 8), h = ri(4, 6), x0 = ri(2, MW - w - 2), y0 = ri(2, MH - h - 2);
    if (!c.okRect(x0, y0, w, h)) continue;
    c.room(x0, y0, w, h, 0.95); houses++;
  }
  for (let i = 0, f = 0; i < 60 && f < 6; i++) {
    const w = ri(3, 6), h = ri(2, 4), x0 = ri(2, MW - w - 2), y0 = ri(2, MH - h - 2);
    if (!c.okRect(x0, y0, w, h)) continue;
    c.fill(x0, y0, w, h, T.WHEAT); f++;
  }
  blob(ri(8, MW - 9), ri(6, MH - 7), 1.8 + R(), T.WATER, [T.GRASS, T.DIRT]);
  c.bushes(6);
  c.scatter(28, T.TREE, [T.GRASS]);
}

function carveMaze(c, step, loops, wall, floor) {
  const { ri, R, g } = c;
  g.fill(wall);
  const span = step + 1, CW = Math.floor((MW - 2) / span), CH = Math.floor((MH - 2) / span);
  const cell = (cx, cy) => [1 + cx * span, 1 + cy * span];
  const open = (cx, cy) => { const [x, y] = cell(cx, cy); c.fill(x, y, step, step, floor); };
  const carve = (ax, ay, bx, by) => {
    const [x, y] = cell(ax, ay);
    if (bx > ax) c.fill(x + step, y, 1, step, floor);
    if (bx < ax) c.fill(x - 1, y, 1, step, floor);
    if (by > ay) c.fill(x, y + step, step, 1, floor);
    if (by < ay) c.fill(x, y - 1, step, 1, floor);
  };
  const seen = new Uint8Array(CW * CH);
  const stack = [[ri(0, CW - 1), ri(0, CH - 1)]];
  seen[stack[0][1] * CW + stack[0][0]] = 1; open(...stack[0]);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < CW && ny < CH && !seen[ny * CW + nx]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[ri(0, nb.length - 1)];
    seen[ny * CW + nx] = 1; open(nx, ny); carve(x, y, nx, ny); stack.push([nx, ny]);
  }
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    if (cx < CW - 1 && R() < loops) carve(cx, cy, cx + 1, cy);
    if (cy < CH - 1 && R() < loops) carve(cx, cy, cx, cy + 1);
  }
  return { CW, CH, cell };
}

function genMaze(c) {
  const { ri, R } = c;
  carveMaze(c, 2, 0.2, T.HEDGE, T.GRASS);
  for (let i = 0; i < 4; i++) { const w = ri(4, 6), h = ri(4, 5); c.fill(ri(2, MW - w - 2), ri(2, MH - h - 2), w, h, T.GRASS); }
  for (let i = 0; i < 2; i++) c.blob(ri(6, MW - 7), ri(5, MH - 6), 2 + R() * 1.5, T.ICE, [T.GRASS, T.DIRT]);
  c.blob(ri(6, MW - 7), ri(5, MH - 6), 1.6, T.WATER, [T.GRASS, T.DIRT]);
  c.bushes(10, [T.GRASS]);
}

function genIslands(c) {
  const { ri, R, g, blob } = c;
  g.fill(T.WATER);
  const isl = [];
  for (let i = 0; i < 40 && isl.length < 9; i++) {
    const x = ri(5, MW - 6), y = ri(5, MH - 6);
    if (isl.some(p => Math.hypot(p[0] - x, p[1] - y) < 9)) continue;
    isl.push([x, y, 2.8 + R() * 2.8]);
  }
  for (const [x, y, r] of isl) blob(x, y, r + 1.2, T.SAND);
  for (const [x, y, r] of isl) blob(x, y, r, T.GRASS);
  bridges(c, isl);
  for (let i = 0; i < 4; i++) blob(ri(3, MW - 4), ri(3, MH - 4), 1.5 + R() * 1.5, T.ICE, [T.WATER]);
  c.bushes(7, [T.GRASS]);
  c.scatter(30, T.TREE, [T.GRASS]);
}

function bridges(c, pts) {
  const inT = [0];
  while (inT.length < pts.length) {
    let best = null, bd = 1e9;
    for (const a of inT) for (let b = 0; b < pts.length; b++) {
      if (inT.includes(b)) continue;
      const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
      if (d < bd) { bd = d; best = [a, b]; }
    }
    inT.push(best[1]);
    const [ax, ay] = pts[best[0]], [bx, by] = pts[best[1]];
    const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
    for (let x = ax; sx && x !== bx + sx; x += sx) for (let k = 0; k < 2; k++) if (c.get(x, ay + k) === T.WATER) c.set(x, ay + k, T.BRIDGE);
    for (let y = ay; sy && y !== by + sy; y += sy) for (let k = 0; k < 2; k++) if (c.get(bx + k, y) === T.WATER) c.set(bx + k, y, T.BRIDGE);
  }
}

function genGraveyard(c) {
  const { ri, R, blob } = c;
  for (let i = 0; i < 14; i++) blob(ri(2, MW - 3), ri(2, MH - 3), 1.2 + R() * 2.2, T.DIRT);
  for (let n = 0; n < 2; n++) { const w = ri(6, 9), h = ri(5, 7); c.room(ri(3, MW - w - 3), ri(3, MH - h - 3), w, h, 0.75); }
  for (let k = 0; k < 7; k++) {
    const x0 = ri(2, MW - 14), y0 = ri(2, MH - 8), rows = ri(2, 3), cols = ri(3, 6);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const x = x0 + q * 2, y = y0 + r * 3, t = c.get(x, y);
      if ((t === T.GRASS || t === T.DIRT) && R() < 0.85 && c.free8(x, y)) c.set(x, y, T.TOMB);
    }
  }
  blob(ri(8, MW - 9), ri(6, MH - 7), 2 + R(), T.WATER, [T.GRASS, T.DIRT]);
  c.bushes(7);
  c.scatter(30, T.TREE, [T.GRASS]);
  c.scatter(10, T.DECOR, [T.GRASS, T.DIRT]);
}

function genBeach(c) {
  const { ri, R, g, blob } = c;
  const shore = [];
  for (let y = 0; y < MH; y++) {
    const s = Math.round(MW * 0.6 + Math.sin(y * 0.35 + 1.3) * 2.5 + Math.sin(y * 0.11) * 2 + R());
    shore.push(s);
    for (let x = 0; x < MW; x++) g[y * MW + x] = x >= s ? T.WATER : x >= s - 7 ? T.SAND : T.GRASS;
  }
  for (let i = 0; i < 8; i++) blob(ri(2, MW * 0.45), ri(2, MH - 3), 1.5 + R() * 2, T.DIRT, [T.GRASS]);
  for (let i = 0; i < 3; i++) blob(ri(Math.floor(MW * 0.74), MW - 5), ri(4, MH - 5), 1.6 + R() * 1.2, T.SAND, [T.WATER]);
  for (let k = 0; k < 3; k++) {
    const y = ri(3, MH - 5), x0 = shore[y];
    const len = ri(5, 9);
    for (let x = x0 - 1; x < x0 + len; x++) for (let j = 0; j < 2; j++) if (c.get(x, y + j) === T.WATER) c.set(x, y + j, T.BRIDGE);
  }
  for (let i = 0, n = 0; i < 60 && n < 3; i++) {
    const w = ri(5, 7), h = ri(4, 5), x0 = ri(2, MW - w - 2), y0 = ri(2, MH - h - 2);
    if (!c.okRect(x0, y0, w, h, [T.GRASS, T.DIRT, T.SAND])) continue;
    c.room(x0, y0, w, h, 0.95); n++;
  }
  c.bushes(6, [T.GRASS]);
  c.scatter(36, T.TREE, [T.SAND, T.GRASS]);
  c.scatter(12, T.DECOR, [T.SAND]);
}

function genMagic(c) {
  const { ri, R, g, blob } = c;
  for (let i = 0; i < 6; i++) blob(ri(2, MW - 3), ri(2, MH - 3), 1.5 + R() * 2, T.DIRT);
  const clear = [];
  for (let i = 0; i < 7; i++) clear.push([ri(4, MW - 5), ri(4, MH - 5), 3 + R() * 2.5]);
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (clear.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r)) continue;
    if (g[y * MW + x] === T.GRASS && R() < 0.2) g[y * MW + x] = T.TREE;
  }
  for (let i = 0; i < 2; i++) { const [cx, cy] = clear[i]; blob(cx, cy, 1.8 + R(), T.WATER); }
  for (let i = 0; i < 45; i++) { const x = ri(1, MW - 2), y = ri(1, MH - 2); if (c.get(x, y) === T.GRASS) c.set(x, y, T.MUSH); }
  c.bushes(9, [T.GRASS]);
  c.scatter(12, T.DECOR, [T.GRASS, T.DIRT]);
}

// Four-storey building: the same footprint on every floor, floor 1 stands on the ground.
// Floor z lives in its own tile layer (c.fl[z]; layer 0 is the terrain array g itself).
// Stairwells link floor lo with lo+1 and exist as STAIRS tiles on both layers.
export const FP = [7, 4, 34, 26];       // x, y, w, h of the building
export const FLOORS = 4;
export const DECO = { NONE: 0, BRAZIER: 1, BARREL: 2, TABLE: 3, STATUE: 4, CHEST: 5, THRONE: 6, BOOKS: 7 };
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // uphill direction index: 0 +x, 1 +y, 2 -x, 3 -y

function genFort(c) {
  const { ri, R, g } = c;
  const [fx, fy, fw, fh] = FP;
  for (let i = 0; i < 9; i++) c.blob(ri(2, MW - 3), ri(2, MH - 3), 1.3 + R() * 2, T.DIRT);
  const layers = [g];
  for (let z = 1; z < FLOORS; z++) layers.push(new Uint8Array(MW * MH).fill(T.VOID));
  c.fl = layers;
  c.rs = layers.map(() => new Uint8Array(MW * MH));
  c.decoL = layers.map(() => new Uint8Array(MW * MH));
  const fp = c.fp, inFp = (x, y) => x >= fx && x < fx + fw && y >= fy && y < fy + fh;
  for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) fp[y * MW + x] = 1;
  const inner = (x, y) => x > fx && x < fx + fw - 1 && y > fy && y < fy + fh - 1;

  // ---- stairwells (two per floor transition, kept apart)
  const wells = [];
  for (let lo = 0; lo < FLOORS - 1; lo++) for (let k = 0; k < 2; k++) {
    for (let tries = 0; tries < 800; tries++) {
      const d = ri(0, 3), [dx, dy] = DIRS[d], px = -dy, py = dx;               // uphill and perpendicular
      const cx = ri(fx + 5, fx + fw - 7), cy = ri(fy + 5, fy + fh - 7);
      const cells = [];
      for (let r = -1; r <= 1; r++) for (let i = -1; i <= 2; i++) cells.push([cx + dx * r + px * i, cy + dy * r + py * i]);
      if (!cells.every(([x, y]) => inner(x, y))) continue;
      if (wells.some(w => Math.hypot(w.cx - cx, w.cy - cy) < 10 - Math.floor(tries / 160) * 2)) continue;
      wells.push({ lo, d, cx, cy, dx, dy, px, py });
      break;
    }
  }
  const stamp = (layer, z, w, set) => {
    // clear a generous room around the well, then build the stairwell
    for (let r = -2; r <= 2; r++) for (let i = -2; i <= 3; i++) { const x = w.cx + w.dx * r + w.px * i, y = w.cy + w.dy * r + w.py * i; if (inner(x, y)) layer[y * MW + x] = T.FLOOR; }
    set();
  };
  // ---- per floor: rooms by recursive splitting, then wells, furniture, connectivity
  for (let z = 0; z < FLOORS; z++) {
    const L = layers[z], rs = c.rs[z], dl = c.decoL[z];
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) { const i = y * MW + x; L[i] = (x === fx || y === fy || x === fx + fw - 1 || y === fy + fh - 1) ? T.WALL : T.FLOOR; }
    const leaves = [];
    const split = (x, y, w, h, depth) => {
      const canV = w >= 13, canH = h >= 11;
      if (depth > 4 || (!canV && !canH) || (depth > 2 && R() < 0.22)) { leaves.push([x, y, w, h]); return; }
      const vert = canV && (!canH || w / h > 1.25 || (w / h > 0.8 && R() < 0.5));
      if (vert) {
        const s = ri(x + 5, x + w - 6);
        split(x, y, s - x, h, depth + 1); split(s + 1, y, x + w - s - 1, h, depth + 1);
        for (let yy = y; yy < y + h; yy++) L[yy * MW + s] = T.WALL;
        for (let d2 = 0, n = h > 14 ? 2 : 1; d2 < n; d2++) { const dyy = ri(y + 1, y + h - 3); L[dyy * MW + s] = T.FLOOR; L[(dyy + 1) * MW + s] = T.FLOOR; }
      } else {
        const s = ri(y + 4, y + h - 5);
        split(x, y, w, s - y, depth + 1); split(x, s + 1, w, y + h - s - 1, depth + 1);
        for (let xx = x; xx < x + w; xx++) L[s * MW + xx] = T.WALL;
        for (let d2 = 0, n = w > 18 ? 2 : 1; d2 < n; d2++) { const dxx = ri(x + 1, x + w - 3); L[s * MW + dxx] = T.FLOOR; L[s * MW + dxx + 1] = T.FLOOR; }
      }
    };
    split(fx + 1, fy + 1, fw - 2, fh - 2, 0);
    leaves.forEach(([x, y, w, h], k) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) rs[yy * MW + xx] = (k + z * 2) % 5; });
    for (let i = 0; i < MW * MH; i++) if (L[i] === T.FLOOR && fp[i] && !rs[i]) { const n = [i - 1, i + 1, i - MW, i + MW].find(j => L[j] === T.FLOOR && rs[j]); if (n !== undefined) rs[i] = rs[n]; }
    // stairwells touching this floor
    for (const w of wells) {
      if (w.lo !== z && w.lo + 1 !== z) continue;
      const up = w.lo === z;                                          // true: this floor holds the climbing side
      stamp(L, z, w, () => {
        for (let r = -1; r <= 1; r++) for (let i = -1; i <= 2; i++) {
          const x = w.cx + w.dx * r + w.px * i, y = w.cy + w.dy * r + w.py * i, idx = y * MW + x;
          if (i === -1 || i === 2) L[idx] = T.WALL;                  // side walls on both floors
          else if (r === 0) { L[idx] = T.STAIRS; c.stair[idx] = w.lo; c.stairD[idx] = w.d; }
          else if (r === -1) L[idx] = up ? T.FLOOR : T.WALL;         // foot of the stairs
          else L[idx] = up ? T.WALL : T.FLOOR;                       // top of the stairs
          rs[idx] = rs[idx] || 1;
        }
      });
    }
    // furniture
    const free8 = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = L[(y + dy) * MW + x + dx]; if (t !== T.FLOOR) return false; } return true; };
    const wellNear = (x, y) => wells.some(w => (w.lo === z || w.lo + 1 === z) && Math.abs(x - w.cx) <= 4 && Math.abs(y - w.cy) <= 4);
    const put = (x, y, kind) => { const i = y * MW + x; if (!inner(x, y) || wellNear(x, y) || !free8(x, y)) return false; L[i] = T.DECOR; dl[i] = kind; return true; };
    let bigRoom = -1, bigArea = 0;
    leaves.forEach(([x, y, w, h], k) => {
      if (w * h > bigArea) { bigArea = w * h; bigRoom = k; }
      // braziers in two corners of every room
      put(x + 1, y + 1, DECO.BRAZIER); put(x + w - 2, y + h - 2, DECO.BRAZIER);
      const n = Math.floor(w * h / 22);
      for (let q = 0; q < n * 3 && n > 0; q++) {
        const px = ri(x + 1, x + w - 2), py = ri(y + 1, y + h - 2), r = R();
        put(px, py, r < 0.3 ? DECO.BARREL : r < 0.5 ? DECO.CHEST : r < 0.7 ? DECO.TABLE : r < 0.85 ? DECO.BOOKS : DECO.STATUE);
      }
    });
    if (z === FLOORS - 1 && bigRoom >= 0) { const [x, y, w] = leaves[bigRoom]; const ti = (y + 1) * MW + x + (w >> 1); if (L[ti] === T.FLOOR) { L[ti] = T.DECOR; dl[ti] = DECO.THRONE; } }
    // ground floor: entrances in the outer wall, every side
    if (z === 0) {
      for (const side of [0, 1, 2, 3]) {
        const n = side < 2 ? 2 : 1;
        for (let d2 = 0; d2 < n; d2++) {
          if (side === 0) { const x = ri(fx + 3, fx + fw - 5); for (let k = 0; k < 2; k++) { L[fy * MW + x + k] = T.FLOOR; L[(fy + 1) * MW + x + k] = T.FLOOR; } }
          else if (side === 1) { const x = ri(fx + 3, fx + fw - 5); for (let k = 0; k < 2; k++) { L[(fy + fh - 1) * MW + x + k] = T.FLOOR; L[(fy + fh - 2) * MW + x + k] = T.FLOOR; } }
          else if (side === 2) { const y = ri(fy + 3, fy + fh - 5); for (let k = 0; k < 2; k++) { L[(y + k) * MW + fx] = T.FLOOR; L[(y + k) * MW + fx + 1] = T.FLOOR; } }
          else { const y = ri(fy + 3, fy + fh - 5); for (let k = 0; k < 2; k++) { L[(y + k) * MW + fx + fw - 1] = T.FLOOR; L[(y + k) * MW + fx + fw - 2] = T.FLOOR; } }
        }
      }
    }
    // everything walkable on this floor must be one connected area: wall off islands
    const seeds = []; for (let i = 0; i < MW * MH; i++) if (fp[i] && L[i] === T.STAIRS) { seeds.push(i); break; }
    if (!seeds.length) for (let i = 0; i < MW * MH; i++) if (fp[i] && L[i] === T.FLOOR) { seeds.push(i); break; }
    const seen = new Uint8Array(MW * MH), q = [...seeds];
    q.forEach(i => seen[i] = 1);
    while (q.length) { const i = q.pop(); for (const j of [i - 1, i + 1, i - MW, i + MW]) if (!seen[j] && fp[j] && (L[j] === T.FLOOR || L[j] === T.STAIRS)) { seen[j] = 1; q.push(j); } }
    for (let i = 0; i < MW * MH; i++) if (fp[i] && (L[i] === T.FLOOR || L[i] === T.STAIRS) && !seen[i]) { L[i] = T.WALL; c.stair[i] = -1; }
  }
  c.bushes(7);
  c.scatter(22, T.TREE, [T.GRASS]);
}

function genPacman(c) {
  const { g } = c;
  carveMaze(c, 1, 0.34, T.WALL, T.GRASS);
  // ghost house in the middle
  const hx = 21, hy = 13;
  c.fill(hx - 2, hy - 2, 11, 9, T.GRASS);
  c.fill(hx, hy, 7, 5, T.WALL);
  c.fill(hx + 1, hy + 1, 5, 3, T.FLOOR);
  c.set(hx + 3, hy, T.FLOOR);
  const pellets = [], power = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (g[y * MW + x] !== T.GRASS) continue;
    if (x >= hx - 2 && x <= hx + 8 && y >= hy - 2 && y <= hy + 6) continue;
    pellets.push(y * MW + x);
  }
  for (const [x, y] of [[1, 1], [MW - 4, 1], [1, MH - 4], [MW - 4, MH - 4]]) {
    let best = -1, bd = 1e9;
    for (const i of pellets) { const d = Math.hypot(i % MW - x, ((i / MW) | 0) - y); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) power.push(best);
  }
  return { pellets, power, home: [(hx + 3) * TS + 8, (hy + 2) * TS + 8], door: [(hx + 3) * TS + 8, (hy - 1) * TS + 8] };
}

// Hotline-style building: BSP-split rooms with doorways, coloured floors, furniture
function genNeon(c) {
  const { ri, R, g } = c;
  g.fill(T.WALL);
  const room = new Uint8Array(MW * MH);
  const leaves = [];
  const split = (x, y, w, h, depth) => {
    const canV = w >= 14, canH = h >= 11;
    if (depth > 4 || (!canV && !canH) || (depth > 2 && R() < 0.2)) { leaves.push([x, y, w, h]); return; }
    const vert = canV && (!canH || w / h > 1.2 || (w / h > 0.8 && R() < 0.5));
    if (vert) {
      const s = ri(x + 6, x + w - 7);
      split(x, y, s - x, h, depth + 1); split(s + 1, y, x + w - s - 1, h, depth + 1);
      const doors = h > 14 ? 2 : 1;
      for (let d = 0; d < doors; d++) { const dy = ri(y + 1, y + h - 3); c.set(s, dy, T.FLOOR); c.set(s, dy + 1, T.FLOOR); }
    } else {
      const s = ri(y + 5, y + h - 6);
      split(x, y, w, s - y, depth + 1); split(x, s + 1, w, y + h - s - 1, depth + 1);
      const doors = w > 18 ? 2 : 1;
      for (let d = 0; d < doors; d++) { const dx = ri(x + 1, x + w - 3); c.set(dx, s, T.FLOOR); c.set(dx + 1, s, T.FLOOR); }
    }
  };
  split(1, 1, MW - 2, MH - 2, 0);
  leaves.forEach(([x, y, w, h], k) => {
    const style = k % 5;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { c.set(xx, yy, T.FLOOR); room[yy * MW + xx] = style; }
  });
  // doorway tiles take the style of a neighbouring room
  for (let i = 0; i < MW * MH; i++) if (g[i] === T.FLOOR && room[i] === 0) { const n = [i - 1, i + 1, i - MW, i + MW].find(j => g[j] === T.FLOOR && room[j]); if (n !== undefined) room[i] = room[n]; }
  // furniture and pillars
  for (const [x, y, w, h] of leaves) {
    const n = Math.floor(w * h / 30);
    for (let k = 0; k < n; k++) {
      const fx = ri(x + 1, x + w - 2), fy = ri(y + 1, y + h - 2);
      if (c.free8(fx, fy) && g[fy * MW + fx] === T.FLOOR) c.set(fx, fy, R() < 0.25 ? T.WALL : T.DECOR);
    }
  }
  return room;
}

// bomberman arenas: classic grid, a cross-shaped one, and a ring around a solid fortress
function genArena(c, variant = 'arena') {
  const { R, g } = c;
  g.fill(T.TREE);
  const { x0, y0, x1, y1 } = ARENA, cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  const inRegion = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    if (variant === 'cross') return Math.abs(y - cy) <= 4 || Math.abs(x - cx) <= 4;
    return true;
  };
  const block = (x, y) => variant === 'ring' && Math.abs(x - cx) <= 7 && Math.abs(y - cy) <= 4;
  const crates = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inRegion(x, y)) continue;
    const i = y * MW + x;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inRegion(x + dx, y + dy));
    if (edge || block(x, y)) { g[i] = T.WALL; continue; }
    if ((x - x0) % 2 === 0 && (y - y0) % 2 === 0) { g[i] = T.WALL; continue; }
    g[i] = T.GRASS;
    if (R() < (variant === 'arena' ? 0.6 : 0.56)) crates.push(i);
  }
  return crates;
}

// sudden-death order for the arena: outer ring first, spiralling inward
export function arenaSpiral(map) {
  const out = [];
  let x0 = ARENA.x0 + 1, y0 = ARENA.y0 + 1, x1 = ARENA.x1 - 1, y1 = ARENA.y1 - 1;
  const add = (x, y) => { if (((x - ARENA.x0) % 2 || (y - ARENA.y0) % 2) && (!map || !isSolidT(map.g[y * MW + x]))) out.push(y * MW + x); };
  while (x0 < x1 - 2 && y0 < y1 - 2) {
    for (let x = x0; x <= x1; x++) add(x, y0);
    for (let y = y0 + 1; y <= y1; y++) add(x1, y);
    for (let x = x1 - 1; x >= x0; x--) add(x, y1);
    for (let y = y1 - 1; y > y0; y--) add(x0, y);
    x0++; y0++; x1--; y1--;
  }
  return out;
}

export const isWinter = theme => theme === 'winter' || theme === 'newyear';

// capture-the-flag bases: clear a yard and carve a path toward the centre
function carveBases(c) {
  const bases = [[4, MH >> 1], [MW - 5, MH >> 1]];
  for (const [bx, by] of bases) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { c.set(bx + dx, by + dy, T.GRASS); c.up[(by + dy) * MW + bx + dx] = 0; c.lvl[(by + dy) * MW + bx + dx] = 0; }
    const sx = bx < MW / 2 ? 1 : -1;
    let run = 0;
    for (let x = bx + 3 * sx; x > 1 && x < MW - 2 && run < 6; x += sx) {
      const open = [0, 1].every(k => { const t = c.get(x, by + k); return !isSolidT(t); });
      run = open ? run + 1 : 0;
      for (let k = 0; k < 2; k++) if (isSolidT(c.get(x, by + k))) c.set(x, by + k, T.GRASS);
    }
  }
  return bases.map(([x, y]) => [x * TS + 8, y * TS + 8]);
}

export function genMap(seed, type = 'meadow', theme = '', mode = '', variant = 'arena') {
  const c = makeCtx(seed), g = c.g;
  let bases = null;
  let crates = [], pac = null, room = null;
  if (type === 'arena') crates = genArena(c, variant);
  else if (type === 'pacman') pac = genPacman(c);
  else if (type === 'neon') room = genNeon(c);
  else {
    ({ village: genVillage, maze: genMaze, islands: genIslands, graveyard: genGraveyard, beach: genBeach, magic: genMagic, fort: genFort }[type] || genMeadow)(c);
    if (theme === 'halloween') { c.scatter(12, T.DECOR, [T.GRASS, T.DIRT]); c.scatter(6, T.TOMB, [T.GRASS]); }
    if (isWinter(theme)) {
      c.scatter(8, T.DECOR, [T.GRASS, T.DIRT]);
      for (let i = 0; i < MW * MH; i++) {
        if (g[i] !== T.WATER) continue;
        const x = i % MW, y = (i / MW) | 0;
        const edge = [c.get(x + 1, y), c.get(x - 1, y), c.get(x, y + 1), c.get(x, y - 1)].some(t => t !== T.WATER && t !== T.ICE);
        if (edge || c.R() < 0.65) g[i] = T.ICE;
      }
    }
  }
  if (mode === 'ctf' && type !== 'arena' && type !== 'pacman') bases = carveBases(c);
  if (type !== 'arena') {
    for (let x = 0; x < MW; x++) { g[x] = T.WALL; g[(MH - 1) * MW + x] = T.WALL; }
    for (let y = 0; y < MH; y++) { g[y * MW] = T.WALL; g[y * MW + MW - 1] = T.WALL; }
    keepLargestRegion(g);
  }

  const portals = [];
  if (type === 'pacman') {
    // wrap-around tunnel on the left and right edge
    for (const y of [7, MH - 9]) {
      let a = -1, b = -1;
      for (let x = 1; x < MW / 2 && a < 0; x++) if (g[y * MW + x] === T.GRASS) a = y * MW + x;
      for (let x = MW - 2; x > MW / 2 && b < 0; x--) if (g[y * MW + x] === T.GRASS) b = y * MW + x;
      if (a >= 0 && b >= 0) { g[a] = T.PORTAL; g[b] = T.PORTAL; portals.push([a, b]); }
    }
  } else if (type !== 'arena' && type !== 'neon') {
    const open8 = i => {
      const x = i % MW, y = (i / MW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = c.get(x + dx, y + dy); if (isSolidT(t) || t === T.WATER || t === T.STAIRS) return false; }
      return !c.up[i];
    };
    const cand = [];
    for (let i = 0; i < MW * MH; i++) if ([T.GRASS, T.DIRT, T.ROAD, T.SAND].includes(g[i]) && open8(i)) cand.push(i);
    const dist = (a, b) => Math.hypot(a % MW - b % MW, ((a / MW) | 0) - ((b / MW) | 0));
    const pairs = type === 'magic' ? 4 : 2;
    for (let p = 0; p < pairs && cand.length > 10; p++) {
      const used = portals.flat(), far = q => used.every(x => dist(x, q) > 7);
      let a = cand[c.ri(0, cand.length - 1)];
      for (let k = 0; k < 20 && !far(a); k++) a = cand[c.ri(0, cand.length - 1)];
      let b = a, bd = 0;
      for (let k = 0; k < 40; k++) { const q = cand[c.ri(0, cand.length - 1)], d = dist(a, q); if (d > bd && far(q)) { bd = d; b = q; } }
      if (a === b || !far(a)) continue;
      g[a] = T.PORTAL; g[b] = T.PORTAL; portals.push([a, b]);
    }
  }

  const belt = new Int8Array(MW * MH).fill(-1);
  if (type !== 'arena' && type !== 'pacman' && type !== 'neon') genBelts(c, belt, type === 'maze' ? 4 : 7);

  const torches = [];
  const fl = c.fl || [g], decoL = c.decoL || [c.deco], rs = c.rs || [new Uint8Array(MW * MH)];
  fl.forEach((L, z) => { for (let i = 0; i < MW * MH; i++) if (L[i] === T.DECOR && decoL[z][i] === 1) torches.push([(i % MW) * TS + 8, ((i / MW) | 0) * TS + 8, z]); });
  const crateSet = new Set(crates);
  const spawns = [], walk = [], hides = [];
  for (let i = 0; i < MW * MH; i++) {
    const t = g[i];
    if (isSolidT(t) || t === T.WATER || t === T.PORTAL || t === T.STAIRS || belt[i] >= 0) continue;
    if (pac && t === T.FLOOR) continue;
    const pt = [(i % MW) * TS + 8, ((i / MW) | 0) * TS + 8];
    if (!crateSet.has(i)) walk.push(pt);
    if (!isHideT(t)) { if (!c.fp[i]) spawns.push(pt); } else hides.push(pt);
    if (c.up[i] && !isHideT(t)) hides.push(pt);
  }
  const walkZ = [walk];
  for (let z = 1; z < fl.length; z++) { const w = []; for (let i = 0; i < MW * MH; i++) if (fl[z][i] === T.FLOOR) w.push([(i % MW) * TS + 8, ((i / MW) | 0) * TS + 8]); walkZ.push(w); }
  return {
    g, fl, fp: c.fp, rs, decoL, walkZ, up: c.up, lvl: c.lvl, stair: c.stair, stairD: c.stairD, deco: c.deco, fstyle: c.fstyle, torches, belt, dyn: new Map(), crates: crateSet, portals, spawns, walk, hides, type, theme,
    pellets: new Set(pac ? pac.pellets : []), power: new Set(pac ? pac.power : []),
    home: pac && pac.home, door: pac && pac.door, bases, room,
  };
}

// conveyor belts ("беговые дорожки"): 2-wide strips that carry you along
export const BELT_DX = [1, 0, -1, 0], BELT_DY = [0, 1, 0, -1], BELT_SPEED = 62;
function genBelts(c, belt, n) {
  const ok = (x, y) => {
    if (!c.inb(x, y)) return false;
    const i = y * MW + x;
    return [T.GRASS, T.DIRT, T.ROAD, T.SAND, T.FLOOR].includes(c.g[i]) && !c.up[i] && belt[i] < 0;
  };
  for (let tries = 0, made = 0; tries < 120 && made < n; tries++) {
    const dir = c.ri(0, 3), len = c.ri(5, 9), horiz = dir % 2 === 0;
    const x0 = c.ri(2, MW - 3), y0 = c.ri(2, MH - 3);
    const cells = [];
    for (let s = 0; s < len; s++) for (let w = 0; w < 2; w++) cells.push(horiz ? [x0 + s, y0 + w] : [x0 + w, y0 + s]);
    if (!cells.every(([x, y]) => ok(x, y))) continue;
    // keep a free margin so belts never touch each other
    if (cells.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.inb(x + dx, y + dy) && belt[(y + dy) * MW + x + dx] >= 0))) continue;
    for (const [x, y] of cells) belt[y * MW + x] = dir;
    made++;
  }
}

function keepLargestRegion(g) {
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
  for (let i = 0; i < MW * MH; i++) if (!isSolidT(g[i]) && comp[i] !== best) g[i] = g[i] === T.FLOOR ? T.WALL : T.TREE;
}

// z: 0 ground, 1..4 deck level, -1 on stairs (any non-solid tile passable).
// A deck tile can be walked on at its own level, and under it on the ground (z = 0).
export const BELT_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// z >= 0: floor z (0 = ground floor / terrain). z < 0: on the stairs between floors lo and lo+1, lo = -z - 1.
export const zOf = (map, p) => {
  if (p.stairs) { const lo = map.stair[Math.max(0, Math.min(MH - 1, Math.floor(p.y / TS))) * MW + Math.max(0, Math.min(MW - 1, Math.floor(p.x / TS)))]; if (lo >= 0) return -1 - lo; }
  return p.z | 0;
};
export function solidIdx(map, i, z = 0) {
  if (z >= 0) {
    if (map.crates.has(i) || map.dyn.has(z > 0 ? i + z * MW * MH : i)) return true;
    return SOLID[(z > 0 ? map.fl[z] : map.g)[i]] === 1;
  }
  const lo = -z - 1, A = map.fl[lo], B = map.fl[lo + 1];
  if (!A || !B) return SOLID[map.g[i]] === 1;
  return SOLID[A[i]] === 1 && SOLID[B[i]] === 1;
}
export function solidAt(map, tx, ty, z) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true;
  return solidIdx(map, ty * MW + tx, z);
}
export function collides(map, x, y, r, z = 0) {
  const x0 = Math.floor((x - r) / TS), x1 = Math.floor((x + r) / TS);
  const y0 = Math.floor((y - r) / TS), y1 = Math.floor((y + r) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty, z)) return true;
  return false;
}
export function tileIdx(x, y) {
  const tx = Math.max(0, Math.min(MW - 1, Math.floor(x / TS)));
  const ty = Math.max(0, Math.min(MH - 1, Math.floor(y / TS)));
  return ty * MW + tx;
}
export function tileAt(map, x, y) { return map.g[tileIdx(x, y)]; }

const Q = new Int32Array(MW * MH);
// Multi-source BFS distance field (in tiles, ground floor), -1 = unreachable.
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
