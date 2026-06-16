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
    power: 'regen',
  };
  const POWER_ICONS = {
    regen: '❤', doubledamage: '💥', ghost: '👻',
    freeze: '❄', portal: '🌀', overclock: '⚡',
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

  let pickups = []; // health/dmg/speed pickups on map
  let pickupSpawnTimer = 0;
  function addMultikillFlash(label, color) {
    const div = document.createElement('div');
    div.className = 'std-pickup-flash';
    div.style.background = color;
    div.textContent = label;
    document.body.appendChild(div);
    setTimeout(() => { try { div.remove(); } catch (e) {} }, 1600);
  }
  function spawnPickup() {
    const types = ['health', 'damage', 'speed'];
    const type = types[Math.floor(Math.random() * types.length)];
    const sp = pickSpawnPoint();
    pickups.push({
      x: sp.x, y: sp.y, type,
      life: 18000, // 18s before despawn
      frame: 0,
    });
  }
  function applyPickup(fighter, type) {
    if (type === 'health') {
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + 60);
    } else if (type === 'damage') {
      fighter.damageBoostUntil = performance.now() + 10000;
    } else if (type === 'speed') {
      fighter.speedBoostUntil = performance.now() + 8000;
    }
    if (!fighter.isBot) {
      try { Audio.sfx.pickup && Audio.sfx.pickup(); } catch (e) {}
      addMultikillFlash(type === 'health' ? '+60 HP' : type === 'damage' ? '2X DAMAGE!' : 'SPEED BOOST!',
        type === 'health' ? '#00ff66' : type === 'damage' ? '#ff6600' : '#ffcc00');
    }
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

  function rect(x, y, w, h, color, opts) {
    opts = opts || {};
    const baseHp = (w * h) / 60; // larger = more HP
    return {
      x, y, w, h, color: color || '#666',
      hp: opts.hp || baseHp,
      maxHp: opts.hp || baseHp,
      height: opts.height || (8 + Math.random() * 8), // 3D depth illusion
      destructible: opts.destructible !== false,
      hitFlash: 0,
    };
  }

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
      // Dash mechanic
      this.dashCooldownEnd = 0;
      this.dashActiveUntil = 0;
      this.dashDir = { x: 0, y: 0 };
      this.invulnUntil = 0;
      // Power-up effects
      this.damageBoostUntil = 0;
      this.speedBoostUntil = 0;
      // Multikill tracking
      this.lastKillAt = 0;
      this.killStreak = 0;
      // POWER (chosen in lobby)
      this.power = isBot ? ['regen','doubledamage','ghost','freeze','portal','overclock'][Math.floor(Math.random()*6)] : settings.power;
      this.powerCooldownEnd = 0;
      this.powerActiveUntil = 0;
      this.regenTick = 0;
      this.portalX = null; this.portalY = null;
      this.invisibleUntil = 0;
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
      // POWER passives
      const now2 = performance.now();
      if (this.power === 'regen') {
        this.regenTick += dt;
        if (this.regenTick > 500 && this.hp < this.maxHp) {
          this.hp = Math.min(this.maxHp, this.hp + 1);
          this.regenTick = 0;
        }
      }
      // Dash movement override
      const now = performance.now();
      const dashing = now < this.dashActiveUntil;
      const speedBoost = now < this.speedBoostUntil ? 1.5 : 1;
      // Movement
      if (!this.isBot) {
        const inp = getPlayerInput();
        if (dashing) {
          this.vx = this.dashDir.x * 8.5;
          this.vy = this.dashDir.y * 8.5;
        } else {
          this.vx = inp.x * 2.6 * speedBoost;
          this.vy = inp.y * 2.6 * speedBoost;
        }
        if (inp.fire) this.tryFire();
        if (inp.reload && !this.reloading && this.magazine < this.maxMagazine) this.startReload();
        if (inp.dash) this.tryDash();
        if (inp.power) this.tryPower();
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
    tryDash() {
      const now = performance.now();
      if (now < this.dashCooldownEnd) return;
      const moveLen = Math.hypot(this.vx, this.vy);
      // Default dash direction = movement, fallback to facing
      let dx = this.vx, dy = this.vy;
      if (moveLen < 0.2) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); }
      const d = Math.hypot(dx, dy) || 1;
      this.dashDir = { x: dx / d, y: dy / d };
      this.dashActiveUntil = now + 220;
      this.dashCooldownEnd = now + 3500;
      this.invulnUntil = now + 250;
      try { Audio.sfx.dash && Audio.sfx.dash(); } catch (e) {}
      try { if (!this.isBot) Audio.haptic.medium(); } catch (e) {}
      // Trail particles
      for (let i = 0; i < 8; i++) {
        particles.push({
          x: this.x, y: this.y,
          vx: -this.dashDir.x * 2 + (Math.random() - 0.5) * 1,
          vy: -this.dashDir.y * 2 + (Math.random() - 0.5) * 1,
          life: 400, color: this.color, size: 3,
        });
      }
    }
    tryPower() {
      const now = performance.now();
      if (now < this.powerCooldownEnd) return;
      const p = this.power;
      if (p === 'ghost') {
        this.invisibleUntil = now + 3000;
        this.powerCooldownEnd = now + 10000;
        if (!this.isBot) addMultikillFlash('👻 GHOST MODE', '#aaaaff');
      } else if (p === 'portal') {
        if (this.portalX === null) {
          this.portalX = this.x; this.portalY = this.y;
          this.powerCooldownEnd = now + 500;
          if (!this.isBot) addMultikillFlash('🌀 PORTAL DROPPED', '#aa00ff');
        } else {
          this.x = this.portalX; this.y = this.portalY;
          this.portalX = null; this.portalY = null;
          this.invulnUntil = now + 400;
          this.powerCooldownEnd = now + 5000;
          if (!this.isBot) addMultikillFlash('🌀 TELEPORT', '#aa00ff');
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            particles.push({ x: this.x, y: this.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 500, color: '#aa00ff', size: 3 });
          }
        }
      } else if (p === 'overclock' || p === 'freeze') {
        this.powerActiveUntil = now + (p === 'freeze' ? 4000 : 5000);
        this.powerCooldownEnd = now + (p === 'freeze' ? 12000 : 14000);
        if (!this.isBot) addMultikillFlash(p === 'freeze' ? '❄ ICE SHOTS' : '⚡ OVERCLOCK', p === 'freeze' ? '#aaeeff' : '#ffff00');
      } else {
        // doubledamage / regen — burst damage boost
        this.damageBoostUntil = now + 5000;
        this.powerCooldownEnd = now + 15000;
        if (!this.isBot) addMultikillFlash('🔥 DAMAGE BURST', '#ff3300');
      }
      try { Audio.sfx.boss && Audio.sfx.boss(); } catch (e) {}
    }
    updateBot(dt) {
      let nearest = null, ndist = Infinity;
      const now = performance.now();
      for (const f of entities) {
        if (f === this || f.dead) continue;
        if (settings.mode !== 'ffa' && f.team === this.team) continue;
        // Can't see invisible targets
        if (f.invisibleUntil && now < f.invisibleUntil) continue;
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
      // Bot uses power when low HP or sees an enemy
      if (now > this.powerCooldownEnd && (this.hp < 50 || (nearest && ndist < 200))) {
        if (Math.random() < 0.005) this.tryPower();
      }
      // Bot dash to evade
      if (now > this.dashCooldownEnd && this.hp < 40 && Math.random() < 0.01) {
        this.tryDash();
      }
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
      // Overclock active = 50% faster fire
      const overclock = now < this.powerActiveUntil && this.power === 'overclock';
      const fireRateMod = overclock ? 0.5 : 1;
      // Doubledamage passive = 1.5x base damage
      const passiveDmg = this.power === 'doubledamage' ? 1.5 : 1;
      // Ice power: freeze on hit while active
      const iceActive = now < this.powerActiveUntil && this.power === 'freeze';
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
          damage: this.dmgPerShot * passiveDmg,
          life: 1200,
          color: iceActive ? '#aaeeff' : this.color,
          type: iceActive ? 'freeze' : this.bulletType,
          freezing: iceActive,
        });
      }
      this.magazine--;
      this.fireCooldown = this.fireRate * fireRateMod;
      try {
        if (this.bulletType === 'rpg' || this.bulletType === 'shotgun') Audio.sfx.shootBig();
        else if (this.bulletType === 'laser' || this.bulletType === 'tesla') Audio.sfx.laser();
        else Audio.sfx.shoot();
      } catch (e) {}
    }
    takeDamage(amt, attacker) {
      if (this.dead) return;
      // Invuln during dash i-frames
      if (performance.now() < this.invulnUntil) return;
      // Apply attacker's damage boost
      if (attacker && performance.now() < attacker.damageBoostUntil) amt *= 2;
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
          // Multikill check
          const now = performance.now();
          if (now - attacker.lastKillAt < 4000) {
            attacker.killStreak++;
            const labels = ['', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'RAMPAGE!'];
            const bonus = [0, 50, 150, 300, 500];
            const i = Math.min(4, attacker.killStreak);
            if (i > 0 && labels[i]) {
              addMultikillFlash(labels[i], attacker.color);
              scores[attacker.slot].score += Math.floor(bonus[i] / 50);
            }
          } else {
            attacker.killStreak = 1;
          }
          attacker.lastKillAt = now;
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
      const now = performance.now();
      const invisible = now < this.invisibleUntil;
      // Portal indicator
      if (this.portalX !== null) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(now / 200) * 0.3;
        ctx.strokeStyle = '#aa00ff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.portalX, this.portalY, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(170,0,255,0.3)';
        ctx.beginPath(); ctx.arc(this.portalX, this.portalY, 14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // Use pixel sprite
      ctx.save();
      if (invisible) ctx.globalAlpha = !this.isBot ? 0.35 : 0.05; // self-faded, others nearly gone
      const dir = this.getFacingDir();
      try {
        Sprites.drawPlayer(ctx, this.x, this.y, this.cust, dir, this._frame);
      } catch (e) {
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      // Power active glow
      if (now < this.powerActiveUntil) {
        const col = this.power === 'overclock' ? '#ffff00' : this.power === 'freeze' ? '#aaeeff' : '#ff3300';
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 5 + Math.sin(now / 100) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      // Team color outline ring above character
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 14, 10, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Aim line
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
      if (this.reloading) {
        const pct = 1 - (this.reloadUntil - now) / this.reloadTime;
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
  let touchDash = false;
  let touchPower = false;

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
      dash: keys['shift'] || touchDash,
      power: keys['q'] || touchPower,
    };
  }

  // ============ GAME LOOP ============
  function update(dt) {
    if (paused) return;
    for (const e of entities) e.update(dt);
    // Pickups
    pickupSpawnTimer -= dt;
    if (pickupSpawnTimer <= 0 && pickups.length < 3) {
      pickupSpawnTimer = 7000 + Math.random() * 5000;
      spawnPickup();
    }
    for (const pk of pickups) {
      pk.life -= dt;
      pk.frame++;
      for (const f of entities) {
        if (f.dead) continue;
        if (Math.hypot(f.x - pk.x, f.y - pk.y) < f.radius + 12) {
          applyPickup(f, pk.type);
          pk.life = 0;
          break;
        }
      }
    }
    pickups = pickups.filter(p => p.life > 0);
    // Bullets
    for (const b of bullets) {
      b.x += b.vx; b.y += b.vy;
      b.life -= dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) b.life = 0;
      for (const o of obstacles) {
        if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) {
          // Damage destructible obstacle
          if (o.destructible) {
            o.hp -= b.damage;
            o.hitFlash = 6;
            for (let i = 0; i < 4; i++) {
              particles.push({
                x: b.x, y: b.y,
                vx: -b.vx * 0.2 + (Math.random() - 0.5) * 3,
                vy: -b.vy * 0.2 + (Math.random() - 0.5) * 3,
                life: 350, color: o.color, size: 2,
              });
            }
          }
          b.life = 0;
          break;
        }
      }
      for (const f of entities) {
        if (f === b.owner || f.dead) continue;
        if (settings.mode !== 'ffa' && b.owner && f.team === b.owner.team) continue;
        if (Math.hypot(b.x - f.x, b.y - f.y) < f.radius) {
          f.takeDamage(b.damage, b.owner);
          // Ice freeze effect
          if (b.freezing) {
            f.vx = 0; f.vy = 0;
            f.frozenUntil = performance.now() + 800;
          }
          b.life = 0;
          break;
        }
      }
    }
    bullets = bullets.filter(b => b.life > 0);
    // Process destroyed obstacles
    for (const o of obstacles) {
      if (o.hitFlash > 0) o.hitFlash--;
      if (o.hp <= 0 && !o._destroyed) {
        o._destroyed = true;
        // Burst of debris
        for (let i = 0; i < 18; i++) {
          particles.push({
            x: o.x + Math.random() * o.w,
            y: o.y + Math.random() * o.h,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 800, color: o.color, size: 3 + Math.random() * 2,
          });
        }
        try { Audio.sfx.explode && Audio.sfx.explode(); } catch (e) {}
      }
    }
    obstacles = obstacles.filter(o => o.hp > 0);
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
    // Obstacles — 3D look with top highlight + side shadow + cracks based on damage
    for (const o of obstacles) {
      const dmgFrac = 1 - (o.hp / o.maxHp);
      // Side shadow (right + bottom)
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(o.x + o.w, o.y + o.height / 2, o.height / 2, o.h);
      ctx.fillRect(o.x + o.height / 2, o.y + o.h, o.w - o.height / 2, o.height / 2);
      // Main face
      ctx.fillStyle = o.hitFlash > 0 ? '#fff' : o.color;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      // Top highlight (lighter version of color)
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(o.x, o.y, o.w, 3);
      ctx.fillRect(o.x, o.y, 3, o.h);
      // Outline
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      // Damage cracks (more as HP decreases)
      if (dmgFrac > 0.25) {
        ctx.strokeStyle = `rgba(0,0,0,${0.4 + dmgFrac * 0.4})`;
        ctx.lineWidth = 1;
        const crackCount = Math.floor(dmgFrac * 6);
        for (let i = 0; i < crackCount; i++) {
          const sx = o.x + (i * 31 + 17) % o.w;
          const sy = o.y + (i * 19 + 11) % o.h;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + ((i * 7) % 8 - 4), sy + ((i * 11) % 8 - 4));
          ctx.stroke();
        }
      }
      // HP bar when damaged
      if (dmgFrac > 0 && dmgFrac < 1 && o.destructible) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(o.x, o.y - 5, o.w, 3);
        ctx.fillStyle = dmgFrac < 0.5 ? '#00ff66' : dmgFrac < 0.8 ? '#ffcc00' : '#ff3333';
        ctx.fillRect(o.x, o.y - 5, o.w * (o.hp / o.maxHp), 3);
      }
    }
    // Pickups (drawn below entities)
    for (const pk of pickups) {
      const color = pk.type === 'health' ? '#00ff66' : pk.type === 'damage' ? '#ff6600' : '#ffcc00';
      const icon = pk.type === 'health' ? '+' : pk.type === 'damage' ? '!' : '⚡';
      const pulse = Math.sin(pk.frame * 0.1) * 2 + 12;
      ctx.fillStyle = color + '44';
      ctx.beginPath(); ctx.arc(pk.x, pk.y, pulse + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(pk.x, pk.y, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, pk.x, pk.y);
      ctx.textBaseline = 'alphabetic';
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
    // Dash button cooldown
    const dashBtn = document.getElementById('std-dash-btn');
    if (dashBtn && player) {
      const now = performance.now();
      const onCd = now < player.dashCooldownEnd;
      if (onCd) {
        dashBtn.classList.add('cooldown');
        const left = Math.ceil((player.dashCooldownEnd - now) / 1000);
        dashBtn.textContent = left;
      } else {
        dashBtn.classList.remove('cooldown');
        dashBtn.textContent = '⇢';
      }
    }
    // Power button cooldown
    const powerBtn = document.getElementById('std-power-btn');
    if (powerBtn && player) {
      const now = performance.now();
      const onCd = now < player.powerCooldownEnd;
      if (onCd) {
        powerBtn.classList.add('cooldown');
        const left = Math.ceil((player.powerCooldownEnd - now) / 1000);
        powerBtn.textContent = left;
      } else {
        powerBtn.classList.remove('cooldown');
        powerBtn.textContent = POWER_ICONS[player.power] || '⚡';
      }
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
    pickups = [];
    pickupSpawnTimer = 4000;
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
    // Mobile dash button
    const dashBtn = document.getElementById('std-dash-btn');
    if (dashBtn) {
      const dashFn = (e) => {
        if (e) e.preventDefault();
        touchDash = true;
        setTimeout(() => { touchDash = false; }, 100);
      };
      dashBtn.addEventListener('touchstart', dashFn, { passive: false });
      dashBtn.addEventListener('click', dashFn);
    }
    // Mobile power button
    const powerBtn = document.getElementById('std-power-btn');
    if (powerBtn) {
      const pf = (e) => {
        if (e) e.preventDefault();
        touchPower = true;
        setTimeout(() => { touchPower = false; }, 100);
      };
      powerBtn.addEventListener('touchstart', pf, { passive: false });
      powerBtn.addEventListener('click', pf);
    }
    // Power picker in lobby
    document.querySelectorAll('.std-power').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.std-power').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        settings.power = btn.getAttribute('data-power');
      });
    });
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
