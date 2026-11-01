import { TAU, clamp, lerp, rand, randi, pick, dist, angDiff, rgba } from './util.js';
import { T, WH, genMap, moveCircle, isSolid, lineOfSight } from './map.js';
import { hitsWall } from './map.js';
import { PixRenderer } from './pix.js';
import { WEAPONS, SKILLS, SCROLL_POOL, ENEMIES, ENEMY_TYPES, BOSS_ORDER, VARIANTS, DIFFS, RARITY, DIMS, BOSS_WEATHER, PETS, PET_KEYS, ELEM_KEYS, SUMMON_POOL, skillPower, rollLoot, rollGear, setOfFloor, makeScroll, xpForLevel, makeCoin, makePotion, makeXpOrb, makeStar, makeKey, makeEgg, petDamage } from './data.js';
import { JOBS, startKit, computeStats, skillLevels, migrateTree } from './jobs.js';
import { sfx } from './audio.js';
import { UI } from './ui.js';
import { loadSave, writeSave } from './save.js';

const STATES = ['idle', 'chase', 'wind', 'atk', 'rec'];
const PKINDS = ['arrow', 'bolt', 'fireball', 'eorb', 'rock', 'lance', 'bluefire', 'ethorn', 'evoid', 'acid', 'orb', 'void', 'uwave'];
const AUTO_PICK = ['heal', 'coin', 'xp', 'potion', 'star', 'key'];
const SUMMON_CAP = 12;
const ATKS = [undefined, 'slam', 'throw', 'leap', 'web', 'ring', 'charge', 'spiral', 'gaze'];
const SPEED = 178;
const INV_MAX = 60;
const SK_KEYS = ['q', 'e', 'r', 'c'];

const atkDurFor = (w) => {
  const W = WEAPONS[w ? w.base : 'sword'];
  const rate = w ? w.rate : W.rate;
  return W.kind === 'melee' ? clamp(rate * 0.95, 0.22, 0.62) : W.kind === 'thrust' ? rate * 0.85 : rate * 0.9;
};

export class Game {
  constructor(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = opts.mode;
    this.isHost = opts.mode !== 'guest';
    this.net = opts.net || null;
    this.code = opts.code || '';
    this.onExit = opts.onExit;
    this.lightC = document.createElement('canvas');
    this.lctx = this.lightC.getContext('2d');
    this.time = 0;
    this.parts = []; this.texts = []; this.rings = []; this.bolts = []; this.flashes = []; this.motes = [];
    this.enemies = []; this.projs = []; this.loot = []; this.outbox = [];
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.cam = { x: 0, y: 0 }; this.shake = 0; this.hitstop = 0;
    this.lvl = 1; this.xp = 0;
    this.nextId = 1;
    this.fields = [null, null]; this.fieldT = 0;
    this.portal = false; this.portalT = 0; this.wipeT = 0;
    this.netT = 0;
    this.map = null;

    this.zones = []; this.delayed = [];
    this.me = this.makePlayer(this.isHost ? 0 : 1, opts.name, opts.job || 'knight');
    Object.assign(this.me, startKit(this.me.job));
    // 続きから：装備・スキル・レベルを戻す
    // 保存先は自分が選んだ難易度。敵の強さはルームを作った人の難易度に合わせる
    this.saveDiff = opts.diff || 'normal';
    this.diff = DIFFS[this.saveDiff];
    this.me.oni = this.saveDiff === 'oni';
    this.pets = []; this.comp = {}; this.dimIdx = null; this.rush = null; this.hazardT = 3;
    const sv = loadSave(this.me.job, this.saveDiff);
    this.maxFloor = 1;
    if (sv) {
      const { weapon, inventory, skills, slots, gear, tree, branch, sub, sp, coins, pets, petId, curses } = sv;
      Object.assign(this.me, { weapon, inventory, skills, slots, gear, tree, branch, sub: sub ?? null, sp, coins: coins || 0, pets: pets || [], petId: petId ?? null, curses: curses || [] });
      migrateTree(this.me);
      this.lvl = sv.lvl; this.xp = sv.xp; this.maxFloor = sv.floor;
    }
    if (JOBS[this.me.job].noEquip) this.me.weapon = null;
    this.refreshStats(true);
    this.ally = null;

    this.pix = new PixRenderer(this);
    this.ui = new UI(this);
    this.bindInput();
    this.resize();
    this.saveT = 5;
    this._onHide = () => this.saveGame();
    window.addEventListener('pagehide', this._onHide);
    this._onVis = () => { if (document.visibilityState === 'hidden') this.saveGame(); };
    document.addEventListener('visibilitychange', this._onVis);
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (this.net) this.bindNet();
    if (this.isHost) this.loadFloor(this.maxFloor, (Math.random() * 1e9) | 0);
    else this.ui.waiting(true);
    this.last = performance.now();
    this.running = true;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  makePlayer(id, name, job = 'knight') {
    return {
      id, job, name: name || (id ? 'ゲスト' : 'ホスト'), pal: { name: JOBS[job].color },
      x: 0, y: 0, vx: 0, vy: 0, r: 12, aim: 0.6, aimLock: 0, lockA: 0,
      hp: 100, maxHp: 100, down: false, inv: 0,
      dodgeT: 0, dodgeDur: 0.3, dodgeCd: 0, dodgeMax: 0.8, dodgeDir: 1, dvx: 0, dvy: 0, dashT: 0,
      atkT: 9, atkDur: 0.3, atkSeq: 0, atkCd: 0,
      walkPh: 0, moveAmt: 0, lanAng: 0, lanVel: 0, lastVx: 0,
      weapon: null, inventory: [], skills: {}, slots: [null, null, null, null], cds: {},
      gear: { head: null, body: null, hands: null, feet: null, charm: null }, tree: {}, branch: null, sub: null, sp: 1, buffs: [], coins: 0, pets: [], petId: null, curses: [], holdT: 0, holding: false, queued: false, oni: false,
      shield: 0, shieldT: 0, flash: 0, skillAnim: null, skillSeq: 0, revive: 0, dustT: 0,
    };
  }

  // 装備・スキルツリー・一時強化が変わるたびに呼ぶ
  refreshStats(full) {
    const me = this.me, old = me.maxHp;
    me.stats = computeStats(me, this.lvl);
    me.maxHp = me.stats.maxHp;
    if (full) me.hp = me.maxHp;
    else if (me.maxHp > old && !me.down) me.hp += me.maxHp - old;
    me.hp = Math.min(me.hp, me.maxHp);
    me.dodgeMax = 0.8 * (1 - me.stats.dodge);
  }

  // ================= 入力 =================
  bindInput() {
    this._kd = (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); this.ui.toggleChar(); return; }
      if (k === 'escape') { this.ui.closeAll(); return; }
      if (k === 'h') { this.ui.toggleHelp(); return; }
      if (k === 'm') { this.ui.toggleMute(); return; }
      if (k === ' ') e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    };
    this._ku = (e) => this.keys.delete(e.key.toLowerCase());
    this._mm = (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; };
    this._md = (e) => {
      if (e.target !== this.cv) return;
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) this.pressed.add(' ');
    };
    this._mu = (e) => { if (e.button === 0) this.mouse.down = false; };
    this._blur = () => { this.keys.clear(); this.mouse.down = false; };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('mousemove', this._mm);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('blur', this._blur);
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  saveGame() {
    if (!this.map) return;
    const { job, name, weapon, inventory, skills, slots, gear, tree, branch, sub, sp, coins, pets, petId, curses } = this.me;
    this.maxFloor = Math.max(this.maxFloor, this.floor);
    if (!writeSave({ job, name, weapon, inventory, skills, slots, gear, tree, branch, sub, sp, coins, pets, petId, curses, lvl: this.lvl, xp: this.xp, floor: this.maxFloor }, this.saveDiff) && !this.saveWarned) {
      this.saveWarned = true;
      this.ui.toast('このブラウザでは保存できません（プライベートモードなど）', '#ff8a6a');
    }
  }

  destroy() {
    this.saveGame();
    window.removeEventListener('pagehide', this._onHide);
    document.removeEventListener('visibilitychange', this._onVis);
    this.running = false;
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('blur', this._blur);
    window.removeEventListener('resize', this._onResize);
    if (this.net) this.net.destroy();
    this.ui.destroy();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cv.width = Math.max(2, Math.floor(innerWidth * dpr));
    this.cv.height = Math.max(2, Math.floor(innerHeight * dpr));
    this.pix.resize();
    this.zoom = this.pix.s * 0.75;
  }

  // ================= ネットワーク =================
  bindNet() {
    const n = this.net;
    if (this.isHost) {
      n.on('open', () => {});
      n.on('hello', (d) => {
        this.ally = this.makePlayer(1, d.name, d.job);
        // レベルは二人で共通：高いほうに合わせる
        if (d.lvl > this.lvl) this.setXp(d.xp, d.lvl);
        this.ally.x = this.me.x + 30; this.ally.y = this.me.y;
        this.ally.tx = this.ally.x; this.ally.ty = this.ally.y;
        n.send({
          t: 'start', diff: this.saveDiff, n: this.floor, seed: this.seed, xp: this.xp, lvl: this.lvl, name: this.me.name, job: this.me.job,
          puzzles: this.map.puzzles.filter((p) => p.done).map((p) => p.id),
          chests: this.map.chests.filter((c) => c.open).map((c) => c.id), dim: this.dimIdx, keyGot: this.map.keyGot ? 1 : 0, door: this.map.secret && this.map.secret.open ? 1 : 0,
          loot: this.loot.map((l) => ({ id: l.id, x: l.x, y: l.y, item: l.item, seed: l.seed })),
        });
        this.ui.toast(`${d.name} が参加しました`, '#7fe0d6');
        this.ui.setStatus('connected', d.name);
        sfx('join');
      });
      n.on('st', (d) => { if (this.ally) this.applyRemote(this.ally, d); });
      n.on('atk', (d) => this.playerAttack(d));
      n.on('skill', (d) => this.doSkill(d));
      n.on('pick', (d) => { const L = this.loot.find((l) => l.id === d.id); if (L && this.ally) this.pickLoot(L, 1); });
      n.on('chest', (d) => this.openChest(d.id));
      n.on('pza', (d) => this.puzzleAnswer(1, d.id, d.ok));
      n.on('drop', (d) => this.spawnLoot(d.x, d.y, d.item, d.x, d.y));
      n.on('petset', (d) => { this.comp[1] = d.pet; this.syncCompanion(1); });
      n.on('door', () => this.openDoor());
      n.on('rush', () => this.startRush());
      n.on('spring', () => this.useSpring());
      n.on('rev', () => this.reviveLocal());
      n.on('close', () => {
        if (this.ally) this.ui.toast(`${this.ally.name} との接続が切れました（コードで再参加できます）`, '#ff8a6a');
        this.ally = null;
        this.ui.setStatus('waiting');
      });
    } else {
      n.on('start', (d) => {
        this.ally = this.makePlayer(0, d.name, d.job);
        this.diff = DIFFS[d.diff] || this.diff;
        this.ui.toast(`このルームの難易度：${this.diff.name}`, this.diff.color);
        this.lvl = d.lvl; this.xp = d.xp;
        this.refreshStats(true);
        this.dimIdx = d.dim ?? null;
        this.loadFloor(d.n, d.seed, false, this.dimIdx);
        this.map.keyGot = !!d.keyGot;
        if (d.door) this.applyDoor();
        this.sendCompanion();
        for (const id of d.puzzles || []) { const p = this.map.puzzles[id]; if (p) p.done = true; }
        for (const id of d.chests) { const c = this.map.chests[id]; if (c) { c.open = true; c.openT = 1; } }
        for (const l of d.loot) this.addLoot(l);
        this.ally.x = this.ally.tx = this.me.x - 30; this.ally.y = this.ally.ty = this.me.y;
        this.ui.waiting(false);
        this.ui.setStatus('guest', d.name);
        sfx('join');
      });
      n.on('full', () => { this.ui.fatal('このルームはすでに 2 人で遊んでいます。'); });
      n.on('sn', (d) => this.applySnap(d));
      n.on('floor', (d) => this.loadFloor(d.n, d.seed, d.wipe, d.dim ?? null));
      n.on('coin', (d) => this.addCoins(d.n));
      n.on('resetcd', () => { this.me.cds = {}; });
      n.on('hurt', (d) => this.hurtLocal(d.d, d.x, d.y));
      n.on('heal', (d) => this.healLocal(d.a));
      n.on('ward', (d) => this.wardLocal(d.a, d.d));
      n.on('buff', (d) => this.buffLocal(d.s, d.dur));
      n.on('give', (d) => this.receiveItem(d.item));
      n.on('xp', (d) => this.setXp(d.xp, d.lvl));
      n.on('rev', () => this.reviveLocal());
      n.on('close', () => this.ui.fatal('ホストとの接続が切れました。'));
      n.send({ t: 'hello', name: this.me.name, job: this.me.job, lvl: this.lvl, xp: this.xp });
    }
  }

  pState(p) {
    return {
      x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, vx: p.vx | 0, vy: p.vy | 0,
      a: Math.round(p.aim * 100) / 100, hp: Math.ceil(p.hp), mh: p.maxHp, dn: p.down ? 1 : 0,
      dg: p.dodgeT > 0 || p.dashT > 0 ? 1 : 0, as: p.atkSeq,
      w: p.weapon ? { base: p.weapon.base, rarity: p.weapon.rarity, affixes: p.weapon.affixes, rate: p.weapon.rate } : null,
      j: p.job, sh: Math.ceil(p.shield), sk: p.skillAnim ? p.skillAnim.id + ':' + p.skillSeq : 0, nm: p.name, rv: +p.revive.toFixed(2),
    };
  }

  applyRemote(a, s) {
    a.tx = s.x; a.ty = s.y; a.rvx = s.vx; a.rvy = s.vy; a.taim = s.a;
    a.hp = s.hp; a.maxHp = s.mh; a.down = !!s.dn; a.shield = s.sh; a.name = s.nm; a.revive = s.rv;
    a.weapon = s.w ? { ...s.w, cat: 'weapon' } : null;
    if (s.j && s.j !== a.job) { a.job = s.j; a.pal = { name: JOBS[s.j].color }; }
    if (s.dg && a.dodgeT <= 0) { a.dodgeT = 0.3; a.dodgeDur = 0.3; a.dodgeDir = s.vx >= 0 ? 1 : -1; }
    if (s.as !== a.atkSeq) {
      a.atkSeq = s.as; a.atkT = 0; a.atkDur = atkDurFor(a.weapon);
      this.pix.slash(a);
      const k = a.weapon ? WEAPONS[a.weapon.base].kind : 'melee';
      this.sfxAt(k === 'bow' ? 'bow' : k === 'staff' ? 'cast' : k === 'thrust' ? 'thrust' : 'swing', a.x, a.y);
    }
    if (s.sk && s.sk !== a.lastSk) { a.lastSk = s.sk; a.skillAnim = { id: s.sk.split(':')[0], t: 0 }; }
  }

  updateRemote(a, dt) {
    if (a.tx == null) return;
    const k = 1 - Math.exp(-dt * 14);
    const px = a.x, py = a.y;
    a.x += (a.tx + (a.rvx || 0) * 0.04 - a.x) * k;
    a.y += (a.ty + (a.rvy || 0) * 0.04 - a.y) * k;
    if (Math.abs(a.tx - a.x) > 200 || Math.abs(a.ty - a.y) > 200) { a.x = a.tx; a.y = a.ty; }
    a.aim += angDiff(a.aim, a.taim || 0) * Math.min(1, dt * 18);
    const sp = Math.hypot(a.rvx || 0, a.rvy || 0);
    a.vx = a.rvx || 0; a.vy = a.rvy || 0;
    a.moveAmt = lerp(a.moveAmt, clamp(sp / SPEED, 0, 1), Math.min(1, dt * 10));
    this.updateFacing(a, dt, sp > 40 ? Math.atan2(a.rvy, a.rvx) : null, a.atkT < a.atkDur + 0.18);
    a.walkPh += Math.hypot(a.x - px, a.y - py) * 0.075;
    a.atkT += dt;
    if (a.dodgeT > 0) a.dodgeT -= dt;
    if (a.skillAnim) { a.skillAnim.t += dt; if (a.skillAnim.t > 1) a.skillAnim = null; }
    this.swingLantern(a, dt);
    if (a.moveAmt > 0.3) this.footDust(a, dt);
  }

  sendState() {
    if (!this.net || !this.net.connected) return;
    if (this.isHost) {
      if (!this.ally) { this.outbox.length = 0; return; }
      const e = this.enemies.map((e) => [
        e.id, ENEMY_TYPES.indexOf(e.type), Math.round(e.x), Math.round(e.y), Math.ceil(e.hp), Math.ceil(e.maxHp),
        STATES.indexOf(e.state), Math.round(e.st * 100), Math.round(e.stDur * 100), Math.round(e.aim * 100),
        (e.elite ? 1 : 0) | (e.slow > 0 ? 2 : 0) | (e.burn > 0 ? 4 : 0) | (e.moving ? 8 : 0) | (e.enraged ? 16 : 0) | (e.stun > 0 ? 32 : 0) | (e.mark > 0 ? 64 : 0),
        e.var, Math.max(0, ATKS.indexOf(e.atk)), Math.round(e.lx || 0), Math.round(e.ly || 0),
      ]);
      const pr = this.projs.map((p) => [p.id, PKINDS.indexOf(p.kind), Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), Math.round(p.z || 0), p.tx | 0, p.ty | 0, p.rar || 0]);
      const pt = this.pets.map((q) => [q.id, q.pid, PET_KEYS.indexOf(q.sp), ELEM_KEYS.indexOf(q.el), Math.round(q.x), Math.round(q.y), q.flip ? 1 : 0]);
      this.net.send({ t: 'sn', p: this.pState(this.me), e, pr, pets: pt, pp: this.portal ? this.portalPos() : null, fx: this.outbox, pa: this.portal ? 1 : 0, pt: +this.portalT.toFixed(2) });
      this.outbox = [];
    } else {
      this.net.send({ t: 'st', ...this.pState(this.me) });
    }
  }

  applySnap(d) {
    if (!this.map) return;
    if (this.ally) this.applyRemote(this.ally, d.p);
    const seen = new Set();
    const byId = this.enemyMap || (this.enemyMap = new Map());
    for (const a of d.e) {
      const id = a[0];
      seen.add(id);
      let e = byId.get(id);
      if (!e) {
        const type = ENEMY_TYPES[a[1]];
        e = { id, type, x: a[2], y: a[3], r: ENEMIES[type].r, seed: (id * 0.618) % 1, walk: 0, flash: 0, aim: a[9] / 100 };
        byId.set(id, e);
        this.enemies.push(e);
      }
      if (a[4] < e.hp) e.flash = 0.12;
      e.tx = a[2]; e.ty = a[3]; e.hp = a[4]; e.maxHp = a[5];
      const ns = STATES[a[6]];
      e.state = ns; e.st = a[7] / 100; e.stDur = a[8] / 100; e.taim = a[9] / 100;
      e.elite = !!(a[10] & 1); e.slow = a[10] & 2 ? 1 : 0; e.burn = a[10] & 4 ? 1 : 0; e.moving = !!(a[10] & 8); e.enraged = !!(a[10] & 16); e.stun = a[10] & 32 ? 1 : 0; e.mark = a[10] & 64 ? 1 : 0;
      e.var = a[11]; e.atk = ATKS[a[12]]; e.lx = a[13]; e.ly = a[14];
      if (e.elite) e.r = ENEMIES[e.type].r * 1.15;
    }
    if (seen.size !== byId.size) {
      for (const [id] of byId) if (!seen.has(id)) byId.delete(id);
      this.enemies = this.enemies.filter((e) => seen.has(e.id));
    }
    const pm = new Map(this.projs.map((p) => [p.id, p]));
    this.projs = d.pr.map((a) => {
      const p = pm.get(a[0]) || { id: a[0] };
      p.kind = PKINDS[a[1]]; p.x = a[2]; p.y = a[3]; p.vx = a[4]; p.vy = a[5]; p.z = a[6]; p.tx = a[7]; p.ty = a[8]; p.rar = a[9];
      p.col = p.kind === 'bolt' || p.kind === 'arrow' ? (p.rar >= 2 ? RARITY[p.rar].color : p.kind === 'bolt' ? '#7fc8ff' : null) : null;
      return p;
    });
    const pm2 = new Map(this.pets.map((q) => [q.id, q]));
    this.pets = (d.pets || []).map((a) => {
      const q = pm2.get(a[0]) || { id: a[0], x: a[4], y: a[5] };
      q.pid = a[1]; q.sp = PET_KEYS[a[2]]; q.el = ELEM_KEYS[a[3]]; q.tx = a[4]; q.ty = a[5]; q.flip = !!a[6];
      return q;
    });
    if (d.pp) this.portalAt = d.pp;
    if (d.pa && !this.portal) this.onPortalOpen();
    this.portal = !!d.pa; this.portalT = d.pt;
    for (const [type, data] of d.fx) this.applyFx(type, data);
  }

  // ================= フロア =================
  loadFloor(n, seed, wipe = false, dim = null) {
    this.portalAt = null; this.dimAt = null; this.lastKill = null;
    const wasDim = this.dimIdx != null, climbed = this.floor != null && n > this.floor;
    this.floor = n; this.seed = seed; this.dimIdx = dim;
    this.map = genMap(seed, n, dim != null ? DIMS[dim] : null);
    const m0 = this.map;
    // 鬼は 2 層ごとに商人が来る
    if (dim == null && this.diff === DIFFS.oni && n % 2 === 0) m0.merchant = { x: (m0.start.cx + 3) * T, y: (m0.start.cy - 1) * T };
    if (m0.secret && m0.secret.kind === 'shop') m0.merchant2 = { x: m0.secret.cx, y: m0.secret.cy };
    m0.weather = dim != null ? DIMS[dim].w : m0.boss ? BOSS_WEATHER[(Math.floor(n / 3) - 1) % BOSS_WEATHER.length] : null;
    this.pix.newFloor(m0);
    if (dim != null) this.pix.transition('trGlitch');
    else if (wipe) this.pix.transition('trShatter');
    else if (wasDim) this.pix.transition('trDissolve');
    this.enemies = []; this.enemyMap = new Map(); this.projs = []; this.loot = [];
    this.parts = []; this.texts = []; this.rings = []; this.bolts = [];
    this.portal = false; this.portalT = 0; this.wipeT = 0; this.fields = [null, null];
    const s = this.map.start;
    const place = (p, off) => { p.x = s.cx * T + T / 2 + off; p.y = s.cy * T + T / 2; p.vx = p.vy = 0; p.tx = p.x; p.ty = p.y; };
    place(this.me, this.me.id ? 26 : -26);
    if (this.ally) place(this.ally, this.ally.id ? 26 : -26);
    const me = this.me;
    this.zones = []; this.delayed = [];
    me.buffs = [];
    if (dim != null) { me.buffs.push({ s: DIMS[dim].buff, t: 1e6 }); this.ui.toast(`異次元「${DIMS[dim].name}」 — ${DIMS[dim].note}`, '#c8a0ff'); }
    const active = me.pets.find((x) => x.id === me.petId);
    if (active && climbed && dim == null) { active.lvl++; this.ui.toast(`${active.name} が Lv ${active.lvl} になった`, '#ffd27a'); }
    this.refreshStats();
    if (wipe || me.down) { me.down = false; me.hp = me.maxHp; }
    else if (n > 1) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.35);
    me.revive = 0;
    this.cam.x = me.x; this.cam.y = me.y;
    if (this.isHost) {
      this.spawnEnemies();
      this.spawnSecret();
      if (this.net) this.net.send({ t: 'floor', n, seed, wipe, dim });
      this.pets = []; this.rush = null;
    }
    this.sendCompanion();
    if (this.isHost && this.comp[1]) this.syncCompanion(1);
    this.ui.floorBanner(n, dim != null ? `異次元 ${DIMS[dim].name}` : this.map.theme.name, wipe);
    this.saveGame();
  }

  spawnEnemies() {
    const f = this.floor, m = this.map, D = this.diff;
    const pool = [['slime', 6], ['bat', 3]];
    if (f >= 2) pool.push(['skel', 3 + f], ['hound', 3], ['wisp', 2]);
    if (f >= 3) pool.push(['slimeL', 2], ['thorn', 2.5], ['toad', 2.5]);
    if (f >= 4) pool.push(['mage', 2 + f * 0.5], ['beetle', 2]);
    if (f >= 5) pool.push(['shade', 2.5]);
    const tot = pool.reduce((a, b) => a + b[1], 0);
    const choose = () => { let r = Math.random() * tot; for (const [t, w] of pool) if ((r -= w) < 0) return t; return 'slime'; };
    // 色違いは 2 層から混ざり、深いほど・難しいほど増える
    const variant = () => (f >= 2 && Math.random() < Math.min(0.65, 0.08 + f * 0.05 + (D.elite - 1) * 0.12) ? 1 + Math.floor(Math.random() * 3) : 0);
    for (const s of m.spawns) {
      const n = Math.floor(D.count) + (Math.random() < D.count % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) this.enemies.push(this.mkEnemy(choose(), s.x + rand(-6, 6) + i * 14, s.y + rand(-6, 6), Math.random() < Math.min(0.4, 0.035 * f * D.elite), variant()));
    }
    if (m.boss) {
      const k = Math.floor(f / 3) - 1;
      // 2 周目以降の番人は色が変わる
      this.enemies.push(this.mkEnemy(BOSS_ORDER[k % BOSS_ORDER.length], m.end.cx * T + T / 2, m.end.cy * T + T / 2, false, Math.floor(k / BOSS_ORDER.length) % 4));
    }
  }

  mkEnemy(type, x, y, elite, v = 0) {
    const d = ENEMIES[type], D = this.diff, V = d.boss ? VARIANTS[0] : VARIANTS[v];
    const sc = 1 + 0.24 * (this.floor - 1);
    const hp = Math.round(d.hp * sc * (elite ? 2.3 : 1) * (d.boss ? 1 + (this.ally ? 0.5 : 0) : 1) * D.hp * V.hp);
    return {
      id: this.nextId++, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
      r: d.r * (elite ? 1.15 : 1), hp, maxHp: hp,
      dmg: Math.round(d.dmg * (1 + 0.13 * (this.floor - 1)) * (elite ? 1.3 : 1) * D.dmg * V.dmg), spd: d.spd * D.spd * V.spd, vcd: V.cd, vxp: V.xp,
      state: 'idle', st: 0, stDur: 1, aim: rand(TAU), cd: rand(0.4, 1.4), losT: rand(0.3),
      var: v, seed: Math.random(), elite,
      slow: 0, burn: 0, burnTick: 0, burnDmg: 0, flash: 0, walk: 0, moving: false, hit: new Set(), wander: rand(TAU),
    };
  }

  // ================= メインループ =================
  loop(now) {
    if (!this.running) return;
    let dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.time += dt;
    this.rdt = dt;
    if (this.map) {
      let sdt = dt;
      if (this.hitstop > 0) { this.hitstop -= dt; sdt = dt * 0.08; }
      if (this.paused()) this.rdt = 0;
      else this.update(sdt, dt);
      this.render();
    }
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 5; this.saveGame(); }
    this.ui.frame(dt);
    this.pressed.clear();
    requestAnimationFrame(this.loop);
  }

  // ソロでキャラクター画面や石碑を開いている間だけ止める
  paused() { return !this.ally && !(this.net && this.net.connected) && this.ui.modalOpen; }

  update(dt, rdt) {
    this.updateMe(dt);
    if (this.ally) this.updateRemote(this.ally, dt);
    if (this.isHost) {
      this.fieldT -= dt;
      if (this.fieldT <= 0) {
        this.fieldT = 0.35;
        this.fields[0] = this.bfs(this.me.x, this.me.y);
        this.fields[1] = this.ally ? this.bfs(this.ally.x, this.ally.y) : null;
      }
      for (const e of this.enemies) this.updateEnemy(e, dt);
      this.separate();
      this.updatePets(dt);
      this.updateRush(dt);
      this.updateHazard(dt);
      this.updateProjs(dt);
      this.updateZones(dt);
      this.checkPuzzles(dt);
      this.checkPortal(dt);
      this.checkWipe(dt);
    } else {
      const k = 1 - Math.exp(-dt * 12);
      for (const e of this.enemies) {
        const px = e.x, py = e.y;
        e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k;
        e.aim += angDiff(e.aim, e.taim) * Math.min(1, dt * 12);
        e.walk += Math.hypot(e.x - px, e.y - py) * 0.09;
        e.st += dt;
        if (e.flash > 0) e.flash -= dt;
      }
      for (const p of this.projs) { p.x += p.vx * dt; p.y += p.vy * dt; }
      for (const q of this.pets) { q.x += (q.tx - q.x) * k; q.y += (q.ty - q.y) * k; }
    }
    for (const L of this.loot) {
      L.t += dt;
      const k = Math.min(1, L.t / 0.55);
      L.dx = lerp(L.ox, L.x, k); L.dy = lerp(L.oy, L.y, k);
      L.z = Math.sin(k * Math.PI) * 38;
    }
    for (const c of this.map.chests) if (c.open && c.openT < 1) c.openT = Math.min(1, (c.openT || 0) + dt * 2.2);
    this.updateFx(rdt);
    this.updateCamera(rdt);
    this.netT -= rdt;
    if (this.netT <= 0) { this.netT = 0.05; this.sendState(); }
    // 発見済みタイル（ミニマップ用）
    const m = this.map;
    for (const p of [this.me, this.ally]) {
      if (!p) continue;
      const cx = (p.x / T) | 0, cy = (p.y / T) | 0;
      for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 9; x <= cx + 9; x++) if (x >= 0 && y >= 0 && x < m.W && y < m.H) m.seen[y * m.W + x] = 1;
    }
  }

  updateMe(dt) {
    const me = this.me, K = this.keys;
    const m = this.map;
    // 照準（マウス → ワールド座標）
    const wx = this.cam.x + (this.mouse.x * this.dpr - this.cv.width / 2) / this.zoom;
    const wy = this.cam.y + (this.mouse.y * this.dpr - this.cv.height / 2) / this.zoom;
    this.mouseWorld = { x: wx, y: wy };
    if (me.aimLock > 0) { me.aimLock -= dt; me.aim = me.lockA; }
    else if (!me.down) me.aim = Math.atan2(wy - (me.y - 18), wx - me.x);

    for (const id in me.cds) if (me.cds[id] > 0) me.cds[id] -= dt;
    if (me.inv > 0) me.inv -= dt;
    if (me.flash > 0) me.flash -= dt;
    if (me.dodgeCd > 0) me.dodgeCd -= dt;
    if (me.atkCd > 0) me.atkCd -= dt;
    if (me.shieldT > 0) { me.shieldT -= dt; if (me.shieldT <= 0) me.shield = 0; }
    if (me.skillAnim) { me.skillAnim.t += dt; if (me.skillAnim.t > 1) me.skillAnim = null; }
    me.atkT += dt;
    if (me.buffs.length) {
      let changed = false;
      for (const b of me.buffs) { b.t -= dt; if (b.t <= 0) changed = true; }
      if (changed) { me.buffs = me.buffs.filter((b) => b.t > 0); this.refreshStats(); }
    }
    if (me.stats.regen && !me.down) me.hp = Math.min(me.maxHp, me.hp + me.stats.regen * dt);

    if (me.down) {
      me.vx *= 0.8; me.vy *= 0.8; me.moveAmt = 0;
      this.swingLantern(me, dt);
      return;
    }
    let ix = 0, iy = 0;
    if (K.has('w') || K.has('arrowup')) iy -= 1;
    if (K.has('s') || K.has('arrowdown')) iy += 1;
    if (K.has('a') || K.has('arrowleft')) ix -= 1;
    if (K.has('d') || K.has('arrowright')) ix += 1;
    const il = Math.hypot(ix, iy);
    if (il) { ix /= il; iy /= il; }
    const busy = this.ui.modalOpen;
    if (me.faceHold > 0) me.faceHold -= dt;
    this.updateFacing(me, dt, me.dodgeT > 0 || me.dashT > 0 ? Math.atan2(me.dvy, me.dvx) : il ? Math.atan2(iy, ix) : null, me.faceHold > 0);

    if (this.pressed.has(' ') && me.dodgeCd <= 0 && me.dashT <= 0) {
      let dx = ix, dy = iy;
      if (!il) { dx = Math.cos(me.aim); dy = Math.sin(me.aim); }
      me.dodgeT = me.dodgeDur = 0.32; me.dodgeCd = me.dodgeMax; me.dvx = dx; me.dvy = dy; me.dodgeDir = dx >= 0 ? 1 : -1;
      sfx('dodge');
      for (let i = 0; i < 8; i++) this.part({ x: me.x, y: me.y, vx: rand(-60, 60) - dx * 60, vy: rand(-30, 30) - dy * 60, z: 2, vz: rand(10, 40), life: rand(0.4, 0.7), size: rand(3, 6), col: '#8a8070', kind: 'smoke' });
    }

    if (me.dashT > 0) {
      me.dashT -= dt;
      me.vx = me.dvx * 1150; me.vy = me.dvy * 1150;
      if (Math.random() < 0.8) this.part({ x: me.x, y: me.y - 18, vx: 0, vy: 0, life: 0.25, size: 9, col: SKILLS.dash.color, kind: 'mote', glow: true });
    } else if (me.dodgeT > 0) {
      me.dodgeT -= dt;
      const k = me.dodgeT / me.dodgeDur;
      me.vx = me.dvx * (220 + 320 * k); me.vy = me.dvy * (220 + 320 * k);
    } else {
      const spd = SPEED * me.stats.speed * (this.isCharging() ? 0.55 : 1);
      const tx = ix * spd, ty = iy * spd;
      const a = 1 - Math.exp(-dt * (il ? 16 : 12));
      me.vx += (tx - me.vx) * a; me.vy += (ty - me.vy) * a;
    }
    moveCircle(m, me, me.vx * dt, me.vy * dt);
    // 敵とぶつかる（重ならないように）
    for (const e of this.enemies) {
      if (ENEMIES[e.type].fly) continue;
      const dx = me.x - e.x, dy = me.y - e.y, d = Math.hypot(dx, dy), md = me.r + e.r * 0.85;
      if (d < md && d > 0.01) moveCircle(m, me, (dx / d) * (md - d) * 0.6, (dy / d) * (md - d) * 0.6);
    }
    const sp = Math.hypot(me.vx, me.vy);
    me.moveAmt = me.dodgeT > 0 ? 0 : clamp(sp / SPEED, 0, 1);
    me.walkPh += sp * dt * 0.075;
    this.swingLantern(me, dt);
    if (me.moveAmt > 0.3) this.footDust(me, dt);

    // クリックで通常攻撃、長押しで溜めて重撃
    if (!busy && me.weapon) {
      if (this.mouse.clicked) { this.mouse.clicked = false; me.holding = true; me.holdT = 0; }
      if (me.holding) {
        if (this.mouse.down) me.holdT += dt;
        else {
          me.holding = false;
          if (this.chargeReady()) this.heavyAttack(); else me.queued = true;
          me.holdT = 0;
        }
      }
      if (me.queued && me.atkCd <= 0 && me.dodgeT <= 0 && me.dashT <= 0) { me.queued = false; this.attack(); }
    } else { me.holding = false; me.holdT = 0; this.mouse.clicked = false; }
    if (!busy) SK_KEYS.forEach((k, i) => { if (this.pressed.has(k)) this.useSkill(i); });

    // 蘇生
    const al = this.ally;
    if (al && al.down && dist(me.x, me.y, al.x, al.y) < 60) {
      me.revive += dt;
      if (me.revive >= 2.2) {
        me.revive = 0;
        this.net.send({ t: 'rev' });
        al.down = false;
        this.fx('txt', { x: al.x, y: al.y - 60, s: '復活！', c: '#9fe6a0' });
      }
    } else me.revive = Math.max(0, me.revive - dt * 2);

    // 拾う・開ける
    this.interact = null;
    let best = 46;
    for (const L of this.loot) {
      if (L.t < 0.5) continue;
      const d = dist(me.x, me.y, L.x, L.y);
      if (AUTO_PICK.includes(L.item.cat)) { if (d < (L.item.cat === 'heal' ? 30 : 44) && (L.item.cat !== 'heal' || me.hp < me.maxHp) && !(L.pend > this.time)) { L.pend = this.time + 0.6; this.requestPick(L); } continue; }
      if (d < best) { best = d; this.interact = { type: 'loot', L }; }
    }
    if (!this.interact) for (const c of m.chests) if (!c.open && dist(me.x, me.y, c.x, c.y) < 56) this.interact = { type: 'chest', c };
    if (!this.interact) for (const p of m.puzzles) if (p.kind === 'riddle' && !p.done && !p.mine && dist(me.x, me.y, p.x, p.y) < 56) this.interact = { type: 'riddle', p };
    if (!this.interact) {
      const M = m.merchant || m.merchant2;
      const sec = m.secret;
      if (M && dist(me.x, me.y, M.x, M.y) < 64 && (M === m.merchant || sec.open)) this.interact = { type: 'shop' };
      else if (sec && !sec.open && dist(me.x, me.y, sec.dx, sec.dy) < 74) this.interact = { type: 'door' };
      else if (sec && sec.open && sec.kind === 'coins' && !sec.used && dist(me.x, me.y, sec.cx, sec.cy) < 64) this.interact = { type: 'rush' };
      else if (sec && sec.open && sec.kind === 'spring' && !sec.used && dist(me.x, me.y, sec.cx, sec.cy) < 64) this.interact = { type: 'spring' };
    }
    if (this.interact && this.pressed.has('f')) {
      if (this.interact.type === 'shop') this.ui.openShop();
      else if (this.interact.type === 'door') {
        if (!m.keyGot) this.ui.toast('鍵がかかっている。この階のどこかに鍵があるはず', '#c9c2b2');
        else if (this.isHost) this.openDoor(); else this.net.send({ t: 'door' });
      } else if (this.interact.type === 'rush') { if (this.isHost) this.startRush(); else this.net.send({ t: 'rush' }); }
      else if (this.interact.type === 'spring') { if (this.isHost) this.useSpring(); else this.net.send({ t: 'spring' }); }
      else if (this.interact.type === 'loot') {
        const L = this.interact.L;
        if (this.me.inventory.length >= INV_MAX) this.ui.toast('持ち物がいっぱいです（Tab で整理）', '#ff8a6a');
        else if (!(L.pend > this.time)) { L.pend = this.time + 0.6; this.requestPick(L); }
      } else if (this.interact.type === 'riddle') {
        this.ui.openRiddle(this.interact.p);
      } else {
        const c = this.interact.c;
        if (this.isHost) this.openChest(c.id); else this.net.send({ t: 'chest', id: c.id });
      }
    }
  }

  // 歩いている間は進む方向を、立ち止まると狙う方向（マウス）を向く。攻撃中は攻撃する方向
  updateFacing(p, dt, walkA, attacking) {
    let target;
    if (walkA != null && !attacking) target = walkA;
    else {
      const tilt = clamp(Math.sin(p.aim) * 0.7, -0.6, 0.6);
      target = Math.cos(p.aim) < 0 ? Math.PI - tilt : tilt;
    }
    if (p.faceYaw == null) p.faceYaw = target;
    p.faceYaw += angDiff(p.faceYaw, target) * (1 - Math.exp(-dt * (attacking ? 40 : 20)));
    p.faceYaw = Math.atan2(Math.sin(p.faceYaw), Math.cos(p.faceYaw));
  }

  swingLantern(p, dt) {
    const acc = (p.vx - p.lastVx) / Math.max(dt, 0.001);
    p.lastVx = p.vx;
    p.lanVel += (-60 * p.lanAng - 5 * p.lanVel - acc * 0.0035) * dt;
    p.lanAng = clamp(p.lanAng + p.lanVel * dt, -1, 1);
  }

  footDust(p, dt) {
    p.dustT = (p.dustT || 0) - dt;
    if (p.dustT > 0) return;
    p.dustT = 0.22;
    this.part({ x: p.x + rand(-4, 4), y: p.y + 1, vx: -p.vx * 0.1 + rand(-10, 10), vy: rand(-6, 4), z: 1, vz: rand(8, 20), life: 0.5, size: rand(2.5, 4), col: '#7a7266', kind: 'smoke' });
  }

  // ================= 攻撃 =================
  // 一番近い敵（壁の向こうは除く）
  nearestEnemy(x, y, range) {
    let best = null, bd = range;
    for (const e of this.enemies) {
      const d = dist(x, y, e.x, e.y) - e.r;
      if (d < bd && lineOfSight(this.map, x, y, e.x, e.y)) { bd = d; best = e; }
    }
    return best;
  }

  lockAim(a, t) { const me = this.me; me.aim = me.lockA = a; me.aimLock = t; }

  // 重撃が使えるジョブで、十分に溜まっているか
  chargeTime() { const me = this.me; return WEAPONS[me.weapon.base].heavy.t * (1 - me.stats.haste * 0.5); }
  isCharging() { const me = this.me; return me.holding && me.holdT > 0.2 && !JOBS[me.job].noHeavy; }
  chargeReady() { return this.isCharging() && this.me.holdT >= this.chargeTime(); }

  heavyAttack() {
    const me = this.me, it = me.weapon, W = WEAPONS[it.base];
    const tgt = this.nearestEnemy(me.x, me.y, W.kind === 'melee' || W.kind === 'thrust' ? 220 : 420);
    const aim = tgt ? Math.atan2(tgt.y - me.y, tgt.x - me.x) : me.aim;
    me.atkSeq++; me.atkT = 0; me.atkDur = 0.45; me.atkCd = it.rate * 1.3;
    me.faceHold = 0.6;
    this.lockAim(aim, 0.4);
    sfx('heavy');
    this.shake = Math.max(this.shake, 5);
    if (it.base === 'spear' || it.base === 'dagger') { me.dashT = it.base === 'spear' ? 0.2 : 0.14; me.dvx = Math.cos(aim); me.dvy = Math.sin(aim); me.inv = Math.max(me.inv, 0.35); }
    const d = { pid: me.id, x: me.x, y: me.y, aim, heavy: 1, tx: tgt ? tgt.x : me.x + Math.cos(aim) * 220, ty: tgt ? tgt.y : me.y + Math.sin(aim) * 220, w: it, m: me.stats.atk, xc: me.stats.crit, cd: me.stats.critDmg, xa: me.stats.aff, vamp: me.stats.vamp };
    if (this.isHost) this.playerAttack(d); else this.net.send({ t: 'atk', ...d });
  }

  attack() {
    const me = this.me, it = me.weapon;
    if (!it) return;
    const W = WEAPONS[it.base];
    const melee = W.kind === 'melee' || W.kind === 'thrust';
    // 近くに敵がいればそちらへ、いなければクリックした方向へ
    const reach = melee ? W.range + 70 : 380;
    const tgt = this.nearestEnemy(me.x, me.y, reach);
    const rate = it.rate * (1 - me.stats.haste);
    me.atkSeq++; me.atkT = 0; me.atkDur = atkDurFor(it) * (1 - me.stats.haste); me.atkCd = rate;
    me.faceHold = me.atkDur + 0.18;
    this.lockAim(tgt ? Math.atan2(tgt.y - me.y, tgt.x - me.x) : me.aim, me.atkDur * 0.8);
    this.pix.slash(me);
    sfx(W.kind === 'bow' ? 'bow' : W.kind === 'staff' ? 'cast' : W.kind === 'thrust' ? 'thrust' : it.base === 'axe' ? 'heavy' : 'swing');
    if (melee) {
      // 届かないときは敵へ踏み込む
      const gap = tgt ? dist(me.x, me.y, tgt.x, tgt.y) - tgt.r - W.range * 0.7 : 0;
      const push = 70 + clamp(gap, 0, 70) * 7;
      me.vx += Math.cos(me.aim) * push; me.vy += Math.sin(me.aim) * push;
    }
    // 無明は敵の背後へ跳ぶ
    if (it.rarity === 6 && it.base === 'dagger' && tgt) {
      const bx = tgt.x + Math.cos(me.aim) * (tgt.r + 18), by = tgt.y + Math.sin(me.aim) * (tgt.r + 18);
      if (!hitsWall(this.map, bx, by, me.r)) { this.pix.vfx('pfx', { n: 'blinkOut', x: me.x, y: me.y }); me.x = bx; me.y = by; me.inv = Math.max(me.inv, 0.2); }
    }
    const d = { pid: me.id, x: me.x, y: me.y, aim: me.aim, tx: tgt ? tgt.x : 0, ty: tgt ? tgt.y : 0, w: it, m: me.stats.atk, xc: me.stats.crit, cd: me.stats.critDmg, xa: me.stats.aff, vamp: me.stats.vamp };
    if (this.isHost) this.playerAttack(d); else this.net.send({ t: 'atk', ...d });
  }

  playerAttack(d) {
    const W = WEAPONS[d.w.base];
    const base = d.w.dmg * d.m;
    const src = { pid: d.pid, w: { ...d.w, crit: d.w.crit + (d.xc || 0), affixes: [...(d.w.affixes || []), ...(d.xa || [])] }, critDmg: d.cd || 0, vamp: d.vamp || 0, knock: W.knock, x: d.x, y: d.y };
    const R = d.w.rarity || 0;
    if (d.heavy) { this.heavyStrike(d, base, src); return; }
    if (R === 6) { this.uniqueNormal(d, base, src); return; }
    if (R === 5) this.fx('pfx', { n: 'collectBurst', x: Math.round(d.x + Math.cos(d.aim) * 40), y: Math.round(d.y + Math.sin(d.aim) * 30) });
    if (W.kind === 'melee' || W.kind === 'thrust') {
      for (const e of [...this.enemies]) {
        const dx = e.x - d.x, dy = e.y - d.y;
        const dd = Math.hypot(dx, dy);
        if (dd > W.range + e.r) continue;
        if (W.kind === 'melee') {
          if (dd > e.r + 8 && Math.abs(angDiff(d.aim, Math.atan2(dy, dx))) > W.arc / 2 + 0.25) continue;
        } else {
          const along = dx * Math.cos(d.aim) + dy * Math.sin(d.aim);
          const perp = Math.abs(-dx * Math.sin(d.aim) + dy * Math.cos(d.aim));
          if (along < -8 || perp > e.r + 14) continue;
        }
        if (!lineOfSight(this.map, d.x, d.y, e.x, e.y)) continue;
        this.damageEnemy(e, base, src, Math.atan2(dy, dx));
      }
    } else {
      const sp = W.speed;
      const ca = Math.cos(d.aim), sa = Math.sin(d.aim);
      this.projs.push({
        id: this.nextId++, kind: W.kind === 'bow' ? 'arrow' : 'bolt', x: d.x + ca * 14, y: d.y + sa * 14, vx: ca * sp, vy: sa * sp,
        owner: d.pid, dmg: base, src, life: W.kind === 'bow' ? 1.1 : 1.3, r: W.kind === 'bow' ? 7 : 10, rar: d.w.rarity,
        col: W.kind === 'bow' ? (d.w.rarity >= 2 ? RARITY[d.w.rarity].color : null) : d.w.rarity >= 2 ? RARITY[d.w.rarity].color : '#7fc8ff',
      });
    }
    if (R === 5) this.mythicExtra(d, base, src);
  }

  // まとめて当てる
  blastAt(x, y, r, dmg, src, opt = {}) {
    for (const e of [...this.enemies]) if (dist(e.x, e.y, x, y) < r + e.r) {
      this.damageEnemy(e, dmg, src, Math.atan2(e.y - y, e.x - x), { knock: 220, ...opt });
      if (opt.stun) e.stun = opt.stun;
    }
  }
  shot(kind, d, a, sp, dmg, src, o = {}) {
    this.projs.push({ id: this.nextId++, kind, x: d.x + Math.cos(a) * 16, y: d.y + Math.sin(a) * 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: d.pid, dmg, src, life: 1.1, r: 9, rar: d.w.rarity, ...o });
  }
  ownerPos(pid) { return pid === this.me.id ? this.me : this.ally || this.me; }

  // 神話の武器：通常攻撃に追加の一撃が付く
  mythicExtra(d, base, src) {
    const ca = Math.cos(d.aim), sa = Math.sin(d.aim), W = WEAPONS[d.w.base];
    switch (d.w.base) {
      case 'sword': this.shot('uwave', d, d.aim, 560, base * 0.7, src, { pierce: new Set(), life: 0.55, r: 18 }); break;
      case 'dagger': this.delayed.push({ t: 0.12, fn: () => { this.fx('pfx', { n: 'doubleSlash', x: Math.round(d.x + ca * 16), y: Math.round(d.y + sa * 16) }); this.blastAt(d.x + ca * 30, d.y + sa * 30, W.range, base * 0.7, src, { knock: 60 }); } }); break;
      case 'axe': this.fx('pfx', { n: 'dirtExplosion', x: Math.round(d.x + ca * 60), y: Math.round(d.y + sa * 44), rar: 5 }); this.blastAt(d.x + ca * 60, d.y + sa * 60, 110, base * 0.5, src, { knock: 200 }); break;
      case 'spear': {
        const pts = [[Math.round(d.x), Math.round(d.y - 20)]]; let e = this.nearestEnemy(d.x, d.y, 260); const hit = new Set();
        for (let i = 0; e && i < 2; i++) { hit.add(e); pts.push([Math.round(e.x), Math.round(e.y - 16)]); this.damageEnemy(e, base * 0.5, src, d.aim, { knock: 40 }); let nb = null, nd = 200; for (const o of this.enemies) if (!hit.has(o)) { const q = dist(o.x, o.y, e.x, e.y); if (q < nd) { nd = q; nb = o; } } e = nb; }
        if (pts.length > 1) this.fx('chain', { pts });
        break;
      }
      case 'bow': for (const k of [-1, 1]) this.shot('arrow', d, d.aim + k * 0.18, W.speed, base * 0.7, src, { r: 7 }); break;
      case 'staff': for (const k of [-1, 1]) this.shot('bolt', d, d.aim + k * 0.28, W.speed, base * 0.7, src, { r: 10, life: 1.3 }); break;
    }
  }

  // 重撃：武器ごとに攻撃の形が変わる
  heavyStrike(d, base, src) {
    const ca = Math.cos(d.aim), sa = Math.sin(d.aim), W = WEAPONS[d.w.base], R = d.w.rarity || 0;
    if (R === 6) { this.uniqueHeavy(d, base, src); return; }
    const k = R === 5 ? 1.3 : 1;
    this.fx('heavy', { b: d.w.base, x: Math.round(d.x), y: Math.round(d.y), a: +d.aim.toFixed(2), r: R });
    switch (d.w.base) {
      case 'sword':
        for (const e of [...this.enemies]) if (dist(e.x, e.y, d.x, d.y) < W.range * 1.5 + e.r && Math.abs(angDiff(d.aim, Math.atan2(e.y - d.y, e.x - d.x))) < 1.6) this.damageEnemy(e, base * 2.6 * k, src, Math.atan2(e.y - d.y, e.x - d.x), { knock: 460 });
        break;
      case 'dagger': {
        const s2 = { ...src, w: { ...src.w, crit: src.w.crit + 0.25 } };
        for (let i = 0; i < 5; i++) this.delayed.push({ t: 0.1 + i * 0.07, fn: () => { const o = this.ownerPos(d.pid), e = this.nearestEnemy(o.x, o.y, 120); if (e) { this.damageEnemy(e, base * 0.9 * k, s2, d.aim, { knock: 30 }); this.fx('pfx', { n: 'hitFlash', x: Math.round(e.x), y: Math.round(e.y) }); } } });
        break;
      }
      case 'axe':
        this.delayed.push({ t: 0.12, fn: () => { this.blastAt(d.x + ca * 30, d.y + sa * 30, 140, base * 3.2 * k, src, { knock: 460, stun: 0.8 }); this.fx('shake', { a: 12 }); this.fx('snd', { n: 'slam', x: Math.round(d.x), y: Math.round(d.y) }); } });
        break;
      case 'spear':
        for (const e of [...this.enemies]) {
          const dx = e.x - d.x, dy = e.y - d.y, along = dx * ca + dy * sa, perp = Math.abs(-dx * sa + dy * ca);
          if (along > -10 && along < 270 && perp < e.r + 28) this.damageEnemy(e, base * 2.4 * k, src, d.aim, { knock: 340 });
        }
        break;
      case 'bow':
        this.shot('arrow', d, d.aim, 1050, base * 3 * k, src, { pierce: new Set(), r: 13, life: 0.85, rar: Math.max(3, R) });
        this.fx('snd', { n: 'zap', x: Math.round(d.x), y: Math.round(d.y) });
        break;
      case 'staff':
        this.shot('orb', d, d.aim, 260, base * 2.8 * k, src, { boom: 130, pullIn: 1, life: 1.5, r: 16 });
        break;
    }
  }

  uniqueNormal(d, base, src) {
    const ca = Math.cos(d.aim), sa = Math.sin(d.aim);
    const tx = d.tx || d.x + ca * 150, ty = d.ty || d.y + sa * 150;
    const X = Math.round(d.x), Y = Math.round(d.y), TX = Math.round(tx), TY = Math.round(ty);
    switch (d.w.base) {
      case 'sword':
        this.shot('uwave', d, d.aim, 640, base * 1.3, { ...src, killHeal: 0.03 }, { pierce: new Set(), r: 26, life: 0.7 });
        this.fx('pfx', { n: 'swordSlash', x: Math.round(d.x + ca * 16), y: Math.round(d.y - 14), rar: 6, f: ca < 0 ? 1 : 0 });
        break;
      case 'dagger':
        this.fx('pfx', { n: 'spinSlash', x: X, y: Y, rar: 6 });
        this.blastAt(d.x, d.y, 150, base * 1.2, src, { knock: 90 });
        break;
      case 'axe':
        this.fx('pfx', { n: 'plasmaExplosion', x: Math.round(d.x + ca * 50), y: Math.round(d.y + sa * 40), rar: 6 });
        this.fx('shake', { a: 8 });
        this.blastAt(d.x + ca * 50, d.y + sa * 50, 120, base * 1.1, src, { knock: 320 });
        this.fx('pfx', { n: 'meteor', x: TX, y: TY, rar: 6 });
        this.delayed.push({ t: 0.62, fn: () => this.blastAt(tx, ty, 90, base * 1.1, src, { burn: true }) });
        break;
      case 'spear': {
        this.fx('pfx', { n: 'zapHit', x: TX, y: TY });
        const pts = [[X, Y - 20]]; let e = this.nearestEnemy(d.x, d.y, 300); const hit = new Set();
        for (let i = 0; e && i < 5; i++) { hit.add(e); pts.push([Math.round(e.x), Math.round(e.y - 16)]); this.damageEnemy(e, base * 0.95, src, d.aim, { knock: 60 }); let nb = null, nd = 240; for (const o of this.enemies) if (!hit.has(o)) { const q = dist(o.x, o.y, e.x, e.y); if (q < nd) { nd = q; nb = o; } } e = nb; }
        if (pts.length > 1) this.fx('chain', { pts });
        this.fx('snd', { n: 'zap', x: X, y: Y });
        break;
      }
      case 'bow':
        for (let i = -2; i <= 2; i++) this.shot('bolt', d, d.aim + i * 0.2, 620, base * 0.8, src, { r: 10, life: 1.3 });
        break;
      case 'staff':
        this.shot('void', d, d.aim, 320, base * 1.5, src, { boom: 105, pullIn: 1, life: 0.9, r: 15 });
        break;
    }
  }

  uniqueHeavy(d, base, src) {
    const ca = Math.cos(d.aim), sa = Math.sin(d.aim);
    const tx = d.tx, ty = d.ty, TX = Math.round(tx), TY = Math.round(ty), X = Math.round(d.x), Y = Math.round(d.y);
    this.fx('flash', { x: X, y: Y, c: '#6ff5e8' });
    switch (d.w.base) {
      case 'sword':
        this.fx('pfx', { n: 'sunburst', x: X, y: Y - 18, p: 'gold', life: 1 });
        for (let i = 1; i <= 7; i++) this.delayed.push({ t: i * 0.09, fn: () => {
          const x = d.x + ca * 62 * i, y = d.y + sa * 62 * i;
          this.fx('pfx', { n: 'holyPillar', x: Math.round(x), y: Math.round(y), p: 'gold' });
          this.blastAt(x, y, 70, base * 2.2, src, { knock: 200 });
          this.fx('shake', { a: 4 });
        } });
        break;
      case 'dagger': {
        this.fx('pfx', { n: 'timeStop', x: X, y: Y });
        for (const e of this.enemies) if (dist(e.x, e.y, d.x, d.y) < 320) e.stun = Math.max(e.stun || 0, 2.2);
        const s2 = { ...src, w: { ...src.w, crit: src.w.crit + 0.4 } };
        for (let i = 0; i < 12; i++) this.delayed.push({ t: 0.2 + i * 0.09, fn: () => { const o = this.ownerPos(d.pid), e = this.nearestEnemy(o.x, o.y, 320); if (e) { this.damageEnemy(e, base * 1.1, s2, rand(TAU), { knock: 0 }); this.fx('pfx', { n: 'doubleSlash', x: Math.round(e.x), y: Math.round(e.y - 10), rar: 6 }); } } });
        break;
      }
      case 'axe':
        this.fx('pfx', { n: 'implosion', x: X, y: Y - 10 });
        this.delayed.push({ t: 0.7, fn: () => {
          this.fx('pfx', { n: 'bigExplosion', x: X, y: Y, life: 2.2 });
          this.fx('shake', { a: 22 }); this.fx('snd', { n: 'boom', x: X, y: Y });
          this.blastAt(d.x, d.y, 270, base * 4.5, src, { knock: 620, burn: true, stun: 1 });
        } });
        break;
      case 'spear': {
        this.fx('pfx', { n: 'stormCloud', x: TX, y: TY, life: 5 });
        for (let i = 0; i < 10; i++) this.delayed.push({ t: 0.4 + i * 0.45, fn: () => {
          const e = this.nearestEnemy(tx, ty, 240), x = e ? e.x : tx + rand(-80, 80), y = e ? e.y : ty + rand(-60, 60);
          this.fx('pfx', { n: 'thunderclap', x: Math.round(x), y: Math.round(y) });
          this.blastAt(x, y, 80, base * 1.6, src, { knock: 80, stun: 0.4 });
        } });
        break;
      }
      case 'bow':
        for (let i = 0; i < 3; i++) this.delayed.push({ t: i * 0.4, fn: () => this.fx('pfx', { n: 'starFall', x: TX + randi(-70, 70), y: TY + randi(-50, 50), rar: 6 }) });
        for (let i = 0; i < 14; i++) this.delayed.push({ t: 0.3 + i * 0.13, fn: () => { const x = tx + rand(-130, 130), y = ty + rand(-90, 90); this.blastAt(x, y, 70, base * 1.3, src, { knock: 60 }); } });
        break;
      case 'staff':
        this.fx('pfx', { n: 'blackHole', x: TX, y: TY, life: 2.6 });
        this.addZone({ x: tx, y: ty, r: 200, dur: 2.6, dps: base * 0.8, src, pull: 320, vis: 'none' });
        this.delayed.push({ t: 2.0, fn: () => this.fx('pfx', { n: 'implosion', x: TX, y: TY }) });
        this.delayed.push({ t: 2.6, fn: () => { this.fx('pfx', { n: 'plasmaExplosion', x: TX, y: TY, rar: 6 }); this.fx('shake', { a: 18 }); this.blastAt(tx, ty, 200, base * 5, src, { knock: 500 }); } });
        break;
    }
  }

  // ================= ペットと召喚獣 =================
  sendCompanion() {
    const me = this.me, def = me.pets.find((x) => x.id === me.petId) || null;
    if (this.isHost) { this.comp[me.id] = def; this.syncCompanion(me.id); }
    else if (this.net) this.net.send({ t: 'petset', pet: def });
  }
  syncCompanion(pid) {
    if (!this.isHost || !this.map) return;
    this.pets = this.pets.filter((q) => !(q.pid === pid && q.companion));
    const def = this.comp[pid];
    if (!def) return;
    const o = this.ownerPos(pid);
    this.pets.push({ id: this.nextId++, pid, sp: def.sp, el: def.el, x: o.x - 24, y: o.y, vx: 0, vy: 0, r: 8, t: 1, sk: 6, dmg: petDamage(def, this.floor) * (this.diff.hp ** 0.6), companion: true });
  }
  spawnSummon(pid, kind, el, pw, count) {
    const n = count || pw.n || 1, o = this.ownerPos(pid);
    const dmg = pw.dmg * (1 + 0.11 * (this.floor - 1));
    for (let i = 0; i < n; i++) {
      const sp = kind === 'mix' ? pick(['skull', 'ghost', 'bat', 'wisp']) : kind;
      const a = (i / n) * TAU, q0 = this.openSpot(o.x + Math.cos(a) * 34, o.y + Math.sin(a) * 26, 10), x = q0.x, y = q0.y;
      this.pets.push({ id: this.nextId++, pid, sp, el, x, y, vx: 0, vy: 0, r: 8, t: rand(0.2, 0.7), sk: rand(4, 8), dmg, dur: pw.dur });
      this.fx('pfx', { n: 'summonRise', x: Math.round(x), y: Math.round(y) });
    }
    const mine = this.pets.filter((q) => q.pid === pid && !q.companion);
    if (mine.length > SUMMON_CAP) { const gone = new Set(mine.slice(0, mine.length - SUMMON_CAP)); this.pets = this.pets.filter((q) => !gone.has(q)); }
    this.fx('snd', { n: 'cast', x: Math.round(o.x), y: Math.round(o.y) });
  }
  elemHit(e, el, pid, dmg) {
    if (e.hp <= 0) return;
    if (el === 'fire' || el === 'poison') { e.burn = Math.max(e.burn || 0, 2.5); e.burnDmg = Math.max(e.burnDmg || 0, Math.max(2, Math.round(dmg * 0.25))); }
    else if (el === 'ice') e.slow = Math.max(e.slow || 0, 1.5);
    else if (el === 'thunder') { if (Math.random() < 0.2 && !ENEMIES[e.type].boss) e.stun = 0.7; }
    else if (el === 'holy') this.healPlayer(pid, Math.max(1, Math.round(dmg * 0.2)), true);
    else if (el === 'shadow') { e.mark = Math.max(e.mark || 0, 2); e.markAmp = Math.max(e.markAmp || 0, 0.2); }
  }
  updatePets(dt) {
    const dead = [];
    for (const q of this.pets) {
      const P0 = PETS[q.sp], o = this.ownerPos(q.pid);
      if (q.dur != null) { q.dur -= dt; if (q.dur <= 0) { dead.push(q); this.fx('pfx', { n: 'poof', x: Math.round(q.x), y: Math.round(q.y) }); continue; } }
      const srcO = { pid: q.pid, w: { crit: 0.08, affixes: [], rarity: 0 }, critDmg: 0, vamp: 0, knock: 50, x: q.x, y: q.y };
      if (P0.mode === 'orbit') {
        // 主人の周りを回る刃
        q.a = (q.a ?? q.id) + dt * 3.2;
        q.x = o.x + Math.cos(q.a) * 58; q.y = o.y - 8 + Math.sin(q.a) * 40; q.flip = Math.sin(q.a) > 0;
        q.t -= dt;
        if (q.t <= 0) { q.t = 0.2; for (const e of [...this.enemies]) if (dist(e.x, e.y, q.x, q.y) < e.r + 24) { this.damageEnemy(e, q.dmg, srcO, q.a + Math.PI / 2, { knock: 90 }); q.t = 0.3; } }
        continue;
      }
      if (P0.mode === 'aura') {
        // 置いた場所で周りを焼き続ける
        q.t -= dt;
        if (q.t <= 0) { q.t = P0.rate; if (this.enemies.some((e) => dist(e.x, e.y, q.x, q.y) < P0.aura + e.r)) { this.fx('pfx', { n: 'fireRing', x: Math.round(q.x), y: Math.round(q.y) }); this.blastAt(q.x, q.y, P0.aura, q.dmg, srcO, { knock: 60, burn: true }); } }
        continue;
      }
      if (P0.mode === 'healer') {
        // 主人のそばに浮かんで癒す
        const hx = o.x - 36, hy = o.y - 14;
        q.x += (hx - q.x) * Math.min(1, dt * 5); q.y += (hy - q.y) * Math.min(1, dt * 5);
        q.t -= dt;
        if (q.t <= 0) { q.t = P0.rate; for (const p of [this.me, this.ally]) if (p && !p.down && p.hp < p.maxHp && dist(p.x, p.y, q.x, q.y) < 220) { this.healPlayer(p.id, Math.round(q.dmg)); } }
        continue;
      }
      const tgt = this.nearestEnemy(q.x, q.y, P0.mode === 'still' ? 300 : 340);
      let tx, ty, spd = P0.spd;
      const home = q.id * 2.4 + this.time * 0.5;
      if (tgt) {
        const dd = dist(q.x, q.y, tgt.x, tgt.y), want = P0.range ? P0.range * 0.8 : tgt.r + 12;
        if (dd > want) { tx = tgt.x; ty = tgt.y; } else { tx = q.x; ty = q.y; }
        q.flip = tgt.x < q.x;
      } else { tx = o.x + Math.cos(home) * 40; ty = o.y + Math.sin(home) * 26; q.flip = o.x < q.x; if (dist(q.x, q.y, tx, ty) < 12) { tx = q.x; ty = q.y; } }
      if (dist(q.x, q.y, o.x, o.y) > 560) { q.x = o.x; q.y = o.y; }
      const dd = dist(q.x, q.y, tx, ty);
      if (P0.mode === 'still') { tx = q.x; ty = q.y; q.vx = q.vy = 0; }
      if (dd > 1 && P0.mode !== 'still') { const a = 1 - Math.exp(-dt * 8); q.vx += ((tx - q.x) / dd * spd - q.vx) * a; q.vy += ((ty - q.y) / dd * spd - q.vy) * a; }
      else { q.vx *= 0.8; q.vy *= 0.8; }
      if (P0.fly) { q.x += q.vx * dt; q.y += q.vy * dt; } else moveCircle(this.map, q, q.vx * dt, q.vy * dt);
      q.t -= dt; q.sk -= dt;
      const src = { pid: q.pid, w: { crit: 0.08, affixes: [], rarity: 0 }, critDmg: 0, vamp: 0, knock: 50, x: q.x, y: q.y };
      if (P0.mode === 'cloud' && tgt && q.t <= 0) {
        // 雷雲：真下の敵に落雷
        if (dist(q.x, q.y, tgt.x, tgt.y) < 70) { q.t = P0.rate; this.fx('pfx', { n: 'zapHit', x: Math.round(tgt.x), y: Math.round(tgt.y) }); this.fx('snd', { n: 'zap', x: Math.round(q.x), y: Math.round(q.y) }); this.blastAt(tgt.x, tgt.y, 70, q.dmg, srcO, { knock: 40, stun: 0.3 }); }
      } else if (tgt && q.t <= 0) {
        const d2 = dist(q.x, q.y, tgt.x, tgt.y);
        if (P0.range && d2 < P0.range + tgt.r + 30) {
          q.t = P0.rate;
          const a = Math.atan2(tgt.y - q.y, tgt.x - q.x);
          this.projs.push({ id: this.nextId++, kind: 'bolt', x: q.x, y: q.y - 8, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, owner: q.pid, dmg: q.dmg, src, life: 1.1, r: 8, rar: 2, el: q.el });
        } else if (!P0.range && d2 < tgt.r + 28) {
          q.t = P0.rate;
          this.damageEnemy(tgt, q.dmg, src, Math.atan2(tgt.y - q.y, tgt.x - q.x), { knock: 50 });
          this.elemHit(tgt, q.el, q.pid, q.dmg);
          if (q.sp === 'bat') this.healPlayer(q.pid, Math.max(1, Math.round(q.dmg * 0.15)), true);
        }
      }
      if (tgt && q.sk <= 0) { q.sk = rand(8, 11); this.petSkill(q, tgt, src); }
    }
    if (dead.length) this.pets = this.pets.filter((q) => !dead.includes(q));
  }
  petSkill(q, tgt, src) {
    const type = PETS[q.sp].skill.type, X = Math.round(q.x), Y = Math.round(q.y), TX = Math.round(tgt.x), TY = Math.round(tgt.y), el = q.el;
    switch (type) {
      case 'blast': this.fx('pfx', { n: 'smallExplosion', x: TX, y: TY, el }); this.blastAt(tgt.x, tgt.y, 80, q.dmg * 2.4, src, { knock: 200 }); break;
      case 'strike': this.fx('pfx', { n: 'hitFlash', x: TX, y: TY }); this.damageEnemy(tgt, q.dmg * 3.2, src, 0, { knock: 200 }); this.elemHit(tgt, el, q.pid, q.dmg * 2); break;
      case 'drain': this.fx('pfx', { n: 'soulDrain', x: X, y: Y, life: 0.8, el }); this.blastAt(q.x, q.y, 90, q.dmg * 1.5, src, { knock: 30 }); this.healPlayer(q.pid, Math.round(q.dmg * 2)); break;
      case 'heal': this.fx('pfx', { n: 'healAoe', x: X, y: Y }); for (const p of [this.me, this.ally]) if (p && !p.down && dist(p.x, p.y, q.x, q.y) < 240) this.healPlayer(p.id, Math.round(14 + q.dmg * 1.5)); break;
      case 'stun': this.fx('pfx', { n: 'zapHit', x: TX, y: TY }); this.blastAt(tgt.x, tgt.y, 90, q.dmg * 1.6, src, { knock: 30, stun: 1 }); break;
      case 'burst': for (let i = 0; i < 5; i++) { const a = Math.atan2(tgt.y - q.y, tgt.x - q.x) + (i - 2) * 0.28; this.projs.push({ id: this.nextId++, kind: 'bolt', x: q.x, y: q.y - 8, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, owner: q.pid, dmg: q.dmg, src, life: 0.9, r: 8, rar: 2, el }); } break;
      case 'curse': this.fx('pfx', { n: 'curse', x: TX, y: TY }); for (const e of this.enemies) if (dist(e.x, e.y, tgt.x, tgt.y) < 120) { e.mark = 5; e.markAmp = 0.3; } break;
      case 'slow': this.fx('pfx', { n: 'toxicPuddle', x: X, y: Y, life: 2, el }); for (const e of this.enemies) if (dist(e.x, e.y, q.x, q.y) < 130) e.slow = 4; break;
    }
  }

  // ================= 隠し部屋 =================
  spawnSecret() {
    const m = this.map, s = m.secret, D = this.diff;
    if (!s) return;
    this.spawnLoot(s.kx, s.ky, makeKey(), s.kx, s.ky);
    const drop = (item, dx, dy) => this.spawnLoot(s.cx + dx, s.cy + dy, item, s.cx + dx, s.cy + dy);
    if (s.kind === 'treasure') {
      drop(makeStar(), 0, 0);
      drop(makePotion(), -70, 30); drop(makePotion(), 70, 30);
      for (let i = 0; i < 3; i++) drop(makeXpOrb(20 + this.floor * 6), -60 + i * 60, -40);
      for (let i = 0; i < 6; i++) drop(makeCoin(4 + this.floor), rand(-90, 90), rand(-60, 60));
      drop(rollLoot(this.floor, 0.3 + D.loot, D, Math.max(2, D.minChest)), 0, 50);
      if (Math.random() < 0.35) drop(makeEgg(), 0, -60);
    } else if (s.kind === 'spring') drop(makePotion(), 0, 60);
  }
  applyDoor() {
    const m = this.map, s = m.secret;
    if (!s || s.open) return;
    s.open = true;
    for (const [x, y] of s.doorTiles) m.g[y * m.W + x] = 1;
    this.pix.rebuild(m);
  }
  openDoor() {
    const m = this.map;
    if (!m.secret || m.secret.open || !m.keyGot) return;
    this.fx('door', {});
    this.ui.toast('隠し部屋の扉が開いた！', '#ffd27a');
  }
  startRush() {
    const s = this.map.secret;
    if (!s || s.used) return;
    this.fx('rushstart', {});
    this.rush = { t: 15, spawn: 0, got: 0 };
  }
  updateRush(dt) {
    const r = this.rush, m = this.map;
    if (!r || !m.secret) return;
    const s = m.secret;
    r.t -= dt; r.spawn -= dt;
    if (r.spawn <= 0 && r.t > 0) {
      r.spawn = 0.32;
      const rm = s.room, x = (rm.x + 0.5 + Math.random() * (rm.w - 1)) * T, y = (rm.y + 0.5 + Math.random() * (rm.h - 1)) * T;
      this.spawnLoot(x, y, makeCoin(1 + Math.floor(this.floor / 3) + (Math.random() < 0.1 ? 5 : 0)), x, y - 40);
    }
    if (r.t <= 0) {
      this.rush = null;
      this.fx('rushend', { x: s.cx, y: s.cy });
      this.spawnLoot(s.cx, s.cy, rollLoot(this.floor, 0.2 + this.diff.loot, this.diff, this.diff.minChest), s.cx, s.cy);
    }
  }
  useSpring() {
    const s = this.map.secret;
    if (!s || s.used) return;
    this.fx('springuse', {});
    const buff = pick([{ atk: 0.25 }, { haste: 0.2 }, { crit: 0.2 }, { speed: 0.15, regen: 3 }]);
    for (const p of [this.me, this.ally]) if (p) { this.healPlayer(p.id, 9999); this.buffPlayer(p.id, buff, 90); this.fx('pfx', { n: 'blessing', x: Math.round(p.x), y: Math.round(p.y), life: 1.2 }); }
    this.giveSP(Math.random() < 0.3 * this.diff.sp ? 1 : 0);
  }
  addCoins(n) {
    const me = this.me;
    me.coins += n;
    this.texts.push({ x: me.x, y: me.y - 46, s: `+${n}`, c: '#ffd860', t: 0, dur: 0.7, size: 12, vy: -36 });
  }
  updateHazard(dt) {
    const D0 = this.dimIdx != null ? DIMS[this.dimIdx] : null;
    if (!D0 || D0.hazard !== 'bolt') return;
    this.hazardT -= dt;
    if (this.hazardT > 0) return;
    this.hazardT = rand(2.2, 3.6);
    const list = [this.me, this.ally].filter((p) => p && !p.down);
    if (!list.length) return;
    const p = pick(list), x = p.x + rand(-40, 40), y = p.y + rand(-30, 30);
    this.fx('pfx', { n: 'lightningStrike', x: Math.round(x), y: Math.round(y) });
    this.delayed.push({ t: 0.76, fn: () => { for (const q of list) if (dist(q.x, q.y, x, y) < 56 + q.r) this.hurtPlayer(q, Math.round((12 + this.floor * 3) * this.diff.dmg), x, y); this.fx('snd', { n: 'zap', x: Math.round(x), y: Math.round(y) }); } });
  }

  damageEnemy(e, base, src, ang, opts = {}) {
    if (e.hp <= 0) return;
    const w = src.w || {};
    const crit = !opts.noCrit && Math.random() < (w.crit || 0.05);
    const dmg = Math.max(1, Math.round(base * (crit ? 1.8 + (src.critDmg || 0) : 1) * (e.mark > 0 ? 1 + (e.markAmp || 0.35) : 1) * rand(0.9, 1.1)));
    e.hp -= dmg;
    e.flash = 0.12;
    const aff = w.affixes || [];
    const resist = ENEMIES[e.type].boss ? 0.08 : (ENEMIES[e.type].kb || 1) * (e.elite ? 0.6 : 1);
    const kb = (opts.knock != null ? opts.knock : src.knock || 120) * (aff.includes('heavy') ? 1.6 : 1) * resist;
    if (ang != null) { e.kx += Math.cos(ang) * kb; e.ky += Math.sin(ang) * kb; }
    if (aff.includes('burn') || opts.burn) { e.burn = 3; e.burnDmg = Math.max(2, Math.round(dmg * 0.18)); }
    if (aff.includes('frost') || opts.slow) e.slow = opts.slow || 2;
    const vamp = (aff.includes('vamp') ? 0.06 : 0) + (src.vamp || 0);
    if (vamp) this.healPlayer(src.pid, Math.max(1, Math.round(dmg * vamp)), true);
    if (e.state === 'idle') e.state = 'chase';
    if (e.state === 'wind' && crit && !ENEMIES[e.type].boss && !e.elite) { e.state = 'rec'; e.st = 0; e.stDur = 0.4; }
    const col = w.rarity >= 2 ? RARITY[w.rarity].color : '#ffffff';
    this.fx('hit', { x: Math.round(e.x), y: Math.round(e.y - 14), d: dmg, c: crit ? 1 : 0, col, r: w.rarity || 0, p: src.pid, a: ang != null ? +ang.toFixed(2) : 0 });
    if (e.hp <= 0) {
      if (src.killHeal) this.healPlayer(src.pid, Math.round(this.ownerPos(src.pid).maxHp * src.killHeal), true);
      if (w.rarity >= 5 && Math.random() < 0.3) this.fx('pfx', { n: 'plasmaExplosion', x: Math.round(e.x), y: Math.round(e.y - 10), rar: w.rarity });
      this.killEnemy(e, src.pid);
    }
  }

  killEnemy(e, pid) {
    this.enemies = this.enemies.filter((x) => x !== e);
    this.lastKill = { x: e.x, y: e.y };
    const d = ENEMIES[e.type];
    this.fx('die', { x: Math.round(e.x), y: Math.round(e.y), t: e.type, v: e.var, f: Math.cos(e.aim) < 0 ? 1 : 0 });
    const D = this.diff;
    if (e.noLoot) return;
    this.addXp(Math.round(d.xp * (e.vxp || 1) * D.xp * (e.elite ? 2.2 : 1) * (1 + 0.1 * (this.floor - 1))));
    if (e.type === 'slimeL') for (let i = 0; i < 2; i++) { const s = this.mkEnemy('slime', e.x + rand(-12, 12), e.y + rand(-12, 12), false); s.state = 'chase'; s.kx = rand(-200, 200); s.ky = rand(-200, 200); this.enemies.push(s); }
    const r = Math.random();
    const dimC = this.dimIdx != null && DIMS[this.dimIdx].coins || 1;
    if (Math.random() < 0.4) this.spawnLoot(e.x + rand(-14, 14), e.y + rand(-14, 14), makeCoin(Math.ceil((e.elite ? 5 : 2) * (1 + this.floor * 0.12) * dimC)), e.x, e.y);
    if (e.elite) this.spawnLoot(e.x + rand(-20, 20), e.y + rand(-20, 20), makeXpOrb(Math.round(d.xp * 0.6)), e.x, e.y);
    if (d.boss) {
      this.fx('fireworks', { x: Math.round(e.x), y: Math.round(e.y) });
      for (let i = 0; i < 8; i++) this.spawnLoot(e.x + rand(-90, 90), e.y + rand(-70, 70), makeCoin(4 + this.floor), e.x, e.y);
      this.spawnLoot(e.x, e.y + 40, makePotion(), e.x, e.y);
    }
    if (e.elite && Math.random() < 0.15 * D.sp) this.giveSP(1);
    if (d.boss) {
      this.giveSP(Math.floor(2 * D.sp + Math.random()));
      for (let i = 0; i < 3; i++) this.spawnLoot(e.x + rand(-60, 60), e.y + rand(-40, 40), rollLoot(this.floor, 0.25 + i * 0.05 + D.loot, D, D.minBoss), e.x, e.y);
      for (let i = 0; i < 2; i++) this.spawnLoot(e.x + rand(-70, 70), e.y + rand(-50, 50), rollGear(this.floor, 0.2 + D.loot, setOfFloor(this.floor), D.minBoss), e.x, e.y);
      // 鬼の番人は上級巻物を必ず落とす
      this.spawnLoot(e.x + 30, e.y + 50, makeScroll(pick(SCROLL_POOL), D.minBoss >= 3 ? (Math.random() < 0.35 ? 4 : 3) : 2), e.x, e.y);
    } else if (e.elite ? r < 0.65 : r < 0.085) this.spawnLoot(e.x, e.y, rollLoot(this.floor, e.elite ? 0.12 : 0, D), e.x, e.y);
    else if (r < 0.26) this.spawnLoot(e.x + rand(-6, 6), e.y + rand(-6, 6), { cat: 'heal', amt: 22, id: 'h' + this.nextId++ }, e.x, e.y);
  }

  addXp(n) {
    this.xp += n;
    let up = false;
    while (this.xp >= xpForLevel(this.lvl)) { this.xp -= xpForLevel(this.lvl); this.lvl++; up = true; }
    this.setXp(this.xp, this.lvl, up);
    if (this.net) this.net.send({ t: 'xp', xp: this.xp, lvl: this.lvl });
  }

  setXp(xp, lvl) {
    const up = lvl > this.lvl;
    this.xp = xp;
    if (up || lvl !== this.lvl) {
      this.lvl = lvl;
      const me = this.me;
      this.refreshStats();
      if (!me.down) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.3);
      if (up) {
        sfx('level');
        this.pix.vfx('level', { x: me.x, y: me.y });
        this.rings.push({ x: me.x, y: me.y, r0: 10, r1: 80, t: 0, dur: 0.8, col: '#ffd27a', w: 4 });
        this.ui.toast(`レベル ${lvl} に上がった！ 最大HPと攻撃力が上昇`, '#ffd27a');
      }
    }
  }

  // ================= スキル =================
  useSkill(slot) {
    const me = this.me;
    const id = me.slots[slot];
    if (!id) { this.ui.toast('Tab でスキルをセットしよう', '#c9c2b2'); return; }
    const lvl = skillLevels(me)[id];
    if (!lvl || me.cds[id] > 0 || me.down) return;
    const pw = skillPower(id, lvl, me.stats);
    const S0 = SKILLS[id];
    const d = { pid: me.id, id, lvl, x: me.x, y: me.y, aim: me.aim, tx: 0, ty: 0, s: { atk: me.stats.atk, heal: me.stats.heal, job: me.job }, xc: me.stats.crit, cd: me.stats.critDmg, vamp: me.stats.vamp };
    if (S0.aim === 'enemy') {
      // 近い敵を自動で狙う。いなければマウスの方向へ
      const tgt = this.nearestEnemy(me.x, me.y, 420);
      if (id === 'shadowstep' && !tgt) { this.ui.toast('近くに敵がいません', '#c9c2b2'); return; }
      if (tgt) { d.aim = Math.atan2(tgt.y - me.y, tgt.x - me.x); d.tx = tgt.x; d.ty = tgt.y; }
      else { const L = Math.min(260, dist(me.x, me.y, this.mouseWorld.x, this.mouseWorld.y)); d.tx = me.x + Math.cos(me.aim) * L; d.ty = me.y + Math.sin(me.aim) * L; }
      this.lockAim(d.aim, 0.35);
      me.faceHold = 0.4;
      if (id === 'shadowstep') {
        // 敵の背後へ
        const bx = tgt.x + Math.cos(d.aim) * (tgt.r + 18), by = tgt.y + Math.sin(d.aim) * (tgt.r + 18);
        if (!hitsWall(this.map, bx, by, me.r)) { me.x = bx; me.y = by; }
        else { me.x = tgt.x - Math.cos(d.aim) * (tgt.r + 18); me.y = tgt.y - Math.sin(d.aim) * (tgt.r + 18); }
        me.inv = Math.max(me.inv, 0.3);
      }
    }
    me.cds[id] = pw.cd;
    me.skillSeq++;
    me.skillAnim = { id, t: 0 };
    if (id === 'bash') { me.vx += Math.cos(d.aim) * 560; me.vy += Math.sin(d.aim) * 560; me.faceHold = 0.5; }
    if (id === 'dash') { me.dashT = 0.19; me.dvx = Math.cos(d.aim); me.dvy = Math.sin(d.aim); me.inv = Math.max(me.inv, 0.3); }
    if (id !== 'whirl' && !JOBS[me.job].noAttack) { me.atkT = 0; me.atkDur = 0.35; }
    if (this.isHost) this.doSkill(d); else this.net.send({ t: 'skill', ...d });
  }

  doSkill(d) {
    const pw = skillPower(d.id, d.lvl, d.s || {});
    const src = { pid: d.pid, w: { crit: 0.08 + (d.xc || 0), affixes: [], rarity: 0 }, critDmg: d.cd || 0, vamp: d.vamp || 0, knock: 160, x: d.x, y: d.y };
    const ca = Math.cos(d.aim), sa = Math.sin(d.aim);
    const tx = d.tx || d.x + ca * 120, ty = d.ty || d.y + sa * 120;
    const left = ca < 0 ? 1 : 0;
    const X = Math.round(d.x), Y = Math.round(d.y), TX = Math.round(tx), TY = Math.round(ty);
    const near = (x, y, r) => this.enemies.filter((e) => dist(e.x, e.y, x, y) < r + e.r);
    const blast = (x, y, r, dmg, opt = {}) => { for (const e of near(x, y, r)) this.damageEnemy(e, dmg, src, Math.atan2(e.y - y, e.x - x), { knock: 200, ...opt }); };
    const allies = (x, y, r) => [this.me, this.ally].filter((p) => p && !p.down && dist(p.x, p.y, x, y) < r);
    const later = (t, fn) => this.delayed.push({ t, fn });
    const pfx = (n, x, y, o = {}) => this.fx('pfx', { n, x: Math.round(x), y: Math.round(y), ...o });
    const proj = (kind, sp, life, r, dmg, o = {}) => this.projs.push({ id: this.nextId++, kind, x: d.x + ca * 16, y: d.y + sa * 16, vx: ca * sp, vy: sa * sp, owner: d.pid, dmg, src, life, r, ...o });
    switch (d.id) {
      case 'fireball':
        proj('fireball', 470, 1.5, 11, pw.dmg);
        this.fx('snd', { n: 'fire', x: X, y: Y });
        break;
      case 'whirl':
        this.fx('whirl', { x: X, y: Y });
        blast(d.x, d.y, 96, pw.dmg, { knock: 340 });
        break;
      case 'dash': {
        const ex = d.x + ca * 218, ey = d.y + sa * 218;
        this.fx('dash', { x: X, y: Y, x2: Math.round(ex), y2: Math.round(ey), j: this.jobOf(d.pid) });
        for (const e of [...this.enemies]) {
          const t = clamp(((e.x - d.x) * ca + (e.y - d.y) * sa) / 218, 0, 1);
          if (dist(e.x, e.y, d.x + ca * 218 * t, d.y + sa * 218 * t) < e.r + 24) this.damageEnemy(e, pw.dmg, src, d.aim + Math.PI / 2, { knock: 200 });
        }
        break;
      }
      case 'heal':
        this.fx('heal', { x: X, y: Y });
        for (const p of allies(d.x, d.y, 230)) this.healPlayer(p.id, pw.heal);
        break;
      case 'nova':
        this.fx('nova', { x: X, y: Y });
        blast(d.x, d.y, 135, pw.dmg, { knock: 120, slow: 3 });
        this.addZone({ x: d.x, y: d.y, r: 125, dur: pw.dur, dps: pw.dot, slow: 1.5, src, vis: 'ice' });
        break;
      case 'chain': {
        let cur = { x: d.x, y: d.y - 18 };
        const hit = new Set();
        const pts = [[Math.round(d.x + ca * 12), Math.round(d.y - 22 + sa * 12)]];
        let tgt = this.nearestEnemy(d.x, d.y, 420);
        for (let j = 0; tgt && j <= pw.jumps; j++) {
          hit.add(tgt);
          pts.push([Math.round(tgt.x), Math.round(tgt.y - 16)]);
          this.damageEnemy(tgt, pw.dmg, src, Math.atan2(tgt.y - cur.y, tgt.x - cur.x), { knock: 60 });
          cur = tgt;
          let nb = null, nd = 210;
          for (const e of this.enemies) if (!hit.has(e)) { const dd = dist(e.x, e.y, cur.x, cur.y); if (dd < nd) { nd = dd; nb = e; } }
          tgt = nb;
        }
        if (pts.length === 1) pts.push([Math.round(d.x + ca * 140), Math.round(d.y - 18 + sa * 140)]);
        this.fx('chain', { pts });
        break;
      }
      case 'ward':
        pfx('sunburst', d.x, d.y - 18, { p: 'green' });
        this.fx('snd', { n: 'ward', x: X, y: Y });
        for (const p of allies(d.x, d.y, 250)) {
          if (p === this.me) this.wardLocal(pw.shield, pw.dur); else this.net.send({ t: 'ward', a: pw.shield, t2: 0, d: pw.dur });
        }
        break;
      case 'bash':
        this.fx('bash', { x: X, y: Y, a: +d.aim.toFixed(2), p: d.pid });
        later(0.2, () => {
          this.fx('snd', { n: 'slam', x: X, y: Y });
          this.fx('shake', { a: 9 });
          const ox = d.x + ca * 34, oy = d.y + sa * 34;
          for (const e of near(ox, oy, 118)) if (Math.abs(angDiff(d.aim, Math.atan2(e.y - d.y, e.x - d.x))) < 1.3) { this.damageEnemy(e, pw.dmg, src, d.aim, { knock: 520 }); e.stun = pw.stun; }
        });
        break;
      case 'warcry': case 'bless': case 'focus': {
        pfx('sunburst', d.x, d.y - 18, { p: d.id === 'warcry' ? 'fire' : 'gold' });
        this.fx('snd', { n: 'level', x: X, y: Y });
        const b = {};
        if (pw.atk) b.atk = pw.atk / 100;
        if (pw.def) b.def = pw.def / 100;
        if (pw.crit) b.crit = pw.crit / 100;
        for (const p of allies(d.x, d.y, 260)) { this.buffPlayer(p.id, b, pw.dur); if (pw.heal) this.healPlayer(p.id, pw.heal); }
        break;
      }
      case 'roar':
        pfx('sunburst', d.x, d.y - 18, { p: 'fire' });
        this.fx('snd', { n: 'slam', x: X, y: Y });
        this.buffPlayer(d.pid, { atk: pw.atk / 100, haste: pw.haste / 100 }, pw.dur);
        break;
      case 'quake':
        pfx('earthSpike', tx, ty);
        this.fx('rock', { x: TX, y: TY });
        later(0.3, () => blast(tx, ty, 95, pw.dmg, { knock: 300 }));
        break;
      case 'pierce':
        proj('arrow', 900, 0.6, 9, pw.dmg, { pierce: new Set(), rar: 4 });
        this.fx('snd', { n: 'bow', x: X, y: Y });
        break;
      case 'thorns':
        pfx('rootSnare', tx, ty);
        this.addZone({ x: tx, y: ty, r: 80, dur: pw.dur, dps: pw.dot, slow: 1, src, vis: 'thorn' });
        break;
      case 'rain':
        pfx('starFall', tx, ty, { p: 'gold' });
        this.addZone({ x: tx, y: ty, r: 95, dur: pw.dur, dps: pw.dot, src, vis: 'none' });
        break;
      case 'snare': {
        const hit = near(d.x, d.y, 125).slice(0, 8);
        for (const e of hit) { pfx('rootSnare', e.x, e.y); this.damageEnemy(e, pw.dmg, src, null, { knock: 0 }); e.stun = pw.stun; }
        if (!hit.length) pfx('rootSnare', d.x, d.y);
        break;
      }
      case 'pillar':
        pfx('flamePillar', tx, ty);
        later(0.25, () => blast(tx, ty, 72, pw.dmg, { knock: 180, burn: true }));
        break;
      case 'meteor':
        pfx('meteor', tx, ty);
        later(0.62, () => { blast(tx, ty, 135, pw.dmg, { knock: 320, burn: true }); this.fx('shake', { a: 12 }); this.fx('snd', { n: 'boom', x: TX, y: TY }); });
        break;
      case 'lance':
        proj('lance', 560, 1.1, 10, pw.dmg, { slow: 2.5 });
        this.fx('snd', { n: 'freeze', x: X, y: Y });
        break;
      case 'strike':
        pfx('lightningStrike', tx, ty);
        later(0.76, () => { blast(tx, ty, 52, pw.dmg, { knock: 120 }); this.fx('snd', { n: 'zap', x: TX, y: TY }); this.fx('shake', { a: 6 }); });
        break;
      case 'bloom':
        pfx('healingBloom', d.x, d.y);
        this.fx('snd', { n: 'heal', x: X, y: Y });
        this.addZone({ x: d.x, y: d.y, r: 120, dur: pw.dur, hps: pw.hot, src, vis: 'bloom' });
        break;
      case 'miracle':
        this.fx('snd', { n: 'heal', x: X, y: Y });
        for (const p of [this.me, this.ally]) {
          if (!p) continue;
          pfx('resurrection', p.x, p.y);
          if (p.down) { if (p === this.me) this.reviveLocal(); else this.net.send({ t: 'rev' }); }
          this.healPlayer(p.id, pw.heal);
        }
        break;
      case 'smite':
        pfx('smite', tx, ty);
        later(0.54, () => { blast(tx, ty, 48, pw.dmg, { knock: 150 }); this.healPlayer(d.pid, pw.heal); });
        break;
      case 'hpillar':
        pfx('holyPillar', tx, ty);
        later(0.66, () => {
          blast(tx, ty, 95, pw.dmg, { knock: 160 });
          for (const p of allies(tx, ty, 110)) this.healPlayer(p.id, pw.heal);
        });
        break;
      case 'flurry':
        pfx('daggerFlurry', d.x, d.y, { f: left });
        for (let i = 0; i < pw.hits; i++) later(0.08 + i * 0.1, () => {
          const e = this.nearestEnemy(d.x, d.y, 130);
          if (e) this.damageEnemy(e, pw.dmg, src, d.aim, { knock: 40 });
        });
        break;
      case 'shadowstep':
        this.fx('dash', { x: X, y: Y, x2: X, y2: Y, j: this.jobOf(d.pid), blink: 1 });
        blast(d.x, d.y, 50, pw.dmg, { knock: 240 });
        break;
      case 'poison':
        pfx('poisonCloud', tx, ty, { life: pw.dur });
        this.addZone({ x: tx, y: ty, r: 105, dur: pw.dur, dps: pw.dot, src, vis: 'none' });
        break;
      case 'curse':
        pfx('curse', tx, ty);
        for (const e of near(tx, ty, 85)) { e.mark = pw.dur; e.markAmp = pw.amp / 100; }
        break;
      case 'drain': {
        const e = this.nearestEnemy(d.x, d.y, 300);
        pfx('soulDrain', d.x, d.y, { life: 0.9, f: left });
        if (e) { this.damageEnemy(e, pw.dmg, src, d.aim, { knock: 60 }); this.healPlayer(d.pid, pw.heal); }
        break;
      }
      default: this.runCast(SKILLS[d.id].cast, d, pw, src, tx, ty); break;
    }
  }

  // 手順で書かれたスキル（エフェクトの組み合わせ）を実行する
  runCast(cast, d, pw, src, tx, ty) {
    const ca = Math.cos(d.aim), left = ca < 0 ? 1 : 0;
    const zoneOf = (s) => (s.zone === 'target' ? [tx, ty] : [d.x, d.y]);
    const hitAll = (list, x, y, opt) => {
      for (const e of list) {
        const low = opt.execute && e.hp < e.maxHp * 0.5 ? 2 : 1;
        if (opt.noDmg) { if (pw.stun) e.stun = pw.stun; continue; }
        this.damageEnemy(e, pw.dmg * low, src, Math.atan2(e.y - y, e.x - x), { knock: 200, ...opt });
        if (pw.stun) e.stun = pw.stun;
      }
    };
    const run = (s) => {
      const at = s.at === 'target' || s.aoe === 'target' ? [tx, ty] : [d.x, d.y];
      if (s.summon) this.spawnSummon(d.pid, s.summon, s.el, pw, s.count);
      else if (s.resetCd) { if (d.pid === this.me.id) { const c = this.me.cds[d.id]; this.me.cds = { [d.id]: c }; } else if (this.net) this.net.send({ t: 'resetcd' }); }
      else if (s.fx) {
        const o = { n: s.fx, x: Math.round(at[0] + (s.ox || 0)), y: Math.round(at[1] + (s.dy || 0)) };
        if (s.p) o.p = s.p;
        if (s.f) o.f = left;
        if (s.ground) o.ground = 1;
        if (s.life) o.life = s.life === 'dur' ? pw.dur : s.life;
        this.fx('pfx', o);
      } else if (s.snd) this.fx('snd', { n: s.snd, x: Math.round(d.x), y: Math.round(d.y) });
      else if (s.shake) this.fx('shake', { a: s.shake });
      else if (s.aoe) hitAll(this.enemies.filter((e) => dist(e.x, e.y, at[0], at[1]) < s.r + e.r), at[0], at[1], s.opt || {});
      else if (s.cone) hitAll(this.enemies.filter((e) => dist(e.x, e.y, d.x, d.y) < s.r + e.r && Math.abs(angDiff(d.aim, Math.atan2(e.y - d.y, e.x - d.x))) < s.cone), d.x, d.y, s.opt || {});
      else if (s.zone) { const [x, y] = zoneOf(s); this.addZone({ x, y, r: s.r, dur: pw.dur, dps: pw.dot, hps: pw.hot, slow: s.slow, pull: s.pull, src, vis: s.vis || 'none' }); }
      else if (s.heal) { for (const p of [this.me, this.ally]) if (p && !p.down && dist(p.x, p.y, d.x, d.y) < s.heal) this.healPlayer(p.id, pw.heal); }
      else if (s.healSelf) this.healPlayer(d.pid, pw.heal);
      else if (s.shield) { for (const p of [this.me, this.ally]) if (p && !p.down && dist(p.x, p.y, d.x, d.y) < s.shield) { if (p === this.me) this.wardLocal(pw.shield, pw.dur); else this.net.send({ t: 'ward', a: pw.shield, d: pw.dur }); } }
      else if (s.buff) {
        const b = {};
        for (const [k, v] of Object.entries(s.buff)) b[k] = pw[v] / 100;
        if (s.self) this.buffPlayer(d.pid, b, pw.dur);
        else for (const p of [this.me, this.ally]) if (p && !p.down && dist(p.x, p.y, d.x, d.y) < s.r) this.buffPlayer(p.id, b, pw.dur);
      } else if (s.multi) {
        for (let i = 0; i < pw.hits; i++) this.delayed.push({ t: 0.1 + i * s.multi, fn: () => { const e = this.nearestEnemy(tx, ty, s.r); if (e) hitAll([e], tx, ty, s.opt || {}); } });
      } else if (s.proj) {
        const q = s.proj, n = pw.n || 1;
        for (let i = 0; i < n; i++) {
          const a = d.aim + (q.fan ? (i - (n - 1) / 2) * q.fan : 0);
          this.projs.push({ id: this.nextId++, kind: q.kind, x: d.x + Math.cos(a) * 16, y: d.y + Math.sin(a) * 16, vx: Math.cos(a) * q.sp, vy: Math.sin(a) * q.sp, owner: d.pid, dmg: pw.dmg, src, life: q.life, r: q.r, rar: q.rar, pierce: q.pierce ? new Set() : undefined });
        }
      }
    };
    for (const s of cast) {
      if (s.delay) this.delayed.push({ t: s.delay, fn: () => run(s) });
      else run(s);
    }
  }

  jobOf(pid) { const p = pid === this.me.id ? this.me : this.ally; return p ? p.job : 'knight'; }

  addZone(z) {
    this.zones.push({ ...z, t: 0, tick: 0 });
    if (z.vis && z.vis !== 'none') this.fx('zone', { x: Math.round(z.x), y: Math.round(z.y), r: z.r, dur: z.dur, k: z.vis });
  }

  updateZones(dt) {
    for (const z of this.zones) {
      z.t += dt; z.tick -= dt;
      if (z.pull) for (const e of this.enemies) {
        const dd = dist(e.x, e.y, z.x, z.y);
        if (dd < z.r && dd > 8 && !ENEMIES[e.type].boss) { e.kx += ((z.x - e.x) / dd) * z.pull * dt * 9; e.ky += ((z.y - e.y) / dd) * z.pull * dt * 9; }
      }
      if (z.tick > 0) continue;
      z.tick = 0.5;
      if (z.dps) for (const e of [...this.enemies]) {
        if (dist(e.x, e.y, z.x, z.y) >= z.r + e.r * 0.5) continue;
        this.damageEnemy(e, z.dps * 0.5, z.src, null, { knock: 0, noCrit: true });
        if (z.slow) e.slow = Math.max(e.slow, z.slow);
      }
      if (z.edps) for (const p of [this.me, this.ally]) if (p && !p.down && dist(p.x, p.y, z.x, z.y) < z.r + p.r * 0.5) this.hurtPlayer(p, z.edps, p.x - 1, p.y);
      if (z.hps) for (const p of [this.me, this.ally]) if (p && !p.down && dist(p.x, p.y, z.x, z.y) < z.r) this.healPlayer(p.id, Math.ceil(z.hps * 0.5), true);
    }
    this.zones = this.zones.filter((z) => z.t < z.dur);
    for (const f of this.delayed) { f.t -= dt; if (f.t <= 0) f.fn(); }
    this.delayed = this.delayed.filter((f) => f.t > 0);
  }

  buffPlayer(pid, s, t) {
    if (pid === this.me.id) this.buffLocal(s, t);
    else if (this.net) this.net.send({ t: 'buff', s, dur: t });
  }
  buffLocal(s, t) {
    this.me.buffs.push({ s, t });
    this.refreshStats();
  }

  // ---------------- スキルポイント ----------------
  giveSP(n) { if (n > 0) this.fx('sp', { n }); }

  // ---------------- なぞなぞ・台座 ----------------
  puzzleAnswer(pid, id, ok) {
    const p = this.map.puzzles[id];
    if (!p || p.done) return;
    p.ans = p.ans || {};
    p.ans[pid] = ok ? 1 : 0;
    const ids = [this.me.id, ...(this.ally ? [this.ally.id] : [])];
    if (ids.every((i) => p.ans[i] != null)) this.finishPuzzle(p, ids.every((i) => p.ans[i]));
    else this.fx('pzw', { id, p: pid });
  }

  checkPuzzles(dt) {
    const ps = [this.me, this.ally].filter((p) => p && !p.down);
    for (const p of this.map.puzzles) {
      if (p.kind !== 'plates' || p.done) continue;
      const on = p.plates.map((q) => ps.filter((pl) => dist(pl.x, pl.y, q.x, q.y) < 26).length);
      let lit;
      if (this.ally) {
        // 二人で：2 つの台座に同時に乗る
        lit = [on[0] > 0 ? 0 : -1, on[1] > 0 ? 1 : -1].filter((i) => i >= 0);
        p.hold = on[0] > 0 && on[1] > 0 ? p.hold + dt : 0;
        if (p.hold > 1.5) { this.finishPuzzle(p, true); continue; }
      } else {
        // 一人で：光った順番に踏む
        const cur = on.findIndex((n) => n > 0);
        if (cur >= 0 && cur !== p.last) {
          if (cur === p.seq[p.step]) { p.step++; this.fx('snd', { n: 'pick', x: Math.round(p.x), y: Math.round(p.y) }); }
          else if (p.step > 0 || p.seq[0] !== cur) { p.step = 0; this.fx('snd', { n: 'hurt', x: Math.round(p.x), y: Math.round(p.y) }); }
          if (p.step >= 3) { this.finishPuzzle(p, true); continue; }
        }
        p.last = cur;
        lit = p.seq.slice(0, p.step);
      }
      const key = lit.join() + '|' + Math.round(p.hold * 2);
      if (key !== p.key) { p.key = key; this.fx('pzs', { id: p.id, lit, step: p.step, hold: +p.hold.toFixed(1) }); }
    }
  }

  finishPuzzle(p, ok) {
    this.fx('pzdone', { id: p.id, ok: ok ? 1 : 0 });
    if (!ok) return;
    const D = this.diff;
    if (Math.random() < 0.45 * D.sp) this.giveSP(1);
    // 報酬：二人が同じものを貰えることもあれば、別々のこともある
    const roll = () => {
      const r = Math.random();
      if (r < 0.5) return rollGear(this.floor, 0.15 + D.loot, Math.random() < 0.5 ? setOfFloor(this.floor) : undefined, D.minChest);
      return rollLoot(this.floor, 0.18 + D.loot, D, D.minChest);
    };
    const same = Math.random() < 0.3 ? roll() : null;
    this.receiveItem(same ? { ...same } : roll());
    if (this.ally) this.net.send({ t: 'give', item: same ? { ...same, id: same.id + 'b' } : roll() });
  }

  healPlayer(pid, amt, quiet) {
    if (pid === this.me.id) this.healLocal(amt, quiet);
    else if (this.net) this.net.send({ t: 'heal', a: amt, q: quiet ? 1 : 0 });
  }
  healLocal(a, quiet) {
    const me = this.me;
    if (me.down) return;
    const before = me.hp;
    me.hp = Math.min(me.maxHp, me.hp + a);
    const got = Math.round(me.hp - before);
    if (got > 0 && !quiet) this.texts.push({ x: me.x, y: me.y - 56, s: `+${got}`, c: '#8fef8a', t: 0, dur: 1, size: 15, vy: -30 });
  }
  wardLocal(a, t = 8) {
    this.me.shield = a; this.me.shieldT = t;
  }

  // ================= 被ダメージ =================
  hurtPlayer(p, dmg, sx, sy) {
    if (!p || p.down) return;
    if (p === this.me) this.hurtLocal(dmg, sx, sy);
    else if (this.net) this.net.send({ t: 'hurt', d: dmg, x: Math.round(sx), y: Math.round(sy) });
  }

  hurtLocal(dmg, sx, sy) {
    const me = this.me;
    if (me.down || me.inv > 0 || me.dodgeT > 0 || me.dashT > 0) return;
    let d = dmg * (1 - me.stats.def);
    if (me.shield > 0) {
      const a = Math.min(me.shield, d);
      me.shield -= a; d -= a;
      // シールドの耐久を超えたら砕ける
      if (me.shield <= 0) {
        me.shieldT = 0;
        this.pix.vfx('shieldBreak', { x: me.x, y: me.y });
        sfx('freeze');
        this.shake = Math.max(this.shake, 9);
        for (let i = 0; i < 18; i++) { const an = rand(TAU), sp = rand(80, 260); this.part({ x: me.x, y: me.y - 16, z: 12, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.7, vz: rand(40, 200), g: 500, life: rand(0.4, 0.8), size: rand(2, 4), col: pick(['#d8ffd8', '#9fe6a0', '#6ac078', '#ffffff']), kind: 'shard', bounce: true }); }
        this.texts.push({ x: me.x, y: me.y - 66, s: 'シールド崩壊！', c: '#9fe6a0', t: 0, dur: 1, size: 13, vy: -28 });
      }
    }
    me.hp -= d;
    me.flash = 0.15; me.inv = 0.5;
    const an = Math.atan2(me.y - sy, me.x - sx);
    me.vx += Math.cos(an) * 220; me.vy += Math.sin(an) * 220;
    this.shake = Math.max(this.shake, 7);
    sfx('hurt');
    this.pix.vfx(d > 0 ? 'hurt' : 'block', { x: me.x, y: me.y, left: Math.cos(me.aim) < 0 });
    this.ui.hurtFlash();
    this.texts.push({ x: me.x + rand(-6, 6), y: me.y - 52, s: d > 0 ? `-${Math.round(d)}` : 'ガード', c: d > 0 ? '#ff5a5a' : '#9fe6a0', t: 0, dur: 0.9, size: 16, vy: -40 });
    for (let i = 0; i < 6; i++) this.part({ x: me.x, y: me.y - 18, vx: rand(-80, 80), vy: rand(-80, 40), life: 0.4, size: 2, col: '#ff6a5a', kind: 'spark', glow: true });
    if (me.hp <= 0) {
      me.hp = 0; me.down = true; me.revive = 0;
      sfx('kill');
      this.ui.toast(this.ally ? '倒れた！ 相方が近くに来ると復活できる' : '倒れてしまった…', '#ff8a6a');
    }
  }

  reviveLocal() {
    const me = this.me;
    if (!me.down) return;
    me.down = false; me.hp = Math.round(me.maxHp * 0.45); me.inv = 1.5;
    this.pix.vfx('revive', { x: me.x, y: me.y });
    sfx('heal');
    this.rings.push({ x: me.x, y: me.y, r0: 10, r1: 70, t: 0, dur: 0.7, col: '#9fe6a0', w: 4 });
    this.ui.toast('復活した！', '#9fe6a0');
  }

  checkWipe(dt) {
    const ps = [this.me, this.ally].filter(Boolean);
    if (ps.every((p) => p.down)) {
      this.wipeT += dt;
      if (this.wipeT > 2.6) this.loadFloor(this.floor, (Math.random() * 1e9) | 0, true, this.dimIdx);
    } else this.wipeT = 0;
  }

  // ================= 敵 AI（ホストのみ） =================
  bfs(px, py) {
    const m = this.map, W = m.W, H = m.H;
    const d = new Int16Array(W * H).fill(-1);
    const sx = (px / T) | 0, sy = (py / T) | 0;
    const q = new Int32Array(W * H);
    let h = 0, t = 0;
    const s = sy * W + sx;
    if (s < 0 || s >= d.length) return d;
    d[s] = 0; q[t++] = s;
    while (h < t) {
      const i = q[h++], x = i % W, nd = d[i] + 1;
      if (x > 0 && m.g[i - 1] && d[i - 1] < 0) { d[i - 1] = nd; q[t++] = i - 1; }
      if (x < W - 1 && m.g[i + 1] && d[i + 1] < 0) { d[i + 1] = nd; q[t++] = i + 1; }
      if (i >= W && m.g[i - W] && d[i - W] < 0) { d[i - W] = nd; q[t++] = i - W; }
      if (i < W * (H - 1) && m.g[i + W] && d[i + W] < 0) { d[i + W] = nd; q[t++] = i + W; }
    }
    return d;
  }

  flowDir(e, f) {
    if (!f) return null;
    const m = this.map, W = m.W;
    const tx = (e.x / T) | 0, ty = (e.y / T) | 0;
    let best = f[ty * W + tx];
    if (best < 0) return null;
    let bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const v = f[(ty + dy) * W + tx + dx];
      if (v < 0 || v >= best) continue;
      if (dx && dy && (isSolid(m, tx + dx, ty) || isSolid(m, tx, ty + dy))) continue;
      best = v; bx = dx; by = dy;
    }
    if (!bx && !by) return null;
    const cx = (tx + bx) * T + T / 2 - e.x, cy = (ty + by) * T + T / 2 - e.y;
    const l = Math.hypot(cx, cy) || 1;
    return [cx / l, cy / l];
  }

  setState(e, s, dur) { e.state = s; e.st = 0; e.stDur = dur; if (s === 'atk') e.hit.clear(); }

  updateEnemy(e, dt) {
    const def = ENEMIES[e.type];
    const m = this.map;
    if (e.flash > 0) e.flash -= dt;
    if (e.slow > 0) e.slow -= dt;
    if (e.mark > 0) e.mark -= dt;
    if (e.stun > 0) {
      e.stun -= dt;
      const kd = Math.exp(-dt * 9);
      e.kx *= kd; e.ky *= kd;
      e.moving = false;
      moveCircle(m, e, e.kx * dt, e.ky * dt);
      if (e.state === 'wind' || e.state === 'atk') this.setState(e, 'rec', 0.2);
      return;
    }
    if (e.burn > 0) {
      e.burn -= dt; e.burnTick -= dt;
      if (e.burnTick <= 0) {
        e.burnTick = 0.5;
        e.hp -= e.burnDmg;
        this.fx('burn', { x: Math.round(e.x), y: Math.round(e.y - 20), d: e.burnDmg });
        if (e.hp <= 0) { this.killEnemy(e, -1); return; }
      }
    }
    const spdMul = (e.slow > 0 ? 0.45 : 1) * (e.enraged ? 1.3 : 1);
    const players = [this.me, this.ally].filter((p) => p && !p.down);
    let tgt = null, td = 1e9;
    for (const p of players) { const d = dist(e.x, e.y, p.x, p.y); if (d < td) { td = d; tgt = p; } }
    e.st += dt;
    e.cd -= dt;
    let dx = 0, dy = 0, spd = e.spd * spdMul;
    const face = (rate) => { if (tgt) e.aim += angDiff(e.aim, Math.atan2(tgt.y - e.y, tgt.x - e.x)) * Math.min(1, dt * rate); };

    if (!tgt) { e.state = e.state === 'idle' ? 'idle' : 'chase'; }
    if (e.state === 'idle') {
      e.losT -= dt;
      if (tgt && e.losT <= 0) {
        e.losT = 0.3;
        if ((td < 360 && lineOfSight(m, e.x, e.y, tgt.x, tgt.y)) || td < 110) { e.state = 'chase'; this.fx('exclaim', { x: Math.round(e.x), y: Math.round(e.y - (def.boss ? 90 : e.type === 'bat' ? 40 : 10)) }); if (e.type === 'bat') this.fx('snd', { n: 'shriek', x: e.x, y: e.y }); }
      }
      e.wander += rand(-1, 1) * dt * 2;
      dx = Math.cos(e.wander) * 0.25; dy = Math.sin(e.wander) * 0.25;
    } else if (e.state === 'chase' && tgt) {
      face(8);
      // 番人は体力が半分を切ると激昂して手下を呼ぶ
      if (def.boss && !e.enraged && e.hp < e.maxHp * 0.5) {
        e.enraged = true;
        this.fx('txt', { x: Math.round(e.x), y: Math.round(e.y - 110), s: `${def.name}が怒り狂う！`, c: '#ff6a4a' });
        for (let i = 0; i < 2 + this.floor / 3; i++) { const s = this.mkEnemy(def.summon, e.x + rand(-90, 90), e.y + rand(-60, 60), false); s.state = 'chase'; this.enemies.push(s); this.fx('summon', { x: Math.round(s.x), y: Math.round(s.y) }); }
      }
      const los = td < 300 && lineOfSight(m, e.x, e.y, tgt.x, tgt.y);
      let dir = null;
      if (los || def.fly) dir = [(tgt.x - e.x) / td, (tgt.y - e.y) / td];
      else dir = this.flowDir(e, this.fields[tgt.id === this.me.id ? 0 : 1]) || [(tgt.x - e.x) / td, (tgt.y - e.y) / td];
      [dx, dy] = dir;
      switch (e.type) {
        case 'slime': case 'slimeL':
          if (td < 115 && los && e.cd <= 0) this.setState(e, 'wind', e.type === 'slimeL' ? 0.7 : 0.55);
          break;
        case 'bat': {
          const w = Math.sin(this.time * 3 + e.seed * 10) * 0.8;
          dx += -dir[1] * w; dy += dir[0] * w;
          if (td < 160 && los && e.cd <= 0) this.setState(e, 'wind', 0.38);
          break;
        }
        case 'skel':
          if (td < 64 && e.cd <= 0) this.setState(e, 'wind', e.elite ? 0.5 : 0.62);
          break;
        case 'mage':
          if (los) {
            if (td < 170) { dx = -dir[0]; dy = -dir[1]; }
            else if (td < 290) { const s = e.seed > 0.5 ? 1 : -1; dx = -dir[1] * s * 0.7; dy = dir[0] * s * 0.7; }
            if (e.cd <= 0 && td < 430) { this.setState(e, 'wind', 0.8); this.fx('charge', { x: Math.round(e.x + 14), y: Math.round(e.y - 22) }); }
          }
          break;
        case 'hound': {
          const w = Math.sin(this.time * 2 + e.seed * 10) * 0.35;
          dx += -dir[1] * w; dy += dir[0] * w;
          if (td < 165 && los && e.cd <= 0) this.setState(e, 'wind', 0.42);
          break;
        }
        case 'wisp': {
          const w = Math.sin(this.time * 5 + e.seed * 10) * 0.6;
          dx += -dir[1] * w; dy += dir[0] * w;
          if (td < 72) this.setState(e, 'wind', 0.6);
          break;
        }
        case 'thorn':
          if (los && td < 280) dx = dy = 0;
          if (los && td < 420 && e.cd <= 0) this.setState(e, 'wind', 0.7);
          break;
        case 'toad':
          if (los && td < 200) { dx = -dir[0] * 0.5; dy = -dir[1] * 0.5; }
          if (los && td < 390 && e.cd <= 0) this.setState(e, 'wind', 0.8);
          break;
        case 'beetle':
          if (td < 300 && los && e.cd <= 0) this.setState(e, 'wind', 0.85);
          break;
        case 'shade':
          if (td < 150 && e.cd > 0.5) { dx = -dir[0]; dy = -dir[1]; }
          if (td < 340 && los && e.cd <= 0) {
            const a = Math.atan2(tgt.y - e.y, tgt.x - e.x), bx = tgt.x + Math.cos(a) * 46, by = tgt.y + Math.sin(a) * 46;
            if (!isSolid(m, Math.floor(bx / T), Math.floor(by / T))) { this.fx('summon', { x: Math.round(e.x), y: Math.round(e.y) }); e.x = bx; e.y = by; e.aim = a + Math.PI; this.fx('summon', { x: Math.round(bx), y: Math.round(by) }); }
            this.setState(e, 'wind', 0.45);
          }
          break;
        case 'golem':
          if (e.cd <= 0) {
            if (td < 150) { e.atk = 'slam'; this.setState(e, 'wind', e.enraged ? 0.8 : 1.05); }
            else if (los || td < 420) { e.atk = 'throw'; this.setState(e, 'wind', 0.8); }
          }
          break;
        case 'spider':
          if (e.cd <= 0) {
            if (td < 300) { e.atk = 'leap'; e.lx = tgt.x; e.ly = tgt.y; this.setState(e, 'wind', e.enraged ? 0.65 : 0.85); }
            else { e.atk = 'web'; this.setState(e, 'wind', 0.7); }
          }
          break;
        case 'bishop':
          if (td < 200) { dx = -dir[0]; dy = -dir[1]; }
          if (e.cd <= 0) {
            e.moves = (e.moves || 0) + 1;
            if (e.moves % 3 === 0) {
              const a = rand(TAU), bx = tgt.x + Math.cos(a) * 240, by = tgt.y + Math.sin(a) * 240;
              if (!isSolid(m, Math.floor(bx / T), Math.floor(by / T))) { this.fx('summon', { x: Math.round(e.x), y: Math.round(e.y) }); e.x = bx; e.y = by; this.fx('summon', { x: Math.round(bx), y: Math.round(by) }); }
              e.cd = 0.5;
            } else { e.atk = 'ring'; this.setState(e, 'wind', e.enraged ? 0.7 : 0.95); this.fx('charge', { x: Math.round(e.x), y: Math.round(e.y - 40) }); }
          }
          break;
        case 'behemoth':
          if (e.cd <= 0) {
            if (td < 165) { e.atk = 'slam'; this.setState(e, 'wind', e.enraged ? 0.75 : 1.0); }
            else if (los) { e.atk = 'charge'; this.setState(e, 'wind', e.enraged ? 0.8 : 1.05); }
          }
          break;
        case 'eye':
          if (e.cd <= 0) {
            e.moves = (e.moves || 0) + 1;
            e.atk = e.moves % 2 ? 'spiral' : 'gaze';
            this.setState(e, 'wind', e.atk === 'spiral' ? 0.8 : 0.6);
          }
          break;
      }
    } else if (e.state === 'wind') {
      if (e.st < e.stDur * 0.65) face(10);
      spd = 0;
      if (e.st >= e.stDur) this.enemyStrike(e, players);
    } else if (e.state === 'atk') {
      if (def.dash || e.atk === 'charge') {
        dx = Math.cos(e.aim); dy = Math.sin(e.aim); spd = def.dash || 640;
        for (const p of players) {
          if (!e.hit.has(p.id) && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 4) { e.hit.add(p.id); this.hurtPlayer(p, e.dmg, e.x, e.y); if (e.type === 'bat') this.fx('claw', { x: Math.round(p.x), y: Math.round(p.y), a: +e.aim.toFixed(2) }); }
        }
      } else if (e.atk === 'leap') {
        const d = dist(e.x, e.y, e.lx, e.ly), left = Math.max(0.05, e.stDur - e.st);
        if (d > 2) { dx = (e.lx - e.x) / d; dy = (e.ly - e.y) / d; }
        spd = Math.min(d / left, 900);
      } else if (e.atk === 'spiral') {
        spd = 0;
        e.spin = (e.spin || 0) + dt * 2.6; e.fireT = (e.fireT || 0) - dt;
        if (e.fireT <= 0) {
          e.fireT = 0.09;
          for (let i = 0, n = e.enraged ? 3 : 2; i < n; i++) this.shoot('evoid', e, e.spin + (i * TAU) / n, 190, e.dmg);
        }
      } else spd = 0;
      if (e.st >= e.stDur) {
        if (e.atk === 'leap') this.bossSlam(e, players, 125);
        this.setState(e, 'rec', def.boss ? 0.8 : 0.55);
      }
    } else if (e.state === 'rec') {
      spd *= 0.2;
      if (tgt) { dx = (tgt.x - e.x) / td; dy = (tgt.y - e.y) / td; }
      if (e.st >= e.stDur) e.state = 'chase';
    }

    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    const a = 1 - Math.exp(-dt * (e.state === 'atk' ? 30 : 8));
    e.vx += (dx * spd - e.vx) * a; e.vy += (dy * spd - e.vy) * a;
    const kd = Math.exp(-dt * 9);
    e.kx *= kd; e.ky *= kd;
    e.hitX = e.hitY = false;
    moveCircle(m, e, (e.vx + e.kx) * dt, (e.vy + e.ky) * dt);
    if (e.state === 'atk' && (e.hitX || e.hitY) && (def.dash || e.atk === 'charge')) {
      e.st = e.stDur;
      // 重い突進は壁にぶつかると目を回す
      if (e.type === 'beetle') e.stun = 0.9;
      if (e.atk === 'charge') { e.stun = 1.1; this.bossSlam(e, players, 150); this.rockRain(e, players, e.enraged ? 6 : 3); }
    }
    const sp = Math.hypot(e.vx, e.vy);
    e.moving = sp > 14;
    e.walk += sp * dt * 0.09;
  }

  shoot(kind, e, a, speed, dmg, r = 8) {
    this.projs.push({ id: this.nextId++, kind, x: e.x + Math.cos(a) * 14, y: e.y + Math.sin(a) * 14, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, owner: 'e', dmg, life: 3.2, r });
  }

  bossSlam(e, players, R) {
    this.fx('slam', { x: Math.round(e.x), y: Math.round(e.y) });
    for (const p of players) if (dist(e.x, e.y, p.x, p.y) < R + p.r) this.hurtPlayer(p, e.dmg, e.x, e.y);
  }

  rockRain(e, players, n) {
    for (const p of players) for (let i = 0; i < n; i++) {
      const tx = p.x + rand(-120, 120), ty = p.y + rand(-90, 90), dur = rand(0.8, 1.2);
      this.projs.push({ id: this.nextId++, kind: 'rock', x: tx, y: ty - 300, sx: tx, sy: ty - 300, tx, ty, vx: 0, vy: 300 / dur, t: 0, dur, owner: 'e', dmg: Math.round(e.dmg * 0.6), life: dur + 0.1, r: 40, z: 0 });
    }
  }

  enemyStrike(e, players) {
    this.enemyAttack(e, players);
    e.cd *= this.diff.cd * (e.vcd || 1);
  }

  enemyAttack(e, players) {
    switch (e.type) {
      case 'hound':
        this.setState(e, 'atk', 0.3); e.cd = rand(1.0, 1.6);
        this.fx('snd', { n: 'swing', x: e.x, y: e.y });
        break;
      case 'beetle':
        this.setState(e, 'atk', 0.8); e.cd = rand(1.8, 2.6);
        this.fx('snd', { n: 'heavy', x: e.x, y: e.y });
        break;
      case 'wisp':
        this.fx('boom', { x: Math.round(e.x), y: Math.round(e.y) });
        for (const p of players) if (dist(e.x, e.y, p.x, p.y) < 86 + p.r) this.hurtPlayer(p, e.dmg, e.x, e.y);
        e.noLoot = true; e.hp = 0;
        this.killEnemy(e, -1);
        break;
      case 'thorn': {
        this.setState(e, 'rec', 0.4); e.cd = rand(1.5, 2.2);
        this.fx('snd', { n: 'cast', x: e.x, y: e.y });
        const n = e.elite ? 3 : 1;
        for (let i = 0; i < n; i++) this.shoot('ethorn', e, e.aim + (i - (n - 1) / 2) * 0.2, 300, e.dmg, 7);
        break;
      }
      case 'toad': {
        this.setState(e, 'rec', 0.5); e.cd = rand(2.2, 3);
        this.fx('snd', { n: 'squish', x: e.x, y: e.y });
        const tg = players.reduce((a, p) => (!a || dist(e.x, e.y, p.x, p.y) < dist(e.x, e.y, a.x, a.y) ? p : a), null);
        if (tg) {
          const tx = tg.x + tg.vx * 0.4, ty = tg.y + tg.vy * 0.4, dur = 0.9;
          this.projs.push({ id: this.nextId++, kind: 'acid', x: e.x, y: e.y - 10, sx: e.x, sy: e.y - 10, tx, ty, vx: (tx - e.x) / dur, vy: (ty - e.y) / dur, t: 0, dur, owner: 'e', dmg: e.dmg, life: dur + 0.1, r: 42, z: 0 });
        }
        break;
      }
      case 'shade':
        this.setState(e, 'atk', 0.26); e.cd = rand(2.2, 3.2);
        this.fx('snd', { n: 'swing', x: e.x, y: e.y });
        this.fx('eslash', { x: Math.round(e.x), y: Math.round(e.y), a: +e.aim.toFixed(2) });
        for (const p of players) {
          const d = dist(e.x, e.y, p.x, p.y);
          if (d < 72 + p.r && Math.abs(angDiff(e.aim, Math.atan2(p.y - e.y, p.x - e.x))) < 0.9) this.hurtPlayer(p, e.dmg, e.x, e.y);
        }
        break;
      case 'spider':
        if (e.atk === 'leap') {
          this.setState(e, 'atk', 0.42); e.cd = e.enraged ? 1.0 : 1.5;
          this.fx('snd', { n: 'heavy', x: e.x, y: e.y });
        } else {
          this.setState(e, 'rec', 0.5); e.cd = e.enraged ? 1.0 : 1.5;
          this.fx('snd', { n: 'cast', x: e.x, y: e.y });
          const n = e.enraged ? 13 : 9;
          for (let i = 0; i < n; i++) this.shoot('ethorn', e, e.aim + (i - (n - 1) / 2) * 0.17, 250, Math.round(e.dmg * 0.7));
        }
        break;
      case 'bishop': {
        this.setState(e, 'rec', 0.5); e.cd = e.enraged ? 1.1 : 1.6;
        this.fx('snd', { n: 'cast', x: e.x, y: e.y });
        const ring = (off) => { for (let i = 0; i < 18; i++) this.shoot('eorb', e, off + (i * TAU) / 18, 180, Math.round(e.dmg * 0.8)); };
        ring(rand(TAU));
        if (e.enraged) this.delayed.push({ t: 0.4, fn: () => { if (this.enemies.includes(e)) ring(rand(TAU)); } });
        break;
      }
      case 'behemoth':
        if (e.atk === 'slam') {
          this.setState(e, 'atk', 0.45); e.cd = e.enraged ? 1.0 : 1.6;
          this.bossSlam(e, players, 150);
          this.rockRain(e, players, e.enraged ? 3 : 1);
        } else {
          this.setState(e, 'atk', 1.0); e.cd = e.enraged ? 1.0 : 1.6;
          this.fx('snd', { n: 'heavy', x: e.x, y: e.y });
        }
        break;
      case 'eye':
        if (e.atk === 'spiral') { this.setState(e, 'atk', 2.4); e.cd = e.enraged ? 0.9 : 1.4; e.spin = e.aim; this.fx('snd', { n: 'cast', x: e.x, y: e.y }); }
        else {
          this.setState(e, 'rec', 0.45); e.cd = e.enraged ? 0.9 : 1.3;
          this.fx('snd', { n: 'cast', x: e.x, y: e.y });
          for (let i = 0; i < 7; i++) this.shoot('evoid', e, e.aim + (i - 3) * 0.14, 300, e.dmg);
        }
        break;
      case 'slime': case 'slimeL':
        this.setState(e, 'atk', 0.34); e.cd = rand(1.0, 1.6);
        this.fx('snd', { n: 'squish', x: e.x, y: e.y });
        break;
      case 'bat':
        this.setState(e, 'atk', 0.4); e.cd = rand(0.9, 1.4);
        break;
      case 'skel':
        this.setState(e, 'atk', 0.28); e.cd = rand(0.8, 1.2);
        this.fx('snd', { n: 'swing', x: e.x, y: e.y });
        this.fx('eslash', { x: Math.round(e.x), y: Math.round(e.y), a: +e.aim.toFixed(2) });
        for (const p of players) {
          const d = dist(e.x, e.y, p.x, p.y);
          if (d < 72 + p.r && Math.abs(angDiff(e.aim, Math.atan2(p.y - e.y, p.x - e.x))) < 0.9) this.hurtPlayer(p, e.dmg, e.x, e.y);
        }
        break;
      case 'mage': {
        this.setState(e, 'rec', 0.5); e.cd = rand(2.0, 2.8);
        this.fx('snd', { n: 'cast', x: e.x, y: e.y });
        const n = e.elite ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = e.aim + (i - (n - 1) / 2) * 0.22;
          this.projs.push({ id: this.nextId++, kind: 'eorb', x: e.x + Math.cos(a) * 14, y: e.y + Math.sin(a) * 14, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, owner: 'e', dmg: e.dmg, life: 2.6, r: 8 });
        }
        break;
      }
      case 'golem':
        if (e.atk === 'slam') {
          this.setState(e, 'atk', 0.45); e.cd = e.enraged ? 1.0 : 1.6;
          this.fx('slam', { x: Math.round(e.x), y: Math.round(e.y) });
          for (const p of players) if (dist(e.x, e.y, p.x, p.y) < 140 + p.r) this.hurtPlayer(p, e.dmg, e.x, e.y);
        } else {
          this.setState(e, 'rec', 0.6); e.cd = e.enraged ? 1.1 : 1.7;
          this.fx('snd', { n: 'heavy', x: e.x, y: e.y });
          for (const p of players) {
            for (let i = 0; i < (e.enraged ? 2 : 1); i++) {
              const tx = p.x + p.vx * 0.5 + rand(-30, 30), ty = p.y + p.vy * 0.5 + rand(-30, 30);
              const dur = 1.0;
              this.projs.push({ id: this.nextId++, kind: 'rock', x: e.x, y: e.y - 10, sx: e.x, sy: e.y - 10, tx, ty, vx: (tx - e.x) / dur, vy: (ty - e.y) / dur, t: 0, dur, owner: 'e', dmg: Math.round(e.dmg * 0.7), life: dur + 0.1, r: 40, z: 0 });
            }
          }
        }
        break;
    }
  }

  separate() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), md = (a.r + b.r) * 0.9;
      if (d < md && d > 0.01) {
        const push = (md - d) / 2, nx = dx / d, ny = dy / d;
        const wa = ENEMIES[a.type].boss ? 0.1 : 1, wb = ENEMIES[b.type].boss ? 0.1 : 1;
        moveCircle(this.map, a, -nx * push * wa, -ny * push * wa);
        moveCircle(this.map, b, nx * push * wb, ny * push * wb);
      }
    }
  }

  updateProjs(dt) {
    const m = this.map;
    const keep = [];
    for (const p of this.projs) {
      p.life -= dt;
      if (p.kind === 'rock' || p.kind === 'acid') {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = lerp(p.sx, p.tx, k); p.y = lerp(p.sy, p.ty, k);
        p.z = Math.sin(k * Math.PI) * 90;
        if (k >= 1 && p.kind === 'acid') {
          this.addZone({ x: p.x, y: p.y, r: 62, dur: 2.4, edps: p.dmg, vis: 'acid' });
          continue;
        }
        if (k >= 1) {
          this.fx('rock', { x: Math.round(p.x), y: Math.round(p.y) });
          for (const pl of [this.me, this.ally]) if (pl && !pl.down && dist(pl.x, pl.y, p.x, p.y) < p.r + pl.r) this.hurtPlayer(pl, p.dmg, p.x, p.y);
          continue;
        }
        keep.push(p);
        continue;
      }
      if (p.kind === 'bolt') {
        let best = null, bd = 220;
        for (const e of this.enemies) {
          const d = dist(e.x, e.y, p.x, p.y);
          if (d < bd && Math.abs(angDiff(Math.atan2(p.vy, p.vx), Math.atan2(e.y - p.y, e.x - p.x))) < 1.1) { bd = d; best = e; }
        }
        if (best) {
          const sp = Math.hypot(p.vx, p.vy);
          const cur = Math.atan2(p.vy, p.vx);
          const na = cur + clamp(angDiff(cur, Math.atan2(best.y - p.y, best.x - p.x)), -dt * 5, dt * 5);
          p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      let dead = p.life <= 0 || isSolid(m, Math.floor(p.x / T), Math.floor(p.y / T));
      if (!dead && p.owner === 'e') {
        for (const pl of [this.me, this.ally]) {
          if (pl && !pl.down && dist(pl.x, pl.y, p.x, p.y) < p.r + pl.r) { this.hurtPlayer(pl, p.dmg, p.x, p.y); dead = true; break; }
        }
      } else if (!dead) {
        for (const e of this.enemies) {
          if (dist(e.x, e.y, p.x, p.y) < p.r + e.r) {
            if (p.pierce) {
              if (!p.pierce.has(e.id)) { p.pierce.add(e.id); this.damageEnemy(e, p.dmg, p.src, Math.atan2(p.vy, p.vx)); }
              continue;
            }
            if (p.kind !== 'fireball' && p.kind !== 'bluefire' && !p.boom) { this.damageEnemy(e, p.dmg, p.src, Math.atan2(p.vy, p.vx), p.slow ? { slow: p.slow } : {}); if (p.el) this.elemHit(e, p.el, p.owner, p.dmg); }
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        if (p.boom) {
          const px = p.x, py = p.y, X0 = Math.round(px), Y0 = Math.round(py);
          this.fx('pfx', { n: 'implosion', x: X0, y: Y0 - 10 });
          this.addZone({ x: px, y: py, r: p.boom * 1.4, dur: 0.5, pull: 420, vis: 'none', src: p.src });
          this.delayed.push({ t: 0.5, fn: () => { this.fx('pfx', { n: 'plasmaExplosion', x: X0, y: Y0 - 10, rar: p.rar }); this.fx('shake', { a: 8 }); this.fx('snd', { n: 'boom', x: X0, y: Y0 }); this.blastAt(px, py, p.boom, p.dmg, p.src, { knock: 340 }); } });
        } else if (p.kind === 'fireball' || p.kind === 'bluefire') {
          this.fx('boom', { x: Math.round(p.x), y: Math.round(p.y), p: p.kind === 'bluefire' ? 'blue' : undefined });
          for (const e of [...this.enemies]) if (dist(e.x, e.y, p.x, p.y) < 84 + e.r) this.damageEnemy(e, p.dmg, p.src, Math.atan2(e.y - p.y, e.x - p.x), { knock: 260, burn: true });
        } else this.fx('poof', { x: Math.round(p.x), y: Math.round(p.y), k: PKINDS.indexOf(p.kind) });
      } else keep.push(p);
    }
    this.projs = keep;
  }

  // ================= 宝・ドロップ =================
  openChest(id) {
    const c = this.map.chests[id];
    if (!c || c.open) return;
    this.fx('chest', { id });
    const D = this.diff;
    if (Math.random() < 0.12 * D.sp) this.giveSP(1);
    const n = 2;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.9;
      this.spawnLoot(c.x + Math.cos(a) * 46, c.y + Math.sin(a) * 40 + 8, rollLoot(this.floor, 0.06 + D.loot, D, D.minChest), c.x, c.y - 10);
    }
    for (let i = 0; i < 3; i++) this.spawnLoot(c.x + rand(-50, 50), c.y + rand(20, 50), makeCoin(2 + this.floor), c.x, c.y - 10);
    this.fx('pfx', { n: 'coinDrop', x: Math.round(c.x), y: Math.round(c.y) });
    if (Math.random() < 0.5) this.spawnLoot(c.x + rand(-30, 30), c.y + 34, { cat: 'heal', amt: 22, id: 'h' + this.nextId++ }, c.x, c.y - 10);
  }

  spawnLoot(x, y, item, ox, oy) {
    // 壁の中に落ちないように調整
    let tx = x, ty = y;
    for (let k = 0; k < 8 && isSolid(this.map, Math.floor(tx / T), Math.floor(ty / T)); k++) { tx = lerp(tx, ox, 0.35); ty = lerp(ty, oy, 0.35); }
    const L = { id: 'L' + this.nextId++, x: Math.round(tx), y: Math.round(ty), item, seed: Math.random() * 10, ox: Math.round(ox), oy: Math.round(oy) };
    this.fx('L+', L);
  }

  addLoot(L) {
    if (this.loot.some((l) => l.id === L.id)) return;
    this.loot.push({ ...L, ox: L.ox != null ? L.ox : L.x, oy: L.oy != null ? L.oy : L.y, t: L.ox != null ? 0 : 1, dx: L.x, dy: L.y, z: 0 });
    if (L.item.rarity >= 3 && L.ox != null) this.sfxAt('rare', L.x, L.y);
  }

  requestPick(L) {
    if (this.isHost) this.pickLoot(L, this.me.id);
    else this.net.send({ t: 'pick', id: L.id });
  }

  pickLoot(L, pid) {
    if (!this.loot.includes(L)) return;
    this.fx('L-', { id: L.id, p: pid });
    const it = L.item;
    if (it.cat === 'heal') { this.healPlayer(pid, it.amt); return; }
    if (it.cat === 'coin') { if (pid === this.me.id) this.addCoins(it.n); else this.net.send({ t: 'coin', n: it.n }); return; }
    if (it.cat === 'xp') { this.addXp(it.n); return; }
    if (it.cat === 'potion') { this.healPlayer(pid, Math.round(this.ownerPos(pid).maxHp * 0.4)); return; }
    if (it.cat === 'star') { this.buffPlayer(pid, { atk: 0.5, haste: 0.25, speed: 0.2 }, 12); this.fx('txt', { x: Math.round(L.x), y: Math.round(L.y - 40), s: 'パワースター！', c: '#ffe866' }); return; }
    if (it.cat === 'key') { this.fx('keygot', {}); return; }
    if (pid === this.me.id) this.receiveItem(L.item);
    else this.net.send({ t: 'give', item: L.item });
  }

  receiveItem(item) {
    const me = this.me;
    if (item.cat === 'coin') { this.addCoins(item.n); return; }
    // 召喚師が読めるのは召喚の巻物だけ。ふつうの巻物は手にすると変わる
    if (item.cat === 'skill' && JOBS[me.job].noEquip && !SUMMON_POOL.includes(item.skill)) item = makeScroll(pick(SUMMON_POOL), item.rarity);
    me.inventory.push(item);
    sfx(item.rarity >= 3 ? 'rare' : 'pick');
    const label = item.cat === 'skill' ? item.name : `${RARITY[item.rarity].name}「${item.name}」`;
    this.ui.toast(`${label} を手に入れた`, RARITY[item.rarity || 0].color, item);
    this.ui.markNew();
  }

  dropItem(item) {
    const me = this.me;
    const x = me.x + Math.cos(me.aim) * 30, y = me.y + Math.sin(me.aim) * 30;
    if (this.isHost) this.spawnLoot(x, y, item, me.x, me.y);
    else this.net.send({ t: 'drop', item, x, y });
  }

  // ================= 転移陣 =================
  // 転移陣は最後に倒した敵の場所に開く
  portalPos() { if (this.portalAt) return this.portalAt; const e = this.map.end; return { x: e.cx * T + T / 2, y: e.cy * T + T / 2 }; }
  // 壁にかからない一番近い場所を探す（飛ぶ敵は壁の上で倒れることがある）
  openSpot(x, y, r = 34) {
    for (let d = 0; d < 400; d += 24) for (let a = 0; a < TAU; a += TAU / 12) {
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (!hitsWall(this.map, px, py, r)) return { x: Math.round(px), y: Math.round(py) };
      if (!d) break;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }
  // ボスの部屋には異次元への転移陣も開く
  dimPortalPos() {
    const m = this.map;
    if (!m.boss) return null;
    if (this.dimAt) return this.dimAt;
    const pp = this.portalPos();
    // 次の階への転移陣の隣で、離れた場所を選ぶ
    for (const [dx, dy] of [[140, 0], [-140, 0], [0, 110], [0, -110], [110, 80], [-110, -80]]) if (!hitsWall(m, pp.x + dx, pp.y + dy, 34)) { const q = { x: pp.x + dx, y: pp.y + dy }; if (this.portalAt) this.dimAt = q; return q; }
    return this.openSpot(pp.x + 140, pp.y);
  }

  onPortalOpen() {
    sfx('portal');
    this.ui.toast(this.map.boss ? '倒れた場所に転移陣が二つ開いた！ 紫は異次元へ続いている' : '最後の魔物が倒れた場所に転移陣が開いた！', '#7fe8ff');
  }

  checkPortal(dt) {
    if (!this.portal && this.enemies.length === 0) {
      if (this.lastKill) this.portalAt = this.openSpot(this.lastKill.x, this.lastKill.y);
      this.portal = true; this.portalArmed = false; this.onPortalOpen();
    }
    if (!this.portal) return;
    const pp = this.portalPos();
    const ps = [this.me, this.ally].filter(Boolean);
    const alive = ps.filter((p) => !p.down);
    const on = alive.length && alive.every((p) => dist(p.x, p.y, pp.x, pp.y) < 62);
    const pd = this.dimPortalPos();
    const onDim = pd && alive.length && alive.every((p) => dist(p.x, p.y, pd.x, pd.y) < 62);
    // 敵を倒した足元に開くので、一度離れてから乗ると進む（拾い物の途中で飛ばされない）
    if (!on && !onDim) this.portalArmed = true;
    this.portalT = (on || onDim) && this.portalArmed ? this.portalT + dt : Math.max(0, this.portalT - dt * 2);
    if (this.portalT > 1.3) {
      for (const p of ps) p.down = false;
      if (onDim) this.loadFloor(this.floor, (Math.random() * 1e9) | 0, false, Math.floor(Math.random() * DIMS.length));
      else this.loadFloor(this.floor + 1, (Math.random() * 1e9) | 0);
    }
  }

  // ================= 演出 =================
  fx(type, d) {
    this.applyFx(type, d);
    if (this.isHost && this.ally) this.outbox.push([type, d]);
  }

  sfxAt(name, x, y) {
    const d = dist(x, y, this.me.x, this.me.y);
    sfx(name, clamp(1.2 - d / 700, 0, 1));
  }

  part(p) {
    p.z = p.z || 0; p.vz = p.vz || 0; p.max = p.life;
    if (this.parts.length < 900) this.parts.push(p);
  }

  applyFx(type, d) {
    this.pix.vfx(type, d);
    switch (type) {
      case 'hit': {
        const mine = d.p === this.me.id;
        this.sfxAt(d.c ? 'crit' : 'hit', d.x, d.y);
        if (mine) { this.hitstop = d.c ? 0.07 : 0.035; this.shake = Math.max(this.shake, d.c ? 5 : 2.5); }
        for (let i = 0; i < (d.c ? 14 : 8); i++) {
          const a = d.a + rand(-0.9, 0.9), s = rand(120, 320);
          this.part({ x: d.x, y: d.y + 8, z: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(20, 120), g: 400, life: rand(0.2, 0.4), size: rand(1.2, 2.2), col: i % 3 ? d.col : '#fff3c0', kind: 'spark', glow: true });
        }
        this.flashes.push({ x: d.x, y: d.y, r: 70, col: '#ffe0b0', t: 0, dur: 0.12 });
        break;
      }
      case 'burn':
        for (let i = 0; i < 4; i++) this.part({ x: d.x + rand(-8, 8), y: d.y + 14, z: rand(5, 20), vx: rand(-10, 10), vy: 0, vz: rand(30, 60), life: 0.5, size: 3, col: '#ff7a2a', kind: 'mote', glow: true });
        break;
      case 'die': {
        this.sfxAt('kill', d.x, d.y);
        const cols = { slime: [['#7fd86a', '#b07ae8', '#ff8a3a', '#7ac8f0'][d.v % 4]], slimeL: [['#7fd86a', '#b07ae8', '#ff8a3a', '#7ac8f0'][d.v % 4]], bat: ['#3b2645', '#5a4364'], skel: ['#e6dec8', '#a8a08a'], mage: ['#4a2e66', '#b050ff'], golem: ['#7a7468', '#5a554c'] }[d.t] || ['#8a8094', '#4a4458'];
        const big = ENEMIES[d.t].boss;
        const n = big ? 50 : 18;
        for (let i = 0; i < n; i++) {
          const a = rand(TAU), s = rand(40, big ? 260 : 170);
          this.part({ x: d.x, y: d.y, z: rand(4, 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(60, 220), g: 520, life: rand(0.5, 1.1), size: rand(2, big ? 7 : 4), col: pick(cols), kind: d.t === 'skel' || big ? 'shard' : 'blob', bounce: true });
        }
        for (let i = 0; i < 8; i++) this.part({ x: d.x + rand(-10, 10), y: d.y, z: 6, vx: rand(-30, 30), vy: rand(-20, 20), vz: rand(10, 40), life: rand(0.6, 1), size: rand(5, 10), col: '#5a5260', kind: 'smoke' });
        if (d.t === 'mage') for (let i = 0; i < 12; i++) this.part({ x: d.x, y: d.y, z: 20, vx: rand(-60, 60), vy: rand(-60, 60), vz: rand(20, 80), life: 1, size: 3, col: '#c070ff', kind: 'mote', glow: true });
        if (big) { this.shake = 14; sfx('slam'); this.flashes.push({ x: d.x, y: d.y, r: 300, col: '#ffb04a', t: 0, dur: 0.6 }); }
        this.rings.push({ x: d.x, y: d.y, r0: 6, r1: big ? 160 : 40, t: 0, dur: 0.35, col: '#ffffff', w: 2 });
        break;
      }
      case 'boom':
        this.sfxAt('boom', d.x, d.y);
        this.shake = Math.max(this.shake, 8);
        this.flashes.push({ x: d.x, y: d.y, r: 260, col: '#ff8a3a', t: 0, dur: 0.4 });
        this.rings.push({ x: d.x, y: d.y, r0: 10, r1: 92, t: 0, dur: 0.35, col: '#ffb040', w: 6 });
        for (let i = 0; i < 30; i++) { const a = rand(TAU), s = rand(60, 300); this.part({ x: d.x, y: d.y, z: 14, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(40, 200), g: 300, life: rand(0.3, 0.7), size: rand(2, 5), col: pick(['#ffd27a', '#ff7a2e', '#ff4a1a']), kind: 'mote', glow: true }); }
        for (let i = 0; i < 10; i++) this.part({ x: d.x + rand(-20, 20), y: d.y + rand(-10, 10), z: 10, vx: rand(-30, 30), vy: rand(-20, 20), vz: rand(20, 60), life: rand(0.7, 1.2), size: rand(8, 16), col: '#3a3030', kind: 'smoke' });
        break;
      case 'poof':
        for (let i = 0; i < 6; i++) this.part({ x: d.x, y: d.y, z: 16, vx: rand(-80, 80), vy: rand(-80, 80), vz: rand(0, 60), life: 0.3, size: 2, col: d.k === 3 ? '#c070ff' : d.k === 1 ? '#9fd8ff' : '#d8c8a8', kind: 'spark', glow: d.k !== 0 });
        break;
      case 'rock':
        this.sfxAt('slam', d.x, d.y);
        this.shake = Math.max(this.shake, 4);
        this.rings.push({ x: d.x, y: d.y, r0: 6, r1: 48, t: 0, dur: 0.3, col: '#d8c8a8', w: 3 });
        for (let i = 0; i < 14; i++) { const a = rand(TAU); this.part({ x: d.x, y: d.y, z: 4, vx: Math.cos(a) * rand(40, 160), vy: Math.sin(a) * rand(30, 100), vz: rand(60, 180), g: 500, life: rand(0.4, 0.8), size: rand(2, 4), col: '#7a7468', kind: 'shard', bounce: true }); }
        break;
      case 'slam':
        this.sfxAt('slam', d.x, d.y);
        this.shake = Math.max(this.shake, 12);
        this.rings.push({ x: d.x, y: d.y, r0: 20, r1: 150, t: 0, dur: 0.45, col: '#ffcf8a', w: 8 });
        for (let i = 0; i < 40; i++) { const a = rand(TAU), s = rand(80, 260); this.part({ x: d.x + Math.cos(a) * 30, y: d.y + Math.sin(a) * 20, z: 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(40, 160), g: 500, life: rand(0.4, 0.9), size: rand(2, 5), col: pick(['#7a7468', '#5a554c', '#9a9080']), kind: 'shard', bounce: true }); }
        for (let i = 0; i < 14; i++) { const a = rand(TAU); this.part({ x: d.x + Math.cos(a) * 60, y: d.y + Math.sin(a) * 40, z: 6, vx: Math.cos(a) * 60, vy: Math.sin(a) * 40, vz: 20, life: 1.1, size: rand(10, 18), col: '#4a4440', kind: 'smoke' }); }
        break;
      case 'whirl':
        this.sfxAt('heavy', d.x, d.y);
        this.rings.push({ x: d.x, y: d.y, r0: 20, r1: 100, t: 0, dur: 0.3, col: '#fff6e0', w: 5 });
        this.rings.push({ x: d.x, y: d.y, r0: 40, r1: 96, t: 0, dur: 0.4, col: '#efe6cf', w: 3 });
        break;
      case 'dash':
        this.sfxAt('dodge', d.x, d.y);
        for (let i = 0; i < 20; i++) { const k = i / 20; this.part({ x: lerp(d.x, d.x2, k), y: lerp(d.y, d.y2, k), z: 18, vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.3, 0.5), size: rand(2, 4), col: '#7fe8d6', kind: 'mote', glow: true }); }
        break;
      case 'heal':
        this.sfxAt('heal', d.x, d.y);
        this.rings.push({ x: d.x, y: d.y, r0: 10, r1: 230, t: 0, dur: 0.7, col: '#ffd27a', w: 5 });
        this.flashes.push({ x: d.x, y: d.y, r: 300, col: '#ffe0a0', t: 0, dur: 0.7 });
        for (let i = 0; i < 30; i++) { const a = rand(TAU), r = rand(0, 120); this.part({ x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r * 0.6, z: rand(0, 10), vx: 0, vy: 0, vz: rand(30, 80), life: rand(0.8, 1.4), size: rand(2, 4), col: '#ffe6a0', kind: 'mote', glow: true }); }
        break;
      case 'nova':
        this.sfxAt('freeze', d.x, d.y);
        this.rings.push({ x: d.x, y: d.y, r0: 10, r1: 140, t: 0, dur: 0.45, col: '#a8e4ff', w: 10 });
        this.flashes.push({ x: d.x, y: d.y, r: 260, col: '#8fd8ff', t: 0, dur: 0.5 });
        for (let i = 0; i < 36; i++) { const a = rand(TAU), s = rand(150, 320); this.part({ x: d.x, y: d.y, z: 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(20, 90), g: 200, life: rand(0.35, 0.6), size: rand(2, 4), col: pick(['#ffffff', '#a8e4ff', '#6ac0ff']), kind: 'shard', glow: true }); }
        break;
      case 'chain':
        this.sfxAt('zap', d.pts[0][0], d.pts[0][1]);
        this.bolts.push({ pts: d.pts, t: 0, dur: 0.35 });
        for (const [x, y] of d.pts) this.flashes.push({ x, y, r: 120, col: '#b7a3ff', t: 0, dur: 0.3 });
        break;
      case 'ward':
        this.sfxAt('ward', d.x, d.y);
        this.rings.push({ x: d.x, y: d.y, r0: 250, r1: 20, t: 0, dur: 0.5, col: '#9fe6a0', w: 4 });
        break;
      case 'chest': {
        const c = this.map.chests[d.id];
        if (!c) break;
        c.open = true; c.openT = 0.01;
        this.sfxAt('chest', c.x, c.y);
        for (let i = 0; i < 24; i++) this.part({ x: c.x + rand(-12, 12), y: c.y, z: 14, vx: rand(-60, 60), vy: rand(-30, 20), vz: rand(80, 200), g: 220, life: rand(0.6, 1.2), size: rand(1.5, 3), col: pick(['#ffd27a', '#fff0b0']), kind: 'mote', glow: true });
        break;
      }
      case 'shake': this.shake = Math.max(this.shake, d.a); break;
      case 'sp':
        this.me.sp += d.n;
        sfx('rare');
        this.ui.toast(`スキルポイントを ${d.n} 手に入れた（Tab → スキルツリー）`, '#ffd27a');
        this.ui.markNew();
        break;
      case 'pzw':
        if (d.p !== this.me.id) this.ui.toast('相方が石碑に答えた。あなたも答えよう', '#ffd27a');
        else this.ui.toast('相方の答えを待っています', '#c9c2b2');
        break;
      case 'pzs': { const p = this.map.puzzles[d.id]; if (p) { p.lit = d.lit; p.step = d.step; p.hold = d.hold; } break; }
      case 'pzdone': {
        const p = this.map.puzzles[d.id];
        if (!p) break;
        p.done = true; p.solved = !!d.ok;
        this.sfxAt(d.ok ? 'chest' : 'hurt', p.x, p.y);
        this.ui.toast(d.ok ? '謎を解いた！報酬を手に入れた' : '答えが違った… 石碑は砕けた', d.ok ? '#ffd27a' : '#ff8a6a');
        break;
      }
      case 'L+': this.addLoot(d); break;
      case 'door': this.applyDoor(); sfx('portal'); break;
      case 'keygot': this.map.keyGot = true; sfx('rare'); this.ui.toast('鍵を手に入れた！ どこかに隠し扉がある', '#ffe866'); break;
      case 'rushstart': this.map.secret.used = true; sfx('level'); this.ui.toast('コインを集めろ！ 15 秒', '#ffd860'); this.pix.vfx('pfx', { n: 'countdown', x: this.map.secret.cx, y: this.map.secret.cy - 50 }); break;
      case 'rushend': sfx('rare'); this.pix.vfx('pfx', { n: 'confetti', x: d.x, y: d.y }); this.ui.toast('時間切れ！ ご褒美が出た', '#ffd860'); break;
      case 'springuse': this.map.secret.used = true; sfx('heal'); this.ui.toast('泉の力で体が満たされた', '#7fd8ff'); break;
      case 'fireworks': this.pix.vfx('fireworks', d); this.shake = 14; break;
      case 'flash': this.flashes.push({ x: d.x, y: d.y, r: 400, col: d.c, t: 0, dur: 0.5 }); this.shake = Math.max(this.shake, 10); break;
      case 'L-': {
        const L = this.loot.find((l) => l.id === d.id);
        if (L) {
          this.loot = this.loot.filter((l) => l !== L);
          if (L.item.cat === 'coin') { this.sfxAt('pick', L.x, L.y); this.pix.vfx('pfx', { n: 'collectBurst', x: L.x, y: L.y, sm: 1 }); }
          else if (L.item.cat === 'xp' || L.item.cat === 'key' || L.item.cat === 'star' || L.item.cat === 'potion') { this.sfxAt('rare', L.x, L.y); this.pix.vfx('collect', { x: L.x, y: L.y }); }
          else if (L.item.cat === 'heal') { this.sfxAt('heal', L.x, L.y); for (let i = 0; i < 8; i++) this.part({ x: L.x, y: L.y, z: 10, vx: rand(-30, 30), vy: rand(-30, 30), vz: rand(30, 80), life: 0.6, size: 2.5, col: '#ff6a7a', kind: 'mote', glow: true }); }
          else this.pix.vfx('collect', { x: L.dx, y: L.dy });
          if (!AUTO_PICK.includes(L.item.cat) && d.p !== this.me.id && this.ally) this.texts.push({ x: L.x, y: L.y - 30, s: `${this.ally.name}が拾った`, c: RARITY[L.item.rarity || 0].color, t: 0, dur: 1.2, size: 12, vy: -20 });
        }
        break;
      }
      case 'snd': this.sfxAt(d.n, d.x, d.y); break;
      case 'txt': this.texts.push({ x: d.x, y: d.y, s: d.s, c: d.c, t: 0, dur: 2, size: 18, vy: -14 }); break;
    }
  }

  updateFx(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.g) p.vz -= p.g * dt;
      if (p.z < 0) { p.z = 0; if (p.bounce) { p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; } else p.vz = 0; }
      const dr = p.kind === 'smoke' ? 2.5 : p.kind === 'mote' ? 1.5 : 0.8;
      p.vx *= Math.exp(-dt * dr); p.vy *= Math.exp(-dt * dr);
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.vy *= Math.exp(-dt * 3); }
    this.texts = this.texts.filter((t) => t.t < t.dur);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
    // 漂う塵
    while (this.motes.length < 40) this.motes.push({ x: this.cam.x + rand(-700, 700), y: this.cam.y + rand(-450, 450), z: rand(10, 80), vx: rand(-6, 6), vy: rand(-4, 4), ph: rand(TAU) });
    for (const m of this.motes) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.ph += dt;
      if (Math.abs(m.x - this.cam.x) > 760 || Math.abs(m.y - this.cam.y) > 500) { m.x = this.cam.x + rand(-700, 700); m.y = this.cam.y + rand(-450, 450); }
    }
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  updateCamera(dt) {
    const me = this.me;
    let tx = me.x, ty = me.y - 20;
    if (this.mouseWorld && !me.down) { tx += (this.mouseWorld.x - me.x) * 0.12; ty += (this.mouseWorld.y - me.y) * 0.12; }
    const k = 1 - Math.exp(-dt * 7);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  // ================= 描画 =================
  render() {
    this.pix.render();
    this.pix.present();
  }
}
