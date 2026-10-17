// Voxel 3D renderer for the same game state. Draws the world with three.js and
// uses the 2D canvas on top as an overlay for particles, names and floating text.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { TS, MW, MH, T, isHideT, isSolidT, arenaSpiral, isWinter, BELT_SPEED } from './map.js';
import { RUNES, ITEMS, TEAM_COLS, MOB_COLS, HEROES, EMOTES, WEAPONS } from './sim.js';
import { CAPES } from './skins.js';
import { weaponSprite } from './render.js';

// flat pixel-art weapon lying along +x (forward after the holder turns it), grip at the origin
const wMeshCache = {};
function weaponMesh(k) {
  if (!wMeshCache[k]) {
    const c = weaponSprite(k), px = 1 / 22;
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(c.width * px, c.height * px);
    geo.translate((c.width / 2 - c.anchor[0]) * px, -(c.height / 2 - c.anchor[1]) * px, 0);
    wMeshCache[k] = { geo, mat: new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }) };
  }
  const mesh = new THREE.Mesh(wMeshCache[k].geo, wMeshCache[k].mat);
  mesh.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group(); holder.add(mesh); holder.rotation.y = -Math.PI / 2;
  return holder;
}

const U = v => v / TS;           // pixels -> tile units
const OL = '#1d1712';
const hash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

function canvasTex(draw, w = 16, h = 16) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, (col, x, y, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const noise = (P, cols, n) => { for (let i = 0; i < n; i++) P(cols[Math.floor(rnd() * cols.length)], Math.floor(rnd() * 16), Math.floor(rnd() * 16)); };

const TEX = {};
function textures() {
  if (TEX.stone) return TEX;
  TEX.stone = canvasTex((g, P) => {
    P('#7b7670', 0, 0, 16, 16); noise(P, ['#6c6762', '#8a857e'], 18);
    for (let r = 0; r < 3; r++) { P('#57534e', 0, r * 5 + 4, 16, 1); const o = r % 2 ? 0 : 4; P('#57534e', o, r * 5, 1, 4); P('#57534e', o + 8, r * 5, 1, 4); }
  });
  TEX.hedge = canvasTex((g, P) => { P('#2e4a22', 0, 0, 16, 16); noise(P, ['#3b5e2b', '#264019', '#4a7234'], 60); });
  TEX.leaves = canvasTex((g, P) => { P('#d8d8d8', 0, 0, 16, 16); noise(P, ['#b0b0b0', '#f4f4f4', '#9a9a9a'], 70); });
  TEX.bark = canvasTex((g, P) => { P('#5e4329', 0, 0, 16, 16); for (let x = 0; x < 16; x += 3) P('#4a3420', x, 0, 1, 16); noise(P, ['#6e5232'], 10); });
  TEX.crate = canvasTex((g, P) => {
    P(OL, 0, 0, 16, 16); P('#a8733e', 1, 1, 14, 14); P('#8b5a2b', 1, 1, 14, 2); P('#8b5a2b', 1, 13, 14, 2); P('#8b5a2b', 1, 1, 2, 14); P('#8b5a2b', 13, 1, 2, 14);
    for (let d = 0; d < 10; d++) P('#8b5a2b', 3 + d, 3 + d, 1, 1);
  });
  TEX.plank = canvasTex((g, P) => { P('#9a7650', 0, 0, 16, 16); for (let k = 0; k < 4; k++) { P('#7d5f3c', 0, k * 4 + 3, 16, 1); P('#ad8a60', (k * 7) % 14, k * 4, 2, 1); } });
  TEX.barricade = canvasTex((g, P) => { P('#5a3b1e', 0, 0, 16, 16); for (let k = 0; k < 4; k++) { P('#8b5a2b', k * 4, 0, 3, 16); P('#a8733e', k * 4, 0, 1, 16); } P('#4a2e14', 0, 5, 16, 2); P('#4a2e14', 0, 11, 16, 2); });
  TEX.snow = canvasTex((g, P) => { P('#f2f6f9', 0, 0, 16, 16); noise(P, ['#dfe8ee', '#ffffff'], 30); });
  TEX.neon = canvasTex((g, P) => { P('#0b1030', 0, 0, 16, 16); P('#2d5bff', 0, 0, 16, 2); P('#2d5bff', 0, 14, 16, 2); P('#2d5bff', 0, 0, 2, 16); P('#2d5bff', 14, 0, 2, 16); });
  TEX.wheat = canvasTex((g, P) => { for (let i = 0; i < 8; i++) { P('#b8963a', i * 2, 4, 1, 12); P('#e0c25a', i * 2, 0, 1, 5); } });
  TEX.tomb = canvasTex((g, P) => { P('#8a8a92', 0, 0, 16, 16); noise(P, ['#7a7a82', '#9a9aa2'], 20); P('#5f5f68', 7, 3, 2, 9); P('#5f5f68', 4, 5, 8, 2); });
  return TEX;
}

const matCache = new Map();
function lam(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {})));
  return matCache.get(key);
}
const fadeCache = new Map();
function fade(mat, op) {
  if (op >= 1) return mat;
  const key = mat.uuid + op;
  if (!fadeCache.has(key)) { const m = mat.clone(); m.transparent = true; m.opacity = op; fadeCache.set(key, m); }
  return fadeCache.get(key);
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(0.5, 10, 8);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }

class Pool {
  constructor(parent, make) { this.parent = parent; this.make = make; this.items = []; }
  sync(list, update) {
    let i = 0;
    for (const d of list) {
      let o = this.items[i];
      if (!o) { o = this.make(); this.parent.add(o); this.items.push(o); }
      o.visible = true; update(o, d, i); i++;
    }
    for (; i < this.items.length; i++) this.items[i].visible = false;
  }
}

function hatMesh(key) {
  const g = new THREE.Group();
  const add = m => { g.add(m); return m; };
  switch (key) {
    case 'cap': add(box(0.48, 0.1, 0.48, lam('#c8463d'), 0, 0.05, 0)); add(box(0.4, 0.05, 0.22, lam('#9a3028'), 0, 0.02, 0.3)); break;
    case 'crown': for (let i = 0; i < 4; i++) add(box(0.12, 0.18, 0.12, lam('#ffcc33', { emissive: '#4a3a00' }), (i % 2 ? 0.17 : -0.17), 0.09, (i < 2 ? 0.17 : -0.17))); add(box(0.46, 0.08, 0.46, lam('#ffcc33', { emissive: '#4a3a00' }), 0, 0.02, 0)); break;
    case 'wizard': { const c = add(new THREE.Mesh(CONE, lam('#2f4fa8'))); c.scale.set(0.5, 0.7, 0.5); c.position.y = 0.35; add(box(0.6, 0.05, 0.6, lam('#2f4fa8'), 0, 0.02, 0)); break; }
    case 'witch': { const c = add(new THREE.Mesh(CONE, lam('#2a1f3a'))); c.scale.set(0.46, 0.7, 0.46); c.position.y = 0.35; c.rotation.z = 0.15; add(box(0.72, 0.04, 0.72, lam('#2a1f3a'), 0, 0.02, 0)); add(box(0.48, 0.06, 0.48, lam('#8e58b0'), 0, 0.07, 0)); break; }
    case 'santa': { const c = add(new THREE.Mesh(CONE, lam('#d8453b'))); c.scale.set(0.46, 0.5, 0.46); c.position.y = 0.3; c.rotation.z = -0.35; add(box(0.5, 0.1, 0.5, lam('#f4f4f4'), 0, 0.04, 0)); const p = add(new THREE.Mesh(SPH, lam('#ffffff'))); p.scale.setScalar(0.14); p.position.set(0.2, 0.5, 0); break; }
    case 'tophat': add(box(0.62, 0.04, 0.62, lam('#222222'), 0, 0.02, 0)); add(box(0.4, 0.4, 0.4, lam('#2a2a2a'), 0, 0.22, 0)); add(box(0.41, 0.07, 0.41, lam('#c8463d'), 0, 0.08, 0)); break;
    case 'viking': { add(box(0.48, 0.16, 0.48, lam('#9a9aa8'), 0, 0.06, 0)); for (const s of [-1, 1]) { const h = add(new THREE.Mesh(CONE, lam('#f0e6c8'))); h.scale.set(0.1, 0.3, 0.1); h.position.set(0.3 * s, 0.18, 0); h.rotation.z = -0.6 * s; } break; }
    case 'ushanka': add(box(0.5, 0.16, 0.5, lam('#7a5a3a'), 0, 0.06, 0)); add(box(0.08, 0.26, 0.3, lam('#7a5a3a'), -0.26, -0.12, 0)); add(box(0.08, 0.26, 0.3, lam('#7a5a3a'), 0.26, -0.12, 0)); break;
    case 'horns': for (const s of [-1, 1]) { const h = add(new THREE.Mesh(CONE, lam('#c0392b'))); h.scale.set(0.09, 0.22, 0.09); h.position.set(0.15 * s, 0.1, 0.05); } break;
  }
  return g;
}

function makePawn(p, theme) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = lam('#e8c39e'), pants = lam('#3e3a48');
  const legL = box(0.17, 0.32, 0.17, pants, -0.12, 0.16, 0), legR = box(0.17, 0.32, 0.17, pants, 0.12, 0.16, 0);
  const torso = box(0.46, 0.38, 0.28, lam(p.color || '#888888'), 0, 0.51, 0);
  const armL = box(0.11, 0.34, 0.11, skin, -0.3, 0.5, 0), armR = box(0.11, 0.34, 0.11, skin, 0.3, 0.5, 0);
  const head = new THREE.Group(); head.position.y = 0.92;
  const face = box(0.4, 0.4, 0.4, skin);
  const hairMat = lam(p.hairCol || '#3b2a1a');
  head.add(face);
  if ((p.hair || 0) !== 3) { head.add(box(0.42, 0.1, 0.42, hairMat, 0, 0.17, 0)); head.add(box(0.42, 0.3, 0.08, hairMat, 0, 0.04, -0.18)); }
  if (p.hair === 1) { head.add(box(0.06, 0.32, 0.36, hairMat, -0.2, 0, -0.02)); head.add(box(0.06, 0.32, 0.36, hairMat, 0.2, 0, -0.02)); }
  if (p.hair === 2) head.add(box(0.08, 0.16, 0.36, hairMat, 0, 0.27, 0));
  const eyeMat = lam('#1d1712');
  const eyeL = box(0.06, 0.07, 0.02, eyeMat, -0.08, 0.02, 0.2), eyeR = box(0.06, 0.07, 0.02, eyeMat, 0.08, 0.02, 0.2);
  head.add(eyeL, eyeR);
  body.add(legL, legR, torso, armL, armR, head);
  const cape = box(0.44, 0.5, 0.04, lam('#888888'), 0, 0.46, -0.17); cape.visible = false; body.add(cape);
  const pumpkinHead = new THREE.Mesh(SPH, lam('#d9772e', { emissive: '#3a1a00' })); pumpkinHead.scale.set(0.5, 0.42, 0.5); pumpkinHead.position.y = 0.94; pumpkinHead.visible = false; body.add(pumpkinHead);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow);
  const marker = new THREE.Mesh(CONE, lam('#ff3b3b', { emissive: '#5a0000' })); marker.scale.set(0.24, 0.3, 0.24); marker.rotation.x = Math.PI; marker.position.y = 1.65; marker.visible = false; root.add(marker);
  const bomb = new THREE.Mesh(SPH, lam('#2a2a33')); bomb.scale.setScalar(0.32); bomb.position.y = 1.6; bomb.visible = false; root.add(bomb);
  const shield = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: '#7dff8a', transparent: true, opacity: 0.22, depthWrite: false })); shield.scale.setScalar(1.4); shield.position.y = 0.6; shield.visible = false; root.add(shield);
  const ice = box(0.8, 1.3, 0.8, new THREE.MeshLambertMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.45 }), 0, 0.62, 0); ice.visible = false; root.add(ice);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 18), new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; root.add(ring);
  const flag = new THREE.Group(); flag.add(box(0.05, 0.9, 0.05, lam('#d8d0c0'), 0, 0.45, 0)); const cloth = box(0.4, 0.26, 0.03, lam('#ffffff'), 0.22, 0.75, 0); flag.add(cloth);
  flag.position.set(0.25, 0.9, -0.15); flag.visible = false; root.add(flag);
  const gun = new THREE.Group(); gun.position.set(0.24, 0.55, 0.12); gun.visible = false; body.add(gun);
  const all = [legL, legR, armL, armR, face, eyeL, eyeR, pumpkinHead, ...head.children.filter(c => c !== face && c !== eyeL && c !== eyeR)];
  return { root, body, legL, legR, armL, armR, head, torso, cape, pumpkinHead, marker, bomb, shield, ice, ring, flag, cloth, all, gun, orig: all.map(o => o.material), hatKey: null, hat: null, key: '' };
}

function ghostMesh(col) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.75, emissive: col, emissiveIntensity: 0.25 });
  const b = new THREE.Mesh(CYL, mat); b.scale.set(0.6, 0.6, 0.6); b.position.y = 0.6; g.add(b);
  const top = new THREE.Mesh(SPH, mat); top.scale.setScalar(0.6); top.position.y = 0.9; g.add(top);
  for (const s of [-1, 1]) { const e = box(0.1, 0.14, 0.04, lam('#ffffff', { emissive: '#ffffff' }), 0.12 * s, 0.92, 0.29); g.add(e); }
  g.userData.mat = mat;
  return g;
}

export class Renderer3D {
  constructor(canvas3d, overlay) {
    this.c = canvas3d; this.ov = overlay; this.g = overlay.getContext('2d');
    this.gl = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: false, powerPreference: 'high-performance' });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.amb = new THREE.AmbientLight('#ffffff', 1.4);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.8); this.sun.position.set(-12, 30, 18);
    this.myLight = new THREE.PointLight('#ffe8b0', 0, 9, 1.2);
    this.scene.add(this.amb, this.sun, this.sun.target, this.myLight);
    this.spots = [];
    this.parts = []; this.texts = []; this.flakes = []; this.flames = []; this.pings = []; this.shake = 0;
    this.cam = new THREE.Vector3(); this.camInit = false;
    this.world = null;
    this.pawns = new Map();
    this.anims = new Map(); this.tracers = []; this.bloods = []; this.ray = new THREE.Raycaster();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }
  burst(x, y, col, n = 12, sp = 60, life = 0.6, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, h: 8 + Math.random() * 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vh: 20 + Math.random() * 40, life: life * (0.6 + Math.random() * 0.6), max: life, col, size });
    }
  }
  ring(x, y, col, r = 50) { for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; this.parts.push({ x, y, h: 4, vx: Math.cos(a) * r * 2, vy: Math.sin(a) * r * 2, vh: 0, life: 0.45, max: 0.45, col, size: 2 }); } }
  text(x, y, txt, col = '#fff') { this.texts.push({ x, y, h: 28, txt, col, life: 1.2 }); }
  ping(x, y, col = '#ffe14a') { this.pings.push({ x, y, col, life: 1.6 }); }
  anim(id, k, dur) { this.anims.set(id, { k, t: dur, dur }); }
  hurt(id) { this.anim(id, 'hurt', 0.25); }
  tracer(x0, y0, x1, y1) { this.tracers.push({ x0, y0, x1, y1, t: 0.09 }); }
  blood(x, y) { this.bloods.push([x, y, 0.6 + Math.random() * 0.5]); if (this.bloods.length > 150) this.bloods.shift(); }
  shell() { }
  inSight(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
    for (let i = 1; i < n; i++) { const tx = Math.floor((x0 + (x1 - x0) * i / n) / TS), ty = Math.floor((y0 + (y1 - y0) * i / n) / TS), k = ty * MW + tx; if (isSolidT(this.map.g[k]) || this.map.dyn.has(k)) return false; }
    return true;
  }
  muzzle(x, y) {
    if (!this.mz) { this.mz = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight('#ffe8a0', 0, 7, 1.2); this.scene.add(l); this.mz.push({ l, t: 0 }); } }
    const slot = this.mz.reduce((a, b) => a.t < b.t ? a : b);
    slot.t = 0.08; slot.l.position.set(U(x), 0.9, U(y));
  }
  screenToWorld(sx, sy) {
    this.ray.setFromCamera(new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1), this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const k = (0.4 - o.y) / d.y;
    return k > 0 ? [(o.x + d.x * k) * TS, (o.z + d.z * k) * TS] : null;
  }
  blast(tiles) { this.flames.push({ tiles, t: 0.5 }); }

  setMap(map, seed, layers2d) {
    if (this.world) { this.scene.remove(this.world); this.world.traverse(o => { if (o.geometry && o.geometry !== BOX && o.geometry !== SPH && o.geometry !== CONE && o.geometry !== CYL) o.geometry.dispose(); }); }
    for (const p of this.pawns.values()) this.scene.remove(p.root);
    this.pawns.clear();
    this.map = map; this.camInit = false; this.parts = []; this.texts = []; this.flames = []; this.bloods = []; this.tracers = [];
    const th = map.theme, win = isWinter(th), pac = map.type === 'pacman', hw = th === 'halloween';
    const tx = textures();
    const W = new THREE.Group(); this.world = W; this.scene.add(W);
    this.scene.background = new THREE.Color(map.type === 'fort' && !win ? '#21173a' : pac || map.type === 'neon' ? '#0a0612' : hw ? '#1a1024' : win ? '#c8d8e6' : map.type === 'magic' ? '#24303a' : '#9ec4de');
    this.dusk = map.type === 'fort' && !win && !hw;
    this.base = { amb: this.dusk ? 0.85 : pac ? 0.9 : hw ? 0.8 : 1.4, sun: this.dusk ? 0.9 : pac ? 0.6 : hw ? 0.9 : 1.8, ambCol: this.dusk ? '#9a88d0' : hw ? '#b8a0ff' : map.type === 'magic' ? '#a8d8ff' : '#ffffff' };

    // ground: reuse the pixel-art ground from the 2D renderer
    const gt = new THREE.CanvasTexture(layers2d.ground);
    gt.magFilter = THREE.NearestFilter; gt.minFilter = THREE.NearestFilter; gt.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshLambertMaterial({ map: gt }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(MW / 2, 0, MH / 2); W.add(ground);

    const tiles = {};
    for (let i = 0; i < MW * MH; i++) (tiles[map.g[i]] = tiles[map.g[i]] || []).push(i);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const place = (mesh, k, x, y, z, sx, sy, sz, ry = 0) => { q.setFromEuler(new THREE.Euler(0, ry, 0)); m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz)); mesh.setMatrixAt(k, m4); };
    const inst = (list, mat, fn, colorFn) => {
      if (!list || !list.length) return null;
      const mesh = new THREE.InstancedMesh(BOX, mat, list.length);
      list.forEach((i, k) => { fn(mesh, k, i % MW, (i / MW) | 0, i); if (colorFn) mesh.setColorAt(k, new THREE.Color(colorFn(i, k))); });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      W.add(mesh); return mesh;
    };
    const topped = (side, top) => [side, side, top, side, side, side];
    const snowTop = new THREE.MeshLambertMaterial({ map: tx.snow });

    const wallMat = map.type === 'neon' ? [new THREE.MeshLambertMaterial({ color: '#2a1838' }), new THREE.MeshLambertMaterial({ color: '#2a1838' }), new THREE.MeshLambertMaterial({ color: '#ff3fa4', emissive: '#801850' }), new THREE.MeshLambertMaterial({ color: '#2a1838' }), new THREE.MeshLambertMaterial({ color: '#2ff3ff', emissive: '#105a60' }), new THREE.MeshLambertMaterial({ color: '#2a1838' })] : pac ? new THREE.MeshLambertMaterial({ map: tx.neon, emissive: '#0a1a5a' }) : new THREE.MeshLambertMaterial({ map: tx.stone });
    inst(tiles[T.WALL], win && !pac && map.type !== 'neon' ? topped(wallMat, snowTop) : wallMat, (m, k, x, y) => place(m, k, x + 0.5, (pac ? 0.6 : 1.3) / 2, y + 0.5, 1, pac ? 0.6 : 1.3, 1));
    const hedgeMat = new THREE.MeshLambertMaterial({ map: tx.hedge });
    inst(tiles[T.HEDGE], win ? topped(hedgeMat, snowTop) : hedgeMat, (m, k, x, y) => place(m, k, x + 0.5, 0.55, y + 0.5, 1, 1.1, 1));
    inst(tiles[T.TOMB], new THREE.MeshLambertMaterial({ map: tx.tomb }), (m, k, x, y) => place(m, k, x + 0.5, 0.35, y + 0.55, 0.55, 0.7, 0.18));
    inst(tiles[T.WHEAT], new THREE.MeshLambertMaterial({ map: tx.wheat, transparent: true, alphaTest: 0.5 }), (m, k, x, y) => place(m, k, x + 0.5, 0.35, y + 0.5, 0.95, 0.7, 0.95));

    // trees: trunk + voxel canopy (palms on the beach, pines in winter)
    const trees = tiles[T.TREE] || [];
    inst(trees, new THREE.MeshLambertMaterial({ map: tx.bark }), (m, k, x, y) => place(m, k, x + 0.5, 0.6, y + 0.5, 0.22, 1.2, 0.22));
    const leafMat = new THREE.MeshLambertMaterial({ map: tx.leaves });
    const canopy = [];
    trees.forEach(i => {
      const h = hash(i + seed), x = i % MW + 0.5, y = ((i / MW) | 0) + 0.5;
      const pine = win ? h % 10 < 7 : map.type !== 'magic' && map.type !== 'beach' && h % 3 === 0;
      let col;
      if (map.type === 'magic') col = ['#7a6ad0', '#3fb0a0', '#c870b8', '#4f9a70'][h % 4];
      else if (map.type === 'beach') col = '#4f9a3a';
      else if (hw) col = ['#c0601e', '#a8843a', '#7a4a1a', '#8a6a2a'][h % 4];
      else if (win && !pine) col = '#ffffff';
      else col = pine ? '#2f6a30' : h % 7 === 0 ? '#a8843a' : '#4f8a32';
      if (map.type === 'beach') { canopy.push([x, 1.25, y, 1.4, 0.18, 0.5, col, h]); canopy.push([x, 1.25, y, 0.5, 0.18, 1.4, col, h]); }
      else if (pine) { canopy.push([x, 1.0, y, 1.1, 0.5, 1.1, col]); canopy.push([x, 1.45, y, 0.8, 0.45, 0.8, col]); canopy.push([x, 1.85, y, 0.45, 0.4, 0.45, win ? '#ffffff' : col]); }
      else canopy.push([x, 1.55, y, 1.15, 1.0, 1.15, col]);
    });
    if (canopy.length) {
      const mesh = new THREE.InstancedMesh(BOX, leafMat, canopy.length);
      canopy.forEach(([x, y, z, sx, sy, sz, col], k) => { place(mesh, k, x, y, z, sx, sy, sz, 0); mesh.setColorAt(k, new THREE.Color(col)); });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; W.add(mesh);
      this.canopy = mesh;
    }
    this.bushMat = new THREE.MeshLambertMaterial({ map: tx.leaves, transparent: true, opacity: 1 });
    inst(tiles[T.BUSH], this.bushMat, (m, k, x, y) => place(m, k, x + 0.5, 0.4, y + 0.5, 0.95, 0.8, 0.95), i => hw ? '#4a6a3a' : map.type === 'magic' ? '#6a5ab0' : win ? '#d8e8e0' : '#3f7a2c');

    // decor objects
    const decoKind = map.type === 'neon' ? 'neon' : hw || map.type === 'graveyard' ? 'pumpkin' : win ? 'snowman' : map.type === 'beach' ? 'umbrella' : map.type === 'magic' ? 'crystal' : 'barrel';
    for (const i of tiles[T.DECOR] || []) {
      if (map.deco[i]) continue;
      const x = i % MW + 0.5, y = ((i / MW) | 0) + 0.5, d = new THREE.Group();
      if (decoKind === 'pumpkin') { const p = new THREE.Mesh(SPH, lam('#d9772e', { emissive: '#5a2a00' })); p.scale.set(0.7, 0.55, 0.7); p.position.y = 0.28; d.add(p, box(0.06, 0.15, 0.06, lam('#4a6b2a'), 0, 0.6, 0)); }
      else if (decoKind === 'snowman') { for (const [r, h] of [[0.6, 0.3], [0.45, 0.75], [0.32, 1.1]]) { const s2 = new THREE.Mesh(SPH, lam('#f4f8fb')); s2.scale.setScalar(r); s2.position.y = h; d.add(s2); } d.add(box(0.08, 0.06, 0.2, lam('#ff8a2a'), 0, 1.1, 0.2)); d.add(box(0.3, 0.25, 0.3, lam('#2a2a2a'), 0, 1.35, 0)); }
      else if (decoKind === 'umbrella') { d.add(box(0.05, 1.2, 0.05, lam('#8a6a44'), 0, 0.6, 0)); const c2 = new THREE.Mesh(CONE, lam('#d8453b')); c2.scale.set(1.3, 0.35, 1.3); c2.position.y = 1.25; d.add(c2); }
      else if (decoKind === 'neon') { const cols = ['#ff3fa4', '#6a3a1a', '#3fc05a', '#2ff3ff']; d.add(box(0.8, 0.5, 0.8, lam(cols[(i * 7) % 4], { emissive: (i * 7) % 4 === 3 ? '#105a60' : '#000000' }), 0, 0.25, 0)); }
      else if (decoKind === 'crystal') { const c2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), lam('#9a7aff', { emissive: '#3a2a8a' })); c2.scale.y = 1.6; c2.position.y = 0.65; d.add(c2); }
      else { const b2 = new THREE.Mesh(CYL, lam('#8b5a2b')); b2.scale.set(0.6, 0.75, 0.6); b2.position.y = 0.38; d.add(b2); }
      d.position.set(x, 0, y); W.add(d);
    }
    for (const i of tiles[T.MUSH] || []) {
      const x = i % MW + 0.5, y = ((i / MW) | 0) + 0.5, magic = map.type === 'magic';
      const cap = new THREE.Mesh(SPH, lam(magic ? ['#5ad0d0', '#c85aa8', '#9a7aff'][i % 3] : '#c8463d', magic ? { emissive: '#204a4a' } : undefined));
      cap.scale.set(0.3, 0.16, 0.3); cap.position.set(x + 0.15, 0.25, y); W.add(cap, box(0.07, 0.2, 0.07, lam('#e8dcc0'), x + 0.15, 0.1, y));
    }
    // decks of the multi-storey castle: slabs, cliff faces, stairs, wall tops
    const LH = 1.4, nlv = i => i < 0 || i >= MW * MH ? 0 : map.lvl[i];
    this.deckMats = [];
    const deckTex = L => canvasTex((g2, P) => {
      const base = ['', '#6d6a74', '#8a5e36', '#4a3a5e', '#c8b878'][L], line = ['', '#56535d', '#6a4426', '#3a2c4c', '#b4a460'][L], hi = ['', '#827e8a', '#a47446', '#6a5a80', '#ece0a4'][L];
      P(base, 0, 0, 16, 16);
      if (L === 2) for (let k = 0; k < 4; k++) { P(line, 0, k * 4 + 3, 16, 1); P(hi, (k * 5) % 12, k * 4, 3, 1); }
      else { P(line, 0, 0, 16, 1); P(line, 0, 0, 1, 16); noise(P, [line, hi], 12); }
    });
    const carpetTex = L => canvasTex((g2, P) => {
      const c0 = ['', '#8a1c24', '#1c4a8a', '#8a1c24', '#6a1c8a'][L];
      P(c0, 0, 0, 16, 16); P('#e0b252', 0, 0, 16, 1); P('#e0b252', 0, 15, 16, 1); P('#ffffff22', 3, 3, 10, 10);
    });
    for (let L = 1; L <= 4; L++) {
      const ups = []; for (let i = 0; i < MW * MH; i++) if (map.lvl[i] === L && map.up[i] && map.g[i] !== T.STAIRS) ups.push(i);
      if (!ups.length) continue;
      const mat = new THREE.MeshLambertMaterial({ map: deckTex(L), transparent: true, opacity: 1 });
      this.deckMats.push(mat);
      this.upMesh = inst(ups, mat, (m, k, x, y) => place(m, k, x + 0.5, L * LH - 0.1, y + 0.5, 1, 0.2, 1));
      const car = ups.filter(i => map.fstyle[i] && map.g[i] !== T.WALL && map.g[i] !== T.DECOR);
      if (car.length) { const cm = new THREE.MeshLambertMaterial({ map: carpetTex(L), transparent: true, opacity: 1 }); this.deckMats.push(cm); inst(car, cm, (m, k, x, y) => place(m, k, x + 0.5, L * LH + 0.01, y + 0.5, 0.96, 0.03, 0.96)); }
    }
    // cliff faces under every deck edge that borders lower ground
    { const faces = [];
      for (let i = 0; i < MW * MH; i++) {
        const L = map.lvl[i]; if (!L || map.g[i] === T.STAIRS) continue;
        const x = i % MW, y = (i / MW) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = (y + dy) * MW + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= MW || y + dy >= MH || map.g[ni] === T.STAIRS) continue;
          const nl = nlv(ni); if (nl >= L) continue;
          faces.push([x + 0.5 + dx * 0.46, y + 0.5 + dy * 0.46, dx, dy, nl * LH, L * LH - 0.2]);
        }
      }
      if (faces.length) {
        const mesh = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ map: tx.stone, color: '#9a96a8' }), faces.length);
        faces.forEach(([fx, fz, dx, dy, y0, y1], k) => place(mesh, k, fx, (y0 + y1) / 2, fz, dx ? 0.1 : 1, y1 - y0, dx ? 1 : 0.1));
        mesh.instanceMatrix.needsUpdate = true; W.add(mesh);
      } }
    // stairs: four steps climbing toward the upper deck
    { const st = []; for (let i = 0; i < MW * MH; i++) if (map.stair[i] >= 0 && map.g[i] === T.STAIRS) st.push(i);
      if (st.length) {
        const mesh = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ map: tx.stone, color: '#b8b4c4' }), st.length * 4);
        const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        st.forEach((i, k) => {
          const lo = map.stair[i], [dx, dy] = DIRS[map.stairD[i]], cx0 = i % MW + 0.5, cz0 = ((i / MW) | 0) + 0.5;
          for (let s2 = 0; s2 < 4; s2++) {
            const top = lo * LH + (s2 + 1) * LH / 4, off = -0.375 + s2 * 0.25;
            place(mesh, k * 4 + s2, cx0 + dx * off, top / 2, cz0 + dy * off, dx ? 0.25 : 1, top, dx ? 1 : 0.25);
          }
        });
        mesh.instanceMatrix.needsUpdate = true; W.add(mesh);
      } }
    // walls standing on decks
    { const dw = []; for (let i = 0; i < MW * MH; i++) if (map.lvl[i] > 0 && map.g[i] === T.WALL) dw.push(i);
      const cols = ['', '#aaa6b4', '#c49a6a', '#9a88c0', '#e8d890'];
      if (dw.length) inst(dw, new THREE.MeshLambertMaterial({ map: tx.stone }), (m, k, x, y, i) => place(m, k, x + 0.5, map.lvl[i] * LH + 0.65, y + 0.5, 1, 1.3, 1), i => cols[map.lvl[i]]); }
    // castle furniture and braziers
    this.flames3 = []; this.torchPos = [];
    for (let i = 0; i < MW * MH; i++) {
      if (map.g[i] !== T.DECOR || !map.deco[i]) continue;
      const kind = map.deco[i], x = i % MW + 0.5, z0 = ((i / MW) | 0) + 0.5, y0 = map.lvl[i] * LH, d = new THREE.Group();
      if (kind === 1) {
        const bowl = new THREE.Mesh(CYL, lam('#3a3a44')); bowl.scale.set(0.5, 0.3, 0.5); bowl.position.y = 0.55;
        const leg = new THREE.Mesh(CYL, lam('#2a2a30')); leg.scale.set(0.15, 0.45, 0.15); leg.position.y = 0.22;
        const fl = new THREE.Mesh(CONE, new THREE.MeshBasicMaterial({ color: '#ff9a2a' })); fl.scale.set(0.4, 0.8, 0.4); fl.position.y = 1.0;
        const fl2 = new THREE.Mesh(CONE, new THREE.MeshBasicMaterial({ color: '#ffe36a' })); fl2.scale.set(0.22, 0.5, 0.22); fl2.position.y = 0.9;
        d.add(leg, bowl, fl, fl2); this.flames3.push({ a: fl, b: fl2, ph: i * 0.37 }); this.torchPos.push([x, y0 + 1.1, z0]);
      } else if (kind === 2) { const b2 = new THREE.Mesh(CYL, lam('#8b5a2b')); b2.scale.set(0.62, 0.8, 0.62); b2.position.y = 0.4; d.add(b2, box(0.66, 0.05, 0.66, lam('#3a3a44'), 0, 0.55, 0)); }
      else if (kind === 3) { d.add(box(0.9, 0.08, 0.7, lam('#8a5a2a'), 0, 0.5, 0), box(0.08, 0.5, 0.08, lam('#5a3b1e'), -0.38, 0.25, -0.28), box(0.08, 0.5, 0.08, lam('#5a3b1e'), 0.38, 0.25, 0.28), box(0.2, 0.12, 0.2, lam('#c8463d'), 0.2, 0.6, 0)); }
      else if (kind === 4) { const hd = new THREE.Mesh(SPH, lam('#a4a4b0')); hd.scale.setScalar(0.3); hd.position.y = 1.35; d.add(box(0.8, 0.25, 0.8, lam('#7a7a84'), 0, 0.12, 0), box(0.4, 0.8, 0.3, lam('#a4a4b0'), 0, 0.65, 0), hd, box(0.08, 0.7, 0.08, lam('#e8e8f4'), 0.3, 0.8, 0.1)); }
      else if (kind === 5) { d.add(box(0.8, 0.4, 0.55, lam('#7a4a22'), 0, 0.2, 0), box(0.82, 0.12, 0.57, lam('#a8733e'), 0, 0.45, 0), box(0.12, 0.14, 0.04, lam('#ffd23f', { emissive: '#4a3a00' }), 0, 0.35, 0.29)); }
      else if (kind === 6) { d.add(box(0.95, 0.3, 0.8, lam('#ffd23f', { emissive: '#3a2a00' }), 0, 0.15, 0), box(0.8, 0.6, 0.55, lam('#a01830'), 0, 0.6, 0.05), box(0.95, 1.5, 0.15, lam('#7a1020'), 0, 1.05, -0.35), box(1.0, 0.12, 0.2, lam('#ffd23f', { emissive: '#3a2a00' }), 0, 1.85, -0.35)); }
      else { d.add(box(0.9, 1.3, 0.35, lam('#5a3b1e'), 0, 0.65, 0)); for (let r2 = 0; r2 < 3; r2++) d.add(box(0.8, 0.14, 0.05, lam(['#c8463d', '#3f7fc4', '#d9a63a'][r2]), 0, 0.3 + r2 * 0.35, 0.2)); }
      d.position.set(x, y0, z0); W.add(d);
    }
    // portals
    this.portals = [];
    for (const pr of map.portals) for (const i of pr) {
      const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.07, 6, 16), new THREE.MeshLambertMaterial({ color: pac ? '#2d5bff' : map.type === 'magic' ? '#ff6b9a' : '#b07cff', emissive: '#3a1a7a' }));
      t2.position.set(i % MW + 0.5, 0.5, ((i / MW) | 0) + 0.5); W.add(t2); this.portals.push(t2);
    }
    // conveyor belts: one instanced mesh, chevron texture scrolls along each strip
    const belts = []; for (let i = 0; i < MW * MH; i++) if (map.belt && map.belt[i] >= 0) belts.push(i);
    this.beltTex = null;
    if (belts.length) {
      const bt = canvasTex((g2, P) => {
        P('#33333c', 0, 0, 16, 16); P('#55555f', 0, 0, 16, 1); P('#55555f', 0, 15, 16, 1);
        for (const o of [3, 11]) for (let j = 0; j < 4; j++) { P('#e0b252', o + j - 3, 4 + j); P('#e0b252', o + j - 3, 11 - j); }
      });
      bt.wrapS = THREE.RepeatWrapping;
      this.beltTex = bt;
      const mesh = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ map: bt }), belts.length);
      const rot = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
      belts.forEach((i, k) => place(mesh, k, i % MW + 0.5, 0.03, ((i / MW) | 0) + 0.5, 1, 0.06, 1, rot[map.belt[i]]));
      mesh.instanceMatrix.needsUpdate = true; W.add(mesh);
    }
    // garland lights (new year)
    this.lights = null;
    if (th === 'newyear' && layers2d.lights.length) {
      const L = layers2d.lights, mesh = new THREE.InstancedMesh(SPH, new THREE.MeshBasicMaterial({ color: '#ffffff' }), L.length);
      L.forEach(([lx, ly], k) => { place(mesh, k, U(lx), 1.33, U(ly) - 0.1, 0.09, 0.09, 0.09); mesh.setColorAt(k, new THREE.Color('#ffd23f')); });
      mesh.instanceMatrix.needsUpdate = true; W.add(mesh); this.lights = mesh;
    }

    // dynamic instanced: crates, barricades, sudden-death blocks, pellets
    const crateMat = new THREE.MeshLambertMaterial({ map: tx.crate });
    this.crates = new THREE.InstancedMesh(BOX, win ? topped(crateMat, snowTop) : crateMat, Math.max(1, map.crates.size)); W.add(this.crates); this.crateN = -1;
    this.barr = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ map: tx.barricade }), 400); W.add(this.barr);
    this.stoneDyn = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ map: tx.stone }), 400); W.add(this.stoneDyn);
    this.pellets = new THREE.InstancedMesh(SPH, new THREE.MeshBasicMaterial({ color: '#ffd9a0' }), Math.max(1, map.pellets.size)); W.add(this.pellets); this.pelN = -1;
    this.spiral = map.type === 'arena' ? arenaSpiral() : [];
    this.place = place;

    // pools for transient things
    const P = (make) => new Pool(W, make);
    this.pool = {
      runes: P(() => { const g = new THREE.Group(); g.add(box(0.36, 0.42, 0.36, lam('#4b4a55'))); const gl = box(0.38, 0.12, 0.38, new THREE.MeshBasicMaterial({ color: '#ffffff' })); g.add(gl); g.userData.gl = gl; return g; }),
      gifts: P(() => { const g = new THREE.Group(); const b2 = box(0.5, 0.42, 0.5, lam('#d8453b')); g.add(b2, box(0.52, 0.44, 0.1, lam('#ffd23f')), box(0.1, 0.44, 0.52, lam('#ffd23f'))); g.userData.b = b2; return g; }),
      items: P(() => { const g = new THREE.Group(); const b2 = box(0.4, 0.4, 0.4, lam('#ff7a2a', { emissive: '#3a1a00' })); g.add(b2); g.userData.b = b2; return g; }),
      bombs: P(() => { const g = new THREE.Group(); const s2 = new THREE.Mesh(SPH, lam('#2a2a33')); s2.scale.setScalar(0.6); s2.position.y = 0.3; g.add(s2, box(0.05, 0.2, 0.05, lam('#ffd23f', { emissive: '#ff8a00' }), 0.1, 0.65, 0)); g.userData.s = s2; return g; }),
      mobs: P(() => ghostMesh('#ff4040')),
      spirits: P(() => ghostMesh('#c9a8ff')),
      ghosts: P(() => ghostMesh('#e8eef8')),
      meteors: P(() => { const g = new THREE.Group(); const r2 = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 24), new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.6, side: THREE.DoubleSide })); r2.rotation.x = -Math.PI / 2; r2.position.y = 0.05; const rock = new THREE.Mesh(SPH, lam(hw ? '#d9772e' : win ? '#e8f4ff' : '#7a5a4a')); rock.scale.setScalar(0.6); g.add(r2, rock); g.userData.rock = rock; return g; }),
      puddles: P(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), new THREE.MeshBasicMaterial({ color: '#8ad24a', transparent: true, opacity: 0.5, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; return m; }),
      traps: P(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.3, 6), new THREE.MeshBasicMaterial({ color: '#bff2ff', transparent: true, opacity: 0.8 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; return m; }),
      flames: P(() => box(0.9, 0.7, 0.9, new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85 }))),
      flags: P(() => { const g = new THREE.Group(); g.add(box(0.06, 1.3, 0.06, lam('#d8d0c0'), 0, 0.65, 0)); const c2 = box(0.55, 0.36, 0.04, lam('#ffffff'), 0.3, 1.1, 0); g.add(c2); const pad = new THREE.Mesh(new THREE.RingGeometry(1, 1.15, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.04; g.add(pad); g.userData.c = c2; g.userData.pad = pad; return g; }),
      pickups: P(() => { const g = new THREE.Group(); const b2 = new THREE.Group(); b2.position.y = 0.08; g.add(b2); const r2 = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 16), new THREE.MeshBasicMaterial({ color: '#ff3fa4', transparent: true, opacity: 0.7, side: THREE.DoubleSide })); r2.rotation.x = -Math.PI / 2; r2.position.y = 0.03; g.add(r2); g.userData.b = b2; return g; }),
      thrown: P(() => box(0.5, 0.1, 0.14, lam('#9a9aa8'))),
      blood: P(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), new THREE.MeshBasicMaterial({ color: '#7a0c12', transparent: true, opacity: 0.85, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.025; return m; }),
      zone: P(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.7, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; return m; }),
    };
  }

  pawnFor(p) {
    let m = this.pawns.get(p.id);
    if (!m) { m = makePawn(p, this.map.theme); this.scene.add(m.root); this.pawns.set(p.id, m); }
    return m;
  }

  // world (pixels, height in pixels) -> overlay screen pixels
  project(x, y, h = 0) {
    const v = new THREE.Vector3(U(x), U(h), U(y)).project(this.camera);
    return [(v.x + 1) / 2 * this.ov.width, (1 - v.y) / 2 * this.ov.height, v.z < 1];
  }

  draw(v, dt, t) {
    if (!this.map) return;
    const map = this.map, th = map.theme, win = isWinter(th), hw = th === 'halloween';
    const me = v.players.find(p => p.id === v.me);
    const focus = me && (me.alive || me.ghost) ? me : v.players.find(p => p.it && p.alive) || v.players.find(p => p.alive) || me || v.players[0];
    const reveal = me && me.fx && me.fx.eye > 0;
    const ctf = v.mode === 'ctf';

    // camera: fixed angle, follows the focus pawn
    const portrait = innerHeight > innerWidth;
    const heightOf = p => {
      if (!p) return 0;
      if (p.stairs) {
        const tx = Math.floor(p.x / TS), ty = Math.floor(p.y / TS), i = ty * MW + tx, lo = map.stair[i];
        if (lo >= 0) { const d = map.stairD[i], fxp = (p.x - tx * TS) / TS, fyp = (p.y - ty * TS) / TS, f = d === 0 ? fxp : d === 2 ? 1 - fxp : d === 1 ? fyp : 1 - fyp; return (lo + f) * 1.4; }
      }
      return (p.z || 0) * 1.4;
    };
    this.heightOf = heightOf;
    const fx = focus ? U(focus.x) : MW / 2, fz = focus ? U(focus.y) : MH / 2, fy = heightOf(focus);
    const tgt = new THREE.Vector3(fx, fy, fz);
    if (!this.camInit) { this.cam.copy(tgt); this.camInit = true; }
    this.cam.lerp(tgt, Math.min(1, dt * 8));
    this.shake = Math.max(0, this.shake - dt * 3);
    const dist = portrait ? 1.45 : 1;
    const sx = (Math.random() - 0.5) * this.shake * 0.4, sz = (Math.random() - 0.5) * this.shake * 0.4;
    this.camera.position.set(this.cam.x + sx, this.cam.y + 12.5 * dist, this.cam.z + 9 * dist + sz);
    this.camera.lookAt(this.cam.x + sx, this.cam.y, this.cam.z + sz + 0.6);

    // lighting per event / mode
    const ev = v.event;
    let amb = this.base.amb, sun = this.base.sun, myL = 0, fog = null;
    if (ev === 'night') { amb = 0.18; sun = 0.05; myL = 6; }
    if (ev === 'fog') fog = ['#7e8494', 3, 12];
    if (ev === 'blizzard') fog = ['#dfe8f0', 2, 10];
    if (ev === 'spirits') { amb *= 0.45; sun *= 0.4; myL = 3; }
    const hiding = v.mode === 'hide' && v.phase === 'play';
    if (hiding) { amb = 0.05; sun = 0; myL = 2.2; }
    const dmDark = v.mode === 'dm';
    if (dmDark) { amb = 0.06; sun = 0; myL = 1.4; }
    if (me && me.fx && me.fx.blind > 0) { amb = 0.03; sun = 0; myL = 1.2; }
    if (hiding && me && me.it && v.hideT > 0) { amb = 0; myL = 0; }
    this.amb.intensity = amb; this.amb.color.set(this.base.ambCol); this.sun.intensity = sun;
    if (!fog && this.dusk) fog = ['#21173a', 18, 52];
    this.scene.fog = fog ? new THREE.Fog(fog[0], fog[1], fog[2]) : null;
    if (me) { this.myLight.position.set(U(me.x), heightOf(me) + 1.6, U(me.y)); }
    this.myLight.intensity = myL;
    const seekers = hiding ? v.players.filter(p => p.alive && p.it) : dmDark ? v.players.filter(p => p.alive) : [];
    while (this.spots.length < seekers.length) { const s2 = new THREE.SpotLight('#fff6c0', 0, 11, 0.6, 0.4, 1); this.scene.add(s2, s2.target); this.spots.push(s2); }
    this.spots.forEach((s2, i) => {
      const p = seekers[i];
      s2.intensity = p ? (dmDark ? 34 : 40) : 0; s2.distance = dmDark ? 13 : 11;
      if (p) { const h = heightOf(p) + 0.9; s2.position.set(U(p.x), h, U(p.y)); s2.target.position.set(U(p.x) + p.fdx * 4, 0, U(p.y) + p.fdy * 4); }
    });

    // world animation & dynamic instanced sets
    for (const pt of this.portals) pt.rotation.y += dt * 2;
    if (this.flames3 && this.flames3.length) {
      for (const f of this.flames3) { const k2 = 1 + Math.sin(t * 14 + f.ph) * 0.18 + Math.sin(t * 23 + f.ph * 2) * 0.1; f.a.scale.set(0.4 * k2, 0.8 * k2, 0.4 * k2); f.b.scale.set(0.22, 0.5 * (2 - k2), 0.22); }
      if (!this.tl) { this.tl = []; for (let i = 0; i < 5; i++) { const l = new THREE.PointLight('#ff9a40', 0, 9, 1.4); this.scene.add(l); this.tl.push(l); } }
      const cxz = this.cam, near3 = this.torchPos.map(p => [p, (p[0] - cxz.x) ** 2 + (p[1] - cxz.y) ** 2 * 0.3 + (p[2] - cxz.z) ** 2]).sort((a, b) => a[1] - b[1]);
      this.tl.forEach((l, i) => { const e = near3[i]; if (!e) { l.intensity = 0; return; } l.position.set(e[0][0], e[0][1] + 0.2, e[0][2]); l.intensity = 7 + Math.sin(t * 15 + i * 2) * 1.4 + Math.sin(t * 27 + i) * 0.8; });
      if (Math.random() < dt * 14 && near3[0]) { const p = near3[Math.floor(Math.random() * Math.min(4, near3.length))][0]; this.parts.push({ x: p[0] * TS, y: p[2] * TS, h: p[1] * TS, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, vh: 18 + Math.random() * 14, life: 1.1, max: 1.1, col: Math.random() < 0.5 ? '#ff9a2a' : '#ffd23f', size: 1 }); }
    }
    if (this.mz) for (const m of this.mz) { m.t = Math.max(0, m.t - dt); m.l.intensity = m.t > 0 ? 8 : 0; }
    if (this.beltTex) this.beltTex.offset.x = -((t * BELT_SPEED / TS) % 1);
    if (this.lights) { const ph = Math.floor(t * 2); const cols = ['#ff4a3b', '#ffd23f', '#4ad0ff', '#7dff5a', '#ff7ad9']; for (let k = 0; k < this.lights.count; k++) this.lights.setColorAt(k, new THREE.Color(cols[(k + ph) % 5])); this.lights.instanceColor.needsUpdate = true; }
    if (this.crateN !== map.crates.size) {
      this.crateN = map.crates.size; let k = 0;
      for (const i of map.crates) this.place(this.crates, k++, i % MW + 0.5, 0.45, ((i / MW) | 0) + 0.5, 0.92, 0.9, 0.92);
      this.crates.count = k; this.crates.instanceMatrix.needsUpdate = true;
    }
    if (this.pelN !== map.pellets.size) {
      this.pelN = map.pellets.size; let k = 0;
      for (const i of map.pellets) { const big = map.power.has(i); this.place(this.pellets, k++, i % MW + 0.5, 0.3, ((i / MW) | 0) + 0.5, big ? 0.4 : 0.14, big ? 0.4 : 0.14, big ? 0.4 : 0.14); }
      this.pellets.count = k; this.pellets.instanceMatrix.needsUpdate = true;
    }
    const sdSet = this.spiral.length && v.sd ? new Set(this.spiral.slice(0, v.sd)) : null;
    let nb = 0, ns = 0;
    for (const i of v.walls) {
      const x = i % MW + 0.5, y = ((i / MW) | 0) + 0.5;
      if (sdSet && sdSet.has(i)) this.place(this.stoneDyn, ns++, x, 0.65, y, 1, 1.3, 1);
      else if (nb < 400) this.place(this.barr, nb++, x, 0.5, y, 0.95, 1, 0.95);
    }
    this.barr.count = nb; this.stoneDyn.count = Math.min(400, ns);
    this.barr.instanceMatrix.needsUpdate = true; this.stoneDyn.instanceMatrix.needsUpdate = true;

    const inHide = p => isHideT(map.g[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)]);
    const underUp = p => (p.z || 0) === 0 && map.up[Math.floor(p.y / TS) * MW + Math.floor(p.x / TS)];
    const hiddenFor = p => {
      if (p.id === v.me) return false;
      if (v.mode === 'dm' && me && !this.inSight(me.x, me.y - 6, p.x, p.y - 6)) return true;
      if (reveal) return false;
      if (p.fx && p.fx.invis > 0) return true;
      const far = !me || Math.hypot(me.x - p.x, me.y - p.y) > 28;
      return (inHide(p) && (far || p.hero === 'ninja')) || (underUp(p) && me && (me.z || 0) > 0 && far);
    };
    this.bushMat.opacity = me && me.alive && inHide(me) ? 0.45 : 1;
    for (const dm2 of this.deckMats || []) dm2.opacity = me && underUp(me) && !me.stairs ? 0.3 : 1;

    const pl = this.pool, hOf = p => heightOf(p);
    pl.runes.sync(v.runes, (o, r) => { o.position.set(U(r.x), (r.z || 0) * 1.4 + 0.45 + Math.sin(t * 3 + r.id) * 0.08, U(r.y)); o.rotation.y = t * 1.5 + r.id; o.userData.gl.material.color.set(RUNES[r.k].col); });
    pl.gifts.sync(v.gifts, (o, gf) => { o.position.set(U(gf.x), 0.25 + Math.abs(Math.sin(t * 3 + gf.id)) * 0.1, U(gf.y)); o.userData.b.material = lam(['#d8453b', '#3f7fe0', '#4f9a45', '#8e58b0'][gf.c % 4]); });
    pl.items.sync(v.items, (o, it) => { o.position.set(U(it.x), 0.35, U(it.y)); o.rotation.y = t * 2; o.userData.b.material = lam(ITEMS[it.k].col, { emissive: '#2a1a00' }); });
    pl.bombs.sync(v.bombs, (o, b) => { o.position.set(U(b.x), 0, U(b.y)); const s2 = 0.6 + (b.t < 0.7 ? Math.abs(Math.sin(t * 20)) * 0.15 : Math.sin(t * 6) * 0.04); o.userData.s.scale.setScalar(s2); });
    pl.puddles.sync(v.puddles, (o, pu) => o.position.set(U(pu.x), 0.03, U(pu.y)));
    pl.traps.sync(v.traps.filter(tr => tr.owner === v.me || reveal || (me && Math.hypot(me.x - tr.x, me.y - tr.y) < 28)), (o, tr) => o.position.set(U(tr.x), 0.04, U(tr.y)));
    pl.meteors.sync(v.meteors, (o, m) => { o.position.set(U(m.x), 0, U(m.y)); o.userData.rock.position.y = Math.max(0.3, (m.t / 1.3) * 9); });
    pl.mobs.sync(v.mobs, (o, m) => {
      o.position.set(U(m.x), Math.sin(t * 5 + m.kind) * 0.08, U(m.y));
      const col = m.s === 1 ? (v.fright < 2 && Math.floor(t * 8) % 2 ? '#f4f4f4' : '#2d5bff') : MOB_COLS[m.kind];
      o.userData.mat.color.set(col); o.userData.mat.emissive.set(col); o.userData.mat.opacity = m.s === 2 ? 0.15 : 0.85;
    });
    pl.spirits.sync(v.spirits, (o, s2) => o.position.set(U(s2.x), 0.5 + Math.sin(t * 4 + s2.id) * 0.15, U(s2.y)));
    pl.ghosts.sync(v.players.filter(p => !p.alive && p.ghost), (o, p) => { o.position.set(U(p.x), 0.4 + Math.sin(t * 4) * 0.1, U(p.y)); o.userData.mat.opacity = p.id === v.me ? 0.6 : 0.4; });
    pl.flags.sync(ctf && v.flags ? v.flags.map((f, i) => ({ ...f, team: i })) : [], (o, f) => {
      o.position.set(U(f.hx), 0, U(f.hy));
      o.userData.pad.material.color.set(TEAM_COLS[f.team]);
      o.children[0].visible = o.userData.c.visible = !f.carrier;
      if (!f.carrier) { o.children[0].position.set(U(f.x - f.hx), 0.65, U(f.y - f.hy)); o.userData.c.position.set(U(f.x - f.hx) + 0.3, 1.1, U(f.y - f.hy)); o.userData.c.material = lam(TEAM_COLS[f.team]); }
    });
    pl.zone.sync(v.zone ? [v.zone] : [], (o, z) => { o.position.set(U(z.x), 0.05, U(z.y)); o.scale.setScalar(U(z.r)); o.material.color.set(z.contested ? '#ff4a3b' : z.owner ? '#ffd23f' : '#e0b252'); o.rotation.z = t; });
    const fl = []; for (const f of this.flames) { f.t -= dt; for (const i of f.tiles) fl.push([i, f.t]); }
    this.flames = this.flames.filter(f => f.t > 0);
    pl.flames.sync(fl, (o, [i, ft]) => { o.position.set(i % MW + 0.5, 0.35, ((i / MW) | 0) + 0.5); o.material.opacity = Math.min(0.9, ft * 2); o.material.color.set(Math.random() < 0.5 ? '#ff8a2a' : '#ffd23f'); });

    // pawns
    const seen = new Set();
    for (const [id, a] of this.anims) { a.t -= dt; if (a.t <= 0) this.anims.delete(id); }
    pl.pickups.sync(v.pickups || [], (o, k) => { o.position.set(U(k.x), 0, U(k.y)); o.rotation.y = t + k.id; if (o.userData.k !== k.k) { o.userData.b.clear(); const wm = weaponMesh(k.k); wm.position.x = -0.3; o.userData.b.add(wm); o.userData.k = k.k; } });
    pl.thrown.sync(v.thrown || [], (o, k) => { o.position.set(U(k.x), 0.5, U(k.y)); o.rotation.y = t * 20 + k.id; o.material = lam(WEAPONS[k.k].col); });
    pl.blood.sync(this.bloods, (o, b) => { o.position.set(U(b[0]), 0.025, U(b[1])); o.scale.setScalar(b[2]); });
    const ents = [...v.players.filter(p => p.alive), ...v.decoys];
    if (v.mode === 'dm') for (const p of v.players) {
      if (p.alive || p.ghost) continue;
      const m = this.pawnFor(p); seen.add(p.id);
      m.root.visible = !me || this.inSight(me.x, me.y - 6, p.x, p.y - 6); m.root.position.set(U(p.x), 0.2, U(p.y)); m.root.rotation.set(0, 0, (p.id.length % 2 ? 1 : -1) * Math.PI / 2); m.root.scale.setScalar(1);
      m.gun.visible = false; m.marker.visible = m.ring.visible = m.shield.visible = false;
    }
    const hatFor = p => {
      const h = p.skin && p.skin.hat;
      if (h && h !== 'none') return h;
      const k = hash(p.id) % 4;
      if (hw) return ['none', 'witch', 'horns', 'pumpkin'][k];
      if (th === 'newyear') return ['none', 'santa', 'santa', 'ushanka'][k];
      if (th === 'winter') return ['none', 'ushanka', 'none', 'ushanka'][k];
      return 'none';
    };
    for (const p of ents) {
      const m = this.pawnFor(p);
      seen.add(p.id);
      const hidden = hiddenFor(p);
      m.root.visible = !hidden;
      if (hidden) continue;
      const f = p.fx || {};
      m.root.rotation.set(0, 0, 0);
      m.root.position.set(U(p.x), hOf(p), U(p.y));
      m.body.rotation.y = Math.atan2(p.fdx || 0, p.fdy === undefined ? 1 : p.fdy);
      const sw = p.m ? Math.sin(t * 14 + (p.seed || 0)) * 0.6 : 0;
      m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.8; m.armR.rotation.x = sw * 0.8;
      const held = v.mode === 'dm' && p.wpn && p.wpn !== 'fist';
      m.gun.visible = !!held;
      if (held) {
        if (m.gunKey !== p.wpn) { m.gun.clear(); m.gun.add(weaponMesh(p.wpn)); m.gunKey = p.wpn; }
        const melee = WEAPONS[p.wpn].melee;
        m.armR.rotation.x = melee ? -0.6 : -1.45;
        m.gun.rotation.set(0, melee ? -0.6 : 0, melee ? 0.9 : 0);
      }
      const an = this.anims.get(p.id);
      if (an) {
        const e = Math.sin((1 - an.t / an.dur) * Math.PI);
        if (an.k === 'punch' || an.k === 'shoot' || an.k === 'throw') m.armR.rotation.x = -1.5 - e * 0.2;
        if (an.k === 'swing') { m.armR.rotation.x = -2.6 + (1 - an.t / an.dur) * 2.4; m.gun.rotation.set(0, 1.2 - (1 - an.t / an.dur) * 2.4, 0); }
        if (an.k === 'push') { m.armR.rotation.x = m.armL.rotation.x = -1.5; }
        if (an.k === 'cast') { m.armR.rotation.x = m.armL.rotation.x = -2.9; }
        if (an.k === 'jump') m.root.position.y += e * 0.45;
        if (an.k === 'crouch') m.body.scale.y = 1 - e * 0.18; else m.body.scale.y = 1;
        if (an.k === 'hurt') m.root.position.x += (Math.floor(t * 40) % 2 ? 0.05 : -0.05);
      } else m.body.scale.y = 1;
      if (v.mode === 'dm' && p.down > 0) { m.root.rotation.z = 1.3; m.root.position.y = 0.2; }
      m.body.position.y = p.m ? Math.abs(Math.sin(t * 14)) * 0.05 : 0;
      const sc = f.tiny > 0 ? 0.6 : 1; m.root.scale.setScalar(sc);
      const col = ctf && p.team >= 0 ? TEAM_COLS[p.team] : v.mode === 'infect' && p.it ? '#5e7a3a' : p.color || '#888888';
      const op = (f.invis > 0 ? 0.35 : 1) * (f.phase > 0 ? 0.5 : 1);
      const capeCol = p.skin && CAPES[p.skin.cape] && CAPES[p.skin.cape].col;
      const key = col + '|' + op + '|' + capeCol;
      if (m.key !== key) {
        m.key = key;
        m.torso.material = fade(lam(col), op);
        m.all.forEach((part, i) => { part.material = fade(m.orig[i], op); });
        m.cape.visible = !!capeCol; if (capeCol) m.cape.material = fade(lam(capeCol), op);
      }
      const hk = hatFor(p);
      if (m.hatKey !== hk) { if (m.hat) m.head.remove(m.hat); m.hat = hatMesh(hk); m.hat.position.y = 0.2; m.head.add(m.hat); m.hatKey = hk; m.head.visible = hk !== 'pumpkin'; m.pumpkinHead.visible = hk === 'pumpkin'; }
      m.marker.visible = !!p.it && (v.mode === 'classic' || v.mode === 'heroes'); m.marker.position.y = 1.65 + Math.sin(t * 6) * 0.08;
      if (m.marker.visible && hw) m.marker.material = lam('#d9772e', { emissive: '#5a2a00' });
      m.bomb.visible = !!p.it && v.mode === 'bomb';
      m.ring.visible = (!!p.it && v.mode !== 'hide') || (ctf && p.team >= 0);
      m.ring.material.color.set(ctf && p.team >= 0 ? TEAM_COLS[p.team] : v.mode === 'infect' ? '#7dff5a' : '#ff3b3b');
      m.shield.visible = f.shield > 0;
      m.ice.visible = f.frozen > 0;
      m.flag.visible = ctf && p.carry >= 0; if (m.flag.visible) m.cloth.material = lam(TEAM_COLS[p.carry]);
      const trail = p.skin && p.skin.trail;
      if (trail && trail !== 'none' && p.m && Math.random() < 0.4) {
        const cols = { sparkle: '#ffe14a', hearts: '#ff6b9a', fire: '#ff7a2a', snow: '#ffffff', leaves: '#7ab03a', bubbles: '#9ad8ff' };
        this.parts.push({ x: p.x - p.fdx * 5, y: p.y - p.fdy * 5, h: 4 + Math.random() * 6, vx: 0, vy: 0, vh: 8, life: 0.7, max: 0.7, col: trail === 'rainbow' ? `hsl(${(t * 200) % 360},90%,65%)` : cols[trail], size: 2 });
      }
      if (f.stun > 0 && Math.random() < 0.3) this.parts.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y, h: 20, vx: 0, vy: 0, vh: 10, life: 0.4, max: 0.4, col: '#ffe14a', size: 2 });
    }
    for (const [id, m] of this.pawns) if (!seen.has(id)) { m.root.visible = false; if (!v.players.some(p => p.id === id) && !String(id).startsWith('d')) { this.scene.remove(m.root); this.pawns.delete(id); } }

    this.gl.render(this.scene, this.camera);

    // ---------- overlay (2D canvas on top) ----------
    const g = this.g, Wd = this.ov.width, Hd = this.ov.height, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, Wd, Hd);
    if (hiding && me && me.it && v.hideT > 0) { g.fillStyle = '#000'; g.fillRect(0, 0, Wd, Hd); }
    // particles
    for (const q of this.parts) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.h += q.vh * dt; q.vh -= 60 * dt; q.vx *= 0.92; q.vy *= 0.92;
      if (q.h < 0) { q.h = 0; q.vh = 0; }
      const [sx2, sy2, ok] = this.project(q.x, q.y, q.h);
      if (!ok) continue;
      g.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5));
      g.fillStyle = q.col; const s2 = Math.max(2, Math.round(q.size * 2.5 * d)); g.fillRect(Math.round(sx2), Math.round(sy2), s2, s2);
    }
    g.globalAlpha = 1;
    this.parts = this.parts.filter(q => q.life > 0);
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
    // names
    g.textAlign = 'center';
    g.font = `${Math.round(9 * d)}px "Press Start 2P", monospace`;
    for (const p of ents) {
      if (hiddenFor(p) || ((hiding || dmDark) && p.id !== v.me && !(me && Math.hypot(me.x - p.x, me.y - p.y) < 50))) continue;
      const [nx, ny, ok] = this.project(p.x, p.y, (hOf(p) * TS) + 30);
      if (!ok) continue;
      let nm = (p.hero && HEROES[p.hero] ? HEROES[p.hero].icon + ' ' : '') + (p.name || '');
      if ((v.mode === 'bomber' || v.mode === 'pacman') && p.lives != null && !p.decoy) nm += ' ' + '♥'.repeat(Math.max(0, p.lives));
      g.fillStyle = '#000a'; g.fillText(nm, nx + d, ny + d);
      g.fillStyle = p.id === v.me ? '#ffd86b' : ctf && p.team >= 0 ? TEAM_COLS[p.team] : p.it ? '#ff8a7a' : '#f0ece2';
      g.fillText(nm, nx, ny);
    }
    // floating texts
    g.font = `${Math.round(12 * d)}px "Press Start 2P", monospace`;
    for (const q of this.texts) {
      q.life -= dt; q.h += dt * 20;
      const [tx2, ty2, ok] = this.project(q.x, q.y, q.h);
      if (!ok) continue;
      g.globalAlpha = Math.max(0, Math.min(1, q.life * 2));
      g.fillStyle = '#000'; g.fillText(q.txt, tx2 + 2 * d, ty2 + 2 * d);
      g.fillStyle = q.col; g.fillText(q.txt, tx2, ty2);
    }
    g.globalAlpha = 1;
    this.texts = this.texts.filter(q => q.life > 0);
    for (const tr of this.tracers) {
      tr.t -= dt;
      const [ax, ay, ok1] = this.project(tr.x0, tr.y0, 10), [bx, by, ok2] = this.project(tr.x1, tr.y1, 10);
      if (!ok1 || !ok2) continue;
      g.globalAlpha = Math.max(0, tr.t / 0.09); g.strokeStyle = '#fff6a0'; g.lineWidth = 2 * d;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    g.globalAlpha = 1;
    this.tracers = this.tracers.filter(tr => tr.t > 0);
    // whistle pings
    for (const q of this.pings) {
      q.life -= dt;
      const k2 = 1 - q.life / 1.6, [px, py, ok] = this.project(q.x, q.y, 14);
      if (!ok) continue;
      g.globalAlpha = Math.max(0, q.life / 1.6); g.strokeStyle = q.col; g.lineWidth = 2 * d;
      g.beginPath(); g.arc(px, py, (10 + k2 * 60) * d, 0, Math.PI * 2); g.stroke();
      g.fillStyle = q.col; g.fillText('♪', px + 12 * d, py - (16 + k2 * 20) * d);
    }
    g.globalAlpha = 1;
    this.pings = this.pings.filter(q => q.life > 0);
    // reaction bubbles
    if (v.emotes) for (const p of [...v.players, ...v.decoys]) {
      const em = v.emotes.get(p.id);
      if (!em || hiddenFor(p) || !(p.alive || p.ghost)) continue;
      const E = EMOTES[em.i], [bx, by0, ok] = this.project(p.x, p.y, hOf(p) * TS + 44);
      if (!ok) continue;
      const by = by0 + Math.min(0, (em.t - 2.3) * 60) * d;
      g.font = `${Math.round(10 * d)}px "Press Start 2P", monospace`;
      const w = g.measureText(E.t).width + 34 * d, h = 26 * d;
      g.globalAlpha = Math.min(1, em.t * 3);
      g.fillStyle = OL; g.fillRect(bx - w / 2 - 2 * d, by - h - 2 * d, w + 4 * d, h + 4 * d);
      g.fillStyle = '#fbf6ea'; g.fillRect(bx - w / 2, by - h, w, h); g.fillRect(bx - 4 * d, by, 8 * d, 5 * d);
      g.textAlign = 'left';
      g.font = `${Math.round(15 * d)}px sans-serif`; g.fillText(E.e, bx - w / 2 + 5 * d, by - 7 * d);
      g.font = `${Math.round(10 * d)}px "Press Start 2P", monospace`; g.fillStyle = '#2a2a2a'; g.fillText(E.t, bx - w / 2 + 26 * d, by - 9 * d);
      g.textAlign = 'center';
    }
    g.globalAlpha = 1;
    // snow
    if (win || ev === 'blizzard') {
      const want = ev === 'blizzard' ? 260 : 90;
      while (this.flakes.length < want) this.flakes.push({ x: Math.random() * Wd, y: Math.random() * Hd, s: 0.5 + Math.random(), ph: Math.random() * 6 });
      if (this.flakes.length > want) this.flakes.length = want;
      g.fillStyle = '#ffffff';
      const wind = ev === 'blizzard' ? 140 : 15;
      for (const f of this.flakes) {
        f.y += (25 + 30 * f.s) * dt * d; f.x += (Math.sin(t + f.ph) * 10 + wind) * dt * d;
        if (f.y > Hd) { f.y = -4; f.x = Math.random() * Wd; }
        if (f.x > Wd) f.x = 0;
        g.globalAlpha = 0.5 + 0.4 * f.s;
        const sz = Math.max(1, Math.round(f.s * d * 2));
        g.fillRect(Math.round(f.x), Math.round(f.y), sz, sz);
      }
      g.globalAlpha = 1;
    }
    if (hw) {
      const vg = g.createRadialGradient(Wd / 2, Hd / 2, Math.min(Wd, Hd) * 0.35, Wd / 2, Hd / 2, Math.max(Wd, Hd) * 0.75);
      vg.addColorStop(0, 'rgba(30,10,50,0)'); vg.addColorStop(1, 'rgba(30,10,50,0.45)');
      g.fillStyle = vg; g.fillRect(0, 0, Wd, Hd);
    }
    // edge arrows
    if (me && me.alive && v.phase === 'play') {
      const targets = [];
      if (['classic', 'heroes', 'bomb', 'infect'].includes(v.mode)) {
        const list = v.players.filter(p => p.alive && p !== me && !hiddenFor(p) && (me.it ? !p.it : p.it));
        if (me.it) list.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
        for (const p of me.it ? list.slice(0, 1) : list) targets.push([p.x, p.y, me.it ? '#ffd86b' : '#ff4a3b']);
      }
      if (ctf && v.flags && me.team >= 0) { const f = me.carry >= 0 ? v.flags[me.team] : v.flags[1 - me.team]; targets.push(me.carry >= 0 ? [f.hx, f.hy, TEAM_COLS[me.team]] : [f.x, f.y, TEAM_COLS[1 - me.team]]); }
      if (v.zone) targets.push([v.zone.x, v.zone.y, '#ffd23f']);
      for (const [x0, y0, col] of targets) {
        const [px, py] = this.project(x0, y0, 8), m = 28 * d;
        if (px > m && py > m && px < Wd - m && py < Hd - m) continue;
        const ax = Math.max(m, Math.min(Wd - m, px)), ay = Math.max(m, Math.min(Hd - m, py));
        g.save(); g.translate(ax, ay); g.rotate(Math.atan2(py - ay, px - ax));
        const s2 = 4 * d;
        g.fillStyle = col; g.beginPath(); g.moveTo(3 * s2, 0); g.lineTo(-2 * s2, -2.2 * s2); g.lineTo(-2 * s2, 2.2 * s2); g.closePath(); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = d; g.stroke(); g.restore();
      }
    }
  }
}
