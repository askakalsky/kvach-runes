// Authoritative game simulation (runs on host / solo).
import { genMap, TS, MW, MH, T, collides, tileAt, tileIdx, solidIdx, bfs, isHideT, isSolidT, MAP_TYPES, arenaSpiral } from './map.js';
export const SUDDEN = 50;

export const R = 5, BASE = 72;

export const RUNES = {
  dash:   { name: 'Рывок',    col: '#ffd23f', desc: 'Резкий бросок вперёд.' },
  blink:  { name: 'Скачок',   col: '#b07cff', desc: 'Телепорт на 4 клетки вперёд — даже сквозь стены.' },
  invis:  { name: 'Тень',     col: '#b8c4d4', desc: 'Невидимость на 4.5 с. Боты тебя теряют.' },
  trap:   { name: 'Капкан',   col: '#7fe3ff', desc: 'Ледяная ловушка. Кто наступит — замёрзнет.' },
  wall:   { name: 'Стена',    col: '#d0914f', desc: 'Баррикада у тебя за спиной на 6 с.' },
  decoy:  { name: 'Двойник',  col: '#ff9ad5', desc: 'Обманка бежит вместо тебя. Квач, схвативший её, оглушён.' },
  shield: { name: 'Щит',      col: '#7dff8a', desc: 'Неуязвимость 3.5 с. Квачу — «длинные руки».' },
  swap:   { name: 'Обмен',    col: '#ff6b6b', desc: 'Меняешься местами со случайным игроком.' },
  haste:  { name: 'Ветер',    col: '#c6ff4a', desc: 'Скорость ×1.5 на 4 с.' },
  shock:  { name: 'Гром',     col: '#5ab0ff', desc: 'Оглушает всех вокруг на 1.3 с.' },
  phase:  { name: 'Призрак',  col: '#e8e8ff', desc: '3 с проходишь сквозь стены и деревья.' },
  gust:   { name: 'Вихрь',    col: '#9ef0e0', desc: 'Отбрасывает всех вокруг на 3 клетки.' },
  slime:  { name: 'Слизь',    col: '#8ad24a', desc: 'Лужа слизи: чужие в ней ползут вдвое медленнее.' },
  eye:    { name: 'Око',      col: '#ffe08a', desc: '6 с видишь всех — и в кустах, и невидимых.' },
  tiny:   { name: 'Кроха',    col: '#ffb07a', desc: 'Уменьшаешься на 6 с: тебя труднее поймать, ты шустрее.' },
  rewind: { name: 'Откат',    col: '#7aa8ff', desc: 'Возвращает туда, где ты был 3 с назад.' },
  blind:  { name: 'Тьма',     col: '#a07ac8', desc: 'Все остальные почти слепнут на 4 с.' },
  gold:   { name: 'Золотая',  col: '#ffcc33', desc: 'Редкая! Щит 8 с. В классике −10 с квачевания, в бомбермене +1 жизнь.' },
};
export const RUNE_KEYS = Object.keys(RUNES).filter(k => k !== 'gold');
export const GLYPHS = {
  dash:   ['10100', '01010', '00101', '01010', '10100'],
  blink:  ['00100', '01010', '10001', '01010', '00100'],
  invis:  ['01110', '10001', '10101', '10001', '01110'],
  trap:   ['10101', '01110', '11111', '01110', '10101'],
  wall:   ['11011', '00000', '10111', '00000', '11011'],
  decoy:  ['01010', '11011', '01010', '01010', '10001'],
  shield: ['11111', '10001', '10001', '01010', '00100'],
  swap:   ['01000', '11111', '01000', '00010', '11111'],
  haste:  ['11100', '00000', '01111', '00000', '11110'],
  shock:  ['00110', '01100', '11110', '00110', '01100'],
  phase:  ['01110', '11111', '10101', '11111', '10101'],
  gust:   ['11110', '00001', '01110', '10000', '01111'],
  slime:  ['00100', '01110', '11111', '11111', '01110'],
  eye:    ['00000', '01110', '11011', '01110', '00000'],
  tiny:   ['00000', '00100', '01110', '00100', '00000'],
  rewind: ['10010', '10100', '11000', '10100', '10010'],
  blind:  ['11111', '11111', '00000', '11111', '11111'],
  gold:   ['10101', '11111', '11111', '11111', '01110'],
};
export const ITEMS = {
  fire:  { name: 'Огонь +1', col: '#ff7a2a' },
  bomb:  { name: 'Бомба +1', col: '#9a9aaa' },
  boots: { name: 'Сапоги', col: '#c98b4a' },
};
export const MODES = {
  classic: { name: 'Классика', desc: 'Один квач. Касание — и квач уже ты. Побеждает тот, кто меньше всех пробыл квачом.' },
  bomb:    { name: 'Горячая картошка', desc: 'У квача бомба с фитилём. Передай её касанием! Кто держит при взрыве — выбывает и становится призраком.' },
  infect:  { name: 'Заражение', desc: 'Пойманные становятся квачами. Выживи до конца таймера.' },
  bomber:  { name: 'Бомбермен', desc: 'Все с бомбами! Взрывай ящики, собирай огонь, бомбы и сапоги. 3 жизни, последний живой побеждает.' },
};
export const EVENTS = {
  night:    { name: 'Ночь',              text: 'Солнце село. Видно только то, что рядом.', dur: 20 },
  frost:    { name: 'Гололёд',           text: 'Земля покрылась льдом. Держись!', dur: 15 },
  rain:     { name: 'Звездопад рун',     text: 'С неба посыпались руны!', dur: 0 },
  adren:    { name: 'Ярость квача',      text: 'Квач стал быстрее на 25%!', dur: 15, no: ['bomber'] },
  chaos:    { name: 'Буря телепортов',   text: 'Всех раскидало по карте!', dur: 0 },
  giant:    { name: 'Безумие рун',       text: 'Все получили случайную руну!', dur: 0 },
  fog:      { name: 'Туман',             text: 'Густой туман. Мини-карта ослепла.', dur: 20 },
  rush:     { name: 'Спешка',            text: 'Все бегают на 30% быстрее!', dur: 15 },
  carousel: { name: 'Карусель',          text: 'Все поменялись местами по кругу!', dur: 0 },
  gold:     { name: 'Золотая руна',      text: 'Где-то появилась золотая руна. Хватай!', dur: 0 },
  meteor:   { name: 'Метеоритный дождь', text: 'С неба падают камни! Беги из красных кругов.', dur: 12, hw: 'Тыквопад' },
  tiny:     { name: 'Лилипуты',          text: 'Все уменьшились на 15 секунд!', dur: 0 },
  mirror:   { name: 'Зазеркалье',        text: 'Управление перевёрнуто!', dur: 10 },
  coup:     { name: 'Переворот',         text: 'Квачом назначен случайный игрок!', dur: 0, only: ['classic'] },
  spirits:  { name: 'Ночь духов',        text: 'Духи вышли на охоту. Не дай им коснуться!', dur: 20, theme: 'halloween' },
};
export const STORYTELLERS = ['Кассандра Классик', 'Фиби Чиллакс', 'Рэнди Рэндом'];
export const BOT_NAMES = ['Рэнди', 'Тайни', 'Бёрт', 'Кассия', 'Мюррей', 'Джинджер', 'Финн', 'Хэнк', 'Ласло', 'Мира'];
export const BOT_NAMES_HW = ['Тыквен', 'Бу', 'Каспер', 'Дракулич', 'Мумия', 'Скелетон', 'Ведьма', 'Вурдалак'];

const FX0 = () => ({ dash: 0, haste: 0, invis: 0, shield: 0, reach: 0, stun: 0, frozen: 0, phase: 0, slow: 0, eye: 0, tiny: 0, blind: 0, chill: 0 });
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const pick = a => a[Math.floor(Math.random() * a.length)];
const N4 = i => { const x = i % MW, y = (i / MW) | 0, o = []; if (x > 0) o.push(i - 1); if (x < MW - 1) o.push(i + 1); if (y > 0) o.push(i - MW); if (y < MH - 1) o.push(i + MW); return o; };

export function speedMult(p, mode, ev, bot) {
  const f = p.fx;
  if (f.stun > 0 || f.frozen > 0) return 0;
  let m = 1;
  if (p.it) m *= mode === 'infect' ? 1.03 : 1.08;
  if (p.it && ev === 'adren') m *= 1.25;
  if (ev === 'rush') m *= 1.3;
  if (f.haste > 0) m *= 1.5;
  if (f.dash > 0) m *= 3.4;
  if (f.slow > 0) m *= 0.5;
  if (f.chill > 0) m *= 0.6;
  if (f.tiny > 0) m *= 1.1;
  if (p.boots) m *= 1 + 0.12 * p.boots;
  if (bot) m *= 0.93;
  return m;
}
export function slippery(map, p, ev) { return ev === 'frost' || tileAt(map, p.x, p.y) === T.ICE; }

// corner assist: when blocked on one axis, slide sideways into a nearby gap
function nudge(map, p, nx, ny, axisX, step) {
  const s = Math.max(0.6, Math.abs(step));
  for (let off = 1; off <= 7; off++) for (const sg of [1, -1]) {
    const o = off * sg;
    if (axisX ? collides(map, nx, p.y + o, R) : collides(map, p.x + o, ny, R)) continue;
    const m = Math.min(off, s) * sg;
    if (axisX) { if (!collides(map, p.x, p.y + m, R)) p.y += m; }
    else if (!collides(map, p.x + m, p.y, R)) p.x += m;
    return true;
  }
  return false;
}

export function moveBody(map, p, ax, ay, dt, mult, slip, noclip) {
  const l = Math.hypot(ax, ay);
  if (l > 1) { ax /= l; ay /= l; }
  if (p.fx.dash > 0 && l < 0.2) { ax = p.fdx; ay = p.fdy; }
  noclip = noclip || p.fx.phase > 0;
  if (!noclip && tileAt(map, p.x, p.y) === T.WATER && !(p.fx.dash > 0)) mult *= 0.55;
  const k = slip ? 2.4 : 18, a = Math.min(1, k * dt);
  p.vx += (ax * BASE * mult - p.vx) * a;
  p.vy += (ay * BASE * mult - p.vy) * a;
  if (mult === 0) { p.vx = 0; p.vy = 0; }
  if (noclip || collides(map, p.x, p.y, R)) {
    p.x = Math.max(8, Math.min(MW * TS - 8, p.x + p.vx * dt));
    p.y = Math.max(8, Math.min(MH * TS - 8, p.y + p.vy * dt));
  } else {
    const nx = p.x + p.vx * dt;
    if (!collides(map, nx, p.y, R)) p.x = nx;
    else if (!(Math.abs(ay) < 0.5 && nudge(map, p, nx, p.y, true, p.vx * dt))) p.vx *= slip ? -0.4 : 0;
    const ny = p.y + p.vy * dt;
    if (!collides(map, p.x, ny, R)) p.y = ny;
    else if (!(Math.abs(ax) < 0.5 && nudge(map, p, p.x, ny, false, p.vy * dt))) p.vy *= slip ? -0.4 : 0;
  }
  if (l > 0.2 && mult > 0) { const n = Math.hypot(ax, ay); p.fdx = ax / n; p.fdy = ay / n; }
  p.m = Math.hypot(p.vx, p.vy) > 12 ? 1 : 0;
}

export function pickMapType(mode, wanted) {
  if (mode === 'bomber') return 'arena';
  return MAP_TYPES[wanted] ? wanted : pick(Object.keys(MAP_TYPES));
}

export class Sim {
  constructor(settings, roster, seed, localId) {
    this.mode = settings.mode; this.dur = settings.dur; this.seed = seed; this.localId = localId;
    this.theme = settings.theme || '';
    this.mapType = settings.mapType;
    this.storyteller = settings.storyteller || pick(STORYTELLERS);
    this.map = genMap(seed, this.mapType, this.theme);
    this.players = []; this.runes = []; this.traps = []; this.decoys = []; this.fxq = [];
    this.puddles = []; this.meteors = []; this.spirits = []; this.bombs = []; this.flames = []; this.items = []; this.broken = [];
    this.danger = new Map();
    this.time = this.dur; this.phase = 'count'; this.count = 3.5;
    this.event = null; this.lastEvent = null; this.nextEvent = 25 + Math.random() * 10; this.meteorT = 0;
    this.runeT = 2; this.uid = 1; this.fieldT = 0; this.huntTargets = 0;
    this.fRun = new Int16Array(MW * MH); this.fHunt = new Int16Array(MW * MH); this.par = new Int32Array(MW * MH);
    const spots = this.spread(roster.length, []);
    roster.forEach((r, i) => this.addPlayer(r, spots[i]));
    if (this.mode === 'bomber') for (const p of this.players) this.clearAround(tileIdx(p.x, p.y));
    else pick(this.players).it = true;
    this.fuse = this.newFuse();
    for (let i = 0; i < (this.mode === 'bomber' ? 2 : 5); i++) this.spawnRune();
  }

  spread(n, taken, cands) {
    const out = [], pts = taken.slice(), sp = cands || this.map.spawns;
    for (let i = 0; i < n; i++) {
      let best = null, bd = -1;
      for (let k = 0; k < 50; k++) {
        const c = pick(sp);
        const md = pts.length ? Math.min(...pts.map(q => (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2)) : 1;
        if (md > bd) { bd = md; best = c; }
      }
      out.push(best); pts.push(best);
    }
    return out;
  }
  freeSpots() {
    return this.map.walk.filter(([x, y]) => { const i = tileIdx(x, y); return !this.map.crates.has(i) && !this.danger.has(i) && !this.map.dyn.has(i); });
  }
  clearAround(ti) {
    const x0 = ti % MW, y0 = (ti / MW) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 2) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      const i = y * MW + x;
      if (this.map.crates.delete(i)) this.broken.push(i);
    }
  }

  addPlayer(r, spot) {
    if (!spot) spot = this.spread(1, this.players.filter(p => p.alive).map(p => [p.x, p.y]), this.mode === 'bomber' ? this.freeSpots() : null)[0];
    const p = {
      id: r.id, name: r.name, color: r.color, hair: r.hair, hairCol: r.hairCol, bot: !!r.bot,
      x: spot[0], y: spot[1], vx: 0, vy: 0, fdx: 0, fdy: 1, m: 0, ax: 0, ay: 0,
      it: false, alive: true, ghost: false, ghostCd: 0, score: 0, rune: null, held: 0, fx: FX0(),
      tp: 0, portalCd: 0, tagCd: 0, useSeq: 0, bombSeq: 0, outAt: 0,
      lives: 3, maxB: 1, range: 2, boots: 0,
      hist: [], histT: 0,
      ai: { lx: spot[0], ly: spot[1], stuckT: 0, unstuck: 0, ux: 0, uy: 0, wx: null, wy: null, t: 0, jx: 0, jy: 0, goal: -1 },
    };
    this.players.push(p);
    return p;
  }
  byId(id) { return this.players.find(p => p.id === id); }
  newFuse() { const alive = this.players.filter(p => p.alive).length; return 14 + Math.random() * 8 + Math.min(alive, 6); }
  fx(k, x, y, extra) { this.fxq.push(Object.assign({ k, x: r1(x), y: r1(y) }, extra)); }

  spawnRune(k, at) {
    const ps = this.players;
    for (let tries = 0; tries < 30; tries++) {
      const [x, y] = at || pick(this.map.walk);
      const ti = tileIdx(x, y);
      if (this.map.dyn.has(ti) || this.map.crates.has(ti)) { if (at) return; continue; }
      if (!at && ps.some(p => p.alive && d2(p, { x, y }) < 48 * 48)) continue;
      if (!at && this.runes.some(r => d2(r, { x, y }) < 40 * 40)) continue;
      this.runes.push({ id: this.uid++, x, y, k: k || pick(RUNE_KEYS) });
      return;
    }
  }

  placeWall(tx, ty, life) {
    if (tx <= 0 || ty <= 0 || tx >= MW - 1 || ty >= MH - 1) return;
    const i = ty * MW + tx;
    if (solidIdx(this.map, i) || this.map.g[i] === T.PORTAL) return;
    const x0 = tx * TS - R - 1, y0 = ty * TS - R - 1, x1 = tx * TS + TS + R + 1, y1 = ty * TS + TS + R + 1;
    const blocked = [...this.players.filter(p => p.alive), ...this.decoys].some(p => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1);
    if (blocked) return;
    this.map.dyn.set(i, life);
  }

  // push q away from (x,y) by up to dist px, stopping at walls
  shove(q, x, y, dist) {
    let dx = q.x - x, dy = q.y - y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    for (let s = dist; s > 0; s -= 4) {
      const nx = q.x + dx * s, ny = q.y + dy * s;
      if (!collides(this.map, nx, ny, R)) { q.x = nx; q.y = ny; q.tp++; q.vx = q.vy = 0; return; }
    }
  }

  useRune(p) {
    if (!p.alive || !p.rune || this.phase !== 'play' || p.fx.frozen > 0) return;
    const k = p.rune, f = p.fx;
    p.rune = null; p.held = 0;
    const ox = p.x, oy = p.y;
    switch (k) {
      case 'dash': f.dash = 0.3; break;
      case 'haste': f.haste = 4; break;
      case 'invis': f.invis = 4.5; break;
      case 'shield': if (p.it) f.reach = 4; else f.shield = 3.5; break;
      case 'phase': f.phase = 3; break;
      case 'eye': f.eye = 6; break;
      case 'tiny': f.tiny = 6; break;
      case 'blink': {
        let bx = p.x, by = p.y;
        for (let s = 4; s <= 64; s += 4) {
          const nx = p.x + p.fdx * s, ny = p.y + p.fdy * s;
          if (!collides(this.map, nx, ny, R)) { bx = nx; by = ny; }
        }
        p.x = bx; p.y = by; p.vx = p.fdx * 60; p.vy = p.fdy * 60; p.tp++;
        break;
      }
      case 'rewind': {
        const h = p.hist[0];
        if (h && !collides(this.map, h[0], h[1], R)) { p.x = h[0]; p.y = h[1]; p.vx = p.vy = 0; p.tp++; }
        break;
      }
      case 'trap': this.traps.push({ id: this.uid++, x: p.x, y: p.y, owner: p.id, arm: 0.6, life: 30 }); break;
      case 'slime': this.puddles.push({ id: this.uid++, x: p.x, y: p.y, owner: p.id, life: 9 }); break;
      case 'wall': {
        const tx = Math.floor((p.x - p.fdx * 20) / TS), ty = Math.floor((p.y - p.fdy * 20) / TS);
        const horiz = Math.abs(p.fdy) >= Math.abs(p.fdx);
        for (let i = -1; i <= 1; i++) this.placeWall(tx + (horiz ? i : 0), ty + (horiz ? 0 : i), 6);
        break;
      }
      case 'decoy':
        this.decoys.push({ id: this.uid++, x: p.x, y: p.y, fdx: p.fdx, fdy: p.fdy, owner: p.id, life: 5, m: 1 });
        f.invis = Math.max(f.invis, 1.2);
        break;
      case 'swap': {
        const others = this.players.filter(q => q.alive && q !== p);
        if (others.length) {
          const q = pick(others);
          [p.x, q.x] = [q.x, p.x]; [p.y, q.y] = [q.y, p.y];
          p.vx = p.vy = q.vx = q.vy = 0; p.tp++; q.tp++;
          p.tagCd = Math.max(p.tagCd, 1); q.tagCd = Math.max(q.tagCd, 1);
          this.fx('swap', ox, oy, { x2: p.x, y2: p.y, a: p.id, b: q.id });
        }
        break;
      }
      case 'shock':
        for (const q of this.players) if (q !== p && q.alive && q.fx.shield <= 0 && d2(p, q) < 54 * 54) q.fx.stun = Math.max(q.fx.stun, 1.3);
        break;
      case 'gust':
        for (const q of this.players) if (q !== p && q.alive && q.fx.shield <= 0 && d2(p, q) < 64 * 64) { this.shove(q, p.x, p.y, 48); q.fx.stun = Math.max(q.fx.stun, 0.4); }
        break;
      case 'blind':
        for (const q of this.players) if (q !== p && q.alive) q.fx.blind = 4;
        break;
    }
    this.fx('use', ox, oy, { r: k, id: p.id, x2: r1(p.x), y2: r1(p.y) });
  }

  // ---------- bomberman ----------
  placeBomb(p) {
    if (this.mode !== 'bomber' || !p.alive || this.phase !== 'play' || p.fx.frozen > 0) return;
    const i = tileIdx(p.x, p.y);
    if (this.bombs.filter(b => b.owner === p.id).length >= p.maxB || this.bombs.some(b => b.i === i)) return;
    this.bombs.push({ id: this.uid++, i, x: (i % MW) * TS + 8, y: ((i / MW) | 0) * TS + 8, owner: p.id, t: 2.2, range: p.range });
    this.fx('bombset', p.x, p.y, { id: p.id });
  }
  blastTiles(i, range) {
    const out = [i], x0 = i % MW, y0 = (i / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let s = 1; s <= range; s++) {
        const x = x0 + dx * s, y = y0 + dy * s;
        if (x < 0 || y < 0 || x >= MW || y >= MH) break;
        const n = y * MW + x;
        if (isSolidT(this.map.g[n]) || this.map.dyn.has(n)) break;
        out.push(n);
        if (this.map.crates.has(n)) break;
      }
    }
    return out;
  }
  detonate(b) {
    this.bombs = this.bombs.filter(q => q !== b);
    const tiles = this.blastTiles(b.i, b.range);
    for (const n of tiles) {
      if (this.map.crates.delete(n)) {
        this.broken.push(n);
        if (Math.random() < 0.38) {
          const x = (n % MW) * TS + 8, y = ((n / MW) | 0) * TS + 8;
          if (Math.random() < 0.2) this.spawnRune(null, [x, y]);
          else this.items.push({ id: this.uid++, x, y, k: pick(['fire', 'fire', 'bomb', 'bomb', 'boots']), safe: 0.6 });
        }
      }
      for (const o of this.bombs) if (o.i === n) o.t = Math.min(o.t, 0.08);
    }
    this.flames.push({ set: new Set(tiles), t: 0.5, owner: b.owner });
    this.fx('blast', b.x, b.y, { tl: tiles });
  }
  hit(p, byId) {
    if (!p.alive || p.fx.shield > 0) return;
    p.lives--;
    const by = byId && byId !== p.id ? this.byId(byId) : null;
    if (by) by.score += 1;
    this.fx('hit', p.x, p.y, { id: p.id, by: byId || '' });
    if (p.lives <= 0) { this.eliminate(p); return; }
    const spot = this.spread(1, this.players.filter(q => q.alive && q !== p).map(q => [q.x, q.y]), this.freeSpots())[0];
    if (spot) { p.x = spot[0]; p.y = spot[1]; p.tp++; }
    p.vx = p.vy = 0; p.fx.shield = 2.5;
  }
  computeDanger() {
    this.danger.clear();
    for (const b of this.bombs) for (const n of this.blastTiles(b.i, b.range)) this.danger.set(n, 1);
    for (const f of this.flames) for (const n of f.set) this.danger.set(n, 1);
    for (const m of this.meteors) this.danger.set(tileIdx(m.x, m.y), 1);
  }

  // ---------- events ----------
  startEvent() {
    const ok = k => { const e = EVENTS[k]; return (!e.no || !e.no.includes(this.mode)) && (!e.only || e.only.includes(this.mode)) && (!e.theme || e.theme === this.theme) && k !== this.lastEvent; };
    const k = pick(Object.keys(EVENTS).filter(ok));
    this.lastEvent = k;
    const e = EVENTS[k];
    if (e.dur) this.event = { k, t: e.dur };
    const alive = this.players.filter(p => p.alive);
    if (k === 'rain') for (let i = 0; i < 8; i++) this.spawnRune();
    if (k === 'gold') this.spawnRune('gold');
    if (k === 'giant') for (const p of alive) if (!p.rune) p.rune = pick(RUNE_KEYS);
    if (k === 'tiny') for (const p of alive) p.fx.tiny = 15;
    if (k === 'chaos') {
      const spots = this.spread(alive.length, [], this.mode === 'bomber' ? this.freeSpots() : null);
      alive.forEach((p, i) => {
        p.x = spots[i][0]; p.y = spots[i][1]; p.vx = p.vy = 0; p.tp++;
        if (p.it) p.fx.stun = Math.max(p.fx.stun, 1); else p.tagCd = Math.max(p.tagCd, 1.5);
      });
    }
    if (k === 'carousel' && alive.length > 1) {
      const pos = alive.map(p => [p.x, p.y]);
      alive.forEach((p, i) => {
        [p.x, p.y] = pos[(i + 1) % pos.length]; p.vx = p.vy = 0; p.tp++;
        if (p.it) p.fx.stun = Math.max(p.fx.stun, 0.8); else p.tagCd = Math.max(p.tagCd, 1.2);
      });
    }
    if (k === 'coup') {
      const a = alive.find(p => p.it), others = alive.filter(p => !p.it);
      if (a && others.length) { const b = pick(others); a.it = false; a.tagCd = 1.5; b.it = true; b.fx.stun = 1; this.fx('tag', b.x, b.y, { a: a.id, b: b.id }); }
    }
    if (k === 'spirits') {
      this.spirits = [];
      for (let i = 0; i < 3; i++) { const [x, y] = pick(this.map.walk); this.spirits.push({ id: this.uid++, x, y, cd: 1 }); }
    }
    this.fx('event', 0, 0, { e: k, s: this.storyteller, h: this.theme === 'halloween' ? 1 : 0 });
  }

  spawnMeteor() {
    const alive = this.players.filter(p => p.alive);
    for (let k = 0; k < 10; k++) {
      let x, y;
      if (alive.length && Math.random() < 0.6) { const p = pick(alive); x = p.x + (Math.random() - 0.5) * 70; y = p.y + (Math.random() - 0.5) * 70; }
      else [x, y] = pick(this.map.walk);
      if (collides(this.map, x, y, 2)) continue;
      this.meteors.push({ id: this.uid++, x, y, t: 1.3 });
      return;
    }
  }

  update(dt) {
    const ps = this.players;
    if (this.phase === 'end') return;
    if (this.phase === 'count') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const after = Math.ceil(this.count);
      if (after !== before && after > 0) this.fx('count', 0, 0, { n: after });
      if (this.count <= 0) { this.phase = 'play'; this.fx('go', 0, 0, {}); }
      return;
    }
    this.time -= dt;
    for (const p of ps) {
      for (const k in p.fx) if (p.fx[k] > 0) p.fx[k] = Math.max(0, p.fx[k] - dt);
      p.portalCd -= dt; p.tagCd -= dt; p.ghostCd -= dt;
      if (p.rune) p.held += dt;
      p.histT -= dt;
      if (p.histT <= 0 && p.alive) { p.histT = 0.25; p.hist.push([p.x, p.y]); if (p.hist.length > 12) p.hist.shift(); }
    }
    if (this.event) {
      this.event.t -= dt;
      if (this.event.k === 'meteor') { this.meteorT -= dt; if (this.meteorT <= 0) { this.meteorT = 0.4; this.spawnMeteor(); } }
      if (this.event.t <= 0) { if (this.event.k === 'spirits') this.spirits = []; this.event = null; }
    }
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) { this.startEvent(); this.nextEvent = 28 + Math.random() * 14; }

    const bomber = this.mode === 'bomber';
    if (bomber) this.computeDanger();
    else { this.fieldT -= dt; if (this.fieldT <= 0) { this.computeFields(); this.fieldT = 0.25; } }
    for (const p of ps) {
      if (!p.bot) continue;
      if (p.alive) bomber ? this.botBomber(p, dt) : this.botThink(p, dt);
      else if (p.ghost) this.botGhost(p);
    }

    const ev = this.event && this.event.k;
    for (const p of ps) {
      if (!(p.bot || p.id === this.localId)) continue;
      if (p.alive) moveBody(this.map, p, p.ax, p.ay, dt, speedMult(p, this.mode, ev, p.bot), slippery(this.map, p, ev));
      else if (p.ghost) { const f = p.fx; f.stun = f.frozen = 0; moveBody(this.map, p, p.ax, p.ay, dt, 0.9, false, true); }
    }

    for (const d of this.decoys) {
      d.life -= dt;
      const nx = d.x + d.fdx * BASE * dt, ny = d.y + d.fdy * BASE * dt;
      if (collides(this.map, nx, ny, R)) {
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2, fx = Math.cos(a), fy = Math.sin(a);
          if (!collides(this.map, d.x + fx * 5, d.y + fy * 5, R)) { d.fdx = fx; d.fdy = fy; break; }
        }
      } else { d.x = nx; d.y = ny; }
    }
    this.decoys = this.decoys.filter(d => { if (d.life > 0) return true; this.fx('poof', d.x, d.y, {}); return false; });

    // spirits chase the nearest living player, passing through walls
    for (const s of this.spirits) {
      s.cd -= dt;
      let best = null, bd = 1e9;
      for (const q of ps) if (q.alive) { const d = d2(s, q); if (d < bd) { bd = d; best = q; } }
      if (!best) continue;
      const l = Math.sqrt(bd) || 1;
      s.x += (best.x - s.x) / l * BASE * 0.72 * dt; s.y += (best.y - 8 - s.y) / l * BASE * 0.72 * dt;
      if (s.cd <= 0 && bd < 12 * 12 && best.fx.shield <= 0) {
        best.fx.chill = 2.5; best.fx.stun = Math.max(best.fx.stun, 0.5);
        this.fx('boo', best.x, best.y, { id: best.id });
        const [x, y] = pick(this.map.walk); s.x = x; s.y = y; s.cd = 1.5;
      }
    }
    // ghosts of eliminated players spook the living
    for (const g of ps) {
      if (g.alive || !g.ghost || g.ghostCd > 0) continue;
      for (const q of ps) if (q.alive && q.fx.shield <= 0 && d2(g, q) < 11 * 11) {
        q.fx.chill = 1.6; g.ghostCd = 5;
        this.fx('boo', q.x, q.y, { id: q.id, g: g.id });
        break;
      }
    }

    for (const p of ps) {
      if (!p.alive || p.portalCd > 0) continue;
      const ti = tileIdx(p.x, p.y);
      for (const pr of this.map.portals) {
        const dest = ti === pr[0] ? pr[1] : ti === pr[1] ? pr[0] : -1;
        if (dest < 0) continue;
        const ox = p.x, oy = p.y;
        p.x = (dest % MW) * TS + 8; p.y = Math.floor(dest / MW) * TS + 8; p.tp++; p.portalCd = 1.6;
        this.fx('portal', ox, oy, { x2: p.x, y2: p.y, id: p.id });
        break;
      }
    }

    for (const p of ps) {
      if (!p.alive) continue;
      for (let i = 0; i < this.runes.length; i++) {
        const r = this.runes[i];
        if (d2(p, r) >= 11 * 11) continue;
        if (r.k === 'gold') {
          p.fx.shield = 8;
          if (this.mode === 'classic') p.score = Math.max(0, p.score - 10);
          if (bomber) p.lives = Math.min(5, p.lives + 1);
        } else if (p.rune) continue;
        else { p.rune = r.k; p.held = 0; }
        this.runes.splice(i, 1);
        this.fx('pick', r.x, r.y, { r: r.k, id: p.id });
        break;
      }
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (d2(p, it) >= 11 * 11) continue;
        if (it.k === 'fire') p.range = Math.min(8, p.range + 1);
        if (it.k === 'bomb') p.maxB = Math.min(6, p.maxB + 1);
        if (it.k === 'boots') p.boots = Math.min(4, p.boots + 1);
        this.items.splice(i, 1);
        this.fx('item', it.x, it.y, { r: it.k, id: p.id });
        break;
      }
    }

    for (const tr of this.traps) {
      tr.life -= dt; tr.arm -= dt;
      if (tr.arm > 0) continue;
      for (const p of ps) {
        if (!p.alive || p.id === tr.owner || p.fx.shield > 0) continue;
        if (d2(p, tr) < 9 * 9) { p.fx.frozen = 1.8; p.vx = p.vy = 0; tr.life = 0; this.fx('freeze', p.x, p.y, { id: p.id }); break; }
      }
    }
    this.traps = this.traps.filter(t => t.life > 0);
    for (const pu of this.puddles) {
      pu.life -= dt;
      for (const p of ps) if (p.alive && p.id !== pu.owner && d2(p, pu) < 22 * 22) p.fx.slow = Math.max(p.fx.slow, 0.25);
    }
    this.puddles = this.puddles.filter(p => p.life > 0);
    for (const m of this.meteors) {
      m.t -= dt;
      if (m.t > 0) continue;
      for (const p of ps) if (p.alive && p.fx.shield <= 0 && d2(p, m) < 20 * 20) {
        if (bomber) this.hit(p, null); else { p.fx.stun = Math.max(p.fx.stun, 1.5); p.vx = p.vy = 0; }
      }
      if (this.theme === 'halloween' && Math.random() < 0.35) this.spawnRune(null, [m.x, m.y]);
      this.fx('impact', m.x, m.y, { h: this.theme === 'halloween' ? 1 : 0 });
    }
    this.meteors = this.meteors.filter(m => m.t > 0);
    for (const [k, v] of this.map.dyn) { if (v - dt <= 0) this.map.dyn.delete(k); else this.map.dyn.set(k, v - dt); }

    if (bomber && this.time < SUDDEN) {
      if (!this.sd) { this.sd = arenaSpiral(); this.sdN = 0; this.sdT = 0; this.fx('sudden', 0, 0, {}); }
      this.sdT -= dt;
      while (this.sdT <= 0 && this.sdN < this.sd.length) {
        this.sdT += 0.32;
        const i = this.sd[this.sdN++];
        if (this.map.crates.delete(i)) this.broken.push(i);
        this.map.dyn.set(i, 1e9);
        this.bombs = this.bombs.filter(b => b.i !== i);
        this.items = this.items.filter(it => tileIdx(it.x, it.y) !== i);
        this.runes = this.runes.filter(r => tileIdx(r.x, r.y) !== i);
        for (const p of ps) if (p.alive && tileIdx(p.x, p.y) === i) { p.fx.shield = 0; p.lives = 1; this.hit(p, null); }
      }
    }
    if (bomber) {
      for (const b of this.bombs.slice()) { b.t -= dt; if (b.t <= 0 && this.bombs.includes(b)) this.detonate(b); }
      for (const it of this.items) it.safe -= dt;
      for (const f of this.flames) {
        f.t -= dt;
        for (const p of ps) if (p.alive && f.set.has(tileIdx(p.x, p.y))) this.hit(p, f.owner);
        this.items = this.items.filter(it => it.safe > 0 || !f.set.has(tileIdx(it.x, it.y)));
      }
      this.flames = this.flames.filter(f => f.t > 0);
    } else this.checkTags();

    if (this.mode === 'classic') { for (const p of ps) if (p.it && p.alive) p.score += dt; }
    else if (this.mode === 'infect') { for (const p of ps) if (!p.it && p.alive) p.score += dt; }
    else if (this.mode === 'bomb') {
      for (const p of ps) if (p.alive) p.score += dt;
      this.fuse -= dt;
      if (this.fuse <= 0) this.explode();
    }

    this.runeT -= dt;
    if (this.runeT <= 0) {
      this.runeT = bomber ? 6 : 3.2;
      if (this.runes.length < (bomber ? 2 : 3) + Math.ceil(ps.length * (bomber ? 0.4 : 0.8))) this.spawnRune();
    }

    const alive = ps.filter(p => p.alive);
    if (this.time <= 0) {
      this.time = 0;
      if (this.mode === 'bomb') { const h = alive.find(p => p.it); if (h) this.eliminate(h); }
      this.finish();
    } else if ((this.mode === 'bomb' || bomber) && alive.length <= 1) this.finish();
    else if (this.mode === 'infect' && !alive.some(p => !p.it)) this.finish();
  }

  checkTags() {
    const ps = this.players;
    for (const a of ps) {
      if (!a.alive || !a.it || a.fx.stun > 0 || a.fx.frozen > 0) continue;
      const reach = a.fx.reach > 0 ? 22 : 11;
      for (let i = 0; i < this.decoys.length; i++) {
        const d = this.decoys[i];
        if (d.owner !== a.id && d2(a, d) < reach * reach) { this.decoys.splice(i, 1); a.fx.stun = 0.9; this.fx('fool', d.x, d.y, { id: a.id }); break; }
      }
      if (a.fx.stun > 0) continue;
      for (const b of ps) {
        if (b === a || !b.alive || b.it || b.tagCd > 0 || b.fx.shield > 0) continue;
        const rr = b.fx.tiny > 0 ? reach * 0.6 : reach;
        if (d2(a, b) < rr * rr) { this.tag(a, b); break; }
      }
    }
  }

  tag(a, b) {
    b.fx.invis = 0;
    if (this.mode === 'infect') {
      b.it = true; b.fx.stun = 1.0;
      this.fx('tag', b.x, b.y, { a: a.id, b: b.id, inf: 1 });
      return;
    }
    a.it = false; a.tagCd = 1.3;
    b.it = true; b.fx.stun = Math.max(b.fx.stun, 1.0);
    if (this.mode === 'bomb' && this.fuse < 4) this.fuse = 4;
    this.fx('tag', b.x, b.y, { a: a.id, b: b.id });
  }

  eliminate(p) {
    p.alive = false; p.it = false; p.ghost = true; p.ghostCd = 2; p.rune = null; p.outAt = this.dur - this.time;
    for (const k in p.fx) p.fx[k] = 0;
    this.fx('boom', p.x, p.y, { id: p.id });
    for (const q of this.players) if (q.alive && d2(p, q) < 40 * 40 && this.mode !== 'bomber') q.fx.stun = Math.max(q.fx.stun, 0.8);
  }

  explode() {
    const h = this.players.find(p => p.alive && p.it);
    if (h) this.eliminate(h);
    const alive = this.players.filter(p => p.alive);
    if (alive.length > 1) {
      const n = pick(alive);
      n.it = true; n.fx.stun = Math.max(n.fx.stun, 1.5);
      this.fuse = this.newFuse();
      this.fx('newbomb', n.x, n.y, { id: n.id });
    }
  }

  finish() { this.phase = 'end'; this.fx('end', 0, 0, {}); }

  results() {
    const ps = [...this.players];
    const fmt = s => s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} с`;
    const row = (p, label, win) => ({ id: p.id, name: p.name, color: p.color, hair: p.hair, hairCol: p.hairCol, label, win });
    if (this.mode === 'classic') {
      ps.sort((a, b) => a.score - b.score);
      return { title: `Победил ${ps[0].name}!`, rows: ps.map((p, i) => row(p, `квачом ${fmt(p.score)}`, i === 0)) };
    }
    if (this.mode === 'bomb') {
      ps.sort((a, b) => (b.alive - a.alive) || (b.score - a.score));
      return { title: `Победил ${ps[0].name}!`, rows: ps.map((p, i) => row(p, p.alive ? 'выжил!' : `взорван на ${fmt(p.outAt)}`, i === 0)) };
    }
    if (this.mode === 'bomber') {
      ps.sort((a, b) => (b.alive - a.alive) || (b.lives - a.lives) || (b.score - a.score) || (b.outAt - a.outAt));
      return { title: `Победил ${ps[0].name}!`, rows: ps.map((p, i) => row(p, `${p.alive ? '❤' + p.lives : 'выбыл'} · взрывов: ${p.score}`, i === 0)) };
    }
    const surv = ps.filter(p => !p.it);
    ps.sort((a, b) => ((!b.it) - (!a.it)) || (b.score - a.score));
    const title = surv.length ? (surv.length === 1 ? `${surv[0].name} выжил!` : `Выжили: ${surv.map(p => p.name).join(', ')}`) : 'Заражены все. Победила орда!';
    return { title, rows: ps.map(p => row(p, !p.it ? `выжил (${fmt(p.score)})` : `продержался ${fmt(p.score)}`, !p.it)) };
  }

  snapshot() {
    const fx = f => { const o = {}; for (const k in f) if (f[k] > 0) o[k] = r1(f[k]); return o; };
    const bomber = this.mode === 'bomber';
    const s = {
      t: 's', ph: this.phase, c: r2(this.count), tm: r2(this.time), fu: r1(this.fuse),
      ev: this.event ? { k: this.event.k, t: r1(this.event.t) } : null,
      p: this.players.map(p => {
        const o = { i: p.id, x: r1(p.x), y: r1(p.y), dx: r2(p.fdx), dy: r2(p.fdy), m: p.m, it: p.it ? 1 : 0, a: p.alive ? 1 : 0, g: p.ghost ? 1 : 0, s: r1(p.score), r: p.rune, tp: p.tp, f: fx(p.fx), b: p.bot ? 1 : 0 };
        if (bomber) { o.l = p.lives; o.bo = p.boots; o.pw = [p.maxB, p.range]; }
        return o;
      }),
      ru: this.runes.map(r => [r.id, r.x, r.y, r.k]),
      tr: this.traps.map(t => [t.id, Math.round(t.x), Math.round(t.y), t.owner, t.arm > 0 ? 0 : 1]),
      de: this.decoys.map(d => [d.id, r1(d.x), r1(d.y), r2(d.fdx), r2(d.fdy), d.owner]),
      pu: this.puddles.map(p => [p.id, Math.round(p.x), Math.round(p.y), p.owner]),
      mt: this.meteors.map(m => [m.id, Math.round(m.x), Math.round(m.y), r2(m.t)]),
      sp: this.spirits.map(s2 => [s2.id, r1(s2.x), r1(s2.y)]),
      w: [...this.map.dyn.keys()],
    };
    if (bomber) {
      s.bm = this.bombs.map(b => [b.id, b.x, b.y, r2(b.t)]);
      s.im = this.items.map(it => [it.id, it.x, it.y, it.k]);
      s.cb = this.broken;
      s.sd = this.sdN || 0;
    }
    return s;
  }

  // ---------- bots ----------
  visibleTo(p, hunters) {
    if (p.fx.invis > 0) return false;
    if (hunters.length && hunters.every(h => h.fx.blind > 0)) return hunters.some(h => d2(h, p) < 45 * 45);
    if (isHideT(tileAt(this.map, p.x, p.y))) return hunters.some(h => d2(h, p) < 30 * 30);
    return true;
  }
  computeFields() {
    const alive = this.players.filter(p => p.alive), its = alive.filter(p => p.it);
    bfs(this.map, its.map(p => tileIdx(p.x, p.y)), this.fRun);
    const targets = [];
    for (const p of alive) if (!p.it && this.visibleTo(p, its)) targets.push(tileIdx(p.x, p.y));
    for (const d of this.decoys) targets.push(tileIdx(d.x, d.y));
    this.huntTargets = targets.length;
    bfs(this.map, targets, this.fHunt);
  }
  neighbors(ti) {
    const x = ti % MW, y = (ti / MW) | 0, out = [];
    const open = (nx, ny) => nx >= 0 && ny >= 0 && nx < MW && ny < MH && !solidIdx(this.map, ny * MW + nx);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (!open(x + dx, y + dy)) continue;
      if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
      out.push((y + dy) * MW + x + dx);
    }
    return out;
  }
  center(ti) { return [(ti % MW) * TS + 8, ((ti / MW) | 0) * TS + 8]; }
  steer(p, tx, ty, spd) {
    const ai = p.ai;
    let vx = tx - p.x, vy = ty - p.y;
    const l = Math.hypot(vx, vy) || 1;
    vx = vx / l + ai.jx; vy = vy / l + ai.jy;
    const l2 = Math.hypot(vx, vy) || 1;
    p.ax = vx / l2 * spd; p.ay = vy / l2 * spd;
  }
  unstick(p, dt) {
    const ai = p.ai;
    const moved = Math.hypot(p.x - ai.lx, p.y - ai.ly);
    ai.lx = p.x; ai.ly = p.y;
    if (ai.unstuck > 0) { ai.unstuck -= dt; p.ax = ai.ux; p.ay = ai.uy; return true; }
    const trying = (p.ax || p.ay) && p.fx.stun <= 0 && p.fx.frozen <= 0;
    ai.stuckT = trying && moved < 12 * dt ? ai.stuckT + dt : Math.max(0, ai.stuckT - dt);
    if (ai.stuckT > 0.45) {
      const a = Math.random() * Math.PI * 2;
      ai.ux = Math.cos(a); ai.uy = Math.sin(a); ai.unstuck = 0.3; ai.stuckT = 0; ai.wx = null;
      return true;
    }
    return false;
  }

  botGhost(p) {
    let best = null, bd = 1e9;
    for (const q of this.players) if (q.alive) { const d = d2(p, q); if (d < bd) { bd = d; best = q; } }
    if (!best || p.ghostCd > 0) { p.ax *= 0.98; p.ay *= 0.98; if (!best) return; }
    else this.steer(p, best.x, best.y, 1);
  }

  botThink(p, dt) {
    const ai = p.ai, ti = tileIdx(p.x, p.y);
    if (this.unstick(p, dt)) return;
    ai.t -= dt;
    if (ai.t <= 0) { ai.t = 0.3 + Math.random() * 0.3; ai.jx = (Math.random() - 0.5) * 0.35; ai.jy = (Math.random() - 0.5) * 0.35; }
    let tx = null, ty = null, spd = 1;
    const alive = this.players.filter(q => q.alive), its = alive.filter(q => q.it);
    const danger = this.meteors.find(m => d2(m, p) < 26 * 26);

    if (danger) { tx = p.x + (p.x - danger.x) * 3; ty = p.y + (p.y - danger.y) * 3; }
    else if (p.it) {
      let best = null, bd = 1e9;
      for (const q of alive) if (!q.it && this.visibleTo(q, [p])) { const d = d2(p, q); if (d < bd) { bd = d; best = q; } }
      for (const d of this.decoys) { const dd = d2(p, d); if (dd < bd) { bd = dd; best = d; } }
      if (best && bd < 30 * 30) { tx = best.x; ty = best.y; }
      else if (this.huntTargets && this.fHunt[ti] >= 0) {
        let bn = -1, bv = this.fHunt[ti];
        for (const n of this.neighbors(ti)) { const v = this.fHunt[n]; if (v >= 0 && (v < bv || (v === bv && Math.random() < 0.3))) { bv = v; bn = n; } }
        if (bn >= 0) [tx, ty] = this.center(bn);
      }
      if (p.rune) {
        const near = best && bd < 55 * 55;
        if ((near && ['dash', 'haste', 'shock', 'shield', 'blink', 'blind', 'phase'].includes(p.rune)) || p.held > 6) this.useRune(p);
      }
    } else {
      const d = this.fRun[ti];
      if (its.length && d >= 0 && d <= 9) {
        let bn = -1, bs = -1e9;
        for (const n of this.neighbors(ti)) {
          let look = 0;
          for (const m of this.neighbors(n)) look = Math.max(look, this.fRun[m]);
          const s = this.fRun[n] * 2 + look + Math.random() * 0.8;
          if (s > bs) { bs = s; bn = n; }
        }
        if (bn >= 0) [tx, ty] = this.center(bn);
        if (p.rune && d <= 3 && p.rune !== 'eye') this.useRune(p);
      } else {
        spd = 0.75;
        let best = null, bd = 120 * 120;
        for (const r of this.runes) if (!p.rune || r.k === 'gold') { const dd = d2(p, r); if (dd < bd) { bd = dd; best = r; } }
        if (best) { tx = best.x; ty = best.y; spd = 1; }
        if (p.rune === 'eye' && p.held > 4) this.useRune(p);
      }
    }
    if (tx === null) {
      if (ai.wx === null || Math.hypot(ai.wx - p.x, ai.wy - p.y) < 12 || Math.random() < 0.004) {
        for (let k = 0; k < 20; k++) {
          const c = pick(this.map.spawns);
          if (Math.hypot(c[0] - p.x, c[1] - p.y) < 110) { ai.wx = c[0]; ai.wy = c[1]; break; }
        }
      }
      if (ai.wx !== null) { tx = ai.wx; ty = ai.wy; spd = Math.min(spd, 0.7); }
    }
    if (tx === null) { p.ax = p.ay = 0; return; }
    this.steer(p, tx, ty, spd);
  }

  // BFS from start; returns the first tile on the path to the nearest tile matching goal, or -1
  pathStep(start, goal, avoid, maxNodes = 900) {
    if (goal(start)) return start;
    const par = this.par; par.fill(-2);
    const q = [start]; par[start] = -1;
    for (let h = 0; h < q.length && q.length < maxNodes; h++) {
      const c = q[h];
      for (const n of N4(c)) {
        if (par[n] !== -2 || solidIdx(this.map, n) || (avoid && avoid.has(n))) continue;
        par[n] = c; q.push(n);
        if (goal(n)) { let s = n; while (par[s] !== start) s = par[s]; return s; }
      }
    }
    return -1;
  }

  botBomber(p, dt) {
    const ai = p.ai;
    if (this.unstick(p, dt)) return;
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = 0.12 + Math.random() * 0.08; ai.jx = ai.jy = 0;
      const ti = tileIdx(p.x, p.y), D = this.danger, crates = this.map.crates;
      const enemies = this.players.filter(q => q.alive && q !== p);
      let goal = -1;
      if (D.has(ti)) {
        goal = this.pathStep(ti, n => !D.has(n), null);
        if (p.rune && ['dash', 'blink', 'phase', 'shield', 'haste', 'rewind'].includes(p.rune)) this.useRune(p);
      } else {
        const bt = new Set(this.blastTiles(ti, p.range));
        const crateAdj = N4(ti).some(n => crates.has(n));
        const enemyHit = enemies.some(e => bt.has(tileIdx(e.x, e.y)));
        const active = this.bombs.filter(b => b.owner === p.id).length;
        if (active < p.maxB && !this.bombs.some(b => b.i === ti) && (crateAdj || enemyHit) && Math.random() < 0.85) {
          const D2 = new Set(D.keys()); for (const n of bt) D2.add(n);
          const esc = this.pathStep(ti, n => !D2.has(n), D, 120);
          if (esc >= 0) { this.placeBomb(p); goal = esc; }
        }
        if (goal < 0) {
          const loot = new Set([...this.items, ...this.runes.filter(r => !p.rune || r.k === 'gold')].map(o => tileIdx(o.x, o.y)));
          goal = loot.size ? this.pathStep(ti, n => loot.has(n), D, 300) : -1;
          if (goal < 0) {
            const foes = new Set(enemies.map(e => tileIdx(e.x, e.y)));
            const toCrate = crates.size && Math.random() < 0.7 ? this.pathStep(ti, n => N4(n).some(m => crates.has(m)), D) : -1;
            goal = toCrate >= 0 ? toCrate : this.pathStep(ti, n => foes.has(n), D);
          }
        }
        if (p.rune && (p.held > 7 || (enemyHit && ['shock', 'trap', 'slime', 'blind'].includes(p.rune)))) this.useRune(p);
      }
      ai.goal = goal;
    }
    if (ai.goal < 0) { p.ax = p.ay = 0; return; }
    const [tx, ty] = this.center(ai.goal);
    if (Math.hypot(tx - p.x, ty - p.y) < 1.5) { p.ax = p.ay = 0; return; }
    this.steer(p, tx, ty, 1);
  }
}
