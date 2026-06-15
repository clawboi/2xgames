// game.js — v4: shop, arenas, lightning, suit dude, top-5 scores, blood, emote.
// Bulletproof main loop (try/catch, always re-schedules rAF).

(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const WORLD_W = 800, WORLD_H = 600;

  // ============ STORAGE ============
  const STORAGE_KEY = 'crabcage2x_save_v3';
  function defaultSave() {
    return {
      highScore: 0, highScores: [], totalKills: 0, bossesBeaten: [],
      cashBank: 0,
      upgrades: { weaponDmg: 0, truckHp: 0, moveSpeed: 0, maxHpUp: 0 },
      unlocks: { shotgun: false, stungun: false },
      consumables: { schizo: 0 },
      powers: [],     // queue of stored power-up keys: 'shockwave','nuke','heal','timewarp','berserk'
      schizoWavesLeft: 0,
      musicVolume: 0.35,
      customization: null,
      difficulty: 'normal',
      gameplayTrack: 'gameplay',
    };
  }
  function loadSave() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return defaultSave();
      return Object.assign(defaultSave(), JSON.parse(s));
    } catch (e) { return defaultSave(); }
  }
  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (e) {} }
  const save = loadSave();
  Audio.setMusicVolume(save.musicVolume);

  function refreshHighScoreUI() {
    const el = document.getElementById('high-score-display');
    if (el) el.textContent = `HIGH ${save.highScore} · $${save.cashBank}`;
  }
  refreshHighScoreUI();

  // ============ CUSTOMIZATION ============
  let customization = save.customization || {
    fit: '#00ff66', accent: '#cc0022', hat: 'durag', chain: 'gold',
    shades: false, pattern: 'solid', shirtless: true, tattoos: true,
    skinTone: 'brown', body: 'male',
  };
  // Helper to persist customization on any change
  function persistCustomization() {
    save.customization = { ...customization };
    persist();
  }

  // ============ GAME STATE ============
  const game = {
    player: null, truck: null,
    enemies: [], bullets: [], powerUps: [], cash: [], particles: [], toxicPools: [],
    floaters: [], dust: [], bloodSplats: [], lightnings: [], sonicWaves: [],
    partyPickups: [], dancers: [], follower: null, followers: [],
    gibs: [],
    hitstopUntil: 0,
    drunkUntil: 0, smokeUntil: 0,
    wave: 0, score: 0, cashCollected: 0, waveKills: 0, waveDamageTaken: 0, runKills: 0, runStartedAt: 0,
    spawnQueue: 0, spawnTimer: 0, waveActive: false, state: 'menu',
    world: { w: WORLD_W, h: WORLD_H },
    bossActive: false, arenaActive: false, arenaType: null, crabGunSpawned: false,
    pendingTimeouts: new Set(),
    shake: { x: 0, y: 0, intensity: 0 },
    timeScale: 1, timeScaleEnd: 0,
    combo: 0, comboTimer: 0, comboWindow: 2500,
    killstreak: 0, multiKillTimer: 0, multiKillCount: 0, multiplier: 1,
    bossIntroAlpha: 0, bgTint: '#1a0f08', bossLightningTimer: 0,
    MAX_BULLETS: 200, MAX_PARTICLES: 240, MAX_FLOATERS: 40, MAX_GIBS: 60,
    MAX_DUST: 50, MAX_CASH: 80, MAX_BLOOD: 30,

    findNearestEnemy(x, y) {
      let best = null, bestD = Infinity;
      const AUTO_AIM_MAX = 240; // cap so player can't stand and snipe everything
      for (const e of this.enemies) {
        if (e.dead || e.isFan) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d > AUTO_AIM_MAX) continue;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    },
    // COOP-aware: returns nearest active player from {game.player} ∪ game.partners[]
    findNearestPlayer(x, y) {
      let best = this.player;
      let bestD = (this.player && !this.player.dead) ? Math.hypot(this.player.x - x, this.player.y - y) : Infinity;
      if (this.partners) {
        for (const p of this.partners) {
          if (!p || p.dead) continue;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) { bestD = d; best = p; }
        }
      }
      return best;
    },
    spawnExplosion(x, y, color, count) {
      const budget = Math.min(count, this.MAX_PARTICLES - this.particles.length);
      for (let i = 0; i < budget; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 3.5;
        this.particles.push(new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color, 2 + Math.random() * 3, 400 + Math.random() * 300));
      }
    },
    spawnSparks(x, y, color, count, angleBase = 0, spread = Math.PI * 2) {
      const budget = Math.min(count, this.MAX_PARTICLES - this.particles.length);
      for (let i = 0; i < budget; i++) {
        const ang = angleBase + (Math.random() - 0.5) * spread;
        const sp = 2 + Math.random() * 4;
        this.particles.push(new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color, 1 + Math.random() * 2, 200 + Math.random() * 200));
      }
    },
    spawnFloater(x, y, text, color = '#fff', size = 14, vy = -1.2, life = 900) {
      if (this.floaters.length >= this.MAX_FLOATERS) this.floaters.shift();
      this.floaters.push({ x, y, text, color, size, vy, life, maxLife: life });
    },
    spawnCash(x, y, amount = 1) {
      if (this.cash.length >= this.MAX_CASH) return;
      const ang = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2;
      this.cash.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1, amount, life: 10000, frame: Math.floor(Math.random() * 100), collected: false });
    },
    spawnBloodSplat(x, y, intensity) {
      if (this.bloodSplats.length >= this.MAX_BLOOD) this.bloodSplats.shift();
      const dots = [];
      const count = Math.min(20, Math.floor(intensity / 3));
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * 18;
        dots.push({ dx: Math.cos(ang) * r, dy: Math.sin(ang) * r, r: 1 + Math.random() * 2.5 });
      }
      this.bloodSplats.push({ x, y, dots, life: 8000 });
      const partBudget = Math.min(Math.floor(intensity / 4), this.MAX_PARTICLES - this.particles.length);
      for (let i = 0; i < partBudget; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 3;
        this.particles.push(new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, '#aa0000', 2 + Math.random() * 2, 400 + Math.random() * 200));
      }
    },
    castLightning(x, y) {
      this.lightnings.push(new Lightning(x, y, 100));
    },
    addScreenShake(intensity) {
      if (save.reduceMotion) return;
      // Slightly tamed — was 20 cap, now 14, with 70% scale applied
      this.shake.intensity = Math.min(14, this.shake.intensity + intensity * 0.7);
    },
    slowMo(ms, scale = 0.35) { this.timeScale = scale; this.timeScaleEnd = performance.now() + ms; },
    hitstop(ms) {
      // Brief micro-pause for impact — freeze sim for ms milliseconds
      this.hitstopUntil = performance.now() + ms;
    },
    addKill(enemy) {
      const now = performance.now();
      this.combo++;
      this.comboTimer = this.comboWindow;
      this.killstreak++;
      this.waveKills++;
      this.runKills = (this.runKills || 0) + 1;
      save.totalKills++;
      // Kill milestone celebrations
      const milestones = { 50:'50 KILLS', 100:'100 KILLS!', 250:'250 KILLS!', 500:'500 KILLS!!', 1000:'1000 KILLS — LEGEND' };
      if (milestones[save.totalKills]) {
        this.spawnFloater(WORLD_W / 2, WORLD_H / 2 + 30, milestones[save.totalKills], '#ffcc00', 22, -0.4);
        try { Audio.sfx.highScore(); } catch (e) {}
        persist();
      }
      if (now - this.multiKillTimer < 600) this.multiKillCount++;
      else this.multiKillCount = 1;
      this.multiKillTimer = now;
      this.multiplier = 1 + Math.min(4, Math.floor(this.combo / 5));
      const scoreGain = Math.round(enemy.score * this.multiplier);
      this.score += scoreGain;
      const colors = ['#ffffff','#ffcc00','#ff8800','#ff4400','#ff00ff'];
      this.spawnFloater(enemy.x, enemy.y - 14, `+${scoreGain}`, colors[Math.min(4, this.multiplier - 1)], 12 + this.multiplier * 2);
      const cashAmt = 1 + Math.floor(this.multiplier / 2) + (enemy.isBoss ? 50 : 0);
      const cashCount = enemy.isBoss ? 25 : (1 + Math.floor(Math.random() * 2));
      for (let i = 0; i < cashCount; i++) this.spawnCash(enemy.x, enemy.y, cashAmt);
      const mks = ['','','DOUBLE KILL','TRIPLE KILL','MEGA KILL','MASSACRE'];
      const mkc = ['','','#ffcc00','#ff8800','#ff4400','#ff00ff'];
      if (this.multiKillCount >= 2) {
        const idx = Math.min(5, this.multiKillCount);
        this.spawnFloater(WORLD_W/2, WORLD_H/2 - 40, mks[idx], mkc[idx], 22 + (idx-2)*2, -0.5);
        try { Audio.sfx.multiKill(); } catch (e) {}
      }
      const ann = { 5:'NICE!',10:'COMBO!',15:'STREAK!',20:'RAMPAGE!',30:'UNSTOPPABLE!',50:'GODLIKE!',75:'BEYOND HUMAN',100:'CRABCAGE LEGEND' };
      if (ann[this.killstreak]) {
        this.spawnFloater(WORLD_W/2, WORLD_H/2 - 80, ann[this.killstreak], '#ff00ff', 28, -0.4);
        try { Audio.sfx.combo(); } catch (e) {}
      }
    },
    breakCombo() {
      // Forgiveness: small streaks don't fully break — just trim
      if (this.combo > 3) {
        this.combo = Math.max(0, this.combo - 3);
      }
      this.multiplier = Math.max(1, 1 + Math.floor(this.combo / 5));
      this.killstreak = Math.max(0, this.killstreak - 2);
    },
    schedule(fn, ms) {
      const id = setTimeout(() => { this.pendingTimeouts.delete(id); try { fn(); } catch (e) { console.error('sched', e); } }, ms);
      this.pendingTimeouts.add(id);
      return id;
    },
    clearAllTimeouts() { for (const id of this.pendingTimeouts) clearTimeout(id); this.pendingTimeouts.clear(); },
    onPlayerDeath() { setGameOver(false); },
    onTruckDeath() { if (!this.arenaActive) setGameOver(false); },
    onVictory() { setGameOver(true); },
    enterParty() {
      this.state = 'party';
      this.arenaActive = true;
      this.arenaType = 'party';
      this.enemies = [];
      this.bullets = [];
      this.followers = [];
      this.follower = null;
      this.recruitedList = [];
      // Dancers populate the floor
      this.dancers = [];
      const dudes = 6, girls = 4;
      for (let i = 0; i < dudes; i++) {
        const ang = (i / dudes) * Math.PI * 2;
        const r = 140 + Math.random() * 60;
        const colors = ['#cc0022','#003388','#226600','#cc6600','#660066','#444'];
        this.dancers.push(new Dancer(WORLD_W/2 + Math.cos(ang) * r, WORLD_H/2 + Math.sin(ang) * r * 0.6, colors[i % colors.length], 'dude'));
      }
      for (let i = 0; i < girls; i++) {
        const ang = (i / girls) * Math.PI * 2 + 0.3;
        const r = 100 + Math.random() * 60;
        const colors = ['#ff66aa','#ff0088','#ffaa00','#cc88ff'];
        this.dancers.push(new Dancer(WORLD_W/2 + Math.cos(ang) * r, WORLD_H/2 + Math.sin(ang) * r * 0.6, colors[i % colors.length], 'girl'));
      }
      // Party pickups scattered
      this.partyPickups = [
        new PartyPickup(180, 200, 'drink'),
        new PartyPickup(620, 200, 'drink'),
        new PartyPickup(180, 440, 'smoke'),
        new PartyPickup(620, 440, 'smoke'),
        new PartyPickup(WORLD_W - 60, WORLD_H / 2, 'exit'),
      ];
      this.player.x = 80;
      this.player.y = WORLD_H / 2;
      this.spawnFloater(WORLD_W/2, 60, "AFTER PARTY", '#ff66ff', 30, -0.3);
      try {
        // Cleanly stop ALL existing music through the audio module
        Audio.stopMusic();
        try { Audio.stopPartyBeat(); } catch (e) {}
        // Play partysong.mp3 through the proper Audio module so iOS volume + media session work
        Audio.playMusic('party');
        // Sync to coop guests too
        if (this.coopActive && this.coopRole === 'host') {
          try { Coop.broadcast('music', { track: 'party' }); } catch (e) {}
        }
        // Fallback to synthesized beat if the file isn't loaded yet
        const partyAudio = document.getElementById('music-party');
        if (!partyAudio || partyAudio.readyState < 2) {
          setTimeout(() => {
            const a = document.getElementById('music-party');
            if (!a || a.paused || a.readyState < 2) { try { Audio.startPartyBeat(); } catch (e) {} }
          }, 600);
        }
      } catch (e) { try { Audio.startPartyBeat(); } catch (er) {} }
    },
    exitParty() {
      const partyAudio = document.getElementById('music-party');
      if (partyAudio) { try { partyAudio.pause(); partyAudio.currentTime = 0; } catch (e) {} }
      try { Audio.stopPartyBeat(); } catch (e) {}
      // Followers were already spawned at recruit time — just turn off party mode
      this.followers = this.followers || [];
      this.followers.forEach(f => { f.inParty = false; });
      // Legacy single follower ref still works
      this.follower = this.followers[0] || null;
      this.recruitedDancer = null;
      this.recruitedList = [];
      this.dancers = [];
      this.partyPickups = [];
      this.arenaActive = false;
      this.arenaType = null;
      this.state = 'playing';
      this.drunkUntil = 0;
      this.smokeUntil = 0;
      // Reset truck for post-party play if needed
      if (this.truck.hp <= 0) {
        this.truck.hp = this.truck.maxHp;
      }
      startWave(16);
      Audio.playMusic('gameplay');
    },
  };

  // ============ CANVAS RESIZE ============
  function resizeCanvas() {
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.width = WORLD_W; canvas.height = WORLD_H;
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));
  resizeCanvas();

  // ============ CHARACTER PREVIEW ============
  const charCanvas = document.getElementById('char-canvas');
  const charCtx = charCanvas.getContext('2d');
  charCtx.imageSmoothingEnabled = false;
  let previewFrame = 0, previewDir = 0, previewDirTimer = 0;
  function drawCharPreview() {
    try {
      charCtx.fillStyle = '#0a0a0a';
      charCtx.fillRect(0, 0, 120, 160);
      const grad = charCtx.createRadialGradient(60, 90, 5, 60, 90, 80);
      grad.addColorStop(0, 'rgba(204,0,34,0.18)'); grad.addColorStop(1, 'rgba(204,0,34,0)');
      charCtx.fillStyle = grad; charCtx.fillRect(0, 0, 120, 160);
      charCtx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 120; i += 8) charCtx.fillRect(i, 0, 1, 160);
      for (let j = 0; j < 160; j += 8) charCtx.fillRect(0, j, 120, 1);
      Sprites.drawPlayer(charCtx, 60, 90, customization, previewDir, previewFrame);
      previewFrame = (previewFrame + 1) % 4;
      previewDirTimer++;
      if (previewDirTimer > 8) { previewDirTimer = 0; previewDir = (previewDir + 1) % 4; }
    } catch (e) {}
  }
  setInterval(drawCharPreview, 200);

  // ============ ANIMATED BG ============
  const bgCanvas = document.getElementById('bg-canvas');
  if (bgCanvas) {
    const bgCtx = bgCanvas.getContext('2d');
    function sizeBg() { bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight; }
    sizeBg(); window.addEventListener('resize', sizeBg);
    const drops = [];
    for (let i = 0; i < 60; i++) drops.push({ x: Math.random()*bgCanvas.width, y: Math.random()*bgCanvas.height, vy: 1+Math.random()*3, len: 8+Math.random()*14 });
    function animateBg() {
      try {
        bgCtx.fillStyle = 'rgba(0,0,0,0.2)';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        for (const d of drops) {
          d.y += d.vy;
          if (d.y > bgCanvas.height) { d.y = -d.len; d.x = Math.random()*bgCanvas.width; }
          const grad = bgCtx.createLinearGradient(d.x, d.y, d.x, d.y + d.len);
          grad.addColorStop(0, 'rgba(255,0,51,0)');
          grad.addColorStop(1, 'rgba(255,0,51,0.5)');
          bgCtx.strokeStyle = grad; bgCtx.lineWidth = 1.5;
          bgCtx.beginPath(); bgCtx.moveTo(d.x, d.y); bgCtx.lineTo(d.x, d.y+d.len); bgCtx.stroke();
        }
      } catch (e) {}
      requestAnimationFrame(animateBg);
    }
    animateBg();
  }

  // ============ AUDIO UNLOCK ============
  function firstInteractionUnlock() {
    Audio.unlock();
    if (game.state === 'menu') Audio.playMusic('menu');
  }
  ['pointerdown','touchstart','keydown','click'].forEach(evt => {
    window.addEventListener(evt, firstInteractionUnlock, { once: false, passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Audio.pauseAll();
    } else {
      if (game.state === 'menu') Audio.playMusic('menu');
      else if (game.state === 'party') {
        // Resume party music (re-enter handles all cases)
        const partyAudio = document.getElementById('music-party');
        const hasFile = partyAudio && partyAudio.readyState >= 2 && partyAudio.duration > 0 && !isNaN(partyAudio.duration);
        if (hasFile) { try { partyAudio.play().catch(() => Audio.startPartyBeat()); } catch (e) { Audio.startPartyBeat(); } }
        else { Audio.startPartyBeat(); }
      }
      else if (game.state === 'playing' || game.state === 'cd-wait') Audio.resume();
    }
  });
  // On unload, clear MediaSession so iOS audio widget goes away
  window.addEventListener('pagehide', () => Audio.stopMusic());

  // ============ CUSTOMIZER ============
  function initCustomizer() {
    function wireGroup(selector, attr, key) {
      const items = document.querySelectorAll(selector);
      items.forEach(b => {
        const v = b.dataset[attr];
        const compare = v === 'true' ? true : (v === 'false' ? false : v);
        if (compare === customization[key]) b.classList.add('selected');
        b.addEventListener('click', () => {
          Audio.unlock();
          let val = b.dataset[attr];
          if (val === 'true') val = true; else if (val === 'false') val = false;
          customization[key] = val;
          items.forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          try { Audio.sfx.pickup(); } catch (e) {}
          persistCustomization();
        });
      });
    }
    wireGroup('#fit-swatches .swatch', 'fit', 'fit');
    wireGroup('#accent-swatches .swatch', 'accent', 'accent');
    wireGroup('#hat-swatches .hat-btn', 'hat', 'hat');
    wireGroup('#chain-swatches .hat-btn', 'chain', 'chain');
    wireGroup('#shades-swatches .hat-btn', 'shades', 'shades');
    wireGroup('#pattern-swatches .hat-btn', 'pattern', 'pattern');
    wireGroup('#shirt-swatches .hat-btn', 'shirtless', 'shirtless');
    wireGroup('#tat-swatches .hat-btn', 'tattoos', 'tattoos');
    wireGroup('#skin-swatches .skin-swatch', 'skintone', 'skinTone');
    wireGroup('#body-swatches .hat-btn', 'body', 'body');
    wireGroup('#body-swatches .hat-btn', 'body', 'body');
    wireGroup('#body-swatches .hat-btn', 'body', 'body');

    const randomBtn = document.getElementById('randomize-btn');
    if (randomBtn) randomBtn.addEventListener('click', () => {
      Audio.unlock();
      const fits = ['#00ff66','#cc0022','#ffcc00','#9933ff','#ffffff','#00aaff','#ff00aa','#00ff00','#ff6600'];
      const accents = ['#cc0022','#00ff66','#000000','#ffcc00','#ffffff','#9933ff','#00aaff'];
      const hats = ['durag','cap','hood','beanie','bandana','headphones','mohawk','none'];
      const chains = ['gold','ice','platinum','cuban','none'];
      const pats = ['solid','stripe','glow','flame'];
      customization.fit = fits[Math.floor(Math.random()*fits.length)];
      customization.accent = accents[Math.floor(Math.random()*accents.length)];
      customization.hat = hats[Math.floor(Math.random()*hats.length)];
      customization.chain = chains[Math.floor(Math.random()*chains.length)];
      customization.shades = Math.random() < 0.5;
      customization.pattern = pats[Math.floor(Math.random()*pats.length)];
      customization.shirtless = Math.random() < 0.6;
      customization.tattoos = Math.random() < 0.7;
      refreshCustomizerUI();
      persistCustomization();
      try { Audio.sfx.cash(); } catch (e) {}
    });

    // PRESETS — one-tap complete looks
    const presets = {
      schizo:    { fit:'#ffffff', accent:'#dddddd', hat:'none',       chain:'none',     shades:false, pattern:'solid',  shirtless:false, tattoos:false, skinTone:'medium', jeansColor:'#ffffff' },
      xx7:       { fit:'#cc0022', accent:'#00ff66', hat:'none',       chain:'gold',     shades:true,  pattern:'solid',  shirtless:false, tattoos:false, skinTone:'brown' },
      drip:      { fit:'#ffffff', accent:'#ffcc00', hat:'cap',        chain:'cuban',    shades:true,  pattern:'solid',  shirtless:false, tattoos:false, skinTone:'brown' },
      streetwear:{ fit:'#000000', accent:'#cc0022', hat:'hood',       chain:'gold',     shades:false, pattern:'solid',  shirtless:false, tattoos:true,  skinTone:'tan' },
      rage:      { fit:'#ff6600', accent:'#cc0022', hat:'mohawk',     chain:'none',     shades:false, pattern:'flame',  shirtless:true,  tattoos:true,  skinTone:'brown' },
      clean:     { fit:'#ffffff', accent:'#000000', hat:'none',       chain:'platinum', shades:true,  pattern:'solid',  shirtless:false, tattoos:false, skinTone:'light' },
      ghost:     { fit:'#9933ff', accent:'#00aaff', hat:'headphones', chain:'ice',      shades:true,  pattern:'glow',   shirtless:true,  tattoos:false, skinTone:'dark' },
    };
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Audio.unlock();
        const p = presets[btn.dataset.preset];
        if (!p) return;
        Object.assign(customization, p);
        refreshCustomizerUI();
        persistCustomization();
        try { Audio.sfx.pickup(); } catch (e) {}
      });
    });

    function refreshCustomizerUI() {
      const map = {
        fit:'#fit-swatches .swatch', accent:'#accent-swatches .swatch',
        hat:'#hat-swatches .hat-btn', chain:'#chain-swatches .hat-btn',
        shades:'#shades-swatches .hat-btn', pattern:'#pattern-swatches .hat-btn',
        shirtless:'#shirt-swatches .hat-btn', tattoos:'#tat-swatches .hat-btn',
        skinTone:'#skin-swatches .skin-swatch',
        body:'#body-swatches .hat-btn',
        body:'#body-swatches .hat-btn',
      };
      Object.entries(map).forEach(([k, sel]) => {
        const dataKey = k.toLowerCase();
        document.querySelectorAll(sel).forEach(el => {
          const val = el.dataset[dataKey] !== undefined ? el.dataset[dataKey] : el.dataset[k];
          el.classList.toggle('selected', String(val) === String(customization[k]));
        });
      });
    }
    // Apply saved customization to UI on boot
    refreshCustomizerUI();
  }
  initCustomizer();

  // ════════════════════════════════════════════════════════════════
  // ALBUM PROMO CONFIG — edit these to update branding everywhere
  // ════════════════════════════════════════════════════════════════
  //
  // 1) STREAMING LINKS — replace these URLs with the 2X album's actual links.
  //    These show on the start screen AND game-over screen.
  const EP_LINKS = {
    spotify: 'https://open.spotify.com/artist/6trq6Q1kWCCe5kFu4i2pvX',
    apple:   'https://music.apple.com/us/artist/2x/1804114831',
  };
  //
  // 2) SONG TITLES — names shown in the in-game playlist (pause menu).
  //    Each key here maps to an mp3 file in /music/ — to swap a song,
  //    just replace the mp3 in that folder (keep the filename).
  //    Suggested names if you want to fill in 4-5 tracks:
  //      "INTRO" / "ROLL OUT" / "BLAST" / "AFTERPARTY" / "RANDOM"
  //    or use real track titles from the EP.
  const SONGS = {
    gameplay: 'CRABCAGE',          // <-- /music/gameplay.mp3
    boss:     'ONEBANDOME DRUM',   // <-- /music/boss.mp3
    menu:     'GEEKEDUP!',         // <-- /music/menu.mp3
    party:    'JEFFHARDY!',        // <-- /music/partysong.mp3
    random:   'RANDOM',
  };
  // ════════════════════════════════════════════════════════════════

  function wireEPLinks() {
    const sp = document.getElementById('ep-spotify-link');
    const ap = document.getElementById('ep-apple-link');
    if (sp) sp.href = EP_LINKS.spotify;
    if (ap) ap.href = EP_LINKS.apple;
    const sp2 = document.getElementById('ep-spotify-link-go');
    const ap2 = document.getElementById('ep-apple-link-go');
    if (sp2) sp2.href = EP_LINKS.spotify;
    if (ap2) ap2.href = EP_LINKS.apple;
  }
  wireEPLinks();

  // ============ TAB VISIBILITY — auto-pause when backgrounded ============
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab hidden — pause everything
      if (game.state === 'playing' || game.state === 'party' || game.state === 'cd-wait') {
        game._prePauseState = game.state;
        game.state = 'paused';
        pauseOverlay.classList.remove('hidden');
        try { Audio.pauseAll(); } catch (e) {}
      }
    } else {
      // Tab visible again — reset slo-mo so it doesn't stick from before background
      game.timeScale = 1;
      game.timeScaleEnd = 0;
      game.hitstopUntil = 0;
    }
  });

  // ============ iOS INSTALL GATE handled by inline script in index.html head ============
  // The gate decision runs before this file even loads — see #ios-gate-inline in HTML.
  function refreshDifficultyUI() {
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.diff === save.difficulty);
    });
  }
  refreshDifficultyUI();
  document.querySelectorAll('.diff-btn').forEach(b => {
    wireTap(b, () => {
      save.difficulty = b.dataset.diff;
      persist();
      refreshDifficultyUI();
      try { Audio.sfx.pickup(); } catch (e) {}
    });
  });
  function getDifficultyMult() {
    // Returns { enemyHp, enemyDmg, playerHpMult, dropRate }
    switch (save.difficulty) {
      case 'easy':   return { enemyHp: 0.75, enemyDmg: 0.85, playerHpMult: 1.15, dropRate: 1.4 };
      case 'hard':   return { enemyHp: 1.95, enemyDmg: 1.85, playerHpMult: 0.58, dropRate: 0.65 };
      default:       return { enemyHp: 1.0,  enemyDmg: 1.0,  playerHpMult: 1.0, dropRate: 1.0 };
    }
  }

  // ============ INVENTORY ============
  function renderInventory() {
    const list = document.getElementById('inv-list');
    if (!list || !game.player) return;
    list.innerHTML = '';
    const fistsIdx = 2;
    const crabIdx = 4;
    // Show all owned weapons
    const owned = [];
    for (let i = 0; i < Weapons.count(); i++) {
      const w = Weapons.get(i);
      const isUnlocked = i <= 3 || (i === crabIdx && game.player.crabUnlocked) ||
        (i === 5 && save.unlocks.shotgun) || (i === 6 && save.unlocks.stungun) ||
        (i === 7 && save.unlocks.goldDraco) || (i === 8 && save.unlocks.goldRpg) ||
        (i === 9 && save.unlocks.plasma) || (i === 10 && save.unlocks.tesla) ||
        (i === 11 && save.unlocks.flamer) || (i === 12 && save.unlocks.freeze) ||
        (i === 13 && save.unlocks.honeyUzi);
      if (isUnlocked) owned.push({ idx: i, def: w });
    }
    const maxEquipped = 5; // fists + 4 others
    owned.forEach(({ idx, def }) => {
      const equipped = game.player.equippedWeapons.has(idx);
      const isLocked = idx === fistsIdx || idx === crabIdx; // can't unequip these
      const div = document.createElement('div');
      div.className = `inv-item tier-${def.tier || 'grey'}${equipped ? ' equipped' : ''}`;
      div.innerHTML = `
        <span class="inv-item-name">${def.name}</span>
        <span class="inv-item-tag ${equipped ? 'equipped-tag' : ''}">${isLocked ? 'ALWAYS' : (equipped ? 'EQUIPPED' : 'TAP TO EQUIP')}</span>`;
      if (!isLocked) {
        wireTap(div, () => {
          if (equipped) {
            game.player.equippedWeapons.delete(idx);
          } else {
            // Cap at maxEquipped — auto-unequip oldest non-fists if at cap
            if (game.player.equippedWeapons.size >= maxEquipped) {
              for (const slot of game.player.equippedWeapons) {
                if (slot !== fistsIdx && slot !== crabIdx) {
                  game.player.equippedWeapons.delete(slot); break;
                }
              }
            }
            game.player.equippedWeapons.add(idx);
          }
          try { Audio.sfx.pickup(); } catch (e) {}
          renderInventory();
          updateWeaponBar();
        });
      }
      list.appendChild(div);
    });
  }
  wireTap(document.getElementById('pause-inv-btn'), () => {
    if (!game.player) return;
    renderInventory();
    pauseOverlay.classList.add('hidden');
    showScreen('inventory-screen');
    game.shopFromPause = false;
    game.inventoryFromPause = true;
  });
  wireTap(document.getElementById('inv-back'), () => {
    if (game.inventoryFromPause) {
      showScreen('game-screen');
      pauseOverlay.classList.remove('hidden');
      game.inventoryFromPause = false;
      updateWeaponBar();
    } else {
      showScreen('start-screen');
    }
  });

  // ============ CUSTOMIZE TOGGLE (simplifies default view) ============
  const custToggle = document.getElementById('customize-toggle');
  const custAdvanced = document.getElementById('customize-advanced');
  if (custToggle && custAdvanced) {
    wireTap(custToggle, () => {
      const isHidden = custAdvanced.classList.contains('hidden');
      custAdvanced.classList.toggle('hidden');
      custToggle.textContent = isHidden ? '− HIDE CUSTOMIZE' : '+ CUSTOMIZE LOOK';
    });
  }

  // ============ GAMEPLAY TRACK PICKER ============
  function refreshTrackPickUI() {
    document.querySelectorAll('.track-pick-btn').forEach(b => {
      const key = b.dataset.gameplayTrack;
      if (SONGS[key]) b.textContent = SONGS[key];  // dynamic name from config
      b.classList.toggle('selected', key === (save.gameplayTrack || 'gameplay'));
    });
  }
  refreshTrackPickUI();
  document.querySelectorAll('.track-pick-btn').forEach(b => {
    wireTap(b, () => {
      save.gameplayTrack = b.dataset.gameplayTrack;
      persist();
      refreshTrackPickUI();
      try { Audio.sfx.pickup(); } catch (e) {}
      // If we're currently playing gameplay music, swap it immediately
      if (game.state === 'paused' || game.state === 'playing') {
        Audio.playMusic('gameplay');
      }
    });
  });
  // Wrap Audio.playMusic('gameplay') so it respects the user pick
  const originalPlayMusic = Audio.playMusic;
  Audio.playMusic = function(name) {
    if (name === 'gameplay' && save.gameplayTrack && save.gameplayTrack !== 'gameplay') {
      if (save.gameplayTrack === 'random') {
        const choices = ['gameplay', 'boss', 'menu', 'party'];
        name = choices[Math.floor(Math.random() * choices.length)];
      } else {
        name = save.gameplayTrack;
      }
    }
    return originalPlayMusic(name);
  };

  // ============ MUTE / SCREEN MGMT ============
  const menuMuteBtn = document.getElementById('menu-mute-btn');
  if (menuMuteBtn) {
    let muted = false;
    wireTap(menuMuteBtn, () => {
      Audio.unlock();
      muted = !muted;
      Audio.setMusicEnabled(!muted); Audio.setSfxEnabled(!muted);
      menuMuteBtn.textContent = muted ? '🔇' : '🔊';
      menuMuteBtn.classList.toggle('muted', muted);
    });
  }
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id); if (el) el.classList.remove('hidden');
  }
  Audio.playMusic('menu');

  // ============ NAV ============
  // Helper: wire a tap handler that fires immediately on pointerdown (no 300ms iOS delay, no ghost-click)
  function wireTap(el, fn) {
    if (!el) return;
    let firedAt = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      firedAt = performance.now();
      fn(e);
    });
    el.addEventListener('click', (e) => {
      e.preventDefault();
      // If pointerdown already handled it (< 500ms ago), skip the click
      if (performance.now() - firedAt < 500) return;
      fn(e);
    });
  }

  wireTap(document.getElementById('start-btn'), () => { Audio.unlock(); startGame(); });

  // ============ COOP LOBBY (4-PLAYER) ============
  const coopOverlay = document.getElementById('coop-lobby-overlay');
  const coopHostView = document.getElementById('coop-host-view');
  const coopJoinView = document.getElementById('coop-join-view');
  const coopLobbyList = document.getElementById('coop-lobby-list');
  const coopCodeDisplay = document.getElementById('coop-code-display');
  const coopReadyStatus = document.getElementById('coop-ready-status');
  const coopSlotsContainer = document.getElementById('coop-slots-container');

  // Local lobby state — what each connected player has picked
  // Keyed by slot (0=host, 1/2/3=guests). Host maintains full picture.
  // Guests track only their own + what host relays.
  let lobbyState = {
    0: { name: 'PLAYER 1', customization: null, difficulty: 'normal', ready: false, connected: true },
    1: { name: 'PLAYER 2', customization: null, difficulty: 'normal', ready: false, connected: false },
    2: { name: 'PLAYER 3', customization: null, difficulty: 'normal', ready: false, connected: false },
    3: { name: 'PLAYER 4', customization: null, difficulty: 'normal', ready: false, connected: false },
  };

  function resetLobbyState() {
    lobbyState = {
      0: { name: 'PLAYER 1', customization: JSON.parse(JSON.stringify(customization)), difficulty: save.difficulty || 'normal', ready: false, connected: true },
      1: { name: 'PLAYER 2', customization: null, difficulty: 'normal', ready: false, connected: false },
      2: { name: 'PLAYER 3', customization: null, difficulty: 'normal', ready: false, connected: false },
      3: { name: 'PLAYER 4', customization: null, difficulty: 'normal', ready: false, connected: false },
    };
  }

  function renderLobbySlots() {
    if (!coopSlotsContainer) return;
    const tints = ['#ff0033', '#00aaff', '#ffcc00', '#00ff66'];
    let html = '';
    for (let s = 0; s < 4; s++) {
      const ls = lobbyState[s];
      const status = !ls.connected ? '<span style="color:#444;">— EMPTY —</span>'
        : (ls.ready ? '<span style="color:#00ff66;">✓ READY</span>' : '<span style="color:#ffcc00;">PICKING...</span>');
      html += `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;margin:4px 0;background:rgba(0,0,0,0.4);border-left:4px solid ${tints[s]};">
        <div style="color:${tints[s]};font-size:11px;width:80px;">P${s+1}</div>
        <div style="flex:1;font-size:10px;color:#aaa;">${(ls.customization && ls.customization.preset) || 'no pick yet'} · ${ls.difficulty.toUpperCase()}</div>
        <div style="font-size:10px;">${status}</div>
      </div>`;
    }
    coopSlotsContainer.innerHTML = html;
  }

  function openCoopLobby(role) {
    Audio.unlock();
    coopOverlay.classList.remove('hidden');
    coopHostView.classList.add('hidden');
    coopJoinView.classList.add('hidden');
    coopLobbyList.classList.add('hidden');
    resetLobbyState();
    if (role === 'host') {
      coopHostView.classList.remove('hidden');
      coopCodeDisplay.textContent = '----';
      Coop.host((code) => {
        coopCodeDisplay.textContent = code;
        coopLobbyList.classList.remove('hidden');
        renderLobbySlots();
        drawCoopPreview();
      });
    } else if (role === 'join') {
      coopJoinView.classList.remove('hidden');
      document.getElementById('coop-code-input').value = '';
    }
    Coop.onConnect((slot, totalConnections) => {
      if (Coop.isHost()) {
        lobbyState[slot].connected = true;
        renderLobbySlots();
        Coop.sendTo(slot, 'lobby_sync', { slot, lobby: lobbyState });
        // Visual confirmation that a new peer joined
        const status = document.getElementById('coop-ready-status');
        if (status) {
          status.textContent = `P${slot + 1} JOINED ✓`;
          status.style.color = '#00ff66';
          setTimeout(() => { if (status) status.textContent = ''; }, 2200);
        }
      } else {
        // I'm the guest — host accepted me
        coopJoinView.classList.add('hidden');
        coopLobbyList.classList.remove('hidden');
        document.querySelectorAll('.coop-diff').forEach(b => b.classList.add('guest-locked'));
        document.getElementById('coop-diff-current').textContent = 'HOST PICKED: ' + (save.difficulty || 'normal').toUpperCase();
        renderLobbySlots();
        sendMyPick();
        drawCoopPreview();
      }
    });
    Coop.onMessage((msg, fromSlot) => handleCoopMessage(msg, fromSlot));
    Coop.onDisconnect((slot) => {
      lobbyState[slot].connected = false;
      lobbyState[slot].ready = false;
      renderLobbySlots();
      if (game.coopActive && (game.state === 'playing' || game.state === 'paused')) {
        // Mid-game disconnect — mark them inactive
        if (game.partners && game.partners[slot]) game.partners[slot].dead = true;
        // If guest's host disconnects → end coop, fall back to solo on this side
        if (Coop.isGuest() && slot === 0) {
          game.spawnFloater(WORLD_W / 2, WORLD_H / 2, 'HOST LEFT — SOLO MODE', '#ffcc00', 18, -0.3, 2400);
          game.coopActive = false;
          game.coopRole = null;
          game.partners = [];
        } else {
          // Show toast that a partner left
          game.spawnFloater(WORLD_W / 2, 80, `P${slot + 1} DISCONNECTED`, '#ffaa00', 12, -0.25, 2000);
        }
      }
    });
  }

  function sendMyPick() {
    const pick = {
      customization: JSON.parse(JSON.stringify(customization)),
      difficulty: save.difficulty || 'normal',
    };
    if (Coop.isHost()) {
      lobbyState[0].customization = pick.customization;
      lobbyState[0].difficulty = pick.difficulty;
      Coop.broadcast('lobby_pick', { slot: 0, ...pick });
      renderLobbySlots();
    } else {
      Coop.send('lobby_pick', pick); // host figures out our slot
    }
  }

  function handleCoopMessage(msg, fromSlot) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'lobby_diff':
        // Host changed difficulty for the whole group — guests apply locally
        if (Coop.isGuest()) {
          save.difficulty = msg.d.difficulty || 'normal';
          persist();
          const dl = document.getElementById('coop-diff-current');
          if (dl) dl.textContent = 'HOST PICKED: ' + (msg.d.difficulty || 'normal').toUpperCase();
        }
        break;
      case 'lobby_sync':
        // Guest receives the full lobby state on join
        if (Coop.isGuest()) {
          lobbyState = msg.d.lobby;
          // Server told us our slot — we'll send our pick next
          window._game.myCoopSlot = msg.d.slot;
          renderLobbySlots();
        }
        break;
      case 'lobby_pick':
        // Host: a guest sent their pick. Store + rebroadcast to all.
        // Guest: host relayed someone's pick (could be ours back).
        if (Coop.isHost()) {
          // Find which slot this came from
          const slot = fromSlot;
          lobbyState[slot].customization = msg.d.customization;
          lobbyState[slot].difficulty = msg.d.difficulty || 'normal';
          renderLobbySlots();
          // Relay to all other guests
          Coop.broadcast('lobby_pick', { slot, ...msg.d });
        } else {
          lobbyState[msg.d.slot] = lobbyState[msg.d.slot] || {};
          lobbyState[msg.d.slot].customization = msg.d.customization;
          lobbyState[msg.d.slot].difficulty = msg.d.difficulty || 'normal';
          renderLobbySlots();
        }
        break;
      case 'lobby_ready':
        if (Coop.isHost()) {
          lobbyState[fromSlot].ready = !!msg.d.ready;
          renderLobbySlots();
          Coop.broadcast('lobby_ready', { slot: fromSlot, ready: !!msg.d.ready });
          checkAllReady();
        } else {
          lobbyState[msg.d.slot].ready = !!msg.d.ready;
          renderLobbySlots();
        }
        break;
      case 'lobby_start':
        // Host says go
        if (Coop.isGuest()) {
          coopOverlay.classList.add('hidden');
          startCoopGame();
        }
        break;
      case 'input':
        // Guest sends inputs to host every frame; route to their player slot
        if (Coop.isHost() && window._game) {
          const targetSlot = fromSlot; // 1/2/3
          window._game[`guestInput${targetSlot}`] = msg.d;
        }
        break;
      case 'state':
        if (Coop.isGuest() && window._game) {
          window._game.hostState = msg.d;
          window._game.lastStateAt = performance.now();
        }
        break;
      case 'pause':
        if (window._game) {
          if (msg.d.paused && window._game.state === 'playing') togglePause(true);
          else if (!msg.d.paused && window._game.state === 'paused') togglePause(true);
        }
        break;
      case 'revive':
        if (Coop.isHost() && window._game) {
          const slot = fromSlot;
          const p = (window._game.partners && window._game.partners[slot]);
          if (p) { p.hp = p.maxHp; p.dead = false; }
        }
        break;
      case 'sfx':
        // Guest plays SFX events that host broadcasts (kills, hits, boss events)
        if (Coop.isGuest()) {
          const name = msg.d && msg.d.name;
          try { if (name && Audio.sfx[name]) Audio.sfx[name](); } catch (e) {}
        }
        break;
      case 'wave_clear':
        if (Coop.isGuest() && window._game) {
          const w = msg.d || {};
          window._game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 20,
            w.noHit ? `WAVE CLEAR! +$${w.bonus} · NO-HIT +$${w.noHit}` : `WAVE CLEAR! +$${w.bonus}`,
            w.noHit ? '#ffcc00' : '#00ff66', 16, -0.4, 1800);
          try { Audio.sfx.combo(); } catch (e) {}
        }
        break;
      case 'wave_start':
        if (Coop.isGuest() && window._game) {
          const w = msg.d || {};
          // Guest renders the wave banner
          if (typeof showWaveBanner === 'function') showWaveBanner(`WAVE ${w.n}`, w.subtitle || '');
        }
        break;
      case 'boss_intro':
        if (Coop.isGuest() && window._game) {
          const b = msg.d || {};
          window._game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 60, b.name || 'BOSS', '#ff0033', 40, -0.15, 3000);
          window._game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 10, '— ENTERS THE FIGHT —', '#ffcc00', 14, -0.1, 3000);
          try { Audio.sfx.boss(); } catch (e) {}
        }
        break;
      case 'victory':
        if (Coop.isGuest() && window._game) {
          // Trigger the victory screen on guest with EP CTAs
          window._game.coopVictoryPending = true;
          // Show game over overlay as victory
          setTimeout(() => {
            try {
              const gOverlay = document.getElementById('gameover-overlay');
              const gTitle = document.getElementById('gameover-title');
              if (gTitle) {
                gTitle.textContent = 'VICTORY';
                gTitle.style.color = '#00ff66';
              }
              if (gOverlay) gOverlay.classList.remove('hidden');
              try { Audio.sfx.victory(); } catch (e) {}
            } catch (e) {}
          }, 1200);
        }
        break;
      case 'music':
        // Host changed music track — guest plays it too
        if (Coop.isGuest() && msg.d && msg.d.track) {
          if (msg.d.track === 'stop') { try { Audio.stopMusic(); } catch (e) {} }
          else { try { Audio.playMusic(msg.d.track); } catch (e) {} }
        }
        break;
      case 'full':
        alert(msg.d.reason || 'Room is full');
        coopOverlay.classList.add('hidden');
        showScreen('start-screen');
        break;
    }
  }

  function checkAllReady() {
    // Host: start game when all connected players are ready
    if (!Coop.isHost()) return;
    const connected = Object.keys(lobbyState).filter(s => lobbyState[s].connected);
    const allReady = connected.length >= 2 && connected.every(s => lobbyState[s].ready);
    if (allReady) {
      Coop.broadcast('lobby_start', {});
      coopOverlay.classList.add('hidden');
      startCoopGame();
    }
  }

  function startCoopGame() {
    if (!Coop.isCoop()) return;
    startGame();
    window._game.coopActive = true;
    window._game.coopRole = Coop.isHost() ? 'host' : 'guest';
    window._game.peerCash = 0;
    window._game.peerScore = 0;
    window._game.coopLobby = lobbyState; // snapshot for use during game
  }

  wireTap(document.getElementById('coop-host-btn'), () => { Audio.unlock(); openCoopLobby('host'); });
  wireTap(document.getElementById('coop-join-btn'), () => { Audio.unlock(); openCoopLobby('join'); });
  wireTap(document.getElementById('coop-join-go'), () => {
    Audio.unlock();
    const code = (document.getElementById('coop-code-input').value || '').toUpperCase().trim();
    if (code.length !== 4) { alert('Code must be 4 letters'); return; }
    Coop.join(code, () => {});
  });

  // Lobby preset + diff click handlers (delegated since buttons are inside coop overlay)
  document.querySelectorAll('.coop-preset').forEach(btn => {
    wireTap(btn, () => {
      const preset = btn.getAttribute('data-preset');
      applyPreset(preset);
      customization.preset = preset.toUpperCase();
      sendMyPick();
      document.querySelectorAll('.coop-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawCoopPreview();
    });
  });

  function drawCoopPreview() {
    const cv = document.getElementById('coop-char-preview');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Tint with player's slot color (if known) so they see themselves as they'll appear
    const tints = ['#ff0033', '#00aaff', '#ffcc00', '#00ff66'];
    const slot = Coop.isHost() ? 0 : ((window._game && window._game.myCoopSlot) || 1);
    const previewCust = JSON.parse(JSON.stringify(customization));
    previewCust.fit = tints[slot];
    try { Sprites.drawPlayer(ctx, 60, 90, previewCust, 'down', 0); } catch (e) {}
    // Slot label
    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.fillStyle = tints[slot]; ctx.textAlign = 'center';
    ctx.fillText('P' + (slot + 1) + ' (YOU)', 60, 145);
  }
  document.querySelectorAll('.coop-diff').forEach(btn => {
    wireTap(btn, () => {
      // Only host can change difficulty
      if (!Coop.isHost()) {
        document.getElementById('coop-diff-current').textContent = 'WAITING FOR HOST...';
        return;
      }
      const diff = btn.getAttribute('data-diff');
      save.difficulty = diff;
      persist();
      // Update display + broadcast to all guests
      document.getElementById('coop-diff-current').textContent = 'CURRENT: ' + diff.toUpperCase();
      document.querySelectorAll('.coop-diff').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Coop.broadcast('lobby_diff', { difficulty: diff });
    });
  });
  wireTap(document.getElementById('coop-back-btn'), () => {
    Coop.disconnect();
    coopOverlay.classList.add('hidden');
    showScreen('start-screen');
  });

  // Revive button (coop only) — costs $4200 from your own bank
  const reviveBtn = document.getElementById('coop-revive-btn');
  if (reviveBtn) {
    wireTap(reviveBtn, () => {
      if ((save.cashBank || 0) >= 4200) {
        save.cashBank -= 4200;
        persist();
        // Heal local player + clear gameover state
        if (game.player) { game.player.hp = game.player.maxHp; game.player.dead = false; }
        if (game.coopActive) Coop.broadcast('revive', { by: 'partner' });
        document.getElementById('gameover-overlay').classList.add('hidden');
        game.state = 'playing';
        document.body.classList.add('playing');
      } else {
        alert('Need $4200 in your bank to revive');
      }
    });
  }
  wireTap(document.getElementById('coop-ready-btn'), () => {
    Audio.unlock();
    if (Coop.isHost()) {
      lobbyState[0].ready = true;
      renderLobbySlots();
      Coop.broadcast('lobby_ready', { slot: 0, ready: true });
      checkAllReady();
    } else {
      // Mark own slot ready instantly for UI feedback (host will confirm via broadcast)
      const mySlot = (window._game && window._game.myCoopSlot) || 1;
      if (lobbyState[mySlot]) {
        lobbyState[mySlot].ready = true;
        renderLobbySlots();
      }
      Coop.send('lobby_ready', { ready: true });
    }
    document.getElementById('coop-ready-btn').textContent = '✓ READY — WAITING FOR ALL';
    document.getElementById('coop-ready-btn').disabled = true;
  });
  function checkBothReady() { /* replaced by checkAllReady */ }

  wireTap(document.getElementById('howto-btn'), () => { Audio.unlock(); showScreen('howto-screen'); });
  wireTap(document.getElementById('howto-back'), () => showScreen('start-screen'));
  wireTap(document.getElementById('shop-btn'), () => { Audio.unlock(); renderShop(); showScreen('shop-screen'); });

  // Shop category tabs
  document.querySelectorAll('.shop-tab').forEach(tab => {
    wireTap(tab, () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.getAttribute('data-cat');
      document.querySelectorAll('.shop-item').forEach(it => {
        if (cat === 'all') it.classList.remove('hidden-cat');
        else if (it.getAttribute('data-cat') === cat) it.classList.remove('hidden-cat');
        else it.classList.add('hidden-cat');
      });
    });
  });
  wireTap(document.getElementById('shop-back'), () => {
    if (game.shopFromPause) {
      // Returning to mid-game pause — apply unlocks live, reopen pause overlay
      if (save.unlocks.shotgun) game.player.unlockedWeapons.add(5);
      if (save.unlocks.stungun) game.player.unlockedWeapons.add(6);
      if (save.unlocks.goldDraco) game.player.unlockedWeapons.add(7);
      if (save.unlocks.goldRpg) game.player.unlockedWeapons.add(8);
      if (save.unlocks.plasma) game.player.unlockedWeapons.add(9);
      if (save.unlocks.tesla) game.player.unlockedWeapons.add(10);
      if (save.unlocks.flamer) game.player.unlockedWeapons.add(11);
      if (save.unlocks.freeze) game.player.unlockedWeapons.add(12);
      if (save.unlocks.honeyUzi) game.player.unlockedWeapons.add(13);
      game.player.applyUpgrades(save.upgrades);
      const newTruckMax = 130 + (save.upgrades.truckHp * 60);
      const truckBonus = newTruckMax - game.truck.maxHp;
      if (truckBonus > 0) game.truck.hp = Math.min(newTruckMax, game.truck.hp + truckBonus);
      game.truck.maxHp = newTruckMax;
      showScreen('game-screen');
      pauseOverlay.classList.remove('hidden');
      document.getElementById('shop-back').textContent = 'BACK';
      game.shopFromPause = false;
      updateWeaponBar();
      refreshTrackRowVisibility(); // refresh audio player in case new tracks unlocked
    } else {
      showScreen('start-screen');
      refreshHighScoreUI();
      refreshTrackRowVisibility();
    }
  });
  wireTap(document.getElementById('scores-btn'), () => { Audio.unlock(); renderScores(); showScreen('scores-screen'); });
  wireTap(document.getElementById('scores-back'), () => showScreen('start-screen'));
  wireTap(document.getElementById('stats-btn'), () => { Audio.unlock(); renderStats(); showScreen('stats-screen'); });
  wireTap(document.getElementById('stats-back'), () => showScreen('start-screen'));

  function renderStats() {
    const el = document.getElementById('stats-list');
    if (!el) return;
    const s = save;
    const bosses = s.bossesBeaten || [];
    const rows = [
      ['TOTAL KILLS', s.totalKills || 0],
      ['HIGH SCORE', s.highScore || 0],
      ['BANKED CASH', '$' + (s.cashBank || 0)],
      ['RUNS PLAYED', s.runsPlayed || 0],
      ['BEST WAVE', s.bestWave || 0],
      ['GIANT CRAB DEFEATED', bosses.includes('giantCrab') ? '✓' : '—'],
      ['2SLIMEY DEFEATED', bosses.includes('slimey') ? '✓' : '—'],
      ['MIRROR 2X DEFEATED', bosses.includes('mirror') ? '✓' : '—'],
      ['★ FINALE COMPLETED', bosses.includes('finale') ? '✓' : '—'],
      ['WEAPONS UNLOCKED', Object.keys(s.unlocks || {}).filter(k => s.unlocks[k]).length],
      ['POWERS STORED', (s.powers || []).length],
    ];
    el.innerHTML = rows.map(r => `<div class="score-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
  }

  // ============ SHOP ============
  const shopItems = [
    { key: 'weaponDmg', kind: 'upgrade', name: 'Weapon Damage', desc: '+20% damage per level', cost: l => 200 + l*200, max: 5 },
    { key: 'truckHp', kind: 'upgrade', name: 'Truck Armor', desc: '+60 HP per level', cost: l => 400 + l*350, max: 5 },
    { key: 'moveSpeed', kind: 'upgrade', name: 'Move Speed', desc: '+10% per level', cost: l => 250 + l*250, max: 3 },
    { key: 'shotgun', kind: 'unlock', name: 'SAWED-OFF', desc: '6-pellet spread, devastating up close', cost: 600 },
    { key: 'stungun', kind: 'unlock', name: 'STUN GUN', desc: 'Sonic scream, AOE + slows', cost: 800 },
    { key: 'extraTracks', kind: 'unlock', name: '🎶 BONUS PLAYLIST', desc: 'Unlocks RANDOM SHUFFLE in your audio player', cost: 400 },
    { key: 'schizo', kind: 'consumable', name: 'SCHIZO COMPANION', desc: 'Follows you 3 rounds, shoots crabs', cost: 900 },
    { key: 'maxHpUp', kind: 'upgrade', name: 'Max HP', desc: '+25 max HP per level', cost: l => 200 + l*200, max: 4 },
    { key: 'pwr_shockwave', kind: 'power', name: '⚡ SHOCKWAVE', desc: 'Q to release a 250px AOE pulse', cost: 250 },
    { key: 'pwr_nuke', kind: 'power', name: '☢ NUKE', desc: 'Q to wipe screen + 400 dmg to bosses', cost: 600 },
    { key: 'pwr_heal', kind: 'power', name: '✚ MEDPACK', desc: 'Q for full HP restore + 6s regen', cost: 500 },
    { key: 'pwr_timewarp', kind: 'power', name: '⌛ TIME WARP', desc: 'Q for 10s of deep slo-mo', cost: 350 },
    { key: 'pwr_timestop', kind: 'power', name: '⏱ TIME STOP', desc: 'Q to FREEZE all enemies for 3s', cost: 900 },
    { key: 'pwr_berserk', kind: 'power', name: '🦀 RAGE', desc: 'Q to become a crab for 10s — chomp everything', cost: 500 },
    { key: 'pwr_truckfix', kind: 'power', name: '🔧 TRUCK FIX', desc: 'Q to restore 35% truck HP', cost: 750 },
    { key: 'goldDraco', kind: 'unlock', name: '★ GOLD DRACO', desc: 'Legendary — faster, hits harder, pierces', cost: 1500 },
    { key: 'goldRpg', kind: 'unlock', name: '★ GOLD RPG', desc: 'Legendary — 200 dmg, 200px splash', cost: 2000 },
    { key: 'plasma', kind: 'unlock', name: '★ PLASMA', desc: 'Gold — piercing plasma balls + splash', cost: 1800 },
    { key: 'honeyUzi', kind: 'unlock', name: '🍯 HONEY UZI', desc: 'Gold — fast fire, slows enemies on hit', cost: 1900 },
    { key: 'tesla', kind: 'unlock', name: '⚡ TESLA COIL', desc: 'EPIC — chain lightning, hops 6 enemies', cost: 3000 },
    { key: 'flamer', kind: 'unlock', name: '🔥 FLAMETHROWER', desc: 'EPIC — close-range burn DOT stream', cost: 2500 },
    { key: 'freeze', kind: 'unlock', name: '❄️ FREEZE GUN', desc: 'EPIC — freezes nearby crabs, shatter for bonus', cost: 2800 },
  ];
  function renderShop() {
    const wrap = document.getElementById('shop-items'); wrap.innerHTML = '';
    document.getElementById('shop-cash').textContent = `$${save.cashBank}`;
    for (const item of shopItems) {
      const div = document.createElement('div'); div.className = 'shop-item';
      div.setAttribute('data-cat', item.kind);
      // Tier color border for weapon unlocks
      if (item.kind === 'unlock') {
        const tierMap = {
          shotgun: 'green', stungun: 'green',
          goldDraco: 'gold', goldRpg: 'gold', plasma: 'gold', honeyUzi: 'gold',
          tesla: 'red', flamer: 'red', freeze: 'red',
        };
        if (tierMap[item.key]) div.className += ' tier-' + tierMap[item.key];
      }
      let bodyHTML, btnHTML;
      if (item.kind === 'upgrade') {
        const lvl = save.upgrades[item.key] || 0;
        const maxed = lvl >= item.max;
        const cost = maxed ? 0 : item.cost(lvl);
        bodyHTML = `<div class="shop-name">${item.name} ${'★'.repeat(lvl)}${'☆'.repeat(item.max - lvl)}</div><div class="shop-desc">${item.desc}</div>`;
        btnHTML = maxed ? `<button class="shop-buy maxed" disabled>MAX</button>` : `<button class="shop-buy" data-key="${item.key}" data-kind="upgrade" data-cost="${cost}">$${cost}</button>`;
      } else if (item.kind === 'consumable') {
        const count = save.consumables?.[item.key] || 0;
        bodyHTML = `<div class="shop-name">${item.name} ${count > 0 ? 'x' + count : ''}</div><div class="shop-desc">${item.desc}</div>`;
        btnHTML = `<button class="shop-buy" data-key="${item.key}" data-kind="consumable" data-cost="${item.cost}">$${item.cost}</button>`;
      } else if (item.kind === 'power') {
        // Show how many you currently have stored for this power across the queue
        const stored = (save.powers || []).filter(p => p === item.key).length;
        const totalStored = (save.powers || []).length;
        const full = totalStored >= 5;
        bodyHTML = `<div class="shop-name">${item.name}${stored > 0 ? ' x' + stored : ''}</div><div class="shop-desc">${item.desc}</div>`;
        btnHTML = full ? `<button class="shop-buy maxed" disabled>BAG FULL</button>` : `<button class="shop-buy" data-key="${item.key}" data-kind="power" data-cost="${item.cost}">$${item.cost}</button>`;
      } else {
        const owned = !!save.unlocks[item.key];
        bodyHTML = `<div class="shop-name">${item.name} ${owned?'✓':''}</div><div class="shop-desc">${item.desc}</div>`;
        btnHTML = owned ? `<button class="shop-buy maxed" disabled>OWNED</button>` : `<button class="shop-buy" data-key="${item.key}" data-kind="unlock" data-cost="${item.cost}">$${item.cost}</button>`;
      }
      div.innerHTML = bodyHTML + btnHTML;
      wrap.appendChild(div);
    }
    wrap.querySelectorAll('.shop-buy:not(.maxed)').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key, kind = btn.dataset.kind, cost = parseInt(btn.dataset.cost, 10);
        if (save.cashBank < cost) {
          btn.textContent = 'TOO BROKE';
          setTimeout(() => renderShop(), 800);
          return;
        }
        save.cashBank -= cost;
        if (kind === 'upgrade') save.upgrades[key] = (save.upgrades[key] || 0) + 1;
        else if (kind === 'consumable') {
          save.consumables = save.consumables || {};
          save.consumables[key] = (save.consumables[key] || 0) + 1;
        }
        else if (kind === 'power') {
          save.powers = save.powers || [];
          if (save.powers.length < 5) save.powers.push(key);
        }
        else {
          save.unlocks[key] = true;
          // Map weapon shop key → weapon slot index, auto-equip it
          const weaponSlots = { shotgun: 5, stungun: 6, goldDraco: 7, goldRpg: 8, plasma: 9, tesla: 10, flamer: 11 };
          const slotIdx = weaponSlots[key];
          if (slotIdx !== undefined && game.player) {
            game.player.unlockedWeapons.add(slotIdx);
            // If equipped set is under cap, just add it
            if (game.player.equippedWeapons.size < 5) {
              game.player.equippedWeapons.add(slotIdx);
            } else {
              // Replace oldest non-locked equipped (not fists/crab)
              for (const s of game.player.equippedWeapons) {
                if (s !== 2 && s !== 4) {
                  game.player.equippedWeapons.delete(s);
                  game.player.equippedWeapons.add(slotIdx);
                  break;
                }
              }
            }
          }
          if (key === 'goldDraco' || key === 'goldRpg' || key === 'plasma' || key === 'tesla' || key === 'flamer') {
            if (game.player) game.spawnFloater(game.player.x, game.player.y - 40, '★ LEGENDARY UNLOCKED', '#ffcc00', 22, -0.4);
          }
        }
        persist();
        try { Audio.sfx.cash(); } catch (e) {}
        renderShop();
      });
    });
  }

  // ============ SCORES ============
  function renderScores() {
    const wrap = document.getElementById('scores-list'); wrap.innerHTML = '';
    if (!save.highScores.length) {
      wrap.innerHTML = '<div class="score-row"><span class="score-rank">--</span><span class="score-stats">no scores yet</span></div>';
      return;
    }
    save.highScores.slice(0, 5).forEach((s, i) => {
      const div = document.createElement('div');
      div.className = 'score-row' + (i === 0 ? ' top' : '');
      div.innerHTML = `<span class="score-rank">#${i+1}</span><span class="score-stats">${s.score} pts · Wave ${s.wave}</span><span class="score-date">${s.date || ''}</span>`;
      wrap.appendChild(div);
    });
  }

  // ============ START GAME ============
  function startGame() {
    showScreen('game-screen');
    Input.init(canvas);
    Input.resetTransient();
    resetGame();
    Audio.playMusic('gameplay');
    game.state = 'playing';
    document.body.classList.add('playing');
    // COOP: set roles + spawn partner players based on lobby
    if (Coop.isCoop()) {
      game.coopActive = true;
      game.coopRole = Coop.isHost() ? 'host' : 'guest';
      game.peerCash = 0;
      game.peerScore = 0;
      const tints = ['#ff0033', '#00aaff', '#ffcc00', '#00ff66'];
      // Build partner players from lobby state (skip my own slot)
      const mySlot = Coop.isHost() ? 0 : (window._game.myCoopSlot || 1);
      game.partners = []; // array of partner Player objects, indexed by their slot
      for (let s = 0; s < 4; s++) {
        if (s === mySlot) continue;
        const ls = lobbyState[s];
        if (!ls || !ls.connected) { game.partners[s] = null; continue; }
        const pCust = ls.customization || JSON.parse(JSON.stringify(customization));
        pCust.fit = tints[s]; // override fit color with slot tint
        const p = new Player(WORLD_W / 2 + (s - 1) * 30, WORLD_H / 2, pCust);
        p.maxHp = game.player.maxHp;
        p.hp = p.maxHp;
        p.facing = 0; p.frame = 0; p.dir = 'right';
        p._slot = s;
        [0, 1, 2, 3].forEach(slot => p.equippedWeapons.add(slot));
        game.partners[s] = p;
      }
      // Set my own tint — clone customization first to avoid mutating the global
      if (tints[mySlot]) {
        game.player.cust = JSON.parse(JSON.stringify(game.player.cust));
        game.player.cust.fit = tints[mySlot];
      }
      // Tag local player with slot so nameplate shows
      game.player._slot = mySlot;
      game.player._coopLabel = 'P' + (mySlot + 1) + ' (YOU)';
      // Legacy player2 ref for back-compat with 2-player code paths
      game.player2 = game.partners.find(p => p) || null;
    }
    startWave(1);
  }
  function resetGame() {
    game.clearAllTimeouts();
    document.body.classList.add('playing');
    delete game.deathFade;
    game.runKills = 0;
    game.runStartedAt = performance.now();
    game.player = new Player(WORLD_W / 2 - 100, WORLD_H / 2, customization);
    game.player.applyUpgrades(save.upgrades);
    // Apply difficulty player HP scaling
    const diff = getDifficultyMult();
    game.player.maxHp = Math.round(game.player.maxHp * diff.playerHpMult);
    game.player.hp = game.player.maxHp;
    game.difficultyMult = diff;
    save.runsPlayed = (save.runsPlayed || 0) + 1;
    persist();
    if (save.unlocks.shotgun) { game.player.unlockedWeapons.add(5); game.player.equippedWeapons.add(5); }
    if (save.unlocks.stungun) { game.player.unlockedWeapons.add(6); game.player.equippedWeapons.add(6); }
    if (save.unlocks.goldDraco) { game.player.unlockedWeapons.add(7); game.player.equippedWeapons.add(7); }
    if (save.unlocks.goldRpg) { game.player.unlockedWeapons.add(8); game.player.equippedWeapons.add(8); }
    if (save.unlocks.plasma) { game.player.unlockedWeapons.add(9); game.player.equippedWeapons.add(9); }
    if (save.unlocks.tesla) { game.player.unlockedWeapons.add(10); game.player.equippedWeapons.add(10); }
    if (save.unlocks.flamer) { game.player.unlockedWeapons.add(11); game.player.equippedWeapons.add(11); }
    if (save.unlocks.freeze) { game.player.unlockedWeapons.add(12); game.player.equippedWeapons.add(12); }
    if (save.unlocks.honeyUzi) { game.player.unlockedWeapons.add(13); game.player.equippedWeapons.add(13); }
    // Trim equipped to cap of 5 (fists + crab counted, but only fists exists at start)
    while (game.player.equippedWeapons.size > 5) {
      for (const s of game.player.equippedWeapons) {
        if (s !== 2 && s !== 4 && s !== 0) { game.player.equippedWeapons.delete(s); break; }
      }
    }
    game.truck = new Truck(WORLD_W / 2 + 80, WORLD_H / 2);
    game.truck.maxHp = 130 + (save.upgrades.truckHp * 60);
    game.truck.hp = game.truck.maxHp;
    Object.assign(game, {
      enemies: [], bullets: [], powerUps: [], cash: [], particles: [], toxicPools: [],
      floaters: [], dust: [], bloodSplats: [], lightnings: [], sonicWaves: [],
      partyPickups: [], dancers: [], follower: null, followers: [], recruitedDancer: null,
      schizoCompanion: null, schizoWavesLeft: save.schizoWavesLeft || 0,
      gibs: [], hitstopUntil: 0,
      drunkUntil: 0, smokeUntil: 0,
      wave: 0, score: 0, cashCollected: 0, waveKills: 0, waveDamageTaken: 0,
      spawnQueue: 0, spawnTimer: 0, waveActive: false, bossActive: false,
      arenaActive: false, arenaType: null, crabGunSpawned: false,
      timeScale: 1, combo: 0, comboTimer: 0, multiplier: 1, killstreak: 0,
      multiKillCount: 0, bossIntroAlpha: 0, bossLightningTimer: 0,
    });
    game.shake.intensity = 0;
    updateWeaponBar();
  }

  // ============ WAVES ============
  function startWave(n) {
    game.timeScale = 1;
    game.timeScaleEnd = 0;
    game.hitstopUntil = 0;
    game.toxicPools = []; // clear lingering toxic pools from previous wave
    // If user picked RANDOM track, swap music on every non-boss wave so each one feels fresh
    if (save.gameplayTrack === 'random' && !Waves.isBossWave(n) && n > 1) {
      try { Audio.playMusic('gameplay'); } catch (e) {}
    }
    // First-time tutorial hint — shows controls only on first-ever wave 1
    if (n === 1 && !localStorage.getItem('crabcage_tutorial_seen')) {
      game.schedule(() => {
        if (game.state !== 'playing') return;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const hint = isTouch
          ? 'DRAG LEFT SIDE TO MOVE · TAP FIRE BUTTON TO SHOOT'
          : 'WASD TO MOVE · HOLD SPACE TO AIM + FIRE · TAB TO PAUSE';
        game.spawnFloater(WORLD_W / 2, WORLD_H / 2 + 80, hint, '#ffcc00', 14, -0.15, 5000);
      }, 600);
      // Mark as seen after first wave starts
      try { localStorage.setItem('crabcage_tutorial_seen', '1'); } catch (e) {}
    }
    game.wave = n;
    const cfg = Waves.getWaveConfig(n);
    game.waveActive = true; game.bossActive = false;
    game.arenaActive = false; game.arenaType = null;
    game.waveKills = 0; game.waveDamageTaken = 0;
    setBgTint(n);
    // Subtitle for special waves
    let subtitle = '';
    if (n === 30) subtitle = '★ THE FINALE ★';
    else if (cfg.type === 'boss') subtitle = '— BOSS —';
    else if (n === 14) subtitle = 'BOSS NEXT';
    else if (n === 16) subtitle = 'AFTERPARTY OVER';
    else if (n === 29) subtitle = 'FINALE NEXT';
    showWaveBanner(`WAVE ${n}`, subtitle);
    // COOP: broadcast wave start to all guests
    if (game.coopActive && game.coopRole === 'host') {
      Coop.broadcast('wave_start', { n, subtitle });
    }
    if (cfg.type === 'boss') {
      Audio.playMusic('boss');
      if (game.coopActive && game.coopRole === 'host') {
        try { Coop.broadcast('music', { track: 'boss' }); } catch (e) {}
      }
      game.bossActive = true; game.bossIntroAlpha = 1;
      game.arenaActive = true; game.arenaType = cfg.arena;
      game.player.x = WORLD_W / 2; game.player.y = WORLD_H / 2 + 80;
      game.schedule(() => spawnBoss(cfg.boss, cfg.hpMult), 1500);
      game.spawnQueue = cfg.minions; game.spawnTimer = 800;
      game.bossLightningTimer = 4500;
    } else {
      if (n > 1) {
        Audio.playMusic('gameplay');
        if (game.coopActive && game.coopRole === 'host') {
          try { Coop.broadcast('music', { track: 'gameplay' }); } catch (e) {}
        }
      }
      game.spawnQueue = cfg.enemyCount; game.spawnTimer = cfg.spawnInterval;
    }
    if (!game.crabGunSpawned && n >= 6) {
      game.powerUps.push(new PowerUp(WORLD_W / 2, 100, 'crab-gun'));
      game.crabGunSpawned = true;
    }
    // First-wave tutorial hint
    if (n === 1 && save.totalKills === 0) {
      const isTouch = ('ontouchstart' in window);
      const msg = isTouch
        ? 'JOYSTICK MOVE · FIRE SHOOT · Q POWER'
        : 'WASD MOVE · CLICK FIRE · HOLD SPACE AUTO-AIM · Q POWER · TAB PAUSE';
      game.spawnFloater(WORLD_W/2, WORLD_H/2 + 80, msg, '#ffee00', 13, -0.15);
    }
    // Schizo companion handling — if user bought one and not active, activate; else decrement
    if (cfg.type !== 'boss') {
      if (!game.schizoCompanion && save.consumables && save.consumables.schizo > 0 && game.schizoWavesLeft <= 0) {
        save.consumables.schizo--;
        game.schizoWavesLeft = 3;
        save.schizoWavesLeft = game.schizoWavesLeft;
        persist();
        game.schizoCompanion = new SchizoCompanion(game.player.x - 40, game.player.y);
        game.spawnFloater(WORLD_W / 2, 100, 'SCHIZO IS WITH YOU', '#ff0033', 22, -0.4);
        try { Audio.sfx.combo(); } catch (e) {}
      } else if (game.schizoCompanion) {
        game.schizoWavesLeft--;
        save.schizoWavesLeft = game.schizoWavesLeft;
        persist();
        if (game.schizoWavesLeft <= 0) {
          game.schizoCompanion = null;
          game.spawnFloater(WORLD_W / 2, 100, 'SCHIZO LEFT', '#888', 18, -0.4);
        }
      }
    }
    try { Audio.sfx.levelUp(); } catch (e) {}
  }
  function setBgTint(n) {
    // 11 distinct tints cycle through, but vary saturation by wave range
    const tints = ['#1a0f08','#1f0d20','#0f1a1f','#1f1f0a','#2a1010','#1f0a2a','#0a1a1f','#2a1a0f','#1a0a1f','#0f1f0a','#2a0a0a'];
    game.bgTint = tints[n % tints.length];
    // Sky overlay color shifts per 5-wave range
    const skies = [
      ['#1a0f08','#2a1f15'],   // wave 1-5: dust/desert
      ['#0f0f2a','#1f1f3a'],   // wave 6-10: night/blue
      ['#2a0f1f','#3a1f2a'],   // wave 11-15: pink underworld
      ['#0f2a1f','#1f3a2a'],   // wave 16-20: sickly green (post-party)
      ['#2a1f0f','#3a2a1f'],   // wave 21-25: amber
      ['#1f0a2a','#2a0f3a'],   // wave 26+: purple
    ];
    const rangeIdx = Math.min(skies.length - 1, Math.floor((n - 1) / 5));
    game.bgSky = skies[rangeIdx];
  }
  function spawnEnemy() {
    const cfg = Waves.getWaveConfig(game.wave);
    const diffMult = game.difficultyMult || { enemyHp: 1, enemyDmg: 1 };
    // After-party / post-finale escalation — durability ramps UP each wave past 16
    let postFinaleMult = 1;
    if (game.wave > 16 && game.wave !== 20 && game.wave !== 25 && game.wave !== 30) {
      // Steady durability ramp: +12% HP per wave past 16, capped at +180% by wave 31
      postFinaleMult = 1 + Math.min(1.8, (game.wave - 16) * 0.12);
    }
    if (game.wave > 30) {
      // Endless mode — keep ramping
      postFinaleMult = 1.8 + (game.wave - 30) * 0.15;
    }
    const mod = (cfg.hpMod || 1) * diffMult.enemyHp * postFinaleMult;
    let x, y;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = -20; y = Math.random() * WORLD_H; }
    else if (edge === 1) { x = WORLD_W + 20; y = Math.random() * WORLD_H; }
    else if (edge === 2) { x = Math.random() * WORLD_W; y = -20; }
    else { x = Math.random() * WORLD_W; y = WORLD_H + 20; }
    const r = Math.random();
    const probs = cfg.spawnProbs || {};
    let cum = 0, pick = 'crab';
    cum += probs.paparazzi || 0; if (r < cum) pick = 'paparazzi';
    else { cum += probs.fan || 0; if (r < cum) pick = 'fan';
    else { cum += probs.fastCrab || 0; if (r < cum) pick = 'fastCrab';
    else { cum += probs.tankCrab || 0; if (r < cum) pick = 'tankCrab';
    else { cum += probs.exploder || 0; if (r < cum) pick = 'exploder';
    else { cum += probs.armed || 0; if (r < cum) pick = 'armed';
    else { cum += probs.leaper || 0; if (r < cum) pick = 'leaper';
    else { cum += probs.summoner || 0; if (r < cum) pick = 'summoner';
    }}}}}}}
    let e;
    switch (pick) {
      case 'paparazzi': e = new Paparazzi(x, y, mod); break;
      case 'fan': e = new Fan(x, y, mod); break;
      case 'fastCrab': e = new FastCrab(x, y, mod); break;
      case 'tankCrab': e = new TankCrab(x, y, mod); break;
      case 'exploder': e = new ExploderCrab(x, y, mod); break;
      case 'armed': e = new ArmedCrab(x, y, mod); break;
      case 'leaper': e = new LeaperCrab(x, y, mod); break;
      case 'summoner': e = new SummonerCrab(x, y, mod); break;
      default: e = new Crab(x, y, mod);
    }
    // Apply difficulty damage multiplier
    if (e.contactDamage) e.contactDamage = Math.round(e.contactDamage * diffMult.enemyDmg);
    game.enemies.push(e);
  }
  // Boss cutscene dialogue — each boss gets a unique line, second-round versions get menacing variant
  const BOSS_LINES = {
    giantCrab:    { name: 'GIANT CRAB',  line: '— EMERGES FROM THE SHELL —', tag: 'WAVE 5' },
    slimey:       { name: 'SLIMEY',      line: '— OOZES INTO THE FIGHT —',   tag: 'WAVE 10' },
    mirror2x:     { name: 'MIRROR 2X',   line: '— THE REFLECTION SPEAKS —',  tag: 'WAVE 15 · FINALE' },
    giantCrab2:   { name: 'GIANT CRAB·2', line: '— BIGGER. ANGRIER. ARMORED. —', tag: 'WAVE 20 · ENRAGED' },
    slimey2:      { name: 'SLIMEY·2',    line: '— TOXIC. CORROSIVE. RETURNING. —', tag: 'WAVE 25 · ENRAGED' },
    mirror2x2:    { name: 'MIRROR 2X·∞', line: '— I AM YOUR ENDING —',       tag: 'WAVE 30 · THE FINALE' },
  };

  function showBossCutscene(type, bossName, onDone) {
    const overlay = document.getElementById('boss-cutscene');
    if (!overlay) { onDone(); return; }
    const dialogue = BOSS_LINES[type] || { name: bossName || 'BOSS', line: '— ENTERS THE FIGHT —', tag: 'WAVE ' + game.wave };
    document.getElementById('boss-cutscene-name').textContent = dialogue.name;
    document.getElementById('boss-cutscene-line').textContent = dialogue.line;
    document.getElementById('boss-cutscene-tag').textContent = dialogue.tag;
    // Draw boss portrait into canvas
    const cv = document.getElementById('boss-cutscene-portrait');
    if (cv) {
      const cx = cv.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
      try {
        if (type === 'giantCrab' || type === 'giantCrab2') Sprites.drawGiantCrab(cx, cv.width/2, cv.height/2 + 14, 0, 1, false);
        else if (type === 'slimey' || type === 'slimey2') Sprites.drawSlimey(cx, cv.width/2, cv.height/2, 0, 1, false);
        else Sprites.drawMirror2X(cx, cv.width/2, cv.height/2 + 6, customization, 0, 1, false);
      } catch (e) {}
    }
    overlay.classList.remove('hidden');
    try { Audio.haptic.heavy(); } catch (e) {}
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      overlay.classList.add('hidden');
      onDone();
    };
    // Auto-advance after 2.4s OR on tap/click
    const skipBtn = document.getElementById('boss-cutscene-skip');
    const skipFn = (e) => { e && e.stopPropagation(); finish(); };
    skipBtn.onclick = skipFn;
    skipBtn.ontouchstart = skipFn;
    overlay.onclick = skipFn;
    setTimeout(finish, 2400);
  }

  function spawnBoss(type, hpMult) {
    // Determine if this is a second-round boss (waves 20+)
    const isSecondRound = game.wave >= 20;
    let cutsceneType = type;
    if (isSecondRound && type === 'giantCrab') cutsceneType = 'giantCrab2';
    else if (isSecondRound && type === 'slimey') cutsceneType = 'slimey2';
    else if (game.wave === 30 && type === 'mirror2x') cutsceneType = 'mirror2x2';

    // Show cutscene first, then spawn the boss
    const doSpawn = () => {
      const x = WORLD_W / 2, y = 80;
      const diffMult = game.difficultyMult || { enemyHp: 1, enemyDmg: 1 };
      const finalMult = hpMult * diffMult.enemyHp;
      let boss;
      if (type === 'giantCrab') boss = new GiantCrab(x, y, finalMult);
      else if (type === 'slimey') boss = new Slimey(x, y, finalMult);
      else boss = new Mirror2X(x, y, customization, finalMult);
      // SECOND ROUND BUFFS — each boss gets a new mechanic on the repeat round
      if (isSecondRound) {
        boss.isSecondRound = true;
        boss.name = boss.name + '·2';
        // Higher contact damage + faster movement
        if (boss.contactDamage) boss.contactDamage = Math.round(boss.contactDamage * 1.4);
        if (typeof boss.speed === 'number') boss.speed *= 1.25;
      }
      // Apply difficulty damage multiplier to boss
      if (boss.contactDamage) boss.contactDamage = Math.round(boss.contactDamage * diffMult.enemyDmg);
      game.enemies.push(boss);
      try { Audio.sfx.boss(); } catch (e) {}
      try { Audio.haptic.heavy(); } catch (e) {}
      game.addScreenShake(20);
      game.hitstop(550);
      game.slowMo(2200, 0.35);
      game.bossIntroAlpha = 2.0;
      game.bossIntroName = boss.name;
      game.bossIntroStart = performance.now();
      // COOP: broadcast boss intro
      if (game.coopActive && game.coopRole === 'host') {
        Coop.broadcast('boss_intro', { name: boss.name });
      }
    };

    showBossCutscene(cutsceneType, null, doSpawn);
  }
  function updateWaves(dt) {
    // Pending wave advance — survives pause/shop/inventory by being a timestamp check
    if (game.pendingNextWave && performance.now() >= game.pendingNextWaveAt && game.state === 'playing') {
      const next = game.pendingNextWave;
      game.pendingNextWave = null;
      game.pendingNextWaveAt = 0;
      startWave(next);
      return;
    }
    if (!game.waveActive) return;
    if (game.spawnQueue > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        spawnEnemy(); game.spawnQueue--;
        const cfg = Waves.getWaveConfig(game.wave);
        game.spawnTimer = cfg.spawnInterval || 700;
      }
    }
    if (game.bossActive) {
      game.bossLightningTimer -= dt;
      if (game.bossLightningTimer <= 0) {
        const lx = 80 + Math.random() * (WORLD_W - 160);
        const ly = 80 + Math.random() * (WORLD_H - 160);
        const tg = 800 - Math.min(400, game.wave * 30);
        game.lightnings.push(new Lightning(lx, ly, tg));
        try { Audio.sfx.thunder(); } catch (e) {}
        game.bossLightningTimer = 2800 + Math.random() * 2500;
      }
    }
    if (game.spawnQueue === 0 && game.enemies.length === 0) {
      game.waveActive = false;
      // Auto-magnet any remaining cash + powerups for cleanup
      for (const c of game.cash) {
        const dx = game.player.x - c.x, dy = game.player.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        c.vx = (dx / d) * 12;
        c.vy = (dy / d) * 12;
      }
      for (const p of game.powerUps) {
        if (p.type === 'crab-gun') continue; // don't auto-collect the unlock
        const dx = game.player.x - p.x, dy = game.player.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * 4;
        p.y += (dy / d) * 4;
      }
      if (game.waveDamageTaken === 0 && game.wave > 0) {
        const bonus = 200 * game.wave;
        game.score += bonus;
        game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 20, `PERFECT WAVE +${bonus}`, '#00ff66', 24, -0.5);
        try { Audio.sfx.combo(); } catch (e) {}
      }
      if (game.arenaActive) { game.arenaActive = false; game.arenaType = null; }
      // After wave 15 (Mirror 2X dies), drop the CD and enter party phase before continuing
      if (game.wave === 15 && !save.bossesBeaten.includes('mirror_partied')) {
        save.bossesBeaten = ['giantCrab','slimey','mirror'];
        persist();
        // Spawn CD at center
        game.partyPickups.push(new PartyPickup(WORLD_W / 2, WORLD_H / 2, 'cd'));
        game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 60, "2X DROPPED A CD", '#ffcc00', 22, -0.4);
        game.state = 'cd-wait'; // not playing, but loop still runs to render
        return;
      }
      // Wave 30 = FINALE — beating the final Mirror 2X rematch wins the game
      if (game.wave === 30) {
        save.bossesBeaten = save.bossesBeaten || [];
        if (!save.bossesBeaten.includes('finale')) save.bossesBeaten.push('finale');
        persist();
        game.schedule(() => game.onVictory(), 1500);
        return;
      }
      const nextWave = game.wave + 1;
      // Wave-clear bonus cash — scales with wave, rewards survival
      const bonusCash = 20 + game.wave * 5;
      const noHitBonus = (game.waveDamageTaken || 0) === 0 ? Math.floor(bonusCash * 0.5) : 0;
      const totalBonus = bonusCash + noHitBonus;
      game.cashCollected += totalBonus;
      // COOP: also credit each active partner
      if (game.coopActive && game.partners) {
        for (const p of game.partners) {
          if (p && !p.dead) {
            p._cashCollected = (p._cashCollected || 0) + totalBonus;
            p._score = (p._score || 0) + totalBonus * 5;
          }
        }
      }
      const bonusText = noHitBonus > 0
        ? `WAVE CLEAR! +$${bonusCash} · NO-HIT +$${noHitBonus}`
        : `WAVE CLEAR! +$${bonusCash}`;
      game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 20, bonusText, noHitBonus > 0 ? '#ffcc00' : '#00ff66', 16, -0.4, 1800);
      try { Audio.sfx.combo(); } catch (e) {}
      // COOP: broadcast wave-clear so guests get the celebration too
      if (game.coopActive && game.coopRole === 'host') {
        Coop.broadcast('wave_clear', { bonus: bonusCash, noHit: noHitBonus });
      }
      // Use a timestamp flag so pause/shop/inventory don't kill the wave advance
      game.pendingNextWave = nextWave;
      game.pendingNextWaveAt = performance.now() + 2000;
    }
  }
  function showWaveBanner(text, subtitle = '') {
    const banner = document.getElementById('wave-banner');
    document.getElementById('banner-text').textContent = text;
    let subEl = document.getElementById('banner-sub');
    if (!subEl && banner) {
      subEl = document.createElement('div');
      subEl.id = 'banner-sub';
      subEl.className = 'banner-sub';
      banner.appendChild(subEl);
    }
    if (subEl) subEl.textContent = subtitle;
    banner.classList.remove('hidden');
    const el = banner.querySelector('h2');
    el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
    game.schedule(() => banner.classList.add('hidden'), 2000);
  }

  // ============ COLLISION ============
  function processBullets(dt) {
    if (game.bullets.length > game.MAX_BULLETS) {
      game.bullets.splice(0, game.bullets.length - game.MAX_BULLETS);
    }
    for (let i = 0; i < game.bullets.length; i++) {
      const b = game.bullets[i];
      try {
        b.update(dt, game);
        if (b.dead) continue;
        if (b.source === 'player') {
          for (let j = 0; j < game.enemies.length; j++) {
            const e = game.enemies[j];
            if (e.dead) continue;
            if (b.hitSet && b.hitSet.has(e)) continue;
            const d = Math.hypot(e.x - b.x, e.y - b.y);
            if (d < e.radius + 4) {
              const crit = Math.random() < 0.15;
              const dmg = b.damage * (crit ? 1.6 : 1);
              try { if (typeof e.damage === 'function') e.damage(dmg, game, crit, b); } catch (er) { console.error('dmg', er); }
              // Damage number floater
              const dmgInt = Math.round(dmg);
              game.spawnFloater(
                e.x + (Math.random() - 0.5) * 12,
                e.y - 8,
                crit ? `${dmgInt}!` : `${dmgInt}`,
                crit ? '#ffff00' : '#ffffff',
                crit ? 14 : 10,
                -0.8 - Math.random() * 0.4
              );
              if (b.splash > 0) {
                game.spawnExplosion(b.x, b.y, '#ff8800', 18);
                try { Audio.sfx.explode(); } catch (er) {}
                game.addScreenShake(10);
                for (const e2 of game.enemies) {
                  if (e2 === e || e2.dead) continue;
                  const dd = Math.hypot(e2.x - b.x, e2.y - b.y);
                  if (dd < b.splash) try { e2.damage(b.damage * 0.6, game, false); } catch (er) {}
                }
              }
              // CHAIN LIGHTNING — TESLA jumps to nearby enemies
              if (b.chainLightning && b.chainHops > 0) {
                let chained = e;
                let chainDmg = b.damage * (b.chainDmg || 0.7);
                const hit = new Set([e]);
                for (let h = 0; h < b.chainHops; h++) {
                  let nearest = null, nearestD = Infinity;
                  for (const e3 of game.enemies) {
                    if (e3.dead || hit.has(e3)) continue;
                    const dd = Math.hypot(e3.x - chained.x, e3.y - chained.y);
                    if (dd < 180 && dd < nearestD) { nearest = e3; nearestD = dd; }
                  }
                  if (!nearest) break;
                  hit.add(nearest);
                  try { nearest.damage(chainDmg, game, false); } catch (er) {}
                  // Draw a quick lightning line from chained → nearest
                  game.lightnings.push({
                    x1: chained.x, y1: chained.y, x2: nearest.x, y2: nearest.y,
                    life: 200, maxLife: 200,
                    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; },
                    draw(ctx) {
                      ctx.strokeStyle = `rgba(120,220,255,${this.life / this.maxLife})`;
                      ctx.lineWidth = 2; ctx.beginPath();
                      ctx.moveTo(this.x1, this.y1);
                      const mx = (this.x1 + this.x2)/2 + (Math.random() - 0.5) * 20;
                      const my = (this.y1 + this.y2)/2 + (Math.random() - 0.5) * 20;
                      ctx.lineTo(mx, my); ctx.lineTo(this.x2, this.y2);
                      ctx.stroke();
                    }
                  });
                  chained = nearest;
                  chainDmg *= 0.85;
                }
              }
              // DOT — FLAMETHROWER applies burn over time
              if (b.dot && e.hp > 0) {
                e.dotEnd = performance.now() + (b.dotDuration || 1500);
                e.dotDmg = b.dotDmg || 4;
              }
              // HONEY UZI — slow on hit
              if (b.slow && e.hp > 0) {
                e.slowMult = b.slow;
                e.slowUntil = performance.now() + (b.slowDuration || 1200);
                game.spawnSparks(e.x, e.y, '#ffcc00', 2);
              }
              // FREEZE GUN — freezes hit enemy + all crabs within AOE
              if (b.freezeAoe) {
                const now = performance.now();
                const freezeEnd = now + (b.freezeDuration || 2000);
                // Freeze the direct hit
                e.frozenUntil = freezeEnd;
                e.frozen = true;
                game.spawnSparks(e.x, e.y, '#88ddff', 6);
                // AOE freeze nearby
                for (const e2 of game.enemies) {
                  if (e2.dead || e2 === e) continue;
                  const dd = Math.hypot(e2.x - e.x, e2.y - e.y);
                  if (dd < b.freezeAoe) {
                    e2.frozenUntil = freezeEnd;
                    e2.frozen = true;
                    game.spawnSparks(e2.x, e2.y, '#88ddff', 3);
                  }
                }
                // Pulse ring visual
                game.sonicWaves.push({
                  x: e.x, y: e.y, radius: 10, maxRadius: b.freezeAoe,
                  life: 400, maxLife: 400, color: '#88ddff',
                  update(dt) {
                    this.life -= dt;
                    this.radius = this.maxRadius * (1 - this.life / this.maxLife);
                    if (this.life <= 0) this.dead = true;
                  },
                  draw(ctx) {
                    ctx.strokeStyle = `rgba(136,221,255,${this.life / this.maxLife})`;
                    ctx.lineWidth = 3; ctx.beginPath();
                    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.stroke();
                  }
                });
              }
              // FREEZE GUN: shatter bonus — frozen enemies that die spawn ice particles
              if (e.frozen && e.hp <= 0 && b.shatterBonus) {
                for (let i = 0; i < 8; i++) {
                  const a = Math.random() * Math.PI * 2;
                  game.particles.push({
                    x: e.x, y: e.y,
                    vx: Math.cos(a) * (3 + Math.random() * 2),
                    vy: Math.sin(a) * (3 + Math.random() * 2),
                    life: 700, maxLife: 700, color: '#88ddff', size: 3 + Math.random() * 2,
                    update(dt) { this.x += this.vx * dt * 0.06; this.y += this.vy * dt * 0.06; this.life -= dt; if (this.life <= 0) this.dead = true; },
                    draw(ctx) { ctx.fillStyle = `rgba(136,221,255,${this.life / this.maxLife})`; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); }
                  });
                }
              }
              const ang = Math.atan2(b.vy, b.vx);
              game.spawnSparks(b.x, b.y, crit ? '#ffff00' : '#ffaaaa', crit ? 6 : 3, ang + Math.PI, Math.PI * 0.6);
              if (!b.pierce) { b.dead = true; break; }
              else { b.hitSet.add(e); }
            }
          }
        } else {
          const dp = Math.hypot(game.player.x - b.x, game.player.y - b.y);
          if (dp < game.player.radius + 4) {
            try { game.player.damage(b.damage, game); } catch (er) {}
            try { Audio.haptic.hit(); } catch (er) {}
            if (b.splash > 0) { game.spawnExplosion(b.x, b.y, '#ff8800', 12); try { Audio.sfx.explode(); } catch (er) {} game.addScreenShake(8); }
            else game.addScreenShake(3);
            b.dead = true; continue;
          }
          // COOP: enemy bullets damage partners too
          if (game.coopActive && game.partners) {
            let hitPartner = false;
            for (const partner of game.partners) {
              if (!partner || partner.dead) continue;
              const dpp = Math.hypot(partner.x - b.x, partner.y - b.y);
              if (dpp < (partner.radius || 12) + 4) {
                try { partner.damage(b.damage, game); } catch (er) {}
                if (b.splash > 0) { game.spawnExplosion(b.x, b.y, '#ff8800', 12); try { Audio.sfx.explode(); } catch (er) {} }
                b.dead = true; hitPartner = true; break;
              }
            }
            if (hitPartner) continue;
          }
          if (!game.arenaActive && game.truck) {
            const dt2 = Math.hypot(game.truck.x - b.x, game.truck.y - b.y);
            if (dt2 < game.truck.radius + 8) {
              try { game.truck.damage(b.damage); } catch (er) {}
              game.spawnSparks(b.x, b.y, '#ffaa00', 3);
              if (b.splash > 0) { game.spawnExplosion(b.x, b.y, '#ff8800', 12); try { Audio.sfx.explode(); } catch (er) {} game.addScreenShake(6); }
              else game.addScreenShake(2);
              b.dead = true; continue;
            }
          }
        }
      } catch (err) {
        console.error('bullet', err);
        b.dead = true;
      }
    }
    game.bullets = game.bullets.filter(b => !b.dead);
  }

  // ============ MAIN LOOP (BULLETPROOF) ============
  let lastTime = performance.now();
  function loop(now) {
    try {
      let dt = Math.min(40, now - lastTime);
      lastTime = now;
      // Hitstop — freeze the world briefly for impact
      if (now < game.hitstopUntil) dt = 0;
      // Faster recovery from slo-mo (was 0.05/frame, now 0.12/frame for ~100ms instead of 400ms)
      if (game.timeScale < 1 && now > game.timeScaleEnd) game.timeScale = Math.min(1, game.timeScale + 0.12);
      const scaledDt = dt * game.timeScale;
      if (game.state === 'playing' || game.state === 'cd-wait' || game.state === 'party') {
        try { update(scaledDt); } catch (err) { console.error('upd', err); }
        // COOP: broadcast state at ~15Hz (every 4 frames at 60fps)
        if (game.coopActive && game.coopRole === 'host' && Coop.isConnected()) {
          game._coopBcCounter = (game._coopBcCounter || 0) + 1;
          if (game._coopBcCounter % 4 === 0) broadcastCoopState();
        }
        // COOP: guest sends inputs every frame
        if (game.coopActive && game.coopRole === 'guest' && Coop.isConnected()) {
          sendCoopInput();
        }
      }
      try { render(); } catch (err) { console.error('rnd', err); }
    } catch (outer) { console.error('loop', outer); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ============ COOP STATE SYNC ============
  function broadcastCoopState() {
    if (!Coop.isConnected()) return;
    const players = {};
    if (game.player) {
      players[0] = {
        x: Math.round(game.player.x), y: Math.round(game.player.y),
        hp: Math.round(game.player.hp), maxHp: game.player.maxHp,
        face: game.player.facing, dead: !!game.player.dead,
        wep: game.player.weaponIdx,
        cash: game.cashCollected, score: game.score,
      };
    }
    if (game.partners) {
      for (let s = 1; s < 4; s++) {
        const p = game.partners[s];
        if (!p) continue;
        players[s] = {
          x: Math.round(p.x), y: Math.round(p.y),
          hp: Math.round(p.hp), maxHp: p.maxHp,
          face: p.facing, dead: !!p.dead, wep: p.weaponIdx,
          cash: p._cashCollected || 0, score: p._score || 0,
        };
      }
    }
    const state = {
      players,
      wave: game.wave,
      truckHp: game.truck ? Math.round(game.truck.hp) : 0,
      truckMaxHp: game.truck ? game.truck.maxHp : 1,
      enemies: game.enemies.slice(0, 60).map(e => ({
        i: e._id || (e._id = Math.random().toString(36).slice(2,7)),
        x: Math.round(e.x), y: Math.round(e.y),
        h: Math.round(e.hp || 0), mh: Math.round(e.maxHp || 1),
        t: e.constructor.name, r: e.radius || 12,
        b: !!e.isBoss, fr: !!e.frozen,
      })),
      bullets: game.bullets.slice(0, 80).map(b => ({
        x: Math.round(b.x), y: Math.round(b.y),
        s: b.source === 'player' ? 1 : 0,
      })),
    };
    Coop.broadcast('state', state);
  }

  function sendCoopInput() {
    if (!Coop.isConnected()) return;
    const input = {
      mx: Input.getMoveX ? Input.getMoveX() : 0,
      my: Input.getMoveY ? Input.getMoveY() : 0,
      fire: !!(Input.isFiring && Input.isFiring()),
      aim: Input.getAimAngle ? Input.getAimAngle() : 0,
      wep: game.player ? game.player.weaponIdx : 0,
      dash: Input.consumeDash ? Input.consumeDash() : false,
      power: Input.consumePower ? Input.consumePower() : false,
      reload: Input.isKey ? Input.isKey('r') : false,
    };
    Coop.send('input', input);
  }

  function updateGuestFromHostState() {
    const hs = game.hostState;
    if (!hs) return;
    game.wave = hs.wave;
    if (game.truck) { game.truck.hp = hs.truckHp; game.truck.maxHp = hs.truckMaxHp; }
    const mySlot = window._game.myCoopSlot || 1;
    // Update own player from my slot's state
    if (hs.players && hs.players[mySlot] && game.player) {
      const me = hs.players[mySlot];
      game.player.x = me.x; game.player.y = me.y;
      game.player.hp = me.hp; game.player.maxHp = me.maxHp;
      game.player.dead = me.dead;
      // Sync own cash + score so HUD updates correctly
      if (typeof me.cash === 'number') game.cashCollected = me.cash;
      if (typeof me.score === 'number') game.score = me.score;
    }
    // Update partners from other slots' states
    if (game.partners && hs.players) {
      for (let s = 0; s < 4; s++) {
        if (s === mySlot) continue;
        const partnerState = hs.players[s];
        const partner = game.partners[s];
        if (partner && partnerState) {
          // Lerp toward target position for smoothness (state arrives at ~15Hz, render at 60Hz)
          const lerp = 0.35;
          const dx = partnerState.x - partner.x;
          const dy = partnerState.y - partner.y;
          const dist = Math.hypot(dx, dy);
          // If teleport-sized jump, snap; otherwise lerp
          if (dist > 100) { partner.x = partnerState.x; partner.y = partnerState.y; }
          else { partner.x += dx * lerp; partner.y += dy * lerp; }
          partner.hp = partnerState.hp; partner.maxHp = partnerState.maxHp;
          partner.facing = partnerState.face; partner.dead = partnerState.dead;
          partner.weaponIdx = partnerState.wep;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) partner.frame = (partner.frame || 0) + 1;
        }
      }
    }
    // Rebuild enemies + bullets as render proxies
    game.enemies = (hs.enemies || []).map(e => ({
      x: e.x, y: e.y, hp: e.h, maxHp: e.mh, radius: e.r,
      isBoss: e.b, frozen: e.fr, dead: false,
      draw(ctx) {
        try {
          Sprites.drawCrab(ctx, this.x, this.y, 0, this.hp / this.maxHp, false);
          if (this.frozen) { ctx.fillStyle = 'rgba(136,221,255,0.45)'; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2); ctx.fill(); }
        } catch (er) {}
      }
    }));
    game.bullets = (hs.bullets || []).map(b => ({
      x: b.x, y: b.y, source: b.s ? 'player' : 'enemy', dead: false,
      draw(ctx) {
        ctx.fillStyle = b.s ? '#ffaa00' : '#ff4444';
        ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }));
  }

  // Expose game state globally for the coop message handler closure
  window._game = game;

  function update(dt) {
    // COOP GUEST: don't simulate — rebuild render state from received host snapshot
    if (game.coopActive && game.coopRole === 'guest') {
      updateGuestFromHostState();
      return;
    }
    if (game.shake.intensity > 0) {
      game.shake.intensity *= 0.85;
      if (game.shake.intensity < 0.2) game.shake.intensity = 0;
    }
    game.shake.x = (Math.random() - 0.5) * game.shake.intensity;
    game.shake.y = (Math.random() - 0.5) * game.shake.intensity;

    if (game.combo > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) game.breakCombo();
    }
    if (game.bossIntroAlpha > 0) game.bossIntroAlpha = Math.max(0, game.bossIntroAlpha - dt / 1500);

    try { game.player.update(dt, game); } catch (e) { console.error('p', e); }
    // COOP HOST: update each connected partner with their network input
    if (game.coopActive && game.coopRole === 'host' && game.partners) {
      for (let s = 1; s < 4; s++) {
        const partner = game.partners[s];
        if (!partner || partner.dead) continue;
        const gi = game[`guestInput${s}`];
        if (gi) partner.inputSource = gi;
        try { partner.update(dt, game); } catch (e) { console.error('p' + s, e); }
      }
    }
    if (game.schizoCompanion) { try { game.schizoCompanion.update(dt, game); } catch (e) {} }
    if (game.followers && game.followers.length) {
      for (const fl of game.followers) { try { fl.update(dt, game); } catch (e) {} }
    } else if (game.follower) { try { game.follower.update(dt, game); } catch (e) {} }
    for (const pp of game.partyPickups) { try { pp.update(dt, game); } catch (e) {} }
    for (const dn of game.dancers) { try { dn.update(dt, game); } catch (e) {} }
    for (const e of game.enemies) {
      // DOT (burn) tick from FLAMETHROWER
      if (e.dotEnd && performance.now() < e.dotEnd && !e.dead) {
        e.hp -= (e.dotDmg || 4) * (dt / 1000);
        if (Math.random() < 0.3) game.spawnSparks(e.x, e.y - 4, '#ff6600', 1);
        if (e.hp <= 0 && !e.dead) {
          e.dead = true;
          if (game.addKill) game.addKill(e);
        }
      }
      try { e.update(dt, game); } catch (er) { console.error('e', er); e.dead = true; }
    }
    if (!game.arenaActive && game.truck) {
      try { game.truck.update(dt); game.truck.trySuitDude(game); } catch (e) {}
    }
    try { processBullets(dt); } catch (e) {}
    for (const p of game.powerUps) { try { p.update(dt, game); } catch (e) {} }
    for (const c of game.cash) { try { updateCash(c, dt); } catch (e) {} }
    for (const p of game.particles) { try { p.update(dt); } catch (e) { p.dead = true; } }
    for (const l of game.lightnings) { try { l.update(dt, game); } catch (e) { l.dead = true; } }
    for (const g of (game.gibs || [])) { try { g.update(dt); } catch (e) { g.dead = true; } }
    for (const f of game.floaters) { f.y += f.vy; f.vy *= 0.96; f.life -= dt; }
    for (const b of game.bloodSplats) b.life -= dt;
    for (const sw of game.sonicWaves) sw.life -= dt;
    spawnDust();
    for (const d of game.dust) { d.x += d.vx; d.y += d.vy; d.life -= dt; }

    game.enemies     = game.enemies.filter(e => !e.dead);
    game.powerUps    = game.powerUps.filter(p => !p.dead);

    // Toxic pools (Slimey·2 mechanic) — damage anything inside, then expire
    if (game.toxicPools && game.toxicPools.length) {
      const now = performance.now();
      for (const pool of game.toxicPools) {
        pool.life -= dt;
        if (now - pool.lastTick > 400) {
          pool.lastTick = now;
          // Damage all players in the pool
          const allPlayers = [game.player, ...(game.partners || [])].filter(p => p && !p.dead);
          for (const p of allPlayers) {
            if (Math.hypot(p.x - pool.x, p.y - pool.y) < pool.radius) {
              try { p.damage(pool.damage, game); } catch (e) {}
              game.spawnSparks(p.x, p.y, '#00ff00', 2);
            }
          }
        }
      }
      game.toxicPools = game.toxicPools.filter(p => p.life > 0);
    }
    game.particles   = game.particles.filter(p => !p.dead);
    game.floaters    = game.floaters.filter(f => f.life > 0);
    game.cash        = game.cash.filter(c => !c.collected && c.life > 0);
    game.dust        = game.dust.filter(d => d.life > 0 && d.x > -5 && d.x < WORLD_W + 5);
    game.lightnings  = game.lightnings.filter(l => !l.dead);
    game.bloodSplats = game.bloodSplats.filter(b => b.life > 0);
    game.sonicWaves  = game.sonicWaves.filter(s => s.life > 0);
    game.partyPickups = game.partyPickups.filter(p => !p.dead);
    game.dancers      = game.dancers.filter(d => !d.dead);
    game.gibs         = (game.gibs || []).filter(g => !g.dead);
    if (game.gibs.length > game.MAX_GIBS) game.gibs.splice(0, game.gibs.length - game.MAX_GIBS);

    if (!game.arenaActive && game.truck && game.truck.hp <= 0) game.onTruckDeath();
    // Medpack regen — full HP top-up over 6s
    if (game.medpackUntil && performance.now() < game.medpackUntil) {
      if (game.player.hp < game.player.maxHp) game.player.hp = Math.min(game.player.maxHp, game.player.hp + dt * 0.04);
    }
    // Dynamic boss music — speed up as boss HP drops (throttled to avoid stutter)
    if (game.bossActive) {
      game._bossMusicCounter = (game._bossMusicCounter || 0) + 1;
      if (game._bossMusicCounter % 30 === 0) {  // update twice per second, not every frame
        const boss = game.enemies.find(e => e.isBoss && !e.dead);
        if (boss) {
          const hpPct = boss.hp / boss.maxHp;
          const rate = 1.0 + (1 - hpPct) * 0.15;
          const bossEl = document.getElementById('music-boss');
          if (bossEl && !bossEl.paused) {
            const target = rate;
            try {
              const cur = bossEl.playbackRate;
              if (Math.abs(cur - target) > 0.02) bossEl.playbackRate = target;
            } catch (e) {}
          }
        }
      }
    }
    updateWaves(dt);
    updateHUD();
  }

  function updateCash(c, dt) {
    c.life -= dt; c.frame++;
    // Find nearest player to magnet toward (works in solo + coop)
    const np = game.findNearestPlayer ? game.findNearestPlayer(c.x, c.y) : game.player;
    const dx = np.x - c.x, dy = np.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 90) { const pull = (1 - d/90) * 6; c.vx += (dx/d) * pull * 0.2; c.vy += (dy/d) * pull * 0.2; }
    c.x += c.vx; c.y += c.vy; c.vx *= 0.92; c.vy *= 0.92;
    if (Math.abs(c.vx) < 0.05) c.vx = 0;
    if (Math.abs(c.vy) < 0.05) c.vy = 0;
    if (d < (np.radius || 12) + 8) {
      c.collected = true;
      // Credit the player who collected it. In coop, all cash goes to a shared "pot" tracked per slot.
      if (np === game.player) {
        game.cashCollected += c.amount;
        game.score += c.amount * 5;
      } else {
        // A partner collected it — credit their slot. Host tracks each partner's score/cash too.
        np._cashCollected = (np._cashCollected || 0) + c.amount;
        np._score = (np._score || 0) + c.amount * 5;
      }
      try { Audio.sfx.cash(); } catch (e) {}
      game.spawnFloater(c.x, c.y - 8, `+${c.amount * 5}`, '#ffdd00', 11);
    }
  }
  function spawnDust() {
    if (game.dust.length > game.MAX_DUST) return;
    if (Math.random() < 0.3) {
      const fromLeft = Math.random() < 0.5;
      game.dust.push({
        x: fromLeft ? -3 : WORLD_W + 3, y: Math.random() * WORLD_H,
        vx: (fromLeft ? 1 : -1) * (0.3 + Math.random() * 0.6),
        vy: (Math.random() - 0.5) * 0.2,
        life: 8000, size: 1 + Math.random() * 1.5, alpha: 0.15 + Math.random() * 0.25,
      });
    }
  }

  // ============ RENDER ============
  function render() {
    if (game.state === 'menu' || !game.player) return;
    ctx.save();
    ctx.translate(game.shake.x, game.shake.y);
    drawBackground();
    for (const b of game.bloodSplats) { try { Sprites.drawBloodSplat(ctx, b); } catch (e) {} }
    for (const d of game.dust) { ctx.fillStyle = `rgba(180,150,100,${d.alpha * (d.life / 8000)})`; ctx.fillRect(d.x, d.y, d.size, d.size); }
    for (const c of game.cash) { try { Sprites.drawCash(ctx, c.x, c.y, c.frame, c.life / 10000); } catch (e) {} }
    for (const s of game.sonicWaves) { try { Sprites.drawSonicWave(ctx, s); } catch (e) {} }
    for (const l of game.lightnings) { if (!l.struck) try { l.draw(ctx); } catch (e) {} }
    const drawables = [];
    if (!game.arenaActive && game.truck) drawables.push(game.truck);
    drawables.push(...game.enemies, ...game.powerUps, game.player);
    // COOP: render all connected partners
    if (game.coopActive && game.partners) {
      for (const p of game.partners) { if (p && !p.dead) drawables.push(p); }
    }
    if (game.schizoCompanion) drawables.push(game.schizoCompanion);
    if (game.followers && game.followers.length) drawables.push(...game.followers);
    else if (game.follower) drawables.push(game.follower);
    drawables.push(...game.dancers, ...game.partyPickups);
    // Toxic pools (Slimey·2 mechanic) — ground layer, below entities
    if (game.toxicPools && game.toxicPools.length) {
      for (const pool of game.toxicPools) {
        const t = performance.now() / 200;
        const lifeFrac = pool.life / 7000;
        ctx.save();
        const grad = ctx.createRadialGradient(pool.x, pool.y, 0, pool.x, pool.y, pool.radius);
        grad.addColorStop(0, `rgba(0,255,0,${0.35 * lifeFrac})`);
        grad.addColorStop(0.6, `rgba(0,180,0,${0.25 * lifeFrac})`);
        grad.addColorStop(1, `rgba(0,80,0,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(pool.x, pool.y, pool.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(0,255,80,${0.5 * lifeFrac})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pool.x, pool.y, pool.radius + Math.sin(t) * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) { try { d.draw(ctx); } catch (e) {} }
    for (const b of game.bullets) { try { b.draw(ctx); } catch (e) {} }
    for (const p of game.particles) { try { p.draw(ctx); } catch (e) {} }
    for (const g of (game.gibs || [])) { try { g.draw(ctx); } catch (e) {} }
    for (const l of game.lightnings) { if (l.struck) try { l.draw(ctx); } catch (e) {} }
    for (const f of game.floaters) {
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.font = `bold ${f.size}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color; ctx.globalAlpha = alpha; ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    const boss = game.enemies.find(e => e.isBoss && !e.dead);
    if (boss) {
      const bw = 480, bh = 14;
      const bx = (WORLD_W - bw) / 2, by = 32;
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      const pct = Math.max(0, boss.hp / boss.maxHp);
      const grad = ctx.createLinearGradient(bx, by, bx + bw * pct, by);
      grad.addColorStop(0, '#ff0044'); grad.addColorStop(1, '#ff6600');
      ctx.fillStyle = grad; ctx.fillRect(bx, by, bw * pct, bh);
      if (pct < 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(performance.now() / 100) * 0.2})`;
        ctx.fillRect(bx, by, bw * pct, bh);
      }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText(boss.name, WORLD_W / 2, by - 6); ctx.textAlign = 'left';
    }
    ctx.restore();

    if (game.bossIntroAlpha > 0) {
      ctx.fillStyle = `rgba(255,0,40,${game.bossIntroAlpha * 0.4})`;
      ctx.fillRect(0, 0, WORLD_W, 60);
      ctx.fillRect(0, WORLD_H - 60, WORLD_W, 60);
      // Big boss name reveal centered
      if (game.bossIntroName) {
        const since = performance.now() - (game.bossIntroStart || 0);
        const fade = Math.min(1, since / 200) * Math.min(1, game.bossIntroAlpha);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.textAlign = 'center';
        const scale = 1 + (1 - Math.min(1, since / 400)) * 0.4;
        ctx.font = `bold ${Math.floor(58 * scale)}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(game.bossIntroName, WORLD_W/2 + 4, WORLD_H/2 + 4);
        ctx.fillStyle = '#ff0033';
        ctx.fillText(game.bossIntroName, WORLD_W/2, WORLD_H/2);
        ctx.fillStyle = '#fff';
        ctx.font = `bold 12px monospace`;
        ctx.fillText('LET HIM COOK', WORLD_W/2, WORLD_H/2 + 40);
        ctx.restore();
      }
    }
    if (game.player.hp / game.player.maxHp < 0.3) {
      const pulse = 0.3 + Math.sin(performance.now() / 200) * 0.15;
      const grad = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_W / 3, WORLD_W / 2, WORLD_H / 2, WORLD_W / 1.3);
      grad.addColorStop(0, 'rgba(204,0,34,0)');
      grad.addColorStop(1, `rgba(204,0,34,${pulse})`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (game.combo >= 3) {
      const a = Math.min(1, game.comboTimer / game.comboWindow);
      ctx.save(); ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#000'; ctx.fillText(`${game.combo}x  ×${game.multiplier}`, WORLD_W/2 + 1, 80);
      ctx.fillStyle = game.multiplier >= 4 ? '#ff00ff' : (game.multiplier >= 2 ? '#ffcc00' : '#fff');
      ctx.fillText(`${game.combo}x  ×${game.multiplier}`, WORLD_W/2, 79);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(WORLD_W/2 - 50, 86, 100, 3);
      ctx.fillStyle = game.multiplier >= 4 ? '#ff00ff' : '#ffcc00';
      ctx.fillRect(WORLD_W/2 - 50, 86, 100 * a, 3);
      ctx.restore();
    }

    // ===== POST EFFECTS: drunk (wavy) + smoke (haze) =====
    const now = performance.now();
    if (game.drunkUntil > now) {
      // Wavy color overlay shifting position — approximates drunk vision
      const remain = (game.drunkUntil - now) / 8000;
      const wave = Math.sin(now / 200) * 6 * remain;
      ctx.save();
      ctx.globalAlpha = 0.18 * remain;
      ctx.fillStyle = '#ff8800';
      // Banded horizontal distortion lines
      for (let y = 0; y < WORLD_H; y += 8) {
        ctx.fillRect(wave * Math.sin(y / 40 + now / 300), y, WORLD_W, 2);
      }
      ctx.restore();
      // Slight desaturated vignette
      ctx.fillStyle = `rgba(255,200,0,${0.06 * remain})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (game.smokeUntil > now) {
      const remain = (game.smokeUntil - now) / 6000;
      // Drifting purple haze
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const sx = (i * 137 + (now / 30) % WORLD_W) % WORLD_W;
        const sy = (i * 211 + (now / 50) % WORLD_H) % WORLD_H;
        ctx.fillStyle = `rgba(204,136,255,${0.08 * remain})`;
        ctx.beginPath(); ctx.arc(sx, sy, 50 + i * 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = `rgba(60,40,80,${0.18 * remain})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // Fan-flasher screen-white burst
    if (game.flashUntil && game.flashUntil > now) {
      const remain = (game.flashUntil - now) / 220;
      ctx.fillStyle = `rgba(255,255,255,${remain * 0.85})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // SLO-MO visual indicator — blue vignette + tiny corner text
    if (game.timeScale < 0.95) {
      const intensity = 1 - game.timeScale; // 0..0.75
      const grad = ctx.createRadialGradient(WORLD_W/2, WORLD_H/2, WORLD_W*0.3, WORLD_W/2, WORLD_H/2, WORLD_W*0.7);
      grad.addColorStop(0, `rgba(100,180,255,0)`);
      grad.addColorStop(1, `rgba(100,180,255,${intensity * 0.35})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = `rgba(100,180,255,${intensity * 0.9})`;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('◐ SLO-MO', WORLD_W - 12, WORLD_H - 12);
      ctx.textAlign = 'left';
    }
    // Hit flash — red overlay when player takes damage (decays fast)
    if (game.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,0,30,${game.hitFlash})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      game.hitFlash = Math.max(0, game.hitFlash - 0.04);
    }
    // BOSS BATTLE LIGHTING — darken edges + red atmosphere, scales with difficulty
    if (game.bossActive && game.state === 'playing') {
      const diffIntensity = save.difficulty === 'hard' ? 0.55 : (save.difficulty === 'easy' ? 0.22 : 0.38);
      const pulse = (Math.sin(performance.now() / 600) + 1) / 2;
      const bossPulse = diffIntensity * (0.7 + pulse * 0.3);
      const bvGrad = ctx.createRadialGradient(WORLD_W/2, WORLD_H/2, WORLD_W*0.30, WORLD_W/2, WORLD_H/2, WORLD_W*0.9);
      bvGrad.addColorStop(0, 'rgba(40,0,0,0)');
      bvGrad.addColorStop(0.65, `rgba(60,0,10,${bossPulse * 0.6})`);
      bvGrad.addColorStop(1, `rgba(0,0,0,${bossPulse})`);
      ctx.fillStyle = bvGrad;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    // Low-HP red vignette — pulses around screen edges when player below 30%
    if (game.state === 'playing' && game.player && game.player.hp > 0) {
      const hpPct = game.player.hp / game.player.maxHp;
      if (hpPct < 0.3) {
        const pulse = (Math.sin(performance.now() / 240) + 1) / 2;
        const intensity = (0.3 - hpPct) * 1.6 * (0.5 + pulse * 0.5);
        const vGrad = ctx.createRadialGradient(WORLD_W/2, WORLD_H/2, WORLD_W*0.25, WORLD_W/2, WORLD_H/2, WORLD_W*0.8);
        vGrad.addColorStop(0, 'rgba(255,0,51,0)');
        vGrad.addColorStop(1, `rgba(255,0,51,${Math.min(0.45, intensity)})`);
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);
        // Heartbeat sfx every ~1.1s
        const nowMs = performance.now();
        if (!game._lastHeartbeat || nowMs - game._lastHeartbeat > 1100) {
          game._lastHeartbeat = nowMs;
          try { Audio.sfx.heartbeat(); } catch (e) {}
        }
      } else {
        game._lastHeartbeat = 0;
      }
    }
    // Death fade — red wash that ramps up over ~1.2s
    if (game.state === 'gameover' && game.deathFade !== undefined) {
      game.deathFade = Math.min(0.75, (game.deathFade || 0) + 0.012);
      ctx.fillStyle = `rgba(120,0,0,${game.deathFade})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      if (game.deathFade > 0.3) {
        ctx.fillStyle = `rgba(255,0,51,${(game.deathFade - 0.3) * 1.4})`;
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DROPPED', WORLD_W / 2, WORLD_H / 2);
        ctx.textAlign = 'left';
      }
    }
  }

  function drawBackground() {
    // Per-range gradient sky (changes every 5 waves)
    if (game.bgSky) {
      const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      g.addColorStop(0, game.bgSky[0]);
      g.addColorStop(1, game.bgSky[1]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = game.bgTint;
    }
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    if (game.arenaActive) {
      drawArena();
      return;
    }
    ctx.fillStyle = '#0a0604';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % WORLD_W;
      const y = (i * 211) % WORLD_H;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#332210';
    for (let i = 0; i < WORLD_W; i += 60) ctx.fillRect(i, WORLD_H / 2 - 1, 30, 2);
    ctx.fillStyle = '#2a1810';
    ctx.fillRect(0, 0, WORLD_W, 4);
    ctx.fillRect(0, WORLD_H - 4, WORLD_W, 4);
  }

  function drawArena() {
    const t = performance.now();
    if (game.arenaType === 'underwater') {
      // Deep sea blue gradient
      const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      grad.addColorStop(0, '#001a3a'); grad.addColorStop(1, '#000a1a');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // Bubbles
      for (let i = 0; i < 40; i++) {
        const bx = (i * 73 + t / 40) % WORLD_W;
        const by = (i * 137 + WORLD_H - (t / 30) % WORLD_H) % WORLD_H;
        ctx.fillStyle = `rgba(160,200,255,${0.2 + (i % 3) * 0.1})`;
        ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
      // Coral silhouettes at bottom
      ctx.fillStyle = '#2a0033';
      for (let i = 0; i < 8; i++) {
        const x = i * 110;
        ctx.fillRect(x, WORLD_H - 40, 8, 40);
        ctx.fillRect(x + 4, WORLD_H - 60, 4, 20);
      }
      // Sun rays
      ctx.strokeStyle = 'rgba(160,200,255,0.15)';
      ctx.lineWidth = 8;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 200 + 100, 0);
        ctx.lineTo(i * 200 + 60, WORLD_H);
        ctx.stroke();
      }
    } else if (game.arenaType === 'moshpit') {
      // Concert mosh pit — dark with neon stage lights
      ctx.fillStyle = '#0a0010';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // Stage at top
      ctx.fillStyle = '#1a0022';
      ctx.fillRect(0, 0, WORLD_W, 80);
      // Stage edge lights
      ctx.fillStyle = '#ff00aa';
      for (let i = 0; i < WORLD_W; i += 20) ctx.fillRect(i, 80, 10, 2);
      // Stage lights cones
      const colors = ['#ff00aa', '#00ffaa', '#ffcc00', '#0088ff'];
      for (let i = 0; i < 4; i++) {
        const cx = 100 + i * 200;
        const sweep = Math.sin(t / 500 + i) * 100;
        ctx.fillStyle = colors[i] + '22';
        ctx.beginPath();
        ctx.moveTo(cx, 30);
        ctx.lineTo(cx + sweep - 80, WORLD_H);
        ctx.lineTo(cx + sweep + 80, WORLD_H);
        ctx.closePath(); ctx.fill();
      }
      // Crowd silhouettes (heads bobbing) at top of stage
      ctx.fillStyle = '#000';
      // Tiny 2X on stage
      ctx.fillStyle = '#ff0033';
      ctx.fillRect(WORLD_W/2 - 6, 28, 12, 18);
      ctx.fillStyle = '#fff';
      ctx.fillRect(WORLD_W/2 - 4, 30, 2, 2);
      ctx.fillRect(WORLD_W/2 + 2, 30, 2, 2);
      // Crowd around player (circle of black heads)
      ctx.fillStyle = '#000';
      const cx = WORLD_W / 2, cy = WORLD_H / 2 + 30;
      for (let a = 0; a < Math.PI * 2; a += 0.25) {
        const r = 230 + Math.sin(t/200 + a*4) * 6;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (game.arenaType === 'cage') {
      // CRAB CAGE — dark with cage bars
      ctx.fillStyle = '#1a0008';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // Cage floor pattern
      ctx.fillStyle = '#330011';
      for (let x = 0; x < WORLD_W; x += 40) {
        for (let y = 0; y < WORLD_H; y += 40) {
          if (((x + y) / 40) % 2 === 0) ctx.fillRect(x, y, 40, 40);
        }
      }
      // CAGE BARS — vertical along edges
      ctx.fillStyle = '#666';
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(20 + i * 60, 0, 6, WORLD_H);
      }
      // Horizontal top + bottom bars
      ctx.fillRect(0, 30, WORLD_W, 4);
      ctx.fillRect(0, WORLD_H - 30, WORLD_W, 4);
      // Shadow vignette so cage feels confining
      const grad = ctx.createRadialGradient(WORLD_W/2, WORLD_H/2, 100, WORLD_W/2, WORLD_H/2, 400);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    } else if (game.arenaType === 'party') {
      // AFTER-PARTY scene — dance floor with color-cycling tiles + disco lights
      ctx.fillStyle = '#0a0010';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // Dance floor — grid of color-flashing squares
      const tileSize = 50;
      const danceColors = ['#ff0033','#ffcc00','#00ff66','#0088ff','#ff00ff','#ff8800'];
      for (let gx = 100; gx < WORLD_W - 80; gx += tileSize) {
        for (let gy = 110; gy < WORLD_H - 80; gy += tileSize) {
          const colorIdx = (Math.floor(t / 200) + Math.floor(gx / tileSize) + Math.floor(gy / tileSize)) % danceColors.length;
          ctx.fillStyle = danceColors[colorIdx] + '44';
          ctx.fillRect(gx, gy, tileSize - 2, tileSize - 2);
        }
      }
      // DJ booth
      ctx.fillStyle = '#222';
      ctx.fillRect(WORLD_W/2 - 80, 30, 160, 50);
      ctx.fillStyle = '#444';
      ctx.fillRect(WORLD_W/2 - 70, 40, 60, 30);
      ctx.fillRect(WORLD_W/2 + 10, 40, 60, 30);
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(WORLD_W/2 - 40, 55, 12, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(WORLD_W/2 + 40, 55, 12, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff0033';
      ctx.beginPath(); ctx.arc(WORLD_W/2 - 40 + Math.cos(t/100) * 8, 55 + Math.sin(t/100) * 8, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(WORLD_W/2 + 40 + Math.cos(t/100 + 1) * 8, 55 + Math.sin(t/100 + 1) * 8, 2, 0, Math.PI*2); ctx.fill();
      // 2X DJing on stage
      ctx.fillStyle = '#ff0033';
      ctx.fillRect(WORLD_W/2 - 4, 18, 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillRect(WORLD_W/2 - 3, 22, 2, 2);
      ctx.fillRect(WORLD_W/2 + 1, 22, 2, 2);
      // Disco ball + facets
      const ballX = WORLD_W / 2, ballY = 0;
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(ballX, ballY + 8, 14, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(t/100 + i) * 0.3})`;
        ctx.fillRect(ballX - 12 + (i * 3), ballY + 4 + Math.sin(t/80 + i)*2, 2, 2);
      }
      // Disco cones
      const lightCols = ['#ff00aa','#00ffaa','#ffcc00'];
      for (let i = 0; i < 3; i++) {
        const sweep = Math.sin(t / 600 + i * 2) * 200;
        ctx.fillStyle = lightCols[i] + '18';
        ctx.beginPath();
        ctx.moveTo(ballX, ballY + 14);
        ctx.lineTo(ballX + sweep - 100, WORLD_H);
        ctx.lineTo(ballX + sweep + 100, WORLD_H);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  // ============ HUD ============
  const hpFill = document.getElementById('player-hp-fill');
  const truckFill = document.getElementById('truck-hp-fill');
  const waveEl = document.getElementById('hud-wave');
  const scoreEl = document.getElementById('hud-score');
  const ammoEl = document.getElementById('hud-ammo');
  const cashEl = document.getElementById('hud-cash');
  const truckRow = document.getElementById('truck-hp-row');

  function updateHUD() {
    if (!game.player) return;
    // Coop HUD — show + update slot indicators
    const coopHud = document.getElementById('coop-hud');
    if (coopHud) {
      if (game.coopActive) {
        coopHud.style.display = '';
        const mySlot = game.coopRole === 'host' ? 0 : (window._game.myCoopSlot || 1);
        document.querySelectorAll('.coop-hud-slot').forEach(el => {
          const s = parseInt(el.getAttribute('data-slot'));
          el.classList.remove('connected', 'me', 'dead');
          if (s === mySlot) {
            el.classList.add('connected', 'me');
            if (game.player.dead) el.classList.add('dead');
          } else {
            const partner = game.partners && game.partners[s];
            if (partner) {
              el.classList.add('connected');
              if (partner.dead) el.classList.add('dead');
            }
          }
        });
      } else {
        coopHud.style.display = 'none';
      }
    }
    hpFill.style.width = (game.player.hp / game.player.maxHp * 100) + '%';
    if (game.arenaActive) {
      if (truckRow) truckRow.style.display = 'none';
    } else {
      if (truckRow) truckRow.style.display = '';
      truckFill.style.width = (game.truck.hp / game.truck.maxHp * 100) + '%';
    }
    waveEl.textContent = game.wave <= 30 ? `WAVE ${game.wave}/30` : `WAVE ${game.wave}`;
    scoreEl.textContent = `${game.score}`;
    if (cashEl) cashEl.textContent = `$${game.cashCollected}`;
    const w = Weapons.get(game.player.weaponIdx);
    const wState = game.player.weapons[game.player.weaponIdx];
    if (w.magazine === Infinity) ammoEl.textContent = `${w.name}: ∞`;
    else if (wState.reloading) {
      const pct = 1 - Math.max(0, (wState.reloadEnd - performance.now()) / w.reloadTime);
      const bars = Math.floor(pct * 10);
      ammoEl.textContent = `${w.name}: [${'█'.repeat(bars)}${'░'.repeat(10-bars)}]`;
    } else {
      ammoEl.textContent = `${w.name}: ${wState.ammo}/${w.magazine}`;
    }
    // Companion indicator badges
    const compEl = document.getElementById('hud-companions');
    if (compEl) {
      const parts = [];
      const nGirls = (game.followers && game.followers.length) || (game.follower ? 1 : 0);
      if (nGirls > 0) parts.push(`♥${nGirls}`);
      if (game.schizoCompanion) parts.push(`SCHIZO ${game.schizoWavesLeft}w`);
      compEl.textContent = parts.join(' · ');
      compEl.style.display = parts.length ? '' : 'none';
    }
    // Power inventory
    const powEl = document.getElementById('hud-powers');
    if (powEl) {
      const ps = save.powers || [];
      if (ps.length > 0) {
        const icons = { pwr_shockwave:'⚡', pwr_nuke:'☢', pwr_heal:'✚', pwr_timewarp:'⌛', pwr_timestop:'⏱', pwr_berserk:'🦀', pwr_truckfix:'🔧' };
        const sel = Math.max(0, Math.min(ps.length - 1, game.selectedPowerSlot || 0));
        const slotStrs = ps.map((k, i) => {
          const ico = icons[k] || '?';
          return i === sel ? `[${ico}]` : ico;
        });
        powEl.textContent = 'Q: ' + slotStrs.join('');
        powEl.style.display = '';
      } else {
        powEl.style.display = 'none';
      }
    }
    // Enemies-left counter
    const leftEl = document.getElementById('hud-left');
    if (leftEl) {
      if (game.waveActive && !game.bossActive) {
        const remaining = game.enemies.filter(e => !e.dead && !e.isFan).length + game.spawnQueue;
        leftEl.textContent = `LEFT: ${remaining}`;
        leftEl.style.display = '';
      } else {
        leftEl.style.display = 'none';
      }
    }
    // Boss HP bar (top of screen during boss fights)
    const bossContainer = document.getElementById('boss-hp-container');
    const bossNameEl = document.getElementById('boss-hp-name');
    const bossFillEl = document.getElementById('boss-hp-fill');
    if (bossContainer && bossNameEl && bossFillEl) {
      const boss = game.bossActive ? game.enemies.find(e => e.isBoss && !e.dead) : null;
      if (boss) {
        bossContainer.classList.remove('hidden');
        bossNameEl.textContent = boss.name || 'BOSS';
        bossFillEl.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
      } else {
        bossContainer.classList.add('hidden');
      }
    }
    updateWeaponBar();
  }
  function updateWeaponBar() {
    document.querySelectorAll('.weapon-slot').forEach((el, i) => {
      el.classList.toggle('active', i === game.player?.weaponIdx);
      const slotIdx = parseInt(el.dataset.weapon, 10);
      const isCrabSlot = slotIdx === 4;
      const isShotgunSlot = slotIdx === 5;
      const isStunSlot = slotIdx === 6;
      const isGoldDraco = slotIdx === 7;
      const isGoldRpg = slotIdx === 8;
      // Check both owned AND equipped — only show equipped weapons on the bar
      const equipped = game.player && game.player.equippedWeapons && game.player.equippedWeapons.has(slotIdx);
      if (isCrabSlot) {
        el.classList.toggle('locked', !game.player?.crabUnlocked);
        el.classList.toggle('unlocked-special', !!game.player?.crabUnlocked);
        // Crab laser always shows when unlocked (always equipped)
        if (!game.player?.crabUnlocked) el.style.display = 'none'; else el.style.display = '';
      } else if (isShotgunSlot) {
        const owned = !!save.unlocks.shotgun;
        el.classList.toggle('locked', !owned);
        if (!owned || !equipped) el.style.display = 'none'; else el.style.display = '';
      } else if (isStunSlot) {
        const owned = !!save.unlocks.stungun;
        el.classList.toggle('locked', !owned);
        if (!owned || !equipped) el.style.display = 'none'; else el.style.display = '';
      } else if (isGoldDraco) {
        const owned = !!save.unlocks.goldDraco;
        el.classList.toggle('locked', !owned);
        el.classList.toggle('legendary', owned);
        if (!owned || !equipped) el.style.display = 'none'; else el.style.display = '';
      } else if (isGoldRpg) {
        const owned = !!save.unlocks.goldRpg;
        el.classList.toggle('locked', !owned);
        el.classList.toggle('legendary', owned);
        if (!owned || !equipped) el.style.display = 'none'; else el.style.display = '';
      } else if (slotIdx === 9) {
        const owned = !!save.unlocks.plasma;
        el.classList.toggle('locked', !owned);
        if (!owned || !equipped) el.style.display = 'none'; else el.style.display = '';
      } else if (slotIdx === 10) {
        const owned = !!save.unlocks.tesla;
        el.classList.toggle('locked', !owned);
        if (!owned || !equipped) el.style.display = 'none'; else el.style.display = '';
      } else if (slotIdx === 11) {
        const owned = !!save.unlocks.flamer;
        el.classList.toggle('locked', !owned);
        if (!owned || !equipped) el.style.display = 'none'; else el.style.display = '';
      } else {
        // 0-3 base weapons: always show
        el.style.display = equipped ? '' : 'none';
      }
    });
  }
  document.querySelectorAll('.weapon-slot').forEach((el, i) => {
    const switchTo = () => {
      if (!game.player) return;
      const idx = parseInt(el.dataset.weapon, 10);
      if (idx === 4 && !game.player.crabUnlocked) return;
      if (idx > 4 && !game.player.unlockedWeapons.has(idx)) return;
      game.player.weaponIdx = idx;
      updateWeaponBar();
      try { Audio.sfx.reload(); } catch (e) {}
    };
    el.addEventListener('click', switchTo);
    el.addEventListener('touchstart', e => { e.preventDefault(); switchTo(); }, { passive: false });
  });
  window.addEventListener('wheel', e => {
    if (game.state !== 'playing' || !game.player) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    let next = game.player.weaponIdx;
    const total = Weapons.count();
    for (let i = 0; i < total; i++) {
      next = (next + dir + total) % total;
      if (next === 4 && !game.player.crabUnlocked) continue;
      if (next > 4 && !game.player.unlockedWeapons.has(next)) continue;
      break;
    }
    game.player.weaponIdx = next;
    updateWeaponBar();
    try { Audio.sfx.reload(); } catch (er) {}
  }, { passive: true });

  // Power button (Q on desktop, button on touch)
  const powerBtn = document.getElementById('power-btn');
  if (powerBtn) {
    const triggerPower = (e) => {
      if (e) e.preventDefault();
      if (game.state === 'playing') tryActivateStoredPower();
    };
    powerBtn.addEventListener('click', triggerPower);
    powerBtn.addEventListener('touchstart', triggerPower, { passive: false });
  }
  // Tap power HUD to cycle selected slot
  const powHud = document.getElementById('hud-powers');
  if (powHud) {
    const cycleSlot = (e) => {
      if (e) e.preventDefault();
      if (!save.powers || save.powers.length === 0) return;
      game.selectedPowerSlot = ((game.selectedPowerSlot || 0) + 1) % save.powers.length;
      try { Audio.sfx.pickup(); } catch (er) {}
    };
    powHud.addEventListener('click', cycleSlot);
    powHud.addEventListener('touchstart', cycleSlot, { passive: false });
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'e' || e.key === 'E') {
      if (game.state === 'playing' && game.player) game.player.triggerEmote('dance');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (game.state === 'playing' || game.state === 'paused' || game.state === 'party' || game.state === 'cd-wait') togglePause();
    }
    if ((e.key === 'q' || e.key === 'Q') && game.state === 'playing') {
      tryActivateStoredPower();
    }
    // R or Enter restarts after game over
    if ((e.key === 'r' || e.key === 'R' || e.key === 'Enter') && (game.state === 'gameover' || game.state === 'win')) {
      const overlay = document.getElementById('gameover-overlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        overlay.classList.add('hidden');
        resetAndStart();
      }
    }
    // 1-5 select power slot
    if (game.state === 'playing' && save.powers && save.powers.length > 0) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= save.powers.length) {
        game.selectedPowerSlot = num - 1;
        try { Audio.sfx.pickup(); } catch (er) {}
      }
    }
  });

  // ============ PAUSE ============
  const pauseOverlay = document.getElementById('pause-overlay');
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    // pointerdown is unified across mouse/touch and fires immediately (no 300ms delay, no double-fire)
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePause();
    });
    // Fallback click for safety
    pauseBtn.addEventListener('click', (e) => { e.preventDefault(); });
  }
  const resumeBtn = document.getElementById('resume-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePause();
    });
    resumeBtn.addEventListener('click', (e) => { e.preventDefault(); });
  }
  wireTap(document.getElementById('restart-btn'), () => { togglePause(); resetAndStart(); });
  wireTap(document.getElementById('quit-btn'), () => {
    pauseOverlay.classList.add('hidden');
    game.state = 'menu';
    document.body.classList.remove('playing');
    game.clearAllTimeouts();
    Input.resetTransient();
    // COOP: clean up connection on quit
    if (game.coopActive) {
      try { Coop.disconnect(); } catch (e) {}
      game.coopActive = false;
      game.coopRole = null;
      game.player2 = null;
    }
    Audio.playMusic('menu');
    refreshHighScoreUI();
    showScreen('start-screen');
  });
  // In-game shop (from pause)
  wireTap(document.getElementById('pause-shop-btn'), () => {
    save.cashBank += game.cashCollected;
    game.cashCollected = 0;
    persist();
    renderShop();
    game.shopFromPause = true;
    document.getElementById('shop-back').textContent = 'BACK TO GAME';
    pauseOverlay.classList.add('hidden');
    showScreen('shop-screen');
  });
  const motionToggle = document.getElementById('motion-toggle');
  if (motionToggle) {
    if (save.reduceMotion) motionToggle.checked = false;
    motionToggle.addEventListener('change', e => {
      save.reduceMotion = !e.target.checked;
      persist();
    });
  }
  document.getElementById('music-toggle').addEventListener('change', e => Audio.setMusicEnabled(e.target.checked));
  document.getElementById('sfx-toggle').addEventListener('change', e => Audio.setSfxEnabled(e.target.checked));
  const hapticsToggle = document.getElementById('haptics-toggle');
  if (hapticsToggle) {
    // Load saved preference
    if (save.hapticsOff) hapticsToggle.checked = false;
    Audio.setHapticsEnabled(!save.hapticsOff);
    hapticsToggle.addEventListener('change', e => {
      Audio.setHapticsEnabled(e.target.checked);
      save.hapticsOff = !e.target.checked;
      persist();
      if (e.target.checked) { try { Audio.haptic.light(); } catch (er) {} }
    });
  }
  // Volume slider
  const volSlider = document.getElementById('volume-slider');
  if (volSlider) {
    volSlider.value = Math.round(save.musicVolume * 100);
    const applyVolFromSlider = () => {
      const v = parseInt(volSlider.value, 10) / 100;
      Audio.setMusicVolume(v);
      save.musicVolume = v;
      persist();
    };
    volSlider.addEventListener('input', applyVolFromSlider);
    volSlider.addEventListener('change', applyVolFromSlider);
    // iOS Safari sometimes doesn't fire input on range sliders during touch — manual handling
    let sliding = false;
    const handleTouch = (e) => {
      sliding = true;
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return;
      const rect = volSlider.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width));
      volSlider.value = Math.round(pct * 100);
      applyVolFromSlider();
      e.preventDefault();
    };
    volSlider.addEventListener('touchstart', handleTouch, { passive: false });
    volSlider.addEventListener('touchmove', handleTouch, { passive: false });
    volSlider.addEventListener('touchend', () => { sliding = false; }, { passive: true });
  }
  // ============ AUDIO PLAYER WIDGET ============
  // Defines tracks + their display. Unlockable tracks appear when their flag is set.
  const PLAYLIST_DEFS = [
    { key: 'gameplay', name: 'CRABCAGE',          artist: '2X · gameplay',  icon: '🎵', unlock: true },
    { key: 'boss',     name: 'ONEBANDOME DRUM',   artist: '2X · boss fight', icon: '💀', unlock: true },
    { key: 'menu',     name: 'GEEKEDUP!',         artist: '2X · menu',       icon: '🎮', unlock: true },
    { key: 'party',    name: 'JEFFHARDY!',        artist: '2X · afterparty', icon: '🍾', unlock: true },
    // Hidden tracks unlocked via shop unlock flag
    { key: 'random',   name: 'RANDOM SHUFFLE',    artist: 'rotates every wave', icon: '🎲', unlock: () => !!save.unlocks.extraTracks },
  ];
  function getPlaylist() { return PLAYLIST_DEFS.filter(t => typeof t.unlock === 'function' ? t.unlock() : t.unlock); }
  let playerCurrentIdx = 0;
  let playerIsPlaying = true;

  function renderAudioPlayer() {
    const pl = getPlaylist();
    if (pl.length === 0) return;
    if (playerCurrentIdx >= pl.length) playerCurrentIdx = 0;
    const t = pl[playerCurrentIdx];
    const art = document.getElementById('player-art');
    const name = document.getElementById('player-track-name');
    const artist = document.getElementById('player-track-artist');
    const playBtn = document.getElementById('player-play');
    const wrap = document.getElementById('audio-player');
    if (art) art.textContent = t.icon;
    if (name) name.textContent = t.name;
    if (artist) artist.textContent = t.artist;
    if (playBtn) playBtn.textContent = playerIsPlaying ? '⏸' : '▶';
    if (wrap) {
      if (playerIsPlaying) wrap.classList.add('playing');
      else wrap.classList.remove('playing');
    }
  }

  function playTrack(idx) {
    const pl = getPlaylist();
    if (pl.length === 0) return;
    playerCurrentIdx = ((idx % pl.length) + pl.length) % pl.length;
    const t = pl[playerCurrentIdx];
    Audio.playMusic(t.key);
    playerIsPlaying = true;
    renderAudioPlayer();
    try { Audio.sfx.reload(); } catch (e) {}
    // COOP: host syncs music choice to all guests
    if (game.coopActive && game.coopRole === 'host') {
      try { Coop.broadcast('music', { track: t.key }); } catch (e) {}
    }
  }

  // Wire player controls
  const playerPrev = document.getElementById('player-prev');
  const playerNext = document.getElementById('player-next');
  const playerPlay = document.getElementById('player-play');
  if (playerPrev) wireTap(playerPrev, () => { Audio.unlock(); playTrack(playerCurrentIdx - 1); });
  if (playerNext) wireTap(playerNext, () => { Audio.unlock(); playTrack(playerCurrentIdx + 1); });
  if (playerPlay) {
    wireTap(playerPlay, () => {
      Audio.unlock();
      playerIsPlaying = !playerIsPlaying;
      if (playerIsPlaying) {
        const pl = getPlaylist();
        if (pl.length > 0) {
          Audio.playMusic(pl[playerCurrentIdx].key);
          if (game.coopActive && game.coopRole === 'host') {
            try { Coop.broadcast('music', { track: pl[playerCurrentIdx].key }); } catch (e) {}
          }
        }
      } else {
        Audio.stopMusic();
        if (game.coopActive && game.coopRole === 'host') {
          try { Coop.broadcast('music', { track: 'stop' }); } catch (e) {}
        }
      }
      renderAudioPlayer();
    });
  }

  function refreshTrackRowVisibility() {
    // The audio player is always visible — just refresh in case unlocks changed
    renderAudioPlayer();
  }
  refreshTrackRowVisibility();
  // Initial render
  renderAudioPlayer();

  function tryActivateStoredPower() {
    if (!save.powers || save.powers.length === 0) {
      game.spawnFloater(game.player.x, game.player.y - 24, 'NO POWER', '#888', 14, -0.6);
      return;
    }
    const slot = Math.max(0, Math.min(save.powers.length - 1, game.selectedPowerSlot || 0));
    const key = save.powers.splice(slot, 1)[0];
    if ((game.selectedPowerSlot || 0) >= save.powers.length) game.selectedPowerSlot = Math.max(0, save.powers.length - 1);
    persist();
    const p = game.player;
    // Universal activation cue — bigger feedback so it FEELS like a power
    game.addScreenShake(8);
    game.hitstop(150);
    game.spawnExplosion(p.x, p.y, '#ffff00', 30);
    try { Audio.sfx.combo(); } catch (e) {}
    switch (key) {
      case 'pwr_shockwave': {
        const radius = 250;
        game.spawnExplosion(p.x, p.y, '#00ffff', 50);
        game.addScreenShake(14);
        for (const e of game.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < radius) {
            try { e.damage(80, game, true); } catch (er) {}
            const ang = Math.atan2(e.y - p.y, e.x - p.x);
            e.knockX = Math.cos(ang) * 12; e.knockY = Math.sin(ang) * 12;
          }
        }
        game.spawnFloater(p.x, p.y - 40, 'SHOCKWAVE', '#00ffff', 22, -0.4);
        break;
      }
      case 'pwr_nuke': {
        for (const e of game.enemies) {
          if (e.dead) continue;
          if (e.isBoss) { try { e.damage(400, game, true); } catch (er) {} }
          else try { e.damage(9999, game, false); } catch (er) {}
        }
        game.addScreenShake(22);
        game.spawnExplosion(p.x, p.y, '#ff8800', 80);
        try { Audio.sfx.nuke(); } catch (e) {}
        game.spawnFloater(p.x, p.y - 40, 'NUKE', '#ff8800', 24, -0.4);
        break;
      }
      case 'pwr_heal': {
        p.hp = p.maxHp;
        p.shieldHp = 30;
        // Brief regen — set buff that ticks
        game.medpackUntil = performance.now() + 6000;
        game.spawnFloater(p.x, p.y - 40, 'MEDPACK', '#00ff66', 22, -0.4);
        try { Audio.sfx.highScore(); } catch (e) {}
        break;
      }
      case 'pwr_timewarp': {
        game.slowMo(10000, 0.08);
        game.spawnFloater(p.x, p.y - 40, 'TIME WARP', '#88ddff', 22, -0.4);
        break;
      }
      case 'pwr_timestop': {
        // TIME STOP — freeze ALL enemies for 3 seconds (more powerful than time warp)
        const freezeEnd = performance.now() + 3000;
        for (const e of game.enemies) {
          if (e.dead) continue;
          e.frozenUntil = freezeEnd;
          e.frozen = true;
        }
        game.spawnFloater(p.x, p.y - 40, '⏱ TIME STOP', '#aaccff', 24, -0.4);
        // Big visual: white flash + radial pulse
        game.addScreenShake(6);
        try { Audio.sfx.laser(); } catch (e) {}
        try { Audio.haptic.heavy(); } catch (e) {}
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          game.spawnSparks(p.x + Math.cos(a) * 40, p.y + Math.sin(a) * 40, '#aaccff', 3);
        }
        game._timeStopFlash = performance.now() + 200; // brief white flash
        break;
      }
      case 'pwr_berserk': {
        const now = performance.now();
        // RAGE — become a crab for 10 seconds, force CRAB weapon, massive AOE chomp
        p.rageEnd = now + 10000;
        p._prevWeaponIdx = p.weaponIdx;
        p.weaponIdx = 4; // CRAB LASER slot but we'll override in tryFire
        p.crabUnlocked = true;
        p.damageMultiplier = 2.5;
        p.damageBuffEnd = now + 10000;
        p.speedMultiplier = 1.55;
        p.speedBuffEnd = now + 10000;
        game.spawnFloater(p.x, p.y - 40, 'RAGE — CRAB MODE', '#ff3300', 22, -0.4);
        game.addScreenShake(12);
        try { Audio.sfx.berserk && Audio.sfx.berserk(); } catch (e) {}
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          game.spawnSparks(p.x + Math.cos(a) * 28, p.y + Math.sin(a) * 28, '#ff3300', 2);
        }
        break;
      }
      case 'pwr_truckfix': {
        if (game.truck) {
          const heal = Math.round(game.truck.maxHp * 0.35);
          game.truck.hp = Math.min(game.truck.maxHp, game.truck.hp + heal);
          game.spawnFloater(game.truck.x, game.truck.y - 20, `+${heal} TRUCK`, '#00ff66', 18, -0.4);
          for (let i = 0; i < 12; i++) {
            game.spawnSparks(game.truck.x + (Math.random() - 0.5) * 30, game.truck.y + (Math.random() - 0.5) * 20, '#00ff66', 2);
          }
          try { Audio.sfx.pickup(); } catch (e) {}
        }
        break;
      }
    }
  }
  function togglePause(fromNetwork) {
    // Broadcast first (before state changes) so peer mirrors us
    if (!fromNetwork && game.coopActive && Coop.isConnected()) {
      Coop.broadcast('pause', { paused: game.state === 'playing' || game.state === 'party' || game.state === 'cd-wait' });
    }
    if (game.state === 'playing' || game.state === 'party' || game.state === 'cd-wait') {
      game._prePauseState = game.state;
      game.state = 'paused';
      document.body.classList.remove('playing');
      pauseOverlay.classList.remove('hidden');
      // Update live stats display
      const ps = document.getElementById('pause-stats');
      if (ps) {
        ps.innerHTML = `WAVE ${game.wave} · SCORE ${game.score}<br>$${game.cashCollected} this run · $${save.cashBank} banked<br>${save.totalKills} total kills · HIGH ${save.highScore}`;
      }
      // Inventory glance
      const inv = document.getElementById('pause-inventory');
      if (inv) {
        const parts = [];
        // Weapons owned
        const ownedWeapons = ['DRACO','GLOCK','FISTS','RPG'];
        if (game.player?.crabUnlocked) ownedWeapons.push('CRAB LASER');
        if (save.unlocks.shotgun) ownedWeapons.push('SAWED-OFF');
        if (save.unlocks.stungun) ownedWeapons.push('STUN');
        if (save.unlocks.goldDraco) ownedWeapons.push('★GOLD DRACO');
        if (save.unlocks.goldRpg) ownedWeapons.push('★GOLD RPG');
        if (save.unlocks.plasma) ownedWeapons.push('★PLASMA');
        if (save.unlocks.tesla) ownedWeapons.push('⚡TESLA');
        if (save.unlocks.flamer) ownedWeapons.push('🔥FLAME');
        parts.push(`<div class="inv-row"><span class="inv-label">WEAPONS</span> ${ownedWeapons.join(' · ')}</div>`);
        // Powers stored
        const ps = save.powers || [];
        if (ps.length) {
          const icons = { pwr_shockwave:'⚡SHOCK', pwr_nuke:'☢NUKE', pwr_heal:'✚HEAL', pwr_timewarp:'⌛WARP', pwr_timestop:'⏱STOP', pwr_berserk:'🦀RAGE', pwr_truckfix:'🔧FIX' };
          parts.push(`<div class="inv-row"><span class="inv-label">POWERS (Q)</span> ${ps.map(k => icons[k] || k).join(' · ')}</div>`);
        }
        // Schizo companion in shop
        if (save.consumables?.schizo > 0) parts.push(`<div class="inv-row"><span class="inv-label">SCHIZO</span> ${save.consumables.schizo} ready · ${game.schizoWavesLeft || 0}w left active</div>`);
        // Active companions in current run
        const nGirls = (game.followers && game.followers.length) || 0;
        if (nGirls > 0) parts.push(`<div class="inv-row"><span class="inv-label">CREW</span> ${nGirls} girl${nGirls > 1 ? 's' : ''} following</div>`);
        // Upgrades
        const u = save.upgrades || {};
        const upParts = [];
        if (u.weaponDmg) upParts.push(`DMG ${'★'.repeat(u.weaponDmg)}`);
        if (u.truckHp) upParts.push(`TRUCK ${'★'.repeat(u.truckHp)}`);
        if (u.moveSpeed) upParts.push(`SPD ${'★'.repeat(u.moveSpeed)}`);
        if (u.maxHpUp) upParts.push(`HP ${'★'.repeat(u.maxHpUp)}`);
        if (upParts.length) parts.push(`<div class="inv-row"><span class="inv-label">UPGRADES</span> ${upParts.join(' · ')}</div>`);
        inv.innerHTML = parts.join('');
      }
      Audio.pauseAll();
    } else if (game.state === 'paused') {
      game.state = game._prePauseState || 'playing';
      document.body.classList.add('playing');
      pauseOverlay.classList.add('hidden');
      lastTime = performance.now();
      // Resume appropriate music
      if (game.state === 'party') {
        const partyAudio = document.getElementById('music-party');
        const hasFile = partyAudio && partyAudio.readyState >= 2 && partyAudio.duration > 0 && !isNaN(partyAudio.duration);
        if (hasFile) { try { partyAudio.play().catch(() => Audio.startPartyBeat()); } catch (e) { Audio.startPartyBeat(); } }
        else { Audio.startPartyBeat(); }
      } else {
        Audio.resume();
      }
    }
  }
  function resetAndStart() {
    // Aggressive restart — wipe equipped loadout + powers + consumables (unlocks stay accessible in inventory)
    save.powers = [];
    save.consumables = [];
    save.schizoWavesLeft = 0;
    persist();
    resetGame();
    // Don't auto-equip unlocks on restart — player starts with default 4
    game.player.equippedWeapons.clear();
    [0, 1, 2, 3].forEach(s => game.player.equippedWeapons.add(s));
    game.player.weaponIdx = 0;
    game.state = 'playing';
    startWave(1);
    Audio.playMusic('gameplay');
    updateWeaponBar();
  }

  // ============ GAME OVER ============
  const gameOverOverlay = document.getElementById('gameover-overlay');
  function setGameOver(victory) {
    if (game.state === 'gameover' || game.state === 'win') return;
    game.state = victory ? 'win' : 'gameover';
    game.clearAllTimeouts();
    Input.resetTransient();
    if (!victory) {
      // CINEMATIC DEATH — longer slo-mo, player falls, screen fades to black-red
      game.slowMo(1400, 0.15);
      game.deathFade = 0;
      // Knock the player over visually
      if (game.player) {
        game.player.gunLockEnd = performance.now() + 4000;
        game.player.deathTilt = (Math.random() - 0.5) * 1.4;
      }
      game.addScreenShake(18);
      try { game.spawnFloater(game.player.x, game.player.y - 30, 'DROPPED', '#ff0033', 32, -0.5); } catch (e) {}
      try { game.spawnExplosion(game.player.x, game.player.y, '#ff0033', 24); } catch (e) {}
      try { Audio.sfx.gameOver(); } catch (e) {}
      try { Audio.haptic.death(); } catch (e) {}
      try { Audio.fadeOutMusic(1300); } catch (e) {}
    } else {
      game.slowMo(1800, 0.32);
    }
    // Bank cash + record score
    save.cashBank += game.cashCollected;
    const isNewHigh = game.score > save.highScore;
    if (isNewHigh) save.highScore = game.score;
    if (game.score > 0) {
      save.highScores = save.highScores || [];
      save.highScores.push({ score: game.score, wave: game.wave, date: new Date().toISOString().slice(0,10) });
      save.highScores.sort((a, b) => b.score - a.score);
      save.highScores = save.highScores.slice(0, 5);
    }
    if (game.wave > (save.bestWave || 0)) save.bestWave = game.wave;
    persist();
    const titleEl = document.getElementById('gameover-title');
    titleEl.textContent = victory ? '★ YOU SAVED 2X ★' : 'DROPPED';
    titleEl.classList.toggle('new-high', isNewHigh);
    const runDuration = game.runStartedAt ? Math.floor((performance.now() - game.runStartedAt) / 1000) : 0;
    const mins = Math.floor(runDuration / 60), secs = runDuration % 60;
    const durStr = `${mins}:${String(secs).padStart(2, '0')}`;
    let statsHTML = `WAVE ${game.wave} · SCORE ${game.score}<br>${game.runKills || 0} KILLS · ${durStr} PLAYED<br>CASH $${game.cashCollected} BANKED<br>BANK $${save.cashBank} · HIGH ${save.highScore}`;
    if (isNewHigh) statsHTML = `<span class="new-record">★ NEW HIGH SCORE ★</span><br>` + statsHTML;
    if (victory) statsHTML = `<span class="new-record" style="color:#ffcc00;">★ FINALE COMPLETE ★</span><br>` + statsHTML + `<br><br><span style="color:#ffcc00;font-size:11px;">stream the EP below ↓</span>`;
    document.getElementById('gameover-stats').innerHTML = statsHTML;
    // ROGUELITE wipe (skip on victory — keep your stuff for the celebration)
    if (!victory) {
      save.unlocks = { shotgun: false, stungun: false, goldDraco: false, goldRpg: false, plasma: false, tesla: false, flamer: false, extraTracks: false };
      save.upgrades = { weaponDmg: 0, truckHp: 0, moveSpeed: 0, maxHpUp: 0 };
      save.powers = [];
      save.consumables = { schizo: 0 };
      save.schizoWavesLeft = 0;
      persist();
    }
    // Show overlay after 1.2s of slow-mo (or immediately on victory)
    const delay = victory ? 1800 : 1600;
    setTimeout(() => {
      gameOverOverlay.classList.remove('hidden');
      Audio.stopMusic();
      // Show REVIVE button only in coop + only on death (not victory)
      const reviveEl = document.getElementById('coop-revive-btn');
      if (reviveEl) {
        reviveEl.style.display = (game.coopActive && !victory && (save.cashBank || 0) >= 4200) ? '' : 'none';
        reviveEl.textContent = `💵 REVIVE ($4200 — bank: $${save.cashBank || 0})`;
      }
      try {
        if (isNewHigh) Audio.sfx.highScore();
        else if (victory) Audio.sfx.victory();
      } catch (e) {}
      // COOP: notify all guests of victory so they see CTAs
      if (victory && game.coopActive && game.coopRole === 'host') {
        try { Coop.broadcast('sfx', { name: 'victory' }); } catch (e) {}
        try { Coop.broadcast('victory', {}); } catch (e) {}
      }
    }, delay);
  }
  wireTap(document.getElementById('retry-btn'), () => {
    gameOverOverlay.classList.add('hidden');
    resetAndStart();
  });
  wireTap(document.getElementById('menu-btn'), () => {
    gameOverOverlay.classList.add('hidden');
    game.state = 'menu';
    document.body.classList.remove('playing');
    game.clearAllTimeouts();
    // COOP: clean up
    if (game.coopActive) {
      try { Coop.disconnect(); } catch (e) {}
      game.coopActive = false;
      game.coopRole = null;
      game.player2 = null;
    }
    refreshHighScoreUI();
    showScreen('start-screen');
    Audio.playMusic('menu');
  });

  // Prevent iOS gestures / pinch
  document.body.addEventListener('touchmove', e => {
    if (e.target.closest('.howto-content')) return;
    if (e.target.closest('.customizer')) return;
    if (e.target.closest('.shop-content')) return;
    if (e.target.closest('.scores-content')) return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
})();
