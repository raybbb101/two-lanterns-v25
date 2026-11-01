import { mulberry, hash, shade, rgba } from './util.js';

export const T = 48;   // タイルの大きさ
export const WH = 44;  // 壁の高さ（疑似 3D）

export const THEMES = [
  { name: '忘れられた石窟', floor: '#45464f', floor2: '#24242b', wallTop: '#5b5562', face: '#6e6a74', mortar: '#26242c', moss: '#4f6b3a', accent: '#7a2a2a', ambient: '#0e0d14', fog: '#07060a' },
  { name: '苔むす地下水路', floor: '#3e4b3c', floor2: '#202a1f', wallTop: '#4d5a4c', face: '#5c6c56', mortar: '#1d241c', moss: '#6b8f3c', accent: '#2f5a6a', ambient: '#0a1110', fog: '#050807' },
  { name: '灼熱の坑道', floor: '#523b33', floor2: '#2c1d19', wallTop: '#624640', face: '#7a5446', mortar: '#2a1814', moss: '#a8482a', accent: '#c05a1e', ambient: '#140b09', fog: '#090505' },
  { name: '凍てつく霊廟', floor: '#46525f', floor2: '#252d38', wallTop: '#566274', face: '#6c7a8e', mortar: '#1f2631', moss: '#8fb6cf', accent: '#3a4f8a', ambient: '#0b0f18', fog: '#05070b' },
];
export const themeFor = (floor) => THEMES[Math.floor((floor - 1) / 3) % THEMES.length];

export function genMap(seed, floor, dim = null) {
  const R = mulberry(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const boss = !dim && floor % 3 === 0;
  const W = 56, H = 46;
  const g = new Uint8Array(W * H);
  const rooms = [];
  const tryRoom = (w, h) => {
    for (let k = 0; k < 300; k++) {
      const x = ri(2, W - w - 3), y = ri(3, H - h - 3);
      if (rooms.every((o) => x + w + 3 < o.x || o.x + o.w + 3 < x || y + h + 3 < o.y || o.y + o.h + 3 < y)) {
        const r = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
        rooms.push(r);
        return r;
      }
    }
    return null;
  };
  const set = (x, y, v) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 2) g[y * W + x] = v; };
  const carve = (r) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, 1); };

  if (boss) {
    tryRoom(8, 7);
    tryRoom(20, 15).arena = true;
    for (let i = 0; i < 3; i++) tryRoom(ri(7, 10), ri(6, 8));
  } else if (dim) {
    // 異次元：広い部屋を少しだけ
    tryRoom(10, 8);
    for (let i = 0; i < 4; i++) tryRoom(ri(12, 16), ri(9, 12));
  } else {
    const n = 7 + Math.min(4, floor >> 1);
    for (let i = 0; i < n; i++) tryRoom(ri(7, 13), ri(6, 10));
  }
  rooms.forEach(carve);

  const corridor = (a, b) => {
    const horizFirst = R() < 0.5;
    let x = a.cx, y = a.cy;
    const step = (tx, ty) => {
      while (x !== tx || y !== ty) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, 1);
        if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y);
      }
    };
    if (horizFirst) { step(b.cx, a.cy); step(b.cx, b.cy); } else { step(a.cx, b.cy); step(b.cx, b.cy); }
  };
  const d2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  for (let i = 1; i < rooms.length; i++) {
    let best = 0;
    for (let j = 1; j < i; j++) if (d2(rooms[i], rooms[j]) < d2(rooms[i], rooms[best])) best = j;
    corridor(rooms[i], rooms[best]);
  }
  if (rooms.length > 4) corridor(rooms[rooms.length - 1], rooms[2]); // ループを一本足す

  const start = rooms[0];
  let end = rooms.find((r) => r.arena);
  if (!end) end = rooms.slice(1).reduce((a, b) => (d2(b, start) > d2(a, start) ? b : a));

  // 柱（壁扱い）
  for (const r of rooms) {
    if (r === start || r.w < 10 || r.h < 8) continue;
    if (!r.arena && R() < 0.5) continue;
    const ins = r.arena ? 4 : 2;
    for (const [px, py] of [[r.x + ins, r.y + ins], [r.x + r.w - 1 - ins, r.y + ins], [r.x + ins, r.y + r.h - 1 - ins], [r.x + r.w - 1 - ins, r.y + r.h - 1 - ins]]) {
      if (Math.abs(px - r.cx) > 1 && Math.abs(py - r.cy) > 1) g[py * W + px] = 0;
    }
  }

  const isFloor = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] === 1;

  // 松明：床に面した壁の正面
  const torches = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y * W + x] || !isFloor(x, y + 1)) continue;
    if (isFloor(x - 1, y) || isFloor(x + 1, y)) continue;
    if (hash(x, y, seed) > 0.16) continue;
    if (torches.some((t) => Math.abs(t.tx - x) < 5 && Math.abs(t.ty - y) < 3)) continue;
    torches.push({ tx: x, ty: y, x: x * T + T / 2, y: (y + 1) * T - WH * 0.62, row: y });
  }

  // 宝箱
  const chests = [];
  const others = rooms.filter((r) => r !== start && !r.arena);
  others.forEach((r, i) => {
    if (R() < 0.55 || chests.length < 3 - (others.length - i - 1)) {
      const cx = r.x + 1 + Math.floor(R() * (r.w - 2));
      if (isFloor(cx, r.y) && !isFloor(cx, r.y - 1)) chests.push({ id: chests.length, x: cx * T + T / 2, y: r.y * T + T * 0.62, open: false });
    }
  });

  // 敵の出現位置（ホストだけが実際に使う）
  const spawns = [];
  for (const r of rooms) {
    if (r === start || r.arena) continue;
    const n = 2 + Math.floor(R() * 2) + Math.floor(floor * 0.55);
    for (let i = 0; i < n; i++) {
      let x, y, k = 0;
      do { x = r.x + 1 + Math.floor(R() * (r.w - 2)); y = r.y + 1 + Math.floor(R() * (r.h - 2)); } while (!isFloor(x, y) && ++k < 20);
      spawns.push({ x: x * T + T / 2, y: y * T + T / 2, room: rooms.indexOf(r) });
    }
  }

  // なぞなぞ（石碑）と灯の台座
  const puzzles = [];
  const pz = rooms.filter((r) => r !== start && !r.arena && r.w >= 8 && r.h >= 6);
  const npz = Math.min(pz.length, 1 + (R() < 0.5 ? 1 : 0));
  for (let i = 0; i < npz; i++) {
    const r = pz.splice(Math.floor(R() * pz.length), 1)[0];
    const y = r.y + r.h - 2;
    const cell = (x) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T });
    if (R() < 0.5) puzzles.push({ id: i, kind: 'riddle', ...cell(r.cx), ri: Math.floor(R() * 100000), done: false });
    else {
      const order = [0, 1, 2];
      for (let k = 2; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
      puzzles.push({ id: i, kind: 'plates', ...cell(r.cx), plates: [cell(r.x + 2), cell(r.x + r.w - 3), cell(r.cx)], seq: order, step: 0, hold: 0, lit: [], done: false });
    }
  }

  // 異次元には金の宝箱が多い
  if (dim) for (const r of others) if (chests.length < 5) chests.push({ id: chests.length, x: (r.x + 2 + Math.floor(R() * (r.w - 4))) * T + T / 2, y: (r.y + 1) * T + T * 0.62, open: false });

  // 隠し部屋：毎回あるわけではない。鍵を見つけると扉が開く
  let secret = null;
  if (!dim && !boss && R() < 0.45) {
    const w = 8, h = 6, solidAround = (x0, y0) => {
      for (let y = y0 - 2; y < y0 + h + 2; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) if (x < 1 || y < 1 || x >= W - 1 || y >= H - 2 || g[y * W + x]) return false;
      return true;
    };
    for (let k = 0; k < 400 && !secret; k++) {
      const x0 = ri(2, W - w - 3), y0 = ri(3, H - h - 3);
      if (!solidAround(x0, y0)) continue;
      // 部屋の下辺から真下へ床を探す（扉が見える向き）
      const cx = x0 + (w >> 1);
      let ty = y0 + h + 1;
      while (ty < H - 2 && !g[ty * W + cx]) ty++;
      if (ty >= H - 2 || ty - (y0 + h) > 9) continue;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y * W + x] = 1;
      const doorTiles = [];
      for (let y = y0 + h; y < ty; y++) doorTiles.push([cx, y]);
      const kinds = ['treasure', 'coins', 'spring', 'shop'];
      const keyRoom = others[Math.floor(R() * others.length)] || start;
      secret = {
        kind: kinds[Math.floor(R() * kinds.length)], room: { x: x0, y: y0, w, h }, doorTiles, open: false, used: false,
        cx: (cx + 0.5) * T, cy: (y0 + 2.5) * T, dx: (cx + 0.5) * T, dy: (ty - 0.2) * T,
        kx: (keyRoom.cx + 0.5) * T, ky: (keyRoom.cy + 1.5) * T,
      };
    }
  }

  const theme = dim ? { ...THEMES[0], ...dim.theme, name: dim.name } : themeFor(floor);
  return { W, H, g, rooms, start, end, torches, chests, spawns, puzzles, seed, floor, boss, dim, secret, theme, seen: new Uint8Array(W * H) };
}

export const isSolid = (m, tx, ty) => tx < 0 || ty < 0 || tx >= m.W || ty >= m.H || m.g[ty * m.W + tx] === 0;

// 円とタイルの当たり判定（軸ごとに解決）
export function moveCircle(m, e, dx, dy) {
  const r = e.r;
  e.x += dx;
  if (hitsWall(m, e.x, e.y, r)) {
    e.x -= dx;
    const s = Math.sign(dx);
    for (let i = 0; i < 8 && !hitsWall(m, e.x + s * 0.5, e.y, r); i++) e.x += s * 0.5;
    e.hitX = true;
  }
  e.y += dy;
  if (hitsWall(m, e.x, e.y, r)) {
    e.y -= dy;
    const s = Math.sign(dy);
    for (let i = 0; i < 8 && !hitsWall(m, e.x, e.y + s * 0.5, r); i++) e.y += s * 0.5;
    e.hitY = true;
  }
}

export function hitsWall(m, x, y, r) {
  const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
  const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!isSolid(m, tx, ty)) continue;
    const cx = Math.max(tx * T, Math.min(x, tx * T + T));
    const cy = Math.max(ty * T, Math.min(y, ty * T + T));
    if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return true;
  }
  return false;
}

export function lineOfSight(m, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 14);
  for (let i = 1; i < n; i++) {
    const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
    if (isSolid(m, Math.floor(x / T), Math.floor(y / T))) return false;
  }
  return true;
}

// ---------- 事前描画 ----------
export function buildMapGfx(m) {
  const { W, H, g, theme: th, seed } = m;
  const fl = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] === 1;
  const floorC = document.createElement('canvas');
  floorC.width = W * T; floorC.height = H * T;
  const c = floorC.getContext('2d');
  c.fillStyle = th.fog;
  c.fillRect(0, 0, floorC.width, floorC.height);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!fl(x, y)) continue;
    drawFloorTile(c, x, y, th, seed);
  }
  // ラグ・水たまり・骨などの装飾
  const R = mulberry(seed ^ 0x9e3779b9);
  for (const r of m.rooms) {
    if (R() < 0.3 && r.w >= 9 && r !== m.start) drawRug(c, (r.cx - 2) * T, (r.cy - 1) * T + T / 2, 4 * T, 2 * T, th, R);
    const n = 3 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const x = (r.x + R() * r.w) * T, y = (r.y + R() * r.h) * T;
      const k = R();
      if (k < 0.3) drawRubble(c, x, y, th, R);
      else if (k < 0.5) drawBones(c, x, y, R);
      else if (k < 0.7) drawPuddle(c, x, y, R);
      else drawMossPatch(c, x, y, th, R);
    }
  }
  // 壁沿いの影（アンビエントオクルージョン）
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!fl(x, y)) continue;
    const px = x * T, py = y * T;
    if (!fl(x, y - 1)) { const gr = c.createLinearGradient(0, py, 0, py + 26); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(px, py, T, 26); }
    if (!fl(x - 1, y)) { const gr = c.createLinearGradient(px, 0, px + 14, 0); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(px, py, 14, T); }
    if (!fl(x + 1, y)) { const gr = c.createLinearGradient(px + T, 0, px + T - 14, 0); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(px + T - 14, py, 14, T); }
  }
  // クモの巣（部屋の上側の角）
  for (const r of m.rooms) {
    if (fl(r.x, r.y) && !fl(r.x - 1, r.y) && !fl(r.x, r.y - 1) && R() < 0.6) drawWeb(c, r.x * T, r.y * T, 1);
    const rx = r.x + r.w - 1;
    if (fl(rx, r.y) && !fl(rx + 1, r.y) && !fl(rx, r.y - 1) && R() < 0.6) drawWeb(c, (rx + 1) * T, r.y * T, -1);
  }

  // 壁は行ごとのストリップに描く（キャラクターとの前後関係を正しくするため）
  const strips = [];
  for (let y = 0; y < H; y++) {
    let any = false;
    for (let x = 0; x < W; x++) if (!fl(x, y) && nearFloor(fl, x, y)) { any = true; break; }
    if (!any) { strips.push(null); continue; }
    const s = document.createElement('canvas');
    s.width = W * T; s.height = T + WH;
    const sc = s.getContext('2d');
    for (let x = 0; x < W; x++) {
      if (fl(x, y) || !nearFloor(fl, x, y)) continue;
      drawWallTile(sc, x, y, fl, th, seed);
    }
    strips.push(s);
  }
  return { floorC, strips };
}

function nearFloor(fl, x, y) {
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) if (fl(x + dx, y + dy)) return true;
  return false;
}

function drawFloorTile(c, x, y, th, seed) {
  const px = x * T, py = y * T;
  c.fillStyle = th.floor2;
  c.fillRect(px, py, T, T);
  const h = hash(x, y, seed);
  // 石畳：1枚・2枚・4枚に割る
  const split = h < 0.35 ? 1 : h < 0.7 ? 2 : 4;
  const stones = split === 1 ? [[0, 0, T, T]] : split === 2 ? (hash(x, y, 7) < 0.5 ? [[0, 0, T / 2, T], [T / 2, 0, T / 2, T]] : [[0, 0, T, T / 2], [0, T / 2, T, T / 2]]) : [[0, 0, T / 2, T / 2], [T / 2, 0, T / 2, T / 2], [0, T / 2, T / 2, T / 2], [T / 2, T / 2, T / 2, T / 2]];
  stones.forEach(([sx, sy, sw, sh], i) => {
    const v = hash(x * 4 + i, y * 3 - i, seed + 11) * 0.16 - 0.08;
    const X = px + sx + 1.5, Y = py + sy + 1.5, Ww = sw - 3, Hh = sh - 3;
    c.fillStyle = shade(th.floor, v);
    roundRect(c, X, Y, Ww, Hh, 3);
    c.fill();
    // ベベル
    c.strokeStyle = 'rgba(255,255,255,.07)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(X + 2, Y + Hh - 1); c.lineTo(X + 1, Y + 1); c.lineTo(X + Ww - 2, Y + 1); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.25)';
    c.beginPath(); c.moveTo(X + Ww - 1, Y + 2); c.lineTo(X + Ww - 1, Y + Hh - 1); c.lineTo(X + 2, Y + Hh - 1); c.stroke();
    // ざらつき
    for (let k = 0; k < 10; k++) {
      const hx = hash(x * 13 + k, y * 7 + i, seed), hy = hash(x * 5 - k, y * 11 + i, seed + 3);
      c.fillStyle = hx < 0.5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.05)';
      c.fillRect(X + hx * Ww, Y + hy * Hh, 1.5, 1.5);
    }
  });
  if (hash(x, y, seed + 99) < 0.12) {
    // ひび
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 1;
    c.beginPath();
    let cx = px + hash(x, y, 5) * T, cy = py + hash(y, x, 6) * T;
    c.moveTo(cx, cy);
    for (let k = 0; k < 4; k++) { cx += (hash(x, k, 8) - 0.5) * 18; cy += (hash(k, y, 9) - 0.3) * 14; c.lineTo(cx, cy); }
    c.stroke();
  }
}

function drawWallTile(c, x, y, fl, th, seed) {
  const px = x * T;
  const deep = !fl(x, y + 1);
  // 上面（壁の天板）: ストリップ内の y=0..T
  const top = c.createLinearGradient(0, 0, 0, T);
  top.addColorStop(0, shade(th.wallTop, 0.06));
  top.addColorStop(1, shade(th.wallTop, -0.1));
  c.fillStyle = top;
  c.fillRect(px, 0, T, T);
  // 天板の石目
  for (let k = 0; k < 3; k++) {
    c.fillStyle = `rgba(255,255,255,${0.025 + hash(x, k, seed) * 0.03})`;
    const hx = hash(x, y * 3 + k, seed) * (T - 14);
    const hy = hash(y, x * 3 + k, seed) * (T - 12);
    roundRect(c, px + hx, hy, 10 + hash(k, x, y) * 8, 7, 2);
    c.fill();
  }
  // 縁取り：床側の辺は明るく、それ以外は暗く締める
  const edge = (cond, x0, y0, x1, y1, light) => {
    if (!cond) return;
    c.strokeStyle = light ? 'rgba(255,240,220,.22)' : 'rgba(0,0,0,.5)';
    c.lineWidth = light ? 2 : 3;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  };
  edge(fl(x, y - 1), px, 1, px + T, 1, true);
  edge(fl(x - 1, y) || fl(x - 1, y + 1), px + 1, 0, px + 1, T, true);
  edge(fl(x + 1, y) || fl(x + 1, y + 1), px + T - 1, 0, px + T - 1, T, false);
  edge(!deep, px, T - 1, px + T, T - 1, true);
  if (deep) return;
  // 正面（レンガ）: y=T..T+WH
  const fy = T;
  const fg = c.createLinearGradient(0, fy, 0, fy + WH);
  fg.addColorStop(0, shade(th.face, 0.1));
  fg.addColorStop(1, shade(th.face, -0.45));
  c.fillStyle = th.mortar;
  c.fillRect(px, fy, T, WH);
  const rows = 4, bh = WH / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r + x) % 2 ? T / 4 : -T / 4;
    for (let b = -1; b < 3; b++) {
      const bx = px + off + b * (T / 2);
      const x0 = Math.max(px, bx + 1), x1 = Math.min(px + T, bx + T / 2 - 1);
      if (x1 - x0 < 2) continue;
      const v = hash(x * 5 + b, r + y * 7, seed + 21) * 0.18 - 0.09;
      const ry = fy + r * bh + 1;
      const lg = c.createLinearGradient(0, ry, 0, ry + bh - 2);
      const base = shade(th.face, v - r * 0.1);
      lg.addColorStop(0, base);
      lg.addColorStop(1, shade(th.face, v - r * 0.1 - 0.18));
      c.fillStyle = lg;
      c.fillRect(x0, ry, x1 - x0, bh - 2);
      c.fillStyle = 'rgba(255,255,255,.08)';
      c.fillRect(x0, ry, x1 - x0, 1);
    }
  }
  // 上端の影の帯と下端の暗がり
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.fillRect(px, fy, T, 2);
  const bot = c.createLinearGradient(0, fy + WH - 14, 0, fy + WH);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,.45)');
  c.fillStyle = bot;
  c.fillRect(px, fy + WH - 14, T, 14);
  // 苔の垂れ
  if (hash(x, y, seed + 41) < 0.3) {
    c.fillStyle = rgba(th.moss, 0.55);
    for (let k = 0; k < 5; k++) {
      const mx = px + hash(x, k, seed + 3) * T, ml = 4 + hash(k, x, seed) * 16;
      roundRect(c, mx, fy, 3 + hash(k, y, 1) * 4, ml, 2);
      c.fill();
    }
  }
  // 旗
  const hb = hash(x, y, seed + 77);
  if (hb < 0.05 && fl(x - 1, y + 1) && fl(x + 1, y + 1)) drawBanner(c, px + T / 2, fy - 6, th);
  else if (hb > 0.96) {
    // 鉄格子
    c.fillStyle = '#121218';
    roundRect(c, px + 12, fy + 10, 24, 22, 3); c.fill();
    c.strokeStyle = '#5a5a63'; c.lineWidth = 2;
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(px + 15 + k * 6, fy + 10); c.lineTo(px + 15 + k * 6, fy + 32); c.stroke(); }
  }
}

function drawBanner(c, x, y, th) {
  c.fillStyle = '#2b2118';
  c.fillRect(x - 13, y + 2, 26, 3);
  const g = c.createLinearGradient(x - 11, 0, x + 11, 0);
  g.addColorStop(0, shade(th.accent, -0.3));
  g.addColorStop(0.5, th.accent);
  g.addColorStop(1, shade(th.accent, -0.4));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - 11, y + 5); c.lineTo(x + 11, y + 5); c.lineTo(x + 11, y + 40); c.lineTo(x, y + 33); c.lineTo(x - 11, y + 40);
  c.closePath(); c.fill();
  c.strokeStyle = '#d6b25a'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(x - 8, y + 8); c.lineTo(x + 8, y + 8); c.stroke();
  // 紋章（灯火）
  c.fillStyle = '#e7c46a';
  c.beginPath(); c.moveTo(x, y + 13); c.quadraticCurveTo(x + 6, y + 21, x, y + 26); c.quadraticCurveTo(x - 6, y + 21, x, y + 13); c.fill();
}

function drawRug(c, x, y, w, h, th, R) {
  c.save();
  c.globalAlpha = 0.85;
  c.fillStyle = shade(th.accent, -0.2);
  roundRect(c, x, y, w, h, 4); c.fill();
  c.strokeStyle = '#c9a24e'; c.lineWidth = 2;
  roundRect(c, x + 6, y + 6, w - 12, h - 12, 3); c.stroke();
  c.strokeStyle = rgba('#c9a24e', 0.5); c.lineWidth = 1;
  roundRect(c, x + 12, y + 12, w - 24, h - 24, 2); c.stroke();
  c.fillStyle = rgba('#e3c27a', 0.6);
  c.beginPath(); c.moveTo(x + w / 2, y + 18); c.lineTo(x + w / 2 + 14, y + h / 2); c.lineTo(x + w / 2, y + h - 18); c.lineTo(x + w / 2 - 14, y + h / 2); c.closePath(); c.fill();
  // 房
  c.strokeStyle = '#b89650';
  for (let i = 0; i < w; i += 5) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i, y - 4); c.moveTo(x + i, y + h); c.lineTo(x + i, y + h + 4); c.stroke(); }
  // すり切れ
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 30; i++) { c.globalAlpha = 0.25 * R(); c.beginPath(); c.arc(x + R() * w, y + R() * h, 2 + R() * 6, 0, 7); c.fill(); }
  c.restore();
}
function drawRubble(c, x, y, th, R) {
  for (let i = 0; i < 4 + R() * 4; i++) {
    const rx = x + (R() - 0.5) * 22, ry = y + (R() - 0.5) * 14, s = 2 + R() * 4;
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath(); c.ellipse(rx + 1, ry + s * 0.6, s, s * 0.5, 0, 0, 7); c.fill();
    c.fillStyle = shade(th.face, R() * 0.2 - 0.1);
    c.beginPath(); c.moveTo(rx - s, ry); c.lineTo(rx - s * 0.3, ry - s * 0.8); c.lineTo(rx + s, ry - s * 0.4); c.lineTo(rx + s * 0.7, ry + s * 0.4); c.lineTo(rx - s * 0.5, ry + s * 0.5); c.fill();
    c.fillStyle = 'rgba(255,255,255,.12)';
    c.fillRect(rx - s * 0.3, ry - s * 0.6, s * 0.8, 1);
  }
}
function drawBones(c, x, y, R) {
  c.save(); c.translate(x, y);
  for (let i = 0; i < 3; i++) {
    c.save(); c.rotate(R() * 6); c.translate((R() - 0.5) * 10, (R() - 0.5) * 6);
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(-7, 1.5); c.lineTo(7, 1.5); c.stroke();
    c.strokeStyle = '#cfc6ae'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.stroke();
    c.fillStyle = '#ddd5bf';
    [-7, 7].forEach((e) => { c.beginPath(); c.arc(e, -1.2, 1.8, 0, 7); c.arc(e, 1.2, 1.8, 0, 7); c.fill(); });
    c.restore();
  }
  if (R() < 0.4) {
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(9, 6, 6, 3, 0, 0, 7); c.fill();
    c.fillStyle = '#ddd5bf'; c.beginPath(); c.arc(8, 0, 5.5, 0, 7); c.fill();
    c.fillStyle = '#2a2622'; c.beginPath(); c.arc(6, 0, 1.4, 0, 7); c.arc(10, 0, 1.4, 0, 7); c.fill();
  }
  c.restore();
}
function drawPuddle(c, x, y, R) {
  const w = 10 + R() * 14, h = w * 0.45;
  const g = c.createRadialGradient(x - w * 0.3, y - h * 0.3, 1, x, y, w);
  g.addColorStop(0, 'rgba(160,190,220,.35)');
  g.addColorStop(1, 'rgba(30,40,60,.35)');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, w, h, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(200,220,255,.18)';
  c.beginPath(); c.ellipse(x - w * 0.2, y - h * 0.2, w * 0.4, h * 0.3, 0, 3.6, 5.2); c.stroke();
}
function drawMossPatch(c, x, y, th, R) {
  for (let i = 0; i < 6; i++) {
    const g = c.createRadialGradient(x, y, 0, x, y, 14 + R() * 10);
    g.addColorStop(0, rgba(th.moss, 0.25));
    g.addColorStop(1, rgba(th.moss, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(x + (R() - 0.5) * 20, y + (R() - 0.5) * 14, 24, 0, 7); c.fill();
  }
}
function drawWeb(c, x, y, dir) {
  c.save(); c.translate(x, y); c.scale(dir, 1);
  c.strokeStyle = 'rgba(220,220,230,.18)'; c.lineWidth = 0.8;
  for (let a = 0; a <= 5; a++) { const ang = (a / 5) * Math.PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(ang) * 30, Math.sin(ang) * 30); c.stroke(); }
  for (let r = 6; r < 30; r += 6) { c.beginPath(); for (let a = 0; a <= 5; a++) { const ang = (a / 5) * Math.PI / 2; const rr = r + (a % 2) * 1.5; a ? c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } c.stroke(); }
  c.restore();
}

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
