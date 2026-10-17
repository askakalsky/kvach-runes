import { genMap, MAP_TYPES, isSolidT, tileIdx } from './map.js';
import { Sim, RUNES, ITEMS, MODES, EVENTS, THEMES, GIFTS, STORYTELLERS, BOT_NAMES, BOT_NAMES_THEME, TEAM_COLS, TEAM_NAMES, KOTH_WIN, CTF_WIN, HEROES, HERO_KEYS, EMOTES, WEAPONS, DM_WIN, speedMult, slippery, moveBody, pickMapType, SUDDEN } from './sim.js';
import { Renderer, drawPawn, drawRuneIcon, weaponSprite } from './render.js';
import { HATS, CAPES, TRAILS, ACH, loadStats, unlocked, reqText, recordResult } from './skins.js';
import * as A from './audio.js';
import { input, joy, initInput, readMove, fireHeld, ctl, saveCtl, resetCtl, applyCtl, newStick, stickBegin, stickMove, stickVector, stickZone, drawStick } from './input.js';
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
  if (!HEROES[s.hero]) s.hero = 'runner';
  return s;
})();
const saveProf = () => { try { localStorage.setItem('kvach-prof', JSON.stringify(prof)); } catch (e) { } };
const meInfo = id => ({ id, name: prof.name, color: prof.color, hair: prof.hair, hairCol: prof.hairCol, skin: { ...prof.skin }, hero: prof.hero });
const cleanSkin = s => ({ hat: HATS[s && s.hat] ? s.hat : 'none', cape: CAPES[s && s.cape] ? s.cape : 'none', trail: TRAILS[s && s.trail] ? s.trail : 'none' });

const canvas = $('game');
const R = new Renderer(canvas);
// optional 3D view: three.js is loaded only when the player switches it on
let R3 = null, use3d = false, curMap = null, curSeed = 0;
const FX = () => (use3d && R3 ? R3 : R);
function setMapAll(map, seed) {
  R.setMap(map, seed); curMap = map; curSeed = seed;
  if (R3) R3.setMap(map, seed, R.layers);
}
async function setView3d(on) {
  if (on && !R3) {
    toast('Загружаю 3D…', 6000);
    try {
      const mod = await import('./render3d.js');
      R3 = new mod.Renderer3D($('game3d'), canvas);
      R3.resize();
      if (curMap) R3.setMap(curMap, curSeed, R.layers);
      toast('3D включено');
    } catch (e) { console.warn(e); toast('3D не загрузилось: нужен интернет и WebGL'); on = false; }
  }
  use3d = on;
  document.body.classList.toggle('v3d', use3d);
  $('viewBtn').textContent = use3d ? '2D' : '3D';
  prof.view = use3d ? '3d' : '2d'; saveProf();
}
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
let curScreen = 'menu';
function show(name) {
  curScreen = name;
  $('settings').classList.add('hidden');
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
    onReady: (code, p) => { peer = p; setupVoiceReceive(p); $('roomCode').textContent = code; updateVoicePeers(); renderLobby(); },
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
    onPeer: p => setupVoiceReceive(p),
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
  input.dm = false; A.setStyle('chip');
  stopMic(); voice.peers = [];
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

// ---------- controls settings ----------
const CTL_FIELDS = ['hand', 'type', 'size', 'reach', 'dead', 'opacity', 'zone', 'fx', 'fy', 'btn', 'btnop'];
const pad = { st: newStick(), x: 0, y: 0, raf: 0 };
function syncCtlUI() {
  for (const k of CTL_FIELDS) {
    const el = $('c_' + k);
    el.value = ctl[k];
    const out = el.parentElement.querySelector('output');
    if (out) out.textContent = ctl[k] + (k === 'size' ? '' : '%');
  }
  $('r_zone').classList.toggle('hide', ctl.type !== 'float');
  $('r_fx').classList.toggle('hide', ctl.type === 'float');
  $('r_fy').classList.toggle('hide', ctl.type === 'float');
}
function openSettings() {
  syncCtlUI();
  $('settings').classList.remove('hidden');
  input.enabled = false; joy.active = false;
  cancelAnimationFrame(pad.raf); padLoop();
}
function closeSettings() {
  $('settings').classList.add('hidden');
  cancelAnimationFrame(pad.raf);
  input.enabled = curScreen === 'game';
}
for (const k of CTL_FIELDS) $('c_' + k).addEventListener('input', e => {
  ctl[k] = e.target.tagName === 'SELECT' ? e.target.value : +e.target.value;
  saveCtl(); applyCtl(); syncCtlUI(); pad.st.active = false;
});
$('ctlReset').onclick = () => { resetCtl(); syncCtlUI(); };
$('ctlBack').onclick = closeSettings;
$('ctlMenuBtn').onclick = openSettings;
$('ctlBtn').onclick = openSettings;
// test pad: same stick logic on a small canvas, a dot runs where you steer
const padEl = $('padTest');
const padPos = e => { const r = padEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.width, r.height]; };
padEl.addEventListener('pointerdown', e => {
  const [x, y, W, H] = padPos(e);
  if (stickBegin(pad.st, x, y, W, H)) { pad.st.id = e.pointerId; padEl.setPointerCapture(e.pointerId); e.preventDefault(); }
});
padEl.addEventListener('pointermove', e => {
  if (pad.st.active && e.pointerId === pad.st.id) { const [x, y, W, H] = padPos(e); stickMove(pad.st, x, y, W, H); e.preventDefault(); }
});
for (const ev of ['pointerup', 'pointercancel']) padEl.addEventListener(ev, e => { if (e.pointerId === pad.st.id) pad.st.active = false; });
function padLoop() {
  pad.raf = requestAnimationFrame(padLoop);
  const r = padEl.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (padEl.width !== Math.round(r.width * dpr)) { padEl.width = Math.round(r.width * dpr); padEl.height = Math.round(r.height * dpr); }
  const g = padEl.getContext('2d'), W = r.width, H = r.height;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, padEl.width, padEl.height);
  if (ctl.type === 'float') { const [z0, z1] = stickZone(W); g.fillStyle = 'rgba(224,178,82,.08)'; g.fillRect(z0 * dpr, 0, (z1 - z0) * dpr, padEl.height); }
  const v = pad.st.active ? stickVector(pad.st) : { x: 0, y: 0 };
  pad.x = Math.max(8, Math.min(W - 8, (pad.x || W / 2) + v.x * 2.2));
  pad.y = Math.max(8, Math.min(H - 8, (pad.y || H / 2) + v.y * 2.2));
  drawStick(g, pad.st, dpr, W, H);
  g.fillStyle = '#7dff8a'; g.fillRect((pad.x - 5) * dpr, (pad.y - 5) * dpr, 10 * dpr, 10 * dpr);
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

function lobbyData() { return { t: 'lobby', roster: roster.map(({ id, name, color, hair, hairCol, hero }) => ({ id, name, color, hair, hairCol, hero })), settings: { ...settings } }; }
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
  const fixedMap = settings.mode === 'bomber' || settings.mode === 'pacman' || settings.mode === 'dm';
  $('mapSel').disabled = fixedMap;
  $('teamRow').classList.toggle('hidden', settings.mode !== 'ctf');
  $('botsVal').textContent = settings.bots;
  $('modeDesc').textContent = MODES[s.mode].desc + (s.mode === 'bomber' ? ' Карта — арена с ящиками.' : s.mode === 'pacman' ? ' Карта — неоновый лабиринт.' : '');
  const mapName = s.mode === 'bomber' ? 'Арена' : s.mode === 'pacman' ? 'Лабиринт пакмена' : s.mode === 'dm' ? 'Неоновое здание' : MAP_TYPES[s.map] || 'случайная карта';
  $('clientMode').textContent = `${MODES[s.mode].name} · ${mapName} · ${s.dur / 60} мин · ботов: ${s.bots} · ${THEMES[s.theme] || ''}`;
  $('clientMode').classList.toggle('hidden', isHost);
  $('heroRow').classList.toggle('hidden', s.mode !== 'heroes');
  $('heroSel').value = prof.hero; $('heroDesc').textContent = HEROES[prof.hero].desc;
  syncMicButtons();
  const list = $('roster');
  list.innerHTML = '';
  for (const r of d.roster) {
    const li = document.createElement('div');
    li.className = 'pl';
    li.innerHTML = `<i style="background:${safeCol(r.color)}"></i><span>${d.settings.mode === 'heroes' && HEROES[r.hero] ? HEROES[r.hero].icon + ' ' : ''}${esc(r.name)}${r.id === myId ? ' (ты)' : ''}${r.id === 'h' ? ' ★' : ''}${voiceSpeaking(r.id) ? ' 🔊' : ''}</span>`;
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
    updateVoicePeers();
    renderLobby(); pushLobby();
  });
}
function rosterInfo() { return sim.players.map(({ id, name, color, hair, hairCol, bot, skin, team, hero }) => ({ id, name, color, hair, hairCol, bot, skin, team, hero })); }
function startMsg() { return { t: 'start', seed: sim.seed, mode: sim.mode, dur: sim.dur, mapType: sim.mapType, theme: sim.theme, roster: rosterInfo() }; }

function onHostMsg(conn, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    if (roster.length >= MAX_PLAYERS) { conn.send({ t: 'full' }); return; }
    const id = 'p' + (nextPid++);
    const info = { id, name: String(m.name || 'Игрок').slice(0, 12), color: COLORS.includes(m.color) ? m.color : pick(COLORS), hair: (m.hair | 0) % 4, hairCol: HAIRCOLS.includes(m.hairCol) ? m.hairCol : HAIRCOLS[0], skin: cleanSkin(m.skin), hero: HEROES[m.hero] ? m.hero : 'runner' };
    conns.set(conn.peer, { conn, id, name: info.name });
    roster.push(info);
    conn.send({ t: 'welcome', id });
    toast(`${info.name} зашёл!`);
    updateVoicePeers();
    A.sfx('pick');
    if (sim && sim.phase !== 'end') {
      sim.addPlayer({ ...info });
      conn.send(startMsg());
      broadcast({ t: 'roster', roster: rosterInfo() });
    } else { renderLobby(); pushLobby(); }
    return;
  }
  const info = conns.get(conn.peer);
  if (info && m.t === 'hero' && HEROES[m.h]) { const r = roster.find(q => q.id === info.id); if (r) { r.hero = m.h; renderLobby(); pushLobby(); } return; }
  if (!info || !sim) return;
  const p = sim.byId(info.id);
  if (!p) return;
  if (m.t === 'emo') { if (p) sim.emote(p, m.e | 0); return; }
  if (m.t === 'in') {
    if (m.tp === p.tp && (p.alive || p.ghost) && sim.phase === 'play' && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      if (Math.hypot(m.x - p.x, m.y - p.y) < 120) { p.x = m.x; p.y = m.y; p.z = m.z === 1 ? 1 : 0; p.stairs = m.st ? 1 : 0; } else p.tp++;
      if (Number.isFinite(m.dx)) { p.fdx = m.dx; p.fdy = m.dy; }
      if (Array.isArray(m.aa) && Number.isFinite(m.aa[0]) && Number.isFinite(m.aa[1])) { const l = Math.hypot(m.aa[0], m.aa[1]) || 1; p.aimx = m.aa[0] / l; p.aimy = m.aa[1] / l; }
      p.m = m.m ? 1 : 0;
    }
    p.fire = !!m.fi;
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
  setMapAll(sim.map, seed);
  broadcast(startMsg());
  enterGame(sim.mode, sim.theme);
}
function enterGame(mode, theme) {
  show('game');
  results = null; lastRune = undefined; lastTick = -1;
  applyTheme(theme); A.setStyle(mode === 'dm' ? 'synth' : 'chip'); A.setMusic('game');
  input.dm = mode === 'dm';
  const act = { bomber: ['💣', 'бомба'], koth: ['✊', 'толчок'], heroes: [HEROES[prof.hero].icon, HEROES[prof.hero].ab], dm: ['👊', 'огонь'] }[mode];
  $('bombBtn').classList.toggle('hidden', !act);
  if (act) { $('bombBtn').querySelector('b').textContent = act[0]; $('bombBtn').querySelector('span').textContent = act[1]; }
  syncMicButtons();
  $('keysHint').textContent = mode === 'dm' ? 'WASD — бег · мышь — прицел · ЛКМ/ПРОБЕЛ — огонь · E/ПКМ — бросить/подобрать' : act ? `WASD — бег · ПРОБЕЛ — ${act[1]} · E — руна` : 'WASD — бег · ПРОБЕЛ / E — руна';
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
      setMapAll(cl.map, m.seed);
      enterGame(m.mode, m.theme);
      break;
    case 'vp': voice.peers = m.list || []; callAll(); break;
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
  o.wpn = q.w || 'fist'; o.ammo = q.am || 0; o.down = q.dn ? 1 : 0; o.pts = q.pt || 0; o.hero = q.h || null; o.cd = q.cd || 0; o.lives = q.l; o.boots = q.bo || 0; o.pw = q.pw; o.team = q.tm ?? -1; o.carry = q.c ?? -1;
  if (now - cl.useAt > 450) o.rune = q.r;
}

// ---------- fx ----------
function meNow() { return view && view.players.find(p => p.id === myId); }
// ---------- aiming (deathmatch) ----------
function losMap(x0, y0, x1, y1) {
  const map = sim ? sim.map : cl && cl.map;
  if (!map) return false;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  for (let i = 1; i < n; i++) { const ti = tileIdx(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); if (isSolidT(map.g[ti]) || map.dyn.has(ti)) return false; }
  return true;
}
// deathmatch is dark: you see what your flashlight hits, who is close, or who just fired
function seenInDark(p, q, d) {
  if (d < 40 || ((q.fl || q.flashT > 0) && d < 260)) return true;
  const fl = Math.hypot(p.fdx || 0, p.fdy || 0) || 1;
  return d < 165 && ((q.x - p.x) * (p.fdx || 0) + (q.y - p.y) * (p.fdy || 0)) / (d * fl) > 0.8;
}
// mouse aim on desktop; otherwise auto-aim at the nearest visible enemy, else where you run
function aimFor(p, v) {
  if (!p) return [0, 1];
  if (performance.now() - input.mouseT < 4000) {
    const w = (use3d && R3 ? R3 : R).screenToWorld(input.mx, input.my);
    if (w) { const dx = w[0] - p.x, dy = w[1] - (p.y - 6), l = Math.hypot(dx, dy); if (l > 3) return [dx / l, dy / l]; }
  }
  if (v) {
    let best = null, bd = 230 * 230;
    for (const q of v.players) {
      if (q.id === p.id || !q.alive) continue;
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (v.mode === 'dm' && !seenInDark(p, q, Math.sqrt(d))) continue;
      if (d < bd && losMap(p.x, p.y - 6, q.x, q.y - 6)) { bd = d; best = q; }
    }
    if (best) { const l = Math.sqrt(bd) || 1; return [(best.x - p.x) / l, (best.y - p.y) / l]; }
  }
  const mv = readMove(), ml = Math.hypot(mv.x, mv.y);
  if (ml > 0.2) return [mv.x / ml, mv.y / ml];
  const l = Math.hypot(p.fdx || 0, p.fdy || 0) || 1;
  return [(p.fdx || 0) / l, (p.fdy ?? 1) / l];
}
// which pawn animates on which event: [field holding the id, animation, seconds]
const ANIM = { tag: ['a', 'push', 0.3], jail: ['a', 'push', 0.3], shove: ['id', 'push', 0.25], use: ['id', 'cast', 0.35], ability: ['id', 'cast', 0.35], bombset: ['id', 'crouch', 0.3], pick: ['id', 'jump', 0.25], item: ['id', 'jump', 0.25], gift: ['id', 'jump', 0.3], emote: ['id', 'jump', 0.4], capture: ['id', 'jump', 0.45], flagtake: ['id', 'jump', 0.25], eat: ['id', 'jump', 0.25], grab: ['id', 'jump', 0.2] };
const HURT = { tag: 'b', jail: 'b', hit: 'id', freeze: 'id', boo: 'id', punch: 'id' };
function handleFx(f) {
  const an = ANIM[f.k]; if (an && f[an[0]]) FX().anim(f[an[0]], an[1], an[2]);
  const hu = HURT[f.k]; if (hu && f[hu]) FX().hurt(f[hu]);
  const me = meNow();
  const vol = me && f.x ? Math.max(0, 1 - Math.hypot(me.x - f.x, me.y - f.y) / 260) : 1;
  const mine = f.id === myId;
  const mode = view ? view.mode : '';
  switch (f.k) {
    case 'tag': {
      const col = f.inf ? '#7dff5a' : f.found ? '#ffd23f' : '#ff4a3b';
      FX().burst(f.x, f.y - 6, col, 18, 70);
      FX().text(f.x, f.y - 26, f.inf ? 'ЗАРАЖЁН!' : f.found ? 'НАЙДЕН!' : 'КВАЧ!', col);
      A.sfx('tag', vol);
      if (f.b === myId) { center(f.inf ? 'ТЫ ЗАРАЖЁН!' : f.found ? 'ТЕБЯ НАШЛИ! ИЩИ ДРУГИХ' : mode === 'bomb' ? 'БОМБА У ТЕБЯ!' : 'ТЫ КВАЧ!', col); A.sfx('itme'); vib(150); FX().shake = 1; }
      else if (f.a === myId) { FX().shake = 0.4; if (!f.inf && !f.found) center('ПЕРЕДАЛ!', '#ffd86b'); }
      break;
    }
    case 'pick':
      FX().burst(f.x, f.y - 4, RUNES[f.r].col, f.r === 'gold' ? 30 : 10, 40);
      if (mine) { A.sfx('pick'); FX().text(f.x, f.y - 16, RUNES[f.r].name, RUNES[f.r].col); vib(30); if (f.r === 'gold') center('ЗОЛОТАЯ РУНА!', '#ffcc33'); }
      break;
    case 'item':
      FX().burst(f.x, f.y - 4, ITEMS[f.r].col, 10, 40);
      if (mine) { A.sfx('item'); FX().text(f.x, f.y - 16, ITEMS[f.r].name, ITEMS[f.r].col); vib(30); }
      break;
    case 'gift':
      FX().burst(f.x, f.y - 6, '#ffd23f', 16, 50); FX().burst(f.x, f.y - 6, '#ff4a3b', 10, 40);
      if (mine) { A.sfx('gift'); FX().text(f.x, f.y - 18, GIFTS[f.g], f.g === 'coal' ? '#888' : '#ffd23f'); vib(40); }
      break;
    case 'use': {
      const col = RUNES[f.r].col;
      if ((f.r === 'trap' || f.r === 'slime') && !mine) break;
      if (mine) FX().text(f.x, f.y - 24, RUNES[f.r].name + '!', col);
      if (f.r === 'blink' || f.r === 'rewind') { FX().burst(f.x, f.y - 6, col, 14, 50); FX().burst(f.x2, f.y2 - 6, '#d9b8ff', 14, 50); A.sfx('blink', vol); }
      else if (f.r === 'shock' || f.r === 'gust') { FX().ring(f.x, f.y - 4, col, f.r === 'gust' ? 64 : 54); FX().burst(f.x, f.y - 6, col, 20, 90); A.sfx('shock', vol); if (vol > 0.6) FX().shake = 0.6; }
      else if (f.r === 'wall') { FX().burst(f.x, f.y, '#a8733e', 14, 50); A.sfx('wall', vol); }
      else if (f.r === 'blind') { A.sfx('boo', 0.6); if (!mine) center('ТЬМА!', '#a07ac8'); }
      else if (f.r !== 'swap') { FX().burst(f.x, f.y - 6, col, 14, 45); A.sfx('use', vol); }
      break;
    }
    case 'swap':
      FX().burst(f.x, f.y - 6, '#ff6b6b', 16, 50); FX().burst(f.x2, f.y2 - 6, '#ff6b6b', 16, 50); A.sfx('blink', Math.max(vol, 0.5));
      if (f.b === myId) center('ОБМЕН!', '#ff6b6b');
      break;
    case 'freeze': FX().burst(f.x, f.y - 8, '#bfe9ff', 22, 60); A.sfx('freeze', vol); if (mine) { center('ЗАМЁРЗ!', '#bfe9ff'); vib(100); } break;
    case 'portal': FX().burst(f.x, f.y - 6, '#b07cff', 12, 40); FX().burst(f.x2, f.y2 - 6, '#b07cff', 12, 40); A.sfx('portal', mine ? 1 : vol); break;
    case 'fool': FX().burst(f.x, f.y - 6, '#ff9ad5', 20, 60); FX().text(f.x, f.y - 22, 'ОБМАНКА!', '#ff9ad5'); A.sfx('fool', vol); break;
    case 'poof': FX().burst(f.x, f.y - 6, '#cccccc', 10, 30); break;
    case 'boo': FX().burst(f.x, f.y - 10, '#e8eef8', 12, 30); FX().text(f.x, f.y - 24, 'БУ!', '#e8eef8'); A.sfx('boo', vol); if (mine) vib(80); break;
    case 'boom':
      FX().burst(f.x, f.y - 6, '#ffb03b', 40, 120, 0.9, 2); FX().burst(f.x, f.y - 6, '#ff4a3b', 25, 80); FX().burst(f.x, f.y - 6, '#555', 20, 50, 1.2, 2);
      FX().ring(f.x, f.y - 4, '#ffd23f', 40); FX().text(f.x, f.y - 26, mode === 'bomb' ? 'БУМ!' : 'ВЫБЫЛ!', '#ffb03b');
      A.sfx('boom', Math.max(vol, 0.4)); FX().shake = Math.max(FX().shake, vol * 1.3);
      if (mine) { center('ТЫ ВЫБЫЛ — ТЕПЕРЬ ТЫ ПРИЗРАК', '#ff6b3b'); vib(400); }
      break;
    case 'newbomb': FX().text(f.x, f.y - 26, 'БОМБА!', '#ffd23f'); if (mine) { center('БОМБА У ТЕБЯ!', '#ffd23f'); A.sfx('itme'); vib(150); } break;
    case 'bombset': A.sfx('bombset', vol); break;
    case 'blast':
      FX().blast(f.tl); FX().burst(f.x, f.y, '#ffb03b', 16, 80, 0.5, 2); A.sfx('blast', Math.max(vol, 0.25));
      if (vol > 0.5) FX().shake = Math.max(FX().shake, 0.5 * vol);
      break;
    case 'hit':
      FX().burst(f.x, f.y - 6, '#ff4a3b', 20, 70); FX().text(f.x, f.y - 26, '−♥', '#ff4a3b'); A.sfx('hit', Math.max(vol, 0.4));
      if (mine) { center('−1 ЖИЗНЬ', '#ff6b5b'); vib(200); FX().shake = 1; }
      else if (f.by === myId) FX().text(f.x, f.y - 34, 'ПОПАЛ!', '#ffd86b');
      break;
    case 'impact': FX().burst(f.x, f.y, f.h ? '#d9772e' : '#9a7a5a', 22, 80, 0.6, 2); FX().ring(f.x, f.y, '#ffb03b', 20); A.sfx('impact', vol); if (vol > 0.7) FX().shake = 0.5; break;
    case 'pel': if (mine) A.sfx('chomp'); break;
    case 'shot': {
      for (const [ex, ey] of f.e) { FX().tracer(f.x, f.y, ex, ey); FX().burst(ex, ey, '#fff3b0', 3, 30, 0.2); }
      FX().burst(f.x + (f.e[0][0] - f.x) * 0.06, f.y + (f.e[0][1] - f.y) * 0.06, '#ffd23f', 5, 40, 0.12);
      FX().shell(f.x, f.y + 6); FX().muzzle(f.x, f.y);
      FX().anim(f.id, 'shoot', 0.12);
      A.sfx(f.w, Math.max(0.25, vol));
      if (mine) FX().shake = Math.max(FX().shake, f.w === 'shotgun' ? 0.6 : 0.2);
      break;
    }
    case 'swing': FX().anim(f.id, f.w === 'fist' ? 'punch' : 'swing', f.w === 'fist' ? 0.2 : 0.22, f.ax, f.ay); A.sfx('swing', vol); break;
    case 'punch': FX().burst(f.x, f.y - 8, '#ffffff', 10, 50, 0.3); FX().text(f.x, f.y - 26, 'БАМ!', '#ffe14a'); A.sfx('punch', Math.max(vol, 0.4)); if (mine) { center('СБИТ С НОГ!', '#ffe14a'); vib(120); } break;
    case 'kill': {
      FX().blood(f.x, f.y, f.dx || 0, f.dy || 0); FX().burst(f.x, f.y - 6, '#b0141c', 26, 90, 0.6, 2);
      A.sfx('kill', Math.max(vol, 0.4));
      if (vol > 0.5) FX().shake = Math.max(FX().shake, 0.5);
      if (f.by === myId) { const pts = 100 * (f.c || 1); center(f.c > 1 ? `+${pts} · x${f.c} КОМБО!` : `+${pts}`, f.c > 1 ? '#2ff3ff' : '#ff3fa4'); vib(60); }
      if (mine) { center('ТЫ УБИТ', '#ff3fa4'); vib(300); FX().shake = 1; }
      FX().text(f.x, f.y - 24, f.c > 2 ? 'МЯСО!' : 'УБИТ', '#ff3fa4');
      break;
    }
    case 'spawn': FX().ring(f.x, f.y - 4, '#2ff3ff', 30); break;
    case 'empty': if (mine) { A.sfx('empty'); FX().text(f.x, f.y - 24, 'ПУСТО', '#aaa'); } break;
    case 'throw': FX().anim(f.id, 'throw', 0.2, f.ax, f.ay); A.sfx('throw', vol); break;
    case 'grab': if (mine) { A.sfx('grab'); FX().text(f.x, f.y - 18, WEAPONS[f.w].name, '#2ff3ff'); } break;
    case 'whistle': {
      FX().ping(f.x, f.y, mine ? '#7dff8a' : '#ffe14a');
      const dx = me ? f.x - me.x : 0, dist = me ? Math.hypot(dx, f.y - me.y) : 0;
      A.sfx('whistle', mine ? 0.6 : Math.max(0.35, 1 - dist / 420), mine ? 0 : Math.max(-1, Math.min(1, dx / 220)));
      if (mine) center('ТЫ СВИСТНУЛ! 🎵', '#ffe14a');
      break;
    }
    case 'emote': {
      emotes.set(f.id, { i: f.e, t: 2.5 });
      A.sfx('emote' + f.e, mine ? 0.8 : Math.max(0.3, vol));
      break;
    }
    case 'ability': {
      const h = HEROES[f.h];
      FX().burst(f.x, f.y - 8, '#ffe14a', 14, 60);
      if (f.h === 'frost') FX().ring(f.x, f.y - 4, '#bfe9ff', 48);
      if (f.h === 'brute') FX().ring(f.x, f.y - 4, '#ff9a5a', 42);
      if (f.h === 'builder') A.sfx('wall', vol); else A.sfx('ability', Math.max(vol, 0.3));
      if (mine) FX().text(f.x, f.y - 26, h.ab + '!', '#ffe14a');
      break;
    }
    case 'power': FX().ring(f.x, f.y, '#2d5bff', 60); A.sfx('power'); if (mine) center('СУПЕРСИЛА! ЕШЬ МОБОВ!', '#6a8aff'); break;
    case 'eat': FX().burst(f.x, f.y - 6, '#2d5bff', 16, 60); FX().text(f.x, f.y - 22, '+10', '#ffd23f'); A.sfx('eat', Math.max(vol, 0.4)); break;
    case 'flagtake': A.sfx('flagtake', Math.max(vol, 0.5)); FX().text(f.x, f.y - 30, 'ФЛАГ!', TEAM_COLS[f.team]); if (mine) center('НЕСИ ФЛАГ ДОМОЙ!', '#ffd23f'); else if (me && me.team === f.team) toast('Ваш флаг украли!'); break;
    case 'flagback': FX().burst(f.x, f.y - 10, TEAM_COLS[f.team], 14, 40); A.sfx('pick', 0.5); break;
    case 'capture': {
      A.sfx('capture'); FX().burst(f.x, f.y - 10, '#ffd23f', 40, 90, 1, 2); FX().ring(f.x, f.y, TEAM_COLS[f.team], 60);
      const us = me && me.team === f.team;
      banner(`${TEAM_NAMES[f.team]} принесли флаг!`, us ? 'Отлично! Ещё немного.' : 'Защищайте базу!', '');
      if (mine) vib(200);
      break;
    }
    case 'jail': FX().burst(f.x, f.y - 6, '#cccccc', 16, 50); FX().text(f.x, f.y - 26, 'В ТЮРЬМУ!', '#ff8a7a'); A.sfx('jail', Math.max(vol, 0.4)); if (f.b === myId) { center('ПОЙМАН — НА БАЗУ', '#ff8a7a'); vib(150); } break;
    case 'shove': A.sfx('shove', vol); FX().burst(f.x + 0, f.y - 6, '#ffffff', 6, 40, 0.3); if (f.hit === myId) { vib(80); FX().shake = 0.5; } break;
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

// ---------- voice chat (PeerJS media calls, each open mic calls every other player) ----------
const voice = { on: false, stream: null, calls: new Map(), ins: new Map(), peers: [], speaking: new Map(), meAn: null, buf: new Uint8Array(256) };
function voiceSpeaking(id) { return performance.now() - (voice.speaking.get(id) || 0) < 350; }
function analyser(stream) {
  const ctx = A.audioCtx();
  if (!ctx) return null;
  try { const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an); return an; } catch (e) { return null; }
}
function level(an) {
  if (!an) return 0;
  an.getByteTimeDomainData(voice.buf);
  let m = 0; for (const x of voice.buf) m = Math.max(m, Math.abs(x - 128));
  return m;
}
function updateVoicePeers() {
  if (role !== 'host' || !peer) return;
  voice.peers = [{ peer: peer.id, id: myId }, ...[...conns.entries()].map(([pid, c]) => ({ peer: pid, id: c.id }))];
  broadcast({ t: 'vp', list: voice.peers });
  callAll();
}
function setupVoiceReceive(p) {
  p.on('call', call => {
    call.answer();
    call.on('stream', s => playVoice(call.peer, s));
    call.on('close', () => dropVoice(call.peer));
    call.on('error', () => dropVoice(call.peer));
  });
}
function playVoice(pid, stream) {
  dropVoice(pid);
  const a = new Audio();
  a.srcObject = stream; a.autoplay = true; a.play().catch(() => toast('Нажми на экран, чтобы слышать друга'));
  voice.ins.set(pid, { a, an: analyser(stream) });
}
function dropVoice(pid) { const v = voice.ins.get(pid); if (v) { v.a.pause(); v.a.srcObject = null; voice.ins.delete(pid); } }
function callAll() {
  if (!voice.on || !peer || !voice.stream) return;
  for (const { peer: pid } of voice.peers) {
    if (pid === peer.id || voice.calls.has(pid)) continue;
    const c = peer.call(pid, voice.stream);
    if (!c) continue;
    voice.calls.set(pid, c);
    const drop = () => voice.calls.delete(pid);
    c.on('close', drop); c.on('error', drop);
  }
}
async function toggleMic() {
  if (voice.on) { stopMic(); toast('Микрофон выключен'); return; }
  if (role !== 'host' && role !== 'client') return toast('Голос работает в комнате с другом');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Браузер не даёт микрофон (нужен https)');
  A.audioInit();
  try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { toast('Нет доступа к микрофону'); return; }
  voice.on = true; voice.meAn = analyser(voice.stream);
  callAll();
  toast('Микрофон включён — тебя слышат');
  syncMicButtons();
}
function stopMic() {
  voice.on = false;
  for (const c of voice.calls.values()) try { c.close(); } catch (e) { }
  voice.calls.clear();
  if (voice.stream) voice.stream.getTracks().forEach(t => t.stop());
  voice.stream = null; voice.meAn = null;
  for (const pid of [...voice.ins.keys()]) dropVoice(pid);
  syncMicButtons();
}
function syncMicButtons() {
  for (const b of document.querySelectorAll('.micBtn')) { b.classList.toggle('on', voice.on); b.textContent = voice.on ? '🎤' : '🔇'; }
  for (const b of document.querySelectorAll('.micBtn')) b.classList.toggle('hidden', role !== 'host' && role !== 'client');
}
function voiceTick() {
  const now = performance.now();
  if (voice.on && level(voice.meAn) > 10 && myId) voice.speaking.set(myId, now);
  for (const [pid, v] of voice.ins) {
    if (level(v.an) <= 10) continue;
    const who = voice.peers.find(q => q.peer === pid);
    if (who) voice.speaking.set(who.id, now);
  }
  for (const b of document.querySelectorAll('.micBtn')) b.classList.toggle('talk', voice.on && voiceSpeaking(myId));
}
for (const b of document.querySelectorAll('.micBtn')) b.onclick = () => toggleMic();

// ---------- reactions ----------
const emotes = new Map();
function sendEmote(i) {
  $('emoWheel').classList.add('hidden');
  if (sim) { const mp = sim.byId(myId); if (mp) sim.emote(mp, i); }
  else if (cl) send({ t: 'emo', e: i });
}
$('emoWheel').innerHTML = EMOTES.map((e, i) => `<button data-i="${i}" style="--a:${i * 45 - 90}deg"><b>${e.e}</b><span>${e.t}</span><i>${i + 1}</i></button>`).join('');
for (const b of $('emoWheel').querySelectorAll('button')) b.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); sendEmote(+b.dataset.i); });
$('emoWheel').addEventListener('pointerdown', ev => { if (ev.target === $('emoWheel')) $('emoWheel').classList.add('hidden'); });
$('emoBtn').addEventListener('pointerdown', e => { e.preventDefault(); $('emoWheel').classList.toggle('hidden'); });
addEventListener('keydown', e => {
  if (!input.enabled || e.target.tagName === 'INPUT') return;
  const d = /^Digit([1-8])$/.exec(e.code);
  if (d) sendEmote(+d[1] - 1);
  if (e.code === 'KeyT') $('emoWheel').classList.toggle('hidden');
});

// ---------- hero pick ----------
$('heroSel').innerHTML = Object.entries(HEROES).map(([k, h]) => `<option value="${k}">${h.icon} ${h.name}</option>`).join('');
$('heroSel').onchange = e => {
  prof.hero = e.target.value; saveProf(); A.sfx('click');
  const r = roster.find(q => q.id === myId); if (r) r.hero = prof.hero;
  if (role === 'client') send({ t: 'hero', h: prof.hero });
  renderLobby(); pushLobby();
};

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
$('bombBtn').addEventListener('pointerdown', e => { e.preventDefault(); A.audioInit(); if (input.enabled) { input.actQ++; input.btnFire = true; } });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('bombBtn').addEventListener(ev, () => { input.btnFire = false; });
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
  if (v.mode === 'dm' && me) {
    const w = WEAPONS[me.wpn || 'fist'];
    const bb = $('bombBtn').querySelector('b');
    if (bb.dataset.w !== me.wpn) {
      bb.dataset.w = me.wpn; bb.textContent = '';
      const spr = weaponSprite(me.wpn);
      if (spr) { const c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height; c.getContext('2d').drawImage(spr, 0, 0); c.className = 'wIcon'; bb.appendChild(c); } else bb.textContent = '👊';
    }
    $('bombBtn').querySelector('span').textContent = w.melee ? w.name : `${me.ammo}`;
    $('bombBtn').classList.toggle('cool', !w.melee && me.ammo <= 0);
    $('runeName').textContent = me.wpn && me.wpn !== 'fist' ? 'бросить' : 'подобрать';
  }
  if (v.mode === 'heroes' && me && me.hero) {
    const h = HEROES[me.hero], cd = me.abilCd ?? me.cd ?? 0;
    $('bombBtn').querySelector('b').textContent = h.icon;
    $('bombBtn').querySelector('span').textContent = cd > 0 ? `${h.ab} ${Math.ceil(cd)}` : h.ab;
    $('bombBtn').classList.toggle('cool', cd > 0);
  }
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
  if ((v.mode === 'classic' || v.mode === 'heroes')) sub = `Квач: ${itName}`;
  else if (v.mode === 'bomb') sub = `💣 ${Math.max(0, v.fuse).toFixed(1)}<br>${itName}`;
  else if (bomber) { const pw = me && (me.pw || [me.maxB, me.range]); sub = me && me.alive && pw ? `💣${pw[0]} 🔥${pw[1]} 👟${me.boots || 0}` : ''; }
  else if (v.mode === 'ctf') sub = v.teamScore ? `<b style="color:${TEAM_COLS[0]}">${v.teamScore[0]}</b> : <b style="color:${TEAM_COLS[1]}">${v.teamScore[1]}</b> из ${CTF_WIN}${me && me.team >= 0 ? `<br>ты: ${TEAM_NAMES[me.team]}` : ''}` : '';
  else if (v.mode === 'koth') sub = `до ${KOTH_WIN} с · трон переедет через ${Math.ceil(v.zone ? v.zone.t : 0)}`;
  else if (v.mode === 'dm') sub = me ? `${WEAPONS[me.wpn || 'fist'].name}${!WEAPONS[me.wpn || 'fist'].melee ? ' · ' + me.ammo : ''}<br>убийств: <b>${me.score}</b> / ${DM_WIN}${me.alive ? '' : '<br><b style="color:#ff3fa4">ты убит…</b>'}` : '';
  else if (v.mode === 'pacman') sub = `точек: ${R.map.pellets.size}${v.fright > 0 ? ` · <b style="color:#6a8aff">СИЛА ${Math.ceil(v.fright)}</b>` : ''}`;
  else if (v.mode === 'hide') sub = hiding ? (me && me.it ? 'Водишь. Не подглядывай!' : 'Прячься!') : `Спрятались: <b>${v.players.filter(p => p.alive && !p.it).length}</b>${me && me.it ? '<br>ты ищешь 🔦' : ''}<br>🎵 свист через ${Math.ceil(v.whistleT || 0)}`;
  else sub = `Живых: <b>${v.players.filter(p => p.alive && !p.it).length}</b>/${v.players.length}`;
  if (me && !me.alive && v.mode !== 'dm') sub += '<br>👻 ты призрак';
  $('sub').innerHTML = sub;
  const rows = v.players.slice();
  const scored = ['koth', 'pacman', 'ctf', 'dm'].includes(v.mode);
  if ((v.mode === 'classic' || v.mode === 'heroes')) rows.sort((a, b) => a.score - b.score);
  else if (bomber) rows.sort((a, b) => (b.alive - a.alive) || ((b.lives || 0) - (a.lives || 0)) || (b.score - a.score));
  else if (scored) rows.sort((a, b) => b.score - a.score);
  else rows.sort((a, b) => (b.alive - a.alive) || (a.it - b.it) || (b.score - a.score));
  $('board').innerHTML = rows.map(p => {
    const val = (v.mode === 'classic' || v.mode === 'heroes') ? p.score.toFixed(0) + 'с'
      : v.mode === 'dm' ? `${p.score}${p.alive ? '' : '💀'}`
      : !p.alive ? '👻'
      : bomber ? '♥'.repeat(Math.max(0, p.lives || 0))
      : v.mode === 'dm' ? `${p.score}${p.alive ? '' : '💀'}`
      : v.mode === 'pacman' ? `${p.score.toFixed(0)}`
      : v.mode === 'koth' ? p.score.toFixed(0) + 'с'
      : v.mode === 'ctf' ? (p.carry >= 0 ? '🚩' : '')
      : v.mode === 'hide' && v.hideT > 0 ? ''
      : p.it ? (v.mode === 'bomb' ? '💣' : v.mode === 'hide' ? '🔦' : '🧟') : p.score.toFixed(0) + 'с';
    const col = v.mode === 'ctf' && p.team >= 0 ? TEAM_COLS[p.team] : p.color;
    return `<div class="${p.id === myId ? 'me' : ''}${p.it && v.mode !== 'hide' ? ' it' : ''}${!p.alive ? ' dead' : ''}"><i style="background:${safeCol(col)}"></i><span>${p.hero && HEROES[p.hero] ? HEROES[p.hero].icon : ''}${esc(p.name)}${voiceSpeaking(p.id) ? '🔊' : ''}</span><em>${val}</em></div>`;
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
    flags: sim.mode === 'ctf' ? sim.flags : null, teamScore: sim.teamScore, zone: sim.zone || null, hideT: sim.hideT, whistleT: sim.whistleT, emotes,
    pickups: sim.pickups ? sim.pickups.filter(k => !k.wait) : null, thrown: sim.thrown || null,
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
      return { ...info, id: q.i, x: o.x, y: o.y, fdx: o.fdx, fdy: o.fdy, m: o.m, it: o.it, alive: o.alive, ghost: o.ghost, score: o.score, rune: o.rune, fx: o.fx, lives: o.lives, boots: o.boots, pw: o.pw, z: o.z, stairs: o.stairs, team: o.team, carry: o.carry, hero: o.hero, cd: o.cd, wpn: o.wpn, ammo: o.ammo, down: o.down, pts: o.pts };
    }
    const lp = lerpPos(q.i, 'p', 0);
    const src = lp ? lp[2] : q;
    return { ...info, id: q.i, x: lp ? lp[0] : q.x, y: lp ? lp[1] : q.y, fdx: src.dx, fdy: src.dy, m: src.m, it: !!q.it, alive: !!q.a, ghost: !!q.g, score: q.s, rune: q.r, fx: q.f || {}, lives: q.l, z: q.z || 0, stairs: q.st || 0, team: q.tm ?? -1, carry: q.c ?? -1, wpn: q.w || 'fist', ammo: q.am || 0, down: q.dn || 0, fl: q.fl || 0, pts: q.pt || 0, hero: q.h || null, cd: q.cd || 0, seed: q.i.length };
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
    hideT: L.ht || 0, whistleT: L.wh || 0, emotes,
    runes: L.ru.map(r => ({ id: r[0], x: r[1], y: r[2], k: r[3] })),
    traps: L.tr.map(t => ({ x: t[1], y: t[2], owner: t[3], armed: !!t[4] })),
    puddles: (L.pu || []).map(p => ({ x: p[1], y: p[2] })),
    meteors: (L.mt || []).map(m => ({ x: m[1], y: m[2], t: m[3] })),
    gifts: (L.gf || []).map(g => ({ id: g[0], x: g[1], y: g[2], c: g[3] })),
    bombs: (L.bm || []).map(b2 => ({ id: b2[0], x: b2[1], y: b2[2], t: b2[3] })),
    items: (L.im || []).map(it => ({ id: it[0], x: it[1], y: it[2], k: it[3] })),
    sd: L.sd || 0,
    pickups: L.pk ? L.pk.map(k => ({ id: k[0], x: k[1], y: k[2], k: k[3] })) : null,
    thrown: L.tw ? L.tw.map(k => ({ id: k[0], x: k[1], y: k[2], k: k[3] })) : null,
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
  for (const [k, e] of emotes) { e.t -= dt; if (e.t <= 0) emotes.delete(k); }
  voiceTick();
  if (sim) {
    const mp = sim.byId(myId), mv = localMove(sim.event && sim.event.k);
    if (mp) {
      mp.ax = mv.x; mp.ay = mv.y;
      if (sim.mode === 'dm') { const a = aimFor(mp, view); mp.aimx = a[0]; mp.aimy = a[1]; mp.fire = fireHeld(); }
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
        if (cl.mode === 'dm') { const a = aimFor(o, view); o.aim = a; o.fdx = a[0]; o.fdy = a[1]; }
      } else if (L.ph === 'play' && o.ghost) {
        const mv = localMove(ev);
        moveBody(cl.map, o, mv.x, mv.y, dt, 0.9, false, true);
      } else { o.m = 0; o.vx = o.vy = 0; }
      const tryRune = () => {
        if (cl.mode === 'dm') { if (o.alive && L.ph === 'play') cl.useSeq++; return; }
        if (o.rune && L.ph === 'play' && o.alive) {
          cl.useSeq++; cl.useAt = now;
          if (o.rune === 'dash') cl.localFx.dash = 0.3;
          if (o.rune === 'haste') cl.localFx.haste = 4;
          if (o.rune === 'phase') cl.localFx.phase = 3;
          o.rune = null;
        }
      };
      while (input.useQ > 0) { input.useQ--; tryRune(); }
      while (input.actQ > 0) { input.actQ--; if (cl.mode === 'bomber' || cl.mode === 'koth' || cl.mode === 'heroes') { if (o.alive) cl.bombSeq++; } else tryRune(); }
      if (now - cl.lastSend >= 33) {
        cl.lastSend = now;
        send({ t: 'in', x: r1(o.x), y: r1(o.y), dx: r2(o.fdx), dy: r2(o.fdy), m: o.m, u: cl.useSeq, bs: cl.bombSeq, tp: o.tp, z: o.z || 0, st: o.stairs || 0, fi: cl.mode === 'dm' && fireHeld() && o.alive ? 1 : 0, aa: o.aim ? [r2(o.aim[0]), r2(o.aim[1])] : undefined });
      }
    }
    view = clientView(now);
  } else view = null;

  if (!document.hidden) {
    if (view && (sim || cl)) {
      if (use3d && R3 && R3.map === curMap) R3.draw(view, dt, now / 1000);
      else R.draw(view, dt, now / 1000);
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
applyCtl();
addEventListener('resize', () => { R.resize(); if (R3) R3.resize(); });
$('viewBtn').onclick = () => setView3d(!use3d);
if (prof.view === '3d') setView3d(true);
R.resize();
initInput(canvas, () => A.audioInit());
show('menu');
requestAnimationFrame(loop);
