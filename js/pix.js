import { sfx } from './audio.js';
// v2 の描画：低解像度のキャンバスにピクセルアートで描き、整数倍で拡大する。
import { TAU, clamp, lerp, rgba, mulberry } from './util.js';
import { T, WH } from './map.js';
import { K, TP, WHP, buildPixelMap } from './tiles.js';
import { heroPixels, heroPose, poseKey, COSTUMES } from './hero.js';
import { monsterPixels, TINT_RAMP } from './monsters.js';
import { ELEMENTS, PETS } from './data.js';
import { JOBS } from './jobs.js';
import { FxLayer, FX, RARE_RAMP, FIRE_RAMP, ICE_RAMP, EMPTY_ACTOR, actorFrom } from './fxlib.js';
import { createFx, createFrame, composite, hex } from '../pixelfx/src/core/index.js';
const BOLT_W = hex('#ffffff'), BOLT_C = hex('#a890ff');
import { skeleton } from '../pixelfx/src/core/rig.js';
import { WEAPONS, RARITY, ENEMIES } from './data.js';

const P = (v) => Math.round(v * K);
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const toCanvas = (o) => {
  const c = mkCanvas(o.w, o.h);
  c.getContext('2d').putImageData(new ImageData(o.rgba, o.w, o.h), 0, 0);
  return c;
};

// pixelfx のエフェクトの 1 コマを絵として焼く
export function bake(mod, opts, t, w, h, ox, oy) {
  const fx = createFx(mod, { seed: 3, ...opts, x: ox, y: oy });
  let tt = 0;
  while (tt < t) { const d = Math.min(1 / 60, t - tt); fx.update(d); tt += d; }
  const f = createFrame(w, h);
  fx.draw(f);
  const img = new ImageData(w, h);
  composite(f, img.data, null);
  const c = mkCanvas(w, h);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
// ループするエフェクトを n コマに焼く
function bakeLoop(mod, opts, n, w, h, ox, oy) {
  const fx = createFx(mod, { seed: 4, ...opts, x: ox, y: oy });
  const D = mod.meta.duration || 1, frames = [];
  for (let i = 0; i < n; i++) {
    const f = createFrame(w, h);
    fx.draw(f);
    const img = new ImageData(w, h);
    composite(f, img.data, null);
    const c = mkCanvas(w, h);
    c.getContext('2d').putImageData(img, 0, 0);
    frames.push(c);
    const step = D / n;
    for (let s = 0; s < 4; s++) fx.update(step / 4);
  }
  return { frames, D, ox, oy };
}

// 落ちている武器のアイコン：骨格キャラに持たせて、武器のピクセルだけを切り抜く
const weaponCache = new Map();
export function weaponSprite(base, rarity) {
  const key = base + rarity;
  if (weaponCache.has(key)) return weaponCache.get(key);
  const hw = { base, rarity };
  const pose = { ...heroPose({ weapon: hw, aim: 0 }, 0), sa: base === 'bow' ? 0 : -0.75, yaw: 0, fx: 0, fy: -20, bx: -40, by: -10 };
  const all = heroPixels(pose, COSTUMES.knight, rarity);
  const body = heroPixels({ ...pose, weapon: undefined }, COSTUMES.knight, rarity);
  // 体のピクセルを消す（同じ位置で同じ色なら体）
  const out = new Uint8ClampedArray(all.rgba);
  for (let y = 0; y < all.h; y++) for (let x = 0; x < all.w; x++) {
    const bx = x + all.ox - body.ox, by = y + all.oy - body.oy;
    if (bx < 0 || by < 0 || bx >= body.w || by >= body.h) continue;
    const j = (y * all.w + x) * 4, k = (by * body.w + bx) * 4;
    if (body.rgba[k + 3] && body.rgba[k] === all.rgba[j] && body.rgba[k + 1] === all.rgba[j + 1] && body.rgba[k + 2] === all.rgba[j + 2]) out[j + 3] = 0;
  }
  // 残ったピクセルの範囲で切り抜く
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < all.h; y++) for (let x = 0; x < all.w; x++) if (out[(y * all.w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = Math.max(1, x1 - x0 + 1), h = Math.max(1, y1 - y0 + 1);
  const c = mkCanvas(w, h);
  const id = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((y + y0) * all.w + x + x0) * 4, d = (y * w + x) * 4; for (let k = 0; k < 4; k++) id.data[d + k] = out[s + k]; }
  c.getContext('2d').putImageData(id, 0, 0);
  weaponCache.set(key, c);
  return c;
}

const WEATHER_FX = { cherryBlossoms: 'wCherry', blizzard: 'wBlizzard', aurora: 'wAurora', fallingLeaves: 'wLeaves', storm: 'wStorm', fireflies: 'wFireflies', shootingStars: 'wStars', godRays: 'wGodRays', fog: 'wFog' };
const WEATHER_A = { blizzard: 0.45, fog: 0.5, storm: 0.6, aurora: 0.7, godRays: 0.6 };
const NO_LOOT_ICON = ['heal', 'coin', 'xp', 'potion', 'star', 'key'];
const LOOT_FX = { coin: 'coinSpin', xp: 'xpOrb', potion: 'potion', star: 'powerStar', key: 'keyGlint' };
const ANIM_T = new Set(['mage', 'bat', 'wisp', 'shade', 'bishop', 'eye']);
export class PixRenderer {
  constructor(game) {
    this.g = game;
    this.pc = mkCanvas(2, 2);
    this.x = this.pc.getContext('2d');
    this.lightC = mkCanvas(2, 2);
    this.lx = this.lightC.getContext('2d');
    this.fx = new FxLayer();
    // 天気と画面切り替えは小さく描いて全画面に広げる
    this.wx = new FxLayer(); this.wx.resize(320, 180);
    this.tr = new FxLayer(); this.tr.resize(320, 180);
    this.petFx = new Map();
    this.auraFx = new Map();
    this.heroCache = new Map();
    this.monCache = new Map();
    this.flashCache = new Map();
    this.shadowCache = new Map();
    this.projFx = new Map();
    this.statusFx = new Map();
    this.lootFx = new Map();
    this.portalFx = null;
    this.shieldFx = [null, null];
    this.torch = bakeLoop(FX.torch, {}, 24, 72, 120, 36, 94);
    this.chestImg = {
      closed: bake(FX.chestOpen, {}, 0.01, 176, 112, 88, 96),
      gold: bake(FX.chestOpen, { wood: ['#1a1006', '#3a2408', '#5e3a0c', '#86520c', '#b07a1a', '#d4a030', '#f0c860'] }, 0.01, 176, 112, 88, 96),
    };
    this.actors = new Map();
  }

  // エフェクトに渡す本物の体（魔物は type ごと、主人公はジョブごと）
  monsterActor(t, v, flip) {
    const key = 'm' + t + (v || 0) + (flip ? 1 : 0);
    if (!this.actors.has(key)) this.actors.set(key, actorFrom(monsterPixels({ type: t, v: v || 0, state: 'idle', k: 0, ph: 0, t: 0 }, !!flip)));
    return this.actors.get(key);
  }
  heroActor(job) {
    const key = 'h' + job;
    if (!this.actors.has(key)) this.actors.set(key, actorFrom(heroPixels(heroPose({ weapon: null, aim: 0.2 }, 0), COSTUMES[job], 0)));
    return this.actors.get(key);
  }

  resize() {
    const cv = this.g.cv;
    const s = Math.max(2, Math.round(cv.height / 330));
    this.s = s;
    this.VW = Math.ceil(cv.width / s);
    this.VH = Math.ceil(cv.height / s);
    this.pc.width = this.VW; this.pc.height = this.VH;
    this.lightC.width = this.VW; this.lightC.height = this.VH;
    this.fx.resize(this.VW, this.VH);
    const v = mkCanvas(cv.width, cv.height), vc = v.getContext('2d');
    const gr = vc.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.4, v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
    vc.fillStyle = gr; vc.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  }

  newFloor(m) {
    this.gfx = buildPixelMap(m);
    this.fx.clear();
    this.projFx.clear(); this.statusFx.clear(); this.lootFx.clear(); this.petFx.clear(); this.auraFx.clear();
    this.portalFx = null; this.runeFx = null; this.shieldFx = [null, null]; this.dimFx = null; this.chargeFx = null;
    this.wx.clear();
    if (m.weather) { const mod = FX[WEATHER_FX[m.weather]]; this.wx.add(mod, { x: mod.meta.origin[0], y: mod.meta.origin[1] }); }
    this.npcC = null;
    this.monCache.clear(); this.flashCache.clear();
    this.placeDecor(m);
    this.addSecretFx(m);
  }

  rebuild(m) { this.gfx = buildPixelMap(m); this.addSecretFx(m); }
  addSecretFx(m) {
    const s = m.secret;
    if (!s) return;
    if (s.kind === 'spring') this.fx.add(FX.fountain, { x: P(s.cx), y: P(s.cy) + 4 });
    if (s.kind === 'coins') this.fx.add(FX.coinSpin, { x: P(s.cx), y: P(s.cy) + 4 });
  }
  transition(name) {
    const mod = FX[name];
    this.tr.clear();
    const o = mod.meta.origin || [160, 90];
    this.tr.add(mod, { x: o[0], y: o[1] });
  }

  // 部屋の飾り（層のテーマごと）。両方の画面で同じになるよう seed から決める
  decorLoop(name) {
    this.decorBaked = this.decorBaked || {};
    if (!this.decorBaked[name]) {
      const mod = FX[name], [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
      this.decorBaked[name] = bakeLoop(mod, {}, 16, w, h, ox, oy);
    }
    return this.decorBaked[name];
  }
  placeDecor(m) {
    const R = mulberry(m.seed ^ 0x2f6e2b1);
    const kinds = [['brazier', 'candle'], ['candle', 'spiritFlame'], ['brazier', 'brazier'], ['spiritFlame', 'iceCrystal']][Math.floor((m.floor - 1) / 3) % 4];
    const light = { brazier: ['#ff9a48', 150], candle: ['#ffc070', 70], spiritFlame: ['#6ae0e0', 110], iceCrystal: ['#8fd8ff', 90] };
    this.decor = [];
    for (const r of m.rooms) {
      if (r.w < 8 || r.h < 7 || R() < 0.35) continue;
      for (const [cx, cy] of [[r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
        if (R() < 0.35 || !m.g[cy * m.W + cx]) continue;
        const name = kinds[Math.floor(R() * 2)];
        this.decor.push({ name, x: (cx + 0.5) * T, y: (cy + 0.5) * T, col: light[name][0], r: light[name][1], ph: R() });
      }
    }
  }
  drawDecor(d, t) {
    const b = this.decorLoop(d.name);
    const f = b.frames[Math.floor(((t + d.ph * b.D) / b.D) * b.frames.length) % b.frames.length];
    this.x.drawImage(f, P(d.x) - b.ox, P(d.y) - b.oy);
  }

  // ---------------- スプライト ----------------
  heroSprite(p) {
    const pose = heroPose(p, this.g.time);
    const ci = p.job || 'knight';
    const rar = p.weapon ? p.weapon.rarity : 0;
    const key = ci + '|' + rar + '|' + poseKey(pose);
    let s = this.heroCache.get(key);
    if (!s) {
      if (this.heroCache.size > 2500) this.heroCache.clear();
      const o = heroPixels(pose, COSTUMES[ci], rar);
      const sk = skeleton(pose).joints;
      s = { c: toCanvas(o), ox: o.ox, oy: o.oy, hand: sk.handF, key };
      this.heroCache.set(key, s);
    }
    return s;
  }

  monsterSprite(e, t) {
    const prog = clamp((e.st || 0) / (e.stDur || 1), 0, 1);
    const f = {
      type: e.type, v: e.var || 0, elite: !!e.elite, state: e.state, k: Math.round(prog * 6) / 6,
      moving: !!e.moving, ph: Math.floor(((e.walk || 0) * 0.16) % 1 * 8) / 8,
      t: Math.floor(((t + (e.seed || 0) * 7) * 8) % 48) / 8, atk: e.atk, enraged: !!e.enraged,
    };
    if (e.type === 'bat') f.ph = Math.floor(((t * 3 + (e.seed || 0)) % 1) * 6) / 6;
    if (e.type === 'slime' || e.type === 'slimeL') f.ph = e.moving ? Math.floor(((t * 1.6 + (e.seed || 0)) % 1) * 8) / 8 : Math.floor(((t * 0.5 + (e.seed || 0)) % 1) * 6) / 6;
    const flip = Math.cos(e.aim || 0) < 0;
    const key = `${f.type}|${f.v}|${f.elite}|${f.state}|${f.k}|${f.moving}|${f.ph}|${ANIM_T.has(e.type) ? f.t : 0}|${f.atk}|${f.enraged}|${flip}`;
    let s = this.monCache.get(key);
    if (!s) {
      if (this.monCache.size > 3000) this.monCache.clear();
      const o = monsterPixels(f, flip);
      s = { c: toCanvas(o), ox: o.ox, oy: o.oy, glows: o.glows, shadowR: o.shadowR, shadowA: o.shadowA, orb: o.orb, key };
      this.monCache.set(key, s);
    }
    return s;
  }

  flashOf(s) {
    let f = this.flashCache.get(s.key);
    if (!f) {
      f = mkCanvas(s.c.width, s.c.height);
      const c = f.getContext('2d');
      c.drawImage(s.c, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = '#fff4e8';
      c.fillRect(0, 0, f.width, f.height);
      if (this.flashCache.size > 400) this.flashCache.clear();
      this.flashCache.set(s.key, f);
    }
    return f;
  }

  // 鈍足中は氷の色に
  iceOf(s) {
    const key = 'i' + s.key;
    let f = this.flashCache.get(key);
    if (!f) {
      f = mkCanvas(s.c.width, s.c.height);
      const c = f.getContext('2d');
      c.drawImage(s.c, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(120,205,255,.45)';
      c.fillRect(0, 0, f.width, f.height);
      this.flashCache.set(key, f);
    }
    return f;
  }

  shadow(x, y, r, a = 0.38) {
    r = Math.max(3, Math.round(r));
    const key = r + '|' + a;
    let c = this.shadowCache.get(key);
    if (!c) {
      const h = Math.max(2, Math.round(r * 0.4));
      c = mkCanvas(r * 2 + 1, h * 2 + 1);
      const cx = c.getContext('2d');
      cx.fillStyle = `rgba(0,0,0,${a})`;
      for (let yy = -h; yy <= h; yy++) for (let xx = -r; xx <= r; xx++) if ((xx * xx) / (r * r) + (yy * yy) / (h * h) <= 1) cx.fillRect(xx + r, yy + h, 1, 1);
      this.shadowCache.set(key, c);
    }
    this.x.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
  }

  // ---------------- エフェクトの呼び出し（ゲームから） ----------------
  slash(p) {
    const it = p.weapon;
    if (!it) return;
    const a = p.aimLock > 0 ? p.lockA : p.aim;
    const left = Math.cos(a) < 0;
    const aff = it.affixes || [];
    const sparks = aff.includes('frost') ? ['#ffffff', '#dcfbff', '#a6ecff', '#62c8f4'] : ['#fff3a6', '#ffe26b', '#ff8a2a', '#f2561d'];
    const o = { flip: left, palette: aff.includes('burn') ? FIRE_RAMP.slice(2) : RARE_RAMP[it.rarity], sparks };
    const X = P(p.x), Y = P(p.y);
    if (it.base === 'axe') {
      // 鎚は地面を叩くので回さず、狙った位置に置く
      this.fx.add(FX.hammerSmash, { ...o, x: X + Math.round(Math.cos(a) * 8), y: Y + Math.round(Math.sin(a) * 26) });
      return;
    }
    const mod = it.base === 'sword' ? FX.swordSlash : it.base === 'dagger' ? FX.doubleSlash : it.base === 'spear' ? FX.thrust : null;
    if (!mod) return;
    // 体の中心を軸に、狙った方向へ回す
    const ang = left ? a + Math.PI : a, h = 20;
    this.fx.add(mod, { ...o, angle: ang, x: X - Math.round(h * Math.sin(ang)), y: Y - h + Math.round(h * Math.cos(ang)), ...(it.base === 'sword' ? { radius: 40 } : {}) });
  }

  vfx(type, d) {
    const L = this.fx;
    switch (type) {
      case 'hit': {
        const pal = RARE_RAMP[d.r || 0];
        L.add(d.c ? FX.critHit : FX.hitSpark, { x: P(d.x), y: P(d.y) + 10, flip: Math.cos(d.a) < 0, palette: d.c ? undefined : ['#4a1712', '#c9281f', '#f2561d', '#ff8a2a', '#ffe26b', '#fff3a6', '#ffffff'], height: 14 });
        if (d.c) L.add(FX.critNumber, { x: P(d.x), y: P(d.y) - 22, text: d.d + '!' });
        else L.add(FX.damageNumber, { x: P(d.x) + Math.round(Math.random() * 8 - 4), y: P(d.y) - 18, text: String(d.d), palette: d.p === this.g.me.id ? undefined : ['#061a1c', '#0b3b34', '#126a6a', '#2aa0a0', '#5ad0d0', '#a0f0f0', '#e0ffff', '#ffffff'] });
        break;
      }
      case 'bash': this.shieldBash(d); break;
      case 'shieldBreak': {
        const x = P(d.x), y = P(d.y);
        L.add(FX.forceField, { x, y, life: 0.45, palette: PFX_PAL.green });
        L.add(FX.shieldBlock, { x, y: y - 8, palette: PFX_PAL.green });
        L.add(FX.collectBurst, { x, y: y - 14, palette: PFX_PAL.green });
        break;
      }
      case 'fireworks': {
        const x = P(d.x), y = P(d.y);
        const pals = [PFX_PAL.gold, PFX_PAL.red, PFX_PAL.blue, PFX_PAL.green, PFX_PAL.violet];
        L.add(FX.bigExplosion ? FX.plasmaExplosion : FX.poof, { x, y: y - 20 });
        for (let i = 0; i < 5; i++) L.add(FX.fireworkBurst, { x: x + Math.round((i - 2) * 56), y: y - 30 - (i % 2) * 40, palette: pals[i] });
        L.add(FX.confetti, { x, y });
        break;
      }
      case 'heavy': {
        const x = P(d.x), y = P(d.y), left = Math.cos(d.a) < 0, pal = RARE_RAMP[d.r || 0];
        const ang = left ? d.a + Math.PI : d.a, h = 20;
        const rx = x - Math.round(h * Math.sin(ang)), ry = y - h + Math.round(h * Math.cos(ang));
        if (d.b === 'sword') { L.add(FX.heavyCleave, { x, y, flip: left, palette: pal }); L.add(FX.swordSlash, { x: rx, y: ry, angle: ang, flip: left, palette: pal, radius: 56 }); }
        else if (d.b === 'dagger') { L.add(FX.daggerFlurry, { x, y, flip: left, palette: pal }); L.add(FX.blinkOut, { x, y, palette: pal }); }
        else if (d.b === 'axe') { L.add(FX.hammerSmash, { x: x + Math.round(Math.cos(d.a) * 10), y: y + Math.round(Math.sin(d.a) * 26), flip: left, palette: pal }); L.add(FX.groundSlam, { x, y }); L.add(FX.dirtExplosion, { x, y }); }
        else if (d.b === 'spear') { L.add(FX.thrust, { x: rx, y: ry, angle: ang, flip: left, palette: pal }); L.add(FX.thrust, { x: rx + Math.round(Math.cos(d.a) * 70), y: ry + Math.round(Math.sin(d.a) * 52), angle: ang, flip: left, palette: pal }); L.add(FX.zapHit, { x, y: y - 14 }); }
        else if (d.b === 'bow') { L.add(FX.zapHit, { x: x + Math.round(Math.cos(d.a) * 22), y: y - 18 + Math.round(Math.sin(d.a) * 18) }); L.add(FX.collectBurst, { x, y: y - 18, palette: pal }); }
        else if (d.b === 'staff') L.add(FX.manaBurst, { x, y });
        if ((d.r || 0) >= 5) L.add(FX.plasmaExplosion, { x: x + Math.round(Math.cos(d.a) * 30), y: y - 12 + Math.round(Math.sin(d.a) * 22), palette: pal });
        break;
      }
      case 'burn':
        L.add(FX.damageNumber, { x: P(d.x), y: P(d.y) - 6, text: String(d.d), palette: FIRE_RAMP.slice(1) });
        break;
      case 'die': {
        const x = P(d.x), y = P(d.y);
        const v = d.v || 0;
        const tint = TINT_RAMP[v];
        if (d.t === 'slime' || d.t === 'slimeL') L.add(FX.sporeBurst, { x, y, palette: tint || ['#3a0e14', '#7a1a24', '#c03030', '#f06050', '#ffb090', '#fff0e0'] });
        else if (d.t === 'mage') L.add(FX.soulRise, { x, y, actor: this.monsterActor('mage', v, d.f), palette: tint || FIRE_RAMP.slice(2) });
        else if (d.t === 'wisp') L.add(FX.smallExplosion, { x, y, palette: tint || undefined });
        else if (ENEMIES[d.t].boss) { L.add(FX.smallExplosion, { x, y, palette: ['#0a3028', '#146050', '#30b090', '#7affd0', '#c0fff0', '#ffffff'] }); L.add(FX.shatterDeath, { x, y, actor: this.monsterActor(d.t, v, d.f), palette: STONE }); }
        else L.add(FX.shatterDeath, { x, y, actor: this.monsterActor(d.t, v, d.f), palette: tint || STONE });
        if (!ENEMIES[d.t].boss) L.add(FX.poof, { x, y });
        break;
      }
      case 'boom': L.add(FX.smallExplosion, { x: P(d.x), y: P(d.y) + 8, palette: d.p ? PFX_PAL[d.p] : undefined }); break;
      case 'whirl': L.add(FX.spinSlash, { x: P(d.x), y: P(d.y) }); break;
      case 'dash': if (d.blink) { L.add(FX.blinkIn, { x: P(d.x), y: P(d.y), actor: EMPTY_ACTOR }); break; } L.add(FX.blinkOut, { x: P(d.x), y: P(d.y), actor: EMPTY_ACTOR, palette: ['#062a26', '#0e5a52', '#1a8a7a', '#3ac0a8', '#7fe8d6', '#c8fff4', '#ffffff'] }); L.add(FX.blinkIn, { x: P(d.x2), y: P(d.y2), actor: EMPTY_ACTOR, palette: ['#062a26', '#0e5a52', '#1a8a7a', '#3ac0a8', '#7fe8d6', '#c8fff4', '#ffffff'] }); break;
      case 'heal': L.add(FX.healAoe, { x: P(d.x), y: P(d.y), layer: 'ground' }); L.add(FX.heal, { x: P(d.x), y: P(d.y) }); break;
      case 'nova': L.add(FX.frostNova, { x: P(d.x), y: P(d.y) }); break;
      case 'chain': {
        const pts = d.pts.map(([x, y]) => [P(x), P(y)]);
        let t = 0;
        L.custom({
          update(dt) { t += dt; },
          done: () => t > 0.4,
          draw(p) {
            const k = 1 - t / 0.4;
            for (let i = 1; i < pts.length; i++) {
              const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
              const n = 6, path = [[x0, y0]];
              for (let s = 1; s < n; s++) path.push([lerp(x0, x1, s / n) + (Math.random() - 0.5) * 8, lerp(y0, y1, s / n) + (Math.random() - 0.5) * 8]);
              path.push([x1, y1]);
              for (let s = 1; s < path.length; s++) {
                p.line(path[s - 1][0], path[s - 1][1], path[s][0], path[s][1], BOLT_W, k);
                p.glowLine(path[s - 1][0], path[s - 1][1], path[s][0], path[s][1], 4, BOLT_C, 0.5 * k);
              }
            }
          },
        });
        for (const [x, y] of pts.slice(1)) L.add(FX.zapHit, { x, y: y + 12 });
        break;
      }
      case 'chest': { const c = this.g.map.chests[d.id]; if (c) L.add(FX.chestOpen, { x: P(c.x), y: P(c.y) + 4 }); break; }
      case 'slam': L.add(FX.groundSlam, { x: P(d.x), y: P(d.y) }); break;
      case 'rock': L.add(FX.heavyLanding, { x: P(d.x), y: P(d.y) }); break;
      case 'eslash': L.add(FX.swordSlash, { x: P(d.x), y: P(d.y), flip: Math.cos(d.a) < 0, radius: 34, palette: ['#2a1814', '#4a302c', '#7a5444', '#b88a6a', '#e8c8a8', '#fff0e0', '#ffffff'] }); break;
      case 'claw': L.add(FX.clawSwipe, { x: P(d.x), y: P(d.y), flip: Math.cos(d.a) < 0 }); break;
      case 'summon': L.add(FX.summonRise, { x: P(d.x), y: P(d.y) }); break;
      case 'level': L.add(FX.levelUp, { x: P(d.x), y: P(d.y) }); break;
      case 'revive': L.add(FX.resurrection, { x: P(d.x), y: P(d.y) }); break;
      case 'hurt': L.add(FX.hitSpark, { x: P(d.x), y: P(d.y), height: 20 }); break;
      case 'block': L.add(FX.shieldBlock, { x: P(d.x), y: P(d.y), flip: d.left }); break;
      case 'pfx': {
        const o = { x: P(d.x), y: P(d.y), flip: !!d.f };
        if (d.p) o.palette = PFX_PAL[d.p];
        if (d.rar) o.palette = RARE_RAMP[d.rar];
        if (d.el) o.palette = ELEMENTS[d.el].ramp;
        if (d.life) o.life = d.life;
        // ループするエフェクトは放っておくと残り続けるので、必ず終わらせる
        else if (FX[d.n].meta.loop) o.life = 1.1;
        if (d.h) o.height = 20;
        if (d.ground) o.layer = 'ground';
        L.add(FX[d.n], o);
        break;
      }
      case 'zone': this.zoneFx(d); break;
      case 'exclaim': L.add(FX.exclamation, { x: P(d.x), y: P(d.y) - 34 }); break;
      case 'charge': L.add(FX.spellCharge, { x: P(d.x), y: P(d.y), palette: FIRE_RAMP.slice(1), life: 0.8 }); break;
      case 'collect': L.add(FX.collectBurst, { x: P(d.x), y: P(d.y) }); break;
    }
  }

  // 床に残るスキルの範囲（氷・茨・花）
  zoneFx(d) {
    const X = P(d.x), Y = P(d.y), rx = d.r * K, ry = rx * 0.72;
    const COL = { ice: ['#dcfbff', '#a6ecff', '#62c8f4', '#3a8bd8'], thorn: ['#c8f070', '#6cb83a', '#86623a', '#46301e'], bloom: ['#ffd8e8', '#ec8ab0', '#c4ec7a', '#52a03e'], acid: ['#e0ff90', '#a0d840', '#5e9a28', '#2e5a1e'] }[d.k].map((c) => hex(c));
    const ring = hex(d.k === 'ice' ? '#a6ecff' : d.k === 'thorn' ? '#6cb83a' : '#ec8ab0');
    const pts = [];
    let sd = (X * 31 + Y * 17) >>> 0;
    const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    for (let i = 0, n = Math.round(rx * ry * 0.09); i < n; i++) {
      const a = rnd() * TAU, q = Math.sqrt(rnd());
      pts.push({ x: X + Math.cos(a) * rx * q, y: Y + Math.sin(a) * ry * q, c: COL[Math.floor(rnd() * 4)], tall: rnd() < 0.3 ? 2 + Math.floor(rnd() * 5) : 0, ph: rnd() * 6 });
    }
    let t = 0;
    const dur = d.dur;
    this.fx.custom({
      layer: 'ground',
      update(dt) { t += dt; },
      done: () => t >= dur,
      draw(p) {
        const fade = Math.min(1, (dur - t) / 0.4) * Math.min(1, t / 0.12);
        for (const q of pts) {
          p.dot(q.x, q.y, q.c, fade);
          for (let h = 1; h <= q.tall; h++) p.dot(q.x, q.y - h, h === q.tall && Math.sin(t * 5 + q.ph) > 0.5 ? COL[0] : q.c, fade);
        }
        for (let a = 0; a < TAU; a += 0.09) p.dot(X + Math.cos(a + t) * rx, Y + Math.sin(a + t) * ry, ring, fade * 0.8);
        p.glow(X, Y, rx, ring, 0.08 * fade);
      },
    });
  }

  // ---------------- 毎フレーム ----------------
  render() {
    const g = this.g, c = this.x, m = g.map, gfx = this.gfx, t = g.time;
    if (!gfx) return;
    const VW = this.VW, VH = this.VH;
    const shake = g.shake * 0.5;
    const camX = Math.round(g.cam.x * K + (Math.random() - 0.5) * shake), camY = Math.round(g.cam.y * K + (Math.random() - 0.5) * shake);
    const left = camX - (VW >> 1), top = camY - (VH >> 1);
    this.left = left; this.top = top;
    this.syncFx();
    this.pendingGlow = [];
    this.fx.update(g.rdt || 1 / 60);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = gfx.pal.void;
    c.fillRect(0, 0, VW, VH);
    c.setTransform(1, 0, 0, 1, -left, -top);
    // 床
    const fx0 = Math.max(0, left), fy0 = Math.max(0, top);
    const fw = Math.min(gfx.floorC.width - fx0, VW + 1), fh = Math.min(gfx.floorC.height - fy0, VH + 1);
    if (fw > 0 && fh > 0) c.drawImage(gfx.floorC, fx0, fy0, fw, fh, fx0, fy0, fw, fh);
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.render(c, left, top, 'ground');
    c.setTransform(1, 0, 0, 1, -left, -top);

    this.drawPlates(t);
    // 攻撃の予兆
    for (const e of g.enemies) this.telegraph(e);
    for (const p of g.projs) if ((p.kind === 'rock' || p.kind === 'acid') && p.tx) {
      c.fillStyle = 'rgba(255,60,40,.22)';
      c.beginPath(); c.ellipse(P(p.tx), P(p.ty), 30, 16, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,90,60,.6)';
      for (let a = 0; a < TAU; a += TAU / 28) c.fillRect(Math.round(P(p.tx) + Math.cos(a) * 30), Math.round(P(p.ty) + Math.sin(a) * 16), 1, 1);
    }
    // 床のちり
    for (const p of g.parts) if (p.kind === 'smoke' && p.z < 6) this.part(p);

    // ---- 奥行き順 ----
    const inView = (x, y) => { const X = P(x), Y = P(y); return X > left - 80 && X < left + VW + 80 && Y > top - 60 && Y < top + VH + 140; };
    const ents = [];
    const players = [g.me, g.ally].filter(Boolean);
    for (const p of players) ents.push({ y: p.y, d: () => this.drawHero(p) });
    for (const e of g.enemies) if (inView(e.x, e.y)) ents.push({ y: e.y, d: () => this.drawMonster(e, t) });
    for (const q of g.pets) if (PETS[q.sp].sprite && inView(q.x, q.y)) ents.push({ y: q.y, d: () => this.drawSummon(q, t) });
    for (const ch of m.chests) if (inView(ch.x, ch.y)) ents.push({ y: ch.y, d: () => this.drawChest(ch) });
    for (const pz of m.puzzles) if (pz.kind === 'riddle' && !pz.done && inView(pz.x, pz.y)) ents.push({ y: pz.y, d: () => this.drawStele(pz, t) });
    for (const dc of this.decor) if (inView(dc.x, dc.y)) ents.push({ y: dc.y, d: () => this.drawDecor(dc, t) });
    for (const M of [m.merchant, m.merchant2 && m.secret.open ? m.merchant2 : null]) if (M && inView(M.x, M.y)) ents.push({ y: M.y, d: () => this.drawNpc(M, t) });
    if (m.secret && !m.secret.open && inView(m.secret.dx, m.secret.dy)) ents.push({ y: m.secret.dy, d: () => this.drawDoor(m.secret, t) });
    for (const L of g.loot) if (inView(L.dx, L.dy)) ents.push({ y: L.dy, d: () => this.drawLoot(L, t) });
    for (const p of g.projs) if ((p.kind === 'rock' || p.kind === 'acid') && inView(p.x, p.y)) ents.push({ y: p.y, d: () => this.drawRock(p, t) });
    for (const p of g.parts) if (!p.glow && !(p.kind === 'smoke' && p.z < 6)) ents.push({ y: p.y, d: () => this.part(p) });
    ents.sort((a, b) => a.y - b.y);
    const r0 = Math.max(0, Math.floor(top / TP) - 1), r1 = Math.min(m.H - 1, Math.floor((top + VH + WHP) / TP) + 1);
    const sx0 = Math.max(0, left), sw = Math.min(m.W * TP - sx0, VW + 1);
    if (!this.torchRows || this.torchRowsMap !== m) {
      this.torchRowsMap = m;
      this.torchRows = new Map();
      for (const tc of m.torches) { if (!this.torchRows.has(tc.row)) this.torchRows.set(tc.row, []); this.torchRows.get(tc.row).push(tc); }
    }
    let ei = 0;
    while (ei < ents.length && ents[ei].y < r0 * T) ents[ei++].d();
    const tf = this.torch.frames[Math.floor((t / this.torch.D) * this.torch.frames.length) % this.torch.frames.length];
    for (let r = r0; r <= r1; r++) {
      const lim = (r + 1) * T;
      while (ei < ents.length && ents[ei].y < lim) ents[ei++].d();
      const s = gfx.strips[r];
      if (s && sw > 0) c.drawImage(s, sx0, 0, sw, TP + WHP, sx0, r * TP - WHP, sw, TP + WHP);
      const ts = this.torchRows.get(r);
      if (ts) for (const tc of ts) c.drawImage(tf, P(tc.x) - this.torch.ox, (r + 1) * TP - 12 - this.torch.oy);
    }
    while (ei < ents.length) ents[ei++].d();

    // ---- 光 ----
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.renderLights(left, top);
    c.globalCompositeOperation = 'multiply';
    c.drawImage(this.lightC, 0, 0);
    c.globalCompositeOperation = 'source-over';

    // ---- 光る部分とエフェクト ----
    c.globalCompositeOperation = 'lighter';
    c.setTransform(1, 0, 0, 1, -left, -top);
    for (const e of g.enemies) if (e._glows) for (const gl of e._glows) this.glowDot(gl.x, gl.y, gl.r, gl.col, gl.k);
    for (const p of players) if (p._lan && !p.down) { this.glowDot(p._lan.x, p._lan.y, 9, '#ffc060', 0.9); this.glowDot(p._lan.x, p._lan.y, 3, '#ffffff', 0.9); }
    for (const tc of m.torches) if (inView(tc.x, tc.y)) this.glowDot(P(tc.x), (Math.floor(tc.y / T) + 1) * TP - 26, 18 + Math.sin(t * 9 + tc.x) * 2, '#ff8a2a', 0.35);
    for (const [gx, gy, gr, gc, gk] of this.pendingGlow) this.glowDot(gx, gy, gr, gc, gk);
    for (const p of g.parts) if (p.glow) this.part(p);
    c.globalCompositeOperation = 'source-over';
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.render(c, left, top, 'front');

    // ---- 小さな体力ゲージ ----
    c.setTransform(1, 0, 0, 1, -left, -top);
    for (const e of g.enemies) {
      if (!inView(e.x, e.y) || ENEMIES[e.type].boss || e.hp >= e.maxHp) continue;
      const h = { slime: 30, slimeL: 42, bat: 52, skel: 48, mage: 52, hound: 36, wisp: 42, thorn: 46, toad: 32, beetle: 34, shade: 50 }[e.type] * (e.elite ? 1.12 : 1);
      const w = e.elite ? 22 : 16, X = P(e.x) - (w >> 1), Y = P(e.y) - Math.round(h);
      c.fillStyle = '#140f1c'; c.fillRect(X - 1, Y - 1, w + 2, 4);
      c.fillStyle = '#3a1418'; c.fillRect(X, Y, w, 2);
      c.fillStyle = e.elite ? '#ffb040' : '#e8483a'; c.fillRect(X, Y, Math.round(w * Math.max(0, e.hp / e.maxHp)), 2);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  // 低解像度の絵を画面に拡大して、文字など画面解像度の物を重ねる
  present() {
    const g = this.g, c = g.ctx, s = this.s;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.pc, 0, 0, this.VW * s, this.VH * s);
    c.drawImage(this.vignette, 0, 0);
    // 天気と画面切り替え
    const stretch = { drawImage: (cv) => { c.drawImage(cv, 0, 0, this.VW * s, this.VH * s); } };
    this.wx.update(g.rdt || 1 / 60);
    c.globalAlpha = WEATHER_A[g.map.weather] ?? 0.9;
    this.wx.render(stretch, 0, 0, 'front');
    c.globalAlpha = 1;
    if (this.tr.list.length) { this.tr.update(g.rdt || 1 / 60); this.tr.render(stretch, 0, 0, 'front'); }
    const sx = (wx) => (P(wx) - this.left) * s, sy = (wy) => (P(wy) - this.top) * s;
    c.textAlign = 'center';
    c.lineJoin = 'round';
    if (g.ally) {
      const a = g.ally;
      c.font = `700 ${Math.round(11 * g.dpr)}px "Zen Kaku Gothic New", sans-serif`;
      c.lineWidth = 3 * g.dpr; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(a.name, sx(a.x), sy(a.y) - 50 * s);
      c.fillStyle = a.pal.name; c.fillText(a.name, sx(a.x), sy(a.y) - 50 * s);
      if (a.down) {
        const k = g.me.revive / 2.2;
        c.lineWidth = 3 * g.dpr;
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(sx(a.x), sy(a.y) - 20 * s, 12 * s, 0, TAU); c.stroke();
        c.strokeStyle = '#9fe6a0'; c.beginPath(); c.arc(sx(a.x), sy(a.y) - 20 * s, 12 * s, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
        if (k <= 0) { c.font = `600 ${Math.round(10 * g.dpr)}px "Zen Kaku Gothic New", sans-serif`; c.fillStyle = '#9fe6a0'; c.fillText('近くに立って蘇生', sx(a.x), sy(a.y) + 10 * s); }
      }
    }
    if (g.me.down && g.ally) {
      const k = (g.ally.revive || 0) / 2.2;
      if (k > 0) { c.strokeStyle = '#9fe6a0'; c.lineWidth = 3 * g.dpr; c.beginPath(); c.arc(sx(g.me.x), sy(g.me.y) - 20 * s, 12 * s, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke(); }
    }
    // 重撃の溜めゲージ
    if (g.isCharging()) {
      const pr = Math.min(1, g.me.holdT / g.chargeTime()), ready = pr >= 1;
      c.lineWidth = 3 * g.dpr; c.strokeStyle = 'rgba(0,0,0,.6)';
      c.beginPath(); c.arc(sx(g.me.x), sy(g.me.y) - 34 * s, 9 * s, 0, TAU); c.stroke();
      c.strokeStyle = ready ? '#ffffff' : '#ffb040';
      c.beginPath(); c.arc(sx(g.me.x), sy(g.me.y) - 34 * s, 9 * s, -Math.PI / 2, -Math.PI / 2 + TAU * pr); c.stroke();
    }
    if (g.portal && g.portalT > 0) {
      const pp = g.portalPos();
      c.strokeStyle = 'rgba(160,240,255,.9)'; c.lineWidth = 3 * g.dpr;
      c.beginPath(); c.arc(sx(pp.x), sy(pp.y) - 30 * s, 16 * s, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, g.portalT / 1.3)); c.stroke();
    }
    for (const tx of g.texts) {
      const k = tx.t / tx.dur;
      c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      c.font = `800 ${Math.round(tx.size * g.dpr)}px "Zen Kaku Gothic New", sans-serif`;
      c.lineWidth = 4 * g.dpr; c.strokeStyle = 'rgba(20,10,10,.85)';
      c.strokeText(tx.s, sx(tx.x), sy(tx.y));
      c.fillStyle = tx.c; c.fillText(tx.s, sx(tx.x), sy(tx.y));
    }
    c.globalAlpha = 1;
  }

  // ゲームの状態に合わせて、続くエフェクト（弾・状態異常・宝の光・盾・転移陣）を付け外しする
  syncFx() {
    const g = this.g, L = this.fx;
    // 弾
    const live = new Set();
    for (const p of g.projs) {
      live.add(p.id);
      if (this.projFx.has(p.id) || p.kind === 'rock' || p.kind === 'acid') continue;
      const follow = () => (g.projs.includes(p) ? { x: P(p.x), y: P(p.y) - (p.kind === 'arrow' ? 12 : 14), angle: Math.cos(Math.atan2(p.vy, p.vx)) < 0 ? Math.atan2(p.vy, p.vx) + Math.PI : Math.atan2(p.vy, p.vx), flip: Math.cos(Math.atan2(p.vy, p.vx)) < 0 } : null);
      let fx;
      if (p.kind === 'arrow') fx = L.add(FX.arrow, { follow, ...follow(), palette: p.rar >= 2 ? [RARE_RAMP[p.rar][2], RARE_RAMP[p.rar][4], '#e8e2d6', '#ffffff'] : undefined });
      else if (p.kind === 'fireball') fx = L.add(FX.fireball, { follow, ...follow(), radius: 5 });
      else if (p.kind === 'bluefire') fx = L.add(FX.fireball, { follow, ...follow(), radius: 6, palette: PFX_PAL.blue });
      else if (p.kind === 'bolt') fx = L.add(FX.plasmaShot, { follow, ...follow(), palette: RARE_RAMP[Math.max(2, p.rar || 0)].concat(['#ffffff']), size: 4 });
      else if (p.kind === 'lance') fx = L.add(FX.iceLance, { follow, ...follow() });
      else if (p.kind === 'eorb') fx = L.add(FX.plasmaShot, { follow, ...follow(), palette: FIRE_RAMP.slice(1), size: 4 });
      else if (p.kind === 'orb') fx = L.add(FX.arcaneOrb, { follow: () => (g.projs.includes(p) ? { x: P(p.x), y: P(p.y) + 8 } : null), x: P(p.x), y: P(p.y) + 8 });
      else if (p.kind === 'void') fx = L.add(FX.voidOrb, { follow: () => (g.projs.includes(p) ? { x: P(p.x), y: P(p.y) + 8 } : null), x: P(p.x), y: P(p.y) + 8 });
      else if (p.kind === 'uwave') fx = L.add(FX.plasmaShot, { follow, ...follow(), palette: RARE_RAMP[p.rar || 5], size: 9 });
      else if (p.kind === 'ethorn') fx = L.add(FX.plasmaShot, { follow, ...follow(), palette: PFX_PAL.green, size: 4 });
      else if (p.kind === 'evoid') fx = L.add(FX.plasmaShot, { follow, ...follow(), palette: PFX_PAL.violet, size: 4 });
      if (fx) this.projFx.set(p.id, fx);
    }
    for (const [id, fx] of this.projFx) if (!live.has(id)) { fx.stop(); this.projFx.delete(id); }
    // 敵の状態異常
    const seen = new Set();
    for (const e of g.enemies) {
      const body = () => this.monsterActor(e.type, e.var, Math.cos(e.aim || 0) < 0);
      for (const [kind, on, mod] of [['b', e.burn > 0, FX.burning], ['r', !!e.enraged, FX.rage], ['t', e.stun > 0, FX.stunned], ['m', e.mark > 0, FX.cursed]]) {
        const key = e.id + kind;
        if (!on) continue;
        seen.add(key);
        if (!this.statusFx.has(key)) {
          this.statusFx.set(key, L.add(mod, { actor: body(), follow: () => (g.enemies.includes(e) ? { x: P(e.x), y: P(e.y) } : null), x: P(e.x), y: P(e.y) }));
        }
      }
    }
    for (const [k, fx] of this.statusFx) if (!seen.has(k)) { fx.stop(); this.statusFx.delete(k); }
    // ペットと召喚獣：pixelfx の生き物を属性の色で
    const petSeen = new Set();
    for (const q of g.pets) {
      petSeen.add(q.id);
      if (this.petFx.has(q.id)) continue;
      if (!PETS[q.sp].fx) continue; // 魔物の絵を使う召喚は別に描く
      const mod = FX[PETS[q.sp].fx], follow = () => (g.pets.includes(q) ? { x: P(q.x), y: P(q.y), flip: !!q.flip } : null);
      this.petFx.set(q.id, L.add(mod, { follow, ...follow(), palette: PETS[q.sp].keepColor ? undefined : ELEMENTS[q.el].ramp }));
    }
    for (const [id, fx] of this.petFx) if (!petSeen.has(id)) { fx.stop(); this.petFx.delete(id); }
    // 神話と唯一の武器は常に光をまとう
    [g.me, g.ally].forEach((p, i) => {
      if (!p) return;
      const r = p.weapon ? p.weapon.rarity : 0, cur = this.auraFx.get(i);
      if (cur && cur.r !== r) { cur.list.forEach((f) => f.stop()); this.auraFx.delete(i); }
      if (r >= 5 && !this.auraFx.has(i)) {
        const at = (dy) => () => ({ x: P(p.x), y: P(p.y) + dy });
        const pal = RARE_RAMP[r], list = [L.add(FX.runeCircle, { follow: at(2), ...at(2)(), palette: pal, layer: 'ground' }), L.add(FX.sparkArc, { follow: at(-16), ...at(-16)(), palette: pal })];
        if (r === 6) {
          list.push(L.add(FX.halo, { follow: at(-44), ...at(-44)(), palette: pal }));
          list.push(L.add(FX.sparkArc, { follow: at(-34), ...at(-34)(), palette: pal, flip: true }));
        }
        this.auraFx.set(i, { r, list });
      }
    });
    // 重撃の溜め
    const charging = g.isCharging && g.me.weapon && g.isCharging();
    if (charging && !this.chargeFx) {
      const pal = RARE_RAMP[g.me.weapon.rarity];
      this.chargeFx = L.add(FX.spellCharge, { follow: () => ({ x: P(g.me.x), y: P(g.me.y) - 18 }), x: P(g.me.x), y: P(g.me.y) - 18, palette: pal });
      this.chargeDone = false;
    }
    if (!charging && this.chargeFx) { this.chargeFx.stop(); this.chargeFx = null; }
    if (charging && !this.chargeDone && g.chargeReady()) { this.chargeDone = true; L.add(FX.collectBurst, { x: P(g.me.x), y: P(g.me.y) - 18, palette: RARE_RAMP[g.me.weapon.rarity] }); sfx('level'); }
    // 宝の光
    const lootSeen = new Set();
    for (const Lt of g.loot) {
      const it = Lt.item;
      const want = LOOT_FX[it.cat] || (it.cat === 'heal' ? 'heart' : (it.rarity || 0) >= 2 ? 'beam' : null);
      if (!want) continue;
      lootSeen.add(Lt.id);
      if (this.lootFx.has(Lt.id)) continue;
      const follow = () => (g.loot.includes(Lt) ? { x: P(Lt.dx), y: P(Lt.dy) - Math.round(Lt.z * 0.6) } : null);
      const pal = RARE_RAMP[it.rarity || 0].slice(0, 5);
      this.lootFx.set(Lt.id, LOOT_FX[it.cat] ? L.add(FX[want], { follow, ...follow() }) : want === 'heart' ? L.add(FX.heartPickup, { follow, ...follow() }) : L.add(FX.lootBeam, { follow, ...follow(), palette: pal, light: 0.35, layer: 'front' }));
    }
    for (const [id, fx] of this.lootFx) if (!lootSeen.has(id)) { fx.stop(); this.lootFx.delete(id); }
    // 盾
    [g.me, g.ally].forEach((p, i) => {
      const on = p && p.shield > 0 && !p.down;
      if (on && !this.shieldFx[i]) this.shieldFx[i] = L.add(FX.divineShield, { palette: ['#0e2a12', '#1e5a28', '#3a8a46', '#6ac078', '#9fe6a0', '#d8ffd8', '#ffffff'], radius: 24, follow: () => (p.shield > 0 && !p.down ? { x: P(p.x), y: P(p.y) } : null), x: P(p.x), y: P(p.y) });
      if (!on && this.shieldFx[i]) { this.shieldFx[i].stop(); this.shieldFx[i] = null; }
    });
    // 転移陣
    if (g.portal && !this.portalFx) {
      const pp = g.portalPos();
      this.portalFx = L.add(FX.portal, { x: P(pp.x), y: P(pp.y) + 4, palette: ['#04141c', '#0a2e40', '#145a78', '#2a8ab0', '#5ad0ff', '#a8ecff', '#e8fbff', '#ffffff'] });
    }
    if (g.portal && !this.dimFx && g.dimPortalPos()) {
      const pd = g.dimPortalPos();
      this.dimFx = L.add(FX.portal, { x: P(pd.x), y: P(pd.y) + 4, palette: ['#100420', '#2a0e4a', '#4e1c88', '#7a34c0', '#a860f0', '#d0a0ff', '#f0e0ff', '#ffffff'] });
    }
  }

  // 盾打ち：大きな盾を構えて前へ叩きつける
  shieldBash(d) {
    const ca = Math.cos(d.a), sa = Math.sin(d.a), who = d.p === this.g.me.id ? this.g.me : this.g.ally;
    const X0 = () => (who ? P(who.x) : P(d.x)), Y0 = () => (who ? P(who.y) : P(d.y));
    const H0 = hex;
    const COL = { ink: H0('#140f1c'), rim: H0('#e8c060'), rimD: H0('#8a6428'), hi: H0('#c8d8ec'), mid: H0('#7f96b8'), lo: H0('#47597c'), em: H0('#d84a3a'), emL: H0('#ff8a6a'), w: H0('#ffffff') };
    const body = (w, h) => [[-w, -h], [w, -h], [w, h * 0.25], [w * 0.55, h * 0.72], [0, h], [-w * 0.55, h * 0.72], [-w, h * 0.25]];
    let t = 0, hit = false;
    const L = this.fx, g = this.g;
    L.custom({
      update(dt) {
        t += dt;
        if (!hit && t >= 0.2) {
          hit = true;
          const ix = X0() + Math.round(ca * 40), iy = Y0() + Math.round(sa * 30);
          L.add(FX.shieldBlock, { x: ix, y: iy - 10, flip: ca < 0 });
          L.add(FX.groundSlam, { x: ix, y: iy + 6 });
          L.add(FX.critHit, { x: ix, y: iy, height: 16, flip: ca < 0 });
          g.hitstop = Math.max(g.hitstop, 0.06);
        }
      },
      done() { return t > 0.62; },
      draw(p) {
        const push = t < 0.14 ? -8 * (t / 0.14) : t < 0.2 ? -8 + 46 * ((t - 0.14) / 0.06) : 38 - (t - 0.2) * 22;
        const k = t < 0.14 ? 0.8 + t * 1.4 : t < 0.2 ? 1 + (t - 0.14) * 7 : 1.42 - (t - 0.2) * 0.7;
        const cx = X0() + ca * push, cy = Y0() - 18 + sa * push * 0.75;
        const a = t > 0.42 ? Math.max(0, 1 - (t - 0.42) / 0.2) : 1;
        const flash = t >= 0.2 && t < 0.26;
        const W = 15 * k, Hh = 20 * k;
        const shape = (w, h) => body(w, h).map(([x, y]) => [cx + x, cy + y]);
        p.poly(shape(W + 1.5, Hh + 1.5), COL.ink, a);
        p.poly(shape(W, Hh), flash ? COL.w : COL.rim, a);
        p.poly(shape(W - 2 * k, Hh - 2 * k), flash ? COL.w : COL.mid, a);
        if (!flash) {
          p.poly(body(W - 2 * k, Hh - 2 * k).filter(([x]) => x <= 0).map(([x, y]) => [cx + x, cy + y]), COL.hi, a);
          p.rect(cx - 1.5 * k, cy - Hh + 3 * k, 3 * k, Hh * 1.55, COL.em, a);
          p.rect(cx - W + 3 * k, cy - Hh * 0.35, (W - 3 * k) * 2, 3 * k, COL.em, a);
          p.circle(cx, cy - Hh * 0.2, 2.6 * k, COL.rim, a);
          p.circle(cx - 0.6 * k, cy - Hh * 0.2 - 0.6 * k, 1 * k, COL.w, a);
        }
        p.glow(cx, cy, 16 * k, flash ? COL.w : COL.rim, flash ? 0.9 : 0.25);
      },
    });
  }

  telegraph(e) {
    if (e.state !== 'wind') return;
    const c = this.x, p = clamp(e.st / (e.stDur || 1), 0, 1);
    const X = P(e.x), Y = P(e.y);
    const dots = (pts, col) => { c.fillStyle = col; for (const [x, y] of pts) c.fillRect(Math.round(x), Math.round(y), 1, 1); };
    if (e.type === 'skel' || e.type === 'shade') {
      const R = 52, arc = 1.7;
      c.fillStyle = `rgba(255,50,40,${0.1 + p * 0.14})`;
      c.beginPath(); c.moveTo(X, Y); c.arc(X, Y, R * p, e.aim - arc / 2, e.aim + arc / 2); c.closePath(); c.fill();
      const pts = [];
      for (let a = -arc / 2; a <= arc / 2; a += 0.04) pts.push([X + Math.cos(e.aim + a) * R, Y + Math.sin(e.aim + a) * R]);
      dots(pts, 'rgba(255,90,70,.8)');
    } else if (ENEMIES[e.type].dash || e.atk === 'charge') {
      const L = { bat: 105, hound: 100, beetle: 215, behemoth: 400 }[e.type] || 82, w = { slimeL: 12, beetle: 12, behemoth: 28 }[e.type] || 7;
      c.save(); c.translate(X, Y); c.rotate(e.aim);
      c.fillStyle = `rgba(255,60,40,${0.08 + p * 0.16})`;
      c.fillRect(0, -w, L * p, w * 2);
      c.fillStyle = 'rgba(255,90,70,.6)';
      for (let i = 0; i < L; i += 3) { c.fillRect(i, -w, 1, 1); c.fillRect(i, w, 1, 1); }
      c.restore();
    } else if (e.atk === 'slam' || e.atk === 'leap' || e.type === 'wisp') {
      const leap = e.atk === 'leap', RX = leap ? 94 : e.type === 'wisp' ? 64 : 110, RY = RX * 0.6, CX = leap ? P(e.lx) : X, CY = leap ? P(e.ly) : Y;
      c.fillStyle = `rgba(255,50,40,${0.08 + p * 0.18})`;
      c.beginPath(); c.ellipse(CX, CY, RX * p, RY * p, 0, 0, TAU); c.fill();
      const pts = [];
      for (let a = 0; a < TAU; a += 0.02) pts.push([CX + Math.cos(a) * RX, CY + Math.sin(a) * RY]);
      dots(pts, 'rgba(255,90,70,.8)');
    }
  }

  drawPlates(t) {
    const g = this.g, c = this.x;
    for (const pz of g.map.puzzles) {
      if (pz.kind !== 'plates' || pz.done) continue;
      const multi = !!g.ally, plates = multi ? pz.plates.slice(0, 2) : pz.plates;
      // 一人のときは、光る順番を繰り返し見せる
      const hint = !multi ? pz.seq[Math.floor(t / 0.7) % 4] : -1;
      plates.forEach((q, i) => {
        const X = P(q.x), Y = P(q.y), lit = (pz.lit || []).includes(i), show = lit || hint === i;
        c.fillStyle = '#1c1820'; c.beginPath(); c.ellipse(X, Y, 17, 11, 0, 0, TAU); c.fill();
        c.fillStyle = show ? '#ffd27a' : '#5a5462'; c.beginPath(); c.ellipse(X, Y - 1, 15, 9, 0, 0, TAU); c.fill();
        c.fillStyle = show ? '#fff6d0' : '#3a3644'; c.fillRect(X - 5, Y - 2, 10, 2); c.fillRect(X - 1, Y - 6, 2, 10);
        if (show) this.pendingGlow.push([X, Y, 24, '#ffd27a', 0.7]);
      });
    }
  }

  drawStele(pz, t) {
    const s = steleSprite();
    this.shadow(P(pz.x), P(pz.y) + 1, 11);
    this.x.drawImage(s, P(pz.x) - (s.width >> 1), P(pz.y) - s.height);
    this.pendingGlow.push([P(pz.x), P(pz.y) - 18, 16 + Math.sin(t * 3) * 2, '#7fd0ff', 0.6]);
  }

  drawHero(p) {
    const c = this.x;
    const X = P(p.x), Y = P(p.y);
    this.shadow(X, Y + 1, 9);
    const s = this.heroSprite(p);
    const blink = p.inv > 0 && !p.dodgeT && !p.dashT && Math.floor(this.g.time * 20) % 2;
    if (blink) c.globalAlpha = 0.5;
    c.drawImage(p.flash > 0 ? this.flashOf(s) : s.c, X + s.ox, Y + s.oy);
    c.globalAlpha = 1;
    // 灯（ランタン）：後ろの手から吊るす
    if (!p.down && s.hand) {
      const hx = X + Math.round(s.hand[0]), hy = Y + Math.round(s.hand[1]);
      const sw = Math.round(Math.sin(p.lanAng || 0) * 3);
      const lx = hx + sw, ly = hy + 4;
      c.fillStyle = '#140f1c'; c.fillRect(hx, hy, 1, 3);
      c.fillRect(lx - 3, ly - 1, 7, 9);
      c.fillStyle = '#3a3040'; c.fillRect(lx - 2, ly - 1, 5, 1); c.fillRect(lx - 2, ly + 6, 5, 1);
      c.fillStyle = '#ffd27a'; c.fillRect(lx - 2, ly, 5, 6);
      c.fillStyle = '#fff6d0'; c.fillRect(lx - 1, ly + 1, 2, 3);
      c.fillStyle = '#f08a2a'; c.fillRect(lx - 2, ly + 5, 5, 1);
      c.fillStyle = '#140f1c'; c.fillRect(lx, ly, 1, 6);
      p._lan = { x: lx + 0.5, y: ly + 3 };
    }
  }

  // 味方になった魔物。蒼い色で敵と見分ける
  drawSummon(q, t) {
    const moved = Math.hypot(q.x - (q.lx ?? q.x), q.y - (q.ly ?? q.y));
    q.moving = moved > 0.2; q.walk = (q.walk || 0) + moved * 0.09; q.lx = q.x; q.ly = q.y;
    const s = this.monsterSprite({ type: PETS[q.sp].sprite, var: 1, state: 'chase', st: 0, stDur: 1, moving: q.moving, walk: q.walk, aim: q.flip ? Math.PI : 0, seed: (q.id * 0.618) % 1 }, t);
    this.shadow(P(q.x), P(q.y) + 1, s.shadowR, s.shadowA);
    this.x.drawImage(s.c, P(q.x) + s.ox, P(q.y) + s.oy);
  }

  drawMonster(e, t) {
    const c = this.x;
    const s = this.monsterSprite(e, t);
    const X = P(e.x), Y = P(e.y);
    if (e.elite) { c.fillStyle = 'rgba(255,190,80,.25)'; c.beginPath(); c.ellipse(X, Y, s.shadowR * 1.6, s.shadowR * 0.6, 0, 0, TAU); c.fill(); }
    this.shadow(X, Y + 1, s.shadowR, s.shadowA);
    c.drawImage(e.flash > 0 ? this.flashOf(s) : e.slow > 0 ? this.iceOf(s) : s.c, X + s.ox, Y + s.oy);
    e._glows = s.glows.map((gl) => ({ ...gl, x: X + gl.x, y: Y + gl.y }));
    e._orb = s.orb ? { x: X + s.orb[0], y: Y + s.orb[1], k: s.orb[2] } : null;
  }

  drawChest(ch) {
    if (ch.open) return; // 開いた後は開封エフェクトが描き、終わると消える
    const img = ch.gold ? this.chestImg.gold : this.chestImg.closed;
    this.x.drawImage(img, P(ch.x) - 88, P(ch.y) + 4 - 96);
  }

  drawNpc(M, t) {
    const c = this.x, X = P(M.x), Y = P(M.y);
    const tk = Math.floor(t * 4) / 4 % 12;
    const o = monsterPixels({ type: 'merchant', v: 0, state: 'idle', k: 0, ph: 0, t: tk, moving: false }, false);
    this.shadow(X, Y, 12, 0.38);
    c.drawImage(toCanvas(o), X + o.ox, Y + o.oy);
  }
  drawDoor(s, t) {
    const c = this.x, X = P(s.dx), Y = P(s.dy);
    // 石壁にはめ込まれた古い木の扉と、光る鍵穴
    c.fillStyle = '#140f1c'; c.fillRect(X - 13, Y - 34, 26, 34);
    c.fillStyle = '#6e4a2a'; c.fillRect(X - 11, Y - 32, 22, 32);
    c.fillStyle = '#4a2f1c'; for (const x of [-6, 0, 6]) c.fillRect(X + x, Y - 32, 1, 32);
    c.fillStyle = '#8a8fa0'; c.fillRect(X - 11, Y - 26, 22, 2); c.fillRect(X - 11, Y - 10, 22, 2);
    c.fillStyle = Math.sin(t * 4) > 0 ? '#ffe680' : '#ffb040'; c.fillRect(X - 1, Y - 18, 3, 3); c.fillRect(X, Y - 15, 1, 3);
  }

  drawLoot(L, t) {
    const c = this.x, it = L.item;
    const X = P(L.dx), Y = P(L.dy);
    if (NO_LOOT_ICON.includes(it.cat)) return;
    const bob = Math.round(Math.sin(t * 3 + L.seed) * 1.5 + 5 + L.z * 0.6);
    this.shadow(X, Y, 6, 0.3);
    if (it.cat === 'weapon') {
      const w = weaponSprite(it.base, it.rarity);
      c.drawImage(w, X - (w.width >> 1), Y - bob - (w.height >> 1) - 4);
    } else if (it.cat === 'egg') {
      if (!this.eggC) { const m = FX.eggHatch; this.eggC = bake(m, {}, 0.05, m.meta.size[0], m.meta.size[1], m.meta.origin[0], m.meta.origin[1]); }
      c.drawImage(this.eggC, X - FX.eggHatch.meta.origin[0], Y - bob - FX.eggHatch.meta.origin[1]);
    } else if (it.cat === 'gear') {
      const gs = gearSprite(it.slot, it.rarity);
      c.drawImage(gs, X - (gs.width >> 1), Y - bob - gs.height);
    } else {
      const sc = scrollSprite();
      c.drawImage(sc, X - (sc.width >> 1), Y - bob - sc.height);
    }
  }

  drawRock(p, t) {
    const c = this.x, X = P(p.x), Y = P(p.y), z = Math.round((p.z || 0) * K);
    this.shadow(X, Y, 8, 0.35);
    if (p.kind === 'acid') {
      // 酸の塊：二段の円でぷるぷる揺らす
      const w = 5 + Math.round(Math.sin(t * 18));
      c.fillStyle = '#1e3a10'; c.fillRect(X - w - 1, Y - z - 9, w * 2 + 2, 9);
      c.fillStyle = '#8ad040'; c.fillRect(X - w, Y - z - 8, w * 2, 7);
      c.fillStyle = '#e0ff90'; c.fillRect(X - w + 2, Y - z - 7, 3, 2);
      return;
    }
    const r = rockSprite(Math.floor(t * 10) % 4);
    c.drawImage(r, X - (r.width >> 1), Y - z - r.height);
  }

  part(p) {
    const c = this.x, k = p.life / p.max;
    const X = Math.round(p.x * K), Y = Math.round((p.y - p.z) * K);
    if (p.kind === 'smoke') {
      c.fillStyle = rgba(p.col, 0.3 * k);
      const s = Math.max(1, Math.round(p.size * K * (1.4 - k * 0.5)));
      c.fillRect(X - (s >> 1), Y - (s >> 1), s, s);
    } else {
      c.fillStyle = rgba(p.col, p.glow ? k : Math.min(1, k * 2));
      const s = p.size > 3 ? 2 : 1;
      c.fillRect(X, Y, s, s);
    }
  }

  glowDot(x, y, r, col, k = 1) {
    const c = this.x;
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(col, 0.55 * k)); gr.addColorStop(1, rgba(col, 0));
    c.fillStyle = gr;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  renderLights(left, top) {
    const l = this.lx, g = this.g, m = g.map, t = g.time;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = m.theme.ambient;
    l.fillRect(0, 0, this.VW, this.VH);
    l.globalCompositeOperation = 'lighter';
    const Lt = (x, y, r, col, a = 1) => {
      const X = x - left, Y = y - top;
      if (X < -r || Y < -r || X > this.VW + r || Y > this.VH + r) return;
      l.globalAlpha = a;
      l.drawImage(lightSprite(col), X - r, Y - r, r * 2, r * 2);
    };
    for (const p of [g.me, g.ally]) {
      if (!p) continue;
      const lx = p._lan ? p._lan.x : P(p.x), ly = p._lan ? p._lan.y : P(p.y) - 16;
      const fl = 1 + Math.sin(t * 11 + p.id) * 0.02 + Math.sin(t * 27) * 0.015;
      Lt(lx, ly, (p.down ? 100 : 225) * fl, '#ffcf90', 1);
      Lt(lx, ly, 80 * fl, '#fff0d8', 0.6);
      Lt(P(p.x), P(p.y), 360, '#3a3248', 0.35);
    }
    for (const tc of m.torches) { const f = 1 + Math.sin(t * 9 + tc.x) * 0.05 + Math.sin(t * 21 + tc.y) * 0.04; Lt(P(tc.x), (Math.floor(tc.y / T) + 1) * TP, 175 * f, '#ff9a48', 0.95); }
    for (const dc of this.decor) Lt(P(dc.x), P(dc.y) - 14, dc.r, dc.col, 0.8);
    if (g.portal) { const pp = g.portalPos(); Lt(P(pp.x), P(pp.y) - 20, 190, '#5ad0ff', 0.9); }
    for (const p of g.projs) {
      if (p.kind === 'fireball') Lt(P(p.x), P(p.y) - 12, 120, '#ff8a3a', 1);
      else if (p.kind === 'bluefire') Lt(P(p.x), P(p.y) - 12, 120, '#5ab0ff', 1);
      else if (p.kind === 'bolt') Lt(P(p.x), P(p.y) - 12, 85, '#7fc8ff', 0.8);
      else if (p.kind === 'eorb') Lt(P(p.x), P(p.y) - 12, 80, '#ff8a3a', 0.8);
      else if (p.kind === 'orb' || p.kind === 'void') Lt(P(p.x), P(p.y) - 12, 110, '#c080ff', 0.9);
      else if (p.kind === 'uwave') Lt(P(p.x), P(p.y) - 12, 110, RARITY[p.rar || 5].color, 0.9);
      else if (p.kind === 'ethorn') Lt(P(p.x), P(p.y) - 12, 70, '#9fe6a0', 0.7);
      else if (p.kind === 'evoid') Lt(P(p.x), P(p.y) - 12, 80, '#c7b8f5', 0.8);
    }
    for (const q of g.pets) Lt(P(q.x), P(q.y) - 16, 60, ELEMENTS[q.el].color, 0.5);
    { const M = m.merchant || (m.merchant2 && m.secret.open ? m.merchant2 : null); if (M) Lt(P(M.x), P(M.y) - 24, 120, '#ffd27a', 0.7); }
    { const pd = g.portal && g.dimPortalPos(); if (pd) Lt(P(pd.x), P(pd.y) - 20, 190, '#a860f0', 0.9); }
    if (m.secret && !m.secret.open) Lt(P(m.secret.dx), P(m.secret.dy) - 14, 46, '#ffd27a', 0.4);
    if (m.secret && m.secret.open) Lt(P(m.secret.cx), P(m.secret.cy), 170, '#ffd27a', 0.5);
    for (const e of g.enemies) {
      if (e._orb) Lt(e._orb.x, e._orb.y, 50 + e._orb.k * 40, '#ff9a48', 0.7);
      if (e.type === 'mage') Lt(P(e.x), P(e.y) - 45, 70, '#ffb060', 0.6);
      if (e.type === 'golem') Lt(P(e.x), P(e.y) - 35, 130, e.enraged ? '#ff4a2a' : '#7affd0', 0.6);
      else if (ENEMIES[e.type].boss) Lt(P(e.x), P(e.y) - 40, 150, e.enraged ? '#ff4a2a' : { spider: '#b070ff', bishop: '#ffb060', behemoth: '#ff8a3a', eye: '#c070ff' }[e.type], 0.65);
      if (e.type === 'wisp') Lt(P(e.x), P(e.y) - 28, 70, '#ffb040', 0.8);
    }
    for (const L2 of g.loot) if (!NO_LOOT_ICON.includes(L2.item.cat)) Lt(P(L2.dx), P(L2.dy), 50 + (L2.item.rarity || 0) * 8, RARITY[L2.item.rarity || 0].color, 0.6);
    for (const ch of m.chests) if (ch.open && ch.openT < 1) Lt(P(ch.x), P(ch.y) - 15, 150, '#ffd27a', 1 - ch.openT);
    for (const f of g.flashes) Lt(P(f.x), P(f.y), f.r * K, f.col, 1 - f.t / f.dur);
    l.globalAlpha = 1;
  }
}

const lightCache = new Map();
function lightSprite(col) {
  let s = lightCache.get(col);
  if (s) return s;
  s = mkCanvas(128, 128);
  const c = s.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.35, rgba(col, 0.7)); g.addColorStop(0.7, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  lightCache.set(col, s);
  return s;
}

const SPR = (rows, pal) => {
  const c = mkCanvas(rows[0].length, rows.length), x = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, i) => { if (ch !== '.') { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); } }));
  return c;
};
const STONE = ['#1a1824', '#3a3648', '#5a546e', '#867e9a', '#b8b0c8', '#d8d4e0', '#f0eef4', '#ffffff'];
export const PFX_PAL = {
  blue: ['#0a1a4a', '#14388a', '#2460d0', '#3a90f0', '#62c8f4', '#a6ecff', '#dcfbff', '#ffffff', '#ffffff'],
  red: ['#2a060e', '#6a0e1c', '#a81a2a', '#e03040', '#ff6a6a', '#ffc0c0', '#ffffff'],
  violet: ['#1b1630', '#3a2f63', '#6150a3', '#9480d8', '#c7b8f5', '#efe9ff', '#ffffff'],
  stone: ['#1a1412', '#3a2e28', '#5e4c40', '#86705e', '#b09880', '#d8c4a8', '#f0e4d0', '#ffffff', '#ffffff'],
  gold: ['#2a1405', '#5c3008', '#9a5a0e', '#d48e18', '#f5b92c', '#ffde5e', '#fff4bc', '#ffffff'],
  fire: FIRE_RAMP,
  green: ['#0e2a12', '#1e5a28', '#3a8a46', '#6ac078', '#9fe6a0', '#d8ffd8', '#ffffff'],
};
let steleC = null;
function steleSprite() {
  if (steleC) return steleC;
  steleC = SPR([
    '...kkkkkkkk...', '..kaaaaaaabk..', '.kaabbbbbbbck.', '.kabbbbbbbbck.', '.kabgggggbbck.', '.kabbbbbbbbck.', '.kabggggbbbck.', '.kabbbbbbbbck.',
    '.kabgggggbbck.', '.kabbbbbbbbck.', '.kabgggbbbbck.', '.kabbbbbbbbck.', '.kabbbbbbbbck.', '.kbbbbbbbbbck.', '.kbbbbbbbbcck.', 'kkkkkkkkkkkkkk', 'keeeeeeeeeeeek', 'kffffffffffffk', 'kkkkkkkkkkkkkk',
  ], { k: '#140f1c', a: '#8a8498', b: '#5e586c', c: '#3e3a4a', g: '#7fd0ff', e: '#4e4a58', f: '#2e2a36' });
  return steleC;
}
const GEAR_ROWS = {
  head: ['...kkkkkk...', '..kaaabbbk..', '.kaabbbbbck.', '.kabbbbbcck.', '.kabkkkkkck.', '.kbbkggkkck.', '.kbbbbbbcck.', '..kbbkkcck..', '...kk..kk...'],
  body: ['.kkk....kkk.', 'kaabkkkkbbck', 'kabbaabbbbck', '.kkabbbbbkk.', '..kabbbbck..', '..kabggbck..', '..kabbbbck..', '..kbbbbcck..', '...kkkkkk...'],
  hands: ['..kk.kk.kk..', '.kabkabkbck.', '.kabkabkbck.', '.kabbabbbck.', '.kabbbbbbck.', '.kabggbbcck.', '..kabbbcck..', '..kbbbbcck..', '...kkkkkk...'],
  feet: ['..kkkkk.....', '..kaabbk....', '..kabbck....', '..kabbck....', '..kabbckkk..', '..kabbbbbbk.', '.kabbggbbck.', '.kbbbbbbcck.', '..kkkkkkkk..'],
  charm: ['....kkkk....', '...k....k...', '...k....k...', '....kkkk....', '...kaabbk...', '..kabggbck..', '..kabggbck..', '...kbbcck...', '....kkkk....'],
};
const gearC = new Map();
export function gearSprite(slot, rarity) {
  const key = slot + rarity;
  if (gearC.has(key)) return gearC.get(key);
  const col = RARITY[rarity].color, n = parseInt(col.slice(1), 16);
  const sh = (k) => `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`;
  const c = SPR(GEAR_ROWS[slot], { k: '#140f1c', a: '#ffffff', b: sh(0.85), c: sh(0.5), g: '#fff0a0' });
  gearC.set(key, c);
  return c;
}
let scrollC = null;
export function scrollSprite() {
  if (scrollC) return scrollC;
  scrollC = SPR([
    '.kkk......kkk.',
    'kbbbkkkkkkbbbk',
    'kbdbwwwwwwbdbk',
    'kbdbwlllllbdbk',
    'kbdbwwwwwwbdbk',
    'kbdbwllllwbdbk',
    'kbdbwwwrwwbdbk',
    'kbbbkkkrkkbbbk',
    '.kkk...r..kkk.',
  ], { k: '#140f1c', b: '#c8a46a', d: '#8a6a3a', w: '#f0e2c0', l: '#a89070', r: '#b8343a' });
  return scrollC;
}
const rockC = [];
function rockSprite(i) {
  if (rockC[i]) return rockC[i];
  const rows = ['..kkkk..', '.kaabbk.', 'kaabbbck', 'kabbbcck', 'kbbbccck', '.kbccck.', '..kkkk..'];
  const r = rows.map((row) => (i % 2 ? [...row].reverse().join('') : row));
  rockC[i] = SPR(i > 1 ? [...r].reverse() : r, { k: '#1c1214', a: '#c8c0b0', b: '#968e7e', c: '#5a5448' });
  return rockC[i];
}
