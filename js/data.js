import { rand, pick, uid } from './util.js';

export const RARITY = [
  { name: 'コモン', color: '#c9c2b2', mult: 1.0 },
  { name: 'アンコモン', color: '#7fd16f', mult: 1.16 },
  { name: 'レア', color: '#5fa8ff', mult: 1.34 },
  { name: 'エピック', color: '#c983ff', mult: 1.58 },
  { name: 'レジェンド', color: '#ffb340', mult: 1.9 },
  { name: '神話', color: '#ff5f7e', mult: 2.4 }, // 合成でしか手に入らない
  { name: '唯一', color: '#6ff5e8', mult: 3.4 }, // 神話の武器 5 本から。武器種ごとに 1 振りだけ
];
// 合成に必要な本数：レアリティが高いほど少ない
export const FUSE_COST = [5, 4, 3, 2, 2, 5];
export const GEAR_TOP = 5; // 防具は神話まで

export const WEAPONS = {
  sword: { name: '長剣', kind: 'melee', dmg: 15, rate: 0.4, range: 66, arc: 2.1, knock: 190, legend: '暁の聖剣', heavy: { t: 0.85, name: '渾身斬り', desc: '前方を大きく薙ぐ。威力 2.6 倍、範囲 1.5 倍。' }, myth: '斬るたびに光の刃が飛ぶ' },
  dagger: { name: '短剣', kind: 'melee', dmg: 9, rate: 0.22, range: 50, arc: 1.7, knock: 90, legend: '影縫い', heavy: { t: 0.55, name: '影縫い連撃', desc: '前へ駆け抜け、周りの敵を 5 回切る。各 0.9 倍で会心しやすい。' }, myth: '少し遅れてもう一撃入る' },
  axe: { name: '戦鎚', kind: 'melee', dmg: 28, rate: 0.75, range: 74, arc: 2.7, knock: 380, legend: '巨人殺し', heavy: { t: 1.2, name: '大地割り', desc: '地面を叩き割る。周囲に 3.2 倍のダメージと気絶。' }, myth: '叩いた地面から衝撃波が広がる' },
  spear: { name: '槍', kind: 'thrust', dmg: 17, rate: 0.48, range: 98, arc: 0.55, knock: 230, legend: '天穿つ槍', heavy: { t: 0.9, name: '貫き突進', desc: '無敵で一直線に突進し、線上の敵に 2.4 倍。' }, myth: '突いた敵から雷が 2 体へ跳ねる' },
  bow: { name: '長弓', kind: 'bow', dmg: 13, rate: 0.46, speed: 640, knock: 110, legend: '流星の弓', heavy: { t: 1.0, name: '剛弓', desc: '雷をまとった矢が線上の敵を貫く。威力 3 倍。' }, myth: '矢が 3 本に分かれる' },
  staff: { name: '魔杖', kind: 'staff', dmg: 16, rate: 0.55, speed: 430, knock: 130, legend: '星詠みの杖', heavy: { t: 1.1, name: '魔力爆裂', desc: '遅い魔力球を放つ。着弾で周囲を吸い込み、2.8 倍で爆発。' }, myth: '魔弾が 3 発に増える' },
};
// 最上位の武器。武器種ごとに 1 振りだけで、攻撃の仕組みそのものが変わる
export const UNIQUE = {
  sword: { name: '終の灯剣アルクス', rate: 0.5, normal: '光の大波を前方へ放ち、貫通する。倒すと HP を回復。', heavy: '天地開闢：一直線に光の柱が立ち並ぶ。' },
  dagger: { name: '無明', rate: 0.26, normal: '瞬間移動しながら、周囲の敵すべてを同時に斬る。', heavy: '刻止め：周りの時間を止め、12 回斬り刻む。' },
  axe: { name: '星砕き', rate: 0.85, normal: '叩くたびに爆発し、敵の頭上に小隕石が落ちる。', heavy: '終末の鎚：巨大な爆発で広範囲を吹き飛ばす。' },
  spear: { name: '雷霆', rate: 0.5, normal: '突くたびに落雷が走り、敵から敵へ 4 回跳ねる。', heavy: '神鳴り：雷雲を呼び、落雷が降り続ける。' },
  bow: { name: '天の河', rate: 0.5, normal: '追尾する星の矢を 5 本同時に放つ。', heavy: '流星群：狙った一帯に星を降らせる。' },
  staff: { name: '虚空の書', rate: 0.65, normal: '敵を引き寄せる虚無の球を撃ち出し、爆発させる。', heavy: '事象の地平：黒い穴がすべてを呑み、爆ぜる。' },
};

export const AFFIX = {
  burn: { pre: '炎の', desc: '命中時、敵を炎上させる' },
  frost: { pre: '氷の', desc: '命中時、敵を鈍足にする' },
  vamp: { pre: '吸血の', desc: '与えたダメージの6%を回復' },
  swift: { pre: '疾風の', desc: '攻撃速度 +18%' },
  crit: { pre: '必殺の', desc: '会心率 +15%' },
  heavy: { pre: '剛力の', desc: 'ノックバック +60%' },
};
// 効果の数：コモンは無し、そこから 1 つずつ増える
const AFFIX_COUNT = [0, 1, 2, 3, 4, 5, 6];

// ---------- スキル ----------
// p: 基本の強さ（dmg は攻撃力とレベル、heal/shield は回復力とレベルで伸びる）。up: レベルごとに増える値
const S = (name, cd, color, aim, p, desc, up = {}, cast = null, icon = null) => ({ name, cd, color, aim, p, desc, up, cast, icon });
export const SKILLS = {
  fireball: S('火球', 4.5, '#ff7a2e', 'enemy', { dmg: 34 }, (p) => `爆発する火球を放つ。範囲に ${p.dmg} ダメージ＋炎上。`),
  whirl: S('旋風斬', 6, '#efe6cf', 'self', { dmg: 26 }, (p) => `周囲を薙ぎ払い ${p.dmg} ダメージ。敵を吹き飛ばす。`),
  dash: S('疾風ステップ', 5, '#7fe8d6', 'enemy', { dmg: 22 }, (p) => `敵へ駆け抜け、通過した敵に ${p.dmg} ダメージ。無敵。`),
  heal: S('癒しの灯', 12, '#ffd27a', 'self', { heal: 35 }, (p) => `自分と近くの仲間の HP を ${p.heal} 回復する。`),
  nova: S('氷結ノヴァ', 9, '#8fd8ff', 'self', { dmg: 16, dot: 12, dur: 2 }, (p) => `周囲を凍らせ ${p.dmg} ダメージ＋鈍足。氷が ${p.dur} 秒残り、踏んだ敵に毎秒 ${p.dot} ダメージ。`, { dur: 0.5 }),
  chain: S('連鎖雷', 7, '#b7a3ff', 'enemy', { dmg: 22, jumps: 3 }, (p) => `雷が敵から敵へ ${p.jumps} 回跳ね、各 ${p.dmg} ダメージ。`, { jumps: 0.5 }),
  ward: S('守護の結界', 16, '#9fe6a0', 'self', { shield: 35, dur: 8 }, (p) => `自分と近くの仲間に ${p.shield} のシールドを張る（${p.dur} 秒）。`),
  // 剣士
  bash: S('盾打ち', 7, '#d8c090', 'enemy', { dmg: 42, stun: 1.6 }, (p) => `大盾を構えて踏み込み、前方の敵を叩き伏せる。${p.dmg} ダメージ、${p.stun} 秒気絶、大きく吹き飛ばす。`, { stun: 0.2 }),
  warcry: S('鬨の声', 18, '#ffb060', 'self', { atk: 15, def: 10, dur: 8 }, (p) => `自分と近くの仲間の攻撃 +${p.atk}%、被ダメージ -${p.def}%（${p.dur} 秒）。`, { atk: 3, def: 2 }),
  quake: S('地割れ', 8, '#c8905a', 'enemy', { dmg: 38 }, (p) => `地面を裂く一直線の岩の刃。${p.dmg} ダメージ。`),
  roar: S('怒りの咆哮', 16, '#ff5a4a', 'self', { atk: 30, haste: 15, dur: 6 }, (p) => `${p.dur} 秒間、攻撃 +${p.atk}%、攻撃速度 +${p.haste}%。`, { atk: 5, dur: 0.5 }),
  // 弓使い
  pierce: S('貫通矢', 6, '#ffd870', 'enemy', { dmg: 40 }, (p) => `敵を貫く矢。線上のすべての敵に ${p.dmg} ダメージ。`),
  focus: S('集中', 18, '#fff0a0', 'self', { crit: 25, dur: 8 }, (p) => `自分と近くの仲間の会心率 +${p.crit}%（${p.dur} 秒）。`, { crit: 4 }),
  thorns: S('茨の罠', 9, '#8ac850', 'enemy', { dot: 14, dur: 4 }, (p) => `敵の足元に茨。${p.dur} 秒、毎秒 ${p.dot} ダメージ＋鈍足。`, { dur: 0.5 }),
  rain: S('矢の雨', 11, '#ffe0a0', 'enemy', { dot: 32, dur: 2.5 }, (p) => `敵のいる場所に矢が降る。${p.dur} 秒、毎秒 ${p.dot} ダメージ。`),
  snare: S('蔓の束縛', 14, '#a8c860', 'self', { dmg: 12, stun: 2 }, (p) => `周囲の敵を蔓で縛り ${p.dmg} ダメージ。${p.stun} 秒動けなくする。`, { stun: 0.25 }),
  // 魔導士
  pillar: S('火柱', 8, '#ff9a3a', 'enemy', { dmg: 55 }, (p) => `敵の足元から火柱。${p.dmg} ダメージ＋炎上。`),
  meteor: S('隕石', 18, '#ff6a2a', 'enemy', { dmg: 110 }, (p) => `少し遅れて隕石が落ちる。広い範囲に ${p.dmg} ダメージ＋炎上。`),
  lance: S('氷槍', 4, '#a6ecff', 'enemy', { dmg: 34 }, (p) => `氷の槍を放つ。${p.dmg} ダメージ＋鈍足。`),
  strike: S('落雷', 9, '#c8b8ff', 'enemy', { dmg: 70 }, (p) => `一番近い敵に雷を落とす。${p.dmg} ダメージ。`),
  // 癒し手
  bloom: S('癒しの花', 12, '#f0a8c8', 'self', { hot: 12, dur: 5 }, (p) => `足元に花が咲く。${p.dur} 秒、中にいる仲間を毎秒 ${p.hot} 回復。`, { dur: 0.5 }),
  bless: S('祝福', 20, '#ffe68a', 'self', { heal: 20, atk: 12, def: 12, dur: 10 }, (p) => `仲間を ${p.heal} 回復し、攻撃 +${p.atk}%、被ダメージ -${p.def}%（${p.dur} 秒）。`, { atk: 2, def: 2 }),
  miracle: S('奇跡', 45, '#fff6c8', 'self', { heal: 120 }, (p) => `どこにいても仲間を蘇生し、全員を ${p.heal} 回復する。`),
  smite: S('裁きの光', 6, '#ffe8a0', 'enemy', { dmg: 46, heal: 12 }, (p) => `敵に光を落とし ${p.dmg} ダメージ。自分を ${p.heal} 回復。`),
  hpillar: S('聖柱', 13, '#fff0b8', 'enemy', { dmg: 30, heal: 25 }, (p) => `光の柱。範囲の敵に ${p.dmg} ダメージ、範囲の仲間を ${p.heal} 回復。`),
  // 影の刃
  flurry: S('短刀乱舞', 7, '#c7b8ff', 'enemy', { dmg: 12, hits: 5 }, (p) => `近くの敵を ${p.hits} 回切り刻む。各 ${p.dmg} ダメージ。`, { hits: 0.5 }),
  shadowstep: S('影渡り', 8, '#9a80e0', 'enemy', { dmg: 50 }, (p) => `一番近い敵の背後へ瞬間移動し ${p.dmg} ダメージ。`),
  poison: S('毒雲', 11, '#b0d040', 'enemy', { dot: 16, dur: 5 }, (p) => `毒の雲を広げる。${p.dur} 秒、毎秒 ${p.dot} ダメージ。`, { dur: 0.5 }),
  curse: S('呪い', 10, '#a060e0', 'enemy', { amp: 35, dur: 6 }, (p) => `敵に呪いをかけ、受けるダメージ +${p.amp}%（${p.dur} 秒）。`, { amp: 5 }),
  drain: S('吸命', 8, '#8060c0', 'enemy', { dmg: 40, heal: 20 }, (p) => `敵の命を吸い ${p.dmg} ダメージ。自分を ${p.heal} 回復。`),

  // ---- 最終ジョブのスキル（エフェクトの組み合わせと色替え）。cast は順番に実行する手順 ----
  // 剣士
  aegis: S('聖盾', 18, '#ffe08a', 'self', { shield: 60, def: 15, dur: 8 }, (p) => `近くの全員に ${p.shield} のシールドと被ダメージ -${p.def}%（${p.dur} 秒）。`, { def: 2 },
    [{ fx: 'sunburst', p: 'gold', dy: -18 }, { fx: 'featherBurst', dy: -20 }, { snd: 'ward' }, { shield: 260 }, { buff: { def: 'def' }, r: 260 }]),
  fortress: S('不動の構え', 15, '#a8b8d0', 'self', { dmg: 30, def: 35, dur: 5 }, (p) => `大地を踏みしめ周囲に ${p.dmg} ダメージ。${p.dur} 秒間、被ダメージ -${p.def}%。`, { def: 3 },
    [{ fx: 'groundSlam' }, { snd: 'slam' }, { shake: 7 }, { aoe: 'self', r: 110, opt: { knock: 300 } }, { buff: { def: 'def' }, self: true }]),
  earthwall: S('岩牙の陣', 16, '#c8a070', 'self', { dmg: 44, stun: 1.8 }, (p) => `足元から岩の牙が広がり ${p.dmg} ダメージ。${p.stun} 秒気絶。`, { stun: 0.2 },
    [{ fx: 'earthSpike' }, { fx: 'dirtExplosion' }, { snd: 'slam' }, { aoe: 'self', r: 130, delay: 0.25, opt: { knock: 120 } }]),
  bloodstorm: S('血の嵐', 12, '#ff4a5a', 'self', { dmg: 42, heal: 25 }, (p) => `赤い旋風で周囲に ${p.dmg} ダメージ。自分を ${p.heal} 回復。`, {},
    [{ fx: 'spinSlash', p: 'red' }, { snd: 'heavy' }, { aoe: 'self', r: 110, opt: { knock: 260 } }, { healSelf: 1 }]),
  cleave: S('大断ち', 7, '#ffd0a0', 'enemy', { dmg: 62 }, (p) => `前方を豪快に断ち切り ${p.dmg} ダメージ。`, {},
    [{ fx: 'heavyCleave', f: 1 }, { snd: 'heavy' }, { shake: 6, delay: 0.3 }, { cone: 1.2, r: 110, delay: 0.25, opt: { knock: 340 } }]),
  cataclysm: S('天崩', 24, '#c89070', 'enemy', { dmg: 150 }, (p) => `巨岩を呼び落とす。広い範囲に ${p.dmg} ダメージ。`, {},
    [{ fx: 'meteor', at: 'target', p: 'stone' }, { aoe: 'target', r: 140, delay: 0.62, opt: { knock: 360 } }, { fx: 'groundSlam', at: 'target', delay: 0.62 }, { shake: 14, delay: 0.62 }, { snd: 'slam', delay: 0.62 }]),
  // 弓使い
  snipe: S('必中の一矢', 14, '#ffe68a', 'enemy', { dmg: 130 }, (p) => `一番近い敵を確実に射抜く。${p.dmg} ダメージ。`, {},
    [{ fx: 'smite', at: 'target', p: 'gold' }, { snd: 'bow' }, { aoe: 'target', r: 26, delay: 0.54, opt: { knock: 200 } }], 'arrow'),
  volley: S('扇の連射', 7, '#f0e0b0', 'enemy', { dmg: 22, n: 5 }, (p) => `扇状に ${p.n} 本の矢を放つ。各 ${p.dmg} ダメージ。`, { n: 0.5 },
    [{ snd: 'bow' }, { proj: { kind: 'arrow', sp: 680, life: 0.8, r: 8, fan: 0.2 } }], 'arrow'),
  stormarrow: S('雷の矢', 12, '#9ad0ff', 'enemy', { dmg: 58 }, (p) => `雷をまとった矢が敵を貫く。線上の敵に ${p.dmg} ダメージ。`, {},
    [{ snd: 'zap' }, { fx: 'zapHit', at: 'target' }, { proj: { kind: 'arrow', sp: 950, life: 0.6, r: 10, pierce: true, rar: 2 } }], 'zapHit'),
  grove: S('生命の森', 18, '#8ad070', 'self', { dot: 14, hot: 8, dur: 5 }, (p) => `${p.dur} 秒、森が広がる。敵に毎秒 ${p.dot} ダメージ＋鈍足、仲間を毎秒 ${p.hot} 回復。`, { dur: 0.5 },
    [{ fx: 'healingBloom' }, { fx: 'rootSnare' }, { zone: 'self', r: 130, slow: 1, vis: 'thorn' }]),
  minefield: S('爆裂罠', 10, '#ffb050', 'enemy', { dmg: 70 }, (p) => `爆弾を投げ込む。少し遅れて範囲に ${p.dmg} ダメージ。`, {},
    [{ fx: 'grenade', at: 'target' }, { aoe: 'target', r: 100, delay: 1.7, opt: { knock: 300 } }, { shake: 8, delay: 1.7 }, { snd: 'boom', delay: 1.7 }]),
  toxicarrow: S('毒の矢', 9, '#b8e040', 'enemy', { dmg: 30, dot: 14, dur: 4 }, (p) => `毒矢が貫き ${p.dmg} ダメージ。着弾点に毒だまりが ${p.dur} 秒残り、毎秒 ${p.dot}。`, {},
    [{ snd: 'bow' }, { proj: { kind: 'arrow', sp: 800, life: 0.7, r: 9, pierce: true, rar: 1 } }, { fx: 'toxicPuddle', at: 'target', life: 'dur' }, { zone: 'target', r: 75, slow: 1 }], 'acidSplash'),
  // 魔導士
  inferno: S('業火の輪', 14, '#ff6a2a', 'self', { dmg: 50, dot: 18, dur: 3 }, (p) => `炎の輪が広がり ${p.dmg} ダメージ＋炎上。${p.dur} 秒燃え続け毎秒 ${p.dot}。`, {},
    [{ fx: 'fireRing' }, { snd: 'boom' }, { aoe: 'self', r: 135, delay: 0.2, opt: { burn: true, knock: 200 } }, { zone: 'self', r: 110 }]),
  bluefire: S('蒼炎弾', 6, '#5ab0ff', 'enemy', { dmg: 62 }, (p) => `高温の蒼い火球。爆発で ${p.dmg} ダメージ＋炎上。`, {},
    [{ snd: 'fire' }, { proj: { kind: 'bluefire', sp: 520, life: 1.4, r: 11 } }], 'fireball'),
  firetornado: S('炎の竜巻', 18, '#ff8a3a', 'enemy', { dot: 42, dur: 4 }, (p) => `敵の場所に炎の竜巻。${p.dur} 秒、毎秒 ${p.dot} ダメージ＋炎上。`, { dur: 0.5 },
    [{ fx: 'fireTornado', at: 'target', life: 'dur' }, { snd: 'fire' }, { zone: 'target', r: 80 }]),
  blizzard: S('吹雪', 14, '#a6ecff', 'enemy', { dot: 24, dur: 4 }, (p) => `吹雪を起こす。${p.dur} 秒、毎秒 ${p.dot} ダメージ＋鈍足。`, { dur: 0.5 },
    [{ fx: 'blizzardVortex', at: 'target', life: 'dur' }, { snd: 'freeze' }, { zone: 'target', r: 95, slow: 1.5, vis: 'ice' }]),
  icefall: S('氷柱の列', 11, '#dcfbff', 'enemy', { dmg: 60, stun: 1 }, (p) => `氷の柱が突き出し ${p.dmg} ダメージ。${p.stun} 秒凍らせる。`, { stun: 0.2 },
    [{ fx: 'iceSpikes', at: 'target', ox: -90 }, { snd: 'freeze' }, { aoe: 'target', r: 90, delay: 0.35, opt: { slow: 3, knock: 80 } }]),
  thunderclap: S('雷鳴', 13, '#c8b8ff', 'self', { dmg: 64, stun: 1.2 }, (p) => `雷鳴を轟かせ周囲に ${p.dmg} ダメージ。${p.stun} 秒気絶。`, { stun: 0.2 },
    [{ fx: 'thunderclap' }, { snd: 'zap' }, { shake: 9 }, { aoe: 'self', r: 125, opt: { knock: 240 } }]),
  // 癒し手
  wisp: S('癒しの精霊', 14, '#7fe8c0', 'self', { hot: 10, dur: 7 }, (p) => `精霊を呼ぶ。${p.dur} 秒、近くの仲間を毎秒 ${p.hot} 回復。`, { dur: 0.5 },
    [{ fx: 'spiritFlame', dy: -24, p: 'green', life: 'dur' }, { snd: 'heal' }, { zone: 'self', r: 150 }]),
  sanctuary: S('聖域', 30, '#ffeeb0', 'self', { hot: 22, def: 25, dur: 6 }, (p) => `聖なる陣を敷く。${p.dur} 秒、毎秒 ${p.hot} 回復。近くの全員の被ダメージ -${p.def}%。`, { def: 3 },
    [{ fx: 'runeCircle', p: 'gold', life: 'dur', ground: 1 }, { fx: 'holyPillar', p: 'gold' }, { snd: 'level' }, { zone: 'self', r: 140, vis: 'bloom' }, { buff: { def: 'def' }, r: 200 }]),
  judgement: S('天罰', 20, '#fff0a0', 'enemy', { dmg: 120, heal: 30 }, (p) => `天からの光で ${p.dmg} ダメージ。近くの仲間を ${p.heal} 回復。`, {},
    [{ fx: 'sunburst', at: 'target', p: 'gold', dy: -20 }, { fx: 'smite', at: 'target' }, { aoe: 'target', r: 85, delay: 0.54, opt: { knock: 240 } }, { heal: 220, delay: 0.54 }]),
  holyfist: S('聖拳', 6, '#ffd870', 'enemy', { dmg: 48, heal: 14 }, (p) => `光をまとった拳で ${p.dmg} ダメージ。自分を ${p.heal} 回復。`, {},
    [{ fx: 'uppercut', p: 'gold', f: 1 }, { snd: 'heavy' }, { cone: 1.1, r: 90, delay: 0.1, opt: { knock: 280 } }, { healSelf: 1 }]),
  radiance: S('光輪', 12, '#ffefb0', 'self', { dmg: 44, heal: 22 }, (p) => `光の輪が広がり ${p.dmg} ダメージ。近くの仲間を ${p.heal} 回復。`, {},
    [{ fx: 'spinSlash', p: 'gold' }, { fx: 'heal' }, { snd: 'heal' }, { aoe: 'self', r: 115, opt: { knock: 200 } }, { heal: 200 }]),
  // 影の刃
  execute: S('断罪', 10, '#c080ff', 'enemy', { dmg: 70 }, (p) => `死神の一閃で ${p.dmg} ダメージ。HP が半分以下の敵には 2 倍。`, {},
    [{ fx: 'scytheReap', p: 'violet', f: 1 }, { snd: 'heavy' }, { cone: 1.4, r: 105, delay: 0.3, opt: { knock: 160, execute: true } }]),
  bladedance: S('刃の舞', 9, '#d0b8ff', 'self', { dmg: 36, haste: 20, dur: 4 }, (p) => `舞うように切り裂き ${p.dmg} ダメージ。${p.dur} 秒、攻撃速度 +${p.haste}%。`, {},
    [{ fx: 'spinSlash', p: 'violet' }, { snd: 'swing' }, { aoe: 'self', r: 95, opt: { knock: 120 } }, { buff: { haste: 'haste' }, self: true }]),
  phantom: S('幻影斬', 16, '#8a70e0', 'enemy', { dmg: 26, hits: 6 }, (p) => `影の分身が敵を ${p.hits} 回切り裂く。各 ${p.dmg} ダメージ。`, { hits: 0.5 },
    [{ fx: 'darkExplosion', at: 'target', p: 'violet' }, { snd: 'zap' }, { multi: 0.12, r: 120, opt: { knock: 40 } }]),
  plague: S('疫病', 12, '#a8d040', 'enemy', { dmg: 28, dot: 16, dur: 4 }, (p) => `胞子をまき散らし ${p.dmg} ダメージ＋炎症（継続ダメージ）。${p.dur} 秒、毎秒 ${p.dot}。`, {},
    [{ fx: 'sporeBurst', at: 'target' }, { aoe: 'target', r: 100, opt: { burn: true, knock: 40 } }, { zone: 'target', r: 90 }]),
  venomnova: S('毒爆', 18, '#c8f040', 'self', { dmg: 58, dot: 24, dur: 4 }, (p) => `毒が破裂し ${p.dmg} ダメージ。毒だまりが ${p.dur} 秒残り毎秒 ${p.dot}。`, {},
    [{ fx: 'acidSplash' }, { fx: 'toxicPuddle', life: 'dur' }, { snd: 'boom' }, { aoe: 'self', r: 120, opt: { knock: 220 } }, { zone: 'self', r: 105, slow: 1 }]),

  // ---- 鬼だけの最終ジョブのスキル ----
  // 剣士
  tidewall: S('大波の盾', 12, '#62c8f4', 'enemy', { dmg: 58, shield: 45, dur: 6 }, (p) => `大波を前へ押し出し ${p.dmg} ダメージ。自分に ${p.shield} のシールド（${p.dur} 秒）。`, {},
    [{ fx: 'waveCrash', at: 'target' }, { snd: 'freeze' }, { aoe: 'target', r: 120, delay: 0.5, opt: { knock: 380 } }, { shield: 40 }]),
  bubbleguard: S('泡の守り', 16, '#a6ecff', 'self', { hot: 12, def: 18, dur: 6 }, (p) => `泡に包まれる。${p.dur} 秒、毎秒 ${p.hot} 回復、近くの全員の被ダメージ -${p.def}%。`, { def: 2 },
    [{ fx: 'bubbles', life: 'dur' }, { snd: 'heal' }, { zone: 'self', r: 130 }, { buff: { def: 'def' }, r: 200 }]),
  doomswing: S('終末の一閃', 22, '#ff8a3a', 'self', { dmg: 170 }, (p) => `剣を地に叩きつけ大爆発。周囲に ${p.dmg} ダメージ。`, {},
    [{ fx: 'plasmaExplosion', p: 'fire', dy: -10 }, { snd: 'boom' }, { shake: 14 }, { aoe: 'self', r: 165, delay: 0.2, opt: { knock: 460, burn: true } }]),
  shadowcleave: S('影喰らい', 9, '#7a5ac0', 'enemy', { dmg: 54, heal: 16 }, (p) => `影の触手が敵を裂く。${p.dmg} ダメージ、自分を ${p.heal} 回復。`, {},
    [{ fx: 'shadowTendrils', at: 'target', life: 1.4 }, { snd: 'heavy' }, { aoe: 'target', r: 100, delay: 0.3, opt: { knock: 120, slow: 2 } }, { healSelf: 1 }]),
  // 弓使い
  rocketarrow: S('打ち上げ矢', 8, '#ff9ad0', 'enemy', { dmg: 72 }, (p) => `花火の矢を打ち上げる。敵の頭上で開き ${p.dmg} ダメージ。`, {},
    [{ fx: 'fireworkRocket', at: 'target' }, { snd: 'bow' }, { aoe: 'target', r: 100, delay: 1.0, opt: { knock: 220, burn: true } }, { snd: 'boom', delay: 1.0 }]),
  finale: S('大輪の宴', 24, '#ffd870', 'self', { dmg: 62, hits: 4 }, (p) => `周囲に大輪の花火が ${p.hits} 発開く。各 ${p.dmg} ダメージ。`, { hits: 0.5 },
    [{ fx: 'fireworkBurst', ox: -90, dy: -30 }, { fx: 'fireworkBurst', ox: 90, dy: -40, delay: 0.3 }, { fx: 'fireworkBurst', dy: -70, delay: 0.6 }, { snd: 'boom' }, { multi: 0.22, r: 260, opt: { knock: 120, burn: true } }]),
  thundercloud: S('雷雲', 18, '#9ad0ff', 'enemy', { dot: 38, dur: 4 }, (p) => `敵の頭上に雷雲を呼ぶ。${p.dur} 秒、毎秒 ${p.dot} ダメージ。`, { dur: 0.5 },
    [{ fx: 'stormCloud', at: 'target', life: 'dur' }, { snd: 'zap' }, { zone: 'target', r: 95, slow: 0.6 }]),
  vortex: S('渦潮', 14, '#3a8bd8', 'enemy', { dot: 18, dur: 4 }, (p) => `渦潮が敵を中心へ引き寄せる。${p.dur} 秒、毎秒 ${p.dot} ダメージ。`, { dur: 0.5 },
    [{ fx: 'whirlpool', at: 'target', life: 'dur', ground: 1 }, { snd: 'freeze' }, { zone: 'target', r: 120, slow: 1, pull: 150 }]),
  // 魔導士
  arcaneorb: S('秘術の宝珠', 9, '#c080ff', 'enemy', { dmg: 44 }, (p) => `ゆっくり進む宝珠が敵を貫き続ける。${p.dmg} ダメージ。`, {},
    [{ snd: 'cast' }, { fx: 'manaBurst', dy: -6 }, { proj: { kind: 'orb', sp: 190, life: 2.4, r: 26, pierce: true } }], 'arcaneOrb'),
  manastorm: S('魔力暴走', 20, '#e0a0ff', 'self', { dmg: 120 }, (p) => `溜めた魔力を解き放ち、周囲に ${p.dmg} ダメージ。スキルの再使用がすぐ終わる。`, {},
    [{ fx: 'manaBurst' }, { snd: 'boom' }, { shake: 10 }, { aoe: 'self', r: 150, delay: 0.25, opt: { knock: 320 } }, { resetCd: 1 }]),
  timestop: S('時間停止', 30, '#d0c0ff', 'self', { stun: 3 }, (p) => `周りの時を止める。範囲の敵は ${p.stun} 秒動けない。`, { stun: 0.3 },
    [{ fx: 'timeStop' }, { snd: 'portal' }, { aoe: 'self', r: 340, opt: { knock: 0, noDmg: true } }]),
  starstorm: S('星降る夜', 22, '#fff0a0', 'enemy', { dmg: 44, hits: 6 }, (p) => `星が ${p.hits} 回降り注ぐ。各 ${p.dmg} ダメージ。`, { hits: 0.5 },
    [{ fx: 'starFall', at: 'target' }, { fx: 'starFall', at: 'target', ox: 60, delay: 0.5 }, { snd: 'zap' }, { multi: 0.2, r: 170, opt: { knock: 80 } }]),
  // 癒し手
  holyspring: S('癒しの泉', 16, '#7fd8ff', 'self', { hot: 26, dur: 5 }, (p) => `足元に泉が湧く。${p.dur} 秒、中の仲間を毎秒 ${p.hot} 回復。`, { dur: 0.5 },
    [{ fx: 'fountain', life: 'dur' }, { snd: 'heal' }, { zone: 'self', r: 110 }]),
  aquaorb: S('水の宝珠', 10, '#62c8f4', 'self', { heal: 36, shield: 30, dur: 6 }, (p) => `水の宝珠が包む。${p.heal} 回復し、${p.shield} のシールド（${p.dur} 秒）。`, {},
    [{ fx: 'waterOrb', dy: -6, life: 1.6 }, { snd: 'heal' }, { heal: 220 }, { shield: 220 }]),
  haloblade: S('光輪の裁き', 10, '#fff0b0', 'self', { dmg: 70, crit: 20, dur: 5 }, (p) => `頭上の光輪が広がり ${p.dmg} ダメージ。${p.dur} 秒、会心率 +${p.crit}%。`, {},
    [{ fx: 'halo', dy: -44, life: 1.2 }, { fx: 'holyPillar', p: 'gold' }, { snd: 'level' }, { aoe: 'self', r: 125, delay: 0.3, opt: { knock: 240 } }, { buff: { crit: 'crit' }, self: true }]),
  eclipse: S('蝕', 26, '#ffc060', 'enemy', { dmg: 130, heal: 40 }, (p) => `太陽を蝕む光が ${p.dmg} ダメージ。全員を ${p.heal} 回復。`, {},
    [{ fx: 'eclipse', at: 'target', dy: -60, life: 1.6 }, { fx: 'holyPillar', at: 'target', p: 'gold', delay: 0.5 }, { aoe: 'target', r: 120, delay: 1.0, opt: { knock: 280 } }, { heal: 500, delay: 1.0 }, { shake: 10, delay: 1.0 }]),
  // 影の刃
  grasp: S('亡者の手', 13, '#8060d0', 'enemy', { dmg: 46, stun: 2 }, (p) => `地面から無数の手が伸びる。${p.dmg} ダメージ、${p.stun} 秒動けない。`, { stun: 0.2 },
    [{ fx: 'graspingHands', at: 'target' }, { snd: 'heavy' }, { aoe: 'target', r: 110, delay: 0.4, opt: { knock: 0 } }]),
  tentacle: S('深淵の触手', 11, '#6a4ab0', 'self', { dmg: 58, dot: 16, dur: 3 }, (p) => `周囲に触手が暴れる。${p.dmg} ダメージ。${p.dur} 秒、毎秒 ${p.dot}。`, {},
    [{ fx: 'shadowTendrils', life: 'dur' }, { snd: 'heavy' }, { aoe: 'self', r: 120, delay: 0.3, opt: { knock: 140 } }, { zone: 'self', r: 110, slow: 1 }]),
  blackhole: S('黒い穴', 26, '#50308a', 'enemy', { dmg: 100, dot: 24, dur: 3 }, (p) => `黒い穴が敵を吸い込む。${p.dur} 秒、毎秒 ${p.dot}、最後に爆発して ${p.dmg} ダメージ。`, {},
    [{ fx: 'blackHole', at: 'target', life: 'dur' }, { snd: 'portal' }, { zone: 'target', r: 160, pull: 260 }, { fx: 'implosion', at: 'target', delay: 2.4 }, { aoe: 'target', r: 150, delay: 3, opt: { knock: 360 } }, { shake: 12, delay: 3 }]),
  hexskull: S('呪骸の群れ', 12, '#a0e080', 'enemy', { dmg: 28, hits: 5, amp: 30, dur: 6 }, (p) => `骸骨が敵に群がる。${p.hits} 回、各 ${p.dmg} ダメージ。`, { hits: 0.5 },
    [{ fx: 'necroSkulls', at: 'target', life: 1.6 }, { fx: 'hexSigil', at: 'target', life: 1.2, ground: 1 }, { snd: 'cast' }, { multi: 0.18, r: 170, opt: { knock: 30 } }]),

  // ---- 召喚師 ----
  sum_wisp: S('灯火の精', 8, '#6ae0e0', 'self', { dmg: 12, dur: 14, n: 1 }, (p) => `火の精を ${p.n} 体呼ぶ（${p.dur} 秒）。1 回 ${p.dmg} ダメージ。`, { n: 0.25, dur: 1 }, [{ summon: 'wisp', el: 'fire' }], 'critWisp'),
  sum_bat: S('蝙蝠の群れ', 10, '#b090c0', 'self', { dmg: 9, dur: 12, n: 2 }, (p) => `吸血蝙蝠を ${p.n} 体呼ぶ（${p.dur} 秒）。1 回 ${p.dmg} ダメージ。与えた分を少し回復。`, { n: 0.4 }, [{ summon: 'bat', el: 'shadow' }], 'critBat'),
  sum_skull: S('飛頭蛮', 12, '#ffb060', 'self', { dmg: 22, dur: 12, n: 1 }, (p) => `燃える骸骨を ${p.n} 体呼ぶ（${p.dur} 秒）。1 回 ${p.dmg} ダメージ。突撃して爆発する。`, { n: 0.25 }, [{ summon: 'skull', el: 'fire' }], 'critSkull'),
  sum_bird: S('猛禽の友', 9, '#ffe08a', 'self', { dmg: 14, dur: 12, n: 2 }, (p) => `猛禽を ${p.n} 体呼ぶ（${p.dur} 秒）。素早く急降下する。1 回 ${p.dmg} ダメージ。`, { n: 0.4 }, [{ summon: 'bird', el: 'holy' }], 'critBird'),
  sum_frog: S('大蛙の舌', 14, '#8ac850', 'self', { dmg: 20, dur: 15, n: 2 }, (p) => `大蛙を ${p.n} 体呼ぶ（${p.dur} 秒）。遠くの敵を舌で打つ。1 回 ${p.dmg} ダメージ。`, { n: 0.4 }, [{ summon: 'frog', el: 'poison' }], 'critFrog'),
  sum_snake: S('毒蛇の巣', 11, '#b8e040', 'self', { dmg: 12, dur: 14, n: 3 }, (p) => `毒蛇を ${p.n} 体呼ぶ（${p.dur} 秒）。噛んだ敵を毒で蝕む。1 回 ${p.dmg} ダメージ。`, { n: 0.5 }, [{ summon: 'snake', el: 'poison' }], 'critSnake'),
  sum_slime: S('粘体の壁', 16, '#47c752', 'self', { dmg: 16, dur: 18, n: 2 }, (p) => `スライムを ${p.n} 体呼ぶ（${p.dur} 秒）。敵を鈍らせる。1 回 ${p.dmg} ダメージ。`, { n: 0.4 }, [{ summon: 'slime', el: 'ice' }], 'critSlime'),
  sum_fish: S('空泳ぐ群れ', 12, '#62c8f4', 'self', { dmg: 11, dur: 14, n: 3 }, (p) => `魚の群れを ${p.n} 体呼ぶ（${p.dur} 秒）。泡を飛ばす。1 回 ${p.dmg} ダメージ。`, { n: 0.5 }, [{ summon: 'fish', el: 'ice' }], 'critFish'),
  sum_jelly: S('雷海月', 18, '#c8b8ff', 'self', { dmg: 26, dur: 16, n: 2 }, (p) => `雷海月を ${p.n} 体呼ぶ（${p.dur} 秒）。電撃で敵を痺れさせる。1 回 ${p.dmg} ダメージ。`, { n: 0.4 }, [{ summon: 'jelly', el: 'thunder' }], 'critJelly'),
  sum_ghost: S('亡霊の列', 13, '#a3b8e2', 'self', { dmg: 18, dur: 15, n: 2 }, (p) => `亡霊を ${p.n} 体呼ぶ（${p.dur} 秒）。呪って敵の防御を下げる。1 回 ${p.dmg} ダメージ。`, { n: 0.4 }, [{ summon: 'ghost', el: 'shadow' }], 'critGhost'),
  sum_army: S('百鬼夜行', 40, '#ff6a8a', 'self', { dmg: 26, dur: 12, n: 6 }, (p) => `亡者の軍勢を ${p.n} 体呼ぶ（${p.dur} 秒）。1 回 ${p.dmg} ダメージ。`, { n: 0.5 }, [{ fx: 'darkExplosion', p: 'violet' }, { summon: 'mix', el: 'shadow' }], 'critSkull'),
  sum_eye: S('監視の魔眼', 13, '#ff8ab0', 'self', { dmg: 24, dur: 15, n: 1 }, (p) => `魔眼を ${p.n} 体呼ぶ（${p.dur} 秒）。遠くから光線を撃つ。1 回 ${p.dmg} ダメージ。`, { n: 0.3 }, [{ summon: 'eye', el: 'thunder' }], 'critEye'),
  sum_butterfly: S('癒し蝶', 16, '#ffd0e8', 'self', { dmg: 8, dur: 16, n: 2 }, (p) => `蝶を ${p.n} 体呼ぶ（${p.dur} 秒）。主人を癒す鱗粉をまく。`, { n: 0.4 }, [{ summon: 'butterfly', el: 'holy' }], 'critButterfly'),
  sum_void: S('虚無の胎', 34, '#7050c0', 'enemy', { dmg: 90, dot: 20, dur: 3 }, (p) => `黒い穴を開く。毎秒 ${p.dot}、爆発で ${p.dmg} ダメージ。亡霊も湧き出す。`, {},
    [{ fx: 'blackHole', at: 'target', life: 'dur' }, { zone: 'target', r: 150, pull: 220 }, { summon: 'ghost', el: 'shadow', count: 3 }, { aoe: 'target', r: 140, delay: 3, opt: { knock: 300 } }, { fx: 'implosion', at: 'target', delay: 2.4 }], 'blackHole'),
  // ペットですらないもの
  sum_armor: S('錆鎧の兵', 12, '#a8b8d0', 'self', { dmg: 20, dur: 18, n: 1 }, (p) => `動く鎧を ${p.n} 体呼ぶ（${p.dur} 秒）。前に出て斬る。1 回 ${p.dmg} ダメージ。`, { n: 0.25, dur: 1 }, [{ summon: 'armor', el: 'ice' }], 'summonRise'),
  sum_golem: S('巨像召喚', 50, '#c8c0b0', 'self', { dmg: 70, dur: 20, n: 1 }, (p) => `苔の巨像を呼ぶ（${p.dur} 秒）。一撃 ${p.dmg} ダメージ、時々まわりを砕く。`, { dur: 1 }, [{ fx: 'groundSlam' }, { shake: 10 }, { summon: 'golem', el: 'poison' }], 'groundSlam'),
  sum_turret: S('雷の塔', 14, '#9ad0ff', 'self', { dmg: 24, dur: 16, n: 1 }, (p) => `その場に雷の塔を建てる（${p.dur} 秒）。動かないが遠くまで撃つ。1 回 ${p.dmg} ダメージ。`, { dur: 1 }, [{ summon: 'turret', el: 'thunder' }], 'teslaCoil'),
  sum_discs: S('回転刃', 15, '#d0e8ff', 'self', { dmg: 18, dur: 12, n: 3 }, (p) => `光の刃を ${p.n} 枚呼ぶ（${p.dur} 秒）。自分の周りを回り、触れた敵に ${p.dmg} ダメージ。`, { n: 0.5 }, [{ summon: 'disc', el: 'thunder' }], 'energyDisc'),
  sum_cloud: S('雷雲招来', 16, '#b0b8e8', 'self', { dmg: 34, dur: 14, n: 1 }, (p) => `敵を追いかける雷雲を呼ぶ（${p.dur} 秒）。真下へ落雷して ${p.dmg} ダメージ。`, { dur: 1 }, [{ summon: 'cloud', el: 'thunder' }], 'stormCloud'),
  sum_brazier: S('業火の祭壇', 15, '#ff8a3a', 'self', { dmg: 26, dur: 16, n: 1 }, (p) => `火の祭壇を置く（${p.dur} 秒）。近づいた敵を焼き、${p.dmg} ダメージ＋炎上。`, { dur: 1 }, [{ summon: 'brazier', el: 'fire' }], 'brazier'),
  sum_orb: S('水の宝珠', 18, '#62c8f4', 'self', { dmg: 8, dur: 16, n: 1 }, (p) => `宝珠が付き添う（${p.dur} 秒）。主人と仲間の HP を少しずつ回復する。`, { dur: 1 }, [{ summon: 'orb', el: 'ice' }], 'waterOrb'),
};

// マップで拾う巻物には、ジョブごとの向き不向きがある
export const AFFINITY = {
  knight: { good: ['whirl', 'ward'], bad: ['fireball', 'chain', 'lance', 'strike'] },
  ranger: { good: ['dash', 'poison', 'chain'], bad: ['heal', 'ward', 'whirl'] },
  mage: { good: ['fireball', 'nova', 'chain', 'lance', 'strike'], bad: ['whirl', 'dash'] },
  healer: { good: ['heal', 'ward', 'bloom'], bad: ['fireball', 'strike', 'whirl', 'poison'] },
  rogue: { good: ['dash', 'poison', 'whirl'], bad: ['heal', 'ward', 'bloom', 'nova'] },
  summoner: { good: [], bad: [] },
};
// 召喚師の巻物
export const SUMMON_POOL = ['sum_wisp', 'sum_bat', 'sum_skull', 'sum_bird', 'sum_frog', 'sum_snake', 'sum_slime', 'sum_fish', 'sum_jelly', 'sum_ghost', 'sum_eye', 'sum_butterfly', 'sum_armor', 'sum_golem', 'sum_turret', 'sum_discs', 'sum_cloud', 'sum_brazier', 'sum_orb'];
export const AFF_GOOD = 1.25, AFF_BAD = 0.5;
export function affinityOf(id, job) {
  const a = AFFINITY[job];
  return !a ? 0 : a.good.includes(id) ? 1 : a.bad.includes(id) ? -1 : 0;
}
export const affinityLabel = (id, job) => ({ 1: '得意 +25%', '-1': '不得意 -50%' })[affinityOf(id, job)] || '';
// マップで巻物として拾えるスキル（それ以外はスキルツリー専用）
export const SCROLL_POOL = ['fireball', 'whirl', 'dash', 'heal', 'nova', 'chain', 'ward', 'lance', 'bloom', 'poison', 'strike'];

export function skillPower(id, lvl, s = {}) {
  const b = SKILLS[id], L = lvl - 1, r = {};
  const af = affinityOf(id, s.job), k = af > 0 ? AFF_GOOD : af < 0 ? AFF_BAD : 1;
  const m = (1 + 0.25 * L) * (s.atk ?? 1) * k, hm = (1 + 0.2 * L) * (s.heal ?? 1) * k;
  r.cd = +(b.cd * (1 - 0.06 * L) * (1 - (s.cdr || 0))).toFixed(1);
  for (const [k, v] of Object.entries(b.p)) {
    if (k === 'dmg' || k === 'dot') r[k] = Math.round(v * m);
    else if (k === 'heal' || k === 'shield' || k === 'hot') r[k] = Math.round(v * hm);
    else r[k] = +(v + (b.up[k] || 0) * L).toFixed(2);
  }
  if (r.jumps) r.jumps = Math.floor(r.jumps);
  if (r.hits) r.hits = Math.floor(r.hits);
  if (r.n) r.n = Math.floor(r.n);
  return r;
}

// 難易度。hp/dmg/count は敵、loot は宝箱とボスのレア度、scroll/sp は巻物とスキルポイントの出やすさ
export const DIFFS = {
  peace: { name: '平和', color: '#7fd16f', desc: 'のんびり進めます。敵は v2 と同じくらいの硬さで、攻撃は少し弱めです。', hp: 1, dmg: 0.8, count: 0.9, spd: 1, cd: 1.1, elite: 0.7, xp: 1, loot: 0, minBoss: 0, minChest: 0, scroll: 1, sp: 1 },
  normal: { name: '少し難しい', color: '#ffb340', desc: '敵が硬く、攻撃も痛くなります。v2 が簡単に感じた人向けです。', hp: 1.8, dmg: 1.35, count: 1.1, spd: 1.05, cd: 0.95, elite: 1.2, xp: 1.15, loot: 0.04, minBoss: 1, minChest: 0, scroll: 1, sp: 1 },
  oni: { name: '鬼', color: '#ff5f7e', desc: '敵の数値が大幅に増え、巻物とスキルポイントは出にくくなります。そのかわり宝箱とボスから高レアが出ます。', hp: 3.6, dmg: 2.3, count: 1.45, spd: 1.12, cd: 0.8, elite: 2, xp: 1.5, loot: 0.3, minBoss: 3, minChest: 2, scroll: 0.5, sp: 0.6 },
};
export const DIFF_KEYS = ['peace', 'normal', 'oni'];

function rollRarity(floor, bonus = 0, min = 0) {
  const n = rollRarityRaw(floor, bonus);
  return Math.max(n, min);
}

function rollRarityRaw(floor, bonus = 0) {
  const luck = floor * 0.035 + bonus;
  const r = Math.random();
  if (r < 0.012 + luck * 0.18) return 4;
  if (r < 0.05 + luck * 0.45) return 3;
  if (r < 0.17 + luck * 0.8) return 2;
  if (r < 0.5 + luck) return 1;
  return 0;
}

function moreAffixes(have, n) {
  const a = [...have], pool = Object.keys(AFFIX);
  while (a.length < n) { const x = pick(pool); if (!a.includes(x)) a.push(x); }
  return a;
}

export function makeWeapon(base, rarity, floor = 1, affixes = []) {
  const b = WEAPONS[base];
  const rr = RARITY[rarity];
  const scale = 1 + 0.11 * (floor - 1);
  const it = {
    id: uid(), cat: 'weapon', base, rarity, affixes,
    dmg: Math.max(1, Math.round(b.dmg * rr.mult * scale * rand(0.92, 1.08))),
    rate: +(b.rate * (affixes.includes('swift') ? 0.82 : 1)).toFixed(3),
    crit: +(0.06 + rarity * 0.012 + (affixes.includes('crit') ? 0.15 : 0)).toFixed(3),
  };
  it.name = weaponName(base, rarity, affixes);
  if (rarity === 6) it.rate = UNIQUE[base].rate;
  return it;
}
const weaponName = (base, rarity, affixes) => {
  const b = WEAPONS[base];
  if (rarity === 6) return UNIQUE[base].name;
  if (rarity === 5) return `神話・${b.legend}`;
  if (rarity === 4) return b.legend;
  return (affixes.length ? AFFIX[affixes[0]].pre : '') + b.name;
};

export function rollWeapon(floor, bonus = 0, min = 0) {
  const rarity = rollRarity(floor, bonus, min);
  return makeWeapon(pick(Object.keys(WEAPONS)), rarity, floor, moreAffixes([], AFFIX_COUNT[rarity]));
}

/** 同じ武器種・同じレアリティの武器を合成して 1 段上の武器にする。一番強かった武器を引き継ぐ */
export function fuseWeapons(list) {
  const best = list.reduce((a, b) => (b.dmg > a.dmg ? b : a));
  const rarity = best.rarity + 1;
  const affixes = moreAffixes(best.affixes, AFFIX_COUNT[rarity]);
  const b = WEAPONS[best.base];
  return {
    id: uid(), cat: 'weapon', base: best.base, rarity, affixes,
    dmg: Math.round((best.dmg * RARITY[rarity].mult) / RARITY[best.rarity].mult),
    rate: rarity === 6 ? UNIQUE[best.base].rate : +(b.rate * (affixes.includes('swift') ? 0.82 : 1)).toFixed(3),
    crit: +(0.06 + rarity * 0.012 + (rarity >= 5 ? 0.1 : 0) + (affixes.includes('crit') ? 0.15 : 0)).toFixed(3),
    name: weaponName(best.base, rarity, affixes),
  };
}

// 巻物のレアリティは一度に上がるスキルレベルを決める（レア +1、エピック +2、レジェンド +3）
export function makeScroll(skill, rarity = 2) {
  const gain = Math.max(1, rarity - 1);
  return { id: uid(), cat: 'skill', skill, rarity, gain, name: `${gain > 1 ? `上級巻物(+${gain})` : '巻物'}「${SKILLS[skill].name}」` };
}

// ---------- 防具 ----------
export const GEAR_SLOTS = {
  head: { name: '兜', stat: 'hp', v: 12 },
  body: { name: '鎧', stat: 'def', v: 0.03 },
  hands: { name: '手甲', stat: 'atk', v: 0.04 },
  feet: { name: '靴', stat: 'speed', v: 0.025 },
  charm: { name: '護符', stat: 'cdr', v: 0.02 },
};
export const STAT_INFO = {
  hp: ['最大HP', (v) => `+${Math.round(v)}`],
  hpp: ['最大HP', (v) => `+${Math.round(v * 100)}%`],
  def: ['被ダメージ', (v) => `-${Math.round(v * 100)}%`],
  atk: ['攻撃力', (v) => `+${Math.round(v * 100)}%`],
  speed: ['移動速度', (v) => `+${Math.round(v * 100)}%`],
  cdr: ['スキル再使用', (v) => `-${Math.round(v * 100)}%`],
  crit: ['会心率', (v) => `+${Math.round(v * 100)}%`],
  critDmg: ['会心ダメージ', (v) => `+${Math.round(v * 100)}%`],
  haste: ['攻撃速度', (v) => `+${Math.round(v * 100)}%`],
  heal: ['回復量', (v) => `+${Math.round(v * 100)}%`],
  vamp: ['ダメージ吸収', (v) => `${Math.round(v * 100)}%`],
  regen: ['HP自動回復', (v) => `毎秒 ${v}`],
  dodge: ['回避の再使用', (v) => `-${Math.round(v * 100)}%`],
};
const EXTRA = [['crit', 0.015], ['atk', 0.025], ['hp', 8], ['def', 0.015], ['speed', 0.015], ['cdr', 0.012]];
export const SETS = {
  lantern: { name: '灯守', color: '#ffd27a', two: { hpp: 0.15 }, four: { heal: 0.3, regen: 2 } },
  ember: { name: '烈火', color: '#ff7a3a', two: { atk: 0.12 }, four: { atk: 0.1, aff: ['burn'] } },
  gale: { name: '疾風', color: '#7fe8d6', two: { speed: 0.1 }, four: { haste: 0.15, dodge: 0.35 } },
  bulwark: { name: '鉄壁', color: '#a8b8d0', two: { def: 0.1 }, four: { def: 0.12, hpp: 0.15 } },
  hunter: { name: '影狩り', color: '#b090f0', two: { crit: 0.08 }, four: { critDmg: 0.5, vamp: 0.04 } },
};
const SET_KEYS = Object.keys(SETS);
export const setOfFloor = (floor) => SET_KEYS[Math.floor(floor / 3) % SET_KEYS.length];

export function makeGear(slot, rarity, floor = 1, set = null) {
  const g = GEAR_SLOTS[slot], scale = (1 + 0.5 * rarity) * (1 + 0.08 * (floor - 1));
  const stats = { [g.stat]: +(g.v * scale).toFixed(3) };
  for (let i = 0; i < rarity; i++) {
    const [k, v] = pick(EXTRA);
    stats[k] = +((stats[k] || 0) + v * (1 + 0.04 * floor)).toFixed(3);
  }
  const it = { id: uid(), cat: 'gear', slot, rarity, set, stats, floor };
  it.name = (rarity === 5 ? '神話・' : '') + (set ? SETS[set].name + 'の' : '') + g.name;
  return it;
}
/** 同じレアリティの防具を合成して 1 段上の防具にする。部位とセットは新しくランダムで決まる */
export function fuseGear(list, floor) {
  const f = Math.max(floor, ...list.map((g) => g.floor || 1));
  return makeGear(pick(Object.keys(GEAR_SLOTS)), list[0].rarity + 1, f, pick(SET_KEYS));
}
export function rollGear(floor, bonus = 0, set, min = 0) {
  const rarity = rollRarity(floor, bonus, min);
  const s = set || (rarity >= 1 && Math.random() < 0.7 ? pick(SET_KEYS) : null);
  return makeGear(pick(Object.keys(GEAR_SLOTS)), rarity, floor, s);
}

export function rollLoot(floor, bonus = 0, diff = DIFFS.peace, min = 0) {
  const r = Math.random();
  const sc = 0.28 * diff.scroll;
  if (r < sc) return makeScroll(pick(SCROLL_POOL), Math.min(4, Math.max(2, min)));
  if (r < sc + (1 - sc) * 0.42) return rollGear(floor, bonus, undefined, min);
  return rollWeapon(floor, bonus, min);
}

export const ENEMY_TYPES = ['slime', 'bat', 'skel', 'mage', 'golem', 'slimeL', 'hound', 'wisp', 'thorn', 'toad', 'beetle', 'shade', 'spider', 'bishop', 'behemoth', 'eye'];
export const ENEMIES = {
  slime: { name: '胞子キノコ', hp: 32, spd: 72, dmg: 10, r: 14, xp: 6, dash: 310 },
  slimeL: { name: '大胞子キノコ', hp: 80, spd: 58, dmg: 15, r: 21, xp: 16, dash: 310 },
  bat: { name: '石翼のインプ', hp: 20, spd: 150, dmg: 8, r: 11, xp: 5, fly: true, dash: 430 },
  skel: { name: '錆鎧', hp: 60, spd: 88, dmg: 17, r: 13, xp: 12 },
  mage: { name: '蝋燭の祈祷師', hp: 44, spd: 74, dmg: 13, r: 13, xp: 15 },
  hound: { name: '影喰い狼', hp: 38, spd: 135, dmg: 13, r: 13, xp: 9, dash: 470 },
  wisp: { name: '爆ぜ火', hp: 18, spd: 112, dmg: 26, r: 10, xp: 8, fly: true },
  thorn: { name: '棘吐き花', hp: 50, spd: 26, dmg: 11, r: 14, xp: 13 },
  toad: { name: '酸袋ガエル', hp: 62, spd: 62, dmg: 15, r: 15, xp: 14 },
  beetle: { name: '鉄甲虫', hp: 125, spd: 58, dmg: 20, r: 17, xp: 22, dash: 400, kb: 0.3 },
  shade: { name: '仮面の刺客', hp: 46, spd: 100, dmg: 20, r: 12, xp: 18 },
  golem: { name: '苔の巨像', hp: 1100, spd: 58, dmg: 30, r: 36, xp: 220, boss: true, summon: 'skel' },
  spider: { name: '蝕みの女郎蜘蛛', hp: 950, spd: 86, dmg: 26, r: 34, xp: 240, boss: true, summon: 'hound' },
  bishop: { name: '燭台の大司教', hp: 820, spd: 62, dmg: 24, r: 24, xp: 240, boss: true, fly: true, summon: 'mage' },
  behemoth: { name: '鉄角の暴獣', hp: 1300, spd: 72, dmg: 34, r: 38, xp: 260, boss: true, summon: 'beetle' },
  eye: { name: '深淵の大目玉', hp: 1000, spd: 46, dmg: 22, r: 30, xp: 260, boss: true, fly: true, summon: 'wisp' },
};
export const BOSS_ORDER = ['golem', 'spider', 'bishop', 'behemoth', 'eye'];
// 色違い。同じ色は同じ性格：蒼＝素早い、翠＝硬い、紅＝凶暴
export const VARIANTS = [
  { hp: 1, spd: 1, dmg: 1, cd: 1, xp: 1 },
  { hp: 0.85, spd: 1.3, dmg: 1, cd: 1, xp: 1.2 },
  { hp: 1.55, spd: 0.9, dmg: 1, cd: 1, xp: 1.3 },
  { hp: 1, spd: 1, dmg: 1.35, cd: 0.85, xp: 1.3 },
];

// ---------- コインと拾いもの ----------
export const SELL = [3, 6, 12, 25, 50, 120, 300];
export const makeCoin = (n) => ({ cat: 'coin', n, id: 'c' + uid() });
export const makePotion = () => ({ cat: 'potion', id: 'p' + uid() });
export const makeXpOrb = (n) => ({ cat: 'xp', n, id: 'x' + uid() });
export const makeStar = () => ({ cat: 'star', id: 's' + uid() });
export const makeKey = () => ({ cat: 'key', id: 'k' + uid() });

// ---------- ペット ----------
const RAMP = (...c) => c;
export const ELEMENTS = {
  fire: { name: '炎', color: '#ff8a3a', ramp: RAMP('#2a0a06', '#6a1a0c', '#b83a14', '#f07020', '#ffb040', '#ffe080', '#fff8d0'), desc: '当てた敵を燃やす' },
  ice: { name: '氷', color: '#8fd8ff', ramp: RAMP('#0a1a3a', '#1a3a78', '#2c68b8', '#4ea0e0', '#8fd8ff', '#c8f0ff', '#f4feff'), desc: '当てた敵を鈍らせる' },
  thunder: { name: '雷', color: '#d8c0ff', ramp: RAMP('#160a30', '#2e1c68', '#5238b0', '#8468e8', '#b8a0ff', '#e4d8ff', '#ffffff'), desc: '時々、敵を痺れさせる' },
  poison: { name: '毒', color: '#b8e040', ramp: RAMP('#0e1c06', '#264a10', '#467c1c', '#70b02c', '#a4d844', '#d8f480', '#f8ffd0'), desc: '当てた敵を毒で蝕む' },
  holy: { name: '聖', color: '#ffe08a', ramp: RAMP('#2a1a06', '#5c3c0c', '#a06c18', '#d8a030', '#f8d060', '#fff0a8', '#ffffff'), desc: '与えた分だけ主人を癒す' },
  shadow: { name: '闇', color: '#b090f0', ramp: RAMP('#0c0618', '#221038', '#3e2064', '#624098', '#9070d0', '#c4b0f0', '#f0e8ff'), desc: '当てた敵を呪い、脆くする' },
};
export const ELEM_KEYS = Object.keys(ELEMENTS);
// fx は pixelfx の生き物。fly は壁を越えて飛ぶ。range は射程（0 なら接近戦）
export const PETS = {
  bat: { name: 'コウモリ', fx: 'critBat', fly: true, range: 0, rate: 0.7, mul: 0.8, spd: 210, skill: { name: '吸血の羽音', desc: '周囲の敵を傷つけ、主人を回復する。', type: 'drain' } },
  bird: { name: '小鳥', fx: 'critBird', fly: true, range: 0, rate: 0.6, mul: 0.8, spd: 250, skill: { name: '急降下', desc: '狙った敵へ大ダメージの急降下。', type: 'strike' } },
  butterfly: { name: '蝶', fx: 'critButterfly', fly: true, range: 150, rate: 1.1, mul: 0.5, spd: 150, skill: { name: '癒しの鱗粉', desc: '主人と仲間を回復する。', type: 'heal' } },
  eye: { name: '目玉', fx: 'critEye', fly: true, range: 280, rate: 1.2, mul: 1.1, spd: 120, skill: { name: '怪光線', desc: '敵へ太い光線を撃ち、気絶させる。', type: 'stun' } },
  fish: { name: '魚の群れ', fx: 'critFish', fly: true, range: 200, rate: 0.8, mul: 0.6, spd: 170, skill: { name: '水泡弾', desc: '5 方向へ泡を飛ばす。', type: 'burst' } },
  skull: { name: '飛頭骸', fx: 'critSkull', fly: true, range: 0, rate: 1.0, mul: 1.4, spd: 190, skill: { name: '爆炎', desc: '周囲を爆発させる。', type: 'blast' } },
  frog: { name: 'カエル', fx: 'critFrog', fly: false, range: 130, rate: 0.9, mul: 0.9, spd: 130, skill: { name: '大跳躍', desc: '敵の上に降りて周囲を揺らす。', type: 'blast' } },
  ghost: { name: '幽霊', fx: 'critGhost', fly: true, range: 170, rate: 1.0, mul: 0.8, spd: 140, skill: { name: '呪いの声', desc: '周りの敵を呪い、受けるダメージを増やす。', type: 'curse' } },
  jelly: { name: 'クラゲ', fx: 'critJelly', fly: true, range: 120, rate: 1.0, mul: 0.9, spd: 110, skill: { name: '放電', desc: '周囲の敵を痺れさせる。', type: 'stun' } },
  slime: { name: 'スライム', fx: 'critSlime', fly: false, range: 0, rate: 0.9, mul: 0.9, spd: 120, skill: { name: '粘液', desc: '周囲の敵を強く鈍らせる。', type: 'slow' } },
  snake: { name: 'ヘビ', fx: 'critSnake', fly: false, range: 0, rate: 0.7, mul: 0.9, spd: 150, skill: { name: '猛毒牙', desc: '狙った敵へ大きな毒ダメージ。', type: 'strike' } },
  wisp: { name: '灯火', fx: 'critWisp', fly: true, range: 190, rate: 0.9, mul: 0.8, spd: 140, skill: { name: '火の粉', desc: '周囲を焦がす。', type: 'blast' } },
  // ここから下は召喚師だけが呼べる（卵からは生まれない）
  armor: { name: '錆鎧', summonOnly: true, sprite: 'skel', fly: false, range: 0, rate: 0.9, mul: 1, spd: 110, skill: { name: '盾の押し', desc: '', type: 'blast' } },
  golem: { name: '巨像', summonOnly: true, sprite: 'golem', fly: false, range: 0, rate: 1.4, mul: 1, spd: 70, skill: { name: '地砕き', desc: '', type: 'blast' } },
  turret: { name: '雷の塔', summonOnly: true, fx: 'teslaCoil', keepColor: true, mode: 'still', fly: true, range: 280, rate: 0.7, mul: 1, spd: 0, skill: { name: '放電', desc: '', type: 'stun' } },
  disc: { name: '回転刃', summonOnly: true, fx: 'energyDisc', keepColor: true, mode: 'orbit', fly: true, range: 0, rate: 0.2, mul: 1, spd: 0, skill: { name: '', desc: '', type: 'blast' } },
  cloud: { name: '雷雲', summonOnly: true, fx: 'stormCloud', keepColor: true, mode: 'cloud', fly: true, range: 0, rate: 1.0, mul: 1, spd: 130, skill: { name: '', desc: '', type: 'stun' } },
  brazier: { name: '祭壇', summonOnly: true, fx: 'brazier', keepColor: true, mode: 'aura', aura: 110, fly: true, range: 0, rate: 1.1, mul: 1, spd: 0, skill: { name: '', desc: '', type: 'blast' } },
  orb: { name: '宝珠', summonOnly: true, fx: 'waterOrb', keepColor: true, mode: 'healer', fly: true, range: 0, rate: 1.0, mul: 1, spd: 0, skill: { name: '', desc: '', type: 'heal' } },
};
export const PET_KEYS = Object.keys(PETS);
const EGG_KEYS = PET_KEYS.filter((k) => !PETS[k].summonOnly);
export const makeEgg = () => ({ id: uid(), cat: 'egg', rarity: 3, name: '謎の卵' });
/** 卵が孵る。種族と属性はこの時に決まる */
export function hatchPet() {
  const sp = pick(EGG_KEYS), el = pick(ELEM_KEYS);
  return { id: uid(), sp, el, lvl: 1, base: Math.round(rand(9, 13)), name: `${ELEMENTS[el].name}の${PETS[sp].name}` };
}
export const petDamage = (pet, floor) => Math.round(pet.base * PETS[pet.sp].mul * (1 + 0.15 * (pet.lvl - 1)) * (1 + 0.14 * (floor - 1)));

// ---------- 商人 ----------
export const CURSES = [
  { name: '血の代償', desc: '最大HP -8%', s: { hpp: -0.08 } },
  { name: '鈍刃の呪い', desc: '攻撃力 -6%', s: { atk: -0.06 } },
  { name: '脆弱の呪い', desc: '被ダメージ +6%', s: { def: -0.06 } },
  { name: '鈍足の呪い', desc: '移動速度 -5%', s: { speed: -0.05 } },
  { name: '忘却の呪い', desc: 'スキル再使用 +6%', s: { cdr: -0.06 } },
];
const priceOf = (rarity, floor) => Math.round([12, 24, 48, 90, 180, 500][rarity] * (1 + floor * 0.08));
/** 商人の品揃え。買った後は同じ階層で同じものは出ない */
export function shopStock(floor, job, diff) {
  const list = [], min = diff.minBoss >= 3 ? 3 : 1;
  for (let i = 0; i < 2; i++) { const it = rollWeapon(floor, 0.25, Math.min(4, min + (i ? 1 : 0))); list.push({ it, price: priceOf(it.rarity, floor) }); }
  for (let i = 0; i < 2; i++) { const it = rollGear(floor, 0.25, undefined, min); list.push({ it, price: priceOf(it.rarity, floor) }); }
  const good = AFFINITY[job].good.filter((k) => SCROLL_POOL.includes(k));
  const pool = job === 'summoner' ? SUMMON_POOL : SCROLL_POOL;
  for (let i = 0; i < 2; i++) { const it = makeScroll(pick(i === 0 && good.length ? good : pool), i ? 3 : 2); list.push({ it, price: i ? 150 : 70 }); }
  const curses = [...CURSES].sort(() => Math.random() - 0.5).slice(0, 3);
  return { list, special: curses.map((c, i) => ({ curse: c, give: i === 2 ? 'legend' : 'egg' })) };
}
export { rollWeapon as rollWeaponAt };
export const rollLegendWeapon = (floor) => rollWeapon(floor, 0.5, 4);

// ---------- 異次元 ----------
export const DIMS = [
  { name: '桜の常世', w: 'cherryBlossoms', note: 'HP が少しずつ回復する', buff: { regen: 4 }, theme: { floor: '#5a3f4c', floor2: '#2e1f28', wallTop: '#7a5666', face: '#94687c', mortar: '#2a1a22', moss: '#e8a0c0', accent: '#c05a88', ambient: '#150c12', fog: '#0a0509' } },
  { name: '吹雪の果て', w: 'blizzard', note: '足が重いが、攻撃は鋭くなる', buff: { speed: -0.12, atk: 0.2 }, theme: { floor: '#566878', floor2: '#2c3844', wallTop: '#7a90a4', face: '#94aabc', mortar: '#26303a', moss: '#d0ecff', accent: '#5a8ad0', ambient: '#0e1420', fog: '#060a10' } },
  { name: '極光の原', w: 'aurora', note: 'スキルの再使用が速くなる', buff: { cdr: 0.25 }, theme: { floor: '#2c4a54', floor2: '#14282e', wallTop: '#3a606e', face: '#4a7686', mortar: '#102024', moss: '#60e0c0', accent: '#a060e0', ambient: '#07131a', fog: '#030a0c' } },
  { name: '落葉の森', w: 'fallingLeaves', note: '攻撃が速くなる', buff: { haste: 0.2 }, theme: { floor: '#54462c', floor2: '#2c2414', wallTop: '#6e5c38', face: '#887248', mortar: '#241c10', moss: '#d08a30', accent: '#a04a20', ambient: '#120d06', fog: '#090603' } },
  { name: '雷雲の塔', w: 'storm', note: '落雷に注意。会心が出やすい', buff: { crit: 0.2 }, hazard: 'bolt', theme: { floor: '#3a3a52', floor2: '#1c1c2c', wallTop: '#4e4e6e', face: '#62628a', mortar: '#16162a', moss: '#a0a0ff', accent: '#e0e060', ambient: '#0a0a16', fog: '#04040a' } },
  { name: '蛍の沼', w: 'fireflies', note: '敵を倒すとコインが増える', buff: { regen: 1 }, coins: 2, theme: { floor: '#2c4030', floor2: '#142018', wallTop: '#3e5a44', face: '#4e7056', mortar: '#101c14', moss: '#c8f060', accent: '#3a8a60', ambient: '#07100a', fog: '#030805' } },
  { name: '流星の丘', w: 'shootingStars', note: '攻撃力が上がる', buff: { atk: 0.25 }, theme: { floor: '#2e2c50', floor2: '#16142c', wallTop: '#403e6c', face: '#524f88', mortar: '#12102a', moss: '#ffe080', accent: '#6050c0', ambient: '#080716', fog: '#04030c' } },
];
export const BOSS_WEATHER = ['fog', 'fireflies', 'godRays', 'storm', 'shootingStars'];

export const xpForLevel = (lvl) => Math.round(40 * lvl ** 1.45);
