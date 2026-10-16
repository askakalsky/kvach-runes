import { genMap, MAP_TYPES } from './map.js';
import { Sim, RUNES, ITEMS, MODES, EVENTS, THEMES, GIFTS, STORYTELLERS, BOT_NAMES, BOT_NAMES_THEME, TEAM_COLS, TEAM_NAMES, KOTH_WIN, CTF_WIN, speedMult, slippery, moveBody, pickMapType, SUDDEN } from './sim.js';
import { Renderer, drawPawn, drawRuneIcon } from './render.js';
import { HATS, CAPES, TRAILS, ACH, loadStats, unlocked, reqText, recordResult } from './skins.js';
import * as A from './audio.js';
import { input, joy, initInput, readMove } from './input.js';
import { hostRoom, joinRoom, netAvailable } from './net.js';

const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const COLORS = ['#c8463d', '#3f7fc4', '#4f9a45', '#d9a63a', '#8e58b0', '#d9772e', '#2fa39a', '#d8d2c4'];
const HAIRCOLS = ['#3b2a1a', '#6b4423', '#c9a25a', '#1c1c1c', '#a33b1e', '#d9d3c3'];
const MAX_PLAYERS = 8;

let stats = loadStats();
const prof = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('kvach-prof')); } catch (e) { }
  if (!s || !s.name) s = { name: 'Игрок' + (100 + Math.floor(Math.random() * 900)), color: pick(COLORS), hair: Math.floor(Math.random() * 4), hairCol: pick(HAIRCOLS) };
  s.skin = Object.assign({ hat: 'none', cape: 'none', trail: 'none' }, s.skin);
  return s;
})();
const saveProf = () => { try { localStorage.setItem('kvach-prof', JSON.stringify(prof)); } catch (e) { } };
const meInfo = id => ({ id, name: prof.name, color: prof.color, hair: prof.hair, hairCol: prof.hairCol, skin: { ...prof.skin } });
const cleanSkin = s => ({ hat: HATS[s && s.hat] ? s.hat : 'none', cape: CAPES[s && s.cape] ? s.cape : 'none', trail: TRAILS[s && s.trail] ? s.trail : 'none' });

const canvas = $('game');
const R = new Renderer(canvas);
let role = null, myId = null, peer = null, hostConn = null;
const conns = new Map();
let roster = [];
const month = new Date().getMonth();
const settings = {
  mode: 'classic', bots: 3, dur: 180, map: 'random', teams: 'hvb',
  theme: month === 9 ? 'halloween' : month === 11 || month === 0 ? 'newyear' : month === 1 || month === 10 ? 'winter' : '',
};
let sim = null, pendingFx = [], lastSend = 0, results = null, nextPid = 1;
let cl = null;
let view = null;

// ---------- screens ----------
function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== name);
  $('hud').classList.toggle('hidden', name !== 'game' && name !== 'results');
  input.enabled = name === 'game';
  joy.active = false; joy.id = null; input.useQ = 0; input.actQ = 0;
  if (name === 'menu' || name === 'lobby' || name === 'profile') A.setMusic('menu');
}
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms);
}
let centerT = 0;
function center(txt, col) {
  const c = $('center');
  c.textContent = txt; c.style.color = col || '';
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  centerT = 1.3;
}
function banner(title, text, story) {
  const b = $('banner');
  b.innerHTML = '';
  for (const [tag, s] of [['small', story ? 'Рассказчик ' + story : ''], ['b', title], ['span', text]]) {
    const el = document.createElement(tag); el.textContent = s; b.appendChild(el);
  }
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(banner.h); banner.h = setTimeout(() => b.classList.remove('on'), 4200);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeCol = c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#888888';
function applyTheme(th) {
  document.body.dataset.theme = th || '';
  A.setTheme(th);
}

// ---------- menu ----------
$('nameIn').value = prof.name;
$('nameIn').addEventListener('input', e => { prof.name = e.target.value.trim().slice(0, 12) || 'Игрок'; saveProf(); });
function renderSwatches() {
  const box = $('colors');
  box.innerHTML = '';
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw' + (c === prof.color ? ' on' : '');
    b.style.background = c;
    b.onclick = () => { prof.color = c; saveProf(); renderSwatches(); A.sfx('click'); };
    box.appendChild(b);
  });
}
renderSwatches();
$('hairBtn').onclick = () => { prof.hair = (prof.hair + 1) % 4; if (prof.hair === 0) prof.hairCol = pick(HAIRCOLS); saveProf(); A.sfx('click'); };

const params = new URLSearchParams(location.search);
if (params.get('room')) { $('codeIn').value = params.get('room').toUpperCase().slice(0, 4); $('joinBtn').classList.add('glow'); }

document.addEventListener('click', e => { if (e.target.closest('button')) A.audioInit(); }, true);

$('soloBtn').onclick = () => {
  role = 'solo'; myId = 'h'; roster = [meInfo('h')];
  renderLobby(); show('lobby');
};
$('hostBtn').onclick = () => {
  if (!netAvailable()) return toast('Сетевая библиотека не загрузилась. Проверь интернет.');
  role = 'host'; myId = 'h'; roster = [meInfo('h')];
  $('roomCode').textContent = '····';
  renderLobby(); show('lobby');
  hostRoom({
    onReady: (code, p) => { peer = p; $('roomCode').textContent = code; renderLobby(); },
    onConn: c => setupHostConn(c),
    onError: e => { console.warn(e); toast('Ошибка сети: ' + (e.type || e)); },
  });
};
$('joinBtn').onclick = () => {
  const code = $('codeIn').value.trim().toUpperCase();
  if (code.length !== 4) return toast('Введи код комнаты из 4 букв');
  if (!netAvailable()) return toast('Сетевая библиотека не загрузилась. Проверь интернет.');
  role = 'client'; myId = null;
  toast('Подключаюсь к ' + code + '…', 8000);
  peer = joinRoom(code, {
    onOpen: c => { hostConn = c; c.send({ t: 'hello', ...meInfo(null) }); },
    onData: onClientMsg,
    onClose: () => { if (role === 'client') { toast('Связь с хостом потеряна'); leaveAll(); } },
    onError: e => {
      console.warn(e);
      const msg = e.type === 'peer-unavailable' ? 'Комната ' + code + ' не найдена' : e.type === 'timeout' ? 'Не удалось подключиться (попробуй Wi-Fi)' : 'Ошибка сети: ' + (e.type || e);
      toast(msg); leaveAll();
    },
  });
};
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
$('helpBtn').onclick = () => show('help');
$('helpBack').onclick = () => show('menu');
$('profBtn').onclick = () => { renderProfile(); show('profile'); };
$('profBack').onclick = () => show('menu');

function leaveAll() {
  role = null; sim = null; cl = null; results = null;
  for (const { conn } of conns.values()) try { conn.close(); } catch (e) { }
  conns.clear();
  if (peer) try { peer.destroy(); } catch (e) { }
  peer = null; hostConn = null;
  applyTheme(settings.theme);
  show('menu');
}

// ---------- profile: records, achievements, skins ----------
const MODE_SHORT = Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, m.name]));
function renderProfile() {
  const s = stats;
  const best = [
    ['Рекорд пакмена', s.best.pacman != null ? s.best.pacman + ' очков' : '—'],
    ['Король горы', s.best.koth != null ? s.best.koth.toFixed(1) + ' с' : '—'],
    ['Взрывов за бомбермена', s.best.bomber ?? '—'],
    ['Флагов за матч', s.best.ctf ?? '—'],
    ['Лучшая классика', s.best.classic != null ? s.best.classic.toFixed(1) + ' с квачом' : '—'],
    ['Рун за матч', s.best.runes ?? '—'],
  ];
  $('statsBox').innerHTML = `<div class="kv"><b>${s.games}</b><span>игр</span></div><div class="kv"><b>${s.wins}</b><span>побед</span></div><div class="kv"><b>${Object.keys(s.ach).length}/${Object.keys(ACH).length}</b><span>ачивок</span></div>`
    + `<ul class="best">${best.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}`
    + Object.entries(s.winsBy).map(([m, n]) => `<li><span>Побед: ${esc(MODE_SHORT[m] || m)}</span><b>${n}</b></li>`).join('') + '</ul>';
  $('achBox').innerHTML = Object.entries(ACH).map(([k, a]) => `<div class="ach ${s.ach[k] ? 'on' : ''}"><b>${s.ach[k] ? '★' : '☆'} ${a.name}</b><span>${a.desc}</span></div>`).join('');
  for (const [slot, list, box] of [['hat', HATS, 'hatBox'], ['cape', CAPES, 'capeBox'], ['trail', TRAILS, 'trailBox']]) {
    const el = $(box);
    el.innerHTML = '';
    for (const [k, item] of Object.entries(list)) {
      const ok = unlocked(item, s);
      const b = document.createElement('button');
      b.className = 'skin' + (prof.skin[slot] === k ? ' on' : '') + (ok ? '' : ' locked');
      b.innerHTML = `<b>${ok ? '' : '🔒 '}${item.name}</b>${ok ? '' : `<span>${reqText(item)}</span>`}`;
      b.onclick = () => { if (!ok) { toast('Откроется за ' + reqText(item)); return; } prof.skin[slot] = k; saveProf(); A.sfx('click'); renderProfile(); };
      el.appendChild(b);
    }
  }
}

// ---------- lobby ----------
$('mapSel').innerHTML = '<option value="random">Случайная</option>' + Object.entries(MAP_TYPES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
$('modeSel').innerHTML = Object.entries(MODES).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
$('themeSel').innerHTML = Object.entries(THEMES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
$('modeSel').onchange = e => { settings.mode = e.target.value; renderLobby(); pushLobby(); };
$('mapSel').onchange = e => { settings.map = e.target.value; renderLobby(); pushLobby(); };
$('themeSel').onchange = e => { settings.theme = e.target.value; renderLobby(); pushLobby(); };
$('teamSel').onchange = e => { settings.teams = e.target.value; renderLobby(); pushLobby(); };
$('botsIn').oninput = e => { settings.bots = +e.target.value; renderLobby(); pushLobby(); };
$('durSel').onchange = e => { settings.dur = +e.target.value; pushLobby(); };
$('startBtn').onclick = () => startMatch();
$('leaveBtn').onclick = () => leaveAll();
$('shareBtn').onclick = async () => {
  const code = $('roomCode').textContent;
  const url = location.origin + location.pathname + '?room=' + code;
  try {
    if (navigator.share) await navigator.share({ title: 'Квач: Рунные бега', text: 'Го в квача! Код комнаты: ' + code, url });
    else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована!'); }
  } catch (e) { try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована!'); } catch (e2) { toast(url, 6000); } }
};

function lobbyData() { return { t: 'lobby', roster: roster.map(({ id, name, color, hair, hairCol }) => ({ id, name, color, hair, hairCol })), settings: { ...settings } }; }
function pushLobby() { if (role === 'host') broadcast(lobbyData()); }

function renderLobby(data) {
  const d = data || lobbyData(), s = d.settings;
  const isHost = role === 'host' || role === 'solo';
  applyTheme(s.theme);
  $('roomBox').classList.toggle('hidden', role === 'solo' || role === 'client');
  $('lobbyTitle').textContent = role === 'solo' ? 'Игра с ботами' : role === 'client' ? 'Комната' : 'Твоя комната';
  $('hostOpts').classList.toggle('hidden', !isHost);
  $('waitMsg').classList.toggle('hidden', isHost);
  $('modeSel').value = settings.mode; $('botsIn').value = settings.bots; $('durSel').value = settings.dur;
  $('mapSel').value = settings.map; $('themeSel').value = settings.theme; $('teamSel').value = settings.teams;
  const fixedMap = settings.mode === 'bomber' || settings.mode === 'pacman';
  $('mapSel').disabled = fixedMap;
  $('teamRow').classList.toggle('hidden', settings.mode !== 'ctf');
  $('botsVal').textContent = settings.bots;
  $('modeDesc').textContent = MODES[s.mode].desc + (s.mode === 'bomber' ? ' Карта — арена с ящиками.' : s.mode === 'pacman' ? ' Карта — неоновый лабиринт.' : '');
  const mapName = s.mode === 'bomber' ? 'Арена' : s.mode === 'pacman' ? 'Лабиринт пакмена' : MAP_TYPES[s.map] || 'случайная карта';
  $('clientMode').textContent = `${MODES[s.mode].name} · ${mapName} · ${s.dur / 60} мин · ботов: ${s.bots} · ${THEMES[s.theme] || ''}`;
  $('clientMode').classList.toggle('hidden', isHost);
  const list = $('roster');
  list.innerHTML = '';
  for (const r of d.roster) {
    const li = document.createElement('div');
    li.className = 'pl';
    li.innerHTML = `<i style="background:${safeCol(r.color)}"></i><span>${esc(r.name)}${r.id === myId ? ' (ты)' : ''}${r.id === 'h' ? ' ★' : ''}</span>`;
    list.appendChild(li);
  }
  const nb = Math.max(0, Math.min(MAX_PLAYERS - d.roster.length, s.bots));
  if (nb) { const li = document.createElement('div'); li.className = 'pl bot'; li.innerHTML = `<i></i><span>+ ботов: ${nb}</span>`; list.appendChild(li); }
}

// ---------- host networking ----------
function broadcast(msg) { for (const { conn } of conns.values()) if (conn.open) try { conn.send(msg); } catch (e) { } }
function setupHostConn(conn) {
  conn.on('data', m => onHostMsg(conn, m));
  conn.on('close', () => {
    const info = conns.get(conn.peer);
    conns.delete(conn.peer);
    if (!info) return;
    roster = roster.filter(r => r.id !== info.id);
    if (sim) { const p = sim.byId(info.id); if (p) { p.bot = true; p.name += ' 🤖'; } broadcast({ t: 'roster', roster: rosterInfo() }); }
    toast(`${info.name} вышел`);
    renderLobby(); pushLobby();
  });
}
function rosterInfo() { return sim.players.map(({ id, name, color, hair, hairCol, bot, skin, team }) => ({ id, name, color, hair, hairCol, bot, skin, team })); }
function startMsg() { return { t: 'start', seed: sim.seed, mode: sim.mode, dur: sim.dur, mapType: sim.mapType, theme: sim.theme, roster: rosterInfo() }; }

function onHostMsg(conn, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    if (roster.length >= MAX_PLAYERS) { conn.send({ t: 'full' }); return; }
    const id = 'p' + (nextPid++);
    const info = { id, name: String(m.name || 'Игрок').slice(0, 12), color: COLORS.includes(m.color) ? m.color : pick(COLORS), hair: (m.hair | 0) % 4, hairCol: HAIRCOLS.includes(m.hairCol) ? m.hairCol : HAIRCOLS[0], skin: cleanSkin(m.skin) };
    conns.set(conn.peer, { conn, id, name: info.name });
    roster.push(info);
    conn.send({ t: 'welcome', id });
    toast(`${info.name} зашёл!`);
    A.sfx('pick');
    if (sim && sim.phase !== 'end') {
      sim.addPlayer({ ...info });
      conn.send(startMsg());
      broadcast({ t: 'roster', roster: rosterInfo() });
    } else { renderLobby(); pushLobby(); }
    return;
  }
  const info = conns.get(conn.peer);
  if (!info || !sim) return;
  const p = sim.byId(info.id);
  if (!p) return;
  if (m.t === 'in') {
    if (m.tp === p.tp && (p.alive || p.ghost) && sim.phase === 'play' && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      if (Math.hypot(m.x - p.x, m.y - p.y) < 120) { p.x = m.x; p.y = m.y; p.z = m.z === 1 ? 1 : 0; p.stairs = m.st ? 1 : 0; } else p.tp++;
      if (Number.isFinite(m.dx)) { p.fdx = m.dx; p.fdy = m.dy; }
      p.m = m.m ? 1 : 0;
    }
    if (m.u > p.useSeq) { p.useSeq = m.u; sim.useRune(p); }
    if (m.bs > p.bombSeq) { p.bombSeq = m.bs; sim.action(p); }
  }
}

function startMatch() {
  if (role !== 'host' && role !== 'solo') return;
  A.audioInit();
  roster.forEach(r => { if (r.id === myId) Object.assign(r, meInfo(myId)); });
  const total = Math.min(MAX_PLAYERS, roster.length + settings.bots);
  if (total < 2) return toast('Нужен хотя бы один бот или друг');
  const pool = BOT_NAMES_THEME[settings.theme] || BOT_NAMES;
  const names = pool.filter(n => !roster.some(r => r.name === n)).sort(() => Math.random() - 0.5);
  const bots = [];
  for (let i = roster.length; i < total; i++)
    bots.push({ id: 'b' + i, name: names.pop() || 'Бот' + i, color: COLORS[(i * 3 + 1) % COLORS.length], hair: i % 4, hairCol: HAIRCOLS[i % HAIRCOLS.length], bot: true });
  const seed = Math.floor(Math.random() * 1e9);
  const humans = roster.map(r => ({ ...r, team: undefined }));
  sim = new Sim({ ...settings, mapType: pickMapType(settings.mode, settings.map), storyteller: pick(STORYTELLERS) }, [...humans, ...bots], seed, myId);
  pendingFx = []; results = null;
  R.setMap(sim.map, seed);
  broadcast(startMsg());
  enterGame(sim.mode, sim.theme);
}
function enterGame(mode, theme) {
  show('game');
  results = null; lastRune = undefined; lastTick = -1;
  applyTheme(theme); A.setMusic('game');
  const act = { bomber: ['💣', 'бомба'], koth: ['✊', 'толчок'] }[mode];
  $('bombBtn').classList.toggle('hidden', !act);
  if (act) { $('bombBtn').querySelector('b').textContent = act[0]; $('bombBtn').querySelector('span').textContent = act[1]; }
  $('keysHint').textContent = act ? `WASD — бег · ПРОБЕЛ — ${act[1]} · E — руна` : 'WASD — бег · ПРОБЕЛ / E — руна';
}

// ---------- client networking ----------
function send(m) { if (hostConn && hostConn.open) try { hostConn.send(m); } catch (e) { } }
function onClientMsg(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome': myId = m.id; toast('Подключено!'); break;
    case 'full': toast('Комната заполнена'); leaveAll(); break;
    case 'lobby':
      Object.assign(settings, m.settings);
      cl = null;
      renderLobby(m); show('lobby');
      break;
    case 'start':
      cl = { map: genMap(m.seed, m.mapType, m.theme, m.mode), mode: m.mode, dur: m.dur, roster: new Map(m.roster.map(r => [r.id, r])), snaps: [], latest: null, own: null, useSeq: 0, bombSeq: 0, useAt: 0, lastSend: 0, localFx: {}, broken: 0, eaten: 0 };
      R.setMap(cl.map, m.seed);
      enterGame(m.mode, m.theme);
      break;
    case 'roster': if (cl) cl.roster = new Map(m.roster.map(r => [r.id, r])); break;
    case 's': onSnap(m); break;
    case 'end': results = m.res; setTimeout(() => results && showResults(results), 1200); break;
  }
}
function onSnap(m) {
  if (!cl) return;
  const now = performance.now();
  cl.snaps.push({ t: now, d: m });
  if (cl.snaps.length > 20) cl.snaps.shift();
  cl.latest = m;
  cl.map.dyn.clear();
  for (const i of m.w) cl.map.dyn.set(i, 1);
  if (m.cb) { for (let k = cl.broken; k < m.cb.length; k++) cl.map.crates.delete(m.cb[k]); cl.broken = m.cb.length; }
  if (m.pe) { for (let k = cl.eaten; k < m.pe.length; k++) cl.map.pellets.delete(m.pe[k]); cl.eaten = m.pe.length; }
  for (const f of m.fx || []) handleFx(f);
  const q = m.p.find(z => z.i === myId);
  if (!q) return;
  if (!cl.own) cl.own = { id: myId, x: q.x, y: q.y, vx: 0, vy: 0, fdx: q.dx, fdy: q.dy, m: 0, tp: q.tp, z: q.z || 0, stairs: q.st || 0, fx: {} };
  const o = cl.own;
  if (q.tp !== o.tp) { o.x = q.x; o.y = q.y; o.vx = o.vy = 0; o.tp = q.tp; o.z = q.z || 0; o.stairs = q.st || 0; }
  o.it = !!q.it; o.alive = !!q.a; o.ghost = !!q.g; o.score = q.s; o.sfx = q.f || {};
  o.lives = q.l; o.boots = q.bo || 0; o.pw = q.pw; o.team = q.tm ?? -1; o.carry = q.c ?? -1;
  if (now - cl.useAt > 450) o.rune = q.r;
}

// ---------- fx ----------
function meNow() { return view && view.players.find(p => p.id === myId); }
function handleFx(f) {
  const me = meNow();
  const vol = me && f.x ? Math.max(0, 1 - Math.hypot(me.x - f.x, me.y - f.y) / 260) : 1;
  const mine = f.id === myId;
  const mode = view ? view.mode : '';
  switch (f.k) {
    case 'tag': {
      const col = f.inf ? '#7dff5a' : f.found ? '#ffd23f' : '#ff4a3b';
      R.burst(f.x, f.y - 6, col, 18, 70);
      R.text(f.x, f.y - 26, f.inf ? 'ЗАРАЖЁН!' : f.found ? 'НАЙДЕН!' : 'КВАЧ!', col);
      A.sfx('tag', vol);
      if (f.b === myId) { center(f.inf ? 'ТЫ ЗАРАЖЁН!' : f.found ? 'ТЕБЯ НАШЛИ! ИЩИ ДРУГИХ' : mode === 'bomb' ? 'БОМБА У ТЕБЯ!' : 'ТЫ КВАЧ!', col); A.sfx('itme'); vib(150); R.shake = 1; }
      else if (f.a === myId) { R.shake = 0.4; if (!f.inf && !f.found) center('ПЕРЕДАЛ!', '#ffd86b'); }
      break;
    }
    case 'pick':
      R.burst(f.x, f.y - 4, RUNES[f.r].col, f.r === 'gold' ? 30 : 10, 40);
      if (mine) { A.sfx('pick'); R.text(f.x, f.y - 16, RUNES[f.r].name, RUNES[f.r].col); vib(30); if (f.r === 'gold') center('ЗОЛОТАЯ РУНА!', '#ffcc33'); }
      break;
    case 'item':
      R.burst(f.x, f.y - 4, ITEMS[f.r].col, 10, 40);
      if (mine) { A.sfx('item'); R.text(f.x, f.y - 16, ITEMS[f.r].name, ITEMS[f.r].col); vib(30); }
      break;
    case 'gift':
      R.burst(f.x, f.y - 6, '#ffd23f', 16, 50); R.burst(f.x, f.y - 6, '#ff4a3b', 10, 40);
      if (mine) { A.sfx('gift'); R.text(f.x, f.y - 18, GIFTS[f.g], f.g === 'coal' ? '#888' : '#ffd23f'); vib(40); }
      break;
    case 'use': {
      const col = RUNES[f.r].col;
      if ((f.r === 'trap' || f.r === 'slime') && !mine) break;
      if (mine) R.text(f.x, f.y - 24, RUNES[f.r].name + '!', col);
      if (f.r === 'blink' || f.r === 'rewind') { R.burst(f.x, f.y - 6, col, 14, 50); R.burst(f.x2, f.y2 - 6, '#d9b8ff', 14, 50); A.sfx('blink', vol); }
      else if (f.r === 'shock' || f.r === 'gust') { R.ring(f.x, f.y - 4, col, f.r === 'gust' ? 64 : 54); R.burst(f.x, f.y - 6, col, 20, 90); A.sfx('shock', vol); if (vol > 0.6) R.shake = 0.6; }
      else if (f.r === 'wall') { R.burst(f.x, f.y, '#a8733e', 14, 50); A.sfx('wall', vol); }
      else if (f.r === 'blind') { A.sfx('boo', 0.6); if (!mine) center('ТЬМА!', '#a07ac8'); }
      else if (f.r !== 'swap') { R.burst(f.x, f.y - 6, col, 14, 45); A.sfx('use', vol); }
      break;
    }
    case 'swap':
      R.burst(f.x, f.y - 6, '#ff6b6b', 16, 50); R.burst(f.x2, f.y2 - 6, '#ff6b6b', 16, 50); A.sfx('blink', Math.max(vol, 0.5));
      if (f.b === myId) center('ОБМЕН!', '#ff6b6b');
      break;
    case 'freeze': R.burst(f.x, f.y - 8, '#bfe9ff', 22, 60); A.sfx('freeze', vol); if (mine) { center('ЗАМЁРЗ!', '#bfe9ff'); vib(100); } break;
    case 'portal': R.burst(f.x, f.y - 6, '#b07cff', 12, 40); R.burst(f.x2, f.y2 - 6, '#b07cff', 12, 40); A.sfx('portal', mine ? 1 : vol); break;
    case 'fool': R.burst(f.x, f.y - 6, '#ff9ad5', 20, 60); R.text(f.x, f.y - 22, 'ОБМАНКА!', '#ff9ad5'); A.sfx('fool', vol); break;
    case 'poof': R.burst(f.x, f.y - 6, '#cccccc', 10, 30); break;
    case 'boo': R.burst(f.x, f.y - 10, '#e8eef8', 12, 30); R.text(f.x, f.y - 24, 'БУ!', '#e8eef8'); A.sfx('boo', vol); if (mine) vib(80); break;
    case 'boom':
      R.burst(f.x, f.y - 6, '#ffb03b', 40, 120, 0.9, 2); R.burst(f.x, f.y - 6, '#ff4a3b', 25, 80); R.burst(f.x, f.y - 6, '#555', 20, 50, 1.2, 2);
      R.ring(f.x, f.y - 4, '#ffd23f', 40); R.text(f.x, f.y - 26, mode === 'bomb' ? 'БУМ!' : 'ВЫБЫЛ!', '#ffb03b');
      A.sfx('boom', Math.max(vol, 0.4)); R.shake = Math.max(R.shake, vol * 1.3);
      if (mine) { center('ТЫ ВЫБЫЛ — ТЕПЕРЬ ТЫ ПРИЗРАК', '#ff6b3b'); vib(400); }
      break;
    case 'newbomb': R.text(f.x, f.y - 26, 'БОМБА!', '#ffd23f'); if (mine) { center('БОМБА У ТЕБЯ!', '#ffd23f'); A.sfx('itme'); vib(150); } break;
    case 'bombset': A.sfx('bombset', vol); break;
    case 'blast':
      R.blast(f.tl); R.burst(f.x, f.y, '#ffb03b', 16, 80, 0.5, 2); A.sfx('blast', Math.max(vol, 0.25));
      if (vol > 0.5) R.shake = Math.max(R.shake, 0.5 * vol);
      break;
    case 'hit':
      R.burst(f.x, f.y - 6, '#ff4a3b', 20, 70); R.text(f.x, f.y - 26, '−♥', '#ff4a3b'); A.sfx('hit', Math.max(vol, 0.4));
      if (mine) { center('−1 ЖИЗНЬ', '#ff6b5b'); vib(200); R.shake = 1; }
      else if (f.by === myId) R.text(f.x, f.y - 34, 'ПОПАЛ!', '#ffd86b');
      break;
    case 'impact': R.burst(f.x, f.y, f.h ? '#d9772e' : '#9a7a5a', 22, 80, 0.6, 2); R.ring(f.x, f.y, '#ffb03b', 20); A.sfx('impact', vol); if (vol > 0.7) R.shake = 0.5; break;
    case 'pel': if (mine) A.sfx('chomp'); break;
    case 'power': R.ring(f.x, f.y, '#2d5bff', 60); A.sfx('power'); if (mine) center('СУПЕРСИЛА! ЕШЬ МОБОВ!', '#6a8aff'); break;
    case 'eat': R.burst(f.x, f.y - 6, '#2d5bff', 16, 60); R.text(f.x, f.y - 22, '+10', '#ffd23f'); A.sfx('eat', Math.max(vol, 0.4)); break;
    case 'flagtake': A.sfx('flagtake', Math.max(vol, 0.5)); R.text(f.x, f.y - 30, 'ФЛАГ!', TEAM_COLS[f.team]); if (mine) center('НЕСИ ФЛАГ ДОМОЙ!', '#ffd23f'); else if (me && me.team === f.team) toast('Ваш флаг украли!'); break;
    case 'flagback': R.burst(f.x, f.y - 10, TEAM_COLS[f.team], 14, 40); A.sfx('pick', 0.5); break;
    case 'capture': {
      A.sfx('capture'); R.burst(f.x, f.y - 10, '#ffd23f', 40, 90, 1, 2); R.ring(f.x, f.y, TEAM_COLS[f.team], 60);
      const us = me && me.team === f.team;
      banner(`${TEAM_NAMES[f.team]} принесли флаг!`, us ? 'Отлично! Ещё немного.' : 'Защищайте базу!', '');
      if (mine) vib(200);
      break;
    }
    case 'jail': R.burst(f.x, f.y - 6, '#cccccc', 16, 50); R.text(f.x, f.y - 26, 'В ТЮРЬМУ!', '#ff8a7a'); A.sfx('jail', Math.max(vol, 0.4)); if (f.b === myId) { center('ПОЙМАН — НА БАЗУ', '#ff8a7a'); vib(150); } break;
    case 'shove': A.sfx('shove', vol); R.burst(f.x + 0, f.y - 6, '#ffffff', 6, 40, 0.3); if (f.hit === myId) { vib(80); R.shake = 0.5; } break;
    case 'zone': if (view && view.phase === 'play') { A.sfx('event'); banner('Трон переехал!', 'Беги к новому золотому кругу.', ''); } break;
    case 'seek': A.sfx('seek'); center(me && me.it ? 'ИЩИ!' : 'СВЕТ ПОГАС!', '#ffd23f'); break;
    case 'sudden': banner('ВНЕЗАПНАЯ СМЕРТЬ', 'Арена сжимается! Держись подальше от краёв.', ''); A.sfx('sudden'); break;
    case 'event': {
      const e = EVENTS[f.e];
      banner(f.h && e.hw ? e.hw : e.name, e.text, f.s); A.sfx(f.e === 'spirits' ? 'boo' : f.e === 'santa' ? 'gift' : 'event');
      break;
    }
    case 'count': center(String(f.n)); A.sfx('count'); break;
    case 'go':
      if (f.hide) { center(me && me.it ? 'ТЫ ВОДИШЬ. ЖДИ…' : 'ПРЯЧЬСЯ!', '#7dff8a'); }
      else center('БЕГИ!', '#7dff8a');
      A.sfx('go');
      break;
    case 'end': center('ВРЕМЯ!', '#ffd86b'); A.sfx('end'); A.setMusic('menu'); break;
  }
}
function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } }

// ---------- results ----------
function showResults(res) {
  const got = myId ? recordResult(stats, res, myId) : [];
  $('resTitle').textContent = res.title;
  const list = $('resList');
  list.innerHTML = '';
  res.rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = r.win ? 'win' : '';
    li.innerHTML = `<b>${r.win ? '🏆' : i + 1 + '.'}</b><i style="background:${safeCol(r.team >= 0 && res.mode === 'ctf' ? TEAM_COLS[r.team] : r.color)}"></i><span>${esc(r.name)}${r.id === myId ? ' (ты)' : ''}</span><em>${esc(r.label)}</em>`;
    list.appendChild(li);
  });
  $('resAch').innerHTML = got.map(k => `<div class="ach on"><b>★ ${ACH[k].name}</b><span>${ACH[k].desc}</span></div>`).join('');
  $('resAch').classList.toggle('hidden', !got.length);
  if (got.length) A.sfx('capture');
  const isHost = role === 'host' || role === 'solo';
  $('resBtns').classList.toggle('hidden', !isHost);
  $('resWait').classList.toggle('hidden', isHost);
  show('results');
}
$('againBtn').onclick = () => startMatch();
$('toLobbyBtn').onclick = () => { sim = null; results = null; renderLobby(); show('lobby'); pushLobby(); };

// ---------- HUD ----------
$('runeBtn').addEventListener('pointerdown', e => { e.preventDefault(); A.audioInit(); if (input.enabled) input.useQ++; });
$('bombBtn').addEventListener('pointerdown', e => { e.preventDefault(); A.audioInit(); if (input.enabled) input.actQ++; });
$('muteBtn').onclick = () => { $('muteBtn').classList.toggle('off', A.toggleMute()); };
$('muteBtn').classList.toggle('off', A.isMuted());
let exitArm = 0;
$('exitBtn').onclick = () => {
  if (performance.now() - exitArm < 2500) { leaveAll(); return; }
  exitArm = performance.now(); toast('Нажми ✕ ещё раз, чтобы выйти');
};

let lastRune, lastTick = -1, hudT = 0;
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function updateHud(v, dt) {
  const me = v.players.find(p => p.id === myId);
  const rune = me && me.alive ? me.rune || null : null;
  if (rune !== lastRune) {
    lastRune = rune;
    drawRuneIcon($('runeIcon'), rune);
    $('runeName').textContent = rune ? RUNES[rune].name : 'нет руны';
    $('runeBtn').classList.toggle('has', !!rune);
    if (rune) $('runeBtn').style.setProperty('--rc', RUNES[rune].col);
  }
  if (centerT > 0) { centerT -= dt; if (centerT <= 0) $('center').classList.remove('pop'); }
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  const tm = $('timer');
  const hiding = v.mode === 'hide' && v.hideT > 0;
  tm.textContent = hiding ? '🙈 ' + Math.ceil(v.hideT) : fmtT(v.time);
  const bomber = v.mode === 'bomber';
  tm.classList.toggle('hurry', v.phase === 'play' && !hiding && v.time < (bomber ? SUDDEN : 30));
  if (v.phase === 'play') {
    const sec = Math.ceil(hiding ? v.hideT : v.time);
    if (sec <= (hiding ? 5 : 10) && sec !== lastTick && sec > 0) { lastTick = sec; A.sfx('tick'); }
    A.setMusic(v.time < 30 ? 'hurry' : 'game');
  }
  let sub = '';
  const its = v.players.filter(p => p.it && p.alive);
  const meIt = me && me.alive && me.it && v.mode !== 'infect';
  const itName = meIt ? '<b style="color:#ff6b5b">ТЫ!</b>' : its.length ? `<b style="color:#ff8a7a">${esc(its[0].name)}</b>` : '';
  if (v.mode === 'classic') sub = `Квач: ${itName}`;
  else if (v.mode === 'bomb') sub = `💣 ${Math.max(0, v.fuse).toFixed(1)}<br>${itName}`;
  else if (bomber) { const pw = me && (me.pw || [me.maxB, me.range]); sub = me && me.alive && pw ? `💣${pw[0]} 🔥${pw[1]} 👟${me.boots || 0}` : ''; }
  else if (v.mode === 'ctf') sub = v.teamScore ? `<b style="color:${TEAM_COLS[0]}">${v.teamScore[0]}</b> : <b style="color:${TEAM_COLS[1]}">${v.teamScore[1]}</b> из ${CTF_WIN}${me && me.team >= 0 ? `<br>ты: ${TEAM_NAMES[me.team]}` : ''}` : '';
  else if (v.mode === 'koth') sub = `до ${KOTH_WIN} с · трон переедет через ${Math.ceil(v.zone ? v.zone.t : 0)}`;
  else if (v.mode === 'pacman') sub = `точек: ${R.map.pellets.size}${v.fright > 0 ? ` · <b style="color:#6a8aff">СИЛА ${Math.ceil(v.fright)}</b>` : ''}`;
  else if (v.mode === 'hide') sub = hiding ? (me && me.it ? 'Водишь. Не подглядывай!' : 'Прячься!') : `Спрятались: <b>${v.players.filter(p => p.alive && !p.it).length}</b>${me && me.it ? '<br>ты ищешь 🔦' : ''}`;
  else sub = `Живых: <b>${v.players.filter(p => p.alive && !p.it).length}</b>/${v.players.length}`;
  if (me && !me.alive) sub += '<br>👻 ты призрак';
  $('sub').innerHTML = sub;
  const rows = v.players.slice();
  const scored = ['koth', 'pacman', 'ctf'].includes(v.mode);
  if (v.mode === 'classic') rows.sort((a, b) => a.score - b.score);
  else if (bomber) rows.sort((a, b) => (b.alive - a.alive) || ((b.lives || 0) - (a.lives || 0)) || (b.score - a.score));
  else if (scored) rows.sort((a, b) => b.score - a.score);
  else rows.sort((a, b) => (b.alive - a.alive) || (a.it - b.it) || (b.score - a.score));
  $('board').innerHTML = rows.map(p => {
    const val = v.mode === 'classic' ? p.score.toFixed(0) + 'с'
      : !p.alive ? '👻'
      : bomber ? '♥'.repeat(Math.max(0, p.lives || 0))
      : v.mode === 'pacman' ? `${p.score.toFixed(0)}`
      : v.mode === 'koth' ? p.score.toFixed(0) + 'с'
      : v.mode === 'ctf' ? (p.carry >= 0 ? '🚩' : '')
      : v.mode === 'hide' && v.hideT > 0 ? ''
      : p.it ? (v.mode === 'bomb' ? '💣' : v.mode === 'hide' ? '🔦' : '🧟') : p.score.toFixed(0) + 'с';
    const col = v.mode === 'ctf' && p.team >= 0 ? TEAM_COLS[p.team] : p.color;
    return `<div class="${p.id === myId ? 'me' : ''}${p.it && v.mode !== 'hide' ? ' it' : ''}${!p.alive ? ' dead' : ''}"><i style="background:${safeCol(col)}"></i><span>${esc(p.name)}</span><em>${val}</em></div>`;
  }).join('');
  R.drawMini($('mini'), v);
}

// ---------- views ----------
function decoyView(d, owner) {
  owner = owner || {};
  return { id: 'd' + d.id, x: d.x, y: d.y, fdx: d.fdx, fdy: d.fdy, m: 1, fx: {}, name: owner.name, color: owner.color || '#888888', hair: owner.hair, hairCol: owner.hairCol, skin: owner.skin, team: owner.team, alive: true, it: false, decoy: true, seed: d.id };
}
function hostView() {
  return {
    map: sim.map, players: sim.players, runes: sim.runes, items: sim.items, bombs: sim.bombs, gifts: sim.gifts,
    traps: sim.traps.map(t => ({ x: t.x, y: t.y, owner: t.owner, armed: t.arm <= 0 })),
    decoys: sim.decoys.map(d => decoyView(d, sim.byId(d.owner))),
    puddles: sim.puddles, meteors: sim.meteors, spirits: sim.spirits, sd: sim.sdN || 0,
    mobs: sim.mobs.map(m => ({ x: m.x, y: m.y, kind: m.kind, s: m.state === 'fright' ? 1 : m.state === 'dead' ? 2 : 0 })), fright: sim.fright,
    flags: sim.mode === 'ctf' ? sim.flags : null, teamScore: sim.teamScore, zone: sim.zone || null, hideT: sim.hideT,
    walls: [...sim.map.dyn.keys()], event: sim.event && sim.event.k,
    time: sim.time, phase: sim.phase, fuse: sim.fuse, mode: sim.mode, me: myId,
  };
}
function clientView(now) {
  const L = cl.latest, rt = now - 100;
  let a = cl.snaps[0], b = null;
  for (let i = cl.snaps.length - 1; i >= 0; i--) if (cl.snaps[i].t <= rt) { a = cl.snaps[i]; b = cl.snaps[i + 1] || null; break; }
  const k = b ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 0;
  const lerpPos = (id, list, idx) => {
    const la = a.d[list] || [], lb = b ? b.d[list] || [] : [];
    const qa = la.find(z => (z.i ?? z[0]) === id), qb = lb.find(z => (z.i ?? z[0]) === id);
    const X = q => q.x ?? q[idx], Y = q => q.y ?? q[idx + 1];
    if (!qa) return null;
    if (!qb || (qa.tp !== undefined && qa.tp !== qb.tp)) return [X(qb || qa), Y(qb || qa), qb || qa];
    return [X(qa) + (X(qb) - X(qa)) * k, Y(qa) + (Y(qb) - Y(qa)) * k, qb];
  };
  const players = L.p.map(q => {
    const info = cl.roster.get(q.i) || { name: '?', color: '#888888' };
    if (q.i === myId && cl.own) {
      const o = cl.own;
      return { ...info, id: q.i, x: o.x, y: o.y, fdx: o.fdx, fdy: o.fdy, m: o.m, it: o.it, alive: o.alive, ghost: o.ghost, score: o.score, rune: o.rune, fx: o.fx, lives: o.lives, boots: o.boots, pw: o.pw, z: o.z, stairs: o.stairs, team: o.team, carry: o.carry };
    }
    const lp = lerpPos(q.i, 'p', 0);
    const src = lp ? lp[2] : q;
    return { ...info, id: q.i, x: lp ? lp[0] : q.x, y: lp ? lp[1] : q.y, fdx: src.dx, fdy: src.dy, m: src.m, it: !!q.it, alive: !!q.a, ghost: !!q.g, score: q.s, rune: q.r, fx: q.f || {}, lives: q.l, z: q.z || 0, stairs: q.st || 0, team: q.tm ?? -1, carry: q.c ?? -1, seed: q.i.length };
  });
  const decoys = L.de.map(d => {
    const lp = lerpPos(d[0], 'de', 1);
    return decoyView({ id: d[0], x: lp ? lp[0] : d[1], y: lp ? lp[1] : d[2], fdx: d[3], fdy: d[4] }, cl.roster.get(d[5]));
  });
  const spirits = (L.sp || []).map(s => { const lp = lerpPos(s[0], 'sp', 1); return { id: s[0], x: lp ? lp[0] : s[1], y: lp ? lp[1] : s[2] }; });
  const mobs = (L.mb || []).map(m => { const lp = lerpPos(m[0], 'mb', 1); return { x: lp ? lp[0] : m[1], y: lp ? lp[1] : m[2], kind: m[3], s: m[4] }; });
  const flags = L.fl ? L.fl.map((f, i) => {
    const home = cl.map.bases ? cl.map.bases[i] : [f[0], f[1]];
    const carrier = f[2] ? players.find(p => p.id === f[2]) : null;
    return { x: carrier ? carrier.x : f[0], y: carrier ? carrier.y : f[1], hx: home[0], hy: home[1], carrier: f[2] || null };
  }) : null;
  return {
    map: cl.map, players, decoys, spirits, mobs, flags, fright: L.fr || 0, teamScore: L.ts,
    zone: L.kz ? { x: L.kz[0], y: L.kz[1], r: L.kz[2], owner: L.kz[3], contested: !!L.kz[4], t: L.kz[5] } : null,
    hideT: L.ht || 0,
    runes: L.ru.map(r => ({ id: r[0], x: r[1], y: r[2], k: r[3] })),
    traps: L.tr.map(t => ({ x: t[1], y: t[2], owner: t[3], armed: !!t[4] })),
    puddles: (L.pu || []).map(p => ({ x: p[1], y: p[2] })),
    meteors: (L.mt || []).map(m => ({ x: m[1], y: m[2], t: m[3] })),
    gifts: (L.gf || []).map(g => ({ id: g[0], x: g[1], y: g[2], c: g[3] })),
    bombs: (L.bm || []).map(b2 => ({ id: b2[0], x: b2[1], y: b2[2], t: b2[3] })),
    items: (L.im || []).map(it => ({ id: it[0], x: it[1], y: it[2], k: it[3] })),
    sd: L.sd || 0,
    walls: L.w, event: L.ev && L.ev.k, time: L.tm, phase: L.ph, fuse: L.fu, mode: cl.mode, me: myId,
  };
}

// ---------- main loop ----------
let last = performance.now();
const prevCtx = $('preview').getContext('2d');
function localMove(ev) {
  const mv = readMove();
  return ev === 'mirror' ? { x: -mv.x, y: -mv.y } : mv;
}
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (sim) {
    const mp = sim.byId(myId), mv = localMove(sim.event && sim.event.k);
    if (mp) {
      mp.ax = mv.x; mp.ay = mv.y;
      while (input.useQ > 0) { input.useQ--; sim.useRune(mp); }
      while (input.actQ > 0) { input.actQ--; sim.action(mp); }
    }
    sim.update(dt);
    for (const f of sim.fxq) { handleFx(f); if (role === 'host') pendingFx.push(f); }
    sim.fxq.length = 0;
    if (role === 'host' && now - lastSend >= 50) {
      lastSend = now;
      const s = sim.snapshot(); s.fx = pendingFx; pendingFx = [];
      broadcast(s);
    }
    if (sim.phase === 'end' && !results) {
      results = sim.results();
      broadcast({ t: 'end', res: results });
      const res = results;
      setTimeout(() => { if (results === res) showResults(res); }, 1200);
    }
    view = hostView();
  } else if (cl && cl.latest) {
    const L = cl.latest, o = cl.own;
    if (o) {
      for (const key in cl.localFx) cl.localFx[key] = Math.max(0, cl.localFx[key] - dt);
      const fx = { ...o.sfx };
      for (const key in cl.localFx) fx[key] = Math.max(fx[key] || 0, cl.localFx[key]);
      o.fx = fx;
      const ev = L.ev && L.ev.k;
      if (L.ph === 'play' && o.alive) {
        const mv = localMove(ev);
        moveBody(cl.map, o, mv.x, mv.y, dt, speedMult(o, cl.mode, ev, false), slippery(cl.map, o, ev));
      } else if (L.ph === 'play' && o.ghost) {
        const mv = localMove(ev);
        moveBody(cl.map, o, mv.x, mv.y, dt, 0.9, false, true);
      } else { o.m = 0; o.vx = o.vy = 0; }
      const tryRune = () => {
        if (o.rune && L.ph === 'play' && o.alive) {
          cl.useSeq++; cl.useAt = now;
          if (o.rune === 'dash') cl.localFx.dash = 0.3;
          if (o.rune === 'haste') cl.localFx.haste = 4;
          if (o.rune === 'phase') cl.localFx.phase = 3;
          o.rune = null;
        }
      };
      while (input.useQ > 0) { input.useQ--; tryRune(); }
      while (input.actQ > 0) { input.actQ--; if (cl.mode === 'bomber' || cl.mode === 'koth') { if (o.alive) cl.bombSeq++; } else tryRune(); }
      if (now - cl.lastSend >= 33) {
        cl.lastSend = now;
        send({ t: 'in', x: r1(o.x), y: r1(o.y), dx: r2(o.fdx), dy: r2(o.fdy), m: o.m, u: cl.useSeq, bs: cl.bombSeq, tp: o.tp, z: o.z || 0, st: o.stairs || 0 });
      }
    }
    view = clientView(now);
  } else view = null;

  if (!document.hidden) {
    if (view && (sim || cl)) {
      R.draw(view, dt, now / 1000);
      R.drawJoystick(joy);
      updateHud(view, dt);
    } else {
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#16181b'; g.fillRect(0, 0, canvas.width, canvas.height);
    }
    const menuOpen = !$('menu').classList.contains('hidden'), profOpen = !$('profile').classList.contains('hidden');
    if (menuOpen || profOpen) {
      const ctx = profOpen ? $('preview2').getContext('2d') : prevCtx;
      ctx.clearRect(0, 0, 32, 34);
      const sk = prof.skin;
      drawPawn(ctx, 16, 30, { id: 'me', color: prof.color, hair: prof.hair, hairCol: prof.hairCol, fdx: 0, fdy: Math.sin(now / 1500) > 0.6 ? -1 : 1, m: 1, hat: sk.hat, cape: sk.cape }, now / 1000);
      if (sk.trail !== 'none' && Math.random() < 0.3) { ctx.fillStyle = sk.trail === 'rainbow' ? `hsl(${(now / 5) % 360},90%,65%)` : '#ffe14a'; ctx.fillRect(10 + Math.random() * 12, 28 + Math.random() * 4, 1, 1); }
    }
  }
}
function loop(now) { tick(now); requestAnimationFrame(loop); }
// keep the host simulation alive while its tab is in the background
setInterval(() => { if (document.hidden && sim && role === 'host') tick(performance.now()); }, 50);

// ---------- help ----------
$('helpRunes').innerHTML = Object.entries(RUNES).map(([k, r]) => `<li><canvas data-r="${k}"></canvas><b style="color:${r.col}">${r.name}</b> — ${r.desc}</li>`).join('');
for (const c of document.querySelectorAll('#helpRunes canvas')) drawRuneIcon(c, c.dataset.r);
$('helpModes').innerHTML = Object.values(MODES).map(m => `<li><b>${m.name}</b> — ${m.desc}</li>`).join('');
$('helpEvents').innerHTML = Object.values(EVENTS).map(e => `<li><b>${e.name}</b> — ${e.text}${e.theme ? ` <i>(${e.theme.map(t => THEMES[t]).join(', ')})</i>` : ''}</li>`).join('');
$('helpMaps').innerHTML = Object.values(MAP_TYPES).map(n => `<b>${n}</b>`).join(' · ');

applyTheme(settings.theme);
addEventListener('resize', () => R.resize());
R.resize();
initInput(canvas, () => A.audioInit());
show('menu');
requestAnimationFrame(loop);
