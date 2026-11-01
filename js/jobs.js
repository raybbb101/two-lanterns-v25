// ジョブとスキルツリー。ツリーは「共通の根」＋分岐。分岐は 1 つしか選べず、変えるにはリセットが要る。
import { GEAR_SLOTS, SETS, makeWeapon } from './data.js';

const P = (id, name, max, per, desc) => ({ id, name, max, per, desc, kind: 'passive' });
const A = (id, skill, max = 5) => ({ id, skill, max, kind: 'active' });

const B = (name, desc, a, b, subs) => ({ name, desc, nodes: [a, b], subs });
const F = (name, desc, nodes, oni = false) => ({ name, desc, nodes, oni });
const O = (name, desc, nodes) => F(name, desc, nodes, true); // 鬼難易度だけで選べる 3 つ目の最終ジョブ

// 根 → 2 大分岐 → それぞれ 2 つの最終ジョブ（合計 4 つ）
export const JOBS = {
  knight: {
    name: '剣士', color: '#ff8a6a', weapon: 'sword', skill: 'whirl', base: { hpp: 0.2, def: 0.05 }, desc: '前に立って戦う。打たれ強い。',
    root: P('k_root', '剣術', 5, { atk: 0.04 }, '攻撃力アップ'),
    branches: [
      B('守護騎士', '仲間を守る盾役', P('k_a1', '鉄の肌', 5, { def: 0.03 }, '被ダメージ減少'), A('k_a2', 'bash'), [
        F('聖騎士', '仲間ごと守り抜く', [A('k_a3', 'warcry'), P('k_a4', '不屈', 5, { hpp: 0.06 }, '最大HPアップ'), A('k_c3', 'aegis')]),
        F('城塞騎士', '一歩も退かない', [A('k_d1', 'fortress'), P('k_d2', '堅牢', 5, { def: 0.03 }, '被ダメージ減少'), A('k_d3', 'earthwall')]),
        O('水鏡の守人', '波と泡で守りを固める', [A('k_o1', 'tidewall'), P('k_o2', '水の加護', 5, { regen: 1 }, 'HP自動回復'), A('k_o3', 'bubbleguard')]),
      ]),
      B('狂戦士', '守りを捨てて斬る', P('k_b1', '血の渇き', 5, { vamp: 0.012 }, 'ダメージの一部を回復'), A('k_b2', 'quake'), [
        F('血風の剣鬼', '斬るほど生き延びる', [A('k_b3', 'roar'), P('k_b4', '処刑', 5, { critDmg: 0.12 }, '会心ダメージアップ'), A('k_e3', 'bloodstorm')]),
        F('破壊者', '一撃ですべてを砕く', [A('k_f1', 'cleave'), P('k_f2', '剛腕', 5, { atk: 0.05 }, '攻撃力アップ'), A('k_f3', 'cataclysm')]),
        O('終末の騎士', '闇と爆炎を振るう', [A('k_p1', 'shadowcleave'), P('k_p2', '破滅の意志', 5, { atk: 0.04, critDmg: 0.06 }, '攻撃力と会心ダメージアップ'), A('k_p3', 'doomswing')]),
      ]),
    ],
  },
  ranger: {
    name: '弓使い', color: '#7fe0d6', weapon: 'bow', skill: 'pierce', base: { speed: 0.06, crit: 0.05 }, desc: '離れて撃つ。足が速い。',
    root: P('r_root', '弓術', 5, { atk: 0.04 }, '攻撃力アップ'),
    branches: [
      B('狙撃手', '矢の冴えを極める', P('r_a1', '鷹の目', 5, { crit: 0.03 }, '会心率アップ'), A('r_a2', 'focus'), [
        F('魔弾の射手', '一矢で仕留める', [A('r_a3', 'rain'), P('r_a4', '致命の矢', 5, { critDmg: 0.12 }, '会心ダメージアップ'), A('r_c3', 'snipe')]),
        F('嵐の弓兵', '矢の雨で押し切る', [A('r_d1', 'volley'), P('r_d2', '連射', 5, { haste: 0.03 }, '攻撃速度アップ'), A('r_d3', 'stormarrow')]),
        O('花火師', '空に大輪を咲かせる', [A('r_o1', 'rocketarrow'), P('r_o2', '火薬の芸術', 5, { atk: 0.05 }, '攻撃力アップ'), A('r_o3', 'finale')]),
      ]),
      B('罠師', '敵の足を止めて削る', P('r_b1', '軽業', 5, { speed: 0.02 }, '移動速度アップ'), A('r_b2', 'thorns'), [
        F('森の番人', '森を味方につける', [A('r_b3', 'snare'), P('r_b4', '狩人の知恵', 5, { cdr: 0.03 }, 'スキル再使用短縮'), A('r_e3', 'grove')]),
        F('爆毒師', '爆弾と毒で仕掛ける', [A('r_f1', 'minefield'), P('r_f2', '火薬の扱い', 5, { atk: 0.04 }, '攻撃力アップ'), A('r_f3', 'toxicarrow')]),
        O('嵐呼び', '雷と渦を呼ぶ', [A('r_p1', 'vortex'), P('r_p2', '天候読み', 5, { cdr: 0.03 }, 'スキル再使用短縮'), A('r_p3', 'thundercloud')]),
      ]),
    ],
  },
  mage: {
    name: '魔導士', color: '#c9a0ff', weapon: 'staff', skill: 'fireball', base: { atk: 0.1, cdr: 0.05 }, desc: '強力な魔法を操る。体は脆い。',
    root: P('m_root', '魔力', 5, { atk: 0.04 }, '攻撃力アップ'),
    branches: [
      B('業火', '燃やし尽くす', P('m_a1', '火の心', 5, { atk: 0.03 }, '攻撃力アップ'), A('m_a2', 'pillar'), [
        F('爆炎の魔人', '広い範囲を焼き払う', [A('m_a3', 'meteor'), P('m_a4', '灼熱', 3, { critDmg: 0.15 }, '会心ダメージアップ'), A('m_c3', 'inferno')]),
        F('蒼炎の賢者', '高温の炎を操る', [A('m_d1', 'bluefire'), P('m_d2', '炎の集中', 5, { cdr: 0.03 }, 'スキル再使用短縮'), A('m_d3', 'firetornado')]),
        O('秘術師', '純粋な魔力で押し潰す', [A('m_o1', 'arcaneorb'), P('m_o2', '魔力増幅', 5, { atk: 0.05 }, '攻撃力アップ'), A('m_o3', 'manastorm')]),
      ]),
      B('氷雷', '止めて、撃ち抜く', P('m_b1', '魔力循環', 5, { cdr: 0.03 }, 'スキル再使用短縮'), A('m_b2', 'lance'), [
        F('氷帝', 'すべてを凍らせる', [A('m_e1', 'blizzard'), P('m_e2', '冷気の衣', 5, { def: 0.025 }, '被ダメージ減少'), A('m_e3', 'icefall')]),
        F('雷帝', '雷で貫く', [A('m_b3', 'strike'), P('m_b4', '静電気', 5, { crit: 0.025 }, '会心率アップ'), A('m_f3', 'thunderclap')]),
        O('時の賢者', '時と星を操る', [A('m_p1', 'starstorm'), P('m_p2', '永遠の思索', 5, { cdr: 0.03 }, 'スキル再使用短縮'), A('m_p3', 'timestop')]),
      ]),
    ],
  },
  healer: {
    name: '癒し手', color: '#ffe08a', weapon: 'staff', skill: 'heal', base: { heal: 0.2, hpp: 0.1 }, desc: '仲間を支える。ソロでも粘り強い。',
    root: P('h_root', '祈り', 5, { heal: 0.05 }, '回復量アップ'),
    branches: [
      B('聖域', '回復に専念する', P('h_a1', '慈愛', 5, { heal: 0.08 }, '回復量アップ'), A('h_a2', 'bloom'), [
        F('大司祭', '奇跡で仲間を救う', [A('h_a3', 'bless'), P('h_c2', '深い信仰', 5, { heal: 0.06 }, '回復量アップ'), A('h_a4', 'miracle', 3)]),
        F('精霊使い', '精霊と共に癒す', [A('h_d1', 'wisp'), P('h_d2', '精霊の加護', 5, { regen: 1 }, 'HP自動回復'), A('h_d3', 'sanctuary')]),
        O('泉の聖女', '水の力で癒す', [A('h_o1', 'aquaorb'), P('h_o2', '清らかな水', 5, { heal: 0.06 }, '回復量アップ'), A('h_o3', 'holyspring')]),
      ]),
      B('戦う聖職者', '戦いながら回復する', P('h_b1', '聖なる刃', 5, { vamp: 0.015 }, 'ダメージの一部を回復'), A('h_b2', 'smite'), [
        F('審問官', '光で悪を裁く', [A('h_b3', 'hpillar'), P('h_b4', '聖戦', 5, { atk: 0.05 }, '攻撃力アップ'), A('h_e3', 'judgement')]),
        F('修道拳士', '拳で戦い、癒す', [A('h_f1', 'holyfist'), P('h_f2', '鍛えた体', 5, { hpp: 0.05 }, '最大HPアップ'), A('h_f3', 'radiance')]),
        O('天の執行者', '光輪と蝕で裁く', [A('h_p1', 'haloblade'), P('h_p2', '天の使命', 5, { atk: 0.05 }, '攻撃力アップ'), A('h_p3', 'eclipse')]),
      ]),
    ],
  },
  rogue: {
    name: '影の刃', color: '#b090f0', weapon: 'dagger', skill: 'dash', base: { haste: 0.08, crit: 0.08 }, desc: '素早く切り刻む。回避が得意。',
    root: P('g_root', '身のこなし', 5, { dodge: 0.05 }, '回避の再使用短縮'),
    branches: [
      B('暗殺者', '一瞬で仕留める', P('g_a1', '急所狙い', 5, { crit: 0.03 }, '会心率アップ'), A('g_a2', 'flurry'), [
        F('影殺', '背後から断つ', [A('g_a3', 'shadowstep'), P('g_a4', '必殺', 5, { critDmg: 0.12 }, '会心ダメージアップ'), A('g_c3', 'execute')]),
        F('双刃の舞手', '舞うように切る', [A('g_d1', 'bladedance'), P('g_d2', '舞の足さばき', 5, { speed: 0.02 }, '移動速度アップ'), A('g_d3', 'phantom')]),
        O('深淵の刺客', '触手と亡者を操る', [A('g_o1', 'grasp'), P('g_o2', '深淵の契約', 5, { crit: 0.03 }, '会心率アップ'), A('g_o3', 'tentacle')]),
      ]),
      B('毒師', 'じわじわ弱らせる', P('g_b1', '速い手', 5, { haste: 0.03 }, '攻撃速度アップ'), A('g_b2', 'poison'), [
        F('呪術師', '呪いで命を奪う', [A('g_b3', 'curse'), P('g_e2', '闇の知識', 5, { vamp: 0.012 }, 'ダメージの一部を回復'), A('g_b4', 'drain')]),
        F('疫病師', '毒を広げて殲滅する', [A('g_f1', 'plague'), P('g_f2', '毒の調合', 5, { atk: 0.04 }, '攻撃力アップ'), A('g_f3', 'venomnova')]),
        O('虚無の司祭', '虚無と呪骸を従える', [A('g_p1', 'hexskull'), P('g_p2', '虚ろの心', 5, { vamp: 0.012 }, 'ダメージの一部を回復'), A('g_p3', 'blackhole')]),
      ]),
    ],
  },
  summoner: {
    name: '召喚師', color: '#ff9ad0', skill: 'sum_wisp', skill2: 'sum_armor', noEquip: true, noAttack: true, noHeavy: true, base: { atk: 0.3, hpp: -0.05, cdr: 0.15 }, desc: '生き物も兵器も呼び出して戦う。通常攻撃・重撃・武器・防具は使えず、スキルは召喚だけ。',
    root: P('s_root', '召喚術', 5, { atk: 0.05 }, '召喚獣の攻撃力アップ'),
    branches: [
      B('獣使い', '生き物の群れを率いる', P('s_a1', '群れの絆', 5, { atk: 0.04 }, '攻撃力アップ'), A('s_a2', 'sum_bat'), [
        F('鳥獣の王', '空と地の獣を従える', [A('s_c1', 'sum_bird'), P('s_c2', '獣の守り', 5, { def: 0.03 }, '被ダメージ減少'), A('s_c3', 'sum_frog'), A('s_c4', 'sum_orb')]),
        F('毒蛇使い', '毒と粘液で囲む', [A('s_d1', 'sum_snake'), P('s_d2', '毒の知識', 5, { atk: 0.05 }, '攻撃力アップ'), A('s_d3', 'sum_slime'), A('s_d4', 'sum_brazier')]),
        O('水棲の主', '空を泳ぐ群れを操る', [A('s_o1', 'sum_fish'), P('s_o2', '潮の満ち引き', 5, { cdr: 0.03 }, 'スキル再使用短縮'), A('s_o3', 'sum_jelly'), A('s_o4', 'sum_cloud')]),
      ]),
      B('死霊術師', '亡者と魔を呼ぶ', P('s_b1', '冥府の知識', 5, { cdr: 0.025 }, 'スキル再使用短縮'), A('s_b2', 'sum_skull'), [
        F('亡霊の導師', '亡霊の軍勢を率いる', [A('s_e1', 'sum_ghost'), P('s_e2', '魂の収穫', 5, { vamp: 0.015 }, 'ダメージの一部を回復'), A('s_e3', 'sum_army'), A('s_e4', 'sum_armor')]),
        F('魔眼の主', '遠くから見つめ、癒す', [A('s_f1', 'sum_eye'), P('s_f2', '千里眼', 5, { crit: 0.03 }, '会心率アップ'), A('s_f3', 'sum_butterfly'), A('s_f4', 'sum_turret')]),
        O('虚無の召喚者', '世界の外から呼ぶ', [A('s_p1', 'sum_ghost'), P('s_p2', '虚無の契約', 5, { atk: 0.06 }, '攻撃力アップ'), A('s_p3', 'sum_void'), A('s_p4', 'sum_discs'), A('s_p5', 'sum_golem', 3)]),
      ]),
    ],
  },
};
export const JOB_KEYS = Object.keys(JOBS);
export const RESET_COST = 5;

export const startKit = (job) => {
  const J = JOBS[job];
  return { weapon: J.noEquip ? null : makeWeapon(J.weapon, 0, 1), skills: J.skill2 ? { [J.skill]: 1, [J.skill2]: 1 } : { [J.skill]: 1 }, slots: [J.skill, J.skill2 || null, null, null] };
};

/** ノードがツリーのどこにあるか：{ bi, si }（根は両方 null、大分岐は si が null） */
export function locate(job, node) {
  const J = JOBS[job];
  for (let bi = 0; bi < J.branches.length; bi++) {
    const b = J.branches[bi];
    if (b.nodes.includes(node)) return { bi, si: null };
    for (let si = 0; si < b.subs.length; si++) if (b.subs[si].nodes.includes(node)) return { bi, si };
  }
  return { bi: null, si: null };
}

/** ノードを取得できるか。理由も返す */
export function nodeState(me, node) {
  const J = JOBS[me.job], lv = me.tree[node.id] || 0, { bi, si } = locate(me.job, node);
  if (lv >= node.max) return { ok: false, why: '最大レベル' };
  if (si != null && J.branches[bi].subs[si].oni && !me.oni) return { ok: false, why: '鬼難易度でのみ選べます' };
  if ((me.sp || 0) < 1) return { ok: false, why: 'スキルポイント不足' };
  if (bi == null) return { ok: true };
  if (!(me.tree[J.root.id] > 0)) return { ok: false, why: `先に「${J.root.name}」を習得` };
  if (me.branch != null && me.branch !== bi) return { ok: false, why: '別の分岐を選択中（リセットで変更可）' };
  const b = J.branches[bi];
  if (si == null) {
    const i = b.nodes.indexOf(node);
    if (i > 0 && !(me.tree[b.nodes[i - 1].id] > 0)) return { ok: false, why: '前のスキルが必要' };
    return { ok: true };
  }
  if (me.sub != null && me.sub !== si) return { ok: false, why: '別の最終ジョブを選択中（リセットで変更可）' };
  if (!b.nodes.every((n) => me.tree[n.id] > 0)) return { ok: false, why: `先に「${b.name}」のスキルを習得` };
  const nodes = b.subs[si].nodes, i = nodes.indexOf(node);
  if (i > 0 && !(me.tree[nodes[i - 1].id] > 0)) return { ok: false, why: '前のスキルが必要' };
  return { ok: true };
}

export function allNodes(job) {
  const J = JOBS[job];
  return [J.root, ...J.branches.flatMap((b) => [...b.nodes, ...b.subs.flatMap((f) => f.nodes)])];
}

/** 古い保存データのツリーを今の形に合わせる。無くなったノードのポイントは返す */
export function migrateTree(me) {
  const nodes = allNodes(me.job), byId = new Map(nodes.map((n) => [n.id, n]));
  for (const id of Object.keys(me.tree)) if (!byId.has(id)) { me.sp += me.tree[id]; delete me.tree[id]; }
  me.sub = me.sub ?? null;
  me.coins = me.coins || 0; me.pets = me.pets || []; me.curses = me.curses || []; me.petId = me.petId ?? null;
  for (const id of Object.keys(me.tree)) {
    const { bi, si } = locate(me.job, byId.get(id));
    if (bi != null) me.branch = bi;
    if (si != null) me.sub = si;
  }
}

/** 今の職業名（根のジョブ → 分岐 → 最終ジョブ） */
export function classTitle(me) {
  const J = JOBS[me.job];
  if (me.branch == null) return J.name;
  const b = J.branches[me.branch];
  return me.sub == null ? `${J.name} · ${b.name}` : `${J.name} · ${b.name} · ${b.subs[me.sub].name}`;
}

/** 使えるスキルとそのレベル（巻物＋ツリー） */
export function skillLevels(me) {
  const out = { ...me.skills };
  for (const n of allNodes(me.job)) if (n.kind === 'active' && me.tree[n.id]) out[n.skill] = Math.min(5, (out[n.skill] || 0) + me.tree[n.id]);
  return out;
}

const addStats = (s, o, k = 1) => {
  for (const [key, v] of Object.entries(o)) {
    if (key === 'aff') s.aff.push(...v);
    else s[key] = (s[key] || 0) + v * k;
  }
};

export function setCounts(me) {
  const c = {};
  for (const g of Object.values(me.gear)) if (g && g.set) c[g.set] = (c[g.set] || 0) + 1;
  return c;
}

/** ステータスの計算：レベル＋ジョブ＋防具＋セット＋ツリー＋一時強化 */
export function computeStats(me, lvl) {
  const s = { hp: 0, hpp: 0, atk: 0, def: 0, crit: 0, critDmg: 0, speed: 0, haste: 0, cdr: 0, heal: 0, vamp: 0, regen: 0, dodge: 0, aff: [] };
  addStats(s, JOBS[me.job].base);
  for (const g of Object.values(me.gear)) if (g) addStats(s, g.stats);
  for (const [k, n] of Object.entries(setCounts(me))) {
    if (n >= 2) addStats(s, SETS[k].two);
    if (n >= 4) addStats(s, SETS[k].four);
  }
  for (const n of allNodes(me.job)) if (n.kind === 'passive' && me.tree[n.id]) addStats(s, n.per, me.tree[n.id]);
  for (const b of me.buffs) addStats(s, b.s);
  for (const c of me.curses || []) addStats(s, c.s);
  return {
    maxHp: Math.round((100 + 12 * (lvl - 1) + s.hp) * (1 + s.hpp)),
    atk: (1 + 0.08 * (lvl - 1)) * (1 + s.atk),
    def: Math.min(0.7, s.def), crit: s.crit, critDmg: s.critDmg,
    speed: 1 + s.speed, haste: Math.min(0.6, s.haste), cdr: Math.min(0.5, s.cdr),
    heal: 1 + s.heal, vamp: s.vamp, regen: s.regen, dodge: Math.min(0.7, s.dodge), aff: s.aff, job: me.job,
  };
}
export { GEAR_SLOTS };
