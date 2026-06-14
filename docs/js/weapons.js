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
      damage: 75, fireRate: 100, bulletSpeed: 14,
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
      damage: 28, fireRate: 70, bulletSpeed: 11,
      bulletType: 'gold', spread: 0.08, shotsPerFire: 1,
      magazine: 45, reloadTime: 1000, range: 750,
      pierce: true,
      sound: 'shoot', shake: 1.5, shopUnlock: true, legendary: true,
    },
    { // 8: GOLD RPG — gold
      key: 'goldRpg', name: 'GOLD RPG', tier: 'gold',
      damage: 200, fireRate: 850, bulletSpeed: 8,
      bulletType: 'gold', spread: 0, shotsPerFire: 1,
      magazine: 6, reloadTime: 1500, range: 1400,
      splash: 200, explodeOnExpire: true,
      sound: 'shootBig', shake: 14, shopUnlock: true, legendary: true,
    },
    { // 9: PLASMA CANNON — gold (NEW)
      key: 'plasma', name: 'PLASMA', tier: 'gold',
      damage: 95, fireRate: 380, bulletSpeed: 9,
      bulletType: 'plasma', spread: 0.06, shotsPerFire: 1,
      magazine: 12, reloadTime: 1400, range: 800,
      splash: 70, explodeOnExpire: true, pierce: true,
      sound: 'shootBig', shake: 6, shopUnlock: true, legendary: true,
    },
    { // 10: TESLA COIL — red (NEW, chain lightning)
      key: 'tesla', name: '★ TESLA', tier: 'red',
      damage: 60, fireRate: 480, bulletSpeed: 16,
      bulletType: 'tesla', spread: 0, shotsPerFire: 1,
      magazine: 8, reloadTime: 1800, range: 700,
      chainLightning: true, chainDmg: 0.7, chainHops: 4,
      sound: 'laser', shake: 4, shopUnlock: true, legendary: true,
    },
    { // 11: FLAMETHROWER — red (NEW, DOT stream)
      key: 'flamer', name: '★ FLAME', tier: 'red',
      damage: 12, fireRate: 50, bulletSpeed: 8,
      bulletType: 'flame', spread: 0.25, shotsPerFire: 2,
      magazine: 100, reloadTime: 2500, range: 320,
      dot: true, dotDmg: 4, dotDuration: 1500,
      sound: 'shoot', shake: 0.5, shopUnlock: true, legendary: true,
    },
  ];

  function get(idx) { return defs[idx] || defs[0]; }
  function count() { return defs.length; }

  return { defs, get, count };
})();
