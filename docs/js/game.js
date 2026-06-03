// game.js — main game loop, state, UI wiring

(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // World is rendered at a fixed logical resolution then scaled to fit the screen
  const WORLD_W = 800;
  const WORLD_H = 600;

  // Character customization state
  let customization = {
    fit: '#00ff66',
    accent: '#cc0022',
    hat: 'durag',
    chain: 'gold',
  };

  // Game state
  const game = {
    player: null,
    truck: null,
    enemies: [],
    bullets: [],
    powerUps: [],
    particles: [],
    wave: 0,
    score: 0,
    spawnQueue: 0,
    spawnTimer: 0,
    waveActive: false,
    waveStartTime: 0,
    state: 'menu', // menu | playing | paused | gameover | win
    world: { w: WORLD_W, h: WORLD_H },
    bossActive: false,
    crabGunSpawned: false,
    findNearestEnemy(x, y) {
      let best = null, bestD = Infinity;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    },
    spawnExplosion(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 3;
        this.particles.push(new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color, 2 + Math.random() * 3, 400 + Math.random() * 300));
      }
    },
    onPlayerDeath() { setGameOver(false); },
    onTruckDeath()  { setGameOver(false); },
    onVictory()     { setGameOver(true); },
  };

  // ============ CANVAS RESIZING ============
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width  = WORLD_W;
    canvas.height = WORLD_H;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ============ CHARACTER PREVIEW (on start screen) ============
  const charCanvas = document.getElementById('char-canvas');
  const charCtx = charCanvas.getContext('2d');
  charCtx.imageSmoothingEnabled = false;
  let previewFrame = 0;

  function drawCharPreview() {
    charCtx.fillStyle = '#1a1a1a';
    charCtx.fillRect(0, 0, 120, 160);
    // Grid backdrop
    charCtx.fillStyle = '#222';
    for (let i = 0; i < 120; i += 8) charCtx.fillRect(i, 0, 1, 160);
    for (let j = 0; j < 160; j += 8) charCtx.fillRect(0, j, 120, 1);
    Sprites.drawPlayer(charCtx, 60, 90, customization, 2, previewFrame);
    previewFrame = (previewFrame + 1) % 4;
  }
  setInterval(drawCharPreview, 200);

  // ============ CUSTOMIZATION UI ============
  function initSwatches() {
    const fitSw    = document.querySelectorAll('#fit-swatches .swatch');
    const accSw    = document.querySelectorAll('#accent-swatches .swatch');
    const hatBtns  = document.querySelectorAll('#hat-swatches .hat-btn');
    const chainBtns = document.querySelectorAll('#chain-swatches .hat-btn');

    fitSw.forEach(b => {
      if (b.dataset.fit === customization.fit) b.classList.add('selected');
      b.addEventListener('click', () => {
        Audio.unlock();
        customization.fit = b.dataset.fit;
        fitSw.forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
      });
    });
    accSw.forEach(b => {
      if (b.dataset.accent === customization.accent) b.classList.add('selected');
      b.addEventListener('click', () => {
        Audio.unlock();
        customization.accent = b.dataset.accent;
        accSw.forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
      });
    });
    hatBtns.forEach(b => {
      if (b.dataset.hat === customization.hat) b.classList.add('selected');
      b.addEventListener('click', () => {
        Audio.unlock();
        customization.hat = b.dataset.hat;
        hatBtns.forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
      });
    });
    chainBtns.forEach(b => {
      if (b.dataset.chain === customization.chain) b.classList.add('selected');
      b.addEventListener('click', () => {
        Audio.unlock();
        customization.chain = b.dataset.chain;
        chainBtns.forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
      });
    });
  }
  initSwatches();

  // ============ SCREEN MANAGEMENT ============
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  // Menu music when on menu
  Audio.playMusic('menu'); // will be ignored until unlocked

  // ============ START GAME ============
  document.getElementById('start-btn').addEventListener('click', () => {
    Audio.unlock();
    Audio.playMusic('menu'); // ensure menu music tries again after unlock
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
    resetGame();
    Audio.playMusic('gameplay');
    game.state = 'playing';
    startWave(1);
  }

  function resetGame() {
    game.player = new Player(WORLD_W / 2 - 100, WORLD_H / 2, customization);
    game.truck = new Truck(WORLD_W / 2 + 80, WORLD_H / 2);
    game.enemies = [];
    game.bullets = [];
    game.powerUps = [];
    game.particles = [];
    game.wave = 0;
    game.score = 0;
    game.spawnQueue = 0;
    game.spawnTimer = 0;
    game.waveActive = false;
    game.bossActive = false;
    game.crabGunSpawned = false;
    updateWeaponBar();
  }

  // ============ WAVE LOGIC ============
  function startWave(n) {
    game.wave = n;
    const cfg = Waves.getWaveConfig(n);
    game.waveActive = true;
    game.bossActive = false;

    showWaveBanner(`WAVE ${n}` + (cfg.type === 'boss' ? ' — BOSS' : ''));

    if (cfg.type === 'boss') {
      Audio.playMusic('boss');
      game.bossActive = true;
      // Spawn boss after a short delay
      setTimeout(() => spawnBoss(cfg.boss), 1500);
      // Also spawn some minions
      game.spawnQueue = cfg.minions;
      game.spawnTimer = 800;
    } else {
      Audio.playMusic('gameplay');
      game.spawnQueue = cfg.enemyCount;
      game.spawnTimer = cfg.spawnInterval;
    }

    // Drop crab gun for first time during wave 6+
    if (!game.crabGunSpawned && n >= 6) {
      game.powerUps.push(new PowerUp(WORLD_W / 2, 100, 'crab-gun'));
      game.crabGunSpawned = true;
    }
  }

  function spawnEnemy() {
    const cfg = Waves.getWaveConfig(game.wave);
    const mod = cfg.hpMod || 1;
    // Spawn from random edge
    let x, y;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = -20; y = Math.random() * WORLD_H; }
    else if (edge === 1) { x = WORLD_W + 20; y = Math.random() * WORLD_H; }
    else if (edge === 2) { x = Math.random() * WORLD_W; y = -20; }
    else { x = Math.random() * WORLD_W; y = WORLD_H + 20; }

    const isPap = Math.random() < (cfg.paparazziChance || 0.15);
    if (isPap) game.enemies.push(new Paparazzi(x, y, mod));
    else       game.enemies.push(new Crab(x, y, mod));
  }

  function spawnBoss(type) {
    const x = WORLD_W / 2; const y = -40;
    let boss;
    if (type === 'giantCrab') boss = new GiantCrab(x, y);
    else if (type === 'slimey') boss = new Slimey(x, y);
    else boss = new Mirror2X(x, y, customization);
    game.enemies.push(boss);
    Audio.sfx.boss();
  }

  function updateWaves(dt) {
    if (!game.waveActive) return;

    // Spawn drip-feed
    if (game.spawnQueue > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        spawnEnemy();
        game.spawnQueue--;
        const cfg = Waves.getWaveConfig(game.wave);
        game.spawnTimer = cfg.spawnInterval || 700;
      }
    }

    // Wave complete?
    if (game.spawnQueue === 0 && game.enemies.length === 0) {
      game.waveActive = false;
      const nextWave = game.wave + 1;
      if (nextWave > 15 && game.wave === 15) {
        // Beat the game
        game.onVictory();
      } else {
        setTimeout(() => startWave(nextWave), 2000);
      }
    }
  }

  function showWaveBanner(text) {
    const banner = document.getElementById('wave-banner');
    document.getElementById('banner-text').textContent = text;
    banner.classList.remove('hidden');
    // Re-trigger animation
    const el = banner.querySelector('h2');
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
    setTimeout(() => banner.classList.add('hidden'), 2000);
  }

  // ============ COLLISION / BULLET RESOLUTION ============
  function processBullets(dt) {
    for (const b of game.bullets) {
      b.update(dt, game);
      if (b.dead) continue;

      if (b.source === 'player') {
        // Check vs enemies
        for (const e of game.enemies) {
          if (b.hitSet && b.hitSet.has(e)) continue;
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < e.radius + 4) {
            e.damage(b.damage, game);
            if (b.splash > 0) {
              game.spawnExplosion(b.x, b.y, '#ff8800', 14);
              Audio.sfx.explode();
              for (const e2 of game.enemies) {
                const dd = Math.hypot(e2.x - b.x, e2.y - b.y);
                if (dd < b.splash && e2 !== e) e2.damage(b.damage * 0.6, game);
              }
            }
            if (!b.pierce) { b.dead = true; break; }
            else { b.hitSet.add(e); }
          }
        }
      } else {
        // Enemy bullet vs player + truck
        const dp = Math.hypot(game.player.x - b.x, game.player.y - b.y);
        if (dp < game.player.radius + 4) {
          game.player.damage(b.damage, game);
          if (b.splash > 0) {
            game.spawnExplosion(b.x, b.y, '#ff8800', 12);
            Audio.sfx.explode();
          }
          b.dead = true; continue;
        }
        const dt2 = Math.hypot(game.truck.x - b.x, game.truck.y - b.y);
        if (dt2 < game.truck.radius + 8) {
          game.truck.damage(b.damage);
          if (b.splash > 0) {
            game.spawnExplosion(b.x, b.y, '#ff8800', 12);
            Audio.sfx.explode();
          }
          b.dead = true; continue;
        }
      }
    }
    game.bullets = game.bullets.filter(b => !b.dead);
  }

  // ============ MAIN LOOP ============
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(40, now - lastTime); // clamp dt for stability
    lastTime = now;

    if (game.state === 'playing') {
      update(dt);
    }
    render();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt) {
    game.player.update(dt, game);
    for (const e of game.enemies) e.update(dt, game);
    processBullets(dt);
    for (const p of game.powerUps) p.update(dt, game);
    for (const p of game.particles) p.update(dt);

    // Cleanup
    game.enemies  = game.enemies.filter(e => !e.dead);
    game.powerUps = game.powerUps.filter(p => !p.dead);
    game.particles = game.particles.filter(p => !p.dead);

    // Truck death check
    if (game.truck.hp <= 0) game.onTruckDeath();

    updateWaves(dt);
    updateHUD();
  }

  // ============ RENDER ============
  function render() {
    // Skip rendering the game world entirely when we're on the menu/start screen
    if (game.state === 'menu' || !game.player || !game.truck) return;

    // Background — gritty asphalt
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Asphalt cracks/details
    ctx.fillStyle = '#0a0604';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % WORLD_W;
      const y = (i * 211) % WORLD_H;
      ctx.fillRect(x, y, 2, 2);
    }
    // Road stripes
    ctx.fillStyle = '#332210';
    for (let i = 0; i < WORLD_W; i += 60) {
      ctx.fillRect(i, WORLD_H / 2 - 1, 30, 2);
    }

    // Sort entities by Y for depth — filter null/undefined defensively
    const drawables = [game.truck, ...game.enemies, ...game.powerUps, game.player]
      .filter(d => d != null);
    drawables.sort((a, b) => a.y - b.y);
    drawables.forEach(d => d.draw(ctx));

    // Bullets above
    for (const b of game.bullets) b.draw(ctx);
    // Particles top
    for (const p of game.particles) p.draw(ctx);

    // Boss bar
    const boss = game.enemies.find(e => e.isBoss);
    if (boss) {
      const bw = 400; const bh = 12;
      const bx = (WORLD_W - bw) / 2; const by = 30;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#cc0022';
      ctx.fillRect(bx, by, bw * (boss.hp / boss.maxHp), bh);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(boss.name, WORLD_W / 2, by - 6);
      ctx.textAlign = 'left';
    }
  }

  // ============ HUD ============
  const hpFill = document.getElementById('player-hp-fill');
  const truckFill = document.getElementById('truck-hp-fill');
  const waveEl = document.getElementById('hud-wave');
  const scoreEl = document.getElementById('hud-score');
  const ammoEl = document.getElementById('hud-ammo');

  function updateHUD() {
    if (!game.player) return;
    hpFill.style.width = (game.player.hp / game.player.maxHp * 100) + '%';
    truckFill.style.width = (game.truck.hp / game.truck.maxHp * 100) + '%';
    waveEl.textContent = `WAVE ${game.wave}`;
    scoreEl.textContent = `SCORE ${game.score}`;
    const w = Weapons.get(game.player.weaponIdx);
    const wState = game.player.weapons[game.player.weaponIdx];
    if (w.magazine === Infinity) ammoEl.textContent = `${w.name}: ∞`;
    else if (wState.reloading) ammoEl.textContent = `${w.name}: RELOADING`;
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
    el.addEventListener('click', () => {
      if (!game.player) return;
      if (i === 4 && !game.player.crabUnlocked) return;
      game.player.weaponIdx = i;
      updateWeaponBar();
    });
    // Prevent double-tap zoom on touch
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!game.player) return;
      if (i === 4 && !game.player.crabUnlocked) return;
      game.player.weaponIdx = i;
      updateWeaponBar();
    }, { passive: false });
  });

  // ============ PAUSE / GAME OVER ============
  const pauseOverlay = document.getElementById('pause-overlay');
  document.getElementById('pause-btn').addEventListener('click', () => togglePause());
  document.getElementById('resume-btn').addEventListener('click', () => togglePause());
  document.getElementById('restart-btn').addEventListener('click', () => { togglePause(); resetAndStart(); });
  document.getElementById('quit-btn').addEventListener('click', () => {
    pauseOverlay.classList.add('hidden');
    game.state = 'menu';
    Audio.playMusic('menu');
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

  function resetAndStart() { resetGame(); game.state = 'playing'; startWave(1); Audio.playMusic('gameplay'); }

  const gameOverOverlay = document.getElementById('gameover-overlay');
  function setGameOver(victory) {
    if (game.state === 'gameover' || game.state === 'win') return;
    game.state = victory ? 'win' : 'gameover';
    document.getElementById('gameover-title').textContent = victory ? 'YOU SAVED 2X' : 'GAME OVER';
    document.getElementById('gameover-stats').innerHTML = `WAVE ${game.wave}<br>SCORE ${game.score}`;
    gameOverOverlay.classList.remove('hidden');
    Audio.stopMusic();
    Audio.sfx.gameOver();
  }
  document.getElementById('retry-btn').addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    resetAndStart();
  });
  document.getElementById('menu-btn').addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    game.state = 'menu';
    showScreen('start-screen');
    Audio.playMusic('menu');
  });

  // Prevent iOS bounce / pinch zoom on game canvas
  document.body.addEventListener('touchmove', e => {
    if (e.target.closest('#howto-content') || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
})();
