// UI 用のアイコン：武器は骨格キャラから切り抜いた絵、スキルは pixelfx のエフェクトの 1 コマ。
import { weaponSprite, scrollSprite, gearSprite, bake, PFX_PAL } from './pix.js';
import { FX, FIRE_RAMP, EMPTY_ACTOR } from './fxlib.js';
import { heroPixels, heroPose, COSTUMES } from './hero.js';
import { SKILLS, PETS, ELEMENTS } from './data.js';
import { rgba } from './util.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// 中身のある範囲を切り抜き、S×S に整数倍で収める
function fit(src, S, bg) {
  const x = src.getContext('2d'), d = x.getImageData(0, 0, src.width, src.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) for (let i = 0; i < src.width; i++) if (d[(y * src.width + i) * 4 + 3] > 20) { x0 = Math.min(x0, i); y0 = Math.min(y0, y); x1 = Math.max(x1, i); y1 = Math.max(y1, y); }
  const out = mk(S, S), c = out.getContext('2d');
  if (bg) { const g = c.createRadialGradient(S / 2, S * 0.4, 1, S / 2, S / 2, S * 0.55); g.addColorStop(0, rgba(bg, 0.45)); g.addColorStop(1, 'rgba(10,8,14,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); }
  if (x1 < 0) return out;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.max(1, Math.floor((S * 0.86) / Math.max(w, h)));
  c.imageSmoothingEnabled = false;
  c.drawImage(src, x0, y0, w, h, Math.round((S - w * k) / 2), Math.round((S - h * k) / 2), w * k, h * k);
  return out;
}

const cache = new Map();
export function itemIcon(it, S = 56) {
  const key = (it.cat === 'weapon' ? it.base + it.rarity : it.cat === 'gear' ? it.slot + it.rarity : it.cat === 'egg' ? 'egg' : 'scroll' + it.skill) + S;
  if (cache.has(key)) return cache.get(key);
  let c;
  if (it.cat === 'weapon') c = fit(weaponSprite(it.base, it.rarity), S * 2);
  else if (it.cat === 'gear') c = fit(gearSprite(it.slot, it.rarity), S * 2);
  else if (it.cat === 'egg') { const m = FX.eggHatch; c = fit(bake(m, {}, 0.05, m.meta.size[0], m.meta.size[1], m.meta.origin[0], m.meta.origin[1]), S * 2); }
  else {
    const sc = scrollSprite(), tmp = mk(sc.width + 6, sc.height + 6), t = tmp.getContext('2d');
    t.drawImage(sc, 3, 3);
    t.fillStyle = SKILLS[it.skill].color; t.fillRect(5, 2, 4, 4);
    c = fit(tmp, S * 2);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

const GOLD = ['#2a1405', '#5c3008', '#9a5a0e', '#d48e18', '#f5b92c', '#ffde5e', '#fff4bc', '#ffffff'];
const fx = (m, t, o = {}) => [m, o, t, m.meta.size[0], m.meta.size[1], m.meta.origin[0], m.meta.origin[1]];
const SK = () => ({
  fireball: fx(FX.fireball, 0.4), whirl: fx(FX.spinSlash, 0.12), dash: fx(FX.blinkOut, 0.18, { palette: ['#062a26', '#0e5a52', '#1a8a7a', '#3ac0a8', '#7fe8d6', '#c8fff4', '#ffffff'] }),
  heal: fx(FX.heal, 0.7), nova: fx(FX.frostNova, 0.55), chain: fx(FX.zapHit, 0.08), ward: fx(FX.divineShield, 0.6, { palette: ['#0e2a12', '#1e5a28', '#3a8a46', '#6ac078', '#9fe6a0', '#d8ffd8', '#ffffff'] }),
  bash: fx(FX.parry, 0.08), warcry: fx(FX.sunburst, 0.4, { palette: FIRE_RAMP }), quake: fx(FX.earthSpike, 0.6), roar: fx(FX.rage, 0.3),
  pierce: fx(FX.arrow, 0.2), focus: fx(FX.sunburst, 0.4, { palette: GOLD }), thorns: fx(FX.rootSnare, 1), rain: fx(FX.starFall, 0.7, { palette: GOLD }), snare: fx(FX.rootSnare, 1.4),
  pillar: fx(FX.flamePillar, 1.2), meteor: fx(FX.meteor, 0.4), lance: fx(FX.iceLance, 0.3), strike: fx(FX.lightningStrike, 0.8),
  bloom: fx(FX.healingBloom, 1.3), bless: fx(FX.blessing || FX.heal, 0.8), miracle: fx(FX.resurrection, 1.2), smite: fx(FX.smite, 0.58), hpillar: fx(FX.holyPillar, 1),
  flurry: fx(FX.daggerFlurry, 0.3), shadowstep: fx(FX.blinkIn, 0.3), poison: fx(FX.poisonCloud, 1), curse: fx(FX.curse, 1), drain: fx(FX.soulDrain, 1),
});
let skTable = null;
export function skillIconURL(id, S = 48) {
  const key = 'sk' + id + S;
  if (cache.has(key)) return cache.get(key);
  skTable = skTable || SK();
  let row = skTable[id];
  if (!row) {
    const S0 = SKILLS[id], step = (S0.cast || []).find((c) => c.fx);
    const m = FX[S0.icon || step.fx];
    row = fx(m, (m.meta.duration || 1) * 0.3, !S0.icon && step.p ? { palette: PFX_PAL[step.p] || (step.p === 'gold' ? GOLD : undefined) } : {});
  }
  const [mod, o, t, w, h, ox, oy] = row;
  const url = fit(bake(mod, mod.meta.actor ? { actor: EMPTY_ACTOR, ...o } : o, t, w, h, ox, oy), S * 2, SKILLS[id].color).toDataURL();
  cache.set(key, url);
  return url;
}

/** ペットの絵（pixelfx の生き物を属性の色で塗る） */
export function petIcon(sp, el, S = 96) {
  const key = 'pet' + sp + el + S;
  if (cache.has(key)) return cache.get(key);
  const m = FX[PETS[sp].fx];
  const url = fit(bake(m, { palette: ELEMENTS[el].ramp }, (m.meta.duration || 1) * 0.3, m.meta.size[0], m.meta.size[1], m.meta.origin[0], m.meta.origin[1]), S * 2, ELEMENTS[el].color).toDataURL();
  cache.set(key, url);
  return url;
}

/** キャラクター画面・タイトル用の大きな主人公 */
export function drawPortrait(c, me, t, k = 5, cx, footY) {
  const h = { ...me, faceYaw: null, aim: me.portraitAim ?? 0.25, moveAmt: 0, atkT: 9, atkDur: 0.3, dodgeT: 0, down: false, skillAnim: null };
  const pose = heroPose(h, t);
  const o = heroPixels(pose, COSTUMES[me.job || 'knight'], me.weapon ? me.weapon.rarity : 0);
  const tmp = mk(o.w, o.h);
  tmp.getContext('2d').putImageData(new ImageData(o.rgba, o.w, o.h), 0, 0);
  c.imageSmoothingEnabled = false;
  c.drawImage(tmp, Math.round(cx + o.ox * k), Math.round(footY + o.oy * k), o.w * k, o.h * k);
}
export { FIRE_RAMP };
