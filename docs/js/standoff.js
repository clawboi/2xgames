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
  const W = 1000, H = 700;
  function resizeStdCanvas() {
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
  }
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
  let damageNumbers = []; // floating numbers when bullet hits
  let muzzleFlashes = []; // brief flashes at gun barrel

  function addDamageNumber(x, y, dmg, color) {
    damageNumbers.push({
      x, y, dmg: Math.round(dmg),
      vy: -1.2 - Math.random() * 0.6,
      vx: (Math.random() - 0.5) * 0.6,
      life: 700, maxLife: 700,
      color: color || '#fff',
      size: dmg >= 50 ? 16 : dmg >= 25 ? 13 : 11,
    });
  }
  function addMuzzleFlash(x, y, angle, color) {
    muzzleFlashes.push({
      x, y, angle, color: color || '#ffee66',
      life: 120, maxLife: 120,
    });
  }
  function shakeScreen(big) {
    if (!canvas) return;
    canvas.classList.remove(big ? 'shake-light' : 'shake-big');
    void canvas.offsetWidth; // force reflow
    canvas.classList.add(big ? 'shake-big' : 'shake-light');
  }
  function flashDamage() {
    const el = document.getElementById('std-damage-flash');
    if (!el) return;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 50);
  }
  function addMultikillFlash(label, color) {
    const div = document.createElement('div');
    div.className = 'std-multikill-flash';
    div.style.color = color;
    div.style.textShadow = `0 0 14px ${color}, 0 0 32px ${color}, 3px 3px 0 #000`;
    div.style.borderColor = color;
    div.textContent = label;
    document.body.appendChild(div);
    setTimeout(() => { try { div.remove(); } catch (e) {} }, 2200);
  }
  function spawnPickup() {
    const types = ['health', 'damage', 'speed', 'weapon', 'ammo'];
    const type = types[Math.floor(Math.random() * types.length)];
    const sp = pickSpawnPoint();
    pickups.push({
      x: sp.x, y: sp.y, type,
      life: 18000, // 18s before despawn
      frame: 0,
      weaponIdx: type === 'weapon' ? Math.floor(Math.random() * 14) : undefined,
    });
  }
  function applyPickup(fighter, type, weaponIdx) {
    if (type === 'health') {
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + 60);
    } else if (type === 'damage') {
      fighter.damageBoostUntil = performance.now() + 10000;
    } else if (type === 'speed') {
      fighter.speedBoostUntil = performance.now() + 8000;
    } else if (type === 'weapon') {
      // Swap weapon to a random one — instant variety
      if (typeof weaponIdx === 'number' && Weapons && Weapons.get) {
        const w = Weapons.get(weaponIdx);
        if (w) {
          fighter.weaponIdx = weaponIdx;
          fighter.weaponName = w.name;
          fighter.fireRate = w.fireRate;
          fighter.bulletSpeed = w.bulletSpeed;
          fighter.damage = w.damage;
          fighter.spread = w.spread || 0;
          fighter.shotsPerFire = w.shotsPerFire || 1;
          fighter.maxMagazine = w.magazine;
          fighter.magazine = w.magazine;
          fighter.reloadTime = w.reloadTime;
          fighter.bulletType = w.bulletType;
        }
      }
    } else if (type === 'ammo') {
      fighter.magazine = fighter.maxMagazine;
      fighter.reloading = false;
    }
    if (!fighter.isBot) {
      try { Audio.sfx.pickup && Audio.sfx.pickup(); } catch (e) {}
      const labels = {
        health: ['+60 HP', '#00ff66'],
        damage: ['2X DAMAGE!', '#ff6600'],
        speed: ['SPEED BOOST!', '#ffcc00'],
        weapon: [`🔫 ${fighter.weaponName}!`, '#cc66ff'],
        ammo: ['FULL AMMO', '#ffffff'],
      };
      const [text, color] = labels[type] || ['+', '#fff'];
      addMultikillFlash(text, color);
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

  // ============ MAP UTILS ============
  function shadeColor(hexOrColor, factor) {
    // factor 0..2 — <1 darker, >1 lighter
    let r = 100, g = 100, b = 100;
    if (typeof hexOrColor === 'string' && hexOrColor.startsWith('#')) {
      const h = hexOrColor.slice(1);
      const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
      r = parseInt(v.slice(0, 2), 16);
      g = parseInt(v.slice(2, 4), 16);
      b = parseInt(v.slice(4, 6), 16);
    }
    const cap = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
    return `rgb(${cap(r)},${cap(g)},${cap(b)})`;
  }

  function rect(x, y, w, h, color, opts) {
    opts = opts || {};
    // Scale from reference 800×600 to actual W×H so existing maps fill the bigger canvas
    const sx = W / 800, sy = H / 600;
    const rx = x * sx, ry = y * sy;
    const rw = w * sx, rh = h * sy;
    const baseHp = (rw * rh) / 60;
    return {
      x: rx, y: ry, w: rw, h: rh, color: color || '#666',
      hp: opts.hp || baseHp,
      maxHp: opts.hp || baseHp,
      height: opts.height || (8 + Math.random() * 8),
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
      this.radius = 14;
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
      // Bot personality — affects movement/aim style
      this.personality = isBot ? ['rusher', 'sniper', 'defender', 'balanced'][Math.floor(Math.random() * 4)] : 'balanced';
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
          this.vx = inp.x * 3.2 * speedBoost;
          this.vy = inp.y * 3.2 * speedBoost;
        }
        if (inp.fire) this.tryFire();
        if (inp.reload && !this.reloading && this.magazine < this.maxMagazine) this.startReload();
        if (inp.dash) this.tryDash();
        if (inp.power) this.tryPower();
        if (inp.swap) this.trySwap();
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
      // Speed-line trail particles — radial whoosh
      for (let i = 0; i < 16; i++) {
        const spread = (Math.random() - 0.5) * 0.6;
        particles.push({
          x: this.x, y: this.y,
          vx: -this.dashDir.x * (2 + Math.random() * 3) + spread,
          vy: -this.dashDir.y * (2 + Math.random() * 3) + spread,
          life: 350 + Math.random() * 200, color: this.color, size: 2 + Math.random() * 2,
        });
      }
      // White motion-blur core
      for (let i = 0; i < 6; i++) {
        particles.push({
          x: this.x, y: this.y,
          vx: -this.dashDir.x * (1 + Math.random()),
          vy: -this.dashDir.y * (1 + Math.random()),
          life: 200, color: '#ffffff', size: 4,
        });
      }
    }
    trySwap() {
      const now = performance.now();
      if (now < (this.swapCooldownEnd || 0)) return;
      // Cycle through first 4 weapons
      const next = (this.weapon + 1) % 4;
      this.weapon = next;
      this.applyWeaponStats(next);
      this.magazine = this.maxMagazine;
      this.reloading = false;
      this.swapCooldownEnd = now + 600;
      if (!this.isBot) {
        addMultikillFlash(`🔫 ${this.weaponName}`, this.color);
        try { Audio.sfx.reload && Audio.sfx.reload(); } catch (e) {}
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
        const pers = this.personality;
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
        } else if (pers === 'rusher' && nearest) {
          // Rush toward target
          const a = Math.atan2(nearest.y - this.y, nearest.x - this.x);
          this.botMoveDir = { x: Math.cos(a), y: Math.sin(a) };
        } else if (pers === 'sniper' && nearest) {
          // Keep distance - back off if close
          const a = Math.atan2(nearest.y - this.y, nearest.x - this.x);
          if (ndist < 200) {
            this.botMoveDir = { x: -Math.cos(a), y: -Math.sin(a) };
          } else {
            // Slight strafe
            const sd = Math.random() < 0.5 ? 1 : -1;
            this.botMoveDir = { x: Math.cos(a + Math.PI / 2 * sd), y: Math.sin(a + Math.PI / 2 * sd) };
          }
        } else if (pers === 'defender') {
          // Move toward nearest pickup if any, otherwise wander
          let nearestPickup = null, npd = Infinity;
          for (const pk of pickups) {
            const d = Math.hypot(pk.x - this.x, pk.y - this.y);
            if (d < npd) { npd = d; nearestPickup = pk; }
          }
          if (nearestPickup) {
            const a = Math.atan2(nearestPickup.y - this.y, nearestPickup.x - this.x);
            this.botMoveDir = { x: Math.cos(a), y: Math.sin(a) };
          } else {
            const ang = Math.random() * Math.PI * 2;
            this.botMoveDir = { x: Math.cos(ang), y: Math.sin(ang) };
          }
        } else {
          const ang = Math.random() * Math.PI * 2;
          this.botMoveDir = { x: Math.cos(ang), y: Math.sin(ang) };
        }
      }
      const speedBase = settings.botDifficulty === 'easy' ? 1.5 : (settings.botDifficulty === 'hard' ? 2.6 : 2.0);
      // Personality affects speed
      const persMult = this.personality === 'rusher' ? 1.15 : this.personality === 'sniper' ? 0.85 : 1;
      const speedMult = speedBase * persMult;
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
      // Muzzle flash at barrel tip
      const flashColor = iceActive ? '#aaeeff' :
        this.bulletType === 'rpg' ? '#ff6600' :
        this.bulletType === 'tesla' || this.bulletType === 'laser' ? '#00ffff' :
        this.bulletType === 'flame' ? '#ff9933' :
        this.bulletType === 'plasma' ? '#cc00ff' :
        this.bulletType === 'freeze' ? '#aaeeff' :
        this.bulletType === 'honey' ? '#ffcc00' :
        '#ffee66';
      addMuzzleFlash(
        this.x + Math.cos(this.facing) * (this.radius + 8),
        this.y + Math.sin(this.facing) * (this.radius + 8),
        this.facing,
        flashColor
      );
      // Light screen shake when player fires (only for player, not bots)
      if (!this.isBot && (this.bulletType === 'rpg' || this.bulletType === 'shotgun')) shakeScreen(false);
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
      // Floating damage number
      addDamageNumber(this.x, this.y - 8, amt, attacker && attacker.color === this.color ? '#fff' : (attacker ? attacker.color : '#fff'));
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: this.x, y: this.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 300, color: '#ff4444', size: 2,
        });
      }
      // Player feedback: red flash overlay + light shake
      if (!this.isBot) {
        flashDamage();
        shakeScreen(false);
      }
      if (this.hp <= 0) {
        this.dead = true;
        this.hp = 0;
        this.respawnAt = performance.now() + 1600; // Faster respawn = more action
        // Track killer for spectator mode
        if (!this.isBot) this.lastKiller = attacker;
        // PLAYER death overlay
        if (!this.isBot && attacker) {
          const overlay = document.getElementById('std-death-overlay');
          const killerEl = document.getElementById('std-death-killer');
          const weaponEl = document.getElementById('std-death-weapon');
          if (overlay && killerEl) {
            killerEl.textContent = attacker.name;
            killerEl.style.color = attacker.color;
            if (weaponEl) weaponEl.textContent = `WITH ${attacker.weaponName || 'WEAPON'}`;
            overlay.classList.remove('hidden');
          }
        }
        if (attacker && attacker.slot !== this.slot && scores[attacker.slot]) {
          scores[attacker.slot].score++;
          addKillFeed(attacker.name, this.name, attacker.color, this.color);
          if (!attacker.isBot || !this.isBot) shakeScreen(true);
          // Score popup floating up from killer
          if (!attacker.isBot) {
            addDamageNumber(attacker.x, attacker.y - 30, '+1 KILL', '#ffcc00');
          }
          // HP regen reward — +15 HP on every kill (capped)
          const healAmt = 15;
          const before = attacker.hp;
          attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
          const actualHeal = attacker.hp - before;
          if (actualHeal > 0 && !attacker.isBot) {
            addDamageNumber(attacker.x, attacker.y - 8, '+' + actualHeal, '#00ff66');
          }
          // LIFETIME KILLSTREAK REWARDS (resets on death)
          attacker.lifeKillstreak = (attacker.lifeKillstreak || 0) + 1;
          const ks = attacker.lifeKillstreak;
          if (ks === 3) {
            attacker.speedBoostUntil = performance.now() + 8000;
            if (!attacker.isBot) addMultikillFlash('🔥 STREAK 3 · SPEED BOOST', '#ffcc00');
          } else if (ks === 5) {
            attacker.hp = attacker.maxHp;
            if (!attacker.isBot) addMultikillFlash('💚 STREAK 5 · FULL HEAL', '#00ff66');
          } else if (ks === 7) {
            attacker.invulnUntil = performance.now() + 3500;
            if (!attacker.isBot) addMultikillFlash('🛡 STREAK 7 · INVULN 3.5S', '#ffffff');
          } else if (ks === 10) {
            if (!attacker.isBot) addMultikillFlash('☢ STREAK 10 · NUKE!', '#ff6600');
            for (const e of entities) {
              if (e === attacker || e.dead) continue;
              if (settings.mode !== 'ffa' && e.team === attacker.team) continue;
              e.takeDamage(999, attacker);
            }
            shakeScreen(true);
          }
          // Multikill check (quick succession)
          const now = performance.now();
          if (now - attacker.lastKillAt < 4000) {
            attacker.killStreak++;
            const labels = ['', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'RAMPAGE!'];
            const bonus = [0, 50, 150, 300, 500];
            const i = Math.min(4, attacker.killStreak);
            if (i > 0 && labels[i]) {
              addMultikillFlash(labels[i], attacker.color);
              scores[attacker.slot].score += Math.floor(bonus[i] / 50);
              // Slo-mo on triple+ (only for player kills, not bot vs bot)
              if (i >= 2 && !attacker.isBot) triggerSlowMo(500 + i * 200);
            }
          } else {
            attacker.killStreak = 1;
          }
          attacker.lastKillAt = now;
          checkWin();
        }
        // Big death explosion — way more visceral
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
          const sp = 2 + Math.random() * 4;
          particles.push({
            x: this.x, y: this.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 700 + Math.random() * 400,
            color: this.color, size: 2 + Math.random() * 3,
          });
        }
        // Inner red blood burst
        for (let i = 0; i < 15; i++) {
          particles.push({
            x: this.x, y: this.y,
            vx: (Math.random() - 0.5) * 7,
            vy: (Math.random() - 0.5) * 7,
            life: 800, color: '#ff2244', size: 3 + Math.random() * 2,
          });
        }
        // Bright white core flash
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: this.x, y: this.y,
            vx: Math.cos(a) * 6, vy: Math.sin(a) * 6,
            life: 250, color: '#ffffff', size: 4,
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
      this.invulnUntil = performance.now() + 1800;
      this.lifeKillstreak = 0;
      this.killStreak = 0;
      // Hide death overlay if it was the player
      if (!this.isBot) {
        const overlay = document.getElementById('std-death-overlay');
        if (overlay) overlay.classList.add('hidden');
      }
    }
    draw(ctx) {
      if (this.dead) return;
      const now = performance.now();
      const invisible = now < this.invisibleUntil;
      const invuln = now < this.invulnUntil;
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
      // Respawn invuln glow (pulsing white ring)
      if (invuln) {
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(now / 80) * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 6 + Math.sin(now / 80) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.save();
      if (invisible) ctx.globalAlpha = !this.isBot ? 0.35 : 0.05;
      else if (invuln) ctx.globalAlpha = 0.55 + Math.sin(now / 100) * 0.3;
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
      // RELOAD progress arc above player
      if (this.reloading) {
        const pct = 1 - (this.reloadUntil - now) / this.reloadTime;
        const arc = Math.max(0, Math.min(1, pct));
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 28, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 28, 8, -Math.PI / 2, -Math.PI / 2 + arc * Math.PI * 2);
        ctx.stroke();
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
      if (o._destroyed) continue;
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
  let touchSwap = false;
  let touchAim = null; // when user drags fire button, this is the aim angle

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
    // Aim direction:
    // - Touch + fire button drag (touchAim): face drag direction
    // - Touch + right-half drag (rightTouchId): face the right finger position (stand still + aim)
    // - Touch + moving (no aim drag): face movement direction
    // - Touch + standing still: keep last facing
    // - Desktop: face mouse cursor
    if (player) {
      const isTouch = touchMove.active || ('ontouchstart' in window && !mouseDown);
      if (touchAim != null) {
        // Fire button drag overrides everything
        player.facing = touchAim;
      } else if (rightTouchId !== null) {
        // Right-half touch: aim at finger position (allows still + aim any direction)
        player.facing = Math.atan2(mouseY - player.y, mouseX - player.x);
      } else if (isTouch && touchMove.active && (Math.abs(x) > 0.05 || Math.abs(y) > 0.05)) {
        player.facing = Math.atan2(y, x);
      } else if (!isTouch) {
        player.facing = Math.atan2(mouseY - player.y, mouseX - player.x);
      }
    }
    return {
      x, y,
      fire: mouseDown || keys[' '] || touchFire,
      reload: keys['r'],
      dash: keys['shift'] || touchDash,
      power: keys['q'] || touchPower,
      swap: keys['tab'] || touchSwap,
    };
  }

  // ============ GAME LOOP ============
  function update(dt) {
    if (paused) return;
    for (const e of entities) e.update(dt);
    // Pickups
    pickupSpawnTimer -= dt;
    if (pickupSpawnTimer <= 0 && pickups.length < 3) {
      pickupSpawnTimer = 8000 + Math.random() * 4000;
      spawnPickup();
    }
    for (const pk of pickups) {
      pk.life -= dt;
      pk.frame++;
      for (const f of entities) {
        if (f.dead) continue;
        if (Math.hypot(f.x - pk.x, f.y - pk.y) < f.radius + 12) {
          applyPickup(f, pk.type, pk.weaponIdx);
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
      // Bullet trail particle (1 per frame, fades fast)
      if (Math.random() < 0.7) {
        particles.push({
          x: b.x - b.vx * 0.4, y: b.y - b.vy * 0.4,
          vx: 0, vy: 0,
          life: 180, color: b.color, size: 1.5,
        });
      }
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) b.life = 0;
      for (const o of obstacles) {
        if (o._destroyed) continue; // ghost, no collision
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
          // SPARK HIT effect on enemy — distinct from blood (8 yellow + white sparks)
          for (let i = 0; i < 8; i++) {
            const a = Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * Math.PI * 0.7;
            const sp = 1.5 + Math.random() * 2.5;
            particles.push({
              x: b.x, y: b.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 280 + Math.random() * 200,
              color: i < 4 ? '#ffcc00' : '#ffffff',
              size: 1.5 + Math.random() * 1,
            });
          }
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
    // Process destroyed obstacles — schedule respawn instead of removing
    const now = performance.now();
    for (const o of obstacles) {
      if (o.hitFlash > 0) o.hitFlash--;
      if (o.hp <= 0 && !o._destroyed) {
        o._destroyed = true;
        o._respawnAt = now + 9000; // 9 second respawn
        // MASSIVE disintegration — pixel debris with gravity, flying everywhere
        // Layer 1: Block-color chunks (60 particles, full coverage of block)
        for (let i = 0; i < 60; i++) {
          const px = o.x + Math.random() * o.w;
          const py = o.y + Math.random() * o.h;
          // Direction biased away from block center
          const ax = (px - (o.x + o.w / 2)) / o.w;
          const ay = (py - (o.y + o.h / 2)) / o.h;
          particles.push({
            x: px, y: py,
            vx: ax * 4 + (Math.random() - 0.5) * 5,
            vy: ay * 4 + (Math.random() - 0.5) * 5 - 1.5, // bias upward
            life: 700 + Math.random() * 600,
            color: o.color, size: 1.5 + Math.random() * 2.5,
            grav: 0.18, // gravity makes debris fall
          });
        }
        // Layer 2: Lighter shade dust (40 particles)
        const dustCol = shadeColor(o.color, 1.3);
        for (let i = 0; i < 40; i++) {
          particles.push({
            x: o.x + Math.random() * o.w,
            y: o.y + Math.random() * o.h,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 500 + Math.random() * 400,
            color: dustCol, size: 1 + Math.random() * 1.5,
            grav: 0.08,
          });
        }
        // Layer 3: Bright white sparks (15 particles, instant flash)
        for (let i = 0; i < 15; i++) {
          const a = (i / 15) * Math.PI * 2;
          particles.push({
            x: o.x + o.w / 2, y: o.y + o.h / 2,
            vx: Math.cos(a) * (3 + Math.random() * 4),
            vy: Math.sin(a) * (3 + Math.random() * 4),
            life: 250, color: '#ffffff', size: 2 + Math.random(),
          });
        }
        // Layer 4: Dark shadow chunks (20 particles for weight/density)
        const darkCol = shadeColor(o.color, 0.4);
        for (let i = 0; i < 20; i++) {
          particles.push({
            x: o.x + Math.random() * o.w,
            y: o.y + Math.random() * o.h,
            vx: (Math.random() - 0.5) * 3.5,
            vy: -1 - Math.random() * 3,
            life: 900,
            color: darkCol, size: 2 + Math.random() * 2,
            grav: 0.22,
          });
        }
        // Screen shake for chunky impact
        shakeScreen(false);
        try { Audio.sfx.explode && Audio.sfx.explode(); } catch (e) {}
      }
      // Respawn check
      if (o._destroyed && now >= o._respawnAt) {
        o.hp = o.maxHp;
        o._destroyed = false;
        o._respawnAt = 0;
        // Spawn-in particles
        for (let i = 0; i < 12; i++) {
          particles.push({
            x: o.x + o.w / 2 + (Math.random() - 0.5) * o.w,
            y: o.y + o.h / 2 + (Math.random() - 0.5) * o.h,
            vx: (Math.random() - 0.5) * 1,
            vy: -1 - Math.random() * 2,
            life: 600, color: '#ffffff', size: 2,
          });
        }
      }
    }
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.94;
      if (p.grav) p.vy += p.grav; else p.vy *= 0.94;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
    // Floating damage numbers
    for (const d of damageNumbers) {
      d.x += d.vx;
      d.y += d.vy;
      d.vy *= 0.95;
      d.life -= dt;
    }
    damageNumbers = damageNumbers.filter(d => d.life > 0);
    // Muzzle flashes
    for (const m of muzzleFlashes) m.life -= dt;
    muzzleFlashes = muzzleFlashes.filter(m => m.life > 0);
  }

  function render() {
    const m = MAPS[settings.map] || MAPS.streets;
    ctx.fillStyle = m.floor; ctx.fillRect(0, 0, W, H);
    // Floor grid
    ctx.strokeStyle = m.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.18;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Obstacles — TRUE 3D look with isometric depth + proper faces
    const nowR = performance.now();
    for (const o of obstacles) {
      // Ghost outline if destroyed and respawning
      if (o._destroyed) {
        const pct = 1 - (o._respawnAt - nowR) / 9000;
        ctx.strokeStyle = `rgba(255,255,255,${0.25 + pct * 0.35})`;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(o.x, o.y, o.w, o.h);
        ctx.setLineDash([]);
        // Build-up progress bar
        ctx.fillStyle = `rgba(0,255,102,${0.6 + Math.sin(nowR / 200) * 0.3})`;
        ctx.fillRect(o.x + o.w / 2 - 14, o.y + o.h / 2 - 1, 28 * pct, 3);
        // "REBUILDING" tiny label
        if (pct > 0.6) {
          ctx.font = 'bold 7px monospace';
          ctx.fillStyle = `rgba(0,255,102,${0.8})`;
          ctx.textAlign = 'center';
          ctx.fillText('REBUILDING', o.x + o.w / 2, o.y + o.h / 2 - 6);
        }
        continue;
      }
      const dmgFrac = 1 - (o.hp / o.maxHp);
      const depth = o.height || 10;
      // 1. RIGHT FACE (lit side - lighter version)
      ctx.fillStyle = shadeColor(o.color, 0.55);
      ctx.beginPath();
      ctx.moveTo(o.x + o.w, o.y);
      ctx.lineTo(o.x + o.w + depth, o.y - depth);
      ctx.lineTo(o.x + o.w + depth, o.y + o.h - depth);
      ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.stroke();
      // 2. TOP FACE (brightest - sky-lit)
      ctx.fillStyle = shadeColor(o.color, 0.8);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + depth, o.y - depth);
      ctx.lineTo(o.x + o.w + depth, o.y - depth);
      ctx.lineTo(o.x + o.w, o.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 3. FRONT FACE (main visible side)
      ctx.fillStyle = o.hitFlash > 0 ? '#fff' : o.color;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      // Bottom shadow (right + bottom drop)
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(o.x + o.w, o.y + o.h, depth, depth);
      // Front face outline
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      // Inner top highlight (catches the light)
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, 4);
      ctx.fillRect(o.x + 2, o.y + 2, 4, o.h - 4);
      // Damage cracks
      if (dmgFrac > 0.25) {
        ctx.strokeStyle = `rgba(0,0,0,${0.45 + dmgFrac * 0.4})`;
        ctx.lineWidth = 1.5;
        const crackCount = Math.floor(dmgFrac * 7);
        for (let i = 0; i < crackCount; i++) {
          const sx = o.x + (i * 31 + 17) % o.w;
          const sy = o.y + (i * 19 + 11) % o.h;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + ((i * 7) % 10 - 5), sy + ((i * 11) % 10 - 5));
          ctx.stroke();
        }
      }
      // HP bar
      if (dmgFrac > 0 && dmgFrac < 1 && o.destructible) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(o.x, o.y - 8, o.w, 4);
        ctx.fillStyle = dmgFrac < 0.5 ? '#00ff66' : dmgFrac < 0.8 ? '#ffcc00' : '#ff3333';
        ctx.fillRect(o.x, o.y - 8, o.w * (o.hp / o.maxHp), 4);
      }
    }
    // Pickups (drawn below entities)
    for (const pk of pickups) {
      const color = pk.type === 'health' ? '#00ff66' : pk.type === 'damage' ? '#ff6600' : pk.type === 'weapon' ? '#cc66ff' : pk.type === 'ammo' ? '#ffffff' : '#ffcc00';
      const icon = pk.type === 'health' ? '+' : pk.type === 'damage' ? '!' : pk.type === 'weapon' ? '🔫' : pk.type === 'ammo' ? '◧' : '⚡';
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

    // SPECTATOR: highlight killer while player is dead
    if (player && player.dead && player.lastKiller && !player.lastKiller.dead) {
      const k = player.lastKiller;
      const t = performance.now() / 300;
      // Pulsing orange ring around killer
      ctx.strokeStyle = `rgba(255,140,0,${0.6 + Math.sin(t) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(k.x, k.y, 22 + Math.sin(t) * 3, 0, Math.PI * 2);
      ctx.stroke();
      // "KILLER" label above
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillRect(k.x - 28, k.y - 50, 56, 14);
      ctx.fillStyle = '#ff8800';
      ctx.fillText('▼ KILLER', k.x, k.y - 40);
    }
    // Particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 600);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // Muzzle flashes (additive-ish)
    for (const m of muzzleFlashes) {
      const a = m.life / m.maxLife;
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = m.color;
      // Conical flash
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      const len = 14 * a + 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, -4 * a);
      ctx.lineTo(len + 4, 0);
      ctx.lineTo(len, 4 * a);
      ctx.closePath();
      ctx.fill();
      // Bright core
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(0, 0, 4 * a, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // Floating damage numbers
    ctx.textAlign = 'center';
    for (const d of damageNumbers) {
      const a = Math.min(1, d.life / 400);
      ctx.globalAlpha = a;
      ctx.font = `bold ${d.size}px monospace`;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(d.dmg, d.x, d.y);
      ctx.fillStyle = d.color;
      ctx.fillText(d.dmg, d.x, d.y);
    }
    ctx.globalAlpha = 1;

    // MINIMAP — top-right corner
    const mmW = 120, mmH = 90;
    const mmX = W - mmW - 12;
    const mmY = 50;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(mmX - 3, mmY - 3, mmW + 6, mmH + 6);
    ctx.strokeStyle = '#ff0033';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mmX - 3, mmY - 3, mmW + 6, mmH + 6);
    // Floor
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    // Scale
    const mmSx = mmW / W;
    const mmSy = mmH / H;
    // Obstacles
    for (const o of obstacles) {
      if (o._destroyed) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.strokeRect(mmX + o.x * mmSx, mmY + o.y * mmSy, o.w * mmSx, o.h * mmSy);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillRect(mmX + o.x * mmSx, mmY + o.y * mmSy, o.w * mmSx, o.h * mmSy);
      }
    }
    // Pickups
    for (const pk of pickups) {
      const c = pk.type === 'health' ? '#00ff66' : pk.type === 'damage' ? '#ff6600' : pk.type === 'weapon' ? '#cc66ff' : pk.type === 'ammo' ? '#ffffff' : '#ffcc00';
      ctx.fillStyle = c;
      ctx.fillRect(mmX + pk.x * mmSx - 1, mmY + pk.y * mmSy - 1, 3, 3);
    }
    // Players — dot per player
    for (const f of entities) {
      if (f.dead) continue;
      // Invisible players hidden from others
      if (f !== player && f.invisibleUntil && performance.now() < f.invisibleUntil) continue;
      ctx.fillStyle = f.color;
      const px = mmX + f.x * mmSx;
      const py = mmY + f.y * mmSy;
      ctx.beginPath();
      ctx.arc(px, py, f === player ? 3 : 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (f === player) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // Minimap label
    ctx.fillStyle = '#ff0033';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MAP', mmX, mmY - 6);

    // DESKTOP CROSSHAIR — only when mouse is over canvas
    if (player && !player.dead && mouseX > 0 && mouseY > 0 && !('ontouchstart' in window)) {
      const t = performance.now() / 200;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 1.5;
      // Outer ring with rotation
      ctx.save();
      ctx.translate(mouseX, mouseY);
      ctx.rotate(t * 0.5);
      const r = 14 + Math.sin(t * 2) * 1.5;
      // 4 segments forming a + that breaks
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
        ctx.lineTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4));
        ctx.stroke();
      }
      ctx.restore();
      // Center dot
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(mouseX, mouseY, 1.5, 0, Math.PI * 2); ctx.fill();
      // Line from player to crosshair (faint, only when actively aiming)
      if (player.aimTarget == null) {
        ctx.strokeStyle = `${player.color}33`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(mouseX, mouseY);
        ctx.stroke();
      }
    }

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

  let slowMoUntil = 0;
  function triggerSlowMo(ms = 600) {
    slowMoUntil = performance.now() + ms;
  }

  function loop(now) {
    if (!running) return;
    let dt = Math.min(40, now - (lastT || now));
    lastT = now;
    // Slow-mo effect: reduce dt by 0.25× during slowMoUntil
    if (now < slowMoUntil) dt *= 0.25;
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
    // Death timer countdown
    if (player && player.dead) {
      const left = Math.max(1, Math.ceil((player.respawnAt - performance.now()) / 1000));
      const el = document.getElementById('std-death-timer-val');
      if (el) el.textContent = left;
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
        const mvp = i === 0 ? '<span class="std-mvp-badge">MVP</span>' : '';
        return `<div style="color:${s.color};font-size:11px;letter-spacing:1px;padding:3px 0;">${medal} ${s.name}${isMe}: <b>${s.score}</b>${mvp}</div>`;
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
    damageNumbers = [];
    muzzleFlashes = [];
    mySlot = 0;
    const deathOv = document.getElementById('std-death-overlay');
    if (deathOv) deathOv.classList.add('hidden');
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
    // Fill viewport like Crabcage
    resizeStdCanvas();
    if (!startMatch._resizeWired) {
      startMatch._resizeWired = true;
      window.addEventListener('resize', resizeStdCanvas);
      window.addEventListener('orientationchange', () => setTimeout(resizeStdCanvas, 100));
    }
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
  function renderLobbyCharPreview() {
    const cv = document.getElementById('std-char-preview');
    if (!cv || !window.Sprites) return;
    const ctx2 = cv.getContext('2d');
    ctx2.imageSmoothingEnabled = false;
    ctx2.fillStyle = '#000'; ctx2.fillRect(0, 0, cv.width, cv.height);
    try {
      const save = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}');
      const cust = save.customization || { fit: '#cc0022', accent: '#00ff66', hat: 'durag', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
      Sprites.drawPlayer(ctx2, cv.width / 2, cv.height / 2 + 14, cust, 'down', 0);
    } catch (e) {}
    // Name from profile
    const nameEl = document.getElementById('std-char-preview-name');
    if (nameEl) {
      const prof = window.FAMEUP ? FAMEUP.getProfile() : { username: null };
      nameEl.textContent = (prof.username || 'YOUR FIGHTER').toUpperCase().slice(0, 14);
    }
  }

  function openLobby() {
    renderLobbyCharPreview();
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
    // Mobile fire button — main action, twin-stick aim: drag from button to set facing direction
    const fireBtn = document.getElementById('std-fire-btn');
    if (fireBtn) {
      let fireStart = null;
      const press = (e) => {
        if (e) e.preventDefault();
        touchFire = true;
        const t = e.touches ? e.touches[0] : e;
        if (t) fireStart = { x: t.clientX, y: t.clientY };
      };
      const move = (e) => {
        if (e) e.preventDefault();
        if (!fireStart) return;
        const t = e.touches ? e.touches[0] : e;
        if (!t) return;
        const dx = t.clientX - fireStart.x;
        const dy = t.clientY - fireStart.y;
        // Only override aim once user has dragged > 8px (avoids accidental aim flicker on tap)
        if (Math.hypot(dx, dy) > 8) {
          touchAim = Math.atan2(dy, dx);
        }
      };
      const release = (e) => {
        if (e) e.preventDefault();
        touchFire = false;
        touchAim = null;
        fireStart = null;
      };
      fireBtn.addEventListener('touchstart', press, { passive: false });
      fireBtn.addEventListener('touchmove', move, { passive: false });
      fireBtn.addEventListener('touchend', release, { passive: false });
      fireBtn.addEventListener('touchcancel', release, { passive: false });
      fireBtn.addEventListener('mousedown', press);
      fireBtn.addEventListener('mousemove', move);
      fireBtn.addEventListener('mouseup', release);
      fireBtn.addEventListener('mouseleave', release);
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
    // Mobile weapon swap button
    const swapBtn = document.getElementById('std-weapon-btn');
    if (swapBtn) {
      const sf = (e) => {
        if (e) e.preventDefault();
        touchSwap = true;
        setTimeout(() => { touchSwap = false; }, 100);
      };
      swapBtn.addEventListener('touchstart', sf, { passive: false });
      swapBtn.addEventListener('click', sf);
    }
    // Prevent Tab from changing focus
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && running && !paused) e.preventDefault();
    });
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
