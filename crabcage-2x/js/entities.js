// entities.js — game objects with update/draw

// ===== PLAYER =====
class Player {
  constructor(x, y, customization) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 12;
    this.hp = 100; this.maxHp = 100;
    this.speed = 3.2;
    this.cust = customization;

    // weapons
    this.weapons = Weapons.defs.map(w => ({ ammo: w.magazine === Infinity ? Infinity : w.magazine, reloading: false, reloadEnd: 0 }));
    this.weaponIdx = 0;
    this.lastFireTime = 0;
    this.facing = 0; // angle
    this.dir = 0; // 0=right, 1=left, 2=down, 3=up
    this.frame = 0;
    this.crabUnlocked = false;

    // buffs
    this.damageMultiplier = 1;
    this.damageBuffEnd = 0;
    this.speedMultiplier = 1;
    this.speedBuffEnd = 0;
    this.shieldHp = 0;

    // dash
    this.dashTime = 0;
    this.dashCooldown = 0;

    // hurt flash
    this.hurtFlash = 0;

    this.muzzleFlashTime = 0;
  }

  update(dt, game) {
    // Buff timers
    const now = performance.now();
    if (now > this.damageBuffEnd) this.damageMultiplier = 1;
    if (now > this.speedBuffEnd) this.speedMultiplier = 1;

    // Cooldowns
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.dashTime > 0) this.dashTime -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.muzzleFlashTime > 0) this.muzzleFlashTime -= dt;

    // Movement
    const move = Input.getMoveVector();
    let speed = this.speed * this.speedMultiplier;
    if (this.dashTime > 0) speed *= 2.5;

    this.vx = move.x * speed;
    this.vy = move.y * speed;
    this.x += this.vx;
    this.y += this.vy;

    // Facing direction
    if (Math.abs(move.x) > 0.1 || Math.abs(move.y) > 0.1) {
      if (Math.abs(move.x) >= Math.abs(move.y)) {
        this.dir = move.x < 0 ? 1 : 0;
      } else {
        this.dir = move.y < 0 ? 3 : 2;
      }
      this.frame = Math.floor(performance.now() / 120) % 4;
    }

    // Dash trigger
    if (Input.consumeDash() && this.dashCooldown <= 0) {
      this.dashTime = 180;
      this.dashCooldown = 1200;
      Audio.sfx.pickup();
    }

    // Aiming
    if (Input.isTouchDevice()) {
      // Auto-aim at nearest enemy
      const nearest = game.findNearestEnemy(this.x, this.y);
      if (nearest) {
        this.facing = Math.atan2(nearest.y - this.y, nearest.x - this.x);
      }
    } else {
      const m = Input.getMouseTarget();
      this.facing = Math.atan2(m.y - this.y, m.x - this.x);
    }

    // Firing
    if (Input.isFiring()) this.tryFire(game);

    // Reload key
    if (Input.isKey(' ') || Input.isKey('r')) this.reload();

    // Weapon switch keys (1-5)
    for (let i = 1; i <= 5; i++) {
      if (Input.isKey(i.toString())) {
        if (i === 5 && !this.crabUnlocked) continue;
        this.weaponIdx = i - 1;
      }
    }

    // Auto-reload when empty
    const wState = this.weapons[this.weaponIdx];
    const w = Weapons.get(this.weaponIdx);
    if (wState.ammo === 0 && !wState.reloading && w.magazine !== Infinity) {
      this.reload();
    }
    if (wState.reloading && performance.now() >= wState.reloadEnd) {
      wState.ammo = w.magazine;
      wState.reloading = false;
      Audio.sfx.reload();
    }

    // Keep on screen
    this.x = Math.max(this.radius, Math.min(game.world.w - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(game.world.h - this.radius, this.y));
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

    if (w.melee) {
      // Hit all enemies in cone
      for (const e of game.enemies) {
        const dx = e.x - this.x, dy = e.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > w.meleeRange) continue;
        const ang = Math.atan2(dy, dx);
        const diff = Math.abs(((ang - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff < Math.PI / 3) {
          e.damage(w.damage * this.damageMultiplier, game);
          // Knockback
          e.x += Math.cos(ang) * 12;
          e.y += Math.sin(ang) * 12;
        }
      }
      Audio.sfx.punch();
      return;
    }

    // Ranged
    for (let i = 0; i < w.shotsPerFire; i++) {
      const ang = this.facing + (Math.random() - 0.5) * w.spread;
      const muzzleX = this.x + Math.cos(this.facing) * 14;
      const muzzleY = this.y + Math.sin(this.facing) * 14;
      game.bullets.push(new Bullet(
        muzzleX, muzzleY,
        Math.cos(ang) * w.bulletSpeed,
        Math.sin(ang) * w.bulletSpeed,
        w.damage * this.damageMultiplier,
        w.bulletType, 'player',
        { splash: w.splash || 0, pierce: !!w.pierce }
      ));
    }
    if (w.sound) Audio.sfx[w.sound]();
  }

  reload() {
    const w = Weapons.get(this.weaponIdx);
    const wState = this.weapons[this.weaponIdx];
    if (w.magazine === Infinity || wState.reloading || wState.ammo === w.magazine) return;
    wState.reloading = true;
    wState.reloadEnd = performance.now() + w.reloadTime;
  }

  damage(amt, game) {
    if (this.dashTime > 0) return; // invincible while dashing
    if (this.shieldHp > 0) {
      this.shieldHp -= amt;
      if (this.shieldHp < 0) { this.hp += this.shieldHp; this.shieldHp = 0; }
    } else {
      this.hp -= amt;
    }
    this.hurtFlash = 200;
    Audio.sfx.hurt();
    if (this.hp <= 0) { this.hp = 0; game.onPlayerDeath(); }
  }

  applyPowerUp(type) {
    Audio.sfx.pickup();
    switch (type) {
      case 'health': this.hp = Math.min(this.maxHp, this.hp + 40); break;
      case 'speed':  this.speedMultiplier = 1.6; this.speedBuffEnd = performance.now() + 8000; break;
      case 'damage': this.damageMultiplier = 2;  this.damageBuffEnd = performance.now() + 8000; break;
      case 'shield': this.shieldHp = 50; break;
      case 'ammo':
        for (let i = 0; i < this.weapons.length; i++) {
          const def = Weapons.get(i);
          if (def.magazine !== Infinity) this.weapons[i].ammo = def.magazine;
        }
        break;
      case 'crab-gun':
        this.crabUnlocked = true;
        this.weapons[4].ammo = 50;
        this.weaponIdx = 4;
        break;
    }
  }

  draw(ctx) {
    Sprites.drawPlayer(ctx, this.x, this.y, this.cust, this.dir, this.frame);
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${0.4 * (this.hurtFlash / 200)})`;
      ctx.fillRect(this.x - 16, this.y - 20, 32, 40);
    }
    if (this.shieldHp > 0) {
      ctx.strokeStyle = `rgba(0,150,255,${0.4 + Math.sin(performance.now() / 100) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, 22, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.muzzleFlashTime > 0) {
      const mx = this.x + Math.cos(this.facing) * 14;
      const my = this.y + Math.sin(this.facing) * 14;
      Sprites.drawMuzzleFlash(ctx, mx, my, this.facing);
    }
  }
}

// ===== TRUCK (the thing you protect) =====
class Truck {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = 500; this.maxHp = 500;
    this.radius = 30;
  }
  damage(amt) {
    this.hp -= amt;
    if (this.hp < 0) this.hp = 0;
    Audio.sfx.hit();
  }
  draw(ctx) {
    Sprites.drawTruck(ctx, this.x, this.y, this.hp / this.maxHp);
  }
}

// ===== BULLET =====
class Bullet {
  constructor(x, y, vx, vy, damage, type, source, opts = {}) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.type = type;
    this.source = source; // 'player' or 'enemy'
    this.dead = false;
    this.life = 1200; // ms
    this.splash = opts.splash || 0;
    this.pierce = !!opts.pierce;
    this.hitSet = new Set();
  }
  update(dt, game) {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.x < -20 || this.x > game.world.w + 20 || this.y < -20 || this.y > game.world.h + 20) {
      this.dead = true;
    }
  }
  draw(ctx) { Sprites.drawBullet(ctx, this.x, this.y, this.type); }
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
    this.target = null; // 'player' or 'truck'
    this.hurtFlash = 0;
    this.frame = 0;
    this.attackCooldown = 0;
    this.type = 'enemy';
    this.dead = false;
  }
  damage(amt, game) {
    this.hp -= amt;
    this.hurtFlash = 150;
    if (this.hp <= 0) {
      this.dead = true;
      game.score += this.score;
      // Maybe drop power-up
      if (Math.random() < 0.08) {
        const types = ['health','speed','damage','shield','ammo'];
        const t = types[Math.floor(Math.random() * types.length)];
        game.powerUps.push(new PowerUp(this.x, this.y, t));
      }
      // Particles
      game.spawnExplosion(this.x, this.y, '#cc0022', 8);
    }
  }
  chooseTarget(game) {
    // Most enemies aim for the truck; some swap to player when close
    const dPlayer = Math.hypot(game.player.x - this.x, game.player.y - this.y);
    const dTruck  = Math.hypot(game.truck.x - this.x, game.truck.y - this.y);
    this.target = dPlayer < 100 ? game.player : game.truck;
  }
  moveToward(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    this.vx = (dx / dist) * this.speed;
    this.vy = (dy / dist) * this.speed;
    this.x += this.vx;
    this.y += this.vy;
  }
}

// ===== CRAB ENEMY =====
class Crab extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 30 * mod, speed: 1.2, damage: 8, radius: 12, score: 10 });
    this.frame = Math.floor(Math.random() * 100);
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.chooseTarget(game);
    this.moveToward(this.target.x, this.target.y);
    this.frame++;

    // Attack
    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + (this.target.radius || 20) && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 700;
    }
  }
  draw(ctx) { Sprites.drawCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp); }
}

// ===== PAPARAZZI ENEMY =====
class Paparazzi extends Enemy {
  constructor(x, y, mod = 1) {
    super(x, y, { hp: 20 * mod, speed: 0.9, damage: 6, radius: 14, score: 15 });
    this.fireTimer = 1000 + Math.random() * 2000;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.chooseTarget(game);

    // Keep medium distance from target
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const idealRange = 150;
    if (dist > idealRange + 20) this.moveToward(this.target.x, this.target.y);
    else if (dist < idealRange - 20) {
      this.x -= (dx / dist) * this.speed * 0.7;
      this.y -= (dy / dist) * this.speed * 0.7;
    }

    this.frame++;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      const ang = Math.atan2(dy, dx);
      game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 5, Math.sin(ang) * 5, this.damage, 'enemy', 'enemy'));
      this.fireTimer = 1500 + Math.random() * 1500;
    }
  }
  draw(ctx) { Sprites.drawPaparazzi(ctx, this.x, this.y, this.frame); }
}

// ===== BOSS: GIANT CRAB (wave 5) =====
class GiantCrab extends Enemy {
  constructor(x, y) {
    super(x, y, { hp: 800, speed: 0.7, damage: 18, radius: 45, score: 500 });
    this.isBoss = true; this.name = 'GIANT CRAB';
    this.specialCd = 3000;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.specialCd > 0) this.specialCd -= dt;
    this.chooseTarget(game);
    this.moveToward(this.target.x, this.target.y);
    this.frame++;

    const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (d < this.radius + (this.target.radius || 20) && this.attackCooldown <= 0) {
      this.target.damage(this.damage, game);
      this.attackCooldown = 800;
    }

    // Spit projectiles in a spread
    if (this.specialCd <= 0) {
      for (let i = -2; i <= 2; i++) {
        const ang = Math.atan2(game.player.y - this.y, game.player.x - this.x) + i * 0.25;
        game.bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 5, Math.sin(ang) * 5, 12, 'enemy', 'enemy'));
      }
      this.specialCd = 3500;
    }
  }
  draw(ctx) { Sprites.drawGiantCrab(ctx, this.x, this.y, this.frame, this.hp / this.maxHp); }
}

// ===== BOSS: 2SLIMEY (wave 10) =====
class Slimey extends Enemy {
  constructor(x, y) {
    super(x, y, { hp: 1200, speed: 1.6, damage: 22, radius: 32, score: 1000 });
    this.isBoss = true; this.name = '2SLIMEY';
    this.shotCd = 800;
    this.dashCd = 4000;
    this.dashTime = 0;
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.shotCd > 0) this.shotCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashTime > 0) this.dashTime -= dt;
    this.frame++;

    this.chooseTarget(game);

    // Strafe around the player at medium range
    const dx = game.player.x - this.x, dy = game.player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const speed = this.dashTime > 0 ? this.speed * 3 : this.speed;

    if (this.dashTime > 0) {
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
    } else if (dist > 180) {
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
    } else {
      // Strafe
      this.x += (-dy / dist) * speed;
      this.y += (dx / dist) * speed;
    }

    // Shoot
    if (this.shotCd <= 0) {
      const ang = Math.atan2(dy, dx);
      for (let i = -1; i <= 1; i++) {
        const a = ang + i * 0.15;
        game.bullets.push(new Bullet(this.x, this.y, Math.cos(a) * 7, Math.sin(a) * 7, 14, 'enemy', 'enemy'));
      }
      this.shotCd = 700 + Math.random() * 400;
    }

    // Dash
    if (this.dashCd <= 0 && dist < 250) {
      this.dashTime = 400;
      this.dashCd = 5000;
      Audio.sfx.boss();
    }

    // Contact damage
    const dt2 = Math.hypot(game.player.x - this.x, game.player.y - this.y);
    if (dt2 < this.radius + game.player.radius && this.attackCooldown <= 0) {
      game.player.damage(this.damage, game);
      this.attackCooldown = 600;
    }
  }
  draw(ctx) { Sprites.drawSlimey(ctx, this.x, this.y, this.frame, this.hp / this.maxHp); }
}

// ===== BOSS: MIRROR 2X (final) =====
class Mirror2X extends Enemy {
  constructor(x, y, cust) {
    super(x, y, { hp: 1800, speed: 2.2, damage: 25, radius: 32, score: 2500 });
    this.isBoss = true; this.name = 'MIRROR 2X';
    this.cust = cust;
    this.fireCd = 200;
    this.weaponSwitch = 0;
    this.currentWeapon = 0; // cycles draco/glock/rpg
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.weaponSwitch > 0) this.weaponSwitch -= dt;
    this.frame++;

    // Behaves like the player: strafes, shoots, switches weapons
    const dx = game.player.x - this.x, dy = game.player.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Switch weapons periodically
    if (this.weaponSwitch <= 0) {
      this.currentWeapon = (this.currentWeapon + 1) % 3; // 0=draco, 1=glock, 2=rpg
      this.weaponSwitch = 3500;
    }

    // Keep distance based on weapon
    const desired = this.currentWeapon === 2 ? 220 : 160;
    const speed = this.speed;
    if (dist > desired + 30) {
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
    } else if (dist < desired - 30) {
      this.x -= (dx / dist) * speed;
      this.y -= (dy / dist) * speed;
    } else {
      this.x += (-dy / dist) * speed * 0.8;
      this.y += (dx / dist) * speed * 0.8;
    }

    // Fire
    if (this.fireCd <= 0) {
      const ang = Math.atan2(dy, dx);
      let speed2 = 8, dmg = 12, spread = 0.05, type = 'enemy';
      if (this.currentWeapon === 0) { speed2 = 9; dmg = 10; spread = 0.18; this.fireCd = 110; }
      else if (this.currentWeapon === 1) { speed2 = 11; dmg = 18; spread = 0.04; this.fireCd = 350; }
      else { speed2 = 6; dmg = 40; spread = 0; this.fireCd = 1500;
        // RPG with splash
        const b = new Bullet(this.x, this.y, Math.cos(ang) * speed2, Math.sin(ang) * speed2, dmg, 'rpg', 'enemy', { splash: 70 });
        game.bullets.push(b);
        return;
      }
      const a = ang + (Math.random() - 0.5) * spread;
      game.bullets.push(new Bullet(this.x, this.y, Math.cos(a) * speed2, Math.sin(a) * speed2, dmg, type, 'enemy'));
    }

    // Contact damage
    if (dist < this.radius + game.player.radius && this.attackCooldown <= 0) {
      game.player.damage(this.damage, game);
      this.attackCooldown = 500;
    }
  }
  draw(ctx) { Sprites.drawMirror2X(ctx, this.x, this.y, this.cust, this.frame, this.hp / this.maxHp); }
}

// ===== POWER-UP =====
class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.radius = 12;
    this.life = 12000; // expires after 12s
    this.frame = 0;
    this.dead = false;
  }
  update(dt, game) {
    this.life -= dt;
    this.frame++;
    if (this.life <= 0) { this.dead = true; return; }
    const d = Math.hypot(this.x - game.player.x, this.y - game.player.y);
    if (d < this.radius + game.player.radius) {
      game.player.applyPowerUp(this.type);
      this.dead = true;
    }
  }
  draw(ctx) { Sprites.drawPowerUp(ctx, this.x, this.y, this.type, this.frame); }
}

// ===== PARTICLE =====
class Particle {
  constructor(x, y, vx, vy, color, size, life) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy *= 0.95;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) { Sprites.drawParticle(ctx, this); }
}
