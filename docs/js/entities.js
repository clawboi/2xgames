// entities.js — game objects with update/draw
// v4: weapons all work, blood splats, armed crabs, fans, lightning, suit dude,
// player gun-lock state, RPG explodes on expire, sonic wave weapon.

// ===== PLAYER =====
class Player {
  constructor(x, y, customization) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 12;
    this.hp = 100; this.maxHp = 100;
    this.speed = 3.2;
    this.cust = customization;

    this.weapons = Weapons.defs.map(w => ({ ammo: w.magazine === Infinity ? Infinity : w.magazine, reloading: false, reloadEnd: 0 }));
    this.weaponIdx = 0;
    this.lastFireTime = 0;
    this.facing = 0;
    this.dir = 0;
    this.frame = 0;
    this.crabUnlocked = false;
    // Shop-unlocked weapons
    this.unlockedWeapons = new Set([0, 1, 2, 3]);

    this.damageMultiplier = 1;
    this.damageBuffEnd = 0;
    this.speedMultiplier = 1;
    this.speedBuffEnd = 0;
    this.shieldHp = 0;

    this.dashTime = 0;
    this.dashCooldown = 0;
    this.dashTrail = [];

    this.hurtFlash = 0;
    this.muzzleFlashTime = 0;
    this.regenAccum = 0;

    // NEW: gun-lock penalty after shooting a fan
    this.gunLockEnd = 0;

    // NEW: emote (dance) state
    this.emoteEnd = 0;
    this.emoteType = null;

    // NEW: applied upgrades from shop
    this.upgradeDmgLevel = 0; // each level = +20% dmg
    this.upgradeSpeedLevel = 0; // each level = +10% speed

    // NEW: melee swing visual
    this.meleeSwingTime = 0;
    this.meleeSwingAng = 0;
  }

  applyUpgrades(upgrades) {
    this.upgradeDmgLevel = upgrades?.weaponDmg || 0;
    this.upgradeSpeedLevel = upgrades?.moveSpeed || 0;
    this.speed = 3.2 * (1 + 0.10 * this.upgradeSpeedLevel);
  }

  update(dt, game) {
    const now = performance.now();
    if (now > this.damageBuffEnd) this.damageMultiplier = 1;
    if (now > this.speedBuffEnd) this.speedMultiplier = 1;

    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.dashTime > 0) this.dashTime -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.muzzleFlashTime > 0) this.muzzleFlashTime -= dt;
    if (this.meleeSwingTime > 0) this.meleeSwingTime -= dt;

    // Movement
    const move = Input.getMoveVector();
    let speed = this.speed * this.speedMultiplier;
    if (this.dashTime > 0) speed *= 2.5;
    if (this.emoteEnd > now) speed *= 0; // can't move while emoting
    if (game.drunkUntil && game.drunkUntil > now) {
      // Drunk wobble
      const wobble = Math.sin(now / 180) * 0.3;
      move.x = move.x * (1 - Math.abs(wobble)) + wobble;
      move.y = move.y * (1 - Math.abs(wobble)) + Math.cos(now / 180) * 0.2;
      speed *= 0.75;
    }

    this.vx = move.x * speed;
    this.vy = move.y * speed;
    this.x += this.vx;
    this.y += this.vy;

    // Dash trail
    if (this.dashTime > 0) {
      this.dashTrail.push({ x: this.x, y: this.y, life: 300, dir: this.dir, frame: this.frame });
    }
    for (const t of this.dashTrail) t.life -= dt;
    this.dashTrail = this.dashTrail.filter(t => t.life > 0);

    // Facing direction (for sprite mirroring)
    if (Math.abs(this.vx) > 0.1) this.dir = this.vx > 0 ? 1 : 0;

    // Walk anim
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.1) this.frame = (this.frame + 1) % 8;

    // Dash
    if (Input.consumeDash() && this.dashCooldown <= 0) {
      this.dashTime = 180;
      this.dashCooldown = 1200;
      try { Audio.sfx.pickup(); } catch (e) {}
      game.spawnSparks(this.x, this.y, '#00ff66', 8);
    }

    // Aiming
    if (Input.isTouchDevice()) {
      const nearest = game.findNearestEnemy(this.x, this.y);
      if (nearest) {
        // Lerp toward target angle so aim feels fluid not snappy
        const targetAng = Math.atan2(nearest.y - this.y, nearest.x - this.x);
        // Shortest-arc lerp
        let diff = targetAng - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * 0.18;
      }
    } else {
      const m = Input.getMouseTarget();
      this.facing = Math.atan2(m.y - this.y, m.x - this.x);
    }

    // Firing — blocked during emote or gun lock
    if (Input.isFiring() && this.emoteEnd <= now && this.gunLockEnd <= now) {
      this.tryFire(game);
    }
    if (Input.isKey(' ') || Input.isKey('r')) this.reload();

    // Weapon select via number keys
    for (let i = 1; i <= 7; i++) {
      if (Input.isKey(i.toString())) {
        const idx = i - 1;
        if (idx === 4 && !this.crabUnlocked) continue;
        if (idx > 4 && !this.unlockedWeapons.has(idx)) continue;
        this.weaponIdx = idx;
      }
    }

    // Auto-reload when empty
    const wState = this.weapons[this.weaponIdx];
    const w = Weapons.get(this.weaponIdx);
    if (wState.ammo === 0 && !wState.reloading && w.magazine !== Infinity) this.reload();
    if (wState.reloading && performance.now() >= wState.reloadEnd) {
      wState.ammo = w.magazine;
      wState.reloading = false;
      try { Audio.sfx.reload(); } catch (e) {}
    }

    // Passive regen
    if (this.hp < this.maxHp) {
      this.regenAccum += dt;
      if (this.regenAccum >= 1000) {
        this.regenAccum -= 1000;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }

    // Keep on screen
    this.x = Math.max(this.radius, Math.min(game.world.w - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(game.world.h - this.radius, this.y));
  }

  triggerEmote(type) {
    this.emoteEnd = performance.now() + 1400;
    this.emoteType = type;
    try { Audio.sfx.combo(); } catch (e) {}
  }

  tryFire(game) {
    const w = Weapons.get(this.weaponIdx);
    const wState = this.weapons[this.weaponIdx];
    const now = performance.now();
    if (now - this.lastFireTime < w.fireRate) return;
    if (wState.reloading) return;
    if (wState.ammo <= 0 && w.magazine !== Infinity) return;

    this.lastFireTime = now;
    if (w.magazine !== Infinity) wState.ammo--;
    this.muzzleFlashTime = 60;

    const dmgMult = this.damageMultiplier * (1 + 0.20 * this.upgradeDmgLevel);

    // === MELEE (Fists) ===
    if (w.melee) {
      const arc = w.meleeArc || (Math.PI / 3);
      this.meleeSwingTime = 220;
      this.meleeSwingAng = this.facing;
      let hits = 0;
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > w.meleeRange) continue;
        const ang = Math.atan2(dy, dx);
        const diff = Math.abs(((ang - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff < arc) {
          try { e.damage(w.damage * dmgMult, game, false); } catch (er) {}
          e.x += Math.cos(ang) * 14;
          e.y += Math.sin(ang) * 14;
          game.spawnSparks(e.x, e.y, '#ffaa00', 6);
          hits++;
        }
      }
      try { Audio.sfx.punch(); } catch (er) {}
      game.addScreenShake(w.shake || 2);
      // Slight forward dash
      this.x += Math.cos(this.facing) * 6;
      this.y += Math.sin(this.facing) * 6;
      return;
    }

    // === SONIC (Stun gun) ===
    if (w.sonic) {
      // Damages and slows everything in a forward cone
      const range = w.sonicRange || 160;
      const arc = w.sonicArc || (Math.PI / 2);
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > range) continue;
        const ang = Math.atan2(dy, dx);
        const diff = Math.abs(((ang - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff < arc) {
          try { e.damage(w.damage * dmgMult, game, false); } catch (er) {}
          e.stunTime = 1500; // 1.5s stun
        }
      }
      // Visual: a sonic wave
      game.sonicWaves = game.sonicWaves || [];
      game.sonicWaves.push({
        x: this.x, y: this.y, angle: this.facing, life: 350, maxLife: 350, range, arc,
      });
      try { Audio.sfx.laser(); } catch (er) {}
      game.addScreenShake(w.shake || 4);
      return;
    }

    // === BULLETS (Draco, Glock, RPG, Laser, Shotgun) ===
    for (let i = 0; i < w.shotsPerFire; i++) {
      const ang = this.facing + (Math.random() - 0.5) * w.spread;
      const muzzleX = this.x + Math.cos(this.facing) * 14;
      const muzzleY = this.y + Math.sin(this.facing) * 14;
      game.bullets.push(new Bullet(
        muzzleX, muzzleY,
        Math.cos(ang) * w.bulletSpeed,
        Math.sin(ang) * w.bulletSpeed,
        w.damage * dmgMult,
        w.bulletType, 'player',
        { splash: w.splash || 0, pierce: !!w.pierce, explodeOnExpire: !!w.explodeOnExpire }
      ));
    }
    if (w.sound) try { Audio.sfx[w.sound](); } catch (e) {}
    game.addScreenShake(w.shake || 1);
  }

  reload() {
    const w = Weapons.get(this.weaponIdx);
    const wState = this.weapons[this.weaponIdx];
    if (w.magazine === Infinity) return;
    if (wState.reloading || wState.ammo === w.magazine) return;
    wState.reloading = true;
    wState.reloadEnd = performance.now() + w.reloadTime;
  }

  damage(amt, game) {
    if (this.dashTime > 0) return;
    if (this.shieldHp > 0) {
      this.shieldHp -= amt;
      if (this.shieldHp < 0) { this.hp += this.shieldHp; this.shieldHp = 0; }
    } else {
      this.hp -= amt;
    }
    if (game) game.waveDamageTaken = (game.waveDamageTaken || 0) + amt;
    this.hurtFlash = 200;
    try { Audio.sfx.hurt(); } catch (e) {}
    if (game) { game.addScreenShake(5); game.breakCombo(); }
    if (this.hp <= 0) { this.hp = 0; if (game) game.onPlayerDeath(); }
  }

  draw(ctx) {
    const now = performance.now();

    // Dash trail (ghosts)
    for (const t of this.dashTrail) {
      ctx.save();
      ctx.globalAlpha = (t.life / 300) * 0.4;
      Sprites.drawPlayer(ctx, t.x, t.y, this.cust, t.dir, t.frame);
      ctx.restore();
    }

    // Dash cooldown ring
    if (this.dashCooldown > 0) {
      ctx.strokeStyle = `rgba(0,255,102,${0.6 * (1 - this.dashCooldown / 1200)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y + 18, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - this.dashCooldown / 1200));
      ctx.stroke();
    }

    // Gun-lock indicator (paparazzi lockout)
    if (this.gunLockEnd > now) {
      const remain = (this.gunLockEnd - now) / 5000;
      ctx.strokeStyle = `rgba(255,80,80,${0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 26, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
      ctx.stroke();
      ctx.fillStyle = '#ff5555';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKED', this.x, this.y - 36);
    }

    // Shield bubble
    if (this.shieldHp > 0) {
      ctx.strokeStyle = `rgba(0,170,255,${0.5 + Math.sin(now / 100) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Emote text bubble
    if (this.emoteEnd > now) {
      ctx.fillStyle = '#000';
      ctx.fillRect(this.x - 22, this.y - 38, 44, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      const emoteTxt = this.emoteType === 'dance' ? '💃' : (this.emoteType === 'taunt' ? 'GET REKT' : '!!!');
      ctx.fillText(emoteTxt, this.x, this.y - 28);
    }

    // Damage buff aura
    if (this.damageBuffEnd > now) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + Math.sin(now / 80) * 0.05})`;
      ctx.beginPath(); ctx.arc(this.x, this.y, 18, 0, Math.PI * 2); ctx.fill();
    }

    // Hurt flash overlay
    Sprites.drawPlayer(ctx, this.x, this.y, this.cust, this.dir, this.emoteEnd > now ? (Math.floor(now / 80) % 4) : this.frame);

    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${(this.hurtFlash / 200) * 0.5})`;
      ctx.fillRect(this.x - 14, this.y - 22, 28, 36);
    }

    // Muzzle flash
    if (this.muzzleFlashTime > 0 && this.emoteEnd <= now && this.gunLockEnd <= now) {
      const fx = this.x + Math.cos(this.facing) * 14;
      const fy = this.y + Math.sin(this.facing) * 14;
      Sprites.drawMuzzleFlash(ctx, fx, fy, this.facing);
    }

    // Melee swing arc
    if (this.meleeSwingTime > 0) {
      const a = this.meleeSwingTime / 220;
      ctx.strokeStyle = `rgba(255,170,0,${a})`;
      ctx.lineWidth = 4;
      const w = Weapons.get(this.weaponIdx);
      const arc = w.meleeArc || Math.PI / 2.2;
      const r = w.meleeRange || 70;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, this.meleeSwingAng - arc, this.meleeSwingAng + arc);
      ctx.stroke();
    }
  }
}

// ===== TRUCK (ESCALADE) =====
class Truck {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 28;
    this.hp = 200; this.maxHp = 200;
    this.suitOutTime = 0;
    this.suitDude = { angle: 0, fireCooldown: 0, popUntil: 0 };
  }
  update(dt) {
    if (this.suitOutTime > 0) this.suitOutTime -= dt;
    if (this.suitDude.fireCooldown > 0) this.suitDude.fireCooldown -= dt;
  }
  // Called from game.js update when truck is taking heat
  trySuitDude(game) {
    const lowHp = this.hp / this.maxHp < 0.6;
    if (!lowHp) return;
    if (this.suitDude.popUntil > performance.now()) {
      // Currently popped — track nearest enemy
      const target = game.findNearestEnemy(this.x, this.y);
      if (target) this.suitDude.angle = Math.atan2(target.y - this.y - 14, target.x - this.x - 4);
    } else {
      // 2% chance per frame to pop while truck is damaged
      if (Math.random() < 0.02) {
        this.suitDude.popUntil = performance.now() + 6000;
        this.suitOutTime = 6000;
        try { Audio.sfx.combo(); } catch (e) {}
        if (game.spawnFloater) game.spawnFloater(this.x, this.y - 30, 'SUIT UP', '#fff', 12, -0.6);
      }
    }
    if (this.suitOutTime > 0 && this.suitDude.fireCooldown <= 0) {
      const target = game.findNearestEnemy(this.x, this.y);
      if (target) {
        const ang = Math.atan2(target.y - this.y, target.x - this.x);
        game.bullets.push(new Bullet(this.x + 4, this.y - 14,
          Math.cos(ang) * 11, Math.sin(ang) * 11,
          35, 'glock', 'player', {}));
        try { Audio.sfx.shoot(); } catch (e) {}
        this.suitDude.fireCooldown = 350;
      }
    }
  }
  damage(amt) { this.hp = Math.max(0, this.hp - amt); }
  draw(ctx) {
    Sprites.drawTruck(ctx, this.x, this.y, this.hp / this.maxHp);
    if (this.suitOutTime > 0) {
      Sprites.drawSuitDude(ctx, this.x + 4, this.y - 14, this.suitDude.angle);
    }
  }
}

// ===== BULLET =====
class Bullet {
  constructor(x, y, vx, vy, damage, type, source, opts = {}) {
    this.x = x; this.y = y;
    this.prevX = x; this.prevY = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.type = type;
    this.source = source;
    this.dead = false;
    this.life = 1200;
    this.splash = opts.splash || 0;
    this.pierce = !!opts.pierce;
    this.explodeOnExpire = !!opts.explodeOnExpire;
    this.hitSet = new Set();
  }
  update(dt, game) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= dt;
    const offscreen = this.x < -20 || this.x > game.world.w + 20 || this.y < -20 || this.y > game.world.h + 20;
    if (this.life <= 0 || offscreen) {
      // RPG explodes at end of life or when it leaves the screen
      if (this.explodeOnExpire && !offscreen && this.source === 'player') {
        // Inline AOE damage so we don't depend on bullet-hit code
        game.spawnExplosion(this.x, this.y, '#ff8800', 30);
        try { Audio.sfx.explode(); } catch (e) {}
        game.addScreenShake(10);
        for (const e of game.enemies) {
          if (e.dead) continue;
          const dd = Math.hypot(e.x - this.x, e.y - this.y);
          if (dd < this.splash) {
            const falloff = 1 - (dd / this.splash) * 0.5;
            try { e.damage(this.damage * falloff, game, false); } catch (er) {}
          }
        }
      }
      this.dead = true;
      return;
    }
  }
  draw(ctx) { Sprites.drawBullet(ctx, this); }
}

// ===== ENEMY BASE =====
class Enemy {
  constructor(x, y, opts) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = opts.radius || 12;
    this.hp = opts.hp;
    this.maxHp = opts.hp;
    this.speed = opts.speed;
    this.damage = opts.damage;
    this.score = opts.score || 10;
    this.target = null;
    this.hurtFlash = 0;
    this.frame = 0;
    this.attackCooldown = 0;
    this.type = 'enemy';
    this.dead = false;
    this.knockX = 0; this.knockY = 0;
    this.stunTime = 0;
  }
  damage(amt, game, isCrit = false, bullet = null) {
    if (typeof amt !== 'number' || isNaN(amt)) return;
    this.hp -= amt;
    this.hurtFlash = 150;
    if (bullet) {
      const force = Math.min(8, amt * 0.15);
      const a = Math.atan2(bullet.vy, bullet.vx);
      this.knockX += Math.cos(a) * force;
      this.knockY += Math.sin(a) * force;
    }
    if (game && amt > 1) {
      const color = isCrit ? '#ffff00' : '#ffffff';
      const size = isCrit ? 16 : 11;
      game.spawnFloater(this.x + (Math.random() - 0.5) * 10, this.y - 8, Math.round(amt) + (isCrit ? '!' : ''), color, size);
      if (isCrit) { try { Audio.sfx.crit(); } catch (e) {} }
    }
    if (this.hp <= 0) {
      this.dead = true;
      if (game) {
        game.addKill(this);
        // Blood splat — every kill
        game.spawnBloodSplat(this.x, this.y, this.isBoss ? 60 : 20);
        // Drops
        const dropChance = this.isBoss ? 1 : (this.maxHp > 60 ? 0.18 : 0.10);
        if (Math.random() < dropChance) {
          const types = ['health','speed','damage','shield','ammo','lightning','slowmo'];
          const t = types[Math.floor(Math.random() * types.length)];
          game.powerUps.push(new PowerUp(this.x, this.y, t));
        }
        game.spawnExplosion(this.x, this.y, '#cc0022', this.isBoss ? 40 : 10);
        if (this.isBoss) {
          game.slowMo(700, 0.30);
          game.addScreenShake(20);
          try { Audio.sfx.bossDown(); } catch (e) {}
          for (let i = 0; i < 6; i++) {
            game.schedule(() => {
              game.spawnExplosion(this.x + (Math.random() - 0.5) * 80, this.y + (Math.random() - 0.5) * 80, '#ff8800', 22);
              try { Audio.sfx.explode(); } catch (e) {}
              game.addScreenShake(8);
            }, i * 180);
          }
          game.spawnFloater(this.x, this.y - 40, 'BOSS DOWN', '#ffff00', 24, -0.5);
        }
        if (this.onDeath) this.onDeath(game);
      }
    }
  }
  chooseTarget(game) {
    // In arena fights, target the player directly (no truck)
    if (game.arenaActive) { this.target = game.player; return; }
    const dPlayer = Math.hypot(game.player.x - this.x, game.player.y - this.y);
    this.target = dPlayer < 100 ? game.player : game.truck;
  }
  applyKnockback() {
    this.x += this.knockX;
    this.y += this.knockY;
    this.knockX *= 0.7;
    this.knockY *= 0.7;
    if (Math.abs(this.knockX) < 0.1) this.knockX = 0;
    if (Math.abs(this.knockY) < 0.1) this.knockY = 0;
  }
  moveToward(tx, ty, mult = 1) {
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const sp = this.speed * mult * (this.stunTime > 0 ? 0.3 : 1);
    this.vx = (dx / dist) * sp;
    this.vy = (dy / dist) * sp;
    this.x += this.vx;
    this.y += this.vy;
  }
}

// ===== CRAB (standard) =====
class Crab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 55 * mod, speed: 1.0, damage: 8, radius: 12, score: 10 });
    this.frame = Math.floor(Math.random() * 100);
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.chooseTarget(game);
    this.moveToward(this.target.x, this.target.y);
    this.frame++;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + (this.target.radius || 20) && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 700;
    }
  }
  draw(ctx) { Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0); }
}

// ===== FAST CRAB =====
class FastCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 32 * mod, speed: 2.1, damage: 5, radius: 10, score: 15 });
    this.frame = Math.floor(Math.random() * 100);
    this.scale = 0.75;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.chooseTarget(game);
    const wobble = Math.sin(performance.now() / 150 + this.frame) * 0.5;
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const stunMult = this.stunTime > 0 ? 0.3 : 1;
      this.x += ((dx / dist) * this.speed + (-dy / dist) * wobble) * stunMult;
      this.y += ((dy / dist) * this.speed + (dx / dist) * wobble) * stunMult;
    }
    this.frame++;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + (this.target.radius || 20) && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 500;
    }
  }
  draw(ctx) { Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, this.scale, '#ff6644'); }
}

// ===== TANK CRAB =====
class TankCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 160 * mod, speed: 0.7, damage: 14, radius: 18, score: 30 });
    this.frame = Math.floor(Math.random() * 100);
    this.scale = 1.5;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.chooseTarget(game);
    this.moveToward(this.target.x, this.target.y);
    this.frame++;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + (this.target.radius || 20) && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 900;
    }
  }
  draw(ctx) { Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, this.scale, '#660033'); }
}

// ===== EXPLODER CRAB =====
class ExploderCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 38 * mod, speed: 1.5, damage: 15, radius: 11, score: 20 });
    this.frame = Math.floor(Math.random() * 100);
    this.pulseTimer = 0;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.pulseTimer += dt;
    this.applyKnockback();
    this.target = game.player;
    this.moveToward(this.target.x, this.target.y);
    this.frame++;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + this.target.radius) {
      this.hp = 0;
      this.target.damage(this.damage, game);
      this.dead = true;
      if (this.onDeath) this.onDeath(game);
      game.addKill(this);
    }
  }
  onDeath(game) {
    game.spawnExplosion(this.x, this.y, '#ff8800', 25);
    try { Audio.sfx.explode(); } catch (e) {}
    game.addScreenShake(8);
    const radius = 60;
    for (const e of game.enemies) {
      if (e === this) continue;
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < radius) try { e.damage(20, game); } catch (er) {}
    }
    const dp = Math.hypot(game.player.x - this.x, game.player.y - this.y);
    if (dp < radius && dp > game.player.radius + this.radius) {
      game.player.damage(10, game);
    }
    if (game.truck) {
      const dt2 = Math.hypot(game.truck.x - this.x, game.truck.y - this.y);
      if (dt2 < radius + game.truck.radius) game.truck.damage(15);
    }
  }
  draw(ctx) {
    const pulse = 1 + Math.sin(this.pulseTimer / 80) * 0.15;
    Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, pulse, '#ff8800');
  }
}

// ===== ARMED CRAB (wave 8+) — crab with gun on its back =====
class ArmedCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 72 * mod, speed: 0.85, damage: 6, radius: 13, score: 25 });
    this.frame = Math.floor(Math.random() * 100);
    this.shootCooldown = 1500 + Math.random() * 1000;
    this.preferredRange = 220;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.shootCooldown -= dt;
    this.applyKnockback();
    this.chooseTarget(game);
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    // Try to stay at preferred range
    if (d > this.preferredRange + 30) this.moveToward(this.target.x, this.target.y, 0.8);
    else if (d < this.preferredRange - 30) this.moveToward(this.target.x, this.target.y, -0.5);
    this.frame++;
    // Shoot
    if (this.shootCooldown <= 0 && this.stunTime <= 0) {
      const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x) + (Math.random() - 0.5) * 0.15;
      game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 6, Math.sin(ang) * 6, this.damage, 'enemy', 'enemy', {}));
      try { Audio.sfx.shoot(); } catch (e) {}
      this.shootCooldown = 1700 + Math.random() * 800;
    }
  }
  draw(ctx) {
    Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, 1, '#8800aa');
    Sprites.drawCrabGun(ctx, this.x, this.y - 8, this.frame);
  }
}

// ===== PAPARAZZI =====
class Paparazzi extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 12 * mod, speed: 1.5, damage: 0, radius: 11, score: 8 });
    this.frame = Math.floor(Math.random() * 100);
    this.flashTimer = 0;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.target = game.player;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d > 100) this.moveToward(this.target.x, this.target.y, 0.9);
    else this.moveToward(this.target.x, this.target.y, -0.3);
    this.frame++;
    this.flashTimer += dt;
    if (this.flashTimer > 1500) {
      this.flashTimer = 0;
      // Camera flash dazes player
      if (d < 180) {
        game.player.speedMultiplier = 0.4;
        game.player.speedBuffEnd = performance.now() + 400;
        try { Audio.sfx.crit(); } catch (e) {}
      }
    }
  }
  draw(ctx) { Sprites.drawPaparazzi(ctx, this.x, this.y, this.frame, this.hurtFlash > 0); }
}

// ===== FAN (wave 10+) — rebrand of paparazzi with shoot-penalty =====
class Fan extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 14 * mod, speed: 1.7, damage: 0, radius: 11, score: 5 });
    this.frame = Math.floor(Math.random() * 100);
    this.flashTimer = 0;
    this.isFan = true;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.target = game.player;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d > 80) this.moveToward(this.target.x, this.target.y, 1.0);
    else this.moveToward(this.target.x, this.target.y, -0.2);
    this.frame++;
    this.flashTimer += dt;
    if (this.flashTimer > 1300 && d < 200) {
      this.flashTimer = 0;
      game.player.speedMultiplier = 0.3;
      game.player.speedBuffEnd = performance.now() + 500;
      try { Audio.sfx.crit(); } catch (e) {}
    }
  }
  // Overriding damage to apply gun-lock penalty
  damage(amt, game, isCrit, bullet) {
    super.damage(amt, game, isCrit, bullet);
    if (game && game.player) {
      // Lock gun for 5 seconds, but only if player did this
      if (bullet && bullet.source === 'player') {
        game.player.gunLockEnd = performance.now() + 5000;
        game.spawnFloater(game.player.x, game.player.y - 30, "DON'T SHOOT FANS!", '#ff4444', 16, -0.5);
        game.breakCombo();
      }
    }
  }
  draw(ctx) { Sprites.drawFan(ctx, this.x, this.y, this.frame, this.hurtFlash > 0); }
}

// ===== GIANT CRAB BOSS =====
class GiantCrab extends Enemy {
  constructor(x, y, hpMult = 1) {
    super(x, y, { hp: 1800 * hpMult, speed: 0.6, damage: 22, radius: 50, score: 800 });
    this.isBoss = true;
    this.name = 'GIANT CRAB';
    this.frame = 0;
    this.spawnMinionsCooldown = 4500;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.target = game.player;
    this.moveToward(this.target.x, this.target.y, 0.8);
    this.frame++;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + 18 && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 900;
    }
    this.spawnMinionsCooldown -= dt;
    if (this.spawnMinionsCooldown <= 0) {
      this.spawnMinionsCooldown = 5500;
      for (let i = 0; i < 2; i++) {
        const ang = Math.random() * Math.PI * 2;
        game.enemies.push(new Crab(this.x + Math.cos(ang) * 60, this.y + Math.sin(ang) * 60, 0.7));
      }
    }
  }
  draw(ctx) { Sprites.drawGiantCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0); }
}

// ===== 2SLIMEY BOSS =====
class Slimey extends Enemy {
  constructor(x, y, hpMult = 1) {
    super(x, y, { hp: 2800 * hpMult, speed: 0.9, damage: 18, radius: 32, score: 1500 });
    this.isBoss = true;
    this.name = '2SLIMEY';
    this.frame = 0;
    this.shootCooldown = 1200;
    this.dashCooldown = 4500;
    this.scale = 1; // slightly smaller as user requested
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.target = game.player;
    this.shootCooldown -= dt;
    this.dashCooldown -= dt;

    if (this.dashCooldown <= 0) {
      const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      this.x += Math.cos(ang) * 8;
      this.y += Math.sin(ang) * 8;
      this.dashCooldown = 3500;
      try { Audio.sfx.hit(); } catch (e) {}
    } else {
      this.moveToward(this.target.x, this.target.y, 1.0);
    }
    this.frame++;

    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + 18 && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 700;
    }

    if (this.shootCooldown <= 0) {
      // Spit projectiles in a spread
      for (let i = -1; i <= 1; i++) {
        const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x) + i * 0.25;
        game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 5.5, Math.sin(ang) * 5.5, 12, 'enemy', 'enemy', {}));
      }
      try { Audio.sfx.shoot(); } catch (e) {}
      this.shootCooldown = 1400;
    }
  }
  draw(ctx) { Sprites.drawSlimey(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0); }
}

// ===== MIRROR 2X BOSS =====
class Mirror2X extends Enemy {
  constructor(x, y, customization, hpMult = 1) {
    super(x, y, { hp: 4000 * hpMult, speed: 1.4, damage: 25, radius: 28, score: 3000 });
    this.isBoss = true;
    this.name = 'MIRROR 2X';
    this.cust = customization;
    this.frame = 0;
    this.shootCooldown = 800;
    this.dashCooldown = 2500;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.target = game.player;
    this.moveToward(this.target.x, this.target.y, 1.0);
    this.shootCooldown -= dt;
    this.dashCooldown -= dt;
    this.frame++;

    if (this.dashCooldown <= 0) {
      const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      this.x += Math.cos(ang) * 14;
      this.y += Math.sin(ang) * 14;
      this.dashCooldown = 2200;
    }

    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + 16 && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 500;
    }

    if (this.shootCooldown <= 0) {
      const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 8, Math.sin(ang) * 8, 18, 'enemy', 'enemy', {}));
      try { Audio.sfx.shoot(); } catch (e) {}
      this.shootCooldown = 600;
    }
  }
  draw(ctx) { Sprites.drawMirror2X(ctx, this.x, this.y, this.cust, this.frame, this.hp / this.maxHp, this.hurtFlash > 0); }
}

// ===== POWERUP =====
class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.dead = false;
    this.life = 12000;
    this.frame = 0;
    this.radius = 14;
  }
  update(dt, game) {
    this.life -= dt;
    this.frame++;
    if (this.life <= 0) { this.dead = true; return; }
    // Magnet to player when close
    const dx = game.player.x - this.x;
    const dy = game.player.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 70) {
      this.x += (dx / d) * 3;
      this.y += (dy / d) * 3;
    }
    if (d < game.player.radius + this.radius) {
      this.apply(game);
      this.dead = true;
    }
  }
  apply(game) {
    const p = game.player;
    try { Audio.sfx.pickup(); } catch (e) {}
    let label = '';
    switch (this.type) {
      case 'health':
        p.hp = Math.min(p.maxHp, p.hp + 35); label = '+35 HP'; break;
      case 'speed':
        p.speedMultiplier = 1.6; p.speedBuffEnd = performance.now() + 6000; label = 'SPEED!'; break;
      case 'damage':
        p.damageMultiplier = 2; p.damageBuffEnd = performance.now() + 6000; label = 'x2 DMG!'; break;
      case 'shield':
        p.shieldHp = 50; label = 'SHIELD'; break;
      case 'ammo':
        for (let i = 0; i < p.weapons.length; i++) {
          const w = Weapons.get(i);
          if (w.magazine !== Infinity) p.weapons[i].ammo = w.magazine;
        }
        label = 'AMMO!'; break;
      case 'crab-gun':
        p.crabUnlocked = true;
        p.weaponIdx = 4;
        label = 'CRAB LASER!'; break;
      case 'lightning':
        // Smite all enemies in 220px radius
        game.castLightning(p.x, p.y, 220);
        label = 'STRIKE!'; break;
      case 'slowmo':
        game.slowMo(4000, 0.5);
        label = 'SLO-MO'; break;
    }
    game.spawnFloater(this.x, this.y - 16, label, '#ffff66', 14);
  }
  draw(ctx) { Sprites.drawPowerUp(ctx, this.x, this.y, this.type, this.frame); }
}

// ===== PARTICLE =====
class Particle {
  constructor(x, y, vx, vy, color, size, maxLife) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.color = color; this.size = size;
    this.life = maxLife; this.maxLife = maxLife;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.93;
    this.vy *= 0.93;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) { Sprites.drawParticle(ctx, this); }
}

// ===== LIGHTNING STRIKE =====
class Lightning {
  constructor(x, y, telegraphMs = 800) {
    this.x = x; this.y = y;
    this.telegraphMs = telegraphMs;
    this.elapsed = 0;
    this.struck = false;
    this.dead = false;
    this.flashMs = 200;
    this.radius = 50;
    this.damage = 50;
  }
  update(dt, game) {
    this.elapsed += dt;
    if (!this.struck && this.elapsed >= this.telegraphMs) {
      this.struck = true;
      try { Audio.sfx.explode(); } catch (e) {}
      game.addScreenShake(12);
      // Damage anything inside the shadow circle
      const dp = Math.hypot(game.player.x - this.x, game.player.y - this.y);
      if (dp < this.radius) game.player.damage(this.damage, game);
      for (const e of game.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < this.radius) {
          try { e.damage(this.damage * 1.5, game, false); } catch (er) {}
        }
      }
      game.spawnExplosion(this.x, this.y, '#aaccff', 30);
    }
    if (this.struck && this.elapsed - this.telegraphMs > this.flashMs) this.dead = true;
  }
  draw(ctx) {
    if (!this.struck) {
      // Telegraph shadow
      const pct = this.elapsed / this.telegraphMs;
      ctx.fillStyle = `rgba(0,0,0,${0.35 + pct * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Warning ring pulse
      ctx.strokeStyle = `rgba(170,200,255,${0.5 + Math.sin(this.elapsed / 60) * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Lightning bolt
      const flashAlpha = 1 - ((this.elapsed - this.telegraphMs) / this.flashMs);
      ctx.strokeStyle = `rgba(220,230,255,${flashAlpha})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      let lx = this.x + (Math.random() - 0.5) * 20;
      ctx.moveTo(lx, 0);
      let cy = 0;
      while (cy < this.y) {
        cy += 30 + Math.random() * 30;
        lx += (Math.random() - 0.5) * 30;
        ctx.lineTo(lx, cy);
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${flashAlpha * 0.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Bright impact flash
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ===== FOLLOWER (NPC fan who follows player after party) =====
class Follower {
  constructor(x, y, name = 'Fan') {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 10;
    this.name = name;
    this.frame = 0;
    this.dir = 0;
    this.trailDelay = [];  // queue of past player positions
    this.dead = false;
  }
  update(dt, game) {
    this.frame++;
    if (!game.player) return;
    // Track positions of player with delay
    this.trailDelay.push({ x: game.player.x, y: game.player.y });
    if (this.trailDelay.length > 24) this.trailDelay.shift();
    const target = this.trailDelay[0];
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 40) {
        this.x += (dx / d) * 2.5;
        this.y += (dy / d) * 2.5;
        if (Math.abs(dx) > 0.1) this.dir = dx > 0 ? 1 : 0;
      }
    }
  }
  draw(ctx) { Sprites.drawFollower(ctx, this.x, this.y, this.frame, this.dir); }
}

// ===== DANCER NPC (in party scene) =====
class Dancer {
  constructor(x, y, color = '#ff66aa', kind = 'girl') {
    this.x = x; this.y = y;
    this.color = color;
    this.kind = kind;  // 'girl' or 'dude'
    this.frame = Math.floor(Math.random() * 100);
    this.danceOffset = Math.random() * Math.PI * 2;
    this.dead = false;
    this.radius = 12;
    this.recruitable = kind === 'girl';
    this.recruited = false;
  }
  update(dt, game) {
    this.frame++;
    // Subtle position drift
    this.x += Math.sin(this.frame / 30 + this.danceOffset) * 0.4;
    // Recruit on proximity if girl and not already recruited
    if (this.recruitable && !this.recruited && game.player) {
      const d = Math.hypot(game.player.x - this.x, game.player.y - this.y);
      if (d < this.radius + game.player.radius + 4) {
        this.recruited = true;
        game.recruitedDancer = this;
        game.spawnFloater(this.x, this.y - 24, 'TAKING HER HOME', '#ff66ff', 14, -0.6);
        try { Audio.sfx.pickup(); } catch (e) {}
      }
    }
  }
  draw(ctx) {
    const bob = Math.sin(this.frame / 8 + this.danceOffset) * 3;
    Sprites.drawDancer(ctx, this.x, this.y + bob, this.color, this.kind, this.frame);
    if (this.recruitable && !this.recruited) {
      // "Press to take" hint
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TAP TO TAKE', this.x, this.y - 28);
      ctx.textAlign = 'left';
    }
  }
}

// ===== PARTY PICKUPS (CD / Drink / Smoke / Exit Door) =====
class PartyPickup {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;  // 'cd' | 'drink' | 'smoke' | 'exit'
    this.dead = false;
    this.life = type === 'cd' ? Infinity : Infinity;  // party pickups don't expire
    this.frame = 0;
    this.radius = 16;
  }
  update(dt, game) {
    this.frame++;
    const dx = game.player.x - this.x, dy = game.player.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < game.player.radius + this.radius) {
      this.apply(game);
      // CD and Exit consume; drink and smoke too. all one-shot.
      this.dead = true;
    }
  }
  apply(game) {
    try { Audio.sfx.pickup(); } catch (e) {}
    switch (this.type) {
      case 'cd':
        game.enterParty();
        break;
      case 'drink':
        game.drunkUntil = performance.now() + 8000;
        game.spawnFloater(this.x, this.y - 16, 'CHEERS', '#ffaa00', 14);
        break;
      case 'smoke':
        game.smokeUntil = performance.now() + 6000;
        game.slowMo(2500, 0.6);
        game.spawnFloater(this.x, this.y - 16, 'HAZY', '#cc88ff', 14);
        break;
      case 'exit':
        game.exitParty();
        break;
    }
  }
  draw(ctx) { Sprites.drawPartyPickup(ctx, this.x, this.y, this.type, this.frame); }
}
