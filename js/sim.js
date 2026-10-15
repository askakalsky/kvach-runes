// Authoritative game simulation (runs on host / solo).
import { genMap, TS, MW, MH, T, collides, tileAt, tileIdx, solidIdx, bfs } from './map.js';

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
};
export const RUNE_KEYS = Object.keys(RUNES);
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
};
export const MODES = {
  classic: { name: 'Классика', desc: 'Один квач. Касание — и квач уже ты. Побеждает тот, кто меньше всех пробыл квачом.' },
  bomb:    { name: 'Горячая картошка', desc: 'У квача бомба с фитилём. Передай её касанием! Кто держит при взрыве — выбывает.' },
  infect:  { name: 'Заражение', desc: 'Пойманные становятся квачами. Выживи до конца таймера.' },
};
export const EVENTS = {
  night: { name: 'Ночь',             text: 'Солнце село. Видно только то, что рядом.', dur: 20 },
  frost: { name: 'Гололёд',          text: 'Земля покрылась льдом. Держись!', dur: 15 },
  rain:  { name: 'Звездопад рун',    text: 'С неба посыпались руны!', dur: 0 },
  adren: { name: 'Ярость квача',     text: 'Квач стал быстрее на 25%!', dur: 15 },
  chaos: { name: 'Буря телепортов',  text: 'Всех раскидало по карте!', dur: 0 },
  giant: { name: 'Безумие рун',      text: 'Все получили случайную руну!', dur: 0 },
};
export const STORYTELLERS = ['Кассандра Классик', 'Фиби Чиллакс', 'Рэнди Рэндом'];
export const BOT_NAMES = ['Рэнди', 'Тайни', 'Бёрт', 'Кассия', 'Мюррей', 'Джинджер', 'Финн', 'Хэнк', 'Ласло', 'Мира'];

const FX0 = () => ({ dash: 0, haste: 0, invis: 0, shield: 0, reach: 0, stun: 0, frozen: 0 });
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const pick = a => a[Math.floor(Math.random() * a.length)];

export function speedMult(p, mode, ev, bot) {
  const f = p.fx;
  if (f.stun > 0 || f.frozen > 0) return 0;
  let m = 1;
  if (p.it) m *= mode === 'infect' ? 1.03 : 1.08;
  if (p.it && ev === 'adren') m *= 1.25;
  if (f.haste > 0) m *= 1.5;
  if (f.dash > 0) m *= 3.4;
  if (bot) m *= 0.93;
  return m;
}
export function slippery(map, p, ev) { return ev === 'frost' || tileAt(map, p.x, p.y) === T.ICE; }

export function moveBody(map, p, ax, ay, dt, mult, slip) {
  const l = Math.hypot(ax, ay);
  if (l > 1) { ax /= l; ay /= l; }
  if (p.fx.dash > 0 && l < 0.2) { ax = p.fdx; ay = p.fdy; }
  if (tileAt(map, p.x, p.y) === T.WATER && !(p.fx.dash > 0)) mult *= 0.55;
  const k = slip ? 2.4 : 18, a = Math.min(1, k * dt);
  p.vx += (ax * BASE * mult - p.vx) * a;
  p.vy += (ay * BASE * mult - p.vy) * a;
  if (mult === 0) { p.vx = 0; p.vy = 0; }
  const stuck = collides(map, p.x, p.y, R);
  const nx = p.x + p.vx * dt;
  if (stuck || !collides(map, nx, p.y, R)) p.x = nx; else p.vx *= slip ? -0.4 : 0;
  const ny = p.y + p.vy * dt;
  if (stuck || !collides(map, p.x, ny, R)) p.y = ny; else p.vy *= slip ? -0.4 : 0;
  if (l > 0.2 && mult > 0) { const n = Math.hypot(ax, ay); p.fdx = ax / n; p.fdy = ay / n; }
  p.m = Math.hypot(p.vx, p.vy) > 12 ? 1 : 0;
}

export class Sim {
  constructor(settings, roster, seed, localId) {
    this.mode = settings.mode; this.dur = settings.dur; this.seed = seed; this.localId = localId;
    this.storyteller = settings.storyteller || pick(STORYTELLERS);
    this.map = genMap(seed);
    this.players = []; this.runes = []; this.traps = []; this.decoys = []; this.fxq = [];
    this.time = this.dur; this.phase = 'count'; this.count = 3.5;
    this.event = null; this.lastEvent = null; this.nextEvent = 25 + Math.random() * 10;
    this.runeT = 2; this.uid = 1; this.fieldT = 0; this.huntTargets = 0;
    this.fRun = new Int16Array(MW * MH); this.fHunt = new Int16Array(MW * MH);
    const spots = this.spread(roster.length, []);
    roster.forEach((r, i) => this.addPlayer(r, spots[i]));
    pick(this.players).it = true;
    this.fuse = this.newFuse();
    for (let i = 0; i < 5; i++) this.spawnRune();
  }

  spread(n, taken) {
    const out = [], pts = taken.slice(), sp = this.map.spawns;
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

  addPlayer(r, spot) {
    if (!spot) spot = this.spread(1, this.players.filter(p => p.alive).map(p => [p.x, p.y]))[0];
    const p = {
      id: r.id, name: r.name, color: r.color, hair: r.hair, hairCol: r.hairCol, bot: !!r.bot,
      x: spot[0], y: spot[1], vx: 0, vy: 0, fdx: 0, fdy: 1, m: 0, ax: 0, ay: 0,
      it: false, alive: true, score: 0, rune: null, held: 0, fx: FX0(),
      tp: 0, portalCd: 0, tagCd: 0, useSeq: 0, outAt: 0,
      ai: { lx: spot[0], ly: spot[1], stuckT: 0, unstuck: 0, ux: 0, uy: 0, wx: null, wy: null, t: 0, jx: 0, jy: 0 },
    };
    this.players.push(p);
    return p;
  }
  byId(id) { return this.players.find(p => p.id === id); }
  newFuse() { const alive = this.players.filter(p => p.alive).length; return 14 + Math.random() * 8 + Math.min(alive, 6); }
  fx(k, x, y, extra) { this.fxq.push(Object.assign({ k, x: r1(x), y: r1(y) }, extra)); }

  spawnRune(k) {
    const ps = this.players;
    for (let tries = 0; tries < 30; tries++) {
      const [x, y] = pick(this.map.walk);
      if (this.map.dyn.has(tileIdx(x, y))) continue;
      if (ps.some(p => p.alive && d2(p, { x, y }) < 48 * 48)) continue;
      if (this.runes.some(r => d2(r, { x, y }) < 40 * 40)) continue;
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
      case 'blink': {
        let bx = p.x, by = p.y;
        for (let s = 4; s <= 64; s += 4) {
          const nx = p.x + p.fdx * s, ny = p.y + p.fdy * s;
          if (!collides(this.map, nx, ny, R)) { bx = nx; by = ny; }
        }
        p.x = bx; p.y = by; p.vx = p.fdx * 60; p.vy = p.fdy * 60; p.tp++;
        break;
      }
      case 'trap': this.traps.push({ id: this.uid++, x: p.x, y: p.y, owner: p.id, arm: 0.6, life: 30 }); break;
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
    }
    this.fx('use', ox, oy, { r: k, id: p.id, x2: r1(p.x), y2: r1(p.y) });
  }

  startEvent() {
    let k;
    do k = pick(Object.keys(EVENTS)); while (k === this.lastEvent);
    this.lastEvent = k;
    const e = EVENTS[k];
    if (e.dur) this.event = { k, t: e.dur };
    const alive = this.players.filter(p => p.alive);
    if (k === 'rain') for (let i = 0; i < 8; i++) this.spawnRune();
    if (k === 'giant') for (const p of alive) if (!p.rune) p.rune = pick(RUNE_KEYS);
    if (k === 'chaos') {
      const spots = this.spread(alive.length, []);
      alive.forEach((p, i) => {
        p.x = spots[i][0]; p.y = spots[i][1]; p.vx = p.vy = 0; p.tp++;
        if (p.it) p.fx.stun = Math.max(p.fx.stun, 1); else p.tagCd = Math.max(p.tagCd, 1.5);
      });
    }
    this.fx('event', 0, 0, { e: k, s: this.storyteller });
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
      p.portalCd -= dt; p.tagCd -= dt;
      if (p.rune) p.held += dt;
    }
    if (this.event) { this.event.t -= dt; if (this.event.t <= 0) this.event = null; }
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) { this.startEvent(); this.nextEvent = 30 + Math.random() * 14; }

    this.fieldT -= dt;
    if (this.fieldT <= 0) { this.computeFields(); this.fieldT = 0.25; }
    for (const p of ps) if (p.bot && p.alive) this.botThink(p, dt);

    const ev = this.event && this.event.k;
    for (const p of ps) {
      if (!p.alive) continue;
      if (p.bot || p.id === this.localId) moveBody(this.map, p, p.ax, p.ay, dt, speedMult(p, this.mode, ev, p.bot), slippery(this.map, p, ev));
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
      if (!p.alive || p.rune) continue;
      for (let i = 0; i < this.runes.length; i++) {
        const r = this.runes[i];
        if (d2(p, r) < 11 * 11) { p.rune = r.k; p.held = 0; this.runes.splice(i, 1); this.fx('pick', r.x, r.y, { r: r.k, id: p.id }); break; }
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
    for (const [k, v] of this.map.dyn) { if (v - dt <= 0) this.map.dyn.delete(k); else this.map.dyn.set(k, v - dt); }

    this.checkTags();

    if (this.mode === 'classic') { for (const p of ps) if (p.it && p.alive) p.score += dt; }
    else if (this.mode === 'infect') { for (const p of ps) if (!p.it && p.alive) p.score += dt; }
    else {
      for (const p of ps) if (p.alive) p.score += dt;
      this.fuse -= dt;
      if (this.fuse <= 0) this.explode();
    }

    this.runeT -= dt;
    if (this.runeT <= 0) { this.runeT = 3.2; if (this.runes.length < 3 + Math.ceil(ps.length * 0.8)) this.spawnRune(); }

    const alive = ps.filter(p => p.alive);
    if (this.time <= 0) {
      this.time = 0;
      if (this.mode === 'bomb') { const h = alive.find(p => p.it); if (h) this.eliminate(h); }
      this.finish();
    } else if (this.mode === 'bomb' && alive.length <= 1) this.finish();
    else if (this.mode === 'infect' && !alive.some(p => !p.it)) this.finish();
  }

  checkTags() {
    const ps = this.players;
    for (const a of ps) {
      if (!a.alive || !a.it || a.fx.stun > 0 || a.fx.frozen > 0) continue;
      const reach = a.fx.reach > 0 ? 22 : 11, rr = reach * reach;
      for (let i = 0; i < this.decoys.length; i++) {
        const d = this.decoys[i];
        if (d.owner !== a.id && d2(a, d) < rr) { this.decoys.splice(i, 1); a.fx.stun = 0.9; this.fx('fool', d.x, d.y, { id: a.id }); break; }
      }
      if (a.fx.stun > 0) continue;
      for (const b of ps) {
        if (b === a || !b.alive || b.it || b.tagCd > 0 || b.fx.shield > 0) continue;
        if (d2(a, b) < rr) { this.tag(a, b); break; }
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
    p.alive = false; p.it = false; p.outAt = this.dur - this.time;
    this.fx('boom', p.x, p.y, { id: p.id });
    for (const q of this.players) if (q.alive && d2(p, q) < 40 * 40) q.fx.stun = Math.max(q.fx.stun, 0.8);
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
    const surv = ps.filter(p => !p.it);
    ps.sort((a, b) => ((!b.it) - (!a.it)) || (b.score - a.score));
    const title = surv.length ? (surv.length === 1 ? `${surv[0].name} выжил!` : `Выжили: ${surv.map(p => p.name).join(', ')}`) : 'Заражены все. Победила орда!';
    return { title, rows: ps.map(p => row(p, !p.it ? `выжил (${fmt(p.score)})` : `продержался ${fmt(p.score)}`, !p.it)) };
  }

  snapshot() {
    const fx = f => { const o = {}; for (const k in f) if (f[k] > 0) o[k] = r1(f[k]); return o; };
    return {
      t: 's', ph: this.phase, c: r2(this.count), tm: r2(this.time), fu: r1(this.fuse),
      ev: this.event ? { k: this.event.k, t: r1(this.event.t) } : null,
      p: this.players.map(p => ({ i: p.id, x: r1(p.x), y: r1(p.y), dx: r2(p.fdx), dy: r2(p.fdy), m: p.m, it: p.it ? 1 : 0, a: p.alive ? 1 : 0, s: r1(p.score), r: p.rune, tp: p.tp, f: fx(p.fx), b: p.bot ? 1 : 0 })),
      ru: this.runes.map(r => [r.id, r.x, r.y, r.k]),
      tr: this.traps.map(t => [t.id, Math.round(t.x), Math.round(t.y), t.owner, t.arm > 0 ? 0 : 1]),
      de: this.decoys.map(d => [d.id, r1(d.x), r1(d.y), r2(d.fdx), r2(d.fdy), d.owner]),
      w: [...this.map.dyn.keys()],
    };
  }

  // ---------- bots ----------
  visibleTo(p, hunters) {
    if (p.fx.invis > 0) return false;
    if (tileAt(this.map, p.x, p.y) === T.BUSH) return hunters.some(h => d2(h, p) < 30 * 30);
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

  botThink(p, dt) {
    const ai = p.ai, ti = tileIdx(p.x, p.y);
    const moved = Math.hypot(p.x - ai.lx, p.y - ai.ly);
    ai.lx = p.x; ai.ly = p.y;
    if (ai.unstuck > 0) { ai.unstuck -= dt; p.ax = ai.ux; p.ay = ai.uy; return; }
    const trying = (p.ax || p.ay) && p.fx.stun <= 0 && p.fx.frozen <= 0;
    ai.stuckT = trying && moved < 12 * dt ? ai.stuckT + dt : Math.max(0, ai.stuckT - dt);
    if (ai.stuckT > 0.45) {
      const a = Math.random() * Math.PI * 2;
      ai.ux = Math.cos(a); ai.uy = Math.sin(a); ai.unstuck = 0.35; ai.stuckT = 0; ai.wx = null;
      return;
    }
    ai.t -= dt;
    if (ai.t <= 0) { ai.t = 0.3 + Math.random() * 0.3; ai.jx = (Math.random() - 0.5) * 0.35; ai.jy = (Math.random() - 0.5) * 0.35; }
    let tx = null, ty = null, spd = 1;
    const alive = this.players.filter(q => q.alive), its = alive.filter(q => q.it);

    if (p.it) {
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
        if ((near && ['dash', 'haste', 'shock', 'shield', 'blink'].includes(p.rune)) || p.held > 6) this.useRune(p);
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
        if (p.rune && d <= 3) this.useRune(p);
      } else {
        spd = 0.75;
        if (!p.rune) {
          let best = null, bd = 120 * 120;
          for (const r of this.runes) { const dd = d2(p, r); if (dd < bd) { bd = dd; best = r; } }
          if (best) { tx = best.x; ty = best.y; spd = 1; }
        }
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
    let vx = tx - p.x, vy = ty - p.y;
    const l = Math.hypot(vx, vy) || 1;
    vx = vx / l + ai.jx; vy = vy / l + ai.jy;
    const l2 = Math.hypot(vx, vy) || 1;
    p.ax = vx / l2 * spd; p.ay = vy / l2 * spd;
  }
}
