// weapons.js — weapon stats. Tuned so EVERY weapon feels useable.
// Includes upgrade level applied via Player.damageMultiplier (no per-weapon override needed).

const Weapons = (() => {
  // 5 base weapons + 2 shop unlockables
  const defs = [
    { // 0: DRACO — fast SMG, medium range, sprays
      key: 'draco', name: 'DRACO',
      damage: 16, fireRate: 90, bulletSpeed: 9,
      bulletType: 'draco', spread: 0.12, shotsPerFire: 1,
      magazine: 30, reloadTime: 1200, range: 650,
      sound: 'shoot', shake: 1,
    },
    { // 1: GLOCK — punchy semi-auto, accurate medium range
      key: 'glock', name: 'GLOCK',
      damage: 38, fireRate: 140, bulletSpeed: 12,
      bulletType: 'glock', spread: 0.03, shotsPerFire: 1,
      magazine: 22, reloadTime: 650, range: 700,
      sound: 'shoot', shake: 1.4,
    },
    { // 2: FISTS — melee, devastating up close
      key: 'fists', name: 'FISTS',
      damage: 75, fireRate: 200, bulletSpeed: 0,
      bulletType: 'punch', spread: 0, shotsPerFire: 1,
      magazine: Infinity, reloadTime: 0,
      melee: true, meleeRange: 75, meleeArc: Math.PI / 2.2,
      sound: 'punch', shake: 3,
    },
    { // 3: RPG — HUGE explosion, long range, slow firing
      key: 'rpg', name: 'RPG',
      damage: 140, fireRate: 1100, bulletSpeed: 7,
      bulletType: 'rpg', spread: 0, shotsPerFire: 1,
      magazine: 4, reloadTime: 2200, range: 1200,
      splash: 140, explodeOnExpire: true,
      sound: 'shootBig', shake: 12,
    },
    { // 4: CRAB LASER — short pierce beam, found wave 6+
      key: 'laser', name: 'CRAB LASER',
      damage: 75, fireRate: 100, bulletSpeed: 14,
      bulletType: 'laser', spread: 0.02, shotsPerFire: 1,
      magazine: 80, reloadTime: 0, range: 550,
      pierce: true, special: true,
      sound: 'laser', shake: 2,
    },
    { // 5: SAWED-OFF — short range buckshot, devastating close
      key: 'shotgun', name: 'SAWED-OFF',
      damage: 22, fireRate: 600, bulletSpeed: 10,
      bulletType: 'shotgun', spread: 0.55, shotsPerFire: 6,
      magazine: 6, reloadTime: 1600, range: 280,
      sound: 'shootBig', shake: 6, shopUnlock: true,
    },
    { // 6: STUN GUN — sonic AOE
      key: 'stungun', name: 'STUN',
      damage: 40, fireRate: 700, bulletSpeed: 0,
      bulletType: 'sonic', spread: 0, shotsPerFire: 1,
      magazine: 8, reloadTime: 1500,
      sonic: true, sonicRange: 180, sonicArc: Math.PI / 1.5,
      sound: 'laser', shake: 4, shopUnlock: true,
    },
    { // 7: GOLDEN DRACO — legendary
      key: 'goldDraco', name: 'GOLD DRACO',
      damage: 28, fireRate: 70, bulletSpeed: 11,
      bulletType: 'gold', spread: 0.08, shotsPerFire: 1,
      magazine: 45, reloadTime: 1000, range: 750,
      pierce: true,
      sound: 'shoot', shake: 1.5, shopUnlock: true, legendary: true,
    },
    { // 8: GOLDEN RPG — legendary
      key: 'goldRpg', name: 'GOLD RPG',
      damage: 200, fireRate: 850, bulletSpeed: 8,
      bulletType: 'gold', spread: 0, shotsPerFire: 1,
      magazine: 6, reloadTime: 1500, range: 1400,
      splash: 200, explodeOnExpire: true,
      sound: 'shootBig', shake: 14, shopUnlock: true, legendary: true,
    },
  ];

  function get(idx) { return defs[idx] || defs[0]; }
  function count() { return defs.length; }

  return { defs, get, count };
})();
