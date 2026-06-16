// HQ — chat lobby for FAMEUP.io
// Top-down room with character avatars walking + chat overlay
(function () {
  'use strict';

  const LOBBIES_KEY = 'fameup_hq_lobbies_v1';
  const W = 800, H = 500;
  let canvas, ctx;
  let raf = 0;
  let lastT = 0;
  let running = false;
  let currentLobby = null;
  let players = []; // array of HQPlayer
  let chatLog = []; // { name, text, system }
  let myPlayerIdx = 0;

  // Mock lobbies (in real version, fetched from backend)
  const MOCK_LOBBY_NAMES = ['MIXTAPE VIBES', 'AFTER HOURS', 'CHILL ZONE', '2X FANCLUB', 'RUFFY ROOM', 'STUDIO LOFT'];
  function loadLobbies() {
    try {
      const s = JSON.parse(localStorage.getItem(LOBBIES_KEY) || 'null');
      if (s) return s;
    } catch (e) {}
    // Generate some initial mock lobbies
    return MOCK_LOBBY_NAMES.slice(0, 3).map((name, i) => ({
      id: 'lobby_' + i + '_' + Date.now(),
      name,
      max: 8,
      count: 1 + Math.floor(Math.random() * 4),
    }));
  }
  function saveLobbies(list) {
    try { localStorage.setItem(LOBBIES_KEY, JSON.stringify(list)); } catch (e) {}
  }
  let lobbies = loadLobbies();

  // ============ HQ PLAYER ============
  class HQPlayer {
    constructor(x, y, cust, name, isMe) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.cust = cust;
      this.name = name;
      this.isMe = !!isMe;
      this.facing = 'down';
      this.frame = 0;
      this.emote = null;
      this.emoteUntil = 0;
      this.chatBubble = null;
      this.chatBubbleUntil = 0;
      this.idleTimer = 0;
      this.targetX = x; this.targetY = y;
    }
    setEmote(emoji) {
      this.emote = emoji;
      this.emoteUntil = performance.now() + 3500;
    }
    setChat(text) {
      this.chatBubble = text;
      this.chatBubbleUntil = performance.now() + 4500;
    }
    update(dt) {
      this.frame++;
      if (this.isMe) {
        // Player-controlled movement
        const inp = getHqInput();
        this.vx = inp.x * 2.2;
        this.vy = inp.y * 2.2;
        if (Math.abs(this.vx) > Math.abs(this.vy)) {
          this.facing = this.vx > 0 ? 'right' : (this.vx < 0 ? 'left' : this.facing);
        } else if (this.vy !== 0) {
          this.facing = this.vy > 0 ? 'down' : 'up';
        }
      } else {
        // AI wander
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          this.idleTimer = 1500 + Math.random() * 3500;
          if (Math.random() < 0.4) {
            // Move to a new spot
            this.targetX = 60 + Math.random() * (W - 120);
            this.targetY = 60 + Math.random() * (H - 220);
          }
        }
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
          this.vx = (dx / d) * 1.2;
          this.vy = (dy / d) * 1.2;
          if (Math.abs(this.vx) > Math.abs(this.vy)) this.facing = this.vx > 0 ? 'right' : 'left';
          else this.facing = this.vy > 0 ? 'down' : 'up';
        } else {
          this.vx = 0; this.vy = 0;
        }
        // Occasional random emote
        if (Math.random() < 0.0008) {
          const emojis = ['👋', '🕺', '💪', '😎', '🔥', '❤️'];
          this.setEmote(emojis[Math.floor(Math.random() * emojis.length)]);
        }
      }
      this.x += this.vx;
      this.y += this.vy;
      this.x = Math.max(20, Math.min(W - 20, this.x));
      this.y = Math.max(40, Math.min(H - 60, this.y));
    }
    draw(ctx) {
      try {
        Sprites.drawPlayer(ctx, this.x, this.y, this.cust, this.facing, this.frame);
      } catch (e) {
        ctx.fillStyle = '#ff0033';
        ctx.beginPath(); ctx.arc(this.x, this.y, 10, 0, Math.PI * 2); ctx.fill();
      }
      // Name above
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#000'; ctx.fillRect(this.x - 36, this.y - 30, 72, 14);
      ctx.fillStyle = this.isMe ? '#ff6677' : '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(this.name.slice(0, 12), this.x, this.y - 19);
      // Emote bubble
      const now = performance.now();
      if (this.emote && now < this.emoteUntil) {
        const bx = this.x; const by = this.y - 45;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '18px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(this.emote, bx, by);
        ctx.textBaseline = 'alphabetic';
      }
      // Chat bubble
      if (this.chatBubble && now < this.chatBubbleUntil) {
        const text = this.chatBubble;
        ctx.font = 'bold 10px monospace';
        const w = Math.min(180, ctx.measureText(text).width + 14);
        const bx = this.x; const by = this.y - 50;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillRect(bx - w / 2, by - 8, w, 18);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - w / 2, by - 8, w, 18);
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText(text.length > 20 ? text.slice(0, 18) + '…' : text, bx, by + 3);
      }
    }
  }

  // ============ INPUT ============
  const keys = {};
  let touchVec = { x: 0, y: 0, active: false };
  function attachInput() {
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    if (canvas) {
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    }
  }
  function detachInput() {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
    if (canvas) {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    }
  }
  function onKey(e) {
    // Don't capture keys when typing in chat
    if (document.activeElement && document.activeElement.id === 'hq-chat-input') return;
    keys[e.key.toLowerCase()] = true;
  }
  function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }
  let touchStart = { x: 0, y: 0 };
  function onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
    touchVec.active = true; touchVec.x = 0; touchVec.y = 0;
  }
  function onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const d = Math.hypot(dx, dy);
    const max = 50;
    if (d > max) { touchVec.x = dx / d; touchVec.y = dy / d; }
    else { touchVec.x = dx / max; touchVec.y = dy / max; }
  }
  function onTouchEnd(e) {
    touchVec.active = false; touchVec.x = 0; touchVec.y = 0;
  }
  function getHqInput() {
    let x = 0, y = 0;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    if (touchVec.active) { x = touchVec.x; y = touchVec.y; }
    return { x, y };
  }

  // ============ RENDER ============
  function render() {
    // White/black tile floor
    const tile = 40;
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        const isWhite = ((x / tile) + (y / tile)) % 2 === 0;
        ctx.fillStyle = isWhite ? '#eaeaea' : '#1a1a1a';
        ctx.fillRect(x, y, tile, tile);
      }
    }
    // Border walls
    ctx.fillStyle = '#330011';
    ctx.fillRect(0, 0, W, 14);
    ctx.fillRect(0, H - 14, W, 14);
    ctx.fillRect(0, 0, 14, H);
    ctx.fillRect(W - 14, 0, 14, H);
    // Soft glow lights at corners
    const grad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 400);
    grad.addColorStop(0, 'rgba(255,0,51,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Sort + draw players by y
    const sorted = players.slice().sort((a, b) => a.y - b.y);
    for (const p of sorted) p.draw(ctx);
  }

  function update(dt) {
    for (const p of players) p.update(dt);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(40, now - (lastT || now));
    lastT = now;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  }

  // ============ CHAT ============
  function addChat(name, text, system) {
    chatLog.push({ name, text, system });
    if (chatLog.length > 30) chatLog.shift();
    renderChatLog();
  }
  function renderChatLog() {
    const log = document.getElementById('hq-chat-log');
    if (!log) return;
    log.innerHTML = chatLog.map(c => {
      if (c.system) return `<div class="hq-chat-line hq-chat-system">→ ${c.text}</div>`;
      return `<div class="hq-chat-line"><span class="hq-chat-name">${c.name}:</span> <span class="hq-chat-text">${c.text}</span></div>`;
    }).join('');
    log.scrollTop = log.scrollHeight;
  }

  // ============ LOBBY LIFECYCLE ============
  function loadCust() {
    try {
      const save = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}');
      return save.customization || { fit: '#cc0022', accent: '#00ff66', hat: 'durag', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
    } catch (e) {
      return { fit: '#cc0022', accent: '#00ff66', hat: 'durag', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
    }
  }
  function genFakeCust(seed) {
    const skins = ['light', 'tan', 'medium', 'brown', 'dark'];
    const hats = ['none', 'cap', 'hood', 'durag', 'beanie', 'mohawk', 'headphones'];
    const chains = ['none', 'gold', 'cuban', 'platinum', 'ice'];
    const fits = ['#cc0022', '#0066cc', '#cc6600', '#009933', '#9933cc', '#cccc00', '#000000'];
    return {
      fit: fits[seed % fits.length],
      accent: fits[(seed + 2) % fits.length],
      hat: hats[(seed * 3) % hats.length],
      chain: chains[(seed * 2) % chains.length],
      shades: seed % 2 === 0,
      pattern: 'solid',
      shirtless: false,
      tattoos: seed % 3 === 0,
      skinTone: skins[seed % skins.length],
      body: 'male',
    };
  }
  const FAKE_NAMES = ['GHOST', 'NOVA', 'VIBES', 'BLAZE', 'PIXEL', 'STORM', 'FROST', 'NEON', 'RIOT', 'SAGE'];

  function enterLobby(lobby) {
    currentLobby = lobby;
    players = [];
    chatLog = [];
    // My player
    const prof = window.FAMEUP ? FAMEUP.getProfile() : { username: 'YOU' };
    const myName = (prof.username || 'YOU').toUpperCase().slice(0, 10);
    const myPlayer = new HQPlayer(W / 2, H / 2, loadCust(), myName, true);
    players.push(myPlayer);
    myPlayerIdx = 0;
    // Fake other players to make room feel alive (will become real over multiplayer later)
    const fakeCount = Math.max(0, lobby.count - 1);
    for (let i = 0; i < fakeCount; i++) {
      const x = 60 + Math.random() * (W - 120);
      const y = 60 + Math.random() * (H - 220);
      const p = new HQPlayer(x, y, genFakeCust(i + 1), FAKE_NAMES[i % FAKE_NAMES.length], false);
      players.push(p);
    }
    addChat('', `JOINED ${lobby.name} (${lobby.count}/${lobby.max})`, true);
    // Welcome chat from a random fake
    if (fakeCount > 0) {
      setTimeout(() => {
        if (!running) return;
        const greeter = players[1 + Math.floor(Math.random() * fakeCount)];
        if (!greeter || !greeter.setChat) return;
        const greets = ['ayoo welcome', 'sup', 'new here?', 'wassup', 'yooo', 'welcome to the lobby'];
        const text = greets[Math.floor(Math.random() * greets.length)];
        greeter.setChat(text);
        addChat(greeter.name, text);
      }, 1800);
    }
    // Update HUD
    const nameEl = document.getElementById('hq-room-name');
    const countEl = document.getElementById('hq-room-players');
    if (nameEl) nameEl.textContent = lobby.name;
    if (countEl) countEl.textContent = `${lobby.count}/${lobby.max}`;
    // Switch to room
    FAMEUP.showOnly('hq-room');
    canvas = document.getElementById('hq-canvas');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    attachInput();
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(loop);
    renderChatLog();
  }

  function leaveLobby() {
    running = false;
    cancelAnimationFrame(raf);
    detachInput();
    currentLobby = null;
    players = [];
    chatLog = [];
    FAMEUP.showOnly('hq-lobby');
    renderLobbies();
  }

  function renderLobbies() {
    const list = document.getElementById('hq-lobby-list');
    if (!list) return;
    if (lobbies.length === 0) {
      list.innerHTML = '<div class="inv-empty">NO ACTIVE LOBBIES<br><br>TAP "+ CREATE LOBBY" TO START ONE</div>';
      return;
    }
    list.innerHTML = lobbies.map(l => {
      const full = l.count >= l.max;
      return `<div class="hq-lobby-item ${full ? 'full' : ''}" data-lobby-id="${l.id}">
        <div class="hq-lobby-name">${l.name}</div>
        <div class="hq-lobby-count">${l.count}/${l.max}${full ? ' · FULL' : ''}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.hq-lobby-item').forEach(item => {
      if (item.classList.contains('full')) return;
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-lobby-id');
        const lobby = lobbies.find(l => l.id === id);
        if (lobby) {
          lobby.count = Math.min(lobby.max, lobby.count + 1);
          saveLobbies(lobbies);
          enterLobby(lobby);
        }
      });
    });
  }

  function openLobbyBrowser() {
    FAMEUP.showOnly('hq-lobby');
    renderLobbies();
  }

  // ============ INIT ============
  function init() {
    // Lobby browser back
    const back = document.getElementById('hq-lobby-back');
    if (back) back.addEventListener('click', () => FAMEUP.showOnly('fameup-home'));

    // Create lobby flow
    const createBtn = document.getElementById('hq-create-btn');
    const modal = document.getElementById('hq-create-modal');
    const maxSlider = document.getElementById('hq-create-max');
    const maxVal = document.getElementById('hq-create-max-val');
    if (createBtn) createBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    if (maxSlider) maxSlider.addEventListener('input', e => { maxVal.textContent = e.target.value; });
    const createGo = document.getElementById('hq-create-go');
    const createCancel = document.getElementById('hq-create-cancel');
    if (createGo) createGo.addEventListener('click', () => {
      const name = (document.getElementById('hq-create-name').value || 'NEW LOBBY').toUpperCase();
      const max = parseInt(maxSlider.value);
      const lobby = { id: 'lobby_' + Date.now(), name, max, count: 1 };
      lobbies.unshift(lobby);
      saveLobbies(lobbies);
      modal.classList.add('hidden');
      enterLobby(lobby);
    });
    if (createCancel) createCancel.addEventListener('click', () => modal.classList.add('hidden'));

    // Room: leave button
    const leaveBtn = document.getElementById('hq-leave-btn');
    if (leaveBtn) leaveBtn.addEventListener('click', () => {
      if (currentLobby) {
        // Decrement count
        const idx = lobbies.findIndex(l => l.id === currentLobby.id);
        if (idx >= 0) {
          lobbies[idx].count = Math.max(0, lobbies[idx].count - 1);
          if (lobbies[idx].count === 0) lobbies.splice(idx, 1);
          saveLobbies(lobbies);
        }
      }
      leaveLobby();
    });

    // Emote wheel
    const emoteBtn = document.getElementById('hq-emote-btn');
    const wheel = document.getElementById('hq-emote-wheel');
    if (emoteBtn && wheel) {
      emoteBtn.addEventListener('click', () => wheel.classList.toggle('hidden'));
    }
    document.querySelectorAll('.hq-emote-pick').forEach(b => {
      b.addEventListener('click', () => {
        const e = b.getAttribute('data-emote');
        if (players[myPlayerIdx]) players[myPlayerIdx].setEmote(e);
        wheel.classList.add('hidden');
      });
    });

    // Chat send
    const chatInput = document.getElementById('hq-chat-input');
    const chatSend = document.getElementById('hq-chat-send');
    function sendChat() {
      const text = (chatInput.value || '').trim();
      if (!text) return;
      const me = players[myPlayerIdx];
      if (me && me.setChat) {
        me.setChat(text);
        addChat(me.name, text);
      }
      chatInput.value = '';
      // Occasionally a fake replies
      const others = players.filter((_, i) => i !== myPlayerIdx);
      if (others.length > 0 && Math.random() < 0.4) {
        const replier = others[Math.floor(Math.random() * others.length)];
        const replies = ['fr', 'haha', 'fax', 'no cap', 'word', 'foreal', 'lmao', 'bet', '🔥', '💀'];
        setTimeout(() => {
          const r = replies[Math.floor(Math.random() * replies.length)];
          if (replier && replier.setChat) replier.setChat(r);
          addChat(replier.name, r);
        }, 1200 + Math.random() * 2000);
      }
    }
    if (chatSend) chatSend.addEventListener('click', sendChat);
    if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });

    // Number keys 1-6 for emotes
    document.addEventListener('keydown', e => {
      if (!running) return;
      if (document.activeElement && document.activeElement.id === 'hq-chat-input') return;
      const emojis = { '1': '👋', '2': '🕺', '3': '💪', '4': '👉', '5': '👑', '6': '😡', '7': '❤️', '8': '🔥' };
      if (emojis[e.key]) {
        if (players[myPlayerIdx]) players[myPlayerIdx].setEmote(emojis[e.key]);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  window.HQ = {
    openLobbyBrowser,
    enterLobby,
    leaveLobby,
  };
})();
