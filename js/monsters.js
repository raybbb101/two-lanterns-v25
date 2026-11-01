// v2 のオリジナルの魔物。pixelfx と同じ作法（左上から光、3〜4 段の平らな色、1px の墨の輪郭）で、ピクセルを直接組み立てる。
// どれも右向きで描き、左向きは左右反転する。返すのは { w, h, ox, oy, rgba, glows }（足元が原点）。

const INK = 0xff1c1214;
const hexc = (h) => {
  const n = parseInt(h.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
};
const R = (...h) => h.map(hexc);
const L = (() => { const v = [-0.55, -0.65, 0.55], l = Math.hypot(...v); return v.map((x) => x / l); })();

class Sprite {
  constructor(w, h, ox, oy) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    this.c = new Uint32Array(w * h);
    this.glows = [];
  }
  set(x, y, col) {
    x = Math.round(x) - this.ox; y = Math.round(y) - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.c[y * this.w + x] = col;
  }
  get(x, y) {
    x -= this.ox; y -= this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.c[y * this.w + x];
  }
  // 球のような明暗の楕円。bias で全体を暗く（奥側の部品など）
  ball(cx, cy, rx, ry, ramp, bias = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        const k = nx * L[0] + ny * L[1] + nz * L[2] - bias;
        this.set(x, y, ramp[k > 0.82 ? 0 : k > 0.5 ? 1 : k > 0.18 ? 2 : 3]);
      }
  }
  // 多角形を縦の明暗で塗る
  poly(pts, ramp, fn) {
    let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    for (const [x, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (!inside) continue;
        const u = (py - y0) / Math.max(1, y1 - y0), v = (px - x0) / Math.max(1, x1 - x0);
        const t = fn ? fn(u, v) : u * 0.8 + v * 0.5;
        this.set(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))]);
      }
  }
  line(x0, y0, x1, y1, col) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
  }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  glow(x, y, r, col, k = 1) { this.glows.push({ x, y, r, col, k }); }
  // 明るさで色の段を選び直す（色違い）。元の色を少し残して部品の差を保つ
  applyTint(ramp) {
    const memo = new Map(), { c } = this, rs = ramp.map(hexc);
    const map = (col) => {
      if (col === INK || !col) return col;
      let out = memo.get(col);
      if (out === undefined) {
        const r = col & 255, g = (col >>> 8) & 255, b = (col >>> 16) & 255;
        const t = rs[Math.min(rs.length - 1, Math.floor(((r * 0.3 + g * 0.59 + b * 0.11) / 256) * rs.length))];
        const mix = (o, n) => Math.round(o * 0.28 + n * 0.72);
        out = (0xff000000 | (mix(b, (t >>> 16) & 255) << 16) | (mix(g, (t >>> 8) & 255) << 8) | mix(r, t & 255)) >>> 0;
        memo.set(col, out);
      }
      return out;
    };
    for (let i = 0; i < c.length; i++) c[i] = map(c[i]);
    for (const g of this.glows) g.col = ramp[ramp.length - 2];
  }
  // 墨の輪郭
  outline() {
    const { w, h, c } = this, add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (c[y * w + x]) continue;
      if ((x > 0 && c[y * w + x - 1] && c[y * w + x - 1] !== INK) || (x < w - 1 && c[y * w + x + 1] && c[y * w + x + 1] !== INK) ||
        (y > 0 && c[(y - 1) * w + x] && c[(y - 1) * w + x] !== INK) || (y < h - 1 && c[(y + 1) * w + x] && c[(y + 1) * w + x] !== INK)) add.push(y * w + x);
    }
    for (const i of add) c[i] = INK;
  }
  finish(flip, tint) {
    this.outline();
    if (tint) this.applyTint(tint);
    const { w, h, c } = this, rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = c[y * w + (flip ? w - 1 - x : x)];
      if (!col) continue;
      const j = (y * w + x) * 4;
      rgba[j] = col & 255; rgba[j + 1] = (col >>> 8) & 255; rgba[j + 2] = (col >>> 16) & 255; rgba[j + 3] = 255;
    }
    const ox = flip ? -(this.w + this.ox) + 1 : this.ox;
    const glows = this.glows.map((g) => ({ ...g, x: flip ? -g.x : g.x }));
    return { w, h, ox, oy: this.oy, rgba, glows };
  }
}

// ---------------- 胞子キノコ（スライムの役） ----------------
const CAPS = [
  [R('#ff8a6a', '#e0483a', '#a82a30', '#6e1828'), R('#fff2d8')],
  [R('#d8a0ff', '#a060e0', '#6a38a8', '#40206a'), R('#f6e8ff')],
  [R('#ffd070', '#f08a2a', '#b0501a', '#702a10'), R('#fff0b0')],
  [R('#c8f0ff', '#78c0e8', '#4080b8', '#24507a'), R('#ffffff')],
];
const STEM = R('#fff4e0', '#e8d4b4', '#bba080', '#806650');
function sporeling(f, s) {
  const S = f.big ? 1.45 : 1;
  const [cap, spot] = CAPS[0];
  const sp = new Sprite(Math.ceil(40 * S), Math.ceil(44 * S), Math.floor(-20 * S), Math.floor(-40 * S));
  let sq = 0, z = 0;
  if (f.state === 'wind') sq = 0.25 * f.k;
  else if (f.state === 'atk') { sq = -0.22; z = Math.sin(f.k * Math.PI) * 9; }
  else if (f.moving) { const ph = f.ph; z = Math.max(0, Math.sin(ph * Math.PI * 2)) * 4; sq = Math.sin(ph * Math.PI * 2) < 0 ? 0.12 : -0.08; }
  else sq = Math.sin(f.ph * Math.PI * 2) * 0.05;
  const sx = (1 + sq) * S, sy = (1 - sq) * S;
  const base = -z * S;
  // 足
  for (const d of [-1, 1]) sp.ball(d * 4 * sx, base - 1.5 * sy, 2.6 * S, 1.8 * S, STEM, 0.2);
  // 柄（体）
  sp.ball(0, base - 7 * sy, 7 * sx, 7 * sy, STEM);
  // 目
  const ex = 2 * S, ey = base - 7 * sy;
  for (const d of [-1, 1]) { sp.set(ex + d * 2.5 * S, ey, INK); sp.set(ex + d * 2.5 * S, ey + 1, INK); }
  if (f.state === 'wind' || f.state === 'atk') { sp.set(ex - 3.5 * S, ey - 2, INK); sp.set(ex + 1.5 * S, ey - 2, INK); }
  sp.set(ex, ey + 3 * S, hexc('#a86a5a'));
  // かさ
  const cy = base - 14 * sy;
  sp.ball(0, cy, 13 * sx, 8 * sy, cap);
  sp.poly([[-13 * sx, cy + 1], [13 * sx, cy + 1], [9 * sx, cy + 4 * sy], [-9 * sx, cy + 4 * sy]], [cap[2], cap[3]], (u) => u);
  // 斑点
  for (const [dx, dy, r] of [[-6, -3, 2.2], [3, -5, 2.6], [8, -1, 1.6], [-2, 0, 1.4]]) sp.ball(dx * sx, cy + dy * sy, r * S, r * 0.8 * S, [spot[0], spot[0], hexc('#e8d8c0'), hexc('#c0a890')]);
  sp.shadowR = 12 * S;
  return sp;
}

// ---------------- 石翼のインプ（コウモリの役） ----------------
const STONE = R('#b8b0c8', '#867e9a', '#5a546e', '#3a3648');
const WING = R('#8a7e9e', '#62587a', '#433c58', '#2a2638');
function imp(f) {
  const S = f.elite ? 1.2 : 1;
  const sp = new Sprite(Math.ceil(56 * S), Math.ceil(64 * S), Math.floor(-28 * S), Math.floor(-58 * S));
  const flap = Math.sin(f.ph * Math.PI * 2);
  const z = (f.state === 'atk' ? 12 : 24 + Math.sin(f.t * 4) * 3) * S;
  const by = -z;
  // 奥の翼
  const wing = (dir, bias) => {
    const tipY = by - 12 * S - flap * 9 * S, midY = by - 4 * S - flap * 4 * S;
    sp.poly([[dir * 3 * S, by - 4 * S], [dir * 14 * S, tipY], [dir * 21 * S, midY + 2 * S], [dir * 16 * S, by + 3 * S], [dir * 10 * S, by + 1 * S], [dir * 4 * S, by + 3 * S]],
      bias ? WING.map((c, i) => WING[Math.min(3, i + 1)]) : WING, (u, v) => u * 0.7 + (dir > 0 ? v : 1 - v) * 0.3);
    sp.line(dir * 3 * S, by - 4 * S, dir * 14 * S, tipY, STONE[1]);
    sp.line(dir * 14 * S, tipY, dir * 16 * S, by + 3 * S, WING[3]);
  };
  wing(-1, true);
  // しっぽ
  sp.line(-3 * S, by + 5 * S, -9 * S, by + 10 * S, STONE[2]);
  sp.set(-10 * S, by + 11 * S, STONE[1]); sp.set(-9 * S, by + 11 * S, STONE[1]);
  // 体と頭
  sp.ball(0, by + 1 * S, 6 * S, 7 * S, STONE);
  sp.ball(2 * S, by - 7 * S, 5.5 * S, 5 * S, STONE);
  // 角
  sp.line(-1 * S, by - 11 * S, -3 * S, by - 15 * S, STONE[0]);
  sp.line(4 * S, by - 11 * S, 6 * S, by - 15 * S, STONE[0]);
  // 腕と爪
  sp.line(3 * S, by + 1 * S, 7 * S, by + 4 * S, STONE[2]);
  sp.set(8 * S, by + 5 * S, hexc('#fff0d0'));
  wing(1, false);
  // ひび割れ
  sp.set(-2 * S, by, STONE[3]); sp.set(-1 * S, by + 1 * S, STONE[3]); sp.set(-1 * S, by + 2 * S, STONE[3]);
  // 光る目
  const eyeC = f.elite ? '#ffd040' : '#ff7a2a';
  for (const dx of [2, 5]) { sp.set(dx * S, by - 7 * S, hexc(eyeC)); sp.glow(dx * S, by - 7 * S, 4, eyeC, 0.9); }
  sp.set(4 * S, by - 4 * S, hexc('#2a1a1a'));
  sp.shadowR = 7 * S;
  sp.shadowA = 0.25;
  return sp;
}

// ---------------- 錆鎧（スケルトンの役） ----------------
const RUST = R('#e8c8a8', '#b88a6a', '#7a5444', '#4a302c');
const IRON = R('#c8d0dc', '#8a94a8', '#5a6278', '#363c4e');
function armor(f) {
  const S = f.elite ? 1.12 : 1;
  const sp = new Sprite(Math.ceil(70 * S), Math.ceil(64 * S), Math.floor(-30 * S), Math.floor(-58 * S));
  const M = f.elite ? IRON : RUST;
  const walk = f.moving ? Math.sin(f.ph * Math.PI * 2) : 0;
  // 足
  for (const [d, bias] of [[-1, 0.25], [1, 0]]) {
    const fx = d * 3 * S + walk * d * 3 * S, lift = Math.max(0, walk * d) * 2 * S;
    sp.poly([[fx - 2.5 * S, -13 * S], [fx + 2.5 * S, -13 * S], [fx + 3 * S, -2 * S - lift], [fx - 3 * S, -2 * S - lift]], bias ? M.slice(1).concat(M[3]) : M);
    sp.rect(Math.round(fx - 3 * S), Math.round(-3 * S - lift), Math.round(7 * S), Math.round(3 * S), M[3]);
  }
  // 腰布（ぼろぼろ）
  sp.poly([[-6 * S, -16 * S], [6 * S, -16 * S], [5 * S, -9 * S], [2 * S, -11 * S], [0, -8 * S], [-3 * S, -11 * S], [-6 * S, -9 * S]], R('#8a3a3a', '#6a2a30', '#4a1c24', '#341420'));
  // 胴
  sp.poly([[-8 * S, -30 * S], [8 * S, -30 * S], [6 * S, -16 * S], [-6 * S, -16 * S]], M, (u, v) => u * 0.5 + v * 0.6);
  sp.line(0, -29 * S, 0, -18 * S, M[3]);
  for (const y of [-25, -21]) sp.line(-5 * S, y * S, 5 * S, y * S, M[2]);
  // 肩当て
  sp.ball(-7 * S, -29 * S, 4 * S, 3 * S, M, 0.15);
  // 兜
  sp.ball(1 * S, -37 * S, 6.5 * S, 6.5 * S, M);
  sp.rect(Math.round(-1 * S), Math.round(-38 * S), Math.round(8 * S), Math.round(2 * S), hexc('#120a10'));
  const eyeC = f.elite ? '#ffb040' : '#7ae0ff';
  sp.set(3 * S, -37 * S, hexc(eyeC)); sp.set(5 * S, -37 * S, hexc(eyeC));
  sp.glow(4 * S, -37 * S, 5, eyeC, 0.9);
  if (f.elite) { sp.line(1 * S, -44 * S, 1 * S, -48 * S, hexc('#e8c060')); sp.line(0, -48 * S, 2 * S, -48 * S, hexc('#e8c060')); }
  // 剣の腕
  let a = -1.0;
  if (f.state === 'wind') a = -2.3 - f.k * 0.5;
  else if (f.state === 'atk') a = -2.8 + Math.min(1, f.k * 2.2) * 3.6;
  const hx = 7 * S + Math.cos(a) * 7 * S, hy = -26 * S + Math.sin(a) * 7 * S;
  sp.line(7 * S, -28 * S, hx, hy, M[1]);
  const bx = hx + Math.cos(a) * 22 * S, byy = hy + Math.sin(a) * 22 * S;
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let i = 3; i <= 22 * S; i += 0.5) {
    const x = hx + ca * i, y = hy + sa * i;
    sp.set(x, y, i > 20 * S ? IRON[0] : IRON[1]);
    sp.set(x - sa, y + ca, IRON[2]);
  }
  sp.line(hx - sa * 3, hy + ca * 3, hx + sa * 3, hy - ca * 3, hexc('#a07030'));
  sp.line(hx - ca * 3, hy - sa * 3, hx, hy, hexc('#5a3020'));
  sp.ball(hx, hy, 2 * S, 2 * S, M);
  sp.shadowR = 11 * S;
  sp.tip = [bx, byy];
  return sp;
}

// ---------------- 蝋燭の祈祷師（術師の役） ----------------
const WAX = R('#fffaf0', '#f0e2c8', '#cdb592', '#94785a');
const ROBE = R('#7a4aa0', '#55307a', '#3a2058', '#24143a');
function priest(f) {
  const S = f.elite ? 1.12 : 1;
  const sp = new Sprite(Math.ceil(48 * S), Math.ceil(70 * S), Math.floor(-24 * S), Math.floor(-64 * S));
  const z = (5 + Math.sin(f.t * 2) * 2) * S;
  const b = -z;
  // ローブ（裾が揺れる）
  const sw = Math.sin(f.t * 2.4) * 1.5;
  const hem = [];
  for (let i = 0; i <= 6; i++) hem.push([(-11 + i * 3.7) * S + sw * (1 - i / 6), b + (i % 2 ? -2 : 0)]);
  sp.poly([[-6 * S, b - 28 * S], [6 * S, b - 28 * S], ...hem.reverse()], ROBE, (u, v) => u * 0.4 + v * 0.7);
  sp.line(-10 * S, b - 2, 10 * S, b - 2, hexc('#d8b060'));
  // 蝋の体（溶けて垂れる）
  sp.ball(0, b - 31 * S, 6 * S, 7 * S, WAX);
  for (const [dx, l] of [[-4, 4], [-1, 6], [3, 3]]) sp.line(dx * S, b - 27 * S, dx * S, b - (27 - l) * S, WAX[1]);
  // 顔の穴
  sp.set(1 * S, b - 32 * S, hexc('#2a1a20')); sp.set(4 * S, b - 32 * S, hexc('#2a1a20'));
  sp.line(2 * S, b - 29 * S, 3 * S, b - 29 * S, hexc('#7a5a4a'));
  // 頭の上の蝋燭
  for (const [dx, h] of [[-4, 5], [0, 7], [4, 4]]) {
    sp.rect(Math.round(dx * S - 1), Math.round(b - (37 + h) * S), 2, Math.round(h * S), WAX[1]);
    const fy = b - (38 + h) * S, fl = Math.sin(f.t * 12 + dx) > 0 ? 1 : 0;
    sp.set(dx * S, fy - fl, hexc('#fff6c0')); sp.set(dx * S, fy - 1 - fl, hexc('#ffb040'));
    sp.glow(dx * S, fy - 1, 7, '#ffb040', 0.9);
  }
  // 腕と香炉
  const charge = f.state === 'wind' ? f.k : 0;
  const hx = 9 * S, hy = b - 20 * S;
  sp.line(4 * S, b - 24 * S, hx, hy, ROBE[1]);
  sp.ball(hx + 2 * S, hy + 2 * S, 3 * S, 3 * S, R('#ffe6a0', '#e0a040', '#a06020', '#603010'));
  sp.glow(hx + 2 * S, hy + 2 * S, 6 + charge * 10, '#ff8a3a', 0.7 + charge * 0.5);
  sp.orb = [hx + 2 * S, hy + 2 * S, charge];
  sp.shadowR = 9 * S;
  sp.shadowA = 0.3;
  return sp;
}

// ---------------- 苔の巨像（ボス） ----------------
const ROCK = [R('#c8c0b0', '#968e7e', '#6a6456', '#423e36'), R('#a8c098', '#748c66', '#4c6244', '#2e3e2a'), R('#d0a088', '#a0705a', '#704a3c', '#46302a'), R('#c8d4e4', '#94a2b8', '#66728a', '#40485c')];
function colossus(f) {
  const sp = new Sprite(130, 120, -65, -112);
  const M = ROCK[f.v % 4];
  const moss = R('#a8d070', '#78a848', '#4e7a30', '#2e4e1e');
  const walk = f.moving ? Math.sin(f.ph * Math.PI * 2) : 0;
  let armY = 0, armX = 0, lean = 0;
  if (f.state === 'wind' && f.atk === 'slam') { armY = -22 * f.k; lean = -2 * f.k; }
  else if (f.state === 'atk' && f.atk === 'slam') { armY = -22 + Math.min(1, f.k * 3) * 34; lean = 3; }
  else if (f.state === 'wind' && f.atk === 'throw') { armY = -16 * f.k; armX = -6 * f.k; }
  const bob = Math.abs(walk) * 2;
  // 脚
  for (const d of [-1, 1]) sp.ball(d * 12, -9 - Math.max(0, walk * d) * 2, 9, 9, M, d < 0 ? 0.2 : 0);
  // 奥の腕
  const arm = (d) => {
    const ax = d * 30 + (d > 0 ? armX : 0) + lean, ay = -44 + armY - bob;
    sp.ball(ax, ay, 10, 9, M, d < 0 ? 0.2 : 0);
    sp.ball(ax + d * 2, ay + 17 + armY * 0.15, 11, 10, M, d < 0 ? 0.25 : 0);
    sp.ball(ax + d * 2, ay + 13, 6, 3, moss, 0.1);
  };
  arm(-1);
  // 胴
  sp.ball(lean, -42 - bob, 24, 22, M);
  sp.ball(lean - 6, -60 - bob, 14, 5, moss);
  sp.ball(lean + 12, -56 - bob, 8, 3, moss);
  for (let i = 0; i < 6; i++) sp.line(lean - 16 + i * 6, -60 - bob, lean - 15 + i * 6, -55 - bob + (i % 2) * 3, moss[2]);
  // 核の結晶
  const core = f.enraged ? '#ff4a2a' : '#7affd0';
  const cc = f.enraged ? R('#ffd0c0', '#ff6a40', '#c02a1a', '#6a1010') : R('#e0fff4', '#7affd0', '#30b090', '#146050');
  sp.poly([[lean, -50 - bob], [lean + 5, -42 - bob], [lean, -34 - bob], [lean - 5, -42 - bob]], cc, (u, v) => v * 0.6 + u * 0.4);
  sp.glow(lean, -42 - bob, 22, core, 0.8);
  // 頭
  sp.ball(lean + 3, -68 - bob, 11, 9, M);
  sp.rect(lean + 4, -69 - bob, 6, 2, hexc('#120c08'));
  sp.set(lean + 7, -69 - bob, hexc(core)); sp.glow(lean + 7, -69 - bob, 7, core, 1);
  arm(1);
  sp.shadowR = 34;
  sp.shadowA = 0.42;
  return sp;
}

// ---------------- 影喰い狼 ----------------
const FUR = R('#8a84b8', '#5a5488', '#3a3660', '#24203e');
function hound(f) {
  const S = f.elite ? 1.15 : 1;
  const sp = new Sprite(Math.ceil(64 * S), Math.ceil(44 * S), Math.floor(-32 * S), Math.floor(-40 * S));
  const walk = f.moving ? Math.sin(f.ph * Math.PI * 2) : 0;
  const crouch = f.state === 'wind' ? 4 * f.k : 0, lunge = f.state === 'atk' ? 5 : 0;
  const y = -15 * S + crouch - lunge;
  // しっぽ
  sp.poly([[-13 * S, y - 3 * S], [-24 * S, y - 9 * S - walk * 2], [-22 * S, y - 3 * S], [-13 * S, y + 2 * S]], FUR);
  // 奥の脚
  for (const d of [-9, 8]) { sp.line(d * S, y + 3 * S, (d - walk * 3) * S, -1, FUR[3]); sp.line(d * S + 1, y + 3 * S, (d - walk * 3) * S + 1, -1, FUR[3]); }
  sp.ball(-2 * S, y, 13 * S, 7.5 * S, FUR);
  // 背のたてがみ
  for (let i = -10; i <= 6; i += 3) sp.line(i * S, y - 6 * S, (i - 2) * S, y - 10 * S - (i % 2), FUR[0]);
  // 手前の脚
  for (const d of [-11, 6]) { sp.line(d * S, y + 3 * S, (d + walk * 4) * S, 0, FUR[2]); sp.line(d * S + 1, y + 3 * S, (d + walk * 4) * S + 1, 0, FUR[1]); }
  // 頭
  const hy = y - 5 * S + crouch * 0.5;
  sp.ball(12 * S, hy, 7 * S, 6 * S, FUR);
  sp.poly([[16 * S, hy - 2 * S], [25 * S, hy + 1 * S], [24 * S, hy + 4 * S], [15 * S, hy + 4 * S]], FUR);
  sp.poly([[8 * S, hy - 4 * S], [9 * S, hy - 11 * S], [13 * S, hy - 5 * S]], FUR);
  // 牙と目
  if (f.state !== 'idle') { sp.line(17 * S, hy + 5 * S, 24 * S, hy + 5 * S, hexc('#fff0d0')); }
  sp.set(24 * S, hy + 1 * S, INK);
  sp.set(14 * S, hy - 1 * S, hexc('#ff5a4a')); sp.set(15 * S, hy - 1 * S, hexc('#ff5a4a'));
  sp.glow(14 * S, hy - 1 * S, 5, '#ff5a4a', 0.9);
  sp.shadowR = 14 * S;
  return sp;
}

// ---------------- 爆ぜ火 ----------------
const FLAME = R('#fff8d0', '#ffd050', '#f07a20', '#a02a18');
function wisp(f) {
  const S = (f.elite ? 1.2 : 1) * (f.state === 'wind' ? 1 + f.k * 0.45 : 1);
  const sp = new Sprite(Math.ceil(44 * S), Math.ceil(60 * S), Math.floor(-22 * S), Math.floor(-56 * S));
  const by = -20 * S + Math.sin(f.t * 5) * 2;
  const fl = Math.sin(f.t * 16);
  sp.poly([[-8 * S, by], [-5 * S, by - 11 * S], [-2 * S + fl, by - 21 * S], [3 * S, by - 12 * S], [8 * S, by]], [FLAME[1], FLAME[2], FLAME[3]], (u) => 1 - u);
  sp.ball(0, by, 9 * S, 9 * S, FLAME);
  // 尾の火の粉
  for (const [dx, dy] of [[-6, 12], [5, 13], [0, 16]]) sp.set(dx * S + fl, by + dy * S, FLAME[2]);
  // 顔
  const blink = f.state === 'wind' && Math.floor(f.t * 8) % 2;
  sp.rect(-3 * S, by - 2 * S, 2, 3, blink ? hexc('#ffffff') : INK);
  sp.rect(2 * S, by - 2 * S, 2, 3, blink ? hexc('#ffffff') : INK);
  sp.line(-1 * S, by + 4 * S, 2 * S, by + 4 * S, INK);
  sp.glow(0, by, 15 * S, '#ff9a30', 1);
  sp.shadowR = 7;
  sp.shadowA = 0.22;
  return sp;
}

// ---------------- 棘吐き花 ----------------
const VINE = R('#b0d870', '#6ca040', '#42702c', '#28481e');
const PETAL = R('#ff9ac0', '#d84c84', '#982c60', '#5c1a40');
function thorn(f) {
  const S = f.elite ? 1.15 : 1;
  const sp = new Sprite(Math.ceil(56 * S), Math.ceil(64 * S), Math.floor(-28 * S), Math.floor(-58 * S));
  const sway = Math.sin(f.ph * Math.PI * 2) * 2;
  const pull = f.state === 'wind' ? -6 * f.k : f.state === 'rec' ? 3 * (1 - f.k) : 0;
  // 根
  for (const [x, l] of [[-9, -2], [-4, 2], [4, -1], [10, 1]]) sp.line(0, -5 * S, x * S, l * S, VINE[3]);
  sp.ball(0, -5 * S, 11 * S, 5 * S, VINE, 0.1);
  // 茎（節ごとに棘）
  const hx = (6 + sway + pull) * S, hy = -33 * S;
  let px = 0, py = -8 * S;
  for (let i = 1; i <= 5; i++) {
    const k = i / 5, x = hx * k + Math.sin(k * Math.PI) * -6 * S, y = -8 * S + (hy + 8 * S) * k;
    sp.ball(x, y, 3.2 * S, 3.2 * S, VINE);
    sp.set(x + (i % 2 ? 4 : -4) * S, y - 1, VINE[0]);
    px = x; py = y;
  }
  // 葉
  sp.poly([[-2 * S, -15 * S], [-16 * S, -21 * S], [-10 * S, -13 * S]], VINE);
  sp.poly([[3 * S, -13 * S], [17 * S, -18 * S], [12 * S, -9 * S]], VINE);
  // 花と口
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; sp.ball(hx + Math.cos(a) * 8 * S, hy + Math.sin(a) * 8 * S, 5 * S, 5 * S, PETAL); }
  const open = f.state === 'wind' ? 2 + f.k * 3 : f.state === 'rec' ? 3 : 2;
  sp.ball(hx, hy, 6 * S, 6 * S, R('#ffe080', '#f0b040', '#b86a20', '#6a3010'));
  sp.ball(hx + 1 * S, hy, open * S, open * S, R('#3a0a18', '#2a0812', '#1c060c', '#12040a'));
  if (f.state === 'wind') sp.glow(hx + 1 * S, hy, 7 + f.k * 7, '#9fe66a', 0.8);
  sp.shadowR = 11 * S;
  return sp;
}

// ---------------- 酸袋ガエル ----------------
const TOAD = R('#d8d860', '#98a838', '#607028', '#38441c');
function toad(f) {
  const S = f.elite ? 1.15 : 1;
  const sp = new Sprite(Math.ceil(56 * S), Math.ceil(50 * S), Math.floor(-28 * S), Math.floor(-46 * S));
  const hop = f.moving ? Math.max(0, Math.sin(f.ph * Math.PI * 2)) * 5 : 0;
  const swell = f.state === 'wind' ? f.k : 0;
  const b = -hop;
  // 後ろ足
  sp.ball(-11 * S, b - 5 * S, 7 * S, 5 * S, TOAD, 0.15);
  sp.line(-16 * S, b - 1, -6 * S, b - 1, TOAD[3]);
  sp.ball(0, b - 11 * S, 15 * S, 11 * S, TOAD);
  // 酸の袋
  sp.ball(8 * S, b - 7 * S, (5 + swell * 5) * S, (5 + swell * 4) * S, R('#f4ffa0', '#b8e848', '#70b030', '#3c7020'));
  if (swell) sp.glow(8 * S, b - 7 * S, 8 + swell * 8, '#b8e848', 0.7);
  // いぼ
  for (const [x, y] of [[-8, -16], [-3, -19], [-11, -11], [2, -16]]) sp.ball(x * S, b + y * S, 1.6 * S, 1.4 * S, [TOAD[0], TOAD[0], TOAD[1], TOAD[2]]);
  // 前足
  sp.line(8 * S, b - 3 * S, 11 * S, b, TOAD[2]);
  sp.rect(9 * S, b, 5, 1, TOAD[3]);
  // 目
  for (const x of [3, 10]) { sp.ball(x * S, b - 20 * S, 3.4 * S, 3.4 * S, R('#fff4c8', '#e8cf80', '#b09850', '#786030')); sp.set((x + 1) * S, b - 20 * S, INK); sp.set((x + 1) * S, b - 19 * S, INK); }
  sp.line(4 * S, b - 13 * S, 14 * S, b - 12 * S, TOAD[3]);
  sp.shadowR = 14 * S;
  return sp;
}

// ---------------- 鉄甲虫 ----------------
const SHELL = R('#b0e8d8', '#58a8a0', '#2e6c74', '#1a3e4a');
function beetle(f) {
  const S = f.elite ? 1.12 : 1;
  const sp = new Sprite(Math.ceil(76 * S), Math.ceil(52 * S), Math.floor(-38 * S), Math.floor(-46 * S));
  const walk = f.moving ? Math.sin(f.ph * Math.PI * 4) : 0;
  const shake = f.state === 'wind' ? (Math.round(f.k * 12) % 2 ? 1 : -1) : 0;
  // 脚
  for (let i = 0; i < 3; i++) {
    const x = (-10 + i * 10) * S, o = (i % 2 ? walk : -walk) * 2;
    sp.line(x - 3 * S, -8 * S, x + (o - 4) * S, 0, SHELL[2]);
    sp.line(x - 2 * S, -8 * S, x + (o - 3) * S, 0, SHELL[3]);
  }
  // 甲羅
  sp.ball(-6 * S + shake, -17 * S, 18 * S, 12 * S, SHELL);
  sp.line(-23 * S + shake, -15 * S, 11 * S + shake, -14 * S, SHELL[3]);
  for (let x = -16; x <= 6; x += 7) sp.line(x * S + shake, -28 * S, x * S + shake + 1, -15 * S, SHELL[2]);
  for (let x = -20; x <= 8; x += 6) sp.set(x * S + shake, -9 * S, SHELL[0]);
  // 頭と角
  const hx = 15 * S + shake;
  sp.ball(hx, -11 * S, 8 * S, 7 * S, R('#70788c', '#4a5266', '#303648', '#1e2230'));
  const up = f.state === 'wind' ? -3 * f.k : 0;
  sp.poly([[hx + 4 * S, -13 * S], [hx + 17 * S, -21 * S + up], [hx + 13 * S, -14 * S], [hx + 6 * S, -9 * S]], R('#e8e0c8', '#b0a080', '#786850', '#463c30'));
  sp.set(hx + 3 * S, -12 * S, hexc('#ff7a3a')); sp.glow(hx + 3 * S, -12 * S, 5, '#ff7a3a', 0.8);
  sp.shadowR = 19 * S;
  return sp;
}

// ---------------- 仮面の刺客 ----------------
const CLOAK = R('#5c5484', '#3c3660', '#262244', '#16142c');
function shade(f) {
  const S = f.elite ? 1.12 : 1;
  const sp = new Sprite(Math.ceil(64 * S), Math.ceil(64 * S), Math.floor(-30 * S), Math.floor(-58 * S));
  const z = 2 + Math.sin(f.t * 3) * 1.5;
  const lean = f.state === 'wind' ? -3 * f.k : f.state === 'atk' ? 5 : 2;
  // 外套（裾が裂けている）
  const hem = [];
  for (let i = 0; i <= 6; i++) hem.push([(-11 + i * 3.6) * S + Math.sin(f.t * 4 + i) * 1.2, -z + (i % 2 ? -5 : 0)]);
  sp.poly([[(lean - 6) * S, -z - 32 * S], [(lean + 6) * S, -z - 32 * S], ...hem.reverse()], CLOAK, (u, v) => u * 0.3 + v * 0.7);
  // 頭巾と面
  sp.ball(lean * S, -z - 36 * S, 7.5 * S, 7.5 * S, CLOAK);
  sp.poly([[(lean - 1) * S, -z - 41 * S], [(lean + 6) * S, -z - 40 * S], [(lean + 6) * S, -z - 33 * S], [(lean + 2) * S, -z - 30 * S], [(lean - 1) * S, -z - 33 * S]], R('#f4f0e4', '#d8d0c0', '#a89e90'), (u) => u);
  sp.line((lean + 1) * S, -z - 37 * S, (lean + 2) * S, -z - 37 * S, INK);
  sp.line((lean + 4) * S, -z - 37 * S, (lean + 5) * S, -z - 37 * S, INK);
  sp.line((lean + 3) * S, -z - 41 * S, (lean + 3) * S, -z - 31 * S, hexc('#c8384a'));
  // 両手の短剣
  const blade = (hx, hy, a) => {
    for (let i = 0; i < 12 * S; i += 0.5) sp.set(hx + Math.cos(a) * i, hy + Math.sin(a) * i, i > 9 * S ? IRON[0] : IRON[1]);
    sp.ball(hx, hy, 2 * S, 2 * S, CLOAK);
  };
  const swing = f.state === 'atk' ? -0.9 + f.k * 2.2 : f.state === 'wind' ? -2 : -0.3;
  blade((lean + 8) * S, -z - 22 * S, swing);
  blade((lean - 8) * S, -z - 20 * S, Math.PI + 0.5);
  sp.shadowR = 10 * S;
  sp.shadowA = 0.3;
  return sp;
}

// ---------------- 蝕みの女郎蜘蛛（ボス） ----------------
const CHITIN = R('#a080c0', '#684c90', '#402c64', '#241840');
function spider(f) {
  const sp = new Sprite(150, 110, -75, -100);
  const walk = f.moving ? f.ph * Math.PI * 2 : 0;
  const lift = f.state === 'atk' && f.atk === 'leap' ? Math.sin(f.k * Math.PI) * 30 : 0;
  const cr = f.state === 'wind' ? 5 * f.k : 0;
  const y = -38 + cr - lift;
  const leg = (side, i, bias) => {
    const off = i % 2 ? Math.sin(walk) : -Math.sin(walk);
    const bx = side * (10 + i * 3), by = y - 2 + i;
    const kx = side * (34 + i * 7), ky = y - 26 + i * 5 - Math.max(0, off) * 5;
    const fx = side * (42 + i * 8) + off * 5 * side, fy = -2 + (i - 2) * 2 - lift * 0.4;
    for (const [a, b, c, d] of [[bx, by, kx, ky], [kx, ky, fx, fy]]) {
      sp.line(a, b, c, d, CHITIN[bias ? 3 : 2]);
      sp.line(a + 1, b, c + 1, d, CHITIN[bias ? 3 : 1]);
    }
    sp.ball(kx, ky, 3, 3, CHITIN, bias ? 0.25 : 0);
  };
  for (let i = 0; i < 4; i++) leg(-1, i, true);
  for (let i = 0; i < 4; i++) leg(1, i, false);
  // 腹
  sp.ball(-18, y - 9, 25, 21, CHITIN);
  for (const [dx, dy, r] of [[-20, -18, 5], [-10, -10, 4], [-26, -6, 4], [-14, 2, 3]]) sp.ball(dx, y + dy, r, r * 0.8, f.enraged ? R('#ffd0a0', '#ff6a30', '#c02a10', '#701008') : R('#ffe880', '#e0a030', '#a06018', '#603008'));
  // 頭胸部
  sp.ball(13, y - 4, 16, 13, CHITIN);
  // 目と牙
  const ec = f.enraged ? '#ff4a2a' : '#c8a0ff';
  for (const [x, yy] of [[19, -10], [24, -8], [19, -5], [25, -3], [15, -12]]) { sp.set(x, y + yy, hexc(ec)); sp.set(x + 1, y + yy, hexc(ec)); }
  sp.glow(21, y - 7, 12, ec, 0.9);
  sp.poly([[22, y + 3], [27, y + 3], [25, y + 12]], R('#fff0d0', '#d0b890', '#907858'));
  sp.poly([[15, y + 5], [20, y + 5], [17, y + 13]], R('#fff0d0', '#d0b890', '#907858'));
  sp.shadowR = 38;
  sp.shadowA = 0.42;
  return sp;
}

// ---------------- 燭台の大司教（ボス） ----------------
const VEST = R('#e05050', '#a82838', '#701a2c', '#440f20');
const GILT = R('#fff0b0', '#e8c060', '#a87c30', '#60441c');
function bishop(f) {
  const sp = new Sprite(100, 130, -50, -122);
  const z = 12 + Math.sin(f.t * 1.6) * 3;
  const b = -z;
  const raise = f.state === 'wind' ? f.k : 0;
  // 祭服
  const hem = [];
  for (let i = 0; i <= 8; i++) hem.push([-22 + i * 5.5 + Math.sin(f.t * 2 + i) * 1.5, b + (i % 2 ? -3 : 0)]);
  sp.poly([[-11, b - 58], [11, b - 58], ...hem.reverse()], VEST, (u, v) => u * 0.35 + v * 0.7);
  sp.poly([[-5, b - 58], [5, b - 58], [7, b - 2], [-7, b - 2]], GILT, (u, v) => v * 0.8 + u * 0.3);
  for (let y = -50; y < -6; y += 10) { sp.line(-2, b + y, 2, b + y, VEST[3]); sp.line(0, b + y - 2, 0, b + y + 2, VEST[3]); }
  sp.line(-20, b - 3, 20, b - 3, GILT[1]);
  // 顔（蝋の面）
  sp.ball(0, b - 64, 9, 10, WAX);
  sp.rect(2, b - 66, 2, 2, hexc('#2a1a20')); sp.rect(6, b - 66, 2, 2, hexc('#2a1a20'));
  for (const [dx, l] of [[-6, 7], [-2, 9], [5, 5]]) sp.line(dx, b - 58, dx, b - 58 + l, WAX[1]);
  // 司教冠
  sp.poly([[-9, b - 70], [9, b - 70], [6, b - 86], [0, b - 92], [-6, b - 86]], GILT, (u, v) => v * 0.7 + u * 0.3);
  sp.line(0, b - 90, 0, b - 72, VEST[1]);
  // 燭台の杖
  const hx = 21, hy = b - 40 - raise * 10;
  sp.line(11, b - 50, hx, hy, VEST[1]);
  sp.line(hx, hy - 34, hx, hy + 34, GILT[2]);
  sp.line(hx + 1, hy - 34, hx + 1, hy + 34, GILT[1]);
  sp.line(hx - 11, hy - 34, hx + 11, hy - 34, GILT[1]);
  for (const dx of [-11, 0, 11]) {
    const fy = hy - 40 - (dx === 0 ? 3 : 0), fl = Math.sin(f.t * 12 + dx) > 0 ? 1 : 0;
    sp.rect(hx + dx - 1, fy + 2, 3, 4, WAX[1]);
    sp.set(hx + dx, fy - fl, hexc('#fff6c0')); sp.set(hx + dx, fy - 1 - fl, hexc('#ffb040')); sp.set(hx + dx, fy - 2 - fl, hexc('#ff7030'));
    sp.glow(hx + dx, fy - 1, 9 + raise * 6, f.enraged ? '#ff4a2a' : '#ffb040', 1);
  }
  // もう一方の手
  sp.line(-11, b - 50, -18, b - 36 - raise * 8, VEST[2]);
  sp.ball(-18, b - 35 - raise * 8, 3, 3, WAX);
  sp.shadowR = 22;
  sp.shadowA = 0.32;
  return sp;
}

// ---------------- 鉄角の暴獣（ボス） ----------------
const HIDE = R('#a88070', '#785448', '#503630', '#2e201e');
const PLATE = R('#c0c8d4', '#808a9c', '#505a6c', '#2e3444');
function behemoth(f) {
  const sp = new Sprite(170, 110, -85, -102);
  const walk = f.moving ? Math.sin(f.ph * Math.PI * 2) : 0;
  const wind = f.state === 'wind' ? f.k : 0;
  const slam = f.atk === 'slam' && f.state === 'wind' ? wind : 0;
  const crouch = f.atk === 'charge' && f.state === 'wind' ? 5 * wind : 0;
  const y = -36 + crouch - slam * 8;
  // 奥の脚
  for (const d of [-26, 24]) { sp.ball(d, y + 22, 8, 12, HIDE, 0.3); sp.rect(d - 8, -6, 16, 6, PLATE[3]); }
  // しっぽ
  sp.line(-40, y - 8, -55, y + 8 + walk * 3, HIDE[2]);
  sp.ball(-56, y + 10 + walk * 3, 4, 4, PLATE);
  // 胴
  sp.ball(-6, y, 37, 25, HIDE);
  // 鉄の鎧板
  for (let i = 0; i < 4; i++) { const x = -32 + i * 17; sp.poly([[x, y - 24 + Math.abs(i - 1.5)], [x + 14, y - 26 + Math.abs(i - 1.5)], [x + 15, y - 8], [x + 1, y - 7]], PLATE, (u, v) => u * 0.6 + v * 0.5); }
  // 溶岩の裂け目
  const lava = f.enraged ? '#ff4a2a' : '#ff9a3a';
  for (const x of [-16, 1, 18]) { sp.line(x, y - 6, x + 2, y + 10, hexc(lava)); sp.glow(x + 1, y + 2, 7, lava, 0.7); }
  // 手前の脚
  for (const [d, s] of [[-30, 1], [20, -1]]) {
    const up = Math.max(0, walk * s) * 4 + (d > 0 ? slam * 12 : 0);
    sp.ball(d, y + 24 - up * 0.5, 10, 14, HIDE);
    sp.rect(d - 10, -7 - up, 20, 7, PLATE[2]); sp.rect(d - 10, -7 - up, 20, 2, PLATE[0]);
  }
  // 頭
  const hx = 37, hy = y - 2 + crouch * 1.2;
  sp.ball(hx, hy, 16, 15, HIDE);
  sp.poly([[hx + 8, hy - 6], [hx + 22, hy + 3], [hx + 20, hy + 13], [hx + 7, hy + 12]], HIDE);
  // 角
  sp.poly([[hx + 1, hy - 11], [hx + 14, hy - 33], [hx + 18, hy - 30], [hx + 9, hy - 7]], R('#f0e8d8', '#c8bca0', '#8c8068', '#544c3c'));
  sp.poly([[hx - 8, hy - 10], [hx - 12, hy - 30], [hx - 7, hy - 31], [hx - 1, hy - 11]], R('#c8bca0', '#a09478', '#6c6250', '#443c30'));
  // 目と鼻息
  sp.rect(hx + 7, hy - 3, 4, 2, hexc(lava)); sp.glow(hx + 9, hy - 2, 7, lava, 1);
  sp.set(hx + 19, hy + 8, INK); sp.set(hx + 19, hy + 9, INK);
  sp.line(hx + 9, hy + 13, hx + 20, hy + 13, PLATE[3]);
  sp.shadowR = 40;
  sp.shadowA = 0.45;
  return sp;
}

// ---------------- 深淵の大目玉（ボス） ----------------
const FLESH = R('#d890c8', '#a05c9c', '#683c70', '#3c2248');
function eye(f) {
  const sp = new Sprite(130, 130, -65, -124);
  const by = -58 + Math.sin(f.t * 1.5) * 4;
  // 触手
  for (let i = 0; i < 7; i++) {
    const base = -2.7 + (i / 6) * 2.25 + Math.PI, L = 34 + (i % 3) * 7;
    let px = Math.cos(base) * 26, py = by + Math.sin(base) * 26;
    for (let j = 1; j <= 6; j++) {
      const k = j / 6, w = Math.sin(f.t * 3 + i + j * 0.8) * 5 * k;
      const x = Math.cos(base) * (26 + L * k) + w, y = by + Math.sin(base) * (26 + L * k);
      sp.ball(x, y, 4 - k * 2.4, 4 - k * 2.4, FLESH, i % 2 ? 0.2 : 0);
      px = x; py = y;
    }
  }
  // 白目
  sp.ball(0, by, 31, 31, FLESH);
  sp.ball(0, by, 25, 24, R('#fff8f0', '#f0dcd4', '#d0a8b0', '#a07090'));
  // 血管
  for (const [a, b, c, d] of [[-22, -6, -12, -3], [-18, 10, -9, 6], [18, -12, 11, -6]]) sp.line(a, by + b, c, by + d, hexc('#d84c60'));
  // 瞳：予兆で開く
  const wind = f.state === 'wind' ? f.k : f.state === 'atk' ? 1 : 0;
  const ic = f.enraged ? R('#ffd0a0', '#ff6030', '#b01c10', '#600c08') : R('#e0c0ff', '#a060f0', '#6030b0', '#301868');
  sp.ball(7, by, 14, 14, ic);
  sp.ball(9, by, 7 - wind * 3, 9 + wind * 2, R('#0a0410', '#0a0410', '#14081c', '#14081c'));
  sp.set(4, by - 7, hexc('#ffffff')); sp.set(5, by - 7, hexc('#ffffff')); sp.set(4, by - 6, hexc('#ffffff'));
  sp.glow(7, by, 18 + wind * 16, f.enraged ? '#ff4a2a' : '#b070ff', 0.8);
  // まぶた
  sp.poly([[-27, by - 12], [0, by - 30], [27, by - 12], [14, by - 21], [-14, by - 21]], FLESH);
  sp.shadowR = 30;
  sp.shadowA = 0.3;
  return sp;
}

// ---------------- 旅の商人 ----------------
const PACK = R('#c8a070', '#946c44', '#664628', '#40281a');
const COAT = R('#6a7a50', '#4a5a38', '#323f26', '#202a18');
function merchant(f) {
  const sp = new Sprite(60, 70, -30, -64);
  const b = Math.sin(f.t * 1.5) * 0.8;
  // 大きな背負い袋
  sp.ball(-9, -28 + b, 11, 14, PACK);
  sp.line(-16, -36 + b, -3, -38 + b, PACK[3]);
  sp.line(-17, -26 + b, -2, -26 + b, PACK[3]);
  sp.rect(-13, -44 + b, 3, 4, hexc('#ffd27a'));
  sp.glow(-12, -42 + b, 8, '#ffb040', 0.8);
  // 足
  for (const x of [-4, 3]) sp.rect(x, -8, 4, 8, COAT[3]);
  // 外套
  sp.poly([[-7, -34 + b], [7, -34 + b], [10, -5], [-9, -5]], COAT, (u, v) => u * 0.35 + v * 0.7);
  sp.line(1, -33 + b, 1, -6, COAT[3]);
  sp.line(-8, -18, 9, -18, hexc('#b08c38'));
  // 頭巾と顔
  sp.ball(1, -40 + b, 7.5, 7.5, COAT);
  sp.ball(3, -39 + b, 4.5, 4.5, R('#ffd9b8', '#f0b48a', '#d08a66', '#a8644a'));
  sp.set(4, -40 + b, INK); sp.set(6, -40 + b, INK);
  sp.line(2, -36 + b, 6, -36 + b, hexc('#e8e0d0'));
  // 手に金貨
  sp.line(7, -26 + b, 12, -24 + b, COAT[1]);
  sp.ball(14, -24 + b + Math.sin(f.t * 3), 2.5, 2.5, R('#fff6c4', '#ffe066', '#c48412', '#86520c'));
  sp.shadowR = 12;
  return sp;
}

const BUILD = { merchant, slime: sporeling, slimeL: (f) => sporeling({ ...f, big: true }), bat: imp, skel: armor, mage: priest, golem: colossus, hound, wisp, thorn, toad, beetle, shade, spider, bishop, behemoth, eye };

// 色違いの色の段（暗→明）。蒼＝素早い、翠＝硬い、紅＝凶暴
export const TINT_RAMP = [
  null,
  ['#0e1a3c', '#1e3a7a', '#3a70c0', '#62aee8', '#b4e6ff', '#f2fcff'],
  ['#0e2a1c', '#1c5a34', '#3c8c48', '#74bc58', '#c0e878', '#f6ffd0'],
  ['#2a0a14', '#6a1024', '#b82c2c', '#f06a34', '#ffb060', '#fff0c0'],
];

/** f: { type, v, elite, state, k(状態の進み 0..1), moving, ph(歩きの位相 0..1), t, atk, enraged }、flip で左向き */
export function monsterPixels(f, flip) {
  const sp = BUILD[f.type](f);
  // 苔の巨像は石の色を階ごとに持っている
  const out = sp.finish(flip, f.type === 'golem' ? null : TINT_RAMP[(f.v || 0) % 4]);
  out.shadowR = sp.shadowR || 10;
  out.shadowA = sp.shadowA || 0.38;
  if (sp.orb) out.orb = [flip ? -sp.orb[0] : sp.orb[0], sp.orb[1], sp.orb[2]];
  return out;
}

export const MONSTER_NAMES = { slime: '胞子キノコ', slimeL: '大胞子キノコ', bat: '石翼のインプ', skel: '錆鎧', mage: '蝋燭の祈祷師', golem: '苔の巨像', hound: '影喰い狼', wisp: '爆ぜ火', thorn: '棘吐き花', toad: '酸袋ガエル', beetle: '鉄甲虫', shade: '仮面の刺客', spider: '蝕みの女郎蜘蛛', bishop: '燭台の大司教', behemoth: '鉄角の暴獣', eye: '深淵の大目玉' };
