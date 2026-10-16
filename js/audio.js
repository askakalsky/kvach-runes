// 8-bit music sequencer + sound effects on WebAudio.
let ac = null, master, mus, sfxG, noise, p25, p12;
let muted = false, mode = 'menu', step = 0, nextT = 0;
try { muted = localStorage.getItem('kvach-mute') === '1'; } catch (e) { }

const mf = m => 440 * Math.pow(2, (m - 69) / 12);

function pulse(d) {
  const n = 40, re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 1; i < n; i++) re[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * d);
  return ac.createPeriodicWave(re, im);
}

export function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
  mus = ac.createGain(); mus.gain.value = 0.32; mus.connect(master);
  sfxG = ac.createGain(); sfxG.gain.value = 0.55; sfxG.connect(master);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  p25 = pulse(0.25); p12 = pulse(0.125);
  nextT = ac.currentTime + 0.05;
  setInterval(sched, 25);
}

export function isMuted() { return muted; }
export function audioCtx() { return ac; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('kvach-mute', muted ? '1' : '0'); } catch (e) { }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.02);
  return muted;
}
export function setMusic(m) { mode = m; }

function tone(t, freq, dur, type, vol, dest, end) {
  const o = ac.createOscillator();
  if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
  o.frequency.setValueAtTime(freq, t);
  if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.01, dur * 0.6));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}
function hit(t, dur, vol, freq, type, dest) {
  const s = ac.createBufferSource(); s.buffer = noise;
  const f = ac.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

// Am - F - C - G
const PROG = [
  { root: 45, arp: [69, 72, 76] }, { root: 41, arp: [65, 69, 72] },
  { root: 48, arp: [67, 72, 76] }, { root: 43, arp: [67, 71, 74] },
];
// [step, midi, len]
const MEL_A = [
  [[0, 69, 2], [2, 72, 2], [4, 76, 2], [6, 81, 4], [10, 79, 2], [12, 76, 4]],
  [[0, 77, 3], [3, 76, 1], [4, 72, 2], [6, 69, 2], [8, 72, 2], [10, 77, 2], [12, 76, 4]],
  [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
  [[0, 74, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 74, 4]],
];
const MEL_B = [
  [[0, 81, 1], [2, 81, 1], [3, 79, 1], [4, 76, 2], [6, 72, 2], [8, 74, 2], [10, 76, 2], [12, 69, 4]],
  [[0, 77, 2], [2, 77, 1], [3, 76, 1], [4, 77, 2], [6, 81, 2], [8, 79, 4], [12, 77, 2], [14, 76, 2]],
  [[0, 76, 1], [2, 76, 1], [3, 74, 1], [4, 72, 2], [6, 76, 2], [8, 79, 2], [10, 84, 2], [12, 83, 4]],
  [[0, 83, 2], [2, 81, 2], [4, 79, 2], [6, 83, 2], [8, 86, 4], [12, 83, 2], [14, 79, 2]],
];

// Halloween: Am - Dm - E - Am in harmonic minor
const PROG_HW = [
  { root: 45, arp: [69, 72, 76] }, { root: 50, arp: [74, 77, 81] },
  { root: 40, arp: [68, 71, 76] }, { root: 45, arp: [69, 72, 76] },
];
const MEL_HW_A = [
  [[0, 76, 2], [2, 77, 2], [4, 76, 2], [6, 75, 2], [8, 76, 4], [12, 72, 4]],
  [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 80, 2], [10, 81, 2], [12, 77, 4]],
  [[0, 76, 2], [2, 80, 2], [4, 83, 4], [8, 80, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 72, 2], [2, 71, 2], [4, 69, 6], [12, 64, 4]],
];
const MEL_HW_B = [
  [[0, 81, 1], [1, 80, 1], [2, 81, 2], [4, 76, 2], [6, 72, 2], [8, 69, 2], [10, 72, 2], [12, 76, 4]],
  [[0, 77, 1], [1, 76, 1], [2, 77, 2], [4, 74, 2], [6, 77, 2], [8, 81, 4], [12, 86, 4]],
  [[0, 83, 2], [2, 80, 2], [4, 76, 2], [6, 80, 2], [8, 83, 2], [10, 88, 2], [12, 87, 4]],
  [[0, 88, 2], [2, 84, 2], [4, 81, 4], [8, 76, 2], [10, 72, 2], [12, 69, 4]],
];
// New Year: "Jingle Bells" (public domain, 1857) over C - C - F - G
const PROG_NY = [
  { root: 48, arp: [67, 72, 76] }, { root: 48, arp: [67, 72, 76] },
  { root: 41, arp: [65, 69, 72] }, { root: 43, arp: [67, 71, 74] },
];
const MEL_NY_A = [
  [[0, 76, 2], [2, 76, 2], [4, 76, 4], [8, 76, 2], [10, 76, 2], [12, 76, 4]],
  [[0, 76, 2], [2, 79, 2], [4, 72, 3], [7, 74, 1], [8, 76, 8]],
  [[0, 77, 2], [2, 77, 2], [4, 77, 3], [7, 77, 1], [8, 77, 2], [10, 76, 2], [12, 76, 2], [14, 76, 1], [15, 76, 1]],
  [[0, 76, 2], [2, 74, 2], [4, 74, 2], [6, 76, 2], [8, 74, 4], [12, 79, 4]],
];
const MEL_NY_B = [
  MEL_NY_A[0], MEL_NY_A[1], MEL_NY_A[2],
  [[0, 79, 2], [2, 79, 2], [4, 77, 2], [6, 74, 2], [8, 72, 8]],
];
let theme = '';
export function setTheme(t) { theme = t || ''; }

function tempo() { return (mode === 'menu' ? 108 : mode === 'hurry' ? 168 : 138) - (theme === 'halloween' && mode !== 'hurry' ? 10 : 0) + (theme === 'newyear' ? 12 : 0); }

function sched() {
  if (!ac || ac.state !== 'running') return;
  if (nextT < ac.currentTime - 0.2) nextT = ac.currentTime + 0.05;
  while (nextT < ac.currentTime + 0.12) {
    playStep(step, nextT);
    nextT += 60 / tempo() / 4;
    step = (step + 1) % 128;
  }
}

function playStep(s, t) {
  if (mode === 'off') return;
  const sx = 60 / tempo() / 4;
  const hw = theme === 'halloween', ny = theme === 'newyear';
  const bar = (s >> 4) % 8, st = s % 16, ch = (hw ? PROG_HW : ny ? PROG_NY : PROG)[bar % 4];
  const mel = (hw ? (bar < 4 ? MEL_HW_A : MEL_HW_B) : ny ? (bar < 4 ? MEL_NY_A : MEL_NY_B) : (bar < 4 ? MEL_A : MEL_B))[bar % 4];
  if (ny && mode !== 'menu' && st % 2 === 1) hit(t, 0.05, 0.05, 9000, 'highpass', mus);
  const game = mode !== 'menu';
  if (st % 2 === 0) tone(t, mf(ch.root + (st % 4 === 2 ? 12 : 0)), sx * 1.8, 'triangle', 0.42, mus);
  if (game) tone(t, mf(ch.arp[st % 3] + (bar >= 4 ? 12 : 0)), sx * 0.8, p12, 0.045, mus);
  for (const [ms, n, len] of mel) if (ms === st) tone(t, mf(n), sx * len * 0.92, p25, game ? 0.11 : 0.08, mus);
  if (game) {
    if (st % 8 === 0) tone(t, 150, 0.12, 'sine', 0.55, mus, 40);
    if (st % 8 === 4) hit(t, 0.12, 0.25, 1400, 'highpass', mus);
    if (mode === 'hurry' || st % 2 === 0) hit(t, 0.03, 0.07, 7000, 'highpass', mus);
  }
}

export function sfx(name, vol = 1, pan = 0) {
  if (!ac || muted || vol <= 0.02) return;
  const t = ac.currentTime + 0.01;
  let d = sfxG;
  if (pan && ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, pan)); pn.connect(sfxG); d = pn; }
  const v = Math.min(1, vol);
  switch (name) {
    case 'tag':
      tone(t, 880, 0.25, 'square', 0.25 * v, d, 180);
      hit(t, 0.15, 0.25 * v, 2000, 'highpass', d);
      break;
    case 'itme':
      [72, 67, 60].forEach((n, i) => tone(t + i * 0.09, mf(n), 0.12, p25, 0.25 * v, d));
      break;
    case 'pick':
      [76, 81, 88].forEach((n, i) => tone(t + i * 0.05, mf(n), 0.08, p25, 0.18 * v, d));
      break;
    case 'use':
      tone(t, 300, 0.18, 'square', 0.12 * v, d, 900);
      hit(t, 0.18, 0.15 * v, 3000, 'bandpass', d);
      break;
    case 'blink': tone(t, 300, 0.16, 'sine', 0.3 * v, d, 1600); break;
    case 'freeze':
      [96, 91, 88, 84].forEach((n, i) => tone(t + i * 0.04, mf(n), 0.1, 'triangle', 0.2 * v, d));
      break;
    case 'shock':
      tone(t, 120, 0.35, 'square', 0.25 * v, d, 40);
      hit(t, 0.35, 0.3 * v, 600, 'lowpass', d);
      break;
    case 'boom':
      hit(t, 0.9, 0.7 * v, 900, 'lowpass', d);
      tone(t, 110, 0.6, 'sine', 0.6 * v, d, 28);
      break;
    case 'portal': tone(t, 400, 0.25, 'triangle', 0.25 * v, d, 1200); tone(t + 0.05, 600, 0.2, 'sine', 0.15 * v, d, 300); break;
    case 'wall': for (let i = 0; i < 3; i++) hit(t + i * 0.06, 0.08, 0.35 * v, 400, 'lowpass', d); break;
    case 'fool': [67, 66, 65, 60].forEach((n, i) => tone(t + i * 0.1, mf(n), 0.12, 'square', 0.18 * v, d)); break;
    case 'count': tone(t, 660, 0.12, p25, 0.25, d); break;
    case 'go': tone(t, 990, 0.35, p25, 0.3, d); tone(t, 495, 0.35, 'triangle', 0.3, d); break;
    case 'event': [69, 73, 76, 81].forEach((n, i) => tone(t + i * 0.08, mf(n), 0.14, 'triangle', 0.3, d)); break;
    case 'end': [72, 76, 79, 84, 79, 84].forEach((n, i) => tone(t + i * 0.11, mf(n), 0.16, p25, 0.25, d)); break;
    case 'tick': tone(t, 1200, 0.04, 'square', 0.12, d); break;
    case 'bombset': tone(t, 220, 0.08, 'square', 0.2 * v, d, 160); break;
    case 'blast':
      hit(t, 0.5, 0.5 * v, 1200, 'lowpass', d);
      tone(t, 140, 0.35, 'sine', 0.45 * v, d, 35);
      break;
    case 'item': [72, 79, 84, 91].forEach((n, i) => tone(t + i * 0.04, mf(n), 0.07, p25, 0.18 * v, d)); break;
    case 'hit': tone(t, 600, 0.35, 'square', 0.25 * v, d, 80); hit(t, 0.2, 0.3 * v, 800, 'lowpass', d); break;
    case 'impact': hit(t, 0.3, 0.45 * v, 500, 'lowpass', d); tone(t, 90, 0.2, 'sine', 0.4 * v, d, 40); break;
    case 'boo': {
      const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.7);
      lfo.frequency.value = 9; lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28 * v, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.7);
      o.connect(g); g.connect(d); o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
      break;
    }
    case 'whistle':
      tone(t, 1250, 0.18, 'sine', 0.3 * v, d, 1900);
      tone(t + 0.2, 1900, 0.25, 'sine', 0.3 * v, d, 1350);
      break;
    case 'emote0': [76, 72, 69, 64].forEach((n, i) => tone(t + i * 0.08, mf(n), 0.07, 'square', 0.14 * v, d)); break;
    case 'emote1': tone(t, 500, 0.12, 'square', 0.14 * v, d, 900); tone(t + 0.13, 900, 0.14, 'square', 0.14 * v, d, 500); break;
    case 'emote2': tone(t, 180, 0.4, 'triangle', 0.25 * v, d, 120); break;
    case 'emote3': [72, 79].forEach((n, i) => tone(t + i * 0.1, mf(n), 0.12, p25, 0.16 * v, d)); break;
    case 'emote4': tone(t, 900, 0.4, 'square', 0.12 * v, d, 300); break;
    case 'emote5': [79, 76].forEach((n, i) => tone(t + i * 0.12, mf(n), 0.12, 'triangle', 0.2 * v, d)); break;
    case 'emote6': [60, 59, 58, 55].forEach((n, i) => tone(t + i * 0.16, mf(n), 0.15, 'square', 0.14 * v, d)); break;
    case 'emote7': [72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.06, mf(n), 0.1, 'triangle', 0.18 * v, d)); break;
    case 'ability': tone(t, 400, 0.15, 'square', 0.14 * v, d, 1200); hit(t, 0.12, 0.12 * v, 2500, 'bandpass', d); break;
    case 'chomp': tone(t, 520, 0.05, 'square', 0.07 * v, d, 300); break;
    case 'power': [60, 64, 67, 72, 76].forEach((n, i) => tone(t + i * 0.05, mf(n), 0.08, 'square', 0.18 * v, d)); break;
    case 'eat': tone(t, 300, 0.25, 'square', 0.22 * v, d, 1400); break;
    case 'flagtake': [72, 76, 79].forEach((n, i) => tone(t + i * 0.07, mf(n), 0.1, p25, 0.25 * v, d)); break;
    case 'capture': [72, 76, 79, 84, 88].forEach((n, i) => tone(t + i * 0.09, mf(n), 0.14, p25, 0.3, d)); break;
    case 'jail': tone(t, 400, 0.3, 'square', 0.22 * v, d, 120); break;
    case 'shove': hit(t, 0.12, 0.3 * v, 600, 'lowpass', d); tone(t, 180, 0.1, 'square', 0.15 * v, d, 90); break;
    case 'gift': [84, 88, 91, 96].forEach((n, i) => tone(t + i * 0.06, mf(n), 0.12, 'triangle', 0.22 * v, d)); hit(t, 0.3, 0.06, 9000, 'highpass', d); break;
    case 'seek': [57, 57, 60, 57].forEach((n, i) => tone(t + i * 0.15, mf(n), 0.14, 'square', 0.25, d)); break;
    case 'sudden': [0, 1, 2, 3].forEach(i => tone(t + i * 0.18, i % 2 ? 660 : 880, 0.14, 'square', 0.22, d)); break;
    case 'click': tone(t, 700, 0.05, p25, 0.15, d); break;
  }
}
