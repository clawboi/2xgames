// weapons.js — weapon stats. Tuned so EVERY weapon feels useable.
// Includes upgrade level applied via Player.damageMultiplier (no per-weapon override needed).

const Weapons = (() => {
  // 5 base weapons + 2 shop unlockables
  const defs = [
    { // 0: DRACO — fast SMG, accurate
      key: 'draco', name: 'DRACO',
      damage: 14, fireRate: 90, bulletSpeed: 9,
      bulletType: 'draco', spread: 0.10, shotsPerFire: 1,
      magazine: 30, reloadTime: 1200,
      sound: 'shoot', shake: 1,
    },
    { // 1: GLOCK — quick semi-auto, bigger mag, much faster reload, more dmg
      key: 'glock', name: 'GLOCK',
      damage: 28, fireRate: 140, bulletSpeed: 12,
      bulletType: 'glock', spread: 0.04, shotsPerFire: 1,
      magazine: 22, reloadTime: 650,
      sound: 'shoot', shake: 1.4,
    },
    { // 2: FISTS — melee, wider arc, much more dmg, faster swings
      key: 'fists', name: 'FISTS',
      damage: 55, fireRate: 200, bulletSpeed: 0,
      bulletType: 'punch', spread: 0, shotsPerFire: 1,
      magazine: Infinity, reloadTime: 0,
      melee: true, meleeRange: 75, meleeArc: Math.PI / 2.2,
      sound: 'punch', shake: 3,
    },
    { // 3: RPG — explodes on impact OR expiry, huge AOE, big screen shake
      key: 'rpg', name: 'RPG',
      damage: 90, fireRate: 1100, bulletSpeed: 7,
      bulletType: 'rpg', spread: 0, shotsPerFire: 1,
      magazine: 4, reloadTime: 2200,
      splash: 100, explodeOnExpire: true,
      sound: 'shootBig', shake: 8,
    },
    { // 4: CRAB LASER — special, pierces, found in wave 6+
      key: 'laser', name: 'CRAB LASER',
      damage: 65, fireRate: 100, bulletSpeed: 14,
      bulletType: 'laser', spread: 0.02, shotsPerFire: 1,
      magazine: 80, reloadTime: 0,
      pierce: true, special: true,
      sound: 'laser', shake: 2,
    },
    { // 5: SAWED-OFF SHOTGUN — shop unlock. 6-pellet spread, devastating close range
      key: 'shotgun', name: 'SAWED-OFF',
      damage: 18, fireRate: 600, bulletSpeed: 10,
      bulletType: 'shotgun', spread: 0.55, shotsPerFire: 6,
      magazine: 6, reloadTime: 1600,
      sound: 'shootBig', shake: 6, shopUnlock: true,
    },
    { // 6: STUN GUN — shop unlock. Sonic scream wave, AOE, slows survivors
      key: 'stungun', name: 'STUN',
      damage: 30, fireRate: 700, bulletSpeed: 0,
      bulletType: 'sonic', spread: 0, shotsPerFire: 1,
      magazine: 8, reloadTime: 1500,
      sonic: true, sonicRange: 180, sonicArc: Math.PI / 1.5,
      sound: 'laser', shake: 4, shopUnlock: true,
    },
  ];

  function get(idx) { return defs[idx] || defs[0]; }
  function count() { return defs.length; }

  return { defs, get, count };
})();
