// ピクセルアートの床と壁。ゲームの座標（1 タイル 48）を 0.75 倍して 1 タイル 36px で描く。
import { hash, mulberry } from './util.js';

export const K = 0.75;
export const TP = 36;   // タイルの大きさ（px）
export const WHP = 33;  // 壁の高さ（px）

const PALS = [
  { floor: ['#5c5a66', '#4a4854', '#3a3944', '#2a2932', '#1c1b22'], top: ['#4a4552', '#3a3542', '#2c2834', '#1e1b24'], brick: ['#8a8494', '#6e6878', '#55505e', '#3e3a46', '#2a2730'], moss: ['#7a9a4a', '#56763a', '#3a522a'], rug: ['#8a2a2e', '#5e1a22', '#c89a48'], void: '#0b0a0e' },
  { floor: ['#56664e', '#455440', '#354232', '#263024', '#181f18'], top: ['#3e4a3c', '#303a2e', '#232c22', '#171e17'], brick: ['#7e9076', '#62735c', '#4c5a46', '#374232', '#252c22'], moss: ['#9ac85a', '#6e9a40', '#4a6e2a'], rug: ['#2a5a6a', '#1a3a46', '#c8b070'], void: '#070a08' },
  { floor: ['#6e4e42', '#5a3e34', '#462f28', '#33211c', '#221512'], top: ['#563a32', '#442c26', '#33201c', '#231512'], brick: ['#a0705c', '#82584a', '#674538', '#4c3128', '#33201a'], moss: ['#f08a3a', '#c05a24', '#80361a'], rug: ['#c05a1e', '#7a3612', '#e8c070'], void: '#0d0706' },
  { floor: ['#5e6a7c', '#4c5668', '#3c4454', '#2c3240', '#1d212c'], top: ['#465062', '#363e4e', '#29303c', '#1c212a'], brick: ['#94a2b8', '#76849a', '#5c687e', '#434c5e', '#2e3442'], moss: ['#bfe6ff', '#86b8d8', '#5a88a8'], rug: ['#3a4f8a', '#26345e', '#c8d0e8'], void: '#06080c' },
];
export const pixPal = (floor) => PALS[Math.floor((floor - 1) / 3) % PALS.length];

export function buildPixelMap(m) {
  const { W, H, g, seed } = m;
  const P = pixPal(m.floor);
  const fl = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] === 1;
  const floorC = document.createElement('canvas');
  floorC.width = W * TP; floorC.height = H * TP;
  const c = floorC.getContext('2d');
  c.fillStyle = P.void;
  c.fillRect(0, 0, floorC.width, floorC.height);
  const px = (x, y, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); };
  const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };

  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!fl(tx, ty)) continue;
    const X = tx * TP, Y = ty * TP;
    rect(X, Y, TP, TP, P.floor[4]);
    // 石畳：タイルごとに割り方を変える
    const h = hash(tx, ty, seed);
    const cuts = h < 0.3 ? [[0, 0, 36, 36]] : h < 0.6 ? [[0, 0, 18, 36], [18, 0, 18, 36]] : h < 0.8 ? [[0, 0, 36, 18], [0, 18, 20, 18], [20, 18, 16, 18]] : [[0, 0, 18, 18], [18, 0, 18, 18], [0, 18, 18, 18], [18, 18, 18, 18]];
    cuts.forEach(([sx, sy, sw, sh], i) => {
      const v = hash(tx * 3 + i, ty * 5 - i, seed + 9);
      const base = v < 0.25 ? 1 : v < 0.85 ? 1 : 2;
      const x0 = X + sx + 1, y0 = Y + sy + 1, w = sw - 1, hh = sh - 1;
      rect(x0, y0, w, hh, P.floor[base]);
      rect(x0, y0, w, 1, P.floor[base - 1]);
      rect(x0, y0, 1, hh, P.floor[base - 1]);
      rect(x0 + 1, y0 + hh - 1, w - 1, 1, P.floor[base + 1]);
      rect(x0 + w - 1, y0 + 1, 1, hh - 1, P.floor[base + 1]);
      // 欠けと小石
      for (let k = 0; k < 3; k++) {
        const a = hash(tx * 7 + k, ty * 13 + i, seed);
        if (a < 0.5) continue;
        const bx = x0 + 2 + Math.floor(hash(k, tx + i, ty) * (w - 5)), by = y0 + 2 + Math.floor(hash(ty, k + i, tx) * (hh - 5));
        px(bx, by, P.floor[base + 1]);
        if (a > 0.8) { px(bx + 1, by, P.floor[base + 1]); px(bx, by - 1, P.floor[base - 1]); }
      }
    });
    if (hash(tx, ty, seed + 5) < 0.1) {
      // ひび
      let x = X + 6 + Math.floor(hash(tx, ty, 3) * 20), y = Y + 6 + Math.floor(hash(ty, tx, 4) * 20);
      for (let k = 0; k < 9; k++) { px(x, y, P.floor[3]); x += hash(k, tx, ty) < 0.5 ? 1 : 0; y += 1; if (hash(tx, k, ty) < 0.3) x -= 1; }
    }
  }

  // 装飾
  const R = mulberry(seed ^ 0x51ed27);
  for (const r of m.rooms) {
    if (R() < 0.3 && r.w >= 9 && r !== m.start) {
      const X = (r.cx - 2) * TP, Y = (r.cy - 1) * TP + TP / 2, w = 4 * TP, h = 2 * TP;
      rect(X, Y, w, h, P.rug[1]);
      rect(X + 2, Y + 2, w - 4, h - 4, P.rug[0]);
      c.strokeStyle = P.rug[2]; c.lineWidth = 1;
      c.strokeRect(X + 5.5, Y + 5.5, w - 11, h - 11);
      for (let i = 0; i < w; i += 3) { px(X + i, Y - 1, P.rug[2]); px(X + i, Y + h, P.rug[2]); }
      for (let d = -8; d <= 8; d++) { const yy = Y + h / 2 + Math.abs(d) - 8; px(X + w / 2 + d, yy, P.rug[2]); px(X + w / 2 + d, Y + h - (yy - Y), P.rug[2]); }
    }
    const n = 3 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const x = ((r.x + 0.5 + R() * (r.w - 1)) * TP) | 0, y = ((r.y + 0.5 + R() * (r.h - 1)) * TP) | 0, k = R();
      if (k < 0.35) rubble(px, x, y, P, R);
      else if (k < 0.55) bones(px, x, y, R);
      else if (k < 0.75) puddle(px, x, y, R);
      else moss(px, x, y, P, R);
    }
  }
  // 壁沿いの影（ディザ）
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  c.fillStyle = 'rgba(0,0,0,.45)';
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!fl(tx, ty)) continue;
    const X = tx * TP, Y = ty * TP;
    const N = !fl(tx, ty - 1), Wl = !fl(tx - 1, ty), E = !fl(tx + 1, ty);
    for (let y = 0; y < TP; y++) for (let x = 0; x < TP; x++) {
      let a = 0;
      if (N) a = Math.max(a, 1 - y / 14);
      if (Wl) a = Math.max(a, 0.7 - x / 8);
      if (E) a = Math.max(a, 0.7 - (TP - 1 - x) / 8);
      if (a > (BAY[((y & 3) << 2) | (x & 3)] + 0.5) / 16) c.fillRect(X + x, Y + y, 1, 1);
    }
  }

  // 壁：行ごとのストリップ（キャラクターとの前後関係のため）
  const strips = [];
  for (let ty = 0; ty < H; ty++) {
    let any = false;
    for (let tx = 0; tx < W; tx++) if (!fl(tx, ty) && near(fl, tx, ty)) { any = true; break; }
    if (!any) { strips.push(null); continue; }
    const s = document.createElement('canvas');
    s.width = W * TP; s.height = TP + WHP;
    const sc = s.getContext('2d');
    for (let tx = 0; tx < W; tx++) if (!fl(tx, ty) && near(fl, tx, ty)) wallTile(sc, tx, ty, fl, P, seed);
    strips.push(s);
  }
  return { floorC, strips, pal: P };
}

function near(fl, x, y) {
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) if (fl(x + dx, y + dy)) return true;
  return false;
}

function wallTile(c, tx, ty, fl, P, seed) {
  const X = tx * TP;
  const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };
  const deep = !fl(tx, ty + 1);
  // 天板
  rect(X, 0, TP, TP, P.top[1]);
  for (let k = 0; k < 4; k++) {
    const hx = Math.floor(hash(tx, k, seed) * 26), hy = Math.floor(hash(k, tx + ty, seed) * 28);
    rect(X + hx, hy, 6 + Math.floor(hash(k, ty, tx) * 6), 3, P.top[0]);
    rect(X + hx + 1, hy + 3, 5 + Math.floor(hash(k, ty, tx) * 6), 1, P.top[2]);
  }
  if (fl(tx, ty - 1)) rect(X, 0, TP, 1, P.brick[1]);
  if (fl(tx - 1, ty) || fl(tx - 1, ty + 1)) rect(X, 0, 1, TP, P.brick[2]);
  if (fl(tx + 1, ty) || fl(tx + 1, ty + 1)) rect(X + TP - 1, 0, 1, TP, P.top[3]);
  if (deep) return;
  rect(X, TP - 1, TP, 1, P.brick[1]);
  // 正面のレンガ
  const fy = TP;
  rect(X, fy, TP, WHP, P.brick[4]);
  const rows = 4, bh = 8;
  for (let r = 0; r < rows; r++) {
    const off = (r + tx) % 2 ? 9 : 0;
    for (let b = -1; b < 3; b++) {
      const bx0 = X + off + b * 18, x0 = Math.max(X, bx0 + 1), x1 = Math.min(X + TP, bx0 + 18);
      if (x1 - x0 < 2) continue;
      const v = hash(tx * 5 + b, r + ty * 7, seed + 21);
      const tone = Math.min(3, (r >> 1) + (v < 0.3 ? 1 : 0));
      const y0 = fy + 1 + r * bh;
      rect(x0, y0, x1 - x0, bh - 1, P.brick[tone]);
      rect(x0, y0, x1 - x0, 1, P.brick[Math.max(0, tone - 1)]);
      rect(x0, y0 + bh - 2, x1 - x0, 1, P.brick[tone + 1]);
      if (v > 0.85) rect(x0 + 3, y0 + 3, 2, 1, P.brick[tone + 1]);
    }
  }
  rect(X, fy + WHP - 1, TP, 1, P.brick[4]);
  // 苔の垂れ
  if (hash(tx, ty, seed + 41) < 0.3) {
    for (let k = 0; k < 5; k++) {
      const mx = X + Math.floor(hash(tx, k, seed + 3) * 34), ml = 2 + Math.floor(hash(k, tx, seed) * 9);
      rect(mx, fy, 2, ml, P.moss[1]);
      rect(mx, fy, 1, ml - 1, P.moss[0]);
      rect(mx + 1, fy + ml, 1, 1, P.moss[2]);
    }
  }
  const hb = hash(tx, ty, seed + 77);
  if (hb > 0.95) {
    // 鉄格子
    rect(X + 9, fy + 7, 18, 16, '#0a090d');
    for (let k = 0; k < 4; k++) { rect(X + 11 + k * 4, fy + 7, 1, 16, '#6a6672'); rect(X + 12 + k * 4, fy + 7, 1, 16, '#3a3842'); }
    rect(X + 9, fy + 7, 18, 1, '#8a8694');
  } else if (hb < 0.05 && fl(tx - 1, ty + 1) && fl(tx + 1, ty + 1)) {
    // 旗
    const bx = X + 9;
    rect(bx - 2, fy - 2, 22, 2, '#3a2a1e');
    for (let y = 0; y < 26; y++) {
      const w = y < 20 ? 18 : 18 - (y - 20) * 3;
      if (w <= 0) break;
      const l = y < 20 ? 0 : (y - 20) * 1.5;
      rect(bx + l, fy + y, w - l * 0 - (y < 20 ? 0 : (y - 20) * 1.5), 1, y % 7 === 0 ? P.rug[1] : P.rug[0]);
    }
    rect(bx + 7, fy + 7, 4, 6, P.rug[2]);
    rect(bx + 8, fy + 5, 2, 2, P.rug[2]);
  }
}

function rubble(px, x, y, P, R) {
  for (let i = 0; i < 4 + R() * 4; i++) {
    const rx = x + Math.floor((R() - 0.5) * 16), ry = y + Math.floor((R() - 0.5) * 9), s = 1 + Math.floor(R() * 3);
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx <= s; xx++) px(rx + xx, ry + yy, yy === 0 ? P.brick[1] : P.brick[2]);
    for (let xx = 0; xx <= s; xx++) px(rx + xx, ry + s, P.floor[4]);
  }
}
function bones(px, x, y, R) {
  const B = '#e6dec8', D = '#a8a08a';
  for (let i = 0; i < 2; i++) {
    const bx = x + Math.floor((R() - 0.5) * 10), by = y + Math.floor((R() - 0.5) * 6), horiz = R() < 0.5;
    for (let k = -3; k <= 3; k++) { px(bx + (horiz ? k : 0), by + (horiz ? 0 : k), B); px(bx + (horiz ? k : 1), by + (horiz ? 1 : k), D); }
    for (const e of [-4, 4]) { px(bx + (horiz ? e : -1), by + (horiz ? -1 : e), B); px(bx + (horiz ? e : 1), by + (horiz ? 1 : e), B); }
  }
  if (R() < 0.4) {
    const sx = x + 6, sy = y - 2;
    for (let yy = -3; yy <= 2; yy++) for (let xx = -3; xx <= 3; xx++) if (xx * xx + yy * yy * 1.4 < 11) px(sx + xx, sy + yy, yy < 0 ? B : D);
    px(sx - 1, sy, '#2a2420'); px(sx + 1, sy, '#2a2420');
  }
}
function puddle(px, x, y, R) {
  const w = 5 + Math.floor(R() * 6), h = 2 + Math.floor(R() * 2);
  for (let yy = -h; yy <= h; yy++) for (let xx = -w; xx <= w; xx++) {
    if ((xx * xx) / (w * w) + (yy * yy) / (h * h) > 1) continue;
    px(x + xx, y + yy, yy < 0 && xx < 0 ? '#3a4a62' : '#2a3448');
  }
  px(x - 2, y - 1, '#8aa0c0'); px(x - 1, y - 1, '#8aa0c0');
}
function moss(px, x, y, P, R) {
  for (let i = 0; i < 18; i++) {
    const mx = x + Math.floor((R() - 0.5) * 18), my = y + Math.floor((R() - 0.5) * 10);
    px(mx, my, P.moss[Math.floor(R() * 3)]);
  }
}
