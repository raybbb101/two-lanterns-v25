// pixelfx のエフェクトをゲームの中で再生する。ワールド座標（px）で置き、毎フレーム一枚のフレームに描いて合成する。
import { createFrame, clearFrame, createFx, composite, painterFor, hex, PAL } from '../pixelfx/src/core/index.js';

import * as swordSlash from '../pixelfx/src/fx/melee/sword-slash.js';
import * as doubleSlash from '../pixelfx/src/fx/melee/double-slash.js';
import * as hammerSmash from '../pixelfx/src/fx/melee/hammer-smash.js';
import * as thrust from '../pixelfx/src/fx/melee/thrust.js';
import * as spinSlash from '../pixelfx/src/fx/melee/spin-slash.js';
import * as clawSwipe from '../pixelfx/src/fx/melee/claw-swipe.js';
import * as hitSpark from '../pixelfx/src/fx/impacts/hit-spark.js';
import * as critHit from '../pixelfx/src/fx/impacts/crit-hit.js';
import * as hitFlash from '../pixelfx/src/fx/impacts/hit-flash.js';
import * as groundSlam from '../pixelfx/src/fx/impacts/ground-slam.js';
import * as heavyLanding from '../pixelfx/src/fx/impacts/heavy-landing.js';
import * as shieldBlock from '../pixelfx/src/fx/impacts/shield-block.js';
import * as arrow from '../pixelfx/src/fx/projectiles/arrow.js';
import * as plasmaShot from '../pixelfx/src/fx/projectiles/plasma-shot.js';
import * as fireball from '../pixelfx/src/fx/fire/fireball.js';
import * as smallExplosion from '../pixelfx/src/fx/explosions/small-explosion.js';
import * as torch from '../pixelfx/src/fx/fire/torch.js';
import * as frostNova from '../pixelfx/src/fx/ice/frost-nova.js';
import * as healAoe from '../pixelfx/src/fx/holy/heal-aoe.js';
import * as heal from '../pixelfx/src/fx/holy/heal.js';
import * as divineShield from '../pixelfx/src/fx/holy/divine-shield.js';
import * as resurrection from '../pixelfx/src/fx/holy/resurrection.js';
import * as zapHit from '../pixelfx/src/fx/lightning/zap-hit.js';
import * as blinkOut from '../pixelfx/src/fx/arcane/blink-out.js';
import * as blinkIn from '../pixelfx/src/fx/arcane/blink-in.js';
import * as portal from '../pixelfx/src/fx/arcane/portal.js';
import * as runeCircle from '../pixelfx/src/fx/arcane/rune-circle.js';
import * as poof from '../pixelfx/src/fx/spawn/poof.js';
import * as shatterDeath from '../pixelfx/src/fx/spawn/shatter-death.js';
import * as soulRise from '../pixelfx/src/fx/spawn/soul-rise.js';
import * as summonRise from '../pixelfx/src/fx/spawn/summon-rise.js';
import * as sporeBurst from '../pixelfx/src/fx/nature/spore-burst.js';
import * as chestOpen from '../pixelfx/src/fx/pickups/chest-open.js';
import * as lootBeam from '../pixelfx/src/fx/pickups/loot-beam.js';
import * as heartPickup from '../pixelfx/src/fx/pickups/heart-pickup.js';
import * as collectBurst from '../pixelfx/src/fx/pickups/collect-burst.js';
import * as levelUp from '../pixelfx/src/fx/ui/level-up.js';
import * as damageNumber from '../pixelfx/src/fx/ui/damage-number.js';
import * as critNumber from '../pixelfx/src/fx/ui/crit-number.js';
import * as burning from '../pixelfx/src/fx/status/burning.js';
import * as slowed from '../pixelfx/src/fx/status/slowed.js';
import * as rage from '../pixelfx/src/fx/status/rage.js';

import * as brazier from '../pixelfx/src/fx/fire/brazier.js';
import * as candle from '../pixelfx/src/fx/fire/candle.js';
import * as spiritFlame from '../pixelfx/src/fx/fire/spirit-flame.js';
import * as iceCrystal from '../pixelfx/src/fx/ice/ice-crystal.js';
import * as exclamation from '../pixelfx/src/fx/ui/exclamation.js';
import * as spellCharge from '../pixelfx/src/fx/arcane/spell-charge.js';

import * as meteor from '../pixelfx/src/fx/fire/meteor.js';
import * as flamePillar from '../pixelfx/src/fx/fire/flame-pillar.js';
import * as lightningStrike from '../pixelfx/src/fx/lightning/lightning-strike.js';
import * as smite from '../pixelfx/src/fx/holy/smite.js';
import * as holyPillar from '../pixelfx/src/fx/holy/holy-pillar.js';
import * as sunburst from '../pixelfx/src/fx/holy/sunburst.js';
import * as healingBloom from '../pixelfx/src/fx/nature/healing-bloom.js';
import * as poisonCloud from '../pixelfx/src/fx/nature/poison-cloud.js';
import * as rootSnare from '../pixelfx/src/fx/nature/root-snare.js';
import * as earthSpike from '../pixelfx/src/fx/nature/earth-spike.js';
import * as curse from '../pixelfx/src/fx/shadow/curse.js';
import * as soulDrain from '../pixelfx/src/fx/shadow/soul-drain.js';
import * as daggerFlurry from '../pixelfx/src/fx/melee/dagger-flurry.js';
import * as starFall from '../pixelfx/src/fx/arcane/star-fall.js';
import * as parry from '../pixelfx/src/fx/impacts/parry.js';
import * as iceLance from '../pixelfx/src/fx/ice/ice-lance.js';
import * as stunned from '../pixelfx/src/fx/status/stunned.js';
import * as cursed from '../pixelfx/src/fx/status/cursed.js';

import * as heavyCleave from '../pixelfx/src/fx/melee/heavy-cleave.js';
import * as scytheReap from '../pixelfx/src/fx/melee/scythe-reap.js';
import * as uppercut from '../pixelfx/src/fx/melee/uppercut.js';
import * as iceSpikes from '../pixelfx/src/fx/ice/ice-spikes.js';
import * as blizzardVortex from '../pixelfx/src/fx/ice/blizzard-vortex.js';
import * as fireRing from '../pixelfx/src/fx/fire/fire-ring.js';
import * as fireTornado from '../pixelfx/src/fx/fire/fire-tornado.js';
import * as thunderclap from '../pixelfx/src/fx/lightning/thunderclap.js';
import * as grenade from '../pixelfx/src/fx/explosions/grenade.js';
import * as dirtExplosion from '../pixelfx/src/fx/explosions/dirt-explosion.js';
import * as acidSplash from '../pixelfx/src/fx/nature/acid-splash.js';
import * as toxicPuddle from '../pixelfx/src/fx/nature/toxic-puddle.js';
import * as darkExplosion from '../pixelfx/src/fx/shadow/dark-explosion.js';
import * as featherBurst from '../pixelfx/src/fx/holy/feather-burst.js';

import * as plasmaExplosion from '../pixelfx/src/fx/explosions/plasma-explosion.js';
import * as implosion from '../pixelfx/src/fx/explosions/implosion.js';
import * as fireworkBurst from '../pixelfx/src/fx/explosions/firework-burst.js';
import * as fireworkRocket from '../pixelfx/src/fx/explosions/firework-rocket.js';
import * as bigExplosion from '../pixelfx/src/fx/explosions/big-explosion.js';
import * as bubbles from '../pixelfx/src/fx/water/bubbles.js';
import * as fountain from '../pixelfx/src/fx/water/fountain.js';
import * as waterOrb from '../pixelfx/src/fx/water/water-orb.js';
import * as waveCrash from '../pixelfx/src/fx/water/wave-crash.js';
import * as whirlpool from '../pixelfx/src/fx/water/whirlpool.js';
import * as stormCloud from '../pixelfx/src/fx/lightning/storm-cloud.js';
import * as teslaCoil from '../pixelfx/src/fx/lightning/tesla-coil.js';
import * as energyDisc from '../pixelfx/src/fx/projectiles/energy-disc.js';
import * as sparkArc from '../pixelfx/src/fx/lightning/spark-arc.js';
import * as chargeUp from '../pixelfx/src/fx/lightning/charge-up.js';
import * as arcaneOrb from '../pixelfx/src/fx/arcane/arcane-orb.js';
import * as timeStop from '../pixelfx/src/fx/arcane/time-stop.js';
import * as manaBurst from '../pixelfx/src/fx/arcane/mana-burst.js';
import * as blackHole from '../pixelfx/src/fx/shadow/black-hole.js';
import * as graspingHands from '../pixelfx/src/fx/shadow/grasping-hands.js';
import * as shadowTendrils from '../pixelfx/src/fx/shadow/shadow-tendrils.js';
import * as hexSigil from '../pixelfx/src/fx/shadow/hex-sigil.js';
import * as necroSkulls from '../pixelfx/src/fx/shadow/necro-skulls.js';
import * as eclipse from '../pixelfx/src/fx/shadow/eclipse.js';
import * as voidOrb from '../pixelfx/src/fx/shadow/void-orb.js';
import * as halo from '../pixelfx/src/fx/holy/halo.js';
import * as forceField from '../pixelfx/src/fx/scifi/force-field.js';
import * as confetti from '../pixelfx/src/fx/ui/confetti.js';
import * as coinCollect from '../pixelfx/src/fx/ui/coin-collect.js';
import * as questComplete from '../pixelfx/src/fx/ui/quest-complete.js';
import * as achievement from '../pixelfx/src/fx/ui/achievement.js';
import * as countdown from '../pixelfx/src/fx/ui/countdown.js';
import * as coinDrop from '../pixelfx/src/fx/spawn/coin-drop.js';
import * as eggHatch from '../pixelfx/src/fx/spawn/egg-hatch.js';
import * as coinSpin from '../pixelfx/src/fx/pickups/coin-spin.js';
import * as keyGlint from '../pixelfx/src/fx/pickups/key-glint.js';
import * as potion from '../pixelfx/src/fx/pickups/potion.js';
import * as powerStar from '../pixelfx/src/fx/pickups/power-star.js';
import * as xpOrb from '../pixelfx/src/fx/pickups/xp-orb.js';
import * as critBat from '../pixelfx/src/fx/critters/bat.js';
import * as critBird from '../pixelfx/src/fx/critters/bird.js';
import * as critButterfly from '../pixelfx/src/fx/critters/butterfly.js';
import * as critEye from '../pixelfx/src/fx/critters/eyeball.js';
import * as critFish from '../pixelfx/src/fx/critters/fish-school.js';
import * as critSkull from '../pixelfx/src/fx/critters/flying-skull.js';
import * as critFrog from '../pixelfx/src/fx/critters/frog.js';
import * as critGhost from '../pixelfx/src/fx/critters/ghost.js';
import * as critJelly from '../pixelfx/src/fx/critters/jellyfish.js';
import * as critSlime from '../pixelfx/src/fx/critters/slime.js';
import * as critSnake from '../pixelfx/src/fx/critters/snake.js';
import * as critWisp from '../pixelfx/src/fx/critters/wisp.js';
import * as wAurora from '../pixelfx/src/fx/weather/aurora.js';
import * as wBlizzard from '../pixelfx/src/fx/weather/blizzard.js';
import * as wCherry from '../pixelfx/src/fx/weather/cherry-blossoms.js';
import * as wLeaves from '../pixelfx/src/fx/weather/falling-leaves.js';
import * as wStorm from '../pixelfx/src/fx/weather/storm.js';
import * as wFireflies from '../pixelfx/src/fx/weather/fireflies.js';
import * as wStars from '../pixelfx/src/fx/weather/shooting-stars.js';
import * as wGodRays from '../pixelfx/src/fx/weather/god-rays.js';
import * as wFog from '../pixelfx/src/fx/weather/fog.js';
import * as trGlitch from '../pixelfx/src/fx/transitions/glitch-wipe.js';
import * as trShatter from '../pixelfx/src/fx/transitions/shatter-wipe.js';
import * as trStar from '../pixelfx/src/fx/transitions/star-iris.js';
import * as trDissolve from '../pixelfx/src/fx/transitions/pixel-dissolve.js';

export const FX = {
  teslaCoil, energyDisc,
  plasmaExplosion, implosion, fireworkBurst, fireworkRocket, bigExplosion, bubbles, fountain, waterOrb, waveCrash, whirlpool, stormCloud, sparkArc, chargeUp, arcaneOrb, timeStop, manaBurst, blackHole, graspingHands, shadowTendrils, hexSigil, necroSkulls, eclipse, voidOrb, halo, forceField, confetti, coinCollect, questComplete, achievement, countdown, coinDrop, eggHatch, coinSpin, keyGlint, potion, powerStar, xpOrb, critBat, critBird, critButterfly, critEye, critFish, critSkull, critFrog, critGhost, critJelly, critSlime, critSnake, critWisp, wAurora, wBlizzard, wCherry, wLeaves, wStorm, wFireflies, wStars, wGodRays, wFog, trGlitch, trShatter, trStar, trDissolve,
  heavyCleave, scytheReap, uppercut, iceSpikes, blizzardVortex, fireRing, fireTornado, thunderclap, grenade, dirtExplosion, acidSplash, toxicPuddle, darkExplosion, featherBurst,
  meteor, flamePillar, lightningStrike, smite, holyPillar, sunburst, healingBloom, poisonCloud, rootSnare, earthSpike, curse, soulDrain,
  daggerFlurry, starFall, parry, iceLance, stunned, cursed,
  brazier, candle, spiritFlame, iceCrystal, exclamation, spellCharge,
  swordSlash, doubleSlash, hammerSmash, thrust, spinSlash, clawSwipe, hitSpark, critHit, hitFlash, groundSlam, heavyLanding, shieldBlock,
  arrow, plasmaShot, fireball, smallExplosion, torch, frostNova, healAoe, heal, divineShield, resurrection, zapHit, blinkOut, blinkIn,
  portal, runeCircle, poof, shatterDeath, soulRise, summonRise, sporeBurst, chestOpen, lootBeam, heartPickup, collectBurst, levelUp,
  damageNumber, critNumber, burning, slowed, rage,
};
export { PAL, hex };

// レアリティごとの斬撃の色（暗→明）
export const RARE_RAMP = [
  ['#2a2a36', '#4a4a5e', '#7a7a92', '#a8a8bc', '#d4d4e2', '#f0f0f8', '#ffffff'],
  ['#14301a', '#1e5a2a', '#2e8a3a', '#5ac85a', '#a8f0a0', '#e0ffd8', '#ffffff'],
  ['#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#b8c9e8', '#e8f1ff', '#ffffff'],
  ['#2a1450', '#4a2286', '#7a3ac0', '#a868f0', '#d0a8ff', '#f0e0ff', '#ffffff'],
  ['#4a1712', '#9a4a0e', '#d48e18', '#f5b92c', '#ffde5e', '#fff4bc', '#ffffff'],
  ['#3a0a1e', '#7a1438', '#c02850', '#f05a78', '#ff9ab0', '#ffe0e8', '#ffffff'],
  ['#04282e', '#0a5560', '#14a0a8', '#3ae8d8', '#a0fff0', '#fff4c0', '#ffffff'],
];
// 人形を描かせないための空の体（status 系の位置はふつうの身長に合わせる）
export const EMPTY_ACTOR = { mask: { w: 24, h: 38, data: new Uint8Array(24 * 38) }, pixels: new Uint32Array(24 * 38), x: -12, y: -38, w: 24, h: 38, k: 2, head: [0, -38], chest: [0, -26], eyes: [] };
/** スプライトのピクセルから、エフェクトに渡す「体」を作る（余白は切り落とす） */
export function actorFrom(o) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.rgba[(y * o.w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = ((y + y0) * o.w + x + x0) * 4;
    if (!o.rgba[j + 3]) continue;
    data[y * w + x] = 1;
    pixels[y * w + x] = ((255 << 24) | (o.rgba[j + 2] << 16) | (o.rgba[j + 1] << 8) | o.rgba[j]) >>> 0;
  }
  const ax = o.ox + x0, ay = o.oy + y0;
  return { mask: { w, h, data }, pixels, x: ax, y: ay, w, h, k: 2, head: [ax + (w >> 1), ay], chest: [ax + (w >> 1), ay + Math.round(h * 0.32)], eyes: [] };
}
export const FIRE_RAMP = ['#4a1712', '#8a1f17', '#c9281f', '#f2561d', '#ff8a2a', '#ffc23d', '#ffe26b', '#fff3a6', '#ffffff'];
export const ICE_RAMP = ['#151a3d', '#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#a6ecff', '#dcfbff', '#ffffff'];

let seedN = 1;

export class FxLayer {
  constructor() {
    this.list = [];
    this.frame = null;
    this.cv = document.createElement('canvas');
    this.cx = this.cv.getContext('2d');
  }
  resize(w, h) {
    this.frame = createFrame(w, h);
    this.img = new ImageData(w, h);
    this.cv.width = w; this.cv.height = h;
  }
  clear() { this.list = []; }

  /** エフェクトを置く。o.follow: () => {x, y} で毎フレーム追従。o.life: 秒で強制終了（ループ用）。 */
  add(mod, o = {}) {
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    if (mod.meta.actor && !o.actor) o.actor = EMPTY_ACTOR;
    const fx = createFx(mod, { seed: seedN++ % 997, ...o });
    fx.follow = o.follow || null;
    fx.life = o.life ?? Infinity;
    fx.layer = o.layer || 'front';
    this.list.push(fx);
    return fx;
  }
  /** 自前の描画（painter を受け取る）: { update(dt), draw(p), done() } */
  custom(obj) {
    obj.custom = true;
    obj.layer = obj.layer || 'front';
    this.list.push(obj);
    return obj;
  }

  update(dt) {
    for (const f of this.list) {
      f.update(dt);
      if (f.custom) continue;
      if (f.follow) {
        const p = f.follow();
        if (!p) f.stop();
        else { f.options.x = p.x; f.options.y = p.y; if (p.angle != null) f.options.angle = p.angle; if (p.flip != null) f.options.flip = p.flip; }
      }
      f.life -= dt;
      if (f.life <= 0) f.stop();
    }
    this.list = this.list.filter((f) => !f.done());
  }

  /** layer: 'ground'（床の上・キャラの下）か 'front'。ox, oy はカメラの左上（px）。 */
  render(ctx, ox, oy, layer) {
    const f = this.frame;
    f.ox = ox; f.oy = oy;
    clearFrame(f);
    let any = false;
    for (const fx of this.list) {
      if (fx.layer !== layer) continue;
      any = true;
      if (fx.custom) { const p = painterFor(f); p.place(0, 0); fx.draw(p); }
      else fx.draw(f);
    }
    if (!any) return;
    composite(f, this.img.data, null);
    this.cx.putImageData(this.img, 0, 0);
    ctx.drawImage(this.cv, 0, 0);
  }
}
