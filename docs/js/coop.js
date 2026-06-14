// coop.js — WebRTC P2P coop via PeerJS. Free signaling, no server.
// Architecture: HOST runs the authoritative game sim and broadcasts entity state.
// GUEST sends inputs (move/fire/buy/etc) and renders what host sends.

const Coop = (() => {
  let peer = null;
  let conn = null;
  let mode = null; // 'host' | 'guest' | null
  let roomCode = null;
  let onMessageCb = null;
  let onConnectCb = null;
  let onDisconnectCb = null;
  let connected = false;

  function genCode() {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusable chars
    let s = '';
    for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
    return s;
  }

  function attachConn(c) {
    conn = c;
    c.on('open', () => {
      connected = true;
      if (onConnectCb) onConnectCb();
    });
    c.on('data', (msg) => {
      if (onMessageCb) {
        try { onMessageCb(msg); } catch (e) { console.error('coop msg err', e); }
      }
    });
    c.on('close', () => {
      connected = false;
      if (onDisconnectCb) onDisconnectCb();
    });
    c.on('error', (e) => { console.warn('coop conn err', e); });
  }

  function host(onCodeReady) {
    if (typeof Peer === 'undefined') {
      alert('Coop requires internet — PeerJS failed to load');
      return;
    }
    mode = 'host';
    roomCode = genCode();
    // Use a custom peer ID prefixed so guests can find us
    const peerId = 'crabcage2x_' + roomCode;
    peer = new Peer(peerId, { debug: 1 });
    peer.on('open', (id) => {
      if (onCodeReady) onCodeReady(roomCode);
    });
    peer.on('connection', (c) => {
      attachConn(c);
    });
    peer.on('error', (err) => {
      console.error('peer error', err);
      if (err.type === 'unavailable-id') {
        // Code collision — regenerate
        peer.destroy();
        host(onCodeReady);
      } else {
        alert('Coop error: ' + err.type);
      }
    });
  }

  function join(code, onJoined, onFailed) {
    if (typeof Peer === 'undefined') {
      alert('Coop requires internet — PeerJS failed to load');
      if (onFailed) onFailed();
      return;
    }
    mode = 'guest';
    roomCode = code.toUpperCase();
    peer = new Peer({ debug: 1 });
    peer.on('open', (id) => {
      const targetId = 'crabcage2x_' + roomCode;
      const c = peer.connect(targetId, { reliable: false });
      attachConn(c);
      // Track first onConnect for the joined callback
      const prevCb = onConnectCb;
      onConnectCb = () => {
        if (prevCb) prevCb();
        if (onJoined) onJoined();
      };
    });
    peer.on('error', (err) => {
      console.error('peer error', err);
      if (err.type === 'peer-unavailable') {
        alert('Room ' + roomCode + ' not found. Check the code.');
      } else {
        alert('Coop error: ' + err.type);
      }
      if (onFailed) onFailed();
    });
  }

  function send(type, data) {
    if (!conn || !connected) return;
    try { conn.send({ t: type, d: data }); } catch (e) {}
  }

  function disconnect() {
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conn = null; peer = null; mode = null; roomCode = null; connected = false;
  }

  return {
    host, join, send, disconnect,
    onMessage: (cb) => { onMessageCb = cb; },
    onConnect: (cb) => { onConnectCb = cb; },
    onDisconnect: (cb) => { onDisconnectCb = cb; },
    isHost: () => mode === 'host',
    isGuest: () => mode === 'guest',
    isCoop:  () => mode !== null,
    isConnected: () => connected,
    getCode: () => roomCode,
  };
})();
