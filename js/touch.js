// スマホ・タブレット用のタッチ操作
// 左半分を指でなぞるとスティック、右下のボタンで攻撃・回避・スキル
const $ = (id) => document.getElementById(id);

export function isTouchDevice() {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return matchMedia('(hover: none) and (pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
}

// ---------- フルスクリーン ----------
export const isStandalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
export const canFullscreen = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (!isFullscreen()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (e) { /* 断られたら何もしない */ }
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* 対応していない端末 */ }
}

export async function toggleFullscreen() {
  if (!isFullscreen()) return enterFullscreen();
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) { /* 無視 */ }
}

// ボタンの置き場所：攻撃ボタンの中心から（右・下からの距離）
const AC = 70;          // 攻撃ボタンの中心（右下から）
const LAYOUT = {
  slotW: { r: 0, a: 0, size: 92 },
  slotD: { r: 96, a: 0, size: 60 },
  slotQ: { r: 166, a: 6, size: 58 },
  slotE: { r: 166, a: 34, size: 58 },
  slotR: { r: 166, a: 62, size: 58 },
  slotC: { r: 166, a: 90, size: 58 },
};

export class TouchControls {
  constructor(game) {
    this.g = game;
    this.vec = { x: 0, y: 0 };
    this.stick = null;
    this.handlers = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this.handlers.push([el, ev, fn, opt]); };

    // スティック
    const pad = $('touchPad'), base = $('stickBase'), knob = $('stickKnob');
    this.base = base; this.knob = knob;
    on(pad, 'pointerdown', (e) => {
      e.preventDefault();
      if (this.stick) return;
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`;
      base.classList.add('on');
      this.moveStick(e);
    });
    on(pad, 'pointermove', (e) => { if (this.stick && e.pointerId === this.stick.id) { e.preventDefault(); this.moveStick(e); } });
    const end = (e) => {
      if (!this.stick || e.pointerId !== this.stick.id) return;
      this.stick = null; this.vec.x = this.vec.y = 0;
      base.classList.remove('on');
      knob.style.transform = 'translate(-50%, -50%)';
    };
    on(pad, 'pointerup', end); on(pad, 'pointercancel', end); on(pad, 'lostpointercapture', end);

    // ボタン
    for (const id in LAYOUT) {
      const L = LAYOUT[id], el = $(id), rad = (L.a * Math.PI) / 180;
      const cr = AC + Math.cos(rad) * L.r, cb = AC + Math.sin(rad) * L.r;
      Object.assign(el.style, { right: `${cr - L.size / 2}px`, bottom: `${cb - L.size / 2}px`, width: `${L.size}px`, height: `${L.size}px` });
    }
    const m = game.mouse;
    const atk = $('slotW');
    const atkUp = (e) => { if (this.atkId === e.pointerId) { this.atkId = null; m.down = false; atk.classList.remove('press'); } };
    on(atk, 'pointerdown', (e) => {
      e.preventDefault();
      this.atkId = e.pointerId;
      try { atk.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      m.down = true; m.clicked = true; atk.classList.add('press');
    });
    on(atk, 'pointerup', atkUp); on(atk, 'pointercancel', atkUp); on(atk, 'lostpointercapture', atkUp);
    const tap = (id, key) => {
      const el = $(id);
      on(el, 'pointerdown', (e) => { e.preventDefault(); game.pressed.add(key); el.classList.add('press'); });
      const up = () => el.classList.remove('press');
      on(el, 'pointerup', up); on(el, 'pointercancel', up); on(el, 'pointerleave', up);
    };
    tap('slotD', ' '); tap('slotQ', 'q'); tap('slotE', 'e'); tap('slotR', 'r'); tap('slotC', 'c');
    on($('prompt'), 'pointerdown', (e) => { e.preventDefault(); game.pressed.add('f'); });

    // 体力の枠は階の表示のすぐ下に並べる（表示の行数が変わっても重ならないように）
    this.partyHome = $('party').parentNode;
    $('floorBox').appendChild($('party'));
    // 全画面ボタン
    const fs = $('btnFull');
    if (canFullscreen() && !isStandalone()) {
      fs.classList.remove('hidden');
      on(fs, 'click', () => toggleFullscreen());
    }
    // 長押しで出るメニューやスクロールを止める
    on($('hud'), 'contextmenu', (e) => e.preventDefault());
    on(document, 'touchmove', (e) => { if (!e.target.closest('.cpanel, .hpanel, #charBody, #shopBody')) e.preventDefault(); }, { passive: false });
  }

  moveStick(e) {
    const R = 56;
    let dx = e.clientX - this.stick.x, dy = e.clientY - this.stick.y;
    const d = Math.hypot(dx, dy);
    // 指が遠くへ行ったら、スティックの中心もついてくる
    if (d > R * 1.5) {
      const k = (d - R * 1.5) / d;
      this.stick.x += dx * k; this.stick.y += dy * k;
      this.base.style.left = `${this.stick.x}px`; this.base.style.top = `${this.stick.y}px`;
      dx = e.clientX - this.stick.x; dy = e.clientY - this.stick.y;
    }
    const dd = Math.hypot(dx, dy), cl = Math.min(dd, R);
    const nx = dd ? dx / dd : 0, ny = dd ? dy / dd : 0;
    this.knob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
    // 少しだけ傾けたときは無視、それ以上は全力で歩く
    const amt = dd < 8 ? 0 : Math.min(1, (dd - 8) / (R * 0.55));
    this.vec.x = nx * amt; this.vec.y = ny * amt;
  }

  destroy() {
    for (const [el, ev, fn, opt] of this.handlers) el.removeEventListener(ev, fn, opt);
    this.handlers = [];
    this.stick = null;
    this.base.classList.remove('on');
    if (this.partyHome) this.partyHome.appendChild($('party'));
  }
}
