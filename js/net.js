// P2P networking via PeerJS (free public signalling server, no backend needed).
const PREFIX = 'kvach-runes-v1-';
const OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  },
};
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const randCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

export function netAvailable() { return typeof window.Peer === 'function'; }

export function hostRoom({ onReady, onConn, onError }) {
  let tries = 0;
  const attempt = () => {
    const code = randCode();
    const peer = new window.Peer(PREFIX + code, OPTS);
    peer.on('open', () => onReady(code, peer));
    peer.on('connection', c => onConn(c));
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); }
      else onError(e);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
  };
  attempt();
}

export function joinRoom(code, { onOpen, onData, onClose, onError }) {
  const peer = new window.Peer(undefined, OPTS);
  let opened = false;
  const timer = setTimeout(() => { if (!opened) onError({ type: 'timeout' }); }, 15000);
  peer.on('open', () => {
    const c = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
    c.on('open', () => { opened = true; clearTimeout(timer); onOpen(c, peer); });
    c.on('data', onData);
    c.on('close', onClose);
    c.on('error', onError);
  });
  peer.on('error', e => { clearTimeout(timer); onError(e); });
  return peer;
}
