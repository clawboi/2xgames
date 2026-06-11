// game.js — main loop, state, UI wiring
// CRITICAL ARCHITECTURE: the main loop is wrapped in try/catch and ALWAYS
// re-schedules requestAnimationFrame, so a frame-level exception can never
// freeze the whole game. Individual systems (update, render, processBullets)
// are also wrapped so one bad frame logs and recovers.

(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const WORLD_W = 800;
  const WORLD_H = 600;

  // ============ STORAGE (high score, settings, unlocks) ============
  const STORAGE_KEY = 'crabcage2x_save_v2';
  function loadSave() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return { highScore: 0, totalKills: 0, bossesBeaten: [] };
      return Object.assign({ highScore: 0, totalKills: 0, bossesBeaten: [] }, JSON.parse(s));
    } catch (e) { return { highScore: 0, totalKills: 0, bossesBeaten: [] }; }
  }
  function persist(save) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  const save = loadSave();

  // Update high-score on start screen
  function refreshHighScoreUI() {
    const el = document.getElementById('high-score-display');
    if (el) el.textContent = `HIGH ${save.highScore}`;
  }
  refreshHighScoreUI();

  // Character customization state
  let customization = {
    fit: '#00ff66',
    accent: '#cc0022',
    hat: 'durag',
    chain: 'gold',
    shades: false,
    pattern: 'solid', // solid | stripe | glow | flame
  };

  // ============ GAME STATE ============
  const game = {
    player: null,
    truck: null,
    enemies: [],
    bullets: [],
    powerUps: [],
    cash: [],
    particles: [],
    floaters: [],
    dust: [],
    wave: 0,
    score: 0,
    cashCollected: 0,
    waveKills: 0,
    waveDamageTaken: 0,
    spawnQueue: 0,
    spawnTimer: 0,
    waveActive: false,
    state: 'menu',
    world: { w: WORLD_W, h: WORLD_H },
    bossActive: false,
    crabGunSpawned: false,
    pendingTimeouts: new Set(),
    shake: { x: 0, y: 0, intensity: 0 },
    timeScale: 1,
    timeScaleEnd: 0,
    combo: 0,
    comboTimer: 0,
    comboWindow: 2500,
    killstreak: 0,
    multiKillTimer: 0,
    multiKillCount: 0,
    multiplier: 1,
    bossIntroAlpha: 0,
    // Hard caps — defensive guards against runaway memory
    MAX_BULLETS: 250,
    MAX_PARTICLES: 400,
    MAX_FLOATERS: 60,
    MAX_DUST: 50,
    MAX_CASH: 80,

    findNearestEnemy(x, y) {
      let best = null, bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
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
      this.cash.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1,
        amount,
        life: 10000,
        frame: Math.floor(Math.random() * 100),
        collected: false,
      });
    },
    addScreenShake(intensity) {
      this.shake.intensity = Math.min(20, this.shake.intensity + intensity);
    },
    slowMo(ms, scale = 0.35) {
      this.timeScale = scale;
      this.timeScaleEnd = performance.now() + ms;
    },
    addKill(enemy) {
      const now = performance.now();
      this.combo++;
      this.comboTimer = this.comboWindow;
      this.killstreak++;
      this.waveKills++;
      save.totalKills++;
      // Multi-kill window: kills within 600ms cluster together
      if (now - this.multiKillTimer < 600) {
        this.multiKillCount++;
      } else {
        this.multiKillCount = 1;
      }
      this.multiKillTimer = now;
      // Multiplier from combo
      this.multiplier = 1 + Math.min(4, Math.floor(this.combo / 5));
      const scoreGain = Math.round(enemy.score * this.multiplier);
      this.score += scoreGain;
      // Floating score text — colored by tier
      const colors = ['#ffffff','#ffcc00','#ff8800','#ff4400','#ff00ff'];
      this.spawnFloater(enemy.x, enemy.y - 14, `+${scoreGain}`, colors[Math.min(4, this.multiplier - 1)], 12 + this.multiplier * 2);
      // Cash drops — every kill drops a coin or two
      const cashAmt = 1 + Math.floor(this.multiplier / 2) + (enemy.isBoss ? 50 : 0);
      const cashCount = enemy.isBoss ? 25 : (1 + Math.floor(Math.random() * 2));
      for (let i = 0; i < cashCount; i++) this.spawnCash(enemy.x, enemy.y, cashAmt);

      // Multi-kill announcements (fire AFTER the cluster lands so the count is right)
      if (this.multiKillCount === 2) {
        this.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 40, 'DOUBLE KILL', '#ffcc00', 22, -0.5);
        try { Audio.sfx.multiKill(); } catch (e) {}
      } else if (this.multiKillCount === 3) {
        this.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 40, 'TRIPLE KILL', '#ff8800', 24, -0.5);
        try { Audio.sfx.multiKill(); } catch (e) {}
      } else if (this.multiKillCount === 4) {
        this.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 40, 'MEGA KILL', '#ff4400', 26, -0.5);
        try { Audio.sfx.multiKill(); } catch (e) {}
      } else if (this.multiKillCount >= 5) {
        this.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 40, 'MASSACRE', '#ff00ff', 28, -0.5);
        try { Audio.sfx.multiKill(); } catch (e) {}
      }

      // Killstreak announcements (separate from multikill)
      const announcements = {
        5:  'NICE!',
        10: 'COMBO!',
        15: 'STREAK!',
        20: 'RAMPAGE!',
        30: 'UNSTOPPABLE!',
        50: 'GODLIKE!',
        75: 'BEYOND HUMAN',
        100: 'CRABCAGE LEGEND',
      };
      if (announcements[this.killstreak]) {
        this.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 80, announcements[this.killstreak], '#ff00ff', 28, -0.4);
        try { Audio.sfx.combo(); } catch (e) {}
      }
    },
    breakCombo() { this.combo = 0; this.multiplier = 1; this.killstreak = 0; },
    schedule(fn, ms) {
      const id = setTimeout(() => { this.pendingTimeouts.delete(id); try { fn(); } catch (e) { console.error('Scheduled task error:', e); } }, ms);
      this.pendingTimeouts.add(id);
      return id;
    },
    clearAllTimeouts() {
      for (const id of this.pendingTimeouts) clearTimeout(id);
      this.pendingTimeouts.clear();
    },
    onPlayerDeath() { setGameOver(false); },
    onTruckDeath()  { setGameOver(false); },
    onVictory()     { setGameOver(true); },
  };

  // ============ CANVAS RESIZING ============
  function resizeCanvas() {
    canvas.style.width  = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.width  = WORLD_W;
    canvas.height = WORLD_H;
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));
  resizeCanvas();

  // ============ CHARACTER PREVIEW ============
  const charCanvas = document.getElementById('char-canvas');
  const charCtx = charCanvas.getContext('2d');
  charCtx.imageSmoothingEnabled = false;
  let previewFrame = 0;
  let previewDir = 0;
  let previewDirTimer = 0;

  function drawCharPreview() {
    try {
      charCtx.fillStyle = '#0a0a0a';
      charCtx.fillRect(0, 0, 120, 160);
      const grad = charCtx.createRadialGradient(60, 90, 5, 60, 90, 80);
      grad.addColorStop(0, 'rgba(204,0,34,0.18)');
      grad.addColorStop(1, 'rgba(204,0,34,0)');
      charCtx.fillStyle = grad;
      charCtx.fillRect(0, 0, 120, 160);
      charCtx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 120; i += 8) charCtx.fillRect(i, 0, 1, 160);
      for (let j = 0; j < 160; j += 8) charCtx.fillRect(0, j, 120, 1);
      Sprites.drawPlayer(charCtx, 60, 90, customization, previewDir, previewFrame);
      previewFrame = (previewFrame + 1) % 4;
      previewDirTimer++;
      if (previewDirTimer > 8) { previewDirTimer = 0; previewDir = (previewDir + 1) % 4; }
    } catch (e) { console.error('preview error', e); }
  }
  let previewIntervalId = null;
  function startPreview() {
    if (previewIntervalId) return;
    previewIntervalId = setInterval(drawCharPreview, 200);
  }
  function stopPreview() {
    if (previewIntervalId) { clearInterval(previewIntervalId); previewIntervalId = null; }
  }
  startPreview();

  // ============ FIRST-INTERACTION AUDIO UNLOCK ============
  function firstInteractionUnlock() {
    Audio.unlock();
    if (game.state === 'menu') Audio.playMusic('menu');
  }
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(evt => {
    window.addEventListener(evt, firstInteractionUnlock, { once: false, passive: true });
  });
  // Also try unlock on visibility change (helps when user returns to tab)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && game.state === 'menu') Audio.playMusic('menu');
  });

  // ============ CUSTOMIZATION UI ============
  function initCustomizer() {
    function wireSwatchGroup(selector, attr, key) {
      const items = document.querySelectorAll(selector);
      items.forEach(b => {
        if (b.dataset[attr] === String(customization[key])) b.classList.add('selected');
        b.addEventListener('click', () => {
          Audio.unlock();
          // Coerce 'true'/'false' to booleans for shades
          let val = b.dataset[attr];
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          customization[key] = val;
          items.forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          try { Audio.sfx.pickup(); } catch (e) {}
        });
      });
    }
    wireSwatchGroup('#fit-swatches .swatch', 'fit', 'fit');
    wireSwatchGroup('#accent-swatches .swatch', 'accent', 'accent');
    wireSwatchGroup('#hat-swatches .hat-btn', 'hat', 'hat');
    wireSwatchGroup('#chain-swatches .hat-btn', 'chain', 'chain');
    wireSwatchGroup('#shades-swatches .hat-btn', 'shades', 'shades');
    wireSwatchGroup('#pattern-swatches .hat-btn', 'pattern', 'pattern');

    // Randomize button
    const randomBtn = document.getElementById('randomize-btn');
    if (randomBtn) randomBtn.addEventListener('click', () => {
      Audio.unlock();
      const fits = ['#00ff66','#cc0022','#ffcc00','#9933ff','#ffffff','#00aaff','#ff00aa','#00ff00','#ff6600'];
      const accents = ['#cc0022','#00ff66','#000000','#ffcc00','#ffffff','#9933ff','#00aaff'];
      const hats = ['durag','cap','hood','beanie','bandana','headphones','mohawk','none'];
      const chains = ['gold','ice','platinum','none'];
      const patterns = ['solid','stripe','glow','flame'];
      customization.fit = fits[Math.floor(Math.random() * fits.length)];
      customization.accent = accents[Math.floor(Math.random() * accents.length)];
      customization.hat = hats[Math.floor(Math.random() * hats.length)];
      customization.chain = chains[Math.floor(Math.random() * chains.length)];
      customization.shades = Math.random() < 0.5;
      customization.pattern = patterns[Math.floor(Math.random() * patterns.length)];
      // Re-apply selected state to all swatch groups
      ['fit','accent','hat','chain','shades','pattern'].forEach(key => {
        const sel = key === 'fit' ? '#fit-swatches .swatch'
                : key === 'accent' ? '#accent-swatches .swatch'
                : key === 'hat' ? '#hat-swatches .hat-btn'
                : key === 'chain' ? '#chain-swatches .hat-btn'
                : key === 'shades' ? '#shades-swatches .hat-btn'
                : '#pattern-swatches .hat-btn';
        const attr = key === 'fit' || key === 'accent' ? key : key;
        document.querySelectorAll(sel).forEach(el => {
          el.classList.toggle('selected', String(el.dataset[attr]) === String(customization[key]));
        });
      });
      try { Audio.sfx.cash(); } catch (e) {}
    });
  }
  initCustomizer();

  // ============ MUTE BUTTON ============
  const menuMuteBtn = document.getElementById('menu-mute-btn');
  if (menuMuteBtn) {
    let muted = false;
    menuMuteBtn.addEventListener('click', () => {
      Audio.unlock();
      muted = !muted;
      Audio.setMusicEnabled(!muted);
      Audio.setSfxEnabled(!muted);
      menuMuteBtn.textContent = muted ? '🔇' : '🔊';
      menuMuteBtn.classList.toggle('muted', muted);
      const mt = document.getElementById('music-toggle');
      const st = document.getElementById('sfx-toggle');
      if (mt) mt.checked = !muted;
      if (st) st.checked = !muted;
    });
  }

  // ============ SCREEN MANAGEMENT ============
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  Audio.playMusic('menu');

  // ============ START GAME ============
  document.getElementById('start-btn').addEventListener('click', () => {
    Audio.unlock();
    startGame();
  });
  document.getElementById('howto-btn').addEventListener('click', () => {
    Audio.unlock();
    showScreen('howto-screen');
  });
  document.getElementById('howto-back').addEventListener('click', () => showScreen('start-screen'));

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
    game.truck = new Truck(WORLD_W / 2 + 80, WORLD_H / 2);
    game.enemies = [];
    game.bullets = [];
    game.powerUps = [];
    game.cash = [];
    game.particles = [];
    game.floaters = [];
    game.dust = [];
    game.wave = 0;
    game.score = 0;
    game.cashCollected = 0;
    game.waveKills = 0;
    game.waveDamageTaken = 0;
    game.spawnQueue = 0;
    game.spawnTimer = 0;
    game.waveActive = false;
    game.bossActive = false;
    game.crabGunSpawned = false;
    game.shake.intensity = 0;
    game.timeScale = 1;
    game.combo = 0;
    game.comboTimer = 0;
    game.multiplier = 1;
    game.killstreak = 0;
    game.multiKillCount = 0;
    game.bossIntroAlpha = 0;
    updateWeaponBar();
  }

  // ============ WAVE LOGIC ============
  function startWave(n) {
    game.wave = n;
    const cfg = Waves.getWaveConfig(n);
    game.waveActive = true;
    game.bossActive = false;
    game.waveKills = 0;
    game.waveDamageTaken = 0;

    showWaveBanner(`WAVE ${n}` + (cfg.type === 'boss' ? ' — BOSS' : ''));

    if (cfg.type === 'boss') {
      Audio.playMusic('boss');
      game.bossActive = true;
      game.bossIntroAlpha = 1;
      game.schedule(() => spawnBoss(cfg.boss), 1500);
      game.spawnQueue = cfg.minions;
      game.spawnTimer = 800;
    } else {
      if (n > 1) Audio.playMusic('gameplay');
      game.spawnQueue = cfg.enemyCount;
      game.spawnTimer = cfg.spawnInterval;
    }

    if (!game.crabGunSpawned && n >= 6) {
      game.powerUps.push(new PowerUp(WORLD_W / 2, 100, 'crab-gun'));
      game.crabGunSpawned = true;
    }

    try { Audio.sfx.levelUp(); } catch (e) {}
  }

  function spawnEnemy() {
    const cfg = Waves.getWaveConfig(game.wave);
    const mod = cfg.hpMod || 1;
    let x, y;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = -20; y = Math.random() * WORLD_H; }
    else if (edge === 1) { x = WORLD_W + 20; y = Math.random() * WORLD_H; }
    else if (edge === 2) { x = Math.random() * WORLD_W; y = -20; }
    else { x = Math.random() * WORLD_W; y = WORLD_H + 20; }

    const r = Math.random();
    const probs = cfg.spawnProbs || { paparazzi: 0.15, fastCrab: 0, tankCrab: 0, exploder: 0 };
    let cum = 0;
    let pick = 'crab';
    cum += probs.paparazzi || 0;  if (r < cum) pick = 'paparazzi';
    else { cum += probs.fastCrab || 0; if (r < cum) pick = 'fastCrab';
    else { cum += probs.tankCrab || 0; if (r < cum) pick = 'tankCrab';
    else { cum += probs.exploder || 0; if (r < cum) pick = 'exploder';
    }}}

    let enemy;
    switch (pick) {
      case 'paparazzi': enemy = new Paparazzi(x, y, mod); break;
      case 'fastCrab':  enemy = new FastCrab(x, y, mod); break;
      case 'tankCrab':  enemy = new TankCrab(x, y, mod); break;
      case 'exploder':  enemy = new ExploderCrab(x, y, mod); break;
      default:          enemy = new Crab(x, y, mod);
    }
    game.enemies.push(enemy);
  }

  function spawnBoss(type) {
    const x = WORLD_W / 2; const y = -40;
    let boss;
    if (type === 'giantCrab') boss = new GiantCrab(x, y);
    else if (type === 'slimey') boss = new Slimey(x, y);
    else boss = new Mirror2X(x, y, customization);
    game.enemies.push(boss);
    try { Audio.sfx.boss(); } catch (e) {}
    game.addScreenShake(15);
    game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 80, boss.name + ' INCOMING', '#ff0066', 24, -0.4);
  }

  function updateWaves(dt) {
    if (!game.waveActive) return;

    if (game.spawnQueue > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        spawnEnemy();
        game.spawnQueue--;
        const cfg = Waves.getWaveConfig(game.wave);
        game.spawnTimer = cfg.spawnInterval || 700;
      }
    }

    if (game.spawnQueue === 0 && game.enemies.length === 0) {
      game.waveActive = false;
      // Wave-clear bonus
      if (game.waveDamageTaken === 0 && game.wave > 0) {
        const bonus = 200 * game.wave;
        game.score += bonus;
        game.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 20, `PERFECT WAVE +${bonus}`, '#00ff66', 24, -0.5);
        try { Audio.sfx.combo(); } catch (e) {}
      }
      const nextWave = game.wave + 1;
      if (nextWave > 15 && game.wave === 15) {
        game.onVictory();
      } else {
        game.schedule(() => { if (game.state === 'playing') startWave(nextWave); }, 2000);
      }
    }
  }

  function showWaveBanner(text) {
    const banner = document.getElementById('wave-banner');
    document.getElementById('banner-text').textContent = text;
    banner.classList.remove('hidden');
    const el = banner.querySelector('h2');
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = '';
    game.schedule(() => banner.classList.add('hidden'), 2000);
  }

  // ============ COLLISION ============
  function processBullets(dt) {
    // Cap bullet count defensively
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
              try {
                if (typeof e.damage === 'function') {
                  e.damage(dmg, game, crit, b);
                } else {
                  console.warn('Non-enemy in game.enemies:', e?.constructor?.name, JSON.stringify(Object.keys(e || {})));
                  e.dead = true;
                }
              } catch (err) { console.error('enemy damage err', err); }
              if (b.splash > 0) {
                game.spawnExplosion(b.x, b.y, '#ff8800', 14);
                try { Audio.sfx.explode(); } catch (er) {}
                game.addScreenShake(6);
                for (const e2 of game.enemies) {
                  if (e2 === e || e2.dead) continue;
                  const dd = Math.hypot(e2.x - b.x, e2.y - b.y);
                  if (dd < b.splash) { try { e2.damage(b.damage * 0.6, game, false); } catch (er) {} }
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
          const dt2 = Math.hypot(game.truck.x - b.x, game.truck.y - b.y);
          if (dt2 < game.truck.radius + 8) {
            try { game.truck.damage(b.damage); } catch (er) {}
            game.spawnSparks(b.x, b.y, '#ffaa00', 3);
            if (b.splash > 0) { game.spawnExplosion(b.x, b.y, '#ff8800', 12); try { Audio.sfx.explode(); } catch (er) {} game.addScreenShake(6); }
            else game.addScreenShake(2);
            b.dead = true; continue;
          }
        }
      } catch (err) {
        console.error('bullet process err', err);
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

      if (game.timeScale < 1 && now > game.timeScaleEnd) {
        game.timeScale = Math.min(1, game.timeScale + 0.05);
      }
      const scaledDt = dt * game.timeScale;

      if (game.state === 'playing') {
        try { update(scaledDt); } catch (err) { console.error('update err', err); }
      }
      try { render(); } catch (err) { console.error('render err', err); }
    } catch (outer) {
      console.error('loop err', outer);
    }
    // ALWAYS schedule next frame, no matter what happened
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt) {
    // Decay screen shake
    if (game.shake.intensity > 0) {
      game.shake.intensity *= 0.85;
      if (game.shake.intensity < 0.2) game.shake.intensity = 0;
    }
    game.shake.x = (Math.random() - 0.5) * game.shake.intensity;
    game.shake.y = (Math.random() - 0.5) * game.shake.intensity;

    // Combo timer
    if (game.combo > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) game.breakCombo();
    }

    // Boss intro fade
    if (game.bossIntroAlpha > 0) game.bossIntroAlpha = Math.max(0, game.bossIntroAlpha - dt / 1500);

    // Update entities (each in try/catch so one bad entity doesn't kill the frame)
    try { game.player.update(dt, game); } catch (e) { console.error('player update', e); }
    for (const e of game.enemies) { try { e.update(dt, game); } catch (er) { console.error('enemy update', er); e.dead = true; } }
    try { game.truck.update(dt); } catch (e) {}
    try { processBullets(dt); } catch (e) { console.error('processBullets', e); }
    for (const p of game.powerUps) { try { p.update(dt, game); } catch (e) {} }
    for (const c of game.cash) { try { updateCash(c, dt); } catch (e) {} }
    for (const p of game.particles) { try { p.update(dt); } catch (e) { p.dead = true; } }
    for (const f of game.floaters) {
      f.y += f.vy;
      f.vy *= 0.96;
      f.life -= dt;
    }
    spawnDust();
    for (const d of game.dust) { d.x += d.vx; d.y += d.vy; d.life -= dt; }

    // Cleanup
    game.enemies   = game.enemies.filter(e => !e.dead);
    game.powerUps  = game.powerUps.filter(p => !p.dead);
    game.particles = game.particles.filter(p => !p.dead);
    game.floaters  = game.floaters.filter(f => f.life > 0);
    game.cash      = game.cash.filter(c => !c.collected && c.life > 0);
    game.dust      = game.dust.filter(d => d.life > 0 && d.x > -5 && d.x < WORLD_W + 5 && d.y > -5 && d.y < WORLD_H + 5);

    if (game.truck.hp <= 0) game.onTruckDeath();

    updateWaves(dt);
    updateHUD();
  }

  function updateCash(c, dt) {
    c.life -= dt;
    c.frame++;
    // Magnetism to player when close
    const dx = game.player.x - c.x;
    const dy = game.player.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 90) {
      const pull = (1 - d / 90) * 6;
      c.vx += (dx / d) * pull * 0.2;
      c.vy += (dy / d) * pull * 0.2;
    }
    c.x += c.vx;
    c.y += c.vy;
    c.vx *= 0.92;
    c.vy *= 0.92;
    // Settle if slow
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
        x: fromLeft ? -3 : WORLD_W + 3,
        y: Math.random() * WORLD_H,
        vx: (fromLeft ? 1 : -1) * (0.3 + Math.random() * 0.6),
        vy: (Math.random() - 0.5) * 0.2,
        life: 8000,
        size: 1 + Math.random() * 1.5,
        alpha: 0.15 + Math.random() * 0.25,
      });
    }
  }

  // ============ RENDER ============
  function render() {
    if (game.state === 'menu' || !game.player || !game.truck) return;

    ctx.save();
    ctx.translate(game.shake.x, game.shake.y);

    // Background
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = '#0a0604';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % WORLD_W;
      const y = (i * 211) % WORLD_H;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#332210';
    for (let i = 0; i < WORLD_W; i += 60) {
      ctx.fillRect(i, WORLD_H / 2 - 1, 30, 2);
    }
    ctx.fillStyle = '#2a1810';
    ctx.fillRect(0, 0, WORLD_W, 4);
    ctx.fillRect(0, WORLD_H - 4, WORLD_W, 4);

    // Dust
    for (const d of game.dust) {
      ctx.fillStyle = `rgba(180,150,100,${d.alpha * (d.life / 8000)})`;
      ctx.fillRect(d.x, d.y, d.size, d.size);
    }

    // Cash (drawn under entities so they get walked over visually)
    for (const c of game.cash) {
      Sprites.drawCash(ctx, c.x, c.y, c.frame, c.life / 10000);
    }

    // Y-sorted entities
    const drawables = [game.truck, ...game.enemies, ...game.powerUps, game.player].filter(d => d != null);
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) { try { d.draw(ctx); } catch (e) {} }

    for (const b of game.bullets) { try { b.draw(ctx); } catch (e) {} }
    for (const p of game.particles) { try { p.draw(ctx); } catch (e) {} }

    // Floating text
    for (const f of game.floaters) {
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.font = `bold ${f.size}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    // Boss bar
    const boss = game.enemies.find(e => e.isBoss && !e.dead);
    if (boss) {
      const bw = 480; const bh = 14;
      const bx = (WORLD_W - bw) / 2; const by = 32;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      const pct = Math.max(0, boss.hp / boss.maxHp);
      const grad = ctx.createLinearGradient(bx, by, bx + bw * pct, by);
      grad.addColorStop(0, '#ff0044');
      grad.addColorStop(1, '#ff6600');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw * pct, bh);
      if (pct < 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(performance.now() / 100) * 0.2})`;
        ctx.fillRect(bx, by, bw * pct, bh);
      }
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(boss.name, WORLD_W / 2, by - 6);
      ctx.textAlign = 'left';
    }

    ctx.restore();

    // Boss intro vignette (outside shake transform)
    if (game.bossIntroAlpha > 0) {
      ctx.fillStyle = `rgba(255,0,40,${game.bossIntroAlpha * 0.4})`;
      ctx.fillRect(0, 0, WORLD_W, 60);
      ctx.fillRect(0, WORLD_H - 60, WORLD_W, 60);
    }

    // Low-hp red vignette
    if (game.player.hp / game.player.maxHp < 0.3) {
      const pulse = 0.3 + Math.sin(performance.now() / 200) * 0.15;
      const grad = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_W / 3, WORLD_W / 2, WORLD_H / 2, WORLD_W / 1.3);
      grad.addColorStop(0, 'rgba(204,0,34,0)');
      grad.addColorStop(1, `rgba(204,0,34,${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // Combo display
    if (game.combo >= 3) {
      const a = Math.min(1, game.comboTimer / game.comboWindow);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#000';
      ctx.fillText(`${game.combo}x  ×${game.multiplier}`, WORLD_W / 2 + 1, 80);
      ctx.fillStyle = game.multiplier >= 4 ? '#ff00ff' : (game.multiplier >= 2 ? '#ffcc00' : '#fff');
      ctx.fillText(`${game.combo}x  ×${game.multiplier}`, WORLD_W / 2, 79);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(WORLD_W / 2 - 50, 86, 100, 3);
      ctx.fillStyle = game.multiplier >= 4 ? '#ff00ff' : '#ffcc00';
      ctx.fillRect(WORLD_W / 2 - 50, 86, 100 * a, 3);
      ctx.restore();
    }
  }

  // ============ HUD ============
  const hpFill = document.getElementById('player-hp-fill');
  const truckFill = document.getElementById('truck-hp-fill');
  const waveEl = document.getElementById('hud-wave');
  const scoreEl = document.getElementById('hud-score');
  const ammoEl = document.getElementById('hud-ammo');
  const cashEl = document.getElementById('hud-cash');

  function updateHUD() {
    if (!game.player) return;
    hpFill.style.width = (game.player.hp / game.player.maxHp * 100) + '%';
    truckFill.style.width = (game.truck.hp / game.truck.maxHp * 100) + '%';
    waveEl.textContent = `WAVE ${game.wave}`;
    scoreEl.textContent = `${game.score}`;
    if (cashEl) cashEl.textContent = `$${game.cashCollected}`;
    const w = Weapons.get(game.player.weaponIdx);
    const wState = game.player.weapons[game.player.weaponIdx];
    if (w.magazine === Infinity) ammoEl.textContent = `${w.name}: ∞`;
    else if (wState.reloading) {
      const pct = 1 - Math.max(0, (wState.reloadEnd - performance.now()) / w.reloadTime);
      const bars = Math.floor(pct * 10);
      ammoEl.textContent = `${w.name}: [${'█'.repeat(bars)}${'░'.repeat(10 - bars)}]`;
    }
    else ammoEl.textContent = `${w.name}: ${wState.ammo}/${w.magazine}`;
    updateWeaponBar();
  }

  function updateWeaponBar() {
    document.querySelectorAll('.weapon-slot').forEach((el, i) => {
      el.classList.toggle('active', i === game.player?.weaponIdx);
      if (i === 4) {
        el.classList.toggle('locked', !game.player?.crabUnlocked);
        el.classList.toggle('unlocked-special', !!game.player?.crabUnlocked);
      }
    });
  }

  document.querySelectorAll('.weapon-slot').forEach((el, i) => {
    const switchTo = () => {
      if (!game.player) return;
      if (i === 4 && !game.player.crabUnlocked) return;
      game.player.weaponIdx = i;
      updateWeaponBar();
      try { Audio.sfx.reload(); } catch (e) {}
    };
    el.addEventListener('click', switchTo);
    el.addEventListener('touchstart', e => { e.preventDefault(); switchTo(); }, { passive: false });
  });

  // Scroll wheel to cycle weapons (desktop quality-of-life)
  window.addEventListener('wheel', e => {
    if (game.state !== 'playing' || !game.player) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    let next = game.player.weaponIdx;
    for (let i = 0; i < 5; i++) {
      next = (next + dir + 5) % 5;
      if (next === 4 && !game.player.crabUnlocked) continue;
      break;
    }
    game.player.weaponIdx = next;
    updateWeaponBar();
    try { Audio.sfx.reload(); } catch (er) {}
  }, { passive: true });

  // ============ PAUSE / GAME OVER ============
  const pauseOverlay = document.getElementById('pause-overlay');
  document.getElementById('pause-btn').addEventListener('click', () => togglePause());
  document.getElementById('resume-btn').addEventListener('click', () => togglePause());
  document.getElementById('restart-btn').addEventListener('click', () => { togglePause(); resetAndStart(); });
  document.getElementById('quit-btn').addEventListener('click', () => {
    pauseOverlay.classList.add('hidden');
    game.state = 'menu';
    game.clearAllTimeouts();
    Input.resetTransient();
    Audio.playMusic('menu');
    refreshHighScoreUI();
    showScreen('start-screen');
  });
  document.getElementById('music-toggle').addEventListener('change', e => Audio.setMusicEnabled(e.target.checked));
  document.getElementById('sfx-toggle').addEventListener('change', e => Audio.setSfxEnabled(e.target.checked));

  function togglePause() {
    if (game.state === 'playing') {
      game.state = 'paused';
      pauseOverlay.classList.remove('hidden');
    } else if (game.state === 'paused') {
      game.state = 'playing';
      pauseOverlay.classList.add('hidden');
      lastTime = performance.now();
    }
  }

  function resetAndStart() {
    resetGame();
    game.state = 'playing';
    startWave(1);
    Audio.playMusic('gameplay');
  }

  const gameOverOverlay = document.getElementById('gameover-overlay');
  function setGameOver(victory) {
    if (game.state === 'gameover' || game.state === 'win') return;
    game.state = victory ? 'win' : 'gameover';
    game.clearAllTimeouts();
    Input.resetTransient();
    // High score
    const isNewHigh = game.score > save.highScore;
    if (isNewHigh) { save.highScore = game.score; persist(save); }
    const titleEl = document.getElementById('gameover-title');
    titleEl.textContent = victory ? 'YOU SAVED 2X' : 'GAME OVER';
    titleEl.classList.toggle('new-high', isNewHigh);
    let statsHTML = `WAVE ${game.wave}<br>SCORE ${game.score}<br>CASH $${game.cashCollected}<br>HIGH ${save.highScore}`;
    if (isNewHigh) statsHTML = `<span class="new-record">NEW HIGH SCORE!</span><br>` + statsHTML;
    document.getElementById('gameover-stats').innerHTML = statsHTML;
    gameOverOverlay.classList.remove('hidden');
    Audio.stopMusic();
    try {
      if (isNewHigh) Audio.sfx.highScore();
      else if (victory) Audio.sfx.victory();
      else Audio.sfx.gameOver();
    } catch (e) {}
  }
  document.getElementById('retry-btn').addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    resetAndStart();
  });
  document.getElementById('menu-btn').addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    game.state = 'menu';
    game.clearAllTimeouts();
    refreshHighScoreUI();
    showScreen('start-screen');
    Audio.playMusic('menu');
  });

  // Prevent iOS bounce / pinch zoom on game canvas
  document.body.addEventListener('touchmove', e => {
    if (e.target.closest('.howto-content')) return;
    if (e.target.closest('.customizer')) return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
})();
