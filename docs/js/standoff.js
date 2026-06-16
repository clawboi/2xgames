// STANDOFF — PvP arena mini-game on FAMEUP.io
// Top-down shooter with bots, 6 maps, FFA/team modes, configurable score limit

(function () {
  'use strict';

  // ============ STATE ============
  const settings = {
    map: 'streets',
    primary: 0, // weapon idx (matches WEAPONS in weapons.js)
    secondary: 1,
    bots: 3,
    botDifficulty: 'normal',
    mode: 'ffa',
    scoreToWin: 15,
  };

  let canvas, ctx;
  let raf = 0;
  let lastT = 0;
  let running = false;
  let paused = false;

  // Game world
  const W = 800, H = 600;
  let entities = [];
  let bullets = [];
  let particles = [];
  let obstacles = [];
  let player = null;
  let scores = []; // [{ name, score, color, team, dead, respawnAt }]
  let mySlot = 0;
  let camera = { x: 0, y: 0 };
  let killFeed = []; // [{ killer, victim, kColor, vColor, expires }]

  function addKillFeed(killerName, victimName, kColor, vColor) {
    killFeed.unshift({
      killer: killerName,
      victim: victimName,
      kColor, vColor,
      expires: performance.now() + 4000,
    });
    if (killFeed.length > 4) killFeed.length = 4;
  }

  // Color palette per team / per player
  const COLORS = ['#ff0033', '#00aaff', '#ffcc00', '#00ff66', '#cc66ff', '#ff6600', '#33ff99', '#ffffff'];

  // ============ MAP DEFINITIONS ============
  const MAPS = {
    streets: { name: 'STREETS OF LA', floor: '#222', accent: '#444', danger: '#660000',
      buildMap: () => generateUrbanMap() },
    egypt:   { name: 'EGYPT PYRAMIDS', floor: '#996633', accent: '#cc9966', danger: '#cc3300',
      buildMap: () => generatePyramidMap() },
    africa:  { name: 'AFRICA JUNGLE', floor: '#225522', accent: '#114411', danger: '#cc3300',
      buildMap: () => generateJungleMap() },
    korea:   { name: 'SOUTH KOREA', floor: '#330033', accent: '#660066', danger: '#ff66aa',
      buildMap: () => generateNeonMap() },
    atlantis:{ name: 'ATLANTIS', floor: '#003355', accent: '#005588', danger: '#00ddff',
      buildMap: () => generateAtlantisMap() },
    heaven:  { name: 'HEAVEN', floor: '#eeeeee', accent: '#cccccc', danger: '#999',
      buildMap: () => generateHeavenMap() },
  };

  function rect(x, y, w, h, color) { return { x, y, w, h, color: color || '#666' }; }

  function generateUrbanMap() {
    // Streets of LA — buildings as rectangles forming a city block
    return [
      rect(120, 80, 100, 80, '#333'),
      rect(580, 80, 100, 80, '#3a2a2a'),
      rect(120, 440, 100, 80, '#333'),
      rect(580, 440, 100, 80, '#3a2a2a'),
      rect(340, 240, 120, 120, '#552222'),
      rect(80, 280, 30, 60, '#444'),
      rect(690, 280, 30, 60, '#444'),
    ];
  }
  function generatePyramidMap() {
    // Egypt — triangular pyramid silhouettes + small ruins
    return [
      rect(150, 100, 80, 80, '#cc9966'),
      rect(570, 100, 80, 80, '#cc9966'),
      rect(360, 100, 80, 80, '#aa7744'),
      rect(150, 420, 80, 80, '#cc9966'),
      rect(570, 420, 80, 80, '#cc9966'),
      rect(360, 420, 80, 80, '#aa7744'),
      rect(80, 260, 60, 80, '#996633'),
      rect(660, 260, 60, 80, '#996633'),
    ];
  }
  function generateJungleMap() {
    // Africa — tree trunks scattered
    return [
      rect(150, 130, 40, 60, '#3a2a1a'),
      rect(250, 200, 40, 60, '#3a2a1a'),
      rect(400, 100, 50, 70, '#2a1a0a'),
      rect(550, 180, 40, 60, '#3a2a1a'),
      rect(650, 300, 40, 60, '#3a2a1a'),
      rect(180, 380, 50, 70, '#2a1a0a'),
      rect(330, 350, 40, 60, '#3a2a1a'),
      rect(490, 420, 50, 70, '#2a1a0a'),
      rect(120, 260, 30, 50, '#3a2a1a'),
      rect(620, 130, 40, 60, '#3a2a1a'),
    ];
  }
  function generateNeonMap() {
    // South Korea — neon-walled boxes
    return [
      rect(140, 120, 100, 40, '#ff66aa'),
      rect(560, 120, 100, 40, '#ff66aa'),
      rect(140, 440, 100, 40, '#ff66aa'),
      rect(560, 440, 100, 40, '#ff66aa'),
      rect(360, 280, 120, 40, '#660066'),
      rect(80, 280, 40, 80, '#aa3399'),
      rect(680, 280, 40, 80, '#aa3399'),
    ];
  }
  function generateAtlantisMap() {
    // Atlantis — coral pillars
    return [
      rect(160, 120, 60, 100, '#0066aa'),
      rect(580, 120, 60, 100, '#0066aa'),
      rect(160, 380, 60, 100, '#0066aa'),
      rect(580, 380, 60, 100, '#0066aa'),
      rect(360, 240, 80, 120, '#0099cc'),
      rect(80, 280, 30, 60, '#005577'),
      rect(690, 280, 30, 60, '#005577'),
    ];
  }
  function generateHeavenMap() {
    // Heaven — pillar clouds
    return [
      rect(150, 120, 80, 80, '#dddddd'),
      rect(570, 120, 80, 80, '#dddddd'),
      rect(150, 400, 80, 80, '#dddddd'),
      rect(570, 400, 80, 80, '#dddddd'),
      rect(360, 240, 80, 120, '#cccccc'),
    ];
  }

  // ============ ENTITIES ============
  // Bot name pool — varied gamer-tag style names
  const BOT_NAMES = [
    'GHOST', 'VENOM', 'BLAZE', 'STORM', 'NOVA', 'RIOT', 'FROST', 'PULSE',
    'WRAITH', 'HAVOC', 'RAVEN', 'PHOENIX', 'CRASH', 'VIBE', 'NEON', 'ZERO',
  ];
  // Generate a stable random customization for a bot (different look per bot)
  function genBotLook(slot) {
    const skin = ['light', 'tan', 'medium', 'brown', 'dark'][slot % 5];
    const hats = ['none', 'cap', 'hood', 'durag', 'beanie', 'mohawk', 'headphones'];
    const chains = ['none', 'gold', 'cuban', 'platinum', 'ice'];
    const fits = ['#cc0022', '#0066cc', '#cc6600', '#009933', '#9933cc', '#cccc00', '#000000', '#ff6699'];
    return {
      fit: fits[slot % fits.length],
      accent: fits[(slot + 3) % fits.length],
      hat: hats[(slot * 3) % hats.length],
      chain: chains[(slot * 2) % chains.length],
      shades: slot % 2 === 0,
      pattern: 'solid',
      shirtless: slot % 4 === 1,
      tattoos: slot % 3 === 0,
      skinTone: skin,
      body: 'male',
    };
  }

  class Fighter {
    constructor(x, y, slot, isBot, team) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.facing = 0;
      this.hp = 100; this.maxHp = 100;
      this.radius = 12;
      this.slot = slot;
      this.color = COLORS[slot % COLORS.length];
      this.team = team || 0;
      this.isBot = isBot;
      // Customization: bots get unique procedural look, player uses their saved customization
      if (isBot) {
        this.cust = genBotLook(slot);
        this.name = BOT_NAMES[(slot - 1) % BOT_NAMES.length] || ('BOT' + slot);
      } else {
        // Use the player's existing customization from FAMEUP/Crabcage
        try {
          this.cust = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}').customization
            || { fit: '#cc0022', accent: '#00ff66', hat: 'none', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
        } catch (e) {
          this.cust = { fit: '#cc0022', accent: '#00ff66', hat: 'none', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
        }
        const prof = window.FAMEUP ? FAMEUP.getProfile() : { username: null };
        this.name = (prof.username || 'YOU').toUpperCase().slice(0, 14);
      }
      this.dead = false;
      this.respawnAt = 0;
      this.fireCooldown = 0;
      this.weapon = isBot ? Math.floor(Math.random() * 4) : settings.primary;
      this.usingSecondary = false;
      this.aimTarget = null;
      this.botAimNoise = 0;
      this.botStateChange = 0;
      this.botMoveDir = { x: 0, y: 0 };
      // Get weapon stats
      this.applyWeaponStats(this.weapon);
      this.magazine = this.maxMagazine;
      this.reloading = false;
      this.reloadUntil = 0;
      this._frame = 0;
    }
    applyWeaponStats(weaponIdx) {
      const w = (window.WEAPONS && WEAPONS[weaponIdx]) || null;
      if (w) {
        this.dmgPerShot = w.damage || 14;
        this.fireRate = w.fireRate || 220;
        this.bulletSpeed = w.bulletSpeed || 9;
        this.bulletType = w.bulletType || 'glock';
        this.spread = w.spread || 0;
        this.shotsPerFire = w.shotsPerFire || 1;
        this.maxMagazine = w.magazine || 30;
        this.reloadTime = w.reloadTime || 1200;
        this.weaponName = w.name || 'WEAPON';
        this.weaponTier = w.tier || 'grey';
      } else {
        this.dmgPerShot = 14;
        this.fireRate = 220;
        this.bulletSpeed = 9;
        this.bulletType = 'glock';
        this.spread = 0;
        this.shotsPerFire = 1;
        this.maxMagazine = 30;
        this.reloadTime = 1200;
        this.weaponName = 'GLOCK';
        this.weaponTier = 'grey';
      }
    }
    update(dt) {
      this._frame++;
      if (this.dead) {
        if (performance.now() >= this.respawnAt) this.respawn();
        return;
      }
      // Reload check
      if (this.reloading && performance.now() >= this.reloadUntil) {
        this.reloading = false;
        this.magazine = this.maxMagazine;
      }
      // Movement
      if (!this.isBot) {
        const inp = getPlayerInput();
        this.vx = inp.x * 2.6;
        this.vy = inp.y * 2.6;
        if (inp.fire) this.tryFire();
        if (inp.reload && !this.reloading && this.magazine < this.maxMagazine) this.startReload();
      } else {
        this.updateBot(dt);
      }
      const newX = this.x + this.vx;
      const newY = this.y + this.vy;
      if (!collidesObstacle(newX, this.y, this.radius)) this.x = newX;
      if (!collidesObstacle(this.x, newY, this.radius)) this.y = newY;
      this.x = Math.max(this.radius, Math.min(W - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(H - this.radius, this.y));
      this.fireCooldown -= dt;
    }
    updateBot(dt) {
      let nearest = null, ndist = Infinity;
      for (const f of entities) {
        if (f === this || f.dead) continue;
        if (settings.mode !== 'ffa' && f.team === this.team) continue;
        const d = Math.hypot(f.x - this.x, f.y - this.y);
        if (d < ndist) { nearest = f; ndist = d; }
      }
      this.aimTarget = nearest;
      const diffNoise = settings.botDifficulty === 'easy' ? 0.4 : (settings.botDifficulty === 'hard' ? 0.05 : 0.18);
      this.botAimNoise = this.botAimNoise * 0.9 + (Math.random() - 0.5) * diffNoise * 0.4;
      if (nearest) {
        const ang = Math.atan2(nearest.y - this.y, nearest.x - this.x) + this.botAimNoise;
        this.facing = ang;
        const fireRange = settings.botDifficulty === 'easy' ? 260 : (settings.botDifficulty === 'hard' ? 420 : 340);
        if (ndist < fireRange) {
          if (this.magazine > 0) this.tryFire();
          else if (!this.reloading) this.startReload();
        }
      }
      this.botStateChange -= dt;
      if (this.botStateChange <= 0) {
        this.botStateChange = 600 + Math.random() * 1400;
        if (settings.botDifficulty === 'hard' && nearest) {
          const sd = Math.random() < 0.5 ? 1 : -1;
          const a = Math.atan2(nearest.y - this.y, nearest.x - this.x) + Math.PI / 2 * sd;
          if (ndist < 120) {
            this.botMoveDir = { x: -Math.cos(this.facing), y: -Math.sin(this.facing) };
          } else if (ndist > 380) {
            this.botMoveDir = { x: Math.cos(this.facing), y: Math.sin(this.facing) };
          } else {
            this.botMoveDir = { x: Math.cos(a), y: Math.sin(a) };
          }
        } else {
          const ang = Math.random() * Math.PI * 2;
          this.botMoveDir = { x: Math.cos(ang), y: Math.sin(ang) };
        }
      }
      const speedMult = settings.botDifficulty === 'easy' ? 1.5 : (settings.botDifficulty === 'hard' ? 2.6 : 2.0);
      this.vx = this.botMoveDir.x * speedMult;
      this.vy = this.botMoveDir.y * speedMult;
    }
    startReload() {
      this.reloading = true;
      this.reloadUntil = performance.now() + this.reloadTime;
      if (!this.isBot) { try { Audio.sfx.reload(); } catch (e) {} }
    }
    tryFire() {
      const now = performance.now();
      if (this.fireCooldown > 0 || this.reloading) return;
      if (this.magazine <= 0) {
        if (!this.reloading) this.startReload();
        return;
      }
      for (let i = 0; i < this.shotsPerFire; i++) {
        const a = this.facing + (Math.random() - 0.5) * this.spread;
        const sp = this.bulletSpeed;
        bullets.push({
          x: this.x + Math.cos(a) * (this.radius + 4),
          y: this.y + Math.sin(a) * (this.radius + 4),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          owner: this,
          ownerSlot: this.slot,
          damage: this.dmgPerShot,
          life: 1200,
          color: this.color,
          type: this.bulletType,
        });
      }
      this.magazine--;
      this.fireCooldown = this.fireRate;
      // Different SFX per weapon type
      try {
        if (this.bulletType === 'rpg' || this.bulletType === 'shotgun') Audio.sfx.shootBig();
        else if (this.bulletType === 'laser' || this.bulletType === 'tesla') Audio.sfx.laser();
        else Audio.sfx.shoot();
      } catch (e) {}
    }
    takeDamage(amt, attacker) {
      if (this.dead) return;
      this.hp -= amt;
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: this.x, y: this.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 300, color: '#ff4444', size: 2,
        });
      }
      if (this.hp <= 0) {
        this.dead = true;
        this.hp = 0;
        this.respawnAt = performance.now() + 2200;
        if (attacker && attacker.slot !== this.slot && scores[attacker.slot]) {
          scores[attacker.slot].score++;
          addKillFeed(attacker.name, this.name, attacker.color, this.color);
          checkWin();
        }
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          particles.push({
            x: this.x, y: this.y,
            vx: Math.cos(a) * 3,
            vy: Math.sin(a) * 3,
            life: 600, color: this.color, size: 3,
          });
        }
        try { Audio.sfx.explode(); } catch (e) {}
        try { if (!this.isBot) Audio.haptic.death(); } catch (e) {}
      } else {
        try { if (!this.isBot) Audio.haptic.hit(); } catch (e) {}
      }
    }
    respawn() {
      const sp = pickSpawnPoint();
      this.x = sp.x; this.y = sp.y;
      this.hp = this.maxHp;
      this.dead = false;
      this.vx = 0; this.vy = 0;
      this.magazine = this.maxMagazine;
      this.reloading = false;
    }
    draw(ctx) {
      if (this.dead) return;
      // Use pixel sprite (matches crabcage style)
      const dir = this.getFacingDir();
      try {
        Sprites.drawPlayer(ctx, this.x, this.y, this.cust, dir, this._frame);
      } catch (e) {
        // Fallback to colored circle if sprite fails
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      }
      // Team color outline ring above character
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 14, 10, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Aim line (subtle)
      ctx.strokeStyle = `${this.color}88`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(this.facing) * 10, this.y + Math.sin(this.facing) * 10);
      ctx.lineTo(this.x + Math.cos(this.facing) * 26, this.y + Math.sin(this.facing) * 26);
      ctx.stroke();
      // Name + HP bar
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#000'; ctx.fillRect(this.x - 30, this.y - 30, 60, 14);
      ctx.fillStyle = this.color;
      ctx.textAlign = 'center';
      ctx.fillText(this.name.slice(0, 10), this.x, this.y - 20);
      const barW = 28;
      ctx.fillStyle = '#000'; ctx.fillRect(this.x - barW/2 - 1, this.y - 14, barW + 2, 4);
      ctx.fillStyle = this.hp > 30 ? '#00ff66' : '#ff3333';
      ctx.fillRect(this.x - barW/2, this.y - 13, barW * (this.hp / this.maxHp), 2);
      // Reload indicator
      if (this.reloading) {
        const pct = 1 - (this.reloadUntil - performance.now()) / this.reloadTime;
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(this.x - barW/2, this.y - 9, barW * Math.max(0, pct), 2);
      }
    }
    getFacingDir() {
      // Convert angle to one of: 'up', 'down', 'left', 'right'
      const a = this.facing;
      const deg = (a * 180 / Math.PI + 360) % 360;
      if (deg >= 45 && deg < 135) return 'down';
      if (deg >= 135 && deg < 225) return 'left';
      if (deg >= 225 && deg < 315) return 'up';
      return 'right';
    }
  }

  // ============ COLLISION ============
  function collidesObstacle(x, y, r) {
    for (const o of obstacles) {
      if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) return true;
    }
    return false;
  }
  function pickSpawnPoint() {
    for (let i = 0; i < 30; i++) {
      const x = 40 + Math.random() * (W - 80);
      const y = 40 + Math.random() * (H - 80);
      if (!collidesObstacle(x, y, 18)) {
        // Also avoid spawning right on top of another player
        let tooClose = false;
        for (const f of entities) {
          if (!f.dead && Math.hypot(f.x - x, f.y - y) < 100) { tooClose = true; break; }
        }
        if (!tooClose) return { x, y };
      }
    }
    return { x: 100, y: 100 };
  }

  // ============ INPUT ============
  const keys = {};
  let mouseDown = false;
  let mouseX = 0, mouseY = 0;
  let touchMove = { active: false, x: 0, y: 0 };
  let touchFire = false;

  function attachInput() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  }
  function detachInput() {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    if (canvas) {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    }
  }
  function onKeyDown(e) { keys[e.key.toLowerCase()] = true; }
  function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }
  function onMouseDown(e) { mouseDown = true; updateMouse(e); }
  function onMouseUp() { mouseDown = false; }
  function onMouseMove(e) { updateMouse(e); }
  function updateMouse(e) {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (W / r.width);
    mouseY = (e.clientY - r.top) * (H / r.height);
  }
  // Mobile: split screen — left half = movement, right half = aim+fire
  let leftTouchId = null, rightTouchId = null;
  let leftStart = { x: 0, y: 0 };
  function onTouchStart(e) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const isLeft = t.clientX < window.innerWidth / 2;
      if (isLeft && leftTouchId === null) {
        leftTouchId = t.identifier;
        leftStart = { x: t.clientX, y: t.clientY };
        touchMove.active = true; touchMove.x = 0; touchMove.y = 0;
      } else if (!isLeft && rightTouchId === null) {
        rightTouchId = t.identifier;
        touchFire = true;
        const lx = (t.clientX - r.left) * (W / r.width);
        const ly = (t.clientY - r.top) * (H / r.height);
        mouseX = lx; mouseY = ly;
      }
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (t.identifier === leftTouchId) {
        const dx = t.clientX - leftStart.x;
        const dy = t.clientY - leftStart.y;
        const d = Math.hypot(dx, dy);
        const max = 40;
        if (d > max) {
          touchMove.x = dx / d;
          touchMove.y = dy / d;
        } else {
          touchMove.x = dx / max;
          touchMove.y = dy / max;
        }
      } else if (t.identifier === rightTouchId) {
        const lx = (t.clientX - r.left) * (W / r.width);
        const ly = (t.clientY - r.top) * (H / r.height);
        mouseX = lx; mouseY = ly;
      }
    }
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === leftTouchId) {
        leftTouchId = null;
        touchMove.active = false; touchMove.x = 0; touchMove.y = 0;
      } else if (t.identifier === rightTouchId) {
        rightTouchId = null;
        touchFire = false;
      }
    }
  }
  function getPlayerInput() {
    let x = 0, y = 0;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    if (touchMove.active) { x = touchMove.x; y = touchMove.y; }
    // Update aim
    if (player) {
      player.facing = Math.atan2(mouseY - player.y, mouseX - player.x);
    }
    return {
      x, y,
      fire: mouseDown || keys[' '] || touchFire,
      reload: keys['r'],
    };
  }

  // ============ GAME LOOP ============
  function update(dt) {
    if (paused) return;
    for (const e of entities) e.update(dt);
    // Bullets
    for (const b of bullets) {
      b.x += b.vx; b.y += b.vy;
      b.life -= dt;
      // Bounds + obstacle collision
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) b.life = 0;
      for (const o of obstacles) {
        if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) { b.life = 0; break; }
      }
      // Fighter hits
      for (const f of entities) {
        if (f === b.owner || f.dead) continue;
        // Teams in non-FFA don't damage each other
        if (settings.mode !== 'ffa' && b.owner && f.team === b.owner.team) continue;
        if (Math.hypot(b.x - f.x, b.y - f.y) < f.radius) {
          f.takeDamage(b.damage, b.owner);
          b.life = 0;
          break;
        }
      }
    }
    bullets = bullets.filter(b => b.life > 0);
    // Particles
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
  }

  function render() {
    const m = MAPS[settings.map] || MAPS.streets;
    ctx.fillStyle = m.floor; ctx.fillRect(0, 0, W, H);
    // Floor grid
    ctx.strokeStyle = m.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.18;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Obstacles
    for (const o of obstacles) {
      ctx.fillStyle = o.color;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    }
    // Bullets — render with type-aware color
    for (const b of bullets) {
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
      // Trail
      ctx.strokeStyle = b.color + '88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.5, b.y - b.vy * 0.5);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Entities sorted by Y
    const sorted = entities.slice().sort((a, b) => a.y - b.y);
    for (const e of sorted) e.draw(ctx);
    // Particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 600);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Kill feed (top-right, drawn onto canvas)
    if (killFeed.length > 0) {
      const now = performance.now();
      killFeed = killFeed.filter(k => k.expires > now);
      ctx.textAlign = 'right';
      ctx.font = 'bold 11px monospace';
      let y = 30;
      for (const k of killFeed) {
        const alpha = Math.min(1, (k.expires - now) / 1000);
        ctx.globalAlpha = alpha;
        // Background box
        const text = `${k.killer} → ${k.victim}`;
        const w = ctx.measureText(text).width + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(W - 14 - w, y - 12, w, 16);
        // Killer name
        ctx.fillStyle = k.kColor;
        ctx.fillText(k.killer, W - 14 - ctx.measureText(` → ${k.victim}`).width, y);
        // Arrow + victim
        ctx.fillStyle = '#fff';
        ctx.fillText(` → ${k.victim}`, W - 14, y);
        y += 20;
      }
      ctx.globalAlpha = 1;
    }

    // Player ammo HUD (bottom-left of canvas)
    if (player && !player.dead) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(10, H - 50, 160, 40);
      ctx.fillStyle = '#fff';
      ctx.fillText(player.weaponName, 18, H - 33);
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = player.reloading ? '#ffcc00' : (player.magazine === 0 ? '#ff3333' : '#fff');
      ctx.fillText(player.reloading ? 'RELOADING...' : `${player.magazine} / ${player.maxMagazine}`, 18, H - 16);
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(40, now - (lastT || now));
    lastT = now;
    update(dt);
    render();
    updateHUD();
    raf = requestAnimationFrame(loop);
  }

  function updateHUD() {
    const hudScore = document.getElementById('std-hud-score');
    const hudTarget = document.getElementById('std-hud-target');
    const hudLeaders = document.getElementById('std-hud-leaders');
    if (hudScore && player) hudScore.textContent = `${player.name}: ${scores[player.slot]?.score || 0}`;
    if (hudTarget) hudTarget.textContent = `FIRST TO ${settings.scoreToWin}`;
    if (hudLeaders) {
      const sorted = scores.slice().sort((a, b) => b.score - a.score).slice(0, 4);
      hudLeaders.innerHTML = sorted.map(s =>
        `<span style="color:${s.color};">${s.name}: ${s.score}</span>`
      ).join('  ');
    }
  }

  function checkWin() {
    for (const s of scores) {
      if (s.score >= settings.scoreToWin) {
        endMatch(s);
        return;
      }
    }
  }

  function endMatch(winner) {
    running = false;
    cancelAnimationFrame(raf);
    // Record stats — match counts on completion, win if player won, kills tracked
    try {
      if (window.FAMEUP && FAMEUP.recordStat) {
        FAMEUP.recordStat('standoffMatches', 1);
        if (winner.slot === mySlot) FAMEUP.recordStat('standoffWins', 1);
        if (scores[mySlot]) FAMEUP.recordStat('standoffKills', scores[mySlot].score);
        if (FAMEUP.refreshStatsDisplay) FAMEUP.refreshStatsDisplay();
      }
    } catch (e) {}
    const overlay = document.getElementById('std-result-overlay');
    const title = document.getElementById('std-result-title');
    const stats = document.getElementById('std-result-stats');
    if (title) {
      title.textContent = winner.slot === mySlot ? '🏆 VICTORY!' : '💀 GAME OVER';
      title.style.color = winner.slot === mySlot ? '#ffcc00' : '#ff3333';
    }
    if (stats) {
      const sortedScores = scores.slice().sort((a, b) => b.score - a.score);
      stats.innerHTML = sortedScores.map((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `  ${i + 1}.`;
        const isMe = s.slot === mySlot ? ' (YOU)' : '';
        return `<div style="color:${s.color};font-size:11px;letter-spacing:1px;padding:3px 0;">${medal} ${s.name}${isMe}: <b>${s.score}</b></div>`;
      }).join('');
    }
    if (overlay) overlay.classList.remove('hidden');
    try { Audio.stopMusic(); } catch (e) {}
  }

  // ============ START / SETUP ============
  function setupMatch() {
    const m = MAPS[settings.map] || MAPS.streets;
    obstacles = m.buildMap();
    entities = [];
    bullets = [];
    particles = [];
    scores = [];
    killFeed = [];
    mySlot = 0;
    // Player
    const ps = pickSpawnPoint();
    player = new Fighter(ps.x, ps.y, 0, false, 1);
    entities.push(player);
    scores.push({ name: player.name, score: 0, color: player.color, slot: 0, team: 1 });
    // Bots
    const botCount = settings.bots;
    for (let i = 0; i < botCount; i++) {
      const sp = pickSpawnPoint();
      const team = settings.mode === 'ffa' ? (i + 2) : (i < botCount / 2 ? 1 : 2);
      const bot = new Fighter(sp.x, sp.y, i + 1, true, team);
      entities.push(bot);
      scores.push({ name: bot.name, score: 0, color: bot.color, slot: i + 1, team });
    }
  }

  function startMatch() {
    FAMEUP.showOnly('standoff-game');
    canvas = document.getElementById('std-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    setupMatch();
    attachInput();
    const overlay = document.getElementById('std-result-overlay');
    if (overlay) overlay.classList.add('hidden');
    running = true;
    paused = false;
    lastT = 0;
    raf = requestAnimationFrame(loop);
    try { Audio.unlock(); } catch (e) {}
    try { Audio.playMusic('boss'); } catch (e) {} // borrow boss track for intensity
  }

  function stopMatch() {
    running = false;
    cancelAnimationFrame(raf);
    detachInput();
    try { Audio.stopMusic(); } catch (e) {}
  }

  // ============ LOBBY WIRING ============
  function openLobby() {
    // Wire up handlers (idempotent)
    if (openLobby._wired) return;
    openLobby._wired = true;

    // Map picker
    document.querySelectorAll('.std-map').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.std-map').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        settings.map = btn.getAttribute('data-map');
      });
    });
    // Primary / Secondary weapon
    const pri = document.getElementById('std-primary');
    const sec = document.getElementById('std-secondary');
    if (pri) pri.addEventListener('change', e => settings.primary = parseInt(e.target.value));
    if (sec) sec.addEventListener('change', e => settings.secondary = parseInt(e.target.value));
    // Bot slider
    const botSlider = document.getElementById('std-bots');
    const botCount = document.getElementById('std-bots-count');
    if (botSlider) botSlider.addEventListener('input', e => {
      settings.bots = parseInt(e.target.value);
      if (botCount) botCount.textContent = settings.bots;
    });
    // Bot difficulty pills
    document.querySelectorAll('.std-pill[data-diff]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.std-pill[data-diff]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        settings.botDifficulty = btn.getAttribute('data-diff');
      });
    });
    // Mode pills
    document.querySelectorAll('.std-pill[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.std-pill[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        settings.mode = btn.getAttribute('data-mode');
      });
    });
    // Score to win slider
    const scoreSlider = document.getElementById('std-score');
    const scoreVal = document.getElementById('std-score-val');
    if (scoreSlider) scoreSlider.addEventListener('input', e => {
      settings.scoreToWin = parseInt(e.target.value);
      if (scoreVal) scoreVal.textContent = settings.scoreToWin;
    });
    // Host / Join (placeholder for now — coming in later pass)
    const hostBtn = document.getElementById('std-host-btn');
    const joinBtn = document.getElementById('std-join-btn');
    const codeArea = document.getElementById('std-code-area');
    if (hostBtn) hostBtn.addEventListener('click', () => {
      if (codeArea) {
        codeArea.classList.remove('hidden');
        codeArea.innerHTML = '<p style="color:#ffcc00;font-size:9px;letter-spacing:2px;margin-top:8px;">ONLINE COOP COMING NEXT PASS — PLAY SOLO VS BOTS FOR NOW</p>';
      }
    });
    if (joinBtn) joinBtn.addEventListener('click', () => {
      if (codeArea) {
        codeArea.classList.remove('hidden');
        codeArea.innerHTML = '<p style="color:#ffcc00;font-size:9px;letter-spacing:2px;margin-top:8px;">ONLINE COOP COMING NEXT PASS — PLAY SOLO VS BOTS FOR NOW</p>';
      }
    });
    // START MATCH
    const startBtn = document.getElementById('std-start-btn');
    if (startBtn) startBtn.addEventListener('click', startMatch);

    // QUIT / Result actions
    const quitBtn = document.getElementById('std-quit-btn');
    if (quitBtn) quitBtn.addEventListener('click', () => {
      stopMatch();
      FAMEUP.showOnly('standoff-lobby');
    });
    const pauseBtn = document.getElementById('std-pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => {
      paused = !paused;
      const ov = document.getElementById('std-pause-overlay');
      if (ov) {
        if (paused) ov.classList.remove('hidden');
        else ov.classList.add('hidden');
      }
    });
    const pauseResume = document.getElementById('std-pause-resume');
    if (pauseResume) pauseResume.addEventListener('click', () => {
      paused = false;
      const ov = document.getElementById('std-pause-overlay');
      if (ov) ov.classList.add('hidden');
    });
    const pauseQuit = document.getElementById('std-pause-quit');
    if (pauseQuit) pauseQuit.addEventListener('click', () => {
      paused = false;
      const ov = document.getElementById('std-pause-overlay');
      if (ov) ov.classList.add('hidden');
      stopMatch();
      FAMEUP.showOnly('standoff-lobby');
    });
    // Mobile reload button
    const reloadBtn = document.getElementById('std-reload-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (player && !player.dead && !player.reloading && player.magazine < player.maxMagazine) {
          player.startReload();
        }
      }, { passive: false });
      reloadBtn.addEventListener('click', () => {
        if (player && !player.dead && !player.reloading && player.magazine < player.maxMagazine) {
          player.startReload();
        }
      });
    }
    const resultBack = document.getElementById('std-result-back');
    if (resultBack) resultBack.addEventListener('click', () => {
      const overlay = document.getElementById('std-result-overlay');
      if (overlay) overlay.classList.add('hidden');
      stopMatch();
      FAMEUP.showOnly('standoff-lobby');
    });
    const resultHome = document.getElementById('std-result-home');
    if (resultHome) resultHome.addEventListener('click', () => {
      const overlay = document.getElementById('std-result-overlay');
      if (overlay) overlay.classList.add('hidden');
      stopMatch();
      FAMEUP.showOnly('fameup-home');
    });
    const resultRematch = document.getElementById('std-result-rematch');
    if (resultRematch) resultRematch.addEventListener('click', () => {
      const overlay = document.getElementById('std-result-overlay');
      if (overlay) overlay.classList.add('hidden');
      startMatch();
    });
  }

  window.Standoff = {
    openLobby,
    startMatch,
    stopMatch,
  };
})();
