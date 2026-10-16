// Authoritative game simulation (runs on host / solo).
import { genMap, TS, MW, MH, T, collides, tileAt, tileIdx, solidIdx, bfs, isHideT, isSolidT, MAP_TYPES, arenaSpiral, isWinter, BELT_DX, BELT_DY, BELT_SPEED } from './map.js';

export const R = 5, BASE = 72, SUDDEN = 50, KOTH_WIN = 45, CTF_WIN = 3, HIDE_T = 30;

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
  phase:  { name: 'Сквозь стены', col: '#e8e8ff', desc: '4 с проходишь сквозь стены, деревья и любые препятствия.' },
  gust:   { name: 'Вихрь',    col: '#9ef0e0', desc: 'Отбрасывает всех вокруг на 3 клетки.' },
  slime:  { name: 'Слизь',    col: '#8ad24a', desc: 'Лужа слизи: чужие в ней ползут вдвое медленнее.' },
  eye:    { name: 'Око',      col: '#ffe08a', desc: '6 с видишь всех — и в кустах, и невидимых.' },
  tiny:   { name: 'Кроха',    col: '#ffb07a', desc: 'Уменьшаешься на 6 с: тебя труднее поймать, ты шустрее.' },
  rewind: { name: 'Откат',    col: '#7aa8ff', desc: 'Возвращает туда, где ты был 3 с назад.' },
  blind:  { name: 'Тьма',     col: '#a07ac8', desc: 'Все остальные почти слепнут на 4 с.' },
  gold:   { name: 'Золотая',  col: '#ffcc33', desc: 'Редкая! Щит 8 с и бонус для режима (−10 с квачевания, +жизнь, +очки).' },
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
export const GIFTS = {
  shield: 'Щит!', haste: 'Скорость!', rune: 'Руна!', bonus: 'Бонус!', coal: 'Уголёк :(',
};
export const HEROES = {
  runner:    { name: 'Спринтер',  icon: '⚡', ab: 'Рывок',        cd: 5,  desc: 'Рывок каждые 5 с. Всегда бегает на 6% быстрее.' },
  ninja:     { name: 'Ниндзя',    icon: '🥷', ab: 'Дымовуха',     cd: 12, desc: 'Невидимость 3 с. В кустах не виден даже вплотную.' },
  mage:      { name: 'Маг',       icon: '🔮', ab: 'Скачок',       cd: 9,  desc: 'Телепорт на 4 клетки вперёд, даже сквозь стены.' },
  builder:   { name: 'Строитель', icon: '🧱', ab: 'Стена',        cd: 9,  desc: 'Ставит широкую стену за спиной.' },
  frost:     { name: 'Ледяной',   icon: '❄',  ab: 'Стужа',        cd: 14, desc: 'Замораживает всех рядом. Сам не скользит на льду.' },
  phantom:   { name: 'Фантом',    icon: '👻', ab: 'Сквозь стены', cd: 11, desc: '2.5 с проходит сквозь любые препятствия.' },
  brute:     { name: 'Силач',     icon: '💪', ab: 'Удар',         cd: 7,  desc: 'Отбрасывает всех рядом. Вдвое быстрее приходит в себя.' },
  trickster: { name: 'Плут',      icon: '🎭', ab: 'Двойник',      cd: 10, desc: 'Выпускает двойника и на миг исчезает.' },
};
export const HERO_KEYS = Object.keys(HEROES);
export const EMOTES = [
  { e: '😂', t: 'Ха-ха!' }, { e: '😜', t: 'Не догонишь!' }, { e: '🐢', t: 'Черепаха!' }, { e: '😎', t: 'Изи' },
  { e: '😱', t: 'Аааа!' }, { e: '👋', t: 'Пока-пока!' }, { e: '🤡', t: 'Клоун!' }, { e: '❤️', t: 'GG' },
];
export const WHISTLE_T = 20;
export const DM_WIN = 20;
export const WEAPONS = {
  fist:    { name: 'Кулаки',   melee: true, range: 15, arc: 1.1, rate: 0.32, kill: false, col: '#e8c39e' },
  bat:     { name: 'Бита',     melee: true, range: 21, arc: 1.5, rate: 0.45, kill: true, col: '#b07a44' },
  knife:   { name: 'Нож',      melee: true, range: 17, arc: 1.1, rate: 0.26, kill: true, col: '#d8d8e0' },
  katana:  { name: 'Катана',   melee: true, range: 24, arc: 1.7, rate: 0.4, kill: true, col: '#e8e8ff' },
  pistol:  { name: 'Пистолет', ammo: 12, rate: 0.3, pellets: 1, spread: 0.04, range: 260, col: '#9a9aa8' },
  shotgun: { name: 'Дробовик', ammo: 6, rate: 0.8, pellets: 7, spread: 0.3, range: 150, col: '#8a5a2a' },
  uzi:     { name: 'Узи',      ammo: 30, rate: 0.085, pellets: 1, spread: 0.14, range: 210, col: '#3a3a44' },
  rifle:   { name: 'Автомат',  ammo: 24, rate: 0.13, pellets: 1, spread: 0.05, range: 300, col: '#4a4a3a' },
};
const WEAPON_SPOTS = ['pistol', 'shotgun', 'uzi', 'bat', 'rifle', 'knife', 'pistol', 'katana', 'shotgun', 'uzi', 'bat', 'pistol', 'rifle', 'knife', 'shotgun', 'uzi'];
export const MODES = {
  classic: { name: 'Классика', desc: 'Один квач. Касание — и квач уже ты. Побеждает тот, кто меньше всех пробыл квачом.' },
  heroes:  { name: 'Герои', desc: 'Классический квач, но каждый — герой со своей способностью (кнопка действия) и пассивкой. Выбери героя в лобби.' },
  bomb:    { name: 'Горячая картошка', desc: 'У квача бомба с фитилём. Передай её касанием! Кто держит при взрыве — выбывает и становится призраком.' },
  infect:  { name: 'Заражение', desc: 'Пойманные становятся квачами. Выживи до конца таймера.' },
  bomber:  { name: 'Бомбермен', desc: 'Все с бомбами! Взрывай ящики, собирай огонь, бомбы и сапоги. 3 жизни, последний живой побеждает.' },
  ctf:     { name: 'Захват флага', desc: 'Две команды. Утащи чужой флаг к себе на базу. На своей половине касанием отправляешь врага в тюрьму. До 3 очков.' },
  hide:    { name: 'Прятки', desc: '30 секунд прячься! Потом гаснет свет, и водящий ищет с фонариком. Найденные начинают искать вместе с ним.' },
  koth:    { name: 'Король горы', desc: 'Стой в золотом круге один — копишь очки. Толкай соперников кнопкой «Толчок». Круг иногда переезжает. До 45 очков.' },
  dm:      { name: 'Майами', desc: 'Deathmatch в тёмном неоновом здании: видно только то, что выхватывает фонарь, а каждый выстрел выдаёт стрелка. Подбирай пушки, биты и катаны — всё убивает с одного удара. Кулаки сбивают с ног. Серии убийств дают КОМБО. До 20 убийств.' },
  pacman:  { name: 'Пакмен', desc: 'Лабиринт с точками и мобами. Ешь точки, бери суперточки — и сам охоться на мобов! 3 жизни, больше всех очков — победа.' },
};
export const EVENTS = {
  night:    { name: 'Ночь',              text: 'Солнце село. Видно только то, что рядом.', dur: 20, no: ['hide'] },
  frost:    { name: 'Гололёд',           text: 'Земля покрылась льдом. Держись!', dur: 15 },
  rain:     { name: 'Звездопад рун',     text: 'С неба посыпались руны!', dur: 0, no: ['dm'] },
  adren:    { name: 'Ярость квача',      text: 'Квач стал быстрее на 25%!', dur: 15, only: ['classic', 'heroes', 'bomb', 'infect'] },
  chaos:    { name: 'Буря телепортов',   text: 'Всех раскидало по карте!', dur: 0, no: ['hide', 'ctf', 'pacman'] },
  giant:    { name: 'Безумие рун',       text: 'Все получили случайную руну!', dur: 0, no: ['dm'] },
  fog:      { name: 'Туман',             text: 'Густой туман. Мини-карта ослепла.', dur: 20, no: ['hide'] },
  rush:     { name: 'Спешка',            text: 'Все бегают на 30% быстрее!', dur: 15 },
  carousel: { name: 'Карусель',          text: 'Все поменялись местами по кругу!', dur: 0, no: ['hide', 'ctf', 'pacman'] },
  gold:     { name: 'Золотая руна',      text: 'Где-то появилась золотая руна. Хватай!', dur: 0, no: ['dm'] },
  meteor:   { name: 'Метеоритный дождь', text: 'С неба падают камни! Беги из красных кругов.', dur: 12, hw: 'Тыквопад', no: ['hide', 'pacman'] },
  tiny:     { name: 'Лилипуты',          text: 'Все уменьшились на 15 секунд!', dur: 0 },
  mirror:   { name: 'Зазеркалье',        text: 'Управление перевёрнуто!', dur: 10 },
  coup:     { name: 'Переворот',         text: 'Квачом назначен случайный игрок!', dur: 0, only: ['classic', 'heroes'] },
  spirits:  { name: 'Ночь духов',        text: 'Духи вышли на охоту. Не дай им коснуться!', dur: 20, theme: ['halloween'], no: ['hide', 'pacman', 'dm'] },
  blizzard: { name: 'Метель',            text: 'Снежная буря: ничего не видно и скользко!', dur: 15, theme: ['winter', 'newyear'], no: ['hide'] },
  santa:    { name: 'Дед Мороз',         text: 'Над картой пролетели сани и рассыпали подарки!', dur: 0, theme: ['newyear'] },
};
export const THEMES = { '': 'Обычная', halloween: '🎃 Хэллоуин', winter: '❄ Зима', newyear: '🎄 Новый год' };
export const STORYTELLERS = ['Кассандра Классик', 'Фиби Чиллакс', 'Рэнди Рэндом'];
export const BOT_NAMES = ['Рэнди', 'Тайни', 'Бёрт', 'Кассия', 'Мюррей', 'Джинджер', 'Финн', 'Хэнк', 'Ласло', 'Мира'];
export const BOT_NAMES_THEME = {
  halloween: ['Тыквен', 'Бу', 'Каспер', 'Дракулич', 'Мумия', 'Скелетон', 'Ведьма', 'Вурдалак'],
  winter: ['Снежок', 'Пингвин', 'Сосулька', 'Йети', 'Морозко', 'Вьюга', 'Белка', 'Лыжник'],
  newyear: ['Снегурочка', 'Олень', 'Эльф', 'Пряник', 'Мандарин', 'Хлопушка', 'Гном', 'Ёлкин'],
};
export const TEAM_COLS = ['#d8453b', '#3f7fe0'];
export const TEAM_NAMES = ['Красные', 'Синие'];
export const MOB_COLS = ['#ff4040', '#ffa0d8', '#40e0ff', '#ffb040'];

const FX0 = () => ({ dash: 0, haste: 0, invis: 0, shield: 0, reach: 0, stun: 0, frozen: 0, phase: 0, slow: 0, eye: 0, tiny: 0, blind: 0, chill: 0 });
const ST0 = () => ({ runes: 0, portals: 0, boos: 0, caps: 0, mobs: 0, pellets: 0, bombMax: 0, gold: 0, gifts: 0, found: 0 });
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const pick = a => a[Math.floor(Math.random() * a.length)];
const N4 = i => { const x = i % MW, y = (i / MW) | 0, o = []; if (x > 0) o.push(i - 1); if (x < MW - 1) o.push(i + 1); if (y > 0) o.push(i - MW); if (y < MH - 1) o.push(i + MW); return o; };
const sameLevel = (map, a, b) => (a.z || 0) === (b.z || 0) || map.g[tileIdx(a.x, a.y)] === T.STAIRS || map.g[tileIdx(b.x, b.y)] === T.STAIRS;

export function speedMult(p, mode, ev, bot) {
  const f = p.fx;
  if (f.stun > 0 || f.frozen > 0) return 0;
  let m = 1;
  if (p.it && mode !== 'hide') m *= mode === 'infect' ? 1.03 : 1.08;
  if (p.it && ev === 'adren') m *= 1.25;
  if (ev === 'rush') m *= 1.3;
  if (f.haste > 0) m *= 1.5;
  if (f.dash > 0) m *= 3.4;
  if (f.slow > 0) m *= 0.5;
  if (f.chill > 0) m *= 0.6;
  if (f.tiny > 0) m *= 1.1;
  if (p.boots) m *= 1 + 0.12 * p.boots;
  if (p.hero === 'runner') m *= 1.06;
  if (p.carry >= 0 && p.carry !== undefined) m *= 0.9;
  if (bot) m *= 0.93;
  return m;
}
export function slippery(map, p, ev) { return p.hero !== 'frost' && (ev === 'frost' || ev === 'blizzard' || ((p.z || 0) === 0 && tileAt(map, p.x, p.y) === T.ICE)); }

// corner assist: when blocked on one axis, slide sideways into a nearby gap
function nudge(map, p, nx, ny, axisX, step, z) {
  const s = Math.max(0.6, Math.abs(step));
  for (let off = 1; off <= 7; off++) for (const sg of [1, -1]) {
    const o = off * sg;
    if (axisX ? collides(map, nx, p.y + o, R, z) : collides(map, p.x + o, ny, R, z)) continue;
    const m = Math.min(off, s) * sg;
    if (axisX) { if (!collides(map, p.x, p.y + m, R, z)) p.y += m; }
    else if (!collides(map, p.x + m, p.y, R, z)) p.x += m;
    return true;
  }
  return false;
}

export function moveBody(map, p, ax, ay, dt, mult, slip, noclip) {
  const l = Math.hypot(ax, ay);
  if (l > 1) { ax /= l; ay /= l; }
  if (p.fx.dash > 0 && l < 0.2) { ax = p.fdx; ay = p.fdy; }
  noclip = noclip || p.fx.phase > 0;
  const z = p.stairs ? -1 : (p.z || 0);
  if (!noclip && z !== 1 && tileAt(map, p.x, p.y) === T.WATER && !(p.fx.dash > 0)) mult *= 0.55;
  const k = slip ? 2.4 : 18, a = Math.min(1, k * dt);
  p.vx += (ax * BASE * mult - p.vx) * a;
  p.vy += (ay * BASE * mult - p.vy) * a;
  if (mult === 0) { p.vx = 0; p.vy = 0; }
  if (noclip || collides(map, p.x, p.y, R, z)) {
    p.x = Math.max(8, Math.min(MW * TS - 8, p.x + p.vx * dt));
    p.y = Math.max(8, Math.min(MH * TS - 8, p.y + p.vy * dt));
  } else {
    const nx = p.x + p.vx * dt;
    if (!collides(map, nx, p.y, R, z)) p.x = nx;
    else if (!(Math.abs(ay) < 0.5 && nudge(map, p, nx, p.y, true, p.vx * dt, z))) p.vx *= slip ? -0.4 : 0;
    const ny = p.y + p.vy * dt;
    if (!collides(map, p.x, ny, R, z)) p.y = ny;
    else if (!(Math.abs(ax) < 0.5 && nudge(map, p, p.x, ny, false, p.vy * dt, z))) p.vy *= slip ? -0.4 : 0;
  }
  // conveyor belts carry you along (ground floor only)
  const bi = tileIdx(p.x, p.y), bd = map.belt ? map.belt[bi] : -1;
  if (bd >= 0 && !noclip && z !== 1 && !p.stairs) {
    const bx = BELT_DX[bd] * BELT_SPEED * dt, by = BELT_DY[bd] * BELT_SPEED * dt;
    if (!collides(map, p.x + bx, p.y, R, z)) p.x += bx;
    if (!collides(map, p.x, p.y + by, R, z)) p.y += by;
  }
  // floors: stairs switch level, falling off a missing floor drops you down
  const ti = tileIdx(p.x, p.y);
  if (map.g[ti] === T.STAIRS) p.stairs = 1;
  else if (p.stairs) { p.stairs = 0; p.z = map.up[ti] ? 1 : 0; }
  else if (p.z === 1 && !map.up[ti]) p.z = 0;
  if (l > 0.2 && mult > 0) { const n = Math.hypot(ax, ay); p.fdx = ax / n; p.fdy = ay / n; }
  p.m = Math.hypot(p.vx, p.vy) > 12 ? 1 : 0;
}

export function pickMapType(mode, wanted) {
  if (mode === 'bomber') return 'arena';
  if (mode === 'pacman') return 'pacman';
  if (mode === 'dm') return 'neon';
  if (MAP_TYPES[wanted]) return wanted;
  const pool = mode === 'hide' ? ['village', 'magic', 'fort', 'graveyard', 'meadow', 'beach'] : Object.keys(MAP_TYPES);
  return pick(pool);
}

export class Sim {
  constructor(settings, roster, seed, localId) {
    this.mode = settings.mode; this.dur = settings.dur; this.seed = seed; this.localId = localId;
    this.tagMode = this.mode === 'classic' || this.mode === 'heroes';
    this.whistleT = WHISTLE_T;
    this.theme = settings.theme || '';
    this.mapType = settings.mapType;
    this.storyteller = settings.storyteller || pick(STORYTELLERS);
    this.map = genMap(seed, this.mapType, this.theme, this.mode);
    this.players = []; this.runes = []; this.traps = []; this.decoys = []; this.fxq = [];
    this.puddles = []; this.meteors = []; this.spirits = []; this.bombs = []; this.flames = []; this.items = []; this.broken = [];
    this.gifts = []; this.mobs = []; this.eaten = []; this.flags = []; this.teamScore = [0, 0];
    this.danger = new Map();
    this.time = this.dur; this.phase = 'count'; this.count = 3.5;
    this.event = null; this.lastEvent = null; this.nextEvent = 25 + Math.random() * 10; this.meteorT = 0;
    this.runeT = 2; this.giftT = 6; this.uid = 1; this.fieldT = 0; this.huntTargets = 0; this.fright = 0; this.mobT = 50;
    this.hideT = this.mode === 'hide' ? HIDE_T : 0;
    this.fRun = new Int16Array(MW * MH); this.fHunt = new Int16Array(MW * MH); this.par = new Int32Array(MW * MH);

    if (this.mode === 'ctf') this.assignTeams(roster, settings.teams);
    const spots = this.mode === 'ctf' ? roster.map(r => this.teamSpot(r.team, [])) : this.spread(roster.length, []);
    roster.forEach((r, i) => this.addPlayer(r, spots[i]));
    if (this.mode === 'bomber') for (const p of this.players) this.clearAround(tileIdx(p.x, p.y));
    else if (this.mode === 'hide') { const n = this.players.length >= 6 ? 2 : 1; for (const p of [...this.players].sort(() => Math.random() - 0.5).slice(0, n)) p.it = true; }
    else if (['classic', 'heroes', 'bomb', 'infect'].includes(this.mode)) pick(this.players).it = true;
    if (this.mode === 'ctf') {
      const bases = this.map.bases || [[4 * TS + 8, (MH >> 1) * TS + 8], [(MW - 5) * TS + 8, (MH >> 1) * TS + 8]];
      this.flags = bases.map(([x, y], t) => ({ team: t, hx: x, hy: y, x, y, carrier: null, dropT: 0 }));
    }
    if (this.mode === 'pacman') {
      const [hx, hy] = this.map.home;
      for (let k = 0; k < 4; k++) this.addMob(k, hx + (k - 1.5) * 12, hy, k * 3);
    }
    if (this.mode === 'koth') { this.zone = { x: 0, y: 0, r: 38, t: 0 }; this.moveZone(); }
    this.fuse = this.newFuse();
    if (this.mode === 'dm') this.dmSetup();
    const runes = { bomber: 2, pacman: 2 }[this.mode] ?? 5;
    for (let i = 0; i < runes; i++) this.spawnRune();
  }

  // ---------- setup helpers ----------
  assignTeams(roster, teams) {
    const humans = roster.filter(r => !r.bot), bots = roster.filter(r => r.bot);
    const half = Math.ceil(roster.length / 2);
    if (teams === 'mix' || humans.length > half) {
      [...roster].sort(() => Math.random() - 0.5).forEach((r, i) => { r.team = i % 2; });
      return;
    }
    humans.forEach(r => { r.team = 0; });
    bots.forEach((r, i) => { r.team = i < half - humans.length ? 0 : 1; });
  }
  teamSpot(team, taken) {
    const mid = MW * TS / 2;
    const side = this.map.spawns.filter(([x]) => team === 0 ? x < mid * 0.55 : x > mid * 1.45);
    return this.spread(1, taken, side.length ? side : this.map.spawns)[0];
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
  respawnSpot(p) {
    if (this.mode === 'ctf') return this.teamSpot(p.team, []);
    const others = this.players.filter(q => q.alive && q !== p).map(q => [q.x, q.y]);
    if (this.mode === 'pacman') for (const m of this.mobs) others.push([m.x, m.y], [m.x, m.y]);
    return this.spread(1, others, this.mode === 'bomber' ? this.freeSpots() : null)[0];
  }
  place(p, spot) { p.x = spot[0]; p.y = spot[1]; p.vx = p.vy = 0; p.z = 0; p.stairs = 0; p.tp++; }

  addPlayer(r, spot) {
    if (!spot) spot = this.mode === 'ctf' ? this.teamSpot(r.team ?? (this.players.filter(p => p.team === 0).length <= this.players.filter(p => p.team === 1).length ? 0 : 1), []) : this.spread(1, this.players.filter(p => p.alive).map(p => [p.x, p.y]), this.mode === 'bomber' ? this.freeSpots() : null)[0];
    let team = r.team;
    if (this.mode === 'ctf' && team === undefined) team = this.players.filter(p => p.team === 0).length <= this.players.filter(p => p.team === 1).length ? 0 : 1;
    const p = {
      id: r.id, name: r.name, color: r.color, hair: r.hair, hairCol: r.hairCol, skin: r.skin || {}, bot: !!r.bot, team: team ?? -1,
      x: spot[0], y: spot[1], vx: 0, vy: 0, fdx: 0, fdy: 1, m: 0, ax: 0, ay: 0, z: 0, stairs: 0,
      it: false, alive: true, ghost: false, ghostCd: 0, score: 0, rune: null, held: 0, fx: FX0(), st: ST0(),
      tp: 0, portalCd: 0, tagCd: 0, useSeq: 0, bombSeq: 0, outAt: 0, shoveCd: 0, carry: -1, emoteCd: 0,
      wpn: 'fist', ammo: 0, fireCd: 0, fire: false, dead: 0, down: 0, pts: 0, combo: 0, comboT: 0,
      hero: this.mode === 'heroes' ? (HEROES[r.hero] ? r.hero : pick(HERO_KEYS)) : null, abilCd: 2,
      lives: 3, maxB: 1, range: 2, boots: 0,
      hist: [], histT: 0,
      ai: { lx: spot[0], ly: spot[1], stuckT: 0, unstuck: 0, ux: 0, uy: 0, wx: null, wy: null, t: 0, jx: 0, jy: 0, goal: -1, spot: null },
    };
    this.players.push(p);
    return p;
  }
  byId(id) { return this.players.find(p => p.id === id); }
  newFuse() { const alive = this.players.filter(p => p.alive).length; return 14 + Math.random() * 8 + Math.min(alive, 6); }
  fx(k, x, y, extra) { this.fxq.push(Object.assign({ k, x: r1(x), y: r1(y) }, extra)); }

  spawnRune(k, at) {
    if (this.mode === 'dm') return;
    const ps = this.players;
    for (let tries = 0; tries < 30; tries++) {
      const [x, y] = at || pick(this.map.walk);
      const ti = tileIdx(x, y);
      if (this.map.dyn.has(ti) || this.map.crates.has(ti) || this.map.up[ti]) { if (at) return; continue; }
      if (!at && ps.some(p => p.alive && d2(p, { x, y }) < 48 * 48)) continue;
      if (!at && this.runes.some(r => d2(r, { x, y }) < 40 * 40)) continue;
      this.runes.push({ id: this.uid++, x, y, k: k || pick(RUNE_KEYS) });
      return;
    }
  }
  spawnGift(at) {
    for (let tries = 0; tries < 20; tries++) {
      const [x, y] = at || pick(this.map.walk);
      if (this.map.up[tileIdx(x, y)] || this.players.some(p => p.alive && d2(p, { x, y }) < 40 * 40)) { if (at) break; continue; }
      this.gifts.push({ id: this.uid++, x, y, c: Math.floor(Math.random() * 4) });
      return;
    }
  }

  placeWall(tx, ty, life) {
    if (tx <= 0 || ty <= 0 || tx >= MW - 1 || ty >= MH - 1) return;
    const i = ty * MW + tx;
    if (solidIdx(this.map, i) || this.map.g[i] === T.PORTAL || this.map.g[i] === T.STAIRS || this.map.up[i]) return;
    const x0 = tx * TS - R - 1, y0 = ty * TS - R - 1, x1 = tx * TS + TS + R + 1, y1 = ty * TS + TS + R + 1;
    if ([...this.players.filter(p => p.alive), ...this.decoys].some(p => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1)) return;
    this.map.dyn.set(i, life);
  }

  // push q away from (x,y) by up to dist px, stopping at walls
  shove(q, x, y, dist) {
    let dx = q.x - x, dy = q.y - y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    for (let s = dist; s > 0; s -= 4) {
      const nx = q.x + dx * s, ny = q.y + dy * s;
      if (!collides(this.map, nx, ny, R, q.stairs ? -1 : q.z)) { q.x = nx; q.y = ny; q.tp++; q.vx = q.vy = 0; return; }
    }
  }

  // primary action button: bomb in bomberman, push in king of the hill
  action(p) {
    if (this.mode === 'bomber') return this.placeBomb(p);
    if (this.mode === 'koth') return this.push(p);
    if (this.mode === 'heroes') return this.useAbility(p);
    if (this.mode === 'dm') return;
    this.useRune(p);
  }
  emote(p, e) {
    if (!p || p.emoteCd > 0 || !(e >= 0 && e < EMOTES.length)) return;
    p.emoteCd = 1.2;
    this.fx('emote', p.x, p.y, { id: p.id, e });
  }
  useAbility(p) {
    if (this.mode !== 'heroes' || !p.alive || !p.hero || this.phase !== 'play' || p.abilCd > 0 || p.fx.frozen > 0 || p.fx.stun > 0) return;
    const f = p.fx, ox = p.x, oy = p.y;
    switch (p.hero) {
      case 'runner': f.dash = 0.32; break;
      case 'ninja': f.invis = 3; break;
      case 'mage': { const keep = p.rune; p.rune = 'blink'; this.useRune(p); p.st.runes--; p.rune = keep; break; }
      case 'builder': {
        const tx = Math.floor((p.x - p.fdx * 20) / TS), ty = Math.floor((p.y - p.fdy * 20) / TS);
        const horiz = Math.abs(p.fdy) >= Math.abs(p.fdx);
        for (let i = -2; i <= 2; i++) this.placeWall(tx + (horiz ? i : 0), ty + (horiz ? 0 : i), 6);
        break;
      }
      case 'frost':
        for (const q of this.players) if (q !== p && q.alive && q.fx.shield <= 0 && d2(p, q) < 48 * 48) { q.fx.frozen = Math.max(q.fx.frozen, 1.3); q.vx = q.vy = 0; }
        break;
      case 'phantom': f.phase = 2.5; break;
      case 'brute':
        for (const q of this.players) if (q !== p && q.alive && q.fx.shield <= 0 && d2(p, q) < 42 * 42) { this.shove(q, p.x, p.y, 44); q.fx.stun = Math.max(q.fx.stun, 0.5); }
        break;
      case 'trickster':
        this.decoys.push({ id: this.uid++, x: p.x, y: p.y, fdx: p.fdx, fdy: p.fdy, owner: p.id, life: 5, m: 1 });
        f.invis = Math.max(f.invis, 1.5);
        break;
    }
    p.abilCd = HEROES[p.hero].cd;
    this.fx('ability', ox, oy, { id: p.id, h: p.hero, x2: Math.round(p.x), y2: Math.round(p.y) });
  }
  push(p) {
    if (!p.alive || this.phase !== 'play' || p.shoveCd > 0 || p.fx.stun > 0 || p.fx.frozen > 0) return;
    let best = null, bd = 26 * 26;
    for (const q of this.players) if (q !== p && q.alive && sameLevel(this.map, p, q)) { const d = d2(p, q); if (d < bd) { bd = d; best = q; } }
    p.shoveCd = 1.1;
    this.fx('shove', p.x, p.y, { id: p.id, hit: best ? best.id : '' });
    if (!best || best.fx.shield > 0) return;
    this.shove(best, p.x, p.y, 46);
    best.fx.stun = Math.max(best.fx.stun, 0.5);
  }

  useRune(p) {
    if (this.mode === 'dm') return this.throwWeapon(p);
    if (!p.alive || !p.rune || this.phase !== 'play' || p.fx.frozen > 0) return;
    if (this.mode === 'hide' && this.hideT > 0 && p.it) return;
    const k = p.rune, f = p.fx;
    p.rune = null; p.held = 0; p.st.runes++;
    const ox = p.x, oy = p.y;
    switch (k) {
      case 'dash': f.dash = 0.3; break;
      case 'haste': f.haste = 4; break;
      case 'invis': f.invis = 4.5; break;
      case 'shield': if (p.it) f.reach = 4; else f.shield = 3.5; break;
      case 'phase': f.phase = 4; break;
      case 'eye': f.eye = 6; break;
      case 'tiny': f.tiny = 6; break;
      case 'blink': {
        let bx = p.x, by = p.y;
        const z = p.stairs ? -1 : p.z;
        for (let s = 4; s <= 64; s += 4) {
          const nx = p.x + p.fdx * s, ny = p.y + p.fdy * s;
          if (!collides(this.map, nx, ny, R, z)) { bx = nx; by = ny; }
        }
        p.x = bx; p.y = by; p.vx = p.fdx * 60; p.vy = p.fdy * 60; p.tp++;
        break;
      }
      case 'rewind': {
        const h = p.hist[0];
        if (h && !collides(this.map, h[0], h[1], R, h[2])) { p.x = h[0]; p.y = h[1]; p.z = h[2]; p.stairs = 0; p.vx = p.vy = 0; p.tp++; }
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
          [p.x, q.x] = [q.x, p.x]; [p.y, q.y] = [q.y, p.y]; [p.z, q.z] = [q.z, p.z]; [p.stairs, q.stairs] = [q.stairs, p.stairs];
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
    this.flames.push({ set: new Set(tiles), t: 0.5, owner: b.owner, kills: 0 });
    this.fx('blast', b.x, b.y, { tl: tiles });
  }
  // lose a life (bomberman / pacman); returns true when hit landed
  hit(p, byId) {
    if (!p.alive || p.fx.shield > 0) return false;
    p.lives--;
    const by = byId && byId !== p.id ? this.byId(byId) : null;
    if (by && this.mode === 'bomber') by.score += 1;
    this.fx('hit', p.x, p.y, { id: p.id, by: byId || '' });
    if (p.lives <= 0) { this.eliminate(p); return true; }
    const spot = this.respawnSpot(p);
    if (spot) this.place(p, spot);
    p.fx.shield = 2.5;
    return true;
  }
  computeDanger() {
    this.danger.clear();
    for (const b of this.bombs) for (const n of this.blastTiles(b.i, b.range)) this.danger.set(n, 1);
    for (const f of this.flames) for (const n of f.set) this.danger.set(n, 1);
    for (const m of this.meteors) this.danger.set(tileIdx(m.x, m.y), 1);
  }

  // ---------- pacman ----------
  addMob(kind, x, y, wait) {
    this.mobs.push({ id: this.uid++, kind: kind % 4, x, y, state: 'wait', wait, fright: 0, next: -1, deadT: 0 });
  }
  updateMobs(dt) {
    const map = this.map, alive = this.players.filter(p => p.alive);
    if (this.fright > 0) { this.fright -= dt; if (this.fright <= 0) for (const m of this.mobs) if (m.state === 'fright') m.state = 'out'; }
    this.mobT -= dt;
    if (this.mobT <= 0 && this.mobs.length < 6) { this.mobT = 50; this.addMob(this.mobs.length, map.home[0], map.home[1], 1); }
    const speedUp = 1 + (this.dur - this.time) / 600;
    for (const m of this.mobs) {
      if (m.state === 'wait') { m.wait -= dt; if (m.wait <= 0) { m.state = 'out'; m.x = map.door[0]; m.y = map.door[1]; m.next = -1; } continue; }
      if (m.state === 'dead' && Math.hypot(m.x - map.home[0], m.y - map.home[1]) < 4) { m.deadT -= dt; if (m.deadT <= 0) { m.state = 'wait'; m.wait = 1.5; } continue; }
      const spd = BASE * (m.state === 'dead' ? 1.9 : m.state === 'fright' ? 0.5 : 0.8 * speedUp);
      const ti = tileIdx(m.x, m.y);
      const [cx, cy] = this.center(m.next >= 0 ? m.next : ti);
      if (m.next < 0 || Math.hypot(cx - m.x, cy - m.y) < 1.5) {
        let target = -1;
        if (m.state === 'dead') {
          const dt2 = tileIdx(map.home[0], map.home[1]);
          if (ti === dt2) { m.x = map.home[0]; m.y = map.home[1]; m.deadT = 1; continue; }
          target = dt2;
        } else if (m.state === 'fright') {
          let best = -1, bs = -1;
          for (const n of N4(ti)) {
            if (solidIdx(map, n) || map.g[n] === T.FLOOR) continue;
            const [nx, ny] = this.center(n);
            const s = Math.min(...alive.map(p => Math.hypot(p.x - nx, p.y - ny)), 999) + Math.random() * 20;
            if (s > bs) { bs = s; best = n; }
          }
          m.next = best; if (best < 0) continue;
        } else if (alive.length) {
          let near = alive[0], nd = 1e9;
          for (const p of alive) { const d = d2(p, m); if (d < nd) { nd = d; near = p; } }
          if (m.kind === 1) {
            const ax = near.x + near.fdx * 64, ay = near.y + near.fdy * 64, ai = tileIdx(ax, ay);
            target = solidIdx(map, ai) ? tileIdx(near.x, near.y) : ai;
          } else if (m.kind === 2 && Math.random() < 0.5) {
            target = tileIdx(...pick(map.walk));
          } else if (m.kind === 3 && nd < 100 * 100) {
            target = tileIdx(...pick(map.walk));
          } else target = tileIdx(near.x, near.y);
        }
        if (m.state !== 'fright') {
          const allowFloor = m.state === 'dead';
          const step = target >= 0 ? this.pathStep(ti, n => n === target, allowFloor ? null : this.floorSet(), 2000) : -1;
          m.next = step >= 0 ? step : (N4(ti).find(n => !solidIdx(map, n) && map.g[n] !== T.FLOOR) ?? -1);
          if (m.next === ti) m.next = N4(ti).find(n => !solidIdx(map, n) && map.g[n] !== T.FLOOR) ?? -1;
        }
        if (m.next < 0) continue;
      }
      const [tx, ty] = this.center(m.next);
      const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy) || 1, s = Math.min(l, spd * dt);
      m.x += dx / l * s; m.y += dy / l * s;
      // portal tunnels
      for (const pr of map.portals) {
        const t2 = tileIdx(m.x, m.y);
        if ((t2 === pr[0] || t2 === pr[1]) && Math.hypot(m.x - tx, m.y - ty) < 1 && !m.ported) {
          const dest = t2 === pr[0] ? pr[1] : pr[0];
          [m.x, m.y] = this.center(dest); m.next = -1; m.ported = 1;
        } else if (t2 !== pr[0] && t2 !== pr[1]) m.ported = 0;
      }
    }
    for (const m of this.mobs) {
      if (m.state === 'wait' || m.state === 'dead') continue;
      for (const p of alive) {
        if (d2(p, m) > 10 * 10) continue;
        if (m.state === 'fright') {
          m.state = 'dead'; m.next = -1; p.score += 10; p.st.mobs++;
          this.fx('eat', m.x, m.y, { id: p.id });
        } else if (this.hit(p, null)) break;
      }
    }
  }
  floorSet() {
    if (!this._floor) { this._floor = new Set(); for (let i = 0; i < MW * MH; i++) if (this.map.g[i] === T.FLOOR) this._floor.add(i); }
    return this._floor;
  }

  // ---------- deathmatch (Miami) ----------
  dmSetup() {
    this.pickups = []; this.thrown = [];
    const spots = this.spread(WEAPON_SPOTS.length, [], this.map.walk);
    spots.forEach(([x, y], i) => this.pickups.push({ id: this.uid++, x, y, k: WEAPON_SPOTS[i], ammo: WEAPONS[WEAPON_SPOTS[i]].ammo || 0, home: true, wait: 0, life: 1e9 }));
  }
  // clear line for bullets and sight (walls, trees, furniture block)
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 5);
    for (let i = 1; i < n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n, ti = tileIdx(x, y);
      if (isSolidT(this.map.g[ti]) || this.map.dyn.has(ti)) return false;
    }
    return true;
  }
  attack(p) {
    if (!p.alive || p.fx.stun > 0 || p.fx.frozen > 0 || p.fireCd > 0 || this.phase !== 'play') return;
    const w = WEAPONS[p.wpn];
    let ax = p.aimx ?? p.fdx, ay = p.aimy ?? p.fdy;
    const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
    const cx = p.x, cy = p.y - 6;
    if (w.melee) {
      p.fireCd = w.rate;
      this.fx('swing', p.x, p.y, { id: p.id, w: p.wpn, ax: r2(ax), ay: r2(ay) });
      for (const q of this.players) {
        if (q === p || !q.alive || !sameLevel(this.map, p, q)) continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d > w.range + 5 || (d > 6 && (dx * ax + dy * ay) / d < Math.cos(w.arc / 2)) || !this.los(p.x, p.y, q.x, q.y)) continue;
        if (q.fx.shield > 0) continue;
        if (w.kill || q.down > 0) this.killDM(q, p, ax, ay);
        else this.knockdown(q, p, ax, ay);
      }
      return;
    }
    if (p.ammo <= 0) { p.fireCd = 0.35; this.fx('empty', p.x, p.y, { id: p.id }); return; }
    p.ammo--; p.fireCd = w.rate; p.flashT = 0.45;
    const ends = [], base = Math.atan2(ay, ax);
    for (let k = 0; k < w.pellets; k++) {
      const a = base + (Math.random() - 0.5) * 2 * w.spread, dx = Math.cos(a), dy = Math.sin(a);
      let ex = cx, ey = cy, victim = null;
      for (let s = 6; s <= w.range; s += 4) {
        const x = cx + dx * s, y = cy + dy * s, ti = tileIdx(x, y);
        if (isSolidT(this.map.g[ti]) || this.map.dyn.has(ti)) break;
        ex = x; ey = y;
        victim = this.players.find(q => q !== p && q.alive && (q.x - x) ** 2 + (q.y - 6 - y) ** 2 < 49);
        if (victim) break;
      }
      ends.push([Math.round(ex), Math.round(ey)]);
      if (victim && victim.alive && victim.fx.shield <= 0) this.killDM(victim, p, dx, dy);
    }
    this.fx('shot', cx, cy, { id: p.id, w: p.wpn, e: ends });
  }
  knockdown(q, by, dx, dy) {
    q.down = 1.7; q.fx.stun = Math.max(q.fx.stun, 1.7); q.vx = q.vy = 0;
    this.shove(q, q.x - dx, q.y - dy, 10);
    if (q.wpn !== 'fist') this.dropWeapon(q, 8);
    this.fx('punch', q.x, q.y, { id: q.id, by: by.id });
  }
  dropWeapon(q, scatter = 0) {
    if (q.wpn === 'fist') return;
    this.pickups.push({ id: this.uid++, x: q.x + (Math.random() - 0.5) * scatter, y: q.y + (Math.random() - 0.5) * scatter, k: q.wpn, ammo: q.ammo, home: false, wait: 0, life: 15 });
    q.wpn = 'fist'; q.ammo = 0;
  }
  killDM(q, by, dx, dy) {
    if (!q.alive) return;
    this.dropWeapon(q, 10);
    q.alive = false; q.ghost = false; q.dead = 2.6; q.down = 0; q.fire = false;
    for (const k in q.fx) q.fx[k] = 0;
    if (by && by !== q) {
      by.score++;
      by.combo = by.comboT > 0 ? by.combo + 1 : 1; by.comboT = 3.5;
      by.pts += 100 * by.combo;
      if (by.score >= DM_WIN) this.finish();
    } else q.score = Math.max(0, q.score - 1);
    this.fx('kill', q.x, q.y, { id: q.id, by: by ? by.id : '', c: by ? by.combo : 0, dx: r2(dx), dy: r2(dy) });
  }
  respawnDM(p) {
    const foes = this.players.filter(q => q.alive && q !== p).map(q => [q.x, q.y]);
    this.place(p, this.spread(1, foes, this.map.walk)[0]);
    p.alive = true; p.dead = 0; p.fx.shield = 1.6; p.wpn = 'fist'; p.ammo = 0; p.fireCd = 0.4;
    this.fx('spawn', p.x, p.y, { id: p.id });
  }
  throwWeapon(p) {
    if (!p.alive || p.fx.stun > 0 || this.phase !== 'play') return;
    const under = this.pickups.find(k => !k.wait && d2(k, p) < 12 * 12);
    if (under) { this.takePickup(p, under); return; }
    if (p.wpn === 'fist') return;
    const ax = p.aimx ?? p.fdx, ay = p.aimy ?? p.fdy;
    this.thrown.push({ id: this.uid++, x: p.x, y: p.y - 6, vx: ax * 320, vy: ay * 320, k: p.wpn, ammo: p.ammo, owner: p.id, t: 0.6 });
    p.wpn = 'fist'; p.ammo = 0; p.fireCd = 0.25;
    this.fx('throw', p.x, p.y, { id: p.id, ax: r2(ax), ay: r2(ay) });
  }
  // in the dark you only see what your flashlight hits, who is right next to you, or who just fired
  seenInDark(p, q) {
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d < 40 || ((q.flashT || 0) > 0 && d < 260)) return true;
    const ax = p.aimx ?? p.fdx, ay = p.aimy ?? p.fdy;
    return d < 165 && (dx * ax + dy * ay) / d > 0.8;
  }
  takePickup(p, k) {
    if (p.wpn !== 'fist') this.dropWeapon(p, 0);
    p.wpn = k.k; p.ammo = k.ammo; p.fireCd = 0.15;
    if (k.home) { k.wait = 12; k.ammo = WEAPONS[k.k].ammo || 0; } else k.life = 0;
    this.fx('grab', k.x, k.y, { id: p.id, w: p.wpn });
  }
  updateDM(dt) {
    for (const p of this.players) {
      if (!p.alive) { if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0 && this.phase === 'play') this.respawnDM(p); } continue; }
      p.fireCd -= dt; p.down = Math.max(0, p.down - dt); p.flashT = Math.max(0, (p.flashT || 0) - dt);
      if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }
      if (p.fire && p.fireCd <= 0) this.attack(p);
      if (p.wpn === 'fist' && p.down <= 0) {
        const k = this.pickups.find(q => !q.wait && d2(q, p) < 11 * 11);
        if (k) this.takePickup(p, k);
      }
    }
    for (const k of this.pickups) { if (k.wait > 0) { k.wait -= dt; if (k.wait <= 0) k.wait = 0; } if (!k.home) k.life -= dt; }
    this.pickups = this.pickups.filter(k => k.home || k.life > 0);
    for (const t of this.thrown) {
      t.t -= dt;
      const nx = t.x + t.vx * dt, ny = t.y + t.vy * dt, ti = tileIdx(nx, ny);
      const hitWall = isSolidT(this.map.g[ti]) || this.map.dyn.has(ti);
      const victim = this.players.find(q => q.alive && q.id !== t.owner && (q.x - nx) ** 2 + (q.y - 6 - ny) ** 2 < 100);
      if (victim && victim.fx.shield <= 0) { this.knockdown(victim, this.byId(t.owner) || victim, t.vx / 320, t.vy / 320); t.t = 0; }
      if (hitWall || t.t <= 0) {
        t.t = 0;
        this.pickups.push({ id: this.uid++, x: hitWall ? t.x : nx, y: (hitWall ? t.y : ny) + 6, k: t.k, ammo: t.ammo, home: false, wait: 0, life: 15 });
      } else { t.x = nx; t.y = ny; }
    }
    this.thrown = this.thrown.filter(t => t.t > 0);
  }
  botDM(p, dt) {
    const ai = p.ai;
    if (this.unstick(p, dt)) { p.fire = false; return; }
    const w = WEAPONS[p.wpn];
    ai.th = (ai.th || 0) - dt;
    if (ai.th <= 0) {
      ai.th = 0.15 + Math.random() * 0.1;
      let ne = null, nd = 1e9;
      for (const q of this.players) if (q !== p && q.alive && q.fx.invis <= 0) { const d = d2(p, q); if (d < nd && d < 260 * 260 && this.seenInDark(p, q) && this.los(p.x, p.y - 6, q.x, q.y - 6)) { nd = d; ne = q; } }
      ai.ne = ne; ai.nd = Math.sqrt(nd);
      if (!ne) ai.react = 0.25 + Math.random() * 0.25;
      if (!w.melee && p.ammo <= 0) { if (ne && ai.nd < 140) { p.aimx = (ne.x - p.x) / ai.nd; p.aimy = (ne.y - p.y) / ai.nd; } this.throwWeapon(p); }
      let gun = null, gd = 1e9;
      for (const k of this.pickups) if (!k.wait && (WEAPONS[k.k].melee ? p.wpn === 'fist' : WEAPONS[p.wpn].melee || p.ammo <= 0)) { const d = d2(k, p); if (d < gd) { gd = d; gun = k; } }
      ai.gun = gun && (!ne || gd < nd * 0.6 || p.wpn === 'fist') ? gun : null;
      if (!ne && !ai.gun && (!ai.hunt || Math.random() < 0.05)) { const alive = this.players.filter(q => q !== p && q.alive); ai.hunt = alive.length ? pick(alive) : null; }
    }
    const ne = ai.ne && ai.ne.alive ? ai.ne : null;
    ai.react = (ai.react || 0) - dt;
    if (ne) {
      const dx = ne.x - p.x, dy = ne.y - p.y, d = Math.hypot(dx, dy) || 1;
      const want = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.25;
      const cur = Math.atan2(p.aimy ?? p.fdy, p.aimx ?? p.fdx);
      let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const turn = Math.max(-7 * dt, Math.min(7 * dt, diff));
      p.aimx = Math.cos(cur + turn); p.aimy = Math.sin(cur + turn);
      const aligned = Math.abs(diff) < 0.25 && ai.react <= 0;
      if (w.melee) { p.fire = aligned && d < w.range + 6; if (!ai.gun) this.steer(p, ne.x, ne.y, 1); }
      else {
        p.fire = aligned && d < w.range * 0.9;
        const sg = Math.sin(this.time * 1.7 + p.x * 0.01) > 0 ? 1 : -1, sx = -dy / d * sg, sy = dx / d * sg;
        if (d > 130) this.goTo(p, dt, ne.x, ne.y);
        else if (d < 55) this.steer(p, p.x - dx + sx * 20, p.y - dy + sy * 20, 1);
        else { p.ax = sx * 0.8; p.ay = sy * 0.8; }
      }
      if (ai.gun && w.melee && d > 70) this.goTo(p, dt, ai.gun.x, ai.gun.y);
    } else {
      p.fire = false;
      if (ai.gun) this.goTo(p, dt, ai.gun.x, ai.gun.y);
      else if (ai.hunt && ai.hunt.alive) this.goTo(p, dt, ai.hunt.x, ai.hunt.y, 0.85);
      else this.wander(p, 0.8);
      const m = Math.hypot(p.ax, p.ay);
      if (m > 0.2) { p.aimx = p.ax / m; p.aimy = p.ay / m; }
    }
  }

  // ---------- capture the flag ----------
  updateFlags(dt) {
    const mid = MW * TS / 2;
    for (const f of this.flags) {
      if (f.carrier) {
        const c = this.byId(f.carrier);
        if (!c || !c.alive) { f.carrier = null; f.dropT = 6; if (c) c.carry = -1; }
        else { f.x = c.x; f.y = c.y; }
      } else if (f.x !== f.hx || f.y !== f.hy) {
        f.dropT -= dt;
        if (f.dropT <= 0) { f.x = f.hx; f.y = f.hy; this.fx('flagback', f.x, f.y, { team: f.team }); }
      }
    }
    for (const p of this.players) {
      if (!p.alive || p.fx.frozen > 0) continue;
      for (const f of this.flags) {
        if (f.carrier || d2(p, f) > 13 * 13) continue;
        const home = f.x === f.hx && f.y === f.hy;
        if (p.team !== f.team && p.carry < 0) { f.carrier = p.id; p.carry = f.team; this.fx('flagtake', p.x, p.y, { id: p.id, team: f.team }); }
        else if (p.team === f.team && !home) { f.x = f.hx; f.y = f.hy; this.fx('flagback', f.x, f.y, { team: f.team, id: p.id }); }
      }
      if (p.carry >= 0) {
        const own = this.flags[p.team];
        if (!own.carrier && own.x === own.hx && own.y === own.hy && Math.hypot(p.x - own.hx, p.y - own.hy) < 18) {
          const en = this.flags[p.carry];
          en.carrier = null; en.x = en.hx; en.y = en.hy; p.carry = -1;
          this.teamScore[p.team]++; p.st.caps++; p.score++;
          this.fx('capture', p.x, p.y, { id: p.id, team: p.team });
          if (this.teamScore[p.team] >= CTF_WIN) this.finish();
        }
      }
    }
    // tagging intruders on your half sends them to jail
    for (const a of this.players) {
      if (!a.alive || a.fx.stun > 0 || a.fx.frozen > 0) continue;
      for (const b of this.players) {
        if (!b.alive || b.team === a.team || b.tagCd > 0 || b.fx.shield > 0 || !sameLevel(this.map, a, b)) continue;
        const bSide = b.x < mid ? 0 : 1;
        if (bSide !== a.team || d2(a, b) > 11 * 11) continue;
        if (b.carry >= 0) { const f = this.flags[b.carry]; f.carrier = null; f.dropT = 6; b.carry = -1; }
        this.fx('jail', b.x, b.y, { a: a.id, b: b.id });
        this.place(b, this.teamSpot(b.team, []));
        b.fx.stun = 1.2; b.tagCd = 2.5; a.score += 0.5;
      }
    }
  }

  // ---------- king of the hill ----------
  moveZone() {
    const z = this.zone;
    for (let k = 0; k < 40; k++) {
      const [x, y] = pick(this.map.spawns);
      if (this.map.up[tileIdx(x, y)]) continue;
      if (k < 35 && (Math.hypot(x - z.x, y - z.y) < 160 || collides(this.map, x, y, 20))) continue;
      z.x = x; z.y = y; break;
    }
    z.t = 35;
    this.fx('zone', z.x, z.y, {});
  }
  updateZone(dt) {
    const z = this.zone;
    z.t -= dt;
    if (z.t <= 0) this.moveZone();
    const inside = this.players.filter(p => p.alive && Math.hypot(p.x - z.x, p.y - z.y) < z.r);
    z.owner = inside.length === 1 ? inside[0].id : null;
    z.contested = inside.length > 1;
    if (inside.length === 1) {
      const p = inside[0];
      p.score += dt;
      if (p.score >= KOTH_WIN) { p.score = KOTH_WIN; this.finish(); }
    }
  }

  // ---------- events ----------
  startEvent() {
    const ok = k => {
      const e = EVENTS[k];
      return (!e.no || !e.no.includes(this.mode)) && (!e.only || e.only.includes(this.mode)) && (!e.theme || e.theme.includes(this.theme)) && k !== this.lastEvent;
    };
    const k = pick(Object.keys(EVENTS).filter(ok));
    if (!k) return;
    this.lastEvent = k;
    const e = EVENTS[k];
    if (e.dur) this.event = { k, t: e.dur };
    const alive = this.players.filter(p => p.alive);
    if (k === 'rain') for (let i = 0; i < 8; i++) this.spawnRune();
    if (k === 'gold') this.spawnRune('gold');
    if (k === 'santa') for (let i = 0; i < 6; i++) this.spawnGift();
    if (k === 'giant') for (const p of alive) if (!p.rune) p.rune = pick(RUNE_KEYS);
    if (k === 'tiny') for (const p of alive) p.fx.tiny = 15;
    if (k === 'chaos') {
      const spots = this.spread(alive.length, [], this.mode === 'bomber' ? this.freeSpots() : null);
      alive.forEach((p, i) => {
        this.place(p, spots[i]);
        if (p.it) p.fx.stun = Math.max(p.fx.stun, 1); else p.tagCd = Math.max(p.tagCd, 1.5);
      });
    }
    if (k === 'carousel' && alive.length > 1) {
      const pos = alive.map(p => [p.x, p.y, p.z]);
      alive.forEach((p, i) => {
        const q = pos[(i + 1) % pos.length];
        p.x = q[0]; p.y = q[1]; p.z = q[2]; p.stairs = 0; p.vx = p.vy = 0; p.tp++;
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

  openGift(p, g) {
    let r = pick(['shield', 'haste', 'rune', 'bonus', 'bonus', 'coal']);
    if (r === 'rune' && p.rune) r = 'bonus';
    if (r === 'shield') p.fx.shield = Math.max(p.fx.shield, 3);
    if (r === 'haste') p.fx.haste = Math.max(p.fx.haste, 3);
    if (r === 'rune') p.rune = pick(RUNE_KEYS);
    if (r === 'bonus') {
      if (this.tagMode) p.score = Math.max(0, p.score - 3);
      else if (this.mode === 'pacman') p.score += 5;
      else if (this.mode === 'koth') p.score = Math.min(KOTH_WIN - 1, p.score + 2);
      else if (this.mode === 'bomber') p.range = Math.min(8, p.range + 1);
      else p.fx.shield = Math.max(p.fx.shield, 2);
    }
    p.st.gifts++;
    this.fx('gift', g.x, g.y, { id: p.id, g: r });
  }

  update(dt) {
    const ps = this.players, map = this.map;
    if (this.phase === 'end') return;
    if (this.phase === 'count') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const after = Math.ceil(this.count);
      if (after !== before && after > 0) this.fx('count', 0, 0, { n: after });
      if (this.count <= 0) { this.phase = 'play'; this.fx('go', 0, 0, { hide: this.mode === 'hide' ? 1 : 0 }); }
      return;
    }
    this.time -= dt;
    if (this.mode === 'hide' && this.hideT > 0) {
      this.hideT -= dt;
      for (const p of ps) if (p.it) { p.fx.stun = Math.max(p.fx.stun, 0.15); p.vx = p.vy = 0; }
      if (this.hideT <= 0) { this.hideT = 0; this.fx('seek', 0, 0, {}); this.nextEvent = Math.max(this.nextEvent, 20); }
    } else if (this.mode === 'hide') {
      // hiders whistle on a timer and give away their position
      this.whistleT -= dt;
      if (this.whistleT <= 0) {
        this.whistleT = WHISTLE_T;
        const hiders = ps.filter(p => p.alive && !p.it);
        for (const p of hiders) this.fx('whistle', p.x, p.y, { id: p.id });
        for (const s of ps) if (s.bot && s.alive && s.it && hiders.length) {
          const h = hiders.reduce((a, b) => d2(a, s) < d2(b, s) ? a : b);
          s.ai.last = [h.x, h.y];
        }
      }
    }
    for (const p of ps) {
      for (const k in p.fx) if (p.fx[k] > 0) p.fx[k] = Math.max(0, p.fx[k] - dt);
      if (p.hero === 'brute') { p.fx.stun = Math.max(0, p.fx.stun - dt); p.fx.frozen = Math.max(0, p.fx.frozen - dt); }
      p.portalCd -= dt; p.tagCd -= dt; p.ghostCd -= dt; p.shoveCd -= dt; p.emoteCd -= dt;
      if (p.abilCd > 0) p.abilCd = Math.max(0, p.abilCd - dt);
      if (p.rune) p.held += dt;
      p.histT -= dt;
      if (p.histT <= 0 && p.alive) { p.histT = 0.25; p.hist.push([p.x, p.y, p.stairs ? 0 : p.z]); if (p.hist.length > 12) p.hist.shift(); }
    }
    if (this.event) {
      this.event.t -= dt;
      if (this.event.k === 'meteor') { this.meteorT -= dt; if (this.meteorT <= 0) { this.meteorT = 0.4; this.spawnMeteor(); } }
      if (this.event.t <= 0) { if (this.event.k === 'spirits') this.spirits = []; this.event = null; }
    }
    if (!(this.mode === 'hide' && this.hideT > 0)) {
      this.nextEvent -= dt;
      if (this.nextEvent <= 0) { this.startEvent(); this.nextEvent = 28 + Math.random() * 14; }
    }

    const bomber = this.mode === 'bomber', grid = bomber || this.mode === 'pacman';
    if (bomber) this.computeDanger();
    if (!grid) { this.fieldT -= dt; if (this.fieldT <= 0) { this.computeFields(); this.fieldT = 0.25; } }
    for (const p of ps) {
      if (!p.bot) continue;
      if (!p.alive) { if (p.ghost) this.botGhost(p); continue; }
      if (bomber) this.botBomber(p, dt);
      else if (this.mode === 'dm') this.botDM(p, dt);
      else if (this.mode === 'pacman') this.botPacman(p, dt);
      else if (this.mode === 'ctf') this.botCTF(p, dt);
      else if (this.mode === 'koth') this.botKoth(p, dt);
      else if (this.mode === 'hide') this.botHide(p, dt);
      else this.botThink(p, dt);
    }

    const ev = this.event && this.event.k;
    for (const p of ps) {
      if (!(p.bot || p.id === this.localId)) continue;
      if (p.alive) { moveBody(map, p, p.ax, p.ay, dt, speedMult(p, this.mode, ev, p.bot), slippery(map, p, ev)); if (this.mode === 'dm' && p.aimx !== undefined) { p.fdx = p.aimx; p.fdy = p.aimy; } }
      else if (p.ghost) { const f = p.fx; f.stun = f.frozen = 0; moveBody(map, p, p.ax, p.ay, dt, 0.9, false, true); }
    }

    for (const d of this.decoys) {
      d.life -= dt;
      const nx = d.x + d.fdx * BASE * dt, ny = d.y + d.fdy * BASE * dt;
      if (collides(map, nx, ny, R)) {
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2, fx = Math.cos(a), fy = Math.sin(a);
          if (!collides(map, d.x + fx * 5, d.y + fy * 5, R)) { d.fdx = fx; d.fdy = fy; break; }
        }
      } else { d.x = nx; d.y = ny; }
    }
    this.decoys = this.decoys.filter(d => { if (d.life > 0) return true; this.fx('poof', d.x, d.y, {}); return false; });

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
        const [x, y] = pick(map.walk); s.x = x; s.y = y; s.cd = 1.5;
      }
    }
    for (const g of ps) {
      if (g.alive || !g.ghost || g.ghostCd > 0) continue;
      for (const q of ps) if (q.alive && q.fx.shield <= 0 && d2(g, q) < 11 * 11) {
        q.fx.chill = 1.6; g.ghostCd = 5; g.st.boos++;
        this.fx('boo', q.x, q.y, { id: q.id, g: g.id });
        break;
      }
    }

    for (const p of ps) {
      if (!p.alive || p.portalCd > 0 || p.z === 1) continue;
      const ti = tileIdx(p.x, p.y);
      for (const pr of map.portals) {
        const dest = ti === pr[0] ? pr[1] : ti === pr[1] ? pr[0] : -1;
        if (dest < 0) continue;
        const ox = p.x, oy = p.y;
        this.place(p, this.center(dest)); p.portalCd = 1.6; p.st.portals++;
        this.fx('portal', ox, oy, { x2: p.x, y2: p.y, id: p.id });
        break;
      }
    }

    for (const p of ps) {
      if (!p.alive) continue;
      for (let i = 0; i < this.runes.length; i++) {
        const r = this.runes[i];
        if (d2(p, r) >= 11 * 11 || p.z === 1) continue;
        if (r.k === 'gold') {
          p.fx.shield = 8; p.st.gold++;
          if (this.tagMode) p.score = Math.max(0, p.score - 10);
          if (bomber || this.mode === 'pacman') p.lives = Math.min(5, p.lives + 1);
          if (this.mode === 'pacman') p.score += 20;
          if (this.mode === 'koth') p.score = Math.min(KOTH_WIN - 1, p.score + 5);
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
      for (let i = 0; i < this.gifts.length; i++) {
        const g = this.gifts[i];
        if (d2(p, g) >= 11 * 11 || p.z === 1) continue;
        this.gifts.splice(i, 1);
        this.openGift(p, g);
        break;
      }
      if (this.mode === 'pacman') {
        const ti = tileIdx(p.x, p.y);
        if (map.pellets.delete(ti)) {
          this.eaten.push(ti); p.score += 1; p.st.pellets++;
          if (map.power.has(ti)) {
            this.fright = 7;
            for (const m of this.mobs) if (m.state === 'out') { m.state = 'fright'; m.next = -1; }
            this.fx('power', p.x, p.y, { id: p.id });
          } else this.fx('pel', 0, 0, { id: p.id });
        }
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
    for (const [k, v] of map.dyn) { if (v - dt <= 0) map.dyn.delete(k); else map.dyn.set(k, v - dt); }

    if (bomber && this.time < SUDDEN) {
      if (!this.sd) { this.sd = arenaSpiral(); this.sdN = 0; this.sdT = 0; this.fx('sudden', 0, 0, {}); }
      this.sdT -= dt;
      while (this.sdT <= 0 && this.sdN < this.sd.length) {
        this.sdT += 0.32;
        const i = this.sd[this.sdN++];
        if (map.crates.delete(i)) this.broken.push(i);
        map.dyn.set(i, 1e9);
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
        for (const p of ps) if (p.alive && f.set.has(tileIdx(p.x, p.y)) && this.hit(p, f.owner) && f.owner !== p.id) {
          f.kills++;
          const o = this.byId(f.owner); if (o) o.st.bombMax = Math.max(o.st.bombMax, f.kills);
        }
        this.items = this.items.filter(it => it.safe > 0 || !f.set.has(tileIdx(it.x, it.y)));
      }
      this.flames = this.flames.filter(f => f.t > 0);
    }
    if (this.mode === 'dm') this.updateDM(dt);
    else if (this.mode === 'pacman') this.updateMobs(dt);
    else if (this.mode === 'ctf') this.updateFlags(dt);
    else if (this.mode === 'koth') this.updateZone(dt);
    else if (!bomber && !(this.mode === 'hide' && this.hideT > 0)) this.checkTags();

    if (this.tagMode) { for (const p of ps) if (p.it && p.alive) p.score += dt; }
    else if (this.mode === 'infect' || this.mode === 'hide') { for (const p of ps) if (!p.it && p.alive) p.score += dt; }
    else if (this.mode === 'bomb') {
      for (const p of ps) if (p.alive) p.score += dt;
      this.fuse -= dt;
      if (this.fuse <= 0) this.explode();
    }

    this.runeT -= dt;
    if (this.runeT <= 0) {
      this.runeT = grid ? 6 : 3.2;
      if (this.runes.length < (grid ? 2 : 3) + Math.ceil(ps.length * (grid ? 0.4 : 0.8))) this.spawnRune();
    }
    if (this.theme === 'newyear') {
      this.giftT -= dt;
      if (this.giftT <= 0) { this.giftT = 11; if (this.gifts.length < 3) this.spawnGift(); }
    }

    if (this.phase === 'end') return;
    const alive = ps.filter(p => p.alive);
    if (this.time <= 0) {
      this.time = 0;
      if (this.mode === 'bomb') { const h = alive.find(p => p.it); if (h) this.eliminate(h); }
      this.finish();
    } else if ((this.mode === 'bomb' || bomber) && alive.length <= 1) this.finish();
    else if ((this.mode === 'infect' || this.mode === 'hide') && !alive.some(p => !p.it)) this.finish();
    else if (this.mode === 'pacman' && (map.pellets.size === 0 || alive.length === 0)) this.finish();
  }

  setIt(p) { p.it = true; p.st.wasIt = 1; }

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
        if (b === a || !b.alive || b.it || b.tagCd > 0 || b.fx.shield > 0 || !sameLevel(this.map, a, b)) continue;
        const rr = b.fx.tiny > 0 ? reach * 0.6 : reach;
        if (d2(a, b) < rr * rr) { this.tag(a, b); break; }
      }
    }
  }

  tag(a, b) {
    b.fx.invis = 0;
    if (this.mode === 'infect' || this.mode === 'hide') {
      this.setIt(b); b.fx.stun = 1.0; a.st.found++;
      this.fx('tag', b.x, b.y, { a: a.id, b: b.id, inf: this.mode === 'infect' ? 1 : 0, found: this.mode === 'hide' ? 1 : 0 });
      return;
    }
    a.it = false; a.tagCd = 1.3;
    this.setIt(b); b.fx.stun = Math.max(b.fx.stun, 1.0);
    if (this.mode === 'bomb' && this.fuse < 4) this.fuse = 4;
    this.fx('tag', b.x, b.y, { a: a.id, b: b.id });
    // bots like to tease
    if (a.bot && Math.random() < 0.4) this.emote(a, pick([0, 1, 5]));
    else if (b.bot && Math.random() < 0.25) this.emote(b, pick([4, 6]));
  }

  eliminate(p) {
    p.alive = false; p.it = false; p.ghost = true; p.ghostCd = 2; p.rune = null; p.outAt = this.dur - this.time; p.z = 0; p.stairs = 0;
    for (const k in p.fx) p.fx[k] = 0;
    this.fx('boom', p.x, p.y, { id: p.id });
    if (this.mode === 'bomb') for (const q of this.players) if (q.alive && d2(p, q) < 40 * 40) q.fx.stun = Math.max(q.fx.stun, 0.8);
  }

  explode() {
    const h = this.players.find(p => p.alive && p.it);
    if (h) this.eliminate(h);
    const alive = this.players.filter(p => p.alive);
    if (alive.length > 1) {
      const n = pick(alive);
      this.setIt(n); n.fx.stun = Math.max(n.fx.stun, 1.5);
      this.fuse = this.newFuse();
      this.fx('newbomb', n.x, n.y, { id: n.id });
    }
  }

  finish() { if (this.phase === 'end') return; this.phase = 'end'; this.fx('end', 0, 0, {}); }

  results() {
    const ps = [...this.players];
    const fmt = s => s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} с`;
    const row = (p, label, win) => ({ id: p.id, name: p.name, color: p.color, label, win: !!win, score: Math.round(p.score * 10) / 10, alive: p.alive, it: p.it, team: p.team, st: p.st, lives: p.lives });
    const out = (title, rows) => ({ title, rows, mode: this.mode, theme: this.theme, map: this.mapType });
    if (this.tagMode) {
      ps.sort((a, b) => a.score - b.score);
      return out(`Победил ${ps[0].name}!`, ps.map((p, i) => row(p, `квачом ${fmt(p.score)}`, i === 0)));
    }
    if (this.mode === 'bomb') {
      ps.sort((a, b) => (b.alive - a.alive) || (b.score - a.score));
      return out(`Победил ${ps[0].name}!`, ps.map((p, i) => row(p, p.alive ? 'выжил!' : `взорван на ${fmt(p.outAt)}`, i === 0)));
    }
    if (this.mode === 'bomber') {
      ps.sort((a, b) => (b.alive - a.alive) || (b.lives - a.lives) || (b.score - a.score) || (b.outAt - a.outAt));
      return out(`Победил ${ps[0].name}!`, ps.map((p, i) => row(p, `${p.alive ? '❤' + p.lives : 'выбыл'} · взрывов: ${p.score}`, i === 0)));
    }
    if (this.mode === 'dm') {
      ps.sort((a, b) => b.score - a.score || b.pts - a.pts);
      return out(`${ps[0].name} — хозяин Майами!`, ps.map((p, i) => row(p, `убийств: ${p.score} · очков: ${p.pts}`, i === 0)));
    }
    if (this.mode === 'pacman') {
      ps.sort((a, b) => b.score - a.score);
      const clear = this.map.pellets.size === 0 ? ' Лабиринт очищен!' : '';
      return out(`Победил ${ps[0].name}!${clear}`, ps.map((p, i) => row(p, `${p.score} очков · мобов: ${p.st.mobs}`, i === 0)));
    }
    if (this.mode === 'koth') {
      ps.sort((a, b) => b.score - a.score);
      return out(`${ps[0].name} — король горы!`, ps.map((p, i) => row(p, `на троне ${fmt(p.score)}`, i === 0)));
    }
    if (this.mode === 'ctf') {
      const [a, b] = this.teamScore, win = a === b ? -1 : a > b ? 0 : 1;
      ps.sort((x, y) => (x.team === win ? -1 : 0) - (y.team === win ? -1 : 0) || y.st.caps - x.st.caps);
      const title = win < 0 ? `Ничья ${a}:${b}` : `Победили ${TEAM_NAMES[win]}! ${a}:${b}`;
      return out(title, ps.map(p => row(p, `${TEAM_NAMES[p.team]} · флагов: ${p.st.caps}`, p.team === win)));
    }
    const surv = ps.filter(p => !p.it);
    ps.sort((a, b) => ((!b.it) - (!a.it)) || (b.score - a.score));
    const hide = this.mode === 'hide';
    const title = surv.length ? (surv.length === 1 ? `${surv[0].name} ${hide ? 'так и не нашли' : 'выжил'}!` : `${hide ? 'Не нашли' : 'Выжили'}: ${surv.map(p => p.name).join(', ')}`) : hide ? 'Всех нашли! Победили водящие' : 'Заражены все. Победила орда!';
    return out(title, ps.map(p => row(p, !p.it ? `${hide ? 'не нашли' : 'выжил'} (${fmt(p.score)})` : hide ? `продержался ${fmt(p.score)}` : `продержался ${fmt(p.score)}`, surv.length ? !p.it : p.it)));
  }

  snapshot() {
    const fx = f => { const o = {}; for (const k in f) if (f[k] > 0) o[k] = r1(f[k]); return o; };
    const bomber = this.mode === 'bomber', lives = bomber || this.mode === 'pacman';
    const s = {
      t: 's', ph: this.phase, c: r2(this.count), tm: r2(this.time), fu: r1(this.fuse), ht: r1(this.hideT), wh: r1(this.whistleT),
      ev: this.event ? { k: this.event.k, t: r1(this.event.t) } : null,
      p: this.players.map(p => {
        const o = { i: p.id, x: r1(p.x), y: r1(p.y), dx: r2(p.fdx), dy: r2(p.fdy), m: p.m, it: p.it ? 1 : 0, a: p.alive ? 1 : 0, g: p.ghost ? 1 : 0, s: r1(p.score), r: p.rune, tp: p.tp, f: fx(p.fx), b: p.bot ? 1 : 0, z: p.z, st: p.stairs };
        if (lives) o.l = p.lives;
        if (bomber) { o.bo = p.boots; o.pw = [p.maxB, p.range]; }
        if (this.mode === 'ctf') { o.tm = p.team; o.c = p.carry; }
        if (p.hero) { o.h = p.hero; o.cd = r1(p.abilCd); }
        if (this.mode === 'dm') { o.w = p.wpn; o.am = p.ammo; o.dn = p.down > 0 ? 1 : 0; o.pt = p.pts; o.fl = (p.flashT || 0) > 0 ? 1 : 0; }
        return o;
      }),
      ru: this.runes.map(r => [r.id, r.x, r.y, r.k]),
      tr: this.traps.map(t => [t.id, Math.round(t.x), Math.round(t.y), t.owner, t.arm > 0 ? 0 : 1]),
      de: this.decoys.map(d => [d.id, r1(d.x), r1(d.y), r2(d.fdx), r2(d.fdy), d.owner]),
      pu: this.puddles.map(p => [p.id, Math.round(p.x), Math.round(p.y), p.owner]),
      mt: this.meteors.map(m => [m.id, Math.round(m.x), Math.round(m.y), r2(m.t)]),
      sp: this.spirits.map(s2 => [s2.id, r1(s2.x), r1(s2.y)]),
      gf: this.gifts.map(g => [g.id, g.x, g.y, g.c]),
      w: [...this.map.dyn.keys()],
    };
    if (bomber) {
      s.bm = this.bombs.map(b => [b.id, b.x, b.y, r2(b.t)]);
      s.im = this.items.map(it => [it.id, it.x, it.y, it.k]);
      s.cb = this.broken;
      s.sd = this.sdN || 0;
    }
    if (this.mode === 'pacman') {
      s.mb = this.mobs.map(m => [m.id, r1(m.x), r1(m.y), m.kind, m.state === 'fright' ? 1 : m.state === 'dead' ? 2 : 0]);
      s.pe = this.eaten; s.fr = r1(this.fright);
    }
    if (this.mode === 'ctf') { s.fl = this.flags.map(f => [Math.round(f.x), Math.round(f.y), f.carrier || '']); s.ts = this.teamScore; }
    if (this.mode === 'dm') { s.pk = this.pickups.filter(k => !k.wait).map(k => [k.id, Math.round(k.x), Math.round(k.y), k.k]); s.tw = this.thrown.map(k => [k.id, Math.round(k.x), Math.round(k.y), k.k]); }
    if (this.mode === 'koth') s.kz = [Math.round(this.zone.x), Math.round(this.zone.y), this.zone.r, this.zone.owner || '', this.zone.contested ? 1 : 0, r1(this.zone.t)];
    return s;
  }

  // ---------- bots ----------
  visibleTo(p, hunters) {
    if (p.fx.invis > 0) return false;
    if (this.mode === 'hide') return hunters.some(h => this.seesInDark(h, p));
    if (hunters.length && hunters.every(h => h.fx.blind > 0)) return hunters.some(h => d2(h, p) < 45 * 45);
    if (p.hero === 'ninja' && isHideT(tileAt(this.map, p.x, p.y))) return false;
    if (isHideT(tileAt(this.map, p.x, p.y)) || (p.z === 0 && this.map.up[tileIdx(p.x, p.y)])) return hunters.some(h => d2(h, p) < 30 * 30);
    return true;
  }
  // seeker flashlight: a cone in front plus a small halo
  seesInDark(h, p) {
    if (!sameLevel(this.map, h, p)) return false;
    const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy);
    if (d < 26) return true;
    if (d > 130 || isHideT(tileAt(this.map, p.x, p.y))) return false;
    return (dx * h.fdx + dy * h.fdy) / (d || 1) > 0.82;
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
      ai.ux = Math.cos(a); ai.uy = Math.sin(a); ai.unstuck = 0.3; ai.stuckT = 0; ai.wx = null; ai.goal = -1;
      return true;
    }
    return false;
  }
  // walk the shortest ground path toward a pixel target (re-planned every few frames)
  goTo(p, dt, tx, ty, spd = 1) {
    const ai = p.ai;
    ai.t -= dt;
    if (ai.t <= 0 || ai.tgt !== tileIdx(tx, ty)) {
      ai.t = 0.2 + Math.random() * 0.1; ai.jx = ai.jy = 0;
      const ti = tileIdx(p.x, p.y), goal = tileIdx(tx, ty);
      ai.tgt = goal;
      ai.goal = ti === goal ? -1 : this.pathStep(ti, n => n === goal, null, 2500);
    }
    if (Math.hypot(tx - p.x, ty - p.y) < 20 || ai.goal < 0) { this.steer(p, tx, ty, spd); return; }
    const [cx, cy] = this.center(ai.goal);
    if (Math.hypot(cx - p.x, cy - p.y) < 2) ai.t = 0;
    this.steer(p, cx, cy, spd);
  }
  wander(p, spd = 0.7) {
    const ai = p.ai;
    if (ai.wx === null || Math.hypot(ai.wx - p.x, ai.wy - p.y) < 12 || Math.random() < 0.004) {
      for (let k = 0; k < 20; k++) {
        const c = pick(this.map.spawns);
        if (Math.hypot(c[0] - p.x, c[1] - p.y) < 110) { ai.wx = c[0]; ai.wy = c[1]; break; }
      }
    }
    if (ai.wx === null) { p.ax = p.ay = 0; return; }
    this.steer(p, ai.wx, ai.wy, spd);
  }

  botGhost(p) {
    let best = null, bd = 1e9;
    for (const q of this.players) if (q.alive) { const d = d2(p, q); if (d < bd) { bd = d; best = q; } }
    if (!best) { p.ax = p.ay = 0; return; }
    if (p.ghostCd > 0) { p.ax *= 0.98; p.ay *= 0.98; }
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
    if (this.mode === 'heroes' && p.abilCd <= 0) {
      const chased = !p.it && its.some(q => d2(q, p) < 50 * 50);
      const near = p.it && alive.some(q => !q.it && d2(q, p) < 45 * 45);
      if (chased || (near && !['builder', 'ninja', 'trickster'].includes(p.hero))) this.useAbility(p);
    }

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
        for (const r of [...this.runes, ...this.gifts]) if (!p.rune || r.k === 'gold' || r.c !== undefined) { const dd = d2(p, r); if (dd < bd) { bd = dd; best = r; } }
        if (best) { tx = best.x; ty = best.y; spd = 1; }
        if (p.rune === 'eye' && p.held > 4) this.useRune(p);
      }
    }
    if (tx === null) { this.wander(p, Math.min(spd, 0.7)); return; }
    this.steer(p, tx, ty, spd);
  }

  botHide(p, dt) {
    const ai = p.ai;
    if (this.unstick(p, dt)) return;
    const seekers = this.players.filter(q => q.alive && q.it);
    if (p.it) {
      if (this.hideT > 0) { p.ax = p.ay = 0; return; }
      let best = null, bd = 1e9;
      for (const q of this.players) if (q.alive && !q.it && q.fx.invis <= 0 && this.seesInDark(p, q)) { const d = d2(p, q); if (d < bd) { bd = d; best = q; } }
      if (best) { ai.last = [best.x, best.y]; this.goTo(p, dt, best.x, best.y); if (p.rune && ['dash', 'haste', 'shock', 'blink'].includes(p.rune)) this.useRune(p); return; }
      if (ai.last) { this.goTo(p, dt, ai.last[0], ai.last[1]); if (Math.hypot(ai.last[0] - p.x, ai.last[1] - p.y) < 14) ai.last = null; return; }
      if (!ai.spot || Math.hypot(ai.spot[0] - p.x, ai.spot[1] - p.y) < 14) ai.spot = pick(this.map.hides.length && Math.random() < 0.7 ? this.map.hides : this.map.spawns);
      this.goTo(p, dt, ai.spot[0], ai.spot[1], 0.85);
      if (p.rune === 'eye' || p.held > 8) this.useRune(p);
      return;
    }
    if (!ai.spot) {
      const far = this.map.hides.filter(h => seekers.every(s => Math.hypot(s.x - h[0], s.y - h[1]) > 150));
      ai.spot = pick(far.length ? far : this.map.hides.length ? this.map.hides : this.map.spawns);
    }
    const threat = seekers.find(s => this.seesInDark(s, p) || d2(s, p) < 40 * 40);
    if (threat && this.hideT <= 0) {
      const away = [p.x + (p.x - threat.x) * 2, p.y + (p.y - threat.y) * 2];
      this.steer(p, away[0], away[1], 1);
      if (p.rune) this.useRune(p);
      ai.spot = null;
      return;
    }
    if (Math.hypot(ai.spot[0] - p.x, ai.spot[1] - p.y) < 4) { p.ax = p.ay = 0; return; }
    this.goTo(p, dt, ai.spot[0], ai.spot[1], 1);
  }

  botCTF(p, dt) {
    const ai = p.ai;
    if (this.unstick(p, dt)) return;
    const mid = MW * TS / 2, my = this.flags[p.team], en = this.flags[1 - p.team];
    const mates = this.players.filter(q => q.team === p.team && q.bot).sort((a, b) => a.id < b.id ? -1 : 1);
    const role = mates.indexOf(p) % 2 === 0 ? 'att' : 'def';
    const enemies = this.players.filter(q => q.alive && q.team !== p.team);
    const onMySide = q => (q.x < mid ? 0 : 1) === p.team;
    let tgt;
    if (p.carry >= 0) tgt = [my.hx, my.hy];
    else if (my.carrier) { const c = this.byId(my.carrier); tgt = [c.x, c.y]; }
    else if (my.x !== my.hx || my.y !== my.hy) tgt = [my.x, my.y];
    else if (role === 'att') tgt = en.carrier ? [my.hx + (p.team ? -60 : 60), my.hy] : [en.x, en.y];
    else {
      const intr = enemies.filter(onMySide).sort((a, b) => d2(a, p) - d2(b, p))[0];
      if (intr) tgt = [intr.x, intr.y];
      else {
        if (!ai.spot || Math.random() < 0.005) ai.spot = [my.hx + (Math.random() - 0.5) * 120 + (p.team ? -40 : 40), my.hy + (Math.random() - 0.5) * 120];
        tgt = ai.spot;
      }
    }
    this.goTo(p, dt, tgt[0], tgt[1]);
    if (p.rune) {
      const near = enemies.some(e => d2(e, p) < 45 * 45);
      if ((near && !onMySide(p)) || p.carry >= 0 || p.held > 7) this.useRune(p);
    }
  }

  botKoth(p, dt) {
    const z = this.zone;
    if (this.unstick(p, dt)) return;
    const inZone = Math.hypot(p.x - z.x, p.y - z.y) < z.r * 0.7;
    if (inZone) {
      const rival = this.players.find(q => q !== p && q.alive && d2(p, q) < 24 * 24);
      if (rival && p.shoveCd <= 0 && Math.random() < 0.3) this.push(p);
      if (rival) this.steer(p, rival.x, rival.y, 0.6); else { p.ax *= 0.8; p.ay *= 0.8; }
    } else this.goTo(p, dt, z.x, z.y);
    if (p.rune && (p.held > 6 || (!inZone && ['dash', 'haste', 'blink'].includes(p.rune)))) this.useRune(p);
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

  botPacman(p, dt) {
    const ai = p.ai, map = this.map;
    if (this.unstick(p, dt)) return;
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = 0.12 + Math.random() * 0.06; ai.jx = ai.jy = 0;
      const ti = tileIdx(p.x, p.y);
      const D = new Set(), hunters = this.mobs.filter(m => m.state === 'out');
      for (const m of hunters) {
        const mi = tileIdx(m.x, m.y), mx = mi % MW, my = (mi / MW) | 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2) D.add((my + dy) * MW + mx + dx);
      }
      const floor = this.floorSet();
      const avoid = new Set([...D, ...floor]);
      let goal = -1;
      if (D.has(ti)) goal = this.pathStep(ti, n => !D.has(n), floor, 400);
      else if (this.fright > 2) {
        const prey = new Set(this.mobs.filter(m => m.state === 'fright').map(m => tileIdx(m.x, m.y)));
        if (prey.size) goal = this.pathStep(ti, n => prey.has(n), floor, 1500);
      }
      if (goal < 0 && !D.has(ti)) goal = this.pathStep(ti, n => map.pellets.has(n), avoid, 2500);
      ai.goal = goal;
      if (p.rune && (D.has(ti) || p.held > 8)) this.useRune(p);
    }
    if (ai.goal < 0) { this.wander(p, 0.8); return; }
    const [tx, ty] = this.center(ai.goal);
    this.steer(p, tx, ty, 1);
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
          const loot = new Set([...this.items, ...this.gifts, ...this.runes.filter(r => !p.rune || r.k === 'gold')].map(o => tileIdx(o.x, o.y)));
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
