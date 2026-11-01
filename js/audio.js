// すべての効果音は WebAudio でその場で合成（外部ファイル不要）
let AC = null, master = null, bus = null, noiseBuf = null;
let muted = false, vol = 1;

export function initAudio() {
  if (AC) {
    if (AC.state === 'suspended') AC.resume();
    return;
  }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain();
  master.gain.value = 0.6;
  master.connect(AC.destination);
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(master);
  bus = AC.createGain();
  bus.connect(comp);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startAmbience();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, AC.currentTime, 0.05);
  return muted;
}

function env(g, t0, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone({ f = 440, f2, type = 'sine', a = 0.004, d = 0.2, v = 0.3, delay = 0 }) {
  const t0 = AC.currentTime + delay;
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
  const g = AC.createGain();
  env(g, t0, a, v, d);
  o.connect(g).connect(bus);
  o.start(t0);
  o.stop(t0 + a + d + 0.05);
}

function noise({ a = 0.004, d = 0.2, v = 0.3, f = 1200, f2, type = 'bandpass', q = 1, delay = 0 }) {
  const t0 = AC.currentTime + delay;
  const s = AC.createBufferSource();
  s.buffer = noiseBuf;
  const flt = AC.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t0);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
  const g = AC.createGain();
  env(g, t0, a, v, d);
  s.connect(flt).connect(g).connect(bus);
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + a + d + 0.05);
}

const S = {
  swing() { noise({ d: 0.14, v: 0.22, f: 700, f2: 3200, q: 0.9 }); },
  heavy() { noise({ d: 0.3, v: 0.3, f: 300, f2: 1600, q: 0.7 }); },
  thrust() { noise({ d: 0.12, v: 0.22, f: 1600, f2: 600, q: 1.2 }); },
  bow() { tone({ f: 220, f2: 90, type: 'triangle', d: 0.12, v: 0.2 }); noise({ d: 0.1, v: 0.12, f: 3000, q: 2 }); },
  cast() { tone({ f: 500, f2: 900, type: 'sine', d: 0.18, v: 0.12 }); noise({ d: 0.2, v: 0.1, f: 2000, f2: 5000, q: 3 }); },
  hit() { tone({ f: 150, f2: 55, type: 'triangle', d: 0.12, v: 0.45 }); noise({ d: 0.07, v: 0.3, f: 2400, q: 0.6 }); },
  crit() { S.hit(); tone({ f: 1400, f2: 700, type: 'square', d: 0.07, v: 0.06 }); noise({ d: 0.12, v: 0.2, f: 5000, q: 2 }); },
  kill() { noise({ d: 0.4, v: 0.28, f: 900, f2: 120, q: 0.8 }); tone({ f: 260, f2: 70, type: 'sawtooth', d: 0.3, v: 0.05 }); },
  hurt() { tone({ f: 110, f2: 50, type: 'sawtooth', d: 0.2, v: 0.15 }); noise({ d: 0.18, v: 0.3, f: 500, q: 0.7 }); },
  dodge() { noise({ d: 0.2, v: 0.14, f: 400, f2: 1200, q: 0.5 }); },
  pick() { tone({ f: 880, type: 'triangle', d: 0.12, v: 0.12 }); tone({ f: 1320, type: 'triangle', d: 0.2, v: 0.1, delay: 0.07 }); },
  rare() { [660, 880, 1100, 1480].forEach((f, i) => tone({ f, type: 'triangle', d: 0.35, v: 0.09, delay: i * 0.06 })); },
  chest() { noise({ d: 0.3, v: 0.15, f: 250, f2: 500, q: 4 }); [523, 659, 784].forEach((f, i) => tone({ f, type: 'sine', d: 0.4, v: 0.1, delay: 0.15 + i * 0.07 })); },
  fire() { noise({ d: 0.35, v: 0.22, f: 500, f2: 2500, q: 0.6 }); },
  boom() { noise({ d: 0.6, v: 0.45, f: 900, f2: 60, type: 'lowpass', q: 0.5 }); tone({ f: 90, f2: 35, type: 'sine', d: 0.5, v: 0.4 }); },
  heal() { [523, 659, 784, 1046].forEach((f, i) => tone({ f, type: 'sine', d: 0.6, v: 0.08, delay: i * 0.08 })); },
  freeze() { noise({ d: 0.5, v: 0.2, f: 6000, f2: 2000, q: 4 }); tone({ f: 1800, f2: 900, type: 'sine', d: 0.4, v: 0.06 }); },
  zap() { noise({ d: 0.25, v: 0.3, f: 3500, q: 0.4 }); tone({ f: 120, type: 'square', d: 0.15, v: 0.05 }); },
  ward() { tone({ f: 330, f2: 660, type: 'sine', d: 0.5, v: 0.12 }); tone({ f: 495, f2: 990, type: 'sine', d: 0.5, v: 0.08 }); },
  slam() { noise({ d: 0.7, v: 0.55, f: 400, f2: 40, type: 'lowpass', q: 0.4 }); tone({ f: 60, f2: 30, type: 'sine', d: 0.6, v: 0.5 }); },
  level() { [392, 523, 659, 784, 1046].forEach((f, i) => tone({ f, type: 'triangle', d: 0.45, v: 0.1, delay: i * 0.07 })); },
  portal() { tone({ f: 200, f2: 800, type: 'sine', d: 1.2, v: 0.12 }); noise({ d: 1.2, v: 0.1, f: 300, f2: 3000, q: 2 }); },
  join() { [440, 660].forEach((f, i) => tone({ f, type: 'triangle', d: 0.3, v: 0.12, delay: i * 0.1 })); },
  squish() { noise({ d: 0.15, v: 0.18, f: 300, f2: 900, q: 3 }); },
  shriek() { tone({ f: 2400, f2: 1600, type: 'square', d: 0.12, v: 0.025 }); },
  ui() { tone({ f: 1000, type: 'sine', d: 0.05, v: 0.06 }); },
};

export function sfx(name, v = 1) {
  if (!AC || muted || !S[name] || v < 0.03) return;
  vol = Math.min(1, v);
  S[name]();
  vol = 1;
}

function startAmbience() {
  const g = AC.createGain();
  g.gain.value = 0.05;
  g.connect(master);
  const lp = AC.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  lp.connect(g);
  [55, 82.4, 110.3].forEach((f, i) => {
    const o = AC.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sine';
    o.frequency.value = f;
    o.detune.value = i * 4;
    const og = AC.createGain();
    og.gain.value = i === 2 ? 0.2 : 0.5;
    o.connect(og).connect(lp);
    o.start();
  });
  // 風のようなノイズ
  const n = AC.createBufferSource();
  n.buffer = noiseBuf;
  n.loop = true;
  const bp = AC.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 400;
  bp.Q.value = 1.5;
  const ng = AC.createGain();
  ng.gain.value = 0.35;
  n.connect(bp).connect(ng).connect(g);
  const lfo = AC.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = AC.createGain();
  lg.gain.value = 220;
  lfo.connect(lg).connect(bp.frequency);
  lfo.start();
  n.start();
}
