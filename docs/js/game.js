// game.js — main game loop, state, UI wiring
// Major upgrades vs v1: screen shake, combo system, floating damage numbers,
// killstreak announcer, slow-mo boss kill, low-hp edge flash, ambient dust,
// pending-timeout tracking (prevents wave/boss callbacks firing after reset),
// proper audio unlock on any first interaction, mute toggle on start screen.

(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

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
    floaters: [],     // floating damage/score text
    dust: [],         // ambient background particles
    wave: 0,
    score: 0,
    spawnQueue: 0,
    spawnTimer: 0,
    waveActive: false,
    waveStartTime: 0,
    state: 'menu',
    world: { w: WORLD_W, h: WORLD_H },
    bossActive: false,
    crabGunSpawned: false,
    pendingTimeouts: new Set(),  // tracks setTimeout IDs so we can clear on reset
    // Game-feel state
    shake: { x: 0, y: 0, intensity: 0 },
    timeScale: 1,         // 1.0 normal, 0.3 slow-mo on boss kill
    timeScaleEnd: 0,
    combo: 0,             // kills in last comboWindow ms
    comboTimer: 0,
    comboWindow: 2500,
    killstreak: 0,
    killstreakTimer: 0,
    lastKillTime: 0,
    multiplier: 1,
    // Helpers
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
        const sp = 1 + Math.random() * 3.5;
        this.particles.push(new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color, 2 + Math.random() * 3, 400 + Math.random() * 300));
      }
    },
    spawnSparks(x, y, color, count, angleBase = 0, spread = Math.PI * 2) {
      for (let i = 0; i < count; i++) {
        const ang = angleBase + (Math.random() - 0.5) * spread;
        const sp = 2 + Math.random() * 4;
        this.particles.push(new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color, 1 + Math.random() * 2, 200 + Math.random() * 200));
      }
    },
    spawnFloater(x, y, text, color = '#fff', size = 14, vy = -1.2) {
      this.floaters.push({ x, y, text, color, size, vy, life: 900, maxLife: 900 });
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
      this.lastKillTime = now;
      // Multiplier scales with combo
      this.multiplier = 1 + Math.min(4, Math.floor(this.combo / 5));
      const scoreGain = Math.round(enemy.score * this.multiplier);
      this.score += scoreGain;
      // Floating score text
      const colors = ['#ffffff','#ffcc00','#ff8800','#ff4400','#ff00ff'];
      this.spawnFloater(enemy.x, enemy.y - 14, `+${scoreGain}`, colors[Math.min(4, this.multiplier - 1)], 12 + this.multiplier * 2);
      // Killstreak announcements
      const announcements = {
        5:  'NICE!',
        10: 'COMBO!',
        15: 'STREAK!',
        20: 'RAMPAGE!',
        30: 'UNSTOPPABLE!',
        50: 'GODLIKE!',
      };
      if (announcements[this.killstreak]) {
        this.spawnFloater(WORLD_W / 2, WORLD_H / 2 - 60, announcements[this.killstreak], '#ff00ff', 28, -0.6);
        Audio.sfx.combo();
      }
    },
    breakCombo() { this.combo = 0; this.multiplier = 1; this.killstreak = 0; },
    schedule(fn, ms) {
      const id = setTimeout(() => { this.pendingTimeouts.delete(id); fn(); }, ms);
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
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
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
    charCtx.fillStyle = '#0a0a0a';
    charCtx.fillRect(0, 0, 120, 160);
    // Glowy backdrop
    const grad = charCtx.createRadialGradient(60, 90, 5, 60, 90, 80);
    grad.addColorStop(0, 'rgba(0,255,102,0.18)');
    grad.addColorStop(1, 'rgba(0,255,102,0)');
    charCtx.fillStyle = grad;
    charCtx.fillRect(0, 0, 120, 160);
    // Grid
    charCtx.fillStyle = '#1a1a1a';
    for (let i = 0; i < 120; i += 8) charCtx.fillRect(i, 0, 1, 160);
    for (let j = 0; j < 160; j += 8) charCtx.fillRect(0, j, 120, 1);
    Sprites.drawPlayer(charCtx, 60, 90, customization, previewDir, previewFrame);
    previewFrame = (previewFrame + 1) % 4;
    previewDirTimer++;
    if (previewDirTimer > 8) { previewDirTimer = 0; previewDir = (previewDir + 1) % 4; }
  }
  let previewInterval = setInterval(drawCharPreview, 200);

  // ============ FIRST-INTERACTION AUDIO UNLOCK ============
  // Any tap/click/keypress on the page unlocks audio AND starts menu music if appropriate.
  function firstInteractionUnlock() {
    Audio.unlock();
    if (game.state === 'menu') Audio.playMusic('menu');
  }
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(evt => {
    window.addEventListener(evt, firstInteractionUnlock, { once: false, passive: true });
  });

  // ============ CUSTOMIZATION UI ============
  function initSwatches() {
    const fitSw    = document.querySelectorAll('#fit-swatches .swatch');
    const accSw    = document.querySelectorAll('#accent-swatches .swatch');
    const hatBtns  = document.querySelectorAll('#hat-swatches .hat-btn');
    const chainBtns = document.querySelectorAll('#chain-swatches .hat-btn');

    function wire(group, attr, key) {
      group.forEach(b => {
        if (b.dataset[attr] === customization[key]) b.classList.add('selected');
        b.addEventListener('click', () => {
          Audio.unlock();
          customization[key] = b.dataset[attr];
          group.forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          Audio.sfx.pickup();
        });
      });
    }
    wire(fitSw, 'fit', 'fit');
    wire(accSw, 'accent', 'accent');
    wire(hatBtns, 'hat', 'hat');
    wire(chainBtns, 'chain', 'chain');
  }
  initSwatches();

  // ============ MUTE BUTTON ON START SCREEN ============
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
      // Sync the in-game toggles
      document.getElementById('music-toggle').checked = !muted;
      document.getElementById('sfx-toggle').checked = !muted;
    });
  }

  // ============ SCREEN MANAGEMENT ============
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  // Try to play menu music on load (will be queued until unlock)
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
    Input.init(canvas);              // safe to call again — guarded against double-attach
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
    game.particles = [];
    game.floaters = [];
    game.wave = 0;
    game.score = 0;
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
      game.schedule(() => spawnBoss(cfg.boss), 1500);
      game.spawnQueue = cfg.minions;
      game.spawnTimer = 800;
    } else {
      Audio.playMusic('gameplay');
      game.spawnQueue = cfg.enemyCount;
      game.spawnTimer = cfg.spawnInterval;
    }

    if (!game.crabGunSpawned && n >= 6) {
      game.powerUps.push(new PowerUp(WORLD_W / 2, 100, 'crab-gun'));
      game.crabGunSpawned = true;
    }

    Audio.sfx.levelUp();
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

    // Pick enemy type from wave-config table
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
    Audio.sfx.boss();
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
      const nextWave = game.wave + 1;
      if (nextWave > 15 && game.wave === 15) {
        game.onVictory();
      } else {
        game.schedule(() => startWave(nextWave), 2000);
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
    for (const b of game.bullets) {
      b.update(dt, game);
      if (b.dead) continue;

      if (b.source === 'player') {
        for (const e of game.enemies) {
          if (b.hitSet && b.hitSet.has(e)) continue;
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < e.radius + 4) {
            // Crit chance — 15%, 1.6x damage
            const crit = Math.random() < 0.15;
            const dmg = b.damage * (crit ? 1.6 : 1);
            e.damage(dmg, game, crit, b);
            if (b.splash > 0) {
              game.spawnExplosion(b.x, b.y, '#ff8800', 14);
              Audio.sfx.explode();
              game.addScreenShake(6);
              for (const e2 of game.enemies) {
                const dd = Math.hypot(e2.x - b.x, e2.y - b.y);
                if (dd < b.splash && e2 !== e) e2.damage(b.damage * 0.6, game, false);
              }
            }
            // Hit sparks
            const ang = Math.atan2(b.vy, b.vx);
            game.spawnSparks(b.x, b.y, crit ? '#ffff00' : '#ffaaaa', crit ? 6 : 3, ang + Math.PI, Math.PI * 0.6);
            if (!b.pierce) { b.dead = true; break; }
            else { b.hitSet.add(e); }
          }
        }
      } else {
        const dp = Math.hypot(game.player.x - b.x, game.player.y - b.y);
        if (dp < game.player.radius + 4) {
          game.player.damage(b.damage, game);
          if (b.splash > 0) { game.spawnExplosion(b.x, b.y, '#ff8800', 12); Audio.sfx.explode(); game.addScreenShake(8); }
          else game.addScreenShake(3);
          b.dead = true; continue;
        }
        const dt2 = Math.hypot(game.truck.x - b.x, game.truck.y - b.y);
        if (dt2 < game.truck.radius + 8) {
          game.truck.damage(b.damage);
          game.spawnSparks(b.x, b.y, '#ffaa00', 3);
          if (b.splash > 0) { game.spawnExplosion(b.x, b.y, '#ff8800', 12); Audio.sfx.explode(); game.addScreenShake(6); }
          else game.addScreenShake(2);
          b.dead = true; continue;
        }
      }
    }
    game.bullets = game.bullets.filter(b => !b.dead);
  }

  // ============ MAIN LOOP ============
  let lastTime = performance.now();
  function loop(now) {
    let dt = Math.min(40, now - lastTime);
    lastTime = now;

    // Apply time scale (slow-mo on boss kill)
    if (game.timeScale < 1 && now > game.timeScaleEnd) {
      // Ease back to normal
      game.timeScale = Math.min(1, game.timeScale + 0.05);
    }
    const scaledDt = dt * game.timeScale;

    if (game.state === 'playing') {
      update(scaledDt);
    }
    render();

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

    // Update entities
    game.player.update(dt, game);
    for (const e of game.enemies) e.update(dt, game);
    processBullets(dt);
    for (const p of game.powerUps) p.update(dt, game);
    for (const p of game.particles) p.update(dt);
    for (const f of game.floaters) {
      f.y += f.vy;
      f.vy *= 0.96;
      f.life -= dt;
    }
    // Ambient dust
    spawnDust();
    for (const d of game.dust) { d.x += d.vx; d.y += d.vy; d.life -= dt; }

    // Cleanup
    game.enemies   = game.enemies.filter(e => !e.dead);
    game.powerUps  = game.powerUps.filter(p => !p.dead);
    game.particles = game.particles.filter(p => !p.dead);
    game.floaters  = game.floaters.filter(f => f.life > 0);
    game.dust      = game.dust.filter(d => d.life > 0 && d.x > -5 && d.x < WORLD_W + 5 && d.y > -5 && d.y < WORLD_H + 5);

    if (game.truck.hp <= 0) game.onTruckDeath();

    updateWaves(dt);
    updateHUD();
  }

  function spawnDust() {
    if (game.dust.length > 40) return;
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

    // Background — gritty asphalt with subtle vignette
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Static asphalt dots
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
    // Curb edges
    ctx.fillStyle = '#2a1810';
    ctx.fillRect(0, 0, WORLD_W, 4);
    ctx.fillRect(0, WORLD_H - 4, WORLD_W, 4);

    // Ambient dust
    for (const d of game.dust) {
      ctx.fillStyle = `rgba(180,150,100,${d.alpha * (d.life / 8000)})`;
      ctx.fillRect(d.x, d.y, d.size, d.size);
    }

    // Sort entities by Y for depth
    const drawables = [game.truck, ...game.enemies, ...game.powerUps, game.player].filter(d => d != null);
    drawables.sort((a, b) => a.y - b.y);
    drawables.forEach(d => d.draw(ctx));

    for (const b of game.bullets) b.draw(ctx);
    for (const p of game.particles) p.draw(ctx);

    // Floating damage / score text
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
    const boss = game.enemies.find(e => e.isBoss);
    if (boss) {
      const bw = 480; const bh = 14;
      const bx = (WORLD_W - bw) / 2; const by = 32;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      // Health gradient
      const pct = boss.hp / boss.maxHp;
      const grad = ctx.createLinearGradient(bx, by, bx + bw * pct, by);
      grad.addColorStop(0, '#ff0044');
      grad.addColorStop(1, '#ff6600');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw * pct, bh);
      // Pulse on low hp
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

    // Low-hp red vignette (after the shake transform so it stays still)
    if (game.player.hp / game.player.maxHp < 0.3) {
      const pulse = 0.3 + Math.sin(performance.now() / 200) * 0.15;
      const grad = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_W / 3, WORLD_W / 2, WORLD_H / 2, WORLD_W / 1.3);
      grad.addColorStop(0, 'rgba(204,0,34,0)');
      grad.addColorStop(1, `rgba(204,0,34,${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // Combo display top-center
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
      // Combo decay bar
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

  function updateHUD() {
    if (!game.player) return;
    hpFill.style.width = (game.player.hp / game.player.maxHp * 100) + '%';
    truckFill.style.width = (game.truck.hp / game.truck.maxHp * 100) + '%';
    waveEl.textContent = `WAVE ${game.wave}`;
    scoreEl.textContent = `SCORE ${game.score}`;
    const w = Weapons.get(game.player.weaponIdx);
    const wState = game.player.weapons[game.player.weaponIdx];
    if (w.magazine === Infinity) ammoEl.textContent = `${w.name}: ∞`;
    else if (wState.reloading) ammoEl.textContent = `${w.name}: RELOAD`;
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
      Audio.sfx.reload();
    });
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!game.player) return;
      if (i === 4 && !game.player.crabUnlocked) return;
      game.player.weaponIdx = i;
      updateWeaponBar();
      Audio.sfx.reload();
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
    game.clearAllTimeouts();
    Input.resetTransient();
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
    document.getElementById('gameover-title').textContent = victory ? 'YOU SAVED 2X' : 'GAME OVER';
    document.getElementById('gameover-stats').innerHTML = `WAVE ${game.wave}<br>SCORE ${game.score}<br>BEST COMBO ${game.combo}x`;
    gameOverOverlay.classList.remove('hidden');
    Audio.stopMusic();
    if (victory) Audio.sfx.victory(); else Audio.sfx.gameOver();
  }
  document.getElementById('retry-btn').addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    resetAndStart();
  });
  document.getElementById('menu-btn').addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    game.state = 'menu';
    game.clearAllTimeouts();
    showScreen('start-screen');
    Audio.playMusic('menu');
  });

  // Prevent iOS bounce / pinch zoom EXCEPT on text-content scroll areas
  document.body.addEventListener('touchmove', e => {
    if (e.target.closest('.howto-content')) return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
})();
