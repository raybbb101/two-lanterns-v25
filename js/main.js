import { Game } from './game.js';
import { Net } from './net.js';
import { initAudio } from './audio.js';
import { drawPortrait } from './icons.js';
import { makeWeapon, DIFFS, DIFF_KEYS } from './data.js';
import { JOBS, JOB_KEYS } from './jobs.js';
import { loadSave, writeSave, deleteSave, exportSave, importSave } from './save.js';
import { rand, TAU } from './util.js';

const $ = (id) => document.getElementById(id);
let game = null;
let titleRun = true;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 無視 */ } },
};

$('nameInput').value = store.get('ftn25-name') || '';
const playerName = () => {
  const n = $('nameInput').value.trim().slice(0, 10) || '旅人';
  store.set('ftn25-name', n);
  return n;
};
const status = (msg, err) => { const s = $('titleStatus'); s.textContent = msg; s.classList.toggle('err', !!err); };
const busy = (on) => document.querySelectorAll('#title button').forEach((b) => (b.disabled = on));

function start(mode, net, code) {
  titleRun = false;
  game = new Game($('game'), { mode, net, code, name: playerName(), job: selJob, diff: selDiff, onExit: exitToTitle });
  window.__game = game;
}

function exitToTitle() {
  if (game) { game.destroy(); game = null; }
  $('title').classList.remove('hidden');
  busy(false);
  status('');
  showSave();
  titleRun = true;
  requestAnimationFrame(titleLoop);
}

$('btnSolo').onclick = () => { initAudio(); start('solo'); };
$('btnHost').onclick = () => {
  initAudio();
  busy(true);
  status('ルームを作成しています…');
  const net = new Net();
  net.host((code) => start('host', net, code), (err) => { status(err, true); busy(false); net.destroy(); });
};
const join = () => {
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length < 4) { status('ルームコードを入力してください', true); return; }
  initAudio();
  busy(true);
  status('ルームに接続しています…');
  const net = new Net();
  net.join(code, () => start('guest', net, code), (err) => { status(err, true); busy(false); net.destroy(); });
};
$('btnJoin').onclick = join;
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
$('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

// URL に ?room=XXXXX があれば入力しておく
// 難易度の選択
let selDiff = DIFF_KEYS.includes(store.get('ftn25-diff')) ? store.get('ftn25-diff') : 'normal';
$('diffPick').innerHTML = DIFF_KEYS.map((k) => `<button type="button" data-diff="${k}" style="--col:${DIFFS[k].color}">${DIFFS[k].name}</button>`).join('');
const pickDiff = (k) => {
  selDiff = k;
  store.set('ftn25-diff', k);
  document.querySelectorAll('#diffPick button').forEach((b) => b.classList.toggle('on', b.dataset.diff === k));
  $('diffDesc').textContent = DIFFS[k].desc;
  showSave();
};
document.querySelectorAll('#diffPick button').forEach((b) => { b.onclick = () => pickDiff(b.dataset.diff); });
// ジョブの選択
let selJob = JOB_KEYS.includes(store.get('ftn25-job')) ? store.get('ftn25-job') : 'knight';
const pickJob = (j) => {
  selJob = j;
  store.set('ftn25-job', j);
  document.querySelectorAll('#jobPick button').forEach((b) => b.classList.toggle('on', b.dataset.job === j));
  $('jobDesc').textContent = JOBS[j].desc;
  showSave();
  if (heroes) { heroes[0].job = j; heroes[0].weapon = JOBS[j].weapon ? makeWeapon(JOBS[j].weapon, 2, 1) : null; }
};
let heroes = null;
function showSave() {
  const sv = loadSave(selJob, selDiff);
  $('saveInfo').textContent = sv ? `続きから：Lv ${sv.lvl} ・ 第 ${sv.floor} 層` : 'はじめから';
  $('saveInfo').classList.toggle('has', !!sv);
  $('btnReset').classList.toggle('hidden', !sv);
  $('btnExport').classList.toggle('hidden', !sv);
  document.querySelectorAll('#jobPick button').forEach((b) => {
    const s = loadSave(b.dataset.job, selDiff), tag = b.querySelector('.lv');
    if (tag) tag.textContent = s ? `Lv ${s.lvl}` : '';
  });
}
$('btnReset').onclick = () => {
  if (!confirm(`${JOBS[selJob].name}（${DIFFS[selDiff].name}）の保存データを消して、最初からにしますか？\n元には戻せません。`)) return;
  deleteSave(selJob, selDiff);
  showSave();
};
$('btnExport').onclick = async () => {
  const code = exportSave(loadSave(selJob, selDiff));
  try { await navigator.clipboard.writeText(code); status('保存データをコピーしました。メモなどに貼って残せます。'); }
  catch (e) { prompt('この文字列をコピーして残してください', code); }
};
$('btnImport').onclick = () => {
  const text = prompt('書き出した保存データを貼り付けてください');
  if (!text) return;
  const d = importSave(text);
  if (!d) { status('保存データを読み込めませんでした', true); return; }
  if (loadSave(d.job, selDiff) && !confirm(`今ある${JOBS[d.job].name}（${DIFFS[selDiff].name}）の保存データを上書きしますか？`)) return;
  writeSave(d, selDiff);
  pickJob(d.job);
  status(`${JOBS[d.job].name}の保存データを「${DIFFS[selDiff].name}」に読み込みました`);
};
const qp = new URLSearchParams(location.search).get('room');
if (qp) $('codeInput').value = qp.toUpperCase();

// ---------- タイトルの一枚絵 ----------
const tc = $('titleArt');
const tcx = tc.getContext('2d');
heroes = [
  { job: selJob, weapon: JOBS[selJob].weapon ? makeWeapon(JOBS[selJob].weapon, 2, 1) : null, portraitAim: 0.3 },
  { job: selJob === 'ranger' ? 'knight' : 'ranger', weapon: makeWeapon(selJob === 'ranger' ? 'sword' : 'bow', 3, 1), portraitAim: Math.PI - 0.3 },
];
$('jobPick').innerHTML = JOB_KEYS.map((j) => `<button type="button" data-job="${j}"><canvas width="40" height="44"></canvas>${JOBS[j].name}<small class="lv"></small></button>`).join('');
document.querySelectorAll('#jobPick button').forEach((b) => {
  const j = b.dataset.job;
  drawPortrait(b.querySelector('canvas').getContext('2d'), { job: j, weapon: null }, 0, 1, 20, 42);
  b.onclick = () => pickJob(j);
});
pickJob(selJob);
pickDiff(selDiff);
const embers = Array.from({ length: 50 }, () => ({ x: rand(), y: rand(), s: rand(0.5, 1.6), v: rand(0.02, 0.06), p: rand(TAU) }));
const glow = (c, x, y, r, col, a) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col.replace(')', `,${a})`).replace('rgb', 'rgba')); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
};
let tt = 0, tl = performance.now();
function titleLoop(now) {
  if (!titleRun) return;
  const dt = Math.min(0.05, (now - tl) / 1000); tl = now; tt += dt;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = tc.clientWidth * dpr, H = tc.clientHeight * dpr;
  if (tc.width !== W || tc.height !== H) { tc.width = W; tc.height = H; }
  const c = tcx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  const k = Math.max(3, Math.floor(Math.min(W / 120, H / 70)));
  const cx = W / 2, cy = H * 0.8;
  c.globalCompositeOperation = 'lighter';
  glow(c, cx - 16 * k, cy - 16 * k, 60 * k, 'rgb(255,154,64)', 0.32 + Math.sin(tt * 3) * 0.02);
  glow(c, cx + 16 * k, cy - 16 * k, 60 * k, 'rgb(255,192,112)', 0.28 + Math.sin(tt * 2.6 + 1) * 0.02);
  c.globalCompositeOperation = 'source-over';
  drawPortrait(c, heroes[0], tt, k, cx - 18 * k, cy);
  drawPortrait(c, heroes[1], tt + 1.3, k, cx + 18 * k, cy);
  c.globalCompositeOperation = 'lighter';
  for (const e of embers) {
    e.y -= e.v * dt; e.p += dt;
    if (e.y < -0.05) { e.y = 1.05; e.x = rand(); }
    const s = Math.max(1, Math.round(k * 0.6 * e.s));
    c.fillStyle = `rgba(255,176,96,${0.5 + Math.sin(e.p * 3) * 0.3})`;
    c.fillRect(Math.round((e.x + Math.sin(e.p) * 0.01) * W / s) * s, Math.round(e.y * H / s) * s, s, s);
  }
  c.globalCompositeOperation = 'source-over';
  requestAnimationFrame(titleLoop);
}
requestAnimationFrame(titleLoop);
