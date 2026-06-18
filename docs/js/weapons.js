// weapons.js — tiered weapon roster.
// Tiers: grey (default), green (cheap shop), gold (legendary shop), red (epic shop)

const Weapons = (() => {
  const defs = [
    { // 0: DRACO — grey
      key: 'draco', name: 'DRACO', tier: 'grey',
      damage: 16, fireRate: 90, bulletSpeed: 9,
      bulletType: 'draco', spread: 0.12, shotsPerFire: 1,
      magazine: 30, reloadTime: 1200, range: 650,
      sound: 'shoot', shake: 1,
    },
    { // 1: GLOCK — grey
      key: 'glock', name: 'GLOCK', tier: 'grey',
      damage: 38, fireRate: 140, bulletSpeed: 12,
      bulletType: 'glock', spread: 0.03, shotsPerFire: 1,
      magazine: 22, reloadTime: 650, range: 700,
      sound: 'shoot', shake: 1.4,
    },
    { // 2: FISTS — grey
      key: 'fists', name: 'FISTS', tier: 'grey',
      damage: 75, fireRate: 200, bulletSpeed: 0,
      bulletType: 'punch', spread: 0, shotsPerFire: 1,
      magazine: Infinity, reloadTime: 0,
      melee: true, meleeRange: 75, meleeArc: Math.PI / 2.2,
      sound: 'punch', shake: 3,
    },
    { // 3: RPG — grey
      key: 'rpg', name: 'RPG', tier: 'grey',
      damage: 140, fireRate: 1100, bulletSpeed: 7,
      bulletType: 'rpg', spread: 0, shotsPerFire: 1,
      magazine: 4, reloadTime: 2200, range: 1200,
      splash: 140, explodeOnExpire: true,
      sound: 'shootBig', shake: 12,
    },
    { // 4: CRAB LASER — green (special pickup)
      key: 'laser', name: 'CRAB LASER', tier: 'green',
      damage: 50, fireRate: 130, bulletSpeed: 14,
      bulletType: 'laser', spread: 0.02, shotsPerFire: 1,
      magazine: 80, reloadTime: 0, range: 550,
      pierce: true, special: true,
      sound: 'laser', shake: 2,
    },
    { // 5: SAWED-OFF — green shop
      key: 'shotgun', name: 'SAWED-OFF', tier: 'green',
      damage: 22, fireRate: 600, bulletSpeed: 10,
      bulletType: 'shotgun', spread: 0.55, shotsPerFire: 6,
      magazine: 6, reloadTime: 1600, range: 280,
      sound: 'shootBig', shake: 6, shopUnlock: true,
    },
    { // 6: STUN — green shop
      key: 'stungun', name: 'STUN', tier: 'green',
      damage: 40, fireRate: 700, bulletSpeed: 0,
      bulletType: 'sonic', spread: 0, shotsPerFire: 1,
      magazine: 8, reloadTime: 1500,
      sonic: true, sonicRange: 180, sonicArc: Math.PI / 1.5,
      sound: 'laser', shake: 4, shopUnlock: true,
    },
    { // 7: GOLD DRACO — gold
      key: 'goldDraco', name: 'GOLD DRACO', tier: 'gold',
      damage: 42, fireRate: 55, bulletSpeed: 13,
      bulletType: 'gold', spread: 0.06, shotsPerFire: 1,
      magazine: 60, reloadTime: 900, range: 800,
      pierce: true,
      sound: 'shoot', shake: 1.5, shopUnlock: true, legendary: true,
    },
    { // 8: GOLD RPG — gold (BUFFED)
      key: 'goldRpg', name: 'GOLD RPG', tier: 'gold',
      damage: 320, fireRate: 700, bulletSpeed: 10,
      bulletType: 'gold', spread: 0, shotsPerFire: 1,
      magazine: 8, reloadTime: 1300, range: 1500,
      splash: 260, explodeOnExpire: true,
      sound: 'shootBig', shake: 14, shopUnlock: true, legendary: true,
    },
    { // 9: PLASMA CANNON — gold (BUFFED)
      key: 'plasma', name: 'PLASMA', tier: 'gold',
      damage: 145, fireRate: 280, bulletSpeed: 11,
      bulletType: 'plasma', spread: 0.04, shotsPerFire: 1,
      magazine: 18, reloadTime: 1200, range: 900,
      splash: 95, explodeOnExpire: true, pierce: true,
      sound: 'shootBig', shake: 6, shopUnlock: true, legendary: true,
    },
    { // 10: TESLA COIL — red (BUFFED chain lightning)
      key: 'tesla', name: '★ TESLA', tier: 'red',
      damage: 130, fireRate: 280, bulletSpeed: 22,
      bulletType: 'tesla', spread: 0, shotsPerFire: 1,
      magazine: 14, reloadTime: 1400, range: 900,
      chainLightning: true, chainDmg: 0.95, chainHops: 8,
      sound: 'laser', shake: 5, shopUnlock: true, legendary: true,
    },
    { // 11: FLAMETHROWER — red (BUFFED DOT stream)
      key: 'flamer', name: '★ FLAME', tier: 'red',
      damage: 32, fireRate: 38, bulletSpeed: 11,
      bulletType: 'flame', spread: 0.20, shotsPerFire: 3,
      magazine: 180, reloadTime: 2000, range: 440,
      dot: true, dotDmg: 16, dotDuration: 2600,
      sound: 'shoot', shake: 0.8, shopUnlock: true, legendary: true,
    },
    { // 12: FREEZE GUN — red (OP: fast-fire AOE freeze, shatters frozen crabs into ice)
      key: 'freeze', name: '★ FREEZE', tier: 'red',
      damage: 95, fireRate: 220, bulletSpeed: 18,
      bulletType: 'freeze', spread: 0, shotsPerFire: 1,
      magazine: 30, reloadTime: 1200, range: 800,
      freezeAoe: 260, freezeDuration: 4200, shatterBonus: true,
      sound: 'laser', shake: 3, shopUnlock: true, legendary: true,
    },
    { // 13: HONEY UZI — gold (BUFFED)
      key: 'honeyUzi', name: 'HONEY UZI', tier: 'gold',
      damage: 22, fireRate: 50, bulletSpeed: 15,
      bulletType: 'honey', spread: 0.08, shotsPerFire: 1,
      magazine: 80, reloadTime: 1100, range: 800,
      slow: 0.5, slowDuration: 1800,
      sound: 'shoot', shake: 1.2, shopUnlock: true, legendary: true,
    },
  ];

  function get(idx) { return defs[idx] || defs[0]; }
  function count() { return defs.length; }

  return { defs, get, count };
})();
