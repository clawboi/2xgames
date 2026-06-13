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
      musicVolume: 0.45,
      customization: null,
      difficulty: 'normal',
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
    enemies: [], bullets: [], powerUps: [], cash: [], particles: [],
    floaters: [], dust: [], bloodSplats: [], lightnings: [], sonicWaves: [],
    partyPickups: [], dancers: [], follower: null, followers: [],
    gibs: [],
    hitstopUntil: 0,
    drunkUntil: 0, smokeUntil: 0,
    wave: 0, score: 0, cashCollected: 0, waveKills: 0, waveDamageTaken: 0,
    spawnQueue: 0, spawnTimer: 0, waveActive: false, state: 'menu',
    world: { w: WORLD_W, h: WORLD_H },
    bossActive: false, arenaActive: false, arenaType: null, crabGunSpawned: false,
    pendingTimeouts: new Set(),
    shake: { x: 0, y: 0, intensity: 0 },
    timeScale: 1, timeScaleEnd: 0,
    combo: 0, comboTimer: 0, comboWindow: 2500,
    killstreak: 0, multiKillTimer: 0, multiKillCount: 0, multiplier: 1,
    bossIntroAlpha: 0, bgTint: '#1a0f08', bossLightningTimer: 0,
    MAX_BULLETS: 200, MAX_PARTICLES: 300, MAX_FLOATERS: 50,
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
    spawnFloater(x, y, text, color = '#fff', size = 14, vy = -1.2) {
      if (this.floaters.length >= this.MAX_FLOATERS) this.floaters.shift();
      this.floaters.push({ x, y, text, color, size, vy, life: 900, maxLife: 900 });
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
    addScreenShake(intensity) { this.shake.intensity = Math.min(20, this.shake.intensity + intensity); },
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
        const partyAudio = document.getElementById('music-party');
        const hasFile = partyAudio && partyAudio.readyState >= 2 && partyAudio.duration > 0 && !isNaN(partyAudio.duration);
        if (hasFile) {
          partyAudio.volume = 0;
          partyAudio.loop = true;
          const p = partyAudio.play();
          if (p && p.catch) p.catch(() => Audio.startPartyBeat());
          let v = 0;
          const fadeIn = setInterval(() => { v += 0.04; partyAudio.volume = Math.min(0.5, v); if (v >= 0.5) clearInterval(fadeIn); }, 80);
        } else {
          Audio.startPartyBeat();
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

  // ============ iOS ADD-TO-HOME-SCREEN PROMPT ============
  (function showIOSInstallPrompt() {
    if (localStorage.getItem('crabcage_ios_prompt_dismissed')) return;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    if (!isIOS || isStandalone) return;
    const banner = document.createElement('div');
    banner.className = 'ios-install-prompt';
    banner.innerHTML = `📱 add to home screen for fullscreen: tap <strong>SHARE</strong> → <strong>Add to Home Screen</strong> <button id="ios-dismiss">OK</button>`;
    document.body.appendChild(banner);
    wireTap(document.getElementById('ios-dismiss'), () => {
      banner.remove();
      localStorage.setItem('crabcage_ios_prompt_dismissed', '1');
    });
  })();
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
      case 'easy':   return { enemyHp: 0.65, enemyDmg: 0.65, playerHpMult: 1.4, dropRate: 1.4 };
      case 'hard':   return { enemyHp: 1.4,  enemyDmg: 1.5,  playerHpMult: 0.75, dropRate: 0.8 };
      default:       return { enemyHp: 1.0,  enemyDmg: 1.0,  playerHpMult: 1.0, dropRate: 1.0 };
    }
  }

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
  wireTap(document.getElementById('howto-btn'), () => { Audio.unlock(); showScreen('howto-screen'); });
  wireTap(document.getElementById('howto-back'), () => showScreen('start-screen'));
  wireTap(document.getElementById('shop-btn'), () => { Audio.unlock(); renderShop(); showScreen('shop-screen'); });
  wireTap(document.getElementById('shop-back'), () => {
    if (game.shopFromPause) {
      // Returning to mid-game pause — apply unlocks live, reopen pause overlay
      if (save.unlocks.shotgun) game.player.unlockedWeapons.add(5);
      if (save.unlocks.stungun) game.player.unlockedWeapons.add(6);
      if (save.unlocks.goldDraco) game.player.unlockedWeapons.add(7);
      if (save.unlocks.goldRpg) game.player.unlockedWeapons.add(8);
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
      ['WEAPONS UNLOCKED', Object.keys(s.unlocks || {}).filter(k => s.unlocks[k]).length],
      ['POWERS STORED', (s.powers || []).length],
    ];
    el.innerHTML = rows.map(r => `<div class="score-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
  }

  // ============ SHOP ============
  const shopItems = [
    { key: 'weaponDmg', kind: 'upgrade', name: 'Weapon Damage', desc: '+20% damage per level', cost: l => 200 + l*200, max: 5 },
    { key: 'truckHp', kind: 'upgrade', name: 'Truck Armor', desc: '+30 HP per level', cost: l => 150 + l*150, max: 5 },
    { key: 'moveSpeed', kind: 'upgrade', name: 'Move Speed', desc: '+10% per level', cost: l => 250 + l*250, max: 3 },
    { key: 'shotgun', kind: 'unlock', name: 'SAWED-OFF', desc: '6-pellet spread, devastating up close', cost: 600 },
    { key: 'stungun', kind: 'unlock', name: 'STUN GUN', desc: 'Sonic scream, AOE + slows', cost: 800 },
    { key: 'extraTracks', kind: 'unlock', name: 'EXTRA TRACKS', desc: 'Adds boss + menu to in-game playlist', cost: 400 },
    { key: 'schizo', kind: 'consumable', name: 'SCHIZO COMPANION', desc: 'Follows you 3 rounds, shoots crabs', cost: 900 },
    { key: 'maxHpUp', kind: 'upgrade', name: 'Max HP', desc: '+25 max HP per level', cost: l => 200 + l*200, max: 4 },
    { key: 'pwr_shockwave', kind: 'power', name: '⚡ SHOCKWAVE', desc: 'Q to release a 250px AOE pulse (5 stored max)', cost: 250 },
    { key: 'pwr_nuke', kind: 'power', name: '☢ NUKE', desc: 'Q to wipe screen + 400 dmg to bosses', cost: 600 },
    { key: 'pwr_heal', kind: 'power', name: '✚ MEDPACK', desc: 'Q for full HP restore + 6s regen', cost: 300 },
    { key: 'pwr_timewarp', kind: 'power', name: '⌛ TIME WARP', desc: 'Q for 10s of deep slo-mo', cost: 350 },
    { key: 'goldDraco', kind: 'unlock', name: '★ GOLD DRACO', desc: 'Legendary — faster, hits harder, pierces', cost: 1500 },
    { key: 'goldRpg', kind: 'unlock', name: '★ GOLD RPG', desc: 'Legendary — 130 dmg, 150px splash', cost: 2000 },
  ];
  function renderShop() {
    const wrap = document.getElementById('shop-items'); wrap.innerHTML = '';
    document.getElementById('shop-cash').textContent = `$${save.cashBank}`;
    for (const item of shopItems) {
      const div = document.createElement('div'); div.className = 'shop-item';
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
          // If legendary weapon, big celebration floater
          if (key === 'goldDraco' || key === 'goldRpg') {
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
    startWave(1);
  }
  function resetGame() {
    game.clearAllTimeouts();
    game.player = new Player(WORLD_W / 2 - 100, WORLD_H / 2, customization);
    game.player.applyUpgrades(save.upgrades);
    // Apply difficulty player HP scaling
    const diff = getDifficultyMult();
    game.player.maxHp = Math.round(game.player.maxHp * diff.playerHpMult);
    game.player.hp = game.player.maxHp;
    game.difficultyMult = diff;
    save.runsPlayed = (save.runsPlayed || 0) + 1;
    persist();
    if (save.unlocks.shotgun) game.player.unlockedWeapons.add(5);
    if (save.unlocks.stungun) game.player.unlockedWeapons.add(6);
    if (save.unlocks.goldDraco) game.player.unlockedWeapons.add(7);
    if (save.unlocks.goldRpg) game.player.unlockedWeapons.add(8);
    game.truck = new Truck(WORLD_W / 2 + 80, WORLD_H / 2);
    game.truck.maxHp = 130 + (save.upgrades.truckHp * 60);
    game.truck.hp = game.truck.maxHp;
    Object.assign(game, {
      enemies: [], bullets: [], powerUps: [], cash: [], particles: [],
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
    // Defensive: ensure no leftover slo-mo / hitstop from previous wave
    game.timeScale = 1;
    game.timeScaleEnd = 0;
    game.hitstopUntil = 0;
    game.wave = n;
    const cfg = Waves.getWaveConfig(n);
    game.waveActive = true; game.bossActive = false;
    game.arenaActive = false; game.arenaType = null;
    game.waveKills = 0; game.waveDamageTaken = 0;
    setBgTint(n);
    showWaveBanner(`WAVE ${n}` + (cfg.type === 'boss' ? ' — BOSS' : ''));
    if (cfg.type === 'boss') {
      Audio.playMusic('boss');
      game.bossActive = true; game.bossIntroAlpha = 1;
      game.arenaActive = true; game.arenaType = cfg.arena;
      game.player.x = WORLD_W / 2; game.player.y = WORLD_H / 2 + 80;
      game.schedule(() => spawnBoss(cfg.boss, cfg.hpMult), 1500);
      game.spawnQueue = cfg.minions; game.spawnTimer = 800;
      game.bossLightningTimer = 4500;
    } else {
      if (n > 1) Audio.playMusic('gameplay');
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
    const mod = (cfg.hpMod || 1) * diffMult.enemyHp;
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
  function spawnBoss(type, hpMult) {
    const x = WORLD_W / 2, y = 80;
    let boss;
    if (type === 'giantCrab') boss = new GiantCrab(x, y, hpMult);
    else if (type === 'slimey') boss = new Slimey(x, y, hpMult);
    else boss = new Mirror2X(x, y, customization, hpMult);
    game.enemies.push(boss);
    try { Audio.sfx.boss(); } catch (e) {}
    game.addScreenShake(15);
    game.hitstop(400);  // micro pause for drama
    game.slowMo(1200, 0.5);
    game.bossIntroAlpha = 1.5;
    game.bossIntroName = boss.name;
    game.bossIntroStart = performance.now();
    game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 80, boss.name + ' INCOMING', '#ff0066', 24, -0.4);
  }
  function updateWaves(dt) {
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
      const nextWave = game.wave + 1;
      game.schedule(() => { if (game.state === 'playing') startWave(nextWave); }, 2000);
    }
  }
  function showWaveBanner(text) {
    const banner = document.getElementById('wave-banner');
    document.getElementById('banner-text').textContent = text;
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
            if (b.splash > 0) { game.spawnExplosion(b.x, b.y, '#ff8800', 12); try { Audio.sfx.explode(); } catch (er) {} game.addScreenShake(8); }
            else game.addScreenShake(3);
            b.dead = true; continue;
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
      }
      try { render(); } catch (err) { console.error('rnd', err); }
    } catch (outer) { console.error('loop', outer); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt) {
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
    if (game.schizoCompanion) { try { game.schizoCompanion.update(dt, game); } catch (e) {} }
    if (game.followers && game.followers.length) {
      for (const fl of game.followers) { try { fl.update(dt, game); } catch (e) {} }
    } else if (game.follower) { try { game.follower.update(dt, game); } catch (e) {} }
    for (const pp of game.partyPickups) { try { pp.update(dt, game); } catch (e) {} }
    for (const dn of game.dancers) { try { dn.update(dt, game); } catch (e) {} }
    for (const e of game.enemies) { try { e.update(dt, game); } catch (er) { console.error('e', er); e.dead = true; } }
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
    const dx = game.player.x - c.x, dy = game.player.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 90) { const pull = (1 - d/90) * 6; c.vx += (dx/d) * pull * 0.2; c.vy += (dy/d) * pull * 0.2; }
    c.x += c.vx; c.y += c.vy; c.vx *= 0.92; c.vy *= 0.92;
    if (Math.abs(c.vx) < 0.05) c.vx = 0;
    if (Math.abs(c.vy) < 0.05) c.vy = 0;
    if (d < game.player.radius + 8) {
      c.collected = true;
      game.cashCollected += c.amount;
      game.score += c.amount * 5;
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
    if (game.schizoCompanion) drawables.push(game.schizoCompanion);
    if (game.followers && game.followers.length) drawables.push(...game.followers);
    else if (game.follower) drawables.push(game.follower);
    drawables.push(...game.dancers, ...game.partyPickups);
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
    hpFill.style.width = (game.player.hp / game.player.maxHp * 100) + '%';
    if (game.arenaActive) {
      if (truckRow) truckRow.style.display = 'none';
    } else {
      if (truckRow) truckRow.style.display = '';
      truckFill.style.width = (game.truck.hp / game.truck.maxHp * 100) + '%';
    }
    waveEl.textContent = `WAVE ${game.wave}`;
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
        const icons = { pwr_shockwave:'⚡', pwr_nuke:'☢', pwr_heal:'✚', pwr_timewarp:'⌛' };
        powEl.textContent = 'Q: ' + ps.map(k => icons[k] || '?').join('');
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
      if (isCrabSlot) {
        el.classList.toggle('locked', !game.player?.crabUnlocked);
        el.classList.toggle('unlocked-special', !!game.player?.crabUnlocked);
      } else if (isShotgunSlot) {
        const owned = !!save.unlocks.shotgun;
        el.classList.toggle('locked', !owned);
        if (!owned) el.style.display = 'none'; else el.style.display = '';
      } else if (isStunSlot) {
        const owned = !!save.unlocks.stungun;
        el.classList.toggle('locked', !owned);
        if (!owned) el.style.display = 'none'; else el.style.display = '';
      } else if (isGoldDraco) {
        const owned = !!save.unlocks.goldDraco;
        el.classList.toggle('locked', !owned);
        el.classList.toggle('legendary', owned);
        if (!owned) el.style.display = 'none'; else el.style.display = '';
      } else if (isGoldRpg) {
        const owned = !!save.unlocks.goldRpg;
        el.classList.toggle('locked', !owned);
        el.classList.toggle('legendary', owned);
        if (!owned) el.style.display = 'none'; else el.style.display = '';
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
    game.clearAllTimeouts();
    Input.resetTransient();
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
  document.getElementById('music-toggle').addEventListener('change', e => Audio.setMusicEnabled(e.target.checked));
  document.getElementById('sfx-toggle').addEventListener('change', e => Audio.setSfxEnabled(e.target.checked));
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
  // Track switcher
  document.querySelectorAll('.track-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = btn.dataset.track;
      Audio.playMusic(track);
      try { Audio.sfx.reload(); } catch (e) {}
    });
  });
  function refreshTrackRowVisibility() {
    const row = document.getElementById('track-row');
    if (!row) return;
    if (save.unlocks.extraTracks) row.classList.remove('hidden');
    else row.classList.add('hidden');
  }
  refreshTrackRowVisibility();

  function tryActivateStoredPower() {
    if (!save.powers || save.powers.length === 0) {
      game.spawnFloater(game.player.x, game.player.y - 24, 'NO POWER', '#888', 14, -0.6);
      return;
    }
    const key = save.powers.shift();
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
    }
  }
  function togglePause() {
    if (game.state === 'playing' || game.state === 'party' || game.state === 'cd-wait') {
      game._prePauseState = game.state;
      game.state = 'paused';
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
        parts.push(`<div class="inv-row"><span class="inv-label">WEAPONS</span> ${ownedWeapons.join(' · ')}</div>`);
        // Powers stored
        const ps = save.powers || [];
        if (ps.length) {
          const icons = { pwr_shockwave:'⚡SHOCK', pwr_nuke:'☢NUKE', pwr_heal:'✚HEAL', pwr_timewarp:'⌛WARP' };
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
    resetGame();
    game.state = 'playing';
    startWave(1);
    Audio.playMusic('gameplay');
  }

  // ============ GAME OVER ============
  const gameOverOverlay = document.getElementById('gameover-overlay');
  function setGameOver(victory) {
    if (game.state === 'gameover' || game.state === 'win') return;
    game.state = victory ? 'win' : 'gameover';
    game.clearAllTimeouts();
    Input.resetTransient();
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
    persist();
    const titleEl = document.getElementById('gameover-title');
    titleEl.textContent = victory ? 'YOU SAVED 2X' : 'GAME OVER';
    titleEl.classList.toggle('new-high', isNewHigh);
    let statsHTML = `WAVE ${game.wave}<br>SCORE ${game.score}<br>CASH $${game.cashCollected} (banked)<br>HIGH ${save.highScore}<br>BANK $${save.cashBank}`;
    if (isNewHigh) statsHTML = `<span class="new-record">NEW HIGH SCORE!</span><br>` + statsHTML;
    statsHTML += `<br><span class="reset-note">⚠ shop unlocks reset — buy them again next run</span>`;
    document.getElementById('gameover-stats').innerHTML = statsHTML;
    // ROGUELITE — wipe unlocks, powers, consumables, upgrades (NOT cash, NOT customization, NOT highScore)
    save.unlocks = { shotgun: false, stungun: false, goldDraco: false, goldRpg: false, extraTracks: false };
    save.upgrades = { weaponDmg: 0, truckHp: 0, moveSpeed: 0, maxHpUp: 0 };
    save.powers = [];
    save.consumables = { schizo: 0 };
    save.schizoWavesLeft = 0;
    persist();
    gameOverOverlay.classList.remove('hidden');
    Audio.stopMusic();
    try {
      if (isNewHigh) Audio.sfx.highScore();
      else if (victory) Audio.sfx.victory();
      else Audio.sfx.gameOver();
    } catch (e) {}
  }
  wireTap(document.getElementById('retry-btn'), () => {
    gameOverOverlay.classList.add('hidden');
    resetAndStart();
  });
  wireTap(document.getElementById('menu-btn'), () => {
    gameOverOverlay.classList.add('hidden');
    game.state = 'menu';
    game.clearAllTimeouts();
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
