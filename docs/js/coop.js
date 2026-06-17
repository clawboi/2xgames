// coop.js — WebRTC P2P coop via PeerJS. Supports up to 4 players (1 host + 3 guests).
// Architecture: HOST runs the authoritative sim and broadcasts to all guests.
//               GUESTS send inputs (only their own) and render received state.
// Each guest gets assigned a slot 1/2/3 (host is slot 0).

const Coop = (() => {
  let peer = null;
  // HOST: array of { conn, slot, ready, customization }
  // GUEST: single { conn, slot, ready, customization } in [0]
  const connections = [];
  let mode = null; // 'host' | 'guest' | null
  let roomCode = null;
  let mySlot = null; // 0 for host, 1-3 for guests
  let onMessageCb = null;
  let onConnectCb = null;
  let onDisconnectCb = null;

  function genCode() {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
    return s;
  }

  function attachConn(c, slot) {
    const info = { conn: c, slot, ready: false, customization: null, difficulty: 'normal' };
    connections.push(info);
    c.on('open', () => {
      if (onConnectCb) onConnectCb(slot, connections.length);
    });
    c.on('data', (msg) => {
      if (onMessageCb) {
        try { onMessageCb(msg, slot); } catch (e) { console.error('coop msg', e); }
      }
    });
    c.on('close', () => {
      const idx = connections.indexOf(info);
      if (idx >= 0) connections.splice(idx, 1);
      if (onDisconnectCb) onDisconnectCb(slot);
    });
    c.on('error', () => {});
  }

  function host(onCodeReady) {
    if (typeof Peer === 'undefined') {
      alert('Coop requires internet — please reload and try again');
      return;
    }
    mode = 'host';
    mySlot = 0;
    roomCode = genCode();
    const peerId = 'crabcage2x_' + roomCode;
    // PeerJS config with STUN + TURN fallback so cellular / symmetric NAT users can still connect
    const peerConfig = {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          // Free OpenRelay TURN — for users behind symmetric NAT (cellular, corporate)
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ]
      }
    };
    peer = new Peer(peerId, peerConfig);
    peer.on('open', () => { if (onCodeReady) onCodeReady(roomCode); });
    peer.on('connection', (c) => {
      // Reject if room is full (3 guests max)
      if (connections.length >= 3) {
        c.on('open', () => {
          try { c.send({ t: 'full', d: { reason: 'Room is full (4 players max)' } }); } catch (e) {}
          setTimeout(() => { try { c.close(); } catch (e) {} }, 200);
        });
        return;
      }
      const slot = connections.length + 1;
      attachConn(c, slot);
    });
    peer.on('error', (err) => {
      console.error('peer error', err);
      if (err.type === 'unavailable-id') {
        peer.destroy(); host(onCodeReady);
      } else {
        alert('Coop error: ' + err.type);
      }
    });
  }

  function join(code, onFailed) {
    if (typeof Peer === 'undefined') {
      alert('Coop requires internet — please reload and try again');
      if (onFailed) onFailed(); return;
    }
    mode = 'guest';
    roomCode = code.toUpperCase();
    const peerConfig = {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ]
      }
    };
    peer = new Peer(peerConfig);
    let joinTimeout = setTimeout(() => {
      alert('Connection timed out. Check the code or your internet connection.');
      try { peer.destroy(); } catch (e) {}
      if (onFailed) onFailed();
    }, 30000);
    peer.on('open', () => {
      const targetId = 'crabcage2x_' + roomCode;
      const c = peer.connect(targetId, { reliable: true });
      c.on('open', () => { clearTimeout(joinTimeout); });
      attachConn(c, 0);
    });
    peer.on('error', (err) => {
      clearTimeout(joinTimeout);
      console.error('peer error', err);
      if (err.type === 'peer-unavailable') alert('Room ' + roomCode + ' not found.');
      else alert('Connection error: ' + err.type);
      if (onFailed) onFailed();
    });
  }

  // Broadcast to ALL peers (host uses this for state sync)
  function broadcast(type, data) {
    if (connections.length === 0) return;
    const msg = { t: type, d: data };
    for (const ci of connections) {
      try { ci.conn.send(msg); } catch (e) {}
    }
  }

  // Send a message to a specific slot (host only — slot 1/2/3)
  function sendTo(slot, type, data) {
    const ci = connections.find(c => c.slot === slot);
    if (ci) { try { ci.conn.send({ t: type, d: data }); } catch (e) {} }
  }

  // For guest: send to host (the only connection)
  function send(type, data) {
    if (connections.length === 0) return;
    try { connections[0].conn.send({ t: type, d: data }); } catch (e) {}
  }

  function setReady(slot, ready) {
    const ci = connections.find(c => c.slot === slot);
    if (ci) ci.ready = ready;
  }

  function setCustomization(slot, cust, diff) {
    const ci = connections.find(c => c.slot === slot);
    if (ci) { ci.customization = cust; ci.difficulty = diff || ci.difficulty; }
  }

  function getConnections() { return connections.slice(); }

  function disconnect() {
    for (const ci of connections) { try { ci.conn.close(); } catch (e) {} }
    connections.length = 0;
    try { if (peer) peer.destroy(); } catch (e) {}
    peer = null; mode = null; roomCode = null; mySlot = null;
  }

  return {
    host, join, send, sendTo, broadcast, disconnect,
    onMessage: (cb) => { onMessageCb = cb; },
    onConnect: (cb) => { onConnectCb = cb; },
    onDisconnect: (cb) => { onDisconnectCb = cb; },
    isHost: () => mode === 'host',
    isGuest: () => mode === 'guest',
    isCoop:  () => mode !== null,
    isConnected: () => connections.length > 0,
    getCode: () => roomCode,
    getMySlot: () => mySlot,
    getConnections,
    setReady, setCustomization,
    getPlayerCount: () => (mode === 'host' ? connections.length + 1 : (connections.length > 0 ? 2 : 0)),
  };
})();
