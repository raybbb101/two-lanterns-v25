// PeerJS（WebRTC）で 2 人を直接つなぐ。サーバーは不要で GitHub Pages だけで動く。
const PREFIX = 'futatsunohi-v25-';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };

const errText = (err) => {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'そのルームが見つかりません。コードを確認してください。';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return '接続サーバーに届きません。ネットに接続されているか確認してください。';
  if (t === 'browser-incompatible') return 'このブラウザはオンライン対戦に対応していません。';
  return '接続エラー：' + (t || err);
};

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.handlers = {};
  }
  on(t, fn) { this.handlers[t] = fn; }
  emit(t, d) { const f = this.handlers[t]; if (f) f(d); }

  host(onReady, onErr) {
    if (!window.Peer) return onErr('PeerJS を読み込めませんでした。');
    let code = '';
    for (let i = 0; i < 5; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    this.peer = new window.Peer(PREFIX + code, { debug: 0, config: ICE });
    this.peer.on('open', () => onReady(code));
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') { this.peer.destroy(); this.host(onReady, onErr); }
      else onErr(errText(err));
    });
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* 無視 */ } });
    this.peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) {
        conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); });
        return;
      }
      this.attach(conn);
    });
  }

  join(code, onOk, onErr) {
    if (!window.Peer) return onErr('PeerJS を読み込めませんでした。');
    let done = false;
    const fail = (m) => { if (!done) { done = true; onErr(m); } };
    this.peer = new window.Peer({ debug: 0, config: ICE });
    this.peer.on('error', (err) => fail(errText(err)));
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true, serialization: 'json' });
      this.attach(conn);
      conn.on('open', () => { if (!done) { done = true; onOk(); } });
      setTimeout(() => fail('接続がタイムアウトしました。コードを確認するか、もう一度試してください。'), 12000);
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => this.emit('open'));
    conn.on('data', (d) => { if (d && d.t) this.emit(d.t, d); });
    conn.on('close', () => { if (this.conn === conn) { this.conn = null; this.emit('close'); } });
    conn.on('error', () => {});
  }

  get connected() { return !!(this.conn && this.conn.open); }
  send(m) { if (this.connected) this.conn.send(m); }
  destroy() { try { this.peer && this.peer.destroy(); } catch (e) { /* 無視 */ } }
}
