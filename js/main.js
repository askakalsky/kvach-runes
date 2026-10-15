import { genMap } from './map.js';
import { Sim, RUNES, MODES, EVENTS, STORYTELLERS, BOT_NAMES, speedMult, slippery, moveBody } from './sim.js';
import { Renderer, drawPawn, drawRuneIcon } from './render.js';
import * as A from './audio.js';
import { input, joy, initInput, readMove } from './input.js';
import { hostRoom, joinRoom, netAvailable } from './net.js';

const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const COLORS = ['#c8463d', '#3f7fc4', '#4f9a45', '#d9a63a', '#8e58b0', '#d9772e', '#2fa39a', '#d8d2c4'];
const HAIRCOLS = ['#3b2a1a', '#6b4423', '#c9a25a', '#1c1c1c', '#a33b1e', '#d9d3c3'];
const MAX_PLAYERS = 8;

const prof = (() => {
  try { const s = JSON.parse(localStorage.getItem('kvach-prof')); if (s && s.name) return s; } catch (e) { }
  return { name: 'Игрок' + (100 + Math.floor(Math.random() * 900)), color: pick(COLORS), hair: Math.floor(Math.random() * 4), hairCol: pick(HAIRCOLS) };
})();
const saveProf = () => { try { localStorage.setItem('kvach-prof', JSON.stringify(prof)); } catch (e) { } };
const meInfo = id => ({ id, name: prof.name, color: prof.color, hair: prof.hair, hairCol: prof.hairCol });

const canvas = $('game');
const R = new Renderer(canvas);
let role = null, myId = null, peer = null, hostConn = null;
const conns = new Map();
let roster = [];
const settings = { mode: 'classic', bots: 3, dur: 180 };
let sim = null, pendingFx = [], lastSend = 0, results = null, nextPid = 1;
let cl = null;
let view = null;

// ---------- screens ----------
function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== name);
  $('hud').classList.toggle('hidden', name !== 'game' && name !== 'results');
  input.enabled = name === 'game';
  joy.active = false; joy.id = null; input.useQ = 0;
  if (name === 'menu' || name === 'lobby') A.setMusic('menu');
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
function banner(e, story) {
  const b = $('banner');
  b.innerHTML = `<small>Рассказчик ${story}</small><b>${e.name}</b><span>${e.text}</span>`;
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(banner.h); banner.h = setTimeout(() => b.classList.remove('on'), 4200);
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

document.addEventListener('click', e => { if (e.target.closest('button')) { A.audioInit(); } }, true);

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

function leaveAll() {
  role = null; sim = null; cl = null; results = null;
  for (const { conn } of conns.values()) try { conn.close(); } catch (e) { }
  conns.clear();
  if (peer) try { peer.destroy(); } catch (e) { }
  peer = null; hostConn = null;
  show('menu');
}

// ---------- lobby ----------
$('modeSel').onchange = e => { settings.mode = e.target.value; renderLobby(); pushLobby(); };
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
  const d = data || lobbyData();
  const isHost = role === 'host' || role === 'solo';
  $('roomBox').classList.toggle('hidden', role === 'solo' || role === 'client');
  $('lobbyTitle').textContent = role === 'solo' ? 'Игра с ботами' : role === 'client' ? 'Комната' : 'Твоя комната';
  $('hostOpts').classList.toggle('hidden', !isHost);
  $('waitMsg').classList.toggle('hidden', isHost);
  $('modeSel').value = settings.mode; $('botsIn').value = settings.bots; $('durSel').value = settings.dur;
  $('botsVal').textContent = settings.bots;
  $('modeDesc').textContent = MODES[d.settings.mode].desc;
  $('clientMode').textContent = `${MODES[d.settings.mode].name} · ${d.settings.dur / 60} мин · ботов: ${d.settings.bots}`;
  $('clientMode').classList.toggle('hidden', isHost);
  const list = $('roster');
  list.innerHTML = '';
  for (const r of d.roster) {
    const li = document.createElement('div');
    li.className = 'pl';
    li.innerHTML = `<i style="background:${r.color}"></i><span>${esc(r.name)}${r.id === myId ? ' (ты)' : ''}${r.id === 'h' ? ' ★' : ''}</span>`;
    list.appendChild(li);
  }
  const nb = Math.max(0, Math.min(MAX_PLAYERS - d.roster.length, d.settings.bots));
  if (nb) { const li = document.createElement('div'); li.className = 'pl bot'; li.innerHTML = `<i></i><span>+ ботов: ${nb}</span>`; list.appendChild(li); }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
function rosterInfo() { return sim.players.map(({ id, name, color, hair, hairCol, bot }) => ({ id, name, color, hair, hairCol, bot })); }

function onHostMsg(conn, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    if (roster.length >= MAX_PLAYERS) { conn.send({ t: 'full' }); return; }
    const id = 'p' + (nextPid++);
    const info = { id, name: String(m.name || 'Игрок').slice(0, 12), color: COLORS.includes(m.color) ? m.color : pick(COLORS), hair: (m.hair | 0) % 4, hairCol: HAIRCOLS.includes(m.hairCol) ? m.hairCol : HAIRCOLS[0] };
    conns.set(conn.peer, { conn, id, name: info.name });
    roster.push(info);
    conn.send({ t: 'welcome', id });
    toast(`${info.name} зашёл!`);
    A.sfx('pick');
    if (sim && sim.phase !== 'end') {
      sim.addPlayer(info);
      conn.send({ t: 'start', seed: sim.seed, mode: sim.mode, dur: sim.dur, roster: rosterInfo() });
      broadcast({ t: 'roster', roster: rosterInfo() });
    } else { renderLobby(); pushLobby(); }
    return;
  }
  const info = conns.get(conn.peer);
  if (!info || !sim) return;
  const p = sim.byId(info.id);
  if (!p) return;
  if (m.t === 'in') {
    if (m.tp === p.tp && p.alive && sim.phase === 'play' && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      if (Math.hypot(m.x - p.x, m.y - p.y) < 120) { p.x = m.x; p.y = m.y; } else p.tp++;
      if (Number.isFinite(m.dx)) { p.fdx = m.dx; p.fdy = m.dy; }
      p.m = m.m ? 1 : 0;
    }
    if (m.u > p.useSeq) { p.useSeq = m.u; sim.useRune(p); }
  }
}

function startMatch() {
  if (role !== 'host' && role !== 'solo') return;
  A.audioInit();
  roster.forEach(r => { if (r.id === myId) Object.assign(r, meInfo(myId)); });
  const total = Math.min(MAX_PLAYERS, roster.length + settings.bots);
  if (total < 2) return toast('Нужен хотя бы один бот или друг');
  const names = BOT_NAMES.filter(n => !roster.some(r => r.name === n)).sort(() => Math.random() - 0.5);
  const bots = [];
  for (let i = roster.length; i < total; i++)
    bots.push({ id: 'b' + i, name: names.pop() || 'Бот' + i, color: COLORS[(i * 3 + 1) % COLORS.length], hair: i % 4, hairCol: HAIRCOLS[i % HAIRCOLS.length], bot: true });
  const seed = Math.floor(Math.random() * 1e9);
  sim = new Sim({ ...settings, storyteller: pick(STORYTELLERS) }, [...roster, ...bots], seed, myId);
  pendingFx = []; results = null;
  R.setMap(sim.map, seed);
  broadcast({ t: 'start', seed, mode: sim.mode, dur: sim.dur, roster: rosterInfo() });
  enterGame();
}
function enterGame() {
  show('game');
  results = null; lastRune = undefined; lastTick = -1;
  A.setMusic('game');
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
      cl = { map: genMap(m.seed), mode: m.mode, dur: m.dur, roster: new Map(m.roster.map(r => [r.id, r])), snaps: [], latest: null, own: null, useSeq: 0, useAt: 0, lastSend: 0, localFx: {} };
      R.setMap(cl.map, m.seed);
      enterGame();
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
  for (const f of m.fx || []) handleFx(f);
  const q = m.p.find(z => z.i === myId);
  if (!q) return;
  if (!cl.own) cl.own = { id: myId, x: q.x, y: q.y, vx: 0, vy: 0, fdx: q.dx, fdy: q.dy, m: 0, tp: q.tp, fx: {} };
  const o = cl.own;
  if (q.tp !== o.tp) { o.x = q.x; o.y = q.y; o.vx = o.vy = 0; o.tp = q.tp; }
  o.it = !!q.it; o.alive = !!q.a; o.score = q.s; o.sfx = q.f || {};
  if (now - cl.useAt > 450) o.rune = q.r;
}

// ---------- fx ----------
function meNow() { return view && view.players.find(p => p.id === myId); }
function handleFx(f) {
  const me = meNow();
  const vol = me && f.x ? Math.max(0, 1 - Math.hypot(me.x - f.x, me.y - f.y) / 260) : 1;
  const mine = f.id === myId;
  switch (f.k) {
    case 'tag': {
      const col = f.inf ? '#7dff5a' : '#ff4a3b';
      R.burst(f.x, f.y - 6, col, 18, 70);
      R.text(f.x, f.y - 26, f.inf ? 'ЗАРАЖЁН!' : 'КВАЧ!', col);
      A.sfx('tag', vol);
      if (f.b === myId) { center(f.inf ? 'ТЫ ЗАРАЖЁН!' : view && view.mode === 'bomb' ? 'БОМБА У ТЕБЯ!' : 'ТЫ КВАЧ!', col); A.sfx('itme'); vib(150); R.shake = 1; }
      else if (f.a === myId) { R.shake = 0.4; if (!f.inf) center('ПЕРЕДАЛ!', '#ffd86b'); }
      break;
    }
    case 'pick':
      R.burst(f.x, f.y - 4, RUNES[f.r].col, 10, 40);
      if (mine) { A.sfx('pick'); R.text(f.x, f.y - 16, RUNES[f.r].name, RUNES[f.r].col); vib(30); }
      break;
    case 'use': {
      const col = RUNES[f.r].col;
      if (f.r === 'trap' && !mine) break;
      if (mine) R.text(f.x, f.y - 24, RUNES[f.r].name + '!', col);
      if (f.r === 'blink') { R.burst(f.x, f.y - 6, col, 14, 50); R.burst(f.x2, f.y2 - 6, '#d9b8ff', 14, 50); A.sfx('blink', vol); }
      else if (f.r === 'shock') { R.ring(f.x, f.y - 4, col, 54); R.burst(f.x, f.y - 6, '#bfe0ff', 20, 90); A.sfx('shock', vol); if (vol > 0.6) R.shake = 0.6; }
      else if (f.r === 'wall') { R.burst(f.x, f.y, '#a8733e', 14, 50); A.sfx('wall', vol); }
      else if (f.r === 'swap') { }
      else { R.burst(f.x, f.y - 6, col, 14, 45); A.sfx('use', vol); }
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
    case 'boom':
      R.burst(f.x, f.y - 6, '#ffb03b', 40, 120, 0.9, 2); R.burst(f.x, f.y - 6, '#ff4a3b', 25, 80); R.burst(f.x, f.y - 6, '#555', 20, 50, 1.2, 2);
      R.ring(f.x, f.y - 4, '#ffd23f', 40); R.text(f.x, f.y - 26, 'БУМ!', '#ffb03b');
      A.sfx('boom', Math.max(vol, 0.4)); R.shake = Math.max(R.shake, vol * 1.3);
      if (mine) { center('ТЫ ВЗОРВАН!', '#ff6b3b'); vib(400); }
      break;
    case 'newbomb': R.text(f.x, f.y - 26, 'БОМБА!', '#ffd23f'); if (mine) { center('БОМБА У ТЕБЯ!', '#ffd23f'); A.sfx('itme'); vib(150); } break;
    case 'event': banner(EVENTS[f.e], f.s); A.sfx('event'); break;
    case 'count': center(String(f.n)); A.sfx('count'); break;
    case 'go': center('БЕГИ!', '#7dff8a'); A.sfx('go'); break;
    case 'end': center('ВРЕМЯ!', '#ffd86b'); A.sfx('end'); A.setMusic('menu'); break;
  }
}
function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } }

// ---------- results ----------
function showResults(res) {
  $('resTitle').textContent = res.title;
  const list = $('resList');
  list.innerHTML = '';
  res.rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = r.win ? 'win' : '';
    li.innerHTML = `<b>${r.win ? '🏆' : i + 1 + '.'}</b><i style="background:${r.color}"></i><span>${esc(r.name)}${r.id === myId ? ' (ты)' : ''}</span><em>${esc(r.label)}</em>`;
    list.appendChild(li);
  });
  const isHost = role === 'host' || role === 'solo';
  $('resBtns').classList.toggle('hidden', !isHost);
  $('resWait').classList.toggle('hidden', isHost);
  show('results');
}
$('againBtn').onclick = () => startMatch();
$('toLobbyBtn').onclick = () => { sim = null; results = null; renderLobby(); show('lobby'); pushLobby(); };

// ---------- HUD ----------
$('runeBtn').addEventListener('pointerdown', e => { e.preventDefault(); A.audioInit(); if (input.enabled) input.useQ++; });
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
  tm.textContent = v.phase === 'count' ? fmtT(v.time) : fmtT(v.time);
  tm.classList.toggle('hurry', v.phase === 'play' && v.time < 30);
  if (v.phase === 'play') {
    const sec = Math.ceil(v.time);
    if (sec <= 10 && sec !== lastTick && sec > 0) { lastTick = sec; A.sfx('tick'); }
    A.setMusic(v.time < 30 ? 'hurry' : 'game');
  }
  let sub = '';
  const its = v.players.filter(p => p.it && p.alive);
  const meIt = me && me.alive && me.it && v.mode !== 'infect';
  const itName = meIt ? '<b style="color:#ff6b5b">ТЫ!</b>' : its.length ? `<b style="color:#ff8a7a">${esc(its[0].name)}</b>` : '';
  if (v.mode === 'classic') sub = `Квач: ${itName}`;
  else if (v.mode === 'bomb') sub = `💣 ${Math.max(0, v.fuse).toFixed(1)}<br>${itName}`;
  else sub = `Живых: <b>${v.players.filter(p => p.alive && !p.it).length}</b>/${v.players.length}`;
  if (me && !me.alive) sub += '<br>ты выбыл';
  $('sub').innerHTML = sub;
  const rows = v.players.slice();
  if (v.mode === 'classic') rows.sort((a, b) => a.score - b.score);
  else rows.sort((a, b) => (b.alive - a.alive) || (a.it - b.it) || (b.score - a.score));
  $('board').innerHTML = rows.map(p => {
    const val = v.mode === 'classic' ? p.score.toFixed(0) + 'с' : !p.alive ? '✝' : p.it ? (v.mode === 'bomb' ? '💣' : '🧟') : p.score.toFixed(0) + 'с';
    return `<div class="${p.id === myId ? 'me' : ''}${p.it ? ' it' : ''}${!p.alive ? ' dead' : ''}"><i style="background:${p.color}"></i><span>${esc(p.name)}</span><em>${val}</em></div>`;
  }).join('');
  R.drawMini($('mini'), v);
}

// ---------- views ----------
function decoyView(d, owner) {
  owner = owner || {};
  return { id: 'd' + d.id, x: d.x, y: d.y, fdx: d.fdx, fdy: d.fdy, m: 1, fx: {}, name: owner.name, color: owner.color || '#888', hair: owner.hair, hairCol: owner.hairCol, alive: true, it: false, decoy: true, seed: d.id };
}
function hostView() {
  return {
    map: sim.map, players: sim.players, runes: sim.runes,
    traps: sim.traps.map(t => ({ x: t.x, y: t.y, owner: t.owner, armed: t.arm <= 0 })),
    decoys: sim.decoys.map(d => decoyView(d, sim.byId(d.owner))),
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
    const qa = a.d[list].find(z => (z.i ?? z[0]) === id), qb = b ? b.d[list].find(z => (z.i ?? z[0]) === id) : null;
    const X = q => q.x ?? q[idx], Y = q => q.y ?? q[idx + 1];
    if (!qa) return null;
    if (!qb || (qa.tp !== undefined && qa.tp !== qb.tp)) return [X(qb || qa), Y(qb || qa), qb || qa];
    return [X(qa) + (X(qb) - X(qa)) * k, Y(qa) + (Y(qb) - Y(qa)) * k, qb];
  };
  const players = L.p.map(q => {
    const info = cl.roster.get(q.i) || { name: '?', color: '#888' };
    if (q.i === myId && cl.own) {
      const o = cl.own;
      return { ...info, id: q.i, x: o.x, y: o.y, fdx: o.fdx, fdy: o.fdy, m: o.m, it: o.it, alive: o.alive, score: o.score, rune: o.rune, fx: o.fx };
    }
    const lp = lerpPos(q.i, 'p', 0);
    const src = lp ? lp[2] : q;
    return { ...info, id: q.i, x: lp ? lp[0] : q.x, y: lp ? lp[1] : q.y, fdx: src.dx, fdy: src.dy, m: src.m, it: !!q.it, alive: !!q.a, score: q.s, rune: q.r, fx: q.f || {}, seed: q.i.length };
  });
  const decoys = L.de.map(d => {
    const lp = lerpPos(d[0], 'de', 1);
    const dv = { id: d[0], x: lp ? lp[0] : d[1], y: lp ? lp[1] : d[2], fdx: d[3], fdy: d[4], owner: d[5] };
    return decoyView(dv, cl.roster.get(d[5]));
  });
  return {
    map: cl.map, players, decoys,
    runes: L.ru.map(r => ({ id: r[0], x: r[1], y: r[2], k: r[3] })),
    traps: L.tr.map(t => ({ x: t[1], y: t[2], owner: t[3], armed: !!t[4] })),
    walls: L.w, event: L.ev && L.ev.k, time: L.tm, phase: L.ph, fuse: L.fu, mode: cl.mode, me: myId,
  };
}

// ---------- main loop ----------
let last = performance.now();
const prevCtx = $('preview').getContext('2d');
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (sim) {
    const mp = sim.byId(myId), mv = readMove();
    if (mp) { mp.ax = mv.x; mp.ay = mv.y; while (input.useQ > 0) { input.useQ--; sim.useRune(mp); } }
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
        const mv = readMove();
        moveBody(cl.map, o, mv.x, mv.y, dt, speedMult(o, cl.mode, ev, false), slippery(cl.map, o, ev));
      } else { o.m = 0; o.vx = o.vy = 0; }
      while (input.useQ > 0) {
        input.useQ--;
        if (o.rune && L.ph === 'play' && o.alive) {
          cl.useSeq++; cl.useAt = now;
          if (o.rune === 'dash') cl.localFx.dash = 0.3;
          if (o.rune === 'haste') cl.localFx.haste = 4;
          o.rune = null;
        }
      }
      if (now - cl.lastSend >= 33) {
        cl.lastSend = now;
        send({ t: 'in', x: r1(o.x), y: r1(o.y), dx: r2(o.fdx), dy: r2(o.fdy), m: o.m, u: cl.useSeq, tp: o.tp });
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
    if (!$('menu').classList.contains('hidden')) {
      prevCtx.clearRect(0, 0, 24, 26);
      drawPawn(prevCtx, 12, 23, { color: prof.color, hair: prof.hair, hairCol: prof.hairCol, fdx: 0, fdy: 1, m: 1 }, now / 1000);
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
$('helpEvents').innerHTML = Object.values(EVENTS).map(e => `<li><b>${e.name}</b> — ${e.text}</li>`).join('');

addEventListener('resize', () => R.resize());
R.resize();
initInput(canvas, () => A.audioInit());
show('menu');
requestAnimationFrame(loop);
