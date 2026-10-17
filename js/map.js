// Tile map: generation (many layouts), collision with two floors, pathfinding fields.
export const TS = 16, MW = 48, MH = 34;
export const T = {
  GRASS: 0, DIRT: 1, WALL: 2, WATER: 3, BUSH: 4, ICE: 5, TREE: 6, FLOOR: 7, PORTAL: 8,
  HEDGE: 9, ROAD: 10, BRIDGE: 11, TOMB: 12, WHEAT: 13, DECOR: 14, SAND: 15, MUSH: 16, STAIRS: 17,
};
export const MAP_TYPES = {
  meadow: 'Луг', village: 'Деревня', maze: 'Лабиринт', islands: 'Острова', graveyard: 'Кладбище',
  beach: 'Пляж', magic: 'Волшебный лес', fort: 'Двухэтажная крепость',
};
// arena bounds (bomberman)
export const ARENA = { x0: 8, y0: 5, x1: 40, y1: 27 };

const SOLID = new Uint8Array(32);
for (const t of [T.WALL, T.TREE, T.HEDGE, T.TOMB, T.DECOR]) SOLID[t] = 1;
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
    R, g, up: new Uint8Array(MW * MH), lvl: new Uint8Array(MW * MH), stair: new Int8Array(MW * MH).fill(-1), stairD: new Uint8Array(MW * MH), deco: new Uint8Array(MW * MH), fstyle: new Uint8Array(MW * MH),
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

// Four-tier castle: every tier is a smaller deck stacked on the one below (level 1..4).
// c.lvl = deck height of a tile (0 = open ground); stairs link level L to L+1.
export const TIERS = [[7, 4, 34, 26], [11, 7, 26, 20], [15, 10, 18, 14], [19, 13, 10, 8]];
export const DECO = { NONE: 0, BRAZIER: 1, BARREL: 2, TABLE: 3, STATUE: 4, CHEST: 5, THRONE: 6, BOOKS: 7 };
const UP_DIR = { N: 1, S: 3, W: 0, E: 2 }; // direction index of "uphill" (0 +x, 1 +y, 2 -x, 3 -y)

function genFort(c) {
  const { ri, R, up, lvl, g } = c;
  for (let i = 0; i < 9; i++) c.blob(ri(2, MW - 3), ri(2, MH - 3), 1.3 + R() * 2, T.DIRT);
  // decks
  TIERS.forEach(([x0, y0, w, h], n) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const i = y * MW + x; lvl[i] = n + 1; up[i] = 1; g[i] = T.ROAD;
    }
  });
  const near = new Set();
  // stairs: two per transition, on opposite sides of the next tier, climbing toward it
  const stairSides = [['N', 'S'], ['W', 'E'], ['S', 'N'], ['E', 'W']];
  const stairTiles = [];
  stairSides.forEach((sides, n) => {
    const [x0, y0, w, h] = TIERS[n];
    for (const side of sides) {
      for (let tries = 0; tries < 40; tries++) {
        let cells, appr;
        if (side === 'N' || side === 'S') {
          const sx = ri(x0 + 5, x0 + w - 7), y = side === 'N' ? y0 - 1 : y0 + h, ay = side === 'N' ? y - 1 : y + 1;
          cells = [[sx, y], [sx + 1, y]]; appr = [[sx, ay], [sx + 1, ay]];
        } else {
          const sy = ri(y0 + 4, y0 + h - 6), x = side === 'W' ? x0 - 1 : x0 + w, ax = side === 'W' ? x - 1 : x + 1;
          cells = [[x, sy], [x, sy + 1]]; appr = [[ax, sy], [ax, sy + 1]];
        }
        if (![...cells, ...appr].every(([x, y]) => c.inb(x, y) && lvl[y * MW + x] === n && g[y * MW + x] !== T.STAIRS)) continue;
        for (const [x, y] of cells) {
          const i = y * MW + x;
          g[i] = T.STAIRS; c.stair[i] = n; c.stairD[i] = UP_DIR[side]; lvl[i] = n; up[i] = n > 0 ? 1 : 0;
          stairTiles.push([x, y]);
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near.add((y + dy) * MW + x + dx);
        }
        break;
      }
    }
  });
  const free = (x, y) => c.inb(x, y) && !near.has(y * MW + x) && g[y * MW + x] !== T.STAIRS;
  // rooms: each tier's ring (the part not covered by the next tier) is split by cross walls with doorways
  const wallAt = (x, y, n) => { if (free(x, y) && lvl[y * MW + x] === n) { g[y * MW + x] = T.WALL; } };
  for (let n = 1; n <= 3; n++) {
    const [x0, y0, w, h] = TIERS[n - 1], [nx0, ny0, nw, nh] = TIERS[n];
    const lw = nx0 - x0, tb = ny0 - y0, bb = (y0 + h) - (ny0 + nh);
    // left / right bands (full height)
    for (const bandX of [x0, nx0 + nw]) {
      const bw = bandX === x0 ? lw : (x0 + w) - (nx0 + nw);
      for (let y = y0 + 5; y < y0 + h - 4; y += 5) {
        const door = ri(0, bw - 1);
        for (let k = 0; k < bw; k++) if (k !== door) wallAt(bandX + k, y, n);
      }
    }
    // top / bottom bands (between the side bands)
    for (const [bandY, bh] of [[y0, tb], [ny0 + nh, bb]]) {
      for (let x = nx0 + 5; x < nx0 + nw - 4; x += 6) {
        const door = ri(0, bh - 1);
        for (let k = 0; k < bh; k++) if (k !== door && bh > 2) wallAt(x, bandY + k, n);
      }
    }
  }
  // furniture, braziers and carpets
  const put = (x, y, kind) => {
    const i = y * MW + x;
    if (!free(x, y) || g[i] === T.WALL || g[i] === T.DECOR) return false;
    if (!c.free8(x, y)) return false;
    g[i] = T.DECOR; c.deco[i] = kind; return true;
  };
  for (let n = 1; n <= 4; n++) {
    const [x0, y0, w, h] = TIERS[n - 1], nxt = TIERS[n];
    const inNext = (x, y) => nxt && x >= nxt[0] && x < nxt[0] + nxt[2] && y >= nxt[1] && y < nxt[1] + nxt[3];
    const tiles = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!inNext(x, y)) tiles.push([x, y]);
    // braziers hug the cliff of the next tier and the outer rim
    let br = 0;
    for (const [x, y] of tiles) {
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      if (edge && (x + y * 2) % 7 === n % 7 && br < 14 && put(x, y, DECO.BRAZIER)) br++;
    }
    for (const [x, y] of tiles) {
      const r = R();
      if (r < 0.045) put(x, y, [DECO.BARREL, DECO.CHEST, DECO.TABLE][ri(0, 2)]);
      else if (r < 0.06) put(x, y, n >= 3 ? DECO.STATUE : DECO.BOOKS);
    }
    // a carpet runs through every ring
    for (const [x, y] of tiles) if (g[y * MW + x] !== T.WALL && g[y * MW + x] !== T.DECOR && g[y * MW + x] !== T.STAIRS && lvl[y * MW + x] === n) {
      const bx = Math.min(x - x0, x0 + w - 1 - x), by = Math.min(y - y0, y0 + h - 1 - y);
      if (Math.min(bx, by) === 1 || (n === 4 && bx > 1 && by > 1)) c.fstyle[y * MW + x] = 1;
    }
  }
  // throne room on the top tier
  { const [x0, y0, w, h] = TIERS[3];
    for (const [dx, dy] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) { const i = (y0 + dy) * MW + x0 + dx; g[i] = T.WALL; }
    for (const dx of [2, w - 3]) { const i = (y0 + 1) * MW + x0 + dx; g[i] = T.DECOR; c.deco[i] = DECO.BRAZIER; }
    const ti = (y0) * MW + x0 + (w >> 1); g[ti] = T.DECOR; c.deco[ti] = DECO.THRONE; }
  // the cellar under the castle: pillars and barrels, a few braziers by the ground-level stairs
  for (let y = TIERS[0][1] + 2; y < TIERS[0][1] + TIERS[0][3] - 2; y += 4) for (let x = TIERS[0][0] + 3; x < TIERS[0][0] + TIERS[0][2] - 2; x += 5) {
    const i = y * MW + x;
    if (g[i] === T.ROAD && !near.has(i) && R() < 0.5 && lvl[i] > 0) { g[i] = T.WALL; }
  }
  for (const [x, y] of stairTiles) if (c.stair[y * MW + x] === 0) {
    for (const [dx, dy] of [[-2, 0], [3, 0], [0, -2], [0, 3]]) { const px = x + dx, py = y + dy; if (c.inb(px, py) && lvl[py * MW + px] === 0 && g[py * MW + px] !== T.STAIRS && R() < 0.35) { const i = py * MW + px; g[i] = T.DECOR; c.deco[i] = DECO.BRAZIER; } }
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

function genArena(c) {
  const { R, g } = c;
  g.fill(T.TREE);
  const { x0, y0, x1, y1 } = ARENA;
  const crates = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * MW + x;
    if (x === x0 || y === y0 || x === x1 || y === y1) { g[i] = T.WALL; continue; }
    if ((x - x0) % 2 === 0 && (y - y0) % 2 === 0) { g[i] = T.WALL; continue; }
    g[i] = T.GRASS;
    if (R() < 0.6) crates.push(i);
  }
  return crates;
}

// sudden-death order for the arena: outer ring first, spiralling inward
export function arenaSpiral() {
  const out = [];
  let x0 = ARENA.x0 + 1, y0 = ARENA.y0 + 1, x1 = ARENA.x1 - 1, y1 = ARENA.y1 - 1;
  const add = (x, y) => { if ((x - ARENA.x0) % 2 || (y - ARENA.y0) % 2) out.push(y * MW + x); };
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

export function genMap(seed, type = 'meadow', theme = '', mode = '') {
  const c = makeCtx(seed), g = c.g;
  let bases = null;
  let crates = [], pac = null, room = null;
  if (type === 'arena') crates = genArena(c);
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
  for (let i = 0; i < MW * MH; i++) if (g[i] === T.DECOR && c.deco[i] === 1) torches.push([(i % MW) * TS + 8, ((i / MW) | 0) * TS + 8, c.lvl[i]]);
  const crateSet = new Set(crates);
  const spawns = [], walk = [], hides = [];
  for (let i = 0; i < MW * MH; i++) {
    const t = g[i];
    if (isSolidT(t) || t === T.WATER || t === T.PORTAL || t === T.STAIRS || belt[i] >= 0) continue;
    if (pac && t === T.FLOOR) continue;
    const pt = [(i % MW) * TS + 8, ((i / MW) | 0) * TS + 8];
    if (!crateSet.has(i)) walk.push(pt);
    if (!isHideT(t)) { if (!(type === 'fort' && c.up[i])) spawns.push(pt); } else hides.push(pt);
    if (c.up[i] && !isHideT(t)) hides.push(pt);
  }
  return {
    g, up: c.up, lvl: c.lvl, stair: c.stair, stairD: c.stairD, deco: c.deco, fstyle: c.fstyle, torches, belt, dyn: new Map(), crates: crateSet, portals, spawns, walk, hides, type, theme,
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
export function solidIdx(map, i, z = 0) {
  if (SOLID[map.g[i]] === 1 || map.dyn.has(i) || map.crates.has(i)) return true;
  if (z < 0) return false;
  const st = map.stair[i];
  if (z === 0) return st > 0;
  if (st >= 0) return !(st === z || st + 1 === z);
  return map.lvl[i] !== z;
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
