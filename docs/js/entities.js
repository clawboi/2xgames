// entities.js — game objects with update/draw
// v4: weapons all work, blood splats, armed crabs, fans, lightning, suit dude,
// player gun-lock state, RPG explodes on expire, sonic wave weapon.

// ===== PLAYER =====
class Player {
  constructor(x, y, customization) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 12;
    this.hp = 70; this.maxHp = 70;
    this.speed = 3.2;
    this.cust = customization;

    this.weapons = Weapons.defs.map(w => ({ ammo: w.magazine === Infinity ? Infinity : w.magazine, reloading: false, reloadEnd: 0 }));
    this.weaponIdx = 0;
    this.lastFireTime = 0;
    this.facing = 0;
    this.dir = 0;
    this.frame = 0;
    this.crabUnlocked = false;
    this.unlockedWeapons = new Set([0, 1, 2, 3]);
    // Which weapons currently show in the hot-bar. Always includes fists + crab if unlocked.
    // User can swap any owned weapon into a slot from the pause inventory.
    this.equippedWeapons = new Set([0, 1, 2, 3]);

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
    const hpBonus = (upgrades?.maxHpUp || 0) * 25;
    const newMax = 100 + hpBonus;
    if (newMax !== this.maxHp) {
      this.maxHp = newMax;
      this.hp = Math.min(this.maxHp, this.hp + hpBonus);
    }
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

    // Auto-dance in party state
    if (game.state === 'party' && this.emoteEnd <= now) {
      this.emoteEnd = now + 1200;
      this.emoteType = 'dance';
    }

    // Movement
    const move = Input.getMoveVector();
    let speed = this.speed * this.speedMultiplier;
    if (this.dashTime > 0) speed *= 2.4;
    // Emote blocks movement EXCEPT during party (so player can still walk around)
    if (this.emoteEnd > now && game.state !== 'party') speed *= 0;
    if (game.drunkUntil && game.drunkUntil > now) {
      // Drunk wobble
      const wobble = Math.sin(now / 180) * 0.3;
      move.x = move.x * (1 - Math.abs(wobble)) + wobble;
      move.y = move.y * (1 - Math.abs(wobble)) + Math.cos(now / 180) * 0.2;
      speed *= 0.75;
    }

    this.vx = move.x * speed;
    this.vy = move.y * speed;
    // Normalize to 60fps baseline — prevents 2x speed on 120Hz iPhone displays
    const dtScale = Math.min(2.5, dt / 16.67);
    this.x += this.vx * dtScale;
    this.y += this.vy * dtScale;

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
      this.dashTime = 110;   // was 180 — shorter invuln window
      this.dashCooldown = 2200;  // was 1200 — much longer cooldown
      try { Audio.sfx.pickup(); } catch (e) {}
      game.spawnSparks(this.x, this.y, '#00ff66', 8);
      // Dash → 350ms of DEEP slo-mo
      game.slowMo(350, 0.18);
    }

    // Aiming — touch device OR hold SPACE on desktop = auto-aim
    if (Input.isTouchDevice() || Input.isKey(' ')) {
      // Hysteresis: stick with last target unless it dies, leaves range, or new candidate is 25% closer
      let lock = this._aimLock;
      if (lock && (lock.dead || lock.hp <= 0)) lock = null;
      const lockDist = lock ? Math.hypot(lock.x - this.x, lock.y - this.y) : Infinity;
      if (!lock || lockDist > 260) {
        lock = game.findNearestEnemy(this.x, this.y);
      } else {
        const candidate = game.findNearestEnemy(this.x, this.y);
        if (candidate && candidate !== lock) {
          const candDist = Math.hypot(candidate.x - this.x, candidate.y - this.y);
          if (candDist < lockDist * 0.75) lock = candidate;
        }
      }
      this._aimLock = lock;
      if (lock) {
        const targetAng = Math.atan2(lock.y - this.y, lock.x - this.x);
        let diff = targetAng - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * 0.22; // slightly faster lock-on
      }
    } else {
      this._aimLock = null;
      const m = Input.getMouseTarget();
      this.facing = Math.atan2(m.y - this.y, m.x - this.x);
    }

    // Firing — blocked during emote, gun lock, party, cd-wait
    if (Input.isFiring()
        && this.gunLockEnd <= now
        && this.emoteEnd <= now
        && game.state !== 'party'
        && game.state !== 'cd-wait') {
      this.tryFire(game);
    }
    if (Input.isKey('r')) this.reload();

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
        {
          splash: w.splash || 0,
          pierce: !!w.pierce,
          explodeOnExpire: !!w.explodeOnExpire,
          life: w.range || 650,
          chainLightning: !!w.chainLightning,
          chainHops: w.chainHops || 0,
          chainDmg: w.chainDmg || 0.7,
          dot: !!w.dot,
          dotDmg: w.dotDmg || 0,
          dotDuration: w.dotDuration || 0,
        }
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
    if (game) {
      // Damage scales feedback: small hits = small shake, big hits = bigger
      const shake = Math.min(14, 4 + amt * 0.25);
      game.addScreenShake(shake);
      game.breakCombo();
      // Brief red screen flash (rendered top-of-frame)
      game.hitFlash = Math.min(0.45, (game.hitFlash || 0) + amt * 0.012);
    }
    if (this.hp <= 0) { this.hp = 0; if (game) game.onPlayerDeath(); }
  }

  draw(ctx) {
    const now = performance.now();

    // Subtle white outline ring under feet so you can spot yourself in chaos
    ctx.strokeStyle = `rgba(255,255,255,${0.22 + Math.sin(now / 400) * 0.10})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y + 16, this.radius + 6, 0, Math.PI * 2);
    ctx.stroke();

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
      const remain = (this.gunLockEnd - now) / 3000;
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

    // Auto-aim target reticle — small bracket on the locked enemy (only when auto-aiming)
    if (this._aimLock && !this._aimLock.dead && (typeof window !== 'undefined' && (this._aimLock._isLocked = true))) {
      const t = this._aimLock;
      const r = (t.radius || 12) + 6;
      const pulse = 0.65 + Math.sin(now / 120) * 0.35;
      ctx.save();
      ctx.strokeStyle = `rgba(255,80,80,${pulse})`;
      ctx.lineWidth = 2;
      // Four small corner brackets
      const sz = 4;
      ctx.beginPath();
      // top-left
      ctx.moveTo(t.x - r, t.y - r + sz); ctx.lineTo(t.x - r, t.y - r); ctx.lineTo(t.x - r + sz, t.y - r);
      // top-right
      ctx.moveTo(t.x + r - sz, t.y - r); ctx.lineTo(t.x + r, t.y - r); ctx.lineTo(t.x + r, t.y - r + sz);
      // bottom-left
      ctx.moveTo(t.x - r, t.y + r - sz); ctx.lineTo(t.x - r, t.y + r); ctx.lineTo(t.x - r + sz, t.y + r);
      // bottom-right
      ctx.moveTo(t.x + r - sz, t.y + r); ctx.lineTo(t.x + r, t.y + r); ctx.lineTo(t.x + r, t.y + r - sz);
      ctx.stroke();
      ctx.restore();
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
    this.hp = 130; this.maxHp = 130;
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
    const now = performance.now();
    if (!lowHp) return;
    // Currently out — fire only
    if (this.suitOutTime > 0) {
      const target = game.findNearestEnemy(this.x, this.y);
      if (target) this.suitDude.angle = Math.atan2(target.y - this.y - 14, target.x - this.x - 4);
      if (this.suitDude.fireCooldown <= 0 && target) {
        const ang = Math.atan2(target.y - this.y, target.x - this.x);
        game.bullets.push(new Bullet(this.x + 4, this.y - 14,
          Math.cos(ang) * 11, Math.sin(ang) * 11,
          32, 'glock', 'player', {}));
        try { Audio.sfx.shoot(); } catch (e) {}
        this.suitDude.fireCooldown = 350;
      }
      return;
    }
    // On cooldown — wait
    if (this.suitDude.popUntil && now < this.suitDude.popUntil) return;
    // Roll to pop — much rarer
    if (Math.random() < 0.005) {
      this.suitOutTime = 5000;
      this.suitDude.popUntil = now + 5000 + 30000; // 30s cooldown AFTER he ducks back in
      try { Audio.sfx.combo(); } catch (e) {}
      if (game.spawnFloater) game.spawnFloater(this.x, this.y - 30, 'SUIT UP', '#fff', 12, -0.6);
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
    this.life = opts.life || (source === 'player' ? 650 : 2200);
    this.splash = opts.splash || 0;
    this.pierce = !!opts.pierce;
    this.explodeOnExpire = !!opts.explodeOnExpire;
    this.hitSet = new Set();
    this.chainLightning = !!opts.chainLightning;
    this.chainHops = opts.chainHops || 0;
    this.chainDmg = opts.chainDmg || 0.7;
    this.dot = !!opts.dot;
    this.dotDmg = opts.dotDmg || 0;
    this.dotDuration = opts.dotDuration || 0;
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
    this.contactDamage = opts.damage;
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
      const baseForce = Math.min(8, amt * 0.15);
      const force = this.isBoss ? baseForce * 0.15 : baseForce;
      const a = Math.atan2(bullet.vy, bullet.vx);
      this.knockX += Math.cos(a) * force;
      this.knockY += Math.sin(a) * force;
    }
    // Trigger death (continues below in subclasses)
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
        // Blood splat
        game.spawnBloodSplat(this.x, this.y, this.isBoss ? 60 : 20);
        // GIBS — body chunks fly out
        const shellCol = this.isBoss ? '#aa0011' : (this._tintShell || '#cc0022');
        const gibCount = this.isBoss ? 14 : (this.maxHp > 60 ? 8 : 5);
        if (!game.gibs) game.gibs = [];
        for (let i = 0; i < gibCount; i++) {
          const sz = 2 + Math.random() * 3;
          const col = Math.random() < 0.5 ? shellCol : '#660000';
          if (game.gibs.length < 60) game.gibs.push(new Gib(this.x, this.y, col, sz));
        }
        // Hitstop on big kills
        if (this.isBoss || this.maxHp > 100) {
          game.hitstop && game.hitstop(this.isBoss ? 250 : 80);
        }
        // Drops
        const dropChance = this.isBoss ? 1 : (this.maxHp > 60 ? 0.18 : 0.10);
        if (Math.random() < dropChance) {
          const types = ['health','speed','damage','shield','ammo','lightning','slowmo','magnet','nuke','berserk'];
          const t = types[Math.floor(Math.random() * types.length)];
          game.powerUps.push(new PowerUp(this.x, this.y, t));
        }
        game.spawnExplosion(this.x, this.y, '#cc0022', this.isBoss ? 40 : 10);
        if (this.isBoss) {
          game.slowMo(1400, 0.18);   // deeper + longer
          game.addScreenShake(28);   // was 20
          try { Audio.sfx.bossDown(); } catch (e) {}
          for (let i = 0; i < 10; i++) {  // was 6 explosions
            game.schedule(() => {
              const off = 30 + i * 14;
              game.spawnExplosion(this.x + (Math.random() - 0.5) * off * 2, this.y + (Math.random() - 0.5) * off * 2, i % 2 === 0 ? '#ff8800' : '#ffcc00', 22 + i * 2);
              try { Audio.sfx.explode(); } catch (e) {}
              game.addScreenShake(10);
            }, i * 130);
          }
          // Massive central explosion at end
          game.schedule(() => {
            game.spawnExplosion(this.x, this.y, '#fff', 80);
            game.addScreenShake(15);
            try { Audio.sfx.nuke(); } catch (e) {}
          }, 1300);
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
    super(x, y, { hp: 75 * mod, speed: 1.1, damage: 12, radius: 12, score: 10 });
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
      this.target.damage(this.contactDamage, game);
      this.attackCooldown = 700;
    }
  }
  draw(ctx) { Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0); }
}

// ===== FAST CRAB =====
class FastCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 38 * mod, speed: 2.3, damage: 8, radius: 10, score: 15 });
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
      this.target.damage(this.contactDamage, game);
      this.attackCooldown = 500;
    }
  }
  draw(ctx) { Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, this.scale, '#ff6644'); }
}

// ===== TANK CRAB =====
class TankCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 180 * mod, speed: 0.75, damage: 20, radius: 18, score: 30 });
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
      this.target.damage(this.contactDamage, game);
      this.attackCooldown = 900;
    }
  }
  draw(ctx) { Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, this.scale, '#660033'); }
}

// ===== EXPLODER CRAB =====
class ExploderCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 30 * mod, speed: 1.5, damage: 15, radius: 11, score: 20 });
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
      this.target.damage(this.contactDamage, game);
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
    super(x, y, { hp: 55 * mod, speed: 0.85, damage: 6, radius: 13, score: 25 });
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
      game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 6, Math.sin(ang) * 6, this.contactDamage, 'enemy', 'enemy', {}));
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

// ===== FAN (wave 10+) — picture-takers + flashers =====
class Fan extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 14 * mod, speed: 1.4, damage: 0, radius: 12, score: 5 });
    this.frame = Math.floor(Math.random() * 100);
    this.isFan = true;
    // Half POSERS (stop and click), half FLASHERS (white-screen burst)
    this.variant = Math.random() < 0.5 ? 'flasher' : 'poser';
    this.poseCooldown = 1800 + Math.random() * 800;
    this.posing = false;
    this.poseTime = 0;
    this.flashCooldown = 1500 + Math.random() * 1000;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.target = game.player;
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    this.frame++;
    if (this.variant === 'poser') {
      this.poseCooldown -= dt;
      if (this.posing) {
        this.poseTime -= dt;
        if (this.poseTime <= 0) { this.posing = false; this.poseCooldown = 2500 + Math.random() * 1000; }
        // Frozen during pose — taking the picture
      } else {
        if (d > 110) this.moveToward(this.target.x, this.target.y, 0.9);
        else if (d < 70) this.moveToward(this.target.x, this.target.y, -0.4);
        if (this.poseCooldown <= 0 && d < 180) {
          this.posing = true;
          this.poseTime = 1200;
          try { Audio.sfx.crit(); } catch (e) {}
        }
      }
    } else {
      // FLASHER — closer + brighter burst that whitens the screen
      this.flashCooldown -= dt;
      if (d > 90) this.moveToward(this.target.x, this.target.y, 1.1);
      else this.moveToward(this.target.x, this.target.y, -0.3);
      if (this.flashCooldown <= 0 && d < 220) {
        this.flashCooldown = 2200 + Math.random() * 1200;
        game.flashUntil = performance.now() + 220;
        game.player.speedMultiplier = 0.4;
        game.player.speedBuffEnd = performance.now() + 600;
        try { Audio.sfx.crit(); } catch (e) {}
      }
    }
  }
  damage(amt, game, isCrit, bullet) {
    super.damage(amt, game, isCrit, bullet);
    if (game && game.player && bullet && bullet.source === 'player') {
      game.player.gunLockEnd = performance.now() + 3000;
      game.spawnFloater(game.player.x, game.player.y - 30, "DON'T SHOOT FANS!", '#ff4444', 16, -0.5);
      game.breakCombo();
    }
  }
  draw(ctx) { Sprites.drawFan(ctx, this.x, this.y, this.frame, this.hurtFlash > 0, this.variant, this.posing); }
}

// ===== GIANT CRAB BOSS =====
class GiantCrab extends Enemy {
  constructor(x, y, hpMult = 1) {
    super(x, y, { hp: 3600 * hpMult, speed: 0.85, damage: 38, radius: 50, score: 800 });
    this.isBoss = true;
    this.name = 'GIANT CRAB';
    this.frame = 0;
    this.spawnMinionsCooldown = 3500;
    this.tidalSlamCooldown = 4000;
    this.tidalSlamTelegraph = 0;
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
      this.target.damage(this.contactDamage, game);
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
    // TIDAL SLAM — radial pulse that damages anything in 180px
    this.tidalSlamCooldown -= dt;
    if (this.tidalSlamTelegraph > 0) {
      this.tidalSlamTelegraph -= dt;
      if (this.tidalSlamTelegraph <= 0) {
        const pulseRadius = 220;
        game.addScreenShake(18);
        game.spawnExplosion(this.x, this.y, '#0099ff', 60);
        try { Audio.sfx.explode(); } catch (e) {}
        const dp = Math.hypot(game.player.x - this.x, game.player.y - this.y);
        if (dp < pulseRadius) {
          game.player.damage(40, game);
          const ang = Math.atan2(game.player.y - this.y, game.player.x - this.x);
          game.player.x += Math.cos(ang) * 40;
          game.player.y += Math.sin(ang) * 40;
        }
        this.tidalSlamCooldown = 4500;
      }
    } else if (this.tidalSlamCooldown <= 0) {
      this.tidalSlamTelegraph = 700;
      game.spawnFloater(this.x, this.y - 70, 'TIDAL SLAM', '#0099ff', 18, -0.3);
      try { Audio.sfx.boss(); } catch (e) {}
    }
  }
  draw(ctx) {
    Sprites.drawGiantCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0);
    // Tidal slam telegraph — expanding ring at boss
    if (this.tidalSlamTelegraph > 0) {
      const pct = 1 - (this.tidalSlamTelegraph / 900);
      ctx.strokeStyle = `rgba(0,153,255,${0.4 + Math.sin(this.frame * 0.5) * 0.3})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 30 + 150 * pct, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ===== 2SLIMEY BOSS =====
class Slimey extends Enemy {
  constructor(x, y, hpMult = 1) {
    super(x, y, { hp: 5500 * hpMult, speed: 1.1, damage: 32, radius: 32, score: 1500 });
    this.isBoss = true;
    this.name = '2SLIMEY';
    this.frame = 0;
    this.shootCooldown = 1000;
    this.dashCooldown = 3500;
    this.scale = 1;
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
      this.target.damage(this.contactDamage, game);
      this.attackCooldown = 700;
    }

    // CHARGE — if player is far, dash toward them in a streak
    this.chargeCooldown = (this.chargeCooldown || 5000) - dt;
    if (this.chargeCooldown <= 0 && d > 220) {
      const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      const charge = Math.min(d - 60, 280);
      this.x += Math.cos(ang) * charge;
      this.y += Math.sin(ang) * charge;
      game.spawnFloater(this.x, this.y - 40, 'CHARGE', '#ff00aa', 14, -0.3);
      game.addScreenShake(8);
      try { Audio.sfx.boss(); } catch (e) {}
      this.chargeCooldown = 5500;
    }

    if (this.shootCooldown <= 0) {
      for (let i = -1; i <= 1; i++) {
        const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x) + i * 0.25;
        game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 7, Math.sin(ang) * 7, 14, 'enemy', 'enemy', { life: 2400 }));
      }
      try { Audio.sfx.shoot(); } catch (e) {}
      this.shootCooldown = 1100;
    }
    // MIC TOSS — every 3.5s throws 3 mics that arc + heavier damage
    this.micTossCooldown = (this.micTossCooldown || 3800) - dt;
    if (this.micTossCooldown <= 0) {
      this.micTossCooldown = 3800;
      game.spawnFloater(this.x, this.y - 50, 'MIC DROP', '#ff00aa', 16, -0.3);
      for (let i = -1; i <= 1; i++) {
        const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x) + i * 0.30;
        const b = new Bullet(this.x, this.y, Math.cos(ang) * 8, Math.sin(ang) * 8, 30, 'enemy', 'enemy', { splash: 70, explodeOnExpire: true, life: 2400 });
        game.bullets.push(b);
      }
      try { Audio.sfx.shootBig(); } catch (e) {}
    }
  }
  draw(ctx) { Sprites.drawSlimey(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0); }
}

// ===== MIRROR 2X BOSS =====
class Mirror2X extends Enemy {
  constructor(x, y, customization, hpMult = 1) {
    super(x, y, { hp: 8000 * hpMult, speed: 1.8, damage: 42, radius: 28, score: 3000 });
    this.isBoss = true;
    this.name = 'MIRROR 2X';
    this.cust = customization;
    this.frame = 0;
    this.shootCooldown = 600;
    this.dashCooldown = 2000;
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
      this.target.damage(this.contactDamage, game);
      this.attackCooldown = 500;
    }

    if (this.shootCooldown <= 0) {
      const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 8, Math.sin(ang) * 8, 18, 'enemy', 'enemy', {}));
      try { Audio.sfx.shoot(); } catch (e) {}
      this.shootCooldown = 600;
    }
    // CLONE SUMMON — at <70% HP, summons 1-2 mirror clones every 5s
    if (this.hp / this.maxHp < 0.7) {
      this.cloneCooldown = (this.cloneCooldown || 5000) - dt;
      if (this.cloneCooldown <= 0) {
        this.cloneCooldown = 5000;
        game.spawnFloater(this.x, this.y - 60, 'CLONES', '#ff00ff', 18, -0.3);
        for (let i = 0; i < 2; i++) {
          const ang = Math.random() * Math.PI * 2;
          const minion = new FastCrab(this.x + Math.cos(ang) * 70, this.y + Math.sin(ang) * 70, 1.4);
          game.enemies.push(minion);
        }
        try { Audio.sfx.boss(); } catch (e) {}
      }
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
        game.castLightning(p.x, p.y, 220);
        label = 'STRIKE!'; break;
      case 'slowmo':
        game.slowMo(7000, 0.12);
        label = 'SLO-MO'; break;
      case 'magnet':
        // Pull ALL cash to player instantly
        for (const c of game.cash) {
          c.vx = (p.x - c.x) * 0.3;
          c.vy = (p.y - c.y) * 0.3;
        }
        label = 'MAGNET'; try { Audio.sfx.magnet(); } catch (e) {}
        break;
      case 'nuke':
        // Damage everything on screen + screen shake
        for (const e of game.enemies) {
          if (e.dead || e.isBoss) continue;
          try { e.damage(9999, game, false); } catch (er) {}
        }
        // Damage bosses heavily but don't one-shot
        for (const e of game.enemies) {
          if (e.dead || !e.isBoss) continue;
          try { e.damage(300, game, true); } catch (er) {}
        }
        game.addScreenShake(20);
        game.spawnExplosion(p.x, p.y, '#ff8800', 60);
        try { Audio.sfx.nuke(); } catch (e) {}
        label = 'NUKED'; break;
      case 'berserk':
        // Instant max combo + damage buff + speed buff for 6s
        game.combo = 25;
        game.comboTimer = game.comboWindow;
        game.multiplier = 5;
        p.damageMultiplier = 2.5;
        p.damageBuffEnd = performance.now() + 6000;
        p.speedMultiplier = 1.5;
        p.speedBuffEnd = performance.now() + 6000;
        try { Audio.sfx.berserk(); } catch (e) {}
        label = 'BERSERK!'; break;
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
  constructor(x, y, name = 'Fan', index = 0, color = '#ff66aa') {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 11;
    this.name = name;
    this.frame = Math.floor(Math.random() * 40);
    this.dir = 0;
    this.trailDelay = [];
    this.dead = false;
    this.index = index;             // 0,1,2 for 3 followers
    this.color = color;
    this.danceStyle = index;        // each follower has a different dance
    this.danceOffset = Math.random() * Math.PI * 2;
  }
  update(dt, game) {
    this.frame++;
    if (!game.player) return;
    this.inParty = (game.state === 'party');
    if (game.state === 'party') {
      const ang = (this.index / 3) * Math.PI * 2 + game.player.x * 0.001;
      const r = 50;
      const tx = game.player.x + Math.cos(ang) * r;
      const ty = game.player.y + Math.sin(ang) * r * 0.7;
      this.x += (tx - this.x) * 0.08;
      this.y += (ty - this.y) * 0.08;
      return;
    }
    this.trailDelay.push({ x: game.player.x, y: game.player.y });
    if (this.trailDelay.length > 24 + this.index * 6) this.trailDelay.shift();
    const target = this.trailDelay[0];
    if (target) {
      const offsetX = [-22, 22, 0][this.index] || 0;
      const offsetY = [0, 0, 22][this.index] || 0;
      const dx = (target.x + offsetX) - this.x;
      const dy = (target.y + offsetY) - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 30) {
        this.x += (dx / d) * 2.5;
        this.y += (dy / d) * 2.5;
        if (Math.abs(dx) > 0.1) this.dir = dx > 0 ? 1 : 0;
      }
    }
  }
  draw(ctx) {
    const bob = Math.sin(this.frame / (6 + this.danceStyle * 2) + this.danceOffset) * 2;
    Sprites.drawFollower(ctx, this.x, this.y + bob, this.frame + this.danceStyle * 10, this.dir, this.color, this.danceStyle, this.inParty);
  }
}

// ===== DANCER NPC (in party scene) =====
class Dancer {
  constructor(x, y, color = '#ff66aa', kind = 'girl', skinTone = null) {
    this.x = x; this.y = y;
    this.color = color;
    this.kind = kind;
    this.frame = Math.floor(Math.random() * 100);
    this.danceOffset = Math.random() * Math.PI * 2;
    this.dead = false;
    this.radius = 12;
    this.recruitable = kind === 'girl';
    this.recruited = false;
    // Random skin tone if not specified
    const tones = ['light','medium','tan','brown','dark','verydark'];
    this.skinTone = skinTone || tones[Math.floor(Math.random() * tones.length)];
  }
  update(dt, game) {
    this.frame++;
    // Subtle position drift
    this.x += Math.sin(this.frame / 30 + this.danceOffset) * 0.4;
    if (this.recruitable && !this.recruited && game.player) {
      const d = Math.hypot(game.player.x - this.x, game.player.y - this.y);
      if (d < this.radius + game.player.radius + 4) {
        const alreadyRecruited = (game.recruitedList || []).length;
        if (alreadyRecruited >= 3) return;
        this.recruited = true;
        game.recruitedList = game.recruitedList || [];
        game.recruitedList.push(this);
        game.recruitedDancer = this;
        // Spawn the Follower NOW so she actually dances at the party next to you
        const colors = ['#ff66aa','#ffaa00','#aa66ff'];
        game.followers = game.followers || [];
        const follower = new Follower(
          game.player.x + (alreadyRecruited === 0 ? -30 : alreadyRecruited === 1 ? 30 : 0),
          game.player.y + (alreadyRecruited === 2 ? 24 : 0),
          'Fan' + (alreadyRecruited + 1),
          alreadyRecruited,
          colors[alreadyRecruited] || '#ff66aa'
        );
        follower.inParty = true;
        game.followers.push(follower);
        const slot = ['1st','2nd','3rd'][alreadyRecruited] || '4th';
        game.spawnFloater(this.x, this.y - 24, `${slot} GIRL TAKEN`, '#ff66ff', 14, -0.6);
        try { Audio.sfx.pickup(); } catch (e) {}
        // Hide the recruited dancer (she moves to be a follower now)
        this.dead = true;
      }
    }
  }
  draw(ctx) {
    const bob = Math.sin(this.frame / 8 + this.danceOffset) * 3;
    Sprites.drawDancer(ctx, this.x, this.y + bob, this.color, this.kind, this.frame, this.skinTone);
    if (this.recruitable && !this.recruited) {
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

// ===== GIB (chunk of crab that flies out on death) =====
class Gib {
  constructor(x, y, color, size = 3) {
    this.x = x; this.y = y;
    const ang = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 5;
    this.vx = Math.cos(ang) * sp;
    this.vy = Math.sin(ang) * sp - 2; // slight up-toss
    this.vz = 1 + Math.random() * 2; // simulated vertical (using y squash)
    this.gz = 0; // ground z
    this.size = size;
    this.color = color;
    this.life = 3500;
    this.maxLife = 3500;
    this.rot = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.4;
    this.dead = false;
    this.bounced = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    // Z physics for bounce
    this.vz -= 0.35; // gravity in z
    this.gz += this.vz;
    if (this.gz <= 0 && this.vz < 0) {
      // bounce
      this.gz = 0;
      this.vz = -this.vz * 0.45;
      if (Math.abs(this.vz) < 0.4) { this.vz = 0; this.vx *= 0.3; this.vy *= 0.3; }
      this.bounced = true;
    }
    if (this.gz === 0) {
      this.vx *= 0.85;
      this.vy *= 0.85;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.rot += this.rotSpeed;
  }
  draw(ctx) {
    const alpha = Math.min(1, this.life / this.maxLife * 1.5);
    ctx.save();
    ctx.translate(this.x, this.y - this.gz);
    ctx.rotate(this.rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
    // darker outline
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-this.size, -this.size, this.size * 2, 1);
    ctx.restore();
    // shadow on ground
    if (this.gz > 0) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.size * 1.5, this.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ===== SUMMONER CRAB (wave 12+) — spawns minions =====
class SummonerCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 110 * mod, speed: 0.5, damage: 12, radius: 16, score: 50 });
    this.frame = Math.floor(Math.random() * 100);
    this.summonCooldown = 4000 + Math.random() * 2000;
    this.preferredRange = 260;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.summonCooldown -= dt;
    this.applyKnockback();
    this.chooseTarget(game);
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    // Hover at preferred range
    if (d > this.preferredRange + 30) this.moveToward(this.target.x, this.target.y, 0.7);
    else if (d < this.preferredRange - 30) this.moveToward(this.target.x, this.target.y, -0.4);
    this.frame++;
    // Summon mini-crabs occasionally
    if (this.summonCooldown <= 0 && this.stunTime <= 0) {
      this.summonCooldown = 4500 + Math.random() * 2000;
      const summoned = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < summoned; i++) {
        const ang = Math.random() * Math.PI * 2;
        const mini = new FastCrab(this.x + Math.cos(ang) * 40, this.y + Math.sin(ang) * 40, 0.6);
        mini.scale = 0.6; // smaller summoned
        game.enemies.push(mini);
      }
      try { Audio.sfx.boss(); } catch (e) {}
      game.spawnFloater(this.x, this.y - 16, 'SUMMONED', '#aa00ff', 12, -0.8);
    }
  }
  draw(ctx) {
    // Tinted purple shell + a hood
    Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, 1.1, '#aa00ff');
    // Glowing third eye on top
    const pulse = Math.sin(this.frame * 0.15);
    ctx.fillStyle = `rgba(255,200,50,${0.6 + pulse * 0.3})`;
    ctx.beginPath(); ctx.arc(this.x, this.y - 14, 3, 0, Math.PI * 2); ctx.fill();
  }
}

// ===== LEAPER CRAB (wave 9+) — lunges from distance =====
class LeaperCrab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 45 * mod, speed: 0.9, damage: 18, radius: 11, score: 22 });
    this.frame = Math.floor(Math.random() * 100);
    this.leapCooldown = 2200 + Math.random() * 1000;
    this.leaping = false;
    this.leapTime = 0;
    this.leapTargetX = 0;
    this.leapTargetY = 0;
    this.leapStartX = 0;
    this.leapStartY = 0;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    this.applyKnockback();
    this.chooseTarget(game);
    this.frame++;
    if (this.leaping) {
      this.leapTime += dt;
      const t = Math.min(1, this.leapTime / 500);
      // Parabolic arc
      this.x = this.leapStartX + (this.leapTargetX - this.leapStartX) * t;
      this.y = this.leapStartY + (this.leapTargetY - this.leapStartY) * t;
      this.leapZ = Math.sin(t * Math.PI) * 60;
      if (t >= 1) {
        this.leaping = false;
        this.leapZ = 0;
        // Damage on landing
        const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        if (d < this.target.radius + 24) {
          this.target.damage(this.contactDamage, game);
          game.addScreenShake(4);
        }
      }
    } else {
      this.leapCooldown -= dt;
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (this.leapCooldown <= 0 && d > 100 && d < 350 && this.stunTime <= 0) {
        // Initiate leap
        this.leaping = true;
        this.leapTime = 0;
        this.leapStartX = this.x;
        this.leapStartY = this.y;
        this.leapTargetX = this.target.x;
        this.leapTargetY = this.target.y;
        this.leapCooldown = 2500 + Math.random() * 1500;
        try { Audio.sfx.hit(); } catch (e) {}
      } else if (!this.leaping) {
        this.moveToward(this.target.x, this.target.y, 0.85);
      }
    }
  }
  draw(ctx) {
    const drawY = this.y - (this.leapZ || 0);
    Sprites.drawCrab(ctx, this.x, drawY, this.frame, this.hp / this.maxHp, this.hurtFlash > 0, 1, '#00aa88');
    // shadow when in air
    if (this.leapZ > 0) {
      ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - this.leapZ / 60)})`;
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ===== SCHIZO COMPANION (shop-bought, 3 rounds, actually shoots) =====
class SchizoCompanion {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 12;
    this.frame = 0;
    this.dir = 0;
    this.fireCooldown = 0;
    this.dead = false;
    this.trailDelay = [];
  }
  update(dt, game) {
    this.frame++;
    if (!game.player) return;
    // Trail with offset
    this.trailDelay.push({ x: game.player.x, y: game.player.y });
    if (this.trailDelay.length > 18) this.trailDelay.shift();
    const target = this.trailDelay[0];
    if (target) {
      const dx = (target.x - 30) - this.x, dy = target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 28) {
        this.x += (dx / d) * 2.8;
        this.y += (dy / d) * 2.8;
        if (Math.abs(dx) > 0.1) this.dir = dx > 0 ? 1 : 0;
      }
    }
    // Auto-shoot nearest enemy
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.fireCooldown <= 0) {
      const nearest = game.findNearestEnemy(this.x, this.y);
      if (nearest) {
        const ang = Math.atan2(nearest.y - this.y, nearest.x - this.x);
        const dist = Math.hypot(nearest.x - this.x, nearest.y - this.y);
        if (dist < 350) {
          game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 10, Math.sin(ang) * 10, 22, 'glock', 'player', {}));
          try { Audio.sfx.shoot(); } catch (e) {}
          this.fireCooldown = 280;
        }
      }
    }
  }
  draw(ctx) { Sprites.drawSchizo(ctx, this.x, this.y, this.frame, this.dir); }
}
