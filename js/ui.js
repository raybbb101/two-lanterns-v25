import { RARITY, WEAPONS, UNIQUE, GEAR_TOP, SELL, PETS, ELEMENTS, CURSES, shopStock, rollLegendWeapon, makeEgg, hatchPet, petDamage, fuseGear, DIFFS, SCROLL_POOL, SKILLS, AFFIX, ENEMIES, GEAR_SLOTS, STAT_INFO, SETS, FUSE_COST, fuseWeapons, skillPower, xpForLevel, affinityOf, affinityLabel, AFFINITY } from './data.js';
import { JOBS, RESET_COST, skillLevels, setCounts, nodeState, allNodes, locate, classTitle } from './jobs.js';
import { RIDDLES } from './riddles.js';
import { mulberry } from './util.js';
import { itemIcon, skillIconURL, drawPortrait, petIcon } from './icons.js';
import { toggleMute, sfx } from './audio.js';
import { T } from './map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { melee: '近接', thrust: '突き', bow: '弓', staff: '魔法' };
const INV_MAX = 60;
const SK_KEYS = ['Q', 'E', 'R', 'C'];
const SLOT_IDS = ['slotQ', 'slotE', 'slotR', 'slotC'];

export class UI {
  constructor(g) {
    this.g = g;
    this.t = 0; this.hudT = 0; this.mmT = 0;
    this.charOpen = false;
    this.sel = null;
    $('hud').classList.remove('hidden');
    $('title').classList.add('hidden');
    this.mm = $('minimap'); this.mmc = this.mm.getContext('2d');
    this.tab = 'status';

    const rb = $('roomBox');
    if (g.mode === 'host') { rb.classList.remove('hidden'); $('roomCode').textContent = g.code; this.setStatus('waiting'); }
    else if (g.mode === 'guest') rb.classList.remove('hidden');
    else rb.classList.add('hidden');

    this.handlers = [];
    const on = (el, ev, fn) => { el.addEventListener(ev, fn); this.handlers.push([el, ev, fn]); };
    on($('copyCode'), 'click', () => {
      navigator.clipboard && navigator.clipboard.writeText(g.code).then(() => this.toast('ルームコードをコピーしました', '#c9c2b2'));
    });
    on($('charClose'), 'click', () => this.toggleChar(false));
    on($('helpClose'), 'click', () => this.toggleHelp(false));
    on($('btnChar'), 'click', () => this.toggleChar());
    on($('btnHelp'), 'click', () => this.toggleHelp());
    on($('btnMute'), 'click', () => this.toggleMute());
    on($('fatalBtn'), 'click', () => g.onExit && g.onExit());
    on($('charTabs'), 'click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) { this.tab = b.dataset.tab; this.sel = null; sfx('ui'); this.renderChar(); }
    });
    on($('charBody'), 'click', (e) => this.onCharClick(e));
    on($('charBody'), 'dblclick', (e) => { const c = e.target.closest('[data-id]'); if (c) this.useItem(c.dataset.id); });
    on($('riddleClose'), 'click', () => this.closeRiddle());
    on($('shopClose'), 'click', () => this.closeShop());
    on($('shopBody'), 'click', (e) => this.onShopClick(e));
  }

  get modalOpen() { return this.charOpen || !!this.riddleP || !!this.shopOpen; }

  destroy() {
    for (const [el, ev, fn] of this.handlers) el.removeEventListener(ev, fn);
    $('hud').classList.add('hidden');
    ['charScreen', 'riddle', 'shop', 'help', 'waitOverlay', 'fatal'].forEach((id) => $(id).classList.add('hidden'));
    $('toasts').innerHTML = '';
  }

  // ---------- 毎フレーム ----------
  frame(dt) {
    this.t += dt;
    this.hudT -= dt;
    if (this.hudT <= 0 && this.g.map) { this.hudT = 0.08; this.updateHUD(); }
    this.mmT -= dt;
    if (this.mmT <= 0 && this.g.map) { this.mmT = 0.2; this.drawMinimap(); }
    if (this.charOpen) this.drawPortrait();
  }

  updateHUD() {
    const g = this.g, me = g.me;
    $('floorNum').textContent = `第 ${g.floor} 層`;
    $('floorName').textContent = g.map.theme.name + (g.map.boss ? ' — 番人の間' : '');
    $('diffName').textContent = `難易度：${g.diff.name}`; $('diffName').style.color = g.diff.color;
    const n = g.enemies.length;
    $('remain').innerHTML = (g.portal ? '<span class="open">転移陣が開いている — 二人で乗ろう</span>' : `残る魔物 <b>${n}</b>`) + `<div class="coinline">コイン ${me.coins}${g.map.keyGot && g.map.secret && !g.map.secret.open ? ' ・ 鍵あり' : ''}</div>`;
    this.partyFrame($('pMe'), me, true);
    const pa = $('pAlly');
    if (g.ally) { pa.classList.remove('hidden'); this.partyFrame(pa, g.ally, false); } else pa.classList.add('hidden');
    const need = xpForLevel(g.lvl);
    $('xpFill').style.width = `${(g.xp / need) * 100}%`;
    $('xpText').textContent = `Lv ${g.lvl}  ·  ${g.xp} / ${need}`;
    // アクションバー
    this.slot($('slotW'), me.weapon ? itemIcon(me.weapon) : null, 0, me.weapon ? RARITY[me.weapon.rarity].color : null);
    const lv = skillLevels(me);
    me.slots.forEach((id, i) => {
      const el = $(SLOT_IDS[i]);
      if (id && lv[id]) {
        const pw = skillPower(id, lv[id], me.stats);
        this.slot(el, skillIconURL(id), Math.max(0, (me.cds[id] || 0) / pw.cd), SKILLS[id].color, me.cds[id] > 0 ? Math.ceil(me.cds[id]) : '');
      } else this.slot(el, null, 0);
    });
    this.slot($('slotD'), null, Math.max(0, me.dodgeCd / me.dodgeMax), null, '', true);
    // 拾う・開けるの案内
    const pr = $('prompt');
    const it = g.interact;
    if (it && !me.down) {
      pr.classList.remove('hidden');
      if (it.type === 'chest') pr.innerHTML = '<kbd>F</kbd> 宝箱を開ける';
      else if (it.type === 'riddle') pr.innerHTML = '<kbd>F</kbd> 石碑を読む';
      else if (it.type === 'shop') pr.innerHTML = '<kbd>F</kbd> 商人と話す';
      else if (it.type === 'door') pr.innerHTML = g.map.keyGot ? '<kbd>F</kbd> 鍵で扉を開ける' : '<kbd>F</kbd> 扉を調べる <small>鍵がかかっている</small>';
      else if (it.type === 'rush') pr.innerHTML = '<kbd>F</kbd> コイン集めに挑戦 <small>15 秒</small>';
      else if (it.type === 'spring') pr.innerHTML = '<kbd>F</kbd> 泉の水を飲む';
      else {
        const item = it.L.item;
        const col = RARITY[item.rarity || 0].color;
        const sub = item.cat === 'egg' ? '孵すとペットが生まれる' : item.cat === 'skill' ? `スキルの巻物 ${affinityLabel(item.skill, me.job)}` : item.cat === 'weapon' ? `${WEAPONS[item.base].name} · 攻撃 ${item.dmg}` : item.cat === 'gear' ? `防具 · ${GEAR_SLOTS[item.slot].name}${item.set ? ` · ${SETS[item.set].name}セット` : ''}` : 'スキルの巻物';
        pr.innerHTML = `<kbd>F</kbd> 拾う <b style="color:${col}">${esc(item.name)}</b> <small>${sub}</small>`;
      }
    } else {
      // 台座のヒント
      const pz = me.down ? null : g.map.puzzles.find((p) => p.kind === 'plates' && !p.done && Math.hypot(p.x - me.x, p.y - me.y) < 200);
      if (pz) { pr.classList.remove('hidden'); pr.innerHTML = g.ally ? `二人で 2 つの台座に同時に乗ろう <small>${pz.hold > 0 ? '…そのまま！' : ''}</small>` : `台座が光る順番に踏もう <small>${pz.step || 0} / 3</small>`; }
      else pr.classList.add('hidden');
    }
    // ボス
    const boss = g.enemies.find((e) => ENEMIES[e.type].boss);
    const bb = $('bossBar');
    if (boss) {
      bb.classList.remove('hidden');
      $('bossFill').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
      $('bossName').textContent = ENEMIES[boss.type].name + (boss.enraged ? '（激昂）' : '');
    } else bb.classList.add('hidden');
    $('downOverlay').classList.toggle('hidden', !me.down);
    $('downText').textContent = g.ally ? (g.ally.down ? '二人とも倒れた… フロアをやり直す' : '倒れた — 相方が近くに来ると復活できる') : 'フロアをやり直す…';
  }

  partyFrame(el, p, mine) {
    el.querySelector('.pname').textContent = p.name;
    el.querySelector('.pname').style.color = p.pal.name;
    el.querySelector('.plv').textContent = `Lv ${this.g.lvl}`;
    const hp = Math.max(0, p.hp), mx = p.maxHp || 100;
    el.querySelector('.hpFill').style.width = `${(hp / mx) * 100}%`;
    el.querySelector('.shFill').style.width = `${Math.min(1, (p.shield || 0) / mx) * 100}%`;
    el.querySelector('.hpText').textContent = p.down ? 'ダウン' : `${Math.ceil(hp)} / ${mx}`;
    el.classList.toggle('down', !!p.down);
    el.classList.toggle('low', !p.down && hp / mx < 0.3);
  }

  slot(el, img, cd, col, label = '', dodge = false) {
    const im = el.querySelector('img');
    if (img) { if (im.dataset.src !== img) { im.src = img; im.dataset.src = img; } im.classList.remove('hidden'); } else if (!dodge) im.classList.add('hidden');
    el.style.setProperty('--cd', cd);
    el.style.setProperty('--col', col || 'transparent');
    el.querySelector('.cdnum').textContent = label;
    el.classList.toggle('empty', !img && !dodge);
  }

  drawMinimap() {
    const g = this.g, m = g.map, c = this.mmc;
    const W = this.mm.width, H = this.mm.height;
    const s = Math.min(W / m.W, H / m.H);
    const ox = (W - m.W * s) / 2, oy = (H - m.H * s) / 2;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,8,12,.75)';
    c.fillRect(0, 0, W, H);
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
      const i = y * m.W + x;
      if (!m.seen[i]) continue;
      if (m.g[i] && !(m.secret && !m.secret.open && x >= m.secret.room.x && x < m.secret.room.x + m.secret.room.w && y >= m.secret.room.y && y < m.secret.room.y + m.secret.room.h)) { c.fillStyle = '#6a6056'; c.fillRect(ox + x * s, oy + y * s, s + 0.4, s + 0.4); }
    }
    const P = (x, y, col, r) => { c.fillStyle = col; c.beginPath(); c.arc(ox + (x / T) * s, oy + (y / T) * s, r, 0, 7); c.fill(); };
    for (const ch of m.chests) if (!ch.open && m.seen[((ch.y / T) | 0) * m.W + ((ch.x / T) | 0)]) P(ch.x, ch.y, '#ffcf5a', 2.4);
    if (m.secret && !m.secret.open && m.seen[((m.secret.dy / T) | 0) * m.W + ((m.secret.dx / T) | 0)]) P(m.secret.dx, m.secret.dy, '#ffe680', 2.6);
    if (m.merchant) P(m.merchant.x, m.merchant.y, '#8ad070', 2.6);
    if (g.portal && g.dimPortalPos()) { const pd = g.dimPortalPos(); P(pd.x, pd.y, '#a860f0', 3.4); }
    const pp = g.portalPos();
    if (g.portal) P(pp.x, pp.y, '#5ad0ff', 3.4);
    for (const e of g.enemies) if (Math.hypot(e.x - g.me.x, e.y - g.me.y) < 420) P(e.x, e.y, '#ff5a4a', 1.8);
    if (g.ally) P(g.ally.x, g.ally.y, g.ally.pal.name, 3.2);
    P(g.me.x, g.me.y, '#ffffff', 3.4);
    P(g.me.x, g.me.y, g.me.pal.name, 2.2);
  }

  // ---------- 通知 ----------
  toast(msg, col = '#e8e0cc', item) {
    const box = $('toasts');
    const d = document.createElement('div');
    d.className = 'toast';
    d.style.setProperty('--col', col);
    d.innerHTML = (item && item.cat ? `<img src="${itemIcon(item, 40)}">` : '') + `<span>${esc(msg)}</span>`;
    box.prepend(d);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 3200);
    setTimeout(() => d.remove(), 3800);
  }

  floorBanner(n, name, wipe) {
    const f = $('fade');
    f.querySelector('.fn').textContent = `第 ${n} 層`;
    f.querySelector('.fname').textContent = wipe ? '全滅… もう一度挑もう' : name;
    // 画面切り替えの演出があるときは、暗転せず文字だけ出す
    f.classList.toggle('clear', !!(wipe || this.g.pix.tr.list.length));
    f.classList.remove('show');
    void f.offsetWidth;
    f.classList.add('show');
  }

  hurtFlash() {
    const h = $('hurtFx');
    h.classList.remove('on');
    void h.offsetWidth;
    h.classList.add('on');
  }

  setStatus(s, name) {
    const st = $('roomStatus');
    if (s === 'waiting') { st.textContent = '相方を待っています… このコードを伝えよう'; st.className = 'wait'; }
    else if (s === 'connected') { st.textContent = `${name} と冒険中`; st.className = 'ok'; }
    else if (s === 'guest') { $('roomCode').textContent = this.g.code; st.textContent = `${name} のルームに参加中`; st.className = 'ok'; $('copyCode').classList.add('hidden'); }
  }

  waiting(on) { $('waitOverlay').classList.toggle('hidden', !on); }
  fatal(msg) { $('fatalMsg').textContent = msg; $('fatal').classList.remove('hidden'); }
  markNew() { $('btnChar').classList.add('new'); }

  toggleMute() { const m = toggleMute(); $('btnMute').classList.toggle('off', m); this.toast(m ? '音を消しました' : '音を出しました'); }
  toggleHelp(force) { const h = $('help'); const on = force != null ? force : h.classList.contains('hidden'); h.classList.toggle('hidden', !on); }

  // ---------- なぞなぞ ----------
  openRiddle(p) {
    this.riddleP = p;
    const R = RIDDLES[p.ri % RIDDLES.length];
    const rnd = mulberry(p.ri), order = R.c.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    $('riddleQ').textContent = R.q;
    $('riddleNote').textContent = this.g.ally ? '二人とも正解すると報酬がもらえます。一人でも間違えると石碑は砕けます。' : '答えは一度だけ。間違えると石碑は砕けます。';
    const box = $('riddleChoices');
    box.innerHTML = order.map((i) => `<button data-i="${i}">${esc(R.c[i])}</button>`).join('');
    box.onclick = (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const ok = +b.dataset.i === R.a, g = this.g;
      p.mine = true;
      this.closeRiddle();
      if (g.isHost) g.puzzleAnswer(g.me.id, p.id, ok);
      else g.net.send({ t: 'pza', id: p.id, ok });
    };
    $('riddle').classList.remove('hidden');
    sfx('ui');
  }
  closeRiddle() { this.riddleP = null; $('riddle').classList.add('hidden'); }

  // ---------- キャラクター画面 ----------
  toggleChar(force) {
    const on = force != null ? force : !this.charOpen;
    this.charOpen = on;
    $('charScreen').classList.toggle('hidden', !on);
    if (on) { $('btnChar').classList.remove('new'); this.renderChar(); sfx('ui'); }
  }
  closeAll() { this.toggleChar(false); this.toggleHelp(false); this.closeRiddle(); this.closeShop(); }

  isSolo() { const g = this.g; return !g.ally && !(g.net && g.net.connected); }

  weaponStats(it) {
    const W = WEAPONS[it.base], st = this.g.me.stats;
    const rate = it.rate * (1 - st.haste), dmg = Math.round(it.dmg * st.atk);
    return { dmg, rate, dps: dmg / rate, crit: Math.round((it.crit + st.crit) * 100), kind: KIND[W.kind] };
  }

  weaponCard(it, cmp) {
    const s = this.weaponStats(it), c = cmp ? this.weaponStats(cmp) : null;
    const diff = (a, b, inv) => {
      if (!c) return '';
      const d = a - b;
      if (Math.abs(d) < 0.05) return '';
      const good = inv ? d < 0 : d > 0;
      return ` <i class="${good ? 'up' : 'dn'}">${good ? '▲' : '▼'}${Math.abs(d) < 1 ? Math.abs(d).toFixed(2) : Math.round(Math.abs(d))}</i>`;
    };
    const col = RARITY[it.rarity].color;
    return `<div class="wcard" style="--col:${col}"><img src="${itemIcon(it, 64)}"><div><div class="wname" style="color:${col}">${esc(it.name)}</div><div class="wsub">${RARITY[it.rarity].name} · ${WEAPONS[it.base].name}（${s.kind}）</div></div></div>
      <dl class="stats"><dt>攻撃力</dt><dd>${s.dmg}${diff(s.dmg, c && c.dmg)}</dd><dt>攻撃間隔</dt><dd>${s.rate.toFixed(2)} 秒${diff(s.rate, c && c.rate, true)}</dd><dt>毎秒ダメージ</dt><dd>${s.dps.toFixed(1)}${diff(s.dps, c && c.dps)}</dd><dt>会心率</dt><dd>${s.crit}%${diff(s.crit, c && c.crit)}</dd></dl>
      ${(it.affixes || []).map((a) => `<div class="affix">◆ ${AFFIX[a].desc}</div>`).join('') || '<div class="setline">追加効果なし</div>'}${this.weaponTraits(it)}`;
  }

  weaponTraits(it) {
    const W = WEAPONS[it.base];
    if (it.bound) return '<div class="setline">通常攻撃のみ。階層が進むと強くなります。</div>';
    if (it.rarity === 6) { const U = UNIQUE[it.base]; return `<div class="affix" style="color:${RARITY[6].color}">◆ 通常：${U.normal}</div><div class="affix" style="color:${RARITY[6].color}">◆ 重撃：${U.heavy}</div>`; }
    return `${it.rarity === 5 ? `<div class="affix" style="color:${RARITY[5].color}">◆ 神話の力：${W.myth}</div>` : ''}<div class="setline">重撃（長押し ${W.heavy.t} 秒）「${W.heavy.name}」：${W.heavy.desc}</div>`;
  }

  gearCard(it, cmp) {
    const col = RARITY[it.rarity].color;
    const lines = Object.entries(it.stats).map(([k, v]) => {
      const old = cmp ? cmp.stats[k] || 0 : null, d = old == null ? 0 : v - old;
      return `<dt>${STAT_INFO[k][0]}</dt><dd>${STAT_INFO[k][1](v)}${d ? ` <i class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'}</i>` : ''}</dd>`;
    }).join('');
    const set = it.set ? `<div class="setline" style="color:${SETS[it.set].color}">◆ ${SETS[it.set].name}セット</div>` : '';
    return `<div class="wcard" style="--col:${col}"><img src="${itemIcon(it, 64)}"><div><div class="wname" style="color:${col}">${esc(it.name)}</div><div class="wsub">${RARITY[it.rarity].name} · ${GEAR_SLOTS[it.slot].name}</div></div></div><dl class="stats">${lines}</dl>${set}`;
  }

  grid(items) {
    return `<div class="invgrid">${items.map((it) => `<div class="cell ${it.id === this.sel ? 'sel' : ''}" data-id="${it.id}" style="--col:${RARITY[it.rarity || 0].color}" title="${esc(it.name)}"><img src="${itemIcon(it, 48)}"></div>`).join('') || '<p class="muted small">まだありません</p>'}</div>`;
  }

  renderChar() {
    const g = this.g;
    document.querySelectorAll('#charTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const note = $('charNote');
    note.textContent = this.isSolo() ? '一人プレイ中：この画面を開いている間はゲームが止まります。' : '⚠ 二人プレイ中：この画面を開いていてもゲームは止まりません。敵に注意！';
    note.classList.toggle('warn', !this.isSolo());
    $('charBody').innerHTML = { status: () => this.tabStatus(), weapon: () => this.tabWeapon(), gear: () => this.tabGear(), pet: () => this.tabPet(), skill: () => this.tabSkill(), tree: () => this.tabTree() }[this.tab]();
    this.pc = null;
    const pc = $('portrait');
    if (pc) this.pc = pc.getContext('2d');
  }

  tabStatus() {
    const g = this.g, me = g.me, st = me.stats, ws = me.weapon ? this.weaponStats(me.weapon) : null;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const rows = [['HP', `${Math.ceil(me.hp)} / ${me.maxHp}`], ['攻撃力', `×${st.atk.toFixed(2)}`], ['毎秒ダメージ', ws ? ws.dps.toFixed(1) : '-'], ['会心率', ws ? `${ws.crit}%` : pct(st.crit)], ['会心ダメージ', `×${(1.8 + st.critDmg).toFixed(2)}`], ['被ダメージ軽減', pct(st.def)], ['移動速度', pct(st.speed)], ['攻撃速度', `+${pct(st.haste)}`], ['スキル再使用短縮', pct(st.cdr)], ['回復量', pct(st.heal)], ['ダメージ吸収', pct(st.vamp)], ['HP自動回復', `毎秒 ${st.regen}`], ['回避の再使用', `${me.dodgeMax.toFixed(2)} 秒`], ['スキルポイント', me.sp], ['到達階層', `第 ${g.floor} 層`]];
    const eq = Object.keys(GEAR_SLOTS).map((k) => { const it = me.gear[k]; return `<div class="setline">${GEAR_SLOTS[k].name}：${it ? `<span style="color:${RARITY[it.rarity].color}">${esc(it.name)}</span>` : 'なし'}</div>`; }).join('');
    return `<div class="tabcols c3"><div><canvas id="portrait" width="300" height="320"></canvas><div class="cname"><span style="color:${JOBS[me.job].color}">${esc(me.name)}</span><span id="cLv">Lv ${g.lvl}</span></div><div class="wsub">${classTitle(me)}</div></div>
      <div><h3>ステータス</h3><dl class="stats">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></div>
      <div><h3>武器</h3>${me.weapon ? `<div class="setline"><span style="color:${RARITY[me.weapon.rarity].color}">${esc(me.weapon.name)}</span></div>` : ''}<h3>防具</h3>${eq}<h3>セット効果</h3>${this.setsHtml(true)}<h3>コイン</h3><div class="setline coinline">${me.coins}</div>${me.curses.length ? `<h3>呪い</h3>${me.curses.map((c) => `<div class="setline">${esc(c.name)}：${esc(c.desc)}</div>`).join('')}` : ''}</div></div>`;
  }

  setsHtml(onlyActive) {
    const c = setCounts(this.g.me);
    const fmt = (o) => Object.entries(o).map(([k, v]) => (k === 'aff' ? '攻撃が敵を炎上させる' : `${STAT_INFO[k][0]} ${STAT_INFO[k][1](v)}`)).join('、');
    const keys = onlyActive ? Object.keys(c) : Object.keys(SETS);
    if (!keys.length) return '<p class="muted small">セットの防具を揃えると効果が出ます。</p>';
    return keys.map((k) => { const n = c[k] || 0, S = SETS[k]; return `<div class="setname" style="color:${S.color}">${S.name}セット（${n}）</div><div class="setline ${n >= 2 ? 'on' : ''}">2 個：${fmt(S.two)}</div><div class="setline ${n >= 4 ? 'on' : ''}">4 個：${fmt(S.four)}</div>`; }).join('');
  }

  tabWeapon() {
    const me = this.g.me, items = me.inventory.filter((i) => i.cat === 'weapon');
    const sel = items.find((x) => x.id === this.sel);
    const groups = {};
    for (const it of items) { const k = it.base + '|' + it.rarity; (groups[k] = groups[k] || []).push(it); }
    if (JOBS[me.job].noEquip) return `<div class="panelbox"><p>召喚師は通常攻撃と重撃が使えず、武器も装備できません。拾った武器は売ってコインにするか、相方に渡せます。</p></div><h3>持っている武器 <span>${items.length}</span></h3>${this.grid(items)}${sel ? `<div class="panelbox" style="margin-top:12px">${this.weaponCard(sel)}<div class="acts"><button data-act="sell">売る（${SELL[sel.rarity]}）</button><button data-act="drop">足元に置く</button></div></div>` : ''}`;
    const owned = (b) => [me.weapon, ...items].some((i) => i && i.base === b && i.rarity === 6);
    const fuse = Object.entries(groups).filter(([k]) => +k.split('|')[1] < 6).sort((a, b) => a[1][0].rarity - b[1][0].rarity).map(([k, l]) => {
      const it = l[0], need = FUSE_COST[it.rarity], next = RARITY[it.rarity + 1];
      return `<div class="fuse"><img src="${itemIcon(it, 48)}"><div><span style="color:${RARITY[it.rarity].color}">${RARITY[it.rarity].name}</span> ${WEAPONS[it.base].name} <b>${l.length}</b> / ${need}<small>→ <span style="color:${next.color}">${next.name}</span> に合成</small></div><button data-act="fuse" data-k="${k}" ${l.length >= need && !(it.rarity === 5 && owned(it.base)) ? '' : 'disabled'}>合成</button>${it.rarity === 5 && owned(it.base) ? '<small>唯一の武器はすでに持っています</small>' : ''}</div>`;
    }).join('') || '<p class="muted small">同じ武器種・同じレアリティの武器を集めると合成できます。装備中の武器は素材になりません。</p>';
    return `<div class="tabcols c2"><div><h3>装備中</h3><div class="panelbox">${me.weapon ? this.weaponCard(me.weapon) : '武器なし'}</div><h3>持っている武器 <span>${items.length}</span></h3>${this.grid(items)}
      ${sel ? `<h3>選択中</h3><div class="panelbox">${this.weaponCard(sel, me.weapon)}<div class="acts"><button data-act="use" class="primary">装備する</button><button data-act="sell">売る（${SELL[sel.rarity]}）</button><button data-act="drop">足元に置く</button></div></div>` : ''}</div>
      <div><h3>武器の合成</h3><p class="muted small">コモン 5 本 → アンコモン 4 本 → レア 3 本 → エピック 2 本 → レジェンド 2 本 → <span style="color:${RARITY[5].color}">神話</span> 5 本 → <span style="color:${RARITY[6].color}">唯一</span>。唯一の武器は武器種ごとに 1 振りだけで、攻撃の仕組みが変わります。</p>${fuse}</div></div>`;
  }

  tabGear() {
    const me = this.g.me, items = me.inventory.filter((i) => i.cat === 'gear');
    const sel = items.find((x) => x.id === this.sel);
    if (JOBS[me.job].noEquip) { const sel0 = items.find((x) => x.id === this.sel); return `<div class="panelbox"><p>召喚師は防具を装備できません。拾った防具は売ってコインにするか、相方に渡せます。</p></div><h3>持っている防具 <span>${items.length}</span></h3>${this.grid(items)}${sel0 ? `<div class="panelbox" style="margin-top:12px">${this.gearCard(sel0)}<div class="acts"><button data-act="sell">売る（${SELL[sel0.rarity]}）</button><button data-act="drop">足元に置く</button></div></div>` : ''}`; }
    const eqSel = Object.values(me.gear).find((x) => x && x.id === this.sel);
    const counts = {};
    for (const it of items) if (it.rarity < GEAR_TOP) counts[it.rarity] = (counts[it.rarity] || 0) + 1;
    const gfuse = Object.keys(counts).map(Number).sort((a, b) => a - b).map((r) => `<div class="fuse"><div><span style="color:${RARITY[r].color}">${RARITY[r].name}</span> の防具 <b>${counts[r]}</b> / ${FUSE_COST[r]}<small>→ <span style="color:${RARITY[r + 1].color}">${RARITY[r + 1].name}</span>（部位とセットはランダム）</small></div><button data-act="gfuse" data-r="${r}" ${counts[r] >= FUSE_COST[r] ? '' : 'disabled'}>合成</button></div>`).join('') || '<p class="muted small">同じレアリティの防具を集めると合成できます。部位が違っていても構いません。</p>';
    const slots = Object.keys(GEAR_SLOTS).map((k) => { const it = me.gear[k]; return `<div class="gslot ${it && it.id === this.sel ? 'sel' : ''}" ${it ? `data-gear="${k}"` : ''} style="${it ? `border-color:${RARITY[it.rarity].color}` : ''}">${it ? `<img src="${itemIcon(it, 48)}">` : ''}<span>${GEAR_SLOTS[k].name}</span></div>`; }).join('');
    let detail = '';
    if (sel) detail = `<h3>選択中</h3><div class="panelbox">${this.gearCard(sel, me.gear[sel.slot])}<div class="acts"><button data-act="use" class="primary">装備する</button><button data-act="sell">売る（${SELL[sel.rarity]}）</button><button data-act="drop">足元に置く</button></div></div>`;
    else if (eqSel) detail = `<h3>装備中</h3><div class="panelbox">${this.gearCard(eqSel)}<div class="acts"><button data-act="unequip" data-slot="${eqSel.slot}">外す</button></div></div>`;
    return `<div class="tabcols c2"><div><h3>装備（5 か所）</h3><div class="slotrow">${slots}</div><h3>持っている防具 <span>${items.length}</span></h3>${this.grid(items)}${detail}</div><div><h3>防具の合成</h3>${gfuse}<h3>セット効果</h3>${this.setsHtml(false)}</div></div>`;
  }

  tabSkill() {
    const g = this.g, me = g.me, lv = skillLevels(me), scrolls = me.inventory.filter((i) => i.cat === 'skill');
    const sel = scrolls.find((x) => x.id === this.sel);
    const slots = me.slots.map((id, i) => `<div class="sks"><kbd>${SK_KEYS[i]}</kbd>${id && lv[id] ? `<img src="${skillIconURL(id, 48)}">${SKILLS[id].name}` : '<div style="height:44px"></div><span class="muted">空き</span>'}</div>`).join('');
    const list = Object.keys(lv).map((id) => { const S = SKILLS[id], pw = skillPower(id, lv[id], me.stats); return `<div class="skill" style="--col:${S.color}"><img src="${skillIconURL(id, 48)}"><div class="sbody"><div class="sname">${S.name} <span>Lv ${lv[id]}</span> ${this.affTag(id)}</div><div class="sdesc">${S.desc(pw)}</div><div class="muted">再使用 ${pw.cd} 秒${S.aim === 'enemy' ? ' · 近くの敵を自動で狙う' : ''}</div></div><div class="sbtns four">${SK_KEYS.map((k, s) => `<button data-act="assign" data-skill="${id}" data-slot="${s}" class="${me.slots[s] === id ? 'on' : ''}">${k}</button>`).join('')}</div></div>`; }).join('');
    let detail = '';
    if (sel) { const cur = me.skills[sel.skill] || 0, pw = skillPower(sel.skill, Math.min(5, cur + (sel.gain || 1)), me.stats); detail = `<div class="panelbox" style="margin-top:12px"><div class="sname">${esc(sel.name)} ${this.affTag(sel.skill)}</div><p class="sdesc">${SKILLS[sel.skill].desc(pw)}</p><div class="acts"><button data-act="use" class="primary" ${cur >= 5 ? 'disabled' : ''}>${cur ? 'レベルを上げる' : '習得する'}</button><button data-act="drop">足元に置く</button></div></div>`; }
    return `<div class="tabcols c2"><div><h3>セット中</h3><div class="skillslots">${slots}</div><h3>使えるスキル</h3>${list || '<p class="muted small">なし</p>'}</div><div><h3>持っている巻物 <span>${scrolls.length}</span></h3>${this.grid(scrolls)}${detail}<p class="muted small" style="margin-top:12px">${JOBS[me.job].noEquip ? '召喚師は召喚のスキルしか使えません。拾った巻物は手にした時に召喚の巻物へ変わります。' : `巻物はマップで拾えます。ジョブに向いたスキルは効果 +25%、向かないスキルは効果 -50% です。得意：${AFFINITY[me.job].good.map((i) => SKILLS[i].name).join('、')}。不得意：${AFFINITY[me.job].bad.map((i) => SKILLS[i].name).join('、')}。`}ツリー専用のスキルは「スキルツリー」で覚えます。</p></div></div>`;
  }

  affTag(id) {
    const a = affinityOf(id, this.g.me.job);
    return a ? `<em class="aff ${a > 0 ? 'good' : 'bad'}">${affinityLabel(id, this.g.me.job)}</em>` : '';
  }

  nodeHtml(n) {
    const me = this.g.me, lv = me.tree[n.id] || 0, st = nodeState(me, n);
    let name, desc, icon;
    if (n.kind === 'active') {
      const S = SKILLS[n.skill];
      name = S.name; desc = `${S.desc(skillPower(n.skill, Math.max(1, Math.min(5, lv + 1)), me.stats))}（再使用 ${S.cd} 秒）`;
      icon = `<img src="${skillIconURL(n.skill, 48)}">`;
    } else {
      const fmt = Object.entries(n.per).map(([k, v]) => `${STAT_INFO[k][0]} ${STAT_INFO[k][1](v)}`).join('、');
      name = n.name; desc = `${n.desc}（1 レベルごとに ${fmt}）`;
      icon = '<div class="pass">常時</div>';
    }
    return `<div class="node">${icon}<div><b>${name}<span>Lv ${lv} / ${n.max}</span></b><small>${desc}</small>${st.ok || lv >= n.max ? '' : `<small class="muted">${st.why}</small>`}</div><button data-act="learn" data-node="${n.id}" ${st.ok ? '' : 'disabled'}>+</button></div>`;
  }

  tabTree() {
    const me = this.g.me, J = JOBS[me.job];
    const spent = Object.values(me.tree).reduce((a, b) => a + b, 0);
    const canReset = spent > 0 && me.sp + spent >= RESET_COST;
    return `<div class="treewrap"><div class="treetop"><div class="sp">スキルポイント ${me.sp}</div><div class="grow muted small">${J.name}のスキルツリー。${J.branches.length} つの大分岐から 1 つ、さらに ${me.oni ? 3 : 2} つの最終ジョブから 1 つを選びます${me.oni ? '（鬼だけの 6 分岐）' : ''}。選び直すにはリセット（${RESET_COST} ポイント消費、残りは返還）。ポイントは強敵・宝箱・ボス・謎解きで手に入ります。</div><button data-act="reset" ${canReset ? '' : 'disabled'}>リセット</button></div>
      ${this.nodeHtml(J.root)}
      <div class="branches">${J.branches.map((b, i) => `<div class="branch ${me.branch === i ? 'chosen' : me.branch != null ? 'locked' : ''}"><h4>${b.name}</h4><p>${b.desc}</p>${b.nodes.map((n) => this.nodeHtml(n)).join('')}
        <div class="subs">${b.subs.map((f, k) => (f.oni && !me.oni ? '' : `<div class="branch sub ${me.branch === i && me.sub === k ? 'chosen' : me.branch === i && me.sub != null ? 'locked' : ''}"><h4>${f.name}</h4><p>${f.desc}</p>${f.nodes.map((n) => this.nodeHtml(n)).join('')}</div>`)).join('')}</div></div>`).join('')}</div></div>`;
  }

  onCharClick(e) {
    const g = this.g, me = g.me;
    const cell = e.target.closest('[data-id]');
    if (cell) { this.sel = cell.dataset.id; sfx('ui'); this.renderChar(); return; }
    const gs = e.target.closest('[data-gear]');
    if (gs) { this.sel = me.gear[gs.dataset.gear].id; sfx('ui'); this.renderChar(); return; }
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'use') this.useItem(this.sel);
    else if (act === 'drop') this.dropSel();
    else if (act === 'assign') this.assign(b.dataset.skill, +b.dataset.slot);
    else if (act === 'unequip') {
      const it = me.gear[b.dataset.slot];
      me.gear[b.dataset.slot] = null; me.inventory.push(it); this.sel = null;
      g.refreshStats(); sfx('ui'); this.renderChar();
    } else if (act === 'fuse') this.fuse(b.dataset.k);
    else if (act === 'gfuse') this.fuseArmor(+b.dataset.r);
    else if (act === 'sell') this.sellSel();
    else if (act === 'hatch') this.hatch(b.dataset.id);
    else if (act === 'pet') this.setPet(b.dataset.id);
    else if (act === 'learn') this.learn(b.dataset.node);
    else if (act === 'reset') this.resetTree();
  }

  fuse(k) {
    const me = this.g.me, [base, r] = k.split('|'), rar = +r;
    if (rar === 5 && [me.weapon, ...me.inventory].some((i) => i && i.base === base && i.rarity === 6)) return;
    const list = me.inventory.filter((i) => i.cat === 'weapon' && i.base === base && i.rarity === rar).sort((a, b) => b.dmg - a.dmg).slice(0, FUSE_COST[rar]);
    if (list.length < FUSE_COST[rar]) return;
    me.inventory = me.inventory.filter((i) => !list.includes(i));
    const it = fuseWeapons(list);
    me.inventory.push(it);
    this.sel = it.id;
    sfx('rare');
    this.toast(`合成成功！ ${RARITY[it.rarity].name}「${it.name}」`, RARITY[it.rarity].color, it);
    if (it.rarity >= 5) this.g.fx('fireworks', { x: Math.round(me.x), y: Math.round(me.y) });
    this.renderChar();
  }

  fuseArmor(r) {
    const g = this.g, me = g.me, need = FUSE_COST[r];
    const list = me.inventory.filter((i) => i.cat === 'gear' && i.rarity === r).slice(0, need);
    if (list.length < need || r >= GEAR_TOP) return;
    me.inventory = me.inventory.filter((i) => !list.includes(i));
    const it = fuseGear(list, g.floor);
    me.inventory.push(it);
    this.sel = it.id;
    sfx('rare');
    this.toast(`合成成功！ ${RARITY[it.rarity].name}「${it.name}」`, RARITY[it.rarity].color, it);
    this.renderChar();
  }

  sellSel() {
    const me = this.g.me, i = me.inventory.findIndex((x) => x.id === this.sel);
    if (i < 0) return;
    const [it] = me.inventory.splice(i, 1);
    me.coins += SELL[it.rarity || 0];
    this.sel = null;
    sfx('pick');
    this.toast(`「${it.name}」を売った（+${SELL[it.rarity || 0]}）`, '#ffd860');
    this.renderChar();
  }

  // ---------- ペット ----------
  tabPet() {
    const g = this.g, me = g.me, eggs = me.inventory.filter((i) => i.cat === 'egg');
    const cards = me.pets.map((p) => {
      const S = PETS[p.sp], E = ELEMENTS[p.el], on = me.petId === p.id;
      return `<div class="petcard ${on ? 'on' : ''}"><img src="${petIcon(p.sp, p.el)}"><div><div class="wname" style="color:${E.color}">${esc(p.name)} <span class="muted">Lv ${p.lvl}</span></div>
        <dl class="stats"><dt>種族</dt><dd>${S.name}</dd><dt>属性</dt><dd style="color:${E.color}">${E.name}（${E.desc}）</dd><dt>攻撃力</dt><dd>${petDamage(p, g.floor)}</dd><dt>攻撃間隔</dt><dd>${S.rate} 秒</dd><dt>戦い方</dt><dd>${S.range ? '遠くから撃つ' : '接近して戦う'}${S.fly ? '・飛行' : ''}</dd></dl>
        <div class="affix">◆ スキル「${S.skill.name}」：${S.skill.desc}</div><div class="acts"><button data-act="pet" data-id="${p.id}" class="${on ? '' : 'primary'}">${on ? '休ませる' : 'お供にする'}</button></div></div></div>`;
    }).join('');
    return `<div class="tabcols c2"><div><h3>ペット <span>${me.pets.length}</span></h3>${cards || '<p class="muted small">まだペットはいません。商人の特別コーナーや隠し部屋で卵を手に入れて孵しましょう。</p>'}</div>
      <div><h3>卵 <span>${eggs.length}</span></h3>${eggs.map((e) => `<div class="fuse"><img src="${itemIcon(e, 48)}"><div>${esc(e.name)}<small>孵すまで中身は分かりません</small></div><button data-act="hatch" data-id="${e.id}">孵す</button></div>`).join('') || '<p class="muted small">卵はありません。</p>'}
      <p class="muted small" style="margin-top:12px">お供のペットは一緒に戦い、階層を進むとレベルが上がります。種族が戦い方とスキルを、属性が色と追加効果を決めます。</p></div></div>`;
  }
  hatch(id) {
    const g = this.g, me = g.me, i = me.inventory.findIndex((x) => x.id === id);
    if (i < 0) return;
    me.inventory.splice(i, 1);
    this.toggleChar(false);
    g.fx('pfx', { n: 'eggHatch', x: Math.round(me.x + 30), y: Math.round(me.y) });
    sfx('rare');
    setTimeout(() => {
      if (!g.running) return;
      const pet = hatchPet();
      me.pets.push(pet);
      me.petId = pet.id;
      g.sendCompanion();
      sfx('level');
      this.toast(`卵から ${pet.name} が生まれた！`, ELEMENTS[pet.el].color);
    }, 2800);
  }
  setPet(id) {
    const g = this.g, me = g.me;
    me.petId = me.petId === id ? null : id;
    g.sendCompanion();
    sfx('ui');
    this.renderChar();
  }

  // ---------- 商人 ----------
  openShop() {
    const g = this.g, m = g.map;
    if (!m.shop) m.shop = shopStock(g.floor, g.me.job, g.diff);
    this.shopOpen = true;
    $('shop').classList.remove('hidden');
    this.renderShop();
    sfx('ui');
  }
  closeShop() { this.shopOpen = false; $('shop').classList.add('hidden'); }
  renderShop() {
    const g = this.g, me = g.me, S = g.map.shop, noEq = JOBS[me.job].noEquip;
    $('shopCoins').textContent = `所持コイン ${me.coins}`;
    const row = (x, i) => {
      const it = x.it, blocked = noEq && it.cat !== 'skill';
      const sub = it.cat === 'weapon' ? `${WEAPONS[it.base].name} · 攻撃 ${it.dmg}` : it.cat === 'gear' ? `${GEAR_SLOTS[it.slot].name}${it.set ? ` · ${SETS[it.set].name}` : ''}` : affinityLabel(it.skill, me.job) || 'スキルの巻物';
      return `<div class="shopitem ${x.sold ? 'bought' : ''}"><img src="${itemIcon(it, 48)}"><div><span style="color:${RARITY[it.rarity].color}">${esc(it.name)}</span><small>${sub}</small></div><button data-buy="${i}" ${x.sold || blocked || me.coins < x.price ? 'disabled' : ''}>${x.sold ? '売約済' : blocked ? '装備不可' : `${x.price} 枚`}</button></div>`;
    };
    const spec = S.special.map((x, i) => `<div class="shopitem ${x.sold ? 'bought' : ''}"><img src="${itemIcon(x.give === 'egg' ? makeEgg() : { cat: 'weapon', base: 'sword', rarity: 4 }, 48)}"><div>${x.give === 'egg' ? '謎の卵' : '<span style="color:' + RARITY[4].color + '">レジェンドの武器</span>'}<small>代償：${esc(x.curse.name)}（${esc(x.curse.desc)}。ずっと続く）</small></div><button data-spec="${i}" ${x.sold || (x.give !== 'egg' && noEq) ? 'disabled' : ''}>${x.sold ? '済' : '交換'}</button></div>`).join('');
    $('shopBody').innerHTML = `<h3>品物</h3><div class="shopgrid">${S.list.map(row).join('')}</div><h3>特別コーナー</h3><p class="muted small">コインでは買えません。自分に呪いをかけて交換します。</p><div class="shopgrid">${spec}</div>`;
  }
  onShopClick(e) {
    const g = this.g, me = g.me, S = g.map.shop;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.buy != null) {
      const x = S.list[+b.dataset.buy];
      if (x.sold || me.coins < x.price) return;
      me.coins -= x.price; x.sold = true;
      g.receiveItem(x.it);
    } else if (b.dataset.spec != null) {
      const x = S.special[+b.dataset.spec];
      if (x.sold || !confirm(`${x.curse.name}（${x.curse.desc}）を受けて交換しますか？\n呪いは解けません。`)) return;
      x.sold = true;
      me.curses.push({ name: x.curse.name, desc: x.curse.desc, s: x.curse.s });
      g.refreshStats();
      g.pix.vfx('pfx', { n: 'curse', x: me.x, y: me.y });
      g.receiveItem(x.give === 'egg' ? makeEgg() : rollLegendWeapon(g.floor));
    }
    this.renderShop();
  }

  learn(id) {
    const g = this.g, me = g.me, J = JOBS[me.job];
    const n = allNodes(me.job).find((x) => x.id === id);
    if (!nodeState(me, n).ok) return;
    const { bi, si } = locate(me.job, n);
    me.sp--;
    me.tree[id] = (me.tree[id] || 0) + 1;
    if (bi != null) me.branch = bi;
    if (si != null) {
      if (me.sub == null) this.toast(`最終ジョブ「${J.branches[bi].subs[si].name}」を選んだ！`, J.color);
      me.sub = si;
    }
    if (n.kind === 'active' && !me.slots.includes(n.skill)) { const free = me.slots.indexOf(null); if (free >= 0) me.slots[free] = n.skill; }
    g.refreshStats();
    sfx('level');
    this.renderChar();
  }

  resetTree() {
    const g = this.g, me = g.me;
    const spent = Object.values(me.tree).reduce((a, b) => a + b, 0);
    if (spent <= 0 || me.sp + spent < RESET_COST) return;
    me.sp = me.sp + spent - RESET_COST;
    me.tree = {}; me.branch = null; me.sub = null;
    const lv = skillLevels(me);
    me.slots = me.slots.map((id) => (id && lv[id] ? id : null));
    g.refreshStats();
    sfx('ui');
    this.toast(`ツリーをリセットした（${RESET_COST} ポイント消費）`, '#c9c2b2');
    this.renderChar();
  }

  useItem(id) {
    const g = this.g, me = g.me;
    const i = me.inventory.findIndex((x) => x.id === id);
    if (i < 0) return;
    const it = me.inventory[i];
    if (it.cat === 'egg') { this.hatch(id); return; }
    if (JOBS[me.job].noEquip && (it.cat === 'weapon' || it.cat === 'gear')) { this.toast('召喚師は装備できません', '#ff8a6a'); return; }
    if (it.cat === 'weapon') {
      me.inventory.splice(i, 1);
      if (me.weapon) me.inventory.push(me.weapon);
      me.weapon = it; me.atkCd = 0.2; this.sel = null;
      sfx('pick');
      this.toast(`「${it.name}」を装備した`, RARITY[it.rarity].color, it);
    } else if (it.cat === 'gear') {
      me.inventory.splice(i, 1);
      if (me.gear[it.slot]) me.inventory.push(me.gear[it.slot]);
      me.gear[it.slot] = it; this.sel = null;
      g.refreshStats();
      sfx('pick');
      this.toast(`「${it.name}」を装備した`, RARITY[it.rarity].color, it);
    } else if (it.cat === 'skill') {
      const cur = me.skills[it.skill] || 0;
      if (cur >= 5) { this.toast('このスキルはすでに最大レベルです', '#ff8a6a'); return; }
      me.inventory.splice(i, 1);
      me.skills[it.skill] = Math.min(5, cur + (it.gain || 1));
      if (!me.slots.includes(it.skill)) { const free = me.slots.indexOf(null); if (free >= 0) me.slots[free] = it.skill; }
      this.sel = null;
      sfx('level');
      this.toast(cur ? `「${SKILLS[it.skill].name}」が Lv ${me.skills[it.skill]} になった` : `「${SKILLS[it.skill].name}」を習得した！`, SKILLS[it.skill].color);
    }
    this.renderChar();
  }

  dropSel() {
    const me = this.g.me;
    const i = me.inventory.findIndex((x) => x.id === this.sel);
    if (i < 0) return;
    const [it] = me.inventory.splice(i, 1);
    this.g.dropItem(it);
    this.sel = null;
    this.toast(`「${it.name}」を足元に置いた（相方も拾えます）`, '#c9c2b2');
    this.renderChar();
  }

  assign(skill, slot) {
    const me = this.g.me;
    const other = me.slots.indexOf(skill);
    if (other >= 0) me.slots[other] = me.slots[slot];
    me.slots[slot] = skill;
    sfx('ui');
    this.renderChar();
  }

  drawPortrait() {
    const c = this.pc;
    if (!c) return;
    const cv = c.canvas;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const g = c.createRadialGradient(cv.width * 0.45, cv.height * 0.6, 4, cv.width * 0.45, cv.height * 0.6, cv.width * 0.6);
    g.addColorStop(0, 'rgba(255,170,90,.28)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
    drawPortrait(c, this.g.me, this.t, 4, cv.width * 0.42, cv.height * 0.88);
  }
}
